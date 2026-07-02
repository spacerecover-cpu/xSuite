// Bans the `gray-*` neutral family in src/. DESIGN.md (Typography → Neutral
// text) fixes the app neutral on `slate-*`: the 2026-07-02 typography audit
// (docs/typography-audit-2026-07-02.md, F-9) found a 30-file gray/slate fork
// rendering near-identical-but-different neutrals on adjacent screens. The
// fork was swept to zero the same day; this rule keeps it at zero — no
// baseline. Brand colors are governed separately by no-raw-tailwind-colors.

const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'from', 'to', 'via',
  'fill', 'stroke', 'divide', 'outline', 'decoration', 'accent', 'caret',
  'placeholder', 'shadow',
];

const CLASS_RE = new RegExp(`^(?:${PREFIXES.join('|')})-gray-\\d{2,3}$`);

// "md:hover:!bg-gray-500/40" -> "bg-gray-500"
function coreOf(token) {
  const lastColon = token.lastIndexOf(':');
  let core = lastColon === -1 ? token : token.slice(lastColon + 1);
  if (core.startsWith('!')) core = core.slice(1);
  const slash = core.indexOf('/');
  if (slash !== -1) core = core.slice(0, slash);
  return core;
}

function firstOffender(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  for (const token of str.split(/\s+/)) {
    if (!token) continue;
    if (CLASS_RE.test(coreOf(token))) return coreOf(token);
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow gray-* utilities; the house neutral is slate-* (DESIGN.md → Typography → Neutral text).',
    },
    schema: [],
    messages: {
      gray: '"{{cls}}" uses the banned gray palette. Use the slate equivalent (DESIGN.md → Typography → Neutral text).',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        const cls = firstOffender(node.value);
        if (cls) context.report({ node, messageId: 'gray', data: { cls } });
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const cls = firstOffender(quasi.value.cooked);
          if (cls) {
            context.report({ node: quasi, messageId: 'gray', data: { cls } });
            break;
          }
        }
      },
    };
  },
};
