-- Preview-replay shim #5 (preview-fix workstream; precedent: 20260409000001).
--
-- case_status_transitions was created on the live DB by the UNMIRRORED
-- p0_s7_case_status_transitions_table migration (20260525060235). The mirrored
-- 20260620090314 (allow_intra_phase_case_status_transitions) re-creates
-- transition_case_status whose DECLARE section carries
--   v_transition case_status_transitions%ROWTYPE;
-- and plpgsql resolves declaration-section types at CREATE FUNCTION time, so a
-- fresh preview-branch replay dies with 42P01 (the later 202607041* lifecycle
-- files also DML this table directly). Shape mirrors live; the from/to phase
-- CHECK constraints are deliberately omitted — the mirrored lifecycle files
-- DROP CONSTRAINT IF EXISTS then ADD their own versions. Idempotent;
-- registered as applied on prod (table exists there).
CREATE TABLE IF NOT EXISTS public.case_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phase text NOT NULL,
  to_phase text NOT NULL,
  allowed_roles text[] NOT NULL DEFAULT ARRAY['technician'::text,'manager'::text,'admin'::text,'owner'::text],
  requires text[] NOT NULL DEFAULT ARRAY[]::text[],
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_status_transitions_no_self CHECK (from_phase <> to_phase),
  CONSTRAINT case_status_transitions_phase_pair UNIQUE (from_phase, to_phase)
);
