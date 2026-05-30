# Multi-Currency Frontend Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase-1 multi-currency usable and visible from the UI — fix the broken
new-tenant signup, render money in the tenant base currency at its real decimals, let tenants
manage transaction currencies, and let staff invoice/quote in a chosen currency with a live
base equivalent.

**Architecture:** Backend write/read paths already snapshot `currency`/`exchange_rate`/`*_base`
(commit `975c6e1`). This slice (a) fixes provisioning at the DB-trigger layer, (b) repoints a
few display stragglers to the existing `useCurrency()` hook, (c) adds onboarding + settings UI
backed by a new `tenantCurrencyService`, and (d) adds a per-document currency selector + base
preview to the invoice/quote form modals.

**Tech Stack:** React 18 + TS + Vite, TanStack Query, Supabase (Postgres + RLS + Edge
Functions), vitest. Migrations via `mcp__supabase__apply_migration`; types via
`mcp__supabase__generate_typescript_types`.

**Spec:** `docs/superpowers/specs/2026-05-30-multicurrency-frontend-design.md`

**Audit note (refines spec §5):** exploration found the financial dashboards/lists/detail
**already use `useCurrency()`** and the OMR tenants are `decimal_places=3` end-to-end, so those
already render correctly. F1 here is the narrower set of real gaps: `.toFixed(2)` hardcodes in
`ReportsDashboard`/`RevenueDashboard`/`VATAuditPage`, the form modals (handled in F3), and the
`lib/format` standalone helpers. `BankingPage` uses a separate `useAccountingLocale()` formatter
and is out of scope.

---

## Phase 0 — F2a: Provisioning hotfix (unblocks signup) 🔴 do first

### Task 0.1: DB migration — set base currency on tenant creation

**Files:**
- Migration (via MCP): `fix_tenant_base_currency_provisioning`
- Modify (generated): `src/types/database.types.ts`

- [ ] **Step 1: Capture the failing state (evidence)**

Run this in the Supabase SQL tool (self-aborting; commits nothing). Expect it to report
`WOULD_FAIL … base_currency_code`:

```sql
DO $$
DECLARE v_country uuid; v_code text; verdict text;
BEGIN
  SELECT id, currency_code INTO v_country, v_code
  FROM geo_countries WHERE is_active AND currency_code IS NOT NULL ORDER BY name LIMIT 1;
  BEGIN
    INSERT INTO tenants (name, slug, country_id, status)
    VALUES ('__dryrun__', '__dryrun_'||substr(md5(random()::text),1,8), v_country, 'trial');
    verdict := 'WOULD_SUCCEED';
  EXCEPTION WHEN others THEN verdict := 'WOULD_FAIL ['||SQLSTATE||']: '||SQLERRM; END;
  RAISE EXCEPTION 'VERDICT >>> %', verdict;
END $$;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `fix_tenant_base_currency_provisioning` and this SQL:

```sql
-- 1) Make the country-sync trigger also populate base_currency_code and stop
--    nulling the currency_code column default when a country has NULL currency.
CREATE OR REPLACE FUNCTION public.sync_tenant_config_from_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  country_config RECORD;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.country_id IS DISTINCT FROM OLD.country_id) THEN
    IF NEW.country_id IS NOT NULL THEN
      SELECT * INTO country_config FROM geo_countries WHERE id = NEW.country_id;
      IF FOUND THEN
        NEW.currency_code     := COALESCE(country_config.currency_code, NEW.currency_code, 'USD');
        NEW.currency_symbol   := COALESCE(country_config.currency_symbol, NEW.currency_symbol, '$');
        NEW.decimal_places    := COALESCE(country_config.decimal_places, NEW.decimal_places, 2);
        NEW.tax_system        := country_config.tax_system;
        NEW.tax_label         := country_config.tax_label;
        NEW.tax_number_label  := country_config.tax_number_label;
        NEW.default_tax_rate  := country_config.default_tax_rate;
        NEW.locale_code       := country_config.locale_code;
        NEW.timezone          := country_config.timezone;
        NEW.date_format       := country_config.date_format;
        NEW.fiscal_year_start := country_config.fiscal_year_start;
      END IF;
    END IF;
  END IF;
  -- Always backstop the NOT NULL base currency from the (now-resolved) currency_code,
  -- unless the caller explicitly provided one.
  NEW.base_currency_code := COALESCE(NEW.base_currency_code, NEW.currency_code, 'USD');
  RETURN NEW;
