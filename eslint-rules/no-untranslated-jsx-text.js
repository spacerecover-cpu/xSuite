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

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flag hardcoded user-facing JSX text that should be routed through i18n t().',
    },
    schema: [],
    messages: {
      untranslated:
        'Hardcoded user-facing text "{{text}}". Route copy through i18n t() instead of literal JSX text.',
    },
  },
  create(context) {
    return {
      JSXText(node) {
        const withoutEntities = node.value.replace(ENTITY_REF, ' ');
        const trimmed = withoutEntities.trim();
        if (trimmed.length === 0) return;
        if (!LETTER_RUN.test(trimmed)) return;

        const preview = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
        context.report({
          node,
          messageId: 'untranslated',
          data: { text: preview.replace(/\s+/g, ' ') },
        });
      },
    };
  },
};
