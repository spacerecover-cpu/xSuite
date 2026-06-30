-- C3 audit-integrity fix — re-uploading the SAME completed workbook duplicated keyless children.
--
-- Mechanism (pre-fix): data_migration_create_run resumed only runs with status <> 'completed'.
-- A completed re-upload therefore minted a NEW run with a fresh data_migration_entity_map.
-- Keyed parents (customers/companies/cases/invoices/quotes) deduped against live rows by business
-- key (C2) and mapped to the existing uuid, but KEYLESS children (devices/quoteItems/
-- invoiceLineItems/notes/statusHistory) have no business key and no metadata column, so they
-- plain-INSERTed new uuids -> duplicates. Duplicating append-only case_job_history (statusHistory)
-- violates the project's forensic/audit rules.
--
-- Fix (spec §7 — "re-uploading the same file resumes the run, skipping already-mapped legacy_ids"):
--   1) create_run RESUMES the existing (tenant_id, file_hash, kind='import') run REGARDLESS of
--      status — completed runs included. The persisted entity_map then short-circuits EVERY entity
--      (keyed + keyless) via import_batch's per-(run,entity,legacy_id) idempotency check -> 0 inserts.
--        - A completed run is returned AS-IS (status left 'completed'): returning it inserts nothing,
--          so the uq_data_migration_runs_active_import partial index (WHERE status<>'completed') is
--          untouched, and we never un-complete a finalized run.
--        - A non-completed run keeps the prior resume behavior (flip to 'running', refresh totals).
--   2) finalize is IDEMPOTENT — if the run is already 'completed' it no-ops: it does NOT re-advance
--      number_sequences, write a second IMPORT_FINALIZED provenance row, or add a second MIGRATED
--      case_job_history note. Returns {already_finalized:true}.
-- import_batch is unchanged: its existing (run_id, entity_type, legacy_id) map check already returns
-- skipped_duplicate with the mapped new_id for every prior row — now covering keyless children too.

-- 1) create_run: resume ANY existing import run for (tenant, file_hash) ---------------------
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
  v_status text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context for data migration run';
  END IF;

  IF p_kind = 'import' AND p_file_hash IS NOT NULL THEN
    -- Resume the most-recent run for this file REGARDLESS of status (completed included).
    SELECT id, status INTO v_run_id, v_status
    FROM data_migration_runs
    WHERE tenant_id = v_tenant
      AND kind = 'import'
      AND file_hash = p_file_hash
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_run_id IS NOT NULL THEN
      IF v_status = 'completed' THEN
        -- Return the finalized run untouched. Its persisted entity_map short-circuits every
        -- entity on re-upload (0 inserts); leaving status 'completed' keeps the run out of the
        -- active-import partial unique index and preserves the finalized audit record.
        RETURN v_run_id;
      END IF;
      -- In-flight run: resume it (refresh totals, mark running).
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

-- 2) finalize: idempotent — no-op when the run is already completed --------------------------
CREATE OR REPLACE FUNCTION public.data_migration_finalize(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_status text;
  v_advanced jsonb := '[]'::jsonb;
  v_prov int := 0;
  v_case record;
  v_seq record;
  v_max bigint;
BEGIN
  SELECT tenant_id, status INTO v_tenant, v_status
  FROM data_migration_runs WHERE id = p_run_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_tenant <> get_current_tenant_id() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Run % belongs to another tenant', p_run_id;
  END IF;

  -- Idempotency: a completed run was already finalized. Do NOT re-advance number_sequences,
  -- write a second IMPORT_FINALIZED provenance row, or add a second MIGRATED case note.
  IF v_status = 'completed' THEN
    RETURN jsonb_build_object('already_finalized', true,
                             'sequences_advanced', '[]'::jsonb, 'provenance_written', 0);
  END IF;

  -- Advance number_sequences past max imported numeric suffix for each scope this run touched.
  -- Maps entity_type -> (scope, target table.number column). Suffix parsed off the trailing digits.
  FOR v_seq IN
    SELECT * FROM (VALUES
      ('cases',    'case',     'cases',           'case_number'),
      ('customers','customers','customers_enhanced','customer_number'),
      ('companies','companies','companies',       'company_number'),
      ('quotes',   'quote',    'quotes',          'quote_number'),
      -- invoice numbering uses scope 'invoices' (get_next_invoice_number → get_next_number('invoices'));
      -- the legacy 'invoice' row is vestigial. Confirmed against live number_sequences + generators.
      ('invoices', 'invoices', 'invoices',        'invoice_number')
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

  RETURN jsonb_build_object('already_finalized', false,
                           'sequences_advanced', v_advanced, 'provenance_written', v_prov);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.data_migration_create_run(text,text,text,int,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_migration_finalize(uuid) TO authenticated;
