# Document Studio — Phase 9 (Portal Sign-Off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A customer-portal **Documents** surface where a customer reviews a delivered document (PDF) and **signs off** (typed / click-to-accept), flipping it to `signed_off` via the server-enforced `portal_sign_off_document` RPC and recording a forensic `document_signatures` row.

**Architecture:** The `portal_sign_off_document` RPC, the `document_instances_portal_read` RLS, and the `show_documents` visibility flag already exist. A storage-RLS migration (`20260629130539_portal_read_own_delivered_document_pdfs`) was **already applied to the live DB** so the `portal` role can read its own delivered/signed-off document PDFs (fail-closed; scoped via `get_current_portal_customer_id()`). This phase adds: a `portalDocumentService`, a `PortalDocuments` page (list + PDF view + sign-off), a method-restricted reuse of the Phase-6 `SignatureCaptureModal`, and the `/portal/documents` route + nav. The committed migration `.sql` is added for CI parity.

**Tech Stack:** React 18 + TS, TanStack Query, Supabase (portal role + the applied storage policy), Vitest. No new npm packages.

## Global Constraints

- **Portal capture scope = `typed` + `click_to_accept` ONLY.** Portal customers have no storage WRITE access, so drawn/uploaded signatures (which need an uploaded image path) are NOT offered in the portal. Restrict via a new additive `allowedMethods` prop on `SignatureCaptureModal`. (Drawn/uploaded portal signatures = deferred; would need a portal storage-write policy.)
- **All portal writes go through the RPC.** Sign-off = `supabase.rpc('portal_sign_off_document', { p_instance_id, p_method, p_typed_value, p_user_agent })`. Never INSERT `document_signatures` or UPDATE `document_instances` directly from the portal (RLS forbids it anyway).
- **Read scope:** list via `fetchPortalVisibility(customerId)` → `getCaseIdsWithFlag(rows, 'show_documents')` → `document_instances` filtered to `status IN ('delivered','signed_off') AND visible_to_customer` (RLS also enforces ownership). PDF via a signed URL on `case-report-pdfs` (now readable by the portal role for own delivered docs).
- **Mobile-first** (portal convention): `min-h-screen`, single column, `max-w-*` centered, `md:hidden` desktop-only bits, ≥44px targets. Use `t('portal.documents.*', { defaultValue: '…' })` for copy (graceful i18n — no DB key requirement).
- **Tokens only** (semantic + slate neutrals; no raw hex / purple-indigo-violet). `Database` from `database.types.ts`; `maybeSingle()` not `single()`.
- **Migration already applied live** (version `20260629130539`). Task 1 only commits the matching `.sql` (+ manifest if the repo uses one) for the schema-drift/migration-manifest CI gates — do NOT re-apply.
- **Per-task gates:** `npm run typecheck` = 0 + the task's vitest green before commit. Commit locally only — DO NOT push. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

**Create:**
- `supabase/migrations/20260629130539_portal_read_own_delivered_document_pdfs.sql` — the already-applied storage policy (for CI parity).
- `src/lib/portalDocumentService.ts` — `fetchPortalDocuments`, `getPortalDocumentPdfUrl`, `portalSignOffDocument`. (+ `.test.ts`)
- `src/pages/portal/PortalDocuments.tsx` — list + PDF view + sign-off. (+ `.test.tsx`)

**Modify:**
- `src/components/cases/SignatureCaptureModal.tsx` — additive `allowedMethods?: CaptureMethod[]` prop. (+ test)
- `src/App.tsx` — `/portal/documents` route.
- `src/components/layout/PortalLayout.tsx` — nav entry for Documents.

---

## Task 1: Commit the applied storage migration (CI parity)

**Files:**
- Create: `supabase/migrations/20260629130539_portal_read_own_delivered_document_pdfs.sql`

The migration is ALREADY applied to the live DB (version `20260629130539`). This task only commits the matching `.sql` so the `schema-drift` / `migration-manifest` CI gates pass on push.

- [ ] **Step 1: Create the migration file** with the EXACT applied SQL:

```sql
-- Phase 9 (Document Studio): let a portal customer READ the PDF of their OWN
-- delivered/signed-off documents so they can review before signing off.
-- Fail-closed + conservative: the portal role gets a base SELECT privilege on
-- storage.objects, but RLS still restricts visibility to ONLY case-report-pdfs
-- objects whose document_instance is delivered/visible and belongs to the
-- current portal customer's case. No other bucket is reachable (no other
-- TO portal storage policy exists).

GRANT SELECT ON storage.objects TO portal;

CREATE POLICY "Portal customers read own delivered document pdfs"
  ON storage.objects
  AS PERMISSIVE FOR SELECT TO portal
  USING (
    bucket_id = 'case-report-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.document_instances di
      JOIN public.cases c ON c.id = di.case_id
      WHERE di.pdf_storage_path = storage.objects.name
        AND di.deleted_at IS NULL
        AND di.visible_to_customer = true
        AND di.status IN ('delivered', 'signed_off')
        AND c.customer_id = public.get_current_portal_customer_id()
    )
  );
```

