# Document Studio — Phase 8 (Run-time Consolidation) + Phase 4 (Server-Enforced Lifecycle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the case-side **Documents** tab — the run-time face of Document Studio — so an engineer can create an auto-populated report draft, preview the real PDF, and move it through a **server-enforced** lifecycle (submit → approve → send) backed by the typed `document_instances` record, all behind `VITE_DOC_STUDIO`.

**Architecture:** The schema, RPCs, and provability service (Phases 2–3) already exist but are consumed by nothing. This phase builds the consumer. The render path is reused verbatim: the existing engine entry (`reportConfigForSubtype` → `toEngineData` → `renderTemplate`) consumes a `ReportData` value, so we only add a *sibling source* — `fetchDocumentInstanceData(instanceId)` returning the same `ReportData` shape — plus a thin blob method. Phase 4 is folded in: the new UI drives **only** the server-gated RPC transitions (`transition_document_instance`, `set_document_instance_artifact`), never a raw status flip. The legacy `case_reports` flow is left fully intact and is the default when the flag is off.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query v5, Supabase (Postgres + SECURITY DEFINER RPCs + Storage), pdfmake engine (`renderTemplate`), Vitest (node + jsdom projects) + @testing-library/react, Tailwind semantic tokens.

## Global Constraints

- **Flag-gated, default-off:** every new run-time surface is reachable ONLY when `isDocStudioEnabled()` (`src/lib/featureFlags.ts`, reads `VITE_DOC_STUDIO === 'true'`). Flag off ⇒ app behaves exactly as today; legacy `CaseReportsTab` / `ReportViewModal` / `StreamlinedReportEditor` / `case_reports` remain the default path.
- **Never weaken the lifecycle:** privileged transitions go ONLY through `documentInstanceService.transitionDocument()` (→ `transition_document_instance` RPC) and `attachArtifact()` (→ `set_document_instance_artifact` RPC). Never `UPDATE document_instances` directly from the client for status/approval/delivery/artifact columns — the DB guard trigger blocks it anyway.
- **Second-person approval is server-enforced:** the RPC raises if the approver equals `created_by`/`generated_by`. The UI must SURFACE that rejection (toast), and proactively disable the Approve action for the document's author — but must never try to bypass it.
- **Send gate:** a `delivered` transition fails unless `pdf_storage_path` + `pdf_sha256` are set. Always `attachArtifact` (archive-then-mark) BEFORE attempting `transitionDocument(..., 'delivered')`.
- **No legacy retirement here:** do NOT touch `reportsService.approveReport` / `sendReportToCustomer` / `persistReportPDF` legacy methods or any `case_reports` table writes. Retirement is Phase 11.
- **Tokens only:** no raw hex, no `purple/indigo/violet`. Use the 14 semantic tokens (`bg-primary`, `text-slate-*` for neutrals, `success/warning/danger/info`). `check:tokens` must stay clean. (Task 8 retokenizes `reportTypes.ts`.)
- **Types:** import `Database` from `src/types/database.types.ts` only; use `maybeSingle()` not `single()`; services return typed data.
- **Gates per task:** `npm run typecheck` = 0 and the task's vitest file green before commit. `npx vitest run` (full) green before the final commit.
- **Domain:** this is a data-recovery LAB platform. A "report" is a custody-tracked deliverable; recoverability is shown as a CATEGORY label (never a %). Do not reintroduce CRM-style assumptions.
- **Test projects:** `*.test.ts` → node project (no jsdom); `*.test.tsx` → dom project (jsdom on, `src/test/setup.ts` auto-loaded). Mock `supabaseClient` per the patterns in each task.

---

## File Structure

**Create:**
- `src/lib/documentInstanceData.ts` — pure mapper `mapInstanceToReportData(...)` from instance + section rows + case context → the existing `ReportData` shape. No Supabase import (unit-testable in isolation).
- `src/lib/documentInstanceData.test.ts` — mapper tests (node).
- `src/components/cases/detail/CaseDocumentsTab.tsx` — presentational list of `document_instances` for a case (mirrors `CaseReportsTab`).
- `src/components/cases/detail/CaseDocumentsTab.test.tsx` — list rendering tests (dom).
- `src/components/cases/DocumentDraftReview.tsx` — create/edit a draft: editable sections + provenance + Preview + lifecycle buttons (refactor target of `StreamlinedReportEditor`, but a NEW file driving instances).
- `src/components/cases/DocumentDraftReview.test.tsx` — lifecycle/button tests (dom).
- `src/components/cases/DocumentViewerModal.tsx` — read-only viewer: signed-URL PDF iframe + `AuditInfo` + status (refactor target of `ReportViewModal`).
- `src/components/cases/DocumentViewerModal.test.tsx` — viewer tests (dom).

**Modify:**
- `src/lib/reportPDFService.ts` — add public `generateDocumentInstanceAsBlob(instanceId)` reusing `buildReportDocViaEngine`; the existing `buildReportDocViaEngine`/`generateReportAsBlob` are unchanged.
- `src/lib/documentInstanceService.ts` — add `createReportInstance(...)`, `seedReportSections(...)`, `listReportSubtypeSections(...)` re-export, and `archiveDocumentInstance(...)` (render → attachArtifact).
- `src/lib/pdf/engine/adapters/reportAdapter.ts` — add `export function reportSubtypeSections(subtype: string): Array<{ key: string; title: string }>` (exposes the existing internal `SUBTYPE_SECTIONS`/`CANONICAL_SECTIONS` for seeding).
- `src/pages/cases/CaseDetail.tsx` — mount `CaseDocumentsTab` + the new modals, flag-gated on `isDocStudioEnabled()`.
- `src/components/cases/detail/useCaseQueries.ts` — add a `documentInstances` query keyed by `documentInstanceKeys.byCase(id)`.
- `src/components/cases/detail/useCaseModals.ts` — add document-tab modal state (selected subtype, editing instance id, viewing instance id).
- `src/lib/reportTypes.ts` — retokenize `REPORT_TYPES[*].color/badgeColor` + `REPORT_STATUS_CONFIG` to semantic tokens (Task 8).
- `src/lib/portalVisibility.ts` — add `show_documents` flag (Task 9; prep for Phase 9).

---

## Task 1: Instance → ReportData mapper + blob render source

**Files:**
- Create: `src/lib/documentInstanceData.ts`
- Test: `src/lib/documentInstanceData.test.ts`
- Modify: `src/lib/reportPDFService.ts`

**Interfaces:**
- Consumes: `ReportData` (from `src/lib/pdf/documents/ReportDocument.ts`), `DocumentInstanceRow`/`DocumentInstanceSectionRow` (from `database.types.ts`), `reportPDFService` (existing singleton), `buildReportDocViaEngine` (existing private method).
- Produces:
  - `mapInstanceToReportData(instance: InstanceLike, sections: SectionLike[], ctx: InstanceReportContext): ReportData`
  - `reportPDFService.generateDocumentInstanceAsBlob(instanceId: string): Promise<PDFBlobResult>`

The mapper is the only NEW data logic; it converts the typed instance + sections (+ a case/device/customer/company context the caller fetches) into the exact `ReportData` the adapter already consumes. Keep it pure (no Supabase) so it is unit-tested in the node project.

- [ ] **Step 1: Write the failing mapper test**

