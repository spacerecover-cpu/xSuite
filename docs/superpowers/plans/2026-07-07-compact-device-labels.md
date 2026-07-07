# Compact Device Labels + Direct Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized (~100 mm wide) case/stock/inventory label documents with true adhesive-label templates sized to industry-standard thermal label stock (15×26 mm default), and add a Direct Print Label feature that sends the label straight to the browser print dialog immediately after creating a Case, Inventory Item, or Stock Item.

**Architecture:** A new self-contained compact-label engine under `src/lib/pdf/labels/` — a size-preset registry, one adaptive pdfmake doc builder (layout classes: strip / square / card, + barcode strip on wide stock), pure content mappers per entity, and a print orchestrator that resolves QR (qrcode) / Code128 (bwip-js) images and calls pdfmake `.print()` / `.open()` / `.download()`. Tenant preferences (default size per entity + auto-print toggles) live in `company_settings.metadata.label_printing`, following the v1.2.0 `table_columns` pattern. Legacy label builders remain untouched for the Document Studio path (parity tests stay green); all interactive print surfaces switch to the compact engine.

**Tech Stack:** pdfmake 0.2.20 (custom `pageSize` in pt, `{image}` nodes), qrcode 1.5.4 (`generateQrPngDataUrl`), bwip-js 4.11.1 (`generateCode128DataUrl`), TanStack Query, Vitest (node project).

---

## Research: industry-standard label sizes (verified 2026-07-07)

