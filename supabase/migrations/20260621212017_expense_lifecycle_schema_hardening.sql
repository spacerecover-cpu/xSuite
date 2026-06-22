-- Expense lifecycle schema hardening (audit 2026-06-21: EXP-001/007/009/010/013/019/024/031)
-- Applied to the canonical project (ssmbegiyjivrcwgcqutu) via mcp apply_migration.
-- Additive + non-breaking: the single live expenses row is 'pending'.

-- Lifecycle metadata columns (all nullable — no backfill needed)
alter table public.expenses
  add column if not exists submitted_by uuid references auth.users(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid references auth.users(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists paid_at timestamptz;

-- Safer default: raw inserts (e.g. CSV import) must NOT auto-approve & bypass the ledger (EXP-013/EXP-031)
alter table public.expenses alter column status set default 'draft';

-- Status whitelist
alter table public.expenses
  add constraint expenses_status_chk
  check (status in ('draft','pending','approved','rejected','paid','voided')) not valid;
alter table public.expenses validate constraint expenses_status_chk;

-- DB-enforced idempotency for the expense->ledger post (makes EXP-001's double-post impossible).
-- Scoped to 'expense' so invoice/payment multi-row writers are untouched.
create unique index if not exists uq_financial_transactions_expense_ref
  on public.financial_transactions (reference_type, reference_id)
  where reference_type = 'expense' and deleted_at is null;

-- Performance indexes for the common expense filters (partial on live rows)
create index if not exists idx_expenses_status on public.expenses (status) where deleted_at is null;
create index if not exists idx_expenses_case_id on public.expenses (case_id) where deleted_at is null;
create index if not exists idx_expenses_category_id on public.expenses (category_id) where deleted_at is null;
create index if not exists idx_expenses_expense_date on public.expenses (expense_date) where deleted_at is null;
create index if not exists idx_expenses_created_by on public.expenses (created_by) where deleted_at is null;
