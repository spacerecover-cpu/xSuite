# xSuite Codebase Bug Audit — Round 2

**Date:** 2026-07-12  
**Method:** Second automated multi-agent audit run *after* the round-1 fixes (90 bugs) merged. 36 finders fanned out across every domain plus cross-cutting dimensions and areas the first pass under-sampled (PDF engine adapters, KB/templates, realtime subscriptions, GDPR/audit/storage, date/timezone, platform-admin). Each candidate was adversarially re-verified by an independent agent, deduped, and severity-ranked. 74 agents, 9.6M tokens, 1,922 tool calls. Finders were told to exclude anything already fixed in round 1.  
**Live-DB cross-check:** The 2 findings that pointed at `.sql` migration files were re-verified against the **live** database (source of truth). One critical (`anonymize_customer_data` GDPR erasure) was a **false positive** — the live function was already corrected; it is excluded below. The other (export `dateTo` boundary) was confirmed against the live function and kept.

> Every finding below is in current `.ts`/`.tsx` source (read directly) or was confirmed against the live DB. `CONFIRMED` = independently reproduced; `PLAUSIBLE` = likely real, one precondition unconfirmed.

## Summary

**122 unique bugs** (115 confirmed, 7 plausible) — target was 100.

| Severity | Count |
|---|---|
| 🔴 Critical | 1 |
| 🟠 High | 28 |
| 🟡 Medium | 60 |
| ⚪ Low | 33 |
| **Total** | **122** |

_Excluded after live-DB verification: 1 false positive (stale migration SQL)._ 

### By category

| Category | Count |
|---|---|
| correctness | 26 |
| money-aggregation | 5 |
| race-condition | 5 |
| data-loss | 4 |
| cache-invalidation | 4 |
| audit-integrity | 3 |
| soft-delete-aggregation | 3 |
| timezone-off-by-one | 3 |
| pagination | 3 |
| tenant-isolation | 3 |
| swallowed-error | 3 |
| localization | 3 |
| broken-state-transition | 2 |
| data-corruption | 2 |
| missing-soft-delete-filter | 2 |
| money-correctness | 2 |
| data-integrity | 2 |
| logic | 2 |
| money | 2 |
| state-transition | 2 |
| incorrect-filter | 2 |
| save-handler-dropping-fields | 2 |
| error-swallowing | 1 |
| money-integrity | 1 |
| field-mapping-mismatch | 1 |
| money-rounding | 1 |
| broken-navigation | 1 |
| billing-entitlement | 1 |
| partial-state-on-failure | 1 |
| stale-closure | 1 |
| atomicity | 1 |
| react-side-effect-in-render | 1 |
| realtime-subscription | 1 |
| ordering | 1 |
| nondeterministic-ordering | 1 |
| date-off-by-one | 1 |
| auditability | 1 |
| state-corruption | 1 |
| logic-error | 1 |
| parity-field-mapping | 1 |
| content-loss | 1 |
| async-handling | 1 |
| date-logic | 1 |
| idempotency | 1 |
| duplicate-send | 1 |
| off-by-one-date-range | 1 |
| over-allocation | 1 |
| wrong-data-scope | 1 |
| financial-math | 1 |
| feature-gate | 1 |
| timezone-date-math | 1 |
| error-handling | 1 |
| missing-filter | 1 |
| inconsistent-logic | 1 |
| anti-flash | 1 |
| wrong-field | 1 |
| state-management | 1 |
| correctness-display | 1 |
| enum-mismatch | 1 |

### Index

