-- data_migration import RPCs: create_run (resume-aware), import_batch (per-row savepoint), finalize.
-- All SECURITY DEFINER, search_path=public. Writes suppress fabricating triggers via app.importing.
--
-- Two PL/pgSQL-mandated deviations from the design draft (identical semantics):
--   * Transaction-local GUCs are set with set_config(name, value, is_local => true), the
--     PL/pgSQL-safe equivalent of `SET LOCAL` for namespaced parameters (app.importing /
--     app.bypass_tenant_guard). `SET LOCAL app.x = '...'` is a parser error inside a function.
--   * Per-row atomicity is provided by the inner BEGIN ... EXCEPTION WHEN OTHERS ... END block,
--     which establishes an implicit savepoint and auto-rolls-back the failing iteration only.
--     Explicit SAVEPOINT / RELEASE SAVEPOINT / ROLLBACK TO SAVEPOINT statements are illegal in
--     PL/pgSQL; the implicit-savepoint block is the canonical equivalent.
--   * Generated columns are NOT inserted: companies.company_name (= name), cases.title (= subject),
--     cases.case_no (= case_number), cases.assigned_engineer_id (= assigned_to), invoices.payment_status.
--     The source contract's `title` is folded into `subject` (which generates `title`).

-- 1) create_run: resume-aware for imports -------------------------------------------------
CREATE OR REPLACE FUNCTION public.data_migration_create_run(
  p_kind text,
  p_source_filename text,
  p_file_hash text,
  p_schema_version int,
  p_totals jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := get_current_tenant_id();
  v_run_id uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context for data migration run';
  END IF;

  IF p_kind = 'import' AND p_file_hash IS NOT NULL THEN
    SELECT id INTO v_run_id
    FROM data_migration_runs
    WHERE tenant_id = v_tenant
      AND kind = 'import'
      AND file_hash = p_file_hash
      AND status <> 'completed'
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_run_id IS NOT NULL THEN
      UPDATE data_migration_runs
      SET status = 'running', totals = COALESCE(p_totals, totals), updated_at = now()
      WHERE id = v_run_id;
      RETURN v_run_id;
    END IF;
  END IF;

  INSERT INTO data_migration_runs (
    tenant_id, kind, status, source_filename, file_hash, schema_version,
    totals, started_at, created_by
  ) VALUES (
    v_tenant, p_kind, 'running', p_source_filename, p_file_hash,
    COALESCE(p_schema_version, 1), COALESCE(p_totals, '{}'::jsonb), now(), auth.uid()
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

-- helper: resolve a legacy_id to its new_id within a run (NULL when absent) ----------------
CREATE OR REPLACE FUNCTION public.data_migration__resolve(
  p_run_id uuid, p_entity_type text, p_legacy_id text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT new_id FROM data_migration_entity_map
  WHERE run_id = p_run_id AND entity_type = p_entity_type
    AND legacy_id = p_legacy_id AND status = 'inserted'
  LIMIT 1;
$function$;

-- 2) import_batch: per-row savepoint, idempotent, parent remap ----------------------------
CREATE OR REPLACE FUNCTION public.data_migration_import_batch(
  p_run_id uuid,
  p_entity_type text,
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_row jsonb;
  v_legacy text;
  v_refs jsonb;
  v_new_id uuid;
  v_existing uuid;
  v_existing_status text;
  v_err text;
  v_results jsonb := '[]'::jsonb;
  -- resolved parents
  v_case uuid; v_customer uuid; v_company uuid; v_quote uuid; v_invoice uuid;
BEGIN
  -- transaction-local: suppress fabricating triggers + permit explicit-tenant inserts
  PERFORM set_config('app.importing', 'true', true);
  PERFORM set_config('app.bypass_tenant_guard', 'true', true);

  SELECT tenant_id INTO v_tenant FROM data_migration_runs WHERE id = p_run_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'data_migration run % not found', p_run_id;
  END IF;
  IF v_tenant <> get_current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Run % belongs to another tenant', p_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_legacy := v_row->>'legacy_id';
    v_refs := COALESCE(v_row->'parentRefs', '{}'::jsonb);
    v_new_id := NULL;
    v_err := NULL;

    -- Idempotency: already mapped this (run, entity, legacy_id)?
    SELECT new_id, status INTO v_existing, v_existing_status
    FROM data_migration_entity_map
    WHERE run_id = p_run_id AND entity_type = p_entity_type AND legacy_id = v_legacy;
    IF FOUND AND v_existing_status <> 'error' THEN
      v_results := v_results || jsonb_build_object(
        'legacy_id', v_legacy, 'new_id', v_existing,
        'status', 'skipped_duplicate', 'error', NULL);
      CONTINUE;
    END IF;

    -- Per-row implicit savepoint: this inner block isolates each row. A failure rolls back
    -- only this iteration's entity insert + map write; prior committed rows are preserved.
    BEGIN
      v_new_id := gen_random_uuid();

      IF p_entity_type = 'companies' THEN
        -- companies.company_name is GENERATED ALWAYS AS (name); never insert it explicitly.
        INSERT INTO companies (id, tenant_id, name, email, phone, website, address, notes, created_at)
        VALUES (v_new_id, v_tenant, v_row->>'name', v_row->>'email', v_row->>'phone',
                v_row->>'website', v_row->>'address', v_row->>'notes',
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'customers' THEN
        INSERT INTO customers_enhanced (id, tenant_id, customer_number, customer_name, email, phone, mobile_number, address, notes, metadata, created_at)
        VALUES (v_new_id, v_tenant, v_row->>'customer_number', v_row->>'customer_name', v_row->>'email',
                v_row->>'phone', v_row->>'mobile_number', v_row->>'address', v_row->>'notes',
                jsonb_build_object('legacy_id', v_legacy, 'data_migration_run_id', p_run_id),
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'relationships' THEN
        v_customer := data_migration__resolve(p_run_id, 'customers', v_refs->>'customer_legacy_id');
        v_company  := data_migration__resolve(p_run_id, 'companies', v_refs->>'company_legacy_id');
        IF v_customer IS NULL OR v_company IS NULL THEN
          RAISE EXCEPTION 'unresolved parent (customer=% company=%)', v_refs->>'customer_legacy_id', v_refs->>'company_legacy_id';
        END IF;
        INSERT INTO customer_company_relationships (id, tenant_id, customer_id, company_id, role, is_primary, created_at)
        VALUES (v_new_id, v_tenant, v_customer, v_company, v_row->>'role',
                COALESCE((v_row->>'is_primary')::boolean, false),
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'cases' THEN
        v_customer := data_migration__resolve(p_run_id, 'customers', v_refs->>'customer_legacy_id');
        v_company  := data_migration__resolve(p_run_id, 'companies', v_refs->>'company_legacy_id');
        -- cases.title is GENERATED ALWAYS AS (subject) and case_no AS (case_number); never insert them.
        INSERT INTO cases (id, tenant_id, case_number, customer_id, company_id, status, subject, description, created_at)
        VALUES (v_new_id, v_tenant, v_row->>'case_number', v_customer, v_company, v_row->>'status',
                COALESCE(v_row->>'subject', v_row->>'title'), v_row->>'description',
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'devices' THEN
        v_case := data_migration__resolve(p_run_id, 'cases', v_refs->>'case_legacy_id');
        IF v_case IS NULL THEN RAISE EXCEPTION 'unresolved case %', v_refs->>'case_legacy_id'; END IF;
        INSERT INTO case_devices (id, tenant_id, case_id, device_type_id, brand_id, capacity_id, interface_id, condition_id,
                                  model, serial_number, symptoms, notes, created_at)
        VALUES (v_new_id, v_tenant, v_case,
                NULLIF(v_row->>'device_type_id','')::uuid, NULLIF(v_row->>'brand_id','')::uuid,
                NULLIF(v_row->>'capacity_id','')::uuid, NULLIF(v_row->>'interface_id','')::uuid,
                NULLIF(v_row->>'condition_id','')::uuid,
                v_row->>'model', v_row->>'serial_number', v_row->>'symptoms', v_row->>'notes',
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'quotes' THEN
        v_case := data_migration__resolve(p_run_id, 'cases', v_refs->>'case_legacy_id');
        INSERT INTO quotes (id, tenant_id, quote_number, case_id, status, subtotal, tax_amount, total_amount, notes, created_at)
        VALUES (v_new_id, v_tenant, v_row->>'quote_number', v_case, v_row->>'status',
                COALESCE((v_row->>'subtotal')::numeric, 0), COALESCE((v_row->>'tax_amount')::numeric, 0),
                COALESCE((v_row->>'total_amount')::numeric, 0), v_row->>'notes',
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'quoteItems' THEN
        v_quote := data_migration__resolve(p_run_id, 'quotes', v_refs->>'quote_legacy_id');
        IF v_quote IS NULL THEN RAISE EXCEPTION 'unresolved quote %', v_refs->>'quote_legacy_id'; END IF;
        INSERT INTO quote_items (id, tenant_id, quote_id, description, quantity, unit_price, total, sort_order, created_at)
        VALUES (v_new_id, v_tenant, v_quote, v_row->>'description',
                COALESCE((v_row->>'quantity')::numeric, 1), COALESCE((v_row->>'unit_price')::numeric, 0),
                COALESCE((v_row->>'total')::numeric, 0), COALESCE((v_row->>'sort_order')::int, 0),
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'invoices' THEN
        v_case := data_migration__resolve(p_run_id, 'cases', v_refs->>'case_legacy_id');
        INSERT INTO invoices (id, tenant_id, invoice_number, case_id, status, subtotal, tax_amount, total_amount, notes, created_at)
        VALUES (v_new_id, v_tenant, v_row->>'invoice_number', v_case, COALESCE(v_row->>'status','draft'),
                COALESCE((v_row->>'subtotal')::numeric, 0), COALESCE((v_row->>'tax_amount')::numeric, 0),
                COALESCE((v_row->>'total_amount')::numeric, 0), v_row->>'notes',
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'invoiceLineItems' THEN
        v_invoice := data_migration__resolve(p_run_id, 'invoices', v_refs->>'invoice_legacy_id');
        IF v_invoice IS NULL THEN RAISE EXCEPTION 'unresolved invoice %', v_refs->>'invoice_legacy_id'; END IF;
        INSERT INTO invoice_line_items (id, tenant_id, invoice_id, description, quantity, unit_price, tax_amount, total, sort_order, created_at)
        VALUES (v_new_id, v_tenant, v_invoice, v_row->>'description',
                COALESCE((v_row->>'quantity')::numeric, 1), COALESCE((v_row->>'unit_price')::numeric, 0),
                COALESCE((v_row->>'tax_amount')::numeric, 0), COALESCE((v_row->>'total')::numeric, 0),
                COALESCE((v_row->>'sort_order')::int, 0),
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'notes' THEN
        v_case := data_migration__resolve(p_run_id, 'cases', v_refs->>'case_legacy_id');
        IF v_case IS NULL THEN RAISE EXCEPTION 'unresolved case %', v_refs->>'case_legacy_id'; END IF;
        INSERT INTO case_internal_notes (id, tenant_id, case_id, content, created_at)
        VALUES (v_new_id, v_tenant, v_case, COALESCE(v_row->>'content',''),
                COALESCE((v_row->>'created_at')::timestamptz, now()));

      ELSIF p_entity_type = 'statusHistory' THEN
        v_case := data_migration__resolve(p_run_id, 'cases', v_refs->>'case_legacy_id');
        IF v_case IS NULL THEN RAISE EXCEPTION 'unresolved case %', v_refs->>'case_legacy_id'; END IF;
        INSERT INTO case_job_history (id, tenant_id, case_id, action, old_value, new_value, created_at)
        VALUES (v_new_id, v_tenant, v_case, COALESCE(v_row->>'action','STATUS_CHANGED'),
                v_row->>'old_value', v_row->>'new_value',
                COALESCE((v_row->>'performed_at')::timestamptz, now()));

      ELSE
        RAISE EXCEPTION 'unknown entity_type %', p_entity_type;
      END IF;

      -- Record (legacy_id -> new_id) in the SAME implicit savepoint as the entity insert.
      INSERT INTO data_migration_entity_map (run_id, tenant_id, entity_type, legacy_id, new_id, status)
      VALUES (p_run_id, v_tenant, p_entity_type, v_legacy, v_new_id, 'inserted')
      ON CONFLICT (run_id, entity_type, legacy_id)
      DO UPDATE SET new_id = EXCLUDED.new_id, status = 'inserted', error = NULL, updated_at = now();

      v_results := v_results || jsonb_build_object(
        'legacy_id', v_legacy, 'new_id', v_new_id, 'status', 'inserted', 'error', NULL);

    EXCEPTION WHEN OTHERS THEN
      -- Implicit ROLLBACK TO the inner block's savepoint already happened: the entity insert
      -- AND the map write above are both undone for this row. Other rows are unaffected.
      v_err := SQLERRM;
      INSERT INTO data_migration_entity_map (run_id, tenant_id, entity_type, legacy_id, new_id, status, error)
      VALUES (p_run_id, v_tenant, p_entity_type, v_legacy, NULL, 'error', v_err)
      ON CONFLICT (run_id, entity_type, legacy_id)
      DO UPDATE SET status = 'error', error = v_err, updated_at = now();
      v_results := v_results || jsonb_build_object(
        'legacy_id', v_legacy, 'new_id', NULL, 'status', 'error', 'error', v_err);
    END;
  END LOOP;

  RETURN jsonb_build_object('results', v_results);
END;
$function$;

-- 3) finalize: advance sequences + one provenance trail + per-case MIGRATED note ----------
CREATE OR REPLACE FUNCTION public.data_migration_finalize(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_advanced jsonb := '[]'::jsonb;
  v_prov int := 0;
  v_case record;
  v_seq record;
  v_max bigint;
BEGIN
  SELECT tenant_id INTO v_tenant FROM data_migration_runs WHERE id = p_run_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_tenant <> get_current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Run % belongs to another tenant', p_run_id;
  END IF;

  -- Advance number_sequences past max imported numeric suffix for each scope this run touched.
  -- Maps entity_type -> (scope, target table.number column). Suffix parsed off the trailing digits.
  FOR v_seq IN
    SELECT * FROM (VALUES
      ('cases',    'case',     'cases',           'case_number'),
      ('customers','customers','customers_enhanced','customer_number'),
      ('companies','companies','companies',       'company_number'),
      ('quotes',   'quote',    'quotes',          'quote_number'),
      ('invoices', 'invoice',  'invoices',        'invoice_number')
    ) AS s(entity_type, scope, tbl, col)
  LOOP
    EXECUTE format(
      'SELECT max(NULLIF(regexp_replace(t.%I, ''\D'', '''', ''g''), '''')::bigint)
       FROM %I t
       JOIN data_migration_entity_map m
         ON m.new_id = t.id AND m.run_id = $1 AND m.entity_type = $2 AND m.status = ''inserted''
       WHERE t.tenant_id = $3',
      v_seq.col, v_seq.tbl)
    INTO v_max USING p_run_id, v_seq.entity_type, v_tenant;

    IF v_max IS NOT NULL THEN
      UPDATE number_sequences
      SET current_value = GREATEST(COALESCE(current_value, 0), v_max), updated_at = now()
      WHERE tenant_id = v_tenant AND scope = v_seq.scope;
      IF FOUND THEN
        v_advanced := v_advanced || jsonb_build_object('scope', v_seq.scope, 'advanced_to', v_max);
      END IF;
    END IF;
  END LOOP;

  -- One MIGRATED case_job_history note per imported case (dated to migration; clearly labelled).
  FOR v_case IN
    SELECT new_id FROM data_migration_entity_map
    WHERE run_id = p_run_id AND entity_type = 'cases' AND status = 'inserted'
  LOOP
    INSERT INTO case_job_history (tenant_id, case_id, action, details, performed_by, created_at)
    VALUES (v_tenant, v_case.new_id, 'MIGRATED',
            'Imported via data migration run ' || p_run_id::text, auth.uid(), now());
    v_prov := v_prov + 1;
  END LOOP;

  -- Single provenance audit_trails row for the run.
  INSERT INTO audit_trails (tenant_id, record_type, record_id, action, new_values, performed_by)
  VALUES (v_tenant, 'data_migration_run', p_run_id, 'IMPORT_FINALIZED',
          (SELECT to_jsonb(r) FROM (SELECT counts, totals, source_filename, file_hash
             FROM data_migration_runs WHERE id = p_run_id) r),
          auth.uid());

  UPDATE data_migration_runs
  SET status = 'completed', finished_at = now(), updated_at = now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object('sequences_advanced', v_advanced, 'provenance_written', v_prov);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.data_migration_create_run(text,text,text,int,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_migration_import_batch(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_migration__resolve(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_migration_finalize(uuid) TO authenticated;
