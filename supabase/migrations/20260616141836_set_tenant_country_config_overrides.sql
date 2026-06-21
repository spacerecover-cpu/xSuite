-- Localization Center (Phase 3) write path. No writer to tenants.country_config_overrides
-- existed; these RPCs are the sole sanctioned path. They MERGE (||) so a single-field
-- save never clobbers the rest of the jsonb bag, re-assert admin authz (SECURITY DEFINER
-- bypasses RLS), and audit. The existing validate_country_config_overrides() BEFORE trigger
-- still fires here and rejects any statutory (maxOverrideLayer:'country') key for free.
-- (Required-jurisdiction-key rejection was added in 20260616150005.)

CREATE OR REPLACE FUNCTION public.set_tenant_country_config_overrides(
  p_tenant_id uuid,
  p_overrides jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb;
BEGIN
  IF NOT ((p_tenant_id = get_current_tenant_id() AND has_role('admin')) OR is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized to update tenant config overrides';
  END IF;

  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'p_overrides must be a JSON object';
  END IF;

  UPDATE public.tenants
     SET country_config_overrides = COALESCE(country_config_overrides, '{}'::jsonb) || p_overrides
   WHERE id = p_tenant_id
   RETURNING country_config_overrides INTO v_new;  -- validate_country_config_overrides() trigger fires here

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  PERFORM log_audit_trail(
    'tenant', p_tenant_id, 'config.override.set',
    NULL::jsonb, p_overrides,
    ARRAY(SELECT jsonb_object_keys(p_overrides)),
    NULL::inet, NULL::text
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_tenant_country_config_overrides(
  p_tenant_id uuid,
  p_keys text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb;
  v_resolved jsonb;
  k text;
BEGIN
  IF NOT ((p_tenant_id = get_current_tenant_id() AND has_role('admin')) OR is_platform_admin()) THEN
    RAISE EXCEPTION 'Not authorized to update tenant config overrides';
  END IF;

  IF p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RAISE EXCEPTION 'p_keys must be a non-empty array';
  END IF;

  SELECT resolved_country_config INTO v_resolved FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  -- Anti-brick: refuse to clear a required jurisdiction key that is not otherwise
  -- resolvable from resolved_country_config (would make the resolver fail-loud and
  -- lock the tenant out of the app shell).
  FOREACH k IN ARRAY p_keys LOOP
    IF k IN ('currency.code', 'locale.code', 'tax.label', 'tax.default_rate',
             'number_format.amount_in_words_minor_units')
       AND NOT (COALESCE(v_resolved, '{}'::jsonb) ? k) THEN
      RAISE EXCEPTION 'Refusing to clear required key % (would unconfigure tenant)', k;
    END IF;
  END LOOP;

  UPDATE public.tenants
     SET country_config_overrides = COALESCE(country_config_overrides, '{}'::jsonb) - p_keys
   WHERE id = p_tenant_id
   RETURNING country_config_overrides INTO v_new;

  PERFORM log_audit_trail(
    'tenant', p_tenant_id, 'config.override.reset',
    NULL::jsonb, to_jsonb(p_keys),
    p_keys,
    NULL::inet, NULL::text
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_country_config_overrides(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.reset_tenant_country_config_overrides(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_country_config_overrides(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_tenant_country_config_overrides(uuid, text[]) TO authenticated;
