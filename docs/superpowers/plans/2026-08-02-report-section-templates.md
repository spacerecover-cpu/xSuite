# Report Section Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Predefined report-section templates per report type (8 types) that a tenant can choose at report creation and customize — per document and as persistent tenant templates.

**Architecture:** Two global seeded tables (`report_section_library` catalog, `report_section_presets` predefined templates) + one tenant-kit table (`report_section_templates`); a resolver service with a never-throws fallback chain (chosen → tenant default → preset default → built-in list); `createReportInstance` seeds from resolved sections; the PDF assembler becomes instance-driven so custom sections print. UI: a template picker/composer step in the case New Document flow + a Settings management page.

**Tech Stack:** Supabase (Postgres RLS, MCP migrations), TypeScript, React 18, TanStack Query v5, Vitest, existing `ui/` primitives + semantic tokens.

**Spec:** `docs/superpowers/specs/2026-08-02-report-section-templates-design.md`

**Execution notes (autonomous session):** Inline execution. UI tasks specify exact props/state/behavior + skeletal JSX; final JSX is authored at execution under the loaded `frontend-design`/`ui-ux-pro-max` skills and `DESIGN.md` tokens (no hex, no purple/indigo/violet, `Dialog` + `ui/` primitives only). Backend/service/adapter/test code below is verbatim.

---

### Task 1: Migration — tables, RLS, triggers, seeds; types regen; manifest

**Files:**
- Apply via `mcp__Supabase__apply_migration` (project `ssmbegiyjivrcwgcqutu`), name `report_section_templates_and_presets`
- Modify: `supabase/migrations.manifest.md` (add row)
- Regenerate: `src/types/database.types.ts` (via `mcp__Supabase__generate_typescript_types`)

- [ ] **Step 1.1:** Inspect `set_tenant_and_audit_fields` / `set_audit_actor_fields` bodies and `master_case_priorities` grants (`pg_get_functiondef`, `information_schema.role_table_grants`) to mirror grants exactly.
- [ ] **Step 1.2:** Apply the migration below (adjust grants per 1.1 findings).

```sql
-- 1) Global section catalog
create table if not exists report_section_library (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title text not null,
  guidance text,
  tone text not null default 'neutral' check (tone in ('neutral','info','success','warning','danger')),
  kind text not null default 'prose' check (kind in ('prose','custody','destruction_certificate')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table report_section_library enable row level security;
alter table report_section_library force row level security;
create policy "report_section_library_select" on report_section_library for select to authenticated using (true);
create policy "report_section_library_insert" on report_section_library for insert to authenticated with check ((select is_platform_admin()));
create policy "report_section_library_update" on report_section_library for update to authenticated using ((select is_platform_admin())) with check ((select is_platform_admin()));
create policy "report_section_library_delete" on report_section_library for delete to authenticated using ((select is_platform_admin()));

-- 2) Global predefined templates (presets)
create table if not exists report_section_presets (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('evaluation','service','server','malware','forensic','data_destruction','prevention','recovered_files')),
  name text not null,
  description text,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_report_section_presets_default_per_type
  on report_section_presets (report_type) where is_default and is_active;
-- + same 4 policies as library (select true / writes is_platform_admin), enable+force RLS

-- 3) Tenant customized templates — FULL tenant kit (mirrors document_templates_pdf)
create table if not exists report_section_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  report_type text not null check (report_type in ('evaluation','service','server','malware','forensic','data_destruction','prevention','recovered_files')),
  name text not null,
  description text,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  source_preset_id uuid references report_section_presets(id),
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table report_section_templates enable row level security;
alter table report_section_templates force row level security;
create policy "report_section_templates_tenant_isolation" on report_section_templates
  as restrictive for all to authenticated
  using ((tenant_id = (select get_current_tenant_id())) or (select is_platform_admin()));
create policy "report_section_templates_select" on report_section_templates for select to authenticated using (true);
create policy "report_section_templates_insert" on report_section_templates for insert to authenticated with check ((select is_staff_user()));
create policy "report_section_templates_update" on report_section_templates for update to authenticated using ((select is_staff_user())) with check ((select is_staff_user()));
create policy "report_section_templates_delete" on report_section_templates for delete to authenticated using ((select has_role('admin')));
create index if not exists idx_report_section_templates_tenant_id on report_section_templates(tenant_id) where deleted_at is null;
create unique index if not exists uq_report_section_templates_default
  on report_section_templates (tenant_id, report_type) where is_default and deleted_at is null;
create trigger set_report_section_templates_tenant_and_audit before insert on report_section_templates
  for each row execute function set_tenant_and_audit_fields();
create trigger set_report_section_templates_audit_actor before insert or update on report_section_templates
  for each row execute function set_audit_actor_fields();

-- 4) Seed library (35 canonical sections: key/title/guidance/tone/kind/sort per reportAdapter CANONICAL_SECTIONS + SECTION_GUIDANCE), ON CONFLICT (section_key) DO NOTHING.
-- 5) Seed presets: per type, sections built FROM the library rows:
--    insert ... select using unnest(array[keys]) with ordinality joined to report_section_library,
--    jsonb_agg(jsonb_build_object('key',...,'title',...,'guidance',...) order by ord).
--    Standard preset per type (is_default=true) = current reportSubtypeSections() lists;
--    Compact preset (is_default=false, sort_order=1) for evaluation/service/server/malware.
--    data_destruction presets stamp "required": true on the destruction_certificate descriptor.
--    Guard: only insert when no preset row exists for (report_type, name).
```

