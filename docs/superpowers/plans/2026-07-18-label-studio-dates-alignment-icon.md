# Label Studio: Date Fields, Identifier Alignment & Label Icon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to Label Studio: inventory date fields (added + printed), a per-entity identifier alignment control, and a favicon-style label icon (upload → 1-bit → data URL) with per-entity show toggle + corner placement.

**Architecture:** All new state is tenant-level config in `company_settings.metadata.label_printing` (`labelPrefsService`) — no DB migration. The shared compact engine (`compactLabelDocument`) gains an `opts` param carrying `idAlign` + `icon` + `iconPosition`; the identifier node honors alignment and the icon is stamped per page via pdfmake `absolutePosition`. A new `labelIcon.ts` converts an uploaded image to a 1-bit PNG data URL. Preview == print (same builder).

**Tech Stack:** React 18 + TS + Vite, TanStack Query v5, pdfmake 0.2.20, vitest + @testing-library/react, Tailwind (DESIGN.md semantic tokens), lucide-react.

**Design spec:** `docs/superpowers/specs/2026-07-18-label-studio-dates-alignment-icon-design.md`

**Branch:** `claude/inventory-label-printer-v67p66` (already restarted from `origin/main`).

---

## File Structure

- **Modify** `src/lib/pdf/labels/labelSizes.ts` — export `IdAlign` + `IconPosition` types (low-level, imported by both config + engine).
- **Modify** `src/lib/labelPrefsService.ts` — date field defs; new per-entity maps (`idAlign`/`showIcon`/`iconPosition`) + tenant-level `icon`; normalization + projection.
- **Modify** `src/lib/inventory/inventoryLabelTypes.ts` — add `created_at`.
- **Modify** `src/lib/pdf/labels/labelContent.ts` — inventory `added`/`printed` lines via `opts.printedAt`.
- **Modify** `src/lib/pdf/labels/compactLabelDocument.ts` — `idAlign` on the identifier; `iconNode`; `opts` param.
- **Create** `src/lib/pdf/labels/labelIcon.ts` (+ test) — `thresholdIconPixels` (pure) + `fileToLabelIconDataUrl` (canvas).
- **Modify** `src/lib/pdf/labels/labelPrintService.ts` — thread `opts` + `printedAt`.
- **Modify** `src/lib/pdf/labels/labelPreview.ts` — sample `created_at` + fixed `printedAt` + forward `opts`.
- **Modify** `src/components/settings/labels/LabelStudio.tsx` (+ test) — alignment control + Icon section + `mergeEntityConfig`.

**No DB migration. No `database.types.ts` change.**

---

## Task 1: Config foundation — types, date fields, new maps + icon

**Files:**
- Modify: `src/lib/pdf/labels/labelSizes.ts` (append types)
- Modify: `src/lib/labelPrefsService.ts`
- Modify: `src/lib/labelPrefsService.test.ts`

- [ ] **Step 1: Add the shared types to `labelSizes.ts`**

Append to `src/lib/pdf/labels/labelSizes.ts`:

```ts
/** Identifier horizontal alignment (strip + card layouts; square stays centered). */
export type IdAlign = 'left' | 'center' | 'right';

/** Corner placement for the optional label icon. */
export type IconPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
```

- [ ] **Step 2: Write the failing tests (append to `labelPrefsService.test.ts`)**

Append inside the existing `describe('normalizeLabelPrintingPrefs', …)` block (before its closing `});`):

```ts
  it('defaults idAlign=left, showIcon=false, iconPosition=top-right for every entity', () => {
    const p = normalizeLabelPrintingPrefs(undefined);
    expect(p.idAlign).toEqual({ case: 'left', stock: 'left', inventory: 'left' });
    expect(p.showIcon).toEqual({ case: false, stock: false, inventory: false });
    expect(p.iconPosition).toEqual({ case: 'top-right', stock: 'top-right', inventory: 'top-right' });
    expect(p.icon).toBeUndefined();
  });

  it('coerces invalid idAlign / iconPosition back to their defaults and keeps valid ones', () => {
    const p = normalizeLabelPrintingPrefs({
      idAlign: { inventory: 'center', case: 'sideways' },
      iconPosition: { inventory: 'bottom-left', stock: 'nope' },
      showIcon: { inventory: true, case: 'yes' },
    });
    expect(p.idAlign.inventory).toBe('center');
    expect(p.idAlign.case).toBe('left');
    expect(p.iconPosition.inventory).toBe('bottom-left');
    expect(p.iconPosition.stock).toBe('top-right');
    expect(p.showIcon.inventory).toBe(true);
    expect(p.showIcon.case).toBe(false);
  });

  it('keeps a small valid icon data URL but rejects a non-data-URL or an oversized blob', () => {
    const ok = 'data:image/png;base64,AAAA';
    expect(normalizeLabelPrintingPrefs({ icon: ok }).icon).toBe(ok);
    expect(normalizeLabelPrintingPrefs({ icon: 'https://x/y.png' }).icon).toBeUndefined();
    expect(normalizeLabelPrintingPrefs({ icon: 'data:image/png;base64,' + 'A'.repeat(70000) }).icon).toBeUndefined();
  });

  it('the inventory date fields default OFF and survive normalization', () => {
    const p = normalizeLabelPrintingPrefs(undefined);
    expect(p.fields.inventory.added).toBe(false);
    expect(p.fields.inventory.printed).toBe(false);
    const enabled = normalizeLabelPrintingPrefs({ fields: { inventory: { added: true } } });
    expect(enabled.fields.inventory.added).toBe(true);
    expect(enabled.fields.inventory.printed).toBe(false);
  });

  it('labelEntityConfig projects idAlign / showIcon / iconPosition / icon', () => {
    const prefs = normalizeLabelPrintingPrefs({
      idAlign: { inventory: 'center' },
      showIcon: { inventory: true },
      iconPosition: { inventory: 'bottom-right' },
      icon: 'data:image/png;base64,AAAA',
    });
    const cfg = labelEntityConfig(prefs, 'inventory');
    expect(cfg.idAlign).toBe('center');
    expect(cfg.showIcon).toBe(true);
    expect(cfg.iconPosition).toBe('bottom-right');
    expect(cfg.icon).toBe('data:image/png;base64,AAAA');
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/labelPrefsService.test.ts`
Expected: FAIL — `idAlign`/`showIcon`/`iconPosition`/`icon` do not exist yet.

