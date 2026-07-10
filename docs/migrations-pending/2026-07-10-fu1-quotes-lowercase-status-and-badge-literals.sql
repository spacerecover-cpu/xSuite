-- Perf FU-1 (owner decision 2026-07-10: lowercase codes are canonical).
-- Applied live as version 20260710170508.
--
-- Three read surfaces showed wrong/zero numbers because their literals did not
-- match stored values:
--   1. sidebar quote "pending" badge: filtered status='sent' but every stored
--      quote was Title-case legacy-import ('Sent' 1053/'Draft' 77/'Accepted' 8)
--      -> 0 for every tenant since P2a.
--   2. get_quote_stats_base: same case mismatch -> draft/sent/accepted read 0.
--   3. sidebar invoice "attention" badge: filtered ('sent','partially-paid',
--      'overdue') but invoices store sent/partial/paid/draft/cancelled ->
--      counted only 'sent' (missed 'partial'); 'overdue' is a date fact
--      (due_date), never a stored status.
--
-- The service layer (quotesService.ts) already types and writes lowercase
-- codes ('draft'|'sent'|'accepted'|'rejected'|'expired'|'converted'), so the
-- Title-case rows were unreachable by app filters and rendered unmapped.
--
-- (1) One-time normalization of the legacy rows (all rows incl. soft-deleted).
-- set_audit_actor_fields keeps updated_by (auth.uid() is NULL here -> COALESCE
-- preserves the previous editor; verified 1060 NULLs before == after in a
-- rolled-back rehearsal).
UPDATE public.quotes
SET status = lower(status)
WHERE status IS DISTINCT FROM lower(status)
  AND lower(status) IN ('draft','sent','accepted','rejected','expired','converted');

-- Fail loud if any live row still carries an out-of-vocabulary status.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO v_bad
  FROM public.quotes
  WHERE deleted_at IS NULL
    AND status IS NOT NULL
    AND status NOT IN ('draft','sent','accepted','rejected','expired','converted');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected quotes.status values after normalization: %', v_bad;
  END IF;
END
$$;

-- (2) Invoice "attention" literal fix: sent + partial are the unpaid, issued
-- statuses (overdue is a subset by due_date, so IN ('sent','partial') already
-- counts it; nothing else needs attention). Quote line unchanged — 'sent' now
-- matches the normalized data. Everything else byte-identical to P2a.
CREATE OR REPLACE FUNCTION public.get_sidebar_badge_counts(p_cases_since timestamp with time zone)
 RETURNS TABLE(cases_today bigint, invoices_attention bigint, pending_quotes bigint, low_stock bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*) FROM cases c
       WHERE c.deleted_at IS NULL
         AND c.created_at >= p_cases_since
         AND c.status IN (
           SELECT s.name FROM master_case_statuses s
           WHERE s.is_active
             AND lower(coalesce(s.type::text, '')) NOT IN ('delivered', 'closed', 'cancelled')
         ))::bigint AS cases_today,
    (SELECT count(*) FROM invoices i
       WHERE i.deleted_at IS NULL
         AND i.status IN ('sent', 'partial'))::bigint AS invoices_attention,
    (SELECT count(*) FROM quotes q
       WHERE q.deleted_at IS NULL
         AND q.status = 'sent')::bigint AS pending_quotes,
    public.get_low_stock_count()::bigint AS low_stock;
$function$;
