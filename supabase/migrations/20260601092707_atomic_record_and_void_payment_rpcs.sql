-- Replay-safety (preview branches): _fin_currency_decimals is LANGUAGE sql, so
-- its body is validated at CREATE. On a fresh preview database bootstrapped
-- from the 2026-04-09 baseline, master_currency_codes.decimal_places does not
-- exist yet (added out-of-band 20260529194317, applied to prod via MCP), which
-- would abort the replay. Defer body validation; prod already has this
-- migration registered, so this header never runs there.
SET LOCAL check_function_bodies = off;

-- =====================================================================
-- Phase 1 — Atomic money RPCs for the data-recovery financial layer.
-- record_payment / void_payment run as single transactions, lock target
-- invoices FOR UPDATE, enforce money conservation, and post a balanced
-- (append-only) ledger. Replaces the non-atomic multi-write TS path in
-- src/lib/paymentsService.ts (createPayment/allocatePaymentToInvoices/voidPayment).
-- Applied via mcp__supabase__apply_migration (version 20260601092707).
-- =====================================================================

-- 1. Harden number generation against the concurrent lost-update race:
--    lock the sequence row so two callers cannot read the same value.
CREATE OR REPLACE FUNCTION public.get_next_number(p_scope text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_prefix text;
  v_padding integer;
  v_next_val bigint;
  v_reset boolean;
  v_current_year integer;
  v_last_year integer;
BEGIN
  v_tenant_id := get_current_tenant_id();
  v_current_year := EXTRACT(YEAR FROM now())::integer;

  -- FOR UPDATE serializes concurrent callers for this (tenant, scope) row.
  SELECT prefix, padding, reset_annually, current_value, last_reset_year
  INTO v_prefix, v_padding, v_reset, v_next_val, v_last_year
  FROM number_sequences
  WHERE tenant_id = v_tenant_id AND scope = p_scope
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO number_sequences (tenant_id, scope, prefix, current_value, padding)
    VALUES (v_tenant_id, p_scope, UPPER(LEFT(p_scope, 4)), 1, 4)
    RETURNING prefix, padding, current_value INTO v_prefix, v_padding, v_next_val;
  ELSE
    IF v_reset AND (v_last_year IS NULL OR v_last_year < v_current_year) THEN
      v_next_val := 1;
      UPDATE number_sequences SET current_value = 1, last_reset_year = v_current_year, updated_at = now()
      WHERE tenant_id = v_tenant_id AND scope = p_scope;
    ELSE
      v_next_val := v_next_val + 1;
      UPDATE number_sequences SET current_value = v_next_val, updated_at = now()
      WHERE tenant_id = v_tenant_id AND scope = p_scope;
    END IF;
  END IF;

  RETURN COALESCE(v_prefix, '') || '-' || LPAD(v_next_val::text, COALESCE(v_padding, 4), '0');
END;
$function$;


-- Internal helper: resolve the tenant base currency + its decimal places.
CREATE OR REPLACE FUNCTION public._fin_base_currency(p_tenant uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_code text;
BEGIN
  SELECT currency_code INTO v_code
  FROM tenant_currencies
  WHERE tenant_id = p_tenant AND is_base = true AND deleted_at IS NULL
  LIMIT 1;
  IF v_code IS NULL THEN
    SELECT base_currency_code INTO v_code FROM tenants WHERE id = p_tenant;
  END IF;
  RETURN COALESCE(v_code, 'USD');
END;
$function$;

CREATE OR REPLACE FUNCTION public._fin_currency_decimals(p_code text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT decimal_places FROM master_currency_codes WHERE code = p_code), 2);
$function$;


-- 2. record_payment: atomic record + allocate + balance recompute + ledger post.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_payment jsonb,
  p_allocations jsonb
)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_uid uuid;
  v_amount numeric;
  v_currency text;
  v_rate numeric;
  v_rate_source text;
  v_payment_date timestamptz;
  v_base_currency text;
  v_base_decimals integer;
  v_doc_decimals integer;
  v_payment payments%ROWTYPE;
  v_payment_number text;
  v_alloc jsonb;
  v_alloc_amount numeric;
  v_inv_id uuid;
  v_inv invoices%ROWTYPE;
  v_new_paid numeric;
  v_new_due numeric;
  v_new_status text;
  v_total_alloc numeric := 0;
  v_base_allocated numeric := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'record_payment: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  v_amount       := (p_payment->>'amount')::numeric;
  v_currency     := COALESCE(NULLIF(p_payment->>'currency',''), 'USD');
  v_rate         := COALESCE(NULLIF(p_payment->>'exchange_rate','')::numeric, 1);
  v_rate_source  := COALESCE(NULLIF(p_payment->>'rate_source',''), 'derived');
  v_payment_date := COALESCE(NULLIF(p_payment->>'payment_date','')::timestamptz, now());

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'record_payment: amount must be > 0 (got %)', v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array'
     OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'record_payment: at least one allocation is required; unapplied/advance payments are not yet supported (Phase 4)'
      USING ERRCODE = 'check_violation';
  END IF;

  v_base_currency := _fin_base_currency(v_tenant);
  v_base_decimals := _fin_currency_decimals(v_base_currency);
  v_doc_decimals  := _fin_currency_decimals(v_currency);

  v_payment_number := get_next_number('payment');

  INSERT INTO payments (
    tenant_id, payment_number, payment_date, amount, currency,
    exchange_rate, rate_source, amount_base,
    customer_id, payment_method_id, bank_account_id, reference, status, notes, created_by
  ) VALUES (
    v_tenant, v_payment_number, v_payment_date, v_amount, v_currency,
    v_rate, v_rate_source, round(v_amount * v_rate, v_base_decimals),
    NULLIF(p_payment->>'customer_id','')::uuid,
    NULLIF(p_payment->>'payment_method_id','')::uuid,
    NULLIF(p_payment->>'bank_account_id','')::uuid,
    NULLIF(p_payment->>'reference',''),
    COALESCE(NULLIF(p_payment->>'status',''), 'completed'),
    NULLIF(p_payment->>'notes',''),
    v_uid
  )
  RETURNING * INTO v_payment;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_amount := (v_alloc->>'amount')::numeric;
    v_inv_id       := (v_alloc->>'invoice_id')::uuid;

    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'record_payment: allocation amount must be > 0 (invoice %)', v_inv_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Lock the invoice so concurrent allocations cannot race the balance.
    SELECT * INTO v_inv FROM invoices
    WHERE id = v_inv_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_payment: invoice % not found', v_inv_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_inv.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'record_payment: invoice % belongs to another tenant', v_inv_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(v_inv.currency, v_base_currency) <> v_currency THEN
      RAISE EXCEPTION 'record_payment: payment currency % does not match invoice % currency % (mixed-currency allocation is a Phase 2 feature)',
        v_currency, v_inv_id, v_inv.currency
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_alloc_amount > round(COALESCE(v_inv.balance_due, 0), v_doc_decimals) THEN
      RAISE EXCEPTION 'record_payment: allocation % exceeds invoice % balance due %',
        v_alloc_amount, v_inv_id, v_inv.balance_due
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, amount, created_by)
    VALUES (v_tenant, v_payment.id, v_inv_id, v_alloc_amount, v_uid);

    v_new_paid := round(COALESCE(v_inv.amount_paid, 0) + v_alloc_amount, v_doc_decimals);
    v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid, v_doc_decimals);
    v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                         WHEN v_new_paid > 0 THEN 'partial'
                         ELSE 'sent' END;

    UPDATE invoices SET
      amount_paid      = v_new_paid,
      balance_due      = GREATEST(0, v_new_due),
      amount_paid_base = round(v_new_paid * v_rate, v_base_decimals),
      balance_due_base = round(GREATEST(0, v_new_due) * v_rate, v_base_decimals),
      status           = v_new_status,
      paid_at          = CASE WHEN v_new_due <= 0 THEN now() ELSE paid_at END
    WHERE id = v_inv_id;

    v_total_alloc   := v_total_alloc + v_alloc_amount;
    v_base_allocated := round(v_base_allocated + round(v_alloc_amount * v_rate, v_base_decimals), v_base_decimals);
  END LOOP;

  -- Money conservation: every unit of cash received must be allocated.
  IF round(v_total_alloc, v_doc_decimals) <> round(v_amount, v_doc_decimals) THEN
    RAISE EXCEPTION 'record_payment: allocations (%) must sum to payment amount (%)',
      v_total_alloc, v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- Single income posting (same-currency invariant => no realized FX in Phase 1).
  INSERT INTO financial_transactions (
    tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, exchange_rate, rate_source,
    amount_base, status, created_by
  ) VALUES (
    v_tenant, 'income', v_total_alloc, v_currency, v_payment_date,
    'Payment received ' || v_payment_number, 'payment', v_payment.id, v_rate, v_rate_source,
    v_base_allocated, 'posted', v_uid
  );

  RETURN v_payment;
