# Midnight Aurora Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th premium dark tenant theme ("Midnight Aurora", DB value `midnight`) that carries the new login page's navy/electric-blue/violet design language app-wide, and harden the token architecture so the *neutral layer* re-themes centrally.

**Architecture:** The three existing themes swap only 6 brand CSS variables; surfaces/borders/neutrals are constant, and ~7,000 call-sites use raw `white`/`slate-*` utilities. Rather than rewriting call-sites, the neutral utilities themselves become var-backed via per-utility Tailwind palette overrides (`backgroundColor.white` → `var(--nb-card)`, `textColor.slate.900` → `var(--nt-900)`, …). Light themes bind the vars to today's exact Tailwind values (pixel-identical, zero churn); `:root[data-theme="midnight"]` rebinds the ramp to a navy scale. Dual-use utilities (dark ink on saturated KPI tiles) migrate to a new constant `ink-dark` token. Chart *chrome* (axis/grid/tooltip) re-skins via scoped CSS under `[data-theme="midnight"]` (SVG presentation attributes lose to any CSS rule); chart *data hues* stay fixed per DESIGN.md. Printing forces light values via `@media print`.

**Tech Stack:** Tailwind CSS v3.4 per-utility theme keys, CSS custom properties (RGB triplets for `<alpha-value>`), React context (existing ThemeContext), Postgres CHECK-constraint migration.

**Why each existing theme keeps working untouched:** every var introduced defaults (in `:root`) to the exact hex Tailwind v3.4 ships for that shade — e.g. `--nt-900: 15 23 42` = `slate-900 #0f172a`. Only the `midnight` block rebinds them.

---

## Frozen palette (all 37 WCAG pairs validated — see contrast matrix in PR)

| Role | Hex | RGB triplet | Notes |
|---|---|---|---|
| primary | `#2E6BE8` | 46 107 232 | electric blue; white fg 4.79:1 ✓ |
| primary-foreground | `#FFFFFF` | 255 255 255 | |
| secondary | `#6D4AE3` | 109 74 227 | aurora violet; white fg 5.62:1 ✓; NOT a banned hex |
| secondary-foreground | `#FFFFFF` | 255 255 255 | |
| accent (dark violet SURFACE) | `#221D47` | 34 29 71 | contract: pair with accent-foreground |
| accent-foreground | `#C9C2F8` | 201 194 248 | 9.41:1 on accent ✓ |
| surface / `--nb-card` (bg-white) | `#111B32` | 17 27 50 | card navy |
| surface-muted / `--nb-page` (bg-slate-50) | `#0A111F` | 10 17 31 | page navy |
| `--nb-raised` (bg-slate-100) | `#16223C` | 22 34 60 | hover fills |
| `--nb-strong` (bg-slate-200) | `#1F2D4E` | 31 45 78 | |
| `--nb-inset` (bg-slate-300) | `#2A3A60` | 42 58 96 | tracks/skeletons |
| `--nb-dim` (bg-slate-700) | `#2D3C5E` | 45 60 94 | dark chips |
| `--nb-dark` (bg-slate-800) | `#0D1526` | 13 21 38 | |
| `--nb-deep` (bg-slate-900) | `#040812` | 4 8 18 | tooltips/scrims |
| `--nt-900..300` (text) | `#EDF2FA/#E2E9F6/#C9D4E8/#A6B5D2/#8496B6/#617195/#7A8AA8` | see index.css | inverted ink ramp |
| `--ne-soft/base/strong` + border | `#17233E/#213052/#2D3E64` | 23 35 62 / 33 48 82 / 45 62 100 | borders |
| status success/warning/danger/info | `#0DA271/#E28C0B/#E24E44/#1E9BD7` | | midnight-tuned bases |
| status muteds | `#09291F/#3D2B0A/#2F0C0F/#082939` | | text-on-muted ≥4.5 ✓ |
| cat-7 / cat-8 (midnight only) | `#5E86E8/#93A5C1` | 94 134 232 / 147 165 193 | the two dark identity hues re-anchored |
| NEW constant token `ink-dark` | `#0F172A` | 15 23 42 | dark ink on saturated fills; never themes |

Banned values verified absent: `#3B82F6`, `#6366F1`, `#8B5CF6`, `#A855F7`, `#1E5BB8`, `#4A5568`, `#6A7A8A`; triplets `59 130 246`, `99 102 241` (scripts/check-tokens.sh).

---

### Task 1: index.css — midnight block + neutral ramp vars + chart/print/scrollbar CSS

