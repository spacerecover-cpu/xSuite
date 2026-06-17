# Localization Center — PR-A (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for the Localization Center — 7 new tenant-overridable registry keys wired into the resolver, a merge RPC write path to `tenants.country_config_overrides`, a validated service layer, an idempotent backfill, and removal of the legacy `accounting_locales` resolver fold.

**Architecture:** Extend the Country Engine registry with cosmetic currency/datetime keys (non-statutory, real coded defaults that keep resolution byte-identical). Replace raw `snap[...]` reads in `resolveTenantConfigFromLayers` with validated `get(...)`. Persist tenant overrides through a `SECURITY DEFINER` RPC that `||`-merges the jsonb bag (never clobbers) and audits. Backfill any tenant whose default `accounting_locales` row is the sole source of a key, gated on `isResolvedConfig`, then remove the resolver fold.

**Tech Stack:** TypeScript, Zod, Supabase Postgres (RPC via `mcp__supabase apply_migration`, project_id `ssmbegiyjivrcwgcqutu`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-localization-center-design.md`. **Branch:** continues on `feat/currency-localization-phase2` (Phase 2 + Phase 3 coexist uncommitted; split into separate PRs at commit time).

**Live data reality (verified 2026-06-16):** 2 tenants (both OMR/ar-OM), both resolve all required keys from `resolved_country_config`, both have empty `country_config_overrides` → backfill is a no-op today; fold removal bricks nobody.

---

### Task 1: Seven new non-statutory registry keys

**Files:**
- Modify: `src/lib/country/registry.ts` (push to `COUNTRY_CONFIG_REGISTRY`, after the Phase-2 `currency.negative_format` entry / within the datetime block)
- Test: `src/lib/country/registry.test.ts`

- [ ] **Step 1: Write failing tests** — append to `registry.test.ts`:

```typescript
describe('Phase 3 cosmetic keys (tenant-overridable, NON-statutory)', () => {
  const KEYS: Array<[string, unknown]> = [
    ['currency.position', 'before'],
    ['currency.decimal_places', 2],
    ['currency.decimal_separator', '.'],
    ['currency.thousands_separator', ','],
    ['datetime.time_format', '24h'],
    ['datetime.week_starts_on', 0],
    ['datetime.fiscal_year_start', '01-01'],
  ];
  it('each resolves to its coded default when no layer sets it', () => {
    for (const [key, def] of KEYS) {
      expect(resolveCountryConfigKey({}, key)).toEqual(def);
    }
  });
  it('each is tenant-overridable and none is statutory', () => {
    for (const [key] of KEYS) {
      expect(REGISTRY_BY_KEY[key], `missing ${key}`).toBeTruthy();
      expect(REGISTRY_BY_KEY[key].maxOverrideLayer).toBeUndefined();
      expect(REGISTRY_BY_KEY[key].required).toBeFalsy();
      expect(STATUTORY_KEYS).not.toContain(key);
    }
  });
  it('validates values via the registry Zod schema', () => {
    expect(resolveCountryConfigKey({ tenant: { 'currency.position': 'after' } }, 'currency.position')).toBe('after');
    expect(() => resolveCountryConfigKey({ tenant: { 'currency.position': 'left' } }, 'currency.position')).toThrow(CountryConfigError);
    expect(() => resolveCountryConfigKey({ tenant: { 'currency.decimal_places': 9 } }, 'currency.decimal_places')).toThrow(CountryConfigError);
    expect(() => resolveCountryConfigKey({ tenant: { 'datetime.fiscal_year_start': '1-1' } }, 'datetime.fiscal_year_start')).toThrow(CountryConfigError);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/country/registry.test.ts` → fails ("Unregistered country-config key: currency.position").

- [ ] **Step 3: Add the entries** to `COUNTRY_CONFIG_REGISTRY` (currency block after `currency.negative_format`; datetime block after `datetime.weekend_days`):

```typescript
  {
    key: 'currency.position',
    domain: 'currency',
    label: 'Currency symbol position',
    description: 'Whether the currency token renders before or after the amount. Tenant preference.',
    schema: z.enum(['before', 'after']),
    codedDefault: 'before',
  },
  {
    key: 'currency.decimal_places',
    domain: 'currency',
    label: 'Decimal places',
    description: 'Display decimal places for amounts. Distinct from the statutory amount-in-words minor units. Tenant preference.',
    schema: z.number().int().min(0).max(4),
    codedDefault: 2,
  },
  {
    key: 'currency.decimal_separator',
    domain: 'currency',
    label: 'Decimal separator',
    description: 'Character separating the integer and fraction parts. Tenant preference.',
    schema: z.string().min(1).max(1),
    codedDefault: '.',
  },
  {
    key: 'currency.thousands_separator',
    domain: 'currency',
    label: 'Thousands separator',
    description: 'Character grouping thousands (empty = no grouping). Tenant preference.',
    schema: z.string().max(1),
    codedDefault: ',',
  },
  {
    key: 'datetime.time_format',
    domain: 'datetime',
    label: 'Time format',
    description: '12-hour or 24-hour clock. Tenant preference.',
    schema: z.enum(['12h', '24h']),
    codedDefault: '24h',
  },
  {
    key: 'datetime.week_starts_on',
    domain: 'datetime',
    label: 'Week starts on',
    description: 'First day of the week (0=Sun..6=Sat). Distinct from weekend_days. Tenant preference.',
    schema: z.number().int().min(0).max(6),
    codedDefault: 0,
  },
  {
    key: 'datetime.fiscal_year_start',
    domain: 'datetime',
    label: 'Fiscal year start',
    description: 'Fiscal year start as MM-DD. Tenant preference.',
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    codedDefault: '01-01',
  },
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/lib/country/registry.test.ts`.

- [ ] **Step 5:** (commit deferred — batch with Task 2; both are the registry/resolver slice.)

---

### Task 2: Wire the 7 keys into the resolver (validated, override-aware, byte-identical defaults)

**Files:**
- Modify: `src/lib/tenantConfigService.ts` (`resolveTenantConfigFromLayers`, the `currency` + `dateTime` blocks ~lines 99-123)
- Test: `src/lib/tenantConfigService.test.ts`

- [ ] **Step 1: Write failing tests** — append to the `resolveTenantConfigFromLayers` describe:

```typescript
it('resolves the 7 cosmetic keys from the country snapshot (byte-identical to raw reads)', () => {
  const layers = buildConfigLayers(
    { resolved_country_config: {
        'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
        'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
        'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        'currency.position': 'after', 'currency.decimal_places': 3,
        'currency.decimal_separator': '.', 'currency.thousands_separator': ' ',
        'datetime.time_format': '12h', 'datetime.week_starts_on': 6, 'datetime.fiscal_year_start': '04-01',
      }, country_config_overrides: {} },
    null,
  );
  const cfg = resolveTenantConfigFromLayers(baseRow, layers);
  expect(cfg.currency.position).toBe('after');
  expect(cfg.currency.decimalPlaces).toBe(3);
  expect(cfg.currency.thousandsSeparator).toBe(' ');
  expect(cfg.dateTime.timeFormat).toBe('12h');
  expect(cfg.dateTime.weekStartsOn).toBe(6);
  expect(cfg.dateTime.fiscalYearStart).toBe('04-01');
});

it('falls back to coded defaults when the snapshot omits a cosmetic key (no throw)', () => {
  const layers = buildConfigLayers(
    { resolved_country_config: {
        'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
        'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
        'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
      }, country_config_overrides: {} },
    null,
  );
  const cfg = resolveTenantConfigFromLayers(baseRow, layers);
  expect(cfg.currency.position).toBe('before');
  expect(cfg.currency.decimalPlaces).toBe(2);
  expect(cfg.dateTime.timeFormat).toBe('24h');
  expect(cfg.dateTime.weekStartsOn).toBe(0);
  expect(cfg.dateTime.fiscalYearStart).toBe('01-01');
});

it('a tenant override of a cosmetic key wins', () => {
  const layers = buildConfigLayers(
    { resolved_country_config: {
        'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
        'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
        'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        'currency.position': 'before',
      },
      country_config_overrides: { 'currency.position': 'after', 'datetime.time_format': '12h' } },
    null,
  );
  const cfg = resolveTenantConfigFromLayers(baseRow, layers);
  expect(cfg.currency.position).toBe('after');
  expect(cfg.dateTime.timeFormat).toBe('12h');
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/tenantConfigService.test.ts` → the override test fails (raw `snap[...]` ignores `country_config_overrides`).

- [ ] **Step 3: Replace the raw reads with `get()`** in `resolveTenantConfigFromLayers`. In the `currency` block:

```typescript
      decimalPlaces: get<number>('currency.decimal_places'),
      decimalSeparator: get<string>('currency.decimal_separator'),
      thousandsSeparator: get<string>('currency.thousands_separator'),
      position: get<'before' | 'after'>('currency.position'),
```
(keep `code`/`symbol`/`name`/`displayMode`/`negativeFormat` as-is). In the `dateTime` block:
```typescript
      dateFormat: get<string>('datetime.date_format'),
      timeFormat: get<'12h' | '24h'>('datetime.time_format'),
      timezone: get<string>('datetime.timezone'),
      weekStartsOn: get<0|1|2|3|4|5|6>('datetime.week_starts_on'),
      fiscalYearStart: get<string>('datetime.fiscal_year_start'),
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/lib/tenantConfigService.test.ts` + `npx vitest run src/lib/country` + `npm run check:tsc`.

- [ ] **Step 5: Commit** — `git add src/lib/country/registry.ts src/lib/country/registry.test.ts src/lib/tenantConfigService.ts src/lib/tenantConfigService.test.ts && git commit -m "feat(country-engine): add 7 tenant-overridable cosmetic registry keys + resolver wiring"`

---

### Task 3: `isLocked` helper (registry-driven editable/read-only)

**Files:**
- Modify: `src/lib/country/registry.ts` (export helper)
- Test: `src/lib/country/registry.test.ts`

- [ ] **Step 1: Failing test:**

```typescript
describe('isConfigKeyLocked — editable vs statutory derivation', () => {
  it('locks required keys and country-locked keys, leaves preferences editable', () => {
    expect(isConfigKeyLocked('currency.code')).toBe(true);       // required
    expect(isConfigKeyLocked('tax.zatca_qr.enabled')).toBe(true); // maxOverrideLayer:'country'
    expect(isConfigKeyLocked('currency.display_mode')).toBe(false);
    expect(isConfigKeyLocked('currency.position')).toBe(false);
    expect(isConfigKeyLocked('datetime.date_format')).toBe(false);
  });
  it('treats an unknown key as locked (fail-safe)', () => {
    expect(isConfigKeyLocked('nope.nope')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`isConfigKeyLocked` undefined).
- [ ] **Step 3: Implement** in `registry.ts`:

```typescript
/** A key is locked (read-only in the UI) iff it is a required jurisdiction key
 *  or country-locked (statutory). Unknown keys are locked fail-safe. */
export function isConfigKeyLocked(key: string): boolean {
  const def = REGISTRY_BY_KEY[key];
  if (!def) return true;
  return def.required === true || def.maxOverrideLayer === 'country';
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(country-engine): isConfigKeyLocked editable/statutory helper"`

---

### Task 4: Merge + reset RPCs (live migration) + regenerated types

**Files:**
- Migration via `mcp__supabase apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), name `set_tenant_country_config_overrides`
- Modify: `src/types/database.types.ts` (regenerate, do not hand-edit)

- [ ] **Step 1: Inspect the audit helper + tenants RLS** — `mcp__supabase execute_sql`: `SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname IN ('log_audit_trail','get_current_tenant_id','has_role','is_platform_admin');` and confirm the `validate_country_config_overrides` trigger exists on `tenants`. Match the RPC's audit call to `log_audit_trail`'s real signature.

- [ ] **Step 2: Apply the migration** (`apply_migration`):

```sql
CREATE OR REPLACE FUNCTION public.set_tenant_country_config_overrides(
  p_tenant_id uuid,
  p_overrides jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_new jsonb;
BEGIN
  IF NOT ((p_tenant_id = get_current_tenant_id() AND has_role('admin')) OR is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized to update tenant config overrides';
  END IF;
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'p_overrides must be a JSON object';
  END IF;
  UPDATE public.tenants
     SET country_config_overrides = COALESCE(country_config_overrides, '{}'::jsonb) || p_overrides
   WHERE id = p_tenant_id
   RETURNING country_config_overrides INTO v_new;   -- validate_country_config_overrides() trigger fires here
  IF v_new IS NULL THEN RAISE EXCEPTION 'Tenant % not found', p_tenant_id; END IF;
  PERFORM log_audit_trail(/* match real signature: tenant, action 'config.override.set', entity 'tenant', entity_id p_tenant_id, details jsonb_build_object('keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_overrides) k)) */);
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.reset_tenant_country_config_overrides(
  p_tenant_id uuid,
  p_keys text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_new jsonb; v_resolved jsonb; k text;
BEGIN
  IF NOT ((p_tenant_id = get_current_tenant_id() AND has_role('admin')) OR is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT resolved_country_config INTO v_resolved FROM public.tenants WHERE id = p_tenant_id;
  -- anti-brick: refuse to clear a required key not present in resolved_country_config
  FOREACH k IN ARRAY p_keys LOOP
    IF k IN ('currency.code','locale.code','tax.label','tax.default_rate','number_format.amount_in_words_minor_units')
       AND NOT (COALESCE(v_resolved,'{}'::jsonb) ? k) THEN
      RAISE EXCEPTION 'Refusing to clear required key % (would unconfigure tenant)', k;
    END IF;
  END LOOP;
  UPDATE public.tenants
     SET country_config_overrides = COALESCE(country_config_overrides,'{}'::jsonb) - p_keys
   WHERE id = p_tenant_id
   RETURNING country_config_overrides INTO v_new;
  PERFORM log_audit_trail(/* action 'config.override.reset', details keys */);
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.set_tenant_country_config_overrides(uuid,jsonb) FROM public;
REVOKE ALL ON FUNCTION public.reset_tenant_country_config_overrides(uuid,text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_country_config_overrides(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_tenant_country_config_overrides(uuid,text[]) TO authenticated;
```

- [ ] **Step 3: Verify in DB** — `execute_sql`: call with a known tenant + `{"currency.display_mode":"iso_code"}`, assert merge didn't clobber, assert a statutory key (`{"tax.zatca_qr.enabled":true}`) is rejected by the trigger, assert reset of `currency.display_mode` works and reset of `currency.code` raises. Then clean up the test override (reset it).

- [ ] **Step 4: Regenerate types** — `mcp__supabase generate_typescript_types` → overwrite `src/types/database.types.ts`. Run `npm run check:tsc` (0).

- [ ] **Step 5: Commit** — `git add src/types/database.types.ts && git commit -m "feat(db): set/reset_tenant_country_config_overrides merge RPCs + types"` (note migration also recorded in the manifest per repo convention).

---

### Task 5: Service writers with Zod validation + cache invalidation

**Files:**
- Modify: `src/lib/tenantConfigService.ts` (add `setTenantConfigOverrides`, `resetTenantConfigOverrides`)
- Test: `src/lib/tenantConfigService.test.ts`

- [ ] **Step 1: Failing tests** (mock `supabase.rpc`):

```typescript
describe('setTenantConfigOverrides — validated write path', () => {
  it('rejects an unknown registry key before calling the RPC', async () => {
    await expect(setTenantConfigOverrides('t1', { 'nope.nope': 1 })).rejects.toThrow();
  });
  it('rejects a locked (statutory/required) key', async () => {
    await expect(setTenantConfigOverrides('t1', { 'currency.code': 'EUR' })).rejects.toThrow(/locked|statutory|required/i);
  });
  it('rejects a value failing the registry schema', async () => {
    await expect(setTenantConfigOverrides('t1', { 'currency.position': 'left' })).rejects.toThrow();
  });
  it('calls the RPC and invalidates the cache on a valid batch', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // ...wire the mock; assert rpc called with set_tenant_country_config_overrides + invalidateTenantConfigCache ran
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement:**

```typescript
import { REGISTRY_BY_KEY, isConfigKeyLocked } from './country/registry';

export async function setTenantConfigOverrides(
  tenantId: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  for (const [key, value] of Object.entries(overrides)) {
    const def = REGISTRY_BY_KEY[key];
    if (!def) throw new Error(`Unknown config key: ${key}`);
    if (isConfigKeyLocked(key)) throw new Error(`Config key is locked (statutory/required): ${key}`);
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) throw new Error(`Invalid value for ${key}: ${parsed.error.message}`);
  }
  const { error } = await supabase.rpc('set_tenant_country_config_overrides', {
    p_tenant_id: tenantId, p_overrides: overrides,
  });
  if (error) { logger.error('Failed to set config overrides:', error); throw error; }
  invalidateTenantConfigCache(tenantId);
}

export async function resetTenantConfigOverrides(tenantId: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc('reset_tenant_country_config_overrides', {
    p_tenant_id: tenantId, p_keys: keys,
  });
  if (error) { logger.error('Failed to reset config overrides:', error); throw error; }
  invalidateTenantConfigCache(tenantId);
}
```

- [ ] **Step 4: Run, verify PASS** + `npm run check:tsc`.
- [ ] **Step 5: Commit** — `git commit -am "feat(tenant-config): validated setTenantConfigOverrides/reset writers"`

---

### Task 6: Idempotent backfill migration (isResolvedConfig-gated)

**Files:**
- Migration via `apply_migration`, name `backfill_tenant_config_overrides_from_default_locale`

- [ ] **Step 1: Re-confirm the data** — `execute_sql` the §7 assessment query; confirm 0 tenants have `currency_needs_fold` / `locale_needs_fold` = true (today: confirmed). Document the count in the migration comment.

- [ ] **Step 2: Apply the additive, idempotent backfill** — for each non-deleted tenant with a default `accounting_locales` row, merge into `country_config_overrides` ONLY the keys absent from both `resolved_country_config` and `country_config_overrides`:

```sql
-- Idempotent: only fills GAPS; re-run is a no-op. Never lowers isResolvedConfig.
UPDATE public.tenants t
SET country_config_overrides = COALESCE(t.country_config_overrides,'{}'::jsonb) || (
  SELECT COALESCE(jsonb_object_agg(kv.key, kv.val), '{}'::jsonb)
  FROM (
    SELECT 'currency.code' AS key, to_jsonb(al.currency_code) AS val WHERE al.currency_code IS NOT NULL
    UNION ALL SELECT 'datetime.date_format', to_jsonb(al.date_format) WHERE al.date_format IS NOT NULL
    UNION ALL SELECT 'locale.code', to_jsonb(al.locale_code) WHERE al.locale_code IS NOT NULL
    UNION ALL SELECT 'currency.position', to_jsonb(al.currency_position) WHERE al.currency_position IS NOT NULL
    UNION ALL SELECT 'currency.decimal_places', to_jsonb(al.decimal_places) WHERE al.decimal_places IS NOT NULL
    UNION ALL SELECT 'currency.decimal_separator', to_jsonb(al.decimal_separator) WHERE al.decimal_separator IS NOT NULL
    UNION ALL SELECT 'currency.thousands_separator', to_jsonb(al.thousands_separator) WHERE al.thousands_separator IS NOT NULL
  ) kv
  WHERE NOT (COALESCE(t.resolved_country_config,'{}'::jsonb) ? kv.key)
    AND NOT (COALESCE(t.country_config_overrides,'{}'::jsonb) ? kv.key)
)
FROM public.accounting_locales al
WHERE al.tenant_id = t.id AND al.is_default = true AND al.deleted_at IS NULL AND t.deleted_at IS NULL;
```

- [ ] **Step 3: Verify** — `execute_sql` the assessment query again; assert every tenant still resolves required keys (no `*_needs_fold` true) and overrides only grew where gaps existed (today: unchanged, both empty).

- [ ] **Step 4: Commit** — `git commit -am "feat(db): idempotent backfill of default-locale keys into country_config_overrides"` (record in manifest).

---

### Task 7: Cut the `accounting_locales` resolver fold

**Files:**
- Modify: `src/lib/country/buildConfigLayers.ts` (remove `localeToBag` + the `defaultLocale` param/fold)
- Modify: `src/lib/tenantConfigService.ts` (remove the concurrent default-locale read at ~lines 41-47 + the `defaultLocale`/`localeResult` threading into `buildConfigLayers`)
- Test: `src/lib/country/buildConfigLayers.test.ts`, `src/lib/tenantConfigService.test.ts`

- [ ] **Step 1: Update the failing tests first.** In `buildConfigLayers.test.ts`, change the signature expectation (no `defaultLocale` param) and delete/rewrite the two folding tests so the tenant layer = `country_config_overrides` only:

```typescript
it('builds layers from snapshot + overrides only (no accounting_locale fold)', () => {
  const layers = buildConfigLayers({
    resolved_country_config: { 'currency.code': 'OMR' },
    country_config_overrides: { 'datetime.date_format': 'YYYY.MM.DD' },
  });
  expect(layers.country).toEqual({ 'currency.code': 'OMR' });
  expect(layers.tenant).toEqual({ 'datetime.date_format': 'YYYY.MM.DD' });
});
```
Update `tenantConfigService.test.ts` `resolveTenantConfigFromLayers` calls if any passed a `defaultLocale` (they pass `null` today — confirm; the resolver tests call `buildConfigLayers(..., null)` so update to the 1-arg form).

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/country/buildConfigLayers.test.ts` (arity/shape mismatch).

- [ ] **Step 3: Implement** — in `buildConfigLayers.ts` drop `AccountingLocaleRow`/`localeToBag` and make the signature `buildConfigLayers(tenant: TenantConfigRow): ConfigLayers` with `tenant: overrides` only:

```typescript
export function buildConfigLayers(tenant: TenantConfigRow): ConfigLayers {
  return {
    country: asBag(tenant.resolved_country_config),
    tenant: asBag(tenant.country_config_overrides),
  };
}
```
In `tenantConfigService.fetchTenantConfig`: remove the `accounting_locales` SELECT from the `Promise.all`, drop `localeResult`/`defaultLocale`, and call `buildConfigLayers({ resolved_country_config, country_config_overrides })` with one arg.

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/lib/country src/lib/tenantConfigService.test.ts` + `npm run check:tsc` + full `npx vitest run` (only the known i18n/LocaleContext jsdom artifact may fail).

- [ ] **Step 5: Commit** — `git commit -am "refactor(country-engine): cut the accounting_locales resolver fold (overrides are the sole tenant source)"`

---

### Final verification (PR-A)

- [ ] `npm run check:tsc` → 0
- [ ] `npx vitest run` → green except the known local-only `i18n.test.tsx` / `LocaleContext.test.tsx` jsdom artifact
- [ ] PDF parity suite unchanged (`npx vitest run src/lib/pdf src/components/documents`)
- [ ] Adversarial review workflow over the PR-A diff (byte-identical resolution for the 2 tenants; RPC merge/authz/anti-brick; no statutory key writable; backfill idempotent).

## Self-review notes
- Spec coverage: registry keys (§5)→T1; resolver wiring (§5)→T2; isLocked (§3)→T3; RPCs (§6.1/6.2)→T4; service (§6.3)→T5; backfill (§7.2)→T6; fold cut (§7.3)→T7. UI (§4/§9) + GeneralSettings retirement (§8) = PR-B (separate plan).
- Type consistency: `setTenantConfigOverrides`/`resetTenantConfigOverrides`/`isConfigKeyLocked` names used consistently across T3–T7. RPC names match service calls (`set_tenant_country_config_overrides`, `reset_tenant_country_config_overrides`).
- The `log_audit_trail` call is the one signature to confirm against the live DB in T4 step 1 before finalizing the RPC body (flagged, not a placeholder for logic).