- [ ] **Step 1.3:** Verify: select counts (library = 35, presets = 12, one default per type = 8), RLS forced on all three, InitPlan guard `scripts/check-rls-initplan.sql` logic satisfied (wrapped helpers only).
- [ ] **Step 1.4:** Regenerate `src/types/database.types.ts`; add manifest row `| <version> | report_section_templates_and_presets | ... |` following the existing table format.
- [ ] **Step 1.5:** Commit `feat(db): report section library, presets and tenant templates`.

### Task 2: Service — `reportSectionTemplateService` (TDD)

**Files:**
- Create: `src/lib/reportSectionTemplateService.ts`
- Create: `src/lib/reportSectionTemplateService.test.ts`
- Modify: `src/lib/queryKeys.ts` (append keys)

- [ ] **Step 2.1: Write failing tests** (mock pattern = `documentInstanceService.createReport.test.ts`: `vi.hoisted` rpc/from/getUser + chain helper):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, auth: { getUser } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./pdf/engine/adapters/reportAdapter', () => ({
  reportSubtypeSections: () => [{ key: 'executive_summary', title: 'Executive Summary', guidance: 'g' }],
}));

import {
  normalizeSections, resolveEffectiveTemplate, setDefaultReportSectionTemplate,
} from './reportSectionTemplateService';

// chain(): thenable builder identical to documentInstanceService.createReport.test.ts
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

describe('normalizeSections', () => {
  it('trims titles, slugifies keys, drops empty titles, dedupes keys', () => {
    const out = normalizeSections([
      { key: '', title: '  My Custom Notes ' },
      { key: 'findings', title: 'Findings' },
      { key: 'findings', title: 'Findings again' },
      { key: 'x', title: '   ' },
    ]);
    expect(out).toEqual([
      { key: 'my_custom_notes', title: 'My Custom Notes' },
      { key: 'findings', title: 'Findings' },
    ]);
  });
});

describe('resolveEffectiveTemplate', () => {
  it('prefers the tenant default over preset default', async () => { /* from() returns tenant row → source tenant */ });
  it('falls back to the default preset when no tenant default', async () => { /* tenant empty, preset row → source system */ });
  it('degrades to builtin when queries fail', async () => {
    from.mockImplementation(() => chain({ data: null, error: new Error('down') }));
    const r = await resolveEffectiveTemplate('evaluation');
    expect(r.source).toBe('builtin');
    expect(r.sections[0].key).toBe('executive_summary');
  });
});

