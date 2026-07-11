# Label Studio Settings Page + Print-Time Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give thermal labels their own Settings surface (Settings → Label Studio) — moving them fully out of the Documents (PDF) Studio — and add one-off print-time overrides (stock size / copies / QR / barcode) at every manual label-print point.

**Architecture:** WP-1 relocates the Labels category from `DocumentTemplatesPage` into a new `/settings/labels` page: a `SETTINGS_CATEGORIES` entry, an explicit route, and a `LabelStudioPage` that hosts the three `LABEL_CARDS` and opens the existing `LabelStudio` editor as an inline sub-view (same pattern the Documents page uses today). WP-2 adds a controlled `LabelPrintOptionsFields` cluster and a `LabelPrintDialog` (built on `components/ui/Modal`) that seeds from the tenant's saved design and passes a one-off full-`config` override through the **existing** `LabelPrintOptions.config` plumbing in `labelPrintService` — nothing is persisted, `resolveLabelConfig` already short-circuits the prefs fetch when `config` is present.

**Tech Stack:** React 19 + TS + Tailwind (semantic tokens per DESIGN.md), TanStack Query v5, vitest + testing-library, lucide-react.

## Global Constraints

- Theming: semantic tokens only; no `purple/indigo/violet` classes; no raw brand hexes in components (the `settingsCategories.ts` tile-hex convention is pre-existing data and is followed there only).
- `settingsKeys.labelPrinting()` is the shared query key for label prefs — every reader/writer must keep using it.
- Auto-print-on-create paths must NOT gain a dialog: `CreateCaseWizard.tsx:503`, `StockItemFormModal.tsx:175`, `InventoryItemWizard.tsx:455` stay silent.
- Quick print stays one click everywhere it is one click today; overrides are an *additional* affordance.
- `tsc` 0 errors (CI gate); full suite green except the 2 known pre-existing `chainOfCustodyParity` failures.
- No DB migration — `company_settings.metadata.label_printing` is untouched in shape.

## Design decisions (locked)

1. **Placement:** `Settings → Label Studio` card in the "Documents & Reports" dashboard group, id `labels`, route `/settings/labels` (dashboard fall-through `navigate('/settings/${id}')` covers it — no `SettingsDashboard` change).
2. **Override affordance per surface:**
   - `CaseDetail` toolbar: "Print Label" button stays instant; new adjacent icon button (SlidersHorizontal, "Print label with options…") opens `LabelPrintDialog`.
   - `PrintLabelPage` (`/print/label/:caseId`): auto-generates as today; gains a "Print options…" secondary button.
   - `PrintLabelsModal` (stock batch): already a modal → embeds `LabelPrintOptionsFields` inline ("This print" section); its Print/Download pass the edited config.
   - `InventoryDetailModal`: "Print Label" header action stays instant; adjacent options icon button opens the dialog.
   - `InventoryListPage` row Printer action and `CreateCaseWizard` success-modal "Print Label": stay instant-only (fast path; options reachable from detail surfaces).
3. **Override mechanics:** dialog resolves the tenant `LabelEntityConfig`, user edits a copy, confirm passes it as `LabelPrintOptions.config` → whole design applies for that print only.
4. **`LabelStudio` component moves** to `src/components/settings/labels/LabelStudio.tsx` (labels are no longer a "documents" concern); `LABEL_CARDS`/`LabelCardMeta` move to `src/pages/settings/labelStudioMeta.ts`.
5. Cross-links: Documents page rail footer gets "Thermal labels have moved → Label Studio"; Preferences `LabelPrintingCard` gets an "Open Label Studio" link; the dialog hints "One-off — doesn't change your saved design. Edit design in Label Studio".

---

### Task 1: Share the size-group metadata

**Files:**
- Modify: `src/lib/pdf/labels/labelSizes.ts` (append)
- Modify: `src/components/settings/documents/LabelStudio.tsx:41-45` (delete local `SIZE_GROUPS`, import shared)

**Interfaces:**
- Produces: `export const LABEL_SIZE_GROUPS: readonly { cls: LabelSizeClass; label: string }[]` with the exact three entries currently in `LabelStudio.tsx` (`strip`/'Strip — narrow rolls', `square`/'Square', `card`/'Card — wider stock').

