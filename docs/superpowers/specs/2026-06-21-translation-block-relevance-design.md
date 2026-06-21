# Document-Relevant Translation Blocks + Payment-History Heading Toggle

**Date:** 2026-06-21
**Status:** Approved (design)
**Builds on:** `2026-06-14-translation-controls-phase2-design.md` (the `translationPolicy` framework)

## Problem

On the PDF Template Studio → **Other Details → Translation → "Custom — choose per block"** control, two issues surface on bilingual (EN | AR) documents:

1. **Irrelevant blocks are offered.** The per-block toggle list is hardcoded to all six translation groups (`parties`, `meta`, `caseInfo`, `collector`, `payslip`, `diagnostics`) regardless of document type. On an **invoice**, `Collector`, `Payslip`, and `Diagnostics` toggle nothing — those blocks do not exist on an invoice (a Collector block belongs to the device **checkout form** only). Offering them is logically wrong and confusing.

2. **The Payment History table has no translation control.** Its seven column headers (Date / Document / Method / Reference / Recorded By / Amount / Balance) always render bilingually on a bilingual document, cramming `EN | AR` into narrow columns. Tenants want to suppress that translation to de-congest the statement, while keeping data values exactly as entered.

Both are scoped to the translation **labels/headings only** — data values are never translated (the invariant of the phase-2 framework).

## Non-goals

- The **Totals** box (Subtotal / VAT / Total / Amount Paid / Balance Due) and the **Line items** table headers are explicitly **out of scope** for the new toggle (line-item columns are already individually editable EN+AR in the Table tab). Only **Payment History** gains a toggle.
- No change to data-value rendering, RTL column mirroring, or the cascade/merge semantics.
- No DB/schema change (the policy lives in the template-config JSON cascade, as today).

## Approach

### Part 1 — Payment History becomes a translation group

Reuse the existing `translationPolicy` framework rather than inventing a parallel switch.

1. **Config type** (`src/lib/pdf/templateConfig.ts`): add `paymentHistory?: boolean;` to `TranslationPolicyGroups`. No other config change — cascade/merge already deep-merges `groups` by key.
2. **Engine union** (`src/lib/pdf/engine/labels.ts`): add `'paymentHistory'` to the `TranslationGroup` union. `fieldLabelsBilingual` / `fieldLabelLanguage` then accept it with no logic change (default `true` = bilingual).
3. **Renderer** (`src/lib/pdf/engine/sections/paymentHistory.ts`): resolve the **column header** labels through
   `fieldLabelLanguage(language, engine.config.translationPolicy, 'paymentHistory')`
   instead of the document `language`. When the tenant turns the toggle off on a bilingual doc, headers collapse to the primary language only.
   - The **section title** ("Payment History") stays on the full `language` (bilingual) — mirroring how every other data box keeps its bilingual title while suppressing the cramped field-row labels. The congestion is the column headers; this clears it.
   - RTL behavior is unchanged: `engineLayoutDirection(language)` still drives column order and alignment mirroring. Only the header **text** becomes single-language.

**Default-on ⇒ byte-identical today.** Absent policy / `mode: 'all'` ⇒ `fieldLabelLanguage` returns the original `language` ⇒ golden + parity output unchanged.

### Part 2 — Filter the custom per-block list to blocks present on the document

In `src/components/settings/documents/tabs/OtherDetailsTab.tsx`, replace the hardcoded six-entry array with a list filtered by the sections **actually present** in the resolved document (`api.resolved.sections`), via a `group → section-key` map:

| Translation group | Section key | Appears on |
|---|---|---|
| `parties` | `parties` | most documents |
| `meta` | `meta` | financial documents |
| `caseInfo` | `caseInfo` | intake / checkout / report / custody |
| `collector` | `collector` | **checkout_form only** |
| `payslip` | `payslipInfo` | payslip only |
| `diagnostics` | `diagnostics` | report only |
| `paymentHistory` | `paymentHistory` | invoice (financial base) |

The section list in `templateConfig.ts` already encodes what each document type contains, so deriving relevance from it is **self-maintaining** — there is no separate per-doc-type allow-list to drift.

Resulting custom list per document type:
- **invoice / quote:** Customer/party details, Document details, Payment history *(quote's paymentHistory renders nothing but the section is present; harmless — values untranslated either way)*
- **payment_receipt:** Customer/party details, Document details
- **office_receipt / customer_copy:** Customer/party details, Case information
- **checkout_form:** Customer/party details, Case information, Collector
- **payslip:** Payslip
- **report:** Case information, Diagnostics
- **chain_of_custody:** Case information
- **case_label / stock_label:** (no mapped blocks)

If the filtered list is empty for a document type, render a single muted hint ("No translatable blocks on this document type.") instead of an empty container.

### Rejected alternatives

- **Part 2 — hardcoded per-doc-type allow-list:** duplicates the section-set knowledge already in `templateConfig.ts`; drifts when sections are added/moved.
- **Part 2 — filter by *visible* sections:** hiding a section is orthogonal to translating it; a tenant may re-show it. "Present in the resolved config" is the stable signal.
- **Part 1 — a standalone boolean on the `paymentHistory` `SectionConfig`:** a second, parallel translation mechanism for a single section — inconsistent with the six existing groups and more surface area, for no gain.

## Components & data flow

```
templateConfig.ts   TranslationPolicyGroups.paymentHistory?  ─┐ (config contract)
labels.ts           TranslationGroup += 'paymentHistory'      ─┤
                    fieldLabelLanguage(language, policy, grp)  │ (pure resolver, unchanged logic)
paymentHistory.ts   headers → fieldLabelLanguage(..,'paymentHistory'); title → language
OtherDetailsTab.tsx group→section map, filter by api.resolved.sections; + paymentHistory row
```

No new module; every change is additive to a file that already owns that concern.

## Testing

- **Unit (engine):** extend `src/lib/pdf/engine/translationPolicy.test.ts` — on a bilingual-Arabic invoice, `custom { paymentHistory: false }` drops the Arabic from a Payment-History column header (e.g. the "Date" header's Arabic) while the section **title** Arabic is still present; `all` keeps the header Arabic.
- **Parity/goldens:** `invoiceParity.test.ts` + `buildersCharacterization.test.ts` unchanged (default-on).
- **UI sanity:** the custom list on an invoice shows exactly {Customer/party details, Document details, Payment history}; on a checkout form shows {Customer/party details, Case information, Collector}; the Payment-history toggle suppresses the column-header Arabic in the live preview.
- **CI gate:** `bash scripts/check-tsc.sh` → 0 errors.

## Files touched

- `src/lib/pdf/templateConfig.ts` — `TranslationPolicyGroups.paymentHistory?`
- `src/lib/pdf/engine/labels.ts` — `TranslationGroup` union += `'paymentHistory'`
- `src/lib/pdf/engine/sections/paymentHistory.ts` — apply `fieldLabelLanguage` to headers
- `src/components/settings/documents/tabs/OtherDetailsTab.tsx` — relevance filter + new row
- `src/lib/pdf/engine/translationPolicy.test.ts` — Payment-History case
- (`src/lib/pdf/templateConfig.test.ts` — optional: assert `paymentHistory` group merges)
