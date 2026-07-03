import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { COUNTRY_CONFIG_REGISTRY } from '../../src/lib/country/registry';
import { parseMapperKeys, diffMapperKeys, CODED_DEFAULT_KEYS } from './registry-mapper-parity';

const SAMPLE_DEF = `
CREATE OR REPLACE FUNCTION public._apply_country_config(p_tenant_id uuid)
AS $function$ ... jsonb_build_object(
  'currency.code', v_cc.currency_code,
  'tax.label', v_cc.tax_label,
  'datetime.timezone', v_cc.timezone
) ... $function$`;

describe('parseMapperKeys', () => {
  it('extracts dotted config keys from a functiondef', () => {
    expect(parseMapperKeys(SAMPLE_DEF)).toEqual(['currency.code', 'tax.label', 'datetime.timezone']);
  });
  it('returns [] for a body with no keys (missing/renamed function fails loud downstream)', () => {
    expect(parseMapperKeys('CREATE FUNCTION x() ...')).toEqual([]);
  });
});

describe('diffMapperKeys', () => {
  it('flags registry keys the mapper does not write, excluding coded-default keys', () => {
    const registry = ['currency.code', 'tax.label', 'tax.default_rate', 'currency.display_mode'];
    const { missingInMapper, inParity } = diffMapperKeys(registry, ['currency.code', 'tax.label']);
    expect(missingInMapper).toEqual(['tax.default_rate']); // display_mode is coded-default, excluded
    expect(inParity).toBe(false);
  });
});

const dbUrl = process.env.SUPABASE_DB_URL;
const live = dbUrl ? describe : describe.skip;

live('live _apply_country_config covers the geo-derived registry keys', () => {
  it('every non-coded-default registry key appears in the mapper body', () => {
    const def = execFileSync(
      'psql',
      [dbUrl as string, '-tA', '-c',
       "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_apply_country_config'"],
      { encoding: 'utf8' },
    );
    const registryKeys = COUNTRY_CONFIG_REGISTRY.map((d) => d.key);
    expect(registryKeys.length).toBeGreaterThan(0);
    const diff = diffMapperKeys(registryKeys, parseMapperKeys(def));
    expect(diff.missingInMapper, `mapper missing keys: ${diff.missingInMapper.join(', ')}`).toEqual([]);
    expect(CODED_DEFAULT_KEYS.size).toBeGreaterThan(0);
  });
});
