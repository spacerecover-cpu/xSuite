-- Migration: create_case_device_activity
-- Per-device discrete activity log surfaced in the Edit Device → History/Activity tab.
-- Records component status changes, component/diagnostic notes, tests performed and
-- device-received events. Tenant-scoped, additive (new table only) — existing data
-- and the forensic chain_of_custody ledger are untouched.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.case_device_activity CASCADE;

CREATE TABLE public.case_device_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  status text,
  component_key text,
  old_value text,
  new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.case_device_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_device_activity FORCE ROW LEVEL SECURITY;

CREATE POLICY "case_device_activity_tenant_isolation" ON public.case_device_activity
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((tenant_id = get_current_tenant_id()) OR is_platform_admin()));

CREATE POLICY "case_device_activity_select" ON public.case_device_activity FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "case_device_activity_insert" ON public.case_device_activity FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "case_device_activity_update" ON public.case_device_activity FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "case_device_activity_delete" ON public.case_device_activity FOR DELETE TO authenticated
  USING (has_role('admin'::text));

CREATE TRIGGER set_case_device_activity_tenant_and_audit BEFORE INSERT OR UPDATE ON public.case_device_activity
  FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields();

CREATE INDEX idx_case_device_activity_tenant_id ON public.case_device_activity USING btree (tenant_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_case_device_activity_device ON public.case_device_activity USING btree (device_id, created_at DESC) WHERE (deleted_at IS NULL);

COMMENT ON TABLE public.case_device_activity IS 'Per-device discrete activity log (component status changes, notes, tests, device received) surfaced in the Edit Device History tab.';
