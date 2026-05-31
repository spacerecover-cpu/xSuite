# UI Library Hardening — Phase 1 (Overlays) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the four overlay components (`Modal`, `ConfirmDialog`, `PhotoViewerModal`, `ImageCropModal`) onto the Phase 0 `<Dialog>` primitive — gaining portal + focus-trap + dialog-a11y + topmost-Escape + ref-counted scroll-lock — while preserving every public prop API so all 92 + 11 + 1 + 1 consumers compile unchanged.

**Architecture:** Each overlay keeps its exact props; internals render `<Dialog>` + chrome. `Dialog` gains two additive className escape hatches (`overlayClassName`, `backdropClassName`) for the dark lightbox. Three consumers that hand-roll a *second* overlay inside `<Modal>` (Quote/Invoice catalog pickers, Email PDF preview) are converted to stacked `<Dialog>`s so the new focus trap doesn't block them. New `ui.*` i18n keys (en + ar) back the component copy. jsdom + Testing Library behavior tests (the Phase 0 harness) lock each refactor incl. stacked cases.

**Tech Stack:** React 19 (ref-as-prop, `useId`), TypeScript strict (`tsc=0`), Tailwind v3.4 semantic tokens, react-i18next, react-easy-crop, Vitest 4 (node + jsdom projects), lucide-react.

**Source spec:** `docs/superpowers/specs/2026-05-30-ui-library-hardening-phase1-design.md`

**Conventions:** This is the `feat/ui-library-hardening-phase1` branch (stacked on Phase 0). Stage ONLY the files each task names; never touch the pre-existing unrelated WIP (`.claude/settings.local.json`, `.mcp.json`, `supabase/.temp/cli-latest`, `docs/architecture-audit-2026-05-29.md`, `docs/superpowers/handoff.md`). Every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Run dom tests with `npx vitest run <path.test.tsx>`. Neutral `text-slate-*`/`bg-slate-*` are ALLOWED utility neutrals (CLAUDE.md) and there is NO `surface-foreground` token — do not "tokenize" neutral text.

---

## File Structure

| File | Change | Task |
|---|---|---|
| `src/components/ui/Dialog.tsx` | add `overlayClassName?` + `backdropClassName?` | 1 |
| `src/components/ui/Dialog.test.tsx` | add tests for the two new props | 1 |
| `src/lib/i18n.ts` | add `ui.*` keys (en + ar) | 2 |
| `src/lib/i18n.test.tsx` | assert the new keys | 2 |
| `src/components/ui/Modal.tsx` | rewrite onto `<Dialog>` | 3 |
| `src/components/ui/Modal.test.tsx` | new behavior tests | 3 |
| `src/components/cases/QuoteFormModal.tsx` | catalog picker → stacked `<Dialog>` | 4 |
| `src/components/cases/InvoiceFormModal.tsx` | catalog picker → stacked `<Dialog>` | 4 |
| `src/components/cases/EmailDocumentModal.tsx` | PDF preview → stacked `<Dialog>` | 5 |
| `src/components/ui/ConfirmDialog.tsx` | rewrite onto `<Dialog>` | 6 |
| `src/components/ui/ConfirmDialog.test.tsx` | new behavior tests | 6 |
| `src/components/ui/PhotoViewerModal.tsx` | rewrite onto `<Dialog>` (lightbox) | 7 |
| `src/components/ui/PhotoViewerModal.test.tsx` | new behavior tests | 7 |
| `src/components/ui/ImageCropModal.tsx` | harden (keeps `<Modal>`) | 8 |
| `src/components/ui/ImageCropModal.test.tsx` | new behavior tests | 8 |
| `src/components/ui/Modal.stacked.test.tsx` | stacked-overlay tests | 9 |

---

### Task 1: Dialog escape hatches (`overlayClassName` + `backdropClassName`)

**Files:** Modify `src/components/ui/Dialog.tsx`; Modify `src/components/ui/Dialog.test.tsx`.

- [ ] **Step 1: Add failing tests** — append inside the existing `describe('Dialog', …)` block in `src/components/ui/Dialog.test.tsx`:

