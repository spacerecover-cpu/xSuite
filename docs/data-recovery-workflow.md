> **Canonical end-to-end data-recovery workflow reference.** This document is the single source of truth for how the 16-stage data recovery lifecycle maps onto xSuite's tables, services, UI, statuses, functions, and roles **as built today**, plus the verified gaps. It is referenced from `CLAUDE.md` ("THIS IS A DATA RECOVERY LAB PLATFORM" banner). xSuite is built **exclusively** for forensic data-recovery labs — read this before changing any case, device, custody, financial, or reporting behavior. All claims below are grounded in a verified source/DB audit; statuses are `today's` reality, not the intended design.

---

## How to read this document

For each of the 16 lifecycle stages you get three things:

- **Purpose in a real lab** — why the stage exists operationally.
- **How xSuite implements it today** — the real tables, services, UI components, statuses, functions, and owning roles from the audit.
- **Verified gaps** — confirmed missing/partial behavior (no speculation; grounded in the audit).

Each stage is tagged `missing` (no real implementation), or `partial` (exists but materially incomplete). Cross-cutting concerns (chain of custody, the case status state machine, roles, CRM-assumption leaks, and a prioritized backlog) follow the stages.

---

## Stage 1 — Lead / Customer Enquiry  · `missing`

**Purpose in a real lab.** The DR sales desk lives on pre-case enquiries: "I have a dead/clicking drive, what will it cost?" Most enquiries never convert; the lab still needs to capture source, give a ballpark/diagnostic-fee, own first response (SLA), and measure conversion and source ROI.

**How xSuite implements it today.** There is **no lead / enquiry / prospect / opportunity entity anywhere**. The earliest object is a fully-formed customer row in `customers_enhanced` (canonical; `customers` is a compatibility view), created via `customerService.createCustomer` or inline in `CreateCaseWizard` through `CustomerFormModal`. Lead provenance is collapsed into two nullable free-text columns: `customers_enhanced.source` and `customers_enhanced.referred_by`. `customer_communications` is only a post-hoc correspondence log on an existing customer, not a pre-case pipeline.

- Tables: `customers_enhanced`, `customer_communications`, `customer_groups`, `companies`
- Services: `src/lib/customerService.ts`, `src/lib/companyService.ts`
- UI: `src/pages/customers/CustomersListPage.tsx`, `src/components/customers/CustomerFormModal.tsx`, `src/pages/customers/CustomerProfilePage.tsx`
- Statuses: `customers_enhanced.is_active` (active/inactive only — no lifecycle stage); `source` / `referred_by` (free text, nullable)
- Functions: `get_next_customer_number`
- Owning roles: intended `sales`; in practice any authenticated staff — `/customers` is `ProtectedRoute`-only with no per-action gate

**Verified gaps (`confirmed_missing`).** No lead/enquiry/prospect table or view exists (all ~220 tables enumerated; every "lead" grep hit was a false positive — `lead_time_days` on inventory/purchase tables, or UI copy). A non-converting phone enquiry leaves zero trace. No diagnostic-fee/triage funnel (`triage|diagnostic_fee|walk_in|conversion` returns nothing). No enquiry first-response SLA and no enquiry ownership: a `tenant_sla_policies` table exists but models **case-phase** SLAs (`phase, priority, target_hours, tenant_id`), not enquiry first-response, and there is no enquiry object to attach it to. Conversion rate, source ROI, and lost-enquiry follow-up are unmeasurable.

---

## Stage 2 — Case Creation  · `partial`

**Purpose in a real lab.** Convert an accepted job into a tracked case with a unique number, owner, priority tied to data/device risk, and a clean status entry point.

**How xSuite implements it today.** The real create flow lives **inside `CreateCaseWizard`**, not `caseService` (which owns only duplicate + delete). On submit it calls `rpc('get_next_number', { p_scope: 'case' })`, resolves `tenant_id` from the profile, and inserts into `cases` with `case_number`, `customer_id`, an auto-filled `subject` (`Case for ${customerName}`), priority text, `status` hardcoded to the literal string `'Received'`, optional `contact_id`/`client_reference`/`service_type_id`/`created_by`, and auto-populates `company_id` from the customer's primary `customer_company_relationships` row. Technicians who create a case are auto-assigned. On success it invalidates `['cases']` and opens `CaseSuccessModal` (printReceipt / printLabel).

- Tables: `cases`, `customers_enhanced`, `customer_company_relationships`, `catalog_service_types`, `master_case_priorities`, `number_sequences`
- Services: `src/lib/caseService.ts` (duplicate/delete only); `CreateCaseWizard` owns the primary create path inline
- UI: `src/components/cases/CreateCaseWizard.tsx`, `src/pages/cases/CasesList.tsx`, `src/components/cases/CaseSuccessModal.tsx`
- Statuses: `status` written as raw text `'Received'` (FK `status_id` left null); priority written as lowercased name (FK `priority_id` left null)
- Functions: `get_next_number(p_scope:'case')`; `get_next_case_number` (divergent path used by `duplicateCase` → scope `'cases'`); `delete_case_permanently`
- Owning roles: any authenticated staff — only the quota gate (`UsageLimitGuard` `max_cases_per_month`), **no RBAC**

**Verified gaps.** `cases` carries **both** `status`/`status_id` and `priority`/`priority_id`, but the wizard writes only the TEXT columns, leaving the FK columns null — so creation bypasses both the `master_case_statuses` lookup and the guarded state machine. The status guard trigger is BEFORE-UPDATE only, so INSERT seeds any status freely. No role gate on creation.

---

## Stage 3 — Device Intake  · `partial`

**Purpose in a real lab.** Receive the physical media, capture condition-on-arrival, identify each device (type/brand/model/serial/capacity), record accessories, and open chain of custody **at the moment of receipt**.

**How xSuite implements it today.** Multi-device-per-case is genuinely supported: `CreateCaseWizard` holds a `devices[]` array; the primary device defaults to `patient` role. Each device captures `device_role_id`, `device_type_id`, `brand_id`, `model`, `serial_no`, `capacity_id`, `condition_id` (condition-on-arrival), `accessories[]`, `device_problem_id`, `recovery_requirements`, `password`, `encryption_type_id`. On submit, devices with a type or serial are inserted into `case_devices`. RAID/server handling is DR-aware: `ServerBulkDrivesModal` bulk-adds drives as Patient-role components.

- Tables: `case_devices`, `catalog_device_types`, `catalog_device_brands`, `catalog_device_capacities`, `catalog_device_conditions`, `catalog_accessories`, `catalog_service_problems`
- Services: `src/lib/caseService.ts`; `src/lib/diagnosticsService.ts` (post-intake only)
- UI: `src/components/cases/CreateCaseWizard.tsx`, `src/components/cases/ServerBulkDrivesModal.tsx`, `src/components/cases/DeviceFormModal.tsx`, `src/components/cases/detail/CaseDevicesTab.tsx`
- Statuses: `case_devices.device_role_id` (patient/donor/etc.), `is_primary`, `condition_id`
- Functions: plain `.from('case_devices').insert` — no device-specific RPC at intake
- Owning roles: any authenticated staff (no device-level RBAC)

**Verified gaps.** `device_problem_id` (FK to `catalog_service_problems`) is **flattened to a free-text `symptoms` string** at insert — the structured fault code is discarded. `recovery_requirements` is taken only from `devices[0]` for the whole case. `photos[]`/`storage_location`/`physical_damage` columns exist but the wizard never writes them. `password` is stored **plaintext** (`caseService.ts` writes `password: device.password ?? null` with no hashing). **No `chain_of_custody` "creation"/DEVICE_RECEIVED event is logged at intake** (zero custody calls in `CreateCaseWizard`). NDA capture and customer identity verification are absent at intake despite a fully-designed `ndas` table and `customers_enhanced.id_number`/`id_type` columns (see "Generic-CRM assumptions to avoid" and the backlog). The richer device fields are only editable post-intake via `DeviceFormModal`.

---

## Stage 4 — Device Labeling & Tracking  · `partial`

**Purpose in a real lab.** Each physical drive needs its own scannable asset tag bound to a serial/device, so any drive can be located and audited individually on day one.

**How xSuite implements it today.** Labeling is **case-level, not device-level**. `CaseLabelDocument` prints ONE label per case (`case_number`, customer, service, `devices[0]` + a "+ N more" line). The "QR code" is a STATIC branding image (`company_settings.branding.qr_code_label_url`) that encodes nothing — the same image on every label, not scannable to a case/device.

- Tables: `cases`, `case_devices`, `chain_of_custody`, `chain_of_custody_transfers`, `company_settings`
- Services: `src/lib/pdf/pdfService.ts` (`generateCaseLabel`), `src/lib/chainOfCustodyService.ts`
- UI: `src/pages/print/PrintLabelPage.tsx`, `src/lib/pdf/documents/CaseLabelDocument.ts`, `src/components/cases/ChainOfCustodyTab.tsx`, `src/components/cases/CustodyTransferModal.tsx`
- Statuses: `custody_status` (`in_custody|in_transit|checked_out|archived|disposed` — defined, never written at intake); `custody_transfer_status` (transfers only)
- Functions: `log_chain_of_custody` (8 params; many rich fields dropped)
- Owning roles: module-level only (`hasModuleAccess('cases')`); transfers hardcoded to technician/manager/admin/owner client-side

**Verified gaps.** No per-device asset tag, barcode, or serial-bound label. `case_devices.storage_location` exists but no UI ever writes it. The `chain_of_custody` subsystem (transfers, access log, integrity checks, SHA-256 hashing, `ChainOfCustodyTab`) is fully built at the service layer but is **never initialized at intake** — it is wired only to financial/report/transfer/access events. Physical tracking of an individual drive on day one does not exist.

---

## Stage 5 — Initial Inspection / Condition Assessment  · `partial`

**Purpose in a real lab.** A technician inspects each patient device, recording per-component health (heads, PCB, motor, platters/surface, controller/NAND/firmware), SMART data, and imaging stats to drive triage.

**How xSuite implements it today.** Inspection is an optional "diagnostics" sub-form inside `DeviceFormModal`, shown only for Patient-role devices. It collects a rich per-component picture (`heads_status`, `pcb_status`, `motor_status`, `surface_status`, `platter_condition`, controller/NAND/firmware fields, `smart_data`, imaging stats, `technical_notes`) and calls `diagnosticsService.upsertDeviceDiagnostics` → insert into `device_diagnostics`.

- Tables: `case_devices`, `case_diagnostics` (unused), `device_diagnostics` (insert fails), `catalog_device_conditions`, `catalog_device_component_statuses`
- Services: `src/lib/diagnosticsService.ts`
- UI: `src/components/cases/DeviceFormModal.tsx`, `src/components/cases/detail/CaseDevicesTab.tsx`
- Statuses: `catalog_device_conditions` (via `condition_id`); a component status colour map (good/partial/replacement/bad/not_tested) that is UI-only with no backing columns
- Owning roles: module-level only; the sub-form is gated to patient-role in app code, not by permission

**Verified gaps (CRITICAL BUG).** The `DeviceDiagnostics` interface carries `heads_status`/`pcb_status`/etc. as top-level keys, but live `device_diagnostics` only has `{id, tenant_id, device_id, diagnostic_type, tool_used, result (jsonb), notes, performed_by, ...}`. **PostgREST rejects the insert and `DeviceFormModal` swallows the error** ("don't fail the operation if diagnostics save fails"). Net effect: detailed inspection data is silently dropped. Only coarse real columns on `case_devices` (`condition_id`, `symptoms`, `accessories`, `encryption_id`) persist; `photos`/`physical_damage` are never written. `case_diagnostics` exists in schema but is unused.

---

## Stage 6 — Diagnosis / Fault Classification / Recoverability  · `partial`

**Purpose in a real lab.** Classify the failure mode (firmware / mechanical / electronic / logical), assess severity, and record a recoverability / success-probability that drives triage and pricing.

**How xSuite implements it today.** Diagnosis is effectively a **free-text symptom string plus one selected "service problem" label**. At intake the chosen `device_problem_id` is resolved to `catalog_service_problems.name` and written into `case_devices.symptoms`. `catalog_service_problems` is just `{id, name, description, is_active, sort_order}` — **no severity, no category, no recoverability/success-probability**.

- Tables: `case_devices`, `case_diagnostics` (0 rows), `device_diagnostics` (0 rows), `case_recovery_attempts` (0 rows, unwired), `catalog_service_problems`
- Services: `src/lib/diagnosticsService.ts`, `src/lib/caseStateMachineService.ts`
- UI: `src/components/cases/CreateCaseWizard.tsx`, `src/components/cases/detail/CaseOverviewTab.tsx`, `src/components/cases/DeviceCheckoutModal.tsx`
- Statuses: `master_case_statuses type='diagnosis'` (Initial Assessment, Diagnosis in Progress) — case-level; outcome is a single case-level status (Completed-Success/Partial/Failed)
- Owning roles: module-level only; no gate distinguishing who sets a diagnosis

**Verified gaps.** `case_devices` has dedicated `diagnosis`/`recovery_result`/`data_recovered_size` columns but no case UI writes them. `case_recovery_attempts` is well-shaped but 0 rows / zero frontend references. The report template literally interpolates `{{diagnosis.success_probability}}%` yet nothing populates it. Recoverability surfaces only as a hardcoded `'unrecoverable'` dropdown option at checkout — not an assessed/recorded determination.

---

## Stage 7 — Quotation & Approval  · `partial`

**Purpose in a real lab.** Quote the recovery, get the customer's documented authorization-to-attempt (with risk acknowledgement that opening a drive can destroy data), then convert to invoice.

**How xSuite implements it today.** TWO parallel, partly-disconnected quote systems:

1. **INTERNAL.** Staff create quotes via `quotesService` into the `quotes` table using a free TEXT status; `CaseFinancesTab`, quote PDFs, and bulk email all operate on `quotes`. Multi-currency base snapshotting is real.
2. **PORTAL/APPROVAL.** `PortalQuotes`/`PortalDashboard`/`CompanyProfilePage` READ a **different** table, `case_quotes` (+ `case_quote_items`), which has 0 rows live and is never written by any service. The customer Approve/Reject buttons call `approve_quote`/`reject_quote` RPCs — but those mutate `quotes` (via `status_id` → `master_quote_statuses`), not `case_quotes`, and look up names `'Approved'`/`'Rejected'` that **don't exist** in `master_quote_statuses` (closest are `'Accepted'`/`'Declined'`).

- Tables: `quotes`, `quote_items`, `case_quotes` (portal read target, 0 rows), `case_quote_items`, `master_quote_statuses`, `invoices`, `case_portal_visibility`
- Services: `src/lib/quotesService.ts`, `src/lib/invoiceService.ts`, `src/lib/caseFinanceService.ts`, `src/lib/portalVisibility.ts`
- UI: `src/pages/portal/PortalQuotes.tsx`, `src/components/cases/detail/CaseFinancesTab.tsx`, `src/components/cases/QuoteFormModal.tsx`
- Statuses: `quotes.status` text (`draft/sent/accepted/rejected/expired/converted`) + an independent `status_id` FK; the portal filters on `pending_approval/approved/rejected/expired` — none of which exist in either vocabulary
- Functions: `get_next_number(scope:'quote')`; `approve_quote`/`reject_quote` (mutate wrong table; names don't exist); `convert_proforma_to_tax_invoice`
- Owning roles: internal CRUD gated by RLS only; portal via `PortalAuthContext` + `case_portal_visibility.show_quotes`

**Verified gaps.** The read model (`case_quotes`) and write model (`quotes`) are different tables, and the status names are wrong — the customer approval loop is **effectively non-functional end-to-end**. `quotes` carries both a text status and a `status_id` FK, kept independently. Proforma→tax-invoice conversion does work. Quote approval is also not a documented authorization-to-attempt and does not advance the case or authorize device-level work.

---

## Stage 8 — Recovery Process  · `partial`

**Purpose in a real lab.** The actual recovery work: iterative imaging/recovery passes per drive, donor-part harvesting for mechanical cases, tool usage, and per-attempt/per-device yields recorded as a work record.

**How xSuite implements it today.** As built, "recovery" = the case **state machine** plus **clone-drive tracking**. The case moves recovery→qa→completed via `transition_case_status` with role-gated edges from `case_status_transitions` (solid). Clone/disk-image handling is genuinely implemented (`CaseCloneDrivesTab` + `CreateCloneDriveModal` write `resource_clone_drives` with extract/archive/preserve/space-check flows).

- Tables: `case_recovery_attempts` (unwired, 0 rows), `resource_clone_drives`, `inventory_parts_usage` (unwired, 0 rows), `catalog_donor_compatibility_matrix`, `case_devices`, `case_job_history`
- Services: `src/lib/caseStateMachineService.ts`, `src/lib/inventoryService.ts` (no `recoveryService` exists)
- UI: `src/components/cases/detail/CaseCloneDrivesTab.tsx`, `src/components/cases/CreateCloneDriveModal.tsx`, `src/pages/inventory/DonorSearchPage.tsx` (no recovery-attempts tab anywhere)
- Statuses: case phases `recovery|qa` (Recovery in Progress, Verification & QC, Data Transfer); `resource_clone_drives.status` active/extracted/archived
- Functions: `transition_case_status`, `search_donor_drives`, `log_case_checkout` (writes outcome to JSON, not `case_recovery_attempts`/`case_devices`)
- Owning roles: lifecycle transitions gated by `case_status_transitions.allowed_roles` (server + client); clone/device actions gated by RLS + module only

**Verified gaps (`confirmed_missing`).** The structured recovery work-record layer is vaporware: `case_recovery_attempts` (`attempt_number`/`method`/`tool_used`/`result`/`data_recovered`/`performed_by`/`device_id`) has **zero frontend references** and 0 rows — no UI records an attempt. Donor-parts consumption is unwired: `inventory_parts_usage` exists with the right shape but nothing ever inserts into it; `DonorSearchPage` is read-only (`search_donor_drives` + "Save Search"; the "View Details" button has no `onClick`) and offers no reserve/harvest/attach action; `catalog_donor_compatibility_matrix` is never consulted. Per-device `recovery_result`/`data_recovered_size` are schema-present but UI-absent. Outcome is captured once, late, and coarsely: `log_case_checkout` stuffs a single free-text `recovery_outcome` string into a `case_job_history` JSON blob and flips the case to Delivered.

---

## Stage 9 — Engineer Assignment  · `partial`

**Purpose in a real lab.** Assign the right technical actor (cleanroom/imaging vs logical/firmware vs RAID specialist) based on skill and workload, with an auditable assignment history.

**How xSuite implements it today.** A thin many-to-many join: `CaseEngineersTab` lets a user pick a "technician" (`EngineerSelector` hardcodes `profiles WHERE role='technician' AND is_active`) and attach them to `case_engineers` with an optional free-text `role_text`, or remove them. Writes happen inline via `supabase.from('case_engineers')` (no service layer). Engineer names are resolved by a secondary `profiles` lookup. This single selector is used both by the per-case engineer roster (`CaseEngineersTab`) and the case-level assignment field (`CaseOverviewTab`).

- Tables: `case_engineers` (0 rows), `profiles`, `employees`/`departments`/`positions` (exist but unused for assignment)
- Services: none — inline writes, no assignment service
- UI: `src/components/cases/detail/CaseEngineersTab.tsx`, `src/components/cases/EngineerSelector.tsx`
- Statuses: `case_engineers.role_text` (free text, unvalidated); `profiles.case_access_level` (restricted|full — shown, not enforced)
- Functions: plain INSERT/DELETE — **hard DELETE on removal**
- Owning roles: no gate on who can assign/remove (any user reaching the tab); RLS tenant isolation only

**Verified gaps (`confirmed_missing`).** The assignment pool is hardcoded to `profiles.role='technician'` (the sole pool query), **ignoring the HR `employees` table** and **excluding all non-technician staff** (a senior engineer with role `manager` can never be assigned; empty-state copy reads "No technicians available"). No workload/capacity/queue view and no skill/specialization matching (HDD/SSD/flash-NAND/RAID — no `specialization`/`skill_set`/`cleanroom` columns exist). Removal uses a **hard DELETE** (`supabase.from('case_engineers').delete()`) despite the table having both `removed_at` and `deleted_at` columns — violating the no-hard-delete rule and destroying the assignment audit trail. No notification/acceptance, no bench/equipment binding, no time tracking (`timesheets` exists but isn't linked).

---

## Stage 10 — Internal Notes & Technical Findings  · `partial`

**Purpose in a real lab.** Capture internal-only technical findings and decide which (if any) become customer-visible.

**How xSuite implements it today.** Two distinct findings channels: (1) free-text case-level notes — `CaseNotesTab` + `addNoteMutation` insert into `case_internal_notes` (`content`, `created_by`); author names resolved via secondary `profiles` lookup. (2) structured device-level diagnostics via `diagnosticsService` → `device_diagnostics` (but see Stage 5 — that insert fails and is swallowed).

- Tables: `case_internal_notes`, `device_diagnostics`, `case_job_history`, `case_diagnostics` (unused)
- Services: `src/lib/diagnosticsService.ts`, `src/components/cases/detail/useCaseMutations.ts`
- UI: `src/components/cases/detail/CaseNotesTab.tsx`, `src/components/cases/DeviceFormModal.tsx`
- Statuses: none — no visibility/private flag exists as a column
- Owning roles: module-level only; no per-action gate on note creation

**Verified gaps.** `case_internal_notes` has **no visibility/private/is_internal column**, so the internal-vs-portal distinction does not exist in the data model. `CaseNotesTab` renders a "Private" badge from `note.private`, but that field is never populated (always undefined) — dead UI. There is no way to mark a finding customer-visible or surface a technical note to the portal. `case_diagnostics` exists in schema but is unused (potential dead-table confusion).

---

## Stage 11 — Recovery Verification / QA  · `partial`

**Purpose in a real lab.** Two separate things: (a) forensic evidence-integrity (hashes, seals, tamper checks) and (b) **recovery-quality QA** — is the recovered data actually correct/readable, with second-engineer sign-off, % readable, corruption sweep, file-openability spot checks.

**How xSuite implements it today.** Verification today = the `IntegrityCheckModal` under the Chain-of-Custody ("history") tab: it captures `check_type`, expected/actual hash (SHA-256/512/MD5), seal number + intact, physical condition, anomalies, findings, auto-derives an `integrity_check_result`, inserts into `chain_of_custody_integrity_checks`, and writes a `'verification'` custody event.

- Tables: `chain_of_custody_integrity_checks`, `chain_of_custody`, `case_qa_checklists` (orphan, 0 refs), `case_recovery_attempts` (orphan)
- Services: `src/lib/chainOfCustodyService.ts` (`performIntegrityCheck`/`getIntegrityChecks`)
- UI: `src/components/cases/IntegrityCheckModal.tsx`, `src/components/cases/ChainOfCustodyTab.tsx`
- Statuses: `integrity_check_result` (`passed|failed|warning|not_applicable`); `custody_action_category` includes `'verification'`
- Functions: `log_chain_of_custody` (`action_category='verification'`)
- Owning roles: module-level only; no per-action permission, no second-reviewer gate

**Verified gaps (`confirmed_missing`).** `chain_of_custody_integrity_checks` has only `case_id`/`device_id`/`check_type`/`expected_hash`/`actual_hash`/`result`/`details`/`checked_by`/`checked_at` — all rich fields are JSON-stuffed into the single `details` column (TODO B8). This is **hash/seal evidence-integrity (forensic CoC), NOT verification that the recovered data is correct/readable**. Recovery-QUALITY QA is absent: `case_qa_checklists` exists (`checklist_name`, `items` JSON, `status`, `completed_by`/`at`) but is **completely unused** (no tab/service/component); file-openability spot checks, % readable, corruption sweep, and second-engineer sign-off have no UI or data path. `case_recovery_attempts` is also orphaned.

---

## Stage 12 — File Listing & Delivery Approval  · `missing`

**Purpose in a real lab.** Before payment, the lab produces a **verified recovered-file manifest** the customer reviews and signs off on — the defining proof-of-recovery artifact. Delivery is gated on customer acceptance and QA pass.

**How xSuite implements it today.** There is **no recovered-file-listing artifact and no customer delivery-approval gate** anywhere in schema, service, or UI. What exists: reports (`case_reports` + sections) with a STAFF-side lifecycle `draft→approved→sent`; customers can View/Download a report PDF in `PortalReports` but have **no Approve/Accept/Sign action** (and reports of ANY status, including draft, are listed — only badge colour changes). Portal visibility flags gate WHAT the customer sees, not approval. Delivery is recorded at checkout (`DeviceCheckoutModal` → `log_case_checkout`: collector name/mobile/ID + a single case-level `recovery_outcome` free string, prints a checkout form) and at clone level (`markAsDeliveredMutation` sets `clone_drives.delivered_date`/retention).

- Tables: `case_reports`, `case_report_sections`, `case_portal_visibility`, `clone_drives`, `cases.recovery_outcome` (single case-level field); **no recovered-file-listing table exists**
- Services: `src/lib/reportsService.ts`, `src/lib/portalVisibility.ts`, `src/components/cases/detail/useCaseMutations.ts`
- UI: `src/pages/portal/PortalReports.tsx` (read-only), `src/components/cases/ReportViewModal.tsx`, `src/components/cases/DeviceCheckoutModal.tsx`
- Statuses: `case_reports.status` (`draft|review|approved|sent`); `cases.recovery_outcome` free string (`full|partial|unrecoverable|declined`); `clone_drives.status` (`active|delivered|preserved`)
- Functions: `transition_case_status` (sets Delivered); `log_case_checkout`; `approve_quote`/`reject_quote` (only customer approval RPCs — for quotes, not delivery)
- Owning roles: staff approve/send (module + "must be approved before sending" check); customer side: read-only, no approval capability

**Verified gaps (`confirmed_missing`).** Searched for `manifest`, `recovered_file(s)`, `file_listing`, `recovery_manifest`, `folder_structure`, `file_tree`, `deliverable` — zero hits. The closest schema candidates are all non-manifests (`case_attachments` = generic staff docs; `case_recovery_attempts.data_recovered` = single free-text string; `clone_drives` = image-level metadata only). `PortalReports` exposes only `handleView` and `handleDownload` — no Accept/Sign-off action or acceptance mutation. `MarkAsDeliveredModal` confirms delivery on pure staff action (notes, retention days, an optional "Also update case status to Delivered" checkbox) with no QA-pass or customer-acceptance check; `markAsDeliveredMutation` writes `status:'delivered'` driven by the staff `profile.id`. Customer approval is wired for **quotes** (the money), not recovered data (the product).

---

## Stage 13 — Device Checkout / Return  · `partial`

**Purpose in a real lab.** Hand back media (and any donor/retained drives) with a digital signature, condition-on-return capture, and gates against unpaid balance / failed QA — releasing custody state.

**How xSuite implements it today.** Two disconnected mechanisms:

1. **Real return flow.** `DeviceCheckoutModal` collects collector name/mobile/optional ID and a single CASE-level `recovery_outcome` dropdown, then calls `log_case_checkout`, which writes a JSON blob to `case_job_history` and **force-sets `cases.status='Delivered'` via a raw text UPDATE** — bypassing `transition_case_status` and its edge/role checks (`log_case_checkout` is SECURITY DEFINER). It then opens a printed checkout PDF with a physical signature line.
2. **Forensic transfers.** A separate `chain_of_custody_transfers` subsystem handles INTERNAL custodian handoffs (initiate/accept/reject) with rich fields (condition before/after, seal, signatures) JSON-packed into a `notes` column.

- Tables: `case_job_history`, `chain_of_custody`, `chain_of_custody_transfers`, `case_devices`, `clone_drives`
- Services: `src/lib/chainOfCustodyService.ts` (`logDeviceCheckout`/`logDeviceReturn` are dead code), `src/components/cases/detail/useCaseMutations.ts`
- UI: `src/components/cases/DeviceCheckoutModal.tsx`, `src/lib/pdf/documents/CheckoutFormDocument.ts`, `src/components/cases/ChainOfCustodyTab.tsx`, `src/pages/print/PrintCheckoutPage.tsx`
- Statuses: `custody_status` (defined, never written); `recovery_outcome` free string at checkout; `custody_transfer_status` (internal handoffs only)
- Functions: `log_case_checkout` (raw UPDATE `status='Delivered'`, bypasses state machine); `log_chain_of_custody` (`p_custody_status` supported but the wrapper never passes it)
- Owning roles: checkout button has **no permission/role/status/payment gate**; custody transfers client-side technician/manager/admin/owner only

**Verified gaps.** The `custody_status` enum (`in_custody`/`checked_out`/...) is defined but **never written**, so there is no live device-level custody STATE. `logDeviceCheckout`/`logDeviceReturn` helpers exist but are orphaned (zero callers) — the actual checkout never writes a `chain_of_custody` row. No digital signature is stored; checkout is case-level only (can't record donor retained / one device kept for re-attempt); no condition-on-return capture; no gate against unpaid balance / failed QA.

---

## Stage 14 — Billing & Payment  · `partial`

**Purpose in a real lab.** Invoice the recovery; **release of data is the leverage point** — no full payment, no data. Evaluation-fee / recovery-fee / no-data-no-fee pricing is the norm.

**How xSuite implements it today.** Quote→invoice linkage is real and reasonably complete: `convertQuoteToInvoice` copies case/customer/line items, sets `converted_from_quote_id`, flips `quote.status` to `'converted'`; proforma→tax goes via `convert_proforma_to_tax_invoice`. Multi-currency is well handled (frozen `exchange_rate` + `*_base` amounts; `allocatePaymentToInvoices` computes realized FX gain/loss and posts ledger rows, with manual compensating rollback — not atomic). Payments support split allocation via `payment_allocations`; `recordPayment` enforces tax-invoice-only. Invoice status is DERIVED (`deriveInvoiceStatus`), not a state machine.

- Tables: `invoices`, `invoice_line_items`, `quotes`, `payments`, `payment_allocations`, `financial_transactions`, `receipts` (unused for cases), `master_payment_methods`
- Services: `src/lib/invoiceService.ts`, `src/lib/paymentsService.ts`, `src/lib/caseFinanceService.ts`, `src/lib/financialService.ts`, `src/lib/invoiceStatus.ts`
- UI: `src/components/cases/detail/CaseFinancesTab.tsx`, `InvoiceFormModal`/`InvoiceDetailPage`, Payments pages
- Statuses: `invoice.status` (`draft|sent|partial|paid|overdue|void`, derived); `invoice_type` (`proforma|tax_invoice`); `payment.status` (`pending|completed|failed|refunded`)
- Functions: `get_next_invoice_number`, `convert_proforma_to_tax_invoice`, `get_invoice_stats_base`, `recordPayment`/`allocatePaymentToInvoices`
- Owning roles: RLS + role hierarchy only (no financial module key in `PermissionsContext`); accounts/admin/owner own the financial routes

**Verified gaps.** There is **no payment-before-release gate anywhere** — outstanding balance is computed and shown in `CaseFinancesTab` but nothing blocks `log_case_checkout`, MarkAsDelivered, or the Delivered transition when `balance_due > 0`. `receipts`/`payment_receipts` tables exist but are unused for case billing (no customer receipt issuance). No in-app online payment capture for case invoices (PayPal edge functions are subscription-billing only). No link from recovery outcome to billable amount (no no-data-no-fee enforcement).

---

## Stage 15 — Case Closure  · `partial`

**Purpose in a real lab.** A controlled close-out gated on QA pass + verified delivery + payment + custody release, with data-retention / secure-disposal sign-off.

**How xSuite implements it today.** TWO competing closure paths:

1. **Intended.** `CaseStageBanner` → `transitionCaseStatus` → `transition_case_status` RPC: an edge-validated, role-gated state machine that records `case_job_history` and emits notification events; reopen edges are admin/owner only; a BEFORE-UPDATE guard trigger blocks direct `cases.status` writes outside the RPC.
2. **Bypass.** `DeviceCheckoutModal` → `log_case_checkout` force-sets `status='Delivered'` via raw UPDATE (SECURITY DEFINER), skipping edges/roles/notifications.

- Tables: `master_case_statuses`, `case_status_transitions`, `cases` (`status`/`status_id`/`phase_entered_at`/`resolution`), `case_job_history`, `case_qa_checklists` (unwired), `case_milestones` (unwired)
- Services: `src/lib/caseStateMachineService.ts`, `src/components/cases/detail/useCaseMutations.ts`
- UI: `src/components/cases/detail/CaseStageBanner.tsx`, `src/components/cases/MarkAsDeliveredModal.tsx`, `src/components/cases/DeviceCheckoutModal.tsx`
- Statuses: terminal `Completed-Success/Partial/Failed`, `Delivered`, `Cancelled` (3 variants); no distinct "closed/archived" beyond delivered + cancelled
- Functions: `transition_case_status` (validates edges + role, NOT `requires[]`); `log_case_checkout` (bypass path); `guard_cases_status_changes` trigger (BEFORE UPDATE only)
- Owning roles: forward edges technician/manager/admin/owner; reopen admin/owner only (raw `profiles.role`, not `PermissionsContext`)

**Verified gaps (`confirmed_missing`).** The `requires` arrays on transitions (`recovery_completed`, `qa_passed`, `delivery_recorded`, `recovery_outcome`, `cancellation_reason`) are **carried as metadata but NOT enforced** — `CaseStageBanner` literally renders "These are advisory — the RPC does not block on them today." The DB `transition_case_status` validates only (a) the phase edge exists and (b) caller role ∈ `allowed_roles`; it never reads `requires`. So closure is a free-form status flip: a case can close with no QA, no recovery attempt, no recorded delivery, and no payment check. `case_qa_checklists` and `case_milestones` exist in schema but have ZERO references in `src`. `resolution`/`actual_completion` columns are not populated by either path. No data-retention/secure-disposal sign-off at closure (retention only set via the separate clone modal).

---

## Stage 16 — Audit Trail & Reporting  · `partial`

**Purpose in a real lab.** Defensible, immutable audit trails; structured forensic reports (including a Certificate of Destruction and a recovered-file manifest); approval and immutability enforced at the data layer.

**How xSuite implements it today.** Four parallel audit tables with uneven coverage. `case_job_history` is the reliable per-case activity log (written by `transition_case_status` and `log_case_history`, read by `CaseDetail` and the portal). `audit_trails` is written only by `userManagementService`/`rolePermissionsService` via `log_audit_trail`. `financial_audit_logs` is never inserted by frontend code (only `VATAuditPage` reads it — dormant). `pdf_generation_logs` is best-effort. Reporting is template-driven (`master_case_report_templates` + `report_section_library`/`presets`, 7 report types, versioning/approve/send, bilingual `pdfmake` output, forensic CoC linkage).

- Tables: `audit_trails`, `case_job_history`, `financial_audit_logs` (dormant), `pdf_generation_logs`, `case_reports`, `case_report_sections`, `chain_of_custody`
- Services: `src/lib/auditTrailService.ts`, `src/lib/reportsService.ts`, `src/lib/chainOfCustodyService.ts`, `src/lib/pdf/loggingService.ts`
- UI: `src/pages/admin/AuditTrails.tsx`, `src/components/cases/detail/CaseReportsTab.tsx`, `src/components/cases/StreamlinedReportEditor.tsx`, `src/pages/portal/PortalReports.tsx`
- Statuses: `audit_trails.action` (free-text); `case_reports.status` (`draft|review|approved|sent`); custody enums
- Functions: `log_audit_trail`, `log_case_history`, `log_chain_of_custody`, `get_next_number` (report numbering)
- Owning roles: `/admin/audit` gated owner+admin (route-role only); report approve/send role-gated at route/UI, approver role not server-enforced

**Verified gaps (`confirmed_missing`).** `AuditTrails.tsx` reads with a hard `.limit(100)`, no pagination/date-filter/export, and never displays `old/new_values` or `changed_fields` (forensic value invisible). Report semantics live inside a single `content` JSONB blob (filtered via `.contains()`), not typed columns — `report_type`/`findings`/`version`/`approved_by`/`sent_to_customer_at` are all read out of `content` via `readString(...)`; only `status`/`report_number`/`title`/`case_id`/`created_by` are real columns. `case_reports.status` is `string | null` with no enum (no `report_status`/`report_type` enum in the schema). Approval is weak (`approveReport` accepts any `approverId`; no second-person/role enforcement; no lock against post-approval edits). With approval/sent/version state in JSONB, **no CHECK constraint or RLS policy can enforce "only approved reports can be sent" or "sent reports are immutable."** There is **no structured Certificate of Destruction** (`data_destruction` is one of seven free-text report types — no media-serial list, no destruction-method enum (wipe/degauss/shred), no sanitization-standard field e.g. NIST 800-88, no verification method, no operator+witness signature block) and **no recovered-file manifest report**.

---

## Chain of Custody (cross-cutting)

The chain-of-custody subsystem is substantial in the UI and service layer but its "immutable / cryptographically secured" claim is **not technically backed** — and, critically, it is **not initialized at the one moment that matters: physical device receipt at intake.**

**Tables / enums.** `chain_of_custody`, `chain_of_custody_access_log`, `chain_of_custody_integrity_checks`, `chain_of_custody_transfers`. Enums: `custody_action_category` (`creation|modification|access|transfer|verification|communication|evidence_handling|financial|critical_event`), `custody_status` (`in_custody|in_transit|checked_out|archived|disposed`), `custody_transfer_status` (`initiated|pending_acceptance|accepted|rejected|cancelled`), `integrity_check_result` (`passed|failed|warning|not_applicable`).

**What's solid.** A genuine **server-side append-only backstop** exists: `chain_of_custody*` (all four tables) plus the other audit tables (`audit_trails`, `financial_audit_logs`, `pdf_generation_logs`, `platform_audit_logs`, `supplier_audit_trail`) grant `authenticated`/`anon` only `INSERT, SELECT` — `UPDATE`/`DELETE` are **REVOKED** — and carry a `trg_prevent_mutation_*` BEFORE UPDATE/DELETE trigger (`prevent_audit_mutation()`) that raises `insufficient_privilege` for any non-`service_role`/`postgres` caller (migration `20260525053340`, "belt-and-suspenders"). So an anon-key REST caller cannot UPDATE/DELETE custody rows.

**What's not backed.** The certified PDF (`ChainOfCustodyDocument.ts`) and on-screen banner (`ChainOfCustodyTab.tsx`) both assert "All entries are immutable and cryptographically secured," but:
- `previous_hash`, `hash_algorithm`, `digital_signature`, `witness_*`, `seal_number`, before/after are **metadata-synthesized in `mapChainOfCustodyRow`**, not real columns (self-documented `TODO(B8)`).
- `entry_number` is **derived from query row order** (`rows.length - idx`), so a soft-delete or filter renumbers every entry; the PDF orders ASC while the screen orders DESC — the number is not a stable persisted sequence and gap-detection is impossible.
- `evidence_hash` is optional (`string | null`) and **never written** — `generateHash` (SHA-256) exists but is never called in any write path. There is **no hash chaining and no `verifyChain`/`validateChain`** (grep returns zero matches).
- `deleted_at` exists on `chain_of_custody`, so rows are soft-deletable at the model level (even though the trigger blocks `authenticated` UPDATE/DELETE).
- `log_chain_of_custody` accepts exactly 8 params (`p_action`, `p_action_category`, `p_case_id`, `p_custody_status`, `p_description`, `p_device_id`, `p_location`, `p_metadata`); everything richer is folded into `p_metadata` or dropped. Transfers pack seal/signature/condition into a `notes` text column; integrity checks pack into a `details` column.

**Rule.** Do not represent the current custody log as court-grade tamper-evidence. Before relying on it for legal/forensic export, restore real columns + RPC params (hash chaining, monotonic `entry_number`, witness/seal/signature), add a `verifyChain` function, and **initialize a custody `creation`/DEVICE_RECEIVED event at intake** (Stages 3–4).

---

## Case Status State Machine

**Engine.** `transition_case_status` (DB RPC) + `case_status_transitions` (edges) + `master_case_statuses` (vocabulary), surfaced by `src/lib/caseStateMachineService.ts` and `CaseStageBanner.tsx`. `PHASE_ORDER` runs intake → ... → recovery → qa → completed → delivered. The `completed` phase has three variants (`Completed-Success/Partial/Failed`); terminal states are the three `Completed-*`, `Delivered`, and `Cancelled` (3 variants).

**What it enforces.** For a transition, the RPC validates exactly (a) the phase edge exists in `case_status_transitions` and (b) the caller's `profiles.role` is in that edge's `allowed_roles`. Forward edges allow technician/manager/admin/owner; reopen edges are admin/owner only. A BEFORE-UPDATE trigger `trg_guard_cases_status_changes` → `guard_cases_status_changes()` raises `42501` on any direct `cases.status`/`status_id` change unless session-local `app.bypass_status_guard='true'` (which `transition_case_status` sets around its UPDATE).

**What it does NOT enforce (critical).**
- The `requires[]` preconditions on edges (`qa_passed`, `recovery_completed`, `delivery_recorded`, `recovery_outcome`, `cancellation_reason`) are **pure metadata** — the RPC never reads them, and `CaseStageBanner` renders them as an advisory banner only ("These are advisory — the RPC does not block on them today"). The Confirm button disables only for an empty cancel reason.
- **Two bypass realities.** (1) Case **creation** writes `status` as raw text via INSERT (the guard is BEFORE-UPDATE only), seeding any status. (2) `log_case_checkout` (SECURITY DEFINER) issues a raw `UPDATE cases SET status='Delivered'`; it does **not** set `app.bypass_status_guard`, so for a non-`'Delivered'` starting status the guard actually **fires/conflicts** — but the net is identical: no QA/recovery/delivery/payment enforcement exists on any path.

**Net.** A case can move qa → completed → delivered (or be checked out) with zero verification of QA, recovery, delivery, or payment.

---

## Roles mapped to lifecycle stages

The role set (`owner > admin > manager > technician = sales = accounts = hr > viewer`) is a generic office-SaaS taxonomy. All technical actors collapse into one flat `technician`. There is no cleanroom/imaging vs logical/firmware engineer, no QA reviewer, no evidence custodian, and no forensic examiner — and no permission concept for liability-bearing operations (authorize a destructive attempt, sign QA, release data, accept a custody transfer).

| Stage | Intended owner | Enforced today |
|-------|----------------|----------------|
| 1 Lead / Enquiry | sales | none (any authenticated staff; no entity) |
| 2 Case Creation | sales / front desk | none (quota gate only) |
| 3 Device Intake | technician / intake | none (module-level only) |
| 4 Labeling & Tracking | technician / custodian | module-level (`cases`); transfers hardcoded technician/manager/admin/owner |
| 5 Inspection | technician | module-level; sub-form gated to patient-role in app code |
| 6 Diagnosis | senior technician | module-level (no gate distinguishing who diagnoses) |
| 7 Quotation & Approval | sales / accounts | internal: RLS only; portal: `PortalAuthContext` + `case_portal_visibility` |
| 8 Recovery | imaging/firmware/RAID engineer | transition edges `allowed_roles`; clone/device RLS + module only |
| 9 Engineer Assignment | manager | none (any user reaching tab); pool hardcoded to `role='technician'` |
| 10 Internal Notes | technician | module-level; no per-action gate |
| 11 Verification / QA | QA reviewer (2nd person) | module-level; **no second-reviewer gate** |
| 12 File Listing / Delivery Approval | customer + staff | staff approve/send report; customer read-only (no accept) |
| 13 Checkout / Return | front desk / custodian | **no permission/role/status/payment gate** |
| 14 Billing & Payment | accounts | RLS + role hierarchy (no financial module key in `PermissionsContext`) |
| 15 Closure | manager | forward technician/manager/admin/owner; reopen admin/owner |
| 16 Audit & Reporting | admin / owner | `/admin/audit` owner+admin; report approver role not server-enforced |

**RLS / permission reality (cross-cutting).** On the mutable case+financial surface (`cases`, `case_devices`, `case_recovery_attempts`, `payments`, `invoices`, `quotes`, `quote_items`, `invoice_line_items`, `payment_allocations`, `receipts`) the permissive policies are `SELECT/INSERT/UPDATE = true` with `DELETE = has_role('admin')` — and soft-delete is an UPDATE, so it bypasses even the admin DELETE gate. RESTRICTIVE `tenant_isolation` scopes by tenant but not by role, so **role distinctions among non-admin staff are not enforced on writes**, and these writes are reachable via the anon-key REST API. (The custody/audit surface is the exception — it has the REVOKE + `prevent_audit_mutation` backstop described above.) The `role_module_permissions` table is **empty in the live DB** (15 modules, no seed migration); manager/viewer are short-circuited to empty sidebars, but the service ignores the access flag, so other staff roles effectively get all 15 modules. Lab control points (chain of custody, recovery attempts, QA sign-off) ride inside the `cases` module and cannot be gated independently.

---

## Generic-CRM assumptions to avoid

These are the verified leaks where xSuite reverted toward generic-CRM thinking. Treat each as a known anti-pattern; do not reintroduce, and prefer fixing toward the lab model.

1. **No lead/enquiry object at all.** The lifecycle begins at a fully-formed customer + case; even a generic CRM has a lead. Lead "source" is a single nullable free-text column, and the diagnostic-quote funnel that defines DR sales has no home (this is generic-CRM **minus**).
2. **The physical asset is modeled as a CASE, not as N tracked DEVICES.** One label, one static marketing QR, one custody thread. A 12-drive RAID gets one case label, not 12 scannable device tags — the classic "one ticket = one thing" collapse.
3. **Chain of custody initializes on financial/report/transfer events, not at physical device receipt** — the one moment that matters most for a forensic ledger. It is dressed up as "immutable/cryptographically secured" but is a lean activity log with JSON-stuffed seals/signatures and a row-order-derived entry number.
4. **Diagnosis is a subject+description shape** — a free-text symptoms string plus one flat "problem" label, with no typed per-device failure-mode classification, severity, or recoverability. That is the generic-ticket way, not a lab's coded failure modes that drive triage and pricing.
5. **Recovery progress is just a status label moving forward.** The structured lab work record (`case_recovery_attempts`) and the QA checklist exist in the schema but were never built — the generic-CRM "status field" won over the domain design.
6. **Outcome collapses to ONE case-level status/string.** Per-device `recovery_result` columns exist but are unused, so a job where drive A recovers and drive B is dead cannot be represented — single-record CRM collapse of an inherently multi-device job.
7. **QA/verification is conflated into a forensic hash/seal "integrity check"** bolted onto the custody log. The recovery-QUALITY QA of the recovered dataset (is the data correct/readable) — the thing the customer actually cares about — is absent.
8. **"Delivery" is a staff status flip + printed handover form, and "proof of work" is a passive report PDF download.** The verified recovered-file listing the customer reviews and approves before paying does not exist. Customer approval is wired for quotes (the money) but not for recovered data (the product) — close-the-sale thinking over prove-the-recovery.
9. **Billing is a generic AR module** (invoice → record payment → mark paid) with no awareness that RELEASE OF DATA is the leverage point. Outstanding balance is informational aging, never a hard release blocker; there is no evaluation-fee / recovery-fee / no-data-no-fee model.
10. **Closure is a ticket status flip with advisory-only `requires` gates**, not a controlled lab close-out gated on QA pass + verified delivery + payment + custody release. Unused `case_qa_checklists`/`case_milestones` show the data model anticipated lab-grade controls the implementation reverted away from.
11. **The role set is a generic office-SaaS taxonomy** (sales/accounts/hr/admin) with all technical actors collapsed into one flat `technician`. No cleanroom/imaging vs logical/firmware engineer, no QA reviewer, no evidence custodian, no forensic examiner — and no permission concept for liability-bearing operations.
12. **Permission granularity stops at module-as-CRM-tab** (Cases, Customers, Invoices); lab control points (chain_of_custody, recovery attempts, QA sign-off) ride inside `cases` and can't be gated independently. RLS treats every tenant table as a shared CRM workspace ("in the tenant → read/write everything") rather than as evidence records with controlled authority.
13. **The customer portal is a bespoke `sessionStorage` "fake login"** (no Supabase JWT/claim), so the DB cannot scope rows to the logged-in customer; per-customer isolation is enforced only in client JS — generic "trust the frontend" applied to forensic/custody data.
14. **Quote approval is a ticket-style Approve/Reject with a free-text reason**, not a documented authorization-to-attempt with risk acknowledgement (data could be destroyed when a drive is opened) — and it doesn't advance the case or authorize any device-level work.
15. **NDA/confidentiality and destructive-attempt consent — mandatory gates at DR intake — are entirely absent** from the customer flow despite a fully designed `ndas` table; confidentiality is treated as a CRM afterthought rather than a lifecycle gate.
16. **Case priority is a generic 3-tier ticket priority** (Low/Normal/High) untethered from device health or data criticality — a clicking/failing drive (every power-on risks total loss) is operationally a different urgency than a logical recovery, but the model cannot express it.

---

## Verified gaps & backlog (prioritized)

Severity reflects forensic/legal/customer-trust risk and how load-bearing the gap is for real lab operation. All items are audit-confirmed.

| # | Stage(s) | Gap | Severity |
|---|----------|-----|----------|
| 1 | 5, 10 | `device_diagnostics` insert fails (interface keys ≠ live columns) and the error is **silently swallowed** — all detailed per-component inspection data is dropped (0 rows). | **Critical** |
| 2 | 3 | No NDA capture/signing and no customer identity verification at intake (`ndas`, `id_number`/`id_type` exist, zero frontend usage); **device `password` stored plaintext**; no destructive-attempt consent / work-authorization gate. | **Critical** |
| 3 | 13, 14, 15 | No payment-before-release and no QA-before-close gating; `requires[]` preconditions advisory-only; `log_case_checkout` force-sets `Delivered` via raw UPDATE. A case can close fully unpaid, with no QA, no recovery attempt. | **Critical** |
| 4 | 12 | No recovered-file listing/manifest and no customer delivery-approval/acceptance gate; portal report is read-only View/Download; delivery proceeds on staff action with no QA/approval precondition. | **Critical** |
| 5 | 16 | No structured Certificate of Destruction (no media-serial list, destruction-method enum, NIST 800-88 field, verification method, witness/operator signatures); report approval/immutability cannot be DB-enforced because semantics live in a `content` JSONB blob. | **High** |
| 6 | 16 / CoC | Chain-of-custody "immutable/cryptographically secured" claim is unbacked: no hash chaining, no `verifyChain`, `evidence_hash` never written, `entry_number` row-order-derived, rows soft-deletable; custody not initialized at intake. | **High** |
| 7 | 6, 8, 11, Closure | Structured recovery work-record layer is unwired vaporware: `case_recovery_attempts`, `inventory_parts_usage` (donor consumption), `catalog_donor_compatibility_matrix`, per-device `recovery_result`/`data_recovered_size`, `case_qa_checklists`, `case_milestones` — all 0 refs / 0 rows. | **High** |
| 8 | 8, 12, Closure | Multi-device outcome collapse: outcome lives only at case level; a multi-drive job where drive A recovers and drive B is dead cannot be represented (per-device columns never written; per-attempt linkage unused). | **High** |
| 9 | 7 | Customer quote approval loop is non-functional end-to-end: portal reads `case_quotes` (0 rows, never written) while `approve_quote`/`reject_quote` mutate `quotes` looking up status names that don't exist (`'Approved'`/`'Rejected'`). | **High** |
| 10 | Cross-cutting RLS | Mutable case/financial surface uses `USING(true)`/`WITH CHECK(true)` for SELECT/INSERT/UPDATE, admin-only DELETE bypassed by soft-delete-as-UPDATE; no role-on-write enforcement beyond tenant isolation; reachable via anon-key REST. (Custody/audit surface is correctly backstopped — that part of the original claim is refuted.) | **High** |
| 11 | Portal | Customer portal is a `sessionStorage` "fake login" with no Supabase JWT/claim — DB cannot scope rows per-customer; isolation is client-side only on forensic/custody data. | **High** |
| 12 | 9 | Engineer pool hardcoded to `profiles.role='technician'` (ignores HR `employees`, excludes non-technician staff); no workload/skill matching; **hard DELETE on removal** despite `removed_at`/`deleted_at` (destroys assignment audit trail). | **Medium** |
| 13 | 4 | Labeling is case-level with a static non-encoding "QR"; no per-device serial-bound scannable tag; `storage_location` never written. | **Medium** |
| 14 | 1 | No lead/enquiry entity, no diagnostic-fee/triage funnel, no first-response SLA or enquiry ownership; conversion/source ROI unmeasurable. | **Medium** |
| 15 | 10 | No internal-vs-portal visibility flag on `case_internal_notes`; "Private" badge is dead UI (`note.private` never populated). | **Medium** |
| 16 | 16 | `AuditTrails.tsx` hard `.limit(100)`, no pagination/date-filter/export, never shows `old/new_values`/`changed_fields`; `financial_audit_logs` never written by frontend. | **Medium** |
| 17 | Cross-cutting permissions | `role_module_permissions` empty in live DB (15 modules, no seed); service ignores the access flag so most staff roles get all modules; lab control points can't be gated independently. | **Medium** |
| 18 | 6, Priority | Diagnosis/fault has no typed failure-mode classification, severity, or recoverability; priority is generic 3-tier untethered from device health/data criticality. | **Low** |

---

_End of canonical workflow reference. When in doubt on any case/device/custody/financial/reporting change, locate it in the 16-stage model above first, and prefer the lab-model fix over the generic-CRM shortcut._
