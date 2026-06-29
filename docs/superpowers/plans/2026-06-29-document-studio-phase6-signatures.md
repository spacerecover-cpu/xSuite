# Document Studio — Phase 6 (Signature Capture + Embedding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let staff capture a signature (typed / drawn / uploaded / click-to-accept) at the approval step, persist it as a forensic `document_signatures` row, and **embed** the captured signature into the rendered PDF — including operator + witness signatures on the data-destruction certificate.

**Architecture:** The `document_signatures` table, enums, and RPCs already exist (Phase 2). This phase is **code-only, no migration**. We add: (1) a typed `EngineDocData.signatureBlocks` field + renderer support so the PDF engine draws captured signatures (image / typed text / accepted line) and falls back to wet-ink lines for unsigned slots; (2) a `documentSignatureService` (staff INSERT — allowed by the `is_staff_user()` RLS policy — plus fetch + image→dataURL resolution); (3) a dependency-free `SignatureCaptureModal`; (4) wiring into the existing `DocumentDraftReview` approve step (and operator+witness for destruction certs). Signature images resolve to base64 data URLs via the existing `loadImageAsBase64` so pdfmake can embed them.

**Tech Stack:** React 18 + TS, TanStack Query, Supabase (Storage + the existing append-only `document_signatures` table), pdfmake engine, Vitest (node + jsdom). No new npm packages — drawn capture uses a plain HTML5 `<canvas>`.

## Global Constraints

- **No migration / no schema change.** Use the EXISTING `signature_slot` enum values only: `'approver'` (staff approval), `'engineer'` (destruction operator), `'witness'` (destruction witness), `'customer'` (Phase 9, not here). There is NO `'operator'` slot — the destruction "Operator" display label maps to the `'engineer'` slot.
- **No new npm dependency.** Drawn signatures use a plain `<canvas>` + pointer events. Do not add `signature_pad`/`react-signature-canvas`.
- **document_signatures is append-only** (UPDATE/DELETE blocked by `prevent_audit_mutation`) with a UNIQUE `(document_instance_id, slot)` partial index — each slot can be signed once. The UI must check for an existing signature and not attempt to re-insert the same slot.
- **Staff INSERT is direct** (RLS `document_signatures_insert WITH CHECK (is_staff_user())`); customers use the `portal_sign_off_document` RPC (Phase 9 — out of scope here).
- **`signer_name` is NOT NULL** — resolve it from the current user's `profiles.full_name`.
- **Flag-gated:** all new surfaces are reachable only through the already-flag-gated `DocumentDraftReview` (`isDocStudioEnabled()`). Engine changes are additive and inert unless `signatureBlocks` is populated.
- **Defaults byte-identical:** with no `signatureBlocks`, the engine renders exactly as today (wet-ink lines). The report parity + golden suites must stay green.
- **Phase-4 untouched:** do not change the second-person / artifact gates in `transition_document_instance`. Signatures are captured BEFORE calling `transitionDocument`; do not add a DB evidence gate in this phase (noted as a follow-up).
- **Types/tokens:** `Database` from `src/types/database.types.ts`; `maybeSingle()` not `single()`; semantic tokens / slate neutrals only (no raw hex / purple-indigo-violet).
- **Per-task gates:** `npm run typecheck` = 0 and the task's vitest file green before commit; `npx vitest run src/lib/pdf` green after any engine change. Commit locally only — DO NOT push. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

**Create:**
- `src/lib/documentSignatureService.ts` — staff signature INSERT, fetch by instance, and `resolveSignatureBlocks(instanceId)` → `SignatureBlockData[]` (image paths resolved to data URLs). (+ `.test.ts`)
- `src/components/cases/SignatureCaptureModal.tsx` — capture UI (typed/drawn/uploaded/click-to-accept). (+ `.test.tsx`)

**Modify:**
- `src/lib/pdf/engine/types.ts` — add `SignatureBlockData` + `EngineDocData.signatureBlocks?`.
- `src/lib/pdf/engine/sections/signature.ts` — render captured `signatureBlocks` (image/typed/accepted) above the wet-ink line.
- `src/lib/pdf/engine/sections/reportSections.ts` — `destructionSignatures(data, language)` embeds operator(`engineer`)/witness captured signatures; unsigned → wet-ink.
- `src/lib/documentInstanceData.ts` — `InstanceReportContext.signatureBlocks?` threaded into the mapped `ReportData`/engine data.
- `src/lib/documentInstanceData.fetch.ts` — fetch signatures + resolve to `signatureBlocks` for rendering.
- `src/lib/pdf/engine/adapters/reportAdapter.ts` — pass `data.signatureBlocks` (from ReportData) into `EngineDocData` (so `toEngineData` forwards them).
- `src/lib/pdf/documents/ReportDocument.ts` — add `signatureBlocks?` to the `ReportData` type (the render input).
- `src/components/cases/DocumentDraftReview.tsx` — capture approver signature (and operator+witness for destruction certs) before `transitionDocument(..., 'approved', { signatureId })`.