Create `src/lib/documentInstanceData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapInstanceToReportData } from './documentInstanceData';

describe('mapInstanceToReportData', () => {
  const ctx = {
    caseData: { case_number: 'C-0001', customer_name: 'Jane', created_at: '2026-06-01T00:00:00Z' },
    customerData: { customer_name: 'Jane', email: 'jane@x.com' },
    deviceData: { device_type: 'HDD', brand: 'WD', serial_number: 'SN1' },
    diagnosticsData: undefined,
    chainOfCustodyEvents: undefined,
    companySettings: { basic_info: { company_name: 'Lab LLC' } },
    recoverability: 'Recoverable',
    preparedByName: 'Tech A',
  };

  it('maps instance + sections into the ReportData shape the engine consumes', () => {
    const instance = {
      id: 'di-1',
      case_id: 'case-1',
      document_number: 'REP-EVAL-0007',
      report_subtype: 'evaluation',
      title: 'Evaluation Report',
      status: 'draft',
      version_number: 1,
      created_at: '2026-06-02T00:00:00Z',
      created_by: 'u1',
    };
    const sections = [
      { section_key: 'findings', title: 'Findings', content: '<p>OK</p>', sort_order: 2, is_visible: true },
      { section_key: 'executive_summary', title: 'Summary', content: '<p>Hi</p>', sort_order: 1, is_visible: true },
    ];

    const rd = mapInstanceToReportData(instance, sections, ctx);

    expect(rd.report.report_number).toBe('REP-EVAL-0007');
    expect(rd.report.report_type).toBe('evaluation');
    expect(rd.report.title).toBe('Evaluation Report');
    // sections are sorted by sort_order and only visible ones kept
    expect(rd.sections.map((s) => s.section_key)).toEqual(['executive_summary', 'findings']);
    expect(rd.recoverability).toBe('Recoverable');
    expect(rd.companySettings.basic_info?.company_name).toBe('Lab LLC');
  });

  it('drops hidden sections', () => {
    const instance = { id: 'di-2', case_id: 'c', document_number: 'R-1', report_subtype: 'service', title: 'T', status: 'draft', version_number: 1, created_at: '2026-06-02T00:00:00Z', created_by: 'u1' };
    const sections = [
      { section_key: 'a', title: 'A', content: 'x', sort_order: 1, is_visible: true },
      { section_key: 'b', title: 'B', content: 'y', sort_order: 2, is_visible: false },
    ];
    const rd = mapInstanceToReportData(instance, sections, { companySettings: {} });
    expect(rd.sections.map((s) => s.section_key)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/documentInstanceData.test.ts`
Expected: FAIL — `mapInstanceToReportData` is not exported / module not found.

- [ ] **Step 3: Implement the mapper**

Create `src/lib/documentInstanceData.ts`:

```ts
/**
 * Pure mapper: a typed document_instance (+ its sections + a case/device/customer
 * context the caller fetched) → the ReportData shape the report engine already
 * consumes. No Supabase import — the forensic-relevant shaping stays unit-testable.
 * The render path (reportConfigForSubtype → toEngineData → renderTemplate) is reused
 * unchanged; only the SOURCE differs from the legacy case_reports flow.
 */
import type { ReportData } from './pdf/documents/ReportDocument';

export interface InstanceLike {
  id: string;
  case_id: string | null;
  document_number: string | null;
  report_subtype: string | null;
  title: string;
  status: string;
  version_number: number;
  created_at: string;
  created_by: string | null;
}

export interface SectionLike {
  section_key: string;
  title: string | null;
  content: string | null;
  sort_order: number;
  is_visible: boolean;
}

/** Everything the engine needs that does NOT live on the instance row itself. */
export interface InstanceReportContext {
  caseData?: ReportData['caseData'];
  customerData?: ReportData['customerData'];
  deviceData?: ReportData['deviceData'];
  diagnosticsData?: ReportData['diagnosticsData'];
  chainOfCustodyEvents?: ReportData['chainOfCustodyEvents'];
  companySettings: ReportData['companySettings'];
  recoverability?: string | null;
  preparedByName?: string;
}

export function mapInstanceToReportData(
  instance: InstanceLike,
  sections: SectionLike[],
  ctx: InstanceReportContext,
): ReportData {
  const visibleSorted = sections
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    report: {
      id: instance.id,
      case_id: instance.case_id ?? '',
      report_number: instance.document_number ?? '',
      report_type: instance.report_subtype ?? 'evaluation',
      title: instance.title,
      status: instance.status,
      version_number: instance.version_number,
      created_at: instance.created_at,
      created_by: instance.created_by ?? undefined,
    },
    sections: visibleSorted.map((s, i) => ({
      id: `${instance.id}-${s.section_key}`,
      section_key: s.section_key,
      section_title: s.title ?? '',
      section_content: s.content ?? '',
      section_order: i,
    })),
    caseData: ctx.caseData,
    customerData: ctx.customerData,
    deviceData: ctx.deviceData,
    diagnosticsData: ctx.diagnosticsData,
    chainOfCustodyEvents: ctx.chainOfCustodyEvents,
    companySettings: ctx.companySettings,
    recoverability: ctx.recoverability ?? null,
    preparedByName: ctx.preparedByName,
  };
}
```

- [ ] **Step 4: Run the mapper test to confirm it passes**

Run: `npx vitest run src/lib/documentInstanceData.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Add `generateDocumentInstanceAsBlob` to reportPDFService**

In `src/lib/reportPDFService.ts`, add a public method on the `ReportPDFService` class that mirrors `generateReportAsBlob` but sources from the instance. It fetches the instance + sections + case context, builds `ReportData` via the mapper, and reuses the existing private `buildReportDocViaEngine`. Add near `generateReportAsBlob`:

```ts
  /**
   * Document Studio: render a document_instance to a PDF Blob, reusing the SAME
   * engine path as reports (buildReportDocViaEngine). Only the data source differs.
   */
  async generateDocumentInstanceAsBlob(instanceId: string): Promise<PDFBlobResult> {
    try {
      const { fetchInstanceReportData } = await import('./documentInstanceData.fetch');
      const data = await withTimeout(fetchInstanceReportData(instanceId), 10000, 'Failed to fetch document data');

      const languageSettings = data.companySettings.localization?.document_language_settings;
      const languageCode = (languageSettings?.secondary_language as LanguageCode) || null;
      await withTimeout(initializePDFFonts(languageCode), 15000, 'Font initialization timeout');
      const ctx = createTranslationContext(languageSettings?.mode || 'english_only', languageCode);

      const [logoBase64, qrCodeBase64] = await Promise.all([
        data.companySettings.branding?.logo_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.logo_url), 5000, 'Logo timeout')
          : Promise.resolve(null),
        data.companySettings.branding?.qr_code_general_url
          ? withTimeout(loadImageAsBase64(data.companySettings.branding.qr_code_general_url), 5000, 'QR timeout')
          : Promise.resolve(null),
      ]);

      const docDefinition = await this.buildReportDocViaEngine(data, ctx, logoBase64, qrCodeBase64);
      const filename = `Document_${data.report.report_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;

      const blob = await withTimeout(
        new Promise<Blob>((resolve, reject) => {
          createPdfWithFonts(docDefinition).getBlob((b: Blob) => resolve(b), undefined, (err: unknown) => reject(err));
        }),
        PDF_GENERATION_TIMEOUT,
        'PDF blob generation timeout',
      );
      return { success: true, blob, blobUrl: URL.createObjectURL(blob), filename };
    } catch (error) {
      logger.error('[Report PDF Service] generateDocumentInstanceAsBlob failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
```

Create the data-fetch helper `src/lib/documentInstanceData.fetch.ts` (Supabase-bound, so kept out of the pure mapper module):

