-- Phase 9 (Document Studio): let a portal customer READ the PDF of their OWN
-- delivered/signed-off documents so they can review before signing off.
-- Fail-closed + conservative: the portal role gets a base SELECT privilege on
-- storage.objects, but RLS still restricts visibility to ONLY case-report-pdfs
-- objects whose document_instance is delivered/visible and belongs to the
-- current portal customer's case. No other bucket is reachable (no other
-- TO portal storage policy exists).

GRANT SELECT ON storage.objects TO portal;

CREATE POLICY "Portal customers read own delivered document pdfs"
  ON storage.objects
  AS PERMISSIVE FOR SELECT TO portal
  USING (
    bucket_id = 'case-report-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.document_instances di
      JOIN public.cases c ON c.id = di.case_id
      WHERE di.pdf_storage_path = storage.objects.name
        AND di.deleted_at IS NULL
        AND di.visible_to_customer = true
        AND di.status IN ('delivered', 'signed_off')
        AND c.customer_id = public.get_current_portal_customer_id()
    )
  );
