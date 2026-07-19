-- get_tenant_module_entitlements still had a PUBLIC EXECUTE grant (the engine
-- migration revoked PUBLIC on tenant_module_enabled/refresh but not this one),
-- so anon inherited EXECUTE via PUBLIC. Revoke it; authenticated keeps its
-- explicit grant.
REVOKE EXECUTE ON FUNCTION public.get_tenant_module_entitlements() FROM PUBLIC;
