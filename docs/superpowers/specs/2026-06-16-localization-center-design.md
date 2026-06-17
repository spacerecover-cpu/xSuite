# Localization Center — Phase 3 Design Spec

> **Initiative:** currency-localization-consistency · **Phase:** 3 of 4 · **Date:** 2026-06-16
> **Predecessors:** Phase 1 (single-source currency for documents — PR #232, merged) · Phase 2 (tenant `currency.display_mode` + `currency.negative_format` registry keys + formatter — branch `feat/currency-localization-phase2`).
> **Audit catalog:** `docs/audit/2026-06-16-currency-localization-audit.md` (P3 = 2 findings; this spec also closes the "ungoverned cosmetic-key writes" gap surfaced in discovery).

## 1. Goal

Replace the legacy **Accounting Locales** page (a multi-row CRUD list over the `accounting_locales` table) with a **Localization Center**: a single, admin-only settings screen where a tenant manages how regional, currency, date/time, and document formatting renders — persisted as **tenant overrides in `tenants.country_config_overrides`** (the Country Engine jsonb bag) — and **retire the `accounting_locales` resolver fold** so `country_config_overrides` + `resolved_country_config` become the sole tenant-config source.

This makes the Phase 2 display-mode/negative-format controls (and ~7 previously-ungoverned cosmetic keys) **editable by tenants**, validated by the registry's own Zod schemas, with forensic audit on write.

## 2. Non-goals (explicitly out of scope)

- **Phase 4 caller sweep** — retiring the *remaining* `accounting_locales` readers (`useAccountingLocale`, `format.ts` `fetchCurrencyFormat`/`formatCurrencyWithSettings`, `templateContextService`, banking modals, `financialService`). Phase 3 cuts only the **resolver fold** (`buildConfigLayers` + the concurrent default-locale read in `tenantConfigService`). The other readers keep working off the table until Phase 4.
- **Document *rendering*** — how PDFs/invoices consume resolved config (Phase 1, shipped). Phase 3 only writes the override bag + owns the document-language *setting* UI.
- **Transaction-currency list** — `/settings/currencies` (`CurrencySettings` over `tenant_currencies`) is a different feature (which currencies you invoice in, not display formatting). It stays.
- **A view-only / non-admin tier** — gating is binary owner/admin at the route today; no new tier.
- **Non-themed surfaces** — PDF styles, `chartTheme`, `cat-*` palette, device icons. Pure in-app settings UI.

## 3. Architecture overview

- **Rewrite in place.** `src/pages/settings/AccountingLocales.tsx` is rewritten as the Localization Center (rename the component export to `LocalizationCenter`; update the lazy import at `src/App.tsx:249` in lockstep). Keep the route `/settings/localization`, the `ProtectedRoute allowedRoles={ADMIN_ROLES}` (`owner`/`admin`) gate, and the SettingsDashboard `id:'localization'` Globe card (retitle "Localization Center"). The legacy CRUD list + `LocaleFormModal` are discarded wholesale.
- **Four pill tabs**, one shared dirty-state **Save** (batch). Pill-tablist pattern from `ReportSectionsPage.tsx:607-650` (role=tablist/tab/tabpanel, roving tabIndex, arrow-key nav). Save/dirty pattern from `TableColumnsSettings.tsx:106-197`.
- **Editable-vs-read-only is derived from registry metadata**, never hardcoded:
  ```
  isLocked(def) = def.required === true || def.maxOverrideLayer === 'country'
  ```
  Locked fields render disabled with a `Statutory`/`Jurisdiction` badge. Editable fields render an override control; every value is `def.schema.safeParse`-validated before write (same schema the resolver uses).
- **Two persistence targets**, presented together but written to their natural homes:
  1. Regional / Currency / Date-Time overrides → `tenants.country_config_overrides` via the new RPC.
  2. Document language (mode + secondary language) → `company_settings.localization.document_language_settings` via the existing `companySettingsService` (kept where `useDocumentTranslations` + PDF `applyTenantLanguage` already read it — no data migration, no PDF repoint).

## 4. The four tabs

`R/O` = read-only (locked). `EDIT` = editable override. `NEW` = needs a new registry key (see §5).

### A. Regional
| Control | Backing | Status |
|---|---|---|
| Country / Region | snapshot `country.code`/`country.name` (no registry key) | **R/O** — change = `resyncTenantCountryConfig()` action, not an inline override |
| Timezone | `datetime.timezone` (registry, default `UTC`) | **EDIT** |
| UI language | `tenants.ui_language` via `updateTenantUiLanguage()` (validated vs `SUPPORTED_LANGS`) | **EDIT** — own path, NOT the override bag |
| Locale code | `locale.code` (registry, `required`) | **R/O** |

### B. Currency
| Control | Backing | Status |
|---|---|---|
| Base currency code | `currency.code` (registry, `required`) | **R/O** |
| Display mode (symbol / ISO / both) | `currency.display_mode` (Phase 2) | **EDIT** |
| Negative format (minus / parentheses) | `currency.negative_format` (Phase 2) | **EDIT** |
| Position (before / after) | `currency.position` | **EDIT · NEW** |
| Decimal places | `currency.decimal_places` | **EDIT · NEW** (distinct from statutory minor-units) |
| Decimal separator | `currency.decimal_separator` | **EDIT · NEW** |
| Thousands separator | `currency.thousands_separator` | **EDIT · NEW** |
| Currency symbol (glyph) | snapshot `currency.symbol` | **R/O** in Phase 3 (no defaultless registry key; display_mode already covers symbol-vs-code) |
| Amount-in-words minor units | `number_format.amount_in_words_minor_units` (registry, `required`, statutory: OMR=3/JPY=0) | **R/O** |

Live **preview** of the current currency settings (reuse the `formatExample` pattern from `LocaleFormModal.tsx:73-83`, driven by `formatCurrencyWithConfig` + a draft `CurrencyConfig` built from the dirty form state).

### C. Date / Time
| Control | Backing | Status |
|---|---|---|
| Date format | `datetime.date_format` (registry, default `YYYY-MM-DD`) | **EDIT** |
| Time format (12h / 24h) | `datetime.time_format` | **EDIT · NEW** |
| Week start | `datetime.week_starts_on` | **EDIT · NEW** (NOT `weekend_days`) |
| Weekend days | `datetime.weekend_days` (registry, default `[6,0]`) | **EDIT** (existing) |
| Fiscal-year start (MM-DD) | `datetime.fiscal_year_start` | **EDIT · NEW** |

Live date preview via `formatDate`/`formatDateTimeWithConfig`.

### D. Document
| Control | Backing | Status |
|---|---|---|
| Document language mode + secondary language | `company_settings.localization.document_language_settings` (`{mode: english_only\|bilingual, secondary_language, language_name}`) — **moved here from `GeneralSettings.tsx`** | **EDIT** (own path) |
| Tax label | `tax.label` (registry, `required`) | **R/O** |
| Default tax rate (display) | `tax.default_rate` (registry, `required`) | **R/O** |
| ZATCA QR enabled | `tax.zatca_qr.enabled` (`maxOverrideLayer:'country'`) | **R/O** (server-rejected) |
| Resolved invoice/report locale | composed from `locale.code` + currency/date keys | **R/O** (read-only summary) |

## 5. New registry keys (zero migration — jsonb bag already exists)

Push to `COUNTRY_CONFIG_REGISTRY` (`src/lib/country/registry.ts`). **All non-statutory** (deliberately NO `maxOverrideLayer` → tenant-overridable AND outside `STATUTORY_KEYS`, so the registry↔trigger parity CI gate is unaffected — same property as the Phase 2 keys). Each has a **real `codedDefault` chosen to equal the current resolver fallback**, so resolution stays byte-identical for existing tenants.

| key | domain | schema | codedDefault |
|---|---|---|---|
| `currency.position` | currency | `z.enum(['before','after'])` | `'before'` |
| `currency.decimal_places` | currency | `z.number().int().min(0).max(4)` | `2` |
| `currency.decimal_separator` | currency | `z.string().min(1).max(1)` | `'.'` |
| `currency.thousands_separator` | currency | `z.string().max(1)` | `','` |
| `datetime.time_format` | datetime | `z.enum(['12h','24h'])` | `'24h'` |
| `datetime.week_starts_on` | datetime | `z.number().int().min(0).max(6)` | `0` |
| `datetime.fiscal_year_start` | datetime | `z.string().regex(/^\d{2}-\d{2}$/)` | `'01-01'` |

**Wire them into the resolver.** In `resolveTenantConfigFromLayers` (`tenantConfigService.ts`), replace the raw `snap['currency.position']` / `snap['currency.decimal_places']` / … reads for these 7 fields with `get('currency.position')` etc., so (a) tenant overrides actually take effect and (b) values are Zod-validated. The codedDefaults match the current `|| default` / `?? default` fallbacks, so for the 2 live tenants (whose `resolved_country_config` already carries these keys) the resolved output is byte-identical — pinned by a resolver test.

## 6. Backend — the override write path (new)

**No writer to `country_config_overrides` exists today; build one. Use an RPC that merges, never a client `.update()` (which would clobber the whole jsonb bag).**

### 6.1 RPC `set_tenant_country_config_overrides(p_tenant_id uuid, p_overrides jsonb) → jsonb`
- `SECURITY DEFINER`, `SET search_path = public`.
- **Re-assert authz** (SECURITY DEFINER bypasses RLS): `(p_tenant_id = get_current_tenant_id() AND has_role('admin')) OR is_platform_admin()` else `RAISE EXCEPTION`.
- Guard `jsonb_typeof(p_overrides) = 'object'`.
- **Merge**: `UPDATE tenants SET country_config_overrides = COALESCE(country_config_overrides,'{}'::jsonb) || p_overrides WHERE id = p_tenant_id RETURNING country_config_overrides`. The existing `validate_country_config_overrides()` BEFORE trigger fires here and rejects any statutory key for free.
- **Audit** via the existing `log_audit_trail(...)` helper (action e.g. `config.override.set`, details = the changed keys) — forensic-lab product; deliberate upgrade over the un-audited single-column writers.
- Return the merged bag.

### 6.2 RPC `reset_tenant_country_config_overrides(p_tenant_id uuid, p_keys text[]) → jsonb`
- Same authz/audit. `UPDATE … SET country_config_overrides = country_config_overrides - p_keys`.
- **Anti-brick guard:** refuse to remove a key that is `required` in the registry AND not present in `resolved_country_config` (removing it would make the resolver throw and brick the tenant's app shell). In practice the UI never offers reset on locked keys; this is defense-in-depth.

### 6.3 Service (`src/lib/tenantConfigService.ts`)
- `setTenantConfigOverrides(tenantId, overrides: Record<string, unknown>)`: validate **each** key against `REGISTRY_BY_KEY[key].schema` (reject unknown keys + bad values client-side before the round-trip), reject locked keys (`isLocked`), call the RPC, then `invalidateTenantConfigCache(tenantId)`.
- `resetTenantConfigOverrides(tenantId, keys)`: analogous.
- The page then calls `TenantConfigContext.refreshConfig()` so resolved `CurrencyConfig`/`DateTimeConfig` updates app-wide.

## 7. Migration plan (ordered; low-risk at current scale)

**Live data (verified 2026-06-16):** exactly **2 tenants** (both Oman, OMR/ar-OM), both with `currency.code`/`locale.code`/`datetime.date_format` already in `resolved_country_config`, both with **empty** `country_config_overrides`. Neither relies on the fold → **cutting the fold bricks nobody**; the backfill is a no-op safety net today.

1. **RPC migration** (`mcp__supabase apply_migration`): create both RPCs (§6.1/§6.2). Regen `src/types/database.types.ts` via the Supabase MCP.
2. **Backfill migration** (idempotent, additive): for each non-deleted tenant with a default `accounting_locales` row, lift any of `currency.code`/`datetime.date_format`/`locale.code` (+ the cosmetic columns → their new registry keys) that are **missing from both `resolved_country_config` and `country_config_overrides`** into `country_config_overrides`. **Gate per tenant on `isResolvedConfig`** semantics (a tenant must still resolve all required keys afterward). Today: writes nothing.
3. **Cut the fold**: remove `localeToBag`/the default-locale fold from `buildConfigLayers.ts`, and the concurrent default-locale read (`tenantConfigService.ts:41-47`) + the `defaultLocale` param threading. Update `buildConfigLayers.test.ts` + `tenantConfigService.test.ts`. (The wider `accounting_locales` reader retirement remains Phase 4.)

All DB work is main-loop-only and additive; no `DROP`/`DELETE`. Backfill uses the established `app.bypass_tenant_guard` pattern if it writes during migration.

## 8. Retire in lockstep

- Remove the `document_language_settings` editing block from `GeneralSettings.tsx` (~lines 1340-1451) and its `updateField('localization','document_language_settings',…)` wiring; the Document tab becomes its sole editor (same `company_settings.localization` storage, so `useDocumentTranslations` + PDF readers are unaffected). Leave a short "Localization moved → Localization Center" pointer if GeneralSettings still renders a localization section.

## 9. UI component vocabulary & tokens

- **Shell** (model `AppearanceSettings.tsx:88-`): `min-h-screen`, back `ChevronLeft`, `w-10 h-10 rounded-xl bg-primary` Globe tile w/ `text-primary-foreground`, `h1 text-xl font-bold text-slate-900` + `text-slate-600 text-sm` subtitle.
- **Tabs**: pill-tablist (`ReportSectionsPage` pattern) — extract a tiny local `Tabs`/`TabList` if cleaner; full a11y (roles, `aria-controls`, roving tabIndex, arrow keys).
- **Save**: dirty-flag + "Unsaved changes" hint + `<Button isLoading>` (`TableColumnsSettings` pattern). One Save commits the country-config batch (RPC) and, if the Document tab is dirty, the `company_settings` write.
- **Form primitives** (`src/components/ui/`, a11y via `useFieldA11y`): `Input`, `Select`, `RadioGroup` (display_mode / negative_format / position / week-start / time-format), `Checkbox`, `FormField`, `Button`, `Card`, `Badge` (`Statutory`/`Override`/`Default` chips).
- **Toasts**: `useToast()` — `toast.success`/`toast.error` on every write (raw `react-hot-toast` import is an ESLint error). Verify the Toaster actually renders.
- **Tokens** (DESIGN.md): card `bg-surface`/`bg-white`; nested `bg-surface-muted`; lines `border-border`; active/focus `border-primary`/`ring-primary`; body text in slate neutrals (no brand "text" token). Locked field = `disabled:opacity-50` + neutral badge — **do not** invent a lock token or color-code the tabs (`cat-*` is identity-only). No purple/indigo/violet, no raw hex (ESLint-enforced).

## 10. Routing & permissions

- Keep route `/settings/localization` (`App.tsx:249`) + named export (update import if renamed). Declare any sub-routes before the `:categoryId` catch-all (`App.tsx:258`).
- Gating stays route-level owner/admin (`ADMIN_ROLES`). No in-page tier.
- Nav: SettingsDashboard card `id:'localization'` (`settingsCategories.ts:227-235`) — retitle + update the page `<h1>` in lockstep.

## 11. Data flow

```
[Localization Center form] --(dirty batch, Zod-validated client-side)-->
  tenantConfigService.setTenantConfigOverrides(tenantId, {keys})
    --> RPC set_tenant_country_config_overrides (|| merge, authz, validate trigger, audit)
    --> invalidateTenantConfigCache(tenantId)
  TenantConfigContext.refreshConfig() --> getTenantConfig (fresh) --> resolveTenantConfigFromLayers
    --> useCurrencyConfig()/useDateTimeConfig() update app-wide

[Document tab language] --> companySettingsService (company_settings.localization) --> useDocumentTranslations / PDF
```

## 12. Testing plan (TDD)

- **RPC** (DB / integration): merge does not clobber sibling keys; authz rejects non-admin / cross-tenant; statutory key rejected by trigger; reset removes keys; reset anti-brick rejects clearing an unresolvable required key; audit row written.
- **Service** (unit): `setTenantConfigOverrides` rejects unknown/locked keys + bad values pre-RPC; invalidates cache.
- **Registry** (unit): the 7 new keys resolve to coded defaults, are tenant-overridable, and are **NOT** in `STATUTORY_KEYS` (parity-gate safety) — extend `registry.test.ts`.
- **Resolver** (unit): after wiring `get()` for the 7 fields, resolution for an OMR snapshot is byte-identical to today; a tenant override wins; fold removal doesn't change resolution for a tenant whose `resolved_country_config` has all required keys — extend `tenantConfigService.test.ts` + `buildConfigLayers.test.ts`.
- **`isLocked` helper** (unit): `required` and `maxOverrideLayer:'country'` → locked; others → editable.
- **UI** (component): locked fields disabled + badged; preview reflects dirty state; Save calls the service with only changed keys; toast on success/error.
- **Backfill** (migration/SQL): idempotent (re-run = no-op); never lowers `isResolvedConfig`.
- Gate: `npm run check:tsc` 0 · full `npx vitest run` green (minus the known local-only i18n/LocaleContext jsdom artifact) · PDF parity unchanged.

## 13. Build order

- **PR-A — backend** (off fresh branch from main): 7 registry keys + resolver `get()` wiring; the two RPCs (migration + types regen); `tenantConfigService` writers; backfill migration; cut the fold (+ tests). Fully tested, ships independently — the override write path + validated cosmetic keys are valuable even before the UI.
- **PR-B — UI**: the Localization Center (4 tabs, preview, Save) + `GeneralSettings` document-language retirement + nav/title rename. Depends on PR-A.

## 14. Risks & guards

- **Brick via fold removal** — mitigated: 2 tenants, both resolve required keys from `resolved_country_config`; backfill is `isResolvedConfig`-gated; fold removal lands after backfill verification.
- **jsonb clobber** — mitigated by the `||`-merge RPC (never client `.update`).
- **Ungoverned cosmetic writes** — the 7 new keys add Zod validation where there was none; statutory keys stay server-rejected.
- **decimal_places vs amount-in-words minor units** and **week_starts_on vs weekend_days** — two conflation traps; labelled distinctly, different schemas, never cross-wired.
- **Third document-config writer** — avoided by moving (not duplicating) the GeneralSettings document-language block and keeping its `company_settings` storage.
- **Scope balloon** — the wider `accounting_locales` reader retirement and `/settings/currencies` reconciliation are explicitly Phase 4 / separate.

## 15. Decisions captured (user-approved 2026-06-16)

1. **Rewrite in place** (keep route/export/gate).
2. **Cut the fold + backfill now** (not deferred) — de-risked by the 2-tenant data reality.
3. **Pill-tab sections**, single shared Save.
4. **Full document control** — Document tab owns the document-language setting (moved from GeneralSettings); `CurrencySettings` stays separate; document-language data stays in `company_settings` (UI owns it, no data migration, no PDF repoint).
