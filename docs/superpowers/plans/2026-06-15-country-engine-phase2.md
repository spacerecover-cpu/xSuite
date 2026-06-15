# Country Engine Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 2 of the country engine — close the multi-currency gap tables with a base-currency shadow, ship the i18n enforcement gate + portal vertical slice, and insert a derived country layer into the PDF/notification cascade — so a non-OMR, non-English tenant reconciles to the penny and renders correct labels/dates/language.

**Architecture:** Six additive migrations first (FX shadow columns on the gap tables + a notification-template overlay key), then three independently-shippable application tracks executed **in order**: (A) i18n infra + portal slice, (B) multi-currency closure + base reporting, (C) reporting + country-routed PDFs. Every track is strict TDD (write failing test → confirm RED → minimal impl → confirm GREEN → `tsc` 0 → commit), additive-only, and gated behind explicit migration-applied checks where it reads a new column. The country layer is **derived from resolved statutory facts, never authored** — one override, not 195 templates.

**Tech Stack:** Postgres 15 (Supabase, project `ssmbegiyjivrcwgcqutu`) via `mcp__supabase__apply_migration`; React 18 + TypeScript + Vite; TanStack Query v5; vitest; `pdfmake` (sole PDF lib); ESLint flat config + custom rules; `node --test` for ESLint-rule tests.

---

## Migrations (apply first)

> **How to apply each:** `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) → `mcp__supabase__generate_typescript_types` → overwrite `src/types/database.types.ts` (never hand-edit) → append the migration row to `supabase/migrations.manifest.md` → `bash scripts/check-schema-drift.sh` clean → `bash scripts/check-tsc.sh` (0). All six change generated types, so regenerate after each (or after the batch).
>
> **Shared preconditions (verified live, do NOT re-create):** `get_base_currency()`, `get_current_tenant_id()`, `is_platform_admin()` exist; `tenant_currencies` exists with an `is_base` row; both live tenants resolve to OMR. The 5 core financial tables (`invoices`/`quotes`/`payments`/`expenses` + canonical `invoices`) already carry the full FX shadow (`currency text` / `exchange_rate numeric(20,10) NOT NULL DEFAULT 1` / `rate_source text NOT NULL DEFAULT 'derived'` / `*_base numeric(19,4)`) — these migrations **mirror that shape onto the gap tables**, they do not touch the canonical tables.
>
> **Ordering:** the six are mutually independent (different tables), so the 1–6 order is presentational. All six depend only on the shared preconditions above. Apply in order; regenerate types; proceed to the application tracks.
>
> **Currency-default invariant (#7, fail-loud not fail-US):** every **new** `currency`/`currency_code` column defaults to `public.get_base_currency()`, **not** the literal `'USD'`. The pre-existing `'USD'` defaults already sitting on `purchase_orders.currency` and `bank_accounts.currency` are left **untouched** here — flipping a default on a populated column is non-additive and is owned by the separate Phase-1 fail-loud default-flip work.
>
> **Additive guarantees (all six):** every column is `ADD COLUMN IF NOT EXISTS`; every index is `CREATE INDEX IF NOT EXISTS`; every backfill is an idempotent `COALESCE` UPDATE scoped to `deleted_at IS NULL`, computing `base = native * exchange_rate` (rate defaults to 1 = same-currency, so `base == native` for every current row). Zero `DROP`, zero `DELETE`, zero failing non-null backfill. New `NOT NULL` columns are safe because each carries a `DEFAULT`.

### Migration 1 — `country_engine_phase2_stock_sales_multicurrency`

**Rationale:** `stock_sales` is the first FX-gap table — it has **no** currency column today, so it gets the full set. Closing it lets base-currency reporting (D7) sum stock revenue in the tenant base. Mirrors the `invoices` shape exactly; `currency` defaults to `get_base_currency()` per invariant #7.

```sql
-- Phase 2 (D7/D8 multi-currency gap closure): give stock_sales the same FX shadow
-- pattern the 5 core financial tables already carry (invoices = canonical).
-- stock_sales has NO currency column today (verified), so we add the full set.
-- DEFAULT is the tenant's resolved base currency via get_base_currency() -- NEVER 'USD'
-- (fail-loud invariant; both live tenants are OMR). Existing rows backfill to base.

ALTER TABLE public.stock_sales
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT public.get_base_currency(),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS subtotal_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS tax_amount_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS discount_amount_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS total_amount_base numeric(19,4);

-- Idempotent base backfill for existing rows: at exchange_rate=1 (same-currency),
-- base == native. financialMath.baseAmount() owns the live rate going forward.
UPDATE public.stock_sales
  SET subtotal_base       = COALESCE(subtotal_base,       ROUND(COALESCE(subtotal,0)        * exchange_rate, 4)),
      tax_amount_base     = COALESCE(tax_amount_base,     ROUND(COALESCE(tax_amount,0)      * exchange_rate, 4)),
      discount_amount_base= COALESCE(discount_amount_base,ROUND(COALESCE(discount_amount,0) * exchange_rate, 4)),
      total_amount_base   = COALESCE(total_amount_base,   ROUND(COALESCE(total_amount,0)    * exchange_rate, 4))
  WHERE deleted_at IS NULL
    AND (subtotal_base IS NULL OR tax_amount_base IS NULL OR discount_amount_base IS NULL OR total_amount_base IS NULL);
```

### Migration 2 — `country_engine_phase2_payroll_records_multicurrency`

**Rationale:** `payroll_records` is the second FX-gap table (no currency column today). The base shadow lets payroll cost roll into base-currency reporting (D7) for multi-entity/multi-currency tenants. Native money columns are `numeric(12,2)`; the `*_base` shadows use `numeric(19,4)` to match the canonical base reporting scale. This is currency **plumbing only** — the rules-driven statutory payroll engine (D5) is Phase 3 and out of scope.

```sql
-- Phase 2 multi-currency gap closure for payroll_records. No currency column today
-- (verified). Payroll is paid in the employee/entity functional currency; the base
-- shadow lets payroll roll into base-currency cost reporting. Mirrors invoices pattern.
-- DEFAULT currency = get_base_currency() (fail-loud, not 'USD').

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT public.get_base_currency(),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS total_earnings_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS total_deductions_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS net_salary_base numeric(19,4);

UPDATE public.payroll_records
  SET total_earnings_base   = COALESCE(total_earnings_base,   ROUND(COALESCE(total_earnings,0)   * exchange_rate, 4)),
      total_deductions_base = COALESCE(total_deductions_base, ROUND(COALESCE(total_deductions,0) * exchange_rate, 4)),
      net_salary_base       = COALESCE(net_salary_base,       ROUND(COALESCE(net_salary,0)       * exchange_rate, 4))
  WHERE deleted_at IS NULL
    AND (total_earnings_base IS NULL OR total_deductions_base IS NULL OR net_salary_base IS NULL);
```

### Migration 3 — `country_engine_phase2_purchase_orders_multicurrency`

**Rationale:** `purchase_orders` is the third FX-gap table but **already carries a `currency text DEFAULT 'USD'` column** (verified live) — so this migration adds **only** the missing `exchange_rate`/`rate_source`/`*_base` shadows; re-adding `currency` would fight the existing default. Closes the D1/D7 purchase-side base rollup (input-VAT + spend reporting in tenant base). The pre-existing `'USD'` default is deliberately **not** mutated here (default-flip is non-additive, Phase-1 fail-loud work).

```sql
-- Phase 2 multi-currency gap closure for purchase_orders.
-- IMPORTANT: purchase_orders ALREADY HAS a `currency text DEFAULT 'USD'` column
-- (verified live) -- so we must NOT re-add it. We add only the missing
-- exchange_rate / rate_source / *_base shadow columns. The legacy 'USD' default on
-- the pre-existing currency column is intentionally left untouched here (changing a
-- column default is a separate, non-additive concern handled by the Phase-1
-- fail-loud default flip; this bundle is purely additive).

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS subtotal_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS tax_amount_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS discount_amount_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS shipping_cost_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS total_amount_base numeric(19,4);

UPDATE public.purchase_orders
  SET subtotal_base       = COALESCE(subtotal_base,       ROUND(COALESCE(subtotal,0)      * exchange_rate, 4)),
      tax_amount_base     = COALESCE(tax_amount_base,     ROUND(COALESCE(tax_amount,0)    * exchange_rate, 4)),
      discount_amount_base= COALESCE(discount_amount_base,ROUND(COALESCE(discount_amount,0)* exchange_rate, 4)),
      shipping_cost_base  = COALESCE(shipping_cost_base,  ROUND(COALESCE(shipping_cost,0) * exchange_rate, 4)),
      total_amount_base   = COALESCE(total_amount_base,   ROUND(COALESCE(total_amount,0)  * exchange_rate, 4))
  WHERE deleted_at IS NULL
    AND (subtotal_base IS NULL OR tax_amount_base IS NULL OR discount_amount_base IS NULL OR shipping_cost_base IS NULL OR total_amount_base IS NULL);
```

### Migration 4 — `country_engine_phase2_receipts_currency_code`

**Rationale:** `receipts` uniquely already has the `*_base` side (`exchange_rate numeric(10,6)`, `rate_source`, `amount_base numeric(12,3)`) but **no native currency column** — so the system can store a converted base amount without recording what currency the receipt was actually in. Adding `currency_code` closes the named gap. Keeps the receipts table's `*_code` naming convention. Existing narrower FX precisions (10,6 / 12,3) are **not** widened (type change on a populated column is out of additive scope).

```sql
-- Phase 2: receipts already has exchange_rate(10,6), rate_source, amount_base(12,3)
-- (verified) but is MISSING the native `currency_code` -- so amount_base can be
-- computed but the receipt's own currency is unknown, which breaks per-currency
-- display and the base-rollup audit trail. Add currency_code only.
-- DEFAULT = get_base_currency() (fail-loud, not 'USD').
-- We intentionally keep the existing column NAME `currency_code` parity request from
-- the task (receipts uses *_code naming; the other tables use bare `currency`).

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT public.get_base_currency();
```

### Migration 5 — `country_engine_phase2_bank_accounts_base_balances`

**Rationale:** `bank_accounts` has `currency` (DEFAULT `'USD'`) + `opening_balance`/`current_balance numeric(12,2)` but **no base shadow** — so the cash-position rollup sums balances across currencies under one symbol. Closes D8. Adds `current_balance_base` + `opening_balance_base` (for the base-currency cash rollup) plus `exchange_rate`/`rate_source` so the conversion that produced the base figure is auditable. Base shadows use `numeric(19,4)`. The pre-existing `'USD'` default on `currency` is left untouched (additive-only).

```sql
-- Phase 2 (D8): bank_accounts has `currency` (DEFAULT 'USD') + opening_balance /
-- current_balance numeric(12,2) but NO base shadow -- so the cash-position rollup
-- sums balances across currencies under one symbol. Add the *_base shadows for the
-- base-currency cash rollup. balances are numeric(12,2); base shadows use
-- numeric(19,4) to match the canonical base reporting scale.

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20,10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS opening_balance_base numeric(19,4),
  ADD COLUMN IF NOT EXISTS current_balance_base numeric(19,4);

-- Idempotent base backfill at the stored rate (1 = same-currency) on live rows.
-- D8's 'indicative base' convert-at-read can refine; this stamps a forensic floor.
UPDATE public.bank_accounts
  SET opening_balance_base = COALESCE(opening_balance_base, ROUND(COALESCE(opening_balance,0) * exchange_rate, 4)),
      current_balance_base = COALESCE(current_balance_base, ROUND(COALESCE(current_balance,0) * exchange_rate, 4))
  WHERE deleted_at IS NULL
    AND (opening_balance_base IS NULL OR current_balance_base IS NULL);
