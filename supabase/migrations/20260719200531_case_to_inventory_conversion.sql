-- ============================================================================
-- Case → Inventory conversion
-- Adds provenance columns to inventory_items and a SECURITY DEFINER RPC that
-- converts a single (abandoned) case device into a donor/inventory item,
-- preserving device-level chain-of-custody and case history.
-- inventory_items is an existing tenant-scoped table (RLS/isolation/audit
-- trigger/tenant index already present) — this migration is additive.
-- ============================================================================

-- 1. Provenance columns -------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS source_case_id        uuid REFERENCES public.cases(id),
  ADD COLUMN IF NOT EXISTS source_case_device_id uuid REFERENCES public.case_devices(id),
  ADD COLUMN IF NOT EXISTS inventory_source      text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS converted_by          uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS converted_at          timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_inventory_source_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_inventory_source_check
      CHECK (inventory_source IN ('manual','case_conversion'));
  END IF;
END $$;

COMMENT ON COLUMN public.inventory_items.source_case_id IS
  'When inventory_source=case_conversion: the case this item was harvested from.';
COMMENT ON COLUMN public.inventory_items.source_case_device_id IS
  'When inventory_source=case_conversion: the specific case_devices row this item came from (device-level provenance).';
COMMENT ON COLUMN public.inventory_items.inventory_source IS
  'How the item entered inventory: manual (hand-entered) or case_conversion (converted from a completed case device).';
COMMENT ON COLUMN public.inventory_items.converted_by IS
  'Actor who performed the case→inventory conversion (NULL for manual items).';
COMMENT ON COLUMN public.inventory_items.converted_at IS
  'When the case→inventory conversion happened (NULL for manual items).';

