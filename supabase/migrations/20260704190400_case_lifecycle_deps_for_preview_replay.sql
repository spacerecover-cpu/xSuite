-- Preview-replay shim #6 (preview-fix workstream; precedent: 20260409000001).
--
-- Two columns referenced by the mirrored case-lifecycle migrations
-- (20260704190411 standardize_case_lifecycle, 20260704200000
-- recovery_workflow_scenarios) were added to the live DB by UNMIRRORED
-- p0_s7 state-machine migrations (202605250602*) and kill a fresh
-- preview-branch replay:
--   - master_case_statuses.customer_visible
--   - cases.phase_entered_at
-- Shapes mirror live. Idempotent; registered as applied on prod.
ALTER TABLE public.master_case_statuses
  ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT true;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS phase_entered_at timestamptz;