- [ ] **Step 4: Implement the config changes in `labelPrefsService.ts`**

Add the type import near the top (with the existing `labelSizes` import):

```ts
import { DEFAULT_LABEL_SIZE_ID, LABEL_SIZE_PRESETS } from './pdf/labels/labelSizes';
import type { IdAlign, IconPosition } from './pdf/labels/labelSizes';
```

Add the two inventory date fields to `LABEL_FIELDS.inventory`:

```ts
  inventory: [
    { key: 'spec', label: 'Spec (brand / type / capacity)', default: true },
    { key: 'location', label: 'Storage location', default: true },
    { key: 'added', label: 'Date added', default: false },
    { key: 'printed', label: 'Printed date/time', default: false },
  ],
```

Extend `LabelEntityConfig`:

```ts
export interface LabelEntityConfig {
  sizeId: string;
  autoPrint: boolean;
  copies: number;
  showQr: boolean;
  showBarcode: boolean;
  fields: Record<string, boolean>;
  idAlign: IdAlign;
  showIcon: boolean;
  iconPosition: IconPosition;
  icon?: string;
}
```

Extend `LabelPrintingPrefs`:

```ts
export interface LabelPrintingPrefs {
  sizes: Record<LabelEntity, string>;
  autoPrint: Record<LabelEntity, boolean>;
  copies: Record<LabelEntity, number>;
  showQr: Record<LabelEntity, boolean>;
  showBarcode: Record<LabelEntity, boolean>;
  fields: Record<LabelEntity, Record<string, boolean>>;
  idAlign: Record<LabelEntity, IdAlign>;
  showIcon: Record<LabelEntity, boolean>;
  iconPosition: Record<LabelEntity, IconPosition>;
  icon?: string;
}
```

Add the normalization helpers (near `normalizeSizeId`):

```ts
const ID_ALIGNS: IdAlign[] = ['left', 'center', 'right'];
const ICON_POSITIONS: IconPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const MAX_ICON_DATAURL_BYTES = 65536;

function normalizeIdAlign(value: unknown): IdAlign {
  return ID_ALIGNS.includes(value as IdAlign) ? (value as IdAlign) : 'left';
}
function normalizeIconPosition(value: unknown): IconPosition {
  return ICON_POSITIONS.includes(value as IconPosition) ? (value as IconPosition) : 'top-right';
}
function normalizeIcon(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.startsWith('data:image/') &&
    value.length <= MAX_ICON_DATAURL_BYTES
    ? value
    : undefined;
}
```

In `buildDefaults`, add the three maps and set them in the loop, then include them + `icon` in the returned object:

```ts
function buildDefaults(): LabelPrintingPrefs {
  const sizes = {} as Record<LabelEntity, string>;
  const autoPrint = {} as Record<LabelEntity, boolean>;
  const copies = {} as Record<LabelEntity, number>;
  const showQr = {} as Record<LabelEntity, boolean>;
  const showBarcode = {} as Record<LabelEntity, boolean>;
  const fields = {} as Record<LabelEntity, Record<string, boolean>>;
  const idAlign = {} as Record<LabelEntity, IdAlign>;
  const showIcon = {} as Record<LabelEntity, boolean>;
  const iconPosition = {} as Record<LabelEntity, IconPosition>;
  for (const e of ENTITIES) {
    sizes[e] = DEFAULT_LABEL_SIZE_ID;
    autoPrint[e] = false;
    copies[e] = 1;
    showQr[e] = true;
    showBarcode[e] = true;
    fields[e] = defaultLabelFields(e);
    idAlign[e] = 'left';
    showIcon[e] = false;
    iconPosition[e] = 'top-right';
  }
  return { sizes, autoPrint, copies, showQr, showBarcode, fields, idAlign, showIcon, iconPosition, icon: undefined };
}
```

In `normalizeLabelPrintingPrefs`, add the new raw fields to the destructure type, fill the three maps in the loop, and set `icon`:

```ts
  const raw = (value && typeof value === 'object' ? value : {}) as {
    sizes?: Record<string, unknown>;
    autoPrint?: Record<string, unknown>;
    copies?: Record<string, unknown>;
    showQr?: Record<string, unknown>;
    showBarcode?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    idAlign?: Record<string, unknown>;
    showIcon?: Record<string, unknown>;
    iconPosition?: Record<string, unknown>;
    icon?: unknown;
  };
```

Inside the `for (const e of ENTITIES)` loop add:

