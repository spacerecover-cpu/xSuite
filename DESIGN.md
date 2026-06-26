# Design System — xSuite

> **Single source of truth for every visual and UI decision in xSuite.**
> This file documents the design system that already exists in code. It is a
> **consistency contract**, not a creative brief: xSuite is a production
> multi-tenant data-recovery lab platform, so every screen must look like it
> came from one team on one day. Do not invent new fonts, colors, or tokens.
> When a need doesn't fit the vocabulary below, ask before extending it.
>
> Read this before any UI change. In QA/design review, flag any code that
> deviates from it. The authoritative values live in the source files cited
> in each section — this doc mirrors them; if they ever disagree, the source
> file wins and this doc must be corrected.
>
> **Exception — forward standards.** A few sections are marked **"Status —
> leads the code"**: these are owner-approved targets the code is actively
> migrating toward, so there the doc intentionally leads the source. Each such
> gap is tracked in **Known Deviations** until the code catches up. Everywhere
> else, the source file wins.

## Product Context
- **What this is:** ERP/CRM-grade SaaS for data recovery / forensic labs — cases, devices, chain of custody, finance, inventory, HR.
- **Who it's for:** Lab staff (technicians, managers, accounts, HR), tenant owners/admins, platform admins, and customers via the portal.
- **Space/industry:** Data recovery & digital forensics. Trust, auditability, and legal defensibility are first-class. **Not** a generic CRM.
- **Project type:** Dense, data-heavy web application (React 18 + TypeScript + Vite + Tailwind CSS v3.4) with a customer portal and programmatic PDF documents.
- **The one thing to remember:** Serious, trustworthy lab software — calm, dense, and credible, never flashy.

## Aesthetic Direction
- **Direction:** Industrial / utilitarian, refined. Function-first and data-dense, with a restrained brand accent.
- **Decoration level:** Minimal-to-intentional. Typography and a tight token palette do the work. **Token-driven gradients are a sanctioned emphasis tool** — use them for KPI tiles, hero bands, and command strips. They MUST be built from semantic tokens or the `cat-*` palette (so they re-theme per tenant and respect the purple/indigo + raw-hex bans); keep them tasteful and avoid noisy blobs or texture.
- **Mood:** Quiet authority. The UI gets out of the way so custody, money, and recovery state are unambiguous.
- **Theming:** Three tenant-selectable themes share one structure and one neutral/status layer — only the brand hue changes. See **Color → Themes**.

## Typography
Fonts load via Google Fonts in `index.html` (CSP allows `fonts.googleapis.com` / `fonts.gstatic.com`). Family tokens are defined in `tailwind.config.js` (`fontFamily`).

- **Display / Hero:** `DM Serif Display` — Tailwind `font-display`. Use sparingly for marketing/auth hero and large brand moments, not for app chrome.
- **Body / UI / Labels / Data:** `DM Sans` — Tailwind `font-body`. The workhorse for all app surfaces, tables, and forms.
- **Code:** none defined. Do not introduce a mono font without updating this doc.
- **Arabic / RTL (PDF only):** Noto Sans Arabic + Tajawal, in `public/fonts/` (see `src/lib/pdf/fontLoader.ts`). Screen RTL uses the same DM families.
- **Custom sizes:** `text-xxs` = `0.625rem` (10px) for ultra-dense table metadata. Everything else uses the default Tailwind type scale — do not add sizes ad hoc.

## Color
Every brand/status token is an **RGB triplet** CSS variable (e.g. `--color-primary: 22 38 96`) so Tailwind's `<alpha-value>` opacity syntax works. The 14 semantic tokens are wired in `tailwind.config.js`; values live in `src/index.css`. **Use semantic tokens only — never raw Tailwind brand colors or hex in `src/`.**

### Themes (brand layer — only these three vars change per theme)
`src/index.css` — `:root[data-theme="…"]`. Default theme is **Royal**.

| Token | Royal (default) | Burgundy | Scarlet |
|---|---|---|---|
| `primary` | `#162660` (22 38 96) | `#6C131F` (108 19 31) | `#DC2626` (220 38 38) |
| `primary-foreground` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `secondary` | `#D0E6FD` (208 230 253) | `#A14B58` (161 75 88) | `#C92925` (201 41 37) |
| `secondary-foreground` | `#162660` | `#FFFFFF` | `#FFFFFF` |
| `accent` | `#F1E4D1` (241 228 209) | `#FFECEA` (255 236 234) | `#F9E7C9` (249 231 201) |
| `accent-foreground` | `#162660` | `#6C131F` | `#280B08` |

### Surface & line (constant across themes)
`src/index.css` — constant `:root` block.

| Token | Hex | RGB |
|---|---|---|
| `surface` | `#FFFFFF` | 255 255 255 |
| `surface-muted` | `#F8FAFC` | 248 250 252 |
| `border` | `#E2E8F0` | 226 232 240 |
| `ring` (focus) | follows `primary` | `var(--color-primary)` |

### Status (constant across themes — meaning is fixed, never theme it)
| Role | Base | Foreground | Muted (bg) |
|---|---|---|---|
| `success` | `#059669` | `#FFFFFF` | `#D1FAE5` |
| `warning` | `#D97706` | `#FFFFFF` | `#FEF3C7` |
| `danger` | `#DC2626` | `#FFFFFF` | `#FEE2E2` |
| `info` | `#0284C7` | `#FFFFFF` | `#E0F2FE` |

### Categorical (identity) palette — `cat-1` … `cat-8`
For **distinct identity** color where status/brand tokens don't apply: per-module
accents, device-type tiles, category swatches — places that need *N visually
separable hues whose only meaning is "different from each other"*. The 14 semantic
tokens have no "N categories" slot; routing identity color through `danger`/`info`
etc. is a bug (it falsely signals status). Use these instead.

- **Fixed, NOT themed** — same 8 hues for every tenant/theme, so dashboards stay
  comparable. They **mirror `chartCategorical`** in `src/lib/chartTheme.ts` (cyan,
  teal, lime, yellow, orange, pink, blue-800, slate). Values: `src/index.css`
  (`--color-cat-1` … `--color-cat-8`); wired in `tailwind.config.js`.
