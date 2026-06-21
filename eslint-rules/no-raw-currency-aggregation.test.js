// Run: node --test eslint-rules/no-raw-currency-aggregation.test.js
// (eslint-rules/ is in eslint's own ignore list, so this test does not run under
//  the lint gate; it is a dev-time unit test mirroring no-untranslated-jsx-text.test.js.)

import { RuleTester } from 'eslint';
import rule from './no-raw-currency-aggregation.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
});

ruleTester.run('no-raw-currency-aggregation', rule, {
  valid: [
    // base-aware reduce via baseAmount
    { code: "const t = rows.reduce((s, r) => s + baseAmount(r, 'total_amount'), 0);" },
    // summing the _base shadow directly
    { code: 'const t = rows.reduce((s, r) => s + r.total_amount_base, 0);' },
    // dedicated base helpers
    { code: "const t = sumBase(rows, 'amount');" },
    { code: "const m = groupSumBase(rows, 'amount', (r) => r.cat);" },
    // += with baseAmount is fine
    { code: "function f(){ let o = {}; for (const r of rows) o[k] += baseAmount(r, 'amount'); }" },
    // non-money field reduce
    { code: 'const t = rows.reduce((s, r) => s + r.quantity, 0);' },
    // single-row display: a plain binary, not an aggregation
    { code: 'const total = inv.subtotal + inv.tax_amount;' },
  ],
  invalid: [
    {
      code: 'const t = rows.reduce((s, r) => s + r.total_amount, 0);',
      errors: [{ messageId: 'rawAggregation' }],
    },
    {
      code: 'const t = rows.reduce((acc, e) => acc + e.amount, 0);',
      errors: [{ messageId: 'rawAggregation' }],
    },
    {
      code: 'function f(){ const o = {}; for (const r of rows) o[r.cat] += r.amount; }',
      errors: [{ messageId: 'rawAggregation' }],
    },
  ],
});