---

## Task 1: `SignatureBlockData` type + `EngineDocData.signatureBlocks`

**Files:**
- Modify: `src/lib/pdf/engine/types.ts`
- Modify: `src/lib/pdf/documents/ReportDocument.ts`
- Test: `src/lib/pdf/engine/signatureBlocks.types.test.ts` (create — a compile/shape guard)

**Interfaces:**
- Produces:
  ```ts
  export interface SignatureBlockData {
    slot: string;            // 'approver' | 'engineer' | 'witness' | 'customer' | ...
    name?: string;           // signer_name
    role?: string;           // signer_role (display, e.g. 'Operator', 'Witness', 'Approver')
    method?: 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';
    imageDataUrl?: string;   // base64 data URL for drawn/uploaded (embeddable by pdfmake)
    typedValue?: string;     // for method 'typed'
    signedAt?: string;       // ISO timestamp
  }
  ```
  added to `EngineDocData` as `signatureBlocks?: SignatureBlockData[]` and to `ReportData` as `signatureBlocks?: SignatureBlockData[]`.

- [ ] **Step 1: Write the failing shape test**

Create `src/lib/pdf/engine/signatureBlocks.types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { EngineDocData, SignatureBlockData } from './types';

describe('SignatureBlockData / EngineDocData.signatureBlocks', () => {
  it('accepts a populated signatureBlocks array on EngineDocData', () => {
    const block: SignatureBlockData = {
      slot: 'approver', name: 'Tech A', role: 'Approver',
      method: 'drawn', imageDataUrl: 'data:image/png;base64,AAA', signedAt: '2026-06-29T00:00:00Z',
    };
    const data: Partial<EngineDocData> = { signatureBlocks: [block] };
    expect(data.signatureBlocks?.[0].slot).toBe('approver');
    expect(data.signatureBlocks?.[0].method).toBe('drawn');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/pdf/engine/signatureBlocks.types.test.ts`
Expected: FAIL — `SignatureBlockData` not exported.

- [ ] **Step 3: Add the type + fields**

In `src/lib/pdf/engine/types.ts`, add the `SignatureBlockData` interface (near the other shared shapes) and add to the `EngineDocData` interface (next to the existing `signatures?: LabelText[];`):

```ts
export interface SignatureBlockData {
  slot: string;
  name?: string;
  role?: string;
  method?: 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';
  imageDataUrl?: string;
  typedValue?: string;
  signedAt?: string;
}
```
```ts
  /** Captured signatures to EMBED (Phase 6). Empty/undefined → wet-ink lines only. */
  signatureBlocks?: SignatureBlockData[];
```