describe('setDefaultReportSectionTemplate', () => {
  it('clears other defaults of the type before setting', async () => { /* assert two update calls: clear eq(report_type) then set eq(id) */ });
});
```

- [ ] **Step 2.2:** Run `npx vitest run src/lib/reportSectionTemplateService.test.ts` → FAIL (module missing).
- [ ] **Step 2.3: Implement** the service:

```ts
export interface TemplateSectionDescriptor { key: string; title: string; guidance?: string; required?: boolean }
export interface ReportTemplateChoice {
  source: 'tenant' | 'system'; id: string; reportType: string; name: string;
  description: string | null; isDefault: boolean; sections: TemplateSectionDescriptor[];
}
export interface EffectiveTemplate { source: 'tenant' | 'system' | 'builtin'; id?: string; name: string; sections: TemplateSectionDescriptor[] }

export function slugifySectionKey(title: string): string        // lowercase, non-alnum → _, trim _, prefix fallback 'custom_section'
export function normalizeSections(input): TemplateSectionDescriptor[]  // parse jsonb-ish rows defensively, trim, slugify empty keys from title, drop empty titles, dedupe by key (first wins)
export async function listSectionLibrary(): Promise<LibrarySection[]>  // active, order sort_order; LibrarySection = { key,title,guidance,tone,kind }
export async function listReportTemplateChoices(reportType): Promise<{ tenant: ReportTemplateChoice[]; system: ReportTemplateChoice[] }>
export async function resolveEffectiveTemplate(reportType): Promise<EffectiveTemplate> // tenant default → preset default → builtin reportSubtypeSections(); every step try/catch → next
export async function createReportSectionTemplate(params: { reportType; name; description?; sections; isDefault?; sourcePresetId? })
export async function updateReportSectionTemplate(id, patch: { name?; description?; sections?; isActive? })
export async function softDeleteReportSectionTemplate(id)       // update deleted_at = now(), is_default = false
export async function setDefaultReportSectionTemplate(id, reportType) // update all of type is_default=false (deleted_at null), then id → true
```

Tenant insert resolves `tenant_id` via the same `profiles` lookup used by `documentInstanceService.resolveTenantId` (typed Insert requires it).

- [ ] **Step 2.4:** Run tests → PASS. Append to `queryKeys.ts`:

```ts
export const reportSectionTemplateKeys = {
  all: ['report-section-templates'] as const,
  choices: (reportType: string) => [...reportSectionTemplateKeys.all, 'choices', reportType] as const,
  manage: () => [...reportSectionTemplateKeys.all, 'manage'] as const,
  library: () => [...reportSectionTemplateKeys.all, 'library'] as const,
};
```

- [ ] **Step 2.5:** Commit `feat(reports): section-template service with effective-template resolution`.

### Task 3: `createReportInstance` accepts explicit sections / resolves default (TDD)

**Files:**
- Modify: `src/lib/documentInstanceService.ts:218-264`
- Modify: `src/lib/documentInstanceService.createReport.test.ts`

- [ ] **Step 3.1:** Add failing tests: (a) explicit `sections` param seeds verbatim (titles + order, `resolveEffectiveTemplate` NOT called); (b) no param → seeds from mocked `resolveEffectiveTemplate` result; (c) resolver returning builtin keeps legacy behavior (existing test updated: mock `./reportSectionTemplateService` with `resolveEffectiveTemplate: async () => ({ source: 'builtin', name: 'Built-in', sections: [...] })`).
- [ ] **Step 3.2:** Implement:

```ts
export interface CreateReportInstanceParams {
  caseId: string; reportSubtype: string; title: string;
  sections?: TemplateSectionDescriptor[];   // from the picker; absent → effective default
}
// inside createReportInstance:
const seeds = params.sections?.length
  ? params.sections
  : (await resolveEffectiveTemplate(params.reportSubtype)).sections;
