Here's what I'd actually do.

**The single clearest call: the financial layer is NOT production-safe today. Do not go live on it. The one thing to fix first is to make payment recording atomic and money-conserving in the database — move the entire "record payment + allocate + recompute invoice balance + post ledger" sequence into one `SECURITY DEFINER` Postgres RPC that runs in a single transaction, locks the target invoice rows `FOR UPDATE`, and refuses to commit unless `Σ(allocations) = payment.amount` and each allocation `≤ balance_due`.** Everything else in this report is real and must be fixed, but this is the keystone: it is the only change that simultaneously kills the over-allocation bug (live data: a 315 payment carrying a 630 allocation), the non-atomic-write desync, the concurrency lost-update, and the "cash recorded ≠ revenue posted" divergence.

The key trade-off: an atomic RPC means money logic leaves TypeScript (`financialMath.ts` / `paymentsService.ts`) and lives in SQL, which the team is less comfortable editing and which the current schema-discipline CI does not type-check. That is the right trade anyway — money correctness is a *database* guarantee or it is nothing. App-side "single source of truth" is a convention, and conventions get bypassed (they already are: a dead legacy `recordPayment` path and a header-vs-line discount split both bypass it).

The real risks if you ship as-is: (1) you cannot prove revenue — the ledger (`financial_transactions`) is fully mutable and deletable by any authenticated tenant user, and the only refund that ever happened was a *soft-delete of the income row*, i.e. history erasure; (2) you cannot produce a VAT return — the VAT subsystem has zero rows and nothing populates it, in an OMR/GCC tenant where VAT filing is a legal obligation; (3) you can mint duplicate invoice numbers under concurrency with no unique constraint to stop it — a tax-document defect; (4) the reported "Record Payment looks wrong" is real and is two stacked bugs (case payment history joins a column the write path never populates, plus a render bug printing the date in the amount slot).

What most people miss: **the reported bug is the least of it.** It's a UI symptom of a join on the unpopulated `payments.invoice_id` — a 20-minute fix. The actual exposure is that this is an *audit and compliance* failure dressed up as a CRM, on a platform whose entire value proposition is forensic provability. A data-recovery lab that cannot prove who took a payment, cannot reverse a refund without deleting revenue, and cannot file VAT is not "missing features" — it is uninsurable. Fix the keystone RPC and the append-only ledger before you let a second real transaction into this database. The fact that the DB is nearly empty is the gift here: you are fixing logic bugs in a test run, not migrating corrupted production money.

---

# xSuite Financial Layer — Principal Architect Audit & Remediation Plan

**Scope:** Full financial surface of project `ssmbegiyjivrcwgcqutu`, verified against live `pg_catalog`/`information_schema`, function bodies, RLS policies, security advisors, and `src/` code. Findings are classified **(a) exists in live DB**, **(b) migrations/types only**, **(c) drift/missing**. The live DB is treated as sole source of truth.

**Data reality:** This is a near-empty system with exactly **one** real quote→invoice→payment→allocation chain, and that single chain already exhibits multiple integrity breaks. Treat findings as **logic/schema bugs reproduced in one test run**, not accumulated corruption — which is precisely why now is the time to fix them.

---

## 1. Reported Issue — Root Cause (Record Payment / Payment Allocation)

The "Case Details → Record Payment / Payment Allocation appears incorrect" symptom is **two stacked, independently-verified bugs plus one structural cause**.

