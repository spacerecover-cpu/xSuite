# Company Stamp + Signature Image (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Let tenants upload a company stamp + a signature image and place them in the signature area of documents (engine signature section + the OfficeReceipt/Checkout legacy builders), per-document-type configurable, off by default.

**Architecture:** Reuse Phase 1's `brandingImage.ts` (`resolveBrandingImage`/`buildLogoNode`) and the logo upload path. A `signatureImages` template-config group (show/width/placement/opacity) drives rendering; images are stored in `company_settings.branding` and passed through like the logo.

**Tech Stack:** TypeScript, pdfmake, React, Vitest. Spec: `docs/superpowers/specs/2026-06-14-stamp-signature-images-phase3-design.md`.

**Critical facts:**
- CI typecheck = `bash scripts/check-tsc.sh` (`tsc -p tsconfig.app.json`, STRICTER than plain `tsc --noEmit`). **Verify with it.**
- Default (no `signatureImages`, no images) MUST keep golden/parity output unchanged.
- Legacy builders with a signature block: ONLY `OfficeReceiptDocument.ts` (covers office_receipt + customer_copy) and `CheckoutFormDocument.ts` (checkout_form). Both already take `logoBase64`/`qr`.
- All new params optional → existing callers keep compiling.

---

## Task 1: config group + `buildLogoNode` opacity

**Files:** Modify `src/lib/pdf/templateConfig.ts`, `src/lib/pdf/brandingImage.ts`; Test `src/lib/pdf/templateConfig.test.ts`, `src/lib/pdf/brandingImage.test.ts`.

- [ ] **Step 1 (TDD): append to `templateConfig.test.ts`:**
```ts
describe('signatureImages cascade', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.office_receipt;
  it('absent by default', () => {
    expect(resolveTemplateConfig(base).signatureImages).toBeUndefined();
  });
  it('deep-merges stamp + signature across layers', () => {
    const r = resolveTemplateConfig(base,
      { signatureImages: { stamp: { show: true, width: 90 } } },
      { signatureImages: { signature: { show: true } } },
    );
    expect(r.signatureImages).toEqual({ stamp: { show: true, width: 90 }, signature: { show: true } });
  });
});
```
and append to `brandingImage.test.ts` (inside the existing `buildLogoNode` describe or a new one):
```ts
it('sets opacity when provided', () => {
  const node = buildLogoNode('data:image/png;base64,AAAA', { width: 80, opacity: 0.3 }) as { opacity?: number };
  expect(node.opacity).toBe(0.3);
});
it('omits opacity when not provided', () => {
  const node = buildLogoNode('data:image/png;base64,AAAA', { width: 80 }) as { opacity?: number };
  expect(node.opacity).toBeUndefined();
});
```
Run both test files → expect FAIL.

- [ ] **Step 2: add config types** to `templateConfig.ts` (near the other group interfaces, before `DocumentTemplateConfig`):
```ts
export interface SignatureImageOptions {
  show?: boolean;
  width?: number;
  placement?: 'left' | 'center' | 'right';
}
export interface StampImageOptions extends SignatureImageOptions {
  /** 0–1 image opacity for a semi-transparent seal. */
  opacity?: number;
}
export interface SignatureImagesConfig {
  stamp?: StampImageOptions;
  signature?: SignatureImageOptions;
}
```
Add `signatureImages?: SignatureImagesConfig;` to BOTH `DocumentTemplateConfig` and `TemplateConfigOverride` (after `layout?`/`translationPolicy?`).

- [ ] **Step 3: add merge + wire** next to `mergeTranslationPolicy`:
```ts
/** Merge signature-images config, deep-merging stamp + signature option objects. */
function mergeSignatureImages(
  base: SignatureImagesConfig | undefined,
  override: SignatureImagesConfig | undefined,
): SignatureImagesConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const stamp = mergeGroup(base.stamp, override.stamp);
  const signature = mergeGroup(base.signature, override.signature);
  return { ...base, ...override, ...(stamp ? { stamp } : {}), ...(signature ? { signature } : {}) };
}
```
In `applyOverride`'s returned object (after `translationPolicy:`):
```ts
    signatureImages: mergeSignatureImages(base.signatureImages, override.signatureImages),
```

