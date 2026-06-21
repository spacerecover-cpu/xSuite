-- Customer↔company relationships (platform review 2026-06-10, item 1).
-- Every linked customer should have exactly one primary company. Live data had
-- 9 linked customers, none with a primary (createCustomer inserted
-- is_primary=false), so the wizard's "primary company" auto-fill was picking
-- an arbitrary row. Backfill the earliest relationship as primary, then
-- enforce single-primary with a partial unique index.

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id, customer_id ORDER BY created_at ASC, id ASC) AS rn,
         bool_or(COALESCE(is_primary, false)) OVER (PARTITION BY tenant_id, customer_id) AS any_primary
  FROM public.customer_company_relationships
  WHERE deleted_at IS NULL
)
UPDATE public.customer_company_relationships c
SET is_primary = true
FROM ranked r
WHERE c.id = r.id AND r.rn = 1 AND NOT r.any_primary;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_primary_company
  ON public.customer_company_relationships (tenant_id, customer_id)
  WHERE is_primary AND deleted_at IS NULL;
