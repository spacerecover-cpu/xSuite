-- Devices migrated from an older ERP have no xSuite `cases` row to link, so
-- inventory_items.source_case_id (an FK to the NEW cases table) cannot hold their
-- original case reference. Add an optional free-text legacy reference for tracking
-- and future lookup. Deliberately NOT an FK (the referenced case does not exist in
-- xSuite) and no CHECK (legacy refs are arbitrary). inventory_items is already
-- tenant-scoped with RLS enabled/forced + standard policies, so this additive
-- nullable column needs no new policy/trigger.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS legacy_case_ref text;

COMMENT ON COLUMN public.inventory_items.legacy_case_ref IS
  'Optional free-text reference to the original case in a legacy/old ERP system for devices that predate xSuite. Not an FK (no matching cases row); used for tracking and lookup.';

-- Partial index to keep "find by legacy case ref" lookups cheap without bloating
-- the index with the common NULL / soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_inventory_items_legacy_case_ref
  ON public.inventory_items (legacy_case_ref)
  WHERE deleted_at IS NULL AND legacy_case_ref IS NOT NULL;
