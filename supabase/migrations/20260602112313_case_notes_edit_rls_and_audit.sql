ALTER POLICY case_internal_notes_update ON public.case_internal_notes
  USING (created_by = auth.uid() OR has_role('admin'::text))
  WITH CHECK (created_by = auth.uid() OR has_role('admin'::text));

CREATE OR REPLACE FUNCTION public.update_case_note(p_note_id uuid, p_content text)
RETURNS public.case_internal_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant_id uuid; v_old public.case_internal_notes; v_new public.case_internal_notes;
BEGIN
  v_tenant_id := get_current_tenant_id();
  SELECT * INTO v_old FROM case_internal_notes WHERE id = p_note_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Note % not found in current tenant', p_note_id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (v_old.created_by = auth.uid() OR has_role('admin'::text)) THEN
    RAISE EXCEPTION 'Only the note author or an admin may edit this note' USING ERRCODE = '42501';
  END IF;
  UPDATE case_internal_notes SET content = p_content, updated_at = now()
   WHERE id = p_note_id AND tenant_id = v_tenant_id RETURNING * INTO v_new;
  INSERT INTO case_job_history (tenant_id, case_id, action, details, old_value, new_value, performed_by)
  VALUES (v_tenant_id, v_old.case_id, 'note_updated', json_build_object('note_id', p_note_id)::text, v_old.content, p_content, auth.uid());
  RETURN v_new;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_case_note(uuid, text) TO authenticated;
