-- Inventory V2 P9: donor matching. Extend search_donor_drives to filter on technical_details
-- (specs moved there in P1/P3) + device type, and rank exact PCB/firmware matches first (the
-- core donor-compatibility heuristic). Returns SETOF inventory_items (callers fetch donor parts
-- from inventory_donor_parts). Compatibility-matrix scoring is a future enhancement.
CREATE OR REPLACE FUNCTION public.search_donor_drives(p_criteria jsonb)
 RETURNS SETOF inventory_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT i.* FROM inventory_items i
  WHERE i.tenant_id = get_current_tenant_id()
    AND i.is_donor = true AND i.deleted_at IS NULL
    AND (p_criteria->>'device_type_id' IS NULL OR i.device_type_id = (p_criteria->>'device_type_id')::uuid)
    AND (p_criteria->>'brand_id' IS NULL OR i.brand_id = (p_criteria->>'brand_id')::uuid)
    AND (p_criteria->>'capacity_id' IS NULL OR i.capacity_id = (p_criteria->>'capacity_id')::uuid)
    AND (p_criteria->>'model' IS NULL OR i.model ILIKE '%' || (p_criteria->>'model') || '%')
    AND (p_criteria->>'serial_number' IS NULL OR i.serial_number ILIKE '%' || (p_criteria->>'serial_number') || '%')
    AND (p_criteria->>'pcb_number' IS NULL OR i.technical_details->>'pcb_number' ILIKE '%' || (p_criteria->>'pcb_number') || '%')
    AND (p_criteria->>'firmware' IS NULL OR i.technical_details->>'firmware_version' ILIKE '%' || (p_criteria->>'firmware') || '%')
    AND (p_criteria->>'dcm' IS NULL OR i.technical_details->>'dcm' ILIKE '%' || (p_criteria->>'dcm') || '%')
    AND (p_criteria->>'head_map' IS NULL OR i.technical_details->>'physical_head_map' ILIKE '%' || (p_criteria->>'head_map') || '%')
    AND (p_criteria->>'controller' IS NULL OR i.technical_details->>'controller' ILIKE '%' || (p_criteria->>'controller') || '%')
    AND (p_criteria->>'chipset' IS NULL OR i.technical_details->>'chipset' ILIKE '%' || (p_criteria->>'chipset') || '%')
  ORDER BY
    (CASE WHEN p_criteria->>'pcb_number' IS NOT NULL
            AND i.technical_details->>'pcb_number' = (p_criteria->>'pcb_number') THEN 0 ELSE 1 END),
    (CASE WHEN p_criteria->>'firmware' IS NOT NULL
            AND i.technical_details->>'firmware_version' = (p_criteria->>'firmware') THEN 0 ELSE 1 END),
    (CASE WHEN p_criteria->>'dcm' IS NOT NULL
            AND i.technical_details->>'dcm' = (p_criteria->>'dcm') THEN 0 ELSE 1 END),
    i.created_at DESC;
END;
$function$;
