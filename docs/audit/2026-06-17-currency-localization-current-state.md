# Currency & Localization — Current-State Audit (Phase 4 work-list)

> Generated 2026-06-17 from a 10-agent + verification workflow (26 agents, 2.24M tokens) anchored on the prior catalog `docs/audit/2026-06-16-currency-localization-audit.md` and re-verified against the current `feat/currency-localization-phase4` branch. Every finding was checked against live code; NEW high/critical findings were adversarially verified.

## Executive summary — two root causes

The configured tenant currency is inconsistent for **two independent reasons**:

1. **Caller layer (existing tenants).** Phase 1 only repointed the PDF/document *render* path. The in-app **screens** (lists, detail tabs, form modals, POS, portal, dashboards) for most modules were never swept — they hard-code `'$'`, call `formatCurrency()` (which defaults to `'USD'`), hand-roll `toFixed()/toLocaleString('en-US')`, or go through the deprecated `useAccountingLocale` shim that drops thousands/decimal separators, `display_mode`, and `negative_format`. This is the bulk of the 67 cataloged-still-open + most NEW findings. **This is why Banking/Quotes/Invoices/POs/Stock/Payroll still look wrong on existing tenants.**

2. **Provisioning layer (new tenants) — CRITICAL, NEW.** A freshly provisioned tenant is **dead on arrival**: `provision-tenant` and the `sync_tenant_config_from_country` trigger populate only the *denormalized scalar* columns, never the **`resolved_country_config` JSONB** that the runtime resolver (`resolveTenantConfigFromLayers`) actually reads. So `getTenantConfig` throws `CountryConfigError` on required keys (`tax.label`, `tax.default_rate`) and `TenantConfigContext` renders a full-screen **"Tenant not configured"** wall — the whole app is unusable until an operator manually runs `_apply_country_config` via SQL. The 2 existing tenants only work because a P3 migration backfilled them. **Every new signup reproduces this.** (`resyncTenantCountryConfig`, the only client repair path, has zero callers.)

## Answers to the requested deliverable questions

- **(5) Is there ONE centralized formatter?** No. Canonical `formatCurrencyWithConfig` (`src/lib/format.ts`) is correct, but **6 parallel implementations** coexist: `format.ts formatCurrency` (default `'USD'`, CL-001), `pdf/utils.ts formatCurrency` (default USD + `en-US` + hardcoded 2dp), `financialService.formatCurrencyWithLocale` (`toLocaleString('en-US')` — now **dead**, safe to delete), `PlatformDashboard` inline `Intl('en-US', USD)`, `PortalPurchasesPage` inline `Intl('en-US', USD)` (customer-facing), and the Stock pages' symbol-less `toLocaleString(...,{3dp})`. Plus `useAccountingLocale`'s inline `symbol + toFixed` formatter.
- **(6) Does a Settings change reflect immediately?** **Partially — and the currency UI itself is non-reactive.** Surfaces using the reactive hooks (`useCurrencyConfig`/`useTaxConfig`/`useDateTimeConfig`) update the instant `refreshConfig()` runs — but `refreshConfig()` is wired into only 4 surfaces (`AccountingLocales`, `FeaturesSettings`, `LocaleContext`, `ThemeContext`). **`CurrencySettings.tsx` calls neither `refreshConfig()` nor `invalidateTenantConfigCache()`**, so a base-currency/display-mode change there does NOT propagate until a hard reload. Worse, the imperative `getTenantConfig()` module cache (5-min TTL, no event invalidation) keeps every non-hook consumer (PDF/services/template) stale for up to 5 min.
- **(7) New vs existing tenants.** Existing: resolve correctly (backfilled). New: **hard-blocked** (the critical provisioning bug above).

## Recommended architectural improvements

- **R1 (HIGH):** Wire `CurrencySettings.tsx` to call `refreshConfig()` after every currency mutation, or route all tenant-config writes through one service that always `invalidateTenantConfigCache()` + `refreshConfig()`. Without this the currency UI is non-reactive end-to-end.
- **R2 (HIGH):** Make the new-tenant `resolved_country_config` populate atomically at provisioning (AFTER INSERT trigger calling `_apply_country_config`, or `provision-tenant` RPC). Defensively, have `buildConfigLayers` fall back to the denormalized columns for required keys.
- **R3 (MED):** Collapse the 6 formatters onto `formatCurrencyWithConfig`; delete dead `formatCurrencyWithLocale`; route `pdf/utils.ts` through `CurrencyConfig`; migrate `useAccountingLocale`'s inline formatter then retire the hook.
- **R4 (MED):** Replace page-local hardcoded formatters (PlatformDashboard, PortalPurchasesPage, Stock pages) with `useCurrency()`.
- **R5 (LOW, guardrail):** Drop the `'USD'`/`'en-US'` defaults from `format.ts` (make currency required; thread locale) so an omitted arg fails loudly. Add an eslint rule banning hardcoded-locale `toLocaleString`/`toLocaleDateString`.

## Staged P4 execution plan (priority order — one PR per slice)

| # | Slice | Why first | Risk |
|---|-------|-----------|------|
| 0 | **New-tenant provisioning** (R2) — populate `resolved_country_config` at creation + wire `resyncTenantCountryConfig` into an admin repair action | Every new signup is dead-on-arrival | **HIGH** (live migration + edge fn) |
| 1 | **Customer Portal** — PortalQuotes (8 sites, no symbol), PortalDashboard, PortalPurchasesPage (hardcoded USD) | Customers approve quotes blind to currency | Low (frontend) |
| 2 | **Credit-note persistence** — `CreditNoteModal` stamps `'USD'` into the legal record | Corrupts a legal instrument at write time | Low |
| 3 | **In-app case/financial screens** — CaseFinancesTab hand-rolled formatter + expense `toFixed`, multi-currency per-row base-amount bugs (Transactions/Expenses/Payments) | Named symptom, staff-facing wrong figures | Low |
| 4 | **Banking** — retire `useAccountingLocale` across the 4 banking surfaces; AccountFormModal `accounting_locales` read | #1 named symptom | Low |
| 5 | **Stock/Inventory** — delete the ~8 local formatters → `useCurrency()` | Heaviest leak module; symbol-less amounts | Low |
| 6 | **Purchase Orders / Suppliers** — PO detail/list hardcoded `'$'`/`toFixed`; SupplierProfile symbol-less | Named symptom | Low |
| 7 | **Payroll** — `default_usd` settings/dashboards; payslip + WPS export | WPS bank file = high stakes | Med |
| 8 | **On-screen document previews** — InvoiceDocument/PaymentReceiptDocument honor position/separator/display_mode/negative + tax label | Customer-facing legal docs | Low |
| 9 | **Core + reactivity (R1/R3/R5)** — CurrencySettings `refreshConfig`, cache invalidation, collapse formatters, delete dead code, CL-001/CL-003 defaults, eslint guardrail | Systemic guardrail so it can't regress | Med |

**Confirmation status:** the app does **NOT** yet use tenant-configured currency consistently — this document is the verified remediation work-list. Consistency is achieved when slices 0–9 land and the eslint guardrail (R5) is enforced.

## Counts

- **Total findings:** 106
- **By status:** cataloged-still-open 67 · NEW 34 · already-fixed-by-P1/P2/P3 5
- **By severity:** critical 22 · high 49 · medium 23 · low 12

## Per-module synthesis (root causes + architectural recommendations)

### financial-core

