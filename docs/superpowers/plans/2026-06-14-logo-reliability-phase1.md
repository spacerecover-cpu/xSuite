# Logo Reliability (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the company logo render reliably across generated PDF, print, email, and both Studio preview modes — supporting SVG as well as raster, showing the real logo in the sample preview, and never failing silently.

**Architecture:** One new module `src/lib/pdf/brandingImage.ts` owns logo classification (`classifyLogo`), a network resolver with typed failure reasons (`resolveBrandingImage`), a single pdfmake node builder (`buildLogoNode`), and a labeled preview placeholder (`placeholderLogoSvg`). The engine header **and** all ~9 legacy `documents/*.ts` builders render the logo through `buildLogoNode`, so every output path shares one code path. Previews resolve the real tenant logo and surface load warnings.

**Tech Stack:** TypeScript, pdfmake (`{ image }` raster / `{ svg }` vector / `fit:[w,h]`), React, Vitest. Spec: `docs/superpowers/specs/2026-06-14-document-engine-logo-reliability-design.md`.

**Key facts the engineer must know:**
- The PDF *engine* (`renderTemplate`) is feature-flagged **OFF by default** (`src/lib/pdf/engine/featureFlag.ts`). Generated docs use the **legacy** `documents/*.ts` builders; the Studio preview uses the engine. Both must be fixed.
- `loadImageAsBase64(url)` (`src/lib/pdf/utils.ts:135`) returns a `data:<mime>;base64,…` string and **swallows all failures** returning `null`.
- For raster (PNG/JPEG) inputs, `buildLogoNode` must emit a node byte-identical to today's inline `{ image, width, margin }` so the golden snapshots (`src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts`) stay green. Vitest's snapshot serializer sorts object keys, so key order is irrelevant; only the set of defined keys + values matter.
- Run the full suite with `npx vitest run` and the type gate with `npx tsc --noEmit`.

---

## Task 1: `brandingImage.ts` — classify, resolve, build node, placeholder

**Files:**
- Create: `src/lib/pdf/brandingImage.ts`
- Test: `src/lib/pdf/brandingImage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/brandingImage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  classifyLogo,
  resolveBrandingImage,
  buildLogoNode,
  placeholderLogoSvg,
} from './brandingImage';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';
const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(SVG_MARKUP, 'utf-8').toString('base64')}`;

const res = (body: BodyInit | null, type: string, ok = true): typeof fetch =>
  (async () => ({ ok, blob: async () => new Blob(body ? [body] : [], { type }) })) as unknown as typeof fetch;

describe('classifyLogo', () => {
  it('routes an svg data URL to svg with decoded markup', () => {
    const r = classifyLogo(SVG_DATA_URL);
    expect(r.kind).toBe('svg');
    expect(r.kind === 'svg' && r.markup).toContain('<svg');
  });
  it('routes a png data URL to raster', () => {
    expect(classifyLogo(PNG_DATA_URL)).toEqual({ kind: 'raster', dataUrl: PNG_DATA_URL });
  });
  it('treats a non-data string as raster (back-compat with test fixtures)', () => {
    expect(classifyLogo('LOGO')).toEqual({ kind: 'raster', dataUrl: 'LOGO' });
  });
  it('treats null/empty as none/empty and passes a BrandingImage through', () => {
    expect(classifyLogo(null)).toEqual({ kind: 'none', reason: 'empty' });
    expect(classifyLogo('')).toEqual({ kind: 'none', reason: 'empty' });
    expect(classifyLogo({ kind: 'svg', markup: SVG_MARKUP })).toEqual({ kind: 'svg', markup: SVG_MARKUP });
  });
});

describe('buildLogoNode', () => {
  it('emits a raster image node with width + margin (legacy parity shape)', () => {
    expect(buildLogoNode(PNG_DATA_URL, { width: 130, margin: [0, 0, 0, 5] })).toEqual({
      image: PNG_DATA_URL,
      width: 130,
      margin: [0, 0, 0, 5],
    });
  });
  it('emits an svg node for an svg data URL', () => {
    const node = buildLogoNode(SVG_DATA_URL, { width: 60 }) as { svg: string; width: number };
    expect(node.svg).toContain('<svg');
    expect(node.width).toBe(60);
  });
  it('uses fit:[w,h] when maxHeight is set (aspect-preserving cap)', () => {
    expect(buildLogoNode(PNG_DATA_URL, { width: 130, maxHeight: 48 })).toEqual({
      image: PNG_DATA_URL,
      fit: [130, 48],
    });
  });
  it('returns null for a missing logo', () => {
    expect(buildLogoNode(null, { width: 130 })).toBeNull();
  });
});

describe('resolveBrandingImage', () => {
  it('returns none/empty for a blank url', async () => {
    expect(await resolveBrandingImage(null)).toEqual({ kind: 'none', reason: 'empty' });
  });
  it('classifies a png response as raster', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res('PNGBYTES', 'image/png') });
    expect(r.kind).toBe('raster');
    expect(r.kind === 'raster' && r.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('classifies an svg response as svg', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res(SVG_MARKUP, 'image/svg+xml') });
    expect(r.kind).toBe('svg');
  });
  it('reports http_error on !ok', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res(null, 'image/png', false) });
    expect(r).toEqual({ kind: 'none', reason: 'http_error' });
  });
  it('reports unsupported for a non-image mime', async () => {
    const r = await resolveBrandingImage('x', { fetchImpl: res('hi', 'text/plain') });
    expect(r).toEqual({ kind: 'none', reason: 'unsupported' });
  });
});

