-- =====================================================================================
-- Phase 2 / Migration #4 — phase2_requirement_gate_and_snapshots
-- Task 17: evaluate_document_requirements (pure STABLE evaluator over master_document_requirements)
-- Task 18: issue_tax_document v2 (invoice gate + snapshot stamping)  +  issue_credit_note graft (Edit D)
--
-- Composed by anchored insertion into the LIVE Phase-1 bodies (captured 2026-07-04 via
-- pg_get_functiondef). Variable names reconciled to the live reality (v_inv / v_tax_point /
-- v_cn). See trigger_analysis.md for the full reconciliation + trigger-safety proof.
-- Snapshot artifact committed to supabase/rpc_snapshots/ so the drift tests can read it.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Task 17: evaluate_document_requirements
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_document_requirements(
  p_doc_type text,
  p_country_id uuid,
  p_as_of date,
  p_facts jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req record;
  v_clause jsonb;
  v_fact_val jsonb;
  v_passes boolean;
  v_missing boolean;
  v_line jsonb;
  v_line_field text;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  FOR v_req IN
    SELECT field_key, condition, level, message_i18n
    FROM master_document_requirements
    WHERE country_id = p_country_id
      AND doc_type = p_doc_type
      AND effective_from <= p_as_of
      AND deleted_at IS NULL
    ORDER BY sort_order, field_key
  LOOP
    -- 1) Condition (NULL = unconditional). Closed vocabulary:
    --    {"all":[{"fact":<key>,"op":"eq"|"neq"|"in"|"gte"|"present","value":...}]}
    v_passes := true;
    IF v_req.condition IS NOT NULL THEN
      FOR v_clause IN SELECT * FROM jsonb_array_elements(v_req.condition -> 'all') LOOP
        v_fact_val := p_facts -> (v_clause ->> 'fact');
        v_passes := CASE v_clause ->> 'op'
          WHEN 'present' THEN v_fact_val IS NOT NULL
                              AND v_fact_val <> 'null'::jsonb
                              AND btrim(COALESCE(v_fact_val #>> '{}', '')) <> ''
          WHEN 'eq'      THEN v_fact_val = (v_clause -> 'value')
          WHEN 'neq'     THEN v_fact_val IS DISTINCT FROM (v_clause -> 'value')
          WHEN 'in'      THEN COALESCE((v_clause -> 'value') @> v_fact_val, false)
          WHEN 'gte'     THEN COALESCE((v_fact_val #>> '{}')::numeric
                                       >= ((v_clause ->> 'value'))::numeric, false)
          ELSE false      -- unknown op: fail-safe (condition never matches)
        END;
        EXIT WHEN NOT v_passes;
      END LOOP;
    END IF;
    CONTINUE WHEN NOT v_passes;

    -- 2) Field presence. 'line.<col>' checks every element of p_facts->'lines'.
    IF v_req.field_key LIKE 'line.%' THEN
      v_line_field := substring(v_req.field_key from 6);
      v_missing := false;
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_facts -> 'lines', '[]'::jsonb)) LOOP
        IF btrim(COALESCE(v_line ->> v_line_field, '')) = '' THEN
          v_missing := true;
          EXIT;
        END IF;
      END LOOP;
    ELSE
      v_fact_val := p_facts -> v_req.field_key;
      v_missing := v_fact_val IS NULL
        OR v_fact_val = 'null'::jsonb
        OR (jsonb_typeof(v_fact_val) = 'string' AND btrim(v_fact_val #>> '{}') = '')
        OR (jsonb_typeof(v_fact_val) = 'object' AND v_fact_val = '{}'::jsonb);
    END IF;

    IF v_missing THEN
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'field_key', v_req.field_key,
        'level',     v_req.level,
        'message',   COALESCE(v_req.message_i18n ->> 'en', v_req.field_key || ' is required')
      ));
    END IF;
  END LOOP;

  RETURN v_failures;
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_document_requirements(text, uuid, date, jsonb)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- Task 18a: issue_tax_document v2 (Phase-1 body + Edits A, B, B2, C1, C2)
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_tax_document(p_doc_type text, p_doc_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_inv invoices%ROWTYPE;
  v_tz text;
  v_doc_dp int;
  v_tol numeric;
  v_base_tol numeric;
  v_rollup_count int;
  v_rollup_tax numeric;
  v_rollup_tax_base numeric;
  v_bad_component text;
  v_tax_point date;
  v_period text;
  v_number text;
  v_vat_ids uuid[] := '{}';
  v_vat_id uuid;
  v_r record;
  v_trace jsonb;
  v_regime text;
  v_pack uuid;
  v_tax_lines jsonb;
  v_q_tax numeric;
  -- Edit A — Phase 2 gate + snapshot locals
  v_country_id uuid;
  v_pack_version int;
  v_facts jsonb;
  v_req_failures jsonb := '[]'::jsonb;
  v_has_block boolean := false;
  v_buyer_tax_number text;
  v_buyer_tax_number_label text;
  v_buyer_address jsonb;
  v_seller_tax_number text;
  v_lines_facts jsonb;
  v_reverse_charge boolean := false;
  v_notations jsonb := '[]'::jsonb;
BEGIN
  IF p_doc_type NOT IN ('quote','invoice','credit_note','stock_sale') THEN
    RAISE EXCEPTION 'issue_tax_document: unknown document type "%"', p_doc_type;
  END IF;
  IF p_doc_type IN ('credit_note','stock_sale') THEN
    RAISE EXCEPTION 'issue_tax_document: % issuance is not wired in Phase 1 (credit notes: issue_credit_note; stock sales: Phase 2 record_stock_sale tax threading)', p_doc_type;
  END IF;

  v_tenant := get_current_tenant_id();

  -- ── QUOTE: dry-run validation only (quotes are not issued/ledgered) ──
  IF p_doc_type = 'quote' THEN
    IF NOT p_dry_run THEN
      RAISE EXCEPTION 'issue_tax_document: quotes support p_dry_run=true only';
    END IF;
    SELECT COALESCE(sum(dtl.tax_amount), 0) INTO v_q_tax
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'quote' AND dtl.document_id = p_doc_id
      AND dtl.line_item_id IS NULL AND dtl.deleted_at IS NULL;
    SELECT COALESCE(jsonb_agg(to_jsonb(dtl) ORDER BY dtl.sequence), '[]'::jsonb) INTO v_tax_lines
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'quote' AND dtl.document_id = p_doc_id AND dtl.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'ok', true, 'document_number', NULL, 'tax_lines', v_tax_lines,
      'totals', jsonb_build_object('taxTotal', v_q_tax),
      'requirement_failures', '[]'::jsonb, 'trace', NULL);
  END IF;

  -- ── INVOICE ──
  SELECT * INTO v_inv FROM invoices
  WHERE id = p_doc_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue_tax_document: invoice % not found', p_doc_id; END IF;
  IF v_inv.tenant_id <> v_tenant AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % belongs to another tenant', p_doc_id;
  END IF;
  IF v_inv.invoice_type <> 'tax_invoice' THEN
    RAISE EXCEPTION 'issue_tax_document: only tax invoices are issued (got %). Convert the proforma first.', v_inv.invoice_type;
  END IF;
  IF NOT p_dry_run AND COALESCE(v_inv.status, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % is already issued (status %)', v_inv.invoice_number, v_inv.status;
  END IF;

  SELECT timezone INTO v_tz FROM tenants WHERE id = v_inv.tenant_id;
  SELECT decimal_places INTO v_doc_dp FROM master_currency_codes WHERE code = v_inv.currency;
  IF v_doc_dp IS NULL THEN
    RAISE EXCEPTION 'issue_tax_document: unknown currency "%" (master_currency_codes)', v_inv.currency;
  END IF;
  v_tol := 0.5 * power(10::numeric, -v_doc_dp);
  v_base_tol := v_tol;  -- single-entity tenants: base decimals == jurisdiction; refined in Phase 3

  -- ── (b) Phase 2 requirement gate + snapshot facts (graft 11) ──────────────
  -- Tenant-local tax point (recomputed identically in section (e)); needed here as the
  -- evaluator's as-of date and as the supply_date fact/snapshot. Passing NULL would make
  -- every `effective_from <= p_as_of` NULL and silently skip the whole gate.
  -- COALESCE(v_tz,'UTC') keeps the gate self-contained (mirrors get_next_number) so a
  -- future relaxation of tenants.timezone NOT NULL can't silently disable requirements.
  v_tax_point := COALESCE(v_inv.supply_date, (now() AT TIME ZONE COALESCE(v_tz,'UTC'))::date);

  SELECT t.country_id, t.country_pack_version
    INTO v_country_id, v_pack_version
  FROM tenants t WHERE t.id = v_inv.tenant_id;

  -- «buyer-identity:begin» (kept structurally equivalent to issue_credit_note — drift-tested)
  -- Buyer identity: company overrides customer when the document bills a company.
  -- buyer_address freezes BOTH the subdivision uuid AND the resolved NAME so an issued
  -- document renders correctly even if geo_subdivisions is later renamed.
  SELECT c.tax_number,
         jsonb_strip_nulls(jsonb_build_object(
           'line1', c.address_line1, 'line2', c.address_line2,
           'subdivision_id', c.subdivision_id, 'subdivision', sub.name,
           'postal_code', c.postal_code, 'free_text', c.address))
    INTO v_buyer_tax_number, v_buyer_address
  FROM customers_enhanced c
  LEFT JOIN geo_subdivisions sub ON sub.id = c.subdivision_id AND sub.deleted_at IS NULL
  WHERE c.id = v_inv.customer_id AND c.deleted_at IS NULL;

  IF v_inv.company_id IS NOT NULL THEN
    SELECT COALESCE(co.tax_number, v_buyer_tax_number),
           COALESCE(jsonb_strip_nulls(jsonb_build_object(
             'line1', co.address_line1, 'line2', co.address_line2,
             'subdivision_id', co.subdivision_id, 'subdivision', sub.name,
             'postal_code', co.postal_code, 'free_text', co.address)), v_buyer_address)
      INTO v_buyer_tax_number, v_buyer_address
    FROM companies co
    LEFT JOIN geo_subdivisions sub ON sub.id = co.subdivision_id AND sub.deleted_at IS NULL
    WHERE co.id = v_inv.company_id AND co.deleted_at IS NULL;
  END IF;

  SELECT le.tax_identifier INTO v_seller_tax_number
  FROM legal_entities le
  WHERE le.tenant_id = v_inv.tenant_id AND le.is_primary AND le.deleted_at IS NULL
  LIMIT 1;

  SELECT g.tax_number_label INTO v_buyer_tax_number_label
  FROM geo_countries g WHERE g.id = v_country_id;
  -- «buyer-identity:end»

  -- Line facts for 'line.*' field checks (invoice path only — quotes return earlier,
  -- credit_note/stock_sale raise; this RPC issues invoices exclusively).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_code', li.item_code, 'unit_code', li.unit_code,
           'tax_treatment', li.tax_treatment)), '[]'::jsonb)
    INTO v_lines_facts
  FROM invoice_line_items li
  WHERE li.invoice_id = p_doc_id AND li.deleted_at IS NULL;

  -- Requirements apply ONLY after pack activation (M-I).
  IF v_pack_version IS NOT NULL AND v_country_id IS NOT NULL THEN
    v_facts := jsonb_strip_nulls(jsonb_build_object(
      'buyer_is_business', (v_inv.company_id IS NOT NULL),
      'buyer_tax_number', v_buyer_tax_number,
      'seller_registered', (v_seller_tax_number IS NOT NULL),
      'seller_tax_number', v_seller_tax_number,
      'place_of_supply', v_inv.place_of_supply_subdivision_id,
      'place_of_supply_subdivision_id', v_inv.place_of_supply_subdivision_id,
      'supply_date', COALESCE(v_inv.supply_date, v_tax_point),
      'document_total', v_inv.total_amount,
      'lines', v_lines_facts
    )) || jsonb_build_object('buyer_address', COALESCE(v_buyer_address, '{}'::jsonb));

    v_req_failures := evaluate_document_requirements(p_doc_type, v_country_id, v_tax_point, v_facts);
    SELECT COALESCE(bool_or(f ->> 'level' = 'block'), false)
      INTO v_has_block
    FROM jsonb_array_elements(v_req_failures) f;

    IF NOT p_dry_run AND v_has_block THEN
      RAISE EXCEPTION 'REQUIREMENTS_NOT_MET: %', v_req_failures::text
        USING ERRCODE = 'P0403',
              HINT = 'master_document_requirements gate — resolve the blocking fields and reissue';
    END IF;
  END IF;

  -- (d) Σ(document_tax_lines rollups) = header, document + base currency.
  SELECT count(*), COALESCE(sum(tax_amount), 0), COALESCE(sum(tax_amount_base), 0)
  INTO v_rollup_count, v_rollup_tax, v_rollup_tax_base
  FROM document_tax_lines
  WHERE document_type = 'invoice' AND document_id = p_doc_id
    AND line_item_id IS NULL AND deleted_at IS NULL;
  IF v_rollup_count = 0 THEN
    RAISE EXCEPTION 'issue_tax_document: invoice % has no document_tax_lines rollups — compute and persist tax lines before issuing', p_doc_id;
  END IF;
  IF abs(v_rollup_tax - COALESCE(v_inv.tax_amount, 0)) > v_tol THEN
    RAISE EXCEPTION 'issue_tax_document: header tax % <> Σ rollups % (tolerance %)', v_inv.tax_amount, v_rollup_tax, v_tol;
  END IF;
  IF v_inv.tax_amount_base IS NOT NULL AND abs(v_rollup_tax_base - v_inv.tax_amount_base) > v_base_tol THEN
    RAISE EXCEPTION 'issue_tax_document: header tax_base % <> Σ rollup base % (tolerance %)', v_inv.tax_amount_base, v_rollup_tax_base, v_base_tol;
  END IF;
  -- per-component: Σ(line rows) = rollup
  SELECT r.component_code INTO v_bad_component
  FROM document_tax_lines r
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(l.tax_amount), 0) AS line_sum, count(*) AS n
    FROM document_tax_lines l
    WHERE l.document_type = 'invoice' AND l.document_id = p_doc_id
      AND l.line_item_id IS NOT NULL AND l.component_code = r.component_code AND l.deleted_at IS NULL
  ) ls ON true
  WHERE r.document_type = 'invoice' AND r.document_id = p_doc_id
    AND r.line_item_id IS NULL AND r.deleted_at IS NULL
    AND ls.n > 0 AND abs(ls.line_sum - r.tax_amount) > v_tol
  LIMIT 1;
  IF v_bad_component IS NOT NULL THEN
    RAISE EXCEPTION 'issue_tax_document: component % line rows do not sum to its rollup', v_bad_component;
  END IF;

  SELECT regime_key, pack_version_id, rule_trace INTO v_regime, v_pack, v_trace
  FROM document_tax_lines
  WHERE document_type = 'invoice' AND document_id = p_doc_id AND line_item_id IS NULL AND deleted_at IS NULL
  ORDER BY sequence LIMIT 1;

  IF p_dry_run THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(dtl) ORDER BY dtl.line_item_id NULLS FIRST, dtl.sequence), '[]'::jsonb)
    INTO v_tax_lines
    FROM document_tax_lines dtl
    WHERE dtl.document_type = 'invoice' AND dtl.document_id = p_doc_id AND dtl.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'ok', true, 'document_number', NULL, 'tax_lines', v_tax_lines,
      'totals', jsonb_build_object(
        'taxTotal', v_rollup_tax, 'grandTotal', v_inv.total_amount, 'taxableBase', v_inv.subtotal - COALESCE(v_inv.discount_amount, 0)),
      'requirement_failures', v_req_failures, 'trace', v_trace);   -- Edit C1
  END IF;

  -- Signal the Task-19 backstop that this transaction IS the sanctioned issuer.
  PERFORM set_config('app.issuing', 'true', true);

  -- ── (b2) freeze statutory notations + reverse_charge (graft 12) ───────────
  -- document_tax_lines exist here (validated by the Σ-rollup check above). The notation
  -- strings mirror gccTaxInvoiceProfile.notations() — TS↔SQL drift-tested (GCC_TAX_INVOICE_NOTATIONS).
  SELECT COALESCE(bool_or(dtl.tax_treatment = 'reverse_charge'), false)
    INTO v_reverse_charge
  FROM document_tax_lines dtl
  WHERE dtl.document_type = p_doc_type AND dtl.document_id = p_doc_id
    AND dtl.deleted_at IS NULL;

  WITH treatments AS (
    SELECT DISTINCT dtl.tax_treatment, dtl.treatment_reason_code
    FROM document_tax_lines dtl
    WHERE dtl.document_type = p_doc_type AND dtl.document_id = p_doc_id
      AND dtl.deleted_at IS NULL
  ),
  notes AS (
    -- Reverse-charge note (mirrors the profile's reverse_charge branch).
    SELECT 1 AS ord, jsonb_build_object(
      'code', 'REVERSE_CHARGE',
      'text', 'VAT to be accounted for by the recipient under the reverse-charge mechanism.',
      'textTranslated', 'يتم احتساب ضريبة القيمة المضافة من قبل المستلم وفقاً لآلية الاحتساب العكسي.') AS note
    WHERE EXISTS (SELECT 1 FROM treatments WHERE tax_treatment = 'reverse_charge')
    UNION ALL
    -- Single zero-rated note carrying the reason code (LIMIT 1 mirrors the profile's
    -- `break` after the first zero_rated rollup).
    SELECT 2, jsonb_build_object(
      'code', 'ZERO_RATED',
      'text', 'Zero-rated supply (' || COALESCE(z.treatment_reason_code, 'unspecified') || ').',
      'textTranslated', 'توريد خاضع لنسبة الصفر (' || COALESCE(z.treatment_reason_code, 'unspecified') || ').')
    FROM (SELECT treatment_reason_code FROM treatments WHERE tax_treatment = 'zero_rated' LIMIT 1) z
  )
  SELECT COALESCE(jsonb_agg(note ORDER BY ord), '[]'::jsonb) INTO v_notations FROM notes;

  -- (c) atomic number mint — only when the draft has no number (post-cutover default).
  IF v_inv.invoice_number IS NULL THEN
    v_number := get_next_number('invoices');
    UPDATE invoices SET invoice_number = v_number WHERE id = p_doc_id;
  ELSE
    v_number := v_inv.invoice_number;
  END IF;

  -- (e) vat_records: one row per non-zero rollup component, base currency,
  -- tenant-local tax_period of the tax point (never created_at).
  v_tax_point := COALESCE(v_inv.supply_date, (now() AT TIME ZONE COALESCE(v_tz,'UTC'))::date);
  v_period := to_char(v_tax_point, 'YYYY-MM');
  FOR v_r IN
    SELECT * FROM document_tax_lines
    WHERE document_type = 'invoice' AND document_id = p_doc_id
      AND line_item_id IS NULL AND deleted_at IS NULL AND tax_amount <> 0
    ORDER BY sequence
  LOOP
    INSERT INTO vat_records (
      tenant_id, record_type, record_id, vat_amount, vat_rate, tax_period,
      currency, exchange_rate, vat_amount_base, taxable_amount_base,
      component_code, jurisdiction_ref, tax_treatment, regime_key,
      tax_point_date, source_document_type, source_document_id)
    VALUES (
      v_inv.tenant_id, 'sale', p_doc_id, v_r.tax_amount, v_r.rate, v_period,
      v_r.currency, v_r.exchange_rate, v_r.tax_amount_base,
      round(v_r.taxable_base * v_r.exchange_rate, v_doc_dp),
      v_r.component_code, v_r.jurisdiction_ref, v_r.tax_treatment, v_r.regime_key,
      v_tax_point, 'invoice', p_doc_id)
    RETURNING id INTO v_vat_id;
    v_vat_ids := v_vat_ids || v_vat_id;
  END LOOP;

  -- (f) e-invoice transport hook: Phase 1 default regime is no_einvoice → no
  -- einvoice_submissions row. Transports (zatca/in_irn/uk_mtd) land Phases 3-5
  -- and insert here with previous_hash chaining.

  -- (g) custody 'financial' event (v1.2.0 invariant — DB-side, unskippable).
  IF v_inv.case_id IS NOT NULL THEN
    PERFORM log_chain_of_custody(
      v_inv.case_id, NULL, 'financial', 'INVOICE_ISSUED',
      format('Tax invoice %s issued (%s %s)', v_number, v_inv.currency, v_inv.total_amount),
      NULL, 'in_custody',
      jsonb_build_object('invoice_id', p_doc_id, 'invoice_number', v_number,
                         'total_amount', v_inv.total_amount, 'tax_amount', v_inv.tax_amount,
                         'regime_key', v_regime));
  END IF;

  -- ── (c2) issuance snapshot: freeze buyer/seller identity + statutory facts ─
  -- MUST precede the (h) flip: after the flip the immutability trigger whitelist
  -- rejects these columns. Fires post_invoice_vat_record as a no-op (status stays draft).
  UPDATE invoices SET
    buyer_tax_number       = v_buyer_tax_number,
    buyer_tax_number_label = v_buyer_tax_number_label,
    buyer_address          = v_buyer_address,
    seller_tax_number      = v_seller_tax_number,
    supply_date            = COALESCE(supply_date, v_tax_point),
    reverse_charge         = v_reverse_charge,
    notations              = v_notations
  WHERE id = p_doc_id;

  -- (h) issued flip — the immutability trigger takes over from here.
  UPDATE invoices
  SET status = 'sent', sent_at = now(),
      tax_regime_key = v_regime, pack_version_id = v_pack
  WHERE id = p_doc_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_tax_document: concurrent issuance detected for %', p_doc_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'document_number', v_number, 'issued_at', now(),
    'vat_record_ids', to_jsonb(v_vat_ids), 'einvoice_submission_id', NULL, 'trace', v_trace);
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- Task 18b: issue_credit_note graft (Phase-1 body + Edit D, before RETURN v_cn)
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_credit_note(p_cn jsonb, p_items jsonb)
 RETURNS credit_notes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_uid uuid; v_base text; v_bdec int;
  v_cur text; v_rate numeric; v_total numeric; v_tax numeric;
  v_cn public.credit_notes%ROWTYPE; v_num text; v_item jsonb;
