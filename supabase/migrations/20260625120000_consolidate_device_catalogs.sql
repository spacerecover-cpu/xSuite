-- 20260625120000_consolidate_device_catalogs.sql
-- DML-only. Consolidate duplicate catalogs. No DDL → database.types.ts unchanged.
-- All affected FK columns have 0 rows (verified 2026-06-25): zero orphan risk.

-- 1. Interfaces: seed the 23 granular values not yet present in the canonical table.
insert into catalog_interfaces (id, name, is_active, sort_order, created_at, updated_at)
select gen_random_uuid(), v.name, true, v.ord, now(), now()
from (values
  ('SATA I (1.5 Gb/s)',10),('SATA II (3 Gb/s)',11),('SATA III (6 Gb/s)',12),
  ('USB 2.0',20),('USB 3.0',21),('USB 3.1',22),('USB 3.2',23),('USB-C',24),
  ('Thunderbolt 2',31),('Thunderbolt 3',32),('Thunderbolt 4',33),
  ('PCIe x1',40),('PCIe x4',41),('PCIe x8',42),('PCIe x16',43),
  ('M.2 SATA',50),('M.2 NVMe',51),
  ('FireWire 400',60),('FireWire 800',61),
  ('SD',70),('MicroSD',71),('CF',72),
  ('Ethernet (RJ45)',81)
) as v(name, ord)
where not exists (select 1 from catalog_interfaces ci where ci.name = v.name);

-- 2. Deactivate the coarse parents now superseded by granular children.
update catalog_interfaces
set is_active = false, updated_at = now()
where name in ('USB','SATA','M.2','NVMe','PCIe','FireWire','SD/MMC','Ethernet');

-- 3. Retire the disconnected interface catalog (no updated_at column on this table).
update catalog_device_interfaces set is_active = false;
comment on table catalog_device_interfaces is
  'DEPRECATED 2026-06-25 — consolidated into catalog_interfaces. Not FK-referenced.';

-- 4. Categories: add the 3 genuinely-new parts categories to the canonical table.
insert into master_inventory_categories (id, name, is_active, sort_order, created_at)
select gen_random_uuid(), v.name, true, v.ord, now()
from (values ('Donor Drives',100),('Head Assemblies',101),('Motors',102)) as v(name, ord)
where not exists (select 1 from master_inventory_categories m where m.name = v.name);

-- 5. Retire the disconnected category catalog (no updated_at column).
update master_inventory_item_categories set is_active = false;
comment on table master_inventory_item_categories is
  'DEPRECATED 2026-06-25 — consolidated into master_inventory_categories.';
comment on column inventory_items.item_category_id is
  'DEPRECATED 2026-06-25 — use category_id (master_inventory_categories).';
