// Flags raw Tailwind BRAND-color utility classes (e.g. `bg-blue-600`,
// `text-green-500`, `from-rose-400`). DESIGN.md mandates the 14 semantic
// tokens (primary/secondary/accent, success/warning/danger/info, surface/
// border/ring) — never raw brand colors. Neutrals (gray/slate/zinc + the
// keyword colors white/black) remain allowed for utility chrome.
//
// Detection scans string literals and template-literal static parts for
// whitespace-separated class tokens matching:
//   [variant:]…[!]<prefix>-<brandColor>-<shade>[/opacity]
// so `hover:bg-blue-500`, `md:!text-red-600`, `bg-rose-500/40` all match.
//
// Pre-existing violations are baselined OFF per-file in eslint.config.js
// (see the "raw-tailwind-color-burndown" memory). Most of the residue is
// CATEGORICAL color (per-module identity, device-type tiles) that needs a
// sanctioned categorical palette before it can migrate — do not mechanically
// collapse it to status tokens. New code must use semantic tokens.

const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'from', 'to', 'via',
  'fill', 'stroke', 'divide', 'outline', 'decoration', 'accent', 'caret',
  'placeholder', 'shadow',
];

// Brand color families only. Excludes neutrals (gray/slate/zinc) and the
// keyword colors (white/black/transparent/current/inherit) which are allowed.
const BRAND_COLORS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const CLASS_RE = new RegExp(
  `^(?:${PREFIXES.join('|')})-(?:${BRAND_COLORS.join('|')})-\\d{2,3}$`,
);

// Strip a Tailwind class token down to its core utility:
//   "md:hover:!bg-blue-500/40" -> "bg-blue-500"
function coreOf(token) {
  // drop variant prefixes (everything up to and including the last ':')
  const lastColon = token.lastIndexOf(':');
  let core = lastColon === -1 ? token : token.slice(lastColon + 1);
  // drop leading important marker
  if (core.startsWith('!')) core = core.slice(1);
  // drop opacity suffix
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
        'Disallow raw Tailwind brand-color utilities; use the 14 semantic design tokens (DESIGN.md).',
    },
    schema: [],
    messages: {
      raw: 'Raw Tailwind brand color "{{cls}}". Use a semantic token (primary/secondary/accent, success/warning/danger/info) per DESIGN.md. Neutrals (gray/slate/zinc) are allowed.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        const cls = firstOffender(node.value);
        if (cls) context.report({ node, messageId: 'raw', data: { cls } });
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const cls = firstOffender(quasi.value.cooked);
          if (cls) {
            context.report({ node: quasi, messageId: 'raw', data: { cls } });
            break;
          }
        }
      },
    };
  },
};