- [x] Append to `labelSizes.ts`:

```ts
/** UI grouping for size pickers (Studio + print-time dialog). */
export const LABEL_SIZE_GROUPS: readonly { cls: LabelSizeClass; label: string }[] = [
  { cls: 'strip', label: 'Strip — narrow rolls' },
  { cls: 'square', label: 'Square' },
  { cls: 'card', label: 'Card — wider stock' },
];
```

- [x] In `LabelStudio.tsx` delete the local `SIZE_GROUPS` const, import `LABEL_SIZE_GROUPS` from `../../../lib/pdf/labels/labelSizes`, rename usages.
- [x] Run: `npx vitest run src/lib/pdf/labels` → PASS; commit `refactor(labels): share LABEL_SIZE_GROUPS from labelSizes`.

### Task 2: Move LABEL_CARDS to labelStudioMeta

**Files:**
- Create: `src/pages/settings/labelStudioMeta.ts`
- Create: `src/pages/settings/labelStudioMeta.test.ts`
- Modify: `src/pages/settings/documentTypeMeta.ts` (remove `labels` from `DocCategory`, `DOC_CATEGORIES` entry, `LabelCardMeta` + `LABEL_CARDS`, now-unused imports `Tag`/`QrCode`/`Package` and `LabelEntity`)
- Modify: `src/pages/settings/documentTypeMeta.test.ts` (drop moved assertions)

**Interfaces:**
- Produces: `labelStudioMeta.ts` exporting `LabelCardMeta` and `LABEL_CARDS` **verbatim** as they exist in `documentTypeMeta.ts:193-220` today (entity/label/description/icon for case, stock, inventory).

- [x] Create `labelStudioMeta.ts` (move the block + its lucide imports `Tag, Barcode, Package` and the `LabelEntity` type import; keep the doc comment).
- [x] `labelStudioMeta.test.ts` — move the existing LABEL_CARDS assertions from `documentTypeMeta.test.ts`:

```ts
import { LABEL_CARDS } from './labelStudioMeta';

describe('LABEL_CARDS', () => {
  it('covers exactly the three label entities', () => {
    expect(LABEL_CARDS.map((c) => c.entity)).toEqual(['case', 'stock', 'inventory']);
  });
  it('each card has label, description and icon', () => {
    for (const c of LABEL_CARDS) {
      expect(c.label).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.icon).toBeTruthy();
    }
  });
});
```

- [x] Strip `documentTypeMeta.ts` (union becomes `'financial' | 'intake' | 'reports' | 'internal'`; DOC_CATEGORIES loses the labels row) and its test's labels expectations (keep "labels excluded from DOCUMENT_TYPES" as: no card with type `case_label`/`stock_label`).
- [x] `npx vitest run src/pages/settings/documentTypeMeta.test.ts src/pages/settings/labelStudioMeta.test.ts` → PASS (DocumentTemplatesPage still red until Task 4 — expected mid-sequence); commit.

### Task 3: LabelStudioPage + registry + route (+ component move)

**Files:**
- Move: `src/components/settings/documents/LabelStudio.tsx` → `src/components/settings/labels/LabelStudio.tsx` (git mv; fix relative imports depth — unchanged at 3 levels)
- Create: `src/pages/settings/LabelStudioPage.tsx`
- Create: `src/pages/settings/LabelStudioPage.test.tsx` (adapt the two Labels tests from `DocumentTemplatesPage.test.tsx`)
- Modify: `src/config/settingsCategories.ts` (entry after `documents` at :246; add `'labels'` to the `documents` group in `SETTINGS_GROUPS:322`)
- Modify: `src/App.tsx:266` area (route before the `:categoryId` catch-all)

**Interfaces:**
- Consumes: `LABEL_CARDS` (Task 2), `LabelStudio` (moved), `SettingsPageHeader`, `EDITOR_ROLES` gating pattern from `DocumentTemplatesPage.tsx:57`.
- Produces: `export const LabelStudioPage: React.FC` (named export for `page(...)` lazy loader).

- [x] Registry entry (Tags icon, distinct hue following file convention):

