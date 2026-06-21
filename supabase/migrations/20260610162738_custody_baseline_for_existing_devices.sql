-- Custody baseline (platform review 2026-06-10, item 4).
-- Devices that entered the lab before the custody ledger had write paths get a
-- single clearly-labelled retroactive baseline event. History is NOT
-- fabricated: the entry states explicitly that tracking begins here. New
-- devices get a real DEVICE_RECEIVED event from trg_log_device_received_custody.

-- The set_*_tenant_and_audit trigger guards tenant on INSERT; this runs without
-- an auth context, so the documented bypass is set for this session only.
SELECT set_config('app.bypass_tenant_guard', 'true', false);

INSERT INTO public.chain_of_custody
  (tenant_id, case_id, device_id, action_category, action, description,
   actor_id, actor_name, actor_role, custody_status, metadata)
SELECT d.tenant_id, d.case_id, d.id,
       'critical_event', 'CUSTODY_BASELINE_ESTABLISHED',
       'Custody baseline established retroactively at custody-ledger rollout. '
         || 'The device was already in lab custody; custody event tracking for this device begins at this entry.',
       NULL, 'System', NULL, 'in_custody',
       jsonb_strip_nulls(jsonb_build_object(
         'serial_number', d.serial_number,
         'model', d.model,
         'retroactive', true,
         'source', 'backfill_2026-06-10'
       ))
FROM public.case_devices d
WHERE d.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chain_of_custody cc WHERE cc.device_id = d.id);

SELECT set_config('app.bypass_tenant_guard', 'false', false);