```tsx
  it('applies overlayClassName to the outer wrapper (z-index override wins)', () => {
    render(<Dialog open onClose={() => {}} label="T" overlayClassName="z-[60]"><button>x</button></Dialog>);
    const wrapper = screen.getByTestId('dialog-backdrop').parentElement as HTMLElement;
    expect(wrapper).toHaveClass('z-[60]');
    expect(wrapper).not.toHaveClass('z-50');
  });

  it('applies backdropClassName, overriding the default scrim', () => {
    render(<Dialog open onClose={() => {}} label="T" backdropClassName="bg-black/90 backdrop-blur-sm"><button>x</button></Dialog>);
    const backdrop = screen.getByTestId('dialog-backdrop');
    expect(backdrop).toHaveClass('bg-black/90', 'backdrop-blur-sm');
    expect(backdrop).not.toHaveClass('bg-black/50');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/Dialog.test.tsx`
Expected: FAIL (props not applied; `z-50`/`bg-black/50` still present).

- [ ] **Step 3: Implement** — in `src/components/ui/Dialog.tsx`, add the two props to `DialogProps` (after `className?: string;`):

```tsx
  overlayClassName?: string;
  backdropClassName?: string;
```

Add them to the destructured params (after `className,`):

```tsx
  overlayClassName,
  backdropClassName,
```

Then wrap the outer wrapper and backdrop classes with `cn(...)` (they are currently literal strings):

```tsx
  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center', overlayClassName)}>
      <div
        data-testid="dialog-backdrop"
        className={cn('absolute inset-0 bg-black/50', backdropClassName)}
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
```