```ts
{
  id: 'labels',
  title: 'Label Studio',
  icon: Tags,
  backgroundColor: '#b45309',
  borderColor: '#b45309',
  tables: [],
  actionLabel: 'Design Labels',
  description: 'Design the thermal labels printed for cases, stock and inventory items.',
},
```

- [x] `SETTINGS_GROUPS`: `categoryIds: ['templates', 'documents', 'labels']`.
- [x] Route: `<Route path="labels" lazy={page(() => import('./pages/settings/LabelStudioPage'), 'LabelStudioPage')} />`.
- [x] `LabelStudioPage.tsx`: `SettingsPageHeader categoryId="labels"`, back-to-settings button, non-editor notice (viewer preview), card grid lifted from `DocumentTemplatesPage.tsx:402-427`, `editingLabel` state → `<LabelStudio entity label onBack />` sub-view.
- [x] Tests: page renders all three cards; clicking Design shows the LabelStudio heading (`Case label template`); non-editor sees Preview.
- [x] `npx vitest run src/pages/settings/LabelStudioPage.test.tsx` → PASS; commit.

### Task 4: Strip labels from DocumentTemplatesPage + pointer

**Files:**
- Modify: `src/pages/settings/DocumentTemplatesPage.tsx` (remove `editingLabel` state :102, labels early-return :268-274, `isLabels`/count branches :305-310/:356-359, LABEL_CARDS grid :402-427, imports)
- Modify: `src/pages/settings/DocumentTemplatesPage.test.tsx`

**Interfaces:** none new. Rail footer pointer:

```tsx
<Link to="/settings/labels" className="mt-3 flex items-center gap-1.5 px-1 text-xs font-medium text-primary hover:underline">
  <Tags className="h-3.5 w-3.5" />
  Thermal labels have moved to Label Studio
</Link>
```

- [x] Tests: replace the two Labels tests with (a) no "Labels" rail category rendered, (b) the pointer link targets `/settings/labels`.
- [x] `npx vitest run src/pages/settings/DocumentTemplatesPage.test.tsx` → PASS; commit.

### Task 5: Preferences cross-link

**Files:**
- Modify: `src/pages/settings/PreferencesSettings.tsx` (LabelPrintingCard header, ~L82)

- [x] Add header-right link `Open Label Studio →` (`Link to="/settings/labels"`, `text-xs font-medium text-primary`). Commit (fold into Task 4 commit if trivial).

### Task 6: LabelPrintOptionsFields + LabelPrintDialog (TDD)

**Files:**
- Create: `src/components/labels/LabelPrintOptionsFields.tsx`
- Create: `src/components/labels/LabelPrintDialog.tsx`
- Create: `src/components/labels/LabelPrintDialog.test.tsx`

**Interfaces (produced):**

```ts
// LabelPrintOptionsFields.tsx
export interface LabelPrintOverrides {
  sizeId: string;
  copies: number;
  showQr: boolean;
  showBarcode: boolean;
}
export interface LabelPrintOptionsFieldsProps {
  value: LabelPrintOverrides;
  onChange: (patch: Partial<LabelPrintOverrides>) => void;
  idPrefix?: string; // default 'label-print'
}
// Renders: grouped size <select> (LABEL_SIZE_GROUPS × LABEL_SIZE_PRESETS),
// copies <input type=number min=1 max=20> (clamped on change),
// QR checkbox, Barcode checkbox auto-disabled when !supportsBarcode(size)
// (checked state renders as false while disabled, matching LabelStudio).

// LabelPrintDialog.tsx
export interface LabelPrintDialogProps {
  entity: LabelEntity;
  isOpen: boolean;
  busy?: boolean;
  onClose: () => void;
  /** One-off design for THIS print; caller passes it as LabelPrintOptions.config. */
  onPrint: (config: LabelEntityConfig) => void;
}
// Modal size="sm", title "Print options", icon Printer.
// Seeds LabelPrintOverrides from useQuery(settingsKeys.labelPrinting()) +
// labelEntityConfig(prefs, entity) whenever the dialog (re)opens.
// Footer: Cancel (secondary) / Print (primary, isLoading=busy).
// Hint row: "One-off — your saved design is unchanged." + Link "Edit design in Label Studio".
// onPrint(config) where config = { ...tenantEntityConfig, ...overrides }.
```

