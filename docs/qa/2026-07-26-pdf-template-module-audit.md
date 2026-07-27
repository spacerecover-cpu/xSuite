# PDF Template Module — QA Audit (Passes 1–2, + fix rounds)

**Date:** 2026-07-26 · **Last updated:** 2026-07-27 (fix round 2)
**Scope:** `src/lib/pdf/**` (engine, sections, adapters), `src/components/settings/documents/**` (Template Studio + tabs), `src/lib/templateEngine.ts`, `src/lib/pdf/engine/previewTemplate.ts`, `src/lib/pdf/previewRecord.ts`
**Method:** static / code-level audit against the running implementation. See **Coverage & gaps** for what these passes did *not* cover.

- **Pass 1** — engine core, Studio, substitution layer (PDF-01…BIND-06).
- **Pass 2** — section renderers + adapters: tables, page breaks, RTL, overflow (TBL-01…TBL-11).
- **Fix rounds** — implementation of the findings, in two batches. Each fixed finding carries a **Status** line stating what was actually done, and where implementation contradicted the finding, the finding text is corrected in place rather than quietly rewritten. New issues surfaced *by* the fix work are collected in **§6 Follow-ups (FUP-01…)** rather than being folded into the original findings.

---

## Executive summary

The single most important architectural finding is **positive** and worth stating up front, because it changes how the rest of this report should be read:

> **The live preview is not an HTML mock.** `previewTemplate()` runs the *same* `renderTemplate()` → pdfmake pipeline as production generation, and renders a real PDF blob into an `<iframe>`. Whole classes of "preview vs PDF" drift (CSS-vs-PDF font metrics, box model differences, HTML table vs pdfmake table) **cannot occur by construction**.

Preview/PDF mismatches are therefore *not* systemic. They are a small number of specific, fixable divergences — documented as PDF-01…PDF-04 below.

The defects that matter most are: a **feature-flagged engine split** that makes Arabic previews render through a different engine than downloads (PDF-01), a **documented watermark-image option that renders nothing** (RND-01), **page-size-dependent geometry hardcoded to A4 portrait** (RND-02), **no input validation on page margins** (STU-01), and **silent placeholder failures in customer-facing documents** (BIND-01). *All five are now fixed*, as is **FUP-03** — the filtered-placeholder hole the BIND-03 fix opened, now blocked at the notification editor.

Pass 2 adds the table/page-break layer, where the dominant theme is **multi-page and RTL behaviour**: no data table in the module protects its rows from splitting across a page boundary (TBL-01), and two of the most prominent blocks on an Arabic invoice — the **tax summary** and the **totals** — never mirror for RTL while every sibling table does (TBL-03, TBL-04).

**Findings: 36 total** — 25 in pass 1 (4 parity · 8 rendering · 7 Studio UX · 6 data-binding) and 11 in pass 2 (tables, page breaks, RTL, overflow). Target was 50+; see **Coverage & gaps** for exactly what remains and why.

**Fix status: 34 fixed · 1 partly fixed (RND-07) · 1 open (STU-04).** Three findings had to be corrected against the code during implementation (**STU-01**, **TBL-04**, **BIND-06**) and two more had an inaccurate *description* or *suggested fix* (**TBL-09**, **TBL-10**); all five corrections are recorded in place. **9 new follow-ups** were raised by the fix work itself — see **§6**. Nothing was found to be wholly "not a defect" in the second fix round.

**How much of this is verified:** every fix is asserted at the **pdfmake document-definition level** (the object handed to the renderer) plus, for the substitution layer, at the string level. That is the ceiling of what this environment can reach. The *visual* results — a 55pt footer inset, an A5 divider, a mirrored RTL page number, a tall row moving whole to the next page, a soft-wrapped serial, an em dash in a subsetted Arabic font — still need a real render to confirm. See **Verification limits** at the end.

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
- **Status:** ✅ **FIXED** — renderer choice now lives in one place, `selectRenderEngine()` in `engine/featureFlag.ts`, called by both preview paths. Typst is selected only when the flag is on **and** the secondary is Arabic **and** `TYPST_GENERATION_SUPPORTED` is true. That constant is `false` while pdfService is pdfmake-only, so preview and download cannot disagree; flipping it in the same change that teaches pdfService to emit Typst re-enables both together. Covered by `featureFlag.test.ts`.
- **Severity:** Critical · **Priority:** P0
- **Description:** `isTypstEngineEnabled()` gates an alternative Typst/WASM renderer. It is referenced in exactly two places — `engine/previewTemplate.ts:156` and `previewRecord.ts:164` — **both preview paths**. The generator (`pdfService.ts`) never consults the flag. When the flag is on and the document's secondary language is Arabic, the *preview* renders via `assembleTypst`/`renderTypstPdf` while the *downloaded/emailed* PDF renders via pdfmake.
- **Steps to reproduce:** Enable the Typst flag → open Settings → Documents → any template with language `ar` → observe preview → click Download / generate the real document → compare.
- **Expected:** Preview is a faithful prediction of the generated PDF.
- **Actual:** Two different rendering engines. Typst exists precisely *because* pdfmake shapes Arabic incorrectly (rustybuzz + Unicode bidi), so the two outputs differ in exactly the way the flag was introduced to fix — glyph shaping, bidi ordering, line breaking.
- **Suggested fix:** Route generation through the same flag check, or scope the flag so it cannot be enabled for preview alone. A shared `selectRenderer(config)` helper used by both paths would make divergence structurally impossible.

### PDF-02 — Preview invents a placeholder logo the real PDF will not draw
- **Status:** ✅ **FIXED** — `resolvePreviewLogo(resolved, opts?)` gained an opt-in `{ placeholder: false }` mode that hands the engine the *unresolved* logo, so `buildLogoNode` returns null and the header lays out exactly as generation will; `previewTemplate` exposes it as `opts.logoPlaceholder`. The Studio renders a **Print view** toggle in the preview toolbar — shown *only* when a stand-in is actually being drawn (`tenantLogo.kind === 'none'`) — and forwards the same choice to the record-preview path. A second warning chip now states the *consequence* ("the printed header reflows without it"), not just the cause.
  **Why the affordance rather than dropping the placeholder:** the stand-in is what lets a tenant who is *about to* upload a logo lay out the header. Removing it by default would make the pre-existing "No logo uploaded" chip the only signal of a layout change — the same class of silent divergence this finding objects to, merely inverted. Disclosure + an explicit reversible toggle gives both mental models on demand and leaves the default byte-identical.
  **Parity:** no `opts`, `{}`, and `{ placeholder: true }` all return the identical `placeholderLogoSvg('LOGO')`; a real logo passes through untouched with `warnings: []` under every opts value. The only default-path change is an extra *UI warning string* — no PDF byte changes. Covered by `previewStudio.test.tsx` (3 explicit parity cases) and `TemplateStudioBranding.test.tsx`; the pre-existing `previewTemplate.test.ts` passes unmodified.
- **Severity:** High · **Priority:** P1
- **Description:** `resolvePreviewLogo()` (`previewTemplate.ts:73`) substitutes a labeled `placeholderLogoSvg('LOGO')` box whenever the tenant logo is missing/unresolvable. Generation draws no logo at all.
- **Expected:** Preview predicts real output, or the difference is unmistakably marked as a stand-in.
- **Actual:** A tenant with no logo sees a header laid out around a logo box that will be absent (and the surrounding content will reflow) in every real document. A warning chip is surfaced, but the *layout* still differs.
- **Suggested fix:** Render the placeholder with an obvious non-printing treatment, or offer a "preview as it will print" toggle that omits it.

### PDF-03 — Gallery previews ignore tenant identity and language
- **Status:** ✅ **FIXED** — `TemplateGalleryModal` now resolves the tenant's `companySettings` plus logo/stamp/signature **once** when the modal opens (each fetch individually `.catch`-guarded) and threads them into `previewTemplate(docType, config, undefined, logo, stamp, signature, companySettings, languageExplicit)`. `languageExplicit` mirrors the Studio's rule exactly: only a preset that actually carries a `language` overrides the tenant default. The branding is fetched inside the modal because the parent page (`DocumentTemplatesPage.tsx`) was outside this round's file set, and the modal is the only other consumer. Side effect: the modal's existing copy — "Previews show a sample … with your organization details" — is now true.
  **Parity:** `previewTemplate`'s signature is unchanged; the gallery simply stops passing `undefined` for arguments it always had. `ctx` is still left `undefined` so `previewTemplate` derives it internally. A failed settings fetch degrades to `undefined` → `PREVIEW_CTX_EN` + the sample company, i.e. exactly the previous behaviour. Covered by `TemplateGalleryModal.test.tsx` (5 cases, incl. 2 parity), which mounts the real modal and asserts the actual `previewTemplate` call arguments.
  **New static import cost:** the gallery now statically imports `lib/pdf/dataFetcher` and `lib/fileStorageService`. Both were already statically imported by `TemplateStudio` on the same route, so there is no new page-level bundle cost — but the gallery is no longer a pure-config component.
- **Severity:** Medium · **Priority:** P2
- **Description:** `TemplateGalleryModal.tsx:151` calls `previewTemplate(docType, config)` with **no** `companySettings`, `logo`, `stamp`, or `signature`. In that branch `previewTemplate` falls back to `PREVIEW_CTX_EN` (English/LTR/Roboto) and the neutral sample company.
- **Actual:** Gallery thumbnails show a generic English sample company, so a bilingual/RTL tenant cannot judge a template from the gallery — the chosen template then looks materially different once applied.
- **Suggested fix:** Thread the already-fetched tenant settings/logo into the gallery preview call.

### PDF-04 — Studio sample preview and record preview receive different branding inputs
- **Status:** ✅ **FIXED** — one branding-resolution step now feeds both paths. `previewDocumentForRecord(docType, recordId, config, languageExplicit, branding?)` gained an optional `PreviewRecordBranding` (`{ logo, stamp, signature, logoPlaceholder }`); the Studio passes the same `tenantLogo` / `tenantStamp` / `tenantSignature` state it already resolves once on mount to *both* call sites, and the logo goes through the same `resolvePreviewLogo` treatment as the sample path so the PDF-02 stand-in behaviour matches too. This also **removes the duplicate fetches** the original text flagged: the record path was performing three `resolveBrandingImage` network calls per render.
  `previewRecord.ts` was restructured into `loadRecord()` (fetch) → language/ctx resolution → `adapt()`, so the report adapter — the only one needing a `TranslationContext` — can be supported (STU-07) without changing what the pre-existing adapters receive.
  **Parity:** omitting `branding` (every non-Studio caller and every existing test) keeps the original path exactly — `resolveBrandingImage` from the record's own company settings, raw logo, one `brandingImageWarning`. The three original adapters are still invoked with the RAW `config` (not `langConfig`), preserving the previous ordering. Covered by `TemplateStudioBranding.test.tsx` (deep-equal across the two call sites; Print view flips `logoPlaceholder` on both).
  **Not covered by this fix:** the QR image is still resolved differently on the two paths — see **FUP-01**.
- **Severity:** Medium · **Priority:** P2
- **Description:** In `TemplateStudio.tsx`, the `'sample'` branch passes `tenantLogo`, `tenantStamp`, `tenantSignature`, `companySettings`; the record branch calls `previewDocumentForRecord(docType, dataSource, resolved, languageExplicit)` with none of them.
- **Actual:** Switching the preview data-source picker between "sample" and a real record can change branding/identity rendering for reasons unrelated to the data — confusing when validating a template.
- **Suggested fix:** Give both paths one shared branding-resolution step. (If `previewRecord` re-fetches internally, the duplicate fetch is itself worth removing — see PERF note in RND-08.)

---

# 2. Rendering, layout & geometry

