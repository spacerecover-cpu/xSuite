// Flags constructed Tailwind color classes in `className` template literals,
// e.g. `bg-${color}-100`. Tailwind's JIT compiler only sees classes that exist
// as literal substrings in source; a class assembled at runtime is stripped
// from the build, so the element renders with no background/text/border/ring.
// Use a static tone map keyed off the dynamic value instead.

const DYNAMIC_PREFIXES = ['bg-', 'text-', 'border-', 'ring-', 'from-', 'to-'];

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow dynamically-constructed Tailwind color classes that the JIT compiler strips' },
    schema: [],
    messages: {
      dynamic: 'Dynamic Tailwind class "{{prefix}}${...}" is stripped by the JIT compiler. Use a static class string (e.g. a tone map keyed off the value).',
    },
  },
  create(context) {
    function isClassName(node) {
      // JSX attribute: className={`...`}
      const parent = node.parent;
      if (parent?.type === 'JSXExpressionContainer' && parent.parent?.type === 'JSXAttribute') {
        return parent.parent.name?.name === 'className';
      }
      return false;
    }

    function check(node) {
      // A TemplateLiteral interleaves quasis (static text) and expressions.
      // For each interpolation at index i, the static text immediately before
      // it is quasis[i].value.cooked. If that text ends in a color-utility
      // prefix, the class is being constructed dynamically.
      node.expressions.forEach((_expr, i) => {
        const before = node.quasis[i]?.value?.cooked;
        if (typeof before !== 'string') return;
        const prefix = DYNAMIC_PREFIXES.find((p) => before.endsWith(p));
        if (prefix) {
          context.report({ node, messageId: 'dynamic', data: { prefix } });
        }
      });
    }

    return {
      TemplateLiteral(node) {
        if (!node.expressions.length) return;
        if (!isClassName(node)) return;
        check(node);
      },
    };
  },
};
