# Thermal Labels in the Document Studio — Design

**Date**: 2026-07-07 · **Status**: Approved (user chose "Bring thermal into Studio")

## Problem

Two disconnected label systems: the Document Studio edited legacy `case_label`
/ `stock_label` documents on A4/Letter (mostly orphaned — the stock one never
printed; the case one only fed the case-detail "Print Label" button), while the
compact thermal engine (`src/lib/pdf/labels/`, the real print path) was
configured only in Settings → Preferences → "Device label printing", with no
Inventory presence in the Studio. Users saw A4/Letter and no Inventory label,
and the case "Print Label" button printed A4 while case auto-print printed
thermal.

## Approach (chosen): a dedicated LabelStudio inside the Studio

Thermal labels are tiny stickers, not rich documents, so they don't fit the
6-tab config-engine TemplateStudio. The three label cards (Case, Stock,
**Inventory** — new) live in a new **Labels** category and open a purpose-built
**LabelStudio** whose live preview IS the compact thermal engine.

## Components

1. **Config** (`labelPrefsService.ts`, no schema change): extend
   `company_settings.metadata.label_printing` from `{ sizes, autoPrint }` to
   add parallel per-entity maps `copies`, `showQr`, `showBarcode`, `fields`.
   `normalizeLabelPrintingPrefs` migrates legacy metadata forward (existing
   maps preserved, new maps default in). `LABEL_FIELDS` is the single source of
   truth for per-entity togglable fields (case: serial/device/customer/date/
   footer; stock: category/brand/price/location/footer; inventory: spec/
   location). `labelEntityConfig(prefs, entity)` projects one entity.

2. **Engine threading**: the mappers (`labelContent.ts`) take a `fields` map
   ("show unless explicitly false"); `resolveLabelImages` gates QR/barcode on
   `showQr`/`showBarcode`; `resolveLabelConfig` in the print service resolves
   the effective design (tenant pref or an explicit `config` override) with
   per-call `sizeId`/`copies` overrides. Preview == print (same path).

3. **Preview** (`labelPreview.ts`): `previewLabelBlob(entity, config)` renders
   one representative label from sample data through the exact print path,
   returning a blob URL for the editor iframe.

4. **Grid** (`documentTypeMeta.ts`): new `labels` category; `case_label` /
   `stock_label` removed from `DOCUMENT_TYPES` (they no longer open the config
   engine); `LABEL_CARDS` (case/stock/inventory) drives the Labels category.

5. **LabelStudio** (`components/settings/documents/LabelStudio.tsx`): stock-size
   picker (13 presets grouped by class), QR/barcode toggles (barcode disabled on
   narrow stock), copies, auto-print, per-entity field checkboxes, and a
   debounced live preview. Saves to `label_printing` (shared query cache with
   Preferences, so both stay in sync).

6. **Page wiring** (`DocumentTemplatesPage.tsx`): the Labels category renders
   `LABEL_CARDS`; "Design" opens `<LabelStudio>`.

7. **Consistency fix** (`CaseDetail.tsx`): the case "Print Label" button now
   calls `printCaseLabels(id, { output: 'print' })` (thermal), matching auto-
   print — replacing the legacy A4 `case_label` preview.

## Boundaries

- No DB migration; reuses the `label_printing` metadata bucket and the compact
  engine.
- The legacy config-engine `case_label`/`stock_label` adapters/sections + the
  `pdfService` case_label path stay in the tree (parity tests untouched) but are
  no longer a Studio-editable surface or the case print path.
- Preferences → "Device label printing" stays as the quick size/auto-print view
  over the same store.

## Testing

- `labelPrefsService.test`: legacy-metadata migration, copies clamp, field-key
  filtering, QR/barcode coercion, `labelEntityConfig` projection.
- `labelContent.test`: field toggles per entity (hide serial/customer/date/
  price/category; serial-less fallback).
- `documentTypeMeta.test`: labels excluded from `DOCUMENT_TYPES`; `LABEL_CARDS`
  covers case/stock/inventory.
- `DocumentTemplatesPage.test`: Labels category shows 3 cards; Design opens the
  LabelStudio.
- Render-verified previews (fields on/off, QR off, barcode) for all 3 entities.
- Full suite + tsc + lint green.
