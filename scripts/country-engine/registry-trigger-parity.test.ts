import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { STATUTORY_KEYS } from '../../src/lib/country/registry';
import {
  parseTriggerStatutoryKeys,
  diffStatutoryKeys,
  expectedTriggerArraySql,
} from './registry-trigger-parity';

// The REAL body of validate_country_config_overrides() captured live from the
// canonical DB (ssmbegiyjivrcwgcqutu) via pg_get_functiondef on 2026-06-16.
// Used to prove the parser against the exact format Postgres emits — including
// the two decoys that must NOT be mistaken for the key array: the `text[]` type
// suffix and `FOREACH k IN ARRAY statutory_keys` (no bracket).
const REAL_FUNC_DEF = `CREATE OR REPLACE FUNCTION public.validate_country_config_overrides()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  statutory_keys text[] := ARRAY['tax.zatca_qr.enabled'];
  k text;
BEGIN
  IF NEW.country_config_overrides IS NULL OR NEW.country_config_overrides = '{}'::jsonb THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.country_config_overrides IS NOT DISTINCT FROM OLD.country_config_overrides THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY statutory_keys LOOP
    IF NEW.country_config_overrides ? k THEN
      RAISE EXCEPTION 'country-config key % is jurisdiction-derived and cannot be overridden at the tenant/entity layer', k;
    END IF;
  END LOOP;
  RETURN NEW;
END $function$
`;

describe('parseTriggerStatutoryKeys', () => {
  it('extracts the single key from the real captured trigger body', () => {
    expect(parseTriggerStatutoryKeys(REAL_FUNC_DEF)).toEqual(['tax.zatca_qr.enabled']);
  });

  it('does NOT mistake the `text[]` type suffix or `FOREACH ... IN ARRAY statutory_keys` for the key array', () => {
    // Same fixture; the assertion above already exercises both decoys, but pin it
    // explicitly: exactly one key, nothing stray from `text[]` / the FOREACH.
    expect(parseTriggerStatutoryKeys(REAL_FUNC_DEF)).toHaveLength(1);
  });

  it('extracts multiple keys preserving order', () => {
    const def = `... statutory_keys text[] := ARRAY['currency.code','tax.zatca_qr.enabled']; ...`;
    expect(parseTriggerStatutoryKeys(def)).toEqual(['currency.code', 'tax.zatca_qr.enabled']);
  });

  it('tolerates whitespace/newlines inside the ARRAY literal', () => {
    const def = `statutory_keys text[] := ARRAY[\n    'a.b',\n    'c.d'\n  ];`;
    expect(parseTriggerStatutoryKeys(def)).toEqual(['a.b', 'c.d']);
  });

  it('returns [] when no statutory_keys ARRAY literal is present (missing/renamed function)', () => {
    expect(parseTriggerStatutoryKeys('CREATE FUNCTION foo() ...')).toEqual([]);
    expect(parseTriggerStatutoryKeys('')).toEqual([]);
  });
});

describe('diffStatutoryKeys', () => {
  it('reports parity when both sides hold the same set (order-independent)', () => {
    const d = diffStatutoryKeys(['b', 'a'], ['a', 'b']);
    expect(d).toEqual({ missingInTrigger: [], extraInTrigger: [], inParity: true });
  });

  it('flags a key locked in TS but NOT enforced by the trigger (the dangerous drift)', () => {
    const d = diffStatutoryKeys(['tax.zatca_qr.enabled', 'tax.eosb_required'], ['tax.zatca_qr.enabled']);
    expect(d.missingInTrigger).toEqual(['tax.eosb_required']);
    expect(d.extraInTrigger).toEqual([]);
    expect(d.inParity).toBe(false);
  });

  it('flags a key enforced by the trigger but no longer locked in TS', () => {
    const d = diffStatutoryKeys(['tax.zatca_qr.enabled'], ['tax.zatca_qr.enabled', 'tax.old_key']);
    expect(d.missingInTrigger).toEqual([]);
    expect(d.extraInTrigger).toEqual(['tax.old_key']);
    expect(d.inParity).toBe(false);
  });
});

describe('expectedTriggerArraySql', () => {
  it('emits a sorted, single-quoted, comma-joined ARRAY literal', () => {
    expect(expectedTriggerArraySql(['tax.zatca_qr.enabled', 'currency.code'])).toBe(
      "ARRAY['currency.code','tax.zatca_qr.enabled']",
    );
  });
});

// ── LIVE DB layer ──────────────────────────────────────────────────────────
// Self-skips without SUPABASE_DB_URL (local dev, Dependabot/fork PRs). Enforced
// on internal PRs and push to main, where the CI job supplies the secret. psql
// is present on ubuntu-latest (already used by the country-config-completeness
// gate). execFileSync runs psql WITHOUT a shell — the URL and SQL are passed as
// literal argv elements, so no metacharacter escaping or injection is possible.
const GET_DEF_SQL =
  "SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'validate_country_config_overrides';";

describe.skipIf(!process.env.SUPABASE_DB_URL)(
  'live: validate_country_config_overrides() <-> STATUTORY_KEYS parity',
  () => {
    it('the trigger statutory_keys array equals the registry STATUTORY_KEYS set', () => {
      const dbUrl = process.env.SUPABASE_DB_URL as string;
      const def = execFileSync(
        'psql',
        [dbUrl, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', GET_DEF_SQL],
        { encoding: 'utf8' },
      );
      const triggerKeys = parseTriggerStatutoryKeys(def);
      const diff = diffStatutoryKeys(STATUTORY_KEYS, triggerKeys);
      const message = [
        'registry<->trigger parity FAILED.',
        diff.missingInTrigger.length
          ? `  Locked in TS registry but NOT enforced by validate_country_config_overrides():\n    - ${diff.missingInTrigger.join('\n    - ')}`
          : '',
        diff.extraInTrigger.length
          ? `  Enforced by the trigger but NO LONGER locked in the TS registry:\n    - ${diff.extraInTrigger.join('\n    - ')}`
          : '',
        "  Fix: set the trigger's statutory_keys in a migration to:",
        `    statutory_keys text[] := ${expectedTriggerArraySql(STATUTORY_KEYS)};`,
      ]
        .filter(Boolean)
        .join('\n');
      expect(diff.inParity, message).toBe(true);
    });
  },
);
