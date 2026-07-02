# xSuite Typography Audit — 2026-07-02

> **Audit only.** No code was modified, no fixes applied, no redesign proposed. This report inspects,
> measures, compares, and documents. Where a value is called a "deviation" it means *deviation from the
> codebase's own canon* (DESIGN.md + the `ui/` primitives), stated as fact — not as a work order.
>
> **Method.** (1) Mechanical sweep of every non-test `.ts/.tsx` under `src/` extracting all
> typography-bearing utility classes, arbitrary values, and inline font styles; (2) manual read of every
> canonical primitive in `ui/`, `shared/`, `templates/`, `layout/`; (3) eight scoped file-by-file sweeps
> covering all 25 page modules and all 26 component domains; (4) targeted line-level verification of every
> claim cited below (file:line); (5) web research of published enterprise design-system standards
> (§11–§12). Rendered px values are derived from Tailwind v3.4's deterministic class→CSS mapping (the app
> defines **zero** typography rules in CSS — see §9 — so utility classes are the whole system).
>
> Screenshots supplied with the audit request (Expenses list, Banking, Customers list) are mapped to
> code findings in **Appendix A**.

---

## 1. Executive Summary

xSuite's typography is **one typeface (Inter 300–700, variable), utility-class-driven, with no
role-based type scale**. DESIGN.md locks the *font* and bans ad-hoc sizes, but defines named specs for
only three roles (form label / hint-error / form section header) plus the header components. Every other
role — page title, card heading, KPI label/value, table header, button, badge, micro-label — has no
single written spec, and the codebase has filled that vacuum with parallel conventions.

Quantified state (src/, excluding tests):

- **15 distinct rendered font sizes** are in use: 10 named tokens (10–48px) **plus 5 arbitrary pixel
  sizes** (`text-[9px]`, `[10px]`, `[11px]`, `[13px]`, `[15px]` — 93 usages) despite DESIGN.md's "do not
  add sizes ad hoc". The sanctioned 10px token `text-xxs` (14 uses) is out-used ~2.6× by its raw twin
  `text-[10px]` (37 uses).
- **The "page title" role ships in 5 concurrent specs** — 13px/600 (top-bar standard), 18px/600
  (`PageHeader`), 20px/700 (13+ hand-rolled in-page headers), 24px/700 (`DetailPageHeader`, portal,
  several list/detail pages), 30px/700 (8 platform-admin/admin pages). The user-visible split in the
  supplied screenshots (Banking vs Expenses/Customers) is exactly this.
