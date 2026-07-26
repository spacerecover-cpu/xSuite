# PDF Template Module — QA Audit (Pass 1)

**Date:** 2026-07-26
**Scope:** `src/lib/pdf/**` (engine, sections, adapters), `src/components/settings/documents/**` (Template Studio + tabs), `src/lib/templateEngine.ts`, `src/lib/pdf/engine/previewTemplate.ts`, `src/lib/pdf/previewRecord.ts`
**Method:** static / code-level audit against the running implementation. See **Coverage & gaps** for what this pass did *not* cover.

---

## Executive summary

The single most important architectural finding is **positive** and worth stating up front, because it changes how the rest of this report should be read:

> **The live preview is not an HTML mock.** `previewTemplate()` runs the *same* `renderTemplate()` → pdfmake pipeline as production generation, and renders a real PDF blob into an `<iframe>`. Whole classes of "preview vs PDF" drift (CSS-vs-PDF font metrics, box model differences, HTML table vs pdfmake table) **cannot occur by construction**.

Preview/PDF mismatches are therefore *not* systemic. They are a small number of specific, fixable divergences — documented as PDF-01…PDF-04 below.

The defects that matter most are: a **feature-flagged engine split** that makes Arabic previews render through a different engine than downloads (PDF-01), a **documented watermark-image option that renders nothing** (RND-01), **page-size-dependent geometry hardcoded to A4 portrait** (RND-02), **no input validation on page margins** (STU-01), and **silent placeholder failures in customer-facing documents** (BIND-01).

**Findings this pass: 25** (4 Critical/High parity · 8 rendering · 7 Studio UX · 6 data-binding). Target was 50+; see **Coverage & gaps** for exactly what remains and why.

---

## Severity / priority key

| Severity | Meaning |
|---|---|
| **Critical** | Wrong or missing output in a customer-facing document; data integrity |
| **High** | Visible defect on common configs, or a documented feature that does not work |
| **Medium** | Visible on specific configs, or a real UX/robustness gap |
| **Low** | Cosmetic, edge-case, or improvement opportunity |

---

# 1. Live Preview vs Generated PDF

### PDF-01 — Arabic documents preview through Typst but download through pdfmake
- **Severity:** Critical · **Priority:** P0
- **Description:** `isTypstEngineEnabled()` gates an alternative Typst/WASM renderer. It is referenced in exactly two places — `engine/previewTemplate.ts:156` and `previewRecord.ts:164` — **both preview paths**. The generator (`pdfService.ts`) never consults the flag. When the flag is on and the document's secondary language is Arabic, the *preview* renders via `assembleTypst`/`renderTypstPdf` while the *downloaded/emailed* PDF renders via pdfmake.
- **Steps to reproduce:** Enable the Typst flag → open Settings → Documents → any template with language `ar` → observe preview → click Download / generate the real document → compare.
- **Expected:** Preview is a faithful prediction of the generated PDF.
- **Actual:** Two different rendering engines. Typst exists precisely *because* pdfmake shapes Arabic incorrectly (rustybuzz + Unicode bidi), so the two outputs differ in exactly the way the flag was introduced to fix — glyph shaping, bidi ordering, line breaking.
- **Suggested fix:** Route generation through the same flag check, or scope the flag so it cannot be enabled for preview alone. A shared `selectRenderer(config)` helper used by both paths would make divergence structurally impossible.

### PDF-02 — Preview invents a placeholder logo the real PDF will not draw
- **Severity:** High · **Priority:** P1
- **Description:** `resolvePreviewLogo()` (`previewTemplate.ts:73`) substitutes a labeled `placeholderLogoSvg('LOGO')` box whenever the tenant logo is missing/unresolvable. Generation draws no logo at all.
- **Expected:** Preview predicts real output, or the difference is unmistakably marked as a stand-in.
- **Actual:** A tenant with no logo sees a header laid out around a logo box that will be absent (and the surrounding content will reflow) in every real document. A warning chip is surfaced, but the *layout* still differs.
- **Suggested fix:** Render the placeholder with an obvious non-printing treatment, or offer a "preview as it will print" toggle that omits it.

