# Document Studio — Unified Document & Reporting Architecture (Design)

> Status: **approved** (2026-06-27). Implementation tracked on branch `feat/document-studio`.
> This is the canonical design spec; the working plan lives at the session plan file.

## Context

The current **Report** system (Settings → "Report Studio" = `ReportSectionsPage.tsx`, plus the case-side
`CaseReportsTab → ReportTypeSelectionModal → StreamlinedReportEditor → ReportViewModal` flow) is hard to maintain
and does not produce professional output. The root cause is **architectural, not cosmetic**:

> **Reports run on two template systems bolted together.** All 12 other document types already render through ONE
> modern, config-driven engine (`src/lib/pdf/engine/renderTemplate.ts` + per-type *adapters* + versioned
> `document_templates` / `document_template_versions`). Reports are the **only** type that *also* drags a legacy
> authoring stack — `master_case_report_templates` + `report_section_library` + `report_section_presets` +
> `report_template_section_mappings` + `case_report_sections` — and stores their entire lifecycle state
> (status, version, approval, visibility, PDF path) inside an **untyped `case_reports.content` JSONB blob**. The DB
> can neither enforce nor query any of it: approval is cosmetic (a technician can approve their own report; a draft
> can be "sent"), "latest version" is a JS-side filter, and a "sent" report can have no retrievable PDF.

Confirmed in code: `src/lib/reportTypes.ts` already declares the `Report` interface as a **flat, typed shape** — the
TS layer is already built for a real table; the DB just hasn't caught up. The same file injects raw hex
(`#3b82f6`, `#10b981`, …) via inline `style`, violating DESIGN.md token rules — to be retokenized en route.

**Decision (owner-confirmed):** unify **all** document types into one **Document Studio**; reports must
**auto-populate** from existing case data; approvals require **server-enforced approval + captured signatures
embedded in the PDF + a portal customer sign-off gate**; **PDF + Print only** (no Word/DOCX).

**Intended outcome:** one engine, two faces — *design the template* (Document Studio, admin) and *produce the
document* (case-side, auto-populated). An engineer opens a near-complete draft, reviews/tweaks, previews the real
PDF, and releases in seconds. Every released document is forensically provable (snapshot of resolved data +
template version + PDF hash + signatures).

## The Spine (recommended architecture)

Separate design-time from run-time, with a typed document *instance* between them.

| Layer | What it is | Built on |
|---|---|---|
| **Design-time** = Document Studio (admin) | One place to design/version **every** document template | existing `document_templates` / `document_template_versions` / `DocumentTemplateConfig` + `TemplateStudio` + `previewTemplate.ts` |
| **Binding layer** (new) | Resolves live case data → template variables; evaluates conditional sections; applies editor overrides | new `src/lib/pdf/binding/*` beneath the existing per-type adapters |
| **Run-time** = Documents (case-side) | Auto-populated draft → review → approve → sign → release | refactors of `StreamlinedReportEditor` / `ReportViewModal` / `CaseReportsTab` |
| **Document instance** (new typed record) | Snapshot of resolved data + `template_version_id` + output PDF + `sha256` + lifecycle + signatures | new `document_instances` table (replaces the `case_reports.content` blob) |

**Forks resolved:** (1) **Replace** `case_reports` with the typed `document_instances` (universal lifecycle+snapshot
record for all doc types); report bodies migrate `case_report_sections` → `document_instance_sections`;
`case_reports` is soft-retired after migration. Fallback: keep `case_reports` as an overlay + add `document_instances`
as a snapshot ledger only. (2) **Automation = service-layer side-effect** on the case-status mutation, NOT a DB
trigger (pdfmake renders client-side).

**Reuse, don't rebuild.** The render engine, template config/version system, live preview, parity-test harness,
RTL/bilingual handling, neutral-by-default branding, and `EmailDocumentModal` + `send-document-email` all stay.

## Database structure (additive, schema-discipline compliant)

All new tenant-scoped tables: `tenant_id NOT NULL`, RLS enable+force, RESTRICTIVE isolation
(`tenant_id = get_current_tenant_id() OR is_platform_admin()`), `set_<table>_tenant_and_audit` trigger,
`idx_<table>_tenant_id` partial index `WHERE deleted_at IS NULL`, soft delete. No DROP/DELETE; additive only.

