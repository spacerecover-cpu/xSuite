# Currency & Localization Leak Audit

**Date:** 2026-06-16  
**Method:** 15 parallel surface auditors → per-surface adversarial verification → synthesis (workflow `currency-localization-audit`, 27 agents).  
**Result:** 137 verified leaks → **113 distinct findings** after dedup. Severity: 47 critical / 33 high / 12 medium / 1 low.

## Executive summary

A currency/localization audit of xSuite surfaced 137 verified leaks; after deduplicating by file+line (the same PDF builder, adapter, service, and component lines were flagged independently by multiple surface reviews), they consolidate to 93 distinct findings. The defects cluster into five classes: 'USD'/'$' hardcoded fallbacks, direct reads of the legacy accounting_locales table in the PDF/document/service layer, formatters that bypass the Country Engine (raw toFixed/toLocaleString with hardcoded decimals and en-US/en-GB locales), date/locale inconsistencies, and a USD payroll default that even reaches the WPS/bank-file exports. User impact is severe and customer-/legally-visible: invoices, quotes, credit notes, payment receipts, payslips, and WPS bank files for any non-USD tenant (OMR, GBP, EUR, AED, JPY) render the wrong currency symbol, wrong decimal precision, and wrong number/date format — and the portal shows quote totals to customers with no currency indicator at all. The remediation is sequenced to de-risk: Phase 1 collapses the two sources of currency truth into one (repointing the core formatter and the entire PDF/document/service layer onto the resolved CurrencyConfig, killing every USD fallback); Phase 2 adds the tenant-overridable display_mode + negative_format feature to the registry, formatter, and CurrencyConfig; Phase 3 ships the Accounting Locales settings UI; Phase 4 propagates the canonical formatter to every remaining per-surface call site (POs, stock/inventory, portal, payroll dashboards, finance screens, date formatting).

## Root cause

There are two parallel sources of currency truth. The canonical one is the Country Engine: geo_countries → tenants config → TenantConfigContext, surfaced via useCurrencyConfig() and applied with formatCurrencyWithConfig(), which correctly honors symbol, ISO code, decimalPlaces, position, and locale separators. The legacy one is the accounting_locales table, read directly by the PDF/document layer (dataFetcher, document builders, engine adapters), the invoice/quote/financial/payroll services, and the useAccountingLocale hook — each with a '|| \"USD\"' fallback that silently fabricates USD whenever a row is missing, empty, or diverged from the Country Engine config. Compounding this, core helpers default the currency argument to 'USD' (format.ts formatCurrency, pdf/utils.ts), payroll seeds DEFAULT_PAYROLL_SETTINGS with USD/$, and a large number of surfaces never call the canonical formatter at all — they hand-roll currency with raw toFixed()/toLocaleString() using hardcoded decimal counts and en-US/en-GB/'default' locales, and hardcoded VAT labels and $ icons. The fix is to make the Country Engine resolved CurrencyConfig the single source: retire/repoint every accounting_locales read, remove all USD/$ defaults, add a tenant-overridable currency.display_mode (symbol | iso_code | symbol_code) and negative_format to the config registry, teach formatCurrencyWithConfig to honor them, and route every surface through that one formatter.

## Remediation phases

### Phase 1 — Single-source repoint: kill the USD fallbacks in the core + PDF/document/service layer (34 findings)
De-risk first by collapsing the two sources of currency truth into one. Make the Country Engine resolved CurrencyConfig the single source for the core formatter and every PDF builder, engine adapter, dataFetcher path, and service-layer read; remove every '|| USD' / ?? 'USD' / USD-$ default. This eliminates the highest-impact, customer- and legally-visible leaks (invoices, quotes, credit notes, payment receipts, payslips, WPS bank file) and the primary propagation vectors (format.ts and pdf/utils.ts defaults, payroll USD seed). Thread CurrencyConfig into builders/adapters as a parameter so downstream phases inherit the corrected path. The payroll WPS bank-file fix (CL-033) and the credit-note RPC stamp (CL-053) are included here because they corrupt persisted/bank-submitted data, not just display.
IDs: CL-001, CL-002, CL-004, CL-005, CL-006, CL-008, CL-009, CL-010, CL-012, CL-013, CL-014, CL-015, CL-016, CL-018, CL-019, CL-020, CL-021, CL-023, CL-024, CL-027, CL-028, CL-029, CL-030, CL-031, CL-032, CL-033, CL-034, CL-035, CL-036, CL-037, CL-053, CL-055, CL-067, CL-068

### Phase 2 — Display-mode / preference feature: registry keys + formatter + CurrencyConfig (3 findings)
With a single source in place, add the tenant-overridable feature: introduce currency.display_mode (symbol | iso_code | symbol_code) and negative_format to the config registry and the CurrencyConfig type, then teach formatCurrencyWithConfig to honor them (including thousands/decimal separators, position, and locale-aware Intl). This is the formatter-correctness work that the in-app financial-screen leaks depend on; fixing the canonical formatter and the multi-currency base-amount handling here means Phase 4 surfaces only need to call the one corrected function. Includes the financial-report formatter retirement and the TransactionsList base-amount fix that exercise the new formatter contract.
IDs: CL-003, CL-069, CL-070

### Phase 3 — Accounting Locales settings UI (2 findings)
Ship the tenant-facing settings surface that lets admins view/override the resolved currency display preferences (display_mode, negative_format, position) introduced in Phase 2, and that retires the legacy accounting_locales-backed configuration UX. This is sequenced after the formatter feature exists (so the UI has real keys to bind to) and after the core is single-sourced (so the UI configures the canonical config, not the legacy table). Captures the Payroll Settings form that surfaces and persists currency choices to the tenant — repoint its USD/$ defaults onto the new config-backed initial values.
IDs: CL-056, CL-057

### Phase 4 — Remaining per-surface propagation (74 findings)
Sweep every remaining per-surface call site onto the canonical formatter/date helpers now that the single source, the display-mode feature, and the settings UI are in place. This is the long tail of bypassed_country_engine, hardcoded_currency, and inconsistent_localization leaks across Purchase Orders, Stock/Inventory, the customer Portal quote surfaces, Payroll dashboards/history/loan modals, the Case Finances tab and Expenses, the printable invoice document, and date formatting on detail pages. Each is a mechanical replace-with-formatCurrencyWithConfig / formatDateWithConfig change; grouped last because none can regress the source of truth and they benefit from the corrected formatter shipped earlier. The portal customer-facing quote totals (currently bare numbers with no symbol) are the highest-priority items within this phase.
IDs: CL-007, CL-011, CL-017, CL-022, CL-025, CL-026, CL-038, CL-039, CL-040, CL-041, CL-042, CL-043, CL-044, CL-045, CL-046, CL-047, CL-048, CL-049, CL-050, CL-051, CL-052, CL-054, CL-058, CL-059, CL-060, CL-061, CL-062, CL-063, CL-064, CL-065, CL-066, CL-071, CL-072, CL-073, CL-074, CL-075, CL-076, CL-077, CL-078, CL-079, CL-080, CL-081, CL-082, CL-083, CL-084, CL-085, CL-086, CL-087, CL-088, CL-089, CL-090, CL-091, CL-092, CL-093, CL-094, CL-095, CL-096, CL-097, CL-098, CL-099, CL-100, CL-101, CL-102, CL-103, CL-104, CL-105, CL-106, CL-107, CL-108, CL-109, CL-110, CL-111, CL-112, CL-113

## Findings (by severity)