**Bug A — Case Payment History is silently empty (read/write column mismatch).**
- Write path: `RecordPaymentModal` → `createPayment` (`src/lib/paymentsService.ts:192–244`) inserts the `payments` row with `invoice_id` and `case_id` **omitted** (the modal's `onSave` payload at `RecordPaymentModal.tsx:202–217` never passes them). Linkage is recorded *only* in `payment_allocations`.
- Read path: `getCasePayments` (`src/lib/caseFinanceService.ts:109–129`, wired at `CaseFinancesTab.tsx:105`) queries `payments` with `invoice:invoices!inner(invoice_number, case_id)` and `.eq('invoices.case_id', caseId)` — resolving the case **through `payments.invoice_id`**, which is always NULL on this path. The `!inner` join therefore returns **zero rows**, and the `catch` returns `[]` (masking the failure).
- **Live proof:** the one payment row `PAYM-0001` has `invoice_id = NULL` and `case_id = NULL` despite being allocated to `INVO-0001` (case `d990e035…`). Classification: **(c) drift** — write path and case read path use different columns and are guaranteed to disagree.

**Bug B — The amount column renders the date.** `CaseFinancesTab.tsx:437` renders `{formatDate(payment.payment_date)}` in the bold right-hand amount slot. Even if rows returned, the amount is never shown. Classification: **(a) confirmed in code.**

**Structural cause behind the "allocation is wrong" half.** Live data shows `PAYM-0001.amount = 315.00` but its `payment_allocations` row `= 630.00` (2×, equal to the full invoice total, not the 50%-advance payment). There is **no DB constraint** that `Σ(allocations) ≤ payment.amount`; the only guard is a client-side `Math.min(amount, balance_due)` clamp (`RecordPaymentModal.tsx:184`). The income `financial_transactions` row was posted at **630**, mirroring the bad allocation, not the 315 payment.

**Exact fix (do not apply — plan only):**
1. Make `getCasePayments` read through `payment_allocations` (join `payment_allocations → payments`, filter `payment_allocations.invoice_id IN (case's invoices)`), so the case read path uses the same source as the write path. Stop relying on the unpopulated `payments.invoice_id`.
2. `CaseFinancesTab.tsx:437` → `formatCurrency(payment.amount, …)`.
3. (Root, see §11/§12) move record+allocate into an atomic RPC that asserts `Σ(allocations) = payment.amount` and sets `created_by = auth.uid()`, eliminating the 630-vs-315 class entirely.

---

## 2. Financial Architecture Review

There **is** a designated calculation engine — `src/lib/financialMath.ts` (per-line `roundMoney` → line discount → header discount → tax → `amountDue`; base-currency snapshots; currency-aware decimals; round-half-up). It is correct and currency-aware. The problem is it is **not universally used**, and there is **no server-side enforcement** that anything agrees with it.

Four verified divergences break single-source-of-truth:

- **Header vs line totals disagree (CRITICAL).** `invoiceService.ts:431–451` computes each `invoice_line_item` from the **undiscounted** base using only the *per-line* `discount_percent`, never the invoice **header** `discount_amount`. The header (`financialMath.ts:60–62`) taxes the **post-discount** base. Live `INVO-0001`: header total **630**, single line total **682.50** — off by **52.50** (= 50 × 1.05). On any multi-line invoice with a header discount, the line items sum to more than the invoice total.
- **PDFs recompute instead of rendering stored values (HIGH).** `InvoiceDocument.ts:222–229` and `QuoteDocument.ts:219–226` recompute `total/balance_due` from stored `subtotal + tax_rate` and never read stored `total_amount`/`balance_due`. The *legal printed document* is a second, parallel computation. `InvoiceDocument` also ignores `discount_type` (treats every discount as flat) while `QuoteDocument` honors it — a latent asymmetry (low severity in practice: live `invoices` has **no `discount_type` column**, so the percentage-misrender cannot occur from persisted data; it is a code-symmetry nit).
- **Form modals are a third math copy (MEDIUM).** `InvoiceFormModal.tsx:421–433` / `QuoteFormModal.tsx:352–365` re-implement totals client-side with **no per-line rounding** and a **hardcoded `tax_rate = 5`** (not from `useTaxConfig`) — a country-config violation and a sub-cent preview-drift source.
- **No server-side total enforcement (HIGH).** No CHECK, trigger, or generated column asserts `total = subtotal − discount + tax` or `header total = Σ line totals`. Stored totals are app-trust only.

**Verdict:** the architecture *intends* a single source of truth but does not *enforce* one. Money correctness is a convention in one TS file, already bypassed by the line-item path and the dead legacy `recordPayment`.

---

## 3. Database Architecture Review (live-DB findings; drift noted)

All assumed financial tables **exist as live base tables** (verified): `payments`, `payment_allocations`, `invoices`, `invoice_line_items`, `quotes`, `quote_items`, `quote_history`, `case_quotes`, `case_quote_items`, `receipts`, `receipt_allocations`, `payment_receipts`, `payment_disbursements`, `financial_transactions`, `financial_audit_logs`, `tax_rates`, `vat_records`, `vat_returns`, `vat_transactions`, `accounting_locales`, `account_balance_snapshots`.

**Missing / drift:**
- **`credit_notes` does NOT exist anywhere** (live `information_schema.tables` ILIKE `%credit%`/`%refund%` → empty). No refund/credit/write-off/negative-money entity. Classification **(c) missing**.
- **No separate proforma table** — proforma is an `invoices` row (`is_proforma` / `invoice_type` + self-FKs `proforma_invoice_id` / `converted_to_invoice_id`).
- **Dual status columns** on `invoices` and `quotes`: both `status_id uuid` (FK to `master_*_statuses`) **and** free-text `status text`. `get_invoice_stats_base` reads `status text` (canonical); `approve_quote` writes only `status_id` → **drift hazard**.
- **Two parallel quoting systems**: `quotes`/`quote_items` (internal, has data) vs `case_quotes`/`case_quote_items` (portal-facing, **0 rows**) with no FK between them — the broken portal quote loop noted in `CLAUDE.md`.
- **No UNIQUE on any document number** (`payment_number`, `invoice_number`, `quote_number`, `receipt_number`, `disbursement_number`) — only `id` PKs and `number_sequences_tenant_id_scope_key`.
- **Missing indexes on hot FKs**: `payments.invoice_id`, `payment_allocations.payment_id`/`invoice_id`, `receipt_allocations.receipt_id`/`invoice_id` are unindexed.
- **No arithmetic CHECKs / triggers / generated columns** on `invoices`/`quotes` — only `*_rate_source_chk` and `set_*_tenant_and_audit`. `amount_paid`/`balance_due`/`status` are plain, app-maintained columns.
- **Polymorphic, FK-less links**: `financial_transactions.reference_type/reference_id` and `vat_*.record_type/record_id` have no FK to source docs; nothing in the DB auto-populates the ledger or VAT from payments/invoices.

Per the source-of-truth rule, migration files and `database.types.ts` were **not** consulted; all of the above is category **(a) live DB** except where marked **(c)**.

---

## 4. Payment Workflow Analysis

Path (verified): `CaseFinancesTab.tsx:372` → `CaseDetail.tsx:190` → `RecordPaymentModal` → `useCaseMutations.ts:199` → `createPayment` (`paymentsService.ts:192`) → `allocatePaymentToInvoices` (`:246`).

**Defects:**
1. **Non-atomic (CRITICAL).** `createPayment` inserts `payments` (`:226`), then `allocatePaymentToInvoices` bulk-inserts allocations (`:259`), runs a per-invoice read-modify-write loop updating `invoices` (`:302–348`), then inserts ledger income/FX rows (`:369–394`) — all separate Supabase round-trips, **no DB transaction, no `FOR UPDATE`**. Rollback is a hand-rolled JS `catch` (`:395–426`) which can itself fail. Code self-flags it (`:418`: "A single-transaction RPC would make this atomic — Wave-3 follow-up"). **No `record_payment`/`allocate_payment` RPC exists in `pg_proc`.**
2. **Ledger posted from `Σ(allocations)`, not `payments.amount` (HIGH).** `:367–379` posts income from `totalAllocated`; `payments.amount` is independent and never reconciled. Live proof: payment 315, ledger 630. Cash ≠ revenue → bank rec fails.
3. **`voidPayment` orphans the ledger (HIGH).** `:448–509` reverses invoice balances and soft-deletes allocations, sets `status='refunded'`, but **never touches `financial_transactions`**. A successfully-posted, later-voided payment leaves its income/FX rows live → overstated revenue and VAT base.
4. **Two write paths (MEDIUM, partly dead code).** The legacy second path is `invoiceService.recordPayment` (`:743–829`) — sets `payments.invoice_id` directly, writes **no allocation and no ledger**. *Caveat:* grep shows **zero live callers**; it is dead/legacy, so the divergence is latent, not active. (The earlier "`applyPaymentToInvoice`" name does not exist — corrected.)
5. **`created_by` never set (MEDIUM).** Modal omits it; `createPayment` writes `created_by ?? null` (`:223`). Live row has `created_by = NULL` — forensic attribution gap on a money event.

---

## 5. Payment Allocation Analysis

`payment_allocations` (live): PK + 4 FKs only. **No** `CHECK(amount > 0)`, **no** `UNIQUE(payment_id, invoice_id)`, **no** constraint relating `Σ(allocations)` to `payments.amount` or `invoice.balance_due`, **no** balance-recompute trigger. `receipt_allocations` is identical and is a **second, independent invoice-settlement writer** — a third path (with direct `payments.invoice_id`) makes three mechanisms that can each claim "amount applied to this invoice."

Consequences (all verified):
- **Over-allocation is unconstrained** — live: 315 payment, 630 allocation.
- **Duplicate allocations possible** — no uniqueness on `(payment_id, invoice_id)`.
- **No partial-reallocation primitive** — the only correction is whole-payment `voidPayment`; fixing one mis-allocated line requires void + recreate.
- **Soft-delete FK mismatch** — allocation FKs are `NO ACTION` against a `deleted_at` soft-delete model; soft-deleting a payment leaves its allocations live unless app code cascades (convention only).

**The allocation table is the correct settlement model — but it has no integrity backstop at all.** Money conservation is 100% app-trust.

---

## 6. Financial Integrity Audit

- **No invoice balance invariant.** No CHECK that `amount_paid + balance_due = total_amount`, none that either is `≥ 0`. Maintained only in app code with no trigger and no `FOR UPDATE` → lost-update race on concurrent allocations.
- **No money-conservation guard** anywhere in the DB (see §5).
- **Header ≠ Σ lines** on the one real invoice (§2), off by 52.50.
- **Quote↔invoice discount drift.** Live: `QUOT-0008` discount 90, converted `INVO-0001` discount 50, identical subtotal/total; the quote's own header math doesn't balance (650 − 90 + 30 = 590 ≠ 630). *Caveat:* `convert_proforma_to_tax_invoice` copies `discount_amount` **verbatim**, so it did **not** introduce the 90→50 change — another path or a manual edit did. Both the divergence and the unbalanced quote are confirmed facts; the causal attribution to the function is refuted.
- **Refunds erase history.** The lone refund soft-deleted the income `financial_transactions` row rather than posting a reversing entry.

---

## 7. Accounting Compliance Review

This is **CRM-grade, not accounting-grade**, and the active tenant is **OMR (3-decimal VAT jurisdiction)** — raising the stakes.

- **Mutable ledger (CRITICAL).** `financial_transactions` has **no** `prevent_audit_mutation` trigger (unlike `audit_trails`, `financial_audit_logs`, `chain_of_custody`); `authenticated` **and `anon`** hold `UPDATE`/`DELETE`/`TRUNCATE`; RLS `financial_transactions_update` is `USING(true)/CHECK(true)`. The record of record is freely editable/deletable.
- **No financial change history (CRITICAL).** `financial_audit_logs` has **0 rows ever** and **no trigger** on `invoices`/`payments`/`payment_allocations`/`invoice_line_items` writes to it.
- **No double-entry (HIGH).** `financial_transactions` is single-sided (no debit/credit accounts, no journal lines, polymorphic FK-less source link). Cannot trial-balance, cannot produce P&L/balance sheet, cannot express balanced reversals.
- **No credit-note entity (HIGH).** Refunds/credits/write-offs have nowhere to live; credit notes are legally VAT-reportable in GCC.
- **Invoice numbering not gap-free or unique (HIGH).** `get_next_number` bumps the sequence in its own `UPDATE`, caller inserts separately → rolled-back insert burns a number; no `UNIQUE` on `invoice_number`.
- **`convert_proforma_to_tax_invoice` non-compliant (HIGH).** Converts a *quote* (misnamed), assigns no `invoice_number`, sets no `status`/`status_id`, sets only `balance_due_base` (not `balance_due`), strips line `discount`/`tax`, emits no VAT record.
- **VAT subsystem unwired (HIGH).** `vat_records`/`vat_returns`/`vat_transactions`/`tax_rates` all **0 rows**; nothing auto-derives output VAT; invoices carry free-typed `tax_rate`; `vat_returns` lacks `UNIQUE(tenant_id, period)` and a `net_vat = output − input` CHECK.
- **Rounding (LOW, acceptable):** `roundMoney` is round-half-up, currency-aware in persist paths; only latent risk is a future SQL path using a different mode. The "OMR 2dp" alarm is **refuted** — persist paths pass `documentDecimals`; only a fallback formatter (`pdf/utils.ts:32`) hardcodes 2dp.

---

## 8. Multi-Tenant Security Review

**Baseline: SOUND.** All 21 financial tables have `tenant_id NOT NULL`, RLS **enabled + forced**, a RESTRICTIVE `{table}_tenant_isolation` policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`), and a `set_{table}_tenant_and_audit` trigger. The 321 `rls_policy_always_true` advisor warnings are **safe** (ANDed with RESTRICTIVE isolation) but bury real signal and provide zero within-tenant write authorization.

**Latent gaps (not frontend-exploitable today):**
- **No same-tenant invariant on allocations (HIGH).** `payment_allocations`/`receipt_allocations` FKs are tenant-agnostic; nothing asserts `payment.tenant_id = invoice.tenant_id = allocation.tenant_id`. A future definer RPC / import / platform-admin action could tie tenant A's payment to tenant B's invoice. (Composite FKs need `UNIQUE(id, tenant_id)` on parents first.)
- **`app.bypass_tenant_guard` GUC escape hatch (MEDIUM).** `set_tenant_and_audit_fields()` honors `current_setting('app.bypass_tenant_guard')` — a freely-settable `app.*` GUC — to skip the cross-tenant write check. No `src/` usage; reachable only from already-elevated SQL context.
- **Portal RLS keys on `customer_id` only (MEDIUM).** `payments_portal_read`/`invoices_portal_read`/`quotes_portal_read` have no tenant predicate; isolation rests on `customers_enhanced.id` global uniqueness. The portal-login function (`supabase/functions/portal-login/index.ts:84`) already mints `tenant_id` into the JWT but the policies don't use it — cheap defense-in-depth fix.

---

## 9. Data Integrity Risks

| # | Risk | Mechanism |
|---|------|-----------|
| 1 | Over-/under-allocation fabricates/strands money | No DB guard `Σ(alloc) ≤ payment.amount`; live 315→630 |
| 2 | Lost-update on invoice balance | App read-modify-write, no `FOR UPDATE`, no trigger |
| 3 | Duplicate document numbers | `get_next_number` no `FOR UPDATE` + no `UNIQUE` |
| 4 | Half-recorded payment | Non-atomic multi-write + fallible JS rollback |
| 5 | Orphan revenue on void | `voidPayment` skips `financial_transactions` |
| 6 | History erasure on refund | Ledger soft-deleted, not reversed; ledger mutable |
| 7 | Header ≠ line totals | Two independent calc paths persisted side-by-side |
| 8 | Orphan live allocations | Soft-delete vs `NO ACTION` FK mismatch |
| 9 | Cross-tenant allocation | Tenant-agnostic allocation FKs |
| 10 | Partially-paid invoices uncollectable | `status` label drift (`partial` vs `partially-paid`), no CHECK, unpaid filter excludes the banking-path label |

---

## 10. Critical Findings (ranked)

| Severity | Finding | Evidence | Impact |
|---|---|---|---|
| CRITICAL | Payment+allocation+balance+ledger write is non-atomic | `paymentsService.ts:226–426`; no RPC in `pg_proc`; self-flag `:418` | Half-recorded money on any mid-failure |
| CRITICAL | No DB guard `Σ(alloc) ≤ payment.amount`; no `amount>0`/UNIQUE | `pg_constraint` payment_allocations = PK+4 FK; live 315→630 | Money fabricated/destroyed; the reported bug |
| CRITICAL | `get_next_number` lost-update race + no UNIQUE on any doc number | `pg_get_functiondef` (no `FOR UPDATE`); no unique index on `invoice_number` etc. | Duplicate invoice/case numbers (tax + custody defect) |
| CRITICAL | `financial_transactions` ledger fully mutable/deletable | No `prevent_mutation` trigger; `authenticated`+`anon` UPDATE/DELETE; RLS `USING(true)` | Revenue silently altered; not forensically defensible |
| CRITICAL | `financial_audit_logs` never written (0 rows, no trigger) | Trigger inventory on financial tables | No before/after history for money |
| HIGH | No invoice balance invariant / recompute trigger | `pg_constraint` invoices; only `set_*` trigger | Lost-update, unguarded desync |
| HIGH | `voidPayment` doesn't reverse ledger | `paymentsService.ts:448–509` | Orphan revenue, wrong VAT base |
| HIGH | Header total ≠ Σ line totals | `invoiceService.ts:431–451` vs `financialMath.ts:60–62`; live off 52.50 | Legal invoice internally inconsistent |
| HIGH | No double-entry; single-sided polymorphic ledger | `information_schema.columns` financial_transactions | No trial balance / statements |
| HIGH | No credit-note / refund entity | no `%credit%`/`%refund%` table | Refunds erase history; VAT credit notes unfilable |
| HIGH | Invoice numbering not gap-free/unique | §7 | Tax/legal numbering non-compliant |
| HIGH | `convert_proforma_to_tax_invoice` non-compliant | `pg_get_functiondef` | Invalid tax invoices, invisible to VAT |
| HIGH | VAT subsystem unwired (0 rows, no auto-derive) | row counts; no trigger | Cannot produce a VAT return |
| HIGH | PDFs recompute vs stored totals | `InvoiceDocument.ts:222–229` | Printed doc ≠ system of record |
| HIGH | No same-tenant invariant on allocations | tenant-agnostic FKs | Latent cross-tenant money move |
| HIGH | Audit-table RLS permits UPDATE `USING(true)` | `pg_policies` | Append-only is single-trigger-deep |
| MEDIUM | Case payment history empty (read/write column mismatch) | `caseFinanceService.ts:118–121` vs `paymentsService.ts:208–224`; live NULLs | **Reported symptom** |
| MEDIUM | `app.bypass_tenant_guard` GUC | `set_tenant_and_audit_fields()` | Write-side cross-tenant escape hatch |
| MEDIUM | Portal RLS no tenant predicate | `pg_policies` *_portal_read | Isolation depends on customer_id uniqueness |
| MEDIUM | `created_by` NULL on payments | `paymentsService.ts:223` | No actor on money event |
| MEDIUM | Three settlement paths | `payment_allocations` / legacy `recordPayment` / `receipt_allocations` | No single source for "applied to invoice" |
| MEDIUM | Status label drift, no CHECK | `invoiceStatus.ts`; `paymentsService.ts:663` | Partially-paid invoices uncollectable |
| MEDIUM | Soft-delete vs `NO ACTION` FK | `pg_constraint` | Orphan live allocations |
| LOW | Amount slot renders date | `CaseFinancesTab.tsx:437` | Amount never shown (compounds reported bug) |
| LOW | Missing FK indexes | `pg_indexes` | Full scans at scale |
| LOW | 321 always-true policies | advisor | Noise + no within-tenant authz |
| LOW | Round-half-up vs Postgres | `financialMath.ts:13–16` | Latent only if SQL math added |

*(Severity of the case-history symptom is MEDIUM as an app bug; its structural cause — over-allocation — is CRITICAL.)*

---

## 11. Recommended Architecture (correct long-term design)

1. **One atomic money RPC.** `record_payment(p_payment jsonb, p_allocations jsonb)` — `SECURITY DEFINER`, single transaction: `SELECT … FOR UPDATE` the target invoices; insert `payments` (with `created_by = auth.uid()`); insert allocations; assert `Σ(alloc) = payment.amount` and each `alloc ≤ balance_due`; recompute `amount_paid`/`balance_due`/`status`; post **balanced** ledger entries — all-or-nothing. Mirror with `void_payment` / `reallocate_payment` that post **reversing** entries, never delete.
2. **Balance invariants as constraints.** `CHECK(amount_paid >= 0 AND balance_due >= 0)`, ideally `CHECK(round(amount_paid + balance_due, dp) = round(total_amount, dp))`; `CHECK(amount > 0)` and `UNIQUE(payment_id, invoice_id) WHERE deleted_at IS NULL` on `payment_allocations`/`receipt_allocations`.
3. **Totals derived from lines.** Distribute header discount pro-rata across lines; derive header subtotal/discount/tax/total as the SUM of rounded line values so `header = Σ lines` by construction. Add a validating trigger.
4. **Append-only double-entry ledger.** Journal entries with balanced debit/credit lines, FK'd source references; `prevent_audit_mutation` trigger; `REVOKE UPDATE/DELETE/TRUNCATE` from `authenticated`/`anon`. Auto-post from the payment/invoice RPCs.
5. **Single calc engine, enforced.** All readers (UI, PDF, services) render **stored** values; only the RPC/service writes them via `financialMath`. DB constraints make the engine and the database agree by construction.
6. **Credit-note entity** + VAT auto-emission + gap-free/unique numbering issued *inside* the insert transaction.

---

## 12. Production-Level Financial Implementation Plan (phased; describe SQL, do not apply)

**Phase 0 — Stop the bleed (days).**
- Fix `getCasePayments` to read via `payment_allocations`; fix `CaseFinancesTab.tsx:437` amount render. (Reported bug.)
- Add `prevent_audit_mutation` trigger to `financial_transactions`; `REVOKE UPDATE,DELETE,TRUNCATE` from `authenticated`/`anon`; drop its permissive UPDATE/DELETE RLS. Remove permissive UPDATE on `financial_audit_logs`/`audit_trails`.

**Phase 1 — Atomic core (the keystone).**
- `record_payment` RPC (single tx, `FOR UPDATE`, `Σ alloc = amount`, `alloc ≤ balance_due`, `created_by = auth.uid()`, balance recompute, balanced ledger posting). Repoint `createPayment` to call it; delete the JS rollback. Add `void_payment`/`reallocate_payment` RPCs posting reversing entries.

**Phase 2 — DB invariants.**
- `CHECK(amount>0)` + `UNIQUE(payment_id,invoice_id) WHERE deleted_at IS NULL` on both allocation tables; invoice balance CHECKs; `status` CHECK enumerating allowed values; FK indexes (`payments.invoice_id`, allocation FKs).
- `get_next_number`: `SELECT … FOR UPDATE` (or `UPDATE … RETURNING`); partial `UNIQUE(tenant_id, <number>) WHERE deleted_at IS NULL` on every document table; assign number inside the insert tx.

**Phase 3 — Totals & PDFs.**
- Line-derived header totals + validating trigger; route form modals through `financialMath` with tenant decimals and `useTaxConfig`; PDFs render stored `total_amount`/`balance_due`.

**Phase 4 — Compliance.**
- `credit_notes` (+ items/allocations, sequential numbering, VAT fields); refunds as reversing entry + credit note. Auto-emit `vat_records` on invoice finalization/credit note; seed `tax_rates` from country config; `UNIQUE(tenant_id, period)` + `CHECK(net_vat = output − input)` on `vat_returns`. Rewrite/rename `convert_proforma_to_tax_invoice` to assign number/status/`balance_due`, copy line tax, emit VAT.
- Double-entry journal model; auto-post from RPCs.

**Phase 5 — Tenant hardening.**
- Same-tenant invariant on allocations (composite FKs after adding `UNIQUE(id, tenant_id)` to parents, or a trigger); remove/gate `app.bypass_tenant_guard`; add `tenant_id` predicate to portal RLS; tighten always-true write policies to `is_staff_user()`/`has_role(...)`.

---

## 13. Database Improvements

- Collapse **dual status** to one canonical `status` (text + CHECK) or fully drive `status_id`; reconcile `approve_quote` to write whichever is canonical.
- Decide one quoting system or FK-link `case_quotes` ↔ `quotes`.
- Replace polymorphic `reference_type/reference_id` and `vat_*.record_type/record_id` with FK-backed (or enum-validated + checked) source links.
- Add `deleted_at` + `UNIQUE(bank_account_id, snapshot_date)` to `account_balance_snapshots`.
- Deprecate `payments.invoice_id`/`case_id` (or populate them only as a derived mirror inside the RPC) and the dead `invoiceService.recordPayment`.
- Add the missing FK indexes (§3).

---

## 14. Transaction & Concurrency Safeguards

- **Atomicity:** all money mutations inside one `SECURITY DEFINER` RPC transaction; remove app-side compensating rollback.
- **Isolation:** `SELECT … FOR UPDATE` on invoice rows before recompute (kills the lost-update); serialize number issuance via row lock or `UPDATE … RETURNING`.
- **Uniqueness backstop:** partial `UNIQUE` on every document number so a race can never *persist* a duplicate even if it computes one.
- **Idempotency:** accept a client request key on `record_payment` to make retries safe under network loss.
- **Conservation as constraint:** allocation-sum and balance invariants enforced in-DB so no path (RPC, import, admin) can violate them.

---

## 15. Audit Trail Recommendations

- **Append-only everywhere money moves:** `prevent_audit_mutation` on `financial_transactions`; `REVOKE` write/delete from non-privileged roles; remove contradictory permissive UPDATE policies on all audit tables.
- **Populate `financial_audit_logs`** via `AFTER INSERT/UPDATE/DELETE` triggers (or inside the RPCs) capturing `old_values`/`new_values` + `performed_by` on `invoices`/`payments`/`payment_allocations`/`invoice_line_items`/`quotes`.
- **Non-repudiation:** `created_by`/`performed_by` set server-side from `auth.uid()`, never trusted from client.
- **Reversal, not deletion:** refunds/voids/corrections are new balanced entries linked to the original — history is never erased.

---

## 16. Testing Scenarios

- **Partial payment:** 50% advance on a 630 invoice → `amount_paid=315`, `balance_due=315`, status `partial`; allocation = 315 (not 630). *(Directly reproduces the live bug.)*
- **Advance/overpayment:** payment > balance → rejected, or routed to a credit/unapplied balance (once modeled) — never silently clamped.
- **Multi-invoice allocation:** one payment split across N invoices; `Σ alloc = amount`; each `≤ its balance_due`; atomic.
- **Reversal/void:** void a fully-posted payment → invoice balances restored **and** a reversing ledger entry posted; original rows preserved.
- **Concurrency/race:** two simultaneous allocations to the same invoice → no lost update (`FOR UPDATE`); two simultaneous invoice creations → distinct, gap-explained numbers, no duplicate.
- **Tenant isolation:** allocation tying tenant A payment to tenant B invoice → rejected by same-tenant invariant; portal user of tenant A cannot read tenant B docs.
- **Rounding:** OMR (3dp) invoice with header discount → `header = Σ lines`; no sub-cent drift between form, stored value, and PDF.
- **VAT:** finalize invoice → `vat_records` emitted; issue credit note → negative VAT record; `vat_return.net_vat = output − input`.

---

## 17. Future Scalability Recommendations (thousands of tenants, millions of transactions)

- **Index the hot paths now** (allocation FKs, `payments.invoice_id`, partial tenant indexes already present) before volume arrives.
- **Append-only double-entry ledger partitioned by tenant and time** (declarative range partitioning on `transaction_date`); periodic `account_balance_snapshots` so balance reads don't scan full history.
- **Derive balances, don't recompute on read** — maintain `amount_paid`/`balance_due` transactionally in the RPC; reserve full recomputation for a reconciliation job that asserts `Σ live allocations = amount_paid`.
- **Move heavy aggregation off the OLTP path** (materialized views / scheduled rollups for dashboards and VAT periods); keep `get_*_stats` as `STABLE` invoker functions for correctness, but cache.
- **Keep RPC-centric writes** — atomic functions scale predictably and let you add idempotency/rate-limiting at one chokepoint rather than across many client calls.
- **Enforce the same-tenant and conservation invariants in-DB** so a single mis-scoped batch import at scale cannot corrupt money across thousands of tenants.

**Bottom line:** tenant isolation is solid; the money layer is not. Ship the atomic `record_payment` RPC and the append-only ledger first — they convert "we hope the app got it right" into "the database guarantees it." Everything else in this plan is necessary, but those two are the gate to production.