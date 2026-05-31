# UI Library Hardening — Phase 1 (Overlays) Design

- **Date:** 2026-05-30
- **Status:** Draft for review
- **Program:** Phase 1 of the 5-phase UI library hardening (see `2026-05-30-ui-library-hardening-phase0-design.md`). Builds directly on the Phase 0 `<Dialog>` primitive.
- **Evidence:** Parallel consumer-mapping of all 4 overlay components (4 agents) + firsthand reads. Consumer counts and edge cases referenced inline.

---

## 1. Context & Goal

Phase 0 shipped a low-level `<Dialog>` primitive (portal, `role="dialog"`+`aria-modal`, focus trap, ref-counted scroll-lock, topmost-only Escape, backdrop-click). Phase 1 **rewrites the four overlay components' internals to sit on `<Dialog>`**, fixing the systemic overlay defects (no focus management, no portal, no dialog a11y, token leaks, hardcoded copy) across the whole app at once.

**Hard constraint:** every overlay keeps its **exact public prop API** so its consumers compile unchanged under `tsc=0`. Consumer surface: **Modal 92 · ConfirmDialog 11 · PhotoViewerModal 1 · ImageCropModal 1.**

**Key structural facts from the mapping:**
- `ImageCropModal` already renders `<Modal>` internally → it inherits the entire overlay refactor for free once Modal is refactored. Its own work is tokenize + i18n + control-a11y + a silent-`catch` fix.
- `ConfirmDialog` and `PhotoViewerModal` hand-roll their own overlays → full refactors onto `<Dialog>`.
- Portaling + focus-trapping Modal **breaks consumers that hand-roll a second overlay inside the Modal subtree** — these require fixes (see §5).

---

## 2. Scope

**In scope:**
- A small additive enhancement to the Phase 0 `<Dialog>` (overlay + backdrop className escape hatches) — §3.
- Refactor `Modal`, `ConfirmDialog`, `PhotoViewerModal` onto `<Dialog>`; harden `ImageCropModal` (keeps `<Modal>`) — §4.
- Required consumer nested-overlay fixes — §5.
- New `ui.*` i18n keys (en + ar) — §6.
- Behavior tests for each refactor incl. stacked cases — §7.

**Out of scope (later phases):** form controls & selects (Phase 2); Button/Badge/Card/Table/Toast/etc. (Phase 3); app-level locale switching (Phase 4). Non-overlay primitives are untouched.

**Guardrails:** no overlay's existing public prop is renamed/removed (additive optional props allowed); `tsc=0` + all 6 CI gates stay green; PhotoViewerModal's theme-neutral lightbox chrome is deliberately NOT tokenized; the crop/canvas math in ImageCropModal is byte-for-byte unchanged.

---

## 3. `<Dialog>` enhancement (additive)

Add two optional className escape hatches so the primitive can host a media lightbox (and future stacked/raised overlays) without forking it:

```tsx
interface DialogProps {
  // ...existing...
  overlayClassName?: string;   // merged into the outer fixed wrapper — e.g. raise z-index: "z-[60]"
  backdropClassName?: string;  // merged into the backdrop — e.g. darker scrim: "bg-black/90 backdrop-blur-sm"
}
```

- Outer wrapper: `cn('fixed inset-0 z-50 flex items-center justify-center', overlayClassName)`.
- Backdrop: `cn('absolute inset-0 bg-black/50', backdropClassName)` (twMerge lets `bg-black/90` override `bg-black/50`).
- Panel: existing `cn('relative z-10 …', className)`.

Both default to undefined → **zero behavior change** for existing usage. New Dialog tests assert each is applied and that `overlayClassName="z-[60]"` / `backdropClassName="bg-black/90"` win via twMerge. Phase 0 Dialog tests must still pass.

---

## 4. Per-component refactor

### 4.1 Modal (keystone — 92 consumers)

**Preserve exactly** the existing `ModalProps` (`isOpen`, `onClose`, `title?`, `children`, `size?` [7-value union incl. `'large'`], `maxWidth?`, `icon?`, `headerAction?`, `headerBadges?`, `showCloseButton?`) and **add one optional** `ariaLabel?: string` (additive; names title-less modals).

