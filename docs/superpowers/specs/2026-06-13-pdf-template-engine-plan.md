# Tenant-Configurable Bilingual PDF Document Template Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace xSuite's 11 hardcoded `pdfmake` builders with one config-driven assembler (`renderTemplate`) over shared section renderers, backed by a new tenant-scoped template schema with field-toggle + cascade + immutable versions, and add real bilingual (EN/AR, RTL-aware) output — without weakening auditability, tenant isolation, or the data-recovery lifecycle.

**Architecture:** Keep `pdfmake` (sole, client-side, audited; preview = real artifact). The engine is a config-driven assembler orthogonal to the renderer: `renderTemplate(resolvedConfig, data, ctx) → TDocumentDefinitions` composed of shared section renderers (header, party block, line-item table, totals, terms, signatures, footer, QR, custody log, section list). A single cascade resolver merges built-in default → tenant `branding_theme` → doc-type template (deployed version) → per-instance override, then pins the version on issue. Bilingual via per-doc `language.mode`, a tenant-extendable label dictionary, the existing-but-bypassed side-by-side helpers, and a bidi/RTL pass.

**Tech Stack:** React 18 + TypeScript + Vite, `pdfmake` v0.2.20, TanStack Query v5, Supabase (Postgres 15, RLS, Storage `company-assets`), Vitest, Noto Sans Arabic + Tajawal fonts.

**Locked decisions (from design spec §4, confirm overridable at M1 gate):**
- Keep pdfmake; HTML→Chromium is a named off-ramp evaluated only at M6 if RTL is intractable.
- New first-class schema — do **not** reuse the empty email `document_templates`/`templates`/`template_versions` tables.
- Field-toggle + cascade in v1; defer WYSIWYG / code-override.
- Follow `DESIGN.md` (Royal navy `#162660`, neutral PDFs); PDFs stay **logo-only neutral**, per-tenant accent deferred + opt-in.
- v1 scope = make existing docs configurable + engine + bilingual. Net-new accounting family + lab-legal docs = Phase 2 (M8).

**Source-of-truth anchors (real paths verified 2026-06-13):**
- Builders: `src/lib/pdf/documents/*.ts` (11 — `InvoiceDocument.ts`, `QuoteDocument.ts`, `PaymentReceiptDocument.ts`, `OfficeReceiptDocument.ts`, `CustomerCopyDocument.ts`, `CheckoutFormDocument.ts`, `CaseLabelDocument.ts`, `StockLabelDocument.ts`, `ChainOfCustodyDocument.ts`, `PayslipDocument.ts`, `CreditNoteDocument.ts`; `ReportDocument.ts` is driven by `reportPDFService.ts`).
- Glue: `src/lib/pdf/pdfService.ts` (`generate*` / `generate*AsBlob`, each: `createTranslationContext(mode, languageCode)` → `fetch*Data()` → `buildX(...)` → `generatePDF`).
- Data: `src/lib/pdf/dataFetcher.ts` (`fetch*Data` + `to*Data` typed mappers, `satisfies`, no casts).
- Types: `src/lib/pdf/types.ts` (`DocumentType` union, `*DocumentData`, `CompanySettingsData`, `TranslationContext`).
- Shared style + bilingual helpers: `src/lib/pdf/styles.ts` (`PDF_COLORS`, `getStylesWithFont`, `createBilingualInfoBox`, `createBilingualSectionHeader`, `createTermsBox`, `createBilingualSignatureBlock`, `createSocialFooter`).
- Translation/RTL: `src/lib/pdf/translationContext.ts`, `src/lib/pdf/fontLoader.ts`, `src/lib/pdf/documentTranslations.ts`.
- Report Studio (RLS gaps to fix): `src/lib/reportSectionService.ts`, `src/lib/reportsService.ts` over `report_section_library`, `report_section_presets`, `master_case_report_templates`.
- Branding/logo: `src/lib/fileStorageService.ts` (`uploadLogo`, bucket `company-assets`), `src/pages/settings/GeneralSettings.tsx`.
- Settings routes: `src/App.tsx:241-256` (`settings` block, `ADMIN_ROLES`).

**HARD GATE:** No migration / RLS / Storage / payment change is applied without explicit per-step approval. **M1, M6, M8 are approval gates** (⚠). Do not run `apply_migration`, DDL/DML, or Storage/RLS/payment edits inside other milestones.

---

## File-structure map (what each new file owns)

| File | Responsibility | Introduced |
|---|---|---|
| `docs/superpowers/specs/2026-06-13-pdf-template-engine-m1-migration.sql` | Exact reviewable migration draft (no auto-apply) | M0 |
| `docs/superpowers/specs/2026-06-13-pdf-call-site-map.md` | Every PDF call site + cascade entry points | M0 |
| `src/lib/pdf/engine/templateConfig.ts` | `TemplateConfig` types + Zod-free runtime validator + built-in default config per `DocumentType` | M2 |
| `src/lib/pdf/engine/resolveTemplate.ts` | Cascade resolver (default → theme → doc-type version → instance override) | M2 |
| `src/lib/pdf/engine/renderTemplate.ts` | `renderTemplate(config, data, ctx) → TDocumentDefinitions` assembler | M2 |
| `src/lib/pdf/engine/sections/` | One file per shared section renderer (header, party, lineItems, totals, terms, signature, footer, qr, custodyLog, sectionList) | M2 |
| `src/lib/pdf/engine/sections/index.ts` | Section registry: `key → renderer` | M2 |
| `src/lib/pdf/templateService.ts` | Supabase CRUD for `branding_themes` / `document_templates_pdf` / `document_template_versions` + version pin read | M3 |
| `src/lib/queryKeys.ts` (modify) | Add `pdfTemplates`, `brandingThemes` query keys | M3 |
| `src/pages/settings/DocumentTemplatesPage.tsx` | Settings → Documents gallery + editor host | M3/M4 |
| `src/components/settings/documents/` | Editor tabs, label-dictionary editor, live-preview pane | M4 |
| `src/lib/pdf/engine/bidi.ts` | RTL/bidi shaping pass + Arabic amount-in-words | M6 |
| `src/types/database.types.ts` (regen) | Generated types after M1 migration | M1 |

Each engine file is < ~250 lines, one responsibility. Section renderers are pure: `(sectionConfig, data, ctx, resolved) → Content`.

---

## M0 — Spec, plan, exact migration draft, config schema, call-site map (NO DB writes)

**Goal:** Produce every artifact M1 needs to be reviewed and approved, with zero schema or code changes. This milestone is documentation only.