// rows map unchanged (section_key: s.key, title: s.title, sort_order: i)
```

Import `resolveEffectiveTemplate` statically; it never throws. Remove the direct `reportSubtypeSections` import (now inside the resolver).

- [ ] **Step 3.3:** Run the file's tests → PASS. Commit `feat(reports): report creation seeds sections from the effective template`.

### Task 4: PDF — instance-driven `buildReportSections` (TDD)

**Files:**
- Modify: `src/lib/pdf/engine/adapters/reportAdapter.ts:619-658`
- Create: `src/lib/pdf/engine/adapters/reportAdapter.sections.test.ts`

- [ ] **Step 4.1:** Failing tests via exported `toEngineData` (minimal `ReportData` fixture, ctx = `{ t: (_k, en) => en, ... }` matching `TranslationContext` usage):
  - authored order preserved (rows in custom order render in that order, not subtype order);
  - a custom key (`my_custom_notes`, title "Warranty Notes") renders with its authored title, no tone;
  - a renamed canonical section (key `findings`, title "Lab Findings") keeps the authored title; an unrenamed one (title equals canonical EN or empty) gets the `ctx.t` title;
  - empty-content prose skipped; `destruction_certificate` kept when empty;
  - alias key (`diagnostic_findings`) still gets the danger tone.
- [ ] **Step 4.2:** Implement — replace the `proseKeys` loop:

```ts
function buildReportSections(data: ReportData, ctx: TranslationContext): ReportSectionsBlock {
  const sections: ReportSectionsBlock['sections'] = [];
  let order = 0;
  for (const s of data.sections) {
    const key = canonicalKey(s.section_key);
    const canonical = CANONICAL_SECTIONS[key];
    const content = stripHtmlTags(s.section_content);
    const isCert = canonical?.kind === 'destruction_certificate';
    if (!content && !isCert) continue;
    const authoredTitle = (s.section_title || '').trim();
    const renamed = authoredTitle && (!canonical || authoredTitle !== canonical.en);
    const title = renamed
      ? lt(authoredTitle)
      : canonical
        ? lt(ctx.t(canonical.tkey, canonical.en))
        : lt(humanize(key));
    sections.push({ title, content, order: order++,
      ...(canonical?.tone && canonical.tone !== 'neutral' ? { tone: canonical.tone } : (canonical?.tone === 'neutral' ? { tone: 'neutral' as const } : {})),
      ...(isCert ? { kind: 'destruction_certificate' as const } : {}) });
  }
  return { sections };
}
```

(Keep tone emission semantics identical to today: canonical sections emit their tone incl. neutral; unknown keys emit none.)

- [ ] **Step 4.3:** Run new tests + existing adapter/preview tests → PASS. Commit `fix(pdf): report sections render instance-driven so customized sections print`.

### Task 5: `NewReportModal` + CaseDetail wiring

**Files:**
- Create: `src/components/cases/NewReportModal.tsx`
- Create: `src/components/cases/NewReportModal.test.tsx`
- Create: `src/components/settings/reports/ReportSectionComposer.tsx` (shared)
- Modify: `src/pages/cases/CaseDetail.tsx:1510-1561`

**Contract:**

```ts
// ReportSectionComposer — controlled list editor (no data fetching)
interface ComposerSection extends TemplateSectionDescriptor { included: boolean }
interface ReportSectionComposerProps {
  sections: ComposerSection[];
  onChange: (next: ComposerSection[]) => void;
  library: LibrarySection[];      // for “Add section” picker (already-used keys filtered out)
  disabled?: boolean;
}
// Behaviors: toggle included (required sections locked on), move up/down (buttons, aria-labels),
// inline title rename, remove custom rows, add-from-library, add-custom (title → slug key).

