# Document Engine Overhaul — Phase 2: Granular Translation Controls (Design)

- **Date:** 2026-06-14
- **Status:** Approved (design) — proceeding to plan + implementation
- **Scope:** Phase 2 only (label/heading translation policy, no machine translation). Phases 3–4 remain separate cycles.

## 1. Background

Documents render bilingually (e.g. English + Arabic, RTL-aware) via a **static label dictionary** — `resolveLabel(label, language)` joins EN+AR for **labels** (document title, section headers, field-row labels like `Name:/الاسم:`, table headers, totals). **Data values are always rendered raw** (`safeString(value)`) — there is no machine translation anywhere. Whether a document is bilingual at all (and the secondary language) comes from Settings → Localization via `applyTenantLanguage`.

Tenants want control over *what gets the bilingual treatment* — some want customer/employee/reference field labels to stay in a single language while the lab's own boilerplate stays bilingual. Because values are already never translated, the genuine control is **over labels**.

**Decisions (from brainstorming):**
- **Label/heading policy only — no machine translation** of data values. Values always render exactly as entered.
- **Configured per document type in the Template Studio** (stored in the template-config JSON; no schema change).

## 2. Goals / Non-goals

**Goals**
- A per-document-type `translationPolicy` controlling which **field-row labels** render bilingually vs. in the primary language only, when the document is in a bilingual mode.
- Three modes covering the requested behaviors; default preserves today's output exactly.
- A Studio UI (Other Details tab) to set it, with a hint when the document isn't bilingual.

**Non-goals**
- No machine translation of data values (explicit).
- No change to *whether* a document is bilingual (still Settings → Localization).
- No change to system labels (document title, section/box headers, table headers, totals, footer) — those follow the document's bilingual mode as today.
- No DB schema change (policy lives in the existing template-config JSON).
- `custodySummary` (forensic boilerplate) is treated as system, not a data block (always follows the doc's bilingual mode).
- Granularity is **per field-group (info-box block)**, not per individual field (YAGNI; group-level is the usable 80/20).

## 3. The policy model

Add an optional `translationPolicy` to `DocumentTemplateConfig` (and the override type):

```ts
export type TranslationPolicyMode = 'all' | 'system_only' | 'custom';

/** Per data-block field-label bilingual toggle (mode === 'custom' only). */
export interface TranslationPolicyGroups {
  parties?: boolean;     // customer / company block
  meta?: boolean;        // document numbers, dates, job id (references)
  caseInfo?: boolean;    // case details
  collector?: boolean;   // checkout collector
  payslip?: boolean;     // employee info
  diagnostics?: boolean; // media / component diagnostics
}

export interface TranslationPolicyConfig {
  mode?: TranslationPolicyMode;      // default 'all'
  groups?: TranslationPolicyGroups;  // used only when mode === 'custom'; per-group default true
}
```

Effective behavior — **only matters when the document is in a bilingual mode**:

| Mode | System labels (title, headers, table, totals, footer) | Field-row labels (the 6 data groups) |
|---|---|---|
| `all` (default) | bilingual | bilingual |
| `system_only` | bilingual | **primary language only** |
| `custom` | bilingual | per-group: `groups[g] ?? true` (true = bilingual, false = primary-only) |

This satisfies the originally-requested options: *translate all* / *labels & headings* → `all`; *system-generated only* and *don't translate customer/employee data* → `system_only`; *custom field-level* → `custom`.

## 4. Where it hooks (engine)

The policy is read from `engine.config.translationPolicy` inside the **data info-box renderers** only. The key helper (in `engine/labels.ts`):

```ts
export type TranslationGroup = 'parties' | 'meta' | 'caseInfo' | 'collector' | 'payslip' | 'diagnostics';

export function fieldLabelsBilingual(policy: TranslationPolicyConfig | undefined, group: TranslationGroup): boolean {
  if (!policy || !policy.mode || policy.mode === 'all') return true;
  if (policy.mode === 'system_only') return false;
  return policy.groups?.[group] ?? true; // custom
}

/** The LanguageConfig to use for a data block's FIELD-ROW labels under the policy. */
export function fieldLabelLanguage(
  language: LanguageConfig,
  policy: TranslationPolicyConfig | undefined,
  group: TranslationGroup,
): LanguageConfig {
  if (!isBilingualMode(language) || fieldLabelsBilingual(policy, group)) return language;
  return { mode: language.primary === 'ar' ? 'ar' : 'en', primary: language.primary };
}
```

Each data-box renderer computes `labelLang = fieldLabelLanguage(config.language, config.translationPolicy, '<group>')` and passes `labelLang` to the row builder (`partyRows`/`infoRow`/etc.) and its `labelWidthFor`, while the **box title keeps using the full `config.language`** (titles stay bilingual). No `infoRow` signature changes — only the language passed to the row builders changes.

Affected renderers (group): `infoBoxes.ts` (`parties`, `meta`, and the side-by-side `meta`/`caseInfo` halves), `caseInfo.ts` (`caseInfo`), `collector.ts` (`collector`), `payslipInfo.ts` (`payslip`), `reportDiagnostics.ts` (`diagnostics`). Values (`safeString(value)`) are untouched everywhere.

## 5. Cascade / merge

`translationPolicy` joins the premium-controls cascade in `templateConfig.ts`: a `mergeTranslationPolicy(base, override)` that deep-merges the `groups` map by key (mirroring `mergeOrganization`), wired into `applyOverride`. Absent on every layer → `undefined` → `all` behavior → byte-identical to today.

## 6. UI (Studio → Other Details tab)

A new **"Translation"** `FieldGroup` directly under the existing **"Language"** group in `OtherDetailsTab.tsx`:
- A mode `Select`/segmented control: *All labels* / *System labels only* / *Custom*.
- When `custom`: six `ToggleRow`s (one per group) labeled with the friendly names already in `SECTION_LABELS` (Customer/party details, Document details, Case information, Collector, Payslip, Diagnostics).
- A hint when `api.resolved.language.mode` is single-language (`en`/`ar`): "Only applies to bilingual documents." (The policy still saves; it just has no visible effect until bilingual.)

`StudioApi` gains `setTranslationPolicy(patch: Partial<TranslationPolicyConfig>)` and `setTranslationGroup(group, value)` (mirroring `setOrganization`/`setOrgShow`). Semantic theme tokens only — no raw hex.

## 7. Testing (TDD)

- **Unit (`labels.test.ts` or new):** `fieldLabelsBilingual` for all/system_only/custom(+groups); `fieldLabelLanguage` returns the bilingual config for `all`, a primary-only config (en or ar by `primary`) for suppressed groups, and the original config when the doc is single-language.
- **Engine:** with a bilingual config + `system_only`, the rendered `parties` box has a **bilingual title** but **primary-only field-row labels** (e.g. the customer box shows `Name:` not `Name:\nالاسم:`), while a system block (table header/totals) stays bilingual. `custom` with `parties: false, meta: true` suppresses only parties.
- **Cascade:** `mergeTranslationPolicy` deep-merges `groups`; default (absent) → `all`.
- **Parity:** default-`all` leaves all golden/parity output unchanged (no snapshot changes).

## 8. Rollout

Single contained PR, no schema change, defaults preserve all existing output. Gates: `bash scripts/check-tsc.sh` (the strict CI typecheck — **use this, not plain `tsc --noEmit`**), `vitest run`, eslint on changed files.
