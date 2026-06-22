# xSuite Expense Management — Production-Readiness Audit

**Date:** 2026-06-21
**Module:** Expense Management (`src/lib/expensesService.ts`, `src/components/financial/ExpenseFormModal.tsx`, `src/pages/financial/ExpensesList.tsx`, `src/lib/financialReportsService.ts`, `src/lib/caseFinanceService.ts`, `src/components/importExport/*`, plus `public.expenses` schema, RLS, and the `financial_transactions` / `vat_records` ledgers)
**Scope:** Full lifecycle (create → submit → approve/reject → mark-paid → archive), data integrity & field persistence, workflow/RBAC, financial integration (ledger, P&L, cash flow, VAT, banking, case profitability), database schema/constraints/indexing/audit, UI/UX & accessibility, edge cases, multi-tenant isolation, performance, and import/export & feature gating.

**Method:** Multi-agent review — 11 finders generated candidate defects across the dimensions above; an adversarial verifier independently reproduced each claim against the live code and the canonical Supabase project (`ssmbegiyjivrcwgcqutu`), correcting line citations, role/RLS facts, and priorities; a completeness critic checked for gaps. Findings carrying a `needs-nuance` verdict were re-priced to the verifier's `corrected_priority`, and non-defects were dropped. Cross-dimension duplicates were merged into single root-cause findings.

> **Latency caveat — read first.** The live `expenses` table held **exactly 1 row** at audit time, and `financial_transactions` held **0 expense-type rows**. This means **none of the data-integrity defects below are currently corrupting production data** — they are **latent**. Every "books diverge / reports inflate / double-post" finding describes the failure mode that fires the moment the module is used at volume, an import runs, or a foreign-currency / approved-then-edited path executes. The defects are real and structural; the blast radius is zero **today** and grows linearly with use. Severities reflect the realized risk in production use, not the empty-table present.

---

## 1. Executive Summary

### Counts by priority (post-dedup, post-verification)

| Priority | Count |
|---|---|
| **Critical** | 7 |
| **High** | 20 |
| **Medium** | 16 |
| **Low** | 8 |
| **Total** | **51** |

### The single most important takeaway

**The expense module has no enforced state machine and no atomic approval, and the one place money touches the ledger (`approveExpense`) is unguarded, non-idempotent, and irreversible.** Every downstream financial defect — double-posted ledger rows, approved-then-edited amount drift, deleted-but-still-counted spend, two unreconciled "total expenses" numbers, zero-input-VAT, no cash disbursement leg — traces back to the same root: **expense status is a free-text column with a dangerous `DEFAULT 'approved'`, no `CHECK` constraint, no transition guard in service or DB, and side effects (ledger + VAT) that live only in client-callable application code rather than in an atomic, idempotent server transaction.** Fix the state machine and the approval RPC, and a third of this report collapses.

### Top 5 must-fix-before-production

1. **EXP-001 — Approval is unguarded, non-idempotent, and double-posts the append-only ledger.** `approveExpense` flips status and inserts a `financial_transactions` row with no `.eq('status','pending')` precondition and no idempotency key; `financial_transactions` has **no unique index on `(reference_type, reference_id)`**, and the ledger is append-only (`prevent_audit_mutation`), so a re-approval / double-click / retry permanently double-counts spend with no clean-up path.
2. **EXP-002 — Expense Preview / detail / receipt view is entirely dead (the reported "Preview not working" bug).** The View (Eye) button writes to a `useState` whose value slot is discarded (`const [, setSelectedExpense]`), no detail surface renders it, the Attachments button has no `onClick`, and there is no expense PDF/detail component anywhere. Approvers approve money blind, and uploaded receipts are unreachable.
3. **EXP-003 — Edit silently nulls the Category on every save (the reported "Edit not loading saved data" bug).** The list query projects the joined `category` object but not scalar `category_id`, so the edit form hydrates Category to blank and writes `category_id = null` on any save — corrupting category/budget/tax reporting on a routine edit. The same path renders a phantom "Payment Method" field bound to a column that does not exist.
4. **EXP-006 — Two unreconciled expense ledgers + four reversal/sync gaps.** P&L / cash-flow / case-profitability read the `expenses` table while the Transactions module reads `financial_transactions`; the two never tie out because edit-after-approval mutates one and not the other, soft-delete/archive reverses neither, and there is no compensating-entry path. Books cannot be trusted for tax or close.
5. **EXP-027 — Expense VAT is structurally always zero (input-VAT reclaim impossible).** `approveExpense` writes a `vat_records` row only when `case_id` is set, hardcoded to `vat_amount: 0, vat_rate: 0`, never reads the expense's `tax_amount`, and uses `record_type='expense'` which the VAT engine (`calculateVATForPeriod`, which sums only `'sale'`/`'purchase'`) never reads. A VAT/GST tenant over-declares output VAT with zero input offset — a direct tax-compliance/cash defect.

---

## 2. The 3 Reported Bugs — Root-Caused First

### (a) "Expense Preview not working" → **EXP-002**

**Root cause:** The feature was stubbed, never wired. In `src/pages/financial/ExpensesList.tsx:91` the selected-expense state is declared with an **empty value slot**:

```ts
const [, setSelectedExpense] = useState<ExpenseRow | null>(null);
```

The View (Eye) button (`ExpensesList.tsx:626-632`) calls `setSelectedExpense(expense)` but **nothing reads `selectedExpense`** — a repo-wide grep finds no consumer beyond the declaration. The Attachments (FileText) button (`ExpensesList.tsx:633-638`) has a `title` but **no `onClick` at all**. There is **no expense detail/preview/PDF component anywhere** (`src/lib/pdf/documents/` has 12 builders, none for expenses; `find src -iname '*expense*'` yields only the service, form modal, and list). The service plumbing already exists and is wasted: `fetchExpenseById` (`expensesService.ts:130`) returns the expense **with its attachments**, and `uploadExpenseAttachment` / `deleteExpenseAttachment` are exported but have zero UI callers.

**Fix:** Build an `ExpenseDetailModal`/drawer that consumes `selectedExpense` (or calls `fetchExpenseById`), renders all fields + status/approval metadata + the attachments list (from the existing service), and wire the Attachments button to it. Add a printable expense voucher via `pdfmake` if finance needs hard copy. Until then, hide the two inert buttons rather than ship dead controls.

### (b) "Edit not loading saved data" → **EXP-003**

**Root cause:** The edit form is hydrated from the **lean list row**, not the full record. The list query (`ExpensesList.tsx:120-136`) selects `category:master_expense_categories(id, name)` but **omits the scalar `category_id`** (and `currency`, `tax_amount`, `is_billable`, `bank_account_id`, `reference`, `receipt_url`). `handleEdit` passes that row straight in as `initialData`. The form reads `setCategoryId(initialData.category_id || '')` (`ExpenseFormModal.tsx:88`) → `category_id` is `undefined` → the Category dropdown shows blank. On save, `handleSubmit` always emits `category_id: categoryId || null` (`ExpenseFormModal.tsx:126`), and `updateExpense` spreads it through, so **a blind save writes `category_id = null`** — the category is destroyed on every edit. (`case_id` survives only because the list *does* select it.) The verifier confirmed this fires on **100% of edit-saves**, not an edge case.

A compounding sub-defect: the form also renders a **"Payment Method" dropdown bound to `initialData.payment_method_id`** and `paymentMethodId` state, but **`expenses` has no `payment_method_id` column** (confirmed against live schema; the `Expense` interface declares a phantom `payment_method_id?` at `expensesService.ts:31`, masked only by an `as unknown as` cast). It never persists and never reloads — a fully decorative, user-deceiving field.

**Fix:** Hydrate the edit form from `fetchExpenseById` (which selects `*`, so carries every scalar). Remove `payment_method_id` from the form and the `Expense` interface, or repurpose to the real `bank_account_id` column. Harden `updateExpense` to not overwrite `category_id` when the caller does not explicitly change it.

### (c) "Data-integrity issues across create/edit/approve/reporting"

This is not one bug; it is a **cluster** rooted in the missing state machine and the application-only ledger/VAT side effects. The reported symptom maps to these findings:

- **Create:** schema `status DEFAULT 'approved'` + no `CHECK` (**EXP-013**) means any insert that omits status is auto-approved with no ledger row; the form never collects `currency`/`tax_amount`/`is_billable`/`bank_account_id`/`reference`/receipt (**EXP-005**), so VAT is always 0, expenses are never billable, foreign currency is unrecordable.
- **Edit:** silent category loss (**EXP-003**); approved/paid amount/currency mutable via API with the posted ledger frozen (**EXP-006**); no optimistic lock so concurrent edits lost-update (**EXP-019**).
- **Approve:** double-post + no idempotency (**EXP-001**); self-approval (**EXP-008**); approval-date not expense-date ledger periodization (**EXP-024**); zero VAT (**EXP-027**); client-spoofable `created_by`/`approved_by` with no audit trail (**EXP-010**).
- **Reporting:** soft-deleted expenses counted in P&L/case profitability (**EXP-004**, **EXP-026**); two unreconciled ledgers (**EXP-006**); mixed accrual/cash basis (**EXP-025**); reject overwrites notes destroying context (**EXP-007**).

See the full findings for each.

---

## 3. Findings

Each finding renders all 9 fields and a stable ID. Within each section, ordered by priority (Critical → High → Medium → Low).

---

### 3.1 Lifecycle & State Machine

#### EXP-001 — Approval has no status guard or idempotency; re-approval double-posts the append-only ledger
- **Description:** `approveExpense` fetches the row, flips `status='approved'`, and unconditionally inserts a `financial_transactions` row (`reference_type='expense'`, `reference_id=id`) plus a `vat_records` row. It can approve from *any* prior status (draft never-submitted, already-approved, rejected, paid) and re-running it (double-click, network retry, stale cached row, direct API call) inserts a **second** ledger row for the same expense.
- **Root cause:** No state machine. The `UPDATE` keys only on `.eq('id', id)` with no `.eq('status','pending')` precondition and no row-affected check; `createFinancialTransaction` is a plain `.insert([...])` with no upsert/dedup; `financial_transactions` has **no unique index on `(reference_type, reference_id)`**; the ledger is append-only (`prevent_financial_transactions_mutation` BEFORE DELETE/UPDATE) so duplicates can never be cleaned up.
- **Evidence:** `src/lib/expensesService.ts:281-329` (unconditional update + `createFinancialTransaction` at :306-317); `src/lib/financialService.ts:33-60` (plain insert); live schema: only `financial_transactions_pkey` + `idx_financial_transactions_tenant` (no unique on the reference pair); only trigger on `expenses` is `set_expenses_tenant_and_audit`; `vat_records` has `uq_vat_records_record UNIQUE(record_type,record_id) WHERE deleted_at IS NULL`, so the *second* VAT insert errors **after** the duplicate ledger row is already committed → half-applied approval.
- **Reproduction:** 1) Approve a pending expense for 100 → one ledger row. 2) Call `approveExpense(id)` again (double-click before refetch, or via the exported service). 3) A second `financial_transactions` row for 100 is inserted; ledger-based reports double-count; attempting to delete the duplicate is blocked by the append-only trigger.
- **Business impact:** Permanent, uncorrectable overstatement of expenses → understated profit and wrong tax in any ledger-sourced report; a credibility failure for a forensic lab that sells auditability.
- **Technical impact:** Append-only ledger pollution with no remediation short of a manual reversing entry; VAT records duplicate/half-apply.
- **Recommended fix:** Move approval into an atomic `SECURITY DEFINER` RPC: `UPDATE ... WHERE id=$1 AND status='pending' RETURNING` (abort if 0 rows); post the ledger row only if none exists; add a **partial unique index** `financial_transactions(reference_type, reference_id) WHERE reference_type='expense' AND deleted_at IS NULL` (scope to `expense` so invoice/payment multi-row writers are untouched); do status flip + ledger + VAT in one transaction so a VAT failure rolls back the ledger.
- **Priority:** **Critical**

#### EXP-002 — Expense View / Attachments / detail is dead (the "Preview not working" bug)
- **Description:** The Eye (View) and Attachments row buttons do nothing; there is no expense detail/preview surface and no expense PDF builder. Approvers cannot inspect an expense or its receipt before approving; uploaded receipts are unreachable.
- **Root cause:** Feature stubbed — a setter wired to a button with no consumer (`useState` declared with empty value slot), Attachments button never given a handler, no detail/preview component or document builder ever built.
- **Evidence:** `src/pages/financial/ExpensesList.tsx:91` (`const [, setSelectedExpense] = useState<ExpenseRow | null>(null)`), :626-632 (View `onClick={() => setSelectedExpense(expense)}`, no consumer), :633-638 (Attachments button, no `onClick`); no expense component under `src/lib/pdf/documents/` or `src/components/documents/`; `fetchExpenseById` (`expensesService.ts:130`) already returns attachments; `uploadExpenseAttachment`/`deleteExpenseAttachment` exported with zero UI callers.
- **Reproduction:** Open Expenses → click Eye → nothing; click Attachments → nothing. No way to inspect detail or receipt for any status (Edit is gated to draft/pending, so approved/rejected/paid rows have no read path at all).
- **Business impact:** Approvers act on money with no detail/receipt view — a control/audit failure; receipts uploaded via the service are invisible.
- **Technical impact:** Dead state + dead handlers ship to production; orphaned service capability.
- **Recommended fix:** Build an `ExpenseDetailModal`/drawer consuming `selectedExpense`/`fetchExpenseById` (all fields + attachments + approval metadata via `AuditInfo`); wire the Attachments button; optionally add a `pdfmake` expense voucher.
- **Priority:** **Critical**

#### EXP-008 — No segregation of duties: a user can approve their own expense
- **Description:** Nothing — UI, service, RLS, or trigger — checks that the approver differs from the creator. `approveExpense` stamps `approved_by = current user` with no comparison to `created_by`. Any admin/accounts user who submitted an expense can immediately approve it themselves, posting the ledger.
- **Root cause:** `approveExpense` never loads `created_by` or asserts `created_by <> approvedBy`; RLS `expenses_update` checks role only (`has_role('accounts')`); the audit trigger does not stamp/validate actor identity.
- **Evidence:** `src/lib/expensesService.ts:281-329` (no SoD check); `ExpensesList.tsx:189` passes `profile?.id`; live RLS `expenses_update` USING/CHECK = `has_role('accounts')`; `created_by`/`approved_by` have no column default and are client-supplied. **Verifier correction:** the self-approval set is **admin + accounts** (the UI `isAccountsRole = admin||accounts` gates the button), not all staff; RLS `has_role('accounts')` resolves to owner/admin/manager/accounts. Either way the controllers of spend overlap exactly with the approvers.
- **Reproduction:** Log in as admin/accounts, submit an expense (pending), click Approve on your own row → succeeds, `approved_by == created_by`, ledger posted, no warning.
- **Business impact:** Defeats the core fraud control expense approval exists to provide; self-approved spend with a ledger posting undermines SOC-2/financial-controls posture for an NDA-bound lab.
- **Technical impact:** `approved_by` is decorative; combined with EXP-001 the same actor can create and repeatedly post ledger entries.
- **Recommended fix:** In the approval RPC, load `created_by` and throw if `created_by === approvedBy` (unless an explicit override policy applies); add a DB-side guard rejecting `status='approved'` when `approved_by = created_by`; server-stamp `approved_by = auth.uid()`; hide Approve on rows the current user created.
- **Priority:** **High** *(downgraded from Critical: requires an already-privileged, authenticated insider — a missing internal control, not a privilege-escalation/unauth path.)*

#### EXP-009 — No state-machine validation on any transition; status↔ledger desync on reject-after-approve
- **Description:** `submitExpense`/`approveExpense`/`rejectExpense`/`markExpenseAsPaid`/`updateExpense` are all unconditional `UPDATE`s with no precondition on current status. An already-approved-and-ledgered expense can be rejected (status flips, ledger row stays → dangling posting); a rejected/draft expense can be marked paid; `submitExpense` overwrites `created_by` with the submitter, destroying original authorship.
- **Root cause:** Transitions implemented as raw status writes with no allowed-transition map and no DB transition trigger; `status` has no `CHECK`; RLS gates coarse role, not state or SoD.
- **Evidence:** `expensesService.ts:266-279` (submit, overwrites `created_by`), :281-329 (approve), :331-350 (reject), :352-362 (mark-paid) — all unconditional; live: only `expenses_rate_source_chk`, no status/transition CHECK; no `submitted_by`/`submitted_at` columns exist.
- **Reproduction:** Approve (ledger posted) → call `rejectExpense` → status `rejected` but the `financial_transaction` remains; or `markExpenseAsPaid` on a `rejected` row → `paid`. None blocked.
- **Business impact:** Approved-and-paid expenses silently revert while money stays in the ledger; rejected expenses can be paid; same person submits and approves.
- **Technical impact:** Status and ledger desynchronize; `created_by` reassignment destroys authorship.
- **Recommended fix:** Allowed-transition map enforced in service **and** a DB trigger; reverse the ledger on any approved→rejected; add `submitted_by`/`submitted_at` instead of overwriting `created_by`; enforce approver≠creator.
- **Priority:** **High**

