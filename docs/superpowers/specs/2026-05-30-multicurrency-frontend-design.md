# Multi-Currency Phase 1 — Frontend Slice (Design)

**Date:** 2026-05-30
**Status:** Approved design — ready for implementation plan
**Depends on:** the committed services "switch-on" (`975c6e1`) which already threads
`currency`/`exchange_rate`/`rate_source`/`*_base` through the financial write paths and
points reporting at base amounts. This slice makes multi-currency **usable and visible**
from the UI and fixes a critical provisioning regression found during scoping.

Parent design: `docs/multicurrency-architecture.md` (§6 display rules, §8 onboarding, §13 step 8).

---

## 1. Goal & scope

Deliver the user-facing half of Phase-1 multi-currency, in three sub-slices plus one
urgent bug fix:

- **F2a — Provisioning fix (critical, do first).** New-tenant signup is broken; fix it.
- **F1 — Base-currency display.** Show money in the tenant's base currency at its real
  decimal places (3 for OMR, 0 for JPY), instead of the current USD/2dp.
- **F2b — Onboarding base-currency step + Settings currency management.**
- **F3 — Per-document currency selector + live base equivalent** in invoice/quote forms.

**Out of scope (later phases):** cross-currency *payment* pickers (payments inherit the
invoice currency — SMB model), multi-currency bank accounts (Phase 2), unrealized FX
revaluation (Phase 3), document-PDF currency styling beyond formatting.

---

## 2. Critical bug found during scoping (F2a)

**Symptom (verified):** inserting a `tenants` row fails with
`null value in column "base_currency_code" violates not-null constraint`.

**Root cause:** migration M2 added `tenants.base_currency_code text NOT NULL` (no default).
The `BEFORE INSERT` trigger `sync_tenant_config_from_country` sets `currency_code`,
`currency_symbol`, `decimal_places`, … from `geo_countries`, but was **never updated to set
`base_currency_code`**. Neither `provision-tenant` (the edge function that inserts the
tenant) nor any direct insert supplies it. The two existing tenants predate M2 and were
backfilled, so the breakage is invisible until the next signup.

**Verification:** a dry-run `INSERT … VALUES (…, country_id=<OMR country>, …)` wrapped in a
self-aborting `DO` block (rolled back, nothing committed) returned the not-null error on
`base_currency_code`. Picking a country whose `currency_code IS NULL` additionally fails on
`currency_code`, because the trigger overwrites the column's `'USD'` default with the
country's NULL value.

**Impact:** all new tenant signups fail. Severity: critical / production-down for onboarding.

---

## 3. Architecture overview

```
 Onboarding (F2b)         Settings → Currencies (F2b)        Invoice/Quote forms (F3)
   base-currency step       base (locked) + add/activate       currency <select> + base ≈
        │                          │                                   │
        ▼                          ▼                                   ▼
   tenantService.createTenant   tenantCurrencyService (NEW)     currencyService.getSupportedCurrencies
        │                          │  add/activate/deactivate          getConversionRate (≈ preview)
        ▼                          ▼                                   │
   provision-tenant edge fn ─▶ tenant_currencies (RLS)          createInvoice/createQuote (already
        │   (DB triggers, F2a)      ▲                            snapshot rate + *_base, 975c6e1)
        ▼                          │
   tenants (base_currency_code) ───┘   AFTER INSERT trigger seeds tenant_currencies(is_base)

 Display layer (F1):  useCurrency() → formatCurrencyWithConfig(amount, base CurrencyConfig)
   repointed dashboards / list stat cards / detail totals  (were formatCurrency() = USD/2dp)
```

Existing building blocks reused: `currencyService` (`getBaseCurrency`, `getSupportedCurrencies`,
`getConversionRate`, `getCurrencyDecimals`), `TenantConfigContext`/`useCurrencyConfig`
(currency config incl. `decimalPlaces` sourced from `accounting_locales`),
`formatCurrencyWithConfig` (`src/lib/format.ts`), the `AppearanceSettings`/`AccountingLocales`
settings-page pattern, and `InvoiceFormModal`/`QuoteFormModal`.

---

## 4. F2a — Provisioning fix (DB migration)  *(Decision A: DB-trigger approach)*

One additive migration applied via `mcp__supabase__apply_migration`, then regenerate types.

1. **Replace `sync_tenant_config_from_country`** so it:
   - sets `NEW.base_currency_code := COALESCE(NEW.base_currency_code, country_config.currency_code, 'USD')`
     (only fills when not explicitly provided; never nulls an explicit value);
   - hardens `currency_code`: `NEW.currency_code := COALESCE(country_config.currency_code, NEW.currency_code, 'USD')`
     so a country with NULL `currency_code` no longer nulls the column default.