- [ ] **Step 4: add `opacity` to `buildLogoNode`** in `brandingImage.ts`. Add `opacity?: number;` to `LogoNodeOptions`, and in `buildLogoNode` after the alignment line:
```ts
  if (opts.opacity != null) node.opacity = opts.opacity;
```

- [ ] **Step 5: Run** `npx vitest run src/lib/pdf/templateConfig.test.ts src/lib/pdf/brandingImage.test.ts` → PASS; `bash scripts/check-tsc.sh` → OK.

- [ ] **Step 6: Commit**
```bash
git add src/lib/pdf/templateConfig.ts src/lib/pdf/brandingImage.ts src/lib/pdf/templateConfig.test.ts src/lib/pdf/brandingImage.test.ts
git commit -m "feat(pdf): signatureImages config group + buildLogoNode opacity"
```

---

## Task 2: branding type + upload service

**Files:** Modify `src/lib/companySettingsService.ts`, `src/lib/fileStorageService.ts`.

- [ ] **Step 1: extend the branding type** in `companySettingsService.ts` `CompanySettings.branding` (after the `qr_code_general_caption` field ~line 58):
```ts
  stamp_url?: string;
  stamp_file_path?: string;
  stamp_metadata?: Record<string, unknown>;
  signature_url?: string;
  signature_file_path?: string;
  signature_metadata?: Record<string, unknown>;
```

- [ ] **Step 2: add upload/delete helpers** in `fileStorageService.ts` (next to `uploadLogo`/`deleteLogo`):
```ts
export const uploadStamp = async (file: File, metadata?: Partial<FileMetadata>): Promise<UploadResult> =>
  uploadCompanyAsset(file, BUCKETS.ASSETS, 'stamps', metadata);

export const uploadSignature = async (file: File, metadata?: Partial<FileMetadata>): Promise<UploadResult> =>
  uploadCompanyAsset(file, BUCKETS.ASSETS, 'signatures', metadata);

export const deleteStamp = async (filePath: string): Promise<{ success: boolean; error?: string }> =>
  deleteCompanyAsset(filePath, BUCKETS.ASSETS);

export const deleteSignature = async (filePath: string): Promise<{ success: boolean; error?: string }> =>
  deleteCompanyAsset(filePath, BUCKETS.ASSETS);
```

- [ ] **Step 3: Verify** `bash scripts/check-tsc.sh` → OK. (No new unit test — thin wrappers; covered by tsc + Task 5 usage.)

- [ ] **Step 4: Commit**
```bash
git add src/lib/companySettingsService.ts src/lib/fileStorageService.ts
git commit -m "feat(branding): stamp/signature branding fields + upload helpers"
```

---

## Task 3: engine signature rendering + pass-through

**Files:** Modify `src/lib/pdf/engine/types.ts`, `src/lib/pdf/engine/renderTemplate.ts`, `src/lib/pdf/engine/sections/signature.ts`; Test `src/lib/pdf/engine/signatureImages.test.ts` (new).

- [ ] **Step 1 (TDD): create `src/lib/pdf/engine/signatureImages.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };
const STAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';

const render = (signatureImages?: object, stampImage?: string, signatureImage?: string) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.office_receipt;
  // ensure the signature section is visible for this doc type
  const sections = base.sections.map((s) => (s.key === 'signature' ? { ...s, visible: true } : s));
  const config = { ...base, sections, signatureImages };
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('office_receipt', config), ctx, null, null, stampImage, signatureImage));
};

describe('signature section — stamp/signature images', () => {
  it('renders the stamp image when stamp.show + image present', () => {
    expect(render({ stamp: { show: true, width: 90 } }, STAMP)).toContain(STAMP);
  });
  it('renders the signature image when signature.show + image present', () => {
    expect(render({ signature: { show: true } }, undefined, STAMP)).toContain(STAMP);
  });
  it('renders neither when not configured (parity)', () => {
    expect(render(undefined, STAMP, STAMP)).not.toContain(STAMP);
  });
});
```
Run → FAIL (renderTemplate has no stamp/signature params yet).

