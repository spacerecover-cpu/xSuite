// RuleTester for the custom `no-untranslated-jsx-text` rule.
//
// `eslint-rules/` is in eslint's own ignore list (eslint.config.js), so this
// file isn't linted — it's run directly. RuleTester's static `describe`/`it`
// delegate to `node:test` when no global test framework is present, so run with:
//   node --test eslint-rules/no-untranslated-jsx-text.test.js
//
// The rule is CONSERVATIVE (spec §0): it only flags a JSXText node whose
// trimmed value contains a run of >=2 alphabetic letters. Whitespace, numbers,
// punctuation, single chars, and symbols are intentionally ignored.
import { RuleTester } from 'eslint';
import rule from './no-untranslated-jsx-text.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('no-untranslated-jsx-text', rule, {
  valid: [
    // Translated text via t() expression container — not JSXText.
    { code: "const A = () => <div>{t('x')}</div>;" },
    // Dynamic expression — not literal text.
    { code: 'const A = () => <div>{count}</div>;' },
    // Pure numbers — no alphabetic run.
    { code: 'const A = () => <div>123</div>;' },
    // Whitespace / newlines between elements.
    { code: 'const A = () => (\n  <div>\n    {x}\n  </div>\n);' },
    // Single alphabetic char — below the >=2 letter threshold.
    { code: 'const A = () => <span>x</span>;' },
    // Punctuation and symbols only.
    { code: 'const A = () => <span>$ — / : ,</span>;' },
    // Number with currency symbol, no letter run.
    { code: 'const A = () => <span>$1,234.00</span>;' },
    // Translatable attrs routed through t() / dynamic / empty / numeric / non-targeted.
    { code: "const A = () => <input placeholder={t('portal:search')} />;" },
    { code: 'const A = () => <input placeholder="" />;' },
    { code: 'const A = () => <input placeholder="123" />;' },
    { code: 'const A = () => <input name="email" />;' }, // not a user-facing attr
    { code: 'const A = () => <img alt={photo.name} />;' }, // dynamic
  ],
  invalid: [
    {
      code: 'const A = () => <div>Save</div>;',
      errors: [{ messageId: 'untranslated' }],
    },
    {
      code: 'const A = () => <button>Submit Order</button>;',
      errors: [{ messageId: 'untranslated' }],
    },
    // Literal user-facing attribute values must route through t().
    { code: 'const A = () => <input placeholder="Search cases" />;', errors: [{ messageId: 'untranslatedAttr' }] },
    { code: 'const A = () => <button title="Close dialog" />;', errors: [{ messageId: 'untranslatedAttr' }] },
    { code: 'const A = () => <span aria-label="Loading" />;', errors: [{ messageId: 'untranslatedAttr' }] },
    { code: 'const A = () => <img alt="Device photo" />;', errors: [{ messageId: 'untranslatedAttr' }] },
  ],
});
