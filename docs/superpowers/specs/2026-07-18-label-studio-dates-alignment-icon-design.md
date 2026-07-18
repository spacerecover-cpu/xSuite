# Label Studio: Date Fields, Identifier Alignment & Label Icon — Design

**Date**: 2026-07-18 · **Status**: Approved (user approved both phases; icon = separate favicon-style upload)

## Problem

Tenants want more control over the thermal label design in Label Studio:

1. **Date stamp** on inventory labels — both the *date added to inventory* and a *printed date/time* stamp.
2. **Identifier alignment** — align the inventory code (e.g. `INV-00013`) left / center / right.
3. **A small brand icon** — upload a favicon-style icon and place it on the label.

"Show only the inventory number" already works today (turn Spec, Location and QR off), so it needs no change.

The compact label engine (`src/lib/pdf/labels/`) is shared by case / stock / inventory labels and renders each label as a pdfmake PDF page sized exactly to the physical stock. Its content today is: the identifier (always), an optional QR and Code128, a title, up to a few meta lines, and a footer — all in pure black (1-bit thermal). There is no alignment control and no image/logo support.

## Scope (two phases, one plan)

- **Phase 1 (no storage):** inventory date fields + per-entity identifier alignment.
- **Phase 2:** a separate favicon-style label icon (upload → 1-bit → data URL) with per-entity show toggle + corner placement.

Both are tenant-level design (persisted in `company_settings.metadata.label_printing`), unlike the per-workstation QZ printer prefs. **No DB migration, no `database.types.ts` change.**

---

## Phase 1A — Inventory date fields

Two new optional content fields on the inventory label, **both default OFF** (existing tenants unchanged):

- **`added`** — "Date added": the item's `created_at`, date-only via `formatDate` (`18/07/2026`). Stable across reprints.
- **`printed`** — "Printed date/time": stamped when the label is generated, date + time via `formatDateTime` (`18/07/2026 14:32`), workstation local time.

**Rendering.** Appended to the inventory `lines` in priority order `spec → location → added → printed`. On a 26×15 mm strip only the first ~2 lines fit (unchanged truncation behavior), so "number + printed stamp" = enable only Printed → `INV-00013` + `18/07/2026 14:32`.

**Purity.** The mapper `inventoryLabelContent` stays synchronous and pure. The print time is **passed in** — `inventoryLabelContent(item, fields, opts?: { printedAt?: Date })` — never read via `new Date()` inside the mapper. `printInventoryLabels` computes `const printedAt = new Date()` once and passes it; the Studio preview passes a fixed sample date, so preview and unit tests are deterministic.

**Data.** `InventoryItemWithDetails` gains `created_at?: string | null`. The label fetch (`getInventoryItemById`) and list rows already carry `created_at`; if the detail `select` omits it, add it.

The Studio Fields checkboxes render from `LABEL_FIELDS.inventory`, so adding these two entries auto-adds their checkboxes — **no Studio layout change** for Phase 1A.

---

## Phase 1B — Identifier alignment (all entities)

New per-entity setting **`idAlign: 'left' | 'center' | 'right'`**, default `'left'` (current behavior).

- Threaded from `LabelEntityConfig` → `buildCompactLabelDocument(..., opts)` → the `idRow` node in each layout class (strip / square / card): the identifier `ContentText` gets `alignment: idAlign`. (Square already center-aligns by default; `idAlign` becomes the explicit source.)
- Studio: a small **segmented control** — "Alignment: Left · Center · Right" — in the editor, bound to `cfg.idAlign`.
- Applies to whichever entity is being edited (per-entity map), so inventory can center while case stays left.

---

## Phase 2 — Label icon (upload + placement)

### Upload → 1-bit → data URL

- Studio gains an **Icon** section: a file input accepting PNG / JPG / SVG.
- On selection, the browser converts it in a new helper `labelIcon.ts`:
  1. Load the file into an `Image` (via a FileReader data URL).
  2. Draw to a `<canvas>` scaled so the longest side ≤ `MAX_ICON_PX` (96), preserving aspect ratio.
  3. **Threshold to 1-bit**: composite each pixel over white, compute luminance; pixels darker than `ICON_THRESHOLD` (0.5) → opaque black, lighter → **transparent** (so the mark overlays the label cleanly with no white box).
  4. Export `canvas.toDataURL('image/png')`.
