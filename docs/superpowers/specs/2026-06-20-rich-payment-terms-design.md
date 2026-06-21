# Rich Payment Terms — Design Spec

**Date:** 2026-06-20
**Status:** Draft (awaiting review)
**Area:** Templates, Invoicing, PDF engine

## Overview

Make payment-terms authoring and rendering rich, consistent, and template-driven:

1. **Invoice-from-quote (and every new invoice)** auto-fills Payment Terms from the
   **default `invoice_terms` template** — never from the quote's own terms.
2. **Template editor** becomes a **visual rich-text editor** (WYSIWYG) for all
   template types, so non-technical users stop editing raw HTML.
3. **Payment terms render with their styling** (colors, bold, lists, etc.) in a
   **live editor preview**, in the **invoice form**, and on the **invoice PDF**.

## Decisions (settled during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | How far does styled rendering reach? | **Form + preview + PDF** |
| 2 | Invoice-form Payment Terms behavior | **Styled read-only block with an "Edit" toggle** |
| 3 | When does the default template auto-fill? | **Every new invoice** (blank *and* from-quote) |
| 4 | Rich editor scope | **All template types, including email** |
| 5 | Bilingual (EN \| AR) rich terms on PDF | **Defer Arabic rich terms** (v1 = authored language only) |

## Goals

- A blank new invoice and a from-quote invoice both start with the default invoice
  terms, with `{{variables}}` resolved against real invoice/case/company data.
- Quote terms are never copied into an invoice.
- Template authors use a toolbar (bold, color, lists, links, image, basic table),
  not HTML.
- The terms a customer sees in the form match what prints on the PDF (authored
  language), styled.

## Non-goals (v1)

- Bilingual rich terms in the PDF's Arabic column (config terms remain there).
- Advanced visual table editing (merge/resize/row-delete UI) — use source mode.
- Images inside the **PDF** terms (rendered in form/preview; omitted on PDF v1).
- Changing how non-invoice documents (quote/receipt/payslip) source their PDF terms.

## Architecture — units & responsibilities

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `sanitizeHtml` (extend) | Allow `a`/`img`/`table` family + safe attrs; protocol allowlisting | DOMParser |
| `RichTextEditor` (extend) | `insertAtCursor()` imperative handle; Link/Image/Table toolbar buttons | `sanitizeHtml` |
| `LineItemTemplateFormModal` (edit) | Use `RichTextEditor` for **all** non-line-item types; wire `VariableInsertMenu` → `insertAtCursor`; keep unknown-var warning + sample-data preview | `RichTextEditor`, `templateEngine` |
| `applyDefaultInvoiceTerms` (new helper, `invoiceTermsService.ts`) | Resolve default `invoice_terms` template against an invoice context → sanitized HTML snapshot | `documentTemplatesService`, `templateContextService`, `templateEngine`, `sanitizeHtml` |
| `InvoiceFormModal` (edit) | Auto-apply default terms (new + from-quote); stop copying quote terms; styled read-only block + Edit toggle; store sanitized HTML (no `stripHtmlTags`) | `applyDefaultInvoiceTerms`, `RichTextEditor`, `sanitizeHtml` |
| `htmlToPdfmake` (new, `src/lib/pdf/htmlToPdfmake.ts`) | Map sanitize-allowlisted HTML → pdfmake `Content` (text runs, lists, headings, links, basic tables) | pdfmake interfaces |
| PDF `terms` section + `dataFetcher` + `invoiceAdapter` (edit) | Populate invoice terms from `terms` column; render per-record rich body (precedence for invoices) | `htmlToPdfmake` |

## Data flow

```
Template editor (RichTextEditor) ──save HTML──▶ document_templates.content
                                                      │ (default invoice_terms)
new / from-quote invoice opens                        ▼
InvoiceFormModal ── applyDefaultInvoiceTerms(ctx) ──▶ renderTemplate(resolve {{vars}})
                                                  ──▶ sanitizeHtml  ──▶ invoiceData.terms_and_conditions (HTML snapshot)
save ──▶ invoiceService maps terms_and_conditions ──▶ invoices.terms (text; now HTML)
PDF: dataFetcher reads invoices.terms ──▶ htmlToPdfmake ──▶ terms section (rich body, per-record)
```

Snapshot rationale: an invoice is a legal/financial record. Terms are resolved and
frozen at creation; later template edits do not mutate historical invoices.

## Part A — default-template behavior (`InvoiceFormModal`)

- On open of a **new** invoice (no `initialData`): call `applyDefaultInvoiceTerms`
  and set `terms_and_conditions` to the resolved, sanitized HTML.
- In `handleQuoteSelection`: **remove** `terms_and_conditions: quoteData.terms || …`.
  Re-apply the default template instead (selecting/clearing a quote re-applies).
- **Edit mode** (existing invoice): keep the saved `terms` (do not override).
- Variable resolution: `buildTemplateContext({ caseId, customerId, companyId, … })`
  → `renderTemplate(content, ctx)` (missing → blank, matching current behavior).

