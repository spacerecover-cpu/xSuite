-- Seed plan_modules (gateable modules only; excluded = implicit false via refresh LEFT JOIN)
INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT p.id, m.id, true FROM subscription_plans p CROSS JOIN master_modules m
WHERE p.slug='enterprise' AND m.is_gateable AND m.is_active
ON CONFLICT (plan_id, module_id) DO UPDATE SET is_included=EXCLUDED.is_included, updated_at=now();

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT p.id, m.id, true FROM subscription_plans p
JOIN master_modules m ON m.slug IN ('cases','customers','quotes','invoices','inventory','reports','banking','expenses') AND m.is_gateable
WHERE p.slug='professional'
ON CONFLICT (plan_id, module_id) DO UPDATE SET is_included=EXCLUDED.is_included, updated_at=now();

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT p.id, m.id, true FROM subscription_plans p
JOIN master_modules m ON m.slug IN ('cases','customers','quotes','invoices','reports') AND m.is_gateable
WHERE p.slug='starter'
ON CONFLICT (plan_id, module_id) DO UPDATE SET is_included=EXCLUDED.is_included, updated_at=now();

-- Grandfather every active tenant to ALL gateable modules (source='grandfather').
DO $$
BEGIN
  PERFORM set_config('app.bypass_tenant_guard','true', true);
  INSERT INTO tenant_module_entitlements (tenant_id, module_slug, enabled, source)
  SELECT t.id, m.slug, true, 'grandfather'
  FROM tenants t CROSS JOIN master_modules m
  WHERE t.deleted_at IS NULL AND m.is_gateable AND m.is_active
  ON CONFLICT (tenant_id, module_slug) DO UPDATE SET enabled=true, source='grandfather', updated_at=now(), deleted_at=NULL;
END $$;
