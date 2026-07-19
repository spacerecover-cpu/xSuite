-- Default-DENY module gate for the CURRENT tenant. Platform admins bypass.
-- STABLE + SECURITY DEFINER + pinned search_path; designed to be called as a scalar
-- sub-select in RLS (InitPlans once per query, not per row).
CREATE OR REPLACE FUNCTION public.tenant_module_enabled(p_module_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN (SELECT is_platform_admin()) THEN true
    ELSE COALESCE((
      SELECT e.enabled FROM tenant_module_entitlements e
      WHERE e.tenant_id = (SELECT get_current_tenant_id())
        AND e.module_slug = p_module_slug AND e.deleted_at IS NULL
    ), false)
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_module_entitlements()
RETURNS TABLE(module_slug text, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.slug,
         CASE WHEN NOT m.is_gateable THEN true
              WHEN (SELECT is_platform_admin()) THEN true
              ELSE COALESCE(e.enabled, false) END
  FROM master_modules m
  LEFT JOIN tenant_module_entitlements e
    ON e.module_slug = m.slug AND e.tenant_id = (SELECT get_current_tenant_id()) AND e.deleted_at IS NULL
  WHERE m.is_active;
$$;

-- Recompute a tenant's entitlements from its ACTIVE subscription's plan_modules.
CREATE OR REPLACE FUNCTION public.refresh_tenant_module_entitlements(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan uuid;
BEGIN
  SELECT plan_id INTO v_plan FROM tenant_subscriptions
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
     AND status IN ('active','trialing')
   ORDER BY updated_at DESC LIMIT 1;

  INSERT INTO tenant_module_entitlements (tenant_id, module_slug, enabled, source)
  SELECT p_tenant_id, m.slug, COALESCE(bool_or(pm.is_included), false), 'plan'
  FROM master_modules m
  LEFT JOIN plan_modules pm ON pm.module_id = m.id AND pm.plan_id = v_plan
  WHERE m.is_gateable AND m.is_active
  GROUP BY m.slug
  ON CONFLICT (tenant_id, module_slug) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        source = CASE WHEN tenant_module_entitlements.source = 'override'
                      THEN tenant_module_entitlements.source ELSE 'plan' END,
        updated_at = now(), deleted_at = NULL;

  -- Dependency coercion: payroll ⇒ hr.
  UPDATE tenant_module_entitlements SET enabled = true, updated_at = now()
   WHERE tenant_id = p_tenant_id AND module_slug = 'hr'
     AND EXISTS (SELECT 1 FROM tenant_module_entitlements p
                 WHERE p.tenant_id = p_tenant_id AND p.module_slug='payroll' AND p.enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_module_enabled(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_module_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_module_entitlements() TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_tenant_module_entitlements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_tenant_module_entitlements(uuid) TO service_role;

-- Triggers: recompute on subscription change and on plan_modules change.
CREATE OR REPLACE FUNCTION public.trg_refresh_entitlements_on_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM refresh_tenant_module_entitlements(NEW.tenant_id); RETURN NEW; END; $$;
CREATE TRIGGER trg_tenant_subscriptions_refresh_entitlements
  AFTER INSERT OR UPDATE OF plan_id, status ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_entitlements_on_subscription();

CREATE OR REPLACE FUNCTION public.trg_refresh_entitlements_on_plan_modules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT ts.tenant_id FROM tenant_subscriptions ts
           WHERE ts.plan_id = COALESCE(NEW.plan_id, OLD.plan_id) AND ts.deleted_at IS NULL
  LOOP PERFORM refresh_tenant_module_entitlements(r.tenant_id); END LOOP;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_plan_modules_refresh_entitlements
  AFTER INSERT OR UPDATE OR DELETE ON public.plan_modules
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_entitlements_on_plan_modules();
