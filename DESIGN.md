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
- **Theming:** Four tenant-selectable themes share one structure. The three light themes (Royal, Burgundy, Scarlet) change only the brand hue over one shared neutral/status layer; the premium dark theme (**Midnight Aurora**) additionally rebinds the surface, border, status and neutral-ramp variables. See **Color → Themes** and **Color → Neutral ramp**.

## Typography
Fonts load via Google Fonts in `index.html` (CSP allows `fonts.googleapis.com` / `fonts.gstatic.com`). Family tokens are defined in `tailwind.config.js` (`fontFamily`); the default `sans` is set to Inter so unclassed elements inherit it via Tailwind Preflight (`html`).

> Full baseline + evidence: `docs/typography-audit-2026-07-02.md`. The role table below was codified
> 2026-07-02 (see Decisions Log) — values match the codebase majority so most surfaces are already
> conformant; deviations are burned down by the typography standardization program and held by lint.

### Families
- **All UI (Display / Body / Labels / Data):** `Inter` — the single app-wide typeface via `font-sans`
  (Preflight default). The legacy `font-body`/`font-display` aliases (both = Inter) are **removed** —
  do not reintroduce them; unclassed text already inherits Inter.
- **Auth zone display (the single sanctioned scoped exception):** `font-display-auth` = Chakra Petch
  (600/700, Google Fonts, same CSP allowlist). Owner-approved 2026-07-04 for the pre-tenant auth
  surfaces **only** — wordmark + headline on login / reset-password / signup. It is differently-scoped
  from the removed `font-display` alias (which was Inter everywhere): this token must never appear in
  the app shell, portal, or any tenant-themed surface. If you see it outside `src/pages/auth/**` /
  `src/components/auth/**`, that is drift.
- **Code / character-verified data:** `font-mono` — tokenized in `tailwind.config.js` as the platform
  monospace stack. **Mono is for strings a human verifies character-by-character**: device serials,
  custody hashes, SKUs, tenant/plan codes, OTP inputs, JSON/raw payloads, `kbd` shortcuts. Business
  document numbers (CASE/INV/EXP/CUST/QUO-…) are **not** mono — they render proportional per the
  table-cell roles below.
- **Arabic / RTL (PDF only):** Noto Sans Arabic + Tajawal, in `public/fonts/` (see `src/lib/pdf/fontLoader.ts`). On-screen Arabic falls back to the system Arabic face (Inter ships no Arabic glyphs); PDFs are unaffected.

### Sizes
- Default Tailwind type scale only. **Arbitrary sizes (`text-[Npx]`) are banned** (lint:
  `xsuite/no-arbitrary-typography`; pre-existing offenders are baselined per-file and ratchet down).
- `text-xxs` = `0.625rem` (10px) — sanctioned **only** for KPI-tile microlabels/pills and app-chrome
  metadata (nav count bubbles, kbd hints). Never for content labels or body text.
- `text-nav` = `0.8125rem/1.25rem` (13px/20px) — the **app-chrome tier** (top-bar title + crumbs,
  sidebar nav items/user name). Chrome-only; content surfaces never use it.
- **Content floor is 12px (`text-xs`).** 9/10/11/13/15px arbitrary values are fully retired (93 → 0,
  2026-07-02); the chrome ramp is tokenized (`text-nav`/`text-xxs`; wordmark `text-sm`).
