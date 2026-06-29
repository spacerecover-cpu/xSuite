# Document Studio — Phase 11 (Retire Legacy Report Stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Document Studio the **sole, default** report system and fully retire the legacy report stack — remove the legacy run-time + admin UI and write services, migrate historical reports into the new system so nothing forensic is lost, and ban the retired tables in lint. (Owner decision: "full delete, accept losses" — tenant section-library/preset/template-mapping customization is intentionally dropped in favor of the built-in Option-B sections.)

**Architecture:** The new `document_instances` flow already covers the full run-time path (create → edit → preview/PDF → approve → send → portal sign-off → versioning) via the **shared** render engine (`buildReportDocViaEngine` + `reportAdapter` + `renderTemplate`) and server-enforced RPCs. Phase 11 flips the flag default to ON, deletes the legacy UI/services, **migrates historical `case_reports` → `document_instances`** (additive, idempotent) so they stay viewable, and lint-bans the legacy tables. Tables are **frozen, never dropped** (audit/retention). The destructive write-`REVOKE` is a **separate post-deploy migration** (it would break the still-running production app if applied before the new code ships).

**Tech Stack:** React 18 + TS, Supabase (data migration via `apply_migration`), Vitest, ESLint (banned-tables rule), the existing PDF engine. No new npm packages.

## Global Constraints

- **NEVER `DROP` a legacy table; NEVER delete report data.** Retention/auditability is mandatory (CLAUDE.md). Retirement = remove code + REVOKE writes (post-deploy) + freeze tables read-only. History is migrated, not destroyed.
- **Historical reports must remain viewable.** A one-time additive migration creates a `document_instances` (+ `document_instance_sections`) record for each non-deleted `case_reports` row, so the new `DocumentViewerModal` shows them. Idempotent (skip rows already migrated, keyed by a `legacy_case_report_id` marker).
- **The live write-`REVOKE` is POST-DEPLOY only.** Applying it now breaks the running production app (old code still writes `case_reports`). Phase 11 here is code + an additive data migration; the `REVOKE` migration is written + documented and applied after the new code is deployed.
- **Lint-ban ordering (CI is fail-by-design):** a table may be added to `eslint-rules/banned-tables.js` / the `from-table-names` check ONLY after every live `.from('<table>')` reference to it is deleted. Ban each table in the SAME task that removes its last consumer, never before.
- **Do NOT remove shared pieces:** `reportAdapter` (`toEngineData`, `reportSubtypeSections`, canonical maps), `renderTemplate`, `reportPDFService.buildReportDocViaEngine` + `generateDocumentInstanceAsBlob`, `documentInstanceData.fetch.ts`, `createPdfWithFonts`/`initializePDFFonts`/`fontLoader`/`loadImageAsBase64`/`withTimeout`, `documentInstanceService` + its RPCs. These power the NEW flow.
- **Flag becomes an opt-OUT kill switch:** `isDocStudioEnabled()` returns `true` unless `VITE_DOC_STUDIO === 'false'` (so the new flow is default-on, with an escape hatch). Keep the function (call sites stay valid).
- **Gates per task:** `npm run typecheck` = 0; `npm run lint` (banned-tables) clean; relevant vitest green; `npx vitest run src/lib/pdf` green (engine untouched). Commit locally only — DO NOT push. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Order matters** (each task leaves the app working): default-on → migrate history → repoint viewers to the new flow → delete legacy writers/admin/hub + ban their tables → delete legacy readers + ban remaining tables → (post-deploy) REVOKE.

## Retirement inventory (from discovery)

**Delete (legacy-only):** `CaseReportsTab`, `ReportViewModal`, `StreamlinedReportEditor`, `ReportTypeSelectionModal`, `CaseReportsHub` (+ `/case-reports` route + nav), `ReportSectionsPage` (+ route), `ReportTemplatesTab`, `PortalReports` (+ route or redirect), `reportSectionService`, `reportsService` (after readers migrated), the legacy `reportPDFService.fetchReportData`/`persistReportPDF`/`buildReportDocument` branch, the `useCaseQueries` `case_reports` query, the `reports` tab in `CaseDetail`.
**Ban (6 tables):** `case_reports`, `case_report_sections`, `master_case_report_templates`, `report_section_library`, `report_section_presets`, `report_template_section_mappings`.
**Keep (shared/new):** everything under "Do NOT remove shared pieces" above.

