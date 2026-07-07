# Global Localization — Re-Verification Delta & Re-Scoped Plan

**Date:** 2026-07-07
**Supersedes the scope framing of:** `docs/superpowers/specs/2026-07-02-global-tenant-localization-audit-and-design.md` (the audit; still the canonical architecture reference for Part 2)
**Method:** 16 parallel agents (one per audit dimension) re-verified every Critical/High (and quick Medium) finding against **current** `main` code + live schema (`ssmbegiyjivrcwgcqutu`), producing an evidence-anchored `fixed | partial | still_live` verdict per finding. Raw results: workflow `wf_9491ebfd-f57`.

---

## TL;DR — the audit is substantially stale; the criticals are closed

The 2026-07-02 audit **predates the India Pack (Phase 4)** and the earlier "stop-the-bleeding" localization work, both of which have since shipped to `main`. Re-verification finding:

- **Every core tenant tax / VAT / currency / document / numbering / UQC / POS-tax / invoice-immutability Critical is FIXED** — verified with concrete current-code proofs (per-component `document_tax_lines` + tax kernel; `vat_records` gained `currency_code`/`exchange_rate`/`vat_amount_base`/`component_code`/`tax_period` and the read-side sums the base column; credit-note reversals now net inside `vat_records`; effective-dated `geo_country_tax_rates`; `{FY}` fiscal numbering; `master_unit_codes`/UQC; Rule-46/49/53 profiles; `record_stock_sale` POS tax; `enforce_issued_invoice_immutability`; account_transfers widened + cross-currency guard; payroll fabricated-7%/USD-WPS disabled).
- **The two "likely-still-live wrong-money" headliners the prior handoff flagged are BOTH already fixed** (`vatService` sums `vat_amount_base`; `bankingService` blocks cross-currency transfers).

**The real remaining exposure is not "tax is broken." It splits into three very different buckets:**

| Bucket | What it is | Size | Autonomy |
|---|---|---|---|
| **Phase 0 — live wrong-money bugs** | ~8 peripheral money-correctness bugs biting the **existing GCC/OMR tenant today** | Small, surgical | ✅ Safe to fix now (TDD, PR-per-fix; no new statutory claims) |
| **Broken track — platform subscription billing** | The `paypal-webhook` billing writer fails on **every** call (phantom columns, FK violation, unawaited errors) | Self-contained | ✅ Bug-fix the writer; ⚠️ adding subscription *tax* is a feature (owner scope) |
| **Breadth backlog — Phases 1–3** | Statutory build-outs for countries **not yet served** (payroll engines, US SALT, fixed-assets, dunning, non-India fiscalization, privacy, datetime sweep) | ~100 findings, large | ⛔ Needs owner scope + external statutory validation — **do NOT self-certify** |