In `src/lib/pdf/documents/ReportDocument.ts`, add to the `ReportData` type:
```ts
  signatureBlocks?: import('../engine/types').SignatureBlockData[];
```
(or import the type at the top and reference it directly, matching the file's existing import style.)

- [ ] **Step 4: Run the shape test to confirm it passes**

Run: `npx vitest run src/lib/pdf/engine/signatureBlocks.types.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + parity (additive, no behavior change)**

Run: `npm run typecheck` → 0. Run: `npx vitest run src/lib/pdf` → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/engine/types.ts src/lib/pdf/documents/ReportDocument.ts src/lib/pdf/engine/signatureBlocks.types.test.ts
git commit -m "feat(pdf): add SignatureBlockData + EngineDocData.signatureBlocks (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Render captured signatures in the signature section

**Files:**
- Modify: `src/lib/pdf/engine/sections/signature.ts`
- Test: `src/lib/pdf/engine/sections/signature.signatureBlocks.test.ts` (create)

**Interfaces:**
- Consumes: `EngineDocData.signatureBlocks` (Task 1), `buildLogoNode` (`src/lib/pdf/brandingImage.ts`), `createSignatureBlock` (`styles.ts`).
- Produces: enhanced `renderSignature` that, when `data.signatureBlocks` has entries, renders for each: the captured image (drawn/uploaded via `buildLogoNode(imageDataUrl, {width:120})`), or the `typedValue` in a script-ish style, or an "Accepted by …" line (click_to_accept), with `name`/`role`/`signedAt` beneath — and still renders wet-ink lines for any default/unsigned slots. With NO `signatureBlocks`, output is byte-identical to today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/sections/signature.signatureBlocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderSignature } from './signature';
import type { EngineContext } from '../types';

// Minimal engine context — language english, no stamp/sig company images.
const engine = {
  config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
  stampImage: null,
  signatureImage: null,
} as unknown as EngineContext;

function flatten(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  if (typeof o.image === 'string') out.push(`IMG:${o.image.slice(0, 16)}`);
  for (const v of Object.values(o)) flatten(v, out);
}

describe('renderSignature — captured signatureBlocks', () => {
  it('embeds a drawn signature image + signer name for a signed slot', () => {
    const def = renderSignature(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', role: 'Approver', method: 'drawn', imageDataUrl: 'data:image/png;base64,AAAABBBBCCCC' }],
    } as never);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.some((t) => t.startsWith('IMG:data:image/png'))).toBe(true);
    expect(texts).toContain('Tech A');
  });

  it('renders a typed signature value as text', () => {
    const def = renderSignature(engine, {
      signatureBlocks: [{ slot: 'approver', name: 'Tech A', method: 'typed', typedValue: 'Tech A' }],
    } as never);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts).toContain('Tech A');
  });

  it('with no signatureBlocks renders the default wet-ink labels (unchanged)', () => {
    const def = renderSignature(engine, {} as never);
    const texts: string[] = [];
    flatten(def, texts);
    // default labels still present (e.g. "Received by"/"Authorized by")
    expect(texts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/pdf/engine/sections/signature.signatureBlocks.test.ts`
Expected: FAIL — the image/name are not rendered (current renderer ignores `signatureBlocks`).

- [ ] **Step 3: Enhance `renderSignature`**

In `src/lib/pdf/engine/sections/signature.ts`, before the default wet-ink mapping, branch on `data.signatureBlocks`. Read the current file to match its structure; add a helper that turns one `SignatureBlockData` into a stack:

```ts
import { buildLogoNode } from '../../brandingImage';
// ...
function capturedBlock(b: SignatureBlockData): object {
  const parts: object[] = [];
  if ((b.method === 'drawn' || b.method === 'uploaded_image') && b.imageDataUrl) {
    parts.push(buildLogoNode(b.imageDataUrl, { width: 120, alignment: 'left', margin: [0, 0, 0, 2] }));
  } else if (b.method === 'typed' && b.typedValue) {
    parts.push({ text: b.typedValue, italics: true, fontSize: 13, margin: [0, 6, 0, 2] });
  } else if (b.method === 'click_to_accept') {
    parts.push({ text: `Accepted${b.name ? ` by ${b.name}` : ''}`, fontSize: 9, margin: [0, 10, 0, 2] });
  }
  parts.push({ canvas: [{ type: 'line', x1: 0, y1: 2, x2: 160, y2: 2, lineWidth: 0.5, lineColor: PDF_COLORS.textLight }] });
  const labelBits = [b.role || b.slot, b.name].filter(Boolean).join(' — ');
  parts.push({ text: labelBits, style: 'signatureLabel', margin: [0, 3, 0, 0] });
  if (b.signedAt) parts.push({ text: b.signedAt, fontSize: 7, color: PDF_COLORS.textLight });
  return { stack: parts, width: 180 };
}
```

When `data.signatureBlocks?.length`, build the signature columns from `capturedBlock(...)` (chunk into rows of up to 2-3 across, matching the existing layout width); otherwise keep the existing default-label path exactly. Preserve the company stamp/signature-image rendering that already exists.

> Note: import `SignatureBlockData` and `PDF_COLORS` consistent with the file's existing imports. Confirm `buildLogoNode` accepts a base64 data URL string (per ENGINE_SIG extract it handles base64 + cloud URLs).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/pdf/engine/sections/signature.signatureBlocks.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Parity + typecheck**

Run: `npx vitest run src/lib/pdf` → green (no `signatureBlocks` in existing fixtures ⇒ defaults unchanged). Run: `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/engine/sections/signature.ts src/lib/pdf/engine/sections/signature.signatureBlocks.test.ts
git commit -m "feat(pdf): embed captured signatures in the signature section (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Embed operator/witness signatures on the destruction certificate

**Files:**
- Modify: `src/lib/pdf/engine/sections/reportSections.ts`
- Test: `src/lib/pdf/engine/sections/reportSections.destruction.test.ts` (create)

**Interfaces:**
- Changes `destructionSignatures(language)` → `destructionSignatures(data, language)` (or reads `data.signatureBlocks` from the renderer scope) so the operator column embeds the `slot:'engineer'` captured signature and the witness column embeds `slot:'witness'`; unsigned slots fall back to the current wet-ink `createBilingualSignatureBlock`. The English/Arabic labels ("Operator"/"المشغّل", "Witness"/"الشاهد") are unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/sections/reportSections.destruction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderReportSections } from './reportSections';
import type { EngineContext, EngineDocData } from '../types';

const engine = { config: { language: { mode: 'en', primary: 'en' } } } as unknown as EngineContext;

function flatten(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return; }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  if (typeof o.image === 'string') out.push(`IMG:${o.image.slice(0, 10)}`);
  for (const v of Object.values(o)) flatten(v, out);
}

const data = {
  reportSections: { sections: [{ title: { en: 'Certificate of Destruction', ar: 'شهادة الإتلاف' }, content: 'Destroyed.', kind: 'destruction_certificate' }] },
  signatureBlocks: [
    { slot: 'engineer', name: 'Op One', role: 'Operator', method: 'drawn', imageDataUrl: 'data:image/png;base64,ZZZ' },
  ],
} as unknown as EngineDocData;

describe('destruction certificate signatures', () => {
  it('embeds the operator (engineer slot) captured image, witness stays wet-ink', () => {
    const def = renderReportSections(engine, data);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.some((t) => t.startsWith('IMG:data:image'))).toBe(true); // operator image embedded
    expect(texts.join(' ')).toMatch(/Witness/); // witness label still present (wet-ink fallback)
  });

  it('with no signatureBlocks renders both wet-ink lines (unchanged)', () => {
    const plain = { reportSections: { sections: [{ title: { en: 'Certificate of Destruction', ar: null }, content: 'x', kind: 'destruction_certificate' }] } } as unknown as EngineDocData;
    const def = renderReportSections(engine, plain);
    const texts: string[] = [];
    flatten(def, texts);
    expect(texts.join(' ')).toMatch(/Operator/);
    expect(texts.join(' ')).toMatch(/Witness/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/pdf/engine/sections/reportSections.destruction.test.ts`
Expected: FAIL — the operator image isn't embedded (current `destructionSignatures` ignores captured signatures).

- [ ] **Step 3: Embed captured signatures in `destructionSignatures`**

In `src/lib/pdf/engine/sections/reportSections.ts`: change `destructionSignatures` to accept the captured blocks and, per column, render the captured image (via `buildLogoNode`) + label when present, else the existing `createBilingualSignatureBlock` wet-ink. Map operator→`slot:'engineer'`, witness→`slot:'witness'`. Update the call site (where `kind === 'destruction_certificate'` pushes `destructionSignatures(language)`) to pass the blocks.

```ts
import { buildLogoNode } from '../../brandingImage';
// ...
function destructionSignatures(
  language: EngineContext['config']['language'],
  blocks?: SignatureBlockData[],
): Content {
  const bilingual = isBilingualMode(language);
  const col = (slot: string, en: string, ar: string) => {
    const b = blocks?.find((x) => x.slot === slot && (x.imageDataUrl || x.typedValue));
    if (b?.imageDataUrl) {
      return { stack: [buildLogoNode(b.imageDataUrl, { width: 130 }), { text: bilingual ? `${en}\n${ar}` : en, style: 'signatureLabel', alignment: 'center', margin: [0, 3, 0, 0] }], width: 200 } as Content;
    }
    if (b?.typedValue) {
      return { stack: [{ text: b.typedValue, italics: true, fontSize: 13, alignment: 'center', margin: [0, 6, 0, 2] }, { text: bilingual ? `${en}\n${ar}` : en, style: 'signatureLabel', alignment: 'center' }], width: 200 } as Content;
    }
    return createBilingualSignatureBlock(en, bilingual ? ar : null) as Content;
  };
  return {
    columns: [col('engineer', 'Operator', 'المشغّل'), { text: '', width: '*' }, col('witness', 'Witness', 'الشاهد')],
    margin: [0, 18, 0, 4],
  };
}
```

At the call site, thread the captured blocks (the renderer has `data` in scope):
```ts
  if (section.kind === 'destruction_certificate') {
    stack.push(destructionSignatures(language, data.signatureBlocks));
  }
```

> Note: confirm `renderReportSections`'s signature has `data: EngineDocData` in scope at the destruction-cert push (it does — it iterates `data.reportSections.sections`). Import `SignatureBlockData` + `buildLogoNode`.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/pdf/engine/sections/reportSections.destruction.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Parity + typecheck**

Run: `npx vitest run src/lib/pdf` → green (existing destruction fixtures have no `signatureBlocks` ⇒ wet-ink unchanged; the parity test that checks "Operator"/"Witness" strings still passes). Run: `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/engine/sections/reportSections.ts src/lib/pdf/engine/sections/reportSections.destruction.test.ts
git commit -m "feat(pdf): embed operator/witness signatures on the destruction certificate (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `documentSignatureService` — capture, fetch, resolve to blocks

**Files:**
- Create: `src/lib/documentSignatureService.ts`
- Test: `src/lib/documentSignatureService.test.ts`

**Interfaces:**
- Consumes: `supabase`, `fileStorageService.uploadSignature` (`src/lib/fileStorageService.ts`), `sha256Hex` (`src/lib/pdf/contentHash.ts`), `loadImageAsBase64` (the existing image→base64 helper — confirm its import path, used by reportPDFService), `SignatureBlockData` (Task 1).
- Produces:
  ```ts
  export interface CaptureStaffSignatureParams {
    instanceId: string;
    slot: 'approver' | 'qa_reviewer' | 'engineer' | 'lab_manager' | 'witness';
    method: 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';
    signerName: string;
    signerRole?: string;
    typedValue?: string;       // method 'typed'
    imageBlob?: Blob;          // method 'drawn' | 'uploaded_image'
  }
  export async function captureStaffSignature(p: CaptureStaffSignatureParams): Promise<string>; // returns signature id
  export async function listInstanceSignatures(instanceId: string): Promise<DocumentSignatureRow[]>;
  export async function resolveSignatureBlocks(instanceId: string): Promise<SignatureBlockData[]>; // images → data URLs
  ```

`captureStaffSignature`: if `imageBlob`, upload via `uploadSignature` (gets a path) + `sha256Hex(imageBlob)`; insert a `document_signatures` row (tenant_id + signer_user_id from the current user; the RLS `is_staff_user()` policy authorizes it). `resolveSignatureBlocks`: fetch rows for the instance, and for image rows turn the stored image into a base64 data URL via `loadImageAsBase64` so the engine can embed it.

- [ ] **Step 1: Write the failing service test**

Create `src/lib/documentSignatureService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, auth: { getUser } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./fileStorageService', () => ({
  uploadSignature: vi.fn(async () => ({ success: true, filePath: 'company-assets/signatures/sig.png' })),
}));
vi.mock('./pdf/contentHash', () => ({ sha256Hex: vi.fn(async () => 'deadbeef') }));

