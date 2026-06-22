# EXP-017 — Expense Disbursement (Mark as Paid)

**Date:** 2026-06-22 · **Branch:** `feat/expense-disbursement` · **Audit:** `docs/audit/2026-06-21-expense-module-audit.md` (EXP-017, merges EXP-030)

## Problem
`markExpenseAsPaid` only flips `status='paid'` — no bank account, no disbursement, no bank transaction, no balance debit, and it has **zero UI callers**. The approved→paid transition is unreachable; banking is disconnected from expenses; the 'Paid' tab/KPI are decorative.

## Goal
Make approved→paid real and operable from the UI, recording the **cash/bank side** atomically. Accrual GL already posts at approval (`expense_date`, per EXP-024/#311) — disbursement does **not** re-post to `financial_transactions`.

## Decisions (approved)
- **Insufficient balance → block** (hard guard, clear error). Overdraft deferred.
- **Match-currency v1**: account picker lists only active accounts whose currency == expense currency; debit is 1:1. Cross-currency disbursement deferred.
- **Idempotency** = the approved→paid state guard + row lock (a second call sees `paid` and errors). No extra unique index.
- **Reversal/void disbursement** deferred to a follow-up.

## Backend — migration (applied live via MCP)
1. **Traceability:** `ALTER TABLE payment_disbursements ADD COLUMN expense_id uuid REFERENCES expenses(id)` + partial index `WHERE deleted_at IS NULL`. Answers "which account paid this expense, when" and enables future reversal.
2. **RPC** `record_expense_disbursement(p_expense_id uuid, p_bank_account_id uuid, p_paid_at date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL) RETURNS expenses`, `SECURITY DEFINER`, `search_path=public`. One transaction:
   - `get_current_tenant_id()`; lock expense `FOR UPDATE` (tenant-owned, not deleted); assert `status='approved'`.
   - Lock + validate account (tenant, `is_active`, not deleted, currency matches).
   - Block if `current_balance < amount`.
   - Insert `payment_disbursements` (`expense_id`, amount, `payee_type='expense'`, `disbursement_number` via `get_next_disbursement_number()`, `status='completed'`); insert `bank_transactions` (`type='debit'`, debit_amount, running_balance, date); `current_balance -= amount` (+ `current_balance_base` via account `exchange_rate`); update expense → `paid`, `paid_at`, `bank_account_id` (audit trigger stamps `updated_by`).
   - `GRANT EXECUTE … TO authenticated`; `REVOKE … FROM anon`.
3. Regen `database.types.ts` (MCP); commit `.sql` + `migrations.manifest.md` entry.

## Frontend
- **Service** (`expensesService.ts`): `recordExpenseDisbursement(expenseId, bankAccountId, paidAt, reference?)` → `supabase.rpc('record_expense_disbursement', …)`; throws RPC error message. Retire the `markExpenseAsPaid` stub (or delegate).
- **`ExpensePaymentModal`** (new, under `src/components/financial/`): account picker (active, currency-matched, shows balance), payment date (default today), optional reference, displays amount+currency. Submit → service → toast + invalidate `expenses` queries.
- **`ExpensesList`**: "Mark as Paid" row action — shown only when `status==='approved'` and the user is an AP role (mirror the existing `isAccountsRole = admin||accounts` gate used for approve; EXP-012 full convergence is a separate finding, out of scope).

## Tests (TDD)
- Service: calls RPC with correct args; surfaces RPC errors (insufficient / not-approved / currency-mismatch).
- Modal: renders currency-filtered picker; submit disabled without an account; calls service on submit.
- (RPC validated by careful SQL against the live schema; repo has no pgTAP harness.)

## Merge method
**Squash & Merge** — single feature, TDD micro-commits collapse to one clean landing on `main`.
