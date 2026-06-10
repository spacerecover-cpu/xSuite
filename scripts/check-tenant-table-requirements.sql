WITH tenant_tables AS (
  SELECT DISTINCT t.table_name
  FROM information_schema.tables t
  JOIN information_schema.columns c
    ON c.table_schema = t.table_schema AND c.table_name = t.table_name
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND c.column_name = 'tenant_id'
    AND t.table_name NOT IN ('tenant_subscriptions', 'tenant_payment_methods',
                              'tenant_activity_log', 'tenant_health_metrics',
                              'tenant_impersonation_sessions', 'tenant_rate_limits',
                              -- core/platform + system-template tables that legitimately allow
                              -- NULL tenant_id (platform admins; platform logs; system-default
                              -- notification templates) and so cannot satisfy the NOT-NULL rule
                              'profiles', 'platform_audit_logs', 'notification_templates',
                              -- report-definition tables use the same global+tenant-override
                              -- pattern (20260610050104): tenant_id NULL = system row readable
                              -- by all tenants; tenant rows scoped by per-row policies. The
                              -- NOT-NULL / RESTRICTIVE-isolation / audit-trigger rules cannot
                              -- apply to mixed system+tenant tables.
                              'master_case_report_templates', 'report_section_library',
                              'report_section_presets', 'report_template_section_mappings')
),
violations AS (
  SELECT
    tt.table_name,
    CASE WHEN (SELECT is_nullable FROM information_schema.columns
               WHERE table_schema='public' AND table_name=tt.table_name AND column_name='tenant_id') = 'NO'
         THEN NULL ELSE 'tenant_id is nullable' END AS issue_1,
    CASE WHEN (SELECT relrowsecurity FROM pg_class
               WHERE oid = format('public.%I', tt.table_name)::regclass) = true
         THEN NULL ELSE 'RLS not enabled' END AS issue_2,
    CASE WHEN (SELECT relforcerowsecurity FROM pg_class
               WHERE oid = format('public.%I', tt.table_name)::regclass) = true
         THEN NULL ELSE 'RLS not forced' END AS issue_3,
    CASE WHEN EXISTS (SELECT 1 FROM pg_policy
                      WHERE polrelid = format('public.%I', tt.table_name)::regclass
                        AND NOT polpermissive)
         THEN NULL ELSE 'No RESTRICTIVE policy' END AS issue_4,
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                      WHERE tgrelid = format('public.%I', tt.table_name)::regclass
                        AND tgname LIKE 'set_%_tenant_and_audit'
                        AND NOT tgisinternal)
         THEN NULL ELSE 'Missing set_*_tenant_and_audit trigger' END AS issue_5,
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public' AND tablename=tt.table_name
                        AND indexdef ILIKE '%(tenant_id)%')
         THEN NULL ELSE 'Missing tenant_id index' END AS issue_6
  FROM tenant_tables tt
)
SELECT table_name, issue_1, issue_2, issue_3, issue_4, issue_5, issue_6
FROM violations
WHERE issue_1 IS NOT NULL OR issue_2 IS NOT NULL OR issue_3 IS NOT NULL
   OR issue_4 IS NOT NULL OR issue_5 IS NOT NULL OR issue_6 IS NOT NULL;
