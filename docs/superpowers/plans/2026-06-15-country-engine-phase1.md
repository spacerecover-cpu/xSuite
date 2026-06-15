# Country Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Country *table* into a Country *Engine* — a migration-free jsonb config bag with a typed-but-open resolver, populated geo reference data with a fail-loud onboarding gate, and a dormant 6-level hierarchy foundation that auto-collapses every existing tenant to exactly one legal entity + one business unit with zero behavior change.

**Architecture:** Five additive-only DDL migrations land the framework (config bag, hierarchy, sync/resync, override governance, jurisdiction-overlay columns), then three independent code areas build on top: a pure TS config engine (resolver + registry + layer cascade + service rewire), the geo reference-data generator + fail-loud provisioning, and the dormant legal-entities service + session-context no-ops. Every required jurisdiction value resolves fail-loud (no US fabrication); business-unit isolation ships flag-OFF as a pure no-op so Phase 4 activation is a flag flip, not a rewrite.

**Tech Stack:** Supabase (Postgres 15 + RLS + edge functions/Deno) · React 18 + TypeScript + Vite · TanStack Query v5 · Zod v4 · Vitest · maintained reference datasets (CLDR / ISO 4217 / libphonenumber-js / i18n-postal-address / date-holidays) via tsx.

---

## Migrations (apply first, in order)

> **Operator note:** The five migrations below are the Phase-1 additive DDL bundle. The operator applies each one via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`) **before** any code task begins. After **each** migration: run `mcp__supabase__generate_typescript_types` → overwrite `src/types/database.types.ts`; add a manifest row to `supabase/migrations.manifest.md`; run `bash scripts/check-schema-drift.sh` (no diff); run `bash scripts/check-tsc.sh` (prints `0`). The code areas assume all five are applied and `database.types.ts` is regenerated. Migrations 2–5 each depend on the previous (`dependsOnPrev: true`); migration 1 is independent (its deferred `region_id` FK is wired in migration 2).

### Migration 1 — `country_engine_geo_country_config_bag`

**Rationale:** Adds the migration-free jsonb config bag (`country_config`) + `config_version` (drives §2.6/§4.3 invalidation) + the Phase-1 format/labor-light columns (`weekend_days` fixes D15, `digit_grouping` fixes D18, `statutory_workweek`) + provenance (`reference_dataset_version`) + the no-stub structural guard (`config_status` + a tolerant `NOT VALID` CHECK that the per-country statutory-gate reads) + residency/data-protection metadata. Deliberately EXCLUDES the heavy statutory jsonb columns (`social_security_schema`/`income_tax_brackets`/`eosb_formula`/`overtime_premiums`) and the `region_id` FK — those are Phase 3 statutory / deferred to migration 2 respectively. The backfill seeds the display bag from the 35 existing typed columns so the resolver reads jsonb-with-typed-fallback at zero behavior change (§4.4 Phase A). Verified live: none of these columns exist on `geo_countries` today. `geo_countries` is GLOBAL (no `tenant_id`; SELECT `true`; write `is_platform_admin()`) — no RLS/index/trigger change.

```sql
-- M-A (§3a, §4.4, §4.3, §2.7): geo_countries is GLOBAL (no tenant_id; SELECT true; write is_platform_admin()). No RLS/index/trigger change.
ALTER TABLE public.geo_countries
  ADD COLUMN IF NOT EXISTS country_config           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS config_version           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weekend_days             int[]   NOT NULL DEFAULT '{0,6}',
  ADD COLUMN IF NOT EXISTS statutory_workweek       numeric(4,2),
  ADD COLUMN IF NOT EXISTS digit_grouping           text    NOT NULL DEFAULT '3',
  ADD COLUMN IF NOT EXISTS reference_dataset_version text,
  ADD COLUMN IF NOT EXISTS config_status            text    NOT NULL DEFAULT 'stub'
    CHECK (config_status IN ('stub','formatting_ready','statutory_ready')),
  ADD COLUMN IF NOT EXISTS requires_local_residency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_protection_regime   text;

-- tolerant no-stub currency guard: legacy '$' stubs survive (config_status='stub'); new non-stub rows must carry a real ISO currency. NOT VALID = additive-safe; VALIDATE in Task 7 after population.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_country_currency_nonstub' AND conrelid = 'public.geo_countries'::regclass) THEN
    ALTER TABLE public.geo_countries
      ADD CONSTRAINT chk_country_currency_nonstub
      CHECK (config_status = 'stub' OR (currency_code IS NOT NULL AND currency_code <> '' AND char_length(currency_code) = 3))
      NOT VALID;
  END IF;
END $$;

-- Backfill (same migration): promote the 16 currency-bearing rows to formatting_ready and seed their display jsonb bag from existing typed columns (zero behavior change; resolver falls back to typed cols). Phase A of §4.4.
UPDATE public.geo_countries
SET config_status = 'formatting_ready'
WHERE config_status = 'stub'
  AND currency_code IS NOT NULL AND char_length(currency_code) = 3;

UPDATE public.geo_countries
SET country_config = jsonb_strip_nulls(jsonb_build_object(
      'currency.code',       currency_code,
      'tax.label',           tax_label,
      'tax.default_rate',    default_tax_rate,
      'locale.code',         locale_code,
      'datetime.date_format', date_format,
      'datetime.timezone',   timezone,
      'datetime.weekend_days', to_jsonb(COALESCE(weekend_days, '{6,0}'::int[]))
    )),
    config_version = config_version
WHERE currency_code IS NOT NULL AND char_length(currency_code) = 3
  AND country_config = '{}'::jsonb;
```

### Migration 2 — `country_engine_hierarchy_foundation`

**Rationale:** The dormant 6-level hierarchy foundation. Creates the two new global geo tables (`geo_regions` level-2 grouping, `geo_subdivisions` level-3b sub-national jurisdiction — table only, ISO-3166-2 population deferred to P3) plus `master_data_residency_regions` (seeded with the single `global-1` row); wires the deferred `geo_countries.region_id` FK and backfills GCC. Creates `legal_entities` (tax identity decoupled from tenant; full tenant-scoped envelope passing `check-tenant-table-requirements`; `currency_code` has NO `'USD'` default = fail-loud D2; `uq_legal_entity_primary` mirrors v1.2.0's `uq_customer_primary_company`). Promotes `branches` in place as the business-unit entity (no `business_units` table — §2A decisive simplification). Adds `profiles` scope claims + the three session helpers (`get_current_business_unit_id` mirrors `get_current_tenant_id` exactly: profiles-primary, JWT fallback; no GUC). Adds the nullable scope columns the design names on cases/invoices/quotes/payments/receipts/stock_sales/chain_of_custody/case_devices/number_sequences, AND the missing `cases.branch_id` FK (re-verified NULL before the constraint add — confirmed 0 non-null live). Adds `number_sequences` format vocabulary. Adds `tenants` config columns. Creates the ADDITIONAL RESTRICTIVE BU policies on every operational table that gained `business_unit_id` — created FLAG-OFF (pure no-op: `business_unit_scoping_enabled()` returns false; all rows NULL). Auto-collapse backfill seeds exactly 1 primary `legal_entities` + 1 MAIN branch per tenant, fail-loud if a tenant carries a placeholder `'USD'` currency. EXCLUDES `structured_addresses`/`legal_entities.registered_address_id` (M-F, Phase 2) and live sub-unit isolation (P2, gated). Verified live: `legal_entities`/`geo_regions`/`geo_subdivisions`/`master_data_residency_regions` absent, `cases.branch_id` FK-less, `profiles` lacks `business_unit_id`, `branches`=0 rows. Depends on migration 1.

```sql
-- M-B (§2A.1-2A.8, §3b, §3e, §3j, §10c): DORMANT 6-level hierarchy foundation. Schema + auto-collapse only; live sub-unit isolation NOT enabled (BU policies created flag-OFF).

-- ============ (1) GLOBAL reference tables (no tenant_id; SELECT true; write is_platform_admin()) ============
CREATE TABLE IF NOT EXISTS public.geo_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name text NOT NULL,
  parent_id uuid REFERENCES public.geo_regions(id),
  data_residency_region text NOT NULL DEFAULT 'global-1',
  sort_order int DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_regions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geo_regions_select ON public.geo_regions;
CREATE POLICY geo_regions_select ON public.geo_regions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS geo_regions_write ON public.geo_regions;
CREATE POLICY geo_regions_write ON public.geo_regions FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE TABLE IF NOT EXISTS public.geo_subdivisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.geo_countries(id),
  parent_id uuid REFERENCES public.geo_subdivisions(id),
  code text NOT NULL, name text NOT NULL, subdivision_type text, tax_authority_code text,
  sort_order int DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, code)
);
CREATE INDEX IF NOT EXISTS idx_geo_subdivisions_country ON public.geo_subdivisions(country_id) WHERE deleted_at IS NULL;
ALTER TABLE public.geo_subdivisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_subdivisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geo_subdivisions_select ON public.geo_subdivisions;
CREATE POLICY geo_subdivisions_select ON public.geo_subdivisions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS geo_subdivisions_write ON public.geo_subdivisions;
CREATE POLICY geo_subdivisions_write ON public.geo_subdivisions FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE TABLE IF NOT EXISTS public.master_data_residency_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, display_name text NOT NULL,
  supabase_ref text, storage_endpoint text,
  is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz
);
ALTER TABLE public.master_data_residency_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_residency_regions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mdrr_select ON public.master_data_residency_regions;
CREATE POLICY mdrr_select ON public.master_data_residency_regions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mdrr_write ON public.master_data_residency_regions;
CREATE POLICY mdrr_write ON public.master_data_residency_regions FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
INSERT INTO public.master_data_residency_regions (code, display_name, supabase_ref, is_active)
VALUES ('global-1','Global (default)','ssmbegiyjivrcwgcqutu', true)
ON CONFLICT (code) DO NOTHING;

-- wire the deferred geo_countries.region_id FK (deferred from M-A), seed GCC, backfill GCC countries
ALTER TABLE public.geo_countries ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.geo_regions(id);
INSERT INTO public.geo_regions (code, name) VALUES ('GCC','Gulf Cooperation Council') ON CONFLICT (code) DO NOTHING;
UPDATE public.geo_countries gc SET region_id = (SELECT id FROM public.geo_regions WHERE code='GCC')
WHERE gc.code IN ('SA','AE','OM','KW','QA','BH') AND gc.region_id IS NULL;

-- ============ (2) legal_entities (tenant-scoped FULL pattern) — tax identity != tenant (§3e/§2A.2) ============
CREATE TABLE IF NOT EXISTS public.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.geo_countries(id),
  subdivision_id uuid REFERENCES public.geo_subdivisions(id),
  name text NOT NULL, registration_number text,
  tax_system text NOT NULL DEFAULT 'NONE', tax_identifier text,
  currency_code text NOT NULL,                       -- NO 'USD' default (fail-loud, D2)
  config jsonb NOT NULL DEFAULT '{}'::jsonb, address jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_residency_region text NOT NULL DEFAULT 'global-1',
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_entities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_entities_tenant_isolation ON public.legal_entities;
CREATE POLICY legal_entities_tenant_isolation ON public.legal_entities AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin())
  WITH CHECK (tenant_id = get_current_tenant_id() OR is_platform_admin());
DROP POLICY IF EXISTS legal_entities_select ON public.legal_entities;
CREATE POLICY legal_entities_select ON public.legal_entities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS legal_entities_insert ON public.legal_entities;
CREATE POLICY legal_entities_insert ON public.legal_entities FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS legal_entities_update ON public.legal_entities;
CREATE POLICY legal_entities_update ON public.legal_entities FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS legal_entities_delete ON public.legal_entities;
CREATE POLICY legal_entities_delete ON public.legal_entities FOR DELETE TO authenticated USING (has_role('admin'));
CREATE TRIGGER set_legal_entities_tenant_and_audit BEFORE INSERT OR UPDATE ON public.legal_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_audit_fields();
CREATE INDEX IF NOT EXISTS idx_legal_entities_tenant_id ON public.legal_entities(tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_entity_primary ON public.legal_entities(tenant_id) WHERE is_primary AND deleted_at IS NULL;

-- ============ (3) promote branches in place (business-unit entity); profiles scope claims ============
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS legal_entity_id  uuid REFERENCES public.legal_entities(id),
  ADD COLUMN IF NOT EXISTS parent_branch_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS subdivision_id   uuid REFERENCES public.geo_subdivisions(id),
  ADD COLUMN IF NOT EXISTS config           jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS legal_entity_id  uuid REFERENCES public.legal_entities(id);

-- ============ (4) nullable scope columns on operational tables (§2A.4) ============
-- cases: add legal_entity_id + branch_id FK (column already exists FK-less; all 31 rows NULL — re-verified below)
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cases WHERE branch_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cases.branch_id has non-null rows; resolve before adding FK';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_branch_id_fkey' AND conrelid = 'public.cases'::regclass) THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
  END IF;
END $$;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id), ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.branches(id);
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id), ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.branches(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
ALTER TABLE public.stock_sales ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
ALTER TABLE public.chain_of_custody ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.branches(id); -- write-once at insert; append-only triggers untouched
ALTER TABLE public.case_devices ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.branches(id);
-- number_sequences: scope cols + format vocabulary (§3j) — padding already exists; add the rest
ALTER TABLE public.number_sequences
  ADD COLUMN IF NOT EXISTS legal_entity_id    uuid REFERENCES public.legal_entities(id),
  ADD COLUMN IF NOT EXISTS business_unit_id   uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS format_template    text,
  ADD COLUMN IF NOT EXISTS reset_basis        text CHECK (reset_basis IN ('never','calendar_year','fiscal_year','month')),
  ADD COLUMN IF NOT EXISTS fiscal_year_anchor text,
  ADD COLUMN IF NOT EXISTS last_reset_period  text;

-- ============ (5) tenants config columns (§4.3) ============
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS country_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_country_config  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS country_config_version   integer,
  ADD COLUMN IF NOT EXISTS data_residency_region    text NOT NULL DEFAULT 'global-1';

-- ============ (6) session-context helpers (§2A.5) — profiles-primary + JWT fallback ============
CREATE OR REPLACE FUNCTION public.get_current_business_unit_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT business_unit_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL),
    nullif(current_setting('request.jwt.claims', true)::json->>'business_unit_id','')::uuid
  )
$$;
CREATE OR REPLACE FUNCTION public.get_current_region_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT gc.region_id FROM public.tenants t JOIN public.geo_countries gc ON gc.id = t.country_id
  WHERE t.id = get_current_tenant_id() AND t.deleted_at IS NULL
$$;
CREATE OR REPLACE FUNCTION public.business_unit_scoping_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT (feature_flags->>'business_unit_isolation')::boolean FROM public.tenants WHERE id = get_current_tenant_id()), false)
$$;

-- ============ (7) ADDITIONAL RESTRICTIVE flag-OFF BU policies (§2A.7) — pure no-op (flag off; all rows NULL) ============
DROP POLICY IF EXISTS cases_business_unit_isolation ON public.cases;
CREATE POLICY cases_business_unit_isolation ON public.cases AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR branch_id IS NULL OR branch_id = get_current_business_unit_id());
DROP POLICY IF EXISTS invoices_business_unit_isolation ON public.invoices;
CREATE POLICY invoices_business_unit_isolation ON public.invoices AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR business_unit_id IS NULL OR business_unit_id = get_current_business_unit_id());
DROP POLICY IF EXISTS quotes_business_unit_isolation ON public.quotes;
CREATE POLICY quotes_business_unit_isolation ON public.quotes AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR business_unit_id IS NULL OR business_unit_id = get_current_business_unit_id());
DROP POLICY IF EXISTS number_sequences_business_unit_isolation ON public.number_sequences;
CREATE POLICY number_sequences_business_unit_isolation ON public.number_sequences AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR business_unit_id IS NULL OR business_unit_id = get_current_business_unit_id());
DROP POLICY IF EXISTS chain_of_custody_business_unit_isolation ON public.chain_of_custody;
CREATE POLICY chain_of_custody_business_unit_isolation ON public.chain_of_custody AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR business_unit_id IS NULL OR business_unit_id = get_current_business_unit_id());
DROP POLICY IF EXISTS case_devices_business_unit_isolation ON public.case_devices;
CREATE POLICY case_devices_business_unit_isolation ON public.case_devices AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_platform_admin() OR NOT business_unit_scoping_enabled() OR get_current_business_unit_id() IS NULL OR business_unit_id IS NULL OR business_unit_id = get_current_business_unit_id());

-- ============ (8) auto-collapse backfill (§2A.8/§10c) — idempotent; fail-loud on placeholder currency ============
DO $$
DECLARE t RECORD; v_entity_id uuid;
BEGIN
  FOR t IN SELECT id, name, country_id, currency_code, tax_system FROM public.tenants WHERE deleted_at IS NULL LOOP
    IF t.country_id IS NULL THEN
      RAISE WARNING 'tenant % has NULL country_id; skipping hierarchy collapse (fail-loud, configure country first)', t.id; CONTINUE;
    END IF;
    IF t.currency_code IS NULL OR char_length(t.currency_code) <> 3
       OR NOT EXISTS (SELECT 1 FROM public.master_currency_codes m WHERE m.code = t.currency_code) THEN
      RAISE EXCEPTION 'tenant % has an unresolved currency identity (%); populate its real currency before hierarchy collapse', t.id, t.currency_code;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.legal_entities WHERE tenant_id = t.id AND is_primary AND deleted_at IS NULL) THEN
      INSERT INTO public.legal_entities (tenant_id, country_id, name, tax_system, currency_code, is_primary)
      VALUES (t.id, t.country_id, t.name, COALESCE(t.tax_system,'NONE'), t.currency_code, true)
      RETURNING id INTO v_entity_id;
    ELSE
      SELECT id INTO v_entity_id FROM public.legal_entities WHERE tenant_id = t.id AND is_primary AND deleted_at IS NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE tenant_id = t.id AND code = 'MAIN' AND deleted_at IS NULL) THEN
      INSERT INTO public.branches (tenant_id, name, code, is_main, is_active, legal_entity_id, country_id)
      VALUES (t.id, 'Main', 'MAIN', true, true, v_entity_id, t.country_id);
    END IF;
  END LOOP;
