-- Migration: add_case_devices_technical_fields
-- Applied via mcp__supabase__apply_migration (live version 20260625215132).
-- Classification: Additive (DDL). Additive nullable/defaulted columns — existing rows untouched,
-- RLS/triggers unaffected (new columns inherit existing case_devices policies). Zero data-migration risk
-- (all four targets verified empty before apply). Supports the config-driven dynamic device-details form.
--
-- Rollback (if ever needed; soft-deprecate per repo rules rather than DROP in production):
--   ALTER TABLE case_devices
--     DROP COLUMN IF EXISTS technical_details,
--     DROP COLUMN IF EXISTS dcm,
--     DROP COLUMN IF EXISTS part_number,
--     DROP COLUMN IF EXISTS dom;

ALTER TABLE case_devices
  ADD COLUMN IF NOT EXISTS dom date,
  ADD COLUMN IF NOT EXISTS part_number text,
  ADD COLUMN IF NOT EXISTS dcm text,
  ADD COLUMN IF NOT EXISTS technical_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN case_devices.dom IS 'Date of manufacture (device spec sheet).';
COMMENT ON COLUMN case_devices.part_number IS 'Manufacturer part number / P/N (donor-matching key).';
COMMENT ON COLUMN case_devices.dcm IS 'Drive Configuration Module / DCM code (donor-matching key).';
COMMENT ON COLUMN case_devices.technical_details IS 'Dynamic per-device-type technical fields (config-driven device form, 2026-06-26).';
