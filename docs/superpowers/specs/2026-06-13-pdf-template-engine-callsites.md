# PDF Template Engine — Builder & Orchestrator Call-Site Map (M0)

> Companion to `2026-06-13-pdf-template-engine-design.md`. Read-only inventory produced
> at M0 so later milestones (M2 engine extraction, M5 roll-out) know **every** call-site
> that must be migrated when the 11 imperative builders are replaced by the
> `renderTemplate()` assembler. No DB writes, no source edits — additive doc only.

## 1. Builders (`src/lib/pdf/documents/`)

13 builder files on disk; **11 canonical document builders** (per spec §2) plus 1 net-new
builder (`CreditNoteDocument` — Phase 2, not yet orchestrated) and 1 test file.

| # | Document type | Builder file | Exported build fn | Orchestrator fn(s) |
|---|---------------|--------------|-------------------|--------------------|
| 1 | Office Receipt | `documents/OfficeReceiptDocument.ts` | `buildOfficeReceiptDocument` | `pdfService.generateOfficeReceipt`, `pdfService.generateOfficeReceiptAsBlob` |
| 2 | Customer Copy | `documents/CustomerCopyDocument.ts` | `buildCustomerCopyDocument` | `pdfService.generateCustomerCopy`, `pdfService.generateCustomerCopyAsBlob` |
| 3 | Checkout / Return Form | `documents/CheckoutFormDocument.ts` | `buildCheckoutFormDocument` | `pdfService.generateCheckoutForm`, `pdfService.generateCheckoutFormAsBlob` |
| 4 | Case Label | `documents/CaseLabelDocument.ts` | `buildCaseLabelDocument` | `pdfService.generateCaseLabel`, `pdfService.generateCaseLabelAsBlob` |
| 5 | Quote / Estimate | `documents/QuoteDocument.ts` | `buildQuoteDocument` | `pdfService.generateQuote`, `pdfService.generateQuoteAsBlob` |
| 6 | Invoice (Tax/Proforma) | `documents/InvoiceDocument.ts` | `buildInvoiceDocument` | `pdfService.generateInvoice`, `pdfService.generateInvoiceAsBlob` |
| 7 | Payment Receipt | `documents/PaymentReceiptDocument.ts` | `buildPaymentReceiptDocument` | `pdfService.generatePaymentReceipt`, `pdfService.generatePaymentReceiptAsBlob` |
| 8 | Payslip | `documents/PayslipDocument.ts` | `buildPayslipDocument` | `pdfService.generatePayslip`, `pdfService.generatePayslipAsBlob` |
| 9 | Chain of Custody | `documents/ChainOfCustodyDocument.ts` | `buildChainOfCustodyDocument` | `pdfService.generateChainOfCustody`, `pdfService.generateChainOfCustodyAsBlob` |
| 10 | Case Report (7–8 types) | `documents/ReportDocument.ts` | `buildReportDocument` | `reportPDFService.generateReportPDF`, `reportPDFService.generateReportAsBlob`, `reportPDFService.downloadReportPDF`, `reportPDFService.persistReportPDF` |
| 11 | Stock Label | `documents/StockLabelDocument.ts` | `buildStockLabelDocument` | **none** — built inline in the component (no orchestrator in `pdfService.ts`) |
| — | Credit Note (Phase 2) | `documents/CreditNoteDocument.ts` | `buildCreditNoteDocument` | **none** — only referenced by its own `.test.ts`; not yet wired to UI or `pdfService.ts` |

Notes:
- Builders 1–9 live in `pdfService.ts` (the primary orchestrator); builder 10 (Report) lives
  in the separate `reportPDFService.ts`; builder 11 (Stock Label) has **no** orchestrator
  function — `PrintLabelsModal.tsx` imports the builder directly and calls
  `createPdfWithFonts(...).getBlob/print` itself.
- `CreditNoteDocument` is net-new (Phase 2 scope); its only consumer today is the colocated
  unit test `CreditNoteDocument.test.ts`. Migrate it onto the engine when the Phase 2
  accounting family lands (spec §7), not in the M5 existing-docs roll-out.
- `DocumentType` union (`pdf/types.ts`) = 9 values (office_receipt, customer_copy,
  checkout_form, case_label, quote, invoice, payment_receipt, payslip, chain_of_custody).
  Report + Stock Label sit outside the union; that is why they have separate code paths.