- **`document_instances`** — universal generated-document record. `doc_type` enum (office_receipt, customer_copy,
  checkout_form, case_label, stock_label, quote, invoice, payment_receipt, payslip, chain_of_custody, report,
  certificate_of_destruction); `report_subtype` (reports only, CHECK-gated); source FKs
  (`case_id`/`device_id`/`invoice_id`/`quote_id`/`customer_id` + "source present" CHECK); `template_version_id`
  (snapshot); `instance_overrides` jsonb; `document_number`; `status` enum
  (draft/in_review/approved/rejected/issued/delivered/signed_off/superseded/void); `version_number` +
  `supersedes_id` + `is_latest` (real, indexable); `resolved_data` jsonb; `pdf_storage_bucket`/`pdf_storage_path`/
  `pdf_sha256`/`pdf_generated_at`; approval fields (`reviewed_by/at`, `approved_by/at`, `rejected_by/at`,
  `rejection_reason`) with **`CHECK approved_by <> generated_by`**; delivery/sign-off fields (`delivered_at`,
  `visible_to_customer`, `signed_off_by_customer_at`, `customer_signoff_signature_id`); `forensic_custody_id`;
  actor stamps + soft delete. Unique `(tenant_id, doc_type, document_number)`; one-latest-per-chain partial unique.
- **`document_instance_sections`** — per-report prose body (migrated from `case_report_sections`).
- **`document_signatures`** — typed/drawn/uploaded/click-to-accept per slot (engineer/qa_reviewer/approver/
  lab_manager/customer/witness); signer identity, image ref + typed_value + sha256, signed_at, ip, user_agent;
  **append-only after signing**; unique `(document_instance_id, slot)`; deferred FK from `document_instances`.
- **`document_status_transitions`** — table-driven edges (doc_type, from, to, allowed_roles[], requires[]).

Clinical-capture activation (tables already RLS/trigger-ready; gap is write paths):
`ALTER device_diagnostics ADD case_id` + backfill; `ALTER case_diagnostics ADD recoverability_pct (0–100 CHECK)` +
`recoverability_assessment`; value CHECKs on `case_diagnostics.diagnostic_type/result` and
`case_recovery_attempts.method`; AFTER INSERT custody-logging triggers on `case_recovery_attempts` +
`case_qa_checklists`.

Server-enforced lifecycle: RLS authoring-update policy (client UPDATE only while draft/in_review) + BEFORE UPDATE
guard trigger (`app.bypass_document_guard` pattern); `transition_document_instance(...)` SECURITY DEFINER RPC
(role-gated, second-person, send-gate requires approved + pdf + sha256); `portal_sign_off_document(...)` scoped by
`get_current_portal_customer_id()`; portal SELECT gated on `status IN ('delivered','signed_off') AND
visible_to_customer` (fixes the existing draft-leak).

Numbering: reuse `get_next_number(scope)`; reports keep `report_<subtype>`; invoice/quote-backed instances snapshot
the existing business number (no double-mint); Studio-only docs mint their own.

## Run-time happy path
CaseDetail → Documents tab → + New document → (report type) → **Draft Review** opens pre-filled with provenance
banners → tweak → Preview (real PDF) → Submit for review → Approve (different user, second-person) → Sign → Send
(render → hash → archive → snapshot → delivered) → Portal customer sign-off → signed_off. "Quick documents"
(receipt/copy/label/checkout) skip authoring.

## UI/UX
Tokens only (14 semantic + `cat-1..8`); lucide icons; no purple/indigo/violet, no raw hex, no emoji; retokenize
`reportTypes.ts`/`REPORT_STATUS_CONFIG`/`CATEGORY_CONFIG`. Accessibility-first (reorder via buttons+keyboard+optional
drag, never drag-only; signature canvas with typed fallback; focus trap; aria-current; status icon+text; aria-live).
Mobile-first portal signing (single column, min-h-dvh, ≥44px, pinch-zoom preserved, deep-linkable route).

## Modules & components
**New:** `DocumentStudioPage`, `SectionComposer`, `SectionsTab`, `BrandingColorTab`, `VersionHistoryDrawer`,
`SignatureCaptureModal`, `CaseDocumentsTab`, `DraftReview`, `DocumentViewerModal`, `PortalDocumentSign`,
`src/lib/documentSourceMap.ts`, `src/lib/documentInstanceService.ts`, `src/lib/automation/documentAutomation.ts`,
`src/lib/pdf/binding/{variableCatalog,caseDataGraph,interpolate}.ts`.
**Refactor:** `StreamlinedReportEditor → DraftReview`; `CaseReportsTab → CaseDocumentsTab`;
`ReportViewModal → DocumentViewerModal`; `ReportSectionsPage` → `SectionsTab` (route redirected); `reportAdapter` →
`BindingContext`; `reportPDFService.persistReportPDF` → `documentInstanceService`.
**Reuse:** `renderTemplate`, `previewTemplate`, `templateConfig`, `documentTemplateService`, `RichTextEditor`,
`EmailDocumentModal` + `send-document-email`, `AuditInfo`/`formatDateTimeWithConfig`, `ui/Dialog`/`Tabs`/`Card`/
`Badge`, `useConfirm`/`useToast`, `PermissionsContext`/`TenantConfigContext`.