- [x] **Failing tests first** (`LabelPrintDialog.test.tsx`, jsdom + QueryClientProvider + MemoryRouter; mock `labelPrefsService.getLabelPrintingPrefs` to defaults):

```tsx
it('seeds from the tenant design and prints an edited one-off config', async () => {
  const onPrint = vi.fn();
  render(dialog({ entity: 'case', onPrint }));
  expect(await screen.findByLabelText(/label stock/i)).toHaveValue('nb_15x26');
  fireEvent.change(screen.getByLabelText(/label stock/i), { target: { value: 'zebra_2x1' } });
  fireEvent.change(screen.getByLabelText(/copies/i), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
  expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ sizeId: 'zebra_2x1', copies: 3, showQr: true }));
});
it('clamps copies to 1–20', ...);
it('disables the barcode toggle on narrow stock and re-enables on wide', ...);
it('Cancel closes without printing', ...);
```

- [x] Run tests → FAIL (components missing); implement; run → PASS; commit `feat(labels): print-time override dialog (one-off config, nothing persisted)`.

### Task 7: Wire CaseDetail + PrintLabelPage

**Files:**
- Modify: `src/pages/cases/CaseDetail.tsx` (:199 `handlePrintLabel`, :427 toolbar)
- Modify: `src/pages/print/PrintLabelPage.tsx`

- [x] CaseDetail: add `const [printOptionsOpen, setPrintOptionsOpen] = useState(false)`; adjacent icon Button (`SlidersHorizontal`, `aria-label="Print label with options"`) → open dialog; `onPrint={(config) => { setPrintOptionsOpen(false); runPrint({ config }); }}` where `runPrint(opts)` is the existing handler body parameterized (same toasts/busy state).
- [x] PrintLabelPage: "Print options…" secondary button next to Retry/Download opening the same dialog (entity `case`), confirm → `printCaseLabels(caseId, { config })`.
- [x] `npm run typecheck` → 0; manual assertion via tests where the pages have suites; commit.

### Task 8: Wire stock PrintLabelsModal (inline)

**Files:**
- Modify: `src/components/stock/PrintLabelsModal.tsx` (state + section above footer, `handlePrint`/download at :68/:188-207 pass `{ config }`)

- [x] Seed overrides from tenant stock config on open (same query); render `<LabelPrintOptionsFields>` in a bordered "This print" section; Print & Download pass `config: { ...tenantConfig, ...overrides }`. Existing modal tests updated if present; commit.

### Task 9: Wire InventoryDetailModal

**Files:**
- Modify: `src/components/inventory/InventoryDetailModal.tsx` (:84-92 handler, :250 headerAction)

- [x] Keep instant "Print Label"; add adjacent options icon button → `LabelPrintDialog entity="inventory"` → `printInventoryLabels([item], { config })` with the modal's existing toast handling. Commit.

### Task 10: Verification (gate)

- [x] `npm run typecheck` un-piped → 0 errors.
- [x] `npx vitest run src/components/labels src/pages/settings src/lib/pdf/labels src/components/stock/PrintLabelsModal.test.tsx` → PASS.
- [x] Full `npx vitest run` → only the 2 known `chainOfCustodyParity` failures.
- [x] `npx eslint` on touched files → clean.
- [x] Multi-lens adversarial review of the branch diff; fix confirmed findings; push; open PR (owner merges).

## Self-review notes

- Spec coverage: WP-1 (Tasks 2–5), WP-2 (Tasks 6–9), shared foundation (Task 1), gates (Task 10). Auto-print paths listed in Global Constraints are consciously untouched.
- Type consistency: `LabelEntityConfig` (existing) is the confirm payload; `LabelPrintOverrides` is the dialog-local editable subset; `LabelPrintOptions.config` (existing) is the transport. No new service surface.
- Known seam: `DocumentTemplatesPage.test.tsx` goes red between Tasks 2 and 4 — acceptable inside one PR; final gate is Task 10.
