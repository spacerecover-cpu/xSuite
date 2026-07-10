-- P2c: financial stat aggregation RPCs (audit F3/F7/F8). Applied live as
-- version 20260710111013. Moves getQuoteStats/getPaymentStats/getTransactionStats
-- off fetch-all-and-reduce-in-JS onto SQL aggregation. House style:
-- LANGUAGE sql STABLE, SET search_path TO '', SECURITY INVOKER (tenant-scoped RLS),
-- schema-qualified tables, jsonb_build_object + coalesce(sum(...),0).
-- (See docs/superpowers/specs/2026-07-09-e2e-performance-audit.md.)

-- (F7) re-signed to ADD sentValueBase (only field getQuoteStats lacked); rest byte-identical.
CREATE OR REPLACE FUNCTION public.get_quote_stats_base()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total', count(*), 'draft', count(*) FILTER (WHERE status='draft'),
    'sent', count(*) FILTER (WHERE status='sent'), 'accepted', count(*) FILTER (WHERE status='accepted'),
    'rejected', count(*) FILTER (WHERE status='rejected'), 'expired', count(*) FILTER (WHERE status='expired'),
    'converted', count(*) FILTER (WHERE status='converted'),
    'totalValueBase', coalesce(sum(coalesce(total_amount_base, total_amount*exchange_rate)),0),
    'sentValueBase', coalesce(sum(coalesce(total_amount_base, total_amount*exchange_rate)) FILTER (WHERE status='sent'),0),
    'acceptedValueBase', coalesce(sum(coalesce(total_amount_base, total_amount*exchange_rate)) FILTER (WHERE status='accepted'),0)
  ) FROM public.quotes WHERE deleted_at IS NULL;
$function$;

-- (F8) NEW. deleted_at IS NULL added (old JS omitted it); today = UTC-date match
-- (old string-vs-timestamptz was ~always 0). today/month-start passed in (browser tz).
CREATE OR REPLACE FUNCTION public.get_payment_stats_base(
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_today date DEFAULT NULL, p_month_start date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total', count(*), 'completed', count(*) FILTER (WHERE status='completed'), 'pending', count(*) FILTER (WHERE status='pending'),
    'today', count(*) FILTER (WHERE p_today IS NOT NULL AND (payment_date AT TIME ZONE 'UTC')::date = p_today),
    'totalAmountBase', coalesce(sum(coalesce(amount_base, amount)),0),
    'completedAmountBase', coalesce(sum(coalesce(amount_base, amount)) FILTER (WHERE status='completed'),0),
    'thisMonthAmountBase', coalesce(sum(coalesce(amount_base, amount)) FILTER (WHERE p_month_start IS NOT NULL AND payment_date IS NOT NULL AND payment_date >= p_month_start),0)
  ) FROM public.payments WHERE deleted_at IS NULL
    AND (p_date_from IS NULL OR payment_date >= p_date_from) AND (p_date_to IS NULL OR payment_date <= p_date_to);
$function$;

-- (F3) NEW. Scans the append-only ledger once in SQL instead of fetching it all.
CREATE OR REPLACE FUNCTION public.get_transaction_stats_base(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH t AS (SELECT transaction_type, coalesce(amount_base, amount) AS amt FROM public.financial_transactions
             WHERE deleted_at IS NULL AND (p_date_from IS NULL OR transaction_date >= p_date_from) AND (p_date_to IS NULL OR transaction_date <= p_date_to))
  SELECT jsonb_build_object(
    'total', count(*), 'income', count(*) FILTER (WHERE transaction_type='income'), 'expense', count(*) FILTER (WHERE transaction_type='expense'),
    'totalIncomeBase', coalesce(sum(amt) FILTER (WHERE transaction_type='income'),0),
    'totalExpensesBase', coalesce(sum(amt) FILTER (WHERE transaction_type='expense'),0),
    'fxGainBase', coalesce(sum(amt) FILTER (WHERE transaction_type='fx_gain'),0),
    'fxLossBase', coalesce(sum(amt) FILTER (WHERE transaction_type='fx_loss'),0)
  ) FROM t;
$function$;

REVOKE ALL ON FUNCTION public.get_payment_stats_base(date,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_stats_base(date,date,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_transaction_stats_base(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_stats_base(date,date) TO authenticated;