| Preset id | Printed size (W×H mm) | Stock | Class |
|---|---|---|---|
| `nb_15x26` | 26×15 | Niimbot D11/D110 15×26 (tenant's current stock) — **DEFAULT** | strip |
| `nb_12x40` | 40×12 | Niimbot D11 12×40 | strip |
| `dymo_30333` | 25×13 | Dymo 30333 ½″×1″ | strip |
| `nb_30x20` | 30×20 | Niimbot B21 30×20 | card |
| `sq_25` | 25×25 | 1″×1″ square (Zebra/generic) | square |
| `zebra_2x1` | 51×25 | 2″×1″ (Zebra/generic asset tag) | card+barcode |
| `dymo_30336` | 54×25 | Dymo 30336 1″×2⅛″ multipurpose | card+barcode |
| `nb_40x30` | 40×30 | Niimbot B1/B21 40×30 | card |
| `nb_50x30` | 50×30 | 50×30 (Niimbot B1 / Phomemo) | card+barcode |
| `zebra_225x125` | 57×32 | 2¼″×1¼″ (Zebra) | card+barcode |
| `brother_dk11209` | 62×29 | Brother DK-11209 small address | card+barcode |
| `dymo_30252` | 89×28 | Dymo 30252 address | card+barcode |
| `brother_dk11201` | 90×29 | Brother DK-11201 standard address | card+barcode |

Rules: `strip` = height ≤ 17 mm (QR left, text right, auto-shrink ID); `square` = aspect < 1.4 & height ≥ 20 (QR top-center, ID under); `card` = everything else (QR left column, ID + meta right); Code128 strip appended when width ≥ 50 mm AND height ≥ 25 mm and a barcode value exists. Monochrome black-on-white only (direct-thermal printers are 1-bit; brand colors dither and blur). Margins 1.5 mm (≤ 30 mm wide stock) / 2 mm (larger) — thermal printers have ~1 mm unprintable edge.

Direct print: browsers cannot silently print; `pdfMake.createPdf(...).print()` renders to a hidden iframe and immediately opens the print dialog with the label loaded — one keypress from the printer, no PDF tab, no download. (True zero-click needs Chrome `--kiosk-printing`; noted in settings helper text.)

Chain-of-custody fit: a case with N devices prints N labels — each carries case number, device index `i/N`, serial, and QR of the case number — devices are tracked individually per CLAUDE.md stage 3/4.

---

### Task 1: Size registry — `src/lib/pdf/labels/labelSizes.ts` (+ test)

**Files:** Create `src/lib/pdf/labels/labelSizes.ts`, `src/lib/pdf/labels/labelSizes.test.ts`

- [ ] Write failing test: presets have unique ids; `nb_15x26` exists with `widthMm 26 / heightMm 15`; `DEFAULT_LABEL_SIZE_ID` resolves; `getLabelSize('bogus')` returns default; `mmToPt(26)` ≈ 73.7; every preset has positive dims and non-empty `name`/`printers`; `sizeClass()` returns `strip` for `nb_15x26`, `square` for `sq_25`, `card` for `nb_40x30`; `supportsBarcode()` true only for width ≥ 50 & height ≥ 25.
- [ ] Implement: `interface LabelSizePreset { id; name; printers; widthMm; heightMm }`, `LABEL_SIZE_PRESETS` (table above), `DEFAULT_LABEL_SIZE_ID = 'nb_15x26'`, `mmToPt(mm) = mm * 72 / 25.4`, `getLabelSize(id?)`, `sizeClass(p): 'strip'|'square'|'card'`, `supportsBarcode(p)`, `labelMarginPt(p)`.
- [ ] `npx vitest run src/lib/pdf/labels/labelSizes.test.ts` → PASS. Commit.

### Task 2: Adaptive builder — `src/lib/pdf/labels/compactLabelDocument.ts` (+ test)

**Files:** Create `src/lib/pdf/labels/compactLabelDocument.ts`, `compactLabelDocument.test.ts`

- [ ] Content model:
```ts
export interface CompactLabelContent {
  id: string;                      // CASE-0042 / INV-00013 / STK-0005 — always rendered, dominant
  qrDataUrl?: string | null;       // pre-resolved QR PNG (payload = entity identifier)
  barcodeDataUrl?: string | null;  // pre-resolved Code128 PNG (wide stock only)
  title?: string | null;           // customer / item name
  lines?: string[];                // meta in priority order (serial, device, date…) — truncated to fit
  footer?: string | null;          // lab name
  index?: string | null;           // "2/12" on multi-device cases
}
```
- [ ] Failing tests: `pageSize` = mm→pt of preset (±0.1); N contents → N pages via `pageBreak: 'before'` on labels 1..N-1; strip class renders QR image node + bold id text; square places QR before id in the stack; card renders `columns`; barcode image only when `supportsBarcode(size)` AND `barcodeDataUrl`; long id (>14 chars) gets smaller `fontSize` than short id on the same preset (`fitFontSize` exported and unit-tested); line budget: strip ≤ 2 lines, card ≤ 4; all text colors are `#000000`.
- [ ] Implement `buildCompactLabelDocument(labels, size, fontFamily='Roboto')` — pure, synchronous, no imports from styles.ts (labels are monochrome, not PDF_COLORS-branded). Layout per class; `fitFontSize(text, maxWidthPt, basePt, minPt)` approximates Helvetica-ish 0.55·fontSize char width.
- [ ] Run test → PASS. Commit.

### Task 3: Content mappers — `src/lib/pdf/labels/labelContent.ts` (+ test)

**Files:** Create `src/lib/pdf/labels/labelContent.ts`, `labelContent.test.ts`

- [ ] Failing tests:
  - `caseLabelContents(receiptData)`: 3 devices → 3 labels, `index` "1/3"…"3/3", each `lines` leads with serial (`SN …`) then `brand model` then received date; 0 devices → 1 label without index; id = `case_number ?? case_no`; `title` = customer name fallback contact_name; qrPayload = id.
  - `stockLabelContent(item, {showPrice, locationName})`: id = sku fallback name; title = item name; price line only when showPrice && selling_price; barcodeValue = barcode ?? sku.
  - `inventoryLabelContent(item)`: id = item_number fallback name; qrPayload prefers `qr_value`; lines include model/brand/type/capacity/location when present.
  - Every mapper returns `qrPayload`/`barcodeValue` as raw strings (image resolution happens in the service).
- [ ] Implement (mappers return `{ content: Omit<CompactLabelContent,'qrDataUrl'|'barcodeDataUrl'>, qrPayload, barcodeValue }[]`).
- [ ] Run test → PASS. Commit.

### Task 4: Tenant prefs — `src/lib/labelPrefsService.ts` (+ test) + queryKeys

**Files:** Create `src/lib/labelPrefsService.ts`, `src/lib/labelPrefsService.test.ts`; Modify `src/lib/queryKeys.ts` (add `settingsKeys.labelPrinting()`)

- [ ] Shape in `company_settings.metadata.label_printing`:
```ts
export interface LabelPrintingPrefs {
  sizes: { case: string; stock: string; inventory: string };   // preset ids
  autoPrint: { case: boolean; stock: boolean; inventory: boolean };
}
```
- [ ] Failing tests for `normalizeLabelPrintingPrefs(value)`: undefined/garbage → defaults (all sizes `nb_15x26`, all autoPrint false); unknown size id → default id; partial objects merge; non-boolean autoPrint → false.
- [ ] Implement normalize + `getLabelPrintingPrefs()` / `setLabelPrintingPrefs(next)` following `tablePrefsService.ts` (getOrCreateCompanySettings → metadata merge → updateCompanySettings → invalidateCompanySettingsCache).
- [ ] Run test → PASS. Commit.

### Task 5: Print orchestrator — `src/lib/pdf/labels/labelPrintService.ts`

**Files:** Create `src/lib/pdf/labels/labelPrintService.ts`

- [ ] `type LabelOutput = 'print' | 'open' | 'download'` and three entry points, all dynamic-importing pdf deps (keeps pdfmake out of initial bundles, same as inventoryLabelPrint):
  - `printCaseLabels(caseId, opts?: { output?; sizeId?; copies? })` — `fetchReceiptData` → language/font init exactly like `generateCaseLabel` (secondary-language fallback) → `caseLabelContents` → resolve QR per label via `generateQrPngDataUrl`, barcode via `generateCode128DataUrl` when size supports → build → emit. Returns `{ success, error? }` like pdfService functions.
  - `printStockLabelBatch(items, opts?: { output?; sizeId?; copies?; showPrice?; locationName?; companyName? })` — ONE document, `items × copies` pages.
  - `printInventoryLabelCompact(items, opts?)` — accepts `InventoryItemWithDetails[]`.
  - Size resolution: explicit `sizeId` arg → else `getLabelPrintingPrefs().sizes[entity]` → default. Emit: `pdf.print()` / `.open()` / `.download(filename)`.
- [ ] Typecheck. Commit.

### Task 6: Surface rewiring (manual print flows)

**Files:** Modify `src/components/stock/PrintLabelsModal.tsx`, `src/lib/inventory/inventoryLabelPrint.ts`, `src/pages/print/PrintLabelPage.tsx`

- [ ] PrintLabelsModal: add label-size `<select>` (presets, initialized from tenant pref), swap build loop for one `printStockLabelBatch(items, {...config, sizeId, output})`; buttons: Print (direct, `output:'print'`), Download. Legacy engine branch removed from the modal (the studio `stock_label` document stays reachable from Document Studio itself).
- [ ] inventoryLabelPrint: keep public API (`printInventoryLabel(item)`, `downloadInventoryLabel(item)`), internals delegate to `printInventoryLabelCompact([item], { output })`.
- [ ] PrintLabelPage: swap `generateCaseLabel(caseId, false)` → `printCaseLabels(caseId, { output: 'open' })`; Download button → `output:'download'`.
- [ ] Typecheck + existing tests (`npm test`) still green — parity tests untouched. Commit.

### Task 7: Direct Print after create

**Files:** Modify `src/components/cases/CreateCaseWizard.tsx`, `src/components/inventory/InventoryItemWizard.tsx`, `src/components/stock/StockItemFormModal.tsx`

- [ ] CreateCaseWizard: in `createCaseMutation.onSuccess`, after `setShowSuccessModal(true)`, fire-and-forget `autoPrintLabelIfEnabled('case', () => printCaseLabels(newCase.id, { output: 'print' }))`; rewire the success-modal `onPrintLabel` from `printLabel()` (new-tab page) to direct `printCaseLabels(caseId, { output: 'print' })`.
- [ ] InventoryItemWizard: after successful create (`created` row in scope), same guard → `printInventoryLabelCompact([created], { output: 'print' })`.
- [ ] StockItemFormModal: capture `const created = await createStockItem(payload)` → guard → `printStockLabelBatch([created], { output: 'print' })`.
- [ ] Auto-print guard helper lives in labelPrefsService: `shouldAutoPrint(entity): Promise<boolean>`; failures are toast-silent (label printing must never block intake).
- [ ] Typecheck. Commit.

### Task 8: Settings UI — Label printing section

**Files:** Modify `src/pages/settings/PreferencesSettings.tsx`

- [ ] New "Label printing" card following the existing Rows-per-page card pattern (useQuery on `settingsKeys.labelPrinting()`, optimistic set, toast): three size selects (Case / Inventory / Stock) listing presets as "26 × 15 mm — Niimbot D11/D110"; three auto-print toggles ("Print label automatically when a case is created", etc.); helper text about the browser print dialog + kiosk-printing for zero-click.
- [ ] Typecheck. Commit.

### Task 9: Verification & push

- [ ] `npm run typecheck` → 0 errors (CI gate).
- [ ] `npm test` → all green (including untouched parity tests).
- [ ] `npm run lint` → clean.
- [ ] `npm run build` → succeeds.
- [ ] Push branch `claude/pdf-template-design-upgrade-i2pz1o`.

## Self-review notes

- Spec coverage: 15×26 default ✓, other standard sizes ✓ (13 presets), compact readable templates ✓ (3 layout classes, monochrome, auto-fit), Case ID/QR/customer/device/serial ✓ (mappers), thermal-friendly ✓ (exact page = label size, 1-bit palette, margins), direct print after create for all three entities ✓ (Task 7), no separate PDF/print-dialog workflow ✓ (`.print()` direct).
- Legacy `CaseLabelDocument`/`StockLabelDocument`/engine and their parity tests intentionally untouched (Document Studio path).
- Types used consistently: `CompactLabelContent`, `LabelSizePreset`, `LabelPrintingPrefs` defined once, imported everywhere.
