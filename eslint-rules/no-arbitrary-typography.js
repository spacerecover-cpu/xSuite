// Bans arbitrary typography literals per DESIGN.md → Typography:
//
//  - Font sizes `text-[12px]` / `text-[0.8rem]` …: the type scale is the
//    named Tailwind ladder + `text-xxs`. The 2026-07-02 audit
//    (docs/typography-audit-2026-07-02.md, §3.3/F-24) found 5 ad-hoc pixel
//    sizes (93 usages) fracturing the app into 15 rendered sizes, including
//    `text-[10px]` duplicating the sanctioned `text-xxs` token.
//  - Letter-spacing `tracking-[…]`: uppercase labels use `tracking-wider`.
//    Sole exception: `tracking-[0.5em]` on OTP/code inputs (allowed here).
//
// Fully enforced with NO baseline since 2026-07-02 (the P4-P5 burndown took
// arbitrary sizes 93 -> 0; the app chrome now uses the `text-nav` token).
// Color/var arbitraries like `text-[#hex]` are NOT this rule's concern
// (no-raw-* rules govern color).

const SIZE_RE = /^text-\[\d+(?:\.\d+)?(?:px|rem|em|pt)\]$/;
const TRACK_ALLOWED = 'tracking-[0.5em]';

// "md:hover:!text-[11px]" -> "text-[11px]"  (no '/' stripping: a slash
// cannot appear in the numeric size/tracking literals this rule targets,
// and stripping would mangle bracketed values.)
function coreOf(token) {
  const bracket = token.indexOf('[');
  const searchEnd = bracket === -1 ? token.length : bracket;
  const lastColon = token.lastIndexOf(':', searchEnd);
  let core = lastColon === -1 ? token : token.slice(lastColon + 1);
  if (core.startsWith('!')) core = core.slice(1);
  return core;
}

function firstOffender(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  for (const token of str.split(/\s+/)) {
    if (!token) continue;
    const core = coreOf(token);
    if (SIZE_RE.test(core)) return core;
    if (core.startsWith('tracking-[') && core !== TRACK_ALLOWED) return core;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arbitrary font-size/letter-spacing literals; use the named type scale (DESIGN.md → Typography).',
    },
    schema: [],
    messages: {
      arbitrary:
        'Arbitrary typography literal "{{cls}}". Use the named scale (text-xxs/xs/sm/…, tracking-wider) per DESIGN.md → Typography; tracking-[0.5em] is the sole (OTP) exception.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        const cls = firstOffender(node.value);
        if (cls) context.report({ node, messageId: 'arbitrary', data: { cls } });
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const cls = firstOffender(quasi.value.cooked);
          if (cls) {
            context.report({ node: quasi, messageId: 'arbitrary', data: { cls } });
            break;
          }
        }
      },
    };
  },
};
