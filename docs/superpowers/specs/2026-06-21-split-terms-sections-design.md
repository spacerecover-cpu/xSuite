# Split the PDF terms area into two independent sections

**Date:** 2026-06-21
**Status:** Approved (design) — pending spec review

## Problem

On financial documents (quote / invoice / payment receipt) the PDF engine renders a
**single** `terms` section that conflates two different concepts:

- the **standard** Terms & Conditions set per document type in the PDF Studio
  (`config.termsContent`), and
- the **per-record** terms a user types on a specific quote/invoice (from the
  "Terms & Templates" picker), resolved by the adapter into `data.terms.blocks`.

Today the per-record terms **override** the standard, and when a record has none the
section **falls back** to the standard. That coupling is wrong for the business:

- The Studio "Terms & Conditions" should be a fixed, document-level block that is
  printed **only** when the tenant has filled it in — never replaced by, and never a
  fallback for, the per-record terms.
- The per-record terms ("Quote Terms" / "Invoice Terms") are a **separate** thing
  that should be its own section the tenant can show/hide, position, and rename in
  the Studio.

## Goal

Render the terms area as **two independent, positionable sections**, with the bank
box promoted to its own section.

## Design

### 1. `terms` — "Terms & Conditions" (standard, Studio-driven)

- Renders **only** `config.termsContent` (the Studio Terms & Conditions + Notes,
  EN/AR, centre-split on bilingual documents).
- **No per-record content, no fallback.**
- Returns `null` (section omitted entirely) when the Studio Terms **and** Notes are
  both empty — so an unset standard never prints.
- Unchanged Studio controls: show/hide, reorder, rename, and edit content
  (Other Details → Terms & Conditions).

### 2. `recordTerms` — "Quote Terms" / "Invoice Terms" (per-record, NEW)

- Renders **only** the per-record terms (`data.terms.blocks`) the user entered on the
  quote/invoice via Terms & Templates. Reuses the existing per-record renderer
  (HTML-entity decode + duplicate-heading suppression).
- Returns `null` when the record carries no terms.
- Single-language, full-width box (per-record content is captured in one language).
- **Heading:** defaults to "Quote Terms" (quotes) / "Invoice Terms" (invoices),
  renamable per document type via the section label.
- **New Studio provision:** appears in Other Details → Sections with show/hide,
  reorder (position), and rename. **No content editor** — the content is per-record.
- Default order: immediately after `terms` (both are reorderable).

### 3. Bank — own positionable section

- The inline bank box is **removed** from the terms renderer.
- The standalone `bank` section becomes **visible by default** (it already supports
  reorder + a Boxed | Single line style). Quote, invoice, and payment-receipt
  default configs each get a visible `bank` section so bank details still print.
- Result: Terms & Conditions, Quote/Invoice Terms, and Bank are three independent,
  reorderable sections.

### 4. Notes — follow their source

- Studio Notes render inside the standard `terms` section.
- Per-record Notes render inside the `recordTerms` section.

### 5. Duplicate-heading suppression (extended)

The per-record section prints its own "Quote Terms" heading, so a heading embedded
in the per-record content that repeats a **standard terms title** must not show
twice. Extend the existing de-dup so the leading-heading strip matches the section
heading **or** a known terms title ("Terms & Conditions", "Payment Terms",
"Quote Terms", "Invoice Terms"): a leading `<h1-6>` (rich HTML) or a matching first
line (plain text) is dropped.

## Affected code

- `src/lib/pdf/engine/sections/terms.ts` — simplify `renderTerms` to standard-only
  (drop per-record + fallback + inline bank); add `renderRecordTerms`.
- `src/lib/pdf/engine/sections/bank.ts` — unchanged builder; no longer called from
  terms.
- Section registry (assembler) — register `recordTerms` → `renderRecordTerms`.
- `src/lib/pdf/templateConfig.ts` — add `recordTerms` to financial doc-type section
  sets; flip `bank` to visible; keep `bankStyle`. Section-cascade already generic.
- `src/lib/pdf/engine/adapters/{quoteAdapter,invoiceAdapter,paymentReceiptAdapter}.ts`
  — the per-record terms block heading reads "Quote Terms"/"Invoice Terms"; ensure
  `data.terms` carries per-record only (already true).
- `src/components/settings/documents/tabs/OtherDetailsTab.tsx` — `recordTerms` label
  (doc-type aware) + guidance hint; section already lists from config.
- Section heading honors the Studio section label so "rename" works.

## Testing (TDD)

- `terms` renders Studio content only; omitted when Studio terms+notes empty;
  never shows per-record.
- `recordTerms` renders per-record content; omitted when absent; heading
  "Quote Terms"/"Invoice Terms"; de-dup strips a repeated standard heading.
- Bank renders as its own visible section for quote/invoice/payment-receipt; no
  longer inline in terms; Boxed/Single-line still honored.
- Config cascade carries the new section + bank visibility through overrides.
- Parity/golden suites stay green.

## Out of scope

- Form field labels — already shipped (#301: "Quote Terms"/"Invoice Terms",
  "Terms & Templates").
- Intake/checkout consent (`legalTerms`) — unaffected.

## Back-compat

- Flipping `bank` to visible: templates with no bank override inherit the new
  default (bank prints as its own section — visually ≈ today's inline box).
  Templates that explicitly hid the standalone bank keep it hidden (edge case;
  they previously relied on the inline box). No data migration.
