// eslint-rules/no-adhoc-money-allocation.test.js
import test from 'node:test';
import { RuleTester } from 'eslint';
import rule from './no-adhoc-money-allocation.js';

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
const rt = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

rt.run('no-adhoc-money-allocation', rule, {
  valid: [
    { code: 'const shares = allocateLargestRemainder(discount, weights, 3);' },
    { code: 'const ratio = (width * height) / area;' },                      // no money field
    { code: 'const taxAmount = roundMoney((subtotal * rate) / 100);' },      // percent-of-one-amount, not a split
  ],
  invalid: [
    // The CreditNoteModal.tsx:61 shape: prorating one document amount by another
    { code: 'const t = roundMoney((amount * invoice.tax_amount) / total);', errors: [{ messageId: 'adhocAllocation' }] },
    { code: 'const share = (line.total_amount * discount) / invoiceTotal;', errors: [{ messageId: 'adhocAllocation' }] },
  ],
});
