# Granular Translation Controls (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a per-document-type translation policy that controls which **field-row labels** render bilingually vs. in the primary language only, without ever translating data values.

**Architecture:** A `translationPolicy` config group (modes `all` / `system_only` / `custom` + per-group toggles) joins the template-config cascade. A pure helper `fieldLabelLanguage()` returns the `LanguageConfig` a data block should use for its field-row labels; the five data-box renderers use it for rows while keeping their box title bilingual. A Studio UI sets the policy. Default `all` = byte-identical to today.

**Tech Stack:** TypeScript, pdfmake, React, Vitest. Spec: `docs/superpowers/specs/2026-06-14-translation-controls-phase2-design.md`.

**Critical facts:**
- CI typecheck = `bash scripts/check-tsc.sh` (`tsc -p tsconfig.app.json`), STRICTER than plain `npx tsc --noEmit`. **Verify with `bash scripts/check-tsc.sh`.**
- Bilingual rendering = `resolveLabel(label, language)` joining EN+AR for labels; data values are `safeString(value)` (never translated — do not touch).
- The five data-box renderers share an `infoRow`/`resolveLabel` pattern: `infoBoxes.ts`, `caseInfo.ts`, `collector.ts`, `payslipInfo.ts`, `reportDiagnostics.ts`. `custodySummary.ts` is intentionally NOT in scope (forensic/system).
- Default (no policy) MUST keep golden/parity output unchanged.

---

## Task 1: config types + cascade merge

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts`
- Test: `src/lib/pdf/templateConfig.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/pdf/templateConfig.test.ts`:

```ts
import { resolveTemplateConfig, BUILT_IN_TEMPLATE_CONFIGS } from './templateConfig';

describe('translationPolicy cascade', () => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  it('is absent by default (→ all behavior)', () => {
    expect(resolveTemplateConfig(base).translationPolicy).toBeUndefined();
  });
  it('takes an override and deep-merges groups', () => {
    const a = resolveTemplateConfig(base, { translationPolicy: { mode: 'custom', groups: { parties: false } } });
    expect(a.translationPolicy).toEqual({ mode: 'custom', groups: { parties: false } });
    const b = resolveTemplateConfig(base,
      { translationPolicy: { mode: 'custom', groups: { parties: false } } },
      { translationPolicy: { groups: { meta: false } } },
    );
    expect(b.translationPolicy).toEqual({ mode: 'custom', groups: { parties: false, meta: false } });
  });
});
```
(If `templateConfig.test.ts` already imports `resolveTemplateConfig`/`BUILT_IN_TEMPLATE_CONFIGS`, reuse those imports — don't duplicate.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/pdf/templateConfig.test.ts` (translationPolicy not a field).

- [ ] **Step 3: Add the types** — in `src/lib/pdf/templateConfig.ts`, near the other config-group interfaces (e.g. just before `DocumentTemplateConfig`):

```ts
export type TranslationPolicyMode = 'all' | 'system_only' | 'custom';

/** Per data-block field-label bilingual toggle (used only when mode === 'custom'). */
export interface TranslationPolicyGroups {
  parties?: boolean;
  meta?: boolean;
  caseInfo?: boolean;
  collector?: boolean;
  payslip?: boolean;
  diagnostics?: boolean;
}

/** Controls which FIELD-ROW labels render bilingually (no effect on data values). */
export interface TranslationPolicyConfig {
  /** Default 'all' (every label bilingual when the document is bilingual). */
  mode?: TranslationPolicyMode;
  /** Per-group field-label toggle for mode === 'custom' (default true = bilingual). */
  groups?: TranslationPolicyGroups;
}
```

- [ ] **Step 4: Add to the config + override interfaces** — add `translationPolicy?: TranslationPolicyConfig;` to BOTH `DocumentTemplateConfig` (in the premium-controls block, after `layout?`) and `TemplateConfigOverride` (after `layout?`).

- [ ] **Step 5: Add the merge + wire it in** — add this helper next to `mergeOrganization`:

```ts
/** Merge translation policy, deep-merging the `groups` toggles by key. */
function mergeTranslationPolicy(
  base: TranslationPolicyConfig | undefined,
  override: TranslationPolicyConfig | undefined,
): TranslationPolicyConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  const groups = mergeGroup(base.groups, override.groups);
  return { ...base, ...override, ...(groups ? { groups } : {}) };
}
```
and in `applyOverride`'s returned object (after the `layout:` line):
```ts
    translationPolicy: mergeTranslationPolicy(base.translationPolicy, override.translationPolicy),
```

- [ ] **Step 6: Run → PASS** — `npx vitest run src/lib/pdf/templateConfig.test.ts` and `bash scripts/check-tsc.sh` (expect OK).