- [ ] **Step 2: EngineContext** — in `engine/types.ts`, add to `EngineContext` (after `qrCodeBase64`):
```ts
  stampImage?: import('../brandingImage').BrandingImage | string | null;
  signatureImage?: import('../brandingImage').BrandingImage | string | null;
```

- [ ] **Step 3: renderTemplate** — in `engine/renderTemplate.ts`, add two optional params after `qrCodeBase64` and put them on the context:
```ts
export function renderTemplate(
  config: DocumentTemplateConfig,
  data: EngineDocData,
  ctx: TranslationContext,
  logo?: import('../brandingImage').BrandingImage | string | null,
  qrCodeBase64?: string | null,
  stampImage?: import('../brandingImage').BrandingImage | string | null,
  signatureImage?: import('../brandingImage').BrandingImage | string | null,
): TDocumentDefinitions {
  const engine: EngineContext = { config, ctx, logo, qrCodeBase64, stampImage, signatureImage };
```

- [ ] **Step 4: signature.ts** — render the images. Replace the body so that, after building `columns`, it conditionally prepends image elements. Full new `renderSignature`:
```ts
import type { Content } from 'pdfmake/interfaces';
import { createSignatureBlock } from '../../styles';
import { resolveLabel } from '../labels';
import { buildLogoNode, classifyLogo } from '../../brandingImage';
import type { EngineContext, EngineDocData, LabelText, SectionRenderer } from '../types';

const DEFAULT_SIGNATURES: LabelText[] = [{ en: 'Authorized Signature', ar: 'التوقيع المعتمد' }];

export const renderSignature: SectionRenderer = (engine: EngineContext, data: EngineDocData): Content | null => {
  const sigs = data.signatures && data.signatures.length > 0 ? data.signatures : DEFAULT_SIGNATURES;
  const { language, signatureImages } = engine.config;

  const blocks: object[] = sigs.map((label) => createSignatureBlock(resolveLabel(label, language)) as object);
  const columns: object[] = [];
  blocks.forEach((b, i) => {
    columns.push(b);
    if (i < blocks.length - 1) columns.push({ text: '', width: '*' });
  });

  const stamp = signatureImages?.stamp;
  const sig = signatureImages?.signature;
  const stampNode = stamp?.show && classifyLogo(engine.stampImage).kind !== 'none'
    ? buildLogoNode(engine.stampImage, { width: stamp.width ?? 110, alignment: stamp.placement ?? 'right', opacity: stamp.opacity, margin: [0, 0, 0, 4] })
    : null;
  const sigNode = sig?.show && classifyLogo(engine.signatureImage).kind !== 'none'
    ? buildLogoNode(engine.signatureImage, { width: sig.width ?? 140, alignment: 'left', margin: [0, 0, 0, 2] })
    : null;

  const stack: Content[] = [];
  if (stampNode) stack.push(stampNode as Content);
  if (sigNode) stack.push(sigNode as Content);
  stack.push({ columns, margin: [0, stampNode || sigNode ? 4 : 24, 0, 8] } as Content);

  // Parity: when no images, return the original single block unchanged.
  if (!stampNode && !sigNode) return { columns, margin: [0, 24, 0, 8] } as Content;
  return { stack } as Content;
};
```

