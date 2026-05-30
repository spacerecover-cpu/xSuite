# UI Library Hardening — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared foundation (correct `cn`, focus-trap hook, `Dialog`/`Spinner`/`Skeleton` primitives, cva status-tone map, `ui.*` i18n keys, and a jsdom test harness) that Phases 1–3 of the UI hardening program sit on — with zero changes to any existing component's public API.

**Architecture:** Additive infrastructure only. Replace the broken hand-rolled `cn()` with `clsx`+`tailwind-merge`; add small, single-responsibility hooks/primitives under `src/hooks/` and `src/components/ui/`; stand up a second Vitest project (`jsdom` + Testing Library) for `.test.tsx` without touching the existing node-only pure-logic project. Every new primitive follows the locked conventions (semantic tokens only, `focus-visible` rings, React-19 ref-as-prop, `motion-safe`/`motion-reduce`).

**Tech Stack:** React 19, TypeScript (strict, `tsc=0` enforced), Tailwind v3.4 (semantic token system), Vitest 4, i18next/react-i18next, lucide-react.

**Source spec:** `docs/superpowers/specs/2026-05-30-ui-library-hardening-phase0-design.md`

**Convention for all commits below:** each `git commit` ends with the trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `package.json` / `package-lock.json` | add `clsx`, `tailwind-merge`, `class-variance-authority` (deps); `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` (devDeps) | 1 |
| `vitest.config.ts` (modify) | split into two projects: `node` (existing `.test.ts` pure logic) + `dom` (`jsdom`, `.test.tsx`) | 2 |
| `src/test/setup.ts` (create) | DOM test setup: jest-dom matchers + i18n init | 2 |
| `src/test/harness.test.tsx` (create) | smoke test proving the jsdom harness works | 2 |
| `src/lib/utils.ts` (replace body) | correct `cn()` = `twMerge(clsx(...))` | 3 |
| `src/lib/utils.test.ts` (create) | `cn` conflict-resolution tests (node) | 3 |
| `src/hooks/useFocusTrap.ts` (create) | trap/restore focus within a container | 4 |
| `src/hooks/useFocusTrap.test.tsx` (create) | focus-trap behavior tests (jsdom) | 4 |
| `src/components/ui/Dialog.tsx` (create) | portal overlay: role=dialog, focus trap, scroll-lock, Escape | 5 |
| `src/components/ui/Dialog.test.tsx` (create) | Dialog a11y/behavior tests (jsdom) | 5 |
| `src/components/ui/Spinner.tsx` (create) | accessible loading spinner | 6 |
| `src/components/ui/Skeleton.tsx` (create) | loading placeholder block | 6 |
| `src/components/ui/Spinner.test.tsx` (create) | Spinner + Skeleton tests (jsdom) | 6 |
| `src/lib/ui/variants.ts` (create) | `STATUS_TONE` / `STATUS_TONE_MUTED` token maps | 7 |
| `src/lib/ui/variants.test.ts` (create) | status-tone map tests (node) | 7 |
| `src/lib/i18n.ts` (modify) | add `ui.*` keys to `en` + `ar` | 8 |
| `src/lib/i18n.test.tsx` (create) | `ui.*` key resolution tests (jsdom) | 8 |

**Conventions are embodied, not a separate task:** the new primitives apply the focus-visible / ref-as-prop / reduced-motion conventions directly (Dialog uses `motion-safe:` + focus trap; Spinner uses `role="status"` + `motion-safe:animate-spin`).

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install clsx tailwind-merge@^2 class-variance-authority
```
Expected: `clsx`, `tailwind-merge` (a `2.x` version — v2 tracks Tailwind v3.4), and `class-variance-authority` appear under `dependencies` in `package.json`.

- [ ] **Step 2: Install dev dependencies (test harness)**

Run:
```bash
npm install -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```
Expected: all four appear under `devDependencies`.

- [ ] **Step 3: Verify the install is clean**

Run:
```bash
npm run typecheck
```
Expected: `tsc --noEmit` exits 0 (no new errors — nothing imports the new packages yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(ui): add clsx, tailwind-merge, cva + jsdom/testing-library deps" -m "Foundation deps for the UI hardening program: clsx + tailwind-merge (correct cn), class-variance-authority (typed variants), and a jsdom + Testing Library stack for DOM/hook tests." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stand up the jsdom test harness

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/harness.test.tsx`

