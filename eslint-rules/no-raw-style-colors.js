// Flags raw HEX color literals in JSX inline `style={{ ... }}` object values and
// in color-like JSX props (`color=`, `backgroundColor=`, `borderColor=`, `fill=`,
// `stroke=`). DESIGN.md mandates the semantic tokens (`rgb(var(--color-x))`) or the
// fixed `cat-*` identity palette — never raw hex in `src/`.
//
// WHY THIS EXISTS: the class-based companion rule `no-raw-tailwind-colors` only
// inspects Tailwind class strings, so it never sees inline styles. That blind spot
// let banned brand colors through — e.g. a hardcoded violet `#7c3aed` button
// background — and broke per-tenant theming (an inline hex can't follow the theme).
//
// SCOPE: HEX only (the real-world vector — every offending control used a hex).
// Functional notation (`rgb()/rgba()/hsl()`) is intentionally NOT flagged: it is
// almost always either a token (`rgb(var(--color-x))`) or a neutral scrim/shadow
// (`rgba(0,0,0,.5)`), so flagging it would be noise. Pure white/black hex and a
// small sanctioned brand allowlist (WhatsApp green) are allowed.
//
// Currently wired at `warn` (see eslint.config.js) — same convention as
// `no-untranslated-jsx-text`: it surfaces new violations in review without failing
// CI on the remaining decorative gradients. Ratchet to `error` once those migrate.

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
// CSS property names (camelCase) whose value carries a color.
const COLOR_PROP_RE = /(color|background|fill|stroke|shadow|border|outline|gradient)/i;
// Direct JSX props that take a color string (Badge/CollapsibleSection/etc.).
const COLOR_ATTRS = new Set(['color', 'backgroundColor', 'borderColor', 'fill', 'stroke']);
// Allowed: neutrals (white/black) and sanctioned brand exceptions.
const ALLOWED_HEX = new Set(['#fff', '#ffffff', '#000', '#000000', '#25d366']);

function offendingHex(str) {
  if (typeof str !== 'string') return null;
  if (/var\(\s*--/.test(str)) return null; // token reference, e.g. rgb(var(--color-x))
  const m = str.match(HEX_RE);
  if (!m) return null;
  if (ALLOWED_HEX.has(m[0].toLowerCase())) return null;
  return m[0];
}

function reportValue(node, context) {
  if (!node) return;
  if (node.type === 'Literal') {
    const bad = offendingHex(node.value);
    if (bad) context.report({ node, messageId: 'raw', data: { color: bad } });
  } else if (node.type === 'TemplateLiteral') {
    for (const quasi of node.quasis) {
      const bad = offendingHex(quasi.value.cooked);
      if (bad) {
        context.report({ node: quasi, messageId: 'raw', data: { color: bad } });
        break;
      }
    }
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw hex colors in JSX inline styles / color props; use semantic tokens rgb(var(--color-x)), the cat-* palette, or a Button/Badge variant (DESIGN.md).',
    },
    schema: [],
    messages: {
      raw: 'Raw hex color "{{color}}" in an inline style/prop. Inline-style colors bypass per-tenant theming and the lint guard. Use a semantic token (rgb(var(--color-x))), the cat-* identity palette, or a Button/Badge variant. See DESIGN.md.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (!name) return;

        // style={{ backgroundColor: '#hex', ... }}
        if (
          name === 'style' &&
          node.value &&
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression &&
          node.value.expression.type === 'ObjectExpression'
        ) {
          for (const prop of node.value.expression.properties) {
            if (prop.type !== 'Property') continue;
            const key =
              prop.key.type === 'Identifier'
                ? prop.key.name
                : prop.key.type === 'Literal'
                  ? String(prop.key.value)
                  : '';
            if (!COLOR_PROP_RE.test(key)) continue;
            reportValue(prop.value, context);
          }
          return;
        }

        // color="#hex" | backgroundColor={'#hex'} | fill / stroke / borderColor
        if (COLOR_ATTRS.has(name) && node.value) {
          if (node.value.type === 'Literal') {
            const bad = offendingHex(node.value.value);
            if (bad) context.report({ node: node.value, messageId: 'raw', data: { color: bad } });
          } else if (node.value.type === 'JSXExpressionContainer') {
            reportValue(node.value.expression, context);
          }
        }
      },
    };
  },
};