## How Document Studio works
Consolidate `/settings/documents`, `/settings/report-sections`, the template manager → one
**`/settings/document-studio`** (old routes redirect). Landing = typed gallery grid grouped into bands. Opening a
card → `TemplateStudio` shell (tab rail · field panel · sticky live preview); report type gets a **Sections
composer** (reorder/toggle + per-section "Show when") + **Content** tab absorbing Section Library + Presets. Version
History drawer = deploy/rollback/compare (deploy-forward, non-destructive). Keep `/templates` as a sibling.

## Report templates
Replace single `BUILT_IN_TEMPLATE_CONFIGS.report` with 8 report-subtype built-ins (differ in `documentTitle`,
default-visible sections, `condition`s). Each `master_case_report_templates` row → a `document_templates` (report)
row + deployed version with `config.sections` from `report_template_section_mappings` (+ `report_section_library`
seed palette). Drop dead mapping columns (is_collapsible, custom_label, section_config).

## PDF generation workflow
`generate → bind → render → hash → archive → snapshot → (deliver)`: `fetchCaseDataGraph` (one fetch), resolve
variables + overrides + conditions, adapter → `EngineDocData` → `renderTemplate` → blob, `sha256` via
`crypto.subtle`, upload to private bucket `{tenant}/{type}/{source_id}/{hash}.pdf`, insert `document_instances`,
then flip status. Signatures embed via existing `signature.ts`/`digitalSignatures.ts` (`EngineDocData.signatureBlocks[]`,
additive). Add `SectionConfig.condition` + `pageBreakBefore` (additive; parity preserved). Lazy-import pdfmake.

## Automation
Service-layer post-transition hook (`documentAutomation.onCaseTransitioned`) from the case-status mutation
`onSuccess`. Advisory, idempotent, failure-isolated. **P1** delivered → draft data-destruction certificate; **P2**
diagnosis→quoting → draft evaluation report; **P3** recovery→qa → draft service report + configurable rules.

## Phased implementation
0 Foundations + flag · 1 Binding layer + lazy pdfmake · 2 Schema (instances/signatures/RPCs) · 3 Snapshot &
provability · 4 Server-enforced approval · 5 Clinical capture · 6 Signature capture/embedding · 7 Document Studio
admin · 8 Run-time Documents tab · 9 Portal sign-off · 10 Automation · 11 Retire legacy (REVOKE-only, last).
One branch `feat/document-studio`, atomic commits, feature-flagged (`VITE_DOC_STUDIO` + `VITE_PDF_ENGINE_REPORT`).
`npm run typecheck` before each commit; verify on localhost per phase.

## Migration sequence (additive, reversible)
`enums_document_studio` → `create_document_instances` → `create_document_instance_sections` →
`create_document_signatures` (+ deferred FK) → `create_document_status_transitions` (+ seed) →
`document_lifecycle_rpcs` → `activate_clinical_tables` → `fold_report_templates` →
`migrate_case_reports_to_instances` → `number_sequences_seed_doc_types` → `retire_legacy_report_stack` (REVOKE,
last). Apply via `mcp__supabase__apply_migration` (`project_id = ssmbegiyjivrcwgcqutu`); regen
`src/types/database.types.ts` after each.

## Risks & mitigations
Forensic provability (hash exact bytes; snapshot atomically; archive-then-mark; sign-off = new instance);
**live release gates flip on** when clinical tables get data (existing `transition_case_status` gates start
enforcing); multi-tenant isolation (RESTRICTIVE policy + same-tenant FK validation); append-only guarantees
(INSERT-only into audit/custody; signatures append-only after signing); portal draft-leak (cut portal to
`document_instances` before retiring `case_reports`); numbering double-mint; scope (large — fallback noted).

## Verification
`npm run typecheck`=0; `npm run test` green (parity suite is the cutover gate); `npm run check:schema-drift` +
`check:tokens` clean; localhost end-to-end per phase; Supabase MCP DB checks (RLS RESTRICTIVE, RPC rejects
cross-tenant/unauthorized, custody/audit rows written, destruction-cert `evidence_hash` = `pdf_sha256`).
