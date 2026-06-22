-- EXP-009: DB-side state-machine backstop. RLS expenses_update = has_role('accounts')
-- with no status predicate, so an accounts-role user could run a raw table UPDATE that
-- bypasses the service guards (e.g. draft->paid, or approved->rejected leaving a dangling
-- ledger posting). This BEFORE UPDATE trigger validates OLD.status->NEW.status against the
-- exact edge set the shipped service paths use, raising check_violation otherwise.
-- Rollback: DROP TRIGGER zz_enforce_expense_status_transition ON public.expenses;
--           DROP FUNCTION public.enforce_expense_status_transition();
CREATE OR REPLACE FUNCTION public.enforce_expense_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_s text := OLD.status;
  new_s text := NEW.status;
  soft_deleting boolean := (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);
BEGIN
  IF new_s IS NOT DISTINCT FROM old_s THEN
    RETURN NEW;
  END IF;

  IF new_s = 'voided' THEN
    IF soft_deleting THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'An expense can only become voided via soft-delete (% -> voided without deleted_at)', old_s
      USING ERRCODE = 'check_violation';
  END IF;

  IF old_s = 'voided' THEN
    RAISE EXCEPTION 'A voided expense cannot transition to %', new_s
      USING ERRCODE = 'check_violation';
  END IF;

  IF (old_s IN ('draft','rejected') AND new_s = 'pending')
     OR (old_s = 'pending'  AND new_s = 'approved')
     OR (old_s = 'pending'  AND new_s = 'rejected')
     OR (old_s = 'approved' AND new_s = 'paid')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal expense status transition: % -> %', old_s, new_s
    USING ERRCODE = 'check_violation';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_expense_status_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS zz_enforce_expense_status_transition ON public.expenses;
CREATE TRIGGER zz_enforce_expense_status_transition
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.enforce_expense_status_transition();