## 2. Orchestrator functions → callers (`file:line`)

### 2a. `src/lib/pdf/pdfService.ts`

| Orchestrator fn | Direct caller (`file:line`) |
|-----------------|------------------------------|
| `generateOfficeReceipt` | `pages/print/PrintReceiptPage.tsx:23` (preview), `:39` (preview retry), `:50` (download) |
| `generateOfficeReceiptAsBlob` | via `generatePDFAsBlob` switch (`pdfService.ts:1063`) → `PDFPreviewModal.tsx:90` |
| `generateCustomerCopy` | `pages/print/PrintCustomerCopyPage.tsx:23`, `:39`, `:50` |
| `generateCustomerCopyAsBlob` | via `generatePDFAsBlob` switch (`pdfService.ts:1065`) → `PDFPreviewModal.tsx:90` |
| `generateCheckoutForm` | `pages/print/PrintCheckoutPage.tsx:23`, `:39`, `:50` |
| `generateCheckoutFormAsBlob` | via `generatePDFAsBlob` switch (`pdfService.ts:1067`) → `PDFPreviewModal.tsx:90` |
| `generateCaseLabel` | `pages/print/PrintLabelPage.tsx:23`, `:39`, `:50` |
| `generateCaseLabelAsBlob` | via `generatePDFAsBlob` switch (`pdfService.ts:1069`) → `PDFPreviewModal.tsx:90` |
| `generateQuote` | `lib/quotesService.ts:837` (wrapper `generateQuotePDF`) |
| `generateQuoteAsBlob` | `lib/quotesService.ts:842` (wrapper `generateQuotePDFBlob`); also `generatePDFAsBlob` switch (`pdfService.ts:1071`) |
| `generateInvoice` | `lib/invoiceService.ts:1032` (wrapper `generateInvoicePDF`) |
| `generateInvoiceAsBlob` | `lib/invoiceService.ts:1037` (wrapper `generateInvoicePDFBlob`); also `generatePDFAsBlob` switch (`pdfService.ts:1073`) |
| `generatePaymentReceipt` | `components/financial/PaymentReceiptModal.tsx:52`, `pages/portal/PortalPayments.tsx:108` |
| `generatePaymentReceiptAsBlob` | no external caller (defined, used only if wired) |
| `generatePayslip` | `pages/payroll/PayrollPeriodDetailPage.tsx:104` |
| `generatePayslipAsBlob` | no external caller (defined, used only if wired) |
| `generateChainOfCustody` | `components/cases/ChainOfCustodyTab.tsx:248` |
| `generateChainOfCustodyAsBlob` | no external caller (defined, used only if wired) |
| `generatePDF` (switch dispatcher) | no external caller found (dispatcher kept for parity with `generatePDFAsBlob`) |
| `generatePDFAsBlob` (switch dispatcher) | `components/cases/PDFPreviewModal.tsx:90` |

### 2b. Service wrappers (re-export pdfService fns) → callers

| Wrapper fn | File | Delegates to | Caller (`file:line`) |
|------------|------|--------------|----------------------|
| `generateQuotePDF` | `lib/quotesService.ts:836` | `pdfService.generateQuote` | `pages/quotes/QuoteDetailPage.tsx:131` |
| `generateQuotePDFBlob` | `lib/quotesService.ts:841` | `pdfService.generateQuoteAsBlob` | `lib/quotesService.ts:897` (bulk/send flow, same file) |
| `generateInvoicePDF` | `lib/invoiceService.ts:1031` | `pdfService.generateInvoice` | `pages/financial/InvoiceDetailPage.tsx:104` |
| `generateInvoicePDFBlob` | `lib/invoiceService.ts:1036` | `pdfService.generateInvoiceAsBlob` | `lib/invoiceService.ts:1102` (bulk/send flow, same file) |

### 2c. `src/lib/reportPDFService.ts`

| Orchestrator method | Caller (`file:line`) |
|---------------------|----------------------|
| `reportPDFService.generateReportPDF` | indirect via `downloadReportPDF` (no direct external caller) |
| `reportPDFService.generateReportAsBlob` | `components/cases/ReportViewModal.tsx:98` |
| `reportPDFService.downloadReportPDF` | `components/cases/ReportViewModal.tsx:119`, `pages/portal/PortalReports.tsx:99` |
| `reportPDFService.persistReportPDF` | `components/cases/ReportViewModal.tsx:188` (calls `generateReportAsBlob` internally, then Storage upload + stamp) |