#### EXP-016 — Rejected expenses are a dead end: no resubmit, Edit hidden, `submitExpense` never called
- **Description:** After rejection the UI shows Edit only for draft/pending, so a rejected expense cannot be edited or resubmitted; there is no Resubmit action, and `submitExpense` (the draft→pending transition) has **zero callers** anywhere in the app.
- **Root cause:** Missing reject→resubmit loop; Edit gate omits `rejected`; the draft→pending transition is implemented in the service but never wired (the form sets status inline instead).
- **Evidence:** `ExpensesList.tsx:617` Edit gated `draft||pending`; `expensesService.ts:266` `submitExpense` — grep finds only the definition + barrel export; no resubmit handler.
- **Reproduction:** Submit → reject with reason → as submitter, the rejected row offers only View/Attachments (both dead); no way to correct and re-send.
- **Business impact:** Legitimate expenses rejected for fixable reasons are abandoned → duplicate re-entry.
- **Technical impact:** State machine has no edge out of `rejected`; `submitExpense` dead code signals an unfinished workflow.
- **Recommended fix:** Add a Resubmit action for rejected/draft (clear rejection metadata, set `status='pending'`); include `rejected` in the Edit gate; wire or fold in `submitExpense` as the canonical transition.
- **Priority:** **Medium** *(downgraded from High: peripheral internal-finance friction with trivial workarounds; not a custody/audit/revenue control point.)*

---

### 3.2 Data Integrity & Field Persistence

#### EXP-003 — Edit silently nulls the Category on every save; phantom Payment Method field
- **Description:** Editing any expense re-opens with Category blank (the list never carries `category_id`) and a blind save writes `category_id = null`, corrupting category reporting on 100% of edits. The Payment Method dropdown is bound to a nonexistent column and is never persisted.
- **Root cause:** Edit reuses the lean list row as `initialData` instead of refetching the full record; the list projection drops scalar `category_id`; `handleSubmit` always emits `category_id: categoryId || null`. The `Expense` interface declares a phantom `payment_method_id` for a column that does not exist (masked by `as unknown as` casts, which is why schema-drift CI never caught it).
- **Evidence:** `ExpensesList.tsx:120-136` (projection lacks `category_id`), :54-72 (`ExpenseRow` type lacks it), :221-225 (handleEdit passes lean row); `ExpenseFormModal.tsx:88` (`setCategoryId(initialData.category_id || '')`), :126 (`category_id: categoryId || null`), :90/:284-297 (phantom payment-method binding); live schema: no `payment_method_id` on `expenses`; `expensesService.ts:31` (phantom interface field).
- **Reproduction:** Create with category Software → Edit → Category shows blank → Save as Draft → list shows N/A; category report drops the spend into Uncategorized. Pick a payment method, save → never stored.
- **Business impact:** `getExpensesByCategory` (P&L/budget/tax category breakdowns) silently under-reports categorized spend; users believe a payment method was captured.
- **Technical impact:** Lossy edit round-trip; a UI field maps to no column; type diverges from schema.
- **Recommended fix:** Hydrate the edit form via `fetchExpenseById` (selects `*`); remove `payment_method_id` from the form and the interface (or repurpose to `bank_account_id`); guard `updateExpense` against blind `category_id` overwrite.
- **Priority:** **Critical**

#### EXP-005 — Six DB fields never collected: currency, tax_amount, is_billable, bank_account_id, reference, receipt_url
- **Description:** `ExpenseFormModal` collects only date, amount, description, vendor, category, case, (phantom) payment method, notes. It never collects `currency` (→ foreign-currency expenses impossible), `tax_amount` (→ VAT always 0), `is_billable` (→ case rebilling impossible), `bank_account_id` (→ no payment account), `reference`, or receipt upload. CSV exports emit Tax/Currency/Billable columns that are structurally constant.
- **Root cause:** Form/onSave omission; the schema columns exist with defaults (`tax_amount=0`, `is_billable=false`, `currency='USD'`, others NULL) that the form can never override. **Verifier note:** the *service* (`createExpense`/`updateExpense`) already handles `currency`/`tax_amount` via `resolveRateContext` — the gap is purely that the form never sends them; `is_billable`/`bank_account_id`/`reference`/receipt are absent both in form and effective payload.
- **Evidence:** `ExpenseFormModal.tsx:121-130` (7-field onSave payload); live schema defaults confirmed; `ExpensesList.tsx:281-285,377-380` (export columns); `approveExpense` writes `vat_amount:0` regardless (`expensesService.ts:319-326`).
- **Reproduction:** Create any expense → `tax_amount=0, is_billable=false, currency=base, bank_account_id/reference/receipt_url=NULL`, with no UI to set otherwise; CSV Tax always 0, Billable always 'no'.
- **Business impact:** Input VAT structurally uncapturable (wrong VAT returns for any VAT/GST tenant); billable pass-through costs (donor drives, cleanroom consumables) can never be rebilled → case profitability understated; no foreign-currency capture; no receipt at intake.
- **Technical impact:** Multiple report/export/billing paths read columns frozen at defaults.
- **Recommended fix:** Add inputs for currency (defaulting to tenant base via `TenantConfigContext`), `tax_amount` (with auto-calc helper), `is_billable` toggle (enabled when a case is linked), `bank_account_id`, `reference`, and a receipt file input wired to `uploadExpenseAttachment`; thread through onSave → service; wire `approveExpense`'s VAT record to the real `tax_amount`.
- **Priority:** **Critical**

#### EXP-007 — `rejectExpense` overwrites the user's notes with the rejection reason (irreversible data loss)
- **Description:** Rejecting writes `notes = reason`, clobbering whatever the submitter typed; the list then renders `notes` as the rejection reason for rejected rows, cementing the loss. No history/audit copy exists.
- **Root cause:** No dedicated `rejection_reason` column; the reason is shoehorned into the shared `notes` column with a blind overwrite. (`rejectExpense` also reuses `approved_by`/`approved_at` to record the rejector — a second semantic collision.)
- **Evidence:** `expensesService.ts:342` (`notes: reason`); `ExpensesList.tsx:591-595` renders `notes` for rejected rows; live schema: `expenses` has `notes` but **no `rejection_reason`/`rejected_by`/`rejected_at`**.
- **Reproduction:** Create with notes "Reimburse via payroll, see receipt #44" → reject with "Missing VAT receipt" → original note gone.
- **Business impact:** Loss of submitter intent/justification on the records being disputed; bad for audit and re-submission.
- **Technical impact:** Destructive write to a shared free-text column with no field history.
- **Recommended fix:** Add `rejection_reason` (and `rejected_by`/`rejected_at`) columns (additive migration; regen `database.types.ts`); write the reason there, leave `notes` intact; render the dedicated field in the list.
- **Priority:** **High**

#### EXP-010 — Zero audit trail for the expense lifecycle; actor fields are client-spoofable and unstamped
- **Description:** No expense lifecycle operation (create/edit/submit/approve/reject/delete/mark-paid) writes to `audit_trails`, `case_job_history`, or any history table. `created_by`/`approved_by` are written entirely from the client with no server validation; `submitExpense` overwrites `created_by` with the submitter; there is no `updated_by` column. Approving a case-linked expense logs nothing to the case timeline.
- **Root cause:** `expenses` was excluded from the v1.2.0 DB-side `set_audit_actor_fields()` rollout (which covers cases/invoices/quotes/customers_enhanced/companies/case_internal_notes/case_devices). The only trigger, `set_tenant_and_audit_fields`, stamps tenant_id + timestamps only — it does not set or validate actor fields. The service never calls `log_audit_trail`/`log_case_history`.
- **Evidence:** live trigger inventory (no `*_audit_actor` on `expenses`); `set_tenant_and_audit_fields` body sets only tenant/created_at/updated_at; grep for `log_audit_trail`/`log_case_history`/`case_job_history` across the expense files → none; `created_by`/`approved_by` nullable, no default, client-supplied (`ExpensesList.tsx:168,189,200`); no `updated_by` column. **Verifier note:** merely attaching `set_audit_actor_fields` is *not* sufficient — it `COALESCE`s rather than forces `auth.uid()`, so the trigger must **force** `created_by := auth.uid()` on INSERT and set `approved_by := auth.uid()` on the approve/reject transition.
- **Reproduction:** Create→submit→edit amount→approve→mark-paid an expense; query `audit_trails`/`case_job_history` → no rows. Submit with `created_by` set to another employee's id via the service → stored as that employee. Approve with an arbitrary `approved_by` → no server validation.
- **Business impact:** Money-bearing records have a forgeable, gap-filled audit trail on a platform whose core value is forensic auditability — fails financial-controls and dispute reconstruction.
- **Technical impact:** Mutations untracked; `created_by` can be wrong/NULL; inconsistent with every other financial entity.
- **Recommended fix:** Extend the DB-side actor-stamping to `expenses` but **force** `created_by := auth.uid()` (INSERT) and `approved_by := auth.uid()` (transition), not COALESCE; add `updated_by`; add an append-only expense history (or fold into `audit_trails`) capturing actor + before/after amount/status/category; stop trusting client actor ids; log `case_job_history` on case-linked approve/paid.
- **Priority:** **High**

#### EXP-006 — Two unreconciled ledgers + four ledger-sync gaps (edit, delete, periodization, divergent readers)
- **Description:** Approved expenses are represented in **two places that never reconcile**: the `expenses` table (read by P&L / cash-flow / revenue-by-case / `fetchFinancialSummary` / `ReportsDashboard`) and the `financial_transactions` ledger (read by the Transactions module / `getTransactionStats` / `getCashFlowSummary`). They diverge the instant any of these happen: (i) **edit-after-approval** mutates `expenses.amount`/`amount_base` but never the frozen, append-only ledger row; (ii) **soft-delete / bulk-archive** sets `deleted_at` on the expense but never voids the posted `financial_transaction` (or `vat_record`), and ledger readers filter only the ledger row's own `deleted_at`, so orphan spend lives forever; (iii) the ledger posts at **approval date**, not `expense_date`, while expenses-table reports bucket by `expense_date`, so the same expense lands in two different months; (iv) RLS permits editing approved/paid amount/currency for `has_role('accounts')` with no status gate (UI only hides the Edit button).
- **Root cause:** The approval→ledger write is fire-and-forget; no reversal/re-post primitive; no single source of truth; `updateExpense`/`deleteExpense` are single-table operations with no compensating ledger entry; the ledger is append-only so nothing auto-corrects.
- **Evidence:** Write — `expensesService.ts:306-317` (`createFinancialTransaction` ref_type `expense`, `transaction_date = today`); expenses-table readers — `financialReportsService.ts:97-108` (P&L), :248-253 (cash flow), :406-417 (revenue-by-case), `financialService.ts:101-129`, `ReportsDashboard.tsx:235-247`; ledger readers — `transactionsService.ts:205-211,262-291`; `updateExpense` re-snapshots `amount_base` but never touches the ledger (`expensesService.ts:191-250`); `deleteExpense`/bulk-archive set `deleted_at` only (`expensesService.ts:252-264`, `ExpensesList.tsx:310-313`); live: append-only `prevent_financial_transactions_mutation`, a `reverse_financial_transaction` RPC exists but is never called from the expense flow; live data: 22 income / 0 expense ledger rows vs 1 pending expense (the ledger expense path has never executed).
- **Reproduction:** Approve 100 → P&L (expenses table) shows 100, Transactions ledger shows 100. Edit amount → 200: P&L shows 200, frozen ledger still 100. Or archive the approved expense: it leaves the P&L (expenses filter `deleted_at`) but the ledger row persists in Transactions/cash-flow forever. Or approve a Jan-31 expense on Feb-2: expense-date reports → January, ledger → February.
- **Business impact:** Two different "total expenses"/cash-flow figures depending on the screen; books cannot be trusted for tax, pricing, or close; tax-period returns wrong.
- **Technical impact:** Permanent divergence with no reconciliation layer; orphan ledger/VAT rows that cannot be deleted (append-only).
- **Recommended fix:** Pick **one** source of truth. Given 100% of report consumers already read the `expenses` table and the ledger expense path has never run, the lower-effort call is to **stop posting expenses to `financial_transactions`** and keep reports on the expenses table — OR make all reports read the ledger and treat `expenses` as a document. Whichever: block amount/currency edits once approved/paid (DB trigger + RPC) and require void+reissue or an adjusting entry; on soft-delete/void of an approved/paid expense, call `reverse_financial_transaction` for the linked row inside the same transactional RPC and soft-delete the `vat_record` (route the raw bulk-archive update through the RPC too); set ledger `transaction_date = expense.expense_date`; add a reconciliation test asserting `SUM(approved expenses) == SUM(financial_transactions expense)` per period.
- **Priority:** **Critical**

#### EXP-004 — Soft-deleted / non-final expenses leak into case & category readers (missing `deleted_at`/status filters)
- **Description:** Several expense readers omit `.is('deleted_at', null)`, so archived expenses keep showing/counting; `getCaseExpenses` (Case Finances tab "Case Expenses" list) additionally omits any status filter, so draft/rejected expenses appear under the case. The case **summary** (`getCaseFinancialSummary`) *does* filter, so the list and the KPI tile disagree on the same screen.
- **Root cause:** Inconsistent application of the soft-delete contract across readers; `deleteExpense` soft-deletes but readers were not all updated.
- **Evidence:** `caseFinanceService.ts:99-117` (`getCaseExpenses` — no `deleted_at`, no status filter) vs :52-57 (summary filters both); rendered at `CaseFinancesTab.tsx:450-491`; `expensesService.ts:445-457` (`getExpensesByCase` — no `deleted_at`/status, **zero live callers** = hygiene only), :508-529 (`getExpensesByCategory` — no `deleted_at`; **test-only caller today**). Contrast `getExpenseStats` (:471) and `fetchExpenses` (:93) which do filter.
- **Reproduction:** Add 2 expenses to a case, archive one, add a draft. Open the case Finances tab → the "Case Expenses" list shows the archived + draft rows while the KPI tile excludes them.
- **Business impact:** Per-case spend shown to staff (and potentially customer-facing case reports) includes deleted/non-final spend, contradicting the KPI and eroding trust in case profitability.
- **Technical impact:** List-vs-summary inconsistency; soft-deleted rows leak into a user-facing list.
- **Recommended fix:** Add `.is('deleted_at', null)` to `getCaseExpenses` (and to `getExpensesByCase`/`getExpensesByCategory` for hygiene); decide whether the case list should mirror the summary's `approved/paid` status set or intentionally show pending/rejected (a product decision). Add an ESLint/test guard that every expense aggregate query includes the `deleted_at` predicate.
- **Priority:** **Medium** *(KPI totals remain correct; this is a display/trust inconsistency requiring a prior soft-delete to manifest. The reporting-layer variant is **EXP-026** below; the unused readers are hygiene-only.)*

#### EXP-019 — No optimistic-lock / version precondition on `updateExpense` (lost update)
- **Description:** `updateExpense` issues a bare `.update(...).eq('id', id)` with no `updated_at`/version precondition. Two concurrent editors (or a stale tab) silently overwrite each other — last write wins, including amount/category/vendor/notes — with no conflict detection and no `updated_by` to attribute the winner.
- **Root cause:** Unconditional UPDATE keyed only on id; `updated_at` (which the trigger bumps on every write) is never read into the form or used as a token; no `updated_by` column.
- **Evidence:** `expensesService.ts:241-249`; `ExpenseFormModal.tsx:82-95` (initialData omits `updated_at`); live: `updated_at timestamptz NOT NULL DEFAULT now()` exists, no `updated_by`.
- **Reproduction:** A opens Edit (amount 100); B edits same row to 500 and saves; A (stale) changes vendor and saves → amount reverts to 100, B's 500 lost, no warning.
- **Business impact:** Silent loss of corrections to money-bearing records in a multi-user accounts team; an approved amount/vendor change can be reverted with no trail.
- **Technical impact:** Classic lost-update anomaly; no conflict detection, no winner attribution.
- **Recommended fix:** Load `updated_at` into the edit form and pass it back; add `.eq('updated_at', expectedUpdatedAt)` and treat `maybeSingle()===null` as a "modified by another user, reload" conflict surfaced via toast; add `updated_by` stamped in the trigger.
- **Priority:** **High**

---

### 3.3 Workflow, Permissions & RBAC