(Leave the panel `<div ref={panelRef} … className={cn('relative z-10 …', className)}>` unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ui/Dialog.test.tsx`
Expected: PASS (all prior Dialog tests + the 2 new ones).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect 0).
```bash
git add src/components/ui/Dialog.tsx src/components/ui/Dialog.test.tsx
git commit -m "feat(ui): add overlayClassName/backdropClassName escape hatches to Dialog" -m "Additive optional props (merged via cn) so consumers can override the outer wrapper z-index and the backdrop scrim — needed by the photo lightbox. Defaults unchanged." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ui.*` i18n keys (en + ar)

**Files:** Modify `src/lib/i18n.ts`; Modify `src/lib/i18n.test.tsx`.

- [ ] **Step 1: Add failing tests** — append a new `describe` block in `src/lib/i18n.test.tsx`:

```tsx
describe('phase 1 overlay ui keys', () => {
  it('resolves new overlay keys in English', () => {
    expect(i18n.t('ui.dialog')).toBe('Dialog');
    expect(i18n.t('ui.cropImage')).toBe('Crop Image');
    expect(i18n.t('ui.applyCrop')).toBe('Apply Crop');
    expect(i18n.t('ui.photoViewerClose')).toBe('Close photo viewer');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/i18n.test.tsx`
Expected: FAIL (keys return their literal key strings).

- [ ] **Step 3: Add the EN keys** — in `src/lib/i18n.ts`, inside the existing `resources.en.translation.ui` object, add these entries (alongside `noData` etc.):

```ts
        dialog: 'Dialog',
        photoViewerTitle: 'Photo viewer',
        photoViewerClose: 'Close photo viewer',
        photoViewerDefaultAlt: 'Full size photo',
        photoViewerHint: 'Press <bold>ESC</bold> or click outside to close',
        cropImage: 'Crop Image',
        zoom: 'Zoom',
        rotation: 'Rotation',
        rotate90: 'Rotate 90°',
        current: 'Current',
        applyCrop: 'Apply Crop',
        cropping: 'Cropping...',
```

- [ ] **Step 4: Add the AR keys** — inside `resources.ar.translation.ui`, add:

```ts
        dialog: 'مربع حوار',
        photoViewerTitle: 'عارض الصور',
        photoViewerClose: 'إغلاق عارض الصور',
        photoViewerDefaultAlt: 'صورة بالحجم الكامل',
        photoViewerHint: 'اضغط <bold>ESC</bold> أو انقر خارجها للإغلاق',
        cropImage: 'اقتصاص الصورة',
        zoom: 'تكبير',
        rotation: 'تدوير',
        rotate90: 'تدوير 90°',
        current: 'الحالي',
        applyCrop: 'تطبيق الاقتصاص',
        cropping: 'جاري الاقتصاص...',
```

- [ ] **Step 5: Run + typecheck + commit**

Run: `npx vitest run src/lib/i18n.test.tsx` (PASS), then `npm run typecheck` (0).
```bash
git add src/lib/i18n.ts src/lib/i18n.test.tsx
git commit -m "feat(ui): add Phase 1 overlay ui.* i18n keys (en + ar)" -m "dialog, photoViewer*, cropImage, zoom, rotation, rotate90, current, applyCrop, cropping. photoViewerHint carries a <bold> tag for a <Trans> emphasis on ESC." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Modal refactor onto `<Dialog>`

**Files:** Create `src/components/ui/Modal.test.tsx`; Modify `src/components/ui/Modal.tsx` (full rewrite).

- [ ] **Step 1: Write failing tests** — create `src/components/ui/Modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Settings"><p>body</p></Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a labelled dialog with the title wired to aria-labelledby', () => {
    render(<Modal isOpen onClose={() => {}} title="Settings"><p>body</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('with empty title renders no header but keeps a labelled floating close button', () => {
    render(<Modal isOpen onClose={() => {}} title=""><p>body</p></Modal>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('hides every close button when showCloseButton is false', () => {
    render(<Modal isOpen onClose={() => {}} title="Forced" showCloseButton={false}><p>body</p></Modal>);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('applies the wide maxWidth class to the panel (overrides Dialog default)', () => {
    render(<Modal isOpen onClose={() => {}} title="Wide" maxWidth="7xl"><p>body</p></Modal>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-7xl');
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-lg');
  });

  it('maps the non-standard size="large" to max-w-4xl', () => {
    render(<Modal isOpen onClose={() => {}} title="Lg" size="large"><p>body</p></Modal>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-4xl');
  });

  it('calls onClose from the header close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal isOpen onClose={onClose} title="X"><p>body</p></Modal>);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/Modal.test.tsx`
Expected: FAIL — the current Modal renders no `role="dialog"`, has no `aria-labelledby`, and the close button has no accessible name.

- [ ] **Step 3: Rewrite `src/components/ui/Modal.tsx` entirely**:

```tsx
import { useId, type ReactNode, type ElementType } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'large' | '2xl';
  maxWidth?: '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  icon?: ElementType;
  headerAction?: ReactNode;
  headerBadges?: ReactNode;
  showCloseButton?: boolean;
  ariaLabel?: string;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  xs: 'max-w-sm',
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  large: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

const maxWidthClasses: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  maxWidth,
  icon: Icon,
  headerAction,
  headerBadges,
  showCloseButton = true,
  ariaLabel,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const widthClass = maxWidth ? maxWidthClasses[maxWidth] : sizeClasses[size];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      label={title ? undefined : ariaLabel ?? t('ui.dialog')}
      closeOnBackdrop
      closeOnEscape
      className={cn(widthClass, 'flex flex-col overflow-hidden p-0')}
    >
      {title ? (
        <div className="no-print flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
            {headerBadges && <div className="flex items-center gap-2 ml-2">{headerBadges}</div>}
          </div>
          <div className="flex items-center gap-2">
            {headerAction && <div>{headerAction}</div>}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label={t('ui.close')}
                className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        showCloseButton && (
          <button
            onClick={onClose}
            aria-label={t('ui.close')}
            className="no-print absolute top-3 right-3 z-10 p-1.5 hover:bg-surface-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )
      )}
      <div className="p-4 overflow-y-auto flex-1">{children}</div>
    </Dialog>
  );
}
```

Notes: `cn(widthClass, 'flex flex-col overflow-hidden p-0')` rides on the fixed `cn`/twMerge so `widthClass` beats Dialog's `max-w-lg` and `overflow-hidden` beats Dialog's `overflow-y-auto` (the body div scrolls instead). The header is gated on a **truthy** `title`, preserving the `title=""`→no-header behavior (and the PaymentReceiptModal quirk where a `headerAction` with empty title stays hidden).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ui/Modal.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck (verify all 92 consumers compile) + commit**

Run: `npm run typecheck` (expect 0 — proves the unchanged public API still satisfies every consumer).
```bash
git add src/components/ui/Modal.tsx src/components/ui/Modal.test.tsx
git commit -m "refactor(ui): render Modal on the Dialog primitive" -m "Modal now delegates portal/backdrop/scroll-lock/Escape/focus-trap/aria to <Dialog>; deletes its two hand-rolled effects, backdrop, and panel. Public ModalProps unchanged (+1 optional ariaLabel for title-less modals). Title wired to aria-labelledby via useId; close buttons labelled; surfaces tokenized (border-border/bg-surface-muted)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Convert Quote/Invoice catalog pickers to stacked `<Dialog>`

**Why:** Both render a hand-rolled `fixed inset-0 z-50` catalog picker INSIDE `<Modal>`. Now that Modal portals + focus-traps, that picker sits outside the dialog panel and the trap blocks its inputs. Converting each to its own `<Dialog>` makes it a proper stacked overlay (Dialog's ref-count + topmost-Escape coordinate it with the parent).

**Files:** Modify `src/components/cases/QuoteFormModal.tsx`; Modify `src/components/cases/InvoiceFormModal.tsx`.

- [ ] **Step 1: QuoteFormModal — add the Dialog import**

In `src/components/cases/QuoteFormModal.tsx`, ensure `import { Dialog } from '../ui/Dialog';` is present (add it next to the existing `Modal` import).

- [ ] **Step 2: QuoteFormModal — replace the picker wrapper**

Find the catalog block (around line 849):
```tsx
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCatalog(false)}>
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div
            className="relative bg-white rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* …catalog header / search / list … (KEEP ALL OF THIS) */}
          </div>
        </div>
      )}
```
Replace ONLY the three wrapper `<div>`s (the `fixed inset-0` wrapper, the backdrop `<div>`, and the panel `<div>` with its `onClick` stopPropagation) so the block becomes:
```tsx
      <Dialog
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        label={t('ui.dialog')}
        className="max-w-2xl flex flex-col overflow-hidden p-0"
      >
        {/* …the SAME catalog header / search / list children, unchanged… */}
      </Dialog>
```
Preserve every child element inside the old panel `<div>` verbatim (header, search input, items list, any footer). Delete the old `onClick={() => setShowCatalog(false)}` outer handler and the inner `onClick={(e) => e.stopPropagation()}` — Dialog owns backdrop-close. If the file does not already destructure `t` from `useTranslation`, add `const { t } = useTranslation();` (import from `react-i18next`); if a translation hook isn't desired here, pass `label="Catalog"` literally instead.

- [ ] **Step 3: InvoiceFormModal — repeat the identical change** at its catalog block (around line 991 — same three wrapper divs, same `max-w-2xl` panel). Apply the exact same replacement as Step 2.

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run typecheck` (expect 0). Run `npm run lint` and confirm no new errors in these two files.

- [ ] **Step 5: Commit**

```bash
git add src/components/cases/QuoteFormModal.tsx src/components/cases/InvoiceFormModal.tsx
git commit -m "fix(ui): convert Quote/Invoice catalog pickers to stacked Dialogs" -m "Their hand-rolled nested overlays sat outside the parent Modal's panel; once Modal focus-traps, the trap blocked the picker inputs. Rendering them as <Dialog> makes them proper topmost stacked overlays (ref-counted scroll-lock + topmost Escape)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Convert EmailDocumentModal PDF preview to a stacked `<Dialog>`

**Files:** Modify `src/components/cases/EmailDocumentModal.tsx`.

- [ ] **Step 1: Add the Dialog import** — ensure `import { Dialog } from '../ui/Dialog';` is present.

- [ ] **Step 2: Replace the preview wrapper** — find the preview block (around line 322):
```tsx
      {showPdfPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShowPdfPreview(false)}>
          <div className="fixed inset-0 bg-black bg-opacity-70" />
          <div
            className="relative bg-white rounded-lg shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* …preview chrome + iframe/pdf… (KEEP) */}
          </div>
        </div>
      )}
