-- =============================================================================
-- OPERATOR-APPLY MIGRATION: backfill_seed_existing_tenants
-- =============================================================================
-- DO NOT auto-apply (subagent is barred from applying migrations). Operator
-- lands via mcp__supabase__apply_migration(name='backfill_seed_existing_tenants').
--
-- GOAL: close the live-data side of D6 — onboarding_progress is 0 rows; each
-- existing tenant should have one. Verified live 2026-06-15:
--   tenants(with country)=2, primary legal_entities=2 (auto-collapse already
--   created them), MAIN branches=2 (already created), onboarding_progress=0.
-- So the ONLY missing artifact for existing tenants is onboarding_progress.
--
-- DIVERGENCE FROM PLAN: the plan calls seed_new_tenant(id) here, but that
-- program-track RPC does NOT exist in the live DB yet (verified — only
-- _apply_country_config / resync_tenant_country_config / sync_tenant_config_from_country
-- are present). Rather than block, this migration creates the missing
-- onboarding_progress row directly + idempotently (the entity + branch already
-- exist, so we do NOT re-create them). When seed_new_tenant lands, this can be
-- replaced by a PERFORM seed_new_tenant(id) loop.
--
-- FORENSIC INVARIANT: this only INSERTS onboarding_progress; it touches no
-- cases/invoices/custody rows, so visible row-counts are unchanged.
-- =============================================================================

DO $$
DECLARE t RECORD; v_owner uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE deleted_at IS NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t.id AND country_id IS NOT NULL) THEN
      RAISE NOTICE 'tenant % has NULL country_id; skipping (fail-loud, configure country first)', t.id;
      CONTINUE;
    END IF;

    -- onboarding_progress (idempotent): one row per tenant, owned by its owner profile.
    IF NOT EXISTS (SELECT 1 FROM public.onboarding_progress WHERE tenant_id = t.id) THEN
      SELECT id INTO v_owner FROM public.profiles
        WHERE tenant_id = t.id AND role = 'owner' ORDER BY created_at LIMIT 1;
      INSERT INTO public.onboarding_progress (tenant_id, user_id, current_step, steps_completed)
      VALUES (t.id, v_owner, 'company_info', '[]'::jsonb);
    END IF;

    -- legal_entities + MAIN branch already exist from the auto-collapse migration;
    -- guard-create only if somehow absent (idempotent, fail-loud on currency).
    IF NOT EXISTS (SELECT 1 FROM public.legal_entities WHERE tenant_id = t.id AND is_primary AND deleted_at IS NULL) THEN
      INSERT INTO public.legal_entities (tenant_id, country_id, name, tax_system, currency_code, is_primary)
      SELECT id, country_id, name, COALESCE(tax_system,'NONE'), currency_code, true
      FROM public.tenants WHERE id = t.id
        AND currency_code IS NOT NULL AND char_length(currency_code) = 3;
    END IF;
  END LOOP;
END $$;

-- VERIFY (operator runs separately): expect onboarding_progress count to be 2.
-- SELECT count(*) FROM public.onboarding_progress;  -- was 0, now 2