- **Explicit size on table/tab text is mandatory.** Unsized `<td>`/`<span>`/tab text inherits the 16px
  root and silently breaks the 14px rhythm (the audit's F-4 class of bugs).

### Type roles (locked)
| Role | Spec |
|---|---|
| Page title — AppLayout list pages | Top-bar slot only (`usePageHeaderSlot`); **no in-content page header** (H2 pattern) |
| Page title — detail pages | `DetailPageHeader` h1: `text-2xl font-bold text-slate-900` |
| Page title — portal / platform-admin shells | `PageHeader` (`text-lg font-semibold`) for list-level; `DetailPageHeader` for detail-level; `text-3xl` retired |
| Section / card heading | `text-lg font-semibold text-slate-900`; sub-section `text-base font-semibold`; `font-bold` is not a heading weight at these sizes |
| Modal title | `text-lg font-semibold text-slate-900` (`Modal`/`ConfirmDialog`) — all surfaces incl. portal; **form/entity modals opt into `titleSize="sm"` → `text-base` (16px)** per the Form-modal reference (Overlays) |
| Table header (th) | `text-xs font-semibold uppercase tracking-wider text-slate-600` |
| Table body cell | `text-sm text-slate-700`; identity/emphasis cells `text-sm font-semibold text-slate-900` (or `text-primary` for linked numbers) — size always explicit |
| Money / quantity | `text-sm font-semibold text-slate-900 tabular-nums`; `font-bold` reserved for totals rows; `tabular-nums` on every numeric column/figure |
| Button | `font-medium`; sm `text-sm`, **md (default) `text-sm`**, lg `text-base` — 14px is the platform button size |
| Badge / chip | `ui/Badge` only (`font-semibold`; sm `text-xs`, md `text-sm`); no hand-rolled 9–11px chips |
| Form label | `text-sm font-medium text-slate-700` (the settings `font-semibold` variant is retired). **Floating-label variant (form/entity modals): `FLOATING_LABEL_CLS` = `text-xs` (12px) `font-medium text-slate-500`, a notch on the field's top border** — opt-in `floatingLabel`, a11y-associated via `useFieldA11y` (a persistent label, not a placeholder-only field); see Overlays → Form modal |
| Hint / helper | `text-xs text-slate-500` |
| Error | `text-xs text-danger` + `AlertCircle` icon + `role="alert"` (the `FormField` spec — universal) |
| Uppercase micro-label / form section header | `text-xs font-semibold uppercase tracking-wider` (+ `text-primary` for form section dividers, `text-slate-500` elsewhere) |
| KPI cards | the two `StatCard` styles only — compact (label `text-xs font-medium text-slate-500`, value `text-xl font-bold tabular-nums`) and vivid `GradientStatCard` (label `text-xxs font-semibold uppercase tracking-wider`, value `text-xl/2xl font-bold tabular-nums`); no hand-rolled KPI markup |
| Empty state | `shared/EmptyState` (`text-lg font-semibold` + `text-sm`) |
| Pagination | `ui/Pager` (`text-sm text-slate-600`) |
| Breadcrumbs | top-bar `text-nav` (chrome); `DetailPageHeader` crumbs `text-sm text-slate-500` — surface-specific, both sanctioned |

### Neutral text (slate only)
`text-gray-*` (and every `*-gray-*` utility) is **banned** in `src/` — lint `xsuite/no-gray-palette`.
Shade roles: primary content `slate-900` · body `slate-700` · secondary `slate-600` · captions/hints
`slate-500` · decorative/disabled only `slate-400` (≈3:1 on white — never for meaningful text).

### Tracking & transforms
- Uppercase labels always pair with `tracking-wider`. `tracking-wide` is retired from the uppercase
  micro-label role; arbitrary `tracking-[…]` literals are banned — sole exception `tracking-[0.5em]`
  on OTP/code inputs (built into the lint rule).
- `italic` only for quoted/testimonial content and notes.

### Portal surface (customer-facing — sanctioned larger ramp)
The customer portal (`src/pages/portal/**`, `PortalLayout`) is read by customers like a website, not a
dense ops tool, so it keeps its own **larger sanctioned ramp** (owner decision 2026-07-02, "Option A"):
in-page page titles `text-2xl font-bold`, card headings `text-lg font-bold`, stat values up to
`text-3xl`. Everything else follows the shared roles — table headers use the standard th spec, labels/
hints/errors/badges/buttons use the shared primitives and specs, uppercase labels use `tracking-wider`,
money uses `tabular-nums`. Do not import the portal ramp into the ops app, and do not "fix" portal
titles down to ops sizes.

### Enforcement
`eslint-rules/no-gray-palette.js` and `eslint-rules/no-arbitrary-typography.js` — both `error` with
**no baseline** (fully enforced since 2026-07-02; the sole in-rule exception is OTP
`tracking-[0.5em]`). Same operating model as the raw-color rules.

## Color
Every brand/status token is an **RGB triplet** CSS variable (e.g. `--color-primary: 22 38 96`) so Tailwind's `<alpha-value>` opacity syntax works. The 14 semantic tokens are wired in `tailwind.config.js`; values live in `src/index.css`. **Use semantic tokens only — never raw Tailwind brand colors or hex in `src/`.**

### Themes (brand layer)
`src/index.css` — `:root[data-theme="…"]`. Default theme is **Royal**. The three
light themes change only these six brand vars; **Midnight Aurora** (`midnight`,
the flagship premium dark theme, matching the sign-in experience) additionally
rebinds surface/border/status/neutral-ramp vars — see the subsections below.
Every Midnight pair is WCAG-validated (matrix:
`docs/superpowers/plans/2026-07-05-midnight-aurora-theme.md`).

| Token | Royal (default) | Burgundy | Scarlet | Midnight Aurora |
|---|---|---|---|---|
| `primary` | `#162660` (22 38 96) | `#6C131F` (108 19 31) | `#DC2626` (220 38 38) | `#2E6BE8` (46 107 232) |
| `primary-foreground` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `secondary` | `#D0E6FD` (208 230 253) | `#A14B58` (161 75 88) | `#C92925` (201 41 37) | `#6D4AE3` (109 74 227) |
| `secondary-foreground` | `#162660` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `accent` | `#F1E4D1` (241 228 209) | `#FFECEA` (255 236 234) | `#F9E7C9` (249 231 201) | `#221D47` (34 29 71) |
| `accent-foreground` | `#162660` | `#6C131F` | `#280B08` | `#C9C2F8` (201 194 248) |

Midnight's violet `secondary`/`accent` is the app-wide extension of the auth
zone's owner-approved blue→violet identity (2026-07-05). The purple/indigo/
violet **class** ban stands unchanged everywhere — theme *token values* are the
only sanctioned channel for this hue, so it re-themes away on light themes.

### Surface & line (constant across the light themes; Midnight rebinds)
`src/index.css` — constant `:root` block; `:root[data-theme="midnight"]` overrides.

| Token | Light themes | Midnight |
|---|---|---|
| `surface` | `#FFFFFF` 255 255 255 | `#111B32` 17 27 50 |
| `surface-muted` | `#F8FAFC` 248 250 252 | `#0A111F` 10 17 31 |
| `border` | `#E2E8F0` 226 232 240 | `#213052` 33 48 82 |
| `ring` (focus) | follows `primary` | follows `primary` |

### Status (meaning is fixed — never theme the HUE)
Constant across the light themes; Midnight re-anchors the same hues for dark
surfaces (text-on-muted ≥ 4.5:1; white-on-fill ≥ the light themes' own ratios).

| Role | Light base / muted | Midnight base / muted | Foreground |
|---|---|---|---|
| `success` | `#059669` / `#D1FAE5` | `#0DA271` / `#09291F` | `#FFFFFF` |
| `warning` | `#D97706` / `#FEF3C7` | `#E28C0B` / `#3D2B0A` | `#FFFFFF` |
| `danger` | `#DC2626` / `#FEE2E2` | `#E24E44` / `#2F0C0F` | `#FFFFFF` |
| `info` | `#0284C7` / `#E0F2FE` | `#1E9BD7` / `#082939` | `#FFFFFF` |

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
  **Single sanctioned exception:** Midnight re-anchors only the two DARK hues —
  `cat-7` → `#5E86E8`, `cat-8` → `#93A5C1` — because blue-800/slate-600 text sits
  near 2:1 on the navy card. UI vars only; `chartCategorical` (SVG data fills)
  stays byte-identical so charts remain comparable across tenants.
- **Never use for status.** Status meaning lives only in `success/warning/danger/info`.
- **Muted background:** use alpha, e.g. `bg-cat-1/10` with `text-cat-1` (mirrors the
  `*-muted` pattern). Proof-of-concept consumer: `InventoryInsightsHeader.tsx`.

### Neutral ramp (var-backed `white`/`slate` utilities) — added 2026-07-05
The Tailwind neutral utilities are **semantic roles**, remapped **per utility**
to CSS variables in `tailwind.config.js` so the whole app re-skins under
`data-theme="midnight"` with zero call-site churn. On the light themes the vars
bind to the **exact Tailwind v3.4 values** (pixel-identical). Vars live in
`src/index.css` (`--nb-*` backgrounds, `--nt-*` text ink, `--ne-*` edges).

| Utility | Role | Light | Midnight |
|---|---|---|---|
| `bg-white` | card surface | `#FFFFFF` | `#111B32` |
| `bg-slate-50` | page background | `#F8FAFC` | `#0A111F` |
| `bg-slate-100/200/300` | raised / strong / inset fills | Tailwind values | `#16223C` / `#1F2D4E` / `#2A3A60` |
| `bg-slate-700/800/900` | dark-chrome fills (tooltips, scrims, media) | Tailwind values | `#2D3C5E` / `#0D1526` / `#040812` |
| `text-slate-900…300` | ink ramp (headings → decorative) | Tailwind values | inverted: `#EDF2FA` … `#7A8AA8` |
| `border/divide/ring-slate-100/200/300` | edges | Tailwind values | `#17233E` / `#213052` / `#2D3E64` |
| bare `border` (DEFAULT) | edge | `#E2E8F0` (was gray-200 — drift, fixed) | `#213052` |

Rules:
- **`text-white` and `text-slate-50..200` are ink-on-dark/colored fills — they stay literal in every theme.** Never use them on light surfaces.
- **`bg-white` MEANS "card"** and `bg-slate-50` MEANS "page" — pick by role, not by literal color, exactly as before; the ramp keeps the meaning.
- **`ink-dark`** (`--color-ink-dark`, constant `#0F172A`) is the dark ink for
  saturated fills (amber/lime KPI tiles, colored pills). Use `text-ink-dark` /
  `bg-ink-dark/NN` there — **never `text-slate-900`**, which inverts on midnight.
- **`ink-light`** (`--color-ink-light`, constant white) is the white glass/
  decoration on saturated fills — use `bg-ink-light/NN` there, **never
  `bg-white/NN`**, which remaps to the navy card on midnight. (`text-white`
  needs no substitute — text utilities stay literal.)
- **Paper islands:** on-screen document previews that mirror the non-themed
  PDFs (`#invoice-print-content`, `#quote-print-content`, or any element with
  `.paper-light`) re-pin the ramp to light in every theme — apply `.paper-light`
  to new print-parity surfaces (receipt hosts, signature canvas, PDF-template
  thumbnails, brand-asset/QR previews).
- **`Badge variant="custom"`** re-mixes its DB/config color toward white under
  midnight via the `.badge-custom` rule (hue identity preserved) and uses
  `color-mix` for tint/border, so token strings (`rgb(var(--color-x))`) are
  valid inputs — never concatenate hex+alpha by hand.
- Scrollbars follow `--scrollbar-thumb(-hover)`; Tailwind's ring-offset default
  is rebound to the card surface under midnight; `@media print` forces the
  light bindings back so the dark theme never prints navy pages.
- Chart **chrome** (axis/grid/tooltip/legend) re-skins under midnight via
  scoped CSS in `index.css`; chart **data hues** stay fixed (see Non-Themed
  Surfaces).

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

- **Charts:** `src/lib/chartTheme.ts` — `chartCategorical` (8 hues), `chartAxis` `#64748b`, `chartGrid`/`chartTooltipBorder` `#e2e8f0`. Data-vis neutral; never theme the DATA hues. **Precision (2026-07-05):** the chart *chrome* — axis text, grid lines, tooltip frame, legend text — is re-skinned for legibility under `data-theme="midnight"` via scoped CSS in `src/index.css` (constants file untouched); the data hues stay fixed in every theme.
- **Categorical UI palette:** `cat-1`…`cat-8` (`src/index.css`, `tailwind.config.js`) — the screen-side mirror of `chartCategorical`, for identity color in UI (see **Color → Categorical (identity) palette**). Fixed across themes by design.
- **PDFs:** `src/lib/pdf/styles.ts` — `PDF_COLORS` (primary `#162660` = fixed Royal-brand navy, text `#1E293B`, …), font `Roboto`. One fixed color for all tenants by design (a themed invoice would look alarming). Device-role badge colors (patient/backup/donor/spare) are fixed.
- **Device icons:** `src/lib/deviceIconMapper.ts` — fixed SVG hexes. Intentional.
- **Auth zone:** the full pre-tenant surface — `src/pages/auth/**` + `src/components/auth/**` (redesigned 2026-07-04 as one immersive dark canvas). Shared identity pieces: `AuthBackground.tsx` (slate/blue-950 gradient, sector-dot grid, particles, scanning beam, `AuthWaveField.tsx` Canvas-2D particle wave), `GlowPanel.tsx` (glass panel with animated conic border glow — `backdrop-blur` is sanctioned here and only here at page scale), `XLogo.tsx` (gradient logomark), `AuthShell.tsx` (full-bleed scaffold), `AuthTextField/AuthAlert/PasswordStrengthMeter` (dark-legible variants — the semantic status tokens are tuned for light surfaces and fall below contrast on slate-950). Auth renders **before** a tenant theme is known, so the zone is intentionally non-themed and lint-exempt (`eslint.config.js` fixed-surfaces block) like PDFs. The old `AuthLayout` 60/40 split and `auth/shared/constants.ts` were deleted with the redesign.
  - **Blue→violet gradient identity (owner-approved exception, 2026-07-04):** the auth zone's brand gradients (logomark, headline accent, primary CTA, border glow, wave) deliberately use the sky→violet family per the approved login mockup. This is the ONLY place violet may appear — the repo-wide purple/indigo/violet ban stands everywhere else and remains lint-enforced outside this zone.

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

- **Primitives:** `ui/Modal.tsx` wraps `ui/Dialog.tsx` and is the canonical surface for header-pinned forms — it passes `flex flex-col overflow-hidden` to the panel and renders children in a `p-4 overflow-y-auto flex-1` body, so the header stays pinned (`Modal.tsx:71`/`:104`). `ui/Dialog.tsx` is the low-level container: React portal to `document.body`, `useFocusTrap` (focus trap + restore), and a **ref-counted** body scroll-lock so stacked dialogs don't unlock early (`Dialog.tsx:20-64`). **The pinned behavior is not a property of `Dialog` itself** — `Dialog`'s own panel is a single whole-panel scroller (`max-h-[90vh] overflow-y-auto`, `Dialog.tsx:101`). The three-region layout comes from the *consumer* layering `flex flex-col overflow-hidden` on the panel and splitting children into intrinsic-height header/footer + a `flex-1 overflow-y-auto` body. **Do not render plain children straight into `Dialog`** — that whole-panel scroll lets the header and actions scroll away (retired for forms). **`Modal` now ships a pinned `footer` slot** (2026-07-02: `shrink-0 border-t px-4 py-3`), so ordinary forms get the three-region layout from `Modal` alone; only Workspace-tier surfaces with custom chrome (tab bars, split panes) still compose `Dialog` directly — as `shared/CommandPalette.tsx` and `cases/DeviceFormModal.tsx` do. Mirror them.
- **Anatomy:**
  1. **Pinned header** — title + optional icon/badges. Dismissal is footer buttons + ESC + backdrop
     (each opt-out via `closeOnEscape`/`closeOnBackdrop`), so **every modal MUST carry at least one
     explicit footer close/cancel action** (View modals: a single "Close"). The top-right X was removed
     platform-wide 2026-07-02, then **re-added as an opt-in `showClose` for form/entity modals
     2026-07-20** (the party-form standard — the reference `CustomerFormModal` sets it); it *supplements*
     the footer action, never replaces it. Plain content/confirm modals stay X-less.
  2. **Optional pinned sub-header** — the tab bar and/or a fixed control row (e.g. the Device Role select + "Mark as Primary" checkbox in `DeviceFormModal`). Stays put with the header.
  3. **Scrolling body** — the *only* scroll region (`flex-1 overflow-y-auto`).
  4. **Pinned footer** — destructive action left (e.g. Delete), Cancel + primary action right, separated by a `border-t`. Pinned via flex `shrink-0`, **not** CSS `sticky`/`position`. **`Modal` now provides this as the `footer` slot** (2026-07-02): a pinned `shrink-0 border-t px-4 py-3` region; consumers render their own button row inside (`flex items-center justify-end gap-3`; `justify-between` when a destructive action sits left). Footers must never live inside the scrolling body on forms that can scroll.
     - **Cancel / Close / Done = `variant="secondary"`** (the platform standard, matching the `DeviceFormModal` reference; unified 2026-07-02). The primary/confirm action carries its own tone (`primary`, or `success`/`danger`/`warning` where semantic). Never `ghost` for a footer dismiss — `ghost` is for tertiary/toolbar actions, not the Cancel-in-a-pair role.
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

### Form modal — canonical reference: `customers/CustomerFormModal.tsx`
The **finalized design for every entity add/edit modal** — the floating-label form. Owner-approved
2026-07-21 (PR #437) as the reference to **replicate across all form/entity popups** (customer,
company, supplier, and the rest). It is the Standard/Wide-tier pattern; the Workspace-tier
tabbed layout below is for 30+ field records only.

> **Status — leads the code.** The pattern is fully shipped in `CustomerFormModal` (the party-form
> reference); rolling it out to the remaining entity add/edit modals is the tracked forward work. The
> non-floating 14px-label baseline (Modal.tsx comment) stays valid for confirm/view/simple modals that
> haven't adopted it.

- **One component, both modes.** A single modal serves **Add and Edit** — pass the record (e.g.
  `customer`) to switch to edit; absent = create. Add and Edit must be a **1:1 visual match**. Do not
  hand-roll a second edit form for a record that already has an add modal (the list/detail pages both
  render the same component). Company-relationship and profile-photo editing live in their own UIs, so
  edit mode hides those fields rather than duplicating them.
- **Chrome:** `titleSize="sm"` (16px title) · round `bg-primary/10` icon badge · **`maxWidth="xl"`
  (576px)** — the party/entity-form width, two-column rows · opt-in **`showClose`** (top-right X, the
  party-form standard) · **`closeOnBackdrop={false}`** (a backdrop click must not discard in-progress
  input) · **`initialFocusRef`** on the first field. Optional **`headerAction` micro-badge** for a
  non-consuming preview — e.g. the next-number pill (`border border-info/30 bg-info-muted` rounded
  pill; label `text-xxs font-medium uppercase text-slate-500`, value `font-mono text-xs
  font-semibold text-info`), shown in create mode only.
- **Floating labels everywhere.** Every field uses the opt-in **`floatingLabel`** variant — the label
  is a notch on the field's top border (`FLOATING_LABEL_CLS`, `text-xs` 12px, `text-slate-500`,
  `bg-surface` so it sits *over* the border), not a stacked label above. Supported on `Input`,
  `Textarea`, `SearchableSelect`, `Select` (native), `PhoneInput`, and `AddressFields`. The label association is preserved
  through `useFieldA11y` (so it is a real persistent label — never a placeholder-only field — and stays
  query-able by `getByLabelText`).
- **Quiet placeholders & sentinels.** Placeholders render at `text-xs` (12px, `placeholder:text-xs`)
  so they read a step below the 14px typed value; a `SearchableSelect`'s **`shrinkDefaultValue`** shows
  its unset sentinel ("No <Entity>" / "Not specified", per the Forms sentinel convention) at `text-xxs`
  so an empty value reads quietly; the dropdown's options/search/empty/add-new text also drops to
  `text-xs` under `floatingLabel`. Selects **`usePortal`** so their listbox clears the panel (`z-popover`).
- **Layout:** `space-y-6` row rhythm; related fields pair into `grid grid-cols-1 md:grid-cols-2 gap-4`
  rows; a single full-width **Address** line sits above an **"Additional address details (optional)"**
  sub-block (`AddressFields`) captioned `text-xs font-medium text-slate-500`. **No uppercase
  section-header dividers** at this tier — those belong to the 4-column Workspace grid (Forms & Field
  Layout). Clear-× affordances stay banned inside controls (Forms & Field Layout).
- **Progressive disclosure.** Secondary/rare fields hide behind a **`+`** affordance (a plain
  `text-primary` icon-button anchored above the field it extends) and reveal in the next row with an
  **`X`** to collapse-and-clear — e.g. Alternative Email + Alternative Mobile. Keeps the default form
  short (Forms & Feedback: progressive disclosure over overwhelm-upfront).
- **Footer:** compact — Cancel `variant="secondary" size="sm"` + `text-xs`, primary action
  `size="sm"` + `text-xs` with a `Loader2` spinner while pending, separated by a `border-t`. A short
  party form renders this at the end of the `space-y-6` body; **when a form modal can scroll, move the
  footer into the pinned `Modal` `footer` slot** per the three-region standard above.
- **Inline sub-create.** An "Add New <X>" flow (e.g. Add New Company) opens as a `size="sm"` child
  `Modal` from the select's `onAddNew`; on success it selects the new row and closes.

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
| base | — | 0–10 | page content; `Dialog`/`Modal` panel internals (`z-10` *within* the overlay's own stacking context) |
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

> **Two form tiers, two layouts.** Standard/Wide **entity add/edit modals** use the **floating-label
> form** (single component for Add + Edit, notch labels, 2-column paired rows, progressive disclosure) —
> the canonical reference is `CustomerFormModal`, specified under **Overlays → Form modal**. The
> **4-column grid + uppercase section-header dividers** below is the **Workspace-tier** layout for
> 30+ field, tabbed records. Pick the tier by field count; do not mix a floating-label party form into
> the Workspace grid or vice-versa.

> **Status — partly leads the code.** The `FormField` + `ui/` field primitives below exist and are the standard for labels/errors/a11y. The **4-column Workspace grid** and **uppercase section-header dividers** are **net-new prescriptions** — no form uses them yet (the closest shipped grid is `DeviceDetailsForm`'s `sm:grid-cols-2 lg:grid-cols-4`; tab bodies vary at `lg:grid-cols-3`). Apply them to new and edited Workspace forms; existing forms are tracked, not assumed.

- **Grid:** Workspace-tier forms use a responsive 4-column grid — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5`. Wide = 2 columns, Standard = 1 column. **The multi-column grid is the primary scroll-reducer:** ~35 fields in 4 columns is ~9 rows versus ~18 in two. *(Shipped device-form bodies currently break at `sm:` rather than `md:` and some use 3 columns; converge new work on the 4-column `md:`/`lg:` grid.)*
- **Section headers:** group related fields under uppercase labelled dividers — `text-xs font-semibold uppercase tracking-wider text-primary` + a `border-b border-border` rule, spaced above (e.g. "BASIC INFORMATION", "TECHNICAL INFORMATION"). A flat wall of fields is not acceptable for 15+ field forms. *(Tracking harmonized to `tracking-wider` 2026-07-02 — one spacing for every uppercase label.)*
- **Full-width fields:** long or multi-value controls (chip/multi-select Accessories, Device Password, Role-Specific Notes, rich-text terms) span all columns (`col-span-full`).
- **Primitives:** use `ui/FormField.tsx` (owns label / required `*` / error / hint + a11y via `useFieldA11y`, `src/hooks/useFieldA11y.ts`) with the `ui/` field primitives (`Input`, `Select`, `SearchableSelect`, `Textarea`, `Checkbox`, `ChipInput`, `PhoneInput`, `RichTextEditor`). Verified `FormField` classes: label `block text-sm font-medium text-slate-700`; error `<p>` `text-xs text-danger flex items-center gap-1` with `role="alert"` on the `<p>` (via `useFieldA11y`) and a decorative `aria-hidden` `AlertCircle` (`w-3 h-3 shrink-0`); hint `text-xs text-slate-500`. **This is a presentational standard — it does not require rewriting a form's state model.** Three form patterns coexist today (plain `useState`; `react-hook-form` + `register`; `FormField` render-prop); converge *new and edited* forms on `FormField` for consistent labels and error rendering, without a forced migration.
- **Density:** comfortable, not bloated. Tune row gap so more of a tab is visible per viewport — the goal is **fewer scroll events**, not maximum whitespace.
- **No clear/reset (×) affordances inside form controls** (owner decision 2026-07-02). Select-type
  controls (`SearchableSelect`, `MultiSelectDropdown`, and any lookup/combobox) render **only the
  chevron**; a value is changed by picking a different option, and a multi-select deselects by
  toggling the option in its list. Optional lookups that must support "no value" do it with an
  explicit **"None"-style option** in the list, never an × button. *(Distinct pattern, unaffected:
  free-text tag inputs — `ChipInput`/`TagInput` — keep per-chip removal; their chips ARE the value
  editor, not a selection mirror.)*
  - **Sentinel labeling convention:** prepend `{ id: '', name: '<Label>' }` to the options array.
    Named-entity relationships (Company, Customer Group, Primary Contact, Supplier) → **"No
    &lt;Entity&gt;"**; catalog attributes and geography (Brand, Capacity, Interface, Condition,
    Industry, Country, City) → **"Not specified"** (avoids colliding with a catalog row that is
    itself semantically "None", e.g. an encryption-type catalog's real "Unencrypted" entry).
  - **Not every optional field gets a sentinel.** Skip it where the catalog already carries its own
    "not yet known" row (e.g. a Pending/Untested status option), where the field is a list-page
    filter (an empty filter already reads as "no filter" via its placeholder), or where the control
    is a single-purpose action picker whose only "nothing selected" state is Cancel (e.g. "assign to
    case", "transfer custody to"). Do not add a sentinel to a field that must always carry a value
    for the record to make sense (e.g. case priority) — that isn't a clearable relationship, and
    restoring the removed × there would just reintroduce an invalid state.

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
| 2026-07-21 | **Form-modal standard codified — the floating-label form (`CustomerFormModal`) is the canonical entity add/edit popup, to be replicated across all form modals.** Added **Overlays → Form modal**: one component for Add + Edit (1:1 match), floating notch labels (`FLOATING_LABEL_CLS`, `text-xs`/12px, opt-in `floatingLabel` on `Input`/`Textarea`/`SearchableSelect`/`PhoneInput`/`AddressFields`, a11y via `useFieldA11y`), compact chrome (`titleSize="sm"` 16px title, round `bg-primary/10` icon badge, `maxWidth="xl"` 576px, opt-in `showClose` X, `closeOnBackdrop={false}`, `initialFocusRef`, optional `headerAction` number-preview pill), `text-xs` placeholders + `shrinkDefaultValue` sentinels, `space-y-6` + `md:grid-cols-2 gap-4` paired rows, `+`/`X` progressive disclosure, compact `size="sm"` footer (Cancel = `secondary`). Updated the Type-roles **Modal title** (form modals → `titleSize="sm"`) and **Form label** (floating-label variant) rows; reconciled the **No top-right X** anatomy note with the 2026-07-20 opt-in `showClose` re-introduction; cross-linked **Forms & Field Layout** (floating-label = Standard/Wide tier, the 4-col grid = Workspace tier). Marked **leads the code** — shipped in `CustomerFormModal`, roll-out to the remaining entity modals tracked. | Owner directive: the finalized Add/Edit Customer popup is the house form-modal design — replicate everywhere so every add/edit surface reads identically. Codifying it as a named reference (rather than per-modal reinvention) makes the roll-out mechanical and keeps Add/Edit 1:1. The pattern reuses existing primitives (opt-in `floatingLabel`, `Modal` `titleSize`/`showClose`/`headerAction`), so no new tokens — the color/typography/z-index contracts are unaffected. Emerged from PR #437's modal work (`Modal.tsx` typography-benchmark + width-tier comments, `showClose` re-add). |
| 2026-07-05 | **Midnight Aurora (4th theme, premium dark) + var-backed neutral ramp.** Added `data-theme="midnight"` (navy surfaces `#0A111F`/`#111B32`, electric-blue `primary #2E6BE8`, aurora-violet `secondary #6D4AE3`, dark-violet `accent` surface) and remapped the `white`/`slate` utilities per-utility onto CSS vars (`--nb-*`/`--nt-*`/`--ne-*`) so ~7,000 neutral call-sites re-skin with zero churn — light themes bind to the exact Tailwind values (pixel-identical). New constant `ink-dark` token for ink-on-saturated-fills (GradientStatCard light tiles migrated); status + `cat-7`/`cat-8` re-anchored for dark with hue/meaning preserved (all pairs WCAG-validated, matrix in the plan doc); chart chrome re-skins via scoped CSS (data hues fixed); `@media print` forces light bindings; scrollbars/ring-offset/`color-scheme` themed; bare-`border` DEFAULT rebound from gray-200 (latent drift) to the slate-200 edge token. `main.tsx` anti-flash whitelist now derives from `THEMES` (hardcoded 3-theme list = wrong-theme flash regression, fixed). DB: `tenants.theme` CHECK gains `'midnight'` (applied 2026-07-05, version `20260705175334`). | Owner asked for the new login page's premium navy/blue/violet identity as a flagship app-wide theme plus a theme-system hardening pass. The login design language was already owner-approved for auth (2026-07-04); routing the violet through theme *tokens* keeps the purple/indigo/violet class ban fully enforced. Per-utility var remap chosen over a ~400-file class rewrite: zero call-site churn, pixel-stable light themes, and future themes (incl. dark) become pure CSS additions. |
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
| 2026-07-02 | **Clear-× removed from all select-type form controls.** `SearchableSelect` lost its single-value clear button **and the `clearable` prop entirely** (30 `clearable={false}` opt-outs across 10 files deleted); `MultiSelectDropdown` chips are now plain labels (deselection = toggling the option in the list, which already worked via click + keyboard). Only the chevron remains inside the trigger. Codified under **Forms & Field Layout**; free-text tag inputs (`ChipInput`/`TagInput`) explicitly keep chip removal — different pattern. | Owner directive (screenshot-flagged): no reset affordances inside fields; values change by selecting another option, optional lookups clear via an explicit "None" option. Removing the behavior at the two shared components makes it disappear app-wide with zero page-by-page edits. |
| 2026-07-02 | **Modal M-P3 — zero-scroll layout pass.** Widened + multi-columned the fixed-field forms the audit named as worst scroll offenders and pinned their footers: `SupplierFormModal` (lg→4xl, 2-col→lg:3-col, ~1,200px→~700px), `PurchaseOrderFormModal` (xl→5xl, header grid→3-col, footer pinned; line-item table + notes stay), `AccountFormModal` (footer pinned; conditional grids kept). Line-item document bodies (Invoice/Quote/PO items) are legitimately long — the goal is that fixed fields fit and actions never scroll, both now met. **Deferred (own pass):** the `TabbedFormModal` scaffold + tab-restructuring the ~1,100-line Invoice/Quote forms — their footers already pin (M-P2), so a full tab reorg of live financial-calc forms is high-risk for marginal gain. | Owner directive "zero scrolling wherever reasonably possible" — the two 1,200–1,600px fixed-field forms were the egregious cases; widening + the 4-col Workspace grid + pinned footers address them without the risk of restructuring the app's most complex forms. |
| 2026-07-02 | **Modal M-P2 — pinned footers + Cancel variant unified.** The 5 forms whose action rows scrolled away with the body (audit M-3: InvoiceFormModal, QuoteFormModal, EmailDocumentModal, SignatureCaptureModal, DocumentDraftReview) now pin their footers — the two `Modal`-based ones via the new `footer` slot (submit reaches the form via the HTML `form=` attribute), the two `Dialog`-direct ones via the three-region flex-column layout, and Email's footer is conditional on `!success`. Cancel/Close/Done normalized to `variant="secondary"` app-wide (23 ghost/outline footer buttons flipped + `ConfirmDialog`), matching the `DeviceFormModal` reference and the pre-existing majority (69). Invoice/Quote nested catalog pickers lost a leftover hand-rolled X (M-1 miss) and gained a "Done" footer; Quote submit dropped an inline `backgroundColor` for `variant="success"`. | Footers-inside-scroll was the audit's #1 usability defect on the long forms; the `form=` attribute keeps native submit/Enter working with the button outside the `<form>`. Cancel=secondary is one uniform rule (the audit found a ~even ghost/secondary split); chose secondary as the lower-churn, reference-aligned, clearer-affordance option. |
| 2026-07-02 | **Modal foundation (M-P1) — X pattern removed, footer slot shipped, ConfirmDialog repaired.** Per owner directive (modal audit `docs/modal-audit-2026-07-02.md`): the top-right X close was removed platform-wide — `Modal` no longer renders it (prop `showCloseButton` deleted), `ConfirmDialog`/`DeviceFormModal`/`AnnouncementFormModal`/`MFAEnrollment`/`MobileNavDrawer`/`CasePeekPanel` hand-rolled X's deleted, `PhotoViewerModal` + `EmailDocumentModal` preview get a "Close" text pill. Dismissal standard: **footer buttons + ESC + backdrop; every modal must carry an explicit footer close/cancel** — the X-only View modals (ExpenseDetail, PaymentReceipt, PortalCases/Quotes detail, InventoryDetail, ManageCompanies, DeviceDetails) gained ghost-Close footers via the **new `Modal` `footer` slot** (pinned `shrink-0 border-t px-4 py-3`). `Button` gained `warning`/`info` variants; `ConfirmDialog`'s confirm action moved from a raw 16px button onto `Button` (fixes the P2b-era size mismatch beside its ghost Cancel). PaymentReceiptModal's dead `headerAction` (empty title never rendered the header) fixed with a real title. | The audit found the X centralized (~110 default renders, 1 suppressor, 7 hand-rolled in 3 visual specs) and ~10 View modals with no other dismissal — the ordered removal (footers first, then the X) keeps every surface dismissible; SearchableSelect's in-control clear-× is a separate pattern, deliberately untouched pending an owner call. |
| 2026-07-02 | **Typography standardization program executed end-to-end (P1–P5), same day the standard was codified.** Final state: gray palette 477→0 (30 files); dead Inter aliases removed + `font-mono`/`text-nav` tokenized; ui/ primitives converged (universal `FormField` error/hint spec, one th tracking, Button md=14px with preserved control heights); F-4 unsized identity cells fixed across all list tables; ONE table-header spec app-wide; uppercase-tracking fork 285/104→`tracking-wider` only; money = `font-semibold tabular-nums` (totals bold+tabular); 24 pages migrated onto the standard header system (19 → top-bar `PageHeaderSlot` incl. the full Banking migration; platform-admin 5 → `PageHeader`/`DetailPageHeader`); rogue KPI grids → shared `KpiRow`; arbitrary sizes 93→0 (chrome tokenized as `text-nav`/`text-xxs`); **both lint rules enforced with no baseline**. **Portal = Option A** (owner): keeps its larger customer-facing ramp, documented above; its table headers/labels aligned to shared specs. Known small leftovers (tracked, not hidden): `TemplateTypeDetail` uses a size-aligned h1 rather than `DetailPageHeader`; hand-rolled empty-state/pagination markup remains in a few pages (class-conformant, component adoption optional). | One program, one operating model (sweep → lint `error` → ratchet → delete baseline), copying the raw-color burndown. Verification at every phase: tsc 0, suite 2,250 passing (typst PDF test is load-flaky, passes isolated), lint delta = 0 new problems. Full before/after inventory: `docs/typography-audit-2026-07-02.md` (incl. program-outcome addendum). |
| 2026-07-02 | **Typography role standard codified** (Typography section rewritten with the locked role table): page titles per surface, headings, modal titles, table th/td, **Button md = 14px**, badges, labels/hints/errors (`FormField` spec universal), uppercase micro-labels on `tracking-wider`, KPI two-style rule, money = `font-semibold tabular-nums`, mono policy (character-verified strings only), 12px content floor, slate-only neutrals with shade roles. Banned: `text-[Npx]`, all `*-gray-*` utilities, arbitrary `tracking-[…]` (OTP `0.5em` exception) — enforced by `xsuite/no-gray-palette` (no baseline) + `xsuite/no-arbitrary-typography` (per-file ratchet baseline). §Forms section-header tracking harmonized `wide`→`wider`. | The 2026-07-02 typography audit (`docs/typography-audit-2026-07-02.md`) found role-level spec absence as the root cause of 5 page-title specs, 7 table-header specs, a 30-file gray fork, 93 arbitrary sizes, and error/hint splits inside `ui/` itself. Standard values were chosen to match the codebase **majority** (minimum visual churn); deviations burn down via the phased standardization program (P1 mechanical sweeps → P2 primitive convergence → P3 high-traffic tables → P4 structural header/KPI migrations → P5 chrome tokenization + portal), copying the proven raw-color-burndown operating model (sweep → lint `error` → ratchet). |