**Files:** Modify: `src/index.css`

- [ ] Add neutral-ramp defaults to the constant `:root` block (light values = exact Tailwind slate hexes), plus `--color-ink-dark: 15 23 42`, `--scrollbar-thumb: 203 213 225`, `--scrollbar-thumb-hover: 148 163 184`.
- [ ] Add `:root[data-theme="midnight"]` block overriding brand tokens, surface/border tokens, status bases+muteds, `--color-cat-7/8`, the full `--nb-*/--nt-*/--ne-*` ramp, scrollbar vars, and `color-scheme: dark`.
- [ ] Point the existing scrollbar rules at the vars.
- [ ] Add `@layer base` rule scoping `--tw-ring-offset-color` to the card surface under midnight.
- [ ] Add `[data-theme="midnight"]`-scoped `.recharts-*` chrome overrides (axis text fill, grid stroke, default-tooltip bg/border, legend text).
- [ ] Add `@media print` block restoring every midnight-overridden var to its light default.

### Task 2: tailwind.config.js — per-utility neutral remap

**Files:** Modify: `tailwind.config.js`

- [ ] Define `nv = (v) => 'rgb(var(' + v + ') / <alpha-value>)'` and a literal SLATE scale const.
- [ ] `theme.extend.backgroundColor`: `white: nv('--nb-card')`, full slate scale with 50/100/200/300/700/800/900 var-backed, rest literal.
- [ ] `theme.extend.textColor`: full slate scale with 300/400/500/600/700/800/900 var-backed, 50/100/200 literal.
- [ ] `theme.extend.borderColor` (+`ringColor`, `gradientColorStops`, `placeholderColor` subsets): slate 100/200/300 var-backed (+ `white`/`slate-50` gradient stops).
- [ ] `theme.extend.colors['ink-dark']: nv('--color-ink-dark')`.
- [ ] Verify `divide-slate-*` inherits from borderColor (Tailwind v3 default) in the built CSS.

### Task 3: types + main.tsx + AppearanceSettings

**Files:** Modify: `src/types/tenantConfig.ts`, `src/main.tsx`, `src/pages/settings/AppearanceSettings.tsx`

- [ ] `Theme` union + `THEMES` gain `'midnight'`.
- [ ] `main.tsx` anti-flash whitelist derives from `THEMES` (imports the const — no hardcoded list to drift).
- [ ] `THEME_OPTIONS` gains Midnight Aurora (flagship copy, dark preview card variant, swatches `#2E6BE8/#6D4AE3/#221D47`).

### Task 4: ink-on-color + audit-confirmed fixes

**Files:** Modify: `src/components/shared/GradientStatCard.tsx`, `src/components/ui/Tabs.tsx`, plus every confirmed blocker/major from the `midnight-theme-audit` workflow register (attached to PR).

- [ ] Swap `text-slate-900`/`bg-slate-900/NN`-as-ink-on-gradient for `ink-dark` variants in GradientStatCard tones and Tabs pill active ink.
- [ ] Apply each confirmed audit fix; re-run auditor greps to prove zero remaining sites.

### Task 5: docs + migration

**Files:** Modify: `DESIGN.md`, `CLAUDE.md`. Create: `docs/migrations-pending/2026-07-05-add-midnight-theme.sql`

- [ ] DESIGN.md: theme table column, Neutral Ramp section, `ink-dark`, chart-chrome scoped exception, print guard, status/cat midnight notes, Decisions Log entry.
- [ ] CLAUDE.md: theme enumerations, v1.5.0 history entry, adding-a-fifth-theme steps.
- [ ] Migration SQL (CHECK constraint swap) + apply instructions (`mcp__supabase__apply_migration`, project_id ssmbegiyjivrcwgcqutu) — Supabase MCP is unauthenticated in this session, so the SQL ships as a pending artifact, NOT written to supabase/migrations/.

### Task 6: verification

- [ ] `bash scripts/check-tsc.sh` (modulo pre-existing baseUrl deprecation), `npm run lint`, `npm run test`, `bash scripts/check-tokens.sh`, `npx vite build`.
- [ ] Built-CSS assertions: `.bg-white` resolves to `var(--nb-card)`; `.text-slate-900` to `var(--nt-900)`; `.divide-slate-200` var-backed.
- [ ] Visual harness: render the component sampler under all 4 themes via headless Chromium; confirm light themes pixel-stable vs pre-change captures and midnight legible.
- [ ] Adversarial review workflow over the full diff; fix confirmed findings; push to PR #377.
