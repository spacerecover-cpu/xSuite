# UI Library Hardening — Program Decomposition & Phase 0 (Foundation) Design

- **Date:** 2026-05-30
- **Status:** Draft for review
- **Scope of this document:** Program context + the detailed, actionable spec for **Phase 0 (Foundation)**. Phases 1–4 are summarized for context only; each gets its own spec → plan → implementation cycle.
- **Source evidence:** Parallel audit of all 21 `src/components/ui/` primitives + shared-infrastructure assessment (22 agents). Findings referenced inline.

---

## 1. Context & Problem

xSuite has a mature UI library — 21 base primitives in `src/components/ui/` plus shared composites (`DataTable`, `EmptyState`, `PageHeader`, `StatsCard`) — consumed by ~190 files under a CI-enforced `tsc=0` baseline and 6 schema/lint gates. The library **works**, but it is not at a production-grade ("millions of users") bar. An exhaustive audit found the debt is **systemic, not per-component**:

**Severity:** 18 High · 2 Medium (StatsCard, ChipInput) · 1 Low (DeviceRoleBadge). Eight primitives scored 2/10 on accessibility (Modal, ConfirmDialog, Toast, FormField, MultiSelectDropdown, ImageUpload, RichTextEditor, Badge).

**Six recurring root causes** (the targets of a shared foundation):

