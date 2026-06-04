import { describe, it, expect, beforeAll } from 'vitest';
import { installDomTranslationGuard } from './domTranslationGuard';

// Runs in the jsdom project (.test.tsx) so real Node DOM APIs are available.
describe('installDomTranslationGuard', () => {
  beforeAll(() => {
    installDomTranslationGuard();
  });

  it('does not throw when removeChild targets a node a translator re-parented', () => {
    // React owns a text node under its parent...
    const reactParent = document.createElement('div');
    const textNode = document.createTextNode('Cases');
    reactParent.appendChild(textNode);

    // ...then Google Translate wraps it in its own <font>, re-parenting it.
    const translateWrapper = document.createElement('font');
    translateWrapper.appendChild(textNode);
    expect(textNode.parentNode).toBe(translateWrapper);

    // React still believes the node lives under reactParent and removes it.
    // Native DOM throws NotFoundError here; the guard must swallow it.
    expect(() => reactParent.removeChild(textNode)).not.toThrow();
    // The node is returned untouched, still under the translator's wrapper.
    expect(textNode.parentNode).toBe(translateWrapper);
  });

  it('still removes a node that is a genuine child', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    expect(parent.removeChild(child)).toBe(child);
    expect(child.parentNode).toBeNull();
    expect(parent.childNodes).toHaveLength(0);
  });

  it('does not throw and keeps the node when insertBefore reference was re-parented', () => {
    const reactParent = document.createElement('div');
    const newNode = document.createElement('span');

    // Reference node lives under a different parent (moved by the translator).
    const ref = document.createElement('i');
    const elsewhere = document.createElement('div');
    elsewhere.appendChild(ref);

    expect(() => reactParent.insertBefore(newNode, ref)).not.toThrow();
    // The new node still lands in the tree rather than being dropped.
    expect(newNode.parentNode).toBe(reactParent);
  });

  it('still inserts before a genuine reference child in order', () => {
    const parent = document.createElement('div');
    const ref = document.createElement('b');
    parent.appendChild(ref);
    const newNode = document.createElement('span');

    parent.insertBefore(newNode, ref);
    expect(parent.firstChild).toBe(newNode);
    expect(newNode.nextSibling).toBe(ref);
  });
});
