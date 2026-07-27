# PDF Template Module — QA Audit (Passes 1–2)

**Date:** 2026-07-26
**Scope:** `src/lib/pdf/**` (engine, sections, adapters), `src/components/settings/documents/**` (Template Studio + tabs), `src/lib/templateEngine.ts`, `src/lib/pdf/engine/previewTemplate.ts`, `src/lib/pdf/previewRecord.ts`
**Method:** static / code-level audit against the running implementation. See **Coverage & gaps** for what these passes did *not* cover.

- **Pass 1** — engine core, Studio, substitution layer (PDF-01…BIND-06).
- **Pass 2** — section renderers + adapters: tables, page breaks, RTL, overflow (TBL-01…TBL-11).

---

## Executive summary

The single most important architectural finding is **positive** and worth stating up front, because it changes how the rest of this report should be read:

> **The live preview is not an HTML mock.** `previewTemplate()` runs the *same* `renderTemplate()` → pdfmake pipeline as production generation, and renders a real PDF blob into an `<iframe>`. Whole classes of "preview vs PDF" drift (CSS-vs-PDF font metrics, box model differences, HTML table vs pdfmake table) **cannot occur by construction**.

Preview/PDF mismatches are therefore *not* systemic. They are a small number of specific, fixable divergences — documented as PDF-01…PDF-04 below.

The defects that matter most are: a **feature-flagged engine split** that makes Arabic previews render through a different engine than downloads (PDF-01), a **documented watermark-image option that renders nothing** (RND-01), **page-size-dependent geometry hardcoded to A4 portrait** (RND-02), **no input validation on page margins** (STU-01), and **silent placeholder failures in customer-facing documents** (BIND-01).

Pass 2 adds the table/page-break layer, where the dominant theme is **multi-page and RTL behaviour**: no data table in the module protects its rows from splitting across a page boundary (TBL-01), and two of the most prominent blocks on an Arabic invoice — the **tax summary** and the **totals** — never mirror for RTL while every sibling table does (TBL-03, TBL-04).

