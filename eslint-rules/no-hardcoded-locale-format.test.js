// Run: node --test eslint-rules/no-hardcoded-locale-format.test.js
// (eslint-rules/ is in eslint's own ignore list, so this test does not run under
//  the lint gate; it is a dev-time unit test mirroring no-raw-currency-aggregation.test.js.)

import { RuleTester } from 'eslint';
import rule from './no-hardcoded-locale-format.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
});

ruleTester.run('no-hardcoded-locale-format', rule, {
  valid: [
    // No locale argument — uses the runtime default; not flagged.
    { code: 'const s = (1234.5).toLocaleString();' },
    { code: 'const f = new Intl.NumberFormat();' },
    { code: "const f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'OMR' });" },
    // Locale comes from a variable / config — exactly what we want.
    { code: 'const s = value.toLocaleString(localeCode, opts);' },
    { code: 'const f = new Intl.DateTimeFormat(config.localeCode);' },
    // A non-banned locale literal is not this rule's concern.
    { code: "const s = value.toLocaleString('ar-OM');" },
    { code: "const f = new Intl.NumberFormat('fr-FR');" },
    // Unrelated method/constructor.
    { code: "const s = value.toString('en-US');" },
  ],
  invalid: [
    {
      code: "const s = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });",
      errors: [{ messageId: 'hardcodedLocale' }],
    },
    {
      code: "const s = d.toLocaleDateString('en-GB', { month: 'short' });",
      errors: [{ messageId: 'hardcodedLocale' }],
    },
    {
      code: "const s = d.toLocaleTimeString('en-US');",
      errors: [{ messageId: 'hardcodedLocale' }],
    },
    // new Intl.NumberFormat(...) — NewExpression form.
    {
      code: "const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });",
      errors: [{ messageId: 'hardcodedLocale' }],
    },
    // Intl.DateTimeFormat(...) — plain CallExpression form.
    {
      code: "const f = Intl.DateTimeFormat('en-GB');",
      errors: [{ messageId: 'hardcodedLocale' }],
    },
  ],
});