- The threshold step is extracted as a **pure function** `thresholdIconPixels(data: Uint8ClampedArray, threshold: number): void` (mutates RGBA in place) so it is unit-testable without a real canvas; the file/canvas plumbing is a thin async wrapper.
- **Rationale (baked-in decision 1 & 3):** a 203 dpi thermal head is 1-bit, so a color/gradient logo prints as a grey smudge. Thresholding at upload guarantees a crisp mark and lets the tenant approve the *actual thermal result* in the live preview. Favicon-style simple marks survive; detailed/photographic logos won't — by design.
- **Storage (baked-in decision 1):** the resulting compact mono PNG data URL is stored **tenant-level** at `label_printing.icon` (a single field, not a per-entity map). A favicon-sized mono PNG is ~1–3 KB. `normalizeLabelPrintingPrefs` validates it is a `data:image/…;base64,` string and **rejects anything over `MAX_ICON_DATAURL_BYTES` (65536)** → falls back to no icon, so a runaway blob can never bloat `company_settings`. Chosen over Supabase Storage because the label engine already embeds QR/barcode as data URLs — no render-time network fetch (fast print), mono conversion baked in, and everything stays in the one settings bucket.

### Show + placement (per entity)

- **`showIcon: boolean`** (default `false`) — per-entity toggle; disabled in the UI until an icon is uploaded.
- **`iconPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`** (default `'top-right'`) — per-entity corner picker.
- **Rendering (baked-in decision 2):** the engine stamps the icon at the chosen corner via pdfmake **`absolutePosition`** at a fixed footprint `ICON_MM` (5 mm, clamped so it fits inside the label margins on tiny stock), so it does not disturb the QR/text flow layout. The node is added to **every** page (each label / copy). The live preview shows exactly where it lands, so the tenant can pick a corner that avoids the QR.

---

## Config model — `company_settings.metadata.label_printing`

`labelPrefsService.ts`:

```ts
type IdAlign = 'left' | 'center' | 'right';
type IconPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface LabelPrintingPrefs {
  sizes: Record<LabelEntity, string>;
  autoPrint: Record<LabelEntity, boolean>;
  copies: Record<LabelEntity, number>;
  showQr: Record<LabelEntity, boolean>;
  showBarcode: Record<LabelEntity, boolean>;
  fields: Record<LabelEntity, Record<string, boolean>>;
  idAlign: Record<LabelEntity, IdAlign>;          // NEW, default 'left'
  showIcon: Record<LabelEntity, boolean>;         // NEW, default false
  iconPosition: Record<LabelEntity, IconPosition>;// NEW, default 'top-right'
  icon?: string;                                  // NEW, tenant-level mono PNG data URL
}

interface LabelEntityConfig {
  sizeId: string; autoPrint: boolean; copies: number;
  showQr: boolean; showBarcode: boolean; fields: Record<string, boolean>;
  idAlign: IdAlign;            // NEW
  showIcon: boolean;          // NEW
  iconPosition: IconPosition; // NEW
  icon?: string;              // NEW (tenant-level, copied into the projection)
}
```

- `LABEL_FIELDS.inventory` gains `{ key: 'added', label: 'Date added', default: false }` and `{ key: 'printed', label: 'Printed date/time', default: false }`.
- `buildDefaults` / `normalizeLabelPrintingPrefs` add the three per-entity maps (defaults above) and the `icon` string. `normalizeFields` already defaults absent keys to `def.default` → the two new inventory fields default OFF with zero migration.
- `labelEntityConfig(prefs, entity)` projects the three per-entity values and copies the tenant-level `icon`.
- `mergeEntityConfig` (in `LabelStudio`) writes the per-entity `idAlign`/`showIcon`/`iconPosition` **and** the tenant-level `icon` (from `cfg.icon`).

---

## Engine threading

- `buildCompactLabelDocument(labels, size, fontFamily, opts?)` — `opts: { idAlign?: IdAlign; icon?: string; iconPosition?: IconPosition }`.
  - Passes `idAlign` into `buildStrip` / `buildSquare` / `buildCard`; each sets `alignment: idAlign` on the `idRow` node.
  - If `icon` is present, appends an `iconNode(icon, size, iconPosition)` (an `absolutePosition` image) to every page's content.
  - New helper `iconNode` computes `x/y` from the corner + `labelMarginPt(size)` + clamped `ICON_MM`.