### PDF-03 — Gallery previews ignore tenant identity and language
- **Severity:** Medium · **Priority:** P2
- **Description:** `TemplateGalleryModal.tsx:151` calls `previewTemplate(docType, config)` with **no** `companySettings`, `logo`, `stamp`, or `signature`. In that branch `previewTemplate` falls back to `PREVIEW_CTX_EN` (English/LTR/Roboto) and the neutral sample company.
- **Actual:** Gallery thumbnails show a generic English sample company, so a bilingual/RTL tenant cannot judge a template from the gallery — the chosen template then looks materially different once applied.
- **Suggested fix:** Thread the already-fetched tenant settings/logo into the gallery preview call.

### PDF-04 — Studio sample preview and record preview receive different branding inputs
- **Severity:** Medium · **Priority:** P2
- **Description:** In `TemplateStudio.tsx`, the `'sample'` branch passes `tenantLogo`, `tenantStamp`, `tenantSignature`, `companySettings`; the record branch calls `previewDocumentForRecord(docType, dataSource, resolved, languageExplicit)` with none of them.
- **Actual:** Switching the preview data-source picker between "sample" and a real record can change branding/identity rendering for reasons unrelated to the data — confusing when validating a template.
- **Suggested fix:** Give both paths one shared branding-resolution step. (If `previewRecord` re-fetches internally, the duplicate fetch is itself worth removing — see PERF note in RND-08.)

---

# 2. Rendering, layout & geometry

### RND-01 — Watermark **image** is configurable, resolved, and never rendered
- **Severity:** High · **Priority:** P1
- **Description:** `templateConfig.ts:466` documents `watermark.image` ("Render an uploaded watermark image instead of text"). `resolveWatermarkSettings()` computes `image: wm?.image === true` and returns it. `renderTemplate.ts:332` then builds the watermark **only** from `wm.text`:
  ```ts
  const watermark = wm && wm.text ? { text: wm.text, ... } : undefined;
  ```
  A grep for consumers of the resolved `image` field returns **nothing**.
- **Steps to reproduce:** Configure a watermark image with no text.
- **Expected:** An image watermark on every page.
- **Actual:** No watermark at all — the whole group is dropped because `wm.text` is empty.
- **Suggested fix:** Implement the image branch, or remove the field from the config type + docs until it is implemented. Also note the Studio never exposes an upload control for it (see STU-04), so today it is entirely unreachable dead config.

### RND-02 — Divider rules hardcoded to A4-portrait content width (`x2: 525`)
- **Severity:** High · **Priority:** P1
- **Description:** 525pt is A4 width (595) minus the hardcoded 35pt side margins. It is baked into four separate renderers:
  - `sections/footer.ts:98`, `sections/footer.ts:182`
  - `sections/header.ts:189`
  - `sections/reportFooter.ts:30`
- **Steps to reproduce:** Set paper to **Letter**, or orientation **landscape**, or custom margins, and generate.
- **Expected:** The rule spans the content width.
- **Actual:** Letter (612pt) leaves a ~52pt gap; landscape A4 (842pt) leaves the rule visibly short at ~62% width; narrow custom margins make it overflow the text column.
- **Suggested fix:** Compute the width from `pageSize` + resolved `pageMargins`, or use a full-width `canvas` with `width: '*'`/a table-based rule instead of an absolute `x2`.

### RND-03 — Page footer margins ignore configured paper margins
- **Severity:** Medium · **Priority:** P2
- **Description:** `buildPageFooter` returns nodes with hardcoded `margin: [35, 0, 35, 25]` / `[35, 10, 35, 25]` regardless of `config.paper.margins`.
- **Actual:** A template with 20pt or 60pt side margins gets a footer misaligned with the body text column.
- **Suggested fix:** Derive footer side margins from the resolved page margins.

### RND-04 — Page-number line ignores the configured colour palette
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:296-302` hardcodes `color: PDF_COLORS.textMuted` and `fontSize: 8`, while every other text element routes through `resolveColors(config)`.
- **Actual:** On a template with a configured colour group, the page number is the only element still in the legacy neutral — visibly inconsistent on branded documents.
- **Suggested fix:** Use `colors.label` (or a dedicated token) and a typography-derived size.

### RND-05 — Page-number line margins are fixed and not RTL-aware
- **Severity:** Low · **Priority:** P3
- **Description:** Same block hardcodes `margin: [40, 4, 40, 0]`. The `alignment` honours `pageNumbers.position`, but the 40pt gutters do not follow paper margins, and are symmetric so RTL documents inherit LTR gutters.
- **Suggested fix:** Derive from resolved margins; mirror for RTL.

### RND-06 — Watermark colour is not configurable while angle/opacity/size are
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:337` hardcodes `color: PDF_STYLES.watermark.color`. The watermark group exposes `angle`, `opacity`, `fontSize` — colour is the conspicuous omission.
- **Suggested fix:** Add `watermark.color` with the existing neutral as the default.

