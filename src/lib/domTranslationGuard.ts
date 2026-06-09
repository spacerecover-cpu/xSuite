// Browser page-translation tools (notably Google Translate, and some browser
// extensions) replace React-managed text nodes with their own <font>-wrapped
// nodes. React's commit phase then calls removeChild()/insertBefore() against a
// node the translator has already moved, throwing
//   NotFoundError: Failed to execute 'removeChild' on 'Node':
//   The node to be removed is not a child of this node.
// which trips the top-level ErrorBoundary and crashes the whole view.
//
// Guarding these two DOM operations makes React tolerant of the external DOM
// mutation instead of crashing. The app still ships a `notranslate` hint in
// index.html to discourage translation in the first place; this guard is the
// safety net for translators/extensions that ignore that hint.
//
// See facebook/react#11538 for the upstream discussion.

import { logger } from './logger';

let installed = false;
let reported = false;

// One-shot telemetry: fires when the guard actually deviates from native DOM
// behavior, i.e. a translator/extension has re-parented React-managed nodes.
// This is the signal that the silent DOM-guard path is active in production — a
// candidate cause of "navigation does nothing until a reload" freezes. Reported
// once per session to avoid flooding; behavior is otherwise unchanged.
function reportGuardEngaged(op: string): void {
  if (reported) return;
  reported = true;
  logger.warn(`DOM translation guard engaged (${op}) — external DOM mutation detected`);
}

export function installDomTranslationGuard(): void {
  if (installed) return;
  if (typeof Node === 'undefined' || !Node.prototype) return;
  installed = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    // The node was re-parented out from under React (e.g. into a translator's
    // <font> wrapper). Removing it here would throw; hand it back untouched.
    if (child.parentNode !== this) {
      reportGuardEngaged('removeChild');
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    // The reference node has been moved elsewhere by the translator. Appending
    // keeps the new node in the tree (React reconciles position on the next
    // pass) instead of throwing and losing it.
    if (child && child.parentNode !== this) {
      reportGuardEngaged('insertBefore');
      return originalInsertBefore.call(this, node, null) as T;
    }
    return originalInsertBefore.call(this, node, child) as T;
  };
}