- [ ] **Step 2: Update the migration manifest if one exists**

Run: `ls supabase/migrations/ | tail -3` and check for a manifest the CI uses (e.g. `grep -rl "migration-manifest\|MIGRATIONS" scripts/`). If `scripts/check-migration-manifest*` reads a manifest file, append `20260629130539_portal_read_own_delivered_document_pdfs`. If the gate just diffs the folder against the DB, the `.sql` file alone suffices.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260629130539_portal_read_own_delivered_document_pdfs.sql
git commit -m "feat(db): portal read on own delivered document PDFs (Phase 9 storage RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `SignatureCaptureModal` — `allowedMethods` prop

**Files:**
- Modify: `src/components/cases/SignatureCaptureModal.tsx`
- Test: extend `src/components/cases/SignatureCaptureModal.test.tsx`

**Interfaces:**
- Adds `allowedMethods?: CaptureMethod[]` (default = all four). The method segmented-control renders only the allowed methods; the initial `method` is the first allowed one. Everything else unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders only the allowed methods when allowedMethods is set', () => {
  render(<SignatureCaptureModal open onClose={vi.fn()} title="Sign" onCapture={vi.fn()} allowedMethods={['typed', 'click_to_accept']} />);
  expect(screen.getByRole('button', { name: /type/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /draw/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/cases/SignatureCaptureModal.test.tsx`
Expected: FAIL — Draw/Upload still render.

- [ ] **Step 3: Add the prop**

Read the existing `METHODS` array + the props interface. Add `allowedMethods?: CaptureMethod[]` to the props; compute `const methods = METHODS.filter(m => !allowedMethods || allowedMethods.includes(m.key));` and render from `methods`. Initialize `method` state to `allowedMethods?.[0] ?? 'typed'`. Ensure the reset-on-close effect resets to the first allowed method, not hardcoded `'typed'` (use `methods[0].key`).

- [ ] **Step 4: Run the test to confirm it passes** + the existing modal tests stay green.

Run: `npx vitest run src/components/cases/SignatureCaptureModal.test.tsx` → PASS (all).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → 0.
```bash
git add src/components/cases/SignatureCaptureModal.tsx src/components/cases/SignatureCaptureModal.test.tsx
git commit -m "feat(documents): SignatureCaptureModal allowedMethods prop (Phase 9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `portalDocumentService`

**Files:**
- Create: `src/lib/portalDocumentService.ts`
- Test: `src/lib/portalDocumentService.test.ts`

**Interfaces:**
- Consumes: `supabase`, `fetchPortalVisibility` + `getCaseIdsWithFlag` (`portalVisibility`), `getDocumentPdfSignedUrl` (`documentInstanceService`), `CapturedSignature` (`SignatureCaptureModal`).
- Produces:
  - `fetchPortalDocuments(customerId: string): Promise<DocumentInstanceRow[]>` — visibility → case ids w/ `show_documents` → `document_instances` (`status IN ('delivered','signed_off')`, `visible_to_customer`, `deleted_at IS NULL`), ordered by delivered/created desc. Returns `[]` for empty inputs.
  - `getPortalDocumentPdfUrl(instance): Promise<string | null>` — delegate to `getDocumentPdfSignedUrl(instance)` (now readable by the portal role).
  - `portalSignOffDocument(instanceId: string, sig: CapturedSignature): Promise<string>` — `supabase.rpc('portal_sign_off_document', { p_instance_id: instanceId, p_method: sig.method, p_typed_value: sig.typedValue ?? null, p_user_agent: navigator.userAgent })`; returns the `signature_id` from the RPC's `{ ok, signature_id }`.

- [ ] **Step 1: Write the failing service test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from, rpc } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('./portalVisibility', () => ({
  fetchPortalVisibility: vi.fn(async () => [{ case_id: 'c1', visible_fields: ['show_documents'], custom_message: null }]),
  getCaseIdsWithFlag: vi.fn(() => ['c1']),
}));
vi.mock('./documentInstanceService', () => ({ getDocumentPdfSignedUrl: vi.fn(async () => 'https://signed/x.pdf') }));

import { fetchPortalDocuments, portalSignOffDocument } from './portalDocumentService';

beforeEach(() => vi.clearAllMocks());

function listChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'is', 'order']) c[m] = vi.fn(() => c);
  c.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
  return c;
}

