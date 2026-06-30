-- Owner decision: lab Admins/Owners manage the device/media + case/service reference catalogs from
-- Settings, not only platform admins. Switch the INSERT/UPDATE/DELETE policies on these GLOBAL
-- catalog/master tables from is_platform_admin() to is_admin() (owner/admin in ANY scope — so both
-- tenant admins/owners and platform admins). SELECT policies (USING true) are left untouched.
-- NOTE: these tables are shared across tenants (no tenant_id), so edits are global by design.
DO $$
DECLARE
  t text;
  p record;
  tbls text[] := ARRAY[
    'catalog_device_types','catalog_device_brands','catalog_device_capacities','catalog_accessories',
    'catalog_interfaces','catalog_device_made_in','catalog_device_encryption','catalog_device_platter_counts',
    'catalog_device_head_counts','master_inventory_categories','master_inventory_status_types',
    'master_inventory_condition_types','catalog_service_types','catalog_service_problems',
    'master_case_priorities','master_case_statuses','catalog_service_locations',
    'catalog_device_conditions','catalog_device_roles'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR p IN
      SELECT policyname, cmd FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND permissive='PERMISSIVE' AND cmd IN ('INSERT','UPDATE','DELETE')
    LOOP
      IF p.cmd = 'INSERT' THEN
        EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (is_admin())', p.policyname, t);
      ELSIF p.cmd = 'DELETE' THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (is_admin())', p.policyname, t);
      ELSE
        EXECUTE format('ALTER POLICY %I ON public.%I USING (is_admin()) WITH CHECK (is_admin())', p.policyname, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;