**Findings: 36 total** — 25 in pass 1 (4 parity · 8 rendering · 7 Studio UX · 6 data-binding) and 11 in pass 2 (tables, page breaks, RTL, overflow). Target was 50+; see **Coverage & gaps** for exactly what remains and why.

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
- **Status:** ✅ **FIXED** for the unguarded editor. **Correction to the original finding:** `TemplateTypeDetail` is *not* an unvalidated surface — it delegates its editing to `LineItemTemplateFormModal`, which already computes `unknownVariables` and warns "will render blank". The genuinely unguarded editor was `NotificationTemplatesTab`, whose `handleSave` checked only that the body was non-empty. It now validates subject + body + link against `NOTIFICATION_EVENT_VARIABLES[eventType]`, shows a live warning chip listing the unknown keys, and requires an explicit confirm on save (warn-don't-block, matching the existing pattern, so a deliberately forward-looking template is still savable).
- **Severity:** Critical · **Priority:** P0
- **Description:** `templateEngine.renderTemplate` returns `''` for any unresolved key unless `keepUnknown` is set (which only editor previews use). A `validateTemplate()` helper exists and is correct — but a repo-wide grep shows it was wired into **exactly one** surface (`LineItemTemplateFormModal.tsx:116`). `NotificationTemplatesTab.tsx` rendered and saved templates without ever calling it.
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
- **Severity:** Medium · **Priority:** P2
- **Description:** `lineItemTable.ts:96-102` implements the opt-in S/N column with `headerRow.unshift(...)`, `body[r].unshift(...)` and `widths.unshift(24)`. These always prepend to the *array head*, i.e. the visual left. But the columns were already mirrored for RTL at line 41 (`mirrorColumns`).
- **Steps to reproduce:** Enable row numbering on an Arabic (RTL) template.
- **Expected:** The serial column sits on the right, first in reading order.
- **Actual:** It is pushed to the far left — last in RTL reading order, so rows appear to start with the description and end with the number.
- **Suggested fix:** `push` instead of `unshift` when direction is RTL (or mirror after the S/N column is added).

### TBL-06 — Empty line-item list renders a heading and an empty table
- **Severity:** Medium · **Priority:** P2
- **Description:** `renderLineItems` guards `!li` (line 34) and `columns.length === 0` (line 42), but never `li.rows.length === 0`. The body is seeded with the header row and the loop simply adds nothing.
- **Steps to reproduce:** Generate a document whose line-item collection is empty (a zero-item quote, or a case with no billable services).
- **Expected:** The section is omitted, or shows an explicit "No items" line.
- **Actual:** A "Line Items" heading followed by a header-only table with no rows — reads as a rendering failure.
- **Suggested fix:** Return `null` (or an explicit empty-state row) when there are no rows.

### TBL-07 — Explicit column widths are never normalized against the printable width
- **Severity:** Medium · **Priority:** P2
- **Description:** `widths` is built as `col.width !== undefined ? col.width : '*'` (line 92). Column widths are tenant-configurable, and nothing checks that the fixed widths sum to less than the content width — nor that at least one star column remains to absorb the remainder.
- **Steps to reproduce:** Configure explicit point widths on every visible line-item column totalling more than the printable width (easy at narrow margins, or after switching to a custom/label paper size).
- **Expected:** Widths are normalized, or the config is rejected with a clear message.
- **Actual:** pdfmake overflows the table past the right margin and clips; with the S/N column enabled an extra fixed 24pt is added on top, making overflow easier to hit.
- **Suggested fix:** Normalize fixed widths to the available content width (scale down proportionally) and warn in the Studio.

### TBL-08 — Row rendering is unbounded, with no cap or pagination safeguard
- **Severity:** Medium · **Priority:** P2
- **Description:** Every table maps its full collection with no cap. `previewTemplate` enforces a 15s `PREVIEW_TIMEOUT_MS`.
- **Steps to reproduce:** Preview a chain-of-custody document for a long-running case (hundreds of custody events), or a case with a large device array (e.g. a 24-drive RAID plus per-device rows).
- **Expected:** Large datasets render, or degrade with a clear message.
- **Actual:** Render time grows with row count until the preview trips the 15s timeout and reports the generic "Could not render the preview" (see STU-05) — indistinguishable from a config error. Generation has no equivalent timeout, so the browser tab can instead hang while rasterizing.
- **Suggested fix:** Measure worst-case row counts; add a soft cap with a "showing first N of M" continuation line, and surface a distinct timeout message.

### TBL-09 — Long unbroken tokens overflow their column
- **Severity:** Medium · **Priority:** P2
- **Description:** Cells are emitted as plain `{ text }` (`lineItemTable.ts:81-85`) with no wrap strategy. pdfmake wraps on whitespace only.
- **Steps to reproduce:** Put a long serial number, hash, or URL with no spaces into a narrow column (device serials and the hash-verification table are the natural cases).
- **Expected:** The token wraps or is ellipsized within the column.
- **Actual:** It overflows the column boundary and overlaps the neighbouring cell/border.
- **Suggested fix:** Insert soft break opportunities (zero-width spaces) for long tokens in the adapter, or ellipsize with the full value retained elsewhere.

### TBL-10 — `'N/A'` fallback is hardcoded English in bilingual documents
- **Severity:** Medium · **Priority:** P2
- **Description:** Adapters fall back to the literal `'N/A'` for missing parties/fields — e.g. `advanceVoucherAdapter.ts:46`, `checkoutAdapter.ts:229/238/240`, `creditNoteAdapter.ts:100`. The engine has a translation context (`ctx.t`) used elsewhere for exactly this purpose.
- **Expected:** The placeholder is localized (or a neutral `—`).
- **Actual:** An Arabic document shows a Latin `N/A` mid-sentence in an otherwise Arabic field block.
- **Suggested fix:** Route the fallback through `ctx.t`, or standardize on the script-neutral `—`.

### TBL-11 — Dead duplicate helper in the line-item renderer
- **Severity:** Low · **Priority:** P3
- **Description:** `headerAlignment(col)` (`lineItemTable.ts:25-27`) returns `col.align ?? 'left'` — the exact expression inlined at line 82 for body cells. Two spellings of one rule invite divergence.
- **Suggested fix:** Use the helper in both places, or drop it.

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

---

## Coverage & gaps — please read

Two passes found **36 issues against a target of 50+**. I am reporting the number I actually verified rather than padding the list, because a QA report whose findings are speculative is worse than a short one. Pass 2 yielded fewer new findings than I predicted for an honest reason: **the adapters turned out to be genuinely well written** (see the pass-2 additions to "Verified as not defective"), so the defects concentrated in the table/page-break/RTL layer rather than in data handling.

**Covered:** `renderTemplate`, `previewTemplate`, `branding`/watermark resolution, `footer`/`header`/`reportFooter` geometry, `TemplateStudio` + `GeneralTab`, `templateEngine`, the preview/generation call graph, the page-break and RTL posture of all eight data tables, `lineItemTable` / `totals` / `taxSummary` in depth, and an adapter-wide sweep for null-safety, numeric guards and date formatting.

**Still not covered:**
- ~25 remaining section renderers read only via targeted pattern sweeps, not line by line — `reportSections`, `reportSummary`, `reportHeader`, `infoBoxes`, `caseInfo`, `devices`, `custodyLog`, `signature`, `bank`, `openCard`, `taxBar`, `netPay`, `deductions`, `earnings`, the label renderers.
- Per-adapter deep reads (14 files) — the sweep covered null-safety/format patterns, not each adapter's document-specific mapping logic.
- `HeaderFooterTab`, `TransactionTab`, `TableTab`, `TotalTab`, `OtherDetailsTab` (~1,100 lines of controls) — pass 1 only covered `GeneralTab`.
- `profileResolver`, `registry`, `rtl`, `palette`, `fonts`/`fontLoader`, `brandingImage`, `qrImage`, `contentHash`.
- `documentTemplatesService` / `templateContextService` CRUD, RLS and tenant-scoping.

**Cannot be done in this environment (needs a human or a live session):** unchanged from pass 1 — screenshots/recordings, visual preview-vs-PDF diffing, cross-viewer (Acrobat / Preview / Chrome / pdf.js), cross-browser/OS, and true large-dataset page-break testing. TBL-01 through TBL-09 in particular are *predicted from the code*; each needs a real multi-page render to confirm severity.

**Cannot be done in this environment (needs a human or a live session):**
- Screenshots / screen recordings.
- Visual diffing of preview vs generated PDF, and rendering across Acrobat / Preview / Chrome PDF / Firefox pdf.js.
- Cross-browser and cross-OS behaviour.
- True large-dataset and multi-page page-break testing against production data.

## Fix status

| Finding | Status |
|---|---|
| **PDF-01** preview/download engine split | ✅ Fixed — shared `selectRenderEngine()` |
| **RND-01** watermark image renders nothing | ✅ Fixed — page `background` + Studio control |
| **BIND-01** silent placeholder failures | ✅ Fixed — validation + confirm in `NotificationTemplatesTab` |
| **TBL-01** rows split across pages | ✅ Fixed — `dontBreakRows` on all 8 data tables |
| **TBL-03** tax summary RTL-blind | ✅ Fixed — column + alignment mirroring |
| **TBL-04** totals RTL-blind | ✅ Fixed (geometry); in-cell alignment intentionally unchanged |
| **STU-01** margin bounds | ✅ Fixed — UI `max` + `clampPageMargins` backstop (finding corrected) |
| **STU-02** Reset has no confirmation | ✅ Fixed — `useConfirm` danger dialog |
| **STU-03** no unsaved-changes guard | ✅ Fixed — dirty tracking + confirm on back + `beforeunload` |
| **RND-02** hardcoded `x2: 525` dividers | ✅ Fixed — `pageGeometry` helpers across all 4 engine sites |
| **RND-07** custom dimensions unvalidated | ✅ Partly fixed — `resolvePageBox` degrades a zero/negative box to A4 |

**Remaining, in recommended order:**

1. **TBL-05/06/07** (S/N column side under RTL, empty line-item table, column-width overflow).
2. **RND-03/04/05** (footer + page-number geometry: hardcoded 35pt footer inset and `[40,4,40,0]` number-line margins still ignore the configured paper margins; the page number also ignores the colour palette). `pageGeometry` now provides the primitives these need.
3. **RND-06** (watermark colour not configurable), **RND-08** (A3/A5/Legal unsupported), **TBL-02** (no `pageBreak` control), **TBL-08/09/10** (row caps, long-token overflow, localized `N/A`).
4. **STU-04** partially addressed by the RND-01 fix (the sub-controls no longer hide behind a non-empty `text`); a dedicated watermark-image *upload* remains unimplemented — today the fix reuses the company logo.

### Note on verification limits for the table fixes

`dontBreakRows` and the RTL mirroring are asserted at the **document-definition** level (the structure handed to pdfmake), which is what these tests can reach. The *visual* result — that a tall row now moves whole to the next page, and that a mirrored Arabic totals block looks right — still needs a real multi-page render to confirm. The compliance-matrix snapshots for the OM/SA RTL invoices were reviewed before updating: the only changes are the added `dontBreakRows` flags and the totals cells swapping slots with identical values, i.e. a pure reordering with no data change.

I can take any of these as an implementation task, or continue auditing the remaining surface listed above.
