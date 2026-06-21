-- M1 (auth lifecycle audit): deactivated users kept tenant data access because
-- get_current_tenant_id() resolved their tenant_id without checking is_active,
-- while the RESTRICTIVE tenant-isolation policies gate on that function. The
-- companion helpers (is_staff_user/is_admin/is_platform_admin) already filter
-- is_active = true, so this aligns the tenant resolver with them. Active users
-- are unaffected (primary path unchanged); a deactivated user now resolves NULL
-- and the JWT fallback is empty (no custom access-token hook is configured), so
-- isolation denies every tenant table immediately on deactivation.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select tenant_id from public.profiles where id = auth.uid() and is_active = true and deleted_at is null),
    nullif(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid
  )
$function$;