```ts
/** Supabase-bound fetch that assembles ReportData for a document_instance. */
import { supabase } from './supabaseClient';
import type { ReportData } from './pdf/documents/ReportDocument';
import { mapInstanceToReportData } from './documentInstanceData';
import { getDocumentInstance, getDocumentInstanceSections } from './documentInstanceService';
import { companySettingsService } from './companySettingsService';

export async function fetchInstanceReportData(instanceId: string): Promise<ReportData> {
  const instance = await getDocumentInstance(instanceId);
  if (!instance) throw new Error('Document instance not found');
  const sections = await getDocumentInstanceSections(instanceId);

  // Case / customer / device context by the instance's case_id (same FK path the
  // legacy fetchReportData uses).
  const caseCtx = instance.case_id ? await fetchCaseContext(instance.case_id) : {};
  const companySettings = await companySettingsService.getResolvedSettings();

  return mapInstanceToReportData(
    instance,
    sections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      content: s.content,
      sort_order: s.sort_order,
      is_visible: s.is_visible,
    })),
    { ...caseCtx, companySettings },
  );
}

/** Minimal case/customer/device/recoverability lookup for the report context. */
async function fetchCaseContext(caseId: string): Promise<Partial<ReportData>> {
  const { data: c } = await supabase
    .from('cases')
    .select('case_number, created_at, priority, client_reference, customer_id')
    .eq('id', caseId)
    .maybeSingle();
  const { data: cust } = c?.customer_id
    ? await supabase
        .from('customers_enhanced')
        .select('customer_name, email, mobile_number, company_name')
        .eq('id', c.customer_id)
        .maybeSingle()
    : { data: null };
  const { data: devices } = await supabase
    .from('case_devices')
    .select('device_type:catalog_device_types(name), brand:catalog_device_brands(name), model, serial_number, recovery_result')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  const dev = devices?.[0];
  return {
    caseData: c
      ? { case_number: c.case_number ?? '', customer_name: cust?.customer_name ?? '', customer_email: cust?.email ?? undefined, created_at: c.created_at, priority: c.priority ?? undefined, client_reference: c.client_reference ?? undefined }
      : undefined,
    customerData: cust ? { customer_name: cust.customer_name ?? '', email: cust.email ?? undefined, mobile_number: cust.mobile_number ?? undefined, company_name: cust.company_name ?? undefined } : undefined,
    deviceData: dev ? { device_type: dev.device_type?.name ?? undefined, brand: dev.brand?.name ?? undefined, model: dev.model ?? undefined, serial_number: dev.serial_number ?? undefined } : undefined,
    recoverability: dev?.recovery_result ?? null,
  };
}
```

> Note for the implementer: confirm the exact `companySettingsService` accessor name (`getResolvedSettings` here is the resolved tenant settings used by the legacy `fetchReportData`; if the real name differs, match the legacy call site in `reportPDFService.fetchReportData`). Confirm the `cases.customer_id` column and the device embed alias names against `database.types.ts` before relying on them; adjust to the verified column names. These are reads only — wrong names fail typecheck, not silently.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (Fix any column/embed name mismatches flagged here against `database.types.ts`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/documentInstanceData.ts src/lib/documentInstanceData.test.ts src/lib/documentInstanceData.fetch.ts src/lib/reportPDFService.ts
git commit -m "feat(documents): render a document_instance to PDF via the report engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Subtype section descriptors (reportAdapter) + section seeding

**Files:**
- Modify: `src/lib/pdf/engine/adapters/reportAdapter.ts`
- Test: `src/lib/pdf/engine/adapters/reportAdapter.subtypeSections.test.ts` (create)

**Interfaces:**
- Produces: `reportSubtypeSections(subtype: string): Array<{ key: string; title: string }>` — the ordered canonical prose sections for a report subtype, derived from the existing internal `SUBTYPE_SECTIONS` (line ~164-173) + `CANONICAL_SECTIONS` (line ~111-122). Used by Task 3 to seed `document_instance_sections`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/adapters/reportAdapter.subtypeSections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reportSubtypeSections } from './reportAdapter';

describe('reportSubtypeSections', () => {
  it('returns ordered sections for evaluation with stable keys + titles', () => {
    const s = reportSubtypeSections('evaluation');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => typeof x.key === 'string' && typeof x.title === 'string')).toBe(true);
    // executive summary leads the evaluation report
    expect(s[0].key).toContain('summary');
  });

  it('data_destruction includes the destruction certificate section', () => {
    const keys = reportSubtypeSections('data_destruction').map((x) => x.key);
    expect(keys.some((k) => k.includes('destruction'))).toBe(true);
  });

  it('falls back to the evaluation set for an unknown subtype', () => {
    expect(reportSubtypeSections('nope')).toEqual(reportSubtypeSections('evaluation'));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/pdf/engine/adapters/reportAdapter.subtypeSections.test.ts`
Expected: FAIL — `reportSubtypeSections` not exported.

- [ ] **Step 3: Export the helper**

In `src/lib/pdf/engine/adapters/reportAdapter.ts`, add an exported function that reuses the existing `SUBTYPE_SECTIONS` (subtype → ordered keys) and `CANONICAL_SECTIONS` (key → descriptor incl. English title). Implement immediately after the `SUBTYPE_SECTIONS` definition:

```ts
/**
 * The ordered canonical prose-section descriptors for a report subtype — the seed
 * list the Documents tab uses to create document_instance_sections. Mirrors the
 * sections the adapter renders, so a freshly-seeded draft matches the PDF layout.
 */
export function reportSubtypeSections(subtype: string): Array<{ key: string; title: string }> {
  const keys = SUBTYPE_SECTIONS[subtype] ?? SUBTYPE_SECTIONS.evaluation;
  return keys.map((key) => ({ key, title: CANONICAL_SECTIONS[key]?.titleEn ?? key }));
}
```

> Note for the implementer: read the actual shape of `CANONICAL_SECTIONS` at line ~111-122 — the English title field may be named `titleEn`, `title`, or `label`. Use the real field name. If `SUBTYPE_SECTIONS` values are objects rather than bare keys, map accordingly. The test above pins behavior, not the internal field name.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/pdf/engine/adapters/reportAdapter.subtypeSections.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the report parity suite (no regression)**

Run: `npx vitest run src/lib/pdf`
Expected: PASS (the export is additive; rendering unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/engine/adapters/reportAdapter.ts src/lib/pdf/engine/adapters/reportAdapter.subtypeSections.test.ts
git commit -m "feat(documents): expose per-subtype report section descriptors for seeding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `createReportInstance` + `archiveDocumentInstance` (service layer, Phase-3 + Phase-4 plumbing)

**Files:**
- Modify: `src/lib/documentInstanceService.ts`
- Test: `src/lib/documentInstanceService.createReport.test.ts` (create)

**Interfaces:**
- Consumes: `createDocumentInstance` (existing), `attachArtifact` (existing), `reportSubtypeSections` (Task 2), `reportPDFService.generateDocumentInstanceAsBlob` (Task 1), `get_next_number` RPC.
- Produces:
  - `createReportInstance(params: { caseId: string; reportSubtype: string; title: string }): Promise<DocumentInstanceRow>`
  - `archiveDocumentInstance(instanceId: string, docType?: DocumentInstanceType): Promise<{ path: string; sha256: string }>`

`createReportInstance` mints a `report_<subtype>` number, creates the draft instance, and seeds `document_instance_sections` from `reportSubtypeSections`. `archiveDocumentInstance` renders the blob and calls `attachArtifact` (the snapshot write that gates deliver).

- [ ] **Step 1: Write the failing service test**

Create `src/lib/documentInstanceService.createReport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { rpc, from, auth: { getUser }, storage: { from: vi.fn() } },
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./pdf/engine/adapters/reportAdapter', () => ({
  reportSubtypeSections: () => [
    { key: 'executive_summary', title: 'Summary' },
    { key: 'findings', title: 'Findings' },
  ],
}));