---

## Task 1: Flag default-ON (opt-out kill switch)

**Files:** Modify `src/lib/featureFlags.ts`; Test `src/lib/featureFlags.test.ts` (create).

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDocStudioEnabled } from './featureFlags';
afterEach(() => { vi.unstubAllEnvs(); });
describe('isDocStudioEnabled (opt-out)', () => {
  it('defaults ON when the var is unset', () => { expect(isDocStudioEnabled()).toBe(true); });
  it('is OFF only when explicitly "false"', () => { vi.stubEnv('VITE_DOC_STUDIO', 'false'); expect(isDocStudioEnabled()).toBe(false); });
  it('is ON for any other value', () => { vi.stubEnv('VITE_DOC_STUDIO', 'true'); expect(isDocStudioEnabled()).toBe(true); });
});
```
- [ ] **Step 2: Run → fails** (`npx vitest run src/lib/featureFlags.test.ts`).
- [ ] **Step 3: Implement** — invert to opt-out:
```ts
export function isDocStudioEnabled(): boolean {
  const raw = (import.meta.env as Record<string, unknown>).VITE_DOC_STUDIO;
  return raw !== 'false';
}
```
(Update the doc comment to describe the kill switch.)
- [ ] **Step 4: Run → passes.** Then `npm run typecheck` = 0 AND full `npx vitest run` green except the known Typst flake — IMPORTANT: flipping default-on may activate doc-studio code paths in other tests; fix any test that implicitly relied on default-off by stubbing `VITE_DOC_STUDIO='false'` where it asserts legacy behavior. Resolve all fallout here.
- [ ] **Step 5: Commit** `feat(documents): default Document Studio ON (opt-out VITE_DOC_STUDIO=false kill switch) (Phase 11)`.

---

## Task 2: Migrate historical case_reports → document_instances (additive, idempotent)

**Files:** apply via `mcp__supabase__apply_migration` (project `ssmbegiyjivrcwgcqutu`); commit `supabase/migrations/<version>_migrate_legacy_reports_to_instances.sql` + manifest row; regenerate `database.types.ts` if a column is added.

Approach: add a nullable marker `document_instances.legacy_case_report_id uuid` (idempotency key + provenance) with a partial unique index, then a one-time `INSERT … SELECT` that creates a `document_instances` row per non-deleted `case_reports` row (mapping: `case_id`, `doc_type='report'`, `report_subtype` from `content.report_type`, `title`, `document_number=report_number`, `status` mapped legacy→`document_instance_status` [draft/in_review→draft; approved→approved; sent→delivered], `visible_to_customer` from content, `created_by`, timestamps, `pdf_storage_path` from `content.pdf_file_path` if present) and `document_instance_sections` rows from `case_report_sections`. `WHERE NOT EXISTS (… legacy_case_report_id = case_reports.id)` for idempotency. Data-only writes via the guard-bypass pattern if needed.

- [ ] **Step 1: Introspect** the live shapes first (`mcp__supabase__execute_sql`): `case_reports` columns + `content` JSONB keys actually present, `case_report_sections` columns, the `document_instance_status` enum values, and row counts (how many to migrate). Confirm the legacy→new status mapping against real `status` values.
- [ ] **Step 2: apply_migration** `migrate_legacy_reports_to_instances`:
  - `ALTER TABLE document_instances ADD COLUMN IF NOT EXISTS legacy_case_report_id uuid;`
  - `CREATE UNIQUE INDEX IF NOT EXISTS uq_di_legacy_report ON document_instances(legacy_case_report_id) WHERE legacy_case_report_id IS NOT NULL;`
  - `INSERT INTO document_instances (...) SELECT ... FROM case_reports cr WHERE cr.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM document_instances di WHERE di.legacy_case_report_id = cr.id);`
  - `INSERT INTO document_instance_sections (...) SELECT ... FROM case_report_sections s JOIN document_instances di ON di.legacy_case_report_id = s.report_id WHERE s.deleted_at IS NULL AND NOT EXISTS (...);`
  - Set `tenant_id` from the source row; preserve `created_at`. Do NOT touch `case_reports` (source frozen, untouched).
- [ ] **Step 3: Verify** (`execute_sql`): migrated count == source count; spot-check a few mapped rows (status, subtype, sections count); confirm re-running the INSERT is a no-op (idempotent). Paste counts into the report.
- [ ] **Step 4: Regenerate types** (`mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`) for the new `legacy_case_report_id` column; commit the `.sql` + manifest row + regenerated types.
- [ ] **Step 5: Commit** `feat(db): migrate historical case_reports into document_instances (additive, idempotent) (Phase 11)`.

> SAFETY: additive only — creates new rows, never alters/deletes `case_reports`. Reversible (the migrated `document_instances` carry `legacy_case_report_id`; they can be soft-deleted to undo). This is what lets the legacy readers be removed without losing history.

---

## Task 3: Make Documents the default case surface; delete the legacy reports tab + run-time editors

**Files:** Modify `src/pages/cases/CaseDetail.tsx`, `src/components/cases/detail/useCaseQueries.ts`, `src/components/cases/detail/useCaseModals.ts`; Delete `CaseReportsTab.tsx`, `StreamlinedReportEditor.tsx`, `ReportTypeSelectionModal.tsx`, `ReportViewModal.tsx`.

- [ ] **Step 1** Remove the `reports` tab from the `CaseDetail` tabs array + its render block + the legacy modal mounts (ReportTypeSelectionModal/StreamlinedReportEditor/ReportViewModal). The `documents` tab (now default-on) becomes the report surface; relabel it "Reports" for users.
- [ ] **Step 2** Remove the `case_reports` query from `useCaseQueries.ts` and the legacy report modal state from `useCaseModals.ts` (the `reportTypeFilter`/`editingReport`/`viewReportId`/`reportVersioningId` etc. that only fed the deleted UI). Keep the documents state added in Phase 8.
- [ ] **Step 3** Delete the four component files. Remove their imports/lazy-imports.
- [ ] **Step 4** `npm run typecheck` = 0 (fix all dangling refs), `npm run lint` clean, `npx vitest run` green (delete/replace tests that referenced the removed components — e.g. CaseReportsTab/ReportViewModal tests).
- [ ] **Step 5: Commit** `refactor(documents): Documents tab is the default report surface; remove legacy case-side report UI (Phase 11)`.

---

## Task 4: Delete the cross-case hub + legacy admin (Report Studio) + ban their 3 tables

**Files:** Delete `src/pages/cases/CaseReportsHub.tsx`, `src/pages/settings/ReportSectionsPage.tsx`, `src/components/reports/ReportTemplatesTab.tsx`, `src/lib/reportSectionService.ts`; Modify `src/App.tsx` (remove `/case-reports` + the report-sections route), `src/components/layout/navConfig.ts` (remove the nav entries); Modify `eslint-rules/banned-tables.js`.

- [ ] **Step 1** Remove the routes (`/case-reports`, the report-sections settings route, the Report Studio templates route/tab) + nav entries. Delete the four files + any now-orphaned imports.
- [ ] **Step 2** Grep to confirm ZERO remaining `.from('report_section_library')` / `.from('report_section_presets')` / `.from('report_template_section_mappings')` references (these were only `reportSectionService` + the deleted admin UI). If `reportsService.cloneTemplateToTenant` references `report_template_section_mappings`, neuter/delete it (admin-only).
- [ ] **Step 3** Add `report_section_library`, `report_section_presets`, `report_template_section_mappings` to `eslint-rules/banned-tables.js`.
- [ ] **Step 4** `npm run typecheck` = 0; `npm run lint` clean (the bans now pass — no live refs); `npx vitest run` green (remove dead admin tests).
- [ ] **Step 5: Commit** `refactor(documents): remove legacy Report Studio admin + cross-case hub; ban section-library tables (Phase 11)`.

---

## Task 5: Retire `reportsService` writes + the legacy `reportPDFService` paths + legacy portal; ban the remaining 3 tables

**Files:** Modify/Delete `src/lib/reportsService.ts`, `src/lib/reportPDFService.ts`; Delete `src/pages/portal/PortalReports.tsx` (+ route/redirect); Modify `eslint-rules/banned-tables.js`.

- [ ] **Step 1** Now that the historical reports are migrated (Task 2) and viewable via the new viewer, remove the legacy READERS too: delete `PortalReports` (redirect `/portal/reports` → `/portal/documents`), delete `reportsService` entirely (all CRUD on `case_reports`/`case_report_sections`/`master_case_report_templates`), and remove the legacy `reportPDFService.fetchReportData` / `persistReportPDF` / `buildReportDocument` branch — KEEP `buildReportDocViaEngine` + `generateDocumentInstanceAsBlob` + shared infra.
- [ ] **Step 2** Grep to confirm ZERO remaining `.from('case_reports')` / `.from('case_report_sections')` / `.from('master_case_report_templates')` references anywhere in `src/`. Resolve any stragglers (e.g. a stale import).
- [ ] **Step 3** Add `case_reports`, `case_report_sections`, `master_case_report_templates` to `eslint-rules/banned-tables.js` (+ the `from-table-names` allow/deny list as needed).
- [ ] **Step 4** `npm run typecheck` = 0; `npm run lint` clean (all 6 legacy tables now banned, no live refs); `npx vitest run` green; `npx vitest run src/lib/pdf` green (engine intact).
- [ ] **Step 5: Commit** `refactor(documents): retire legacy report services + portal reports; ban case_reports tables (Phase 11)`.

---

## Task 6: Post-deploy `REVOKE` migration (written now, APPLIED after deploy)

**Files:** Create `supabase/migrations/<version>_freeze_legacy_report_tables.sql` (committed, NOT applied now) + a `docs/superpowers/specs/` note on the apply-after-deploy procedure.

- [ ] **Step 1** Author the `REVOKE`-writes migration: `REVOKE INSERT, UPDATE, DELETE ON case_reports, case_report_sections, master_case_report_templates, report_section_library, report_section_presets, report_template_section_mappings FROM authenticated;` (+ apply `prevent_audit_mutation`-style BEFORE-trigger freeze consistent with the append-only posture, keeping RLS tenant-isolation + SELECT intact for any service-role/historical needs). Do NOT `DROP`. Add the manifest row.
- [ ] **Step 2** Write a clear apply-after-deploy note (this migration is the ONLY Phase-11 step that must run AFTER the new code is live in production; applying it before deploy breaks the running app). Do NOT call `apply_migration` for it in this phase.
- [ ] **Step 3: Commit** `chore(db): post-deploy freeze (REVOKE writes) migration for retired report tables — APPLY AFTER DEPLOY (Phase 11)`.

---

## Final verification (before local merge)

- [ ] `npm run typecheck` = 0; `npm run lint` clean (all 6 tables banned, zero live refs); `npx vitest run` green except the known Typst flake (isolated pass); `npx vitest run src/lib/pdf` green.
- [ ] `grep -rE "\.from\('(case_reports|case_report_sections|master_case_report_templates|report_section_library|report_section_presets|report_template_section_mappings)'\)" src/` → ZERO results.
- [ ] Manual (localhost): the case **Reports** surface is the new Documents flow; historical reports (migrated) are viewable; create/edit/approve/send/portal sign-off all work; no dead routes/nav; `/portal/reports` redirects.
- [ ] DB: migrated `document_instances` count == source `case_reports` count; `case_reports` untouched (frozen source). The `REVOKE` migration is committed but NOT applied (post-deploy).

## Scope notes
- **Accepted losses (owner decision):** tenant section-library/preset customization + per-template section mappings + the cross-case Reports Hub's bespoke admin UX. Reports now use the built-in Option-B sections.
- **Preserved (non-negotiable):** historical report data (migrated + frozen, never dropped), forensic viewability, audit/custody.
- **Post-deploy:** apply the `REVOKE` freeze migration once the new code is live.
