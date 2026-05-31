# UI Library Hardening — Phase 2a (Field a11y) Design

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Program:** Phase 2 of 5 (form controls & selects), **split into 2a (field a11y) + 2b (selects)**. This doc is **2a**. Builds on Phase 0 (`cn`, jsdom harness, `ui.*` i18n, `useId` conventions).
- **Evidence:** 7-agent mapping workflow (6 components + shared-hooks design) + firsthand reads.

---

## 1. Context & Goal

The six form controls all hand-roll label/error/hint markup but **none wire them together** (no `htmlFor`/`id`, no `aria-invalid`/`aria-describedby`/`aria-required`). Phase 2a builds the shared field-a11y layer and adopts it in the three pure field controls; Phase 2b (separate spec) handles the three selects (combobox ARIA, keyboard nav, de-dup).

**2a scope:** build **`useFieldA11y`** and **`useAnchoredPosition`** (both fully tested; `useAnchoredPosition` is consumed by the 2b selects but is pure positioning, so it's built + verified here first per the workflow's sequencing). Adopt `useFieldA11y` in **Input** (82 consumers), **FormField** (2 consumers — gets a render-prop API), **ChipInput** (1 consumer). Extract a shared `isValidEmail`. New `ui.*` keys.

**Hard constraint:** Input and ChipInput keep their **exact public APIs** (additive only) so consumers compile under `tsc=0`. FormField's `children` changes to a **render-prop** (user-approved) — its 2 consumers are rewritten in this PR.

---

## 2. Scope

**In:** `useFieldA11y`, `useAnchoredPosition` (+ tests); Input / FormField / ChipInput refactors; FormField's 2 consumers rewritten; a minimal additive `id`/aria pass on `RichTextEditor` (so FormField's render-prop can associate it); `isValidEmail` util; new `ui.*` keys; behavior tests.

**Out (→ Phase 2b):** PhoneInput, SearchableSelect, MultiSelectDropdown; `useCombobox`; combobox/listbox ARIA + keyboard nav; the select de-dup; consuming `useAnchoredPosition` in the selects.

**Guardrails:** Input/ChipInput public APIs additive-only; `tsc=0` + 6 CI gates green; neutral `slate/gray` stays (no `surface-foreground` token exists); the only token fix in-scope is none (these three are already token-clean — `bg-white` surfaces live in the 2b selects).

---

## 3. `useFieldA11y` (`src/hooks/useFieldA11y.ts`)

```ts
function useFieldA11y(opts: {
  id?: string;          // caller/RHF-supplied; else a useId() base
  hasError?: boolean;
  hasHint?: boolean;
  required?: boolean;
}): {
  fieldId: string;
  errorId: string;
  hintId: string;
  labelProps: { htmlFor: string };
  controlProps: {
    id: string;
    'aria-invalid'?: true;
    'aria-required'?: true;
    'aria-describedby'?: string;
  };
  errorProps: { id: string; role: 'alert' };
  hintProps: { id: string };
};
```

- `base = opts.id ?? useId()`; `fieldId = base`, `errorId = base + '-error'`, `hintId = base + '-hint'`.
- `aria-describedby` = join of `[hasHint && hintId, hasError && errorId]` (space-separated), or **omitted** (undefined) when neither — so RHF consumers that pass no error/hint get **zero** new DOM attributes.
- `aria-invalid` / `aria-required` are `true` or **omitted** (never `false`), so attributes appear only when meaningful.

Tests (node `.test.ts` via `renderHook`): `labelProps.htmlFor === controlProps.id`; describedby joins both / omits when none / error-only / hint-only; `aria-invalid` only when `hasError`; `aria-required` only when `required`; respects a passed `id`.

---

## 4. `useAnchoredPosition` (`src/hooks/useAnchoredPosition.ts`)

Built in 2a (pure positioning, decoupled), consumed by the 2b selects. Replaces the flip/portal logic triplicated across SearchableSelect/MultiSelectDropdown/PhoneInput.

```ts
function useAnchoredPosition(opts: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  estimatedHeight?: number;   // default 300 (flip threshold)
  matchWidth?: boolean;       // default true (match anchor width)
  width?: number;             // explicit px when !matchWidth (PhoneInput=260)
  gap?: number;               // default 0 (PhoneInput=4)
  viewportPadding?: number;   // default 8 (left-edge clamp)
}): { floatingStyle: React.CSSProperties; placement: 'top' | 'bottom'; recompute: () => void };
```