**Files:**
- Create: `docs/superpowers/specs/2026-06-13-pdf-template-engine-plan.md` (this file)
- Create: `docs/superpowers/specs/2026-06-13-pdf-template-engine-m1-migration.sql`
- Create: `docs/superpowers/specs/2026-06-13-pdf-call-site-map.md`

- [ ] **Step 1: Build the call-site map**

Run (read-only) to enumerate every PDF entry point and the cascade insertion points:
```bash
grep -rn "generate.*AsBlob\|generate[A-Z].*(" src/lib/pdf/pdfService.ts
grep -rn "pdfService\|reportPDFService\|generateInvoice\|generateQuote\|generatePaymentReceipt" src --include=*.tsx --include=*.ts -l
grep -rn "createTranslationContext" src/lib/pdf/pdfService.ts
```
Expected: ~20 `generate*` functions in `pdfService.ts`, callers in cases/financial/portal pages, one `createTranslationContext` call per doc type.

Write `2026-06-13-pdf-call-site-map.md` listing, per `DocumentType`: the `pdfService` function, its `fetch*Data` source, its `buildX` builder, and the exact line where `buildX(...)` is invoked (the cascade hook point — this is where `resolveTemplate` will be injected in M3/M5).

- [ ] **Step 2: Lock the template config schema**

Copy the JSON schema from the design spec §5 verbatim into the call-site map doc as the canonical `TemplateConfig` shape, with one fully-worked synthetic invoice example:
```jsonc
{
  "paper":    { "size": "A4", "orientation": "portrait", "margins": [35, 30, 35, 95] },
  "branding": { "themeId": "00000000-0000-0000-0000-000000000001", "logo": true, "accent": "inherit", "watermark": null },
  "language": { "mode": "bilingual_sidebyside", "primary": "en" },
  "sections": [
    { "key": "header", "visible": true, "order": 0 },
    { "key": "party", "visible": true, "order": 1 },
    { "key": "lineItems", "visible": true, "order": 3,
      "columns": [ { "key": "description", "visible": true, "label": {"en":"Description","ar":"الوصف"}, "width": 220 } ] },
    { "key": "totals", "visible": true, "order": 4, "lines": { "subtotal": true, "vat": true, "amountInWords": true } },
    { "key": "terms", "visible": true, "order": 5 },
    { "key": "signature", "visible": false, "order": 6 },
    { "key": "qr", "visible": true, "order": 7 }
  ],
  "labels": { "documentTitle": {"en":"TAX INVOICE","ar":"فاتورة ضريبية"} }
}
```

- [ ] **Step 3: Draft the exact M1 migration (reviewable, NOT applied)**

Write `2026-06-13-pdf-template-engine-m1-migration.sql` containing the full DDL: three new tenant-scoped tables (`branding_themes`, `document_templates_pdf`, `document_template_versions`), each with `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, `deleted_at timestamptz DEFAULT NULL`, `ENABLE`+`FORCE ROW LEVEL SECURITY`, RESTRICTIVE isolation policy (`tenant_id = get_current_tenant_id() OR is_platform_admin()`), `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index. Include the nullable `template_version_id uuid` additive columns on `invoices`, `quotes`, `case_reports`. Include the **Report Studio RLS fix**: replace `SELECT USING(true)` with RESTRICTIVE tenant isolation on `report_section_library`, `report_section_presets`, `master_case_report_templates`, and normalise soft-delete. **Header comment must state: requires M1 approval gate before `apply_migration`.**

- [ ] **Step 4: Self-review M0 against the spec**

Confirm every spec §5/§7 doc type maps to a `DocumentType` and a planned section set. List any gap inline in the call-site map.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-13-pdf-template-engine-plan.md docs/superpowers/specs/2026-06-13-pdf-template-engine-m1-migration.sql docs/superpowers/specs/2026-06-13-pdf-call-site-map.md
git commit -m "docs(pdf-engine): M0 plan, M1 migration draft, call-site map"
```

---

## M1 ⚠ APPROVAL GATE — Migration + RESTRICTIVE RLS + Storage + Report Studio RLS fix

**Goal:** Create the new template schema, fix the Report Studio RLS gaps, regenerate types. **Touches migration + RLS (+ Storage policy review). Requires explicit user approval before any `apply_migration` call.**

**Approval gate procedure (do this BEFORE any DB write):**
1. Present the M0 migration draft (`2026-06-13-pdf-template-engine-m1-migration.sql`) in full.
2. Present the six M1 open questions from spec §9 (DESIGN.md colors, neutral PDFs, field-toggle v1, existing-docs-first, store-issued-PDFs deferral, table naming).
3. Wait for explicit "approved — apply M1" from the user. **Do not proceed without it.**

**Files:**
- Apply (via `mcp__supabase__apply_migration` with `project_id=ssmbegiyjivrcwgcqutu`, ONLY after approval): the M0 migration SQL
- Modify (regen): `src/types/database.types.ts`
- Create: `.github/PULL_REQUEST_TEMPLATE/migration.md` usage (follow existing migration PR template)

- [ ] **Step 1: Re-introspect live schema before writing**

Run: `mcp__supabase__list_tables` (project_id `ssmbegiyjivrcwgcqutu`) and confirm `branding_themes` / `document_templates_pdf` / `document_template_versions` do not already exist, and re-confirm the three Report Studio tables still use `USING(true)`.
Expected: new tables absent; Report Studio tables show permissive `USING(true)` SELECT.

- [ ] **Step 2: (AFTER APPROVAL) Apply the migration**

Call `mcp__supabase__apply_migration` with the M0 SQL. Migration name: `pdf_template_engine_schema`.
Expected: success; three new tables + additive columns + Report Studio RLS replaced.

- [ ] **Step 3: Verify RLS posture**

Run `mcp__supabase__execute_sql` (read-only SELECT against `pg_policies`) to assert each new table has exactly one RESTRICTIVE isolation policy + permissive op policies, and the three Report Studio tables no longer have `USING(true)`.
Expected: RESTRICTIVE present on all new tables; zero `USING(true)` SELECT on Report Studio tables.

- [ ] **Step 4: Run advisors**

Run `mcp__supabase__get_advisors` (security + performance).
Expected: no new RLS-disabled / policy-gap warnings introduced by this migration.

- [ ] **Step 5: Regenerate types**

Run `mcp__supabase__generate_typescript_types` and overwrite `src/types/database.types.ts`. Do not hand-edit.

- [ ] **Step 6: Verify typecheck + schema-drift**

Run: `npm run build 2>&1 | tail -20` and `bash scripts/check-schema-drift.sh`
Expected: tsc 0 errors; schema-drift clean (generated types match live DB).

- [ ] **Step 7: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(pdf-engine): M1 template schema + RESTRICTIVE RLS + Report Studio RLS fix"
```

