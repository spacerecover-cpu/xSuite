// eslint-rules/no-country-branching-outside-regimes.test.js
import test from 'node:test';
import { RuleTester } from 'eslint';
import rule from './no-country-branching-outside-regimes.js';

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
const rt = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

rt.run('no-country-branching-outside-regimes', rule, {
  valid: [
    { code: 'const x = regimeKey === "simple_vat";' },
    { code: 'if (currency === "SA") {}' },                       // not a country identifier
    { code: 'const label = countryName === "Saudi Arabia";' },    // full name, not code branching on 2-letter
  ],
  invalid: [
    { code: 'if (countryCode === "SA") { emitQr(); }', errors: [{ messageId: 'countryBranch' }] },
    { code: 'function f() { return args.countryCode === "SA" && taxSystem === "VAT"; }', errors: [{ messageId: 'countryBranch' }] },
    { code: 'if (seller.country_code !== "OM") {}', errors: [{ messageId: 'countryBranch' }] },
    { code: 'switch (countryCode) { case "IN": break; }', errors: [{ messageId: 'countryBranch' }] },
  ],
});
