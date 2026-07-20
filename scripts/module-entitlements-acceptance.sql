-- module-entitlements-acceptance.sql
-- End-to-end acceptance harness for plan-driven module entitlements (Phase 1).
-- Proves, against a real tenant, that the RESTRICTIVE `<table>_module_gate`
-- policies + tenant_module_enabled() actually deliver "no trace" at the data
-- layer, and that refresh_tenant_module_entitlements() preserves grandfather rows.
--
-- Complements scripts/check-module-rls.sql (which asserts the policies EXIST).
-- This one asserts they BEHAVE: it seeds probe rows, impersonates a real staff
-- user, and measures visibility/writability with the module ON vs OFF.
--
-- Pure SQL (no psql meta-commands): runs identically via `psql -f` or any SQL
-- runner. Everything is inside ONE transaction that is ALWAYS rolled back, so it
-- is safe against the live database — no probe row, no entitlement change, and no
-- impersonation state survives. Intermediate counts are carried across the
-- SET ROLE / RESET ROLE round-trip in transaction-local GUCs (acc.*).
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/module-entitlements-acceptance.sql
--
-- Result: a RAISE NOTICE '... PASSED' on success; a RAISE EXCEPTION (non-zero
-- exit under ON_ERROR_STOP) listing the exact mismatch on failure; a RAISE NOTICE
-- 'SKIP ...' when no eligible tenant exists (e.g. a fresh/empty DB).
--
-- Scenarios:
--   C  refresh_tenant_module_entitlements() keeps grandfather rows enabled.
--   A  module ENABLED  -> probe rows visible; non-gated `cases` visible.
--   B  module DISABLED -> probe rows invisible; INSERT rejected; `cases` still
--      visible (the gate is scoped to HR/Payroll, not a blanket denial).

BEGIN;

-- Pick a tenant with BOTH hr and payroll enabled and a non-viewer staff user in
-- it. When none exists, acc.ready = 'false' and acc.tenant/acc.user fall back to
-- the nil uuid so every later ::uuid cast stays valid while matching no rows.
SELECT
  set_config('acc.tenant', coalesce(pick.tenant_id::text, '00000000-0000-0000-0000-000000000000'), true),
  set_config('acc.user',   coalesce(pick.user_id::text,   '00000000-0000-0000-0000-000000000000'), true),
  set_config('acc.ready',
    CASE WHEN pick.tenant_id IS NOT NULL AND pick.user_id IS NOT NULL THEN 'true' ELSE 'false' END, true)
FROM (SELECT 1) d
LEFT JOIN LATERAL (
  SELECT e.tenant_id,
         (SELECT p.id FROM profiles p
            WHERE p.tenant_id = e.tenant_id AND p.is_active AND p.deleted_at IS NULL
              AND p.role IN ('owner','admin','manager','technician','sales','accounts','hr')
            ORDER BY p.created_at LIMIT 1) AS user_id
  FROM tenant_module_entitlements e
  WHERE e.module_slug = 'hr' AND e.enabled AND e.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM tenant_module_entitlements e2
                 WHERE e2.tenant_id = e.tenant_id AND e2.module_slug = 'payroll'
                   AND e2.enabled AND e2.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM profiles p
                 WHERE p.tenant_id = e.tenant_id AND p.is_active AND p.deleted_at IS NULL
                   AND p.role IN ('owner','admin','manager','technician','sales','accounts','hr'))
  ORDER BY e.tenant_id
  LIMIT 1
) pick ON true;

-- Privileged setup (skipped when not ready): seed probe rows, run Scenario C's
-- refresh + capture, and stamp the impersonation JWT claims. app.bypass_tenant_guard
-- is the documented escape hatch for legitimate system-level cross-tenant writes;
-- it keeps the caller-provided tenant_id.
DO $$
BEGIN
  IF current_setting('acc.ready', true) = 'true' THEN
    PERFORM set_config('app.bypass_tenant_guard', 'true', true);
    INSERT INTO departments (tenant_id, name)
      VALUES (current_setting('acc.tenant')::uuid, '__module_acc_probe_dept__');
    INSERT INTO payroll_periods (tenant_id, period_name, start_date, end_date)
      VALUES (current_setting('acc.tenant')::uuid, '__module_acc_probe_period__', DATE '2000-01-01', DATE '2000-01-31');

    -- Scenario C: refresh must PRESERVE grandfather rows (never overwrite them).
    PERFORM refresh_tenant_module_entitlements(current_setting('acc.tenant')::uuid);
    PERFORM set_config('acc.c_kept',
      (SELECT count(*)::text FROM tenant_module_entitlements
         WHERE tenant_id = current_setting('acc.tenant')::uuid AND module_slug IN ('hr','payroll')
           AND deleted_at IS NULL AND source = 'grandfather' AND enabled = true), true);

    -- Impersonate the real staff user for the RLS probes below.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', current_setting('acc.user'), 'role', 'authenticated')::text, true);
  END IF;
