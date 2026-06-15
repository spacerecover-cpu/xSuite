import { describe, it, expect } from 'vitest';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildAllSeedRows } from './gcc-priority-seed';
import { emitSeedSql } from './build-geo-seed';

// The repeatable generator, expressed as a verifying test so it needs NO extra
// runtime (tsx/esbuild) — vitest already transforms + resolves these TS modules.
// Running `npm run geo:test` (or `npm run geo:build-seed`) regenerates the
// artifact deterministically and asserts it is well-formed. The artifact is the
// source-of-truth SQL the operator lands as the `populate_geo_countries_reference_data`
// migration (see blockers — we do not apply it here).
const ARTIFACT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../supabase/seeds/geo_countries_seed.generated.sql',
);

describe('geo_countries seed generator', () => {
  const sql = emitSeedSql(buildAllSeedRows());

  it('produces an idempotent, source_locked-respecting, jsonb-merging upsert', () => {
    expect(sql).toContain('INSERT INTO public.geo_countries');
    expect(sql).toContain('ON CONFLICT (code) DO UPDATE');
    expect(sql).toContain('WHERE geo_countries.source_locked IS NOT TRUE');
    expect(sql).toContain('country_config = geo_countries.country_config ||');
  });

  it('covers OM/SA/AE/US/IN/GB with real (non-$) config', () => {
    for (const code of ['OM', 'SA', 'AE', 'US', 'IN', 'GB']) {
      expect(sql, `seed missing ${code}`).toContain(`'${code}'`);
    }
    // no fabricated currency stub
    expect(sql).not.toContain("'$$$'");
  });

  it('writes the deterministic artifact to disk when GENERATE=1 (otherwise read-only verify)', () => {
    if (process.env.GENERATE === '1') {
      writeFileSync(ARTIFACT, sql);
    }
    expect(existsSync(ARTIFACT)).toBe(true);
  });
});