END $$;
```

### Migration 3 — `country_engine_sync_and_resync`

**Rationale:** Closes the sync-trigger gaps the program plan names. Adds the `ui_language` sync (COALESCE-guarded so the onboarding wizard override is honored — §9.2) which the current 11-field trigger lacks; removes the hardcoded `'USD'`/`'$'` literal fallbacks from the trigger body (COALESCE only against resolved country value, else NULL = fail-loud D2); routes both INSERT-sync and re-sync through one shared `_apply_country_config` helper that writes ONLY the display/formatting bag to `tenants.resolved_country_config` and stamps `country_config_version` (statutory rate/FX explicitly excluded per §4.3 — those resolve live at document commit). Adds `resync_tenant_country_config()` RPC emitting an append-only `audit_trails` `COUNTRY_CONFIG_RESYNCED` row (the §4.3 governed-correction path that fixes the half-snapshot drift), without widening the trigger to fire on every `geo_countries` edit. Backfills the display snapshot for the 2 OMR tenants. **NOTE:** the `audit_trails` INSERT column names (`action`/`entity_type`/`entity_id`/`metadata`) should be reconciled against the live `audit_trails` schema during implementation; this is the one spot in the bundle that writes to an existing append-only table and must match its actual columns + actor-stamping trigger. Verified live: sync fn exists (1), `tenants.ui_language` column present. Depends on migration 2.

```sql
-- M-C (§9.2, §4.3, §10b): ui_language sync fix + display-only re-sync path. One code path via _apply_country_config.

-- shared display-bag recompute helper (DISPLAY config only; statutory rate/FX explicitly excluded — §4.3)
CREATE OR REPLACE FUNCTION public._apply_country_config(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cc public.geo_countries%ROWTYPE; v_bag jsonb; v_ver integer;
BEGIN
  SELECT gc.* INTO v_cc FROM public.tenants t JOIN public.geo_countries gc ON gc.id = t.country_id
  WHERE t.id = p_tenant_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ver := COALESCE(v_cc.config_version, 1);
  v_bag := jsonb_strip_nulls(jsonb_build_object(
    'currency.code',          v_cc.currency_code,
    'currency.symbol',        v_cc.currency_symbol,
    'currency.decimal_places', v_cc.decimal_places,
    'currency.position',      v_cc.currency_position,
    'tax.label',              v_cc.tax_label,
    'tax.number_label',       v_cc.tax_number_label,
    'locale.code',            v_cc.locale_code,
    'datetime.date_format',   v_cc.date_format,
    'datetime.time_format',   v_cc.time_format,
    'datetime.timezone',      v_cc.timezone,
    'datetime.weekend_days',  to_jsonb(COALESCE(v_cc.weekend_days, '{6,0}'::int[])),
    'number_format.digit_grouping', v_cc.digit_grouping,
    'address.format',         v_cc.address_format
  ));
  -- fold any country_config jsonb (most-specific country layer) over the typed-derived bag
  v_bag := v_bag || COALESCE(v_cc.country_config, '{}'::jsonb);
  UPDATE public.tenants
    SET resolved_country_config = v_bag, country_config_version = v_ver
    WHERE id = p_tenant_id;
  RETURN v_ver;
END $$;

-- Rewrite sync_tenant_config_from_country(): keep existing assignments, ADD ui_language (COALESCE-guarded), drop 'USD'/'$' literal fallbacks (fail-loud), copy new format fields, share _apply_country_config.
CREATE OR REPLACE FUNCTION public.sync_tenant_config_from_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cc public.geo_countries%ROWTYPE;
BEGIN
  IF NEW.country_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO cc FROM public.geo_countries WHERE id = NEW.country_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- existing 11 assignments (no 'USD'/'$' literal fallback — COALESCE only against the resolved country value, else leave NULL = fail-loud D2)
  NEW.currency_code    := COALESCE(NEW.currency_code, cc.currency_code);
  NEW.currency_symbol  := COALESCE(NEW.currency_symbol, cc.currency_symbol);
  NEW.decimal_places   := COALESCE(NEW.decimal_places, cc.decimal_places);
  NEW.tax_system       := COALESCE(NEW.tax_system, cc.tax_system);
  NEW.tax_label        := COALESCE(NEW.tax_label, cc.tax_label);
  NEW.tax_number_label := COALESCE(NEW.tax_number_label, cc.tax_number_label);
  NEW.default_tax_rate := COALESCE(NEW.default_tax_rate, cc.default_tax_rate);
  NEW.locale_code      := COALESCE(NEW.locale_code, cc.locale_code);
  NEW.timezone         := COALESCE(NEW.timezone, cc.timezone);
  NEW.date_format      := COALESCE(NEW.date_format, cc.date_format);
  NEW.fiscal_year_start := COALESCE(NEW.fiscal_year_start, cc.fiscal_year_start);
  -- NEW: ui_language defaulted from country language_code only when caller didn't set it (honors wizard override, §9.2)
  NEW.ui_language      := COALESCE(NEW.ui_language, CASE WHEN cc.language_code = 'ar' THEN 'ar' ELSE 'en' END);
  -- base_currency backstop against NEW.currency_code (NO 'USD')
  NEW.base_currency_code := COALESCE(NEW.base_currency_code, NEW.currency_code, cc.currency_code);
  RETURN NEW;
END $$;

-- re-sync RPC: recompute display bag, emit append-only audit row, return version. Does NOT widen the trigger to fire on every geo_countries change (§10b).
CREATE OR REPLACE FUNCTION public.resync_tenant_country_config(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ver integer;
BEGIN
  v_ver := public._apply_country_config(p_tenant_id);
  IF v_ver IS NOT NULL THEN
    INSERT INTO public.audit_trails (tenant_id, action, entity_type, entity_id, metadata, created_at)
    VALUES (p_tenant_id, 'COUNTRY_CONFIG_RESYNCED', 'tenant', p_tenant_id,
            jsonb_build_object('country_config_version', v_ver), now());
  END IF;
  RETURN v_ver;
END $$;

-- Backfill: resync every non-deleted tenant with a country; leave country_id IS NULL tenants untouched (fail-loud, never guess).
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants WHERE deleted_at IS NULL AND country_id IS NOT NULL LOOP
    PERFORM public.resync_tenant_country_config(t.id);
  END LOOP;
END $$;
```

### Migration 4 — `country_engine_override_governance`

**Rationale:** The server-side twin of the client registry: a BEFORE UPDATE trigger on `tenants` (and `legal_entities`) that rejects any `country_config_overrides` write targeting a jurisdiction-derived (statutory) key, closing D11 at the data layer (`zatca_required` becomes country-locked, not a tenant toggle). The `statutory_keys` array is codegen-emitted from `COUNTRY_CONFIG_REGISTRY.STATUTORY_KEYS` and held in lockstep by the registry-trigger-parity required CI check (§2.7) so client and server cannot drift. **NOTE:** the `legal_entities` trigger fires on its `config` jsonb column (entity-layer overrides) — confirm the column inspected matches where entity overrides actually land during implementation. Depends on migration 2 (`tenants.country_config_overrides` + `legal_entities` must exist). Additive-only; does not change types.

```sql
-- Task 8 (§2.3, §2.7, §4.2): server-side jurisdiction-derived lockdown. STATUTORY_KEYS list is codegen-emitted from COUNTRY_CONFIG_REGISTRY at migration-author time and asserted in lockstep by the registry-trigger-parity CI gate.
CREATE OR REPLACE FUNCTION public.validate_country_config_overrides()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  -- GENERATED from src/lib/country/registry.ts STATUTORY_KEYS (maxOverrideLayer='country'); registry-trigger-parity gate keeps these identical.
  statutory_keys text[] := ARRAY['tax.zatca_qr.enabled'];
  k text;
BEGIN
  IF NEW.country_config_overrides IS NULL OR NEW.country_config_overrides = '{}'::jsonb THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.country_config_overrides IS NOT DISTINCT FROM OLD.country_config_overrides THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY statutory_keys LOOP
    IF NEW.country_config_overrides ? k THEN
      RAISE EXCEPTION 'country-config key % is jurisdiction-derived and cannot be overridden at the tenant/entity layer', k;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_country_config_overrides_tenants ON public.tenants;
CREATE TRIGGER trg_validate_country_config_overrides_tenants
  BEFORE INSERT OR UPDATE OF country_config_overrides ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.validate_country_config_overrides();

DROP TRIGGER IF EXISTS trg_validate_country_config_overrides_entities ON public.legal_entities;
CREATE TRIGGER trg_validate_country_config_overrides_entities
  BEFORE INSERT OR UPDATE OF config ON public.legal_entities
  FOR EACH ROW EXECUTE FUNCTION public.validate_country_config_overrides();
```

### Migration 5 — `country_engine_master_jurisdiction_overlay_cols`

**Rationale:** Per the explicit task INCLUDE for `master_*` jurisdiction-overlay columns. Adds `country_id` (NULL = universal) + `region_id` (FK `geo_regions`, which now exists post-migration-2) + `deleted_at` to the two global lookups (`master_leave_types`, `master_payroll_components`) that the brief flags as having ONLY `id` matching jurisdiction/soft-delete filters — this lets the resolver scope universal vs country/region-specific rows and soft-delete them. Verified live: neither table currently has `country_id`/`region_id`/`deleted_at`. Deliberately scoped to the ADDITIVE ANNOTATION ONLY — the tenant overlay tables (`tenant_leave_types`/`tenant_payroll_components`) and the EOSB tables (`geo_country_eosb_policies`/`employee_eosb_accruals`) are the M-H statutory wave and are deferred to a later phase where `payrollService` (D5) and `eosbService` (D4) consume them. The `region_id` FK forces ordering after migration 2. Depends on migration 2.

```sql
-- §3k (annotation step ONLY): jurisdiction-overlay columns on the two jurisdiction-loaded global lookups that today have ONLY id matching jurisdiction/soft-delete filters. Tenant overlay TABLES (tenant_leave_types/tenant_payroll_components) are DEFERRED to the statutory wave (Phase 2/3) — they need their HR/payroll consumers. These global lookups are write is_platform_admin(); SELECT already true.
ALTER TABLE public.master_leave_types
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.geo_countries(id),
  ADD COLUMN IF NOT EXISTS region_id  uuid REFERENCES public.geo_regions(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.master_payroll_components
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.geo_countries(id),
  ADD COLUMN IF NOT EXISTS region_id  uuid REFERENCES public.geo_regions(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

---

## Cross-cutting standards

These standards apply to **every** code task in the three areas below. They are stated once here; the per-area sections do not repeat them.

- **TDD micro-loop, always:** failing test → run-to-fail (capture the exact failure reason) → minimal implementation → run-to-pass → commit. Pure functions are the testable seam wherever React/Deno/DB would block a unit test.
- **Vitest invocation:** `npx vitest run <path>` for a single file. The repo's `node` project (`src/**/*.test.ts`) has no DB harness — service tests mock `./supabaseClient` (`vi.mock('./supabaseClient', () => ({ supabase: {} }))` or the `vi.hoisted({ rpc, from })` chain idiom) and test pure extracted seams. Use `--project node` for `src/lib/**` unit tests; `.tsx` tests run in the `dom` project.
- **Typecheck gate:** `bash scripts/check-tsc.sh` (or `npm run check:tsc`) MUST print `0` before every commit. CI baseline is 0 errors — a TS error fails the PR.
- **Migration dependency rule:** if `check-tsc.sh` reports an unknown column or RPC, the migration's types-regen has not landed. **Block on the migration; never `as any` around it** — that re-introduces the drift the schema-discipline CI gates exist to catch. Never hand-edit `database.types.ts`; regenerate via `npm run db:types`.
- **Fail-loud, no US fabrication:** no hardcoded `'$'`/`'USD'`/`'en-US'`/`'MM/DD/YYYY'`/`'before'`/`'.'`/`','` fallbacks for required jurisdiction values. An unresolved required key throws (config engine) or 422s (provisioning); it never silently renders US. Country-code literals (`'OM'`, `'SA'`, …) are allowed ONLY inside `scripts/country-engine/**` and reference-data seeds (the ESLint allow-list).
- **Additive + soft-delete only:** no `DROP`/`DELETE FROM` on data; set `deleted_at = now()`. Blank-string uuid FK → `null` before any write (Postgres rejects `''` as uuid → 400; companyService precedent). Use `maybeSingle()` not `single()`.
- **Reuse the existing `REQUIRED_SENTINEL`:** `Symbol.for('country-config.required')` lives at `src/types/tenantConfig.ts:5` (Phase 0). Import it — never redeclare a second symbol.
- **Branch + commit hygiene:** start each piece of work on a fresh branch cut from `main` (PRs squash-merge and delete the branch). End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Skill gate (CLAUDE.md):** load `using-superpowers` → `test-driven-development` for all backend/logic + data tooling tasks; additionally load `ui-ux-pro-max` + `frontend-design` for the wizard-step `.tsx` edits (AccountStep / LocationStep / JurisdictionStep). Announce each load. The wizard JSX is mechanical de-hardcoding + one conditional step — keep the existing dark-glass visual language; do not internationalize the wizard JSX (YAGNI per §9.2).
- **Verification before completion:** before declaring any area done, run its verification block and paste the evidence (test summary line, `check-tsc.sh` output, grep results) — evidence before assertions.

---

## Area 1 — Config-engine framework (code, post-migration)

> **Scope of THIS area:** the pure TS config engine that turns the Country *table* into a Country *Engine* — the jsonb-bag resolver, the typed-but-open key registry, the precedence cascade, the snapshot-vs-live split, the `TenantConfig` de-US-defaulting, the `tenantConfigService` rewire to resolve through the engine, and the end-to-end "add a key with ZERO schema change" proof. **Out of scope here** (owned by sibling areas): the SQL migrations themselves (M-A/M-B/M-C), the `geo_countries` reference-data generator (Area 2), the `validate_country_config_overrides()` DB trigger + parity gate (migration 4 + Area 2 CI), and the `provision-tenant` / onboarding edge-function work (Area 2). This plan **assumes all five migrations above are already applied** and `src/types/database.types.ts` already carries `geo_countries.country_config`/`config_version`, `tenants.resolved_country_config`/`country_config_overrides`/`country_config_version`, and the `resync_tenant_country_config` RPC.

### Grounding facts (verified, load-bearing)

- **Pattern to clone:** `src/lib/features/resolveFeatures.ts` (pure injected resolver) + `src/lib/features/registry.ts` (`FEATURE_REGISTRY` array + `FEATURES_BY_KEY` map + `isFeatureEnabled` app binding). Test mirror: `src/lib/features/resolveFeatures.test.ts`.
- **Deliberate safety inversion (must be pinned in a test):** `resolveFeatures.ts:28` returns `true` for an **unknown** key (flags gate visibility). Config must do the **opposite** — an unregistered key **throws** `CountryConfigError`, because config feeds money/tax/legal output.
- **Zod v4 is installed** (`"zod": "^4.3.6"`). `z.string()`, `z.number().min().max()`, `z.boolean()`, `z.array(z.number().int().min(0).max(6))`, `.safeParse()` are all available.
- **`REQUIRED_SENTINEL`** already exists at `src/types/tenantConfig.ts:5` as `Symbol.for('country-config.required')`, with `isResolvedConfig()` (Phase 0). The resolver MUST reuse this exact symbol — do not redeclare a second symbol (they would be `===` only if both use `Symbol.for(...)`, but importing the existing one is the single source of truth).
- **Test convention (critical):** the repo's `node` vitest project (`src/**/*.test.ts`) has **no DB harness**. Service tests mock `./supabaseClient` and test **pure extracted seams** — e.g. `mapRowToConfig` in `tenantConfigService.test.ts`, `assertCanAddCurrency` in `tenantCurrencyService.test.ts`. **Therefore the config engine's testable units MUST be pure functions** (`resolveConfig`, the registry, `buildConfigLayers`, `resolveTenantConfigFromLayers`), not the network-bound `fetchTenantConfig`. Run tests with `npx vitest run <file> --project node`.
- **`mapRowToConfig` already exists** (`tenantConfigService.ts:71-117`) as the pure seam mapping a tenant row (+ accounting-locale row) → `TenantConfig` with the `||`-chains. Phase 1 replaces those `||`-chains with `resolveConfig(...)` reads — but `mapRowToConfig`'s signature and its existing Phase-0 test (`tenantConfigService.test.ts`) must keep passing (extend, don't break).
- **`geo_countries` confirmed columns** (live): `code, currency_code, currency_name, currency_position, currency_symbol, date_format, decimal_places, decimal_separator, thousands_separator, default_tax_rate, language_code, locale_code, postal_code_label, tax_invoice_required, tax_label, tax_number_format, tax_number_placeholder, tax_system, time_format, week_starts_on`.
- **Verify commands** (run from repo root, all must be green at each commit): `npx vitest run <testfile> --project node`; `bash scripts/check-tsc.sh` (must print `0`).

### Task A — Pure config resolver `resolveCountryConfig.ts` (TDD)

The single load-bearing function. Mirrors `resolveFeatureEnabled` (injected registry + layers, dependency-free) with two upgrades: typed (validate on read) and fail-loud (unknown key throws; unresolved required sentinel throws).

**Files:**
- Create: `src/lib/country/resolveCountryConfig.ts`
- Test: `src/lib/country/resolveCountryConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/country/resolveCountryConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import {
  resolveConfig,
  CountryConfigError,
  type ConfigKeyDef,
  type ConfigLayers,
} from './resolveCountryConfig';

// A Zod-backed mini-registry exercising every code path.
const reg: Record<string, ConfigKeyDef> = {
  'currency.code': {
    key: 'currency.code',
    schema: z.union([z.string().length(3), z.symbol()]),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  'datetime.date_format': {
    key: 'datetime.date_format',
    schema: z.string(),
    codedDefault: 'YYYY-MM-DD', // a coded default that is a real value
  },
  'tax.default_rate': {
    key: 'tax.default_rate',
    schema: z.number().min(0).max(100),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
};

describe('resolveConfig — precedence (most-specific non-null wins)', () => {
  it('returns the coded default when no layer sets the key', () => {
    expect(resolveConfig<string>(reg, {}, 'datetime.date_format')).toBe('YYYY-MM-DD');
  });

  it('walks global → region → country → legalEntity → tenant → businessUnit, later wins', () => {
    const layers: ConfigLayers = {
      global: { 'datetime.date_format': 'A' },
      region: { 'datetime.date_format': 'B' },
      country: { 'datetime.date_format': 'C' },
      legalEntity: { 'datetime.date_format': 'D' },
      tenant: { 'datetime.date_format': 'E' },
      businessUnit: { 'datetime.date_format': 'F' },
    };
    expect(resolveConfig<string>(reg, layers, 'datetime.date_format')).toBe('F'); // most specific

    // Remove the two most-specific rungs → the next one wins, proving each rung.
    expect(resolveConfig<string>(reg, { ...layers, businessUnit: {}, tenant: {} }, 'datetime.date_format')).toBe('D');
    expect(resolveConfig<string>(reg, { global: { 'datetime.date_format': 'A' }, country: { 'datetime.date_format': 'C' } }, 'datetime.date_format')).toBe('C');
    expect(resolveConfig<string>(reg, { global: { 'datetime.date_format': 'A' } }, 'datetime.date_format')).toBe('A');
  });

  it('treats a null/undefined value in a more-specific layer as TRANSPARENT (does not override a more-general non-null)', () => {
    const layers: ConfigLayers = {
      country: { 'datetime.date_format': 'C' },
      tenant: { 'datetime.date_format': null }, // explicit null
      businessUnit: { 'datetime.date_format': undefined as unknown }, // explicit undefined
    };
    expect(resolveConfig<string>(reg, layers, 'datetime.date_format')).toBe('C');
  });
});

describe('resolveConfig — fail-loud safety', () => {
  it('THROWS CountryConfigError for an UNREGISTERED key — the deliberate inversion vs resolveFeatures.ts:28, which returns true for unknown keys (config feeds money/tax/legal output, so it must not silently permit)', () => {
    expect(() => resolveConfig(reg, {}, 'no.such.key')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, {}, 'no.such.key')).toThrow(/Unregistered country-config key/);
  });

  it('THROWS for a required key still resolving to REQUIRED_SENTINEL (country not configured, fail-loud, D2)', () => {
    expect(() => resolveConfig(reg, {}, 'currency.code')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, {}, 'currency.code')).toThrow(/fail-loud, D2/);
  });

  it('resolves a required key once a layer supplies a valid value', () => {
    expect(resolveConfig<string>(reg, { country: { 'currency.code': 'OMR' } }, 'currency.code')).toBe('OMR');
  });

  it('THROWS when a supplied value fails the per-key schema (e.g. a 4-letter currency, an out-of-range rate)', () => {
    expect(() => resolveConfig(reg, { tenant: { 'currency.code': 'OMRX' } }, 'currency.code')).toThrow(CountryConfigError);
    expect(() => resolveConfig(reg, { tenant: { 'tax.default_rate': 150 } }, 'tax.default_rate')).toThrow(CountryConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/country/resolveCountryConfig.test.ts --project node`
Expected: FAIL — module `./resolveCountryConfig` does not exist. This confirms the test is wired before any implementation.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/country/resolveCountryConfig.ts`:

```ts
// Pure resolution of one effective country-config value across the jurisdiction
// cascade. Clones the feature_flags pattern (src/lib/features/resolveFeatures.ts)
// — injected registry + injected layers, dependency-free, unit-testable — with
// two upgrades that the feature resolver deliberately does NOT have:
//   1. Values are TYPED: validated on read via a per-key Zod schema.
//   2. Fail-loud: an UNREGISTERED key THROWS (resolveFeatures.ts:28 returns true
//      for unknown keys — the OPPOSITE bias, correct there because flags gate
//      visibility; wrong here because config feeds money/tax/legal output), and
//      a required key still at REQUIRED_SENTINEL THROWS.
import type { ZodType } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';

export type ConfigBag = Record<string, unknown>;

export type ConfigLayers = {
  global?: ConfigBag;
  region?: ConfigBag;
  country?: ConfigBag;
  legalEntity?: ConfigBag;
  tenant?: ConfigBag;
  businessUnit?: ConfigBag;
};

// least → most specific; later wins
const ORDER: (keyof ConfigLayers)[] = [
  'global',
  'region',
  'country',
  'legalEntity',
  'tenant',
  'businessUnit',
];

export interface ConfigKeyDef {
  key: string;
  schema: ZodType;
  /** NEVER a US fabrication for required keys → REQUIRED_SENTINEL. */
  codedDefault: unknown;
  required?: boolean;
}

export class CountryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountryConfigError';
  }
}

export function resolveConfig<T>(
  registry: Record<string, ConfigKeyDef>,
  layers: ConfigLayers,
  key: string,
): T {
  const def = registry[key];
  if (!def) {
    throw new CountryConfigError(`Unregistered country-config key: ${key}`);
  }

  let value: unknown = def.codedDefault; // lowest precedence
  for (const layer of ORDER) {
    const bag = layers[layer];
    // most-specific non-null wins; a null/undefined value is transparent.
    if (bag && key in bag && bag[key] != null) {
      value = bag[key]; // clean assignment (NOT the comma-operator bug the spec §14 flagged)
    }
  }

  if (def.required && value === REQUIRED_SENTINEL) {
    throw new CountryConfigError(
      `Required country-config key '${key}' unresolved — country not configured (fail-loud, D2)`,
    );
  }

  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    throw new CountryConfigError(`Invalid value for ${key}: ${parsed.error.message}`);
  }
  return parsed.data as T;
}
```

> **Ordering note:** the required-sentinel check runs **before** `safeParse` so a `required` key that never resolved gives the clear "country not configured" message rather than a confusing schema error (the sentinel symbol would also fail most schemas). The test `THROWS for a required key still resolving to REQUIRED_SENTINEL` pins this ordering.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/country/resolveCountryConfig.test.ts --project node`
Expected: PASS (all green). Then `bash scripts/check-tsc.sh` → `0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/country/resolveCountryConfig.ts src/lib/country/resolveCountryConfig.test.ts
git commit -m "feat(country): pure config resolver cloning feature_flags pattern (fail-loud)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B — Country config key registry `registry.ts` (TDD)

Mirror `FEATURE_REGISTRY`: one array, one entry per key, defaults + metadata in code; typed (each key declares a Zod schema) yet open (adding a key is an array push, zero DDL). Adds `maxOverrideLayer` (the typed-config analogue of feature `core` — statutory keys are country-locked) and a derived `STATUTORY_KEYS` export (consumed later by the migration-4 trigger-parity gate, a sibling area — this plan only EXPORTS it).

**Files:**
- Create: `src/lib/country/registry.ts`
- Test: `src/lib/country/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/country/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { CountryConfigError } from './resolveCountryConfig';
import {
  COUNTRY_CONFIG_REGISTRY,
  REGISTRY_BY_KEY,
  STATUTORY_KEYS,
  resolveCountryConfigKey,
} from './registry';

