# xSuite — Typst PDF Engine Migration (design)

> **Status:** proposed · **Date:** 2026-06-28 · supersedes the pdfmake-based render path for multilingual output.
> Decision is evidence-backed: a CLI bake-off + a `typst.ts` POC (below) proved Typst renders Arabic (RTL), Thai, and Korean correctly and produces byte-reproducible PDFs. pdfmake cannot (no shaping/bidi engine).

## 1. Problem & decision

pdfmake (pdfkit/fontkit) has **no Unicode bidi algorithm and incomplete complex-text shaping**. Across multiple rounds, every Arabic workaround (word-reversal, then `arabic-reshaper`+`bidi-js` pre-processing) either fixed one case and broke another (the colon in `المجموع الفرعي:`) or made it worse (fontkit re-processed pre-shaped glyphs → garbled). Korean and Thai (also complex scripts) hit the same wall and currently have no fonts at all. The 13-language requirement (`en ar pl ru fr de it es tr ko th pt uk cs`, with Arabic legally-binding for KSA/GCC ZATCA invoices) makes pdfmake structurally unsuitable.

**Decision: replace the renderer with Typst.** Typst uses rustybuzz (a HarfBuzz port) + a real Unicode bidi pass. It is open-source (MIT/Apache), actively developed, fast, reproducible-by-design, and has a real templating language with native paged-media (page headers/footers, counters, custom page sizes).

### Evidence (this session)
- **CLI bake-off** (`scratchpad/bakeoff.typ` → PNG, visually verified): multi-word Arabic headers, colon-bearing totals, mixed Arabic+Latin+digits, full RTL paragraphs, and bilingual EN|AR all render correctly. Thai mark-stacking + Thai digits and Korean syllables also render correctly with Noto fonts.
- **`typst.ts` POC** (`scratchpad/typst-poc/poc.js`, node-compiler 0.7.0): renders the same fixture to a valid PDF with the repo's fonts in **8ms cold / 1ms warm**, and is **byte-reproducible** (same input → same sha256). Client WASM bundle: 27 MB raw / **10.4 MB gzipped**.

## 2. Deployment options (pick at Phase 0)

Both keep Typst; neither needs Chromium, a container, or a 3rd-party API (no forensic-data egress).

| | **A. Client-side WASM (`@myriaddreamin/typst.ts`)** | **B. Supabase Edge Function (Deno runs the WASM)** |
|---|---|---|
| Architecture change | **None** — render/hash/upload/email stay client-side, exactly like pdfmake today | Minimal — only the *render call* moves to an Edge Function that returns PDF bytes; hash/upload/email stay client-side |
| Client bundle | +10.4 MB gzip, **lazy-loaded + cached** (only when generating/previewing a PDF) | none |
| Infra/ops | none | a stateless Edge Function (managed/scalable by Supabase; no container, no SPOF, no CVE treadmill) |
| Privacy | nothing leaves the browser | bytes round-trip through your own Supabase project |
| Offline | works | needs network |

**Recommendation: start with A (client-side).** It's a true renderer swap with zero topology change, and 10.4 MB lazy/cached is acceptable for desktop lab staff (the only users who *generate* documents; portal customers view already-archived PDFs and never load the WASM). Keep **B as a documented pivot** if the bundle proves heavy for any surface — the POC confirms the same WASM runs in Deno, so the pivot is cheap and Chromium-free.

## 3. Architecture — the engine seam

The current engine is already well-factored. The renderer is swappable at one seam: `EngineDocData` (fully renderer-agnostic, every cell pre-stringified).

```
data fetch → adapter → EngineDocData → [renderTemplate: pdfmake doc-def]  → createPdfWithFonts → Blob → hash → upload → email
                                       └ REPLACE WITH ────────────────────┐
                                         [assembleTypst: EngineDocData → Typst markup string] → typst.ts compile → PDF bytes → (same Blob → hash → upload → email)
```

### Survives unchanged (verified)
- `EngineDocData` + the per-type **adapters** (`engine/adapters/*`) — they pre-stringify every value.
- `templateConfig.ts` (`DocumentTemplateConfig`, cascade/resolve), the **binding/data** layer, `dataFetcher`.
- **Provability/delivery:** `contentHash.ts` (Blob-only sha256), `documentInstanceService.attachArtifact`, Storage paths, `emailDocumentService` + the `send-document-email` Edge Function. They only need PDF bytes.
- The translation/i18n layer (`documentTranslations.ts`, `secondaryText`, `LabelText`) — labels are still resolved the same way; only the *rendering* changes (Typst does the shaping/bidi, so `reverseArabicText`/`rtl.ts` mirroring hacks are **deleted**).