| ID | Sev | Phase | Class | File:Line | Impact | Fix |
|----|-----|-------|-------|-----------|--------|-----|
| CL-058 | critical | 4 | legacy_default_override | `src/components/cases/detail/CaseFinancesTab.tsx:207` | Quote totals on the Case Finances tab fall back to 'USD' for both symbol and ISO display when quote rows lack a persisted currency_symbol stamp; an OMR tenant sees 'USD 1,500' instead of 'OMR 1,500'. The hand-rolled formatCurrencyAmount also applies no thousands separator regardless of locale. (Merged from in-app, expenses, and portal-surface flags; severity escalated to critical.) | Remove per-row symbol/position/decimal_places from CaseQuoteRow and replace all formatCurrencyAmount call-sites with formatCurrencyWithConfig(quote.total_amount ?? 0, currencyConfig) from useCurrencyConfig() (or the canonical formatCurrency prop from CaseDetail). |
| CL-059 | critical | 4 | legacy_default_override | `src/components/cases/detail/CaseFinancesTab.tsx:328` | Invoice total on the Case Finances tab falls back to 'USD'/'after'/2dp when the invoice row lacks per-row currency fields; GBP or OMR tenants see the wrong currency on in-app invoice summaries (and any portal-visible invoice summary). (Lines 328/329 reference the same invoice-total block across surfaces; merged.) | Replace formatCurrencyAmount(invoice.total_amount, invoice.currency_symbol \|\| 'USD', ...) with formatCurrencyWithConfig(invoice.total_amount ?? 0, currencyConfig); remove per-row legacy symbol fields from CaseInvoiceRow. |
| CL-060 | critical | 4 | legacy_default_override | `src/components/cases/detail/CaseFinancesTab.tsx:337` | The 'Paid' sub-line amount on each invoice card falls back to 'USD' for the same reason as CL-059; lab staff see the wrong currency on the amount-paid line. | Replace with formatCurrencyWithConfig(invoice.amount_paid ?? 0, currencyConfig) from useCurrencyConfig(). |
| CL-061 | critical | 4 | legacy_default_override | `src/components/cases/detail/CaseFinancesTab.tsx:345` | The 'Balance' sub-line on each invoice card falls back to 'USD' for the same reason as CL-059; lab staff see the wrong currency on the balance-due line. | Replace with formatCurrencyWithConfig(invoice.balance_due ?? 0, currencyConfig) from useCurrencyConfig(). |
| CL-041 | critical | 4 | bypassed_country_engine | `src/components/documents/InvoiceDocument.tsx:268` | The printable HTML invoice preview (Invoice Value, subtotal, discount, tax, total, amount paid, balance due) uses bare symbol-concatenation with toFixed(); no thousands separator and symbol always prepended even when position is 'after'. An Omani 10,500.500 OMR invoice shows 'ر.ع.10500.500' with no comma and the symbol on the wrong side. | Accept a formatMoney prop bound to formatCurrencyWithConfig(amount, currencyConfig) and replace every symbol+toFixed() call; InvoiceDetailPage already has formatCurrency from useCurrency() to pass down. |
| CL-042 | critical | 4 | bypassed_country_engine | `src/components/documents/InvoiceDocument.tsx:305` | Each line item's unit price in the printable invoice is a bare template string with the same missing thousands-separator and position issues; affects every row on every printed invoice for tenants with position='after' or amounts above 999. | Use the same formatMoney() prop solution as CL-041. |
| CL-043 | critical | 4 | bypassed_country_engine | `src/components/documents/InvoiceDocument.tsx:308` | Line item totals have the same raw toFixed() bypass; additionally the client-side fallback recompute (quantity * unit_price) can introduce floating-point drift for 0/3-decimal currencies (JPY, OMR, KWD). Affects every row on every printed invoice. | Use formatMoney(item.line_total ?? item.quantity * item.unit_price) via the canonical helper prop. |
| CL-053 | critical | 1 | legacy_default_override | `src/components/financial/CreditNoteModal.tsx:86` | When the parent invoice has no stored currency, the credit note is initialized with 'USD' and stamped into credit_notes.currency via issue_credit_note; the credit note record (a legal instrument) is permanently written with the wrong currency, corrupting all downstream display, reporting, and PDF generation. useCurrency() is already imported (line 5) but unused at this call site. | Replace ?? 'USD' with the canonical currency code from the already-imported useCurrency() hook (resolved via useCurrencyConfig()). |
| CL-001 | critical | 1 | legacy_default_override | `src/lib/format.ts:120` | formatCurrency defaults the currency argument to 'USD'. This is the primary propagation vector: every call site that omits a currency (PDF adapters, modal formatters, payroll dashboards, service callers) silently renders USD on invoices, quotes, payslips, and receipts for non-USD tenants. | Remove the 'USD' default; require callers to pass the resolved CurrencyConfig.code from useCurrencyConfig(), or replace call sites with formatCurrencyWithConfig(amount, currencyConfig). |
| CL-034 | critical | 1 | legacy_accounting_locales | `src/lib/invoiceService.ts:859` | getInvoicesByCaseId() appends currency_symbol/position/decimal_places onto every invoice row from the legacy accounting_locales table; CaseFinancesTab consumes these. Any tenant whose legacy table has no default row or whose row disagrees with the Country Engine sees wrong currency formatting on all case-level invoice amounts. | Remove the accounting_locales secondary query; return raw invoice rows and let callers use useCurrencyConfig() / formatCurrencyWithConfig() (the invoices.currency column already carries the ISO code). |
| CL-035 | critical | 1 | legacy_default_override | `src/lib/invoiceService.ts:865` | When accounting_locales returns no default row (fresh tenant or unseeded legacy table), the fallback is the ASCII string 'USD' used as the currency symbol on invoices stored and displayed in CaseFinancesTab, regardless of the tenant's actual Country Engine currency. | Delete the entire accounting_locales fallback block (lines 858–873); currency display must come from useCurrencyConfig() in the component layer. |
| CL-030 | critical | 1 | hardcoded_currency | `src/lib/payrollService.ts:47` | DEFAULT_PAYROLL_SETTINGS seeds the fallback currency as USD/$. When the payroll_settings row has no currency key, all payroll calculations, payslip data, and bank-file exports use USD for every non-USD tenant. | Remove the hardcoded USD default object; resolve currency at call time from TenantConfigContext / useCurrencyConfig(), or inject CurrencyConfig into payroll calculation functions. |
| CL-033 | critical | 1 | hardcoded_currency | `src/lib/payrollService.ts:930` | generateWPSFileContent hardcodes 'USD' as the currency code in every WPS payment record. The WPS file is a bank-submission document; a lab operating in OMR submits a file declaring USD for every salary transfer, causing real payment rejections at the bank. | Accept the tenant's resolved currency code (from TenantConfigContext or as a parameter) and replace the literal 'USD' in the array join with that value. |
| CL-004 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/dataFetcher.ts:152` | toLocale() builds the currency block embedded in every QuoteData/InvoiceData/PaymentReceiptData/PayslipData struct passed to PDF builders. A missing or empty accounting_locales row makes every generated PDF show 'USD' regardless of tenant currency. | Replace toLocale() with a function that accepts a resolved CurrencyConfig and maps it to the PDF currency block, eliminating the accounting_locales dependency and the 'USD' fallback. |
| CL-006 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/dataFetcher.ts:649` | fetchCreditNoteData() pulls currency symbol, position, and decimals from accounting_locales rather than the Country Engine; a tenant whose config diverges, or who has no active default row, gets a credit note PDF with wrong or missing currency formatting on the legal document the customer sees. | Remove the accounting_locales query from fetchCreditNoteData; resolve currency via the Country Engine and pass it as a CurrencyConfig matching the canonical useCurrencyConfig() path. |
| CL-005 | critical | 1 | legacy_default_override | `src/lib/pdf/dataFetcher.ts:681` | The credit-note assembler falls back to 'USD' when the accounting_locales join returns no row. A credit note (a legal financial document) for a non-USD tenant displays 'USD'. | Pass the tenant's resolved CurrencyConfig.symbol into the credit-note assembler instead of reading accounting_locales; remove the fallback when that query is removed. |
| CL-015 | critical | 1 | legacy_default_override | `src/lib/pdf/documents/CreditNoteDocument.ts:39` | Credit note PDFs (legal financial documents) show 'USD' when currency_symbol is empty/absent. This is a second USD fallback layer on top of the data fetcher's own, compounding the risk on the document the customer receives. | Replace cn.currency_symbol with a fully-resolved CurrencyConfig passed into the builder; use currencyConfig.symbol directly and never supply a currency fallback. |
| CL-016 | critical | 1 | bypassed_country_engine | `src/lib/pdf/documents/CreditNoteDocument.ts:40` | The builder rolls its own formatCurrency with raw toFixed() and template-string concatenation, bypassing formatCurrencyWithConfig() entirely; thousands/decimal separators and symbol-spacing from the tenant's CurrencyConfig are lost on the credit note PDF. | Remove the local formatCurrency closure; accept a CurrencyConfig and call formatCurrencyWithConfig(amount, currencyConfig) from src/lib/format.ts. |
| CL-008 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/InvoiceDocument.ts:173` | The invoice PDF builder falls back to 'USD' when the accounting_locales struct is absent; non-USD tenants receive legally significant invoices with the wrong currency symbol. | Source currencySymbol from a CurrencyConfig field present in InvoiceData; remove the accounting_locales dependency from this builder. |
| CL-010 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/PaymentReceiptDocument.ts:166` | Every payment receipt PDF reads symbol, decimals, and position from accounting_locales with a 'USD' fallback and a hand-rolled formatter; an Omani tenant with an absent/stale row sees 'USD' (wrong symbol, wrong position) on the customer-facing legal receipt. | Accept a CurrencyConfig from the canonical Country Engine path and replace all three accounting_locales reads and the hand-rolled formatCurrencyValue closure with formatCurrencyWithConfig(amount, currencyConfig). |
| CL-012 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/PayslipDocument.ts:15` | Every payslip PDF reads its currency symbol from the legacy accounting_locales row with a 'USD' fallback instead of the canonical CurrencyConfig; a non-USD tenant sees a wrong or USD symbol on every printed payslip — a legal payroll document delivered to employees. | Pass CurrencyConfig into PayslipDocumentData; use currencyConfig.symbol directly and remove the \|\| 'USD' fallback (emit '' on missing data, matching canonical fail-loud behaviour). |
| CL-013 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/PayslipDocument.ts:16` | Decimal precision on every payslip money amount comes from the legacy accounting_locales row; if it diverges from the Country Engine (OMR=3, JPY=0), every payslip amount prints with wrong precision. | Replace with decimalPlaces = data.currencyConfig?.decimalPlaces ?? 2 sourced from the canonical CurrencyConfig. |
| CL-014 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/PayslipDocument.ts:17` | Currency position on payslips is read from accounting_locales; for tenants where the symbol precedes the amount (GBP '£100') the payslip prints '100 £' instead. | Replace with currencyPosition = data.currencyConfig?.position ?? 'before' using canonical CurrencyConfig. |
| CL-009 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/documents/QuoteDocument.ts:170` | Quote PDFs shown to customers display 'USD' when accounting_locales is missing; a customer in Oman receiving a quote sees USD instead of OMR. | Source currencySymbol from resolved CurrencyConfig passed through QuoteData; remove the accounting_locales struct from the quote builder. |
| CL-018 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/invoiceAdapter.ts:76` | The template-engine invoice adapter reads accounting_locales for symbol, decimals, and position with a 'USD' fallback; every PDF invoice rendered through the engine displays the wrong currency for any non-USD tenant whose legacy row is missing or stale. | Add a currencyConfig: CurrencyConfig parameter to toEngineData() sourced from the Country Engine; replace all three accounting_locales reads with currencyConfig.symbol/decimalPlaces/position. |
| CL-019 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/invoiceAdapter.ts:183` | Amount-in-words on PDF invoices passes the accounting_locales-derived currencySymbol into the English and Arabic word renderers; an OMR tenant with no accounting_locales row gets 'One Thousand USD' spelled out on a legal invoice PDF. | Once accounting_locales is replaced (CL-018), pass currencyConfig.code (ISO code, unambiguous for word rendering) to amountInWordsEn/Ar. |
| CL-024 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/paymentReceiptAdapter.ts:43` | The template-engine payment receipt adapter has the identical legacy leak; any tenant using the DocumentTemplateConfig render path gets wrong symbol/position on all totals including the prominent 'Amount Paid' total. | Add a CurrencyConfig parameter to toEngineData() and replace the three accounting_locales reads and the money() closure with formatCurrencyWithConfig(amount, currencyConfig). |
| CL-027 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/payslipAdapter.ts:48` | The template-engine payslip adapter replicates the accounting_locales read with a 'USD' fallback; all earnings/deductions/netPay strings carry the wrong symbol for non-USD tenants on the engine render path used by the newer template engine. | Accept CurrencyConfig alongside DocumentTemplateConfig and replace with currencySymbol = currencyConfig?.symbol ?? '' (drop the \|\| 'USD' fallback). |
| CL-028 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/payslipAdapter.ts:49` | Decimal places for all engine-path payslip money lines come from accounting_locales, not the Country Engine; OMR tenants see 2 decimals instead of 3 on every earnings, deduction, and net salary line. | Replace with currencyConfig?.decimalPlaces ?? 2 from the canonical CurrencyConfig passed into the adapter. |
| CL-029 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/payslipAdapter.ts:50` | Currency position for engine-rendered payslip money values reads accounting_locales; a GBP tenant sees '100 £' instead of '£ 100' on earnings, deductions, and net salary lines. | Replace with currencyConfig?.position ?? 'before' from canonical CurrencyConfig. |
| CL-020 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/quoteAdapter.ts:67` | The QUOTATION PDF sent to the customer formats all amounts from legacy accounting_locales fields with a 'USD' fallback; an Omani tenant (OMR, 3 decimals) receives a legally incorrect customer-facing PDF showing 'USD' with 2-decimal amounts. | Pass the tenant's CurrencyConfig into the adapter; replace the accounting_locales reads with currencyConfig.symbol/decimalPlaces/position and use formatCurrencyWithConfig. |
| CL-021 | critical | 1 | bypassed_country_engine | `src/lib/pdf/engine/adapters/quoteAdapter.ts:71` | The money() closure uses raw toFixed() (no thousands separator) and plain template-string symbol placement, ignoring the tenant's separators and the canonical formatter; customer-facing QUOTATION PDF totals are formatted incorrectly for any non-default locale. | Replace the local money() closure with formatCurrencyWithConfig(amount, currencyConfig) from src/lib/format.ts. |
| CL-023 | critical | 1 | legacy_accounting_locales | `src/lib/pdf/engine/adapters/quoteAdapter.ts:164` | Amount-in-words on the QUOTATION PDF uses currencySymbol/decimalPlaces from the legacy accounting_locales path; an OMR tenant sees 'USD' in the written-out amount on a customer-facing legal document. | Once the adapter sources CurrencyConfig from the Country Engine (CL-020), pass currencyConfig.symbol and currencyConfig.decimalPlaces here. |
| CL-037 | critical | 1 | legacy_default_override | `src/lib/quotesService.ts:818` | If accounting_locales has no default row, the symbol falls back to the literal 'USD', so all per-case quote amounts in CaseFinancesTab show 'USD' regardless of the tenant's actual currency. (Severity escalated to critical: same leak path as the invoice symbol fallback feeding the case finances surface.) | Delete this fallback along with the accounting_locales query; source the symbol from the canonical CurrencyConfig (useCurrencyConfig / TenantConfigContext). |
| CL-105 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalDashboard.tsx:231` | Quote totals on the customer-facing Portal Dashboard use the browser's system locale with no currency symbol or ISO code; a customer of an Omani lab sees '1,500' with no OMR indicator — legally ambiguous on a customer-visible financial surface. | Inject useCurrencyConfig() and render with formatCurrencyWithConfig(Number(quote.total_amount), currencyConfig). |
| CL-054 | critical | 4 | hardcoded_currency | `src/pages/portal/PortalPurchasesPage.tsx:13` | The customer portal purchases page formats all amounts with hardcoded USD and en-US locale; customers of non-USD tenants (OMR, GBP, EUR) see all purchase amounts in USD with US number formatting — a direct customer-visible incorrect currency display. | Replace with formatCurrencyWithConfig(amount, currencyConfig) where currencyConfig comes from useCurrencyConfig() (or the portal equivalent in PortalAuthContext). |
| CL-106 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:253` | Quote total in the pending-quotes list card on the Portal Quotes page: bare number with browser locale, no symbol or ISO code; the customer cannot identify the currency of a quote they are being asked to approve. | Use formatCurrencyWithConfig(Number(quote.total_amount), currencyConfig) from useCurrencyConfig(). |
| CL-107 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:307` | Quote total in the approved/processed quotes list card: same browser-locale bare-number issue as CL-106; the customer viewing quote history sees no currency context. | Use formatCurrencyWithConfig(Number(quote.total_amount), currencyConfig) from useCurrencyConfig(). |
| CL-108 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:378` | Unit price per line item in the Quote Detail modal shown to the customer: bare number with browser locale, no symbol; on a legally-significant approval modal the customer cannot identify each line item's currency. | Use formatCurrencyWithConfig(Number(item.unit_price), currencyConfig) from useCurrencyConfig(). |
| CL-109 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:381` | Line item total in the Quote Detail modal: same bare-number/browser-locale issue as CL-108. | Use formatCurrencyWithConfig(Number(item.total_price), currencyConfig) from useCurrencyConfig(). |
| CL-110 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:392` | Subtotal row in the Quote Detail modal footer: bare number, no symbol or ISO code; the customer cannot verify the subtotal currency before approving. | Use formatCurrencyWithConfig(Number(selectedQuote.subtotal), currencyConfig) from useCurrencyConfig(). |
| CL-111 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:401` | Discount row in the Quote Detail modal footer: bare number with browser locale and no symbol; tenant-configured locale and decimal rules are bypassed. | Use formatCurrencyWithConfig(Number(selectedQuote.discount_amount), currencyConfig) and prepend '-' outside the formatted string. |
| CL-112 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:411` | Tax row in the Quote Detail modal footer: bare number with browser locale, no symbol; for a VAT-registered Omani tenant the customer cannot tell if the tax figure is OMR or another currency. | Use formatCurrencyWithConfig(Number(selectedQuote.tax_amount), currencyConfig) from useCurrencyConfig(). |
| CL-113 | critical | 4 | bypassed_country_engine | `src/pages/portal/PortalQuotes.tsx:420` | Grand total row in the Quote Detail modal footer — the most prominent figure a customer sees before approving or rejecting a quote: bare number with browser locale, no symbol or ISO code. Legally ambiguous on a customer-approval surface. | Use formatCurrencyWithConfig(Number(selectedQuote.total_amount), currencyConfig) from useCurrencyConfig(). |
| CL-095 | critical | 4 | bypassed_country_engine | `src/pages/stock/StockSaleDetailPage.tsx:39` | The Stock Sale Detail page is the per-sale financial record; unit price, discount, tax, line total, subtotal, and grand total all flow through this 3-decimal toLocaleString helper. A GBP tenant sees no £ and wrong separators; a JPY tenant sees three spurious decimals on every money line of a financial document surface. | Remove the local helper; introduce useCurrency() and use formatCurrency() for all money columns. |
| CL-064 | high | 4 | legacy_accounting_locales | `src/components/banking/RecordReceiptModal.tsx:10` | RecordReceiptModal sources its currency formatter from the legacy useAccountingLocale hook (reads accounting_locales); all amounts — received, applied, unapplied, outstanding, invoice totals, allocation buttons — display the wrong symbol/format for tenants whose legacy row is absent or stale. | Replace useAccountingLocale with useCurrencyConfig() and formatCurrencyWithConfig(amount, currencyConfig), matching the canonical path used by RecordPaymentModal. |
| CL-038 | high | 4 | legacy_default_override | `src/components/cases/InvoiceFormModal.tsx:424` | The invoice creation/edit modal falls back to 'USD' when both invoiceData.currency and baseCurrency are unresolved (async window or misconfigured tenant); the Summary panel and discount label pass docCurrency into formatCurrency(), so amounts display as USD and invoices can be created/stored with USD. | Derive baseCurrency from useCurrencyConfig().code so the 'USD' terminal fallback is unreachable; remove it. |
| CL-039 | high | 4 | bypassed_country_engine | `src/components/cases/InvoiceFormModal.tsx:697` | The quote-picker dropdown renders each quote total as symbol + toFixed(2); decimals are hardcoded to 2 (breaking OMR 3dp, JPY 0dp), there is no thousands separator and no position logic. Symbol is canonical, only number formatting is wrong. | Replace with formatCurrency(quote.total_amount ?? 0) using the useCurrency() hook already destructured at line 103. |
| CL-040 | high | 4 | bypassed_country_engine | `src/components/cases/InvoiceFormModal.tsx:1088` | The Quick-Add catalog panel shows each item's price as symbol + toFixed(2); same decimals/separator/position issues — a technician adding an OMR service item sees the wrong precision. | Replace with formatCurrency(item.default_price ?? 0) using the canonical formatCurrency from useCurrency() at line 103. |
| CL-049 | high | 4 | legacy_default_override | `src/components/cases/QuoteFormModal.tsx:346` | Quote creation/edit modal falls back to 'USD'; customer-facing quotes may be created and sent with USD if baseCurrency is not yet resolved at render time. | Derive baseCurrency from useCurrencyConfig().code; remove the 'USD' terminal fallback. |
| CL-062 | high | 4 | bypassed_country_engine | `src/components/cases/detail/CaseFinancesTab.tsx:497` | The Case Expenses panel renders expense amounts with a raw toFixed(2) — no currency symbol, no thousands separator, hardcoded 2 decimals; OMR tenants (3dp) see wrong precision and no currency indicator on every expense amount. | Replace expense.amount?.toFixed(2) with formatCurrencyWithConfig(expense.amount ?? 0, currencyConfig) from useCurrencyConfig() (or the formatCurrency prop already on CaseFinancesTab). |
| CL-099 | high | 4 | bypassed_country_engine | `src/components/stock/QuickSaleWidget.tsx:28` | The Quick Sale widget formats all displayed money values (price, total) with fixed 2-decimal toLocaleString; wrong decimals for 3-decimal currencies and no symbol shown to staff. | Use useCurrency().formatCurrency() instead of the local helper. |
| CL-098 | high | 4 | bypassed_country_engine | `src/components/stock/SaleableItemsGrid.tsx:18` | The saleable items product picker shown during POS sale entry displays selling prices with hardcoded 2 decimals and no symbol; staff at an OMR lab see truncated prices with no currency indicator. | Use useCurrency().formatCurrency() for price display in the grid. |
| CL-100 | high | 4 | bypassed_country_engine | `src/components/stock/StockItemsTable.tsx:61` | The shared StockItemsTable formats cost and selling price with an asymmetric min-2/max-3 decimal toLocaleString that matches no tenant's currency config; as the primary price display across all stock list views, tenants see inconsistent decimal counts, wrong separators, and no symbol on every price column. | Use useCurrency().formatCurrency() in the table for all money cell rendering. |
| CL-097 | high | 4 | bypassed_country_engine | `src/components/stock/StockSaleModal.tsx:313` | The Stock Sale modal where staff record a POS sale formats line totals, subtotal, tax, and grand total with fixed 2-decimal toLocaleString; an OMR lab sees truncated amounts during sale entry, risking input errors, with no currency symbol shown. | Use useCurrency().formatCurrency() for all money display in the modal. |
| CL-096 | high | 4 | bypassed_country_engine | `src/components/stock/StockSalesTable.tsx:35` | The shared Stock Sales table formats all money columns with a hardcoded 2-decimal toLocaleString; OMR/KWD/BHD tenants (3dp) see truncated amounts, JPY tenants see spurious decimals, and no symbol is shown. Used on StockSalesPage. | Convert the local formatAmount helper to use useCurrency().formatCurrency(). |
| CL-067 | high | 1 | legacy_accounting_locales | `src/lib/financialService.ts:80` | fetchDefaultLocale() reads the legacy accounting_locales table; confirmed caller VATAuditPage.tsx (line 204) renders currency from the legacy table, so an Oman (OMR) tenant with a stale/absent row sees the wrong symbol or a USD fallback on the VAT audit screen. | Delete fetchDefaultLocale() and replace the VATAuditPage caller (and any future callers) with useCurrencyConfig() / useTenantConfig(), then format with formatCurrencyWithConfig(amount, currencyConfig). |
| CL-068 | high | 1 | bypassed_country_engine | `src/lib/financialService.ts:209` | formatCurrencyWithLocale accepts a legacy AccountingLocale, applies toLocaleString('en-US') for thousands and reads locale.currency_symbol from the legacy table; any financial screen calling it shows wrong separators for non-US tenants and a legacy-sourced symbol. | Delete formatCurrencyWithLocale() and replace all callers with formatCurrencyWithConfig(amount, currencyConfig) sourcing currencyConfig from useCurrencyConfig(). |
| CL-002 | high | 1 | legacy_accounting_locales | `src/lib/format.ts:37` | fetchCurrencyFormat() reads accounting_locales instead of the Country Engine config; any caller on this path gets currency data from a legacy table that may be stale or diverged from the canonical geo_countries-derived config. | Delete fetchCurrencyFormat() and formatCurrencyWithSettings(); callers receive CurrencyConfig from useCurrencyConfig() / TenantConfigContext and call formatCurrencyWithConfig directly. |
| CL-031 | high | 1 | legacy_default_override | `src/lib/payrollService.ts:79` | When the payroll_settings JSONB has no currency.code, parsePayrollSettings falls back to 'USD' via DEFAULT_PAYROLL_SETTINGS; this leaks into the WPS bank file export and any caller reading settings.currency.code for display. | Remove the currency field from DEFAULT_PAYROLL_SETTINGS and parsePayrollSettings; callers source currency from TenantConfigContext. |
| CL-032 | high | 1 | legacy_default_override | `src/lib/payrollService.ts:80` | Currency symbol defaults to '$' when absent from the payroll_settings JSONB; this leaked symbol can reach any UI or document consuming parsePayrollSettings output. | Remove symbol from DEFAULT_PAYROLL_SETTINGS and parsePayrollSettings; use useCurrencyConfig().symbol in the UI. |
| CL-017 | high | 4 | inconsistent_localization | `src/lib/pdf/documents/CreditNoteDocument.ts:208` | The tax label is hardcoded 'VAT' on the credit note PDF regardless of the tenant's statutory tax system; GST/Sales Tax jurisdictions (Australia, India, Canada, US) issue credit notes — legal documents — with the wrong tax label, including the bilingual Arabic branch. | Accept a TaxConfig (or taxLabel string) from useTaxConfig() / the Country Engine and use taxConfig.label in place of the hardcoded 'VAT'. |
| CL-025 | high | 4 | bypassed_country_engine | `src/lib/pdf/engine/adapters/paymentReceiptAdapter.ts:127` | The QR-code payload embeds the amount via the same broken money() formatter (accounting_locales/'USD' fallback); a scanner reading the QR on a non-USD tenant receipt sees the wrong currency embedded. | Once the adapter's CurrencyConfig parameter is added (CL-024), the qrPayload line automatically picks up the corrected formatter. |
| CL-055 | high | 1 | legacy_default_override | `src/lib/pdf/utils.ts:21` | PDF utility formatCurrency defaults currencyCode to 'USD'; any PDF helper call that omits a currency produces USD-formatted output on legal financial documents for non-USD tenants. | Remove the default value; require callers to pass the resolved CurrencyConfig.code explicitly. |
| CL-036 | high | 1 | legacy_accounting_locales | `src/lib/quotesService.ts:811` | CaseFinancesTab receives quote rows annotated with currency_symbol/position/decimal_places from the legacy accounting_locales table rather than the Country Engine; an OMR tenant sees the wrong symbol and 2 decimal places in the case finances panel. | Remove the accounting_locales query; callers obtain CurrencyConfig via useCurrencyConfig() and apply formatCurrencyWithConfig() in the component layer. |
| CL-070 | high | 2 | bypassed_country_engine | `src/pages/financial/TransactionsList.tsx:450` | Per-row amounts use the canonical formatCurrency (correct symbol) but applied to transaction.amount (document currency) rather than the base-currency amount; on a multi-currency tenant (a USD invoice on an OMR-base tenant) the row shows the raw USD figure formatted with the OMR symbol — a materially wrong figure on the in-app ledger. Stats cards (lines 173–174) already call baseAmount(). | Replace transaction.amount with baseAmount(transaction as unknown as Record<string, unknown>, 'amount') at line 450, consistent with the stats cards. |
| CL-080 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollDashboard.tsx:83` | formatCurrency is imported directly from src/lib/format.ts (default 'USD'); the Total Payroll stat card always displays USD-formatted amounts regardless of tenant currency. | Replace the bare formatCurrency import with const { formatCurrency } = useCurrency(); and use that in JSX. |
| CL-081 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollDashboard.tsx:187` | Average Salary in the Summary panel uses bare formatCurrency() defaulting to USD; an OMR tenant's average salary is displayed in USD. | Switch to the useCurrency() hook's formatCurrency, same as CL-080. |
| CL-082 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollDashboard.tsx:262` | Total Payroll column in the Recent Payroll Periods table uses bare formatCurrency() defaulting to USD; all period totals display in USD regardless of tenant currency. | Switch to the useCurrency() hook's formatCurrency. |
| CL-084 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollHistoryPage.tsx:120` | Gross column in the Payroll History table uses bare formatCurrency() defaulting to USD; historical gross totals display in USD for all tenants. | Import useCurrency() and use its formatCurrency. |
| CL-085 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollHistoryPage.tsx:124` | Deductions column in Payroll History shows USD-formatted amounts for all tenants regardless of actual currency. | Switch to the useCurrency() hook's formatCurrency. |
| CL-086 | high | 4 | bypassed_country_engine | `src/pages/payroll/PayrollHistoryPage.tsx:126` | Net Payroll column in Payroll History shows USD-formatted amounts; an Oman lab's historical payroll totals display as USD in the history list. | Switch to the useCurrency() hook's formatCurrency. |
| CL-056 | high | 3 | legacy_default_override | `src/pages/payroll/PayrollSettingsPage.tsx:51` | The Payroll Settings form initializes and displays 'USD' when settings has no currency code; a manager configuring payroll on an OMR tenant sees USD pre-populated and may save it, persisting USD as the payroll currency. | Initialize from useCurrencyConfig().code: currency_code: settings?.currency?.code \|\| tenantCurrency.code. |
| CL-057 | high | 3 | legacy_default_override | `src/pages/payroll/PayrollSettingsPage.tsx:52` | Currency symbol defaults to '$' in the Payroll Settings form on first load; an OMR tenant manager opening settings for the first time sees '$' pre-filled. | Initialize from useCurrencyConfig().symbol: currency_symbol: settings?.currency?.symbol \|\| tenantCurrency.symbol. |
| CL-051 | high | 4 | bypassed_country_engine | `src/pages/quotes/QuotesListPage.tsx:765` | When a quote is edited, line-item totals are rounded to exactly 2 decimals regardless of tenant currency (OMR=3, JPY=0); persisted quote_items.total is wrong for those tenants and downstream invoice conversion carries the incorrect amounts. | Replace inline Math.round(...*100)/100 with roundMoney(item.quantity * item.unit_price, documentDecimals) from financialMath.ts, where documentDecimals = getCurrencyDecimals(tenantCurrency). |
| CL-052 | high | 4 | bypassed_country_engine | `src/pages/quotes/QuotesListPage.tsx:820` | Same 2-decimal rounding bug as CL-051 in the create (insert) path; new quote line-item totals persist with incorrect precision for OMR/JPY tenants, causing subtotal/total_amount drift versus a correctly-calculated invoice. | Same fix as CL-051: roundMoney(item.quantity * item.unit_price, documentDecimals) from financialMath.ts. |
| CL-093 | high | 4 | bypassed_country_engine | `src/pages/stock/StockListPage.tsx:58` | Cost price and selling price columns on the main Stock List page use a hardcoded 3-decimal toLocaleString; JPY tenants see spurious decimals, EUR tenants get wrong separators, and no symbol is shown so the currency is unidentifiable at a glance. | Remove the local helper; import useCurrency() and use its formatCurrency() (backed by formatCurrencyWithConfig) wherever this helper is called. |
| CL-101 | high | 4 | bypassed_country_engine | `src/pages/stock/StockReportsPage.tsx:147` | The CSV export of the stock valuation report writes cost and sell values with hardcoded .toFixed(3), ignoring tenant decimal config; a JPY tenant's export contains spurious .000 on every row and a USD tenant gets 3 decimals instead of 2 on a file used for accounting reconciliation. | Use the tenant's currency.decimalPlaces (from useCurrencyConfig()) as the toFixed argument when building CSV rows. |
| CL-094 | high | 4 | bypassed_country_engine | `src/pages/stock/StockSalesPage.tsx:25` | Today's revenue and month revenue KPI cards on the Stock Sales page use a hardcoded 3-decimal helper; no symbol is shown and decimals/separators ignore tenant config. | Remove the local helper; use useCurrency().formatCurrency() for all money KPI cards. |
| CL-071 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:223` | Unit price column in the PO line-items table renders a literal '$' prefix with toFixed(2), hardcoding both the USD symbol and 2 decimals; an Omani tenant (OMR, 3dp) sees the wrong symbol and decimal count. | Import useCurrencyConfig() and formatCurrencyWithConfig(); replace with {formatCurrencyWithConfig(item.unit_price ?? 0, currencyConfig)}. |
| CL-072 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:226` | Line-item total column uses the same literal '$' prefix and toFixed(2); every row shows the wrong currency symbol and decimal precision for non-USD tenants. | Replace with formatCurrencyWithConfig(item.total ?? 0, currencyConfig). |
| CL-073 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:237` | Subtotal footer row prefixes a literal '$' and uses toFixed(2); non-USD tenants see the wrong symbol and decimals on the procurement summary. | Replace with formatCurrencyWithConfig(order.subtotal ?? 0, currencyConfig). |
| CL-074 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:245` | Tax footer row prefixes a literal '$' and uses toFixed(2); additionally the label (line 242) is hardcoded 'Tax:' rather than taxConfig.label (e.g. 'VAT:'/'GST:'). Both amount formatting and tax label are wrong for non-USD/non-US tenants. | Replace amount with formatCurrencyWithConfig(order.tax_amount ?? 0, currencyConfig); replace 'Tax:' with taxConfig.label from useTaxConfig(). |
| CL-075 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:253` | Grand total row — the most prominent financial figure on the PO detail page used by managers approving POs — uses a literal '$' prefix and toFixed(2); non-USD tenants see the wrong symbol and decimal count. | Replace with formatCurrencyWithConfig(order.total_amount ?? 0, currencyConfig). |
| CL-077 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrdersListPage.tsx:193` | Total Amount column in the PO list table prefixes a literal '$' and calls toLocaleString('en-US', ...) with hardcoded 2 decimals; every row shows the wrong symbol, separators, and precision for non-US/non-USD tenants. | Add useCurrencyConfig() and replace the whole expression with formatCurrencyWithConfig(order.total_amount ?? 0, currencyConfig). |
| CL-078 | high | 4 | bypassed_country_engine | `src/pages/suppliers/PurchaseOrdersListPage.tsx:249` | The 'Total Value' StatsCard headline at the top of the PO list page hardcodes '$' and 'en-US' with 2 decimals; this first-seen headline figure shows the wrong currency symbol and formatting for non-USD tenants. | Replace with value={formatCurrencyWithConfig(stats.totalValue, currencyConfig)} after importing the hook. |
| CL-065 | medium | 4 | inconsistent_localization | `src/components/banking/RecordReceiptModal.tsx:610` | Invoice due dates in the receipt allocation list use toLocaleDateString() (browser system locale, not tenant); an Omani operator on an en-US browser sees M/D/YYYY. | Replace with formatDate(invoice.due_date, tenantDateFormat) using DateTimeConfig from useTenantConfig(). |
| CL-104 | medium | 4 | inconsistent_localization | `src/components/inventory/InventoryInsightsHeader.tsx:60` | The formatNumber helper hardcodes 'en-US' locale for unit-count KPI cards (total units, item counts); tenants with a non-US locale see en-US thousands separators instead of their configured format. | Use Intl.NumberFormat with the tenant's locale from useTenantConfig().config.dateTime.locale, or formatNumber() from src/lib/format.ts if it accepts a locale argument. |
| CL-089 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanDetailModal.tsx:218` | The 'Due' date in the Next Payment card uses locale-less toLocaleDateString(); date format follows browser locale, not the tenant's configured dateFormat. | Replace with formatDate() from src/lib/format.ts with the tenant's locale. |
| CL-090 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanDetailModal.tsx:269` | Start Date in the Loan Information section uses locale-less toLocaleDateString(). | Replace with formatDate() from src/lib/format.ts with the tenant's locale. |
| CL-091 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanDetailModal.tsx:275` | End Date in the Loan Information section uses locale-less toLocaleDateString(). | Replace with formatDate() from src/lib/format.ts with the tenant's locale. |
| CL-092 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanDetailModal.tsx:323` | Due Date in every row of the Repayment Schedule table uses locale-less toLocaleDateString(); all scheduled installment dates display in browser locale rather than tenant locale. | Replace with formatDate(item.dueDate, tenantDateFormat, tenantLocale) from src/lib/format.ts. |
| CL-087 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanFormModal.tsx:277` | Start Date in the Loan Summary preview uses browser-default locale; an en-GB tenant on an en-US browser sees mm/dd/yyyy during loan setup. | Replace toLocaleDateString() with formatDate() from src/lib/format.ts passing the tenant's locale from useTenantConfig(). |
| CL-088 | medium | 4 | inconsistent_localization | `src/components/payroll/LoanFormModal.tsx:283` | Estimated End Date in the Loan Summary preview also uses locale-less toLocaleDateString(); same browser-vs-tenant locale inconsistency as the Start Date field. | Replace with formatDate() from src/lib/format.ts with the tenant's locale. |
| CL-103 | medium | 4 | inconsistent_localization | `src/components/stock/StockAlertsDropdown.tsx:132` | Stock alert timestamps in the alerts dropdown hardcode 'en-GB' locale and 24-hour format; a US tenant sees British date style ('14 Jun, 14:05' instead of 'Jun 14, 2:05 PM') on every low-stock/out-of-stock alert visible to all staff. | Use formatDateTimeWithConfig() with the tenant's dateTime config instead of the hardcoded 'en-GB' toLocaleString call. |
| CL-069 | medium | 2 | inconsistent_localization | `src/lib/financialService.ts:215` | Hardcoded 'en-US' forces comma thousands and period decimal separators for all tenants (sub-issue of CL-068, real code not dead code); a German/Swiss tenant sees 1,234.56 instead of 1.234,56. | Remove the entire formatCurrencyWithLocale function; use formatCurrencyWithConfig() which respects the tenant's thousandsSeparator and decimalSeparator from CurrencyConfig. |
| CL-003 | medium | 2 | inconsistent_localization | `src/lib/format.ts:207` | formatDateTimeWithConfig hardcodes 'en-US' for Intl.DateTimeFormat regardless of tenant locale; an Arabic-locale tenant (ar-OM) sees audit timestamps with English month abbreviations. | Accept a localeCode param from TenantConfigContext and pass it to Intl.DateTimeFormat instead of DEFAULT_LOCALE. |
| CL-007 | medium | 4 | inconsistent_localization | `src/lib/pdf/dataFetcher.ts:682` | Position defaults to 'after' for any non-'before' value including null when no accounting_locales row exists; the Country Engine may specify 'before', so credit-note amounts appear with the symbol on the wrong side on a legal document. | Derive currency_position from CurrencyConfig.position resolved via the Country Engine; pass position from the canonical CurrencyConfig struct when the accounting_locales query is removed. |
| CL-011 | medium | 4 | inconsistent_localization | `src/lib/pdf/documents/PaymentReceiptDocument.ts:137` | Payment date on the PDF receipt uses a hardcoded 'dd MMM yyyy' pattern rather than the tenant's DateTimeConfig.dateFormat; a DD/MM/YYYY tenant sees the wrong date format on the legal receipt. | Accept a DateTimeConfig parameter in the builder and pass tenant.dateFormat to formatDate() instead of the hardcoded literal. |
| CL-026 | medium | 4 | inconsistent_localization | `src/lib/pdf/engine/adapters/paymentReceiptAdapter.ts:76` | Hardcoded 'dd MMM yyyy' date format in the engine-adapter path; the tenant's DateTimeConfig.dateFormat is ignored on the legal receipt for any tenant using the template engine render path. | Accept a DateTimeConfig parameter in toEngineData() and pass tenant.dateFormat to formatDate(). |
| CL-022 | medium | 4 | inconsistent_localization | `src/lib/pdf/engine/adapters/quoteAdapter.ts:110` | Created Date and Expiry Date on the QUOTATION PDF are always rendered 'dd MMM yyyy' (Gregorian, English month abbr), ignoring DateTimeConfig.dateFormat; a tenant configured for MM/DD/YYYY or non-Gregorian sees the wrong format on the customer-facing document. | Pass the tenant's DateTimeConfig into the adapter and use formatDate(value, tenantConfig.dateTime.dateFormat). |
| CL-044 | medium | 4 | inconsistent_localization | `src/pages/financial/InvoiceDetailPage.tsx:681` | Invoice Date in the detail sidebar uses browser-default locale with no timezone; a UK/Oman tenant configured for dd/MM/yyyy on an en-US browser sees M/D/YYYY, and dates near UTC midnight may shift a day in positive-offset timezones. | Replace with formatDate(invoice.invoice_date) from src/lib/format.ts (uses tenant DateTimeConfig format + timezone). |
| CL-045 | medium | 4 | inconsistent_localization | `src/pages/financial/InvoiceDetailPage.tsx:687` | Due Date in the detail sidebar has the same browser-locale toLocaleDateString() issue, inconsistent with InvoicesListPage which uses formatDate(). | Replace with formatDate(invoice.due_date) from src/lib/format.ts. |
| CL-046 | medium | 4 | inconsistent_localization | `src/pages/financial/InvoiceDetailPage.tsx:735` | Payment dates in the PaymentHistoryTable render in browser-default locale rather than the tenant's configured format; visible on every invoice with recorded payments. | Replace the inline arrow with (d) => d ? formatDate(d) : '—' using the imported formatDate. |
| CL-047 | medium | 4 | inconsistent_localization | `src/pages/financial/InvoiceDetailPage.tsx:752` | Credit note dates in the Credit Notes section use browser-default toLocaleDateString(); non-en-US tenants see US date format on credit note entries under their invoices. | Replace with cn.credit_note_date ? formatDate(cn.credit_note_date) : '—' using the imported formatDate. |
| CL-083 | medium | 4 | inconsistent_localization | `src/pages/payroll/PayrollDashboard.tsx:32` | The month/year label in the dashboard subtitle uses the browser's implicit locale ('default') rather than the tenant's configured locale; an Arabic-locale tenant may see an English/browser-locale month name while the rest of the UI uses the tenant locale. | Use Intl.DateTimeFormat with the tenant's localeCode from useTenantConfig(), or format with date-fns using the tenant's locale. |
| CL-050 | medium | 4 | inconsistent_localization | `src/pages/quotes/QuoteDetailPage.tsx:672` | The 'Valid Until' date in the Quote Details sidebar uses browser-default locale rather than the tenant's configured date format; a UK-configured tenant on a US machine sees M/D/YYYY instead of DD/MM/YYYY. | Replace with formatDate(quote.valid_until, config.dateTime.dateFormat) using DateTimeConfig from useTenantConfig(). |
| CL-102 | medium | 4 | inconsistent_localization | `src/pages/stock/StockItemDetail.tsx:33` | The formatDateTime helper hardcodes 'en-GB' locale and 24-hour time; a US tenant configured for en-US/12h sees British format (DD Mon YYYY, 14:05 instead of Jun 14, 2026 2:05 PM) on all transaction history timestamps. | Use formatDateTimeWithConfig(dateStr, config.dateTime) from src/lib/format.ts, which respects timezone, locale, and time format. |
| CL-076 | medium | 4 | inconsistent_localization | `src/pages/suppliers/PurchaseOrderDetailPage.tsx:130` | PO creation date uses date-fns format() with hardcoded 'MMM dd, yyyy' (US); the same pattern recurs at lines 304, 312, 356, 370, 389, 395 for order date, expected delivery, approval, received, and audit timestamps. Non-US tenants (UK, Gulf) see dates in the wrong format throughout the PO detail view. | Import useTenantConfig() and replace all date-fns format() calls with formatDateWithConfig(date, dateTimeConfig) from src/lib/format.ts. |
| CL-079 | medium | 4 | inconsistent_localization | `src/pages/suppliers/PurchaseOrdersListPage.tsx:180` | Order Date and Expected Delivery columns (lines 180, 186) use hardcoded 'MMM dd, yyyy'; line 212 (Created column) has the same issue. Non-US tenants see dates in the wrong format across every row of the PO list. | Import useTenantConfig() and replace date-fns format() calls with formatDateWithConfig(date, dateTimeConfig). |
| CL-063 | low | 4 | hardcoded_currency | `src/components/financial/ExpenseFormModal.tsx:177` | The Amount input in the expense form shows a USD dollar-sign icon; an OMR or GBP tenant sees a $ in the input field. Purely cosmetic — does not affect stored or displayed monetary values. | Replace the DollarSign icon with the tenant's currency symbol via useCurrencyConfig().symbol, or a currency-neutral icon (Wallet, Banknote). |
| CL-066 | low | 4 | hardcoded_currency | `src/components/financial/RecordPaymentModal.tsx:370` | The Payment Amount input shows a DollarSign icon regardless of tenant currency; an OMR or GBP tenant sees a dollar sign next to the amount entry field, inconsistent with the actual currency. | Remove the DollarSign icon or replace with a generic icon, or render the tenant's currency symbol from useCurrencyConfig().symbol. |
| CL-048 | low | 4 | inconsistent_localization | `src/pages/financial/InvoiceDetailPage.tsx:927` | The Conversion History modal's converted_at date uses browser-default toLocaleDateString(); low-traffic admin modal, but a dd/MM/yyyy tenant sees US format. | Replace new Date(convertedAt).toLocaleDateString() with formatDate(convertedAt) from src/lib/format.ts. |

## Snippets (for the critical/high set)

**CL-058** `src/components/cases/detail/CaseFinancesTab.tsx:207` — surfaces: CaseFinancesTab (in-app financial screen), Expenses surface, Quotes (per-case)
```
quote.currency_symbol || 'USD', quote.currency_position || 'after', quote.decimal_places || 2
```

**CL-059** `src/components/cases/detail/CaseFinancesTab.tsx:328` — surfaces: CaseFinancesTab (in-app financial screen), Expenses surface, Quotes (per-case)
```
invoice.currency_symbol || 'USD', invoice.currency_position || 'after', invoice.decimal_places || 2
```

**CL-060** `src/components/cases/detail/CaseFinancesTab.tsx:337` — surfaces: CaseFinancesTab (in-app financial screen), Portal customer-facing quote surfaces
```
invoice.currency_symbol || 'USD',
```

**CL-061** `src/components/cases/detail/CaseFinancesTab.tsx:345` — surfaces: CaseFinancesTab (in-app financial screen), Portal customer-facing quote surfaces
```
invoice.currency_symbol || 'USD',
```

**CL-041** `src/components/documents/InvoiceDocument.tsx:268` — surfaces: Sales Invoices
```
{currencyFormat.currencySymbol}{invoice.total_amount?.toFixed(currencyFormat.decimalPlaces) || (0).toFixed(currencyFormat.decimalPlaces)}
```

**CL-042** `src/components/documents/InvoiceDocument.tsx:305` — surfaces: Sales Invoices
```
{currencyFormat.currencySymbol} {item.unit_price.toFixed(currencyFormat.decimalPlaces)}
```

**CL-043** `src/components/documents/InvoiceDocument.tsx:308` — surfaces: Sales Invoices
```
{currencyFormat.currencySymbol} {(item.line_total || (item.quantity * item.unit_price)).toFixed(currencyFormat.decimalPlaces)}
```

**CL-053** `src/components/financial/CreditNoteModal.tsx:86` — surfaces: Currency/locale core & source-of-truth, Credit & Debit Note currency/locale paths
```
currency: invoice.currency ?? 'USD',
```

**CL-001** `src/lib/format.ts:120` — surfaces: Currency/locale core & source-of-truth, Payroll dashboards (formatCurrency default)
```
export const formatCurrency = (amount: number, currency = 'USD', localeCode?: string): string => {
```

**CL-034** `src/lib/invoiceService.ts:859` — surfaces: Currency/locale core & source-of-truth, Sales Invoices
```
const { data: defaultLocale } = await supabase.from('accounting_locales').select('currency_symbol, currency_position, decimal_places').eq('is_default', true).eq('is_active', true).maybeSingle();
```

**CL-035** `src/lib/invoiceService.ts:865` — surfaces: Currency/locale core & source-of-truth, Sales Invoices
```
const defaultCurrencySymbol = defaultLocale?.currency_symbol || 'USD';
```

**CL-030** `src/lib/payrollService.ts:47` — surfaces: Currency/locale core & source-of-truth, Payroll & Payslips
```
currency: { code: 'USD', symbol: '$', decimals: 2 },
```

**CL-033** `src/lib/payrollService.ts:930` — surfaces: Currency/locale core & source-of-truth, Payroll & Payslips
```
'USD',
        employee?.bank_name || 'Bank Muscat',
```

**CL-004** `src/lib/pdf/dataFetcher.ts:152` — surfaces: Currency/locale core & source-of-truth
```
currency_symbol: (r && optStr(r.currency_symbol)) || 'USD',
```

**CL-006** `src/lib/pdf/dataFetcher.ts:649` — surfaces: Credit & Debit Note currency/locale paths
```
supabase.from('accounting_locales').select('currency_symbol, currency_position, decimal_places').eq('is_default', true).eq('is_active', true).maybeSingle(),
```

**CL-005** `src/lib/pdf/dataFetcher.ts:681` — surfaces: Currency/locale core & source-of-truth, Credit & Debit Note currency/locale paths
```
currency_symbol: locale?.currency_symbol || 'USD',
```

**CL-015** `src/lib/pdf/documents/CreditNoteDocument.ts:39` — surfaces: Currency/locale core & source-of-truth, Credit & Debit Note currency/locale paths
```
const currencySymbol = cn.currency_symbol || 'USD';
```

**CL-016** `src/lib/pdf/documents/CreditNoteDocument.ts:40` — surfaces: Credit & Debit Note currency/locale paths
```
const formatCurrency = (amount: number): string => { const formatted = amount.toFixed(decimalPlaces); return cn.currency_position === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`; };
```

**CL-008** `src/lib/pdf/documents/InvoiceDocument.ts:173` — surfaces: Currency/locale core & source-of-truth, Sales Invoices
```
const currencySymbol = invoiceData.accounting_locales?.currency_symbol || 'USD';
```

**CL-010** `src/lib/pdf/documents/PaymentReceiptDocument.ts:166` — surfaces: Currency/locale core & source-of-truth, Payments & Receipts
```
const currencySymbol = paymentData.accounting_locales?.currency_symbol || 'USD'; const decimalPlaces = paymentData.accounting_locales?.decimal_places || 2; const currencyPosition = paymentData.accounting_locales?.currency_position || 'after';
```

**CL-012** `src/lib/pdf/documents/PayslipDocument.ts:15` — surfaces: Currency/locale core & source-of-truth, Payroll & Payslips
```
const currencySymbol = payslipData.accounting_locales?.currency_symbol || 'USD';
```

**CL-013** `src/lib/pdf/documents/PayslipDocument.ts:16` — surfaces: Payroll & Payslips
```
const decimalPlaces = payslipData.accounting_locales?.decimal_places || 2;
```

**CL-014** `src/lib/pdf/documents/PayslipDocument.ts:17` — surfaces: Payroll & Payslips
```
const currencyPosition = payslipData.accounting_locales?.currency_position || 'after';
```

**CL-009** `src/lib/pdf/documents/QuoteDocument.ts:170` — surfaces: Currency/locale core & source-of-truth
```
const currencySymbol = quoteData.accounting_locales?.currency_symbol || 'USD';
```

**CL-018** `src/lib/pdf/engine/adapters/invoiceAdapter.ts:76` — surfaces: Currency/locale core & source-of-truth, Sales Invoices
```
const currencySymbol = invoiceData.accounting_locales?.currency_symbol || 'USD'; const decimalPlaces = ... ?? 2; const currencyPosition = ... || 'after';
```

**CL-019** `src/lib/pdf/engine/adapters/invoiceAdapter.ts:183` — surfaces: Sales Invoices
```
const enWords = amountInWordsEn(totalAmount, currencySymbol, decimalPlaces);
```

**CL-024** `src/lib/pdf/engine/adapters/paymentReceiptAdapter.ts:43` — surfaces: Currency/locale core & source-of-truth, Payments & Receipts
```
const currencySymbol = paymentData.accounting_locales?.currency_symbol || 'USD'; const decimalPlaces = ... ?? 2; const currencyPosition = ... || 'after';
```

**CL-027** `src/lib/pdf/engine/adapters/payslipAdapter.ts:48` — surfaces: Currency/locale core & source-of-truth, Payroll & Payslips
```
const currencySymbol = payslipData.accounting_locales?.currency_symbol || 'USD';
```

**CL-028** `src/lib/pdf/engine/adapters/payslipAdapter.ts:49` — surfaces: Payroll & Payslips
```
const decimalPlaces = payslipData.accounting_locales?.decimal_places ?? 2;
```

**CL-029** `src/lib/pdf/engine/adapters/payslipAdapter.ts:50` — surfaces: Payroll & Payslips
```
const currencyPosition = payslipData.accounting_locales?.currency_position || 'after';
```

**CL-020** `src/lib/pdf/engine/adapters/quoteAdapter.ts:67` — surfaces: Currency/locale core & source-of-truth, Quotes
```
const currencySymbol = quoteData.accounting_locales?.currency_symbol || 'USD'; const decimalPlaces = ... ?? 2; const currencyPosition = ... || 'after';
```

**CL-021** `src/lib/pdf/engine/adapters/quoteAdapter.ts:71` — surfaces: Quotes
```
const money = (amount: number): string => { const formatted = amount.toFixed(decimalPlaces); return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`; };
```

**CL-023** `src/lib/pdf/engine/adapters/quoteAdapter.ts:164` — surfaces: Quotes
```
const enWords = amountInWordsEn(totalAmount, currencySymbol, decimalPlaces); const arWords = amountInWordsAr(totalAmount, currencySymbol, decimalPlaces);
```

**CL-037** `src/lib/quotesService.ts:818` — surfaces: Currency/locale core & source-of-truth, Quotes
```
const defaultCurrencySymbol = defaultLocale?.currency_symbol || 'USD';
```

**CL-105** `src/pages/portal/PortalDashboard.tsx:231` — surfaces: Portal customer-facing quote surfaces
```
{Number(quote.total_amount).toLocaleString()}
```

**CL-054** `src/pages/portal/PortalPurchasesPage.tsx:13` — surfaces: Currency/locale core & source-of-truth, Customer Portal
```
return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
```

**CL-106** `src/pages/portal/PortalQuotes.tsx:253` — surfaces: Portal customer-facing quote surfaces
```
{Number(quote.total_amount).toLocaleString()}
```

**CL-107** `src/pages/portal/PortalQuotes.tsx:307` — surfaces: Portal customer-facing quote surfaces
```
{Number(quote.total_amount).toLocaleString()}
```

**CL-108** `src/pages/portal/PortalQuotes.tsx:378` — surfaces: Portal customer-facing quote surfaces
```
{Number(item.unit_price).toLocaleString()}
```

**CL-109** `src/pages/portal/PortalQuotes.tsx:381` — surfaces: Portal customer-facing quote surfaces
```
{Number(item.total_price).toLocaleString()}
```

**CL-110** `src/pages/portal/PortalQuotes.tsx:392` — surfaces: Portal customer-facing quote surfaces
```
{Number(selectedQuote.subtotal).toLocaleString()}
```

**CL-111** `src/pages/portal/PortalQuotes.tsx:401` — surfaces: Portal customer-facing quote surfaces
```
-{Number(selectedQuote.discount_amount).toLocaleString()}
```

**CL-112** `src/pages/portal/PortalQuotes.tsx:411` — surfaces: Portal customer-facing quote surfaces
```
{Number(selectedQuote.tax_amount).toLocaleString()}
```

**CL-113** `src/pages/portal/PortalQuotes.tsx:420` — surfaces: Portal customer-facing quote surfaces
```
{Number(selectedQuote.total_amount).toLocaleString()}
```

**CL-095** `src/pages/stock/StockSaleDetailPage.tsx:39` — surfaces: Stock & Inventory
```
const formatCurrency = (value: number | null | undefined): string => { if (value === null || value === undefined) return '—'; return value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }); };
```

**CL-064** `src/components/banking/RecordReceiptModal.tsx:10` — surfaces: Payments & Receipts
```
import { useAccountingLocale } from '../../hooks/useAccountingLocale'; ... const { formatCurrencyValue } = useAccountingLocale();
```

**CL-038** `src/components/cases/InvoiceFormModal.tsx:424` — surfaces: Currency/locale core & source-of-truth, Sales Invoices
```
const docCurrency = invoiceData.currency || baseCurrency || 'USD';
```

**CL-039** `src/components/cases/InvoiceFormModal.tsx:697` — surfaces: Sales Invoices
```
{quote.quote_number} - {quote.title} ({currencyFormat.currencySymbol}{quote.total_amount?.toFixed(2)})
```

**CL-040** `src/components/cases/InvoiceFormModal.tsx:1088` — surfaces: Sales Invoices
```
{currencyFormat.currencySymbol}{(item.default_price ?? 0).toFixed(2)}
```

**CL-049** `src/components/cases/QuoteFormModal.tsx:346` — surfaces: Quotes
```
const docCurrency = quoteData.currency || baseCurrency || 'USD';
```

**CL-062** `src/components/cases/detail/CaseFinancesTab.tsx:497` — surfaces: Expenses surface, CaseFinancesTab (in-app financial screen)
```
{expense.amount?.toFixed(2)}
```

**CL-099** `src/components/stock/QuickSaleWidget.tsx:28` — surfaces: Stock & Inventory
```
return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