```ts
    prefs.idAlign[e] = normalizeIdAlign(raw.idAlign?.[e]);
    prefs.showIcon[e] = raw.showIcon?.[e] === true;
    prefs.iconPosition[e] = normalizeIconPosition(raw.iconPosition?.[e]);
```

After the loop, before `return prefs;`:

```ts
  prefs.icon = normalizeIcon(raw.icon);
```

Extend `labelEntityConfig`:

```ts
export function labelEntityConfig(prefs: LabelPrintingPrefs, entity: LabelEntity): LabelEntityConfig {
  return {
    sizeId: prefs.sizes[entity],
    autoPrint: prefs.autoPrint[entity],
    copies: prefs.copies[entity],
    showQr: prefs.showQr[entity],
    showBarcode: prefs.showBarcode[entity],
    fields: prefs.fields[entity],
    idAlign: prefs.idAlign[entity],
    showIcon: prefs.showIcon[entity],
    iconPosition: prefs.iconPosition[entity],
    icon: prefs.icon,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/labelPrefsService.test.ts`
Expected: PASS (existing + 5 new tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add src/lib/pdf/labels/labelSizes.ts src/lib/labelPrefsService.ts src/lib/labelPrefsService.test.ts
git commit -m "feat(labels): config for date fields, id alignment and label icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 2: Inventory date lines

**Files:**
- Modify: `src/lib/inventory/inventoryLabelTypes.ts`
- Modify: `src/lib/pdf/labels/labelContent.ts`
- Modify: `src/lib/pdf/labels/labelContent.test.ts`

- [ ] **Step 1: Add `created_at` to the inventory label type**

In `src/lib/inventory/inventoryLabelTypes.ts`, add to the interface (after `qr_value`):

```ts
  created_at?: string | null;
```

- [ ] **Step 2: Write the failing tests (append to `labelContent.test.ts`)**

Append inside the existing `describe('inventoryLabelContent', …)` block (before its closing `});`):

```ts
  it('adds the created date only when the "added" field is enabled', () => {
    const withDate = { ...item, created_at: '2026-07-01T09:00:00Z' };
    expect(inventoryLabelContent(withDate).content.lines).not.toContain('01/07/2026');
    expect(inventoryLabelContent(withDate, { spec: false, location: false, added: true }).content.lines).toContain('01/07/2026');
  });

  it('adds the printed date/time only when the "printed" field is enabled and a time is supplied', () => {
    const at = new Date('2026-07-18T14:32:00Z');
    const off = inventoryLabelContent(item, { spec: false, location: false, printed: true });
    expect(off.content.lines).toEqual([]); // enabled but no printedAt supplied → nothing
    const on = inventoryLabelContent(item, { spec: false, location: false, printed: true }, { printedAt: at });
    expect(on.content.lines?.some((l) => l.startsWith('18/07/2026'))).toBe(true);
    expect(on.content.lines?.some((l) => l.includes(':'))).toBe(true); // carries a time
  });

  it('orders lines spec → location → added → printed', () => {
    const at = new Date('2026-07-18T14:32:00Z');
    const mapped = inventoryLabelContent(
      { ...item, created_at: '2026-07-01T09:00:00Z' },
      { spec: true, location: true, added: true, printed: true },
      { printedAt: at },
    );
    const lines = mapped.content.lines ?? [];
    expect(lines[0]).toBe('WD · HDD · 1 TB');
    expect(lines[1]).toBe('Bin D-12');
    expect(lines[2]).toBe('01/07/2026');
    expect(lines[3]?.startsWith('18/07/2026')).toBe(true);
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/labelContent.test.ts`
Expected: FAIL — the `added`/`printed` lines are not produced.

- [ ] **Step 4: Implement in `labelContent.ts`**

Change the import on line 14:

```ts
import { formatDate, formatDateTime } from '../utils';
```

Replace `inventoryLabelContent` with:

```ts
export interface InventoryLabelOptions {
  /** When the label is being printed — supplied by the print path; the mapper
   *  stays pure so the Studio preview and unit tests can inject a fixed date. */
  printedAt?: Date;
}

export function inventoryLabelContent(
  item: InventoryItemWithDetails,
  fields?: LabelFields,
  opts?: InventoryLabelOptions,
): MappedLabel {
  const id = item.item_number ?? item.name ?? 'ITEM';
  const specRaw = [item.brand?.name, item.device_type?.name, item.capacity?.name].filter(present).join(' · ');
  const lines = [
    on(fields, 'spec') && present(specRaw) ? specRaw : null,
    on(fields, 'location') ? item.storage_location?.name ?? null : null,
    // added/printed default OFF, so they render only when explicitly enabled.
    fields?.added === true && present(item.created_at) ? formatDate(item.created_at) : null,
    fields?.printed === true && opts?.printedAt ? formatDateTime(opts.printedAt) : null,
  ].filter(present);

  return {
    content: { id, title: item.name ?? item.model ?? null, lines, footer: null, index: null },
    qrPayload: item.qr_value ?? item.item_number ?? item.barcode ?? id,
    barcodeValue: item.barcode ?? item.item_number ?? null,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/labelContent.test.ts`
Expected: PASS (existing + 3 new tests). The existing "survives a bare row … lines toEqual([])" test still passes (the sample row has no `created_at` and no `printedAt`).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add src/lib/inventory/inventoryLabelTypes.ts src/lib/pdf/labels/labelContent.ts src/lib/pdf/labels/labelContent.test.ts
git commit -m "feat(labels): inventory added / printed date lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 3: Identifier alignment + icon node in the engine

**Files:**
- Modify: `src/lib/pdf/labels/compactLabelDocument.ts`
- Modify: `src/lib/pdf/labels/compactLabelDocument.test.ts`

- [ ] **Step 1: Write the failing tests (append to `compactLabelDocument.test.ts`)**

Append a new `describe` after the `buildCompactLabelDocument` block. It reuses the file's existing `walk` / `collectImages` / `collectTexts` helpers:

```ts
describe('idAlign + icon options', () => {
  const ICON_PNG = 'data:image/png;base64,icon';

  it('applies the configured identifier alignment on a strip', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('nb_15x26'), 'Roboto', { idAlign: 'center' });
    const idNode = collectTexts(doc).find((t) => t.text === 'CASE-0042');
    expect(idNode!.alignment).toBe('center');
  });

  it('stamps an absolute-positioned icon in the requested corner, once per label', () => {
    const doc = buildCompactLabelDocument(
      [label(), label()],
      getLabelSize('nb_15x26'),
      'Roboto',
      { icon: ICON_PNG, iconPosition: 'top-left' },
    );
    const iconNodes: Array<Record<string, unknown>> = [];
    walk(doc.content, (n) => {
      if (n.image === ICON_PNG && n.absolutePosition) iconNodes.push(n);
    });
    expect(iconNodes).toHaveLength(2); // one per page/label
    const pos = iconNodes[0].absolutePosition as { x: number; y: number };
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(mmToPt(26) / 2); // left corner
    expect(pos.y).toBeLessThan(mmToPt(15) / 2); // top corner
  });

  it('adds no icon node when no icon is supplied', () => {
    const doc = buildCompactLabelDocument([label()], getLabelSize('nb_15x26'), 'Roboto', {});
    let count = 0;
    walk(doc.content, (n) => {
      if (n.absolutePosition) count += 1;
    });
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/compactLabelDocument.test.ts`
Expected: FAIL — `buildCompactLabelDocument` ignores the 4th `opts` arg.

- [ ] **Step 3: Implement in `compactLabelDocument.ts`**

Add to the imports at the top:

```ts
import type { IdAlign, IconPosition } from './labelSizes';
```

Add the icon constant + helper (near the other module constants, e.g. after `MIN_QR_SIDE_PT`):

```ts
/** Fixed footprint for the optional brand icon, clamped to fit tiny stock. */
const ICON_MM = 5;

function iconNode(dataUrl: string, size: LabelSizePreset, position: IconPosition): Content {
  const margin = labelMarginPt(size);
  const pageW = mmToPt(size.widthMm);
  const pageH = mmToPt(size.heightMm);
  const sidePt = Math.min(mmToPt(ICON_MM), pageW - margin * 2, pageH - margin * 2);
  const x = position.endsWith('left') ? margin : pageW - margin - sidePt;
  const y = position.startsWith('top') ? margin : pageH - margin - sidePt;
  return { image: dataUrl, width: sidePt, height: sidePt, absolutePosition: { x, y } };
}
```

Thread alignment through `idRow`. Change its signature and the returned node:

```ts
function idRow(
  label: CompactLabelContent,
  maxWidthPt: number,
  basePt: number,
  minPt: number,
  sizeOverride?: number,
  align: IdAlign = 'left',
): ContentText {
```

and change its final `return` to include `alignment: align`:

```ts
  return { text: spans, noWrap: true, lineHeight: LINE_HEIGHT, alignment: align };
```

Thread `align` into `buildStrip` and `buildCard` (square keeps its centered identity). Change their signatures:

```ts
function buildStrip(label: CompactLabelContent, contentW: number, contentH: number, align: IdAlign): Content {
```
```ts
function buildCard(label: CompactLabelContent, size: LabelSizePreset, contentW: number, contentH: number, align: IdAlign): Content {
```

Inside `buildStrip`, pass `align` at BOTH `idRow(...)` call sites — the side-by-side variant and the id-on-top variant:
- `const textStack: Content[] = [idRow(label, sideBySideTextW, 10, 5.5, undefined, align)];`
- `const stack: Content[] = [idRow(label, contentW, 11, 5.5, idSize, align)];`

Inside `buildCard`, pass `align` at the `idRow` call:
- `const textStack: Content[] = [idRow(label, textW, idBase, 5.5, undefined, align), hairline(textW)];`

(`buildSquare` is unchanged — its identifier stays `alignment: 'center'`.)

Add the `opts` param to `buildCompactLabelDocument` and use it:

```ts
export interface CompactLabelOptions {
  idAlign?: IdAlign;
  icon?: string | null;
  iconPosition?: IconPosition;
}

export function buildCompactLabelDocument(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily = 'Roboto',
  opts: CompactLabelOptions = {},
): TDocumentDefinitions {
  const margin = labelMarginPt(size);
  const pageW = mmToPt(size.widthMm);
  const pageH = mmToPt(size.heightMm);
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;
  const cls = sizeClass(size);
  const align: IdAlign = opts.idAlign ?? 'left';

  const pages: Content[] = labels.map((label, i) => {
    const body =
      cls === 'strip'
        ? buildStrip(label, contentW, contentH, align)
        : cls === 'square'
          ? buildSquare(label, contentW, contentH)
          : buildCard(label, size, contentW, contentH, align);
    const pageContent: Content[] = [body];
    if (opts.icon) pageContent.push(iconNode(opts.icon, size, opts.iconPosition ?? 'top-right'));
    return i === 0 ? { stack: pageContent } : { stack: pageContent, pageBreak: 'before' };
  });

  return {
    pageSize: { width: pageW, height: pageH },
    pageMargins: [margin, margin, margin, margin],
    defaultStyle: { font: fontFamily, fontSize: 5.5, color: INK },
    content: pages,
    info: { title: 'Labels' },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/compactLabelDocument.test.ts`
Expected: PASS (existing + 3 new tests). The existing "monochrome" test still holds (the icon node has no `color`).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add src/lib/pdf/labels/compactLabelDocument.ts src/lib/pdf/labels/compactLabelDocument.test.ts
git commit -m "feat(labels): identifier alignment + absolute-positioned icon in engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 4: Icon image helper (`labelIcon.ts`)

**Files:**
- Create: `src/lib/pdf/labels/labelIcon.ts`
- Create: `src/lib/pdf/labels/labelIcon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/labels/labelIcon.test.ts` (pure-function coverage — the canvas wrapper is exercised via the Studio mock in Task 7):

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { thresholdIconPixels } from './labelIcon';

/** Build an RGBA buffer from [r,g,b,a] tuples. */
function rgba(...px: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(px.flat());
}

describe('thresholdIconPixels', () => {
  it('turns dark opaque pixels into opaque black', () => {
    const data = rgba([10, 10, 10, 255]);
    thresholdIconPixels(data);
    expect([...data]).toEqual([0, 0, 0, 255]);
  });

  it('turns light pixels transparent', () => {
    const data = rgba([240, 240, 240, 255]);
    thresholdIconPixels(data);
    expect(data[3]).toBe(0);
  });

  it('keeps fully transparent source pixels transparent', () => {
    const data = rgba([0, 0, 0, 0]);
    thresholdIconPixels(data);
    expect(data[3]).toBe(0);
  });

  it('respects a custom threshold', () => {
    const midGrey = rgba([120, 120, 120, 255]);
    thresholdIconPixels(midGrey, 0.3); // 0.3*255=76.5; 120 > cut → transparent
    expect(midGrey[3]).toBe(0);
    const midGrey2 = rgba([120, 120, 120, 255]);
    thresholdIconPixels(midGrey2, 0.6); // 0.6*255=153; 120 < cut → black
    expect(midGrey2[3]).toBe(255);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/labelIcon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `labelIcon.ts`**

Create `src/lib/pdf/labels/labelIcon.ts`:

```ts
/**
 * Turn an uploaded image into a thermal-ready label icon: downscaled and
 * thresholded to 1-bit (opaque black on transparent), returned as a compact PNG
 * data URL. Direct-thermal heads are 1-bit, so a colour/gradient logo prints as
 * a grey smudge — thresholding at upload guarantees a crisp mark and the tenant
 * approves the actual result in the live preview.
 */

export const MAX_ICON_PX = 96;
export const ICON_THRESHOLD = 0.5;
export const MAX_ICON_DATAURL_BYTES = 65536;

/** Threshold RGBA IN PLACE: dark pixels → opaque black, everything else → transparent. */
export function thresholdIconPixels(data: Uint8ClampedArray, threshold = ICON_THRESHOLD): void {
  const cut = threshold * 255;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const dark = a > 10 && lum < cut;
    data[i] = data[i + 1] = data[i + 2] = 0;
    data[i + 3] = dark ? 255 : 0;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image'));
    img.src = src;
  });
}

/** Read → downscale ≤MAX_ICON_PX → threshold to 1-bit → PNG data URL. Throws on
 *  an unreadable image or an oversized result. */
export async function fileToLabelIconDataUrl(file: File): Promise<string> {
  const img = await loadImage(await readFileAsDataUrl(file));
  const scale = Math.min(1, MAX_ICON_PX / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  thresholdIconPixels(imageData.data);
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > MAX_ICON_DATAURL_BYTES) {
    throw new Error('That image is too detailed for a label icon — use a simpler mark.');
  }
  return dataUrl;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/labelIcon.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add src/lib/pdf/labels/labelIcon.ts src/lib/pdf/labels/labelIcon.test.ts
git commit -m "feat(labels): 1-bit label icon converter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 5: Thread opts + printedAt through the print service

**Files:**
- Modify: `src/lib/pdf/labels/labelPrintService.ts`

- [ ] **Step 1: Add `CompactLabelOptions` to the type imports**

At the top, extend the `compactLabelDocument` type import:

```ts
import type { CompactLabelContent, CompactLabelOptions } from './compactLabelDocument';
```

- [ ] **Step 2: Add `opts` to `buildAndEmit` and forward it**

Replace `buildAndEmit` (the version merged from the QZ work — it already awaits `tryQzPrint`) with:

```ts
async function buildAndEmit(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
  output: LabelOutput,
  filename: string,
  opts: CompactLabelOptions = {},
): Promise<void> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily, opts));
  if (output === 'download') pdf.download(filename);
  else if (output === 'open') pdf.open();
  else {
    const { tryQzPrint } = await import('./qzPrintService');
    const handled = await tryQzPrint(pdf, size);
    if (!handled) pdf.print();
  }
}
```

- [ ] **Step 3: Add `opts` to `buildLabelBase64` and `buildLabelBlobUrl` and forward it**

For BOTH functions, add the param and pass it into `buildCompactLabelDocument`. `buildLabelBlobUrl`:

```ts
export async function buildLabelBlobUrl(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
  opts: CompactLabelOptions = {},
): Promise<string> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily, opts));
  return new Promise<string>((resolve, reject) => {
    pdf.getBlob(
      (blob: Blob) => resolve(URL.createObjectURL(blob)),
      undefined,
      (err: unknown) => reject(err instanceof Error ? err : new Error('Label preview render failed')),
    );
  });
}
```

`buildLabelBase64` (the QZ helper):

```ts
export async function buildLabelBase64(
  labels: CompactLabelContent[],
  size: LabelSizePreset,
  fontFamily: string,
  opts: CompactLabelOptions = {},
): Promise<string> {
  const [{ createPdfWithFonts }, { buildCompactLabelDocument }] = await Promise.all([
    import('../fonts'),
    import('./compactLabelDocument'),
  ]);
  const pdf = createPdfWithFonts(buildCompactLabelDocument(labels, size, fontFamily, opts));
  return new Promise<string>((resolve) => pdf.getBase64((data: string) => resolve(data)));
}
```

- [ ] **Step 4: Add a shared `emitOptions` helper and pass it from each print function**

Add this helper near the top of the module (after `resolveLabelConfig`):

```ts
/** The engine options (id alignment + optional icon) derived from a resolved config. */
function emitOptions(cfg: ResolvedLabelConfig): CompactLabelOptions {
  return {
    idAlign: cfg.idAlign,
    icon: cfg.showIcon ? cfg.icon ?? null : null,
    iconPosition: cfg.iconPosition,
  };
}
```

In `printCaseLabels`, change the emit call to pass options:

```ts
    await buildAndEmit(labels, cfg.size, ctx.fontFamily, opts.output ?? 'print', `Labels_${caseNo}.pdf`, emitOptions(cfg));