END;
$function$;


-- 3. void_payment: atomic reversal. Posts a reversing (negative) income entry
--    instead of deleting the original — the ledger stays append-only.
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_uid uuid;
  v_payment payments%ROWTYPE;
  v_base_currency text;
  v_base_decimals integer;
  v_doc_decimals integer;
  v_alloc RECORD;
  v_inv invoices%ROWTYPE;
  v_new_paid numeric;
  v_new_due numeric;
  v_new_status text;
  v_reversed_total numeric := 0;
  v_reversed_base numeric := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'void_payment: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  SELECT * INTO v_payment FROM payments
  WHERE id = p_payment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_payment: payment % not found', p_payment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_payment.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'void_payment: payment % belongs to another tenant', p_payment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_payment.status = 'refunded' THEN
    RAISE EXCEPTION 'void_payment: payment % is already voided', p_payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_base_currency := _fin_base_currency(v_tenant);
  v_base_decimals := _fin_currency_decimals(v_base_currency);
  v_doc_decimals  := _fin_currency_decimals(COALESCE(v_payment.currency, v_base_currency));

  FOR v_alloc IN
    SELECT invoice_id, amount FROM payment_allocations
    WHERE payment_id = p_payment_id AND deleted_at IS NULL
  LOOP
    SELECT * INTO v_inv FROM invoices WHERE id = v_alloc.invoice_id FOR UPDATE;
    IF FOUND THEN
      v_new_paid := GREATEST(0, round(COALESCE(v_inv.amount_paid, 0) - v_alloc.amount, v_doc_decimals));
      v_new_due  := round(COALESCE(v_inv.total_amount, 0) - v_new_paid, v_doc_decimals);
      v_new_status := CASE WHEN v_new_due <= 0 THEN 'paid'
                           WHEN v_new_paid > 0 THEN 'partial'
                           ELSE 'sent' END;
      UPDATE invoices SET
        amount_paid      = v_new_paid,
        balance_due      = GREATEST(0, v_new_due),
        amount_paid_base = round(v_new_paid * COALESCE(v_inv.exchange_rate, 1), v_base_decimals),
        balance_due_base = round(GREATEST(0, v_new_due) * COALESCE(v_inv.exchange_rate, 1), v_base_decimals),
        status           = v_new_status,
        paid_at          = CASE WHEN v_new_due <= 0 THEN paid_at ELSE NULL END
      WHERE id = v_alloc.invoice_id;
    END IF;

    v_reversed_total := v_reversed_total + v_alloc.amount;
    v_reversed_base  := round(v_reversed_base + round(v_alloc.amount * COALESCE(v_payment.exchange_rate, 1), v_base_decimals), v_base_decimals);
  END LOOP;

  UPDATE payment_allocations SET deleted_at = now()
  WHERE payment_id = p_payment_id AND deleted_at IS NULL;

  -- Reversing ledger entry (append-only): negative income nets the original to zero.
  IF v_reversed_total <> 0 THEN
    INSERT INTO financial_transactions (
      tenant_id, transaction_type, amount, currency, transaction_date,
      description, reference_type, reference_id, exchange_rate, rate_source,
      amount_base, status, created_by
    ) VALUES (
      v_tenant, 'income', -v_reversed_total, COALESCE(v_payment.currency, v_base_currency), now(),
      'Reversal of voided payment ' || COALESCE(v_payment.payment_number, p_payment_id::text),
      'payment', p_payment_id, COALESCE(v_payment.exchange_rate, 1), 'derived',
      -v_reversed_base, 'posted', v_uid
    );
  END IF;

  UPDATE payments SET status = 'refunded' WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment(jsonb, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.void_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_payment(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_payment(uuid) TO authenticated;
