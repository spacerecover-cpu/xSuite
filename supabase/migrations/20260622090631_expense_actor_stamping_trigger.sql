-- EXP-010 (security core): actor stamping was client-supplied and spoofable (created_by
-- from the client; approved_by/rejected_by from a profile id passed in). This BEFORE
-- INSERT/UPDATE trigger FORCES the actor columns from auth.uid() server-side and pins
-- created_by to OLD on UPDATE (immutable authorship). Writes ONLY actor columns — never
-- amount/currency/status/tenant_id/updated_at — so the EXP-019 optimistic lock (keys on
-- updated_at) and FX snapshots are unaffected.
-- DEFERRED (separate item): the per-action audit_trails EMISSION half — log_audit_trail
-- has a 6-arg/8-arg overload that 400s via PostgREST named-params; needs its own resolution.
-- Rollback: DROP TRIGGER zset_expenses_actor_fields ON public.expenses;
--           DROP FUNCTION public.set_expense_actor_fields();
CREATE OR REPLACE FUNCTION public.set_expense_actor_fields()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $BODY$
DECLARE uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL THEN NEW.created_by := uid; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(uid, NEW.updated_by);
    NEW.created_by := OLD.created_by;
    IF NEW.status = 'pending'  AND OLD.status IS DISTINCT FROM 'pending'  AND uid IS NOT NULL THEN NEW.submitted_by := uid; END IF;
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND uid IS NOT NULL THEN NEW.approved_by  := uid; END IF;
    IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' AND uid IS NOT NULL THEN NEW.rejected_by  := uid; END IF;
  END IF;
  RETURN NEW;
END;
$BODY$;

REVOKE ALL ON FUNCTION public.set_expense_actor_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS zset_expenses_actor_fields ON public.expenses;
CREATE TRIGGER zset_expenses_actor_fields BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_actor_fields();
