# xSuite — Multi-Currency Architecture

**Status:** Design proposal
**Author:** Systems architecture review
**Context:** Tenants onboard globally. A **base (home/reporting) currency per tenant is mandatory**; tenants may **add multiple transaction currencies** and invoice/quote/receive/expense in them. Must be production-grade and scale.

---

## 1. Current state (verified against the live schema)

| Area | Today | Problem for multi-currency |
|---|---|---|
| Tenant currency | `tenants.currency_code` (NOT NULL, default `USD`) + symbol + `decimal_places` | One currency. No base/supported model. |
| Document currency | `invoices/quotes/payments/expenses/financial_transactions/bank_accounts` each have `currency TEXT default 'USD'` | A label only — no rate, no base value attached. |
| Money columns | **all `numeric(12,2)`** | Scale hardwired to 2 dp → can't represent JPY (0 dp) or BHD/KWD/OMR (3 dp) precisely. |
| Exchange rates | **none** | No way to convert. |
| Base amounts | **none** | Reports `SUM()` raw amounts across currencies → **silently wrong** the moment >1 currency exists. |
| Aggregation | `financialReportsService` fetch-all-then-reduce in JS | Already a scale risk; multi-currency makes raw JS summing definitively incorrect. |

**The single most important architectural fact:** today the system *can* tag a document with a currency string but has no concept of converting or rolling up across currencies. Adding multi-currency is therefore not "a field" — it's a money-model change.

---

## 2. The three decisions that define the architecture

### Decision A — Functional-currency accounting model (base + transaction)
Adopt the standard ERP model:
- **Base currency** = the tenant's functional/reporting currency. Every figure a tenant sees in dashboards, P&L, totals-across-documents is in base.
- **Transaction (document) currency** = the currency a specific invoice/quote/payment/expense is denominated in.
- **Every financial document stores BOTH**: the amount in its transaction currency *and* the equivalent in base currency, using the exchange rate **captured and frozen at the document's date**.

> Why store base amounts on the row (not convert at read time)? Because historical reports must be **stable and fast**. If you convert on read, last year's revenue changes every time the rate moves, and every report does N conversions. Snapshotting the base amount at write time makes aggregation a plain `SUM(total_amount_base)` — correct, deterministic, and index-friendly. This is the keystone scalability decision.

### Decision B — Money storage: widen `numeric`, don't switch to minor-units (yet)
Two industry-standard options:

| Option | Pros | Cons | Verdict for xSuite |
|---|---|---|---|
| **Integer minor-units (`BIGINT`)** — store fils/cents, exponent from currency | No float/scale ambiguity; fintech-grade | Rewrites *every* money column's type **and semantics**; every read/write/format/`financialMath` call changes; large, risky migration | **Defer.** Correct, but a disproportionate rewrite for the current stage. |
| **Widen `numeric` → `numeric(19,4)`** | Additive `ALTER TYPE`; keeps decimal semantics; handles 0–4 dp currencies; minimal call-site change | Not "infinite precision"; 4 dp ceiling (fine for ISO 4217) | **Recommended.** Pragmatic, safe, scalable. |