---

## M2 — Engine core: assembler + shared section renderers + cascade resolver + version pinning

**Goal:** Build the config-driven engine with no UI and no DB coupling yet. Start by extracting the duplicated header/footer (pure refactor under characterization tests), then build the resolver and assembler. **No migration / RLS / Storage / payment changes.**

**Files:**
- Create: `src/lib/pdf/engine/templateConfig.ts`
- Create: `src/lib/pdf/engine/resolveTemplate.ts`
- Create: `src/lib/pdf/engine/renderTemplate.ts`
- Create: `src/lib/pdf/engine/sections/header.ts`, `party.ts`, `lineItems.ts`, `totals.ts`, `terms.ts`, `signature.ts`, `footer.ts`, `qr.ts`, `custodyLog.ts`, `sectionList.ts`, `index.ts`
- Test: `src/lib/pdf/engine/resolveTemplate.test.ts`, `renderTemplate.test.ts`, `sections/header.test.ts`, `sections/lineItems.test.ts`, `sections/totals.test.ts`

### Task M2.1 — Characterize the current Invoice builder (golden baseline)

- [ ] **Step 1: Write a characterization test capturing the current `buildInvoiceDocument` output**

Create `src/lib/pdf/engine/invoiceCharacterization.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildInvoiceDocument } from '../documents/InvoiceDocument';
import type { InvoiceDocumentData, TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

const data: InvoiceDocumentData = {
  invoiceData: {
    id: 'inv-1', invoice_number: 'INV-0042', invoice_type: 'tax_invoice',
    invoice_date: '2026-06-13', due_date: '2026-06-27', status: 'issued',
    subtotal: 1500, tax_rate: 5, tax_amount: 75, discount_amount: 0,
    total_amount: 1575, amount_paid: 0, balance_due: 1575, created_at: '2026-06-13',
    customer: { id: 'c1', customer_name: 'Acme Labs', email: 'a@x.io' },
    invoice_line_items: [{ description: 'RAID recovery', quantity: 1, unit_price: 1500, tax_rate: 5, line_total: 1500 }],
    accounting_locales: { currency_symbol: 'AED', currency_position: 'after', decimal_places: 2 },
  },
  companySettings: { basic_info: { company_name: 'xSuite Lab' } },
  paymentHistory: [],
};

it('produces a stable invoice doc-definition shape', () => {
  const def = buildInvoiceDocument(data, ctx, null, null, null);
  expect(def.pageSize).toBe('A4');
  expect(def.pageMargins).toEqual([35, 30, 35, 95]);
  expect(JSON.stringify(def.content)).toContain('TAX INVOICE');
  expect(JSON.stringify(def.content)).toContain('1500.00 AED');
});
```

- [ ] **Step 2: Run to confirm it passes against current code**

Run: `npx vitest run src/lib/pdf/engine/invoiceCharacterization.test.ts`
Expected: PASS (captures current behavior as the golden baseline the engine must reproduce).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/engine/invoiceCharacterization.test.ts
git commit -m "test(pdf-engine): characterize current invoice builder output"
```

### Task M2.2 — `templateConfig.ts`: types, validator, built-in defaults

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/templateConfig.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getDefaultConfig, validateConfig } from './templateConfig';

it('returns a built-in default config for invoice', () => {
  const cfg = getDefaultConfig('invoice');
  expect(cfg.paper.size).toBe('A4');
  expect(cfg.sections.find(s => s.key === 'lineItems')?.visible).toBe(true);
  expect(cfg.language.mode).toBe('en');
});

it('rejects a config with an unknown section key', () => {
  expect(() => validateConfig({ ...getDefaultConfig('invoice'),
    sections: [{ key: 'bogus', visible: true, order: 0 }] })).toThrow(/unknown section/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/templateConfig.test.ts`
Expected: FAIL — `getDefaultConfig` not defined.

- [ ] **Step 3: Implement `templateConfig.ts`**

```ts
import type { DocumentType } from '../types';

export type SectionKey = 'header'|'party'|'lineItems'|'totals'|'terms'|'signature'|'footer'|'qr'|'custodyLog'|'sectionList';
export type LangMode = 'en'|'ar'|'bilingual_stacked'|'bilingual_sidebyside';

export interface ColumnConfig { key: string; visible: boolean; label: { en: string; ar?: string }; width: number | '*' | 'auto'; }
export interface SectionConfig {
  key: SectionKey; visible: boolean; order: number;
  columns?: ColumnConfig[];
  lines?: Record<string, boolean>;
  label?: { en: string; ar?: string };
}
export interface TemplateConfig {
  paper: { size: 'A4'|'Letter'; orientation: 'portrait'|'landscape'; margins: [number,number,number,number] };
  branding: { themeId: string|null; logo: boolean; accent: 'inherit'|string; watermark: string|null };
  language: { mode: LangMode; primary: 'en'|'ar' };
  sections: SectionConfig[];
  labels: Record<string, { en: string; ar?: string }>;
}

const KNOWN_SECTIONS = new Set<SectionKey>(['header','party','lineItems','totals','terms','signature','footer','qr','custodyLog','sectionList']);

export function getDefaultConfig(docType: DocumentType): TemplateConfig {
  const financial = docType === 'invoice' || docType === 'quote' || docType === 'credit_note' || docType === 'payment_receipt';
  return {
    paper: { size: 'A4', orientation: 'portrait', margins: [35, 30, 35, 95] },
    branding: { themeId: null, logo: true, accent: 'inherit', watermark: null },
    language: { mode: 'en', primary: 'en' },
    sections: [
      { key: 'header', visible: true, order: 0 },
      { key: 'party', visible: true, order: 1 },
      ...(financial ? [{ key: 'lineItems' as SectionKey, visible: true, order: 3 },
                       { key: 'totals' as SectionKey, visible: true, order: 4, lines: { subtotal: true, vat: true, amountInWords: false } }] : []),
      { key: 'terms', visible: financial, order: 5 },
      { key: 'signature', visible: false, order: 6 },
      { key: 'qr', visible: true, order: 7 },
      { key: 'footer', visible: true, order: 8 },
    ],
    labels: {},
  };
}

export function validateConfig(cfg: TemplateConfig): TemplateConfig {
  for (const s of cfg.sections) {
    if (!KNOWN_SECTIONS.has(s.key)) throw new Error(`Unknown section key: ${s.key}`);
  }
  return cfg;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/engine/templateConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/templateConfig.ts src/lib/pdf/engine/templateConfig.test.ts
git commit -m "feat(pdf-engine): template config types, validator, built-in defaults"
```