**CL-098** `src/components/stock/SaleableItemsGrid.tsx:18` — surfaces: Stock & Inventory
```
return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

**CL-100** `src/components/stock/StockItemsTable.tsx:61` — surfaces: Stock & Inventory
```
function formatPrice(value: number | null): string { if (value == null) return '—'; return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }); }
```

**CL-097** `src/components/stock/StockSaleModal.tsx:313` — surfaces: Stock & Inventory
```
const formatAmount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

**CL-096** `src/components/stock/StockSalesTable.tsx:35` — surfaces: Stock & Inventory
```
return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

**CL-067** `src/lib/financialService.ts:80` — surfaces: Journal Entries & Financial Reports
```
export const fetchDefaultLocale = async (): Promise<AccountingLocale | null> => { ... .from('accounting_locales').select('*').eq('is_default', true).maybeSingle();
```

**CL-068** `src/lib/financialService.ts:209` — surfaces: Journal Entries & Financial Reports
```
export const formatCurrencyWithLocale = (amount, locale) => { ... parseInt(integerPart).toLocaleString('en-US'); ... if (locale.currency_position === 'before') ... }
```

**CL-002** `src/lib/format.ts:37` — surfaces: Currency/locale core & source-of-truth
```
const { data, error } = await supabase.from('accounting_locales').select('currency_code, date_format, number_format, is_default, decimal_places').eq('is_default', true).maybeSingle();
```

**CL-031** `src/lib/payrollService.ts:79` — surfaces: Payroll & Payslips
```
code: currencyRaw?.code ?? DEFAULT_PAYROLL_SETTINGS.currency.code,
```

**CL-032** `src/lib/payrollService.ts:80` — surfaces: Payroll & Payslips
```
symbol: currencyRaw?.symbol ?? DEFAULT_PAYROLL_SETTINGS.currency.symbol,
```

**CL-017** `src/lib/pdf/documents/CreditNoteDocument.ts:208` — surfaces: Credit & Debit Note currency/locale paths
```
{ text: isBilingual ? `VAT ${taxRate}% | ضريبة القيمة المضافة:` : `VAT ${taxRate}%:`, ... }
```

**CL-025** `src/lib/pdf/engine/adapters/paymentReceiptAdapter.ts:127` — surfaces: Payments & Receipts
```
const qrPayload = `RECEIPT:${paymentData.receipt_number || 'Draft'} AMOUNT:${money(paymentData.amount)} DATE:${formatDate(paymentData.payment_date, 'dd MMM yyyy')}`;
```

**CL-055** `src/lib/pdf/utils.ts:21` — surfaces: Currency/locale core & source-of-truth
```
currencyCode: string = 'USD',
```

**CL-036** `src/lib/quotesService.ts:811` — surfaces: Currency/locale core & source-of-truth, Quotes
```
const { data: defaultLocale } = await supabase.from('accounting_locales').select('currency_symbol, currency_position, decimal_places').eq('is_default', true).eq('is_active', true).maybeSingle();
```

**CL-070** `src/pages/financial/TransactionsList.tsx:450` — surfaces: Journal Entries & Financial Reports
```
{transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
```

**CL-080** `src/pages/payroll/PayrollDashboard.tsx:83` — surfaces: Payroll & Payslips
```
value={isLoading ? '...' : formatCurrency(stats?.totalPayroll || 0)}
```

**CL-081** `src/pages/payroll/PayrollDashboard.tsx:187` — surfaces: Payroll & Payslips
```
value={isLoading ? '...' : formatCurrency(stats?.avgSalary || 0)}
```

**CL-082** `src/pages/payroll/PayrollDashboard.tsx:262` — surfaces: Payroll & Payslips
```
{formatCurrency(period.total_net ?? 0)}
```

**CL-084** `src/pages/payroll/PayrollHistoryPage.tsx:120` — surfaces: Payroll & Payslips
```
{formatCurrency(period.total_gross ?? 0)}
```

**CL-085** `src/pages/payroll/PayrollHistoryPage.tsx:124` — surfaces: Payroll & Payslips
```
{formatCurrency(period.total_deductions ?? 0)}
```

**CL-086** `src/pages/payroll/PayrollHistoryPage.tsx:126` — surfaces: Payroll & Payslips
```
{formatCurrency(period.total_net ?? 0)}
```

**CL-056** `src/pages/payroll/PayrollSettingsPage.tsx:51` — surfaces: Currency/locale core & source-of-truth, Payroll & Payslips
```
currency_code: settings?.currency?.code || 'USD',
```

**CL-057** `src/pages/payroll/PayrollSettingsPage.tsx:52` — surfaces: Payroll & Payslips
```
currency_symbol: settings?.currency?.symbol || '$',
```

**CL-051** `src/pages/quotes/QuotesListPage.tsx:765` — surfaces: Quotes
```
total: Math.round(item.quantity * item.unit_price * 100) / 100,
```

**CL-052** `src/pages/quotes/QuotesListPage.tsx:820` — surfaces: Quotes
```
total: Math.round(item.quantity * item.unit_price * 100) / 100,
```

**CL-093** `src/pages/stock/StockListPage.tsx:58` — surfaces: Stock & Inventory
```
const formatCurrency = (value: number): string => value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
```

**CL-101** `src/pages/stock/StockReportsPage.tsx:147` — surfaces: Stock & Inventory
```
v.costValue.toFixed(3), v.sellValue.toFixed(3), v.margin.toFixed(1) + '%',
```

**CL-094** `src/pages/stock/StockSalesPage.tsx:25` — surfaces: Stock & Inventory
```
const formatCurrency = (value: number): string => value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
```

**CL-071** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:223` — surfaces: Purchase Orders & Bills
```
${item.unit_price?.toFixed(2) || '0.00'}
```

**CL-072** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:226` — surfaces: Purchase Orders & Bills
```
${item.total?.toFixed(2) || '0.00'}
```

**CL-073** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:237` — surfaces: Purchase Orders & Bills
```
${order.subtotal?.toFixed(2) || '0.00'}
```

**CL-074** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:245` — surfaces: Purchase Orders & Bills
```
${order.tax_amount?.toFixed(2) || '0.00'}
```

**CL-075** `src/pages/suppliers/PurchaseOrderDetailPage.tsx:253` — surfaces: Purchase Orders & Bills
```
${order.total_amount?.toFixed(2) || '0.00'}
```

**CL-077** `src/pages/suppliers/PurchaseOrdersListPage.tsx:193` — surfaces: Purchase Orders & Bills
```
${(order.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
```

**CL-078** `src/pages/suppliers/PurchaseOrdersListPage.tsx:249` — surfaces: Purchase Orders & Bills
```
value={`$${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
```