import { captureStaffSignature } from './documentSignatureService';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['insert', 'select', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  c.then = (r: (v: unknown) => unknown) => r(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('captureStaffSignature', () => {
  it('uploads a drawn image, hashes it, and inserts a staff signature row', async () => {
    let inserted: Record<string, unknown> | null = null;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      if (table === 'document_signatures') {
        const c = chain({ data: { id: 'sig-1' }, error: null });
        c.insert = vi.fn((payload: Record<string, unknown>) => { inserted = payload; return c; });
        return c;
      }
      return chain({ data: null, error: null });
    });

    const id = await captureStaffSignature({
      instanceId: 'di-1', slot: 'approver', method: 'drawn',
      signerName: 'Tech A', signerRole: 'Approver', imageBlob: new Blob(['x']),
    });

    expect(id).toBe('sig-1');
    expect(inserted).toMatchObject({
      document_instance_id: 'di-1', slot: 'approver', method: 'drawn',
      signer_user_id: 'u1', signer_name: 'Tech A', tenant_id: 't1',
      signature_image_path: 'company-assets/signatures/sig.png', signature_sha256: 'deadbeef',
    });
  });

  it('inserts a typed signature with typed_value and no upload', async () => {
    const { uploadSignature } = await import('./fileStorageService');
    let inserted: Record<string, unknown> | null = null;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return chain({ data: { tenant_id: 't1' }, error: null });
      const c = chain({ data: { id: 'sig-2' }, error: null });
      c.insert = vi.fn((p: Record<string, unknown>) => { inserted = p; return c; });
      return c;
    });
    const id = await captureStaffSignature({ instanceId: 'di-1', slot: 'approver', method: 'typed', signerName: 'Tech A', typedValue: 'Tech A' });
    expect(id).toBe('sig-2');
    expect(uploadSignature).not.toHaveBeenCalled();
    expect(inserted).toMatchObject({ method: 'typed', typed_value: 'Tech A', signature_image_path: null });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/documentSignatureService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/documentSignatureService.ts`:

```ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logger } from './logger';
import { sha256Hex } from './pdf/contentHash';
import { uploadSignature } from './fileStorageService';
import { loadImageAsBase64 } from './pdf/imageUtils'; // confirm the real path (used by reportPDFService)
import type { SignatureBlockData } from './pdf/engine/types';

export type DocumentSignatureRow = Database['public']['Tables']['document_signatures']['Row'];

async function resolveTenantId(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
  if (!data?.tenant_id) throw new Error('No active tenant');
  return data.tenant_id;
}

export interface CaptureStaffSignatureParams {
  instanceId: string;
  slot: 'approver' | 'qa_reviewer' | 'engineer' | 'lab_manager' | 'witness';
  method: 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';
  signerName: string;
  signerRole?: string;
  typedValue?: string;
  imageBlob?: Blob;
}

export async function captureStaffSignature(p: CaptureStaffSignatureParams): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  const tenantId = await resolveTenantId(user.id);

  let imagePath: string | null = null;
  let sha: string | null = null;
  if (p.imageBlob && (p.method === 'drawn' || p.method === 'uploaded_image')) {
    const file = new File([p.imageBlob], `sig-${p.instanceId}-${p.slot}.png`, { type: 'image/png' });
    const res = await uploadSignature(file);
    if (!res.success || !res.filePath) throw new Error(res.error || 'Signature upload failed');
    imagePath = res.filePath;
    sha = await sha256Hex(p.imageBlob);
  }

  const { data, error } = await supabase
    .from('document_signatures')
    .insert({
      tenant_id: tenantId,
      document_instance_id: p.instanceId,
      slot: p.slot,
      method: p.method,
      signer_user_id: user.id,
      signer_name: p.signerName,
      signer_role: p.signerRole ?? null,
      typed_value: p.method === 'typed' ? (p.typedValue ?? null) : null,
      signature_image_path: imagePath,
      signature_sha256: sha,
    })
    .select('id')
    .maybeSingle();
  if (error || !data) {
    logger.error('[documentSignatureService] insert failed:', error);
    throw error ?? new Error('Failed to record signature');
  }
  return data.id;
}

