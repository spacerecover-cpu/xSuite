# Label Studio: Adjustable Identifier Font Size — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenants bias the identifier font size (Small / Normal / Large / Extra-large) per label type, without the code ever clipping or overflowing.

**Architecture:** A per-entity `idScale` multiplier in `label_printing` metadata biases the identifier's size **cap**; the existing width-fitter keeps it width-safe, and each layout **height-clamps** the result so a scaled-up code never exceeds the label height. Rides the shared compact engine via the existing `CompactLabelOptions` (like `idAlign`). No DB migration.

**Tech Stack:** React 18 + TS + Vite, TanStack Query v5, pdfmake, vitest + @testing-library/react, Tailwind (DESIGN.md tokens), lucide-react.

**Design spec:** `docs/superpowers/specs/2026-07-18-label-identifier-font-size-design.md`

**Branch:** `claude/inventory-label-printer-v67p66` (current — folds into open PR #426).

---

## File Structure

- **Modify** `src/lib/labelPrefsService.ts` — `idScale` map + `LabelEntityConfig.idScale` + normalization + projection.
- **Modify** `src/lib/pdf/labels/compactLabelDocument.ts` — `idScale` in `CompactLabelOptions`; `heightCappedIdSize` helper; thread + clamp in `buildStrip`/`buildSquare`/`buildCard`; resolve in `buildCompactLabelDocument`.
- **Modify** `src/lib/pdf/labels/labelPrintService.ts` — `emitOptions` adds `idScale`.
- **Modify** `src/lib/pdf/labels/labelPreview.ts` — `previewOptions` adds `idScale`.
- **Modify** `src/components/settings/labels/LabelStudio.tsx` — Identifier-size control + `mergeEntityConfig` + preview dep.

**No DB migration. No `database.types.ts` change.**

---

## Task 1: Config — `idScale` in prefs

**Files:**
- Modify: `src/lib/labelPrefsService.ts`
- Modify: `src/lib/labelPrefsService.test.ts`

- [ ] **Step 1: Write the failing tests (append inside `describe('normalizeLabelPrintingPrefs', …)`)**

```ts
  it('defaults idScale to 1 per entity and clamps out-of-range / non-finite values', () => {
    expect(normalizeLabelPrintingPrefs(undefined).idScale).toEqual({ case: 1, stock: 1, inventory: 1 });
    const p = normalizeLabelPrintingPrefs({ idScale: { inventory: 1.5, case: 5, stock: 'big' } });
    expect(p.idScale.inventory).toBe(1.5);
    expect(p.idScale.case).toBe(2); // clamped to max 2.0
    expect(p.idScale.stock).toBe(1); // non-number → default 1
  });

  it('labelEntityConfig projects idScale', () => {
    const prefs = normalizeLabelPrintingPrefs({ idScale: { inventory: 1.25 } });
    expect(labelEntityConfig(prefs, 'inventory').idScale).toBe(1.25);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/labelPrefsService.test.ts`
Expected: FAIL — `idScale` does not exist.

- [ ] **Step 3: Implement in `labelPrefsService.ts`**

Add `idScale: number;` to `LabelEntityConfig` (after `iconPosition`):

```ts
  iconPosition: IconPosition;
  /** Identifier font-size multiplier (0.5–2.0; 1 = auto-fit default). */
  idScale: number;
  icon?: string;
```

Add `idScale` to `LabelPrintingPrefs` (after `iconPosition`):

```ts
  iconPosition: Record<LabelEntity, IconPosition>;
  /** Identifier font-size multiplier per entity (0.5–2.0; default 1). */
  idScale: Record<LabelEntity, number>;
  icon?: string;
```

In `buildDefaults`, declare + fill + return the map:

```ts
  const iconPosition = {} as Record<LabelEntity, IconPosition>;
  const idScale = {} as Record<LabelEntity, number>;
  for (const e of ENTITIES) {
    ...
    iconPosition[e] = 'top-right';
    idScale[e] = 1;
  }
  return { sizes, autoPrint, copies, showQr, showBarcode, fields, idAlign, showIcon, iconPosition, idScale, icon: undefined };
```

Add the normalizer (next to `normalizeIconPosition`):

```ts
function normalizeIdScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : 1;
}
```

In `normalizeLabelPrintingPrefs`, add `idScale?: Record<string, unknown>;` to the `raw` type, and fill it in the loop (after `iconPosition`):

```ts
    prefs.iconPosition[e] = normalizeIconPosition(raw.iconPosition?.[e]);
    prefs.idScale[e] = normalizeIdScale(raw.idScale?.[e]);
```

In `labelEntityConfig`, project it (after `iconPosition`):

```ts
    iconPosition: prefs.iconPosition[entity],
    idScale: prefs.idScale[entity],
    icon: prefs.icon,
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/labelPrefsService.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add src/lib/labelPrefsService.ts src/lib/labelPrefsService.test.ts
git commit -m "feat(labels): idScale config for adjustable identifier size

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 2: Engine — scale + height-clamp the identifier

**Files:**
- Modify: `src/lib/pdf/labels/compactLabelDocument.ts`
- Modify: `src/lib/pdf/labels/compactLabelDocument.test.ts`

- [ ] **Step 1: Write the failing tests (append after the `idAlign + icon options` describe)**

```ts
describe('idScale (identifier font size)', () => {
  const idOnly = () => label({ qrDataUrl: null, title: null, lines: [], index: undefined });
  const idFont = (doc: TDocumentDefinitions) =>
    collectTexts(doc).find((t) => t.text === 'CASE-0042')?.fontSize as number;

  it('scales a short identifier up above the Normal size', () => {
    const norm = buildCompactLabelDocument([idOnly()], getLabelSize('nb_15x26'), 'Roboto', { idScale: 1 });
    const large = buildCompactLabelDocument([idOnly()], getLabelSize('nb_15x26'), 'Roboto', { idScale: 1.5 });
    expect(idFont(large)).toBeGreaterThan(idFont(norm));
  });

  it('scales the identifier down below the Normal size', () => {
    const norm = buildCompactLabelDocument([idOnly()], getLabelSize('nb_15x26'), 'Roboto', { idScale: 1 });
    const small = buildCompactLabelDocument([idOnly()], getLabelSize('nb_15x26'), 'Roboto', { idScale: 0.85 });
    expect(idFont(small)).toBeLessThan(idFont(norm));
  });

  it('never lets a scaled-up identifier line exceed the label height on short stock', () => {
    const size = getLabelSize('nb_12x40'); // 40×12mm strip
    const doc = buildCompactLabelDocument([idOnly()], size, 'Roboto', { idScale: 2 });
    const contentH = mmToPt(size.heightMm) - 2 * labelMarginPt(size);
    expect(idFont(doc) * 1.35).toBeLessThanOrEqual(contentH + 0.5); // LINE_FACTOR = 1.35
  });
});
```

Add `labelMarginPt` to the labelSizes import at the top of the test file:

```ts
import { getLabelSize, mmToPt, labelMarginPt } from './labelSizes';
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdf/labels/compactLabelDocument.test.ts`
Expected: FAIL — `idScale` is ignored (both sizes equal; short-stock unclamped).

- [ ] **Step 3: Add the height-clamp helper + `idScale` to options**

After the `lineBoxPt` definition, add:

```ts
/** Clamp an id size so its line box fits `availH`, never below `minPt`. */
function heightCappedIdSize(idSize: number, availH: number, minPt: number): number {
  return Math.max(minPt, Math.min(idSize, Math.floor((availH / LINE_FACTOR) * 2) / 2));
}
```

Add `idScale?: number;` to `CompactLabelOptions`:

```ts
export interface CompactLabelOptions {
  idAlign?: IdAlign;
  icon?: string | null;
  iconPosition?: IconPosition;
  idScale?: number;
}
```

- [ ] **Step 4: Thread `idScale` into the three build functions**

`buildStrip` — change the signature and the id sizing (lines shown are the current ones to replace):

Signature:
```ts
function buildStrip(label: CompactLabelContent, contentW: number, contentH: number, align: IdAlign, idScale: number): Content {
```

Side-by-side variant (`const idSize = idRowSize(...)` + the `idRow(...)` call):
```ts
    const idSize = heightCappedIdSize(idRowSize(label, sideBySideTextW, 10 * idScale, 5.5), contentH, 5.5);
    const textStack: Content[] = [idRow(label, sideBySideTextW, 10 * idScale, 5.5, idSize, align)];
```

No-QR / QR-on-top block (`const widthFit …` through the `idRow(...)` push):
```ts
  const widthFit = idRowSize(label, contentW, 11 * idScale, 5.5);
  const idSize = qrSide
    ? Math.max(5.5, Math.min(widthFit, Math.floor((topH / LINE_FACTOR) * 2) / 2))
    : heightCappedIdSize(widthFit, contentH, 5.5);

  const stack: Content[] = [idRow(label, contentW, 11 * idScale, 5.5, idSize, align)];
```

`buildSquare` — signature + id sizing + the `idRow` push:
```ts
function buildSquare(label: CompactLabelContent, contentW: number, contentH: number, idScale: number): Content {
```
```ts
  const idSize = heightCappedIdSize(fitFontSize(label.id, contentW, 9 * idScale, 5), contentH, 5);
```
```ts
  stack.push({ ...idRow(label, contentW, 9 * idScale, 5, idSize), alignment: 'center' });
```

`buildCard` — signature + id base/sizing + the `idRow` in `textStack`:
```ts
function buildCard(label: CompactLabelContent, size: LabelSizePreset, contentW: number, contentH: number, align: IdAlign, idScale: number): Content {
```
```ts
  const idBase = 12 * idScale;
  const idSize = heightCappedIdSize(fitFontSize(label.id, textW, idBase, 5.5), textZoneH, 5.5);
  const ruleH = 5;
  const textStack: Content[] = [idRow(label, textW, idBase, 5.5, idSize, align), hairline(textW)];
```

- [ ] **Step 5: Resolve `idScale` in `buildCompactLabelDocument` and pass it**

```ts
  const align: IdAlign = opts.idAlign ?? 'left';
  const idScale = opts.idScale ?? 1;

  const pages: Content[] = labels.map((label, i) => {
    const body =
      cls === 'strip'
        ? buildStrip(label, contentW, contentH, align, idScale)
        : cls === 'square'
          ? buildSquare(label, contentW, contentH, idScale)
          : buildCard(label, size, contentW, contentH, align, idScale);
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/lib/pdf/labels/compactLabelDocument.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add src/lib/pdf/labels/compactLabelDocument.ts src/lib/pdf/labels/compactLabelDocument.test.ts
git commit -m "feat(labels): scale + height-clamp the identifier by idScale

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 3: Thread `idScale` through print + preview

**Files:**
- Modify: `src/lib/pdf/labels/labelPrintService.ts`
- Modify: `src/lib/pdf/labels/labelPreview.ts`

- [ ] **Step 1: `emitOptions` (labelPrintService)** — add `idScale`:

```ts
function emitOptions(cfg: ResolvedLabelConfig): CompactLabelOptions {
  return {
    idAlign: cfg.idAlign,
    icon: cfg.showIcon ? cfg.icon ?? null : null,
    iconPosition: cfg.iconPosition,
    idScale: cfg.idScale,
  };
}
```

- [ ] **Step 2: `previewOptions` (labelPreview)** — add `idScale`:

```ts
function previewOptions(config: LabelEntityConfig): CompactLabelOptions {
  return {
    idAlign: config.idAlign,
    icon: config.showIcon ? config.icon ?? null : null,
    iconPosition: config.iconPosition,
    idScale: config.idScale,
  };
}
```

- [ ] **Step 3: Typecheck + label suite**

Run: `npm run typecheck` → 0 errors.
Run: `npx vitest run src/lib/pdf/labels` → PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/labels/labelPrintService.ts src/lib/pdf/labels/labelPreview.ts
git commit -m "feat(labels): forward idScale through print and preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 4: Label Studio — Identifier size control

> **UI task — load `frontend-design` + `ui-ux-pro-max` first** (CLAUDE.md gate); DESIGN.md tokens; mirror the existing alignment segmented control.

**Files:**
- Modify: `src/components/settings/labels/LabelStudio.tsx`
- Modify: `src/components/settings/labels/LabelStudio.test.tsx`

- [ ] **Step 1: Persist `idScale` in `mergeEntityConfig`** — add after the `iconPosition` line:

```ts
    iconPosition: { ...prefs.iconPosition, [entity]: cfg.iconPosition },
    idScale: { ...prefs.idScale, [entity]: cfg.idScale },
    icon: cfg.icon,
```

- [ ] **Step 2: Add `cfg.idScale` to the preview effect dependency array**

```ts
  }, [entity, cfg.sizeId, cfg.showQr, cfg.showBarcode, cfg.idAlign, cfg.idScale, cfg.showIcon, cfg.iconPosition, cfg.icon, JSON.stringify(cfg.fields)]);
```

- [ ] **Step 3: Add the Identifier-size control** — immediately after the closing `</div>` of the "Identifier alignment" block (before `{/* Brand icon */}`):

```tsx
          {/* Identifier size */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Identifier size</p>
            <p className="-mt-1 text-xs text-slate-500">Bias the code larger or smaller (it still auto-fits the stock).</p>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {([
                { v: 0.85, label: 'S' },
                { v: 1, label: 'Normal' },
                { v: 1.25, label: 'L' },
                { v: 1.5, label: 'XL' },
              ] as const).map(({ v, label: sizeLabel }) => (
                <button
                  key={sizeLabel}
                  type="button"
                  aria-label={`Identifier size ${sizeLabel}`}
                  aria-pressed={cfg.idScale === v}
                  onClick={() => patch({ idScale: v })}
                  className={[
                    'flex h-9 min-w-[3rem] items-center justify-center px-3 text-sm font-medium transition-colors',
                    cfg.idScale === v ? 'bg-primary text-primary-foreground' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {sizeLabel}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 4: Write the failing test (append to `LabelStudio.test.tsx`, inside the existing describe)**

```tsx
  it('saves the chosen identifier size', async () => {
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: /identifier size xl/i }));
    fireEvent.click(screen.getByRole('button', { name: /save & deploy/i }));
    await waitFor(() => expect(setPrefs).toHaveBeenCalled());
    expect(setPrefs.mock.calls[0][0].idScale.inventory).toBe(1.5);
  });
```

- [ ] **Step 5: Run tests → PASS**

Run: `npx vitest run src/components/settings/labels/LabelStudio.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 6: Typecheck + lint + commit**

Run: `npm run typecheck && npx eslint src/components/settings/labels/LabelStudio.tsx` → 0 errors (i18n warnings ok).

```bash
git add src/components/settings/labels/LabelStudio.tsx src/components/settings/labels/LabelStudio.test.tsx
git commit -m "feat(labels): Label Studio identifier size control

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W8E89QmSC1cNbUWWgRSMQP"
```

---

## Task 5: Verification gate

- [ ] **Step 1: Typecheck** — `npm run typecheck` → 0 errors.
- [ ] **Step 2: Full suite** — `npx vitest run` → no NEW failures vs `main` (only pre-existing `SuppliersListPage`/`PurchaseOrdersListPage`; confirm via `git diff --name-only origin/main..HEAD` that no supplier files were touched).
- [ ] **Step 3: Lint** — `npx eslint src/lib/labelPrefsService.ts src/lib/pdf/labels/compactLabelDocument.ts src/lib/pdf/labels/labelPrintService.ts src/lib/pdf/labels/labelPreview.ts src/components/settings/labels/LabelStudio.tsx` → 0 errors.
- [ ] **Step 4: Build** — `npm run build` → succeeds.
- [ ] **Step 5: Manual** — Label Studio → Inventory: cycle Identifier size S→XL; the preview code grows/shrinks and stays within the label. Check a 40×12 strip at XL does not clip. Do NOT push/PR (the parent turn handles folding into #426).

---

## Self-Review Notes

- **Spec coverage:** config/normalization/projection → Task 1; multiplier + per-layout height-clamp → Task 2; print+preview forwarding → Task 3; UI control + persistence + preview dep → Task 4; gate → Task 5.
- **Type consistency:** `idScale: number` on both `LabelEntityConfig` and `CompactLabelOptions`; `normalizeIdScale` clamps `[0.5, 2]`; `heightCappedIdSize(idSize, availH, minPt)` signature identical at all call sites; the four preset values `0.85 / 1 / 1.25 / 1.5` match the control and the spec.
- **Overflow safety:** width-safe via `fitFontSize(base × idScale)`; height-safe via `heightCappedIdSize` in every layout (the QR-on-top strip keeps its existing `topH` bound). Default `1` reproduces today's output exactly.