describe('portalDocumentService', () => {
  it('returns [] when customerId is empty (no query)', async () => {
    expect(await fetchPortalDocuments('')).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it('lists delivered/signed_off documents for show_documents cases', async () => {
    from.mockReturnValue(listChain([{ id: 'd1', status: 'delivered' }]));
    const rows = await fetchPortalDocuments('cust1');
    expect(from).toHaveBeenCalledWith('document_instances');
    expect(rows).toEqual([{ id: 'd1', status: 'delivered' }]);
  });
  it('signs off via the RPC and returns the signature id', async () => {
    rpc.mockResolvedValue({ data: { ok: true, signature_id: 'sig-9' }, error: null });
    const id = await portalSignOffDocument('di-1', { method: 'typed', typedValue: 'Jane' });
    expect(rpc).toHaveBeenCalledWith('portal_sign_off_document', expect.objectContaining({ p_instance_id: 'di-1', p_method: 'typed', p_typed_value: 'Jane' }));
    expect(id).toBe('sig-9');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** → module not found.

Run: `npx vitest run src/lib/portalDocumentService.test.ts`

- [ ] **Step 3: Implement the service**

```ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logger } from './logger';
import { fetchPortalVisibility, getCaseIdsWithFlag } from './portalVisibility';
import { getDocumentPdfSignedUrl } from './documentInstanceService';
import type { CapturedSignature } from '../components/cases/SignatureCaptureModal';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];

export async function fetchPortalDocuments(customerId: string): Promise<DocumentInstanceRow[]> {
  if (!customerId) return [];
  const visibility = await fetchPortalVisibility(customerId);
  const caseIds = getCaseIdsWithFlag(visibility, 'show_documents');
  if (caseIds.length === 0) return [];
  const { data, error } = await supabase
    .from('document_instances')
    .select('*')
    .in('case_id', caseIds)
    .in('status', ['delivered', 'signed_off'])
    .eq('visible_to_customer', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) { logger.error('[portalDocumentService] list failed:', error); throw error; }
  return data ?? [];
}

export async function getPortalDocumentPdfUrl(
  instance: Pick<DocumentInstanceRow, 'pdf_storage_bucket' | 'pdf_storage_path'>,
): Promise<string | null> {
  return getDocumentPdfSignedUrl(instance);
}

export async function portalSignOffDocument(instanceId: string, sig: CapturedSignature): Promise<string> {
  const { data, error } = await supabase.rpc('portal_sign_off_document', {
    p_instance_id: instanceId,
    p_method: sig.method,
    p_typed_value: sig.typedValue ?? null,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) { logger.error('[portalDocumentService] sign-off failed:', error); throw error; }
  const result = data as { ok?: boolean; signature_id?: string } | null;
  if (!result?.signature_id) throw new Error('Sign-off did not return a signature id');
  return result.signature_id;
}
```

> Note: confirm `getDocumentPdfSignedUrl` is exported from `documentInstanceService` (it is — Phase 8). Confirm the `portal_sign_off_document` RPC arg names against `database.types.ts` (`p_instance_id`, `p_method`, `p_typed_value`, `p_user_agent`, …). The portal `signature_method` only ever receives `typed`/`click_to_accept` from the UI (Task 2 restriction), but the service stays method-agnostic.

- [ ] **Step 4: Run the test** → PASS. **Typecheck** → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portalDocumentService.ts src/lib/portalDocumentService.test.ts
git commit -m "feat(documents): portalDocumentService — list + signed-url + sign-off (Phase 9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `PortalDocuments` page (list + PDF view + sign-off)

**Files:**
- Create: `src/pages/portal/PortalDocuments.tsx`
- Test: `src/pages/portal/PortalDocuments.test.tsx`

**Interfaces:**
- Consumes: `usePortalAuth` (`customer.id`), `fetchPortalDocuments` / `getPortalDocumentPdfUrl` / `portalSignOffDocument` (Task 3), `SignatureCaptureModal` with `allowedMethods={['typed','click_to_accept']}`, TanStack Query, `Button`/`Badge`/`Card`, `t`.
- Behavior: list the customer's documents (title, number, type, status badge); selecting one shows its PDF (iframe via signed URL) + a **Sign off** button when `status === 'delivered'`; Sign off opens the restricted `SignatureCaptureModal` → `portalSignOffDocument` → invalidate the list. `signed_off` documents show a "Signed off" badge and no button. Mobile-first single column.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../contexts/PortalAuthContext', () => ({ usePortalAuth: () => ({ customer: { id: 'cust1', customer_name: 'Jane' } }) }));
const svc = vi.hoisted(() => ({ fetchPortalDocuments: vi.fn(), getPortalDocumentPdfUrl: vi.fn(), portalSignOffDocument: vi.fn() }));
vi.mock('../../lib/portalDocumentService', () => svc);
vi.mock('../../components/cases/SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'click_to_accept' })}>mock-sign</button> : null,
}));

import { PortalDocuments } from './PortalDocuments';
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  svc.fetchPortalDocuments.mockResolvedValue([
    { id: 'd1', title: 'Evaluation Report', document_number: 'REP-EVAL-0007', report_subtype: 'evaluation', status: 'delivered', pdf_storage_bucket: 'case-report-pdfs', pdf_storage_path: 't/r/d1/a.pdf', created_at: '2026-06-02T00:00:00Z' },
  ]);
  svc.getPortalDocumentPdfUrl.mockResolvedValue('https://signed/a.pdf');
  svc.portalSignOffDocument.mockResolvedValue('sig-1');
});

it('lists delivered documents and signs one off', async () => {
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText('Evaluation Report')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /sign off/i }));
  fireEvent.click(await screen.findByText('mock-sign'));
  await waitFor(() => expect(svc.portalSignOffDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ method: 'click_to_accept' })));
});

