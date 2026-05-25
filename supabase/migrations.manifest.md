# Migration Manifest

Every applied migration must appear here. Verified by `scripts/check-migration-manifest.sh`.

| version | filename | classification | summary | PR |
|---|---|---|---|---|
| 20260407100420 | 20260407100420_populate_country_phone_codes.sql | (historical) | populate_country_phone_codes | |
| 20260409000000 | 20260409000000_baseline_schema.sql | (historical) | baseline_schema | |
| 20260409104128 | fix_schema_mismatches_for_frontend | (historical) | fix_schema_mismatches_for_frontend | |
| 20260409114712 | add_profile_fks_for_postgrest_joins | (historical) | add_profile_fks_for_postgrest_joins | |
| 20260513174236 | add_tenants_theme_column | (historical) | add_tenants_theme_column | |
| 20260514074316 | add_log_case_checkout_function_and_portal_visibility_unique | (historical) | add_log_case_checkout_function_and_portal_visibility_unique | |
| 20260514075237 | portal_auth_password_verification_p0_1 | (historical) | portal_auth_password_verification_p0_1 | |
| 20260514081548 | add_tenant_audit_trigger_to_customer_company_relationships | (historical) | add_tenant_audit_trigger_to_customer_company_relationships | |
| 20260525000840 | add_restrictive_policies_profiles_and_platform_audit_logs | RLS-only | Phase 6 M1 — add RESTRICTIVE tenant-isolation + platform-only policies (defense-in-depth) | |
| 20260525001115 | add_tenant_and_audit_trigger_to_eligible_tables | Additive | Phase 6 M2a — bulk-apply set_*_tenant_and_audit trigger to 100 tenant tables already having required audit columns | |
| 20260525001451 | add_audit_columns_and_trigger_to_remaining_tenant_tables | Conditional rename | Phase 6 M2b — add created_at/updated_at where missing on 55 tenant tables, then apply trigger | |
| 20260525001551 | billing_events_tenant_id_not_null_and_cascade | Conditional | Phase 6 M3 — billing_events.tenant_id SET NOT NULL + FK ON DELETE CASCADE | |
| 20260525024225 | revoke_execute_on_internal_trigger_functions | RLS-only | Phase 6 M6 — REVOKE EXECUTE on set_tenant_and_audit_fields + update_updated_at_column + handle_new_user from anon/authenticated (closes RPC exposure) | |
| 20260525024232 | convert_security_definer_views_to_security_invoker | RLS-only | Phase 6 M7 — security_invoker=true on public.customers + v_chain_of_custody_timeline (prevents cross-tenant leak via views) | |
| 20260525024302 | harden_function_search_paths | RLS-only | Phase 6 M9 — SET search_path on 11 functions (closes schema-poisoning vulnerability) | |