## Part B — visual editor for all templates (`LineItemTemplateFormModal`)

- Replace the raw `<textarea>` (non-line-item branch) with `RichTextEditor` for
  **all** types. Line-item type already uses it.
- `RichTextEditor` gains an imperative `insertAtCursor(text)` (via `forwardRef` +
  `useImperativeHandle`) using `document.execCommand('insertText', …)` so the
  existing **Insert variable** menu drops `{{tokens}}` at the caret.
- New toolbar controls:
  - **Link** — `createLink` (URL prompt; protocol allowlist; `rel="noopener noreferrer"`).
  - **Image** — `insertImage` by URL (alt prompt).
  - **Insert table** — inserts a basic editable table (cells `contentEditable`).
    Advanced table editing deferred to **source mode** (existing HTML toggle).
- Keep: unknown-variable warning, and a **live preview** rendering
  `sanitizeHtml(renderTemplate(content, SAMPLE_CONTEXT))`.

## Part C — invoice-form rendering (`InvoiceFormModal`)

- Payment Terms shows a **read-only styled block**:
  `dangerouslySetInnerHTML={{ __html: sanitizeHtml(terms_and_conditions) }}`
  with `prose` styling.
- An **Edit** button toggles to `RichTextEditor` for per-invoice tweaks; on change,
  store the sanitized HTML back to `terms_and_conditions`.
- **Remove** `stripHtmlTags` usage in `applyTermsTemplate` — store sanitized HTML.
- DB `terms` column is already `text` → **no migration**. Legacy plain-text terms
  render unchanged inside the prose block.

## Part D — PDF rich terms (`pdfmake`)

- **New** `htmlToPdfmake(html): Content[]` mapping the sanitize allowlist:
  - inline: `strong/b`, `em/i`, `u`, `s/strike`, `span[style]` (color,
    background→`background`), `a`→`{ text, link, color, decoration:'underline' }`
  - block: `p`/`div`→paragraph, `br`, `h1–h6`→sized-bold text
  - lists: `ul`→`{ ul: [...] }`, `ol`→`{ ol: [...] }`
  - `table`→`{ table: { body } }` (basic)
  - `img`→**omitted v1** (optionally alt text)
- `dataFetcher` invoice path: set the PDF terms body from `invoices.terms`.
- `engine/sections/terms.ts` + `invoiceAdapter`: when a per-record rich invoice
  terms body exists, render it (rich) **in place of** the config terms for invoices;
  fall back to config terms when absent. Other doc types unchanged.
- Bilingual: render authored language in the primary column; Arabic column keeps
  config terms (decision #5).

## Security (sanitizer hardening)

Widening the allowlist increases XSS surface; mitigations:

- `a[href]`: allow `http/https/mailto` only; strip `javascript:`/`data:`; force
  `rel="noopener noreferrer"`; allow `target` only `_blank`.
- `img[src]`: allow `http/https` and `data:image/*` only; allow `alt/width/height`.
- `table/thead/tbody/tr/th/td`: allow `colspan/rowspan` (numeric) + limited `style`.
- Keep existing `BLOCKED_VALUE_PATTERNS` for `style` (`url(`, `expression(`,
  `javascript:`, `@import`, `import(`).
- Unit tests for each new vector (script in href/src, `javascript:` URL, event
  handler attributes, style exfil).

## Storage & migration

- No schema change (`invoices.terms` is `text`; `document_templates.content` is text).
- Content format shifts plain-text → sanitized HTML for newly-saved terms; existing
  rows remain valid (rendered as text within prose).

## Testing

- **TDD**: `htmlToPdfmake` (table-driven cases per tag); `sanitizeHtml` new-vector
  tests; `applyDefaultInvoiceTerms` (default resolution + variable substitution).
- `InvoiceFormModal`: from-quote applies **default template, not quote terms**; new
  invoice auto-fills; Edit toggle round-trips HTML.
- `RichTextEditor`: `insertAtCursor`; link/image/table insertion sanitized.
- Update PDF **parity/golden snapshots** for the per-record invoice terms change
  (`terms.test.ts`, invoice parity, golden builders).

## Risks / limitations

- Part D **reverses** the deliberate "invoice PDF terms are per-template, not
  per-record" decision (see `engine/sections/terms.ts` header) — golden/parity
  tests change for invoices only.
- `contentEditable` + `execCommand` are legacy but already the editor's basis;
  table editing is intentionally minimal in v1.
- Images omitted from PDF terms v1.

## Phasing

- **Phase 1:** Parts A, B, C + `sanitizeHtml` hardening (visible authoring/form UX).
- **Phase 2:** Part D (PDF rich terms) + test updates.

## Open questions

None blocking. (Branch strategy for implementation to be confirmed with the user —
this feature is larger than and unrelated to the open PR #297.)