1. **`cn()` is broken and unused.** `src/lib/utils.ts` hand-rolls a class merge that dedupes by last-dash prefix — it mangles variant/opacity classes (`hover:bg-x` vs `bg-x`, `bg-primary/90`) and reorders output. `clsx`/`tailwind-merge` are not installed; the helper is imported by **zero** `ui/` files. Every component's `className` override is therefore unsafe.
2. **No focus management on overlays.** Modal, ConfirmDialog, PhotoViewerModal hand-roll overlay behavior; none trap focus, restore focus to the opener, set `role="dialog"`/`aria-modal`, or render through a portal. Affects ~30 modal consumers transitively.
3. **No field association.** Input, FormField, ChipInput, PhoneInput, SearchableSelect, MultiSelectDropdown render `<label>` with no `htmlFor`/`id`, no `aria-invalid`, no `aria-describedby`. Forms are inaccessible.
4. **Selects aren't keyboard/AT operable.** SearchableSelect/MultiSelectDropdown/PhoneInput use `<div onClick>` triggers with no `role="listbox/option"`; ~80 lines of flip/portal positioning logic are copy-pasted 3×. MultiSelectDropdown is currently **keyboard-unopenable**.
5. **No loading/empty feedback.** `Button.isLoading` renders nothing, `Table` hardcodes "No data available", StatsCard's 13 consumers fake loading with `value="..."`.
6. **Token leaks.** `bg-white` (28×, should be `bg-surface`); Button/Badge hardcode `slate` for brand variants (don't re-theme); CustomerAvatar uses banned `cyan-400/600`; `color: string`→inline-style escape hatches (CollapsibleSection, Card, Badge, StatsCard) and RichTextEditor raw hex bypass the token system entirely.

Plus: `focus:` instead of `focus-visible:` everywhere (ring shows on mouse click); `forwardRef` on only Input (blocks tooltips/popovers/RHF); hardcoded English copy throughout despite an existing i18n system; no `prefers-reduced-motion` guards.

**Notable concrete bugs** (not just gaps): MultiSelectDropdown keyboard-unopenable; ImageUpload's `onUploadComplete`/`bucketName` props are dead and its spinner is unreachable code; RichTextEditor source-mode emits **unsanitized HTML** into stored case-report content; Badge silently drops its `custom` color when `style` is passed; StatsCard accepts contradictory `{ value: -5, isPositive: true }`; CustomerAvatar is never clickable without a photo.

### Environment facts that shape the design

- **React 19** (`react@^19.2.5`) — CLAUDE.md's "React 18" is stale. Use **ref-as-prop** (function components accept `ref` directly); `forwardRef` is legacy. `useId` is native.
- **i18n exists but is inert.** `src/lib/i18n.ts` is `i18next` + `react-i18next` with full `en` + `ar` resource trees, and `common.*` already defines `loading/search/cancel/confirm/error/actions/status`. But `lng` is pinned to `'en'` and `document.documentElement.dir`/`lang` are static — nothing maps tenant locale → `i18n.changeLanguage`. A separate DB-driven `useDocumentTranslations` handles PDFs only.
- **`tsconfig.app.json`:** `jsx: "react-jsx"`, `strict`, `noUnusedLocals`, `noUnusedParameters`. `PhotoViewerModal`'s `React.FC` without a `React` import **compiles** (type-position UMD-global reference is permitted) — it is a consistency cleanup, not a build break.
- **Test harness:** `vitest.config.ts` is `environment: 'node'`, `include: ['src/**/*.test.ts']` (no `.tsx`, no DOM). There are zero project test files. A DOM harness must be stood up for component/hook tests.
- **Dependency baseline:** `clsx` is only transitive; `tailwind-merge` and `class-variance-authority` are not installed. `framer-motion`, `react-hook-form`+`zod`, `react-easy-crop`, `@sentry/react` are present.

---

## 2. Program Decomposition (context for Phase 0)

The full hardening is a **program**, not one spec. Each phase is one spec → plan → one or a few PRs, each green on `tsc=0` + the 6 gates, each **additive and backward-compatible** so no caller breaks.

| Phase | Scope | Core deliverables |
|------|-------|-------------------|
| **0 — Foundation** *(this doc)* | Shared layer, no visible UI change | `cn` fix; `useFocusTrap`; `<Dialog>`; `<Spinner>`/`<Skeleton>`; cva + status-tone map; `ui.*` i18n keys; conventions; DOM test harness + tests |
| **1 — Overlays** | Modal, ConfirmDialog, PhotoViewerModal, ImageCropModal | Refactor onto `<Dialog>`; dialog a11y + focus trap + portal; tokenize; copy→`t()` |
| **2 — Form controls & selects** | Input, FormField, ChipInput, PhoneInput, SearchableSelect, MultiSelectDropdown | `useFieldA11y` + `useAnchoredPosition` (built here); combobox/listbox ARIA + keyboard nav; RHF/ref; de-dup; tokens; copy→`t()` |
| **3 — Display & data** | Button, Badge, Card, Table, StatsCard, Toast, CollapsibleSection, CustomerAvatar, DeviceRoleBadge, ImageUpload, RichTextEditor | cva variants; loading/empty/error via Spinner/Skeleton; token leaks; ref-as-prop; the concrete bugs; Table `getRowId`; Toast `aria-live` + resolve react-hot-toast duplication |
| **4 — i18n activation** *(cross-cutting)* | App-level | Tenant locale → `i18n.changeLanguage` + `dir`/`lang` + RTL pass; backfill missing `en`/`ar` keys |

---

## 3. Phase 0 Scope

**In scope:** the shared utilities, hooks, primitives, conventions, and test harness that Phases 1–3 depend on. Pure infrastructure.

**Explicitly out of scope (deferred):**
- Refactoring any shipped component (Modal, Button, Table, etc.) — that is Phases 1–3.
- `useFieldA11y` and `useAnchoredPosition` — single-phase consumers (Phase 2), built and tested there (YAGNI).
- App-level locale switching / RTL — Phase 4.

**Guardrails:** zero changes to any existing component's public API; `tsc=0` and all 6 CI gates stay green; production build config (`vite.config.ts`) untouched; no banned tokens/colors introduced.

---

## 4. Phase 0 Detailed Design

### Unit 1 — Fix the keystone: `cn()` (`src/lib/utils.ts`)

Replace the broken prefix-dedup with the standard composition. Same name and signature → the 3 existing callers and ESLint stay green.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
```

`bg-*`, `text-*`, `border-*`, `ring-*` are standard Tailwind groups, so semantic tokens (`bg-primary`, `bg-surface-muted`, `text-danger`) merge correctly with last-wins semantics. If any custom utility ever needs special handling, `extendTailwindMerge` is the escape hatch (not needed now).

### Unit 2 — `useFocusTrap` (`src/hooks/useFocusTrap.ts`)

```ts
function useFocusTrap<T extends HTMLElement>(opts: {
  active: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  restoreFocus?: boolean; // default true
}): React.RefObject<T>; // attach to the container element
```

Behavior:
- When `active` transitions true (and the container is mounted): record `document.activeElement`, then focus `initialFocusRef.current` → else the first tabbable descendant → else the container itself (`tabindex=-1`).
- While active: intercept Tab / Shift+Tab; wrap focus at the first/last tabbable boundary.
- When `active` transitions false or the hook unmounts: if `restoreFocus`, return focus to the recorded element.
- Tabbable query: standard selector (`a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])`, excluding `[disabled]`/`[hidden]`).

Pure focus concern only — no scroll-lock, no portal (those live in `<Dialog>`).

### Unit 3 — `<Dialog>` overlay primitive (`src/components/ui/Dialog.tsx`)

The low-level base every overlay refactors onto in Phase 1. Modal/ConfirmDialog/PhotoViewerModal become thin styled wrappers over it (Phase 1), preserving their current props.

```tsx
interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;                          // id of the title element (aria-labelledby)
  label?: string;                               // aria-label when there is no visible title
  initialFocusRef?: React.RefObject<HTMLElement>;
  closeOnBackdrop?: boolean;                     // default true
  closeOnEscape?: boolean;                       // default true
  className?: string;                            // panel classes (merged via cn)
  children: React.ReactNode;
}
```

Behavior:
- Renders `null` when `!open`. When open, `createPortal` to `document.body` (escapes ancestor `overflow`/`transform`/stacking contexts).
- Backdrop element + panel with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` (preferred) or `aria-label`. Exactly one of `labelledBy`/`label` is required (dev-time warning otherwise).
- `useFocusTrap({ active: open, initialFocusRef, restoreFocus: true })` on the panel.
- **Scroll-lock via a module-level ref-count:** first open sets `body { overflow: hidden }`, last close restores. Prevents a stacked ConfirmDialog from unlocking the body while the parent Modal is still open.
- **Escape via a module-level dialog stack:** only the topmost open Dialog handles Escape, so one keypress closes one dialog.
- Backdrop click → `onClose` when `closeOnBackdrop`. Panel surface uses `bg-surface`; fade is `motion-safe:` only; all class composition via `cn()`.