```

In `printStockLabelBatch`, change the emit call:

```ts
    await buildAndEmit(labels, cfg.size, fontFamily, opts.output ?? 'print', filename, emitOptions(cfg));
```

In `printInventoryLabels`, compute the print time, pass it to the mapper, and pass the emit options:

```ts
    const printedAt = new Date();
    const mapped = items.map((item) => inventoryLabelContent(item, cfg.fields, { printedAt }));
    const images = await resolveLabelImages(mapped, cfg.size, { isRTL, showQr: cfg.showQr, showBarcode: cfg.showBarcode });
    const labels = withCopies(images, cfg.copies);
    const first = items[0];
    const filename =
      items.length === 1 ? `inv-label-${first.item_number ?? first.id}.pdf` : 'inventory-labels.pdf';
    await buildAndEmit(labels, cfg.size, fontFamily, opts.output ?? 'print', filename, emitOptions(cfg));
```

- [ ] **Step 5: Typecheck + run the label suite**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npx vitest run src/lib/pdf/labels`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/labels/labelPrintService.ts
git commit -m "feat(labels): thread id alignment, icon and printed time through print paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 6: Deterministic preview (sample date + icon/align forwarding)

**Files:**
- Modify: `src/lib/pdf/labels/labelPreview.ts`

- [ ] **Step 1: Give the sample inventory item a fixed created date**

