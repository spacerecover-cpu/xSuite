-- =====================================================================================
-- Phase 2 / Migration #5 — phase2_record_stock_sale_tax
-- stock_sales tax columns + record_stock_sale v2 (POS tax threading → document_tax_lines + vat_records)
-- Composed by anchored insertion into the LIVE Phase-1 body (captured 2026-07-04). See scout.md
-- for reconciliation (item alias v_item, sale row v_sale, existing tax_amount col) + safety proof.
-- =====================================================================================

-- Header tax columns (tax_amount already exists → IF NOT EXISTS no-ops it).
ALTER TABLE public.stock_sales
  ADD COLUMN IF NOT EXISTS tax_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_regime_key text;

-- tax_amount pre-exists as nullable numeric(19,4) (the ADD COLUMN IF NOT EXISTS no-ops it),
-- so realize the intended NOT NULL explicitly. Table is empty (0 rows) and the RPC always
-- writes a non-null v_tax_total, so this is safe.
ALTER TABLE public.stock_sales ALTER COLUMN tax_amount SET NOT NULL;

-- Signature change 2-arg → 3-arg-with-default: DROP the 2-arg so all callers bind the 3-arg.
DROP FUNCTION IF EXISTS public.record_stock_sale(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.record_stock_sale(p_sale jsonb, p_items jsonb, p_tax_lines jsonb DEFAULT NULL)
 RETURNS stock_sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_uid uuid;
  v_sale stock_sales%ROWTYPE;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_unit_cost numeric;
  v_serial text;
  v_stock stock_items%ROWTYPE;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric;
  -- Add A — Phase 2 tax locals
  v_tax_total numeric := 0;
  v_tax_inclusive boolean := COALESCE((p_sale ->> 'tax_inclusive')::boolean, false);
  v_tax_point date;
  v_tz text;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'record_stock_sale: no tenant context for caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'record_stock_sale: at least one line item is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Server-side totals (never trust client subtotal/total).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty        := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'record_stock_sale: line quantity must be > 0'
        USING ERRCODE = 'check_violation';
    END IF;
    v_subtotal := v_subtotal + (v_qty * COALESCE(v_unit_price, 0));
  END LOOP;

  IF NULLIF(p_sale->>'discount_type','') = 'percentage'
     AND NULLIF(p_sale->>'discount_value','') IS NOT NULL THEN
    v_discount_amount := round(v_subtotal * (p_sale->>'discount_value')::numeric / 100, 2);
  ELSIF NULLIF(p_sale->>'discount_type','') = 'fixed'
     AND NULLIF(p_sale->>'discount_value','') IS NOT NULL THEN
    v_discount_amount := (p_sale->>'discount_value')::numeric;
  END IF;

  -- Add B — tax total from document-level rollups (line_item_id IS NULL) of p_tax_lines.
  SELECT COALESCE(sum((tl ->> 'tax_amount')::numeric), 0)
    INTO v_tax_total
  FROM jsonb_array_elements(COALESCE(p_tax_lines, '[]'::jsonb)) tl
  WHERE (tl ->> 'line_item_id') IS NULL;

  -- Exclusive tax adds to the total; inclusive tax is already inside subtotal.
  v_total := v_subtotal - v_discount_amount
             + CASE WHEN v_tax_inclusive THEN 0 ELSE v_tax_total END;

  INSERT INTO stock_sales (
    tenant_id, sale_number, customer_id, case_id, notes,
    subtotal, tax_amount, tax_inclusive, tax_regime_key, discount_amount, total_amount, status, created_by
  ) VALUES (
    v_tenant,
    get_next_number('stock_sale'),
    NULLIF(p_sale->>'customer_id','')::uuid,
    NULLIF(p_sale->>'case_id','')::uuid,
    NULLIF(p_sale->>'notes',''),
    v_subtotal, v_tax_total, v_tax_inclusive, NULLIF(p_sale->>'tax_regime_key',''), v_discount_amount, v_total,
    CASE WHEN NULLIF(p_sale->>'payment_method','') = 'added_to_invoice'
         THEN 'pending' ELSE 'paid' END,
    v_uid
  )
  RETURNING * INTO v_sale;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id    := (v_item->>'stock_item_id')::uuid;
    v_qty        := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_qty * COALESCE(v_unit_price, 0);
    v_serial     := NULLIF(v_item->>'serial_number','');

    -- Lock the stock row so concurrent sales cannot race the balance.
    SELECT * INTO v_stock FROM stock_items
    WHERE id = v_item_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_stock_sale: stock item % not found', v_item_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_stock.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'record_stock_sale: stock item % belongs to another tenant', v_item_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Oversell guard: cannot drive on-hand below zero.
    IF COALESCE(v_stock.quantity_on_hand, 0) < v_qty THEN
      RAISE EXCEPTION 'record_stock_sale: insufficient stock for item % (on hand %, requested %)',
        v_item_id, COALESCE(v_stock.quantity_on_hand, 0), v_qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Add C — item extras (unit/item code + treatment) alongside the Phase-1 columns.
    INSERT INTO stock_sale_items (
      tenant_id, sale_id, item_id, quantity, unit_price, discount, tax_amount, total,
      unit_code, unit_label, item_code, tax_treatment, treatment_reason_code
    ) VALUES (
      v_tenant, v_sale.id, v_item_id, v_qty, v_unit_price, 0, 0, v_line_total,
      NULLIF(v_item->>'unit_code',''), NULLIF(v_item->>'unit_label',''), NULLIF(v_item->>'item_code',''),
      COALESCE(NULLIF(v_item->>'tax_treatment',''), 'standard'), NULLIF(v_item->>'treatment_reason_code','')
    );

    -- Write the writable balance column; current_quantity / quantity_available
    -- are GENERATED and recompute automatically.
    UPDATE stock_items
       SET quantity_on_hand = quantity_on_hand - v_qty,
           updated_at = now()
     WHERE id = v_item_id;

    -- Preserve NULL cost when unknown so COGS/valuation stays honest.
    v_unit_cost := COALESCE(
      NULLIF(v_item->>'cost_price','')::numeric,
      v_stock.cost_price
    );

    INSERT INTO stock_transactions (
      tenant_id, item_id, transaction_type, quantity,
      unit_cost, total_cost, reference_type, reference_id, performed_by
    ) VALUES (
      v_tenant, v_item_id, 'sold', -v_qty,
      v_unit_cost,
      CASE WHEN v_unit_cost IS NOT NULL THEN v_unit_cost * v_qty ELSE NULL END,
      'sale', v_sale.id, v_uid
    );

    IF v_serial IS NOT NULL THEN
      UPDATE stock_serial_numbers
         SET status = 'sold'
       WHERE tenant_id = v_tenant
         AND item_id = v_item_id
         AND serial_number = v_serial;
    END IF;
  END LOOP;

  -- ── Add D — Phase 2 POS tax evidence (parity with invoice issuance) ────────
  -- Sole writer: stock_sales has no vat-posting trigger. document_type='stock_sale'
  -- is CHECK-allowed; the tax-lines immutability trigger only guards issued invoices.
  IF p_tax_lines IS NOT NULL AND jsonb_array_length(p_tax_lines) > 0 THEN
    -- 1) Component snapshot rows (all lines + rollups), parity with invoices.
    INSERT INTO public.document_tax_lines
      (tenant_id, document_type, document_id, line_item_id, component_code, component_label,
       jurisdiction_ref, rate, taxable_base, tax_amount, currency, exchange_rate,
       tax_amount_base, tax_treatment, treatment_reason_code, regime_key, plugin_version,
       pack_version_id, rule_trace, sequence)
    SELECT v_sale.tenant_id, 'stock_sale', v_sale.id,
           NULLIF(tl ->> 'line_item_id', '')::uuid,
           tl ->> 'component_code', tl ->> 'component_label',
           NULLIF(tl ->> 'jurisdiction_ref', '')::uuid,
           (tl ->> 'rate')::numeric, (tl ->> 'taxable_base')::numeric,
           (tl ->> 'tax_amount')::numeric, tl ->> 'currency',
           COALESCE((tl ->> 'exchange_rate')::numeric, 1),
           COALESCE((tl ->> 'tax_amount_base')::numeric, (tl ->> 'tax_amount')::numeric),
           tl ->> 'tax_treatment', NULLIF(tl ->> 'treatment_reason_code', ''),
           tl ->> 'regime_key', tl ->> 'plugin_version',
           NULLIF(tl ->> 'pack_version_id', '')::uuid, tl -> 'rule_trace',
           COALESCE((tl ->> 'sequence')::int, 0)
    FROM jsonb_array_elements(p_tax_lines) tl;

    -- 2) Output-tax ledger rows (rollups only, non-zero), tenant-local tax period.
    SELECT t.timezone INTO v_tz FROM tenants t WHERE t.id = v_sale.tenant_id;
    v_tax_point := (now() AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;

    INSERT INTO public.vat_records
      (tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
       currency, exchange_rate, vat_amount_base, taxable_amount_base,
       component_code, jurisdiction_ref, tax_treatment, regime_key,
       tax_point_date, source_document_type, source_document_id)
    SELECT v_sale.tenant_id, 'sale', v_sale.id,
           (tl ->> 'tax_amount')::numeric, (tl ->> 'rate')::numeric,
           to_char(v_tax_point, 'YYYY-MM'),
           tl ->> 'currency', COALESCE((tl ->> 'exchange_rate')::numeric, 1),
           COALESCE((tl ->> 'tax_amount_base')::numeric, (tl ->> 'tax_amount')::numeric),
           -- base-convert the taxable amount (parity with issue_tax_document §e); ×1 for
           -- base-currency POS, correct for any future FX stock sale.
           COALESCE((tl ->> 'taxable_base')::numeric, 0) * COALESCE((tl ->> 'exchange_rate')::numeric, 1),
           tl ->> 'component_code', NULLIF(tl ->> 'jurisdiction_ref', '')::uuid,
           tl ->> 'tax_treatment', tl ->> 'regime_key',
           v_tax_point, 'stock_sale', v_sale.id
    FROM jsonb_array_elements(p_tax_lines) tl
    WHERE (tl ->> 'line_item_id') IS NULL AND (tl ->> 'tax_amount')::numeric <> 0;
  END IF;

  RETURN v_sale;
END;
$function$;

-- Re-emit the hardened grant posture (DROP+CREATE reset it to default PUBLIC EXECUTE).
REVOKE ALL ON FUNCTION public.record_stock_sale(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_stock_sale(jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_stock_sale(jsonb, jsonb, jsonb) TO authenticated, service_role;