BEGIN
  v_tenant := get_current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'issue_credit_note: no tenant context' USING ERRCODE='insufficient_privilege'; END IF;
  v_uid := auth.uid();
  v_cur  := COALESCE(NULLIF(p_cn->>'currency',''),'USD');
  v_rate := COALESCE(NULLIF(p_cn->>'exchange_rate','')::numeric, 1);
  v_total:= (p_cn->>'total_amount')::numeric;
  v_tax  := COALESCE(NULLIF(p_cn->>'tax_amount','')::numeric, 0);
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'issue_credit_note: total_amount must be > 0' USING ERRCODE='check_violation'; END IF;
  IF COALESCE(NULLIF(p_cn->>'reason_code',''), NULLIF(p_cn->>'reason_notes','')) IS NULL THEN
    RAISE EXCEPTION 'issue_credit_note: a reason is required' USING ERRCODE='check_violation'; END IF;

  v_base := _fin_base_currency(v_tenant); v_bdec := _fin_currency_decimals(v_base);
  v_num  := get_next_number('credit_note');

  INSERT INTO credit_notes (
    tenant_id, credit_note_number, credit_note_date, status, credit_type,
    invoice_id, case_id, customer_id, company_id, currency, exchange_rate, rate_source,
    subtotal, tax_rate, tax_amount, total_amount,
    subtotal_base, tax_amount_base, total_amount_base, reason_code, reason_notes, created_by
  ) VALUES (
    v_tenant, v_num, COALESCE(NULLIF(p_cn->>'credit_note_date','')::timestamptz, now()), 'issued',
    COALESCE(NULLIF(p_cn->>'credit_type',''),'adjustment'),
    NULLIF(p_cn->>'invoice_id','')::uuid, NULLIF(p_cn->>'case_id','')::uuid,
    NULLIF(p_cn->>'customer_id','')::uuid, NULLIF(p_cn->>'company_id','')::uuid,
    v_cur, v_rate, COALESCE(NULLIF(p_cn->>'rate_source',''),'derived'),
    COALESCE(NULLIF(p_cn->>'subtotal','')::numeric, v_total - v_tax),
    COALESCE(NULLIF(p_cn->>'tax_rate','')::numeric, 0), v_tax, v_total,
    round((v_total - v_tax) * v_rate, v_bdec), round(v_tax * v_rate, v_bdec), round(v_total * v_rate, v_bdec),
    NULLIF(p_cn->>'reason_code',''), NULLIF(p_cn->>'reason_notes',''), v_uid
  ) RETURNING * INTO v_cn;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items)='array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO credit_note_items (tenant_id, credit_note_id, description, quantity, unit_price, discount, tax_rate, tax_amount, total, sort_order)
      VALUES (v_tenant, v_cn.id, COALESCE(v_item->>'description',''),
              COALESCE(NULLIF(v_item->>'quantity','')::numeric,1), COALESCE(NULLIF(v_item->>'unit_price','')::numeric,0),
              COALESCE(NULLIF(v_item->>'discount','')::numeric,0), COALESCE(NULLIF(v_item->>'tax_rate','')::numeric,0),
              COALESCE(NULLIF(v_item->>'tax_amount','')::numeric,0), COALESCE(NULLIF(v_item->>'total','')::numeric,0),
              COALESCE(NULLIF(v_item->>'sort_order','')::int,0));
    END LOOP;
  END IF;

  INSERT INTO financial_transactions (tenant_id, transaction_type, amount, currency, transaction_date,
    description, reference_type, reference_id, exchange_rate, rate_source, amount_base, status, created_by)
  VALUES (v_tenant, 'income', -(v_total - v_tax), v_cur, v_cn.credit_note_date,
    'Credit note '||v_num, 'credit_note', v_cn.id, v_rate, 'derived', round(-(v_total - v_tax)*v_rate, v_bdec), 'posted', v_uid);

  -- ── Edit D: Phase 2 requirement gate + snapshots (grafted into issue_credit_note) ──
  -- Reuse the standalone evaluator (Task 17) — one gate implementation for all doc types.
  -- No dry-run parameter here: a block failure RAISEs synchronously (the modal catches
  -- P0403, Task 19). The whole function is one txn, so a RAISE rolls back the CN insert.
  DECLARE
    v_cn_country_id uuid;
    v_cn_pack_version int;
    v_cn_buyer_tax text; v_cn_buyer_label text; v_cn_buyer_addr jsonb;
    v_cn_seller_tax text; v_cn_facts jsonb; v_cn_failures jsonb; v_cn_has_block boolean;
    v_cn_reverse boolean := false; v_cn_notations jsonb := '[]'::jsonb;
  BEGIN
    SELECT t.country_id, t.country_pack_version INTO v_cn_country_id, v_cn_pack_version
    FROM tenants t WHERE t.id = v_cn.tenant_id;

    -- «buyer-identity:begin» (kept structurally equivalent to issue_tax_document — drift-tested)
    SELECT c.tax_number,
           jsonb_strip_nulls(jsonb_build_object('line1', c.address_line1, 'line2', c.address_line2,
             'subdivision_id', c.subdivision_id, 'subdivision', sub.name,
             'postal_code', c.postal_code, 'free_text', c.address))
      INTO v_cn_buyer_tax, v_cn_buyer_addr
    FROM customers_enhanced c
    LEFT JOIN geo_subdivisions sub ON sub.id = c.subdivision_id AND sub.deleted_at IS NULL
    WHERE c.id = v_cn.customer_id AND c.deleted_at IS NULL;

    IF v_cn.company_id IS NOT NULL THEN
      SELECT COALESCE(co.tax_number, v_cn_buyer_tax),
             COALESCE(jsonb_strip_nulls(jsonb_build_object('line1', co.address_line1, 'line2', co.address_line2,
               'subdivision_id', co.subdivision_id, 'subdivision', sub.name,
               'postal_code', co.postal_code, 'free_text', co.address)), v_cn_buyer_addr)
        INTO v_cn_buyer_tax, v_cn_buyer_addr
      FROM companies co
      LEFT JOIN geo_subdivisions sub ON sub.id = co.subdivision_id AND sub.deleted_at IS NULL
      WHERE co.id = v_cn.company_id AND co.deleted_at IS NULL;
    END IF;

    SELECT le.tax_identifier INTO v_cn_seller_tax
    FROM legal_entities le
    WHERE le.tenant_id = v_cn.tenant_id AND le.is_primary AND le.deleted_at IS NULL LIMIT 1;
    SELECT g.tax_number_label INTO v_cn_buyer_label FROM geo_countries g WHERE g.id = v_cn_country_id;
    -- «buyer-identity:end»

    -- A credit note mirrors its source invoice: copy the frozen reverse_charge +
    -- notations from the source (a CN's own document_tax_lines are contra copies).
    IF v_cn.invoice_id IS NOT NULL THEN
      SELECT COALESCE(i.reverse_charge, false), COALESCE(i.notations, '[]'::jsonb)
        INTO v_cn_reverse, v_cn_notations
      FROM invoices i WHERE i.id = v_cn.invoice_id;
    END IF;

    IF v_cn_pack_version IS NOT NULL AND v_cn_country_id IS NOT NULL THEN
      v_cn_facts := jsonb_strip_nulls(jsonb_build_object(
        'buyer_is_business', (v_cn.company_id IS NOT NULL),
        'buyer_tax_number', v_cn_buyer_tax,
        'seller_registered', (v_cn_seller_tax IS NOT NULL),
        'seller_tax_number', v_cn_seller_tax,
        'document_total', v_cn.total_amount
      )) || jsonb_build_object('buyer_address', COALESCE(v_cn_buyer_addr, '{}'::jsonb));

      v_cn_failures := evaluate_document_requirements('credit_note', v_cn_country_id, CURRENT_DATE, v_cn_facts);
      SELECT COALESCE(bool_or(f ->> 'level' = 'block'), false) INTO v_cn_has_block
      FROM jsonb_array_elements(v_cn_failures) f;
      IF v_cn_has_block THEN
        RAISE EXCEPTION 'REQUIREMENTS_NOT_MET: %', v_cn_failures::text
          USING ERRCODE = 'P0403',
                HINT = 'master_document_requirements gate (credit_note) — resolve the blocking fields and reissue';
      END IF;
    END IF;

    UPDATE credit_notes SET
      buyer_tax_number = v_cn_buyer_tax, buyer_tax_number_label = v_cn_buyer_label,
      buyer_address = v_cn_buyer_addr, seller_tax_number = v_cn_seller_tax,
      reverse_charge = v_cn_reverse, notations = v_cn_notations
    WHERE id = v_cn.id;
  END;

  RETURN v_cn;
END; $function$;
