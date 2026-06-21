# Document-Relevant Translation Blocks + Payment-History Heading Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tenant suppress the bilingual translation of the **Payment History** column headers, and show only document-relevant blocks in the "Custom — choose per block" translation list (so Collector/Payslip/Diagnostics stop appearing on an invoice).

**Architecture:** Both asks ride the existing `translationPolicy` framework. Part 1 adds `paymentHistory` as a translation group and routes the payment-history **column headers** (not the section title) through the existing `fieldLabelLanguage()` resolver. Part 2 filters the Studio's per-block toggle list by which sections are actually present on the resolved document, via a `group → section-key` map. Default-on ⇒ existing PDFs are byte-identical.

**Tech Stack:** TypeScript, pdfmake, React, Vitest. Spec: `docs/superpowers/specs/2026-06-21-translation-block-relevance-design.md`.

**Critical facts:**
- CI typecheck = `bash scripts/check-tsc.sh` (`tsc -p tsconfig.app.json`), STRICTER than `npx tsc --noEmit`. **Verify with `bash scripts/check-tsc.sh`.**
- Vitest runs via esbuild (transpile-only), so a behavioral test executes even before a type is added — but tsc must end green.
- The sample invoice (`sampleData.ts`) ships `paymentHistory: []`, so the payment-history section renders nothing from `buildPreviewEngineData` alone. The engine test must inject a `PaymentHistoryBlock` with a row.
- Two type lists must stay in sync: `TranslationPolicyGroups` (`templateConfig.ts`) and the `TranslationGroup` union (`labels.ts`). Both gain `paymentHistory`.
- Bilingual stacked (primary `ar`) joins as `<arabic>\n<english>`; in the JSON-serialized doc-definition that newline is the two-char escape `\n`, matched in test source as `'\\n'`.

---

## Task 1: Payment-history headers honor `translationPolicy` (engine)

**Files:**
- Modify: `src/lib/pdf/templateConfig.ts:312-319` (`TranslationPolicyGroups`)
- Modify: `src/lib/pdf/engine/labels.ts:55-56` (`TranslationGroup` union)
- Modify: `src/lib/pdf/engine/sections/paymentHistory.ts:14,48,71-77`
- Test: `src/lib/pdf/engine/translationPolicy.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `src/lib/pdf/engine/translationPolicy.test.ts`. Add the `PaymentHistoryBlock` import to the top of the file (merge with the existing `../types` import line if you prefer; a separate line is fine):

```ts
import type { PaymentHistoryBlock } from './types';

// A one-row payment-history block mirroring the invoice adapter's labels, so we
// can exercise the statement table the empty sample invoice never populates.
const SAMPLE_HISTORY: PaymentHistoryBlock = {
  title: { en: 'Payment History', ar: 'سجل الدفعات' },
  columns: {
    date: { en: 'Date', ar: 'التاريخ' },
    document: { en: 'Document', ar: 'المستند' },
    method: { en: 'Method', ar: 'الطريقة' },
    reference: { en: 'Reference', ar: 'المرجع' },
    recordedBy: { en: 'Recorded By', ar: 'سجلها' },
    amount: { en: 'Amount', ar: 'المبلغ' },
    balance: { en: 'Balance', ar: 'الرصيد' },
  },
  rows: [
    { date: '21/06/2026', document: 'PAYM-0012', method: 'Bank Transfer', reference: '#123456', recordedBy: 'Nitin Ziva', amount: 'OMR 100.000', runningBalance: 'OMR 2000.000' },
  ],
};

const renderWithHistory = (policy?: TranslationPolicyConfig) => {
  const base = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const config = { ...base, language: { mode: 'bilingual_stacked' as const, primary: 'ar' as const }, translationPolicy: policy };
  const data = { ...buildPreviewEngineData('invoice', config), paymentHistory: SAMPLE_HISTORY };
  return JSON.stringify(renderTemplate(config, data, ctx, null, null));
};