Not in Phase 0: the existing overlay components are untouched here.

### Unit 4 — `<Spinner>` + `<Skeleton>` (`src/components/ui/Spinner.tsx`, `src/components/ui/Skeleton.tsx`)

```tsx
interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; label?: string; className?: string; }
// lucide-react Loader2, motion-safe:animate-spin, role="status",
// visually-hidden label (default t('common.loading')); aria-hidden on the icon.

interface SkeletonProps { className?: string; }
// motion-safe:animate-pulse block, bg-surface-muted, rounded; aria-hidden. Shape comes from className (h/w/rounded).
```

Consumed by Button (Phase 3), Table/StatsCard (Phase 3), and Dialog busy states.

### Unit 5 — cva pattern + shared status-tone map (`src/lib/ui/variants.ts`)

Defines the variant convention and the status-tone token map that is currently duplicated verbatim across Toast/Badge/ConfirmDialog/StatsCard.

```ts
export const STATUS_TONE = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger:  'bg-danger text-danger-foreground',
  info:    'bg-info text-info-foreground',
  accent:  'bg-accent text-accent-foreground',
} as const;

export const STATUS_TONE_MUTED = {
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  danger:  'bg-danger-muted text-danger',
  info:    'bg-info-muted text-info',
  accent:  'bg-accent text-accent-foreground',
} as const;

export type StatusTone = keyof typeof STATUS_TONE;
```

Plus a documented `cva()` recipe (base + `variants` + `defaultVariants`, composed through `cn`) that each variant primitive adopts in its own phase. Phase 0 defines the pattern and the map; it does **not** rewrite any shipped component.

### Unit 6 — i18n keys + the copy convention (`src/lib/i18n.ts`)

- **Reuse existing `common.*`** where present (`common.loading/search/cancel/confirm/error/actions/status`).
- **Add a `ui.*` namespace** (en + ar) for genuinely new primitive strings:

| key | en | ar |
|-----|----|----|
| `ui.noData` | No data available | لا توجد بيانات |
| `ui.noResults` | No results found | لا توجد نتائج |
| `ui.noOptions` | No options available | لا توجد خيارات |
| `ui.processing` | Processing... | جاري المعالجة... |
| `ui.close` | Close | إغلاق |
| `ui.remove` | Remove | إزالة |
| `ui.dismiss` | Dismiss | تجاهل |
| `ui.selectedCount` | {{selected}} of {{total}} selected | {{selected}} من {{total}} محدد |
| `ui.required` | Required | مطلوب |
| `ui.retry` | Retry | إعادة المحاولة |

- **Copy convention (reconciles "prop-overridable" + "full i18n"):** primitive copy props are **optional** and default to the i18n value. Example contract for Phase 3's Table:

```tsx
// emptyMessage?: string  — default: t('ui.noData')
<td>{emptyMessage ?? t('ui.noData')}</td>
```

Overridable per call site **and** localized by default.

### Unit 7 — Conventions (documented in this spec; applied as components are refactored)

- **focus-visible standard:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (never bare `focus:` for the ring).
- **React 19 ref-as-prop:** primitives that wrap a DOM node accept `ref` via props and spread `...rest` from the native element's props type (`React.ComponentPropsWithRef<'button'>` etc.). No `forwardRef`.
- **Reduced motion:** every animation gated with `motion-safe:` / `motion-reduce:`.

---

## 5. Testing Strategy

A DOM test harness is stood up **alongside** the existing node-only pure-logic suite, without disturbing it.

