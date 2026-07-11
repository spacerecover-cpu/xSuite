-- FU-4: atomic RPCs for the 3 remaining non-atomic stock write paths.
-- Applied live as version 20260710173356; companion drop of the dead June
-- record_stock_receipt(uuid,integer,jsonb) overload applied as 20260710173624.
-- Mirrors receive_stock_from_po (20260710104252): SECURITY DEFINER + explicit
-- tenant guard + FOR UPDATE row locks + server-side balance arithmetic on the
-- writable quantity_on_hand (current_quantity/quantity_available/minimum_quantity
-- are GENERATED) + performed_by stamping (the client versions never set it, and
-- swallowed every ledger-insert error — a qty bump could land with no
-- stock_transactions row).
--
-- Replaces client sequences in src/lib/stockService.ts:
--   recordStockReceipt   (read -> absolute-value write -> insert; lost-update race)
--   cancelStockSale      (read sale -> per-line read/update/insert; raced, and
--                         every write error swallowed — the RPC's
--                         deleted_at IS NULL ... FOR UPDATE gate also makes a
--                         second cancel fail loud instead of double-restocking)
--   bulkAdjustQuantities (per-row read -> update -> insert; raced)

CREATE OR REPLACE FUNCTION public.record_stock_receipt(
  p_item_id uuid,
  p_quantity integer,
  p_po_id uuid DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_serial_numbers jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_stock stock_items%ROWTYPE;
  v_unit_cost numeric; v_serial text;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'record_stock_receipt: no tenant context for caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'record_stock_receipt: quantity must be positive' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_stock FROM stock_items WHERE id = p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_stock_receipt: stock item % not found', p_item_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_stock.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'record_stock_receipt: stock item % belongs to another tenant', p_item_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Preserve NULL when no cost is known so COGS/valuation reports stay honest
  -- (same semantics as the replaced client code: explicit cost, else item cost).
  v_unit_cost := COALESCE(p_unit_cost, v_stock.cost_price);
  UPDATE stock_items
     SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + p_quantity, updated_at = now()
   WHERE id = p_item_id;
  INSERT INTO stock_transactions (tenant_id, item_id, transaction_type, quantity, reference_type, reference_id, unit_cost, total_cost, notes, performed_by)
  VALUES (v_tenant, p_item_id, 'received', p_quantity,
          CASE WHEN p_po_id IS NOT NULL THEN 'purchase_order' END, p_po_id,
          v_unit_cost, CASE WHEN v_unit_cost IS NOT NULL THEN v_unit_cost * p_quantity END,
          NULLIF(p_notes, ''), v_uid);
  IF p_serial_numbers IS NOT NULL AND jsonb_typeof(p_serial_numbers) = 'array' THEN
    FOR v_serial IN SELECT jsonb_array_elements_text(p_serial_numbers) LOOP
      IF NULLIF(v_serial, '') IS NOT NULL THEN
        INSERT INTO stock_serial_numbers (tenant_id, item_id, serial_number, status)
        VALUES (v_tenant, p_item_id, v_serial, 'in_stock');
      END IF;
    END LOOP;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_stock_sale(p_sale_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_sale stock_sales%ROWTYPE;
  v_line record; v_stock stock_items%ROWTYPE; v_restocked integer := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'cancel_stock_sale: no tenant context for caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();
  SELECT * INTO v_sale FROM stock_sales WHERE id = p_sale_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_stock_sale: sale % not found or already cancelled', p_sale_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_sale.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'cancel_stock_sale: sale % belongs to another tenant', p_sale_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_line IN
    SELECT item_id, quantity FROM stock_sale_items
    WHERE sale_id = p_sale_id AND deleted_at IS NULL
  LOOP
    -- Mirror the replaced client behavior: lines whose stock item is gone are
    -- skipped (sale still cancels); existing items are restocked atomically.
    SELECT * INTO v_stock FROM stock_items WHERE id = v_line.item_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_stock.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'cancel_stock_sale: stock item % belongs to another tenant', v_line.item_id USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE stock_items
       SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity, updated_at = now()
     WHERE id = v_line.item_id;
    INSERT INTO stock_transactions (tenant_id, item_id, transaction_type, quantity, reference_type, reference_id, notes, performed_by)
    VALUES (v_tenant, v_line.item_id, 'returned', v_line.quantity, 'sale', p_sale_id,
            'Returned from cancelled sale ' || COALESCE(v_sale.sale_number, p_sale_id::text), v_uid);
    v_restocked := v_restocked + 1;
  END LOOP;
  UPDATE stock_sales SET status = 'refunded', deleted_at = now(), updated_at = now() WHERE id = p_sale_id;
  RETURN v_restocked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_adjust_stock_quantities(p_adjustments jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_elem jsonb; v_item_id uuid; v_new integer;
  v_reason text; v_stock stock_items%ROWTYPE; v_variance integer; v_count integer := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'bulk_adjust_stock_quantities: no tenant context for caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();
  IF p_adjustments IS NULL OR jsonb_typeof(p_adjustments) <> 'array' THEN
    RAISE EXCEPTION 'bulk_adjust_stock_quantities: p_adjustments must be a JSON array' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements(p_adjustments) LOOP
    v_item_id := (v_elem->>'id')::uuid;
    v_new := (v_elem->>'new_quantity')::integer;
    v_reason := NULLIF(v_elem->>'reason', '');
    IF v_new IS NULL OR v_new < 0 THEN
      RAISE EXCEPTION 'bulk_adjust_stock_quantities: new_quantity must be >= 0 for item %', v_item_id USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_stock FROM stock_items WHERE id = v_item_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;  -- mirror client: missing items skipped
    IF v_stock.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'bulk_adjust_stock_quantities: stock item % belongs to another tenant', v_item_id USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_variance := v_new - COALESCE(v_stock.quantity_on_hand, 0);
    UPDATE stock_items SET quantity_on_hand = v_new, updated_at = now() WHERE id = v_item_id;
    IF v_variance <> 0 THEN
      INSERT INTO stock_transactions (tenant_id, item_id, transaction_type, quantity, notes, performed_by)
      VALUES (v_tenant, v_item_id, 'adjusted', v_variance, v_reason, v_uid);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_stock_receipt(uuid, integer, uuid, numeric, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_stock_sale(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_adjust_stock_quantities(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_receipt(uuid, integer, uuid, numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stock_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_adjust_stock_quantities(jsonb) TO authenticated;

-- ── 20260710173624 perf_fu4_drop_dead_record_stock_receipt_overload ──────────
-- stock_atomic_mutation_rpcs (20260609195921) shipped
-- record_stock_receipt(p_item_id uuid, p_quantity integer, p_options jsonb) but
-- the client never adopted it (audit F10). The explicit-signature version above
-- left TWO overloads, which PostgREST resolves only when the named-param set is
-- unambiguous (a p_item_id+p_quantity-only call would 300). The June overload
-- had zero callers ever.
DROP FUNCTION IF EXISTS public.record_stock_receipt(uuid, integer, jsonb);
