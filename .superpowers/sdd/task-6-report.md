# Task 6 Report: DocumentDraftReview — Phase 4 Lifecycle

## Status: DONE

## Commit
`742a3f1` — feat(documents): DocumentDraftReview — edit, preview + server-gated lifecycle (Phase 4)

## What was built

### `src/components/cases/DocumentDraftReview.tsx` (new)
- Create-once effect: on open with `newSubtype` and no `instanceId`, calls `createReportInstance` exactly once (guarded by `createdRef`), then loads the resulting instance.
- Edit sections: textarea per section; Save does a direct `document_instance_sections` UPDATE (allowed for content while draft/in_review — not a lifecycle mutation).
- PDF preview: `reportPDFService.generateDocumentInstanceAsBlob(id)` → `URL.createObjectURL` → `<iframe>`. Object URL is revoked on next preview/unmount to prevent leaks.
- Lifecycle (RPCs only — no direct status column writes):
  - Submit for Review → `transitionDocument(id, 'in_review')`
  - Approve → `transitionDocument(id, 'approved')`; button disabled + title tooltip when `instance.created_by === user.id` (second-person gate); RPC rejection surfaces as `toast.error`
  - Send → `archiveDocumentInstance(id)` THEN `transitionDocument(id, 'delivered')` in that order (send-gate requires the artifact)

### `src/components/cases/DocumentDraftReview.test.tsx` (new)
3 tests covering the three Phase 4 invariants the brief specified.

### `src/components/cases/detail/useCaseModals.ts` (modified)
Added `docCreateSubtype: string | null` state + setter.

### `src/pages/cases/CaseDetail.tsx` (modified)
Added (all flag-gated under `isDocStudioEnabled()`):
- `Dialog` import, `DocumentDraftReview` import, `REPORT_TYPES`/`ReportType` imports, `documentInstanceKeys` import
- Subtype picker `Dialog` (lists all `REPORT_TYPES` keys) that sets `modals.docCreateSubtype` on pick
- `DocumentDraftReview` rendered for both create (docCreateSubtype) and edit (editingDocumentId) paths, with `onSaved` invalidating `documentInstanceKeys.byCase(id!)`

## API adaptations (brief vs real)

| Item | Brief's code | Actual API | Resolution |
|------|--------------|------------|-----------|
| `Dialog` | `isOpen`, `title`, `size` props | `open`, `label`, `className` | Used correct props; render own `<h2>` inside |
| `useToast` | `showToast(msg, type)` | `toast.success(msg)`, `toast.error(msg)` | Called `.success()` / `.error()` directly |
| Test mock | `{ showToast: vi.fn() }` | `{ success: vi.fn(), error: vi.fn() }` | Fixed mock to match real hook |
| Test import | `describe` (unused) | Not needed | Removed to satisfy tsc strict |

## Test Evidence (RED → GREEN)

- **RED**: `npx vitest run ...` FAIL — module not found (component didn't exist)
- **GREEN**: All 3 tests pass after implementation
  - `archives then delivers when Send is clicked` ✓
  - `disables Approve for the author (second-person gate)` ✓
  - `creates a new instance once when opened with a subtype` ✓

## Typecheck
`npm run typecheck` → 0 errors (baseline maintained)

## Files changed
- `src/components/cases/DocumentDraftReview.tsx` (new, 214 lines)
- `src/components/cases/DocumentDraftReview.test.tsx` (new, 55 lines)
- `src/components/cases/detail/useCaseModals.ts` (+2 lines)
- `src/pages/cases/CaseDetail.tsx` (+57 lines)

## Self-review / concerns
- The create-once `useRef` guard resets if the component unmounts and remounts with a new `newSubtype`. This is correct behaviour — each fresh open for a new subtype should create a new instance. If the same subtype is re-opened after unmount it will create a second instance; this is acceptable for now and can be addressed by storing the created ID in a parent key.
- The `supabase` mock in the test covers the section-save path but no test exercises it directly; the three required behaviours (archive-deliver order, approve disabled, create-once) are fully covered.
- No legacy `case_reports` write paths were touched.

---

## Fix Round 2: Stale-state reset + DocumentViewerModal error handling

### Fix 1 — DocumentDraftReview stale state across re-opens

**Problem**: `createdRef`, `instance`, `sections`, `id`, `previewUrl` were never cleared when the modal closed. Re-opening for a different subtype skipped `createReportInstance` (createdRef still `true`) and left the previous instance in state, so Save and Preview operated on the wrong document.

**Solution** (`src/components/cases/DocumentDraftReview.tsx`): Added a `useEffect` that fires when `isOpen` transitions to `false`. It resets `instance → null`, `sections → []`, revokes and clears `previewUrl`, resets `id` to `instanceId ?? null`, and sets `createdRef.current = false`. The existing create-once guard in the open effect is unchanged — it still prevents double-creates within a single open via the `createdRef` latch.

**Regression test added** (`src/components/cases/DocumentDraftReview.test.tsx`): 4th test — renders with `newSubtype="evaluation"`, asserts `createReportInstance` called for `evaluation`; rerenders with `isOpen={false}` (close); rerenders with `newSubtype="service"` (re-open); asserts `createReportInstance` called again for `service` (total 2 calls). All 3 original tests continue to pass.

### Fix 2 — DocumentViewerModal unhandled rejection on load error

**Problem**: The async IIFE in the load effect called `getDocumentInstance` with no try/catch. Any Supabase error produced an unhandled rejection and left the modal blank with no user feedback.

**Solution** (`src/components/cases/DocumentViewerModal.tsx`): Wrapped the IIFE body in try/catch. Added `loadError: string | null` state. On catch, sets `loadError` to the error message (or a generic fallback). Render now checks `loadError` first and shows a `text-danger` notice ("Couldn't load this document.") in the iframe placeholder area. The `alive` guard is preserved. Existing 2 tests continue to pass unchanged.

### Test command + result

```
npx vitest run src/components/cases/DocumentDraftReview.test.tsx src/components/cases/DocumentViewerModal.test.tsx
```

**Result**: Test Files 2 passed (2) · Tests 6 passed (6)

### Typecheck result

```
npm run typecheck → 0 errors
```

### Files changed

- `src/components/cases/DocumentDraftReview.tsx` — added close-reset effect (14 lines)
- `src/components/cases/DocumentDraftReview.test.tsx` — added 4th regression test (28 lines)
- `src/components/cases/DocumentViewerModal.tsx` — added try/catch + error state + error notice (8 lines net)
