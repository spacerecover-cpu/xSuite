-- Any row returned = a financial base-integrity violation. CI/manual twin of the
-- hourly assert_financial_base_integrity() pg_cron monitor (localization Phase 0).
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/financial/check-financial-base-integrity.sql
SELECT 'invoices' AS tbl, id, created_at FROM public.invoices
 WHERE deleted_at IS NULL AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'quotes', id, created_at FROM public.quotes
 WHERE deleted_at IS NULL AND (total_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'payments', id, created_at FROM public.payments
 WHERE deleted_at IS NULL AND (amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
UNION ALL
SELECT 'receipts', id, created_at FROM public.receipts
 WHERE deleted_at IS NULL AND (amount_base IS NULL OR exchange_rate IS NULL)
UNION ALL
SELECT 'vat_records', id, created_at FROM public.vat_records
 WHERE deleted_at IS NULL AND (vat_amount_base IS NULL OR exchange_rate IS NULL OR currency IS NULL)
ORDER BY 1, 3 DESC;