- **Dev dependencies added:** `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- **Config:** a second Vitest project for DOM tests (`environment: 'jsdom'`, `include: ['src/**/*.test.tsx']`, a setup file importing `@testing-library/jest-dom`). The existing `vitest.config.ts` node project (`.test.ts`, money/status logic) is left exactly as-is. Both run under `npm test`.
- **Coverage per unit:**
  - `cn()` — `.test.ts` (node): conflict resolution (`cn('px-2','px-4')` → `px-4`), variant prefixes preserved (`hover:bg-x` survives), independent classes kept (`border-t border-b`), conditional/array inputs. Doubles as regression proof vs. the old broken merge.
  - `useFocusTrap` — `.test.tsx` (jsdom + RTL): Tab cycles within container; Shift+Tab from first wraps to last; focus restored on deactivate; `initialFocusRef` honored; empty-container fallback focuses the container.
  - `<Dialog>` — `.test.tsx`: renders nothing when closed; portals to body when open; sets `role="dialog"`/`aria-modal`/labelledby; Escape (topmost only) calls `onClose`; backdrop click respects `closeOnBackdrop`; body scroll-lock ref-count across stacked dialogs; focus returns to opener on close.
  - `<Spinner>`/`<Skeleton>` — `.test.tsx`: `role="status"` + accessible label on Spinner; `aria-hidden` on Skeleton; size classes applied.

---

## 6. Backward-Compatibility & CI Posture

- No existing component's public API changes in Phase 0. The only edit to a shipped file is `src/lib/utils.ts` (`cn` internals; signature preserved) and additive `ui.*` keys in `src/lib/i18n.ts`.
- `tsc=0` (`npm run typecheck`) and all 6 gates (typecheck, schema-drift, lint, tenant-table-requirements, migration-manifest, from-table-names) must stay green. Phase 0 touches no DB schema, no `.from()` calls, no banned tables.
- New files use semantic tokens only; no `purple/indigo/violet`, no banned hex, no `bg-white` (panels use `bg-surface`).
- Production build config untouched; test config additive.

---

## 7. Dependencies Added

| Package | Type | Why |
|---------|------|-----|
| `clsx` | dep | conditional class composition (currently only transitive) |
| `tailwind-merge@^2` | dep | correct Tailwind conflict resolution (v2 tracks Tailwind v3.4) |
| `class-variance-authority` | dep | typed variant configs; kills duplicated VARIANT_ALIAS / status maps |
| `jsdom` | devDep | DOM environment for component/hook tests |
| `@testing-library/react` | devDep | render/query React in tests |
| `@testing-library/user-event` | devDep | realistic keyboard/pointer interaction (focus-trap, Esc) |
| `@testing-library/jest-dom` | devDep | a11y-friendly matchers (`toHaveFocus`, `toHaveAttribute`) |

---

## 8. Risks & Mitigations

- **`twMerge` mis-merging custom tokens.** Mitigation: tokens use standard prefixes (`bg-/text-/border-/ring-`); covered by `cn` tests; `extendTailwindMerge` available if ever needed.
- **Focus-trap edge cases** (no tabbable content, async-mounted children). Mitigation: container fallback (`tabindex=-1`); explicit jsdom tests for the empty case.
- **Scroll-lock/Escape with stacked overlays.** Mitigation: module-level ref-count + dialog stack; stacked-dialog test.
- **Dev-dep footprint / "check before installing."** Mitigation: all four test deps are dev-only and standard; the three runtime deps are tiny and were explicitly approved.
- **Vitest two-project config drift.** Mitigation: keep the node project file untouched; add DOM project in a clearly-separated config; verify both suites run in one `npm test`.

---

## 9. Phase 0 Acceptance Criteria

1. `cn()` rewritten; `cn` test suite passes; 3 existing callers unaffected.
2. `useFocusTrap`, `<Dialog>`, `<Spinner>`, `<Skeleton>`, `src/lib/ui/variants.ts` created with the APIs above.
3. `ui.*` keys added to `en` + `ar`; copy convention documented.
4. jsdom + Testing Library harness stands up; the listed tests pass; the existing node suite still passes; `npm test` runs both.
5. `npm run typecheck` = 0 errors; lint clean; no banned tokens/colors in new files.
6. No shipped component's public API changed.

## 10. Deferred (built in their consuming phase)

- `useFieldA11y` (useId label/error association) → Phase 2.
- `useAnchoredPosition` (dropdown flip/clamp/portal positioning) → Phase 2.

## 11. References

- `src/components/ui/` — the 21 audited primitives.
- `src/lib/utils.ts` (broken `cn`), `src/lib/i18n.ts` (i18n resources), `tsconfig.app.json`, `vitest.config.ts`.
- CLAUDE.md — Theming token vocabulary, Schema Discipline, Do-Not rules.