```
Replace the three wrapper `<div>`s with a `<Dialog>` that preserves the higher z-index and darker scrim via the new escape hatches:
```tsx
      <Dialog
        open={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        label={t('ui.dialog')}
        overlayClassName="z-[60]"
        backdropClassName="bg-black/70"
        className="max-w-7xl flex flex-col overflow-hidden p-0"
      >
        {/* …the SAME preview children, unchanged… */}
      </Dialog>
```
Keep all inner children verbatim; remove the outer/inner `onClick` handlers. Add `const { t } = useTranslation();` if not present (or pass `label="Preview"`).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` (0); `npm run lint` (no new errors in this file).

- [ ] **Step 4: Commit**

```bash
git add src/components/cases/EmailDocumentModal.tsx
git commit -m "fix(ui): convert EmailDocumentModal PDF preview to a stacked Dialog" -m "Preserves the z-[60] + darker scrim via Dialog's new overlayClassName/backdropClassName, and gets focus-trap + topmost-Escape coordination with the parent Modal." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ConfirmDialog refactor onto `<Dialog>`

**Files:** Create `src/components/ui/ConfirmDialog.test.tsx`; Modify `src/components/ui/ConfirmDialog.tsx` (full rewrite).

- [ ] **Step 1: Write failing tests** — create `src/components/ui/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

const base = { isOpen: true, onClose: vi.fn(), onConfirm: vi.fn(), title: 'Delete item?', message: 'This cannot be undone.' };

describe('ConfirmDialog', () => {
  it('labels the dialog by its title', () => {
    render(<ConfirmDialog {...base} />);
    const heading = screen.getByRole('heading', { name: 'Delete item?' });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('fires onConfirm and onClose from the right buttons', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onClose={onClose} confirmText="Delete" />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the processing label and blocks Escape while loading', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...base} onClose={onClose} isLoading confirmText="Delete" />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tints the confirm button with the danger tone tokens', () => {
    render(<ConfirmDialog {...base} confirmText="Delete" variant="danger" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-danger', 'text-danger-foreground');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/ConfirmDialog.test.tsx`
Expected: FAIL (no `role="dialog"`/`aria-labelledby`; confirm button uses `text-white` not the tone tokens; Escape isn't handled).

- [ ] **Step 3: Rewrite `src/components/ui/ConfirmDialog.tsx` entirely**:

```tsx
import { useId } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { STATUS_TONE } from '../../lib/ui/variants';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const iconBadge: Record<NonNullable<ConfirmDialogProps['variant']>, string> = {
  danger: 'bg-danger-muted text-danger',
  warning: 'bg-warning-muted text-warning',
  info: 'bg-info-muted text-info',
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      className="max-w-md p-6"
    >
      <button
        onClick={onClose}
        disabled={isLoading}
        aria-label={t('ui.close')}
        className="absolute top-4 right-4 p-1 hover:bg-surface-muted rounded transition-colors disabled:opacity-50"
      >
        <X className="w-5 h-5 text-slate-400" />
      </button>

      <div className="flex items-start gap-4">
        <div className={cn('p-3 rounded-full', iconBadge[variant])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 pt-1">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-600 mb-6">{message}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              {cancelText ?? t('common.cancel')}
            </Button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={cn('px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 hover:opacity-90', STATUS_TONE[variant])}
            >
              {isLoading ? t('ui.processing') : confirmText ?? t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ui/ConfirmDialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (0).
```bash
git add src/components/ui/ConfirmDialog.tsx src/components/ui/ConfirmDialog.test.tsx
git commit -m "refactor(ui): render ConfirmDialog on the Dialog primitive" -m "Deletes the hand-rolled overlay; gains dialog a11y + focus trap + topmost Escape (gated by !isLoading). Confirm button uses the shared STATUS_TONE tokens; defaults routed through t(); React.FC dropped (React 19)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: PhotoViewerModal refactor (dark lightbox)

**Files:** Create `src/components/ui/PhotoViewerModal.test.tsx`; Modify `src/components/ui/PhotoViewerModal.tsx` (full rewrite).

- [ ] **Step 1: Write failing tests** — create `src/components/ui/PhotoViewerModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoViewerModal } from './PhotoViewerModal';

describe('PhotoViewerModal', () => {
  it('renders a labelled lightbox with a darker scrim and raised z-index', () => {
    render(<PhotoViewerModal isOpen onClose={() => {}} imageUrl="/x.jpg" altText="Jane profile photo" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Jane profile photo');
    const backdrop = screen.getByTestId('dialog-backdrop');
    expect(backdrop).toHaveClass('bg-black/90');
    expect(backdrop.parentElement).toHaveClass('z-[60]');
  });

  it('shows the image and does not close when the image is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PhotoViewerModal isOpen onClose={onClose} imageUrl="/x.jpg" altText="Photo" />);
    await user.click(screen.getByRole('img', { name: 'Photo' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<PhotoViewerModal isOpen={false} onClose={() => {}} imageUrl="/x.jpg" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/PhotoViewerModal.test.tsx`
Expected: FAIL (no `role="dialog"`, no `bg-black/90` backdrop testid, no `z-[60]` wrapper from Dialog).

- [ ] **Step 3: Rewrite `src/components/ui/PhotoViewerModal.tsx` entirely**:

```tsx
import { X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  altText?: string;
}

export function PhotoViewerModal({ isOpen, onClose, imageUrl, altText }: PhotoViewerModalProps) {
  const { t } = useTranslation();
  const alt = altText ?? t('ui.photoViewerDefaultAlt');

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      closeOnBackdrop
      closeOnEscape
      label={alt}
      overlayClassName="z-[60]"
      backdropClassName="bg-black/90 backdrop-blur-sm"
      className="bg-transparent shadow-none max-w-7xl w-auto overflow-visible p-0"
    >
      <button
        onClick={onClose}
        aria-label={t('ui.photoViewerClose')}
        className="absolute -top-3 -right-3 z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all backdrop-blur-sm group"
      >
        <X className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
      </button>

      <img
        src={imageUrl}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full object-contain rounded-lg shadow-2xl"
        style={{ maxHeight: '90vh' }}
      />

      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
        <div className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
          <p className="text-white text-sm font-medium">
            <Trans i18nKey="ui.photoViewerHint" components={{ bold: <span className="font-bold" /> }} />
          </p>
        </div>
      </div>
    </Dialog>
  );
}
```

Notes: the white-on-black chrome (`bg-white/10`, `text-white`) and `bg-black/90` scrim are **intentional** theme-neutral lightbox styling (like PDFs) — do NOT tokenize. `React.FC` is gone (plain function, React 19). The close button + hint are positioned relative to the (now transparent, content-sized) Dialog panel via negative offsets so they sit just outside the image.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ui/PhotoViewerModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (0).
```bash
git add src/components/ui/PhotoViewerModal.tsx src/components/ui/PhotoViewerModal.test.tsx
git commit -m "refactor(ui): render PhotoViewerModal on Dialog (dark lightbox)" -m "Uses Dialog's overlayClassName=z-[60] + backdropClassName=bg-black/90 to preserve the lightbox scrim/stacking; transparent content-sized panel. Fixes the React.FC-without-import; i18n the 3 strings (Trans keeps the bold ESC). White-on-black chrome intentionally not tokenized." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: ImageCropModal hardening (keeps `<Modal>`)

**Files:** Create `src/components/ui/ImageCropModal.test.tsx`; Modify `src/components/ui/ImageCropModal.tsx`.

- [ ] **Step 1: Write failing tests** — create `src/components/ui/ImageCropModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-easy-crop', () => ({ default: () => null }));

import { ImageCropModal } from './ImageCropModal';

describe('ImageCropModal', () => {
  it('renders the crop dialog with a labelled zoom-out button and a labelled range input', () => {
    render(<ImageCropModal isOpen onClose={() => {}} imageUrl="blob:x" onCropComplete={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Crop Image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
  });

  it('shows an inline error when cropping fails', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<ImageCropModal isOpen onClose={() => {}} imageUrl="blob:bad" onCropComplete={() => {}} />);
    await user.click(screen.getByRole('button', { name: /apply crop/i }));
    expect(await screen.findByText(/could not crop/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ui/ImageCropModal.test.tsx`
Expected: FAIL (zoom buttons have no accessible name; range input not labelled; no error state).

- [ ] **Step 3: Harden `src/components/ui/ImageCropModal.tsx`** — apply these focused edits (keep the crop/canvas math byte-for-byte):

(a) Imports + hooks: add `import { useId, useState } from 'react'` (extend the existing import), `import { useTranslation } from 'react-i18next'`. Drop `React.FC`: change the signature to `export function ImageCropModal({ … }: ImageCropModalProps) {`. Inside, add `const { t } = useTranslation();`, `const zoomId = useId();`, and `const [cropError, setCropError] = useState<string | null>(null);`.

(b) Title: change `<Modal isOpen={isOpen} onClose={onClose} title="Crop Image" size="large">` to `title={t('ui.cropImage')}`.

(c) handleCrop catch — surface the error:
```tsx
    } catch (error) {
      logger.error('Error cropping image:', error);
      setCropError(t('ui.cropFailed'));
    } finally {
      setIsCropping(false);
    }
```
Also clear it at the start of `handleCrop`: add `setCropError(null);` as the first line inside the `try`. Add the EN key `cropFailed: 'Could not crop the image. Please try again.'` and AR `cropFailed: 'تعذّر اقتصاص الصورة. حاول مرة أخرى.'` to `src/lib/i18n.ts` `ui` blocks.

(d) Zoom buttons — add accessible names and tokenize hover:
```tsx
              <button type="button" onClick={handleZoomOut} aria-label={t('ui.zoomOut')} className="p-2 hover:bg-surface-muted rounded-lg transition-colors" disabled={zoom <= 1}>
```
and the zoom-in button `aria-label={t('ui.zoomIn')}` with the same `hover:bg-surface-muted`. Add EN keys `zoomOut: 'Zoom out'`, `zoomIn: 'Zoom in'` (AR: `'تصغير'`, `'تكبير'`).

(e) Range input — associate with its label and tokenize the track:
```tsx
            <label htmlFor={zoomId} className="block text-sm font-medium text-slate-700 mb-2">{t('ui.zoom')}</label>
            …
              <input id={zoomId} aria-label={t('ui.zoom')} type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 h-2 bg-surface-muted rounded-lg appearance-none cursor-pointer accent-primary" />
```

(f) Other copy + tokens: `Rotation`→`{t('ui.rotation')}`, `Rotate 90°`→`{t('ui.rotate90')}`, `Current: {rotation}°`→`{t('ui.current')}: {rotation}°`, `Cancel`→`{t('common.cancel')}`, `Apply Crop`/`Cropping...`→`{t('ui.applyCrop')}`/`{t('ui.cropping')}`. Swap `hover:bg-slate-100`→`hover:bg-surface-muted`, `bg-slate-100 hover:bg-slate-200`→`bg-surface-muted hover:bg-surface-muted`, the footer `border-t`→`border-t border-border`. **Keep** `bg-slate-900` behind the `<Cropper>` and the neutral `text-slate-*` label/glyph colors.

(g) Render the error inline (above the footer): `{cropError && <p className="text-sm text-danger" role="alert">{cropError}</p>}`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ui/ImageCropModal.test.tsx`
Expected: PASS (2 tests). (The `getCroppedImg` path throws on the mocked image load → the error state shows.)

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (0).
```bash
git add src/components/ui/ImageCropModal.tsx src/components/ui/ImageCropModal.test.tsx src/lib/i18n.ts
git commit -m "feat(ui): harden ImageCropModal (a11y, i18n, surfaced crop errors)" -m "Inherits the Dialog overlay via Modal; adds aria-labels to zoom buttons, associates the range input with its label, surfaces the previously-silent crop catch as an inline error, i18ns all copy, tokenizes hovers/track (keeps the intentional dark bg-slate-900 cropper bg), and drops React.FC." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Stacked-overlay tests + full verification

**Files:** Create `src/components/ui/Modal.stacked.test.tsx`.

- [ ] **Step 1: Write the stacked test**:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

describe('stacked overlays', () => {
  it('Escape closes the topmost (ConfirmDialog) not the underlying Modal, and keeps body scroll locked', async () => {
    const onCloseModal = vi.fn();
    const onCloseConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Modal isOpen onClose={onCloseModal} title="Parent"><p>parent body</p></Modal>
        <ConfirmDialog isOpen onClose={onCloseConfirm} onConfirm={() => {}} title="Sure?" message="Confirm." />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(onCloseConfirm).toHaveBeenCalledTimes(1);
    expect(onCloseModal).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden'); // parent Modal still open
  });
});
```

- [ ] **Step 2: Run the stacked test**

Run: `npx vitest run src/components/ui/Modal.stacked.test.tsx`
Expected: PASS (Dialog's `dialogStack` makes the later-mounted ConfirmDialog topmost; ref-counted lock keeps `overflow:hidden`).

- [ ] **Step 3: Full suite + gates**

Run:
```bash
npm test
npm run typecheck
npm run lint
```
Expected: all test files green (Phase 0 + Phase 1, both projects); `tsc` 0; lint 0 errors (pre-existing warnings only; none in Phase 1 files).

- [ ] **Step 4: Confirm acceptance criteria** (spec §11):
1. Dialog gained `overlayClassName`/`backdropClassName`; old + new Dialog tests pass. ✓
2. Modal/ConfirmDialog/PhotoViewerModal refactored; ImageCropModal hardened; public APIs unchanged (+1 optional `ariaLabel` on Modal). ✓
3. Quote/Invoice/Email nested overlays converted; stacked test passes. ✓
4. New `ui.*` keys added (en+ar); component copy via `t()`. ✓
5. All tests pass; typecheck 0; lint clean for Phase 1 files; lightbox/cropper neutrals intentionally preserved. ✓
6. 92 Modal + 11 ConfirmDialog consumers compile unchanged (proved by `tsc=0`). ✓

- [ ] **Step 5: Commit (only if a verification fix was needed)**

```bash
git add -A -- src/
git commit -m "test(ui): stacked-overlay coverage + Phase 1 verification" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Otherwise Phase 1 is complete — no extra commit.

---

## Self-Review

**Spec coverage:** Dialog enhancement → T1; i18n keys → T2 (+ `cropFailed` in T8); Modal refactor (+edge cases, width map, ariaLabel) → T3; consumer nested-overlay fixes (Quote/Invoice → T4, Email → T5, CategoryManager+crop-in-edit stacking validated → T9 + manual); ConfirmDialog → T6; PhotoViewerModal lightbox (+React import, Trans) → T7; ImageCropModal hardening (a11y, silent-catch, tokens, React import) → T8; testing strategy → per-task tests + T9; backward-compat/sequencing → task order + `tsc=0` gates. All spec §4 items mapped.

**Placeholder scan:** every code step has complete code; consumer-transform steps show exact before/after wrapper lines and name the inner content to preserve (a legitimate refactor instruction, not a placeholder). Commands list expected output.

**Type consistency:** `ModalProps` (11 + `ariaLabel`), `ConfirmDialogProps`, `PhotoViewerModalProps`, `ImageCropModalProps` match their current public shapes; `STATUS_TONE[variant]` keys (`danger|warning|info`) align with `ConfirmDialogProps.variant`; `Dialog` new props (`overlayClassName`/`backdropClassName`) used consistently in T1/T5/T7; `ui.*` key names consistent between T2/T8 additions and their consumers.

**Note for executor:** Tasks 4/5 modify large existing consumer files — read the full nested block before replacing the wrapper, and preserve all inner children verbatim. After T3–T8, manually smoke-test in the running app: open a form modal's catalog picker (focus reaches the inputs), open the Edit-Customer → crop flow (crop modal stacks above, Escape closes crop first, body stays locked, focus restores), and the photo lightbox.
