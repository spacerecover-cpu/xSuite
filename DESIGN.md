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

## Product Context
- **What this is:** ERP/CRM-grade SaaS for data recovery / forensic labs — cases, devices, chain of custody, finance, inventory, HR.
- **Who it's for:** Lab staff (technicians, managers, accounts, HR), tenant owners/admins, platform admins, and customers via the portal.
- **Space/industry:** Data recovery & digital forensics. Trust, auditability, and legal defensibility are first-class. **Not** a generic CRM.
- **Project type:** Dense, data-heavy web application (React 18 + TypeScript + Vite + Tailwind CSS v3.4) with a customer portal and programmatic PDF documents.
- **The one thing to remember:** Serious, trustworthy lab software — calm, dense, and credible, never flashy.

## Aesthetic Direction
- **Direction:** Industrial / utilitarian, refined. Function-first and data-dense, with a restrained brand accent.
- **Decoration level:** Minimal-to-intentional. Typography and a tight token palette do the work; no decorative gradients, blobs, or texture.
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
| `primary` | `#162660` (22 38 96) | `#6C131F` (108 19 31) | `#280B08` (40 11 8) |
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
| `ring` (focus) | `#6366F1` | 99 102 241 |

### Status (constant across themes — meaning is fixed, never theme it)
| Role | Base | Foreground | Muted (bg) |
|---|---|---|---|
| `success` | `#059669` | `#FFFFFF` | `#D1FAE5` |
| `warning` | `#D97706` | `#FFFFFF` | `#FEF3C7` |
| `danger` | `#DC2626` | `#FFFFFF` | `#FEE2E2` |
| `info` | `#0284C7` | `#FFFFFF` | `#E0F2FE` |

### Banned in `src/` (enforced by `eslint-rules`)
- `purple-*`, `indigo-*`, `violet-*` (any shade) → use `accent` or `secondary`.
- Brand hex literals: `#1E5BB8`, `#8b5cf6`, `#6366f1`, `#a855f7`, `#4A5568`, `#6A7A8A`.
- Raw Tailwind brand colors (`bg-blue-600`, `text-purple-*`, etc.). Neutrals (`gray/slate/zinc/white/black`) remain allowed for utility use.

## Non-Themed Surfaces (intentionally fixed — do NOT wire to the theme)
These read from constants, never from CSS variables. This is by design so output stays comparable across tenants/themes.

- **Charts:** `src/lib/chartTheme.ts` — `chartCategorical` (8 hues), `chartAxis` `#64748b`, `chartGrid`/`chartTooltipBorder` `#e2e8f0`. Data-vis neutral; never theme charts.
- **PDFs:** `src/lib/pdf/styles.ts` — `PDF_COLORS` (primary `#0891B2`, text `#1E293B`, …), font `Roboto`. Device-role badge colors (patient/backup/donor/spare) are fixed.
- **Device icons:** `src/lib/deviceIconMapper.ts` — fixed SVG hexes. Intentional.

## Spacing
- **Base unit:** Tailwind default 4px scale (`p-1`=4px … `p-6`=24px …). Density target: **comfortable-to-compact** for data tables.
- **Custom step:** `spacing['4.5']` = `1.125rem` (18px) — the only sanctioned off-scale value (`tailwind.config.js`). Do not add more without updating this doc.

## Layout
- **Approach:** Grid-disciplined app shell (`AppLayout`, `Sidebar`) with predictable alignment; portal and auth may be lighter but use the same tokens.
- **Sidebar:** per-user left/right position preference (`user_sidebar_preferences`). Both positions must stay visually balanced.
- **Border radius:** Tailwind default scale. No global bubble-radius; match surrounding components.

## Motion
`tailwind.config.js` `animation` / `keyframes`. Keep motion functional and short.

- `animate-fade-in` / `animate-slide-in` — 0.2s `ease-out`. Default for entrances and panel reveals.
- `animate-float` (6s) / `animate-pulse-glow` (3s) — ambient only; use sparingly, never on data-bearing UI.
- **Easing/duration default:** prefer Tailwind `transition` + `duration-150`/`duration-200`, `ease-out` for enter. Avoid long (>400ms) animations in the app shell.

## Known Deviations (drift register — fix toward the standard, do not propagate)
Captured 2026-06-01 from a code audit. These contradict the rules above and should be corrected; until then they are documented so reviews don't treat them as precedent.

| # | Where | Issue | Target fix |
|---|---|---|---|
| 1 | `tailwind.config.js:42-43` | `glow-blue` / `glow-blue-lg` hardcode `rgba(59,130,246,…)` (blue-500) — a banned literal in config | Derive from a semantic token or remove if unused |
| 2 | `src/index.css:37` | `--color-ring: 99 102 241` = `#6366F1` (indigo-500), the exact banned indigo; all focus rings render off-brand | Re-point `ring` to `primary` (or a sanctioned neutral) per theme |
| 3 | `src/lib/pdf/styles.ts:4` | PDF `primary` `#0891B2` (cyan) matches none of the three brand primaries; printed docs look unrelated to the brand | Decide a fixed neutral brand color for PDFs and document it as intentional, or align to a brand value |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-01 | Initial DESIGN.md created by codifying the live system (not proposing a new one) | xSuite has a locked theme/token system; goal is consistency, so the doc documents and enforces what exists. Source: `src/index.css`, `tailwind.config.js`, `src/lib/chartTheme.ts`, `src/lib/pdf/styles.ts`, `index.html`. |
| 2026-06-01 | Logged 3 known deviations rather than silently "documenting them away" | A consistency contract must reflect reality; drift is tracked for fixing, not normalized. |