// NewReportModal
interface NewReportModalProps {
  isOpen: boolean; onClose: () => void; caseId: string; reportSubtype: ReportType;
  onCreated: (instanceId: string) => void;
}
// Data: useQuery(reportSectionTemplateKeys.choices(subtype), listReportTemplateChoices) +
//       useQuery(reportSectionTemplateKeys.library(), listSectionLibrary)
// State: selectedRef ('tenant:<id>' | 'system:<id>' | 'builtin'), composer sections (re-seeded on
//        selection change), saveAsTemplate + templateName + makeDefault.
// Create: [optional createReportSectionTemplate] → createReportInstance({ caseId, reportSubtype,
//         title: REPORT_TYPES[subtype].name, sections: included }) → onCreated(id) → close.
// Layout: Dialog max-w-3xl; template radio cards (System/Custom Badge, default preselected);
//         right column composer; footer Cancel/secondary + Create/primary size sm.
```

- [ ] **Step 5.1:** Component test (mock service module): renders choices, default preselected, toggling a section then Create → `createReportInstance` called with only included sections in order; save-as-template checked → `createReportSectionTemplate` called first.
- [ ] **Step 5.2:** Implement composer + modal (tokens only; no raw hex; keyboard-operable).
- [ ] **Step 5.3:** CaseDetail: type-picker `onClick` now `modals.setDocCreateSubtype(key)` (unchanged) BUT `DocumentDraftReview` no longer receives `newSubtype`; instead render `<NewReportModal isOpen={!!modals.docCreateSubtype} …` whose `onCreated` sets `modals.setEditingDocumentId(id)` + clears subtype (DraftReview opens in edit mode). DraftReview keeps its `newSubtype` prop for back-compat/tests.
- [ ] **Step 5.4:** Run tests; commit `feat(cases): choose & customize report template when creating a document`.

### Task 6: Settings → Report Sections page

**Files:**
- Create: `src/pages/settings/ReportSectionTemplatesPage.tsx`
- Create: `src/pages/settings/ReportSectionTemplatesPage.test.tsx`
- Create: `src/components/settings/reports/ReportTemplateEditorModal.tsx`
- Modify: `src/config/settingsCategories.ts` (category `report-sections`, group `documents`)
- Modify: `src/pages/settings/SettingsDashboard.tsx` (navigate branch)
- Modify: `src/App.tsx` (route `report-sections` beside `documents`/`labels`)

**Contract:** per-type sections (8 groups, `REPORT_TYPES` order): system presets (read-only rows,
sections count, Default badge, “Duplicate to customize”) + tenant templates (Edit, Set default,
Deactivate, Delete soft, Default badge) + “New template” (from preset or blank) → `ReportTemplateEditorModal`
(name, description, `ReportSectionComposer`, set-as-default checkbox; create/update via service;
invalidate `reportSectionTemplateKeys`). UI-gate mutations to `EDITOR_ROLES = ['owner','admin','manager']`
(viewer/technician read-only), mirroring `DocumentTemplatesPage`. `SettingsPageHeader` + Card grid.

- [ ] **Step 6.1:** Smoke test: lists a preset + tenant template per mocked service; “Set default” calls `setDefaultReportSectionTemplate`.
- [ ] **Step 6.2:** Implement page + editor modal + registration (category card icon `ClipboardList`, accent reuse from the documents group).
- [ ] **Step 6.3:** Run tests; commit `feat(settings): report section template management page`.

### Task 7: Docs — CLAUDE.md truth + spec status

**Files:**
- Modify: `CLAUDE.md` (System (Global) row: `report_section_library`, `report_section_presets`, remove `report_template_section_mappings`; Cases row: `case_reports`/`case_report_sections` → `document_instances`/`document_instance_sections` note; Master Data: drop `master_case_report_templates`; add **Version 1.7.0** history entry)
- Modify: `docs/superpowers/specs/2026-08-02-report-section-templates-design.md` (status → Implemented)

- [ ] **Step 7.1:** Edit + commit `docs: align CLAUDE.md report tables with implemented section-template system`.

### Task 8: Verification & push

- [ ] **Step 8.1:** `npm run typecheck` → 0 errors; `npm run lint` → clean; `npx vitest run src/lib src/components/cases src/pages/settings --silent` (at minimum the touched test files) → PASS.
- [ ] **Step 8.2:** `scripts/check-tenant-table-requirements.sql` expectations hold for `report_section_templates` (verified via SQL in Task 1.3).
- [ ] **Step 8.3:** `git push -u origin claude/report-template-sections-ztkbmr` (retry ×4 exponential backoff on network failure).

## Self-review

- Spec coverage: tables/seeds (T1), resolver+CRUD (T2), creation seeding (T3), PDF fix (T4), picker+composer (T5), settings management (T6), docs (T7), verification (T8). ✓
- No placeholders in executable steps; UI tasks carry exact contracts per the header's execution note. ✓
- Type consistency: `TemplateSectionDescriptor` defined in T2, consumed in T3/T5; `LibrarySection` from T2 used by composer. ✓