- [ ] **Step 1: Replace `vitest.config.ts` with a two-project config**

Replace the entire file contents with:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two projects:
// - node: pure logic (.test.ts) — money math, status derivation, cn, variants. No DOM.
// - dom:  components/hooks (.test.tsx) — jsdom + Testing Library.
// Kept separate so the production build config (vite.config.ts) is untouched.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
```

- [ ] **Step 2: Create the DOM test setup file**

Create `src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import '../lib/i18n';
```

- [ ] **Step 3: Create a smoke test**

Create `src/test/harness.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

describe('jsdom test harness', () => {
  it('renders into jsdom and supports jest-dom matchers', () => {
    render(<button>click me</button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('click me')).toHaveTextContent('click me');
  });
});
```

- [ ] **Step 4: Run the smoke test to verify the harness works**

Run:
```bash
npx vitest run src/test/harness.test.tsx
```
Expected: PASS (1 test). Confirms jsdom environment, the React plugin, and jest-dom matchers all resolve.

- [ ] **Step 5: Verify both projects still run and typecheck is clean**

Run:
```bash
npm test
npm run typecheck
```
Expected: `npm test` runs both projects green (node project may have 0 tests, which is fine); `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/test/harness.test.tsx
git commit -m "test(ui): add jsdom + Testing Library project for component/hook tests" -m "Splits vitest into node (.test.ts pure logic) and dom (.test.tsx, jsdom) projects; the existing node project is unchanged. Adds setup (jest-dom matchers + i18n init) and a harness smoke test." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the keystone — `cn()`