END;
$function$;

-- 2) Seed the tenant's base row in tenant_currencies after the tenant exists.
CREATE OR REPLACE FUNCTION public.seed_tenant_base_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO tenant_currencies (tenant_id, currency_code, is_base, is_active, display_order)
  VALUES (NEW.id, NEW.base_currency_code, true, true, 0)
  ON CONFLICT (tenant_id, currency_code) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS seed_tenant_base_currency_trg ON tenants;
CREATE TRIGGER seed_tenant_base_currency_trg
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_base_currency();
```

- [ ] **Step 3: Verify the fix**

Re-run the Step-1 dry-run block. Expected: `VERDICT >>> WOULD_SUCCEED`.

Then verify the seed trigger is idempotent and base-row-correct (also self-aborting):

```sql
DO $$
DECLARE v_country uuid; v_tid uuid; cnt int;
BEGIN
  SELECT id INTO v_country FROM geo_countries WHERE is_active AND currency_code='OMR' LIMIT 1;
  INSERT INTO tenants (name, slug, country_id, status)
  VALUES ('__dryrun__', '__dryrun_'||substr(md5(random()::text),1,8), v_country, 'trial')
  RETURNING id INTO v_tid;
  SELECT count(*) INTO cnt FROM tenant_currencies WHERE tenant_id = v_tid AND is_base;
  RAISE EXCEPTION 'SEED_CHECK >>> base_rows=% (expect 1)', cnt;
END $$;
```

Expected: `SEED_CHECK >>> base_rows=1`.

- [ ] **Step 4: Regenerate types**

Use `mcp__supabase__generate_typescript_types` and overwrite `src/types/database.types.ts`.
Run `npm run typecheck` → expect 0 errors (function/trigger changes don't alter table types).

- [ ] **Step 5: Record + commit**

Add the migration to `supabase/migrations.manifest.md` per migration discipline, then:

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md
git commit -m "fix(M-fix): provisioning sets base_currency_code + seeds tenant_currencies (unblocks signup)"
```

---

## Phase 1 — F1: Base-currency display gaps

### Task 1.1: Make `lib/format` standalone helpers currency-decimal-aware

