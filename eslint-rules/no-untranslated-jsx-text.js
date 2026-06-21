// Custom (no-dependency) eslint rule: flags hardcoded user-facing JSX text that
// should route through i18n `t()`. Severity is wired as `warn` in
// eslint.config.js so the existing ~1,684 hardcoded strings don't break the
// lint gate (which runs `eslint .` with no --max-warnings) while NEW ones
// surface in review. Mirrors the module shape of banned-tables.js /
// no-banned-embeds-in-select.js.
//
// CONSERVATIVE by design (spec §0): a JSXText node is reported only when its
// trimmed value — after stripping HTML entity references — still contains at
// least one run of >=2 ASCII letters. This intentionally ignores pure
// whitespace/newlines, numbers, punctuation, single characters,
// currency/symbols, and entities, to avoid false positives.

// Matches HTML character/entity references: &amp; &nbsp; &#39; &#x2014; etc.
// Stripped before the letter-run test so entity names don't count as text.
const ENTITY_REF = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

// A run of two or more ASCII letters — the signal that this is real prose, not
// a number, symbol, or single-char glyph.
const LETTER_RUN = /[A-Za-z]{2,}/;

// User-facing string attributes whose literal values are visible copy and must
// route through t(). `name`, `id`, `type`, `href`, etc. are intentionally excluded.
const TRANSLATABLE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);

// Shared predicate: after stripping HTML entities, does the string still contain
// a >=2 letter run (real prose)? Used by both the JSXText and JSXAttribute visitors.
function isReportableText(str) {
  const trimmed = str.replace(ENTITY_REF, ' ').trim();
  if (trimmed.length === 0) return false;
  return LETTER_RUN.test(trimmed);
}

function preview(str) {
  const trimmed = str.replace(ENTITY_REF, ' ').trim();
  const clipped = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
  return clipped.replace(/\s+/g, ' ');
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flag hardcoded user-facing JSX text/attributes that should be routed through i18n t().',
    },
    schema: [],
    messages: {
      untranslated:
        'Hardcoded user-facing text "{{text}}". Route copy through i18n t() instead of literal JSX text.',
      untranslatedAttr:
        'Hardcoded user-facing {{attr}} "{{text}}". Route copy through i18n t() instead of a literal attribute value.',
    },
  },
  create(context) {
    return {
      JSXText(node) {
        if (!isReportableText(node.value)) return;
        context.report({ node, messageId: 'untranslated', data: { text: preview(node.value) } });
      },
      JSXAttribute(node) {
        if (!node.name || !TRANSLATABLE_ATTRS.has(node.name.name)) return;
        const v = node.value;
        // Only flag a plain string literal; skip {t(...)} / dynamic / boolean attrs.
        if (!v || v.type !== 'Literal' || typeof v.value !== 'string') return;
        if (!isReportableText(v.value)) return;
        context.report({
          node,
          messageId: 'untranslatedAttr',
          data: { attr: node.name.name, text: preview(v.value) },
        });
      },
    };
  },
};
