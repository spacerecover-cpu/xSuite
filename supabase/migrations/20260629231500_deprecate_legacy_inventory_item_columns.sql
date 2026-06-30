-- Inventory V2 P10: retire the legacy inventory_items spec/donor columns per the project's
-- no-DROP discipline. Specs now live in technical_details (P1/P3); donor parts in
-- inventory_donor_parts (P4). All code readers were repointed (P6/P9 + AssignToCase fix), so these
-- columns are unused. Marked DEPRECATED (kept + reversible); a hard DROP is a separate owner call.
COMMENT ON COLUMN public.inventory_items.pcb_number IS
  'DEPRECATED (Inventory V2): use technical_details->>pcb_number. Unused; retained for safety; DROP candidate.';
COMMENT ON COLUMN public.inventory_items.firmware_version IS
  'DEPRECATED (Inventory V2): use technical_details->>firmware_version. Unused; retained for safety; DROP candidate.';
COMMENT ON COLUMN public.inventory_items.head_map IS
  'DEPRECATED (Inventory V2): use technical_details->>physical_head_map. Unused; retained for safety; DROP candidate.';
COMMENT ON COLUMN public.inventory_items.donor_parts_available IS
  'DEPRECATED (Inventory V2): donor parts now in inventory_donor_parts. Unused; retained for safety; DROP candidate.';
