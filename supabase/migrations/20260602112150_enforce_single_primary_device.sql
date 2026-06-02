-- Backfill: collapse multiple primaries per case to exactly one (earliest created_at, id tie-break).
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY case_id ORDER BY created_at ASC, id ASC) AS rn
  FROM case_devices WHERE is_primary = true AND deleted_at IS NULL
)
UPDATE case_devices d SET is_primary = false, updated_at = now()
FROM ranked r WHERE d.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_devices_single_primary
  ON case_devices (case_id) WHERE is_primary = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.promote_device_to_primary(p_device_id uuid, p_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant_id uuid; v_old_primary uuid; v_belongs boolean;
BEGIN
  v_tenant_id := get_current_tenant_id();
  SELECT true INTO v_belongs FROM case_devices
   WHERE id = p_device_id AND case_id = p_case_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;
  IF v_belongs IS NOT TRUE THEN
    RAISE EXCEPTION 'Device % does not belong to case % in the current tenant', p_device_id, p_case_id USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_old_primary FROM case_devices
   WHERE case_id = p_case_id AND tenant_id = v_tenant_id AND is_primary = true AND deleted_at IS NULL AND id <> p_device_id LIMIT 1;
  UPDATE case_devices SET is_primary = false, updated_at = now()
   WHERE case_id = p_case_id AND tenant_id = v_tenant_id AND is_primary = true AND deleted_at IS NULL AND id <> p_device_id;
  UPDATE case_devices SET is_primary = true, updated_at = now()
   WHERE id = p_device_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;
  INSERT INTO case_job_history (tenant_id, case_id, action, details, old_value, new_value, performed_by)
  VALUES (v_tenant_id, p_case_id, 'device_primary_changed',
    json_build_object('promoted_device_id', p_device_id, 'demoted_device_id', v_old_primary)::text,
    v_old_primary::text, p_device_id::text, auth.uid());
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Could not set primary device due to a concurrent update; please retry' USING ERRCODE = '40001';
END; $$;

CREATE OR REPLACE FUNCTION public.get_primary_device_for_case(p_case_id uuid)
RETURNS SETOF case_devices LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM case_devices
  WHERE case_id = p_case_id AND tenant_id = get_current_tenant_id() AND is_primary = true AND deleted_at IS NULL LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.promote_device_to_primary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_primary_device_for_case(uuid) TO authenticated;
