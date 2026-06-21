# Document Engine Overhaul — Phase 3: Company Stamp + Signature Image (Design)

- **Date:** 2026-06-14
- **Status:** Approved (design) — proceeding to plan + implementation
- **Scope:** Company stamp image + signature image only. Watermark-image and conditional blocks remain deferred (separate cycles). Signature *line* show/hide and *text* watermark already exist and are untouched.

## 1. Background

Documents render signature **lines** (engine `engine/sections/signature.ts`; legacy `OfficeReceiptDocument`/`CheckoutFormDocument`). Tenants want to place an uploaded **company stamp/seal** and a **handwritten signature image** in the signature area. Phase 1 built the reusable image pipeline (`src/lib/pdf/brandingImage.ts`: `resolveBrandingImage`, `buildLogoNode`, raster+SVG, typed failures) and the logo upload path (`fileStorageService.uploadLogo` → `company-assets`, stored in `company_settings.branding`). This phase reuses both.

**Confirmed during planning:**
- Legacy builders with a signature block: **`OfficeReceiptDocument.ts`** (uses `createBilingualSignatureBlock`) and **`CheckoutFormDocument.ts`** (canvas-rect signature lines). Both already take `logoBase64`/`qr` params.
- `ChainOfCustodyDocument` and `PayslipDocument` have **no** signature block (payslip explicitly "does not require a signature") → out of scope.
- The PDF engine is feature-flagged off by default, so generated `office_receipt`/`customer_copy`/`checkout_form` use the legacy builders; the Studio preview uses the engine.

## 2. Goals / Non-goals

**Goals**
- Upload one company **stamp** and one **signature** image per tenant (Settings → General, reusing the logo upload UI).
- Per-document-type display config (`signatureImages`): show/hide, width, placement, opacity (stamp) — set in the Studio.
- Render both in the **engine signature section** (Studio preview + engine docs) and the **two legacy builders** that have a signature block (`OfficeReceiptDocument`, `CheckoutFormDocument`).
- Default off everywhere → byte-identical to today (golden/parity safe).

**Non-goals**
- No watermark-image, no conditional blocks (deferred).
- No change to signature *lines* show/hide (already works) or text watermark.
- No DB schema change (images live in `company_settings.branding` JSON, like the logo).
- No stamp/signature on invoices/quotes/payslip/custody (no signature area there) in this phase.

## 3. Storage & upload

`company_settings.branding` (in `companySettingsService.ts`, after the qr fields ~line 58) gains:
```ts
  stamp_url?: string; stamp_file_path?: string; stamp_metadata?: Record<string, unknown>;
  signature_url?: string; signature_file_path?: string; signature_metadata?: Record<string, unknown>;
```
`fileStorageService.ts` gains `uploadStamp`/`uploadSignature` (→ `uploadCompanyAsset(file, ASSETS, 'stamps'|'signatures')`) and `deleteStamp`/`deleteSignature`, mirroring `uploadLogo`/`deleteLogo`. **Settings → General** adds two `ImageUpload`s (Company stamp, Signature) beside the logo uploaders; `handleLogoUpload` is extended (or paralleled) to handle `'stamp'`/`'signature'` types → writes the new branding fields + metadata. SVG and raster both allowed (the existing upload accepts them; `buildLogoNode` renders both).

## 4. Per-document display config

New optional group in the template config (`templateConfig.ts`), in both `DocumentTemplateConfig` and `TemplateConfigOverride`, with a `mergeSignatureImages` (deep-merging the two nested objects) wired into `applyOverride`:
```ts
export interface SignatureImageOptions { show?: boolean; width?: number; placement?: 'left' | 'center' | 'right'; }
export interface StampImageOptions extends SignatureImageOptions { opacity?: number; }
export interface SignatureImagesConfig { stamp?: StampImageOptions; signature?: SignatureImageOptions; }
```
Default absent → both off → parity-safe. `signature` ignores `placement` for v1 (it sits above the first signature line); kept in the shared type for symmetry but only `show`/`width` are used for the signature.

## 5. Rendering

`buildLogoNode` (Phase 1) gains an optional `opacity?: number` in `LogoNodeOptions` (sets the pdfmake image/svg node `opacity`) so a stamp/seal can be semi-transparent. Default unset → no `opacity` key → parity-safe.

- **Signature image** → rendered (via `buildLogoNode`, configured `width`) immediately **above the first signature line** so the line reads as signed.
- **Stamp** → rendered (via `buildLogoNode`, configured `width` + `opacity`) in the signature band, aligned by `placement`, above the signature columns.

**Engine (`signature.ts`):** when `config.signatureImages.{stamp,signature}.show` and the corresponding image is present in the context, prepend the image element(s) to the section output; otherwise return the existing `{ columns, margin }` unchanged (parity). The images arrive via `EngineContext.stampImage` / `signatureImage` (`BrandingImage | string | null`), set in `renderTemplate` (two new optional params) — loaded by the callers.

**Pass-through:** `pdfService` build/generate functions and both preview paths (`previewTemplate`, `previewRecord`) resolve `branding.stamp_url`/`signature_url` via `resolveBrandingImage` and pass them into `renderTemplate` — exactly the Phase 1 logo pattern. (Optional params keep all existing callers compiling.)

**Legacy builders (`OfficeReceiptDocument`, `CheckoutFormDocument`):** gain optional `stampImage`/`signatureImage` params **and** a `signatureImages` options arg, rendering the images in/above their signature block via `buildLogoNode` when shown. `pdfService.generate*`/`*AsBlob` for `office_receipt`/`customer_copy`/`checkout_form` resolve the deployed template config for that doc type (via the existing `documentTemplateService`), extract `signatureImages`, load the images, and pass all three to the legacy builder (and the images to the engine builder — the engine reads `signatureImages` from its own resolved config).

## 6. Studio UI

A new **"Stamp & signature"** `FieldGroup` in the **Header & Footer** tab (`HeaderFooterTab.tsx` — the branding-imagery tab):
- Stamp: show `ToggleRow`; when shown → `width` `NumberField`, `placement` `SegmentedControl` (left/center/right), `opacity` `NumberField` (0.1–1).
- Signature: show `ToggleRow`; when shown → `width` `NumberField`.
- A hint noting the images are uploaded in Settings → General.

`StudioApi` gains `setSignatureImages(patch)` and `setStampOptions(patch)` / `setSignatureOptions(patch)` (or a single `setSignatureImageGroup(which, patch)`), mirroring the existing `set*` mutators (deep-merge into `signatureImages.{stamp,signature}`). Semantic theme tokens only.

## 7. Testing (TDD)

- **Unit:** `mergeSignatureImages` cascade (deep-merge stamp/signature); `buildLogoNode` opacity → `opacity` key present when set, absent otherwise.
- **Engine:** `signature.ts` renders an image node when `signatureImages.stamp.show`/`signature.show` + image present; renders nothing extra (identical to today) when absent/off.
- **Legacy:** `OfficeReceiptDocument`/`CheckoutFormDocument` render the image when passed + shown; goldens unchanged by default (no stamp/signature passed).
- **Parity:** default (no `signatureImages`, no images) leaves all golden/parity output unchanged (no snapshot changes).
- Gates: `bash scripts/check-tsc.sh` (strict CI typecheck), `vitest run`, eslint on changed files.

## 8. Rollout

Single PR, no schema change, defaults preserve all output. Largest phase so far but mostly reuse of Phase 1's image pipeline; the new surface area is the upload UI, the config group, the signature-section rendering, and two legacy-builder edits.