export async function listInstanceSignatures(instanceId: string): Promise<DocumentSignatureRow[]> {
  const { data, error } = await supabase
    .from('document_signatures')
    .select('*')
    .eq('document_instance_id', instanceId)
    .is('deleted_at', null)
    .order('signed_at', { ascending: true });
  if (error) { logger.error('[documentSignatureService] list failed:', error); throw error; }
  return data ?? [];
}

export async function resolveSignatureBlocks(instanceId: string): Promise<SignatureBlockData[]> {
  const rows = await listInstanceSignatures(instanceId);
  const blocks: SignatureBlockData[] = [];
  for (const r of rows) {
    let imageDataUrl: string | undefined;
    if (r.signature_image_path) {
      // Resolve the stored image to a base64 data URL so pdfmake can embed it.
      const { data: signed } = await supabase.storage
        .from(r.signature_image_bucket ?? 'company-assets')
        .createSignedUrl(r.signature_image_path, 300);
      if (signed?.signedUrl) imageDataUrl = (await loadImageAsBase64(signed.signedUrl)) ?? undefined;
    }
    blocks.push({
      slot: r.slot, name: r.signer_name, role: r.signer_role ?? undefined,
      method: r.method, imageDataUrl, typedValue: r.typed_value ?? undefined,
      signedAt: r.signed_at,
    });
  }
  return blocks;
}
```

> Notes: confirm the real import path + signature of `loadImageAsBase64` against `reportPDFService.ts` (it imports it from somewhere — match exactly; if it takes a URL and returns `string | null`, the above holds). Confirm `uploadSignature`'s return shape (`{ success, filePath, ... }`) against `fileStorageService.ts` and the bucket it writes to (`company-assets`, folder `signatures`). If `uploadSignature` returns a public URL instead of a private path, store/resolve accordingly. The insert relies on the `is_staff_user()` RLS policy — no RPC needed.

- [ ] **Step 4: Run the service test to confirm it passes**

Run: `npx vitest run src/lib/documentSignatureService.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → 0 (fix any `loadImageAsBase64`/`uploadSignature` import/shape mismatches here).