- **Never use for status.** Status meaning lives only in `success/warning/danger/info`.
- **Muted background:** use alpha, e.g. `bg-cat-1/10` with `text-cat-1` (mirrors the
  `*-muted` pattern). Proof-of-concept consumer: `InventoryInsightsHeader.tsx`.

### Banned in `src/` (enforced by `eslint-rules`)
- `purple-*`, `indigo-*`, `violet-*` (any shade) → use `accent` or `secondary`.
- **Raw color literals in inline `style`/`color` props** (hex like `#7c3aed`, or `rgb()`/`hsl()` with literal numbers) — they bypass per-tenant theming **and** the class-based `no-raw-tailwind-colors` rule (which only sees Tailwind classes). Use a semantic token (`rgb(var(--color-x))`), the `cat-*` palette, or a Button/Badge variant. Guarded by `eslint-rules/no-raw-style-colors.js` (`error`; test fixtures + app-shell neutral chrome baselined per-file). Sanctioned exception: WhatsApp brand green `#25D366`.
- **`accent` is a LIGHT surface token, never a foreground.** Pair `bg-accent` with `text-accent-foreground`, or use the `accent` Button/Badge variant (`src/components/ui/Button.tsx`, `Badge.tsx`). Never `text-accent`/`border-accent` on a light/white surface, and never `bg-accent` with white text — both render ~1.2:1 (invisible).
- Brand hex literals: `#1E5BB8`, `#8b5cf6`, `#6366f1`, `#a855f7`, `#4A5568`, `#6A7A8A`.
- Raw Tailwind brand colors (`bg-blue-600`, `text-purple-*`, etc.) → use a semantic
  token, or `cat-1`…`cat-8` for identity color. Neutrals (`gray/slate/zinc/white/black`)
  remain allowed for utility use. Rule: `eslint-rules/no-raw-tailwind-colors.js`
  (catches the full brand-color family across all class prefixes). `src/` is now at
  **zero** raw brand-color classes outside the fixed surfaces above — so the rule can
  run as a hard `error` with only those file-level exemptions, no line baseline.

## Non-Themed Surfaces (intentionally fixed — do NOT wire to the theme)
These read from constants, never from CSS variables. This is by design so output stays comparable across tenants/themes.

- **Charts:** `src/lib/chartTheme.ts` — `chartCategorical` (8 hues), `chartAxis` `#64748b`, `chartGrid`/`chartTooltipBorder` `#e2e8f0`. Data-vis neutral; never theme charts.
- **Categorical UI palette:** `cat-1`…`cat-8` (`src/index.css`, `tailwind.config.js`) — the screen-side mirror of `chartCategorical`, for identity color in UI (see **Color → Categorical (identity) palette**). Fixed across themes by design.
- **PDFs:** `src/lib/pdf/styles.ts` — `PDF_COLORS` (primary `#162660` = fixed Royal-brand navy, text `#1E293B`, …), font `Roboto`. One fixed color for all tenants by design (a themed invoice would look alarming). Device-role badge colors (patient/backup/donor/spare) are fixed.
- **Device icons:** `src/lib/deviceIconMapper.ts` — fixed SVG hexes. Intentional.
- **Auth screens:** `src/components/auth/shared/AuthBackground.tsx` + `constants.ts` — the login/signup split-screen's fixed dark decorative identity (slate/blue gradient, circuit SVG, particles, CTA button gradient). Auth renders **before** a tenant theme is known (you're not in a tenant yet), so it is intentionally non-themed and lint-exempt like PDFs.

## Spacing
- **Base unit:** Tailwind default 4px scale (`p-1`=4px … `p-6`=24px …). Density target: **comfortable-to-compact** for data tables.
- **Custom step:** `spacing['4.5']` = `1.125rem` (18px) — the only sanctioned off-scale value (`tailwind.config.js`). Do not add more without updating this doc.

## Layout
- **Approach:** Grid-disciplined app shell (`AppLayout`, `Sidebar`) with predictable alignment; portal and auth may be lighter but use the same tokens.
- **Sidebar:** per-user left/right position preference (`user_sidebar_preferences`). Both positions must stay visually balanced.
- **Border radius:** Tailwind default scale. No global bubble-radius; match surrounding components.
- **Page header & breadcrumb roles** (H1/H2) — the page title is owned by the chrome, never repeated as an in-content header:
  - **List pages under `AppLayout`** register their title + primary actions into the global top bar via `usePageHeaderSlot({ title, actions })` / `<PageHeaderSlot>` (`src/contexts/HeaderSlotContext.tsx`). The bar breadcrumb (`Section › <title>`) **is** the title; actions sit in the bar's `hidden md:flex` actions host. No in-content `PageHeader` row. Title travels as context state (`useLayoutEffect`, no flash); actions are portaled (live, so selection-driven actions stay current).
  - **Detail pages** use `DetailPageHeader` (`src/components/shared/DetailPageHeader.tsx`): breadcrumb-led, the final crumb is the `<h1 aria-current="page">`; `badges` / `actions` / `meta` slots; gutter-neutral.
  - **`PageHeader`** (`src/components/shared/PageHeader.tsx`) remains **only** for shells with no global bar (portal, platform-admin).

## Overlays (modals, drawers, sheets)
The platform-standard overlay is a **three-region modal**: a pinned header, a single scrolling body, and a pinned footer. **Only the body scrolls** — the title, tab bar, and actions never leave the viewport.

> **Status — shipped.** The three-region primitives are the canonical surface (`Modal` / `Dialog` / `CommandPalette`), and the two former gaps are now implemented: the **colored-pill tab bar** (`ui/Tabs` `variant="pills"`, applied to `DeviceFormModal`) and the **`bg-slate-900/40` scrim** (the `Dialog` default). Apply this standard to *new and edited* surfaces; what remains tracked is forward-only — the responsive full-screen/bottom-sheet behaviour below `sm`, and extracting the shared `TabbedFormModal`/footer-slot scaffold for the remaining modals.