| # | Sev | Bug | Location |
|---|---|---|---|
| 1 | 🔴 | Tenant signup wizard can never advance past the Account step — validateCurrentStep omits emailVerified, which step3Schema requires | `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts:241` |
| 2 | 🟠 | Changing a case's client silently fails to write the CLIENT_CHANGED audit entry (wrong RPC arg name) | `src/components/cases/ClientTab.tsx:209` |
| 3 | 🟠 | Recording a recovery attempt never invalidates ['case', id], so the stale recovery_outcome clobbers the DB on checkout and drives the wrong Rule 51 refund panel | `src/components/cases/detail/CaseRecoveryQaTab.tsx:85` |
| 4 | 🟠 | Device-family KEY passed through the NAME resolver collapses `memory_card` and `head_stack` to `other` — wrong technical fields, no donor-part capture, and data loss on edit | `src/components/inventory/InventoryItemWizard.tsx:221` |
| 5 | 🟠 | PhoneInput country search cannot type spaces and mis-selects on Space (missing listbox Space guard) | `src/components/ui/PhoneInput.tsx:314` |
| 6 | 🟠 | logAuditTrail ignores the { error } returned by supabase.rpc — DB/RLS audit failures silently swallowed | `src/lib/auditTrailService.ts:6` |
| 7 | 🟠 | Banking 'Record Receipt' marks the invoice paid but never credits any account or posts to the ledger — cash/revenue silently vanish | `src/lib/bankingService.ts:1032` |
| 8 | 🟠 | Imported case-history (statusHistory) events are stamped with import time, not their original timestamp | `src/lib/dataMigration/workbookContract.ts:673` |
| 9 | 🟠 | generateAgedReceivablesReport counts proforma invoices as receivables (no invoice_type filter) | `src/lib/financialReportsService.ts:179` |
| 10 | 🟠 | generateInvoiceSummaryReport totals double-count proforma + converted tax invoices (no invoice_type filter) | `src/lib/financialReportsService.ts:344` |
| 11 | 🟠 | DLQ flags every successfully-delivered in-app-only notification as unprocessed/stuck forever | `src/lib/notificationDLQService.ts:87` |
| 12 | 🟠 | Invoice PDF line totals hardcode 2-decimal rounding, breaking display + Subtotal reconciliation for 3-decimal currencies (OMR/KWD/BHD/JOD) | `src/lib/pdf/dataFetcher.ts:269` |
| 13 | 🟠 | Platform dashboard MRR & ARR are always $0 (billing_interval value mismatch) | `src/lib/platformAdminService.ts:70` |
| 14 | 🟠 | Timesheet list and monthly summary include soft-deleted rows | `src/lib/timesheetService.ts:48` |
| 15 | 🟠 | Timesheet reads never filter deleted_at — soft-deleted entries stay visible and inflate hour/billable KPIs | `src/lib/timesheetService.ts:54` |
| 16 | 🟠 | Timesheet 'this month' billable-hours window shifts a day earlier under UTC+ timezones | `src/lib/timesheetService.ts:195` |
| 17 | 🟠 | Timesheet KPI stats count soft-deleted timesheets (no deleted_at filter) | `src/lib/timesheetService.ts:203` |
| 18 | 🟠 | Monthly timesheet summary drops the last day of the month for UTC+ tenants | `src/lib/timesheetService.ts:239` |
| 19 | 🟠 | Case Custody audit feed uses the disabled system-audit query's count and empty-state, mis-paginating and hiding custody events | `src/pages/admin/AuditTrails.tsx:210` |
| 20 | 🟠 | Re-allocating a leave balance wipes already-consumed used_days to 0 | `src/pages/employee-management/LeaveManagement.tsx:469` |
| 21 | 🟠 | Invoice currency selection is silently dropped on save — foreign-currency invoice is booked in the tenant base currency | `src/pages/financial/InvoicesListPage.tsx:434` |
| 22 | 🟠 | Quote currency selection is ignored on create — hardcoded to tenant base instead of the picked currency | `src/pages/quotes/QuotesListPage.tsx:759` |
| 23 | 🟠 | All in-page stock navigations point to /resources/stock/* which no route matches → 404 | `src/pages/stock/StockListPage.tsx:155` |
| 24 | 🟠 | Editing a PO from the detail page erases expected_delivery_date (and the date is never displayed) — wrong field name | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:416` |
| 25 | 🟠 | paypal-create-subscription writes status 'pending', violating tenant_subscriptions_status_check — upsert fails on every call and the error is swallowed | `supabase/functions/paypal-create-subscription/index.ts:256` |
| 26 | 🟠 | PayPal webhook SUSPENDED handler writes status 'paused' to both tables, violating their CHECK constraints — suspended tenants silently keep active entitlement | `supabase/functions/paypal-webhook/index.ts:229` |
| 27 | 🟠 | listUsers() only checks the first 50 auth users, breaking existing-user detection and duplicate handling | `supabase/functions/provision-tenant/index.ts:261` |
| 28 | 🟠 | Failed provisioning after profile creation permanently locks the user out (orphaned profile.tenant_id + orphaned auth user) | `supabase/functions/provision-tenant/index.ts:461` |
| 29 | 🟠 | send-document-email logs case communications into arbitrary cross-tenant cases (no caseId ownership check) | `supabase/functions/send-document-email/index.ts:291` |
| 30 | 🟡 | Recording stock usage against a case leaves recommended/items/stats stock caches stale | `src/components/cases/CaseBackupDevicesTab.tsx:81` |
| 31 | 🟡 | Selecting the Patient role on the primary device drops the role change (stale-closure double setState) | `src/components/cases/CreateCaseWizard.tsx:547` |
| 32 | 🟡 | markAsDeliveredMutation commits the clone_drives 'delivered' write before the gated case transition, leaving a partial state when transition_case_status throws | `src/components/cases/detail/useCaseMutations.ts:312` |
| 33 | 🟡 | Data-destruction certificate accepts three identical/self-signatures — separation-of-duties is never enforced | `src/components/cases/DocumentDraftReview.tsx:325` |
| 34 | 🟡 | Integrity check with an expected hash but no actual hash falls through to 'passed' | `src/components/cases/IntegrityCheckModal.tsx:83` |
| 35 | 🟡 | Quote-number preview mints (advances) the sequence and re-mints on case change | `src/components/cases/QuoteFormModal.tsx:178` |
| 36 | 🟡 | Command palette Enter/highlight use a different index space than the rendered rows, navigating to the wrong command | `src/components/shared/CommandPalette.tsx:206` |
| 37 | 🟡 | UsageLimitGuard calls toast.error() and onBlocked() during render, stacking toasts and updating state mid-render | `src/components/shared/UsageLimitGuard.tsx:55` |
| 38 | 🟡 | StockItemFormModal silently drops Model and Capacity on save | `src/components/stock/StockItemFormModal.tsx:144` |
| 39 | 🟡 | Percentage discount on a stock sale is not capped at 100% → negative sale total previewed and submittable | `src/components/stock/StockSaleModal.tsx:302` |
| 40 | 🟡 | Portal-tenant reconciliation interval self-terminates after 30s, so same-tab portal logins after 30s never resolve the tenant's config/theme | `src/contexts/TenantConfigContext.tsx:40` |
| 41 | 🟡 | ThemeContext anti-flash keys on isLoading instead of isResolvedConfig, flashing non-royal tenants to Royal and overwriting the theme hint during the pre-profile auth window | `src/contexts/ThemeContext.tsx:62` |
| 42 | 🟡 | useCasesRealtime never (re)subscribes when tenant_id is absent at mount or changes later — dead realtime for platform-admin/tenant-switch sessions | `src/hooks/useCasesRealtime.ts:106` |
| 43 | 🟡 | getCasesWithInvoices sorts by parseInt(case_number) — always 0 for prefixed case numbers — then silently truncates to 50 in arbitrary order | `src/lib/bankingService.ts:894` |
| 44 | 🟡 | Case financial summary silently swallows failed queries | `src/lib/caseFinanceService.ts:60` |
| 45 | 🟡 | Delivery-challan reprint re-derives the statutory total/lines/e-way note from mutable device state instead of the immutable issued record | `src/lib/deliveryChallanService.ts:218` |
| 46 | 🟡 | Forensic report custody timeline lacks id tiebreaker → nondeterministic entry numbering | `src/lib/documentInstanceData.fetch.ts:167` |
| 47 | 🟡 | Report collapses multi-device case to one device and derives whole-case recoverability from it | `src/lib/documentInstanceData.fetch.ts:214` |
| 48 | 🟡 | planCache is not tenant-keyed and never cleared on sign-out → cross-tenant plan-entitlement bleed | `src/lib/featureGateService.ts:84` |
| 49 | 🟡 | Profit & Loss report silently swallows failed queries and reports wrong money | `src/lib/financialReportsService.ts:124` |
| 50 | 🟡 | generateProfitLossReport and generateRevenueByCustomerReport include void/cancelled invoices in revenue (no status filter) | `src/lib/financialReportsService.ts:127` |
| 51 | 🟡 | Invoice flagged 'overdue' on (or the evening before) its due date | `src/lib/invoicePermissions.ts:85` |
| 52 | 🟡 | Restricted-edit path writes no audit_trails entry when an issued/paid invoice is edited | `src/lib/invoiceService.ts:620` |
| 53 | 🟡 | updateInvoice persists caller-supplied status verbatim, bypassing the mandated tax-invoice issuance path | `src/lib/invoiceService.ts:625` |
| 54 | 🟡 | Bulk-emailing an invoice unconditionally resets its status to 'sent', clobbering paid/partial/overdue state | `src/lib/invoiceService.ts:1256` |
| 55 | 🟡 | Article tag reads ignore deleted_at, so soft-deleted tag links persist and kept tags duplicate on every edit | `src/lib/kbService.ts:199` |
| 56 | 🟡 | KB version snapshots insert a non-existent 'changed_by' column, silently breaking all version history | `src/lib/kbService.ts:243` |
| 57 | 🟡 | Publishing a draft article never sets published_at due to inverted/dead `!current.data` guard | `src/lib/kbService.ts:288` |
| 58 | 🟡 | Onboarding 'Load Sample Data' always throws — dead default-tenant lookup returns null under tenant RLS and gates seedDemoData | `src/lib/onboardingService.ts:106` |
| 59 | 🟡 | getEmployeeAttendance omits the deleted_at IS NULL filter, so soft-deleted attendance rows still drive pay (over-docked absence / over-paid overtime) | `src/lib/payrollService.ts:583` |
| 60 | 🟡 | Payroll record status is never advanced past 'calculated'; dashboard "Processed This Month" is permanently 0 and per-employee status badge is wrong even in paid periods | `src/lib/payrollService.ts:993` |
| 61 | 🟡 | Date formats outside a 5-entry whitelist (incl. DD.MM.YYYY) silently degrade to 'dd MMM yyyy' on all PDFs | `src/lib/pdf/configDate.ts:22` |
| 62 | 🟡 | India (in_gst) credit-note PDF renders forced HSN/Code and Unit columns as empty cells | `src/lib/pdf/engine/adapters/creditNoteAdapter.ts:152` |
| 63 | 🟡 | Forensic report silently drops the authored 'Chain of Custody' section prose | `src/lib/pdf/engine/adapters/reportAdapter.ts:611` |
| 64 | 🟡 | Seven sibling blob PDF generators lack the getBlob timeout/error-callback hardening, so an async rasterization failure never settles the promise | `src/lib/pdf/pdfService.ts:1673` |
| 65 | 🟡 | Performance-review reads never filter deleted_at — deleted reviews stay listed and counted in stats/average | `src/lib/performanceService.ts:24` |
| 66 | 🟡 | Tenants list plan filter always returns zero tenants (reads non-existent plan_code) | `src/lib/platformAdminService.ts:195` |
| 67 | 🟡 | Recruitment reads never filter deleted_at — deleted jobs/candidates stay listed, counted, and inflate applicant counts | `src/lib/recruitmentService.ts:41` |
| 68 | 🟡 | Stock sales report overstates Gross Profit/Margin by counting collected tax as revenue | `src/lib/stockService.ts:818` |
| 69 | 🟡 | Company "Primary Contact" query uses .eq('is_primary', true).maybeSingle() but is_primary is customer-scoped, so any company with 2+ primary contacts errors and shows no primary contact | `src/pages/companies/CompaniesListPage.tsx:130` |
| 70 | 🟡 | Company profile insights count cases/quotes by linked contacts' customer_id, not by company_id, inflating KPIs and disagreeing with the Cases/Financial tabs | `src/pages/companies/CompanyProfilePage.tsx:219` |
| 71 | 🟡 | Customers list 'Company' column reads customer_company_relationships[0] with no deleted_at filter or ordering, so it shows an ended or non-primary company | `src/pages/customers/CustomersListPage.tsx:172` |
| 72 | 🟡 | Dashboard 'created today' case count misses early-local-day cases (date string vs timestamptz) | `src/pages/dashboard/Dashboard.tsx:63` |
| 73 | 🟡 | 'This Month' revenue KPI conflates the same calendar month across different years | `src/pages/financial/RevenueDashboard.tsx:131` |
| 74 | 🟡 | VAT Audit KPI totals (Collected / Paid / Net Position) are corrupted by the record-type table filter | `src/pages/financial/VATAuditPage.tsx:187` |
| 75 | 🟡 | Support ticket 'Unassigned' and 'Assigned to Me' filters send invalid strings to a uuid column | `src/pages/platform-admin/SupportTicketsPage.tsx:42` |
| 76 | 🟡 | Portal "Total Paid" sums refunded, failed, and pending payments as money received | `src/pages/portal/PortalPayments.tsx:106` |
| 77 | 🟡 | Editing a quote from the list page silently discards title, client reference, and bank account changes | `src/pages/quotes/QuotesListPage.tsx:717` |
| 78 | 🟡 | Creating a quote from the list page drops per-line unit code, unit label, and HSN/SAC item code | `src/pages/quotes/QuotesListPage.tsx:762` |
| 79 | 🟡 | GDPR customer lookup selects a non-deterministic customer (no ORDER BY) for irreversible anonymize / data export | `src/pages/settings/GDPRCompliancePage.tsx:115` |
| 80 | 🟡 | Number-sequence edit cannot clear a format template back to the classic format | `src/pages/settings/SystemNumbers.tsx:160` |
| 81 | 🟡 | Number-sequence edit cannot switch reset basis back to "never" (silent no-op) | `src/pages/settings/SystemNumbers.tsx:161` |
| 82 | 🟡 | Stock receive/usage mutations don't invalidate the stock list or stats cache (stale KPIs & quantities) | `src/pages/stock/StockItemDetail.tsx:171` |
| 83 | 🟡 | Total Value / Total Spend KPIs sum PO rows client-side with no pagination — silent truncation past the PostgREST row cap | `src/pages/suppliers/PurchaseOrdersListPage.tsx:159` |
| 84 | 🟡 | PAYMENT.SALE.COMPLETED subscription lookup uses the sale/transaction id instead of the subscription id | `supabase/functions/paypal-webhook/index.ts:151` |
| 85 | 🟡 | Webhook idempotency guard keys on row-existence, not processing completion, and is not atomic with the state updates — a mid-processing failure makes PayPal retries permanent no-ops | `supabase/functions/paypal-webhook/index.ts:176` |
| 86 | 🟡 | Platform PayPal billing invoice mints from the tenant's legal tax-invoice series | `supabase/functions/paypal-webhook/index.ts:287` |
| 87 | 🟡 | Follow-up email re-sent (duplicate) when SMTP close() throws after a successful send | `supabase/functions/process-scheduled-followups/index.ts:158` |
| 88 | 🟡 | send-otp-email uses a module-global _corsHeaders shared across concurrent requests, yielding wrong CORS origin on responses | `supabase/functions/send-otp-email/index.ts:24` |
| 89 | 🟡 | Export 'To' date filter excludes every record created after midnight on the selected end day | `supabase/migrations/20260630195733_data_migration_export_rpc.sql:16` |
| 90 | ⚪ | receive_stock_from_po overwrites received_quantity instead of accumulating; multi-shipment partial receipts corrupt received tracking | `docs/migrations-pending/2026-07-10-perf-p2b-receive-stock-from-po-rpc.sql:49` |
| 91 | ⚪ | Toggling an invoice on when the receipt is fully allocated auto-fills its FULL outstanding (0 \|\| fallback bug) | `src/components/banking/RecordReceiptModal.tsx:274` |
| 92 | ⚪ | Stage Banner transition does not refresh the Case Activity timeline (invalidates a dead query key) | `src/components/cases/detail/CaseStageBanner.tsx:109` |
| 93 | ⚪ | Import Summary lists all cross-domain entities instead of only the imported domain's sheets | `src/components/dataMigration/ImportWizard.tsx:399` |
| 94 | ⚪ | proratedVat computes each credit note's VAT independently against the full invoice, leaving a residual across multiple partial credits | `src/components/financial/CreditNoteModal.tsx:50` |
| 95 | ⚪ | VATReturnDetailModal load effect has no cancellation — a fast return switch can show another return's reconciliation | `src/components/financial/VATReturnDetailModal.tsx:24` |
| 96 | ⚪ | Supplier communication logging silently discards Communication Date and follow-up fields; displayed date is always created_at | `src/components/suppliers/CommunicationFormModal.tsx:87` |
| 97 | ⚪ | Sidebar preference load discards ALL saved DB fields if the user touches any one preference before the SELECT resolves | `src/contexts/SidebarPreferencesContext.tsx:87` |
| 98 | ⚪ | getFeatureLimit / getCurrentUsage coerce a limit_value of 0 into null (unlimited) via `\|\| null`, bypassing a hard zero limit | `src/lib/billingService.ts:603` |
| 99 | ⚪ | getBillingStats 'this month' revenue window keeps current time-of-day, dropping early-of-1st invoices | `src/lib/billingService.ts:647` |
| 100 | ⚪ | getCasePayments returns empty list on any query error, hiding real payments | `src/lib/caseFinanceService.ts:150` |
| 101 | ⚪ | max_branches usage limit uses `\|\| null`, turning a configured 0-branch cap into 'unlimited' | `src/lib/featureGateService.ts:246` |
| 102 | ⚪ | getCasesForAssignment caps at 100 cases, so donors cannot be assigned to older active cases in busy labs | `src/lib/inventoryCaseAssignmentService.ts:214` |
| 103 | ⚪ | Inventory 'In Use' KPI is hardcoded to 0 and always shows 0 regardless of active case assignments | `src/lib/inventoryService.ts:747` |
| 104 | ⚪ | getLeaveStats month/today boundaries use toISOString(), off by one day for east-of-UTC clients | `src/lib/leaveService.ts:345` |
| 105 | ⚪ | getCurrentPayrollPeriod uses maybeSingle(); two overlapping monthly periods covering today make it throw and zero out the payroll dashboard | `src/lib/payrollService.ts:256` |
| 106 | ⚪ | Tenant health-score revenue counts deleted and non-completed payments | `src/lib/platformAdminService.ts:258` |
| 107 | ⚪ | At-Risk dashboard 'Days Since Login' is always 0 (metric never persisted) | `src/lib/platformAdminService.ts:338` |
| 108 | ⚪ | Health metric active_users_count stores total registered users, not active users | `src/lib/platformAdminService.ts:343` |
| 109 | ⚪ | cachedPortalSettings module-global is not tenant-keyed and not cleared on sign-out | `src/lib/portalUrlService.ts:27` |
| 110 | ⚪ | Low Stock KPI badge count disagrees with the Low Stock tab contents (out-of-stock items) | `src/lib/stockService.ts:773` |
| 111 | ⚪ | Tax-registration-number placeholder never resolves in the engine config path | `src/lib/tenantConfigService.ts:112` |
| 112 | ⚪ | Country postal-code label never resolves — every address form shows generic 'Postal Code' | `src/lib/tenantConfigService.ts:129` |
| 113 | ⚪ | main.tsx locale anti-flash pre-seeds RTL only for 'ar', unlike the theme block which derives from THEMES - non-Arabic RTL languages flash LTR->RTL on reload | `src/main.tsx:59` |
| 114 | ⚪ | Mark-as-Delivered and Preserve modals always show 'Unknown Device' (reads a field the clone object never carries) | `src/pages/cases/CaseDetail.tsx:723` |
| 115 | ⚪ | Customers/Companies pages cache a 'location'-only company_settings projection under the shared key ['company_settings'], poisoning the Settings→General full-row consumer | `src/pages/customers/CustomersListPage.tsx:262` |
| 116 | ⚪ | Transfers list renders undefined account names and transfer number (wrong embedded field name / non-persisted column) | `src/pages/financial/BankingPage.tsx:648` |
| 117 | ⚪ | Recording a payment or credit note on invoice detail doesn't refresh invoice list KPIs | `src/pages/financial/InvoiceDetailPage.tsx:224` |
| 118 | ⚪ | Tax invoices render an unstyled raw 'tax_invoice' badge due to typeConfig key mismatch | `src/pages/financial/InvoiceDetailPage.tsx:724` |
| 119 | ⚪ | VAT Records table renders each row's document-currency vat_amount under the tenant currency symbol | `src/pages/financial/VATAuditPage.tsx:450` |
| 120 | ⚪ | Filter change double-fetches (stale page then reset) and can display an out-of-order/empty result | `src/pages/inventory/InventoryListPage.tsx:82` |
| 121 | ⚪ | Dismissing the last row on the last page strands the user on a false 'No notifications' empty page | `src/pages/notifications/NotificationsHistory.tsx:343` |
| 122 | ⚪ | 'Refunded' sales status filter can never return any rows | `src/pages/stock/StockSalesPage.tsx:215` |

---

## 🔴 Critical (1)

### 1. Tenant signup wizard can never advance past the Account step — validateCurrentStep omits emailVerified, which step3Schema requires

- **File:** `src/pages/auth/onboarding/hooks/useOnboardingFlow.ts:241`
- **Severity:** 🔴 critical · **Verdict:** CONFIRMED · **Category:** broken-state-transition

**What's wrong:** At step 2 (Account), validateCurrentStep (useOnboardingFlow.ts:128-153) validates against STEP_SCHEMAS[2] = step3Schema, which requires `emailVerified: z.boolean().refine(v => v === true)` (constants.ts:88). But getStepFields(2) returns ['fullName','email','password','confirmPassword'] (line 241) with no 'emailVerified', so the object passed to step3Schema.safeParse never contains emailVerified. With zod 4.3.6 (installed), z.boolean() on a missing key fails with 'expected boolean, received undefined', so safeParse always fails and validateCurrentStep returns false at step 2. nextStep (line 156) returns early on failed validation, so clicking Continue does nothing. The AccountStep Continue button (AccountStep.tsx:250-251) is enabled only after emailVerified===true, yet even then the step cannot advance because emailVerified is not fed to the schema. No errors.emailVerified is rendered, so it fails silently. Route is live: /signup/tenant -> pages/auth/OnboardingWizard (App.tsx:99).

**Failure scenario:** A prospective customer opens /signup/tenant, completes company/slug (step 0) and country/currency (step 1), then on the Account step enters name/email/password, requests and verifies the OTP (Continue becomes enabled). Clicking Continue calls nextStep -> validateCurrentStep parses {fullName,email,password,confirmPassword} (no emailVerified) against step3Schema -> safeParse fails on emailVerified -> validateCurrentStep returns false -> nextStep aborts. The wizard stays on the Account step with no visible error. New-tenant signup is impossible for every user.

**Suggested fix:** Add 'emailVerified' to getStepFields for step 2 (return ['fullName','email','password','confirmPassword','emailVerified']) so the schema receives it, or add an explicit `if (step === 2 && !formData.emailVerified) return;` gate in nextStep and drop emailVerified from step3Schema's parsed shape. Prefer the former so the schema check stays authoritative.

**Verifier note:** Independently reproduced. Confirmed STEP_SCHEMAS ordering (constants.ts:111 -> index 2 = step3Schema), getStepFields(2) missing emailVerified (line 241), and ran zod 4.3.6 empirically: safeParse without emailVerified fails ('emailVerified: Invalid input: expected boolean, received undefined'); with emailVerified:true it succeeds. Continue button is disabled until emailVerified (AccountStep.tsx:251) and calls onNext=nextStep. Route confirmed live in App.tsx:99. Severity critical: blocks all tenant onboarding.

---

## 🟠 High (28)

### 2. Changing a case's client silently fails to write the CLIENT_CHANGED audit entry (wrong RPC arg name)

- **File:** `src/components/cases/ClientTab.tsx:209`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** audit-integrity

**What's wrong:** changeClientMutation calls supabase.rpc('log_case_history', { p_case_id, p_action:'CLIENT_CHANGED', p_details_json: {...} }). The RPC's real signature (src/types/database.types.ts:19166-19173) is { p_action, p_case_id, p_details?, p_new_value?, p_old_value? } — there is no p_details_json parameter. Because Args is inferred through a generic, the excess key compiles, but at runtime PostgREST cannot resolve a function overload named log_case_history(p_action, p_case_id, p_details_json) and returns PGRST202. The call is awaited WITHOUT destructuring `{ error }` (line 209), so the failure is swallowed and the mutation still resolves onSuccess. The sibling changeCompanyMutation (line 237) was already fixed to p_details: JSON.stringify(...) with an explicit comment ('the previous p_details_json arg didn't exist, so this call failed silently'); the client path was left unfixed.

**Failure scenario:** A user reassigns a case to a different customer via the Change Client modal. The cases.customer_id UPDATE succeeds and the modal closes, but the log_case_history RPC rejects p_details_json, the error is ignored, and no CLIENT_CHANGED row is written to case_job_history — a forensic gap in the append-only case history for a custody-tracked job.

**Suggested fix:** Match the fixed company path: pass p_details: JSON.stringify({ old_customer_id, new_customer_id }) (optionally p_old_value/p_new_value), and capture const { error } = await supabase.rpc(...) so an audit-log failure is surfaced rather than swallowed.

**Verifier note:** Independently reproduced. Confirmed RPC signature at database.types.ts:19166-19173 has no p_details_json; confirmed line 209 does not destructure the result (unchecked await), so the error is swallowed. Company path at line 237-246 is the fixed reference implementation. Severity high retained per CLAUDE.md's first-class auditability mandate (silent, unrecoverable audit-trail loss).

---

### 3. Recording a recovery attempt never invalidates ['case', id], so the stale recovery_outcome clobbers the DB on checkout and drives the wrong Rule 51 refund panel

- **File:** `src/components/cases/detail/CaseRecoveryQaTab.tsx:85`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** data-corruption

**What's wrong:** caseQualityService.recordRecoveryAttempt aggregates all attempts and writes cases.recovery_outcome directly (caseQualityService.ts:120-137, UPDATE at 131-134). But recordRecovery.onSuccess in CaseRecoveryQaTab (line 84-92) invalidates only ['case_recovery_attempts', caseId] (line 85) and never ['case', id]. The ['case', id] query is created at page level in useCaseQueries (useCaseQueries.ts:16-18) and persists across tab switches; a mounted, focused query does not auto-refetch merely because it went stale, so its cached recovery_outcome remains the pre-attempt value. Two consumers read that stale value: (a) DeviceCheckoutModal via currentRecoveryOutcome={caseData.recovery_outcome} (CaseDetail.tsx:542) — seedRecoveryOutcome(null) returns 'full' (DeviceCheckoutModal.tsx:42-44), and log_case_checkout writes recovery_outcome = COALESCE(p_recovery_outcome, recovery_outcome) (migration 20260704190411 line 498) where the modal always supplies a non-null value, so it overwrites; (b) the Rule 51 refund gate canOfferRefundVoucher({recoveryOutcome: caseData.recovery_outcome}) at CaseOverviewTab.tsx:334 / advanceTerminals.ts:23.

**Failure scenario:** Case already at 'ready', DB and cache recovery_outcome = null. Tech records a recovery attempt with result='partial' in the Recovery & QA tab -> recordRecoveryAttempt sets cases.recovery_outcome='partial' in the DB, but ['case', id] cache stays null (only ['case_recovery_attempts'] is invalidated). With no intervening status transition, the tech opens Device Checkout: currentRecoveryOutcome is the stale null, so seedRecoveryOutcome(null) selects 'full'. Passive checkout (dropdown untouched) sends p_recovery_outcome='full'; log_case_checkout writes 'full', clobbering the correct 'partial'. Customer OutcomeBadge and reports now show Full Recovery. Symmetric money path: a case with an issued advance receipt voucher and DB/cache recovery_outcome='unrecoverable' where a new attempt rolls the DB up to 'partial' — the stale 'unrecoverable' still satisfies canOfferRefundVoucher, so a Rule 51 refund voucher (which reverses advance GST) can be issued for a case that actually recovered data.

**Suggested fix:** In CaseRecoveryQaTab's recordRecovery.onSuccess (and recordQa.onSuccess for QA-driven state), also call queryClient.invalidateQueries({ queryKey: ['case', caseId] }) so the cached recovery_outcome is refreshed before the checkout modal seeds its dropdown and before the refund-panel gate is evaluated.

**Verifier note:** Independently verified every link in the chain in current code: caseQualityService.ts:131-134 (DB write), CaseRecoveryQaTab.tsx:85 (only ['case_recovery_attempts'] invalidated), useCaseQueries.ts:18 (['case', id] at page scope), CaseDetail.tsx:542 (stale prop into modal), DeviceCheckoutModal.tsx:42-44 (seed defaults to 'full'), migration 20260704190411:498 (log_case_checkout COALESCE — modal always sends non-null so it overwrites), and CaseOverviewTab.tsx:334 + advanceTerminals.ts:23 (refund gate reads the same stale field). Both the data-corruption path and the GST-refund money path hold. CONFIRMED.

---

### 4. Device-family KEY passed through the NAME resolver collapses `memory_card` and `head_stack` to `other` — wrong technical fields, no donor-part capture, and data loss on edit

- **File:** `src/components/inventory/InventoryItemWizard.tsx:221`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** data-loss

**What's wrong:** resolveFamily() at line 221 does `if (dt?.family) return resolveDeviceFamily(dt.family)`. Migration 20260629215312 (verified: lines 23-33) backfills catalog_device_types.family with the canonical underscore keys ('head_stack', 'memory_card', 'usb_flash', etc.). resolveDeviceFamily (src/lib/devices/deviceFamily.ts) maps display NAMES: EXPLICIT has no entry for the bare keys, so it falls to heuristic(). I executed the heuristic regexes against the underscore keys: for 'memory_card' none of the branches match (the regex is /sd card|microsd|cf card|memory card/ with a SPACE, so the underscore form misses) → returns 'other'; for 'head_stack' the branch /head\s*stack/ requires whitespace/none between 'head' and 'stack' — an underscore is not \s — → returns 'other'. All other family keys round-trip correctly (hdd, ssd, nvme, usb_flash, mobile, raid, nas, pcb all match a heuristic branch). So exactly these two families collapse to 'other'. REGISTRY (deviceFieldConfig.ts): other.technical = [madeIn, firmware, encryption, fileSystem] (line 201), vs memory_card = [controller, firmware, partNumber] (175) and head_stack = [headMap, heads, preAmp, compatibleModels] (197). getDonorParts('other') = [] (donorParts.ts line 72). The same broken call is repeated in the edit-mode hydrate at line 294-296 and in InventoryDetailModal.tsx:654 (verified).

**Failure scenario:** Creating a 'Head Stack' donor (family='head_stack'): family resolves to 'other', so the Technical section renders Made In/Firmware/Encryption/File System instead of Head Map/Heads/Preamp/Compatible Models, and getDonorParts('other')=[] means the 'Donor Parts Available' checkboxes (R/W Heads, Preamp) never render. Worse on EDIT: at line 294 itemFamily='other', so hydrateInventorySpecs('other', td) reads only the 4 'other' keys and never loads the stored head_stack keys into the form; on Save handleSubmit computes serializeInventorySpecs(family='other', form) (line 380) which emits only the 'other' keys — overwriting technical_details and silently DROPPING the original {physical_head_map, head_count_id, pre_amp, compatible_models}; simultaneously getDonorParts('other')=[] makes partsToSave=[] so setItemDonorParts(id, []) (line 434) soft-deletes every recorded donor part. The donor's forensic spec + parts data is wiped just by opening and saving the edit form.

**Suggested fix:** The family column IS a DeviceFamily key — use it directly: `if (dt?.family) return dt.family as DeviceFamily;` and only fall back to resolveDeviceFamily(dt.name) when family is null. Apply the same at InventoryItemWizard.tsx:294-296 (use the raw `family` field) and InventoryDetailModal.tsx:654.

**Verifier note:** Independently reproduced by executing the exact heuristic regexes in deviceFamily.ts against the underscore keys and confirming the migration stores those keys. Full save-path data-loss traced through handleSubmit (lines 380 and 426-437). Strongest of the four; genuine forensic data loss.

---

### 5. PhoneInput country search cannot type spaces and mis-selects on Space (missing listbox Space guard)

- **File:** `src/components/ui/PhoneInput.tsx:314`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** PhoneInput binds the shared useListboxKeyboard handler directly to its country-search input (onKeyDown={onKeyDown} at PhoneInput.tsx:314) with no Space-key guard. In src/hooks/useListboxKeyboard.ts the combined `case 'Enter': case ' ':` branch (lines 84-96) calls e.preventDefault() unconditionally at line 86; when the panel is open and activeIndex >= 0 it runs onSelect(activeIndex) and, in single-select mode, onClose(). PhoneInput does not pass `multiple` to the hook (lines 163-176), so it is single-select. The two sibling search-enabled consumers guard this exact case first: SearchableSelect.tsx:204 and MultiSelectDropdown.tsx:176 both do `if (e.key === ' ') return;` before delegating; PhoneInput is the only consumer missing it.

**Failure scenario:** The dial-code dropdown's search filters on country name via c.name.toLowerCase().includes(term) (PhoneInput.tsx:149). (1) The moment the user presses the space bar while typing a multi-word country (e.g. 'Saudi Arabia', 'United States'), the hook calls preventDefault on the space keydown, so the space character never reaches the input's onChange and can never enter searchTerm — the query is stuck at the first word. (2) Worse: if the user had pressed ArrowDown first (activeIndex >= 0), pressing Space runs onSelect(activeIndex) and closes the panel (useListboxKeyboard.ts:91-93), committing the highlighted dial code to the customer's phone value via handleDialCodeSelect instead of typing a space.

**Suggested fix:** Wrap the input handler to let literal spaces through, matching the other two consumers: onKeyDown={(e) => { if (e.key === ' ') return; onKeyDown(e); }} at PhoneInput.tsx:314.

**Verifier note:** Independently reproduced. PhoneInput.tsx:314 uses the bare `onKeyDown={onKeyDown}`; the hook's Space branch (src/hooks/useListboxKeyboard.ts:84-96, actual path — candidate's inline path was relative but line numbers are exact) preventDefaults Space and, in single mode (no `multiple` passed at lines 163-176), selects+closes. Siblings guard at SearchableSelect.tsx:204 and MultiSelectDropdown.tsx:176 exactly as described. Both failure modes hold in current code.

---

### 6. logAuditTrail ignores the { error } returned by supabase.rpc — DB/RLS audit failures silently swallowed

- **File:** `src/lib/auditTrailService.ts:6`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** error-swallowing

**What's wrong:** logAuditTrail (src/lib/auditTrailService.ts:4-17) does `await supabase.rpc('log_audit_trail', {...})` without destructuring or checking the returned `{ error }`. supabase-js/postgrest-js does NOT reject the promise on Postgres-level failures (RLS WITH CHECK denial, NOT-NULL/constraint violation, function exception) — it resolves with { data: null, error }. Because the result is discarded, the try/catch only catches genuine network/JS exceptions; any database-level audit failure resolves as success. This directly contradicts the function's fail-closed intent (its catch re-throws). The underlying RPC log_audit_trail (baseline L5819-5829) does `INSERT INTO audit_trails(tenant_id, ...) VALUES (get_current_tenant_id(), ...)` where audit_trails.tenant_id is NOT NULL and the table carries RESTRICTIVE tenant-isolation RLS — both are Postgres-level errors returned in `error`, not thrown. Callers across financial/customer mutations depend on this (quotesService, invoiceService, paymentsService, receiptsService, advanceVoucherService, customerService).

**Failure scenario:** A user whose profile is inactive or otherwise causes get_current_tenant_id() to return NULL creates an invoice; invoiceService calls logAuditTrail('create','invoices',...). The RPC's INSERT violates NOT NULL on audit_trails.tenant_id (or the RLS WITH CHECK), and supabase.rpc resolves with { error }. logAuditTrail ignores the error and returns normally, so the invoice mutation reports full success with NO audit_trails row written and no error surfaced — an invisible forensic/legal audit gap on a data-recovery platform where audit integrity is load-bearing.

**Suggested fix:** Destructure and check the result: `const { error } = await supabase.rpc('log_audit_trail', {...}); if (error) { logger.error('Audit trail logging failed:', error); throw new Error(`Audit trail logging failed: ${error.message}`); }`. Mirror the pattern already used in gdprService (const { error } = await supabase.rpc(...); if (error) throw error).

**Verifier note:** CONFIRMED by reading the function verbatim (L4-17) and the RPC body (baseline L5819-5829). The postgrest-js resolve-with-error (not throw) behavior is standard and is exactly what the surrounding gdprService/invoiceService code assumes elsewhere by checking `error`. The bug is self-contained in the service function regardless of which specific DB error triggers it; the NULL-tenant scenario is one concrete trigger, RLS denial is another.

---

### 7. Banking 'Record Receipt' marks the invoice paid but never credits any account or posts to the ledger — cash/revenue silently vanish

- **File:** `src/lib/bankingService.ts:1032`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-integrity

**What's wrong:** bankingService.createReceiptWithAllocations (971-1046), the function behind the Banking page's 'Record Receipt' button (BankingPage.tsx:237-240 -> RecordReceiptModal -> createReceiptMutation at BankingPage.tsx:134-140, which calls bankingService.createReceiptWithAllocations at line 137), inserts a payment_receipts row, inserts receipt_allocations, and updates each invoice's amount_paid/balance_due/status (1019-1042). It does NOTHING to the cash/ledger side: it never inserts a bank_transactions or financial_transactions row and never calls updateAccountBalance/adjust_account_balance. The receiptInsert object (984-993) does not include any account/bank_account column, so the selected 'Deposit to account' is dropped entirely and no account balance is credited. The same file proves the module's own pattern: createDisbursement debits the account via updateAccountBalance(...,'debit') (line 475). The parallel receiptsService.createReceiptWithAllocations routes through the atomic RPC create_receipt_with_allocations whose docstring (receiptsService.ts:22-31) states it owns the invoice recompute AND 'the single append-only income posting to financial_transactions' — and here the invoice recompute is done client-side in a loop (1019-1042), proving no DB trigger performs the ledger/invoice side automatically (a trigger would double-count amount_paid). Since account_id is never persisted on payment_receipts, no trigger could credit the chosen account either.

**Failure scenario:** An accountant opens Banking -> Record Receipt, enters 1,000, selects 'Main Checking' as the deposit account (required by the modal, RecordReceiptModal.tsx:443-461 / canSubmit line 250), allocates 1,000 to invoice INV-100, and submits. INV-100.balance_due drops by 1,000 and status becomes 'paid', but Main Checking's current_balance is unchanged, no bank_transactions/financial_transactions row exists, and the Total Balance / Cash-Flow / P&L reports (which read financial_transactions) never see the 1,000. The books show the invoice collected while the matching cash and revenue are missing. Recording the same receipt from the Invoice page (receiptsService RPC path) WOULD have credited the account and posted income — so the financial outcome depends on which screen was used.

**Suggested fix:** Route the Banking receipt flow through the same atomic create_receipt_with_allocations RPC that receiptsService uses (passing bank_account_id) so invoice recompute, bank-account balance credit, and the append-only income posting happen in one transaction. Do not present a receipt as recorded while the cash/ledger side is skipped.

**Verifier note:** Independently reproduced by reading createReceiptWithAllocations (971-1046): only payment_receipts + receipt_allocations inserts and per-invoice updates; no ledger/account write; receiptInsert (984-993) omits account_id. The account-credit half is definitively broken (no account reference persisted, no updateAccountBalance call), which alone matches the failure scenario. Cross-checked against createDisbursement (line 475 credits/debits) and receiptsService RPC docstring; client-side invoice recompute loop rules out a compensating DB trigger. High severity for money integrity is correct. Line kept at 1032 (invoice-only mutation inside the function whose ledger counterpart is absent).

---

### 8. Imported case-history (statusHistory) events are stamped with import time, not their original timestamp

- **File:** `src/lib/dataMigration/workbookContract.ts:673`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** field-mapping-mismatch

**What's wrong:** The statusHistory entity's timestamp column is defined with key `created_at` and header 'Performed At' (workbookContract.ts:673). parseWorkbook builds headerToKey from ENTITY_COLUMNS (workbookParser.ts:84-99), so the 'Performed At' cell is delivered to the RPC under the JSON key `created_at`; no `performed_at` key ever exists on the parsed row. But the import RPC's statusHistory branch reads the timestamp from a DIFFERENT key: case_job_history.created_at := COALESCE((v_row->>'performed_at')::timestamptz, now()) (20260630222509_data_migration_import_dedup.sql:300). Because `performed_at` is always absent, the COALESCE always falls back to now(). The resume migration (20260630225429, comment line 22) explicitly leaves import_batch unchanged, so the dedup migration is the live definition. The export RPC emits a `performed_at` key (line 337) but buildWorkbook only writes ENTITY_COLUMNS keys, so an export->re-import round trip also loses it. Secondary: the INSERT column list (line 297) omits `details`, so the contract's `details` key is silently dropped even though case_job_history has a details column (used at finalize line 146). case_job_history is append-only/forensic, so this rewrites the chronology of every migrated case.

**Failure scenario:** Operator fills the Case Records StatusHistory sheet with a 2019-05-01 status change in the 'Performed At' column and imports on 2026-07-12. parseWorkbook maps 'Performed At' -> key `created_at`; the RPC reads `performed_at` (absent) -> NULL -> now(). The row lands in case_job_history with created_at = 2026-07-12 instead of 2019-05-01. Every imported history event collapses to the import instant, destroying the forensic timeline in an append-only table.

**Suggested fix:** Make the key consistent: rename the statusHistory timestamp key in ENTITY_COLUMNS from `created_at` to `performed_at` (matching the import and export RPCs), or change the import RPC to COALESCE((v_row->>'created_at')::timestamptz, (v_row->>'performed_at')::timestamptz, now()). Also add `details` to the case_job_history INSERT column list so the contract's details value is not dropped.

**Verifier note:** Independently reproduced. Traced header->key in parseWorkbook (workbookParser.ts:82-99): 'Performed At' -> `created_at`, so no `performed_at` key is present. Confirmed import RPC line 300 reads `performed_at` and the resume migration (line 22) leaves import_batch unchanged, making 20260630222509 the current definition. Also confirmed INSERT at line 297 omits `details`. Timestamp always falls back to now(). High severity appropriate for an append-only forensic table.

---

### 9. generateAgedReceivablesReport counts proforma invoices as receivables (no invoice_type filter)

- **File:** `src/lib/financialReportsService.ts:179`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-aggregation

**What's wrong:** The aging query (lines 167-179) filters .gt('balance_due', 0), deleted_at IS NULL, and .in('status', ['sent','partial','overdue']) but has no invoice_type filter. A proforma is a pre-bill, not accounts-receivable — the canonical financialMath.isReceivableInvoice restricts receivables to invoice_type='tax_invoice'. Because createInvoice sets a proforma's balance_due = total_amount (line 497) and payments are blocked on proformas (invoiceService.recordPayment lines 1024-1026), a sent proforma reliably has status='sent' and balance_due=total_amount > 0, so it matches the query and is bucketed and added to totals.total as money owed.

**Failure scenario:** A customer is sent proforma PRO-200 for $630 (status 'sent', balance_due $630, unpaid) and hasn't approved. generateAgedReceivablesReport places $630 into an aging bucket and into totals.total, overstating AR / collections exposure for a document that legally owes nothing yet.

**Suggested fix:** Add .eq('invoice_type','tax_invoice') to the query so only real tax invoices are aged, matching isReceivableInvoice and the case-detail Financial Summary.

**Verifier note:** Primary claim CONFIRMED: an un-converted sent proforma (balance_due=total_amount, status 'sent') matches the query and is counted as AR. NOTE: the candidate's secondary 'double-count with the tax invoice after conversion' sub-claim is INACCURATE — a converted proforma has status='converted', which is NOT in ['sent','partial','overdue'], so it is excluded post-conversion and only the tax invoice ages. The core overstatement bug still holds, hence CONFIRMED.

---

### 10. generateInvoiceSummaryReport totals double-count proforma + converted tax invoices (no invoice_type filter)

- **File:** `src/lib/financialReportsService.ts:344`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-aggregation

**What's wrong:** The invoices query (lines 308-313) applies only .is('deleted_at', null) with no invoice_type or status restriction, then totals.invoiced (line 344) sums baseAmount(total_amount) and totals.outstanding (line 346) sums baseAmount(balance_due) across every returned row — proforma AND tax invoice. createInvoice sets a proforma's balance_due = total_amount (line 497) and honours the caller status (line 490). The conversion RPC (add_convert_proforma_invoice_to_tax_invoice_rpc) only flips the proforma to status='converted' and stamps converted_to_invoice_id — it does NOT soft-delete it or zero its total_amount/balance_due — while inserting a linked tax invoice with the SAME total and balance_due=total. Both rows survive the report's deleted_at-only filter and are summed. The codebase's own isReceivableInvoice / RECEIVABLE_INVOICE_EXCLUDED_STATUSES doctrine and the sibling generateRevenueByCaseReport (line 424-426) already restrict to tax_invoice for exactly this reason; this report was not fixed.

**Failure scenario:** A lab issues proforma PRO-100 for $630 (balance_due $630), then converts it to tax invoice INVO-100 for $630 (balance_due $630); both fall in the report window. generateInvoiceSummaryReport returns totals.invoiced = $1,260 and totals.outstanding = $1,260, which ReportsDashboard.tsx renders on the Invoice Summary cards (lines 740, 748) where the correct figure is $630. A standalone un-converted sent proforma likewise inflates both totals even though it owes nothing yet.

**Suggested fix:** Restrict the money totals (or the query) to receivable tax invoices — add .eq('invoice_type','tax_invoice') and exclude void/cancelled, mirroring isReceivableInvoice / generateRevenueByCaseReport — while keeping the byType breakdown over all invoice types.

**Verifier note:** Independently reproduced: query has no invoice_type/status filter; proforma persists post-conversion with total_amount and balance_due intact (per migration manifest 20260608070059/20260610094542), and createInvoice line 497 sets proforma balance_due=total_amount. Totals are user-facing (ReportsDashboard lines 740/748 confirmed). Confirmed.

---

### 11. DLQ flags every successfully-delivered in-app-only notification as unprocessed/stuck forever

- **File:** `src/lib/notificationDLQService.ts:87`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The DLQ treats `processed_at IS NULL` as the proxy for 'event not dispatched' in three places: getDLQStats unprocessed count (line 49), getDLQStats stuck long-running count (lines 59-61), and getDLQEvents' `.or(...and(processed_at.is.null,occurred_at.lt.${stuckCutoff}))` (line 87), plus the derived is_unprocessed/is_stuck flags (lines 148-150). But `processed_at` on notification_events is written by exactly one code path — the notification-dispatch-email edge function (supabase/functions/notification-dispatch-email/index.ts:248), verified as the sole writer by grep (paypal-webhook writes processed_at on a different table). Two migrations confirm the dispatch topology: 20260525062411 makes the in-app AFTER-INSERT trigger (dispatch_notification_event_in_app) render templates and write notification_log WITHOUT touching processed_at, and 20260525082709 makes the email-dispatch trigger call the edge function 'only when email subscriptions exist.' Migration 20260525062333 bulk-subscribes every staff user to case.phase_changed on the in_app channel only. Therefore the default staff case-phase-change event has no email subscriber, never invokes the edge function, and keeps processed_at NULL permanently despite being fully and correctly delivered in-app. The forcing argument also holds: if the in-app trigger set processed_at, the edge function's NULL-guarded claim (index.ts:246-253) would always miss and email would never send.

**Failure scenario:** A tenant using the seeded default (staff subscribed to case.phase_changed on in_app only). A case status change emits case.phase_changed with no email subscriber; the in-app notification is delivered correctly (notification_log row written, badge updates) but processed_at stays NULL. After 5 minutes getDLQEvents surfaces the event as 'stuck'; it is always counted in getDLQStats.unprocessed and after 1h in stuckLongRunning. Because these events are never reprocessed, the counters grow without bound and the DLQ event list is flooded with successfully-delivered notifications, making the platform DLQ monitoring surface non-functional and burying genuine failed email deliveries.

**Suggested fix:** Stop equating processed_at IS NULL with 'undelivered.' Only consider events actually routed to the email path — e.g. restrict the unprocessed/stuck queries to events that have (or should have) an email notification_log row and whose email delivery failed/absent, or track a real per-channel dispatch state instead of overloading the email-only processed_at column.

**Verifier note:** CONFIRMED. Grep shows notification-dispatch-email/index.ts:248 is the only writer of processed_at on notification_events. Manifest entries 20260525062333/062411/082709 confirm: staff default-subscribed in_app-only, in-app trigger writes notification_log (not processed_at), email trigger fires edge fn only when email subs exist. Lines 49/59-61/87/148-150 all use processed_at IS NULL. Severity kept high: the defect permanently and unboundedly defeats an operational safety/monitoring feature and hides real dead-letter failures.

---

### 12. Invoice PDF line totals hardcode 2-decimal rounding, breaking display + Subtotal reconciliation for 3-decimal currencies (OMR/KWD/BHD/JOD)

- **File:** `src/lib/pdf/dataFetcher.ts:269`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-rounding

**What's wrong:** toInvoiceItems recomputes each invoice line's tax-exclusive net as roundMoney(quantity * unit_price * (1 - discountPct/100)) with roundMoney's DEFAULT decimalPlaces of 2 (financialMath.ts:15). It is called at dataFetcher.ts:924 with no decimalPlaces argument, even though the currency config is available at the call site (cfg.currency, fetchInvoiceDetails line 917). The invoice create path stores each line's total and the header subtotal at the currency's decimal places (invoiceService.ts:550, roundMoney(..., rc.documentDecimals) = 3 for OMR/KWD/BHD/JOD), and the engine adapter formats both the per-line lineTotal (invoiceAdapter.ts:211, money(item.line_total)) and the stored subtotal (invoiceAdapter.ts:246, money(subtotal)) at the currency's decimal places (invoiceAdapter.ts:75). So for any 3-decimal currency the per-line amount is rounded to 2 decimals then displayed at 3, the per-line figure is wrong, and the summed line nets no longer equal the stored/printed Subtotal — defeating the reconciliation the code comment (lines 238-241) claims. Correction to the original claim: JPY/KRW (0 decimals) do NOT manifest in practice — their amounts are integers, so roundMoney(x,2) is a no-op and money() at 0 decimals still prints the integer; the defect is specific to 3-decimal currencies. Quotes/credit-notes carry the stored total (no recompute) and are unaffected.

**Failure scenario:** OMR tenant (3 decimal places). Invoice with two line items, each qty=1, unit_price=10.125 OMR, no discount. invoiceService stores each line net and the subtotal at 3 decimals (10.125 and 20.250). The PDF recomputes each line as roundMoney(1*10.125, 2) = 10.13 and money() formats it at 3 decimals as '10.130'; the two lines print 10.130 + 10.130 = 20.260 while the Subtotal, formatted from the stored 20.250, prints '20.250'. The invoice shows wrong per-line amounts and the line items visibly fail to sum to the Subtotal.

**Suggested fix:** Thread the currency's decimal places into the recompute: change toInvoiceItems(rows) to toInvoiceItems(rows, decimalPlaces) and use roundMoney(quantity * unit_price * (1 - discountPct/100), decimalPlaces); pass cfg.currency.decimalPlaces from fetchInvoiceDetails at dataFetcher.ts:924.

**Verifier note:** Independently traced generateInvoiceAsBlob -> fetchInvoiceData (722) -> fetchInvoiceDetails (846) -> toInvoiceItems(items) at 924 (no decimals arg) -> toInvoiceData maps to invoice_line_items (717) -> adapter money() at 3-decimal precision (75) for both lineTotal (211) and subtotal (246). roundMoney default = 2 confirmed (financialMath.ts:15). Stored subtotal/line total at documentDecimals confirmed (invoiceService.ts:550). Bug holds for 3-decimal currencies; original JPY/KRW claim does not manifest (integer amounts), so blast radius narrowed to OMR/KWD/BHD/JOD. Severity high retained: customer-facing wrong amounts + non-reconciling subtotal on GCC-currency invoices.

---

### 13. Platform dashboard MRR & ARR are always $0 (billing_interval value mismatch)

- **File:** `src/lib/platformAdminService.ts:70`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** getDashboardStats computes MRR by querying tenant_subscriptions with .eq('billing_interval','monthly') (line 70) and ARR with .eq('billing_interval','annual') (line 76). billing_interval is CHECK-constrained to only 'month'|'year' (baseline_schema.sql:4081), defaults to 'month' (line 3527), and is always written as 'month'/'year' (paypal-create-subscription/index.ts:56,257). The literals 'monthly'/'annual' can never match a row, so mrrCalc/annualCalc reduce over empty arrays and both mrr and annualMrr are 0.

**Failure scenario:** A platform with active paid monthly and annual subscriptions opens Platform Overview. getDashboardStats returns mrr:0, arr:0, so the 'Monthly Recurring Revenue' and 'Annual Recurring Revenue' StatCards (PlatformDashboard.tsx:96-107) both render $0 regardless of actual subscription revenue — the two headline platform revenue metrics are permanently wrong.

**Suggested fix:** Change .eq('billing_interval','monthly') to 'month' (line 70) and .eq('billing_interval','annual') to 'year' (line 76), matching the correct value set already used in billingService.ts:657.

**Verifier note:** Independently reproduced. CHECK constraint (schema:4081) allows only month/year; PayPal edge fn writes 'month'|'year'; billingService.ts:657 correctly compares 'year'. Both dashboard StatCards read the always-zero values. Severity high retained — prominent money metric, always wrong.

---

### 14. Timesheet list and monthly summary include soft-deleted rows

- **File:** `src/lib/timesheetService.ts:48`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** missing-soft-delete-filter

**What's wrong:** getTimesheets (query built at 48-79) and getMonthlySummary (query at 241-249, aggregated 271-282) both read `timesheets` with no `.is('deleted_at', null)`. Since deleteTimesheet (line 123) soft-deletes, deleted entries keep appearing in the list UI and keep summing into each employee's totalHours / billableHours / totalDays in the monthly summary.

**Failure scenario:** A user deletes a timesheet entry. It remains visible in the timesheet list (getTimesheets returns it) and its hours are still summed into that employee's monthly totalHours and billableHours (getMonthlySummary), so a 'deleted' entry is never removed from any view or report.

**Suggested fix:** Add `.is('deleted_at', null)` to the getTimesheets query (line 48) and the getMonthlySummary query (line 241).

**Verifier note:** Confirmed against current code: neither query chain filters deleted_at, and no view/RLS excludes deleted rows (table queried directly). Distinct from candidate 1 (different functions/read paths). Always manifests once a row is deleted.

---

### 15. Timesheet reads never filter deleted_at — soft-deleted entries stay visible and inflate hour/billable KPIs

- **File:** `src/lib/timesheetService.ts:54`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** soft-delete-aggregation

**What's wrong:** deleteTimesheet (timesheetService.ts:123) is a soft delete (sets deleted_at). But getTimesheets (48-84), getTimesheetById (87-97), getTimesheetStats (203-220) and getMonthlySummary (241-256) never apply .is('deleted_at', null). RLS scopes only tenant_id in this codebase (leaveService filters deleted_at explicitly at 59/83/151/184/350-366, confirming reads otherwise return soft-deleted rows). So soft-deleted timesheets are still returned and summed. TimesheetManagement.tsx feeds getTimesheets into weekMap hour-summing (line 448) and the entries list, and getTimesheetStats into the KPI row, with no client-side deleted_at filter (the .is('deleted_at', null) at TimesheetManagement.tsx:402 is an unrelated employees lookup).

**Failure scenario:** A user creates an 8h billable draft entry for this week, then deletes it. deleteTimesheet sets deleted_at, but on the next refresh getTimesheets still returns the row, so it reappears in the Timesheet Entries table and its 8h still shows in the Current Week Overview (weekMap). getTimesheetStats still adds the 8h into Total Hours This Week and Billable Hours This Month and still counts the row in Total Entries — the delete has no observable effect and billable-hour totals are overstated.

**Suggested fix:** Add .is('deleted_at', null) to the queries in getTimesheets, getTimesheetById, both aggregate queries in getTimesheetStats, and getMonthlySummary, mirroring the filter already applied throughout leaveService.

**Verifier note:** Verified timesheets.deleted_at exists in the generated Row type and deleteTimesheet sets it (line 123). None of the four read/aggregate functions filter it. Confirmed the consuming page (TimesheetManagement.tsx:376-451) sums t.hours per work_date in weekMap and shows the entries list without filtering deleted rows; the sole deleted_at filter on line 402 targets a separate employees query. CONFIRMED. Severity high is defensible: delete is a functional no-op and billable-hour money KPIs are overstated.

---

### 16. Timesheet 'this month' billable-hours window shifts a day earlier under UTC+ timezones

- **File:** `src/lib/timesheetService.ts:195`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** timezone-off-by-one

**What's wrong:** getTimesheetStats() builds the month window with new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] (line 191) and new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0] (line 195). Both construct LOCAL midnight then serialize via toISOString(), which rolls back one calendar day for any UTC+ browser. The strings are compared to the plain-date work_date column (lines 213/214). Notably the adjacent week window (lines 198/201) was deliberately moved to date-fns local format() with a comment saying so, but the month lines were left on the toISOString path — the fix was applied to one window and not the other.

**Failure scenario:** Browser TZ Asia/Dubai (UTC+4), July 2026. new Date(2026,6,1) local-midnight -> '2026-06-30'; new Date(2026,7,0) (July 31 local midnight) -> '2026-07-30'. billableHoursThisMonth then includes timesheets dated 2026-06-30 (wrong month) and excludes every timesheet dated 2026-07-31, so the KPI is wrong on both ends.

**Suggested fix:** Compute bounds with local-date formatting like the week window: format(startOfMonth(now),'yyyy-MM-dd') / format(endOfMonth(now),'yyyy-MM-dd'), never new Date(y,m,d).toISOString().split('T')[0].

**Verifier note:** Read lines 189-231. Confirmed lines 191 and 195 use the buggy toISOString path while lines 198/201 use date-fns local format; the code comment at 199-200 explicitly states the week bound is local 'to match startOfWeekIso', so the month lines are a genuine untreated leftover. Cited line 195 is correct (191 is the sibling).

---

### 17. Timesheet KPI stats count soft-deleted timesheets (no deleted_at filter)

- **File:** `src/lib/timesheetService.ts:203`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** missing-soft-delete-filter

**What's wrong:** getTimesheetStats runs four aggregate queries in the Promise.all (totalEntries count line 204, pendingReview count line 205-208, billableHoursThisMonth line 209-214, totalHoursThisWeek line 215-219). None add `.is('deleted_at', null)`. deleteTimesheet (line 123) is a soft delete that only sets `deleted_at` and leaves the row present, so deleted timesheets keep contributing to every KPI. Verified the `timesheets` table exposes a nullable `deleted_at` column and that timesheetService.ts is the only reader of the table (via the TimesheetManagement page).

**Failure scenario:** An employee logs an 8h billable July entry; a manager deletes it via deleteTimesheet (deleted_at=now, row retained). getTimesheetStats still counts the row in totalEntries and still adds the 8h into billableHoursThisMonth (and totalHoursThisWeek if in-week), so the HR dashboard and any hours reporting overstate worked/billable hours by every deleted entry.

**Suggested fix:** Add `.is('deleted_at', null)` to all four queries inside the Promise.all in getTimesheetStats.

**Verifier note:** Independently reproduced: soft-delete sets deleted_at (line 123) but the four aggregate queries at 203-220 have no deleted_at predicate; column confirmed nullable in database.types.ts. Always manifests once any timesheet is deleted (not conditional on an error). Severity high retained.

---

### 18. Monthly timesheet summary drops the last day of the month for UTC+ tenants

- **File:** `src/lib/timesheetService.ts:239`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** timezone-off-by-one

**What's wrong:** getMonthlySummary(year, month) computes startDate = new Date(year, month-1, 1).toISOString().split('T')[0] (line 238) and endDate = new Date(year, month, 0).toISOString().split('T')[0] (line 239) — the same local-midnight-to-UTC shift — then queries .gte('work_date', startDate).lte('work_date', endDate) (lines 247-248) against the date column work_date.

**Failure scenario:** Browser TZ Asia/Dubai (UTC+4), getMonthlySummary(2026, 7): startDate resolves to '2026-06-30' and endDate to '2026-07-30'. The July per-employee summary omits every entry dated 2026-07-31 and folds in entries dated 2026-06-30, corrupting the hour totals it produces.

**Suggested fix:** Build the strings via a UTC construction with getUTC* extraction, or via date-fns local format(...,'yyyy-MM-dd'), so the emitted date matches the intended calendar day.

**Verifier note:** Read lines 233-249. Confirmed lines 238-239 use the toISOString().split path and feed the [gte,lte] work_date query. Same class as finding #1; cited line 239 correct.

---

### 19. Case Custody audit feed uses the disabled system-audit query's count and empty-state, mis-paginating and hiding custody events

- **File:** `src/pages/admin/AuditTrails.tsx:210`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** pagination

**What's wrong:** The audit_trails useQuery is enabled only when scope === 'system' (line 59). When the admin selects 'Case Custody', the table swaps to <AuditCustodyFeed> (line 209), but the page continues to derive total (line 105), loading (line 211), and isEmpty (line 212) solely from the now-disabled system-audit query, whose cached data is retained by React Query. AuditCustodyFeed (src/components/cases/AuditCustodyFeed.tsx line 13) destructures onPageChange as _onPageChange (unused), renders no pager of its own, and reads only data?.rows — discarding the accurate {rows,total} that fetchCustodyFeed returns. It relies entirely on the parent Pager (line 210), which is fed the system-audit count. ListPageTemplate (src/components/templates/ListPageTemplate.tsx line 61) renders `empty` INSTEAD of `table` whenever isEmpty is true, and feeds the Pager the parent total at line 66. Result: the custody feed's page count is always the system-audit row count, and isEmpty reflects system-audit rows, never custody rows.

**Failure scenario:** Scenario A (mis-pagination): a tenant has 200 custody ledger events and 20 system audit_trails rows (pageSize 50). Admin opens Audit Trails (scope='system', total=20 cached), then clicks 'Case Custody'. The system query is disabled but its cached total=20 remains, so the Pager shows 1 page and custody events 51-200 are unreachable. Scenario B (hidden events): a tenant has custody events but 0 system audit_trails rows for the active filter. On load the system query returns rows=[]/total=0, so trails.length===0 makes isEmpty=true. Switching to 'Case Custody' leaves isEmpty true (still driven by the empty system data), so ListPageTemplate line 61 renders 'No audit trails found' instead of AuditCustodyFeed — hiding all custody events entirely.

**Suggested fix:** Drive total, loading, and isEmpty from the active scope. When scope==='custody', source count/rows/loading from the custody feed query (lift fetchCustodyFeed's {rows,total} to the page, or have AuditCustodyFeed report its total up) and pass that to the Pager and isEmpty; only use the audit_trails query's values when scope==='system'.

**Verifier note:** Independently reproduced. AuditCustodyFeed line 13 confirms onPageChange is renamed _onPageChange and unused and it has no pager; it reads only data?.rows (line 20), discarding total. ListPageTemplate line 61 confirms isEmpty suppresses the table, and line 66 confirms the Pager gets the parent total. enabled:false retains cached data so total stays at the last system value. Both sub-scenarios hold in current code.

---

### 20. Re-allocating a leave balance wipes already-consumed used_days to 0

- **File:** `src/pages/employee-management/LeaveManagement.tsx:469`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** data-corruption

**What's wrong:** AllocateBalanceModal.handleSubmit (LeaveManagement.tsx:463-471) always calls leaveService.upsertLeaveBalance with hardcoded used_days: 0 and remaining_days: form.total_days. upsertLeaveBalance (leaveService.ts:310-319) upserts with onConflict 'employee_id,leave_type_id,year', so for an EXISTING balance row the operation UPDATES that row, overwriting used_days and remaining_days. Approvals increment used_days via adjustLeaveBalanceUsage (leaveService.ts:70-97), and the Balances tab (LeaveManagement.tsx:975-1020) is a read-only table with no per-row edit action; leaveService.updateLeaveBalance (leaveService.ts:321) has no caller anywhere in src/. Therefore the only way to change an allocation is this Allocate flow, which destroys the consumed-days tally. adjustLeaveBalanceUsage floors reversals at Math.max(0, ...), so a later reject/delete cannot recover the lost days.

**Failure scenario:** Employee's 2026 annual-leave balance is total_days=20, used_days=5 (from an approved 5-day request), remaining_days=15. An admin opens Allocate Balance, picks the same employee + leave type + year 2026, sets Days Allocated to 25 and submits. The upsert hits the existing row via onConflict and writes used_days=0, remaining_days=25. The 5 consumed days vanish; the employee appears to have the full 25 days available despite an approved leave still on record. If that leave is later rejected/deleted, adjustLeaveBalanceUsage computes Math.max(0, 0 - 5) = 0 and remaining stays 25, permanently desynchronizing the ledger.

**Suggested fix:** Do not reset consumed days on re-allocation. Add an explicit edit-balance path that routes through leaveService.updateLeaveBalance changing only total_days and recomputing remaining_days = total_days - existing.used_days; or in upsertLeaveBalance fetch existing used_days and preserve it (exclude used_days/remaining_days from the conflict update, or set remaining_days = total_days - existing_used_days).

**Verifier note:** Verified: onConflict target on (employee_id,leave_type_id,year) means an existing row is UPDATED; used_days:0 and remaining_days:form.total_days are hardcoded at LeaveManagement.tsx:469-470. Confirmed via grep that updateLeaveBalance has zero callers and the Balances tab renders a read-only table with no edit button, so Allocate is the sole mutation path. adjustLeaveBalanceUsage Math.max(0,...) at leaveService.ts:87 confirms reversals cannot restore the wiped total. CONFIRMED.

---

### 21. Invoice currency selection is silently dropped on save — foreign-currency invoice is booked in the tenant base currency

- **File:** `src/pages/financial/InvoicesListPage.tsx:434`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-correctness

**What's wrong:** InvoiceFormModal keeps `currency` in its state (default baseCurrency, changed via the `<select>` rendered when currencies.length > 1, line 768-782) and includes it in the payload it hands to onSave via `...invoiceData` (InvoiceFormModal.tsx line 526). But every invoice save handler builds an explicit field object and never forwards `currency`: createInvoice here (lines 434-452), updateInvoice here (lines 413-432), and updateInvoice in InvoiceDetailPage.tsx (lines 619-641). Because `invoice.currency` is undefined, createInvoice's resolveRateContext(invoice.currency,…) (invoiceService.ts:443) falls back to base currency at rate 1 (currencyService.ts:143 `documentCurrency || baseCurrency`), and pickInvoicePersistFields only sets currency when defined (invoiceService.ts:176). On the update path, currencyChanged is false because invoice.currency is undefined (invoiceService.ts:657), so a draft's currency change is also ignored.

**Failure scenario:** Multi-currency tenant (base USD). User creates an invoice for a foreign customer, picks EUR in the currency dropdown, enters lines totalling €1,000 (modal summary shows €1,000). On save, currency is not forwarded, so createInvoice resolves to USD at rate 1 and stores the invoice as 1,000 USD with USD *_base amounts. The booked document is the wrong currency and the customer is billed the wrong amount. Editing a draft invoice's currency is likewise ignored.

**Suggested fix:** Forward `currency: invoicePayload.currency` in all three save handlers (InvoicesListPage createInvoice + updateInvoice, InvoiceDetailPage updateInvoice) so the service resolves the chosen document currency and rate.

**Verifier note:** Independently reproduced: read all three handlers (they enumerate fields and omit currency), confirmed the modal emits currency via `...invoiceData`, confirmed resolveRateContext defaults undefined→base at rate 1, and confirmed the multi-currency select is functional. Bug holds in current code.

---

### 22. Quote currency selection is ignored on create — hardcoded to tenant base instead of the picked currency

- **File:** `src/pages/quotes/QuotesListPage.tsx:759`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** money-correctness

**What's wrong:** The quote create branch sets newQuote.currency to `currencyConfig.code` (the tenant base currency from useCurrencyConfig, line 61) instead of the user-selected `quoteData.currency`, which is present on the onSave payload via `...quoteData` (QuoteFormModal.tsx:402) and driven by a functional currency `<select>` shown when currencies.length > 1 (QuoteFormModal.tsx:551-564). createQuote then resolves the rate against the base currency, so the persisted currency, exchange rate, totals, and *_base snapshot are all in base currency.

**Failure scenario:** Multi-currency tenant (base USD). User creates a quote, selects EUR, modal summary shows €1,000. On save the quote is persisted with currency = USD (currencyConfig.code) at rate 1, so the stored/PDF quote total is 1,000 USD, not €1,000 — a mismatch versus what the user selected and saw.

**Suggested fix:** Use the modal's selected value: `currency: typeof quoteData.currency === 'string' && quoteData.currency ? quoteData.currency : (typeof currencyConfig.code === 'string' ? currencyConfig.code : undefined)`.

**Verifier note:** Confirmed line 759 hardcodes currencyConfig.code; confirmed quoteData.currency is available on the payload and the picker is functional; confirmed createQuote/resolveRateContext consume quote.currency. The base-currency override defeats the user selection on multi-currency tenants.

---

### 23. All in-page stock navigations point to /resources/stock/* which no route matches → 404

- **File:** `src/pages/stock/StockListPage.tsx:155`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** broken-navigation

**What's wrong:** App.tsx mounts every stock page as a child of the parent Route path="/" (AppLayout) — routes are `stock`, `stock/categories`, `stock/sales`, `stock/sales/:id`, `stock/adjustments`, `stock/reports`, `stock/locations`, `stock/:id` (App.tsx:174-181), resolving to top-level /stock/*. There is NO /resources route anywhere in App.tsx (the only 'resources' token, line 186, is an import path for CloneDrivesList). The sidebar entry is to:'/stock' (navConfig.ts:146) and StockAlertsDropdown.tsx:161 correctly uses '/stock/reports', confirming the intended prefix is /stock. Yet ~19 call sites navigate to /resources/stock/... : StockListPage.tsx:155 & 219 (view detail), 272 (Adjustments Link), 278 (Categories Link), 320 (low-stock filter); StockSalesPage.tsx:111 & 117; StockItemDetail.tsx:287 & 312; StockSaleDetailPage.tsx:94 & 114; LowStockAlert.tsx:19; Dashboard.tsx:201; StockSalesWidget.tsx:83, LowStockWidget.tsx:75, StockValueWidget.tsx:90; CaseBackupDevicesTab.tsx:75 & 223; CustomerPurchasesTab.tsx:115. Each unmatched path falls through to the path="*" 404 element (App.tsx:308-317).

**Failure scenario:** User opens Stock from the sidebar (loads at /stock), clicks any item row → handleViewDetail runs navigate('/resources/stock/<id>') → matches no route → renders the '404 Page not found' screen. Same dead-end for opening a sale, Adjustments/Categories links, the low-stock KPI, every 'Back to Stock/Sales' button, and the dashboard stock widgets.

**Suggested fix:** Change all `/resources/stock/...` navigate()/Link targets to `/stock/...` (matching App.tsx and navConfig). Add a smoke test asserting router paths and navigate() targets stay in sync.

**Verifier note:** Independently reproduced: verified App.tsx parent route is path="/" with no /resources segment, grep confirms all 19 cited /resources/stock call sites and their exact lines, and that StockAlertsDropdown uses the correct /stock/reports. 404 catch-all confirmed at App.tsx:308.

---

### 24. Editing a PO from the detail page erases expected_delivery_date (and the date is never displayed) — wrong field name

- **File:** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:416`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** data-loss

**What's wrong:** The DB column is `expected_delivery_date` (database.types.ts:13436, 13470, 13504). PurchaseOrderDetailPage loads the row via select('*') (lines 45-51) and stores it as `order`, but references `order.expected_delivery` for display at lines 310 and 316 — always undefined, so the Expected Delivery card block never renders. Line 416 passes the raw `order` object to PurchaseOrderFormModal; the modal reads `purchaseOrder.expected_delivery?.split('T')[0] || ''` (PurchaseOrderFormModal.tsx:77), yielding '' because that key is undefined, then on save unconditionally writes `expected_delivery_date: formData.expected_delivery || null` (line 213). The list page uses the correct mapping `expected_delivery: selectedOrder.expected_delivery_date` (PurchaseOrdersListPage.tsx:327), proving the detail page's key is wrong.

**Failure scenario:** A PO is created with Expected Delivery = 2026-08-01. On the PO detail page the Expected Delivery block never appears (order.expected_delivery is undefined). A user clicks Edit Order, changes only the notes, and clicks Update. The modal read a blank expected_delivery and the update writes expected_delivery_date = NULL — the stored delivery date is silently lost.

**Suggested fix:** In PurchaseOrderDetailPage reference `order.expected_delivery_date` for display (lines 310/316), and map the field before passing to the modal, e.g. `purchaseOrder={{ ...order, expected_delivery: order.expected_delivery_date }}`, exactly as PurchaseOrdersListPage does at line 327.

**Verifier note:** Independently reproduced: order is `{...data}` from select('*'), so order.expected_delivery is always undefined; modal read (line 77) and write (line 213) confirmed; DB column name confirmed in generated types; list-page correct mapping confirms the detail-page name is wrong. Both the never-display and null-on-save consequences hold. High severity appropriate (silent data loss on an unrelated edit).

---

### 25. paypal-create-subscription writes status 'pending', violating tenant_subscriptions_status_check — upsert fails on every call and the error is swallowed

- **File:** `supabase/functions/paypal-create-subscription/index.ts:256`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** data-integrity

**What's wrong:** After creating the PayPal billing agreement, the function upserts tenant_subscriptions with status:'pending' (line 256, onConflict:'tenant_id'). The live constraint tenant_subscriptions_status_check (baseline_schema.sql:4082) only allows status IN ('trialing','active','past_due','cancelled','unpaid') — verified defined only in the baseline and never altered by any later migration. Postgres rejects the INSERT-or-UPDATE on every invocation. The upsertError is only console.error'd (lines 264-266) and the function still returns 200 with approvalUrl, so a live PayPal subscription exists with no correctly-stored local row (paypal_subscription_id/plan_id never persisted, whether the row is new or an existing provisioning row whose UPDATE is rejected wholesale).

**Failure scenario:** An owner subscribes; PayPal creates agreement I-ABC and will bill the tenant. The upsert with status:'pending' fails the CHECK; error is swallowed; caller gets 200. paypal_subscription_id is never stored. The later ACTIVATED webhook's UPDATE ... WHERE tenant_id=X either misses the row or can't set the subscription id; PAYMENT.SALE.COMPLETED's lookup by paypal_subscription_id finds nothing; and paypal-cancel-subscription's .single() (lines 161-165) returns no usable paypal_subscription_id → 'Subscription not found' / 'No PayPal subscription found'. Tenant is billed but has no functional local subscription.

**Suggested fix:** Write a constraint-valid status (e.g. 'trialing' until ACTIVATED, or 'active'), or add 'pending' to the CHECK via migration. Also treat upsertError as fatal — on local-write failure, cancel the just-created PayPal subscription (or return an error) rather than returning success.

**Verifier note:** Verified line 256 sets status:'pending' and lines 264-266 only log the error. Constraint at baseline_schema.sql:4082 confirmed and unmodified by later migrations. Bug holds for both INSERT and UPDATE branches of the upsert.

---

### 26. PayPal webhook SUSPENDED handler writes status 'paused' to both tables, violating their CHECK constraints — suspended tenants silently keep active entitlement

- **File:** `supabase/functions/paypal-webhook/index.ts:229`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** billing-entitlement

**What's wrong:** BILLING.SUBSCRIPTION.SUSPENDED updates tenant_subscriptions.status to 'paused' (line 229) and tenants.subscription_status to 'paused' (line 234). Neither value is permitted: tenant_subscriptions_status_check (baseline:4082) and tenants_subscription_status_check (baseline:4085) both restrict to ('trialing','active','past_due','cancelled','unpaid') — confirmed unmodified by later migrations. Both .update() calls are rejected by Postgres, and neither destructures/checks the error (lines 227-236), so the failure is silent and the rows keep their prior status (typically 'active'). billingService.isSubscriptionEntitled (billingService.ts:20-29) treats 'active'/'trialing' as entitled.

**Failure scenario:** PayPal suspends a tenant for repeated payment failure and sends SUSPENDED with custom_id=tenant X. Both status:'paused' updates fail the CHECK silently; status stays 'active'. hasFeatureAccess(X, 'sso') and every gated feature keep returning true, so a non-paying, PayPal-suspended tenant retains full paid access indefinitely.

**Suggested fix:** Map SUSPENDED to a constraint-valid status such as 'past_due' (or add 'paused'/'suspended' to both CHECKs via migration and to ACTIVE_SUBSCRIPTION_STATUSES). Also check and log/alert on the update error instead of ignoring it.

**Verifier note:** Verified lines 229 and 234 write 'paused'; no error is destructured. Both CHECK constraints confirmed at baseline_schema.sql:4082 and 4085 with no later ALTER. Prior 'active' status persisting → entitlement retained is confirmed via billingService.ts:20-29.

---

### 27. listUsers() only checks the first 50 auth users, breaking existing-user detection and duplicate handling

- **File:** `supabase/functions/provision-tenant/index.ts:261`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** pagination

**What's wrong:** supabase.auth.admin.listUsers() (line 261) is called with no PageParams. In @supabase/supabase-js v2 (pinned npm:@supabase/supabase-js@2.57.4 at line 1) this returns only page 1 with the GoTrue default perPage of 50. The subsequent existingUsers?.users?.find(...) (262-264) therefore inspects at most 50 accounts, so the 'user already exists / already owns a tenant' branch (267-283) and the update-in-place branch (317-334) silently miss any account beyond the first 50.

**Failure scenario:** On a project with >50 auth users, a returning owner whose email is not on page 1 re-submits signup. existingUser is undefined, so the tenant is created + assign_tenant_code runs, then the code takes the 'New user' branch and calls auth.admin.createUser with an email that already exists → createUser returns a duplicate-email error → the just-created tenant is soft-deleted (350) and the request throws, surfacing a 500 instead of the intended 409. A partially-onboarded user (no tenant, also beyond page 50) can never complete signup because createUser keeps failing on the duplicate email.

**Suggested fix:** Do not enumerate. Look the email up directly (single indexed query against profiles, or getUserByEmail if available), or page listUsers with { page, perPage } until the email is found or the list is exhausted.

**Verifier note:** Confirmed: v2 default perPage=50 is a well-known GoTrue behavior and no pagination args are passed. The bug becomes active as soon as a project exceeds 50 auth users, which is the norm in production.

---

### 28. Failed provisioning after profile creation permanently locks the user out (orphaned profile.tenant_id + orphaned auth user)

- **File:** `supabase/functions/provision-tenant/index.ts:461`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** partial-state-on-failure

**What's wrong:** The provision flow creates the auth user (createUser line 337, or reuses/updates an existing one line 320) and then upserts profiles with tenant_id = tenant.id (lines 357-366) BEFORE the legal_entities insert (435), tax registration insert (515), and onboarding_progress insert (526). Each of those three later failures runs a rollback that ONLY soft-deletes the tenant (lines 461, 520, 538) and throws. None of them resets profiles.tenant_id back to NULL, and none deletes the auth user that was freshly created in this same request. The profile upsert failure itself is only logged (368-370), so on the normal path the profile carries tenant_id when a downstream insert fails.

**Failure scenario:** A self-service signup passes OTP + validations. Tenant, auth user, and profile (tenant_id set) are created, then the legal_entities insert fails transiently. Rollback soft-deletes the tenant but the profile still has tenant_id = <soft-deleted tenant> and the auth user still exists with confirmed email. On retry, listUsers finds the existing user, existingProfile?.tenant_id is truthy (line 274), so the function returns 409 'already associated with an active account. Please sign in instead.' — yet the only tenant that profile points at is soft-deleted, so signing in lands the user in a broken, tenant-less state and re-provisioning is permanently blocked. Manual DB intervention is the only recovery.

**Suggested fix:** On every post-profile rollback path (461, 520, 538), also reset the profile (tenant_id = NULL, is_active = false) and, when the auth user was newly created in this request, call auth.admin.deleteUser(userId); ideally wrap the whole provision in a single DB transaction/RPC so partial state cannot persist.

**Verifier note:** Verified end-to-end in current code: profile upsert (357-366) precedes all three fail-loud rollbacks; each rollback touches only tenants.deleted_at. Re-entry 409 gate at 274 confirms the lockout. Requires a transient failure in one of the three trailing inserts, but when it occurs the account is unrecoverable via product.

---

### 29. send-document-email logs case communications into arbitrary cross-tenant cases (no caseId ownership check)

- **File:** `supabase/functions/send-document-email/index.ts:291`
- **Severity:** 🟠 high · **Verdict:** CONFIRMED · **Category:** tenant-isolation

**What's wrong:** The function authenticates the caller (104) and reads userProfile.tenant_id (174) but uses that tenant_id ONLY to select the from-address from company_settings (180-184). It then calls log_case_communication with p_case_id = body.caseId (291) via the SERVICE-ROLE client (supabaseClient, created 72-81 with SUPABASE_SERVICE_ROLE_KEY) with no verification that body.caseId belongs to the caller's tenant. Per migration 20260610043346 (documented in supabase/migrations.manifest.md line 94), the live 7-arg log_case_communication 'derives tenant_id from the case row' and only 'guards user-context callers to their own tenant (platform admins exempt)'. A service-role call has no user context (auth.uid() is NULL), so that guard does not fire and the row is written into whichever tenant owns the case.

**Failure scenario:** An authenticated tenant-A staff user calls send-document-email with caseId set to a case UUID owned by tenant B. All checks pass (auth, rate limit, field/email validation), the email is sent, and a case_communications row with attacker-controlled subject/content and sent_by = the tenant-A user's id is inserted into tenant B's forensic case history — a cross-tenant write into an audit-sensitive table on a forensic platform.

**Suggested fix:** Before calling log_case_communication, fetch the case via the service-role client and require case.tenant_id === userProfile?.tenant_id (platform admins exempt); return 403 otherwise, so the edge function enforces the isolation the RPC intentionally skips for service-role callers.

**Verifier note:** Edge-function code verified directly: no ownership check anywhere before line 291, and the call uses the service-role client. The RPC's tenant-derive-from-case + user-context-only guard is inferred from the manifest (line 94), which the team wrote as the authoritative record of the applied migration; the live SQL was not readable here (Supabase MCP unauthenticated). Precondition: attacker must know a valid case UUID in another tenant (not trivially enumerable), which is why this is a write/pollution issue rather than a read exfiltration.

---

## 🟡 Medium (60)

### 30. Recording stock usage against a case leaves recommended/items/stats stock caches stale

- **File:** `src/components/cases/CaseBackupDevicesTab.tsx:81`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** cache-invalidation

**What's wrong:** handleUsageSuccess (lines 78-82) invalidates only ['stock-usage-case', caseId]. The usage modal is StockTransactionModal (rendered at 325-337) which itself invalidates nothing — it calls recordStockUsage (StockTransactionModal.tsx:104) then onSuccess() (line 108). recordStockUsage decrements quantity_on_hand. The Recommended Backup Devices grid on this same tab reads ['stock-recommended', recoveredDataSizeGB ?? 0] (line 57-60) and the global stockKeys.items()/stats() are never invalidated. The sibling handleSaleSuccess (line 69-76) and onSaleCreated (line 110-115) both correctly broad-invalidate stockKeys.all, so the usage path is the inconsistent one.

**Failure scenario:** On a case's Backup Devices tab the Recommended grid shows a saleable device 'Available: 3'. Click Record Usage and consume 3 units against the case. The usage table refreshes, but the Recommended grid still shows Available: 3 (no refetch trigger fires) and the Stock list/stats elsewhere stay stale, because only ['stock-usage-case', caseId] was invalidated. Engineer sees availability that no longer exists.

**Suggested fix:** In handleUsageSuccess also invalidate the stock namespace: queryClient.invalidateQueries({ queryKey: stockKeys.all }), matching handleSaleSuccess/onSaleCreated.

**Verifier note:** Confirmed StockTransactionModal performs no invalidation (grep: only recordStockUsage + onSuccess). Confirmed the recommended/global caches are never touched by handleUsageSuccess. Inconsistent with the two sale paths on the same component.

---

### 31. Selecting the Patient role on the primary device drops the role change (stale-closure double setState)

- **File:** `src/components/cases/CreateCaseWizard.tsx:547`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** stale-closure

**What's wrong:** updateDevice (line 547) is `setDevices(devices.map(d => d.id === id ? { ...d, [field]: value } : d))`, reading the `devices` render-closure snapshot rather than the functional updater. The Device Role onChange for index 0 (lines 810-818) calls updateDevice twice synchronously: first device_role_id, then (when the chosen role is Patient) is_primary=true. Both setDevices calls derive their next array from the SAME stale `devices` snapshot, so the second (is_primary) plain-value setState overwrites the first (device_role_id). The role change is deterministically lost — the later write always wins and carries the pre-change device_role_id.

**Failure scenario:** On the Create Case wizard the user sets device 1's role to Donor, then back to Patient. The role dropdown snaps back to Donor (device_role_id update clobbered) while is_primary is silently set true. On submit the primary/patient device is inserted into case_devices with the wrong device_role_id (Donor), corrupting device-role tracking at intake.

**Suggested fix:** Use the functional updater in updateDevice: setDevices(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d)), or set both device_role_id and is_primary in a single state update within the onChange handler.

**Verifier note:** Independently reproduced. Confirmed updateDevice at line 547 uses the closure `devices` (not prev =>), and the onChange at lines 810-818 issues two updateDevice calls for index 0 when the role is Patient. React batches the two plain-value setStates from the identical stale snapshot, so is_primary=true overwrites the device_role_id change. Deterministic, not a race. Medium retained: requires a specific role-toggle interaction on device 0 but corrupts persisted device-role data.

---

### 32. markAsDeliveredMutation commits the clone_drives 'delivered' write before the gated case transition, leaving a partial state when transition_case_status throws

- **File:** `src/components/cases/detail/useCaseMutations.ts:312`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** atomicity

**What's wrong:** markAsDeliveredMutation first updates clone_drives.status='delivered' plus delivered_date/retention fields (useCaseMutations.ts:302-317) as its own auto-committed PostgREST request, and only afterward resolves the delivered status and calls transition_case_status (334-339). If the RPC throws, the mutationFn re-throws (line 339) with no compensating rollback. transition_case_status raises ERRCODE 23514 in two verified paths: a missing edge (migration 20260704190411:247-249, 'Transition % -> % is not allowed') and the tenant gate.payment_before_release check on an outstanding non-proforma balance (migration:303-318, HINT payment_outstanding). MarkAsDeliveredModal shows the 'also update case status' checkbox for any non-'delivered' phase and defaults it to checked (MarkAsDeliveredModal.tsx:58 and :229), so updateCaseStatus is true by default.

**Failure scenario:** (1) Missing-edge trigger: a case in 'recovery' or 'qa' (no direct edge to 'delivered' in the 22-edge matrix) has an active clone. Staff open Mark-as-Delivered with the default-checked 'update case status' box and confirm. clone_drives.status is set to 'delivered' and committed; transition_case_status(recovery->delivered) raises 23514 NOT FOUND; the mutation throws and only toasts the gate error. The clone now permanently shows Delivered with a started retention countdown while the case status never advanced. (2) Payment gate: tenant enables gate.payment_before_release; a 'ready' case with an unpaid tax invoice is marked delivered — the clone commits 'delivered', then transition_case_status raises 23514/payment_outstanding, leaving the clone Delivered and the case still 'ready'. In both cases the clone is no longer in the deliverable list, so re-running won't re-drive the transition.

**Suggested fix:** Resolve the delivered status and attempt the transition_case_status RPC BEFORE writing clone_drives.status='delivered' (mark the clone delivered only after the case transition succeeds), or move both writes into a single SECURITY DEFINER RPC so they commit atomically.

**Verifier note:** Confirmed the ordering and absence of rollback in useCaseMutations.ts:302-340 (clone UPDATE at 312-317 commits before the RPC at 334-339; onError at 349-352 only toasts). Both throw paths verified in migration 20260704190411: invalid-edge RAISE at 247-249 and the payment_before_release RAISE at 303-318. MarkAsDeliveredModal.tsx:58/229 confirm updateCaseStatus defaults to checked for non-delivered phases, so the gated path is reachable by default. Real, recoverable-only-via-alternate-path inconsistency; medium severity appropriate. CONFIRMED.

---

### 33. Data-destruction certificate accepts three identical/self-signatures — separation-of-duties is never enforced

- **File:** `src/components/cases/DocumentDraftReview.tsx:325`
- **Severity:** 🟡 medium · **Verdict:** PLAUSIBLE · **Category:** audit-integrity

**What's wrong:** For a data_destruction report, initiateApprove() (lines 237-244) queues three signature slots — engineer(Operator), witness(Witness), approver(Approver). handleCapture() persists each via captureStaffSignature() and, after the third capture, unconditionally calls transitionDocument(id, 'approved', ...) at line 325. Neither resolveSlotSignerName() (lines 286-292) nor captureStaffSignature() (documentSignatureService.ts:37-80) verifies the three signatories differ. Typed signatures accept any free-text name with no distinctness check; operator and witness both persist signer_user_id = null by design (DocumentDraftReview.tsx:306; documentSignatureService.ts:64), so even the identity field cannot distinguish them. The captureStaffSignature comment (documentSignatureService.ts:26-31) claims the three signatories are 'provably distinct', but no code enforces that claim.

**Failure scenario:** One logged-in technician (who is not the document author, since the Approve button is only disabled for isAuthor at line 415) opens the destruction certificate, clicks Approve, and in the three sequential SignatureCaptureModal prompts types 'John Smith' for Operator, 'John Smith' for Witness and 'John Smith' for Approver. Three document_signatures rows are written with no distinctness check, the doc transitions to 'approved', and the rendered certificate shows a 3-party attestation that was actually self-signed by a single person.

**Suggested fix:** Before transitioning a data_destruction instance to 'approved', require the captured signatories to be distinct — reject when the resolved operator/witness/approver signer_name values (trimmed, case-insensitive) collide or are empty, and surface a validation error rather than silently approving. Consider requiring a second authenticated user for at least one non-approver slot.

**Verifier note:** The mechanical claim is CONFIRMED: I read both files end-to-end and there is no distinctness check on the client, and no identity binding for operator/witness (both signer_user_id null), so the DB cannot enforce distinctness by identity either. Graded PLAUSIBLE rather than CONFIRMED because the unconfirmed precondition is whether automated distinctness enforcement is the intended contract vs. an accepted limitation: operator/witness are explicitly modelled as external signatories without system accounts, so distinctness can only ever be enforced on typed names, which is a policy choice. The header comment claiming 'provably distinct' strongly implies it IS the intended contract, making this a real gap. I did not locate a server-side transition_document gate that checks this (transitionDocument was not read), so a residual chance of DB enforcement exists, though it could only key on the always-null operator/witness identity.

---

### 34. Integrity check with an expected hash but no actual hash falls through to 'passed'

- **File:** `src/components/cases/IntegrityCheckModal.tsx:83`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** audit-integrity

**What's wrong:** In determineResult(), hashMatch is undefined unless BOTH expectedHash and actualHash are truthy (line 73). When exactly one hash is provided, none of the failed/warning/passed/not_applicable branches match: line 75 (hashMatch===false) is false, line 77 (sealIntact===false) is false when seal is unset, line 79 (hashMatch===true) is false, and line 81 (!expectedHash && !actualHash) is false because expectedHash is truthy. Execution falls through to `return 'passed'` at line 83. That result is passed to performIntegrityCheck as overallResult and persisted verbatim: chainOfCustodyService.ts line 706 writes it to chain_of_custody_integrity_checks.result, and lines 733/737 write it into the INTEGRITY_CHECK chain-of-custody ledger event. A check where no hash comparison ever occurred is recorded as a pass.

**Failure scenario:** A lab captured the SHA-256 image hash at intake (expectedHash). During a later scheduled check the drive has degraded and cannot be re-imaged, so the inspector enters only the expected hash, leaves actual hash blank, records no seal condition and no anomalies. The Predicted Result badge shows 'Passed', and on submit the stored chain_of_custody_integrity_checks.result and the custody ledger metadata both read 'passed' — a forensically misleading classification since no actual hash was ever compared.

**Suggested fix:** Treat a partially-provided hash pair as unverified: if exactly one of expectedHash/actualHash is present, return 'warning' (or 'not_applicable') instead of falling through to 'passed'. Only return 'passed' when hashMatch === true or when there was genuinely nothing to verify (a legitimate seal-intact-only pass).

**Verifier note:** Independently traced determineResult with expectedHash set / actualHash blank / no anomalies / sealIntact undefined: hashMatch=undefined and all four typed branches are skipped, reaching return 'passed' at line 83. Confirmed reachable — only checkType is required (line 88); both hash inputs are optional free text. Confirmed persisted at chainOfCustodyService.ts line 706 and ledger event lines 733/737. The all-blank case is correctly handled as 'not_applicable' (line 81); only the XOR case is defective.

---

### 35. Quote-number preview mints (advances) the sequence and re-mints on case change

- **File:** `src/components/cases/QuoteFormModal.tsx:178`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** logic

**What's wrong:** For a new quote the open-effect calls `supabase.rpc('get_next_number', { p_scope: 'quote' })` (line 178) purely to display the next quote number in the header badge (line 425). I confirmed get_next_number is a mint that ADVANCES the sequence (both branches run `UPDATE number_sequences SET current_value = v_next`, plan lines 3533 and 3564). InvoiceFormModal was already fixed for exactly this (lines 323-326: "Never fetch a number for preview: get_next_number INCREMENTS the sequence"), but QuoteFormModal still does it. The previewed number is never passed to onSave (handleSubmit line 400 omits quote_number); the real number is minted again at save via createQuote -> getNextQuoteNumber() (quotesService.ts:406), so the previewed number is always wasted. Worse, the effect's dependency array is `[isOpen, caseId, selectedCaseId, initialData]` (line 218), so changing the in-modal case selection re-runs the effect and mints another number each time.

**Failure scenario:** A user opens Create Quote -> mints QUOT-0007 (shown). They pick a different case (selectedCaseId changes) -> effect re-runs -> mints QUOT-0008 (shown); QUOT-0007 is wasted. Switching case three times burns QUOT-0007..0010. On save, createQuote mints QUOT-0011 for the actual quote, so the header preview never matches the created quote number and the 'quote' sequence accumulates gaps on every open/case-change even if the user cancels.

**Suggested fix:** Do not mint on preview — mirror InvoiceFormModal and show a display-only hint, or use a non-advancing preview RPC; and remove caseId/selectedCaseId/initialData from the number-fetch effect so opening or changing the case never consumes a number. Let the mint happen once at save time (createQuote already does).

**Verifier note:** CONFIRMED. get_next_number advancing verified in SQL; save-time re-mint verified in quotesService.ts:406; deps at line 218 confirmed. Kept at medium: quote numbers are not legally gapless like tax invoices, but the double-mint, gap accumulation, and preview/saved-number mismatch are deterministic and user-visible.

---

### 36. Command palette Enter/highlight use a different index space than the rendered rows, navigating to the wrong command

- **File:** `src/components/shared/CommandPalette.tsx:206`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** activeIndex is a flat index into visibleItems (the pure score-sorted list at lines 148-161), used by the ArrowDown/Up clamp (lines 196/201) and the Enter target visibleItems[activeIndex] (line 206). But rows are rendered from groupedItems (lines 164-177), which re-buckets items so all items sharing a group are contiguous by first appearance. The rendered highlight isActive = globalIdx === activeIndex (276), option ids (281), and onMouseEnter setActiveIndex(globalIdx) (286) all operate in the grouped-flatten index space. Whenever the score order separates two same-group items with a different-group item between them, the grouped flatten reorders relative to visibleItems and the two index spaces diverge, so the highlighted/announced row is not the row Enter activates.

**Failure scenario:** Type "s". With the real registry (commandPaletteRegistry.ts) and stable tie-sort, label-500 matches keep commands order: visibleItems = [Suppliers(Business), Stock(Resources), Salary Components(Payroll), Settings(Payroll), Settings(System), Security(System), Stock Sales(Resources)]. Grouping pulls the Stock Sales extra (group Resources) up next to Stock, so the rendered order is [Suppliers, Stock, Stock Sales, Salary Components, ...]. Hovering the rendered 'Stock Sales' row sets activeIndex=2; pressing Enter runs visibleItems[2] = 'Salary Components' and navigates to /payroll/components instead of /stock/sales. Keyboard arrowing likewise highlights one row while Enter opens a different one.

**Suggested fix:** Index the keyboard state against the array that is actually rendered. Compute one flattened list from the grouped structure (e.g. const flatItems = groupedItems.flatMap(g => g.items)) and use it for both the ArrowUp/Down clamp and the Enter target (flatItems[activeIndex]), or build groupedItems in a way that preserves visibleItems order, so globalIdx, activeIndex, aria, and the Enter target share one index space.

**Verifier note:** Independently reproduced with the real registry + NAV_SECTIONS ordering; ES2019 stable sort preserves the tie order I used. One correction to the candidate: aria-activedescendant (line 249) actually agrees with the visual highlight (both grouped-space) rather than diverging; the odd-one-out is the Enter target/arrow clamp. onClick is unaffected because it passes item directly. Net user-visible bug (highlighted/announced row != Enter target) holds. Downgraded severity high->medium: wrong navigation is non-destructive and recoverable, no data/money/security impact, and click works correctly.

---

### 37. UsageLimitGuard calls toast.error() and onBlocked() during render, stacking toasts and updating state mid-render

- **File:** `src/components/shared/UsageLimitGuard.tsx:55`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** react-side-effect-in-render

**What's wrong:** In the blocked branch (checkResult.allowed === false), onBlocked() (lines 50-52) and toast.error(...) (lines 54-56) run directly in the render body with no useEffect and no once-guard, unlike the allowed-with-warning path (lines 35-40) which correctly gates toast.warning behind a useEffect + hasShownWarning. toast is useToast(); toast.error -> showError -> toast.custom(...) from react-hot-toast, which synchronously dispatches into the react-hot-toast store and updates the mounted <Toaster> during UsageLimitGuard's render. showError passes no id, so react-hot-toast mints a new toast each call. With no guard, every re-render while blocked repeats both side effects.

**Failure scenario:** CustomerFormModal wraps its submit button in <UsageLimitGuard limitKey="max_customers" showToast> (lines 583-598). When the plan customer cap is reached, checkResult resolves {allowed:false, message} and the guard renders the blocked panel plus an error toast. The modal re-renders on every keystroke across its inputs, so each keystroke re-enters render and stacks another identical error toast; onBlocked() re-fires each render. React StrictMode's double-invoked render produces an immediate duplicate. If a caller's onBlocked sets parent state, React logs 'Cannot update a component while rendering a different component (Toaster)' and can loop.

**Suggested fix:** Move onBlocked() and toast.error(...) out of the render body into a useEffect keyed on checkResult (mirroring the existing hasShownWarning guard) so they fire once per blocked result, and keep the render pure by only returning the blocked-panel JSX.

**Verifier note:** Confirmed from the component code and real callers (CustomerFormModal, ExpenseFormModal, CreateCaseWizard). toast.custom's store dispatch is a synchronous setState on the Toaster component, so calling it in render is a genuine side-effect-in-render; duplicate-toast-per-render and repeated onBlocked() hold regardless of whether onBlocked sets state (the loop is the extra case). Severity medium is accurate.

---

### 38. StockItemFormModal silently drops Model and Capacity on save

- **File:** `src/components/stock/StockItemFormModal.tsx:144`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** data-loss

**What's wrong:** The form has Model (state line 62, input lines 290-297, prefilled from item.model line 92) and Capacity (state line 63, input lines 299-308, prefilled from item.capacity line 93). The insert/update payload built at lines 144-159 includes name, description, category_id, item_type, brand, unit, barcode, photos, is_active, cost_price, selling_price, minimum_quantity, reorder_quantity, notes — and OMITS model and capacity. Both columns exist on stock_items in the live schema (database.types.ts Row lines 15087 `capacity: string | null`, 15105 `model: string | null`, with matching Insert/Update). createStockItem/updateStockItem pass the payload straight through, so typed Model/Capacity are never persisted.

**Failure scenario:** A technician sets Model='Barracuda ST2000DM008' and Capacity='2TB' on a drive and clicks Save (success toast shown). The values are dropped; reopening the item shows both fields blank — load-bearing identity fields on donor/backup drives are lost.

**Suggested fix:** Add `model: model.trim() || null,` and `capacity: capacity.trim() || null,` to the payload object (lines 144-159).

**Verifier note:** Confirmed by reading the full payload (lines 144-159), both state fields/inputs/prefill, and the stock_items Row block in database.types.ts (capacity line 15087, model line 15105 are inside the stock_items: block that starts at 15083).

---

### 39. Percentage discount on a stock sale is not capped at 100% → negative sale total previewed and submittable

- **File:** `src/components/stock/StockSaleModal.tsx:302`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** money

**What's wrong:** discountAmount (lines 300-305) clamps the FIXED branch with Math.min(val, subtotal) but leaves the PERCENTAGE branch unclamped: `return (subtotal * val) / 100`. A percentage > 100 makes the discount exceed subtotal, so `total = subtotal - discountAmount + tax` (line 351) goes negative. The discount input (lines 559-566) has min="0" but no max, and the Create button disabled condition (line 669) does not check the total/discount, so a negative total stays submittable. On submit the percentage branch passes the raw rate unclamped: `discount_value: ... : discountType === 'percentage' ? parseFloat(discountValue) || null` (lines 384-386). The tax preview also feeds documentDiscount = discountAmount (>subtotal) into computeStockSaleTax (line 331), a negative taxable base.

**Failure scenario:** Cashier types 150 in the percentage field for a 100.00 cart. Preview Total shows -50.00, the 'Create Sale · -50.00' button stays enabled, and submitting sends discount_type='percentage', discount_value=150 to record_stock_sale — the previewed total is negative and the tax kernel receives a document discount larger than the line subtotal.

**Suggested fix:** Clamp the percentage in discountAmount: `if (discountType==='percentage') return (subtotal * Math.min(val,100))/100;`, cap discount_value at 100 in the submit payload, and/or validate 0 ≤ % ≤ 100 before enabling Create.

**Verifier note:** Client-side faulty logic fully reproduced: unclamped percentage (line 302), no max on input (559-566), no total guard on submit button (669), raw % passed on submit (384-386), negative documentDiscount to tax preview (331). Whether record_stock_sale ALSO persists a negative total (vs. clamping server-side) was not verified — no DB access — but the previewed-negative-and-submittable client bug holds regardless.

---

### 40. Portal-tenant reconciliation interval self-terminates after 30s, so same-tab portal logins after 30s never resolve the tenant's config/theme

- **File:** `src/contexts/TenantConfigContext.tsx:40`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** race-condition

**What's wrong:** TenantConfigProvider resolves the portal tenant id by polling sessionStorage every 1s (line 39), but line 40 permanently clears that interval 30s after mount. The only remaining triggers are 'storage' (never fires in the tab that wrote the value) and 'focus' (only fires when the window regains focus). Portal login writes sessionStorage via writeSession (PortalAuthContext.tsx:239) with no window event dispatched, then PortalLogin.tsx:46 navigates via SPA (navigate('/portal/dashboard', {replace:true})) with no full reload, and clicking the Login button does not blur/refocus the window. So after 30s none of the three mechanisms update portalTenantId. tenantId stays undefined and loadConfig short-circuits to DEFAULT_TENANT_CONFIG (55-58).

**Failure scenario:** A customer opens the portal login page and takes more than 30s before submitting (slow typing, reading terms, forgot-password flow). By the time login() writes the portal session, the 1s interval is already cleared; 'storage' does not fire same-tab and 'focus' does not fire on a button click within an already-focused window. portalTenantId stays null, tenantId stays undefined, config stays DEFAULT. The authenticated portal dashboard then renders with the wrong tenant context - 'royal' theme, '$' symbol, and currency.code===REQUIRED_SENTINEL (a Symbol) fed into currency formatting - until the user happens to blur and refocus the tab.

**Suggested fix:** Do not hard-stop reconciliation at 30s. Keep a lightweight interval for the provider's lifetime, or have PortalAuthContext.writeSession dispatch a custom window event (or invoke a registered callback) on login/logout that TenantConfigProvider subscribes to, so the portal tenant id propagates immediately regardless of elapsed time.

**Verifier note:** Confirmed the 30s clearInterval, that login writes sessionStorage without dispatching any event (PortalAuthContext 239-240), and that PortalLogin uses SPA navigation not a reload (46). The faulty logic holds; the failure requires >30s elapsed before login and no intervening window blur/focus - both realistic. Kept medium: real functional breakage of the portal's tenant context, but timing-gated and self-correcting on refocus, no data corruption.

---

### 41. ThemeContext anti-flash keys on isLoading instead of isResolvedConfig, flashing non-royal tenants to Royal and overwriting the theme hint during the pre-profile auth window

- **File:** `src/contexts/ThemeContext.tsx:62`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** state-transition

**What's wrong:** effectiveTheme = optimisticTheme ?? (isLoading ? (hintTheme ?? tenantTheme) : tenantTheme). It gates 'keep the pre-mounted hint' on isLoading, but TenantConfigContext.loadConfig sets isLoading=false synchronously in the tenantId-undefined branch (TenantConfigContext.tsx:55-58) while config is still DEFAULT_TENANT_CONFIG (theme 'royal'). With isLoading=false and no optimistic value, effectiveTheme collapses to tenantTheme='royal', and the effect at 64-67 both stamps data-theme='royal' AND persistThemeHint('royal'), clobbering the correct hint. The sibling LocaleContext.tsx:71 fixes this exact window by guarding on isResolvedConfig(config); ThemeContext was not updated to match. isResolvedConfig(DEFAULT_TENANT_CONFIG) is false because currency.code===REQUIRED_SENTINEL (tenantConfig.ts:145-147), so the guard would correctly hold the hint.

**Failure scenario:** A returning midnight-theme tenant reloads. main.tsx (47-50) synchronously stamps data-theme='midnight' from the hint (first paint correct). React mounts: first render isLoading=true so effectiveTheme=hint=midnight. Then the loadConfig effect runs; profile is still null (Supabase getSession is async) so tenantId is undefined and loadConfig short-circuits, synchronously setting isLoading=false with config=DEFAULT. Re-render: effectiveTheme='royal' -> the effect flashes the UI to Royal and persistThemeHint('royal') overwrites the stored 'midnight' hint. When real config resolves it flips back to midnight; but if the tab is closed during this window the corrupted 'royal' hint persists, so the next load flashes Royal from the very first paint - the exact regression the anti-flash system was built to prevent.

**Suggested fix:** Import isResolvedConfig and mirror LocaleContext: const effectiveTheme = optimisticTheme ?? (isResolvedConfig(config) ? tenantTheme : (hintTheme ?? tenantTheme)); so the main.tsx-stamped hint survives until the tenant's real config actually resolves.

**Verifier note:** Independently reproduced. Confirmed the divergence from LocaleContext.tsx:71 (which carries a comment at 62-71 documenting this precise pre-profile window as the reason it uses isResolvedConfig), and that loadConfig sets isLoading=false with config=DEFAULT when tenantId is undefined. Downgraded severity high->medium: impact is a visual flash plus transient, self-healing hint corruption (cosmetic), not data/security/money - but it recurs on every reload for burgundy/scarlet/midnight tenants.

---

### 42. useCasesRealtime never (re)subscribes when tenant_id is absent at mount or changes later — dead realtime for platform-admin/tenant-switch sessions

- **File:** `src/hooks/useCasesRealtime.ts:106`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** realtime-subscription

**What's wrong:** The effect resolves tenant identity from mutable external state — `const tenantId = getTenantId()` (line 25, backed by `localStorage.getItem('tenant_id')` in supabaseClient.ts:46-48) — and returns early with no subscription when it is null (line 26). The effect's dependency array is `[queryClient]` (line 106), a stable reference that never changes; `tenantId` is deliberately excluded. So the effect runs at most once per mount: if `getTenantId()` is null at that single run, the `cases`/`case_devices` postgres_changes channel is never created and can never recover, and a mid-session tenant change leaves the channel bound to the stale `filter: tenant_id=eq.<old>` (or absent) and is never torn down/recreated. The sibling hook `useNotifications` keys its realtime effect on `[userId, queryClient]` (useNotifications.ts:99) so it re-subscribes when identity becomes available/changes; useCasesRealtime does not.

**Failure scenario:** A platform admin (profiles.tenant_id IS NULL) is set to profileStatus='approved' (AuthContext.tsx:170-175) with localStorage 'tenant_id' removed (AuthContext.tsx:164-165). They open the Cases list — RLS via is_platform_admin() lets them read rows so the list renders, but getTenantId() returns null, so useCasesRealtime returns early at line 26; because tenantId is not a dependency the effect never re-runs. Another operator intakes/edits a case in that tenant: the '/cases' 'N updates — refresh' pill never increments and open case-detail views never live-refresh for the whole session (CasesList.tsx:164 mounts the hook with no tenant-derived key, so no remount forces re-subscription). Same permanent-dead outcome for any mid-session tenant switch where localStorage tenant_id changes without the component remounting.

**Suggested fix:** Include the tenant identity in the effect dependency array so the subscription re-establishes when it becomes available or changes — e.g. `}, [queryClient, tenantId]);` with `tenantId` resolved reactively (via a reactive source or by reading getTenantId() at render), mirroring useNotifications keying its realtime effect on `[userId, queryClient]`. The early-return on null then becomes recoverable because a later non-null tenantId re-triggers the effect.

**Verifier note:** Independently reproduced: line 25/26 early-return and line 106 deps=[queryClient] with tenantId excluded are present in current code; getTenantId reads localStorage (supabaseClient.ts:46), AuthContext.tsx:164-165 clears tenant_id for null-tenant profiles while still marking them approved, and CasesList.tsx:164 uses the hook with no tenant-keyed remount. Scoping caveat: for a normal tenant user, AuthContext.fetchProfile writes localStorage.tenant_id (line 163) before setting profileStatus='approved' (line 175), so CasesList mounts with a valid tenantId and is unaffected — impact is limited to platform-admin/null-tenant and mid-session tenant-switch sessions, matching the candidate. Reachability of /cases by a platform admin depends on routing not blocking them, but the code-level defect (no recovery from null tenantId, no re-subscribe on change) holds unconditionally. Severity medium is appropriate.

---

### 43. getCasesWithInvoices sorts by parseInt(case_number) — always 0 for prefixed case numbers — then silently truncates to 50 in arbitrary order

- **File:** `src/lib/bankingService.ts:894`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** ordering

**What's wrong:** getCasesWithInvoices (776-905) sorts the deduped case list with `const numA = parseInt(a.case_number ?? '') || 0` / `numB - numA` (894-896), then returns `cases.slice(0, 50)` (899). Case numbers are prefixed alphanumerics (e.g. 'CASE-0005' / 'C-0020', confirmed by caseService.ts:86-104 which reserves numbers via get_next_number's PREFIX-LPAD scheme). parseInt of a string starting with a non-digit returns NaN, so `NaN || 0` = 0 for every case; numB - numA is 0 for all pairs and the sort is a stable no-op. The initial invoices query (780-809) has no .order(), so map-insertion order is arbitrary DB order; slice(0,50) then keeps an arbitrary 50 and drops the remainder. This feeds the Record Receipt case picker (RecordReceiptModal.tsx:164-168/411-414).

**Failure scenario:** A tenant has 70 cases with outstanding invoices. On Banking -> Record Receipt, the case dropdown is populated from getCasesWithInvoices({ hasOutstandingInvoices: true }), which returns 50 cases in arbitrary DB order (the parseInt sort does nothing). ~20 cases with open invoices are absent from the picker and cannot be selected, so the operator cannot record a payment against them from this screen.

**Suggested fix:** Order deterministically on the server (add `.order('created_at', { ascending: false })` on the invoices query) and either paginate or raise the cap; if sorting by case number is desired, sort on the full string or a numeric column, not parseInt of the prefixed label.

**Verifier note:** Verified: parseInt('CASE-0005') is NaN so every key collapses to 0 (case-number prefixing confirmed via caseService.ts:93); comparator returns 0 for all pairs (no-op sort); query at 780-809 has no .order(); slice(0,50) at 899. Both the ineffective sort and the arbitrary truncation are certain. Impact is bounded to tenants with >50 outstanding-invoice cases, so medium is appropriate.

---

### 44. Case financial summary silently swallows failed queries

- **File:** `src/lib/caseFinanceService.ts:60`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** swallowed-error

**What's wrong:** getCaseFinancialSummary reads quotesResult/invoicesResult/expensesResult via `.data || []` (lines 60-62) with no `.error` check. A failed sub-query is silently treated as an empty result, so totalInvoiced/totalPaid/outstandingBalance/invoicesCount etc. are computed from partial data with no error propagated. getCaseExpenses (line 123) and getCasePayments in the same file do react to errors, showing the divergence.

**Failure scenario:** The invoices sub-query errors while quotes/expenses succeed. getCaseFinancialSummary returns totalInvoiced=0, outstandingBalance=0, invoicesCount=0 for a case that actually has unpaid invoices, so the case Finances card shows $0 owed while money is outstanding.

**Suggested fix:** After the Promise.all, check `quotesResult.error`, `invoicesResult.error`, `expensesResult.error` and throw before aggregating.

**Verifier note:** Confirmed: lines 60-62 discard `.error`. Conditional on a query erroring, hence medium. Verified the query itself is otherwise correct (case_id + deleted_at filters present).

---

### 45. Delivery-challan reprint re-derives the statutory total/lines/e-way note from mutable device state instead of the immutable issued record

- **File:** `src/lib/deliveryChallanService.ts:218`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** assembleDeliveryChallanData() (lines 200-236) builds the printed Rule-55 challan from batchDevices = receipt.devices.filter(d => d.checkout_batch_id === issued.batchId && declaredByDevice.has(d.id) && isCustomerOwnedRole(d.role)), then RECOMPUTES totalDeclaredValue (line 218) and ewayNote (line 233) from that live-derived subset. The immutable statutory total captured at issuance — issued.totalDeclaredValue, populated at line 170 and read back at line 124 from the append-only case_job_history row — is never used. The per-line declared VALUES are immutable (they come from issued.lines via the declaredByDevice map), but the SET of lines, the total, and the e-way note are all re-derived from current device state. A challan number is a statutory serial: a reprint must reproduce exactly what was issued, yet a post-issuance edit of a device's role silently changes the reprinted document. generateDeliveryChallan() in src/lib/pdf/pdfService.ts (lines 788-809) is the live reprint path — it calls fetchReceiptData(caseId) then assembleDeliveryChallanData(data, issued, consignee), confirming the bug is reachable.

**Failure scenario:** Batch B is checked out with customer devices X (declared 30,000) and Y (declared 25,000); challan DC/2025/0001 is issued with total 55,000, so ewayBillGuidance shows the >=INR 50,000 e-way-bill notice. Later an operator edits device Y's role to 'Clone Target' (any role name containing backup/clone/spare/target). On reprint, fetchCaseDevices (src/lib/pdf/dataFetcher.ts:446-454) re-derives d.role live from device_role_id, so isCustomerOwnedRole('Clone Target') returns false; batchDevices becomes [X], totalDeclaredValue recomputes to 30,000 (< 50,000) so the e-way note disappears, Y's line vanishes from the triplicate, and the reprinted statutory document no longer matches the issued/recorded challan number.

**Suggested fix:** Render the reprint from the immutable issued record: build lines and totalDeclaredValue (and therefore the e-way note) from issued.lines / issued.totalDeclaredValue, using receipt.devices only to look up descriptive fields (device_type/brand/model/serial). Do not re-filter issued lines against current role or existence state.

**Verifier note:** CONFIRMED via the role-edit path: I traced generateDeliveryChallan -> fetchReceiptData -> assembleDeliveryChallanData and confirmed issued.totalDeclaredValue is discarded while total/eway are recomputed from the mutable subset (deliveryChallanService.ts:218,233), and that isCustomerOwnedRole flips on a 'target'/'clone'/'backup'/'spare' role name (regimes/in_gst/deliveryChallan.ts:32-38). CORRECTION to the candidate's second sub-scenario: the soft-delete path does NOT hold — fetchCaseDevices (dataFetcher.ts:404-409) selects with only .eq('case_id', caseId), no .is('deleted_at', null), so a soft-deleted device REMAINS in receipt.devices and would not be dropped. The role-mutation path is sufficient to confirm the core defect; the declared per-line values themselves are immutable.

---

### 46. Forensic report custody timeline lacks id tiebreaker → nondeterministic entry numbering

- **File:** `src/lib/documentInstanceData.fetch.ts:167`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** nondeterministic-ordering

**What's wrong:** The chain_of_custody fetch that feeds a report's custody timeline (documentInstanceData.fetch.ts:162-168) orders only by `created_at` ASC with no deterministic tiebreaker. reportAdapter.buildCustodyLog (reportAdapter.ts:491-497) assigns entry numbers purely by array index (`#0001..#N`). For custody rows sharing an identical created_at, Postgres returns them in arbitrary physical order, so entry numbers are unstable across renders. The canonical Chain-of-Custody PDF path was explicitly fixed to order (created_at ASC, id ASC) at dataFetcher.ts:1193-1194 (with a comment noting the multi-device-intake tie case) — this report path was missed, so the two documents can number the same events differently.

**Failure scenario:** A case has two custody events written with now() in the same statement (e.g. intake DEVICE_RECEIVED trigger event + a case-level event) giving identical created_at. Generating the forensic report twice (or under a different query plan) can label the same physical event `#0003` one time and `#0004` another, and those numbers won't match the standalone Chain of Custody PDF / UI ledger — a numbering inconsistency on a legal forensic record.

**Suggested fix:** Add `.order('id', { ascending: true })` immediately after the created_at order in the chain_of_custody fetch, mirroring fetchChainOfCustodyEntries (dataFetcher.ts:1193-1194), so tied-timestamp rows have a stable, canonical order.

**Verifier note:** Independently reproduced: fetch at line 162-168 has only `.order('created_at', { ascending: true })` then `.overrideTypes`; dataFetcher.ts:1193-1194 confirmed to carry the extra `.order('id', { ascending: true })` with an explicit tie-break comment; buildCustodyLog numbers rows by `index + 1` (reportAdapter.ts:492). Claim, file, and lines all accurate.

---

### 47. Report collapses multi-device case to one device and derives whole-case recoverability from it

- **File:** `src/lib/documentInstanceData.fetch.ts:214`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** fetchCaseContext queries ALL case_devices (lines 144-150, ordered by created_at ASC) but uses only `devices?.[0]` (line 152). The case-level `recoverability` summary field is set from that single device's `recovery_result` (line 214), and only devices[0] populates Device Information (lines 193-203). reportAdapter.buildReportSummary (reportAdapter.ts:547-550) then renders that value as a case-level 'Recoverability' summary tile. Device selection is by created_at, not role, so it is not even guaranteed to be the primary/patient device. Any multi-device job (a RAID array or multi-drive case) is collapsed to one member.

**Failure scenario:** A 3-drive case where the earliest-created device recovery_result = 'Unrecoverable' but drives 2 and 3 were fully recovered. The generated report shows only drive #1 under Device Information and prints a case-level 'Recoverability: Unrecoverable' summary tile for the entire case, misrepresenting the outcome to the customer.

**Suggested fix:** Select the patient/source-role device explicitly (order by role, not created_at) for the single-device summary, and aggregate recoverability across all devices rather than reading devices[0].recovery_result; ideally render every device.

**Verifier note:** Mechanically reproduced: line 152 `const dev = devices?.[0];`, line 214 `recoverability: dev?.recovery_result ?? null`, and the case-level tile at reportAdapter.ts:547-550. The single-DEVICE section could arguably be an intended report scope, but the whole-CASE recoverability tile sourced from one arbitrarily-ordered device is a concrete misrepresentation on a multi-device case — a real correctness defect and the exact N-into-one anti-pattern CLAUDE.md forbids.

---

### 48. planCache is not tenant-keyed and never cleared on sign-out → cross-tenant plan-entitlement bleed

- **File:** `src/lib/featureGateService.ts:84`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** tenant-isolation

**What's wrong:** The module-global `planCache` (line 50) stores planId/planCode/features/expiry but NO tenantId (interface lines 43-48). loadPlanCache()'s short-circuit at line 84 (`if (planCache && Date.now() < planCache.expiry) return;`) compares only the 5-minute expiry, never whether the cached plan belongs to the current localStorage.tenant_id. I traced both sign-out paths in AuthContext.tsx: performSignOut (lines 93-128) and the SIGNED_OUT handler (lines 269-298) clear rolePermissionsService and the tenant_id pointer but never call clearPlanCache(). clearPlanCache() is only reachable via the manual usePlanCacheRefresh() hook (useFeatureGate.ts:103). Because the happy-path sign-out does NOT reload the page (window.location.replace only runs in performSignOut's error branches, lines 121/126), and sign-in via signInWithPassword also does not reload, this module state survives an account switch.

**Failure scenario:** On a shared browser, enterprise-plan tenant A works (planCache populated with enterprise features + high/unlimited limits, expiry now+5min). A signs out (no page reload). Starter-plan tenant B signs in within 5 minutes; fetchProfile sets localStorage.tenant_id = B. B's first hasFeature('white_labeling'/'sso'/'api_access') hits loadPlanCache: tenant_id is truthy so the null-reset at lines 78-82 is skipped, then line 84 sees the still-valid A cache and returns A's enterprise entitlements — B sees premium-gated UI unlocked, and checkUsageLimit/canPerformAction compute B's usage against A's plan limits until a full page reload.

**Suggested fix:** Store tenantId in PlanCache and invalidate when it differs from the current localStorage.tenant_id (e.g. `if (planCache && planCache.tenantId === tenantId && Date.now() < planCache.expiry) return;`), and call clearPlanCache() from performSignOut() and the SIGNED_OUT handler.

**Verifier note:** Independently reproduced: cache has no tenant field, short-circuit ignores tenant, and neither sign-out path clears it. Downgraded from high to medium: these are client-side entitlement/UI gates; server RLS still protects actual tenant data, so this is an entitlement/quota-gate bleed (premium UI unlocked, own plan quotas bypassed) rather than a data leak. Precondition: nothing calls loadPlanCache() during the brief logged-out window (which would null the cache and refetch B fresh); the login screen renders no feature gates, so this holds in the normal switch flow.

---

### 49. Profit & Loss report silently swallows failed queries and reports wrong money

- **File:** `src/lib/financialReportsService.ts:124`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** swallowed-error

**What's wrong:** generateProfitLossReport destructures `invoicesResult.data || []` (line 124) and `expensesResult.data || []` (line 125) without ever inspecting `.error`. Supabase resolves (never rejects) a failed query as `{data:null, error}`, so Promise.all resolves and the failed dataset is silently treated as empty. Sibling report builders in the same file do check: generateAgedReceivablesReport (line 181), generateRevenueByCustomerReport (line 388), generateRevenueByCaseReport (line 430) all `if (error) throw`. generateCashFlowReport (277-278) and generateInvoiceSummaryReport (322-323) have the identical unchecked-error defect.

**Failure scenario:** The expenses query fails (transient network error, RLS/embed error) while the invoices query succeeds. totalExpenses becomes 0, so grossProfit=netProfit=full revenue and profitMargin shows ~100%, rendered to the user as an authoritative P&L with no error surfaced.

**Suggested fix:** After the Promise.all, check `invoicesResult.error` and `expensesResult.error` and throw before using `.data`, matching generateAgedReceivablesReport.

**Verifier note:** Code defect confirmed exactly as described; sibling functions prove intent to check errors. Downgraded severity high→medium: the wrong-money outcome is conditional on a query actually erroring (an authenticated read normally succeeds), so it is a latent silent-failure rather than an always-on miscalculation.

---

### 50. generateProfitLossReport and generateRevenueByCustomerReport include void/cancelled invoices in revenue (no status filter)

- **File:** `src/lib/financialReportsService.ts:127`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** money-aggregation

**What's wrong:** generateProfitLossReport sums paidRevenueNetOfTax over every invoice in range with no status exclusion (query lines 104-109; reduce line 127) and generateRevenueByCustomerReport sums baseAmount(amount_paid) the same way (query lines 377-386; reduce line 400). The codebase defines RECEIVABLE_INVOICE_EXCLUDED_STATUSES = ['void','cancelled'] and the sibling generateRevenueByCaseReport (line 426) excludes them, but these two revenue surfaces do not. No path zeroes amount_paid when an invoice is voided/cancelled: updateInvoiceStatus (invoiceService.ts:841-864) writes only status, and the data-migration import contract (workbookContract.ts) imports status, invoice_type and amount_paid as independent fields — so a previously-paid, later-void/cancelled tax invoice keeps its amount_paid and is still counted as realized revenue. (Proformas contribute 0 here because payments are blocked on them, so they do not corrupt these two totals.)

**Failure scenario:** A legacy $1,000 tax invoice was fully paid (amount_paid=$1,000) and later voided; it is imported (or set) with status='void' and amount_paid=$1,000. generateProfitLossReport still adds its net-of-tax amount to revenue/net profit and generateRevenueByCustomerReport adds $1,000 to that customer's revenue, while generateRevenueByCaseReport excludes it — so P&L and revenue-by-case no longer reconcile for the same period.

**Suggested fix:** Exclude void/cancelled from both reducers, e.g. add .not('status','in', RECEIVABLE_INVOICE_EXCLUDED_STATUSES...) at the query level as generateRevenueByCaseReport does (line 426), or gate each row through isReceivableInvoice before summing amount_paid.

**Verifier note:** Faulty logic (missing void/cancelled exclusion, diverging from sibling report + shared doctrine) independently reproduced. Corrupting state (void/cancelled invoice with amount_paid>0) is reachable via the supported data-import subsystem (status + amount_paid both importable) and via the exported updateInvoiceStatus; there is currently no in-app button that flips a paid invoice to cancelled/void (updateInvoiceStatus has no UI callers). CONFIRMED with that reachability nuance noted; medium severity retained.

---

### 51. Invoice flagged 'overdue' on (or the evening before) its due date

- **File:** `src/lib/invoicePermissions.ts:85`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** date-off-by-one

**What's wrong:** getPaymentSummary sets due = new Date(inv.due_date) (line 79) and isOverdue = ... due.getTime() < now.getTime() (line 85). due_date is a date-only value, so new Date('2026-07-12') is UTC midnight of the due date while now is the current instant — the invoice becomes 'overdue' the moment UTC-midnight of the due date passes rather than after the due date has ended.

**Failure scenario:** Invoice due_date '2026-07-12', unpaid, issued. UTC-5 tenant: new Date('2026-07-12') = 2026-07-11 19:00 local; at 20:00 local on July 11 (the evening BEFORE the due date), now (2026-07-12T01:00Z) > due (2026-07-12T00:00Z), so the red OVERDUE badge renders a day early. UTC+4 tenant: shows overdue from 04:00 on the due date itself, though it is not truly overdue until July 13.

**Suggested fix:** Compare date-only values: overdue only when the due date is strictly before today's date in the tenant timezone (e.g. isoDate(due_date) < todayIsoDate), not dueMidnightUTC < nowInstant.

**Verifier note:** Read lines 60-88. Confirmed line 79 parses date-only string as UTC midnight and line 85 compares getTime() against now instant with no date-normalization; overdue triggers during/before the due date. Cited line correct.

---

### 52. Restricted-edit path writes no audit_trails entry when an issued/paid invoice is edited

- **File:** `src/lib/invoiceService.ts:620`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** auditability

**What's wrong:** In updateInvoice, the full-edit path calls `logAuditTrail('update', 'invoices', id, {}, updateData)` at line 795. The restricted-edit branch (mode === 'restricted', taken for issued or partially/fully-paid invoices) performs its update and returns at lines 620-622 without calling logAuditTrail. logAuditTrail (src/lib/auditTrailService.ts) is a client-side `log_audit_trail` RPC — it is the mechanism that writes the append-only audit_trails table, and the explicit call in the full path confirms the DB does not auto-log these updates (otherwise it would double-log). So edits to the most sensitive, financially-locked documents produce no audit_trails row, while edits to unlocked drafts do.

**Failure scenario:** An issued tax invoice is edited to change due_date / terms_and_conditions / bank_account_id (all in RESTRICTED_EDITABLE_FIELDS). The invoices row is updated (line 620) but no row is written to audit_trails. A later forensic/legal review of who changed the issued invoice's payment routing finds no audit record of the change — auditability is exactly backwards from the append-only mandate.

**Suggested fix:** Before returning in the restricted branch (after the successful update), add `await logAuditTrail('update', 'invoices', id, {}, restrictedData as Record<string, unknown>);` matching the full-edit path.

**Verifier note:** Confirmed the asymmetry directly: restricted branch (613-623) has no logAuditTrail; full path calls it at 795. auditTrailService confirms logAuditTrail is the client-side RPC writing audit_trails, and the CLAUDE.md-cited invoice DB trigger (set_audit_actor_fields) only stamps actor columns, not audit_trails rows. The one-sided explicit call proves the DB does not auto-record these, so the restricted path is a real audit gap.

---

### 53. updateInvoice persists caller-supplied status verbatim, bypassing the mandated tax-invoice issuance path

- **File:** `src/lib/invoiceService.ts:625`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** state-transition

**What's wrong:** createInvoice deliberately forces `status:'draft'` for tax invoices (line 490) so they become payable only via issueInvoice/issue_tax_document. updateInvoice has no equivalent guard on the full-edit path: pickInvoicePersistFields copies `status` verbatim (line 163) into updateData (line 625) with no reconciliation against invoice_type or amounts. For a draft tax invoice getInvoiceEditability returns mode 'full' (invoicePermissions.ts line 108-109), so InvoiceFormModal leaves the free Status dropdown enabled (`disabled={isRestricted}` is false; options draft/sent/paid/partial/overdue/cancelled at lines 705-710) and InvoiceDetailPage's edit onSave forwards `status: invoicePayload.status` (line 629).

**Failure scenario:** A user edits a draft tax invoice (invoice_number NULL, amount_paid 0), picks 'Paid' in the Status dropdown, and saves. updateInvoice's full path writes status='paid' while amount_paid stays 0 and balance_due is recomputed to the full total (line 699/713). The invoice shows a green 'Paid' badge and filters under Paid though nothing was collected. Choosing 'Sent' instead marks it issued with no minted invoice_number and no vat_records — contradicting createInvoice's forced-draft invariant and the issuance flow.

**Suggested fix:** Mirror createInvoice in updateInvoice: refuse to persist a status change on tax invoices outside the issuance/void paths (strip `status` from the persisted fields on this path, or require status transitions to go through issueInvoice/updateInvoiceStatus with amount reconciliation).

**Verifier note:** Traced end to end: draft tax invoice -> editability 'full' -> status dropdown enabled -> onSave forwards status (InvoiceDetailPage:629) -> pickInvoicePersistFields copies it (163) -> written at 625. Draft tax invoices are not yet issued so no DB immutability blocks the write; amount_paid coalesces to existing 0 (line 646) leaving status='paid' inconsistent with balance_due=total. Medium: needs a user action but yields a genuinely inconsistent/issuance-bypassing state.

---

### 54. Bulk-emailing an invoice unconditionally resets its status to 'sent', clobbering paid/partial/overdue state

- **File:** `src/lib/invoiceService.ts:1256`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** state-corruption

**What's wrong:** In bulkSendInvoiceEmails, after a successful send the code does .update({ sent_at, status: 'sent' }) with no guard on the current status and leaves amount_paid/balance_due untouched. invoices.status is a plain writable workflow column (record_payment/void_payment set it to 'paid'/'partial'/'sent'; the amount-derived value lives in the separate generated payment_status column), and the only BEFORE UPDATE trigger on invoices is the audit-actor stamp, so nothing re-derives status back. The fetch (lines 1196-1202) applies no status filter and the caller (InvoicesListPage.tsx:218) sends every selected id, so paid/partial/overdue invoices are reachable targets.

**Failure scenario:** An accountant selects a fully-paid invoice (status='paid', amount_paid=total, balance_due=0) to re-send a copy and runs bulk email. bulkSendInvoiceEmails flips status to 'sent' while balance_due stays 0. The invoice now reports status='sent', drops out of the list's .eq('status','paid') filter (InvoicesListPage line 229-230), and reads as outstanding despite being fully paid. The same overwrite reverts 'overdue'/'partial' invoices, hiding overdue state.

**Suggested fix:** Only advance to 'sent' from a pre-send state (e.g. status: inv.status === 'draft' ? 'sent' : inv.status, or re-derive from amount_paid/balance_due) and always update sent_at independently, so re-sending a paid/partial/overdue invoice never overwrites its payment-derived status.

**Verifier note:** Confirmed status is a writable column: record_payment/void_payment set it to 'paid'/'partial'/'sent' (migration :316-324); a separate generated payment_status handles amount derivation. Grep of migrations shows the only BEFORE UPDATE trigger on invoices is set_invoices_audit_actor (actor stamping), so no re-derivation neutralizes the write. Bulk fetch has no status filter; caller sends all selectedIds unfiltered. Medium: corrupts the workflow status used for filtering/dunning, though generated payment_status still reflects paid.

---

### 55. Article tag reads ignore deleted_at, so soft-deleted tag links persist and kept tags duplicate on every edit

- **File:** `src/lib/kbService.ts:199`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** updateKBArticle soft-deletes all tag links by setting deleted_at (line 307: .from('kb_article_tags').update({ deleted_at: now }).eq('article_id', id)) then re-inserts a fresh row for every current tag_id (lines 308-312). But both readers query kb_article_tags WITHOUT `.is('deleted_at', null)`: getKBArticleById (lines 198-201, .eq('article_id', id)) and getKBArticles (lines 157-160, .in('article_id', articleIds)). kb_article_tags has a deleted_at column (database.types.ts line 9071). ArticleEditorModal.updateMutation always passes tag_ids (line 102: tag_ids: selectedTagIds), so `input.tag_ids !== undefined` is always true on edits and the soft-delete+re-insert path (306-313) runs on every save.

**Failure scenario:** An article has tags [A, B]. The user edits it keeping both tags. updateKBArticle soft-deletes the existing A and B rows, then inserts new A and B rows -> kb_article_tags holds 4 rows (2 soft-deleted, 2 active). getKBArticleById reads all 4 (no deleted_at filter) and returns [A, B, A, B]: each tag renders twice with duplicate React keys, growing by 2 dead rows per edit. If instead the user REMOVES tag B, its link is soft-deleted but still returned by the readers, so B keeps showing; and the tag_id filter (lines 175-177) still matches the article by the removed tag.

**Suggested fix:** Add `.is('deleted_at', null)` to the kb_article_tags selects in getKBArticleById (line 199) and getKBArticles (line 158). Also make the re-tag path in updateKBArticle idempotent (skip already-active links) to stop accumulating dead rows.

**Verifier note:** Confirmed: deleted_at column exists (types line 9071); both readers (199, 158) omit the deleted_at filter; write path (307) soft-deletes then re-inserts; editor always sends tag_ids (ArticleEditorModal line 102) so the branch fires every edit. Anchored the primary line to 199 (getKBArticleById select) as cited; getKBArticles line 158 shares the defect. Failure holds regardless of whether a unique (article_id,tag_id) constraint exists: with one, the batch re-insert conflicts with the still-present soft-deleted row and (swallowed) fails, leaving stale rows; without/partial, duplicates accumulate. Either way readers surface soft-deleted links. Severity lowered from high to medium: display/correctness defect in peripheral KB domain.

---

### 56. KB version snapshots insert a non-existent 'changed_by' column, silently breaking all version history

- **File:** `src/lib/kbService.ts:243`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** createKBArticle (lines 238-245) and updateKBArticle (lines 297-304) insert into kb_article_versions with a `changed_by` key. That column does not exist on the table; the author column is `created_by` (database.types.ts lines 9119-9158: kb_article_versions columns are article_id, change_notes, content, created_at, created_by, deleted_at, id, tenant_id, title, updated_at, version_number). Supabase's PostgREST rejects an INSERT whose payload references an unknown column with PGRST204 ('Could not find the changed_by column ... in the schema cache'). Both inserts use `as never` casts (bypassing tsc) and do NOT destructure/check the result (no `const { error } =`), so the rejection is silently swallowed. Net effect: no rows are ever written to kb_article_versions.

**Failure scenario:** Create a KB article, then open it and click History. getKBArticleVersions (line 355) returns [] because the initial version insert (and every subsequent edit's snapshot) was rejected on the bogus `changed_by` column and the error discarded. The version-history panel always shows empty and Restore-version is permanently unusable. Auditability of article edits is lost, invisibly.

**Suggested fix:** Rename the key from `changed_by` to `created_by` in both inserts (lines 243 and 302), and capture the insert error (`const { error } = await supabase...`) so a failed snapshot surfaces instead of being swallowed.

**Verifier note:** Independently reproduced: types file (lines 9119-9158) confirms no `changed_by` column exists on kb_article_versions; `created_by` is the author column. Both call sites (243, 302) reference `changed_by` with `as never` and no result check. getKBArticleVersions (355) reads the empty table. Supabase PostgREST v12 returns PGRST204 on unknown-column INSERT. Severity lowered from high to medium: complete but silent break of a peripheral KB feature; no money/custody/tenant-isolation/data-corruption impact.

---

### 57. Publishing a draft article never sets published_at due to inverted/dead `!current.data` guard

- **File:** `src/lib/kbService.ts:288`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** logic-error

**What's wrong:** In updateKBArticle, published_at is only set under `if (input.status === 'published' && !current.data)` (line 288). current.data is the row fetched at line 270 for an EXISTING article, so it is truthy for any real article; `!current.data` is therefore always false and published_at is never assigned. The branch is dead either way: if current.data were falsy, the update at line 293 would match no row and line 295 would throw 'Failed to update article'. Additionally the line 270 select only pulls `version, title, content`, not published_at, so it could not check whether published_at was already set even if the condition were corrected.

**Failure scenario:** A user creates an article as a draft (createKBArticle stores published_at = null), then opens the editor and clicks Publish. ArticleEditorModal.handleSave('published') -> updateMutation -> updateKBArticle(..., status:'published'). status flips to 'published' but published_at stays null forever. KBArticleDetailPage's 'Published {date}' line (guarded by `article.published_at` at line 216) never renders, and any sort/report keyed on published_at is wrong for every article first published via an update rather than created published.

**Suggested fix:** Add published_at to the line 270 select and set it when transitioning to published and not already set, e.g. `if (input.status === 'published' && !current.data?.published_at) update.published_at = new Date().toISOString();`.

**Verifier note:** Confirmed by tracing: line 270 fetches the existing row (truthy current.data), line 288 gates on !current.data (always false), so published_at is never written; branch is dead per the line 293/295 throw on missing row. ArticleEditorModal (handleSave('published') line 124/338, updateMutation line 92-104) drives status:'published' through the update path, and KBArticleDetailPage line 216 gates the Published date on article.published_at. Severity retained at medium as cited.

---

### 58. Onboarding 'Load Sample Data' always throws — dead default-tenant lookup returns null under tenant RLS and gates seedDemoData

- **File:** `src/lib/onboardingService.ts:106`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** seedDemoData (onboardingService.ts:98-108) first queries tenants for slug='default' and throws 'Default tenant not found for demo data' if none is found; the fetched defaultTenantId is never used again (the demo customer and case insert with tenant_id: tenantId at lines 113/128). The tenants_select RLS policy is USING (id = get_current_tenant_id() OR is_platform_admin()) (baseline_schema.sql:9471-9472), so a normal onboarding user only sees their own tenant, whose slug is a user-chosen value (never literally 'default'). The .eq('slug','default').maybeSingle() query therefore returns null -> defaultTenantId undefined -> throw, before any insert runs. Live path: /onboarding route (App.tsx:117) -> OnboardingPage passes the current tenant id (OnboardingPage.tsx:18-61) -> components/onboarding/OnboardingWizard 'Load Sample Data' button (OnboardingWizard.tsx:156) which surfaces 'Failed to load sample data' on throw (lines 159-161).

**Failure scenario:** A newly provisioned tenant owner reaches onboarding step 'Sample Data' and clicks 'Load Sample Data'. seedDemoData runs the slug='default' lookup under their RLS scope (visibility limited to their own tenant, slug e.g. 'acme-recovery'), so data is null, defaultTenantId is undefined, and it throws 'Default tenant not found for demo data'. No demo customer/case is created and the user sees the toast 'Failed to load sample data'. The feature is broken for every tenant not literally named slug 'default'.

**Suggested fix:** Remove the unused default-tenant lookup and its throw (lines 99-108) — seedDemoData already inserts against the passed tenantId. Also provide a valid intake status when inserting the demo case (resolve the intake status_id+status pair via getIntakeStatusForCreation) so the v1.3.0 case-status guard accepts the insert once the gate is gone.

**Verifier note:** Independently reproduced. Confirmed the dead lookup + throw (lines 99-108), inserts use tenantId not defaultTenantId, the tenants_select RLS restricts SELECT to the caller's own tenant (baseline_schema.sql:9471), and the live wiring /onboarding -> OnboardingPage -> OnboardingWizard.handleLoadSampleData -> seedDemoData with the 'Failed to load sample data' toast. Lowered severity from high to medium: the feature is 100% broken but optional (a working 'Start from Scratch' path exists) with no data corruption or security impact. Edge case: a tenant that deliberately chose slug 'default' would pass the gate.

---

### 59. getEmployeeAttendance omits the deleted_at IS NULL filter, so soft-deleted attendance rows still drive pay (over-docked absence / over-paid overtime)

- **File:** `src/lib/payrollService.ts:583`
- **Severity:** 🟡 medium · **Verdict:** PLAUSIBLE · **Category:** incorrect-filter

**What's wrong:** getEmployeeAttendance (L581-604) selects attendance_records by employee_id and date range only, with no .is('deleted_at', null). attendance_records HAS a deleted_at column (baseline schema L186). The returned rows are counted into daysAbsent (L592, status==='absent') and overtimeHours (L595), both of which flow into computeEmployeePay (processPayroll L468-471): daysAbsent drives the Loss-of-Pay dock and overtimeHours drives paid overtime. A soft-deleted row would therefore still corrupt net pay. Every other read in payrollService correctly filters deleted_at; this pay-affecting query is the lone exception.

**Failure scenario:** An 'absent' or overtime-bearing attendance row is soft-deleted (deleted_at set). Re-processing that period, getEmployeeAttendance still returns the row and counts it, so computeEmployeePay docks LOP for a cancelled absence (or pays retracted overtime), producing a wrong net_salary.

**Suggested fix:** Add .is('deleted_at', null) to the attendance_records query in getEmployeeAttendance (line 583), matching every other payroll read.

**Verifier note:** PRECONDITION UNCONFIRMED: a full src grep for 'attendance_records' returns only two references, both SELECTs (this one and AttendanceDashboard.tsx L29) — there is NO insert/update/delete of attendance_records anywhere in the app, so the app itself cannot create a soft-deleted attendance row. The failure scenario therefore requires attendance data to be written/retracted by an external path (import, seed, direct DB) that honors the mandatory soft-delete convention. The missing filter is a genuine defect (inconsistent with all sibling reads) that corrupts pay if such a row exists, but is not reachable through current UI code.

---

### 60. Payroll record status is never advanced past 'calculated'; dashboard "Processed This Month" is permanently 0 and per-employee status badge is wrong even in paid periods

- **File:** `src/lib/payrollService.ts:993`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** broken-state-transition

**What's wrong:** processPayroll inserts every payroll_records row with status:'calculated' (line 490, committed at line 557). I grep-confirmed that this insert is the ONLY write to payroll_records anywhere in src — every other reference (getPayrollRecords L319, getPayrollRecord L334, getEmployeePayrollHistory L349, dashboard L987, pdf/dataFetcher L1105) is a SELECT. approvePayroll (L285-291) and markPayrollAsPaid (L299-305) call updatePayrollPeriod and mutate ONLY the payroll_periods row. A grep of the migrations for UPDATE...payroll_records found nothing but the RLS policy, so no DB trigger/RPC cascades period status onto the records. getDashboardStats line 993 computes processedThisMonth = records.filter(r => r.status === 'paid' || r.status === 'approved').length, which can never match and is structurally always 0. The same never-updated field drives PayrollPeriodDetailPage.tsx lines 320-330, which renders record.status (always 'calculated') for every employee.

**Failure scenario:** Admin processes June payroll (records inserted status='calculated'), approves the period (payroll_periods.status='approved'), then marks it paid (payroll_periods.status='paid'). PayrollDashboard 'Processed This Month' still shows 0, and PayrollPeriodDetailPage shows all employees with a 'calculated' badge, because no code path ever sets payroll_records.status to 'approved' or 'paid'.

**Suggested fix:** On approvePayroll/markPayrollAsPaid, bulk-update the period's records (UPDATE payroll_records SET status=... WHERE period_id=... AND deleted_at IS NULL), or derive processedThisMonth and the record-level display status from the parent period status instead of the never-updated record status.

**Verifier note:** Independently reproduced: insert at L557 is the sole payroll_records writer; approve/paid transitions touch only payroll_periods; no DB trigger updates the records (migration grep clean). Filter at L993 and badge at PayrollPeriodDetailPage.tsx L320-330 both read the frozen 'calculated' value. Display-only impact (no money corruption), so medium is on the high side but the wrong value is persistent in every processed period.

---

### 61. Date formats outside a 5-entry whitelist (incl. DD.MM.YYYY) silently degrade to 'dd MMM yyyy' on all PDFs

- **File:** `src/lib/pdf/configDate.ts:22`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** localization

**What's wrong:** toDateFnsFormat only maps five formats in KNOWN (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD MMM YYYY; lines 7-13). 'DD.MM.YYYY' — a standard civil date format (Germany/Austria/Switzerland/CIS) and a user-selectable option in DATE_FORMAT_OPTIONS (src/pages/settings/localizationCenter.ts:145) — is not in KNOWN. It contains no lowercase d/y, so the /[dy]/.test(raw) date-fns passthrough at line 23 also fails, and line 24 returns DEFAULT_PDF_DATE_FNS ('dd MMM yyyy'). The same silent degradation hits any stored format outside the five. The full PDF chain is real: geo_countries.date_format -> countryFactsService.ts:69 (dateFormat) -> countryConfig.ts:128 (locale.dateFormat = facts.dateFormat) -> config.locale.dateFormat -> invoiceAdapter.ts:88 fmtDateWithConfig(d, config.locale) -> toDateFnsFormat.

**Failure scenario:** A tenant selects (or whose country supplies) date_format 'DD.MM.YYYY'. Every invoice, quote, credit-note, advance-voucher and other PDF renders document dates as '09 Mar 2026' instead of the configured '09.03.2026' — a wrong date format on legal/financial documents. Reachable purely via the Localization Center picker regardless of seed data.

**Suggested fix:** Add 'DD.MM.YYYY':'dd.MM.yyyy' (and the other picker formats) to KNOWN, or generalize toDateFnsFormat to transliterate uppercase CLDR-ish tokens (YYYY->yyyy, DD->dd, MM->MM) with separators preserved instead of whitelisting exact strings.

**Verifier note:** Independently reproduced. Traced toDateFnsFormat('DD.MM.YYYY'): not in KNOWN (lines 7-13), /[dy]/ fails on all-uppercase, returns default. Confirmed DD.MM.YYYY is an offered option (localizationCenter.ts:145) and the PDF flow (countryFactsService.ts:69 -> countryConfig.ts:128 -> invoiceAdapter.ts:88). Distinct from already-cataloged bug #59 (UTC off-by-one in utils.ts:9). Severity medium retained: wrong date format on statutory PDFs.

---

### 62. India (in_gst) credit-note PDF renders forced HSN/Code and Unit columns as empty cells

- **File:** `src/lib/pdf/engine/adapters/creditNoteAdapter.ts:152`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** parity-field-mapping

**What's wrong:** For an India (in_gst) tenant, the credit-note engine path flips the statutory itemCode/unit line-item columns visible but the adapter never populates them, so every data cell in those columns prints blank. Trace: generateCreditNote (pdfService.ts:1120) -> buildCreditNoteViaEngine (pdfService.ts:238, unconditional, no flag guard) -> resolveCountryLayer('credit_note') (pdfService.ts:252) passes docType='credit_note' + the in_gst_invoice compliance profile into countryTemplateOverride (pdfService.ts:102-105). That profile carries forcedColumns=['item_code','unit_code'] (regimes/in_gst/documents.ts:33), so countryTemplateOverride (countryConfig.ts:107-112) emits override.sections=[{key:'lineItems',columns:[{key:'itemCode',visible:true},{key:'unit',visible:true}]}]. The credit_note built-in config uses lineItemColumns() which defines itemCode/unit hidden by default (templateConfig.ts:880-881,1017); resolveTemplateConfigWithCountry -> mergeColumns (templateConfig.ts:1301,1251-1257) flips both visible. But the credit-note adapter's row mapping (creditNoteAdapter.ts:152-157) emits only description/quantity/unitPrice/lineTotal and never itemCode/unit, and CreditNoteLineItem (types.ts:543-548) does not even carry item_code/unit_label. lineItemTable.ts:80-81 reads row[col.key] and, for the missing itemCode/unit keys, raw===undefined -> renders ''. The invoice and quote adapters do emit these keys (invoiceAdapter.ts:208-209, quoteAdapter.ts:194-195), so the same tenant's invoice/quote render the columns populated; the credit-note adapter is the only financial adapter that diverges.

**Failure scenario:** An India (in_gst) tenant issues a credit note with one or more line items and generates the PDF via generateCreditNote. The line-item table shows the statutory 'Code' (HSN/SAC) and 'Unit' (UQC) headers as visible, but every data row's Code and Unit cell is blank, while the corresponding invoice/quote for the same tenant renders those cells populated. The GST tax credit note is therefore visibly broken and non-compliant (HSN/SAC and UQC are mandatory on a revision of a tax invoice).

**Suggested fix:** Add item_code?: string | null and unit_label?: string | null to CreditNoteLineItem (types.ts) and populate them in fetchCreditNoteData, then emit itemCode: safeString(item.item_code ?? '') and unit: safeString(item.unit_label ?? '') in the adapter row mapping (creditNoteAdapter.ts:152-157), mirroring invoiceAdapter.ts:208-209. Alternatively suppress the forced-column override for the credit_note doc type if credit notes are not meant to carry item codes.

**Verifier note:** Independently reproduced the full config+render chain in current code; all cited lines verified (pdfService.ts:238/252/102-105, documents.ts:33, countryConfig.ts:107-112, templateConfig.ts:880-881/1017/1251-1257/1301, creditNoteAdapter.ts:152-157, types.ts:543-548, lineItemTable.ts:80-81). Confirmed the credit_note path is unconditional (not flag-gated) and that mergeColumns flips the hidden built-in columns visible. Severity lowered from high to medium: confirmed correctness/compliance defect producing a broken statutory document, but scoped to India regime + credit-note doc type with no monetary miscalculation, crash, data corruption, or security impact. Precondition (default case, no deployed credit_note template override re-hiding the columns) is the common real-world state.

---

### 63. Forensic report silently drops the authored 'Chain of Custody' section prose

- **File:** `src/lib/pdf/engine/adapters/reportAdapter.ts:611`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** content-loss

**What's wrong:** The forensic subtype seeds an editable `chain_of_custody_notes` prose section: SUBTYPE_SECTIONS.forensic includes it (line 231), proseSectionKeysForSubtype only drops `device_information` (line 320), reportSubtypeSections returns it with title+guidance (lines 306-315), and documentInstanceService.ts:246-257 inserts it into document_instance_sections as is_visible:true with editable content. At render, buildReportSections filters `chain_of_custody_notes` out of the prose keys (lines 610-612), and buildCustodyLog (lines 484-499) renders only the events table sourced from data.chainOfCustodyEvents — never data.sections. Any content the engineer types into that section is therefore never printed.

**Failure scenario:** On a forensic report the engineer writes 'Seals intact on receipt; media stored in evidence locker B; transferred to examiner 2026-07-02' into the Chain of Custody section and saves. The delivered PDF renders the custody events table but omits that authored context entirely — silent loss of legally-relevant content on a forensic record.

**Suggested fix:** Render the authored `chain_of_custody_notes` content (from data.sections) as an intro prose block before the custody events table, instead of filtering it out at reportAdapter.ts:610-612 and ignoring it in buildCustodyLog.

**Verifier note:** Full chain verified: seeding path (documentInstanceService.ts:246-257) inserts chain_of_custody_notes visible+editable; mapInstanceToReportData (documentInstanceData.ts:65-69) maps content→section_content into data.sections; buildReportSections line 610-612 explicitly `.filter((k) => k !== 'chain_of_custody_notes')`; buildCustodyLog uses only events, not data.sections. Authored content has no render path. Confirmed.

---

### 64. Seven sibling blob PDF generators lack the getBlob timeout/error-callback hardening, so an async rasterization failure never settles the promise

- **File:** `src/lib/pdf/pdfService.ts:1673`
- **Severity:** 🟡 medium · **Verdict:** PLAUSIBLE · **Category:** async-handling

**What's wrong:** generateOfficeReceiptAsBlob wraps getBlob with a reject-on-error third callback and races it against PDF_GENERATION_TIMEOUT via withTimeout (pdfService.ts:1401-1422), so a rasterization failure surfaces as a rejected promise. The seven sibling blob generators — generateCustomerCopyAsBlob (1499), generateCheckoutFormAsBlob (1547), generateCaseLabelAsBlob (1590), generateQuoteAsBlob (1631), generateInvoiceAsBlob (1673), generatePaymentReceiptAsBlob (1707), generatePayslipAsBlob (1732), generateChainOfCustodyAsBlob (1768) — use `return new Promise((resolve) => createPdfWithFonts(doc).getBlob(cb))` with NO error callback and NO timeout. The codebase itself documents that pdfmake can throw ASYNCHRONOUSLY during rasterization, which never fires the getBlob success callback and hangs the render (fonts.ts:348-350). If such an async failure occurs on a sibling path, the returned promise never resolves or rejects and the awaiting caller (e.g. a portal Download-PDF action) spins forever with no error and no fallback — unlike the office-receipt path which times out after 45s.

**Failure scenario:** A doc-definition triggers an asynchronous pdfmake rasterization error (the documented class: a font whose faces are absent from the VFS and not caught by the fontTableForVFS remap, or a similar async failure during doc.end() streaming). createPdfWithFonts(...).getBlob(successCb) never invokes successCb, and because the sibling wrapper passes no error callback and no timeout, the returned Promise from e.g. generateInvoiceAsBlob never settles; the caller awaiting it hangs indefinitely.

**Suggested fix:** Give the seven sibling blob generators the same hardening as generateOfficeReceiptAsBlob: pass getBlob's error callback to reject(err) and wrap the promise in withTimeout(..., PDF_GENERATION_TIMEOUT, 'PDF blob generation timeout').

**Verifier note:** Faulty logic CONFIRMED present: office-receipt has reject-callback + withTimeout (1401-1422); the seven siblings have neither (verified getBlob call sites 1499/1547/1590/1631/1673/1707/1732/1768). The async-hang failure mode is documented in-repo (fonts.ts:348-350), and the office-receipt hardening proves the team treats it as real. Downgraded to PLAUSIBLE because the reliable trigger is an unconfirmed precondition in current code: the primary documented async trigger (missing VFS font) is now mitigated by the fontTableForVFS Roboto remap (fonts.ts:355-366), and a corrupt embedded-image data URI most likely throws SYNCHRONOUSLY inside getBlob, which the `new Promise((resolve)=>...getBlob())` executor would convert into a rejection (handled by the outer try/catch) rather than a hang. The missing-timeout robustness gap is genuine; a perpetual hang requires a truly-async failure reaching an un-remapped path, which I could not confirm without executing pdfmake.

---

### 65. Performance-review reads never filter deleted_at — deleted reviews stay listed and counted in stats/average

- **File:** `src/lib/performanceService.ts:24`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** soft-delete-aggregation

**What's wrong:** deleteReview (performanceService.ts:100-107) is a soft delete (sets deleted_at). getReviews (24-56), getReview (58-75) and getPerformanceStats (120-139) never apply .is('deleted_at', null). RLS scopes tenant_id only, so soft-deleted reviews are still returned. getReviews feeds the PerformanceReviewsPage card grid and getPerformanceStats computes total/draft/submitted/completed counts and averageRating from every returned row including deleted ones. PerformanceReviewsPage.tsx consumes both (lines 175/180) with no client-side deleted_at filter.

**Failure scenario:** A manager deletes a performance review created in error with overall_rating=1. deleteReview sets deleted_at, but getReviews still returns it so the card reappears on the Performance Reviews page, and getPerformanceStats still counts it in Total Reviews and its status bucket and still includes rating 1 in averageRating — dragging the displayed average down even though the review was deleted.

**Suggested fix:** Add .is('deleted_at', null) to the queries in getReviews, getReview, and getPerformanceStats.

**Verifier note:** Verified performance_reviews.deleted_at exists in the Row type; deleteReview soft-deletes (line 103). getReviews/getReview/getPerformanceStats have no deleted_at filter. Confirmed PerformanceReviewsPage.tsx wires getPerformanceStats (line 175) and getReviews (line 180) with no client-side filter. CONFIRMED.

---

### 66. Tenants list plan filter always returns zero tenants (reads non-existent plan_code)

- **File:** `src/lib/platformAdminService.ts:195`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** getTenantsList filters by plan with results.filter(t => t.subscription?.plan_code === filters.plan). subscription = tenant.tenant_subscriptions[0], a tenant_subscriptions row, which has plan_id but no plan_code column (database.types.ts:17270-17298 lists plan_id only). results elements are typed any (line 187), so tsc does not flag it. At runtime t.subscription?.plan_code is always undefined, making the equality false for every row whenever a plan filter is set.

**Failure scenario:** A platform admin opens the Tenants page and selects any plan in the Plan dropdown (values 'trial'/'starter'/'professional'/'enterprise', TenantsListPage.tsx:107-111). getTenantsList runs results.filter(t => undefined === 'starter'), dropping every row, so the page shows 'No tenants found' no matter how many tenants exist on that plan.

**Suggested fix:** Filter against a real value — e.g. join subscription_plans and compare subscription_plans.code, and align the dropdown option values with that column. (Note plan_id is a UUID, so comparing to it directly would also require matching the dropdown values to plan UUIDs.)

**Verifier note:** Confirmed: no plan_code column on tenant_subscriptions; TenantsListPage even displays tenant.subscription?.plan_id (line 198), proving plan_id is the real column. Filter is completely non-functional. Severity adjusted high->medium: internal platform-admin filter breakage, no money/security/data-corruption impact.

---

### 67. Recruitment reads never filter deleted_at — deleted jobs/candidates stay listed, counted, and inflate applicant counts

- **File:** `src/lib/recruitmentService.ts:41`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** soft-delete-aggregation

**What's wrong:** deleteJob (recruitmentService.ts:116-123) and deleteCandidate (163-170) are soft deletes (set deleted_at). getJobs (40-80), the candidate_count subquery inside getJobs (64-67), getJob (82-91), getCandidates (125-138) and getRecruitmentStats (176-193) never filter deleted_at. RLS scopes tenant_id only, so deleted rows remain and the candidate_count subquery also counts soft-deleted candidates. These feed the Recruitment page job cards, pipeline columns (candidatesByStage), and the KPI row (Open Positions / Total Applicants / In Interview / Hired). RecruitmentPage.tsx is the only consumer and adds no client-side filter.

**Failure scenario:** A recruiter deletes a candidate in the interview stage. deleteCandidate sets deleted_at, but getCandidates still returns the row so the candidate card reappears in the Interview pipeline column, getRecruitmentStats still counts it in Total Applicants and In Interview, and the parent job's candidate_count in getJobs still includes it — so the job card shows one more applicant than actually exists. A deleted job likewise still appears in the job list and the Filter-by-Job dropdown.

**Suggested fix:** Add .is('deleted_at', null) to the queries in getJobs (both the jobs query and the candidate_count query), getJob, getCandidates, and both aggregate queries in getRecruitmentStats.

**Verifier note:** Verified recruitment_jobs.deleted_at and recruitment_candidates.deleted_at exist in the Row types; deleteJob/deleteCandidate soft-delete (lines 119/166). None of the five read/aggregate functions filter deleted_at, and the candidate_count subquery (lines 64-67) selects with only .in('job_id', jobIds). Confirmed RecruitmentPage.tsx is the sole consumer with no client-side deleted_at filter (grep showed the only deleted_at references in the recruitment path are the two service-layer delete writes). CONFIRMED.

---

### 68. Stock sales report overstates Gross Profit/Margin by counting collected tax as revenue

- **File:** `src/lib/stockService.ts:818`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** money

**What's wrong:** getSalesReport computes totalRevenue = Σ baseAmount(s,'total_amount') (line 818). baseAmount returns the *_base variant or the raw field (financialMath.ts:195-203), and stock_sales.total_amount is tax-INCLUSIVE — the schema carries separate subtotal, discount_amount, tax_amount, total_amount columns, and StockSaleDetailPage renders Total = total_amount as Subtotal − Discount + Tax (lines 324-346); StockSaleModal:351 builds total the same way. totalCost (lines 819-824) is tax-EXCLUSIVE cost_price × quantity. totalProfit = totalRevenue − totalCost (line 826) therefore adds collected tax (a remittable liability) into gross profit. StockReportsPage renders totalProfit as 'Gross Profit' (lines 384-386) and derives 'Gross Margin' = totalProfit/totalRevenue (lines 144-147, 391-392).

**Failure scenario:** Tenant with 15% VAT sells subtotal 100 (cost 60): total_amount=115. Report shows Gross Profit = 115−60 = 55 and Gross Margin = 55/115 = 47.8%, when correct figures are 40 and 40%. Every tax-collecting tenant sees inflated profit and margin.

**Suggested fix:** Base revenue on the net (pre-tax) amount: revenue = baseAmount(s,'total_amount') − baseAmount(s,'tax_amount') (or subtotal − discount), so profit = net revenue − cost.

**Verifier note:** Confirmed: baseAmount impl read (financialMath.ts:195), stock_sales columns (tax_amount, total_amount) confirmed in database.types.ts:15529 block, tax-inclusive total confirmed via StockSaleDetailPage total row, and StockReportsPage labels 'Gross Profit'/'Gross Margin' off totalProfit/totalRevenue.

---

### 69. Company "Primary Contact" query uses .eq('is_primary', true).maybeSingle() but is_primary is customer-scoped, so any company with 2+ primary contacts errors and shows no primary contact

- **File:** `src/pages/companies/CompaniesListPage.tsx:130`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** customer_company_relationships.is_primary means 'this company is the CUSTOMER's primary company' (per-customer; createCustomer inserts is_primary=true at customerService.ts:62, createCompany at companyService.ts:92, setPrimaryCompany is per-customer, uq_customer_primary_company is a per-customer unique index). It is NOT a company-scoped 'primary contact' flag, so multiple contacts of the same company can each carry is_primary=true for that company. The per-company subquery at lines 124-130 filters `.eq('company_id', company.id).eq('is_primary', true).is('deleted_at', null).maybeSingle()`. supabase-js maybeSingle() on a GET returning >1 row sets error PGRST116 and data=null; the error is destructured away (only `data: relationship` is read), so relationship becomes null and the 'Primary Contact' column renders '-' (lines 610-619).

**Failure scenario:** Create customers Alice and Bob each with company Acme selected in the customer form. createCustomer inserts a relationship row with is_primary=true for each. On the Companies list, the primary_contact subquery for Acme matches 2 rows; maybeSingle() returns PGRST116 with data=null, so Acme's Primary Contact column shows '-' even though it has contacts. This affects essentially every company with 2+ contacts linked as their primary company.

**Suggested fix:** Do not treat relationship.is_primary as a company-level primary-contact flag. As an immediate fix add `.order('created_at').limit(1)` before maybeSingle() to avoid the multi-row error; the correct fix is a dedicated company-primary-contact concept (or simply show the first/oldest contact). Same conflation exists at CompanyProfilePage.tsx:458 (contacts.find(c => c.is_primary)).

**Verifier note:** Independently reproduced: is_primary semantics confirmed in customerService.ts (l.59-62 comment 'it IS the customer's primary company', l.223 'uq_customer_primary_company allows one per customer') and companyService.ts:92. maybeSingle() >1-row PGRST116 behavior confirmed. The candidate said the query lacks a deleted_at filter; current code actually has `.is('deleted_at', null)` at line 129 — does not affect the multi-row error. Confirmed at the maybeSingle() call, line 130.

---

### 70. Company profile insights count cases/quotes by linked contacts' customer_id, not by company_id, inflating KPIs and disagreeing with the Cases/Financial tabs

- **File:** `src/pages/companies/CompanyProfilePage.tsx:219`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** company_insights derives customerIds from the company's contacts (line 201) and queries `cases ... .in('customer_id', customerIds)` (line 219) plus case_quotes by those case ids (line 244) to compute totalCases/completedCases/pendingCases/totalRevenue/totalQuotes. This counts every case of each linked contact — including that contact's personal cases (company_id null) and cases pinned to other companies the contact is also linked to. The Cases tab (CustomerCasesTab, line 785) and Financial tab (CustomerFinancialTab, line 787) rendered just below filter strictly by company_id (CustomerCasesTab.tsx:46-56: filterCol='company_id', .eq(filterCol, filterVal)). So the Overview KPIs contradict the tabs on the same page. Additionally the cases query has no .order() yet lastInteraction reads cases[0].created_at (line 280), an arbitrary row.

**Failure scenario:** Alice is a contact of Acme but also has 5 personal cases and 3 cases pinned to company Beta. Acme's profile Overview 'Total Cases' shows all 8 of Alice's unrelated cases (and their quote revenue), while the Cases tab directly below shows only cases whose company_id is Acme. Revenue and case KPIs for Acme are overstated and inconsistent with the rest of the page.

**Suggested fix:** Compute insights from cases filtered by company_id = id (matching CustomerCasesTab) and roll up quotes/invoices by company_id, so KPIs agree with the Cases/Financial tabs. Add an explicit `.order('created_at', { ascending: false })` before reading cases[0] for lastInteraction.

**Verifier note:** Confirmed: CompanyProfilePage line 219 filters by customer_id IN contacts; CustomerCasesTab.tsx:46-56 filters by company_id. Divergence real. lastInteraction cases[0] read at line 280 with no ORDER BY on the query at 216-219.

---

### 71. Customers list 'Company' column reads customer_company_relationships[0] with no deleted_at filter or ordering, so it shows an ended or non-primary company

- **File:** `src/pages/customers/CustomersListPage.tsx:172`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The list query embeds `customer_company_relationships ( companies (id, company_name, company_number) )` (lines 172-174) with no filter on the embedded relationship rows and no ordering, then the table renders `customer.customer_company_relationships[0].companies.company_name` (lines 745-751). PostgREST embeds do not auto-filter soft-deleted rows, so ended (deleted_at-set) relationships are returned, and [0] is an arbitrary relationship. makeCustomerIndividual (customerService.ts:362-365) soft-deletes every link (deleted_at set, is_primary=false) but keeps the rows, so those rows still surface in the embed. Every other company-resolution read filters is_primary + deleted_at (quotesService.ts:301-303, invoiceService.ts:339-341, pdf/dataFetcher.ts:630-631, getCompanyRelationships customerService.ts:130-131) — this embed is the outlier.

**Failure scenario:** A customer linked to Acme is converted to individual via makeCustomerIndividual (soft-deletes all links). On the Customers list the customer still displays 'Acme' in the Company column because the embed returns the soft-deleted relationship and [0] renders its company. Likewise, a customer with two active links whose primary is Beta can show Acme if Acme's row sorts first (order is unspecified).

**Suggested fix:** Select is_primary and deleted_at in the embed and pick the correct row in the render — `customer_company_relationships (is_primary, deleted_at, companies(...))` then `rels.find(r => r.is_primary && !r.deleted_at)?.companies` — or add a referenced-table filter `.is('customer_company_relationships.deleted_at', null)` and order by is_primary desc.

**Verifier note:** Confirmed: embed at lines 172-174 has neither filter; render at 745-751 uses [0]. Soft-delete-keeps-row confirmed in makeCustomerIndividual. Corroborating deleted_at+is_primary filters confirmed in quotesService.ts:301-303 and invoiceService.ts:339-341.

---

### 72. Dashboard 'created today' case count misses early-local-day cases (date string vs timestamptz)

- **File:** `src/pages/dashboard/Dashboard.tsx:63`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** timezone-off-by-one

**What's wrong:** The 'cases created today' count filters .gte('created_at', new Date().toISOString().split('T')[0]) (line 63). created_at is timestamptz, but the bound is a bare UTC date string ('2026-07-12'), which the DB (UTC session) treats as '2026-07-12 00:00:00+00'. The sidebar-badge query does it correctly by passing a full local-midnight instant (useSidebarBadges.ts:30-34: startOfToday.setHours(0,0,0,0); .toISOString()), so the two 'today' counts disagree.

**Failure scenario:** Browser TZ Asia/Dubai (UTC+4): a case created 01:30 local 2026-07-12 has created_at 2026-07-11T21:30Z < '2026-07-12', so it is excluded from 'today'. Conversely, loading the dashboard at 02:00 local (2026-07-11T22:00Z) makes new Date().toISOString() yield '2026-07-11', counting yesterday's cases as today.

**Suggested fix:** Match the sidebar-badge approach: const d = new Date(); d.setHours(0,0,0,0); and pass d.toISOString() as the gte bound so the timestamptz comparison is a true local-start-of-day instant.

**Verifier note:** Read Dashboard.tsx lines 45-73 and useSidebarBadges.ts lines 25-41. Confirmed the divergence: Dashboard line 63 uses a bare UTC date string against timestamptz created_at, while the sidebar hook uses local setHours(0,0,0,0).toISOString(). Cited line correct.

---

### 73. 'This Month' revenue KPI conflates the same calendar month across different years

- **File:** `src/pages/financial/RevenueDashboard.tsx:131`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** date-logic

**What's wrong:** thisMonth = revenueData.filter(inv => inv.invoice_date !== null && new Date(inv.invoice_date).getMonth() === new Date().getMonth()) (line 131) matches on month index only, ignoring the year. The fetched revenueData query uses only .gte('invoice_date', dateRange.from) (line 95), and for the 'year' filter dateRange.from is one year ago (line 66; default/'all' goes back to 2020 at line 69), so invoices from the same calendar month in a prior year also satisfy getMonth()===currentMonth.

**Failure scenario:** Set the dashboard filter to 'Year' in July 2026. revenueData spans 2025-07-12..2026-07-12. The 'This Month' header stat (formatCurrency(thisMonthRevenue), line 164) sums amount_paid of BOTH July 2025 and July 2026 invoices, overstating current-month revenue by the prior-July amount.

**Suggested fix:** Compare year and month together: d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); or filter invoice_date >= start-of-current-month ISO string.

**Verifier note:** Read lines 45-166. Confirmed line 131 filters on getMonth() only; the query (lines 79-101) is not month-bounded and the 'year'/'all' ranges pull >1 year, so prior-year same-month rows leak into thisMonthRevenue used at line 164. Cited line correct.

---

### 74. VAT Audit KPI totals (Collected / Paid / Net Position) are corrupted by the record-type table filter

- **File:** `src/pages/financial/VATAuditPage.tsx:187`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The three headline KPI cards (VAT Collected / Paid / Net Position) are derived at lines 187-189 from `vatRecords`, which is fetched by the single query at lines 98-107 whose `recordType` argument is bound to the Records-table dropdown: `recordType: recordTypeFilter !== 'all' ? recordTypeFilter : undefined` (line 102). `fetchVATRecords` (vatService.ts:56-58) then applies `.eq('record_type', filters.recordType)`. So when the user changes the lower table's All/Sales/Purchases selector, the same query narrows and the top KPIs recompute off the type-filtered subset. `salesRecords`/`purchaseRecords` (lines 182-183) are re-filtered from that already-narrowed list, forcing one side to zero. This is a distinct, still-present bug from the already-fixed base-currency mixing (audit #70, lines 187-188 already use vat_amount_base).

**Failure scenario:** A period has 10,000 output VAT (sales) and 3,000 input VAT (purchases). User selects 'Purchases' in the VAT Records dropdown (recordTypeFilter='purchase'). The query re-runs with recordType='purchase', so `fetchVATRecords` returns only purchase rows; `salesRecords` is empty -> `totalVATCollected = 0`. `netVATPosition = 0 - 3000 = -3000`, rendered as formatCurrency(Math.abs(-3000)) = 3000 with sub-label 'Reclaimable' (line 268-269). The dashboard headline now falsely claims zero VAT collected and a 3,000 reclaim for a period that actually owes 7,000 net — driven purely by an unrelated table filter.

**Suggested fix:** Decouple the KPI aggregates from the table's record-type filter. Either run a dedicated KPI query with recordType always undefined (keyed only on dateRange), or render the already-fetched `getVATStats` totals (currently discarded into `_vatStats` at line 117) for the cards, and let the table keep its own type-filtered query.

**Verifier note:** CONFIRMED. Query at lines 98-107 binds recordType to recordTypeFilter (line 102); fetchVATRecords applies `.eq('record_type', ...)` at vatService.ts:56-58. KPI cards (lines 250-280) consume totalVATCollected/totalVATPaid/netVATPosition computed at 187-189 from the same vatRecords list that is re-filtered into salesRecords/purchaseRecords at 182-183. Selecting 'purchase' empties salesRecords -> totalVATCollected 0 -> Net flips to a false Reclaimable. Distinct from audit #70 (currency mixing), which is already fixed here. Line 187 and the query citation are accurate; medium severity appropriate for a corrupted tax headline figure.

---

### 75. Support ticket 'Unassigned' and 'Assigned to Me' filters send invalid strings to a uuid column

- **File:** `src/pages/platform-admin/SupportTicketsPage.tsx:42`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The Assigned To dropdown offers option values 'unassigned' and 'me' (SupportTicketsPage.tsx:212-213) which flow through filters.assignedTo (line 42) into getSupportTickets, which does query.eq('assigned_to', filters.assignedTo) (platformAdminService.ts:406). support_tickets.assigned_to is a uuid column (baseline_schema.sql:3353). Comparing a uuid column to text 'unassigned'/'me' makes Postgres raise 'invalid input syntax for type uuid'. getSupportTickets destructures only { data } (line 413) and ignores the error, so data is null and rows becomes [].

**Failure scenario:** A platform admin selects 'Unassigned' (or 'Assigned to Me') in the Assigned To filter. The query errors on the uuid cast, the error is swallowed, and the ticket list shows 'No tickets found' every time — the admin can never list unassigned tickets or their own tickets via this filter.

**Suggested fix:** Handle the sentinels in getSupportTickets before the .eq: for 'unassigned' use .is('assigned_to', null); for 'me' resolve the current platform admin id (getCurrentPlatformAdmin) and .eq('assigned_to', adminId); use .eq with a raw value only for real uuids.

**Verifier note:** Confirmed end-to-end: dropdown sentinels (212-213) -> filters.assignedTo (42) -> .eq('assigned_to', sentinel) (platformAdminService.ts:406) against a uuid column (schema:3353), with the error swallowed at line 413. Anchored to the sentinel-introduction site as given; the actual .eq/fix site is platformAdminService.ts:405-407 and getSupportTickets.

---

### 76. Portal "Total Paid" sums refunded, failed, and pending payments as money received

- **File:** `src/pages/portal/PortalPayments.tsx:106`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** money-aggregation

**What's wrong:** The portal payments query (lines 85-97) filters only by customer_id and deleted_at IS NULL with no status restriction, and totalPaid (lines 106-109) reduces baseAmount over the entire list regardless of status. void_payment (migration 20260601092707_atomic_record_and_void_payment_rpcs.sql:350) sets status='refunded' WITHOUT writing deleted_at, so a voided payment stays in the portal list. Sibling aggregations (financialReportsService generateCashFlowReport) filter status='completed'; this one does not. The per-row Badge (line 219) even renders the 'refunded'/'failed' status, yet the headline still includes the amount.

**Failure scenario:** Customer has a completed $1000 payment and a completed $500 payment; the $500 is later voided via void_payment (status becomes 'refunded', deleted_at stays NULL). The portal Payments page shows a red 'refunded' badge on the $500 row, but the "Total Paid" card displays $1500 instead of the $1000 actually received, overstating money received on a customer-facing forensic surface. Pending/failed payments inflate it the same way.

**Suggested fix:** Count only completed payments in the total (and ideally in the query): add .eq('status','completed') to the query, or compute totalPaid over list.filter(p => (p.status ?? '').toLowerCase() === 'completed').

**Verifier note:** Independently confirmed: void_payment leaves deleted_at NULL while flipping status to 'refunded' (migration :350; corroborated by src/lib/advanceVoucherService.ts:25 and advanceVoucherService.test.ts:66-70). Current PortalPayments query has no status filter and baseAmount sums unconditionally. Not in the already-fixed set (that fix was on the advanceVoucherService held-advance picker, a different surface). Display-only KPI, hence medium not high.

---

### 77. Editing a quote from the list page silently discards title, client reference, and bank account changes

- **File:** `src/pages/quotes/QuotesListPage.tsx:717`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** save-handler-dropping-fields

**What's wrong:** The list-page edit branch's quoteFields object (lines 717-725) passes only status, valid_until, tax_rate, discount_amount, discount_type, terms, and notes to updateQuoteService. It omits `title`, `client_reference`, and `bank_account_id` — all editable in QuoteFormModal and all real persisted columns (quotesService pickQuotePersistFields lines 151-153). QuoteDetailPage.handleEditQuote forwards title/client_reference/bank_account_id (QuoteDetailPage.tsx:150,153,158), so the two edit paths disagree.

**Failure scenario:** User clicks the Edit (pencil) button on a draft/sent quote row in the Quotes list, changes the quote title (or client reference, or bank account) in the modal, and clicks Update Quote. The mutation succeeds with a success toast, but updateQuote is never given the new title, so the quote keeps its old title — the edit is silently lost.

**Suggested fix:** Add `title`, `client_reference`, and `bank_account_id` to the quoteFields object (mirroring QuoteDetailPage.handleEditQuote) so list-page edits persist the same fields as detail-page edits.

**Verifier note:** Read quoteFields (717-725) — title/client_reference/bank_account_id absent. Confirmed pickQuotePersistFields persists all three (151-153) and QuoteDetailPage forwards them. Divergence and data loss confirmed.

---

### 78. Creating a quote from the list page drops per-line unit code, unit label, and HSN/SAC item code

- **File:** `src/pages/quotes/QuotesListPage.tsx:762`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** save-handler-dropping-fields

**What's wrong:** In the quote create branch, the line-item mapping (lines 762-767) only emits description, quantity, unit_price, and sort_order — dropping unit_code, unit_label, and item_code that QuoteFormModal collects per line. createQuote persists these when provided (quotesService.ts:507-509 map `item.unit_code ?? null` etc.), and the list page's own edit branch (lines 731-733) includes them, so create and edit are inconsistent.

**Failure scenario:** User creates a new quote, sets a line item's Unit (e.g., GB) and its HSN/SAC item code, and saves. createQuote receives items without unit_code/unit_label/item_code, so `item.unit_code ?? null` persists null. The saved quote and its PDF show no unit or tax item code for the line, though the user entered them; the same quote edited later would keep them.

**Suggested fix:** Map unit_code, unit_label, and item_code in the create-branch quoteItems (as the edit branch already does): `unit_code: item.unit_code ?? null, unit_label: item.unit_label ?? null, item_code: item.item_code ?? null`.

**Verifier note:** Read create-branch map (762-767) — only 4 fields. Confirmed createQuote persists these columns (499-514) and the edit branch (727-735) includes them. Undefined inputs coerce to null. Confirmed.

---

### 79. GDPR customer lookup selects a non-deterministic customer (no ORDER BY) for irreversible anonymize / data export

- **File:** `src/pages/settings/GDPRCompliancePage.tsx:115`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** searchCustomer (src/pages/settings/GDPRCompliancePage.tsx:107-123) runs `.from('customers_enhanced').select('id, customer_name, email').or('email.ilike…,customer_name.ilike…,mobile_number.ilike…,customer_number.ilike…').is('deleted_at', null).limit(1).maybeSingle()` with NO ORDER BY. With multiple matching rows, Postgres returns an arbitrary row (plan/physical-order dependent), and that arbitrary row's id becomes selectedCustomerId. That id is then consumed by processDeletion (L82-105, irreversible anonymize_customer_data at L96) and processExport (L63-80, personal-data download at L70). The confirm dialog (L87-92) says only 'this customer' and the success toast (L119) shows one name/email, which does not disambiguate when two customers share a name — the operator has no way to see or choose among the other matches.

**Failure scenario:** A tenant has two customers named 'Ahmed Ali'. An operator handling a deletion request searches 'Ahmed Ali'; the query returns whichever row the planner emits first, the confirm dialog only says 'anonymize this customer', and the operator confirms — irreversibly anonymizing the WRONG Ahmed Ali. For an export request the same arbitrary selection downloads the wrong customer's full case/invoice/payment history, a cross-customer personal-data leak.

**Suggested fix:** Return the full match set (drop limit(1)/maybeSingle) and require the operator to pick a specific customer, or at minimum add a stable ORDER BY and block the destructive action when more than one customer matches the search term.

**Verifier note:** CONFIRMED from the code: the query definitively has no ORDER BY before limit(1), so among multiple matches the selection is arbitrary, and selectedCustomerId feeds both the irreversible anonymize and the export. Moved anchor line from 110 to 115 (the `.limit(1)` that, absent ORDER BY, makes the pick non-deterministic). The harmful outcome requires the ordinary precondition of >1 customer matching the search term (common names / partial matches), which is a realistic data state, so I keep this CONFIRMED at medium rather than PLAUSIBLE.

---

### 80. Number-sequence edit cannot clear a format template back to the classic format

- **File:** `src/pages/settings/SystemNumbers.tsx:160`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** logic

**What's wrong:** Line 160 sends `p_format_template: format_template || undefined`, so blanking the Format Template field yields '' -> undefined -> SQL NULL. The verified DB body does `format_template = COALESCE(p_format_template, format_template)` (plan line 3644), so NULL keeps the stored template. This directly contradicts the field's own help text at line 438 ("Leave the template blank to keep the classic prefix and number format above"): blanking a previously-set template does NOT revert to classic PREFIX-#### rendering. get_next_number stays in its v2 template branch (plan line 3525) and keeps minting the templated form. `p_fiscal_year_anchor: fiscal_year_anchor || undefined` (line 162) has the identical defect.

**Failure scenario:** An admin previously set format_template='INV/{FY}/{SEQ:4}' on the 'invoices' sequence. They later want plain INVO-#### again, clear the Format Template field, and click Update. The toast says success, but the DB keeps 'INV/{FY}/{SEQ:4}', so get_next_number keeps producing the templated string. There is no UI path to remove a template once set.

**Suggested fix:** Distinguish "unset/keep" from "clear" for these optional fields — e.g. send an empty-string sentinel the RPC interprets as NULL-out, or add an explicit reset flag/branch — since COALESCE-to-stored can never represent clearing a field.

**Verifier note:** CONFIRMED independently. Same COALESCE mechanism as candidate 1, verified in the deployed 9-arg function; the violated promise is spelled out in the modal's own help text (line 438).

---

### 81. Number-sequence edit cannot switch reset basis back to "never" (silent no-op)

- **File:** `src/pages/settings/SystemNumbers.tsx:161`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** data-integrity

**What's wrong:** Line 161 maps `p_reset_basis: reset_basis === 'never' ? undefined : reset_basis`. Selecting "No automatic reset" therefore sends `undefined` (=> SQL NULL). I verified the deployed 9-arg `update_number_sequence` body (localization-phase1 plan lines 3639-3648, confirmed live by scripts/financial/p3-numbering-regression.sql:40 which calls the 9-arg signature) does `reset_basis = COALESCE(p_reset_basis, reset_basis)`. COALESCE(NULL, stored) keeps the previously-stored basis, so a change from 'fiscal_year'/'calendar_year' to 'never' is silently discarded while the mutation's onSuccess still fires the "updated successfully" toast. There is no path in the UI to disable an already-set reset.

**Failure scenario:** A sequence has reset_basis='fiscal_year'. Admin opens Settings > System & Numbers, sets Reset Basis to "No automatic reset", saves. The toast reports success but the DB keeps 'fiscal_year'. The control is broken and lies about the outcome. If that sequence is in template mode with a template that lacks {FY} (e.g. 'INVO-{SEQ:4}'), get_next_number (plan lines 3558-3560) still resets current_value to 0 at the next fiscal-year rollover and re-issues INVO-0001, duplicating a legal tax-invoice number — and the admin cannot turn the reset off.

**Suggested fix:** Pass the literal selection so 'never' is actually persisted (the DB CHECK accepts 'never'): `p_reset_basis: reset_basis`. Because a COALESCE-to-stored argument can never express "clear/reset this field", the RPC needs a distinct sentinel or the client must always send the explicit value for this field.

**Verifier note:** CONFIRMED. COALESCE behavior and the 161 mapping verified directly. Downgraded severity high->medium: the unconditional part (control is a silent no-op that reports success) is certain, but the catastrophic duplicate-number consequence requires template mode WITHOUT a {FY} token — in the legacy (no-template) branch reset_basis is ignored entirely (reset is driven by reset_annually), and a {FY}-bearing template keeps per-year numbers textually distinct.

---

### 82. Stock receive/usage mutations don't invalidate the stock list or stats cache (stale KPIs & quantities)

- **File:** `src/pages/stock/StockItemDetail.tsx:171`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** cache-invalidation

**What's wrong:** receiveMutation.onSuccess (lines 170-177) and usageMutation.onSuccess (lines 183-190) invalidate only stockKeys.item(id!) and stockKeys.transactions(id). Neither invalidates stockKeys.items() (the paginated list, keyed [...stockKeys.items(), filters, page, pageSize] with staleTime 30000 in StockListPage.tsx:120-123) nor stockKeys.stats() (KPIs, staleTime 60000 in StockListPage.tsx:129-133). stockKeys.item(id) = [...all,'item',id] does NOT prefix-match the list key [...all,'items',...] ('item' != 'items'), so no incidental invalidation occurs. editMutation at line 197 invalidates stockKeys.items(), confirming the intended pattern is broader. Verified via stockService.ts: recordStockReceipt (line 411) / recordStockUsage (line 437) change quantity_on_hand through an RPC, and current_quantity is a generated mirror; getStockStats (line ~766) computes stockValue from current_quantity*cost_price and lowStockCount from current_quantity vs minimum_quantity.

**Failure scenario:** Stock list shows Stock Value $10,000 and item X qty 2 with a Low Stock badge. Click into item X, Receive Stock +100 units, then return to the Stock list within 60s. The list still shows qty 2, Stock Value $10,000, and the Low Stock KPI unchanged, because ['stock','list',...] (30s) and ['stock','stats'] (60s) were never invalidated and remain within staleTime. Operators act on stale inventory counts.

**Suggested fix:** In both receiveMutation.onSuccess and usageMutation.onSuccess add queryClient.invalidateQueries({ queryKey: stockKeys.items() }) and queryClient.invalidateQueries({ queryKey: stockKeys.stats() }), mirroring editMutation.

**Verifier note:** Independently reproduced. Confirmed key shapes in queryKeys.ts (item vs items differ), staleTimes in StockListPage.tsx (30000/60000), and that recordStockReceipt/recordStockUsage mutate quantity in stockService.ts. Real staleness bug.

---

### 83. Total Value / Total Spend KPIs sum PO rows client-side with no pagination — silent truncation past the PostgREST row cap

- **File:** `src/pages/suppliers/PurchaseOrdersListPage.tsx:159`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** money-aggregation

**What's wrong:** The stats query fetches every non-deleted PO's amounts with select('total_amount, total_amount_base').is('deleted_at', null) (lines 159-163) and reduces them in JS (lines 165-168) with no .range()/limit. PostgREST caps unranged selects at the server db-max-rows (Supabase default ~1000, treated as active throughout the repo's own e2e-performance audit), so the sum silently truncates past that many rows. SuppliersListPage.tsx:137-142 is the identical pattern for Total Spend (reduced at line 142). Migration perf_p2c_financial_stats_base_rpcs (manifest:303) moved the quote/payment/transaction stat sums onto SQL RPCs specifically to eliminate this fetch-all-and-reduce-in-JS truncation; these two PO/supplier sums were left on the vulnerable pattern.

**Failure scenario:** A tenant with 1500 non-deleted purchase orders opens the Purchase Orders (or Suppliers) page. The Total Value / Total Spend KPI only sums the first ~1000 rows PostgREST returns, understating the true total by the value of the remaining ~500 POs, with no error.

**Suggested fix:** Compute the aggregate server-side via a SQL RPC (SUM of total_amount_base filtered by deleted_at, matching the perf-p2c financial-stats approach) instead of fetching all rows and reducing in the client; optionally restrict to committed statuses if 'spend' should exclude Draft/Cancelled.

**Verifier note:** Code confirmed at both cited locations: unbounded select + JS reduce, no .range(). The truncation mechanism is the repo's own documented assumption (audit lines 383/415 conclude 'no max-rows override found; default 1000 applies' and label the identical transactions/payments pattern a correctness bug), and perf-p2c fixed the analogous financial sums via RPC — these two were missed. Precondition is >1000 non-deleted POs in one tenant; plausible since the production tenant already carries 1,481 transactions / 1,114 payments. Medium severity retained.

---

### 84. PAYMENT.SALE.COMPLETED subscription lookup uses the sale/transaction id instead of the subscription id

- **File:** `supabase/functions/paypal-webhook/index.ts:151`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** paypalSubscriptionId is derived as event.resource?.id || event.resource?.billing_agreement_id (line 151). For PAYMENT.SALE.COMPLETED the resource is a sale object: resource.id is the sale/transaction id and the subscription id lives in resource.billing_agreement_id. Since resource.id is always present, the || fallback is dead code and paypalSubscriptionId becomes the transaction id. The handler then looks up tenant_subscriptions with .eq('paypal_subscription_id', paypalSubscriptionId) (line 277), but that column stores the I-XXXX subscription id (set in paypal-create-subscription:258), so the lookup returns null.

**Failure scenario:** A recurring renewal fires PAYMENT.SALE.COMPLETED with resource.id='6JR...tx' and billing_agreement_id='I-ABC'. Lookup by paypal_subscription_id='6JR...tx' finds nothing (subscription null at line 280). No billing_invoices row is inserted and the status:'active' re-activation (lines 315-323) never runs, so a past_due tenant that just paid is never restored to active and the paid invoice is never recorded.

**Suggested fix:** For sale/payment events prefer the billing agreement id: const paypalSubscriptionId = event.resource?.billing_agreement_id || event.resource?.id; (or branch on event_type) so subscription events use resource.id and sale events use billing_agreement_id.

**Verifier note:** Verified line 151 derivation and line 277 lookup against the I-XXX subscription id stored at paypal-create-subscription:258. Matches documented PayPal Subscriptions-API webhook shape (sale.id = transaction, billing_agreement_id = subscription). Precondition: the sale resource must carry custom_id to pass line 153; when it does, the lookup still fails as described.

---

### 85. Webhook idempotency guard keys on row-existence, not processing completion, and is not atomic with the state updates — a mid-processing failure makes PayPal retries permanent no-ops

- **File:** `supabase/functions/paypal-webhook/index.ts:176`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** idempotency

**What's wrong:** The billing_events insert with a unique paypal_event_id (lines 165-172) is the sole idempotency guard: on a 23505 duplicate the handler short-circuits and returns received:true (lines 175-183) without checking whether the prior delivery finished (processed_at). The state transitions (switch, lines 187-346) and the processed_at stamp (lines 348-351) run after the insert and are not in the same transaction. If the function is terminated between the insert and the stamp, the event row exists with processed_at NULL; PayPal redelivers, the insert hits 23505, and the handler skips it — the state change is never applied. The schema's own processed_at column, stamped only at the very end, exists precisely to track completion yet the dedup ignores it.

**Failure scenario:** BILLING.SUBSCRIPTION.CANCELLED for tenant X is delivered; billing_events insert succeeds (processed_at NULL); the tenant_subscriptions update then times out / the edge function is killed → non-2xx. PayPal retries the same event id; line 176 detects the duplicate and returns received:true immediately. tenant_subscriptions/tenants are never set to 'cancelled', so a cancelled tenant keeps active access with no further retry able to fix it.

**Suggested fix:** On 23505, re-read the existing row and only short-circuit when processed_at IS NOT NULL; otherwise reprocess. Better: wrap ledger insert + state updates + processed_at stamp in a single DB transaction (RPC) so recording and applying are atomic.

**Verifier note:** Non-atomic dedup logic verified directly (insert at 165, short-circuit at 175-183, processing at 187+, stamp at 348). Failure requires a mid-execution termination between insert and stamp — a normal operational event for edge functions plus PayPal's retry-on-5xx, not something the code guards against; hence the flaw is definite even though the trigger is environmental.

---

### 86. Platform PayPal billing invoice mints from the tenant's legal tax-invoice series

- **File:** `supabase/functions/paypal-webhook/index.ts:287`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** On PAYMENT.SALE.COMPLETED the webhook calls `get_next_number_for_tenant(p_tenant: tenantId, p_scope: 'invoices')` (line 287) and stores the result as `billing_invoices.invoice_number` (line 299). I confirmed scope 'invoices' is the tenant's OWN legal customer-facing tax-invoice series: invoiceService.getNextInvoiceNumber (invoiceService.ts:406-419) routes tax invoices to get_next_invoice_number -> get_next_number('invoices'), the phase2 requirement gate mints get_next_number('invoices') for tax invoices (rpc_snapshots/phase2_requirement_gate_and_snapshots.sql:366), and SCOPE_REGISTRY labels it "Sequential tax invoices (legal series)" with the EU VAT Art.226/GCC gapless note. billing_invoices is the platform charging the tenant for SaaS (tenant-as-customer), a different document family, yet it advances and consumes a number from the tenant's own gapless tax series and hides it in a platform table the tenant never sees.

**Failure scenario:** A tenant's next customer tax invoice would be INVO-0042. A PayPal subscription payment fires; the webhook mints INVO-0042 for the platform billing_invoices row. The tenant then issues their next real invoice as INVO-0043. Their legal tax-invoice sequence now has a permanent gap at 0042 (the number exists only in billing_invoices), breaking the gapless sequential numbering their VAT authority requires.

**Suggested fix:** Give platform SaaS billing its own scope (e.g. get_next_number_for_tenant(tenantId, 'billing_invoices') or a platform-level sequence) and never draw billing_invoices numbers from the tenant's customer-facing 'invoices' series.

**Verifier note:** CONFIRMED. Scope 'invoices' is verifiably shared between platform billing and the tenant's legal tax invoices; the gap is a deterministic consequence of the shared mint. This is distinct from the prior Bug #75 fix (which only addressed auth.uid() being null under service-role and happened to bless the 'invoices' scope). Impact is realized only when subscription payments actually flow through this webhook and the tenant is under a gapless-numbering regime.

---

### 87. Follow-up email re-sent (duplicate) when SMTP close() throws after a successful send

- **File:** `supabase/functions/process-scheduled-followups/index.ts:158`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** duplicate-send

**What's wrong:** The idempotency design (documented in the header) is: atomically CLAIM the row pending->sent BEFORE the irreversible SMTP send (lines 134-149), and on send FAILURE release the claim back to 'pending' for retry. But smtpClient.send() (line 152) and smtpClient.close() (line 158) live in the SAME try block. denomailer's send() resolves only after the SMTP server accepts the message (DATA committed); close() then issues QUIT and tears down the socket and can throw on a connection reset / already-closed socket. If close() throws after a successful send, control enters the catch (line 159), which reverts status to 'pending' and clears sent_at (lines 166-173). The next 15-minute scanner tick re-selects the now-'pending' follow-up and re-sends the frozen email.

**Failure scenario:** Scanner dispatches an auto-send email follow-up. The claim succeeds (status='sent'), smtpClient.send() succeeds and the customer receives the email, but smtpClient.close() throws (transient socket error / server already closed the connection after accepting DATA). The catch reverts status to 'pending', sent_at=null. On the next tick the same frozen email is delivered to the customer again (repeating up to the attempt_count cap of 3), defeating the claim-before-send guarantee.

**Suggested fix:** Wrap only send() in the try that triggers the revert; move close() into a finally or its own try/catch that never routes to the revert path, e.g. `try { await smtpClient.send(...); } catch (e) { /* revert */ } finally { try { await smtpClient.close(); } catch {} }`. A close() error after a committed send must not revert the claim.

**Verifier note:** CONFIRMED by reading lines 151-178: send() (152) and close() (158) share one try; catch (159) reverts status->pending / sent_at=null (166-173). Structural defect is unambiguous. Precondition — close() throwing after a successful send — is a real, well-documented SMTP-client failure mode (Gmail frequently drops the socket post-DATA), so the idempotency guarantee is violated by a foreseeable event. Severity medium (duplicate customer communication, bounded by the attempt cap).

---

### 88. send-otp-email uses a module-global _corsHeaders shared across concurrent requests, yielding wrong CORS origin on responses

- **File:** `supabase/functions/send-otp-email/index.ts:24`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** race-condition

**What's wrong:** _corsHeaders is module-level mutable state (line 24), assigned per request at line 75 (_corsHeaders = corsHeaders) and read by jsonResponse (line 29) when building every JSON response. Between the assignment and the response there are multiple await points: req.json() (92), supabase.rpc('check_rate_limit') (105/177), and the SMTP send (156). The Deno/Supabase edge runtime processes concurrent requests within the same isolate sharing module scope, so a second request can overwrite _corsHeaders while the first is awaiting.

**Failure scenario:** Two OTP requests arrive concurrently from two different allowlisted origins (e.g. https://xsuite.space and https://space-recovery.pages.dev). Request A sets _corsHeaders to A's origin then awaits (req.json / rpc / SMTP). During that await Request B runs and overwrites _corsHeaders with B's origin. When Request A resumes and calls jsonResponse, its response carries Access-Control-Allow-Origin for origin B, so the browser blocks A's response and the user's email verification intermittently fails.

**Suggested fix:** Remove the module-global. Build corsHeaders as a request-local const and pass it into a per-request response builder (as portal-login / send-document-email already do), eliminating cross-request shared mutable state.

**Verifier note:** Confirmed by reading the file: _corsHeaders is genuinely module-scoped, set before awaits and read after them; the sibling functions provision-tenant and send-document-email use a request-local corsHeaders, confirming this is the deviating anti-pattern. Only manifests when concurrent requests from DIFFERENT allowlisted origins overlap in one isolate; same-origin concurrency is harmless, so impact is intermittent — medium severity is appropriate.

---

### 89. Export 'To' date filter excludes every record created after midnight on the selected end day

- **File:** `supabase/migrations/20260630195733_data_migration_export_rpc.sql:16`
- **Severity:** 🟡 medium · **Verdict:** CONFIRMED · **Category:** off-by-one-date-range

**What's wrong:** ExportWizard passes the 'To' value from an HTML <input type="date"> (ExportWizard.tsx:141-146), i.e. a date-only 'YYYY-MM-DD' string, unchanged through exportClient.runExport into p_filters.dateTo (exportClient.ts:43). The export RPC coerces it with v_to := nullif(p_filters->>'dateTo','')::timestamptz (line 16), which yields midnight at the START of that day, and every entity branch filters created_at <= v_to (e.g. line 53). Any record created after 00:00:00 on the chosen end date is therefore excluded. The 'From' side uses created_at >= v_from at midnight (line 52), correctly including the whole start day, so the range is asymmetric and silently drops the final day's records from a filtered export.

**Failure scenario:** A lab exports Case Records with From=2021-08-01, To=2021-08-07. A case created 2021-08-07 09:30 has created_at '2021-08-07 09:30+00', which is > v_to ('2021-08-07 00:00+00'), so it is omitted even though the operator intended 7 Aug to be included. The exported workbook is missing the entire final day.

**Suggested fix:** Treat dateTo as inclusive of the whole day: set v_to := (nullif(p_filters->>'dateTo','')::date + 1)::timestamptz and filter created_at < v_to, or filter created_at < (v_to + interval '1 day'), so records on the end date are captured regardless of time-of-day.

**Verifier note:** Independently reproduced. Confirmed <input type="date"> at ExportWizard.tsx:133/142 yields date-only strings; exportClient.ts:43 forwards dateTo unchanged; RPC line 16 casts to timestamptz (midnight) and the created_at <= v_to filter (line 53 etc.) is applied to all branches while the From side uses >= v_from (line 52). Asymmetric off-by-one confirmed. Medium severity is fair for a silently-truncated filtered export.

---

## ⚪ Low (33)

### 90. receive_stock_from_po overwrites received_quantity instead of accumulating; multi-shipment partial receipts corrupt received tracking

- **File:** `docs/migrations-pending/2026-07-10-perf-p2b-receive-stock-from-po-rpc.sql:49`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The live RPC (manifest confirms applied as version 20260710104252; called by stockService.ts receiveStockFromPO) sets `received_quantity = v_qty` on the PO line (SQL line 49) rather than accumulating, while quantity_on_hand is correctly incremented `+ v_qty` (line 37). Across multiple partial receipts the two counters diverge: received_quantity reflects only the last shipment. ReceiveStockModal.tsx defaults each row's Qty Received to the full ordered quantity (line 55) with no received-so-far display and no over/re-receive guard.

**Failure scenario:** PO line orders 10. Receive 4 → received_quantity=4, on_hand+4. Later receive 6 → received_quantity is overwritten to 6 (should be 10) while on_hand correctly becomes +10 total. The PO line reports 6 received against 10 ordered even though all 10 arrived, and the two counters permanently disagree.

**Suggested fix:** Accumulate: `SET received_quantity = COALESCE(received_quantity,0) + v_qty` (and consider clamping to ordered quantity). Separately, show received-so-far and default the modal's Qty to the remaining quantity to prevent accidental re-receipt.

**Verifier note:** SQL logic confirmed at line 49 (overwrite) vs line 37 (accumulate); manifest confirms this is the live version and no later migration supersedes the received_quantity write (the pending fu4 migration touches sibling RPCs only). Severity lowered from medium to low: received_quantity is not consumed by any UI/money/inventory decision (only an export column in workbookContract.ts), and the repo audit records the stock feature as unused (0 rows). The on_hand double-count aggravator requires a user to re-open and re-confirm the modal (missing guard), not an RPC computation error.

---

### 91. Toggling an invoice on when the receipt is fully allocated auto-fills its FULL outstanding (0 || fallback bug)

- **File:** `src/components/banking/RecordReceiptModal.tsx:274`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** over-allocation

**What's wrong:** In toggleInvoice the default is round3(Math.min(outstanding, Math.max(left, 0)) || outstanding), where left is the receipt's unallocated remainder. When the receipt is already fully allocated (left <= 0), Math.min(outstanding, Math.max(left,0)) evaluates to 0 and the `|| outstanding` fallback substitutes the invoice's full outstanding balance instead of 0 — the classic 0 || fallback defect. The intended default in that state is 0.

**Failure scenario:** Receipt amount = 100. User checks INV-A (outstanding 100) -> allocated 100, unapplied 0. User then checks INV-B (outstanding 50): left = round3(100 - 100) = 0, so the expression is min(50, max(0,0)) = 0, then 0 || 50 = 50, and INV-B is auto-allocated its full 50. Total allocated becomes 150 against a 100 receipt (unapplied = -50). The remainingZero submit guard blocks saving, so the user sees a spurious over-allocation they must manually remove instead of INV-B being added at 0.

**Suggested fix:** Drop the `|| outstanding` fallback: next.set(inv.id, round3(Math.min(outstanding, Math.max(left, 0)))) and skip/delete when the result is 0, so toggling an invoice with an exhausted receipt allocates 0 rather than the full outstanding.

**Verifier note:** Reproduced by tracing the expression: operator precedence applies || after Math.min; left=0 yields 0 || outstanding = outstanding. Over-allocation surfaces in the grid but is caught pre-save by canSubmit's remainingZero (remaining = amount - totalAllocated = -50 != 0), so impact is a UX annoyance, not persisted data corruption — low severity is correct.

---

### 92. Stage Banner transition does not refresh the Case Activity timeline (invalidates a dead query key)

- **File:** `src/components/cases/detail/CaseStageBanner.tsx:109`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** cache-invalidation

**What's wrong:** transitionMutation.onSuccess invalidates ['case', caseId], ['case-allowed-transitions'], and ['case_job_history', caseId]. CaseActivityTab (CaseActivityTab.tsx:16) reads from caseKeys.activity(caseId) = ['cases','activity',caseId]. ['case_job_history', caseId] is used nowhere else in the codebase as a query key (grep confirms line 109 is the only occurrence), so that invalidation is a no-op. ['case', caseId] (singular 'case') does not prefix-match ['cases','activity',caseId] (plural 'cases'), so the activity timeline is never invalidated. The Overview status path (useCaseMutations.ts:147) additionally invalidates ['cases'], which DOES prefix-match and refresh the timeline — the banner omits that, so the banner path leaves it stale.

**Failure scenario:** User is viewing the History tab's 'Case Activity' sub-view and clicks a transition button in the always-visible Stage Banner (e.g. 'Move to Recovery'). A case_job_history row is written server-side and the banner/header update, but the mounted activity query is not invalidated, so the timeline keeps showing stale entries until the user switches tabs or reloads.

**Suggested fix:** In CaseStageBanner's onSuccess, invalidate the real key: queryClient.invalidateQueries({ queryKey: caseKeys.activity(caseId) }) (and/or ['cases']), and drop the dead ['case_job_history', caseId] key. Also consider ['case_history', id] used by useCaseQueries.

**Verifier note:** Independently reproduced. Grep confirms ['case_job_history', caseId] appears ONLY at CaseStageBanner.tsx:109 (never as a real query key). CaseActivityTab.tsx:16 uses caseKeys.activity = ['cases','activity',caseId]; ['case', caseId] does not prefix-match it (case vs cases). useCaseMutations.ts:147 invalidates ['cases'] on the Overview path, confirming the contrast. Low severity: UI staleness only, self-corrects on tab switch/refocus.

---

### 93. Import Summary lists all cross-domain entities instead of only the imported domain's sheets

- **File:** `src/components/dataMigration/ImportWizard.tsx:399`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** wrong-data-scope

**What's wrong:** ImportSummary.counts is built by importClient.emptyCounts(), which iterates the full cross-domain IMPORT_ORDER (importClient.ts:43-47), so it always contains every entity key across all five domains. runImport starts from that object and only increments the imported domain's entities, returning the full counts (importClient.ts:129,173). The Summary step renders Object.entries(summary.counts).map(...) (ImportWizard.tsx:399) with no domain filter, unlike the Validate step (line 265) and the Import-progress step (line 338), which both scope rendering to domainEntities. As a result the summary of a Case Records import also lists InventoryLocations, StockItems, Employees, PurchaseOrders, etc., each showing '0 inserted / 0 skipped'.

**Failure scenario:** Import a Case Records workbook. The Summary screen shows the 26 records sheets (with real counts) followed by ~18 sheets from the inventory/procurement/stock/hr domains (e.g. 'Employees 0 inserted', 'StockSales 0 inserted') that are not part of this import and cannot appear in a records file, presenting confusing/irrelevant rows to the operator.

**Suggested fix:** Scope the summary rendering to the domain, e.g. iterate DOMAIN_ENTITIES[domain] and read summary.counts[entity], mirroring the Validate and Import-progress steps.

**Verifier note:** Independently reproduced. Confirmed emptyCounts (importClient.ts:45) iterates IMPORT_ORDER (all domains via WORKBOOK_DOMAINS.flatMap), runImport returns that full object, and ImportWizard:399 renders Object.entries(summary.counts) unfiltered while lines 265 and 338 use domainEntities. Real inconsistency, but purely a cosmetic display issue with no data/correctness impact — low severity.

---

### 94. proratedVat computes each credit note's VAT independently against the full invoice, leaving a residual across multiple partial credits

- **File:** `src/components/financial/CreditNoteModal.tsx:50`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** financial-math

**What's wrong:** proratedVat() (lines 47-52) reverses VAT as allocateLargestRemainder(invoiceTax, [creditAmount, invoiceTotal - creditAmount], decimals)[0] (line 50), re-prorating against the FULL invoice total/tax on every call and ignoring VAT already reversed by prior credit notes on the same invoice. allocateLargestRemainder (financialMath.ts:38-70) rounds each call independently to minor units, so the VAT shares of several partial credit notes that together credit the whole invoice do not necessarily sum to the invoice tax. The function's own doc comment (lines 44-46) claims 'the credited + remaining VAT sum exactly to the invoice VAT', which is true only for a single credit note, not across a sequence. The modal caps each credit at the remaining balance (lines 69-77, max={balance}) and permits repeated partial credits, so the multi-credit sequence is reachable in normal use.

**Failure scenario:** Invoice total 100.00, tax_amount 10.00 (2 decimals). Three sequential credit notes of 33.33, 33.33, 33.34 fully credit the invoice. I traced allocateLargestRemainder for each: CN1 -> [333,667] minor units so creditedShare 3.33; CN2 identical -> 3.33; CN3 (weights [33.34, 66.66]) -> [333,667] -> 3.33. Sum of reversed VAT = 9.99, but invoice VAT = 10.00. The invoice is 100% credited (balance 0) yet 0.01 of output VAT is stranded unreversed on a settled invoice.

**Suggested fix:** Prorate against the residual rather than the full invoice each time: base the split on the invoice VAT not yet reversed by prior credit notes and the credit relative to the remaining uncredited balance, so the reversed VAT across all credit notes sums to the invoice VAT exactly when fully credited.

**Verifier note:** CONFIRMED by hand-executing allocateLargestRemainder (financialMath.ts:38-70) for all three credit notes with the candidate's inputs; each returns 3.33, totalling 9.99 vs the 10.00 invoice tax. proratedVat (line 50) demonstrably re-prorates against invoiceTotal/invoiceTax every call with no state from prior credits, and the modal supports sequential partial credits (max={balance}, balance recomputed from credited_amount at lines 69-77). Severity is genuinely low (0.01-scale residual), but the discrepancy is real and contradicts the function's documented invariant.

---

### 95. VATReturnDetailModal load effect has no cancellation — a fast return switch can show another return's reconciliation

- **File:** `src/components/financial/VATReturnDetailModal.tsx:24`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** race-condition

**What's wrong:** The `useEffect` (lines 24-29) fires `Promise.all([getReturnLines(vatReturn.id), getReturnLedgerRows(vatReturn)])` keyed on `[vatReturn]` and unconditionally `setLines`/`setLedger` on resolution, with no cancellation flag or cleanup return. If `vatReturn` changes (user opens a different return) before the first fetch resolves, the two effect runs' async fetches can resolve out of order and the later write wins, mixing return A's ledger into the modal now titled for return B. The reconciliation verdict (lines 39-41) is computed from `ledger` state against the CURRENT `vatReturn.output_vat`/`input_vat` prop, so a stale ledger yields a wrong Reconciled / NOT reconciled banner on a compliance surface.

**Failure scenario:** User clicks Eye on return A (Jan-Mar), whose getReturnLedgerRows fetch is slow, then immediately clicks Eye on return B (Apr-Jun). B resolves first and renders correctly; then A's slower fetch resolves and overwrites `ledger` with A's rows while the modal still shows B's period (title from vatReturn prop, line 44) and recomputes `reconciled` using B's output_vat/input_vat against A's subledger — falsely flagging B 'NOT reconciled' (or falsely 'Reconciled').

**Suggested fix:** Guard the effect: `let cancelled=false; Promise.all(...).then(([l,r]) => { if(!cancelled){ setLines(l); setLedger(r);} }); return () => { cancelled = true; };`, or track the in-flight vatReturn.id and ignore resolutions whose id no longer matches the current prop.

**Verifier note:** CONFIRMED as a defect. Lines 24-29 verified: Promise.all with unconditional setLines/setLedger, no cleanup, keyed on [vatReturn]. reconciled at 39-41 mixes `ledger` state with current-prop output_vat/input_vat, and the title (line 44) is prop-driven, so a stale ledger overwrite desyncs the banner from the displayed return. The faulty logic (missing cancellation) is definitively present; the precondition is out-of-order resolution of two overlapping fetches (fast switch + adverse network timing) — a genuine React data-fetching race, not guaranteed on every switch. Low severity is fair.

---

### 96. Supplier communication logging silently discards Communication Date and follow-up fields; displayed date is always created_at

- **File:** `src/components/suppliers/CommunicationFormModal.tsx:87`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** data-loss

**What's wrong:** The form collects a required Communication Date (lines 165-172) plus Follow-up required / Follow-up date (lines 191-213), but both the insert (lines 87-96) and update (lines 72-79) persist only type, subject, content, sent_by (+ tenant_id/supplier_id). supplier_communications has no communication_date / follow_up_required / follow_up_date columns (database.types.ts:15929-15984 lists only content, created_at, deleted_at, direction, id, sent_by, subject, supplier_id, tenant_id, type, updated_at), so those inputs are dropped. The Communications tab then renders comm.created_at as the date (SupplierProfilePage.tsx:642).

**Failure scenario:** A user logs a phone call from 2026-07-05, sets Communication Date to 2026-07-05, and ticks Follow-up required with a date. The record saves with no error, but the tab displays the created_at timestamp (2026-07-12) as the date and no follow-up is ever stored or scheduled. The backdated date and the follow-up intent are lost silently.

**Suggested fix:** Either add the communication_date/follow_up_* columns and persist them, or remove/disable those inputs so the UI does not claim to capture data it drops; at minimum stop marking Communication Date required when it is not stored.

**Verifier note:** Confirmed: table columns in generated types lack all three fields; insert/update field lists confirmed; SupplierProfilePage.tsx:642 renders comm.created_at. Silent discard of a required input plus the entire follow-up feature is real. Severity lowered from medium to low: this is a non-financial supplier communications log with no downstream money/security/custody impact.

---

### 97. Sidebar preference load discards ALL saved DB fields if the user touches any one preference before the SELECT resolves

- **File:** `src/contexts/SidebarPreferencesContext.tsx:87`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** race-condition

**What's wrong:** The load effect (74-111) fetches sidebar_position, is_collapsed, and collapsed_sections. When the SELECT resolves it checks userInteractedRef.current (87) and, if true, returns early applying NONE of the fetched fields (88-90). userInteractedRef is set true by setPosition (115), toggleCollapsed (124), and setExpandedSection (135) on ANY single interaction, and is never reset - not even in the userId effect. So changing one preference before the round-trip completes silently drops the load of every other saved preference for the session. The comment (53-57) intends only to avoid stomping the user's just-changed field with stale data, but the guard is applied to the whole row rather than per-field.

**Failure scenario:** A user whose server row has sidebar_position='right' and an expanded 'resources' section opens the app on a device whose localStorage hint is left/collapsed. The sidebar mounts from the hint (left); before the Supabase SELECT returns (a 200ms-2s round trip during which the sidebar is already interactive), the user clicks the collapse toggle, setting userInteractedRef.current=true. The SELECT lands, sees the ref true, and returns without applying anything - so the sidebar stays on the left with no section expanded for the rest of the session instead of loading the saved right position and 'resources' section.

**Suggested fix:** Track interaction per field (or by timestamp) and only skip fields the user actually changed after mount, letting an in-flight SELECT still hydrate untouched fields; also reset userInteractedRef.current=false at the top of the userId effect so a later user's row is not suppressed by a prior user's interaction.

**Verifier note:** Confirmed the early-return-applies-nothing logic and that the ref is write-only. The user's own change is still persisted via persist(), so the state self-heals on the next clean reload - transient and cosmetic (sidebar placement only). Downgraded medium->low accordingly; the secondary user-switch concern is largely unreachable because staff signOut does a full window.location.replace which remounts and resets the ref.

---

### 98. getFeatureLimit / getCurrentUsage coerce a limit_value of 0 into null (unlimited) via `|| null`, bypassing a hard zero limit

- **File:** `src/lib/billingService.ts:603`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** getFeatureLimit returns data?.limit_value || null (line 603) and getCurrentUsage builds limits with featureMap.get(...)?.limit_value || null (lines 517, 521, 525, 529). Because 0 || null === null, a plan feature whose numeric limit_value is 0 is reported as null. The intended semantics are NULL = unlimited, 0 = zero allowed — confirmed by the DB RPC assert_expense_import_allowed (returns early only when v_limit IS NULL, otherwise treats 0 as a hard cap: v_current+row_count > 0 blocks all) and by the rest of the codebase using 0-preserving reads (featureGateService.ts:121 direct assignment; PlansPage.tsx:118-120 uses ?? null). checkUsageLimit (line 544) returns allowed:true whenever metric.limit === null, so a 0 limit is treated as unlimited.

**Failure scenario:** A restricted plan sets multi_branch (or max_users) limit_value = 0. getCurrentUsage line 529 computes 0 || null = null; checkUsageLimit(tenant,'branches') sees limit null → allowed = true. The tenant creates branches/users without bound despite the plan forbidding them. limit_value=0 is a real, storable value: PlanFeatureFormModal.tsx:189 stores parseInt('0')=0.

**Suggested fix:** Use nullish coalescing that preserves 0: return data?.limit_value ?? null; and featureMap.get(k)?.limit_value ?? null at lines 517/521/525/529, matching featureGateService and PlansPage.

**Verifier note:** Verified the || null coercion at lines 603 and 517-529, the checkUsageLimit null-means-unlimited branch at 544, and the divergent-but-correct 0-preserving handling elsewhere (featureGateService.ts:121, PlansPage.tsx:118-120) plus the DB RPC semantics — confirming NULL=unlimited, 0=zero is the intended contract this code breaks.

---

### 99. getBillingStats 'this month' revenue window keeps current time-of-day, dropping early-of-1st invoices

- **File:** `src/lib/billingService.ts:647`
- **Severity:** ⚪ low · **Verdict:** PLAUSIBLE · **Category:** correctness

**What's wrong:** getBillingStats filters paid invoices with .gte('paid_at', new Date(new Date().setDate(1)).toISOString()) (line 647). setDate(1) only changes the day-of-month and keeps the current hours/minutes/seconds, so the lower bound is the 1st of the month at the current time-of-day instead of 00:00:00 at the start of the month.

**Failure scenario:** On the 12th at 14:30, the lower bound becomes 'the 1st at 14:30', so any invoice paid on the 1st between 00:00 and 14:30 is excluded from revenueThisMonth, understating month-to-date revenue when such invoices exist.

**Suggested fix:** Build the boundary at true start of month: const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1); start.setHours(0,0,0,0); use start.toISOString().

**Verifier note:** Date logic bug confirmed (setDate(1) preserves time-of-day). Downgraded to PLAUSIBLE/low: getBillingStats has no caller anywhere in the repo (grep: only defined in billingService.ts, never imported), so revenueThisMonth is never displayed and the understatement does not manifest in production today. Also only affects invoices paid on the 1st before the current time-of-day.

---

### 100. getCasePayments returns empty list on any query error, hiding real payments

- **File:** `src/lib/caseFinanceService.ts:150`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** swallowed-error

**What's wrong:** getCasePayments catches a query error with `if (error) { return []; }` (lines 150-152), swallowing the failure and returning an empty payments array instead of throwing. Callers cannot distinguish 'no payments' from 'query failed'. getCaseExpenses (line 123) in the same file correctly `throw error`, confirming the inconsistency.

**Failure scenario:** A transient error hits the payment_allocations query for a case with recorded payments. getCasePayments returns [], so the case Finances payments-list tab renders as if the customer never paid.

**Suggested fix:** Throw the error (or surface it) instead of returning [] on error, matching getCaseExpenses.

**Verifier note:** Code defect confirmed (deliberate `return []` on error). Severity lowered medium→low and failure-scenario corrected: the case's outstanding balance / paid totals are computed by getCaseFinancialSummary from invoices.amount_paid, NOT by getCasePayments, so this only blanks the payments-list tab — it does not itself corrupt the outstanding-balance figure the candidate claimed.

---

### 101. max_branches usage limit uses `|| null`, turning a configured 0-branch cap into 'unlimited'

- **File:** `src/lib/featureGateService.ts:246`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** feature-gate

**What's wrong:** In checkUsageLimit(), the max_branches case resolves the plan limit with `limit = branchLimit?.limit || null;` (line 246), while every other case uses null-coalescing `?? null` (max_users:209, max_cases_per_month:224, max_storage_gb:233, max_customers:257, max_expenses_per_month:272). featureMap stores the raw limit_value (line 122: `limit: f.limit_value`), so a plan_features row for feature_key='multi_branch' with limit_value=0 yields branchLimit={enabled, limit:0}, and `0 || null` collapses to null. Downstream, line 281 (`allowed: limit === null || current < limit`) and canPerformAction line 295 (`if (usage.limit === null) return { allowed: true }`) both treat null as unlimited.

**Failure scenario:** A plan tier that grants zero additional branches encodes multi_branch limit_value=0. checkUsageLimit('max_branches') returns limit:null/allowed:true and canPerformAction('max_branches') always returns allowed:true, letting a tenant that should be capped at 0 create unlimited branches through any flow gated solely on this usage check.

**Suggested fix:** Change line 246 to `limit = branchLimit?.limit ?? null;` to match the other five cases and preserve a genuine 0 limit.

**Verifier note:** The `|| null` vs `?? null` inconsistency is objectively present and objectively wrong for limit_value=0. Precondition is an admittedly unusual plan config (multi_branch feature present with limit 0); severity low as scoped. All other limit cases correctly use `?? null`.

---

### 102. getCasesForAssignment caps at 100 cases, so donors cannot be assigned to older active cases in busy labs

- **File:** `src/lib/inventoryCaseAssignmentService.ts:214`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** getCasesForAssignment fetches active cases ordered by created_at DESC with `.limit(100)` (line 214). AssignToCaseModal loads the full result into state (line 68) and maps it directly into caseOptions (line 111) handed to SearchableSelect (line 156); the select filters the provided options client-side only (no server-side onSearch re-query). So any active case beyond the 100 most-recent is absent from the picker. RLS scopes the query to the tenant, so the 100 cap is per-tenant.

**Failure scenario:** A tenant with 150 concurrently active cases needs to attach a donor PCB to an older still-active case (e.g. one in 'recovery' created before the 100 most recent). That case never appears in the assignment dropdown, so the donor cannot be linked to it, breaking the device-to-case linkage/chain of custody for that job.

**Suggested fix:** Remove/raise the limit, or make the picker query the server by the typed search term instead of filtering a fixed 100-row client cache.

**Verifier note:** Code behavior (limit 100 + pure client-side filter) verified in both the service and AssignToCaseModal. Failure is deterministic once a tenant exceeds 100 active cases; that threshold is plausible for a busy lab but not guaranteed for typical tenants. Low severity.

---

### 103. Inventory 'In Use' KPI is hardcoded to 0 and always shows 0 regardless of active case assignments

- **File:** `src/lib/inventoryService.ts:747`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** getInventoryInsights returns `totalInUse: 0` unconditionally (line 747) — it never queries inventory_case_assignments. getInventoryStatistics does the same (line 661). InventoryListPage passes insights.totalInUse into InventoryInsightsHeader as inUseCount (line 334), which renders it as a first-class StatCard labelled 'In Use' (InventoryInsightsHeader.tsx:40). The tile is therefore a deterministic 0 presented as a real metric.

**Failure scenario:** A lab with 12 donor drives assigned to open cases (12 inventory_case_assignments with returned_at IS NULL) still sees 'In Use: 0' on the inventory KPI strip, so managers cannot tell how much donor stock is committed to live cases.

**Suggested fix:** Compute the real count (e.g. count inventory_case_assignments where returned_at IS NULL AND deleted_at IS NULL for the tenant) and return it from getInventoryInsights instead of the hardcoded 0.

**Verifier note:** Confirmed the value is hardcoded and rendered as a labelled KPI. Downgraded from medium to low: this is a display/reporting inaccuracy only — no data, money, custody, or logic impact. Real but cosmetic.

---

### 104. getLeaveStats month/today boundaries use toISOString(), off by one day for east-of-UTC clients

- **File:** `src/lib/leaveService.ts:345`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** timezone-date-math

**What's wrong:** getLeaveStats derives monthStart/monthEnd/today via new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] etc. (leaveService.ts:345-347). new Date(y, m, d) is browser-local midnight; .toISOString() converts to UTC, so for any client east of UTC (e.g. Gulf UTC+4 — this product references Muscat) local midnight of the 1st becomes ~20:00 UTC on the last day of the PREVIOUS month, shifting the whole month window back one day. reviewed_date is written with currentTenantToday() (approve line 220 / reject line 249), which tenantToday.ts confirms returns a tenant-local YYYY-MM-DD, so the read/stats window is misaligned with the stored dates. The write paths were fixed to use tenantToday(); this read path still uses the raw toISOString pattern.

**Failure scenario:** On a browser in UTC+4 during July 2026, monthStart computes to '2026-06-30' and monthEnd to '2026-07-30' (both a day early). Approved-This-Month therefore counts a leave approved on tenant-local 2026-06-30 (previous month) and excludes one approved on 2026-07-31, so the Approved/Rejected-This-Month KPIs are wrong on boundary days; 'today' similarly resolves to yesterday for the first four hours of each local day, misclassifying On Leave Today.

**Suggested fix:** Compute the month/today boundaries in the tenant timezone using the existing tenantToday()/currentTenantToday() helpers plus addMonthsIso for the month window, or format with a local formatter like date-fns format(...,'yyyy-MM-dd') instead of toISOString().split('T').

**Verifier note:** Verified leaveService.ts:345-347 use new Date(...).toISOString().split('T')[0]. Confirmed via tenantToday.ts that currentTenantToday() (used at approve line 220 / reject line 249 for reviewed_date) returns a tenant-local YYYY-MM-DD, establishing the read-vs-write timezone mismatch. Boundary misclassification for UTC+ clients is real; impact is limited to boundary days, so low severity is correct. CONFIRMED.

---

### 105. getCurrentPayrollPeriod uses maybeSingle(); two overlapping monthly periods covering today make it throw and zero out the payroll dashboard

- **File:** `src/lib/payrollService.ts:256`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** error-handling

**What's wrong:** getCurrentPayrollPeriod (L247-260) filters payroll_periods to start_date <= today <= end_date, period_type='monthly', deleted_at IS NULL, and ends with .maybeSingle() (L256). supabase-js .maybeSingle() returns a PGRST116 error when the query matches more than one row, and L258 (if (error) throw error) rethrows it. I verified there is NO uniqueness or overlap constraint on payroll_periods (only pkey + tenant fkey in the baseline), and ProcessPayrollPage.handleCreatePeriod (L51-61) creates a period_type='monthly' row defaulted to the current month with no duplicate/overlap check. getDashboardStats calls getCurrentPayrollPeriod first (L969) with no try/catch, so its rejection propagates and the whole stats query errors.

**Failure scenario:** An admin creates the current month's payroll period, then creates it again (a duplicate, or a second draft, or one already-processed period plus a new draft for the same month). Both are period_type='monthly' with ranges covering today. getCurrentPayrollPeriod's .maybeSingle() sees 2 rows and errors; getDashboardStats rejects, so PayrollDashboard shows no stats (Total Payroll / Processed / Average all fail to load and the Current Period banner disappears) even though valid periods exist.

**Suggested fix:** Make the query deterministic and non-throwing: add .order('start_date', { ascending: false }).limit(1) before .maybeSingle(), or handle the multi-row case explicitly instead of letting maybeSingle error.

**Verifier note:** Independently reproduced: no DB overlap/unique constraint on payroll_periods, ProcessPayrollPage has no dedup guard, getDashboardStats (L968-1004) has no try/catch. maybeSingle() erroring on >1 row is standard supabase-js behavior. Reachable but requires the somewhat-unusual state of two overlapping monthly periods, so low severity is correct.

---

### 106. Tenant health-score revenue counts deleted and non-completed payments

- **File:** `src/lib/platformAdminService.ts:258`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** missing-filter

**What's wrong:** In calculateHealthScore the payments query (lines 258-262) filters only by tenant_id and payment_date, with no `.is('deleted_at', null)` and no `.eq('status','completed')`, then sums it as revenue (line 274). recordHealthMetrics repeats the same unfiltered query (lines 323-327) and persists the sum into tenant_health_metrics.revenue_last_30d (line 345). Confirmed the payments table has both `deleted_at` and a `status`/'completed' value (used correctly by generateCashFlowReport in financialReportsService.ts).

**Failure scenario:** A tenant has a voided (soft-deleted) or pending/failed payment in the last 30 days. Both queries count its amount as revenue: recordHealthMetrics stores an inflated revenue_last_30d, and calculateHealthScore can flip the `revenue === 0` penalty (line 291) off based on money never collected.

**Suggested fix:** Add `.is('deleted_at', null)` and `.eq('status','completed')` to the payments queries in both calculateHealthScore (258) and recordHealthMetrics (323).

**Verifier note:** Confirmed both queries omit the filters. Severity low retained: for the score itself the value is only used at the zero/non-zero boundary (line 291), but the persisted revenue_last_30d metric is genuinely inflated by voided/pending/failed payments.

---

### 107. At-Risk dashboard 'Days Since Login' is always 0 (metric never persisted)

- **File:** `src/lib/platformAdminService.ts:338`
- **Severity:** ⚪ low · **Verdict:** PLAUSIBLE · **Category:** correctness

**What's wrong:** recordHealthMetrics inserts into tenant_health_metrics (lines 338-347) but never sets days_since_last_login, even though calculateHealthScore computes daysSinceLogin (line 282). calculateHealthScore also does not return it, so the value is discarded. Every row recordHealthMetrics writes therefore falls back to the column DEFAULT 0 (baseline_schema.sql:3461 — not NULL as the candidate stated).

**Failure scenario:** If recordHealthMetrics is the source of a tenant_health_metrics row, the At-Risk Tenants table reads tenant.health?.days_since_last_login || 0 (PlatformDashboard.tsx:275) and renders '0 days' for a tenant that has not logged in for months, misleading retention decisions.

**Suggested fix:** Have calculateHealthScore also return daysSinceLogin and include days_since_last_login: health.daysSinceLogin in the recordHealthMetrics insert (line 338).

**Verifier note:** Logic omission confirmed (field absent from insert; calculateHealthScore discards daysSinceLogin). Downgraded to PLAUSIBLE/low: (1) the column DEFAULTs to 0, not NULL, so the value is 0 not NULL; (2) recordHealthMetrics is invoked only in platformAdminService.test.ts — no production/edge-function/cron caller found — so the dashboard failure only manifests if this function actually populates the table in production, which is unconfirmed.

---

### 108. Health metric active_users_count stores total registered users, not active users

- **File:** `src/lib/platformAdminService.ts:343`
- **Severity:** ⚪ low · **Verdict:** PLAUSIBLE · **Category:** correctness

**What's wrong:** recordHealthMetrics sets active_users_count: usersRes.count || 0 (line 343), where usersRes (line 316) is profiles.select('id',{count:'exact',head:true}).eq('tenant_id', tenantId) — the total profile count with no activity filter. calculateHealthScore distinguishes totalUsers (all profiles, line 271) from activeUsers (user_activity_sessions in the last 7 days, line 272), so storing the total in a column named active_users_count is wrong.

**Failure scenario:** A tenant with 25 profiles but 2 users active in the last week has active_users_count persisted as 25, overstating engagement in health history for any consumer that later reads the column.

**Suggested fix:** Compute the distinct active-user count (distinct user_id from user_activity_sessions within the 7-day window scoped by tenant_id) and store that, or repurpose calculateHealthScore's activeUsers value into the insert.

**Verifier note:** Confirmed the insert stores total-profile count. Downgraded to PLAUSIBLE/low: active_users_count has no reader anywhere in src (grep shows only the write at line 343 and the generated type), and recordHealthMetrics is only called from tests, so the wrong value is never surfaced today. Real latent data-correctness defect, minimal current impact.

---

### 109. cachedPortalSettings module-global is not tenant-keyed and not cleared on sign-out

- **File:** `src/lib/portalUrlService.ts:27`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** tenant-isolation

**What's wrong:** getPortalSettings() caches company_settings.portal_settings in a module-global (cachedPortalSettings/cacheTimestamp, lines 20-22) and returns it at line 27 (`if (cachedPortalSettings && (now - cacheTimestamp) < CACHE_DURATION)`) with no tenant key. The fetch is `.from('company_settings').select('portal_settings').limit(1).maybeSingle()` — RLS scopes the row per session, but the in-memory cache persists across an account switch (sign-out is not a page reload). clearPortalSettingsCache() is only called from updatePortalSettings() (line 160); neither performSignOut() nor the AuthContext SIGNED_OUT handler clears it. This exact issue is logged as still-unfixed in docs/audits/2026-06-19-auth-lifecycle-audit.md:175 (M10).

**Failure scenario:** On a shared browser, tenant A staff open a surface that calls getPortalSettings() (portal-URL generation, ClientPortalSettings, portal gates), caching A's portal_settings for 5 minutes. A signs out and tenant B staff sign in within that window; B's portal gate/URL generation reads A's cached portal_enabled, portal_maintenance_mode, portal_session_timeout, portal_base_url, and branding until reload or a portal-settings update.

**Suggested fix:** Key the cache by tenant_id (invalidate when localStorage.tenant_id changes) and/or call clearPortalSettingsCache() from the sign-out paths in AuthContext (performSignOut and the SIGNED_OUT handler).

**Verifier note:** Confirmed in code and corroborated by the auth-lifecycle audit M10, which recommends the fix and shows it was not yet applied — the cache clear is still absent from both sign-out paths. Low severity: portal config/branding bleed, self-corrects on reload, RLS still protects actual data.

---

### 110. Low Stock KPI badge count disagrees with the Low Stock tab contents (out-of-stock items)

- **File:** `src/lib/stockService.ts:773`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** inconsistent-logic

**What's wrong:** getStockStats.lowStockCount (line 773) counts `(current_quantity ?? 0) <= (minimum_quantity ?? 0) && (current_quantity ?? 0) > 0` — EXCLUDING out-of-stock. But the Low Stock tab list uses getStockItemsPage(filters={lowStock:true}) → getStockItems, whose lowStock predicate is `(current ?? 0) <= (minimum ?? 0)` with NO `> 0` guard (lines 200-202), and getLowStockItems has the same guard-less predicate (line 287) — both INCLUDE out-of-stock. StockListPage renders the tab badge from stats.lowStockCount (line 356-358) while the tab rows come from the guard-less filter (line 116, 120-127).

**Failure scenario:** An item with minimum_quantity=5 and current_quantity=0 appears as a row in the Low Stock tab (getStockItems lowStock includes current==0) and is counted in the Out-of-Stock KPI, but is NOT counted in stats.lowStockCount. The Low Stock tab badge shows 0 while the tab lists 1 row.

**Suggested fix:** Use one shared low-stock predicate everywhere: either add `&& (item.current_quantity ?? 0) > 0` to getLowStockItems and the getStockItems lowStock filter, or drop the `> 0` guard in getStockStats.lowStockCount.

**Verifier note:** Confirmed all three predicates: getStockStats line 773 (has >0 guard), getStockItems lowStock lines 200-202 (no guard), getLowStockItems line 287 (no guard); StockListPage tab uses lowStock:true filter (line 116) with badge from stats.lowStockCount (line 358).

---

### 111. Tax-registration-number placeholder never resolves in the engine config path

- **File:** `src/lib/tenantConfigService.ts:112`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** localization

**What's wrong:** numberPlaceholder is read from snap['tax.number_placeholder']. The _apply_country_config snapshot builder writes 'tax.number_format' but never 'tax.number_placeholder' (migration 20260702205138 / plan phase0 lines 443-468), and there is no 'tax.number_placeholder' registry key, so this snapshot key is always undefined and numberPlaceholder is always null. geo_countries.tax_number_placeholder IS fetched into countryRow by the join at line 37 but is never used at line 112; the legacy mapRowToConfig path (line 180) reads countryRow.tax_number_placeholder correctly, proving the intended source (mirroring numberFormat at line 111 which the builder DOES populate).

**Failure scenario:** TaxRegistrationSettings.tsx:270 sets the tax-number input placeholder from tax.numberPlaceholder ?? ''. Because it is always null, the country's example registration number (e.g. a GSTIN sample '22AAAAA0000A1Z5' or a TRN sample) never appears as a placeholder hint for any tenant.

**Suggested fix:** Fall back to the fetched countryRow: numberPlaceholder: (snap['tax.number_placeholder'] as string) || (countryRow?.tax_number_placeholder as string) || null.

**Verifier note:** Independently reproduced. Same builder-key-list evidence as the postal-code finding (builder writes tax.number_format, not tax.number_placeholder). Confirmed the join fetches tax_number_placeholder into countryRow (line 37) but line 112 ignores it; legacy mapper line 180 uses it. Consumer TaxRegistrationSettings.tsx:270 uses tax.numberPlaceholder via useTaxConfig -> config.tax (TenantConfigContext.tsx:130-132). Severity medium->low: cosmetic placeholder hint only.

---

### 112. Country postal-code label never resolves — every address form shows generic 'Postal Code'

- **File:** `src/lib/tenantConfigService.ts:129`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** localization

**What's wrong:** In the production config path (fetchTenantConfig -> resolveTenantConfigFromLayers, wired at line 66; mapRowToConfig is test-only dead code), postalCodeLabel is read from snap['address.postal_code_label']. The _apply_country_config snapshot builder (current live def per migration 20260702205138, matching plan 2026-07-02-localization-phase0 lines 443-468) writes 'address.format' but NEVER 'address.postal_code_label', and there is no 'address.postal_code_label' key in COUNTRY_CONFIG_REGISTRY so country_config can't carry it either. Thus snap['address.postal_code_label'] is always undefined and postalCodeLabel always resolves to the 'Postal Code' fallback. geo_countries.postal_code_label IS fetched into countryRow by the join at line 39 but is never consulted at line 129 — unlike countryCode/countryName (lines 91-92) which correctly fall back to countryRow. The legacy mapRowToConfig path (line 198) reads countryRow.postal_code_label correctly, proving the intended source.

**Failure scenario:** AddressFields.tsx (uses useLocaleConfig() at line 24) renders {locale.postalCodeLabel} as the postal-code input label at line 69. A US tenant sees 'Postal Code' instead of 'ZIP Code'; an Indian tenant sees 'Postal Code' instead of 'PIN Code'; a UK tenant sees 'Postal Code' instead of 'Postcode' — on every customer/company/supplier address form, even though geo_countries.postal_code_label holds the correct label.

**Suggested fix:** Fall back to the already-fetched countryRow like countryCode/countryName do: postalCodeLabel: (snap['address.postal_code_label'] as string) || (countryRow?.postal_code_label as string) || 'Postal Code'.

**Verifier note:** Independently reproduced. Read the engine path (line 66 calls resolveTenantConfigFromLayers, mapRowToConfig has no production caller per docs audit and grep of callers), the join at line 37-39 (postal_code_label fetched into countryRow), and the snapshot builder key list in migration 20260702205138 / plan phase0 (writes address.format only). Consumer AddressFields.tsx:24,69 confirmed via useLocaleConfig -> config.locale (TenantConfigContext.tsx:140-142). Severity adjusted medium->low: purely a display label, no data/money/security impact — below the medium bar used for wrong statutory dates.

---

### 113. main.tsx locale anti-flash pre-seeds RTL only for 'ar', unlike the theme block which derives from THEMES - non-Arabic RTL languages flash LTR->RTL on reload

- **File:** `src/main.tsx:59`
- **Severity:** ⚪ low · **Verdict:** PLAUSIBLE · **Category:** anti-flash

**What's wrong:** The theme anti-flash block (47-50) validates the hint against the full THEMES list so a newly added theme is never dropped. The locale block directly below hardcodes if (localeHint === 'ar') for the RTL pre-seed, even though persistLocaleHint (LocaleContext.tsx:32-38, effect at 75) writes whatever effectiveLang is, and RTL_LANGS (locale.ts:8, hydrated at runtime from geo_languages via hydrateLanguages 19-28) can hold RTL languages other than Arabic. The code asymmetry itself is real and confirmed; the app is explicitly designed to support additional geo_languages ('Do NOT re-pin Locale to an en|ar union').

**Failure scenario:** If a tenant's ui_language is any RTL language other than Arabic added to geo_languages (e.g. Hebrew 'he', Urdu 'ur', Farsi 'fa'), the persisted xsuite_locale_hint is that code. On reload main.tsx does not match 'ar', so the document stays dir='ltr' from index.html; LocaleProvider then flips it to 'rtl' after mount, producing an LTR->RTL reflow flash on every reload - the exact regression the theme block was hardened against.

**Suggested fix:** Mirror the theme block's dynamic approach: pre-seed dir='rtl'/lang from the hint using the app's own RTL determination (e.g. persist a direction hint alongside the locale hint, or bundle a small RTL check), rather than a hardcoded === 'ar', so any RTL language configured in geo_languages is covered.

**Verifier note:** The code inconsistency is CONFIRMED (main.tsx:59 hardcodes 'ar' while the sibling theme block was deliberately generalized). Marked PLAUSIBLE rather than CONFIRMED because the flash only manifests once geo_languages actually carries a non-'ar' RTL language selected by a tenant; the in-bundle bootstrap is {en,ar} and I could not confirm (no live DB access) that such languages are currently seeded. Low severity as claimed - cosmetic reflow flash only.

---

### 114. Mark-as-Delivered and Preserve modals always show 'Unknown Device' (reads a field the clone object never carries)

- **File:** `src/pages/cases/CaseDetail.tsx:723`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** wrong-field

**What's wrong:** patientDeviceName for MarkAsDeliveredModal (line 723) and PreserveLongTermModal (line 750) does devices.find(d => d.id === modals.selectedClone.patient_device_id). But the clone_drives query in src/components/cases/detail/useCaseQueries.ts (lines 208-246) selects `device_id` and never selects `patient_device_id`. selectedClone is populated from that fetched clone (CaseCloneDrivesTab spreads the query row into cloneForCard at lines 172-176 and passes it via onSetSelectedClone). So selectedClone.patient_device_id is always undefined, find() returns undefined, and the name falls back to 'Unknown Device'. CaseCloneDrivesTab itself uses clone.device_id ?? clone.patient_device_id (lines 124, 164), confirming device_id is the populated field.

**Failure scenario:** A technician opens a clone drive's 'Mark as Delivered' or 'Preserve Long-term' confirmation from the Clone Drives tab. The dialog that should read e.g. 'Hard Drive (WXY123)' always displays 'Unknown Device' because it looks up the unselected patient_device_id column instead of device_id.

**Suggested fix:** Use the same resolution as CaseCloneDrivesTab in both blocks: devices.find(d => d.id === (modals.selectedClone.device_id ?? modals.selectedClone.patient_device_id)).

**Verifier note:** Independently reproduced. Confirmed the clone_drives select list (useCaseQueries.ts:208-246) includes device_id but not patient_device_id; confirmed CaseCloneDrivesTab spreads the query row into the object passed to onSetSelectedClone (lines 172-190) and elsewhere reads device_id first (lines 124, 164). CaseDetail.tsx:723 and :750 both key on patient_device_id → always undefined → 'Unknown Device'. Low severity: display-only string, no data effect.

---

### 115. Customers/Companies pages cache a 'location'-only company_settings projection under the shared key ['company_settings'], poisoning the Settings→General full-row consumer

- **File:** `src/pages/customers/CustomersListPage.tsx:262`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** state-management

**What's wrong:** CustomersListPage (line 262) and CompaniesListPage (line 198) run useQuery with queryKey ['company_settings'] but `.select('location')`, returning `{ location }` only. GeneralSettings (settings/GeneralSettings.tsx:134) uses the SAME key ['company_settings'] with `.select('*')`, expecting the full row (basic_info, branding, contact_info, banking_info, ...). React Query maps a key to one cache entry, so the partial projection and the full row share storage. GeneralSettings' init effect (lines 211-217) spreads the cached `settings` over empty defaults, so when the cache holds the truncated object the form initializes with empty basic_info/branding/contact_info/banking_info (only location populated) until the background refetch replaces it.

**Failure scenario:** Navigate Customers (or Companies) → Settings → General. The ['company_settings'] cache already holds the location-only object from the list page, so GeneralSettings has data immediately (isLoading=false) and its effect initializes formData with blank basic_info/branding/contact_info/banking_info, showing all company info as blank until the stale-triggered background refetch returns the full row. If the user saves within that window, the update persists the blank sections over the tenant's real settings.

**Suggested fix:** Give the partial projection its own key (e.g. ['company_settings','location']) in the customers/companies pages, or have those pages select the full row, so the full-row settings consumer is never served a truncated object under the shared key.

**Verifier note:** Confirmed the key collision: CustomersListPage:262 and CompaniesListPage:198 select('location') under ['company_settings']; GeneralSettings.tsx:134 select('*') under the same key; effect at 211-217 initializes formData from cached settings. The blank-flash on that navigation is deterministic; the save-over-blank data loss is race-gated (user must save before the background refetch resolves). Severity low, as reported.

---

### 116. Transfers list renders undefined account names and transfer number (wrong embedded field name / non-persisted column)

- **File:** `src/pages/financial/BankingPage.tsx:648`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness-display

**What's wrong:** In the Transfers tab, each row renders `{transfer.from_account?.account_name} -> {transfer.to_account?.account_name}` (BankingPage.tsx:648) and `{transfer.transfer_number}` (646). bankingService.getTransfers embeds the accounts as `from_account:bank_accounts!...(id, name, account_type)` / `to_account:...(id, name, account_type)` (bankingService.ts:511-512) — the embedded property is `name`, not `account_name` — so `.account_name` is always undefined. `transfer_number` is a UI-only field not persisted on account_transfers (declared UI-only at bankingService.ts:104-105), so `select('*')` never returns it. `transfers` is fed directly from getTransfers with no field mapping (BankingPage.tsx:81-90). The inline cast at line 639 (`{ from_account?: { account_name: string } }`) hides the mismatch from TypeScript.

**Failure scenario:** A user completes a transfer from 'Main Checking' to 'Petty Cash' and opens Banking -> Transfers. The row shows a blank title (transfer_number undefined) and ' -> ' with empty names on both sides instead of 'Main Checking -> Petty Cash', even though the account names are present in the fetched embed under `.name`. Transfers become unidentifiable in the list.

**Suggested fix:** Read the embedded `name` field (`transfer.from_account?.name` / `transfer.to_account?.name`) and drop or replace the non-existent transfer_number (show a reference, a slice of the id, or add a real column); update the inline cast type to match the actual embed shape ({ name: string }).

**Verifier note:** Confirmed both halves: getTransfers embed selects `name` (bankingService.ts:511-512) but BankingPage reads `account_name`; transfer_number is UI-only (bankingService.ts:104-105) and not returned by select('*'). transfers comes straight from getTransfers with no mapping (grep of BankingPage: line 81-90). React renders undefined as empty, so the row shows a blank title and ' -> '. Display-only correctness bug; low severity correct.

---

### 117. Recording a payment or credit note on invoice detail doesn't refresh invoice list KPIs

- **File:** `src/pages/financial/InvoiceDetailPage.tsx:224`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** cache-invalidation

**What's wrong:** handlePaymentRecorded (lines 224-229) invalidates ['invoice', id], ['invoice_payments', id], ['invoices']; handleCreditNoteSaved (lines 231-236) invalidates ['invoice', id], ['invoices'], creditNoteKeys.byInvoice(id). Neither invalidates ['invoice_stats']. InvoicesListPage reads ['invoice_stats'] (line 87) with staleTime 30000 and refetchOnWindowFocus:false, so navigating back within 30s serves cached Paid/Outstanding/Overdue KPIs. The in-page invoice-edit save (line 646) DOES invalidate ['invoice_stats'], making the payment/credit-note paths inconsistent.

**Failure scenario:** Invoices list shows Paid $5,000 / Outstanding $3,000. Open an unpaid invoice, Record Payment for its full $1,000 balance, then navigate to /invoices within 30s. KPIs still read pre-payment values because ['invoice_stats'] was never invalidated and remains within staleTime (and window-focus refetch is disabled).

**Suggested fix:** Add queryClient.invalidateQueries({ queryKey: ['invoice_stats'] }) to both handlePaymentRecorded and handleCreditNoteSaved, as the edit path at line 646 already does.

**Verifier note:** Verified handlers omit invoice_stats; verified InvoicesListPage.tsx:86-91 uses ['invoice_stats'] with staleTime 30000 + refetchOnWindowFocus:false, and the edit save at line 646 invalidates it. Low severity — self-heals after 30s.

---

### 118. Tax invoices render an unstyled raw 'tax_invoice' badge due to typeConfig key mismatch

- **File:** `src/pages/financial/InvoiceDetailPage.tsx:724`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** enum-mismatch

**What's wrong:** typeConfig (lines 48-51) is keyed by 'proforma' and 'tax', but the invoice_type enum value is 'tax_invoice' — used at lines 287-288 of this same file and in CaseDetail.tsx (line 228 comparison, line 969 default 'tax_invoice'). The header badge lookup typeConfig[invoice?.invoice_type] (lines 724-725) therefore returns undefined for tax invoices, falling back to the raw string label 'tax_invoice' and the default gray color '#64748b'. Proforma invoices match ('proforma') and render correctly.

**Failure scenario:** Open any tax invoice detail page. The type badge shows a gray pill reading the literal 'tax_invoice' instead of a blue 'Tax Invoice' badge; typeConfig.tax's label ('Tax Invoice') and color ('#0ea5e9') are never applied.

**Suggested fix:** Rename the typeConfig key from 'tax' to 'tax_invoice' so keys match the invoice_type enum values ('proforma' | 'tax_invoice').

**Verifier note:** Confirmed enum value 'tax_invoice' is canonical (grep in this file lines 287-288 and CaseDetail.tsx:228,969). typeConfig key 'tax' never matches. Genuine label/color rendering bug, cosmetic (low).

---

### 119. VAT Records table renders each row's document-currency vat_amount under the tenant currency symbol

- **File:** `src/pages/financial/VATAuditPage.tsx:450`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** correctness

**What's wrong:** The per-row 'VAT Amount' cell (line 450) uses `formatCurrency(record.vat_amount)`. `vat_amount` is the DOCUMENT-currency figure, while `vat_amount_base` holds the base-currency value — confirmed by the code's own comment (lines 184-186), by the KPI totals deliberately using `vat_amount_base ?? vat_amount`, and by calculateVATForPeriod (vatService.ts:133-134). `formatCurrency` (useCurrency) applies the tenant base-currency symbol/format, and the row shows no per-row currency indicator, so a foreign-currency record is mislabeled with the tenant symbol and shows the wrong magnitude. This is separate from audit #70, which fixed only the KPI totals, not this row cell.

**Failure scenario:** An OMR-base tenant issues a EUR invoice with 100 EUR VAT. post_invoice_vat_record (phase2_requirement_gate_and_snapshots.sql:384-393) inserts vat_amount=100 (EUR, from v_r.tax_amount) and vat_amount_base=~38.5 (OMR, from v_r.tax_amount_base). The VAT Records table renders the row as 'OMR 100.000' (document number under the tenant symbol), overstating and mis-denominating the amount, while the KPI totals (now using vat_amount_base) correctly show ~38.5 — so the row and the totals visibly disagree for the same record.

**Suggested fix:** Display the base-currency figure via `formatCurrency(record.vat_amount_base ?? record.vat_amount)` (the local VATRecord interface already carries vat_amount_base at line 45 and fetchVATRecords selects '*'), or format `record.vat_amount` with its own `record.currency` so the row symbol matches its amount.

**Verifier note:** CONFIRMED. Line 450 is `formatCurrency(record.vat_amount)`. Multi-currency divergence is real and populated: post_invoice_vat_record inserts vat_amount=document tax + vat_amount_base=base tax (rpc snapshot lines 384-393), and expensesService does the same for purchases. vat_amount being document-currency is confirmed by the file's own comment (184-186) and calculateVATForPeriod (vatService.ts:133-134). Not covered by audit #70's fix (that touched the KPI totals at 187-188 only; the row cell was left on vat_amount). Base-currency-only tenants (vat_amount==vat_amount_base) are unaffected, so low severity and 'display/reporting' scope are correct.

---

### 120. Filter change double-fetches (stale page then reset) and can display an out-of-order/empty result

- **File:** `src/pages/inventory/InventoryListPage.tsx:82`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** race-condition

**What's wrong:** Two effects react to filter changes: the loadData effect (line 80-82, deps include page + all filters) and a separate effect (line 84-86) that setPage(0) on filter change with page NOT in its deps. When a filter changes while page>0, on render N the loadData effect fires with the stale non-zero page, and the reset effect calls setPage(0); on render N+1 the loadData effect fires again with page 0. Two concurrent fetches result. loadData (line 113-137) has no stale-response guard — it unconditionally setItems(itemsData?.rows) on resolve (line 136), with no abort controller or request-id check.

**Failure scenario:** User on page 3 types a search term that yields only 1 page of results. loadData fires for page 3 of the filtered set (empty) and then, after setPage(0), for page 0 (the real rows). If the page-3 response arrives after the page-0 response (network reordering), setItems is overwritten with the empty page-3 result and the list shows 'No inventory items found' even though matches exist, until the next interaction. Even without reordering it always issues a wasteful double fetch and may briefly flash the empty page-3 result.

**Suggested fix:** Reset page to 0 together with issuing the fetch (derive an effective page or guard the loadData effect so it doesn't run with a stale page during a filter change), and/or tag each loadData call with a request id and ignore responses that aren't the latest.

**Verifier note:** Confirmed both effects and the missing stale-response guard in loadData. The double-fetch and race window are definitely present; the persistent empty-list outcome additionally requires the page-3 response to land after the page-0 response (network reordering), which is realizable but not guaranteed. Low severity — self-heals on next interaction.

---

### 121. Dismissing the last row on the last page strands the user on a false 'No notifications' empty page

- **File:** `src/pages/notifications/NotificationsHistory.tsx:343`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** pagination

**What's wrong:** The dismiss mutation's onSuccess (line 137) only invalidates queries; it never clamps or resets page. Pagination controls render only when total > pageSize (line 343). If the user is on the last page (page > 0) and dismisses rows so that total drops to <= pageSize, the query re-runs with the stale out-of-range page: range(page*pageSize, ...) returns zero rows, and because total > pageSize is now false the pagination bar (and its Prev button) is hidden — so there is no control to navigate back. rows.length===0 then falls through to the EmptyState 'No notifications / You're all caught up' even though earlier pages still hold notifications. (markAllRead under readFilter='unread' can strand the user the same way, since it also shrinks the filtered total without clamping page.)

**Failure scenario:** pageSize=20, total=21, user on page index 1 (the single 21st row). They dismiss that row. Refetch runs with page still =1 and total now =20; from=20, to=39, range(20,39) returns []. total(20) > pageSize(20) is false, so the pagination bar disappears, leaving no way back to page 0. The screen shows 'No notifications' while 20 undismissed notifications exist on page 0.

**Suggested fix:** After any mutation that can shrink the result set (dismiss / markAllRead), clamp page into range, e.g. in an effect `if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1))`, or reset page to 0 on dismiss, so the user is never stranded on an out-of-range empty page.

**Verifier note:** CONFIRMED. Line 137 dismiss onSuccess only calls invalidate; line 343 gates pagination on total > pageSize; query at lines 97-101 uses range(page*pageSize,...) with the stale page. Reproduced the exact 21->20 boundary. Narrow trigger (last page, total crossing pageSize+1 -> pageSize), hence low severity, but the missing page clamp is a genuine defect.

---

### 122. 'Refunded' sales status filter can never return any rows

- **File:** `src/pages/stock/StockSalesPage.tsx:215`
- **Severity:** ⚪ low · **Verdict:** CONFIRMED · **Category:** incorrect-filter

**What's wrong:** StockSalesPage exposes a 'Refunded' option (line 215) whose value flows paymentStatus → filters.status (line 55) → getStockSales({status:'refunded'}) (line 61). getStockSales always applies `.is('deleted_at', null)` (stockService.ts:470) and then `.eq('status', filters.status)` (line 474). But cancel_stock_sale marks a refunded sale BOTH status='refunded' AND deleted_at=now() (documented at cancelStockSale, stockService.ts:589-599: 'marks the sale refunded + soft-deleted'). So the query resolves to status='refunded' AND deleted_at IS NULL — which matches nothing.

**Failure scenario:** User selects the 'Refunded' status filter to review refunds; the table always shows 'No sales found' even when refunds exist, because every refunded sale is soft-deleted and excluded by the unconditional deleted_at IS NULL filter.

**Suggested fix:** For status 'refunded'/'cancelled', drop or invert the deleted_at IS NULL constraint (query soft-deleted rows for those statuses); otherwise remove the dead Refunded option.

**Verifier note:** Confirmed: getStockSales unconditional deleted_at filter (line 470) + status eq (474); cancelStockSale docstring confirms refunded rows are soft-deleted (589-599); StockSalesPage filter plumbing (44,55,61,215) traced.

---