it('shows an empty state when there are no documents', async () => {
  svc.fetchPortalDocuments.mockResolvedValue([]);
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText(/no documents/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run it to confirm it fails** → module not found.

- [ ] **Step 3: Implement the page**

Build `PortalDocuments` mirroring `PortalQuotes` structure (read it): a `useQuery(['portal_documents', customer.id], () => fetchPortalDocuments(customer.id))`; a list of cards (title, number, type, status `Badge` — delivered=info, signed_off=success); a detail/view area or modal showing the PDF (`useQuery` for the signed URL → `<iframe title="Document">`); a Sign-off button (only when `status==='delivered'`) opening `<SignatureCaptureModal open allowedMethods={['typed','click_to_accept']} title={t('portal.documents.signOff', {defaultValue:'Sign off'})} onCapture={...} />`; the `onCapture` runs `useMutation(() => portalSignOffDocument(doc.id, sig))` with `onSuccess` invalidating `['portal_documents']`. Mobile-first (single column, `min-h-screen`, `max-w-3xl mx-auto px-4`). Use `t('portal.documents.*',{defaultValue})` for copy.

- [ ] **Step 4: Run the test** → PASS (both). **Typecheck** → 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/portal/PortalDocuments.tsx src/pages/portal/PortalDocuments.test.tsx
git commit -m "feat(documents): PortalDocuments — review + sign off delivered documents (Phase 9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Route + portal nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/PortalLayout.tsx`

- [ ] **Step 1: Add the route**

In `src/App.tsx`, inside the nested `/portal` routes (after `reports`), add: `<Route path="documents" element={<PortalDocuments />} />` (lazy-import `PortalDocuments` matching how the other portal pages are imported — verify whether they're lazy or eager and mirror it).

- [ ] **Step 2: Add the nav entry**

In `src/components/layout/PortalLayout.tsx`, add a "Documents" nav item (path `/portal/documents`, a lucide icon e.g. `FileCheck` or `FileSignature`) alongside the existing items (mirror the existing nav item structure incl. mobile). Use `t('portal.nav.documents', { defaultValue: 'Documents' })`.

- [ ] **Step 3: Typecheck + manual smoke**

Run: `npm run typecheck` → 0.
Manual (portal login): the Documents nav appears; the page lists delivered docs; opening one shows the PDF (confirming the storage policy works for the portal role); Sign off (typed/accept) flips it to `signed_off`; a signed doc shows no sign-off button.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/PortalLayout.tsx
git commit -m "feat(documents): /portal/documents route + nav (Phase 9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before local merge)

- [ ] `npm run typecheck` → 0.
- [ ] `npx vitest run` → green except the known Typst WASM flake (confirm isolated pass).
- [ ] `npm run check:tokens` → clean.
- [ ] DB: re-confirm the storage policy is the ONLY `TO portal` storage policy and is scoped to `case-report-pdfs` + own delivered docs (already verified at apply time).
- [ ] Manual (portal, mobile viewport ≤375px): list → view PDF → sign off (typed + accept) → `signed_off`; a non-owned/non-delivered document is not visible; no horizontal scroll.

## Scope notes
- **In scope:** portal documents list, in-portal PDF review (via the applied storage policy), typed + click-to-accept sign-off through `portal_sign_off_document`, route + nav.
- **Deferred:** drawn/uploaded portal signatures (need a portal storage-WRITE policy); customer-facing signature-image rendering (the delivered PDF already embeds staff signatures as base64).
- **Migration:** `20260629130539` already applied live; Task 1 only commits the `.sql` for CI parity.