- **Primitives:** `ui/Modal.tsx` wraps `ui/Dialog.tsx` and is the canonical surface for header-pinned forms — it passes `flex flex-col overflow-hidden` to the panel and renders children in a `p-4 overflow-y-auto flex-1` body, so the header stays pinned (`Modal.tsx:71`/`:104`). `ui/Dialog.tsx` is the low-level container: React portal to `document.body`, `useFocusTrap` (focus trap + restore), and a **ref-counted** body scroll-lock so stacked dialogs don't unlock early (`Dialog.tsx:20-64`). **The pinned behavior is not a property of `Dialog` itself** — `Dialog`'s own panel is a single whole-panel scroller (`max-h-[90vh] overflow-y-auto`, `Dialog.tsx:101`). The three-region layout comes from the *consumer* layering `flex flex-col overflow-hidden` on the panel and splitting children into intrinsic-height header/footer + a `flex-1 overflow-y-auto` body. **Do not render plain children straight into `Dialog`** — that whole-panel scroll lets the header and actions scroll away (retired for forms). `Modal` pins the header but **has no footer slot today**, so a form that needs a pinned footer composes `Dialog` directly with the three-region flex-column pattern — exactly as `shared/CommandPalette.tsx` (pinned header **and** footer) and `cases/DeviceFormModal.tsx` do. Mirror them.
- **Anatomy:**
  1. **Pinned header** — title + optional icon/badges + close button.
  2. **Optional pinned sub-header** — the tab bar and/or a fixed control row (e.g. the Device Role select + "Mark as Primary" checkbox in `DeviceFormModal`). Stays put with the header.
  3. **Scrolling body** — the *only* scroll region (`flex-1 overflow-y-auto`).
  4. **Pinned footer** — destructive action left (e.g. Delete), Cancel + primary action right, separated by a `border-t`. Pinned via flex `shrink-0`, **not** CSS `sticky`/`position`.