```

> **Naming note for Track B:** Track B's read helpers expect the bank base columns above. The original Track-B migration sketch (`M-G2`) referenced `currency_code`/`fx_rate`/`fx_rate_source`/`fx_rate_at` field names; this migration is the **authoritative** D8 shape — `current_balance_base`/`opening_balance_base`/`exchange_rate`/`rate_source`, plus the pre-existing `currency` column. Track B tasks C1.1/C1.2 below are written against **these** column names (`current_balance_base`, `exchange_rate`, `currency`). If Track B's `sumBankBalanceBase`/`generateCashFlowReport` reference `fx_rate`/`currency_code`, reconcile them to the columns this migration actually ships before running those tasks.

### Migration 6 — `country_engine_phase2_notification_templates_localization_overlay`

**Rationale:** the dispatch asked to *create* a `notification_templates` table, but introspection proves it **already exists** — tenant-scoped (nullable `tenant_id` for platform defaults), localized (`event_type`, `channel`, `locale DEFAULT 'en'`, `subject_template`, `body_template`, `link_template`, `is_active`, `deleted_at`), with full RLS, `UNIQUE (tenant_id, event_type, channel, locale) NULLS NOT DISTINCT`, and `idx_notification_templates_lookup`. Per design §3 (verified baseline line 438) this is an **OVERLAY, not a new table** — creating a second one is a duplication anti-pattern. The only missing abstraction the Q3 per-recipient resolver needs is a **stable, locale-independent `template_key`** so the resolver fetches one logical template across locales. Add it additively + a partial lookup index.

```sql
-- Phase 2 §5.6 + Q3 (per-recipient comms language): the localized email/notification
-- template table ALREADY EXISTS as `notification_templates` (verified): tenant-scoped
-- (tenant_id nullable for platform defaults), with event_type, channel,
-- locale (DEFAULT 'en'), subject_template, body_template, link_template, is_active,
-- deleted_at, full RLS envelope, and UNIQUE (tenant_id, event_type, channel, locale)
-- NULLS NOT DISTINCT. Per design spec §3 line 438 this is an OVERLAY, not a new table
-- -- creating a second notification_templates table would be a duplication anti-pattern.
--
-- The only missing piece for the Q3 resolver is a STABLE, locale-independent template
-- KEY so the resolver can fetch the same logical template across locales
-- (event_type+channel works but a single `template_key` is the cleaner join the
-- resolveCustomerLanguage() chain wants). Add it additively + a partial lookup index.

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS template_key text;

-- Backfill the key from the existing natural key so no row is left without one.
UPDATE public.notification_templates
  SET template_key = event_type || '.' || channel
  WHERE template_key IS NULL AND deleted_at IS NULL;

-- Resolver lookup path: (tenant_id, template_key, locale) over live rows.
CREATE INDEX IF NOT EXISTS idx_notification_templates_key_locale
  ON public.notification_templates (tenant_id, template_key, locale)
  WHERE deleted_at IS NULL;
```

> **Downstream wiring (out of the migration bundle, flagged):** the writer paths (`currencyService.resolveRateContext` + `financialMath.baseAmount`) must be wired into the stock-sale / payroll / PO / receipt / bank create+update services so `exchange_rate` and `*_base` populate on **new** rows — the columns alone do not self-fill beyond the rate=1 backfill. That is Track-B service-layer work (TDD, vitest), covered below.
>
> **One Q3 column owned elsewhere:** `customers_enhanced.preferred_language text NULL` (the per-recipient column) is the additive migration the portal slice (Track A, Task A5) and notification resolver (Track C, Task R9) need. It was assigned to the Phase-1/Q3 stream. If it has **not** shipped when Track A/C reach it, add it as a 7th additive migration: `ALTER TABLE public.customers_enhanced ADD COLUMN IF NOT EXISTS preferred_language text;` (then regen types + manifest + drift-clean). Do not duplicate it across tracks.

---

## Cross-cutting standards

These apply to **every task** in all three tracks:

1. **TDD micro-loop, no exceptions.** Write the failing test → run it and confirm RED **for the stated reason** → minimal implementation → run and confirm GREEN → `npx tsc --noEmit` = 0 → commit. Vitest: `npx vitest run <path>` (config `vitest.config.ts`). ESLint-rule tests run via `node --test <file>` (the `eslint-rules/` dir is in ESLint's own ignore list, so its `.test.js` does not run under the lint gate).
2. **Additive-only, soft-delete world.** No `DROP`, no `DELETE FROM`, no hard column removal. Never hand-edit `src/types/database.types.ts` — regenerate via `mcp__supabase__generate_typescript_types`. Schema changes go through `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), then manifest append, then `bash scripts/check-schema-drift.sh` clean.
3. **Pure helper as the testable seam.** Wherever a React or Supabase dependency would block a unit test, extract a pure function (the established pattern: `reportsDashboardRollup.ts`, `financialMath.ts`, `configDate.ts`). Test the pure helper; the DB read happens in the caller.
4. **Migration-gated reads.** Any task that reads a new column/table is **blocked** until the operator confirms the migration applied (read-only `information_schema` check). Do not stub the column; carry an explicit `// BLOCKED-ON: <migration>` banner until then.
5. **Identity-at-`undefined` back-compat.** Every override/config layer (`applyOverride(base, undefined)`, `resolveTemplateConfigWithCountry(builtIn, undefined)`, threaded `dateFormat` absent) must be a no-op so existing call sites keep working unchanged. PDFs for the single-OMR baseline stay byte-identical (parity tests guard this).
6. **Tokens not raw colors; PDFs do not theme.** Any UI badge/label uses semantic tokens (`Badge` variant `info`, etc.) per `DESIGN.md` — never raw Tailwind colors or brand hex. `PDF_COLORS` and `deviceIconMapper.ts` SVG hexes are intentionally fixed and untouched.
7. **Fail-loud, not fail-US.** New currency columns default to `get_base_currency()`, never `'USD'`. The country layer is **derived from resolved statutory facts, never authored** and never a UI toggle — no `if (country === 'KSA')` branches outside `src/lib/country/**` / reference seeds.
8. **Branch + commit hygiene.** Branch from `main` per logical change; one logical change per commit; commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not reuse a merged branch name. Use `maybeSingle()` (never `single()`).
9. **No new npm dependencies** are introduced by any track.
10. **CI-yml edits are cross-area.** Registering a new lint job or required check (`country-i18n`, `country-lint`) in `.github/workflows/ci.yml` is coordinated with the schema-discipline/CI owner before merge.

---

## Area 1 — i18n infra + portal vertical slice (Track A)

> **Scope (per dispatch):** the **enforcement gate FIRST**, **Locale widening**, **catalog unification**, and the **portal vertical slice only**. The full-app ~400–600-key extraction (slices 2–5: `documents`/`cases`/`financial`/`settings`) is **explicitly DEFERRED breadth** — see the final section, not designed here.
>
> **Sequencing reality (verified read-only against `ssmbegiyjivrcwgcqutu`):** Phase 1 has **not** shipped `geo_languages`, `i18n_translations`, or `customers_enhanced.preferred_language`. So Track A splits into **file-only seams that land now** (A0 gate, A1-bootstrap, A2-scaffold, A3 portal extraction keyed in-bundle, A5 pure resolver) and **DB-backed hydration** (A1-hydrate, A2-seed, A5 wiring) each carrying a `// BLOCKED-ON: <migration>` banner + a same-PR types regen. If Phase 1 lands the tables first, the blocked steps collapse to wiring.

### Task A0 — Enforcement gate FIRST (extend rule, freeze baseline, flip to error, missing-key CI)

**Files:**
- Modify: `eslint-rules/no-untranslated-jsx-text.js`, `eslint-rules/no-untranslated-jsx-text.test.js`, `eslint.config.js`, `.github/workflows/ci.yml`
- Create: `eslint-rules/i18n-baseline.json`, `scripts/check-i18n-keys.sh`

> **Why first:** stop the bleeding before draining the pool (mirrors schema-discipline baseline→gate→burndown). The *missing-key* check is initially scoped to `src/pages/portal/**` + `src/components/portal/**` so the gate is real but bounded. **Verified:** `no-untranslated-jsx-text.js` flags only `JSXText` (no attribute coverage); `eslint.config.js` wires it `'warn'` (~1,684 pre-existing violations). `banned-tables.js` is the module-shape mirror to copy conventions from.

- [ ] **Step 1: Write the failing rule test (attribute literals)**

Append to the `invalid`/`valid` arrays in `eslint-rules/no-untranslated-jsx-text.test.js`:

```js
// invalid -- literal user-facing attribute values must route through t()
{ code: 'const A = () => <input placeholder="Search cases" />;', errors: [{ messageId: 'untranslatedAttr' }] },
{ code: 'const A = () => <button title="Close dialog" />;', errors: [{ messageId: 'untranslatedAttr' }] },
{ code: 'const A = () => <span aria-label="Loading" />;', errors: [{ messageId: 'untranslatedAttr' }] },
{ code: 'const A = () => <img alt="Device photo" />;', errors: [{ messageId: 'untranslatedAttr' }] },
// valid -- {t(...)} expression, empty, pure number/punctuation, and non-targeted attrs
{ code: "const A = () => <input placeholder={t('portal:search')} />;" },
{ code: 'const A = () => <input placeholder="" />;' },
{ code: 'const A = () => <input placeholder="123" />;' },
{ code: 'const A = () => <input name="email" />;' },          // not a user-facing attr
{ code: 'const A = () => <img alt={photo.name} />;' },        // dynamic
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test eslint-rules/no-untranslated-jsx-text.test.js`
Expected: FAIL — `untranslatedAttr` is an unknown messageId; attribute cases are not reported.

- [ ] **Step 3: Extend the rule with a `JSXAttribute` visitor**

In `eslint-rules/no-untranslated-jsx-text.js`: extract the existing entity-strip + `LETTER_RUN` predicate into a shared `isReportableText(str)` so `JSXText` and `JSXAttribute` use one predicate. Add `messages.untranslatedAttr`. Inspect only a fixed allowlist of user-facing attrs:

```js
const TRANSLATABLE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);
// inside create(context).return { ... }:
JSXAttribute(node) {
  if (!node.name || !TRANSLATABLE_ATTRS.has(node.name.name)) return;
  const v = node.value;
  if (!v || v.type !== 'Literal' || typeof v.value !== 'string') return; // skip {t(...)}, dynamic
  if (!isReportableText(v.value)) return;
  const preview = v.value.trim().slice(0, 40);
  context.report({ node, messageId: 'untranslatedAttr', data: { attr: node.name.name, text: preview } });
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test eslint-rules/no-untranslated-jsx-text.test.js`
Expected: PASS — all new attribute cases plus the original `JSXText` cases.

- [ ] **Step 5: Freeze the baseline (ratchet-down)**

Generate `eslint-rules/i18n-baseline.json` as the frozen set of every CURRENT violation `{file, line, messageId}` (the same pattern as the removed `tsc-baseline.count`). Produce deterministically: run `npx eslint . --format json` filtered to rule `xsuite/no-untranslated-jsx-text`, map each message to `{ file: relPath, line, messageId }`, sort, write. Commit the file.

- [ ] **Step 6: Write the failing baseline-suppression test, then implement suppression**

Add a RuleTester case passing `options: [{ baseline: { 'x.tsx': [{ line: 1, messageId: 'untranslated' }] } }]` asserting a baselined line is NOT reported but a new line IS. Run-to-fail (`baseline` option unknown → schema rejects). Then add `schema: [{ type: 'object', properties: { baseline: {} }, additionalProperties: false }]` and, in both visitors, suppress any violation whose `{file, line, messageId}` is in `options[0].baseline`. Run-to-pass.

- [ ] **Step 7: Flip the rule to error in `eslint.config.js`**

