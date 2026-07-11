-- WP-B (FU-1 lens follow-up): portal quote approval was dead end-to-end.
-- Applied live as versions 20260710174846 (rewrite) + 20260710174936
-- (log_audit_trail overload disambiguation — the 6-arg call was ambiguous
-- against the (…, inet, text) overload, same trap as
-- fix_inventory_custody_rpcs_audit_overload_cast). This file records the FINAL
-- live state (v2 bodies + grants).
--
-- What was broken: approve_quote / reject_quote wrote ONLY quotes.status_id via
-- lookups of master_quote_statuses names 'Approved' / 'Rejected' — names that
-- do not exist (catalog has 'Accepted' / 'Declined') — so they set
-- status_id = NULL and never touched the text quotes.status column that every
-- UI surface reads (0 of 1,138 quotes carry a non-NULL status_id). The portal
-- role also had no EXECUTE grant. Stage 7 (Quotation & Approval) customer
-- authorization left no visible state change and no forensic trace.
--
-- The rewrite:
--   * gates on status = 'sent' (only an issued, awaiting-customer quote is
--     actionable; drafts are not approvable; a second call fails loud)
--   * writes the canonical lowercase text status ('accepted' / 'rejected',
--     owner decision 2026-07-10) plus the real catalog status_id
--   * stamps approved_at/approved_by or rejected_at/rejection_reason
--     (reason capped at 2000 chars)
--   * logs a DB-side audit_trails entry and, for case-linked quotes, a
--     chain-of-custody 'financial' event (QUOTE_APPROVED / QUOTE_REJECTED)
--     with source portal|staff — recovery authorization is forensically
--     traceable regardless of caller
--   * grants: authenticated + portal; PUBLIC/anon revoked

CREATE OR REPLACE FUNCTION public.approve_quote(p_quote_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_before quotes%ROWTYPE;
  v_actor text;
BEGIN
  SELECT * INTO v_before FROM quotes
   WHERE id = p_quote_id
     AND deleted_at IS NULL
     AND tenant_id = get_current_tenant_id()
     AND (get_current_portal_customer_id() IS NULL OR customer_id = get_current_portal_customer_id())
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_quote: quote % not found or not accessible', p_quote_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_before.status <> 'sent' THEN
    RAISE EXCEPTION 'approve_quote: quote % is ''%'' — only a sent quote can be accepted', p_quote_id, v_before.status USING ERRCODE = 'check_violation';
  END IF;
  v_actor := COALESCE(auth.uid()::text, get_current_portal_customer_id()::text);
  UPDATE quotes SET
    status = 'accepted',
    status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Accepted' AND is_active),
    approved_at = now(),
    approved_by = v_actor,
    updated_at = now()
  WHERE id = p_quote_id;
  PERFORM log_audit_trail(
    'quotes', p_quote_id, 'update',
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'accepted', 'approved_by', v_actor,
                       'source', CASE WHEN auth.uid() IS NULL THEN 'portal' ELSE 'staff' END),
    ARRAY['status', 'status_id', 'approved_at', 'approved_by'],
    NULL::inet, NULL::text);
  IF v_before.case_id IS NOT NULL THEN
    PERFORM log_chain_of_custody(
      v_before.case_id, NULL, 'financial', 'QUOTE_APPROVED',
      'Quote ' || COALESCE(v_before.quote_number, p_quote_id::text) || ' accepted'
        || CASE WHEN auth.uid() IS NULL THEN ' by the customer via the portal' ELSE '' END,
      NULL, NULL,
      jsonb_build_object('quote_id', p_quote_id,
                         'source', CASE WHEN auth.uid() IS NULL THEN 'portal' ELSE 'staff' END));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_before quotes%ROWTYPE;
  v_reason text;
BEGIN
  SELECT * INTO v_before FROM quotes
   WHERE id = p_quote_id
     AND deleted_at IS NULL
     AND tenant_id = get_current_tenant_id()
     AND (get_current_portal_customer_id() IS NULL OR customer_id = get_current_portal_customer_id())
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reject_quote: quote % not found or not accessible', p_quote_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_before.status <> 'sent' THEN
    RAISE EXCEPTION 'reject_quote: quote % is ''%'' — only a sent quote can be rejected', p_quote_id, v_before.status USING ERRCODE = 'check_violation';
  END IF;
  v_reason := left(NULLIF(p_reason, ''), 2000);
  UPDATE quotes SET
    status = 'rejected',
    status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Declined' AND is_active),
    rejected_at = now(),
    rejection_reason = v_reason,
    updated_at = now()
  WHERE id = p_quote_id;
  PERFORM log_audit_trail(
    'quotes', p_quote_id, 'update',
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'rejected', 'rejection_reason', v_reason,
                       'source', CASE WHEN auth.uid() IS NULL THEN 'portal' ELSE 'staff' END),
    ARRAY['status', 'status_id', 'rejected_at', 'rejection_reason'],
    NULL::inet, NULL::text);
  IF v_before.case_id IS NOT NULL THEN
    PERFORM log_chain_of_custody(
      v_before.case_id, NULL, 'financial', 'QUOTE_REJECTED',
      'Quote ' || COALESCE(v_before.quote_number, p_quote_id::text) || ' declined'
        || CASE WHEN auth.uid() IS NULL THEN ' by the customer via the portal' ELSE '' END
        || CASE WHEN v_reason IS NOT NULL THEN ': ' || v_reason ELSE '' END,
      NULL, NULL,
      jsonb_build_object('quote_id', p_quote_id,
                         'source', CASE WHEN auth.uid() IS NULL THEN 'portal' ELSE 'staff' END));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_quote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_quote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_quote(uuid) TO authenticated, portal;
GRANT EXECUTE ON FUNCTION public.reject_quote(uuid, text) TO authenticated, portal;
