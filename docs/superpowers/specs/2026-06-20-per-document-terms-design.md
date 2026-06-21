# Per-Document-Type Terms & Conditions — Design

**Date:** 2026-06-20
**Status:** Approved

## Problem

Terms & Conditions differ by document type — a Quotation's terms ("valid 30 days, 50% advance") are never the Invoice's ("payment due 30 days, late fee"). The earlier design (#290) stored ONE tenant-wide `company_settings.legal_compliance.standard_terms_en/ar` applied to every document. That is a generic-CRM assumption and wrong for a data-recovery lab.

## Decision (approved)

T&C content lives **in the per-document-type template config**, edited in the **Template Studio**, bilingual, versioned. The template is **always authoritative** (no per-record override).

- **Where:** `document_template_versions.config.termsContent` — per doc type, so Quote vs Invoice are independent; versioned with the template; can vary per legal entity/business unit (the version row already scopes those).
- **Structure:** a **Terms** body and an optional **Notes** body, each with English + Arabic.
- **Edited:** Template Studio → Other Details → new "Terms & Conditions" group (4 textareas).
- **Rendered:** the `terms` section reads `config.termsContent` only. The tenant-wide `standard_terms_*` and the per-record document terms are no longer read.
- **No per-record override:** every document of a type shows that template's T&C.

## Data model

```ts
// templateConfig.ts
export interface TermsContentConfig {
  terms?: { en?: string; ar?: string };
  notes?: { en?: string; ar?: string };
}
// DocumentTemplateConfig.termsContent?: TermsContentConfig
// TemplateConfigOverride.termsContent?: TermsContentConfig (deep-merged by resolveTemplateConfig)
```

## Rendering (`renderTerms`)

- For each block (Terms, then Notes) with a non-empty English body: heading (from `labels.terms` / `labels.notes`, bilingual) + English body, plus the Arabic body on bilingual documents (right-aligned).
- The movable **Bank** coordination is preserved (inline within Terms when the bank section is hidden; standalone when enabled).
- Returns `null` when there is no T&C content and no inline bank.

## Studio

New "Terms & Conditions" `FieldGroup` in Other Details: Terms (EN), Terms (AR, RTL), Notes (EN), Notes (AR, RTL). Saved with the template via *Save & deploy* (so it is versioned). A new `StudioApi.setTermsContent` deep-merges into `override.termsContent`.

## Migration & cleanup

- **No data migration:** live data shows neither tenant has `standard_terms_*` set, so there is nothing to seed. Labs set per-template T&C in the Studio.
- **Remove** the "Standard Terms & Conditions" fields from Settings → General → Legal & Compliance (#290) and the `standard_terms_en/ar` keys from the `legal_compliance` type. `renderTerms` stops reading them.

## Transition

Per-record document terms stop rendering; a template whose T&C is empty shows no terms until set once in the Studio. No per-record fallback (it would reintroduce the inconsistency being removed).

## Testing

`renderTerms` (TDD): renders per-template Terms EN; Arabic on bilingual; Arabic omitted on English-only; renders Notes; returns null when empty; bank-coordination preserved (inline when hidden, omitted when the standalone bank section is visible).