2. **Add an `AFTER INSERT` trigger on `tenants`** (`seed_tenant_base_currency`) that inserts
   `tenant_currencies (tenant_id, currency_code, is_base, is_active, display_order)
   VALUES (NEW.id, NEW.base_currency_code, true, true, 0)` — idempotent: guarded by the
   existing `uq_tenant_base_currency` partial unique index via `ON CONFLICT DO NOTHING`
   (or a `WHERE NOT EXISTS` check). `SECURITY DEFINER`, `search_path=public`.
3. **No backfill** — M2 already seeded base rows for the 2 existing tenants; the trigger is
   idempotent if re-run.
4. **Regenerate** `src/types/database.types.ts`; the function/trigger change does not alter
   table types, but the migration is recorded in the manifest per migration discipline.

**Test:** re-run the self-aborting dry-run insert → expect `WOULD_SUCCEED`. Confirm a second
identical insert path does not create a duplicate base `tenant_currencies` row.

---

## 5. F1 — Base-currency display  *(Decision B: scope = financial dashboards/lists/detail)*

**Problem:** money totals call `formatCurrency(total)` (`src/lib/format.ts`) which defaults
to `'USD'` and hardcodes `minimum/maximumFractionDigits: 2`. So a tenant's (now-correct)
base totals render as `$1,234.50` instead of `OMR 1,234.500`.

**Key fact:** the hook `useCurrency()` (`src/hooks/useCurrency.ts`) **already exists** and
returns `formatCurrency(amount)` = `formatCurrencyWithConfig(amount, currencyConfig)`, which
already honours the tenant `CurrencyConfig` (`symbol`, `decimalPlaces`, separators,
`position`). `useCurrencyConfig()` sources `decimalPlaces` from `accounting_locales` (3 for
OMR). So F1 is **not** "build a hook" — it is repointing call sites to the existing one.

**Approach:**
- Repoint the money displays in the **financial dashboards, list stat cards, and detail
  totals** from the standalone `formatCurrency` imported out of `src/lib/format` (USD/2dp)
  to `useCurrency().formatCurrency(...)`. Concretely: invoice/quote/expense/payment stat
  cards (`InvoicesListPage`, `QuotesListPage`, `ExpensesList`, payments pages) and the case
  finances / detail totals. A focused, greppable sweep of `formatCurrency(` call sites in
  `src/pages/financial`, the `src/pages/cases` finance tabs, and related components — each
  swapping `import { formatCurrency } from '…/lib/format'` for the hook's `formatCurrency`.
- Harden the residual standalone helpers for any non-hook callers left over: in
  `lib/format.formatCurrency` derive `min/maxFractionDigits` from the passed currency (drop
  the hardcoded `2` — `Intl` already knows ISO-4217 decimals), and in `fetchCurrencyFormat`
  read `decimalPlaces` from the locale rather than the literal `2`.

**Non-goals:** retokenising every currency string in the whole app. Scope is the financial
surfaces where base totals are shown. Document PDFs already format per their own path.

**Test:** characterization/manual — an OMR tenant's dashboard shows `OMR` symbol and 3
decimals; a USD tenant unchanged (2 decimals). No `$`/2dp hardcode remains in the swept set.

---

## 6. F2b — Onboarding base-currency step + Settings currency management

### 6.1 Onboarding (mandatory base-currency confirmation)
- In the onboarding country step (`useOnboardingFlow` / step 1 + its component), after a
  country is chosen, **pre-fill** a required `baseCurrencyCode` field from
  `geo_countries.currency_code` but render it as an **explicit, editable, required** control
  (a labelled select of active `master_currency_codes`), per §8 — not silently inherited.
- Add `baseCurrencyCode` to `OnboardingFormData` + the step schema (required).
- Thread it into `tenantService.createTenant(...)` → `provision-tenant`, which sets it on the
  `tenants` insert. The F2a trigger remains the backstop (and seeds `tenant_currencies`).

### 6.2 Settings → Currencies page
- New page `src/pages/settings/CurrencySettings.tsx` (+ route + Settings nav entry),
  following the `AccountingLocales`/`AppearanceSettings` structure and admin gating
  (`PermissionsContext`).
- Shows: the **base currency** (locked, with a note that it's immutable once financial
  documents exist — architecture §8) and a list of the tenant's transaction currencies from
  `tenant_currencies` with add / activate / deactivate / reorder.
- New `src/lib/tenantCurrencyService.ts`: `listTenantCurrencies`, `addTenantCurrency(code)`,
  `setActive(id, bool)`, `setDisplayOrder`, all writing `tenant_currencies` (RESTRICTIVE RLS
  + audit trigger already enforce isolation). Adding a currency inserts an `is_base=false`
  row; deactivating sets `is_active=false` (never hard-delete; soft-delete only).
- Guardrails: cannot deactivate/remove the base; cannot add a duplicate (unique
  `(tenant_id, currency_code)`); only `master_currency_codes.is_active` codes are offered.

**Test:** add a 2nd currency → appears in `getSupportedCurrencies()`; base row cannot be
deactivated; duplicate add is rejected with a friendly message.

---

## 7. F3 — Per-document currency selector + base equivalent  *(Decision C)*