- [ ] **Step 6: Commit**

```bash
git add src/lib/documentSignatureService.ts src/lib/documentSignatureService.test.ts
git commit -m "feat(documents): documentSignatureService — staff capture + resolve to blocks (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Populate `signatureBlocks` in the instance render path

**Files:**
- Modify: `src/lib/documentInstanceData.ts` (mapper accepts `signatureBlocks`)
- Modify: `src/lib/documentInstanceData.fetch.ts` (fetch + resolve signatures)
- Modify: `src/lib/pdf/engine/adapters/reportAdapter.ts` (forward `data.signatureBlocks` → `EngineDocData`)
- Test: extend `src/lib/documentInstanceData.test.ts`

**Interfaces:**
- `InstanceReportContext` gains `signatureBlocks?: SignatureBlockData[]`; `mapInstanceToReportData` copies it onto the returned `ReportData`. `fetchInstanceReportData` calls `resolveSignatureBlocks(instanceId)` and passes it in. `toEngineData`/`toReportEngineData` forwards `data.signatureBlocks` to `EngineDocData.signatureBlocks`.

- [ ] **Step 1: Write the failing mapper test (extend existing)**

Add to `src/lib/documentInstanceData.test.ts`:

```ts
it('threads signatureBlocks from context onto ReportData', () => {
  const rd = mapInstanceToReportData(
    { id: 'di-1', case_id: 'c', document_number: 'R-1', report_subtype: 'data_destruction', title: 'Cert', status: 'draft', version_number: 1, created_at: '2026-06-02T00:00:00Z', created_by: 'u1' },
    [],
    { companySettings: {}, signatureBlocks: [{ slot: 'engineer', name: 'Op', role: 'Operator', method: 'drawn', imageDataUrl: 'data:image/png;base64,ZZ' }] },
  );
  expect(rd.signatureBlocks?.[0].slot).toBe('engineer');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/documentInstanceData.test.ts`
Expected: FAIL — `signatureBlocks` not on the context/result.

- [ ] **Step 3: Thread `signatureBlocks` through mapper + fetch + adapter**

In `src/lib/documentInstanceData.ts`: add `signatureBlocks?: SignatureBlockData[]` to `InstanceReportContext` (import the type from `./pdf/engine/types`) and add `signatureBlocks: ctx.signatureBlocks` to the returned object.

In `src/lib/documentInstanceData.fetch.ts`: import `resolveSignatureBlocks` from `./documentSignatureService`; call it and pass into the context:
```ts
const signatureBlocks = await resolveSignatureBlocks(instanceId);
return mapInstanceToReportData(instance, sections.map(...), { ...caseCtx, companySettings, signatureBlocks });
```

In `src/lib/pdf/engine/adapters/reportAdapter.ts` `toEngineData(data, config, ctx)`: add `signatureBlocks: data.signatureBlocks` to the `EngineDocData` object it returns (so the engine receives them). (Read the function's return object and add the field.)

- [ ] **Step 4: Run the mapper test + parity to confirm pass**

Run: `npx vitest run src/lib/documentInstanceData.test.ts` → PASS.
Run: `npx vitest run src/lib/pdf` → green (no signatures in fixtures ⇒ unchanged).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documentInstanceData.ts src/lib/documentInstanceData.fetch.ts src/lib/pdf/engine/adapters/reportAdapter.ts src/lib/documentInstanceData.test.ts
git commit -m "feat(documents): populate signatureBlocks in the instance render path (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `SignatureCaptureModal` (dependency-free)

**Files:**
- Create: `src/components/cases/SignatureCaptureModal.tsx`
- Test: `src/components/cases/SignatureCaptureModal.test.tsx`

**Interfaces:**
```ts
export interface CapturedSignature {
  method: 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';
  typedValue?: string;
  imageBlob?: Blob;
}
interface SignatureCaptureModalProps {
  open: boolean;
  onClose: () => void;
  title: string;                 // e.g. "Approver signature"
  onCapture: (sig: CapturedSignature) => void;  // parent persists + transitions
}
```
Four methods via a segmented control: **Typed** (text input → `{method:'typed', typedValue}`), **Drawn** (HTML5 `<canvas>` with pointer events → `canvas.toBlob` → `{method:'drawn', imageBlob}`), **Upload** (`<input type=file accept=image/*>` → `{method:'uploaded_image', imageBlob:file}`), **Accept** (checkbox → `{method:'click_to_accept'}`). Uses the project `Dialog` (`open`/`onClose`/`label`, header + width via children/className — same as DocumentDraftReview). No new npm dependency.

- [ ] **Step 1: Write the failing test**

Create `src/components/cases/SignatureCaptureModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignatureCaptureModal } from './SignatureCaptureModal';

it('captures a typed signature', () => {
  const onCapture = vi.fn();
  render(<SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={onCapture} />);
  // default method = typed: type a name, confirm
  fireEvent.change(screen.getByLabelText(/type your name/i), { target: { value: 'Tech A' } });
  fireEvent.click(screen.getByRole('button', { name: /apply signature/i }));
  expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ method: 'typed', typedValue: 'Tech A' }));
});

it('captures a click-to-accept signature', () => {
  const onCapture = vi.fn();
  render(<SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={onCapture} />);
  fireEvent.click(screen.getByRole('button', { name: /accept/i })); // switch to Accept method
  fireEvent.click(screen.getByLabelText(/i confirm/i));
  fireEvent.click(screen.getByRole('button', { name: /apply signature/i }));
  expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ method: 'click_to_accept' }));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/SignatureCaptureModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the modal**

Create `src/components/cases/SignatureCaptureModal.tsx`. Use `Dialog` (`open`/`onClose`/`label`/`className`), a segmented control for the four methods, and:
- **Typed:** `<input aria-label="Type your name">` → `typedValue`.
- **Drawn:** `<canvas ref>` with `onPointerDown/Move/Up` drawing strokes; a "Clear" button; on Apply, `canvasRef.current.toBlob((b) => onCapture({ method:'drawn', imageBlob: b }))`.
- **Upload:** `<input type="file" accept="image/*">` → `onCapture({ method:'uploaded_image', imageBlob: file })`.
- **Accept:** `<input type="checkbox" aria-label="I confirm ...">` → enables Apply → `onCapture({ method:'click_to_accept' })`.
- A single **"Apply signature"** button (disabled until the active method has valid input) that emits the `CapturedSignature` and calls `onClose()`.

Tokens only; mirror `DocumentDraftReview`'s Dialog usage. (Full JSX per the method bullets; keep the canvas logic minimal — track an `isDrawing` ref and `lineTo` strokes.)

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/components/cases/SignatureCaptureModal.test.tsx`
Expected: PASS (typed + accept; the drawn canvas path is covered manually on localhost — jsdom canvas has no real 2d context, so do NOT assert drawn-blob in the test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/cases/SignatureCaptureModal.tsx src/components/cases/SignatureCaptureModal.test.tsx
git commit -m "feat(documents): SignatureCaptureModal — typed/drawn/upload/accept (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire signature capture into the approve step

**Files:**
- Modify: `src/components/cases/DocumentDraftReview.tsx`
- Test: extend `src/components/cases/DocumentDraftReview.test.tsx`

**Interfaces:**
- Consumes: `SignatureCaptureModal` (Task 6), `captureStaffSignature` + `listInstanceSignatures` (Task 4), `useAuth` (signer name).
- Behavior: clicking **Approve** opens `SignatureCaptureModal` (slot `'approver'`); on capture → `captureStaffSignature({instanceId, slot:'approver', method, signerName: profile.full_name, signerRole: 'Approver', typedValue?, imageBlob?})` → then `transitionDocument(id, 'approved', { signatureId })`. For a **data-destruction** instance (`report_subtype === 'data_destruction'`), require operator (`engineer`) + witness signatures before approve (capture both, or block approve until both exist via `listInstanceSignatures`). Existing second-person disable + RPC error surfacing stay.

- [ ] **Step 1: Write the failing test (extend)**

Add to `src/components/cases/DocumentDraftReview.test.tsx` (mock `SignatureCaptureModal` to immediately fire `onCapture`, and mock the signature service):

```tsx
// add to existing mocks:
vi.mock('../../lib/documentSignatureService', () => ({
  captureStaffSignature: vi.fn(async () => 'sig-1'),
  listInstanceSignatures: vi.fn(async () => []),
}));
vi.mock('./SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'typed', typedValue: 'Tech A' })}>mock-capture</button> : null,
}));

it('captures an approver signature, then approves with the signatureId', async () => {
  const svcSig = await import('../../lib/documentSignatureService');
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /approve/i }));   // opens capture modal
  fireEvent.click(await screen.findByText('mock-capture'));                    // fire onCapture
  await waitFor(() => expect(svcSig.captureStaffSignature).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'di-1', slot: 'approver', method: 'typed' })));
  await waitFor(() => expect(svc.transitionDocument).toHaveBeenCalledWith('di-1', 'approved', expect.objectContaining({ signatureId: 'sig-1' })));
});
```

(Adjust `useAuth` mock so `user.id !== 'author'` → Approve enabled. Keep the existing 4 tests passing.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/DocumentDraftReview.test.tsx`
Expected: FAIL — Approve does not open a capture modal / does not call `captureStaffSignature`.

- [ ] **Step 3: Wire the capture flow**

In `DocumentDraftReview.tsx`: add state `signing: boolean` (modal open) and a `pendingApprove` flag. Change the Approve button to open `SignatureCaptureModal` instead of transitioning directly. On `onCapture`: `const sigId = await captureStaffSignature({ instanceId: id, slot: 'approver', method: sig.method, signerName: profile?.full_name ?? 'Staff', signerRole: 'Approver', typedValue: sig.typedValue, imageBlob: sig.imageBlob }); await transitionDocument(id, 'approved', { signatureId: sigId }); toast.success(...); onSaved(); onClose();` wrapped in try/catch → `toast.error`. For `report_subtype === 'data_destruction'`, gate: before approve, ensure operator(`engineer`)+witness signatures exist (via `listInstanceSignatures`) — if missing, capture them first (open the modal per slot) or show a toast instructing to capture both. Keep the existing `isAuthor` disable + Submit/Send handlers unchanged.

> Note: `transitionDocument`'s 3rd arg already accepts `{ signatureId }` (`opts.signatureId`). `profile` comes from `useAuth()` (it returns `{ user, profile }`). Render `<SignatureCaptureModal open={signing} ... title="Approver signature" onCapture={...} onClose={() => setSigning(false)} />` inside the component.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/components/cases/DocumentDraftReview.test.tsx`
Expected: PASS (existing 4 + the new capture test).

- [ ] **Step 5: Typecheck + manual smoke**

Run: `npm run typecheck` → 0. Manual (`VITE_DOC_STUDIO=true npm run dev`): on a non-author account, Approve → capture (typed + drawn) → confirm the document approves; open the delivered PDF preview and confirm the captured signature is embedded. For a data-destruction draft, confirm operator+witness capture appears on the certificate.

- [ ] **Step 6: Commit**

```bash
git add src/components/cases/DocumentDraftReview.tsx src/components/cases/DocumentDraftReview.test.tsx
git commit -m "feat(documents): capture approver (+ operator/witness) signature at approval (Phase 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before merge)

- [ ] `npm run typecheck` → 0.
- [ ] `npx vitest run` → green except the known Typst WASM reproducibility flake (re-run `src/lib/pdf/typst/typstEngine.node.test.ts` in isolation to confirm it passes alone).
- [ ] `npm run check:tokens` → clean.
- [ ] Flag-off regression: with `VITE_DOC_STUDIO` unset, app unchanged; engine renders wet-ink signatures exactly as before (no `signatureBlocks` populated).
- [ ] Flag-on e2e (`VITE_DOC_STUDIO=true`): approve with typed + drawn + uploaded + accept → each persists a `document_signatures` row and embeds in the PDF; data-destruction cert shows operator + witness; re-signing a slot is prevented (UNIQUE + append-only); approver ≠ author still enforced.

## Spec coverage / scope notes

- **In scope:** `SignatureCaptureModal` (4 methods), `EngineDocData.signatureBlocks` + engine embedding (signature section + destruction cert), `documentSignatureService` (staff capture + resolve), instance render-path population, approve-step wiring, data-destruction operator+witness.
- **Slot mapping:** `approver` (staff approve), `engineer` (destruction operator — the enum has no `operator`), `witness`. No enum/migration change.
- **Deferred (noted follow-ups, NOT in this phase):** (1) a DB signature-evidence gate in `transition_document_instance` (migration) that *requires* signatures before approve/deliver — this phase enforces capture at the UI and records the forensic row, but the RPC does not yet hard-require it; (2) customer portal sign-off is Phase 9 (`portal_sign_off_document` already exists).