#### EXP-011 — `updateExpense`/transitions editable on any-status expense by accounts-or-higher; UI gating is cosmetic
- **Description:** RLS `expenses_update` = `has_role('accounts')` (owner/admin/manager/accounts) with **no status or `created_by` predicate**; the service mutators key only on `.eq('id', id)`. The UI hides Edit for non-draft/pending and Approve/Reject for non-pending, but those are render conditions — any qualifying user can edit amount/currency/category/status of any expense in any status (including someone else's, including post-approval) via direct API call.
- **Root cause:** No row-ownership predicate and no status predicate on UPDATE RLS; no `created_by`/status check in the service; hierarchical `has_role` treats expenses as a shared editable ledger.
- **Evidence:** live `expenses_update` USING/CHECK = `has_role('accounts')`; `expensesService.ts:191-264,281-350`; UI-only gates at `ExpensesList.tsx:599,617`. **Verifier correction:** the editable role set is owner/admin/manager/accounts — *not* technician/sales/hr; tenant isolation (RESTRICTIVE) is intact so this is intra-tenant only.
- **Reproduction:** User B (accounts) calls `supabase.from('expenses').update({amount: 999999}).eq('id', E)` on User A's pending expense → succeeds.
- **Business impact:** No accountability/segregation on money records; a staff member can alter or approve a colleague's expense, including amount before it posts.
- **Technical impact:** `created_by` is unreliable as ownership (mutable by any accounts user via `submitExpense`); no DB invariant ties an expense to its submitter for edit/approve.
- **Recommended fix:** `created_by`-aware authorization: restrict submitter-editable fields to `created_by = auth.uid()` while draft/pending; require approver role AND `created_by <> auth.uid()` for approve/reject; add a status-transition guard. Enforce in RLS or a `SECURITY DEFINER` transition RPC, not just the UI.
- **Priority:** **High**

#### EXP-012 — UI approver gate (admin||accounts) diverges from RLS (owner/admin/manager/accounts); hardcoded role strings
- **Description:** The UI restricts approve/reject to `isAccountsRole = admin||accounts` while RLS allows the write for `has_role('accounts')` (owner/admin/manager/accounts). So owner/manager have hidden approve/edit/markPaid power the UI never surfaces, and the component hardcodes role-string literals instead of using `PermissionsContext` (forbidden by CLAUDE.md).
- **Root cause:** Authorization hardcoded as literal role comparisons that don't match the hierarchical RLS set; `PermissionsContext` not consulted.
- **Evidence:** `ExpensesList.tsx:112` (`isAccountsRole = admin||accounts`), :84 (`canBulkArchive = owner||admin`); live `expenses_update` = `has_role('accounts')`; `PermissionsContext` never imported here. **Verifier:** earlier "technician/sales/hr can update" claim is **wrong** — those roles do not pass `has_role('accounts')`. The 'accounts' role itself is in both gates (not blocked).
- **Reproduction:** Log in as manager/owner → no Approve/Reject buttons, but `approveExpense`/`rejectExpense` succeed via the service.
- **Business impact:** Incoherent permission model; managers/owners have hidden powers; on-screen control list is untrustworthy to auditors.
- **Technical impact:** Two non-converging sources of truth for authorization; CLAUDE.md hardcoded-role violation.
- **Recommended fix:** Decide the canonical approver set; converge UI and RLS (ideally a status-transition-specific policy); replace hardcoded literals with `PermissionsContext`.
- **Priority:** **High**

#### EXP-017 — `markExpenseAsPaid` records no disbursement; approved→paid transition unreachable in the UI
- **Description:** `markExpenseAsPaid` only flips `status='paid'` — no payment date, no `bank_account_id`, no `payment_disbursement`, no `bank_transaction`, no balance decrement. And it has **zero UI callers**: the row actions offer only approve/reject/edit/view/attachments, so an approved expense can never reach `paid` through the product. The 'Paid' filter tab and KPI are decorative; Aged Payables never clears; banking is fully disconnected from expenses.
- **Root cause:** The payment/disbursement step was stubbed to a status flag and never wired to UI or banking. `bankingService` has `createDisbursement` + `updateAccountBalance` (with an insufficient-balance guard) but the expense path never calls them; the form never captures `bank_account_id` (dead column).
- **Evidence:** `expensesService.ts:352-362` (status flip only); grep `markExpenseAsPaid` → service + export only; `ExpensesList.tsx:597-639` (no Mark-Paid action); `financialReportsService.ts:488-526` (Aged Payables buckets everything not in paid/cancelled/rejected); `bankingService.ts:428-480,682-706` (unused by expenses); `expenses.bank_account_id` exists but no write path sets it.
- **Reproduction:** Approve an expense; look for Mark-as-Paid → none; click 'Paid' tab → always empty; query `bank_transactions`/`payment_disbursements` → no row; cash-flow closing balance (from `bank_accounts.current_balance`) and the expense-based "payments" never reconcile.
- **Business impact:** AP cannot be operated from xSuite; payable-vs-paid is untrackable; bank/cash position overstated; disbursement governance (approval, insufficient-balance) bypassed; lab cannot answer "which account paid this, when".
- **Technical impact:** Lifecycle stage #14 non-functional; cash-flow components sourced from incompatible tables; `bank_account_id` permanently NULL.
- **Recommended fix:** Add a "Mark as Paid / Record Payment" action (role-gated, guarding only approved→paid, idempotent) that opens an account/date modal and calls an **atomic disbursement RPC** which captures `bank_account_id` + `paid_at`, creates a `payment_disbursement` + `bank_transaction`, debits the account balance, and stamps the expense — debit at payment time, not approval. Surface the account picker in the UI.
- **Priority:** **High**

#### EXP-018 — Delete authority is incoherent: bulk-archive (owner/admin) vs soft-delete-by-UPDATE (owner/admin/manager/accounts); the DELETE policy is dead
- **Description:** Bulk archive is gated to owner/admin in the UI and soft-deletes via `UPDATE deleted_at`; single-row `deleteExpense` also soft-deletes via UPDATE, which RLS authorizes for `has_role('accounts')`. The dedicated `expenses_delete = has_role('admin')` policy governs hard DELETE, which the app never issues, so it is effectively dead, and the real delete-equivalent (soft-delete) is open to manager/accounts too.
- **Root cause:** Soft-delete is an UPDATE, governed by the UPDATE policy (`has_role('accounts')`), not the DELETE policy (`has_role('admin')`); the UI bulk path adds an extra owner/admin restriction the single-row/API path does not share.
- **Evidence:** `ExpensesList.tsx:84,310-313`; `expensesService.ts:252-264`; live `expenses_delete` USING = `has_role('admin')` (hard DELETE only), `expenses_update` = `has_role('accounts')`.
- **Reproduction:** As manager/accounts, call `deleteExpense(id)` → succeeds despite the bulk-archive UI claiming admin-only.
- **Business impact:** Who can remove financial records is ambiguous and broader than intended; managers/accounts can hide approved/ledgered expenses while messaging says admin-only.
- **Technical impact:** Delete authority split across two policies, one unreachable; soft-delete bypasses the intended admin gate.
- **Recommended fix:** Gate the `deleted_at` UPDATE to admin (column-aware RLS/trigger or an archival RPC) to match intent; align single-row delete, bulk archive, and policy; block/reverse deletion of approved/paid expenses (ties to EXP-006).
- **Priority:** **High**

---

### 3.4 Financial Integration — Ledger, P&L, Cash Flow, VAT, Banking, Profitability

#### EXP-027 — Expense VAT records are always zero AND use the wrong `record_type` → input-VAT reclaim impossible
- **Description:** On approval, `approveExpense` writes a `vat_records` row **only when `case_id` is set**, hardcoded `vat_amount:0, vat_rate:0`, and never reads `tax_amount`/`tax_amount_base`; the row's `record_type='expense'` is invisible to the VAT engine, which sums only `'sale'`/`'purchase'`. So input VAT from expenses is always 0, and the purpose-built `createVATRecordFromPurchase` (`record_type='purchase'`) is never called.
- **Root cause:** Hardcoded zero VAT + wrong `record_type` + `case_id` gate (an unrelated dimension); the approve fetch doesn't even select `tax_amount`. Upstream, the form never collects `tax_amount` (EXP-005).
- **Evidence:** `expensesService.ts:284` (no `tax_amount` in select), :319-326 (`vat_amount:0, vat_rate:0`, gated on `case_id`); `vatService.ts:113-118` (`calculateVATForPeriod` filters `'sale'`/`'purchase'` only), :227-237 (`createVATRecordFromPurchase` unused); live `vat_records`: 21 rows all `'sale'`, 0 `'expense'`/`'purchase'`; `uq_vat_records_record UNIQUE(record_type,record_id) WHERE deleted_at IS NULL`.
- **Reproduction:** Create an expense with real VAT → approve → run `calculateVATForPeriod`/`createVATReturnFromPeriod` → `input_vat = 0`; `net_vat = output − 0` = overstated payable.
- **Business impact:** A VAT/GST tenant over-reports VAT payable on every return (no input-VAT recovery on donor drives, cleanroom consumables, parts) — direct tax-compliance/audit exposure and cash loss.
- **Technical impact:** `getVATStats`/`createVATReturnFromPeriod`/`getQuarterlyVATSummary` all return `input_vat=0` from expenses; the `'expense'` rows are dead data.
- **Recommended fix:** Collect `tax_amount`+rate on the form; on approval call `createVATRecordFromPurchase` (or write `record_type='purchase'`) with the real `vat_amount`/`vat_rate` (base where appropriate) for **all** taxable expenses regardless of `case_id`; populate `tax_period` from `expense_date`; do it in the same idempotent approval transaction (the unique index keys on `(record_type, record_id)`, so soft-delete any stale zero `'expense'` rows during backfill).
- **Priority:** **Critical**

#### EXP-006 — Two unreconciled ledgers + ledger-sync gaps
*(See §3.1/3.2 — the canonical financial-integration root cause. **Critical.** Listed once; cross-referenced here.)*

#### EXP-001 — Approval double-posts the append-only ledger
*(See §3.1. **Critical.** Cross-referenced.)*

#### EXP-024 — Ledger posts at approval date, not `expense_date` — wrong-period bucketing
- **Description:** `approveExpense` sets the ledger `transaction_date` to today (the approval day), ignoring `expense_date`. Ledger-based reports bucket the expense into the month approved; expenses-table reports bucket by `expense_date`. The same expense lands in two different months, and `markExpenseAsPaid` posts nothing, so there is no cash-basis event either.
- **Root cause:** `transaction_date: new Date()...` instead of `expense.expense_date`; the approve fetch doesn't select `expense_date`; the codebase's own intent (comment at `financialReportsService.ts:647-648`) treats `expense_date` as the canonical monthly assignment.
- **Evidence:** `expensesService.ts:307` (today); `financialReportsService.ts:251-253,657-661` (expense_date bucketing); `markExpenseAsPaid` posts nothing; ledger append-only so mis-dated rows are uncorrectable.
- **Reproduction:** expense_date Jan-31, approved Feb-2 → P&L/invoice-vs-expense → January; Transactions cash-flow → February.
- **Business impact:** Period close, monthly P&L, and cash-flow disagree across screens; a month-end approval batch shifts prior-month costs into the current month on ledger views.
- **Technical impact:** Neither true accrual nor true cash basis; cross-report period drift.
- **Recommended fix:** Set ledger `transaction_date = expense.expense_date` at approval (add `expense_date` to the fetch); align the basis across report families; if cash-basis is desired, post at `markExpenseAsPaid` with the payment date instead.
- **Priority:** **High**

#### EXP-028 — Soft-delete/edit/re-approve leaves the GL out of sync (general-ledger integrity)
- **Description:** `financial_transactions` is the GL surrogate (no separate journal/GL table exists). The approval→ledger write has no lifecycle bookkeeping: re-approve double-posts (no unique key), delete/archive leaves the row (orphan inflates GL forever), edit-of-approved leaves the original amount stale. Any GL-based P&L/tax/audit is wrong.
- **Root cause:** Fire-and-forget ledger write; no status CHECK on `expenses`; no unique/reversal pattern.
- **Evidence:** `expensesService.ts:281-329,252-264,191-250`; live: no unique on `(reference_type,reference_id)`, no status CHECK (only `expenses_rate_source_chk`); `financial_transactions` is the sole GL-like table.
- **Reproduction:** As EXP-001/EXP-006 (re-approve / delete / edit), observed against ledger totals.
- **Business impact:** Unreconcilable GL — a serious audit finding for a forensic lab.
- **Technical impact:** Orphan/duplicate ledger rows with no back-reference cleanup; append-only philosophy half-implemented (posts on approve, no compensating entry on reverse).
- **Recommended fix:** *(Merged into EXP-006's remediation — atomic approve/reverse RPC + status CHECK + partial unique index + compensating `status='voided'` entries.)* Listed for completeness; **High** — but covered by EXP-001/EXP-006 fixes.
- **Priority:** **High** *(remediated by EXP-001 + EXP-006)*

#### EXP-031 — Expense CSV import bypasses the approval ledger entirely
- **Description:** The generic ImportWizard does a raw `supabase.from('expenses').insert(...)`, never calling `createExpense`/`approveExpense`. Because `status` DEFAULTs to `'approved'` and there is no CHECK, imported rows land approved with **no `financial_transaction`**. Expenses dashboards (which count `status IN ('approved','paid')`) show the money; ledger-based reports do not — permanent divergence by the full imported amount.
- **Root cause:** Generic table-loader with no per-entity post-insert hook for the domain side-effects; the DB default `'approved'` turns "load raw rows" into "create approved spend with no ledger".
- **Evidence:** `ImportWizard.tsx:245-261` (raw insert); `expensesService.ts:281-326` (approve is the only ledger/VAT writer); live: `status DEFAULT 'approved'`, no status CHECK, no unique on `(reference_type,reference_id)`; expenses is a registered import entity (`importExportService.ts:160-175`); template omits `status`.
- **Reproduction:** Import 50 expense rows → status `approved` → Reports/Transactions P&L missing them; Expenses dashboard counts them; totals disagree by the full import.
- **Business impact:** Direct financial misstatement on the canonical historical-import path — approved spend that never hits the GL; profit/tax/VAT wrong.
- **Technical impact:** Permanent expenses-vs-ledger divergence; no reconciliation.
- **Recommended fix:** Route money-bearing imports through a server-side RPC (or per-row `createExpense`) that forces `status='pending'`/`'draft'` unless an approver is recorded, and on approved import writes the matching ledger + VAT atomically and snapshots currency/rate/`amount_base`. Minimum hardening: add the `status` CHECK and the partial unique index (EXP-013/EXP-001).
- **Priority:** **Critical**

#### EXP-030 — `markExpenseAsPaid`/`approveExpense` never link a bank account; cash side missing
*(Merged into EXP-017 — banking disconnection. **High.** Cross-referenced; the cash-flow closing-balance-vs-payments non-reconciliation is the financial-integration face of EXP-017.)*

#### EXP-029 — Expense ledger entries omit `category_id` and `bank_account_id` (thin GL)
- **Description:** `financial_transactions` carries `category_id`/`bank_account_id` columns, but `createFinancialTransaction`'s input type has neither and `approveExpense` forwards neither, so every expense ledger row is uncategorized and unbanked — the ledger can't drive a categorized/account-aware GL; category reporting is re-derived from the expenses table instead.
- **Root cause:** `CreateFinancialTransactionInput` has no `category_id`/`bank_account_id`; approve doesn't forward them.
- **Evidence:** live `financial_transactions` has both columns; `financialService.ts:8-23,38-50` (input type/payload omit both); `expensesService.ts:306-317` (approve passes neither); live: 0 expense ledger rows.
- **Reproduction:** Approve a categorized expense → ledger `category_id`/`bank_account_id` both NULL.
- **Business impact:** No trustworthy categorized GL; period close stays manual once the ledger is actually used.
- **Technical impact:** `financial_transactions` structurally incomplete as a GL for expenses.
- **Recommended fix:** Extend `CreateFinancialTransactionInput` with `category_id`/`bank_account_id`; forward `category_id` (and the paying account at payment time) from the approve/mark-paid RPCs.
- **Priority:** **Medium** *(downgraded: forward-looking architectural gap — the ledger expense path is unused today and category reporting already works off the expenses table.)*

#### EXP-014 — Case profitability ignores `is_billable`; divergent invoice filters between the two case-profit surfaces
- **Description:** `getCaseFinancialSummary` computes margin from `totalPaid − totalExpenses(all approved/paid)` with no `is_billable` branch, so billable pass-through costs (recharged to the customer) are subtracted again as cost while also recovered in revenue — double-counting and understating margin. `is_billable` is also dead end-to-end (form never sets it). Separately, `generateRevenueByCaseReport` counts case revenue with **no invoice_type/status filter** (counts proforma/void), while `getCaseFinancialSummary` filters to `tax_invoice` & non-void — the two case-profit surfaces disagree.
- **Root cause:** Margin formula treats every expense as unrecovered cost; `is_billable` uncaptured and unconsumed; duplicated case-profit logic with divergent invoice filters.
- **Evidence:** `caseFinanceService.ts:79-82` (no `is_billable`), :73-75 (tax_invoice-only); `financialReportsService.ts:393-441` (no invoice_type/status filter); `is_billable` written only by timesheets, never expenses; live `is_billable DEFAULT false`.
- **Reproduction:** $200 donor-drive (billable) + invoice the customer $200 + $500 labor, paid $700. Summary margin = (700−200)/700; true margin should be 500/500. Revenue-by-Case also counts a proforma the summary excludes.
- **Business impact:** Per-case margin systematically understated for any recharged-parts job (common in recovery), and two reports show different case profit — wrong pricing/job-acceptance decisions.
- **Technical impact:** `is_billable` dead; duplicated divergent profit logic guarantees inconsistency.
- **Recommended fix:** Capture `is_billable` (EXP-005); branch margin on rebillable vs absorbed (net billable expenses against the matching invoice line); unify the invoice filter in `generateRevenueByCaseReport` to match the summary (tax_invoice, exclude void/cancelled/converted); source both from one shared helper.
- **Priority:** **High** *(latent until `is_billable` capture exists — fix both halves together so adding capture doesn't activate the double-count.)*

#### EXP-026 — P&L / Reports / Cash-Flow / Revenue-by-Case expense queries omit `deleted_at` — soft-deleted spend inflates reports
- **Description:** `generateProfitLossReport`, `generateCashFlowReport`, `generateRevenueByCaseReport` (and the `ReportsDashboard` inline P&L + expenses-by-category queries) filter on status but **not** `deleted_at`, so soft-deleted approved/paid expenses still reduce net profit and case margin — contradicting the (filtered) Expense-by-Category and Invoice-vs-Expense reports.
- **Root cause:** Inconsistent soft-delete predicate across `financialReportsService` functions; `deleteExpense` sets `deleted_at` but not status, so status-only filters still match deleted rows.
- **Evidence:** `financialReportsService.ts:97-108,248-253,406-417`; `ReportsDashboard.tsx:235-241,292-297`; contrast :488-495,572-584,635-641 which **do** filter. **Verifier note:** the same omission also affects `generateAgedReceivablesReport`, `generateInvoiceSummaryReport` (quotes), and `generateRevenueByCustomerReport` — broaden the fix.
- **Reproduction:** Approve then archive an expense → run P&L / Cash Flow / Revenue-by-Case → the archived amount still subtracts.
- **Business impact:** Headline P&L and per-case profit include archived/voided transactions → misstated profitability used for pricing/management; contradicts other reports.
- **Technical impact:** Report outputs internally inconsistent depending on which builder ran.
- **Recommended fix:** Add `.is('deleted_at', null)` to every expenses/invoices/payments/quotes query in `financialReportsService` and `ReportsDashboard`; add a lint/test asserting financial aggregate queries include the predicate. (Compounds with EXP-006: a deleted expense is double-wrong — counted in the report **and** orphaned in the ledger.)
- **Priority:** **High**

#### EXP-032 — VAT period queries filter on `created_at`, not the economic date — wrong tax period
- **Description:** `calculateVATForPeriod`/`getVATRecordsByReturn`/`getQuarterlyVATSummary`/`fetchVATRecords` filter `vat_records` by `created_at` (insert time), not the underlying expense/invoice date. VAT records are created at **approval** time, which can cross a period boundary, so a Q1 expense approved in Q2 reports in Q2. The unused `tax_period` column is never populated.
- **Root cause:** VAT records carry no economic date; period math uses `created_at`; `tax_period` never set; records written on approval not `expense_date`.
- **Evidence:** `vatService.ts:104-109,267-273` (`created_at` filters); live `vat_records.tax_period` nullable, never written; `expensesService.ts:566-571` (createVATRecord omits `tax_period`).
- **Reproduction:** expense dated 2026-03-30 (Q1) approved 2026-04-02 (Q2) → `getQuarterlyVATSummary(2026)` puts it in Q2.
- **Business impact:** VAT returns assign tax to the wrong filing period — penalty exposure for under/over-declaration. (Latent until EXP-027 makes purchase VAT records actually flow.)
- **Technical impact:** All period-scoped VAT aggregations key off insert time; `tax_period` dead.
- **Recommended fix:** Stamp `tax_period` (or store the economic date) from `expense_date`/`invoice_date`; key period queries off that field, not `created_at`.
- **Priority:** **High**

#### EXP-033 — Aged Payables never clears because the paid transition is unreachable
*(Merged into EXP-017 — the reporting consequence of the missing approved→paid transition. **High.** Cross-referenced.)*

#### EXP-006-FX — Ledger may carry document-currency amount with no base + raw-amount aggregation fallback
- **Description:** `approveExpense` passes `amount: expense.amount` (document currency) and `amount_base: expense.amount_base ?? undefined`; if `amount_base` is null (legacy/imported rows), the ledger stores only the native amount and `financial_transactions.currency` defaults `'USD'`; `getTransactionStats`'s `baseAmount` falls back to the raw native amount, mixing currencies in a single SUM.
- **Root cause:** `convertToBase` returns `amount*rate` with no precision guard; `createFinancialTransaction` only writes `currency`/`amount_base` when defined; `baseAmount` returns the raw amount when `*_base` is missing.
- **Evidence:** `expensesService.ts:309,316`; `financialService.ts:46-49`; `financialMath.ts:178-187`; live: `financial_transactions.currency DEFAULT 'USD'`, `amount_base` nullable.
- **Reproduction:** A legacy/imported expense with `currency=EUR, amount_base=NULL` → ledger row `amount=1000, currency='USD', amount_base=NULL` → summed as base.
- **Business impact:** Mixed-currency ledger totals silently wrong whenever a base snapshot is missing.
- **Technical impact:** Hardcoded 'USD' default + raw-amount fallback defeats the Country Engine on the expense ledger path.
- **Recommended fix:** Always pass `currency` and `amount_base` from approve (compute `amount*exchange_rate` if null); make `amount_base` NOT NULL (or compute server-side in the post RPC); remove the silent raw-amount fallback for non-base rows.
- **Priority:** **Medium** *(downgraded: no current code path writes NULL `amount_base` — create/update always populate it; latent for legacy/import rows only. Defensive hardening, ties to EXP-031.)*

#### EXP-025 — Revenue counts `amount_paid` by `invoice_date` while expenses use `expense_date` — mixed accrual/cash basis
- **Description:** `fetchFinancialSummary`/`generateProfitLossReport`/`ReportsDashboard` compute revenue as `SUM(amount_paid)` filtered by `invoice_date` (cash received, but bucketed by issue date), while cash-flow sums payments by `payment_date` and expenses by `expense_date`. Period net-profit pairs cash revenue keyed by issue date against date-keyed expenses — an accrual/cash mismatch that won't tie out.
- **Root cause:** Revenue taken as `amount_paid` but bucketed by `invoice_date` rather than `payment_date`; no single consistent accounting basis.
- **Evidence:** `financialService.ts:96-133`; `financialReportsService.ts:91-124,241-260,358-441` (also `generateRevenueByCustomerReport`); `ReportsDashboard.tsx:229-249`.
- **Reproduction:** Invoice Jan, paid Mar → P&L for January counts the March cash as January revenue; cash-flow for January shows no receipt.
- **Business impact:** Period revenue/net-profit/margin on an inconsistent basis across reports → misleading management metrics.
- **Technical impact:** Mixed date-basis for the same metric family across all five revenue surfaces.
- **Recommended fix:** Pick one basis and apply across `financialService`/`financialReportsService`: cash-basis → revenue from payments by `payment_date`; accrual → invoiced total by `invoice_date`. Do not sum `amount_paid` by `invoice_date`.
- **Priority:** **Medium**

#### EXP-034 — P&L: gross == net (no COGS/opex split) and revenue hardcoded to a single "Services" line
- **Description:** `generateProfitLossReport` sets `grossProfit = revenue − allExpenses` then `netProfit = grossProfit`, with no COGS/operating split (so any gross-margin concept is absent), and `revenue.byCategory` is hardcoded `[{category:'Services', amount: totalRevenue}]`.
- **Root cause:** No expense classification into COGS vs operating; revenue breakdown hardcoded.
- **Evidence:** `financialReportsService.ts:121-124,129`. **Verifier note:** the dashboard does **not** render a "Gross Profit" card (only Revenue/Expenses/Net Profit/Margin), so the visible defects are the hardcoded single revenue line and the missing gross-margin concept, not a misleading on-screen gross figure.
- **Reproduction:** Generate P&L → revenue breakdown only ever shows "Services"; no gross-vs-net distinction.
- **Business impact:** Lab cannot see gross margin on recovery work vs overhead; mis-informs pricing.
- **Technical impact:** Report semantics incomplete.
- **Recommended fix:** Classify categories into COGS vs operating (e.g. `master_expense_categories` metadata); `grossProfit = revenue − COGS`, `netProfit = gross − opex`; derive `revenue.byCategory` from invoice line/service data (the expense-category join already exists).
- **Priority:** **Medium** *(downgraded: limited UI exposure; the expense-category join already works.)*

#### EXP-035 — `vat_records` insert relies on a trigger for `tenant_id` and swallows errors
- **Description:** `createVATRecord` inserts without `tenant_id` and only `logger.error`s on failure (no throw), so a VAT-write failure (e.g. unique-violation on re-approval) is invisible.
- **Root cause:** `tenant_id` delegated to a trigger; the VAT writer is non-fatal/unlogged-to-user, inconsistent with the fail-fast ledger writer.
- **Evidence:** `expensesService.ts:560-580` (no `tenant_id`, log-only). **Verifier correction:** the `set_vat_records_tenant_and_audit` trigger **does** exist and stamps `tenant_id`, so the NOT-NULL insert does **not** fail — the genuine residual defect is only the swallowed error; "silent VAT-record loss via NOT-NULL" is refuted.
- **Reproduction:** Force a VAT insert error (e.g. the `(record_type,record_id)` unique on re-approval) → no user-facing signal.
- **Business impact:** A failed VAT write is undetectable (compounded by EXP-027 making the rows useless today).
- **Technical impact:** Error visibility relies on console logs.
- **Recommended fix:** Throw (or toast) on VAT-write failure to match the fail-fast ledger writer; fold into EXP-027's content fix so rows are both written and meaningful.
- **Priority:** **Low** *(downgraded: the tenant_id/NOT-NULL data-loss premise is false; observability-only gap on rows that are currently zero-value.)*

---

### 3.5 Database — Schema, Constraints, FKs, Indexing, Audit

#### EXP-013 — `expenses.status` has DEFAULT 'approved', no CHECK constraint, and is nullable
- **Description:** `status` is plain nullable text with `DEFAULT 'approved'` and no CHECK. Any insert omitting status is auto-approved (financially live, counted in P&L) with no ledger row; any garbage string ('aproved') is accepted and then drops out of every status filter, vanishing from dashboards while remaining a real liability.
- **Root cause:** Workflow-bearing column with a terminal default and no domain enforcement; the `ExpenseStatus` union lives only in TypeScript. The sibling `financial_transactions_status_check` proves the house pattern was simply never applied to expenses.
- **Evidence:** live: `status` text, nullable, `column_default = 'approved'::text`, only CHECK is `expenses_rate_source_chk`; `financial_transactions_status_check CHECK (status IN ('draft','posted','voided'))`; TS union at `expensesService.ts:12`.
- **Reproduction:** `INSERT INTO expenses (tenant_id, amount, description) VALUES (...)` → row created `status='approved'`, no ledger; `UPDATE ... SET status='banana'` → accepted, invisible to filters.
- **Business impact:** Imported/API-created expenses can appear approved but never ledgered (EXP-031), bypassing controls; invalid statuses create orphaned invisible liabilities.
- **Technical impact:** No DB-level state-machine floor; the union is unenforced.
- **Recommended fix:** `ALTER ... SET DEFAULT 'draft'`; `ADD CONSTRAINT expenses_status_chk CHECK (status IN ('draft','pending','approved','rejected','paid'))`; consider NOT NULL (currently nullable). Backfill is trivial (1 row).
- **Priority:** **High** *(downgraded from Critical: latent — the TS `status` field is required so no wired insert path omits it, and the import path has no live expenses-insert today; this is a schema landmine, not active corruption. Critical-adjacent and a prerequisite for EXP-031.)*

#### EXP-020 — No CHECK constraints on monetary columns: negative/zero amounts and `exchange_rate <= 0` accepted
- **Description:** `amount`, `tax_amount`, `exchange_rate`, `amount_base`, `tax_amount_base` have no value constraints. Negative amounts post phantom income; `exchange_rate=0` zeroes `amount_base` (`convertToBase` multiplies by rate), silently erasing the base-currency cost from cross-currency reports.
- **Root cause:** Bare numerics; only CHECK is `rate_source`; no `amount >= 0` / `exchange_rate > 0` guard despite `exchange_rate` being load-bearing for base aggregation.
- **Evidence:** live: `amount numeric(19,4) NOT NULL`, `exchange_rate numeric(20,10) NOT NULL DEFAULT 1`, `amount_base` nullable; only `expenses_rate_source_chk`; `expensesService.ts:177,485-486` and `financialMath.ts:22-26` trust the rate blindly. *(createExpense's falsy-0 ternary partially blocks a literal 0 via that path only; updateExpense/direct-write/negative-amount remain open.)*
- **Reproduction:** Insert `exchange_rate=0` → `amount_base=0` → reports undercount; insert `amount=-500` → negative expense acts as phantom income.
- **Business impact:** Wrong money in reports; zero/garbage rate erases real costs; negatives flip expense into income.
- **Technical impact:** Base aggregation silently wrong; no DB tripwire; rows look valid.
- **Recommended fix:** Add `CHECK (amount >= 0)`, `CHECK (tax_amount >= 0)`, `CHECK (exchange_rate > 0)`, `CHECK (amount_base IS NULL OR amount_base >= 0)` after auditing existing rows.
- **Priority:** **High**

#### EXP-021 — No DB-side audit-actor stamping for expenses; no expense history table
*(Merged into EXP-010 — the schema face of the audit-trail gap: `expenses` excluded from v1.2.0 `set_audit_actor_fields`, no `updated_by`, no append-only expense history. **High.** Cross-referenced.)*

#### EXP-022 — No unique index on `financial_transactions(reference_type, reference_id)`
*(The DB backstop for EXP-001's double-post. **High.** The durable fix is the partial unique index `WHERE reference_type='expense' AND deleted_at IS NULL`, also backing the future reverse-on-delete lookup. Cross-referenced to EXP-001; do not file the index twice.)*

#### EXP-023 — `expense_number` not unique and not NOT NULL; clock-based fallback can collide
- **Description:** `expense_number` is nullable text with no UNIQUE (per-tenant or global). It's generated only by the service via `get_next_number`; on any RPC error `getNextExpenseNumber` returns `EXP-${Date.now()}` (non-sequential, non-unique under same-ms concurrency, format-breaking), and any insert bypassing `createExpense` yields NULL or a colliding number — with no DB backstop. Peer tables (invoices, payments) carry the partial-unique index this deviates from.
- **Root cause:** Document-number uniqueness enforced only at the application layer; fail-open fallback returns a clock string instead of failing closed.
- **Evidence:** `expensesService.ts:64-75,160`; live: `expense_number` nullable, no default, no unique index/constraint; `uq_invoices_number_per_tenant`/`uq_payments_number_per_tenant` use the recommended pattern. *(The earlier "tenant_id=NULL sequence row" claim is refuted — `number_sequences.tenant_id` is NOT NULL, so a null tenant raises rather than pollutes.)*
- **Reproduction:** Two concurrent `createExpense` whose RPC errors in the same ms → two identical `EXP-<epoch>` numbers persist.
- **Business impact:** Duplicate/missing expense reference numbers undermine audit/reconciliation; the document number can't be trusted as an identifier.
- **Technical impact:** No durable uniqueness; relies on a single code path; import/bulk paths can produce NULLs.
- **Recommended fix:** `CREATE UNIQUE INDEX uq_expenses_number_tenant ON expenses(tenant_id, expense_number) WHERE deleted_at IS NULL AND expense_number IS NOT NULL`; throw on RPC error instead of returning a timestamp (fail closed); ideally make `expense_number` NOT NULL.
- **Priority:** **Medium** *(latent — single seq row today, RPC rarely errors; convention-violating durability gap.)*

#### EXP-036 — Missing secondary indexes on every common filter/sort column
- **Description:** `expenses` has only `expenses_pkey` and `idx_expenses_tenant` (partial on `tenant_id`). Every list/report/case-finance query filters/sorts on `status`, `expense_date`, `case_id`, `category_id`, `created_by` — none indexed — so within a tenant the planner filters + filesorts.
- **Root cause:** Provisioned with only the mandatory tenant index; access-pattern indexes never added.
- **Evidence:** live `pg_indexes`; filter/order sites `ExpensesList.tsx:137,145`, `expensesService.ts:94,97,101,105,109,113,122,452,520`, `financialReportsService.ts` (multiple). **Verifier correction:** RLS forces a `tenant_id=` predicate served by `idx_expenses_tenant`, so reads are **index-scoped to one tenant then filtered/sorted in memory** — *not* full-table seq scans as originally framed.
- **Reproduction:** Seed ~100k expenses for one tenant → `EXPLAIN` on the list query shows tenant-index scan + in-memory filter/sort.
- **Business impact:** List/report/case-finance latency grows with history (the fastest-growing data in a lab).
- **Technical impact:** In-tenant filter+sort overhead; `count: 'exact'` forces a second pass.
- **Recommended fix:** Partial composite indexes scoped to live rows: `idx_expenses_tenant_status_date (tenant_id, status, expense_date DESC) WHERE deleted_at IS NULL`; `idx_expenses_case (tenant_id, case_id) WHERE deleted_at IS NULL`; `idx_expenses_category (tenant_id, category_id) WHERE deleted_at IS NULL`; consider `created_by`. Mirror `financial_transactions(reference_type, reference_id)` (EXP-022).
- **Priority:** **Medium** *(downgraded: latent scalability hygiene — table near-empty today, seq scan currently optimal; ship pre-emptively as additive migrations.)*

#### EXP-037 — `expense_date` is `timestamptz` used as a calendar date; UTC-anchored period math
- **Description:** `expense_date` is `timestamptz DEFAULT now()` but the form sends date-only strings and reports bucket by string slice / browser-local `new Date()`. A bare date is stored at UTC midnight; the "This Month" KPI boundary (`getExpenseStats`) is computed in UTC, not tenant timezone, mis-bucketing near month boundaries.
- **Root cause:** Calendar-date semantics in a `timestamptz` column; period boundaries derived from browser-local/UTC time rather than tenant timezone.
- **Evidence:** live `expense_date timestamptz DEFAULT now()`; `expensesService.ts:488-490,502-503` (UTC `thisMonthStart`); `financialReportsService.ts:657-660` (`slice(0,7)`). **Verifier correction:** the per-row mis-bucketing claim is largely refuted — `<input type=date>` stores the picked date verbatim at UTC midnight identically for all tenants, and the string-prefix `>=` compare tolerates the trailing time; the genuine residual is the **UTC-computed `thisMonthStart`** (mis-buckets only in the first ~hours of local month-start for non-UTC tenants, one KPI).
- **Reproduction:** GMT+4 tenant during the first hours of the local 1st of the month → the "This Month" KPI briefly includes prior-month expenses.
- **Business impact:** "This Month" KPI off by boundary expenses for non-UTC tenants.
- **Technical impact:** Timezone-naive period boundary on one metric.
- **Recommended fix:** Compute month boundaries in tenant timezone (`TenantConfigContext`) at `expensesService.ts:490`; consider migrating the column to `date` if time-of-day is never needed.
- **Priority:** **Low** *(downgraded: schema smell + narrow KPI boundary bug; the broad mis-bucketing scenario does not reproduce against the actual string-compare path.)*

#### EXP-038 — Hardcoded `currency DEFAULT 'USD'` on `expenses`/`financial_transactions`
- **Description:** `expenses.currency` (and `financial_transactions.currency`) is `text DEFAULT 'USD'`, contradicting the Country Engine's no-hardcoded-currency rule. Any insert omitting currency stamps 'USD' regardless of the tenant base.
- **Root cause:** Literal default baked into schema instead of NULL-and-resolved-from-tenant-config.
- **Evidence:** live defaults; `createExpense` normalizes via `resolveRateContext` (`expensesService.ts:171-179`), so the default is the trap for non-service callers only.
- **Reproduction:** Raw/admin/import insert omitting currency for an AED tenant → row stores 'USD'.
- **Business impact:** Non-USD tenants get USD-mislabeled expenses; conflicts with localization.
- **Technical impact:** Schema default contradicts the Country Engine; correctness depends on every caller going through the service.
- **Recommended fix:** `ALTER ... DROP DEFAULT` and resolve currency from tenant base at write time (or a trigger reading tenant config); same for `financial_transactions.currency`.
- **Priority:** **Low** *(downgraded: no current code path mis-stamps — `createExpense` is the only writer and always resolves currency; defense-in-depth for future/raw callers.)*

#### EXP-039 — FK columns not constrained to same-tenant; soft-delete-blind read paths
- **Description:** `case_id`/`bank_account_id` (→ tenant-scoped tables) and `created_by`/`approved_by` (→ global `auth.users`) are single-column FKs with no tenant-match. The trigger stamps/locks `expenses.tenant_id` but never validates the referenced row's tenant, and RLS validates the expense row, not its references — so a crafted insert with another tenant's `case_id`/`bank_account_id` is FK-valid and passes expenses RLS. (The `created_by` FK targets `auth.users`, not `profiles`, so submitter/approver name embeds can't resolve and there's no tenant alignment.)
- **Root cause:** No composite `(tenant_id, id)` FK, no trigger validation, no RLS `with_check` on the referenced row's tenant; actor FKs point at the global `auth.users` table.
- **Evidence:** live FK list (`case_id`→`cases`, `bank_account_id`→`bank_accounts`, `created_by`/`approved_by`→`auth.users`, all single-column NO ACTION); `set_tenant_and_audit_fields` validates only `NEW.tenant_id`; `createExpense` passes `case_id`/`bank_account_id` straight through.
- **Reproduction:** As tenant B (accounts), insert an expense with `case_id` = a tenant-A case UUID → `tenant_id` auto-stamped B, FK + expenses RLS pass; the dangling reference is stored.
- **Business impact:** A buggy/malicious client can attach an expense to another tenant's case/account id, corrupting cross-tenant references and case/bank reporting joins. (No data is *read* across tenants — select-time RLS hides foreign-row contents.)
- **Technical impact:** Tenant isolation enforced one level deep (the row) but not its references; this is a cross-cutting class affecting every tenant-scoped table with FKs to `cases`/`bank_accounts`/`auth.users`.
- **Recommended fix:** Add a reusable BEFORE INSERT/UPDATE assertion (or composite `(tenant_id, case_id) REFERENCES cases(tenant_id, id)`) that the referenced row's tenant = `NEW.tenant_id`; validate `created_by`/`approved_by` via `profiles.tenant_id`. Treat as a **platform-wide** tenant-integrity hardening item, not an expense-only fix. (The `created_by`→`auth.users` embed issue: drop the unused `submitter`/`approver` type fields or resolve names via the existing `AuditInfo`/profiles lookup — see also EXP-010.)
- **Priority:** **Medium** *(downgraded: insider-only blind-write of a dangling pointer requiring a known foreign UUID; no cross-tenant read/exfiltration; tenant isolation intact. The actor-FK-to-`auth.users` embed sub-issue is **Low**.)*

---

### 3.6 UI/UX, Accessibility, Responsiveness, States

#### EXP-002 — View / Attachments dead, no detail surface
*(See §3.1 — the canonical "Preview not working" finding. **Critical.** Cross-referenced.)*

#### EXP-003 — Edit loses Category; phantom Payment Method
*(See §3.2. **Critical.** Cross-referenced.)*

#### EXP-005 — Form omits currency/tax/billable/bank/reference/receipt
*(See §3.2. **Critical.** Cross-referenced.)*

#### EXP-015 — Money-bearing mutations have no `onError`; failures surface only to console
- **Description:** All four `ExpensesList` mutations (create/update/approve/reject) define `onSuccess` but no `onError`; the form's `handleSubmit` catch only `logger.error`s; approve/reject confirm handlers `await mutateAsync` with no try/catch. So a failed save/approve/reject shows no toast and no inline error.
- **Root cause:** Mutations rely solely on the optimistic success path; error surfacing never added.
- **Evidence:** `ExpensesList.tsx:166-208` (onSuccess only), :216-219/:233-239 (no try/catch); `ExpenseFormModal.tsx:132-134` (console-only catch). **Verifier correction:** the "modal closes / operator assumes success" framing is **wrong** — close happens only in `onSuccess`, so on failure the modal **stays open**; the real residual is a silent no-feedback failure (no toast) + an unhandled promise rejection on approve/reject, and `approveExpense` posts status before ledger non-atomically (the genuinely high-value fix).
- **Reproduction:** As a viewer / offline, fill New Expense and Save → request errors → no toast, no field error; modal stays open with the button re-enabled.
- **Business impact:** Staff get no feedback on money operations; failures during approval are invisible in the UI.
- **Technical impact:** No user-facing error path; reliance on console logs; non-atomic approve can half-apply (status committed, ledger throw).
- **Recommended fix:** Add `onError` with `toast.error` to all four mutations; wrap approve/reject `mutateAsync` in try/catch; surface the form catch as a toast and keep the modal open; make `approveExpense` atomic (single RPC: status + ledger + VAT) so partial success is impossible (this last part is EXP-001).
- **Priority:** **Medium** *(downgraded from Critical/High: failed writes fail safely at the DB and the modal stays open — an observability/UX gap, not money corruption; the atomicity half is covered by EXP-001.)*

#### EXP-040 — Shallow form validation: no NaN/Infinity/precision guard, no future-date guard, category not required
- **Description:** `handleSubmit` validates only `amount <= 0` and a non-empty description. Gaps: `parseFloat(...) || 0` accepts trailing garbage and lets `Infinity` (from pasted `1e309`) pass the `>0` check; no rounding to currency decimals (10.999 persists); no maxLength on text fields; no future/far-past date guard; category not required (saves as N/A). Validation is submit-only.
- **Root cause:** Minimal-viable validation; other fields never given rules; the form doesn't know the currency (it doesn't collect one) so minor-unit validation is impossible.
- **Evidence:** `ExpenseFormModal.tsx:110-117,184,161-168,126,203-311`.
- **Reproduction:** Paste '10.9999' → stored 10.9990; set date 2030-01-01 → accepted, distorts period reports; save with empty category → N/A. (Pasted `Infinity` is forwarded but rejected by the `numeric(19,4)` column on insert — a failed write, not stored corruption.)
- **Business impact:** Uncategorized/future-dated/sub-cent data quality leaks into financial reporting; unbounded text risk.
- **Technical impact:** Inputs accept out-of-range values the type attributes pretend to constrain.
- **Recommended fix:** Clamp amount to currency decimals (`getCurrencyDecimals`) and reject NaN/Infinity; add maxLength; `max=today` on the date input; make category required; move validation to onBlur + submit. Bundle with EXP-005 (currency capture).
- **Priority:** **Medium**

#### EXP-041 — Accessibility: icon-only actions lack aria-labels; errors not programmatically associated
- **Description:** The View/Attachments/Approve/Reject/Edit row buttons are icon-only with `title` but no `aria-label`; the amount/description error `<p>`s aren't tied to inputs via `aria-describedby`/`aria-invalid`; several form controls are hand-rolled and bypass the project's `useFieldA11y` primitive.
- **Root cause:** Row actions built as raw `<button title=...>`; form mixes the a11y-aware `Input` (amount/date) with hand-rolled controls (description/category/case/payment/notes); error `<p>`s are visual-only.
- **Evidence:** `ExpensesList.tsx:601-638`; `ExpenseFormModal.tsx:191-193` (unassociated error), :203-296 (hand-rolled controls); `Input.tsx`/`useFieldA11y.ts` show the wired standard. **Verifier corrections:** the status WORD is rendered as text beside the icon (not color-alone), and a `toast.error()` does fire on validation failure (so errors *are* announced) — the real gap is per-field inline error association + the 5 icon-only action buttons.
- **Reproduction:** Screen-reader the row actions → "button" with no clear action; submit with amount 0 → inline error shown but not tied to the field.
- **Business impact:** WCAG 2.2 AA gaps (accessible names, error identification) on an internal B2B accountant tool.
- **Technical impact:** Missing accessible names; error association absent; inconsistent use of the project a11y primitive.
- **Recommended fix:** Add `aria-label` to the 5 icon-only buttons; pass `error={amountError}` into the existing `<Input>` (it already wires `aria-invalid`/`aria-describedby`); add `id`+`aria-describedby` to the description error; convert select/textarea to the a11y-aware primitives.
- **Priority:** **Medium**

#### EXP-042 — DESIGN.md drift: hardcoded slate/white neutrals + a hardcoded `DollarSign` icon ignoring tenant currency
- **Description:** The form/list use raw Tailwind neutrals (`text-slate-*`, `border-slate-*`, `bg-white`, `bg-slate-*`) instead of semantic tokens, and the Amount field renders a hardcoded `DollarSign` glyph regardless of tenant currency — a EUR/GBP/AED tenant sees a '$' while the list correctly localizes amounts via `useCurrency`.
- **Root cause:** Form predates the semantic-token migration and the Country Engine; neutrals and the currency glyph never retokenized/parameterized.
- **Evidence:** `ExpenseFormModal.tsx:177` (`DollarSign`), raw neutrals throughout (e.g. :156,173,198,...); `ExpensesList.tsx:334,345,436,465,466`.
- **Reproduction:** Set tenant currency EUR → New Expense shows '$' on Amount; non-default themes don't adapt the neutrals.
- **Business impact:** A '$' on a non-USD tenant looks broken and contradicts localized amounts elsewhere; theme drift.
- **Technical impact:** Token drift vs DESIGN.md; currency presentation not driven by `TenantConfigContext`.
- **Recommended fix:** Replace `DollarSign` with the tenant currency symbol from `useCurrencyConfig()` (or drop it); retokenize neutrals to surface/border/foreground tokens.
- **Priority:** **Medium**

#### EXP-043 — Form not responsive: fixed `grid-cols-2` with no breakpoints cramps mobile
- **Description:** Every two-column field group uses `grid grid-cols-2 gap-4` with no `sm:`/`md:` prefix, so Date/Amount, Vendor/Category, Case/Payment stay cramped side-by-side on narrow viewports; the list table relies on horizontal scroll.
- **Root cause:** `grid-cols-2` written without the responsive prefix the rest of the app uses.
- **Evidence:** `ExpenseFormModal.tsx:154,221,257`; contrast `ExpensesList.tsx:328` (`grid-cols-1 md:grid-cols-4`).
- **Reproduction:** Open New Expense at 375px → Date/Amount cramped; date picker too narrow.
- **Business impact:** Cramped, error-prone mobile expense capture reduces data quality/adoption.
- **Technical impact:** Breaks breakpoint consistency with the rest of the same files.
- **Recommended fix:** `grid grid-cols-1 sm:grid-cols-2 gap-4`; consider stacked card layout for the list on small screens.
- **Priority:** **Medium**

#### EXP-044 — Edit form/buttons are status-unaware (UI gating gives false immutability)
- **Description:** The list shows Edit only for draft/pending, implying approved/paid are locked, but the form modal has no status awareness and the service/RLS permit edits in any status — so opening the modal on an approved row (or via API) happily saves changes, diverging from the frozen ledger (EXP-006/EXP-011).
- **Root cause:** Status-based locking is a single render condition; the modal and backend are status-unaware.
- **Evidence:** `ExpensesList.tsx:617`; `ExpenseFormModal.tsx` (no status read for locking); EXP-011 RLS.
- **Reproduction:** Approve an expense; `updateExpense` to change amount succeeds while the posted ledger row stays.
- **Business impact:** Reviewers trust approved expenses are immutable; they are not.
- **Technical impact:** Defense-in-depth gap; the gate is trivially bypassed.
- **Recommended fix:** Make the modal status-aware (read-only/block save for approved/paid); add a service + DB-trigger status guard (EXP-006/EXP-009/EXP-011). Where corrections are legitimate, route through reverse-and-reissue.
- **Priority:** **Medium**

#### EXP-045 — Status filter pills hardcode `slate-600` active state; KPI label/computation mismatch; rejected-notes preview cements data loss
- **Description:** (a) The status pills use semantic tokens for per-status active states but a raw `bg-slate-600`/`bg-slate-100` fallback for All/Draft and all inactive states (off-theme, won't adapt to Burgundy/Scarlet). (b) "Total Approved" KPI amount folds in `paid` while the `approved` *count* excludes `paid` (label/computation mismatch). (c) The rejected-row preview renders `expense.notes` as the rejection reason, displaying the EXP-007 overwrite as if intended.
- **Root cause:** Mixed token/raw-neutral approach; stat aggregation set (approved+paid) doesn't match the "Approved" label or count; UI hardwired to the overwritten `notes` column.
- **Evidence:** `ExpensesList.tsx:457-466` (slate fallback), :414 ("Total Approved" → `stats.totalAmount`), :591-595 (notes-as-reason); `expensesService.ts:492,497,500,342`.
- **Reproduction:** Click All/Draft → slate pill doesn't theme; KPI "Total Approved" includes paid; reject an expense with notes → list shows the reason in red, original notes gone.
- **Business impact:** Off-theme drift; misleading "Approved" KPI; normalizes the destructive notes overwrite (EXP-007).
- **Technical impact:** Token drift; metric label/set mismatch; UI consumer wired to the overwritten column.
- **Recommended fix:** Retokenize pills (active + inactive) to semantic tokens; relabel/realign the KPI ("Approved + Paid" or split, with matching count); point the rejected preview at the new `rejection_reason` column (EXP-007).
- **Priority:** **Low**

#### EXP-046 — Approve confirm dialog has a non-descriptive accessible name; approver affordance hidden from owner/manager
- **Description:** (a) The approve confirm `Modal` is opened with `title=""`, so it falls back to a generic accessible name ("Dialog") rather than a descriptive one. (b) The Approve/Reject affordance is gated by `isAccountsRole = admin||accounts`, hiding it from owner/manager who can approve per RLS (EXP-012).
- **Root cause:** Empty `title` to suppress header chrome; UI gate narrower than the RLS grant.
- **Evidence:** `ExpensesList.tsx:690-698,112,599`. **Verifier correction:** the dialog is **not** unlabeled — `Modal` supplies `aria-label = t('ui.dialog')` when title is empty; the defect is a generic vs descriptive name. "Intended approvers blocked" is also partly wrong: 'accounts' is in both gates; only owner/manager are hidden.
- **Reproduction:** Open the approve dialog with a screen reader → announces "Dialog"; log in as owner/manager → no Approve button despite RLS permission.
- **Business impact:** Minor a11y polish gap; owner/manager can't approve from the UI (workflow friction — pair with EXP-008 SoD before broadening).
- **Technical impact:** Generic dialog name; UI/RLS approver divergence (EXP-012).
- **Recommended fix:** Pass a descriptive `title="Approve Expense"` (or explicit `ariaLabel`); converge the approver affordance with the canonical RLS set via `PermissionsContext` (EXP-012), adding the SoD guard (EXP-008) when broadening.
- **Priority:** **Low**

---

### 3.7 Edge Cases & Boundary Conditions

#### EXP-009 — No transition guards (any starting state accepted)
*(See §3.1. **High.** Cross-referenced — the edge-case face: approve a never-submitted draft, reject an approved expense, mark a rejected/draft expense paid, re-approve.)*

#### EXP-001 — Re-approval double-posts
*(See §3.1. **Critical.** Cross-referenced — double-click/retry/concurrency edge.)*

#### EXP-019 — Concurrent-edit lost update
*(See §3.2. **High.** Cross-referenced.)*

#### EXP-047 — Deleted/inactive category becomes unrecoverable on edit
- **Description:** `getExpenseCategories` filters `is_active=true`, so an expense referencing a later-deactivated category has no matching `<option>`; combined with EXP-003 (edit never loads `category_id`), the native select coerces the unmatched value to blank and a save writes `category_id=null`, permanently severing the link.
- **Root cause:** Options exclude inactive categories; native `<select>` coerces unmatched values to empty; submit null-coerces (EXP-003).
- **Evidence:** `expensesService.ts:438`; `ExpenseFormModal.tsx:88,126,247-251`.
- **Reproduction:** Create with category Shipping → admin deactivates Shipping → Edit → category blank → save → `category_id=null`.
- **Business impact:** Category reporting silently loses spend after routine admin housekeeping.
- **Technical impact:** Two compounding defects: edit never loads `category_id` (EXP-003) + options exclude inactive categories.
- **Recommended fix:** Select `category_id` in the list/refetch the row (EXP-003); when editing, render the current category as a selected (disabled) option even if inactive; never coerce a missing-option value to null on save.
- **Priority:** **High** *(primary, higher-frequency bug is EXP-003; the inactive-category exclusion becomes load-bearing once that's fixed.)*

#### EXP-007 — Reject overwrites notes
*(See §3.2. **High.** Cross-referenced — the edge-case face: reject can run from any status, leaving an approved expense's ledger dangling while clobbering notes.)*

#### EXP-048 — Free-text vendor with no supplier link — typo/duplicate risk
- **Description:** Vendor is an unconstrained free-text string with no FK to `suppliers`; 'Acme'/'acme'/'ACME Ltd' become distinct vendors; no normalization, autocomplete, or rollup, so spend-by-supplier is unreliable.
- **Root cause:** Plain text Input; no `supplier_id` FK on expenses.
- **Evidence:** `ExpenseFormModal.tsx:226-231`; live: no supplier column on `expenses` (FKs are approved_by/bank_account_id/case_id/category_id/created_by/tenant_id).
- **Reproduction:** Three expenses 'Acme'/'acme'/'ACME Ltd' → treated as different vendors in any grouping.
- **Business impact:** Can't reliably answer "how much did we spend with supplier X" — undermines supplier management and the suppliers module.
- **Technical impact:** No referential integrity for vendors; string-based, case/punctuation-sensitive grouping.
- **Recommended fix:** Add an optional `supplier_id` FK with a typeahead (free-text fallback for one-offs); normalize on save; group spend by `supplier_id` when present.
- **Priority:** **Medium**

#### EXP-049 — `amount_base = round(amount × rate)` can overflow `numeric(19,4)` and abort the write
- **Description:** A large amount in a weak currency (or a fat-fingered value) can make `amount_base` exceed `numeric(19,4)` (~9.99e14), throwing 'numeric field overflow' and aborting the insert; because the form has no upper bound and mutations have no `onError` (EXP-015), the failure is opaque.
- **Root cause:** `convertToBase` returns `amount*rate` with no clamp/precision guard; Amount input has no max.
- **Evidence:** live `numeric(19,4)`/`numeric(20,10)`; `financialMath.ts:22-26`; `ExpenseFormModal.tsx:178-189`. The opacity is worse than stated — even adding `onError` wouldn't surface it because the form catch is `logger.error`-only (EXP-015).
- **Reproduction:** A legitimate large amount in a weak currency where `amount*rate > 1e15` → insert aborts with no message.
- **Business impact:** Legitimate high-value expenses (weak-currency labs) can't be saved with no diagnosis.
- **Technical impact:** Unhandled DB exception path; implicit magnitude limit undocumented in the UI.
- **Recommended fix:** Add a sane max + magnitude pre-validation in the form; toast in the modal catch (not just `logger.error`); optionally a DB CHECK; widen precision only after currency-range analysis.
- **Priority:** **Medium** *(realistic only for very-weak-currency or fat-finger entry; ties to EXP-005 currency capture + EXP-015 error surfacing.)*

#### EXP-050 — Linked case dropdown filter matches no rows; null-coercion can detach the case on edit
- **Description:** The case dropdown filters `.in('status', ['Open','In Progress'])`, but the live `cases.status` enum has **no such values** (it uses 'Initial Assessment'/'Recovery in Progress'/etc.), so the dropdown is empty on the success branch (populated only via the error fallback that returns all cases). On edit, a now-non-listed case has no option, and submit's `case_id: caseId || null` can detach the case.
- **Root cause:** Status-vocabulary mismatch against the real `cases` enum; null-coercion on a missing option (EXP-003 pattern).
- **Evidence:** `ExpenseFormModal.tsx:61-80,89,127`; live `cases.status` enum values. **Verifier corrections:** the rollup-leak claim cited the wrong (dead) function `getExpensesByCase`; the real per-case profitability path (`getCaseFinancialSummary`) is correctly filtered, so profitability math is **not** skewed — impact is a confusing/empty dropdown + the EXP-004 list-display leak.
- **Reproduction:** Open New/Edit Expense → case dropdown empty (no case matches the filter) unless a query error triggers the all-cases fallback.
- **Business impact:** Users can't link a case (empty dropdown), or a relinked-via-fallback case is fragile on edit.
- **Technical impact:** Dead filter; null-coercion detach risk on edit.
- **Recommended fix:** Filter by real non-terminal `cases.status` values (or list all and re-hydrate the linked case as a selected option regardless of status); never coerce a missing-option case to null on save.
- **Priority:** **Medium** *(downgraded: empty dropdown + display leak, not silent profitability corruption.)*

#### EXP-051 — Amount `parseFloat` precision/finite gaps reach the money math
- **Description:** `parseFloat(e.target.value) || 0` accepts trailing garbage and binds amount as a JS float with no currency-decimal rounding (3-decimal entries persist as e.g. 12.3450 vs base derived from the unrounded value); the form can't validate minor units because it doesn't know the currency.
- **Root cause:** No currency-aware decimal validation, no finite check; `amount` stored raw (only `amount_base` is `convertToBase`-rounded).
- **Evidence:** `ExpenseFormModal.tsx:184`; `expensesService.ts:171-179` (raw amount spread; only base rounded).
- **Reproduction:** Enter '12.345' for a 2-dp/0-dp currency → stored 12.3450; base derives from the unrounded value.
- **Business impact:** Stored amounts can violate the currency's minor-unit convention → sub-cent drift vs base totals.
- **Technical impact:** No finite/precision validation; raw `amount` not rounded to currency dp server-side.
- **Recommended fix:** `Number.isFinite` check + round raw amount to document-currency dp server-side (mirror `convertToBase`); add the currency selector (EXP-005) for client-side minor-unit validation.
- **Priority:** **Low** *(subsumed by EXP-005 currency capture + EXP-040 validation hardening; Infinity is rejected by the DB column on insert, so no stored corruption.)*

---

### 3.8 Multi-Tenant Isolation, Visibility & Ownership

#### EXP-052 — `expense-receipts` storage bucket does not exist; uploads fail; any future bucket would be cross-tenant readable
- **Description:** `uploadExpenseAttachment` uploads to `storage.from('expense-receipts')` at path `${expenseId}/${ts}.${ext}`, but the bucket **does not exist** (so every upload errors today) and there are **zero `storage.objects` policies** referencing it. Worse, the document buckets that do exist (`case-attachments`, `supplier-documents`) use blanket `bucket_id = '<bucket>'` policies with **no tenant-folder check**, so a bucket created in that prevailing pattern would let tenant B download tenant A's receipt by guessing the path.
- **Root cause:** Attachments feature wired in code (service + tenant_id on the DB row) but the bucket and its RLS were never provisioned; the document-bucket policy pattern isolates by `bucket_id` only, not a tenant prefix.
- **Evidence:** `expensesService.ts:364-408` (upload to `expense-receipts`, no tenant prefix in path), :422-424 (delete); live `storage.buckets` has 8 buckets, none `expense-receipts`; `storage.objects` policy dump references none; document buckets use blanket `bucket_id` policies while `case-report-pdfs` is the only correctly tenant-folder-isolated bucket.
- **Reproduction:** Attach a receipt → upload throws (bucket missing). (Forward-looking) Create the bucket naively → as tenant B, `download('<tenant-A-expenseId>/<ts>.pdf')` succeeds with no tenant-folder check.
- **Business impact:** Receipts unrecoverable today; when "fixed" naively, confidential vendor receipts (client names, forensic vendors, NDAs) leak across tenants — a privacy/forensic-confidentiality breach.
- **Technical impact:** Feature dead at the storage layer; the table-level RESTRICTIVE RLS on `expense_attachments` protects the DB row, not the storage object.
- **Recommended fix:** Migration that (a) creates a **private** `expense-receipts` bucket and (b) adds `storage.objects` policies modeled on `case-report-pdfs`: store objects under `${tenant_id}/${expenseId}/...` and gate all ops with `(storage.foldername(name))[1] = get_current_tenant_id() OR is_platform_admin()` + a staff/role check; prepend `tenant_id` to the upload path. Separately audit `case-attachments`/`supplier-documents` for the same missing-tenant-folder defect.
- **Priority:** **Critical**

#### EXP-053 — `expenses_select` is `USING(true)`: every staff role including viewer sees ALL expenses tenant-wide
- **Description:** The PERMISSIVE `expenses_select` policy is `USING(true)` (ANDed only with tenant isolation), with no `created_by` scoping in RLS or the list query. Any authenticated tenant user — including read-only `viewer`/technician/sales — can read every staff member's expense rows (amounts, vendors, descriptions, notes, linked cases). The only role gate is on the action buttons, not visibility.
- **Root cause:** Expenses modeled as a fully-shared tenant ledger (`USING(true)` SELECT) with no ownership/visibility tier.
- **Evidence:** live `expenses_select` PERMISSIVE SELECT `USING(true)`; `expenses_tenant_isolation` RESTRICTIVE; `fetchExpenses`/`ExpensesList` have no `created_by` predicate; only `isAccountsRole` gates action buttons.
- **Reproduction:** Log in as `viewer` → /expenses → every staff member's expenses fully visible with no "mine vs all".
- **Business impact:** Confidentiality exposure (reimbursements, vendor relationships, forensic-supplier costs, case-linked spend) to the entire staff including viewers — an HR/NDA concern. (Intra-tenant only; tenant isolation intact.)
- **Technical impact:** Data layer can't express "submitter sees own, approver sees all"; any new expense surface inherits full-tenant visibility.
- **Recommended fix:** Decide the visibility model. At minimum gate SELECT behind `is_staff_user()` so viewers can't read financial expense data; for submitter-scoping, replace `USING(true)` with `created_by = auth.uid() OR has_role('manager'/'accounts') OR is_platform_admin()` and add a server-driven mine/all toggle. Document the chosen ownership policy.
- **Priority:** **High**

#### EXP-011 — Any accounts-or-higher user can edit/approve/delete any other user's expense
*(See §3.3. **High.** Cross-referenced — the ownership face.)*

#### EXP-054 — `financial_transactions` ledger is broadly visible/insertable (`SELECT USING(true)`, `INSERT is_staff_user()`)
- **Description:** Beyond EXP-001's double-post, the ledger has weak tenant-ledger visibility/insertability: `financial_transactions_select = USING(true)` (all staff incl. viewer see every posted line tenant-wide) and `financial_transactions_insert = is_staff_user()` (a broader role set than can create expenses can insert ledger rows).
- **Root cause:** Open within-tenant ledger visibility + a broad insert role; no per-expense idempotency (EXP-001).
- **Evidence:** live `financial_transactions_select USING(true)`, `_insert is_staff_user()`.
- **Reproduction:** As viewer, read all ledger lines; as any staff, insert a ledger row.
- **Business impact:** Open, broadly-writable tenant ledger surface; combined with EXP-001, re-entry double-counts.
- **Technical impact:** No single chokepoint; ledger expense rows visible to all roles and insertable by any staff.
- **Recommended fix:** Tighten `financial_transactions_insert` to `has_role('accounts')` and reconsider `USING(true)` SELECT to at least `is_staff_user()`; add the partial unique index (EXP-001/EXP-022).
- **Priority:** **High** *(within-tenant least-privilege; tenant isolation intact.)*

#### EXP-055 — Main expenses list query omits `deleted_at` — archived expenses reappear in the table while stats/exports exclude them
- **Description:** The primary paged `ExpensesList` query (and its `count: 'exact'`) never applies `.is('deleted_at', null)`, so archived expenses remain in the table and pager total, while `getExpenseStats` (KPI cards) and the header export DO filter — contradicting the archive confirmation copy ("hidden from lists but recoverable").
- **Root cause:** The inline list query omits the soft-delete predicate the service layer and exports apply.
- **Evidence:** `ExpensesList.tsx:118-148` (no `deleted_at`), :386 (export filters), :310-313 (archive sets `deleted_at`); `expensesService.ts:93` (fetchExpenses filters). **Verifier note:** dimension is mislabeled — this is an intra-tenant soft-delete display/consistency defect, not an isolation breach.
- **Reproduction:** Archive an expense → KPI/export drop it, but the table + pager total still include it after refetch.
- **Business impact:** Archived expenses appear active and inflate the list count while KPIs disagree; breaks the "hidden from lists" promise.
- **Technical impact:** Read path inconsistent with the soft-delete contract; pagination counts include deleted rows.
- **Recommended fix:** Add `.is('deleted_at', null)` to the list grid query (and count), or route the list through `fetchExpenses`; add a regression test.
- **Priority:** **Medium** *(downgraded: data-visibility/trust within a tenant, recoverable, no corruption — not a multi-tenant isolation defect despite the dimension label.)*

#### EXP-039 — Cross-tenant FK references not validated
*(See §3.5. **Medium.** Cross-referenced — the isolation face of the FK-integrity gap.)*

---

### 3.9 Performance & Scalability

#### EXP-056 — `getExpenseStats` downloads every live expense row and aggregates in JS (unbounded; existing aggregate RPC bypassed)
- **Description:** KPI cards call `getExpenseStats()` with no date filter and no LIMIT, downloading every non-deleted expense (6 columns each) on every page load and every cache invalidation (after create/update/approve/reject/archive), then runs ~8 array passes in the browser. A purpose-built `get_expense_stats_base()` RPC exists but is deliberately bypassed because it lacks the status-count/this-month breakdowns the view needs.
- **Root cause:** Aggregation pushed to the client because the existing RPC was never extended; the query has no row cap or date bound, so payload is O(n) in the tenant's expense count.
- **Evidence:** `expensesService.ts:459-506` (full-tenant SELECT + JS count/filter/reduce), :463-467 (bypass comment); `ExpensesList.tsx:161-164` (no filters); RLS scopes to tenant. **Verifier correction:** RLS forces a tenant predicate, so this ships the **current tenant's** rows, not the whole DB.
- **Reproduction:** Seed 50k expenses for a tenant → /expenses → the `['expense_stats']` request returns all rows; every approve/archive re-downloads and re-aggregates.
- **Business impact:** Dashboard slow/memory-heavy at lab-scale history; inflated Supabase egress/compute.
- **Technical impact:** O(n) payload + O(n) client CPU (8 passes) per render; cache holds the full set.
- **Recommended fix:** Extend `get_expense_stats_base()` (or a sibling RPC) to return the full KPI shape server-side (`count(*) FILTER (...)`, `SUM FILTER (...)` for approved+paid/pending/this-month with `date_trunc('month', expense_date AT TIME ZONE tenant_tz)`), behind the partial tenant index; call via `supabase.rpc` and delete the client aggregation.
- **Priority:** **Medium** *(downgraded from High: latent — 1 row today; clean fix path since the RPC is half-built.)*

#### EXP-057 — Export paths fetch unbounded full result sets with an embedded join
- **Description:** `ExportButton.getRows` runs an unbounded `select(... master_expense_categories:category_id(name))` with no `range`/LIMIT, materializing the full matching set client-side and building the CSV synchronously on the main thread; if PostgREST max-rows is set, the CSV is **silently truncated** (partial audit file); if not, the tab risks OOM/jank.
- **Root cause:** Export grabs "all matching rows" in one request with an embedded resource, no streaming/server-side CSV, no cap awareness.
- **Evidence:** `ExpensesList.tsx:382-395` (no range/limit, embedded join), `ExportButton.tsx` (full array materialized), `csvExport.ts` (synchronous main-thread build). **Verifier:** RLS tenant-scopes it; the silent-truncation premise depends on an unverified PostgREST cap.
- **Reproduction:** Seed 200k expenses → header Export CSV → one request for ~200k rows with a per-row category sub-select.
- **Business impact:** Accountants exporting for tax/audit get a hung tab or a silently incomplete CSV (under-reported expenses).
- **Technical impact:** Unbounded query + full materialization + synchronous CSV build; embedded sub-select per row.
- **Recommended fix:** Paginate with `.range()` in a loop (or a server-side/Edge-function CSV); detect when `rows.length` hits the cap and warn the user the export is partial; replace the embedded sub-select with a join the planner can index; add the EXP-036 indexes.
- **Priority:** **Medium** *(downgraded: cap-awareness warning is the cheap durable mitigation; latent at current scale; correct file path is `src/components/shared/ExportButton.tsx`.)*

#### EXP-058 — ReportsDashboard refetches and re-aggregates raw rows client-side on every date-range change (4 parallel queries, no shared RPC)
- **Description:** Four `useQuery` hooks keyed on `dateRange` each download raw rows and aggregate in JS; toggling the date dropdown re-runs all four with no overlap reuse; modal report generators re-download the same rows. Several of these queries also omit `deleted_at` (EXP-026), compounding wrong totals with wasted IO.
- **Root cause:** Dashboard and report layer compute aggregates in JS over raw downloads rather than server-side GROUP BY/SUM RPCs; no shared aggregate.
- **Evidence:** `ReportsDashboard.tsx:224-338`; duplicated fetches in `financialReportsService.ts`. **Verifier:** RLS tenant-bounds the scans; the missing-`deleted_at` correctness bug (EXP-026) is the more concrete issue and is the cheapest high-value fix.
- **Reproduction:** /financial/reports → toggle date range a few times → each toggle fires four raw-row queries + JS aggregation; opening a modal re-fetches.
- **Business impact:** Slow, expensive reporting that degrades with history; wrong totals where `deleted_at` is omitted (EXP-026).
- **Technical impact:** Multiple O(n)-in-tenant range scans + JS GROUP BY per component; duplicate fetches.
- **Recommended fix:** Server-side aggregate RPCs accepting `(date_from, date_to)` behind a `(tenant_id, status, expense_date)` index; share one P&L summary RPC between dashboard cards and modal; add `.is('deleted_at', null)` everywhere (EXP-026).
- **Priority:** **Medium**

#### EXP-059 — `financial_transactions` has no index on `(reference_type, reference_id)` — reversal/idempotency lookups full-scan the ledger
*(Merged into EXP-022/EXP-001 — the same missing index, viewed from performance: the future reverse-on-delete/edit lookup (EXP-006) and the idempotency unique would full-scan the fastest-growing table without it. **Medium** as a perf item; ship the index with the EXP-006 reversal RPC.)*

#### EXP-060 — `editingExpense` typed `any`; coarse cache invalidation re-runs the unbounded stats query on every single-row action
- **Description:** `editingExpense` is `useState<any>`, defeating type-safety across the edit path; every mutation invalidates both `['expenses']` (refetches the current page) and `['expense_stats']` (re-runs the O(n) full-table `getExpenseStats`), so a single approve triggers a complete re-download/re-aggregate. No optimistic update.
- **Root cause:** `any`-typing on the editing state; coarse invalidation tied to the expensive aggregate; mutations invalidate stats on every single-row action.
- **Evidence:** `ExpensesList.tsx:90,221-225,677-687,170-208,317-318`; `expensesService.ts:459-506`.
- **Reproduction:** Approve one pending expense → both `['expenses']` (page refetch) and `['expense_stats']` (full re-aggregate) re-run.
- **Business impact:** Sluggish bulk-approval; higher per-action DB/egress; `any` lets schema drift slip silently.
- **Technical impact:** Every single-row mutation re-executes an O(n) query; no optimistic UI.
- **Recommended fix:** Type `editingExpense` as `ExpenseRow | null`; after EXP-056 makes stats cheap, the invalidation is fine; prefer `setQueryData` optimistic updates for approve/reject. (Approve/reject *do* change totals, so they legitimately need the refresh — via a cheap aggregate, not a JS full-scan.)
- **Priority:** **Low**

#### EXP-061 — RevenueDashboard recomputes the list-wide total inside the row map — O(n²) over customers
- **Description:** The "% of Total" column recomputes `totalCustomerRevenue` by reducing over the entire `customerRevenue` array inside the `.map()` callback for every row — O(N²) per render — plus an unbounded invoice fetch with an embedded customer join.
- **Root cause:** Per-row recomputation of a list-wide aggregate inside the map callback.
- **Evidence:** `RevenueDashboard.tsx:372-375,82-100`. **Verifier:** N is distinct invoiced customers per period (dozens–low hundreds for a recovery lab), so the "freeze" requires unrealistic volume; it's wasteful code that also needlessly re-runs on search keystrokes.
- **Reproduction:** Tenant with many distinct customers → switch to By Customer → each render does N×N reduce iterations.
- **Business impact:** Wasteful re-renders; jank only at unrealistic customer counts.
- **Technical impact:** O(N²) main-thread work per render; repeated allocations.
- **Recommended fix:** Hoist `const totalCustomerRevenue = useMemo(() => customerRevenue.reduce(...), [customerRevenue])`. (The "add a LIMIT to revenue_data" suggestion needs care — a naive LIMIT would silently truncate the totalRevenue/growth KPIs.)
- **Priority:** **Low** *(downgraded: realistic N is small; cleanup, not a scalability risk.)*

---

### 3.10 Import/Export, Seeding & Feature Gating

#### EXP-031 — Import bypasses the approval ledger (auto-approved, no ledger)
*(See §3.4. **Critical.** Cross-referenced.)*

#### EXP-062 — Import never sets currency/exchange_rate/amount_base — imported expenses get USD/1.0 and break cross-currency reporting
- **Description:** `createExpense` snapshots `currency`/`exchange_rate`/`rate_source`/`amount_base`/`tax_amount_base` for correct base-currency reporting; the import path does none of this. `ENTITY_CONFIGS.expenses` has no currency/exchange_rate/tax/amount_base fields, so imported rows fall to DB defaults (`currency='USD'`, `exchange_rate=1`, `amount_base=NULL`), and `getExpenseStats` then treats every imported foreign-currency expense as already-base at rate 1.
- **Root cause:** Incomplete `ENTITY_CONFIGS.expenses` column map + a dumb INSERT that skips the rate-snapshot logic; no trigger to compute `amount_base`.
- **Evidence:** `importExportService.ts:160-175`; `expensesService.ts:164-179,485-486`; live defaults (`currency 'USD'`, `exchange_rate 1`, `amount_base` nullable) and the **only** trigger is `set_expenses_tenant_and_audit` (no `amount_base` population).
- **Reproduction:** Import amount=1000 representing €1000 (base OMR) → stored `currency='USD', exchange_rate=1, amount_base=NULL` → summed as 1000 base; a form-created €1000 is converted → totals inconsistent.
- **Business impact:** Wrong expense totals for any non-base-currency lab (most of the country-driven customer base); violates the Country Engine; magnified on historical import.
- **Technical impact:** `amount_base`/`tax_amount_base` NULL on imports; `rate_source` mislabeled; SUM(amount_base) silently wrong.
- **Recommended fix:** Add a **BEFORE INSERT trigger** that populates `amount_base = amount*exchange_rate` (and `tax_amount_base`) whenever NULL so no write path can leave them unset (primary, robust). Route import through an RPC/`createExpense` and add currency/exchange_rate to the import config. (Adding config columns alone is **not** sufficient — the dumb INSERT still won't compute `amount_base`.)
- **Priority:** **Critical**

#### EXP-063 — Bulk import has zero feature/usage gating — `max_expenses_per_month` and `bulk_import` plan limits trivially bypassed
- **Description:** `featureGateService` defines `max_expenses_per_month` and `bulk_import` (requires 'professional'), but the gates are UI-only (`UsageLimitGuard` wraps the create button); the import path inserts directly and never calls `canPerformAction`/`checkUsageLimit`/`hasFeature`. A Starter-plan tenant can load thousands of expenses via Import, bypassing both the per-month cap and the paid `bulk_import` gate. RLS `expenses_insert` is `has_role('accounts')` only — no plan check.
- **Root cause:** Plan limits/feature gate enforced purely in client UI with no server authority; the import wizard is a separate surface never wired to the checks; no DB-side limit enforcement.
- **Evidence:** `featureGateService.ts:19-25,61-73,190-287` (browser-side); `UsageLimitGuard.tsx` (UI-only); grep over `src/components/importExport` + the Import/Export page → no `bulk_import`/`max_expenses_per_month`/`canPerformAction` usage; live `expenses_insert = has_role('accounts')`.
- **Reproduction:** Starter tenant at its 50/mo cap and without `bulk_import` → Import/Export → Expenses → upload 5,000 rows → all insert; neither gate fires.
- **Business impact:** Revenue leakage — the paid `bulk_import` feature and metered limits are unenforceable; undermines usage-based billing/upsell.
- **Technical impact:** Client-only gating with a parallel unguarded write path; no single chokepoint.
- **Recommended fix:** Enforce plan limits server-side (RPC/RLS-callable function checking subscription + monthly count before inserts); gate the Import wizard entry on `hasFeature('bulk_import')` + `checkUsageLimit('max_expenses_per_month', rowCount)` (the wizard already knows `parsedData.length`). Note: even the create-path guard shares this bypass class, so server-side enforcement is the durable fix.
- **Priority:** **High** *(revenue leakage / billing bypass; not an isolation/data-integrity breach.)*

#### EXP-064 — Import doesn't stamp `created_by` and never validates `category_id`/`case_id` existence/tenancy; whole-batch failures
- **Description:** The import builds records only from mapped CSV columns (no `created_by`), so imported expenses get `created_by=NULL` (no submitter attribution). `validateField` never checks `referenceFields` against the DB, so a bogus/wrong-tenant `category_id`/`case_id` passes validation and FK-fails the whole 100-row batch; errors are counted per-batch (`errorCount += batch.length`) with no row-level detail.
- **Root cause:** `validateField` has no reference-existence check for non-inventory entities; the importer has no `created_by` handling; errors counted per-batch.
- **Evidence:** `importExportService.ts:888-1005` (no reference validation), :171-174 (referenceFields declared but unused for validation); `ImportWizard.tsx:196-242` (no `created_by`), :258-275 (batch-level error counting); live: `master_expense_categories` is global; `expenses.created_by` nullable + the trigger never stamps it.
- **Reproduction:** Import a CSV with one bad `category_id` → validation passes → import → the batch FK-violates → all 100 rows marked failed with no indication which row was bad.
- **Business impact:** Historical-expense imports fail in large opaque chunks or silently mis-attribute ownership, undermining approval/reimbursement trust.
- **Technical impact:** Whole-batch failure on one bad FK; no per-row error surfacing; `created_by` wrong/NULL.
- **Recommended fix:** Add `referenceFields` existence/tenancy validation in `validateField`; switch to per-row insert (or capture per-row errors); explicitly stamp `created_by` (or require a `submitted_by` mapping for historical attribution; ties to EXP-010).
- **Priority:** **High**

#### EXP-065 — Import config declares a phantom `paid_at` dateField; app-only uniqueness on `expense_number`
- **Description:** `ENTITY_CONFIGS.expenses.dateFields` includes `paid_at`, which is **not a real `expenses` column** (status='paid' is the only paid signal); a CSV with `paid_at` is date-coerced and targets a nonexistent column (PGRST204 error / row failure). `uniqueFields:['expense_number']` is app-side only — no DB unique exists, so duplicate expense numbers import silently. (Export has the same phantom `paid_at` — see EXP-066.)
- **Root cause:** Entity definitions copied from an assumed schema (with `paid_at`) never reconciled against `database.types.ts`; no DB unique on `expense_number`.
- **Evidence:** `importExportService.ts:166-172`; live: no `paid_at` column; no unique on `expense_number`; template builder emits `paid_at` header.
- **Reproduction:** Build an import template (includes `paid_at`) → import → `paid_at` insert errors; import two rows with the same `expense_number` → both persist.
- **Business impact:** Bulk imports fail on `paid_at`; duplicate expense numbers corrupt records for a lab migrating historical data.
- **Technical impact:** Schema-drift in import config; validation gives false confidence (uniqueFields not DB-enforced).
- **Recommended fix:** Remove `paid_at` from `dateFields`; back `uniqueFields` with a real partial unique index (EXP-023); add currency/exchange_rate/amount_base computation (EXP-062); ideally route import through the atomic expense RPC (EXP-031).
- **Priority:** **Medium**

#### EXP-066 — Expense export omits base-currency and key money columns; two divergent exporters; phantom `paid_at`
- **Description:** Two different expense CSV exporters disagree. The generic ExportWizard builds columns from the incomplete config (`expense_number, expense_date, amount, description, category_id, case_id, approved_at, paid_at`) — omitting `currency`, `tax_amount`, `exchange_rate`, `amount_base`, `is_billable`, `vendor`, `status`, `reference` and emitting a blank phantom `paid_at`. `ExpensesList` has its own hand-rolled export including `tax_amount`/`currency`/`is_billable`/`status` — neither exports `amount_base`. So exports aren't round-trippable and base-currency totals aren't exportable.
- **Root cause:** Export columns derived from an incomplete/partly-wrong config (phantom `paid_at`, missing money columns); a second bespoke exporter added without reconciling.
- **Evidence:** `ExportWizard.tsx:106-114,139-145`; `importExportService.ts:160-175`; `ExpensesList.tsx:264,385`; live: no `paid_at`.
- **Reproduction:** Export from Import/Export → CSV has amount but no currency/tax/`amount_base` and a blank `paid_at`; export from the list page → different columns; neither is interchangeable.
- **Business impact:** Accountants get amounts with no currency/tax context (dangerous across currencies) and can't reconstruct base totals; round-trip broken.
- **Technical impact:** Two divergent exporters; config references a phantom column; base/tax unexportable.
- **Recommended fix:** Complete and correct `ENTITY_CONFIGS.expenses` (add currency/tax_amount/exchange_rate/amount_base/is_billable/vendor/reference/status; remove `paid_at`); consolidate to a single export definition shared by ExportWizard and ExpensesList.
- **Priority:** **Medium**

#### EXP-067 — Export job record drops its parameters and is fire-and-forget; import creates no job/log record
- **Description:** `createJob` is called in a swallow try/catch and **ignores its configuration argument** (date range, columns, format not persisted). The import path **never** calls `createJob`/`addJobLog` — no `import_export_jobs` row, no `import_export_logs`, no record of who imported how many rows or which failed.
- **Root cause:** Import implemented as a direct client-side batch insert without job/log bookkeeping; export's job creation is best-effort and lossy.
- **Evidence:** `ImportWizard.tsx:174-293` (no createJob/addJobLog); `ExportWizard.tsx:76-86` (swallow try/catch); `importExportService.ts:420-445` (discards `_configuration`); `addJobLog`/`updateJobProgress` exist but have zero callers.
- **Reproduction:** Import 500 expenses → query `import_export_jobs`/`import_export_logs` → no rows. Export with a date filter → job row has no filters/columns/format.
- **Business impact:** No accountability for bulk financial data movement — can't show who mass-loaded/exported expense data in an audit/dispute.
- **Technical impact:** `import_export_jobs`/`logs` unused for the most consequential operation; export job rows lossy.
- **Recommended fix:** Create an import job up front, write per-row `import_export_logs` (success/error + row_data) via the existing-but-unused functions, finalize counts on completion; stop swallowing `createJob` errors; persist export parameters in the job's config slot. (Row-level audit columns still apply per CLAUDE.md — this is the missing **bulk-operation provenance**.)
- **Priority:** **Medium**

#### EXP-068 — Import number/date coercion: parseFloat thousands-separator loss; date-only → timestamptz drift
- **Description:** `parseFloat` silently corrupts locale-formatted numbers (a quoted `1,000.50` → `1`, passing validation), and date fields are passed as raw CSV strings into `expense_date` (timestamptz), stored at UTC midnight (the EXP-037 drift on imports).
- **Root cause:** Generic coercion that ignores locale-formatted numbers and timestamptz semantics for date-only input.
- **Evidence:** `ImportWizard.tsx:209-239`; `importExportService.ts:687-716` (CSV split on comma; quoted thousands-separator survives and then `parseFloat` truncates), :909-913 (validation accepts the truncated value); `expense_date` timestamptz.
- **Reproduction:** Import a quoted amount `1,000.50` → stored as `1`, passing validation; import `2026-01-31` → stored UTC midnight (boundary drift).
- **Business impact:** Silent amount corruption and month mis-bucketing on imported financial data. *(The "blank amount → opaque whole-batch NOT NULL failure" sub-claim is refuted — `amount` is in `requiredFields` and blank rows are rejected with a clean row-level error.)*
- **Technical impact:** parseFloat thousands-separator loss; date-only→timestamptz drift.
- **Recommended fix:** Strip thousands separators / locale-normalize before `parseFloat`; treat date-only input as tenant-local (consistent with EXP-037).
- **Priority:** **Low** *(downgraded: thousands-separator case requires the user to quote the value; the scarier blank-amount whole-batch scenario was refuted; date drift is the durable concern.)*

---

### 3.11 Cross-Cutting Gaps

#### EXP-069 — The full draft→pending→approved→paid lifecycle is built in the service but UNREACHABLE: 8 functions have zero UI callers
- **Description:** `submitExpense`, `markExpenseAsPaid`, `deleteExpense` (single-row), `fetchExpenseById`, `getExpensesByCase`, `getExpensesByCategory`, `uploadExpenseAttachment`, `deleteExpenseAttachment` all have **zero UI callers**. The receipt-upload pipeline is fully built but wired to nothing; the form sets status inline rather than calling `submitExpense`. The reachable lifecycle is only create(draft|pending) → approve/reject.
- **Root cause:** Service built out speculatively for the full lifecycle; the UI was only wired for create/edit/approve/reject; inline status flips in the form diverge from the unused `submitExpense`.
- **Evidence:** caller grep returns only the service + test for all 8; `CaseFinancesTab` uses `caseFinanceService.getCaseExpenses` not `getExpensesByCase`; `ExpenseFormModal.tsx:128` sets status inline.
- **Reproduction:** Approve an expense → no Mark-as-Paid, no receipt attach/view, no single-row delete (only owner/admin bulk-archive); `grep -rn 'markExpenseAsPaid|uploadExpenseAttachment' src` → no UI imports.
- **Business impact:** A lab can't attach the supplier/parts receipt (a forensic/provenance requirement), can't record an expense was paid, can't soft-delete a single erroneous expense from the UI; aged-payables/cash-out never reflect reality.
- **Technical impact:** Large dead surface (8 functions) that will rot and drift from the inline form logic; passes typecheck/tests, hiding the gap from CI.
- **Recommended fix:** Wire the missing transitions (Mark-as-Paid + atomic disbursement per EXP-017; attachment upload/list in the detail drawer per EXP-002; single-row soft-delete; route the form's submit through `submitExpense` as the one canonical transition) — or remove the dead functions. For a forensic lab, prefer wiring.
- **Priority:** **High**

#### EXP-070 — No expense reversal / refund / credit primitive (wiring gap, not a missing capability)
- **Description:** There is no expense-level reverse/credit/refund path. A wrong approved expense can only be soft-deleted (which doesn't reverse the ledger — EXP-006) or edited (which desyncs — EXP-006). Negative amounts are blocked at the form yet DB-legal (EXP-020).
- **Root cause:** The lifecycle is one-way with no post-approval correction primitive wired for expenses. **Verifier correction:** a generic reversing primitive **exists** — `reverse_financial_transaction` (used as `voidTransaction` in the Transactions module) posts a linked contra entry and unwinds balances. The gap is that it's not exposed for expenses and wouldn't re-sync the expense status.
- **Evidence:** grep over expense files for recurring/reimburse/refund/reversal → none; `transactionsService.ts` has `reverse_financial_transaction`/`voidTransaction`; no self-FK/`reversal_of_id` on expenses; `ExpenseFormModal.tsx:110` blocks `amount<=0` while no DB CHECK exists.
- **Reproduction:** Approve $500 (ledger posted) → discover it was refunded → no reverse/credit; reject unavailable post-approval; soft-delete leaves the $500; edit-to-0 desyncs.
- **Business impact:** Books can't be corrected after approval without DB surgery; supplier refunds unrecordable; mistakes persist in P&L — breaks the append-only audit principle.
- **Technical impact:** No offsetting-entry exposure for expenses; inconsistent negative-amount policy.
- **Recommended fix:** Wire an expense-level void that calls `reverse_financial_transaction` on the linked ledger row + flips the expense to a `reversed`/`voided` state; add a DB CHECK and status guards on update/delete for approved/paid (ties to EXP-006/EXP-009/EXP-020).
- **Priority:** **Medium** *(downgraded: the dangerous delete/edit-desync sub-issues are EXP-006; a reversal primitive already exists to build on — a wiring/exposure gap.)*

#### EXP-071 — Edit-then-submit bypasses the create-path usage gate (third bypass angle)
- **Description:** In edit mode the form's buttons render **outside** the `UsageLimitGuard`, so editing a draft and clicking "Submit for Approval" promotes it to pending without passing `max_expenses_per_month` — a second/third bypass of the monthly limit (alongside EXP-063 import bypass). The guard is keyed on "is this an edit?" not "does this transition activate a billable expense?".
- **Root cause:** Usage gate keyed on edit-vs-create rather than the activation transition; `UsageLimitGuard` is UI-only with no server enforcement.
- **Evidence:** `ExpenseFormModal.tsx:318-341` (edit branch outside the guard) vs :342-365 (create branch inside); routes to `updateExpense` with `status='pending'`.
- **Reproduction:** Mass-create drafts (or import), then edit each and click Submit for Approval → all promote with no usage check.
- **Business impact:** Monthly expense limit bypassable from a second angle.
- **Technical impact:** Usage gate covers only one of two activation paths; client-only.
- **Recommended fix:** Gate on the transition (any path setting `status='pending'`/active), enforced server-side (RPC/trigger counting monthly active expenses) — the durable fix shared with EXP-063.
- **Priority:** **Medium** *(the validation/date/precision sub-claims in the same finding fold into EXP-040; the gating bypass is the distinct, durable issue.)*

---

## 4. Remediation Roadmap

### PR-1 — Approval & State Machine (the keystone) — **Critical**
*Fixes: EXP-001, EXP-008, EXP-009, EXP-013, EXP-028, EXP-022/EXP-059*
- **DB migration:** `ALTER TABLE expenses ALTER COLUMN status SET DEFAULT 'draft'`; `ADD CONSTRAINT expenses_status_chk CHECK (status IN ('draft','pending','approved','rejected','paid'))`; partial unique index `financial_transactions(reference_type, reference_id) WHERE reference_type='expense' AND deleted_at IS NULL`; add `submitted_by`/`submitted_at`.
- **RPC:** `SECURITY DEFINER` `approve_expense` (and matching reject/submit/mark-paid): `UPDATE ... WHERE id=$1 AND status=<allowed-source> RETURNING`, abort on 0 rows; SoD check `created_by <> auth.uid()`; post ledger only if none exists; status flip + ledger + VAT atomic.
- Regen `database.types.ts`; update callers.

### PR-2 — Ledger / Reporting Reconciliation — **Critical**
*Fixes: EXP-006, EXP-024, EXP-026, EXP-029, EXP-006-FX*
- Choose one source of truth (recommend: expenses table for reports; stop posting the unused expense ledger, OR fully ledger-source with a reverse-on-mutate RPC). Implement reverse-on-delete/void via `reverse_financial_transaction` inside the delete/bulk-archive RPC; block amount/currency edits on approved/paid (DB trigger); set ledger `transaction_date = expense_date`; add `.is('deleted_at', null)` to every `financialReportsService`/`ReportsDashboard` expenses/invoices/payments/quotes query + lint guard.

### PR-3 — The Three Reported Bugs (UI/data) — **Critical**
*Fixes: EXP-002 (Preview), EXP-003 (Edit category/phantom payment method), EXP-047*
- Build `ExpenseDetailModal` (consumes `fetchExpenseById` + attachments); wire View/Attachments. Hydrate the edit form from `fetchExpenseById`; remove `payment_method_id`; render inactive category as a selected option; guard `category_id` overwrite.

### PR-4 — VAT & Form Field Capture — **Critical**
*Fixes: EXP-005, EXP-027, EXP-032, EXP-035, EXP-014 (partial)*
- Add currency/tax_amount/is_billable/bank_account_id/reference/receipt inputs (currency via `TenantConfigContext`); on approval write a real `record_type='purchase'` VAT record (gate on `tax_amount>0`, not `case_id`) with `tax_period` from `expense_date`; throw on VAT-write failure.

### PR-5 — Storage Bucket Provisioning — **Critical (security)**
*Fixes: EXP-052*
- Migration: private `expense-receipts` bucket + `case-report-pdfs`-style tenant-folder `storage.objects` policies; prepend `tenant_id` to the upload path. (Separately audit `case-attachments`/`supplier-documents`.)

### PR-6 — Import Integrity — **Critical/High**
*Fixes: EXP-031, EXP-062, EXP-064, EXP-063, EXP-065*
- **DB migration:** BEFORE INSERT trigger populating `amount_base` when NULL. Route expense import through an RPC that forces `pending`/`draft` (or posts ledger+VAT atomically on approved import) and snapshots currency/rate; add reference existence/tenancy validation + per-row errors + `created_by` stamping; gate the wizard on `hasFeature('bulk_import')` + `checkUsageLimit` (and server-side enforcement); remove phantom `paid_at`; add the `expense_number` partial unique index.

### PR-7 — RBAC, Visibility & Audit — **High**
*Fixes: EXP-010, EXP-011, EXP-012, EXP-018, EXP-053, EXP-054, EXP-039*
- **DB migration:** extend actor-stamping to `expenses` (force `auth.uid()`, add `updated_by`) + append-only expense history; tighten `expenses_select` to at least `is_staff_user()` (or submitter-scoped); status-gate `expenses_update`; gate soft-delete to admin; tighten `financial_transactions_insert`/`_select`; reusable cross-tenant FK assertion (platform-wide). Converge UI approver gate to `PermissionsContext`.

### PR-8 — Banking / Disbursement & Lifecycle Wiring — **High**
*Fixes: EXP-017, EXP-016, EXP-069, EXP-070, EXP-007*
- **DB migration:** `rejection_reason`/`rejected_by`/`rejected_at` columns. Atomic mark-paid disbursement RPC (capture bank_account_id + paid_at; bank_transaction + balance debit); wire Mark-as-Paid, Resubmit, single-row delete, receipt upload, expense void/reverse; write the reason to `rejection_reason`.

### PR-9 — Data Integrity Constraints & Indexes — **High/Medium**
*Fixes: EXP-019, EXP-020, EXP-023, EXP-036, EXP-038, EXP-037*
- **DB migration:** monetary CHECKs (`amount>=0`, `tax_amount>=0`, `exchange_rate>0`, `amount_base>=0`); drop hardcoded `currency` defaults; partial composite indexes; optimistic-lock support (load/compare `updated_at`); tenant-tz month boundary in `getExpenseStats`.

### PR-10 — UI/UX & Accessibility Polish — **Medium/Low**
*Fixes: EXP-015, EXP-040, EXP-041, EXP-042, EXP-043, EXP-044, EXP-045, EXP-046, EXP-048, EXP-049, EXP-051*
- `onError` toasts; validation hardening; aria-labels + error association; retokenize neutrals + tenant currency symbol; responsive grid; status-aware modal; pill tokens + KPI relabel; vendor typeahead; amount magnitude/precision guards.

### PR-11 — Performance & Import/Export Hygiene — **Medium/Low**
*Fixes: EXP-056, EXP-057, EXP-058, EXP-060, EXP-061, EXP-066, EXP-067, EXP-068, EXP-071*
- Server-side aggregate RPC for stats/reports; paginated/cap-aware export; type `editingExpense`; `useMemo` the revenue total; consolidate exporters; import job/log provenance; locale-safe number/date coercion; transition-keyed usage gate.

### DB migrations called out (summary)
Status default+CHECK; `financial_transactions(reference_type,reference_id)` partial unique; `submitted_by`/`submitted_at`; `rejection_reason`/`rejected_by`/`rejected_at`; `updated_by` + actor-stamping trigger + expense history; `amount_base` BEFORE-INSERT compute trigger; monetary CHECKs; drop hardcoded currency defaults; `expense_number` partial unique; partial composite indexes; reverse/void + atomic approve/disbursement RPCs; cross-tenant FK assertion trigger; `expense-receipts` bucket + tenant-folder storage policies; tighten expenses/financial_transactions RLS. **All additive / soft-delete-respecting per CLAUDE.md; regenerate `database.types.ts` after each and update every caller.**

---

## 5. Verification Notes (downgrades & nuance)

The adversarial verifier corrected several finder claims. The most material:

- **EXP-013** (status default/no CHECK): **Critical → High.** Schema facts confirmed, but the TS `status` field is required and no wired insert path omits it today — latent landmine, not active corruption (prerequisite for EXP-031).
- **EXP-008** (self-approval): **Critical → High.** Real, but requires an already-privileged authenticated insider (admin/accounts) — a missing internal control, not privilege escalation.
- **EXP-015** (no `onError`): **Critical → Medium.** Failed writes fail safely at the DB and the modal **stays open** (close only on `onSuccess`) — the "operator assumes success / double-post" narrative is wrong; the residual is a silent no-feedback/UX gap (atomicity is EXP-001).
- **EXP-016** (rejected dead-end): **High → Medium.** Peripheral internal-finance friction with workarounds.
- **EXP-029** (thin GL): **High → Medium.** Forward-looking; the ledger expense path is unused today.
- **EXP-006-FX** (mixed-currency ledger): **High → Medium.** No current path writes NULL `amount_base`; latent for legacy/import rows.
- **EXP-034** (gross==net): **High → Medium.** No "Gross Profit" card is actually rendered; visible defects are the hardcoded revenue line + missing gross-margin concept.
- **EXP-036** (indexes): **High → Medium.** RLS scopes reads to one tenant via `idx_expenses_tenant` — not full-table seq scans; latent at current scale.
- **EXP-056 / EXP-057 / EXP-058** (perf): **High → Medium.** Latent (1 row today); RLS tenant-bounds the scans; clean fix paths exist.
- **EXP-055** (list `deleted_at`): **High → Medium**, and **dimension mislabeled** — intra-tenant display/trust, not isolation.
- **EXP-039** (cross-tenant FK): **High → Medium.** Insider blind-write of a dangling pointer needing a known foreign UUID; **no cross-tenant read**; tenant isolation intact; platform-wide class.
- **EXP-035** (VAT tenant_id/swallow): **Medium → Low.** The `set_vat_records_tenant_and_audit` trigger exists and stamps `tenant_id`, so the NOT-NULL data-loss premise is **false**; only the swallowed error remains.
- **EXP-037** (timezone): **Medium → Low.** `<input type=date>` stores the picked date verbatim at UTC midnight identically per tenant and the string-compare tolerates it; only the UTC-computed `thisMonthStart` mis-buckets, narrowly.
- **EXP-038** (USD default): **Medium → Low.** `createExpense` always resolves currency; no current path mis-stamps.
- **EXP-050** (case dropdown): **High → Medium.** The rollup-leak claim cited a **dead** function; the real profitability path is correctly filtered — impact is an empty dropdown + the EXP-004 display leak.
- **EXP-068** (import coercion): **Medium → Low.** The blank-amount whole-batch failure is **refuted** (required-field validation catches it); thousands-separator loss needs a quoted value.
- **EXP-061** (O(n²) revenue): **Medium → Low.** Realistic N is small for a recovery lab.
- **EXP-070** (no reversal): **High → Medium.** A reversing primitive (`reverse_financial_transaction`) already **exists** — wiring/exposure gap, not missing capability.

**Dropped / merged (not separately filed):** the finder pool contained ~14 restatements of the same five roots (notes-overwrite ×5, edit-loses-category ×3, dead View/Attachments ×4, case/category `deleted_at` ×6, no-onError ×3, six-fields-uncaptured ×4, SoD/state-machine/double-post overlaps). These were merged into single root-cause findings (EXP-007, EXP-003, EXP-002, EXP-004/EXP-026, EXP-015, EXP-005, EXP-008/EXP-009/EXP-001) with combined evidence. No finding was dropped as a non-defect — every confirmed/needs-nuance item maps to a defect; only severity and framing were corrected. Minor factual corrections folded into the findings: `has_role('accounts')` resolves to owner/admin/manager/accounts (not technician/sales/hr); the correct ExportButton path is `src/components/shared/ExportButton.tsx`; the correct CaseFinancesTab path is `src/components/cases/detail/CaseFinancesTab.tsx`.
