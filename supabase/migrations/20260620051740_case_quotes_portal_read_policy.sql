-- Portal identity (audit C4): every other portal-reachable table has a TO portal
-- read policy scoped to the customer, but case_quotes was missed — so a logged-in
-- portal customer (running as the `portal` role) saw zero quotes. Add the matching
-- policy, scoped via case_id -> cases.customer_id (case_quotes has no direct
-- customer_id), and grant the role table SELECT. Inert for staff/anon (TO portal).
GRANT SELECT ON public.case_quotes TO portal;

DROP POLICY IF EXISTS case_quotes_portal_read ON public.case_quotes;
CREATE POLICY case_quotes_portal_read ON public.case_quotes
  AS PERMISSIVE FOR SELECT TO portal
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_quotes.case_id
        AND c.customer_id = get_current_portal_customer_id()
    )
  );