- **Height:** cap the panel at `max-h-[90vh]`, but the **body** carries the scroll, never the panel. The header, sub-header, and footer never scroll.
- **Size tiers** (semantic names over `Modal`'s raw `size`/`maxWidth` props; verified mappings in `Modal.tsx:24-40`):

  | Tier | `Modal` size | max-width | Use for |
  |---|---|---|---|
  | Confirm | `xs` / `sm` | sm / md | confirmations, single-action prompts (`ConfirmDialog`) |
  | Standard | `md` (default) | lg | ≤ 8 fields, single column |
  | Wide | `lg` | 2xl | 9–16 fields, 2 columns |
  | Form | `xl` / `large` | 4xl | 17–30 fields, 3 columns |
  | Workspace | `2xl` (or `maxWidth` `6xl`/`7xl`) | 6xl–7xl | 30+ fields, tabbed, or dynamic line-items (Device, Invoice, Quote) |

  `Modal` also exposes `maxWidth` `3xl`/`4xl`/`5xl` for in-between widths; `maxWidth` wins over `size` when both are set. *(The reference Workspace modal `DeviceFormModal` currently sits at `max-w-5xl` — between Form and Workspace; new Workspace forms target `6xl`–`7xl`.)*
- **Modal vs route vs drawer:** ≤ 30 fields → modal (tier per field count). > 30 fields, dynamic line-items, or an embedded rich-text editor → a **tabbed Workspace modal** (split the fields across tabs) or a full route. A reusable side **Drawer** primitive does not exist yet — `Drawer.tsx` is absent; the only drawer-like file is `layout/MobileNavDrawer.tsx`, a purpose-built nav off-canvas. When a `Drawer` primitive is added it must follow this same three-region contract.
- **Responsive:** below the `sm` breakpoint a modal should become **full-screen** (or a bottom-sheet filling most of the viewport), **not** a fixed-width centered card — reuse `layout/MobileNavDrawer.tsx`'s slide + scroll-lock + focus-trap mechanics. The desktop multi-column grid collapses to one column. *(Today `Dialog`/`Modal` stay fixed-width from 320px→1920px; this is a forward target — the weakest mobile surface in an otherwise mobile-aware app.)*
- **Backdrop:** one token-driven scrim — **`bg-slate-900/40`** is the standard and the shipped `Dialog` default (`Dialog.tsx:90`, inherited by ~90 modals). `backdrop-blur-sm` is allowed on Workspace-tier and full-screen media overlays only (today: `CommandPalette`, `PhotoViewerModal`). The deliberate dark media overrides — `EmailDocumentModal` `bg-black/70`, `PhotoViewerModal` `bg-black/90` — stay as-is.
- **Required behaviors** (all provided by `Dialog` — do not reimplement): focus trap + focus restore on close, ref-counted body scroll-lock, ESC + backdrop close (each opt-out via `closeOnEscape` / `closeOnBackdrop`, both default-on).

### Tabbed form modal — reference: `cases/DeviceFormModal.tsx`
Large, multi-section records use a **tabbed Workspace modal**: a pinned tab bar splits the record into ≤ 4 tabs; each tab's fields render in the responsive grid below (see **Forms & Field Layout**). Reference: the Edit Device modal (tabs: Device Details, Diagnostic, Components, History / Activity).

> **Status — shipped.** `DeviceFormModal` is the reference tabbed Workspace modal: pinned header + a fixed Device Role / "Mark as Primary" control row, a `flex-1` scrolling body, and a pinned `shrink-0` footer (Delete left, Cancel + Save right), built on `Dialog` with the flex-column pattern (`DeviceFormModal.tsx:475-619`); the tab bar renders the **colored pills** below via shared `ui/Tabs` `variant="pills"` (tones primary/cat-5/cat-2/cat-6; History / Activity disabled). The `pills` variant is **opt-in**: `ui/Tabs` defaults to underline (`DeviceFormModal` is currently its only consumer), so the default path is preserved for future tab bars.

- **Tab bar = colored pills**, one **`cat-*` identity tone per tab** — identity color, not status, so it re-uses the sanctioned palette and stays lint-green:

  | Tab | Tone | Hue | Note |
  |---|---|---|---|
  | Device Details | `primary` | brand (re-themes per tenant) | the home/default tab |
  | Diagnostic | `cat-5` | orange | matches the mockup |
  | Components | `cat-2` | teal | closest lint-safe "green"; `cat-3` lime if you want it greener (→ slate-900 ink). **Never `success`** — that falsely signals status |
  | History / Activity | `cat-6` | pink | the mockup's literal purple is banned; `cat-8` slate for a calmer, archival read |

- **Active vs inactive:** ACTIVE = `bg-{tone}` + per-tone ink (below) + `shadow-sm`; INACTIVE = `bg-{tone}/10 text-{tone} hover:bg-{tone}/15`. The active tab must be unmistakable — **do not render all tabs at full fill** (the mockup did; that leaves no active affordance).
- **Active ink (AA on 14px labels, since `cat-*` has no `-foreground` token):** `primary` → `text-primary-foreground` (white); the lighter/mid cat tones `cat-1`–`cat-5` → **`text-slate-900`** (white is sub-AA on them — e.g. orange `cat-5` ≈ 3.6:1, slate-900 ≈ 5.0:1); the dark cat tones `cat-6`/`cat-7`/`cat-8` → `text-white`. *(Inactive labels are the identity tone `text-cat-N` on a 10% tint; for the mid tones that runs ≈ 3.6–3.8:1 — an accepted identity tradeoff, consistent with how the app already uses `text-cat-*`, pending a palette-contrast pass.)*
- **Banned:** `purple` / `indigo` / `violet` (lint `error`) — the mockup's purple History tab maps to `cat-6` or `cat-8`. *(All shipped tones resolve to sanctioned `primary`/`cat-*` hues — no banned colors.)*

### Reusable scaffold (do not hand-roll per modal)
Extract the scaffold so the next form inherits it: a `TabBar` component (`tabs[]`, `active`, tone-per-tab) and a `TabbedFormModal` that composes `Modal` — extended with a **`footer` slot** (which `Modal` lacks today) + the responsive full-screen/bottom-sheet mode — plus `TabBar`. `DeviceFormModal` becomes the first consumer; `InvoiceFormModal` / `QuoteFormModal` adopt it next (they are the recon's #1 scroll offenders). Until that scaffold lands, pinned-footer forms compose `Dialog` directly with the three-region pattern (as `DeviceFormModal` / `CommandPalette` do).

**Coverage gap this section closes** (recon): overlay size scale, scroll discipline (pinned vs whole-panel), z-index (see below), overlay elevation/shadow, backdrop opacity/blur, and the drawer/side-panel pattern — all previously undocumented.

## Z-Index Scale
> **Status — shipped.** The named scale exists (`src/lib/ui/zIndex.ts` + `tailwind.config.js` `zIndex` tokens), and the ad-hoc magic numbers were migrated onto it. `cn()` is extended (`extendTailwindMerge`) so the named tokens join the built-in `z` conflict group and overrides dedupe (last wins). A few purely-local `z-10`/`z-20` panel-internal stacking contexts are intentionally left as base-layer utilities.

Layers are defined in **`src/lib/ui/zIndex.ts`** (the `Z` constants, for JS/`style` use) and mirrored as Tailwind `theme.extend.zIndex` tokens (the `z-*` utilities).

| Layer | Token | Value | Members (shipped) |
|---|---|---|---|
| base | — | 0–10 | page content; `Dialog`/`Modal` panel + close buttons (`z-10` *within* the overlay's own stacking context) |
| sticky | `z-sticky` | 20 | in-page fixed/sticky save bars (`FeaturesSettings`, `AccountingLocales`); reserve for sticky table headers |
| dropdown | `z-dropdown` | 30 | lightweight trigger-attached inline menus — `VariableInsertMenu`, and legacy inline row menus (`PaymentsList`, `AnnouncementCard`, `InventoryListPage`, `ChainOfCustodyTab`) whose dismiss layer is a base-layer `z-10` transparent click-catcher, not an elevated backdrop |
| overlay | `z-overlay` | 40 | page-popover backdrops / click-catchers (`RowActionsMenu`, `ColumnPickerPopover`), `BulkActionsBar` |
| modal | `z-modal` | 50 | `Dialog`/`Modal` overlay; page menus **with** a backdrop (`RowActionsMenu`, `ColumnPickerPopover`); `MobileNavDrawer`; app-chrome dropdowns (`NotificationBell`, `StockAlertsDropdown`, `PortalLayout` header + user menu); skip-link; print toolbar |
| popover | `z-popover` | 60 | tooltip, lightbox (`PhotoViewerModal`), `EmailDocumentModal`, **field listboxes** that open inside a modal — `SearchableSelect`/`MultiSelectDropdown` (portaled to `document.body` via `useAnchoredPosition`) and `EngineerSelector` (in-tree `absolute`) |
| toast | `z-toast` | 70 | toasts (`react-hot-toast` `containerStyle`), the `NavigationProgress` route bar — always top |

- Popovers that must clear a modal use `z-popover`, **not** a hand-typed `z-[60]`.
- **Field listboxes** resolve to `z-popover` (60) so they clear the modal panel. `SearchableSelect` / `MultiSelectDropdown` portal to `document.body` via `useAnchoredPosition` (immune to ancestor clipping); `EngineerSelector` is an in-tree `absolute` listbox — its z-value is right, but as a non-portaled child it can still be clipped by an `overflow-hidden` modal panel, so keep it on page-level surfaces. (`ui/Select` is a native `<select>` — no z-index.)
- **Page menus with a backdrop** (`RowActionsMenu`, `ColumnPickerPopover`) sit at `z-modal` (50), **not** `z-dropdown` (30): on a selectable table they coexist with the `BulkActionsBar` at `z-overlay` (40) and must stay above it. Only lightweight inline menus with no backdrop use `z-dropdown`.
- Toasts + the route-progress bar are the top layer (`z-toast` 70). The `react-hot-toast` `Toaster` (`App.tsx`) has no className hook, so it carries `zIndex: Z.toast` via `containerStyle` (from `src/lib/ui/zIndex.ts`); 70 still clears modal (50) and popover (60).

## Elevation
Depth leans heavily on **borders** — on the order of ~2000 border-utility usages across ~318 files versus ~400 box-shadow usages total (~5:1). The two dead custom shadow tokens (`inner-sm`, `glow-primary-lg`, 0 usages) were removed from `tailwind.config.js`; `glow-primary` is deliberately retained for its one themed usage (the onboarding step tile, `StepContainer.tsx:51`) — a one-off branded glow, **not** part of the ladder. The live elevation vocabulary is Tailwind's default `shadow-sm`/`-md`/`-lg`, with `-xl` reserved for overlay panels and `-2xl` near-zero.

Keep **border-led separation *inside* surfaces** (table rows, fields, list items — do **not** shadow these) and reserve **shadow for elevation *off* the surface**:

| Level | Utility | Use |
|---|---|---|
| flat | none | in-surface structure (table rows, fields) — separate with `border` / `surface-muted` |
| resting | `shadow-sm` | cards at rest (`Card.tsx` default = `shadow-sm border-t-4`) |
| raised | `shadow-md` | hover, KPI tiles, on-surface popovers |
| floating | `shadow-lg` | dropdowns, menus, toasts |
| overlay | `shadow-xl` | modal / dialog panels (`Dialog.tsx:101`) |

This is a ladder, not a license to shadow everything — shadow signals *elevation*, the border signals *grouping*. The dead `inner-sm` / `glow-primary-lg` tokens were removed; the retained `glow-primary` is a documented decorative exception (Known Deviations #11), not part of the ladder.

## Forms & Field Layout
Documents the field-grouping the redesign introduces, plus the existing `FormField` conventions DESIGN.md never captured.

> **Status — partly leads the code.** The `FormField` + `ui/` field primitives below exist and are the standard for labels/errors/a11y. The **4-column Workspace grid** and **uppercase section-header dividers** are **net-new prescriptions** — no form uses them yet (the closest shipped grid is `DeviceDetailsForm`'s `sm:grid-cols-2 lg:grid-cols-4`; tab bodies vary at `lg:grid-cols-3`). Apply them to new and edited Workspace forms; existing forms are tracked, not assumed.

- **Grid:** Workspace-tier forms use a responsive 4-column grid — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5`. Wide = 2 columns, Standard = 1 column. **The multi-column grid is the primary scroll-reducer:** ~35 fields in 4 columns is ~9 rows versus ~18 in two. *(Shipped device-form bodies currently break at `sm:` rather than `md:` and some use 3 columns; converge new work on the 4-column `md:`/`lg:` grid.)*
- **Section headers:** group related fields under uppercase labelled dividers — `text-xs font-semibold uppercase tracking-wide text-primary` + a `border-b border-border` rule, spaced above (e.g. "BASIC INFORMATION", "TECHNICAL INFORMATION"). A flat wall of fields is not acceptable for 15+ field forms.
- **Full-width fields:** long or multi-value controls (chip/multi-select Accessories, Device Password, Role-Specific Notes, rich-text terms) span all columns (`col-span-full`).
- **Primitives:** use `ui/FormField.tsx` (owns label / required `*` / error / hint + a11y via `useFieldA11y`, `src/hooks/useFieldA11y.ts`) with the `ui/` field primitives (`Input`, `Select`, `SearchableSelect`, `Textarea`, `Checkbox`, `ChipInput`, `PhoneInput`, `RichTextEditor`). Verified `FormField` classes: label `block text-sm font-medium text-slate-700`; error `<p>` `text-xs text-danger flex items-center gap-1` with `role="alert"` on the `<p>` (via `useFieldA11y`) and a decorative `aria-hidden` `AlertCircle` (`w-3 h-3 shrink-0`); hint `text-xs text-slate-500`. **This is a presentational standard — it does not require rewriting a form's state model.** Three form patterns coexist today (plain `useState`; `react-hook-form` + `register`; `FormField` render-prop); converge *new and edited* forms on `FormField` for consistent labels and error rendering, without a forced migration.
- **Density:** comfortable, not bloated. Tune row gap so more of a tab is visible per viewport — the goal is **fewer scroll events**, not maximum whitespace.

## Motion
`tailwind.config.js` `animation` / `keyframes`. Keep motion functional and short.

- `animate-fade-in` / `animate-slide-in` — 0.2s `ease-out`. Default for entrances and panel reveals.
- `animate-float` (6s) / `animate-pulse-glow` (3s) — ambient only; use sparingly, never on data-bearing UI.
- **Easing/duration default:** prefer Tailwind `transition` + `duration-150`/`duration-200`, `ease-out` for enter. Avoid long (>400ms) animations in the app shell.

## KPI Cards (gradient tiles)
The platform-standard KPI/stat tile is a **token-gradient card with a subtle decorative background**, shared by every list and dashboard surface.

- **Primitive:** `src/components/shared/GradientStatCard.tsx`. The shared `StatCard` and `KpiRow` (`src/components/templates/`) render it, so upgrading the primitive updates every KPI surface at once. The Cases command center (`CasesCommandCenter`) uses it directly for the richer `trend` / `denom` variants.
- **Anatomy:** label, a big tabular value (truncates with a tooltip so long currency stays readable), an optional inline trend pill or `/total` denominator, an optional muted sub caption, a thin share-of-total bar, and a decorative layer (soft glow + faint orbital ring + oversized ghost icon + dot scatter).
- **Tone → gradient:** each tone is `from-{token} to-{token}/85` — status (`info`/`success`/`warning`/`danger`), brand (`primary`), `neutral` (slate), and identity (`cat-1`…`cat-8`). All token-driven — no purple/indigo, no raw hex — so tiles re-theme per tenant.
- **Contrast:** the lightest tiles (amber `warning`, lime `cat-3`, yellow `cat-4`) flip to a **slate-900 foreground**; the rest use white. Decoration colours follow the foreground so text stays ≥ AA on every tone.
- **One tone per card in a row.** Never repeat a tone within a single KPI row — on saturated tiles two identical greens/ambers read as monotonous and stop colour from distinguishing cards. Reserve **status tones for genuine status** (`success` = good/positive, `warning` = caution/pending, `danger` = bad/negative); route plain magnitudes/totals/counts through brand/identity tones. Recommended pick-order for non-status metrics: `primary → info → cat-2 → cat-5 → cat-1 → cat-6 → cat-8 → neutral`.
- **Decoration is white/dark-only**, low opacity, `aria-hidden` — it adds depth, never meaning.

## Known Deviations (drift register — fix toward the standard, do not propagate)
Captured 2026-06-01 from a code audit; drifts #1–#3 resolved 2026-06-02. **A 2026-06-04 UI audit reopened the register** with #4–#7 (contrast + theming), all resolved in the same change set (see Decisions Log). **2026-06-26 added #8–#11** (overlay-system standardization: scrim, tab pills, z-index scale, dead shadow tokens) — codified as standards that led the code, then **implemented the same day**, so all four are now resolved (see Decisions Log).

| # | Where | Issue | Resolution |
|---|---|---|---|
| 1 | `tailwind.config.js` | `glow-blue` / `glow-blue-lg` hardcoded `rgba(59,130,246,…)` (blue-500) | ✅ Renamed → `glow-primary` / `glow-primary-lg`, derived from `rgb(var(--color-primary) / …)`; sole usage (`StepContainer.tsx`) updated. Now themes. |
| 2 | `src/index.css` | `--color-ring` was `#6366F1` (indigo-500), off-brand focus rings | ✅ Re-pointed to `var(--color-primary)`; focus rings now follow the active theme. |
| 3 | `src/lib/pdf/styles.ts` | PDF `primary` `#0891B2` (cyan) matched no brand primary | ✅ Set to fixed Royal-brand navy `#162660`. PDFs remain non-themed by design; documented under Non-Themed Surfaces. |
| 4 | `src/index.css`, `DESIGN.md`, `AppearanceSettings.tsx` | Scarlet `primary` was near-black `#280B08`; chrome reads `primary`, so the theme rendered brown — the true red `#C92925` sat unused in `secondary`. | ✅ `primary` → `#DC2626` (220 38 38) across all three sources; white text stays AA (4.85:1); theme now renders scarlet. |
| 5 | `Button.tsx`, `Badge.tsx` + ~26 call-sites | No `accent` variant, so call-sites hand-rolled `bg-accent`/`color="rgb(var(--color-accent))"` with light foregrounds → invisible (~1.2:1). | ✅ Added `accent` variant (`bg-accent` + `text-accent-foreground`); migrated call-sites; `text-accent`/`border-accent` foregrounds → `text-accent-foreground`. |
| 6 | `CaseDetail.tsx` action bar + inline-hex controls | Action colors hand-rolled via inline `style` hex (incl. **banned violet `#7c3aed`**), bypassing tokens, theming, and lint. | ✅ Mapped to Button variants / `cat-*` identity; violet removed; WhatsApp green kept as a documented exception. |
| 7 | `eslint-rules/` | `no-raw-tailwind-colors` only inspects class names, so inline-`style` hex escaped enforcement. | ✅ Added `no-raw-style-colors` (`error`; tests + app-shell neutral chrome baselined per-file) covering inline `style`/color props. |
| 8 | `ui/Dialog.tsx:90` | Default modal scrim was `bg-black/50` (inherited by ~90 modals); the **Overlays** standard is `bg-slate-900/40` (softer, token-consistent). | ✅ `Dialog.tsx:90` default now `bg-slate-900/40` (re-skins ~90 modals); `CommandPalette`'s redundant overlay tint dropped; `MobileNavDrawer` aligned. Media overrides (`bg-black/70` Email, `bg-black/90` PhotoViewer) retained. |
| 9 | `cases/DeviceFormModal.tsx`, `ui/Tabs.tsx` | Tabbed-modal tab bar shipped *underline* tabs (cat-1/2/3/4); the **Tabbed form modal** standard is colored *pills* (`primary`/`cat-5`/`cat-2`/`cat-6`, active solid fill). | ✅ `ui/Tabs` gained an opt-in `variant="pills"` (default stays underline); `DeviceFormModal` opts in and remaps to primary/cat-5/cat-2/cat-6. |
| 10 | `src/lib/ui/zIndex.ts`, `tailwind.config.js` | No named z-index scale; `z-50` saturated with ad-hoc `z-[60]` / `z-[100]` / `z-[9999]` overrides. | ✅ Added `zIndex.ts` + Tailwind `zIndex` tokens (sticky 20 / dropdown 30 / overlay 40 / modal 50 / popover 60 / toast 70); migrated the magic numbers; `cn()` extended so tokens dedupe; `z-toast` wired through the Toaster; test assertions updated. |
| 11 | `tailwind.config.js` | Custom `boxShadow` tokens `inner-sm` / `glow-primary` / `glow-primary-lg` — two dead (0 usages), one rare. | ✅ Removed `inner-sm` + `glow-primary-lg`; `glow-primary` deliberately retained for the onboarding tile (`StepContainer`), a documented decorative exception — not part of the `shadow-sm`→`-xl` ladder. |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-01 | Initial DESIGN.md created by codifying the live system (not proposing a new one) | xSuite has a locked theme/token system; goal is consistency, so the doc documents and enforces what exists. Source: `src/index.css`, `tailwind.config.js`, `src/lib/chartTheme.ts`, `src/lib/pdf/styles.ts`, `index.html`. |
| 2026-06-01 | Logged 3 known deviations rather than silently "documenting them away" | A consistency contract must reflect reality; drift is tracked for fixing, not normalized. |
| 2026-06-02 | Resolved drift #1: `glow-blue*` → `glow-primary*`, derived from `--color-primary` | The only consumer (`StepContainer` onboarding icon) is otherwise all-`primary`; a fixed blue-500 glow clashed and ignored the theme. Token-derived glow now themes across Royal/Burgundy/Scarlet. |
| 2026-06-02 | Resolved drift #2: focus `ring` follows `primary` | Removed the banned indigo `#6366F1`; focus rings now read as on-brand per theme. (Shipped earlier in the a11y focus-ring work; doc reconciled here.) |
| 2026-06-02 | Resolved drift #3: PDF `primary` set to fixed Royal navy `#162660` (was cyan `#0891B2`) | PDFs are intentionally non-themed (one color for all tenants — a themed invoice would look alarming). Cyan matched no brand and read as an unconfigured template; navy aligns to the default Royal identity and to the existing `primaryDark` navy. |
| 2026-06-02 | Added a sanctioned **categorical palette** (`cat-1`…`cat-8`), mirroring `chartCategorical`; migrated `InventoryInsightsHeader` onto it as proof | The raw-color burndown found that most surviving raw Tailwind brand colors are *identity* color (device-type tiles, per-module accents), not status. The 14-token vocab had no "N distinct categories" slot, so mechanical migration to `danger`/`info` falsely signalled status. A fixed, non-themed categorical tier reuses the already-blessed chart hues and unblocks a safe sweep. |
| 2026-06-02 | Completed the burndown: 31 files migrated to **zero** raw brand-color classes (identity→`cat-*`, status→semantic, brand→`primary`/`ring`, neutrals kept); exempted the fixed surfaces (PDF doc builders, auth decorative) | Finishes the work the categorical palette unblocked. Each file was classified by *intent* (status vs identity vs neutral) rather than find-replaced, so no element falsely signals status. Leaves `src/` clean enough that `no-raw-tailwind-colors` can enforce as `error` with only file-level exemptions. |
| 2026-06-04 | Scarlet `primary` `#280B08` → `#DC2626`; kept `#C92925` secondary | The theme was authored as "near-black + red accent", but chrome reads `primary` so it rendered brown app-wide; users expect a red "Scarlet". A brighter red keeps white-text AA (4.85:1) and leaves the 5 `secondary` usages untouched (zero blast radius). |
| 2026-06-04 | Added `accent` Button/Badge variant; banned raw inline-`style` colors | Closes the systemic gap that rendered ~26 accent controls invisible and let a banned violet button through. `no-raw-style-colors` guards the inline-`style` vector the class-based rule can't see (`error`; pre-existing test fixtures + app-shell neutral chrome baselined per-file, mirroring the no-raw-tailwind-colors burndown). |
| 2026-06-18 | H1: shared `DetailPageHeader` (breadcrumb-led) on the Invoice/Case/Customer detail pages; denser detail container (`px-6 py-5`) | The detail pages duplicated their title (back-button label + `PageHeader` + first-card title) and ran a wide low-density `p-8` shell. One breadcrumb-led header renders the title once (final crumb = `<h1>`), reclaiming vertical space; the `px-6 py-5` container is the detail-page density standard (L3). |
| 2026-06-19 | H2: list-page headers merged into the global top bar via `HeaderSlot`; the `PageHeader` row removed from 19 list pages (icon + subtitle dropped) | The top bar already renders the route breadcrumb, so a per-page `PageHeader` repeated the title and cost ~60px above the table. Pages register title + actions into the bar (`usePageHeaderSlot`, title as state + actions as portal); detail pages keep `DetailPageHeader`; `PageHeader` stays only for non-AppLayout shells (portal, platform-admin). |
| 2026-06-24 | Cases list gets a bold "command center" header: an in-content title band + period toggle (`This Month`/`30d`/`90d`/`This Year`) + a six-tile **token-gradient** KPI grid (`GradientStatCard`, `CasesCommandCenter`, `useCaseCommandStats`). Diverges from two standards **for this page only**: (a) the "no decorative gradients" aesthetic rule, and (b) the H2 "title lives in the top bar, no in-content header" pattern. | Owner-requested against a competitor command-center reference and explicitly approved, accepting the deviation for a higher-impact operational landing. Constraints held: every gradient is a semantic token (`primary`/`info`/`danger`/`warning`/`success`) or the fixed `cat-*` palette — **zero purple/indigo, zero raw hex** — so `no-raw-tailwind-colors` + `no-raw-style-colors` + the token guard stay green and the tiles re-theme per tenant. KPIs are honest: snapshot counts ("now") reuse the existing `master_case_statuses.type` logic; flow counts (`new` on `created_at`, `delivered` on `checkout_date`) are period-scoped with period-over-period trend deltas. All ten figures are head-only COUNT queries (no new RPC/migration). Scope is the Cases KPI band only; every other list page keeps the restrained `StatCard`/`KpiRow` + top-bar-title standard. |
| 2026-06-24 | **Lifted the "no decorative gradients" rule** — token-driven gradients are now sanctioned platform-wide for emphasis (KPI tiles, hero bands, command strips), not just the Cases exception above. Same day, compacted the Cases KPI band from six tall gradient cards into a denser stat ribbon (compact ~76px tiles + inline trend pills + share-of-total bars), reclaiming ~100px above the table. | The owner adopted the bold gradient look as house style and asked for a higher density-to-value ratio. Gradients stay token-only (no purple/indigo, no raw hex), so per-tenant theming + the `no-raw-*-colors` guards are unaffected — this is a permissive rule change plus a density pass, not a new color surface. |
| 2026-06-24 | **Rolled the gradient KPI tile out platform-wide.** Generalized the Cases tile into one shared primitive (`components/shared/GradientStatCard`) and routed `StatCard` + `KpiRow` through it, so every KPI surface (financial, HR, payroll, suppliers, quotes, customers, resources, platform-admin, settings, dashboards) now renders the gradient tile; migrated the Dashboard's bespoke `QuickStat`. Added per-tone foregrounds (slate-900 ink on amber/lime/yellow) for AA contrast and value truncation+tooltip for long currency. **Supersedes** the "every other list page keeps the restrained `StatCard`/`KpiRow`" note in the row above. | Owner asked to match the Cases design everywhere. One shared primitive keeps it DRY: upgrading it once restyled ~40 pages with zero call-site churn (`StatCard`/`KpiRow` APIs unchanged). Still token-only, so theming + colour guards hold. See **KPI Cards**. |
| 2026-06-24 | **KPI consistency pass** (post-rollout screenshot audit). Migrated the remaining **hand-rolled** KPI cards onto the shared `KpiRow`/`StatCard` tile — Customers, Companies, Company-profile, Banking, VAT & Audit, Financial Reports, HR / Attendance / Leave, Stock, and Tenant/Database admin — and **re-toned every KPI row so no tone repeats** (Payments, Expenses, Transactions, Revenue, Payroll, Platform, Clone-drives). | The audit found two gaps the shared-component rollout couldn't reach: (a) pages that hand-rolled their own muted cards never got the gradient; (b) rows reused a tone (2× green, 3× amber) which reads as monotonous on saturated tiles. Status tones are now reserved for genuine status; magnitudes use the documented brand/identity pick-order. See **KPI Cards → "One tone per card in a row"**. |
| 2026-06-26 | Added an **Overlays** standard: three-region modal (pinned header + scrolling body + pinned footer), semantic size tiers (verified against `Modal.tsx`), `max-h-[90vh]` **body**-scroll cap, responsive full-screen/bottom-sheet below `sm`, scrim standardized on `bg-slate-900/40`, focus-trap + ref-counted scroll-lock required. Canonicalizes the `Modal`/`CommandPalette` pinned pattern and retires whole-panel scroll (plain children in `Dialog`) for forms. | The recon found two scroll patterns coexisting and modals hitting `max-h-[90vh]` with no responsive fallback. Pinning the three regions keeps the Save button and tab bar always visible; the wide grid + tabs cut vertical height. **This section leads the code** — the `Modal`/`Dialog`/`CommandPalette` primitives exist and `DeviceFormModal` is the reference shell, but the `bg-slate-900/40` scrim migration (`Dialog.tsx:90`) and the remaining ~90 modals are tracked (Known Deviations #8). Note: `Modal` has no footer slot yet, so pinned-footer forms compose `Dialog` directly with the flex-column pattern until a `TabbedFormModal`/footer-slot scaffold lands. |
| 2026-06-26 | **Tabbed form modal** pattern + colored-pill tab bar mapped to `cat-*` identity tones (Device Details `primary`, Diagnostic `cat-5`, Components `cat-2`, History `cat-6`); ACTIVE = solid tone, INACTIVE = `bg-tone/10 text-tone`. Codified as the **target** (leads the code) over the shipped underline tabs, per owner decision. | Owner mockup uses vivid per-tab color; routing it through the sanctioned `cat-*` palette keeps `no-raw-tailwind-colors` / `no-raw-style-colors` green and re-uses blessed hues — the mockup's literal purple is banned, so History → `cat-6`/`cat-8`. Adds the active-state affordance the mockup lacked (it filled all four tabs identically). The shipped reference (`DeviceFormModal` via `ui/Tabs`) currently renders underline tabs (cat-1/2/3/4) built on `Dialog`; the doc codifies the pill target and the refactor is tracked (Known Deviations #9). |
| 2026-06-26 | Added a **Z-Index Scale** (`src/lib/ui/zIndex.ts` + Tailwind tokens: dropdown 30 / overlay 40 / modal 50 / popover 60 / toast 70) and an **Elevation** ladder (resting `shadow-sm` → overlay `shadow-xl`). The z-index scale leads the code (it does not exist yet); the elevation ladder documents the live `shadow-*` vocabulary and flags the dead custom tokens for removal. | The recon found `z-50` saturated with ad-hoc `z-[60]`/`z-[100]`/`z-[9999]` overrides and no governance, and the custom shadow scale unused (1 usage) with depth leaning ~5:1 on borders (~2000 vs ~400). Both are now named layers/levels so overlays stack predictably and depth is intentional; the scale file + token migration and the dead-shadow cleanup are tracked (Known Deviations #10–#11). Toast layering is governed by `react-hot-toast`'s default today, not an app token — flagged in the Z-Index section. |
| 2026-06-26 | Added a **Forms & Field Layout** section: responsive 4-column grid for Workspace forms, uppercase section-header dividers, `col-span-full` for long fields, `ui/FormField` + `ui/` primitives as the presentational standard. | Documents the field-grouping the redesign introduces and the existing `FormField` conventions (verified at `ui/FormField.tsx`, not `shared/`) the doc never captured. The 4-column grid is the main scroll-reducer (≈ ¼ the rows of a single column). The grid + dividers are net-new prescriptions (no form uses them yet), applied to new/edited work; field state-model migration is not forced. |
| 2026-06-26 | **Implemented Known Deviations #8–#11** the same day they were codified: `Dialog` scrim → `bg-slate-900/40` (+ `CommandPalette`/`MobileNavDrawer` reconcile); opt-in `ui/Tabs` `variant="pills"` adopted by `DeviceFormModal`; named z-index scale (`src/lib/ui/zIndex.ts` + Tailwind tokens, `cn()`/twMerge extended, magic numbers migrated, Toaster wired); removed the two dead `boxShadow` tokens (retained `glow-primary`). Doc reconciled — #8–#11 ✅, the Overlays / Z-Index / Tabbed-form "Status — leads the code" notes now read "shipped". | The owner asked to proceed with the tracked items; doing the code in the same change set keeps the contract honest (no "shipped" claim ahead of code). The z-index migration was behavior-preserving and **corrected the scale's latent regression**: page menus-with-backdrop (`RowActionsMenu`/`ColumnPickerPopover`) coexist with `BulkActionsBar` (overlay 40) so they map to `z-modal` (50)/`z-overlay` (40), not `z-dropdown` (30); `Select` is a native element (no z-index) and was dropped from the field-listbox set. tsc 0; full suite green except 2 pre-existing invoicePilot PDF failures. |