### RND-01 — Watermark **image** is configurable, resolved, and never rendered
- **Status:** ✅ **FIXED** — implemented as a page `background` (pdfmake's `watermark` key is text-only, so it could never have worked through it). The tenant logo is drawn centred, sized against the **real** page box from the callback rather than a hardcoded A4 width, at the configured opacity; the text watermark is suppressed when the image variant renders, and falls back to text when no image resolves. `angle` is deliberately not applied — pdfmake cannot rotate an image node. Also exposed in the Studio ("Use the company logo instead of text"), and the sub-controls no longer hide behind a non-empty `text` (that gating was STU-04). Covered by `watermarkImage.test.ts` (6 cases incl. the text-only parity path).
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
- **Status:** ✅ **FIXED** — new `engine/pageGeometry.ts` owns page-box resolution and the widths derived from it (`resolvePageBox`, `contentWidth`, `footerContentWidth`, plus `clampPageMargins` moved here from `renderTemplate`). It is a separate module because `renderTemplate` imports the section renderers, so sections importing back from it would be circular. All four sites now derive their width: `header.ts` and the in-content footer use the page **content** width; `buildPageFooter` and `reportFooter`'s page-footer path use the **footer inset** width (those blocks apply their own 35pt inset rather than the page margins), threaded into `footerLines` as a parameter. Covered by `pageGeometry.test.ts` (9 cases incl. an A4 parity case asserting the rules still come out at exactly 525).
  **Scope note:** the same literal appears 16 times in `src/lib/pdf/documents/*` and is **deliberately untouched** — every legacy builder hardcodes `pageSize: 'A4'` with `pageMargins: [35, 30, 35, …]`, so 595.28 − 70 = 525 is exactly their content width. The constant was only wrong in the engine, where the page is configurable.
  **Evidence the bug was live:** updating the OM/SA compliance snapshots showed `x2: 525 → 515` — those templates use 40pt side margins, so the rule had been overflowing the text column by 10pt on every page.
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
- **Status:** ✅ **FIXED** — the footer side inset now derives from the resolved paper margins instead of a flat 35pt. New `pageGeometry` exports `sideMargins()`, `footerSideInsets()`, `footerBlockMargin()` and the constant `FOOTER_OUTDENT`; `footerContentWidth()` was rewritten to subtract the **same** insets, so the divider rule can never desync from the block it is drawn in. `sections/footer.ts` replaced all six hardcoded `[35,0,35,25]` / `[35,10,35,25]` literals with `footerBlockMargin()`, and `sections/reportFooter.ts` replaced `[35,6,35,22]` the same way.
  **Design call — RESOLVED: the footer is now FLUSH.** The engine's built-in page margins are **40pt** while the footer inset had always been **35pt**, so the footer sat 5pt *outside* the text column — an artifact of a hardcoded 35 next to a defaulted 40, not a design anyone chose. The first version of this fix made the inset *track* the margins but kept that 5pt outdent, to hold parity on the unconfigured A4 template. On review the outdent was judged not worth preserving, and `FOOTER_OUTDENT` is now **0**: the footer block insets exactly the page margins on every sheet and at every margin, and `footerContentWidth()` agrees with `contentWidth()` for the same paper.
  **This is a deliberate output change, not drift:** the footer of every existing document moves 5pt outward to meet its text column, and the default A4 divider narrows **525 → 515** to match. Parity assertions were updated to the flush geometry rather than the change being worked around — `rendererCoreQa.test.ts` now pins `[40,10,40,25]` / `515` for the default template, `[20,20]` / `[60,60]` for narrow and wide margins, and the A3/A5 divider widths at `sheet − 2×margin`. Confirmed no other regression: 1188 tests pass, identical to the count before the change.
  **Parity:** locked by the PARITY block in `rendererCoreQa.test.ts`, which asserts `[35,10,35,25]`, the `[35,0,35,25]` QR variant, and `x2: 525` on an unconfigured English A4 invoice. A desync guard loops four margin configurations asserting `pageWidth − marginLeft − marginRight === divider x2` *and* that the exported `footerContentWidth()` agrees with what was drawn. **One pre-existing assertion in `pageGeometry.test.ts` was updated** ("footerContentWidth uses the footer inset, not the page margins", which pinned 525 for 120pt margins) — it asserted exactly the behaviour this finding asks to change; it now asserts 525 for the default 40pt margins, 542 for Letter, 365 for 120pt margins.
- **Severity:** Medium · **Priority:** P2
- **Description:** `buildPageFooter` returns nodes with hardcoded `margin: [35, 0, 35, 25]` / `[35, 10, 35, 25]` regardless of `config.paper.margins`.
- **Actual:** A template with 20pt or 60pt side margins gets a footer misaligned with the body text column.
- **Suggested fix:** Derive footer side margins from the resolved page margins.

### RND-04 — Page-number line ignores the configured colour palette
- **Status:** ✅ **FIXED** — `renderTemplate` no longer hardcodes `color: PDF_COLORS.textMuted` on the page-number line; it uses `config.colors ? colors.label : PDF_COLORS.textMuted`, the same group-presence gate step 6 already applies to `styles.label` / `styles.value`. A branded template gets a consistent page number; an unbranded one keeps the legacy neutral.
  **Scope note (deliberately narrower than "route it through `resolveColors`"):** the gate is on the *presence* of a `colors` group rather than unconditional routing, because `resolveColors().label` defaults to `textLight` (`#64748b`) while the hardcoded value is `textMuted` (`#94a3b8`) — a different hex. Routing unconditionally would have changed the colour for every template that enables page numbers without configuring colours.
  **Parity:** two layers — page numbers are opt-in (`pageNumbers.enabled` defaults false) so the default template renders no number line at all, and even with them ON a template with no `colors` group keeps `#94a3b8` verbatim. Covered by three cases in `rendererCoreQa.test.ts`.
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:296-302` hardcodes `color: PDF_COLORS.textMuted` and `fontSize: 8`, while every other text element routes through `resolveColors(config)`.
- **Actual:** On a template with a configured colour group, the page number is the only element still in the legacy neutral — visibly inconsistent on branded documents.
- **Suggested fix:** Use `colors.label` (or a dedicated token) and a typography-derived size.

### RND-05 — Page-number line margins are fixed and not RTL-aware
- **Status:** ✅ **FIXED** — the page-number `margin` is now `[pageMargins[0], 4, pageMargins[2], 0]` (LTR) or `[pageMargins[2], 4, pageMargins[0], 0]` (RTL), derived from the already-clamped and density-scaled pdfmake margin tuple rather than the hardcoded `[40,4,40,0]`.
  **Parity:** the built-in margins are `[40,40,40,40]`, so left = right = 40 reproduces the old tuple exactly, and the RTL mirror is a no-op on any symmetric pair. Four cases in `rendererCoreQa.test.ts`: default → `[40,4,40,0]`; CSS margins `[10,20,30,40]` LTR → `[40,4,20,0]`; the same under `language: { mode: 'ar' }` → `[20,4,40,0]`; symmetric + RTL → unchanged.
- **Severity:** Low · **Priority:** P3
- **Description:** Same block hardcodes `margin: [40, 4, 40, 0]`. The `alignment` honours `pageNumbers.position`, but the 40pt gutters do not follow paper margins, and are symmetric so RTL documents inherit LTR gutters.
- **Suggested fix:** Derive from resolved margins; mirror for RTL.

### RND-06 — Watermark colour is not configurable while angle/opacity/size are
- **Status:** ✅ **FIXED** — `color?: string` added to `WatermarkConfig`, `color: string` to `ResolvedWatermark`, and `color: normalizeHex(wm?.color) ?? WATERMARK_DEFAULT_COLOR` to `resolveWatermarkSettings` (the default read off `PDF_STYLES.watermark.color`, exactly as opacity/fontSize already are). `renderTemplate` emits `color: wm.color` and no longer imports `PDF_STYLES`. Exposed in `GeneralTab` as a `ColorField` inside the existing watermark disclosure, hidden in image mode where it has nothing to colour.
  **Parity:** an absent or malformed `watermark.color` resolves to the identical constant the renderer used to inline, so every existing text watermark — including the legacy `branding.watermark` path — is byte-identical. Malformed hex degrades to the neutral rather than reaching pdfmake, matching every other colour resolver in the module. Four cases in `rendererCoreQa.test.ts`; `watermarkImage.test.ts` (6 cases incl. the text-only parity path) still passes.
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:337` hardcodes `color: PDF_STYLES.watermark.color`. The watermark group exposes `angle`, `opacity`, `fontSize` — colour is the conspicuous omission.
- **Suggested fix:** Add `watermark.color` with the existing neutral as the default.

### RND-07 — Custom page dimensions are accepted without validation
- **Status:** 🟡 **PARTLY FIXED — still open.** `resolvePageBox` degrades a `'custom'` size with a zero/negative/absent dimension pair to A4, so every width *derived* from the page box (divider rules, footer insets, the margin clamp, the Studio's `maxMarginFor` cap) is now sane. **But `renderTemplate` still passes the raw pair straight through** — `pageSize = dims ? { width: dims[0], height: dims[1] } : 'A4'` — so an invalid custom box still reaches pdfmake, and worse, the geometry helpers and the actual sheet now *disagree* for that config. Closing this needs validation at the config boundary (`> 0`, clamped to a sane maximum, warn-and-fall-back to A4) plus `min`/`max` on the Studio's custom width/height inputs, which do not have them. STU-05 now gives the resulting failure a specific message ("check the paper size and any custom width/height") rather than the generic copy, so the symptom is diagnosable even while the cause is unguarded.
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderTemplate.ts:100-105`: `pageSize = dims ? { width: dims[0], height: dims[1] } : 'A4'`. Zero, negative, or absurdly large values pass straight into pdfmake.
- **Steps to reproduce:** Set a custom label size with a `0` or negative dimension.
- **Expected:** Rejected with a clear message, or clamped.
- **Actual:** An invalid page box reaches pdfmake — blank output or a rasterization error surfaced only as the generic preview failure (STU-03).
- **Suggested fix:** Validate `> 0` and clamp to a sane maximum at the config boundary; fall back to A4 with a warning.

### RND-08 — Only A4 and Letter are supported
- **Status:** ✅ **FIXED** — `PaperConfig['size']` extended to `'A3' | 'A4' | 'A5' | 'Legal' | 'Letter' | 'custom'`. A single exported `PREDEFINED_SHEET` map in `pageGeometry` bridges config names to pdfmake's sheet names (Legal→`LEGAL`, Letter→`LETTER`) and is read by **both** `renderTemplate` (for `pageSize`) and `resolvePageBox` (for the geometry), so a future sheet cannot be added to one and forgotten in the other. `SHEET_POINTS` gained A3 `[841.89, 1190.55]`, A5 `[419.53, 595.28]` and LEGAL `[612, 1008]` — values taken from pdfmake's own `standardPageSizes.js` — so the margin clamp and every derived width follow the real sheet instead of silently falling back to A4. `GeneralTab` gained the A3/A5/Legal options and its `maxMarginFor` now calls `resolvePageBox` instead of its own hardcoded `[612,792]`/`[595,842]` pair.
  **Parity:** purely additive — `PREDEFINED_SHEET.A4 === 'A4'` and `.Letter === 'LETTER'`, identical to the old ternary; no built-in config uses a new size; the `?? 'A4'` fallback preserves the degrade-to-A4 behaviour for a malformed stored value. Covered by 5 parameterised mapping cases, a `resolvePageBox` dimension case for the three new sheets, and a divider-width case proving A3 rules widen to 771 and **A5 rules narrow to 349** — A5 is *narrower* than A4, so the old fallback would have overflowed the sheet.
  **Loose end (out of scope, tracked as FUP-06):** `src/lib/pdf/typst/assemble.ts:220` still collapses any non-Letter size to `paper: "a4"`.
- **Severity:** Medium (improvement) · **Priority:** P2
- **Description:** `paper.size` is the union `'A4' | 'Letter' | 'custom'`, and `renderTemplate` collapses anything non-Letter to A4. There is no A3/A5/Legal.
- **Impact:** Legal is a routine requirement for contracts/authorizations in several markets; A5 is common for labels/receipts. Today those need the `custom` escape hatch with manually entered point dimensions.
- **Suggested fix:** Extend the union to pdfmake's predefined sizes (they are supported natively — this is a config-layer restriction, not an engine one).

---

# 3. Template Studio — UI/UX, CRUD & validation

### STU-01 — Page margin inputs have no upper bound *(finding partly incorrect as first written)*
- **Status:** ✅ **FIXED**, and the finding is **corrected**. The original text claimed the margin fields passed "no `min`/`max`" and that negative margins were accepted. That was wrong: `min={0}` was already present on `origin/main` — my grep window (`-A 3` after each `NumberField`) cut the line off, and I did not verify before writing it up. **Negative margins were never possible.**
  The real gap was the missing **upper** bound, and that part was genuine: a margin pair wider than the sheet collapses the content box. Fixed on both sides — `max={maxMarginFor(side)}` in `GeneralTab`, derived from the current sheet **and orientation** so the cap follows a Letter/landscape/custom switch; plus a `clampPageMargins()` backstop in `renderTemplate`, because margins also arrive from stored configs, the gallery and hand-edited JSON, not only from this UI. The clamp scales an oversized pair proportionally (so the layout keeps its balance rather than one side absorbing the whole correction), coerces negative/non-finite values to 0, and reserves a 1-inch content floor. Covered by `pageMarginClamp.test.ts` (7 cases incl. landscape rotation and a custom label box).
- **Severity:** High → **Medium** (revised: oversized margins only, not negative) · **Priority:** P1

### STU-02 — "Reset" destroys all customization with no confirmation
- **Status:** ✅ **FIXED** — `handleReset` now goes through the shared `useConfirm` hook with a `tone: 'danger'` dialog naming what is lost ("layout, colours, typography, labels… cannot be undone") before wiping the override.
- **Severity:** High · **Priority:** P1
- **Description:** `handleReset` (`TemplateStudio.tsx:541`) calls `setOverride({})` immediately, then shows an *informational* toast after the fact. There is no confirm step and no undo.
- **Steps to reproduce:** Customize a template extensively → click Reset.
- **Expected:** Confirmation before discarding, per the destructive-action pattern used elsewhere in this codebase (`useConfirm`).
- **Actual:** Every setting is wiped on a single click. The work is only recoverable if the user has not saved and navigates away without saving — which conflicts with STU-03.
- **Suggested fix:** Route through the existing `useConfirm` hook with a `tone: 'danger'` dialog.

### STU-03 — No unsaved-changes guard when leaving the Studio
- **Status:** ✅ **FIXED** — the Studio now tracks a `savedOverride` baseline and derives `isDirty` from it. Back routes through `handleBack`, which confirms before discarding; a `beforeunload` listener (armed only while dirty) covers tab close / reload / external navigation, which React cannot intercept. The baseline advances on save, so "unsaved" means *since the last deploy*, not since mount.
- **Severity:** High · **Priority:** P1
- **Description:** The Back control (`TemplateStudio.tsx:551`) calls `onBack()` directly. `override` lives in component state and Save is explicit (`onSave(override)`), so anything unsaved is lost. There is no dirty check and no `beforeunload` handler.
- **Steps to reproduce:** Edit any setting → click Back (or close the tab).
- **Expected:** Prompt to save/discard.
- **Actual:** Silent loss of all edits.
- **Suggested fix:** Track dirty state (`override` vs `initialOverride`) and confirm on exit; add a `beforeunload` listener while dirty.

### STU-04 — Watermark sub-controls are hidden until text is entered
- **Status:** 🟡 **HALF FIXED — the remainder is deliberately NOT built.** The gating half was closed by the RND-01 fix: `GeneralTab` now shows the group on `(text || image)`, not on a non-empty `text`, so the sub-controls can be pre-configured. The remaining half — a genuine watermark-image **upload** — was assessed and deliberately left unbuilt rather than half-shipped. Today `watermark.image` means "use the company logo", because `company_settings.branding.logo_url` is the only source that exists (confirmed: 6 `pdfService` call sites all resolve it; `renderTemplate`'s signature takes `logo`, `qrCodeBase64`, `stampImage`, `signatureImage` and has no watermark-image slot).
  **What a real upload needs:** (1) a storage location and a new branding field; (2) an upload control in Company → Branding settings, **not** in the Template Studio, since the asset is tenant-level rather than per-template; (3) a new resolved image threaded through `renderTemplate`, `previewTemplate`, `previewRecord`, `TemplateStudio` and ~6 `pdfService` call sites. Adding a `watermark.imageUrl` config field with no upload and no plumbing would recreate exactly the dead-config defect **RND-01** was raised for, so nothing was added.
- **Severity:** Medium · **Priority:** P2
- **Description:** `GeneralTab.tsx:329` gates angle/opacity/font-size behind `resolved.watermark?.text &&`.
- **Actual:** The settings cannot be pre-configured, and combined with RND-01 the image-watermark path is completely unreachable from the UI — there is no upload control at all.
- **Suggested fix:** Show the group whenever a watermark is enabled (text *or* image) and add the missing image control alongside the RND-01 fix.

### STU-05 — Preview failures surface a generic, non-actionable message
- **Status:** ✅ **FIXED** — a pure `describePreviewFailure(err): { message, detail }` (now in `previewStudioHelpers.ts`) maps the realistic failure modes to distinct copy: the 15s timeout → large-dataset wording (TBL-08); PNG/JPEG/image-decode → "an image … logo, stamp, signature or QR"; `pageSize`/width/height → "check the paper size and any custom width/height" (RND-07); `margin` → "margins leave no room for content" (STU-01); "not supported for" → switch back to Sample data; "not found" → the record may have been deleted. The raw error text is **always** returned as `detail` and rendered behind a `<details>` "Technical details" disclosure; `logger.error` still fires as before.
  **Parity:** any error matching none of the patterns returns the byte-identical original string "Could not render the preview. Try adjusting a setting." — asserted directly. Covered by 9 cases in `previewStudio.test.tsx`, incl. the parity case and one asserting the four likeliest causes produce four *distinct* messages.
- **Severity:** Medium · **Priority:** P2
- **Description:** The catch block sets `'Could not render the preview. Try adjusting a setting.'`; the real error goes only to `logger.error`.
- **Actual:** The three most likely causes — invalid custom dimensions (RND-07), out-of-range margins (STU-01), and a corrupt logo/QR image — are indistinguishable to the user, and the message misleadingly implies *any* setting could be at fault.
- **Suggested fix:** Map known failure modes to specific copy; include the underlying message behind a "details" affordance.

### STU-06 — Download filename mangles non-Latin document titles
- **Status:** ✅ **FIXED** — a pure `previewDownloadFilename(heading, recordLabel?)` (in `previewStudioHelpers.ts`) replaces `.replace(/[^\w.\-]+/g, '-')`. It strips only control characters and what a filesystem actually rejects (`\ / : * ? " < > |`), folds whitespace to a dash, collapses runs, and trims leading/trailing dashes and dots; if nothing printable survives it falls back to the ASCII `document.pdf` rather than emitting a dot-file.
  **Parity:** a test re-implements the **old** sanitizer verbatim as an oracle and asserts byte equality across every real heading the Studio can show — all 12 `DOC_TYPE_LABELS` plus all 8 `REPORT_TYPES` names — and for an ASCII record label. None of those contains a character the two implementations treat differently, so no existing download filename changes. The only behavioural deltas are on inputs the old code destroyed: non-Latin scripts now survive (the Arabic case asserts both that the legacy filter produced `-.pdf` and that the new one produces `فاتورة-ضريبية.pdf`), and a blank record label no longer leaves a trailing `-`. 8 cases in `previewStudio.test.tsx`.
- **Severity:** Medium · **Priority:** P2
- **Description:** The download anchor sanitizes with `.replace(/[^\w.\-]+/g, '-')`. `\w` is ASCII-only, so every Arabic/CJK/Cyrillic character in the heading is replaced.
- **Steps to reproduce:** Preview a template whose localized label is non-Latin → Download.
- **Expected:** A readable filename.
- **Actual:** Collapses to something like `-.pdf`, and multiple downloads become indistinguishable.
- **Suggested fix:** Use a Unicode-aware filter (strip only path/reserved characters) with an ASCII fallback when the result is empty.

### STU-07 — Real-record preview limited to three document types
- **Status:** ✅ **FIXED (10 of 11 types).** `RECORD_PREVIEW_TYPES` grew from 3 to 11, each wired to the **same production fetcher + adapter pair** the real generator uses: `report` (`fetchInstanceReportData` → `reportAdapter`, listed from `document_instances` where `doc_type='report'`), `checkout_form` (`fetchReceiptData` → `checkoutAdapter`, listed from `case_devices` with a non-null `checked_out_at`, newest first, falling back to recent cases so the picker is never mysteriously empty), `chain_of_custody`, `office_receipt`, `customer_copy`, `case_label`, `credit_note` and `payslip`. The report path is why `previewRecord` was split into `loadRecord`/`adapt` — the report adapter needs a `TranslationContext` that can only be derived after the tenant settings are fetched. The hardcoded `recordPreviewSupported = invoice|quote|payment_receipt` gate is deleted: `listPreviewRecords` is now the single authority and the picker shows iff it returns rows.
  **Deliberately NOT implemented — `stock_label`.** There is no per-record fetcher for it, and `StockLabelData` is dominated by print-dialog inputs (quantity, copies, location name, show-price, show-barcode) rather than a stored document, so a "record" preview would be synthetic data wearing a record's name. `supportsRecordPreview('stock_label')` is still false and `listPreviewRecords('stock_label')` still short-circuits to `[]` with no query.
  **Parity:** the three original types keep their original fetcher, their original adapter and the original RAW `config` argument, so their engine data is byte-identical; the literal `15` became the `RECORD_LIMIT` constant with the same value. Covered by 5 cases in `previewStudio.test.tsx` (incl. a parity case for the original three and one asserting the unsupported list is exactly `['stock_label']`) plus 2 mount tests in `TemplateStudioBranding.test.tsx`.
  **Verification limit:** the new types are verified at the **wiring** level — that each doc type is paired with the fetcher+adapter its production generator uses, and that the picker appears. Actually rendering them needs a tenant with real reports / checkouts / custody logs / payslips / credit notes, which this environment does not have. A `checkout_form` previewed against a case with no checkout will render an empty collector block (the adapter's own fallbacks), which is why the record list is ordered by real checkouts first. See also **FUP-02** (report subtype) and **FUP-01** (QR).
- **Severity:** Medium (improvement) · **Priority:** P2
- **Description:** `recordPreviewSupported` is `invoice | quote | payment_receipt`. Reports, checkout forms, chain-of-custody, payslips, delivery challans and labels can only be previewed against synthetic sample data.
- **Impact:** These are exactly the document types where real data is most irregular (long device lists, multi-page custody logs) — the layouts most likely to break are the ones that cannot be validated against production data.
- **Suggested fix:** Extend record preview to the remaining types, prioritising report + checkout.

---

# 4. Template & data binding

### BIND-01 — Unknown/typo'd placeholders silently render empty in customer-facing documents
- **Status:** ✅ **FIXED** for the unguarded editor. **Correction to the original finding:** `TemplateTypeDetail` is *not* an unvalidated surface — it delegates its editing to `LineItemTemplateFormModal`, which already computes `unknownVariables` and warns "will render blank". The genuinely unguarded editor was `NotificationTemplatesTab`, whose `handleSave` checked only that the body was non-empty. It now validates subject + body + link against `NOTIFICATION_EVENT_VARIABLES[eventType]`, shows a live warning chip listing the unknown keys, and requires an explicit confirm on save (warn-don't-block, matching the existing pattern, so a deliberately forward-looking template is still savable).
- **Severity:** Critical · **Priority:** P0
- **Description:** `templateEngine.renderTemplate` returns `''` for any unresolved key unless `keepUnknown` is set (which only editor previews use). A `validateTemplate()` helper exists and is correct — but a repo-wide grep shows it was wired into **exactly one** surface (`LineItemTemplateFormModal.tsx:116`). `NotificationTemplatesTab.tsx` rendered and saved templates without ever calling it.
- **Steps to reproduce:** Put `{{customer.nmae}}` (typo) or a since-renamed key into a document/notification template → save → generate.
- **Expected:** The editor flags the unknown variable before save.
- **Actual:** Saves clean, and the value silently vanishes from every generated document/email. For an invoice or authorization form this is a blank where a legal/financial value should be.
- **Suggested fix:** Wire `validateTemplate` into every template editor and block (or hard-warn on) save with unknown keys.

### BIND-02 — Boolean values render as the literal strings `true`/`false`
- **Status:** ✅ **FIXED** — `renderTemplate` maps real booleans through an injectable label pair: `DEFAULT_BOOLEAN_LABELS = { true: 'Yes', false: 'No' }` plus an `opts.booleans` override so the caller supplies the tenant's localized strings (نعم/لا). Only `typeof value === 'boolean'` maps — the *string* `'true'` still renders as `'true'`. The labels are **injected rather than imported** so the module keeps zero imports, which is what makes it portable to the Deno edge runtime.
  **Why "No" and not `''`** (the finding offered both): a blank where "No" belongs is indistinguishable from a missing field — precisely the BIND-01 failure class this audit already fixed. On a lab authorization / NDA / destructive-consent form that distinction is legally material, so `false` must stay **visible**. `true`/`false` were also rejected: untranslated developer tokens in a customer document.
  **Parity:** booleans are the only value type whose output changes, and that change is the fix. Strings, numbers, `null`, `undefined` and object-interior nodes take byte-identical paths, and the missing-key → `''` contract is untouched (the boolean branch sits strictly after the null/undefined/object early return). Live blast radius today is **zero**: every producer was traced — `templateContextService` pre-formats everything to strings, and none of the 12 event types in `NOTIFICATION_EVENT_VARIABLES` carries a boolean key — so this is a forward guard, not a behaviour flip on existing data. 6 cases in `templateEngine.test.ts`, plus a parity case replaying a 13-entry pinned golden corpus with a non-default boolean pair supplied.
  **Known divergence, pinned in a test:** the `notification-dispatch-email` edge function has its own copy of the renderer and does **not** map booleans, so if a boolean ever entered a notification payload the in-app preview would show "No" while the delivered email shows `false`.
- **Severity:** Low · **Priority:** P3
- **Description:** `String(value)` is applied to any non-object, non-null value.
- **Actual:** A boolean-valued placeholder prints `false` in a customer document rather than a localized Yes/No or an empty string.
- **Suggested fix:** Map booleans to localized Yes/No, or coerce to `''`.

### BIND-03 — No number, currency or date formatting in substitution
- **Status:** ✅ **FIXED (capability shipped; no caller wired yet).** Opt-in filtered placeholders `{{invoice.total | currency}}` resolve through a caller-supplied `opts.formatters: Record<string, TemplateFormatter>`. The engine imports nothing and hardcodes no currency symbol or date format — the caller passes tenant-config-bound wrappers (`formatCurrencyWithConfig` / `formatDate`), satisfying the CLAUDE.md Country-Based Tenant Configuration rule. `PLACEHOLDER_RE` became `/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g` — capture group 1 (the key) is bit-for-bit the old expression, so `extractVariables` / `validateTemplate` / `keepUnknown` are unchanged and a filtered placeholder still validates by its bare key.
  **Degradation never blanks a value:** an unknown filter, an absent formatters map, or a formatter that throws all fall through to the *unfiltered* rendering, so a typo'd filter prints an unformatted figure (visible) rather than dropping it (BIND-01). A filter is never invoked for a missing key, so missing-key → `''` is preserved exactly. Degenerate `{{a | }}` and chained `{{a | b | c}}` deliberately match **nothing** and stay literal, so unsupported syntax is visible rather than silently half-working.
  **Parity:** a filter-free template renders byte-identically (group 2 is a non-capturing optional matching empty). Verified that **no existing template anywhere already uses pipe syntax** — `grep -rnE '\{\{\s*[\w.]+\s*\|' src/ supabase/ scripts/` returns zero hits across `.ts/.tsx/.sql/.md` — so nothing that previously rendered literally now substitutes. Two explicit parity tests plus a test that copies the edge function's renderer verbatim and asserts `renderTemplate` matches it across a 5-template flat-key corpus.
  **Wiring is deliberately not done.** No caller passes a formatters map, so nothing renders differently today. `templateContextService` already pre-formats money and dates into display strings before they reach the engine, so filters are *additive* there rather than a replacement; deciding whether to stop pre-formatting and pass raw values + a formatter map is a real design call, not a mechanical follow-up. **⚠️ See FUP-03** — filtered placeholders are unsafe in `notification_templates`; that is now BLOCKED at the editor (`validateTemplate().filtered` + a save gate), so the syntax is confined to the document surfaces that can render it.
- **Severity:** Medium · **Priority:** P2
- **Description:** Values are interpolated with `String(value)` — no locale awareness. The app otherwise has strict rules against hardcoded currency/date formats (`TenantConfigContext`, `formatCurrencyWithConfig`).
- **Actual:** A numeric total interpolates as `250` or `250.5` rather than the tenant's configured currency format; raw ISO dates leak through unless the adapter pre-formats.
- **Suggested fix:** Support typed/filtered placeholders (e.g. `{{invoice.total | currency}}`) resolved through the tenant config.

### BIND-04 — `SAMPLE_CONTEXT` has no RTL, Unicode, long-text or empty-value fixtures
- **Status:** ✅ **FIXED** — new exported `STRESS_CONTEXT` beside `SAMPLE_CONTEXT` (which is untouched). It mirrors `SAMPLE_CONTEXT`'s exact key shape — all 8 groups, all 34 keys, all string-valued — so it drops into any preview data-source picker without a template going blank. It covers the five failure modes editors could not preview: **long text** (a 110-char company name, a 380-char RAID-5 problem description), **Arabic/RTL** (customer name, Omani address, Arabic-Indic due date, technician name), **empty optionals** (website, `customer.phone`, `case.received_date`, `quote.expiry_date`, `service.estimated_days`, `technician.email`), **special characters** (`Al-Rashid & Sons <Holdings> "Group"`, exercising the substitute-then-`sanitizeHtml` path in `invoiceTermsService`), and **a 60-char unbroken serial** plus a no-space part number — the concrete fixture for TBL-09. Domain-accurate for a lab: 12-drive RAID-5, seized spindle bearings, prior third-party rebuild attempt, cleanroom ISO 14644-1 Class 5, re-recovery case number, "No Solution — Future Follow-up" status.
  **Parity:** purely additive. A regression guard deep-equals `SAMPLE_CONTEXT` against a full inline literal of its current 34 values, so any future edit to it fails the suite — enforcing "other surfaces depend on its exact values" mechanically rather than by convention. 8 further cases assert the structural key-set match and one dimension each.
  **Not wired into the picker yet** — the fixture exists and is exported; surfacing it as a selectable preview profile is a Studio change.
- **Severity:** Low (improvement) · **Priority:** P3
- **Description:** Every sample value is short Latin text.
- **Impact:** Editors cannot preview the failure modes that actually break layouts — long company names, Arabic names, empty optionals, very long device lists.
- **Suggested fix:** Add a "stress" sample profile (long/RTL/empty/special-character) selectable in the preview data-source picker.

### BIND-05 — Empty `content` array is reachable for footer-only configurations
- **Status:** ✅ **FIXED** — after the dispatch loop, `if (content.length === 0) content.push({ text: '' })`. A configuration whose only visible sections are in `PAGE_FOOTER_KEYS` used to hand pdfmake `content: []`; it now gets a well-formed empty body while the page footer and watermark still render.
  **Parity:** the guard is unreachable for any document that emits at least one block, so it cannot touch existing output — asserted by a test that a normal invoice body is unchanged. The regression test (`content.length > 0` with every section but `footer`/`qr` hidden) **failed before the fix** with `expected 0 to be greater than 0`.
  **Not done:** the finding's "surface a Studio validation message" half — the guard is engine-side only, so a tenant who hides every body section still gets no warning in the Studio.
- **Severity:** Low · **Priority:** P3
- **Description:** In `renderTemplate`, if every visible section key is in `PAGE_FOOTER_KEYS`, `trailingFrom` reaches `0`, so `bodyEnd = 0` and `content` is `[]`.
- **Steps to reproduce:** Hide every section except `footer`/`qr`.
- **Expected:** A guard, or a friendly "nothing to render" state.
- **Actual:** An empty-content document definition is handed to pdfmake.
- **Suggested fix:** Guard against an empty body and surface a Studio validation message.

### BIND-06 — Density margin scaling can round small margins to zero *(trigger as first written was wrong)*
- **Status:** ✅ **FIXED**, and the finding is **corrected**. Density margin scaling now goes through `scaleMargin(m) = m === 0 ? 0 : Math.max(1, Math.round(m * scale))`, so a margin the tenant asked for can never round away to zero while a genuinely-zero margin stays zero.
  **Correction — the stated trigger does not reproduce.** The original text claimed "at dense (0.78) with auto-fit (×0.9 → ~0.70), a 1–2pt margin rounds to 0". It does not: `resolvePageFitting` feeds `minScale` in through `Math.max(fitting.minScale, densityScale * 0.9)`, so **minScale is a floor**, and the smallest reachable scale is 0.702. `Math.round(1 × 0.702) = 1` and `Math.round(2 × 0.702) = 1` — neither rounds away. The real trigger is much narrower: a **fractional** margin below ~0.712pt, which the Studio's integer inputs cannot produce but a stored / gallery / hand-edited config can. The guard was shipped anyway because it is one expression and provably a no-op everywhere else, but **the finding as written overstated the exposure.**
  **Parity:** only reachable inside `if (config.pageFitting)` **and** `if (scale !== 1)` — an absent `pageFitting` group, or comfortable density with no auto-fit, never enters the branch; within it the clamp only changes values that would have become 0 from a non-zero source. 6 cases: the correction test asserts the arithmetic directly, the guard test uses fractional `[0.6,0.6,0.6,0.6]` (which produced `[0,0,0,0]` before and `[1,1,1,1]` after), and four parity cases pin no-pageFitting → `[40,40,40,40]`, comfortable → `[40,40,40,40]`, zero margins → `[0,0,0,0]`, dense alone → `[31,31,31,31]`.
- **Severity:** Low → **Very low** (revised: fractional sub-0.712pt margins only, not the 1–2pt case originally claimed) · **Priority:** P3
- **Description (original, corrected above):** `renderTemplate.ts:266-271` applies `Math.round(margin * scale)`. ~~At `dense` (0.78) with auto-fit (`×0.9` → ~0.70), a 1–2pt margin rounds to `0`.~~ — see the Status correction; `minScale` is a floor, so 1pt and 2pt survive.
- **Suggested fix:** Clamp to a minimum of 1pt where the source margin was non-zero. *(Implemented as written — the fix was right even though the trigger was not.)*

---

# 5. Section renderers & adapters — tables, page breaks, RTL, overflow *(pass 2)*

### TBL-01 — No data table protects its rows from splitting across pages
- **Status:** ✅ **FIXED** — `dontBreakRows: true` added to all eight data tables (`lineItemTable`, `devices`, `custodyLog`, `payComponentTable`, `paymentHistory`, `taxSummary`, `digitalSignatures`, `hashVerification`). Pure layout tables (info boxes, totals, header) are deliberately left alone — a break there is harmless and forcing rows to stay whole can push a whole block to the next page for no benefit.
- **Severity:** High · **Priority:** P1
- **Description:** A repo-wide grep for `dontBreakRows` across `engine/sections/**` and `engine/adapters/**` returns **zero hits**. All eight data tables (`lineItemTable`, `devices`, `custodyLog`, `payComponentTable`, `paymentHistory`, `taxSummary`, `digitalSignatures`, `hashVerification`) set `headerRows: 1` but never `dontBreakRows: true`.
- **Steps to reproduce:** Generate any document whose table reaches a page boundary with a tall row — an invoice line with a multi-line description, a custody entry with a long note, a device row with a long fault description.
- **Expected:** The row moves intact to the next page.
- **Actual:** pdfmake's default is to split a row across the page break, so a single logical row is severed — the first lines print at the bottom of page 1 and the remainder at the top of page 2, with the cell borders drawn as two partial boxes.
- **Impact:** Affects every multi-page document; most visible on invoices and chain-of-custody logs, where a severed row undermines the document's evidentiary readability.
- **Suggested fix:** Add `dontBreakRows: true` to the eight data tables. Keep it off for pure layout tables (info boxes, totals) where a break is harmless.

### TBL-02 — No section can request a page break
- **Status:** ✅ **FIXED (config + engine); no Studio control yet.** Optional `pageBreakBefore?: boolean` added to `SectionConfig` and `SectionConfigOverride`, wired through both branches of `mergeSections`, and mapped in `renderTemplate`'s dispatch loop to pdfmake's `pageBreak: 'before'` on the section's **first emitted block**. The loop was refactored into a small `emit(out, breakBefore)` closure used by both the normal and the combined-parties path; `withPageBreakBefore` promotes a bare string block to a text node (only object nodes can carry the flag) and **copies** rather than mutates the renderer's output. The flag is deliberately dropped when nothing has been emitted yet, because a `pageBreak` on the very first block makes pdfmake open the document with a blank page.
  **Parity:** no built-in config sets `pageBreakBefore`, and an absent/false value takes the exact same path as before (the `emit` refactor is behaviour-preserving: same push order, same handling of `null` and array results). Asserted by walking the whole default document tree for any `pageBreak` key. 4 cases in `rendererCoreQa.test.ts`.
  **Not done:** `unbreakable: true` for signature/approval blocks (the second half of the suggested fix), and **no Studio checkbox** — the per-section controls live in `HeaderFooterTab`/`TableTab`/`OtherDetailsTab`, outside this round's file set. Today the flag is reachable only from a stored config or the gallery. That is the RND-01 shape (config with no UI) and is tracked as **FUP-04**.
- **Severity:** Medium (improvement) · **Priority:** P2
- **Description:** `pageBreak` appears **nowhere** in the sections or adapters. Page flow is entirely pdfmake's default.
- **Impact:** A tenant cannot say "start Terms & Conditions on a new page" or "keep the signature block off a page of its own" — common requirements for contracts, authorization forms and reports. Signature blocks in particular can be orphaned at the top of a trailing page.
- **Suggested fix:** Add an opt-in `pageBreakBefore` to the section config and map it to pdfmake's `pageBreak: 'before'`; consider `unbreakable: true` for signature/approval blocks.

### TBL-03 — Tax summary table is RTL-blind
- **Status:** ✅ **FIXED** — the section now resolves `engineLayoutDirection` and passes every row through an `orient()` helper that reverses the column order and swaps each cell's left/right alignment. `orient()` is the identity for LTR, so English output is byte-for-byte unchanged. Header row, data rows and the totals row all mirror. Covered by `sections/rtlTablesParity.test.ts`.
- **Severity:** High · **Priority:** P1
- **Description:** `sections/taxSummary.ts` hardcodes `alignment: 'left'` on the rate column and `'right'` on taxable/tax, for **both** header (lines 36–38) and body (lines 43–45). It never calls `engineLayoutDirection` and never mirrors. By contrast `lineItemTable`, `devices`, `custodyLog`, `digitalSignatures` and `hashVerification` mirror via `mirrorColumns`, and `paymentHistory` / `payComponentTable` mirror via their own inline direction check.
- **Steps to reproduce:** Set a template's language to Arabic (RTL) and generate an invoice with a tax breakdown.
- **Expected:** The tax table mirrors like every other table.
- **Actual:** It stays in LTR column order and alignment while the surrounding document is RTL — the one table on the page reading the wrong way.
- **Impact:** This is the statutory VAT/GST breakdown on Arabic-market invoices, so the defect lands on a compliance-relevant block.
- **Suggested fix:** Apply the same `engineLayoutDirection` + mirror treatment used by `paymentHistory`.

### TBL-04 — Totals block is RTL-blind
- **Status:** ✅ **FIXED, but narrower than this finding originally claimed.** Implementing it surfaced that part of the "defect" was a deliberate prior decision:
  - **Fixed** — the block indent (`margin: [280, 8, 0, 8]`) pushed the totals to the *right* edge of the page in every direction; under RTL it now becomes `[0, 8, 280, 8]` so the block sits on the left edge, mirrored. The label/value cells swap column slots (widths flip `['*','auto']` → `['auto','*']`) so the pair reads label-then-value right-to-left, and the 8pt cell padding moves to the other side.
  - **Deliberately NOT changed** — in-cell text alignment stays `right` in both directions. `rtl.test.ts` already pins this ("totals labels are right-aligned under RTL") with an explanatory comment, and the reasoning holds: these cells are currency figures, and right/decimal alignment is the numeric convention regardless of script direction. The original finding treated the hardcoded `'right'` as evidence of RTL-blindness; it was actually an intentional call. What was genuinely broken was the geometry around it.
- **Severity:** High → **Medium** (revised: the block indent, not the text alignment) · **Priority:** P1
- **Description:** `sections/totals.ts` hardcodes `alignment: 'right'` and `margin: [0, v, 8, v]` on both the label and value cells for every totals line. It imports `bilingualLabelRuns` from `../rtl` — so it handles Arabic *text shaping* — but never checks layout direction, so the block is never mirrored and the 8pt padding stays on the right edge.
- **Expected:** Under RTL the label/value pair mirrors and the padding follows.
- **Actual:** Subtotal / discount / VAT / Grand Total — the most prominent block on an invoice — keeps LTR geometry in an otherwise RTL document.
- **Suggested fix:** Mirror the column pair and swap the padding side when `engineLayoutDirection(language) === 'rtl'`.

### TBL-05 — Row-number (S/N) column lands on the wrong side under RTL
- **Status:** ✅ **FIXED** — the opt-in S/N column is now added on the side that is **first in reading order**: `unshift` (array head) under LTR exactly as before, `push` (array tail) under RTL, because `mirrorColumns` has already reversed the columns above. Header cell, per-row number cell and the 24pt width all move together, so `widths` stays index-aligned with the cells.
  **Parity:** the LTR branch is the original code verbatim; only `direction === 'rtl'` takes the new path, and row numbering is itself opt-in (`table.rowNumbering === true`, default false) so an unconfigured template never reaches the block. Two cases in `dataTableRobustness.test.ts`; the RTL one also asserts `widths.length === body[0].length` and a uniform cell count per row.
- **Severity:** Medium · **Priority:** P2
- **Description:** `lineItemTable.ts:96-102` implements the opt-in S/N column with `headerRow.unshift(...)`, `body[r].unshift(...)` and `widths.unshift(24)`. These always prepend to the *array head*, i.e. the visual left. But the columns were already mirrored for RTL at line 41 (`mirrorColumns`).
- **Steps to reproduce:** Enable row numbering on an Arabic (RTL) template.
- **Expected:** The serial column sits on the right, first in reading order.
- **Actual:** It is pushed to the far left — last in RTL reading order, so rows appear to start with the description and end with the number.
- **Suggested fix:** `push` instead of `unshift` when direction is RTL (or mirror after the S/N column is added).

### TBL-06 — Empty line-item list renders a heading and an empty table
- **Status:** ✅ **FIXED** — `renderLineItems` emits one full-width (`colSpan`) centred "No items" / "لا توجد بنود" row when the visible row set is empty, appended **after** the S/N block so the span covers the serial column too.
  **Why an explicit row rather than `null`** (the finding offered both): on a financial document the totals block still prints (Subtotal 0.00 / Total 0.00), so a *missing* line-item section leaves the reader unable to distinguish "nothing was billed" from "the table failed to render". Returning `null` would trade one ambiguity for another; the explicit row is unambiguous and keeps the document's structure.
  **Parity:** guarded by `dataRows.length === 0`, exactly the case the finding describes as already broken; any document with ≥1 line item is untouched, and the pre-existing `columns.length === 0 → return null` guard is unchanged. 3 cases in `dataTableRobustness.test.ts`.
  **Sibling gap left open on purpose:** `devices.ts` has the identical shape (a case with an empty device array renders a heading plus a header-only table) and `custodyLog.ts` returns `null`. The three tables are now inconsistent on empty (row / header-only / null). That was not silently "fixed" because the semantics differ — an intake receipt with no devices may be a *data* problem worth surfacing rather than an empty state — and it deserves one deliberate ruling. Tracked as **FUP-07**.
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderLineItems` guards `!li` (line 34) and `columns.length === 0` (line 42), but never `li.rows.length === 0`. The body is seeded with the header row and the loop simply adds nothing.
- **Steps to reproduce:** Generate a document whose line-item collection is empty (a zero-item quote, or a case with no billable services).
- **Expected:** The section is omitted, or shows an explicit "No items" line.
- **Actual:** A "Line Items" heading followed by a header-only table with no rows — reads as a rendering failure.
- **Suggested fix:** Return `null` (or an explicit empty-state row) when there are no rows.

### TBL-07 — Explicit column widths are never normalized against the printable width
- **Status:** ✅ **FIXED (engine); no Studio warning.** New `normalizeColumnWidths(widths, available, paddingPerColumn)` in `lineItemTable.ts`, applied by all three data tables (line items, devices, custody log). `available` comes from `contentWidth(engine.config.paper)` — the RND-02 geometry helper — with a 515pt fallback if a config carries no usable paper block. The budget subtracts pdfmake's per-column cell padding (8pt default / 12pt for the premium "light" finish) plus vertical borders, and reserves 40pt per star column so the star columns can still absorb the remainder; fixed widths over budget are scaled **proportionally** (floored at 12pt each) rather than truncated.
  **Parity:** the function is the **identity** (returns the same array reference) whenever the fixed widths already fit and whenever no column has an explicit width. Verified by hand against every shipped column set on the default A4/40pt page: line items 260pt fixed + 2 star (budget 376); India-profile line items with `itemCode`+`unit` forced visible 355pt + 2 star (budget 489); devices 385pt + 1 star (budget 440); chain-of-custody 318pt + 1 star (budget 431); report custody 283pt + 1 star (budget 440). All no-ops. 5 cases in `dataTableRobustness.test.ts`, incl. a 283×170pt stock-label sheet where 600pt of columns scale into 259pt with ratios preserved.
  **Not done:** the "warn in the Studio" half of the suggested fix — normalization is silent. A tenant who over-specifies widths gets a correct-looking table with no indication their numbers were scaled.
- **Severity:** Medium · **Priority:** P2
- **Description:** `widths` is built as `col.width !== undefined ? col.width : '*'` (line 92). Column widths are tenant-configurable, and nothing checks that the fixed widths sum to less than the content width — nor that at least one star column remains to absorb the remainder.
- **Steps to reproduce:** Configure explicit point widths on every visible line-item column totalling more than the printable width (easy at narrow margins, or after switching to a custom/label paper size).
- **Expected:** Widths are normalized, or the config is rejected with a clear message.
- **Actual:** pdfmake overflows the table past the right margin and clips; with the S/N column enabled an extra fixed 24pt is added on top, making overflow easier to hit.
- **Suggested fix:** Normalize fixed widths to the available content width (scale down proportionally) and warn in the Studio.

### TBL-08 — Row rendering is unbounded, with no cap or pagination safeguard
- **Status:** ✅ **FIXED as a PREVIEW-ONLY, opt-in cap.** `PREVIEW_MAX_TABLE_ROWS = 500` reaches the renderers through `EngineContext.maxTableRows`, which **only the two preview entry points set** (`previewTemplate`, `previewDocumentForRecord`). `pdfService`, `reportPDFService` and `send-document-email` share these renderers and pass nothing, so a **generated or emailed document always renders every row** — `capRows()` returns the input array and `truncated: false` when no cap is present. `renderCustodyLog` ignores the cap outright: completeness *is* that document.
  A capped preview shows a visible full-width continuation row (bilingual) naming the preview explicitly: *"Preview only — showing the first 500 of N rows … Totals reflect all N rows. The generated document renders every row."*
  **This scoping was a correction made after code review.** The first implementation applied the cap unconditionally in the shared section renderers, which would have truncated **real** generated PDFs — an invoice printing fewer lines than its totals block sums (the adapter derives totals from the full row set) and a chain-of-custody report silently omitting ledger rows from a document produced as evidence, while its legal notice still asserted the ledger was whole. That is a CLAUDE.md violation (never break `chain_of_custody`), and the cap was rescoped before this write-up. **500 remains a rendering safeguard, not a records policy** — if a complete printed ledger is ever a legal requirement, the answer is a paginated appendix, not a higher cap.
  **Parity:** ordinary documents are unchanged in both paths; a test pins the exact-cap boundary (500 rows → no continuation row). 4 cases in `dataTableRobustness.test.ts`. The distinct timeout message asked for in the suggested fix was delivered separately by **STU-05**.
- **Severity:** Medium · **Priority:** P2
- **Description:** Every table maps its full collection with no cap. `previewTemplate` enforces a 15s `PREVIEW_TIMEOUT_MS`.
- **Steps to reproduce:** Preview a chain-of-custody document for a long-running case (hundreds of custody events), or a case with a large device array (e.g. a 24-drive RAID plus per-device rows).
- **Expected:** Large datasets render, or degrade with a clear message.
- **Actual:** Render time grows with row count until the preview trips the 15s timeout and reports the generic "Could not render the preview" (see STU-05) — indistinguishable from a config error. Generation has no equivalent timeout, so the browser tab can instead hang while rasterizing.
- **Suggested fix:** Measure worst-case row counts; add a soft cap with a "showing first N of M" continuation line, and surface a distinct timeout message.

### TBL-09 — Long unbroken tokens overflow their column *(description was inaccurate as first written)*
- **Status:** ✅ **FIXED**, with the premise **corrected** and the blast radius explicitly bounded. New `softWrapLongTokens()` in the **renderer** (adapters untouched) inserts U+200B break opportunities inside long unbroken ASCII tokens; wired into line-item, device and custody-log body cells.
  **Correction to the description:** "pdfmake wraps on whitespace only" is **not accurate**. pdfmake runs the full UAX #14 line-breaking algorithm via `@foliojs-fork/linebreak` (`pdfmake/src/textTools.js` → `splitWords`), so hyphens, slashes and script boundaries already provide break opportunities. The defect is real but narrower than stated: only a long run with **no** UAX #14 break opportunity (a hex hash, a separator-less serial) overflows. The fix targets exactly that, which is why hyphenated serials and slash-separated URLs come out untouched.
  **Five gates, each a no-op on ordinary content:** (1) only tokens longer than 28 chars are considered; (2) printable-ASCII only — a U+200B inside Arabic breaks the cursive join; (3) an existing `-` or `/` resets the counter; (4) the whole pass is disabled unless the document's resolved font is verified to carry U+200B; (5) **copy-exact columns are excluded by column key** — `COPY_EXACT_COLUMN_KEYS = { serial, itemCode, hash, signature }`. Badge/icon lookups (`getDeviceIconSvg`, role badge, category badge) keep the RAW value.
  **The `serial` exclusion was added after code review.** The first implementation carved out only `hash`/`signature`, which the custody log does not actually have — meanwhile the device **`serial`** column *was* being wrapped on intake receipts, customer copies and checkout forms. That is the string tying a physical drive to its custody chain; a customer, insurer or court copies it out of the PDF, and an invisible U+200B makes the extracted text differ from `case_devices.serial_number` with nothing surfacing the mismatch. An overflowing column is the lesser defect there. `itemCode` (statutory HSN/SAC) was added on the same reasoning.
  **Residual risk, unavoidable with this approach:** a PDF has no "soft" break — the U+200B is a real character in the content stream with a ToUnicode mapping, so any token above the threshold in a **non**-copy-exact column (a long opaque reference, a query-string URL) will paste back with invisible U+200Bs. Two cheaper alternatives were evaluated and **do not work**, recorded so nobody retries them: chunked `{ text: [...] }` arrays are re-joined by `normalizeTextArray` with `noNewLine = true` (pdfmake deliberately *prevents* a break there), and soft hyphen U+00AD renders unconditionally in PDF, printing a literal hyphen inside every long serial.
  **Disabled on Arabic and bilingual documents, on measured evidence.** The bundled fonts were checked with fontkit (`@foliojs-fork/fontkit`, the copy pdfmake itself uses): Roboto, NotoSansArabic and NotoSansThai map U+200B to a real zero-advance glyph; **Tajawal does not** — it falls through to `.notdef`, a *visible* box outline (bbox 24..216 × 0..633, 0.24em advance). Since `engineDefaultFont` resolves every non-`en` mode (including English-primary bilingual) to Tajawal, wrapping there would print boxes through every long serial. The pass is therefore gated on an allow-list of verified families, and Arabic/bilingual documents keep today's overflow behaviour. Tracked as **FUP-05**.
  **Parity:** the default-path tests assert `JSON.stringify(node)` contains no U+200B for all three tables; every existing parity/snapshot suite passes unchanged. 9 cases in `dataTableRobustness.test.ts`, incl. a round-trip proving that stripping the ZWSPs restores the original exactly.
  **Out of scope:** `hashVerification.ts` and `digitalSignatures.ts` were not in this round and still overflow untouched — which is arguably correct for those tables, since their content is copy-exact by definition.
- **Severity:** Medium · **Priority:** P2
- **Description:** Cells are emitted as plain `{ text }` (`lineItemTable.ts:81-85`) with no wrap strategy. ~~pdfmake wraps on whitespace only.~~ — see the Status correction; pdfmake runs the full UAX #14 breaker, so the real gap is a run with *no* break opportunity at all.
- **Steps to reproduce:** Put a long serial number, hash, or URL with no spaces into a narrow column (device serials and the hash-verification table are the natural cases).
- **Expected:** The token wraps or is ellipsized within the column.
- **Actual:** It overflows the column boundary and overlaps the neighbouring cell/border.
- **Suggested fix:** Insert soft break opportunities (zero-width spaces) for long tokens in the adapter, or ellipsize with the full value retained elsewhere.

### TBL-10 — `'N/A'` fallback is hardcoded English in bilingual documents *(one of the two suggested fixes was wrong)*
- **Status:** ✅ **FIXED** — all 14 hardcoded `'N/A'` fallbacks across 8 adapters now route through a new shared helper, `engine/adapters/missingValue.ts`. `missingValue(config.language)` returns the historical `'N/A'` for an English-only document and the script-neutral **em dash (U+2014)** for any document carrying a secondary language. Sites: `advanceVoucherAdapter` (party name), `checkoutAdapter` ×3 (name/phone/email), `creditNoteAdapter`, `invoiceAdapter` ×4, `paymentReceiptAdapter`, `quoteAdapter` ×4, `receiptAdapter` ×3, `reportAdapter` ×4. Signature threading was minimal and internal-only (two private helpers gained a `config` param; the other six adapters already had `config` in scope) — **zero public API change**.
  **Correction — "route the fallback through `ctx.t`" would NOT have fixed this,** for two independently fatal reasons, both now pinned by executable tests rather than asserted from a code read. (1) `ctx.t(key, en)` resolves to `formatBilingualText(en, translated)` = `` `${en} | ${translated}` `` (`documentTranslations.ts:4144-4151`) — a **concatenation, not a lookup**. In an Arabic document `ctx.t('notAvailable','N/A')` renders `N/A | <arabic>`, leaving the Latin abbreviation on the page: the exact symptom this finding reports. That shape is right for a *label* ("Total | الإجمالي") and wrong for a *value* cell. (2) `DOCUMENT_TRANSLATIONS` has no `notAvailable` key, so the call is a literal no-op today. The em dash — the finding's second option — was therefore used for **all** adapters. Note `reportAdapter` is the only one of the 12 that receives a `TranslationContext`, and it uses the em dash too; `config.language` is the single predicate everywhere.
  **Parity:** the switch is direction-conditional, never unconditional. `missingValue()` returns `'N/A'` when `mode === 'en'`, when `resolveSecondary(language)` is null, **and** when `language` is absent entirely (several existing adapter tests and call sites build partial config literals such as `{} as DocumentTemplateConfig`). The bilingual predicate deliberately mirrors `ctxFromLanguageConfig`'s own definition rather than inventing a second one, so the fallback cannot disagree with the rest of the engine about whether a document is bilingual — and it requires **both** clauses, so a `{ mode: 'en', secondary: 'fr' }` config (which renders English-only) keeps `'N/A'`. Parity was proven **empirically**: stubbing `missingValue()` to always return `'N/A'` made exactly the 13 fix assertions fail while the 12 parity assertions still passed.
  **Evidence:** 27 new cases (`missingValue.test.ts` 9 + `missingValueAdapters.test.ts` 18, table-driven over all 8 adapters, each probed twice with the same record). `npx vitest run src/lib/pdf/engine/adapters/` → 92 passed; 7 downstream parity/compliance suites → 78 passed; `git diff --stat` on `__snapshots__/` is **empty** — zero snapshot churn. No existing test assertion needed changing (verified by grep, not assumed).
  **Intended behaviour change:** bilingual documents genuinely change `'N/A'` → `'—'`. English-only output is byte-identical.
  **Open caveat (needs a real render):** the em dash is U+2014. Roboto certainly covers it, and Tajawal / NotoSansKR / NotoSansThai are full-coverage families that should — but this could not be confirmed against the **subsetted** pdfmake VFS fonts in this environment. If a subset drops U+2014 it renders as a missing-glyph box on exactly the documents this fix targets. One visual check settles it: an Arabic-bilingual invoice with a nameless customer. The one-line remedy if it fails is `NEUTRAL_MISSING_VALUE = '-'` (U+002D), which `safeString` already uses.
  **Observation, pre-existing:** `pdf/utils.ts` `safeString()` returns `'-'` (hyphen) for a null value, so two neutral placeholders now coexist — a missing Client Ref renders `-` while a missing Phone renders `—`. Unifying them means touching `utils.ts`, outside this round's file set.
- **Severity:** Medium · **Priority:** P2
- **Description:** Adapters fall back to the literal `'N/A'` for missing parties/fields — e.g. `advanceVoucherAdapter.ts:46`, `checkoutAdapter.ts:229/238/240`, `creditNoteAdapter.ts:100`. ~~The engine has a translation context (`ctx.t`) used elsewhere for exactly this purpose.~~ — see the Status correction; `ctx.t` concatenates rather than substitutes and would have left the Latin `N/A` on the page.
- **Expected:** The placeholder is localized (or a neutral `—`).
- **Actual:** An Arabic document shows a Latin `N/A` mid-sentence in an otherwise Arabic field block.
- **Suggested fix:** ~~Route the fallback through `ctx.t`, or~~ standardize on the script-neutral `—`.

### TBL-11 — Dead duplicate helper in the line-item renderer
- **Status:** ✅ **FIXED** — `headerAlignment` renamed to `columnAlignment` and now used for **both** the header cell (`alignment`) and the body cell alignment, replacing the inlined `col.align ?? 'left'`. The alignment→style mapping that followed it was extracted to a matching `alignedCellStyle()` so the two spellings cannot drift.
  **Parity:** `columnAlignment(col)` is character-for-character the expression that was inlined, and `alignedCellStyle` is the same ternary chain — a pure refactor with zero output change. All 126 tests across the 10 parity/section suites pass unchanged.
  **Same smell left in the siblings (FUP-08):** `devices.ts` and `custodyLog.ts` each carry their own verbatim `headerAlignment(col)`, and both additionally have a dead ternary in the header row — `alignment: light ? (col.align ?? 'left') : headerAlignment(col)` — whose two branches evaluate to the same value. Left alone to keep this diff scoped to the finding.
- **Severity:** Low · **Priority:** P3
- **Description:** `headerAlignment(col)` (`lineItemTable.ts:25-27`) returns `col.align ?? 'left'` — the exact expression inlined at line 82 for body cells. Two spellings of one rule invite divergence.
- **Suggested fix:** Use the helper in both places, or drop it.

---

# 6. Follow-ups raised **by** the fix rounds *(new — not part of the original 36)*

These were surfaced while implementing the findings above, or by the code review of that work. None is a regression introduced by the fixes unless stated; they are pre-existing gaps the fix work made visible, or gaps the fixes deliberately left open. **None has been implemented.**

### FUP-01 — Record preview and sample preview still resolve the QR differently
- **Severity:** Medium · **Priority:** P2 · *(the un-fixed remainder of PDF-04)*
- The sample path resolves its QR as `resolveQrImage(null, engineData.zatcaPayload ?? engineData.qrPayload)` — it **generates** a QR from the verification payload (`previewTemplate.ts:183`). The record path only loads the tenant's uploaded QR image URL and has **no payload fallback**. Flipping the data-source picker can therefore still make a QR appear or disappear for reasons unrelated to the data. PDF-04 enumerated logo/stamp/signature/companySettings only, so this was left alone rather than risk a record-preview output change; it deserves its own fix.

### FUP-02 — Report record preview uses the Studio's subtype, not the record's `report_type`
- **Severity:** Medium · **Priority:** P2 · *(introduced by the STU-07 expansion — a fresh preview-vs-download divergence of the PDF-01 class)*
- `TemplateStudio` merges `reportSubtype: previewSubtype` into the config it hands to the preview, while `reportAdapter` derives the device column, custody timeline and title from `data.report.report_type`. Previewing a *forensic* report while the Studio's subtype picker sits on *evaluation* therefore renders the record's data through another subtype's section config — the download will not match. `previewRecord.ts` does nothing to reconcile the two. Fix: have the record path resolve the subtype from the loaded record and either override the Studio picker or surface the mismatch.

### FUP-03 — Filtered placeholders pass `validateTemplate` but ship literally in emails
- **Status:** ✅ **FIXED** — the guard is now enforced, not documented. `validateTemplate` returns an additive `filtered: string[]` alongside `unknown` (backed by a new `extractFilteredPlaceholders`), and `NotificationTemplatesTab` treats a non-empty `filtered` as a hard **error**: an inline `role="alert"` chip while typing, and a blocked save with a toast naming the offending placeholders. This is deliberately stricter than the BIND-01 unknown-key gate, which merely confirms — an unknown key sends a blank and *might* be intended, whereas a filtered placeholder in an email is never what the author wanted.
  **Root cause, for the record:** `extractVariables` reports capture group 1 (the key) only, so `{{total | currency}}` validated as the perfectly-known variable `total` — the validator actively signalled "all clear" on the one construct the dispatcher cannot render. A module-header comment saying "do not use filters here" could not survive that.
  **Second divergence closed in the same change:** the notification preview now renders with `EDGE_FUNCTION_BOOLEANS`, so a boolean shows as `true`/`false` — what the dispatcher's `String(value)` actually sends — instead of the friendlier `Yes`/`No` the document surfaces use. The preview no longer flatters the output.
  Covered by 8 new cases in `templateEngine.test.ts`; one pre-existing test that asserted a filtered placeholder produced **no** signal was corrected, since it encoded exactly this defect.
- **Severity:** Medium · **Priority:** P2 · *(the un-guarded edge of BIND-03)*
- The `notification-dispatch-email` edge function carries its own copy of the renderer whose regex is `/\{\{(\w+)\}\}/` — it cannot match a pipe **or a dot**, so `{{invoice.total | currency}}` is delivered **literally** in the customer's inbox. `templateEngine.ts` documents this loudly in its module header and a test pins it, but nothing stopped an admin typing a filter into `NotificationTemplatesTab`.

### FUP-04 — `pageBreakBefore` has no Studio control
- **Severity:** Low · **Priority:** P3 · *(the un-exposed half of TBL-02)*
- The flag is config + engine only; the per-section controls live in `HeaderFooterTab` / `TableTab` / `OtherDetailsTab`. Today it is reachable from a stored config or the gallery but has no checkbox — the same "config with no UI" shape RND-01 was raised for. It should be closed by whoever owns those tabs.

### FUP-05 — Tajawal has no U+200B, so soft wrapping is off for every Arabic/bilingual document
- **Severity:** Low · **Priority:** P3 · *(the deliberate limit of TBL-09)*
- Verified with fontkit against the bundled `.ttf`: Tajawal-Regular and Tajawal-Bold do **not** contain U+200B; it falls through to a *visible* `.notdef` box. `engineDefaultFont` resolves every non-`en` mode to Tajawal, so bilingual documents keep today's overflow behaviour. Two possible remedies, both a decision rather than a bug fix: ship a Tajawal build that includes U+200B, or pin pure-ASCII runs in those documents to Roboto.

### FUP-06 — The Typst path still collapses every sheet to A4
- **Severity:** Low · **Priority:** P3 · *(the un-extended edge of RND-08)*
- `src/lib/pdf/typst/assemble.ts:220` maps any non-Letter size to `paper: "a4"`, so A3/A5/Legal would render as A4 there. That path is inert today (`TYPST_GENERATION_SUPPORTED` is false, per the PDF-01 fix), but it must be extended in the same change that turns Typst generation on.

### FUP-07 — The three data tables now disagree on the empty state
- **Severity:** Low · **Priority:** P3 · *(surfaced by TBL-06)*
- `lineItemTable` renders an explicit "No items" row, `devices` renders a heading plus a header-only table, `custodyLog` returns `null`. The semantics genuinely differ — an intake receipt with no devices may be a *data* problem worth surfacing rather than an empty state — so this needs one deliberate product ruling, not a mechanical sweep.

### FUP-08 — Duplicate `headerAlignment` + a dead ternary remain in `devices.ts` / `custodyLog.ts`
- **Severity:** Low · **Priority:** P3 · *(the un-swept siblings of TBL-11)*
- Both carry their own verbatim copy of the helper, and both have `alignment: light ? (col.align ?? 'left') : headerAlignment(col)` in the header row — two branches that evaluate to the same value. One-line cleanup each.

### FUP-09 — Other hardcoded English literals leak into bilingual documents *(TBL-10 sweep result)*
- **Severity:** Medium · **Priority:** P2 · *(swept but deliberately not fixed — each needs a `DOCUMENT_TRANSLATIONS` key, and unlike `'N/A'` an em dash would destroy information rather than neutralize it)*
- **QR captions — arguably a bigger leak than TBL-10 itself,** since these are full English sentences rather than a 3-character abbreviation. `data.qrCaption` is a bare `string` rendered directly by `sections/qr.ts:48` and `sections/footer.ts:113,169`; it never passes through the `LabelText` bilingual join, so it is a guaranteed Latin sentence on an Arabic page. Three have **no tenant override at all**: `paymentReceiptAdapter:137` "Scan to verify this receipt", `invoiceAdapter:501` "Scan to verify this invoice", `quoteAdapter:392` "Scan to verify this quote". Five more sit behind a `companySettings.branding.qr_code_*_caption` override (`caseLabelAdapter:94`, `chainOfCustodyAdapter:339`, `checkoutAdapter:287`, `receiptAdapter:243`, `reportAdapter:725`). Suggested fix: promote `EngineDocData.qrCaption` from `string` to `LabelText`.
- **`checkoutAdapter` enum→display maps** — `recoveryOutcomeLabel` (:66-71) "Full Recovery" / "Partial Recovery" / "Unrecoverable" / "Declined", and `RELATIONSHIP_LABELS` (:84-88) "Customer (self)" / "Authorized agent" / "Company representative" / "Courier". Rendered as case-info and collector **values** on the checkout form.
- **Actor fallback `'System'`** — `checkoutAdapter:269`, `receiptAdapter:226` (the premium "Registered by" line).
- **`payslipAdapter:92` `'Not paid'`** — the Payment Date value on an unpaid payslip.
- **`receiptAdapter:158` `'Company Name'`** — worse than a leak: it **fabricates a plausible-looking company name** into the legal/authorization paragraph of an intake receipt when `basic_info.company_name` is missing. Recommend omitting the clause rather than inventing an identity on a document a customer signs.
- **`stockLabelAdapter:77` `'Stock Label'`** — caption fallback when the company name is missing (documented in-file as intentional legacy-builder parity).
- **`advanceVoucherAdapter`** — `documentTitle` "RECEIPT VOUCHER"/"REFUND VOUCHER" (:43) and the line-item description (:60) carry no `ar`; the meta voucher number falls back to `'Draft'` (:52). The file's comment claims the voucher is English-only per the `in_gst` `bilingual:false` profile — but the same adapter ships Arabic meta and totals labels, so that claim only really holds for the title. **Flagged rather than changed: it is regime-owned and should be confirmed with the owner.**

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

*Added in pass 2:*

- **Adapter null-safety** — the adapters are well defended, not sloppy: ~47 explicit fallbacks and 6–7 length guards each in `invoiceAdapter`/`quoteAdapter`. The only defect found is the *wording* of the fallback (TBL-10), not a missing guard.
- **`chainOfCustodyAdapter` date range** — `sortedByDate[0]` looked like an unchecked index but is inside `if (entries.length > 0)`. Safe.
- **`paymentHistory` / `payComponentTable` RTL** — these do not use `mirrorColumns`, but both implement the equivalent reverse + `mirrorAlign` inline. Correct; only `taxSummary` and `totals` are genuinely RTL-blind.
- **Header logo overflow** — `buildLogoNode` consistently passes `maxHeight` (and clamps width via `Math.min` in the compact variants), so an oversized logo is constrained rather than blowing out the header.
- **`terms.stripLeadingTitleLine`** — the `slice`/whitespace-strip logic is correct and does not truncate body text.
- **Header-row aliasing in `lineItemTable`** — `body[0]` and `headerRow` are the same reference, so the S/N `unshift` mutates both. This is intentional and correct (the bug is the *side* it inserts on — TBL-05, not the aliasing).

*Added during the fix rounds* — verified while implementing, recorded so a future pass does not re-investigate. **No finding from the original 36 turned out to be wholly not-a-defect this round;** five had incorrect *details* (STU-01, TBL-04, BIND-06, TBL-09, TBL-10), corrected in place above.

- **`reportAdapter` section-guidance strings** (`:257-292`, ~36 long English paragraphs) — they never reach a PDF. The only non-test consumer of `reportSectionGuidance` is `components/cases/DocumentDraftReview.tsx`, an on-screen authoring hint. **Not a document leak** (checked during the TBL-10 sweep).
- **`invoiceAdapter:133` / `quoteAdapter:129` "Tax No", `invoiceAdapter:286` / `quoteAdapter:263` "VAT"** — these deliberately place the regime term in *both* halves (the `en` and `ar` sides are both the interpolated `taxLabel`), and the in-code comment explains why: the buyer tax-number label is a statutory registry term, and the Arabic secondary intentionally keeps the standard VAT term so it resolves into all 13 languages via the reverse Arabic→key join. **Deliberate and compliance-owned.**
- **`'Draft'` inside QR payload template strings** (`invoiceAdapter:471`, `paymentReceiptAdapter:126`, `quoteAdapter:371`) — machine-readable payloads, never rendered as text.
- **Consent / T&C paragraphs** (`checkoutAdapter:181-185`, `receiptAdapter:172-177`) — fully bilingual `{ en, ar }`, read directly. Not leaks.
- **`'USD'` currency-code and `'REPORT'` document-type fallbacks** — a currency code and an uppercased type token; both script-neutral.
- **`clampPageMargins` non-finite handling** — coerces `NaN`/`Infinity` to 0 before scaling; confirmed under adversarial review.
- **Every new Supabase table/column referenced by the expanded `previewRecord`** (STU-07) exists in `database.types.ts` — confirmed under adversarial review.
- **`ZWSP_SAFE_FONTS` claims** — independently re-verified by dumping the cmaps: Roboto / NotoSansArabic / NotoSansThai carry U+200B, Tajawal does not, and all four carry U+2014.

---

## Coverage & gaps — please read

Two passes found **36 issues against a target of 50+**. I am reporting the number I actually verified rather than padding the list, because a QA report whose findings are speculative is worse than a short one. Pass 2 yielded fewer new findings than I predicted for an honest reason: **the adapters turned out to be genuinely well written** (see the pass-2 additions to "Verified as not defective"), so the defects concentrated in the table/page-break/RTL layer rather than in data handling.

The fix rounds since then have added **9 follow-ups (§6)** — mostly gaps the implementations deliberately left open, plus two divergences the work itself introduced or exposed (FUP-01, FUP-02). The fix rounds are **not** an additional audit pass: they read deeply into the files they touched and swept a few adjacent surfaces (the adapter English-literal sweep behind FUP-09), but the coverage gaps below are otherwise unchanged.

**Covered:** `renderTemplate`, `previewTemplate`, `previewRecord`, `pageGeometry`, `branding`/watermark resolution, `footer`/`header`/`reportFooter` geometry, `TemplateStudio` + `GeneralTab` + `TemplateGalleryModal`, `templateEngine`, the preview/generation call graph, the page-break and RTL posture of all eight data tables, `lineItemTable` / `devices` / `custodyLog` / `totals` / `taxSummary` in depth, and an adapter-wide sweep for null-safety, numeric guards, date formatting and hardcoded English literals.

**Still not covered:**
- ~22 remaining section renderers read only via targeted pattern sweeps, not line by line — `reportSections`, `reportSummary`, `reportHeader`, `infoBoxes`, `caseInfo`, `signature`, `bank`, `openCard`, `taxBar`, `netPay`, `deductions`, `earnings`, `hashVerification`, `digitalSignatures`, the label renderers.
- Per-adapter deep reads (14 files) — the sweeps covered null-safety, format and English-literal patterns, not each adapter's document-specific mapping logic.
- `HeaderFooterTab`, `TransactionTab`, `TableTab`, `TotalTab`, `OtherDetailsTab` (~1,100 lines of controls) — still only `GeneralTab` has been read.
- `profileResolver`, `registry`, `rtl`, `palette`, `fonts`/`fontLoader`, `brandingImage`, `qrImage`, `contentHash`.
- `documentTemplatesService` / `templateContextService` CRUD, RLS and tenant-scoping.

**Cannot be done in this environment (needs a human or a live session):**
- Screenshots / screen recordings.
- Visual diffing of preview vs generated PDF, and rendering across Acrobat / Preview / Chrome PDF / Firefox pdf.js.
- Cross-browser and cross-OS behaviour.
- True large-dataset and multi-page page-break testing against production data.
- Glyph coverage in the **subsetted** pdfmake VFS fonts (bears on TBL-10's em dash and TBL-09's U+200B).
- The STU-07 record-preview types that need real tenant data (reports, checkouts, custody logs, payslips, credit notes).

TBL-01 through TBL-09 were *predicted from the code* in pass 2; each fix is asserted at the document-definition level and each still needs a real multi-page render to confirm the visual result.

## Fix status

**34 fixed · 1 partly fixed · 1 open**, out of the 36 findings. Plus **9 new follow-ups** in §6, none implemented.

| Finding | Status |
|---|---|
| **PDF-01** preview/download engine split | ✅ Fixed — shared `selectRenderEngine()` |
| **PDF-02** preview invents a placeholder logo | ✅ Fixed — opt-in `logoPlaceholder: false` + Studio **Print view** toggle + consequence-stating warning |
| **PDF-03** gallery ignores tenant identity | ✅ Fixed — gallery resolves and threads tenant settings/logo/language |
| **PDF-04** sample vs record branding differ | ✅ Fixed — one branding step feeds both paths (also removes 3 duplicate fetches). QR still differs → **FUP-01** |
| **RND-01** watermark image renders nothing | ✅ Fixed — page `background` + Studio control |
| **RND-02** hardcoded `x2: 525` dividers | ✅ Fixed — `pageGeometry` helpers across all 4 engine sites |
| **RND-03** footer margins ignore paper margins | ✅ Fixed — `footerBlockMargin()` / `footerSideInsets()`; footer is **flush** (`FOOTER_OUTDENT = 0`), a deliberate 5pt output change |
| **RND-04** page number ignores the palette | ✅ Fixed — `config.colors ? colors.label : textMuted` (group-presence gate, deliberately not unconditional) |
| **RND-05** page-number margins fixed / not RTL-aware | ✅ Fixed — derived from the clamped margins, mirrored for RTL |
| **RND-06** watermark colour not configurable | ✅ Fixed — `watermark.color` + `ColorField`, legacy neutral as default |
| **RND-07** custom dimensions unvalidated | 🟡 **Partly fixed — still open.** `resolvePageBox` degrades an invalid box to A4, but `renderTemplate` still hands the raw pair to pdfmake, so geometry and sheet can now disagree |
| **RND-08** only A4/Letter supported | ✅ Fixed — A3/A5/Legal via one shared `PREDEFINED_SHEET` map. Typst path not extended → **FUP-06** |
| **STU-01** margin bounds | ✅ Fixed — UI `max` + `clampPageMargins` backstop (finding corrected) |
| **STU-02** Reset has no confirmation | ✅ Fixed — `useConfirm` danger dialog |
| **STU-03** no unsaved-changes guard | ✅ Fixed — dirty tracking + confirm on back + `beforeunload` |
| **STU-04** watermark sub-controls / no image upload | 🟡 **Half fixed — remainder deliberately NOT built.** Gating fixed by RND-01; a real upload needs a branding field + Company-settings control + plumbing through ~10 call sites. Stubbing it would recreate the RND-01 dead-config defect |
| **STU-05** generic preview-failure message | ✅ Fixed — `describePreviewFailure` maps 6 causes + `<details>` technical detail |
| **STU-06** filename mangles non-Latin titles | ✅ Fixed — Unicode-aware `previewDownloadFilename` with an ASCII fallback (legacy-sanitizer parity oracle over all 20 real headings) |
| **STU-07** record preview limited to 3 types | ✅ Fixed for 10 of 11 — `stock_label` deliberately excluded (no per-record fetcher exists). Wiring-level verification only |
| **BIND-01** silent placeholder failures | ✅ Fixed — validation + confirm in `NotificationTemplatesTab` |
| **BIND-02** booleans render as `true`/`false` | ✅ Fixed — injectable Yes/No labels; `false` stays **visible**, not blanked. Edge-function divergence pinned |
| **BIND-03** no number/currency/date formatting | ✅ Fixed — opt-in `{{key \| filter}}` + caller-supplied formatters. **No caller wired yet**; blocked in notification templates (**FUP-03** fixed) |
| **BIND-04** no stress fixtures | ✅ Fixed — `STRESS_CONTEXT` (34 keys, same shape) + an immutability guard on `SAMPLE_CONTEXT`. Not yet in the picker |
| **BIND-05** empty `content` reachable | ✅ Fixed — engine guard. No Studio validation message |
| **BIND-06** density rounds margins to zero | ✅ Fixed — `scaleMargin` clamp. **Finding's trigger was wrong** (`minScale` is a floor; 1–2pt never rounded away) |
| **TBL-01** rows split across pages | ✅ Fixed — `dontBreakRows` on all 8 data tables |
| **TBL-02** no section page break | ✅ Fixed (config + engine). **No Studio control** → **FUP-04**; `unbreakable` not done |
| **TBL-03** tax summary RTL-blind | ✅ Fixed — column + alignment mirroring |
| **TBL-04** totals RTL-blind | ✅ Fixed (geometry); in-cell alignment intentionally unchanged |
| **TBL-05** S/N column side under RTL | ✅ Fixed — `push` under RTL, `unshift` under LTR (widths stay index-aligned) |
| **TBL-06** empty line-item table | ✅ Fixed — explicit "No items" row (chosen over `null` so it cannot read as a render failure). Siblings inconsistent → **FUP-07** |
| **TBL-07** column widths not normalized | ✅ Fixed — `normalizeColumnWidths` on 3 tables, identity when widths fit. **No Studio warning** |
| **TBL-08** unbounded row rendering | ✅ Fixed as a **preview-only, opt-in** cap (500) via `EngineContext.maxTableRows`; generation and the custody log are never capped *(rescoped after code review — the first version truncated real PDFs)* |
| **TBL-09** long unbroken tokens overflow | ✅ Fixed — gated U+200B soft wrap. **`serial`/`itemCode` excluded** *(added after code review)*; off on Arabic/bilingual → **FUP-05**; description corrected |
| **TBL-10** hardcoded English `'N/A'` | ✅ Fixed — shared `missingValue()` → `'—'` when bilingual. **`ctx.t` fix was wrong** (it concatenates). Em-dash glyph needs a visual check |
| **TBL-11** duplicate alignment helper | ✅ Fixed — one `columnAlignment` + `alignedCellStyle`. Siblings unswept → **FUP-08** |

**Remaining, in recommended order:**

1. **FUP-03** — filtered placeholders can be typed into `NotificationTemplatesTab` and ship **literally** in a customer email. Cheapest of the open items and the only one with a customer-visible failure mode; add a filter-detection warning to that editor's existing validate-and-confirm flow.
2. **FUP-02** — report record preview uses the Studio's subtype instead of the record's `report_type`. This is a fresh preview-vs-download divergence of the PDF-01 class, introduced by the STU-07 expansion, so it should be closed before the expanded picker is relied on.
3. **RND-07** — finish it: validate custom dimensions at the config boundary and add `min`/`max` to the Studio's width/height inputs, so the geometry helpers and the sheet handed to pdfmake cannot disagree.
4. **FUP-01** — give the record preview the same QR resolution as the sample preview (the last known input divergence between the two paths).
5. **FUP-09** — the QR-caption leak, which is a *bigger* bilingual leak than TBL-10 was (full English sentences, three with no tenant override), plus `receiptAdapter`'s fabricated `'Company Name'` on a document the customer signs. Needs `DOCUMENT_TRANSLATIONS` keys and a `qrCaption: string → LabelText` promotion.
6. **FUP-04** — a Studio checkbox for `pageBreakBefore`, in the section tabs. Until then TBL-02 is config-with-no-UI.
7. **STU-04** — a real watermark-image upload (branding field + Company-settings control + plumbing). Scoped, not started.
8. **FUP-05 / FUP-06 / FUP-07 / FUP-08** — the Tajawal U+200B decision, the Typst paper-size map, one ruling on the three tables' empty state, and the duplicate-helper cleanup in `devices.ts` / `custodyLog.ts`.

Also unaddressed and worth an explicit decision, not a code change: **TBL-08's 500-row cap is a rendering safeguard, not a records policy.** If a complete printed chain-of-custody ledger is ever a legal requirement, the answer is a paginated appendix rather than a higher cap.

### Verification limits — what is and is not proven

**Proven, by targeted tests on the touched files:** every fix above is asserted at the **pdfmake document-definition level** (the object handed to the renderer) and, for the substitution layer, at the string level. Parity is asserted explicitly for every change — an unconfigured / English / A4-portrait document reproduces `pageSize: 'A4'`, `pageMargins: [40,40,40,40]`, footer margin `[35,10,35,25]` (and `[35,0,35,25]` for the QR variant), divider `x2: 525`, no watermark / background / `pageBreak` / page-number line, and no U+200B anywhere. `git diff --stat` on `src/lib/pdf/engine/__snapshots__/` is **empty** — no regression is hidden behind an updated snapshot — and nothing under `src/lib/pdf/documents/*` (the legacy hand-written builders, including their 16 deliberate `x2: 525` literals) was touched.

**Not proven — needs a real render or a live tenant:**
- That a 55pt footer inset, an A5 divider rule, a mirrored RTL page number, a mirrored Arabic totals block, or a tall row moving whole to the next page **look** right.
- That U+2014 survives into the subsetted Arabic/CJK/Thai VFS fonts (TBL-10) — the single cheapest check is an Arabic-bilingual invoice with a nameless customer.
- That a soft-wrapped token breaks where intended and that no copy-exact value was wrapped (TBL-09) — assert by copying a device serial out of a generated intake receipt and diffing it against `case_devices.serial_number`.
- That the 8 newly-supported record-preview types render correctly against real production records (STU-07); they are verified only at the wiring level.

**Known-noisy, not caused by this work:** two cases in `src/lib/pdf/engine/chainOfCustodyParity.test.ts` fail in this environment. The failing assertions are on the **legacy** builder's output (`'13/06/2026'` vs the `'Jun 13, 2026, 13:30'` an en-US host produces) via `formatDateTimeWithConfig(…, null)` falling back to the host ICU locale. Neither `documents/ChainOfCustodyDocument.ts` nor `format.ts` is in the diff, and the failure reproduces identically at pristine `HEAD` in a detached worktree. Separately, `profileResolver.devAssertion.test.ts` / `pdfServiceCountryLayer.test.ts` / `pdfServiceCreditNoteRouting.test.ts` collect 0 tests because Supabase env vars are absent here. Both are environment issues worth fixing on their own.

I can take any of the remaining items as an implementation task, or continue auditing the surface listed under **Still not covered**.
