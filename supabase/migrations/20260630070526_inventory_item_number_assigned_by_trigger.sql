-- Inventory V2 fix: assign the per-device-type inventory number INSIDE the insert transaction
-- via a BEFORE INSERT trigger, instead of a separate client RPC call before the insert. The old
-- path (client calls get_next_inventory_number, then inserts) committed the sequence increment in
-- its own transaction, so any insert failure burned a number with no item (phantom counter).
-- With the trigger, a failed / rolled-back insert also rolls back the sequence increment.
CREATE OR REPLACE FUNCTION public.assign_inventory_item_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only auto-assign when the client didn't provide a number (bulk import may set one)
  -- and a device type is present (numbers are per device type).
  IF NEW.item_number IS NULL AND NEW.device_type_id IS NOT NULL THEN
    NEW.item_number := get_next_inventory_number(NEW.device_type_id);
    IF NEW.barcode IS NULL THEN NEW.barcode := NEW.item_number; END IF;
    IF NEW.qr_value IS NULL THEN NEW.qr_value := NEW.item_number; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_inventory_item_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_inventory_item_number ON public.inventory_items;
CREATE TRIGGER trg_assign_inventory_item_number
  BEFORE INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.assign_inventory_item_number();

-- One-time cleanup: inventory is empty, so any consumed inventory:* sequence value is a phantom
-- burned by the old allocate-before-insert path. Reclaim them so the first real item starts at 0001.
UPDATE public.number_sequences
SET current_value = 0, updated_at = now()
WHERE scope LIKE 'inventory:%'
  AND NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE deleted_at IS NULL);