**Files:**
- Modify: `src/lib/format.ts` (`formatCurrency`, `fetchCurrencyFormat`)
- Test: `src/lib/format.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format';

describe('formatCurrency (currency-aware decimals)', () => {
  it('uses 2 decimals for USD', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });
  it('uses 3 decimals for OMR (ISO-4217)', () => {
    // Intl renders OMR with its symbol/format; assert the 3-decimal fraction is present.
    expect(formatCurrency(1234.5, 'OMR')).toMatch(/1,234\.500/);
  });
  it('uses 0 decimals for JPY', () => {
    expect(formatCurrency(1234, 'JPY')).toMatch(/1,234(?!\.)/);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — OMR/JPY render with 2 decimals (current hardcoded `minimum/maximumFractionDigits: 2`).

- [ ] **Step 3: Implement — let Intl pick the currency's decimals**

In `src/lib/format.ts`, replace the body of `formatCurrency`:

```ts
export const formatCurrency = (amount: number, currency = 'USD'): string => {
  try {
    // No fraction-digit overrides: Intl applies the currency's ISO-4217 decimals
    // (USD 2, OMR 3, JPY 0).
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};
```

And in `fetchCurrencyFormat`, replace the hardcoded `decimalPlaces: 2` line in the success
branch with a lookup that prefers the locale's value:

```ts
    cachedCurrencyFormat = {
      currencySymbol: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
      currencyPosition: 'before',
      decimalPlaces: (data as { decimal_places?: number }).decimal_places
        ?? DEFAULT_TENANT_CONFIG.currency.decimalPlaces,
      currencyCode: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
    };
```

Also add `decimal_places` to that function's `.select(...)` list.

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/lib/format.test.ts` → PASS. Then `npm run test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "fix(F1): currency-aware decimals in lib/format helpers (OMR 3dp, JPY 0dp)"
```

### Task 1.2: Replace `.toFixed(2)` stragglers with the tenant formatter

**Files:**
- Modify: `src/pages/financial/ReportsDashboard.tsx`
- Modify: `src/pages/financial/RevenueDashboard.tsx`
- Modify: `src/pages/financial/VATAuditPage.tsx`

- [ ] **Step 1: Find the exact occurrences**

Run: `grep -n "toFixed(2)" src/pages/financial/ReportsDashboard.tsx src/pages/financial/RevenueDashboard.tsx src/pages/financial/VATAuditPage.tsx`

- [ ] **Step 2: For each file, use the hook for monetary values**

In each file, ensure the component imports and destructures the hook (most already do — verify
with `grep -n useCurrency <file>`; if absent, add at top of the component body):

```ts
import { useCurrency } from '../../hooks/useCurrency';
// ...inside the component:
const { formatCurrency } = useCurrency();
```

Then replace each **monetary** `…toFixed(2)` render with `formatCurrency(value)`. Example
transformation:

```tsx
// before
<span>{currencySymbol}{amount.toFixed(2)}</span>
// after
<span>{formatCurrency(amount)}</span>
```

Do NOT touch `.toFixed(2)` used for non-currency values (percentages, ratios). Leave any
percentage/`formatPercent` usage as-is.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → 0 errors. Run `npm run build` → succeeds.
Manually confirm (or reason): an OMR tenant's reports/revenue/VAT pages now show 3-decimal,
OMR-symbol amounts.

- [ ] **Step 4: Commit**

```bash
git add src/pages/financial/ReportsDashboard.tsx src/pages/financial/RevenueDashboard.tsx src/pages/financial/VATAuditPage.tsx
git commit -m "fix(F1): render report/revenue/VAT money via useCurrency (base ccy + decimals)"
```

---

## Phase 2 — F2b: Tenant currency management + onboarding base step

### Task 2.1: `tenantCurrencyService` + pure guard helpers

**Files:**
- Create: `src/lib/tenantCurrencyService.ts`
- Test: `src/lib/tenantCurrencyService.test.ts`

- [ ] **Step 1: Write the failing test for the pure guard**

```ts
// src/lib/tenantCurrencyService.test.ts
import { describe, it, expect } from 'vitest';
import { assertCanAddCurrency, assertCanDeactivate } from './tenantCurrencyService';

const rows = [
  { id: '1', currency_code: 'OMR', is_base: true, is_active: true, display_order: 0 },
  { id: '2', currency_code: 'USD', is_base: false, is_active: true, display_order: 1 },
];

describe('tenant currency guards', () => {
  it('rejects a duplicate currency', () => {
    expect(() => assertCanAddCurrency(rows, 'USD')).toThrow(/already/i);
  });
  it('allows a new currency', () => {
    expect(() => assertCanAddCurrency(rows, 'EUR')).not.toThrow();
  });
  it('refuses to deactivate the base currency', () => {
    expect(() => assertCanDeactivate(rows, '1')).toThrow(/base/i);
  });
  it('allows deactivating a non-base currency', () => {
    expect(() => assertCanDeactivate(rows, '2')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect failure** — `npx vitest run src/lib/tenantCurrencyService.test.ts` → FAIL (module/functions missing).

- [ ] **Step 3: Implement the service**

```ts
// src/lib/tenantCurrencyService.ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

export type TenantCurrencyRow = Pick<
  Database['public']['Tables']['tenant_currencies']['Row'],
  'id' | 'currency_code' | 'is_base' | 'is_active' | 'display_order'
>;

/** Throws if `code` is already a (non-deleted) currency for the tenant. Pure. */
export function assertCanAddCurrency(rows: TenantCurrencyRow[], code: string): void {
  if (rows.some((r) => r.currency_code === code)) {
    throw new Error(`${code} is already one of your currencies.`);
  }
}

/** Throws if `id` refers to the base currency (which cannot be deactivated). Pure. */
export function assertCanDeactivate(rows: TenantCurrencyRow[], id: string): void {
  const row = rows.find((r) => r.id === id);
  if (row?.is_base) {
    throw new Error('The base currency cannot be deactivated.');
  }
}

export async function listTenantCurrencies(): Promise<TenantCurrencyRow[]> {
  const { data, error } = await supabase
    .from('tenant_currencies')
    .select('id, currency_code, is_base, is_active, display_order')
    .is('deleted_at', null)
    .order('is_base', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addTenantCurrency(code: string): Promise<void> {
  const rows = await listTenantCurrencies();
  assertCanAddCurrency(rows, code);
  const nextOrder = rows.reduce((m, r) => Math.max(m, r.display_order), 0) + 1;
  const { error } = await supabase
    .from('tenant_currencies')
    // tenant_id is stamped by the set_tenant_and_audit trigger.
    .insert([{ tenant_id: '' as string, currency_code: code, is_base: false, is_active: true, display_order: nextOrder }]);
  if (error) throw error;
}

export async function setCurrencyActive(id: string, isActive: boolean): Promise<void> {
  if (!isActive) {
    const rows = await listTenantCurrencies();
    assertCanDeactivate(rows, id);
  }
  const { error } = await supabase.from('tenant_currencies').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/** Active ISO-4217 currencies offered when adding (excludes already-added). */
export async function listAddableCurrencies(): Promise<{ code: string; name: string | null }[]> {
  const [{ data: all, error }, existing] = await Promise.all([
    supabase.from('master_currency_codes').select('code, name').eq('is_active', true).order('code'),
    listTenantCurrencies(),
  ]);
  if (error) throw error;
  const have = new Set(existing.map((r) => r.currency_code));
  return (all ?? []).filter((c) => !have.has(c.code));
}
```

- [ ] **Step 4: Run tests, expect pass** — `npx vitest run src/lib/tenantCurrencyService.test.ts` → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenantCurrencyService.ts src/lib/tenantCurrencyService.test.ts
git commit -m "feat(F2b): tenantCurrencyService (list/add/activate) with base-protection guards"
```

### Task 2.2: Settings → Currencies page

**Files:**
- Create: `src/pages/settings/CurrencySettings.tsx`
- Modify: routing (where settings routes are registered — find with the grep in Step 1)
- Modify: settings nav (the Settings dashboard/menu — find in Step 1)

- [ ] **Step 1: Locate the routing + nav patterns**

Run:
`grep -rn "AppearanceSettings\|AccountingLocales" src/App.tsx src/pages/settings/SettingsDashboard.tsx`
Note the exact `lazyWithRetry`/route registration and the nav-card pattern used for an
existing settings page; mirror it.

- [ ] **Step 2: Create the page**

```tsx
// src/pages/settings/CurrencySettings.tsx
import { useEffect, useState, useCallback } from 'react';
import { Plus, Star } from 'lucide-react';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useToast } from '../../hooks/useToast';
import {
  listTenantCurrencies, listAddableCurrencies, addTenantCurrency, setCurrencyActive,
  type TenantCurrencyRow,
} from '../../lib/tenantCurrencyService';

export default function CurrencySettings() {
  const { isAdmin } = usePermissions();
  const toast = useToast();
  const [rows, setRows] = useState<TenantCurrencyRow[]>([]);
  const [addable, setAddable] = useState<{ code: string; name: string | null }[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([listTenantCurrencies(), listAddableCurrencies()]);
      setRows(r); setAddable(a); setSelected(a[0]?.code ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load currencies');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const onAdd = async () => {
    if (!selected) return;
    try { await addTenantCurrency(selected); toast.success(`${selected} added`); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to add currency'); }
  };

  const onToggle = async (row: TenantCurrencyRow) => {
    try { await setCurrencyActive(row.id, !row.is_active); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update currency'); }
  };

  if (loading) return <div className="p-6 text-surface-muted">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">Currencies</h1>
        <p className="text-sm text-surface-muted">
          Your base (reporting) currency is locked once you have financial documents. Add the
          transaction currencies you invoice in.
        </p>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.currency_code}</span>
              {row.is_base && (
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <Star className="h-3 w-3" /> Base
                </span>
              )}
              {!row.is_active && <span className="text-xs text-surface-muted">inactive</span>}
            </div>
            {isAdmin && !row.is_base && (
              <button onClick={() => onToggle(row)} className="text-sm text-primary hover:underline">
                {row.is_active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && addable.length > 0 && (
        <div className="flex items-center gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-2 text-sm">
            {addable.map((c) => (
              <option key={c.code} value={c.code}>{c.code}{c.name ? ` — ${c.name}` : ''}</option>
            ))}
          </select>
          <button onClick={onAdd}
            className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground">
            <Plus className="h-4 w-4" /> Add currency
          </button>
        </div>
      )}
    </div>
  );
}
```

> Adjust `usePermissions()`'s `isAdmin` accessor and `useToast()` shape to match the real
> hooks (verify with `grep -n "isAdmin\|export" src/contexts/PermissionsContext.tsx` and the
> toast hook). Use existing semantic theme tokens only (no raw colors), per CLAUDE.md.

- [ ] **Step 3: Register the route + nav entry**

Mirror the `AppearanceSettings` registration found in Step 1: add a `lazyWithRetry` import and
a `<Route path="settings/currencies" … />` (matching the existing settings route nesting), and
add a nav card/link in `SettingsDashboard.tsx` pointing to it (admin-gated like Appearance).

- [ ] **Step 4: Verify** — `npm run typecheck` → 0; `npm run build` → succeeds; navigate to the
new page, confirm the base row shows "Base" and cannot be deactivated, and adding a currency works.

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/CurrencySettings.tsx src/App.tsx src/pages/settings/SettingsDashboard.tsx
git commit -m "feat(F2b): Settings -> Currencies page (manage tenant transaction currencies)"
```

### Task 2.3: Onboarding base-currency confirmation step

**Files:**
- Modify: `src/pages/auth/onboarding/constants.ts` (schema + form data)
- Modify: the country-step component (find with grep in Step 1)
- Modify: `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts` (pass through), `getStepFields`
- Modify: `src/lib/tenantService.ts` (`CreateTenantParams` + POST body)
- Modify: `supabase/functions/provision-tenant/index.ts` (read + set base_currency_code)

- [ ] **Step 1: Locate the country-step component**

Run: `grep -rln "countryId\|countries.map\|currency_symbol" src/pages/auth/onboarding`
Identify the component rendering the country `<select>` (the step-2 UI).

- [ ] **Step 2: Add `baseCurrencyCode` to the schema + form data**

In `src/pages/auth/onboarding/constants.ts`:

```ts
export const step2Schema = z.object({
  countryId: z.string().min(1, 'Please select a country'),
  baseCurrencyCode: z.string().min(3, 'Please confirm your base currency'),
});
```

Add `baseCurrencyCode: string;` to `OnboardingFormData` and `baseCurrencyCode: '',` to
`DEFAULT_FORM_DATA`.

- [ ] **Step 3: Pre-fill + render the confirmation control**

In the country-step component, fetch the active currency list once, and when the user picks a
country set `baseCurrencyCode` from that country's `currency_code`. Render a required, labelled
`<select>` of the active currencies, defaulting to the country's currency:

```tsx
// near the top of the component:
const [currencyCodes, setCurrencyCodes] = useState<{ code: string; name: string | null }[]>([]);
useEffect(() => {
  supabase.from('master_currency_codes').select('code, name').eq('is_active', true).order('code')
    .then(({ data }) => setCurrencyCodes(data ?? []));
}, []);

// on country change:
const c = countries.find((x) => x.id === id);
updateField('countryId', id);
updateField('baseCurrencyCode', c?.currency_code ?? 'USD');

// ...render below the country select:
<label className="block text-sm font-medium">Base (reporting) currency *</label>
<select value={formData.baseCurrencyCode}
  onChange={(e) => updateField('baseCurrencyCode', e.target.value)}
  className="rounded border border-border bg-surface px-3 py-2">
  {currencyCodes.map((cc) => (
    <option key={cc.code} value={cc.code}>{cc.code}{cc.name ? ` — ${cc.name}` : ''}</option>
  ))}
</select>
{errors.baseCurrencyCode && <p className="text-xs text-danger">{errors.baseCurrencyCode}</p>}
<p className="text-xs text-surface-muted">Locked once you have financial documents.</p>
```

(`supabase` is already imported in the onboarding tree; if not in this component, add
`import { supabase } from '../../../../lib/supabaseClient';`.)

In `useOnboardingFlow.getStepFields`, change `case 1: return ['countryId'];` to
`case 1: return ['countryId', 'baseCurrencyCode'];`.

- [ ] **Step 4: Thread it through createTenant + provisioning**

In `useOnboardingFlow.submit`, add `baseCurrencyCode: formData.baseCurrencyCode` to the
`createTenant({...})` call. In `src/lib/tenantService.ts`: add `baseCurrencyCode: string` to
`CreateTenantParams` and `base_currency_code: params.baseCurrencyCode` to the POST body. In
`supabase/functions/provision-tenant/index.ts`: read `base_currency_code` from the request body
and include it on the `tenants` insert object (line ~192): `base_currency_code: base_currency_code || undefined`. (The F2a trigger backstops it if omitted.)

- [ ] **Step 5: Verify** — `npm run typecheck` → 0; `npm run build` → succeeds. Walk the
onboarding wizard: selecting a country pre-fills the base currency; the field is required to
advance. (Edge-function deploy is a separate ops step — note it in the PR.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/auth/onboarding/ src/lib/tenantService.ts supabase/functions/provision-tenant/index.ts
git commit -m "feat(F2b): mandatory base-currency confirmation in onboarding + provisioning passthrough"
```

---

## Phase 3 — F3: Per-document currency selector + base equivalent

### Task 3.1: Pure base-equivalent formatter helper

**Files:**
- Modify: `src/lib/format.ts` (add `formatBaseEquivalent`)
- Test: `src/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/format.test.ts
import { formatBaseEquivalent } from './format';

describe('formatBaseEquivalent', () => {
  it('formats the converted base amount with its currency decimals', () => {
    // 1000 USD * 0.385 -> 385 OMR (3dp)
    expect(formatBaseEquivalent(1000, 0.385, 'OMR')).toMatch(/385\.000/);
  });
  it('returns null when document currency equals base (no preview needed)', () => {
    expect(formatBaseEquivalent(1000, 1, 'USD', 'USD')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect failure** — `npx vitest run src/lib/format.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/format.ts
/**
 * "≈ <base>" preview for a document total. Returns null when doc currency == base
 * (caller hides the line). Rounds via Intl to the base currency's ISO-4217 decimals.
 */
export const formatBaseEquivalent = (
  docTotal: number,
  rate: number,
  baseCurrency: string,
  documentCurrency?: string,
): string | null => {
  if (documentCurrency && documentCurrency === baseCurrency) return null;
  return `≈ ${formatCurrency(docTotal * rate, baseCurrency)}`;
};
```

- [ ] **Step 4: Run tests, expect pass** — `npx vitest run src/lib/format.test.ts` → PASS; `npm run test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(F3): formatBaseEquivalent helper for document base-currency preview"
```

### Task 3.2: Currency selector + base preview in `InvoiceFormModal`

**Files:**
- Modify: `src/components/cases/InvoiceFormModal.tsx`

- [ ] **Step 1: Load supported currencies + base**

Add imports and state. Near the existing `useCurrency()` usage (line ~90):

```ts
import { getSupportedCurrencies, getBaseCurrency, getConversionRate, type SupportedCurrency } from '../../lib/currencyService';
import { formatBaseEquivalent } from '../../lib/format';
// state:
const [currencies, setCurrencies] = useState<SupportedCurrency[]>([]);
const [baseCurrency, setBaseCurrency] = useState<string>('');
const [baseRate, setBaseRate] = useState<number>(1);
useEffect(() => {
  getSupportedCurrencies().then(setCurrencies).catch(() => setCurrencies([]));
  getBaseCurrency().then(setBaseCurrency).catch(() => {});
}, []);
```

Ensure `invoiceData.currency` exists in the form state (default to base once loaded). When the
selected currency or base changes, refresh the rate:

```ts
useEffect(() => {
  const doc = invoiceData.currency || baseCurrency;
  if (!doc || !baseCurrency || doc === baseCurrency) { setBaseRate(1); return; }
  getConversionRate(doc, baseCurrency).then(setBaseRate).catch(() => setBaseRate(NaN));
}, [invoiceData.currency, baseCurrency]);
```

- [ ] **Step 2: Render the selector**

Add near the top of the form (by the invoice date/type fields). Hide if ≤1 currency:

```tsx
{currencies.length > 1 && (
  <div>
    <label className="block text-sm font-medium">Currency</label>
    <select
      value={invoiceData.currency || baseCurrency}
      onChange={(e) => setInvoiceData((d) => ({ ...d, currency: e.target.value }))}
      className="rounded border border-border bg-surface px-3 py-2 text-sm">
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>{c.code}{c.isBase ? ' (base)' : ''}</option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 3: Format document amounts in the document currency + show the ≈ base line**

Replace the totals block's `currencyFormat.currencySymbol + value.toFixed(2)` rendering (lines
~801–827) so amounts format in the **document** currency. Derive a doc formatter:

```ts
const docCurrency = invoiceData.currency || baseCurrency || 'USD';
const fmtDoc = (v: number) => formatCurrency(v, docCurrency); // import formatCurrency from lib/format
```

Render the total with `fmtDoc(total)` and, under it, the base preview:

```tsx
{(() => {
  const preview = Number.isNaN(baseRate)
    ? 'rate unavailable'
    : formatBaseEquivalent(total, baseRate, baseCurrency, docCurrency);
  return preview ? <div className="text-xs text-surface-muted">{preview}</div> : null;
})()}
```

> Keep the existing `subtotal`/`taxAmount`/`total` math unchanged; only the **formatting** of
> displayed values switches from base-symbol+`toFixed(2)` to `fmtDoc(...)`. The selected
> `currency` already flows into `createInvoice` (backend snapshots rate + `*_base`).

- [ ] **Step 4: Verify** — `npm run typecheck` → 0; `npm run build` → succeeds. With ≥2 active
currencies: pick a non-base currency → totals show that currency + the `≈ base` line; save and
confirm the persisted `invoices.currency` + `exchange_rate` + `total_amount_base` (query the row).
With only the base active: selector hidden, no preview, behaviour unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/InvoiceFormModal.tsx
git commit -m "feat(F3): per-document currency selector + base-equivalent preview in InvoiceFormModal"
```

### Task 3.3: Currency selector + base preview in `QuoteFormModal`

**Files:**
- Modify: `src/components/cases/QuoteFormModal.tsx`

- [ ] **Step 1–4: Apply the same changes as Task 3.2 to the quote modal**

Mirror Task 3.2 exactly against `QuoteFormModal.tsx`: load `getSupportedCurrencies`/
`getBaseCurrency`, add the currency `<select>` bound to the quote form's `currency` field,
derive `fmtDoc`, format displayed totals in the document currency, and render the
`formatBaseEquivalent(total, baseRate, baseCurrency, docCurrency)` line under the total. Hide
the selector when `currencies.length <= 1`. (Repeat the code — do not reference Task 3.2 at
execution time.) The selected `currency` already flows into `createQuote`.

- [ ] **Step 5: Verify** — `npm run typecheck` → 0; `npm run build` → succeeds; same manual
checks as 3.2 against a quote.

- [ ] **Step 6: Commit**

```bash
git add src/components/cases/QuoteFormModal.tsx
git commit -m "feat(F3): per-document currency selector + base-equivalent preview in QuoteFormModal"
```

---

## Final verification (after all phases)

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run test` → all green (new: format.test.ts, tenantCurrencyService.test.ts)
- [ ] `npm run build` → succeeds
- [ ] Re-run the Task 0.1 dry-run → `WOULD_SUCCEED`
- [ ] Dogfood: OMR tenant shows OMR/3dp across reports; add USD in Settings → Currencies; create
  a USD invoice → `≈ OMR …` preview shows; saved row carries `currency='USD'`, `exchange_rate`,
  `total_amount_base` in OMR.
- [ ] Update `docs/multicurrency-architecture.md` §13 step-8 checklist + the rollout memory.

---

## Notes / known constraints

- The `≈ base` preview and any non-base document need ingested rates; the rate cron is dormant
  (`edge_function_service_key` unset). Until set, only base-currency documents resolve a real
  rate; the UI degrades gracefully ("rate unavailable", save still works). Surface this in the PR.
- `provision-tenant` is an edge function — its change needs a deploy (`mcp__supabase__deploy_edge_function`
  or CI), separate from the frontend merge. The F2a DB trigger makes signup correct even before
  that deploy.
- Permission/toast/hook accessors (`usePermissions().isAdmin`, `useToast`) and the route/nav
  registration are codebase-specific — verify against the real signatures during execution
  (greps are given in the relevant steps).
