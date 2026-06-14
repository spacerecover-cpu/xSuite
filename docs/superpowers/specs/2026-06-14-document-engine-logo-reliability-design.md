# Document Engine Overhaul — Phase 1: Logo Reliability (Design)

- **Date:** 2026-06-14
- **Status:** Approved (design) — pending spec review → implementation plan
- **Author:** Claude (brainstorming session)
- **Scope of this spec:** Phase 1 only. Phases 2–4 are recorded in the Roadmap section but are out of scope here and each gets its own spec → plan → build cycle.

---

## 1. Background

A tenant reported that the **company logo does not appear in generated documents and previews**, and asked for an "enterprise-grade" document engine with full control over branding, localization, translation behavior, and presentation.

Investigation found the platform already has a mature, config-driven **Template Studio** (`src/components/settings/documents/TemplateStudio.tsx`) whose live preview *is* the real pdfmake engine (not a mock), shared by PDF, print, and email paths. Logo placement (left/center/right), width/height sizing, 6 header layouts, fonts, colors, page numbers, footer, watermark resolver, and section show/hide already exist. So most of the original request is already built; the genuine gaps are smaller and concrete.

This spec addresses the first gap: **the logo must render reliably across every output, including the design-time preview, and must never fail invisibly.**

## 2. Evidence (live diagnosis, project `ssmbegiyjivrcwgcqutu`)

Read-only queries against the live database established the *actual* state, replacing speculation:

- The `company-assets` storage bucket **is public** (`storage.buckets.public = true`).
- The tenant that has uploaded a logo has a valid **8 KB `image/png`** at a reachable public URL; all stored logo objects are PNG.
- A second tenant has **no logo** (`branding.logo_url IS NULL`) — its text-only header is *correct*, not a bug. This is the likely source of the reported screenshot.

The reliability weaknesses are therefore not "the renderer is broken." They are:

1. **The Studio sample-data preview never shows the real logo.** `previewTemplate()` injects a 1×1 gray placeholder (`PREVIEW_PLACEHOLDER_IMAGE`) purely so the header branch renders. Only `previewDocumentForRecord()` loads the real logo. Designing a template therefore never shows the tenant's actual logo — reads as "logo missing in previews."
2. **`loadImageAsBase64()` (`src/lib/pdf/utils.ts:135`) swallows every failure silently** — both `!response.ok` and the `catch` return `null` with no log and no signal. Consequences:
   - **SVG logos are guaranteed to fail.** `image/svg+xml` is an allowed upload type (`fileStorageService.ts:37`), but pdfmake's `{ image }` node cannot render SVG (it needs the separate `{ svg }` node). An SVG upload becomes a `data:image/svg+xml` URL that renders nothing.
   - Timeouts (5s cap), stale/renamed object paths (404), and any future non-public/cross-origin URL all collapse to `null` with zero diagnostics.

## 3. Goals / Non-goals

**Goals (Phase 1)**
- Logo renders correctly in **PDF, print, email, and both preview modes** from a single code path.
- **SVG logos render** (native pdfmake `svg` node), alongside PNG/JPEG/WebP/GIF.
- The **sample preview shows the real tenant logo**; when none exists, a clearly-labeled placeholder box (not an invisible pixel).
- Load failures are **never silent**: typed reason, logged, and surfaced as a non-blocking warning in the Studio. The document still renders (text fallback) — never blank or broken.
- Fold in the two small missing branding controls: logo **bottom-margin/offset** and **max-height** auto-scale (alignment + width/height already exist).

**Non-goals (deferred)**
- Translation controls → Phase 2.
- Company stamp, signature show/hide, watermark UI, conditional blocks → Phase 3.
- Preview zoom / fit-to-page / page-break visualization / mobile responsiveness → Phase 4.
- SVG **rasterize-on-upload** — not needed; native pdfmake `svg` node is used. Revisit only if a real SVG defeats pdfmake's renderer.
- No database schema change (logo storage/columns are sufficient).

## 4. Chosen approach