- [ ] **Step 7: Commit**
```bash
git add src/lib/pdf/templateConfig.ts src/lib/pdf/templateConfig.test.ts
git commit -m "feat(pdf-config): add translationPolicy config group + cascade merge"
```

---

## Task 2: label resolver helpers

**Files:**
- Modify: `src/lib/pdf/engine/labels.ts`
- Test: `src/lib/pdf/engine/labels.test.ts` (new)

- [ ] **Step 1: Write the failing test** — create `src/lib/pdf/engine/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fieldLabelsBilingual, fieldLabelLanguage } from './labels';
import type { LanguageConfig } from '../templateConfig';

const BI: LanguageConfig = { mode: 'bilingual_stacked', primary: 'ar' };
const EN: LanguageConfig = { mode: 'en', primary: 'en' };

describe('fieldLabelsBilingual', () => {
  it('all (or undefined) → true for any group', () => {
    expect(fieldLabelsBilingual(undefined, 'parties')).toBe(true);
    expect(fieldLabelsBilingual({ mode: 'all' }, 'parties')).toBe(true);
  });
  it('system_only → false for any group', () => {
    expect(fieldLabelsBilingual({ mode: 'system_only' }, 'parties')).toBe(false);
  });
  it('custom → per-group, default true', () => {
    const p = { mode: 'custom' as const, groups: { parties: false } };
    expect(fieldLabelsBilingual(p, 'parties')).toBe(false);
    expect(fieldLabelsBilingual(p, 'meta')).toBe(true);
  });
});

describe('fieldLabelLanguage', () => {
  it('returns the bilingual config when the group is bilingual', () => {
    expect(fieldLabelLanguage(BI, { mode: 'all' }, 'parties')).toEqual(BI);
  });
  it('returns a primary-only config (ar) when suppressed and primary is ar', () => {
    expect(fieldLabelLanguage(BI, { mode: 'system_only' }, 'parties')).toEqual({ mode: 'ar', primary: 'ar' });
  });
  it('returns the original config unchanged for a single-language document', () => {
    expect(fieldLabelLanguage(EN, { mode: 'system_only' }, 'parties')).toEqual(EN);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/pdf/engine/labels.test.ts`.

- [ ] **Step 3: Implement** — in `src/lib/pdf/engine/labels.ts`, add the import for the policy type and append the helpers:

```ts
import type { LanguageConfig, TranslationPolicyConfig } from '../templateConfig';
```
(merge with the existing `LanguageConfig` import line — don't duplicate the import.)

```ts
export type TranslationGroup =
  | 'parties' | 'meta' | 'caseInfo' | 'collector' | 'payslip' | 'diagnostics';

/** Whether a data block's FIELD-ROW labels render bilingually under the policy. */
export function fieldLabelsBilingual(
  policy: TranslationPolicyConfig | undefined,
  group: TranslationGroup,
): boolean {
  if (!policy || !policy.mode || policy.mode === 'all') return true;
  if (policy.mode === 'system_only') return false;
  return policy.groups?.[group] ?? true; // custom
}

/**
 * The LanguageConfig a data block should use for its FIELD-ROW labels: the full
 * (bilingual) config when the group is translated, else a primary-only config so
 * the field labels render in a single language. Box TITLES keep the full config.
 */
export function fieldLabelLanguage(
  language: LanguageConfig,
  policy: TranslationPolicyConfig | undefined,
  group: TranslationGroup,
): LanguageConfig {
  if (!isBilingualMode(language) || fieldLabelsBilingual(policy, group)) return language;
  return { mode: language.primary === 'ar' ? 'ar' : 'en', primary: language.primary };
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/pdf/engine/labels.test.ts` && `bash scripts/check-tsc.sh`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/pdf/engine/labels.ts src/lib/pdf/engine/labels.test.ts
git commit -m "feat(pdf-engine): fieldLabelLanguage/fieldLabelsBilingual policy helpers"
```

---

## Task 3: apply the policy in the data-box renderers

**Files (modify):** `src/lib/pdf/engine/sections/infoBoxes.ts`, `caseInfo.ts`, `collector.ts`, `payslipInfo.ts`, `reportDiagnostics.ts`
**Test:** `src/lib/pdf/engine/translationPolicy.test.ts` (new)

The transformation is the SAME in every file: add `import { fieldLabelLanguage } from '../labels';` (merge with the existing labels import), then in the render function compute
```ts
const labelLang = fieldLabelLanguage(engine.config.language, engine.config.translationPolicy, '<GROUP>');
```
and use `labelLang` everywhere the **field-row** labels are built (the `infoRow(...)`/`partyRows(...)` calls AND the `labelWidthFor(...)` call that sizes the label column), while keeping the existing `language` for the **box title** (`createBilingualInfoBox(en(title), ... ar(title) ...)`). Do NOT change how values are rendered.

Per-file specifics:

- [ ] **`infoBoxes.ts`** — two boxes + the side-by-side helper:
  - `partyBox(...)` (group `'parties'`): compute `labelLang` and pass it to `partyRows(party, labelLang)`; keep the title on `language`.
  - the meta box renderer (`renderMeta`/the `data.meta.map((m) => infoRow(m.label, m.value, language, labelWidth))` at ~line 95, group `'meta'`): compute a meta `labelLang` and use it for the `infoRow` map AND the `labelWidthFor`/`labelWidth`; keep the title on `language`.
  - the side-by-side `detailsHalf` (~lines 140 & 145): meta rows use group `'meta'`, caseInfo rows use group `'caseInfo'` — compute the appropriate `labelLang` for each and use it for those `infoRow` maps and their `labelWidth`.
- [ ] **`caseInfo.ts`** (group `'caseInfo'`): `labelLang` for the `caseInfo.rows.map((r) => infoRow(...))` (~line 60) + its `labelWidth`; title on `language`.
- [ ] **`collector.ts`** (group `'collector'`): `labelLang` for the `collector.rows.map(...)` (~line 59) + `labelWidth`; title on `language`.
- [ ] **`payslipInfo.ts`** (group `'payslip'`): `labelLang` for `info.rows.map(...)` (~line 58) + `labelWidth`; title on `language`.
- [ ] **`reportDiagnostics.ts`** (group `'diagnostics'`): `labelLang` for `diagnostics.rows.map(...)` (~line 65) + `labelWidth`; title on `language`.

- [ ] **Step A: Write the engine test** — create `src/lib/pdf/engine/translationPolicy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { TranslationPolicyConfig } from '../templateConfig';
import { renderTemplate } from './renderTemplate';
import { buildPreviewEngineData } from './sampleData';
import type { TranslationContext } from '../types';

const ctx: TranslationContext = { t: (_k, en) => en, isRTL: false, isBilingual: false, languageCode: null, fontFamily: 'Roboto' };

// Render the invoice in bilingual-stacked Arabic with a given policy; return the
// JSON of the doc-definition so we can assert which Arabic strings appear.
const render = (policy?: TranslationPolicyConfig) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const config = { ...base, language: { mode: 'bilingual_stacked' as const, primary: 'ar' as const }, translationPolicy: policy };
  return JSON.stringify(renderTemplate(config, buildPreviewEngineData('invoice', config), ctx, null, null));
};