**Scope:** financial-core: Invoices, Quotes, Credit Notes, Payments, Receipts, Expenses — in-app screens (lists, detail pages, form modals, line-item editors), their on-screen printable document previews (InvoiceDocument.tsx, PaymentReceiptDocument.tsx), and the supporting services (invoiceService, quotesService, financialService, payments/receipts via banking modals). Files inspected under src/pages/financial/**, src/pages/quotes/**, src/components/financial/**, src/components/cases/{InvoiceFormModal,QuoteFormModal}.tsx, src/components/cases/detail/CaseFinancesTab.tsx, src/pages/cases/CaseDetail.tsx, src/components/documents/{InvoiceDocument,PaymentReceiptDocument}.tsx, and src/lib/{invoiceService,quotesService,financialService}.ts.

**Findings summary:** The financial list/detail screens themselves are mostly clean: InvoicesListPage, PaymentsList, ExpensesList, TransactionsList, QuotesListPage, QuoteDetailPage, InvoiceDetailPage, VATAuditPage, and the financial modals (RecordPaymentModal, PaymentViewModal, VATReturnModal) all route money through useCurrency().formatCurrency, which is canonical (useCurrencyConfig -> formatCurrencyWithConfig). The real open gaps cluster in four places P1 did not touch: (1) the Case Finances surface — CaseDetail.tsx ships a hand-rolled formatCurrencyAmount prop (raw toFixed, symbol concatenation, no thousands separator / displayMode / negativeFormat) that CaseFinancesTab feeds `|| 'USD'` into on quote/invoice/paid/balance lines, plus a bare expense.amount?.toFixed(2) with NO symbol at all; (2) CreditNoteModal stamps `invoice.currency ?? 'USD'` into the persisted credit_notes record (legal instrument); (3) the on-screen printable previews InvoiceDocument.tsx and PaymentReceiptDocument.tsx hand-roll `${symbol}${toFixed()}` — correct symbol/decimals now (sourced from useCurrency) but NO thousands separator, symbol hardcoded BEFORE the amount (ignores tenant position 'after'), no negativeFormat, and InvoiceDocument hardcodes the 'VAT' tax label; (4) multi-currency base-amount bug — TransactionsList (CL-070, cataloged), ExpensesList, and PaymentsList render per-row document-currency amounts with the base-currency formatter even though their own stats cards already call baseAmount(); and (5) quote line-item totals persisted with hardcoded 2dp rounding (QuotesListPage create+edit paths) corrupting OMR/JPY precision. financialService.ts still exposes the legacy fetchDefaultLocale() (reads accounting_locales, consumed by VATAuditPage) and formatCurrencyWithLocale() (toLocaleString('en-US')). The form modals (InvoiceFormModal/QuoteFormModal) keep `|| 'USD'` doc-currency fallbacks and bare toFixed(2) in the quote-picker/quick-add lists. Severity is dominated by the credit-note persistence bug and the customer-facing printable invoice.

**Architecture & fix pattern:** Two distinct correct patterns coexist and that is fine: (a) single-currency surfaces use useCurrency().formatCurrency (= formatCurrencyWithConfig on the tenant CurrencyConfig); (b) genuine multi-currency document forms (InvoiceFormModal/QuoteFormModal) deliberately use format.ts formatCurrency(amount, docCurrency) so a USD invoice on an OMR tenant shows USD — that is intentional and should NOT be 'fixed' to the tenant symbol. The bug in those forms is only the terminal `|| 'USD'` fallback (should derive from useCurrencyConfig().code) and the bare toFixed(2) in non-document list snippets. The multi-currency base-amount class (CL-070) is subtle and recurring: list pages aggregate with baseAmount() for the stats cards but then print the raw document-currency `.amount` per row with the BASE-currency formatter — so the per-row figure is numerically wrong (raw foreign magnitude) AND wears the wrong symbol. The hand-rolled formatCurrencyAmount(amount, symbol, position, decimals) prop pattern in CaseDetail is a localized re-implementation of formatCurrencyWithConfig that drops thousands separators, displayMode and negativeFormat — it should be deleted and CaseFinancesTab should call formatCurrencyWithConfig(amount, useCurrencyConfig()) directly, also letting getInvoicesByCaseId/getQuotesByCaseId stop annotating rows with currency_symbol/position/decimal_places. The on-screen InvoiceDocument/PaymentReceiptDocument previews bypass the formatter entirely; they should accept a formatMoney prop bound to formatCurrencyWithConfig so position/separator/negative/displayMode are all honored — currency_symbol is right but placement and grouping are not. CATALOG LINE DRIFT: the catalog (docs/audit/2026-06-16) was written pre-Phase-2/3; many cited line numbers no longer match. All line numbers below are verified against the current feat/currency-localization-phase4 working tree.

### procurement-sales modules

**Scope:** procurement-sales modules: Purchase Orders (list/detail/form), Suppliers (list/profile/form), Sales surfaces (Customer Purchases tab, Portal Purchases). Files inspected: src/pages/suppliers/PurchaseOrderDetailPage.tsx, src/pages/suppliers/PurchaseOrdersListPage.tsx, src/pages/suppliers/SupplierProfilePage.tsx, src/pages/suppliers/SuppliersListPage.tsx, src/components/suppliers/PurchaseOrderFormModal.tsx, src/components/customers/CustomerPurchasesTab.tsx, src/pages/portal/PortalPurchasesPage.tsx, plus verification of src/hooks/useCurrency.ts and src/lib/format.ts (formatDate). supplier_products has no UI surface (generated types only) — no supplier-pricing display leak.

**Findings summary:** The PO detail page and PO list page are the worst offenders: both hardcode a literal '$' symbol and use toFixed(2)/toLocaleString('en-US') with fixed 2-decimal precision, so every non-USD tenant (OMR/GBP/EUR/JPY) sees the wrong symbol, wrong separators, and wrong decimal count on internal procurement screens (these match cataloged CL-071..078 and remain open in current code). The PO detail page also hardcodes the tax label 'Tax:' (CL-074). The customer-facing Portal Purchases page hardcodes USD + en-US in a local formatCurrency helper (CL-054, critical, customer-visible) and uses it at four call sites. NEW (not in catalog): the Supplier Profile page renders all money (PO amounts in the Orders tab, Credit Limit, Outstanding Balance, Performance KPI cards) with bare .toLocaleString() and NO currency symbol at all — staff cannot tell the currency; and the PO list ExportButton exports Subtotal/Tax/Shipping/Total as raw unformatted numbers. Positive findings (fixed_since_audit): PurchaseOrderFormModal now uses the canonical useCurrency().formatCurrency + taxConfig.label (the legacy 'USD' default the catalog flagged is gone), and SuppliersListPage's Total Spend stat now uses the canonical formatter. Date localization on these screens uses date-fns format() without tenant locale, but that is out of currency scope and low priority.

**Architecture & fix pattern:** Two correct patterns are already wired in this module and should be the template for the rest: PurchaseOrderFormModal imports useCurrency()/useTaxConfig() and renders all totals via formatCurrency()/taxConfig.label; SuppliersListPage/CustomerPurchasesTab use useCurrency().formatCurrency for stat cards and tables. The remaining leaks are all read-only display surfaces (detail/list/profile/export/portal) that simply never adopted the hook. The canonical fix for every finding is identical: import useCurrencyConfig() (or useCurrency()) and replace the hand-rolled string/'$'/toFixed/toLocaleString with formatCurrencyWithConfig(amount, currencyConfig). For PortalPurchasesPage the portal has its own auth context; it needs the portal-equivalent currency source (PortalAuthContext / tenant config for the portal tenant) rather than useCurrencyConfig() which assumes a staff session. The SupplierProfilePage findings are arguably worse than the cataloged PO ones because they show amounts with NO currency indicator whatsoever (bare toLocaleString), which is more ambiguous than a wrong-but-present '$'. PO base-currency plumbing (buildPoBaseColumns / baseAmount / total_amount_base) is correctly used for aggregation (PO list stats, supplier Total Spend), so multi-currency base conversion is sound — only the per-row/per-document display formatting is broken.

### Inventory, Stock, and Assets modules — src/pages/{inventory,stock}/**, src/components/{inv

**Scope:** Inventory, Stock, and Assets modules — src/pages/{inventory,stock}/**, src/components/{inventory,stock}/**, stockService/inventoryService, stock_sale price displays, plus a search for any Assets UI. Audited against the canonical pattern (useCurrencyConfig -> formatCurrencyWithConfig / useCurrency() hook; formatDateTimeWithConfig for dates) and the existing catalog docs/audit/2026-06-16-currency-localization-audit.md (CL-093..CL-104).

**Findings summary:** Stock is the heaviest currency-leak module in the app. Three page-level files (StockListPage, StockSaleDetailPage, StockSalesPage) and four POS components (StockSaleModal, StockSalesTable, SaleableItemsGrid, QuickSaleWidget) plus the shared StockItemsTable still define LOCAL formatCurrency/formatAmount/formatPrice helpers built on hardcoded-decimal toLocaleString that emit NO currency symbol and the wrong decimal count (3dp on list pages, 2dp in the POS path) regardless of tenant config — so an OMR/KWD/BHD (3dp) lab sees truncated POS amounts, a JPY (0dp) lab sees spurious decimals, and EVERY tenant sees a bare number with no currency indicator on financial surfaces (stock value, sale detail document, sale modal grand total, revenue KPIs). The StockReportsPage CSV valuation export hardcodes .toFixed(3), corrupting an accounting-reconciliation file. Date formatting across StockItemDetail, StockAdjustmentsPage, StockReportsPage sales table, and StockAlertsDropdown hardcodes en-GB; InventoryInsightsHeader hardcodes en-US for unit counts. By contrast, the files that were already migrated to useCurrency()/currencyFormat (StockReportsPage money displays, StockItemDetail money displays, InventoryInsightsHeader currency value, AddInventoryModal input, BulkPriceUpdateModal) are correct and reactive — confirming the canonical pattern works; the remaining files simply weren't swept. None of the P4 caller-sweep commits for stock/inventory have landed on this branch yet (only CL-002 templateContextService), so all cataloged stock/inventory findings remain open. There is NO Assets module UI in the codebase (asset_* tables exist in the DB but no pages/components render valuation or depreciation), so there is nothing to fix there.

**Architecture & fix pattern:** Root architectural pattern: every leak is a LOCAL module-scope formatter (formatCurrency/formatAmount/formatPrice/formatNumber/formatDate/formatDateTime) defined inside the file instead of calling the hook. The correct pattern is already proven in this same module — useCurrency() (src/hooks/useCurrency.ts) wraps formatCurrencyWithConfig(amount, useCurrencyConfig()) and exposes both formatCurrency() and a currencyFormat {symbol,position,decimalPlaces,code} object; AddInventoryModal uses currencyFormat to build a symbol-prefixed, decimal-aware input. The fix is mechanical per file: delete the local helper, add `const { formatCurrency } = useCurrency()` (component-scope, not module-scope), replace call sites. For the four POS components and StockItemsTable/StockSalesTable that are presentational and receive data via props, useCurrency() can be called directly inside the component (it is a pure context hook, no prop drilling needed). For dates, swap the en-GB/en-US toLocaleString helpers for formatDateTimeWithConfig(value, config.dateTime) using useDateTimeConfig()/useTenantConfig(). For the CSV export, use useCurrencyConfig().decimalPlaces as the toFixed argument. One non-display gap worth noting: InventoryFormPage's purchase-price <input> hardcodes step=0.01 with no currency symbol, unlike AddInventoryModal which derives step and symbol from currencyFormat — the two intake forms are inconsistent. Reactivity: because all canonical paths read useCurrencyConfig() (context), they update live when Settings changes; the local-helper files will never react. No service/PDF-layer currency leaks found in this module (stockService/inventoryService return raw data only).

### hr-payroll currency audit

**Scope:** hr-payroll currency audit

**Findings summary:** 9 Payroll findings; 7 in notes

**Architecture & fix pattern:** useCurrency canonical; bug=import formatCurrency from lib/format. 7 more: payrollService.ts:47 default_usd high CL-030; PayrollSettingsPage.tsx:51 default_usd high CL-056; PayrollDashboard.tsx:8 default_usd high CL-080; PayrollHistoryPage.tsx:10 default_usd high CL-084; PayslipDocument.ts:14 hand_rolled_format medium CL-012; payslipAdapter.ts:48 hand_rolled_format medium CL-027; PayrollDashboard.tsx:32 hardcoded_locale_en_US low new

### Banking module currency/locale audit

**Scope:** Banking module currency/locale audit: src/pages/financial/BankingPage.tsx, src/components/banking/{AccountFormModal,RecordReceiptModal,TransferFundsModal}.tsx, src/lib/bankingService.ts, src/hooks/useAccountingLocale.ts (the shared formatter all four banking surfaces depend on). Branch feat/currency-localization-phase4.

**Findings summary:** Every user-facing currency string in the Banking module flows through the deprecated useAccountingLocale().formatCurrencyValue hook (BankingPage, RecordReceiptModal, TransferFundsModal) — the #1 named symptom. CRITICAL NUANCE the catalog (CL-064) is now stale about: the hook was repointed and now sources symbol/code/decimals/position from useCurrencyConfig() (the Country Engine), so the SYMBOL is correct. But its hand-rolled `${currency.symbol} ${amount.toFixed(n)}` formatter ignores four config dimensions the canonical formatCurrencyWithConfig honors: thousandsSeparator and decimalSeparator (so 1234567.5 always renders as "1234567.50" with NO grouping and a hard-coded period decimal — wrong for de/fr/etc. tenants), displayMode (always shows symbol, never the tenant's chosen ISO code or symbol+code), and negativeFormat (never parentheses). It also forces a space before a 'before'-position symbol ("$ 100" vs canonical "$100"). So banking is not rendering the wrong CURRENCY in most cases, but it is rendering the wrong FORMAT on every amount on the page, and it is the only major financial surface that has NOT migrated to formatCurrencyWithConfig (its sibling RecordPaymentModal already uses the canonical path). Separately, AccountFormModal still does a genuine direct read of the legacy accounting_locales table to pick a default currency, and all date columns use browser-locale toLocaleDateString(). bankingService itself stores/sums numbers only — no formatting leaks there. Recommended single fix: delete useAccountingLocale usage across banking and route every amount through useCurrencyConfig() + formatCurrencyWithConfig, and repoint AccountFormModal's default-currency lookup onto the Country Engine config.

**Architecture & fix pattern:** Root architectural issue: useAccountingLocale is a deprecated shim. Its name and the catalog imply it reads accounting_locales, but the CURRENT code (src/hooks/useAccountingLocale.ts:6-17) actually reads from useTenantConfig/useCurrencyConfig and only HAND-ROLLS the format. So the bug class for the three hook-consuming banking files is NOT default_usd or reads_accounting_locales — it is uses_useAccountingLocale + hand_rolled_format: a divergent second formatter that silently drops thousandsSeparator, decimalSeparator, displayMode, and negativeFormat from the resolved CurrencyConfig. Because the symbol IS correct, the user-visible defect is degraded (wrong grouping/decimal separator, never ISO-code mode, never parentheses negatives, stray space) rather than a wrong-currency catastrophe — hence high/medium, not critical, for the format gaps. The genuinely legacy read is AccountFormModal's direct accounting_locales query (it picks the NEW-account default currency from the legacy table, which can diverge from the tenant's Country Engine currency). The canonical sibling to copy is RecordPaymentModal (already on useCurrencyConfig + formatCurrencyWithConfig). Retiring useAccountingLocale entirely (its formatCurrencyValue/getCurrencySymbol/getCurrencyCode/getDateFormat) and the dead useAccountingLocales() query is the clean Phase-4 caller-sweep move; the four banking files are the densest cluster of its remaining consumers. Note reactivity is fine — the hook reads context, so it DOES update when Settings change; the defect is format fidelity, not staleness.

### Dashboard, Reports, Analytics modules

**Scope:** Dashboard, Reports, Analytics modules: src/pages/dashboard/Dashboard.tsx, src/components/dashboard/** (LowStockWidget, DueFollowUpsWidget, StockSalesWidget, StockValueWidget), src/pages/financial/ReportsDashboard.tsx, src/pages/financial/reportsDashboardRollup.ts, src/lib/financialReportsService.ts, src/pages/stock/StockReportsPage.tsx, plus stat/KPI card components (src/components/financial/FinancialStatsCard.tsx, src/components/ui/StatsCard.tsx).

**Findings summary:** The dashboard/reports/analytics surfaces are in much better shape than the broad audit average. ReportsDashboard.tsx (Financial Reports) correctly uses useCurrency().formatCurrency for every money figure (~30 call sites) and base-currency aggregation via baseAmount/sumBase/groupSumBase; financialReportsService.ts aggregates exclusively on base-currency shadow columns (baseAmount) and never hard-codes currency; all four dashboard widgets (StockSalesWidget, StockValueWidget, LowStockWidget, DueFollowUpsWidget) use useCurrency() or render no money; StockReportsPage on-screen money all flows through useCurrency().formatCurrency; the two stat-card components (FinancialStatsCard, StatsCard) take a pre-formatted string and never touch currency. The only real currency leak in scope is CL-101 (StockReportsPage CSV export hard-codes toFixed(3), ignoring tenant decimal places) — already in the catalog and still open. I also found two NEW date-locale leaks not in the catalog: the Dashboard header date (hardcoded en-US) and the StockReportsPage sales-table date (hardcoded en-GB). The toFixed(2)/toFixed(1) calls flagged by grep in ReportsDashboard and StockReportsPage are all percentages, not currency, so they are correct. Net: 1 cataloged currency export bug + 2 new (low/medium) date-locale bugs. No hardcoded $/USD, no accounting_locales reads, no useAccountingLocale, no default-USD formatter calls anywhere in this module set.

**Architecture & fix pattern:** This module set was evidently swept in a prior pass (audit memory notes FinancialStatsCard was the one file fixed in PR #147). The canonical pattern is fully adopted on-screen: useCurrency() (wraps useCurrencyConfig + formatCurrencyWithConfig) is used in ReportsDashboard, all dashboard widgets, and StockReportsPage. Multi-currency correctness is also handled well: financialReportsService and reportsDashboardRollup aggregate on base-currency shadow columns (amount_base, total_amount_base) via baseAmount(), and the cash-flow report surfaces a closingBalanceIsIndicative flag for cross-currency rollups — this is the rare module that gets multi-currency analytics right. The remaining gap class is NOT on-screen currency symbol/decimals but (a) CSV EXPORTS that bypass the formatter and hard-code a decimal count (CL-101; the on-screen table next to it is correct, so the export path is the blind spot), and (b) DATE locale, where formatDateTimeWithConfig/useDateTimeConfig exist but a few cosmetic Date headers and a sales-table cell still call toLocaleDateString with a hardcoded locale literal. Recommended durable guardrail: an eslint rule banning toLocaleDateString/toLocaleString with a hardcoded locale string literal (mirroring the existing no-raw-currency-aggregation rule), which would catch all three findings. Note formatCurrency from useCurrency does not expose the resolved decimalPlaces directly for the CSV fix — CL-101's fix should pull currency.decimalPlaces from useCurrencyConfig().

### Cases + Customer Portal modules

**Scope:** Cases + Customer Portal modules: src/pages/cases/** (CaseDetail.tsx, CaseFinancesTab.tsx), src/pages/portal/** (PortalQuotes, PortalDashboard, PortalPurchasesPage, PortalPayments, PortalReports, PortalCases, PortalCommunications, PortalSettings). No src/components/portal directory exists. Cross-checked against docs/audit/2026-06-16-currency-localization-audit.md and the P1-fixed service layer (quotesService.getQuotesByCaseId / invoiceService.getInvoicesByCaseId).

**Findings summary:** Found 15 open currency-localization defects across the Cases and Portal modules, all customer- or staff-facing. The Customer Portal is the worst surface: PortalQuotes renders ALL money values (8 sites: line-item unit price/total, subtotal, discount, tax, grand total, and both list-card totals) as bare Number(x).toLocaleString() with NO currency symbol or ISO code — a customer being asked to APPROVE or REJECT a quote cannot tell what currency it is in. PortalDashboard's pending-quote total has the same bare-number bug. PortalPurchasesPage hardcodes Intl.NumberFormat('en-US', {currency:'USD'}) for every purchase amount, so a non-USD tenant's customers see all purchases in USD with US formatting. (PortalPayments is the one clean portal surface — it correctly uses useCurrency().formatCurrency + baseAmount.) On the staff side, the Case Finances tab renders quote/invoice/paid/balance amounts through a hand-rolled formatCurrencyAmount closure (defined in CaseDetail.tsx) that uses amount.toFixed(decimalPlaces) with NO thousands separator and ignores the tenant display_mode (symbol vs ISO), and the component still applies '|| USD' symbol fallbacks reachable when the tenant currency has no display symbol; the case expense line uses a raw .toFixed(2) with no symbol at all. IMPORTANT NUANCE: the catalog's service-layer findings (CL-034/035/036/037) ARE fixed — getQuotesByCaseId/getInvoicesByCaseId now source currency from getTenantConfig(tenant_id).currency (Country Engine) and never default to USD — but the COMPONENT-side fallbacks and the hand-rolled formatter that consume those rows remain broken, so CL-058..062 are still open. The root-cause closure (CaseDetail.tsx:80-92) is a NEW finding not separately cataloged.

**Architecture & fix pattern:** Two distinct correctness layers exist for the same data. (1) Data source: P1 already repointed the case quote/invoice list services onto the Country Engine, so the currency_symbol/position/decimal_places fields injected onto each row are now correct and never 'USD'. (2) Render layer: CaseFinancesTab consumes those per-row fields through a hand-rolled formatCurrencyAmount(amount, symbol, position, decimals) closure defined in CaseDetail.tsx that does amount.toFixed(decimals) (no thousands grouping) and ignores renderCurrencyToken/display_mode entirely. The clean fix is to delete formatCurrencyAmount and the per-row CaseQuoteRow/CaseInvoiceRow currency fields, inject useCurrencyConfig() into CaseFinancesTab, and render every amount via formatCurrencyWithConfig(amount, currencyConfig) — which also picks up symbol-vs-ISO display_mode and negative_format for free. The summary stat cards and payment-history line in CaseFinancesTab already use the canonical formatCurrency prop (from useCurrency()) and are correct; only the per-quote/per-invoice/per-expense lines bypass it. For the portal, the correct pattern is the same as PortalPayments already uses: const { formatCurrency } = useCurrency() then formatCurrency(amount). Note portal pages source currency via PortalAuthContext-backed tenant config; useCurrency() resolves it. Every portal toLocaleString() call lacks even an ISO code, making the currency wholly unidentifiable — these are the highest-priority items because they are on a legally-significant customer approval surface. Severity calibration: portal = critical (external customer, approval/financial doc); case finances staff tab = high; case expense cosmetic-but-no-symbol = high.

### Output surfaces

**Scope:** Output surfaces: email, notifications, print layouts, exports.

**Findings summary:** Email relay and generic CSV/export plumbing are clean. send-document-email is a pass-through SMTP relay; currency is rendered upstream in the P1-fixed PDF layer. csvExport and importExportService emit raw values; list CSVs output raw numbers with no symbol (correct). Real output leaks: NEW React print component PaymentReceiptDocument.tsx hand-rolls currency; cataloged_open payroll WPS hardcodes USD plus toFixed(2) and DEFAULT_PAYROLL_SETTINGS USD/$; cataloged_open StockReportsPage CSV toFixed(3); cataloged_open pdf/utils.ts default USD/en-US. Notification dispatch renders raw tokens (correct ISO code, no formatter).

**Architecture & fix pattern:** Email is currency-agnostic (pre-rendered body plus base64 PDF), so fixing PDF builders (P1) fixes emailed PDFs. Generic CSV helpers push formatting to callers. Two PaymentReceiptDocument files exist: cataloged pdfmake builder src/lib/pdf/documents/PaymentReceiptDocument.ts (CL-010, P1) and UNcataloged React print component src/components/documents/PaymentReceiptDocument.tsx used by src/pages/print/PrintPaymentReceiptPage.tsx. The React one takes legacy CurrencyFormat from useCurrency() (right symbol/decimals) but re-implements formatting, ignoring position, separators, display_mode, negative_format. Fix: thread CurrencyConfig and call formatCurrencyWithConfig. Notification dispatcher (Deno) cannot import useCurrencyConfig, so pre-format money into event payload before enqueue.

### config-reactivity DIAGNOSTIC — deliverable items 5 (centralized service) & 6 (immediate re

**Scope:** config-reactivity DIAGNOSTIC — deliverable items 5 (centralized service) & 6 (immediate reactivity). Inspected: src/lib/format.ts, src/lib/pdf/utils.ts, src/contexts/TenantConfigContext.tsx, src/lib/tenantConfigService.ts (configCache 5-min TTL + invalidateTenantConfigCache + getTenantConfig), src/hooks/{useCurrency,useAccountingLocale}.ts, plus the Settings/Localization write paths (CurrencySettings, AccountingLocales, FeaturesSettings, LocaleContext, ThemeContext) and every distinct currency-formatting implementation in src/. NOTE TO ORCHESTRATOR: session cost flagged at $71.41 by the harness during this run.

**Findings summary:** Reactivity is SPLIT and partially broken. There are two read tiers: (1) reactive React context — useCurrencyConfig()/useTaxConfig()/useDateTimeConfig() read from TenantConfigContext state, so any surface using them updates the instant refreshConfig() runs; and (2) the imperative module cache — getTenantConfig(tenantId) in tenantConfigService.ts holds a process-lifetime Map with a 5-minute TTL and NO event-based invalidation, so every non-hook consumer (PDF dataFetcher, invoice/quote services, template context) renders stale currency for up to 5 minutes after a settings change, or until reload. refreshConfig() (TenantConfigContext.tsx:90) does the right thing — it calls invalidateTenantConfigCache(tenantId) then reloads — but it is only wired into 4 surfaces (AccountingLocales, FeaturesSettings, LocaleContext, ThemeContext). The actual currency UI, CurrencySettings.tsx (base currency / activate-deactivate; the surface the catalog says now hosts display_mode/negative_format), NEVER calls refreshConfig or invalidateTenantConfigCache — so changing currency there does NOT propagate to the in-app context OR bust the module cache; the whole app keeps showing the old currency until a hard reload. There is NOT one centralized formatter: I found the canonical formatCurrencyWithConfig PLUS 6 parallel/divergent implementations (format.ts formatCurrency default 'USD' = CL-001; pdf/utils.ts formatCurrency default USD+en-US; financialService.formatCurrencyWithLocale toFixed/toLocaleString('en-US') — now DEAD; and 3+ page-local hardcoded 'USD'/Intl('en-US') formatters in stock/portal/platform-admin). CL-001 (format.ts:75 default 'USD') and CL-003 (format.ts:162 / utils.ts hardcoded 'en-US') both confirmed open.

**Architecture & fix pattern:** ANSWER TO KEY QUESTION (a) — what updates immediately vs needs reload: IMMEDIATE update on currency change ONLY happens when BOTH conditions hold: (i) the mutating UI calls refreshConfig(), AND (ii) the consuming surface reads via the reactive hooks (useCurrencyConfig etc.). Today: AccountingLocales/Features/Locale/Theme call refreshConfig and re-render correctly. But the new CurrencySettings.tsx (the currency surface) calls neither refreshConfig nor invalidateTenantConfigCache (verified: grep shows refreshConfig callers = AccountingLocales, FeaturesSettings, LocaleContext, ThemeContext only; CurrencySettings imports just tenantCurrencyService and toast). So a base-currency / display-mode change there is invisible app-wide until a full page reload. Even after reload, imperative getTenantConfig() consumers can be up to 5 min stale because nothing busts their module cache except the explicit invalidate call inside refreshConfig — which CurrencySettings doesn't trigger. ANSWER TO KEY QUESTION (b) — is there ONE formatter? No. Distinct currency-formatting implementations found: [1] formatCurrencyWithConfig (format.ts:47) — CANONICAL, tenant-aware, the only correct one; [2] formatCurrency (format.ts:75) — Intl, default currency='USD', DEFAULT_LOCALE 'en-US' (CL-001 + a locale default); [3] formatCurrency (pdf/utils.ts:19) — Intl, default currencyCode='USD' + locale='en-US', hardcoded min/maxFractionDigits:2 (ignores tenant decimalPlaces — wrong for OMR/JPY); [4] formatCurrencyWithLocale (financialService.ts:209) — hand-rolled toFixed + toLocaleString('en-US'), reads legacy AccountingLocale shape, now DEAD (zero callers — safe to delete); [5] PlatformDashboard.tsx:54 — Intl('en-US', currency:'USD', 0 decimals) hardcoded; [6] PortalPurchasesPage.tsx:12 — Intl('en-US', currency:'USD') hardcoded (CUSTOMER-FACING); [7] StockListPage/StockSalesPage/StockSaleDetailPage — value.toLocaleString(undefined,{min/maxFractionDigits:3}) with NO currency symbol/code at all (currency-blind, hardcoded 3 decimals). useAccountingLocale singular hook (useAccountingLocale.ts) is now backed by TenantConfigContext (good — reactive) BUT carries its OWN inline formatCurrencyValue (toFixed + symbol concatenation, bypasses formatCurrencyWithConfig: no thousands separators, no displayMode token, no negativeFormat) and is still imported by 4 financial surfaces (TransferFundsModal, RecordReceiptModal, BankingPage, LineItemTemplateFormModal). RECOMMENDATIONS, ranked: (R1, HIGH) Wire CurrencySettings.tsx to call refreshConfig() (via useTenantConfig) after addTenantCurrency/setCurrencyActive and after any display_mode/negative_format mutation — without this the currency UI is non-reactive end-to-end. (R2, HIGH) Replace the 5-min TTL module cache with explicit invalidation as the primary mechanism (keep TTL only as a backstop), and make the canonical mutation path always invalidate — better still, expose a single 'mutate tenant config' service that invalidates the cache on every write so no caller can forget. (R3, MED) Collapse formatters: delete dead formatCurrencyWithLocale (#4); route pdf/utils formatCurrency (#3) through the config-derived CurrencyConfig (it currently hardcodes 2 decimals and en-US); migrate the inline formatter inside useAccountingLocale to formatCurrencyWithConfig so the 4 financial surfaces get grouping/displayMode/negativeFormat. (R4, MED) Replace the page-local hardcoded formatters (#5 PlatformDashboard, #6 PortalPurchasesPage, #7 stock pages) with useCurrency()/formatCurrencyWithConfig — the portal one is customer-facing and the stock ones omit the currency symbol entirely. (R5, LOW) CL-001/CL-003: remove the 'USD' and 'en-US' defaults from format.ts (make currency a required param; thread locale from useLocaleConfig) so an omitted arg fails loudly instead of silently rendering USD. Cross-tab caveat: even after R1/R2, getTenantConfig caches are per-tab module state; a change in one tab won't bust another tab's cache (no storage/BroadcastChannel signal) — acceptable for now but worth noting.

### provisioning-tenant

**Scope:** provisioning-tenant: DIAGNOSTIC + LIVE DB. Traced the new-vs-existing-tenant currency resolution path end to end — supabase/functions/provision-tenant/index.ts, the sync_tenant_config_from_country / _apply_country_config / resync_tenant_country_config DB functions (read live via MCP), src/lib/tenantConfigService.ts (fetchTenantConfig → buildConfigLayers → resolveTenantConfigFromLayers), src/lib/country/{buildConfigLayers,resolveCountryConfig,registry}.ts, src/contexts/TenantConfigContext.tsx, src/pages/onboarding/OnboardingPage.tsx, and supabase/seeds/backfill_seed_existing_tenants.operator.sql. Ran read-only SQL against project ssmbegiyjivrcwgcqutu to determine whether tenants actually carry resolved_country_config.currency.code.

**Findings summary:** Deliverable item 7 (new vs existing tenant behavior) — ANSWERED with live evidence. EXISTING tenants resolve currency correctly: both live non-deleted tenants ("SPACE DATAA RECOVERY" and "Space Data Recovery", both OMR) have a fully-populated resolved_country_config (14 keys incl. currency.code=OMR, tax.label=VAT, tax.default_rate=5, datetime.*, locale.code=ar-OM). So Hypothesis B (tenants lack resolved_country_config.currency.code, causing getTenantConfig to throw CountryConfigError and fall back everywhere) is FALSIFIED for existing tenants — they were backfilled by an operator-run _apply_country_config pass. NEW tenants are BROKEN, in a different and worse way than the hypothesis assumed: provision-tenant/index.ts inserts the tenant WITHOUT writing resolved_country_config; the only insert-time trigger (sync_tenant_config_from_country) populates the denormalized scalar columns (currency_code, tax_label, etc.) but NEVER the resolved_country_config JSONB that the resolver actually reads; the column DEFAULTs to '{}'::jsonb (NOT NULL). _apply_country_config (the sole writer of that JSONB) is invoked only by resync_tenant_country_config, whose frontend wrapper resyncTenantCountryConfig has ZERO callers in src — it is never run during provisioning or onboarding. Net effect: a freshly provisioned tenant has resolved_country_config={}, so buildConfigLayers produces an empty country snapshot; the tenant layer is the folded default accounting_locale which carries ONLY currency.code/date_format/locale.code (localeToBag, buildConfigLayers.ts:34-41) — it does NOT carry the required keys tax.label and tax.default_rate. resolveTenantConfigFromLayers calls get('tax.label')/get('tax.default_rate') which are required→REQUIRED_SENTINEL→throws CountryConfigError. TenantConfigContext catches that and renders a full-screen "Tenant not configured" block (does NOT silently render USD — the fail-loud gate works) — but the entire app is unusable for every newly provisioned tenant until an operator manually runs _apply_country_config/resync_tenant_country_config via SQL. This is a critical provisioning-completeness defect.

**Architecture & fix pattern:** DOES NEW-TENANT CURRENCY RESOLVE? No. A freshly provisioned tenant CANNOT resolve currency (or any tenant config) — it is hard-blocked behind the "Tenant not configured" screen, not given a fallback currency. Root architecture gap: there are TWO sources of country config on tenants and provisioning only fills one. (1) Denormalized scalar columns (currency_code, currency_symbol, tax_label, default_tax_rate, locale_code, timezone, date_format, ...) — filled at INSERT by the live trigger sync_tenant_config_from_country() (COALESCE from geo_countries) AND explicitly by provision-tenant (company_settings/accounting_locales/legal_entities). (2) resolved_country_config JSONB — the ONLY thing fetchTenantConfig's engine path (resolveTenantConfigFromLayers) reads via buildConfigLayers. Source (2) is written ONLY by _apply_country_config(p_tenant_id), which UPDATEs tenants.resolved_country_config = jsonb_strip_nulls(...) || geo_countries.country_config. That function is reachable solely through resync_tenant_country_config (manual/Localization-Center) — it is NOT on the tenants insert trigger and NOT called by provision-tenant. So provisioning fills (1) but leaves (2) at its '{}' default. The legacy mapRowToConfig() path (which DOES read denormalized columns + accounting_locales and would have resolved a new tenant) is dead code — fetchTenantConfig calls resolveTenantConfigFromLayers, not mapRowToConfig. Existing tenants only work because an operator already ran _apply_country_config against them (confirmed by live 14-key bags). Note: even on the populated existing tenants, resolved_country_config does NOT contain currency.display_mode/currency.negative_format, but those are non-required registry keys with real codedDefaults ('symbol'/'minus') so they resolve fine. FIX (operator/eng, not in scope to apply): provision-tenant should PERFORM/RPC resync_tenant_country_config(tenant.id) (or _apply_country_config) immediately after the tenants INSERT so resolved_country_config is populated atomically at creation; OR add an AFTER INSERT trigger on tenants that calls _apply_country_config; OR have buildConfigLayers fall back to the denormalized columns for required keys. Without one of these, every new signup is dead on arrival. Cost note for the user: this session is flagged COST CRITICAL ($71.41) by the environment hooks — surfacing per instruction.

## All findings (grouped by severity)

### CRITICAL (22)

#### C1. [cataloged] config-reactivity — `src/pages/portal/PortalPurchasesPage.tsx`:12-14

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `function formatCurrency(amount: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }`
- **root cause:** Page-local hardcoded formatter with currency:'USD' and locale 'en-US'. This is a CUSTOMER-FACING portal purchases screen — a non-US tenant's customer sees their purchases in US dollars. Not reactive to any settings change; completely independent of TenantConfig.
- **fix:** Use useCurrency()/formatCurrencyWithConfig with the tenant (or document) currency config; remove the local formatter.

#### C2. [cataloged] Credit Notes — `src/components/financial/CreditNoteModal.tsx`:86

- **gapType:** default_usd · **userFacing:** true
- **current:** `currency: invoice.currency ?? 'USD',`
- **root cause:** When the parent invoice row has no stored currency, the credit note is initialized with the literal 'USD' and that value is stamped into credit_notes.currency via issueCreditNote -> applyCreditNote. A credit note is a legal financial instrument; the wrong currency is permanently persisted, corrupting all downstream display, reporting, and PDF generation. useCurrency() is already destructured at line 42 but currencyFormat.currencyCode is not used for this field.
- **fix:** Replace `invoice.currency ?? 'USD'` with the resolved tenant currency code: `invoice.currency ?? currencyFormat.currencyCode` (currencyFormat already comes from useCurrency()/useCurrencyConfig()). For a true multi-currency invoice the invoice.currency should always be present; the fallback must never fabricate USD.

#### C3. [cataloged] Customer Portal — `src/pages/portal/PortalDashboard.tsx`:231

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(quote.total_amount).toLocaleString()}`
- **root cause:** Quotes-awaiting-response card total on the customer Portal Dashboard uses the browser system locale with no currency symbol or ISO code; a customer of a non-USD lab sees e.g. '1,500' with no currency indicator.
- **fix:** Inject useCurrency() and render formatCurrency(Number(quote.total_amount)).

#### C4. [cataloged] Customer Portal — `src/pages/portal/PortalPurchasesPage.tsx`:13

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}`
- **root cause:** A local formatCurrency hardcodes both en-US locale and USD currency, then is used for the Total Spent stat card (line 100), each line-item total (line 155), and each sale total (line 163). Customers of any non-USD tenant (OMR, GBP, EUR) see all purchase amounts in USD with US number formatting.
- **fix:** Delete the local function; use const { formatCurrency } = useCurrency() (the canonical formatCurrencyWithConfig path) for all three call sites, matching PortalPayments which already does this.

#### C5. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:253

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(quote.total_amount).toLocaleString()}`
- **root cause:** Pending-quote list card total is rendered with bare Number().toLocaleString() using the browser system locale and NO currency symbol or ISO code. The customer being asked to respond cannot identify the currency of the quote.
- **fix:** Add const { formatCurrency } = useCurrency() (or useCurrencyConfig() + formatCurrencyWithConfig) and render formatCurrency(Number(quote.total_amount)).

#### C6. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:307

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(quote.total_amount).toLocaleString()}`
- **root cause:** Processed/approved quote-history card total uses bare toLocaleString() with no symbol or ISO code; customer viewing quote history sees a number with no currency context.
- **fix:** Render formatCurrency(Number(quote.total_amount)) from useCurrency().

#### C7. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:378

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(item.unit_price).toLocaleString()}`
- **root cause:** Quote Detail modal line-item unit price is a bare number with browser locale and no symbol; on a legally-significant approval modal each line item's currency is unidentifiable.
- **fix:** Render formatCurrency(Number(item.unit_price)) from useCurrency().

#### C8. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:381

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(item.total_price).toLocaleString()}`
- **root cause:** Quote Detail modal line-item total is a bare number with browser locale and no symbol (same as unit price).
- **fix:** Render formatCurrency(Number(item.total_price)) from useCurrency().

#### C9. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:392

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(selectedQuote.subtotal).toLocaleString()}`
- **root cause:** Subtotal row in the Quote Detail modal footer is a bare number with no symbol/ISO code; customer cannot verify subtotal currency before approving.
- **fix:** Render formatCurrency(Number(selectedQuote.subtotal)) from useCurrency().

#### C10. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:401

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `-{Number(selectedQuote.discount_amount).toLocaleString()}`
- **root cause:** Discount row in the Quote Detail modal footer uses bare toLocaleString() with browser locale and no symbol; tenant-configured locale, decimals, and symbol are bypassed.
- **fix:** Render '-' + formatCurrency(Number(selectedQuote.discount_amount)) (prepend the minus outside the formatted value) from useCurrency().

#### C11. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:411

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(selectedQuote.tax_amount).toLocaleString()}`
- **root cause:** Tax row in the Quote Detail modal footer is a bare number with browser locale and no symbol; for a VAT-registered non-USD tenant the customer cannot tell the tax figure's currency.
- **fix:** Render formatCurrency(Number(selectedQuote.tax_amount)) from useCurrency().

#### C12. [cataloged] Customer Portal — `src/pages/portal/PortalQuotes.tsx`:420

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{Number(selectedQuote.total_amount).toLocaleString()}`
- **root cause:** Grand-total row in the Quote Detail modal footer — the most prominent figure a customer sees before approving/rejecting — is a bare number with browser locale and no symbol or ISO code. Legally ambiguous on a customer-approval surface.
- **fix:** Render formatCurrency(Number(selectedQuote.total_amount)) from useCurrency().

#### C13. [cataloged] Invoices / Case Finances — `src/components/cases/detail/CaseFinancesTab.tsx`:207, 208, 209, 328, 329, 330, 337, 338, 339, 345, 346, 347

- **gapType:** default_usd · **userFacing:** true
- **current:** `formatCurrencyAmount(quote.total_amount || 0, quote.currency_symbol || 'USD', quote.currency_position || 'after', quote.decimal_places || 2)  // repeated for invoice total / paid / balance`
- **root cause:** Quote total, invoice total, the 'Paid' sub-line and the 'Balance' sub-line on the Case Finances tab all fall back to symbol='USD', position='after', decimals=2 when the row lacks per-row currency stamps. getInvoicesByCaseId/getQuotesByCaseId now source those stamps from getTenantConfig (so they are usually present), but the `|| 'USD'` terminal fallback still fabricates USD for any row missing the stamp, and the values are fed into a hand-rolled formatter (see next finding). An OMR tenant can see 'USD 1,500'.
- **fix:** Drop the per-row currency_symbol/position/decimal_places fields from CaseQuoteRow/CaseInvoiceRow and replace every formatCurrencyAmount(...) call with formatCurrencyWithConfig(amount ?? 0, currencyConfig) from useCurrencyConfig() (or the canonical formatCurrency prop already passed from CaseDetail). Then stop annotating rows in invoiceService/quotesService.

#### C14. [cataloged] Invoices — `src/components/documents/InvoiceDocument.tsx`:268, 305, 308, 323, 332, 341, 348, 357, 363

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{currencyFormat.currencySymbol}{invoice.total_amount?.toFixed(currencyFormat.decimalPlaces) || (0).toFixed(currencyFormat.decimalPlaces)}  // and {currencyFormat.currencySymbol} {item.unit_price.toFixed(currencyFormat.decimalPlaces)}`
- **root cause:** The on-screen printable invoice preview (rendered by InvoiceDetailPage and reportPDFService) concatenates `${symbol}${toFixed(decimals)}` for Invoice Value, every line-item unit price and amount, subtotal, discount, VAT, total, amount paid and balance due. Symbol and decimal count are now correct (sourced from useCurrency), but there is NO thousands separator and the symbol is ALWAYS prepended — the tenant's position='after' (e.g. GBP/OMR labs that put the symbol after) and negativeFormat are ignored. An OMR 10,500.500 invoice renders 'ر.ع.10500.500' with no comma and the symbol on the wrong side, on a customer-facing legal document.
- **fix:** Add a formatMoney prop bound to formatCurrencyWithConfig(amount, currencyConfig) and replace every `${currencyFormat.currencySymbol}{x.toFixed(...)}` call. InvoiceDetailPage already has formatCurrency from useCurrency() to pass down. Removes separator/position/negativeFormat bypass in one change.

#### C15. [cataloged] Payroll WPS bank file export — `src/lib/payrollService.ts`:930

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `[..., netSalary.toFixed(2), 'USD', bank_name].join('|')`
- **root cause:** generateWPSFileContent hardcodes USD currency code in every WPS bank-submission record; an OMR or AED tenant submits a salary file declaring USD per employee, causing bank rejections. toFixed(2) also hardcodes 2 decimals. Corrupts bank-submitted data.
- **fix:** Thread tenant currency code and decimalPlaces into generateWPSFileContent; replace USD with currencyConfig.code and toFixed(2) with toFixed(currencyConfig.decimalPlaces).

#### C16. [cataloged] Payroll — `src/lib/format.ts`:75

- **gapType:** default_usd · **userFacing:** true
- **current:** `formatCurrency currency equals USD en-US`
- **root cause:** upstream USD default for payroll screens CL-001
- **fix:** remove USD default

#### C17. [cataloged] Payroll — `src/lib/payrollService.ts`:930

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `WPS row literal USD plus toFixed 2`
- **root cause:** WPS currency column hardcoded USD for all tenants CL-033
- **fix:** use tenant currency code and decimals

#### C18. [NEW] provisioning-tenant — `src/lib/tenantConfigService.ts`:75 (resolveTenantConfigFromLayers call) + 112-118 (tax.label/tax.default_rate via get())

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `const resolved = resolveTenantConfigFromLayers(data as Record<string, unknown>, layers);
...
tax: {
  label: get<string>('tax.label'),        // required → throws if unresolved (D9)
  ...
  defaultRate: get<number>('tax.default_rate'), // r`
- **root cause:** For a new tenant resolved_country_config={} so layers.country is empty; the tenant layer is the folded default accounting_locale which (per buildConfigLayers.localeToBag) carries ONLY currency.code, datetime.date_format, locale.code — NOT tax.label or tax.default_rate. Those keys are required in the registry (codedDefault=REQUIRED_SENTINEL), so get() throws CountryConfigError. This makes getTenantConfig reject for every freshly provisioned tenant.
- **fix:** Primary fix is upstream (populate resolved_country_config at provisioning). Defensively, localeToBag/buildConfigLayers could also fold the denormalized tenant columns (tax_label, default_tax_rate, timezone, currency_symbol, ...) into the tenant layer so a tenant with only scalar columns still resolves; but the clean fix is to ensure resolved_country_config is written at creation.

#### C19. [NEW] provisioning-tenant — `supabase/functions/provision-tenant/index.ts`:263-278

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `const { data: tenant, error: tenantError } = await supabase
  .from('tenants')
  .insert({
    name, slug, plan_id: planId, country_id: countryId, status: 'trial',
    trial_ends_at: ...,
    ...(base_currency_code ? { base_currency_code } `
- **root cause:** Provisioning fills the denormalized scalar config columns (via trigger + explicit company_settings/accounting_locales/legal_entities inserts) but never populates tenants.resolved_country_config, which is the ONLY config source the runtime resolver (resolveTenantConfigFromLayers) reads. _apply_country_config / resync_tenant_country_config is never invoked during provisioning. The column defaults to '{}'::jsonb, so the new tenant's country snapshot bag is empty.
- **fix:** After the tenants INSERT (and before returning success), call await supabase.rpc('resync_tenant_country_config', { p_tenant_id: tenant.id }) (or _apply_country_config) so resolved_country_config is populated atomically at creation. Treat failure as fail-loud (soft-delete rollback like the legal_entities/onboarding inserts). Alternatively add an AFTER INSERT trigger on tenants that calls _apply_country_config(NEW.id).

#### C20. [NEW] provisioning-tenant — `supabase/functions/provision-tenant/index.ts (live DB function sync_tenant_config_from_country)`:sync_tenant_config_from_country() — BEFORE INSERT/UPDATE trigger on tenants

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `NEW.currency_code := COALESCE(NEW.currency_code, cc.currency_code);
NEW.currency_symbol := COALESCE(NEW.currency_symbol, cc.currency_symbol);
... (tax_label, default_tax_rate, locale_code, timezone, date_format, fiscal_year_start, ui_langua`
- **root cause:** The only config-related insert trigger on tenants writes the denormalized SCALAR columns but not the resolved_country_config JSONB. The runtime resolver ignores those scalar columns (the legacy mapRowToConfig path that read them is dead code) and reads only resolved_country_config, so the trigger's work does not feed the engine path for new tenants.
- **fix:** Either extend this trigger (or add an AFTER INSERT trigger) to also build/assign resolved_country_config from geo_countries (mirroring _apply_country_config's jsonb_build_object || country_config), or rely on provision-tenant calling resync_tenant_country_config. Pick one canonical writer so new tenants get the JSONB bag at creation.

#### C21. [cataloged] Sales / Portal — `src/pages/portal/PortalPurchasesPage.tsx`:12-13

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `function formatCurrency(amount: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }`
- **root cause:** Customer-facing portal Purchases page defines a local formatCurrency that hardcodes both 'en-US' locale and 'USD' currency; every amount a customer of a non-USD tenant (OMR/GBP/EUR) sees on their purchase history is rendered in USD with US formatting. Used at lines 100 (Total Spent), 155 (per-item total), 163 (per-sale total).
- **fix:** Source the tenant currency for the portal session (PortalAuthContext / tenant config) and format via formatCurrencyWithConfig(amount, currencyConfig); replace the local helper at all four call sites (12-13 def, 100, 155, 163).

#### C22. [cataloged] Stock — `src/pages/stock/StockSaleDetailPage.tsx`:39-42

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};`
- **root cause:** Local 3-dp helper with no symbol drives the entire per-sale financial record: unit_price, discount, tax_amount, line total, subtotal, discount_amount, tax_amount, grand total (lines 300-347). This is a financial document surface, so wrong decimals/no symbol is critical.
- **fix:** Replace the local helper with `const { formatCurrency } = useCurrency()`; keep the null guard by wrapping (value==null ? '—' : formatCurrency(value)).

### HIGH (49)

#### H1. [cataloged] Banking — `src/components/banking/RecordReceiptModal.tsx`:88, 338, 342, 346, 352-355, 367, 455, 548, 615, 618, 622, 649, 680, 709

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `const { formatCurrencyValue } = useAccountingLocale();
... <p className="font-bold tabular-nums text-slate-900">{formatCurrencyValue(formData.amount)}</p> ... 'Record ${formatCurrencyValue(formData.amount)}' ... {acc.account_name} ({acc.acc`
- **root cause:** The Record Payment/Receipt modal — Received/Applied/Unapplied meter, outstanding-after line, every open-invoice card (Total/Paid/Outstanding), the per-invoice Apply input, the 'Full {amount}' button, the deposit-account dropdown balances, the settled-invoice history, and the submit button label — formats all amounts through useAccountingLocale, inheriting the same format gaps. This is the exact surface CL-064 flags, but the catalog's stated root cause ('reads accounting_locales') is now stale: the hook reads the Country Engine; the real defect is the hand-rolled format (no grouping, fixed separators, no displayMode/negativeFormat). Its sibling RecordPaymentModal already uses the canonical path, so this modal is inconsistent with the rest of payments.
- **fix:** Per CL-064: replace useAccountingLocale with useCurrencyConfig() and formatCurrencyWithConfig(amount, currencyConfig) for every formatCurrencyValue call, matching RecordPaymentModal.

#### H2. [cataloged] Banking — `src/hooks/useAccountingLocale.ts`:11-17

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrencyValue = (amount: number) => {
  const formattedAmount = amount.toFixed(currency.decimalPlaces);
  if (currency.position === 'before') {
    return '${currency.symbol} ${formattedAmount}';
  }
  return '${formattedAmount}`
- **root cause:** useAccountingLocale.formatCurrencyValue is a second, divergent formatter. It sources currency from useCurrencyConfig() (Country Engine) so symbol/decimals/position are correct, but it hand-rolls the output via amount.toFixed() and string concat. It therefore ignores currency.thousandsSeparator (NO digit grouping at all — 1234567.50 not 1,234,567.50), currency.decimalSeparator (hard period), currency.displayMode (always symbol, never the tenant's iso_code/symbol_code choice), and currency.negativeFormat (never parentheses). It also forces a space before a 'before'-position symbol where canonical renders none. This is the formatter behind every amount in BankingPage, RecordReceiptModal, and TransferFundsModal.
- **fix:** Deprecate/delete formatCurrencyValue. In each consumer call formatCurrencyWithConfig(amount, useCurrencyConfig()) which already honors thousandsSeparator, decimalSeparator, displayMode (via renderCurrencyToken) and negativeFormat. Long-term retire the useAccountingLocale hook (Phase-4 sweep) once banking + the other financial consumers are migrated.

#### H3. [NEW] Banking — `src/pages/financial/BankingPage.tsx`:34, 241, 247, 253, 309, 323-324, 339, 354-358, 514, 527, 570, 633, 643, 686, 723

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `const { formatCurrencyValue, locale, getCurrencySymbol, getCurrencyCode } = useAccountingLocale();
... {formatCurrencyValue(balanceSummary?.totalBankBalance || 0)} ...
... {formatCurrencyValue(account.current_balance)} ...
... {formatCurren`
- **root cause:** The entire Banking dashboard (4 summary stat cards, per-account balance list, balance-change deltas, transaction debit/credit columns, receipts list, transfers list, selected-account header) renders every monetary value via useAccountingLocale().formatCurrencyValue, inheriting all of its format gaps (no thousands grouping, wrong decimal/thousands separators for non-US tenants, no ISO-code display mode, no parentheses negatives). High-value balances like a 1,234,567.50 bank total render ungrouped as 1234567.50. This is the single most amount-dense screen in the app and the named #1 symptom.
- **fix:** Replace useAccountingLocale with const currencyConfig = useCurrencyConfig(); and swap every formatCurrencyValue(x) call for formatCurrencyWithConfig(x, currencyConfig). For the header label at line 233 use renderCurrencyToken(currencyConfig) instead of getCurrencyCode()/getCurrencySymbol().

#### H4. [cataloged] Cases — `src/components/cases/detail/CaseFinancesTab.tsx`:207

- **gapType:** default_usd · **userFacing:** true
- **current:** `Total: {formatCurrencyAmount(quote.total_amount || 0, quote.currency_symbol || 'USD', quote.currency_position || 'after', quote.decimal_places || 2)}`
- **root cause:** Quote total on the Case Finances tab. Although quotesService now supplies currency_symbol from getTenantConfig (Country Engine, not USD), the symbol can be an empty string when the tenant currency has no display glyph (code-only), and '' || 'USD' re-introduces 'USD'. It also routes through the hand-rolled formatCurrencyAmount (no thousands separator) and defaults position to 'after' and decimals to 2 (wrong for OMR=3/JPY=0).
- **fix:** Replace with formatCurrencyWithConfig(quote.total_amount ?? 0, currencyConfig) from useCurrencyConfig(); remove the '|| USD'/'|| after'/'|| 2' fallbacks and the per-row currency fields.

#### H5. [cataloged] Cases — `src/components/cases/detail/CaseFinancesTab.tsx`:328

- **gapType:** default_usd · **userFacing:** true
- **current:** `Total: {formatCurrencyAmount(invoice.total_amount || 0, invoice.currency_symbol || 'USD', invoice.currency_position || 'after', invoice.decimal_places || 2)}`
- **root cause:** Invoice total on the Case Finances tab. Same defect class as line 207: reachable 'USD' fallback when the resolved currency symbol is empty, plus the hand-rolled toFixed formatter with no thousands separator and 2dp/after defaults. (Lines 328-330 are the invoice-total block; CL-059.)
- **fix:** Replace with formatCurrencyWithConfig(invoice.total_amount ?? 0, currencyConfig) from useCurrencyConfig(); remove the legacy per-row symbol/position/decimal fields.

#### H6. [cataloged] Cases — `src/components/cases/detail/CaseFinancesTab.tsx`:337

- **gapType:** default_usd · **userFacing:** true
- **current:** `Paid: {formatCurrencyAmount(invoice.amount_paid ?? 0, invoice.currency_symbol || 'USD', invoice.currency_position || 'after', invoice.decimal_places || 2)}`
- **root cause:** The 'Paid' sub-line on each invoice card. Same reachable 'USD' fallback and hand-rolled formatter as the invoice total; staff see wrong/USD currency and wrong precision on the amount-paid line for non-USD tenants. (CL-060.)
- **fix:** Replace with formatCurrencyWithConfig(invoice.amount_paid ?? 0, currencyConfig) from useCurrencyConfig().

#### H7. [cataloged] Cases — `src/components/cases/detail/CaseFinancesTab.tsx`:345

- **gapType:** default_usd · **userFacing:** true
- **current:** `• Balance: {formatCurrencyAmount(invoice.balance_due ?? 0, invoice.currency_symbol || 'USD', invoice.currency_position || 'after', invoice.decimal_places || 2)}`
- **root cause:** The 'Balance' sub-line on each invoice card. Same reachable 'USD' fallback and hand-rolled formatter; staff see wrong/USD currency and wrong precision on the balance-due line. (CL-061.)
- **fix:** Replace with formatCurrencyWithConfig(invoice.balance_due ?? 0, currencyConfig) from useCurrencyConfig().

#### H8. [cataloged] Cases — `src/components/cases/detail/CaseFinancesTab.tsx`:497

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `<p className="text-sm font-bold text-warning">{expense.amount?.toFixed(2)}</p>`
- **root cause:** Case Expenses panel renders each expense amount with raw .toFixed(2) — no currency symbol at all, no thousands separator, and hardcoded 2 decimals (wrong for OMR=3/JPY=0). Staff cannot tell the currency and see wrong precision on every case expense.
- **fix:** Replace with formatCurrencyWithConfig(expense.amount ?? 0, currencyConfig) from useCurrencyConfig() (or the canonical formatCurrency prop already passed to CaseFinancesTab from useCurrency()).

#### H9. [NEW] Cases — `src/pages/cases/CaseDetail.tsx`:80

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrencyAmount = (amount, currencySymbol, currencyPosition, decimalPlaces) => {
  const formattedAmount = amount.toFixed(decimalPlaces);
  if (currencyPosition === 'before') { return '${currencySymbol} ${formattedAmount}'; }
  e`
- **root cause:** Root-cause closure passed as the formatCurrencyAmount prop into CaseFinancesTab. It hand-rolls money formatting with amount.toFixed(decimalPlaces) — NO thousands separator and NO decimalSeparator (so an OMR 10,500.500 prints '10500.500'), and it ignores renderCurrencyToken/display_mode (symbol vs ISO code) and negative_format entirely. Every quote total, invoice total, paid, and balance line on the case finances tab is rendered through it. This is the actual bug site behind CL-058..061.
- **fix:** Delete this closure. In CaseFinancesTab, replace all formatCurrencyAmount(...) call sites with formatCurrencyWithConfig(amount, currencyConfig) from useCurrencyConfig(); drop the formatCurrencyAmount prop and the per-row currency_symbol/position/decimal_places fields from CaseQuoteRow/CaseInvoiceRow.

#### H10. [cataloged] config-reactivity — `src/hooks/useAccountingLocale.ts`:11-17

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `const formatCurrencyValue = (amount: number) => { const formattedAmount = amount.toFixed(currency.decimalPlaces); if (currency.position === 'before') { return '${currency.symbol} ${formattedAmount}'; } return '${formattedAmount} ${currency.`
- **root cause:** The deprecated useAccountingLocale hook is now backed by TenantConfigContext (so it IS reactive to settings), but it ships its OWN inline currency formatter that bypasses formatCurrencyWithConfig: no thousands separators, no displayMode token (always symbol), no negativeFormat handling, always symbol+space. It is still imported by 4 financial surfaces (TransferFundsModal, RecordReceiptModal, BankingPage, LineItemTemplateFormModal), which therefore render currency inconsistently with the rest of the app.
- **fix:** Replace the inline formatCurrencyValue with formatCurrencyWithConfig(amount, currency); migrate the 4 callers off useAccountingLocale onto useCurrency()/useCurrencyConfig() and retire the hook.

#### H11. [cataloged] config-reactivity — `src/lib/format.ts`:75

- **gapType:** default_usd · **userFacing:** true
- **current:** `export const formatCurrency = (amount: number, currency = 'USD', localeCode?: string): string => { ... new Intl.NumberFormat(isArabic ? localeCode : DEFAULT_LOCALE, { style: 'currency', currency }) ... }`
- **root cause:** CL-001: the central formatCurrency defaults currency to 'USD'. Any caller that omits the currency argument silently renders US dollars for every tenant. This is the root of the ~55-caller CL-001 fan-out and is the single most dangerous default in the formatter layer.
- **fix:** Make currency a required parameter (remove the = 'USD' default) so omission is a compile error, forcing callers to thread the tenant's currency code; or deprecate this in favor of formatCurrencyWithConfig. Thread localeCode from useLocaleConfig rather than relying on DEFAULT_LOCALE.

#### H12. [cataloged] config-reactivity — `src/lib/tenantConfigService.ts`:10-11, 200-209

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `const configCache = new Map<string, { config: TenantConfig; timestamp: number }>(); const CACHE_TTL_MS = 5 * 60 * 1000; ... export async function getTenantConfig(tenantId) { const cached = configCache.get(tenantId); if (cached && Date.now()`
- **root cause:** Module-level cache with a time-only TTL and no event-based busting. Every imperative (non-hook) consumer — PDF dataFetcher, invoice/quote services, templateContextService — reads through this cache, so after a tenant changes currency they keep rendering the OLD CurrencyConfig for up to 5 minutes unless invalidateTenantConfigCache(tenantId) is explicitly called. That invalidation is only triggered from refreshConfig(), which most mutation paths (notably CurrencySettings) do not call.
- **fix:** Make explicit invalidation the primary mechanism: ensure every tenant-config write path invalidates the cache (ideally via one shared mutate-and-invalidate service so callers cannot forget). Keep the 5-min TTL only as a backstop. Consider a cross-tab signal (storage event / BroadcastChannel) so a change in one tab busts other tabs' caches.

#### H13. [NEW] config-reactivity — `src/pages/settings/CurrencySettings.tsx`:40-58

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `const onAdd = async () => { ... await addTenantCurrency(selected); toast.success('${selected} added'); await refresh(); }; const onToggle = async (row) => { await setCurrencyActive(row.id, !row.is_active); await refresh(); };`
- **root cause:** The currency settings surface mutates tenant currency state via tenantCurrencyService but never calls refreshConfig() or invalidateTenantConfigCache(). refresh() only re-fetches this component's own local rows list, not the shared TenantConfigContext nor the getTenantConfig module cache. So changing the base/active currency (and, per the P3 catalog, display_mode/negative_format) does not propagate to any other screen or PDF until a full page reload — and even then imperative getTenantConfig() consumers stay stale up to the 5-min TTL.
- **fix:** Pull refreshConfig from useTenantConfig() and await it after addTenantCurrency/setCurrencyActive (and after any display_mode/negative_format write). This invalidates the module cache and re-broadcasts config to all reactive useCurrencyConfig() consumers.

#### H14. [cataloged] config-reactivity — `src/pages/stock/StockListPage.tsx`:58-59

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrency = (value: number): string => value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });`
- **root cause:** Stock list (and the identical formatters in StockSalesPage.tsx:25 and StockSaleDetailPage.tsx:39) render monetary values with toLocaleString and a HARDCODED 3 decimal places and NO currency symbol/code at all. They are currency-blind: a 2-decimal-currency tenant (USD/EUR) sees 3 decimals, and no symbol identifies the currency. Not reactive to settings; bypasses the central formatter entirely.
- **fix:** Replace all three with useCurrency()/formatCurrencyWithConfig so decimals come from config.currency.decimalPlaces and the tenant currency token is shown.

#### H15. [cataloged] Expenses / Case Finances — `src/components/cases/detail/CaseFinancesTab.tsx`:497

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `<p className="text-sm font-bold text-warning">{expense.amount?.toFixed(2)}</p>`
- **root cause:** Case expense amounts render with a bare toFixed(2) — no currency symbol at all, no thousands separator, hardcoded 2 decimals. OMR (3dp) tenants see wrong precision and NO currency indicator on every expense line; the number is ambiguous.
- **fix:** Replace with formatCurrencyWithConfig(expense.amount ?? 0, currencyConfig) from useCurrencyConfig() (or the formatCurrency prop already on CaseFinancesTab).

#### H16. [NEW] Expenses — `src/pages/financial/ExpensesList.tsx`:581

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `{formatCurrency(expense.amount)}`
- **root cause:** Same multi-currency base-amount mismatch as CL-070: the per-row expense amount renders the document-currency expense.amount with the base-currency formatter, while the stats card at line 250 correctly uses baseAmount(exp, 'amount'). A foreign-currency expense on a multi-currency tenant shows the raw foreign magnitude with the base symbol. amount_base is already selected (line 119) and imported via baseAmount (line 11) — just not used in the row.
- **fix:** Render the per-row amount with baseAmount(expense, 'amount') wrapped in formatCurrency, matching the stats card; or display the document amount with its own document currency if multi-currency per-row display is intended.

#### H17. [NEW] Invoices / Case Finances — `src/pages/cases/CaseDetail.tsx`:80-92

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrencyAmount = (amount, currencySymbol, currencyPosition, decimalPlaces) => { const formattedAmount = amount.toFixed(decimalPlaces); if (currencyPosition === 'before') { return '${currencySymbol} ${formattedAmount}'; } else { `
- **root cause:** CaseDetail defines a hand-rolled currency formatter and passes it as the formatCurrencyAmount prop to CaseFinancesTab. It uses raw toFixed with no thousands separator and ignores displayMode (symbol vs ISO) and negativeFormat. This is the formatter that consumes the `|| 'USD'` arguments above, so it is the mechanical root of the CaseFinancesTab leak.
- **fix:** Delete formatCurrencyAmount and the formatCurrencyAmount prop; have CaseFinancesTab use formatCurrencyWithConfig(amount, currencyConfig) via useCurrencyConfig() directly (the canonical formatCurrency prop from useCurrency() is already available and passed too).

#### H18. [cataloged] Invoices — `src/components/cases/InvoiceFormModal.tsx`:424

- **gapType:** default_usd · **userFacing:** true
- **current:** `const docCurrency = invoiceData.currency || baseCurrency || 'USD';`
- **root cause:** When both invoiceData.currency and baseCurrency are unresolved (async window or misconfigured tenant), docCurrency falls back to 'USD'. The Summary panel and discount label pass docCurrency into formatCurrency(v, docCurrency), so amounts display as USD and an invoice can be created/stored with currency USD for a non-USD tenant.
- **fix:** Derive baseCurrency from useCurrencyConfig().code so the terminal `|| 'USD'` is unreachable, then remove it. (Keeping format.ts formatCurrency(amount, docCurrency) is correct for genuine multi-currency documents — only the USD fallback is the bug.)

#### H19. [NEW] Invoices — `src/components/documents/InvoiceDocument.tsx`:338

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `VAT {invoice.tax_rate || 0}% | ضريبة القيمة المضافة:`
- **root cause:** The tax label on the on-screen printable invoice preview is hardcoded 'VAT' (with a hardcoded Arabic VAT gloss) regardless of the tenant's statutory tax system. GST/Sales-Tax jurisdictions (Australia, India, Canada, US) print invoices with the wrong tax label. Same class as cataloged CL-017 (credit note PDF) but on the invoice HTML preview, which is not separately listed for this file.
- **fix:** Source the label from useTaxConfig().label (TaxConfig) and render `${taxConfig.label} ${invoice.tax_rate || 0}%`; drop the hardcoded Arabic VAT gloss or derive it from the tax config / translation key.

#### H20. [NEW] Payments — `src/pages/financial/PaymentsList.tsx`:529

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `{formatCurrency(payment.amount)}`
- **root cause:** Same multi-currency base-amount mismatch as CL-070: the per-row payment amount renders document-currency payment.amount with the base-currency formatter, while the total at line 285 correctly uses baseAmount(payment, 'amount'). amount_base is selected (line 93) and baseAmount imported (line 20) but not used in the row.
- **fix:** Render the per-row amount via baseAmount(payment, 'amount') with formatCurrency, consistent with totalPayments; or show document amount with its document currency if per-row multi-currency display is intended.

#### H21. [cataloged] Payroll defaults — `src/lib/payrollService.ts`:47

- **gapType:** default_usd · **userFacing:** true
- **current:** `currency: { code: 'USD', symbol: '$', decimals: 2 }`
- **root cause:** DEFAULT_PAYROLL_SETTINGS seeds USD/$/2dp; parsePayrollSettings falls back to these when JSONB lacks currency, leaking USD into payslips and WPS export (CL-030/031/032).
- **fix:** Remove the hardcoded currency from DEFAULT_PAYROLL_SETTINGS and parsePayrollSettings; resolve from TenantConfigContext / useCurrencyConfig() or inject CurrencyConfig.

#### H22. [NEW] Print payment receipt — `src/components/documents/PaymentReceiptDocument.tsx`:68-70

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `return currencyFormat.currencySymbol + amount.toFixed(currencyFormat.decimalPlaces)`
- **root cause:** React print component rendered by PrintPaymentReceiptPage re-implements currency formatting instead of calling formatCurrencyWithConfig. Symbol and decimals from useCurrency() are right but it always prepends symbol (ignores position), has no thousands separator, and cannot honor display_mode or negative_format. Null branch hardcodes 0.00. Separate file from cataloged pdfmake builder; not in catalog.
- **fix:** Thread CurrencyConfig from useCurrencyConfig() in PrintPaymentReceiptPage and replace the closure with formatCurrencyWithConfig(amount ?? 0, currencyConfig); update call sites 291, 335, 352.

#### H23. [NEW] provisioning-tenant — `src/contexts/TenantConfigContext.tsx`:72-78, 103-112

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `} catch (err) {
  if (err instanceof CountryConfigError) {
    logger.error('Tenant country config unresolved (fail-loud):', err);
    setConfigError('This tenant is not configured for its country.');
    setConfig(DEFAULT_TENANT_CONFIG);
 `
- **root cause:** The fail-loud gate works as designed (it does NOT silently render USD — good), but because new-tenant provisioning never populates resolved_country_config, this block screen is the GUARANTEED outcome for every freshly provisioned tenant. The provider renders a full-screen 'Tenant not configured' wall instead of the app. This is the user-visible symptom of the provisioning gap; it is reported here to document the blast radius (entire app blocked), not because the catch logic itself is wrong.
- **fix:** No change needed in this file — fix the upstream write path (populate resolved_country_config at provisioning). Optionally add an admin-actionable 'Resync country config' button on this block screen that calls resyncTenantCountryConfig so a blocked owner can self-recover.

#### H24. [NEW] provisioning-tenant — `src/lib/country/buildConfigLayers.ts`:34-41 (localeToBag)

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `function localeToBag(locale: AccountingLocaleRow | null): ConfigBag {
  if (!locale) return {};
  const bag: ConfigBag = {};
  if (locale.currency_code) bag['currency.code'] = locale.currency_code;
  if (locale.date_format) bag['datetime.da`
- **root cause:** The only fallback layer available to a tenant whose resolved_country_config is empty is the folded default accounting_locale, but this projection deliberately folds just three keys and omits the REQUIRED tax.label and tax.default_rate (and timezone). So even though provision-tenant DID insert a default accounting_locale, that locale cannot satisfy the resolver's required-key check, and the tenant still throws.
- **fix:** This is by design (accounting_locale carries no tax columns), so the real fix is ensuring resolved_country_config is populated at provisioning. Do NOT widen localeToBag to fabricate tax values — keep the fail-loud contract and fix the write path instead.

#### H25. [NEW] provisioning-tenant — `src/lib/tenantConfigService.ts`:231-238 (resyncTenantCountryConfig) — ZERO callers in src

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `export async function resyncTenantCountryConfig(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('resync_tenant_country_config', { p_tenant_id: tenantId });
  ...
  invalidateTenantConfigCache(tenantId);
}`
- **root cause:** The only client-side path that populates resolved_country_config (via _apply_country_config) is resyncTenantCountryConfig, and grep of the entire src tree shows it has ZERO callers — it is not wired into provisioning, onboarding (OnboardingPage.tsx does not reference it), or any admin/Localization-Center surface in the current branch. So there is no automatic repair path; a misprovisioned tenant stays blocked until an operator runs SQL manually.
- **fix:** Wire resyncTenantCountryConfig into the Localization Center 'resync country config' action AND/OR call resync_tenant_country_config from provision-tenant at creation. At minimum it must be reachable so an admin can self-serve recovery from the 'Tenant not configured' state.

#### H26. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrderDetailPage.tsx`:223

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${item.unit_price?.toFixed(2) || '0.00'}`
- **root cause:** Line-item Unit Price column hardcodes a literal '$' prefix and toFixed(2); never uses the tenant CurrencyConfig. Wrong symbol for all non-USD tenants and wrong decimal count for OMR/KWD/BHD (3dp) and JPY (0dp).
- **fix:** Import useCurrencyConfig() + formatCurrencyWithConfig and render {formatCurrencyWithConfig(item.unit_price ?? 0, currencyConfig)}.

#### H27. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrderDetailPage.tsx`:226

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${item.total?.toFixed(2) || '0.00'}`
- **root cause:** Line-item Total column hardcodes '$' + toFixed(2); same symbol/decimal/separator bypass on every PO line row.
- **fix:** Replace with formatCurrencyWithConfig(item.total ?? 0, currencyConfig).

#### H28. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrderDetailPage.tsx`:237

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${order.subtotal?.toFixed(2) || '0.00'}`
- **root cause:** Subtotal footer row hardcodes '$' + toFixed(2) with no thousands separator; wrong symbol and precision for non-USD tenants on the procurement summary.
- **fix:** Replace with formatCurrencyWithConfig(order.subtotal ?? 0, currencyConfig).

#### H29. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrderDetailPage.tsx`:245

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${order.tax_amount?.toFixed(2) || '0.00'}  (label 'Tax:' hardcoded at line 242)`
- **root cause:** Tax footer row hardcodes '$' + toFixed(2) for the amount AND the label is the literal 'Tax:' rather than taxConfig.label; GST/Sales-Tax jurisdictions see the wrong label and all non-USD tenants see the wrong symbol/precision.
- **fix:** Replace amount with formatCurrencyWithConfig(order.tax_amount ?? 0, currencyConfig); replace 'Tax:' (line 242) with taxConfig.label from useTaxConfig().

#### H30. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrderDetailPage.tsx`:253

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${order.total_amount?.toFixed(2) || '0.00'}`
- **root cause:** Grand Total row — the most prominent figure managers see when reviewing/approving a PO — hardcodes '$' + toFixed(2); wrong symbol and decimal count for non-USD tenants.
- **fix:** Replace with formatCurrencyWithConfig(order.total_amount ?? 0, currencyConfig).

#### H31. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrdersListPage.tsx`:193

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `${(order.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
- **root cause:** Total Amount column in the PO list table hardcodes '$' and en-US locale with fixed 2 decimals; every row shows wrong symbol, separators, and precision for non-US/non-USD tenants.
- **fix:** Add useCurrencyConfig() and replace the whole expression with formatCurrencyWithConfig(order.total_amount ?? 0, currencyConfig).

#### H32. [cataloged] Purchase Orders — `src/pages/suppliers/PurchaseOrdersListPage.tsx`:249

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `value={'$${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}'}`
- **root cause:** The 'Total Value' StatsCard headline at the top of the PO list page hardcodes '$' and 'en-US' with 2 decimals; first-seen headline figure shows the wrong currency for non-USD tenants. (Underlying aggregation via baseAmount() is correct; only the display string is wrong.)
- **fix:** After importing useCurrencyConfig(), set value={formatCurrencyWithConfig(stats.totalValue, currencyConfig)}.

#### H33. [cataloged] Quotes — `src/components/cases/QuoteFormModal.tsx`:346

- **gapType:** default_usd · **userFacing:** true
- **current:** `const docCurrency = quoteData.currency || baseCurrency || 'USD';`
- **root cause:** Quote creation/edit modal falls back to 'USD' when both quoteData.currency and baseCurrency are unresolved; a customer-facing quote can be created and sent with USD if baseCurrency is not yet resolved at render time.
- **fix:** Derive baseCurrency from useCurrencyConfig().code and remove the `|| 'USD'` terminal fallback.

#### H34. [cataloged] Quotes — `src/pages/quotes/QuotesListPage.tsx`:765, 820

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `total: Math.round(item.quantity * item.unit_price * 100) / 100,`
- **root cause:** Both the quote edit (765) and create/insert (820) paths round each line-item total to exactly 2 decimals regardless of tenant currency (OMR/KWD/BHD=3, JPY=0). The persisted quote_items.total is wrong for those tenants and downstream invoice conversion carries the incorrect amounts — this corrupts stored data, not just display.
- **fix:** Replace the inline Math.round(...*100)/100 with roundMoney(item.quantity * item.unit_price, documentDecimals) from financialMath.ts, where documentDecimals = getCurrencyDecimals(tenantCurrency) (or the document currency's ISO decimals).

#### H35. [NEW] Receipts — `src/components/documents/PaymentReceiptDocument.tsx`:68-70 (used at 291, 335, 352)

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrency = (amount) => { if (amount == null) return '${currencyFormat.currencySymbol}0.00'; return '${currencyFormat.currencySymbol}${amount.toFixed(currencyFormat.decimalPlaces)}'; };`
- **root cause:** The on-screen payment receipt preview (rendered by PaymentReceiptModal and PrintPaymentReceiptPage) defines a local formatter that concatenates symbol + toFixed(). Symbol/decimals are canonical (from useCurrency) but there is no thousands separator, the symbol is always prepended (ignores tenant position='after'), and the empty-state literal '0.00' hardcodes 2 decimals (wrong for OMR=3 / JPY=0). Customer-facing legal receipt.
- **fix:** Delete the local formatCurrency closure; accept a formatMoney prop bound to formatCurrencyWithConfig(amount, currencyConfig), or pass the full CurrencyConfig and call formatCurrencyWithConfig. Replace the '0.00' empty-state with formatCurrencyWithConfig(0, currencyConfig).

#### H36. [cataloged] Reports / Stock — Stock Valuation CSV export — `/Users/flowza/Documents/GitHub/Space_Recovery/src/pages/stock/StockReportsPage.tsx`:147-148

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `v.costValue.toFixed(3),
        v.sellValue.toFixed(3),`
- **root cause:** handleExportValuation builds the stock-valuation CSV by hard-coding toFixed(3) for the Cost Value and Sell Value columns instead of using the tenant's configured currency.decimalPlaces. The on-screen table immediately above uses formatCurrency() (canonical), but the export path was never routed through it, so it bakes in 3 decimals for every tenant. A JPY (0dp) tenant gets spurious .000 and a USD/GBP (2dp) tenant gets a wrong third decimal on a file fed into accounting reconciliation. Margin on line 149 is a percentage and is fine; this finding is only the two currency columns.
- **fix:** Pull decimals from useCurrencyConfig() — const { decimalPlaces } = useCurrencyConfig() — and use v.costValue.toFixed(decimalPlaces) / v.sellValue.toFixed(decimalPlaces) (or a shared numeric formatter taking the tenant decimal count). The cost_price/selling_price columns on lines 145-146 are emitted as raw String(...) and are also unformatted; consider routing those through the same decimal count for export consistency.

#### H37. [cataloged] Shared PDF helper default — `src/lib/pdf/utils.ts`:21

- **gapType:** default_usd · **userFacing:** true
- **current:** `currencyCode: string = 'USD', locale: string = 'en-US'`
- **root cause:** PDF utility formatCurrency defaults to USD/en-US; any call omitting currency renders USD on financial docs, and fixed fraction digits of 2 override ISO decimals (CL-055).
- **fix:** Remove USD and en-US defaults; require resolved CurrencyConfig.code/locale or repoint to formatCurrencyWithConfig; drop fixed fraction digits.

#### H38. [cataloged] Stock valuation CSV export — `src/pages/stock/StockReportsPage.tsx`:147-148

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `v.costValue.toFixed(3), v.sellValue.toFixed(3)`
- **root cause:** Stock valuation CSV writes cost/sell values with hardcoded toFixed(3), ignoring tenant decimalPlaces; JPY exports get spurious .000, USD gets 3dp (CL-101).
- **fix:** Use tenant currency.decimalPlaces from useCurrencyConfig() as the toFixed argument for the CSV cells.

#### H39. [cataloged] Stock — `src/components/stock/QuickSaleWidget.tsx`:26-28

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatAmount = (value: number | null): string => {
  if (value == null) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};`
- **root cause:** Quick Sale widget formats displayed totals (line 112) with hardcoded 2dp and no symbol; wrong decimals for 3dp currencies and no symbol shown to staff on the dashboard widget.
- **fix:** Use `const { formatCurrency } = useCurrency()` for the amount display.

#### H40. [cataloged] Stock — `src/components/stock/SaleableItemsGrid.tsx`:16-18

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatPrice = (price: number | null): string => {
    if (price == null) return '—';
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });`
- **root cause:** Product picker shown during POS sale entry displays selling_price (line 79) with hardcoded 2dp and no symbol; OMR-lab staff see truncated prices with no currency indicator while selecting items.
- **fix:** Use `const { formatCurrency } = useCurrency()` for the selling_price display.

#### H41. [cataloged] Stock — `src/components/stock/StockItemsTable.tsx`:61-67

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}`
- **root cause:** Shared table used across all stock list views; asymmetric min-2/max-3 decimals matches no tenant config and renders no symbol on cost_price/selling_price columns (lines 244, 250). Primary price display across the module.
- **fix:** Call `const { formatCurrency } = useCurrency()` inside the component and replace formatPrice for both price cells (preserve the null -> '—' guard).

#### H42. [cataloged] Stock — `src/components/stock/StockSaleModal.tsx`:312-313

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatAmount = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });`
- **root cause:** POS sale-entry modal: line totals, subtotal, discount, grand total, and the submit button label `Create Sale · ${formatAmount(total)}` (lines 426-561) all use hardcoded 2dp with no symbol. A 3dp-currency lab sees truncated amounts during sale entry, risking input error.
- **fix:** Add `const { formatCurrency } = useCurrency()` and replace formatAmount throughout the modal including the button label.

#### H43. [cataloged] Stock — `src/components/stock/StockSalesTable.tsx`:33-35

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatAmount = (value: number | null): string => {
  if (value == null) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};`
- **root cause:** Shared Stock Sales table money column (total_amount, line 134) uses hardcoded 2dp and no symbol; OMR/KWD/BHD tenants see truncated amounts, JPY sees spurious decimals.
- **fix:** Use `const { formatCurrency } = useCurrency()` for total_amount; keep the null guard.

#### H44. [cataloged] Stock — `src/pages/stock/StockListPage.tsx`:58-59

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrency = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });`
- **root cause:** Module-scope local helper with hardcoded 3 decimal places and no currency symbol/code; bypasses useCurrency()/formatCurrencyWithConfig. Used for the Stock Value KPI card (line 313) and the cost/selling price columns in both table and grid views (584, 587).
- **fix:** Delete the local helper; inside the component add `const { formatCurrency } = useCurrency()` and use it for stockValue and all price cells. This yields tenant symbol, position, decimals, and separators.

#### H45. [cataloged] Stock — `src/pages/stock/StockReportsPage.tsx`:147-148

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `v.costValue.toFixed(3),
v.sellValue.toFixed(3),`
- **root cause:** CSV export of the stock valuation report (handleExportValuation) hardcodes .toFixed(3) for cost and sell values, ignoring tenant decimalPlaces. A JPY tenant gets spurious .000 on every row; a USD tenant gets 3 decimals instead of 2 on a file used for accounting reconciliation. Note the in-app displays on this page already use useCurrency() (line 100) and are correct — only the export is unswept.
- **fix:** Read `const currency = useCurrencyConfig()` and use `currency.decimalPlaces` as the toFixed argument for both CSV columns.

#### H46. [cataloged] Stock — `src/pages/stock/StockSalesPage.tsx`:25-26

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `const formatCurrency = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });`
- **root cause:** Local 3-dp helper, no symbol; feeds the Today's-revenue and month-revenue KPI cards (lines 161, 173). Revenue figures shown to staff with wrong decimals and no currency indicator.
- **fix:** Delete the local helper; use `const { formatCurrency } = useCurrency()` for both revenue cards.

#### H47. [NEW] Suppliers — `src/pages/suppliers/SupplierProfilePage.tsx`:815

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `render: (order) => order.total_amount != null ? order.total_amount.toLocaleString() : '0.00'`
- **root cause:** OrdersTab 'Amount' column on the supplier profile renders PO totals with a bare .toLocaleString() and NO currency symbol at all, and uses the browser's default locale for separators; staff cannot identify the currency and non-US tenants get wrong separators. This is the supplier-profile view of PO amounts (separate surface from the cataloged PO detail/list).
- **fix:** Import useCurrency() and render formatCurrency(order.total_amount ?? 0) (use total_amount_base via baseAmount for multi-currency consistency if desired).

#### H48. [cataloged] Transactions — `src/pages/financial/TransactionsList.tsx`:450

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `{formatCurrency(transaction.amount)}`
- **root cause:** Per-row amount renders the document-currency transaction.amount with the base-currency formatter (formatCurrency = useCurrency, tenant base symbol), even though the stats cards at lines 173-174 correctly use baseAmount(t, 'amount'). On a multi-currency tenant a USD transaction on an OMR-base tenant shows the raw USD magnitude wearing the OMR symbol — a materially wrong figure on the in-app ledger.
- **fix:** Replace transaction.amount with baseAmount(transaction as unknown as Record<string, unknown>, 'amount') at line 450, consistent with the stats cards.

#### H49. [cataloged] VAT / Financial service — `src/lib/financialService.ts`:80-98

- **gapType:** reads_accounting_locales · **userFacing:** true
- **current:** `export const fetchDefaultLocale = async (): Promise<AccountingLocale | null> => { ... .from('accounting_locales').select('*').eq('is_default', true).maybeSingle(); ... }`
- **root cause:** fetchDefaultLocale reads the legacy accounting_locales table (the deprecated parallel source of truth). Its confirmed live caller is VATAuditPage.tsx (import at line 11, queryFn at line 204); a tenant whose legacy row is stale/absent or diverged from the Country Engine gets wrong currency data on the VAT audit screen.
- **fix:** Delete fetchDefaultLocale() and repoint VATAuditPage onto useCurrencyConfig()/useTenantConfig(); VATAuditPage already uses useCurrency().formatCurrency for its amounts, so the fetchDefaultLocale query appears to be vestigial and can likely be removed outright.

### MEDIUM (23)

#### M1. [NEW] Banking — `src/components/banking/AccountFormModal.tsx`:60-74

- **gapType:** reads_accounting_locales · **userFacing:** true
- **current:** `const { data: defaultLocale } = useQuery({
  queryKey: ['default_accounting_locale'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('accounting_locales')
      .select('currency_code')
      .eq('is_default`
- **root cause:** Genuine direct read of the legacy accounting_locales table (outside tenantConfigService) to choose the default currency for a NEW bank account. This is a true parallel source of truth: if the legacy default row diverges from the tenant's Country Engine currency (or is absent), new accounts are created/labelled with the wrong default currency, and the '(Default)' option in the currency picker (line 369) shows the legacy code. This is the only true accounting_locales read in the banking module.
- **fix:** Replace the accounting_locales query with useCurrencyConfig() — derive the default currency code from the Country Engine config (currencyConfig.code) and match it against master_currency_codes to preselect, instead of querying accounting_locales.

#### M2. [cataloged] Banking — `src/components/banking/RecordReceiptModal.tsx`:610, 681

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `Due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
... {receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString() : 'N/A'}`
- **root cause:** Invoice due dates (and elsewhere receipt/transfer dates) use Date.toLocaleDateString() with no locale/timezone args, so they render in the BROWSER's system locale, not the tenant's configured date format/timezone. An Omani operator on an en-US browser sees M/D/YYYY instead of the tenant format. CL-065 catalogs this for line 610.
- **fix:** Use formatDate(invoice.due_date, tenantDateFormat) / formatDateTimeWithConfig with DateTimeConfig from useDateTimeConfig()/useTenantConfig(), per CL-065.

#### M3. [NEW] Banking — `src/components/banking/TransferFundsModal.tsx`:21, 51, 128, 157

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `const { formatCurrencyValue } = useAccountingLocale();
... setWarning('Insufficient balance. Available: ${formatCurrencyValue(fromAccount.current_balance)}');
... {acc.account_name} - Balance: {formatCurrencyValue(acc.current_balance)}`
- **root cause:** The Transfer Funds modal formats the from/to account balances in both dropdowns and the insufficient-balance warning via useAccountingLocale, inheriting the hand-rolled format gaps (no grouping, fixed separators, no displayMode/negativeFormat).
- **fix:** Replace useAccountingLocale with useCurrencyConfig() + formatCurrencyWithConfig(amount, currencyConfig) for all three call sites.

#### M4. [NEW] Banking — `src/pages/financial/BankingPage.tsx`:231-235

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `{locale && (
  <span className="ml-2 text-sm text-slate-500">
    • Currency: {((c) => (typeof c === 'string' ? c : ''))(getCurrencyCode())} ({getCurrencySymbol()})
  </span>
)}`
- **root cause:** The header 'Currency: CODE (SYMBOL)' label is gated on `locale` which useAccountingLocale now hard-codes to null (return { locale: null }), so this entire currency-indicator line NEVER renders — the page no longer tells the user which currency is in effect. getCurrencyCode/getCurrencySymbol come from the deprecated hook and bypass the tenant's displayMode preference.
- **fix:** Drop the `locale &&` gate (it is permanently false) and render renderCurrencyToken(useCurrencyConfig()) directly, e.g. `• Currency: {renderCurrencyToken(currencyConfig)}`. This both restores the indicator and respects the tenant display_mode.

#### M5. [NEW] config-reactivity — `src/contexts/TenantConfigContext.tsx`:90-95

- **gapType:** not_reactive_to_settings · **userFacing:** false
- **current:** `const refreshConfig = useCallback(async () => { if (tenantId) { invalidateTenantConfigCache(tenantId); } await loadConfig(); }, [tenantId, loadConfig]);`
- **root cause:** refreshConfig is correct (busts module cache + reloads reactive context), but adoption is partial: grep shows callers are only AccountingLocales, FeaturesSettings, LocaleContext, ThemeContext. The reactivity contract therefore depends on every config-mutating UI remembering to call it, and the primary currency UI (CurrencySettings) does not. This is an architectural gap, not a bug in refreshConfig itself.
- **fix:** Centralize: have all tenant-config mutations go through a service that invalidates the cache, and expose refreshConfig adoption as a lint/checklist item; at minimum wire it into CurrencySettings (see the CurrencySettings finding).

#### M6. [cataloged] config-reactivity — `src/lib/format.ts`:11, 162, 170

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `const DEFAULT_LOCALE = 'en-US'; ... return new Intl.DateTimeFormat(DEFAULT_LOCALE, { ...baseOptions, ...(timeZone ? { timeZone } : {}), ... }).format(dateObj);`
- **root cause:** CL-003: formatDateTimeWithConfig formats dates/times with a hardcoded 'en-US' locale (DEFAULT_LOCALE). The tenant's resolved locale.localeCode is never used for the audit/date rendering path, so month/order/separator conventions are always US-English regardless of tenant country. (The same DEFAULT_LOCALE also backs formatCurrency, formatNumber.)
- **fix:** Thread the tenant locale (locale.localeCode from useLocaleConfig/TenantConfig) into formatDateTimeWithConfig instead of DEFAULT_LOCALE; keep 'en-US' only as the catch fallback for an unknown locale.

#### M7. [cataloged] config-reactivity — `src/lib/pdf/utils.ts`:19-35

- **gapType:** default_usd · **userFacing:** true
- **current:** `export function formatCurrency(amount, currencyCode: string = 'USD', locale: string = 'en-US'): string { ... new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 }) ..`
- **root cause:** Parallel PDF-layer formatter that (a) defaults currencyCode to 'USD' and locale to 'en-US', and (b) hardcodes 2 fraction digits, ignoring the tenant's decimalPlaces (wrong for OMR=3, JPY=0). Even though the P1 document render layer now sources currency from getTenantConfig, this helper still exists as a USD/2-decimal trap for any builder that calls it without args.
- **fix:** Route this through the resolved CurrencyConfig (use config.currency.decimalPlaces and the tenant currency code/locale); remove the USD and en-US defaults and the hardcoded fraction-digit overrides. Ideally have PDF builders call formatCurrencyWithConfig.

#### M8. [cataloged] Financial service — `src/lib/financialService.ts`:209-223

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `export const formatCurrencyWithLocale = (amount, locale: AccountingLocale): string => { const formattedNumber = amount.toFixed(locale.decimal_places ?? 2); ... const formattedInteger = parseInt(integerPart).toLocaleString('en-US'); ... }`
- **root cause:** formatCurrencyWithLocale accepts a legacy AccountingLocale, hardcodes toLocaleString('en-US') for thousands grouping (so a German/Swiss tenant sees 1,234.56 instead of 1.234,56) and reads the symbol/position from the legacy table. It is exported from the financial service; any caller bypasses the Country Engine separators.
- **fix:** Delete formatCurrencyWithLocale() and replace any caller with formatCurrencyWithConfig(amount, currencyConfig) sourced from useCurrencyConfig(). Confirm no remaining importers before removal (none found in src outside this file).

#### M9. [cataloged] Inventory — `src/components/inventory/InventoryInsightsHeader.tsx`:59-61

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };`
- **root cause:** Unit-count KPI cards (total units, item counts) format with hardcoded 'en-US' locale, so non-US-locale tenants get en-US thousands separators. The currency value on the same header is already correct (useCurrency, line 117) — only the unit-count number is unswept.
- **fix:** Use formatNumber() from src/lib/format.ts passing the tenant locale, or new Intl.NumberFormat(useTenantConfig().config.dateTime.locale).

#### M10. [cataloged] Invoices — `src/components/cases/InvoiceFormModal.tsx`:697-698

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{quote.quote_number} - {quote.title} ({currencyFormat.currencySymbol}{quote.total_amount?.toFixed(2)})`
- **root cause:** The quote-picker dropdown renders each quote total as symbol + toFixed(2): decimals hardcoded to 2 (breaks OMR 3dp / JPY 0dp), no thousands separator, symbol always prepended. Symbol is canonical but number formatting bypasses the central formatter.
- **fix:** Replace with formatCurrency(quote.total_amount ?? 0) using the useCurrency() hook (or formatCurrencyWithConfig). The useCurrency() hook is already imported at line 9.

#### M11. [cataloged] Invoices — `src/components/cases/InvoiceFormModal.tsx`:1088-1089

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{currencyFormat.currencySymbol}{(item.default_price ?? 0).toFixed(2)}`
- **root cause:** The Quick-Add catalog panel shows each item's price as symbol + toFixed(2) — same hardcoded 2dp / no-separator / fixed-position issues; a technician adding an OMR service item sees wrong precision.
- **fix:** Replace with formatCurrency(item.default_price ?? 0) using the canonical useCurrency() hook.

#### M12. [NEW] Notification dispatch render — `supabase/functions/notification-dispatch-email/index.ts`:31-37

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `template.replace(double-brace token, String(payload[key]))`
- **root cause:** Notification bodies use raw token substitution; amount tokens render raw numbers and currency renders bare ISO code with no formatter, so no symbol/separator/position/display_mode. Renders correct currency code from real data, so a formatting bypass not a wrong-currency leak. Deno function cannot import useCurrencyConfig.
- **fix:** Pre-format money before enqueue: write a tenant-formatted display string into event.payload via formatCurrencyWithConfig and reference that token in templates.

#### M13. [NEW] Purchase Orders — `src/pages/suppliers/PurchaseOrdersListPage.tsx`:296-299

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `columns: { key: 'subtotal', label: 'Subtotal' }, { key: 'tax_amount', label: 'Tax' }, { key: 'shipping_cost', label: 'Shipping' }, { key: 'total_amount', label: 'Total' }  (no format fn; raw numeric values exported)`
- **root cause:** The PO CSV/export emits Subtotal, Tax, Shipping and Total as raw unformatted numbers with no currency context. A 'Currency' ISO column is included (line 295), so the figures are not strictly wrong, but they carry no symbol/decimal formatting and bypass the central formatter — inconsistent with the tenant's decimal config (e.g. a JPY tenant exports decimals, an OMR tenant loses the 3rd decimal precision rule). Used for accounting reconciliation.
- **fix:** Add a format fn to each money column that applies the tenant currency.decimalPlaces (from useCurrencyConfig()) when serializing, or format via formatCurrencyWithConfig; at minimum align decimal precision to the tenant config.

#### M14. [NEW] Quotes — `src/components/cases/QuoteFormModal.tsx`:920

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{currencyFormat.currencySymbol}{item.default_price.toFixed(2)}`
- **root cause:** Quick-Add catalog item price in the quote modal uses symbol + toFixed(2) — hardcoded 2 decimals, no separator, fixed symbol position; wrong precision for 3dp/0dp currencies.
- **fix:** Replace with formatCurrency(item.default_price ?? 0) from the useCurrency() hook (imported at line 9).

#### M15. [NEW] Reports / Stock — Sales Report table — `/Users/flowza/Documents/GitHub/Space_Recovery/src/pages/stock/StockReportsPage.tsx`:409

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `? new Date(sale.sale_date as string).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })`
- **root cause:** The sale date in each row of the Sales Report table is rendered with toLocaleDateString hardcoded to the 'en-GB' locale, bypassing the tenant's DateTimeConfig. A US-locale (or ar-OM) tenant viewing this internal financial report sees British date ordering rather than their configured format. Not a currency leak but a date-localization inconsistency on a money-bearing report surface; not present in the audit catalog.
- **fix:** Replace with formatDate(sale.sale_date, tenantDateFormat, tenantLocale) (src/lib/format.ts) or formatDateTimeWithConfig() sourcing the locale/format from useDateTimeConfig()/useTenantConfig(), matching the canonical date path used elsewhere.

#### M16. [cataloged] Stock — `src/components/stock/StockAlertsDropdown.tsx`:132

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `{alert.created_at ? new Date(alert.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
- **root cause:** Stock alert timestamps hardcode 'en-GB' locale and 24h, ignoring tenant dateTime/timezone config; every low-stock/out-of-stock alert (visible to all staff) shows British date style and no timezone.
- **fix:** Use formatDateTimeWithConfig(alert.created_at, config.dateTime) from src/lib/format.ts via useDateTimeConfig()/useTenantConfig().

#### M17. [NEW] Stock — `src/pages/stock/StockAdjustmentsPage.tsx`:60-67

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}`
- **root cause:** Local date helper hardcodes 'en-GB' for the stock-adjustments list dates; tenant locale ignored. Not present in the catalog (the catalog covered StockItemDetail and StockAlertsDropdown date helpers but not this page).
- **fix:** Replace with formatDate(value, 'MMM dd, yyyy', locale) from src/lib/format.ts using the tenant locale.

#### M18. [cataloged] Stock — `src/pages/stock/StockItemDetail.tsx`:24-42

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });  // formatDate
... return new Date(dateStr).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', m`
- **root cause:** Both local date helpers hardcode 'en-GB' and 24h, applied to all transaction-history timestamps on the item detail page. Tenant locale/timezone/12h preference ignored. (Money displays on this page already use useCurrency, line 119 — only dates are unswept.)
- **fix:** Replace formatDate/formatDateTime with formatDate(value, fmt, locale) and formatDateTimeWithConfig(value, config.dateTime) from src/lib/format.ts.

#### M19. [NEW] Stock — `src/pages/stock/StockReportsPage.tsx`:409

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `? new Date(sale.sale_date as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })`
- **root cause:** Sale_date column in the recent-sales table of the Stock Reports page hardcodes 'en-GB', ignoring tenant locale/timezone. Inline (no helper), so it was missed by the catalog which only flagged the CSV export line 147 in this file.
- **fix:** Use formatDate(sale.sale_date, 'MMM dd, yyyy', locale) or formatDateTimeWithConfig with config.dateTime.

#### M20. [NEW] Suppliers — `src/pages/suppliers/SupplierProfilePage.tsx`:495

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{supplier.credit_limit != null ? supplier.credit_limit.toLocaleString() : '-'}`
- **root cause:** OverviewTab Financial card 'Credit Limit' renders a bare .toLocaleString() with no currency symbol and browser-default locale; the value reads as a plain number with no currency indicator.
- **fix:** Use useCurrency().formatCurrency(supplier.credit_limit ?? 0) so the symbol, position, and tenant decimals are applied.

#### M21. [NEW] Suppliers — `src/pages/suppliers/SupplierProfilePage.tsx`:499

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{supplier.outstanding_balance != null ? supplier.outstanding_balance.toLocaleString() : '-'}`
- **root cause:** OverviewTab Financial card 'Outstanding Balance' renders a bare .toLocaleString() with no currency symbol/locale; supplier liability shown with no currency context.
- **fix:** Use useCurrency().formatCurrency(supplier.outstanding_balance ?? 0).

#### M22. [NEW] Suppliers — `src/pages/suppliers/SupplierProfilePage.tsx`:730

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{supplier.credit_limit != null ? supplier.credit_limit.toLocaleString() : '-'}  (PerformanceTab 'Credit Limit' KPI card)`
- **root cause:** PerformanceTab 'Credit Limit' KPI card duplicates the bare .toLocaleString() with no currency symbol or tenant locale.
- **fix:** Use useCurrency().formatCurrency(supplier.credit_limit ?? 0) in the KPI card.

#### M23. [NEW] Suppliers — `src/pages/suppliers/SupplierProfilePage.tsx`:739

- **gapType:** hand_rolled_format · **userFacing:** true
- **current:** `{supplier.outstanding_balance != null ? supplier.outstanding_balance.toLocaleString() : '-'}  (PerformanceTab 'Outstanding' KPI card)`
- **root cause:** PerformanceTab 'Outstanding' KPI card renders a bare .toLocaleString() with no currency symbol/locale.
- **fix:** Use useCurrency().formatCurrency(supplier.outstanding_balance ?? 0) in the KPI card.

### LOW (12)

#### L1. [cataloged] Banking — `src/hooks/useAccountingLocale.ts`:45-61

- **gapType:** reads_accounting_locales · **userFacing:** false
- **current:** `export const useAccountingLocales = () => {
  return useQuery({
    queryKey: ['accounting_locales_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_locales').select('*')...`
- **root cause:** Dead/legacy parallel reader of accounting_locales living in the same hook file the banking module imports. Not directly used by the banking surfaces audited, but it keeps the legacy table wired and is the kind of reader Phase-4 should retire alongside the banking caller sweep. Flagged for completeness/non-userFacing.
- **fix:** Confirm no remaining callers and delete useAccountingLocales() (and ultimately the whole useAccountingLocale.ts shim) as part of the Phase-4 retirement of accounting_locales readers.

#### L2. [NEW] Banking — `src/pages/financial/BankingPage.tsx`:621, 681, 718

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `{new Date(transaction.transaction_date).toLocaleDateString()}
... {receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString() : 'N/A'}
... {new Date(transfer.transfer_date).toLocaleDateString()}`
- **root cause:** Transaction, receipt, and transfer dates in the three banking tabs all use Date.toLocaleDateString() with no locale, rendering in browser system locale rather than the tenant's configured date format/timezone — same defect class as CL-065 but on BankingPage, not cataloged.
- **fix:** Format with formatDate / formatDateTimeWithConfig using DateTimeConfig from useDateTimeConfig()/useTenantConfig().

#### L3. [cataloged] config-reactivity — `src/lib/financialService.ts`:209-223

- **gapType:** hand_rolled_format · **userFacing:** false
- **current:** `export const formatCurrencyWithLocale = (amount, locale: AccountingLocale): string => { const formattedNumber = amount.toFixed(locale.decimal_places ?? 2); const [integerPart, decimalPart] = formattedNumber.split('.'); const formattedIntege`
- **root cause:** A hand-rolled formatter built on the legacy AccountingLocale shape, using toFixed + toLocaleString('en-US') (hardcoded grouping locale). It is a parallel implementation of the canonical formatter. Grep confirms ZERO callers remain — it is dead code, but it keeps the AccountingLocale type alive and invites re-adoption.
- **fix:** Delete formatCurrencyWithLocale (no callers). Any future need goes through formatCurrencyWithConfig.

#### L4. [cataloged] config-reactivity — `src/pages/platform-admin/PlatformDashboard.tsx`:54-60

- **gapType:** hardcoded_symbol_or_code · **userFacing:** true
- **current:** `const formatCurrency = (amount: number) => { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount); };`
- **root cause:** Platform-admin dashboard hardcodes USD/en-US. This is platform-level (cross-tenant aggregate revenue) so USD may be a deliberate reporting choice, but it is hardcoded with no config and not reactive. Internal staff surface, not tenant-customer-facing.
- **fix:** If platform reporting is intentionally USD, centralize it behind a named PLATFORM_REPORTING_CURRENCY constant rather than an inline Intl literal; otherwise drive from platform settings.

#### L5. [NEW] Dashboard — header date strip — `/Users/flowza/Documents/GitHub/Space_Recovery/src/pages/dashboard/Dashboard.tsx`:101, 103

- **gapType:** hardcoded_locale_en_US · **userFacing:** true
- **current:** `<p>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
...
{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
- **root cause:** The greeting banner on the main Dashboard renders today's weekday and full date with toLocaleDateString hardcoded to 'en-US', ignoring the tenant's configured locale/date format. A non-US-locale tenant sees US month/day ordering and English weekday names on the first screen they land on. Cosmetic (no currency), date-only, and not in the audit catalog.
- **fix:** Source the locale from useDateTimeConfig()/useTenantConfig() and format via formatDate()/formatDateTimeWithConfig() (or Intl with the tenant locale) instead of the literal 'en-US'. Lower priority than the financial-report and export leaks since it is non-monetary cosmetic text.

#### L6. [FIXED] Email document delivery relay — `supabase/functions/send-document-email/index.ts`:48-58

- **gapType:** other · **userFacing:** false
- **current:** `SendEmailRequest { subject, body, attachmentBase64, ... }`
- **root cause:** Verified CLEAN. Generic SMTP pass-through taking pre-rendered subject/body and base64 PDF; never formats or references currency. Money is rendered upstream in P1-fixed PDF builders.
- **fix:** No action; emailed-document currency is owned by upstream PDF builders.

#### L7. [FIXED] Inventory/Stock — `src/components/inventory/AddInventoryModal.tsx`:576-600

- **gapType:** uses_useAccountingLocale · **userFacing:** true
- **current:** `Purchase Cost ({currencyFormat.currencyCode}) ... {currencyFormat.currencySymbol} ... step={'0.${'0'.repeat(Math.max(0, currencyFormat.decimalPlaces - 1))}1'} ... placeholder={'0.${'0'.repeat(currencyFormat.decimalPlaces)}'}`
- **root cause:** VERIFIED CORRECT — reference implementation. currencyFormat comes from useCurrency() (which wraps useCurrencyConfig + formatCurrencyWithConfig), so symbol/position/decimals/code are all tenant-driven and reactive. Listed only to mark it fixed; do not change. (gapType set to satisfy schema enum; this is the canonical pattern, NOT a useAccountingLocale usage.)
- **fix:** No action. Use this as the template when fixing InventoryFormPage and the local-helper files.

#### L8. [NEW] Inventory — `src/pages/inventory/InventoryFormPage.tsx`:404-410

- **gapType:** not_reactive_to_settings · **userFacing:** true
- **current:** `<label ...>Purchase Price</label>
<Input type="number" step="0.01" value={formData.purchase_price ?? 0} onChange={(e) => handleChange('purchase_price', Number(e.target.value))} min="0" />`
- **root cause:** The purchase-price input hardcodes step=0.01 and shows no currency symbol or code in the label/adornment, unlike AddInventoryModal (lines 575-600) which derives step (`0.${'0'.repeat(decimalPlaces-1)}1`), symbol, and position from currencyFormat. So a 3dp-currency tenant gets a 2dp step and no currency indicator on this intake form; it never reacts to currency settings.
- **fix:** Adopt the AddInventoryModal pattern: pull currencyFormat from useCurrency(), append the code to the label, render the symbol adornment by position, and derive step from decimalPlaces.

#### L9. [FIXED] Invoices / Quotes service — `src/lib/invoiceService.ts`:861-871 (and quotesService.ts ~813)

- **gapType:** wrong_helper · **userFacing:** false
- **current:** `const cur = data && data.length > 0 ? (await getTenantConfig(data[0].tenant_id)).currency : null; ... return (data ?? []).map((invoice) => ({ ...invoice, currency_symbol: defaultCurrencySymbol, currency_position: defaultCurrencyPosition, de`
- **root cause:** getInvoicesByCaseId/getQuotesByCaseId now correctly source currency from getTenantConfig (Country Engine) — the prior accounting_locales/USD reads (CL-034/035/036/037) are FIXED. However they still annotate each row with per-row currency_symbol/position/decimal_places, which exist ONLY to feed the hand-rolled formatCurrencyAmount in CaseFinancesTab. This keeps the per-row currency-stamp anti-pattern alive and is the supply side of the CaseFinancesTab `|| 'USD'` leak.
- **fix:** Once CaseFinancesTab switches to formatCurrencyWithConfig(useCurrencyConfig()), drop the .map() annotation entirely and return raw rows; the invoices.currency / quotes.currency ISO column already carries the document currency for multi-currency cases.

#### L10. [NEW] Notification template preview — `src/lib/notificationTemplateService.ts`:88

- **gapType:** hardcoded_symbol_or_code · **userFacing:** false
- **current:** `currency: 'USD'`
- **root cause:** SAMPLE_VARIABLES hardcodes USD; preview placeholder shown only to admins editing templates, not sent to customers. Real dispatch substitutes from live payload.
- **fix:** Optional: source preview currency from useCurrencyConfig().code and format sample amounts canonically. No customer impact.

#### L11. [FIXED] Procurement / form — `src/components/suppliers/PurchaseOrderFormModal.tsx`:46, 386, 410, 413-418

- **gapType:** wrong_helper · **userFacing:** true
- **current:** `const { formatCurrency } = useCurrency(); ... formatCurrency(item.total) ... {taxConfig.label} ({taxConfig.defaultRate}%) ... formatCurrency(totals.subtotal/tax/total)`
- **root cause:** Catalog noted PurchaseOrderFormModal had a legacy 'USD' default. Current code now correctly uses the canonical useCurrency().formatCurrency (backed by useCurrencyConfig + formatCurrencyWithConfig) for line totals/subtotal/tax/total and uses taxConfig.label/defaultRate for the tax line. No hardcoded currency or 'USD' default remains. Reported as fixed_since_audit for completeness.
- **fix:** No action needed; this is the correct template for the other procurement surfaces.

#### L12. [FIXED] Stock — `src/components/stock/BulkPriceUpdateModal.tsx`:19,152-155

- **gapType:** wrong_helper · **userFacing:** true
- **current:** `const { formatCurrency } = useCurrency(); ... {original != null ? formatCurrency(original) : '—'} ... {preview != null ? formatCurrency(preview) : '—'}`
- **root cause:** VERIFIED CORRECT — already migrated to useCurrency(). Original/preview prices render with tenant symbol/decimals reactively. Listed to mark fixed; do not change. (gapType set to satisfy schema; this is the correct helper.)
- **fix:** No action.