- [ ] **Step 5: Run** `npx vitest run src/lib/pdf/engine/signatureImages.test.ts src/lib/pdf/engine/officeReceiptParity.test.ts src/lib/pdf/engine/checkoutParity.test.ts src/lib/pdf/engine/headerLogo.test.ts` → PASS; `bash scripts/check-tsc.sh` → OK. (Parity green because default returns the original block.)

- [ ] **Step 6: Commit**
```bash
git add src/lib/pdf/engine/types.ts src/lib/pdf/engine/renderTemplate.ts src/lib/pdf/engine/sections/signature.ts src/lib/pdf/engine/signatureImages.test.ts
git commit -m "feat(pdf-engine): render stamp/signature images in the signature section"
```

---

## Task 4: legacy builders + pdfService/preview pass-through

**Files:** Modify `src/lib/pdf/documents/OfficeReceiptDocument.ts`, `src/lib/pdf/documents/CheckoutFormDocument.ts`, `src/lib/pdf/pdfService.ts`, `src/lib/pdf/previewRecord.ts`.

- [ ] **Step 1: legacy builder params + rendering.** Add to BOTH `buildOfficeReceiptDocument` and `buildCheckoutFormDocument` signatures (after `qrCodeCaption`):
```ts
  stampImage?: import('../brandingImage').BrandingImage | string | null,
  signatureImage?: import('../brandingImage').BrandingImage | string | null,
  signatureImages?: import('../templateConfig').SignatureImagesConfig,
```
Add `import { buildLogoNode, classifyLogo } from '../brandingImage';` to each. In each file's signature section (OfficeReceipt ~lines 290-297 `signatureSection`; Checkout ~lines 338-451 the two signature columns), when `signatureImages?.stamp?.show` + a stamp image is present, render `buildLogoNode(stampImage, { width: signatureImages.stamp.width ?? 110, alignment: signatureImages.stamp.placement ?? 'right', opacity: signatureImages.stamp.opacity })` above/within the signature block; likewise the signature image above the customer/first signature line when `signatureImages?.signature?.show`. Read each file's exact signature block first and place the image so it reads naturally (signature image just above the line; stamp aligned in the band). When the options/images are absent, emit NOTHING new (golden parity).

- [ ] **Step 2: pdfService pass-through.** For the `office_receipt`, `customer_copy`, and `checkout_form` `generate*` and `*AsBlob` functions:
  - Load the stamp/signature images alongside the existing logo/QR `Promise.all`, using `resolveBrandingImage(data.companySettings.branding?.stamp_url)` and `...signature_url` (import `resolveBrandingImage` from `./brandingImage`).
  - Resolve the deployed `signatureImages` for the doc type: `const tpl = await getDeployedVersionByType('<docType>'); const cfg = resolveTemplateConfig(BUILT_IN_TEMPLATE_CONFIGS['<docType>'], undefined, tpl ?? undefined); const signatureImages = cfg.signatureImages;` (use the existing `documentTemplateService` import already present in this file; if not present, import `getDeployedVersionByType` from `../documentTemplateService` and `resolveTemplateConfig`/`BUILT_IN_TEMPLATE_CONFIGS` from `./templateConfig`). If wiring the deployed-config lookup is non-trivial in a given function, you MAY pass `signatureImages` from the engine builder's resolved config path instead — but the legacy builder must receive it. If unsure, STOP and report.
  - Pass `stampImg, sigImg, signatureImages` to BOTH branches: the engine builder reads `signatureImages` from its own resolved config, so it only needs the two IMAGES (`renderTemplate(..., stampImg, sigImg)` via the `build*ViaEngine` helper — extend those helper signatures with the two optional image params and forward to `renderTemplate`); the legacy builder needs all three (`build*Document(data, ctx, logo, qr, caption, stampImg, sigImg, signatureImages)`).