- In `InvoiceFormModal` and `QuoteFormModal`: add a currency `<select>` populated from
  `currencyService.getSupportedCurrencies()` (active `tenant_currencies`, base first),
  defaulting to the base currency. Bind it to the form's `currency` field, which already
  flows into `createInvoice`/`createQuote` (those snapshot the rate + `*_base`).
- Below the totals, a read-only **base-equivalent preview**: when the selected document
  currency ≠ base, compute `rate = getConversionRate(doc, base)` and show
  `≈ <formatBase(total × rate)>` (e.g. `Total: USD 1,200 · ≈ OMR 462.000`). Hidden when
  doc == base.
- Line-item and header inputs continue to be entered/displayed in the **document** currency
  (formatted to its decimals); the `≈ base` line is purely informational.
- If no rate is available (empty `exchange_rates` while the cron is dormant) the preview
  shows a muted "rate unavailable" note rather than erroring; saving still works (the write
  path defaults doc==base → rate 1, or records the chosen currency and resolves at save).

**Edge:** while only the base currency is active (today's tenants), the selector shows a
single option and the ≈ preview never appears — byte-identical UX to before.

**Test:** with ≥2 active currencies, selecting a non-base currency shows the ≈ line; the
saved invoice persists the chosen `currency` + snapshotted `exchange_rate`/`*_base`
(verified against the row).

---

## 8. Data flow (create-invoice-in-foreign-currency, end to end)

```
InvoiceFormModal
  currency <select> (from getSupportedCurrencies)  ──▶ form.currency = 'USD' (doc), base = 'OMR'
  ≈ preview: rate = getConversionRate('USD','OMR') ; show total × rate in OMR
        │ onSubmit
        ▼
  createInvoice({ ...form, currency:'USD' }, items)         (already shipped, 975c6e1)
        │  resolveRateContext('USD', date) → { rate, documentDecimals:2, baseDecimals:3 }
        │  header totals round to 2dp (USD); *_base = round(total × rate, 3) (OMR)
        ▼
  invoices row: currency='USD', exchange_rate=r, total_amount(USD), total_amount_base(OMR)
        │
        ▼
  dashboards (F1): get_invoice_stats_base → totals in OMR → useCurrency().format → "OMR …"
```

---

## 9. Error handling

- **F2a:** trigger uses `COALESCE` (never throws on a present value); `ON CONFLICT DO NOTHING`
  on the seed avoids duplicate-base errors. If `base_currency_code` somehow still NULL (country
  with no currency), it falls back to `'USD'` — a safe, valid base.
- **F1:** `useCurrency().format` falls back to `DEFAULT_TENANT_CONFIG.currency` if config is
  loading; never throws.
- **F2b:** service methods surface friendly toasts on RLS/unique/validation errors; base-row
  protection enforced client- and (via the partial unique index) DB-side.
- **F3:** `getConversionRate` failure (no rate) is caught → "rate unavailable" note, save
  unaffected; never blocks the form.

---

## 10. Testing strategy

- **Pure/unit:** any new pure formatting helper gets vitest cases (USD 2dp, OMR 3dp, JPY 0dp).
  `tenantCurrencyService` guard logic (reject base deactivate / duplicate) where extractable.
- **DB:** re-run the dry-run tenant-insert (expect success); assert single base
  `tenant_currencies` row post-insert.
- **Type/CI:** `npm run typecheck` = 0; regenerate `database.types.ts` after the migration;
  schema-drift check passes.
- **Manual/dogfood:** OMR tenant dashboard renders OMR/3dp; add a USD transaction currency in
  settings; create a USD invoice; confirm ≈ preview and the persisted base columns.

---

## 11. Sequencing

1. **F2a** provisioning migration + types (unblocks signup — ship first).
2. **F1** display sweep (makes the backend visible/correct).
3. **F2b** onboarding step + Settings → Currencies page + `tenantCurrencyService`.
4. **F3** per-document selector + base-equivalent preview.

Each step is independently verifiable; F3 depends on F1 + F2b.

---

## 12. Decisions (locked with product owner)

- **A — Provisioning fix in the DB trigger layer** (covers all creation paths), not edge-only.
- **B — F1 scope = financial dashboards / list stat cards / detail totals** (a focused sweep),
  not an app-wide currency-string retokenisation.
- **C — Per-document selector offers only the tenant's active currencies; payments inherit the
  invoice's currency** (SMB FX model). Free cross-currency payment picker deferred to Phase 2.

---

## 13. Out of scope / follow-ups

- Document-header rounding to document-currency decimals is **already shipped** in `975c6e1`.
- Cross-currency payments, multi-currency bank accounts → Phase 2.
- Unrealized/period-end FX revaluation, rate-history/audit UI → Phase 3.
- The `edge_function_service_key` is unset → the rate-sync cron is dormant; the ≈ preview and
  any non-base document will only resolve real rates once a platform admin sets that secret and
  rates are ingested. This slice degrades gracefully until then (doc==base path unaffected).