**Internals:** render `<Dialog open={isOpen} onClose={onClose} closeOnBackdrop closeOnEscape labelledBy={title ? titleId : undefined} label={title ? undefined : (ariaLabel ?? t('ui.dialog'))} className={cn(widthClass, 'flex flex-col overflow-hidden p-0')}>` and build the header/body chrome as children. **Delete** Modal's two `useEffect`s (scroll-lock + window keydown), the `if(!isOpen) return null`, the outer fixed wrapper, the hand-rolled backdrop, `handleBackdropClick`, and the `bg-white` panel div — `<Dialog>` owns all of it.

**Must-preserve edge cases (from the mapping):**
- `title=""` (5 consumers) → render **no header**, only the floating close button. Gate the header on `title` being **truthy**, not defined.
- `showCloseButton={false}` → render **neither** close button (PasswordChangeModal forced/blocking modal; `onClose` is a no-op — do NOT inject any dismiss).
- `no-print` class stays on the header + floating close button (print-to-PDF flows depend on it).
- **PaymentReceiptModal quirk** (`headerAction` + `title=""` → button currently dropped): **reproduce current behavior** (header still gated on truthy title) — no surprise visible change. Flag in PR.

**Width mapping** (override Dialog's `max-w-lg` via className — the fixed `cn()`/twMerge makes the last `max-w-*` win):
`xs→max-w-sm, sm→max-w-md, md→max-w-lg, lg→max-w-2xl, xl→max-w-4xl, large→max-w-4xl, 2xl→max-w-6xl`; `maxWidth` (precedence) `3xl→max-w-3xl … 7xl→max-w-7xl`. Tests must assert `max-w-7xl` and `large→max-w-4xl` actually render (not silently collapse to `max-w-lg`).

**Tokenize (narrow — slate/white text are *allowed* utility neutrals per CLAUDE.md; there is NO `surface-foreground`/`foreground` token, so neutral text stays slate):** panel `bg-white` inherited as `bg-surface` from Dialog; `border-slate-200→border-border`; `hover:bg-slate-100→hover:bg-surface-muted`. Leave `text-slate-900`/`text-slate-*` as-is. **i18n:** close-button `aria-label={t('ui.close')}`; title-less fallback name `t('ui.dialog')`. Title text stays consumer-supplied.

`titleId` via `useId()`; `id={titleId}` on the `<h2>`.

### 4.2 ConfirmDialog (11 consumers)

Preserve API byte-for-byte (`isOpen`, `onClose`, `onConfirm`, `title`, `message`, `confirmText?`, `cancelText?`, `variant?`, `isLoading?`). Render `<Dialog open={isOpen} onClose={onClose} labelledBy={titleId} closeOnBackdrop={!isLoading} closeOnEscape={!isLoading} className="max-w-md p-6">`; move the variant icon badge + title + message + footer inside. Delete the hand-rolled overlay.

- Confirm button: reuse the Phase 0 `STATUS_TONE[variant]` map (`src/lib/ui/variants.ts`) — `bg-danger text-danger-foreground` etc. — instead of `text-white` on raw color. (`variantStyles`' `bg-*-muted`/`text-*` are already correct semantic tokens.)
- Tokenize narrowly: `bg-white`→`bg-surface` (from Dialog), `hover:bg-slate-100`→`hover:bg-surface-muted`. Leave `text-slate-400/600/900` (allowed neutrals; no `surface-foreground` token exists).
- **i18n the defaults only:** `confirmText ?? t('common.confirm')`, `cancelText ?? t('common.cancel')`, `'Processing…' → t('ui.processing')`, close `aria-label={t('ui.close')}`. **Do NOT** `t()` the `title`/`message` props (caller-supplied, interpolated).
- Drop `React.FC`; type as a plain function (React 19). Remove `handleBackdropClick` (Dialog owns it) → the `React.MouseEvent` reference goes away.
- **Land together with Modal** — `CategoryManagerModal` stacks ConfirmDialog over an open Modal; both must be Dialog-based to share the scroll-lock ref-count + Escape stack.

### 4.3 PhotoViewerModal (1 consumer) — dark lightbox

Preserve API (`isOpen`, `onClose`, `imageUrl`, `altText?`). It is a **media lightbox**, not a surface card:
- Use the new Dialog escape hatches: `<Dialog open={isOpen} onClose={onClose} closeOnBackdrop closeOnEscape label={altText ?? t('ui.photoViewerTitle')} overlayClassName="z-[60]" backdropClassName="bg-black/90 backdrop-blur-sm" className={cn('bg-transparent shadow-none max-w-7xl w-auto overflow-visible p-0')}>`. The `overlayClassName="z-[60]"` restores its "above everything" intent; `backdropClassName` gives the dark scrim.
- Render the centered `<img>` (object-contain, `onClick` stopPropagation), the floating top-right close `<button aria-label={t('ui.photoViewerClose')}>`, and the bottom hint pill as Dialog children.
- **Do NOT tokenize** `bg-white/10`, `text-white`, `bg-black/90` — intentional theme-neutral chrome (like PDFs). Flag explicitly so a reviewer doesn't auto-tokenize.
- **Fix the `React.FC`-without-import**: drop `React.FC`, use a plain function component.
- **i18n** the 3 strings; the hint ("Press **ESC** or click outside to close") uses `<Trans>` to preserve the bold `ESC`. `altText` default → `t('ui.photoViewerDefaultAlt')`.

### 4.4 ImageCropModal (1 consumer) — harden, keeps `<Modal>`

It keeps rendering `<Modal title={t('ui.cropImage')} size="large">` and **inherits** the overlay refactor. Its Phase 1 work:
- **Tokenize narrowly** (slate text/neutrals are allowed; no `surface-foreground` token): `hover:bg-slate-100/200`→`hover:bg-surface-muted`, range track `bg-slate-200`→`bg-surface-muted`, footer bare `border`→`border-border`. **Keep** `bg-slate-900` behind the `<Cropper>` (intentional dark neutral) and the neutral label text.
- **i18n** all copy (new keys: `ui.cropImage`, `ui.zoom`, `ui.rotation`, `ui.rotate90`, `ui.current`, `ui.applyCrop`, `ui.cropping`; reuse `common.cancel`).
- **Control a11y:** `aria-label` on the icon-only Zoom In/Out buttons; associate the range `<input>` with its label (`useId`/`htmlFor` + `aria-label`).
- **Surface the silent crop error:** the `catch` currently only logs — add an inline error state (`text-danger`) so a failed crop isn't a silent no-op.
- **Fix the `React.FC`-without-import**; do NOT touch the crop/canvas math (`getCroppedImg` etc.).
- **Validate the modal-in-modal flow** (crop opens inside the Edit-Customer Modal) — covered by a stacked test (§7).

---

## 5. Required consumer nested-overlay fixes

Portaling + focus-trapping Modal regresses consumers that hand-roll a second overlay inside the Modal subtree. These fixes are **mandatory** for Phase 1 to not break those screens:

- **`src/components/cases/QuoteFormModal.tsx` + `InvoiceFormModal.tsx`** — each renders a `fixed inset-0 z-50` catalog-picker *inside* `<Modal>`. After Modal portals, the picker is outside the Dialog panel and the focus trap blocks its inputs. **Fix:** convert each picker to its own stacked `<Dialog>` (they stack correctly via Dialog's ref-count + topmost-Escape).
- **`src/components/cases/EmailDocumentModal.tsx`** — nested `z-[60]` PDF-preview overlay; after Modal becomes a `z-50` portal, re-verify the preview layers above and its Escape/backdrop don't conflict. Prefer migrating the preview to a stacked `<Dialog>`.
- **`src/components/kb/CategoryManagerModal.tsx`** — stacks `ConfirmDialog` over an open `Modal`; correct only when both are Dialog-based → satisfied by landing Modal + ConfirmDialog together.
- **`src/pages/customers/CustomerProfilePage.tsx`** — `ImageCropModal` opens inside the Edit-Customer Modal (modal-in-modal); validate stacking/Escape/scroll-lock/focus-restore via a test.

---

## 6. i18n keys to add (en + ar, add-only)

Under `ui.*` in `src/lib/i18n.ts` (both trees): `dialog`, `photoViewerTitle`, `photoViewerClose`, `photoViewerDefaultAlt`, `photoViewerHint` (with a `<1>ESC</1>` tag for `<Trans>`), `cropImage`, `zoom`, `rotation`, `rotate90`, `current`, `applyCrop`, `cropping`. Reuse existing `common.confirm`, `common.cancel`, `ui.processing`, `ui.close`.

---

## 7. Testing strategy

Behavior tests (jsdom + Testing Library, the Phase 0 harness) — new `.test.tsx` files:

- **Dialog enhancement:** `overlayClassName`/`backdropClassName` applied and override defaults via twMerge.
- **Modal:** opens/portals with `role="dialog"`; `aria-labelledby` wired to the title; `title=""` → no header + floating close present; `showCloseButton={false}` → no close button anywhere; width mapping (`size="large"`→`max-w-4xl`, `maxWidth="7xl"`→`max-w-7xl`) actually applied; close button has `aria-label`; focus moves in on open.
- **ConfirmDialog:** confirm/cancel fire the right callbacks; `isLoading` blocks backdrop/Escape close and shows the processing label; `aria-labelledby` wired; tokenized confirm button per variant.
- **PhotoViewerModal:** portals with an accessible name from `label`; darker backdrop + `z-[60]` applied; close button labeled; image click does not close.
- **ImageCropModal:** renders the crop title; zoom buttons + range input are labeled; a crop failure surfaces the error state (mock `getCroppedImg` to throw).
- **Stacked cases:** ConfirmDialog-over-Modal (Escape closes the top one; body stays locked until both close) and crop-in-edit-modal focus restore.

The existing Phase 0 + node suites must stay green; `npm test` runs both projects.

---

## 8. Sequencing (one PR, ordered tasks)

1. Dialog enhancement (+ tests).
2. Modal refactor (+ tests) **and** the Quote/Invoice/Email consumer nested-overlay fixes — land together (Modal's portaling is what necessitates them).
3. ConfirmDialog refactor (+ tests) — same change set as Modal for the CategoryManager stacking.
4. PhotoViewerModal refactor (+ tests).
5. ImageCropModal hardening (+ tests).
6. i18n keys (en + ar).
7. Full verification (both test projects, typecheck, lint) + manual smoke of the modal-in-modal and form-modal catalog-picker flows.

---

## 9. Backward-compat & CI posture

- No overlay's existing public prop renamed/removed; only additive optional `ariaLabel?` on Modal and `overlayClassName?`/`backdropClassName?` on Dialog.
- `tsc=0` + 6 CI gates green throughout. New files use semantic tokens only (lightbox/cropper dark-neutral exceptions explicitly flagged).
- Phase 1 is its own branch/PR **stacked on Phase 0** (`feat/ui-library-hardening`, PR #122). It retargets `main` once #122 merges.

---

## 10. Risks & mitigations

- **Width override silently failing** (panel collapses to `max-w-lg`): mitigated by twMerge (Phase 0 `cn`) + explicit width tests for `large`/`7xl`.
- **Nested-overlay focus-trap conflicts** (Quote/Invoice pickers): converted to stacked `<Dialog>`; verified by the form-modal smoke + tests.
- **Stacked scroll-lock/Escape coordination**: only correct when both layers are Dialog-based → Modal + ConfirmDialog land together; covered by the stacked test.
- **react-easy-crop inside a focus trap**: pointer/drag handlers shouldn't be affected, but smoke-test drag/zoom in the crop modal.
- **Lightbox over-tokenization**: explicitly excluded; flagged for reviewer.
- **PaymentReceiptModal behavior change**: avoided by reproducing the current (button-dropped) behavior.

## 11. Acceptance criteria

1. `<Dialog>` gains `overlayClassName`/`backdropClassName` (additive); Phase 0 Dialog tests still pass + new tests green.
2. Modal, ConfirmDialog, PhotoViewerModal refactored onto `<Dialog>`; ImageCropModal hardened; all public prop APIs unchanged (Modal +1 optional `ariaLabel`).
3. Quote/Invoice/Email nested overlays no longer trapped; CategoryManager + crop-in-edit-modal stack correctly.
4. New `ui.*` keys added (en + ar); component copy routed through `t()` (not consumer-supplied props).
5. All listed behavior tests pass; existing suites green; `npm run typecheck` = 0; lint clean; no banned tokens in new code (lightbox/cropper neutrals excepted and flagged).
6. No existing component's public prop removed/renamed; 92 Modal + 11 ConfirmDialog consumers compile unchanged.

## 12. Deferred

- A Dialog footer/density slot, Modal size-API consolidation (deprecating the `'large'` alias) — not needed; would touch consumers. Out of scope.
- PhotoViewerModal multi-image/gallery — out of scope (single-image consumer).
