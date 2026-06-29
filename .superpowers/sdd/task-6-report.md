# Task 6 Report: SignatureCaptureModal

## Status: DONE

## What was built

`src/components/cases/SignatureCaptureModal.tsx` — a fully dependency-free signature capture modal with four methods controlled by a segmented button control.

### Component shape
- Exports `CapturedSignature` interface and `SignatureCaptureModal` function component.
- Props: `open`, `onClose`, `title`, `onCapture(sig: CapturedSignature)`.
- Uses project `Dialog` with `open`/`onClose`/`label`/`className` exactly as `DocumentDraftReview` does.

### Four methods

1. **Typed** (default): `<input aria-label="Type your name">` → `{method:'typed', typedValue}`.
2. **Drawn**: HTML5 `<canvas>` with `onPointerDown/Move/Up` events, `lineTo` strokes, `canvas.setPointerCapture` for stable tracking. A Clear button calls `ctx.clearRect`. On Apply, `canvas.toBlob(cb, 'image/png')` yields `{method:'drawn', imageBlob}`. An `isDrawing` ref tracks active stroke; a `hasDrawn` ref enables the Apply button.
3. **Upload**: `<input type="file" accept="image/*">` → file stored in state → `{method:'uploaded_image', imageBlob:file}`.
4. **Accept**: `<input type="checkbox" aria-label="I confirm ...">` → `{method:'click_to_accept'}`.

### Canvas without a library
The canvas drawing uses only native browser APIs: `getContext('2d')`, `beginPath()`, `moveTo()`, `lineTo()`, `stroke()`. The guard `if (!ctx) return` means it no-ops in jsdom (which has no real 2d context), so the drawn path runs silently in tests without assertions. All state is held in React refs/state; no external package was installed.

### Validation gate
`isValid()` returns true only when the active method has meaningful input. The Apply button is `disabled={!isValid()}`.

### Segmented control
Method switching calls `resetState()` to clear typed value, uploaded file, accepted flag, and canvas pixels so switching methods starts clean.

## RED → GREEN evidence

RED: `npx vitest run src/components/cases/SignatureCaptureModal.test.tsx`
```
FAIL — Error: Failed to resolve import "./SignatureCaptureModal" ... Does the file exist?
Tests: no tests
```

GREEN (after implementation):
```
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    1.77s
```

## Typecheck

`npm run typecheck` → 0 errors (tsc --noEmit exit 0).

## Files changed

| File | Action |
|------|--------|
| `src/components/cases/SignatureCaptureModal.tsx` | Created |
| `src/components/cases/SignatureCaptureModal.test.tsx` | Created |

## Self-review

- No new npm dependency — verified.
- Dialog props match: `open` (not `isOpen`), `onClose`, `label`, `className` — verified against `Dialog.tsx`.
- Tokens only: `bg-primary`, `text-primary-foreground`, `bg-surface`, `bg-surface-muted`, `border-border`, `focus:ring-ring` — no raw hex, no purple/indigo/violet.
- `isDrawing` and `hasDrawn` are refs (not state) to avoid re-renders on every pointer move.
- `canvas.setPointerCapture` ensures the move+up events fire even when pointer leaves the canvas boundary mid-stroke.
- jsdom canvas guard: all `getContext('2d')` results are checked for null before use.

## Concerns

None. Both tests pass, typecheck is clean, no new dependencies.
