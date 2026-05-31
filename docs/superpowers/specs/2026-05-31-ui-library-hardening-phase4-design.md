# i18n Activation + RTL — Phase 4 Design

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Program:** Phase 4 of the 5-phase hardening (**Phase 4 = i18n activation + RTL**). Builds on **Phase 3** (display/data primitives now route copy through `t()`; the full `ui.*` key set ships in both `en` and `ar` with correct CLDR plural variants — `src/lib/i18n.ts`), and on **Phase 0** (jsdom test harness, shared primitives). The i18n **dictionary** is done; the **switch** has never been thrown.
- **Evidence:** a 6-agent parallel discovery sweep (firsthand reads of `src/lib/i18n.ts`, `ThemeContext.tsx`, `main.tsx`, `tenantConfigService.ts`, `format.ts`, `documentTranslations.ts`, plus ripgrep blast-radius counts across `src/**/*.{ts,tsx}`). Line numbers and occurrence counts below are from those reads.

---

## 0. Sign-off (LOCKED 2026-05-31)

User chose **"4a plumbing, no switcher"** + **per-tenant override as the eventual architecture**. Locked scope for THIS PR:

- **Phase 4a = plumbing, NO user-facing switcher.** Ship: shared `isRTLLanguage` (centralized), locale-aware `format.ts` (gated on `ar`, `en` byte-identical), `LocaleContext`/`LocaleProvider`, un-pin `i18n.ts` `lng` + delete the static `dir`/`lang` write + `main.tsx` anti-flash, mount the provider, the CI en/ar **parity+plural guard**, a **conservative custom eslint rule** (`eslint-rules/no-untranslated-jsx-text.js`, severity `warn` — no new npm package; mirrors the existing custom-rule pattern) to stop instrumentation debt growing, and the **`ui/` RTL proof slice** (logical utilities). RTL **text flow** (`dir='rtl'`) lands; layout migration does not.
- **Language = country-derived now; per-tenant override DEFERRED to the switcher PR.** Phase 4a does **NOT** apply a DB migration. Language stays `config.locale.languageCode` (from `geo_countries.language_code`). The `tenants.language` override column + `updateTenantLanguage` service + override-resolution in `tenantConfigService` + the `AppearanceSettings` switcher land **together** in a later PR (a nullable, unwritten column is inert; prod migrations should not precede their writer). `LocaleContext` exposes a `setLocale` setter (unused by UI in 4a) so the override is a purely **additive** future change.
- **Supported UI languages = `en` + `ar` only.** `de`/`fr` countries guard to `en`/LTR via `normalizeLang`.
- **RTL derived from one shared helper** (`isRTLLanguage`, promoted from `documentTranslations.ts`); RTL set = `{'ar'}`.
- **Western numerals + Gregorian dates for `ar`** (no Arabic-Indic digits / Hijri); `format.ts` changes gated on `ar` so `en` is byte-identical.