describe('translationPolicy — payment-history heading suppression', () => {
  it('all → the "Date" column header is bilingual (Arabic + English stacked)', () => {
    expect(renderWithHistory({ mode: 'all' })).toContain('التاريخ\\nDate');
  });
  it('custom { paymentHistory: false } → the column header drops to Arabic-only', () => {
    const out = renderWithHistory({ mode: 'custom', groups: { paymentHistory: false } });
    expect(out).not.toContain('التاريخ\\nDate'); // English half gone
    expect(out).toContain('التاريخ');             // Arabic header survives (suppressed, not removed)
  });
  it('custom { paymentHistory: false } → the section TITLE stays bilingual', () => {
    expect(renderWithHistory({ mode: 'custom', groups: { paymentHistory: false } })).toContain('سجل الدفعات\\nPayment History');
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/pdf/engine/translationPolicy.test.ts`
  Expected: the `custom { paymentHistory: false }` case FAILS its `not.toContain('التاريخ\\nDate')` assertion (headers are still bilingual because the renderer ignores the policy). The `all` and TITLE cases already pass.

- [ ] **Step 3: Add the config type** — in `src/lib/pdf/templateConfig.ts`, add `paymentHistory` to `TranslationPolicyGroups` (currently lines 312-319):

```ts
/** Per data-block field-label bilingual toggle (used only when mode === 'custom'). */
export interface TranslationPolicyGroups {
  parties?: boolean;
  meta?: boolean;
  caseInfo?: boolean;
  collector?: boolean;
  payslip?: boolean;
  diagnostics?: boolean;
  /** Payment-history statement column headers (financial documents). */
  paymentHistory?: boolean;
}
```

- [ ] **Step 4: Add the engine union member** — in `src/lib/pdf/engine/labels.ts`, extend the `TranslationGroup` union (currently lines 55-56):

```ts
export type TranslationGroup =
  | 'parties' | 'meta' | 'caseInfo' | 'collector' | 'payslip' | 'diagnostics' | 'paymentHistory';
```

- [ ] **Step 5: Apply the policy to the payment-history headers** — in `src/lib/pdf/engine/sections/paymentHistory.ts`:

  (a) Extend the labels import (line 14):
```ts
import { resolveLabel, fieldLabelLanguage } from '../labels';
```

  (b) After `const { language } = engine.config;` (line 48), add the suppressed-or-not label language for the column headers:
```ts
  const { language } = engine.config;
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'paymentHistory');
```

  (c) In the `headerRow` map (lines 71-77), resolve the header text with `labelLang` instead of `language`:
```ts
  const headerRow: TableCell[] = ordered.map((c) => ({
    text: resolveLabel(c.label, labelLang),
    fontSize: 8,
    bold: true,
    color: PDF_COLORS.textLight,
    alignment: c.align,
  }));
```

  Leave everything else untouched — in particular the section title keeps `language` (`text: resolveLabel(history.title, language)` at line ~98) and `direction = engineLayoutDirection(language)` (line 51) is unchanged, so RTL column order/alignment is preserved.

- [ ] **Step 6: Run → PASS** — `npx vitest run src/lib/pdf/engine/translationPolicy.test.ts`
  Expected: all cases PASS (suppressed header is Arabic-only `التاريخ`; title still `سجل الدفعات\nPayment History`).

- [ ] **Step 7: Confirm default-on parity is intact** — the default (absent / `all`) policy must leave every existing document byte-identical:
```
npx vitest run src/lib/pdf/engine/invoiceParity.test.ts src/lib/pdf/engine/rtl.test.ts src/lib/pdf/documents/__goldens__/buildersCharacterization.test.ts
```
  Expected: all PASS, NO snapshot changes. (If a snapshot changed, you altered default behavior — recheck that `fieldLabelLanguage` returns the original `language` when the policy is absent/`all`.)

- [ ] **Step 8: Typecheck** — `bash scripts/check-tsc.sh`
  Expected: `OK` / 0 errors.

- [ ] **Step 9: Commit**
```bash
git add src/lib/pdf/templateConfig.ts src/lib/pdf/engine/labels.ts src/lib/pdf/engine/sections/paymentHistory.ts src/lib/pdf/engine/translationPolicy.test.ts
git commit -m "feat(pdf-engine): payment-history headers honor translationPolicy (paymentHistory group)"
```

---

## Task 2: Studio shows only document-relevant translation blocks (+ Payment history row)

**Files:**
- Modify: `src/components/settings/documents/tabs/OtherDetailsTab.tsx`

> **Skill gate (CLAUDE.md):** this task edits a UI surface — load `ui-ux-pro-max` **and** `frontend-design` before editing the `.tsx`. The change reuses the existing `ToggleRow` and the file's existing `text-xs text-slate-500` hint style; no new visual vocabulary.

This task has no isolated unit test (the tab has no test harness today, matching the existing pattern for Studio tabs); it is verified by tsc + lint + a manual preview check. The behavioral guarantee — which blocks belong to which document type — derives from the section sets in `templateConfig.ts`, which the parity suites already cover.

- [ ] **Step 1: Add the block→section map** — in `src/components/settings/documents/tabs/OtherDetailsTab.tsx`, add this module-level constant next to the other label maps (e.g. just after `SECTION_LABELS` / `sectionLabel`, around line 56). `TranslationPolicyConfig` is already imported at line 7:

```ts
/**
 * The per-block translation toggles offered under "Custom — choose per block",
 * each paired with the document SECTION it governs and its UI label. A block is
 * offered only when that section is present on the current document type — so
 * Collector shows on the checkout form but never on an invoice. `payslip`
 * governs the `payslipInfo` section (the only non-1:1 mapping).
 */
const TRANSLATION_BLOCKS: ReadonlyArray<
  readonly [keyof NonNullable<TranslationPolicyConfig['groups']>, string, string]
> = [
  ['parties', 'parties', 'Customer / party details'],
  ['meta', 'meta', 'Document details'],
  ['caseInfo', 'caseInfo', 'Case information'],
  ['collector', 'collector', 'Collector'],
  ['payslip', 'payslipInfo', 'Payslip'],
  ['diagnostics', 'diagnostics', 'Diagnostics'],
  ['paymentHistory', 'paymentHistory', 'Payment history'],
];
```

- [ ] **Step 2: Compute the relevant blocks for this document** — inside the `OtherDetailsTab` component, next to the existing `ordered` / `hasPartiesAndDetails` memos (around lines 59-72), add:

```ts
  // Only offer per-block translation toggles for blocks whose section actually
  // exists on this document type (so e.g. Collector never shows on an invoice).
  const customBlocks = useMemo(() => {
    const present = new Set(api.resolved.sections.map((s) => s.key));
    return TRANSLATION_BLOCKS.filter(([, sectionKey]) => present.has(sectionKey));
  }, [api.resolved.sections]);
```

- [ ] **Step 3: Replace the hardcoded custom list** — swap the current custom block (lines 123-141, the `mode === 'custom'` `<div>` with the inline 6-entry array) for the filtered render with an empty-state fallback:

```tsx
        {api.resolved.translationPolicy?.mode === 'custom' &&
          (customBlocks.length > 0 ? (
            <div className="space-y-2">
              {customBlocks.map(([group, , label]) => (
                <ToggleRow
                  key={group}
                  label={`Translate ${label} labels`}
                  checked={api.resolved.translationPolicy?.groups?.[group] ?? true}
                  onChange={(v) => api.setTranslationGroup(group, v)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No translatable blocks on this document type.</p>
          ))}
```

- [ ] **Step 4: Typecheck** — `bash scripts/check-tsc.sh`
  Expected: `OK` / 0 errors. (`setTranslationGroup` accepts `paymentHistory` because Task 1 added it to `TranslationPolicyGroups`, which is the source of its `group` key type.)

- [ ] **Step 5: Lint the changed file** — `npx eslint src/components/settings/documents/tabs/OtherDetailsTab.tsx`
  Expected: clean (no errors).

- [ ] **Step 6: Manual preview check** — `npm run dev`, open Settings → Documents → **Invoice** template → Other Details → Translation → set **Document language** to a bilingual mode → set **Translate** to "Custom — choose per block":
  - The list shows exactly: *Translate Customer / party details labels*, *Translate Document details labels*, *Translate Payment history labels*. Collector / Payslip / Diagnostics are GONE.
  - Open the **Checkout form** template the same way: the list shows *Customer / party details*, *Case information*, *Collector* (and not Payment history).
  - Back on the invoice, toggle **Payment history** OFF: in the live preview, the Payment History table's column headers drop to a single language while the "Payment History" title stays bilingual and the amounts/dates are unchanged. (Use a record with recorded payments, or note the sample invoice has none — pick a real invoice from the data-source picker.)

- [ ] **Step 7: Commit**
```bash
git add src/components/settings/documents/tabs/OtherDetailsTab.tsx
git commit -m "feat(studio): show only document-relevant translation blocks + payment-history toggle"
```

---

## Final verification
- [ ] `bash scripts/check-tsc.sh` → 0 errors.
- [ ] `npx vitest run src/lib/pdf/` → all green.
- [ ] `npx eslint src/components/settings/documents/tabs/OtherDetailsTab.tsx src/lib/pdf/engine/sections/paymentHistory.ts` → clean.
- [ ] Golden/parity suites unchanged (default `all`).
- [ ] Push `claude/ecstatic-dijkstra-rqdiwp` + open a draft PR.

## Spec coverage
- `paymentHistory` translation group (config type + engine union) → Task 1 Steps 3-4. Cascade merge for the new key is covered by the existing generic `translationPolicy cascade` groups-merge test (key-agnostic spread) plus Task 1's behavioral test.
- Payment-history **column headers** suppressed, **title** + values untouched → Task 1 Steps 5-6.
- Default-on parity (byte-identical PDFs) → Task 1 Step 7.
- Per-block list filtered to sections present on the document (Collector off invoices) → Task 2 Steps 1-3, 6.
- Empty-state for doc types with no translatable blocks → Task 2 Step 3.
- Payment history added as a relevant block on financial docs → Task 2 Step 1 + 6.