**Recommendation:** widen to `numeric(19,4)`. Scale 4 covers every ISO-4217 currency (max 3 dp) plus rate-multiplication headroom; precision 19 covers trillions. Keep `financialMath` decimal-based but make rounding **currency-aware** (round to the currency's `decimal_places`, not a hardcoded 2). Revisit minor-units only if the product later needs sub-cent / crypto precision.

### Decision C — Rates are a shared, snapshotted resource
- A **global** `exchange_rates` table (platform-managed) is the source of truth, refreshed by a scheduled edge function — **never** fetched from a provider on the request path.
- A document **snapshots** its rate at creation, so after creation it needs neither the rates table nor the provider.
- Tenants may **override** the rate per document (manual entry) with provenance recorded.

---

## 3. Data model (concrete, additive)

### 3.1 Reference data (global)
```sql
-- master_currency_codes already exists; ensure it carries:
--   code text PK (ISO 4217, e.g. 'USD','BHD','JPY'), name, symbol,
--   decimal_places int NOT NULL,        -- 0 (JPY), 2 (USD), 3 (BHD)
--   is_active bool NOT NULL default true
-- Seed all active ISO-4217 currencies with correct decimal_places.

CREATE TABLE exchange_rates (
  id            uuid PRIMARY KEY default gen_random_uuid(),
  base_currency text NOT NULL REFERENCES master_currency_codes(code),  -- pivot, e.g. 'EUR'
  quote_currency text NOT NULL REFERENCES master_currency_codes(code),
  rate          numeric(20,10) NOT NULL,     -- quote per 1 base
  rate_date     date NOT NULL,
  source        text NOT NULL default 'provider',  -- 'provider' | 'manual' | 'derived'
  provider      text,                          -- 'frankfurter' | 'ecb' | 'openexchangerates'
  fetched_at    timestamptz NOT NULL default now(),
  UNIQUE (base_currency, quote_currency, rate_date, source)
);
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates (quote_currency, base_currency, rate_date DESC);
```
- Global (not tenant-scoped). **RLS:** `SELECT USING (true)` for authenticated; `INSERT/UPDATE` by `is_platform_admin()` **and** the ingestion edge function (service role). No `tenant_id`.
- Store against **one pivot** currency (e.g. EUR — what ECB/Frankfurter publish). Any pair `A→B` is derived `rate(EUR→B) / rate(EUR→A)`. This keeps the table O(currencies × days), not O(currencies² × days).

### 3.2 Tenant currency model (tenant-scoped)
```sql
ALTER TABLE tenants
  ADD COLUMN base_currency_code text REFERENCES master_currency_codes(code);
-- backfill: UPDATE tenants SET base_currency_code = currency_code;
-- then SET NOT NULL. (currency_code remains as the display alias of base.)

CREATE TABLE tenant_currencies (
  id            uuid PRIMARY KEY default gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES master_currency_codes(code),
  is_base       boolean NOT NULL default false,
  is_active     boolean NOT NULL default true,
  display_order int NOT NULL default 0,
  deleted_at    timestamptz,
  UNIQUE (tenant_id, currency_code)
);
-- exactly one is_base=true per tenant (partial unique index):
CREATE UNIQUE INDEX uq_tenant_base_currency
  ON tenant_currencies (tenant_id) WHERE is_base AND deleted_at IS NULL;
CREATE INDEX idx_tenant_currencies_tenant ON tenant_currencies(tenant_id) WHERE deleted_at IS NULL;
-- RLS: standard RESTRICTIVE tenant isolation + set_tenant_and_audit trigger.
```
Onboarding inserts the base row (`is_base=true`); adding a transaction currency inserts another row.

### 3.3 Per-document columns (additive on each financial table)
For `invoices`, `quotes`, `payments`, `expenses`, `financial_transactions` (and analogous):
```sql
-- keep existing `currency` as the document/transaction currency (rename intent: document_currency)
ALTER TABLE invoices
  ADD COLUMN exchange_rate      numeric(20,10) NOT NULL default 1,   -- doc_currency -> base, frozen at doc date
  ADD COLUMN rate_source        text NOT NULL default 'derived',     -- 'provider'|'manual'|'derived'
  ADD COLUMN subtotal_base      numeric(19,4),
  ADD COLUMN tax_amount_base    numeric(19,4),
  ADD COLUMN total_amount_base  numeric(19,4),
  ADD COLUMN amount_paid_base   numeric(19,4),
  ADD COLUMN balance_due_base   numeric(19,4);
-- widen the transaction-currency money columns:
ALTER TABLE invoices ALTER COLUMN subtotal      TYPE numeric(19,4),
                     ALTER COLUMN tax_amount    TYPE numeric(19,4),
                     ALTER COLUMN total_amount  TYPE numeric(19,4),
                     ALTER COLUMN amount_paid   TYPE numeric(19,4),
                     ALTER COLUMN balance_due   TYPE numeric(19,4);
-- backfill: exchange_rate=1, *_base = raw amount (today doc_currency == base for all rows).
```
**Invariant:** `*_base = round(* * exchange_rate, base.decimal_places)`, computed once at write time.

### 3.4 Bank accounts
Each bank account is **single-currency** (an account is in one currency). Multi-currency = multiple accounts. Use the existing `bank_accounts.currency` (+ wire the unused `currency_id`). Transfers between accounts of different currencies are themselves FX events (Phase 2).

---

## 4. Exchange-rate ingestion

```
                 ┌───────────────────────────────┐
  pg_cron /      │ edge fn: sync-exchange-rates   │   daily 00:15 UTC
  Supabase   ──▶ │  - currencies = union(active   │ ───▶ provider (Frankfurter/ECB free,
  schedule       │    tenant_currencies)          │       openexchangerates as fallback)
                 │  - upsert pivot rates (EUR→X)  │ ◀───
                 │  - source='provider'           │
                 └───────────────────────────────┘
                              │ idempotent upsert
                              ▼
                       exchange_rates  ──(read, cached 24h in TanStack Query)──▶ document creation
```
- **Provider abstraction** (`RateProvider` interface) with a primary + fallback; start with **Frankfurter/ECB** (free, no key, daily ECB reference rates).
- **Cadence:** daily. ECB publishes ~16:00 CET on business days.
- **Gaps (weekends/holidays/missing currency):** carry-forward — rate lookup selects the **most recent `rate_date ≤ document_date`**. A staleness monitor alerts if the newest rate is > N days old.
- **Manual override:** a tenant can type a rate on a document (`rate_source='manual'`); it's snapshotted on the row, never written to the global table.
- **Idempotent:** unique `(base,quote,rate_date,source)` → re-runs upsert.

---

## 5. Money math & rounding (currency-aware)

Extend the existing `src/lib/financialMath.ts`:
```ts
// decimal places resolved from master_currency_codes (cached)
roundMoney(value: number, currency: string): number   // round to currency's dp (0/2/3)
toBase(docAmount: number, rate: number, baseCurrency: string): number
  => roundMoney(docAmount * rate, baseCurrency)
calculateInvoiceTotals(items, discount, taxRate, amountPaid, { currency, rate, baseCurrency })
  => { subtotal, taxAmount, totalAmount, amountDue,           // document currency
       subtotalBase, taxAmountBase, totalAmountBase, amountDueBase }  // base currency
```
Totals are computed in the **document currency** first (the legally-correct figures on the PDF), then each is converted and rounded into base. Never derive document amounts from base (that would distort the customer-facing total).

---

## 6. Reporting & aggregation (base currency, at scale)

- **All cross-document reports/stats aggregate the `*_base` columns** → one currency, correct, fast.
- Replace `financialReportsService`'s fetch-all-then-reduce with **SQL aggregate RPCs** grouping on `*_base` (this is the previously-deferred Wave-3 scale work — multi-currency now makes it mandatory, not optional, because JS-summing mixed `total_amount` is wrong).
- **Display rules:**
  - A document is always shown in **its own currency** with that currency's decimals, plus an optional base equivalent ("USD 1,200 · ≈ €1,104").
  - Dashboards/P&L/aging show **base** totals, with an optional "by currency" breakdown (`GROUP BY document_currency`).

---

## 7. FX gain/loss (phased — where it fits)

Invoice booked at rate R1 (base value V1); paid later when the rate is R2. The cash received converts to a *different* base value → the delta is a **realized FX gain/loss**.

- **Payments carry their own `exchange_rate`** (snapshotted at payment date) and `amount_base`.
- On allocation, `realized_fx = amount_paid_base(at payment rate) − amount_paid_base(at invoice rate)`; post it as a `financial_transactions` row of type `fx_gain` / `fx_loss`.
- **Unrealized FX** (period-end revaluation of open foreign receivables at the current rate) is reporting-only — **Phase 3**.

Phase 1 can ship without realized FX if payments are constrained to the invoice's currency (common for SMBs); the columns above make adding it non-breaking.

---

## 8. Onboarding (base currency mandatory)

- In `OnboardingWizard`: country selection **pre-fills** the base currency from `geo_countries.currency_code`, but the base currency is an **explicit, required field** the owner confirms — not silently inherited.
- On tenant creation: set `tenants.base_currency_code` **and** insert `tenant_currencies(is_base=true)` in one transaction (RPC).
- **Immutability:** once the tenant has *any* financial document, the base currency is **locked** (changing it would invalidate every `*_base` value). Enforce with a guard / DB trigger: reject base change if financial rows exist. Adding/deactivating *non-base* transaction currencies is always allowed.

---

## 9. Migration from the current single-currency state (additive, reversible)

All steps additive — no `DROP`, no data loss, deterministic backfill (today `document_currency == base` and rate `1.0` for every existing row).

1. **Reference:** ensure `master_currency_codes.decimal_places`; seed ISO-4217. Create `exchange_rates`.
2. **Tenant model:** add `tenants.base_currency_code` (backfill = `currency_code`, then NOT NULL); create `tenant_currencies` (one `is_base` row per tenant from `currency_code`).
3. **Documents:** add `exchange_rate` (default 1), `rate_source`, and `*_base` columns; backfill `*_base = raw amount`. Widen money columns `numeric(12,2)→(19,4)` per table (off-peak; trivial at current data volume).
4. **Regenerate** `database.types.ts`; route writes through `financialMath`/services so the `*_base` invariant is computed centrally. `tsc` flags any stale call site (the Wave-1/2 service seams shrink this blast radius).
5. **Reporting:** switch aggregates to `*_base` SQL RPCs.
6. **Reversibility:** new columns/tables are droppable; backfill is reproducible.

> The `ALTER COLUMN ... TYPE numeric(19,4)` rewrites each table once (brief lock). At dev-stage this is seconds; at scale, do it per-table during a window or via a shadow-column swap.

---

## 10. Phased rollout  *(decisions locked — see §12)*

| Phase | Scope | Outcome |
|---|---|---|
| **1 — Production multi-currency** | Mandatory base at onboarding · `tenant_currencies` · per-document currency selector · **auto rate snapshot** from `sync-exchange-rates` cron (ECB/Frankfurter, manual override available) · `*_base` columns · **realized FX gain/loss on payments** · base-currency reporting via SQL RPCs · currency-aware rounding | Tenants invoice in any currency; rates hands-off; dashboards correct in base; **correct realized FX cash books from day one** |
| **2 — Depth** | Multi-currency bank accounts + inter-account FX transfers; tenant rate-override table + provenance UI; provider fallback hardening | Full treasury support |
| **3 — Accounting close** | Unrealized FX revaluation; period-end FX reporting; rate-history/audit UI | Audit-grade close |

> **Phase-1 scope note:** the owner elected to include both automated rate ingestion *and* realized FX in Phase 1. This pulls the `sync-exchange-rates` edge function (§4) and the FX gain/loss postings (§7) forward into the first release. Payments therefore carry their **own** snapshotted `exchange_rate` + `amount_base`, and the base-value delta vs. the invoice's booked rate posts an `fx_gain`/`fx_loss` `financial_transactions` row at allocation time.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `numeric` widening rewrites tables | Additive; off-peak/per-table; trivial now |
| Base-currency change after transactions | Lock once financial rows exist (trigger guard) |
| Rate gaps / provider outage | Carry-forward most-recent rate; manual override; staleness alert |
| Cross-currency rounding errors | Currency-aware `roundMoney(value, currency)` using `decimal_places` |
| Stale reports from live conversion | Snapshot `*_base` at write time; never convert history on read |
| 100+ UI sites read `currency`/amounts | Service-layer + `financialMath` seams (Waves 1–2) centralize; `tsc` catches the rest on type regen |
| RLS on shared rates | `exchange_rates` global-read, platform/service-role-write; tenant overrides live on the document row |

---

## 12. Decisions (locked by product owner)

1. **Rate source:** **Auto-fetch** — daily `sync-exchange-rates` edge function pulls ECB/Frankfurter (free, no key) into `exchange_rates`; documents snapshot the rate automatically; manual per-document override remains available. → in **Phase 1**.
2. **Realized FX gain/loss:** **Included in Phase 1.** Payments carry their own snapshotted rate + base amount; the delta vs. the invoice's booked base value posts an `fx_gain`/`fx_loss` `financial_transactions` row on allocation. (Unrealized/period-end FX revaluation remains Phase 3.)

## 13. Phase-1 implementation sequence (concrete)

1. **Migration M1 — reference & rates (global):** ensure `master_currency_codes.decimal_places`; seed ISO-4217; create `exchange_rates` (+ RLS: global read, platform/service-role write; pivot model).
2. **Migration M2 — tenant model:** `tenants.base_currency_code` (backfill from `currency_code`, NOT NULL); `tenant_currencies` (RESTRICTIVE RLS + `set_tenant_and_audit` trigger + partial unique base index + tenant index); backfill one `is_base` row per tenant.
3. **Migration M3 — documents:** add `exchange_rate`/`rate_source`/`*_base` to invoices, quotes, payments, expenses, financial_transactions (backfill rate=1, `*_base`=raw); widen money columns `numeric(12,2)→(19,4)` per table.
4. **Migration M4 — RPCs & FX:** SQL aggregate RPCs over `*_base` (replace `financialReportsService` fetch-all-then-reduce); `allocate_payment_*` extended to compute realized FX and post `fx_gain`/`fx_loss`.
5. **Regenerate `database.types.ts`**; fix call sites (tsc-gated).
6. **`sync-exchange-rates` edge function** + daily schedule; provider abstraction (Frankfurter primary).
7. **Services:** `currencyService` (supported currencies, rate lookup, conversion); extend `financialMath` (currency-aware `roundMoney`, base outputs); thread currency+rate through `invoiceService`/`quotesService`/`paymentsService`.
8. **Frontend:** onboarding base-currency step (mandatory); per-document currency selector (from `tenant_currencies`) + live base equivalent; per-currency decimal formatting in `format.ts`; dashboards read base.

Each migration is additive/reversible and lands as its own PR using `.github/PULL_REQUEST_TEMPLATE/migration.md` (per CLAUDE.md migration discipline: apply via MCP, regenerate types, update callers, schema-drift check).
