// scripts/localization/statutory-fixtures.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { runPublishGate, type PackFixture } from '../../src/lib/tax/publishGate';
import { registerAllRegimePlugins } from '../../src/lib/regimes/register';
import { resolveTaxStrategy } from '../../src/lib/regimes/registry';
import omStandard from '../../src/lib/regimes/simple_vat/fixtures/om-standard-invoice.json';
import omZero from '../../src/lib/regimes/simple_vat/fixtures/om-zero-rated-export.json';
import omDiscount from '../../src/lib/regimes/simple_vat/fixtures/om-doc-discount-mils.json';
import aeStandard from '../../src/lib/regimes/simple_vat/fixtures/ae_standard_invoice.json';
import aeZero from '../../src/lib/regimes/simple_vat/fixtures/ae_zero_rated_export.json';
import saStandard from '../../src/lib/regimes/simple_vat/fixtures/sa_standard_invoice.json';
import saMultiline from '../../src/lib/regimes/simple_vat/fixtures/sa_multiline_line_rounding.json';

const REPO_FIXTURES: Record<string, PackFixture[]> = {
  OM: [omStandard, omZero, omDiscount] as unknown as PackFixture[],
  // Added by the P3 governed pipeline (Tasks 29/30). AE published statutory_ready, so the
  // live-DB half REQUIRES AE fixtures here; SA published formatting_ready (zatca_ph2 unimplemented)
  // so it is not enumerated live, but its fixtures still gate through the kernel in the repo half.
  AE: [aeStandard, aeZero] as unknown as PackFixture[],
  SA: [saStandard, saMultiline] as unknown as PackFixture[],
};

describe('statutory-fixtures gate (repo half — always runs)', () => {
  it('every repo fixture set passes through the live kernel', async () => {
    registerAllRegimePlugins();
    for (const [country, fixtures] of Object.entries(REPO_FIXTURES)) {
      const { pass, results } = await runPublishGate({ countryCode: country, fixtures, mode: 'kernel' });
      expect(pass, `${country}: ${JSON.stringify(results.filter((r) => !r.pass), null, 2)}`).toBe(true);
    }
  });
});

// Self-skips without SUPABASE_DB_URL (local dev, fork PRs) — enforced in CI where
// the secret exists, mirroring registry-trigger-parity.test.ts:101.
describe.skipIf(!process.env.SUPABASE_DB_URL)('statutory-fixtures gate (live-DB half)', () => {
  it('every statutory_ready country resolves regime keys and has fixtures', () => {
    registerAllRegimePlugins();
    const dbUrl = process.env.SUPABASE_DB_URL as string;
    const out = execSync(
      `psql "${dbUrl}" -t -A -c "SELECT code, COALESCE(country_config->>'regime.tax','simple_vat') FROM geo_countries WHERE config_status='statutory_ready' AND deleted_at IS NULL"`,
      { encoding: 'utf8' },
    ).trim();
    const rows = out ? out.split('\n').map((l) => l.split('|')) : [];
    for (const [code, regimeKey] of rows) {
      expect(() => resolveTaxStrategy(regimeKey), `${code}: regime.tax=${regimeKey} unregistered`).not.toThrow();
      expect(REPO_FIXTURES[code], `${code} is statutory_ready but has NO repo fixtures`).toBeDefined();
      expect(REPO_FIXTURES[code].length).toBeGreaterThan(0);
    }
  });
});