CREATE INDEX IF NOT EXISTS idx_inventory_items_source_case_id
  ON public.inventory_items(source_case_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_source_case_device_id
  ON public.inventory_items(source_case_device_id) WHERE deleted_at IS NULL;

-- 2. Conversion RPC -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_case_device_to_inventory(
  p_case_id         uuid,
  p_case_device_id  uuid,
  p_condition_id    uuid    DEFAULT NULL,
  p_status_id       uuid    DEFAULT NULL,
  p_location_id     uuid    DEFAULT NULL,
  p_is_donor        boolean DEFAULT true,
  p_notes           text    DEFAULT NULL,
  p_name            text    DEFAULT NULL,
  p_legal_basis     text    DEFAULT NULL,
  p_allow_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant         uuid;
  v_actor          uuid;
  v_case           record;
  v_dev            record;
  v_phase          text;
  v_existing       record;
  v_name           text;
  v_brand_name     text;
  v_capacity_name  text;
  v_devtype_name   text;
  v_ff_name        text;
  v_hc_name        text;
  v_case_cond_name text;
  v_status_id      uuid;
  v_tech           jsonb;
  v_notes          text;
  v_item_id        uuid;
  v_item_number    text;
BEGIN
  v_tenant := get_current_tenant_id();
  v_actor  := auth.uid();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context for conversion' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Case (tenant-scoped)
  SELECT c.id, c.case_no, c.case_number, c.customer_id, c.status_id, c.tenant_id
    INTO v_case
    FROM public.cases c
   WHERE c.id = p_case_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_case.tenant_id IS DISTINCT FROM v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Case belongs to another tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Device (must belong to the case)
  SELECT * INTO v_dev
    FROM public.case_devices d
   WHERE d.id = p_case_device_id AND d.case_id = p_case_id AND d.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found on this case' USING ERRCODE = 'no_data_found';
  END IF;

  -- device_type_id is required so the numbering trigger can allocate an item_number
  IF v_dev.device_type_id IS NULL THEN
    RAISE EXCEPTION 'Set a device type on this device before converting it to inventory'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'device_type_required';
  END IF;

  -- Eligibility: the case must be in a terminal/near-terminal phase
  SELECT type INTO v_phase FROM public.master_case_statuses WHERE id = v_case.status_id;
  IF COALESCE(v_phase, '') NOT IN ('delivered','closed','no_solution','cancelled','completed') THEN
    RAISE EXCEPTION 'The case must be delivered, closed, cancelled or marked no-solution before a device can be converted to inventory (current phase: %)',
      COALESCE(v_phase, 'unknown')
      USING ERRCODE = 'invalid_parameter_value', HINT = 'case_not_terminal';
  END IF;

  -- Duplicate guard: one active inventory item per case device unless overridden
  SELECT id, item_number INTO v_existing
    FROM public.inventory_items
   WHERE source_case_device_id = p_case_device_id AND deleted_at IS NULL
   ORDER BY created_at
   LIMIT 1;
  IF v_existing.id IS NOT NULL AND NOT p_allow_duplicate THEN
    RAISE EXCEPTION 'This device has already been converted to inventory (item %)',
      COALESCE(v_existing.item_number, v_existing.id::text)
      USING ERRCODE = 'unique_violation', HINT = 'already_converted';
  END IF;

  -- Catalog display names (for the synthesized item name + provenance breadcrumbs)
  SELECT name INTO v_brand_name    FROM public.catalog_device_brands       WHERE id = v_dev.brand_id;
  SELECT name INTO v_capacity_name FROM public.catalog_device_capacities   WHERE id = v_dev.capacity_id;
  SELECT name INTO v_devtype_name  FROM public.catalog_device_types        WHERE id = v_dev.device_type_id;
  SELECT name INTO v_ff_name       FROM public.catalog_device_form_factors WHERE id = v_dev.form_factor_id;
  SELECT name INTO v_hc_name       FROM public.catalog_device_head_counts  WHERE id = v_dev.head_count_id;
  SELECT name INTO v_case_cond_name FROM public.catalog_device_conditions  WHERE id = v_dev.condition_id;

  -- inventory_items.name is NOT NULL and case_devices has no name → synthesize one
  v_name := NULLIF(TRIM(p_name), '');
  IF v_name IS NULL THEN
    v_name := NULLIF(TRIM(CONCAT_WS(' ', v_brand_name, v_dev.model, v_capacity_name)), '');
  END IF;
  IF v_name IS NULL THEN
    v_name := NULLIF(TRIM(CONCAT_WS(' ', v_devtype_name, v_dev.serial_number)), '');
  END IF;
  IF v_name IS NULL THEN
    v_name := 'Donor device — ' || COALESCE(v_case.case_number, v_case.case_no, p_case_id::text);
  END IF;

  -- Default inventory status → "Available" when not supplied
  v_status_id := p_status_id;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM public.master_inventory_status_types
     WHERE lower(name) = 'available'
     ORDER BY sort_order NULLS LAST
     LIMIT 1;
  END IF;

  -- form_factor / head_count have no inventory columns → keep in technical_details,
  -- alongside provenance breadcrumbs (does not overwrite existing device specs).
  v_tech := COALESCE(v_dev.technical_details, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
         'form_factor',        v_ff_name,
         'head_count',         v_hc_name,
         'source_case_number', COALESCE(v_case.case_number, v_case.case_no),
         'original_condition', v_case_cond_name
       ));

  -- Human-readable provenance note (kept next to the structured columns)
  v_notes := NULLIF(CONCAT_WS(E'\n',
    NULLIF(TRIM(p_notes), ''),
    'Converted from case ' || COALESCE(v_case.case_number, v_case.case_no, p_case_id::text)
      || CASE WHEN v_dev.serial_number IS NOT NULL THEN ' (S/N ' || v_dev.serial_number || ')' ELSE '' END || '.',
    CASE WHEN v_case_cond_name IS NOT NULL THEN 'Condition at case: ' || v_case_cond_name || '.' ELSE NULL END,
    CASE WHEN NULLIF(TRIM(p_legal_basis), '') IS NOT NULL THEN 'Legal basis: ' || TRIM(p_legal_basis) || '.' ELSE NULL END
  ), '');

  -- Create the inventory item. item_number/barcode/qr_value assigned by
  -- trg_assign_inventory_item_number; tenant_id/timestamps by set_tenant_and_audit;
  -- created_by/converted_by set explicitly (the audit trigger does not stamp actor).
  INSERT INTO public.inventory_items (
    tenant_id, name, device_type_id, brand_id, model, serial_number,
    capacity_id, interface_id, condition_id, status_id, location_id,
    firmware_version, pcb_number, photos, technical_details, notes,
    is_donor, quantity,
    source_case_id, source_case_device_id, inventory_source, converted_by, converted_at,
    created_by, updated_by
  ) VALUES (
    v_tenant, v_name, v_dev.device_type_id, v_dev.brand_id, v_dev.model, v_dev.serial_number,
    v_dev.capacity_id, v_dev.interface_id, p_condition_id, v_status_id, p_location_id,
    v_dev.firmware_version, v_dev.pcb_number, v_dev.photos, v_tech, v_notes,
    COALESCE(p_is_donor, true), 1,
    p_case_id, p_case_device_id, 'case_conversion', v_actor, now(),
    v_actor, v_actor
  )
  RETURNING id, item_number INTO v_item_id, v_item_number;

  -- Chain of custody: the customer's device is retained by the lab as an asset.
  PERFORM log_chain_of_custody(
    p_case_id         => p_case_id,
    p_device_id       => p_case_device_id,
    p_action_category => 'critical_event',
    p_action          => 'DEVICE_CONVERTED_TO_INVENTORY',
    p_description      => 'Device retained by lab and converted to inventory item '
                          || COALESCE(v_item_number, v_item_id::text),
    p_location        => NULL,
    p_custody_status  => 'archived',
    p_metadata        => jsonb_strip_nulls(jsonb_build_object(
      'inventory_item_id',     v_item_id,
      'item_number',           v_item_number,
      'is_donor',              COALESCE(p_is_donor, true),
      'source_case_device_id', p_case_device_id,
      'legal_basis',           NULLIF(TRIM(p_legal_basis), '')
    ))
  );

  -- Case timeline entry
  PERFORM log_case_history(
    p_case_id   => p_case_id,
    p_action    => 'device_converted_to_inventory',
    p_details   => jsonb_build_object(
                     'inventory_item_id',     v_item_id,
                     'item_number',           v_item_number,
                     'source_case_device_id', p_case_device_id
                   )::text,
    p_new_value => v_item_number
  );

  RETURN jsonb_build_object(
    'inventory_item_id',     v_item_id,
    'item_number',           v_item_number,
    'source_case_id',        p_case_id,
    'source_case_device_id', p_case_device_id,
    'reconverted',           (v_existing.id IS NOT NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_case_device_to_inventory(uuid,uuid,uuid,uuid,uuid,boolean,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_case_device_to_inventory(uuid,uuid,uuid,uuid,uuid,boolean,text,text,text,boolean) TO authenticated;

COMMENT ON FUNCTION public.convert_case_device_to_inventory(uuid,uuid,uuid,uuid,uuid,boolean,text,text,text,boolean) IS
  'Converts one abandoned case device into an inventory_items row (donor stock). Copies safe device attributes, auto-numbers via the item-number trigger, stamps provenance (source_case_id/source_case_device_id/inventory_source/converted_by/converted_at), and writes chain_of_custody + case_job_history. Gated to terminal cases; one active item per device unless p_allow_duplicate.';