- [ ] **Step 3: previewRecord pass-through.** In `previewRecord.ts`, for each financial branch (it currently loads `logo` via `resolveBrandingImage`), also resolve `stamp`/`signature` from `data.companySettings.branding?.stamp_url`/`signature_url` and pass them to `renderTemplate(config, engineData, PREVIEW_CTX_EN, logo, qr, stamp, signature)`. (Record preview is invoice/quote/payment — no signature section by default — so this is harmless but keeps the path uniform.)

- [ ] **Step 4: Verify** — `npx vitest run src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts` → PASS with NO snapshot changes (default passes no stamp/sig); `bash scripts/check-tsc.sh` → OK; `npx vitest run src/lib/pdf/` → all pass.

- [ ] **Step 5: Commit**
```bash
git add src/lib/pdf/documents/OfficeReceiptDocument.ts src/lib/pdf/documents/CheckoutFormDocument.ts src/lib/pdf/pdfService.ts src/lib/pdf/previewRecord.ts
git commit -m "feat(pdf): thread stamp/signature images through generated receipts + checkout"
```

---

## Task 5: Settings → General uploaders

**Files:** Modify `src/pages/settings/GeneralSettings.tsx`.

- [ ] **Step 1: extend the upload handler.** Generalize `handleLogoUpload` to also accept `'stamp' | 'signature'` (extend its `type` union and the `urlField`/`pathField`/metadata-field mapping: `stamp` → `stamp_url`/`stamp_file_path`/`stamp_metadata`; `signature` → `signature_url`/`signature_file_path`/`signature_metadata`; for stamp/signature call `uploadStamp(file)`/`uploadSignature(file)` instead of `uploadLogo`). Import `uploadStamp, uploadSignature` from `../../lib/fileStorageService`. Keep the logo branches exactly as they are.

- [ ] **Step 2: add the uploaders.** After the favicon `ImageUpload` (~line 1058), add two `ImageUpload`s following the same props pattern:
```tsx
  <ImageUpload
    value={toStr(formData.branding?.stamp_url)}
    onChange={(file, previewUrl) => handleLogoUpload(file, previewUrl, 'stamp')}
    label="Company Stamp"
    description="Seal placed in the signature area of documents"
    recommendedDimensions="300 × 300px"
    maxSizeMB={2}
    bucketName="company-assets"
  />
  <ImageUpload
    value={toStr(formData.branding?.signature_url)}
    onChange={(file, previewUrl) => handleLogoUpload(file, previewUrl, 'signature')}
    label="Signature"
    description="Authorized signature image"
    recommendedDimensions="400 × 150px"
    maxSizeMB={2}
    bucketName="company-assets"
  />
```
(Place them in a grid consistent with the existing logo grid; adjust the grid wrapper if needed so the layout stays clean.)

- [ ] **Step 3: Verify** `bash scripts/check-tsc.sh` → OK; `npx vitest run` (any GeneralSettings tests) → pass. Sanity-read the handler so a stamp upload writes `stamp_url`/`stamp_file_path`/`stamp_metadata`.

- [ ] **Step 4: Commit**
```bash
git add src/pages/settings/GeneralSettings.tsx
git commit -m "feat(settings): upload company stamp + signature image"
```

---

## Task 6: Studio controls + sample-preview pass-through

**Files:** Modify `src/components/settings/documents/TemplateStudio.tsx`, `src/components/settings/documents/tabs/HeaderFooterTab.tsx`, `src/lib/pdf/engine/previewTemplate.ts`.

- [ ] **Step 1: previewTemplate params.** In `previewTemplate.ts`, add optional `stampImage`/`signatureImage` params (after `logo`) and forward them to `renderTemplate(config, engineData, ctx, previewLogo, null, stampImage ?? null, signatureImage ?? null)`. Keep the `{ url, warnings }` return.

