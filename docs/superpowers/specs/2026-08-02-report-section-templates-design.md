# Report Section Templates — predefined per report type, tenant-choosable & customizable

**Date**: 2026-08-02
**Status**: Approved for implementation (autonomous session; user request: "Implement all the report
sections - predefined templates based on the report type so that tenant can choose and then
customize the template")
**Lifecycle stage**: 16 (Audit Trail & Reporting) — reports are stage-16 output surfaces; the
templates only shape report *structure*, never case status, custody, or delivery gates.

## Problem

The Document Studio "New Document" menu (Case Detail → Reports tab) offers the 8 report types
(evaluation, service, server, malware, forensic, data_destruction, prevention, recovered_files),
but the sections each report starts with are **hardcoded** in
`src/lib/pdf/engine/adapters/reportAdapter.ts` (`SUBTYPE_SECTIONS` → `reportSubtypeSections()`):

- A tenant cannot choose between predefined section templates for a report type.
- A tenant cannot customize the section structure (add / remove / rename / reorder) — neither
  persistently nor per document. `DocumentDraftReview` edits section *content* only.
- The PDF assembler (`buildReportSections`) iterates the hardcoded subtype key list, so any
  authored section outside that list is **silently dropped** from the delivered PDF — custom
  sections could never print even if seeded.
- CLAUDE.md's domain model lists `report_section_library` / `report_section_presets` /
  `report_template_section_mappings` / `master_case_report_templates` / `case_reports` /
  `case_report_sections`, **none of which exist in the live DB** (the live system is
  `document_instances` + `document_instance_sections`). This spec implements the first two under
  their documented names and corrects the doc.

## Approaches considered

1. **Hybrid single table** (`tenant_id NULL` = system template, non-NULL = tenant clone — the
   dormant `ReportTemplate` interface in `src/lib/reportTypes.ts` describes this). Rejected:
   violates the tenant-table CI kit (`tenant_id NOT NULL` + RESTRICTIVE isolation are asserted by
   `scripts/check-tenant-table-requirements.sql`) and would need bespoke RLS.
2. **Fully normalized global side** (library + presets + a `report_template_section_mappings`
   join). Rejected: the tenant side still needs materialized per-template sections (rename/custom
   sections), so the join buys nothing and doubles the resolution paths.
3. **Two global tables + one tenant table, sections as ordered JSONB** (chosen — details below).
   One section-descriptor shape end-to-end; global presets are platform-curated snapshots; tenant
   templates are self-contained customized copies; the built-in hardcoded list remains the final
   fallback so an empty/unreachable catalog can never break report creation.

## Design

### Section descriptor (one shape everywhere)

```ts
interface TemplateSectionDescriptor {
  key: string;        // canonical or custom snake_case key
  title: string;      // display title (seeds document_instance_sections.title)
  guidance?: string;  // editor placeholder copy (never printed)
  required?: boolean; // UI hint only — required sections can't be toggled off in composers
}
```

Stored as an ordered JSONB array on presets and tenant templates; array order IS section order.

### Tables

> **Naming amendment (implementation)**: the two global tables ship as
> **`master_report_sections`** and **`master_report_section_presets`** — the names originally
> spec'd below (`report_section_library` / `report_section_presets`) turned out to be on the
> pre-1.0.0 BANNED legacy list (`eslint-rules/banned-tables.js`); CLAUDE.md's System (Global) row
> listing them was stale documentation of dropped tables, not an implementation target. Global
> reference data carries the `master_*` prefix. Everything else about the two tables is as
> designed.

**`report_section_library`** (global catalog; RLS: SELECT `true` to authenticated, writes
`(SELECT is_platform_admin())`): one row per canonical section — `section_key` unique, `title`,
`guidance`, `tone` (neutral/info/success/warning/danger), `kind` (prose/custody/
destruction_certificate), `sort_order`, `is_active`. Seeded from the adapter's
`CANONICAL_SECTIONS` + `SECTION_GUIDANCE` (~34 sections). Powers the "Add section" picker.

**`report_section_presets`** (global predefined templates; same RLS as library): `report_type`
(CHECK of the 8 types), `name`, `description`, `sections jsonb` (CHECK `jsonb_typeof = 'array'`),
`is_default`, `is_active`, `sort_order`. Seeded: one **Standard** preset per type (exactly the
current `reportSubtypeSections()` output, `is_default = true`) plus a **Compact** variant for
evaluation / service / server / malware (executive summary → findings → outcome core). Forensic,
data-destruction, prevention and recovered-files keep a single statutory/complete preset.
Unique partial index: one default preset per report_type (`WHERE is_default AND is_active`).

**`report_section_templates`** (tenant customized templates; FULL tenant kit — `tenant_id uuid
NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, RESTRICTIVE isolation policy with
InitPlan-wrapped helpers, permissive SELECT `true` / INSERT+UPDATE `(SELECT is_staff_user())` /
DELETE `(SELECT has_role('admin'))`, `set_report_section_templates_tenant_and_audit` +
`set_report_section_templates_audit_actor` triggers, `idx_report_section_templates_tenant_id`
partial index — mirroring `document_templates_pdf` exactly): `report_type`, `name`,
`description`, `sections jsonb`, `is_default`, `is_active`, `source_preset_id uuid NULL
REFERENCES report_section_presets(id)`, audit columns, `deleted_at`. Unique partial index: one
default per `(tenant_id, report_type)` `WHERE is_default AND deleted_at IS NULL`. Soft deletes
only.

`report_template_section_mappings` and `master_case_report_templates` are NOT created; CLAUDE.md
is corrected to the implemented reality (and `case_reports`/`case_report_sections` rows were
already superseded by `document_instances`/`document_instance_sections`).

### Resolution order (effective template at creation)

explicit template chosen in the picker → tenant default template for the type → default global
preset for the type → built-in `reportSubtypeSections()` fallback. Resolution lives in
`resolveEffectiveTemplate(reportType)` and **never throws** — any query failure degrades to the
built-in list, so automation (`documentAutomation.ts`) and the legacy `newSubtype` path in
`DocumentDraftReview` keep working with zero rows seeded.

### Service layer — `src/lib/reportSectionTemplateService.ts`

- `listSectionLibrary()` — active library rows, ordered.
- `listReportTemplateChoices(reportType)` — `{ system: preset[], tenant: template[] }`, both
  active, ordered; used by the picker and the settings page.
- `resolveEffectiveTemplate(reportType)` — `{ source: 'tenant'|'system'|'builtin', id?, name,
  sections }` per the order above.
- `createReportSectionTemplate` / `updateReportSectionTemplate` / `softDeleteReportSectionTemplate`
  / `setDefaultReportSectionTemplate` (clears other defaults of the type first, then sets).
- `normalizeSections(input)` — trims titles, slugifies/dedupes keys, drops empties; applied on
  every write.

Query keys added to `src/lib/queryKeys.ts` (`reportSectionTemplateKeys`, `reportSectionLibraryKeys`,
`reportSectionPresetKeys`).

### Creation flow changes

`createReportInstance` gains optional `sections?: TemplateSectionDescriptor[]`. When present they
seed `document_instance_sections` verbatim (order = `sort_order`); when absent the service resolves
the effective template. The existing hardcoded fallback path stays as the terminal fallback.
No provenance column is added (YAGNI — the seeded rows are the record; `template_version_id` stays
reserved for the PDF-layout studio).

### PDF assembler fix (required for custom sections to print)

`buildReportSections` (reportAdapter) becomes **instance-driven**: iterate the authored visible
rows in their stored order (`ReportData.sections` is already filtered+sorted by
`mapInstanceToReportData`) instead of the hardcoded subtype key list. Per row: canonical metadata
(tone / kind / multilingual title via `ctx.t`) attaches by `canonicalKey(section_key)`; a row whose
authored title differs from the canonical English title keeps the authored title (tenant renamed
it); unknown keys render as neutral prose with the authored title (fallback: humanized key). Empty
prose sections are skipped except the destruction certificate (unchanged). The custody events
TABLE and the device info column remain subtype-driven (unchanged) — `chain_of_custody_notes`
as a section in any template renders as its prose narrative, exactly as forensic does today.
Legacy already-authored drafts render identically (their rows equal the old seed list).

### UI

1. **`NewReportModal`** (`src/components/cases/NewReportModal.tsx`) — inserted between the
   existing type picker Dialog and `DocumentDraftReview` in `CaseDetail`. Choose a template
   (radio cards; System / Custom badges; effective default preselected) → customize the section
   list for THIS document (include-toggle, move up/down, inline rename, remove, add from library,
   add custom) → optional "Save as team template" (name + set-as-default) → Create. On create:
   optionally persists the tenant template, then `createReportInstance({ …, sections })`, then
   opens `DocumentDraftReview` in edit mode (`instanceId`). Uses `Dialog` + existing `ui/`
   primitives + semantic tokens only; keyboard-operable reorder buttons; 44px touch targets.
2. **Settings → Report Sections** (`src/pages/settings/ReportSectionTemplatesPage.tsx`, route
   `/settings/report-sections`, category `report-sections` in the `documents` settings group):
   per report type — system presets (read-only, "Duplicate to customize") and tenant templates
   (edit / rename / set default / deactivate / soft-delete / create from scratch). Editing uses the
   same shared **`ReportSectionComposer`** component (`src/components/settings/reports/`).
   Template management is UI-gated to manager+ (`EDITOR_ROLES` pattern from
   `DocumentTemplatesPage`); RLS enforces staff at the DB.
3. `DocumentDraftReview` unchanged (still content editing; its `newSubtype` create path now seeds
   via the effective default).

### Testing

- `reportSectionTemplateService.test.ts` — resolution order (tenant default → preset default →
  builtin), failure degradation, `normalizeSections`, set-default clears siblings.
- `documentInstanceService.createReport.test.ts` — extended: explicit `sections` seed verbatim;
  absent → resolver consulted; resolver failure → builtin seeds (existing assertions preserved).
- `reportAdapter.sections.test.ts` — instance-driven ordering, renamed-title precedence,
  custom-key neutral rendering, empty-section skip + certificate exception.
- `NewReportModal.test.tsx` — template choices render, default preselected, customize + create
  passes customized sections, save-as-template call.
- Settings page smoke test — lists presets/templates, set-default mutation.

### Migration & discipline

One migration `report_section_templates_and_presets` via `mcp__Supabase__apply_migration`
(tables + RLS + triggers + indexes + seeds, all idempotent `ON CONFLICT DO NOTHING`), then
regenerate `src/types/database.types.ts`, add the manifest row to
`supabase/migrations.manifest.md`, and update CLAUDE.md (System (Global) table rows + a
Version 1.7.0 migration-history entry). No DROPs, no hard deletes, additive only.

## Out of scope

- Structure editing inside an existing draft (drafts keep content-only editing).
- Multiple *layout* templates — `document_templates_pdf` (Studio) is untouched.
- Per-section rich-text schemas / table sections; sections stay prose (matches the engine).
- Portal exposure of templates (none).