**The risk has inverted.** The stale audit reads like 25 live criticals to firefight. The actual danger now is the opposite: over-building statutory breadth for hypothetical jurisdictions and self-certifying the math (the audit's own Risk #2 rates that Critical). **Scope the breadth to real demand.**

---

## Status rollup (re-verified)

Across the 16 dimensions, the still-live/partial work concentrates as follows (Criticals called out):

**Still-live Criticals (only 4 — none in the tenant tax ledger):**
1. `gap1` Erasure PII map incomplete — `anonymize_customer_data` only touches `customers_enhanced` + `customer_communications`; leaves `ndas`, chain-of-custody actor PII, Storage objects, invoice snapshots identifiable. *(privacy — P3)*
2. `gap2` `cancelStockSale` hard-deletes the original cash-sale row (`status='refunded', deleted_at=now()`) with no counter-document — fiscal trail suppressible. *(P1)*
3. `gap3` `paypal-webhook` `billing_invoices` insert uses phantom `amount_cents` + FK-violating `subscription_id`, error unawaited → **every** `PAYMENT.SALE.COMPLETED` fails to record a platform invoice. *(broken writer)*
4. `gap3` Subscription charge is country/tax-blind — `paypal-create-subscription` collects flat plan price, zero tax resolution. *(P0-ish, platform billing)*

Everything else the audit rated Critical is **fixed or partial-with-the-defect-closed**.

---

## Phase 0 — live wrong-money bugs (EXECUTE NOW, autonomous)

Each is a correctness restoration on money already flowing through the **existing** GCC/OMR (3-decimal) tenant. All are TDD-able, PR-per-fix, no new statutory claims. Evidence file:line from re-verification.

- [ ] **P0.1 — P&L revenue is tax-inclusive gross with no VAT netting.** `src/lib/financialReportsService.ts:114` sums `invoices.amount_paid` (tax-inclusive) as `totalRevenue`; no output-VAT subtraction. → Net revenue of tax before P&L; add a test asserting a taxed invoice reports revenue net of its VAT.
- [ ] **P0.2 — P&L invoices leg missing `deleted_at` filter.** `src/lib/financialReportsService.ts:91-96` (invoices query) has no `.is('deleted_at', null)` while the expenses leg (:105) does — a soft-deleted/voided invoice that carried payments still inflates revenue. → Add the filter; test a voided-but-paid invoice is excluded.
- [ ] **P0.3 — `formatCurrency` defaults USD + truncates 3-decimal currencies.** `src/lib/format.ts:93` `formatCurrency(amount, currency='USD')`; catch fallback (:104-105) `${currency} ${amount.toFixed(2)}` drops the 3rd decimal for OMR/BHD/KWD (**the live tenant is OMR**). → Remove USD default (require currency or resolve base), use ISO-4217 decimals in the fallback; test OMR renders 3dp.
- [ ] **P0.4 — Invoice detail renders tenant home currency, not the row's currency.** `src/pages/financial/InvoiceDetailPage.tsx:57` uses zero-arg `useCurrency()`; totals (:861/869/875) call `formatCurrency(invoice.total_amount)` with no per-row currency though `invoice.currency` is fetched (:594). → Thread `invoice.currency`; test a EUR invoice on an OMR tenant shows the EUR symbol/decimals. (Also `InvoicesListPage` — zero currency refs.)
- [ ] **P0.5 — Currency-less expense defaults to a USD literal on both sides.** `src/components/financial/ExpensePaymentModal.tsx:45` `expense?.currency ?? 'USD'` and :55 account filter `(a.currency ?? 'USD') === expenseCurrency` — on an OMR tenant a NULL-currency expense yields an empty deposit-account list / can match a USD account. → Default to `getBaseCurrency()`, not `'USD'`; test the OMR path.
- [ ] **P0.6 — Payroll overstates net pay: absence/unpaid-leave not prorated; pending adjustments discarded.** `src/lib/payrollService.ts` computes `daysAbsent/daysLeave` (:493-505) but `processPayroll` consumes only overtime/regular hours; `:344-346 if (options.includePendingAdjustments) { await this.getPendingAdjustments(); }` **fetches and throws away the result**. → Apply LOP proration + apply pending adjustments; test an employee with N absent days is paid pro-rata.
- [ ] **P0.7 — Payroll display currency fabricates USD when the settings row is missing.** `src/lib/payrollService.ts:48` `DEFAULT_PAYROLL_SETTINGS.currency` is a literal `USD/$/2dp`, consumed as the display currency at `:817` when no settings row exists (the compute path already correctly ignores it). → Resolve base currency for display; test a settings-less OMR tenant shows OMR.
- [ ] **P0.8 — Platform billing money math assumes 2-decimal USD + literal `$`.** `src/lib/billingService.ts:639` `formatPrice(cents, currency='USD')` ÷100 en-US; `TenantBillingTab.tsx:67` renders literal `$`; `BillingPage.tsx:316` treats `total` as whole-units while `billingService.ts:635` treats it as cents (100× disagreement latent behind the broken writer). → Currency-aware formatting + reconcile the unit convention. *(Pairs with the broken-billing track below.)*

**Exit gate:** each fix TDD'd (RED→GREEN), `npm run typecheck` un-piped = 0, targeted suite green, adversarial review per PR, byte-parity where PDFs/goldens are touched.

---

## Broken track — Platform Subscription Billing (own PR series, mostly bug-fix)

`gap3` is a self-contained subsystem that is **broken end-to-end today** (the tenant-facing tax ledger is unaffected). The `paypal-webhook`/`paypal-create-subscription` edge functions and `billingService` disagree with the `billing_invoices`/`billing_events` schema on nearly every field:
- phantom `amount_cents`/`event_data` columns; FK-violating `subscription_id`; omitted required `tenant_id`; unawaited/console-only insert errors; `get_next_number({sequence_name:...})` (wrong param name → `INV-${Date.now()}` fallback, wrong scope); `paypal-manage-subscription` invoked but **does not exist**; no platform-invoice PDF writer (`invoice_pdf_url` read-only).
- **Bug-fix cluster (safe):** make the writers match the schema, await/validate errors, correct the RPC call, add the missing manage-subscription function or remove its callers.
- **Feature cluster (owner scope):** subscription tax resolution (buyer country/tax-id → `taxes` object), `subscription_plans` tax_inclusive/per-country pricing, platform-invoice PDF, `billing_invoice_items` tax fields.

Recommend treating the **bug-fix cluster** as Phase 0-adjacent (it's broken now) and the **feature cluster** as a scoped item under Phase 1.

---

## Backlog — Phases 1–3 (AWAIT owner scope; do not auto-build)

These are breadth build-outs. Sized here, **not** decomposed into bite-sized tasks, because the sequence depends on which countries the business is actually expanding into and several require external statutory validation.

**Phase 1 — correctness & compliance breadth**
- **Datetime/timezone sweep** (largest single cluster): `getFinancialYearDates` hardcodes Jan–Dec; ~85 `toISOString().split()` business-date sites; timestamptz doc dates render a day early west of UTC; custody PDF `dd/MM/yyyy` + browser tz; leave/timesheet hardcode Sat+Sun & Monday week-start; aged-receivables & dashboard use browser-local; 47 raw `toLocaleDateString` sites.
- **Payroll structural breadth**: salary components/structures never read in the run (`payslip` items never written); no PAYE/TDS/FICA/PF engine; no compliant WPS-SIF/NACHA/BACS file; statutory rate not UI-configurable; EOSB/gratuity absent; leave-year Jan–Dec only; `master_payroll_components`/`master_leave_types` global-only (RLS blocks tenant add); employees lack IBAN/IFSC/routing/tax-IDs; monthly-only pay frequency; overtime weekend/holiday premiums unused.
- **US sales tax**: `geo_country_tax_rates` has zero US rows; no `us_sales_tax` / `jurisdiction_stack` plugin registered; `tax_rates` table has no jurisdiction dims. Needs a provider seam (Avalara-style) + SALT review.
- **Non-India fiscalization** (`gap2`): ZATCA Ph2/FATOORA, PEPPOL/EN16931, PT ATCUD/`einvoice_submissions` emitter, POS fiscal receipt (currently `window.print()`), receipts carry no tax fields.
- **Dunning/late-payment** (`gap4`, all greenfield): interest/penalty columns, statutory-mentions block, configurable dunning ladder, `dunning_level`/reminder tracking, net-days/customer terms, `payment_reminder`/`statement_of_account` document types.
- **Fixed assets** (`gap5`, module unbuilt): depreciation absent from P&L, no asset service/route, no basis/regime discriminator, no capital-allowance pools, no capex/disposal/in-service-date, no capital-goods VAT.
- **Accounting depth**: no chart-of-accounts / GL / journal / trial balance (Balance Sheet card generates nothing).
- **i18n breadth**: customer emails English-only (`resolveCustomerLanguage` dead), no portal `preferred_language`/switcher, `portal.ar.json` ~11% coverage, `PhoneInput`/`phone_format`/`postal_code_format` unconsumed.
- **Numbering edge cases**: `QuoteFormModal` burns a number on modal-open; client-fabricated `QT-000001`/`EXP-${Date.now()}`/`PAY-${Date.now()}` fallbacks (QT collision real); no per-legal-entity series; mis-templated annual reset can duplicate.

**Phase 2 — FX / multicurrency breadth**
- `getCurrencyDecimals` silently defaults unknown codes to 2dp; only 35 currencies seeded.
- Asset tables not currency-threaded; payroll keeps a parallel ignored currency.

**Phase 3 — governance / privacy / reference-data / infra**
- **Reference-data seed**: only **9** countries onboardable — most of the world is blocked purely by missing seed rows (the code paths handle any seeded country).
- **Privacy** (`gap1`): erasure PII map incomplete (+ Storage objects, custody PII), `data_protection_regime` seeded but not denormalized/consumed, residency gate wired but never fires (unseeded), public customer-photo URLs, no consent table, no data-breach register, `enforce_onboardable_country` DB backstop asserted-but-absent.
- **Registry**: no late-payment/credit-terms key family.

---

## Recommendation

**Here's the call:**
1. **Execute Phase 0 now** (autonomous, PR-per-fix) — restore the ~8 live money bugs on the existing tenant + the platform-billing **bug-fix** cluster. Small, safe, high signal-to-noise.
2. **Then STOP for an owner scope decision** on the breadth. The breadth is not "finish the audit" — it's "which market do we serve next," and much of it (payroll statutory, US SALT, fiscalization) must be **externally validated, not self-certified**.
3. **Pick breadth by real demand, one country/track at a time**, reusing the shipped kernel + country-pack framework the way the India Pack did (data + plugins over the kernel, minimal core changes).

Owner decision needed after Phase 0: which track leads — **(a)** platform billing feature-completion (you get paid correctly), **(b)** a specific next country pack, **(c)** privacy/residency hardening (`gap1`), or **(d)** the datetime/timezone correctness sweep (broad, benefits every tenant).
