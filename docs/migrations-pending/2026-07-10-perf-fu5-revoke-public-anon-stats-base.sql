-- Perf FU-5 (grant consistency; audit follow-up). The three pre-P2c base-stats
-- RPCs kept the default PUBLIC EXECUTE grant plus an explicit anon grant; the
-- two P2c fns (get_payment_stats_base, get_transaction_stats_base) already
-- revoke both. All five are SECURITY INVOKER so RLS scopes rows regardless —
-- this aligns the surface with the house rule (authenticated-only EXECUTE).
REVOKE EXECUTE ON FUNCTION public.get_quote_stats_base() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invoice_stats_base(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_expense_stats_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quote_stats_base() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_stats_base(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_stats_base() TO authenticated;
