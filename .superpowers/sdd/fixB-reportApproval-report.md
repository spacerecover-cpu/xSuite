# Fix B — Report Approval Signature Section

## Summary

Phase 6 gap: the `document_signatures` table was capturing an `approver` signature but no section in the report layout consumed it — the `renderSignature` section handles document-level wet-ink/signature blocks, but was never included in `reportConfigForSubtype`. This fix adds a dedicated `reportApproval` section renderer that embeds the approver's captured signature when present, and returns `null` (rendering nothing) when absent.

## What Was Built

### 1. New renderer — `src/lib/pdf/engine/sections/reportApproval.ts`
- Exports `renderReportApproval: SectionRenderer`
- Finds the `slot === 'approver'` entry in `data.signatureBlocks`
- Returns `null` if absent (parity — unsigned reports byte-identical)
- Renders: drawn/uploaded → `buildLogoNode(imageDataUrl, {width:130})`, typed → italic text, click_to_accept → "Accepted" text
- All variants end with a thin 0.5pt rule + "Approved by {name}" label line
- Role and signedAt appended when present
- Bilingual mode: label becomes `'Approved by | اعتمده'`
- Uses `PDF_COLORS.text`, `PDF_COLORS.textLight` only (no theme tokens)

### 2. Registry — `src/lib/pdf/engine/registry.ts`
- Added import and `reportApproval: renderReportApproval` entry

### 3. Report adapter layout — `src/lib/pdf/engine/adapters/reportAdapter.ts`
- Added `push({ key: 'reportApproval', visible: true })` AFTER `reportSections`/`custodyLog` push and BEFORE `reportFooter` push
- Applies to all 8 subtypes — inert on unsigned docs (renderer returns null)

## How It's Inert When Unsigned

The renderer's first two lines are:
```ts
if (!data.signatureBlocks || data.signatureBlocks.length === 0) return null;
const approver = data.signatureBlocks.find((b) => b.slot === 'approver');
if (!approver) return null;
```

The `reportAdapter.toEngineData` passes `signatureBlocks: data.signatureBlocks` — for existing reports this is `undefined`. The assembler skips sections returning `null`. Therefore unsigned reports produce identical PDF content.

## Test Evidence

### Focused suite — `reportApproval.test.ts` (7 tests)
```
Test Files  1 passed (1)
Tests  7 passed (7)
```
Cases covered:
- `signatureBlocks` undefined → null
- `signatureBlocks` empty array → null
- No approver slot present → null
- Drawn approver: image node present + "Tech A" + "Approved" text
- Typed approver: typed value text + "Approved" text
- click_to_accept approver: "Accepted" text
- Multiple blocks, non-approver ignored, approver found

### Full PDF parity suite — `src/lib/pdf` (68 test files / 646 tests)
```
Test Files  68 passed (68)
Tests  646 passed (646)
```
Zero parity regressions. The Typst golden hash test (`typstEngine.node.test.ts`) passes both in isolation and in the full suite run.

### Typecheck
```
npm run typecheck → 0 errors
```

## Files Changed

| File | Change |
|------|--------|
| `src/lib/pdf/engine/sections/reportApproval.ts` | NEW — renderer |
| `src/lib/pdf/engine/sections/reportApproval.test.ts` | NEW — 7 tests |
| `src/lib/pdf/engine/registry.ts` | +2 lines (import + registry entry) |
| `src/lib/pdf/engine/adapters/reportAdapter.ts` | +1 line (push reportApproval before reportFooter) |

## Self-Review

- **Parity gate**: renderer short-circuits on missing/no-approver data — existing reports unaffected.
- **Tokens only**: uses `PDF_COLORS.text` and `PDF_COLORS.textLight` from styles.ts, no hardcoded hex.
- **No new deps**: reuses `buildLogoNode`, `isBilingualMode`, `PDF_COLORS` from existing modules.
- **Pattern mirrored**: `renderApproverBlock` mirrors `capturedBlock` in `signature.ts` exactly (same 3-method branch + canvas rule + name/role/signedAt stack), with width:130 per spec.
- **All 8 subtypes**: the push in `reportConfigForSubtype` is unconditional — correct since the renderer is always inert when no approver block is present.

## Concerns

None. The section is cleanly additive and the parity/golden suites confirm no regressions.
