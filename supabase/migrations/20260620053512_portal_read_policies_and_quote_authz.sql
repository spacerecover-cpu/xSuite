-- Portal identity read-path completion (audit C4) + quote-write authz hardening.
-- Adds the remaining TO portal SELECT policies for the tables the portal pages
-- read (each customer-scoped via get_current_portal_customer_id()), and scopes
-- approve_quote/reject_quote to the portal customer so a portal principal can't
-- act on another customer's quote. Inert for staff/anon (TO portal / null portal
-- claim). case_job_history is intentionally NOT exposed — it's the raw internal
-- audit log (action/details/old_value/new_value/performed_by) with no visibility
-- flag; a customer-facing timeline is a separate product decision.
--
-- Verified by SQL role/claim simulation: a portal principal sees zero rows that
-- don't trace to its own customer in any of the 5 tables, the global lookup is
-- readable, and approve_quote/reject_quote no-op on another customer's quote
-- while approving the principal's own.

-- 1. case_report_sections: report_id -> case_reports.case_id -> cases.customer_id
GRANT SELECT ON public.case_report_sections TO portal;
DROP POLICY IF EXISTS case_report_sections_portal_read ON public.case_report_sections;
CREATE POLICY case_report_sections_portal_read ON public.case_report_sections
  AS PERMISSIVE FOR SELECT TO portal
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.case_reports r JOIN public.cases c ON c.id = r.case_id
    WHERE r.id = case_report_sections.report_id
      AND r.deleted_at IS NULL AND c.deleted_at IS NULL
      AND c.customer_id = get_current_portal_customer_id()
  ));

-- 2. case_quote_items: quote_id -> case_quotes.case_id -> cases.customer_id
GRANT SELECT ON public.case_quote_items TO portal;
DROP POLICY IF EXISTS case_quote_items_portal_read ON public.case_quote_items;
CREATE POLICY case_quote_items_portal_read ON public.case_quote_items
  AS PERMISSIVE FOR SELECT TO portal
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.case_quotes q JOIN public.cases c ON c.id = q.case_id
    WHERE q.id = case_quote_items.quote_id
      AND q.deleted_at IS NULL AND c.deleted_at IS NULL
      AND c.customer_id = get_current_portal_customer_id()
  ));

-- 3. customer_communications: direct customer_id
GRANT SELECT ON public.customer_communications TO portal;
DROP POLICY IF EXISTS customer_communications_portal_read ON public.customer_communications;
CREATE POLICY customer_communications_portal_read ON public.customer_communications
  AS PERMISSIVE FOR SELECT TO portal
  USING (deleted_at IS NULL AND customer_id = get_current_portal_customer_id());

-- 4. stock_sales: direct customer_id
GRANT SELECT ON public.stock_sales TO portal;
DROP POLICY IF EXISTS stock_sales_portal_read ON public.stock_sales;
CREATE POLICY stock_sales_portal_read ON public.stock_sales
  AS PERMISSIVE FOR SELECT TO portal
  USING (deleted_at IS NULL AND customer_id = get_current_portal_customer_id());

-- 5. master_case_priorities: global lookup (no tenant/customer data)
GRANT SELECT ON public.master_case_priorities TO portal;
DROP POLICY IF EXISTS master_case_priorities_portal_read ON public.master_case_priorities;
CREATE POLICY master_case_priorities_portal_read ON public.master_case_priorities
  AS PERMISSIVE FOR SELECT TO portal
  USING (true);

-- 6. Quote write authz: constrain portal principals to their OWN quotes. Staff
-- (get_current_portal_customer_id() IS NULL) keep tenant-only scoping unchanged.
CREATE OR REPLACE FUNCTION public.approve_quote(p_quote_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotes SET
    status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Approved'),
    approved_at = now(),
    approved_by = COALESCE(auth.uid()::text, get_current_portal_customer_id()::text),
    updated_at = now()
  WHERE id = p_quote_id
    AND tenant_id = get_current_tenant_id()
    AND (get_current_portal_customer_id() IS NULL OR customer_id = get_current_portal_customer_id());
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotes SET
    status_id = (SELECT id FROM master_quote_statuses WHERE name = 'Rejected'),
    rejected_at = now(),
    rejection_reason = p_reason,
    updated_at = now()
  WHERE id = p_quote_id
    AND tenant_id = get_current_tenant_id()
    AND (get_current_portal_customer_id() IS NULL OR customer_id = get_current_portal_customer_id());
END;
$function$;