**Explicitly DEFERRED (separate future programs, NOT this PR):** the `tenants.language` migration + switcher UI; the ~226-file / ~1,500-occurrence physical→logical RTL layout sweep (**4b**); the ~2,000-string app `t()` instrumentation; `de`/`fr` dictionaries; Arabic-Indic digits. (Per §5/§7/§8 — those sections' "switcher" / per-tenant-migration wording is superseded by this block.)

---

## 1. Context & Goal

i18next (`^25.6.1`) + react-i18next (`^16.2.4`) are initialized once in `src/lib/i18n.ts`, imported for side-effects by `src/main.tsx:7` **before** React renders. The init block (`i18n.ts:1053-1062`) **hard-pins `lng: 'en'`** (`:1057`) with `fallbackLng: 'en'`, and immediately **statically writes** `document.documentElement.dir = 'ltr'` / `.lang = 'en'` (`:1064-1065`) once at module load — never updated again anywhere in `src/`. There is **no `changeLanguage` call** in any non-test file, **no RTL handling**, **no language switcher**, and **no locale anti-flash hint**.

Meanwhile the tenant's language already flows into the app: `geo_countries.language_code` → `tenantConfigService.ts:81` → `config.locale.languageCode` → exposed by `useLocaleConfig()` (`TenantConfigContext.tsx:113`). **Zero non-test files consume it.** The data arrives at the React layer and dead-ends. The only reactive reader of `i18n.language` is `AnnouncementBanner.tsx:59` (`isArabic = i18n.language === 'ar'`) — dead in production because the language never leaves `'en'`.

**Goal:** wire tenant locale → `i18n.changeLanguage`, apply `dir`/`lang` to `<html>` reactively with a theme-style anti-flash path, ship a language switcher, make date/number/currency formatting locale-aware, and establish RTL **text flow** app-wide. The full RTL **layout** migration is honestly scoped as a follow-on (§5) because it is the dominant cost.

**The Theme system is the reference pattern.** `ThemeContext` (`src/contexts/ThemeContext.tsx`) reads `config.theme` via `useTenantConfig()`, derives an `effectiveTheme`, and in one `useEffect` (`:44-47`) both `applyThemeToDOM` (`:22-24`, a `dataset.theme` write) and `persistThemeHint` (`:26-32`, a `localStorage 'xsuite_theme_hint'` try/catch write). `main.tsx:12-15` synchronously reads that hint pre-`createRoot` to kill the first-paint flash. CSP forbids inline scripts (`vite.config.ts:33` / `index.html:7` both `script-src 'self'`), so the bundled `main.tsx` module is the **only** pre-render hook. Phase 4 clones this pattern 1:1 for `dir`/`lang`.

---

## 2. Scope

**In (Phase 4a — this PR):**
- **`LocaleContext`/`LocaleProvider`** — a 1:1 clone of `ThemeContext` that reads `config.locale.languageCode`, calls `i18n.changeLanguage`, writes `document.documentElement.dir`/`.lang`, persists a `xsuite_locale_hint`, and exposes an optimistic `setLocale` setter.
- **Un-pin `src/lib/i18n.ts`** — `lng` reads the synchronous hint (fallback `'en'`); **delete the static `dir`/`lang` writes** (`:1064-1065`) so the provider owns all DOM direction state.
- **`main.tsx` locale anti-flash** — a sibling block to the theme hint (`:12-15`): read `xsuite_locale_hint`, set `dir`/`lang` before `createRoot`.
- **Language switcher UI** in `AppearanceSettings.tsx` (alongside the theme picker, admin-gated, mirroring the theme card pattern).
- **Locale-aware formatting** — thread `config.locale.localeCode` through `src/lib/format.ts` (`formatCurrency`/`formatNumber`/`formatDate`), replacing hardcoded `'en-US'`; import the date-fns `ar` locale.
- **RTL text flow** — `dir='rtl'` on `<html>` gives correct inline reading order app-wide for free (browsers honor it for text), even before any CSS migration.
- **The `src/components/ui/` RTL proof slice** — convert the **<40** physical-direction occurrences in the 24-file `ui/` library to logical utilities (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`) as the low-risk demonstration that Tailwind v3.4 emits them and the build is green.
- **CI parity guard** — a test in `i18n.test.tsx` asserting `en`↔`ar` leaf-key parity + plural-set completeness, locking the good dictionary state.

**Out (Phase 4b and beyond — separate, sequenced):**
- **The full physical→logical CSS sweep** across the remaining ~222 `.tsx` files (~1,500 physical-direction occurrences + ~140 directional-icon sites). Domain-chunked follow-on (§5).
- **`de`/`fr` UI dictionaries** — not translated; guarded to `en`.
- **Arabic-Indic digits** — product-deferred (§6).
- **Full app string instrumentation** — only ~6% of the component tree (19/304 files) calls `t()` today; routing the ~2,000 remaining hardcoded strings through `t()` is a multi-thousand-string content project, **not a phase** (§7).
- **A `LanguageDetector` package** — detection stays app-driven from tenant config + localStorage hint (single source of truth, no new dependency).
- **Edge-function / SQL language denormalization** (`tenants.language_code` for backend consumers) — only if backend needs it later.

**Guardrails:** additive-only public APIs; **`tsc=0`**; all **6 CI gates** green; **no new npm packages** (the date-fns `ar` locale is already installed; `tailwindcss-rtl`/logical-property plugins are **ruled out** — Tailwind v3.4 ships logical utilities + `rtl:`/`ltr:` variants natively with `plugins: []`); **Tailwind v3.4 only** (no v4 upgrade); **mirror the theme anti-flash pattern** (CSP-safe module script, no inline `<script>`); behavior-preserving for `en` tenants by default — anything that changes `en` runtime output is enumerated in §8.

---

## 3. Architecture overview (four matching pieces, cloned from Theme)

| Layer | Theme (reference) | Locale (Phase 4) |
|---|---|---|
| **DOM write (effect)** | `applyThemeToDOM` → `dataset.theme` (`ThemeContext.tsx:22-24`) | `applyLocaleToDOM` → `i18n.changeLanguage(lang)` + `documentElement.dir`/`.lang` |
| **Anti-flash hint** | `persistThemeHint('xsuite_theme_hint')` (`:26-32`) | `persistLocaleHint('xsuite_locale_hint')` (try/catch, identical shape) |
| **Pre-render read** | `main.tsx:12-15` reads hint, sets `dataset.theme` | `main.tsx` sibling block reads hint, sets `dir`/`lang` |
| **Source of truth** | `config.theme` via `useTenantConfig()` (`:35-36`) | `config.locale.languageCode` via `useTenantConfig()` |
| **Setter** | `setTheme` → `updateTenantTheme` + `refreshConfig` (`:49-71`) | `setLocale` → (optional `tenants.language` write) + `refreshConfig` |
| **Picker UI** | `AppearanceSettings.tsx` theme cards | `AppearanceSettings.tsx` language cards (sibling) |

Provider mount: `LocaleProvider` slots as a **sibling of `ThemeProvider`, inside `TenantConfigProvider`** (`App.tsx:179-182`: `AuthProvider > TenantConfigProvider > ThemeProvider > PermissionsProvider`). It **must** nest inside `TenantConfigProvider` or it reads `DEFAULT_TENANT_CONFIG` (`'en'`) forever. The portal tenant path (`TenantConfigContext.tsx:27-47`, fed by `PortalAuthContext`) is covered automatically, exactly as theme is.

---

## 4. Locale wiring (the activation machinery)

### §4.1 LocaleContext / LocaleProvider (new file `src/contexts/LocaleContext.tsx`, ~90 LOC)

Clone `ThemeContext.tsx` structurally:

```ts
const LOCALE_HINT_KEY = 'xsuite_locale_hint';

function applyLocaleToDOM(lang: 'en' | 'ar'): void {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTLLanguage(lang) ? 'rtl' : 'ltr';
}

function persistLocaleHint(lang: 'en' | 'ar'): void {
  try { localStorage.setItem(LOCALE_HINT_KEY, lang); } catch { /* anti-flash only */ }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { config, refreshConfig } = useTenantConfig();
  const tenantLang = normalizeLang(config.locale.languageCode); // 'ar' | 'en' (guard de/fr → 'en')
  const [optimisticLang, setOptimisticLang] = useState<'en' | 'ar' | null>(null);
  const effectiveLang = optimisticLang ?? tenantLang;

  useEffect(() => {
    applyLocaleToDOM(effectiveLang);
    persistLocaleHint(effectiveLang);
  }, [effectiveLang]);
  // setLocale mirrors setTheme: optimistic → service write (if persisted) → refreshConfig
}
```

- **`normalizeLang`**: `lang === 'ar' ? 'ar' : 'en'` — anything not in the shipped dictionary set falls to `'en'` (and thus LTR). This makes `de`/`fr` tenants safe.
- **`isRTLLanguage`** is the single shared helper (§4.3).
- The effect is **idempotent** under StrictMode's double-invoke (`main.tsx:34`) — `changeLanguage('ar')` twice is a no-op the second time; no flicker.
- `setLocale` exists for the switcher; for **localStorage-only** persistence it just sets optimistic + persists the hint (no service call). For **per-tenant** persistence it calls a new `updateTenantLanguage(tenantId, lang)` service (mirror `tenantThemeService.ts`) then `refreshConfig()`, **invalidating the 5-min config cache** (`invalidateTenantConfigCache` already exists) or the switch no-ops for up to 5 minutes.

### §4.2 Source of truth for tenant language

The chain is `tenants.country_id` → `geo_countries.language_code` (text NOT NULL DEFAULT `'en'`). There is **no `tenants.language_code` column** — the `sync_tenant_config_from_country()` trigger denormalizes currency/tax/locale_code/timezone/date_format but **deliberately not** `language_code`. So language is read live via the FK join in `tenantConfigService.ts:9-86`.

**v1 recommendation: keep language per-tenant, country-derived (zero migration).** It matches the theme/currency/tax propagation model exactly. The switcher then has two persistence options (§8 #2):
- **(A) localStorage-only** — `setLocale` writes only `xsuite_locale_hint` + `changeLanguage`. Device-local, no DB, no migration. The country-derived default still drives first load on a new device.
- **(B) per-tenant override** — new `tenants.language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar'))` migration (mirroring the `theme` column), surfaced into `config.locale.languageCode` (override takes precedence over country-derived), written by `updateTenantLanguage`. Survives across devices, tenant-wide, admin-gated. **Requires the migration PR template + regenerated `database.types.ts`** or schema-drift CI fails.

A third option — **per-user** via the existing unused `user_preferences.language` column (no migration) — is available if product wants per-user (not tenant-wide) language. This changes the `LocaleContext` API (override read from user prefs, not tenant config). **This is the foundational sign-off call (§8 #2).**

### §4.3 dir/lang + RTL derivation

- **Delete `i18n.ts:1064-1065`** (the static `dir='ltr'`/`lang='en'`). The provider owns all runtime `dir`/`lang` writes. **This and the `main.tsx` anti-flash block MUST land in the same commit** — removing the static write without the pre-render block makes Arabic returning visitors flash LTR.
- **`lng` in `i18n.ts:1057`**: change to read the synchronous hint, e.g. `lng: (typeof localStorage !== 'undefined' && localStorage.getItem('xsuite_locale_hint') === 'ar') ? 'ar' : 'en'` (fallback `'en'`). This makes the **very first React render** correct for Arabic tenants. Keep `fallbackLng: 'en'`.
- **`isRTLLanguage`** — promote/centralize the existing `documentTranslations.ts:1420` helper (`SUPPORTED_LANGUAGES`, `'ar'` is the only `isRTL:true`) into a shared location both the **UI** (`LocaleContext`, `main.tsx`) and **PDF** path consume. **One derivation, no drift.** `geo_countries` has no `is_rtl` column, so RTL is always derived from `language_code`; v1 RTL set = `{'ar'}`.

### §4.4 Anti-flash ordering (the single most likely bug)

`main.tsx:7` `import './lib/i18n'` runs the i18n init side-effects **during that import**, which currently includes the static `dir`/`lang` write at `:1064-1065`. Any anti-flash block placed at `main.tsx:12-15` runs **after** that import. **Resolution:** delete `:1064-1065` entirely (chosen approach), so nothing stomps the hint; the `main.tsx` block then sets `dir`/`lang` from the hint, and `i18n`'s `lng` is already hint-correct. The `main.tsx` locale block:

```ts
const localeHint = localStorage.getItem('xsuite_locale_hint');
if (localeHint === 'ar') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}
// first-timers / 'en' fall through to index.html's <html lang="en"> default (LTR)
```

`index.html:2` is `<html lang="en">` with no `dir` — acceptable; the module script patches it pre-paint, same as theme.

---

## 5. RTL strategy (the honest cost)

**The wiring is tiny (~6 files). The RTL CSS migration is the dominant cost and must be scoped honestly.**

### Quantified blast radius (ripgrep across `src/**/*.{ts,tsx}`)

- **226 of ~343 `.tsx` files (~66%)** touch at least one physical-direction utility OR a directional icon.
- **~1,500 physical-direction class occurrences**, broken down: `ml-`=119, `mr-`=359 (357 are `mr-1`/`mr-2` icon gaps → mechanical `me-` swap), `pl-`=73, `pr-`=69, `left-`(pos)=80, `right-`(pos)=39, `text-left`=376, `text-right`=294, `space-x-`=29, `divide-x`=2, `border-l`=28, `border-r`=4, `translate-x`=21, `rounded-l/r` directional=6 (real).
- **~140 directional lucide-icon occurrences across 55 files** (`ChevronLeft`/`Right`, `ArrowLeft`/`Right`) — semantic back/next/expand glyphs that point the wrong way under RTL.
- **Logical/RTL-safe utilities already in use: ~29 across 14 files (<2%).** The codebase cannot be flipped by toggling `dir` alone — it is a real layout migration, not a flag flip.
- **Mitigating facts:** ~1,978 plain `gap-`/`gap-x-` flex layouts are **already RTL-safe** (flex gap is bidi-neutral); 357/359 `mr-` are trivial icon-gap swaps; the debt concentrates in **margin-based spacing, `text-align`, and absolute positioning**.
- **`tailwind.config.js:71` has `plugins: []`** — no RTL plugin. The `slideIn` keyframe (`:53`, `translateX(-10px)`) and `NotificationBell.tsx` `origin-top-right` are direction-locked.
- **9 content-locked `dir='rtl'` attributes across 7 files** (`AnnouncementCard.tsx:112`, `AnnouncementFormModal.tsx:194/219`, etc.) are **correct-as-is** (always-Arabic content fields) and **must be excluded from any blanket codemod**.

### Strategy options (and the call)

| Option | Mechanism | Verdict |
|---|---|---|
| **A — RTL plugin** (`tailwindcss-rtl`/logical) | auto-flips physical utilities | **Ruled out** — violates no-new-packages + Tailwind-v3.4-only; **unnecessary** (v3.4 ships logical utilities natively). |
| **B — physical→logical migration** (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`) | hand/codemod class rewrite | **Primary mechanism** for 4b. ~1,500 sites, selective by impact. |
| **C — scoped `rtl:` variants** | `rtl:rotate-180`, `rtl:-scale-x-100`, `rtl:origin-top-left` | **Only** for the irreducible: transforms, `transform-origin`, directional icons, animations. |
| **D — dir-only (text flow)** | set `dir='rtl'`, do nothing else | The **4a floor** — correct reading order for all inline text immediately. |

### Phased plan (recommended)

- **4a (this PR — ship):** the wiring + switcher + formatting + `dir='rtl'` text flow + the `ui/` proof slice (**<40 occurrences**, the 24-file library). This alone gives correct **RTL text flow and reading order app-wide** and a fully-Arabic, fully-RTL `ui/` primitive layer. Honest framing: **layout** outside `ui/` will still be LTR-biased (margins/positioning on the wrong side), but **nothing breaks** — English-text pages flowing in an RTL container is the visible artifact, not a functional regression.
- **4b (separate, domain-chunked):** strategy B as primary, applied **selectively by impact**, per-domain subagent slices mirroring the existing program pattern (cases, financial, inventory, suppliers, hr, payroll, …):
  1. auto-migrate the safe high-volume bucket: `mr-1`/`mr-2`/`ml-*` icon gaps → `me-`/`ms-` (~480 occ, near-zero risk).
  2. `text-left`/`text-right` → `text-start`/`text-end` (670 occ) **with hand-review of numeric/currency columns** (finance tables often intentionally right-align money regardless of script — a blanket flip left-aligns money in RTL).
  3. hand-fix ~120 absolute `left-`/`right-` anchors + 32 `border-l`/`r` accent stripes (eyeballs, not regex).
  4. directional icons (55 files) via `rtl:rotate-180`/`rtl:-scale-x-100` on a **curated flip list** (blind `scaleX(-1)` on all icons wrongly flips non-directional glyphs).
  5. animations: `rtl:` counterparts for the 21 `translate-x`, the `slideIn` keyframe, `NotificationBell` origin.
  - **Exclude the 9 content-locked `dir='rtl'` attributes** from any codemod.

**Cost honesty:** 4b is ~226 files / ~1,640 edit sites — it **dwarfs Phases 0-3 combined**. Bundling it into Phase 4 would balloon the phase and risk `tsc`/lint regressions across the tree. The 4a/4b split is what keeps Phase 4 shippable. **This split is the single biggest scope decision (§8 #1).**

---

## 6. Language switcher UI + locale-aware formatting

### Switcher

- **Placement:** `src/pages/settings/AppearanceSettings.tsx`, as a sibling card group to the theme picker (rename surface "Appearance & Language"). Admin-gated, tenant-wide — mirrors the theme precedent. Two cards (English / العربية) calling `setLocale`, the active card bordered `border-primary` (matches the theme picker's reactive-active styling). **Recommended over a top-bar dropdown** for consistency with theme.
- Per-user/header-dropdown placement is the alternative if §8 #2 lands per-user.

### Locale-aware formatting (`src/lib/format.ts`)

`changeLanguage('ar')` alone does **not** localize numbers/dates — `format.ts` hardcodes `'en-US'`. Thread `config.locale.localeCode`:

- **`formatDate`** (`:121-128`) — pass the date-fns `ar` locale (already installed, never imported) when language is `ar`; keep Gregorian (no Hijri) for v1.
- **`formatNumber`** (`Intl.NumberFormat`, `:135`) and **`formatCurrency`** (`:98`) — replace literal `'en-US'` with `localeCode`. **Gate any change on `ar`** so `en` output is byte-identical (40 files consume `formatCurrencyWithConfig` via `useCurrency.ts:16`/`useAccountingLocale.ts`).
- **`formatCurrencyWithConfig`** hand-builds strings (never Arabic-Indic, never bidi-correct). A locale-aware rewrite is **gated on `ar`** and decides Arabic-Indic digits — **recommend Western numerals** (Gulf-ERP norm) so v1 changes only the locale tag, not the digit set.
- **22 hardcoded `en-US`/`en-GB` literals across 16 files** and **103 raw `toLocaleString`/`Intl` sites across 56 files** — each is independent; **no blanket sweep** (platform-admin stays English-only). Fix the **central funnel** (`format.ts` + `useCurrency` + `useAccountingLocale`) in 4a; treat the long-tail raw sites as backlog.

---

## 7. ar dictionary — coverage gaps

**Dictionary parity is essentially perfect — this is NOT where the gap is.** `src/lib/i18n.ts` holds one `translation` namespace, `en` (`:5-521`) + `ar` (`:522-1050`): EN = 479 leaf keys, AR = 491 (the 12 extra are legitimate Arabic CLDR plural variants `_zero/_two/_few/_many` for the 3 plural-base keys). Identical 8 sections, zero EN keys missing from AR. When switched to `ar`, every **instrumented** key resolves to real Arabic.

**The real gap is app coverage, not dictionary parity.** Only **19 of 304** non-test component/page files call `useTranslation`; **17 are in `src/components/ui/`** (the Phase 0-3 hardened primitives). `src/pages`: 1/126 (`ReportSectionsPage.tsx`). `src/components` non-ui: 1/154 (`AnnouncementBanner.tsx`). So switching to Arabic yields a **half-Arabic UI**: dialog chrome / form primitives / toasts in Arabic, every page title / label / table header / body string in English. ~1,684 hardcoded JSX strings across 226 files + ~136 placeholders + ~436 label/title attrs (`src/pages` alone) — on the order of **2,000+ strings** each needing a new key in both locales, plus ~15 missing domain sections (cases, customers, financial, inventory, suppliers, hr, payroll, …).

**Fill vs defer:**
- **Fill (in 4a):** nothing new in the dictionary — it's done. **Add a CI parity guard** (§9) so the good state is locked. Optionally time-box string-extraction to the **top ~10 offender pages** (`LeaveManagement.tsx`, `ReportsDashboard.tsx`, `TimesheetManagement.tsx`, `VATAuditPage.tsx`, `SupplierProfilePage.tsx`, …) **only if** the phase has budget — otherwise leave to backlog.
- **Defer:** full app instrumentation (a separate program). **`fallbackLng:'en'` is the saving grace** — missing instrumentation degrades to English, never raw keys, so incremental rollout is safe.

**Two parallel translation systems exist** — i18next (`i18n.ts`) for UI and `documentTranslations.ts` (1433 lines, own `ar` block) for PDFs. They are **independent**; the ~352 `t(` hits in `src/lib/pdf/documents/*.ts` are a local `t` param, **not** i18next. Don't double-count or cross-wire them. Unify only the `isRTLLanguage` derivation (§4.3).

**Honest framing for stakeholders:** "Arabic toggle works" ≠ "app is Arabic." ~94% of the component tree still renders English after the switch, and **RTL layout of English text will look especially broken** (LTR English flowing in an RTL container). The `ui/` demo will look more complete than the product is.

---

## 8. Behavior changes / decisions requiring sign-off

1. **RTL sweep scope — THE big call.** Ship **4a only** (wiring + switcher + formatting + `dir='rtl'` text flow + `ui/` proof slice ≈ 6 core files + <40 `ui/` occurrences), with the ~226-file / ~1,500-occurrence layout migration (**4b**) as a separate domain-chunked program? **Recommended: yes.** Alternative (full RTL parity in Phase 4) dwarfs Phases 0-3 combined.
2. **Language persistence model — foundational, shapes the `LocaleContext` API.** (A) localStorage-only (device-local, zero migration) / (B) per-tenant `tenants.language` column (+ migration + `database.types.ts` regen, tenant-wide, mirrors theme) / (C) per-user `user_preferences.language` (column exists, no migration, per-user). **Recommended: country-derived default + (B) per-tenant override**, matching the theme model — *if* a persisted switcher is wanted; else (A).
3. **Supported UI languages.** `ar`+`en` only, guard `de`/`fr` (geo data has them, dictionary doesn't) → `en`/LTR. **Recommended: yes**, guard via `normalizeLang`.
4. **Number/digit policy for `ar`.** Western numerals + Gregorian dates (locale tag only) vs Arabic-Indic digits / Hijri. **Recommended: Western + Gregorian** (Gulf-ERP convention); gate all `format.ts` changes on `ar` so `en` is byte-identical.
5. **Switcher placement.** Admin-gated tenant-wide card in `AppearanceSettings` (theme precedent) vs per-user header dropdown. **Recommended: AppearanceSettings.** (Couples to #2.)
6. **Delete `i18n.ts:1064-1065` static `dir`/`lang`** — must land **with** the `main.tsx` anti-flash block in the same commit, or Arabic returning visitors flash LTR. (Mechanical, but flagged because the ordering trap is the most likely bug.)
7. **`ui/` logical-utility conversion** changes the `ui/` library's class output (physical→logical) — visually identical in LTR, correct in RTL. Requires a smoke build to confirm Tailwind v3.4 emits the logical classes (the codebase has never used one).
8. **CI parity/plural guard** added to `i18n.test.tsx` in the same PR — locks the en/ar parity; will fail any future PR adding an `en` key without `ar`.

---

## 9. Testing (jsdom harness, co-located `*.test.tsx`)

`npm test` runs both projects. Existing `i18n.test.tsx` (spot-checks ~6 keys) stays green and is extended.

- **LocaleContext (new `LocaleContext.test.tsx`):** mounting with `config.locale.languageCode='ar'` → after effect, `i18n.language==='ar'`, `document.documentElement.dir==='rtl'`, `.lang==='ar'`, and `localStorage 'xsuite_locale_hint'==='ar'`; `'en'` config → `dir==='ltr'`/`lang==='en'`; **`de`/`fr` config guarded → `'en'`/`ltr`** (no crash, no `de` dictionary lookup); `setLocale('ar')` optimistically flips `dir`/`lang` before the (mock) service resolves; StrictMode double-effect is idempotent (no error, single end state). **Move any assertion on `documentElement.dir` out of import-time** — the static write is gone; tests must mount the provider.
- **i18n init:** with `localStorage 'xsuite_locale_hint'='ar'` set **before** import, `i18n.language==='ar'` on first read (hint-driven `lng`); default (no hint) → `'en'`; no static `dir`/`lang` side-effect at import (assert it is NOT set by the module alone).
- **Dictionary parity guard (in `i18n.test.tsx`):** flatten `en` and `ar` key trees; assert **zero `en` keys missing from `ar`**; assert every plural base present in `en` has the full Arabic CLDR set (`_zero/_one/_two/_few/_many/_other`) in `ar`. (Fails on any future desync.)
- **Switcher (`AppearanceSettings`):** renders English + العربية cards; clicking العربية calls `setLocale('ar')`; active card reflects current locale; admin-gating respected.
- **Key components render in `ar`:** mount a representative instrumented component (e.g. a Phase-3 `ui/` primitive + `AnnouncementBanner.tsx` whose `:59` `isArabic` branch now activates) under `changeLanguage('ar')`; assert Arabic accessible names resolve (not raw keys), and `AnnouncementBanner` sets local `dir='rtl'`.
- **Locale-aware formatting (`format.test.ts`):** `formatNumber`/`formatCurrency`/`formatDate` with `localeCode='ar-…'` produce locale-tagged output; with `en-US` output is **byte-identical to current main** (the `en`-gate regression test); date-fns `ar` locale applied for `formatDate` under `ar`.
- **`ui/` logical-utility slice:** for each converted `ui/` component, assert the logical class is present (e.g. `me-2` not `mr-2`) and a `className` override still wins (tailwind-merge, per Phase 3 precedent). Smoke-build confirms emission.
- **Test hygiene:** tests that switch language must `changeLanguage('en')` in teardown (the existing suite does) so plural-rule state doesn't leak between the 184+ tests; verify the new dynamic `lng` doesn't leave state dirty.

---

## 10. Sequencing (ordered tasks — TDD per task)

1. **Shared `isRTLLanguage`** — promote/centralize from `documentTranslations.ts:1420` into a shared module; PDF + UI consume the same helper. Test the `{'ar'}` set + `normalizeLang` guard. No behavior change yet.
2. **`format.ts` locale-aware** — thread `localeCode` into `formatDate`/`formatNumber`/`formatCurrency`, import date-fns `ar`, **gate on `ar`**; regression test pins `en` byte-identical. (Independent of the switch — lands cleanly first.)
3. **`LocaleContext`/`LocaleProvider`** — clone `ThemeContext`; `applyLocaleToDOM` (changeLanguage + dir + lang), `persistLocaleHint`, `effectiveLang`, `setLocale`; tests per §9.
4. **Un-pin `i18n.ts` + `main.tsx` anti-flash (SAME commit)** — `lng` reads hint, **delete `:1064-1065`**; add the `main.tsx` locale block sibling to `:12-15`; move any import-time `dir` test assertion onto the provider.
5. **Mount `LocaleProvider`** in `App.tsx` as a sibling of `ThemeProvider` inside `TenantConfigProvider` (`~:181`).
6. **Persistence (per §8 #2 outcome)** — if per-tenant: `tenants.language` migration via the migration PR template + regen `database.types.ts` + `updateTenantLanguage` service + surface override in `tenantConfigService` (override > country-derived) + cache invalidation; if localStorage-only: skip.
7. **Language switcher** in `AppearanceSettings.tsx` — language cards mirroring the theme picker, wired to `setLocale`; tests.
8. **CI parity/plural guard** in `i18n.test.tsx`.
9. **`ui/` RTL proof slice** — convert the <40 physical-direction occurrences in the 24-file `ui/` library to logical utilities; per-component logical-class + override-wins tests; **smoke build** confirming Tailwind v3.4 emits them.
10. **Full verification:** `npm test` both projects, `npm run typecheck` (=0), lint, schema gates; manual smoke — toggle `ar` in the switcher, confirm `<html dir='rtl' lang='ar'>`, RTL reading order, Arabic `ui/` primitives, Arabic-tagged number/date formatting, and a hard reload **without LTR flash** (anti-flash hint).

*(4b is a separate program: per-domain subagent slices, `ui/`-first proof already shipped here, with the §5 selective-by-impact ordering and the financial-table text-align hand-review.)*

---

## 11. Risks & mitigations

- **Anti-flash import-order trap (highest-likelihood bug):** `main.tsx:7` imports `i18n` whose side-effects run during that import; the static `dir`/`lang` at `i18n.ts:1064-1065` would stomp a later `main.tsx` block. **Mitigation:** delete `:1064-1065` and land it in the same commit as the `main.tsx` block; the hint-driven `lng` makes the first render correct. Test: Arabic hint → no LTR flash.
- **`DEFAULT_TENANT_CONFIG.locale.languageCode='en'`** means until tenant config resolves (async, possibly post-paint) the provider drives `'en'`/LTR. **Mitigation:** the `xsuite_locale_hint` (written every effect) makes returning Arabic tenants paint RTL pre-config; first-ever load for a brand-new Arabic tenant gets one LTR frame (acceptable, same as theme's first-timer behavior).
- **Config cache (5-min):** a switch via `refreshConfig` no-ops for up to 5 min unless cache invalidated. **Mitigation:** call `invalidateTenantConfigCache` in the persisted `setLocale` path (already exists).
- **Two RTL derivations diverging** (UI vs PDF). **Mitigation:** task 1 centralizes `isRTLLanguage` to one helper.
- **`en` formatting regression** across 40 currency consumers. **Mitigation:** gate every `format.ts` change on `ar`; pin `en` byte-identical in tests.
- **Plural-rule state leak across the 184+ test suite** (ar `_few/_many` only resolve under `ar`). **Mitigation:** teardown `changeLanguage('en')`; the parity guard runs in isolation.
- **Country-derived-only language gap:** an Arabic speaker in a country whose `geo_countries.language_code='en'` (e.g. a UAE lab configured to US) gets English with no override. **Mitigation:** the §8 #2 per-tenant/per-user override; if unacceptable, (B) or (C) is required (expands scope).
- **RTL layout of English text looks broken** (LTR English in an RTL container) on the ~94% uninstrumented tree. **Mitigation:** honest stakeholder framing (§7); 4a ships text flow + `ui/` only; 4b is the layout program.
- **Scope creep** — 4b (~226 files) and full string instrumentation (~2,000 strings) are each larger than the entire UI-hardening program to date. **Mitigation:** the explicit 4a/4b split and the "dictionary done, instrumentation deferred" framing.

---

## 12. Acceptance criteria

1. **Locale activated:** `LocaleContext`/`LocaleProvider` mounted inside `TenantConfigProvider` (sibling of `ThemeProvider`); tenant `config.locale.languageCode` reactively drives `i18n.changeLanguage`, `document.documentElement.dir`, and `.lang`. `i18n.ts` no longer pins `lng:'en'` statically and no longer writes `dir`/`lang` at import (`:1064-1065` removed).
2. **Anti-flash:** `xsuite_locale_hint` persisted every effect (try/catch, mirroring `xsuite_theme_hint`); `main.tsx` reads it pre-`createRoot` (CSP-safe module script); a hard reload as an Arabic tenant paints RTL with **no LTR flash**.
3. **RTL derivation** comes from a single shared `isRTLLanguage` consumed by both UI and PDF; RTL set = `{'ar'}`; `de`/`fr` (and any non-`en`/`ar`) guard to `'en'`/LTR.
4. **Switcher:** admin-gated English/العربية cards in `AppearanceSettings.tsx` call `setLocale`; persistence per the §8 #2 decision (localStorage-only or per-tenant `tenants.language` migration with regenerated `database.types.ts`).
5. **Locale-aware formatting:** `format.ts` (`formatDate`/`formatNumber`/`formatCurrency`) uses `config.locale.localeCode`, date-fns `ar` imported; **`en` output byte-identical to current main** (gated on `ar`); central funnel fixed (long-tail raw `Intl` sites are tracked backlog, platform-admin English-only).
6. **`ui/` RTL proof slice:** the 24-file `ui/` library's physical-direction utilities converted to logical utilities; logical classes emit in the build; `className` overrides still win; `ui/` primitives render fully Arabic + RTL.
7. **Dictionary locked:** CI parity/plural guard in `i18n.test.tsx` passes and fails on any future en/ar desync; no new dictionary keys required (Phase 3 shipped them).
8. **Guardrails held:** additive-only APIs; **`tsc=0`**; all **6 CI gates** green; **no new npm packages**; **Tailwind v3.4** unchanged (`plugins: []`); no banned colors introduced.
9. **Honestly scoped:** the full RTL CSS sweep (4b, ~226 files / ~1,500 occurrences), `de`/`fr` dictionaries, Arabic-Indic digits, and full app string instrumentation are explicitly **NOT** in this PR and are recorded as tracked follow-ons.
10. New `*.test.tsx` per §9 pass; existing `i18n.test.tsx` and the Phase-3 suite stay green; `npm test` passes both projects; lint clean.