### RND-07 — Custom page dimensions are accepted without validation
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:100-105`: `pageSize = dims ? { width: dims[0], height: dims[1] } : 'A4'`. Zero, negative, or absurdly large values pass straight into pdfmake.
- **Steps to reproduce:** Set a custom label size with a `0` or negative dimension.
- **Expected:** Rejected with a clear message, or clamped.
- **Actual:** An invalid page box reaches pdfmake — blank output or a rasterization error surfaced only as the generic preview failure (STU-03).
- **Suggested fix:** Validate `> 0` and clamp to a sane maximum at the config boundary; fall back to A4 with a warning.

### RND-08 — Only A4 and Letter are supported
- **Severity:** Medium (improvement) · **Priority:** P2
- **Description:** `paper.size` is the union `'A4' | 'Letter' | 'custom'`, and `renderTemplate` collapses anything non-Letter to A4. There is no A3/A5/Legal.
- **Impact:** Legal is a routine requirement for contracts/authorizations in several markets; A5 is common for labels/receipts. Today those need the `custom` escape hatch with manually entered point dimensions.
- **Suggested fix:** Extend the union to pdfmake's predefined sizes (they are supported natively — this is a config-layer restriction, not an engine one).

---

# 3. Template Studio — UI/UX, CRUD & validation

### STU-01 — Page margin inputs have no min/max bounds
- **Severity:** High · **Priority:** P1
- **Description:** In `GeneralTab.tsx` the four margin `NumberField`s pass only `label` and `value` — no `min`/`max`/`step`. The same file *does* bound other controls (`Fine-tune scale` `min={0.6}`, watermark `Opacity` `min={0.05}`), so this is an inconsistency, not a house style.
- **Steps to reproduce:** Enter `-50`, or `900`, in any margin field.
- **Expected:** Rejected or clamped to a printable range.
- **Actual:** Negative margins push content off-page; margins exceeding the sheet produce zero/negative content width — a blank or broken PDF, reported only as the generic preview error.
- **Suggested fix:** `min={0}` plus a max derived from the selected paper size, and validate again in `renderTemplate` as a backstop.

### STU-02 — "Reset" destroys all customization with no confirmation
- **Severity:** High · **Priority:** P1
- **Description:** `handleReset` (`TemplateStudio.tsx:541`) calls `setOverride({})` immediately, then shows an *informational* toast after the fact. There is no confirm step and no undo.
- **Steps to reproduce:** Customize a template extensively → click Reset.
- **Expected:** Confirmation before discarding, per the destructive-action pattern used elsewhere in this codebase (`useConfirm`).
- **Actual:** Every setting is wiped on a single click. The work is only recoverable if the user has not saved and navigates away without saving — which conflicts with STU-03.
- **Suggested fix:** Route through the existing `useConfirm` hook with a `tone: 'danger'` dialog.

### STU-03 — No unsaved-changes guard when leaving the Studio
- **Severity:** High · **Priority:** P1
- **Description:** The Back control (`TemplateStudio.tsx:551`) calls `onBack()` directly. `override` lives in component state and Save is explicit (`onSave(override)`), so anything unsaved is lost. There is no dirty check and no `beforeunload` handler.
- **Steps to reproduce:** Edit any setting → click Back (or close the tab).
- **Expected:** Prompt to save/discard.
- **Actual:** Silent loss of all edits.
- **Suggested fix:** Track dirty state (`override` vs `initialOverride`) and confirm on exit; add a `beforeunload` listener while dirty.

### STU-04 — Watermark sub-controls are hidden until text is entered
- **Severity:** Medium · **Priority:** P2
- **Description:** `GeneralTab.tsx:329` gates angle/opacity/font-size behind `resolved.watermark?.text &&`.
- **Actual:** The settings cannot be pre-configured, and combined with RND-01 the image-watermark path is completely unreachable from the UI — there is no upload control at all.
- **Suggested fix:** Show the group whenever a watermark is enabled (text *or* image) and add the missing image control alongside the RND-01 fix.

### STU-05 — Preview failures surface a generic, non-actionable message
- **Severity:** Medium · **Priority:** P2
- **Description:** The catch block sets `'Could not render the preview. Try adjusting a setting.'`; the real error goes only to `logger.error`.
- **Actual:** The three most likely causes — invalid custom dimensions (RND-07), out-of-range margins (STU-01), and a corrupt logo/QR image — are indistinguishable to the user, and the message misleadingly implies *any* setting could be at fault.
- **Suggested fix:** Map known failure modes to specific copy; include the underlying message behind a "details" affordance.

### STU-06 — Download filename mangles non-Latin document titles
- **Severity:** Medium · **Priority:** P2
- **Description:** The download anchor sanitizes with `.replace(/[^\w.\-]+/g, '-')`. `\w` is ASCII-only, so every Arabic/CJK/Cyrillic character in the heading is replaced.
- **Steps to reproduce:** Preview a template whose localized label is non-Latin → Download.
- **Expected:** A readable filename.
- **Actual:** Collapses to something like `-.pdf`, and multiple downloads become indistinguishable.
- **Suggested fix:** Use a Unicode-aware filter (strip only path/reserved characters) with an ASCII fallback when the result is empty.

### STU-07 — Real-record preview limited to three document types
- **Severity:** Medium (improvement) · **Priority:** P2
- **Description:** `recordPreviewSupported` is `invoice | quote | payment_receipt`. Reports, checkout forms, chain-of-custody, payslips, delivery challans and labels can only be previewed against synthetic sample data.
- **Impact:** These are exactly the document types where real data is most irregular (long device lists, multi-page custody logs) — the layouts most likely to break are the ones that cannot be validated against production data.
- **Suggested fix:** Extend record preview to the remaining types, prioritising report + checkout.

---

# 4. Template & data binding

### BIND-01 — Unknown/typo'd placeholders silently render empty in customer-facing documents
- **Severity:** Critical · **Priority:** P0
- **Description:** `templateEngine.renderTemplate` returns `''` for any unresolved key unless `keepUnknown` is set (which only editor previews use). A `validateTemplate()` helper exists and is correct — but a repo-wide grep shows it is wired into **exactly one** surface (`LineItemTemplateFormModal.tsx:116`). `TemplateTypeDetail.tsx` and `NotificationTemplatesTab.tsx` render templates without ever calling it.
- **Steps to reproduce:** Put `{{customer.nmae}}` (typo) or a since-renamed key into a document/notification template → save → generate.
- **Expected:** The editor flags the unknown variable before save.
- **Actual:** Saves clean, and the value silently vanishes from every generated document/email. For an invoice or authorization form this is a blank where a legal/financial value should be.
- **Suggested fix:** Wire `validateTemplate` into every template editor and block (or hard-warn on) save with unknown keys.

### BIND-02 — Boolean values render as the literal strings `true`/`false`
- **Severity:** Low · **Priority:** P3
- **Description:** `String(value)` is applied to any non-object, non-null value.
- **Actual:** A boolean-valued placeholder prints `false` in a customer document rather than a localized Yes/No or an empty string.
- **Suggested fix:** Map booleans to localized Yes/No, or coerce to `''`.

### BIND-03 — No number, currency or date formatting in substitution
- **Severity:** Medium · **Priority:** P2
- **Description:** Values are interpolated with `String(value)` — no locale awareness. The app otherwise has strict rules against hardcoded currency/date formats (`TenantConfigContext`, `formatCurrencyWithConfig`).
- **Actual:** A numeric total interpolates as `250` or `250.5` rather than the tenant's configured currency format; raw ISO dates leak through unless the adapter pre-formats.
- **Suggested fix:** Support typed/filtered placeholders (e.g. `{{invoice.total | currency}}`) resolved through the tenant config.

### BIND-04 — `SAMPLE_CONTEXT` has no RTL, Unicode, long-text or empty-value fixtures
- **Severity:** Low (improvement) · **Priority:** P3
- **Description:** Every sample value is short Latin text.
- **Impact:** Editors cannot preview the failure modes that actually break layouts — long company names, Arabic names, empty optionals, very long device lists.
- **Suggested fix:** Add a "stress" sample profile (long/RTL/empty/special-character) selectable in the preview data-source picker.

### BIND-05 — Empty `content` array is reachable for footer-only configurations
- **Severity:** Low · **Priority:** P3
- **Description:** In `renderTemplate`, if every visible section key is in `PAGE_FOOTER_KEYS`, `trailingFrom` reaches `0`, so `bodyEnd = 0` and `content` is `[]`.
- **Steps to reproduce:** Hide every section except `footer`/`qr`.
- **Expected:** A guard, or a friendly "nothing to render" state.
- **Actual:** An empty-content document definition is handed to pdfmake.
- **Suggested fix:** Guard against an empty body and surface a Studio validation message.

### BIND-06 — Density margin scaling can round small margins to zero
- **Severity:** Low · **Priority:** P3
- **Description:** `renderTemplate.ts:266-271` applies `Math.round(margin * scale)`. At `dense` (0.78) with auto-fit (`×0.9` → ~0.70), a 1–2pt margin rounds to `0`.
- **Suggested fix:** Clamp to a minimum of 1pt where the source margin was non-zero.

---

## Verified as **not** defective

Recorded so a future pass does not re-investigate:

- **Preview/PDF pipeline identity** — preview and generation share `renderTemplate` → pdfmake. No CSS-vs-PDF drift is possible.
- **Footer page-to-page mutation** — `renderTemplate` step 7b mutates the footer node in place via `scaleFontSizes`, which would compound if the node were shared across pages. It is not: `buildPageFooter` returns a closure that constructs fresh nodes per call. The one hoisted object (`dividerLine`) carries no `fontSize`, so the in-place mutation is a no-op on it. **No compounding bug.**
- **Placeholder regex state** — `PLACEHOLDER_RE` is module-level with `/g`, but `String.replace` resets `lastIndex` and `matchAll` clones the regex. No cross-call state leakage.
- **Prototype-pollution via placeholders** — `resolvePath` guards each segment with `Object.prototype.hasOwnProperty.call`, so `{{constructor.prototype...}}` resolves to `undefined`.
- **Template HTML injection** — substitution happens *before* `sanitizeHtml` in `invoiceTermsService` and `LineItemTemplateFormModal`, so injected markup in a data value is sanitized.
- **Preview object-URL lifecycle** — the debounced effect revokes on cancel, on replacement, and on unmount. No leak found.
- **pdfmake async-error handling** — `previewTemplate` wires the error callback *and* a 15s timeout, so a rasterization failure rejects rather than hanging the spinner.
- **Page-margin CSS→pdfmake reorder** — the `[top,right,bottom,left]` → `[left,top,right,bottom]` remap is correct.

---

## Coverage & gaps — please read

This pass found **25 issues against a target of 50+**. I am reporting the number I actually verified rather than padding the list, because a QA report whose findings are speculative is worse than a short one.

**Covered:** `renderTemplate`, `previewTemplate`, `branding`/watermark resolution, `footer`/`header`/`reportFooter` section geometry, `TemplateStudio` + `GeneralTab`, `templateEngine`, and the preview/generation call graph.

**Not yet covered (the remaining ~40 section renderers and adapters — where I would expect the bulk of the outstanding findings):**
- ~35 section renderers under `engine/sections/` (`lineItemTable`, `totals`, `taxSummary`, `devices`, `custodyLog`, `signature`, `payComponentTable`, labels …) — table/page-break/overflow behaviour lives here.
- 14 adapters under `engine/adapters/` — null/empty/long-value handling per document type.
- `HeaderFooterTab`, `TransactionTab`, `TableTab`, `TotalTab`, `OtherDetailsTab` (~1,100 lines of controls).
- `profileResolver`, `registry`, `rtl`, `palette`, `fonts`/`fontLoader`, `brandingImage`, `qrImage`, `contentHash`.
- `documentTemplatesService` / `templateContextService` CRUD, RLS and tenant-scoping.

**Cannot be done in this environment (needs a human or a live session):**
- Screenshots / screen recordings.
- Visual diffing of preview vs generated PDF, and rendering across Acrobat / Preview / Chrome PDF / Firefox pdf.js.
- Cross-browser and cross-OS behaviour.
- True large-dataset and multi-page page-break testing against production data.

I can continue with a second pass over the section renderers and adapters — that is where I would expect to roughly double this count. Say the word and I will keep going.