describe('translationPolicy — field-label suppression', () => {
  it('all → the customer "Name" field label is bilingual (Arabic present)', () => {
    expect(render({ mode: 'all' })).toContain('الاسم');
  });
  it('system_only → the customer field label is primary-only (no Arabic "الاسم")', () => {
    const out = render({ mode: 'system_only' });
    expect(out).not.toContain('الاسم');
  });
  it('system_only → a SYSTEM label (e.g. the customer box TITLE) stays bilingual', () => {
    // The parties box title is a system label and must still render its Arabic.
    // Use the actual Arabic title the sample/config emits (e.g. "معلومات العميل").
    expect(render({ mode: 'system_only' })).toContain('معلومات');
  });
  it('custom parties:false meta:true → only parties suppressed', () => {
    const out = render({ mode: 'custom', groups: { parties: false } });
    expect(out).not.toContain('الاسم');     // parties field label suppressed
  });
});
```
> Before relying on the exact Arabic strings, run the `all` case and inspect the output to confirm the customer "Name" label Arabic is `الاسم` and the parties box TITLE Arabic contains `معلومات`. If the sample uses different Arabic, adjust the asserted substrings to the real ones — keep the INTENT (field label suppressed under system_only; box title still bilingual).

- [ ] **Step B: Run → FAIL** — `npx vitest run src/lib/pdf/engine/translationPolicy.test.ts` (system_only still shows `الاسم`).

- [ ] **Step C: Apply the transformation** in all five files as specified above.

- [ ] **Step D: Run the new test + parity + goldens:**
```
npx vitest run src/lib/pdf/engine/translationPolicy.test.ts src/lib/pdf/engine/invoiceParity.test.ts src/lib/pdf/engine/officeReceiptParity.test.ts src/lib/pdf/engine/payslipParity.test.ts src/lib/pdf/engine/reportParity.test.ts src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts
```
Expect ALL PASS with NO snapshot changes (default `all`/absent policy leaves output identical). If a parity test changed, you altered default behavior — ensure `labelLang === language` whenever the policy is absent or `all`.

- [ ] **Step E:** `bash scripts/check-tsc.sh` → OK.

- [ ] **Step F: Commit**
```bash
git add src/lib/pdf/engine/sections/ src/lib/pdf/engine/translationPolicy.test.ts
git commit -m "feat(pdf-engine): apply translationPolicy to data-box field labels"
```

---

## Task 4: Studio UI (Other Details tab)

**Files:**
- Modify: `src/components/settings/documents/TemplateStudio.tsx` (StudioApi + mutators)
- Modify: `src/components/settings/documents/tabs/OtherDetailsTab.tsx`

- [ ] **Step 1: Extend `StudioApi`** in `TemplateStudio.tsx` — add to the `StudioApi` interface (near `setLayout`):
```ts
  setTranslationPolicy: (patch: Partial<TranslationPolicyConfig>) => void;
  setTranslationGroup: (group: keyof NonNullable<TranslationPolicyConfig['groups']>, value: boolean) => void;