import { createReportInstance } from './documentInstanceService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['insert', 'select', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('createReportInstance', () => {
  it('mints a report number, creates a draft, and seeds the subtype sections', async () => {
    rpc.mockResolvedValue({ data: 'REP-EVAL-0007', error: null });

    const sectionInserts: unknown[] = [];
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      if (table === 'document_instances') return chain({ data: { id: 'di-1', case_id: 'c1', report_subtype: 'evaluation' }, error: null });
      if (table === 'document_instance_sections') {
        const c = chain({ data: [], error: null });
        c.insert = vi.fn((payload: unknown) => { sectionInserts.push(payload); return c; });
        return c;
      }
      return chain({ data: null, error: null });
    });

    const inst = await createReportInstance({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Evaluation Report' });

    expect(inst.id).toBe('di-1');
    expect(rpc).toHaveBeenCalledWith('get_next_number', expect.objectContaining({ p_scope: expect.stringContaining('report') }));
    // two seeded sections, ordered, carrying tenant + instance id
    expect(Array.isArray(sectionInserts[0])).toBe(true);
    const rows = sectionInserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ document_instance_id: 'di-1', section_key: 'executive_summary', sort_order: 0, tenant_id: 't1' });
    expect(rows[1]).toMatchObject({ section_key: 'findings', sort_order: 1 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/documentInstanceService.createReport.test.ts`
Expected: FAIL — `createReportInstance` not exported.

- [ ] **Step 3: Implement `createReportInstance` + `archiveDocumentInstance`**

In `src/lib/documentInstanceService.ts`, add (after `createDocumentInstance`):

```ts
import { reportSubtypeSections } from './pdf/engine/adapters/reportAdapter';

export interface CreateReportInstanceParams {
  caseId: string;
  reportSubtype: string;
  title: string;
}

/**
 * Create a draft report document_instance and seed its sections from the subtype's
 * canonical section list (so the engineer opens a structured, near-complete draft).
 * Number scope mirrors the legacy report numbering: `report_<subtype>`.
 */
export async function createReportInstance(params: CreateReportInstanceParams): Promise<DocumentInstanceRow> {
  const tenantId = await resolveTenantId();
  const scope = `report_${params.reportSubtype}`;
  const { data: number, error: numErr } = await supabase.rpc('get_next_number', { p_scope: scope });
  if (numErr) {
    logger.error('[documentInstanceService] number mint failed:', numErr);
    throw numErr;
  }

  const instance = await createDocumentInstance({
    docType: 'report',
    title: params.title,
    reportSubtype: params.reportSubtype,
    caseId: params.caseId,
    documentNumber: (number as string) ?? null,
  });

  const seeds = reportSubtypeSections(params.reportSubtype);
  if (seeds.length > 0) {
    const rows = seeds.map((s, i) => ({
      tenant_id: tenantId,
      document_instance_id: instance.id,
      section_key: s.key,
      title: s.title,
      content: '',
      sort_order: i,
      is_visible: true,
    }));
    const { error: secErr } = await supabase.from('document_instance_sections').insert(rows);
    if (secErr) {
      logger.error('[documentInstanceService] section seed failed:', secErr);
      throw secErr;
    }
  }
  return instance;
}

/** Render + archive (sha256) the instance's PDF; required before a deliver transition. */
export async function archiveDocumentInstance(
  instanceId: string,
  docType: DocumentInstanceType = 'report',
): Promise<{ path: string; sha256: string }> {
  const { reportPDFService } = await import('./reportPDFService');
  const result = await reportPDFService.generateDocumentInstanceAsBlob(instanceId);
  if (!result.success || !result.blob) {
    throw new Error(result.error || 'Failed to render document PDF');
  }
  return attachArtifact(instanceId, docType, result.blob);
}
```

> Note: `'report'` must be a valid `document_instance_type` enum value — verify against `database.types.ts` (`Database['public']['Enums']['document_instance_type']`). If the enum uses a different literal for reports, use it. The `get_next_number` arg name is `p_scope` per `caseService` usage; confirm the report scope string the legacy `generateReportNumber` uses and match it to avoid a parallel sequence.

- [ ] **Step 4: Run the service test to confirm it passes**

Run: `npx vitest run src/lib/documentInstanceService.createReport.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documentInstanceService.ts src/lib/documentInstanceService.createReport.test.ts
git commit -m "feat(documents): createReportInstance (seed sections) + archiveDocumentInstance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `CaseDocumentsTab` (presentational list)

**Files:**
- Create: `src/components/cases/detail/CaseDocumentsTab.tsx`
- Test: `src/components/cases/detail/CaseDocumentsTab.test.tsx`

**Interfaces:**
- Produces: `CaseDocumentsTab` React component.
- Consumes: `DocumentInstanceStatus` (from `documentInstanceService`), `formatDate` (from `format`), semantic-token classes.

```ts
interface DocumentRow {
  id: string;
  title: string;
  document_number: string | null;
  report_subtype: string | null;
  status: DocumentInstanceStatus;
  version_number: number;
  visible_to_customer: boolean | null;
  created_at: string;
}
interface CaseDocumentsTabProps {
  documents: DocumentRow[];
  onNewDocument: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}
```

- [ ] **Step 1: Write the failing component test**

Create `src/components/cases/detail/CaseDocumentsTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseDocumentsTab } from './CaseDocumentsTab';

const docs = [
  { id: 'd1', title: 'Evaluation Report', document_number: 'REP-EVAL-0007', report_subtype: 'evaluation', status: 'draft' as const, version_number: 1, visible_to_customer: false, created_at: '2026-06-02T00:00:00Z' },
  { id: 'd2', title: 'Service Report', document_number: 'REP-SVC-0003', report_subtype: 'service', status: 'delivered' as const, version_number: 2, visible_to_customer: true, created_at: '2026-06-03T00:00:00Z' },
];

it('lists documents with number, title and a status badge', () => {
  render(<CaseDocumentsTab documents={docs} onNewDocument={vi.fn()} onView={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText('Evaluation Report')).toBeInTheDocument();
  expect(screen.getByText('REP-EVAL-0007')).toBeInTheDocument();
  expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  expect(screen.getByText(/Delivered/i)).toBeInTheDocument();
});

it('fires onNewDocument when the New button is clicked', () => {
  const onNew = vi.fn();
  render(<CaseDocumentsTab documents={[]} onNewDocument={onNew} onView={vi.fn()} onEdit={vi.fn()} />);
  screen.getByRole('button', { name: /new document/i }).click();
  expect(onNew).toHaveBeenCalledOnce();
});

it('shows an empty state when there are no documents', () => {
  render(<CaseDocumentsTab documents={[]} onNewDocument={vi.fn()} onView={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText(/no documents/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/detail/CaseDocumentsTab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CaseDocumentsTab`**

Create `src/components/cases/detail/CaseDocumentsTab.tsx` (mirrors `CaseReportsTab`, tokens only):

```tsx
import React from 'react';
import { FileStack, Plus, Calendar, Eye, CreditCard as Edit } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { formatDate } from '@/lib/format';
import type { DocumentInstanceStatus } from '@/lib/documentInstanceService';

interface DocumentRow {
  id: string;
  title: string;
  document_number: string | null;
  report_subtype: string | null;
  status: DocumentInstanceStatus;
  version_number: number;
  visible_to_customer: boolean | null;
  created_at: string;
}

interface CaseDocumentsTabProps {
  documents: DocumentRow[];
  onNewDocument: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}

/** Status → label + semantic Badge variant (icon+text, never colour-only). */
const STATUS_META: Record<DocumentInstanceStatus, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', variant: 'default' },
  in_review: { label: 'In Review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  issued: { label: 'Issued', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'success' },
  signed_off: { label: 'Signed Off', variant: 'success' },
  superseded: { label: 'Superseded', variant: 'warning' },
  void: { label: 'Void', variant: 'danger' },
};

const EDITABLE: DocumentInstanceStatus[] = ['draft', 'in_review'];

export const CaseDocumentsTab: React.FC<CaseDocumentsTabProps> = ({ documents, onNewDocument, onView, onEdit }) => (
  <Card>
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900">Documents</h2>
        <Button size="sm" onClick={onNewDocument}>
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileStack className="w-16 h-16 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium mb-1">No documents yet</p>
          <p className="text-sm">Create a report or certificate to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => {
            const meta = STATUS_META[doc.status] ?? STATUS_META.draft;
            return (
              <div key={doc.id} className="border border-slate-200 rounded-lg p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileStack className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 text-lg">{doc.title}</h3>
                      <p className="text-sm text-slate-600">
                        {doc.document_number}
                        {doc.version_number > 1 && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded">v{doc.version_number}</span>
                        )}
                      </p>
                      <span className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                        <Calendar className="w-4 h-4" />
                        {formatDate(doc.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {doc.visible_to_customer && (
                      <Badge variant="success" size="sm">
                        <Eye className="w-3 h-3 mr-1" />
                        Visible to Customer
                      </Badge>
                    )}
                    <div className="flex gap-1">
                      <Button variant="secondary" size="sm" onClick={() => onView(doc.id)} title="View document">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {EDITABLE.includes(doc.status) && (
                        <Button variant="secondary" size="sm" onClick={() => onEdit(doc.id)} title="Edit draft">
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </Card>
);
```

> Note: confirm `Badge` supports the `variant` values used (`default|info|success|warning|danger`) — `CaseReportsTab` uses `variant="success"`, so the prop exists; verify the full set in `src/components/ui/Badge.tsx` and adjust labels to available variants if any are missing.

- [ ] **Step 4: Run the component test to confirm it passes**

Run: `npx vitest run src/components/cases/detail/CaseDocumentsTab.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/detail/CaseDocumentsTab.tsx src/components/cases/detail/CaseDocumentsTab.test.tsx
git commit -m "feat(documents): CaseDocumentsTab — instance list with status badges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Documents query + flag-gated mount in CaseDetail

**Files:**
- Modify: `src/components/cases/detail/useCaseQueries.ts`
- Modify: `src/components/cases/detail/useCaseModals.ts`
- Modify: `src/pages/cases/CaseDetail.tsx`
- Test: `src/components/cases/detail/useCaseDocuments.test.ts` (create)

**Interfaces:**
- Produces: a `documentInstances` query (via `useCaseQueries`) keyed by `documentInstanceKeys.byCase(caseId)`; a `documents` tab rendered only when `isDocStudioEnabled()`.
- Consumes: `listDocumentInstances` (existing), `documentInstanceKeys` (existing), `isDocStudioEnabled` (existing).

This task wires data + the tab. The tab is gated by a spread on `isDocStudioEnabled()` so it never appears with the flag off. Modal state for create/view/edit is added to `useCaseModals`.

- [ ] **Step 1: Write the failing query-hook test**

Create `src/components/cases/detail/useCaseDocuments.test.ts` (node project — tests the query function in isolation):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listDocumentInstances } = vi.hoisted(() => ({ listDocumentInstances: vi.fn() }));
vi.mock('../../../lib/documentInstanceService', () => ({ listDocumentInstances }));

import { fetchCaseDocuments } from './useCaseQueries';

beforeEach(() => vi.clearAllMocks());

describe('fetchCaseDocuments', () => {
  it('returns [] for a missing case id without hitting the service', async () => {
    expect(await fetchCaseDocuments(undefined)).toEqual([]);
    expect(listDocumentInstances).not.toHaveBeenCalled();
  });

  it('delegates to listDocumentInstances for a real case id', async () => {
    listDocumentInstances.mockResolvedValue([{ id: 'd1' }]);
    const rows = await fetchCaseDocuments('c1');
    expect(listDocumentInstances).toHaveBeenCalledWith('c1');
    expect(rows).toEqual([{ id: 'd1' }]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/detail/useCaseDocuments.test.ts`
Expected: FAIL — `fetchCaseDocuments` not exported.

- [ ] **Step 3: Add the query helper + hook wiring**

In `src/components/cases/detail/useCaseQueries.ts`:

```ts
import { listDocumentInstances } from '../../../lib/documentInstanceService';
import { documentInstanceKeys } from '../../../lib/queryKeys';

/** Extracted so the query fn is unit-testable without a React render. */
export async function fetchCaseDocuments(caseId: string | undefined) {
  if (!caseId) return [];
  return listDocumentInstances(caseId);
}
```

Inside the `useCaseQueries` hook body, add the query and include `documentInstances` in the returned object:

```ts
  const { data: documentInstances = [] } = useQuery({
    queryKey: documentInstanceKeys.byCase(id ?? ''),
    queryFn: () => fetchCaseDocuments(id),
    enabled: !!id,
  });
```

(Add `documentInstances` to the hook's return object alongside `reports`.)

- [ ] **Step 4: Add modal state in `useCaseModals.ts`**

```ts
  const [showDocTypeSelector, setShowDocTypeSelector] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null);
```

Return them in the hook's object: `showDocTypeSelector, setShowDocTypeSelector, editingDocumentId, setEditingDocumentId, viewDocumentId, setViewDocumentId`.

- [ ] **Step 5: Mount the tab + render block in `CaseDetail.tsx`**

(a) Lazy import near the other tab imports:

```ts
const CaseDocumentsTab = React.lazy(() =>
  import('../../components/cases/detail/CaseDocumentsTab').then((m) => ({ default: m.CaseDocumentsTab })),
);
```

(b) Add `'documents'` to the `TabType` union (line ~70).

(c) Import the flag at the top: `import { isDocStudioEnabled } from '../../lib/featureFlags';`

(d) In the `tabs` array, insert the Documents tab right after `reports`, gated by the flag via spread:

```ts
  ...(isDocStudioEnabled() ? [{ id: 'documents', label: 'Documents', icon: FileStack }] : []),
```

(import `FileStack` from `lucide-react`).

(e) Destructure `documentInstances` from `useCaseQueries(...)` (line ~82-91).

(f) Add the render block near the reports block (~line 1168), inside the existing Suspense:

```tsx
{activeTab === 'documents' && (
  <CaseDocumentsTab
    documents={(documentInstances || []).map((d) => ({
      id: d.id,
      title: d.title,
      document_number: d.document_number,
      report_subtype: d.report_subtype,
      status: d.status,
      version_number: d.version_number,
      visible_to_customer: d.visible_to_customer,
      created_at: d.created_at,
    }))}
    onNewDocument={() => modals.setShowDocTypeSelector(true)}
    onView={(id) => modals.setViewDocumentId(id)}
    onEdit={(id) => modals.setEditingDocumentId(id)}
  />
)}
```

> Note: confirm `document_instances.version_number` is non-null in the typed Row; if nullable, coalesce `d.version_number ?? 1`.

- [ ] **Step 6: Run the query test + typecheck**

Run: `npx vitest run src/components/cases/detail/useCaseDocuments.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Manual smoke (flag on) on localhost**

Run: `VITE_DOC_STUDIO=true npm run dev` → open a case → confirm a **Documents** tab appears (and does NOT with the flag unset), lists instances (empty state if none).

- [ ] **Step 8: Commit**

```bash
git add src/components/cases/detail/useCaseQueries.ts src/components/cases/detail/useCaseModals.ts src/components/cases/detail/useCaseDocuments.test.ts src/pages/cases/CaseDetail.tsx
git commit -m "feat(documents): flag-gated Documents tab + instance query in CaseDetail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `DocumentDraftReview` — create/edit, preview, and the server-gated lifecycle (Phase 4)

**Files:**
- Create: `src/components/cases/DocumentDraftReview.tsx`
- Test: `src/components/cases/DocumentDraftReview.test.tsx`
- Modify: `src/pages/cases/CaseDetail.tsx` (render the modal + a minimal subtype selector)

**Interfaces:**
- Produces: `DocumentDraftReview` modal component.
- Consumes: `getDocumentInstance`, `getDocumentInstanceSections`, `createReportInstance`, `archiveDocumentInstance`, `transitionDocument` (all `documentInstanceService`); `reportPDFService.generateDocumentInstanceAsBlob`; `useToast`; `useAuth` (for the author-disable check).

```ts
interface DocumentDraftReviewProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  /** Provide instanceId to edit; omit + provide newSubtype to create. */
  instanceId?: string;
  newSubtype?: string;
  newTitle?: string;
  onSaved: () => void;
}
```

Behavior:
- On open with `newSubtype`: call `createReportInstance` once, then load it.
- Editable section list (textarea per section); Save persists section content (direct UPDATE on `document_instance_sections` is allowed while status ∈ draft/in_review — that is content, not lifecycle).
- **Preview**: `generateDocumentInstanceAsBlob(instanceId)` → object URL → iframe.
- **Lifecycle buttons** drive ONLY RPCs:
  - Submit for review → `transitionDocument(id, 'in_review')`.
  - Approve → `transitionDocument(id, 'approved')`; **disabled when the current user is the instance's `created_by`** (second-person), with a tooltip; RPC rejection surfaced as a toast regardless.
  - Send → `archiveDocumentInstance(id)` THEN `transitionDocument(id, 'delivered')`; surface the send-gate rejection if archive is somehow skipped.

This task is the heart of Phase 4: the UI never flips status directly.

- [ ] **Step 1: Write the failing lifecycle test**

Create `src/components/cases/DocumentDraftReview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getDocumentInstance: vi.fn(),
  getDocumentInstanceSections: vi.fn(),
  createReportInstance: vi.fn(),
  archiveDocumentInstance: vi.fn(),
  transitionDocument: vi.fn(),
}));
vi.mock('../../lib/documentInstanceService', () => svc);
vi.mock('../../lib/reportPDFService', () => ({
  reportPDFService: { generateDocumentInstanceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })) },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reviewer' }, profile: { id: 'reviewer' } }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { DocumentDraftReview } from './DocumentDraftReview';

beforeEach(() => {
  vi.clearAllMocks();
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  svc.getDocumentInstanceSections.mockResolvedValue([{ section_key: 'findings', title: 'Findings', content: '', sort_order: 0, is_visible: true }]);
});

it('archives then delivers when Send is clicked', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'approved', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  svc.archiveDocumentInstance.mockResolvedValue({ path: 'p', sha256: 'h' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  const sendBtn = await screen.findByRole('button', { name: /send to customer/i });
  fireEvent.click(sendBtn);
  await waitFor(() => expect(svc.archiveDocumentInstance).toHaveBeenCalledWith('di-1'));
  expect(svc.transitionDocument).toHaveBeenCalledWith('di-1', 'delivered');
});

it('disables Approve for the author (second-person gate)', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'reviewer', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  const approve = await screen.findByRole('button', { name: /approve/i });
  expect(approve).toBeDisabled();
});

it('creates a new instance once when opened with a subtype', async () => {
  svc.createReportInstance.mockResolvedValue({ id: 'new-1' });
  svc.getDocumentInstance.mockResolvedValue({ id: 'new-1', title: 'Evaluation Report', status: 'draft', created_by: 'reviewer', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" newSubtype="evaluation" newTitle="Evaluation Report" onSaved={vi.fn()} />);
  await waitFor(() => expect(svc.createReportInstance).toHaveBeenCalledWith({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Evaluation Report' }));
  expect(svc.createReportInstance).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/DocumentDraftReview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DocumentDraftReview`**

Create `src/components/cases/DocumentDraftReview.tsx`. Key wiring (full component):

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDocumentInstance,
  getDocumentInstanceSections,
  createReportInstance,
  archiveDocumentInstance,
  transitionDocument,
} from '../../lib/documentInstanceService';
import { reportPDFService } from '../../lib/reportPDFService';
import { supabase } from '../../lib/supabaseClient';

interface DocumentDraftReviewProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  instanceId?: string;
  newSubtype?: string;
  newTitle?: string;
  onSaved: () => void;
}

interface SectionState { section_key: string; title: string; content: string; sort_order: number; is_visible: boolean; }

export const DocumentDraftReview: React.FC<DocumentDraftReviewProps> = ({ isOpen, onClose, caseId, instanceId, newSubtype, newTitle, onSaved }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [id, setId] = useState<string | null>(instanceId ?? null);
  const [instance, setInstance] = useState<Awaited<ReturnType<typeof getDocumentInstance>>>(null);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createdRef = useRef(false);

  // Create-once on open with a subtype, else load the given instance.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        let resolvedId = instanceId ?? null;
        if (!resolvedId && newSubtype && !createdRef.current) {
          createdRef.current = true;
          const created = await createReportInstance({ caseId, reportSubtype: newSubtype, title: newTitle ?? 'Report' });
          resolvedId = created.id;
        }
        if (!resolvedId || !alive) return;
        setId(resolvedId);
        const inst = await getDocumentInstance(resolvedId);
        const secs = await getDocumentInstanceSections(resolvedId);
        if (!alive) return;
        setInstance(inst);
        setSections(secs.map((s) => ({ section_key: s.section_key, title: s.title ?? s.section_key, content: s.content ?? '', sort_order: s.sort_order, is_visible: s.is_visible })));
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load document', 'error');
      }
    })();
    return () => { alive = false; };
  }, [isOpen, instanceId, newSubtype, newTitle, caseId, showToast]);

  const isAuthor = !!instance && instance.created_by === (user?.id ?? '');
  const status = instance?.status;

  async function saveSections() {
    if (!id) return;
    setBusy(true);
    try {
      for (const s of sections) {
        const { error } = await supabase
          .from('document_instance_sections')
          .update({ content: s.content })
          .eq('document_instance_id', id)
          .eq('section_key', s.section_key);
        if (error) throw error;
      }
      showToast('Saved', 'success');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await reportPDFService.generateDocumentInstanceAsBlob(id);
      if (!res.success || !res.blob) throw new Error(res.error || 'Preview failed');
      setPreviewUrl(URL.createObjectURL(res.blob));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runTransition(to: 'in_review' | 'approved' | 'delivered') {
    if (!id) return;
    setBusy(true);
    try {
      if (to === 'delivered') await archiveDocumentInstance(id);
      await transitionDocument(id, to);
      showToast(`Document ${to.replace('_', ' ')}`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      // Server-enforced rejections (second-person, send gate, role) surface here.
      showToast(e instanceof Error ? e.message : 'Transition failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={instance?.title ?? 'Document'} size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={s.section_key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{s.title}</label>
              <Textarea
                value={s.content}
                onChange={(e) => setSections((prev) => prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))}
                rows={4}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSections} disabled={busy}>Save</Button>
            <Button variant="secondary" onClick={preview} disabled={busy}>Preview</Button>
            {status === 'draft' && <Button onClick={() => runTransition('in_review')} disabled={busy}>Submit for Review</Button>}
            {status === 'in_review' && (
              <Button
                onClick={() => runTransition('approved')}
                disabled={busy || isAuthor}
                title={isAuthor ? 'The approver must be different from the author' : undefined}
              >
                Approve
              </Button>
            )}
            {status === 'approved' && <Button onClick={() => runTransition('delivered')} disabled={busy}>Send to Customer</Button>}
          </div>
        </div>
        <div className="min-h-[400px] border border-slate-200 rounded-lg overflow-hidden">
          {previewUrl ? (
            <iframe title="Document preview" src={previewUrl} className="w-full h-full min-h-[400px]" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Click Preview to render the PDF</div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
```

> Notes: confirm `Dialog` prop names (`isOpen`/`onClose`/`title`/`size`) against `src/components/ui/Dialog.tsx` (the legacy modals use it — match their usage). Confirm `useToast` signature (`showToast(message, variant)`); if it differs, match the existing call sites. The author-disable is a UX nicety; the RPC is the real gate.

- [ ] **Step 4: Run the lifecycle test to confirm it passes**

Run: `npx vitest run src/components/cases/DocumentDraftReview.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Render the modal + subtype selector in CaseDetail**

In `CaseDetail.tsx`, render (flag-gated alongside the documents tab — only when `isDocStudioEnabled()`):
- A minimal subtype picker driven by `modals.showDocTypeSelector` that sets a chosen subtype and opens `DocumentDraftReview` with `newSubtype`. Reuse the `REPORT_TYPES` map for the option list.
- `DocumentDraftReview` for create (`newSubtype` set) and edit (`editingDocumentId` set), with `onSaved={() => queryClient.invalidateQueries({ queryKey: documentInstanceKeys.byCase(id!) })}`.

```tsx
{isDocStudioEnabled() && (
  <DocumentDraftReview
    isOpen={!!(modals.editingDocumentId || modals.docCreateSubtype)}
    onClose={() => { modals.setEditingDocumentId(null); modals.setDocCreateSubtype(null); }}
    caseId={id!}
    instanceId={modals.editingDocumentId ?? undefined}
    newSubtype={modals.docCreateSubtype ?? undefined}
    newTitle={modals.docCreateSubtype ? REPORT_TYPES[modals.docCreateSubtype as ReportType]?.name : undefined}
    onSaved={() => queryClient.invalidateQueries({ queryKey: documentInstanceKeys.byCase(id!) })}
  />
)}
```

(Add `docCreateSubtype`/`setDocCreateSubtype` to `useCaseModals`; wire the `+ New Document` button → open a small `Dialog` listing `REPORT_TYPES` → on pick `setDocCreateSubtype(key); setShowDocTypeSelector(false)`.)

- [ ] **Step 6: Typecheck + manual smoke (flag on)**

Run: `npm run typecheck` → 0 errors.
Manual (`VITE_DOC_STUDIO=true npm run dev`): New Document → pick Evaluation → draft opens with seeded sections → edit → Preview renders → Submit → log in as a different user → Approve (confirm self-approve is blocked) → Send → confirm `document_instances` row gets `pdf_sha256` + status `delivered`.

- [ ] **Step 7: Commit**

```bash
git add src/components/cases/DocumentDraftReview.tsx src/components/cases/DocumentDraftReview.test.tsx src/components/cases/detail/useCaseModals.ts src/pages/cases/CaseDetail.tsx
git commit -m "feat(documents): DocumentDraftReview — edit, preview + server-gated lifecycle (Phase 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `DocumentViewerModal` — read-only viewer with archived PDF

**Files:**
- Create: `src/components/cases/DocumentViewerModal.tsx`
- Test: `src/components/cases/DocumentViewerModal.test.tsx`
- Modify: `src/pages/cases/CaseDetail.tsx` (render it on `modals.viewDocumentId`)

**Interfaces:**
- Produces: `DocumentViewerModal`.
- Consumes: `getDocumentInstance`, `getDocumentPdfSignedUrl` (existing); `AuditInfo` (existing shared component).

```ts
interface DocumentViewerModalProps { isOpen: boolean; onClose: () => void; instanceId: string; }
```

- [ ] **Step 1: Write the failing viewer test**

Create `src/components/cases/DocumentViewerModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({ getDocumentInstance: vi.fn(), getDocumentPdfSignedUrl: vi.fn() }));
vi.mock('../../lib/documentInstanceService', () => svc);
vi.mock('../shared/AuditInfo', () => ({ AuditInfo: () => <div data-testid="audit" /> }));

import { DocumentViewerModal } from './DocumentViewerModal';

beforeEach(() => {
  vi.clearAllMocks();
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'delivered', document_number: 'REP-EVAL-0007', pdf_storage_bucket: 'case-report-pdfs', pdf_storage_path: 't/report/di-1/abc.pdf' });
  svc.getDocumentPdfSignedUrl.mockResolvedValue('https://signed/url.pdf');
});

it('shows the title, number and the archived PDF iframe', async () => {
  render(<DocumentViewerModal isOpen onClose={vi.fn()} instanceId="di-1" />);
  await waitFor(() => expect(screen.getByText('REP-EVAL-0007')).toBeInTheDocument());
  expect(svc.getDocumentPdfSignedUrl).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTitle(/document pdf/i)).toHaveAttribute('src', 'https://signed/url.pdf'));
});

it('shows a "no PDF archived yet" notice when there is no path', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-2', title: 'Draft', status: 'draft', document_number: 'REP-EVAL-0008', pdf_storage_bucket: null, pdf_storage_path: null });
  svc.getDocumentPdfSignedUrl.mockResolvedValue(null);
  render(<DocumentViewerModal isOpen onClose={vi.fn()} instanceId="di-2" />);
  await waitFor(() => expect(screen.getByText(/no pdf archived/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/DocumentViewerModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DocumentViewerModal`**

```tsx
import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { AuditInfo } from '../shared/AuditInfo';
import { getDocumentInstance, getDocumentPdfSignedUrl } from '../../lib/documentInstanceService';

interface DocumentViewerModalProps { isOpen: boolean; onClose: () => void; instanceId: string; }

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ isOpen, onClose, instanceId }) => {
  const [instance, setInstance] = useState<Awaited<ReturnType<typeof getDocumentInstance>>>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !instanceId) return;
    let alive = true;
    (async () => {
      const inst = await getDocumentInstance(instanceId);
      if (!alive) return;
      setInstance(inst);
      if (inst?.pdf_storage_path) {
        const signed = await getDocumentPdfSignedUrl(inst);
        if (alive) setUrl(signed);
      } else {
        setUrl(null);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, instanceId]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={instance?.title ?? 'Document'} size="xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-600">{instance?.document_number}</p>
        {instance && <Badge>{instance.status}</Badge>}
      </div>
      <div className="min-h-[480px] border border-slate-200 rounded-lg overflow-hidden">
        {url ? (
          <iframe title="Document PDF" src={url} className="w-full h-full min-h-[480px]" />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">No PDF archived yet</div>
        )}
      </div>
      {instance && (
        <div className="mt-3">
          <AuditInfo createdBy={instance.created_by} createdAt={instance.created_at} updatedBy={instance.updated_by} updatedAt={instance.updated_at} />
        </div>
      )}
    </Dialog>
  );
};
```

> Note: confirm `AuditInfo`'s exact prop names against `src/components/shared/AuditInfo.tsx` (the case/quote/invoice surfaces use it — match a real call site). If the instance Row lacks `updated_by`/`updated_at`, omit those props.

- [ ] **Step 4: Run the viewer test to confirm it passes**

Run: `npx vitest run src/components/cases/DocumentViewerModal.test.tsx`
Expected: PASS (both).

- [ ] **Step 5: Render it in CaseDetail**

```tsx
{isDocStudioEnabled() && modals.viewDocumentId && (
  <DocumentViewerModal isOpen={!!modals.viewDocumentId} onClose={() => modals.setViewDocumentId(null)} instanceId={modals.viewDocumentId} />
)}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/cases/DocumentViewerModal.tsx src/components/cases/DocumentViewerModal.test.tsx src/pages/cases/CaseDetail.tsx
git commit -m "feat(documents): DocumentViewerModal — archived PDF + audit panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Retokenize `reportTypes.ts` to semantic tokens

**Files:**
- Modify: `src/lib/reportTypes.ts`
- Test: `src/lib/reportTypes.test.ts` (create)

**Interfaces:**
- Changes `REPORT_TYPES[*].color/badgeColor` and `REPORT_STATUS_CONFIG[*].color` from raw hex to Tailwind classes built on the 14 semantic tokens + neutral slate. Consumers that pass `style={{ color }}` switch to `className`. This satisfies `check:tokens` and the new UI's styling.

Because the raw hex currently feeds `style={{ color }}`/`backgroundColor`, change the config to emit Tailwind class strings and update the two legacy consumers (`CaseReportsTab`, `ReportViewModal`) that read `.color`. Keep the same field names to minimize churn; change their VALUES + the consumption.

- [ ] **Step 1: Write the failing token test**

Create `src/lib/reportTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REPORT_TYPES, REPORT_STATUS_CONFIG } from './reportTypes';

const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe('reportTypes tokens', () => {
  it('no report type carries a raw hex colour', () => {
    for (const cfg of Object.values(REPORT_TYPES)) {
      expect(cfg.color).not.toMatch(HEX);
      expect(cfg.badgeColor).not.toMatch(HEX);
    }
  });
  it('no status config carries a raw hex colour', () => {
    for (const cfg of Object.values(REPORT_STATUS_CONFIG)) {
      expect(cfg.color).not.toMatch(HEX);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/reportTypes.test.ts`
Expected: FAIL — current values are hex.

- [ ] **Step 3: Replace hex with token classes**

In `src/lib/reportTypes.ts`, change each `color`/`badgeColor` to a Tailwind text/utility class on semantic tokens or neutral slate. Map (icon tint via text classes):

```ts
// evaluation → text-info ; service → text-success ; server → text-info ; malware → text-danger ;
// forensic → text-info ; data_destruction → text-danger ; prevention → text-warning ; recovered_files → text-success
```

For example:
```ts
  evaluation: { key: 'evaluation', name: 'Evaluation Report', description: 'Initial assessment and recovery feasibility analysis', icon: FileText, color: 'text-info', badgeColor: 'info' },
  service:    { key: 'service',    name: 'Service Report',    description: 'Detailed documentation of service work performed', icon: Wrench, color: 'text-success', badgeColor: 'success' },
  // ...repeat for the remaining six with the mapping above
```

And `REPORT_STATUS_CONFIG`:
```ts
  draft:    { label: 'Draft',     color: 'text-slate-500' },
  review:   { label: 'In Review', color: 'text-info' },
  approved: { label: 'Approved',  color: 'text-success' },
  sent:     { label: 'Sent',      color: 'text-success' },
```

Update `getReportTypeColor`'s fallback from `'#64748b'` to `'text-slate-500'`.

- [ ] **Step 4: Update the two legacy consumers**

In `CaseReportsTab.tsx`: replace `style={{ color: typeConfig.color }}` on the icon with `className={`w-8 h-8 ${typeConfig.color}`}` (drop the inline style), and the status `Badge` from `style={{ backgroundColor: statusConfig.color, color: 'white' }}` to `variant`-based. Since `REPORT_STATUS_CONFIG` now stores a text class, map status → Badge variant inline:

```tsx
const STATUS_VARIANT: Record<ReportStatus, 'default' | 'info' | 'success'> = { draft: 'default', review: 'info', approved: 'success', sent: 'success' };
// ...
<Badge variant={STATUS_VARIANT[report.status]}>{statusConfig.label}</Badge>
```

In `ReportViewModal.tsx`: apply the same change anywhere it consumes `getReportTypeColor`/`statusConfig.color` as an inline style.

- [ ] **Step 5: Run the token test + check:tokens + typecheck**

Run: `npx vitest run src/lib/reportTypes.test.ts` → PASS.
Run: `npm run check:tokens` (or the repo's token-lint script) → clean.
Run: `npm run typecheck` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reportTypes.ts src/lib/reportTypes.test.ts src/components/cases/detail/CaseReportsTab.tsx src/components/cases/ReportViewModal.tsx
git commit -m "refactor(documents): retokenize reportTypes to semantic tokens (no raw hex)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `show_documents` portal visibility flag (Phase 9 prep)

**Files:**
- Modify: `src/lib/portalVisibility.ts`
- Test: `src/lib/portalVisibility.test.ts` (create or extend)

**Interfaces:**
- Adds a `show_documents` entry to the visibility-flag set/logic so Phase 9 can gate `document_instances` portal exposure. Tiny, additive — no behavior change for existing flags.

- [ ] **Step 1: Write the failing test**

Create/extend `src/lib/portalVisibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PORTAL_VISIBILITY_FIELDS, isPortalFieldVisible } from './portalVisibility';

describe('portal visibility — documents', () => {
  it('includes show_documents in the known field set', () => {
    expect(PORTAL_VISIBILITY_FIELDS).toContain('show_documents');
  });
  it('treats show_documents as hidden unless explicitly enabled', () => {
    expect(isPortalFieldVisible([], 'show_documents')).toBe(false);
    expect(isPortalFieldVisible(['show_documents'], 'show_documents')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/portalVisibility.test.ts`
Expected: FAIL — `show_documents` not in the set (and/or helpers named differently).

- [ ] **Step 3: Add the flag**

In `src/lib/portalVisibility.ts`, add `'show_documents'` to the known fields list/type. Match the EXISTING export names — if the module exports `PORTAL_VISIBILITY_FIELDS` and `isPortalFieldVisible`, extend them; if it uses different names (e.g. `visibleFields` constant + a `case_portal_visibility.visible_fields` array check), add `show_documents` there and align the test to the real API.

> Note for the implementer: read `src/lib/portalVisibility.ts` first and match its actual exports; the test names above are the target API — rename to fit what exists rather than inventing a parallel API.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/portalVisibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portalVisibility.ts src/lib/portalVisibility.test.ts
git commit -m "feat(portal): add show_documents visibility flag (Phase 9 prep)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before opening the PR)

- [ ] **Full typecheck:** `npm run typecheck` → 0 errors.
- [ ] **Full test suite:** `npx vitest run` → all green (note the known WASM reproducibility flake; re-run that file in isolation if it trips).
- [ ] **Token lint:** `npm run check:tokens` (or repo equivalent) → clean.
- [ ] **Flag-off regression:** with `VITE_DOC_STUDIO` unset, build + smoke the case page — the Documents tab is ABSENT and the legacy Reports flow is unchanged.
- [ ] **Flag-on end-to-end (localhost, `VITE_DOC_STUDIO=true`):** create Evaluation → seeded sections → edit → Preview renders the real PDF → Submit → (as a different user) Approve [confirm self-approve blocked by the server, surfaced as a toast] → Send → confirm the `document_instances` row has `pdf_sha256` + `resolved_data` + status `delivered`; a draft cannot be sent (send gate).
- [ ] Update the task tracker: Phase 8 + Phase 4 done; note in memory that the Phase-3 reroute (instance render + attachArtifact wiring) actually landed here.

---

## Spec coverage notes (self-review)

- **Phase 8 deliverables** (CaseDocumentsTab, DraftReview, DocumentViewerModal, auto-populate, provenance, preview, retokenize): Tasks 4, 6, 7, 2+3 (seed), 6 (preview), 8.
- **Phase 4 deliverables** (approve/send behind RPC, server-gated states, second-person, send gate): Task 6 (lifecycle buttons drive `transitionDocument`/`archiveDocumentInstance` only; Approve disabled for author; RPC rejections surfaced).
- **Missing Phase-3 reroute** (the documented-but-unshipped `attachArtifact` wiring): Tasks 1 + 3 (`generateDocumentInstanceAsBlob` + `archiveDocumentInstance`).
- **Quick wins:** reroute (Tasks 1/3), retokenize (Task 8), `show_documents` flag (Task 9).
- **Out of scope (later phases):** signature capture/embedding (Phase 6), portal sign-off route (Phase 9), automation (Phase 10), legacy retirement (Phase 11). Legacy `case_reports` writes are untouched here.