**Files:**
- Create: `src/lib/utils.test.ts`
- Modify: `src/lib/utils.ts` (replace the broken implementation)

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('resolves conflicting spacing utilities to the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('resolves conflicting semantic surface tokens to the last one', () => {
    expect(cn('bg-surface', 'bg-surface-muted')).toBe('bg-surface-muted');
  });

  it('keeps independent edge utilities the old prefix-dedup dropped', () => {
    const result = cn('border-t', 'border-b');
    expect(result).toContain('border-t');
    expect(result).toContain('border-b');
  });

  it('preserves a variant-prefixed class alongside its base class', () => {
    expect(cn('bg-primary', 'hover:bg-primary')).toBe('bg-primary hover:bg-primary');
  });

  it('flattens conditional and array inputs', () => {
    expect(cn('text-sm', false, ['font-medium', null], undefined)).toBe('text-sm font-medium');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/utils.test.ts
```
Expected: FAIL. The current hand-rolled `cn` dedupes by last-dash prefix, so `cn('border-t','border-b')` collapses to one class and `cn('bg-surface','bg-surface-muted')` keeps both — both assertions fail.

- [ ] **Step 3: Replace `src/lib/utils.ts` with the correct implementation**

Replace the entire file contents with:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with correct Tailwind conflict resolution.
 * clsx flattens conditional/array inputs; tailwind-merge ensures the last
 * conflicting utility in a group wins (e.g. `px-2 px-4` -> `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/utils.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Verify no consumer broke and typecheck is clean**

Run:
```bash
npm run typecheck
```
Expected: 0 errors. (`cn`'s name and call signature are unchanged; the 3 existing callers are unaffected.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "fix(ui): replace broken cn() with clsx + tailwind-merge" -m "The hand-rolled cn() deduped by last-dash prefix, dropping/reordering classes (border-t/border-b collapsed, bg-surface/bg-surface-muted both kept). Now twMerge(clsx(...)) gives correct conflict resolution. Signature unchanged." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `useFocusTrap` hook

**Files:**
- Create: `src/hooks/useFocusTrap.test.tsx`
- Create: `src/hooks/useFocusTrap.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useFocusTrap.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

afterEach(cleanup);

function TrapHarness({ active }: { active: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>({ active });
  return (
    <div>
      <button>outside-before</button>
      <div ref={ref}>
        <button>first</button>
        <button>second</button>
        <button>third</button>
      </div>
      <button>outside-after</button>
    </div>
  );
}

function RestoreHarness() {
  const [open, setOpen] = useState(false);
  const ref = useFocusTrap<HTMLDivElement>({ active: open, restoreFocus: true });
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <div ref={ref}>
          <button onClick={() => setOpen(false)}>close</button>
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus to the first tabbable element when activated', () => {
    render(<TrapHarness active />);
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('wraps focus from last to first on Tab', async () => {
    const user = userEvent.setup();
    render(<TrapHarness active />);
    screen.getByText('third').focus();
    await user.tab();
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('wraps focus from first to last on Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<TrapHarness active />);
    screen.getByText('first').focus();
    await user.tab({ shift: true });
    expect(screen.getByText('third')).toHaveFocus();
  });

  it('does not manage focus when inactive', () => {
    render(<TrapHarness active={false} />);
    expect(screen.getByText('first')).not.toHaveFocus();
  });

  it('restores focus to the opener when deactivated', async () => {
    const user = userEvent.setup();
    render(<RestoreHarness />);
    const opener = screen.getByText('opener');
    await user.click(opener);
    expect(screen.getByText('close')).toHaveFocus();
    await user.click(screen.getByText('close'));
    expect(opener).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/hooks/useFocusTrap.test.tsx
```
Expected: FAIL with a module-resolution error (`useFocusTrap` does not exist yet).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useFocusTrap.ts`:
```ts
import { useEffect, useRef, type RefObject } from 'react';

const TABBABLE = [
  'a[href]:not([hidden])',
  'button:not([disabled]):not([hidden])',
  'input:not([disabled]):not([hidden])',
  'select:not([disabled]):not([hidden])',
  'textarea:not([disabled]):not([hidden])',
  '[tabindex]:not([tabindex="-1"]):not([hidden])',
].join(',');

interface UseFocusTrapOptions {
  active: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
}

/**
 * Trap keyboard focus within the returned container ref while `active`.
 * On activate: focuses initialFocusRef -> first tabbable -> the container.
 * On deactivate/unmount: optionally restores focus to the previously-focused element.
 */
export function useFocusTrap<T extends HTMLElement>({
  active,
  initialFocusRef,
  restoreFocus = true,
}: UseFocusTrapOptions): RefObject<T | null> {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const getTabbables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(TABBABLE));

    const initial = initialFocusRef?.current ?? getTabbables()[0] ?? container;
    if (initial === container) container.setAttribute('tabindex', '-1');
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const tabbables = getTabbables();
      if (tabbables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, initialFocusRef, restoreFocus]);

  return containerRef;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/hooks/useFocusTrap.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFocusTrap.ts src/hooks/useFocusTrap.test.tsx
git commit -m "feat(ui): add useFocusTrap hook" -m "Traps Tab/Shift+Tab focus within a container, moves focus in on activate, and restores focus to the opener on deactivate. Foundation for the Dialog overlay primitive." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `<Dialog>` overlay primitive

**Files:**
- Create: `src/components/ui/Dialog.test.tsx`
- Create: `src/components/ui/Dialog.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Dialog.test.tsx`:
```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Dialog open={false} onClose={() => {}} label="Test"><p>body</p></Dialog>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('portals a labelled modal dialog to the body when open', () => {
    render(<Dialog open onClose={() => {}} label="Settings"><p>body</p></Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Settings');
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('moves focus into the dialog on open', () => {
    render(<Dialog open onClose={() => {}} label="Test"><button>confirm</button></Dialog>);
    expect(screen.getByText('confirm')).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Dialog open onClose={onClose} label="Test"><button>ok</button></Dialog>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on backdrop click when closeOnBackdrop is true', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Dialog open onClose={onClose} label="Test"><button>ok</button></Dialog>);
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = render(<Dialog open onClose={() => {}} label="Test"><p>b</p></Dialog>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Dialog open={false} onClose={() => {}} label="Test"><p>b</p></Dialog>);
    expect(document.body.style.overflow).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/components/ui/Dialog.test.tsx
```
Expected: FAIL with a module-resolution error (`Dialog` does not exist yet).

- [ ] **Step 3: Implement the Dialog**

Create `src/components/ui/Dialog.tsx`:
```tsx
import { useEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { cn } from '../../lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  children: ReactNode;
}

let openDialogCount = 0;
const dialogStack: symbol[] = [];

export function Dialog({
  open,
  onClose,
  labelledBy,
  label,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  children,
}: DialogProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: open, initialFocusRef, restoreFocus: true });

  // Body scroll-lock with a ref-count so stacked dialogs don't unlock early.
  useEffect(() => {
    if (!open) return;
    openDialogCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = '';
    };
  }, [open]);

  // Escape closes only the topmost dialog.
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const token = Symbol('dialog');
    dialogStack.push(token);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialogStack[dialogStack.length - 1] !== token) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = dialogStack.indexOf(token);
      if (idx !== -1) dialogStack.splice(idx, 1);
    };
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-black/50 motion-safe:transition-opacity"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        className={cn(
          'relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface shadow-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/components/ui/Dialog.test.tsx
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Dialog.tsx src/components/ui/Dialog.test.tsx
git commit -m "feat(ui): add Dialog overlay primitive" -m "Portal-rendered dialog with role=dialog + aria-modal, useFocusTrap focus management, ref-counted body scroll-lock, topmost-only Escape, and backdrop-click close. Base for Phase 1 overlay refactors. bg-surface panel; no existing component touched." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `<Spinner>` + `<Skeleton>` primitives

**Files:**
- Create: `src/components/ui/Spinner.test.tsx`
- Create: `src/components/ui/Spinner.tsx`
- Create: `src/components/ui/Skeleton.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Spinner.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Spinner } from './Spinner';
import { Skeleton } from './Skeleton';

afterEach(cleanup);

describe('Spinner', () => {
  it('exposes a status role with an accessible label', () => {
    render(<Spinner label="Loading data" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading data');
  });

  it('applies the requested size to the icon', () => {
    render(<Spinner size="lg" label="Loading" />);
    const icon = screen.getByRole('status').querySelector('svg');
    expect(icon).toHaveClass('h-8', 'w-8');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech and merges className', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('h-4', 'w-24');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/components/ui/Spinner.test.tsx
```
Expected: FAIL with module-resolution errors (`Spinner`/`Skeleton` do not exist yet).

- [ ] **Step 3: Implement `Spinner`**

Create `src/components/ui/Spinner.tsx`:
```tsx
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const SIZE: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const { t } = useTranslation();
  const text = label ?? t('common.loading');
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <Loader2 className={cn('motion-safe:animate-spin text-current', SIZE[size])} aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
```

- [ ] **Step 4: Implement `Skeleton`**

Create `src/components/ui/Skeleton.tsx`:
```tsx
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('motion-safe:animate-pulse rounded bg-surface-muted', className)} />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx vitest run src/components/ui/Spinner.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Spinner.tsx src/components/ui/Skeleton.tsx src/components/ui/Spinner.test.tsx
git commit -m "feat(ui): add Spinner and Skeleton primitives" -m "Spinner: role=status, sr-only label (defaults to t('common.loading')), motion-safe spin, aria-hidden icon. Skeleton: aria-hidden motion-safe pulse block. For loading/empty states in later phases." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Status-tone token map (`variants.ts`)

**Files:**
- Create: `src/lib/ui/variants.test.ts`
- Create: `src/lib/ui/variants.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ui/variants.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STATUS_TONE, STATUS_TONE_MUTED } from './variants';

describe('status tone maps', () => {
  it('maps each tone to semantic foreground token pairs', () => {
    expect(STATUS_TONE.success).toBe('bg-success text-success-foreground');
    expect(STATUS_TONE.danger).toBe('bg-danger text-danger-foreground');
    expect(STATUS_TONE.info).toBe('bg-info text-info-foreground');
  });

  it('exposes muted variants for status tones', () => {
    expect(STATUS_TONE_MUTED.warning).toBe('bg-warning-muted text-warning');
  });

  it('contains no banned raw palette colors or hex', () => {
    const all = [...Object.values(STATUS_TONE), ...Object.values(STATUS_TONE_MUTED)].join(' ');
    expect(all).not.toMatch(/purple|indigo|violet|cyan|#[0-9a-fA-F]{3,6}/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/ui/variants.test.ts
```
Expected: FAIL with a module-resolution error (`variants` does not exist yet).

- [ ] **Step 3: Implement the token maps**

Create `src/lib/ui/variants.ts`:
```ts
/**
 * Shared status-tone -> semantic token-class maps. Replaces the success/warning/
 * danger/info color objects duplicated across Toast/Badge/ConfirmDialog/StatsCard.
 * `accent` has no -muted token, so it falls back to its solid pair.
 */
export const STATUS_TONE = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
  info: 'bg-info text-info-foreground',
  accent: 'bg-accent text-accent-foreground',
} as const;

export const STATUS_TONE_MUTED = {
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  danger: 'bg-danger-muted text-danger',
  info: 'bg-info-muted text-info',
  accent: 'bg-accent text-accent-foreground',
} as const;

export type StatusTone = keyof typeof STATUS_TONE;
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/ui/variants.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/variants.ts src/lib/ui/variants.test.ts
git commit -m "feat(ui): add shared STATUS_TONE token maps" -m "Single source of truth for status-tone -> semantic token classes (success/warning/danger/info/accent + muted), replacing the maps currently duplicated across four primitives in later phases." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `ui.*` i18n keys

**Files:**
- Create: `src/lib/i18n.test.tsx`
- Modify: `src/lib/i18n.ts` (add `ui` block to `en` and `ar` translation trees)

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import i18n from './i18n';

describe('ui i18n keys', () => {
  it('resolves the new ui.* keys in English', () => {
    expect(i18n.t('ui.noData')).toBe('No data available');
    expect(i18n.t('ui.processing')).toBe('Processing...');
    expect(i18n.t('ui.close')).toBe('Close');
    expect(i18n.t('ui.noOptions')).toBe('No options available');
  });

  it('resolves the Arabic translations', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('ui.noData')).toBe('لا توجد بيانات');
    await i18n.changeLanguage('en');
  });

  it('interpolates selectedCount', () => {
    expect(i18n.t('ui.selectedCount', { selected: 2, total: 5 })).toBe('2 of 5 selected');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/i18n.test.tsx
```
Expected: FAIL — `i18n.t('ui.noData')` returns the key string `'ui.noData'` (keys not defined yet), not `'No data available'`.

- [ ] **Step 3: Add the `ui` block to the English tree**

In `src/lib/i18n.ts`, inside `resources.en.translation`, immediately after the `common: { ... },` block closes, insert:
```ts
      ui: {
        noData: 'No data available',
        noResults: 'No results found',
        noOptions: 'No options available',
        processing: 'Processing...',
        close: 'Close',
        remove: 'Remove',
        dismiss: 'Dismiss',
        selectedCount: '{{selected}} of {{total}} selected',
        required: 'Required',
        retry: 'Retry',
      },
```

- [ ] **Step 4: Add the `ui` block to the Arabic tree**

In `src/lib/i18n.ts`, inside `resources.ar.translation`, immediately after the `common: { ... },` block closes, insert:
```ts
      ui: {
        noData: 'لا توجد بيانات',
        noResults: 'لا توجد نتائج',
        noOptions: 'لا توجد خيارات',
        processing: 'جاري المعالجة...',
        close: 'إغلاق',
        remove: 'إزالة',
        dismiss: 'تجاهل',
        selectedCount: '{{selected}} من {{total}} محدد',
        required: 'مطلوب',
        retry: 'إعادة المحاولة',
      },
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/i18n.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.ts src/lib/i18n.test.tsx
git commit -m "feat(ui): add ui.* i18n keys (en + ar)" -m "Adds the ui namespace (noData, noResults, noOptions, processing, close, remove, dismiss, selectedCount, required, retry) in English and Arabic. Primitives default copy props to these keys in later phases." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Full Phase 0 verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite (both projects)**

Run:
```bash
npm test
```
Expected: all suites PASS — node project (`utils.test.ts`, `variants.test.ts`) and dom project (`harness`, `useFocusTrap`, `Dialog`, `Spinner`, `i18n`). No failures.

- [ ] **Step 2: Run the typecheck gate**

Run:
```bash
npm run typecheck
```
Expected: 0 errors. (Confirms all new files + test files compile under strict `tsc`, keeping the CI `tsc=0` baseline.)

- [ ] **Step 3: Run lint**

Run:
```bash
npm run lint
```
Expected: clean (no new violations; no banned table names or color tokens were introduced).

- [ ] **Step 4: Confirm acceptance criteria**

Verify against the spec's §9:
1. `cn()` rewritten + tests green; 3 existing callers unaffected (typecheck clean). ✓
2. `useFocusTrap`, `Dialog`, `Spinner`, `Skeleton`, `src/lib/ui/variants.ts` created with the specified APIs. ✓
3. `ui.*` keys added to `en` + `ar`; copy convention documented in the spec. ✓
4. jsdom + Testing Library harness runs; new tests pass; node suite still runs under `npm test`. ✓
5. `npm run typecheck` = 0; lint clean; no banned tokens/colors in new files. ✓
6. No shipped component's public API changed (only `src/lib/utils.ts` internals + additive `i18n.ts` keys). ✓

- [ ] **Step 5: Final commit (only if any verification fix was needed)**

If steps 1–3 required a fix, commit it:
```bash
git add -A
git commit -m "test(ui): finalize Phase 0 foundation verification" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Otherwise, Phase 0 is complete — no commit needed.

---

## Self-Review

**Spec coverage** (each Phase 0 unit → a task):
- Unit 1 `cn` fix → Task 3 ✓
- Unit 2 `useFocusTrap` → Task 4 ✓
- Unit 3 `Dialog` → Task 5 ✓
- Unit 4 `Spinner`/`Skeleton` → Task 6 ✓
- Unit 5 cva/status-tone map → Task 7 ✓
- Unit 6 `ui.*` i18n keys → Task 8 ✓
- Unit 7 conventions → embodied in Tasks 5/6 (motion-safe, role=status, focus-visible-ready, ref-as-prop) ✓
- Dependencies + jsdom harness (spec §5/§7) → Tasks 1/2 ✓
- Acceptance criteria (spec §9) → Task 9 ✓
- Deferred `useFieldA11y`/`useAnchoredPosition` (spec §10) → correctly NOT in this plan ✓

**Placeholder scan:** no TBD/TODO; every code step contains complete code; every command lists expected output. ✓

**Type consistency:** `cn(...inputs: ClassValue[]): string` used consistently; `useFocusTrap<T>({active, initialFocusRef, restoreFocus}): RefObject<T | null>` matches its consumer in `Dialog` (`useFocusTrap<HTMLDivElement>`); `DialogProps.initialFocusRef` and `UseFocusTrapOptions.initialFocusRef` are both `RefObject<HTMLElement | null>`; `STATUS_TONE`/`STATUS_TONE_MUTED`/`StatusTone` names consistent between Task 7 code and test; `ui.*` key names consistent between Task 8 en/ar blocks and the i18n test (`noData`, `processing`, `close`, `noOptions`, `selectedCount`). ✓

No gaps found.
