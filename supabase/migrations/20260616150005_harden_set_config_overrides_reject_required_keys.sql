-- PR-A hardening (review must-fix #2): the set RPC must reject REQUIRED jurisdiction
-- keys server-side, not rely on the client isConfigKeyLocked guard. The validate
-- trigger only blocks maxOverrideLayer:'country' keys (parity-gated) — it intentionally
-- does NOT cover required:true keys, so a direct rpc() call by a tenant admin could
-- otherwise shadow currency.code/tax.label/tax.default_rate/amount-in-words-minor-units
-- (defeating D11). Guard added in the RPC (parity-gate-safe: the trigger is untouched).
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

  -- Reject required jurisdiction keys (the validate trigger covers only country-locked
  -- statutory keys; these required keys are the other half of the lock surface, D11).
  IF p_overrides ?| ARRAY[
       'currency.code', 'locale.code', 'tax.label', 'tax.default_rate',
       'number_format.amount_in_words_minor_units'
     ] THEN
    RAISE EXCEPTION 'Required jurisdiction config keys cannot be overridden at the tenant layer';
  END IF;

  UPDATE public.tenants
     SET country_config_overrides = COALESCE(country_config_overrides, '{}'::jsonb) || p_overrides
   WHERE id = p_tenant_id
   RETURNING country_config_overrides INTO v_new;  -- validate_country_config_overrides() trigger also fires here

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