```
Import the type: add `type TranslationPolicyConfig,` to the existing `templateConfig` import block.

- [ ] **Step 2: Implement the mutators** — in the `api` object (mirror the existing `setLayout` / `setOrgShow` implementations). `setTranslationPolicy` merges a patch into the `translationPolicy` group; `setTranslationGroup` merges one `groups` key:
```ts
    setTranslationPolicy: (patch) =>
      mergeGroup('translationPolicy', patch),
    setTranslationGroup: (group, value) =>
      setOverride((o) => ({
        ...o,
        translationPolicy: {
          ...o.translationPolicy,
          groups: { ...o.translationPolicy?.groups, [group]: value },
        },
      })),
```
> Use the SAME merge mechanism the other `set*` mutators in this file use. If a local `mergeGroup(key, patch)` helper exists (as used by `setHeader`/`setFooter`), call it for `setTranslationPolicy`; otherwise follow the exact pattern those mutators use to write into `override`. Read the existing mutators first and match them.

- [ ] **Step 3: Add the UI** — in `OtherDetailsTab.tsx`, import `TranslationPolicyConfig` type and add a new `FieldGroup` immediately AFTER the existing "Language" `FieldGroup`:
```tsx
      <FieldGroup title="Translation" description="Which labels render bilingually. Only affects bilingual documents; data values always stay as entered.">
        {api.resolved.language.mode === 'en' || api.resolved.language.mode === 'ar' ? (
          <p className="text-xs text-slate-500">Only applies to bilingual documents — set a bilingual document language above to use this.</p>
        ) : null}
        <Select
          label="Translate"
          value={api.resolved.translationPolicy?.mode ?? 'all'}
          onChange={(e) => api.setTranslationPolicy({ mode: e.target.value as NonNullable<TranslationPolicyConfig['mode']> })}
          options={[
            { value: 'all', label: 'All labels (customer/employee field labels too)' },
            { value: 'system_only', label: 'System labels only (keep customer/employee field labels single-language)' },
            { value: 'custom', label: 'Custom — choose per block' },
          ]}
        />
        {api.resolved.translationPolicy?.mode === 'custom' && (
          <div className="space-y-2">
            {([
              ['parties', 'Customer / party details'],
              ['meta', 'Document details'],
              ['caseInfo', 'Case information'],
              ['collector', 'Collector'],
              ['payslip', 'Payslip'],
              ['diagnostics', 'Diagnostics'],
            ] as const).map(([group, label]) => (
              <ToggleRow
                key={group}
                label={`Translate ${label} labels`}
                checked={api.resolved.translationPolicy?.groups?.[group] ?? true}
                onChange={(v) => api.setTranslationGroup(group, v)}
              />
            ))}
          </div>
        )}
      </FieldGroup>
```
(`Select`, `FieldGroup`, `ToggleRow` are already imported in this file.)

- [ ] **Step 4: Verify** — `bash scripts/check-tsc.sh` → OK; `npx vitest run src/lib/pdf/` → all pass. Manually confirm the Studio Other Details tab shows the Translation group, the custom toggles appear only for `custom`, and (sample preview) switching to `system_only` on a bilingual doc drops the Arabic on customer field labels while section titles stay bilingual.

- [ ] **Step 5: Commit**
```bash
git add src/components/settings/documents/TemplateStudio.tsx src/components/settings/documents/tabs/OtherDetailsTab.tsx
git commit -m "feat(studio): translation policy controls in Other Details tab"
```

---

## Final verification
- [ ] `bash scripts/check-tsc.sh` → OK (0 errors).
- [ ] `npx vitest run` → all green.
- [ ] `npx eslint` (changed files) → clean.
- [ ] Golden/parity suites unchanged (default `all`).
- [ ] Push + open draft PR.

## Spec coverage
- translationPolicy config + cascade → Task 1.
- policy resolver helpers → Task 2.
- field-label suppression in the 5 data boxes (values untouched) → Task 3.
- Studio UI (per-document, Other Details tab, custom per-group, bilingual hint) → Task 4.
- Default `all` parity → Tasks 1 & 3 (parity/golden suites).
