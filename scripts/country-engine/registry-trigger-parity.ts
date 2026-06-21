// Pure helpers for the registry<->trigger parity CI gate (country-engine design
// spec §2.7). They bridge the two declarations of "jurisdiction-derived" config
// keys so CI can fail the moment they drift:
//   - TS source of truth: STATUTORY_KEYS (src/lib/country/registry.ts)
//   - DB enforcer:        the statutory_keys ARRAY[] inside the
//                         validate_country_config_overrides() trigger function
// Kept pure (string in, data out) so the live psql layer in the .test.ts is thin
// glue and every fragile bit is unit-tested. See
// docs/superpowers/specs/2026-06-16-registry-trigger-parity-gate-design.md.

/**
 * Extract the statutory key list from a `pg_get_functiondef` body of
 * validate_country_config_overrides(). Anchors on the `statutory_keys ... ARRAY[`
 * literal and returns the single-quoted keys. Returns [] when no such array is
 * present (a missing/renamed function) so the caller fails loud against the
 * non-empty registry rather than silently passing.
 *
 * The non-greedy `[\s\S]*?` between `statutory_keys` and `ARRAY[` steps over the
 * `text[] :=` prefix without mistaking its `[]` for the array, and the function's
 * `FOREACH k IN ARRAY statutory_keys` has no bracket so it cannot match.
 */
export function parseTriggerStatutoryKeys(funcDef: string): string[] {
  const m = funcDef.match(/statutory_keys[\s\S]*?ARRAY\s*\[([\s\S]*?)\]/i);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']*)'/g)].map((q) => q[1]);
}

export interface StatutoryKeyDiff {
  /** Locked in the TS registry but NOT enforced by the trigger — the dangerous drift. */
  missingInTrigger: string[];
  /** Enforced by the trigger but no longer locked in the TS registry. */
  extraInTrigger: string[];
  inParity: boolean;
}

/** Order-independent set diff between the registry keys and the trigger keys. */
export function diffStatutoryKeys(registry: string[], trigger: string[]): StatutoryKeyDiff {
  const r = new Set(registry);
  const t = new Set(trigger);
  const missingInTrigger = [...r].filter((k) => !t.has(k)).sort();
  const extraInTrigger = [...t].filter((k) => !r.has(k)).sort();
  return {
    missingInTrigger,
    extraInTrigger,
    inParity: missingInTrigger.length === 0 && extraInTrigger.length === 0,
  };
}

/** The corrective `ARRAY['a','b']` literal (sorted) to paste into a migration. */
export function expectedTriggerArraySql(registry: string[]): string {
  const sorted = [...new Set(registry)].sort();
  return `ARRAY[${sorted.map((k) => `'${k}'`).join(',')}]`;
}
