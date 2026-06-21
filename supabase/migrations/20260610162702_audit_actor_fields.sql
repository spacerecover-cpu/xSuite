-- Audit actor stamping (platform review 2026-06-10, item 3).
-- created_by/updated_by were app-stamped (and almost always missed: 3 of 28
-- cases had updated_by). Move actor stamping into a BEFORE trigger on the
-- tables that carry both columns; add updated_by where the lab needs editor
-- identity (internal notes are editable, devices are corrected post-intake).

ALTER TABLE public.case_internal_notes ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.case_devices ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.set_audit_actor_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    -- Keep the previous editor when there is no auth context (system jobs).
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_audit_actor_fields() FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_cases_audit_actor ON public.cases;
CREATE TRIGGER set_cases_audit_actor
  BEFORE INSERT OR UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_invoices_audit_actor ON public.invoices;
CREATE TRIGGER set_invoices_audit_actor
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_quotes_audit_actor ON public.quotes;
CREATE TRIGGER set_quotes_audit_actor
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_customers_enhanced_audit_actor ON public.customers_enhanced;
CREATE TRIGGER set_customers_enhanced_audit_actor
  BEFORE INSERT OR UPDATE ON public.customers_enhanced
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_companies_audit_actor ON public.companies;
CREATE TRIGGER set_companies_audit_actor
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_case_internal_notes_audit_actor ON public.case_internal_notes;
CREATE TRIGGER set_case_internal_notes_audit_actor
  BEFORE INSERT OR UPDATE ON public.case_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();

DROP TRIGGER IF EXISTS set_case_devices_audit_actor ON public.case_devices;
CREATE TRIGGER set_case_devices_audit_actor
  BEFORE INSERT OR UPDATE ON public.case_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_actor_fields();