### Task M2.3 — `resolveTemplate.ts`: cascade resolver

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/resolveTemplate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveTemplate } from './resolveTemplate';
import { getDefaultConfig } from './templateConfig';

it('most-specific-wins: instance override beats doc-type beats theme beats default', () => {
  const base = getDefaultConfig('invoice');
  const resolved = resolveTemplate({
    builtin: base,
    theme: { language: { mode: 'bilingual_sidebyside', primary: 'en' } },
    docType: { paper: { size: 'Letter', orientation: 'portrait', margins: [20,20,20,20] } },
    instance: { branding: { logo: false } },
  });
  expect(resolved.paper.size).toBe('Letter');            // from docType
  expect(resolved.language.mode).toBe('bilingual_sidebyside'); // from theme
  expect(resolved.branding.logo).toBe(false);            // from instance
  expect(resolved.sections.length).toBe(base.sections.length); // default retained
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/resolveTemplate.test.ts`
Expected: FAIL — `resolveTemplate` not defined.

- [ ] **Step 3: Implement `resolveTemplate.ts`**

```ts
import type { TemplateConfig } from './templateConfig';
import { validateConfig } from './templateConfig';

type Partials = {
  builtin: TemplateConfig;
  theme?: Partial<TemplateConfig>;
  docType?: Partial<TemplateConfig>;
  instance?: Partial<TemplateConfig>;
};

function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(override)) {
    const ov = (override as any)[k];
    const bv = (base as any)[k];
    out[k] = ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object'
      ? deepMerge(bv, ov) : ov;
  }
  return out;
}

export function resolveTemplate(p: Partials): TemplateConfig {
  let cfg = p.builtin;
  cfg = deepMerge(cfg, p.theme);
  cfg = deepMerge(cfg, p.docType);
  cfg = deepMerge(cfg, p.instance);
  return validateConfig(cfg);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/engine/resolveTemplate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/resolveTemplate.ts src/lib/pdf/engine/resolveTemplate.test.ts
git commit -m "feat(pdf-engine): cascade resolver (default->theme->docType->instance)"
```

### Task M2.4 — Extract shared section renderers (pure refactor of existing builder logic)

- [ ] **Step 1: Write failing tests for header + lineItems + totals renderers**

Create `src/lib/pdf/engine/sections/lineItems.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderLineItems } from './lineItems';
import type { TranslationContext } from '../../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