### Rebuilt
- `engine/renderTemplate.ts` → a Typst-markup **assembler** (`EngineDocData` → `.typ` string).
- The ~33 `engine/sections/*` renderers → Typst markup fragments (a Typst function library / template).
- `styles.ts` pdfmake builders → a Typst style module (page setup, the bilingual band header, info boxes, tables, totals, terms box, signature block, footer) using the design tokens.
- Fonts: load Tajawal + Noto Sans Arabic (in repo) + **add Noto Sans Thai + Noto Sans KR** into Typst's font set (replacing the pdfmake VFS path in `fonts.ts`).
- Preview: `previewTemplate.ts` / `previewRecord.ts` render Typst → PDF bytes → iframe. **Preview == output** (same engine) — a genuine win, and required for chain-of-custody approval.
- Tests: the pdfmake-shaped `*Parity.test.ts` + `__goldens__` snapshots are retired and re-baselined against Typst output + a **sha256-stability test per type**.

## 4. Migration plan (incremental, reversible)

> Honest scope (learned from the architecture red-team): this is a **renderer + template-format** replacement, ~6–10 person-weeks, de-risked because there is **no server to stand up** (option A). If option B is chosen, add a thin Edge Function workstream.

- **Phase 0 — Integrate `typst.ts` in the app + flag (1 wk).** Add `@myriaddreamin/typst.ts`, lazy-load the WASM, load the 4+ fonts, render one fixture to a Blob in the real app (measure cold-load + render on target hardware). Decide A vs B from real numbers. Add a **per-tenant runtime** engine flag (the existing `VITE_PDF_ENGINE_*` is build-time/all-tenants — insufficient for safe rollout); render via Typst behind it, pdfmake stays default.
- **Phase 1 — Typst template library + 13-language font matrix (1–1.5 wk).** Build the Typst style module + section functions; render the full 13-language + bilingual AR/EN matrix; gate: zero tofu, correct bidi/shaping/marks.
- **Phase 2 — Port document types behind the flag, lowest-risk first (3–4 wks).** `stock_label`/`case_label` → receipts → quote/invoice → payslip → report → chain_of_custody; bring `credit_note` into the engine union. One type at a time; pdfmake remains the fallback per type.
- **Phase 3 — Paged media + assets (1 wk).** Repeating footer + page numbers (Typst native), watermark, multi-page table headers, suppress-letterhead-on-page-2, custom label page sizes; logo/stamp/signature as images; **ZATCA QR**: preserve exact TLV bytes, embed as image — scan-test KSA invoices before flipping the invoice flag.
- **Phase 4 — Re-baseline tests + cut preview over (1 wk).** Retire pdfmake parity/goldens; add Typst goldens + per-type sha256-stability tests; point Studio preview at the Typst path (preview == output).
- **Phase 5 — Decommission (0.5 wk).** Once all types are flipped and stable, remove the pdfmake `documents/*` builders, `rtl.ts` hacks, and the VFS font path. Keep pdfmake behind a flag only if an offline client fallback is wanted.

## 5. Risks & mitigations
- **10.4 MB client WASM (option A).** Lazy-load + long-cache; only doc-generating staff load it; pivot to option B (Edge) if any surface needs it — same WASM, cheap pivot.
- **Typst templating learning curve.** Templates become Typst markup/scripting (more expressive than pdfmake JSON, but new). Mitigate with a shared style module + per-type functions; the adapters/data don't change.
- **Per-tenant rollout.** Build a runtime flag in Phase 0; don't claim incremental rollout on the build-time flag.
- **ZATCA statutory QR.** Preserve exact TLV; scan-test before invoice cutover.
- **Reproducibility across Typst upgrades.** Record the Typst version in the document snapshot; an upgrade is a deliberate re-baseline (but determinism within a pinned version is free — no qpdf circus).
- **Coordinate with the in-flight Document Studio** (report-stack retirement) — sequence the report-type cutover with it.

## 6. Verification
- `npm run typecheck` = 0; full suite green after each phase.
- Per-type: render the 13-language matrix, visually verify (PNG/preview), assert sha256 stability across two renders.
- ZATCA QR scans; multi-page paged-media correct; preview == archived bytes.
- No forensic data leaves the trust boundary (option A: none; option B: own Supabase only).

## Appendix — POC artifacts (scratchpad, not committed)
`bakeoff.typ`/`bakeoff.png` (Arabic), `bakeoff2.typ`/`bakeoff2.png` (Thai/Korean), `typst-poc/poc.js` (node-compiler render + determinism + perf). Typst CLI 0.15.0; `typst.ts` 0.7.0.
