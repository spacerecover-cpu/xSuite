// Flags native blocking dialogs — `window.confirm(...)` and `window.alert(...)`
// (and their bare `confirm(...)` / `alert(...)` global forms) — used for
// destructive-action UX. The browser primitives are unthemed, untranslatable,
// and break the per-tenant look-and-feel; they also block the JS thread. Use
// the async, loading-aware `useConfirm()` hook (src/hooks/useConfirm.tsx) for
// confirmations and the themed `useToast()` hook for notices instead.
//
// Wired at `warn` (see eslint.config.js): there is a pre-existing residue of
// window.confirm calls in list/wizard pages that surface in review without
// failing CI, while new occurrences are flagged. Ratchet to `error` once the
// residue migrates.

const BANNED_METHODS = new Set(['confirm', 'alert']);

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow window.confirm / window.alert for destructive UX; use useConfirm() / useToast() instead.',
    },
    schema: [],
    messages: {
      banned:
        'Avoid {{call}} for destructive UX — it is unthemed, untranslatable, and blocks the thread. Use useConfirm() (hooks/useConfirm) for confirmations and useToast() for notices instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;

        // window.confirm(...) / window.alert(...)
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'window' &&
          callee.property.type === 'Identifier' &&
          BANNED_METHODS.has(callee.property.name)
        ) {
          context.report({
            node,
            messageId: 'banned',
            data: { call: `window.${callee.property.name}()` },
          });
          return;
        }

        // bare confirm(...) / alert(...) resolving to the global
        if (
          callee.type === 'Identifier' &&
          BANNED_METHODS.has(callee.name)
        ) {
          const scope = context.sourceCode
            ? context.sourceCode.getScope(node)
            : context.getScope();
          const variable = scope.references.find(
            (ref) => ref.identifier === callee,
          )?.resolved;
          // Only flag if it resolves to the global (no local binding/import).
          if (!variable || variable.defs.length === 0) {
            context.report({
              node,
              messageId: 'banned',
              data: { call: `${callee.name}()` },
            });
          }
        }
      },
    };
  },
};