**Centralized branding-image resolver + render-time format routing** (Approach ① from brainstorming). One function classifies the image; the header renderer routes to the correct pdfmake node; every path uses both. Rejected alternatives: rasterize-on-upload (heavier, doesn't fix diagnostics) and minimal-patch (drops SVG, stays fragmented).

## 5. Detailed design

### 5.1 New module — `src/lib/pdf/brandingImage.ts`

```ts
export type BrandingImage =
  | { kind: 'raster'; dataUrl: string }       // data:image/png|jpeg|gif|webp;base64,…
  | { kind: 'svg'; markup: string }            // decoded <svg>…</svg> text
  | { kind: 'none'; reason: BrandingImageFailure };

export type BrandingImageFailure =
  | 'empty'          // url null/blank
  | 'http_error'     // !response.ok (403/404/…)
  | 'timeout'        // exceeded timeoutMs
  | 'decode_failed'  // blob/FileReader failure
  | 'unsupported';   // mime not an accepted image type

export async function resolveBrandingImage(
  url: string | null | undefined,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<BrandingImage>;
```

Behaviour:
- `empty` short-circuits when no URL.
- Fetches with an `AbortController` timeout (default 5000 ms) → `timeout`/`http_error` as appropriate.
- Reads the blob; the MIME type comes from `blob.type` (fallback: sniff the data-URL prefix).
  - `image/svg+xml` → decode UTF-8 text → `{ kind: 'svg', markup }`.
  - `image/png | jpeg | gif | webp` → base64 data URL → `{ kind: 'raster', dataUrl }`.
  - anything else → `unsupported`.
- `fetchImpl` is injectable so unit tests need no network.
- Pure aside from the injected fetch; no Supabase coupling (caller supplies the URL).

`loadImageAsBase64` stays for the QR code (always a generated PNG) and any non-logo caller; the logo paths switch to `resolveBrandingImage`.

### 5.2 Header renderer — `src/lib/pdf/engine/sections/header.ts`

- `EngineContext` gains `logo?: BrandingImage | null` (replacing the bare `logoBase64?: string`). A back-compat normalizer (`toBrandingImage`) maps any incoming `data:image/…;base64` string to `{ kind: 'raster' }`, so existing callers that still pass a string keep working during the migration.
- `showLogo` = `config.branding.logo && logo?.kind !== 'none' && !!logo`.
- The shared "logo node" builder returns:
  - `{ image: logo.dataUrl, width, …height }` for `raster`,
  - `{ svg: logo.markup, width, …height }` for `svg`.
- Both legacy and builder header paths use this single node builder; placement, divider, and the 6 layouts are otherwise unchanged. `none` → the existing centered identity text block.

### 5.3 Wire-through

- `renderTemplate(config, data, ctx, logo, qr)` — the `logo` parameter type widens from `string | null` to `BrandingImage | string | null` (normalized internally).
- `pdfService.ts` document builders, `previewRecord.ts`, and `previewTemplate.ts` each call `resolveBrandingImage(branding.logo_url)` once and pass the result through. QR continues via `loadImageAsBase64`.

### 5.4 Preview fidelity — `previewTemplate.ts` (sample mode)

- Load the **real** logo via `resolveBrandingImage(companySettings.branding.logo_url)`.
- If `none`, build a labeled placeholder: a bordered box with centered muted text "LOGO" at the configured logo width, so layout/position is visible without implying a broken image. (Replaces `PREVIEW_PLACEHOLDER_IMAGE`.)

### 5.5 Diagnostics surfacing

- `previewTemplate()` / `previewDocumentForRecord()` return `{ url, warnings: string[] }` instead of a bare URL string. A `none` (non-`empty`) logo result adds a human-readable warning, e.g. `Logo couldn't load (http_error) — showing text header.` `empty` adds an informational note only ("No logo uploaded").
- This return shape changes from a bare URL string to an object, so both preview callers are updated: `TemplateStudio.tsx` reads `.url` **and** renders `warnings` as a small non-blocking chip in the preview pane header (semantic `warning`/`info` tokens — no raw hex; per DESIGN.md); `TemplateGalleryModal.tsx` reads `.url` only.
- All failure reasons are also `logger.warn`-logged at resolve time.

### 5.6 Small control fold-ins — `HeaderFooterTab.tsx` + `templateConfig.ts`

- Add `header.logoMarginBottom` (number, pt) and `header.logoMaxHeight` (number, pt; `0` = no cap) to the header config, with `NumberField` controls. Resolver clamps/auto-scales width against `logoMaxHeight`. Defaults preserve current output (margin as today, no cap), so the golden/parity wall is unaffected.

## 6. Data flow

```
upload (PNG/JPG/SVG/WebP/GIF)
  → company_settings.branding.logo_url (public Supabase URL)
  → resolveBrandingImage(url)            ── one classifier ──
  → BrandingImage (raster | svg | none+reason)
  → header renderer → pdfmake { image } | { svg } | text fallback
  → SAME node for PDF · print · email · record-preview · sample-preview
  (none+reason → logger.warn + Studio warning chip)
```

## 7. Error handling

- No path throws on a bad logo; worst case is a text header plus a surfaced warning.
- Timeout is bounded (`AbortController`, 5 s default, configurable).
- SVG markup is size-capped (reject `unsupported` if absurdly large) to avoid pathological pdfmake input.
- Existing tenant data needs no migration: PNG logos already classify as `raster`; null logos classify as `empty` (informational).

## 8. Testing (TDD — write tests first)

**Unit — `brandingImage.test.ts`** (injected `fetchImpl`, no network):
- png/jpeg/webp/gif → `raster` with correct data-URL prefix.
- svg → `svg` with decoded markup.
- null/'' → `none/empty`; 404 → `none/http_error`; abort → `none/timeout`; `text/plain` → `none/unsupported`.

**Engine — header rendering** (extend `templateWiring.test` or new `headerLogo.test`):
- `raster` logo → content tree contains an `image` node at the configured width.
- `svg` logo → content tree contains an `svg` node.
- `none` → centered identity text block, no image/svg node.
- `logoMaxHeight`/`logoMarginBottom` reflected in the node.

**Preview**:
- sample mode calls `resolveBrandingImage` with the tenant logo URL (mock) and, when `none`, emits the labeled placeholder + a warning.
- `warnings[]` propagates from resolve → preview return value.

**Gates:** `npx tsc --noEmit` = 0 · `eslint` (changed files) clean · `vitest run` green (incl. existing parity/golden suite unchanged).

## 9. Rollout / verification

- Manual: in Template Studio, sample preview shows the real logo for the logo-bearing tenant; a forced-bad URL shows the warning chip + text header; an SVG test logo renders.
- Squash-merge friendly: single contained PR; no schema change; defaults preserve all existing golden output.

## 10. Roadmap (subsequent phases — out of scope here)

- **Phase 2 — Granular translation controls.** `company_settings.localization.translation_policy` (`all` | `labels_only` | `system_only` | `never_customer_data` | `custom` + field lists), a central `applyTranslationPolicy()` applied in the engine adapters, and a Studio/Localization UI. Default `all` preserves current behavior.
- **Phase 3 — Customization gaps.** Company stamp (image + placement), signature show/hide, a watermark UI for the existing resolver, and conditional blocks (show a section only when a predicate holds).
- **Phase 4 — Preview UX.** Zoom, fit-to-page/fit-width, page-break clarity, and tablet/mobile responsiveness for the Studio preview pane.

Each phase will be brainstormed and specced independently before implementation.
