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
| 20260525030723 | create_supplier_documents_storage_bucket | Additive | CI fix — creates supplier-documents bucket + RLS policies (DocumentUploadModal was targeting non-existent 'documents' bucket) | |
| 20260525053058 | p0_bugfix_sweep_small_additive | Additive | P0 sweep A3+A6+A7+A13 — inventory_search_templates description/usage_count, stock_locations is_default/sort_order, financial_transactions status/ref/notes, payroll_adjustments+database_backups+kb_article_versions missing cols | |
| 20260525053117 | p0_bugfix_sweep_template_doc_salary | Additive | P0 sweep A10+A11+A12 — master_template_categories metadata + master_template_types relations, document_templates 7 cols, salary_components 5 cols | |
| 20260525053135 | p0_bugfix_sweep_stock_items_and_sales | Additive | P0 sweep A4+A5 — stock_items 9 form-field cols, stock_sales payment_status/method_id | |
| 20260525053212 | p0_a1_invoice_conversion_linkage | Additive | P0-A1 — invoices.converted_to_invoice_id + proforma_invoice_id + converted_at + FK on converted_from_quote_id + 3 partial indexes (unlocks CaseFinancesTab chain UI) | |
| 20260525053219 | p0_a2_stock_sale_item_invoice_linkage | Additive | P0-A2 — stock_sale_items.invoice_line_item_id FK + stock_sales.invoice_id FK (re-enables addSaleToInvoice flow deleted in C2 sweep) | |
| 20260525053226 | p0_a8_bank_transactions_debit_credit_split | Additive | P0-A8 — debit_amount + credit_amount generated columns + running_balance + composite index | |
| 20260525053232 | p0_a9_payments_case_id_direct_link | Additive | P0-A9 — payments.case_id FK + backfill from invoices.case_id (restores PaymentsList "View Related Case" path) | |
| 20260525053307 | p0_s4_audit_trail_capture_ip_and_ua | RLS-only | P0-S4 part 1 — log_audit_trail RPC now captures IP + User-Agent from PostgREST request.headers session var; accepts optional override params | |
| 20260525053340 | p0_s4_audit_trails_immutability | RLS-only | P0-S4 part 2 — REVOKE UPDATE/DELETE on 9 audit tables from authenticated/anon + prevent_audit_mutation() trigger as belt-and-suspenders (audit log append-only enforcement) | |
| 20260525053417 | p0_s5_mfa_enforcement_scaffold | Additive | P0-S5 — tenants.require_mfa_for_admins bool DEFAULT false (frontend enforcement deferred to follow-up commit) | |