- On `open`: measure `anchorRef` rect; `placement = (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) ? 'top' : 'bottom'`; `floatingStyle = { position:'fixed', left: clamp(rect.left, viewportPadding, innerWidth - width), width: matchWidth ? rect.width : width, [placement==='bottom' ? 'top' : 'bottom']: …+gap, zIndex: 9999, maxHeight }`.
- Capture-phase `scroll` + `resize` listeners while open; cleaned up on close/unmount. `recompute()` forces re-measure (after async option loads / filtering).

Tests (jsdom — no layout, so assert behavior not pixels): returns `position:'fixed'` style with the expected keys; `placement` flips per **mocked** `getBoundingClientRect`; scroll+resize listeners added on open and removed on close; `recompute` is callable.

---

## 5. Input refactor (`src/components/ui/Input.tsx` — 82 consumers)

Preserve **exactly**: `forwardRef<HTMLInputElement>`, `extends InputHTMLAttributes`, `label?`/`error?`/`leftIcon?`, `className` lands on the `<input>`, `displayName='Input'`. **Add** one optional `hint?: string`.

- `const { fieldId, labelProps, controlProps, errorProps, hintProps } = useFieldA11y({ id: props.id, hasError: !!error, hasHint: !!hint, required: props.required });`
- `<label {...labelProps}>` (only when `label` present — RHF consumers that omit `label` are unaffected); asterisk `<span aria-hidden="true">`.
- `<input {...controlProps} {...props} … />` — `controlProps` first so a caller-supplied `id` (via `props.id`) wins; `controlProps.id` uses `props.id ?? fieldId`.
- `error` → `<p {...errorProps} className="mt-1 text-sm text-danger">` (id wired to `aria-describedby`). `hint` → `<p {...hintProps} className="mt-1 text-xs text-slate-500">` (new, optional).
- Keep `focus:ring-primary` → switch to `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (convention). Error border stays `border-danger`. Slate neutrals stay.

**Backward-compat:** the 9 RHF consumers (external `<label>`+error) pass no `label`/`error` → no internal label/error renders, and `aria-*` are omitted (no error/hint) → DOM unchanged besides an `id` on the input (harmless; RHF's `name` unaffected). Tests assert this.

## 6. FormField refactor (`src/components/ui/FormField.tsx` — render-prop, 2 consumers)

```tsx
interface FieldControlProps { id: string; 'aria-invalid'?: true; 'aria-required'?: true; 'aria-describedby'?: string; }
interface FormFieldProps {
  label: string; error?: string; required?: boolean; hint?: string;
  id?: string; className?: string;
  children: (control: FieldControlProps) => React.ReactNode;   // BREAKING: was ReactNode
}
```

- `useFieldA11y` → render `<label {...labelProps}>` (asterisk `aria-hidden`), then `children(controlProps)`, then `hint`→`<p {...hintProps}>` (when no error) and `error`→`<p {...errorProps}>` with a **lucide `AlertCircle`** (replace the inline `<svg>`), `aria-hidden` on the icon.
- `forwardRef<HTMLDivElement>` on the root (additive; React 19 — drop `React.FC`).
- **Rewrite the 2 consumers** to the render-prop:
  - `ArticleEditorModal`: `<FormField label hint>{(c) => <Input {...c} … />}</FormField>` for inputs/textarea; for the `<RichTextEditor>` field, `{(c) => <RichTextEditor {...c} … />}` — which requires a **minimal additive `RichTextEditor` change**: accept `id?`, `aria-invalid?`, `aria-describedby?`, `aria-labelledby?` and forward them to its `contenteditable` wrapper (full RichTextEditor hardening stays Phase 3).
  - `CategoryManagerModal`: inputs/select via `{(c) => <Input {...c}/>}`/`{(c) => <select {...c}/>}`; the **color-swatch `<div>` group** → `{(c) => <div role="group" aria-labelledby={labelId} aria-describedby={c['aria-describedby']}>…</div>}` (a group isn't a single labelable control, so `id`/`htmlFor` don't apply — `role="group"` + `aria-labelledby` is correct). FormField exposes the label's id for this (`labelProps`/an exported `labelId`).

> Note: a **separate, unrelated** file-local `FormField` exists in `GeneralSettings.tsx` (a leaf value/onChange input) — it does NOT consume this component and is out of scope (name collision only).

## 7. ChipInput refactor (`src/components/ui/ChipInput.tsx` — 1 consumer)

Preserve `value`/`onChange`/`placeholder?`/`label?`/`disabled?`; **add** optional `id?`, `required?`, `name?`, `error?` (external error merged with internal validation, controlled wins). Forward a ref to the inner `<input>` (React 19).

- Adopt `useFieldA11y`; `<label {...labelProps}>` (when `label`); `<input {...controlProps} id=… aria-label fallback when no label>`; internal/external error → `<p {...errorProps}>`; hint → `<p {...hintProps}>`.
- Route the 4 hardcoded strings + the chip remove `aria-label` through `t()` (new `ui.chipInput.*` keys; remove uses `t('ui.chipInput.removeEmail', { email })`).
- Keep the outer `<div>` as the single positioned root (the consumer absolutely-positions an external button against it).
- De-dup the email regex into `isValidEmail` (§8).

## 8. Shared `isValidEmail` + i18n keys

- **`isValidEmail`** in `src/lib/utils.ts` (or `src/lib/validators.ts`): the regex currently duplicated in ChipInput + `EmailDocumentModal`; update both call sites.
- **New `ui.chipInput.*` keys** (en + ar): `placeholder` ('Enter email and press Enter'), `invalidEmail`, `duplicateEmail`, `hint`, `removeEmail` ('Remove {{email}}'). Reuse `ui.required`.

## 9. Testing

- `useFieldA11y.test.ts` (node) and `useAnchoredPosition.test.tsx` (jsdom) — per §3/§4.
- `Input.test.tsx`: label `htmlFor` ↔ input `id`; `aria-invalid`+`aria-describedby` when `error`; `hint` wired; **RHF-shape** (no `label`/`error` → no label/error rendered, no stray `aria-*`); `forwardRef` still reaches the input; asterisk `aria-hidden`.
- `FormField.test.tsx`: render-prop receives `controlProps`; label `htmlFor` matches the injected `id`; error `role="alert"`; hint wired; the color-swatch `role="group"` association path.
- `ChipInput.test.tsx`: label association; add/remove still works; `aria-invalid` on internal validation error; remove button `aria-label`.

Existing suites stay green; `npm test` runs both projects.

## 10. Backward-compat & CI

- Input/ChipInput: additive only (Input +`hint?`; ChipInput +`id?`/`required?`/`name?`/`error?`). `tsc=0` proves the 82 + 1 consumers compile.
- FormField: `children` → render-prop is **breaking**, but only 2 consumers (both rewritten here). `RichTextEditor` change is additive.
- No banned tokens; `focus-visible` adopted on Input.

## 11. Sequencing (one PR, ordered tasks)

1. `useFieldA11y` (+ tests).
2. `useAnchoredPosition` (+ tests).
3. `isValidEmail` util + the `ui.chipInput.*` keys.
4. Input refactor (+ tests).
5. `RichTextEditor` additive `id`/aria pass.
6. FormField render-prop refactor (+ tests) **and** rewrite its 2 consumers.
7. ChipInput refactor (+ tests) + update `EmailDocumentModal` to `isValidEmail`.
8. Full verification (both projects, typecheck, lint).

## 12. Risks & mitigations

- **Input `controlProps` vs `{...props}` ordering** (a caller-passed `id`/`aria-*` must win or be intentionally overridden): spread `controlProps` then `{...props}`, and have `useFieldA11y` honor `opts.id` — tested.
- **RHF consumers getting unexpected `aria-*`**: omit-when-undefined in the hook; explicit RHF-shape test.
- **FormField consumer rewrite regressions** (RichTextEditor, color-swatch group): covered by FormField tests + the additive RichTextEditor change; manual smoke of the two KB modals.
- **`useAnchoredPosition` built but unconsumed in 2a**: acceptable — it's pure, fully unit-tested, and 2b adopts it immediately.

## 13. Acceptance criteria

1. `useFieldA11y` + `useAnchoredPosition` created with the specified APIs + tests passing.
2. Input/FormField/ChipInput adopt `useFieldA11y`; label↔control associated; error/hint wired via `aria-describedby`; `aria-invalid`/`aria-required` correct.
3. Input + ChipInput public APIs additive-only (82 + 1 consumers compile); FormField render-prop + its 2 consumers rewritten + `RichTextEditor` additive change.
4. `isValidEmail` shared; ChipInput copy via `t()`; new `ui.chipInput.*` keys (en + ar).
5. All listed tests pass; existing suites green; `tsc=0`; lint clean; no banned tokens.
6. RHF consumers of Input unaffected (no stray DOM/aria when label/error omitted).
