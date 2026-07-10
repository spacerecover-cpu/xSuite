-- P2b: receive_stock_from_po — atomic PO receiving in one transaction.
-- Applied live as version 20260710104252. Fixes audit F10: the client loop
-- (receiveStockFromPO -> recordStockReceipt) wrote the GENERATED current_quantity
-- column (400 on first item) and was non-atomic. SECURITY DEFINER + explicit
-- tenant guard + FOR UPDATE, mirroring record_stock_usage_for_case /
-- post_stock_adjustment. Writes the writable quantity_on_hand.
CREATE OR REPLACE FUNCTION public.receive_stock_from_po(p_purchase_order_id uuid, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_elem jsonb; v_item_id uuid; v_po_item_id uuid;
  v_qty integer; v_unit_cost numeric; v_serials jsonb; v_serial text;
  v_stock stock_items%ROWTYPE; v_received integer := 0;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'receive_stock_from_po: no tenant context for caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_uid := auth.uid();
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'receive_stock_from_po: p_items must be a JSON array' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    v_item_id := (v_elem->>'stock_item_id')::uuid;
    v_po_item_id := NULLIF(v_elem->>'po_item_id', '')::uuid;
    v_serials := v_elem->'serial_numbers';
    SELECT * INTO v_stock FROM stock_items WHERE id = v_item_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'receive_stock_from_po: stock item % not found', v_item_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_stock.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'receive_stock_from_po: stock item % belongs to another tenant', v_item_id USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_unit_cost := COALESCE(NULLIF(v_elem->>'unit_cost', '')::numeric, v_stock.cost_price);
    UPDATE stock_items SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_qty, updated_at = now() WHERE id = v_item_id;
    INSERT INTO stock_transactions (tenant_id, item_id, transaction_type, quantity, reference_type, reference_id, unit_cost, total_cost, notes, performed_by)
    VALUES (v_tenant, v_item_id, 'received', v_qty, 'purchase_order', p_purchase_order_id, v_unit_cost,
            CASE WHEN v_unit_cost IS NOT NULL THEN v_unit_cost * v_qty ELSE NULL END, NULLIF(v_elem->>'notes', ''), v_uid);
    IF v_serials IS NOT NULL AND jsonb_typeof(v_serials) = 'array' THEN
      FOR v_serial IN SELECT jsonb_array_elements_text(v_serials) LOOP
        IF NULLIF(v_serial, '') IS NOT NULL THEN
          INSERT INTO stock_serial_numbers (tenant_id, item_id, serial_number, status) VALUES (v_tenant, v_item_id, v_serial, 'in_stock');
        END IF;
      END LOOP;
    END IF;
    IF v_po_item_id IS NOT NULL THEN
      UPDATE purchase_order_items SET stock_item_id = v_item_id, received_quantity = v_qty WHERE id = v_po_item_id AND tenant_id = v_tenant;
    END IF;
    v_received := v_received + 1;
  END LOOP;
  RETURN v_received;
END;
$function$;
REVOKE ALL ON FUNCTION public.receive_stock_from_po(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_from_po(uuid, jsonb) TO authenticated;