- `buildLabelBlobUrl` / `buildLabelBase64` gain the same `opts` param and forward it (so the Studio preview == print).
- `buildAndEmit(labels, size, fontFamily, output, filename, opts?)` forwards `opts` to the builder. Each print function derives `opts` from the resolved config: `{ idAlign: cfg.idAlign, icon: cfg.showIcon ? cfg.icon : undefined, iconPosition: cfg.iconPosition }`.
- `printInventoryLabels` additionally computes `const printedAt = new Date()` and passes it into `inventoryLabelContent(item, cfg.fields, { printedAt })`.
- `labelPreview.ts`: `SAMPLE_INVENTORY.created_at` gets a fixed value; `sampleLabelImages` passes a fixed `printedAt` and forwards `idAlign` + (icon when `showIcon`) + `iconPosition` into `buildLabelBlobUrl` / `buildLabelBase64`.

### Follow-up refinement — vertical centering of sparse labels

Horizontal `idAlign` alone left a sparse label (e.g. identifier only, QR + fields
off) hugging the top of the stock with blank space below. The `strip` and `card`
layouts now vertically center their content when nothing anchors the height:
each computes the used content height and adds a top margin of
`max(0, (available − used) / 2)`. It self-corrects (a full label ⇒ `~0` pad, no
overflow risk since `top + content < available`) and is gated off when a barcode
occupies the bottom band. `square` already centers, so it is untouched.

---

## Files

| File | Change |
|---|---|
| `src/lib/labelPrefsService.ts` | date field defs; `IdAlign`/`IconPosition` types; three per-entity maps + `icon`; defaults + normalization (+ icon size/shape guard); `labelEntityConfig` + `mergeEntityConfig` projection |
| `src/lib/inventory/inventoryLabelTypes.ts` | `created_at?: string \| null` |
| `src/lib/pdf/labels/labelContent.ts` | inventory `added`/`printed` lines via `opts.printedAt` |
| `src/lib/pdf/labels/labelIcon.ts` (**new**) | `thresholdIconPixels` (pure) + `fileToLabelIconDataUrl` (canvas wrapper) + `MAX_ICON_PX`/`ICON_THRESHOLD`/`MAX_ICON_DATAURL_BYTES` |
| `src/lib/pdf/labels/compactLabelDocument.ts` | `idAlign` on `idRow`; `iconNode` absolute-position image; `opts` param |
| `src/lib/pdf/labels/labelPrintService.ts` | `buildLabelBase64`/`buildLabelBlobUrl`/`buildAndEmit` `opts`; `printedAt`; per-entity opts derivation |
| `src/lib/pdf/labels/labelPreview.ts` | sample `created_at` + fixed `printedAt`; forward align/icon opts |
| `src/components/settings/labels/LabelStudio.tsx` | alignment segmented control; Icon section (upload / mono preview / remove / show toggle / corner picker); wire into `cfg` + save |

---

## Testing (TDD)

- `labelPrefsService.test.ts`: new per-entity defaults (`idAlign='left'`, `showIcon=false`, `iconPosition='top-right'`); the two inventory fields default OFF and survive normalization; `icon` accepted when a valid small data URL, rejected when oversized/not a data URL; `labelEntityConfig` projects the new fields + `icon`.
- `labelContent.test.ts`: inventory `added`/`printed` lines — on / off / both / neither (deterministic via injected `created_at` + `printedAt`); priority order `spec → location → added → printed`.
- `labelIcon.test.ts`: `thresholdIconPixels` turns a synthetic RGBA buffer into opaque-black / transparent by luminance vs threshold, and handles alpha (transparent source → transparent out).
- `compactLabelDocument.test.ts`: `idRow` carries `alignment` from `idAlign`; `iconNode` present with `absolutePosition` and the right corner when `icon` passed, absent otherwise.
- `LabelStudio.test.tsx`: alignment control updates `cfg.idAlign`; icon upload calls `fileToLabelIconDataUrl` (mocked) and shows the preview; Remove clears `icon`; show toggle + corner picker disabled with no icon.
- Render-verify the Studio preview for: dates on/off, each alignment, icon in each corner.

## Boundaries

- **In:** Phase 1A (inventory dates), Phase 1B (alignment, all entities), Phase 2 (icon upload + placement, all entities; icon tenant-wide), tests.
- **Out:** case/stock date fields (case already has its own `date`; stock can be added later); Supabase-Storage icon hosting; any change to the strip/square/card *text* layout beyond alignment; the already-working "identifier only" behavior.
- **Unchanged:** QR/Code128, sizes, copies, auto-print, the QZ transport, `download`/`open` outputs, `database.types.ts`.

## Verification (gate)

- `npm run typecheck` → 0 errors.
- New + existing label suites green; full `npx vitest run` → no new failures.
- `eslint` clean on touched files.
- Manual: in Label Studio (inventory) toggle the two date fields, switch alignment, upload a favicon, toggle show + each corner — the live preview reflects each; a printed/auto-printed label matches the preview.
