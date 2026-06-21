-- DORMANT HIERARCHY INVARIANT (design §2A.8 / §10c / §10h, Q7).
-- FAILS the build if the auto-collapse foundation is not exactly-one-shaped or if
-- business-unit isolation has been silently activated. Read-only; run in CI and
-- after any hierarchy migration. Pairs with the legalEntities/sessionScope tests.
DO $$
DECLARE bad_entities int; bad_branches int; live_bu_policies int; orphan_tenants int;
BEGIN
  -- (1) exactly one primary legal entity per non-deleted tenant
  SELECT count(*) INTO bad_entities FROM (
    SELECT t.id, count(le.id) FILTER (WHERE le.is_primary AND le.deleted_at IS NULL) AS primaries
    FROM public.tenants t
    LEFT JOIN public.legal_entities le ON le.tenant_id = t.id
    WHERE t.deleted_at IS NULL
    GROUP BY t.id
    HAVING count(le.id) FILTER (WHERE le.is_primary AND le.deleted_at IS NULL) <> 1
  ) q;

  -- (2) exactly one MAIN branch per non-deleted tenant
  SELECT count(*) INTO bad_branches FROM (
    SELECT t.id, count(b.id) FILTER (WHERE b.code = 'MAIN' AND b.deleted_at IS NULL) AS mains
    FROM public.tenants t
    LEFT JOIN public.branches b ON b.tenant_id = t.id
    WHERE t.deleted_at IS NULL
    GROUP BY t.id
    HAVING count(b.id) FILTER (WHERE b.code = 'MAIN' AND b.deleted_at IS NULL) <> 1
  ) q;

  -- (3) tenants with zero entities (collapse never ran)
  SELECT count(*) INTO orphan_tenants FROM public.tenants t
  WHERE t.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.legal_entities le WHERE le.tenant_id = t.id AND le.deleted_at IS NULL);

  -- (4) DORMANCY: no tenant may have business_unit_isolation flipped ON in Phase 1
  SELECT count(*) INTO live_bu_policies FROM public.tenants
  WHERE deleted_at IS NULL AND COALESCE((feature_flags->>'business_unit_isolation')::boolean, false) = true;

  IF bad_entities > 0 OR bad_branches > 0 OR orphan_tenants > 0 OR live_bu_policies > 0 THEN
    RAISE EXCEPTION 'dormant-hierarchy-invariant FAILED: % tenants !=1 primary entity, % !=1 MAIN branch, % with no entity, % with BU isolation LIVE (must be 0 in Phase 1)',
      bad_entities, bad_branches, orphan_tenants, live_bu_policies;
  END IF;
END $$;