- [ ] **Step 2: StudioApi.** In `TemplateStudio.tsx`, add `type SignatureImagesConfig, type StampImageOptions, type SignatureImageOptions` to the templateConfig import. Add to `StudioApi`:
```ts
  setStampOptions: (patch: Partial<StampImageOptions>) => void;
  setSignatureOptions: (patch: Partial<SignatureImageOptions>) => void;
```
Implement them in the `api` object mirroring `setOrgShow`/`setLayout` (deep-merge into `signatureImages.stamp` / `signatureImages.signature` within the override). Also resolve the tenant stamp/signature once (like the Phase 1 `tenantLogo` effect: `getCompanyLogo` → there's no getCompanyStamp, so read them from company settings — reuse the existing branding fetch; add `getCompanyStamp`/`getCompanySignature` to fileStorageService mirroring `getCompanyLogo`, OR fetch branding once) into `tenantStamp`/`tenantSignature` state and pass them to `previewTemplate(docType, resolved, undefined, tenantLogo, tenantStamp, tenantSignature)` in the sample-preview branch.

- [ ] **Step 3: HeaderFooterTab UI.** Add a "Stamp & signature" `FieldGroup` (after the existing logo/header controls):
```tsx
      <FieldGroup title="Stamp & signature" description="Place an uploaded company stamp and signature in the signature area. Upload the images in Settings → General.">
        <ToggleRow label="Show company stamp" checked={resolved.signatureImages?.stamp?.show ?? false} onChange={(v) => api.setStampOptions({ show: v })} />
        {resolved.signatureImages?.stamp?.show && (
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Stamp width" suffix="pt" value={resolved.signatureImages?.stamp?.width ?? 110} min={40} max={220} onChange={(v) => api.setStampOptions({ width: v })} />
            <SegmentedControl<'left'|'center'|'right'> label="Placement" value={resolved.signatureImages?.stamp?.placement ?? 'right'} onChange={(v) => api.setStampOptions({ placement: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
            <NumberField label="Opacity" value={resolved.signatureImages?.stamp?.opacity ?? 1} min={0.1} max={1} step={0.1} onChange={(v) => api.setStampOptions({ opacity: v })} />
          </div>
        )}
        <ToggleRow label="Show signature image" checked={resolved.signatureImages?.signature?.show ?? false} onChange={(v) => api.setSignatureOptions({ show: v })} />
        {resolved.signatureImages?.signature?.show && (
          <NumberField label="Signature width" suffix="pt" value={resolved.signatureImages?.signature?.width ?? 140} min={60} max={260} onChange={(v) => api.setSignatureOptions({ width: v })} />
        )}
      </FieldGroup>
```
`ToggleRow`, `NumberField`, `SegmentedControl`, `FieldGroup` are already imported in HeaderFooterTab. Use semantic tokens only.

- [ ] **Step 4: Verify** `bash scripts/check-tsc.sh` → OK; `npx vitest run` → all pass. Manually: in the Studio (office_receipt / checkout_form, with the signature section visible), toggling "Show company stamp" + an uploaded stamp shows it in the preview; off by default.

- [ ] **Step 5: Commit**
```bash
git add src/components/settings/documents/TemplateStudio.tsx src/components/settings/documents/tabs/HeaderFooterTab.tsx src/lib/pdf/engine/previewTemplate.ts src/lib/fileStorageService.ts
git commit -m "feat(studio): stamp & signature image controls + sample-preview wiring"
```

---

## Final verification
- [ ] `bash scripts/check-tsc.sh` → OK.
- [ ] `npx vitest run` → all green; golden/parity unchanged (no `.snap` changes).
- [ ] `npx eslint` (changed files) → clean.
- [ ] Push + open draft PR.

## Spec coverage
- signatureImages config + cascade → Task 1; buildLogoNode opacity → Task 1.
- branding fields + upload helpers → Task 2.
- engine signature rendering + pass-through → Task 3.
- legacy builders + generated-doc pass-through → Task 4.
- Settings upload UI → Task 5.
- Studio controls + sample preview → Task 6.
- default-off parity → Tasks 3 & 4 (parity/golden suites).
