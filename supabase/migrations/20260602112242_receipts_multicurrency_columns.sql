ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'derived';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS amount_base numeric(12,3);
UPDATE public.receipts SET amount_base = ROUND(amount * COALESCE(exchange_rate, 1), 3) WHERE amount_base IS NULL;
