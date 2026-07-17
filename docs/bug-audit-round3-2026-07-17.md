# xSuite Codebase Bug Audit — Round 3

**Date:** 2026-07-17  
**Branch:** `claude/bug-check-cpzy8m` · **HEAD audited:** `037faa7` (PR #421, round-2 fixes merged)

**Method.** Third multi-agent audit, run *after* the round-1 (90 bugs, PRs #419/#420) and round-2 (122 bugs, PR #421) fixes merged. 34 finders fanned out across every domain plus cross-cutting dimensions (timezone/date math, money math, soft-delete filters, tenant isolation, races/atomicity, swallowed errors, query-cache staleness, form round-trips) and areas the prior rounds under-sampled — with a dedicated **regression sweep over the round-2 fix commit itself** (`037faa7`) and the newest feature surface (thermal labels / Label Studio, merged 2026-07-11). Finders were told to exclude anything already catalogued+fixed in rounds 1–2. Candidates were positionally + semantically deduped, then **each finding was adversarially re-verified by an independent agent instructed to refute it**; every surviving critical/high finding got a **second independent confirmation vote**. Findings are in current `.ts`/`.tsx` source (read directly) or verified against live migration SQL.

> `CONFIRMED` = independently reproduced by tracing the failure end-to-end. `double-confirmed` = a second independent verifier also confirmed (all critical/high). `PLAUSIBLE` = very likely real but one precondition can't be established from source alone.

## Summary

**145 confirmed bugs** (22 double-confirmed) + 1 plausible. From 186 raw candidates → 148 unique after dedup → 145 confirmed, 2 refuted, 0 disputed on second vote.

| Severity | Count |
|---|---|
| 🔴 Critical | 1 |
| 🟠 High | 20 |
| 🟡 Medium | 81 |
| ⚪ Low | 43 |
| **Total confirmed** | **145** |

### By category

| Category | Count |
|---|---|
| money-math | 13 |
| data-loss | 9 |
| timezone-off-by-one | 7 |
| soft-delete-filter | 7 |
| tenant-isolation | 5 |
| non-atomic-write | 5 |
| swallowed-error | 5 |
| cache-invalidation | 5 |
| broken-navigation | 4 |
| race-condition | 4 |
| currency-mixing | 3 |
| incomplete-fix | 3 |
| stale-cache | 3 |
| state-machine | 2 |
| db-contract-mismatch | 2 |
| audit-integrity | 2 |
| stale-status-vocabulary | 2 |
| wrong-column-read | 2 |
| form-roundtrip-data-loss | 2 |
| broken-state-transition | 2 |
| financial-atomicity | 2 |
| soft-delete | 2 |
| data-loss-on-edit | 2 |
| broken-flow | 2 |
| wrong-data-display | 2 |
| swallowed-errors | 2 |
| db-contract | 1 |
| custody-bypass | 1 |
| auth-session | 1 |
| wrong-db-contract | 1 |
| money-currency | 1 |
| data-loss-round-trip | 1 |
| billing-double-charge | 1 |
| entitlement-bypass | 1 |
| wizard-field-loss | 1 |
| evidence-integrity | 1 |
| settings-data-loss | 1 |
| rpc-contract-mismatch | 1 |
| partial-failure-recovery | 1 |
| wrong-column-name | 1 |
| usage-limit-math | 1 |
| money-aggregation | 1 |
| data-mapping | 1 |
| timezone-forensic-export | 1 |
| tenant-suspension-enforcement | 1 |
| date-boundary | 1 |
| data-carryover | 1 |
| query-key-collision | 1 |
| query-truncation | 1 |
| kpi-derivation | 1 |
| date-timezone | 1 |
| broken-state | 1 |
| swallowed-error-data-loss | 1 |
| stale-overwrite | 1 |
| idempotency-money | 1 |
| auth-user-lookup | 1 |
| state-transition | 1 |
| status-vocabulary | 1 |
| wrong-data-read | 1 |
| stale-state-clobber | 1 |
| label-content-plumbing | 1 |
| silent-input-discard | 1 |
| receive-quantity-math | 1 |
| audit-data-loss | 1 |
| security-credential-exposure | 1 |
| tenant-config | 1 |
| mixed-scope-kpi | 1 |
| permissions | 1 |
| logic-error | 1 |
| unsatisfiable-filter | 1 |
| provisioning-rollback | 1 |
| chain-of-custody | 1 |

### Index

| # | Sev | Bug | Location |
|---|---|---|---|
| 1 | 🔴 | user-management reset-password resets ANY user's password with no tenant-ownership check (cross-tenant account takeover via service-role updateUserById) | `supabase/functions/user-management/index.ts:264` |
| 2 | 🟠 | cancel_stock_sale restocks and soft-deletes a refunded POS sale but never reverses its vat_records/document_tax_lines rows, so the tenant's VAT return permanent | `docs/migrations-pending/2026-07-10-perf-fu4-atomic-stock-receipt-cancel-adjust-rpcs.sql:107` |
| 3 | 🟠 | Round-2 #23 only partially fixed: 14 remaining /resources/stock/* navigations 404, leaving the stock-sale detail page unreachable from any UI path (including th | `src/components/cases/CaseBackupDevicesTab.tsx:75` |
| 4 | 🟠 | updateAssignedEngineerMutation includes the GENERATED ALWAYS column cases.assigned_engineer_id in its UPDATE SET clause, so the whole statement errors (SQLSTATE | `src/components/cases/detail/useCaseMutations.ts:198` |
| 5 | 🟠 | Donor-to-case assignment inserts directly into inventory_case_assignments, bypassing the atomic assign_inventory_to_case RPC (no single-custody guard, no status | `src/components/cases/DeviceFormModal.tsx:368` |
| 6 | 🟠 | Portal login attaches no role='portal' JWT (uses the anon client), so every portal read runs as anon against TO authenticated / TO portal RLS and comes back emp | `src/contexts/PortalAuthContext.tsx:204` |
| 7 | 🟠 | upsertLeaveBalance's onConflict target (employee_id,leave_type_id,year) matches no unique index (the only key is 4-column, includes tenant_id) — every Allocate  | `src/lib/leaveService.ts:313` |
| 8 | 🟠 | processPayroll's claim-first fix (bug #19) is still non-atomic across three separate writes: a transient failure after the claim strands the period in 'processi | `src/lib/payrollService.ts:592` |
| 9 | 🟠 | toQuoteData (dataFetcher.ts:543) hardcodes discount_type:'amount', so percentage-discount quote PDFs print the raw percent as a flat money discount, the totals  | `src/lib/pdf/dataFetcher.ts:543` |
| 10 | 🟠 | Invoice/quote/credit-note/payment-receipt PDFs format all amounts with the tenant base-currency symbol/position/decimals (getTenantConfig) and ignore the docume | `src/lib/pdf/dataFetcher.ts:924` |
| 11 | 🟠 | Invoice PDF adapter renders document-level discount_amount as a flat amount with no discount_type support, so percentage-discount tax invoices print the raw per | `src/lib/pdf/engine/adapters/invoiceAdapter.ts:221` |
| 12 | 🟠 | bulkSendQuoteEmails unconditionally writes status='sent' on a successful re-send, silently reverting accepted/converted quotes (invoice sibling was fixed in rou | `src/lib/quotesService.ts:1018` |
| 13 | 🟠 | Role-module permission saves always fail: upsert onConflict 'role,module_id' matches no unique constraint (only UNIQUE is (tenant_id, role, module_id)) -> 42P10 | `src/lib/rolePermissionsService.ts:224` |
| 14 | 🟠 | Case Detail inline quote edit (Quotes/Invoices tab) replaces line items via raw supabase update but never recomputes quotes.subtotal/tax_amount/total_amount or  | `src/pages/cases/CaseDetail.tsx:840` |
| 15 | 🟠 | CaseDetail quote-create branch omits the selected currency, so foreign-currency quotes are booked in the tenant base currency at rate 1 (uncatalogued sibling of | `src/pages/cases/CaseDetail.tsx:881` |
| 16 | 🟠 | InvoiceDetailPage/InvoicesListPage edit handlers hydrate line items from raw DB rows (column `discount`), bypassing the discount->discount_percent mapping, so s | `src/pages/financial/InvoiceDetailPage.tsx:275` |
| 17 | 🟠 | InvoiceDetailPage edit onSave omits currency/exchange_rate — deferred round-2 #21 sibling, so a currency change in the detail-page edit modal is silently discar | `src/pages/financial/InvoiceDetailPage.tsx:623` |
| 18 | 🟠 | Changing plans while on an active PayPal subscription creates a second subscription without cancelling the first and overwrites the only stored reference to it, | `supabase/functions/paypal-create-subscription/index.ts:251` |
| 19 | 🟠 | paypal-create-subscription upserts status 'trialing' before PayPal approval, granting plan entitlement (and overwriting past_due/cancelled/active rows) to tenan | `supabase/functions/paypal-create-subscription/index.ts:260` |
| 20 | 🟠 | PAYMENT.SALE.COMPLETED writes the dollar amount into billing_invoices' integer-CENTS columns without *100, so every recorded SaaS payment is rounded to whole ce | `supabase/functions/paypal-webhook/index.ts:345` |
| 21 | 🟠 | record_expense_disbursement seeds current_balance_base from 0 when NULL, flipping the Banking cash KPI to a negative figure for any UI-created account | `supabase/migrations/20260622074117_expense_disbursement_atomic_rpc.sql:103` |
| 22 | 🟡 | changeCompanyMutation discards the log_case_history RPC result, so a DB-level failure of the COMPANY_CHANGED append-only audit write is silently swallowed — the | `src/components/cases/ClientTab.tsx:242` |
| 23 | 🟡 | Create Case wizard collects Service Location (and Welcome Email/SMS) but silently drops them — cases.service_location_id is never written | `src/components/cases/CreateCaseWizard.tsx:375` |
| 24 | 🟡 | Case-attachment delete swallows the storage.remove error and hard-DELETEs a row the DELETE RLS filters to admin-only, so non-admins get a false 'File deleted' t | `src/components/cases/detail/CaseFilesTab.tsx:136` |
| 25 | 🟡 | Document discount is uncapped on quotes end-to-end, so a fixed discount larger than the subtotal (or a percentage over 100) persists a quote with negative tax_a | `src/components/cases/QuoteFormModal.tsx:356` |
| 26 | 🟡 | Expense form's 'Link to Case' picker filters on retired pre-v1.3.0 status names 'Open'/'In Progress' (absent from the canonical 15-status vocabulary), so the dr | `src/components/financial/ExpenseFormModal.tsx:71` |
| 27 | 🟡 | RecordPaymentModal defaults payment_date to the UTC calendar day, so a UTC+ tenant recording a payment after local midnight at a month boundary stamps the prior | `src/components/financial/RecordPaymentModal.tsx:89` |
| 28 | 🟡 | Device Specifications card in InventoryDetailModal reads deprecated legacy columns (firmware_version/pcb_number/head_map) instead of technical_details, so recor | `src/components/inventory/InventoryDetailModal.tsx:578` |
| 29 | 🟡 | Payroll adjustment form offers 'commission' and 'penalty' type options absent from the payroll_adjustments_type_check constraint, so submitting either always fa | `src/components/payroll/AdjustmentFormModal.tsx:109` |
| 30 | 🟡 | Editing a recruitment candidate overwrites applied_date with today's date, permanently losing the original application date | `src/components/recruitment/CandidateFormModal.tsx:113` |
| 31 | 🟡 | LabelStudio 'Save & deploy' merges the edited entity into a fallback-default base whenever loaded prefs are absent (undefined during load) or silently error-def | `src/components/settings/labels/LabelStudio.tsx:72` |
| 32 | 🟡 | StockItemFormModal still drops five persisted fields on save/edit — warranty_months, tax_inclusive, location, specifications, is_featured (round-2 #38 only fixe | `src/components/stock/StockItemFormModal.tsx:144` |
| 33 | 🟡 | Round-2 fix incomplete: fixed-discount PREVIEW (StockSaleModal.tsx:306) lacks the negative clamp the submit path got — a typed negative fixed discount previews  | `src/components/stock/StockSaleModal.tsx:306` |
| 34 | 🟡 | Editing a purchase order soft-deletes and re-inserts all purchase_order_items, silently destroying received_quantity and stock_item_id receive/stock-linkage tra | `src/components/suppliers/PurchaseOrderFormModal.tsx:256` |
| 35 | 🟡 | Sign-out never clears the TanStack QueryClient singleton, so on a shared browser a different-tenant user who signs in within gcTime can transiently see the prev | `src/contexts/AuthContext.tsx:291` |
| 36 | 🟡 | Portal session-timeout control is structurally non-functional: getPortalSettings reads company_settings on the anon portal client, which no RLS policy grants (a | `src/contexts/PortalAuthContext.tsx:115` |
| 37 | 🟡 | document_tax_lines rollup query (documentComplianceKeys.taxLines) is never invalidated after invoice/quote edits, so the always-mounted true-to-print preview sh | `src/hooks/useDocumentCompliance.ts:56` |
| 38 | 🟡 | Banking Receipts tab reads payment_receipts while the Record Payment flow now writes to receipts via the create_receipt_with_allocations RPC, so the register ne | `src/lib/bankingService.ts:336` |
| 39 | 🟡 | Banking KPIs and cash-flow closing balance read the stale stored current_balance_base, which receipt/transfer/adjust RPCs never maintain, so dashboard totals fr | `src/lib/bankingService.ts:710` |
| 40 | 🟡 | deleteCaseService treats the void delete_case_permanently RPC as data-returning, so every successful case deletion falsely reports failure and skips cache inval | `src/lib/caseService.ts:44` |
| 41 | 🟡 | suggestNextAction trusts a false ordering assumption: getAllowedTransitions sorts by destination-status sort_order (not edge sort_order), so the Stage Banner pr | `src/lib/caseStateMachineService.ts:187` |
| 42 | 🟡 | createCompany's is_primary:true relationship insert can violate uq_customer_primary_company (23505) when the chosen contact already has a primary company; the f | `src/lib/companyService.ts:93` |
| 43 | 🟡 | company_settings.metadata writers do a full-column read-modify-write sourced from a per-tab cache (up to 5 min stale); a concurrent or within-window save from a | `src/lib/companySettingsService.ts:199` |
| 44 | 🟡 | companySettingsService cachedSettings module-global is not tenant-keyed and not cleared on sign-out — cross-tenant company-identity bleed (sibling of the round- | `src/lib/companySettingsService.ts:199` |
| 45 | 🟡 | Downloadable import error workbook is un-importable for child-only failures: parents that imported successfully are absent, so the in-file FK validator hard-blo | `src/lib/dataMigration/importClient.ts:68` |
| 46 | 🟡 | getChecklists/getChecklist omit deleted_at filter on both the checklist and the embedded items, so soft-deleted onboarding templates and items reappear in the g | `src/lib/employeeOnboardingService.ts:36` |
| 47 | 🟡 | getChecklistItems orders onboarding_checklist_items by non-existent column 'order_index' (actual column is 'sort_order'), so assignChecklistToEmployee always th | `src/lib/employeeOnboardingService.ts:102` |
| 48 | 🟡 | approveExpense commits status='approved' before posting the GL and input-VAT entries; a mid-sequence failure leaves the expense approved with no ledger/VAT row, | `src/lib/expensesService.ts:417` |
| 49 | 🟡 | checkUsageLimit's max_cases_per_month and max_expenses_per_month counts omit the deleted_at filter, so soft-deleted cases/expenses still consume the monthly quo | `src/lib/featureGateService.ts:222` |
| 50 | 🟡 | generateInvoiceVsExpenseReport omits the void/cancelled status filter its three sibling reports have, counting voided invoices' stale amount_paid as monthly rev | `src/lib/financialReportsService.ts:687` |
| 51 | 🟡 | markAssignmentAsDefective is a non-atomic two-step (RPC releases the donor to an available status, then a separate client UPDATE sets 'Defective'); any post-RPC | `src/lib/inventoryCaseAssignmentService.ts:451` |
| 52 | 🟡 | updateInvoice replaces line items via an unchecked soft-delete + separate insert with no transaction; a mid-sequence insert failure strands the draft invoice wi | `src/lib/invoiceService.ts:742` |
| 53 | 🟡 | convertQuoteToInvoice is not idempotent: it never checks quote.status before createInvoice, so a concurrent/stale-cache re-convert silently creates a duplicate  | `src/lib/invoiceService.ts:976` |
| 54 | 🟡 | bulkSendInvoiceEmails writes back a stale pre-loop status snapshot (mid-batch payment reverted) and advances draft tax invoices to 'sent' client-side, bypassing | `src/lib/invoiceService.ts:1280` |
| 55 | 🟡 | updateKBArticle silently fails to re-add a previously removed tag: the re-add insert collides with the soft-deleted row under the full UNIQUE(article_id, tag_id | `src/lib/kbService.ts:328` |
| 56 | 🟡 | toQuoteData/toInvoiceData omit the persisted client_reference column, so the customer PO 'Reference:' row silently drops from generated quote/invoice PDFs while | `src/lib/pdf/dataFetcher.ts:529` |
| 57 | 🟡 | Forensic report custody timeline renders event times in the printer's browser timezone with no zone label — the surface PR #408's tenant-timezone custody fix mi | `src/lib/pdf/engine/adapters/reportAdapter.ts:496` |
| 58 | 🟡 | profileResolver compliance-render cache is module-global (not tenant-keyed) and never cleared on sign-out — a second tenant signing into the same SPA tab within | `src/lib/pdf/engine/profileResolver.ts:67` |
| 59 | 🟡 | Platform-admin Tenants list and totalTenants KPI include soft-deleted (rolled-back) tenants — no deleted_at filter | `src/lib/platformAdminService.ts:153` |
| 60 | 🟡 | Platform-admin tenant suspension is a no-op: suspendTenant only flips tenants.status, which no RLS/auth/gating path reads, so suspended tenants retain full acce | `src/lib/platformAdminService.ts:357` |
| 61 | 🟡 | suspendTenant/reactivateTenant swallow the Supabase result, so a failed suspend/reactivate still fires onSuccess and toasts success while the tenant's access is | `src/lib/platformAdminService.ts:357` |
| 62 | 🟡 | getQuotesByCaseId omits the deleted_at soft-delete filter, so trashed quotes reappear on the Case Detail Quotes tab (the invoices sibling was fixed in round 1) | `src/lib/quotesService.ts:901` |
| 63 | 🟡 | getStockStats 'Today's Sales/Revenue' uses a bare UTC date string against timestamptz sale_date, misbucketing sales made between local midnight and the UTC offs | `src/lib/stockService.ts:774` |
| 64 | 🟡 | Stock Sales Report / Top-Selling Items / sales list end-date filter compares date-only strings against timestamptz sale_date, silently excluding every sale made | `src/lib/stockService.ts:831` |
| 65 | 🟡 | tenantToday.timezoneCache module-global is not tenant-keyed and never cleared (no TTL, no sign-out hook) — cross-tenant timezone bleed into document/tax dates | `src/lib/tenantToday.ts:45` |
| 66 | 🟡 | approveTimesheet/rejectTimesheet write the reviewer's notes into the shared timesheets.notes column, nulling or overwriting the employee's own note (no separate | `src/lib/timesheetService.ts:152` |
| 67 | 🟡 | Three direct log_audit_trail RPC sites (userManagementService.ts:88, rolePermissionsService.ts:234, UserManagement.tsx:149) discard { error }, so failed audit w | `src/lib/userManagementService.ts:88` |
| 68 | 🟡 | handleCountryChange never clears subdivisionId (nor taxNumber/legalEntityType), so a stale subdivision from a previously-selected country is submitted to provis | `src/pages/auth/onboarding/steps/LocationStep.tsx:69` |
| 69 | 🟡 | Companies page shares queryKey ['companies'] with the 3-column company-picker projection cached by CustomersListPage/CustomerFormModal; within its 30s staleTime | `src/pages/companies/CompaniesListPage.tsx:105` |
| 70 | 🟡 | Companies list fetches all companies with no .range()/.limit(), so PostgREST's db-max-rows cap (default 1000) silently hides companies beyond the first 1000 — w | `src/pages/companies/CompaniesListPage.tsx:108` |
| 71 | 🟡 | Add-Company 'Primary Contact' picker query (CompaniesListPage.tsx:169) filters only is_active with no deleted_at check and no .range(): bulk-archived customers  | `src/pages/companies/CompaniesListPage.tsx:169` |
| 72 | 🟡 | Dashboard 'Active Cases' StatCard counts no_solution cases as active — terminalTypes at Dashboard.tsx:49 omits 'no_solution', diverging from canonical TERMINAL_ | `src/pages/dashboard/Dashboard.tsx:49` |
| 73 | 🟡 | Dashboard 'Customers' KPI counts archived (soft-deleted) customers — query filters is_active but not deleted_at | `src/pages/dashboard/Dashboard.tsx:86` |
| 74 | 🟡 | Receipt mutation invalidates the dead key ['invoices_by_case'] and never invalidates ['open_invoices_by_case']/['invoice_for_payment'], so the allocation surfac | `src/pages/financial/BankingPage.tsx:145` |
| 75 | 🟡 | Payments 'Today' filter serializes local midnight with toISOString(), showing two days of payments for UTC+ browsers | `src/pages/financial/PaymentsList.tsx:154` |
| 76 | 🟡 | Reports Dashboard's three raw invoice queries (headline KPIs, Invoices-by-Status, Top Customers) omit the deleted_at filter and void/cancelled exclusion, disagr | `src/pages/financial/ReportsDashboard.tsx:235` |
| 77 | 🟡 | ReportsDashboard headline reportData query never checks invoicesResult.error/expensesResult.error — a failed invoices or expenses fetch silently renders Total R | `src/pages/financial/ReportsDashboard.tsx:248` |
| 78 | 🟡 | getDateRange builds date bounds via local-midnight Date -> toISOString(), shifting every period boundary one day early for UTC+ tenants ('Today' includes all of | `src/pages/financial/RevenueDashboard.tsx:72` |
| 79 | 🟡 | RevenueDashboard header KPIs and Invoices table omit deleted_at and void/cancelled filters, diverging from the by-customer/by-case tabs on the same page | `src/pages/financial/RevenueDashboard.tsx:83` |
| 80 | 🟡 | Storage Locations page fetches active-only (useInventoryLocations filters is_active=true), so deactivating a location makes it vanish from the management UI wit | `src/pages/inventory/InventoryLocationsPage.tsx:135` |
| 81 | 🟡 | PlanDetailsForm swallows invalid Features/Limits JSON on save, persists the stale value, and falsely toasts 'Plan updated successfully' | `src/pages/platform-admin/PlanDetailPage.tsx:174` |
| 82 | 🟡 | PortalDashboard 'Active Cases' KPI filters cases.status against pre-v1.3.0 lowercase tokens that no longer exist in the canonical vocabulary, so it always shows | `src/pages/portal/PortalDashboard.tsx:69` |
| 83 | 🟡 | PortalPurchasesPage 'Total Spent' sums unpaid (pending/added_to_invoice) stock sales as money spent, and the status Badge passes variant names to the CSS `color | `src/pages/portal/PortalPurchasesPage.tsx:56` |
| 84 | 🟡 | Both quote edit paths silently discard a currency change made in the edit modal — round-2 #22's currency fix covered only the create branch | `src/pages/quotes/QuoteDetailPage.tsx:149` |
| 85 | 🟡 | Adding recommended backup devices to a quote nulls unit/HSN codes and resets tax_treatment on every existing line (recomputing wrong totals), and inserts the ne | `src/pages/quotes/QuoteDetailPage.tsx:644` |
| 86 | 🟡 | GeneralSettings init effect has no once-guard: any ['company_settings'] refetch (deterministically the page's own logo/QR upload invalidation) resets formData f | `src/pages/settings/GeneralSettings.tsx:217` |
| 87 | 🟡 | Saving General Settings round-trips the mount-time snapshot of the full company_settings row (metadata, portal_settings, portal_maintenance_mode, date_format, a | `src/pages/settings/GeneralSettings.tsx:431` |
| 88 | 🟡 | GeneralSettings logo/QR upload handlers swallow {success:false} failures (no else branch, no toast) and their success-path company_settings UPDATE discards its  | `src/pages/settings/GeneralSettings.tsx:523` |
| 89 | 🟡 | Record Usage modal placeholder instructs a human case number ('e.g. CASE-0042') but the value is passed unresolved as a uuid p_case_id to record_stock_usage_for | `src/pages/stock/StockItemDetail.tsx:867` |
| 90 | 🟡 | Stock list 'Record usage' row action mounts StockTransactionModal without a caseId and has no case field, so every usage submission is rejected | `src/pages/stock/StockListPage.tsx:613` |
| 91 | 🟡 | Cancelling a stock sale restocks quantities via cancel_stock_sale but onSuccess omits stockKeys.items()/item(itemId)/transactions(itemId), so the stock list/ite | `src/pages/stock/StockSaleDetailPage.tsx:60` |
| 92 | 🟡 | getMonthStartIso serializes local midnight of the 1st via toISOString(), so 'This Month Revenue' over-includes the entire last day of the previous month for eve | `src/pages/stock/StockSalesPage.tsx:30` |
| 93 | 🟡 | StockSalesPage.handleSaleSuccess invalidates only stockKeys.sales()+stats() after record_stock_sale, leaving stockKeys.serialNumbers(itemId) (and items()/saleab | `src/pages/stock/StockSalesPage.tsx:115` |
| 94 | 🟡 | SupplierProfilePage edit-modal prop mapping omits the four structured-address fields, so every supplier edit NULLs address_line1/address_line2/subdivision_id/po | `src/pages/suppliers/SupplierProfilePage.tsx:251` |
| 95 | 🟡 | Supplier profile 'Create PO' button navigates to non-existent /purchase-orders/new, which binds to :id and errors (invalid uuid) — the supplier-scoped PO create | `src/pages/suppliers/SupplierProfilePage.tsx:840` |
| 96 | 🟡 | SuppliersListPage 'Total Spend' KPI still sums an unranged purchase_orders select — silently truncated at the PostgREST row cap (round-2 #83 fixed only the sibl | `src/pages/suppliers/SuppliersListPage.tsx:138` |
| 97 | 🟡 | initialData={...selectedTemplate} new object identity per parent re-render re-fires LineItemTemplateFormModal's [initialData] effect and silently resets in-prog | `src/pages/templates/TemplateTypeDetail.tsx:432` |
| 98 | 🟡 | Reprocess-on-unprocessed-duplicate path (round-2 #85 fix) double-inserts a paid billing_invoices row for PAYMENT.SALE.COMPLETED — the handler is a non-idempoten | `supabase/functions/paypal-webhook/index.ts:338` |
| 99 | 🟡 | Slug availability check and server duplicate guard both filter deleted_at IS NULL, but tenants_slug_key is an unfiltered UNIQUE constraint — a slug reused from  | `supabase/functions/provision-tenant/index.ts:273` |
| 100 | 🟡 | create-user orphan-recovery calls listUsers with perPage:1, so a pre-existing orphaned auth user is essentially never found and the retry fails with a 500 (unco | `supabase/functions/user-management/index.ts:145` |
| 101 | 🟡 | Import RPC's statusHistory branch silently drops the workbook contract's optional 'details' column when inserting into append-only case_job_history (round-2 #8  | `supabase/migrations/20260630222509_data_migration_import_dedup.sql:297` |
| 102 | 🟡 | POS 'Add to Invoice' strands a sale at status='pending' with no reachable path to bill it, and the selected payment method is never persisted on any stock sale | `supabase/rpc_snapshots/phase2_record_stock_sale_tax.sql:101` |
| 103 | ⚪ | Receipt meter's case total sums balance_due_base (base currency) while invoice rows and allocations use document-currency balance_due — contradictory figures un | `src/components/banking/RecordReceiptModal.tsx:232` |
| 104 | ⚪ | markAsDeliveredMutation.onSuccess (useCaseMutations.ts:352) omits ['case_history', id], ['cases'], and CASE_COMMAND_STATS_KEY after running a transition_case_st | `src/components/cases/detail/useCaseMutations.ts:352` |
| 105 | ⚪ | CustomerCasesTab summary strip miscounts terminal 'Closed — Device Returned'/'Closed — Media Disposed' cases as Open because the substring heuristic only matche | `src/components/customers/CustomerCasesTab.tsx:74` |
| 106 | ⚪ | handleFile lacks a catch: a corrupt/non-xlsx file dropped on the dropzone throws into a void'd promise, so the wizard silently returns to Upload with no error s | `src/components/dataMigration/ImportWizard.tsx:84` |
| 107 | ⚪ | Deferred round-2 sibling still unfixed: InventoryDetailModal:654 routes the canonical device-family KEY through name-based resolveDeviceFamily, collapsing memor | `src/components/inventory/InventoryDetailModal.tsx:654` |
| 108 | ⚪ | KB article editor's sidebar Status toggle is inert — it highlights the selected state but never affects persistence, which is driven solely by the footer Save-a | `src/components/kb/ArticleEditorModal.tsx:225` |
| 109 | ⚪ | Clearing a KB category's description is a silent no-op — `form.description \|\| undefined` drops the cleared value from the update | `src/components/kb/CategoryManagerModal.tsx:87` |
| 110 | ⚪ | Tenant Overview Usage Statistics reads limits from never-populated tenants.limits (default '{}') with non-matching keys, so every tenant shows 'N / 0' limits an | `src/components/platform-admin/tenant-detail/TenantOverviewTab.tsx:80` |
| 111 | ⚪ | Label Studio unconditionally re-seeds edit state from prefs refetch, discarding unsaved design edits when a concurrent change lands mid-session | `src/components/settings/labels/LabelStudio.tsx:61` |
| 112 | ⚪ | Stock auto-print labels drop designed Price/Location/Company-footer fields (caller passes no opts), and the company footer is never auto-resolved on any stock p | `src/components/stock/StockItemFormModal.tsx:177` |
| 113 | ⚪ | Supplier document upload silently discards the required Document Type and the Description — neither is persisted anywhere | `src/components/suppliers/DocumentUploadModal.tsx:75` |
| 114 | ⚪ | Receive-stock modal pre-fills Qty Received with full ordered quantity ignoring already-received qty; since the RPC now accumulates, re-confirming the modal doub | `src/components/suppliers/ReceiveStockModal.tsx:55` |
| 115 | ⚪ | TemplatePicker leaves the template dropdown enabled while the variable-context query is still in flight, so a manual selection during that first-open window ren | `src/components/templates/TemplatePicker.tsx:84` |
| 116 | ⚪ | buildCaseSearchOr silently ignores errors from both pre-resolution queries, degrading Cases search to case-field-only matches with no error or log | `src/lib/caseSearch.ts:56` |
| 117 | ⚪ | duplicateCase (and createReRecoveryCase via it) inserts the case and its devices in two non-atomic writes, so a devices-insert failure strands a deviceless inta | `src/lib/caseService.ts:212` |
| 118 | ⚪ | initiateCustodyTransfer is a non-atomic two-step write — a ledger failure after the transfer insert leaves a pending custody transfer with no CUSTODY_TRANSFER_I | `src/lib/chainOfCustodyService.ts:468` |
| 119 | ⚪ | getExpenseStats computes thisMonthStart via setDate(1)+toISOString() (local->UTC + preserved time-of-day), so the 'This Month' expenses KPI mis-includes the pre | `src/lib/expensesService.ts:669` |
| 120 | ⚪ | getPaymentStats builds p_month_start/p_today via setDate(1)+toISOString() (UTC dates), so the 'This Month'/'Today' payment KPIs drift a day at month/day boundar | `src/lib/paymentsService.ts:390` |
| 121 | ⚪ | updateQuote replaces line items non-atomically (soft-delete then insert) with no compensation: an insert failure mid-operation leaves the quote with zero live i | `src/lib/quotesService.ts:646` |
| 122 | ⚪ | duplicateQuote drops title, client_reference, and bank_account_id — real persisted columns misdescribed as 'removed' by a stale comment | `src/lib/quotesService.ts:867` |
| 123 | ⚪ | Submitting a VAT return never records submitted_at/submitted_by — the timestamp is gated on an optional actor argument that no live caller passes | `src/lib/vatService.ts:196` |
| 124 | ⚪ | Onboarding wizard persists plaintext password and confirmPassword to sessionStorage on every keystroke, cleared only on successful submit | `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts:32` |
| 125 | ⚪ | Company Overview 'Total Revenue' KPI hardcodes '$' and en-US formatting instead of the tenant currency config, mislabeling base-currency revenue for non-USD ten | `src/pages/companies/CompanyProfilePage.tsx:545` |
| 126 | ⚪ | ['customer_stats'] is never invalidated anywhere in the codebase, so the Customers page KPI tiles (Total / Portal Enabled / Recent 30d / Active) stay stale on t | `src/pages/customers/CustomersListPage.tsx:299` |
| 127 | ⚪ | handlePaymentRecorded omits ['invoice_for_payment', id] invalidation, so reopening Record Payment within the 60s staleTime seeds the modal from the stale pre-pa | `src/pages/financial/InvoiceDetailPage.tsx:224` |
| 128 | ⚪ | Round-2 #94 fix is inert in the app: InvoiceDetailPage's CreditNoteModal invoice prop omits credited_amount, so alreadyCredited is always 0 and sequential parti | `src/pages/financial/InvoiceDetailPage.tsx:594` |
| 129 | ⚪ | 'This Month' revenue KPI is derived from the range-filtered fetch, so selecting the Today or This Week filter shrinks it to that sub-range while it stays labele | `src/pages/financial/RevenueDashboard.tsx:132` |
| 130 | ⚪ | TransactionsList 'Today' date filter serializes local midnight via toISOString(), so UTC+ browsers get a dateFrom one day early and the ledger includes all of y | `src/pages/financial/TransactionsList.tsx:90` |
| 131 | ⚪ | HR dashboard KPIs count soft-deleted rows — the page queries employees/recruitment_jobs/performance_reviews directly, bypassing the deleted_at filters that roun | `src/pages/hr/HRDashboard.tsx:26` |
| 132 | ⚪ | 'Add New Employee' quick action links to /hr/employees/new, which matches the employees/:id route (id='new') and strands the user on a permanent loading skeleto | `src/pages/hr/HRDashboard.tsx:84` |
| 133 | ⚪ | Donor search result 'View Details' button has no onClick handler — it does nothing when clicked | `src/pages/inventory/DonorSearchPage.tsx:497` |
| 134 | ⚪ | Inventory list Technical Info cell reads the unused legacy inventory_items.pcb_number column (always NULL post-V2), so the PCB line never renders even though th | `src/pages/inventory/InventoryListPage.tsx:635` |
| 135 | ⚪ | KB category management button is gated on role === 'admin' exactly, locking tenant owners out of the only category-CRUD entry point (hardcoded role instead of o | `src/pages/kb/KBCenterPage.tsx:171` |
| 136 | ⚪ | Approve/Mark-as-Paid invalidate only payrollKeys.period(id), not payrollKeys.records(id), so per-employee Status badges show stale 'calculated' (contradicting t | `src/pages/payroll/PayrollPeriodDetailPage.tsx:57` |
| 137 | ⚪ | PortalPayments rows format the foreign-currency payment.amount with the tenant currency symbol while the 'Total Paid' headline sums base-currency amounts, so ro | `src/pages/portal/PortalPayments.tsx:266` |
| 138 | ⚪ | Cancelled-subscription banner shows cancelled_at (cancel-click timestamp) as the 'access until' date instead of current_period_end (paid-through date) | `src/pages/settings/BillingPage.tsx:146` |
| 139 | ⚪ | Client Portal settings active-customer count omits deleted_at filter, so archived portal customers stay counted | `src/pages/settings/ClientPortalSettings.tsx:105` |
| 140 | ⚪ | updateMutation session-refresh fallback is dead code: after a transient refreshSession failure with a still-valid session, `session` remains null and the save a | `src/pages/settings/GeneralSettings.tsx:303` |
| 141 | ⚪ | Cancelling a stock adjustment sets deleted_at + status='cancelled', but getStockAdjustments filters deleted_at IS NULL, so cancelled sessions are invisible and  | `src/pages/stock/StockAdjustmentsPage.tsx:132` |
| 142 | ⚪ | SupplierProfilePage.loadOrders lists soft-deleted purchase orders (no deleted_at filter), inflating the Orders tab count and letting the deleted PO open/edit vi | `src/pages/suppliers/SupplierProfilePage.tsx:179` |
| 143 | ⚪ | Template delete and duplicate swallow Supabase { error } — on failure nothing happens (no toast, no log), delete-confirm dialog stays open, template still exist | `src/pages/templates/TemplateTypeDetail.tsx:119` |
| 144 | ⚪ | Profile upsert failure during provisioning is only logged (no rollback), so the function returns 201 leaving an orphaned tenant/slug and a tenant-less owner — t | `supabase/functions/provision-tenant/index.ts:415` |
| 145 | ⚪ | log_case_checkout lacks a checked_out_at IS NULL idempotency guard: a concurrent re-checkout of the same device (cross-session ~60s stale window) overwrites the | `supabase/migrations/20260704190411_standardize_case_lifecycle.sql:503` |

---

## 🔴 Critical (1)

### 1. 🔴 user-management reset-password resets ANY user's password with no tenant-ownership check (cross-tenant account takeover via service-role updateUserById)

- **Location:** `supabase/functions/user-management/index.ts:264`
- **Category:** tenant-isolation · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** sweep-tenant-isolation

**Scenario.** The reset-password action (index.ts 261-290) takes client-supplied body.userId and calls the RLS-bypassing service-role client's auth.admin.updateUserById(body.userId, {password}) with the only gate being callerProfile.role IN (owner,admin) for ANY tenant (line 112) — there is no check that body.userId's profile tenant_id equals the caller's tenant_id, and the follow-up profiles UPDATE at 270-273 (.eq('id', body.userId), service-role) has no tenant filter either. A Tenant A owner/admin POSTs ?action=reset-password with body.userId set to a user in Tenant B (or a platform-admin auth UUID) and an attacker-chosen newPassword; the service-role call resets that victim's password across tenants, yielding full cross-tenant account takeover. This is the analog of audit finding #26 (provision-tenant) but on a separate, previously-unaudited endpoint that is still unfixed.

```
const { error: pwError } = await supabaseClient.auth.admin.updateUserById(
        body.userId,
        { password: body.newPassword }
      );
```

**Verification.** Read supabase/functions/user-management/index.ts in full. The reset-password branch (261-290) reads client-supplied body.userId (262) and calls supabaseClient.auth.admin.updateUserById(body.userId, {password: body.newPassword}) on the SERVICE_ROLE client (78-82, RLS-bypassing) with no verification that body.userId belongs to the caller's tenant. The sole authz gate is line 112 (callerProfile.role IN owner/admin) which accepts any tenant's owner/admin and is not scoped to tenant_id. The profile UPDATE at 270-273 uses .eq('id', body.userId) on the service-role client, so RLS provides no backstop. create-user by contrast stamps tenant_id from callerProfile (line 200), confirming the reset path's omission. Reachability: any tenant owner (every tenant has one) with a valid JWT POSTs ?action=reset-password with body.userId = a victim in another tenant (or a platform admin's auth UUID) and an attacker-chosen password; updateUserById resets it cross-tenant. Rate limit (3/60s/IP) is not a barrier. Not a duplicate: audit finding #26 covers provision-tenant/index.ts, a different file; this endpoint has no prior-round entry and the current code is unfixed.

## 🟠 High (20)

### 2. 🟠 cancel_stock_sale restocks and soft-deletes a refunded POS sale but never reverses its vat_records/document_tax_lines rows, so the tenant's VAT return permanently overstates output tax on refunded sales

- **Location:** `docs/migrations-pending/2026-07-10-perf-fu4-atomic-stock-receipt-cancel-adjust-rpcs.sql:107`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** stock

**Scenario.** record_stock_sale (phase2_record_stock_sale_tax.sql:205-222) writes one vat_records 'sale' row per non-zero tax rollup plus document_tax_lines snapshots; no trigger manages these (the RPC is the sole writer). cancel_stock_sale (2026-07-10-perf-fu4...sql:107), invoked from StockSaleDetailPage 'Cancel / Refund' via stockService.cancelStockSale, only restocks quantities and sets status='refunded', deleted_at=now() on stock_sales — it never deletes or writes reversing vat_records/document_tax_lines rows. calculateVATForPeriod (vatService.ts:119-133) sums vat_records filtered only by its own deleted_at IS NULL and record_type='sale'. A VAT tenant sells a backup drive for AED 1,000 + AED 50 VAT then cancels/refunds it the same day: revenue reports exclude the soft-deleted sale, but the monthly VAT return still includes the AED 50 output tax, so the lab remits tax on a sale that no longer exists.

```
UPDATE stock_sales SET status = 'refunded', deleted_at = now(), updated_at = now() WHERE id = p_sale_id;
  RETURN v_restocked;
```

**Verification.** Traced end-to-end. record_stock_sale (phase2_record_stock_sale_tax.sql:205-222) writes vat_records 'sale' rows (deleted_at NULL) and document_tax_lines snapshots per non-zero tax rollup; migration comment confirms stock_sales has no vat-posting trigger and record_stock_sale is the sole writer, so nothing else manages these rows. cancel_stock_sale (cited file line 107) only restocks and sets status='refunded', deleted_at=now() on stock_sales — grep of the file for vat_records/reverse/credit_note returns nothing; it never reverses the tax ledger. calculateVATForPeriod (vatService.ts:119-133) sums vat_records by its own deleted_at IS NULL + record_type='sale', so the un-reversed rows persist into the monthly VAT return while revenue reports exclude the soft-deleted sale. Reachable via StockSaleDetailPage 'Cancel / Refund' -> stockService.cancelStockSale (stockService.ts:607-616). NOT a duplicate: rounds 1-2 catalogued only #65 (Top Selling Items counting cancelled lines) and #122 (dead Refunded filter) — different downstream effects of the same soft-delete, neither touching vat_records, neither fixed.

### 3. 🟠 Round-2 #23 only partially fixed: 14 remaining /resources/stock/* navigations 404, leaving the stock-sale detail page unreachable from any UI path (including the post-sale redirect on a case's Backup Devices tab)

- **Location:** `src/components/cases/CaseBackupDevicesTab.tsx:75`
- **Category:** broken-navigation · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** r2-regression-cases-stock
- **Also at:** `src/pages/stock/StockSalesPage.tsx:111`, `src/pages/dashboard/Dashboard.tsx:206`, `src/pages/stock/StockSalesPage.tsx:117`

**Scenario.** PR #421 (HEAD 037faa7) fixed only the 5 /resources/stock/* sites in StockListPage.tsx and explicitly deferred the cross-file siblings ("stock nav paths"). App.tsx mounts stock routes at top-level /stock/* (lines 174-181) with no /resources route; unmatched paths hit the path="*" 404 element (App.tsx:309). Consequences: (1) an engineer sells a backup device from the case Backup Devices tab — the sale succeeds and stock is decremented, then handleSaleSuccess (CaseBackupDevicesTab.tsx:75) navigates to /resources/stock/sales/<id> and renders "404 Page not found"; (2) every in-app route to StockSaleDetailPage is now dead (StockSalesPage.tsx:111/117 row-click and post-sale redirect, CustomerPurchasesTab.tsx:115, CaseBackupDevicesTab.tsx:231), so sale records/receipts cannot be opened from the UI at all; (3) "Back to Stock/Sales" buttons on StockItemDetail.tsx:291/316 and StockSaleDetailPage.tsx:94/114, the LowStockAlert.tsx:19 link, Dashboard.tsx:206, and the three dashboard stock widgets (StockValueWidget.tsx:90, LowStockWidget.tsx:75, StockSalesWidget.tsx:83) all 404. No data is lost — the failure is a broken lab workflow (reviewing backup-device sales), not corruption.

```
navigate(`/resources/stock/sales/${saleId}`);
```

**Verification.** Independently re-traced at HEAD 037faa7. Grep confirms all 14 cited /resources/stock/* navigate()/Link targets still exist (CaseBackupDevicesTab.tsx:75/231, CustomerPurchasesTab.tsx:115, StockSalesPage.tsx:111/117, StockItemDetail.tsx:291/316, StockSaleDetailPage.tsx:94/114, LowStockAlert.tsx:19, Dashboard.tsx:206, StockValueWidget.tsx:90, LowStockWidget.tsx:75, StockSalesWidget.tsx:83). App.tsx mounts stock routes at top-level path="stock..." (lines 174-181) with no /resources segment anywhere, and path="*" (line 309) renders the 404 page — so every target dead-ends. This is the unfixed remainder of round-2 finding #23 (19 sites): commit 037faa7 (PR #421) fixed only StockListPage.tsx's 5 sites (now /stock/...) and its message explicitly defers "stock nav paths" as cross-file siblings for follow-up — catalogued but NOT fixed, so CONFIRMED per the duplicate rule. Impact verified: /stock/sales/:id now has zero working in-app entry points (post-sale redirects, sales-list row click, and customer purchases tab all 404), so an engineer lands on "404 Page not found" immediately after successfully selling a backup device on a case, and the stock-sale detail/receipt view is unreachable from the UI. The sale itself is recorded correctly (no data loss).

### 4. 🟠 updateAssignedEngineerMutation includes the GENERATED ALWAYS column cases.assigned_engineer_id in its UPDATE SET clause, so the whole statement errors (SQLSTATE 428C9) and engineer assignment from Case Detail -> Overview always fails

- **Location:** `src/components/cases/detail/useCaseMutations.ts:198`
- **Category:** db-contract · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** cases-ui

**Scenario.** Open any case -> Overview -> pick an engineer in EngineerSelector. onChange fires onUpdateEngineer (CaseOverviewTab.tsx:508), routed to updateAssignedEngineerMutation.mutate (CaseDetail.tsx:1170). The mutation (useCaseMutations.ts:195-203) issues supabase.from('cases').update({ assigned_engineer_id, assigned_to, updated_at }). Because cases.assigned_engineer_id is `GENERATED ALWAYS AS (assigned_to) STORED` (baseline_schema.sql:690; unchanged by any later migration), including it in the SET clause makes PostgreSQL reject the entire UPDATE with SQLSTATE 428C9 ('column \"assigned_engineer_id\" can only be updated to DEFAULT'). The toast 'Failed to update assigned engineer' appears and neither assigned_to nor updated_at is written. Removing the assigned_engineer_id key from the payload (writing only assigned_to, which the generated column derives from) fixes it, matching how duplicateCase/CreateCaseWizard/import already write only assigned_to.

```
.update({ assigned_engineer_id: newEngineerId, assigned_to: newEngineerId, updated_at: new Date().toISOString(), })
```

**Verification.** Independently traced the full path. baseline_schema.sql:690 defines `assigned_engineer_id uuid GENERATED ALWAYS AS (assigned_to) STORED`; no later migration alters it (the four later migrations only read it in notification payloads). The mutation at useCaseMutations.ts:195-203 puts `assigned_engineer_id` in the .update() SET clause. Wiring is real and reachable: CaseDetail.tsx:1170 -> onUpdateEngineer -> EngineerSelector.onChange (CaseOverviewTab.tsx:508) -> updateAssignedEngineerMutation.mutate. PostgreSQL raises SQLSTATE 428C9 ('column can only be updated to DEFAULT') on any explicit non-DEFAULT assignment to a GENERATED ALWAYS column, and PostgREST forwards the body key into the SET clause, so the UPDATE errors on every call, showing 'Failed to update assigned engineer' with no write. The in-file comment's justification is invalid: generated TS types list this column in Update just as they list the known-generated case_no/title, so they cannot prove writability. Corroborated by docs/schema-drift-audit.md:73 and data_migration_import_rpcs.sql:13. Not catalogued in round-1/round-2 audit docs.

### 5. 🟠 Donor-to-case assignment inserts directly into inventory_case_assignments, bypassing the atomic assign_inventory_to_case RPC (no single-custody guard, no status flip, no chain-of-custody event) and swallowing the insert error

- **Location:** `src/components/cases/DeviceFormModal.tsx:368`
- **Category:** custody-bypass · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** inventory
- **Also at:** `src/components/cases/DeviceFormModal.tsx:378`

**Scenario.** Every donor attached via Add Device (role=Donor) writes its inventory_case_assignments row through a raw insert instead of the atomic RPC, so no chain-of-custody DEVICE_CHECKED_OUT event is logged and the item's status is never flipped to 'In Use' — a durable custody/audit gap on a normal lab workflow. Amplified case: donor drive X is already assigned to case A via the inventory UI (RPC flipped status to 'In Use'; quantity stays 1). The DeviceFormModal donor picker filters only is_donor=true, quantity>0, deleted_at IS NULL, so X still appears labeled 'Available: 1'. A technician on case B selects X and saves; the modal inserts a second active row with no availability check and no RPC. There is no partial unique index on item_id WHERE returned_at IS NULL, so the insert succeeds and X is double-booked across two live recovery cases. checkItemAvailability()/getActiveAssignment() then error (PGRST116) on .maybeSingle() with two active rows; InventoryDetailModal.loadData masks those to {available:true}/null, so X shows fully available and can be assigned to a third case. If the direct insert itself fails (e.g. RLS), only logger.error runs — the device save still reports success and the donor linkage is silently missing.

```
const { error: assignmentError } = await supabase
  .from('inventory_case_assignments')
  .insert([{ tenant_id: profile?.tenant_id ?? '', item_id: selectedDonorInventoryId, case_id: caseId, ... }]);
if (assignmentError) {
  logger.error('Error creating inventory case assignment:', assignmentError);
}
```

**Verification.** Re-read DeviceFormModal.tsx:364-382: the donor-role save does a raw supabase.from('inventory_case_assignments').insert([...]) with the error only logger.error'd. The canonical path is the atomic assign_inventory_to_case RPC (inventoryCaseAssignmentService.ts:343-399) which per its own comments performs the single-custody guard + status flip + chain-of-custody event + history/audit in one transaction — all skipped here. The donor picker query (lines 147-171) filters only is_donor=true, quantity>0, deleted_at IS NULL (no active-assignment or status filter) and labels items 'Available: {quantity}', so an item already assigned via the RPC (status 'In Use', quantity still 1) reappears as assignable. Baseline schema shows only PK+FKs+tenant index on inventory_case_assignments — NO partial unique index on item_id WHERE returned_at IS NULL — so the direct insert creates a genuine second active row (double-booking). checkItemAvailability (line 263) and getActiveAssignment (line 581) then hit PGRST116 on .maybeSingle() with two active rows; InventoryDetailModal.loadData (lines 149,151) catches those to null / {available:true}, re-presenting the item as available for a third case. Even without the double-book amplification, every donor attachment through this modal skips the RPC (no custody event, no status flip) — a durable custody/audit gap on a real lab workflow. Not in the round-1/round-2 catalogs (item 15 is the separate, already-fixed service-layer defective/working release bypass). Scenario is fully reachable from real staff inputs.</parameter>
<parameter name="corrected_title">Donor-to-case assignment in DeviceFormModal inserts directly into inventory_case_assignments, bypassing the atomic assign_inventory_to_case RPC (no single-custody guard, no status flip, no DEVICE_CHECKED_OUT custody event) and swallowing the insert error; no DB uniqueness backstop, so a donor drive can be double-booked across live cases

### 6. 🟠 Portal login attaches no role='portal' JWT (uses the anon client), so every portal read runs as anon against TO authenticated / TO portal RLS and comes back empty — the logged-in customer portal is non-functional

- **Location:** `src/contexts/PortalAuthContext.tsx:204`
- **Category:** auth-session · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** portal

**Scenario.** Staff provision portal access for a customer (CustomerProfilePage 'Generate Password' → set_portal_password RPC) and email credentials via generateCustomerPortalCredentialsText. The customer logs in at /portal/login; PortalAuthContext.login (line 204) calls authenticate_portal_customer on the shared anon-key supabaseClient (the only client), stores the returned customer JSON in sessionStorage, and attaches no JWT — the deployed portal-login edge function is never invoked and no role='portal' token is minted. Login succeeds, but every subsequent portal page query runs as the anon principal: cases, case_portal_visibility, case_devices, payments, customer_communications, stock_sales are all governed by TO authenticated / TO portal RLS with no anon-permissive policy, so PostgREST returns 0 rows (or a permission-denied error). The customer sees no cases, no payments, no documents, no messages despite a successful login, and quote approval writes fail too. docs/portal-identity-design.md §12(3) confirms this is the shipped state — the client cutover to a portal-scoped JWT client was built and reverted, leaving the un-cut-over anon client in production.

```
const { data, error: rpcError } = await supabase.rpc('authenticate_portal_customer', {
  p_email: email,
  p_password: password,
});
```

**Verification.** Traced end-to-end in current source. PortalAuthContext.login (line 204) authenticates via supabase.rpc('authenticate_portal_customer') on the shared anon-key client (the only client in src/lib/supabaseClient.ts), stores plain JSON in sessionStorage (line 239), and attaches no JWT — the deployed portal-login edge function is never called. Portal pages then read tables directly on that same anon client (PortalCases.tsx: from('cases'), from('case_portal_visibility'), from('case_devices'); plus payments/customer_communications/stock_sales elsewhere). RLS blocks anon: cases_select is TO authenticated USING(true) (baseline 20260409000000 line 6750) and the portal read policies (20260620053512, 20260620051740) are all TO portal; anon has permissive policies only on geo_countries/signup_otps/subscription_plans, so these reads return 0 rows for the anon principal. The design doc confirms this verbatim (docs/portal-identity-design.md §12(3) line 154: 'portal pages still query via the anon client (so reads are 0 against the TO authenticated policies)'; the client-side cutover 'was built and reverted this session'). The failure is reachable via a fully shipped staff flow: CustomerProfilePage.tsx:314 set_portal_password + generateCustomerPortalCredentialsText lets staff provision a portal password and email credentials, after which the customer logs in successfully and lands on read surfaces that all come back empty. Writes are likewise dead (approve_quote/reject_quote no longer executable by anon, and the case_quotes↔quotes id mismatch noted in the doc). Not a duplicate: rounds 1-2 reference this file only for the session-timeout (#39) and tenant-config polling bugs, not this anon-read defect. Minor wording nuance: depending on anon table GRANTs the reads may surface as a 42501 permission error rather than literally 0 rows, but the logged-in portal is non-functional either way.

### 7. 🟠 upsertLeaveBalance's onConflict target (employee_id,leave_type_id,year) matches no unique index (the only key is 4-column, includes tenant_id) — every Allocate Balance submit fails up-front with Postgres 42P10

- **Location:** `src/lib/leaveService.ts:313`
- **Category:** wrong-db-contract · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** hr-leave-attendance

**Scenario.** Admin opens Leave Management -> Balances -> Allocate Balance, picks any employee/leave type/year and submits. AllocateBalanceModal.handleSubmit (LeaveManagement.tsx:473) calls upsertLeaveBalance, which issues INSERT ... ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE. The only unique constraint on leave_balances is the 4-column leave_balances_tenant_id_employee_id_leave_type_id_year_key UNIQUE (tenant_id, employee_id, leave_type_id, year) (baseline_schema.sql:3899; no later migration adds another — confirmed across supabase/migrations and migrations.manifest.md). Postgres arbiter-index inference requires the conflict-target column set to exactly equal a unique index's columns, so the 3-column target matches no index and the statement fails during planning with 42P10, even for a brand-new (non-conflicting) row. Every submit throws and shows 'Failed to allocate balance'; no leave_balances row can ever be created via the UI, so adjustLeaveBalanceUsage (which no-ops when no balance row exists) never records consumed days either. Fix: onConflict:'tenant_id,employee_id,leave_type_id,year'.

```
.upsert(payload, { onConflict: 'employee_id,leave_type_id,year' })  // DB: UNIQUE (tenant_id, employee_id, leave_type_id, year)
```

**Verification.** Traced end-to-end. leaveService.ts:313 upserts leave_balances with onConflict:'employee_id,leave_type_id,year' (3 cols). The only unique constraint on leave_balances is the 4-column leave_balances_tenant_id_employee_id_leave_type_id_year_key UNIQUE (tenant_id, employee_id, leave_type_id, year) (baseline_schema.sql:3899); PK is on id. Verified via grep across supabase/migrations and migrations.manifest.md that only the baseline touches this table — no 3-column unique index exists. Postgres arbiter-index inference requires the ON CONFLICT column set to exactly equal a unique index's columns, so a 3-column target cannot match the 4-column key and the statement fails up-front with 42P10 during planning, even for a brand-new non-conflicting row. Sole write path is AllocateBalanceModal.handleSubmit (LeaveManagement.tsx:473-481), which passes tenant_id + the fields and lands in catch -> toast.error('Failed to allocate balance') on every submit. Not a duplicate: round-2 bug #20 covered the distinct used_days-wipe (its fix is present at lines 463-481) and its verifier assumed the onConflict updates the row; the arbiter mismatch is uncatalogued and still live. Fix: onConflict:'tenant_id,employee_id,leave_type_id,year'.

### 8. 🟠 processPayroll's claim-first fix (bug #19) is still non-atomic across three separate writes: a transient failure after the claim strands the period in 'processing' with zero records, or leaves loan installments docked from net pay but unposted to the loan ledger, silently re-collecting them in later periods — with no in-app recovery path

- **Location:** `src/lib/payrollService.ts:592`
- **Category:** non-atomic-write · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** payroll-advances

**Scenario.** The period is claimed (draft→processing, totals+employee_count persisted) at 563-577 BEFORE the payroll_records insert (587) and the recordLoanRepayment loop (597-599); the three are separate non-transactional writes and nothing resets a period to 'draft'. Failure A: a transient DB/network error on the records insert (587) after the claim commits leaves the period permanently 'processing' with non-zero totals but ZERO records; both the 413 guard and the claim's WHERE status='draft' reject every retry, and the only UI action on a 'processing' period is Approve (PayrollPeriodDetailPage.tsx:148), which finalizes an empty payroll showing non-zero totals. Failure B: recordLoanRepayment #k throws mid-loop after the records (with the loan deduction already inside net_salary/total_deductions) are committed at 587; loans k..n keep their old remaining_amount/paid_installments, retry is blocked, so getActiveLoans still returns them and the NEXT period re-deducts the same installment from net pay with no repayment row to show for it — over the loan's life the employee is docked total_amount plus one extra installment per failed posting, silent money loss with no in-app fix. This is the residual of bug #19 whose real fix (transactional RPC + partial unique constraint) the code comment admits is still unimplemented.

```
if (recordError) throw recordError;

      // Post loan repayments now that the period is claimed and payroll_records
      // are committed...
      for (const repayment of pendingLoanRepayments) {
        await this.recordLoanRepayment(repayment);
      }
```

**Verification.** Traced processPayroll end-to-end in current source. The bug #19 fix claims the period (draft→processing, persisting total_gross/net/deductions + employee_count) at 563-577 BEFORE the payroll_records insert (587) and BEFORE the recordLoanRepayment loop (597-599); the three writes are separate, non-transactional supabase calls (no RPC). Nothing resets a period out of 'processing': the entry guard at 413 (status!=='draft') and the claim's WHERE status='draft' (574) both reject every retry, and no service method or UI writes processing→draft (verified across payrollService and PayrollPeriodDetailPage; getDashboardStats line 1011 only reads). Failure A: a transient error on the records insert (587) after the claim commits leaves the period permanently 'processing' with non-zero totals+employee_count but ZERO records; the only action PayrollPeriodDetailPage offers is Approve (canApprove=status==='processing', line 148), finalizing an empty payroll with non-zero totals; the 23505-from-residual-rows sub-trigger is unverifiable without live DB, but the transient-error trigger stands alone. Failure B (the durable-money one): records are inserted at 587 with the loan installment already docked inside total_deductions/net_salary; if recordLoanRepayment #k throws (insert 867 or employee_loans update 882) mid-loop, loans k..n keep their full remaining_amount/paid_installments (both advanced ONLY in that update). getActiveLoans (772) still returns them as active and scheduledLoanDeduction (88, capped at remaining_amount) re-deducts the same installment in the NEXT period — one extra installment docked from net with no backing repayment row, silently over-collecting, and retry of the current period is blocked. Not a duplicate: bug #19 (round-1 CONFIRMED) described the inverse (period stuck 'draft' → duplicate records + same-period double-deduct), which the fix closed; these two post-fix modes are new and uncatalogued in rounds 1-2. Per the round-3 rule, #19's root non-atomicity is NOT actually fixed — the code comment (559-562) admits the transactional RPC + unique constraint are still only 'cross-file notes' — so the surviving money-loss outcome is CONFIRMED, not a duplicate. Trigger is a mid-sequence transient/partial failure, the same class rounds 1-2 accepted for #19 and #85.

### 9. 🟠 toQuoteData (dataFetcher.ts:543) hardcodes discount_type:'amount', so percentage-discount quote PDFs print the raw percent as a flat money discount, the totals block fails to reconcile, and the printed PDF diverges from the on-screen preview

- **Location:** `src/lib/pdf/dataFetcher.ts:543`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** pdf-engine

**Scenario.** A quote is created with subtotal 1000, discount_type='percentage', discount_amount=10 (10%), tax 5%. quotesService persists discount_type='percentage' and computeDocumentTotals stores tax_amount=45, total_amount=945 (percentage applied). Generating the quote PDF: fetchQuoteDetails selects '*' so quoteRow.discount_type='percentage' is available, but toQuoteData (dataFetcher.ts:543) hardcodes discount_type:'amount'. quoteAdapter.toEngineData (adapters/quoteAdapter.ts:209-210) then computes discountValue=discountAmount=10 (not 100). The PDF prints 'Discount: - 10.00', 'Net Amount: 990.00', a VAT row with taxable 990 but stored tax 45, and stored Total 945 — the customer-facing tax document does not reconcile (990+45 != 945; 990 x 5% != 45), and the '(10%)' discount label branch (quoteAdapter.ts:241-242) never fires. The on-screen QuoteDetailPage -> QuoteDocument preview reads the real discount_type (QuoteDocument.tsx:109,326) and correctly shows -100.00 / Net 900.00, so the emailed/downloaded PDF disagrees with the preview the staff reviewed.

```
discount_type: 'amount',
```

**Verification.** Traced the full chain in current code. QuoteFormModal (cases/QuoteFormModal.tsx:726) offers a percentage toggle; quotesService persists discount_type='percentage' (pickQuotePersistFields l.149) and computeDocumentTotals (taxDocumentService.ts:320-322) stores the percentage-correct total_amount. The PDF path pdfService/previewRecord -> fetchQuoteData -> fetchQuoteDetails (dataFetcher.ts:584 selects '*', so quoteRow.discount_type is present) -> toQuoteData, which hardcodes discount_type:'amount' at line 543, discarding the real value. quoteAdapter.toEngineData (adapters/quoteAdapter.ts:209-245) is explicitly designed to honor discount_type (its own comment l.204-206), so fed 'amount' it computes discountValue=discountAmount=10 instead of 100: prints Discount -10.00, Net 990.00, VAT taxable 990 with stored tax 45, stored Total 945 — a non-reconciling customer-facing tax document, and the (10%) label branch (l.241-242) never fires. The on-screen QuoteDocument.tsx preview reads the true discount_type (l.109/326) and renders -100.00/900.00, so preview and emitted PDF disagree. quotes.discount_type exists in database.types.ts (l.13710). Not catalogued in rounds 1-2: prior discount_type findings target invoiceService.ts:457, quote->invoice conversion, duplicateQuote, and line-item line_total recompute (dataFetcher.ts:233/253/269) — none is this quote-PDF document-level discount_type hardcode; toInvoiceData carries no discount_type field, so this is quote-specific and distinct.

### 10. 🟠 Invoice/quote/credit-note/payment-receipt PDFs format all amounts with the tenant base-currency symbol/position/decimals (getTenantConfig) and ignore the document's own stored currency column, so foreign-currency documents print under the wrong currency on a legally-significant document

- **Location:** `src/lib/pdf/dataFetcher.ts:924`
- **Category:** currency-mixing · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** pdf-engine
- **Also at:** `src/lib/pdf/dataFetcher.ts:931`

**Scenario.** Multi-currency tenant, base USD. A user creates a EUR invoice via InvoiceFormModal's Currency picker (rendered when >1 supported currency); invoiceService persists invoices.currency='EUR' with EUR header/line amounts (base equivalents in *_base). PR #421 (round-2 #529) made this persistence work. On PDF generation, fetchInvoiceDetails resolves cfg = getTenantConfig(tenant_id) (base USD config) and passes cfg.currency into currencyToBlock -> accounting_locales.currency_symbol/position/decimal_places, so every line, subtotal, tax and total on the generated/emailed tax-invoice PDF renders with the '$' symbol and USD format instead of EUR — the legal document mislabels its currency. Identical for quotes (656), credit notes (759, currency NOT NULL), and payment receipts (1043, currency inherited from the invoice). With an OMR base (3dp) a EUR document also renders base decimals, and toInvoiceItems' line-net recompute (line 931) rounds at cfg.currency.decimalPlaces = base decimals, not the document currency's. Fix: thread row.currency through a currency lookup (accounting_locales/master_currency_codes) rather than the tenant base config in all four fetchers.

```
// Currency from the Country Engine (single source), not accounting_locales.
  const cfg = await getTenantConfig(invoiceRow.tenant_id);
```

**Verification.** Independently traced end-to-end. invoices.currency/quotes.currency/payments.currency (string|null) and credit_notes.currency (NOT NULL string) all exist in database.types.ts with document-currency header/line amounts and separate *_base columns; invoiceService.ts persists rc.documentCurrency and rounds amounts at the document currency's decimals (lines 439-505). InvoiceFormModal.tsx (lines 770-782) exposes a real currency picker that persists a non-base document currency — and PR #421 (round-2 fix #529) fixed the save handlers to forward it, making foreign-currency documents actually storable. But all four PDF fetchers (fetchQuoteDetails:656, fetchCreditNoteData:759, fetchInvoiceDetails:924, fetchPaymentDetails:1043) resolve cfg = getTenantConfig(row.tenant_id) — the tenant BASE-currency config — and pass cfg.currency into currencyToBlock, which drives currency_symbol/position/decimal_places in the adapters. row.currency is never read. So a USD-base tenant issuing a EUR invoice prints every amount with the '$' symbol, base position, and base decimals on the legal tax-invoice/credit-note/receipt PDF; the line 931 toInvoiceItems recompute also rounds at cfg.currency.decimalPlaces (base decimals). Not a duplicate: rounds 1-2 fixed the persistence gap (which enabled this), the 3-decimal line-rounding, and a VATAuditPage row — none covered the PDF currency-block mislabeling. Precondition (tenant with >1 supported currency) is a real multi-currency setup; for those tenants foreign-currency documents are a common path and the output is a legally-significant, wrong-currency document.

### 11. 🟠 Invoice PDF adapter renders document-level discount_amount as a flat amount with no discount_type support, so percentage-discount tax invoices print the raw percent as the Discount line and a Net Amount that does not reconcile with the (correct) stored Total

- **Location:** `src/lib/pdf/engine/adapters/invoiceAdapter.ts:221`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** pdf-engine

**Scenario.** A percentage document discount is a native, reachable input: InvoiceFormModal.tsx:942-956 exposes a fixed/percentage toggle and stores the raw percent into discount_amount. After the round-1 fix, invoiceService.ts passes the real discount_type to computeDocumentTotals (457/705) so total_amount is computed correctly, but persists discount_amount as the raw form value (494) — invoices.discount_amount=10 means 10%. The PDF layer lacks discount_type: InvoiceData (types.ts) has no such field, dataFetcher.ts:699 never maps it, and invoiceAdapter.ts:220-221 does discountedSubtotal = subtotal - discountAmount flatly. For subtotal 1000, 10% discount, 5% tax (stored total 945): the PDF prints Discount '- 10.00' (should be 100.00) and Net Amount '990.00' (should be 900.00), while Total prints the stored 945.00 — Net + VAT (990 + ~45) no longer equals the printed Total, producing an internally inconsistent customer/authority-facing legal tax invoice. The no-rollup tax-summary fallback (line 316) likewise shows taxable 990 vs the actual base 900. The correctly-implemented quoteAdapter.ts:205-245 (which honors discount_type) shows the invoice adapter is the sole outlier. Mitigating factor: the durable stored figures and the legally-payable Total are correct, so this is a statutory-document rendering inconsistency rather than a wrong bottom line.

```
const discountAmount = invoiceData.discount_amount ?? 0;
  const discountedSubtotal = subtotal - discountAmount;
```

**Verification.** Traced end-to-end. Post round-1 fix, invoiceService.ts passes real discount_type to computeDocumentTotals (lines 457/705, verified current) but persists discount_amount as the RAW form value (line 494); for a percentage invoice invoices.discount_amount=10 means 10%, while total_amount is computed correctly. taxDocumentService.ts:320-322 confirms discount_amount is treated as a percent only when discount_type='percentage'. The PDF InvoiceData type (types.ts:294-309) has no discount_type field and dataFetcher.ts:699 never maps it, so invoiceAdapter.ts:220-221 subtracts the raw value flat (discountedSubtotal = subtotal - discountAmount) and emits Discount: -{money(discountAmount)} and Net Amount: {money(discountedSubtotal)} at lines 248-250. For subtotal 1000/10% discount/5% tax: PDF prints Discount -10.00 (should be 100.00), Net 990.00 (should be 900.00), while Total prints the correct stored 945.00 — an internally inconsistent legal tax invoice. This is the live path (pdfService.ts:174, previewRecord.ts). The sibling quoteAdapter.ts:205-245 handles discount_type='percentage' correctly, proving the invoice adapter is the outlier. Reachable via the native fixed/percentage toggle in InvoiceFormModal.tsx:942-956. Not catalogued in round 1 (which fixed only the SAVE/convert side: #1/#17/#33/#64) or round 2 (whose invoice-PDF findings #20/#56/#390 concern per-line item totals/decimals, not the document-level discount). Not a duplicate.

### 12. 🟠 bulkSendQuoteEmails unconditionally writes status='sent' on a successful re-send, silently reverting accepted/converted quotes (invoice sibling was fixed in round 2, quote sibling was not)

- **Location:** `src/lib/quotesService.ts:1018`
- **Category:** state-machine · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** quotes-challans

**Scenario.** Staff filter the Quotes list to 'accepted' (or 'converted'), select those rows (checkboxes render on every row regardless of status), and run the bulk Send toolbar action to re-email a copy. bulkSendQuoteEmails fetches the rows without selecting or filtering on status, and after each successful send writes .update({ status: 'sent' }) unconditionally. An 'accepted' quote is reverted to 'sent', erasing the recorded customer acceptance (acceptedValue KPI drops, portal shows it awaiting response again); a 'converted' quote is reverted to 'sent', decoupling it from its issued invoice in status terms. Nothing re-derives the status back. The finder's added claim that this immediately re-enables a second Convert-to-Invoice is only partly accurate — QuoteDetailPage gates Convert on status==='accepted', so a second conversion would require re-accepting the quote first; the durable, silent loss of the accepted/converted state is the real defect.

```
await supabase
  .from('quotes')
  .update({ status: 'sent' })
  .eq('id', q.id);
```

**Verification.** Re-read src/lib/quotesService.ts:958-1019. The bulkSendQuoteEmails fetch selects only id/quote_number/case_id/customer (no status column) and has no status filter, so any non-deleted quote in the id list is a target. On a successful send it writes .update({ status: 'sent' }).eq('id', q.id) with no guard on the current status. quotes.status is a plain writable column whose union includes accepted/rejected/converted (line 54); no trigger re-derives it. The invoice mirror (invoiceService.ts:1280) was fixed in round 2 with `inv.status === 'draft' ? 'sent' : inv.status` and its fetch selects status (line 837); the quote sibling kept the broken pattern. Reachable end-to-end: QuotesListPage.tsx renders a checkbox on every row (line 501-503) irrespective of status, the status filter can be set to accepted/converted (lines 332/366), and the bulk-send toolbar (line 213-235) forwards all selected ids to bulkSendQuoteEmails with no status gate. Result: re-emailing a copy of an accepted or converted quote silently reverts it to 'sent', erasing the recorded acceptance/conversion (KPIs, portal display, approval gates). The round-2 audit doc catalogued only the invoice sibling (lines 1022-1026), not this quote function, so it is not a prior-round duplicate. One secondary claim is imprecise: a converted quote reverted to 'sent' does NOT directly re-enable Convert to Invoice, since QuoteDetailPage gates canConvert on status==='accepted' (line 231) — it would require a separate re-acceptance first; the primary durable-data-loss harm is independent of that.

### 13. 🟠 Role-module permission saves always fail: upsert onConflict 'role,module_id' matches no unique constraint (only UNIQUE is (tenant_id, role, module_id)) -> 42P10 on every save; rows also omit the NOT-NULL tenant_id with no stamping trigger

- **Location:** `src/lib/rolePermissionsService.ts:224`
- **Category:** db-contract-mismatch · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** settings-feature-gating

**Scenario.** An admin opens Settings/Admin -> Role Permissions (/admin/role-permissions), toggles any module for a configurable role (manager/technician/sales/accounts/hr/viewer) and clicks Apply. handleSaveChanges (RolePermissions.tsx:158) calls updateRolePermissions, which builds rows {role, module_id, can_access} (no tenant_id) and calls supabase.upsert(..., { onConflict: 'role,module_id' }) (rolePermissionsService.ts:221-225). PostgREST issues INSERT ... ON CONFLICT (role, module_id) DO UPDATE. The table's only unique constraints are PK(id) and role_module_permissions_tenant_id_role_module_id_key UNIQUE (tenant_id, role, module_id) (baseline_schema.sql:3995); no (role, module_id) index exists in any migration, so Postgres rejects the statement with 42P10 on every save and the page toasts 'Failed to update permissions'. Because get_accessible_modules COALESCEs missing rows to false (baseline_schema.sql:5494), configurable roles can never be granted module access from the UI. Even with a corrected conflict target the INSERT would still fail: tenant_id is NOT NULL with no default (line 2925), the rows omit it, and no BEFORE INSERT tenant-stamping trigger exists on the table.

```
.upsert(updates as never, {
  onConflict: 'role,module_id',
});
```

**Verification.** Traced end-to-end. role_module_permissions (baseline_schema.sql:2923) has only PK(id) and UNIQUE(tenant_id, role, module_id) (line 3995); no migration adds a (role, module_id) index. The upsert (rolePermissionsService.ts:224) uses onConflict:'role,module_id', so PostgREST emits ON CONFLICT (role, module_id), which matches no unique constraint -> Postgres 42P10 on every save. Path is reachable: /admin/role-permissions -> handleSaveChanges (RolePermissions.tsx:158) -> updateRolePermissions, and failure surfaces as the 'Failed to update permissions' toast. Secondary defect confirmed: tenant_id is NOT NULL with no default (line 2925), the built rows (lines 215-219) omit tenant_id, and there is no BEFORE INSERT tenant-stamping trigger on this table (grep of all migrations finds none) — so even a corrected conflict target would raise a NOT NULL violation. Peer upserts (gdprService, notificationPreferencesService, billingService) all include tenant_id in the conflict target, confirming this one is anomalous. get_accessible_modules COALESCEs missing rows to false (line 5494), so configurable roles can never be granted access from the UI. Not present in round-1/round-2/followups audit docs.

### 14. 🟠 Case Detail inline quote edit (Quotes/Invoices tab) replaces line items via raw supabase update but never recomputes quotes.subtotal/tax_amount/total_amount or *_base, leaving header totals permanently inconsistent with items — an uncatalogued second copy of round-1 #24, in a different file

- **Location:** `src/pages/cases/CaseDetail.tsx:840`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** cases-ui
- **Also at:** `src/pages/cases/CaseDetail.tsx:859`

**Scenario.** On Case Detail -> Quotes/Invoices tab, click the ungated Edit button (CaseFinancesTab.tsx:316-328) on any quote (e.g. a draft with one 100.00 item, total_amount=100). Add a second 50.00 line item and Save. CaseDetail.tsx:838 takes the editingQuoteId branch: updatePayload (840-852) patches header fields but omits subtotal/tax_amount/total_amount and the *_base snapshots, then quote_items are soft-deleted and re-inserted (859-877). Items now sum to 150.00 but quotes.total_amount stays 100.00 — the case Quotes list row (CaseFinancesTab.tsx:297 renders quote.total_amount), the case KPI strip, quote detail, stats, and PDF all show 100.00. Round-1 verified no DB trigger recomputes quote totals; round-1 #24 fixed this only in QuotesListPage (routed through quotesService.updateQuote), while this CaseDetail copy uses raw supabase.from('quotes').update and was never catalogued. The re-insert additionally drops unit_code/unit_label/item_code (real quote_items columns loaded by toQuoteEditInitialData and persisted by createQuote), silently losing those item fields each edit, and the updatePayload omits currency so a modal currency change is discarded. Fix: route the edit through quotesService.updateQuote(editingQuoteId, {...fields}, items) so totals/base and full item fields are recomputed and preserved, matching the create path.

```
const updatePayload: Database['public']['Tables']['quotes']['Update'] = { status: ..., tax_rate: ..., discount_amount: ..., ... }; // no subtotal/tax_amount/total_amount ... const itemsToInsert = items.map((item, index) => ({ quote_id: editingQuoteId, description: item.description, quantity: item.quantity, unit_price: item.unit_price, total: Math.round(...), sort_order: index }))
```

**Verification.** Traced the full path. CaseFinancesTab.tsx:316-328 shows an ungated Edit button for any quote that loads toQuoteEditInitialData and opens QuoteFormModal. On save CaseDetail.tsx:838 enters the editingQuoteId branch, whose updatePayload (840-852) sets status/valid_until/tax_rate/discount_amount/discount_type/title/client_reference/bank_account_id/terms/notes but omits subtotal/tax_amount/total_amount and every *_base column, then soft-deletes+re-inserts quote_items (859-877). Header totals stay frozen while items change; the case Quotes list row renders quote.total_amount directly (CaseFinancesTab.tsx:297), so the stale figure is user-visible, and it flows to KPI/detail/PDF/stats. No DB trigger recomputes quotes totals (round-1 verified; corroborated by quotesService.createQuote/updateQuote always writing totals explicitly at 461-469/634-642). This is NOT the prior-round finding: round-1 #24 was in src/pages/quotes/QuotesListPage.tsx and its fix routed only that page through quotesService.updateQuote — the CaseDetail.tsx copy uses raw supabase update and was never catalogued or fixed, so it is a genuine second instance, not a duplicate. Secondary claims also verified: the re-insert drops unit_code/unit_label/item_code (real quote_items columns, fk_quote_items_unit_code at types:13669, loaded by toQuoteEditInitialData 331-333, persisted by createQuote 507-509) and omits currency, so those are lost/discarded on edit. High severity: durably wrong money written on a common case-level quote-edit workflow, matching the round-1 twin; not critical since a quote is a pre-sale document.

### 15. 🟠 CaseDetail quote-create branch omits the selected currency, so foreign-currency quotes are booked in the tenant base currency at rate 1 (uncatalogued sibling of round-2 #22)

- **Location:** `src/pages/cases/CaseDetail.tsx:881`
- **Category:** money-currency · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** cases-ui

**Scenario.** Multi-currency tenant (base USD). User opens New Quote from a case's Quotes tab, picks EUR in cases/QuoteFormModal's currency select (rendered when currencies.length>1; value emitted on onSave via ...quoteData at QuoteFormModal.tsx:394), enters lines totalling 1,000. CaseDetail's create branch (CaseDetail.tsx:881-895) builds newQuote with explicit fields and omits `currency`, so createQuoteService -> resolveRateContext(undefined) falls back to base at rate 1 (currencyService.ts:143) and persists currency = rc.documentCurrency = USD (quotesService.ts:464) with USD *_base amounts. The stored/PDF quote reads 1,000 USD instead of EUR 1,000, and cross-currency SUM(*_base) reporting is corrupted. This is the same defect fixed in round 2 (#22) for QuotesListPage:759; the CaseDetail sibling was never catalogued or fixed.

```
const newQuote: QuoteShape = { case_id: id!, customer_id: ..., status: ..., tax_rate: ..., discount_amount: ..., discount_type: ..., bank_account_id: ..., terms: ..., notes: ... }; // `currency` absent — createQuote resolves undefined -> base
```

**Verification.** Traced the full chain in current code. CaseDetail.tsx create branch (lines 881-895) constructs newQuote:QuoteShape with 15 explicit fields and NO `currency` key — verified by reading the object. cases/QuoteFormModal.tsx keeps currency in state, renders a functional currency <select> when currencies.length>1 (line 543-551), and emits it on the onSave payload via ...quoteData (line 394). createQuote (quotesService.ts:415-416) calls resolveRateContext(quote.currency); with currency undefined, resolveRateContext returns docCurrency = documentCurrency||baseCurrency at rate 1 (currencyService.ts:143), and the insert persists currency = rc.documentCurrency = base with base *_base amounts (line 464-469). So a user-selected EUR quote is booked as base USD at rate 1. The fixed sibling QuotesListPage:762-764 now explicitly forwards quoteData.currency; CaseDetail was not given that fix. Not a prior-round duplicate: round1 #67 covered the INVOICE drop on CaseDetail:960; round2 #22 covered the QUOTE drop only on QuotesListPage:759 — the CaseDetail quote create path was never catalogued or fixed (confirmed by grep of both audit docs).

### 16. 🟠 InvoiceDetailPage/InvoicesListPage edit handlers hydrate line items from raw DB rows (column `discount`), bypassing the discount->discount_percent mapping, so saving a migrated invoice with per-line discounts durably zeroes them and raises the stored header totals

- **Location:** `src/pages/financial/InvoiceDetailPage.tsx:275`
- **Category:** data-loss-round-trip · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** invoices-credit-notes

**Scenario.** Data import writes invoice_line_items.discount (a percent) from the 'Discount' column (dataMigration/workbookContract.ts:413). A migrated draft, unpaid invoice has one line qty=1, unit_price=1000, discount=10% (stored total 900, subtotal 900). Staff open it on InvoiceDetailPage and click Edit. handleOpenEdit (InvoiceDetailPage.tsx:257-275) re-fetches invoice_line_items with select('*') and passes the raw rows straight into the modal, bypassing fetchInvoiceById's discount->discount_percent mapping (invoiceService.ts:370) even though the page's own display query already fetched the mapped version at line 94. The modal's InvoiceLineItem type has no per-line discount field and no per-line discount UI, so the raw rows (carrying `discount` but not `discount_percent`) are seeded into lineItems (line 230) and passed unchanged to onSave. updateInvoice maps discount_percent: i.discount_percent (undefined) into computeDocumentTotals and writes `discount: item.discount_percent || 0` (invoiceService.ts:770). Clicking 'Update Invoice' without touching anything therefore rewrites the line at 0% discount and jumps the stored subtotal/total from 900 to 1000 - a silent overcharge on a legal financial document that is not recoverable through the modal (no per-line discount input). The identical raw-row hydration exists in InvoicesListPage.handleEditInvoice (lines 110-124). Distinct from round-1 #20, which covered only the read-only PDF renderer.

```
const { data: items } = await supabase
  .from('invoice_line_items')
  .select('*')
  ...
setEditingInvoice({ ...data, invoice_line_items: items ?? [] } as unknown as InvoiceWithDetails);
```

**Verification.** Traced end-to-end. InvoiceDetailPage.handleOpenEdit (src/pages/financial/InvoiceDetailPage.tsx:257-275) fetches invoice_line_items with select('*') and passes the raw rows (which carry the DB column `discount`, not `discount_percent`) into setEditingInvoice, bypassing fetchInvoiceById's discount->discount_percent mapping (invoiceService.ts:370). Note the page's display query at line 94 already uses the mapped fetchInvoiceById, so this raw re-fetch is unnecessary and is what introduces the bug. InvoiceFormModal seeds lineItems from initialData.invoice_line_items (line 230) — its InvoiceLineItem type (lines 34-42) has no per-line discount field and no per-line discount UI — and passes them through onSave untouched (line 534). InvoiceDetailPage onSave forwards them to updateInvoice, which maps discount_percent: i.discount_percent (undefined) into computeDocumentTotals (line 703) and re-inserts each row with discount: item.discount_percent || 0 (line 770). Precondition is real: data import writes invoice_line_items.discount from the 'Discount' column (dataMigration/workbookContract.ts:413), and that column is a percent. So a migrated draft invoice (qty1, unit_price1000, discount10 -> stored total 900, subtotal 900) opened and re-saved with no changes rewrites the line at 0% and raises header totals 900->1000, silently erasing the discount on a customer-facing financial document. The identical raw-row hydration exists in InvoicesListPage.handleEditInvoice (lines 110-124). Not a duplicate of round-1 #20, which covered only the read-only PDF renderer (dataFetcher.ts:253); this is a durable write corruption and is strictly worse. Round-1 #20's verifier note even wrongly assumed the edit view used the mapped path.

### 17. 🟠 InvoiceDetailPage edit onSave omits currency/exchange_rate — deferred round-2 #21 sibling, so a currency change in the detail-page edit modal is silently discarded

- **Location:** `src/pages/financial/InvoiceDetailPage.tsx:623`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** r2-regression-cases-stock

**Scenario.** Multi-currency tenant (base USD, EUR enabled so currencies.length > 1). User opens a draft invoice's detail page, clicks Edit (editability 'full', currency select enabled), switches Currency from USD to EUR — the modal preview re-renders totals in EUR. On Save, the handler at InvoiceDetailPage.tsx:618-644 builds an explicit 18-field payload that drops currency/exchange_rate, so in updateInvoice currencyChanged (invoiceService.ts:674) is false, the rate context is never re-resolved, and the invoice is durably persisted still in USD at the old rate while the user believes they issued a EUR invoice. The equivalent list-page handlers were fixed in PR #421; this sibling was explicitly deferred in that PR's commit message and remains live.

```
terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              },   // <- no currency / exchange_rate forwarded
```

**Verification.** Traced end-to-end at HEAD 037faa7. (1) InvoiceDetailPage.tsx:618-644 edit onSave enumerates 18 fields into updateInvoice and omits currency/exchange_rate/rate_source. (2) InvoiceFormModal keeps currency in state (line 143), renders an enabled multi-currency select for drafts (lines 768-783, disabled only when isRestricted), previews totals in the selected docCurrency (line 484), and returns currency in the payload. (3) invoiceService.ts:674 — currencyChanged requires invoice.currency !== undefined; with the field stripped it stays false, so docCurrency/rate keep the existing values (lines 668-682) and totals are recomputed in the old currency — the EUR selection is silently discarded. (4) This IS round-2 finding #21 territory (docs/bug-audit-round2-2026-07-12.md:520-531 named all three handlers), but PR #421 fixed only the two InvoicesListPage handlers (lines 422/444 now forward currency) and its own commit message explicitly deferred 'InvoiceDetailPage currency' as a follow-up sibling; it is absent from docs/bug-audit-followups.md. Catalogued but demonstrably NOT fixed in current code, so per the method rules this is CONFIRMED rather than DUPLICATE_PRIOR_ROUND.

### 18. 🟠 Changing plans while on an active PayPal subscription creates a second subscription without cancelling the first and overwrites the only stored reference to it, double-billing the tenant with no in-app way to stop it

- **Location:** `supabase/functions/paypal-create-subscription/index.ts:251`
- **Category:** billing-double-charge · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** platform-admin-billing

**Scenario.** A tenant has an active paid subscription (tenant_subscriptions row: status 'active', paypal_subscription_id I-OLD, which PayPal bills recurringly). An owner/admin opens Settings -> Plans (PlansPage), where every non-current plan's 'Get Started' button is enabled (disabled only when isCurrentPlan). Clicking it calls createPayPalSubscription -> the paypal-create-subscription edge function, which does NOT look up or cancel the existing subscription: it creates a brand-new PayPal subscription I-NEW and upserts the single tenant_subscriptions row (onConflict 'tenant_id'; tenant_id is unique per isOneToOne), overwriting paypal_subscription_id with I-NEW. I-OLD is never cancelled at PayPal and its id is no longer stored anywhere. PayPal continues to bill BOTH subscriptions. paypal-cancel-subscription (which reads paypal_subscription_id) can only cancel I-NEW, and I-OLD's future PAYMENT.SALE.COMPLETED webhooks (billing_agreement_id=I-OLD) match no row in the webhook lookup, so those charges are never even recorded in billing_invoices. The tenant is double-billed indefinitely with no in-app path to stop it. (Note: billingService.changePlan targets a non-existent 'paypal-manage-subscription' function, so PlansPage 'Get Started' is the operative reachable plan-change path.)

```
const { error: upsertError } = await supabase
  .from("tenant_subscriptions")
  .upsert({
    tenant_id: tenantId,
    plan_id: planId,
    ...
    paypal_subscription_id: subscriptionData.id,
  }, {
    onConflict: 'tenant_id',
  });
```

**Verification.** Traced end-to-end from a real UI path. PlansPage.tsx:221 disables the plan button only for the current plan (disabled={isCurrentPlan || ...}); for any other plan an active subscriber can click 'Get Started', which calls createPayPalSubscription (billingService.ts:300) -> the cited paypal-create-subscription edge function. I read the whole function: it never looks up or cancels the tenant's existing PayPal subscription; it unconditionally creates a new one (I-NEW) and then upserts tenant_subscriptions with onConflict:'tenant_id'. tenant_subscriptions_tenant_id_fkey is isOneToOne:true (database.types.ts:17368-17370), so tenant_id is unique and the upsert UPDATEs the single row, overwriting paypal_subscription_id from I-OLD to I-NEW. Consequently: (a) I-OLD is never cancelled at PayPal and keeps billing; (b) paypal-cancel-subscription reads paypal_subscription_id (now I-NEW) so it can never cancel I-OLD; (c) I-OLD's future PAYMENT.SALE.COMPLETED webhooks carry billing_agreement_id=I-OLD, which the webhook lookup (paypal-webhook lines 313-316, .eq('paypal_subscription_id', ...)) no longer matches, so subscription is null and no billing_invoices row is written while PayPal still charges. Result is durable double-billing with no in-app remedy. The finder's parenthetical that the only change-plan path is billingService.changePlan->paypal-manage-subscription is imprecise wording (and paypal-manage-subscription does not exist among supabase/functions), but the cited file/line and the cited PlansPage 'Get Started' trigger are the actually-reachable path, so the wording error does not refute the defect. Not a prior-round duplicate: round2 #25 concerned a different bug on this upsert (status 'pending' CHECK violation), now fixed to 'trialing'; the no-cancellation/overwrite double-billing defect is not catalogued in either round doc.

### 19. 🟠 paypal-create-subscription upserts status 'trialing' before PayPal approval, granting plan entitlement (and overwriting past_due/cancelled/active rows) to tenants who never pay

- **Location:** `supabase/functions/paypal-create-subscription/index.ts:260`
- **Category:** entitlement-bypass · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** r2-regression-platform-misc
- **Also at:** `supabase/functions/paypal-create-subscription/index.ts:260`

**Scenario.** Round-2 fix #25 replaced the CHECK-violating status 'pending' with 'trialing', but 'trialing' is in ACTIVE_SUBSCRIPTION_STATUSES (billingService.ts:20) and isSubscriptionEntitled()/hasFeatureAccess() grant plan features on it. The upsert runs at CREATE time, before the user ever approves or pays at PayPal. A tenant whose subscription is 'past_due' (payment failed, entitlement revoked) or 'cancelled' opens PlansPage, clicks any plan -> createPayPalSubscription upserts their row (onConflict tenant_id) to status='trialing' with the NEW plan_id, then redirects to PayPal; the user abandons the approval page. No ACTIVATED webhook ever fires (unapproved subscriptions emit none), so the row stays 'trialing' indefinitely -> full entitlement to the picked (even higher) plan with zero payment. Side effect: for an ACTIVE subscriber the upsert also overwrites paypal_subscription_id with the new unapproved I-id, so the PAYMENT.SALE.COMPLETED renewal lookup and paypal-cancel-subscription can no longer resolve the real billing agreement. Pre-fix the upsert failed entirely, so none of these overwrites could land; the fix should have used the non-entitling constraint-valid 'unpaid'.

```
status: 'trialing',
        billing_interval: billingInterval,
        paypal_subscription_id: subscriptionData.id,
      ...
      }, {
        onConflict: 'tenant_id',
      });
```

**Verification.** Traced end-to-end in current source. paypal-create-subscription/index.ts:260 upserts status:'trialing' (onConflict tenant_id) right after PayPal creates the subscription in APPROVAL_PENDING, before the user approves or pays. billingService.ts:20 lists 'trialing' in ACTIVE_SUBSCRIPTION_STATUSES; isSubscriptionEntitled (l.27) returns true for it, and getTenantSubscription (l.77-92, no status filter) feeds hasFeatureAccess (l.574-575) / getFeatureLimit (l.592-593), so the row grants full paid entitlement. paypal-webhook only reacts to real lifecycle events (ACTIVATED at l.211); an abandoned/unapproved subscription emits no ACTIVATED and there is no reconciliation job (grep found none), so the 'trialing' row entitles indefinitely with zero payment. The onConflict:'tenant_id' upsert additionally overwrites an existing past_due/cancelled row back to entitled and replaces an active subscriber's paypal_subscription_id with the new unapproved I-id, breaking renewal/cancel lookups keyed on it. Not a duplicate: round-2 #25 concerned status:'pending' failing the CHECK (upsert failing outright); this entitlement grant is a new defect introduced by that fix. The finder's 'unpaid' remedy is correct.

### 20. 🟠 PAYMENT.SALE.COMPLETED writes the dollar amount into billing_invoices' integer-CENTS columns without *100, so every recorded SaaS payment is rounded to whole cents and understated ~100x

- **Location:** `supabase/functions/paypal-webhook/index.ts:345`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** edge-functions

**Scenario.** PayPal delivers PAYMENT.SALE.COMPLETED with resource.amount.total='49.99'. index.ts:309 sets amount=parseFloat(...)=49.99 (dollars). Lines 345-347 insert subtotal/total/amount_paid=49.99 into billing_invoices, whose subtotal/total/amount_paid/amount_due are integer CENTS (baseline_schema.sql 336-341; billingService formatPrice divides by 100 at 687, computeBillingMetrics does revenueThisMonth/100 at 679, formatPlanPrice does price*100 at 692). Postgres assignment-casts 49.99 into the integer column, rounding to 50, so total=50 cents and the platform billing dashboard renders $0.50 for a $49.99 charge (~100x understatement); a $499.99 yearly charge stores 500 -> $5.00. The insert succeeds (no rejection). Fix: use Math.round(amount * 100) for subtotal/total/amount_paid.

```
const amount = parseFloat(event.resource?.amount?.total || "0");
...
              subtotal: amount,
              total: amount,
              amount_paid: amount,
```

**Verification.** Traced end-to-end in current source. paypal-webhook/index.ts:309 sets amount=parseFloat(resource.amount.total) in DOLLARS; lines 345-347 insert subtotal/total/amount_paid = amount into billing_invoices. baseline_schema.sql lines 336-341 declare subtotal/total/amount_paid/amount_due as `integer`, and billingService.ts confirms the cents convention (formatPrice cents/100 at 687, revenueThisMonth/100 at 679, formatPlanPrice Number(price)*100 at 692). Inserting 49.99 into an integer column does NOT fail — Postgres assignment-casts and rounds to 50, so a $49.99 payment is stored as total=50 cents and the platform billing dashboard shows $0.50 (~100x understatement); $499.99 yearly stores 500 -> $5.00. This is durable wrong money on every successful SaaS payment. NOT a duplicate of round-1 #3: that finding was the nonexistent-column `amount_cents` insert-failure (now removed); this is a new scaling regression introduced by that fix, which mapped to the real columns but dropped the *100. The finder's title is imprecise only in the 'or failing the insert' alternative — Postgres rounds rather than rejects, so the real symptom is the ~100x understatement, not a swallowed insert error.

### 21. 🟠 record_expense_disbursement seeds current_balance_base from 0 when NULL, flipping the Banking cash KPI to a negative figure for any UI-created account

- **Location:** `supabase/migrations/20260622074117_expense_disbursement_atomic_rpc.sql:103`
- **Category:** money-math · **Verdict:** CONFIRMED · **double-confirmed** · **Finder:** banking-payments

**Scenario.** bankingService.createAccount (lines 214-232) never sets current_balance_base/opening_balance_base, so every account created via Banking → Add Account has current_balance_base = NULL; the Banking KPI and reports then fall back to current_balance (e.g. 5000). An accounts-role user pays a 100 approved expense from that account (ExpensesList → recordExpenseDisbursement → record_expense_disbursement RPC). Line 103 computes current_balance_base = COALESCE(NULL,0) - (100 * COALESCE(exchange_rate,1)) = -100 and stores it, while current_balance correctly becomes 4900. From then on sumBankBalanceBase (financialReportsService.ts:12) prefers the stored -100 over 4900, so getBankingSummary's Bank/Cash/Mobile balance tiles (bankingService.ts:720-732) and the cash-flow report's closing balance (financialReportsService.ts:299-300) report -100 instead of 4900 for that account — a permanent offset equal to the account's initial balance. This RPC is the only writer of current_balance_base (no trigger/backfill/other service maintains it), so nothing self-heals; subsequent disbursements just decrement further from the wrong base. Correct seeding would be COALESCE(current_balance_base, current_balance * COALESCE(exchange_rate,1)) before subtracting.

```
current_balance_base = COALESCE(current_balance_base, 0) - (v_exp.amount * COALESCE(exchange_rate, 1)),
```

**Verification.** Traced end-to-end. createAccount (bankingService.ts:214-232) never sets current_balance_base, so UI-created accounts have NULL base (types line 835 confirms nullable). record_expense_disbursement line 103 seeds current_balance_base from COALESCE(NULL,0), so a 100 disbursement stores -100 while current_balance correctly becomes 4900. This RPC is the only writer of current_balance_base (grep of supabase/migrations/ returns only this file; no trigger/default/backfill maintains it), so the wrong value is never corrected. sumBankBalanceBase (financialReportsService.ts:12) prefers current_balance_base over current_balance, and getBankingSummary (bankingService.ts:710,720-732) plus generateCashFlowReport (299-300) both consume it — so the Banking Bank/Cash/Mobile balance tiles and cash-flow closing balance flip from 4900 to -100 for that account. Correct fix is COALESCE(current_balance_base, current_balance * exchange_rate) before subtracting. Not catalogued in rounds 1-2. Only mitigant on severity: current_balance and the insufficient-funds gate stay correct, so real cash movement is unaffected — the defect is a durably-wrong negative KPI/report figure.

## 🟡 Medium (81)

### 22. changeCompanyMutation discards the log_case_history RPC result, so a DB-level failure of the COMPANY_CHANGED append-only audit write is silently swallowed — the round-2 fix added the error check only to the sibling client path

`src/components/cases/ClientTab.tsx:242` · audit-integrity

A user reassigns a case's company via the Change Company modal. cases.company_id UPDATE succeeds (checked, line 238). The subsequent log_case_history call for COMPANY_CHANGED (line 242) uses the correct p_details arg so it normally succeeds, but it is awaited without destructuring {error} and without throwing. If the RPC fails at the DB level (RLS denial, function exception, constraint), supabase-js resolves instead of rejecting, the error is discarded, the mutation hits onSuccess and closes the modal, and no COMPANY_CHANGED row is appended to the forensic case_job_history. The sibling changeClientMutation was hardened in round 2 to destructure historyError and throw; the company path was left with the unchecked call. Genuine but lower-probability than the round-2 client bug because the company call fails only on an actual DB error rather than on every invocation.

### 23. Create Case wizard collects Service Location (and Welcome Email/SMS) but silently drops them — cases.service_location_id is never written

`src/components/cases/CreateCaseWizard.tsx:375` · wizard-field-loss

Intake operator fills the wizard: the 'Location' SearchableSelect (lines 657-665, auto-defaulted from catalog_service_locations at 272-276) sets formData.service_location_id, and the Welcome Email/SMS checkboxes set formData.welcome_email/welcome_sms. createCaseMutation builds the cases insert (lines 375-418) from case_number/customer_id/subject/priority/status/contact_id/client_reference/service_type_id/company_id only — service_location_id is a real cases column (database.types.ts cases.Row.service_location_id) but is never included, so it stays NULL on every wizard-created case and the operator's onsite/in-lab/remote choice is lost; welcome_email/welcome_sms are referenced nowhere outside their checkboxes (repo-wide grep), so checking 'Welcome Email' sends nothing. Silent intake data loss behind functional-looking controls.

### 24. Case-attachment delete swallows the storage.remove error and hard-DELETEs a row the DELETE RLS filters to admin-only, so non-admins get a false 'File deleted' toast (0 rows deleted) and blobs can be orphaned

`src/components/cases/detail/CaseFilesTab.tsx:136` · evidence-integrity

handleDelete awaits supabase.storage.remove([...]) discarding its {error} result (storage-js does not throw), then hard-deletes the case_attachments row (lines 138-141, violating the soft-delete rule). The DELETE policy is USING(has_role('admin')) (baseline_schema.sql:6472-6473) and the Delete button is not permission-gated, so for any manager/technician the DELETE matches 0 rows with NO error and line 145 still toasts 'File deleted' while the row reappears on refetch. For admins, a failed storage.remove is swallowed and the row is deleted, orphaning the blob. Whether a non-admin's unchecked storage.remove actually destroys the blob (leaving a record pointing at a gone file) depends on the case-attachments bucket's storage.objects RLS, which is not defined in any migration and cannot be confirmed from source.

### 25. Document discount is uncapped on quotes end-to-end, so a fixed discount larger than the subtotal (or a percentage over 100) persists a quote with negative tax_amount and total_amount

`src/components/cases/QuoteFormModal.tsx:356` · money-math

Staff create a quote with one line of 300.00 and type 500 in the Discount field (input has min="0" but no max and no clamp, QuoteFormModal.tsx:696-705); with 5% VAT the preview shows Discount -500, Net -200, Tax -10, Total -210 and the Save button stays enabled (handleSubmit at 361-411 validates only case/title/items). createQuote passes discount_amount raw into computeDocumentTotals (quotesService.ts:431), which sets documentDiscount unclamped (taxDocumentService.ts:320-322: percentage is (subtotal*amount)/100, fixed is `input.discountAmount || 0`), and the tax kernel allocates the full 500 against the 300 line (kernel/index.ts:104-114), producing netTaxable -200, tax -10, grandTotal -210. quotes has NO non-negative CHECK (only invoices got chk_invoices_balance_due_nonneg in migration 20260601094304), so quotes.total_amount=-210 and tax_amount=-10 persist, along with negative document_tax_lines — a customer-facing quote PDF and portal approval showing a negative total, and caseFinancialSummary.totalQuoted is reduced. Converting the quote later throws 23514 on the invoice balance_due CHECK, stranding the workflow. The identical defect on InvoiceFormModal (same unclamped preview at lines 491-499) is rejected by the DB CHECK with a raw-constraint error surfaced as the misleading toast 'Invoice couldn't be saved. Check your connection and try again.' Both prior audits fixed exactly this bug for StockSaleModal only (round-1 #36, round-2 #39); the quote/invoice document-discount siblings were never covered.

### 26. Expense form's 'Link to Case' picker filters on retired pre-v1.3.0 status names 'Open'/'In Progress' (absent from the canonical 15-status vocabulary), so the dropdown is always empty — expenses cannot be linked to cases and edited links render as 'No Case'

`src/components/financial/ExpenseFormModal.tsx:71` · stale-status-vocabulary

User opens New Expense (or edits one) and tries to link it to an active recovery case for billable tracking. The picker query runs .from('cases').select(...).in('status', ['Open','In Progress']): the canonical 15-status vocabulary (Registered, Device Received, In Diagnosis, Recovery in Progress, ... — seedData.ts:646-661; all legacy rows remapped in v1.3.0) contains neither name, so the query succeeds with 0 rows (the error-fallback at line 74 that would load all cases never fires) and the dropdown offers only 'No Case'. Case-billable expenses ('Billable to linked case' checkbox, line 382) are silently impossible, and editing an already-linked expense renders the select showing 'No Case' even though case_id is set — inviting the user to believe the link is gone.

### 27. RecordPaymentModal defaults payment_date to the UTC calendar day, so a UTC+ tenant recording a payment after local midnight at a month boundary stamps the prior month as the tax point/VAT period — a document-date write path missed by the Phase-0 tenantToday sweep

`src/components/financial/RecordPaymentModal.tsx:89` · timezone-off-by-one

The modal seeds paymentDate with new Date().toISOString().split('T')[0] (line 89; reset at 350) and submits it as payment_date in the onSave payload (lines 287 and 324). For a Muscat (UTC+4) lab, recording a payment at 00:30 local on 2026-08-01 pre-fills and defaults to '2026-07-31', booking the payment into July's stats, receipts, and VAT period unless the accountant manually corrects the date picker. This is the wrong-tax-point/wrong-VAT-period defect that tenantToday.ts documents as the reason document-date write paths must use tenantToday(); Phase 0 swept only 5 modals (tenantToday.test.ts SWEPT_FILES) and this payment write path was missed. Impact is limited to the local-midnight-to-offset window at month/quarter boundaries and is user-editable, hence medium rather than high.

### 28. Device Specifications card in InventoryDetailModal reads deprecated legacy columns (firmware_version/pcb_number/head_map) instead of technical_details, so recorded firmware/PCB/head-map specs never display

`src/components/inventory/InventoryDetailModal.tsx:578` · wrong-column-read

A technician records Firmware 'CC49', PCB '2060-771640' and Head Map '0,1' on an HDD/head-stack donor via InventoryItemWizard; serializeInventorySpecs writes them only into technical_details (keys firmware_version/pcb_number/physical_head_map). The legacy inventory_items columns firmware_version/pcb_number/head_map are marked DEPRECATED and are never written by any current path, so they are NULL. Opening the item's detail modal, the Device Specifications card renders item.firmware_version / item.pcb_number / item.head_map — all NULL — so the Firmware, PCB Number and Head Map rows silently never appear. The same file already reads technical_details correctly for AssignToCaseModal's deviceSpecs (lines 722-735). Donor-matching identity data is invisible on the primary detail surface, though it is not lost (still stored in technical_details and shown when assigning to a case).

### 29. Payroll adjustment form offers 'commission' and 'penalty' type options absent from the payroll_adjustments_type_check constraint, so submitting either always fails with a raw 23514 error

`src/components/payroll/AdjustmentFormModal.tsx:109` · db-contract-mismatch

The type dropdown offers commission and penalty, but the DB CHECK allows only bonus/deduction/advance/reimbursement/other (baseline_schema.sql:4075; no migration widens it). An HR user picks Commission or Penalty, fills amount/description, clicks Create; createPayrollAdjustment's raw insert raises Postgres 23514 and the raw check-violation message is toasted. Those two adjustment types can never be saved. isDeductionType (PayrollAdjustmentsPage.tsx:91) special-cases 'penalty', so the display logic is written for a value the DB rejects (dead branch). Default type is bonus (valid) and the user can recover by choosing an allowed type, hence recoverable.

### 30. Editing a recruitment candidate overwrites applied_date with today's date, permanently losing the original application date

`src/components/recruitment/CandidateFormModal.tsx:113` · data-loss

The edit and create paths share one payload (CandidateFormModal.tsx:104-117) that always sets applied_date to today's UTC calendar day. On the edit branch it is passed unchanged to updateCandidate (line 116 → recruitmentService.ts:155-165), which spreads it into supabase.update(). So a recruiter opening Edit Candidate to change any unrelated field (rating, stage, notes) and saving rewrites applied_date to today; the original date is not preserved anywhere and is lost. The pipeline card 'Applied {date}' (RecruitmentPage.tsx:136) and any time-in-pipeline reporting then show a false application date. This happens on every edit of every candidate. Secondary: the written value is the UTC calendar day, not the tenant-local day, which can additionally be off by one for UTC+ tenants near midnight.

### 31. LabelStudio 'Save & deploy' merges the edited entity into a fallback-default base whenever loaded prefs are absent (undefined during load) or silently error-defaulted, resetting all three entities' saved label designs to factory defaults

`src/components/settings/labels/LabelStudio.tsx:72` · settings-data-loss

A tenant has saved non-default label designs. Reachable two ways: (A) the single company_settings SELECT transiently fails — getOrCreateCompanySettings swallows the error and returns DEFAULT_COMPANY_SETTINGS (id:''), so getLabelPrintingPrefs resolves successfully with factory-default prefs and the query reports no error; the editor renders the factory design as if it were the tenant's. (B) The admin opens the editor and clicks 'Save & deploy' before the first prefs fetch resolves (prefs undefined; the button is only disabled on isPending). In either case effectivePrefs = DEFAULT_LABEL_PRINTING_PREFS, and mergeEntityConfig rebuilds the full parallel maps for case/stock/inventory from defaults. setLabelPrintingPrefs then writes that all-defaults label_printing bucket; updateCompanySettings's .update().not('id','is',null) hits the real RLS-scoped row despite the id:'' base, so sizes, copies, showQr/showBarcode, field toggles and autoPrint of ALL THREE entities are durably reset to factory defaults, accompanied by a success toast. Impact is limited to label-design configuration (recoverable by re-entry) and the trigger is a narrow load race or a transient read error, so this is medium rather than high.

### 32. StockItemFormModal still drops five persisted fields on save/edit — warranty_months, tax_inclusive, location, specifications, is_featured (round-2 #38 only fixed model/capacity)

`src/components/stock/StockItemFormModal.tsx:144` · form-roundtrip-data-loss

A technician creating/editing a saleable stock item sets Warranty=12, ticks 'Price is tax inclusive', enters Storage Location 'Shelf A3', fills Specification key/value rows, and ticks 'Featured', then clicks Save (success toast). The payload built at lines 144-161 omits warranty_months, tax_inclusive, location, specifications and is_featured, so createStockItem/updateStockItem never persist them. Reopening the item shows Warranty blank, tax-inclusive unchecked, Location blank, and an empty Specifications tab (edit hydration hardcodes these at lines 98/101/102/105/107). Warranty terms and tax-inclusive pricing entered for customer stock sales are silently lost on every create and every edit; the loss is recoverable only by manual re-entry through another surface.

### 33. Round-2 fix incomplete: fixed-discount PREVIEW (StockSaleModal.tsx:306) lacks the negative clamp the submit path got — a typed negative fixed discount previews as a surcharge and persists tax lines computed on an inflated base with zero discount

`src/components/stock/StockSaleModal.tsx:306` · money-math

Cashier types or pastes '-50' in the fixed-discount box (min=\"0\" does not block typed negatives in a controlled number input) on a 100.00 cart in a 15% VAT tenant. Preview discountAmount = Math.min(-50, 100) = -50: the Total row and the 'Create Sale' button show 172.50 (100 + 50 surcharge + 22.50 tax), the Discount row is hidden (discountAmount > 0 guard), and the debounced effect calls computeStockSaleTax with documentDiscount=-50, so the kernel computes tax on a 150.00 base (22.50 instead of 15.00). On submit, discount_value is clamped to 0 and coerced to null, but the inflated taxComputation is threaded verbatim into p_tax_lines; record_stock_sale recomputes v_discount_amount=0 yet sums v_tax_total from the inflated rollups, persisting stock_sales with subtotal=100, discount=0, tax_amount=22.50, total_amount=122.50, plus document_tax_lines and vat_records rows with taxable_base=150 that flow into VAT filings. Preview (172.50 — what the cashier charges), persisted record (122.50), and the correct total (115.00) all diverge.

### 34. Editing a purchase order soft-deletes and re-inserts all purchase_order_items, silently destroying received_quantity and stock_item_id receive/stock-linkage tracking

`src/components/suppliers/PurchaseOrderFormModal.tsx:256` · data-loss · double-confirmed

PO orders 10 HDD donor drives; user receives 4 via Receive-into-Stock (RPC receive_stock_from_po sets purchase_order_items.received_quantity=4 and links stock_item_id). User then opens Edit Order on the detail page to fix a typo in Notes and saves. handleSubmit soft-deletes every live item row and inserts fresh rows built by buildItemRows (lines 233-244), which carry only description/quantity/unit_price/total/sort_order — so the new rows have received_quantity=NULL and stock_item_id=NULL. The 4-received record and stock linkage are unrecoverable; the next Receive modal shows no linked stock item and defaults to the full 10, and received-vs-ordered reconciliation is permanently wrong. The delete+insert is also non-atomic: if the insert at line 265-268 fails after the soft-delete succeeded, the PO is left with zero line items. Introduced by the round-1 #8 fix (replace-children strategy) before receive tracking was wired; not catalogued in either round.

### 35. Sign-out never clears the TanStack QueryClient singleton, so on a shared browser a different-tenant user who signs in within gcTime can transiently see the previous tenant's cached case/customer/financial rows

`src/contexts/AuthContext.tsx:291` · tenant-isolation

Tenant-A staff browse /cases and /financial/invoices; rows cache in the module-singleton QueryClient (main.tsx:77) under tenant-agnostic keys like ['cases','list',{filters}] (queryKeys.ts). They sign out (Sidebar.tsx:44-45: signOut()+navigate('/login') — SPA, no reload; window.location.replace only runs in performSignOut error branches). The SIGNED_OUT handler (AuthContext.tsx:269-298) clears rolePermissionsService and localStorage.tenant_id but never the QueryClient (no clear/removeQueries/resetQueries anywhere in src/). A different-tenant user signs in on the same browser within the 5-min default gcTime and opens /cases: the identical key hits the warm cache and tenant A's rows render. If the cached entry is still within the 60s staleTime, refetchOnMount does not refetch and the foreign rows stay on screen until stale; if already stale, a background refetch replaces them with the correct tenant-B rows after a flash. Server RLS is never bypassed — this is a client-side cross-tenant display disclosure, bounded by staleTime/gcTime and self-correcting on refetch or reload, and reachable only when two different tenants' users share a browser within the window.

### 36. Portal session-timeout control is structurally non-functional: getPortalSettings reads company_settings on the anon portal client, which no RLS policy grants (all TO authenticated + RESTRICTIVE tenant isolation), so it always returns null and the resolved timeout stays the hardcoded 24h default — round-1 fix #39 gates on a value that can never change on the portal surface.

`src/contexts/PortalAuthContext.tsx:115` · incomplete-fix

A tenant admin sets Session Timeout to 60 minutes in Settings → Client Portal (persisted to company_settings.portal_settings.portal_session_timeout). A customer logs into the portal; the portal supabase client has no Supabase auth session (custom authenticate_portal_customer RPC, no setSession, anon key). refreshTimeout() → getPortalSettings() SELECTs company_settings, which has SELECT only TO authenticated plus a RESTRICTIVE tenant_isolation policy — the anon-role read matches no policy and returns 0 rows, so getPortalSettings returns null and resolved stays DEFAULT_TIMEOUT_MINUTES=1440. Both the restore check (line 138) and every route-change check (line 179) therefore compare against ~24h. A portal session left idle in an open tab on a shared machine survives ~24h instead of the tenant's 60 minutes, silently defeating the tenant's session-timeout security control. Exposure is bounded because portal_session lives in sessionStorage (cleared on tab/browser close). The same unreadable-settings root cause also drops portal branding/support-email on the portal surface.

### 37. document_tax_lines rollup query (documentComplianceKeys.taxLines) is never invalidated after invoice/quote edits, so the always-mounted true-to-print preview shows stale VAT component rows against the refreshed header total for up to the 60s staleTime window

`src/hooks/useDocumentCompliance.ts:56` · stale-cache

On InvoiceDetailPage the InvoiceDocument is rendered inline and stays mounted (InvoiceDetailPage.tsx:839); its tax rows come from useDocumentCompliance's linesQuery, which has no per-query staleTime and inherits the global 60s freshness (main.tsx:80). A user opens an invoice and edits its line items (changing taxable amounts). updateInvoice deletes/re-inserts items and rewrites document_tax_lines via persistDocumentTaxLines (invoiceService.ts:787; quotes quotesService.ts:680); the save handler invalidates only ['invoice',id]/['invoices']/['invoice_payments',id]/['invoice_stats'] (InvoiceDetailPage.tsx:645-648). documentComplianceKeys is referenced nowhere outside the hook, so no invalidateQueries ever hits linesQuery. Because the observer stays mounted, its key is unchanged, and the cached data is still within the 60s freshness window, it neither refetches nor (being fresh) refetches on window refocus. Result: InvoiceDocument.tsx:129 shows the refreshed invoice.total_amount while the compliance band's VAT component row (summed at line 128) still shows the pre-edit amount, producing an on-screen total that does not reconcile with its own tax line. The pdfmake print path fetches document_tax_lines fresh via pdfService, so the printed PDF is correct and the 'true-to-print' preview diverges from it until the user navigates away and back, or the query goes stale (60s) and the window is refocused/remounted.

### 38. Banking Receipts tab reads payment_receipts while the Record Payment flow now writes to receipts via the create_receipt_with_allocations RPC, so the register never shows newly recorded receipts

`src/lib/bankingService.ts:336` · incomplete-fix

Accountant opens Banking → Record Payment, allocates an amount to an open invoice and submits. The modal's canSubmit requires at least one positive allocation, so BankingPage.createReceiptMutation always calls bankingService.createReceiptWithAllocations (bankingService.ts:997), which since 037faa7 routes through the create_receipt_with_allocations RPC and inserts the row into public.receipts (the legacy payment_receipts-inserting createReceipt at line 358 is unreachable). The money side is fully correct: invoice amount_paid/balance_due recompute, deposit-account credit, and the income financial_transactions posting all happen atomically. But the Receipts tab (BankingPage.tsx:69-78) lists via getReceipts, which queries .from('payment_receipts') (bankingService.ts:336) — a table this flow no longer writes — and onSuccess invalidates ['payment_receipts'] (BankingPage.tsx:142). The just-recorded receipt never appears ('0 receipts found'), and since no other UI reads the receipts table, the app's only receipts register stays permanently empty for all new receipts. Stale-UI consequence: an operator reviewing receipts may conclude a partial receipt was never recorded and re-record it (fully settled invoices drop out of the payable list, so only partials are exposed to this).

### 39. Banking KPIs and cash-flow closing balance read the stale stored current_balance_base, which receipt/transfer/adjust RPCs never maintain, so dashboard totals freeze while per-account balances (and the ledger) keep moving

`src/lib/bankingService.ts:710` · money-math

sumBankBalanceBase (financialReportsService.ts:11-14) prefers current_balance_base over the live current_balance. That base column is set once — by the bank_accounts BEFORE INSERT trigger (manifest 20260702012501: current_balance_base = value x COALESCE(exchange_rate,1) when NULL), by an expense disbursement, or by imported-account backfill — but the money-moving RPCs never re-write it: create_receipt_with_allocations does 'UPDATE bank_accounts SET current_balance = COALESCE(current_balance,0)+v_total_alloc' (current_balance only; design doc :184-188), and execute_account_transfer/complete_account_transfer/adjust_account_balance apply 'current_balance = current_balance +/- amount' (manifest 20260712100310). So for an account with current_balance=current_balance_base=1000, an accountant recording a 500 receipt (or an account transfer) moves current_balance to 1500 while base stays 1000. getAccountBalanceSummary (bankingService.ts:708) and the Bank/Total Balance KPIs (BankingPage.tsx:262/284) still show 1000, but the account card on the same page (BankingPage.tsx:439) shows 1500; generateCashFlowReport closingBalance (financialReportsService.ts:299) is equally frozen. The true balance and the append-only ledger stay correct — only the derived base rollup drifts — but the drift is permanent and widens with every receipt/transfer. Contrast record_expense_disbursement (manifest 20260622074117), which correctly debits current_balance AND current_balance_base, showing the dual-write convention these RPCs omit. Fix: either drop the base preference for base-currency accounts / recompute base from current_balance, or have the receipt/transfer/adjust/manual-txn RPCs maintain current_balance_base the way the disbursement RPC does.

### 40. deleteCaseService treats the void delete_case_permanently RPC as data-returning, so every successful case deletion falsely reports failure and skips cache invalidation + navigation (deletion itself still commits)

`src/lib/caseService.ts:44` · rpc-contract-mismatch

Admin clicks Delete Case and confirms. supabase.rpc('delete_case_permanently') runs the SECURITY DEFINER function (RETURNS void; commits UPDATE cases SET deleted_at = now()), so data is null. deleteCaseService's `if (!data) throw` fires 'No data returned from deletion'. deleteCaseMutation.onError shows 'Failed to delete case: No data returned from deletion' even though the case is already soft-deleted; onSuccess (invalidate ['cases']/['cases_count']/command-stats, success toast, navigate('/cases')) never runs, leaving the admin on a deleted case with stale lists. The deletion itself succeeded and is recoverable via refresh — the defect is false failure feedback plus skipped invalidation/navigation, not lost or wrong data.

### 41. suggestNextAction trusts a false ordering assumption: getAllowedTransitions sorts by destination-status sort_order (not edge sort_order), so the Stage Banner primary CTA is the BACKWARD transition for the awaiting_approval and qa phases

`src/lib/caseStateMachineService.ts:187` · broken-state-transition

Case in 'Awaiting Customer Approval' (phase awaiting_approval): getAllowedTransitions orders destination statuses by master_case_statuses.sort_order (.order('sort_order') at lines 124-129), returning Preparing Quote (quoting, sort 40) before Approved — In Queue (approved, sort 60); is_reopen is false for both. suggestNextAction picks the first non-cancel/non-reopen entry, so the CaseStageBanner primary button reads 'Revise the quote' (awaiting_approval→quoting) while the actual forward move 'Approved — In Queue' is demoted to a secondary button — one confirm click regresses the case to quoting. Same for phase qa: Recovery in Progress (sort 70) sorts before Ready for Delivery (sort 90), so the primary CTA becomes 'QA failed — return to recovery for rework' instead of 'QA passed — prepare deliverables'. Deterministic given the seeded canonical sort orders (20260704190411_standardize_case_lifecycle.sql:34-55).

### 42. createCompany's is_primary:true relationship insert can violate uq_customer_primary_company (23505) when the chosen contact already has a primary company; the failure is only logger.warn'd, so the company is created with no relationship row and the user's explicit primary-contact selection is silently dropped

`src/lib/companyService.ts:93` · swallowed-error

In CompaniesListPage the "Primary Contact" picker lists every customer unfiltered. If the user selects a customer who already has a live primary company, createCompany (companyService.ts:90-92) inserts customer_company_relationships {customer_id, company_id, is_primary:true}; the partial unique index uq_customer_primary_company rejects it with 23505. Lines 93-95 only logger.warn and createCompany returns the new company, so the mutation's onSuccess fires (success toast, list invalidated). The company exists with no relationship row at all (not even non-primary), the Companies list shows Primary Contact "-", and any downstream resolution via the relationship never finds the contact. Recoverable — the link can be added later via the manage-companies UI — but the explicit user choice is silently lost. Unlike customerService.setPrimaryCompany, this raw insert neither demotes the existing primary nor surfaces the error.

### 43. company_settings.metadata writers do a full-column read-modify-write sourced from a per-tab cache (up to 5 min stale); a concurrent or within-window save from another tab/admin silently erases metadata sub-keys (lost-update on tenant lifecycle/tax/table config)

`src/lib/companySettingsService.ts:199` · race-condition

Six services read company_settings.metadata via getOrCreateCompanySettings() (module-level per-tab cache, 5-min TTL), spread it, add their sub-key, and call updateCompanySettings({ metadata }) which does a full JSONB replace with no DB-side merge. invalidateCompanySettingsCache clears only the writing runtime. Concretely: admin tab A saves case_status_types via Settings -> Case Lifecycle at t0; the same admin's tab B (or a second admin) whose metadata snapshot predates t0 saves table_columns while its cache is still warm -> tab B's spread lacks case_status_types and the full-replace deletes it. metadata.case_status_types feeds resolveStatusTypes (imported-vocabulary lifecycle classification), so it silently reverts; the same clobber applies to table_columns, list_page_size, list_selection_checkboxes, label_printing, stat_card_style, einvoice_readiness, and tax_registration_status. Data loss is silent and recoverable only by re-entering the setting. Scope is admin-only, infrequent settings editing requiring two interleaved writers within the window.

### 44. companySettingsService cachedSettings module-global is not tenant-keyed and not cleared on sign-out — cross-tenant company-identity bleed (sibling of the round-2 portalUrlService fix, left unfixed)

`src/lib/companySettingsService.ts:199` · tenant-isolation

getOrCreateCompanySettings returns the module-level cachedSettings whenever (now - cacheTimestamp) < 5min (line 198-201) with NO tenant check — unlike the round-2-fixed sibling caches (featureGateService.planCache checks planCache.tenantId===tenantId; portalUrlService checks cachedTenantId). invalidateCompanySettingsCache() is only called after a settings UPDATE, never on sign-out (AuthContext.performSignOut clears only rolePermissionsService + localStorage tenant_id). Login navigates via react-router (Login.tsx:63) with no page reload, so module globals survive a logout. Scenario: on a shared lab workstation, User A (tenant T1) generates an invoice/report PDF (dataFetcher.ts:473 -> getOrCreateCompanySettings), warming the cache with T1's company_settings row (name, address, contact_info, tax registration, portal_settings, label prefs, table_columns, einvoice metadata). User A signs out and User B (tenant T2) signs in on the same tab within 5 minutes; the first PDF/settings read returns T1's cached row (the warm-cache path never re-queries, so RLS provides no protection), printing T1's company name/address/tax number on T2's forensic/legal document.

### 45. Downloadable import error workbook is un-importable for child-only failures: parents that imported successfully are absent, so the in-file FK validator hard-blocks re-import (and the new run's run-scoped entity_map could not resolve them either)

`src/lib/dataMigration/importClient.ts:68` · partial-failure-recovery

A child row fails at the DB while its parents insert — e.g. two Relationships rows for the same customer both with Is Primary=TRUE: the customer, company, and first relationship insert, and the second violates uq_customer_primary_company (v1.2.0) returning status 'error'. runImport builds import-errors.xlsx from failedRows only, so the Relationships sheet has the failed row but the Customers/Companies sheets are empty. The design spec (unified-import-export-engine-design.md:132) advertises this error workbook 'for fix-and-reimport'. The operator fixes the flag and re-uploads it -> ImportWizard.handleFile runs validateWorkbook, whose in-file FK check (importValidator.ts:282-284) raises 'customer_legacy_id \"...\" not found in customers' because idSets['customers'] is empty -> report.ok=false -> the Import button (gated on validation.ok, ImportWizard.tsx:316) never renders. Even if validation were bypassed, the report file's different SHA-256 mints a NEW run (the original was marked completed by finalize) and data_migration__resolve only looks inside that run's entity_map (20260630201824_data_migration_import_rpcs.sql:70-73, WHERE run_id=p_run_id), so every child row fails 'unresolved parent'. The same dead end applies to any child-only DB failure (deviceDiagnostics unique-per-device, leaveBalances unique per employee+type+year, etc.). A working alternative exists — re-importing the corrected FULL original file resolves it because the dedup migration writes skipped_duplicate parents into the new run's entity_map — but the advertised error-workbook re-import loop itself dead-ends.

### 46. getChecklists/getChecklist omit deleted_at filter on both the checklist and the embedded items, so soft-deleted onboarding templates and items reappear in the grid, KPI, assign dropdown, and edit modal

`src/lib/employeeOnboardingService.ts:36` · soft-delete-filter

HR soft-deletes a checklist template (deleteChecklist sets deleted_at, EmployeeOnboardingPage.tsx:419) and the query invalidates. getChecklists re-runs with no .is('deleted_at', null), so the deleted checklist reappears in the Templates grid, stays selectable in AssignChecklistModal (line 56 uses getChecklists), and still counts toward the Templates KPI. Likewise, removing an item in ChecklistFormModal (removeItem -> deleteChecklistItem, line 158) sets deleted_at, but the unfiltered embed onboarding_checklist_items(*) still returns the row, so the item resurfaces in the edit modal (seeded from checklist.onboarding_checklist_items at line 65) and inflates item_count on every card. Note getChecklistItems (line 96) correctly filters deleted_at, so an actually-assigned deleted checklist produces tasks only from live items; and re-saving the edit modal calls updateChecklistItem on the resurfaced item but does not clear deleted_at, so the row stays soft-deleted in the DB. The defect is read-side stale UI, not DB corruption.

### 47. getChecklistItems orders onboarding_checklist_items by non-existent column 'order_index' (actual column is 'sort_order'), so assignChecklistToEmployee always throws before creating any onboarding_tasks

`src/lib/employeeOnboardingService.ts:102` · wrong-column-name

HR opens Employee Onboarding, selects an employee + checklist + start date, and submits AssignChecklistModal (line 73 -> assignChecklistToEmployee, line 179). assignChecklistToEmployee first calls getChecklistItems, whose query appends order=order_index. onboarding_checklist_items has no order_index column (database.types.ts:11541-11553 shows sort_order), so PostgREST returns 400/42703 and the function throws before any onboarding_tasks insert runs. The mutation surfaces a 'Failed to assign checklist' toast; no tasks are ever created, breaking checklist assignment 100% of the time. It fails loudly with no data written or corrupted, and onboarding is a peripheral HR module rather than a core lab workflow — hence medium, not high.

### 48. approveExpense commits status='approved' before posting the GL and input-VAT entries; a mid-sequence failure leaves the expense approved with no ledger/VAT row, and the pending-only guard blocks any re-post via the normal flow

`src/lib/expensesService.ts:417` · financial-atomicity

Approver clicks Approve (ExpensesList.tsx:310 -> approveExpense). The conditional status flip (expensesService.ts:398-408, guarded by .eq('status','pending')) auto-commits, then createFinancialTransaction (line 417) fails (expired JWT/PGRST301, transient network, or RLS) and throws (financialService.ts:56-58). The expense is now durably 'approved' with NO financial_transactions row and, for taxed expenses, no vat_records 'purchase' row (the same window exists between the GL post and createExpenseVATRecord at 435). Re-clicking Approve throws 'Only a pending expense can be approved' (line 389, re-enforced by the status CAS at 406), and no other code path re-posts the entry — reconcile_expense_ledger (migration 20260622091022) is a read-only diagnostic, not a repair. P&L expense totals and the VAT return omit the amount while the expense shows approved/payable — the exact expenses-vs-ledger divergence the reconciliation report exists to detect. Recovery requires admin intervention: archive_expense voids the orphaned expense (its GL-reversal loop finds no rows to reverse) so it can be re-created and re-approved; the normal approval retry cannot fix it.

### 49. checkUsageLimit's max_cases_per_month and max_expenses_per_month counts omit the deleted_at filter, so soft-deleted cases/expenses still consume the monthly quota and can block creation while the Billing meter shows headroom

`src/lib/featureGateService.ts:222` · usage-limit-math

Tenant on max_cases_per_month=50 creates 50 cases this month, then soft-deletes 10 duplicates (CasesList.tsx:582 / CaseDetail.tsx:861 set deleted_at). BillingPage's meter uses billingService.getCurrentUsage, which filters .is('deleted_at', null), and shows 40/50. But CasesList.handleCreateCase (line 513) and CreateCaseWizard's UsageLimitGuard call featureGateService.checkUsageLimit('max_cases_per_month'), whose count omits the deleted_at filter and returns 50/50 -> allowed:false, so 'New Case' is hard-blocked with 'You've reached your plan's limit' while the billing page tells the tenant they have 10 cases of headroom. Identical omission in the max_expenses_per_month branch (lines 269-273) blocks ExpenseFormModal the same way (expenses are soft-deleted via expensesService.ts:606). Sibling counts in the same function (max_branches, max_customers) DO filter deleted_at, as does the canonical billingService implementation.

### 50. generateInvoiceVsExpenseReport omits the void/cancelled status filter its three sibling reports have, counting voided invoices' stale amount_paid as monthly revenue

`src/lib/financialReportsService.ts:687` · money-aggregation

An invoice with amount_paid > 0 is voided/cancelled (round-2 #50's CONFIRMED premise: amount_paid survives the status change; RECEIVABLE_INVOICE_EXCLUDED_STATUSES exists for exactly this). The invoices query (lines 685-690) selects status but never filters on it, so line 711 adds baseAmount(inv,'amount_paid') for the voided invoice into that month's revenue and the report totals. generateProfitLossReport (line 110), generateRevenueByCustomerReport (line 412) and generateRevenueByCaseReport (line 455) in this same file were all given .not('status','in',RECEIVABLE_INVOICE_EXCLUDED_STATUSES) in commit 037faa7 precisely 'so the surfaces reconcile' — the Invoice-vs-Expense report for the same dateFrom/dateTo now reports higher revenue (and wrong monthly net) than the P&L, breaking the reconciliation the fix established.

### 51. markAssignmentAsDefective is a non-atomic two-step (RPC releases the donor to an available status, then a separate client UPDATE sets 'Defective'); any post-RPC failure leaves a dead donor released and reassignable, and the condition_id 'Damaged' change the modal promises is never written at all

`src/lib/inventoryCaseAssignmentService.ts:451` · non-atomic-write

Technician marks donor X defective. unassign_inventory_from_case commits (assignment returned, item released to an available status, return custody event written). The follow-up fails: network drop, statusLookupError (throws), statusError on the UPDATE (throws), or no master_inventory_status_types row matches ilike '%defective%' (that branch only logger.warns and leaves the item released). The function throws/returns with X at an available status and no active assignment, so checkItemAvailability reports it available:true and the physically dead donor is immediately reassignable to another recovery case — the round-1 #15 outcome, re-opened as a partial-failure window inside #15's fix. A retry from the modal re-calls the RPC on an already-returned assignment instead of just re-applying the status. Independently and on every call (no failure needed), MarkDefectiveModal promises 'Update the condition to Damaged' and 'Both the status and condition will be automatically updated', but markAssignmentAsDefective never touches condition_id, so the condition badge stays e.g. 'Good' on a failed donor.

### 52. updateInvoice replaces line items via an unchecked soft-delete + separate insert with no transaction; a mid-sequence insert failure strands the draft invoice with zero active line items and stale non-zero header totals (recoverable on re-edit)

`src/lib/invoiceService.ts:742` · financial-atomicity

Full-editing a draft invoice's items runs the `if (items)` branch (InvoicesListPage.tsx:413 / InvoiceDetailPage.tsx / CaseDetail all pass items). Line 742 soft-deletes ALL invoice_line_items for the invoice in its own committed request; resolveTenantId (744) and the re-insert (776-781) run as separate requests, followed by the header update (803). If the insert fails for any reason (DB constraint/RLS denial, expired JWT, transient network), line 781 throws before the header update, so the invoice is left with NO active line items while invoices.subtotal/total_amount retain their pre-edit values and document_tax_lines is desynced (persistDocumentTaxLines at 787 never runs); the PDF then prints a non-zero Subtotal over an empty items table. Separately, the soft-delete's result is discarded (no error check; postgrest-js returns DB errors rather than throwing), so a returned DB-level error on line 742 leaves the insert to proceed anyway — old + new rows both active, line items print doubled while the header reflects only the new set. Note a network failure on line 742 rejects the promise and aborts before the insert, so that path is safe. The corrupted state is recoverable: a subsequent successful edit re-runs the idempotent delete + insert + header update and restores consistency, so this is an edge-case (transient-failure-triggered) financial data error rather than deterministic happy-path corruption — hence medium, not high.

### 53. convertQuoteToInvoice is not idempotent: it never checks quote.status before createInvoice, so a concurrent/stale-cache re-convert silently creates a duplicate case-linked invoice with a success toast

`src/lib/invoiceService.ts:976` · race-condition

Accepted quote QT-0042 is open in two tabs (or by two staff). QuoteDetailPage gates the Convert button only on its cached quote.status==='accepted' (canConvert, line 231), which is stale in the second tab. Both clicks call convertQuoteToInvoice, which validates only quoteError/existence/case_id and then unconditionally runs createInvoice (line 976) — no quote.status guard. The follow-up quote update carries .neq('status','converted') (line 984); on the second call it matches 0 rows and returns no error, so updateError is falsy and the duplicate path returns the new invoice with a success toast. Result: two draft invoices linked to the same approved quote (each spawning its own custody DOCUMENT event), enabling double-billing once both are issued. Drafts are recoverable before issue, hence medium rather than high. No DB uniqueness on converted_from_quote_id backstops this.

### 54. bulkSendInvoiceEmails writes back a stale pre-loop status snapshot (mid-batch payment reverted) and advances draft tax invoices to 'sent' client-side, bypassing issue_tax_document and permanently blocking issuance

`src/lib/invoiceService.ts:1280` · race-condition

Prong A (race): An accountant bulk-emails 30 invoices. Statuses are fetched once (invoiceService.ts:1213-1219); the sequential loop then generates a heavy PDF per row (45s timeout each), so the batch spans minutes. Note the 5/min email limiter does not pace the loop — sendDocumentEmail fails fast, so rate-limited rows write nothing; sends succeed sporadically as the sliding window permits while PDFs consume time. A colleague records full payment on a later invoice (status→'paid', balance_due 0) while earlier PDFs generate; when that row's send succeeds, line 1280 writes status: inv.status — the stale pre-loop value (e.g. 'sent') — reverting 'paid' to 'sent' with balance_due 0. No DB trigger re-derives status, so the revert sticks: exactly the state round-2 #54 was meant to close (omitting the status column for non-draft rows would fix it). Prong B (deterministic): the bulk fetch has no invoice_type/status filter and the caller sends all selected ids, so selecting an unissued DRAFT TAX invoice (invoice_number NULL — minted only by issueInvoice→issue_tax_document, which also posts vat_records) flips it to 'sent' via direct client update: no minted number, no VAT posting, no custody event. Because 'sent' counts as issued, canRecordPayment turns true (payments recordable against an unnumbered invoice) while issueInvoice thereafter refuses ('Only draft invoices can be issued'), so the number/VAT posting can never be minted through the normal flow — contradicting the machine-owned-status rule the same commit installed in updateInvoice (632-642) for precisely this reason.

### 55. updateKBArticle silently fails to re-add a previously removed tag: the re-add insert collides with the soft-deleted row under the full UNIQUE(article_id, tag_id) constraint and the swallowed error makes the save falsely report success

`src/lib/kbService.ts:328` · data-loss

Round-2 fix #55 replaced the soft-delete-all-then-reinsert tag path with an active-set diff, but kb_article_tags still has a full (non-partial) UNIQUE(article_id, tag_id) constraint (baseline_schema.sql:3893, never dropped). Because removal (line 323) only sets deleted_at and keeps the row, the (article_id, tag_id) pair remains occupied. Re-adding a tag whose pair exists as a soft-deleted row therefore raises 23505, and the insert (lines 328-330) has no { error } check (postgrest-js does not throw), so the failure is silent: the save reports success but the tag never re-attaches and disappears on reload. Additionally, every article edited under the pre-fix code accumulated soft-deleted rows for all its historical tags, so those tags can never be re-added through the UI. Fix: un-soft-delete (set deleted_at=null) matching rows instead of inserting, or use upsert with onConflict, and check the insert error.

### 56. toQuoteData/toInvoiceData omit the persisted client_reference column, so the customer PO 'Reference:' row silently drops from generated quote/invoice PDFs while the on-screen preview still shows it (print/preview parity break)

`src/lib/pdf/dataFetcher.ts:529` · data-mapping

quotes.client_reference and invoices.client_reference are real persisted columns entered in the form modals (invoiceService.ts:173, quotesService.ts:152; InvoiceFormModal auto-fills it from the case at line 340). Both engine adapters render it when present — quoteAdapter.ts:118 and invoiceAdapter.ts:119 push a 'Reference:' party row — but the field-by-field mappers toQuoteData (lines 529-565) and toInvoiceData (lines 686-724) never map it, and because QuoteData.client_reference/InvoiceData.client_reference are optional the `satisfies` check passes silently. A lab records the customer's PO number as the reference on an invoice: the on-screen preview (getInvoiceById/getQuoteById spread `...data`) shows 'Reference: PO-4711', but the downloaded/emailed PDF (fetchInvoiceData/fetchQuoteData path) omits it — silent data loss on the customer-facing document and a preview/print parity break.

### 57. Forensic report custody timeline renders event times in the printer's browser timezone with no zone label — the surface PR #408's tenant-timezone custody fix missed (both engine and legacy report builders)

`src/lib/pdf/engine/adapters/reportAdapter.ts:496` · timezone-forensic-export

PR #408 (commit 8d42659) fixed custody event times to tenant timezone + explicit zone label in BOTH chain-of-custody PDF builders, but the forensic REPORT's custody timeline renders the same chain_of_custody rows (fetched in documentInstanceData.fetch.ts:167-178) through formatDate() from pdf/utils, which is date-fns format() in the runtime's LOCAL timezone with no zone label. Tenant in Asia/Dubai, custody event created_at = 2026-07-10T22:00:00Z: the certified Chain-of-Custody PDF prints 'Jul 11, 2026, 02:00 GMT+4', but a manager generating the forensic report from a laptop set to America/Los_Angeles gets '10 Jul 2026, 15:00' for the SAME event — a different calendar day, unlabeled, so the two legal documents for one case contradict each other. Both render paths are affected: the engine adapter (reportAdapter.ts:496) and the legacy builder (src/lib/pdf/documents/ReportDocument.ts:458 uses the identical formatDate(event.event_timestamp || event.event_date, 'dd MMM yyyy, HH:mm') call). Neither prior audit round catalogued this (Round 2 #46 covered only the id tiebreaker and #63 only the dropped prose on this same buildCustodyLog).

### 58. profileResolver compliance-render cache is module-global (not tenant-keyed) and never cleared on sign-out — a second tenant signing into the same SPA tab within 60s gets the prior tenant's seller tax-registration number/compliance profile rendered onto its legal PDFs

`src/lib/pdf/engine/profileResolver.ts:67` · tenant-isolation

resolveComplianceRenderInputs (profileResolver.ts:67) returns a module-level cache while Date.now()-cache.at < 60_000, with no tenant key. clearComplianceRenderCache() (line 26) is only called from tests/mocks — no production caller exists, despite the line-24 comment claiming it is cleared on tenant switch. The cached value carries the primary legal entity's country facts, resolved DocumentComplianceProfile, sellerRegistered flag, and sellerTaxNumber (lines 114-119). The app is an SPA: the happy-path sign-out does NOT hard-reload — window.location.replace('/login') in AuthContext.performSignOut (lines 121,126) is only in the error branches; a successful supabase.auth.signOut() runs the SIGNED_OUT handler (AuthContext.tsx:269-298), which clears rolePermissionsService.clearCache() and localStorage tenant_id but leaves the profileResolver cache intact, then redirects via React Router with module state preserved. The cache is warmed by the useDocumentCompliance preview hook and by pdfService.ts:100/120 during PDF generation. On a shared workstation, User A (tenant T1) previewing/generating a document warms this cache; User B (tenant T2) signing in on the same tab and previewing/generating a document within the 60s TTL gets T1's statutory seller tax-registration number and compliance profile rendered onto T2's invoice/credit-note — a wrong tax-registration number on a legal document. Render-time only (not persisted), and the 60s window plus cross-tenant-same-device requirement keeps it an edge case.

### 59. Platform-admin Tenants list and totalTenants KPI include soft-deleted (rolled-back) tenants — no deleted_at filter

`src/lib/platformAdminService.ts:153` · soft-delete

When provision-tenant fails after the tenant row is created, rollbackProvision (index.ts:116, plus 358/379/397) soft-deletes the tenant by setting deleted_at, leaving a dead row. getTenantsList (platformAdminService.ts:152-159) selects from tenants with no .is('deleted_at', null) filter, so the carcass appears in the platform-admin Tenants list (TenantsListPage.tsx:33) where an operator can open/suspend/impersonate it; getDashboardStats' tenants count (line 50, count:exact/head:true) is likewise unfiltered, inflating the PlatformDashboard totalTenants KPI by every failed-provision rollback. Confirmed the only tenants.deleted_at writers are the provision-tenant rollback sites, tenants.deleted_at exists in the Row type, and platform admins bypass tenant-isolation RLS.

### 60. Platform-admin tenant suspension is a no-op: suspendTenant only flips tenants.status, which no RLS/auth/gating path reads, so suspended tenants retain full access despite the UI promising immediate revocation

`src/lib/platformAdminService.ts:357` · tenant-suspension-enforcement

A platform admin suspends an abusive/non-paying tenant from TenantDetailPage; the ConfirmDialog and success toast state access is immediately revoked. But suspendTenant only writes tenants.status='suspended'. Tenant access is resolved by get_current_tenant_id(), which keys off profiles.is_active (migration 20260620020115), never tenants.status; no RLS policy, RPC, trigger, or edge function reads tenants.status, and there is no cascade flipping the tenant's profiles to is_active=false. Every user of the suspended tenant keeps logging in and creating cases, invoices, etc. indefinitely. Severity is medium rather than high: this is a low-frequency platform-admin governance control (not a core lab flow, not money/data corruption, not a tenant-isolation breach) with workarounds (deactivate individual users, soft-delete the tenant), but the stale UI misleads the admin into believing access was cut off. Same gap applies to tenantService.suspendTenant (tenantService.ts:147).

### 61. suspendTenant/reactivateTenant swallow the Supabase result, so a failed suspend/reactivate still fires onSuccess and toasts success while the tenant's access is unchanged

`src/lib/platformAdminService.ts:357` · swallowed-error

A platform admin suspends a tenant from TenantsListPage or TenantDetailPage. The UPDATE fails at the DB/PostgREST layer (expired session -> PGRST301, trigger/constraint error) or matches zero rows. Because suspendTenant awaits the builder without destructuring/checking error, postgrest-js resolves rather than throwing, the Promise<void> resolves, and suspendMutation.onSuccess fires: toast 'Tenant suspended successfully' plus list invalidation. The onError branch is unreachable for DB-level failures. The tenant remains 'active' with full platform access while the admin is told the suspension succeeded. Same defect on reactivateTenant. (Mitigation limiting severity: the query is invalidated and re-fetched from the DB, so the tenant's status badge in the list/detail will show its true unchanged value; the misleading part is the success toast on the control-plane action.)

### 62. getQuotesByCaseId omits the deleted_at soft-delete filter, so trashed quotes reappear on the Case Detail Quotes tab (the invoices sibling was fixed in round 1)

`src/lib/quotesService.ts:901` · soft-delete-filter

Staff soft-deletes a quote (deleteQuote sets quotes.deleted_at, quotesService.ts:717) from the /quotes list. Opening the linked case, useCaseQueries ['quotes','case',id] calls getQuotesByCaseId, whose query has no .is('deleted_at', null) — unlike the invoices sibling getInvoicesByCaseId which gained that exact filter in the round-1 fix (invoiceService.ts:1001). The deleted quote renders in CaseFinancesTab's quote list with a working Edit button, is counted in the Quotes CountPill, and is offered in InvoiceFormModal's 'from quote' picker (CaseDetail.tsx:927 maps the same array) — so staff can link a new invoice to a quote that was deleted.

### 63. getStockStats 'Today's Sales/Revenue' uses a bare UTC date string against timestamptz sale_date, misbucketing sales made between local midnight and the UTC offset

`src/lib/stockService.ts:774` · timezone-off-by-one

On StockSalesPage the 'Today's Sales' (salesToday) and 'Today's Revenue' (revenueToday) KPIs are computed with a bare UTC calendar date used as a .gte bound against the timestamptz sale_date column (getStockStats, stockService.ts:774), and the page-level fallback (StockSalesPage.tsx:82 via getTodayIso at :26) does the same. Because the comparison is anchored to UTC midnight, a lab in any non-UTC timezone gets a wrong 'today' bucket for part of every day. Concretely for Dubai (UTC+4): from local midnight until 04:00 the bound is still yesterday's UTC date, so the KPI includes ALL of the previous local day's sales; once UTC rolls over, the bound becomes today's date interpreted as 00:00:00+00 = 04:00 local, so every sale rung between local midnight and 04:00 disappears from 'Today' for the rest of the day. The figures self-correct at UTC midnight and no wrong data is persisted — this is a display-only KPI defect. Fix: build the bound at local start-of-day (new Date(); d.setHours(0,0,0,0); d.toISOString()), matching the fix applied to the round-2 Dashboard sibling.

### 64. Stock Sales Report / Top-Selling Items / sales list end-date filter compares date-only strings against timestamptz sale_date, silently excluding every sale made after midnight on the end day (three call sites: stockService.ts lines 496, 831, 865)

`src/lib/stockService.ts:831` · date-boundary

sale_date is timestamptz DEFAULT now() and record_stock_sale never overrides it, so every sale has a time-of-day. getSalesReport (line 831), getTopSellingItems (line 865) and getStockSales (line 496) all filter with .lte against date-only 'YYYY-MM-DD' strings, which Postgres casts to midnight — so a sale at 09:00 on the end day is excluded. StockReportsPage defaults endDate to today (line 113), so the default Sales Report and Top Selling Items KPIs always undercount by omitting the current day; a 'to' date picked in StockSalesPage's date input excludes that entire day. Recoverable (widen the range) but leads to wrong at-a-glance revenue/top-seller figures. Same defect class as round-2 #89 but at distinct, unfixed call sites.

### 65. tenantToday.timezoneCache module-global is not tenant-keyed and never cleared (no TTL, no sign-out hook) — cross-tenant timezone bleed into document/tax dates

`src/lib/tenantToday.ts:45` · tenant-isolation

getTenantTimezone caches the tenant's IANA timezone in a module-level timezoneCache with no TTL and no tenant key (line 41-51); clearTenantTodayCache() is called only from tests, never on sign-out. Consumers stamp DOCUMENT DATES via currentTenantToday(): invoiceService (invoice_date, line 947), expensesService (expense_date + VAT tax_period, lines 279/418/756), leaveService (reviewed_date), payrollService, performanceService. Because login does not reload the page, after a same-tab logout->login as a different tenant the cache still holds the previous tenant's timezone permanently. Scenario: User A on tenant T1 (Asia/Muscat, UTC+4) warms timezoneCache; User B signs in on tenant T2 (America/New_York, UTC-5) on the same tab and creates an invoice near local midnight — currentTenantToday() computes the date in T1's UTC+4 zone, stamping invoice_date and the VAT tax_period (YYYY-MM) a day/period off from T2's actual local date, corrupting the tax point and VAT-period bucketing for T2.

### 66. approveTimesheet/rejectTimesheet write the reviewer's notes into the shared timesheets.notes column, nulling or overwriting the employee's own note (no separate review-notes column)

`src/lib/timesheetService.ts:152` · data-loss

Employee creates a timesheet entry with notes 'Overtime due to 12-drive RAID rebuild' (TimesheetEntryModal saves it to the notes column, TimesheetManagement.tsx:113) and submits it. A manager clicks Approve and leaves the optional Notes box blank: ApproveRejectModal passes `notes || undefined` (TimesheetManagement.tsx:264), and approveTimesheet writes `notes: notes ?? null` — the employee's note is destroyed (set to NULL). If the manager does type an approval note, it silently replaces the employee's note instead. rejectTimesheet (line 170) does the same, so the rejection reason clobbers the employee's original notes, and when the employee re-edits the rejected entry the form is pre-filled with the reviewer's text as if it were their own. There is no separate review-notes column on timesheets (database.types.ts:17535-17557), so this is unrecoverable data loss on every approve/reject. Contrast leaveService, which correctly writes reviewer text to a dedicated review_notes column.

### 67. Three direct log_audit_trail RPC sites (userManagementService.ts:88, rolePermissionsService.ts:234, UserManagement.tsx:149) discard { error }, so failed audit writes for role/permission/user-status changes resolve as success — uncatalogued siblings of the round-2-fixed auditTrailService helper

`src/lib/userManagementService.ts:88` · audit-integrity

updateUser (role changes) awaits supabase.rpc('log_audit_trail', ...) at line 88 without destructuring the result. A Postgres-level failure (RLS WITH CHECK denial, NOT NULL violation on audit_trails.tenant_id, or function exception — e.g. a platform admin whose get_current_tenant_id() is NULL) resolves with { data: null, error } instead of throwing, so the outer try/catch never fires and updateUser returns { success: true } with no audit_trails row for the privilege-escalation event. The same applies to rolePermissionsService.updateRolePermissions:234 (permission-matrix changes) and UserManagement.handleToggleUserStatus:149 (user deactivation). Round-2 finding #10 (CONFIRMED) documented this supabase-js semantics for the shared logAuditTrail helper and PR #421 fixed only src/lib/auditTrailService.ts; these three sites bypass that helper and still discard the result, leaving security-sensitive mutations unauditable on silent DB-level failure. Loss is conditional on the audit RPC failing, not a common-path loss — hence medium, not high.

### 68. handleCountryChange never clears subdivisionId (nor taxNumber/legalEntityType), so a stale subdivision from a previously-selected country is submitted to provision-tenant and hard-fails signup with a 422 + full tenant/auth rollback, stuck across retries via sessionStorage

`src/pages/auth/onboarding/steps/LocationStep.tsx:69` · data-carryover

On the Location step a user selects India (tax_system GST, has geo_subdivisions), the jurisdiction block renders and they pick a State (JurisdictionStep.tsx:82 -> updateField('subdivisionId', <india-state-uuid>)), then change the country dropdown to a NONE-tax country. handleCountryChange (LocationStep.tsx:69) updates countryId/baseCurrencyCode/uiLanguage/fiscalYearStart/timezone but never resets subdivisionId/taxNumber/legalEntityType. shouldShowJurisdictionStep returns false for the NONE-tax country, so showJurisdiction=false, jurisdictionComplete=!showJurisdiction=true, and Continue (LocationStep.tsx:249) is enabled while formData.subdivisionId still holds the India state UUID; no State picker is rendered for the new country, so the stale value cannot be cleared through the UI. On submit, useOnboardingFlow.ts:203 forwards subdivisionId whenever truthy and tenantService.ts:100 includes subdivision_id. provision-tenant creates the tenant + auth user, then index.ts:524-531 queries geo_subdivisions WHERE id=<india-state> AND country_id=<new-country> -> no row -> subdivisionBelongsToCountry=false -> provisionGuards.ts:161 throws ProvisionGuardError(422, 'The selected state/subdivision does not belong to the chosen country.'), and index.ts:556 rollbackProvision soft-deletes the tenant and deletes the just-created auth user. formData (with the stale subdivisionId) is persisted in sessionStorage (useOnboardingFlow.ts:59), so a reload/retry restores it and keeps failing until the user re-selects a subdivision-bearing country or clears sessionStorage.

### 69. Companies page shares queryKey ['companies'] with the 3-column company-picker projection cached by CustomersListPage/CustomerFormModal; within its 30s staleTime CompaniesListPage renders the truncated projection (every company badged Inactive, Active KPI = 0, Active filter empties, invalid Created At) with no self-healing refetch

`src/pages/companies/CompaniesListPage.tsx:105` · query-key-collision

User opens /customers (CustomersListPage.tsx:224 caches select('id, company_number, company_name') under ['companies']; same in CustomerFormModal.tsx:143), then clicks Companies in the nav within 30 seconds. CompaniesListPage's useQuery (staleTime: 30000, line 146) finds the cache entry fresh and does NOT refetch, so `companies` is the projection: is_active undefined -> every row badged 'Inactive', 'Active' KPI = 0, clicking the 'Active' quick-filter shows an empty list; created_at undefined -> 'Recent (30d)' = 0 and Created At renders an invalid date; master_industries/geo_*/primary_contact undefined -> '-' in those columns. No error is thrown and nothing refetches until a window refocus or invalidation. This is the exact class of round-2 finding #115 (['company_settings'] collision), which was fixed by scoping that key — the ['companies'] collision in the same files was left behind.

### 70. Companies list fetches all companies with no .range()/.limit(), so PostgREST's db-max-rows cap (default 1000) silently hides companies beyond the first 1000 — with the documented 1,110 live companies, the 110 oldest are invisible on the page, in search, and in the KPIs

`src/pages/companies/CompaniesListPage.tsx:108` · query-truncation

The tenant documented in-repo at src/lib/pickerSearch.ts:5 and src/components/cases/ChangeCompanyModal.tsx:36 has 1,110 companies. The unranged select (ordered created_at DESC) returns only the newest 1000; search/industry/status filtering happens client-side over those fetched rows (line 327), so the 110 oldest companies can never be found or opened from the Companies page, 'Total Companies' reads 1000, and Active/Recent KPIs are computed over the truncated set — all silently. Round 2 (#? PO/Supplier stats, verifier notes) already established this exact truncation mechanism as a correctness bug and fixed sibling surfaces; this page was left on the vulnerable fetch-all pattern.

### 71. Add-Company 'Primary Contact' picker query (CompaniesListPage.tsx:169) filters only is_active with no deleted_at check and no .range(): bulk-archived customers (archive sets deleted_at only, is_active stays true) remain selectable and get written as is_primary=true relationships, while the ~1000-row PostgREST cap hides most of the tenant's 3,367 customers — the round-2 useCustomerPickerRows remediation was not applied here

`src/pages/companies/CompaniesListPage.tsx:169` · soft-delete-filter

(a) Admin bulk-archives customer X (CustomersListPage handleBulkArchive:458-461 sets only deleted_at; is_active stays true). Opening Add Company, X still appears in the Primary Contact SearchableSelect; selecting X and saving makes createCompany (companyService.ts:92) insert a customer_company_relationships row with is_primary=true pointing at the soft-deleted customer, which then renders as the company's primary contact. (b) Independently, the query at line 166-170 has no .range(), so PostgREST caps it at ~1000 rows ordered by customer_name; on this tenant (3,367 customers, per pickerSearch.ts:5) roughly 2,367 customers sorting after the first 1000 alphabetically can never be chosen as primary contact, inviting duplicate customer creation. The migrated hook useCustomerPickerRows (pickerSearch.ts:48-76) applies .is('deleted_at', null) plus server-side search paging and would fix both, but this picker still uses the raw fetch-all query.

### 72. Dashboard 'Active Cases' StatCard counts no_solution cases as active — terminalTypes at Dashboard.tsx:49 omits 'no_solution', diverging from canonical TERMINAL_TYPES and the /cases command-center Active KPI

`src/pages/dashboard/Dashboard.tsx:49` · kpi-derivation

A tenant marks 30 cases 'No Solution — Future Follow-up' (device returned, review parked +6mo per v1.4.0). The main Dashboard's 'Active Cases' StatCard (Dashboard.tsx:131) reads caseStats.active, which counts .in('status', activeStatusNames) where activeStatusNames excludes only delivered/closed/cancelled (line 49-52) — so it includes all 30 no_solution cases, showing Active = N+30. Clicking the card navigates to /cases, whose CasesCommandCenter 'Active' KPI (line 198-199) reads stats.active from bucketizeStatusCounts, which subtracts no_solution (caseLifecycle.ts:147), showing Active = N. Two headline 'Active' figures disagree by every no_solution case, and the gap grows as more cases are parked. Recoverable, no data corruption, but misleads operational reads.

### 73. Dashboard 'Customers' KPI counts archived (soft-deleted) customers — query filters is_active but not deleted_at

`src/pages/dashboard/Dashboard.tsx:86` · soft-delete-filter

Bulk-archiving customers (CustomersListPage.tsx:458-461) sets only deleted_at, leaving is_active=true. The dashboard 'Customers' KPI query (Dashboard.tsx:83-86) filters .eq('is_active', true) but omits .is('deleted_at', null), so archived customers remain counted. The Customers page 'Total Customers' KPI (customerService.ts:88) does filter deleted_at IS NULL, so after archiving N customers the dashboard StatCard is permanently inflated by N relative to the list users see when they click through. Stale headline metric that contradicts the drill-down view.

### 74. Receipt mutation invalidates the dead key ['invoices_by_case'] and never invalidates ['open_invoices_by_case']/['invoice_for_payment'], so the allocation surface shows stale outstanding balances (60s) and can spuriously reject a legitimate follow-up payment

`src/pages/financial/BankingPage.tsx:145` · stale-cache

Record a 400 partial receipt on INV-100 (balance 1000) from Banking -> Record Receipt; the mutation invalidates the dead ['invoices_by_case'] key but never ['open_invoices_by_case', caseId]. Reopen the modal for the same case within 60s (global staleTime 60000, refetchOnMount default): the open-invoice list still shows INV-100 'Outstanding 1000' when the real balance is 600. Every figure on the meter (outstanding, still-outstanding-after) is wrong. If the operator trusts the displayed 1000 and records it (clicks 'Full 1000' / enters received 1000, allocating 1000), the client over-allocation guard at RecordReceiptModal.tsx:308-313 compares against the STALE balance_due (1000) and passes, but create_receipt_with_allocations rejects it against the real 600 balance, erroring out a legitimate payment. The same holds on InvoiceDetailPage singleInvoiceMode: handlePaymentRecorded never invalidates ['invoice_for_payment', id], so the modal reseeds amount from the stale outstanding (line 214) and submit fails at the RPC. The condition self-heals only after 60s or a window refocus.

### 75. Payments 'Today' filter serializes local midnight with toISOString(), showing two days of payments for UTC+ browsers

`src/pages/financial/PaymentsList.tsx:154` · timezone-off-by-one

On a UTC+ browser (e.g. Asia/Dubai, UTC+4), selecting the Payments list 'Today' filter computes startDate = new Date(now.setHours(0,0,0,0)) (local midnight, line 139) then filters .gte('payment_date', startDate.toISOString().split('T')[0]) (line 154). The split('T')[0] truncation converts local midnight Jul 16 (= Jul 15 20:00 UTC) into the date string '2026-07-15'. Because payment_date is timestamptz, the DB compares against '2026-07-15 00:00:00+00', ~20 hours before the intended Jul 16 00:00 Dubai boundary. Every payment recorded yesterday (Jul 15) therefore appears in the 'Today' list alongside today's, so an accountant reconciling today's takings sees two calendar days of payments all day. Fix: pass startDate.toISOString() (full local-midnight instant) instead of .split('T')[0], as round 2 prescribed for the Dashboard 'today' count.

### 76. Reports Dashboard's three raw invoice queries (headline KPIs, Invoices-by-Status, Top Customers) omit the deleted_at filter and void/cancelled exclusion, disagreeing with the page's own drill-down reports

`src/pages/financial/ReportsDashboard.tsx:235` · soft-delete-filter

A tenant soft-deletes a draft/proforma invoice (deleteInvoice sets deleted_at; only issued tax invoices are immutable), or has a void/cancelled invoice whose stale amount_paid survives the status change. The three raw invoice queries in ReportsDashboard.tsx — financial_report (233-238), invoices_by_status (271-275) and top_customers (321-325) — apply only the invoice_date range with no .is('deleted_at', null) and no exclusion of void/cancelled. Result: invoiceCount and the Invoices-by-Status panel count/sum total_amount over soft-deleted invoices, and totalRevenue/topCustomers add void/cancelled invoices' stale amount_paid. The P&L report opened from this same page (generateProfitLossReport, financialReportsService.ts:110-111) excludes both deleted and void/cancelled rows, so the headline Total Revenue and the P&L modal's Total Revenue disagree for the identical period.

### 77. ReportsDashboard headline reportData query never checks invoicesResult.error/expensesResult.error — a failed invoices or expenses fetch silently renders Total Revenue/Expenses as 0 (false net loss) with no error state

`src/pages/financial/ReportsDashboard.tsx:248` · swallowed-error

A transient RLS/network error fails the invoices half of the Promise.all (lines 233-246). Neither invoicesResult.error nor expensesResult.error is inspected; lines 248-249 coerce data:null to [], so the query 'succeeds' and the dashboard KPI cards render Total Revenue=0 alongside real expenses — a large false net loss (or all-zero KPIs if both fail) with no error indication, potentially driving a wrong financial read until the user refreshes. Every sibling query on this page guards and throws (277, 305, 327). Round-2 #49 fixed the same swallow but only in financialReportsService.ts:124; this page-level aggregation copy was left unchecked. Recoverable (transient, resolves on retry), so medium rather than high, matching the round-2 sibling's medium rating.

### 78. getDateRange builds date bounds via local-midnight Date -> toISOString(), shifting every period boundary one day early for UTC+ tenants ('Today' includes all of yesterday)

`src/pages/financial/RevenueDashboard.tsx:72` · date-timezone

A Dubai (UTC+4, the platform's documented primary GCC market) user clicks the 'Today' filter on 2026-07-16. Line 57 constructs local midnight (new Date(y,m,d) = 2026-07-16T00:00+04:00 = 2026-07-15T20:00Z) and line 72's toISOString().split('T')[0] yields '2026-07-15', so .gte('invoice_date','2026-07-15') includes every invoice dated yesterday in the 'Today' revenue KPI and table. The month/year presets shift the same way, and the derived prev-period comparison window (lines 118-125) shifts with them, skewing Growth Rate. This is the exact pattern round 1 confirmed and fixed in getFinancialYearDates (financialService.ts:234-237 now carries a comment banning it: 'Constructing new Date(y, m, d) at the BROWSER's local midnight and then calling toISOString() shifts every boundary a day back for UTC+ tenants'); this sibling was never migrated.

### 79. RevenueDashboard header KPIs and Invoices table omit deleted_at and void/cancelled filters, diverging from the by-customer/by-case tabs on the same page

`src/pages/financial/RevenueDashboard.tsx:83` · money-math

On /financial/revenue the main revenue query (RevenueDashboard.tsx:82-96) and prev-period query (121-125) apply no .is('deleted_at', null) and no void/cancelled exclusion, while the By-Customer and By-Case tabs on the same page (financialReportsService.ts:412-413, 454-455) apply both per EXP-014 doctrine. Result: (a) a tax invoice paid $500 then voided still contributes $500 to Total Revenue / This Month / Growth (status 'void' drops it from the 'Paid Invoices' count but not from the amount_paid sum) — reachable via the data-import subsystem or the exported updateInvoiceStatus, the same narrow channel round-2 #50 documented, not a common in-app button; and (b) soft-deleted draft/proforma invoices (deleteInvoice, invoiceService.ts:818) render as live, clickable rows in the Invoices table and inflate the 'Revenue Streams' count, an always-on but near-zero-money stale-UI defect (issued tax invoices carrying amount_paid>0 are DB-immutable so the soft-delete money path is largely blocked). Either way the header StatCards no longer reconcile with the per-customer/per-case breakdowns below them. Fix: add .is('deleted_at', null) and .not('status','in', RECEIVABLE_INVOICE_EXCLUDED_STATUSES) to both inline queries.

### 80. Storage Locations page fetches active-only (useInventoryLocations filters is_active=true), so deactivating a location makes it vanish from the management UI with no path to view or reactivate it; its active children are silently promoted to root

`src/pages/inventory/InventoryLocationsPage.tsx:135` · broken-state

A manager opens Storage Locations, edits 'Rack A', toggles Active off, and saves. handleSave writes is_active=false and invalidates ['inventory','locations']; useInventoryLocations refetches with .eq('is_active', true).is('deleted_at', null), so Rack A is dropped from the table. Any still-active child locations of Rack A get pushed to root by buildLocationTree (locationTree.ts:31, parent no longer in idSet), misrepresenting the hierarchy. The Status-column 'Inactive' branch (line 84) is unreachable dead code because rows are looked up from the active-only list, and no other surface lists inactive locations — so the Active toggle is effectively one-way and re-enabling/editing a deactivated location requires direct DB access. Data is not lost (soft state, items still reference it), which keeps this recoverable, hence medium.

### 81. PlanDetailsForm swallows invalid Features/Limits JSON on save, persists the stale value, and falsely toasts 'Plan updated successfully'

`src/pages/platform-admin/PlanDetailPage.tsx:174` · swallowed-error-data-loss

A platform admin edits the Features or Limits JSON textarea on a subscription plan and introduces a JSON syntax error (e.g. trailing comma). On Save, mutationFn's JSON.parse throws; the empty catch keeps parsedFeatures/parsedLimits at their stale formData values (seeded from the original plan at mount, never updated by the textarea onChange). updateSubscriptionPlan persists the stale value and onSuccess toasts 'Plan updated successfully'. No error state, field highlight, or error toast is surfaced, so the admin believes the edit is live while the plan retains its old features/limits. Recoverable by re-saving valid JSON, but the false-success signal makes the loss undetectable at save time.

### 82. PortalDashboard 'Active Cases' KPI filters cases.status against pre-v1.3.0 lowercase tokens that no longer exist in the canonical vocabulary, so it always shows 0.

`src/pages/portal/PortalDashboard.tsx:69` · stale-status-vocabulary

v1.3.0 remapped all cases onto the canonical status set whose display names are stored in cases.status ('Registered','Device Received','In Diagnosis','Awaiting Customer Approval','Recovery in Progress','Ready for Delivery','Data Delivered', ...). PortalDashboard's Active/Completed KPI still filters c.status against pre-v1.3.0 lowercase slugs (['received','diagnosis','in-progress','in_progress','waiting-approval'] and ['completed','delivered']), none of which can match a canonical name. A portal customer with 3 visible cases, one in 'Recovery in Progress', sees Total Cases: 3 but Active Cases: 0 and Completed: 0 — both KPI buckets are permanently zero on the customer-facing dashboard.

### 83. PortalPurchasesPage 'Total Spent' sums unpaid (pending/added_to_invoice) stock sales as money spent, and the status Badge passes variant names to the CSS `color` prop (plus tests a nonexistent 'completed' status) so every badge renders default grey.

`src/pages/portal/PortalPurchasesPage.tsx:56` · money-math

record_stock_sale stamps stock_sales.status='pending' when payment_method='added_to_invoice' (unpaid, invoiced) else 'paid' (phase2_record_stock_sale_tax.sql:101-102); vocabulary is pending/paid/partial/refunded/cancelled with no 'completed'. A portal customer with one 500 paid sale and one 300 pending (invoiced, unpaid) sale sees 'Total Spent' = 800 because totalSpent (line 56) reduces baseAmount over all rows with no status filter — the round-2 #76 defect class fixed on PortalPayments but not extended to this sibling. Separately, line 126 renders <Badge color={sale.status==='completed'?'success':sale.status==='pending'?'warning':'default'}>: Badge.tsx defaults variant to 'default', so resolvedVariant is never 'custom' and the code sets backgroundColor:'success'/'warning'/'default' — invalid CSS values the browser ignores — so every badge falls back to grey (bg-slate-100) and paid vs pending are visually indistinguishable. The developer meant `variant=` (with 'paid' not 'completed').

### 84. Both quote edit paths silently discard a currency change made in the edit modal — round-2 #22's currency fix covered only the create branch

`src/pages/quotes/QuoteDetailPage.tsx:149` · data-loss-on-edit

On a multi-currency tenant (currencies.length > 1), a user opens Edit Quote on a draft/sent USD quote and switches the Currency select to EUR. The modal re-renders all totals in EUR and shows the EUR->base preview. On save, both edit paths — QuoteDetailPage.handleEditQuote (lines 149-159) and the QuotesListPage edit branch quoteFields (lines 717-728) — omit `currency` from the updateQuote payload, even though QuoteFormModal's onSave carries it via ...quoteData (line 392-394). In quotesService.updateQuote, currencyChanged (line 588) is therefore false, so docCurrency and exchange_rate stay at the existing USD values and the totals are recomputed in USD. The quote is silently re-saved in the original currency at the old frozen rate, contradicting the EUR totals the user just previewed. The 037faa7 fix (round-2 #22) forwarded quoteData.currency only in the list-page CREATE branch (line 762), leaving both edit paths unpatched.

### 85. Adding recommended backup devices to a quote nulls unit/HSN codes and resets tax_treatment on every existing line (recomputing wrong totals), and inserts the new device line with an empty description (no device name)

`src/pages/quotes/QuoteDetailPage.tsx:644` · data-loss-on-edit

On a draft/sent quote whose lines carry unit_code/unit_label/item_code (HSN/SAC — statutory for in_gst tenants, entered in QuoteFormModal and rendered by quoteAdapter), staff expands Backup Devices and clicks Add. The handler refetches quote_items with select('*') but maps only description/quantity/unit_price into `current`; updateQuote then soft-deletes all items and re-inserts, so every existing line's unit_code/unit_label/item_code becomes NULL and tax_treatment resets to 'standard' (quotesService.ts:657-661 use `item.unit_code ?? null` / `item.tax_treatment ?? 'standard'`). Additionally BackupDeviceRecommendation puts the device identity in `name` ('WD Elements 2TB') and only `description: item.description ?? ''` (stock_items.description is nullable), and updateQuote reads only `description` — so the added line is persisted with an empty or generic description, showing a priced line with no device name on the quote and PDF.

### 86. GeneralSettings init effect has no once-guard: any ['company_settings'] refetch (deterministically the page's own logo/QR upload invalidation) resets formData from the DB row and clears hasUnsavedChanges, silently discarding unsaved field edits

`src/pages/settings/GeneralSettings.tsx:217` · data-loss

Admin edits a field (e.g. Company Name) via updateField -> formData updated, hasUnsavedChanges=true. Admin then uploads a logo (banner states uploads save immediately). handleLogoUpload writes only branding to company_settings and calls invalidateQueries(['company_settings']) (528). The active query refetches and returns the full row: unsaved-and-thus-old company_name + newly-changed branding. The object differs structurally (new uploaded_at/file paths), so TanStack v5 structural sharing produces a new reference; the effect at 194-239 re-fires, calls setFormData(DB row) reverting the typed name, and setHasUnsavedChanges(false). The Save button flips to 'No Changes' and the beforeunload warning is suppressed, so the admin navigates away believing everything saved while the field edit is lost. Same reset also fires on window blur/refocus after 60s (main.tsx staleTime 60000 + refetchOnWindowFocus true).

### 87. Saving General Settings round-trips the mount-time snapshot of the full company_settings row (metadata, portal_settings, portal_maintenance_mode, date_format, accounting_locale — everything but localization), silently reverting any sibling settings surface whose value another writer changed after this tab loaded (lost update)

`src/pages/settings/GeneralSettings.tsx:431` · stale-overwrite

GeneralSettings loads the row via select('*') (136-140) and spreads the raw runtime object into formData (211-217), so formData holds metadata, portal_settings, portal_enabled, portal_maintenance_mode, date_format and accounting_locale as of page load, even though the narrow local TS interface hides them. handleSave strips only `localization` (431-433) and the mutation strips only `id`, then .update() sends the rest (337-341). company_settings.metadata is a single JSON bag written partially by many other surfaces (table columns/rows-per-page/list-selection via tablePrefsService, stat-card style, case-lifecycle mapping, tax registration, label printing). Concrete trigger: Admin A has Settings > General open (staleTime 60s, so a focused session does not refetch); Admin B — or Admin A in another tab, or a sibling settings page — changes rows-per-page / table columns / stat-card style / tax registration, or flips portal maintenance mode. Admin A then edits the company name and clicks Save: the mount-time metadata/portal snapshot overwrites the newer values, reverting e.g. the tenant's table_columns config or flipping portal maintenance mode back. Recoverable by re-saving the affected surface, but silent. The comment at 428-430 shows this clobber class was recognized and fixed for exactly one column (localization) while metadata/portal_settings and the scalar portal/date/accounting columns still round-trip.

### 88. GeneralSettings logo/QR upload handlers swallow {success:false} failures (no else branch, no toast) and their success-path company_settings UPDATE discards its result with no insert fallback, so uploads by a tenant without an existing settings row persist nothing despite the 'saved immediately' banner

`src/pages/settings/GeneralSettings.tsx:523` · swallowed-error

Two reachable failures in GeneralSettings.tsx upload handlers. (1) Silent failure: uploadLogo/uploadQRCode/uploadStamp/uploadSignature return {success:false,error} (not throw) on rate-limit, disallowed MIME, oversize (>10MB), or storage error; both handlers gate on `if (result.success && ...)` with no else and only catch thrown exceptions, so the user gets zero feedback (no toast, no state change) while the on-page banner states uploaded files 'are saved immediately'. (2) No insert fallback: on success the handler runs `.update({branding}).not('id','is',null)` and discards the result. For a brand-new tenant with no company_settings row (a real state — the init effect seeds formData from defaults/tenantFallback when settings is null, and updateMutation carries its own insert fallback for exactly this case), the UPDATE matches 0 rows and returns no error; setFormData makes the logo appear saved but nothing is persisted, invalidateQueries refetches the null row, the branding URL is lost on reload, and the uploaded file is orphaned in storage.

### 89. Record Usage modal placeholder instructs a human case number ('e.g. CASE-0042') but the value is passed unresolved as a uuid p_case_id to record_stock_usage_for_case, so following the instruction always fails with a uuid cast error and usage/custody is never recorded

`src/pages/stock/StockItemDetail.tsx:867` · broken-flow

The Record Usage form's Case ID is a required free-text Input whose placeholder ('e.g. CASE-0042') tells the user to type the human case number. handleUsage forwards usageForm.case_id.trim() to recordStockUsage -> rpc('record_stock_usage_for_case', { p_case_id }) whose DB parameter is uuid (cases.id is uuid; the RPC writes reference_id and logs chain-of-custody with a uuid case id). No case-number->uuid lookup exists in the path. Typing 'CASE-0042' as instructed makes PostgREST fail 'invalid input syntax for type uuid'; the mutation aborts (onError toast) and the usage — plus its custody/case-history logging — is never written. The only working input is a raw case UUID, which no lab user has and there is no case picker to obtain. StockSaleModal.tsx:630-635 has the analogous defect: linkedCaseId flows via the p_sale JSONB into record_stock_sale where the uuid cast fails on a typed case number, aborting the sale (its placeholder 'Link to a case...' is milder).

### 90. Stock list 'Record usage' row action mounts StockTransactionModal without a caseId and has no case field, so every usage submission is rejected

`src/pages/stock/StockListPage.tsx:613` · broken-flow

On the Stock list page, any staff user clicks the per-row 'Record usage' button (StockItemsTable.tsx:287). handleRecordUsage (StockListPage.tsx:164) opens StockTransactionModal in 'usage' mode, but the modal is mounted (613-622) without the optional caseId prop and the usage form exposes only quantity/notes, so caseId is always undefined. On Confirm Usage, handleSubmit's guard (StockTransactionModal.tsx:99-103) shows 'A case ID is required to record stock usage' and returns before recordStockUsage runs. The flow can never succeed from this page and the entered quantity/notes are discarded. Recording usage still works from the case Backup Devices tab, which passes caseId, so the impact is a wholly non-functional button on a secondary surface rather than a blocked core flow.

### 91. Cancelling a stock sale restocks quantities via cancel_stock_sale but onSuccess omits stockKeys.items()/item(itemId)/transactions(itemId), so the stock list/item-detail quantities and transaction ledger stay pre-cancel within their staleness window (stats IS invalidated)

`src/pages/stock/StockSaleDetailPage.tsx:60` · cache-invalidation

cancelStockSale routes through the atomic cancel_stock_sale RPC which 'restocks each live sale line into the writable quantity_on_hand with a returned transaction' (stockService.ts:607-617). cancelMutation.onSuccess (lines 60-62) invalidates only stockKeys.sale(id), stockKeys.sales(), stockKeys.stats(). Item X shows qty 2 on the Stock list (['stock','list',...] staleTime 30000, StockListPage) after a 3-unit sale; cancelling that sale restores DB qty to 5, but navigating to the Stock list or StockItemDetail (stockKeys.item / stockKeys.transactions, staleness window 30-60s, no event while window stays focused) still shows qty 2 and no 'returned' ledger rows — operators see availability 3 units lower than reality. Round-2 #82 fixed exactly this omission for the receive/usage mutations in StockItemDetail (which now invalidate items()+stats()); the cancel path in this file was not covered by that finding.

### 92. getMonthStartIso serializes local midnight of the 1st via toISOString(), so 'This Month Revenue' over-includes the entire last day of the previous month for every UTC+ tenant, all month long

`src/pages/stock/StockSalesPage.tsx:30` · timezone-off-by-one

getMonthStartIso feeds getStockSales({ startDate }) (lines 95-98), which applies .gte('sale_date', startDate) (stockService.ts:495) against timestamptz sale_date; the sum is rendered as the 'This Month Revenue' KPI (monthRevenue, line 170). For any UTC+ browser (Dubai/Muscat, the primary GCC market), new Date(2026, 6, 1) = Jul 1 00:00 local = Jun 30 20:00Z, so startDate='2026-06-30' and the query includes all sales with sale_date >= Jun 30 00:00Z. July's monthly revenue KPI therefore includes June 30th's sales at every hour of every day in July — not just at a boundary instant. Exact sibling of round-2 confirmed-high finding #16 (timesheetService month window), which was fixed; this one was missed.

### 93. StockSalesPage.handleSaleSuccess invalidates only stockKeys.sales()+stats() after record_stock_sale, leaving stockKeys.serialNumbers(itemId) (and items()/saleable()) stale — reopening New Sale within the 60s staleTime re-offers a just-sold serial; round-1 fixed the same defect in the case Backup Devices caller but not this one

`src/pages/stock/StockSalesPage.tsx:115` · cache-invalidation

record_stock_sale decrements quantity_on_hand and flips the sold serial out of 'in_stock'. StockSaleModal itself invalidates nothing (only onSuccess(sale.id) at StockSaleModal.tsx:404); its serial pickers read stockKeys.serialNumbers(itemId) via getAvailableSerialNumbers, which filters status='in_stock' (stockService.ts:642-647). handleSaleSuccess on the Device Sales page invalidates only sales() and stats() (StockSalesPage.tsx:115-116), never serialNumbers(itemId). Because the global default staleTime is 60000ms (main.tsx:80) and refetchOnMount only refetches stale queries, the serial cache stays fresh for 60s. Sell serialized drive S/N ABC123 from Device Sales -> New Sale, return, and within 60s reopen New Sale and re-add the same (multi-serial) item: the serial dropdown still offers ABC123 from the un-invalidated ['stock','serials',itemId] cache. Selecting it fails the record_stock_sale oversell check server-side, surfacing as a confusing rejected sale. The modal's own item grid is fetched fresh on open (loadItems, non-react-query) so it is not the stale surface; the stale surfaces are the serial dropdown and the separate Stock inventory list page (['stock','items'], staleTime 60s). Round-1 fixed this exact defect class in CaseBackupDevicesTab (now broad-invalidates stockKeys.all, CaseBackupDevicesTab.tsx:74); this second caller was left with the narrow invalidation.

### 94. SupplierProfilePage edit-modal prop mapping omits the four structured-address fields, so every supplier edit NULLs address_line1/address_line2/subdivision_id/postal_code (modal saves them unconditionally)

`src/pages/suppliers/SupplierProfilePage.tsx:251` · form-roundtrip-data-loss

Create a supplier via SupplierFormModal filling AddressFields (suppliers.address_line1, postal_code, subdivision_id populated). Open Suppliers -> profile -> Edit Supplier, change only the phone, click Update Supplier. SupplierProfilePage.tsx:251-269 maps address/tax/notes/contact fields but not the four structured-address columns, so SupplierFormModal.tsx:96-99 hydrates them as ''/null and the UPDATE at SupplierFormModal.tsx:174-177/191-195 writes address_line1/address_line2/subdivision_id/postal_code all to null. The four structured columns are permanently wiped on every profile-page edit; the composed free-text `address` (state/zip/country) survives. Impact is bounded because these structured columns are today only ever read back into the edit modal itself and not surfaced on the profile or used downstream.

### 95. Supplier profile 'Create PO' button navigates to non-existent /purchase-orders/new, which binds to :id and errors (invalid uuid) — the supplier-scoped PO create shortcut always fails and loses supplier pre-selection

`src/pages/suppliers/SupplierProfilePage.tsx:840` · broken-navigation

On a supplier's Purchase Orders tab, clicking 'Create PO' calls navigate('/purchase-orders/new', { state: { supplierId } }). No 'purchase-orders/new' route exists (App.tsx:200-201), so 'new' matches 'purchase-orders/:id'; PurchaseOrderDetailPage.loadOrder('new') runs supabase.from('purchase_orders').eq('id','new').maybeSingle(), failing the uuid cast (22P02). The catch shows an error toast and redirects to /purchase-orders. The list page only opens its create modal for ?new=1, not for router state, and no suppliers page reads location.state, so the modal never opens and the supplierId pre-selection is lost. The user can still create a PO from the list page's own 'Create Purchase Order' button, so the flow is broken-but-recoverable rather than fully blocked.

### 96. SuppliersListPage 'Total Spend' KPI still sums an unranged purchase_orders select — silently truncated at the PostgREST row cap (round-2 #83 fixed only the sibling PurchaseOrdersListPage)

`src/pages/suppliers/SuppliersListPage.tsx:138` · money-math

A tenant with >~1000 non-deleted purchase orders opens the Suppliers list page. The supplier_stats query fetches purchase_orders without .range(), so PostgREST returns only the first ~1000 rows; the client-side reduce sums just those, understating Total Spend by the value of the remaining POs with no error. Because commit 037faa7 fixed the identical pattern on PurchaseOrdersListPage (paged sumTotalValueBase loop) but not here, the Purchase Orders 'Total Value' KPI and Suppliers 'Total Spend' KPI now disagree, leading to wrong spend decisions. Affects only large tenants (>row cap), and is a display-only understatement that recovers once the query is paged/RPC-backed.

### 97. initialData={...selectedTemplate} new object identity per parent re-render re-fires LineItemTemplateFormModal's [initialData] effect and silently resets in-progress template edits

`src/pages/templates/TemplateTypeDetail.tsx:432` · data-loss

An admin opens Edit on an email template and spends time rewriting name/subject/content. A Supabase TOKEN_REFRESHED event (roughly hourly per AuthContext comment) fires; AuthContext.onAuthStateChange calls setSession(session) with a fresh session object (lines 243). Even though the profile refetch is deliberately suppressed for TOKEN_REFRESHED (lines 261-264), the memoized context value depends on session (lines 390-393), so it changes and re-renders every useAuth() consumer, including TemplateTypeDetail. That re-render passes a brand-new { ...selectedTemplate } object, so LineItemTemplateFormModal's useEffect with dependency [initialData] (lines 122-137) re-runs and setFormData(...) snaps every field back to the stored template values — all unsaved edits are wiped without warning while the modal stays open. (Note: unlike the finder's claim, a TenantConfigContext refresh alone does NOT trigger this, because TemplateTypeDetail does not consume that context; only AuthContext session changes re-render the parent.)

### 98. Reprocess-on-unprocessed-duplicate path (round-2 #85 fix) double-inserts a paid billing_invoices row for PAYMENT.SALE.COMPLETED — the handler is a non-idempotent INSERT with no paypal_transaction_id uniqueness, so a crash-then-retry mints a second paid platform invoice

`supabase/functions/paypal-webhook/index.ts:338` · idempotency-money

The round-2 #85 fix reprocesses a duplicate webhook when the existing billing_events row has processed_at NULL, assuming every handler is an idempotent set-to-value update. PAYMENT.SALE.COMPLETED is not: lines 330-353 mint a fresh number via get_next_number_for_tenant(p_scope='billing_invoices') and INSERT a new status='paid' billing_invoices row keyed by nothing unique (baseline_schema.sql:3785-3786 shows only invoice_number UNIQUE + pkey; no unique on paypal_transaction_id). Sequence: PAYMENT.SALE.COMPLETED arrives; billing_events inserted (processed_at NULL); paid invoice #1 inserted (line 338); the function is killed or a later op throws into the outer catch (500) before the processed_at stamp at line 392; PayPal retries the same event.id; billing_events insert hits 23505; existing.processed_at is NULL so the guard reprocesses; a SECOND paid billing_invoices row is written for the same PayPal transaction (duplicate platform revenue, duplicate invoice on the tenant Billing page, burned sequence number). Additionally the line-188 maybeSingle re-read destructures only { data: existing }, swallowing its error, so a transient read failure on an already-processed duplicate also routes into reprocess and mints a duplicate. Impact is on platform-billing accounting, gated behind a crash/throw-within-window + PayPal-retry precondition (the normal success path returns 200 and stamps processed_at correctly), hence medium rather than high.

### 99. Slug availability check and server duplicate guard both filter deleted_at IS NULL, but tenants_slug_key is an unfiltered UNIQUE constraint — a slug reused from a soft-deleted (rolled-back or admin-deleted) tenant shows Available, passes the guard, then 500s at tenant INSERT after the OTP is already consumed

`supabase/functions/provision-tenant/index.ts:273` · state-machine

A self-service signup fails partway (legal_entities / tax_registration / onboarding_progress insert error), so rollbackProvision (index.ts:116) soft-deletes the tenant, leaving its row with slug='acme-data-recovery' and deleted_at set. tenants_slug_key UNIQUE(slug) (baseline_schema.sql:4042) is NOT partial, so that slug stays globally reserved (only the plain idx_tenants_slug index is deleted_at-partial; it does not affect constraint enforcement). The user requests a fresh OTP and retries with the same company name -> same derived slug. Client checkSlugAvailability (useOnboardingFlow.ts:116-117) queries slug=X AND deleted_at IS NULL -> soft-deleted row excluded -> shows 'Available'. The server duplicate-slug guard (index.ts:269-284) applies the same deleted_at IS NULL filter -> passes. The single-use OTP is then consumed (index.ts:292-307, consumed_at set, never rolled back) BEFORE the tenant INSERT (index.ts:333-350), which now violates tenants_slug_key -> tenantError thrown. The outer catch (index.ts:606-620) returns a generic 500: the Postgres 'duplicate key value violates unique constraint' message contains neither 'already' nor 'exists', and a PostgrestError is not instanceof Error, so the body is 'An internal error occurred.' Net: the natural same-name retry is deterministically broken with a confusing 500 while the UI insists the slug is free, and each attempt burns the freshly-issued single-use OTP (must request another code). The same trap hits any brand-new signup that happens to pick a slug previously used by an admin-soft-deleted or rolled-back tenant. Recoverable by choosing a different slug, but the user has no signal to do so.

### 100. create-user orphan-recovery calls listUsers with perPage:1, so a pre-existing orphaned auth user is essentially never found and the retry fails with a 500 (uncorrected sibling of round-2 #27, which fixed only provision-tenant)

`supabase/functions/user-management/index.ts:145` · auth-user-lookup

A prior create-user attempt left an auth user in GoTrue whose profile has a NULL role (e.g. the fallback profile upsert at line 224 failed and the compensating deleteUser at line 239 also failed transiently). On retry, the profile-by-email check (line 141) passes because role is NULL, so the orphan-recovery lookup at line 145 runs listUsers({page:1, perPage:1}) and inspects only ONE arbitrary auth user. In any tenant with more than one auth account, allUsers.find(email===target) returns undefined, so the orphan-update branch (154-186) is skipped and execution reaches auth.admin.createUser (190) with an email that already exists in GoTrue. createUser returns createError, line 205 throws, and the outer catch returns HTTP 500 'An internal error occurred'. The admin cannot complete that half-created account through the UI; manual DB cleanup is required. Fix: replace the perPage:1 enumeration with a direct email lookup or a paginating helper like provision-tenant's findAuthUserByEmail.

### 101. Import RPC's statusHistory branch silently drops the workbook contract's optional 'details' column when inserting into append-only case_job_history (round-2 #8 sibling, explicitly deferred in PR #421 and still live)

`supabase/migrations/20260630222509_data_migration_import_dedup.sql:297` · data-loss

The Case Records workbook template exposes a Details column for the StatusHistory sheet (workbookContract.ts:677, optional string) and parseWorkbook maps it to key 'details' in each row; importClient.ts sends the rows verbatim to data_migration_import_batch. The RPC's statusHistory INSERT (20260630222509_data_migration_import_dedup.sql:297) lists only (id, tenant_id, case_id, action, old_value, new_value, created_at) and never reads v_row->>'details', even though case_job_history.details exists and is nullable. An operator migrating a legacy lab fills Details with the narrative of each historical status change; validation and dry-run pass, every row inserts, and every Details value is silently discarded. case_job_history is append-only (DB mutation guard), so the imported rows cannot be backfilled afterwards. The export RPC also omits details, so only manually-entered Details values exist — precisely the legacy-migration case. PR #421 fixed the timestamp half of round-2 finding #8 client-side (contract key renamed to performed_at) and explicitly deferred 'import-RPC statusHistory' as follow-up; no later migration redefines the branch.

### 102. POS 'Add to Invoice' strands a sale at status='pending' with no reachable path to bill it, and the selected payment method is never persisted on any stock sale

`supabase/rpc_snapshots/phase2_record_stock_sale_tax.sql:101` · state-transition

A staff user opens StockSaleModal and picks any payment method (cash/card/bank_transfer/added_to_invoice, StockSaleModal.tsx:647-650). record_stock_sale reads p_sale->>'payment_method' ONLY to derive status ('pending' for added_to_invoice, else 'paid'); the INSERT (snapshot lines 91-104) writes no payment_method_id and no payment_method text, so on EVERY sale the method is discarded and card/cash reconciliation has no stored datum. If the user picks 'Add to Invoice', the sale is created at status='pending', stock is decremented and the ledger written, but nothing ever writes stock_sales.invoice_id: addSaleToInvoice was removed in C2 cleanup, updateStockSale has zero callers, StockSaleDetailPage offers only Cancel/Refund and Print, and handleSubmit has no guard on the option. The sale sits pending forever and the customer is never billed unless an admin manually notices and creates an invoice by hand. Recoverable, hence medium.

## ⚪ Low (43)

| # | Bug | Location | Category |
|---|---|---|---|
| 103 | Receipt meter's case total sums balance_due_base (base currency) while invoice rows and allocations use document-currency balance_due — contradictory figures under one symbol when a case carries a foreign-currency invoice | `src/components/banking/RecordReceiptModal.tsx:232` | currency-mixing |
| 104 | markAsDeliveredMutation.onSuccess (useCaseMutations.ts:352) omits ['case_history', id], ['cases'], and CASE_COMMAND_STATS_KEY after running a transition_case_status ready->delivered RPC, so the History timeline and CasesList command-center rollups show transient stale UI that self-corrects only on window refocus / after 60s | `src/components/cases/detail/useCaseMutations.ts:352` | cache-invalidation |
| 105 | CustomerCasesTab summary strip miscounts terminal 'Closed — Device Returned'/'Closed — Media Disposed' cases as Open because the substring heuristic only matches deliver/complete/cancel | `src/components/customers/CustomerCasesTab.tsx:74` | status-vocabulary |
| 106 | handleFile lacks a catch: a corrupt/non-xlsx file dropped on the dropzone throws into a void'd promise, so the wizard silently returns to Upload with no error shown | `src/components/dataMigration/ImportWizard.tsx:84` | swallowed-error |
| 107 | Deferred round-2 sibling still unfixed: InventoryDetailModal:654 routes the canonical device-family KEY through name-based resolveDeviceFamily, collapsing memory_card/head_stack donors to 'other' and rendering raw part_type keys in the Donor Parts card | `src/components/inventory/InventoryDetailModal.tsx:654` | wrong-data-read |
| 108 | KB article editor's sidebar Status toggle is inert — it highlights the selected state but never affects persistence, which is driven solely by the footer Save-as-Draft/Update buttons | `src/components/kb/ArticleEditorModal.tsx:225` | broken-state-transition |
| 109 | Clearing a KB category's description is a silent no-op — `form.description \|\| undefined` drops the cleared value from the update | `src/components/kb/CategoryManagerModal.tsx:87` | data-loss |
| 110 | Tenant Overview Usage Statistics reads limits from never-populated tenants.limits (default '{}') with non-matching keys, so every tenant shows 'N / 0' limits and empty progress bars; storage-used is also always 0.00 GB | `src/components/platform-admin/tenant-detail/TenantOverviewTab.tsx:80` | wrong-data-display |
| 111 | Label Studio unconditionally re-seeds edit state from prefs refetch, discarding unsaved design edits when a concurrent change lands mid-session | `src/components/settings/labels/LabelStudio.tsx:61` | stale-state-clobber |
| 112 | Stock auto-print labels drop designed Price/Location/Company-footer fields (caller passes no opts), and the company footer is never auto-resolved on any stock path — contradicting the Label Studio preview's 'exactly what auto-print produces' promise | `src/components/stock/StockItemFormModal.tsx:177` | label-content-plumbing |
| 113 | Supplier document upload silently discards the required Document Type and the Description — neither is persisted anywhere | `src/components/suppliers/DocumentUploadModal.tsx:75` | silent-input-discard |
| 114 | Receive-stock modal pre-fills Qty Received with full ordered quantity ignoring already-received qty; since the RPC now accumulates, re-confirming the modal double-counts quantity_on_hand and received_quantity (no clamp) | `src/components/suppliers/ReceiveStockModal.tsx:55` | receive-quantity-math |
| 115 | TemplatePicker leaves the template dropdown enabled while the variable-context query is still in flight, so a manual selection during that first-open window renders every placeholder against an empty context ('' substitutions) | `src/components/templates/TemplatePicker.tsx:84` | race-condition |
| 116 | buildCaseSearchOr silently ignores errors from both pre-resolution queries, degrading Cases search to case-field-only matches with no error or log | `src/lib/caseSearch.ts:56` | swallowed-errors |
| 117 | duplicateCase (and createReRecoveryCase via it) inserts the case and its devices in two non-atomic writes, so a devices-insert failure strands a deviceless intake case with no custody baseline and a consumed case number | `src/lib/caseService.ts:212` | non-atomic-write |
| 118 | initiateCustodyTransfer is a non-atomic two-step write — a ledger failure after the transfer insert leaves a pending custody transfer with no CUSTODY_TRANSFER_INITIATED event, and the surfaced error invites a duplicate pending transfer on retry | `src/lib/chainOfCustodyService.ts:468` | non-atomic-write |
| 119 | getExpenseStats computes thisMonthStart via setDate(1)+toISOString() (local->UTC + preserved time-of-day), so the 'This Month' expenses KPI mis-includes the previous month's last day for UTC+ browsers in early-morning hours and drops the 1st for UTC- browsers in evening hours | `src/lib/expensesService.ts:669` | timezone-off-by-one |
| 120 | getPaymentStats builds p_month_start/p_today via setDate(1)+toISOString() (UTC dates), so the 'This Month'/'Today' payment KPIs drift a day at month/day boundaries for non-UTC tenants (self-correcting, display-only) | `src/lib/paymentsService.ts:390` | timezone-off-by-one |
| 121 | updateQuote replaces line items non-atomically (soft-delete then insert) with no compensation: an insert failure mid-operation leaves the quote with zero live items but its stale pre-edit total until the edit is retried | `src/lib/quotesService.ts:646` | non-atomic-write |
| 122 | duplicateQuote drops title, client_reference, and bank_account_id — real persisted columns misdescribed as 'removed' by a stale comment | `src/lib/quotesService.ts:867` | data-loss |
| 123 | Submitting a VAT return never records submitted_at/submitted_by — the timestamp is gated on an optional actor argument that no live caller passes | `src/lib/vatService.ts:196` | audit-data-loss |
| 124 | Onboarding wizard persists plaintext password and confirmPassword to sessionStorage on every keystroke, cleared only on successful submit | `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts:32` | security-credential-exposure |
| 125 | Company Overview 'Total Revenue' KPI hardcodes '$' and en-US formatting instead of the tenant currency config, mislabeling base-currency revenue for non-USD tenants (contradicts the same page's Financial tab) | `src/pages/companies/CompanyProfilePage.tsx:545` | tenant-config |
| 126 | ['customer_stats'] is never invalidated anywhere in the codebase, so the Customers page KPI tiles (Total / Portal Enabled / Recent 30d / Active) stay stale on the same page after create, edit, and bulk-archive | `src/pages/customers/CustomersListPage.tsx:299` | cache-invalidation |
| 127 | handlePaymentRecorded omits ['invoice_for_payment', id] invalidation, so reopening Record Payment within the 60s staleTime seeds the modal from the stale pre-payment balance and the default pay-in-full submit is rejected by create_receipt_with_allocations' allocation<=balance_due guard | `src/pages/financial/InvoiceDetailPage.tsx:224` | cache-invalidation |
| 128 | Round-2 #94 fix is inert in the app: InvoiceDetailPage's CreditNoteModal invoice prop omits credited_amount, so alreadyCredited is always 0 and sequential partial credit notes still strand a VAT residual | `src/pages/financial/InvoiceDetailPage.tsx:594` | incomplete-fix |
| 129 | 'This Month' revenue KPI is derived from the range-filtered fetch, so selecting the Today or This Week filter shrinks it to that sub-range while it stays labeled 'This Month' | `src/pages/financial/RevenueDashboard.tsx:132` | mixed-scope-kpi |
| 130 | TransactionsList 'Today' date filter serializes local midnight via toISOString(), so UTC+ browsers get a dateFrom one day early and the ledger includes all of yesterday's transactions | `src/pages/financial/TransactionsList.tsx:90` | timezone-off-by-one |
| 131 | HR dashboard KPIs count soft-deleted rows — the page queries employees/recruitment_jobs/performance_reviews directly, bypassing the deleted_at filters that round 2 added to the services | `src/pages/hr/HRDashboard.tsx:26` | soft-delete-filter |
| 132 | 'Add New Employee' quick action links to /hr/employees/new, which matches the employees/:id route (id='new') and strands the user on a permanent loading skeleton because the uuid query throws 22P02 | `src/pages/hr/HRDashboard.tsx:84` | broken-navigation |
| 133 | Donor search result 'View Details' button has no onClick handler — it does nothing when clicked | `src/pages/inventory/DonorSearchPage.tsx:497` | broken-navigation |
| 134 | Inventory list Technical Info cell reads the unused legacy inventory_items.pcb_number column (always NULL post-V2), so the PCB line never renders even though the PCB is stored in technical_details | `src/pages/inventory/InventoryListPage.tsx:635` | wrong-column-read |
| 135 | KB category management button is gated on role === 'admin' exactly, locking tenant owners out of the only category-CRUD entry point (hardcoded role instead of owner-inclusive check) | `src/pages/kb/KBCenterPage.tsx:171` | permissions |
| 136 | Approve/Mark-as-Paid invalidate only payrollKeys.period(id), not payrollKeys.records(id), so per-employee Status badges show stale 'calculated' (contradicting the flipped period badge) until a refocus/remount | `src/pages/payroll/PayrollPeriodDetailPage.tsx:57` | stale-cache |
| 137 | PortalPayments rows format the foreign-currency payment.amount with the tenant currency symbol while the 'Total Paid' headline sums base-currency amounts, so row and headline contradict each other for any multi-currency payment. | `src/pages/portal/PortalPayments.tsx:266` | currency-mixing |
| 138 | Cancelled-subscription banner shows cancelled_at (cancel-click timestamp) as the 'access until' date instead of current_period_end (paid-through date) | `src/pages/settings/BillingPage.tsx:146` | wrong-data-display |
| 139 | Client Portal settings active-customer count omits deleted_at filter, so archived portal customers stay counted | `src/pages/settings/ClientPortalSettings.tsx:105` | soft-delete |
| 140 | updateMutation session-refresh fallback is dead code: after a transient refreshSession failure with a still-valid session, `session` remains null and the save aborts with a wrong 'not authenticated' error | `src/pages/settings/GeneralSettings.tsx:303` | logic-error |
| 141 | Cancelling a stock adjustment sets deleted_at + status='cancelled', but getStockAdjustments filters deleted_at IS NULL, so cancelled sessions are invisible and the 'Cancelled' filter chip is unsatisfiable | `src/pages/stock/StockAdjustmentsPage.tsx:132` | unsatisfiable-filter |
| 142 | SupplierProfilePage.loadOrders lists soft-deleted purchase orders (no deleted_at filter), inflating the Orders tab count and letting the deleted PO open/edit via its detail page | `src/pages/suppliers/SupplierProfilePage.tsx:179` | soft-delete-filter |
| 143 | Template delete and duplicate swallow Supabase { error } — on failure nothing happens (no toast, no log), delete-confirm dialog stays open, template still exists | `src/pages/templates/TemplateTypeDetail.tsx:119` | swallowed-errors |
| 144 | Profile upsert failure during provisioning is only logged (no rollback), so the function returns 201 leaving an orphaned tenant/slug and a tenant-less owner — the one provisioning insert round-2's rollback fix left uncovered | `supabase/functions/provision-tenant/index.ts:415` | provisioning-rollback |
| 145 | log_case_checkout lacks a checked_out_at IS NULL idempotency guard: a concurrent re-checkout of the same device (cross-session ~60s stale window) overwrites the checkout_collector_*/checkout_batch_id projection columns on case_devices and appends a duplicate accepted transfer + DEVICE_CHECKED_OUT ledger event with no intervening return | `supabase/migrations/20260704190411_standardize_case_lifecycle.sql:503` | chain-of-custody |

## Plausible — needs one precondition confirmed (1)

### PortalCases omits the show_device_details visibility gate its sibling portal pages enforce, so the case-detail view renders device model/serial/symptoms regardless of the staff-set flag — a latent leak once portal customers can read case_devices (they cannot today).

`src/pages/portal/PortalCases.tsx:110` · visibility-gate-bypass

CasePortalTab gates device data per case via show_device_details (default false, CasePortalTab.tsx:43), persisted into case_portal_visibility.visible_fields. PortalQuotes/PortalDocuments correctly filter on their flags via getCaseIdsWithFlag, and PortalCases already loads the same visibility rows, yet its case_devices query (PortalCases.tsx:110-113) is keyed only on selectedCase.id and never checks isFieldVisible(row,'show_device_details'), so the modal lists every device's model/serial_number/symptoms (313-333) whenever the case is portal-visible. Today this cannot expose data to a real customer: portal sessions use authenticate_portal_customer + sessionStorage with no Supabase JWT, and case_devices RLS (baseline_schema.sql:6512-6517) is TO authenticated + tenant isolation, so an anon portal read returns nothing. The reachable-today effect is limited to staff previewing the portal seeing device details even with the flag off (an inaccurate WYSIWYG preview). The customer-facing leak becomes real only after the documented portal-JWT read cutover, at which point PortalCases would leak withheld device data while its correctly-gated siblings would not.

**Note.** Confirmed the code omission: PortalCases.tsx (105-119) queries case_devices and renders model/serial/symptoms (313-333) gated only on the case being portal-visible, never on show_device_details/show_technical_details, even though it already loads the visibility rows (65-69) and isFieldVisible() exists. Sibling pages gate correctly (PortalQuotes.tsx:66, portalDocumentService.ts:13 via getCaseIdsWithFlag), and the flag defaults false (CasePortalTab.tsx:43), so this is a genuine, inconsistent visibility-gate omission. HOWEVER the concrete customer-facing leak is not reachable in current code: portal auth (PortalAuthContext) is RPC + sessionStorage with NO supabase.auth JWT, and case_devices RLS (baseline_schema.sql:6512-6517) is TO authenticated + RESTRICTIVE tenant isolation, so an anon portal session reads zero device rows today. The finder concedes reads work only in staff-preview (where the reader is authenticated staff who already see everything — not a leak) or the future portal-JWT cutover (not in current source). The precondition I cannot establish from current code is a customer-reachable read path for case_devices; today the only reachable effect is that the portal case-detail preview ignores the flag (WYSIWYG inaccuracy). The cited RLS migration 20260601074108 does not exist in the repo; the real policies are in the baseline and, as claimed, do not read visible_fields. Real latent defect, but customer exposure is future-gated, hence PLAUSIBLE, not CONFIRMED.

---

## Notes & method

- **No code changes in this commit** — findings report only, mirroring the round-1/round-2 workflow (report first, fixes as follow-up increments).
- **Regression focus.** A recurring round-3 theme is *incomplete round-2 fixes*: PR #421 fixed one path of a defect and explicitly deferred cross-file siblings (stock `/resources/stock/*` nav paths, `InvoiceDetailPage` currency forwarding, `InventoryDetailModal` family). Those deferred siblings are confirmed still-live here and are flagged as such.
- **DB/migration findings** were verified against live migration SQL in `supabase/migrations/` and `docs/migrations-pending/`; fixing them requires `mcp__supabase__apply_migration` + type regen per `CLAUDE.md`, not a source-only edit.
- **Excluded:** 2 refuted on verification, 0 overturned on the second confirmation vote, and all round-1/round-2 catalogued defects (grep-checked against `docs/bug-audit-2026-07-12.md` and `docs/bug-audit-round2-2026-07-12.md`).
