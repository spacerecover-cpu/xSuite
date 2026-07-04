-- P3 numbering regression probes (WP-3 Task 13). Repeatable SQL evidence for the
-- phase-brief claims: {FY}/{SEQ:n} template rendering, legacy prefix fallback,
-- legal-scope counter-rewind protection, anon-grant posture, and policy-fill.
--
-- HOW TO RUN: via mcp__supabase__execute_sql (or psql) with a tenant-admin JWT.
-- Mutating probes (#3 rewind, #6 mint) are wrapped in a DO block that RAISEs at the
-- end so the whole transaction ROLLS BACK — never straight at the demo tenant's live
-- counters, and no Supabase branch required.
-- Session JWT for the recorded run (OM demo tenant owner):
--   set_config('request.jwt.claims',
--     '{"sub":"b4b86e5d-de36-4059-9237-0018157c9f1d","tenant_id":"4803501b-87a1-4a0e-abbe-8d7d45eeb4fc","role":"authenticated"}', true)
--
-- ⚠️ THIS PROBE PACK FOUND A LIVE BUG (see probes 1/2/6): get_next_number and
--    preview_number_format used LPAD(v_next, padding), which TRUNCATES when the
--    number is longer than padding — OM 'invoices' at current_value=10192, padding=4
--    rendered 10193 as '1019' (a legal-document-number integrity bug, design-doc
--    Risk #8). FIXED in migration phase3_fix_lpad_sequence_truncation (owner-approved):
--    a min-width helper format_sequence_number(bigint,int) that pads-to-minimum and
--    never truncates, wired into both functions' 4 LPAD sites. ACTUALs below are the
--    POST-FIX values; the pre-fix (buggy) values are noted inline.

-- 1. Template rendering: {FY}/{SEQ:n} tokens produce the documented shape.
SELECT preview_number_format('invoices', 'INV/{FY}/{SEQ:4}') AS rendered;
-- EXPECT: 'INV/<fiscal-year label>/<next seq, min 4 digits>'.
-- ACTUAL (post-fix): INV/2026-27/10193    [pre-fix BUG: INV/2026-27/1019 — truncated]

-- 2. Legacy fallback: NULL format_template keeps exact PREFIX-<seq> rendering.
SELECT preview_number_format('invoices', NULL) AS rendered;
-- EXPECT: 'INVO-<next seq, min 4 digits>' (prefix INVO, padding 4, current_value 10192 -> next 10193).
-- ACTUAL (post-fix): INVO-10193           [pre-fix BUG: INVO-1019 — truncated to 4 chars]

-- 3. Legal-scope rewind protection (Phase-1 guard must still hold after P3 wiring).
--    Run inside a DO block with a tenant-admin JWT; the attempt must RAISE, and the
--    outer RAISE rolls the transaction back regardless.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b4b86e5d-de36-4059-9237-0018157c9f1d","tenant_id":"4803501b-87a1-4a0e-abbe-8d7d45eeb4fc","role":"authenticated"}', true);
  BEGIN
    PERFORM update_number_sequence('invoices','INVO',4,false,1,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'PROBE3 FAIL: rewind was NOT blocked';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROBE3 rewind blocked (expected): %', SQLERRM;
  END;
END $$;
-- EXPECT: ERROR mentioning rewind/issued-max block for legal scope 'invoices'.
-- ACTUAL: BLOCKED: update_number_sequence: rewinding invoices below 10192 would duplicate legal document numbers

-- 4. anon grant posture (SEC-1 must survive every recreate):
SELECT p.proname, NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_revoked
FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname='public'
  AND p.proname IN ('update_number_sequence','get_next_number','apply_country_numbering_policy',
                    'file_vat_return','preview_number_format','format_sequence_number');
-- EXPECT: anon_revoked = true on every row.
-- ACTUAL: all true (apply_country_numbering_policy, file_vat_return, format_sequence_number,
--         get_next_number, preview_number_format, update_number_sequence — all anon_revoked=true).

-- 5. Policy fill is visible to get_next_number: after an admin sets a template via
--    the SystemNumbers UI (or update_number_sequence), the next mint uses it.
SELECT format_template, reset_basis, fiscal_year_anchor
FROM number_sequences WHERE scope='invoices' AND tenant_id='4803501b-87a1-4a0e-abbe-8d7d45eeb4fc';
-- EXPECT: reflects the configured values (NULLs before configuration, values after).
-- ACTUAL (OM, unconfigured): (NULL, NULL, NULL) — apply_country_numbering_policy is a no-op
--         on the all-NULL GCC legacy-prefix seeds (verified: apply returns 0, idempotent).

-- 6. Min-width padding (the fix): mint from a large counter renders FULL digits, and a
--    short counter still pads to the minimum. Rolled back.
DO $$
DECLARE v_big text; v_small text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b4b86e5d-de36-4059-9237-0018157c9f1d","tenant_id":"4803501b-87a1-4a0e-abbe-8d7d45eeb4fc","role":"authenticated"}', true);
  v_big := get_next_number('invoices');  -- current_value 10192 -> 10193
  UPDATE number_sequences SET current_value = 5 WHERE scope='invoices' AND tenant_id = get_current_tenant_id();
  v_small := get_next_number('invoices'); -- 5 -> 6
  RAISE EXCEPTION 'PROBE6 min-width: big(10192->)=[%] small(5->)=[%] (rolled back)', v_big, v_small;
END $$;
-- EXPECT: big = 'INVO-10193' (full, NOT truncated), small = 'INVO-0006' (padded to 4).
-- ACTUAL: big=[INVO-10193] small=[INVO-0006]  ✓ (pre-fix big would have been 'INVO-1019')

-- NOTE (carry-forward, not fixed here): assign_receipt_number / assign_tenant_code /
-- data_migration_finalize also LPAD sequences and share the same truncation class —
-- flagged for separate review (receipt numbers most warrant it). The OM 'invoices'
-- prefix is 'INVO' while historical imported invoice_numbers use a "TAX INVOICE####"
-- format — a data-import prefix mismatch, orthogonal to this LPAD fix.