END $$;

-- Scenario A: module ENABLED -> probe rows + non-gated `cases` visible.
SET ROLE authenticated;
SELECT set_config('acc.a_dept',   (SELECT count(*)::text FROM departments     WHERE name = '__module_acc_probe_dept__'), true);
SELECT set_config('acc.a_period', (SELECT count(*)::text FROM payroll_periods WHERE period_name = '__module_acc_probe_period__'), true);
SELECT set_config('acc.a_cases',  (SELECT count(*)::text FROM cases WHERE tenant_id = (SELECT get_current_tenant_id())), true);
RESET ROLE;

-- Flip BOTH modules off for the tenant (rolled back at end).
UPDATE tenant_module_entitlements SET enabled = false
  WHERE tenant_id = current_setting('acc.tenant')::uuid
    AND module_slug IN ('hr','payroll') AND deleted_at IS NULL;

-- Scenario B: module DISABLED -> probe rows invisible; `cases` still visible;
-- and an INSERT must be rejected by the RESTRICTIVE WITH CHECK (module gate = false).
SET ROLE authenticated;
SELECT set_config('acc.b_dept',   (SELECT count(*)::text FROM departments     WHERE name = '__module_acc_probe_dept__'), true);
SELECT set_config('acc.b_period', (SELECT count(*)::text FROM payroll_periods WHERE period_name = '__module_acc_probe_period__'), true);
SELECT set_config('acc.b_cases',  (SELECT count(*)::text FROM cases WHERE tenant_id = (SELECT get_current_tenant_id())), true);
DO $$
BEGIN
  IF current_setting('acc.ready', true) <> 'true' THEN
    PERFORM set_config('acc.b_write_blocked', 'true', true);
  ELSE
    BEGIN
      INSERT INTO departments (tenant_id, name)
        VALUES ((SELECT get_current_tenant_id()), '__module_acc_probe_write__');
      PERFORM set_config('acc.b_write_blocked', 'false', true);  -- gate FAILED to block
    EXCEPTION
      WHEN insufficient_privilege THEN
        PERFORM set_config('acc.b_write_blocked', 'true', true);  -- expected: 42501 RLS WITH CHECK
    END;
  END IF;
END $$;
RESET ROLE;

-- Evaluate every captured count and either SKIP, PASS, or FAIL (non-zero exit).
DO $$
DECLARE
  ready     text := current_setting('acc.ready', true);
  c_kept    int  := coalesce(nullif(current_setting('acc.c_kept', true), ''), '0')::int;
  a_dept    int  := coalesce(nullif(current_setting('acc.a_dept', true), ''), '0')::int;
  a_period  int  := coalesce(nullif(current_setting('acc.a_period', true), ''), '0')::int;
  a_cases   int  := coalesce(nullif(current_setting('acc.a_cases', true), ''), '0')::int;
  b_dept    int  := coalesce(nullif(current_setting('acc.b_dept', true), ''), '0')::int;
  b_period  int  := coalesce(nullif(current_setting('acc.b_period', true), ''), '0')::int;
  b_cases   int  := coalesce(nullif(current_setting('acc.b_cases', true), ''), '0')::int;
  b_blocked text := current_setting('acc.b_write_blocked', true);
  problems  text := '';
BEGIN
  IF ready <> 'true' THEN
    RAISE NOTICE 'SKIP module-entitlements-acceptance: no tenant with hr+payroll enabled and a staff user (expected on a fresh/empty DB).';
    RETURN;
  END IF;
  IF c_kept   <> 2 THEN problems := problems || format(' grandfather_kept=%s(exp 2);', c_kept); END IF;
  IF a_dept   <> 1 THEN problems := problems || format(' dept_on=%s(exp 1);', a_dept); END IF;
  IF a_period <> 1 THEN problems := problems || format(' period_on=%s(exp 1);', a_period); END IF;
  IF b_dept   <> 0 THEN problems := problems || format(' dept_off=%s(exp 0);', b_dept); END IF;
  IF b_period <> 0 THEN problems := problems || format(' period_off=%s(exp 0);', b_period); END IF;
  IF b_cases  <> a_cases THEN problems := problems || format(' cases_off=%s(exp %s, non-gated must be unaffected);', b_cases, a_cases); END IF;
  IF b_blocked IS DISTINCT FROM 'true' THEN problems := problems || ' write_not_blocked_while_disabled;'; END IF;

  IF problems <> '' THEN
    RAISE EXCEPTION 'MODULE-ENTITLEMENTS ACCEPTANCE FAILED:%', problems;
  END IF;
  RAISE NOTICE 'MODULE-ENTITLEMENTS ACCEPTANCE PASSED: grandfather_kept=%, A(dept=%,period=%,cases=%), B(dept=%,period=%,cases=%,write_blocked=%)',
    c_kept, a_dept, a_period, a_cases, b_dept, b_period, b_cases, b_blocked;
END $$;

ROLLBACK;