- **Two neutral text palettes coexist**: `text-slate-*` (~4,648 occurrences) vs `text-gray-*`
  (477 occurrences in exactly **30 files**, concentrated in suppliers, KB, billing/plans, employee
  profile, payroll loans). Slate and gray differ subtly (#64748b vs #6b7280 at the 500 step), producing
  near-identical-but-not-identical text colors on adjacent screens.
- **The `ui/` primitives themselves disagree** on shared sub-roles: field **error text is `text-sm` in 10
  primitives but `text-xs` in 3** (FormField — the documented standard — plus ChipInput/TagInput); hints
  split `text-xs` vs `text-sm`; `Table` headers use `tracking-wider` while `DataTable`/
  `ConfigurableDataTable` use `tracking-wide`; `CollapsibleSection` titles are `font-bold` where
  `Modal`/`ConfirmDialog` are `font-semibold` at the same 18px.
- **Unsized-text inheritance is a systemic accident**: identity cells (`EXP-02714`, `CUST-4062`,
  customer names), profile-page tabs, and several table headers carry weight/color classes but **no
  font-size class**, so they render at the root 16px inside otherwise 14px tables — the exact anomaly
  red-boxed in the supplied screenshots.
- **`font-mono` is used 168×** (serials, SKUs, tenant codes, OTPs, JSON, kbd) while DESIGN.md states
  "Code: none defined. Do not introduce a mono font without updating this doc" — the mono stack is the
  un-tokenized Tailwind/system default, and its application is inconsistent (some ID roles mono, some not).
- **The uppercase micro-label role** (the most common label pattern, ~490 uppercase usages) forks across
  5 sizes (9–12px) × 3 weights (500/600/700) × 6 tracking values (`wide` 104×, `wider` 285×, plus
  `[0.04em]`/`[0.05em]`/`[0.06em]`/`[0.1em]`/`[0.16em]`).
- **Numeric typography is split**: `tabular-nums` is applied 85× (financial surfaces, KPI tiles, pager)
  but absent from payroll amounts, report modal totals, and VAT figures; money weights vary
  `font-medium`/`font-semibold`/`font-bold` across sibling tables.
- **Inline font styles are almost fully contained**: 625 total, of which 616 are the intentionally
  non-themed PDF layer (pdfmake, Roboto 8–20pt). Only 9 reach UI surfaces (§9.4).
- Positive baseline: weights in use are exactly 400/500/600/700 — all inside the loaded Inter 300–700
  range (no synthesized weights); tabs, filter pills, form labels and most list tables hold a stable
  14px body rhythm; print pages are internally consistent; the shared KPI primitive gives every KPI
  surface one of two documented styles.

Net: the system's *foundation* is unusually clean (one font, tokenized colors, shared primitives), and
most inconsistency is **role-level spec absence + 30-file palette drift + unsized-text inheritance**,
i.e. it is bounded and enumerable — the complete instance list is §7.

---

## 2. Pages Audited

**Coverage: all 132 non-test page files across 25 modules, all 26 component domains, the app chrome
(AppLayout top bar, Sidebar, PortalLayout, MobileNavDrawer), all `ui/` primitives, shared/templates
components, overlays/modals, print surfaces, PDF style layer, and chart theme.** No page was skipped;
files with no typography findings are simply not repeated in §7.

<details><summary><b>Full page roster (132 files, src/pages/)</b></summary>

- **admin (6):** AdminPanel, AuditTrails, DatabaseManagement, RolePermissions, SystemLogs, TenantManagement
- **auth (17):** Login, OnboardingWizard, login/{BrandShowcase, FloatingInput, LoginForm, StatCard, TestimonialCarousel, TrustBadges}, onboarding/components/{PasswordStrength, ProgressIndicator, ServiceSelector, StepContainer}, onboarding/steps/{AccountStep, ConfigurationStep, JurisdictionStep, LocationStep, WelcomeStep}
- **cases (2):** CaseDetail, CasesList
- **clients (1):** ClientsList
- **companies (2):** CompaniesListPage, CompanyProfilePage
- **customers (2):** CustomerProfilePage, CustomersListPage
- **dashboard (1):** Dashboard
- **employee-management (3):** AttendanceDashboard, LeaveManagement, TimesheetManagement
- **financial (9):** BankingPage, ExpensesList, InvoiceDetailPage, InvoicesListPage, PaymentsList, ReportsDashboard, RevenueDashboard, TransactionsList, VATAuditPage
- **hr (6):** EmployeeOnboardingPage, EmployeeProfilePage, EmployeesList, HRDashboard, PerformanceReviewsPage, RecruitmentPage
- **inventory (3):** DonorSearchPage, InventoryListPage, InventoryLocationsPage
- **kb (2):** KBArticleDetailPage, KBCenterPage
- **notifications (1):** NotificationsHistory
- **onboarding (1):** OnboardingPage
- **payroll (8):** EmployeeLoansPage, PayrollAdjustmentsPage, PayrollDashboard, PayrollHistoryPage, PayrollPeriodDetailPage, PayrollSettingsPage, ProcessPayrollPage, SalaryComponentsPage
- **platform-admin (13):** AnnouncementsPage, CouponsManagementPage, NotificationDLQ, PlanDetailPage, PlansManagementPage, PlatformDashboard, PlatformSettingsPage, RateLimitDashboardPage, SupportTicketsPage, TenantDetailPage, TenantIsolationTestPage, TenantsListPage, TicketDetailPage
- **portal (9):** PortalCases, PortalCommunications, PortalDashboard, PortalDocuments, PortalLogin, PortalPayments, PortalPurchasesPage, PortalQuotes, PortalSettings
- **print (5):** PrintCheckoutPage, PrintCustomerCopyPage, PrintLabelPage, PrintPaymentReceiptPage, PrintReceiptPage
- **quotes (3):** QuoteDetailPage, QuotesListPage, QuotesRecycleBin
- **resources (1):** CloneDrivesList
- **settings (21):** AccountingLocales, AppearanceSettings, BillingPage, CaseLifecycleSettings, CategoryDetail, ClientPortalSettings, CurrencySettings, DocumentTemplatesPage, FeaturesSettings, GDPRCompliancePage, GeneralSettings, ImportExportCenter, InventorySettingsPage, NotificationPreferences, NotificationTemplatesTab, PlansPage, PreferencesSettings, SecuritySettingsPage, SettingsDashboard, SystemNumbers, TableColumnsSettings
- **stock (8):** StockAdjustmentsPage, StockCategoriesPage, StockItemDetail, StockListPage, StockLocationsPage, StockReportsPage, StockSaleDetailPage, StockSalesPage
- **suppliers (4):** PurchaseOrderDetailPage, PurchaseOrdersListPage, SupplierProfilePage, SuppliersListPage
- **templates (2):** TemplatesDashboard, TemplateTypeDetail
- **users (2):** UserManagement, UserProfile

</details>

Component domains audited: `auth, banking, cases (incl. detail/, device-form/, wizard), communications,
customers, dashboard, dataMigration, documents (PDF preview builders), financial, inventory, kb, layout,
onboarding, payroll, performance, platform-admin, quotes, recruitment, resources, settings (incl.
Document Studio), shared, stock, suppliers, templates, ui, users`.

---

## 3. Typography Inventory (every unique value in use)

### 3.1 Font families

| Family | Where defined | Usage |
|---|---|---|
| **Inter** (300–700 variable, Google Fonts) | `index.html:14`; `tailwind.config.js` `fontFamily.sans/body/display` | App-wide default via Preflight. `font-body` 80×, `font-display` 6× (auth/onboarding), `font-sans` 2× — all three aliases resolve to Inter, so the aliases create apparent variety with no rendered difference. |
| **Tailwind default mono stack** (`ui-monospace, SFMono-Regular, Menlo, Consolas…`) | *not defined in config* | `font-mono` **168×** — serials/SKUs (`StockItemsTable.tsx:180`), tenant codes (`TenantsListPage.tsx:193`), custody hashes (`ChainOfCustodyTab.tsx:283`), OTP inputs (`MFAChallenge.tsx:108`, `AccountStep.tsx:162`), JSON editor (`PlanDetailPage.tsx:393`), kbd hints (`AppLayout.tsx:180`, `CommandPalette.tsx:253`), event codes (`NotificationPreferences.tsx:581`). DESIGN.md §Typography states "Code: none defined. Do not introduce a mono font without updating this doc." |
| **Roboto** (pdfmake default) | `src/lib/pdf/styles.ts:32` | All PDFs (intentionally non-themed surface). |
| **Noto Sans Arabic + Tajawal** | `public/fonts/`, `src/lib/pdf/fontLoader.ts` | PDF Arabic/RTL only. On-screen Arabic falls back to the system Arabic face (Inter ships no Arabic glyphs) — documented in DESIGN.md. |
| `monospace` (raw inline) | `App.tsx:104` | Dev-facing error fallback screen. |

### 3.2 Font sizes — named tokens (Tailwind v3.4 defaults + 1 custom)

| Class | px / line-height | Usages | Typical roles observed |
|---|---|---|---|
| `text-xxs` *(custom token)* | 10px / inherits | 14 | KPI tile labels & pills (`GradientStatCard.tsx:159`), sidebar section labels (`SidebarSection.tsx:67`), count chips (`ConfigurableDataTable.tsx:265`) |
| `text-xs` | 12px / 16px | 1,528 | table headers, hints, badges (sm), micro-labels, timestamps |
| `text-sm` | 14px / 20px | 2,512 | body default: table cells, labels, buttons (sm), tabs, menus |
| `text-base` | 16px / 24px | 69 | Button md, CommandPalette input, occasional card titles |
| `text-lg` | 18px / 28px | 247 | card/section headings, Modal titles, EmptyState titles, Button lg |
| `text-xl` | 20px / 28px | 82 | hand-rolled in-page page titles, compact KPI values, print headings |
| `text-2xl` | 24px / 32px | 108 | DetailPageHeader h1, portal titles, KPI values (vivid md), modal totals |
| `text-3xl` | 30px / 36px | 28 | platform-admin/admin h1s, portal stat values, auth display |
| `text-4xl` | 36px / 40px | 4 | auth hero (`BrandShowcase.tsx:17`), tenant health score (`TenantOverviewTab.tsx:269`) |
| `text-5xl` | 48px / 1 | 1 | auth hero at `xl:` breakpoint (`BrandShowcase.tsx:17`) |

### 3.3 Font sizes — arbitrary (off-scale) values

| Class | px | Usages | Locations (complete file set) |
|---|---|---|---|
| `text-[9px]` | 9px | 3 | `SpaceInsufficientWarningModal.tsx:74,102`; `SidebarNavItem.tsx:99` (nav count bubble) |
| `text-[10px]` | 10px | 37 | `CaseFinancesTab.tsx` (KPI strip labels/captions), `SpaceInsufficientWarningModal.tsx`, `NotificationDLQ.tsx:559,648–676` (6 status pills), `PaymentHistoryTable.tsx:58,74`, `StockLocationsPage.tsx:169`, `SettingsDashboard.tsx:79`, `SystemNumbers.tsx:278`, `AppLayout.tsx:180` (kbd), `DeviceHistoryForm.tsx:268`, `InventorySettingsPage.tsx`, `NotificationsHistory.tsx`, `controls.tsx`, `TemplateGalleryModal.tsx`, `CommandPalette` area, `DeviceDetailsForm.tsx` |
| `text-[11px]` | 11px | 47 | `CaseFinancesTab.tsx` (row metadata), `SpaceInsufficientWarningModal.tsx`, device-form sub-headers (`DeviceComponentsForm.tsx:45,172`, `DeviceHistoryForm.tsx:54,87,95,207`, `DeviceDiagnosticForm.tsx:128,275`, `DeviceDetailsModal.tsx:43,399`), `SettingsDashboard.tsx:63,82,158`, `CommandPalette.tsx:253,271,309`, `VariableInsertMenu.tsx:66`, `LineItemTemplateFormModal.tsx:350`, `SidebarNavItem.tsx:87`, `FloatingInput.tsx:46` (raised label), `NotificationsHistory.tsx:294`, `NotificationPreferences.tsx:581` |
| `text-[13px]` | 13px | 5 | **App chrome:** `AppLayout.tsx:103` (top-bar page title), `:160` (breadcrumb section), `Sidebar.tsx:161,209`, `SidebarNavItem.tsx:82` |
| `text-[15px]` | 15px | 1 | `Sidebar.tsx:88` (brand wordmark) |

Total arbitrary-size usages: **93** (vs DESIGN.md: "Everything else uses the default Tailwind type
scale — do not add sizes ad hoc"). Note `text-[10px]` (37×) duplicates the sanctioned `text-xxs` token
(14×) at the same rendered size.

### 3.4 Font weights

| Class | Weight | Usages | Notes |
|---|---|---|---|
| `font-normal` | 400 | 19 | explicit resets (e.g. `PhoneInput.tsx:252`, `DueFollowUpsWidget.tsx:83`) |
| `font-medium` | 500 | 1,603 | labels, buttons, tabs (underline), td emphasis |
| `font-semibold` | 600 | 1,061 | badges, table headers, card titles, top-bar title |
| `font-bold` | 700 | 400 | page h1s, KPI values, money amounts, print headings |
| *(thin/light/extrabold/black)* | — | 0 | none — all usage stays within the loaded Inter 300–700 range |

### 3.5 Line heights (explicit; everything else uses per-size Tailwind defaults)

`leading-tight` (1.25) 32× · `leading-relaxed` (1.625) 19× (`Toast.tsx:98`, KB prose) · `leading-none`
6× · `leading-7` (28px) 2× (`StatCard.tsx:120`, `CasesCommandCenter.tsx:271`) · `leading-snug` 2×
(`SettingsDashboard.tsx:63`).

### 3.6 Letter spacing

| Class | Value | Usages | Notes |
|---|---|---|---|
| `tracking-wider` | 0.05em | 285 | dominant uppercase-label spacing (284 co-occur with `uppercase`) |
| `tracking-wide` | 0.025em | 104 | competing uppercase-label spacing (101 with `uppercase`) |
| `tracking-tight` | −0.025em | 9 | sidebar brand/nav (`Sidebar.tsx:88,161,209`, `SidebarNavItem.tsx:82`), LoginForm title |
| `tracking-normal` | 0 | 2 | resets |
| `tracking-[0.04em]` | — | 4 | device-form section headers (`DeviceDetailsForm.tsx:17,41`, `DeviceComponentsForm.tsx:39`, `DeviceHistoryForm.tsx:48`) |
| `tracking-[0.05em]` | — | 3 | device-form sub-headers (duplicates `tracking-wider`'s value as an arbitrary literal) |
| `tracking-[0.06em]` | — | 1 | `DeviceDiagnosticForm.tsx:63` |
| `tracking-[0.1em]` | — | 1 | `SidebarSection.tsx:67` |
| `tracking-[0.16em]` | — | 1 | `Sidebar.tsx:89` ("Professional Suite" tagline) |
| `tracking-[0.5em]` | — | 2 | OTP inputs (`MFAEnrollment.tsx:173`, `AccountStep.tsx:162`) — intentional code-entry spacing |
| `tracking-widest` | 0.1em | 0 | unused |

### 3.7 Text transform, style, numerics, overflow

- `uppercase` 490× · `capitalize` 30× · `lowercase` 19× · `normal-case` 2×
- `italic` 25× (quotes/testimonials, portal notes `PortalPayments.tsx:253`)
- `tabular-nums` 85× (financial tables, KPI values, pager; **absent** from payroll/VAT/report-modal figures — §7 F-13)
- `truncate` 143× · `line-clamp-1/2/4` 16× · `text-ellipsis` 1×
- Alignment: `text-center` 421× · `text-left` 357× · `text-right` 304× (RTL note: physical `left/right`
  classes coexist with the app's logical-property i18n work)

### 3.8 Neutral text-color families (typography color layer)

| Family | Usages | Steps in use |
|---|---|---|
| `text-slate-*` | ~4,648 | 300 (151), 400 (583), 500 (924), 600 (1,093), 700 (867), 800 (84), 900 (941), 200 (5) |
| `text-gray-*` | 477 (469 matching lines / **30 files**) | 300–900; see §7 F-9 for the full file list |
| `text-zinc/neutral/stone-*` | 0 | — |

---

## 4. Font Size Inventory (consolidated)

**15 distinct rendered sizes** (excluding PDFs): 9, 10 (two spellings: `text-xxs` + `text-[10px]`), 11,
12, 13, 14, 15, 16 (`text-base` **plus all unsized inheriting text**), 18, 20, 24, 30, 36, 48px.

Distribution: 14px (2,512) and 12px (1,528) carry ~86% of all explicit sizing — the app's true body
rhythm is **14/12**, not the 16px root. 16px appears mostly *implicitly* (unsized `<td>`/`<span>`/tabs
inheriting the root) rather than as a chosen token (69 explicit uses) — the source of several visible
anomalies (§7 F-4/F-5).

Pages using the widest in-file size spread (≥5 named sizes): `ReportsDashboard` (7),
`BankingPage` (6), then `PaymentViewModal`, `LoanDetailModal`, `CompaniesListPage`, `CompanyProfilePage`,
`VATAuditPage`, `RecruitmentPage`, `DonorSearchPage`, `KBCenterPage`, `PayrollDashboard`,
`TicketDetailPage`, `PortalCases`, `PortalDashboard`, `PortalDocuments` (+7 more at 5) — 22 files total.

PDF size ramp (separate, intentional): Roboto 8 / 9 / 10 / 14 / 16 / 20pt (`src/lib/pdf/styles.ts:64–120`).

---

## 5. Font Weight Inventory

| Weight | Count | Canonical carriers | Contested roles (details §7) |
|---|---|---|---|
| 400 | 19 explicit (+ all unweighted text) | body copy | — |
| 500 `font-medium` | 1,603 | Button, form labels, underline tabs, td emphasis | table th (payroll uses 500 where canon is 600); KPI labels (500 in compact StatCard vs 600 in Gradient) |
| 600 `font-semibold` | 1,061 | Badge, Table th, Modal titles, top-bar title | settings form labels (600 where canon is 500); ImageUpload label (600) |
| 700 `font-bold` | 400 | h1s (Detail/portal/admin), KPI values, money | card headings (`CollapsibleSection`, portal cards use 700 where siblings use 600); money cells (700 vs 600 vs 500 across sibling tables) |

Weight-per-role collisions, not missing weights, are the issue: the same role resolves to two adjacent
weights depending on module (complete list §7 F-6/F-11/F-12).

---

## 6. Typography Usage Matrix (module × token, mechanical counts)

Counts are occurrences of the class in the module's non-test source. `arb` = arbitrary `text-[Npx]`;
`gray` = `text-gray-*` occurrences.

| Module | xs | sm | base | lg | xl | 2xl | 3xl | xxs | med | semi | bold | upper | mono | arb | gray |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| components/cases | 233 | 438 | 19 | 28 | 11 | 6 | 0 | 1 | 251 | 164 | 60 | 53 | 31 | **45** | 8 |
| components/financial | 37 | 101 | 2 | 4 | 0 | 2 | 1 | 0 | 78 | 24 | 11 | 7 | 1 | 2 | 0 |
| components/inventory | 113 | 26 | 4 | 3 | 0 | 1 | 0 | 1 | 53 | 17 | 7 | 3 | 7 | 0 | 4 |
| components/stock | 61 | 68 | 2 | 0 | 0 | 0 | 0 | 0 | 25 | 55 | 5 | 22 | 8 | 3 | 0 |
| components/suppliers | 6 | 51 | 0 | 2 | 0 | 0 | 0 | 0 | 51 | 6 | 2 | 0 | 0 | 0 | **55** |
| components/payroll | 10 | 28 | 0 | 2 | 4 | 1 | 0 | 0 | 24 | 7 | 5 | 4 | 0 | 0 | **45** |
| components/kb | 11 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 5 | 0 | 4 | 0 | 0 | 17 |
| components/layout (chrome) | 8 | 18 | 0 | 1 | 2 | 0 | 0 | 3 | 14 | 11 | 6 | 3 | 1 | **11** | 0 |
| components/ui (primitives) | 40 | 79 | 4 | 4 | 1 | 1 | 0 | 1 | 38 | 17 | 2 | 8 | 1 | 0 | 0 |
| components/platform-admin | 11 | 128 | 0 | 13 | 0 | 1 | 0 | 0 | 53 | 16 | 2 | 0 | 2 | 0 | 0 |
| pages/financial | 110 | 143 | 5 | 37 | 5 | 8 | 4 | 0 | 69 | 112 | 49 | 54 | 5 | 0 | 0 |
| pages/cases | 6 | 38 | 1 | 2 | 0 | 0 | 0 | 0 | 27 | 3 | 4 | 1 | 1 | 0 | 0 |
| pages/customers | 23 | 44 | 0 | 5 | 0 | 0 | 0 | 0 | 22 | 20 | 3 | 17 | 5 | 0 | 0 |
| pages/companies | 22 | 40 | 2 | 7 | 1 | 2 | 0 | 0 | 22 | 14 | 8 | 11 | 0 | 0 | 0 |
| pages/quotes | 12 | 29 | 0 | 6 | 0 | 1 | 0 | 0 | 17 | 20 | 2 | 8 | 0 | 0 | 0 |
| pages/kb | 23 | 15 | 2 | 0 | 1 | 2 | 0 | 0 | 14 | 6 | 4 | 1 | 0 | 0 | **51** |
| pages/settings | 84 | 186 | 12 | 20 | 3 | 6 | 1 | 4 | 88 | 100 | 24 | 14 | 28 | 12 | **48** |
| pages/stock | 110 | 115 | 2 | 3 | 4 | 4 | 0 | 0 | 66 | 97 | 15 | 62 | 27 | 1 | 0 |
| pages/suppliers | 18 | 67 | 1 | 20 | 0 | 5 | 0 | 0 | 45 | 39 | 7 | 9 | 0 | 0 | **117** |
| pages/payroll | 73 | 65 | 1 | 9 | 4 | 3 | 0 | 0 | 87 | 17 | 6 | 52 | 0 | 0 | **46** |
| pages/hr | 41 | 61 | 2 | 11 | 6 | 6 | 0 | 0 | 36 | 20 | 13 | 3 | 0 | 0 | **47** |
| pages/employee-management | 69 | 99 | 2 | 0 | 3 | 2 | 0 | 0 | 62 | 48 | 6 | 31 | 0 | 0 | 0 |
| pages/platform-admin | 88 | 105 | 0 | 12 | 1 | 9 | **8** | 0 | 101 | 41 | 17 | 44 | 15 | 6 | 0 |
| pages/portal | 23 | 54 | 1 | 19 | 3 | **17** | 3 | 0 | 20 | 20 | **39** | 7 | 0 | 0 | 0 |
| pages/auth | 40 | 42 | 0 | 2 | 2 | 3 | 2 | 0 | 32 | 1 | 1 | 4 | 1 | 3 | 0 |
| pages/print | 0 | 0 | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 2 | 16 | 0 | 0 | 0 | 0 |
| pages/inventory | 31 | 34 | 1 | 4 | 1 | 0 | 1 | 0 | 25 | 23 | 6 | 17 | 4 | 0 | 1 |
| pages/admin | 11 | 30 | 0 | 4 | 0 | 0 | 3 | 0 | 17 | 5 | 3 | 0 | 0 | 0 | 6 |
| pages/users | 7 | 23 | 0 | 3 | 1 | 2 | 1 | 0 | 19 | 6 | 2 | 7 | 0 | 0 | 0 |
| *(remaining modules)* | *smaller counts — full TSV retained in audit workpapers* | | | | | | | | | | | | | | |

Readings from the matrix: portal is the `font-bold`/`text-2xl` outlier (its own header system);
platform-admin is the `text-3xl` outlier; suppliers+kb+payroll+hr+settings hold ~90% of the gray
palette; cases components hold half the arbitrary sizes; print is internally uniform.

---

## 7. Complete List of Inconsistencies (evidence-cited)

Grouped by element role. Each item states the competing specs with representative citations; counts are
exhaustive from the mechanical sweep, file lists are complete where marked *(complete)*.

### F-1 · Page title — five concurrent specs for one role
1. **13px/600/slate-700** — top-bar breadcrumb title, the shipped standard for AppLayout list pages
   (`AppLayout.tsx:103`, fed by `PageHeaderSlot`/`ListPageTemplate` — Expenses, Customers, Quotes,
   Invoices, Payments, Transactions, Stock, Inventory, Suppliers list, Cases, etc.)
2. **18px/600/slate-900 + 14px/500 subtitle** — `PageHeader.tsx:35` (sanctioned only for non-AppLayout
   shells: portal, platform-admin)
3. **20px/700/slate-900 (+16px slate-600 subtitle)** — hand-rolled in-page headers *inside AppLayout*,
   contradicting the documented H2 pattern: `BankingPage.tsx:234`, `ReportsDashboard.tsx:436`,
   `VATAuditPage.tsx:229`, `PayrollDashboard.tsx:44`, `HRDashboard.tsx:52`, `AttendanceDashboard.tsx:55`,
   `LeaveManagement.tsx:692`, `KBCenterPage.tsx:197` (gray-900), `NotificationsHistory.tsx:157`,
   `CompaniesListPage.tsx:335`, `EmployeeOnboardingPage.tsx:315`, `PerformanceReviewsPage.tsx:222`,
   `RecruitmentPage.tsx:248`
4. **24px/700/slate-900** — `DetailPageHeader.tsx:62` (detail-page standard) + portal titles
   (`PortalDashboard.tsx:141` et al.) + `TimesheetManagement.tsx:483`, `PayrollPeriodDetailPage.tsx:176`,
   `UserManagement.tsx:257`, `PlansManagementPage.tsx:63`, `RateLimitDashboardPage.tsx:51`,
   `ProcessPayrollPage.tsx:99`, `CreateCaseWizard.tsx:561`, `EmployeeProfilePage.tsx:81` (gray-900)
5. **30px/700/slate-900** — `ClientsList.tsx:111`, `AnnouncementsPage.tsx:76`, `PlatformDashboard.tsx:76`,
   `SupportTicketsPage.tsx:127`, `TenantsListPage.tsx:78`, `TenantDetailPage.tsx:115`, `AdminPanel.tsx:173`,
   `UserProfile.tsx:138`
   → within platform-admin alone, sibling pages split 24px vs 30px for the same level.

### F-2 · Section & card headings — six specs
`text-lg font-semibold` (majority: `VATAuditPage.tsx:325`, `PayrollDashboard` cards, `TicketDetailPage.tsx:162`,
`TenantOverviewTab.tsx:107`) vs `text-lg font-bold` (`CollapsibleSection.tsx:95`, `PortalDashboard.tsx:209`,
`CustomerProfilePage.tsx:1019`, `PortalQuotes.tsx:227`) vs `text-base font-semibold` (settings sections,
`PreferencesSettings`) vs `text-base font-bold` (`CreateCaseWizard.tsx:583,700,922`) vs
`text-sm font-semibold` (`DetailSidebarCard.tsx:16`, KB cards `KBCenterPage.tsx:68`) vs
`text-xl font-semibold` (`PayrollDashboard.tsx:116`, `HRDashboard.tsx:133`, `AttendanceDashboard.tsx:103`)
and `text-xl font-bold` (`ReportsDashboard.tsx:598`).

### F-3 · Modal titles
Standard `text-lg font-semibold` (`Modal.tsx:77`, `ConfirmDialog.tsx:59`) vs `text-base font-semibold`
(`CaseDetail.tsx:1289`) vs `text-xl font-bold` (`PortalCases.tsx:287`, `PortalQuotes.tsx:343`, print-page
dialogs `PrintReceiptPage.tsx:86`) vs `text-2xl font-bold` (`MFAChallenge.tsx:83`, `ProcessPayrollPage.tsx:99`
step header) vs `text-sm font-semibold` tinted titles (`QuoteDetailPage.tsx:539,550`, `QuotesRecycleBin.tsx:250,313`).

### F-4 · Unsized text inheriting 16px inside 14px tables *(the screenshot anomaly)*
Identity cells with weight/color but **no size class** render at root 16px next to `text-sm` (14px)
siblings *(complete for list tables)*: `ExpensesList.tsx:656` (`font-semibold text-primary` — "EXP-02714"),
`CustomersListPage.tsx:728` (customer number), `:741` (customer name `font-medium text-slate-900`),
`QuotesListPage.tsx:547` (quote number), `PlansManagementPage.tsx:170`, `TenantsListPage.tsx:191`,
`PlatformDashboard.tsx:231,249,273`, `PayrollHistoryPage` period name, `UserManagement.tsx:360`,
`AuditTrails.tsx:184` context, `PortalQuotes.tsx:376` td. Same mechanism on tabs:
`CustomerProfilePage.tsx:1002` and `CompanyProfilePage.tsx:591` tab buttons are `font-medium` unsized
(16px) vs `ui/Tabs` 14px. And on table headers: `ReportsDashboard.tsx:899` th (`py-2 font-medium`,
no size → 16px header smallercase) and `RateLimitDashboardPage.tsx:77`.

### F-5 · Table header (th) — seven concurrent specs
| Spec | Where |
|---|---|
| `text-xs font-semibold text-slate-700 uppercase tracking-wider` | canonical `Table.tsx:67`; `StockItemsTable.tsx:115–149` |
| same but `text-slate-600` | financial lists (`PaymentsList.tsx:503`, `TransactionsList.tsx:345`, `ExpensesList.tsx:626`, `RevenueDashboard.tsx:309`), `InventoryListPage.tsx:526–552`, `StockItemDetail.tsx:646`, `PlatformDashboard.tsx:206`, customers/companies lists |
| `text-xs font-medium text-slate-500/600 uppercase (±tracking-wider)` | payroll (`PayrollHistoryPage.tsx:86`, `PayrollPeriodDetailPage.tsx:264`, `SalaryComponentsPage.tsx:127`), `CouponsManagementPage.tsx:105`, `PlansManagementPage.tsx:112`, `UserManagement.tsx:323` |
| `text-xs font-semibold uppercase tracking-wide` (not wider) | `LeaveManagement.tsx:873`, `TimesheetManagement.tsx:596`, DataTable/ConfigurableDataTable card-mode dt (`DataTable.tsx:159`, `ConfigurableDataTable.tsx:346,395`) |
| `text-xs font-semibold text-slate-700` — no uppercase/tracking | `BankingPage.tsx:575–580` |
| `text-xs text-slate-500` (weight only on inner span) | `PaymentHistoryTable.tsx:39` |
| `text-sm font-semibold text-slate-700` — no uppercase | portal (`PortalQuotes.tsx:366–369`) |
| *(unsized)* `font-medium text-slate-600` | `ReportsDashboard.tsx:899`, `RateLimitDashboardPage.tsx:77` |

### F-6 · Table body cells
`text-sm text-slate-900` (canonical `Table.tsx:102`, RevenueDashboard) vs `text-sm text-slate-700`
(`CustomersListPage.tsx:749`, CompaniesList, `VATAuditPage.tsx:447`) vs `text-sm text-slate-600`
(`ExpensesList.tsx:658,678`) vs **`text-xs`** (`BankingPage.tsx:603`, `PaymentHistoryTable.tsx:54`) vs
unsized 16px (F-4). Money-cell weight forks: `font-bold` (`ExpensesList.tsx:682`, `PaymentsList.tsx:542`,
`TransactionsList.tsx:405`) vs `font-semibold` (`PaymentSummaryBar.tsx:24`, `VATAuditPage.tsx:357`,
`PaymentHistoryTable.tsx:81`) vs `font-medium` (`RevenueDashboard.tsx:333`, `PayrollHistoryPage.tsx:117`).

### F-7 · Buttons — two sizes on the same screen + hand-rolled variants
`ui/Button` md (default) = **16px** `font-medium` (`Button.tsx:43`); size="sm" = 14px. List screens mix
them: top-bar actions `size="sm"` (`ExpensesList.tsx:497`) while toolbar buttons take the md default —
Refresh (`ExpensesList.tsx:574`), More Filters (`CustomersListPage.tsx:532`). *(Erratum 2026-07-02:
`ExportButton` already passes `size="sm"` — only the two named buttons were md.)* Hand-rolled buttons
meanwhile sit at 14px: filter pills (`ExpensesList.tsx:555`,
`CustomersListPage.tsx:501`, `CasesList.tsx:696`, `InvoicesFilterBar.tsx:49–100`), listbox add-new
(`SearchableSelect.tsx:265`). Also `PortalQuotes.tsx:439,449` restyle buttons inline outside the variant
system. *(Non-typographic but user-flagged: the Expenses "Refresh" button renders a `Filter` icon —
`ExpensesList.tsx:579`.)*

### F-8 · Search inputs & placeholders
List-toolbar search is hand-rolled with **no text size** (16px) + `py-2.5 rounded-xl`
(`ExpensesList.tsx:546`, `CustomersListPage.tsx:494`) vs `ui/Input` md (16px, `py-2 rounded-md`,
`Input.tsx:5`) vs dropdown-internal searches `text-sm py-1.5 rounded-md` (`SearchableSelect.tsx:200`,
`MultiSelectDropdown.tsx:170`, `PhoneInput.tsx:307`) vs `CommandPalette.tsx:244` `text-base` with explicit
`placeholder:text-slate-400`. Placeholder styling is explicit only in CommandPalette; elsewhere it falls
to the browser default color over varying input sizes.

### F-9 · Neutral palette fork — `gray` vs `slate` *(complete 30-file list)*
477 occurrences: `SupplierProfilePage` 68, `PurchaseOrderDetailPage` 46, `EmployeeProfilePage` 45,
`LoanDetailModal` 39, `KBCenterPage` 27, `BillingPage` 26, `EmployeeLoansPage` 23, `PayrollSettingsPage` 23,
`SupplierFormModal` 22, `PlansPage` 22, `KBArticleDetailPage` 20, `PurchaseOrderFormModal` 12,
`PendingApprovalScreen` 10, `OnboardingWizard` (components) 10, `CategoryManagerModal` 9,
`ArticleEditorModal` 8, `DeleteCaseConfirmationModal` 8, `DocumentUploadModal` 8, `ContactFormModal` 7,
`CommunicationFormModal` 6, `LoanFormModal` 6, `TenantManagement` 6, `ProtectedRoute` 5,
`DeleteInventoryConfirmationModal` 4, `PurchaseOrdersListPage` 2, `UsageLimitGuard` 2, `App.tsx` 2,
`PerformanceReviewsPage` 1, `InventoryListPage` 1, `OnboardingPage` 1. Everywhere else uses slate.
(gray-500 `#6b7280` vs slate-500 `#64748b` etc. — visually near-identical, not identical.)

### F-10 · Same-role neutral **shade** drift (within slate)
th: slate-500 vs 600 vs 700 (F-5). td: 600/700/900 (F-6). Hints: `text-slate-400`
(`SendMessageModal.tsx:156`, `BackupDeviceRecommendation.tsx:118`, device-form sub-labels) vs canonical
`text-slate-500` (`FormField.tsx:53`). Mono IDs: slate-500 (`TenantsListPage.tsx:193`) vs slate-700
(`TenantDetailPage.tsx:119`) vs slate-900 (`TenantOverviewTab.tsx:138`). Note `text-slate-400` (583 uses)
computes ≈3.0:1 on white — below the WCAG 1.4.3 AA 4.5:1 threshold for normal-size text where it carries
meaningful content (timestamps, hints, kbd shortcuts).

### F-11 · Form label weight fork
Canonical `text-sm font-medium text-slate-700` (all `ui/` field primitives, most modules) vs
**`font-semibold`** across settings (`GeneralSettings.tsx:105`, `SystemNumbers.tsx:316,331,355`,
`ClientPortalSettings.tsx` ×15) and `ImageUpload.tsx:283` vs **gray-700** in suppliers/payroll modals
(F-9) vs `text-slate-300` on dark onboarding steps (`WelcomeStep.tsx:52`, `AccountStep.tsx:88` — dark
surface, different by necessity).

### F-12 · Error & hint text size — split *inside* `ui/`
Errors `text-xs text-danger` (documented standard: `FormField.tsx:58`; also `ChipInput.tsx:140`,
`TagInput.tsx:116`, `FloatingInput.tsx:58`) vs `text-sm text-danger` in **ten** primitives
(`Input.tsx:56`, `Select.tsx:76`, `Checkbox.tsx:43`, `RadioGroup.tsx:83`, `Textarea.tsx:48`,
`MultiSelectDropdown.tsx:345`, `SearchableSelect.tsx:351`, `PhoneInput.tsx:281`, `ImageUpload.tsx:416`,
`ImageCropModal.tsx:198`). Hints: `text-xs text-slate-500` (FormField/Input/Select/Checkbox/RadioGroup/
ChipInput) vs `text-sm text-slate-500` (`MultiSelectDropdown.tsx:349`, `SearchableSelect.tsx:355`,
`PhoneInput.tsx:285`). FormField's error also carries an icon + `role="alert"`; Input's does not.

### F-13 · Numerals
`tabular-nums` on financial surfaces (`PaymentSummaryBar.tsx:24,28,32`, `PaymentHistoryTable.tsx:54,80,81`,
`GradientStatCard.tsx:168`, `StatCard.tsx:120`, `CasesList.tsx:888`, tenant codes) but **absent** on
payroll amounts (`PayrollHistoryPage.tsx:117–125`, `PayrollPeriodDetailPage.tsx:321–330`,
`PayrollDashboard.tsx:188`, `TimesheetManagement.tsx:651`), `ReportsDashboard.tsx:658–673` modal totals,
and `VATAuditPage.tsx:357–363` amounts.

### F-14 · KPI/stat cards — two sanctioned styles + three rogue implementations
Sanctioned: compact `StatCard.tsx:112,120` (label 12px/500 sentence-case + dot; value 20px/700
`tabular-nums`, tone-colored) and vivid `GradientStatCard.tsx:159,168` (label 10px/600 upper/wider;
value 20–24px/700). Rogue: portal hand-rolled (`PortalPayments.tsx:168` label 12px/500 upper/**wide**,
value 24px/700 `PortalDashboard.tsx:176` even 30px); HR pages hand-rolled
(`EmployeeOnboardingPage.tsx:345`, `PerformanceReviewsPage.tsx:245`, `RecruitmentPage.tsx:268` — 12px/500
upper/wide + 24px/700); cases KPI strips (`CasesCommandCenter.tsx:264,271` 12px/20px;
`CaseFinancesTab.tsx:159–176` **10–11px arbitrary** labels + 18px values); dashboard widgets
(`DueFollowUpsWidget.tsx:41` 12px/500 upper/**wider** + 20px/700); KB StatCard variant
(`KBCenterPage.tsx:126–127` label with `opacity-75`).

### F-15 · Uppercase micro-label role — 5 sizes × 3 weights × 6 trackings
Dominant pair `uppercase tracking-wider` (284) vs `uppercase tracking-wide` (101) vs arbitrary em values
(10). Sizes span `text-xxs` (`GradientStatCard.tsx:159`, `SidebarSection.tsx:67` at `[0.1em]`),
`text-[9px]` (`SpaceInsufficientWarningModal.tsx:74`), `text-[10px]` (`PaymentHistoryTable.tsx:58`,
`CaseFinancesTab.tsx:159`), `text-[11px]` (`CommandPalette.tsx:271` wider; `VariableInsertMenu.tsx:66`
wide; `SettingsDashboard.tsx:158` **bold** wider; device-form `[0.05em]`), and `text-xs` (canonical th;
`Dashboard.tsx:97` at **sm**; KB `tracking-wide`). Weight varies 500/600/700 within the same role.

### F-16 · DESIGN.md form section-header prescription vs shipped device forms
Prescribed: `text-xs font-semibold uppercase tracking-wide text-primary` (DESIGN.md §Forms). Shipped:
`text-sm font-bold uppercase tracking-[0.04em]` with color split `text-primary`
(`DeviceDetailsForm.tsx:17`) vs `text-slate-800` (`DeviceComponentsForm.tsx:39`,
`DeviceHistoryForm.tsx:48`, `DeviceDiagnosticForm.tsx:55`); sub-headers `text-[11px] font-semibold
uppercase tracking-[0.05em] text-slate-400` (`DeviceComponentsForm.tsx:45`) and `text-xs font-bold
tracking-[0.06em] text-slate-500` (`DeviceDiagnosticForm.tsx:63`). (DESIGN.md marks this section
"leads the code" — the drift is known-tracked; the *internal* 0.04/0.05/0.06em variance is not.)

### F-17 · Badges/chips — hand-rolled at off-scale sizes
`ui/Badge` = `font-semibold`, sm 12px / md 14px (`Badge.tsx:31,44`). Hand-rolled:
`NotificationDLQ.tsx:559,648–676` (6× `text-[10px]`), `PaymentHistoryTable.tsx:58` (`text-[10px]`
upper/wide), `StockLocationsPage.tsx:169` (`text-[10px]` upper/wider), `SidebarNavItem.tsx:87,99`
(`text-[11px]`, `text-[9px] font-bold`), `StockItemsTable.tsx:47,54` (inline xs/600),
`CouponsManagementPage.tsx:120–143` (inline sm/xs), `StockListPage.tsx:357` (`text-xs font-bold` — 700 vs
Badge's 600), `CasesCommandCenter.tsx:162` (xxs), `KBArticleDetailPage.tsx:195` (inline-colored).

### F-18 · App chrome runs on its own off-scale ramp
Top bar: title `text-[13px]` (`AppLayout.tsx:103`), section crumb `text-[13px]` (`:160`), search-trigger
`text-xs` + kbd `text-[10px] font-mono` (`:174,180`). Sidebar: brand `text-[15px] tracking-tight`
(`Sidebar.tsx:88`), tagline `text-xxs tracking-[0.16em]` (`:89`), nav items `text-[13px] tracking-tight`
(`SidebarNavItem.tsx:82`), badges `text-[11px]`/`text-[9px]` (`:87,99`), section labels `text-xxs
tracking-[0.1em]` (`SidebarSection.tsx:67`), user name `text-[13px]` (`Sidebar.tsx:209`). None of these
five sizes exist in the named scale.

### F-19 · Portal is a parallel typography system
Same roles, systematically larger/bolder than the main app: in-page 24px/700 titles (F-1), `text-sm`
non-uppercase th (F-5), card headings `text-lg font-bold`, stat values up to 30px
(`PortalDashboard.tsx:176`), own stat-label spec (F-14). Internally consistent; externally divergent.

### F-20 · Breadcrumbs — two specs
Top-bar crumb 13px (`AppLayout.tsx:103,160`) vs `DetailPageHeader.tsx:45` crumbs `text-sm text-slate-500`
(14px).

### F-21 · Empty states
`EmptyState.tsx:26` (`text-lg font-semibold` + `text-sm`) vs hand-rolled: `CustomersListPage.tsx:645`
(`text-lg`, no weight), portal (`PortalCases.tsx:213` `text-lg text-slate-600`),
`DetailPageNotFound.tsx:15` (lg/600), various `text-slate-500` unsized (`AnnouncementsPage.tsx:111`).

### F-22 · Pagination
`Pager.tsx:26` (`text-sm text-slate-600`) is the shared standard; `CasesList.tsx:864–888` and
`NotificationsHistory.tsx:340` re-implement it with equivalent-but-duplicated classes (+`tabular-nums`
only in CasesList).

### F-23 · `font-mono` application is inconsistent across the same ID role
Mono: stock SKUs (`StockItemsTable.tsx:180`), inventory item numbers (`InventoryListPage.tsx:570` —
with extra `font-bold text-info tracking-wide`), tenant codes, sale numbers (`StockSalesWidget.tsx:71`),
custody hashes, event codes. Not mono: invoice/quote numbers (`CustomerFinancialTab.tsx:193,252`),
expense/customer/quote numbers in list tables (F-4 cells), coupon codes (`CouponsManagementPage.tsx:120`).
`ClientTab.tsx:352,500` stacks `font-mono … font-semibold` (double-weight on mono).

### F-24 · Sub-readable sizes
9px (`SpaceInsufficientWarningModal.tsx:74,102`, `SidebarNavItem.tsx:99`) and 10px-with-uppercase used
for content labels (F-15) sit below the smallest size any surveyed enterprise system ships for
productive UI text (12px — §11); the app's own smallest named token is 10px (`text-xxs`, DESIGN.md
scopes it to "ultra-dense table metadata").

### F-25 · Auth/onboarding alias stack
Auth uses `font-display`/`font-body` (86 combined uses; both = Inter) and its own display ramp
(`text-3xl…5xl`, `BrandShowcase.tsx:17`, `LoginForm.tsx:34`), `FloatingInput` raised label
`text-[11px]` (`FloatingInput.tsx:46`). Intentionally non-themed surface per DESIGN.md; recorded for
completeness.

### F-26 · Chart text
Charts intentionally don't theme; only `StockReportsPage.tsx:540,547` sets an explicit tick/label
`fontSize: 12` — every other Recharts surface inherits library defaults, so chart text size varies by
chart.

---

## 8. Component-by-Component Comparison (canonical primitives vs field usage)

| Component | Shipped typography (verified) | Field deviations observed |
|---|---|---|
| `ui/Button` (`Button.tsx:30,42–44`) | `font-medium`; sm 14px / **md 16px (default)** / lg 18px | md/sm mixed per screen (F-7); hand-rolled 14px buttons; inline-restyled portal buttons |
| `ui/Badge` (`Badge.tsx:31,44–46`) | `font-semibold`; sm 12px / md 14px / lg 16px | 9 hand-rolled chip families incl. 10px/11px & `font-bold` (F-17) |
| `ui/Input` / `Select` / `Textarea` (`Input.tsx:5,27,56,61`) | label 14px/500/slate-700; control md **unsized (16px)**, sm 14px; error **14px**; hint 12px | error size contradicts FormField standard (F-12) |
| `ui/FormField` (`FormField.tsx:43,53,58`) | label 14px/500; hint 12px/slate-500; error **12px** + icon + `role="alert"` | the documented standard; minority adoption vs Input/Select built-ins |
| `ui/Checkbox` / `RadioGroup` | labels 14px/500-400; errors **14px** | same F-12 split |
| `ui/MultiSelectDropdown` / `SearchableSelect` / `PhoneInput` | internal search 14px; hint **14px**; error 14px; chips 12px/500 | hint size deviates from 12px canon (F-12) |
| `ui/ChipInput` / `TagInput` | chips 14px; errors **12px** | consistent with FormField, inconsistent with Input |
| `ui/ImageUpload` (`ImageUpload.tsx:283`) | label 14px/**600** | only 600-weight label in ui/ (F-11) |
| `ui/Modal` (`Modal.tsx:77`) / `ConfirmDialog` (`:59–60`) | title 18px/600; body 14px | page modals at 16px/20px/24px titles (F-3) |
| `ui/CollapsibleSection` (`:95`) | title 18px/**700** + count chip 12px/600 | weight differs from Modal's 600 at same size (F-2) |
| `ui/Table` (`Table.tsx:67,87,102`) | th 12px/600/slate-700/upper/**wider**; td 14px/slate-900; empty state unsized (16px)/slate-500 | 7 competing th specs, 4 td specs (F-5/F-6) |
| `ui/DataTable` / `ConfigurableDataTable` (`DataTable.tsx:159`) | card-mode dt 12px/600/upper/**wide**; dd 14px | tracking differs from `Table` (wider vs wide) |
| `ui/Tabs` (`Tabs.tsx:105–106`) | underline 14px/**500**; pills 14px/**600** white-ink | profile pages hand-roll unsized 16px tabs (F-4); pills white ink on all tones (DESIGN.md prescribes slate-900 ink on cat-1..5) |
| `ui/Tooltip` (`Tooltip.tsx:69`) | 12px/500 on slate-900 | — |
| `ui/Toast` (`Toast.tsx:98`) | 14px/500 `leading-relaxed` | — |
| `ui/Pager` (`Pager.tsx:26`) | 14px/slate-600 | duplicated hand-rolled pagers (F-22) |
| `ui/RowActionsMenu` / `ColumnPickerPopover` | menu items 14px; footers 12px/slate-500 | — |
| `ui/CustomerAvatar` (`CustomerAvatar.tsx:23–24,100`) | initials 14px (sm) / 16px (md) /600 | — |
| `shared/EmptyState` (`:26`) | 18px/600 + 14px body | hand-rolled variants (F-21) |
| `shared/GradientStatCard` (`:159–184`) | label 10px/600/upper/wider; value 20–24px/700 tabular; pills 10px | — (vivid KPI standard) |
| `shared/StatCard` compact (`StatCard.tsx:112,120,126`) | label 12px/500 + dot; value 20px/700/`leading-7` tabular tone-colored; sub 12px | rogue KPI clones in portal/HR/cases (F-14) |
| `shared/PageHeader` (`:35–37`) | 18px/600 + 14px subtitle | 20px/24px/30px hand-rolled h1s across pages (F-1) |
| `shared/DetailPageHeader` (`:45,62,68`) | crumbs 14px/slate-500; h1 24px/700; meta 14px/slate-500 | TenantDetail 30px; EmployeeProfile gray-900 |
| Top bar (`AppLayout.tsx:103,160,174,180`) | title 13px/600; crumb 13px/500/slate-400; kbd 10px mono | 13px exists nowhere else in the scale (F-18) |
| Sidebar family (`Sidebar.tsx:88–212`, `SidebarNavItem.tsx:82–99`, `SidebarSection.tsx:67`) | 15/13/11/10/9px private ramp | (F-18) |
| `shared/CommandPalette` (`:244–309`) | input 16px; groups 11px/600/upper/wider; footer 11px | 11px off-scale |
| `shared/BulkActionsBar` (`:32`) | 14px/500 | — |
| `ui/AuditInfo` (`:56,64`) | dd 500/slate-900 (unsized within 12px context) | — |

---

## 9. CSS / Typography Definition Inventory

### 9.1 Stylesheets
`src/index.css` is the **only** CSS file. It contains **zero typography rules** — no base font-size, no
heading styles, no component text classes; only color-token variables, scrollbar styling, three keyframes,
and the reduced-motion guard. All typography is utility classes + Tailwind Preflight defaults.

### 9.2 `tailwind.config.js` typography-relevant extensions (complete)
- `fontFamily`: `sans` / `body` / `display` → `['Inter','system-ui','sans-serif']` (three names, one stack)
- `fontSize`: `xxs: 0.625rem` (10px) — the single custom size token; **no custom line-height attached**
  (inherits contextual line-height rather than a paired leading like the built-in sizes)
- No custom `letterSpacing`, `lineHeight`, or `fontWeight` extensions — Tailwind defaults are the scale

### 9.3 Font loading
`index.html:14`: `Inter:wght@300..700` variable, `display=swap`, preconnect to googleapis/gstatic; CSP
allows both hosts. Weights >700 are not loaded (and are not used). Weight 300 is loaded but unused
(`font-light` count: 0).

### 9.4 Inline font styles (complete census: 625)
- **616 sanctioned PDF-layer**: `src/lib/pdf/**` (554) + `src/components/documents/**` (62) — pdfmake
  doc-definitions; Roboto ramp 8/9/10/14/16/20pt (`pdf/styles.ts:64–120`), fixed by design (DESIGN.md
  §Non-Themed Surfaces).
- **9 UI-reaching** *(complete)*: `InventoryDetailModal.tsx:570,583` (status/condition chips,
  `fontSize:'10px'` + dynamic bg); `StockReportsPage.tsx:540,547` (Recharts tick fontSize 12);
  `App.tsx:104` (error-fallback `fontFamily:'monospace'`); `KBArticleDetailPage.tsx:253`
  (`fontFamily:'inherit'` defensive); `GeneralTab.tsx:127,244` + `HeaderFooterTab.tsx:164`
  (Document-Studio controls *writing PDF config values*, not styling the UI).

### 9.5 Non-themed text surfaces (by design; recorded, not counted as drift)
Charts (`chartTheme.ts` — axis `#64748b`, no font sizes), PDFs (Roboto ramp + `PDF_TONES`), device-icon
SVGs, auth decorative surface.

---

## 10. Design Token Inventory (typography-relevant)

| Token layer | Exists? | Contents |
|---|---|---|
| Font-family tokens | ✅ | `sans`/`body`/`display` (all Inter). No mono token despite 168 `font-mono` uses. |
| Font-size tokens | ⚠️ partial | Tailwind default scale + `xxs`. **No role tokens** (no `page-title`, `card-title`, `table-header`, `caption` equivalents) — each call-site re-derives the combo, which is the root mechanism behind F-1…F-17. 5 arbitrary px sizes live outside the tokens (93 uses). |
| Weight tokens | Tailwind defaults | 400/500/600/700 in use. |
| Line-height / tracking tokens | Tailwind defaults | 6 arbitrary tracking literals outside the scale. |
| Text-color (semantic) | ✅ 14-token system | `*-foreground` + status tokens; **neutral text is un-tokenized** — raw `slate-*`/`gray-*` utilities (DESIGN.md explicitly allows neutrals), which is where the 30-file gray fork and the shade drift (F-9/F-10) live. |
| Documented role specs (DESIGN.md) | 3 + headers | form label / hint / error; form section header; top-bar title, DetailPageHeader, PageHeader (via component citations); KPI card anatomy. No spec for: card/section headings, table th/td, buttons, badges, empty states, pagination, breadcrumbs, micro-labels, money/numeric text. |
| Enforcement | Color-only | `eslint-rules/no-raw-tailwind-colors`, `no-raw-style-colors`, banned-tables… guard **color**, not typography — nothing lints `text-[Npx]`, gray-vs-slate, or weight/tracking combos. |

---

## 11. Research Summary — Typography Standards in Global ERP/SaaS Design Systems

*(Standards summary only — no recommendations for this project. Values are as published by each system;
primary sources in §12.)*

### 11.1 Type scales & hierarchy
- **Material Design 3**: 5 roles × 3 sizes (display/headline/title/body/label; 57→11px), Roboto, only
  400/500 weights. Body-medium 14px; label-small 11px is its floor. The M2 "overline" (10px all-caps)
  role was **dropped** in M3.
- **IBM Carbon**: dual type sets — **productive** (task UI) vs expressive. Productive tokens:
  `label-01`/`helper-text-01` 12/16 400 (+0.32px tracking), `body-compact-01` 14/18 400,
  `heading-01` 14/20 **600**, `heading-02` 16/24 600, `heading-03` 20/28 400, up to 54px at weight 300.
  Nothing below 12px.
- **Microsoft Fluent 2 / Windows 11**: token ramp 10/12/14/16/20/24/28/32/40/68px; **Body1 = 14/20
  Regular** is the default; titles are Semibold; Bold and italic are excluded from the ramp. Windows
  states hard legibility floors: **12px Regular / 14px Semibold minimum**.
- **SAP Fiori**: proprietary **"72"** typeface tuned for small sizes; eight sizes with **14px as size 0
  (default)**.
- **Salesforce Lightning**: OS system font; base body ~13px (SLDS 1.x archive; SLDS 2 revises slightly);
  role semantics published per heading class (page title vs card title vs stat display).
- **Ant Design**: **base 14px / 22px line height** (justified by 50cm viewing distance); 10 derived
  sizes but explicit guidance to **restrain a product to 3–5 sizes**; weights "regular 400 and medium
  500 should be enough".
- **Atlassian**: rem-based tokens (user rescaling), minor-third scale, **body 14px/20**, **minimum
  raised from 11px to 12px** for accessibility.
- **Cross-system pattern**: every surveyed enterprise system converges on a **14px UI body default**
  with **12px as the caption/secondary tier and effective floor** (Material tolerates 11px labels,
  Fluent 10px captions as absolute extremes).

### 11.2 Table / data-grid typography
Carbon: th 14px **600**, td 14px 400, table title 20px; density via **row heights** (24/32/40/48/64px),
not smaller fonts. SAP compact mode shrinks **spacing only — font size never changes**. Header casing:
Carbon and Windows mandate **sentence case** for all UI text including table headers; where all-caps is
used, added letter-spacing is required practice. Data columns use **tabular lining numerals**
(`tabular-nums`) so digits align.

### 11.3 Form typography
Carbon: labels **and error messages** = 12/16 400; helper text 12/16, persistent, replaced by the error
on state change. Material 3 text fields: input/label 16px, supporting & error text 12px. Labels sit
above fields, sentence case, no terminal colons.

### 11.4 Button typography
Material 3: 14px Medium, **sentence case** (all-caps was M2 and is superseded). Carbon: 14px
**Regular**. Fluent: 14px, Semibold for emphasis. Ant: 14px. Industry direction: emphasis via weight,
not uppercase; ~14px is the consensus button size.

### 11.5 Caption / overline / badge / metadata
M2's reference small-text pair: Caption 12px (+0.4px), Overline 10px ALL-CAPS (+1.5px). M3 dropped
overline; smallest is 11px Medium. Fluent Caption1 12/16, Caption2 10/14 (floor). Carbon: nothing under
12px. Atlassian: 12px floor, raised from 11px. Consensus: **12px floor for persistent UI text**; 10–11px
only as bounded caption tiers; all-caps micro-text always pairs with added tracking.

### 11.6 Navigation typography
Carbon UI shell: all nav at **14px**, hierarchy expressed by weight (600 top-level / 400 nested),
sentence case. SAP side navigation inherits the 14px default (compact mode shrinks row height, not
text). No surveyed system publishes sidebar text smaller than its body size.

### 11.7 Accessibility & readability (WCAG 2.x)
- **1.4.3 AA**: 4.5:1 contrast for normal text; 3:1 for large text (≥24px regular or ≥~18.7px bold).
- **1.4.4 AA**: text must resize to 200% without loss (basis for rem-token systems like Atlassian's).
- **1.4.8 AAA**: ≤80 chars/line, no justification, ≥1.5 line spacing for blocks of text; Windows narrows
  to 50–60 chars for UI copy.
- **1.4.12 AA**: content must survive user overrides (line-height 1.5×, letter-spacing 0.12em, etc.).
- No WCAG px minimum exists — systems self-impose 12px floors. Component text line-heights cluster at
  ~1.43 (14/20) across Carbon/Fluent/M3/Atlassian; reading-length text targets 1.5.

### 11.8 Information density in ERP UIs
Three published strategies: Carbon = parallel type sets + row-height variants; SAP = cozy/compact
**spacing** modes with constant font size; Ant = compact theme algorithm shrinking both (fontSize 14→12,
controlHeight 32→28). Fluent keeps one ramp and relies on the variable font's optical sizing. Common
principle: density is engineered through **tokens/spacing systems, not ad-hoc font shrinking**.

### 11.9 Typography design tokens
All majors are **role-token based**: Carbon `$body-01`/`$heading-01`; Material `md.sys.typescale.
headline-small`; Fluent global tokens (`fontSizeBase300`) composed into alias styles (`body1`);
Atlassian `font.body.*` rem bundles; SLDS styling hooks. Practitioner consensus: expose 5–7 semantic
text roles; consumers pick a role, never a raw size.

### 11.10 Common scale systems
Named modular ratios (major second 1.125, minor third 1.2, major third 1.25); 4px-multiple line-height
grids (dominant in Fluent/Material ramps); and **Tailwind's default ladder (12/16, 14/20, 16/24, 18/28,
20/28, 24/32, 30/36…) as a de-facto industry artifact** — with the caveat that Tailwind's 16px `base`
differs from the 14px enterprise consensus, making `text-sm` the size that corresponds to enterprise
body text.

---

## 12. References

1. Typography — Material Design 3: https://m3.material.io/styles/typography/type-scale-tokens
2. Buttons — Material Design 3: https://m3.material.io/components/buttons/guidelines
3. Text fields — Material Design 3 (specs): https://m3.material.io/components/text-fields/specs
4. The type system — Material Design 2: https://m2.material.io/design/typography/the-type-system.html
5. Typography: Type sets — IBM Carbon (v11): https://carbondesignsystem.com/elements/typography/type-sets/
6. Typography: Productive — IBM Carbon (v10): https://v10.carbondesignsystem.com/guidelines/typography/productive/
7. Button: Style — IBM Carbon (v10): https://v10.carbondesignsystem.com/components/button/style/
8. Data table: Style — IBM Carbon (v10): https://v10.carbondesignsystem.com/components/data-table/style/
9. UI shell left panel: Style — IBM Carbon (v10): https://v10.carbondesignsystem.com/components/UI-shell-left-panel/style/
10. Writing style — IBM Carbon: https://carbondesignsystem.com/guidelines/content/writing-style/
11. Form: Usage — IBM Carbon: https://carbondesignsystem.com/components/form/usage/
12. Typography — Fluent 2 Design System: https://fluent2.microsoft.design/typography
13. Typography in Windows — Microsoft Learn: https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography
14. Fluent UI global typography tokens (source): https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/typographyStyles.ts
15. Fluent UI font tokens (source): https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/fonts.ts
16. Typography — SAP Fiori for Web: https://experience.sap.com/fiori-design-web/typography/
17. Content Density (Cozy/Compact) — SAP Fiori: https://www.sap.com/design-system/fiori-design-web/v1-96/foundations/visual/cozy-compact
18. Side Navigation — SAP Fiori: https://www.sap.com/design-system/fiori-design-web/v1-136/ui-elements/side-navigation/
19. Typography — Salesforce Lightning Design System 2: https://www.lightningdesignsystem.com/2e1ef8501/p/93288f-typography
20. Text — Salesforce Lightning Design System 2: https://www.lightningdesignsystem.com/2e1ef8501/p/61daff-text
21. Text utilities — SLDS archive 2.7.0: https://archive-2_7_0.lightningdesignsystem.com/utilities/text/
22. Font — Ant Design specification: https://ant.design/docs/spec/font/
23. Ant Design compact theme (source): https://github.com/ant-design/ant-design/blob/master/components/theme/themes/compact/index.ts
24. Ant Design compact algorithm discussion #46779: https://github.com/ant-design/ant-design/discussions/46779
25. Typography — Atlassian Design System: https://atlassian.design/foundations/typography/
26. Applying typography — Atlassian Design System: https://atlassian.design/foundations/typography/applying-typography
27. Implementing typography at scale — Atlassian blog: https://www.atlassian.com/blog/design/implementing-typography-at-scale-the-journey-behind-the-screens
28. Understanding SC 1.4.12 Text Spacing — W3C WAI: https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html
29. Understanding SC 1.4.4 Resize Text — W3C WAI: https://www.w3.org/WAI/WCAG21/Understanding/resize-text
30. Understanding SC 1.4.8 Visual Presentation — W3C WAI: https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html
31. WCAG contrast thresholds (1.4.3) guide — TestParty: https://testparty.ai/blog/wcag-contrast-ratio-guide-2025
32. Web Typography: Designing Tables to be Read — A List Apart: https://alistapart.com/article/web-typography-tables/
33. Best fonts for dense dashboards — FontAlternatives: https://fontalternatives.com/blog/best-fonts-dense-dashboards/
34. Typography basics for data dashboards — Datafloq: https://datafloq.com/typography-basics-for-data-dashboards/
35. Form Label & Legend — CMS Design System: https://design.cms.gov/components/form-label/
36. font-size — Tailwind CSS: https://tailwindcss.com/docs/font-size
37. Font Size — Tailwind CSS v3: https://v3.tailwindcss.com/docs/font-size
38. 8-Point Grid: Typography on the Web — freeCodeCamp: https://www.freecodecamp.org/news/8-point-grid-typography-on-the-web-be5dc97db6bc/
39. The 4px baseline grid — UX Collective: https://uxdesign.cc/the-4px-baseline-grid-89485012dea6
40. Mastering typography in design systems with semantic tokens — UX Collective: https://uxdesign.cc/mastering-typography-in-design-systems-with-semantic-tokens-and-responsive-scaling-6ccd598d9f21
41. The Anatomy of Typography in Design Systems — designsystems.surf: https://designsystems.surf/articles/more-than-just-fonts-the-anatomy-of-typography-in-design-systems

*Sourcing note: Carbon v10 token tables, Fluent token source files, Microsoft Learn, Ant Design and W3C
pages were fetched directly; Material 3, Atlassian, SAP Fiori and SLDS values come from their official
documentation via search extraction (JS-rendered sites). SLDS is the weakest-sourced (13px base from the
SLDS 1.x archive; SLDS 2 notes minor size revisions).*

---

## Appendix A — Mapping the three supplied screenshots to findings

**Screenshot 1 — Financial › Expenses.**
The red-boxed `EXP-02714` is finding **F-4**: `ExpensesList.tsx:656` renders the expense number as
`font-semibold text-primary` with no size class → 16px, while the boxed description "MG RX5 Fuel"
(`:662`) is `text-sm font-medium` → 14px, and date/vendor cells are `text-sm text-slate-600` — three
type treatments in one row, one of them accidental. The boxed **Refresh** button is **F-7**: a default
`md` `ui/Button` → 16px text (`:574`) sitting on the same screen as the top-bar "Export CSV"/"Submit
Expense" at `size="sm"` → 14px (`:497`); it also renders a `Filter` icon rather than a refresh glyph
(`:579`). The stat row is the tenant-selectable **compact StatCard** (F-14: label 12px/500 + dot, value
20px/700 tone-colored). Status pills are canonical `Badge size="sm"`; the category chip is
`Badge variant="secondary"`. Table headers are the financial-module variant (`text-slate-600`, F-5);
the search input is the unsized 16px hand-rolled toolbar input (F-8); filter pills are hand-rolled
14px/500 buttons (F-7).

**Screenshot 2 — Financial › Banking.**
The red-boxed "Banking & Cash Management" header is **F-1 group 3**: a hand-rolled in-page
`text-xl font-bold` h1 + `text-base` subtitle + 14px meta row (`BankingPage.tsx:234–268`) inside
AppLayout, where the shipped standard puts the 13px title in the top bar (as Expenses/Customers do) —
this is why Banking "looks different" from its sibling pages. The boxed button row is four default-`md`
Buttons → 16px (`:271–299`). The page also runs its own container (`p-8` vs the template's `px-6 py-5`)
and its transaction table is the app's densest deviation: `text-xs` body cells and non-uppercase headers
(F-5/F-6). Its summary cards use the shared `KpiRow` (compact style), so they match Expenses.

**Screenshot 3 — Business › Customers.**
The red-boxed `CUST-4062` and "Faisal Al Badri" are both **F-4**: `CustomersListPage.tsx:728` (number,
`font-semibold text-primary`, unsized → 16px) and `:741` (name, `font-medium text-slate-900`, unsized →
16px) inside a 14px table (email/phone cells `text-sm text-slate-700`, `:749,759`). The boxed
**More Filters + Export CSV** pair is **F-7**: More Filters takes the default `md` Button (16px —
`:532`) while Export CSV (`ExportButton`) already passes `size="sm"` *(erratum: the original text said
both were md)*, and the top-bar "Add Customer" is the 14px `size="sm"` pattern — so the two button
tiers coexist on one screen, mirroring Expenses.

---

*End of audit. No code, styles, or configuration were modified in producing this report; the only file
added is this document.*

---

## Addendum — Program outcome (added 2026-07-02, post-standardization)

The standardization program (DESIGN.md → Decisions Log 2026-07-02) executed against this audit the same
day. Re-running §Method's mechanical sweep on the final tree:

| Metric (this audit's baseline) | Before | After |
|---|---|---|
| Arbitrary font sizes `text-[Npx]` (§3.3) | 93 (5 values) | **0** (chrome tokenized: `text-nav` 13px, `text-xxs`) |
| `text-gray-*` occurrences / files (F-9) | 477 / 30 | **0 / 0** |
| Arbitrary `tracking-[…]` (§3.6) | 12 | **2** (sanctioned OTP `0.5em` only) |
| `uppercase tracking-wide` vs `-wider` fork (F-15) | 104 / 285 | **0 / one spec (`wider`)** |
| Table-header specs (F-5) | 7+ | **1** (portal ramp documented separately) |
| Page-title specs (F-1) | 5 | **3, by surface** (top-bar 13px chrome · `DetailPageHeader` 24px · `PageHeader` 18px; portal 24px sanctioned by owner "Option A") |
| Field error-text specs in `ui/` (F-12) | 2 (xs vs sm) | **1** (`FormField` spec universal, icon incl.) |
| Button text sizes (F-7) | 14/16/18px mixed per screen | **14px platform-wide** (md default; heights preserved) |
| Dead Inter aliases `font-body`/`display` (§3.1) | 86 | **0** (`font-mono` tokenized) |
| Unsized identity cells at 16px (F-4) | 14+ list tables | **0** |
| Money cells with `tabular-nums` (F-13) | financial only | **all financial/payroll/timesheet figures** |
| Lint enforcement (§10) | none | `no-gray-palette` + `no-arbitrary-typography`, both `error`, **no baseline** |

Intentionally unchanged, per this audit's "by design" findings: PDFs (Roboto ramp), charts, auth
decorative surface, print dialogs, OTP tracking. Known tracked leftovers: `TemplateTypeDetail` h1 is
size-aligned (2xl) but not yet on `DetailPageHeader`; a few hand-rolled empty-state/pagination blocks
remain class-conformant without component adoption.
