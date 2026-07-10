-- P2a: get_sidebar_badge_counts — one RPC for the 4 sidebar nav badges,
-- replacing 4 separate polled count queries (useSidebarBadges).
-- Applied live as version 20260710<see manifest>. SECURITY INVOKER (tenant-scoped
-- RLS), adds deleted_at IS NULL (fixes IDX-06 over-count), status literals preserved.
-- Audit: docs/superpowers/specs/2026-07-09-e2e-performance-audit.md
CREATE OR REPLACE FUNCTION public.get_sidebar_badge_counts(p_cases_since timestamptz)
RETURNS TABLE(cases_today bigint, invoices_attention bigint, pending_quotes bigint, low_stock bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*) FROM cases c
       WHERE c.deleted_at IS NULL AND c.created_at >= p_cases_since
         AND c.status IN (SELECT s.name FROM master_case_statuses s
           WHERE s.is_active AND lower(coalesce(s.type::text,'')) NOT IN ('delivered','closed','cancelled')))::bigint,
    (SELECT count(*) FROM invoices i WHERE i.deleted_at IS NULL AND i.status IN ('sent','partially-paid','overdue'))::bigint,
    (SELECT count(*) FROM quotes q WHERE q.deleted_at IS NULL AND q.status = 'sent')::bigint,
    public.get_low_stock_count()::bigint;
$function$;
REVOKE ALL ON FUNCTION public.get_sidebar_badge_counts(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sidebar_badge_counts(timestamptz) TO authenticated;
