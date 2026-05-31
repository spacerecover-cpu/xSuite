# UI Library Hardening — Phase 3 (Display & Data) Design

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Program:** Phase 3 of the 5-phase hardening (**Phase 3 = display & data** primitives). Builds on **Phase 0** (`cva` ^0.7.1 installed but still **unused repo-wide**, `cn`/`tailwind-merge` in `src/lib/utils.ts`, shared `Spinner`/`Skeleton`, `STATUS_TONE`/`STATUS_TONE_MUTED` in `src/lib/ui/variants.ts`, jsdom harness, `ui.*` i18n) and **Phase 2** (`useFieldA11y`, `useAnchoredPosition`, `useListboxKeyboard`).
- **Evidence:** an 11-agent parallel component-inspection workflow (firsthand reads of each file + every cited consumer) consolidated below. Line numbers and consumer counts are from those reads.

---

## 0. Sign-off (locked 2026-05-31) — overrides §8 defaults

User chose **Aggressive** behavior-change scope **+ include RichTextEditor write-side sanitize**. The following §8 items are therefore **IN SCOPE** for this PR (overriding the conservative defaults written in §4/§6/§8):

- **IN — Button `focus:ring-2` → `focus-visible:ring-2`** (§8 #8). Drop the click-time ring for all 188 consumers to match Phase-2 Input house style.
- **IN — Badge: ACTIVATE the dead `color` prop** (§4.2, §6, §8 #4). `color` now applies a background to non-`custom` badges (currently dropped). Invalid CSS values (`'green20'`, etc.) are browser-ignored — acceptable; valid named/hex values (`EmployeesList.tsx:189,192`, `RolePermissions.tsx:247`, `DatabaseManagement.tsx:218,223`) will visibly recolor. Preserve a sane foreground (auto-contrast or keep current text class). Still apply the `cn()` precedence fix.
- **IN — RichTextEditor write-side sanitize** (§8 #1). Wire the EXISTING `src/lib/sanitizeHtml.ts` at the `onChange`/source-toggle boundary. No new package.
- **IN — interactive keyboard a11y / new tab stops**: Badge `onClick` (`role="button"`+`tabIndex`+Enter/Space), Table `onRowClick` rows, ImageUpload dropzone (§8 #5, §4.4, §4.10).
- **IN — Toast `aria-live`** (§8 #2); **IN — CustomerAvatar inert-without-photo fix + `onError` fallback** (§8 #6, keep `role="button"` div, NOT a real `<button>`); **IN — CollapsibleSection disclosure + `type="button"`**; **IN — all `bg-white`→`bg-surface` swaps** (verified pixel-identical: `--color-surface: 255 255 255` is a constant `:root` token, `index.css:34`, with no per-theme override).

**Still DEFERRED to their own PRs (NOT in this phase):**
- **Toast dual-system unification** (385 raw `toast.*` across 90 files) — §8 #3.
- **ImageUpload actual upload-wiring** of `onUploadComplete`/`bucketName` — §8 #9. (Keep the props in the signature + JSDoc "accepted but unused"; resurrect the spinner via the new additive `loading` prop only.)
- **StatsCard trend redesign** — §8 #7. (Add a **characterization test** locking current `{value,isPositive}` behavior; do NOT change trend semantics.)

---

## 1. Context & Goal

The display/data tier is the **last un-hardened layer** of `src/components/ui/`. Every component here hand-rolls its variant/size/tone matrix as inline lookup objects or template-literal class concatenation, **none** use `cn()`, so a consumer `className` only wins by CSS source-order luck (not `tailwind-merge` conflict resolution). `cva` was installed in Phase 0 and is imported **nowhere** — Phase 3 is its first adoption, and Button/Badge/Card set the de-facto house pattern for the rest of the codebase. Several primitives carry **confirmed concrete bugs** (Badge dead `color` prop + class-precedence; Toast missing `aria-live` + a dual toast system; ImageUpload three dead APIs + unreachable spinner; RichTextEditor unsanitized write boundary; CustomerAvatar inert-without-photo).

Phase 3 adopts `cva` + `cn` for the variant components, wires the shared `Spinner`/`Skeleton` into the loading-capable surfaces, routes status tones through `STATUS_TONE`/`STATUS_TONE_MUTED`, fixes `bg-white` token leaks, routes hardcoded copy through `t()` (default-only), and lands the a11y + concrete-bug fixes — **additive-only** so all consumers keep compiling at `tsc=0`.

**Consumer surface (fanout, why blast radius matters):** Button **188**, Badge **96**, Card **60**, Table **7**, StatsCard **7**, Toast **1** (via `useToast`, itself imported by ~31 files), CollapsibleSection **2**, CustomerAvatar **3**, DeviceRoleBadge **1**, ImageUpload **2**, RichTextEditor **3**.

---

## 2. Scope

**In:**
- **cva adoption** (first in repo) for the variant/size/tone matrices: **Button**, **Badge**, **Card**, **StatsCard** (tone via `STATUS_TONE_MUTED`), **DeviceRoleBadge**, **ImageUpload** (density), with smaller `cn()`-only cleanups for **Table**, **Toast**, **RichTextEditor** toolbar, **CustomerAvatar**.
- **`cn()` everywhere** a class string is assembled (consumer `className` must win via `tailwind-merge`).
- **`Spinner`/`Skeleton`** wired into the loading-capable surfaces: Button (`isLoading`→Spinner+`aria-busy`), Table (`loading`+`skeletonRows`), StatsCard (`loading`→Skeleton), ImageUpload (`loading`→Spinner resurrecting the dead path).
- **`STATUS_TONE`/`STATUS_TONE_MUTED`** sourcing for Badge status rows, StatsCard chip + trend, Toast tones, RichTextEditor quick buttons (keep DeviceRoleBadge's self-contained role map — it adds `border-<tone>/30` not in the shared map).
- **Token-leak fixes:** `bg-white`→`bg-surface` in Card, Table, CollapsibleSection, ImageUpload, RichTextEditor popovers; banned **cyan** removed from CustomerAvatar.
- **Copy → `t()`** (default-only `prop ?? t(key)`) and the per-component a11y fixes.
- **The confirmed concrete-bug fixes** (§6 table), each flagged for sign-off where it changes runtime output.

**Out:**
- **Phase 4 i18n-activation** (turning on the `ar` locale switch UI, ICU audit) — Phase 3 only *adds* keys.
- **No new design tokens** (the locked 14-token vocabulary stands; `accent` still has no `-muted` pair).
- **No new npm packages** — the RichTextEditor sanitize fix wires the *existing* `src/lib/sanitizeHtml.ts`; **DOMPurify is explicitly NOT added** (gated by the CLAUDE.md no-new-packages rule; that swap is a separate signed-off effort per `docs/client-portal-audit.md` P0.9).
- **The dual-toast-system unification** (385 raw `toast.*` calls across 90 files) — flagged in §8 as a separate dedicated PR, NOT done here.
- **Sibling/leaf components** that merely surfaced during inspection: `FinancialStatsCard.tsx`, the file-local `FormField` in `GeneralSettings.tsx`, `CollapsibleSection`'s sibling leak — out of scope (name collisions / different files).

**Guardrails:** public APIs **additive-only** (new optional props + React-19 `ref`-as-prop OK; never remove or change existing prop semantics); **`tsc=0`**; all **6 CI gates** green; neutral `slate`/`gray` utilities stay (there is **no** `surface-foreground` token); **behavior-preserving by default** — anything that changes runtime output is enumerated in §6/§8 for explicit sign-off and nothing else.

---

## 3. cva adoption pattern (canonical — Button as the worked example)

`cva` is installed (`package.json:23 "class-variance-authority": "^0.7.1"`) but imported nowhere. Phase 3 establishes the house pattern. **The matrix lives in a module-level `cva()` config; the final class is composed with `cn()` so the consumer `className` is the LAST argument and wins conflicting utilities via `tailwind-merge`.** Any pre-existing public alias layer (e.g. Button's 7→4 `VARIANT_ALIAS`) stays as a thin pre-map that resolves the public prop to a cva variant key **before** calling the variants function — public prop semantics are byte-identical.

```ts
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  // BASE = today's baseClasses string, VERBATIM (behavior-preserving)
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  {
    variants: {
      variant: {
        primary:   'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
        secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 focus:ring-slate-500',
        danger:    'bg-danger text-danger-foreground hover:bg-danger/90 focus:ring-danger',
        ghost:     'text-slate-700 hover:bg-slate-100 focus:ring-slate-500',
      },
      size: { sm: '…', md: '…', lg: '…' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

// Public API keeps 7 variant names; VARIANT_ALIAS resolves outline→ghost, default→primary, destructive→danger.
className={cn(buttonVariants({ variant: resolvedVariant, size }), className)}
```

**Rules:** (1) BASE strings reproduce today's exact utilities for the resolved variants/sizes (snapshot-equivalence before/after for the 188-consumer Button and 96-consumer Badge). (2) Keep the **explicit string-literal union** in the public prop type (do not loosen to `VariantProps`-only) so existing narrowed call sites keep `tsc=0`. (3) Optionally `export` the `*Variants` fn for reuse. (4) `cn()` order: `cn(variants(...), className)` — consumer last.

---

## 4. Component subsections

### §4.1 Button (`src/components/ui/Button.tsx`, 57 LOC, **188 consumers / 662 JSX usages**)

- **Current:** `React.FC<ButtonProps>` extending `ButtonHTMLAttributes`; 7 variant names (`primary|secondary|danger|ghost|outline|default|destructive`) collapse to 4 visual styles via `VARIANT_ALIAS` (L12-20); `variantClasses` (L33-38) + `sizeClasses` (L40-44); final class is template-literal concat at **L50** (no `cn()`); `disabled={disabled || isLoading}` (L51); **no ref**.
- **cva:** define `buttonVariants` per §3 with BASE = current `baseClasses` verbatim; keep `VARIANT_ALIAS` as the pre-map. Compose `cn(buttonVariants({variant: resolvedVariant, size}), className)`.
- **Bug fix (low — latent):** `isLoading` is documented + gates `disabled` but renders **no spinner and sets no `aria-busy`** (declared L8, default L25, used only at L51; body L48-56 never renders a spinner). **0 consumers pass `isLoading` today** (grep = 0). Fix: when `isLoading`, render leading `<Spinner size={mapped} />` (sm/md→sm, lg→md) and set `aria-busy={isLoading || undefined}`. Spinner already emits `role="status"` + `sr-only t('common.loading')`.
- **Additive API:** `ref?: React.Ref<HTMLButtonElement>` (React-19 ref-as-prop, spread onto `<button ref={ref}>`); optional `loadingLabel?: string` forwarded to `<Spinner label>` (no new i18n key); *optional/skip-if-it-broadens-scope* `leftIcon?`/`rightIcon?` slots.
- **Tokens/copy:** none hardcoded inside Button (children are consumer-supplied). `secondary`/`ghost` stay slate (allowed neutral; the brand-token question — should `secondary` use `bg-secondary` — is **noted, NOT changed** here, it would be a visual behavior change).
- **a11y:** add `aria-busy` (above); `{...props}` already forwards a caller `aria-label` (icon-only-button guard cannot be enforced without a breaking type change — left as-is).
- **Behavior change (sign-off):** `focus:ring-2`→`focus-visible:ring-2` to match Phase-2 Input house style **affects all 188 consumers' click feedback** — list under §8, **deferrable** to keep the PR strictly behavior-preserving.

### §4.2 Badge (`src/components/ui/Badge.tsx`, 66 LOC, **96 consumers**)

- **Current:** `React.FC<BadgeProps>`, single `<span>`, **not** extending `HTMLAttributes` (no DOM passthrough); `VARIANT_ALIAS` (L15-25) collapses 9→7 (`error→danger`, `outline→secondary`); `variantClasses` (L38-46) + `sizeClasses` (L48-52); template-literal concat at **L58** (no `cn()`).
- **Bug fix (HIGH, two linked defects):**
  1. **Class-precedence:** L58 raw concat means a consumer's conflicting `className` does **not** reliably win — e.g. `PlansPage.tsx:138 <Badge className="bg-primary …">` emits duplicate `bg-slate-100 … bg-primary` and only wins by source-order accident (same at `ChainOfCustodyTab.tsx:462,504`). **Fix:** `cn('inline-flex items-center font-semibold rounded-md transition-all', variantClasses[resolvedVariant], sizeClasses[size], onClick && 'cursor-pointer', className)` — `className` last.
  2. **Dead `color` prop:** `computedStyle = style || (color && resolvedVariant === 'custom' ? … : {})` (L54) — `color` is dropped unless `variant="custom"`; ~12 consumers pass `color` without it (`EmployeesList.tsx:189,192`, `RolePermissions.tsx:247`, `DatabaseManagement.tsx:218,223`, `AuditTrails.tsx:176`, `SystemLogs.tsx:199`, etc.), some with invalid values (`'blue'`, `'green'`→`'green20'` hex). **Do NOT activate the dead path in this PR** — keep `color`/`style`/`custom` byte-identical (§8 records that activating it is a separate signed-off visual change; the real fix is migrating those consumers to real variants in a follow-up).
- **cva:** `badge = cva(base, { variants: { variant, size, interactive }, defaultVariants })`, sourcing the status rows from `STATUS_TONE_MUTED` (`success/warning/danger/info`) + the existing `ring-1 ring-<tone>/30` suffix; normalize incoming variant through `VARIANT_ALIAS` first. `interactive: !!onClick` drives `cursor-pointer`.
- **Additive API:** change `BadgeProps` to `extends React.HTMLAttributes<HTMLSpanElement>` (keep `children/variant/size/color` explicit), add `ref?: React.Ref<HTMLSpanElement>`, spread `...rest` onto the span **before** component-managed `className`/`style` (define onClick precedence explicitly to avoid double-binding). 96 call sites stay valid.
- **a11y (sign-off):** making `onClick` badges keyboard-operable (`role="button"`, `tabIndex=0`, `onKeyDown` Enter/Space, focus ring) — listed under §8; currently `onClick` spans are mouse-only.
- **Token note:** inline `'#3B82F6'`/`'#f1f5f9'`/`'#3b82f6'` injected via `style` at call sites (`InventoryDetailModal.tsx:202`, `ReportSectionsPage.tsx:265`, `PurchaseOrdersListPage.tsx:203`) — consumer leaks, **not fixed from Badge**; noted for a follow-up.

### §4.3 Card (`src/components/ui/Card.tsx`, 54 LOC, **60 consumers**)

- **Current:** `variantClasses` (L30-34) + `hoverable` ternary (L46); template-literal assembly (L43-48); `bg-white` in `baseClasses` (**L28**). **No named bug** (the always-emitted transparent `border-t-4` on default variant is a pre-existing cosmetic artifact, not fixed here).
- **cva:** `cardVariants = cva('rounded-lg transition-all duration-200', { variants: { variant: {default,bordered,outlined}, hoverable: {true,false} }, defaultVariants })`; export it + `VariantProps`-derived type for reuse (e.g. a later StatsCard follow-on).
- **Token fix (sign-off, §8):** move `bg-surface` into the cva base, replacing `bg-white` (L28) — visible token swap under any theme where `--color-surface ≠ #fff`; the program-mandated fix but needs design sign-off across royal/burgundy/scarlet. `border-slate-200` stays (allowed neutral).
- **`cn()`:** `cn(cardVariants({variant, hoverable}), className)` — consumer wins.
- **Additive API:** `ref?: React.Ref<HTMLDivElement>` (measure/scroll). Keep `borderColor` (inline `borderTopColor` on default variant, L49), `onClick`, `onKeyDown`, `role`, `tabIndex`, `aria-label` semantics untouched.
- **a11y:** Card delegates `onKeyDown` to the consumer (L38-41); **0 of 60** consumers pass `onClick`/`role`/`tabIndex`, so baking Enter/Space activation is **not done** (scope creep; §8 deferred item).

### §4.4 Table (`src/components/ui/Table.tsx`, 73 LOC, **7 consumers**)

- **Current:** generic `Table<T>`; props `data`/`columns`/`onRowClick` only; `getRowClassName(idx)` template concat (L21-28); `bg-white` at **L26** (zebra even) and **L46** (`<tbody>`); hardcoded `'No data available'` (L50); **no loading state**. **No named bug.**
- **`cn()` (cva low-value here):** replace `getRowClassName` concat with `cn(...)`; the interactive/zebra axes are minor — `cn()` preferred over a `cva` config unless the program wants the demonstration.
- **Token fix:** `bg-white`→`bg-surface` at L26 + L46.
- **Copy:** `'No data available'` → `t('ui.noData')` (**key already exists**, `i18n.ts:31` en / `:491` ar — zero new keys) via `useTranslation` (Spinner-style import). Add optional `emptyMessage?: React.ReactNode` with default-only `emptyMessage ?? t('ui.noData')`.
- **a11y (additive, attribute-only):** `scope="col"` on every `<th>` (L36); optional `caption?: string` → `<caption className="sr-only">` + `'aria-label'?` passthrough on `<table>` (L32, default omitted = identical output).
- **Loading state (additive):** `loading?: boolean` (default false) + `skeletonRows?: number` (default 5) → render N `<tr>`s each with one `<Skeleton className="h-4 w-full" />` per column. Lets the 7 consumers drop bespoke pre-Table spinners over time (none pass it today).
- **Additive API:** `className?: string` merged onto the outer container via `cn('overflow-x-auto rounded-lg border border-slate-200', className)`; optionally `export` `Column`/`TableProps`.
- **Behavior change (sign-off, §8):** keyboard-operable rows when `onRowClick` set (`tabIndex=0`, `role="button"`, Enter/Space) — affects the 3 row-nav consumers (`TenantSupportTab.tsx:74`, TenantUsersTab, SupportTicketsPage); and `key={idx}`→ stable key via an optional `rowKey?: (row,idx)=>React.Key`.

### §4.5 StatsCard (`src/components/ui/StatsCard.tsx`, 49 LOC, **7 consumers**)

- **Current:** `colorClasses` map (L12-19, `blue/green/orange/red/purple/yellow`→`bg-*-muted text-*`, `orange`&`yellow` duplicate to warning, `purple`→solid `bg-accent text-accent-foreground`); trend tone is an inline `isPositive` ternary (L38) + parallel arrow ternary (L39); template-literal class interpolation (L34, L38); wraps `<Card>` (inherits Card's `bg-white` — fixed in §4.3, **not duplicated here**).
- **Bug (low — latent):** the "up-arrow/down-color mismatch" is **REFUTED** (both driven by the same `trend.isPositive` at L38-39, always consistent). The **real** defect is API-design: `trend.value` (magnitude) and `trend.isPositive` (direction) are independent → `{value:-5, isPositive:true}` renders `-5%` (L40) beside a green `TrendingUp`; no "negative-is-good" support. Only consumer `PayrollDashboard.tsx:85` always passes `{value:0, isPositive:true}` — no live miscolor. **Do NOT change trend semantics** here (§8 deferred); add a **characterization test** locking current behavior.
- **Tone via shared map:** route the icon chip through `STATUS_TONE_MUTED` via alias `{ blue:'info', green:'success', orange:'warning', yellow:'warning', red:'danger', purple:'accent' }` (default `blue`→`info`), deleting `colorClasses`. Route trend color through `STATUS_TONE['success'|'danger']` text derivation, `isPositive` still the driver (behavior-preserving). `purple`→`STATUS_TONE_MUTED.accent` stays **solid** (accent has no `-muted` pair) — preserving `PlatformDashboard.tsx:115`'s current look; if a reviewer wants it muted that's a §8 visual change.
- **`cn()`:** replace template interpolation (L34, L38) so a new `className?` can win.
- **Additive API:** `className?: string` (merged onto the outer Card); `loading?: boolean` → swap value `<p>` (L45) for `<Skeleton className="h-9 w-24" />` keeping title + chip (sanctioned replacement for the `value="..."` fake-loading pattern). `ref` forwarding is **deferred to the Card task** (Card takes no ref today; do not break Card's API from here).
- **Copy/a11y:** add `aria-hidden="true"` to the decorative metric Icon (L35) and the trend arrows (L39); add an `aria-label` on the trend wrapper (L38) via new `ui.statsCard.trendUp`/`trendDown` (`'Up {{value}}%'`/`'Down {{value}}%'`), default-only. Keep literal `'%'` (locale-stable).

### §4.6 Toast (`src/components/ui/Toast.tsx`, 121 LOC, **1 consumer** — `useToast`, itself imported by ~31 files)

- **Current:** `toastConfig` map (L11-52) of 5 class strings + lucide Icon per `type` (`success|error|warning|info|loading`); container template literal (L79-86); `bg-black/5` progress track (L112); hardcoded `aria-label="Close notification"` (L104); **no `role`/`aria-live` on root** (L78-87).
- **Bug (HIGH, two parts):**
  1. **`aria-live` missing** — root div has no `role`/`aria-live`; rides inside `toast.custom()` (`useToast.tsx`) on a single `<Toaster>` (`App.tsx:164`) whose default chrome is stripped (`App.tsx:168-172`) → **zero SR announcement**. **Fix (additive, in-scope):** `role={type==='error'||type==='warning' ? 'alert':'status'}`, `aria-live={… ? 'assertive':'polite'}`, `aria-atomic="true"` on the root (L78). This is the primary audit fix.
  2. **Dual toast system** — Toast.tsx (5 sites via `useToast`) competes with **385 raw `toast.success/error/loading` calls across 90 files** rendering react-hot-toast's default (chrome-stripped) UI on the same `<Toaster>`. **OUT OF SCOPE** — a cross-cutting refactor; §8 records it as a separate signed-off PR.
- **Tone via shared map:** replace the bg/text portion of `toastConfig` with `STATUS_TONE_MUTED` via a `type→StatusTone` map (`error→danger`, `loading→info`; `success/warning/info` pass through), keeping a slim typed Record (or a `cva`) for the bits the shared map doesn't cover (`borderColor`, `progressColor`, `Icon`). **Mapping `error→danger`/`loading→info` is the off-by-one risk — cover with the per-type icon/color test.**
- **`cn()`:** replace the template literals (L79-86, L89, L91, L103, L114) so a new `className?` wins.
- **Token tidy:** `bg-black/5` (L112) → neutral token utility (e.g. `bg-slate-200/60`).
- **Copy:** `aria-label={closeLabel ?? t('ui.toast.close')}` (or reuse existing `ui.close`); add `ui.toast.close` en + ar.
- **Additive API:** `className?` (merged last via `cn`), `closeLabel?`, optional `role?`/`aria-live?` overrides, `ref?: React.Ref<HTMLDivElement>`.
- **a11y:** `aria-hidden="true"` on the status Icon (L90); *optional* swap the inline `Loader2 animate-spin` (L91) for the shared `<Spinner>` (or at minimum `motion-safe:animate-spin`) — the latter adds an `sr-only` "Loading…" announcement (§8 minor).

### §4.7 CollapsibleSection (`src/components/ui/CollapsibleSection.tsx`, 105 LOC, **2 consumers**)

- **Current:** controlled (`isOpen`+`onToggle`) / uncontrolled (`defaultOpen`); `color` is a **required, load-bearing** inline-style escape hatch (`style={{backgroundColor: color}}` at L71) — the ~14 call sites pass a **mix** of raw hex (`#0ea5e9`, `#10b981`, `#f59e0b`, `#14b8a6`, `#ec4899`, `#06b6d4` in `GeneralSettings.tsx`) and token strings (`rgb(var(--color-primary))`). `bg-white` at **L62**; gradient `to-white`/`from-white` at **L65**; `text-white` glyph (L73); hardcoded `'fields'` (L79).
- **Bug (MEDIUM — a11y disclosure incomplete):** trigger **IS** a real `<button>` with `aria-expanded` (L63-67) — keyboard-operable, suspected concern **REFUTED**. But it lacks `aria-controls`, the content region (L91-98) has no `id`/`role`/`aria-labelledby`, and the button has **no `type="button"`** (L63 — would submit a wrapping form). **Fix (attribute-only, behavior-preserving):** `React.useId()` → `aria-controls={contentId}` on the button + `id={contentId}` on the content; `role="region"` + `aria-labelledby={titleId}` on the content + `id={titleId}` on the `<h3>` (L76); add `type="button"`.
- **cva: NOT forced** — the only style axis is the free-form `color` inline style, which `cva` can't model. *Optional additive:* a `tone?: 'primary'|'secondary'|'accent'|StatusTone` prop that maps via `STATUS_TONE` to chip classes, leaving `color` as the legacy fallback (token-correct migration path without breaking the API).
- **Token fix (sign-off, §8):** `bg-white`→`bg-surface` (L62); gradient `to-white`→`to-surface` (L65), keep slate hovers; `text-white` left (sits on the arbitrary `color` chip). Verify `--surface == white` across themes.
- **`cn()` + additive `className?`** merged last on container/button/chevron (L62, L65, L85-87).
- **Copy:** `'{fieldCount} fields'` → `t('ui.fieldCount', { count: fieldCount })` with ICU plural `ui.fieldCount_one`/`_other` (en + ar), mirroring the existing `optionCount_*` pattern (`i18n.ts:78-79` / `:542-547`).
- **a11y:** `aria-hidden="true"` on the decorative ChevronDown (L84-88) + Icon (L73). **NOT done:** `hidden`/`inert` on the collapsed content (would break the `scrollHeight` height-animation at L32-51) — §8 deferred.

### §4.8 CustomerAvatar (`src/components/ui/CustomerAvatar.tsx`, 79 LOC, **3 consumers**)

- **Current:** `sizeClasses` (L13-18) **and** redundant `sizeStyles` inline-`fontSize` map (L20-25, applied only to the initials branch L74); `interactiveClasses` ternary (L38-40); template concat (L37, L51, L73). Banned **cyan**: `hover:ring-cyan-300` (L39), `from-cyan-400 to-cyan-600 text-white` (L73).
- **Bug (MEDIUM):** suspected "no keyboard path" **REFUTED** (photo branch has `role="button"`, `tabIndex=0`, Enter/Space at L53-60). **Real bug:** interactivity is gated on `photoUrl` — `interactiveClasses` requires `&& photoUrl` (L38), `handleClick` early-returns unless `photoUrl` (L43), and role/tabIndex/onKeyDown live **only** in the `if (photoUrl)` branch (L48-68). The initials fallback (L71-78) **silently drops `onClick`/`clickable`**. **Fix:** factor the interactive attributes so **both** branches render identically when interactive.
- **cva:** collapse `sizeClasses` + `sizeStyles` into one `avatarVariants({ size, interactive })` (each size carries width/height + text-size; **drop the inline `fontSize` path**); `cn(base, variants, className)`.
- **Token fix:** `hover:ring-cyan-300`→`hover:ring-ring`; `from-cyan-400 to-cyan-600 text-white`→`bg-primary text-primary-foreground` (or `STATUS_TONE.accent`); add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` on the interactive variant.
- **Copy/a11y:** optional `ariaLabel?` with default-only `t('ui.avatar.viewPhoto', { name })` for the interactive action (the nested `img alt` only names the person, not the action); add `ui.avatar.viewPhoto` en + ar.
- **Additive API:** `ref?: React.Ref<HTMLDivElement | HTMLButtonElement>`. **Keep `role="button"` div — do NOT emit a real `<button>`** (`PortalLayout.tsx:137-150` nests the avatar inside a parent `<button>`; a real button would be invalid nested HTML) — §8 records this explicit choice.
- **Behavior change (sign-off, §8):** the bug-fix makes photo-less avatars clickable; add `img onError`→initials fallback (changes the broken-URL render). Only `CustomerProfilePage.tsx:427-428` passes `onClick` (gated on `!!profile_photo_url`) so blast radius today is ~nil.

### §4.9 DeviceRoleBadge (`src/components/ui/DeviceRoleBadge.tsx`, 67 LOC, **1 consumer**)

- **Current:** `roleConfig` (L11-32, `{label,color,icon}` — `color` already semantic tokens like `bg-info-muted text-info border-info/30`); `sizeClasses` (L44-48) + `iconSizes` (L50-54) **declared inside render** (re-allocated each render); template concat (L58-61); case-insensitive role lookup with `patient` fallback (L40-41). **No bug** (suspected hex leak **REFUTED** — no raw hex, no `bg-white`, no purple/indigo/violet). **No token leaks.**
- **cva:** hoist module-level `deviceRoleBadge = cva(base, { variants: { role: {patient,backup,donor,clone}, size }, defaultVariants })` replacing `roleConfig.color` + `sizeClasses`; keep a small `iconSizes` lookup (or a 2nd tiny cva). Keep `border-<tone>/30` (the badge's visual signature, **not** in `STATUS_TONE_MUTED` — do not drop) and the `clone→accent` mapping → **self-contained cva role map, NOT the shared map**.
- **Split data:** `roleMeta` map `{ patient: {icon, labelKey}, … }` drives icon + i18n key; cva drives classes.
- **`cn()`:** replace template literal (L58-61) so a consumer `className` wins (sole consumer passes none).
- **Copy (sign-off, §8):** route the 4 labels through `t()` — `ui.deviceRole.{patient,backup,donor,clone}` (en near L81, ar near L534). Output becomes locale-dependent (Arabic shows localized term); en is visually identical. **Tests must pin the en locale.** The `role` value is a free-form DB string (`catalog_device_roles.name`) — **preserve** the case-insensitive lookup + `patient` fallback exactly; do **not** narrow `role` to a union (would break `tsc=0` at `CaseDevicesTab.tsx:300`).
- **a11y:** `aria-hidden="true"` on the decorative Icon (L63 — label text always renders).
- **Additive:** optional `ref?: React.Ref<HTMLSpanElement>` and `...rest` span passthrough (polish only).

### §4.10 ImageUpload (`src/components/ui/ImageUpload.tsx`, 369 LOC, **2 consumers**)

- **Current:** `onChange(file, previewUrl)` is the ONLY wired output; density derived by **string-sniffing** `className.includes('compact-upload')` in **6 places** (L228, 278, 296, 299, 303, 307, 315); template concat throughout.
- **Bug (HIGH — three dead APIs):**
  1. `onUploadComplete` declared (L10) → `_onUploadComplete` (L27), **never called**; no consumer passes it.
  2. `bucketName` declared (L17) → `_bucketName` (L34), **never used** — yet **8 call sites pass it** (`GeneralSettings.tsx:1039,1048,1057,1076,1106,1136,1166`; `CustomerProfilePage.tsx:942`) believing it routes storage. Root cause: ImageUpload never uploads (it only validates + emits the raw File; parents call `fileStorageService.uploadFile` with their own bucket arg). **No data-loss bug today**, latent trap.
  3. `uploading` state has no setter (`_setUploading` L43 never invoked) → Loader2 branch (L301-304) **unreachable**; `setUploadSuccess(true)` never called → Check badge (L245-249) dead.
  - **Decision:** **keep `onUploadComplete`/`bucketName` in the signature** (removing breaks 8 call sites) — document as accepted-but-unused via JSDoc. Do **NOT** silently delete; actually wiring the upload inside is §8 sign-off.
- **cva:** replace the 6 substring checks with `imageUploadVariants` keyed off a new optional `density?: 'default'|'compact'`; when undefined, **fall back to `className.includes('compact-upload')`** so `CustomerProfilePage` (the only `enableCrop` + `compact-upload` consumer, L933-947) is unaffected. Read the **raw** `className` for the sniff, not the merged output.
- **Loading (additive, resurrects dead path):** `loading?: boolean` (aliasing dead `uploading`) → render the shared `<Spinner>` (L301-304) instead of bare Loader2; default false.
- **Token fixes:** `bg-black bg-opacity-0 group-hover:bg-opacity-40` (L231) → token scrim (§8 minor visual); prefer `bg-surface`/`bg-surface-muted` where `bg-slate-50/100/200` are surface backgrounds (L224, 253, 282, 298) — slate is allowed, so this is optional polish.
- **a11y:** `htmlFor` on the `<label>` (L217) ↔ `id` on the file `<input>` (L288-294), reuse **`useFieldA11y`** (Phase 2a); `role="alert"` `aria-live="polite"` on the error block (L342); localized descriptive `img alt` (L227, currently `"Preview"`); `aria-hidden` on decorative icons (L247, 302, 306, 328, 344).
- **`cn()`** for all class merging (L214, 228, 277-283, 296-316), `className` last.
- **Copy:** route the ~14 strings through `t()` (`ui.imageUpload.*` + reuse `ui.remove`); add en (after `ui.select`, ~L81) + ar (~L549).
- **Behavior change (sign-off, §8):** dropzone div → `role="button"` + `tabIndex=0` + Enter/Space (new tab stop); auto-spinner during the internal `getImageDimensions` async window (if added) changes current output; the token scrim swap.

### §4.11 RichTextEditor (`src/components/ui/RichTextEditor.tsx`, 388 LOC, **3 consumers**)

- **Current:** controlled `contentEditable` (`role="textbox"`) + HTML-source `<textarea>` toggle; Phase-2a additive a11y props already present (`id?`, `aria-invalid?`, `aria-describedby?`, `aria-labelledby?`); `formatButtons`/`listButtons` config arrays; **inbound** value IS sanitized (`sanitizeHtml(value || '')` at L70). Existing test file `RichTextEditor.test.tsx` (Phase 2a — 2 tests).
- **Bug (HIGH — write-side sanitization gap):** `handleInput` (L77-84) reads raw `editorRef.current.innerHTML` and passes it straight to `onChange` (L79-82) **unsanitized**; `toggleSourceMode` (L120) pushes raw `sourceValue` unsanitized. Stored-XSS safety rests entirely on every render site remembering `sanitizeHtml` (holds today: `PortalReports.tsx:342` renders to **customers** via `dangerouslySetInnerHTML` — highest blast radius; `KBArticleDetailPage.tsx:70,254`; `TemplateTypeDetail.tsx:365`). **Fix (defense-in-depth, sign-off):** wrap `editorRef.innerHTML` in `handleInput` and `sourceValue` in `toggleSourceMode` with the **existing** `sanitizeHtml` before `onChange`. **NOT byte-for-byte preserving** (disallowed tags now stripped on save) — §8. **No DOMPurify** (no new package).
- **Token fixes:** `bg-white`→`bg-surface` on the two popovers (L174, L209). The injected `<style>` placeholder `color: #94a3b8` (L344) and the `PRESET_COLORS`/`PRESET_HIGHLIGHTS` hexes (L34-48) + `applyQuickFormat` colors (L108, L111) are **intentional document-content palette** (analogous to `deviceIconMapper` SVG hexes) — **do NOT retokenize.**
- **cva (minor):** hoist the icon-button class `'p-2 hover:bg-slate-200 rounded transition-colors'` (repeated 9×) into a tiny `cva` with an `active` boolean variant (replaces the L304 `isSourceMode` ternary). Route the two Quick buttons (L282, L291) through `STATUS_TONE_MUTED.danger`/`.warning`.
- **Copy:** add a `ui.richText.*` block (en ~L81, ar ~L549) for placeholder + every button title/heading; `placeholder ?? t('ui.richText.placeholder')` (default-only, prop wins); keep `title` attrs **and** add `aria-label` from the same key.
- **a11y:** toolbar div (L146) → `role="toolbar"` + `aria-label={t('ui.richText.toolbar')}` + `aria-controls={id}`; `aria-label` on every icon-only button (title stays for mouse); `aria-hidden` on decorative lucide icons; color/highlight disclosure buttons get `aria-haspopup`, `aria-expanded`, `aria-controls`; **label `htmlFor` association MUST stay conditional on an explicit `id` prop** — auto-generating a fallback id would break `RichTextEditor.test.tsx:29` (`not.toHaveAttribute('id')`).
- **Behavior change (sign-off, §8):** the write-side sanitize; *optional* Escape/outside-click popover close (currently only toggles).

---

## 5. Spinner / Skeleton / STATUS_TONE adoption summary

| Component | Loading primitive | STATUS_TONE source |
|---|---|---|
| Button | `Spinner` (leading, on `isLoading` + `aria-busy`) | — |
| Table | `Skeleton` rows (`loading`+`skeletonRows`) | — |
| StatsCard | `Skeleton` (value, on `loading`) | chip via `STATUS_TONE_MUTED` (alias map); trend via `STATUS_TONE` |
| ImageUpload | `Spinner` (resurrects dead Loader2, on `loading`) | — |
| Badge | — | status rows via `STATUS_TONE_MUTED` + `ring/30` |
| Toast | (keep its `loading` Loader2; optional shared `Spinner`) | tones via `STATUS_TONE_MUTED` (`error→danger`, `loading→info`) |
| RichTextEditor | n/a (synchronous) | Quick buttons via `STATUS_TONE_MUTED.danger`/`.warning` |
| DeviceRoleBadge | n/a | **self-contained cva** (needs `border-<tone>/30`; do NOT use shared map) |
| Card / CollapsibleSection / CustomerAvatar | n/a (presentational) | — |

---

## 6. Concrete bug fixes (consolidated)

| Component | Severity | Evidence | Fix | Behavior change? |
|---|---|---|---|---|
| **Badge** — dead `color` prop + class-precedence | **high** | `Badge.tsx:54` (`color` only honored on `variant==='custom'`), `:58` (raw concat, `PlansPage.tsx:138`/`ChainOfCustodyTab.tsx:462,504`) | `cn()` (className last) **fixes precedence now**; **keep** `color`/`custom` byte-identical (activating the dead path = separate §8 change) | Precedence fix: yes for any consumer relying on source-order (rare) — §8 |
| **Toast** — no `aria-live` | **high** | `Toast.tsx:78-87` (root, no role/aria-live) | add `role`/`aria-live`/`aria-atomic` (alert vs status by type) | yes (new SR announcements) — §8 |
| **Toast** — dual toast system | **high** | 385 raw `toast.*` across 90 files vs 1 `Toast.tsx` consumer; `App.tsx:168-172` strips chrome | **OUT OF SCOPE** — separate signed-off PR | n/a (deferred) |
| **ImageUpload** — 3 dead APIs (`onUploadComplete`, `bucketName`, `uploading`) | **high** | `:27`, `:34`, `:43`, `:301-304`, `:245-249`; `bucketName` passed at 8 sites | keep signature + JSDoc; resurrect spinner via new `loading?`; actually wiring upload = §8 | wiring upload: yes — §8; rest additive |
| **RichTextEditor** — unsanitized write boundary | **high** | `:79-82` (raw `innerHTML`→`onChange`), `:120` (raw `sourceValue`); inbound IS sanitized `:70` | wire existing `sanitizeHtml` at write boundary | yes (disallowed tags stripped on save) — §8 |
| **CustomerAvatar** — inert without photo | **medium** | `:38`, `:43`, `:71-78` (initials branch drops `onClick`/`clickable`) | factor interactive attrs into both branches | yes (photo-less avatar becomes clickable; +`onError` fallback) — §8 |
| **CollapsibleSection** — incomplete disclosure | **medium** | `:63-67` (no `aria-controls`/`type`), `:91-98` (content no id/role) | `useId`→`aria-controls`/`id`/`role="region"`/`aria-labelledby`; `type="button"` | attribute-only (behavior-preserving) |
| **Button** — `isLoading` renders nothing | **low (latent, 0 consumers)** | `:8`, `:25`, `:51`; body L48-56 no spinner/aria-busy | render `Spinner` + `aria-busy` on `isLoading` | yes for opt-in consumers (0 today) — §8 |
| **StatsCard** — contradictory trend API | **low (latent)** | `:38-40` (`value`/`isPositive` independent) | **do NOT change**; add characterization test | no (deferred) — §8 |
| **Card** | none | — | — | — |
| **Table** | none | — | — | — |
| **DeviceRoleBadge** | none (suspected leak REFUTED) | `:14` semantic tokens, `:58-61` concat (latent precedence only) | `cn()` precedence | no |

---

## 7. i18n keys (en + ar, add-only; reuse where possible)

**Reuse (no new key):** `ui.noData` (Table empty), `ui.remove` (ImageUpload Remove button), `ui.close` (optional, Toast close).

**New keys:**

- `ui.toast.close` — `'Close notification'` / ar.
- `ui.statsCard.trendUp` `'Up {{value}}%'`, `ui.statsCard.trendDown` `'Down {{value}}%'` / ar.
- `ui.fieldCount_one` `'{{count}} field'`, `ui.fieldCount_other` `'{{count}} fields'` (+ ar plural set mirroring `optionCount_*` at `i18n.ts:542-547`).
- `ui.avatar.viewPhoto` — `'View photo of {{name}}'` / `'عرض صورة {{name}}'`.
- `ui.deviceRole.patient` `'Patient'`, `.backup` `'Backup'`, `.donor` `'Donor'`, `.clone` `'Clone'` / ar.
- `ui.imageUpload.*` — `dragDropPrompt`, `browse`, `accepted` (`'Accepted: {{types}}'`), `maxSize` (`'Maximum size: {{size}}MB'`), `recommended`, `fileLabel`, `sizeLabel`, `dimensionsLabel`, `errInvalidType`, `errTooLarge`, `errInvalid`, `errProcessing`, `errProcessingCropped`, `previewAlt`, `dropzoneLabel` / ar. (Remove reuses `ui.remove`.)
- `ui.richText.*` — `placeholder`, `toolbar`, `textColor`, `highlight`, `bold`, `italic`, `underline`, `strikethrough`, `bulletList`, `numberedList`, `undo`, `redo`, `clearFormatting`, `quickLabel`, `warning`, `warningTitle`, `important`, `importantTitle`, `viewSource`, `sourcePlaceholder` / ar. (Swatch color names lower-priority — keep literal for now.)

All routed via the **default-only** pattern (`prop ?? t(key)`) where a prop exists, so explicit props still win; both `en` and `ar` dictionaries updated together (or `ar` falls back to the raw key string).

---

## 8. Behavior changes requiring sign-off (the ONLY non-additive / behavior-affecting changes)

1. **RichTextEditor write-side sanitize** — `onChange`/source-toggle now emit `sanitizeHtml(innerHTML)` instead of raw; disallowed tags/attrs stripped **on save** (defense-in-depth for `PortalReports`/KB/templates render sites). Not byte-identical.
2. **Toast `aria-live`** — new SR announcements (alert/assertive for error+warning, status/polite otherwise). Low-risk, the explicit audit fix.
3. **Toast dual-system unification** — **deferred** to a dedicated PR; pick ONE source (custom `Toast` vs raw react-hot-toast), fix `App.tsx:164-178` chrome accordingly, migrate the 90 raw-caller files.
4. **Badge `cn()` precedence** — a consumer `className` conflicting with a variant default now deterministically wins (fixes the `PlansPage`/`ChainOfCustodyTab` overrides). May visually shift a few badges that "worked" by source-order accident — visual-diff. **Activating the dead `color` prop** (~12 sites) is a **separate** signed-off visual change (invalid values like `'green20'` would surface) — not in this PR.
5. **Badge interactive a11y** — `onClick` badges become keyboard-operable (`role="button"`, `tabIndex=0`, Enter/Space, focus ring) — changes tab order + SR semantics for ~all `onClick` consumers.
6. **CustomerAvatar inert-without-photo fix** — photo-less `clickable` avatars become keyboard/click controls; `img onError`→initials changes the broken-URL render. **Explicit choice: keep `role="button"` div, NOT a real `<button>`** (nested-button hazard at `PortalLayout.tsx:137`).
7. **StatsCard trend correction** — **deferred**; deriving direction from `sign(value)` / adding `goodWhenDown` / sign-aware `value` formatting changes output for any non-zero trend. Characterization test locks current behavior instead.
8. **Button `isLoading`** — now renders a Spinner + `aria-busy` (0 consumers today). **`focus:ring-2`→`focus-visible:ring-2`** removes the click-time ring for all 188 consumers — **deferrable** to keep the PR strictly behavior-preserving.
9. **ImageUpload upload-wiring** — actually wiring `onUploadComplete`/`bucketName` (vs leaving dead) and dropzone-div→`role="button"` + auto-spinner during `getImageDimensions` change runtime output.
10. **Token swaps** — `bg-white`→`bg-surface` in **Card** (`:28`), **Table** (`:26`,`:46`), **CollapsibleSection** (`:62`,`:65`), **ImageUpload** scrim (`:231`), **RichTextEditor** popovers (`:174`,`:209`): visible only if `--color-surface ≠ #fff` under any theme — **verify across royal/burgundy/scarlet** in the Appearance picker. Program-mandated but needs design sign-off.
11. **DeviceRoleBadge i18n** — the 4 labels become locale-dependent (Arabic localized; en identical) — tests pin en.

---

## 9. Testing

Co-located `*.test.tsx` (jsdom harness). Existing `RichTextEditor.test.tsx` (2 Phase-2a tests) **stays green** (keep label association conditional on explicit `id`). `npm test` runs **both** projects.

- **Button:** renders children as `<button>`; primary default classes; aliased `outline→ghost`/`default→primary`/`destructive→danger`; size classes; **`className='px-8'` overrides base `px-4`** (tailwind-merge proof); `isLoading` → `aria-busy='true'` + `role=status` spinner + disabled; `disabled` alone (no aria-busy/spinner); `disabled={false} isLoading={true}` → disabled; forwards `aria-label`/native props + `ref`; `onClick` fires enabled, not when disabled/loading. **Snapshot-equivalence** of the 4 resolved variants × 3 sizes before/after.
- **Badge:** children; default `bg-slate-100`/`text-slate-800` + `md`; `error→danger`, `outline→secondary`; **PRECEDENCE `className='bg-primary'` wins (fails on current main)**; `className='px-4'` over `px-2`; sizes; `onClick`→`cursor-pointer` + fires; `style` verbatim; `color + variant='custom'` → inline style; `color` WITHOUT `custom` → **no** inline style (documents dead behavior); `...rest`/`data-testid` passthrough; `ref` to span. (Post-sign-off) `role/tabIndex`/Enter+Space.
- **Card:** children in single div; default has `shadow-sm`+`border-t-4`, not `border`/`border-2`; bordered/outlined; **`bg-surface` present, `bg-white` absent**; hoverable adds `cursor-pointer`; `className='shadow-lg'` beats base `shadow-sm` (merge); `borderColor` inline only on default; passes `onClick`/`role`/`tabIndex`/`aria-label`; `ref`.
- **Table:** `<th>` per column + `scope="col"`; `data=[]` → one row, `colSpan===columns.length`, `t('ui.noData')` resolved; `emptyMessage` overrides; N rows + `render`/`row[key]`; zebra `bg-surface` even / `bg-slate-50/30` odd; `onRowClick` fires once / no throw when undefined; `caption` sr-only; `className='rounded-none'` beats `rounded-lg`; `loading=true` → `skeletonRows` Skeletons (animate-pulse) per column, no data/empty. (Post-sign-off) keyboard rows.
- **StatsCard:** title/value; provided icon + `aria-hidden`; `color='green'`→`bg-success-muted`/`text-success`, default→`bg-info-muted`, unknown→info; **`orange`==`yellow`==warning** (dedupe guard); trend up→`TrendingUp`+success / down→`TrendingDown`+danger; no trend → no `%`; trend `aria-label` from `t()`; `loading=true`→Skeleton not value; `className` merge; **characterization: `{value:-5, isPositive:true}`→`'-5%'`+`TrendingUp`+success** (locks current).
- **Toast:** message + per-type icon; **error/warning→`role="alert"` `aria-live="assertive"`, others→`status`/`polite`**; status icon `aria-hidden`; close button only when `type!=='loading'` && `onClose`, fires once; close `aria-label` from `t()`, `closeLabel` overrides; `className='max-w-xs'` beats `max-w-md`; progress bar present/absent rules (fake timers); `ref`. **Per-type icon/color test covers `error→danger`/`loading→info` mapping.**
- **CollapsibleSection:** title/children/icon, accessible button; uncontrolled toggle aria-expanded; `defaultOpen=true`; controlled `isOpen`+`onToggle` (click doesn't mutate internal state); Enter+Space toggle; `aria-controls`==content id, content `role='region'`+`aria-labelledby`==title id; `type='button'`; field-count `t()` plural, absent when undefined; ar plural; `className` passthrough; **no `bg-white` class**.
- **CustomerAvatar:** initials `JD` from `john`/`doe`; single-name (`lastName=''`) no-crash single letter; `<img alt='<first> <last>'>`; non-interactive default; interactive WITH photo (role/tabIndex/click/Enter/Space); **REGRESSION: interactive WITHOUT photo now fires (fails pre-fix)**; `className='rounded-full'` removes `rounded-2xl`; **no `cyan`/`text-white`, uses `ring-ring` + focus-visible**; `ariaLabel` default-only; each size class, no inline `fontSize`.
- **DeviceRoleBadge:** correct label+icon per role (en-pinned); case-insensitive (`DONOR`/`Donor`→donor warning classes); unknown/empty→patient + `bg-info-muted`; `showIcon=false` → no svg + label; size classes; **`className='px-8'` wins over size `px-*`** + retains role bg; icon `aria-hidden`; ar locale → Arabic label for donor.
- **ImageUpload:** label/description + empty dropzone; preview `<img src=value>` + non-generic alt; reject wrong MIME / oversize (error region + onChange NOT called); happy path `onChange(file, objectUrl)` once (mock `createObjectURL`+`Image.onload`); Remove → `onChange(null,null)`; drag-drop parity; **DEAD-API guards: `onUploadComplete` never called; `bucketName` no observable effect**; label `htmlFor`↔input id; error `role='alert'`; `density='compact'` AND legacy `className='compact-upload'` both yield compact classes; `loading=true`→`role='status'` Spinner; ar strings present.
- **RichTextEditor:** **write-side sanitize** — set `innerHTML` to a payload with a disallowed tag/handler, fire input, assert sanitized to `onChange`; source-mode sanitize on toggle-back; inbound sanitize regression; placeholder default-only; buttons queryable by translated accessible name; `role="toolbar"` + disclosure `aria-haspopup`/`aria-expanded`; popovers `bg-surface` not `bg-white`; **existing Phase-2a tests green** (id/aria forwarding + no-id default at L29). (jsdom has no `execCommand` — assert wiring/labels/sanitize/a11y, not formatting.)

---

## 10. Sequencing (one PR per the workflow, ordered tasks — TDD per task)

1. **Foundation:** add the new `ui.*` i18n keys (en + ar) from §7 (reusing `ui.noData`/`ui.remove`/`ui.close`). No code yet.
2. **cva pilot — Card** (smallest clean matrix, 60 consumers, low risk): `cardVariants` + `cn()` + `bg-surface` swap + `ref` + tests. Establishes the house pattern + exports `cardVariants`.
3. **Button** (highest fanout — do early so the pattern is locked): `buttonVariants` + `VARIANT_ALIAS` pre-map + `cn()` + `isLoading`→Spinner/`aria-busy` + `ref` + tests + **snapshot-equivalence**.
4. **Badge:** `cn()` **precedence fix first** (the high-sev bug), then `cva` sourcing `STATUS_TONE_MUTED`, then `HTMLAttributes`/`ref` passthrough + tests (keep `color`/`custom` byte-identical).
5. **DeviceRoleBadge:** self-contained `cva` (hoist maps) + `cn()` + i18n labels + icon `aria-hidden` + tests (en-pinned).
6. **StatsCard:** `STATUS_TONE_MUTED` alias map + trend via `STATUS_TONE` + `cn()` + `loading`→Skeleton + `className` + trend a11y/i18n + characterization test (Card `bg-white` already fixed in task 2).
7. **Table:** `cn()` + `bg-surface` + `t('ui.noData')` + `scope`/`caption`/`className` + `loading`/`skeletonRows`/`emptyMessage` + tests.
8. **Toast:** `aria-live`/`role` (the bug) + `STATUS_TONE_MUTED` tones (`error→danger`/`loading→info`) + `cn()` + `closeLabel`/`className`/`ref` + icon `aria-hidden` + `bg-black/5` tidy + tests.
9. **CollapsibleSection:** `useId` disclosure wiring + `type="button"` + `bg-surface`/gradient swap + `cn()`/`className` + field-count plural i18n + chevron/icon `aria-hidden` + tests.
10. **CustomerAvatar:** `avatarVariants` (collapse the two size maps) + cyan→token + focus-visible + **inert-without-photo bug fix** (factor interactive attrs) + `ariaLabel` i18n + `ref` + tests.
11. **ImageUpload:** `cn()` + `density` cva (with `compact-upload` fallback) + `useFieldA11y` + error `role="alert"` + `loading`→Spinner + i18n + dead-API JSDoc + tests.
12. **RichTextEditor:** **write-side sanitize** (existing `sanitizeHtml`) + popover `bg-surface` + toolbar `cn()`/`cva` + `STATUS_TONE_MUTED` quick buttons + toolbar/button a11y + i18n (default-only) + tests (keep label association conditional on explicit `id`).
13. **Full verification:** `npm test` both projects, `npm run typecheck` (=0), lint, schema gates; manual cross-theme smoke of the `bg-surface` swaps + the high-fanout Button/Badge/Card pages.

---

## 11. Risks & mitigations

- **Button/Badge fanout (188/96):** any class-output regression is repo-wide → **snapshot-equivalence** of resolved variants × sizes before/after; spot-check `ConfirmDialog.tsx:62` (passes `disabled={isLoading}` — confirms the disabled-coupling contract), `PlansPage.tsx:138`, `ChainOfCustodyTab.tsx:462,504`.
- **`bg-white`→`bg-surface` assumes `--surface == white`** across royal/burgundy/scarlet — verify in `src/index.css` + the Appearance picker before claiming visual equivalence (§8 #10); else treat as a real visual change.
- **cva is brand-new (0 prior usage):** confirm `package.json:23` (done — `^0.7.1`); the pattern set in tasks 2-3 becomes house style — keep it minimal and idiomatic; prefer `STATUS_TONE_MUTED` reuse over bespoke configs (except DeviceRoleBadge which legitimately needs the border suffix).
- **Toast `error→danger`/`loading→info` mapping** is an off-by-one trap — covered by the per-type icon/color test.
- **ImageUpload `className` double-duty** (style passthrough AND `compact-upload` flag): the cva density fallback must read the **raw** prop string, not the merged output; the 8 `bucketName` call sites must keep compiling (keep the prop).
- **RichTextEditor write-sanitize on the customer-facing `PortalReports` path** is the highest-value fix but is behavior-affecting (§8 #1) — jsdom can't test `execCommand`, so tests target sanitize/a11y/i18n, not formatting; the auto-id hazard against `RichTextEditor.test.tsx:29` is avoided by keeping label association conditional on explicit `id`.
- **CustomerAvatar nested-button hazard** (`PortalLayout.tsx:137`): keep `role="button"` div, never emit a real `<button>` (§8 #6).
- **Spinner imports `useTranslation`:** Button/Table/StatsCard/ImageUpload test harnesses must wrap with the i18n provider (or rely on react-i18next's key-returning test fallback) when asserting spinner/Skeleton paths.

---

## 12. Acceptance criteria

1. `cva` adopted (first in repo) for Button, Badge, Card, StatsCard (via `STATUS_TONE_MUTED`), DeviceRoleBadge, ImageUpload (density); `cn()` used for all class assembly in all 11 components; **consumer `className` wins conflicting utilities** (proven by a precedence test in each variant component).
2. Shared **`Spinner`** wired into Button (`isLoading`) + ImageUpload (`loading`); shared **`Skeleton`** into Table (`loading`/`skeletonRows`) + StatsCard (`loading`).
3. Status tones sourced from `STATUS_TONE`/`STATUS_TONE_MUTED` in Badge, StatsCard, Toast, RichTextEditor quick buttons; DeviceRoleBadge keeps its self-contained role map (border suffix preserved).
4. **Token leaks fixed:** no `bg-white` in Card/Table/CollapsibleSection/ImageUpload/RichTextEditor popovers; **no `cyan`** in CustomerAvatar; no purple/indigo/violet, no new brand hex introduced. (Intentional palettes in RichTextEditor/`deviceIconMapper` untouched.)
5. **Concrete bugs fixed** per §6: Badge precedence (`cn()`), Toast `aria-live`, RichTextEditor write-side sanitize, CustomerAvatar inert-without-photo, CollapsibleSection disclosure + `type="button"`, Button `isLoading`→Spinner+`aria-busy`. Refuted bugs (StatsCard arrow/color, DeviceRoleBadge hex, CustomerAvatar/CollapsibleSection keyboard) documented as refuted.
6. Hardcoded copy routed through `t()` (default-only); new `ui.*` keys added en + ar (§7), reusing `ui.noData`/`ui.remove`/`ui.close`.
7. Public APIs **additive-only** (new optional props + React-19 `ref`-as-prop); the 11 components' consumers (188/96/60/7/7/1/2/3/1/2/3) compile at **`tsc=0`**; all **6 CI gates** green.
8. Every behavior-affecting change is enumerated in §6/§8 and **nothing else** changes runtime output; the deferred items (Toast dual-system, StatsCard trend, ImageUpload upload-wiring, Button `focus-visible`, Badge dead-`color` activation, CollapsibleSection `inert`) are NOT done in this PR.
9. New `*.test.tsx` per §9 pass; existing `RichTextEditor.test.tsx` stays green; `npm test` passes both projects; lint clean.