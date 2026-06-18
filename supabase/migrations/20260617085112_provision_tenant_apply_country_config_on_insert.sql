-- Slice 0 (currency P4): populate resolved_country_config at tenant creation.
-- Freshly provisioned tenants previously had resolved_country_config = '{}' because
-- the only writer (_apply_country_config) was never called at INSERT — only via the
-- manual resync RPC / P3 backfill. That made getTenantConfig() throw CountryConfigError
-- on required keys (tax.label, tax.default_rate) and hard-block the whole app with
-- "Tenant not configured". _apply_country_config builds the bag from geo_countries
-- (scalar columns + the country_config jsonb, which carries every required key incl.
-- tax.default_rate). Wiring it as an AFTER INSERT trigger makes population atomic and
-- unbypassable by any client/edge path. Reversible: DROP TRIGGER + DROP FUNCTION.

CREATE OR REPLACE FUNCTION public.trg_apply_country_config_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- INSERT-only: _apply_country_config issues an UPDATE on this same row, so this
  -- trigger must never fire on UPDATE (would recurse). AFTER INSERT only.
  PERFORM public._apply_country_config(NEW.id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_apply_country_config ON public.tenants;
CREATE TRIGGER trg_tenants_apply_country_config
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  WHEN (NEW.country_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_apply_country_config_on_insert();