In `SAMPLE_INVENTORY`, add (after `qr_value`):

```ts
  created_at: '2026-07-01T09:00:00Z',
```

- [ ] **Step 2: Forward printedAt + engine opts through the sample builder**

Add a fixed sample print time near the top of the file (after the imports):

```ts
/** Fixed so the Studio preview is stable (not a live-ticking clock). */
const SAMPLE_PRINTED_AT = new Date('2026-07-18T14:32:00Z');
```

Update the `labelPrintService` import to include `buildLabelBase64` if not already, and rewrite `sampleLabelImages` + the two preview functions so they thread `printedAt` (inventory only) and the engine `opts`:

```ts
import { resolveLabelImages, buildLabelBlobUrl, buildLabelBase64 } from './labelPrintService';
import type { CompactLabelOptions } from './compactLabelDocument';
```

```ts
async function sampleLabelImages(entity: LabelEntity, config: LabelEntityConfig) {
  const size = getLabelSize(config.sizeId);
  const mapped =
    entity === 'case'
      ? caseLabelContents(sampleReceiptData(), size, config.fields).slice(0, 1)
      : entity === 'stock'
        ? [stockLabelContent(SAMPLE_STOCK, { priceText: '1,234.50', locationName: 'Shelf A-3', companyName: 'Space Data Recovery' }, config.fields)]
        : [inventoryLabelContent(SAMPLE_INVENTORY, config.fields, { printedAt: SAMPLE_PRINTED_AT })];
  const labels = await resolveLabelImages(mapped, size, {
    showQr: config.showQr,
    showBarcode: config.showBarcode,
  });
  return { size, labels };
}

/** The engine options (alignment + icon) the preview must render, from a config. */
function previewOptions(config: LabelEntityConfig): CompactLabelOptions {
  return {
    idAlign: config.idAlign,
    icon: config.showIcon ? config.icon ?? null : null,
    iconPosition: config.iconPosition,
  };
}

export async function previewLabelBlob(entity: LabelEntity, config: LabelEntityConfig): Promise<string> {
  const { size, labels } = await sampleLabelImages(entity, config);
  return buildLabelBlobUrl(labels, size, 'Roboto', previewOptions(config));
}

export async function previewLabelBase64(entity: LabelEntity, config: LabelEntityConfig): Promise<string> {
  const { size, labels } = await sampleLabelImages(entity, config);
  return buildLabelBase64(labels, size, 'Roboto', previewOptions(config));
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add src/lib/pdf/labels/labelPreview.ts
git commit -m "feat(labels): preview renders date, alignment and icon deterministically

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 7: Label Studio UI — alignment control + icon section

> **UI task — load `frontend-design` + `ui-ux-pro-max` first** (CLAUDE.md gate) and use DESIGN.md semantic tokens. Reuse the existing `ToggleRow` and the control chrome already in `LabelStudio.tsx`.

**Files:**
- Modify: `src/components/settings/labels/LabelStudio.tsx`
- Create: `src/components/settings/labels/LabelStudio.test.tsx`

- [ ] **Step 1: Extend `mergeEntityConfig` for the new per-entity maps + tenant icon**

Replace `mergeEntityConfig` with:

```ts
function mergeEntityConfig(prefs: LabelPrintingPrefs, entity: LabelEntity, cfg: LabelEntityConfig): LabelPrintingPrefs {
  return {
    sizes: { ...prefs.sizes, [entity]: cfg.sizeId },
    autoPrint: { ...prefs.autoPrint, [entity]: cfg.autoPrint },
    copies: { ...prefs.copies, [entity]: cfg.copies },
    showQr: { ...prefs.showQr, [entity]: cfg.showQr },
    showBarcode: { ...prefs.showBarcode, [entity]: cfg.showBarcode },
    fields: { ...prefs.fields, [entity]: cfg.fields },
    idAlign: { ...prefs.idAlign, [entity]: cfg.idAlign },
    showIcon: { ...prefs.showIcon, [entity]: cfg.showIcon },
    iconPosition: { ...prefs.iconPosition, [entity]: cfg.iconPosition },
    icon: cfg.icon,
  };
}
```

- [ ] **Step 2: Re-run the preview when alignment/icon change**

In the preview `useEffect` dependency array, add the new config keys:

```ts
  }, [entity, cfg.sizeId, cfg.showQr, cfg.showBarcode, cfg.idAlign, cfg.showIcon, cfg.iconPosition, cfg.icon, JSON.stringify(cfg.fields)]);
