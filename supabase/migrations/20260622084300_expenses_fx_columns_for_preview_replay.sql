-- Preview-replay shim #3 (preview-fix workstream; precedent: 20260409000001).
--
-- expenses.amount_base / tax_amount_base / exchange_rate were added to the live
-- DB by the UNMIRRORED document_currency_rate_and_base_amounts migration
-- (20260529200106). The mirrored 20260622084315 (expenses_compute_base_amounts
-- trigger + backfill UPDATE) references them, so a fresh preview-branch replay
-- dies with 42703. Shapes mirror live exactly. Idempotent; registered as
-- applied on prod (columns already exist there).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amount_base numeric,
  ADD COLUMN IF NOT EXISTS tax_amount_base numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1;