describe('COUNTRY_CONFIG_REGISTRY integrity', () => {
  it('has no duplicate keys', () => {
    const keys = COUNTRY_CONFIG_REGISTRY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('required keys carry codedDefault === REQUIRED_SENTINEL (never a US fabrication)', () => {
    const required = ['currency.code', 'tax.label', 'tax.default_rate', 'number_format.amount_in_words_minor_units'];
    for (const k of required) {
      const def = REGISTRY_BY_KEY[k];
      expect(def, `missing registry entry ${k}`).toBeTruthy();
      expect(def.required).toBe(true);
      expect(def.codedDefault).toBe(REQUIRED_SENTINEL);
    }
  });

  it('statutory keys are country-locked via maxOverrideLayer:"country"', () => {
    expect(REGISTRY_BY_KEY['tax.zatca_qr.enabled'].maxOverrideLayer).toBe('country');
  });

  it('STATUTORY_KEYS is the non-empty set of maxOverrideLayer==="country" keys (consumed by the registry-trigger-parity gate)', () => {
    expect(STATUTORY_KEYS.length).toBeGreaterThan(0);
    expect(STATUTORY_KEYS).toContain('tax.zatca_qr.enabled');
    for (const k of STATUTORY_KEYS) {
      expect(REGISTRY_BY_KEY[k].maxOverrideLayer).toBe('country');
    }
  });
});

describe('resolveCountryConfigKey bound to the real registry', () => {
  it('resolves a display key from the country layer', () => {
    const v = resolveCountryConfigKey<string>(
      { country: { 'datetime.date_format': 'DD/MM/YYYY' } },
      'datetime.date_format',
    );
    expect(v).toBe('DD/MM/YYYY');
  });

  it('THROWS for a required key (currency.code) when no layer provides it (fail-loud)', () => {
    expect(() => resolveCountryConfigKey({}, 'currency.code')).toThrow(CountryConfigError);
  });

  it('weekend_days has a real coded default of [6,0] (Sat/Sun) and is NOT required', () => {
    expect(resolveCountryConfigKey<number[]>({}, 'datetime.weekend_days')).toEqual([6, 0]);
    expect(REGISTRY_BY_KEY['datetime.weekend_days'].required).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/country/registry.test.ts --project node`
Expected: FAIL — module `./registry` missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/country/registry.ts`:

```ts
// The single source of truth for every country-driven config key. Mirrors
// FEATURE_REGISTRY (src/lib/features/registry.ts): one array, defaults + metadata
// in code, an app-facing binding (resolveCountryConfigKey) like isFeatureEnabled.
// Adding a country key = one array push + ZERO schema change (§4.7). The jsonb
// bag columns (geo_countries.country_config, tenants.country_config_overrides)
// already exist, so a new key needs no migration.
import { z, type ZodType } from 'zod';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { resolveConfig, type ConfigLayers } from './resolveCountryConfig';

export type ConfigDomain =
  | 'currency'
  | 'tax'
  | 'datetime'
  | 'number_format'
  | 'locale'
  | 'address'
  | 'labor'
  | 'document';

// NOTE: this is the RICHER authoring interface (adds domain/label/description/
// maxOverrideLayer). It is structurally assignable to the MINIMAL ConfigKeyDef in
// resolveCountryConfig.ts (key + schema + codedDefault + required), so passing
// REGISTRY_BY_KEY into resolveConfig typechecks. Task F's worked example imports the
// minimal `type ConfigKeyDef` from './resolveCountryConfig' (not this one) on purpose.
export interface ConfigKeyDef {
  key: string;
  domain: ConfigDomain;
  label: string;
  description: string;
  schema: ZodType;
  /** NEVER a US fabrication for required keys → REQUIRED_SENTINEL. */
  codedDefault: unknown;
  required?: boolean;
  /** Statutory analogue of feature `core`: the most-specific layer allowed to
   *  override this key. `'country'` ⇒ no tenant/BU may fake compliance (D11). */
  maxOverrideLayer?: 'country' | 'legal_entity' | 'tenant' | 'business_unit';
}

// A schema that accepts either the typed value OR the unresolved sentinel, so a
// required key validates while still at REQUIRED_SENTINEL (the resolver throws on
// the sentinel BEFORE safeParse; this union just keeps the parse total).
const orSentinel = (s: ZodType): ZodType => z.union([s, z.symbol()]);

export const COUNTRY_CONFIG_REGISTRY: ConfigKeyDef[] = [
  // ── currency ──
  {
    key: 'currency.code',
    domain: 'currency',
    label: 'Currency code',
    description: 'ISO 4217 currency code for the entity.',
    schema: orSentinel(z.string().length(3)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  // ── tax (statutory; D9/D10/D11) ──
  {
    key: 'tax.label',
    domain: 'tax',
    label: 'Tax label',
    description: 'The tax name shown on documents (VAT/GST/Sales Tax). D9.',
    schema: orSentinel(z.string().min(1)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    key: 'tax.default_rate',
    domain: 'tax',
    label: 'Default tax rate',
    description: 'Default standard tax rate (percent). D10. Binding rate resolves effective-dated at commit; this is display only.',
    schema: orSentinel(z.number().min(0).max(100)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  {
    key: 'tax.zatca_qr.enabled',
    domain: 'tax',
    label: 'ZATCA QR enabled',
    description: 'Whether ZATCA Phase-1 QR emits. Jurisdiction-derived, country-locked (D11).',
    schema: z.boolean(),
    codedDefault: false,
    maxOverrideLayer: 'country',
  },
  // ── datetime ──
  {
    key: 'datetime.date_format',
    domain: 'datetime',
    label: 'Date format',
    description: 'Display date pattern. Backfilled from geo_countries.date_format (§4.4 Phase A).',
    schema: z.string().min(1),
    codedDefault: 'YYYY-MM-DD', // ISO 8601 — a neutral, non-US coded default
  },
  {
    key: 'datetime.timezone',
    domain: 'datetime',
    label: 'Timezone',
    description: 'IANA timezone. Backfilled from geo_countries.timezone.',
    schema: z.string().min(1),
    codedDefault: 'UTC',
  },
  {
    key: 'datetime.weekend_days',
    domain: 'datetime',
    label: 'Weekend days',
    description: 'Days of week that are weekend (0=Sun..6=Sat). D15.',
    schema: z.array(z.number().int().min(0).max(6)),
    codedDefault: [6, 0], // Sat/Sun — a real, neutral default (NOT a sentinel)
  },
  // ── number_format (statutory minor-unit correctness; D13) ──
  {
    key: 'number_format.amount_in_words_minor_units',
    domain: 'number_format',
    label: 'Amount-in-words minor units',
    description: 'Decimal places for amount-in-words split (OMR=3, JPY=0). D13.',
    schema: orSentinel(z.number().int().min(0).max(4)),
    codedDefault: REQUIRED_SENTINEL,
    required: true,
  },
  // ── locale ──
  {
    key: 'locale.code',
    domain: 'locale',
    label: 'Locale code',
    description: 'BCP-47 locale. Backfilled from geo_countries.locale_code (§4.4 Phase A).',
    schema: z.string().min(2),
    codedDefault: 'en', // neutral language-only fallback; full locale resolved from layers
  },
];

export const REGISTRY_BY_KEY: Record<string, ConfigKeyDef> = Object.fromEntries(
  COUNTRY_CONFIG_REGISTRY.map((d) => [d.key, d]),
);

/** The jurisdiction-derived keys no tenant may override — the parity source the
 *  server-side validate_country_config_overrides() trigger is generated from
 *  (the registry-trigger-parity CI gate, migration 4, a sibling area). */
export const STATUTORY_KEYS: string[] = COUNTRY_CONFIG_REGISTRY.filter(
  (d) => d.maxOverrideLayer === 'country',
).map((d) => d.key);

/** App-facing binding to the real registry (mirrors isFeatureEnabled at registry.ts:116). */
export function resolveCountryConfigKey<T>(layers: ConfigLayers, key: string): T {
  return resolveConfig<T>(REGISTRY_BY_KEY, layers, key);
}
```

> **`orSentinel` note:** `resolveConfig` throws on an unresolved required sentinel **before** `safeParse`, so in practice the sentinel never reaches the schema. The union keeps the parse total for defensiveness and avoids a type lie (`codedDefault: unknown` holding a symbol). The registry test pins that `currency.code` with no layer throws (the sentinel path), not a schema error.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/country/registry.test.ts --project node`
Expected: PASS (green). Then `bash scripts/check-tsc.sh` → `0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/country/registry.ts src/lib/country/registry.test.ts
git commit -m "feat(country): typed-but-open config key registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task C — De-US-default `TenantConfig` + extract the pure layer-builder seam (TDD)

This task does the **code half** of the snapshot-vs-live split: a pure `buildConfigLayers(tenantRow, accountingLocaleRow)` that assembles `ConfigLayers` from the snapshot bag + overrides + folded `accounting_locales`, and (in Task D) a pure `resolveTenantConfigFromLayers(layers, fallbackRow)` that produces the existing `TenantConfig` shape via `resolveConfig` per field. Keeping these pure mirrors `mapRowToConfig` and is the ONLY way they're testable in the no-DB node project.

**Files:**
- Modify: `src/types/tenantConfig.ts` (doc-comment only)
- Create: `src/lib/country/buildConfigLayers.ts`
- Test: `src/lib/country/buildConfigLayers.test.ts`

- [ ] **Step 1: Edit `src/types/tenantConfig.ts` — clarify that `DEFAULT_TENANT_CONFIG` is a typed placeholder**

`DEFAULT_TENANT_CONFIG` currently fabricates display fields; Phase-0 already set `currency.code` and `locale.localeCode` to `REQUIRED_SENTINEL`. **This task does NOT add the four new sub-configs** (`labor`/`address`/`numberFormat`/`documentPolicy`) — those land in Phase 2/3 with consumers. The only change here: a clarifying doc-comment confirming `DEFAULT_TENANT_CONFIG` is a typed placeholder, not a render fallback. Add this comment above the existing `export const DEFAULT_TENANT_CONFIG: TenantConfig = {`:

```ts
/** Typed SHAPE placeholder only — never rendered. The provider blocks render when
 *  isResolvedConfig() is false (sentinel-bearing required keys). Cosmetic display
 *  fields keep safe defaults; required jurisdiction keys stay REQUIRED_SENTINEL so
 *  an unconfigured tenant fails loud instead of silently rendering US (D2/D3). */
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
```

> No structural type change is needed in Phase 1; the Phase-0 sentinels already de-US-default the two required keys. This step is a deliberate no-op-with-documentation so the plan is honest that the heavy lifting was Phase 0. **Do not add sub-config interfaces here** — that would create unconsumed surface area (YAGNI, per §4.6 phasing).

- [ ] **Step 2: Write the failing test for the pure layer seams**

Create `src/lib/country/buildConfigLayers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINEL } from '../../types/tenantConfig';
import { buildConfigLayers } from './buildConfigLayers';

describe('buildConfigLayers — snapshot-vs-live split (DISPLAY config only)', () => {
  it('folds resolved_country_config into the country layer and country_config_overrides into the tenant layer', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: { 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' },
        country_config_overrides: { 'datetime.date_format': 'YYYY.MM.DD' }, // tenant deliberately overrode display
      },
      null,
    );
    expect(layers.country).toEqual({ 'datetime.date_format': 'DD/MM/YYYY', 'currency.code': 'OMR' });
    expect(layers.tenant).toMatchObject({ 'datetime.date_format': 'YYYY.MM.DD' });
  });

  it('folds the default accounting_locale at the TENANT altitude (above country, below explicit overrides)', () => {
    const layers = buildConfigLayers(
      { resolved_country_config: { 'currency.code': 'OMR' }, country_config_overrides: {} },
      { currency_code: 'EUR', date_format: 'DD-MM-YYYY', locale_code: 'de-DE' },
    );
    // accounting_locale projects into the tenant layer as a synthetic override map
    expect(layers.tenant).toMatchObject({
      'currency.code': 'EUR',
      'datetime.date_format': 'DD-MM-YYYY',
      'locale.code': 'de-DE',
    });
  });

  it('an explicit country_config_override beats the folded accounting_locale (override is most-specific within the tenant layer)', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: { 'currency.code': 'OMR' },
        country_config_overrides: { 'datetime.date_format': 'OVERRIDE' },
      },
      { date_format: 'FROM_LOCALE' },
    );
    expect(layers.tenant?.['datetime.date_format']).toBe('OVERRIDE');
  });

  it('an empty snapshot yields an empty country layer (so a required key resolves to REQUIRED_SENTINEL → resolver throws)', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} }, null);
    expect(layers.country).toEqual({});
    // currency.code unresolved ⇒ REQUIRED_SENTINEL is the coded default; the resolver
    // (Task A) throws — asserted in resolveCountryConfig.test.ts, referenced here.
    expect(REQUIRED_SENTINEL).toBeTypeOf('symbol');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/country/buildConfigLayers.test.ts --project node`
Expected: FAIL — module `./buildConfigLayers` missing.

- [ ] **Step 4: Implement the pure layer-builder**

Create `src/lib/country/buildConfigLayers.ts`:

```ts
// Pure assembly of the DISPLAY config cascade from the tenant snapshot + tenant
// overrides + the folded default accounting_locale. This is the snapshot side of
// the snapshot-vs-live split (§4.3): it carries DISPLAY/formatting config only —
// it NEVER carries the tax rate or FX rate used to COMPUTE a committed value
// (those resolve live + effective-dated at commit and freeze onto the document
// row — owned by the statutory area, not here).
//
// accounting_locales folds in at the TENANT-override altitude as a synthetic
// override map (not a parallel chain), so there is ONE cascade across all 42
// consumer sites. Explicit country_config_overrides win over the folded locale.
import type { ConfigLayers, ConfigBag } from './resolveCountryConfig';

export interface TenantConfigRow {
  resolved_country_config?: unknown;
  country_config_overrides?: unknown;
}

export interface AccountingLocaleRow {
  currency_code?: string | null;
  currency_symbol?: string | null;
  decimal_places?: number | null;
  currency_position?: string | null;
  decimal_separator?: string | null;
  thousands_separator?: string | null;
  date_format?: string | null;
  locale_code?: string | null;
}

function asBag(v: unknown): ConfigBag {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as ConfigBag) : {};
}

/** Project the default accounting_locale row into config-key space (tenant altitude). */
function localeToBag(locale: AccountingLocaleRow | null): ConfigBag {
  if (!locale) return {};
  const bag: ConfigBag = {};
  if (locale.currency_code) bag['currency.code'] = locale.currency_code;
  if (locale.date_format) bag['datetime.date_format'] = locale.date_format;
  if (locale.locale_code) bag['locale.code'] = locale.locale_code;
  return bag;
}

export function buildConfigLayers(
  tenant: TenantConfigRow,
  defaultLocale: AccountingLocaleRow | null,
): ConfigLayers {
  const snapshot = asBag(tenant.resolved_country_config); // the DISPLAY snapshot (country altitude)
  const overrides = asBag(tenant.country_config_overrides); // explicit tenant choices
  const folded = localeToBag(defaultLocale); // accounting_locale at tenant altitude

  return {
    country: snapshot,
    // tenant layer = folded accounting_locale, then explicit overrides win.
    tenant: { ...folded, ...overrides },
    // region / legalEntity / businessUnit are transparent in Phase 1 (auto-collapse).
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/country/buildConfigLayers.test.ts --project node`
Expected: PASS (green). Then `bash scripts/check-tsc.sh` → `0`.

- [ ] **Step 6: Commit**

```bash
git add src/types/tenantConfig.ts src/lib/country/buildConfigLayers.ts src/lib/country/buildConfigLayers.test.ts
git commit -m "feat(country): pure DISPLAY config-layer builder (snapshot + overrides + folded locale)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task D — Rewire `tenantConfigService` to resolve through the engine (TDD)

Replace the `||`-chains in `mapRowToConfig` with `resolveConfig` reads against the assembled layers, so a missing required key throws `CountryConfigError` (fail-loud) instead of silently producing `'USD'`/`'$'`/`'en-US'`/`'MM/DD/YYYY'`. Keep `mapRowToConfig`'s signature so the **existing Phase-0 test keeps passing**, and add the engine path. Add the `resyncTenantCountryConfig(tenantId)` thin wrapper over the RPC. Keep ONE round trip in `fetchTenantConfig`.

**Files:**
- Modify: `src/lib/tenantConfigService.ts`
- Test: `src/lib/tenantConfigService.test.ts` (extend existing)

- [ ] **Step 1: Extend the failing test**

Service-shaped assertions belong in `src/lib/tenantConfigService.test.ts` (it already mocks `./supabaseClient`). Append these blocks after the existing `mapRowToConfig fail-loud` describe:

```ts
import { resolveTenantConfigFromLayers } from './tenantConfigService';
import { CountryConfigError } from './country/resolveCountryConfig';
import { buildConfigLayers } from './country/buildConfigLayers';

describe('resolveTenantConfigFromLayers — engine path (fail-loud, no US literals)', () => {
  const baseRow = { id: 't1', name: 'Lab', theme: 'royal' };

  it('resolves OMR/VAT for a configured Oman tenant via the snapshot bag', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR',
          'tax.label': 'VAT',
          'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3,
          'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy',
          'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: {},
      },
      null,
    );
    const cfg = resolveTenantConfigFromLayers(baseRow, layers);
    expect(cfg.currency.code).toBe('OMR');
    expect(cfg.tax.label).toBe('VAT');
    expect(cfg.locale.localeCode).toBe('ar-OM');
  });

  it('THROWS CountryConfigError (not USD/$) when the required currency.code is unresolved', () => {
    const layers = buildConfigLayers({ resolved_country_config: {}, country_config_overrides: {} }, null);
    expect(() => resolveTenantConfigFromLayers(baseRow, layers)).toThrow(CountryConfigError);
  });

  it('a tenant DISPLAY override beats the country snapshot for a tenant-chosen key', () => {
    const layers = buildConfigLayers(
      {
        resolved_country_config: {
          'currency.code': 'OMR', 'tax.label': 'VAT', 'tax.default_rate': 5,
          'number_format.amount_in_words_minor_units': 3, 'locale.code': 'ar-OM',
          'datetime.date_format': 'dd/MM/yyyy', 'datetime.timezone': 'Asia/Muscat',
        },
        country_config_overrides: { 'datetime.date_format': 'yyyy-MM-dd' },
      },
      null,
    );
    expect(resolveTenantConfigFromLayers(baseRow, layers).dateTime.dateFormat).toBe('yyyy-MM-dd');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tenantConfigService.test.ts --project node`
Expected: FAIL — `resolveTenantConfigFromLayers` not exported.

- [ ] **Step 3: Implement `resolveTenantConfigFromLayers` and wire `fetchTenantConfig`**

Edit `src/lib/tenantConfigService.ts`:

1. **Add imports** at the top (after the existing imports):

```ts
import { resolveCountryConfigKey } from './country/registry';
import { buildConfigLayers } from './country/buildConfigLayers';
import type { ConfigLayers } from './country/resolveCountryConfig';
```

2. **Add the pure engine-resolution seam** `resolveTenantConfigFromLayers` (place it directly above `mapRowToConfig`). It resolves each `TenantConfig` field through the engine; cosmetic display fields keep their existing safe display fallbacks read from the snapshot bag, since those are tenant-chosen, not required:

```ts
/**
 * Pure: a tenant base row (id/name/theme) + the assembled DISPLAY ConfigLayers →
 * TenantConfig, resolving every JURISDICTION-required field through the engine
 * (resolveCountryConfigKey). A missing required key THROWS CountryConfigError —
 * fail-loud, never a US literal (D2/D3). Cosmetic display fields (symbol,
 * separators, position) read from the snapshot bag with safe display fallbacks
 * because they are tenant-chosen, not statutory. This is the testable seam (no DB).
 */
export function resolveTenantConfigFromLayers(
  base: Record<string, unknown>,
  layers: ConfigLayers,
): TenantConfig {
  const snap = (layers.country ?? {}) as Record<string, unknown>;
  const get = <T>(key: string): T => resolveCountryConfigKey<T>(layers, key); // throws on unresolved required

  return {
    tenantId: base.id as string,
    tenantName: base.name as string,
    countryCode: (snap['country.code'] as string) || (base.countryCode as string) || '',
    countryName: (snap['country.name'] as string) || (base.countryName as string) || '',
    currency: {
      code: get<string>('currency.code'), // required → throws if unresolved
      symbol: (snap['currency.symbol'] as string) || '',
      name: (snap['currency.name'] as string) || (get<string>('currency.code')),
      decimalPlaces: (snap['currency.decimal_places'] as number) ?? 2,
      decimalSeparator: (snap['currency.decimal_separator'] as string) || '.',
      thousandsSeparator: (snap['currency.thousands_separator'] as string) ?? ',',
      position: ((snap['currency.position'] as string) || 'before') as 'before' | 'after',
    },
    tax: {
      system: ((snap['tax.system'] as string) || 'NONE') as TaxSystem,
      label: get<string>('tax.label'), // required → throws if unresolved (D9)
      numberLabel: (snap['tax.number_label'] as string) || 'Tax ID',
      numberFormat: (snap['tax.number_format'] as string) || null,
      numberPlaceholder: (snap['tax.number_placeholder'] as string) || null,
      defaultRate: get<number>('tax.default_rate'), // required → throws (D10)
      invoiceRequired: (snap['tax.invoice_required'] as boolean) || false,
    },
    dateTime: {
      dateFormat: get<string>('datetime.date_format'),
      timeFormat: ((snap['datetime.time_format'] as string) || '24h') as '12h' | '24h',
      timezone: get<string>('datetime.timezone'),
      weekStartsOn: ((snap['datetime.week_starts_on'] as number) ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      fiscalYearStart: (snap['datetime.fiscal_year_start'] as string) || '01-01',
    },
    locale: {
      localeCode: get<string>('locale.code'),
      // UI language is a deliberate tenant choice, not a country fact (the seed of
      // the jurisdiction-derived-vs-tenant-chosen split, tenantConfigService.ts:108).
      languageCode: (base.ui_language as string) || 'en',
      postalCodeLabel: (snap['address.postal_code_label'] as string) || 'Postal Code',
    },
    theme: THEMES.includes(base.theme as Theme) ? (base.theme as Theme) : DEFAULT_THEME,
    featureFlags: {},
  };
}
```

3. **Wire `fetchTenantConfig`** to use the engine path while keeping ONE round trip. In the existing tenant `.select(...)`, add `resolved_country_config, country_config_overrides` to the selected columns (they now exist post-migration). After fetching `data` and `defaultLocale`, replace the `return { ...mapRowToConfig(data, defaultLocale), featureFlags };` line with the engine path, propagating `CountryConfigError` rather than swallowing it:

```ts
  const layers = buildConfigLayers(
    {
      resolved_country_config: (data as Record<string, unknown>).resolved_country_config,
      country_config_overrides: (data as Record<string, unknown>).country_config_overrides,
    },
    defaultLocale as Record<string, unknown> | null,
  );
  // Engine path: resolve every required field through the cascade. A missing
  // required key throws CountryConfigError, which propagates to the provider's
  // blocking "not configured" state (§4.5) — never a silent US fallback.
  const resolved = resolveTenantConfigFromLayers(data as Record<string, unknown>, layers);
  return { ...resolved, featureFlags };
```

> Keep `mapRowToConfig` exported and UNCHANGED (its Phase-0 test must stay green) — it becomes the legacy/compat mapper; `fetchTenantConfig` now uses `resolveTenantConfigFromLayers`. Do not delete `mapRowToConfig` in Phase 1 (a `git grep mapRowToConfig` will show only the test + service; removal is a Phase-2 cleanup once all readers route through the engine). **Do NOT change the `catch (error || !data)` early-return** that returns `{ ...DEFAULT_TENANT_CONFIG, tenantId }` on a *fetch* error (network failure) — that is distinct from a *config-resolution* throw, which must propagate.

4. **Add the resync wrapper** (RPC exists post-migration `country_engine_sync_and_resync`). Place near `updateTenantUiLanguage`:

```ts
/** Re-applies the DISPLAY country config to a tenant after a geo_countries
 *  correction (§4.3/§10b). Statutory rate/FX is NOT re-synced — it resolves live
 *  effective-dated at commit. Invalidates the cache so the next read is fresh. */
export async function resyncTenantCountryConfig(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('resync_tenant_country_config', { p_tenant_id: tenantId });
  if (error) {
    logger.error('Failed to resync tenant country config:', error);
    throw error;
  }
  invalidateTenantConfigCache(tenantId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tenantConfigService.test.ts --project node`
Expected: PASS (old `mapRowToConfig` tests + new engine tests). Then `bash scripts/check-tsc.sh` → `0`.

> **Type note:** if `database.types.ts` types the `resync_tenant_country_config` RPC args, `supabase.rpc('resync_tenant_country_config', { p_tenant_id })` typechecks. If `check-tsc.sh` reports the RPC name is unknown, the migration's types-regen step has not landed — **do not work around it with `as any`**; block on the migration. This is the documented dependency.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenantConfigService.ts src/lib/tenantConfigService.test.ts
git commit -m "feat(country): resolve TenantConfig through the engine, delete US fallbacks (fail-loud)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task E — Provider blocking state for `CountryConfigError`

`TenantConfigContext.tsx`'s `loadConfig` currently `catch`es any error and falls back to `DEFAULT_TENANT_CONFIG` (silent US-ish render). Make a `CountryConfigError` (or an unresolved config) render a **blocking "Tenant not configured for its country" state + telemetry** instead of silently rendering a half-config. This is a `.tsx` change → it runs in the `dom` vitest project; a light render test is optional and can be deferred to the QA/UI sibling area. The mandatory change is the catch branch.

**Files:**
- Modify: `src/contexts/TenantConfigContext.tsx`

- [ ] **Step 1: Implement the blocking branch**

Edit `src/contexts/TenantConfigContext.tsx`:

1. Import the error and `isResolvedConfig`:

```ts
import { isResolvedConfig } from '../types/tenantConfig';
import { CountryConfigError } from '../lib/country/resolveCountryConfig';
```

2. Add a `configError` state:

```ts
  const [configError, setConfigError] = useState<string | null>(null);
```

3. In `loadConfig`, replace the `try/catch` body so a `CountryConfigError` (or an unresolved config) sets the error rather than silently substituting US:

```ts
    try {
      setIsLoading(true);
      setConfigError(null);
      const tenantConfig = await getTenantConfig(tenantId);
      if (!isResolvedConfig(tenantConfig)) {
        // Required jurisdiction keys never resolved → block, don't render US (D2/D3).
        setConfigError('This tenant is not configured for its country.');
        setConfig(DEFAULT_TENANT_CONFIG);
        return;
      }
      setConfig(tenantConfig);
    } catch (err) {
      if (err instanceof CountryConfigError) {
        logger.error('Tenant country config unresolved (fail-loud):', err);
        setConfigError('This tenant is not configured for its country.');
        setConfig(DEFAULT_TENANT_CONFIG);
        return;
      }
      logger.error('Failed to load tenant config:', err);
      setConfig(DEFAULT_TENANT_CONFIG);
    } finally {
      setIsLoading(false);
    }
```

4. Render the blocking state when `configError` is set and we have a tenant (do not block portal/login where `tenantId` is undefined). Wrap the provider return:

```ts
  if (configError && tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-danger">Tenant not configured</h1>
          <p className="mt-2 text-sm text-surface-muted">{configError}</p>
        </div>
      </div>
    );
  }
```

> Uses semantic tokens (`bg-surface`, `text-danger`, `text-surface-muted`) per DESIGN.md — no raw colors. The exact markup is a UI-area concern; the **load-bearing** requirement is that an unresolved config blocks rather than silently rendering. Hand the styling polish to the `ui-ux-pro-max`/`frontend-design` sibling area if a richer empty-state is wanted.

- [ ] **Step 2: Verify**

Run: `bash scripts/check-tsc.sh`
Expected: `0`. (Component render test deferred to the UI sibling area; the catch-branch logic is the contract this area owns.)

- [ ] **Step 3: Commit**

```bash
git add src/contexts/TenantConfigContext.tsx
git commit -m "feat(country): block render on unresolved tenant country config (no silent US)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task F — Worked end-to-end proof: add a new country key with ZERO schema change

A test that *proves* a new key ships as one registry array-push and resolves through the cascade with no migration, no types regen, no trigger edit. This is the acceptance gate for "table → engine."

**Files:**
- Test: `src/lib/country/registry.test.ts` (append)

- [ ] **Step 1: Write the proof test**

Append to `src/lib/country/registry.test.ts` (so it lives beside the registry it exercises):

```ts
import { resolveConfig, type ConfigKeyDef } from './resolveCountryConfig';
import { z } from 'zod';

describe('§4.7 worked example — a NEW country key ships with ZERO schema change', () => {
  it('a registry entry alone makes a new per-country key resolvable through the cascade', () => {
    // Simulate the ONLY change a new key requires: one registry entry. In prod
    // this is a literal array push to COUNTRY_CONFIG_REGISTRY; here we build a
    // throwaway registry to prove no schema/types/trigger change is involved.
    const newKey: ConfigKeyDef = {
      key: 'document.national_id_label',
      domain: 'document',
      label: 'National ID label',
      description: 'Civil Number (OM) / Emirates ID (AE) / National ID (default).',
      schema: z.string(),
      codedDefault: 'National ID',
    } as ConfigKeyDef;

    const reg = { 'document.national_id_label': newKey };

    // Coded default when no country sets it:
    expect(resolveConfig<string>(reg, {}, 'document.national_id_label')).toBe('National ID');

    // Per-country value (what an admin would write into geo_countries.country_config,
    // which lands in the resolved snapshot → the country layer) — NO migration:
    expect(
      resolveConfig<string>(reg, { country: { 'document.national_id_label': 'Civil Number' } }, 'document.national_id_label'),
    ).toBe('Civil Number');

    // A tenant override (UAE entity) still wins at the tenant altitude:
    expect(
      resolveConfig<string>(
        reg,
        { country: { 'document.national_id_label': 'Civil Number' }, tenant: { 'document.national_id_label': 'Emirates ID' } },
        'document.national_id_label',
      ),
    ).toBe('Emirates ID');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/lib/country/registry.test.ts --project node`
Expected: PASS (green). This is executable proof the engine satisfies the Phase-1 exit criterion ("a new country config key ships with ZERO schema change").

> The full DB-level version of this proof (actually pushing the key into a live `geo_countries.country_config`, bumping `config_version`, calling `resync_tenant_country_config`, reading it back through `fetchTenantConfig`) is a **Phase-1 exit-verification step owned by the migration/onboarding sibling area** (Area 2). This unit-level proof covers the code-engine contract.

- [ ] **Step 3: Commit**

```bash
git add src/lib/country/registry.test.ts
git commit -m "test(country): prove zero-schema-change key addition (§4.7 worked example)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Area 1 — verification before completion

1. `npx vitest run src/lib/country/resolveCountryConfig.test.ts src/lib/country/registry.test.ts src/lib/country/buildConfigLayers.test.ts src/lib/tenantConfigService.test.ts --project node` → all green (paste the summary line).
2. `bash scripts/check-tsc.sh` → prints `0`.
3. `git grep -nE "\|\| '\\$'|\|\| 'USD'|\|\| 'en-US'|\|\| 'MM/DD/YYYY'" src/lib/tenantConfigService.ts` → **no hits** on the engine read path (`mapRowToConfig` legacy mapper may retain them until Phase 2; the new `resolveTenantConfigFromLayers` + `fetchTenantConfig` path must be clean).
4. `git grep -n "Symbol.for('country-config.required')" src/` → exactly the ONE declaration in `tenantConfig.ts`.
5. `git grep -n "export const STATUTORY_KEYS"` → confirms `STATUTORY_KEYS` is exported from `src/lib/country/registry.ts` (the parity-gate source for the migration-4 trigger).

### Area 1 — dependency & sequencing notes

- **Hard prerequisite:** migrations `country_engine_geo_country_config_bag`, `country_engine_hierarchy_foundation`, `country_engine_sync_and_resync` applied and `database.types.ts` regenerated. If `check-tsc.sh` flags an unknown column/RPC, **block on the migration; never `as any`**.
- **Independent of** the reference-data generator, the override-governance trigger, and the onboarding edge-function (Area 2) — those are sibling areas. This area only **exports `STATUTORY_KEYS`** for the migration-4 parity gate to consume.
- **Order within this area:** A → B (B imports A) → C → D (D imports A/B/C) → E (E imports A) → F. Tasks A, B, C have no inter-task dependency beyond A→B; D, E, F depend on A/B/C.

---

## Area 2 — Geo reference-data population + fail-loud onboarding (code, post-migration)

> **Skill gate (CLAUDE.md):** before any task, load **`using-superpowers`** → it routes to **`test-driven-development`** (backend/logic + data tooling) and, for the wizard step edits (AccountStep/LocationStep/JurisdictionStep), **`ui-ux-pro-max`** + **`frontend-design`**. Announce each load. The wizard JSX is *mechanical de-hardcoding + one new conditional step*, not a redesign — keep the existing dark-glass visual language; do **not** internationalize the wizard JSX (YAGNI per §9.2).

**Assumptions (verified against live DB `ssmbegiyjivrcwgcqutu`, 2026-06-15):**
- 58 countries, all `is_active`; **42 active stubs**, only **16** carry a 3-letter `currency_code`; `address_format='{}'` and `phone_format IS NULL` for **all 58**. `master_currency_codes` has 35 active codes.
- `country-config-completeness` CI job **already exists** at `ci.yml:89-103`, `continue-on-error: true` (report-only), running `scripts/check-active-country-config.sql` via `psql … -f`.
- **D6 already landed** (Phase 0): `onboarding_progress` already has `user_id`+`deleted_at`; `provision-tenant:330-335` already fail-loud on the onboarding insert. So my onboarding task does **not** re-do D6 — it does the *remaining* §9 work.
- **OTP is partly wired, NOT dead:** `tenantService.sendOtp/verifyOtp` (verified present) → working `send-otp-email` edge fn over `signup_otps`. The gap is the wizard never *calls* them (no `emailVerified` gate) and `provision-tenant` never re-verifies. **This diverges from spec §9.5's `send_signup_otp`/`verify_signup_otp` DB RPCs** — I deliberately wire the existing working edge-function path instead of building duplicate RPCs (less surface, already SMTP-proven). Flag this divergence in the PR; if the reviewer wants DB RPCs, that's a separate task.
- `signup_otps` has no `consumed_at`/verification-token column → server-side single-use re-check needs one additive column (a small migration in the onboarding task, owned here since no migration in the bundle touches `signup_otps`).
- Slug check diverges: `useOnboardingFlow.ts:126` omits `.is('deleted_at', null)`; server `provision-tenant:152` includes it.
- No `geoCountryService` exists; countries are queried inline in the wizard hook and `LocationStep`.
- Tooling: `npm run db:types` regen, `npm run check:tsc`, `vitest run`. Vitest mock idiom = `const { rpc, from } = vi.hoisted(...); vi.mock('./supabaseClient', () => ({ supabase: { rpc, from } }))`. zod 4 installed. **No** `tsx`/CLDR/`date-holidays`/`libphonenumber-js` yet.
- **Migrations are already applied** (per task instructions): migration 1 (`geo_countries.country_config`/`config_version`/`config_status`/`weekend_days`/`reference_dataset_version`); migration 2 (`legal_entities`+promoted `branches`+nullable scope FK cols+session helpers+`enforce_onboardable_country` is owned by the program-track provisioning RPCs); migration 3 (extended `sync_tenant_config_from_country` with `ui_language`). **This area additionally relies on the program-track RPCs `seed_new_tenant(p_tenant_id)` + `seed_number_sequences(p_tenant_id)`** (spec §9.6/§3j) — the edge-fn + backfill call them; if they are not yet present, block on the provisioning migration. My code reads/calls these. Regen `database.types.ts` only after the *one* small migration I own (`signup_otps.consumed_at`).

### File map (this area)

- `scripts/country-engine/build-geo-seed.ts` (NEW — deterministic CLDR/ISO/libphonenumber/address/tz/date-holidays → `geo_countries_seed.generated.sql` generator)
- `scripts/country-engine/build-geo-seed.test.ts` (NEW — pure-transform TDD)
- `scripts/country-engine/datasets/manifest.json` (NEW — pinned dataset version manifest)
- `supabase/seeds/geo_countries_seed.generated.sql` (NEW — GENERATED artifact)
- `scripts/check-geo-completeness.sql` (NEW — stricter no-stub gate)
- `scripts/check-active-country-config.sql` (EXISTING Phase-0 gate — referenced, kept in lockstep)
- `.github/workflows/ci.yml` (MODIFY — flip `country-config-completeness` `continue-on-error` true→false; add `check-geo-completeness` step)
- `package.json` (MODIFY — add devDeps + scripts)
- `src/lib/geoCountryService.ts` (+ `.test.ts`) (NEW — typed reader)
- `src/pages/auth/onboarding/onboardingValidation.ts` (+ `.test.ts`) (NEW — pure helpers)
- `src/pages/auth/onboarding/constants.ts` (MODIFY — `OnboardingFormData` + schemas)
- `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts` (+ `.test.ts`) (MODIFY/NEW)
- `src/pages/auth/onboarding/steps/AccountStep.tsx` / `LocationStep.tsx` (MODIFY) / `JurisdictionStep.tsx` (NEW)
- `src/lib/tenantService.ts` (MODIFY — payload)
- `supabase/functions/provision-tenant/index.ts` (MODIFY) + `provisionGuards.ts` (+ `.test.ts`) (NEW)
- `supabase/functions/send-otp-email/index.ts` (REFERENCE)
- `src/types/database.types.ts` (REGEN after `signup_otps.consumed_at` — never hand-edit)

### Part A — Geo reference-data SEED + ENFORCING no-stub gate

> Goal: a **deterministic, repeatable generator** that populates ~all `geo_countries` config columns + the `country_config` bag from MAINTAINED datasets, emitting an idempotent SQL seed; then flip the existing report-only CI gate to ENFORCING once the data lands. Holidays (`geo_public_holidays`) are **out of Phase-1 scope** (Phase 3). Phase 1 scope is **formatting-ready** config, not statutory.

#### Task A1 — Add the seed-generator toolchain (devDeps + npm scripts)

**Files:** `package.json`

- [ ] **Step 1:** Add to `package.json` `scripts`: `"geo:build-seed": "tsx scripts/country-engine/build-geo-seed.ts"`, `"geo:check": "tsx scripts/country-engine/check-geo-seed.ts"` (the check wrapper is added in A4). Add **devDependencies**: `tsx`, `cldr-core`, `cldr-numbers-full`, `cldr-dates-full`, `libphonenumber-js`, `i18n-postal-address`, `date-holidays` (`date-holidays` installed now even though holiday *ingest* is Phase 3 — it is a CI-only seeder dep; mark it clearly). Run `npm install`.
- [ ] **Step 2 (verify):** `npx tsx --version` prints a version; `node -e "require('cldr-core/supplemental/weekData.json')"` exits 0 (proves the keystone dataset resolves).
- [ ] **Step 3: Commit** — `chore(geo): add maintained-dataset seed-generator toolchain (CLDR/ISO/libphonenumber/date-holidays)`.

#### Task A2 — Pure transform `buildCountryConfigRow(...)` → config bag (TDD)

**Files:** `scripts/country-engine/build-geo-seed.ts` (NEW), `scripts/country-engine/build-geo-seed.test.ts` (NEW)

- [ ] **Step 1 — failing test.** `build-geo-seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCountryConfigRow, MissingReferenceError } from './build-geo-seed';

const OMAN_INPUTS = {
  iso: { alpha2: 'OM', alpha3: 'OMN', name: 'Oman', currency: 'OMR', currencyMinorUnits: 3 },
  cldr: { localeCode: 'ar-OM', dateFormat: 'dd/MM/yyyy', decimalSeparator: '.', groupSeparator: ',', firstDay: 6, weekendDays: [5, 6], numberingSystem: 'latn', currencySymbol: 'ر.ع.' },
  phone: { code: '+968', format: 'XXXX XXXX' },
  address: { lines: ['%N', '%O', '%A', '%C %Z'] },
};

describe('buildCountryConfigRow', () => {
  it('maps CLDR/ISO into a complete formatting-ready row (no US fabrication)', () => {
    const row = buildCountryConfigRow(OMAN_INPUTS);
    expect(row.currency_code).toBe('OMR');
    expect(row.decimal_places).toBe(3);          // ISO 4217 minor units, not 2
    expect(row.locale_code).toBe('ar-OM');
    expect(row.week_starts_on).toBe(6);          // CLDR firstDay, not 0
    expect(row.config_status).toBe('formatting_ready');
    expect(row.country_config.datetime.weekend_days).toEqual([5, 6]); // GCC weekend (D15)
    expect(row.address_format).not.toEqual({});  // no longer empty (D3)
    expect(row.phone_format).toBe('XXXX XXXX');  // libphonenumber (D3)
    expect(row.data_source).toBe('cldr+iso4217+libphonenumber');
  });
  it('fails LOUD when the currency keystone is missing (never defaults to USD)', () => {
    const bad = { ...OMAN_INPUTS, iso: { ...OMAN_INPUTS.iso, currency: undefined } };
    expect(() => buildCountryConfigRow(bad as never)).toThrow(MissingReferenceError);
  });
});
```

- [ ] **Step 2 — run to fail:** `npx vitest run scripts/country-engine/build-geo-seed.test.ts` → FAIL: cannot resolve `./build-geo-seed`.
- [ ] **Step 3 — minimal impl** in `build-geo-seed.ts`: export `MissingReferenceError extends Error`; export pure `buildCountryConfigRow(inputs)` returning the typed row (the 35 columns + `country_config` jsonb + provenance `data_source`/`source_version`/`config_status`). Fail-loud: throw `MissingReferenceError` if `iso.currency`/`cldr.localeCode`/`cldr.firstDay` absent. `config_status='formatting_ready'` when currency+locale+date+tz+phone+address all present, else `'stub'`. Map `decimal_places` from ISO 4217 minor units; `week_starts_on` from CLDR `firstDay`; `country_config.datetime.weekend_days` from CLDR `weekendDays`; `digit_grouping` from numberingSystem (`'3'` western default, `'3;2'` for `ms-IN`-style). **No dataset I/O in this function** — it is the unit-testable transform; the I/O wrapper is A3.
- [ ] **Step 4 — run to pass:** same command → 2 passed.
- [ ] **Step 5 — commit:** `feat(geo): pure CLDR/ISO→config-bag transform with fail-loud on missing reference data`.

#### Task A3 — Dataset-IO wrapper + emit idempotent `geo_countries_seed.generated.sql`

**Files:** `scripts/country-engine/build-geo-seed.ts` (extend with `main()`), `scripts/country-engine/datasets/manifest.json` (NEW), `supabase/seeds/geo_countries_seed.generated.sql` (GENERATED)

- [ ] **Step 1 — failing test (emitter is pure).** Add to `build-geo-seed.test.ts`:

```ts
import { emitSeedSql } from './build-geo-seed';
it('emits an idempotent per-column upsert that respects source_locked', () => {
  const sql = emitSeedSql([{ code: 'OM', currency_code: 'OMR', /* …minimal row… */ } as never]);
  expect(sql).toContain('INSERT INTO public.geo_countries');
  expect(sql).toContain('ON CONFLICT (code) DO UPDATE');
  expect(sql).toContain('WHERE geo_countries.source_locked IS NOT TRUE'); // curated GCC overrides preserved
  expect(sql).toContain("country_config = geo_countries.country_config ||"); // jsonb merge, not replace
});
```

- [ ] **Step 2 — run to fail** → `emitSeedSql` not exported.
- [ ] **Step 3 — impl:** `emitSeedSql(rows)` renders one idempotent `INSERT … ON CONFLICT (code) DO UPDATE SET … WHERE geo_countries.source_locked IS NOT TRUE`, jsonb-merging `country_config` with `||`, stamping `data_source`/`source_version`/`reference_dataset_version`. Add `async main()` that reads the pinned datasets (versions from `datasets/manifest.json`), iterates the ~195 ISO countries, calls `buildCountryConfigRow`, and **writes** `supabase/seeds/geo_countries_seed.generated.sql`. Guard `main()` behind `import.meta.url === ...` so the test never runs I/O. (NOTE: `source_locked`/`data_source`/`source_version` are emitted columns expected on `geo_countries`; if migration 1's authored set did not include them, add them in this area's owned `signup_otps`-adjacent migration or the seed migration before applying — confirm against regenerated types.)
- [ ] **Step 4 — run to pass** → passed. Then run the generator for real: `npm run geo:build-seed` → file written; spot-check it covers OM/SA/AE/US/JP/IN with real (non-`$`) config.
- [ ] **Step 5 — apply the seed to live DB** via `mcp__supabase__apply_migration` (name `populate_geo_countries_reference_data`) pasting the generated SQL body (the generated `.sql` is the source artifact; the migration is how it lands per project discipline). **Then** `mcp__supabase__execute_sql`:

```sql
SELECT count(*) FILTER (WHERE is_active AND (currency_code IS NULL OR char_length(currency_code)<>3
  OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL OR phone_format IS NULL
  OR address_format='{}'::jsonb)) AS remaining_stubs FROM geo_countries;
```
Expected: `0` for every country we intend to keep `is_active=true`. Any country the dataset cannot fully resolve → set `is_active=false` in the same migration (never ship a half-stub active).

- [ ] **Step 6 — regen types:** `npm run db:types`; `npm run check:tsc` → 0; append the migration to `supabase/migrations.manifest.md`; `bash scripts/check-schema-drift.sh` → no diff.
- [ ] **Step 7 — commit:** `feat(geo): populate geo_countries from maintained datasets (replaces name+code-only seed; closes D3 data load)`.

#### Task A4 — Stricter `check-geo-completeness.sql` + flip the CI gate to ENFORCING

**Files:** `scripts/check-geo-completeness.sql` (NEW), `.github/workflows/ci.yml` (MODIFY), `scripts/check-active-country-config.sql` (note)

- [ ] **Step 1 — write the stricter gate** `scripts/check-geo-completeness.sql`:

```sql
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.geo_countries
  WHERE is_active = true AND deleted_at IS NULL
    AND (currency_code IS NULL OR char_length(currency_code) <> 3
         OR locale_code IS NULL OR date_format IS NULL OR timezone IS NULL
         OR phone_format IS NULL OR address_format = '{}'::jsonb);
  IF bad > 0 THEN
    RAISE EXCEPTION 'check-geo-completeness: % active country row(s) are stubs (missing currency/locale/date/timezone/phone/address)', bad;
  END IF;
END $$;
```

- [ ] **Step 2 — prove it is green now** (data landed in A3): `mcp__supabase__execute_sql` with the `SELECT count(*)` body → expected `0`.
- [ ] **Step 3 — make the existing gate ENFORCING.** In `ci.yml` `country-config-completeness` job (`:89-103`): remove `continue-on-error: true` (line 93) and its `# Phase 0 report-only` comment; add a second step running `scripts/check-geo-completeness.sql` with the same `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f …` invocation + the same `SUPABASE_DB_URL == ''` skip guard (Dependabot/fork parity). The Phase-0 `check-active-country-config.sql` stays as the looser inner check; both run.
- [ ] **Step 4 — verify the flip catches regressions:** reason-check via a read-only assertion (the stricter `SELECT` returns `>0` if any active country had a NULL phone). **No live mutation** — this is a reasoning check the PR notes.
- [ ] **Step 5 — commit:** `ci(geo): enforce no-stub country-config gate (remove continue-on-error) + stricter completeness check`.

### Part B — Fail-loud, deterministic, country-driven onboarding (design §9)

> Build on the existing 4-step wizard + `tenantService` + `provision-tenant` + `sync_tenant_config_from_country()` — do **not** replace them. The migrations (`seed_new_tenant`, `enforce_onboardable_country`, extended sync, `legal_entities`) are already applied; this part is the **code** that calls/honors them. Order: pure helpers first (TDD-friendly), then the edge-fn guards, then UI wiring.

#### Task B1 — Pure onboarding helpers (filter / validate / language default) — TDD

**Files:** `src/pages/auth/onboarding/onboardingValidation.ts` (NEW), `…onboardingValidation.test.ts` (NEW)

- [ ] **Step 1 — failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { filterOnboardableCountries, validateTaxNumber, resolveUiLanguageDefault, shouldShowJurisdictionStep } from './onboardingValidation';

describe('filterOnboardableCountries', () => {
  it('keeps only currency-bearing active countries (fail-loud, D2/D3)', () => {
    const out = filterOnboardableCountries([
      { id: '1', code: 'OM', currency_code: 'OMR', is_active: true },
      { id: '2', code: 'XX', currency_code: null,  is_active: true },
    ] as never);
    expect(out.map(c => c.code)).toEqual(['OM']);
  });
});
describe('validateTaxNumber', () => {
  it('accepts any non-empty when the reference format is missing (our gap, not theirs)', () => {
    expect(validateTaxNumber(null, 'OM12345')).toEqual({ ok: true });
  });
  it('rejects empty when a tax system requires it', () => {
    expect(validateTaxNumber(null, '').ok).toBe(false);
  });
  it('validates against the format regex when present', () => {
    expect(validateTaxNumber('^[0-9]{15}$', '300000000000003').ok).toBe(true);
    expect(validateTaxNumber('^[0-9]{15}$', 'abc').ok).toBe(false);
  });
});
describe('resolveUiLanguageDefault', () => {
  it('maps the country language to the supported en|ar union, never US-default', () => {
    expect(resolveUiLanguageDefault('ar')).toBe('ar');
    expect(resolveUiLanguageDefault('fr')).toBe('en'); // conservative fallback to en (supported), NOT a throw
  });
});
describe('shouldShowJurisdictionStep', () => {
  it('renders only when the country has a real tax system', () => {
    expect(shouldShowJurisdictionStep('VAT')).toBe(true);
    expect(shouldShowJurisdictionStep('NONE')).toBe(false);
    expect(shouldShowJurisdictionStep(null)).toBe(false);
  });
});
```

- [ ] **Step 2 — run to fail** → import unresolved.
- [ ] **Step 3 — minimal impl** of the four pure helpers. `validateTaxNumber(format, value)` returns `{ ok: boolean; message? }`. `resolveUiLanguageDefault(langCode)` maps to `'ar'` for `'ar'`, else `'en'` (the app's supported union per §9.2).
- [ ] **Step 4 — run to pass** → all passed.
- [ ] **Step 5 — commit:** `feat(onboarding): pure country-filter + tax-number + ui-language helpers (fail-loud)`.

#### Task B2 — `geoCountryService` reader (single source for wizard countries) — TDD

**Files:** `src/lib/geoCountryService.ts` (NEW), `src/lib/geoCountryService.test.ts` (NEW)

- [ ] **Step 1 — failing test** (mock `./supabaseClient` with the `vi.hoisted({rpc,from})` idiom). Assert `listOnboardableCountries()` selects `is_active=true` + `.is('deleted_at', null)` + filters out null-currency rows via `filterOnboardableCountries`, and selects the columns the Location/Jurisdiction steps need (`language_code, tax_system, tax_label, tax_number_label, tax_number_format, fiscal_year_start, timezone`).
- [ ] **Step 2 — run to fail** → not exported.
- [ ] **Step 3 — impl** `geoCountryService.listOnboardableCountries()` returning typed `Database['public']['Tables']['geo_countries']['Row']` projections; reuse `filterOnboardableCountries`. List query (no `maybeSingle()`).
- [ ] **Step 4 — run to pass.**
- [ ] **Step 5 — commit:** `feat(geo): geoCountryService.listOnboardableCountries (currency-bearing only)`.

#### Task B3 — Wire wizard hook: slug parity + currency filter + emailVerified gate — TDD

**Files:** `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts`, `…/constants.ts`, `…/useOnboardingFlow.test.ts` (NEW)

- [ ] **Step 1 — extend `OnboardingFormData`/`DEFAULT_FORM_DATA`/schemas** in `constants.ts`: add `uiLanguage: string`, `legalEntityType: string`, `taxNumber: string`, `fiscalYearStart: string`, `timezone: string`, `emailVerified: boolean`. Add a `jurisdictionSchema` (validates tax number via `validateTaxNumber` shape — soft when format empty).
- [ ] **Step 2 — failing test** `useOnboardingFlow.test.ts` against extracted pure predicates (avoid full React render): export `canAdvanceFromAccount(formData)` (true only when `emailVerified`) and `slugQuery(builder)` semantics. Assert: account step blocks `nextStep` until `emailVerified`; the country source uses `geoCountryService` (mock) so the dropdown is currency-filtered.
- [ ] **Step 3 — run to fail.**
- [ ] **Step 4 — impl in the hook:**
  - **Slug parity:** add `.is('deleted_at', null)` to the slug check at `:126` (matches server authority `provision-tenant:152`, §9.7).
  - **Country source:** replace the inline `supabase.from('geo_countries')…` at `:82-96` with `geoCountryService.listOnboardableCountries()` (currency-filtered → satisfies §9.4 dropdown filter).
  - **Email gate:** in `nextStep`, when `step===2` (account) require `formData.emailVerified === true` (set `errors.email='Please verify your email'` otherwise). `submit` already runs after step 2.
  - **ui_language passthrough:** thread `uiLanguage` (default from `resolveUiLanguageDefault(selectedCountry.language_code)`, overridable) into the `createTenant` payload; send `null` unless the user changed it (honor sync default, §9.2).
- [ ] **Step 5 — run to pass; `npm run check:tsc` → 0.**
- [ ] **Step 6 — commit:** `feat(onboarding): slug deleted_at parity + currency-filtered countries + emailVerified gate + ui_language`.

#### Task B4 — AccountStep OTP wiring (use the EXISTING working edge fn) — TDD-light

**Files:** `src/pages/auth/onboarding/steps/AccountStep.tsx`, `src/lib/tenantService.ts` (no change — `sendOtp/verifyOtp` exist)

- [ ] **Step 1 — failing test:** add a small pure `otpCodeIsValidShape(code)` (6 digits) helper + test (the network calls go through existing `tenantService.sendOtp/verifyOtp`, already covered by the edge fn — do not re-test SMTP). The unit seam is the 6-digit-input + verified-state reducer.
- [ ] **Step 2 — run to fail / pass** the shape helper.
- [ ] **Step 3 — UI wiring (frontend-design + ui-ux-pro-max loaded):** after the email field, add a "Send code" button → `tenantService.sendOtp(formData.email, formData.companyName)`; a 6-box code input → on 6 digits call `tenantService.verifyOtp(email, code)`; on `true` set `updateField('emailVerified', true)` and lock the email field with a verified checkmark. Disable **Continue** until `emailVerified`. Keep the existing dark-glass styling + framer-motion entrance; reuse `inputClasses`. No new icon library (lucide only).
- [ ] **Step 4 — `npm run check:tsc` → 0.**
- [ ] **Step 5 — commit:** `feat(onboarding): wire AccountStep email OTP (send/verify) gating Continue on verified`.

#### Task B5 — LocationStep Language control + JurisdictionStep (conditional) — UI

**Files:** `…/steps/LocationStep.tsx`, `…/steps/JurisdictionStep.tsx` (NEW), `…/constants.ts` (step list), `…/hooks/useOnboardingFlow.ts` (step routing)

- [ ] **Step 1 — LocationStep:** add a "Interface language" segmented control (en | ar) pre-filled from `selectedCountry.language_code` via `resolveUiLanguageDefault`, writing `updateField('uiLanguage', …)`. Pure default already tested in B1.
- [ ] **Step 2 — JurisdictionStep (NEW), rendered only when `shouldShowJurisdictionStep(selectedCountry.tax_system)`:** capture legal-entity type (select), tax/VAT registration number (label = `selectedCountry.tax_number_label`, soft-validated via `validateTaxNumber(selectedCountry.tax_number_format, value)`), fiscal-year-start confirmation (default from country), timezone (default from country). Persist into `formData` → `createTenant` payload → primary `legal_entities` (written by `seed_new_tenant`, Task B6). Match wizard visual language.
- [ ] **Step 3 — step routing:** insert the conditional jurisdiction step after Location in `OnboardingWizard`/hook (skip index when `tax_system IN (NULL,'NONE')` so single-country OMR-style flows are unchanged in length). Update `getStepFields`/`STEP_SCHEMAS` accordingly.
- [ ] **Step 4 — `npm run check:tsc` → 0; manual dogfood** with the `browse`/`run` skill optional.
- [ ] **Step 5 — commit:** `feat(onboarding): country-driven language control + conditional jurisdiction step → primary legal_entity`.

#### Task B6 — Make `provision-tenant` fail-loud + deterministic + OTP re-verify

**Files:** `supabase/functions/provision-tenant/index.ts`, `supabase/functions/provision-tenant/provisionGuards.ts` (NEW), `…/provisionGuards.test.ts` (NEW), migration `signup_otps_consumed_at`

- [ ] **Step 1 — extract + test the pure guard.** `provisionGuards.ts` exports `assertOnboardableCountry(countryData)` → throws `{ status: 422, message }` when currency/locale/date/timezone absent **or** when the formatting prerequisites are not met. For Phase-1 formatting-ready onboarding the gate is `config_status !== 'stub'` AND currency/locale/date/tz present — `statutory_ready` is enforced per-country by the DB `enforce_onboardable_country` backstop + the statutory-gate CI in Phase 3, so the edge fn asserts the *formatting* prerequisites and lets the DB trigger own the statutory class. Test both branches.
- [ ] **Step 2 — run to fail / impl / pass** the guard test (`npx vitest run supabase/functions/provision-tenant/provisionGuards.test.ts`). (Vitest can import the pure `.ts`; it has no Deno globals.)
- [ ] **Step 3 — migration** `mcp__supabase__apply_migration` name `signup_otps_consumed_at`: `ALTER TABLE public.signup_otps ADD COLUMN IF NOT EXISTS consumed_at timestamptz;` (single-use server re-check). Regen types; `check:tsc` 0; manifest row; schema-drift no diff.
- [ ] **Step 4 — edit `index.ts`:**
  - After `countryData` fetch (`:263-267`) extend the select to include `config_status, language_code, tax_system, tax_number, fiscal_year_start`; call `assertOnboardableCountry(countryData)`; on throw → **soft-delete** the tenant (`update({deleted_at})`, never `.delete()`) and return **422** "This country is not yet available for onboarding…".
  - **Delete the silent fallbacks** at `:305-312` (`|| 'en-US'`, `|| 'USD'`, `|| '$'`, `|| 'before'`, `|| '.'`, `|| ','`, `|| 'DD/MM/YYYY'`) and the company-settings `|| null` US-shaped ones — pass resolved values or fail (the data is now non-stub from Part A, so they resolve).
  - **Convert the two `.delete()` rollbacks** at `:223` and `:240` to `update({ deleted_at: new Date().toISOString() })` (soft-delete rule).
  - **Server-side OTP re-verify** (self-service flow only; admin-provisioned bypasses as today): before creating the auth user, re-check `signup_otps` for a `verified=true, consumed_at IS NULL, expires_at > now()` row for the email; on success set `consumed_at=now()` (single-use); on miss return 422. (Mirrors send-otp-email's verify select.)
  - **Call `seed_new_tenant(tenant.id)` once** (replacing the ad-hoc `accounting_locales`/`onboarding_progress` inserts) — it seeds `tenant_currencies` is_base FIRST, `number_sequences`, primary `legal_entities` (from the jurisdiction payload), `Main` branch, `onboarding_progress`. Keep the existing fail-loud-on-onboarding behavior (already present `:330-335`).
  - **`ui_language` passthrough:** insert `ui_language` into the `tenants` insert only when the wizard overrode it (else NULL → sync trigger sets it, §9.2).
- [ ] **Step 5 — verify on a Supabase branch (no live mutation of prod):** deploy the edge fn to a branch; exercise: stub country → 422, tenant soft-deleted (no live row); a populated country → 1 tenant + 1 legal_entity + 1 Main branch + 1 onboarding_progress + tenant_currencies is_base; OTP request→verify→provision round-trips and the OTP is single-use (second provision with same code → 422).
- [ ] **Step 6 — commit:** `feat(onboarding): fail-loud provisioning gate + soft-delete rollbacks + deterministic seed + single-use OTP re-verify`.

#### Task B7 — Backfill the 2 live OMR tenants (deterministic seed) — one-time

**Files:** migration `backfill_seed_existing_tenants` (idempotent `DO` loop)

- [ ] **Step 1 — pre-check** `mcp__supabase__execute_sql`: confirm both live tenants carry **real OMR** identity (`currency_code='OMR'`, `tenant_currencies.is_base='OMR'`) — already verified (2 OMR, 2 base rows). This satisfies the §2A.8 real-currency precondition *before* collapse.
- [ ] **Step 2 — migration:** a guarded idempotent `DO` loop calling `seed_new_tenant(id)` for each `tenants WHERE deleted_at IS NULL AND country_id IS NOT NULL`; tenants with `country_id IS NULL` left untouched + raised as a notice (fail-loud, never guess). `seed_new_tenant` is idempotent, so re-runs are safe.
- [ ] **Step 3 — verify:** `SELECT count(*) FROM onboarding_progress` → was 0, now **2** (closes the live-data side of D6); each tenant has exactly 1 `legal_entities` (`is_primary`) + 1 `branches` (`code='MAIN'`); visible invoice/case row-counts unchanged (forensic invariant).
- [ ] **Step 4 — commit:** `feat(onboarding): backfill 2 live OMR tenants via deterministic seed_new_tenant (onboarding_progress 0→2)`.

### Area 2 — verification before completion

- `geo_countries` populated from maintained datasets for every `is_active` country (0 stubs under `check-geo-completeness.sql`); unprepared countries set `is_active=false`; the generator is repeatable (`npm run geo:build-seed` is deterministic + idempotent).
- `country-config-completeness` CI gate **enforcing** (`continue-on-error` removed) + stricter `check-geo-completeness.sql` added; both green.
- Provisioning rejects an unprepared/stub country with a **422 + soft-deleted tenant** (no live row); a populated country provisions with the full deterministic seed (`tenant_currencies` is_base FIRST → `number_sequences` → primary `legal_entities` → `Main` branch → `onboarding_progress`).
- Wizard: slug check matches server (`deleted_at` filter), country dropdown currency-filtered, **email OTP gates Continue** (existing edge-fn path wired), Language control + conditional Jurisdiction step capture `ui_language` + tax identity → primary `legal_entities`.
- The 2 live OMR tenants backfilled (`onboarding_progress` 0→2; 1 entity + 1 Main BU each; visible-row-count invariant holds).
- No surviving `'$'`/`'USD'`/`'en-US'`/`'MM/DD/YYYY'` fallback in `provision-tenant`; `npm run check:tsc` 0; schema-drift no diff; manifest rows added for `populate_geo_countries_reference_data`, `signup_otps_consumed_at`, `backfill_seed_existing_tenants`.

### Area 2 — notable divergences from spec (flag in PR)

1. **OTP:** wire the **existing working `send-otp-email` edge fn + `tenantService.sendOtp/verifyOtp`** instead of building new `send_signup_otp`/`verify_signup_otp` DB RPCs (§9.5). Rationale: the path already exists and is SMTP-proven; building parallel RPCs is duplicate surface. Added only `signup_otps.consumed_at` for single-use server re-verify. If the reviewer wants DB-RPC purity, that is a follow-up.
2. **D6** is already merged (Phase 0) — the D6 step is a confirming no-op here; the *remaining* value is the deterministic seed + jurisdiction capture + fail-loud gate.
3. **Holidays (`geo_public_holidays`) excluded from Phase 1** — `date-holidays` is installed as a seeder dep but the holiday ingest table + population is Phase 3 (D15). Phase-1 geo population is **formatting-ready**, not statutory.

---

## Area 3 — Dormant hierarchy foundation (code, post-migration)

> **Scope boundary.** This area is *code that sits on top of migration 2 (`country_engine_hierarchy_foundation`)*. That migration owns ALL DDL: it creates `legal_entities`, promotes `branches`, adds the session-context SQL functions (`get_current_business_unit_id`, `get_current_region_id`, `business_unit_scoping_enabled`), creates the flag-OFF `*_business_unit_isolation` policies, and runs the auto-collapse backfill. **Do not write DDL here.** Assume migration 2 is applied and `database.types.ts` is regenerated. Every task below is TS/test only, except the read-only verification SQL in Task 5 (run via `mcp__supabase__execute_sql`, never `apply_migration`).
>
> **Skill gate:** backend/logic — `using-superpowers` → `test-driven-development`. No UI in this area (the multi-entity picker UI / CreateCaseWizard entity step is a separate UI track, gated behind a ≥2-entity tenant; the entity-management modal mirrors `ManageCompaniesModal` and is also out of this area).
>
> **Dormancy contract this area must enforce by test (Q7 sign-off):** every existing tenant collapses to exactly ONE `is_primary` legal entity + ONE `MAIN` branch; live sub-unit isolation is OFF (BU policies are no-ops today); `cases`/`invoices` per-tenant visible row-count is unchanged by the collapse (the load-bearing forensic invariant, design §10c/§10h). Q4 primary-resolution is built now but only *exercised* at >1 entity — which is hard-gated behind a named multi-entity customer (Phase 4 WS-B); we ship the resolver + lock-rule logic dormant-but-correct so Phase 4 is a flag flip, not a rewrite.

**Vitest command (verified `package.json`: `"test": "vitest run"`):** `npx vitest run <path>` for a single file. Typecheck: `npm run check:tsc` (or `bash scripts/check-tsc.sh`) — must print **0 errors**.

**Live-schema facts that shape this plan (verified read-only against `ssmbegiyjivrcwgcqutu`, 2026-06-15):** 2 tenants (both OMR, real OMR identity), 31 cases, 22 invoices, **0 branches / 0 departments / 0 positions**, 6 profiles. `branches` has `is_main boolean DEFAULT false` (NOT `is_primary`) and `code text`. `tenants.feature_flags jsonb DEFAULT '{}'`. `cases.branch_id` exists. Pre-migration-2, `legal_entities`/`geo_regions`/`profiles.business_unit_id` do **not** exist — so all tasks below are gated on migration 2 being applied + types regenerated.

**Pattern anchors (clone these, do not invent):**
- Pure resolver seam: `src/lib/features/resolveFeatures.ts` (`resolveFeatureEnabled` — registry injected, dependency-free, unit-testable).
- App-facing binding + integrity test: `src/lib/features/registry.ts` (`isFeatureEnabled`) + `src/lib/features/registry.test.ts`.
- CRUD service shape: `src/lib/tenantThemeService.ts` (import `supabase` from `./supabaseClient`, import `logger` from `./logger`, throw on error, `Database` types from `../../types/database.types`).
- Supabase-mock test shape: `src/lib/companyService.test.ts` lines 1-37 (`vi.mock('./supabaseClient', …)` with a chainable `makeChain`, `vi.mock('./logger', …)`, capture payloads, assert).
- `maybeSingle()` not `single()`. Blank-uuid FK → `null` before write (companyService precedent). Soft-delete only.

### File map (this area)

- `src/lib/country/legalEntities/resolvePrimaryEntity.ts` (+ `.test.ts`) (NEW — pure Q4 primary-resolution seam)
- `src/lib/country/legalEntities/legalEntitiesService.ts` (+ `.test.ts`) (NEW — CRUD + setPrimary + listForTenant)
- `src/lib/country/legalEntities/legalEntityKeys.test.ts` (NEW)
- `src/lib/country/session/sessionScope.ts` (+ `.dormancy.test.ts`) (NEW — typed wrappers + dormancy no-op assertions)
- `src/lib/country/legalEntities/dormancy.collapse.test.ts` (NEW — consumer-contract regression lock)
- `src/lib/queryKeys.ts` (EDIT — add `legalEntityKeys` block)
- `scripts/check-dormant-hierarchy-invariant.sql` (NEW — CI-runnable assertion)

### Task 0 — Pre-flight: confirm migration 2 landed and types are regenerated (no commit)

- [ ] **Verify the foundation exists.** Run `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
SELECT
  to_regclass('public.legal_entities')                  AS legal_entities,
  to_regproc('public.get_current_business_unit_id()')   AS bu_helper,
  to_regproc('public.get_current_region_id()')          AS region_helper,
  to_regproc('public.business_unit_scoping_enabled()')  AS scoping_helper,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='profiles' AND column_name='business_unit_id') AS profiles_bu_col,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND policyname='cases_business_unit_isolation') AS bu_policy;
```
Expected: all non-null / `1` / `1`. **If any is null/0, STOP — migration 2 is incomplete; do not start this area.**

- [ ] **Confirm types regenerated.** `grep -c "legal_entities:" src/types/database.types.ts` → Expected: ≥1. If 0, the migration track owes the regen — block.

### Task 1 — Pure Q4 primary-resolution seam (`resolvePrimaryEntity.ts`), TDD

The testable heart of Q4, with **zero** supabase/React dependency (entities injected) so it is a pure unit. Encodes the Q4 rule: 1 entity → silent auto-assign; >1 → home-entity pre-select but NO silent commit (caller must confirm); lock-on-first-financial-document.

**Files:** Create `src/lib/country/legalEntities/resolvePrimaryEntity.ts`; Test `src/lib/country/legalEntities/resolvePrimaryEntity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  resolvePrimaryEntity,
  resolveCaseEntityDefault,
  isEntityLocked,
  type EntityRef,
} from './resolvePrimaryEntity';

const ksa: EntityRef = { id: 'e-ksa', is_primary: false, currency_code: 'SAR', tax_system: 'VAT' };
const omn: EntityRef = { id: 'e-omn', is_primary: true,  currency_code: 'OMR', tax_system: 'VAT' };

describe('resolvePrimaryEntity — the is_primary winner', () => {
  it('returns the single entity when a tenant has exactly one (auto-collapse case)', () => {
    expect(resolvePrimaryEntity([omn])?.id).toBe('e-omn');
  });
  it('returns the is_primary entity when several exist', () => {
    expect(resolvePrimaryEntity([ksa, omn])?.id).toBe('e-omn');
  });
  it('returns null when the list is empty (fail-loud signal, never a fabricated default)', () => {
    expect(resolvePrimaryEntity([])).toBeNull();
  });
  it('throws when more than one entity claims is_primary (uq_legal_entity_primary breach)', () => {
    expect(() => resolvePrimaryEntity([{ ...ksa, is_primary: true }, omn]))
      .toThrow(/more than one primary/i);
  });
});

describe('resolveCaseEntityDefault — Q4 silent-vs-forced-choice', () => {
  it('1 entity → silent auto-assign, requiresConfirmation=false', () => {
    const r = resolveCaseEntityDefault([omn], { homeEntityId: null });
    expect(r.entityId).toBe('e-omn');
    expect(r.requiresConfirmation).toBe(false);
  });
  it('>1 entities → pre-selects home entity but requiresConfirmation=true (no silent commit)', () => {
    const r = resolveCaseEntityDefault([ksa, omn], { homeEntityId: 'e-ksa' });
    expect(r.entityId).toBe('e-ksa');         // pre-selected, NOT committed
    expect(r.requiresConfirmation).toBe(true);
  });
  it('>1 entities and no home → falls back to primary pre-select, still requiresConfirmation=true', () => {
    const r = resolveCaseEntityDefault([ksa, omn], { homeEntityId: null });
    expect(r.entityId).toBe('e-omn');
    expect(r.requiresConfirmation).toBe(true);
  });
  it('0 entities → null entity, requiresConfirmation=false, blocked=true (cannot create a case)', () => {
    const r = resolveCaseEntityDefault([], { homeEntityId: null });
    expect(r.entityId).toBeNull();
    expect(r.blocked).toBe(true);
  });
});

describe('isEntityLocked — lock on first financial document (Q4 residual: numbered quote OR invoice)', () => {
  it('unlocked before any financial document', () => {
    expect(isEntityLocked({ hasNumberedQuote: false, hasInvoice: false })).toBe(false);
  });
  it('locked once a numbered quote exists', () => {
    expect(isEntityLocked({ hasNumberedQuote: true, hasInvoice: false })).toBe(true);
  });
  it('locked once an invoice exists', () => {
    expect(isEntityLocked({ hasNumberedQuote: false, hasInvoice: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/lib/country/legalEntities/resolvePrimaryEntity.test.ts` → FAIL `Failed to resolve import "./resolvePrimaryEntity"`.
- [ ] **Step 3: Minimal implementation** — Create `src/lib/country/legalEntities/resolvePrimaryEntity.ts`:

```ts
// Pure Q4 legal-entity primary-resolution. No supabase / React import — entities
// are injected, so this is a unit-testable seam (mirrors resolveFeatures.ts).
//
// Q4 rule (confirmed): exactly 1 entity → silent auto-assign; >1 → pre-select the
// user's home entity (else the primary) but REQUIRE explicit confirmation (never
// a silent commit); lock the entity on the first financial document.
//
// DORMANT TODAY: every tenant auto-collapses to exactly 1 entity (migration 2),
// so resolveCaseEntityDefault always takes the silent 1-entity branch in
// production. The >1 branches are exercised only by these unit tests until a
// named multi-entity customer triggers Phase 4 WS-B. We ship them correct now so
// activation is a flag flip, not a rewrite.

export interface EntityRef {
  id: string;
  is_primary: boolean;
  currency_code: string;
  tax_system: string;
}

/** The tenant's primary entity: the single is_primary row. */
export function resolvePrimaryEntity(entities: EntityRef[]): EntityRef | null {
  if (entities.length === 0) return null;
  if (entities.length === 1) return entities[0];
  const primaries = entities.filter((e) => e.is_primary);
  if (primaries.length > 1) {
    throw new Error(
      'resolvePrimaryEntity: more than one primary entity — uq_legal_entity_primary breached',
    );
  }
  return primaries[0] ?? null;
}

export interface CaseEntityDefault {
  entityId: string | null;
  /** True when the user MUST deliberately submit the entity (>1 entity tenants). */
  requiresConfirmation: boolean;
  /** True when no entity can be assigned at all → case creation is blocked. */
  blocked: boolean;
}

/** Q4: silent for 1 entity; pre-select + forced confirmation for >1. */
export function resolveCaseEntityDefault(
  entities: EntityRef[],
  ctx: { homeEntityId: string | null },
): CaseEntityDefault {
  if (entities.length === 0) return { entityId: null, requiresConfirmation: false, blocked: true };
  if (entities.length === 1) {
    return { entityId: entities[0].id, requiresConfirmation: false, blocked: false };
  }
  const home = ctx.homeEntityId && entities.some((e) => e.id === ctx.homeEntityId)
    ? ctx.homeEntityId
    : (resolvePrimaryEntity(entities)?.id ?? null);
  return { entityId: home, requiresConfirmation: true, blocked: false };
}

/** Lock boundary = first financial document issued (numbered quote OR invoice). */
export function isEntityLocked(docs: { hasNumberedQuote: boolean; hasInvoice: boolean }): boolean {
  return docs.hasNumberedQuote || docs.hasInvoice;
}
```

- [ ] **Step 4: Run to pass** — same command → all passed (13 assertions).
- [ ] **Step 5: Typecheck** — `npm run check:tsc` → 0 errors.
- [ ] **Step 6: Commit**

```bash
git checkout -b feat/hierarchy-legal-entity-primary-resolution
git add src/lib/country/legalEntities/resolvePrimaryEntity.ts src/lib/country/legalEntities/resolvePrimaryEntity.test.ts
git commit -m "feat(hierarchy): pure Q4 legal-entity primary-resolution seam (silent-1 / forced->1 / lock-on-doc)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2 — `legalEntitiesService` (CRUD + setPrimary + primary fetch), TDD

The DB-facing service. Mirrors `tenantThemeService.ts` / `companyService.ts` exactly. Soft-delete only.

**Files:** Create `src/lib/country/legalEntities/legalEntitiesService.ts`; Test `src/lib/country/legalEntities/legalEntitiesService.test.ts`

- [ ] **Step 1: Write the failing test** (clone the `companyService.test.ts` mock harness):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown>; table?: string } = {};

vi.mock('../../supabaseClient', () => {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((p: Record<string, unknown>) => { captured.insert = p; captured.table = table; return chain; });
    chain.update = vi.fn((p: Record<string, unknown>) => { captured.update = p; captured.table = table; return chain; });
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'e-1', name: 'Acme OMN', is_primary: true }, error: null }));
    chain.then = undefined;
    return chain;
  };
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});
vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { createLegalEntity, updateLegalEntity, softDeleteLegalEntity } from './legalEntitiesService';

describe('legalEntitiesService writes', () => {
  beforeEach(() => { captured.insert = undefined; captured.update = undefined; captured.table = undefined; });

  it('createLegalEntity writes to legal_entities and coerces blank uuid FKs to null', async () => {
    await createLegalEntity({
      tenant_id: 't-1', name: 'Acme OMN', country_id: 'c-omn',
      currency_code: 'OMR', tax_system: 'VAT', subdivision_id: '',
    });
    expect(captured.table).toBe('legal_entities');
    expect(captured.insert?.name).toBe('Acme OMN');
    expect(captured.insert?.subdivision_id).toBeNull(); // blank uuid → null, not a 400
  });

  it('createLegalEntity never writes a USD/empty currency (fail-loud, D2)', async () => {
    await expect(createLegalEntity({
      tenant_id: 't-1', name: 'X', country_id: 'c', currency_code: '', tax_system: 'NONE',
    })).rejects.toThrow(/currency/i);
  });

  it('softDeleteLegalEntity sets deleted_at and never issues a hard delete', async () => {
    await softDeleteLegalEntity('e-1');
    expect(captured.update).toBeDefined();
    expect(captured.update).toHaveProperty('deleted_at');
  });

  it('updateLegalEntity strips tenant_id from the patch (tenant is immutable)', async () => {
    await updateLegalEntity('e-1', { name: 'New', tenant_id: 'hacked' } as never);
    expect(captured.update).not.toHaveProperty('tenant_id');
    expect(captured.update?.name).toBe('New');
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/lib/country/legalEntities/legalEntitiesService.test.ts` → FAIL import of `./legalEntitiesService`.
- [ ] **Step 3: Minimal implementation** — Create `src/lib/country/legalEntities/legalEntitiesService.ts`:

```ts
import { supabase } from '../../supabaseClient';
import { logger } from '../../logger';
import type { Database } from '../../../types/database.types';

type LegalEntityRow = Database['public']['Tables']['legal_entities']['Row'];
type LegalEntityInsert = Database['public']['Tables']['legal_entities']['Insert'];

/** Blank-string uuid FK → null (Postgres rejects '' as uuid → 400). companyService precedent. */
const uuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;

export async function listLegalEntities(tenantId: string): Promise<LegalEntityRow[]> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false });
  if (error) { logger.error('listLegalEntities failed:', error); throw error; }
  return data ?? [];
}

export async function getPrimaryLegalEntity(tenantId: string): Promise<LegalEntityRow | null> {
  const { data, error } = await supabase
    .from('legal_entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) { logger.error('getPrimaryLegalEntity failed:', error); throw error; }
  return data;
}

export async function createLegalEntity(input: {
  tenant_id: string; name: string; country_id: string;
  currency_code: string; tax_system: string;
  subdivision_id?: string | null; tax_identifier?: string | null;
  registration_number?: string | null; is_primary?: boolean;
}): Promise<LegalEntityRow> {
  // Fail-loud (D2): a legal entity must carry a real 3-letter currency — never '' / USD placeholder.
  if (!input.currency_code || input.currency_code.length !== 3) {
    throw new Error(`createLegalEntity: unresolved currency '${input.currency_code}' — fail-loud, no USD default`);
  }
  const payload: LegalEntityInsert = {
    tenant_id: input.tenant_id,
    name: input.name,
    country_id: input.country_id,
    currency_code: input.currency_code,
    tax_system: input.tax_system,
    subdivision_id: uuidOrNull(input.subdivision_id),
    tax_identifier: input.tax_identifier ?? null,
    registration_number: input.registration_number ?? null,
    is_primary: input.is_primary ?? false,
  };
  const { data, error } = await supabase.from('legal_entities').insert(payload).select('*').maybeSingle();
  if (error) { logger.error('createLegalEntity failed:', error); throw error; }
  return data as LegalEntityRow;
}

export async function updateLegalEntity(
  id: string,
  patch: Partial<Omit<LegalEntityRow, 'id' | 'tenant_id' | 'created_at' | 'created_by'>>,
): Promise<LegalEntityRow> {
  const { tenant_id: _drop, ...safe } = patch as Record<string, unknown>; // tenant is immutable
  const { data, error } = await supabase.from('legal_entities').update(safe).eq('id', id).select('*').maybeSingle();
  if (error) { logger.error('updateLegalEntity failed:', error); throw error; }
  return data as LegalEntityRow;
}

export async function softDeleteLegalEntity(id: string): Promise<void> {
  const { error } = await supabase
    .from('legal_entities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { logger.error('softDeleteLegalEntity failed:', error); throw error; }
}
```

> **Note on `tax_identifier` vs `tax_number`:** migration 2 names the column `tax_identifier`. After migration 2 + types regen, confirm the actual column name in `database.types.ts` and align the service field — if migration 2 shipped `tax_number`, rename here. This is the one place to re-verify against the regenerated types before running the test.

- [ ] **Step 4: Run to pass** — `npx vitest run src/lib/country/legalEntities/legalEntitiesService.test.ts` → 4 passed.
- [ ] **Step 5: Typecheck** — `npm run check:tsc` → 0 errors (this is the gate that catches any column-name drift vs the regenerated types).
- [ ] **Step 6: Commit**

```bash
git add src/lib/country/legalEntities/legalEntitiesService.ts src/lib/country/legalEntities/legalEntitiesService.test.ts
git commit -m "feat(hierarchy): legalEntitiesService CRUD + primary fetch (fail-loud currency, soft-delete, tenant-immutable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3 — `legalEntityKeys` query keys, TDD

Centralize TanStack keys (CLAUDE.md: all keys in `src/lib/queryKeys.ts`).

**Files:** Edit `src/lib/queryKeys.ts`; Test `src/lib/country/legalEntities/legalEntityKeys.test.ts`

- [ ] **Step 1: Write the failing test** — Create `src/lib/country/legalEntities/legalEntityKeys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { legalEntityKeys } from '../../queryKeys';

describe('legalEntityKeys', () => {
  it('namespaces all keys under "legal_entities"', () => {
    expect(legalEntityKeys.all[0]).toBe('legal_entities');
    expect(legalEntityKeys.list('t-1')).toEqual(['legal_entities', 'list', 't-1']);
    expect(legalEntityKeys.primary('t-1')).toEqual(['legal_entities', 'primary', 't-1']);
    expect(legalEntityKeys.detail('e-1')).toEqual(['legal_entities', 'detail', 'e-1']);
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/lib/country/legalEntities/legalEntityKeys.test.ts` → FAIL `legalEntityKeys` not exported.
- [ ] **Step 3: Minimal implementation** — In `src/lib/queryKeys.ts`, append a block mirroring `companyKeys`:

```ts
export const legalEntityKeys = {
  all: ['legal_entities'] as const,
  lists: () => [...legalEntityKeys.all, 'list'] as const,
  list: (tenantId: string) => [...legalEntityKeys.all, 'list', tenantId] as const,
  primary: (tenantId: string) => [...legalEntityKeys.all, 'primary', tenantId] as const,
  detail: (id: string) => [...legalEntityKeys.all, 'detail', id] as const,
};
```

- [ ] **Step 4: Run to pass** — same command → 1 passed.
- [ ] **Step 5: Typecheck** — `npm run check:tsc` → 0 errors.
- [ ] **Step 6: Commit**

```bash
git add src/lib/queryKeys.ts src/lib/country/legalEntities/legalEntityKeys.test.ts
git commit -m "feat(hierarchy): centralize legalEntityKeys query keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4 — Session-scope wrappers DEFINED but NO-OP (`sessionScope.ts`), TDD

Typed TS wrappers that document and surface the DB session-context helpers — but whose business-unit scoping is a **provable no-op today**. The DB functions exist (migration 2); here we wrap them and **assert dormancy** so a future accidental activation fails a test.

> **Design note:** `get_current_business_unit_id()` / `get_current_region_id()` are SQL `SECURITY DEFINER` functions that read `auth.uid()` — they cannot run meaningfully in vitest (no auth session). So the TS wrapper is a thin `supabase.rpc(...)` pass-through, and the **dormancy proof is a pure unit test of the resolver predicate**, mirroring the SQL 5-clause template. We test the *logic shape*, not a live RLS round-trip (that live test is Phase-4 WS-A).

**Files:** Create `src/lib/country/session/sessionScope.ts`; Test `src/lib/country/session/sessionScope.dormancy.test.ts`

- [ ] **Step 1: Write the failing test** — Create `src/lib/country/session/sessionScope.dormancy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveBusinessUnitVisibility } from './sessionScope';

// Mirrors the SQL ADDITIONAL-RESTRICTIVE 5-clause template (design §2A.7):
//   is_platform_admin() OR NOT business_unit_scoping_enabled()
//   OR current_bu IS NULL OR row_bu IS NULL OR row_bu = current_bu
// Phase 1 ships this FLAG-OFF everywhere → every clause but the last is a no-op
// that returns visible. The collapse leaves all row_bu NULL anyway. This test is
// the dormancy lock: if scoping is ever flipped on by accident, the "flag off"
// case below stays the source of truth and these assertions guard the shape.

describe('business-unit visibility — DORMANT (flag off) today', () => {
  it('flag OFF → every row visible regardless of bu (pure no-op, the Phase-1 reality)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: false, currentBu: null, rowBu: null })).toBe(true);
    expect(resolveBusinessUnitVisibility({ scopingEnabled: false, currentBu: 'bu-x', rowBu: 'bu-y' })).toBe(true);
  });
  it('platform admin → always visible even if scoping were on', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-y', isPlatformAdmin: true })).toBe(true);
  });
  it('tenant-wide user (currentBu NULL) → sees all units even if scoping on', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: null, rowBu: 'bu-y' })).toBe(true);
  });
  it('unscoped/pre-rollout row (rowBu NULL) → visible to all even if scoping on (the collapse keeps every row here)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: null })).toBe(true);
  });
  it('FUTURE (Phase 4): scoping on + both set + mismatch → narrowed out (proves the logic is correct, not active)', () => {
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-y' })).toBe(false);
    expect(resolveBusinessUnitVisibility({ scopingEnabled: true, currentBu: 'bu-x', rowBu: 'bu-x' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/lib/country/session/sessionScope.dormancy.test.ts` → FAIL import of `./sessionScope`.
- [ ] **Step 3: Minimal implementation** — Create `src/lib/country/session/sessionScope.ts`:

```ts
import { supabase } from '../../supabaseClient';
import { logger } from '../../logger';

// ─────────────────────────────────────────────────────────────────────────────
// Session-context helpers for the DORMANT 6-level hierarchy.
//
// The DB owns the real helpers (migration 2): get_current_business_unit_id(),
// get_current_region_id(), business_unit_scoping_enabled() — profiles-primary +
// JWT fallback, mirroring get_current_tenant_id(). These TS wrappers exist so the
// app has a typed seam, but BUSINESS-UNIT ISOLATION IS OFF in Phase 1: every
// *_business_unit_isolation policy is created flag-off and is a pure no-op until
// Phase 4 WS-A flips tenants.feature_flags->>'business_unit_isolation' per a named
// multi-site customer. Do NOT use these to gate any query in Phase 1.
// ─────────────────────────────────────────────────────────────────────────────

/** Thin pass-throughs to the DB session helpers (meaningful only under an auth session). */
export async function getCurrentBusinessUnitId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_current_business_unit_id');
  if (error) { logger.error('get_current_business_unit_id rpc failed:', error); throw error; }
  return (data as string | null) ?? null;
}

export async function getCurrentRegionId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_current_region_id');
  if (error) { logger.error('get_current_region_id rpc failed:', error); throw error; }
  return (data as string | null) ?? null;
}

export interface BuVisibilityCtx {
  scopingEnabled: boolean;
  currentBu: string | null;
  rowBu: string | null;
  isPlatformAdmin?: boolean;
}

/**
 * Pure mirror of the SQL ADDITIONAL-RESTRICTIVE 5-clause BU predicate (§2A.7).
 * Returns true = row visible. With scopingEnabled=false (the Phase-1 default for
 * every tenant) this is a constant `true` — a provable no-op. The narrowing
 * branch is correct but DORMANT; it activates only when scoping is flipped on.
 */
export function resolveBusinessUnitVisibility(ctx: BuVisibilityCtx): boolean {
  if (ctx.isPlatformAdmin) return true;
  if (!ctx.scopingEnabled) return true;   // flag off ⇒ no-op (the Phase-1 reality)
  if (ctx.currentBu === null) return true; // tenant-wide user sees all units
  if (ctx.rowBu === null) return true;     // unscoped/pre-rollout rows visible to all
  return ctx.rowBu === ctx.currentBu;      // the (future) actual narrowing
}
```

> **rpc typing note:** if the regenerated `database.types.ts` does not yet type `get_current_business_unit_id`/`get_current_region_id` as RPCs (they are functions, not always emitted into the `Functions` map depending on signature), cast the rpc name as needed or add a typed overload — keep `npm run check:tsc` at 0. Do NOT hand-edit `database.types.ts`.

- [ ] **Step 4: Run to pass** — `npx vitest run src/lib/country/session/sessionScope.dormancy.test.ts` → 5 passed (the last proves the logic is *correct* while the first proves it is *inactive*).
- [ ] **Step 5: Typecheck** — `npm run check:tsc` → 0 errors.
- [ ] **Step 6: Commit**

```bash
git add src/lib/country/session/sessionScope.ts src/lib/country/session/sessionScope.dormancy.test.ts
git commit -m "feat(hierarchy): session-scope wrappers DEFINED but BU-isolation no-op (dormancy-locked by test)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5 — Collapse-invariant verification SQL + read-only DB assertion (no migration)

The load-bearing forensic invariant: after migration 2's auto-collapse, every tenant has exactly 1 primary entity + 1 MAIN branch, and `cases`/`invoices` per-tenant visible row-count is unchanged. This is a **CI-runnable SQL assertion** (run via `mcp__supabase__execute_sql` — read-only, never `apply_migration`), modeled on `scripts/check-active-country-config.sql`.

**Files:** Create `scripts/check-dormant-hierarchy-invariant.sql`

- [ ] **Step 1: Author the assertion** — Create `scripts/check-dormant-hierarchy-invariant.sql`:

```sql
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
```

- [ ] **Step 2: Run it against live DB to confirm GREEN post-collapse** — Run via `mcp__supabase__execute_sql` using the per-clause `SELECT count(*)` bodies (strip the `DO`/`RAISE`). Expected (after migration 2 collapse on the 2 OMR tenants): `bad_entities=0`, `bad_branches=0`, `orphan_tenants=0`, `live_bu_policies=0`. **If non-zero, migration 2's collapse is wrong — STOP and return to the migration track; do not patch data here.**
- [ ] **Step 3: Confirm the row-count invariant explicitly** — Run via `mcp__supabase__execute_sql`:

```sql
-- Visible-row-count per tenant must be unchanged by the collapse: every operational
-- row still has legal_entity_id / business_unit_id NULL (the §2A.7 NULL clause keeps
-- them universally visible — no rewrite, no custody rewrite).
SELECT
  (SELECT count(*) FROM cases    WHERE legal_entity_id IS NOT NULL) AS cases_scoped,
  (SELECT count(*) FROM invoices WHERE legal_entity_id IS NOT NULL) AS invoices_scoped,
  (SELECT count(*) FROM chain_of_custody WHERE business_unit_id IS NOT NULL) AS custody_scoped;
```
Expected: `0, 0, 0`. **Non-zero = the collapse rewrote operational rows, which it must not.**

- [ ] **Step 4: Verify the BU policy carries all 5 escape clauses (flag-off proof)** — Run via `mcp__supabase__execute_sql`:

```sql
SELECT policyname, qual FROM pg_policies
WHERE schemaname='public' AND policyname LIKE '%business_unit_isolation%';
```
Expected: each `qual` contains `is_platform_admin`, `business_unit_scoping_enabled`, `get_current_business_unit_id() IS NULL`, `<col> IS NULL`, and `= get_current_business_unit_id()`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-dormant-hierarchy-invariant.sql
git commit -m "ci(hierarchy): dormant-hierarchy invariant SQL (1 primary entity + 1 MAIN branch, BU isolation OFF, row-count unchanged)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6 — Collapse-mapping consumer-contract test (`dormancy.collapse.test.ts`)

A vitest test that locks the *service-level* collapse expectations against a mocked DB, so the Phase-1 service contract ("a freshly-collapsed tenant returns exactly its primary entity, no picker needed") is regression-protected without a live DB.

**Files:** Test `src/lib/country/legalEntities/dormancy.collapse.test.ts`

- [ ] **Step 1: Write the test** — Create `src/lib/country/legalEntities/dormancy.collapse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCaseEntityDefault } from './resolvePrimaryEntity';

// The collapse guarantees exactly one primary entity per tenant (Task 5 SQL
// enforces it in the DB). This test locks the CONSUMER contract: with that single
// entity, case creation is silent (no confirmation, not blocked) — the dormant
// happy path every existing tenant hits today.
describe('post-collapse consumer contract (dormant single-entity world)', () => {
  it('a collapsed tenant (1 primary entity) creates cases silently — no entity picker', () => {
    const collapsed = [{ id: 'e-primary', is_primary: true, currency_code: 'OMR', tax_system: 'VAT' }];
    const r = resolveCaseEntityDefault(collapsed, { homeEntityId: null });
    expect(r.entityId).toBe('e-primary');
    expect(r.requiresConfirmation).toBe(false); // Q4: silent for exactly 1 entity
    expect(r.blocked).toBe(false);
  });

  it('the multi-entity confirmation path stays DORMANT until a 2nd entity is added (Phase 4 WS-B)', () => {
    const single = [{ id: 'e-primary', is_primary: true, currency_code: 'OMR', tax_system: 'VAT' }];
    const dual = [...single, { id: 'e-2', is_primary: false, currency_code: 'SAR', tax_system: 'VAT' }];
    expect(resolveCaseEntityDefault(single, { homeEntityId: null }).requiresConfirmation).toBe(false);
    expect(resolveCaseEntityDefault(dual, { homeEntityId: null }).requiresConfirmation).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/country/legalEntities/dormancy.collapse.test.ts`. Because Task 1's `resolveCaseEntityDefault` already satisfies this, the test passes immediately — it is a *characterization/regression lock* on the dormant contract, not new behavior. Confirm 2 passed.
- [ ] **Step 3: Typecheck** — `npm run check:tsc` → 0 errors.
- [ ] **Step 4: Commit**

```bash
git add src/lib/country/legalEntities/dormancy.collapse.test.ts
git commit -m "test(hierarchy): lock post-collapse single-entity consumer contract (multi-entity path dormant)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Area 3 — verification before completion

- `resolvePrimaryEntity.ts` encodes Q4 exactly: silent for 1 entity, forced-confirmation pre-select for >1, lock-on-first-financial-document — all unit-tested, zero DB/React dependency.
- `legalEntitiesService.ts` does CRUD + primary fetch via `supabase`/`logger`/`Database` types, `maybeSingle()`, fail-loud on non-3-letter currency (D2), blank-uuid→null, soft-delete only, tenant-immutable — typechecks at 0 against the regenerated types.
- `legalEntityKeys` added to `queryKeys.ts`.
- `sessionScope.ts` wraps the DB session helpers and proves business-unit visibility is a **constant no-op** with the flag off (5 dormancy assertions); the narrowing branch is correct-but-inactive.
- `scripts/check-dormant-hierarchy-invariant.sql` is GREEN against the live DB: exactly 1 primary entity + 1 MAIN branch per tenant, 0 tenants with BU isolation live, `cases`/`invoices`/`chain_of_custody` scoped-row-count = 0.
- BU isolation policies carry all 5 escape clauses (verified via `pg_policies.qual`); no `feature_flags.business_unit_isolation` is ON anywhere.
- All new tests pass under `npx vitest run`; `npm run check:tsc` = 0 errors; every commit on a fresh branch cut from `main`.

### Area 3 — out of scope (owned elsewhere — do not build here)

- **All DDL / migration 2 / the auto-collapse backfill / session-helper SQL / flag-off RLS policies** — migration track. This area only *verifies* and *consumes* them.
- **`database.types.ts` regen** — migration track (never hand-edit).
- **Entity-management UI** (`ManageCompaniesModal`-style add/set-primary, CreateCaseWizard entity step) — UI track; needs `ui-ux-pro-max` + `frontend-design`, gated behind a ≥2-entity tenant.
- **Live sub-unit RLS activation, `profiles.business_unit_id` assignment, perf indexes** — Phase 4 WS-A, hard-gated behind a named multi-site customer.
- **`number_sequences` per-entity `get_next_number` overload, provisioning `seed_new_tenant`** — Area 2 (config + onboarding tracks).

---

## Exit criteria

Phase 1 is complete when **all** of the following hold:

1. **New config key ships with ZERO schema change.** A new per-country key resolves through the cascade as one `COUNTRY_CONFIG_REGISTRY` array push — no migration, no types regen, no trigger edit (Area 1 Task F unit proof + the live `geo_countries.country_config` round-trip exit-verification owned by Area 2).
2. **Provisioning is fail-loud per country.** Provisioning a tenant on an unprepared/stub country returns **422 and soft-deletes the tenant** (no live row); provisioning on a prepared (formatting-ready) country **fully seeds** it (`tenant_currencies` is_base FIRST → `number_sequences` → primary `legal_entities` → `Main` branch → `onboarding_progress`).
3. **Every tenant auto-collapsed to exactly 1 legal_entity + 1 business-unit with unchanged row counts.** `check-dormant-hierarchy-invariant.sql` is GREEN: exactly 1 `is_primary` legal entity + 1 `MAIN` branch per non-deleted tenant; `cases`/`invoices`/`chain_of_custody` scoped-row-count = 0 (visible per-tenant row-count unchanged — the forensic invariant).
4. **Geo no-stub gate enforcing.** `geo_countries` populated from maintained datasets for every `is_active` country (0 stubs under `check-geo-completeness.sql`); the `country-config-completeness` CI gate is ENFORCING (`continue-on-error` removed) and green; unprepared countries set `is_active=false`.
5. **BU/region policies dormant no-ops.** Every `*_business_unit_isolation` policy carries all 5 escape clauses and is flag-OFF; no tenant has `feature_flags.business_unit_isolation` set; `resolveBusinessUnitVisibility` is a provable constant `true` with the flag off.
6. **tsc 0 + vitest green.** `bash scripts/check-tsc.sh` prints `0`; every new/extended vitest suite across the three areas passes; `bash scripts/check-schema-drift.sh` shows no diff; manifest rows added for every applied migration.
