-- (A) plan -> module inclusion (platform-owned, like subscription_plans; no tenant_id)
CREATE TABLE public.plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.master_modules(id) ON DELETE CASCADE,
  is_included boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, module_id)
);
CREATE INDEX idx_plan_modules_plan_id ON public.plan_modules(plan_id);
ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_modules_select ON public.plan_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_modules_write  ON public.plan_modules FOR ALL   TO authenticated
  USING ((SELECT is_platform_admin())) WITH CHECK ((SELECT is_platform_admin()));

-- (B) per-tenant materialized effective entitlement set (default-deny; RLS reads this later)
CREATE TABLE public.tenant_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  enabled boolean NOT NULL,
  source text NOT NULL DEFAULT 'plan' CHECK (source IN ('plan','override','trial','grandfather')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, module_slug)
);
CREATE INDEX idx_tenant_module_entitlements_tenant_id
  ON public.tenant_module_entitlements(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE public.tenant_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_module_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_module_entitlements_tenant_isolation ON public.tenant_module_entitlements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_current_tenant_id()) OR (SELECT is_platform_admin()));
CREATE POLICY tenant_module_entitlements_select ON public.tenant_module_entitlements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tenant_module_entitlements_write ON public.tenant_module_entitlements
  FOR ALL TO authenticated USING ((SELECT is_platform_admin())) WITH CHECK ((SELECT is_platform_admin()));
CREATE TRIGGER set_tenant_module_entitlements_tenant_and_audit
  BEFORE INSERT OR UPDATE ON public.tenant_module_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_audit_fields();