describe('placeholderLogoSvg', () => {
  it('is an svg BrandingImage containing the label', () => {
    const p = placeholderLogoSvg('LOGO');
    expect(p.kind).toBe('svg');
    expect(p.markup).toContain('LOGO');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/brandingImage.test.ts`
Expected: FAIL — `Cannot find module './brandingImage'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pdf/brandingImage.ts`:

```ts
/**
 * Branding-image handling for document logos. One module owns: classifying a
 * logo input into a typed shape (raster / svg / none+reason), resolving a URL
 * over the network with a typed FAILURE REASON (for preview diagnostics), and
 * building the single pdfmake logo node used by BOTH the engine header and the
 * legacy document builders. Keeping it in one place means there is exactly one
 * logo code path across PDF / print / email / preview.
 */

import type { Content } from 'pdfmake/interfaces';

export type BrandingImageFailure =
  | 'empty'
  | 'http_error'
  | 'timeout'
  | 'decode_failed'
  | 'unsupported';

export type BrandingImage =
  | { kind: 'raster'; dataUrl: string }
  | { kind: 'svg'; markup: string }
  | { kind: 'none'; reason: BrandingImageFailure };

/** A human-readable note for a failed/empty logo, or null when the logo is fine. */
export function brandingImageWarning(img: BrandingImage): string | null {
  if (img.kind !== 'none') return null;
  if (img.reason === 'empty') return 'No logo uploaded — showing a placeholder.';
  return `Logo couldn't load (${img.reason}) — showing the text header.`;
}

function decodeBase64Utf8(b64: string): string {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Turn any logo input into a typed {@link BrandingImage}. The existing loaders
 * hand us a `data:<mime>;base64,…` string; the preview path may hand us an
 * already-resolved BrandingImage. A `data:image/svg+xml` string routes to svg
 * (decoded), any other non-empty string routes to raster, and null/'' is empty.
 */
export function classifyLogo(input: string | BrandingImage | null | undefined): BrandingImage {
  if (input == null || input === '') return { kind: 'none', reason: 'empty' };
  if (typeof input !== 'string') return input;
  if (/^data:image\/svg\+xml/i.test(input)) {
    const comma = input.indexOf(',');
    const payload = comma >= 0 ? input.slice(comma + 1) : '';
    try {
      const markup = /;base64/i.test(input.slice(0, comma)) ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
      return markup ? { kind: 'svg', markup } : { kind: 'none', reason: 'decode_failed' };
    } catch {
      return { kind: 'none', reason: 'decode_failed' };
    }
  }
  return { kind: 'raster', dataUrl: input };
}

/** Options describing how the logo node should be sized/placed. */
export interface LogoNodeOptions {
  width: number;
  height?: number | null;
  /** When > 0, the logo is fit into a [width, maxHeight] box (aspect-preserving). */
  maxHeight?: number | null;
  margin?: [number, number, number, number];
  alignment?: 'left' | 'center' | 'right';
}

/**
 * The single pdfmake logo node. Raster → `{ image }`, svg → `{ svg }`, none →
 * `null`. For raster with no maxHeight this is byte-identical to the inline
 * `{ image, width, … }` the builders used before (golden parity).
 */
export function buildLogoNode(
  input: string | BrandingImage | null | undefined,
  opts: LogoNodeOptions,
): Content | null {
  const img = classifyLogo(input);
  if (img.kind === 'none') return null;
  const node: Record<string, unknown> = {};
  if (opts.maxHeight != null && opts.maxHeight > 0) {
    node.fit = [opts.width, opts.maxHeight];
  } else {
    node.width = opts.width;
    if (opts.height != null && opts.height > 0) node.height = opts.height;
  }
  if (opts.margin) node.margin = opts.margin;
  if (opts.alignment) node.alignment = opts.alignment;
  if (img.kind === 'raster') node.image = img.dataUrl;
  else node.svg = img.markup;
  return node as Content;
}

/** A labeled placeholder logo box for previews when no real logo exists. */
export function placeholderLogoSvg(label = 'LOGO'): { kind: 'svg'; markup: string } {
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="48" viewBox="0 0 130 48">` +
    `<rect x="1" y="1" width="128" height="46" rx="4" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
    `<text x="65" y="29" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return { kind: 'svg', markup };
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const b64 = typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
    return `data:${blob.type || 'image/png'};base64,${b64}`;
  } catch {
    return null;
  }
}

export interface ResolveBrandingImageOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch `url` and classify it, returning a typed FAILURE REASON on any problem
 * (for surfacing a warning in the preview). Never throws. `fetchImpl` is
 * injectable so unit tests need no network.
 */
export async function resolveBrandingImage(
  url: string | null | undefined,
  opts: ResolveBrandingImageOptions = {},
): Promise<BrandingImage> {
  if (!url) return { kind: 'none', reason: 'empty' };
  const timeoutMs = opts.timeoutMs ?? 5000;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(url, { signal: controller.signal });
    if (!response.ok) return { kind: 'none', reason: 'http_error' };
    const blob = await response.blob();
    const mime = (blob.type || '').toLowerCase();
    if (mime.includes('svg')) {
      const markup = await blob.text();
      return markup ? { kind: 'svg', markup } : { kind: 'none', reason: 'decode_failed' };
    }
    if (/^image\/(png|jpe?g|gif|webp)/.test(mime)) {
      const dataUrl = await blobToDataUrl(blob);
      return dataUrl ? { kind: 'raster', dataUrl } : { kind: 'none', reason: 'decode_failed' };
    }
    return { kind: 'none', reason: 'unsupported' };
  } catch {
    return { kind: 'none', reason: controller.signal.aborted ? 'timeout' : 'http_error' };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf/brandingImage.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/brandingImage.ts src/lib/pdf/brandingImage.test.ts
git commit -m "feat(pdf): branding-image classify/resolve/buildLogoNode helper"
```

---

## Task 2: stop the silent null in `loadImageAsBase64`

**Files:**
- Modify: `src/lib/pdf/utils.ts:135-155`

- [ ] **Step 1: Add a logger import + warn on failure**

In `src/lib/pdf/utils.ts`, ensure the logger is imported at the top (add if missing):

```ts
import { logger } from '../logger';
```

Replace the body of `loadImageAsBase64` (lines 135-155) with:

```ts
export async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(`[pdf] image fetch failed (${response.status}) for ${url}`);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => {
        logger.warn(`[pdf] image decode failed for ${url}`);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    logger.warn(`[pdf] image load error for ${url}:`, err);
    return null;
  }
}
```

- [ ] **Step 2: Verify the existing util test still passes**

Run: `npx vitest run src/lib/pdf/utils.test.ts`
Expected: PASS (the existing `formatCapacity` tests are unaffected).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/utils.ts
git commit -m "fix(pdf): log (no longer swallow) logo/image load failures"
```

---

## Task 3: engine header renders via `buildLogoNode` (raster/svg/none)

**Files:**
- Modify: `src/lib/pdf/engine/types.ts:654-659` (EngineContext)
- Modify: `src/lib/pdf/engine/renderTemplate.ts:65-72` (signature + context)
- Modify: `src/lib/pdf/engine/sections/header.ts` (logo nodes)
- Modify: `src/lib/pdf/engine/headerLayouts.test.ts:35` (EngineContext field rename)
- Test: `src/lib/pdf/engine/headerLogo.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/headerLogo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48OABAAVEAqEuYekCAAAAAElFTkSuQmCC';
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', 'utf-8').toString('base64');

const render = (logo: string | null) => {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('invoice', config), ctx, logo, null));
};

describe('engine header logo routing', () => {
  it('emits an image node for a raster logo', () => {
    expect(render(PNG)).toContain('"image"');
  });
  it('emits an svg node for an svg logo', () => {
    const out = render(SVG);
    expect(out).toContain('"svg"');
    expect(out).toContain('<svg');
  });
  it('emits no image/svg logo node when there is no logo', () => {
    const out = render(null);
    expect(out).not.toContain(PNG);
    expect(out).not.toContain('<svg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/headerLogo.test.ts`
Expected: FAIL — the svg case still produces an `image` node (no `<svg>`), because the header currently does `{ image: logoBase64 }` for everything.

- [ ] **Step 3: Rename `EngineContext.logoBase64` → `logo`**

In `src/lib/pdf/engine/types.ts`, change the `EngineContext` interface (around line 654-659):

```ts
export interface EngineContext {
  config: DocumentTemplateConfig;
  ctx: TranslationContext;
  /** The logo: a base64 data-URL string OR a classified BrandingImage, or null. */
  logo?: import('../brandingImage').BrandingImage | string | null;
  qrCodeBase64?: string | null;
}
```

- [ ] **Step 4: Update `renderTemplate` signature + context**

In `src/lib/pdf/engine/renderTemplate.ts`, change lines 65-72:

```ts
export function renderTemplate(
  config: DocumentTemplateConfig,
  data: EngineDocData,
  ctx: TranslationContext,
  logo?: import('./../brandingImage').BrandingImage | string | null,
  qrCodeBase64?: string | null,
): TDocumentDefinitions {
  const engine: EngineContext = { config, ctx, logo, qrCodeBase64 };
```

(Only the parameter name/type and the context property name change; the rest of the function is untouched.)

- [ ] **Step 5: Route the header through `buildLogoNode`**

In `src/lib/pdf/engine/sections/header.ts`:

Add the import near the top (after the existing imports):

```ts
import { buildLogoNode, classifyLogo } from '../../brandingImage';
```

Change line 31 from `const { config, logoBase64 } = engine;` to:

```ts
  const { config, logo } = engine;
```

Change line 64 from `const showLogo = config.branding.logo && !!logoBase64;` to:

```ts
  const showLogo = config.branding.logo && classifyLogo(logo).kind !== 'none';
```

In the LEGACY branch, replace the logo column object (lines 70-72) — the `{ image: logoBase64 as string, width: 130, margin: [0, 0, 0, 5] }` — with:

```ts
          buildLogoNode(logo, { width: 130, margin: [0, 0, 0, 5] })!,
```

In the BUILDER branch, replace the `logoImage` construction (lines 123-129) with the classified logo:

```ts
  const brandLogo = wantLogo ? classifyLogo(logo) : null;
```

Then update the `LogoImage` type and `buildLetterhead`/`stackedLetterhead` to take the classified logo + sizing and call `buildLogoNode`. Replace lines 170, 176-274 (from `const out: Content[] = [buildLetterhead(...)]` through the end of `buildLetterhead`) with:

```ts
  const out: Content[] = [buildLetterhead(header, brandLogo, identityLines, primaryName, nameColor)];
  if (header.divider !== 'none') out.push(buildDivider(header, colors.accent));
  out.push(titleBlock);
  return out;
};

type BrandLogo = import('../../brandingImage').BrandingImage | null;

/** A vertically-stacked logo (top) + identity block, used by the centered layouts. */
function stackedLetterhead(logoNode: Content | null, lines: Content[]): Content[] {
  const items: Content[] = [];
  if (logoNode) items.push(logoNode);
  items.push(...lines);
  return items;
}

/** Arrange the letterhead (logo + identity) for the chosen header layout. */
function buildLetterhead(
  header: ResolvedHeader,
  logo: BrandLogo,
  identityLines: (align: Align) => Content[],
  primaryName: string,
  nameColor: string,
): Content {
  const margin: [number, number, number, number] = [0, 0, 0, 12];
  const h = header.logoHeight ?? undefined;

  switch (header.layout) {
    case 'modern':
      return {
        stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, alignment: 'center', margin: [0, 0, 0, 4] }), identityLines('center')),
        alignment: 'center',
        margin,
      };

    case 'minimal':
      return {
        columns: [
          buildLogoNode(logo, { width: Math.min(header.logoWidth, 90), height: h, margin: [0, 0, 10, 0] }) ?? { text: '', width: 'auto' },
          { text: primaryName, fontSize: 13, bold: true, color: nameColor, alignment: 'left', margin: [0, 6, 0, 0], width: '*' },
        ],
        columnGap: 8,
        margin,
      };

    case 'boxed':
      return {
        table: {
          widths: ['*'],
          body: [[{ stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, alignment: 'center', margin: [0, 0, 0, 4] }), identityLines('center')), alignment: 'center', margin: [8, 8, 8, 8] }]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
        margin,
      };

    case 'split': {
      const logoLeft = header.logoPlacement !== 'right';
      const logoCol = buildLogoNode(logo, { width: header.logoWidth, height: h, alignment: (logoLeft ? 'left' : 'right') }) ?? { text: '', width: 'auto' as const };
      const idCol = { stack: identityLines(logoLeft ? 'right' : 'left'), width: '*' as const };
      return { columns: logoLeft ? [logoCol, idCol] : [idCol, logoCol], columnGap: 12, margin };
    }

    case 'spreadsheet':
      return {
        columns: [
          buildLogoNode(logo, { width: Math.min(header.logoWidth, 80), height: h }) ?? { text: '', width: 'auto' },
          { stack: identityLines('right'), width: '*' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6],
      };

    case 'classic':
    default: {
      const node = buildLogoNode(logo, { width: header.logoWidth, height: h, margin: [0, 0, 0, 5] });
      if (!node) {
        return { stack: identityLines('center'), margin };
      }
      if (header.logoPlacement === 'center') {
        return { stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, alignment: 'center', margin: [0, 0, 0, 4] }), identityLines('center')), alignment: 'center', margin };
      }
      const logoLeft = header.logoPlacement !== 'right';
      const logoCol = buildLogoNode(logo, { width: header.logoWidth, height: h, margin: [0, 0, 0, 5], alignment: (logoLeft ? 'left' : 'right') })!;
      const idCol = { stack: identityLines(logoLeft ? 'right' : 'left'), width: '*' as const };
      return { columns: logoLeft ? [logoCol, idCol] : [idCol, logoCol], margin };
    }
  }
}
```

> Note: the original `classic` non-center branch set `alignment` on the logo column. The new code preserves that. The original `split`/`spreadsheet` did not set a bottom margin on the logo; the new calls omit `margin`, matching. Run the header parity tests in Step 7 to confirm.

- [ ] **Step 6: Update the `headerLayouts.test.ts` EngineContext field**

In `src/lib/pdf/engine/headerLayouts.test.ts:35`, change `logoBase64: 'LOGO'` to `logo: 'LOGO'`:

```ts
  return { config, ctx, logo: 'LOGO', qrCodeBase64: null };
```

- [ ] **Step 7: Run the new test + the header/parity suites**

Run: `npx vitest run src/lib/pdf/engine/headerLogo.test.ts src/lib/pdf/engine/headerLayouts.test.ts src/lib/pdf/engine/invoiceParity.test.ts src/lib/pdf/engine/renderTemplate.test.ts`
Expected: PASS. If a parity test fails, diff the produced logo node against the original inline object and align the `buildLogoNode` opts.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pdf/engine/types.ts src/lib/pdf/engine/renderTemplate.ts src/lib/pdf/engine/sections/header.ts src/lib/pdf/engine/headerLayouts.test.ts src/lib/pdf/engine/headerLogo.test.ts
git commit -m "feat(pdf-engine): render header logo via buildLogoNode (svg + raster)"
```

---

## Task 4: legacy builders render the logo via `buildLogoNode`

**Files (modify):**
- `src/lib/pdf/documents/InvoiceDocument.ts:38-45`
- `src/lib/pdf/documents/QuoteDocument.ts` (same pattern, ~line 38)
- `src/lib/pdf/documents/PaymentReceiptDocument.ts` (same pattern, ~line 38)
- `src/lib/pdf/documents/OfficeReceiptDocument.ts:43-50`
- `src/lib/pdf/documents/CustomerCopyDocument.ts` (same pattern, ~line 41)
- `src/lib/pdf/documents/CheckoutFormDocument.ts` (same pattern, ~line 40)
- `src/lib/pdf/documents/CreditNoteDocument.ts:46-49`
- `src/lib/pdf/documents/ReportDocument.ts:163-170`
- `src/lib/pdf/documents/CaseLabelDocument.ts:22-27`
- Test: `src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts` (guard, + 1 new svg assertion)

For every builder, add this import near the top:

```ts
import { buildLogoNode } from '../brandingImage';
```

- [ ] **Step 1: Pattern A — guarded letterhead (Invoice, Quote, PaymentReceipt, OfficeReceipt, CustomerCopy, CheckoutForm, Report)**

Each has a block of the form:

```ts
  if (logoBase64) {
    headerContent.push({
      columns: [
        {
          image: logoBase64,
          width: 130,
          margin: [0, 0, 0, 5],
        },
        {
          stack: [ /* identity lines */ ],
```

Replace the `if (logoBase64) {` line with a node-guarded version and swap the image object for the node. The edit for **InvoiceDocument.ts** (lines 38-45):

```ts
  const invoiceLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (invoiceLogoNode) {
    headerContent.push({
      columns: [
        invoiceLogoNode,
        {
          stack: [
```

Apply the identical transformation to `QuoteDocument.ts`, `PaymentReceiptDocument.ts`, `OfficeReceiptDocument.ts`, `CustomerCopyDocument.ts`, `CheckoutFormDocument.ts`, and `ReportDocument.ts` — in each, name the local `<docLogoNode>` (e.g. `quoteLogoNode`), guard with `if (<docLogoNode>) {`, and replace the `{ image: logoBase64, width: 130, margin: [0, 0, 0, 5] }` object with the local. (CreditNote uses the one-line form `{ image: logoBase64, width: 130, margin: [0, 0, 0, 5] }` at line 49 — same replacement.)

For **CreditNoteDocument.ts** (lines 46-49):

```ts
  const creditNoteLogoNode = buildLogoNode(logoBase64, { width: 130, margin: [0, 0, 0, 5] });
  if (creditNoteLogoNode) {
    headerContent.push({
      columns: [
        creditNoteLogoNode,
```

- [ ] **Step 2: Pattern B — CaseLabel inline ternary**

In `src/lib/pdf/documents/CaseLabelDocument.ts`, replace the ternary (lines 22-33):

```ts
      logoBase64
        ? {
            image: logoBase64,
            width: 60,
            margin: [0, 0, 0, 0],
          }
        : {
            text: companyName,
            fontSize: 12,
            bold: true,
            color: PDF_COLORS.text,
          },
```

with:

```ts
      buildLogoNode(logoBase64, { width: 60, margin: [0, 0, 0, 0] }) ?? {
        text: companyName,
        fontSize: 12,
        bold: true,
        color: PDF_COLORS.text,
      },
```

- [ ] **Step 3: Run the golden characterization suite (raster parity)**

Run: `npx vitest run src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts`
Expected: PASS with **no snapshot changes**. If a snapshot diff appears, the produced raster node differs from the original — reconcile the `buildLogoNode` opts (width/margin) for that builder. Do NOT run with `-u` unless you have confirmed the only difference is intended.

- [ ] **Step 4: Add an SVG assertion to the golden suite**

Append to `src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts` (adapt the import/builder name to the file's existing style):

```ts
import { buildInvoiceDocument } from '../InvoiceDocument';

describe('legacy builder logo — svg routing', () => {
  it('renders an svg logo as an svg node, not an image', () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', 'utf-8').toString('base64');
    // Reuse whatever sample invoice data the file already builds; if a helper
    // exists (e.g. SAMPLE_INVOICE), pass it. Otherwise import the existing fixture.
    const def = JSON.stringify(buildInvoiceDocument(SAMPLE_INVOICE, CTX, svg));
    expect(def).toContain('"svg"');
  });
});
```

> If the test file does not already expose a `SAMPLE_INVOICE` + `CTX`, reuse the exact fixtures the existing characterization cases build for `buildInvoiceDocument` (read the top of the file). The assertion only needs a logo string passed in.

- [ ] **Step 5: Run the suite + type-check**

Run: `npx vitest run src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/documents/
git commit -m "fix(pdf): legacy builders render logo via buildLogoNode (svg support)"
```

---

## Task 5: sample preview shows the real logo (or a labeled placeholder) + warnings

**Files:**
- Modify: `src/lib/pdf/engine/previewTemplate.ts`
- Modify: `src/components/settings/documents/TemplateGalleryModal.tsx:112-115`
- Test: `src/lib/pdf/engine/previewTemplate.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/engine/previewTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePreviewLogo } from './previewTemplate';
import { placeholderLogoSvg } from '../brandingImage';

describe('resolvePreviewLogo', () => {
  it('returns the real logo + no warning when one is resolved', () => {
    const real = { kind: 'raster' as const, dataUrl: 'data:image/png;base64,AAAA' };
    const r = resolvePreviewLogo(real);
    expect(r.logo).toEqual(real);
    expect(r.warnings).toEqual([]);
  });
  it('returns the labeled placeholder + an info warning when no logo', () => {
    const r = resolvePreviewLogo({ kind: 'none', reason: 'empty' });
    expect(r.logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(r.warnings[0]).toContain('No logo uploaded');
  });
  it('returns the placeholder + a failure warning when the logo errored', () => {
    const r = resolvePreviewLogo({ kind: 'none', reason: 'http_error' });
    expect(r.logo).toEqual(placeholderLogoSvg('LOGO'));
    expect(r.warnings[0]).toContain("couldn't load");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/previewTemplate.test.ts`
Expected: FAIL — `resolvePreviewLogo` is not exported.

- [ ] **Step 3: Update `previewTemplate.ts`**

In `src/lib/pdf/engine/previewTemplate.ts`:

Add imports:

```ts
import { brandingImageWarning, placeholderLogoSvg, type BrandingImage } from '../brandingImage';
```

Add the result type + the pure helper (after `PREVIEW_CTX_EN`):

```ts
export interface PreviewResult {
  url: string;
  warnings: string[];
}

/**
 * Decide which logo a sample preview should draw: the real resolved logo when
 * present, else a labeled placeholder box (so the layout still shows where the
 * logo goes), plus any warning to surface in the Studio.
 */
export function resolvePreviewLogo(
  resolved: BrandingImage | null | undefined,
): { logo: BrandingImage; warnings: string[] } {
  if (resolved && resolved.kind !== 'none') return { logo: resolved, warnings: [] };
  const warning = brandingImageWarning(resolved ?? { kind: 'none', reason: 'empty' });
  return { logo: placeholderLogoSvg('LOGO'), warnings: warning ? [warning] : [] };
}
```

Change the `previewTemplate` signature + body to accept the resolved logo and return a `PreviewResult` (replace lines 68-102):

```ts
export function previewTemplate(
  docType: TemplateDocumentType,
  config: DocumentTemplateConfig,
  ctx: TranslationContext = PREVIEW_CTX_EN,
  logo?: BrandingImage | null,
): Promise<PreviewResult> {
  const engineData = buildPreviewEngineData(docType, config);
  const { logo: previewLogo, warnings } = resolvePreviewLogo(logo);
  const docDefinition = renderTemplate(config, engineData, ctx, previewLogo, null);

  const render = new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob(
        (blob: Blob) => resolve(URL.createObjectURL(blob)),
        undefined,
        (err: unknown) => reject(err instanceof Error ? err : new Error('PDF rasterization failed')),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render template preview'));
    }
  });

  return withTimeout(render, PREVIEW_TIMEOUT_MS, 'Preview render timed out').then((url) => ({ url, warnings }));
}
```

> Keep `PREVIEW_PLACEHOLDER_IMAGE` exported — `previewRasterization.test.tsx` imports it and passes it directly to `renderTemplate` (a valid raster string), so that test is unaffected.

- [ ] **Step 4: Update the gallery caller**

In `src/components/settings/documents/TemplateGalleryModal.tsx`, the gallery has no tenant logo to show, so it uses the placeholder. Change lines 112-115 from:

```ts
      const url = await previewTemplate(docType, config);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setPreviewUrl(url);
```

to:

```ts
      const { url } = await previewTemplate(docType, config);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setPreviewUrl(url);
```

- [ ] **Step 5: Run the new test + the rasterization regression**

Run: `npx vitest run src/lib/pdf/engine/previewTemplate.test.ts src/lib/pdf/engine/previewRasterization.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors (the `TemplateStudio` caller is updated in Task 6; if tsc flags the `previewTemplate(...)` return-type mismatch there now, proceed to Task 6 — these two tasks land together).

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/engine/previewTemplate.ts src/lib/pdf/engine/previewTemplate.test.ts src/components/settings/documents/TemplateGalleryModal.tsx
git commit -m "feat(pdf-preview): real-logo-or-placeholder + warnings in sample preview"
```

---

## Task 6: record preview returns warnings + routes SVG

**Files:**
- Modify: `src/lib/pdf/previewRecord.ts`

- [ ] **Step 1: Switch the logo to `resolveBrandingImage` and return warnings**

In `src/lib/pdf/previewRecord.ts`:

Add imports:

```ts
import { resolveBrandingImage, brandingImageWarning, type BrandingImage } from '../brandingImage';
import type { PreviewResult } from './engine/previewTemplate';
```

Change the `previewDocumentForRecord` return type (line 96-100) to `Promise<PreviewResult>` and replace the logo loading. Replace the logo type declaration (line 102) and the three `safeImage(... logo_url ...)` calls so the logo is resolved via `resolveBrandingImage` while the QR stays on `safeImage`. Concretely, change `let logo: string | null = null;` to:

```ts
  let logo: BrandingImage = { kind: 'none', reason: 'empty' };
```

and each branch's `Promise.all([ safeImage(logo_url), safeImage(qr_url) ])` to resolve the logo separately, e.g. for the invoice branch (lines 108-111):

```ts
    [logo, qr] = await Promise.all([
      resolveBrandingImage(data.companySettings.branding?.logo_url),
      safeImage(data.companySettings.branding?.qr_code_invoice_url),
    ]);
```

(apply the same change to the `quote` and `payment_receipt` branches, keeping their respective QR URLs).

Change the render + return (lines 130-142) to thread warnings:

```ts
  const docDefinition = renderTemplate(config, engineData, PREVIEW_CTX_EN, logo, qr);
  const warning = brandingImageWarning(logo);
  const warnings = warning ? [warning] : [];
  const render = new Promise<string>((resolve, reject) => {
    try {
      createPdfWithFonts(docDefinition).getBlob(
        (blob: Blob) => resolve(URL.createObjectURL(blob)),
        undefined,
        (err: unknown) => reject(err instanceof Error ? err : new Error('PDF rasterization failed')),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to render record preview'));
    }
  });
  return withTimeout(render, PREVIEW_TIMEOUT_MS, 'Preview render timed out').then((url) => ({ url, warnings }));
```

> `safeImage` (used for the QR) stays as-is. `renderTemplate` accepts a `BrandingImage` directly (Task 3).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors except the `TemplateStudio` consumer (fixed in Task 7, landing together).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/previewRecord.ts
git commit -m "feat(pdf-preview): record preview routes svg + surfaces logo warnings"
```

---

## Task 7: TemplateStudio resolves the real logo + shows warning chips

**Files:**
- Modify: `src/components/settings/documents/TemplateStudio.tsx`

- [ ] **Step 1: Resolve the tenant logo once**

In `src/components/settings/documents/TemplateStudio.tsx`, add state + an effect that loads the real logo (after the `records` state, ~line 121). Add imports at the top:

```ts
import { getCompanyLogo } from '../../../lib/fileStorageService';
import { resolveBrandingImage, type BrandingImage } from '../../../lib/pdf/brandingImage';
```

Add state + warnings state (near line 131-133):

```ts
  const [tenantLogo, setTenantLogo] = useState<BrandingImage | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
```

Add an effect (after the records effect, ~line 195):

```ts
  useEffect(() => {
    let cancelled = false;
    getCompanyLogo('primary')
      .then((url) => resolveBrandingImage(url))
      .then((img) => { if (!cancelled) setTenantLogo(img); })
      .catch(() => { if (!cancelled) setTenantLogo({ kind: 'none', reason: 'empty' }); });
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 2: Pass the logo to the sample preview + consume warnings**

In the preview effect (lines 144-158), change the two branches to read `{ url, warnings }` and pass `tenantLogo` to the sample path:

```ts
        let url: string;
        let warnings: string[] = [];
        if (dataSource === 'sample') {
          const { previewTemplate } = await import('../../../lib/pdf/engine/previewTemplate');
          ({ url, warnings } = await previewTemplate(docType, resolved, undefined, tenantLogo));
        } else {
          const { previewDocumentForRecord } = await import('../../../lib/pdf/previewRecord');
          ({ url, warnings } = await previewDocumentForRecord(docType, dataSource, resolved));
        }
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewWarnings(warnings);
```

Add `tenantLogo` to the effect's dependency array (line 171): `}, [resolved, dataSource, docType, tenantLogo]);`

- [ ] **Step 3: Render the warning chip in the preview pane**

In the preview pane header (around the data-source selector, ~line 403-416), add a non-blocking chip below the controls. Insert after the preview title row:

```tsx
        {previewWarnings.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {previewWarnings.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 rounded-md bg-warning-muted px-2 py-1 text-xs font-medium text-warning-foreground">
                {w}
              </span>
            ))}
          </div>
        )}
```

> Uses the semantic `warning`/`warning-muted`/`warning-foreground` tokens (no raw hex), per `DESIGN.md`.

- [ ] **Step 4: Type-check + run the documents/preview suites**

Run: `npx tsc --noEmit && npx vitest run src/lib/pdf/`
Expected: 0 type errors; all PDF tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/documents/TemplateStudio.tsx
git commit -m "feat(studio): show real tenant logo in sample preview + logo warning chips"
```

---

## Task 8: logo bottom-margin + max-height controls

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts:151-160` (HeaderConfig)
- Modify: `src/lib/pdf/engine/branding.ts:224-245` (ResolvedHeader + resolveHeader)
- Modify: `src/lib/pdf/engine/sections/header.ts` (apply margin + maxHeight in classic layout)
- Modify: `src/components/settings/documents/tabs/HeaderFooterTab.tsx:60-77` (UI)
- Test: `src/lib/pdf/engine/branding.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/pdf/engine/branding.test.ts`:

```ts
import { resolveHeader } from './branding';

describe('resolveHeader logo margin/maxHeight', () => {
  it('defaults logoMarginBottom to 5 and logoMaxHeight to null', () => {
    const r = resolveHeader({ header: {} });
    expect(r.logoMarginBottom).toBe(5);
    expect(r.logoMaxHeight).toBeNull();
  });
  it('passes through configured values', () => {
    const r = resolveHeader({ header: { logoMarginBottom: 12, logoMaxHeight: 40 } });
    expect(r.logoMarginBottom).toBe(12);
    expect(r.logoMaxHeight).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/engine/branding.test.ts`
Expected: FAIL — `logoMarginBottom`/`logoMaxHeight` are not on `ResolvedHeader`.

- [ ] **Step 3: Extend `HeaderConfig`**

In `src/lib/pdf/templateConfig.ts`, add to `HeaderConfig` (after `logoHeight`, line 158):

```ts
  /** Bottom margin under the logo in points. Default 5 (today's value). */
  logoMarginBottom?: number;
  /** Cap the logo height in points (aspect-preserving via pdfmake `fit`). 0/undefined = no cap. */
  logoMaxHeight?: number;
```

- [ ] **Step 4: Extend `ResolvedHeader` + `resolveHeader`**

In `src/lib/pdf/engine/branding.ts`, add to `ResolvedHeader` (after `logoHeight`, line 228):

```ts
  logoMarginBottom: number;
  logoMaxHeight: number | null;
```

And in `resolveHeader` (after the `logoHeight` line, ~242):

```ts
    logoMarginBottom: typeof h?.logoMarginBottom === 'number' && h.logoMarginBottom >= 0 ? h.logoMarginBottom : 5,
    logoMaxHeight: typeof h?.logoMaxHeight === 'number' && h.logoMaxHeight > 0 ? h.logoMaxHeight : null,
```

- [ ] **Step 5: Apply in the classic header layout**

In `src/lib/pdf/engine/sections/header.ts`, in `buildLetterhead`'s `classic` branch (the `node`/`logoCol` calls from Task 3), thread the new values. Change the classic branch's `buildLogoNode` calls to use `header.logoMarginBottom` and `header.logoMaxHeight`:

```ts
    case 'classic':
    default: {
      const node = buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, margin: [0, 0, 0, header.logoMarginBottom] });
      if (!node) {
        return { stack: identityLines('center'), margin };
      }
      if (header.logoPlacement === 'center') {
        return { stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, alignment: 'center', margin: [0, 0, 0, 4] }), identityLines('center')), alignment: 'center', margin };
      }
      const logoLeft = header.logoPlacement !== 'right';
      const logoCol = buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, margin: [0, 0, 0, header.logoMarginBottom], alignment: (logoLeft ? 'left' : 'right') })!;
      const idCol = { stack: identityLines(logoLeft ? 'right' : 'left'), width: '*' as const };
      return { columns: logoLeft ? [logoCol, idCol] : [idCol, logoCol], margin };
    }
```

> Default `logoMarginBottom` is 5 (today's value) and `logoMaxHeight` is null (no `fit`), so the default output is unchanged — parity holds.

- [ ] **Step 6: Add the UI controls**

In `src/components/settings/documents/tabs/HeaderFooterTab.tsx`, add a second grid row after the existing logo width/height grid (after line 77):

```tsx
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Logo bottom margin"
            suffix="pt"
            value={header?.logoMarginBottom ?? 5}
            min={0}
            max={40}
            onChange={(v) => api.setHeader({ logoMarginBottom: v })}
          />
          <NumberField
            label="Logo max height"
            suffix="pt, 0 = none"
            value={header?.logoMaxHeight ?? 0}
            min={0}
            max={200}
            onChange={(v) => api.setHeader({ logoMaxHeight: v > 0 ? v : undefined })}
          />
        </div>
```

> `setHeader` already accepts `Partial<HeaderConfig>`, so no `StudioApi` change is needed.

- [ ] **Step 7: Run tests + type-check**

Run: `npx vitest run src/lib/pdf/engine/branding.test.ts src/lib/pdf/engine/headerLayouts.test.ts src/lib/pdf/engine/invoiceParity.test.ts && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdf/templateConfig.ts src/lib/pdf/engine/branding.ts src/lib/pdf/engine/sections/header.ts src/components/settings/documents/tabs/HeaderFooterTab.tsx src/lib/pdf/engine/branding.test.ts
git commit -m "feat(studio): logo bottom-margin + max-height controls"
```

---

## Final verification (after all tasks)

- [ ] **Full suite:** `npx vitest run` → all green.
- [ ] **Type gate:** `npx tsc --noEmit` → 0 errors.
- [ ] **Lint (changed files):** `npx eslint src/lib/pdf/brandingImage.ts src/lib/pdf/engine/sections/header.ts src/lib/pdf/documents/ src/components/settings/documents/` → clean.
- [ ] **Manual smoke (optional):** in Settings → Documents Studio, the sample preview shows the real logo for a logo-bearing tenant; the placeholder + warning chip appears when no logo; an SVG test logo renders.
- [ ] **Push + open draft PR.**

## Spec coverage check

- Logo renders in PDF/print/email → Task 4 (legacy builders, the live path). ✅
- Logo renders in both previews → Tasks 5, 6, 7. ✅
- SVG support → Tasks 1 (classify), 3 (engine), 4 (legacy). ✅
- Real logo in sample preview / labeled placeholder → Tasks 5, 7. ✅
- No silent failures → Task 2 (log) + Tasks 5/6/7 (surfaced warnings). ✅
- Logo margin + max-height controls → Task 8. ✅
- Golden/parity preserved → Tasks 3, 4 (run characterization + parity suites). ✅