Import the baseline (`import i18nBaseline from './eslint-rules/i18n-baseline.json' with { type: 'json' }`, or `readFileSync`+`JSON.parse` matching the repo's existing JSON-import convention), then change:

```js
'xsuite/no-untranslated-jsx-text': ['error', { baseline: i18nBaseline }],
```

Verify: `echo 'export const X = () => <input placeholder="New string" />;' > /tmp/t.tsx && npx eslint /tmp/t.tsx` exits **1**; `npx eslint .` exits **0** (baseline absorbs the pre-existing set).

- [ ] **Step 8: Create the portal-scoped missing-key CI check**

Create `scripts/check-i18n-keys.sh` (required check): grep every `t('ns:key')` / `t("ns:key")` call site under `src/pages/portal/**` + `src/components/portal/**`, and assert each `ns:key` resolves for `fallbackLng='en'`. **Environment-aware source of truth:** if `i18n_translations` exists (Phase-1 landed), query it; else read the in-bundle `portal` namespace JSON committed in A3. Fail loud listing unresolved keys. It must exit 0 on `main` today (no portal `t()` calls yet).

- [ ] **Step 9: Add the `country-i18n` CI job**

In `.github/workflows/ci.yml` add a `country-i18n` job (required status check) running the baseline lint (`npx eslint .`) + `bash scripts/check-i18n-keys.sh`. Coordinate the required-check registration with the CI owner (cross-cutting standard #10). Verify both green on `main`.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(i18n): enforcement gate -- attr literals + frozen baseline + missing-key CI (portal-scoped)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A1 — Widen `Locale` to a config-driven string; data-hydrate RTL + `normalizeLang`

**Files:**
- Create: `src/lib/locale.test.ts`
- Modify: `src/lib/locale.ts`, `src/contexts/LocaleContext.tsx`
- (A1-hydrate) Create: `src/lib/languageService.ts`, `src/lib/languageService.test.ts`

> **Why:** `Locale = 'en'|'ar'` (`LocaleContext.tsx:10`) and `RTL_LANGUAGES={'ar'}` / `normalizeLang():'en'|'ar'` (`locale.ts:5,11`) compile-pin the product to two languages. **Verified:** there is no `src/types/locale.ts`; only 8 files consume `normalizeLang`/`isRTLLanguage`; the PDF `rtl.ts`/`labels.ts`/adapters have their own `LanguageCode` (out of this slice). The sweep targets only the UI-locale consumers.

#### A1-bootstrap (file-only, lands now)

- [ ] **Step 1: Write the failing test**

Create `src/lib/locale.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isRTLLanguage, normalizeLang, hydrateLanguages, SUPPORTED_LANGS, RTL_LANGS } from './locale';

describe('locale (config-driven)', () => {
  beforeEach(() => hydrateLanguages([{ code: 'en', is_rtl: false }, { code: 'ar', is_rtl: true }]));
  it('bootstrap RTL set still knows ar', () => expect(isRTLLanguage('ar')).toBe(true));
  it('normalizeLang returns a supported code, not a 2-literal union', () => {
    expect(normalizeLang('ar-OM')).toBe('ar');
    expect(normalizeLang('fr')).toBe('en');      // unsupported -> fallback while only en/ar hydrated
  });
  it('hydrateLanguages widens support + RTL from data (no redeploy)', () => {
    hydrateLanguages([{ code: 'en', is_rtl: false }, { code: 'he', is_rtl: true }, { code: 'fr', is_rtl: false }]);
    expect(isRTLLanguage('he')).toBe(true);
    expect(normalizeLang('fr')).toBe('fr');       // now supported
    expect(SUPPORTED_LANGS.has('fr')).toBe(true);
    expect(RTL_LANGS.has('he')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/locale.test.ts`
Expected: FAIL — `hydrateLanguages`/`SUPPORTED_LANGS`/`RTL_LANGS` not exported.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/locale.ts`:

```ts
// Mutable sets hydrated from geo_languages at runtime; {'en','ar'} is the
// in-bundle bootstrap (anti-flash + offline fallback). DO NOT re-pin to a union.
export const RTL_LANGS = new Set<string>(['ar']);
export const SUPPORTED_LANGS = new Set<string>(['en', 'ar']);
const FALLBACK_LANG = 'en';

export interface LanguageRow { code: string; is_rtl: boolean }
export function hydrateLanguages(rows: LanguageRow[]): void {
  if (!rows.length) return;                 // keep bootstrap if DB unreachable
  SUPPORTED_LANGS.clear(); RTL_LANGS.clear();
  for (const r of rows) { SUPPORTED_LANGS.add(r.code); if (r.is_rtl) RTL_LANGS.add(r.code); }
  if (!SUPPORTED_LANGS.has(FALLBACK_LANG)) SUPPORTED_LANGS.add(FALLBACK_LANG);
}
export function isRTLLanguage(lang: string): boolean { return RTL_LANGS.has(lang); }
export function normalizeLang(code?: string): string {
  if (!code) return FALLBACK_LANG;
  if (SUPPORTED_LANGS.has(code)) return code;
  const base = code.split('-')[0];
  return SUPPORTED_LANGS.has(base) ? base : FALLBACK_LANG;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/locale.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Widen the type + sweep UI-locale consumers**

In `LocaleContext.tsx`: replace the `'en'|'ar'` union at `:10` with `type Locale = string;` (`applyLocaleToDOM(lang: Locale)` already calls `isRTLLanguage(lang)` — unchanged). In the 8 `normalizeLang`/`isRTLLanguage` consumer files, replace each `locale === 'ar'` UI comparison with `isRTLLanguage(locale)` and each `=== 'en'` "is-default" check with `!isRTLLanguage(locale)`. **Leave PDF `rtl.ts`/`labels.ts`/adapters and `format.ts` alone** (separate `LanguageCode`, Track B/C). Run `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(i18n): config-driven Locale=string + data-hydrated RTL/normalizeLang (bootstrap)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

#### A1-hydrate (BLOCKED-ON migration `geo_languages`)

- [ ] **Step 7: Add `fetchActiveLanguages` + hydrate on mount**

Create `src/lib/languageService.ts` + `.test.ts`: `fetchActiveLanguages()` → `supabase.from('geo_languages').select('code,is_rtl,name,native_name,numbering_system').eq('is_active', true)`. In `LocaleContext.LocaleProvider`, on mount call `fetchActiveLanguages().then(hydrateLanguages)` before first paint-affecting state. Test: mock returns `he`; assert `isRTLLanguage('he')` true after hydrate. Banner: `// BLOCKED-ON: geo_languages (Phase 1 §5.1). Until applied, the {'en','ar'} bootstrap is the only data.` Commit `feat(i18n): hydrate Locale support set from geo_languages`.

### Task A2 — Collapse the two catalogs behind one tenant-language concept; donor ETL + lazy backend

**Files:**
- Create: `src/lib/i18nBackendService.ts`, `src/lib/i18nBackendService.test.ts`
- Modify: `src/lib/i18n.ts`
- (A2-seed) Create: `scripts/country-engine/seed-i18n-from-donor.ts`

> **Why:** two divergent catalogs (UI=2-lang in `i18n.ts`; PDF/doc=13-lang in `documentTranslations.ts`). Per spec §5.1 there is ONE DB-backed catalog (`i18n_translations`) serving both render targets; `documentTranslations.ts` is the **donor seed**. Bundled `en/ar` `common`/`ui`/`nav` stay in `i18n.ts` as anti-flash + offline fallback. **Verified:** `documentTranslations.ts` exports `DOCUMENT_TRANSLATIONS` (per-lang key→value maps) + `SUPPORTED_LANGUAGES`; `i18n.ts` `resources.en/.ar` carry `common`/`ui`/`nav`/`auth`/`stock`/`billing`/`featureGate`/`platformAdmin`.

#### A2-scaffold (file-only)

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18nBackendService.test.ts`: `loadNamespace('ar','portal')` returns a key map; an unknown `(lang,ns)` falls back to `en`; never throws.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/i18nBackendService.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the lazy backend**

Create `src/lib/i18nBackendService.ts`: `loadNamespace(lang, ns)` — if `i18n_translations` exists, `select value,key where language_code=lang and namespace=ns and deleted_at is null`; map to `{key:value}`; on empty/error fall back to `loadNamespace('en', ns)`; final fallback `{}`. Register an i18next lazy backend in `i18n.ts` (`partialBundledLanguages: true`) so `en/ar` `common`/`ui`/`nav` stay in-bundle and everything else lazy-loads. Keep `lng` reading the `xsuite_locale_hint` anti-flash hint (unchanged at `i18n.ts:1059`).

- [ ] **Step 4: Run test to verify it passes; tsc 0; commit**

Run: `npx vitest run src/lib/i18nBackendService.test.ts` → PASS; `npx tsc --noEmit` → 0. Commit `feat(i18n): lazy namespace backend with en fallback (scaffold)`.

#### A2-seed (BLOCKED-ON migration `i18n_translations`)

- [ ] **Step 5: Write the donor ETL**

Create `scripts/country-engine/seed-i18n-from-donor.ts` — idempotent ETL (upsert on `(language_code,namespace,key)`): `DOCUMENT_TRANSLATIONS` (13 langs) → `documents` namespace **with a key-mapping pass** so doc-shaped keys (`taxInvoice`, `quoteNo`) don't pollute `common`; `i18n.ts` `resources.en/.ar` `common`/`ui`/`nav` → those namespaces. Stamp `is_machine_translated=false, is_verified=false`. Dry-run mode prints the upsert plan. Banner: `// BLOCKED-ON: i18n_translations (Phase 1 §5.1).` Commit `feat(i18n): donor ETL seeding i18n_translations from documentTranslations + i18n.ts`.

### Task A3 — Portal vertical-slice extraction (the ONLY extraction in scope)

**Files:**
- Modify: all 9 `src/pages/portal/*.tsx` (`PortalLogin`, `PortalDashboard`, `PortalCases`, `PortalQuotes`, `PortalPayments`, `PortalReports`, `PortalCommunications`, `PortalSettings`, `PortalPurchasesPage`) + `src/components/layout/PortalLayout.tsx` nav labels + `src/lib/i18n.ts` (portal namespace resources)
- Create: `src/pages/portal/portal-i18n.test.tsx`

> **Why:** the portal is the only externally-visible non-English surface and the smallest bounded slice to prove the pipeline end-to-end. **Zero existing `t()` in portal today** (verified) — clean greenfield. **Verified literal counts (lint proxy):** PortalQuotes 18, PortalCases 14, PortalReports 13, PortalSettings 12, PortalPayments 10, PortalDashboard 9, PortalPurchasesPage 9, PortalCommunications 6, PortalLogin 5. `PortalLogin.tsx` is unauthenticated: `document.title='Sign In — Customer Portal'` (line 20), `"Customer Portal"`/`"Sign in to access your account"` (61–62), `placeholder="your.email@example.com"` (84), `placeholder="Enter your password"` (94), `"Forgot password?"`, `"Signing in..."`/`"Sign In"` (117).

- [ ] **Step 1: Write the failing test**

Create `src/pages/portal/portal-i18n.test.tsx`: render `PortalLogin` (and `PortalDashboard` with mocked `usePortalAuth`) inside `LocaleProvider` with `locale='ar'`; assert the Arabic value renders for a representative key (the sign-in heading) AND that `document.documentElement.dir === 'rtl'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/portal/portal-i18n.test.tsx`
Expected: FAIL — literals still English; no `t()`.

- [ ] **Step 3: Extract, page by page**

In each portal page add `import { useTranslation } from 'react-i18next'; const { t } = useTranslation();` then replace each flagged `JSXText`/`placeholder`/`title`/`aria-label`/`alt` literal with `t('portal:<key>')`. Naming: namespaced, hierarchical, page-scoped (`portal:login.heading`, `portal:login.emailPlaceholder`, `portal:quotes.empty`, `portal:nav.dashboard`). For `document.title` use `t('portal:login.tabTitle')`. Keep interpolation for dynamic counts (`portal:cases.count` with `{{count}}`).

- [ ] **Step 4: Add the `portal` namespace keys (EN + AR, human-verified)**

Land EN+AR for every extracted key BOTH as an in-bundle `portal` resource in `i18n.ts` (`resources.en.translation.portal` / `resources.ar.translation.portal`) AND staged for `i18n_translations` (the A2 seed picks them up once the table lands). AR strings are **human-verified** (`is_verified=true`-grade), not machine output. Do NOT machine-translate statutory/forensic portal copy (e.g. data-destruction consent) — flag any such string for the Q6 human-Arabic-review track.

- [ ] **Step 5: Ratchet the baseline down**

Regenerate `eslint-rules/i18n-baseline.json` (every now-extracted portal line drops out). Verify `npx eslint src/pages/portal` exits 0 and `bash scripts/check-i18n-keys.sh` exits 0 (every `portal:` key resolves for `en`).

- [ ] **Step 6: Run test to verify it passes; tsc 0; commit**

Run: `npx vitest run src/pages/portal/portal-i18n.test.tsx` → PASS; `npx tsc --noEmit` → 0. Commit `feat(i18n): extract portal slice into keyed i18next (en+ar verified, portal-first)`.

### Task A5 — Per-recipient portal language (Q3) — pure resolver now, wiring gated

**Files:**
- Create: `src/lib/customerLanguageService.ts`, `src/lib/customerLanguageService.test.ts`
- (wiring) Modify: `src/contexts/PortalAuthContext.tsx`, `src/contexts/LocaleContext.tsx`

> **Why:** Q3 locked PER-RECIPIENT. A3 renders in the **tenant** language; A5 adds the customer-level override so a GCC tenant serves an English corporate client and an Arabic individual. **Verified:** `customers_enhanced.preferred_language` does NOT exist; `PortalCustomer`/`PortalSession` (`PortalAuthContext.tsx:8,18`) have no language field; `isValidPortalCustomer` (`:46`) would need it added; `authenticate_portal_customer` must return it.

- [ ] **Step 1: Write the failing test (pure resolver, file-only NOW)**

Create `src/lib/customerLanguageService.test.ts`: `resolveCustomerLanguage({ preferred, sessionLang, tenantDefault, countryLanguage })` — each rung wins in order; all-null → `'en'`; `'ar-OM'` normalizes via `normalizeLang`.

- [ ] **Step 2: Run to fail → Step 3: implement the chain → Step 4: run to pass**

Implement Q3's chain in `src/lib/customerLanguageService.ts`: `customers_enhanced.preferred_language → session last explicit switch → tenant default → geo_countries.language_code (via country_id) → 'en'`. Run `npx vitest run src/lib/customerLanguageService.test.ts` → PASS.

- [ ] **Step 5: Commit the pure function**

```bash
git commit -m "feat(i18n): customer-language resolution chain (Q3 per-recipient, pure resolver)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: BLOCKED-ON `customers_enhanced.preferred_language` — wire the override**

Add `preferred_language` to `PortalCustomer` + `isValidPortalCustomer` + `PortalSession`; have `authenticate_portal_customer` return it; in `LocaleProvider`, when a portal session exists, feed `resolveCustomerLanguage(...)` as `effectiveLang` instead of tenant-only `normalizeLang(config.locale.languageCode)`. Q3 residual (owner's call): portal in-app switch write-back to `customers_enhanced.preferred_language` vs session-only — default **write-back**, gated behind the migration. Banner: `// BLOCKED-ON: customers_enhanced.preferred_language (Q3 stream).`

---

## Area 2 — Multi-currency closure + base reporting (Track B)

> **Scope guardrail.** This area carries D7/D8 (read-side base rollups) + the gap-table write-path closure (`stock_sales`/`payroll_records`/`purchase_orders`/`receipts`) + the EUR-on-OMR reconciliation release-gate. It **consumes** Migrations 1–5 and the existing seams `currencyService.resolveRateContext`, `financialMath.{convertToBase,baseAmount,roundMoney}`. It does **not** own the tax engine, the PDF country layer (Track C), or the default-flip sequencing.

> **Verified live ground-truth (introspected, supersedes stale spec anchors):**
> 1. `get_base_currency()` already exists (Phase 0) — do not re-create.
> 2. **D7 read-side is already base-aware:** `reportsDashboardRollup.ts` exports `sumBase()`; `ReportsDashboard.tsx:246-247,281,334` use it. The **one residual raw-sum straggler** is `expensesByCategory` at `ReportsDashboard.tsx:307` (`categoryCounts[name] += expense.amount || 0`), whose query at `:294` doesn't even select `amount_base`.
> 3. **D8 read helper exists** — `financialReportsService.ts:7 sumBankBalanceBase()` reads `current_balance_base`/`opening_balance_base`; Migration 5 supplies those columns.
> 4. **`stock_sales` + `receipts` write through RPCs** (`record_stock_sale`, `create_receipt_with_allocations`) — base snapshotting is DB-side inside the RPC. The TS resolver path applies only to client-insert writers: `PurchaseOrderFormModal` (PO) + `payrollService` (payroll_records).
> 5. Live data is tiny + base-uniform (2 OMR tenants; stock_sales=0, purchase_orders=0, payroll_records=0, receipts=6, bank_accounts=2) → backfill is exact (`*_base = round(amount, base_dp)`, `exchange_rate=1`).
> 6. Canonical seams: `financialMath.convertToBase(amount, rate, baseDp)`, `baseAmount(row, field)`, `resolveRateContext(docCurrency, onDate, override?) → {documentCurrency, documentDecimals, baseCurrency, baseDecimals, rate, rateSource}`. Reference writer = `invoiceService.ts:399-450`.

### Group C0 — D7 straggler (pure code, no schema; ships first)

#### Task C0.1 — Fix the `expensesByCategory` raw-sum straggler (D7)

**Files:**
- Modify: `src/pages/financial/reportsDashboardRollup.ts`, `src/pages/financial/ReportsDashboard.tsx:288-312`
- Create: `src/pages/financial/reportsDashboardRollup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `reportsDashboardRollup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumBase, groupSumBase } from './reportsDashboardRollup';

describe('groupSumBase (D7 -- category rollups must sum base)', () => {
  it('sums amount_base per group, not raw amount', () => {
    const rows = [
      { amount: 100, amount_base: 38, cat: 'A' },   // EUR 100 @ OMR rate
      { amount: 50, amount_base: 19, cat: 'A' },
      { amount: 10, amount_base: 10, cat: 'B' },     // OMR (unity)
    ];
    const out = groupSumBase(rows, 'amount', (r) => String(r.cat));
    expect(out).toEqual({ A: 57, B: 10 });           // NOT 150 / 10
  });
  it('falls back to raw for legacy rows missing _base', () => {
    expect(groupSumBase([{ amount: 7, cat: 'X' }], 'amount', (r) => String(r.cat))).toEqual({ X: 7 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/financial/reportsDashboardRollup.test.ts`
Expected: FAIL — `groupSumBase` is not exported.

- [ ] **Step 3: Implement `groupSumBase`**

Append to `reportsDashboardRollup.ts`:

```ts
/** D7 -- group-and-sum the base-currency shadow per key. Same base-fallback as sumBase. */
export function groupSumBase<T extends Record<string, unknown>>(
  rows: T[], field: string, keyOf: (row: T) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows || []) {
    const k = keyOf(r);
    out[k] = (out[k] ?? 0) + baseAmount(r as never, field as never);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/financial/reportsDashboardRollup.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Wire the dashboard**

In `ReportsDashboard.tsx`: (a) add `groupSumBase` to the `./reportsDashboardRollup` import; (b) at `:294` add `amount_base` to the select (`.select('amount, amount_base, category:master_expense_categories(name)')`); (c) replace the `:301-308` manual loop with `const categoryCounts = groupSumBase(data || [], 'amount', (e) => e.category?.name || 'Uncategorized');` (drop the now-unused accumulator + `forEach`). Keep the return shape `Record<string, number>` so the chart consumer is untouched.

- [ ] **Step 6: tsc 0; commit**

Run `npx tsc --noEmit` → 0. Commit `fix(reports): D7 -- expensesByCategory sums base currency via groupSumBase`.

### Group C1 — D8 bank-balance base rollup (consumes Migration 5)

#### Task C1.1 — Backfill assertion + indicative-base read proof for `bank_accounts` (D8)

**Files:**
- Modify: `src/lib/financialReportsService.test.ts`
- Verify-only on live DB

> Migration 5 adds `bank_accounts.{exchange_rate, rate_source, opening_balance_base, current_balance_base}` and backfills (`*_base = round(balance, base_dp)`, `exchange_rate=1`, `rate_source='derived'` for the 2 base-currency rows). `sumBankBalanceBase` already reads the `_base` columns. This task **proves** the column feeds the rollup and adds the regression test the helper never had.

- [ ] **Step 1: Verify the migration landed (read-only SQL via `execute_sql`, project `ssmbegiyjivrcwgcqutu`)**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='bank_accounts'
  AND column_name IN ('current_balance_base','opening_balance_base','exchange_rate','rate_source')
ORDER BY 1;   -- expect 4 rows
SELECT count(*) FILTER (WHERE current_balance_base IS NULL) AS unbackfilled FROM bank_accounts WHERE deleted_at IS NULL;  -- expect 0
```

- [ ] **Step 2: Write the regression test**

Add to `financialReportsService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sumBankBalanceBase } from './financialReportsService';

describe('sumBankBalanceBase (D8 -- indicative base across currencies)', () => {
  it('sums the _base column when present (never the raw multi-currency balance)', () => {
    const rows = [
      { current_balance: 1000, current_balance_base: 380 },  // EUR @ OMR
      { current_balance: 500, current_balance_base: 500 },   // OMR base
    ];
    expect(sumBankBalanceBase(rows, 'current_balance')).toBe(880); // NOT 1500
  });
  it('falls back to raw for rows predating the base columns', () => {
    expect(sumBankBalanceBase([{ current_balance: 250 }], 'current_balance')).toBe(250);
  });
});
```

- [ ] **Step 3: Run the test (characterization)**

Run: `npx vitest run src/lib/financialReportsService.test.ts`. The helper already exists → these PASS immediately; this pins the contract (the migration is the "implementation" the test guards). For strict red-first, write the test against a not-yet-added field name, watch it fail, then correct to the real field.

- [ ] **Step 4: tsc 0; commit**

Run `npx tsc --noEmit` → 0. Commit `test(reports): D8 -- pin sumBankBalanceBase indicative-base contract`.

#### Task C1.2 — Bank-balance "indicative base" read-time conversion (live position, never frozen)

**Files:**
- Modify: `src/lib/financialReportsService.ts` (`generateCashFlowReport`), `src/pages/financial/ReportsDashboard.tsx`
- Test: `src/lib/financialReportsService.test.ts`

> A balance is a live position; the backfill seeds a snapshot, but on read the dashboard must label it indicative so a non-base bank account doesn't silently mislead.

- [ ] **Step 1: Write the failing test**

Assert `generateCashFlowReport` returns `closingBalanceIsIndicative: true` when any bank row currency ≠ base. Mock supabase per the existing harness in `financialReportsService.test.ts`.

- [ ] **Step 2: Run to fail → Step 3: implement**

In `generateCashFlowReport`, select `currency` (the pre-existing column) alongside balances; set `closingBalanceIsIndicative = rows.some(r => r.currency && r.currency !== base)` (additive optional field on the return type). Use `currencyService.getBaseCurrency()` for `base`.

- [ ] **Step 4: Wire the UI label**

In `ReportsDashboard.tsx` render an "indicative base" badge next to the closing-balance figure when the flag is set (use `Badge` variant `info`; tokens only — no raw colors, per cross-cutting #6).

- [ ] **Step 5: Run to pass; tsc 0; commit**

Commit `feat(reports): D8 -- label bank closing balance as indicative when multi-currency`.

### Group C2 — Gap-table write-path closure (consumes Migrations 1–4)

> **Split by write mechanism.** PO + payroll = client-side inserts → resolve in TS via `resolveRateContext` + `convertToBase`. `stock_sales` + `receipts` = RPCs → base computed DB-side inside the RPC; this group ASSERTS it end-to-end and wires the TS callers to pass `currency`/`rate_override` through.

#### Task C2.1 — Purchase-order base snapshot (client-insert writer)

**Files:**
- Create: `src/lib/purchaseOrderBase.ts`, `src/lib/purchaseOrderBase.test.ts`
- Modify: `src/components/suppliers/PurchaseOrderFormModal.tsx:140-200`, `src/lib/importExportService.ts`

- [ ] **Step 1: Write the failing test**

Create `purchaseOrderBase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPoBaseColumns } from './purchaseOrderBase';

describe('buildPoBaseColumns', () => {
  it('freezes subtotal/tax/discount/total into base at the rate, rounded to base decimals', () => {
    const rc = { documentCurrency: 'EUR', documentDecimals: 2, baseCurrency: 'OMR', baseDecimals: 3, rate: 0.42, rateSource: 'derived' as const };
    const out = buildPoBaseColumns({ subtotal: 100, tax_amount: 15, discount_amount: 5, total_amount: 110 }, rc);
    expect(out).toEqual({
      currency: 'EUR', exchange_rate: 0.42, rate_source: 'derived',
      subtotal_base: 42, tax_amount_base: 6.3, discount_amount_base: 2.1, total_amount_base: 46.2,
    });
  });
  it('is identity at rate 1 (single-currency tenant) at base decimals', () => {
    const rc = { documentCurrency: 'OMR', documentDecimals: 3, baseCurrency: 'OMR', baseDecimals: 3, rate: 1, rateSource: 'derived' as const };
    const out = buildPoBaseColumns({ subtotal: 100, tax_amount: 5, discount_amount: 0, total_amount: 105 }, rc);
    expect(out.total_amount_base).toBe(105);
    expect(out.exchange_rate).toBe(1);
  });
});
```

> **Note:** Migration 3 also adds `shipping_cost_base` to `purchase_orders`. If the PO totals include shipping, extend `buildPoBaseColumns` input + output with `shipping_cost`/`shipping_cost_base` (add a matching test row) — keep the helper's field set aligned with the columns the migration shipped.

- [ ] **Step 2: Run to fail** (import unresolved).

- [ ] **Step 3: Implement `purchaseOrderBase.ts`**

```ts
import { convertToBase } from './financialMath';
import type { RateContext } from './currencyService';

export function buildPoBaseColumns(
  t: { subtotal: number; tax_amount: number; discount_amount: number; total_amount: number },
  rc: RateContext,
) {
  return {
    currency: rc.documentCurrency, exchange_rate: rc.rate, rate_source: rc.rateSource,
    subtotal_base: convertToBase(t.subtotal, rc.rate, rc.baseDecimals),
    tax_amount_base: convertToBase(t.tax_amount, rc.rate, rc.baseDecimals),
    discount_amount_base: convertToBase(t.discount_amount, rc.rate, rc.baseDecimals),
    total_amount_base: convertToBase(t.total_amount, rc.rate, rc.baseDecimals),
  };
}
```

- [ ] **Step 4: Run to pass** (2 passed).

- [ ] **Step 5: Wire `PurchaseOrderFormModal`**

In the submit handler (`:160-200`): before building the insert/update payload, `const rc = await resolveRateContext(formData.currency ?? undefined, poDate, formData.exchange_rate ? { rate: formData.exchange_rate } : null);` then spread `...buildPoBaseColumns(totals, rc)` into the persisted object. **Also fix the hardcoded `tax = subtotal * 0.15` at `:141`** — read the rate from `useTaxConfig().rate`. Add a currency selector + live base-equivalent preview (mirror the invoice modal). `formatCurrency` is already used (no `$` literal), so D14 here is just the selector + preview.

- [ ] **Step 6: Wire the `importExportService` PO writer**

Use the same `buildPoBaseColumns` call (base currency, rate 1 for imports lacking a currency).

- [ ] **Step 7: tsc 0; commit**

Commit `feat(po): C2 -- purchase orders carry frozen rate + *_base (resolveRateContext)`.

#### Task C2.2 — Payroll-record base snapshot (client-insert writer)

**Files:**
- Create: `src/lib/payrollBase.ts`, `src/lib/payrollBase.test.ts`
- Modify: `src/lib/payrollService.ts:346-425`

- [ ] **Step 1: Write the failing test**

`payrollBase.test.ts`: `buildPayrollBaseColumns({ total_earnings, total_deductions, net_salary }, rc)` returns `{ currency, exchange_rate, rate_source, total_earnings_base, total_deductions_base, net_salary_base }` — frozen at base decimals; identity at rate 1.

> **Field-name note:** Migration 2 shipped `net_salary_base` (not `overtime_amount_base`). The helper output uses `net_salary_base` to match the column the migration actually created.

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement `payrollBase.ts`**

Same shape as C2.1, fields `total_earnings`/`total_deductions`/`net_salary` → `total_earnings_base`/`total_deductions_base`/`net_salary_base`, via `convertToBase(..., rc.baseDecimals)`, plus `currency`/`exchange_rate`/`rate_source` from `rc`.

- [ ] **Step 4: Run to pass.**

- [ ] **Step 5: Wire `payrollService`**

In `processPayroll` (`:338-425`): resolve ONE `rc` per run before the employee loop — `const rc = await resolveRateContext(settings.currency?.code ?? undefined, period.end_date, null);` — and spread `...buildPayrollBaseColumns({ total_earnings: totalEarnings, total_deductions: totalDeductions, net_salary: netSalary }, rc)` into each `records.push({...})` (`:393-406`). This touches the **same lines as D5** (`socialSecurityRate` at `:352,389`) but **keep the D5 rules-engine replacement out of this slice** (Phase 3) — add only the currency columns; leave the flat-rate math for the Phase-3 task.

- [ ] **Step 6: tsc 0; commit**

Commit `feat(payroll): C2 -- payroll_records carry currency + *_base (resolveRateContext)`.

#### Task C2.3 — `stock_sales` + `receipts` RPC base snapshot (DB-side; assert end-to-end)

**Files:**
- Modify: `src/lib/stockService.ts:489-508`, `src/lib/receiptsService.ts:39-51`

> The RPCs compute base via `get_base_currency()` and an effective-dated rate inside the txn, persisting `currency`/`exchange_rate`/`rate_source`/`*_base` (stock) and `currency_code`/`amount_base` (receipts). This task asserts the contract from TS and threads the optional override through the wrappers.

- [ ] **Step 1: Verify the RPC contract (read-only SQL)**

```sql
SELECT proname, pg_get_functiondef(oid) ILIKE '%get_base_currency%' AS uses_base
FROM pg_proc WHERE proname IN ('record_stock_sale','create_receipt_with_allocations');  -- expect uses_base = true
```

If either returns `uses_base = false`, the RPC body was not extended — **escalate to the program lead** (Migration 1/4 add columns only; extending the RPC body is a separate migration owed before this task proceeds).

- [ ] **Step 2: Thread currency through the wrappers**

`stockService.createStockSale`: add `currency?: string` + `exchange_rate?: number` to the input type, pass into `p_sale`. `receiptsService.createReceiptWithAllocations`: add `currency_code?: string` to `ReceiptInput`, pass into `p_receipt`. Defaults `null` → RPC resolves base. Per `receiptsService.ts:28-30`, foreign-currency invoices route to the payments path — keep that constraint (receipts stay base-only unless the RPC was extended; if not, only add the `currency_code` passthrough and leave the base-only guard).

- [ ] **Step 3: tsc 0; commit**

Commit `feat(currency): C2 -- thread currency through stock-sale + receipt RPC wrappers`.

### Group C3 — Lint invariant (durable defense)

#### Task C3.1 — `no-raw-currency-aggregation` ESLint rule + registration

**Files:**
- Create: `eslint-rules/no-raw-currency-aggregation.js` + its test fixture
- Modify: `eslint.config.js`; CI `country-lint` job (cross-area — coordinate per #10)

- [ ] **Step 1: Write the failing rule test**

Use the repo's existing eslint-rule test harness (mirror `eslint-rules/banned-tables.js` tests). A `.reduce((s,r)=>s+r.total_amount,0)` / `+= row.amount` over an identifier in `{amount,total_amount,amount_paid,balance_due,current_balance,opening_balance,subtotal,tax_amount,discount_amount,total_earnings,total_deductions,net_salary}` **without** a sibling `_base` access or `baseAmount(`/`sumBase(`/`groupSumBase(`/`sumBankBalanceBase(` reference in the same callback → ERROR. A `_base` sum or a `baseAmount(` call → OK.

- [ ] **Step 2: Implement the AST rule**

Flag `BinaryExpression +` / `AssignmentExpression +=` whose RHS member-access property is in the money set, when no base sibling is referenced in the enclosing function.

- [ ] **Step 3: Allowlist single-row display sites**

Via an inline-disable convention: `// eslint-disable-next-line no-raw-currency-aggregation -- single-currency row display`.

- [ ] **Step 4: Register + run**

Register in `eslint.config.js`; run `npx eslint src/` → it should flag any residual raw aggregations (there should be **none** after C0/C1; a flagged site is a found bug — fix it, don't disable).

- [ ] **Step 5: Deliverable + commit**

Produce a table of every aggregation site with disposition (`base-fixed` / `single-currency-asserted`). Commit `feat(lint): no-raw-currency-aggregation -- base-only cross-document sums`.

### Group C4 — RELEASE GATE: EUR-on-OMR end-to-end reconciliation

#### Task C4.1 — EUR document on an OMR tenant reconciles to the penny (integration test)

**Files:**
- Create: `src/lib/__tests__/eurOnOmrReconciliation.test.ts`

> The area's release criterion. Until green, multi-currency is NOT claimed done. Vitest integration test against a seeded test tenant (OMR base, 3 decimals; EUR active; seeded `exchange_rates`). Use the existing integration-test harness; if none, gate behind a `RUN_DB_TESTS` env so CI runs it against a branch DB.

- [ ] **Step 1: Write the gate test asserting ALL of:**
  1. **Invoice freeze:** EUR invoice for €1,234.567 → row has `currency='EUR'`, `exchange_rate>0`, `rate_source='derived'`, and `total_amount_base = convertToBase(total_amount, exchange_rate, 3)` at OMR's 3 decimals (use `financialMath.convertToBase` as the oracle).
  2. **Payment reconciliation:** partial EUR payment → `SUM(payment.amount_base) == invoice.amount_paid_base` to the 3rd decimal.
  3. **D13 guard:** `amountInWords` renders OMR with 3-decimal baisa (not `/100`) — assert via the amountInWords seam; if not yet landed, assert the decimals param threads through.
  4. **D7 guard:** dashboard P&L total (`sumBase(invoices,'amount_paid')`) equals the base sum, not the raw EUR sum.
  5. **D8 guard:** `sumBankBalanceBase` over a mixed-currency bank set equals the base sum.
  6. **Tenant-override path:** when a `tenant_exchange_rate_overrides` row matches (if that landed), `rate_source='tenant_override'`; else assert `rate_source='derived'` and leave override as a documented follow-up.
  7. **Timezone boundary:** FX `rate_date` resolved off the document **date** (not `now()`); a doc dated on a weekend carries-forward the most-recent on/before rate (assert `currencyService.usdRate` carry-forward).

- [ ] **Step 2: Run; fix any real failures** (a failure here is a genuine end-to-end defect — debug via systematic-debugging, do not weaken the assertion).

- [ ] **Step 3: Commit**

Commit `test(currency): C4 -- EUR-on-OMR end-to-end reconciliation gate (release criterion)`.

> **Track B phasing:** C0 (immediately) → C1 (after Migration 5) → C2 (after Migrations 1–4) → C3 (after C0–C2, so it flags nothing real) → **C4 last, blocks the release.** The §6.5 default-flip (`'USD'` → `get_base_currency()`) is **out of this slice** — it depends on `seed_new_tenant` seeding `tenant_currencies` first and belongs to the Phase-1 onboarding/C-track.

---

## Area 3 — Reporting + country-routed PDFs (Track C)

> **Scope guard.** Inserts a *derived* COUNTRY/jurisdiction layer into the PDF template cascade (one override, not 195 templates), threads tenant/country `date_format` into every PDF adapter via a config-aware wrapper, adds per-(legal_entity, doc_type) template variant resolution reusing the existing version/deploy machinery, and wires localized notification templates + a `locale` param through `send-document-email` (caller renders; the edge function stays a relay). It does **NOT** build the tax engine, statutory filing, or address rendering (other phases).
>
> **Invariants:** `applyOverride(base, undefined)` is identity; the country override is **derived from resolved statutory facts, never authored** and never a UI toggle; PDFs stay non-themed (`PDF_COLORS` untouched); tax *label* comes through the §3c `geo_country_tax_rates` resolver with the `geo_countries.tax_label` scalar as fallback-only; `send-document-email` stays a dumb relay (only optional `locale` threaded for audit); ZATCA QR routes via `tax_system='VAT' AND code='SA'` (reuse `shouldEmitZatcaQr`).
>
> **Verified live-schema facts:** `geo_countries` has `code`, `tax_label`, `tax_invoice_required boolean`, `tax_system`, `date_format`, `decimal_places int`, `language_code`, `country_config jsonb`, `config_version int`. There is **NO** `geo_countries.is_rtl` and **NO** `zatca_required` → RTL derives from `language_code` via `isRTLLanguage()`, ZATCA routes off `tax_system`+`code`. `decimal_places` is the per-country minor-unit column. `resolveTemplateConfig(builtIn, theme?, docType?, instance?)` is 4-positional. `getDeployedVersionByType(documentType)` takes only a string today. `formatDate` lives in `src/lib/pdf/utils.ts` and takes a date-fns format string; `geo_countries.date_format` is stored UPPERCASE (`'MM/DD/YYYY'`) which is **not** valid date-fns — a token converter is mandatory.

### Task R0 — Prerequisite check (no code)

Before any task that reads a new column/table, run this read-only check via `mcp__supabase__execute_sql` (project `ssmbegiyjivrcwgcqutu`). A column/table at 0 means that task's migration is owed first (operator applies via `apply_migration`, regen types). Record the result in the PR description; do not stub absent columns.

```sql
SELECT
 (SELECT count(*) FROM information_schema.columns WHERE table_name='geo_countries' AND column_name IN ('country_config','config_version','tax_label','tax_invoice_required','date_format','decimal_places','tax_system','code','language_code')) AS geo_cols,        -- expect 9
 (SELECT count(*) FROM information_schema.tables  WHERE table_name='geo_country_tax_rates') AS tax_rates_tbl,                 -- expect 1; if 0, R2/R3 use geo_countries.tax_label scalar fallback only
 (SELECT count(*) FROM information_schema.columns WHERE table_name='document_template_versions' AND column_name IN ('legal_entity_id','business_unit_id')) AS dtv_scope_cols, -- expect 2 for R5/R6
 (SELECT count(*) FROM information_schema.tables  WHERE table_name='master_notification_templates') AS mnt_tbl,              -- expect 1 for R10 country/global fallback
 (SELECT count(*) FROM information_schema.columns WHERE table_name='customers_enhanced' AND column_name='preferred_language') AS pref_lang_col; -- expect 1 for R9 first rung
```

### Group A — Config-aware date formatting (threads `date_format` into every adapter; §8d)

> 11 hardcoded `formatDate(x, 'dd MMM yyyy' | 'dd/MM/yyyy …')` sites across 7 adapters (invoiceAdapter ×3, quoteAdapter ×3, paymentReceiptAdapter ×2, receiptAdapter ×1, reportAdapter ×2, caseLabelAdapter ×1, chainOfCustodyAdapter ×4). The fix is a config-aware wrapper threaded through the render context.

#### Task A1 — `toDateFnsFormat` — convert a stored country date format to a date-fns pattern

**Files:**
- Create: `src/lib/pdf/configDate.ts`, `src/lib/pdf/configDate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/configDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDateFnsFormat } from './configDate';

describe('toDateFnsFormat', () => {
  it('maps stored uppercase country formats to date-fns tokens', () => {
    expect(toDateFnsFormat('MM/DD/YYYY')).toBe('MM/dd/yyyy');
    expect(toDateFnsFormat('DD/MM/YYYY')).toBe('dd/MM/yyyy');
    expect(toDateFnsFormat('YYYY-MM-DD')).toBe('yyyy-MM-dd');
    expect(toDateFnsFormat('DD-MM-YYYY')).toBe('dd-MM-yyyy');
  });
  it('falls back to dd MMM yyyy for an empty/unknown stored format (current PDF default)', () => {
    expect(toDateFnsFormat(null)).toBe('dd MMM yyyy');
    expect(toDateFnsFormat('')).toBe('dd MMM yyyy');
    expect(toDateFnsFormat('garbage')).toBe('dd MMM yyyy');
  });
  it('passes through an already-valid date-fns pattern unchanged', () => {
    expect(toDateFnsFormat('dd MMM yyyy')).toBe('dd MMM yyyy');
  });
});
```

- [ ] **Step 2: Run to fail.** `npx vitest run src/lib/pdf/configDate.test.ts` → cannot resolve `./configDate`.

- [ ] **Step 3: Implement**

Create `src/lib/pdf/configDate.ts`:

```ts
/** PDF default when a tenant/country supplies no date format. Matches today's
 *  hardcoded 'dd MMM yyyy' so untouched tenants are byte-identical. */
export const DEFAULT_PDF_DATE_FNS = 'dd MMM yyyy';

const KNOWN: Record<string, string> = {
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
  'DD-MM-YYYY': 'dd-MM-yyyy',
  'DD MMM YYYY': 'dd MMM yyyy',
};

/** Convert a stored `geo_countries.date_format` (uppercase CLDR-ish tokens) into a
 *  date-fns pattern. Unknown/empty -> the PDF default. An already-valid date-fns
 *  pattern (lowercase d/y present) passes through unchanged. */
export function toDateFnsFormat(stored: string | null | undefined): string {
  const raw = (stored ?? '').trim();
  if (!raw) return DEFAULT_PDF_DATE_FNS;
  const upper = raw.toUpperCase();
  if (KNOWN[upper]) return KNOWN[upper];
  if (/[dy]/.test(raw)) return raw; // already date-fns-shaped
  return DEFAULT_PDF_DATE_FNS;
}
```

- [ ] **Step 4: Run to pass.** `npx vitest run src/lib/pdf/configDate.test.ts` → PASS.

- [ ] **Step 5: tsc 0; commit**

```bash
git checkout -b feat/country-pdf-date-format
git commit -m "feat(pdf): toDateFnsFormat -- convert stored country date_format to date-fns tokens (§8d)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

#### Task A2 — `fmtDateWithConfig` — a date-fns wrapper taking a resolved time pattern

**Files:**
- Modify: `src/lib/pdf/configDate.ts`, `src/lib/pdf/configDate.test.ts`

- [ ] **Step 1: Extend the test**

```ts
import { fmtDateWithConfig } from './configDate';

describe('fmtDateWithConfig', () => {
  const d = '2026-03-09T14:05:00.000Z';
  it('formats a date with the resolved country pattern', () => {
    expect(fmtDateWithConfig(d, { dateFormat: 'DD/MM/YYYY' })).toBe('09/03/2026');
    expect(fmtDateWithConfig(d, { dateFormat: 'MM/DD/YYYY' })).toBe('03/09/2026');
  });
  it('appends a HH:mm time suffix when withTime is set, after the configured date', () => {
    const out = fmtDateWithConfig(d, { dateFormat: 'DD/MM/YYYY' }, { withTime: true });
    expect(out.startsWith('09/03/2026 ')).toBe(true);
    expect(/\d{2}:\d{2}$/.test(out)).toBe(true);
  });
  it('uses the PDF default when no config is supplied (back-compat)', () => {
    expect(fmtDateWithConfig(d, undefined)).toBe('09 Mar 2026');
  });
  it('returns "-" for a null date (parity with formatDate)', () => {
    expect(fmtDateWithConfig(null, { dateFormat: 'DD/MM/YYYY' })).toBe('-');
  });
});
```

- [ ] **Step 2: Run to fail** (`fmtDateWithConfig` not exported).

- [ ] **Step 3: Implement** — append to `configDate.ts`:

```ts
import { formatDate } from './utils';

/** The slice of the resolved date config a PDF adapter needs. */
export interface PdfDateConfig {
  dateFormat?: string | null;
}

/** Format a date for a PDF using the resolved tenant/country date format.
 *  `withTime` appends ' HH:mm'. Falls back to today's 'dd MMM yyyy' default when
 *  no config is threaded -- so an un-wired call site is unchanged. */
export function fmtDateWithConfig(
  date: string | Date | null | undefined,
  config: PdfDateConfig | undefined,
  opts?: { withTime?: boolean },
): string {
  const base = toDateFnsFormat(config?.dateFormat);
  const pattern = opts?.withTime ? `${base} HH:mm` : base;
  return formatDate(date, pattern);
}
```

- [ ] **Step 4: Run to pass; tsc 0; commit** `feat(pdf): fmtDateWithConfig wrapper -- resolved date format + optional HH:mm (§8d)`.

#### Task A3 — Thread a `locale` group onto the engine config

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts`, `src/lib/pdf/templateConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { resolveTemplateConfig, BUILT_IN_TEMPLATE_CONFIGS } from './templateConfig';

describe('locale group (date format + numbering) on the config', () => {
  it('is absent on built-in defaults (neutral/legacy)', () => {
    expect(BUILT_IN_TEMPLATE_CONFIGS.invoice.locale).toBeUndefined();
  });
  it('an override layer can set the resolved date format', () => {
    const cfg = resolveTemplateConfig(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      undefined, undefined,
      { locale: { dateFormat: 'DD/MM/YYYY' } },
    );
    expect(cfg.locale?.dateFormat).toBe('DD/MM/YYYY');
  });
});
```

- [ ] **Step 2: Run to fail** (`locale` not on the config types).

- [ ] **Step 3: Implement** — in `templateConfig.ts` add:

```ts
/** Resolved locale slice threaded by applyTenantLocale (§8d/§8g). Absent =
 *  today's neutral PDF default (date 'dd MMM yyyy', Western grouping). */
export interface LocaleConfig {
  dateFormat?: string;
  groupingStyle?: 'standard' | 'indian';
  decimalPlaces?: number;
}
```

Add `locale?: LocaleConfig;` to both `DocumentTemplateConfig` and `TemplateConfigOverride`. In `applyOverride`, add `locale: mergeGroup(base.locale, override.locale),` (reuses the existing `mergeGroup` shallow-merge — absent layers stay absent).

> **`decimalPlaces` note:** included here so the R1 country override (which threads `decimalPlaces` onto `locale`) type-checks without a follow-up edit.

- [ ] **Step 4: Run to pass; tsc 0; commit** `feat(pdf): optional locale group (dateFormat/groupingStyle/decimalPlaces) on template config (§8d)`.

#### Task A4 — `applyTenantLocale` — extend `applyTenantLanguage` to set the resolved date format

**Files:**
- Create: `src/lib/pdf/engine/applyTenantLocale.ts`, `src/lib/pdf/engine/applyTenantLocale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { applyTenantLocale } from './applyTenantLocale';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { CompanySettingsData } from '../types';

const settings = {} as CompanySettingsData; // english-only path

describe('applyTenantLocale', () => {
  it('preserves applyTenantLanguage behaviour (english-only by default)', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(out.language.mode).toBe('en');
  });
  it('stamps the resolved date format onto config.locale', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(out.locale?.dateFormat).toBe('DD/MM/YYYY');
  });
  it('is non-mutating (input config untouched)', () => {
    applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, { dateFormat: 'DD/MM/YYYY' });
    expect(BUILT_IN_TEMPLATE_CONFIGS.invoice.locale).toBeUndefined();
  });
  it('leaves locale absent when no resolved locale is supplied (back-compat)', () => {
    const out = applyTenantLocale(BUILT_IN_TEMPLATE_CONFIGS.invoice, settings, undefined);
    expect(out.locale).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to fail** (cannot resolve `./applyTenantLocale`).

- [ ] **Step 3: Implement**

```ts
import { applyTenantLanguage } from './applyTenantLanguage';
import type { CompanySettingsData } from '../types';
import type { DocumentTemplateConfig, LocaleConfig } from '../templateConfig';

/** Compose applyTenantLanguage (language/RTL) with the resolved locale slice
 *  (date format + grouping). Non-mutating. `resolvedLocale` is read from the
 *  tenant/country config by the caller (pdfService) so this stays pure. */
export function applyTenantLocale(
  config: DocumentTemplateConfig,
  companySettings: CompanySettingsData,
  resolvedLocale: LocaleConfig | undefined,
): DocumentTemplateConfig {
  const withLanguage = applyTenantLanguage(config, companySettings);
  if (!resolvedLocale) return withLanguage;
  return { ...withLanguage, locale: { ...withLanguage.locale, ...resolvedLocale } };
}
```

- [ ] **Step 4: Run to pass; tsc 0; commit** `feat(pdf): applyTenantLocale -- compose language + resolved date format (§8d)`.

#### Task A5 — Switch each adapter's hardcoded `formatDate(...)` to `fmtDateWithConfig(date, config.locale, ...)`

**Files (one commit per adapter — 7 commits):** `invoiceAdapter.ts`, `quoteAdapter.ts`, `paymentReceiptAdapter.ts`, `receiptAdapter.ts`, `reportAdapter.ts`, `caseLabelAdapter.ts`, `chainOfCustodyAdapter.ts` (all under `src/lib/pdf/engine/adapters/`). Each adapter already receives `config: DocumentTemplateConfig`.

- [ ] **Per adapter, Step 1: Write the failing test.** Example for `invoiceAdapter` (add to `invoiceParity.test.ts`):

```ts
it('formats the invoice date with the resolved country date format', () => {
  const cfg = { ...BUILT_IN_TEMPLATE_CONFIGS.invoice, locale: { dateFormat: 'DD/MM/YYYY' } };
  const data = makeInvoiceData({ invoice_date: '2026-03-09' }); // existing test helper
  const engine = toEngineData(data, cfg);
  const dateRow = engine.meta.find((m) => m.label.en === 'Invoice Date:');
  expect(dateRow?.value).toBe('09/03/2026');
});
```

- [ ] **Per adapter, Step 2: Run to fail** (still emits `'09 Mar 2026'`). **Step 3: Swap the call sites** to `fmtDateWithConfig(..., config.locale)` (date) / `{ withTime: true }` (datetime). The QR-payload date strings (`invoiceAdapter:286`, `paymentReceiptAdapter:127`, `quoteAdapter:206`) also switch. Import `fmtDateWithConfig` from `'../../configDate'`. **Step 4: Run to pass. Step 5: tsc 0. Step 6: Commit per adapter**, e.g. `refactor(pdf): invoiceAdapter dates via fmtDateWithConfig (config-driven, §8d)`. Repeat for the other 6.

#### Task A6 — ESLint guard `no-hardcoded-pdf-dateformat` (durable defense, §8d)

**Files:**
- Create: `eslint-rules/no-hardcoded-pdf-dateformat.js` (+ fixture test)
- Modify: `eslint.config.js`

- [ ] **Step 1: Write the failing fixture/test** asserting the rule flags `formatDate(x, 'dd MMM yyyy')` and passes `fmtDateWithConfig(x, config.locale)`. **Step 2: Run to fail. Step 3: Implement** the rule modeled on `eslint-rules/banned-tables.js` — ban a literal date-format string (heuristic `/[A-Za-z]*(MMM|yyyy|YYYY|dd|DD|MM)[/ -]?/` on a string-literal arg to `formatDate(`) anywhere under `src/lib/pdf/**` except `configDate.ts` and `*.test.ts`. **Step 4: Run to pass. Step 5: Register** in `eslint.config.js` as `'warn'`, then flip to `'error'` once A5 has cleared all 11 sites (`npx eslint src/lib/pdf` = 0). **Step 6: Commit** `feat(lint): no-hardcoded-pdf-dateformat -- bans literal date strings in src/lib/pdf (§8d)`.

### Group B — Country/jurisdiction layer in the PDF template cascade (§8b)

#### Task R1 — `countryTemplateOverride` — derive a `TemplateConfigOverride` from resolved country facts (pure)

**Files:**
- Create: `src/lib/pdf/engine/countryConfig.ts`, `src/lib/pdf/engine/countryConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { countryTemplateOverride, type ResolvedCountryFacts } from './countryConfig';

const OMAN: ResolvedCountryFacts = {
  code: 'OM', taxSystem: 'VAT', taxLabel: 'VAT', taxInvoiceRequired: true,
  languageCode: 'ar', decimalPlaces: 3, dateFormat: 'DD/MM/YYYY',
};
const UK: ResolvedCountryFacts = {
  code: 'GB', taxSystem: 'VAT', taxLabel: 'VAT', taxInvoiceRequired: true,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'DD/MM/YYYY',
};
const US: ResolvedCountryFacts = {
  code: 'US', taxSystem: 'SALES_TAX', taxLabel: 'Sales Tax', taxInvoiceRequired: false,
  languageCode: 'en', decimalPlaces: 2, dateFormat: 'MM/DD/YYYY',
};

describe('countryTemplateOverride (§8b)', () => {
  it('emits the resolved tax label so the VAT line is country-correct (D9)', () => {
    expect(countryTemplateOverride(US).labels?.taxLabel).toEqual({ en: 'Sales Tax' });
    expect(countryTemplateOverride(OMAN).labels?.taxLabel).toEqual({ en: 'VAT' });
  });
  it('enables the tax bar only when a tax invoice is required AND system is VAT (D11)', () => {
    expect(countryTemplateOverride(OMAN).taxBar?.enabled).toBe(true);
    expect(countryTemplateOverride(US).taxBar?.enabled).toBe(false);
  });
  it('switches to bilingual-stacked + arabic-lead for an RTL country', () => {
    const ov = countryTemplateOverride(OMAN);
    expect(ov.language?.mode).toBe('bilingual_stacked');
    expect(ov.language?.primary).toBe('ar');
  });
  it('keeps English LTR for a non-RTL country (no language override)', () => {
    expect(countryTemplateOverride(UK).language).toBeUndefined();
  });
  it('threads the country date format onto config.locale (§8d hand-off)', () => {
    expect(countryTemplateOverride(UK).locale?.dateFormat).toBe('DD/MM/YYYY');
  });
  it('threads decimal places onto config.locale for money/amountInWords (D13)', () => {
    expect(countryTemplateOverride(OMAN).locale?.decimalPlaces).toBe(3);
  });
});
```

- [ ] **Step 2: Run to fail** (cannot resolve `./countryConfig`).

- [ ] **Step 3: Implement**

```ts
import { isRTLLanguage } from '../../locale';
import type { TemplateConfigOverride } from '../templateConfig';

/** Resolved statutory/format facts the country layer needs. Read by the caller
 *  from geo_countries (+ the §3c geo_country_tax_rates resolver for the
 *  effective-dated tax_label) -- this mapper never touches the DB. */
export interface ResolvedCountryFacts {
  code: string;                    // ISO alpha-2
  taxSystem: string | null;        // 'VAT' | 'GST' | 'SALES_TAX' | 'NONE'
  taxLabel: string | null;         // resolved label (rate-row first, scalar fallback)
  taxInvoiceRequired: boolean;
  languageCode: string | null;     // drives RTL via isRTLLanguage
  decimalPlaces: number | null;    // minor-unit (3 OMR/KWD/BHD, 0 JPY)
  dateFormat: string | null;       // stored 'DD/MM/YYYY' etc.
}

/** Map resolved country facts -> a derived (NOT authored) template override that
 *  slots into the cascade between built-in and theme. One override, not 195
 *  templates (locked blind-spot decision). */
export function countryTemplateOverride(facts: ResolvedCountryFacts): TemplateConfigOverride {
  const override: TemplateConfigOverride = {};

  // D9 -- resolved tax label drives the VAT line.
  if (facts.taxLabel) override.labels = { taxLabel: { en: facts.taxLabel } };

  // D11 -- VAT identification bar on only when a tax invoice is required AND VAT.
  if (facts.taxInvoiceRequired && facts.taxSystem === 'VAT') override.taxBar = { enabled: true };

  // RTL country -> bilingual-stacked, Arabic-lead.
  if (facts.languageCode && isRTLLanguage(facts.languageCode)) {
    override.language = { mode: 'bilingual_stacked', primary: 'ar' };
  }

  // §8d/§8g -- thread date format + minor-units onto the locale slice.
  const locale: NonNullable<TemplateConfigOverride['locale']> = {};
  if (facts.dateFormat) locale.dateFormat = facts.dateFormat;
  if (facts.decimalPlaces != null) locale.decimalPlaces = facts.decimalPlaces;
  if (Object.keys(locale).length > 0) override.locale = locale;

  return override;
}
```

> ZATCA TLV stays in the adapter via the existing `shouldEmitZatcaQr({taxSystem, countryCode})` — the override only flips `taxBar.enabled`; do not duplicate ZATCA routing here. `LocaleConfig.decimalPlaces` was added in Task A3, so this type-checks without a follow-up.

- [ ] **Step 4: Run to pass; tsc 0; commit**

```bash
git checkout -b feat/country-pdf-cascade-layer
git commit -m "feat(pdf): countryTemplateOverride -- derive template override from country facts (§8b, D9/D11)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

#### Task R2 — Insert the COUNTRY layer into the cascade

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts`, `src/lib/pdf/templateConfig.test.ts`

> **Back-compat is the whole game.** A new positional param between `builtIn` and `theme` would shift 17 call sites. Use **Option A (lowest blast radius):** keep `resolveTemplateConfig` unchanged; add `resolveTemplateConfigWithCountry(builtIn, country, theme?, docType?, instance?)` that applies the country override then delegates. `pdfService` switches to the new fn; the old fn + its 9 test sites are untouched.

- [ ] **Step 1: Write the failing test**

```ts
import { resolveTemplateConfigWithCountry, BUILT_IN_TEMPLATE_CONFIGS } from './templateConfig';

describe('country layer in the cascade (§8b)', () => {
  it('applies the country override beneath theme/doc-type (most-specific still wins)', () => {
    const cfg = resolveTemplateConfigWithCountry(
      BUILT_IN_TEMPLATE_CONFIGS.invoice,
      { taxBar: { enabled: true }, labels: { taxLabel: { en: 'Sales Tax' } } }, // country
      undefined,                                                                 // theme
      { labels: { taxLabel: { en: 'VAT' } } },                                   // docType wins over country
      undefined,                                                                 // instance
    );
    expect(cfg.taxBar?.enabled).toBe(true);             // from country
    expect(cfg.labels.taxLabel).toEqual({ en: 'VAT' }); // doc-type wins over country
  });
  it('country undefined is identity (existing behaviour preserved)', () => {
    const a = resolveTemplateConfigWithCountry(BUILT_IN_TEMPLATE_CONFIGS.invoice, undefined);
    const b = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS.invoice);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run to fail** (`resolveTemplateConfigWithCountry` not exported).

- [ ] **Step 3: Implement** — add after `resolveTemplateConfig`:

```ts
/** Resolve with a derived COUNTRY layer beneath theme (§8b): the cascade is
 *  built-in -> country -> theme -> doc-type -> instance. `country` undefined =
 *  identity, so all existing call sites are unaffected. */
export function resolveTemplateConfigWithCountry(
  builtIn: DocumentTemplateConfig,
  country?: TemplateConfigOverride,
  theme?: TemplateConfigOverride,
  docType?: TemplateConfigOverride,
  instance?: TemplateConfigOverride,
): DocumentTemplateConfig {
  const withCountry = applyOverride(builtIn, country);
  return resolveTemplateConfig(withCountry, theme, docType, instance);
}
```

- [ ] **Step 4: Run to pass; tsc 0; commit** `feat(pdf): country layer in template cascade -- built-in -> country -> theme -> doc-type -> instance (§8b)`.

#### Task R3 — `getResolvedCountryFacts` — the single DB read for the override

**Files:**
- Create: `src/lib/pdf/countryFactsService.ts`, `src/lib/pdf/countryFactsService.test.ts`

> Reads `geo_countries` (off the resolving entity's/tenant's `country_id`) and, when `geo_country_tax_rates` exists, the effective-dated row for `tax_label`/rate as-of the document date (§3c — resolver is the binding path, the scalar is fallback-only). Returns `ResolvedCountryFacts`. Mock supabase per the repo's `vi.mock('./supabaseClient')` pattern.

- [ ] **Step 1: Write the failing test** asserting: (a) maps a `geo_countries` row to `ResolvedCountryFacts`; (b) prefers the effective-dated rate-row `tax_label` over the scalar when `geo_country_tax_rates` returns a row for the doc date; (c) falls back to `geo_countries.tax_label` scalar when no rate row (or table absent); (d) returns `null` (fail-soft, caller skips the country layer) when `country_id` is null — **never fabricates a US default**. **Step 2: Run to fail. Step 3: Implement** using `maybeSingle()` (never `single()`). **Step 4: Run to pass; tsc 0. Step 5: Commit** `feat(pdf): getResolvedCountryFacts -- single country-facts read for the PDF override (§8b/§3c)`.

#### Task R4 — Wire the country layer + locale into all `pdfService` build paths

**Files:**
- Modify: `src/lib/pdf/pdfService.ts` (8 `build*ViaEngine` fns + `resolveSignatureImagesConfig`); extend/add a focused `pdfService` test

> Per build fn: read `getResolvedCountryFacts(...)` once (off the doc's resolving entity → tenant `country_id`), derive `countryTemplateOverride(facts)`, pass it as the `country` arg to `resolveTemplateConfigWithCountry`, then call `applyTenantLocale(resolvedConfig, data.companySettings, facts ? { dateFormat: facts.dateFormat } : undefined)` in place of `applyTenantLanguage`. Resolution failures fall back to built-in (existing `try/catch`) — **the country layer must never break generation.**

- [ ] **Per build fn, Step 1: Write the failing test** asserting a country-routed config flows through (e.g. an OMR invoice renders the bilingual taxBar; a UK invoice renders English LTR with the `VAT` label). **Step 2: Run to fail. Step 3: Minimal edit** (replace `resolveTemplateConfig(BUILT_IN…, undefined, docType, undefined)` with `resolveTemplateConfigWithCountry(BUILT_IN…, countryOverride, undefined, docType, undefined)` and swap `applyTenantLanguage`→`applyTenantLocale`). **Step 4: Run to pass; tsc 0. Step 5: Commit per logical group** (financial docs, intake docs, custody/report).
- [ ] **Step 6: Full PDF suite regression.** `npx vitest run src/lib/pdf` → all green (parity tests guard byte-compat for the single-OMR baseline); `npx tsc --noEmit` → 0.

### Group C — Per-(legal_entity, doc_type) template variant resolution (§8c)

#### Task R5 — (migration owed — operator applies) `document_template_versions` scope columns

**Additive, via `apply_migration`** (name `document_template_versions_scope_columns`): `ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id)`, `ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES branches(id)`, plus partial unique `uq_template_deployed_scope ON document_template_versions(template_id, coalesce(legal_entity_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_deployed AND deleted_at IS NULL`. Both nullable → existing rows collapse to the tenant default. After apply: regen `database.types.ts`, append manifest, `bash scripts/check-schema-drift.sh` clean. This task's code is **blocked on R0 showing `dtv_scope_cols=2`.**

#### Task R6 — `getDeployedVersionByType` gains an optional scope

**Files:**
- Modify: `src/lib/documentTemplateService.ts`, `src/lib/documentTemplateService.test.ts`

> Extend to `getDeployedVersionByType(documentType, scope?: { legalEntityId?: string; businessUnitId?: string })`. Resolution order (most specific first, each falling through): `(entity, BU)` → `(entity, NULL)` → `(NULL, NULL)` tenant default. Existing single-arg callers resolve the tenant default exactly as today.

- [ ] **Step 1: Write the failing test** (mock the template query layer): (a) no scope → tenant default; (b) `{legalEntityId}` with a deployed entity-scoped version → that version; (c) `{legalEntityId}` with no entity-scoped version → tenant default; (d) `{legalEntityId, businessUnitId}` prefers the BU-scoped row over the entity-scoped row. **Step 2: Run to fail. Step 3: Implement** (query by template, order by specificity, `maybeSingle()`). **Step 4: Run to pass; tsc 0. Step 5: Commit** `feat(templates): getDeployedVersionByType resolves per-(legal_entity,business_unit) scope (§8c)`.
- [ ] **Note (deferred per §8c):** the variant *picker UI* in Report Studio is out of scope — logic + storage ship now; the author UI is a fast-follow once a second legal entity exists.

#### Task R7 — Thread the resolving entity's `country_id` through `getResolvedCountryFacts`

**Files:**
- Modify: `src/lib/pdf/pdfService.ts` (+ `countryFactsService.ts` if the lookup key changes), test

> When a doc carries a `legal_entity_id` (additive nullable FK, present on invoices/quotes/cases once M-E lands), `getResolvedCountryFacts` resolves off the **entity's** `country_id`, not the tenant's. When no entity is set, it resolves off tenant `country_id` exactly as R3. **Blocked on M-E** (`invoices.legal_entity_id` etc.) — until then, resolve off tenant `country_id` only, gating the entity path behind R0 confirming the column exists.

- [ ] TDD: failing test (entity country wins over tenant country when entity set) → impl → pass → commit `feat(pdf): resolve country facts off the document's legal entity when set (§8c)`.

### Group D — Localized notification templates + `send-document-email` locale param (§5.6, §3i, Q3)

#### Task R8 — (migration owed — operator applies, see R0) `master_notification_templates` global overlay

> Global table (no `tenant_id`; SELECT `true`, write `is_platform_admin()`): `event_type, channel, locale, country_id uuid REFERENCES geo_countries(id) NULL (=global default), subject_template, body_template NOT NULL, link_template`, `deleted_at`, unique `(event_type, channel, locale, coalesce(country_id,'00000000-0000-0000-0000-000000000000'::uuid))`. **This is an OVERLAY over the existing tenant-scoped `notification_templates` (Migration 6's table) — not a replacement.** Resolution: tenant override → country default → global default → coded fallback. Apply via `apply_migration` (`add_master_notification_templates`), regen types, manifest, drift clean. Code tasks below are **blocked on R0 showing `mnt_tbl=1`.**

#### Task R9 — `resolveCustomerLanguage` — the per-recipient locale chain (Q3)

**Files:**
- Create: `src/lib/notificationLanguage.ts`, `src/lib/notificationLanguage.test.ts`

> Pure function; chain = `customers_enhanced.preferred_language → portal-session last explicit switch → tenant default → geo_countries.language_code (via country_id) → 'en'`. **Blocked on R0 showing `pref_lang_col=1`** for the first rung; the rest work today.
>
> **Naming note:** Track A's Task A5 ships a `resolveCustomerLanguage` in `src/lib/customerLanguageService.ts` keyed `{ preferred, sessionLang, tenantDefault, countryLanguage }`. This Track-C version lives in `src/lib/notificationLanguage.ts` keyed `{ customerPref, sessionPref, tenantDefault, countryLang }` for the notification path. If both tracks ship, **consolidate onto the A5 implementation** and have `notificationLanguage.ts` re-export it (adapting the param names) — do not maintain two divergent chains. Flag the dedup to the program lead.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveCustomerLanguage } from './notificationLanguage';

describe('resolveCustomerLanguage (Q3 per-recipient chain)', () => {
  it('prefers the customer explicit preference', () => {
    expect(resolveCustomerLanguage({ customerPref: 'ar', sessionPref: 'en', tenantDefault: 'en', countryLang: 'ar' })).toBe('ar');
  });
  it('falls back to session, then tenant, then country, then en', () => {
    expect(resolveCustomerLanguage({ sessionPref: 'fr', tenantDefault: 'en', countryLang: 'ar' })).toBe('fr');
    expect(resolveCustomerLanguage({ tenantDefault: 'en', countryLang: 'ar' })).toBe('en');
    expect(resolveCustomerLanguage({ countryLang: 'ar' })).toBe('ar');
    expect(resolveCustomerLanguage({})).toBe('en');
  });
  it('ignores blank/whitespace candidates', () => {
    expect(resolveCustomerLanguage({ customerPref: '  ', countryLang: 'ar' })).toBe('ar');
  });
});
```

- [ ] **Step 2: Run to fail → Step 3: implement → Step 4: run to pass**

```ts
export interface LanguageCandidates {
  customerPref?: string | null;
  sessionPref?: string | null;
  tenantDefault?: string | null;
  countryLang?: string | null;
}
/** Resolve the per-recipient comms language (Q3). First non-blank candidate
 *  walking customer -> session -> tenant -> country -> 'en'. */
export function resolveCustomerLanguage(c: LanguageCandidates): string {
  for (const v of [c.customerPref, c.sessionPref, c.tenantDefault, c.countryLang]) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return 'en';
}
```

- [ ] **Step 5: tsc 0; commit** `feat(notifications): resolveCustomerLanguage -- per-recipient comms locale chain (Q3)`.

#### Task R10 — `resolveNotificationTemplate` — the tenant → country → global → coded cascade (§3i/§5.6)

**Files:**
- Create: `src/lib/notificationTemplateService.ts`, `src/lib/notificationTemplateService.test.ts`

> Resolves `{ subject_template, body_template, link_template }` for `(event_type, channel, locale, country_id)`. Order: tenant override (`notification_templates` where `tenant_id = current`, matching `locale`/`template_key`) → country default (`master_notification_templates` where `country_id = tenant country`) → global default (`master_notification_templates` where `country_id IS NULL`) → coded English fallback. **Statutory/forensic events** (data-destruction certificate, checkout receipt, NDA) must require verified rows and fall back to English (§5.6) — encode as an `isStatutory` flag forcing the English fallback when no verified localized row exists. Mock supabase; `maybeSingle()` throughout.

- [ ] TDD: failing tests for each cascade rung + the statutory-English-fallback rule → impl → pass → commit `feat(notifications): resolveNotificationTemplate -- tenant/country/global/coded cascade (§3i/§5.6)`.

#### Task R11 — `send-document-email` accepts an optional `locale` (relay-only passthrough + audit, Q3)

**Files:**
- Modify: `supabase/functions/send-document-email/index.ts` + the caller that builds its payload

> The edge function **stays a dumb relay** — the caller renders subject/body at the resolved recipient locale (R9 + R10) before invoking. The only edge change: add optional `locale?: string` to `SendEmailRequest`, and pass it into the `log_case_communication` RPC call (`:292`) as `p_locale` so "which language did we send this in?" is forensically auditable. **Do NOT add template rendering to the edge function.** The `log_case_communication` RPC gaining a nullable `p_locale` param is a tiny additive migration (operator) — gate behind R0 / confirm the RPC signature first with `\df log_case_communication`.

- [ ] **Step 1: Write the test against the caller** (edge functions are excluded from the app tsconfig + not vitest-covered): assert the caller threads `locale: resolveCustomerLanguage(...)` into the request body. **Step 2: Run to fail. Step 3: Add `locale`** to the request interface + the caller payload + `p_locale` in the edge fn's `log_case_communication` call. **Step 4: Run to pass; `npx tsc --noEmit` → 0. Step 5: Commit** `feat(notifications): thread recipient locale through send-document-email (relay + audit, Q3)`.

---

## Exit criteria

The whole of Phase 2 is done when **all** of the following hold:

- **i18n gate is PR-blocking on the portal.** `no-untranslated-jsx-text` is `'error'` on a frozen `eslint-rules/i18n-baseline.json` covering `JSXText` + `placeholder`/`title`/`aria-label`/`alt`; `scripts/check-i18n-keys.sh` + the `country-i18n` CI job are green; a **new** untranslated literal under `src/pages/portal/**` fails CI.
- **The portal renders non-English.** `Locale` is `string` (no `'en'|'ar'` union); RTL/`normalizeLang` are data-hydrated; the portal slice is fully extracted (EN+AR human-verified) and a non-English tenant renders the portal in its language with the correct `dir`. The per-recipient resolver exists as a tested pure function (DB wiring gated on `customers_enhanced.preferred_language`).
- **Gap tables carry FX/base.** `stock_sales`, `payroll_records`, `purchase_orders`, `receipts`, and `bank_accounts` each carry `currency`/`currency_code` + `exchange_rate`/`rate_source` + the `*_base` shadow; every gap-table writer persists them on new rows (backfill exact for the 2 OMR tenants — 0 non-unity document rows).
- **EUR-on-OMR reconciles to the penny.** `eurOnOmrReconciliation.test.ts` (the release gate) is green: invoice freeze, EUR payment reconciliation, D13 3-decimal `amountInWords`, D7/D8 base guards, and the document-date FX boundary all hold.
- **`baseAmount` is the only aggregation path.** Every cross-document aggregation sums `*_base` (lint-enforced by `no-raw-currency-aggregation`, with the aggregation-site checklist delivered); the D8 bank rollup reads real `*_base` columns with an indicative-base label.
- **`resolveTemplateConfig`'s country layer drives `tax_label`/QR/decimals.** The derived `countryTemplateOverride` (never authored, no `if (country===...)` branch outside `src/lib/country/**`) flows through `resolveTemplateConfigWithCountry`: tax label, VAT/ZATCA bar (`tax_invoice_required AND tax_system='VAT'` for the bar; `tax_system='VAT' AND code='SA'` for the QR via `shouldEmitZatcaQr`), and `decimal_places` are country-correct; every PDF adapter dates via `fmtDateWithConfig` (no literal date-format string remains in `src/lib/pdf/engine/adapters/**`; `no-hardcoded-pdf-dateformat` at `'error'`); PDFs stay non-themed (`PDF_COLORS`/`deviceIconMapper.ts` untouched; single-OMR parity preserved).
- **tsc 0 + vitest green.** `npx tsc --noEmit` → 0 errors (CI `typecheck` gate); `npx vitest run` green (notably `src/lib/pdf`, `src/lib/notificationLanguage.test.ts`, `src/lib/notificationTemplateService.test.ts`, `src/lib/__tests__/eurOnOmrReconciliation.test.ts`, and the portal i18n test); `bash scripts/check-schema-drift.sh` clean with `database.types.ts` regenerated (never hand-edited) for every applied migration.

---

## Deferred breadth

Flagged, **not designed here** — re-open against the triggers below:

| Deferred item | Why deferred | Re-open trigger |
|---|---|---|
| **Full-app i18n extraction (slices 2–5: `documents`, `cases`, `financial`, `settings`/`platformAdmin`/`hr`)** — ~400–600 unique keys (~1,684 raw lint nodes) | Breadth, not difficulty; per-slice burndown grind. The portal slice proves the pipeline; the rest is same-recipe PRs, one namespace per PR, baseline ratchets each time. | After the portal slice merges + the gate holds. |
| Localized transactional email / notifications (verified-only statutory strings) | Depends on `master_notification_templates` + Q3 recipient locale; `send-document-email` stays a relay. | When `master_notification_templates` lands + the first non-en/ar template is translated. |
| `format.ts` consolidation (D18) + `amountInWords` minor-units (D13) deep work | Multi-currency display polish beyond the gap-table closure. | Track B follow-up. |
| Translation TMS / MT supply (Crowdin + DeepL/Google, Q6) | Procurement/legal decision; custody strings need human Arabic review. Portal AR strings are hand-verified, so the slice doesn't block on it. | When slices 2–5 hit the non-donor long tail. |
| CLDR-sourced `geo_languages` population (~all countries) | Reference-data load (Q1) owned by the geo-population track; A1-hydrate consumes the table whatever its row count. | Phase 1 geo-population. |
| Statutory report builders / VAT201 PDF (§8e), address rendering (§8g), Report Studio per-entity variant picker UI (§8c), server-side per-(template,locale) rendering in `send-document-email` | Hard-gated behind D1 / CLDR address population / a 2nd legal entity / the PDF-template-engine work. Logic/storage ship now where applicable; the author UI and statutory builders are fast-follows. | Their respective gates. |
