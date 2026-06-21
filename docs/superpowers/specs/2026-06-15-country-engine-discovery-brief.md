# Country Engine — Discovery Brief & Gap Analysis (Deliverable #1)

> **Date:** 2026-06-15 · **Status:** Discovery complete, design in progress
> **Source:** 12-agent evidence-based discovery across the live schema (`ssmbegiyjivrcwgcqutu`) + app code.
> **Companion:** `2026-06-15-country-engine-design.md` (deliverables #2–#11).

This brief is the grounding for the Country Engine redesign. Every fact below was re-verified against the live database. It is the single source of truth for *what exists today* so the design sections build on reality, not assumptions.

---

## 0. The reframe (read this first)

**This is not a re-architecture. It is ~80% data population + de-hardcoding + a few targeted structural additions.** The foundation is unusually strong:

- `geo_countries` already has **35 config columns** (currency, multi-field tax, date/time/timezone, locale, address/postal/phone, fiscal year, compliance flags).
- The **base/transaction multi-currency model is already built** on the 5 core financial tables (`exchange_rate` + `rate_source` + `*_base` shadow columns at `numeric(19,4)`), with a **live daily FX feed** (`exchange_rates`, 544 rows, provider `er-api`, USD pivot).
- **i18next + react-i18next + LocaleContext + RTL plumbing + a 13-language PDF catalog** are installed and working.
- `sync_tenant_config_from_country()` trigger + `TenantConfigContext` + typed hooks already propagate country → tenant → app.

The problem is three things, in priority order: **(1) the data is 72% empty, (2) a layer of hardcoded assumptions bypasses the config that already exists, (3) a handful of genuine structural holes.**

**Leverage fact:** 2 live tenants (both Oman, OMR, English UI), **0 employees, 0 payroll rows, 0 vat_returns, 0 non-unity FX rows.** The cost of fixing the model is near-zero today and compounds sharply once tenants run live payroll/VAT on the wrong model.

---

## 1. Locked decisions (set by product owner, 2026-06-15)

1. **Tenancy model: FULL 6-level hierarchy** — `Global → Region → Country → Tenant → BusinessUnit → Department` IS in scope. **Engineering constraint:** build it **additively and phased** — hierarchy columns nullable; every existing tenant auto-collapses to one legal entity + one business unit so nothing breaks; isolation extended via **ADDITIONAL RESTRICTIVE policies ANDed onto the existing `tenant_id` predicate, never by widening it**; depth delivered incrementally.
2. **Markets: GCC-deep + globally-wide config** — deep statutory for **KSA / UAE / Oman** (ZATCA, EOSB, both-sided VAT, work calendars), AND broad currency/locale/date/format population for ~all countries so anyone can onboard with correct formatting before deep statutory lands.
3. **Sequencing: BOTH in parallel** — a **correctness-hardening pass** (fix the live defects in §3) runs alongside the **Country Engine framework** build.
4. **Data residency: single-region now, design for later** — stay on one Supabase region; add a residency/region field + a documented constraint now; defer multi-region infrastructure until an EU/regulated customer is signed.

---

## 2. Reusable foundations (build ON these, do not replace)

- **`geo_countries`** — right column vocabulary already exists; the gap is sparse data, not schema.
- **`sync_tenant_config_from_country()` + denormalized tenant columns** — working country→tenant propagation pattern; extend it (and add a re-sync/backfill path).
- **`TenantConfigContext` + `tenantConfigService.ts`** — single runtime resolver, documented precedence (`accounting_locales > tenants > geo_countries > coded default`), 5-min cache. Stable consumption surface via `useTenantConfig/useCurrencyConfig/useTaxConfig/useDateTimeConfig/useLocaleConfig`.
- **`feature_flags` pattern** (`tenants.feature_flags` jsonb + `FEATURE_REGISTRY` code registry + pure `isFeatureEnabled` resolver) — **the proven migration-free extensibility template.** The Country Engine config bag must clone this exact shape.
- **Multi-currency core** — `currencyService.ts` (`resolveRateContext`, `getConversionRate`, `getBaseCurrency`, `getCurrencyDecimals`), `financialMath.baseAmount()`, `exchange_rates` feed, `tenant_currencies` registry, `master_currency_codes` (35 ISO currencies with per-currency `decimal_places`).
- **PDF engine bilingual/RTL** — `rtl.ts`, `labels.ts`, `applyTenantLanguage.ts`, `zatcaQr.ts` (dependency-free generic TLV builder), `taxBar.ts`, `amountInWords.ts`; Tajawal + Noto Sans Arabic fonts.
- **`accounting_locales`** — per-tenant override layer precedent (`is_default`, `is_active`, soft-delete).
- **i18next runtime** — installed, initialized, React-bound, anti-flash hint, admin switcher; 13-language `documentTranslations.ts` corpus as a donor dataset.

---

## 3. 🔴 Live defects — ship-blockers, not backlog (the "correctness pass")

| # | Defect | Evidence | Severity |
|---|--------|----------|----------|
| D1 | **Input/purchase VAT never recorded** — `createVATRecordFromInvoice` hardcodes `record_type:'sale'`; 0 purchase rows DB-wide; every VAT return overstates net VAT payable filed with the tax authority | `vatService.ts:209-222`; live `vat_records` all `sale` | **Critical** |
| D2 | **Fail-US, not fail-loud** — DB column defaults `'$'`/`MM/DD/YYYY`/`UTC`/`en-US`/tax `NONE`; `DEFAULT_TENANT_CONFIG` fully US; money columns default `'USD'::text` | `tenantConfig.ts:56-93`; `geo_countries` defaults; `invoices.currency` default `'USD'` | **Critical** |
| D3 | **72% country stubs** — 16/58 have `currency_code`; `address_format` `{}` for all 58; `phone_format` 0/58; Japan → `$`/MM-DD/UTC/en-US | live counts; `geo_countries` JP row | **High** |
| D4 | **No EOSB / gratuity** anywhere in schema or code | grep 0 matches | **Critical** (Gulf statutory liability) |
| D5 | **Payroll matches no real country** — flat 7% social security for everyone; no income tax; no employer contributions; `tax_calculation_method` never read | `payrollService.ts:386-391` | **Critical** |
| D6 | **Broken onboarding_progress insert** — `provision-tenant` inserts non-existent `user_id` column; error swallowed; 0 rows → entire post-login onboarding wizard dead | `provision-tenant/index.ts:321-333` | **High** |
| D7 | **Dashboards sum raw multi-currency** under one symbol (no `baseAmount`) → analytics arithmetically wrong with ≥2 currencies | `ReportsDashboard.tsx:244-245,279,305,332` | **High** |
| D8 | **Bank-balance rollup sums across currencies** with no base conversion | `financialReportsService.ts:233-234` | **High** |
| D9 | **Tax label hardcoded "VAT"** on forms + invoice PDF regardless of country | `InvoiceFormModal:893`, `QuoteFormModal:724`, `invoiceAdapter:150` | **High** |
| D10 | **Tax rate default hardcoded 5%** (Gulf VAT) ignoring `default_tax_rate` | `InvoiceFormModal:128`, `QuoteFormModal:113` | **High** |
| D11 | **ZATCA QR emits on a manual toggle, not country** — a non-KSA tenant can emit a KSA-spec QR captioned "compliant" | `invoiceAdapter:241,284` | **Medium** |
| D12 | **SupplierFormModal data-loss** — state/zip inputs map to non-existent columns, silently dropped | `SupplierFormModal.tsx:321` | **Medium** |
| D13 | **`amountInWords` hardcodes `/100`** — wrong for 3-decimal OMR/KWD/BHD and 0-decimal JPY on legal invoices | `amountInWords.ts:56-61` | **High** |
| D14 | **Money-rendering bypass sites** — `${x.toFixed(2)}`, `Intl currency:'USD'`, literal `en-US`/`en-GB` (~42 `toFixed(2)` + `$` sites) | PO modal/list, portal purchases, dashboards, stock | **Medium** |
| D15 | **Hardcoded Monday week-start / no weekend model** — `weekStartsOn:1` ignores even `week_starts_on`; GCC Fri/Sat miscounts leave + overtime | `TimesheetManagement.tsx:410-411` | **High** |
| D16 | **WPS bank-file hardcodes `'USD'` + `'Bank Muscat'`**; format defaults `'WPS'` | `payrollService.ts:871,913-914` | **Medium** |
| D17 | **Payroll currency dropdown hardcoded** USD/EUR/GBP/AED/SAR, drifts from data | `PayrollSettingsPage.tsx:271-275` | **Medium** |
| D18 | **`format.ts` legacy paths** hardcode `position:'before'` + `toLocaleString('en-US')` + Western 3-digit grouping (breaks India lakh/crore, after-position currencies) | `format.ts:49,77,97` | **High** |

---

## 4. 🟠 Structural gaps (need net-new design)

- **No sub-national jurisdiction layer.** No `geo_regions`/`geo_states`; `geo_cities.state_province` is free text. Breaks US state sales tax, CA GST/PST/HST, IN CGST/SGST/IGST, UAE emirates. `default_tax_rate` is a single scalar — no multi-rate/effective-dated tax.
- **No weekend / public-holiday / work-calendar model.** No `weekend_days`, no holidays table.
- **No legal-entity ≠ tenant separation.** Tax identity lives on `tenants`; one tenant = one entity = one country.
- **Config not extensible without a migration.** Only `feature_flags` is migration-free; every new country key needs column + trigger + interface + resolver edits. *(The single biggest thing standing between a Country **table** and a Country **Engine**.)*
- **Half-snapshot/half-live config.** Sync copies 11 of 35 fields; the rest live-join → drift; country corrections never reach provisioned tenants (sync only fires on `country_id` change).
- **i18n-ready, not internationalized.** 1/131 pages call `t()`; UI `Locale` hard-pinned to `'en'|'ar'`; ~1,000+ hardcoded JSX strings; two divergent catalogs (UI=2 langs, PDF=13).
- **No country layer in templates / no statutory filing engine.** One template per (tenant, doc_type); no VAT201/GSTR/MTD/ZATCA-Phase-2; emails are a verbatim SMTP relay with no locale.
- **Currency gaps on `stock_sales`, `payroll_records`, `purchase_orders` (no FX/base), `receipts` (no `currency_code`).**
- **Org structure flat & orphaned.** `branches` (0 rows, billing-gated only), `cases.branch_id` has **no FK**; `departments`/`positions` are HR-only, not isolation boundaries.
- **Global lookups carry jurisdiction assumptions.** `master_leave_types` (Hajj Leave shown to US tenants), `master_payroll_components` (End-of-Service shown to UK tenants) are global, no `country_id`, no `deleted_at`, platform-admin-write-only.

---

## 5. ⚫ Blind spots (domain-core for a forensic lab; need explicit design)

- **Data residency / GDPR** — single Supabase region for all tenants; likely illegal for EU-customer recovered data the instant a non-region tenant onboards. Schema can't express where data physically lives. *(Decision: single-region now + residency field + documented constraint; multi-region deferred.)*
- **Country-specific workflows / approvals** — never examined whether the 16-stage lifecycle, recovery-authorization, data-release gates, or destructive-attempt consent vary by jurisdiction. `transition_case_status` `requires[]` is advisory-only.

---

## 6. The 5 architectural decisions the redesign hinges on (from the completeness critic)

1. **Multi-jurisdiction is in scope** → full hierarchy + `legal_entities` layer, built additively/phased (locked decision #1).
2. **jsonb config bag + code registry** (clone `feature_flags`) for country-config extensibility — so new keys ship without migrations.
3. **Pick one snapshot-vs-live model + add a re-sync/backfill path** *before* populating ~195 countries, or drift is baked in at scale.
4. **Statutory correctness is a gating release criterion, not a feature** — input-VAT writer + rules-driven payroll + EOSB + country-correct tax labels must ship before any non-OMR tenant.
5. **Fail-loud, not fail-US** — make country selection a hard provisioning prerequisite; missing config fails loudly. One policy change neutralizes most of the hardcoded-assumption blast radius.

---

## 7. Evidence gaps to close during design (admitted unknowns)

- The **provenance of the 16 "good" country rows** is unidentified (client seed writes only name+code) → no verified, repeatable way to regenerate config for ~195 countries. **Design must source country data from a maintained reference dataset (e.g., CLDR/ISO 3166/4217), not hand-curation.**
- **`number_sequences` seed path is unidentified** (15 rows exist, no seed function found) → provisioning is not fully understood; make it deterministic.
- **Multi-currency is plumbed but never exercised** (0 non-unity FX rows) → prove an end-to-end non-base-currency document reconciles to the penny before claiming "it works."
- **Timezone correctness of custody/audit timestamps** is unverified at tz boundaries — a forensic risk worth a targeted test.
