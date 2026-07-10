-- check-rls-initplan.sql
-- CI guard for the RLS InitPlan discipline (see CLAUDE.md → Multi-Tenant Architecture).
--
-- Fails if any policy predicate in schema `public` contains a BARE call to a
-- SECURITY DEFINER auth/tenant helper. Bare calls are re-evaluated per row (they
-- never become an InitPlan), which is the root cause fixed by
-- migration perf_p0_rls_helper_initplan_wrap_* (2026-07-10). Every such call MUST
-- be wrapped in a scalar sub-select, e.g. (SELECT get_current_tenant_id()).
--
-- A "bare" call is a helper name followed by "(" that is NOT immediately preceded
-- by "SELECT " (Postgres renders a wrapped call as "( SELECT fn() ... )"), and NOT
-- part of a longer identifier (guarded by a leading word boundary that also rejects
-- an underscore/alnum before the name).
--
-- Usage: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/check-rls-initplan.sql
-- Exits non-zero (via the DO ... RAISE EXCEPTION) if any violation is found.

WITH pol AS (
  SELECT
    tablename,
    policyname,
    cmd,
    coalesce(qual, '') || ' || ' || coalesce(with_check, '') AS expr
  FROM pg_policies
  WHERE schemaname = 'public'
),
-- helper names whose bodies read profiles/tenants/JWT (per-row = expensive)
helpers(name) AS (
  VALUES
    ('get_current_tenant_id'),
    ('is_platform_admin'),
    ('is_staff_user'),
    ('has_role'),
    ('is_admin'),
    ('is_tenant_admin'),
    ('get_current_business_unit_id'),
    ('business_unit_scoping_enabled'),
    ('get_current_portal_customer_id')
),
violations AS (
  SELECT p.tablename, p.policyname, p.cmd, h.name AS helper
  FROM pol p
  CROSS JOIN helpers h
  -- bare call: helper "(" NOT preceded by "SELECT ", and not preceded by an
  -- identifier char (so it is a real call, not a substring of a longer name).
  WHERE p.expr ~ ('(?<![A-Za-z0-9_])(?<!SELECT )' || h.name || '\s*\(')
)
SELECT tablename, policyname, cmd, helper AS bare_helper_call
FROM violations
ORDER BY tablename, policyname, helper;

DO $$
DECLARE
  v_count int;
BEGIN
  WITH pol AS (
    SELECT coalesce(qual,'') || ' || ' || coalesce(with_check,'') AS expr
    FROM pg_policies WHERE schemaname = 'public'
  ),
  helpers(name) AS (
    VALUES ('get_current_tenant_id'),('is_platform_admin'),('is_staff_user'),
           ('has_role'),('is_admin'),('is_tenant_admin'),
           ('get_current_business_unit_id'),('business_unit_scoping_enabled'),
           ('get_current_portal_customer_id')
  )
  SELECT count(*) INTO v_count
  FROM pol p CROSS JOIN helpers h
  WHERE p.expr ~ ('(?<![A-Za-z0-9_])(?<!SELECT )' || h.name || '\s*\(');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS InitPlan check FAILED: % bare helper call(s) in public policies. Wrap each in (SELECT fn(...)). See CLAUDE.md and the rows listed above.', v_count;
  END IF;
  RAISE NOTICE 'OK: no bare RLS helper calls in public policies (InitPlan discipline holds)';
END $$;