it('renders a line-item table with configured columns and currency format', () => {
  const out: any = renderLineItems(
    { key: 'lineItems', visible: true, order: 3,
      columns: [{ key: 'description', visible: true, label: { en: 'Description' }, width: 220 }] },
    { items: [{ description: 'RAID recovery', quantity: 1, unit_price: 1500, line_total: 1500 }],
      currency: { symbol: 'AED', position: 'after', decimals: 2 } },
    ctx);
  const json = JSON.stringify(out);
  expect(json).toContain('RAID recovery');
  expect(json).toContain('1500.00 AED');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/sections/lineItems.test.ts`
Expected: FAIL — `renderLineItems` not defined.

- [ ] **Step 3: Implement the section renderers**

For each `sections/<key>.ts`, lift the corresponding block out of `InvoiceDocument.ts` (lines noted) into a pure function `(section, data, ctx) => Content`, reusing `PDF_COLORS`, `getStylesWithFont`, and the existing helpers in `styles.ts`. Concretely:
- `header.ts` ← `InvoiceDocument.ts:36-119` (logo/legalName/address + divider + title).
- `party.ts` ← `InvoiceDocument.ts:124-167` (customer info + doc details info boxes via `createBilingualInfoBox`).
- `lineItems.ts` ← `InvoiceDocument.ts:169-220` (table from `columns` config + `formatCurrency`).
- `totals.ts` ← `InvoiceDocument.ts:222-319` (subtotal/discount/VAT/total/paid/balance, gated by `section.lines`).
- `terms.ts` ← `InvoiceDocument.ts:370-485` (payment terms/notes/bank block).
- `footer.ts` ← `InvoiceDocument.ts:504-623` (QR + tagline + website footer fn).
- `qr.ts` ← QR sub-block of footer (reused standalone for label docs).
- `custodyLog.ts` ← lift the entry table from `ChainOfCustodyDocument.ts`.
- `sectionList.ts` ← lift the report-section loop concept from `ReportDocument.ts`.
- `signature.ts` ← wrap existing `createBilingualSignatureBlock` from `styles.ts`.

Each renderer signature:
```ts
import type { Content } from 'pdfmake/interfaces';
import type { SectionConfig } from '../templateConfig';
import type { TranslationContext } from '../../types';
export function renderLineItems(section: SectionConfig, data: { items: any[]; currency: { symbol: string; position: 'before'|'after'; decimals: number } }, ctx: TranslationContext): Content { /* lifted logic */ }
```

Create `sections/index.ts` registry:
```ts
import { renderHeader } from './header';
import { renderParty } from './party';
import { renderLineItems } from './lineItems';
import { renderTotals } from './totals';
import { renderTerms } from './terms';
import { renderSignature } from './signature';
import { renderQr } from './qr';
import { renderCustodyLog } from './custodyLog';
import { renderSectionList } from './sectionList';
import type { SectionKey } from '../templateConfig';

export const SECTION_RENDERERS: Record<Exclude<SectionKey,'footer'>, Function> = {
  header: renderHeader, party: renderParty, lineItems: renderLineItems, totals: renderTotals,
  terms: renderTerms, signature: renderSignature, qr: renderQr, custodyLog: renderCustodyLog, sectionList: renderSectionList,
};
```

- [ ] **Step 4: Run section tests**

Run: `npx vitest run src/lib/pdf/engine/sections/`
Expected: PASS for header, lineItems, totals tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/sections/
git commit -m "feat(pdf-engine): extract shared section renderers from invoice builder"
```

### Task M2.5 — `renderTemplate.ts`: the assembler + version-pin plumbing

- [ ] **Step 1: Write the failing test (must match the M2.1 golden baseline)**

Create `src/lib/pdf/engine/renderTemplate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderTemplate } from './renderTemplate';
import { getDefaultConfig } from './templateConfig';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

it('assembles ordered visible sections into a TDocumentDefinitions', () => {
  const cfg = getDefaultConfig('invoice');
  const def: any = renderTemplate(cfg, {
    docType: 'invoice', title: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
    items: [{ description: 'RAID recovery', quantity: 1, unit_price: 1500, line_total: 1500 }],
    currency: { symbol: 'AED', position: 'after', decimals: 2 },
    company: { name: 'xSuite Lab' }, party: { name: 'Acme Labs' },
    totals: { subtotal: 1500, vat: 75, total: 1575 },
  }, ctx);
  expect(def.pageSize).toBe('A4');
  expect(JSON.stringify(def.content)).toContain('TAX INVOICE');
  expect(JSON.stringify(def.content)).toContain('1500.00 AED');
});

it('omits sections with visible:false', () => {
  const cfg = getDefaultConfig('invoice');
  const hidden = { ...cfg, sections: cfg.sections.map(s => s.key === 'lineItems' ? { ...s, visible: false } : s) };
  const def: any = renderTemplate(hidden, { docType: 'invoice', items: [], currency: { symbol: 'AED', position: 'after', decimals: 2 }, company: { name: 'x' }, party: { name: 'y' }, totals: {} }, ctx);
  expect(JSON.stringify(def.content)).not.toContain('RAID recovery');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/renderTemplate.test.ts`
Expected: FAIL — `renderTemplate` not defined.

- [ ] **Step 3: Implement `renderTemplate.ts`**

```ts
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type { TemplateConfig } from './templateConfig';
import type { TranslationContext } from '../types';
import { getStylesWithFont } from '../styles';
import { SECTION_RENDERERS } from './sections';
import { renderFooter } from './sections/footer';

export interface EngineData {
  docType: string;
  [k: string]: unknown;
}

export function renderTemplate(cfg: TemplateConfig, data: EngineData, ctx: TranslationContext): TDocumentDefinitions {
  const ordered = [...cfg.sections].filter(s => s.visible && s.key !== 'footer').sort((a, b) => a.order - b.order);
  const content: Content[] = [];
  for (const s of ordered) {
    const renderer = (SECTION_RENDERERS as any)[s.key];
    if (renderer) content.push(renderer(s, data, ctx) as Content);
  }
  const footerSection = cfg.sections.find(s => s.key === 'footer' && s.visible);
  return {
    pageSize: cfg.paper.size === 'Letter' ? 'LETTER' : 'A4',
    pageOrientation: cfg.paper.orientation,
    pageMargins: cfg.paper.margins,
    defaultStyle: { font: ctx.fontFamily },
    styles: getStylesWithFont(ctx.fontFamily),
    content,
    ...(footerSection ? { footer: renderFooter(footerSection, data, ctx) } : {}),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/engine/renderTemplate.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Run the full engine suite + typecheck**

Run: `npx vitest run src/lib/pdf/engine/ && npm run build 2>&1 | tail -5`
Expected: all engine tests PASS; tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/engine/renderTemplate.ts src/lib/pdf/engine/renderTemplate.test.ts
git commit -m "feat(pdf-engine): renderTemplate assembler over shared section renderers"
```

---

## M3 — Pilot end-to-end: Invoice fully template-driven + version pinning + minimal Settings hook

**Goal:** Make the Invoice document flow entirely through the engine, wire `templateService` to the new tables (read deployed version, pin on issue), and prove parity against the M2.1 golden baseline. **No migration / RLS / Storage / payment changes** — only reads/writes to the M1 tables already approved.

**Files:**
- Create: `src/lib/pdf/templateService.ts`
- Modify: `src/lib/pdf/pdfService.ts:387-487` (`generateInvoice`) + `:937-980` (`generateInvoiceAsBlob`) — route through resolver + `renderTemplate`
- Modify: `src/lib/queryKeys.ts` — add `pdfTemplates`, `brandingThemes` keys
- Modify: `src/lib/pdf/dataFetcher.ts` — add an adapter mapping `InvoiceDocumentData` → `EngineData`
- Test: `src/lib/pdf/templateService.test.ts`, `src/lib/pdf/engine/invoiceParity.test.ts`

### Task M3.1 — `templateService.ts`: read deployed version + resolve + pin

- [ ] **Step 1: Write the failing test (mock supabase)**

Create `src/lib/pdf/templateService.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveDocTemplate } from './templateService';

it('falls back to built-in default when no tenant template exists', async () => {
  const cfg = await resolveDocTemplate('invoice', { fetchDeployed: async () => null, fetchTheme: async () => null });
  expect(cfg.paper.size).toBe('A4');           // built-in default survives
  expect(cfg.sections.find(s => s.key === 'lineItems')?.visible).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/templateService.test.ts`
Expected: FAIL — `resolveDocTemplate` not defined.

- [ ] **Step 3: Implement `templateService.ts`**

```ts
import { supabase } from '../supabaseClient';
import type { DocumentType } from './types';
import type { TemplateConfig } from './engine/templateConfig';
import { getDefaultConfig } from './engine/templateConfig';
import { resolveTemplate } from './engine/resolveTemplate';

interface Deps {
  fetchDeployed?: (docType: DocumentType) => Promise<Partial<TemplateConfig> | null>;
  fetchTheme?: () => Promise<Partial<TemplateConfig> | null>;
}

async function defaultFetchDeployed(docType: DocumentType): Promise<Partial<TemplateConfig> | null> {
  const { data: tpl } = await supabase.from('document_templates_pdf')
    .select('id, branding_theme_id, document_template_versions!inner(config, is_deployed)')
    .eq('document_type', docType).is('deleted_at', null).eq('is_default', true).maybeSingle();
  const ver = (tpl as any)?.document_template_versions?.find?.((v: any) => v.is_deployed);
  return ver?.config ?? null;
}

export async function resolveDocTemplate(docType: DocumentType, deps: Deps = {}): Promise<TemplateConfig> {
  const builtin = getDefaultConfig(docType);
  const theme = (await (deps.fetchTheme?.() ?? Promise.resolve(null))) ?? undefined;
  const docTypeCfg = (await (deps.fetchDeployed ?? defaultFetchDeployed)(docType)) ?? undefined;
  return resolveTemplate({ builtin, theme, docType: docTypeCfg });
}

export async function pinVersionOnIssue(table: 'invoices'|'quotes'|'case_reports', rowId: string, versionId: string): Promise<void> {
  await supabase.from(table).update({ template_version_id: versionId }).eq('id', rowId).is('template_version_id', null);
}
```
Note: `pinVersionOnIssue` writes only the additive `template_version_id` column from M1; it is **not** a payment/RLS change. It is no-op-on-conflict (`is(... null)`) to preserve lock-on-finalize.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/templateService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/templateService.ts src/lib/pdf/templateService.test.ts
git commit -m "feat(pdf-engine): templateService resolve deployed version + pin-on-issue"
```

### Task M3.2 — Route Invoice through the engine with parity proof

- [ ] **Step 1: Write the parity test (engine output ≈ golden baseline)**

Create `src/lib/pdf/engine/invoiceParity.test.ts` that builds the same `InvoiceDocumentData` fixture from M2.1, runs it through the new path (`resolveDocTemplate('invoice')` with `fetchDeployed: async()=>null` → adapter → `renderTemplate`), and asserts the rendered content still contains `TAX INVOICE`, `INV-0042`, `1500.00 AED`, customer `Acme Labs`, and page size `A4` / margins `[35,30,35,95]`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/invoiceParity.test.ts`
Expected: FAIL — adapter not yet wired.

- [ ] **Step 3: Add the `InvoiceDocumentData → EngineData` adapter in `dataFetcher.ts` and re-wire `generateInvoice`**

In `dataFetcher.ts` add `export function toInvoiceEngineData(d: InvoiceDocumentData): EngineData` mapping party/items/currency/totals/title from the existing `InvoiceDocumentData`. In `pdfService.ts:387-487`, replace the `buildInvoiceDocument(...)` call with:
```ts
const cfg = await resolveDocTemplate('invoice');
const engineData = toInvoiceEngineData(data);
const docDefinition = renderTemplate(cfg, engineData, ctx);
```
Keep `logoBase64`/`qrCodeBase64` flowing via `engineData.branding`. Leave `buildInvoiceDocument` in place (not yet deleted) so the characterization test stays green until M5 sweep.

- [ ] **Step 4: Run parity + characterization + typecheck**

Run: `npx vitest run src/lib/pdf/engine/ && npm run build 2>&1 | tail -5`
Expected: parity PASS; characterization PASS; tsc 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdfService.ts src/lib/pdf/dataFetcher.ts src/lib/pdf/engine/invoiceParity.test.ts
git commit -m "feat(pdf-engine): route invoice generation through the engine with parity"
```

---

## M4 — Settings → Documents UI (gallery, editor tabs, label dictionary, versioning, live preview)

**Goal:** Ship the admin UI to create/edit/version templates with a non-destructive live preview against a real chosen record. **UI milestone — load `ui-ux-pro-max` + `frontend-design` per the CLAUDE.md skill gate before building.** Honor `DESIGN.md` tokens (no new tokens, no glassmorphism, no purple/indigo/violet, no raw hex). No migration / RLS / payment changes.

**Files:**
- Create: `src/pages/settings/DocumentTemplatesPage.tsx`
- Create: `src/components/settings/documents/TemplateGallery.tsx`, `TemplateEditor.tsx`, `SectionsTab.tsx`, `LabelsLanguageTab.tsx`, `PageSetupTab.tsx`, `BrandingTab.tsx`, `LabelDictionaryEditor.tsx`, `LivePreviewPane.tsx`
- Modify: `src/App.tsx:241-256` — add `<Route path="documents" ... DocumentTemplatesPage />` inside the `ADMIN_ROLES` settings block (next to `report-sections`)
- Modify: `src/pages/settings/SettingsDashboard.tsx` — add a "Documents" card next to Appearance/Report Sections
- Test: `src/components/settings/documents/SectionsTab.test.tsx`

- [ ] **Step 1: Load UI skills**

Invoke `ui-ux-pro-max` and `frontend-design` skills. Announce: `Loading ui-ux-pro-max + frontend-design per CLAUDE.md skill gate.`

- [ ] **Step 2: Write the failing test for the SectionsTab toggle behavior**

Create `src/components/settings/documents/SectionsTab.test.tsx` asserting that toggling a section visibility checkbox calls `onChange` with the updated `TemplateConfig` (section `visible` flipped), and reordering updates `order`.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/components/settings/documents/SectionsTab.test.tsx`
Expected: FAIL — component not defined.

- [ ] **Step 4: Build the gallery + editor + live preview**

- `TemplateGallery`: cards per `DocumentType`, Default badge, Duplicate / Reset-to-default actions (semantic tokens only).
- `TemplateEditor`: split pane — left tabbed field-toggle form (`BrandingTab`, `SectionsTab`, `LabelsLanguageTab`, `PageSetupTab`), right `LivePreviewPane`.
- `LivePreviewPane`: pick a real record (e.g. latest invoice), call `resolveDocTemplate` with the in-editor config as the `instance` override, run `renderTemplate`, render the pdfmake blob in an `<iframe>` — non-destructive (never writes, never pins).
- `LabelDictionaryEditor`: source/target (EN/AR) side-by-side rows; missing target shown visibly.
- Versioning controls: Save→new version, Publish (flip `is_deployed`), Rollback (re-point); "issued docs pinned" indicator.

- [ ] **Step 5: Run test + typecheck + lint**

Run: `npx vitest run src/components/settings/documents/ && npm run build 2>&1 | tail -5 && npm run lint 2>&1 | tail -10`
Expected: tests PASS; tsc 0 errors; no banned-token / raw-hex lint errors.

- [ ] **Step 6: Verify against DESIGN.md (skill gate)**

Confirm: zero `bg-purple-*`/`indigo`/`violet`, zero raw brand hex, only the 14 semantic tokens, no glassmorphism. Use `verification-before-completion`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/settings/DocumentTemplatesPage.tsx src/components/settings/documents/ src/App.tsx src/pages/settings/SettingsDashboard.tsx
git commit -m "feat(pdf-engine): Settings -> Documents template editor with live preview"
```

---

## M5 — Roll remaining existing docs onto the engine

**Goal:** Migrate the other 10 builders (Quote, Payment Receipt, Office Receipt, Customer Copy, Checkout Form, Case Label, Stock Label, Chain of Custody, Payslip, Credit Note) onto `renderTemplate`, each guarded by a characterization test first. **No migration / RLS / payment changes.**

**Files (per doc, repeat the pattern):**
- Test: `src/lib/pdf/engine/<doc>Characterization.test.ts` (golden baseline before changing)
- Modify: `src/lib/pdf/dataFetcher.ts` — add `to<Doc>EngineData` adapter
- Modify: `src/lib/pdf/pdfService.ts` — route `generate<Doc>` / `generate<Doc>AsBlob` through `resolveDocTemplate` + `renderTemplate`
- Modify (delete only after parity green): the corresponding `src/lib/pdf/documents/<Doc>Document.ts`

- [ ] **Step 1: For EACH of the 10 docs — write a characterization test capturing current output**

Pattern (Quote shown): build a synthetic `QuoteDocumentData` (`quote_number: 'QTE-0007'`, one item `Logical recovery` `750`, `accounting_locales AED/after/2`), call current `buildQuoteDocument`, snapshot key strings (`QUOTATION`, `QTE-0007`, `750.00 AED`). Run to confirm PASS against current code.

- [ ] **Step 2: Add the `EngineData` adapter + section coverage**

Add `to<Doc>EngineData` in `dataFetcher.ts`. For docs needing sections not yet present (custody → `custodyLog`, report → `sectionList`, labels → `qr`-only minimal layout, payslip → a `lineItems`-style component table), confirm those renderers (built in M2.4) cover the case; extend the renderer only if a real field is missing.

- [ ] **Step 3: Route through the engine + parity test**

Re-wire `generate<Doc>` in `pdfService.ts` to `resolveDocTemplate(docType)` → adapter → `renderTemplate`. Add `<doc>Parity.test.ts` asserting the engine output contains the same key strings as the characterization snapshot.

- [ ] **Step 4: Run characterization + parity per doc**

Run: `npx vitest run src/lib/pdf/engine/`
Expected: every characterization + parity PASS.

- [ ] **Step 5: Delete the now-dead builder once its parity is green**

Remove `src/lib/pdf/documents/<Doc>Document.ts` and its import in `pdfService.ts`. Keep `ReportDocument.ts`/`reportPDFService.ts` last (it has the most bespoke section logic; route via `sectionList`).

- [ ] **Step 6: Full suite + typecheck + lint after all 10**

Run: `npx vitest run src/lib/pdf && npm run build 2>&1 | tail -5 && npm run lint 2>&1 | tail -10`
Expected: all PASS; tsc 0 errors; lint clean.

- [ ] **Step 7: Commit (one commit per doc)**

```bash
git add -A
git commit -m "feat(pdf-engine): route <doc> through engine, remove legacy builder"
```

---

## M6 ⚠ APPROVAL GATE — Bilingual / RTL (fix null bug, real bidi/RTL, dictionary, Arabic amount-in-words)

**Goal:** Light up true EN/AR output: fix the `null`-Arabic-title bug, make `bilingual_sidebyside`/`ar` mirror columns + right-align via a bidi pass, wire the tenant label dictionary, add Arabic amount-in-words for GCC invoices. **Gate:** this is the named RTL decision point — if bidi proves intractable in pdfmake, STOP and present the HTML→Chromium off-ramp evaluation to the user before proceeding (no new renderer is adopted without approval).

**Files:**
- Create: `src/lib/pdf/engine/bidi.ts` (bidi/shaping pass + `amountInWordsAr`)
- Modify: `src/lib/pdf/engine/sections/*.ts` — apply RTL column-reversal + right-align when `mode==='ar'` or `mode==='bilingual_sidebyside'`
- Modify: `src/lib/pdf/translationContext.ts` — stop ignoring `isRTL`; thread per-doc `language.mode` (currently global)
- Modify: `src/lib/pdf/documentTranslations.ts` — make label lookup fall back to tenant dictionary, print missing key visibly
- Test: `src/lib/pdf/engine/bidi.test.ts`, `src/lib/pdf/engine/rtl.test.ts`

- [ ] **Step 1: Write failing bidi + amount-in-words tests**

Create `src/lib/pdf/engine/bidi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { amountInWordsAr, shapeRtl } from './bidi';

it('renders Arabic amount-in-words for an invoice total', () => {
  expect(amountInWordsAr(1575, 'درهم')).toContain('درهم'); // contains currency word
});

it('reverses visual order for an RTL string segment', () => {
  expect(typeof shapeRtl('فاتورة ضريبية')).toBe('string');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/bidi.test.ts`
Expected: FAIL — `bidi.ts` not defined.

- [ ] **Step 3: Implement bidi + amount-in-words; fix the null-title bug**

Implement `shapeRtl` (bidi reordering over the embedded Noto/Tajawal glyphs — evaluate `@digicole/pdfmake-rtl` fork first; if adopted, record the dependency decision and run it past the gate) and `amountInWordsAr`. In the section renderers, when `mode` is RTL: reverse `columns` order, set `alignment: 'right'`, and pass titles through `shapeRtl`. Fix the spec's `null`-Arabic-title bug: the engine now always supplies the AR title from `config.labels.documentTitle.ar`, so `createBilingualInfoBox`/side-by-side helpers receive a real Arabic string instead of `null`.

- [ ] **Step 4: Write the RTL render test**

Create `rtl.test.ts`: render an invoice config with `language.mode: 'bilingual_sidebyside'` and assert the rendered content contains the Arabic title `فاتورة ضريبية`, an Arabic line-item label, and that the totals block includes the Arabic amount-in-words string.

- [ ] **Step 5: Run bidi + rtl + full engine suite**

Run: `npx vitest run src/lib/pdf/engine/`
Expected: PASS.

- [ ] **Step 6: GATE — RTL fidelity decision**

If RTL output is visually correct, proceed. If pdfmake bidi is broken beyond the fork's reach, STOP: present the HTML→Chromium off-ramp (cost, where it changes the renderer, what stays) and wait for the user's explicit decision before adopting any new renderer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/engine/bidi.ts src/lib/pdf/engine/sections/ src/lib/pdf/translationContext.ts src/lib/pdf/documentTranslations.ts src/lib/pdf/engine/bidi.test.ts src/lib/pdf/engine/rtl.test.ts
git commit -m "feat(pdf-engine): bilingual/RTL — bidi pass, Arabic amount-in-words, dictionary"
```

---

## M7 — Branding/theme polish (accent opt-in, multi-logo / branch)

**Goal:** Make `branding_themes` first-class: reuse `GeneralSettings` logo upload, add bounded opt-in accent (still default neutral per `DESIGN.md`), multi-logo per branch. **No migration beyond M1 columns / no payment changes.** UI milestone — keep `ui-ux-pro-max` + `frontend-design` standards.

**Files:**
- Modify: `src/lib/pdf/templateService.ts` — `fetchTheme` reads `branding_themes`
- Modify: `src/components/settings/documents/BrandingTab.tsx` — theme picker + accent opt-in toggle + per-branch logo
- Modify: `src/lib/pdf/engine/sections/header.ts`, `footer.ts` — honor `branding.accent` only when explicitly set (default stays `PDF_COLORS` neutral)
- Test: `src/lib/pdf/engine/sections/header.test.ts` (accent applied only when opted in)

- [ ] **Step 1: Write the failing test**

Assert `renderHeader` uses `PDF_COLORS.primaryDark` when `branding.accent === 'inherit'` and the supplied hex only when `branding.accent` is an explicit `#hex` AND the theme opt-in flag is true.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/sections/header.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement accent opt-in (bounded, default neutral)**

Header/footer read `branding.accent`; if `'inherit'` → keep neutral `PDF_COLORS`. Never theme from the live app theme; PDFs stay neutral unless the tenant explicitly opts a single accent in.

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npx vitest run src/lib/pdf/engine/ && npm run lint 2>&1 | tail -5 && npm run build 2>&1 | tail -5`
Expected: PASS; lint clean; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/templateService.ts src/components/settings/documents/BrandingTab.tsx src/lib/pdf/engine/sections/
git commit -m "feat(pdf-engine): branding themes — opt-in accent, multi-logo/branch"
```

---

## M8 ⚠ APPROVAL GATE — Net-new accounting / financial + lab-legal documents

**Goal:** Build the Phase-2 document family (several touch payments → each needs its own approval). **Gate:** any document that reads/affects payment, allocation, refund, or release state requires explicit per-document approval AND must not introduce a payment-side effect from the PDF layer (PDFs are read-only renderings). Also revisit "store issued forensic PDFs" decision here.

**Documents (each = its own characterization → engine → parity cycle, like M5):** Refund receipt, Recurring invoice, Credit/Debit note (extend existing), Sales order, Purchase order, Delivery/packing slip, Customer/Vendor statement, Vouchers (payment/receipt/contra/journal), Journal entries, General ledger / sub-ledgers / trial balance, Balance sheet / P&L / Cash flow, VAT/Tax return, Aging report; lab-legal: NDA, Certificate of Destruction, Recoverability assessment, Data-delivery/file manifest + customer-acceptance gate, Destructive-attempt consent.

**Files (per doc):**
- Modify: `src/lib/pdf/types.ts` — add the doc to `DocumentType` + its data interface
- Create: `src/lib/pdf/engine/sections/<newSection>.ts` only if a genuinely new section is needed (e.g. `ledgerTable`, `statementAging`)
- Modify: `src/lib/pdf/dataFetcher.ts` — `fetch<Doc>Data` + `to<Doc>EngineData`
- Modify: `src/lib/pdf/pdfService.ts` — `generate<Doc>`

- [ ] **Step 1: GATE — list payment-touching docs and get per-doc approval**

Enumerate which docs read payment/allocation/release tables (refund receipt, vouchers, statements). Present to the user; proceed only on the approved subset. Confirm the PDF layer is read-only (no payment writes).

- [ ] **Step 2: For each approved doc — characterization (if a builder exists) or golden-fixture test**

Write a golden test asserting required fields render (e.g. Certificate of Destruction must render device serials + destruction method + signatory; statement must render aging buckets + running balance).

- [ ] **Step 3: Implement section(s) + adapter + generate function**

Add only the new sections that don't already exist; reuse `lineItems`/`totals`/`party`/`header`/`footer`/`signature` wherever possible.

- [ ] **Step 4: Run per-doc tests + typecheck + lint**

Run: `npx vitest run src/lib/pdf && npm run build 2>&1 | tail -5 && npm run lint 2>&1 | tail -5`
Expected: PASS; tsc 0; lint clean.

- [ ] **Step 5: Decision — store issued forensic PDFs?**

Present the "store issued forensic/financial PDFs for audit" option (uses `pdf_generation_logs.file_url`/`file_size`, currently unused + the `company-assets` Storage bucket). This is a Storage change → requires approval before implementation.

- [ ] **Step 6: Commit (per doc)**

```bash
git add -A
git commit -m "feat(pdf-engine): add <doc> document to the engine"
```

---

## M9 — QA: golden-PDF snapshots, RTL/long-Arabic/12-drive-RAID fixtures, characterization tests

**Goal:** Lock the engine behind a durable test wall so future edits can't silently regress documents. **No migration / RLS / payment changes.**

**Files:**
- Create: `src/lib/pdf/engine/__fixtures__/` — synthetic records (12-drive RAID invoice, long-Arabic terms, multi-currency, zero-item, max-line-item)
- Create: `src/lib/pdf/engine/golden.test.ts` — snapshot the assembled `TDocumentDefinitions` (deterministic JSON, no timestamps) per doc type × language mode
- Modify: `package.json` / CI config — ensure `vitest run src/lib/pdf` is in the test gate

- [ ] **Step 1: Write the golden-snapshot tests**

Create `golden.test.ts`: for each `DocumentType` × `{en, ar, bilingual_sidebyside}`, render with a fixed fixture and `toMatchSnapshot()` on the JSON-stable doc-definition (strip any date fields by injecting a fixed `formatDate`).

- [ ] **Step 2: Run to generate baselines**

Run: `npx vitest run src/lib/pdf/engine/golden.test.ts -u`
Expected: snapshots written.

- [ ] **Step 3: Add edge fixtures**

Add the 12-drive RAID case (custody log + multi-device), a long-Arabic-terms invoice (RTL overflow), a multi-currency statement, and a zero-item quote. Assert they render without throwing and contain expected anchors.

- [ ] **Step 4: Run full PDF suite + typecheck + lint as the final gate**

Run: `npx vitest run src/lib/pdf && npm run build 2>&1 | tail -5 && npm run lint 2>&1 | tail -10`
Expected: all PASS; tsc 0; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/engine/__fixtures__ src/lib/pdf/engine/golden.test.ts package.json
git commit -m "test(pdf-engine): golden snapshots + RTL/RAID/multi-currency fixtures"
```

---

## Self-review (run before handoff)

**Spec coverage:** M0 (spec/plan/migration draft/call-site map) ✓; M1 (migration+RLS+Storage+Report Studio RLS fix) ✓; M2 (assembler+sections+resolver+pinning, header extracted first) ✓; M3 (invoice pilot+editor hook+preview) ✓; M4 (gallery/editor tabs/dictionary/versioning) ✓; M5 (remaining docs) ✓; M6 (bilingual/RTL+null-bug fix+amount-in-words+HTML off-ramp gate) ✓; M7 (accent opt-in/multi-logo) ✓; M8 (net-new accounting+lab-legal+store-PDF decision) ✓; M9 (golden/RTL/RAID fixtures) ✓. Locked decisions (keep pdfmake / new schema / field-toggle+cascade / DESIGN.md neutral / v1 existing-docs / Phase-2 accounting) reflected in header + per-milestone scope notes.

**Approval gates:** M1, M6, M8 explicitly marked ⚠ with a gate procedure that halts before any migration/RLS/Storage/payment/renderer change.

**Type consistency:** `TemplateConfig`/`SectionConfig`/`SectionKey`/`LangMode` defined once in `templateConfig.ts` and reused in `resolveTemplate.ts`, `renderTemplate.ts`, sections, and `templateService.ts`. `renderTemplate(config, data, ctx)` signature is stable across M2–M9. `EngineData` introduced in `renderTemplate.ts` and consumed by every `to<Doc>EngineData` adapter. `resolveDocTemplate(docType, deps)` and `pinVersionOnIssue(table, rowId, versionId)` signatures stable from M3 on.
