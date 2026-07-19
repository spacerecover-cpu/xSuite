-- Snapshot the originating customer's name onto the converted inventory item so
-- the inventory record shows the "original customer" as a read-only internal
-- reference (the item is a lab asset; this is provenance only). Same function
-- signature as before — no generated-type change.
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
  v_customer_name  text;
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

  SELECT * INTO v_dev
    FROM public.case_devices d
   WHERE d.id = p_case_device_id AND d.case_id = p_case_id AND d.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found on this case' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_dev.device_type_id IS NULL THEN
    RAISE EXCEPTION 'Set a device type on this device before converting it to inventory'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'device_type_required';
  END IF;

  SELECT type INTO v_phase FROM public.master_case_statuses WHERE id = v_case.status_id;
  IF COALESCE(v_phase, '') NOT IN ('delivered','closed','no_solution','cancelled','completed') THEN
    RAISE EXCEPTION 'The case must be delivered, closed, cancelled or marked no-solution before a device can be converted to inventory (current phase: %)',
      COALESCE(v_phase, 'unknown')
      USING ERRCODE = 'invalid_parameter_value', HINT = 'case_not_terminal';
  END IF;

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

  SELECT name INTO v_brand_name    FROM public.catalog_device_brands       WHERE id = v_dev.brand_id;
  SELECT name INTO v_capacity_name FROM public.catalog_device_capacities   WHERE id = v_dev.capacity_id;
  SELECT name INTO v_devtype_name  FROM public.catalog_device_types        WHERE id = v_dev.device_type_id;
  SELECT name INTO v_ff_name       FROM public.catalog_device_form_factors WHERE id = v_dev.form_factor_id;
  SELECT name INTO v_hc_name       FROM public.catalog_device_head_counts  WHERE id = v_dev.head_count_id;
  SELECT name INTO v_case_cond_name FROM public.catalog_device_conditions  WHERE id = v_dev.condition_id;
  SELECT customer_name INTO v_customer_name FROM public.customers_enhanced WHERE id = v_case.customer_id;

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

  v_status_id := p_status_id;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM public.master_inventory_status_types
     WHERE lower(name) = 'available'
     ORDER BY sort_order NULLS LAST
     LIMIT 1;
  END IF;

  v_tech := COALESCE(v_dev.technical_details, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
         'form_factor',         v_ff_name,
         'head_count',          v_hc_name,
         'source_case_number',  COALESCE(v_case.case_number, v_case.case_no),
         'source_customer_name', v_customer_name,
         'original_condition',  v_case_cond_name
       ));

  v_notes := NULLIF(CONCAT_WS(E'\n',
    NULLIF(TRIM(p_notes), ''),
    'Converted from case ' || COALESCE(v_case.case_number, v_case.case_no, p_case_id::text)
      || CASE WHEN v_dev.serial_number IS NOT NULL THEN ' (S/N ' || v_dev.serial_number || ')' ELSE '' END || '.',
    CASE WHEN v_case_cond_name IS NOT NULL THEN 'Condition at case: ' || v_case_cond_name || '.' ELSE NULL END,
    CASE WHEN NULLIF(TRIM(p_legal_basis), '') IS NOT NULL THEN 'Legal basis: ' || TRIM(p_legal_basis) || '.' ELSE NULL END
  ), '');

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