```

- [ ] **Step 3: Add the imports the new UI needs**

Add to the top of `LabelStudio.tsx`:

```ts
import { AlignLeft, AlignCenter, AlignRight, ImagePlus, Trash2 } from 'lucide-react';
import { fileToLabelIconDataUrl } from '../../../lib/pdf/labels/labelIcon';
import type { IdAlign, IconPosition } from '../../../lib/pdf/labels/labelSizes';
```

- [ ] **Step 4: Add the Alignment + Icon sections to the controls Card**

Inside the controls `<Card>`, after the "Printing" block (the `Copies per print` / `Auto-print` div), add:

```tsx
          {/* Identifier alignment */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Identifier alignment</p>
            <p className="-mt-1 text-xs text-slate-500">Where the code prints (strip &amp; card stock; square is always centered).</p>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {([
                { v: 'left', Icon: AlignLeft },
                { v: 'center', Icon: AlignCenter },
                { v: 'right', Icon: AlignRight },
              ] as const).map(({ v, Icon }) => (
                <button
                  key={v}
                  type="button"
                  aria-label={`Align ${v}`}
                  aria-pressed={cfg.idAlign === v}
                  onClick={() => patch({ idAlign: v as IdAlign })}
                  className={[
                    'flex h-9 w-11 items-center justify-center transition-colors',
                    cfg.idAlign === v ? 'bg-primary text-primary-foreground' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Brand icon */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Brand icon</p>
            <p className="-mt-2 text-xs text-slate-500">
              A small favicon-style mark, converted to crisp 1-bit for thermal printing. Shared across all label types.
            </p>
            <div className="flex items-center gap-3">
              {cfg.icon ? (
                <img src={cfg.icon} alt="Label icon" className="h-10 w-10 rounded border border-slate-200 bg-white object-contain p-0.5" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
                  <ImagePlus className="h-4 w-4" />
                </div>
              )}
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {cfg.icon ? 'Replace' : 'Upload icon'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const icon = await fileToLabelIconDataUrl(file);
                      patch({ icon });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not process that image.');
                    }
                  }}
                />
              </label>
              {cfg.icon && (
                <button
                  type="button"
                  onClick={() => patch({ icon: undefined })}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-danger hover:bg-danger-muted"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
            </div>
            <ToggleRow
              icon={ImagePlus}
              label="Show icon on this label"
              hint={cfg.icon ? 'Stamped in the chosen corner.' : 'Upload an icon first.'}
              checked={!!cfg.icon && cfg.showIcon}
              disabled={!cfg.icon}
              onChange={(v) => patch({ showIcon: v })}
            />
            {cfg.icon && cfg.showIcon && (
              <div>
                <label htmlFor="icon-pos" className="mb-1 block text-xs font-medium text-slate-600">Corner</label>
                <select
                  id="icon-pos"
                  value={cfg.iconPosition}
                  onChange={(e) => patch({ iconPosition: e.target.value as IconPosition })}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </div>
            )}
          </div>
```

- [ ] **Step 5: Write the component tests**

Create `src/components/settings/labels/LabelStudio.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelStudio } from './LabelStudio';
import { DEFAULT_LABEL_PRINTING_PREFS } from '../../../lib/labelPrefsService';

vi.mock('../../../lib/pdf/fonts', () => ({ preloadAllFonts: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/pdf/labels/labelPreview', () => ({ previewLabelBlob: vi.fn().mockResolvedValue('blob:preview') }));
vi.mock('../../../lib/pdf/labels/labelIcon', () => ({ fileToLabelIconDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,ICON') }));

const setPrefs = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../lib/labelPrefsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/labelPrefsService')>();
  return { ...actual, getLabelPrintingPrefs: vi.fn().mockResolvedValue(actual.DEFAULT_LABEL_PRINTING_PREFS), setLabelPrintingPrefs: (p: unknown) => setPrefs(p) };
});

function renderStudio() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LabelStudio entity="inventory" label="Inventory label" onBack={() => {}} />
    </QueryClientProvider>,
  );
}

describe('LabelStudio alignment + icon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the date-field checkboxes for inventory', async () => {
    renderStudio();
    expect(await screen.findByText('Date added')).toBeInTheDocument();
    expect(screen.getByText('Printed date/time')).toBeInTheDocument();
  });

  it('saves the chosen identifier alignment', async () => {
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: /align center/i }));
    fireEvent.click(screen.getByRole('button', { name: /save & deploy/i }));
    await waitFor(() => expect(setPrefs).toHaveBeenCalled());
    expect(setPrefs.mock.calls[0][0].idAlign.inventory).toBe('center');
  });

  it('uploads an icon, shows the preview, and can remove it', async () => {
    renderStudio();
    const input = (await screen.findByText(/upload icon/i)).closest('label')!.querySelector('input')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'i.png', { type: 'image/png' })] } });
    const img = await screen.findByAltText('Label icon');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,ICON');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(screen.queryByAltText('Label icon')).not.toBeInTheDocument());
  });

  it('disables the show-icon toggle until an icon is uploaded', async () => {
    renderStudio();
    expect(await screen.findByRole('switch', { name: /show icon on this label/i })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/settings/labels/LabelStudio.test.tsx`
Expected: FAIL first (before Steps 1-4 wired) → after implementing, PASS (4 tests).

- [ ] **Step 7: Typecheck + lint + commit**

Run: `npm run typecheck && npx eslint src/components/settings/labels/LabelStudio.tsx`
Expected: 0 errors (i18n warnings acceptable).

```bash
git add src/components/settings/labels/LabelStudio.tsx src/components/settings/labels/LabelStudio.test.tsx
git commit -m "feat(labels): Label Studio alignment control + brand icon upload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 8: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck** — Run: `npm run typecheck` — Expected: 0 errors.
- [ ] **Step 2: Full test suite** — Run: `npx vitest run` — Expected: only the same pre-existing failures as `origin/main` (no NEW failures); the new label tests pass. If unsure, compare the failing-file set against `git stash && git checkout origin/main` is NOT needed — instead confirm none of the failing files are ones this branch touched.
- [ ] **Step 3: Lint touched files** — Run: `npx eslint src/lib/labelPrefsService.ts src/lib/pdf/labels/labelContent.ts src/lib/pdf/labels/compactLabelDocument.ts src/lib/pdf/labels/labelIcon.ts src/lib/pdf/labels/labelPrintService.ts src/lib/pdf/labels/labelPreview.ts src/components/settings/labels/LabelStudio.tsx` — Expected: 0 errors.
- [ ] **Step 4: Build** — Run: `npm run build` — Expected: succeeds.
- [ ] **Step 5: Manual (record in PR/handoff)** — In Label Studio → Inventory: toggle **Date added** and **Printed date/time** (preview shows the sample dates); switch **alignment** Left/Center/Right (identifier moves on the strip preview); **upload** a favicon, toggle **Show icon**, cycle the **corner** (icon appears in the preview corner, in mono). Save & deploy; auto-print/Print Label a real item and confirm it matches.
- [ ] **Step 6: Adversarial self-review** — review the branch diff (opt-in date defaults OFF, `fields?.added === true` strictness, icon size cap, absolute-position math on tiny stock, preview determinism, no static `qz-tray`/pdfmake import regressions). Fix confirmed findings. Do NOT push or open a PR unless the user asks.

---

## Self-Review Notes

- **Spec coverage:** Phase 1A dates → Tasks 1 (field defs) + 2 (mapper) + 6 (preview sample). Phase 1B alignment → Tasks 1 (config) + 3 (engine) + 5 (thread) + 7 (UI). Phase 2 icon → Tasks 1 (config+validation) + 3 (iconNode) + 4 (converter) + 5 (thread) + 6 (preview) + 7 (upload UI). Config model / normalization / projection → Task 1. Tests → each task. Boundaries (no migration, square stays centered, case/stock get align+icon, dates inventory-only) honored.
- **Type consistency:** `IdAlign` / `IconPosition` (defined in `labelSizes.ts`, Task 1) are imported identically everywhere; `CompactLabelOptions` (Task 3) is the transport used by Tasks 5-6; `InventoryLabelOptions.printedAt` (Task 2) matches the `{ printedAt }` calls in Tasks 5-6; `emitOptions`/`previewOptions` build the same shape; `fileToLabelIconDataUrl` / `thresholdIconPixels` names match across Tasks 4 and 7.
- **Opt-in dates:** the two new fields default OFF via `LABEL_FIELDS` default `false` and render only on `fields?.added === true` / `fields?.printed === true` — existing labels are unchanged with zero migration.
- **Icon safety:** capped at `MAX_ICON_DATAURL_BYTES` (65536) both at conversion (Task 4) and normalization (Task 1); a bad/oversized value falls back to no icon.