### 2d. Stock Label (no orchestrator)

| Builder | Direct consumer (`file:line`) |
|---------|-------------------------------|
| `buildStockLabelDocument` | `components/stock/PrintLabelsModal.tsx:53` (imports builder + `createPdfWithFonts` directly at `:47–49`) |

## 3. Distinct caller sites (UI/page/service entry points that must keep working post-migration)

1. `components/financial/PaymentReceiptModal.tsx` — payment receipt (download)
2. `components/cases/ChainOfCustodyTab.tsx` — chain of custody (download)
3. `components/cases/PDFPreviewModal.tsx` — generic preview via `generatePDFAsBlob` (office_receipt, customer_copy, checkout_form, case_label, quote, invoice)
4. `components/cases/ReportViewModal.tsx` — report preview / download / persist-on-send
5. `components/stock/PrintLabelsModal.tsx` — stock label (direct builder, no orchestrator)
6. `pages/print/PrintReceiptPage.tsx` — office receipt print/preview surface
7. `pages/print/PrintCustomerCopyPage.tsx` — customer copy print/preview surface
8. `pages/print/PrintCheckoutPage.tsx` — checkout form print/preview surface
9. `pages/print/PrintLabelPage.tsx` — case label print/preview surface
10. `pages/quotes/QuoteDetailPage.tsx` — quote download (via `quotesService.generateQuotePDF`)
11. `pages/financial/InvoiceDetailPage.tsx` — invoice download (via `invoiceService.generateInvoicePDF`)
12. `pages/payroll/PayrollPeriodDetailPage.tsx` — payslip download
13. `pages/portal/PortalPayments.tsx` — portal payment receipt download
14. `pages/portal/PortalReports.tsx` — portal report download
15. `lib/quotesService.ts` (bulk/send flow, line 897) — internal blob generation for quotes
16. `lib/invoiceService.ts` (bulk/send flow, line 1102) — internal blob generation for invoices

**Service-layer indirection wrappers** (not UI, but must be preserved as the public service API):
`quotesService.generateQuotePDF` / `generateQuotePDFBlob`, `invoiceService.generateInvoicePDF` / `generateInvoicePDFBlob`.

## 4. Counts

- **Builders on disk:** 13 files (11 canonical document builders + 1 net-new `CreditNoteDocument` + 1 test file).
- **Canonical builders to migrate to the engine (M5):** 11 (incl. Report + Stock Label, which sit outside the `DocumentType` union).
- **Net-new builder deferred to Phase 2 (M8):** 1 (`CreditNoteDocument`).
- **Orchestrator functions:** 23 total — 19 in `pdfService.ts` (9 `generate*` + 9 `generate*AsBlob` + `generatePDF` + `generatePDFAsBlob` dispatchers) + 4 in `reportPDFService.ts`. Stock Label has 0.
- **Service wrapper functions:** 4 (`generateQuotePDF`, `generateQuotePDFBlob`, `generateInvoicePDF`, `generateInvoicePDFBlob`).
- **Distinct caller sites:** 16 (14 UI/page surfaces + 2 in-service bulk flows). Add the 4 service wrappers if counting the public service API surface as call-sites → 18 indirection points total.

## 5. Migration implications for later milestones

- The cleanest engine seam is the **builder boundary** (each `build*Document(...) → TDocumentDefinitions`):
  swap the 11 imperative builders for `renderTemplate(resolvedConfig, data, ctx)` while keeping the
  23 orchestrator signatures stable, so all 16 caller sites are untouched (lowest-risk path).
- **Stock Label is the one exception:** it has no orchestrator, so `PrintLabelsModal.tsx` reaches the
  builder directly. Either add a `generateStockLabel*` orchestrator during M2, or special-case it.
- **`CreditNoteDocument`** is already written but unwired; fold it into the engine at M8 alongside the
  rest of the Phase 2 accounting family rather than the M5 existing-docs roll-out.
- The `*AsBlob` variants for payment receipt / payslip / chain of custody are defined but currently
  have no external caller — safe to migrate but verify before assuming they are dead (e.g. future
  email-attachment flows may wire them).
