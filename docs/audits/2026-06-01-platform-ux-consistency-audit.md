# Platform UX/UI Consistency Audit — xSuite

- **Date:** 2026-06-01
- **Status:** Complete (evidence-verified)
- **Companion:** `docs/superpowers/specs/2026-06-01-platform-design-system-design.md` (the standardization plan that resolves everything below)
- **Scope:** Application **composition/workflow layer** consistency across all ~28 feature modules. This is the layer *above* the base primitives. The base primitives in `src/components/ui/` were already hardened in the merged **UI Library Hardening phases 0–4** (PRs #123–127); this audit is about whether feature code *uses* them consistently and whether equivalent workflows behave the same across modules.
- **Method:** 7 parallel read-only audit agents, one per dimension-cluster, each sweeping all modules with `file:line` evidence (the same multi-agent technique used to build the phase 0/3/4 specs). Findings were then **spot-checked against source** (see §11 Verification Log).

> **The one-sentence finding:** The primitive layer is solid, but there is **no composition layer above it** — so 28 modules each hand-roll their own modals, forms, tables, menus, and workflows. Adoption of the primitives that *do* exist is partial, design tokens leak in ~40 files, feedback is fragmented across three mechanisms, and one "UX inconsistency" (Record Payment) is actually a **data-integrity split** that writes the same business event to two different tables.

---

## How to read this document

- **§1 Executive summary** — the 8 systemic root causes + the verified high-severity bugs. Read this if nothing else.
- **§2 Consistency scorecard** — every dimension scored 🔴/🟡/🟢.
- **§3–§9** — the exhaustive per-dimension matrices (module × pattern, with `file:line`), each followed by *Canonical vs divergent* and *Prioritized inconsistencies* (Problem → Impact → Recommendation).
- **§10** — cross-cutting theme-token leakage.
- **§11** — verification log (the spot-checks that confirm the headline claims).

Severity legend: 🔴 = inconsistent / no standard / user-visible defect · 🟡 = good primitive exists but adoption partial · 🟢 = consistent.

---

## §1. Executive Summary — 8 systemic root causes

Seven agents working independently kept surfacing the **same** root causes from different angles. That convergence is the signal: these are not 200 unrelated nits, they are **8 systemic gaps** that express themselves ~200 times.

| # | Root cause | Severity | Magnitude (evidence) |
|---|---|---|---|
| **RC1** | **Partial adoption** of existing primitives | 🟡 | 11 hand-rolled modal overlays bypass `<Modal>`; 6 confirms bypass `<ConfirmDialog>`; `FormField` used in only 2 of 34 forms; ~25 list pages hand-roll `<table>` + spinner; 20+ hand-rolled `<span>` badges; raw `<button>` close buttons in 6 platform-admin modals |
| **RC2** | **Missing composed / workflow components** | 🔴 | No `FormModal`, no unified `DataTable` (sort+paginate+empty+loading+bulk in one), no `DropdownMenu`/`ActionMenu`, no `Tabs`, no `DetailPage` layout, no `NoteComposer`/`NoteItem`, no `FileList`/`DocumentCard`, no `Timeline`, no shared `SuccessModal`, 3 competing KPI cards |
| **RC3** | **Theme-token leakage** (won't re-theme; 1 prod bug) | 🔴 | 40 files hardcode hex (`#10b981`/`#3b82f6`/`#ef4444`); 22 duplicate `getStatusColor()` + 4× copied `getCommunicationColor()`; banned `blue/teal/emerald/gray` palette; `border-slate-200` in ~85 modal footers; **AuditTrails action chips render with no background in production** (JIT-stripped dynamic class) |
| **RC4** | **Feedback fragmentation** | 🔴 | Two toast systems (30 files import `react-hot-toast` directly vs 69 via `useToast`); ~40 `window.confirm` for destructive/financial actions vs ~14 `ConfirmDialog`; ~32 `alert()`; `RecordPaymentModal` swallows save errors silently |
| **RC5** | **Terminology & iconography drift** | 🟡 | Add/Create/New, Save/Update, Delete/Remove, View/"View Details"/Open all used interchangeably; "Approve" button labeled **"OK"**; `CreditCard` aliased as the Edit icon in 10+ files; `MoreVertical` vs `MoreHorizontal` |
| **RC6** | **Form inconsistency** | 🔴 | 5 required-asterisk styles; label color `gray` vs `slate` + 3 margins; validation done 3 ways + silent-swallow in financial forms; RHF (5 forms) vs `useState` (29 forms); Cancel button = `secondary`/`ghost`/`outline` |
| **RC7** | **Layout & navigation drift** | 🟡 | No `Tabs` primitive (3 active-state styles); **no URL-synced tabs anywhere** (refresh loses tab; can't deep-link); `PageHeader` adopted in ~20% of pages; 5 back-nav implementations (2 unlabeled); 5 container max-widths; **dead `/invoices/:id/edit` route**; no mobile sidebar drawer |
| **RC8** | **Data-layer split behind the UI** (beyond UX) | 🔴🔴 | The two "Record Payment" entry points persist to **different table pairs** — `payments`/`payment_allocations` vs `receipts`/`receipt_allocations` — producing financial history that cannot be reconciled in one view. Compounded by different currency hooks + case-selector widgets. Intersects `docs/financial-integrity-audit-2026-06-01.md` |

### Verified high-severity defects (not just inconsistencies)

These are concrete bugs found during the audit and confirmed against source:

1. 🔴 **Record Payment data split** — `InvoiceDetailPage.tsx:637` & `InvoicesListPage.tsx:769` write to `receipts`; `paymentsService.ts` writes to `payments`. Same business event, two tables. *(RC8)*
2. 🔴 **Dead Edit-Invoice button** — `InvoiceDetailPage.tsx:521` navigates to `/invoices/:id/edit`, a route that does not exist in `App.tsx` (only `invoices` and `invoices/:id` are registered) → blank page. *(RC7)*
3. 🔴 **Audit-trail chips invisible in production** — `AuditTrails.tsx:170` builds `` `bg-${getActionColor()}-100` `` dynamically; Tailwind's JIT compiler cannot see these strings, so the classes are absent from the production bundle. *(RC3)*
4. 🟡 **`RecordPaymentModal` swallows save failures** — the catch block only calls `logger.error`; the modal closes as if the payment succeeded (`RecordPaymentModal.tsx:219`). *(RC4)*
5. 🟡 **Dead "History" tab + wasted query** — `case_job_history` is fetched on every case open but never rendered; the "History" tab actually renders `ChainOfCustodyTab`. The supplier `audit` tab is similarly wired but renders nothing. *(RC2/RC7)*

---

## §2. Consistency Scorecard

| Dimension | Score | One-line state |
|---|---|---|
| Modal/overlay base | 🟡 | ~65/85 use `<Modal>`; 11 hand-rolled holdouts lack focus-trap/a11y |
| Confirmation dialogs | 🔴 | Split across `window.confirm` (~40), `ConfirmDialog` (~14), and hand-rolled |
| Create/Edit forms | 🔴 | `FormField` in 2/34; every other axis (labels, validation, buttons) diverges |
| Tables / data grids | 🔴 | No unified table; `<table>` hand-rolled on ~25 pages; 2 partial shared comps |
| Search & filter | 🟡 | 4 filter patterns; debounce on ~5 of ~13 server-hitting pages |
| Empty & loading states | 🟡 | `EmptyState` in ~12 modules, absent in ~15; `Spinner`/`Skeleton` unused on lists |
| Action / overflow menus | 🔴 | No primitive; 3 ad-hoc kebab implementations |
| Buttons | 🟡 | Good `<Button>` primitive, but hex overrides + raw `<button>` in many places |
| Icons & terminology | 🔴 | Edit=credit-card icon; verb drift (Add/Create/New, Save/Update) |
| Status badges | 🔴 | 22 duplicate `getStatusColor()` returning raw hex; 20+ hand-rolled spans |
| Status-update actions | 🔴 | 11 different mechanisms (select / buttons / modal / kebab) across modules |
| Page header / layout | 🟡 | `PageHeader` ~20% adoption; 5 container max-widths |
| Tabs & navigation | 🔴 | No `Tabs` primitive; 3 styles; no URL sync; 5 back-nav impls; dead route |
| Workflows & approvals | 🔴 | Case transitions are rich; quote approval has none; Record Payment split |
| Notifications / messaging | 🔴 | 2 toast systems + `alert()` + `window.confirm`; silent failures |
| Notes & comments | 🔴 | No shared primitive; 5+ bespoke; `getCommunicationColor` copied 4× w/ hex |
| Attachments | 🔴 | No shared `FileList`; case (25 MB, multi) vs supplier (10 MB, single) diverge |
| Timeline / activity | 🔴 | 3 layout patterns; dead "History" tab; blank supplier audit tab |
| Analytics / dashboards | 🟡 | 3 KPI components; `FinancialStatsCard` leaks `orange/teal`; raw-hex header props |
| Mobile-responsive | 🔴 | No sidebar drawer; table compresses (no card fallback); inconsistent breakpoints |
| Theme tokens (cross-cut) | 🔴 | 40 files hardcode hex; JIT-broken dynamic class; `border-slate-200` ×85 |

---

## §3. Overlays — Modals, Dialogs, Confirmations, Wizards

**Base primitive:** `<Modal>` (`src/components/ui/Modal.tsx`) wraps the hardened `<Dialog>` (focus-trap, portal, scroll-lock, Escape-stack, `role="dialog"`/`aria-modal`). `<ConfirmDialog>` is the destructive-action primitive. **~65 of 85 overlays use `<Modal>` correctly** — this is the *best-adopted* primitive in the app.

### 3.1 Hand-rolled overlays that bypass `<Modal>` entirely (no focus-trap / scroll-lock / a11y)

| File | Type | Note |
|---|---|---|
| `cases/ArchiveCloneConfirmationModal.tsx:57` | destructive-confirm | hand-rolled `fixed inset-0`, raw `<X>` |
| `cases/ExtractCloneConfirmationModal.tsx:57` | destructive-confirm | hand-rolled |
| `cases/DuplicateCaseConfirmationModal.tsx:27` | destructive-confirm | hand-rolled |
| `cases/MarkAsDeliveredModal.tsx:78` | create-form | hand-rolled `max-w-3xl` |
| `cases/PreserveLongTermModal.tsx:82` | create-form | hand-rolled |
| `cases/ReportTypeSelectionModal.tsx:30` | picker | hand-rolled |
| `cases/CaseSuccessModal.tsx:34` | success | hand-rolled (only success-modal in app; no shared primitive) |
| `cases/CreateCaseWizard.tsx:533` | wizard | hand-rolled full-screen, custom step indicator |
| `cases/StreamlinedReportEditor.tsx:389` | editor | hand-rolled `max-w-[1400px]` |
| `platform-admin/.../CouponFormModal.tsx:64` | create-form | hand-rolled (corroborated by Forms agent) |
| `platform-admin/.../PlanFormModal.tsx:69` | create-form | hand-rolled |
| `platform-admin/.../PlanFeatureFormModal.tsx:91` | create-form | hand-rolled, titleless |
| `auth/MFAEnrollment.tsx:78` | create-form | hand-rolled, no title/close |
| `financial/InvoiceDetailPage.tsx:676` (inline) | view | page-inline `fixed inset-0`, no close button except footer |
| `.../DonorSearchPage.tsx:407` (inline) | create-form | page-inline overlay inside `<Card>` |

### 3.2 Destructive-confirm fragmentation

| Mechanism | Count | Examples |
|---|---|---|
| `<ConfirmDialog>` ✅ | ~14 | `CategoryManagerModal`, `AnnouncementCard:198`, `BankingPage:781`, `PayrollAdjustmentsPage:263`, `TicketDetailPage:352/362/372`, `StockListPage:630`, `BillingPage:358`, `TenantDetailPage:185/195` |
| `<Modal>` w/ custom layout | 3 | `DeleteCaseConfirmationModal`, `DeleteInventoryConfirmationModal` (3-button stack, **inverts cancel-at-bottom**), `DeviceFormModal` nested delete |
| Hand-rolled overlay | 4 | `ArchiveClone`, `ExtractClone`, `DuplicateCase`, `MarkAsDelivered` |
| `window.confirm()` | ~40 | see §8.2 |

### 3.3 Other overlay divergences

- **Cancel button variant** (3rd dimension to flag this): `secondary` (~50 files) / `ghost` (all 6 supplier modals + `IntegrityCheckModal` + `CustodyTransferModal` + `kb/ArticleEditorModal`) / `outline` (`UserFormModal:109`, `PasswordResetModal:66`).
- **Legacy `size="large"` alias** in 8 files (`AccountFormModal`, `RecordReceiptModal`, `TransferFundsModal`, `PaymentReceiptModal`, `LoanDetailModal`, `LineItemTemplateFormModal`, `ImageCropModal`, `ArticleEditorModal`). `ArticleEditorModal:158` sets **both** `size="large"` and `maxWidth="7xl"` (the latter wins; `size` is a no-op).
- **Headless dialogs** (no accessible name): `ExportWizard`, `ImportWizard`, `BulkInventoryImportModal` pass no `title` → dev-time `[Dialog] Provide label` warning fires; title is only an in-body `<h2>`.
- **Empty-title header**: `PDFPreviewModal:173`, `ReportViewModal:181`, `PaymentReceiptModal:80` pass `title=""` → empty header bar + `aria-labelledby` points at empty text.
- **`border-slate-200`** hardcoded footer divider in ~85 modal files (should be `border-border` — won't re-theme).
- **Loading-state variable** split: `isSubmitting` (~25) / `isPending` (~20) / `loading` (~10) / `submitting` (3).

**Prioritized inconsistencies**
1. **Hand-rolled overlays bypass the hardened `<Dialog>`.** *Impact:* a11y failures (no focus trap / `aria-modal`), Escape may close the wrong overlay when stacked, body scroll not locked. *Recommendation:* migrate all 15 to `<Modal>`/`<ConfirmDialog>`; full-screen editors may use `<Dialog>` directly with custom `className`.
2. **Destructive confirms split 4 ways.** *Impact:* inconsistent, unstyleable, fails in sandboxed iframes (`window.confirm`). *Recommendation:* `<ConfirmDialog variant="danger|warning">` for every destructive/irreversible action.
3. **Cancel variant + `size="large"` alias + `border-slate-200`.** *Impact:* visible chrome differences; theme leak. *Recommendation:* `FormModal` composition fixes all three at once (see Doc B §1).

---

## §4. Create / Edit Forms

**34 forms audited.** The shared `FormField` (`src/components/ui/FormField.tsx`) wires label + `htmlFor`/`id` + `aria-describedby` + error icon. It is used in **2** feature forms (`ArticleEditorModal`, `CategoryManagerModal`). `GeneralSettings.tsx:86` **re-defines its own** local `FormField`.

### 4.1 Form-by-form matrix (representative)

| Module | Form `file:line` | Validation | Buttons (labels) | State | FormField? |
|---|---|---|---|---|---|
| Banking | `AccountFormModal.tsx:199` | `setError` → banner | Cancel `secondary` / Create/Update Account | `useState` obj | No |
| Cases | `CreateCaseWizard.tsx:53` | `alert()` + `window.confirm` | Cancel / Create Case | `useState` | No |
| Cases | `DeviceFormModal.tsx:48` | `toast.error` (`useToast`) | Cancel / Save/Update Device | `useState` obj | No |
| Cases | `QuoteFormModal` / `InvoiceFormModal` | `toast.error` per field | Cancel / Save Quote/Invoice | `useState` scalars | No |
| Customers | `CustomerFormModal.tsx:90` | on-blur `touched` + per-field `errors` | Cancel / Create Customer | `useState` obj+errors | Partial (`error` prop) |
| Financial | `ExpenseFormModal.tsx:29` | **silent** `if(amount<=0\|\|!desc) return` | Cancel / Save as Draft / Submit for Approval | `useState` | No |
| Financial | `TransactionFormModal.tsx:25` | **silent**; hardcoded `#10b981`/`#ef4444` | Cancel / Save Transaction | `useState` | No |
| KB | `ArticleEditorModal.tsx:28` | `toast.error` (react-hot-toast) | Cancel / Save Draft / Publish | `useState` | **Yes** |
| Onboarding | `ChecklistFormModal.tsx:44` | **RHF** inline `errors.x.message` | Cancel / Create Checklist | **react-hook-form** | No |
| Performance | `ReviewFormModal.tsx:118` | **RHF** inline | Cancel / Save/Update Review | **react-hook-form** | No |
| Recruitment | `CandidateFormModal` / `JobFormModal` | **RHF** inline | Cancel / Add Candidate / Post Job | **react-hook-form** | No |
| Payroll | `LoanFormModal.tsx:22`, `SalaryComponentFormModal`, `AdjustmentFormModal` | `toast.error` per field | Cancel `secondary` / Create… | `useState` obj (`text-gray-700`) | No |
| Platform-admin | `CouponFormModal`, `PlanFormModal` | `toast.error` (react-hot-toast) | Cancel `ghost` / Create… | `useState` | No — **bypass `<Modal>`** |
| Suppliers | `SupplierFormModal`, `PurchaseOrderFormModal`, `ContactFormModal` | `toast.error` (`useToast`) | Cancel `ghost` / Save/Update | `useState` (`text-gray-700`) | No |
| Templates | `LineItemTemplateFormModal.tsx:44` | **`alert()`** | Cancel / Save Template | `useState` | No |
| Users | `UserFormModal.tsx:35` | `setError` → banner | Cancel `outline` / Create/Update User | `useState` | No |

*(Full 34-row table preserved from the Forms-agent sweep; the rows above are representative of every divergence axis.)*

**Prioritized inconsistencies**
1. **`FormField` adoption ≈ 0.** *Impact:* screen-reader label association broken on most inputs; spacing/error-icon inconsistent. *Recommendation:* mandate `FormField` for every labeled field; delete local re-definitions.
2. **Required-asterisk: 5 styles** — `<span class="text-danger">*</span>` / `<span class="text-primary">*</span>` / plain `"Label *"` in the string (no `aria-hidden`) / none. *Recommendation:* `FormField required` prop only.
3. **Label color `text-gray-700` vs `text-slate-700`; margins `mb-1/1.5/2`.** *Recommendation:* normalize via `FormField` (`space-y-1.5`, slate).
4. **Validation 3 ways + silent financial swallow** (`ExpenseFormModal:105`, `TransactionFormModal:60`). *Impact:* invisible failures on money forms. *Recommendation:* one contract — RHF + `FormField.error` inline, `useToast` on submit failure.
5. **Cancel variant 3 ways; `alert()`/`window.confirm` in 10+ form contexts.** *Recommendation:* `FormModal` standard (Doc B §1–§2).

---

## §5. Tables / Data Grids / Search / Filter / Empty / Loading

**~37 list pages audited.** Two partial shared components exist — `<Table>` (ui: skeleton+a11y, **no sort/pagination**) and `<DataTable>` (shared: sort, **no pagination/skeleton**) — and **neither covers the full feature set**, so most pages hand-roll `<table>`.

### 5.1 Grid-implementation distribution

| Implementation | Pages | Examples |
|---|---|---|
| Hand-rolled `<table>` | ~20 | Cases, Customers, Companies, Invoices, Quotes, Payments, Expenses, Transactions, Suppliers, Payroll, Leave, Timesheets, Stock Adjustments, Clone Drives |
| `<Table>` ui primitive | 4 | Support Tickets, Clients (legacy), Quotes Recycle Bin, TenantManagement |
| `<DataTable>` shared | 2 | Purchase Orders, TenantManagement (legacy route) |
| Card-grid (`<div>` cards) | 5 | Employees, Performance Reviews, Recruitment, KB, Users |
| Dedicated table component | 2 | Stock Items (`StockItemsTable`), Stock Sales (`StockSalesTable`) |

### 5.2 Cross-cutting list inconsistencies

- **`<Spinner>`/`<Skeleton>` primitives are unused on list pages** — every page hand-rolls `border-t-primary animate-spin`; `CustomersListPage.tsx:670` leaks **banned `border-t-blue-600`**; profile pages use `cyan-600`. *(three spinner colors)*
- **`<EmptyState>` used in ~12 modules, absent in ~15** — ad-hoc icon+text in Customers/Payroll History/Plans/Coupons/Stock Adjustments; **nothing** in Audit Trails/System Logs/Timesheets/Leave/Clone Drives.
- **Search input**: ~25 pages use bare `<input>` + manual `<Search>` icon; ~8 use the `<Input leftIcon>` primitive.
- **Debounce**: 300 ms on Invoices/Quotes/Stock/Stock Sales/Notifications; **immediate per-keystroke** (hitting Supabase) on Cases/Customers/Suppliers/Inventory.
- **Filter UI: 4 patterns** — (a) quick-toggle buttons + collapsible "More Filters" (Cases/Customers/Invoices/Quotes/Suppliers); (b) always-visible `<select>` grid (Payments/Transactions/Support Tickets/Timesheets); (c) button-press-to-apply (Tenants platform-admin); (d) none (Clients/Recycle Bin/Locations/Categories).
- **Pagination**: server-side (Cases 7/page, Inventory 7/page, Notifications 25/page) / client-side (Customers/Companies/Suppliers 10/page) / **absent — fetch all rows** (Payments, Invoices, Transactions). No shared page-size constant.
- **Sort**: only `<DataTable>` + `CloneDrivesList` expose column sort; no other list can sort.
- **Bulk actions** (`<BulkActionsBar>`): present on Cases/Customers/Invoices/Quotes/Expenses; absent on Suppliers/Companies/Employees/Stock/Inventory/Payments.

**Prioritized inconsistencies**
1. **No unified table primitive.** *Impact:* every list page reinvents layout/loading/empty/row-actions. *Recommendation:* merge into one `<DataTable>` with `loading`(skeleton) + `emptyState` + `pagination` + `sortConfig` + optional `bulkSelection`.
2. **Primitives `Spinner`/`Skeleton`/`EmptyState` exist but unused** — plus a banned-color leak. *Recommendation:* route all loading/empty states through them.
3. **Payments/Invoices/Transactions fetch unbounded rows.** *Impact:* unsafe at tenant scale. *Recommendation:* server-side pagination + shared page-size (20).
4. **Search component + debounce + filter pattern all diverge.** *Recommendation:* `<Input leftIcon>` + 300 ms debounce + the quick-toggle/More-Filters pattern as the default.

---

## §6. Page Layouts / Detail Pages / Navigation / Tabs

**Detail pages audited:** Case, Invoice, Quote, Customer, Company, Supplier, PurchaseOrder, Tenant, Plan, Ticket, StockItem, StockSale, PayrollPeriod, KBArticle, Employee, CategoryDetail, TemplateType.

### 6.1 Divergence summary

| Axis | Divergence |
|---|---|
| Tab active-state | **3 styles**: `border-b-2 border-primary` underline (majority); `bg-primary/10 shadow-sm` pill (Customer/Company profiles); `category.backgroundColor` hardcoded (CategoryDetail). **No `Tabs` primitive.** |
| URL-synced tabs | **None** — every detail page holds active tab in `useState`; refresh/deep-link loses it (CaseDetail has 13 tabs, TenantDetail 6) |
| `PageHeader` adoption | ~20% — used by Invoice/Quote detail + payroll/stock lists; **not** by Case/Customer/Company/Supplier/StockItem/PayrollPeriod/KB/Employee/PO detail |
| Back navigation | **5 implementations** (raw `<button>` text+icon; `Button ghost` icon-only [unlabeled, no a11y name]; `Button secondary` text; `Button ghost` text; `<button p-2>` icon-only) |
| Container max-width | **5 values**: `max-w-[1800px]` / `max-w-[1600px]` / `max-w-7xl` / `max-w-5xl` / none |
| Detail layout | **3 structures**: full-width tabbed (Case); `xl:grid-cols-3` doc-preview + sidebar (Invoice/Quote); `space-y-6` free-form stacked (Tenant/Supplier/PO/Employee) |
| Loading | `min-h-screen` wrapper (Case/StockItem) / `animate-pulse` skeleton (Invoice/Quote) / centered spinner (Tenant) / "Loading…" text (PO) |
| Color scale | `text-gray-*`/`border-gray-*` (Supplier 59×, PO 31×, Employee 10+×) vs `slate` everywhere else |

### 6.2 Concrete defects
- **Dead route**: `InvoiceDetailPage.tsx:521` → `/invoices/:id/edit` (unregistered in `App.tsx`). Quote detail correctly uses a modal.
- **Banned palette**: `TemplateTypeDetail.tsx:183/236` and `TemplatesDashboard.tsx:155/211/282/288` use `blue-600`/`blue-50`.

**Prioritized inconsistencies**
1. **No `Tabs` primitive + no URL sync.** *Impact:* visual divergence; users can't deep-link/refresh into a tab. *Recommendation:* `<Tabs>` primitive (underline) with `useSearchParams` sync (`?tab=engineers`).
2. **`PageHeader` orphaned at ~20%.** *Recommendation:* adopt everywhere or replace with two `<DetailPage>` layout variants (Tabbed / SidebarMain).
3. **5 back-nav impls + 5 max-widths + gray/slate split.** *Recommendation:* one back-nav (`Button ghost` + `ArrowLeft` + label), one max-width enforced in `AppLayout` `<main>`, migrate gray→slate.
4. **Dead invoice-edit route.** *Recommendation:* add the route+page or switch to modal edit (match Quote).

---

## §7. Workflows, Approvals & Status Updates

### 7.1 Record Payment — the flagship divergence (RC8)

Two entry points for the identical user intent ("record that a customer paid an invoice") reach **different components writing to different tables**:

| Dimension | `RecordPaymentModal` (financial) | `RecordReceiptModal` (banking) |
|---|---|---|
| Opened from | Case detail, `/payments?new=1` | Invoice **list** row, Invoice **detail** |
| Writes to | `payments` + `payment_allocations` (via `paymentsService`) | `receipts` + `receipt_allocations` (direct insert in page) |
| Title | "Record Payment" | "Record Payment Receipt" / "Record Payment for Invoice" |
| Size prop | `size="lg"` | `size="large"` (different alias, same width) |
| Currency | `useCurrency()` | `useAccountingLocale()` |
| Case selector | plain `<select>` | `SearchableSelect` |
| Invoice selection | "Add Invoice" → table rows | toggle cards + "Auto-Distribute" |
| Unallocated shown | No | Yes |
| Overpayment | capped at balance | allowed → "recorded as credit" |
| Error display | **none — swallowed** (`:219`) | inline `bg-danger-muted` banner |
| Submit button | hardcoded `#10b981` (`:516`) | default Button |
| Pre-selection API | `preselectedCaseId/InvoiceId` | `prefilledData` + `singleInvoiceMode` (incompatible) |

**Entry-point map:** Case detail → `RecordPaymentModal`; `/invoices` list row → `RecordReceiptModal`; `/invoices/:id` → `RecordReceiptModal`; command palette → `RecordPaymentModal`.

> **Impact:** a case's payment history and the invoice list's "payment" record live in two different tables and cannot be reconciled in one view. This is a financial-integrity problem, not a styling one. **Recommendation:** one payment-recording component + one data path (`payments`/`payment_allocations` via `paymentsService`); treat `receipts` consolidation as a data workstream coordinated with `docs/financial-integrity-audit-2026-06-01.md`. (Additive/migration only — never hard-delete financial rows.)

### 7.2 Other workflow actions

| Workflow | Mechanism | Confirmation |
|---|---|---|
| Case status advance | purpose-built `CaseStageBanner` modal + optional/required reason | ✅ rich, role/phase-aware |
| Quote status change (staff) | plain `<select>` over all statuses + "Update Status" | ❌ no guard |
| Quote approve/reject (portal) | direct button, immediate mutation | ❌ none |
| Recovery attempt / QA record | inline form, immediate submit | ❌ none |
| Clone drive "Mark Delivered" | `MarkAsDeliveredModal` (hand-rolled) | full modal |
| Device checkout | `DeviceCheckoutModal` | modal, no separate confirm |

*Impact:* the most forensically-sensitive action (quote acceptance) has the weakest guard, while routine case transitions have the strongest. *Recommendation:* apply the `CaseStageBanner` modal+reason pattern to quote accept/reject.

### 7.3 Status-update UI — 11 mechanisms
click-to-reveal `<select>` (Case) · `<select>` in edit form (Quote) · Approve/Reject icon buttons + modal (Expense) · segmented buttons (KB) · action buttons (Payroll period) · inline `<select>` in row (VAT, Onboarding) · dedicated modals (Inventory Mark Defective) · kebab toggle (Announcement) · none (Recruitment). *Recommendation:* a small set of sanctioned status-change patterns (see Doc B §6).

---

## §8. Notifications, Confirmations & Messaging

### 8.1 Feedback mechanism distribution

| Mechanism | Count | Notes |
|---|---|---|
| `useToast` (themed) | 69 files | canonical; 3 s success / 5 s error / 4 s warning, top-right |
| `react-hot-toast` direct import | 30 files | bypasses wrapper → unthemed default styling (e.g., `InvoicesListPage:161`, `QuotesListPage:215`); one emoji-icon one-off (`InvoicesListPage:240`) |
| `alert()` | ~32 | concentrated in `StreamlinedReportEditor` (8), `ReportViewModal` (4), `LineItemTemplateFormModal` (4) — lab-critical surfaces |
| Inline `bg-danger-muted` banner | ~20 | used in some modals (`RecordReceiptModal`, `DeviceCheckoutModal`) but not others (`RecordPaymentModal` has none) |
| Silent (logger only) | 2+ | `RecordPaymentModal:219` |
| Optimistic update | 0 | all mutations pessimistic |

### 8.2 `window.confirm` usage (~40) — including consequential financial/lab actions

`PaymentsList:179` (void payment) · `TransactionsList:145/152` (reconcile/void) · `VATAuditPage:152/159` (submit/mark-paid VAT) · `InvoicesListPage:194/225` (bulk archive/send) · `QuotesListPage:186/215/654` · `CasesList:328` (bulk archive) · `CaseEngineersTab:111` (remove engineer) · `CaseFilesTab:130` (delete attachment) · `CustomerProfilePage:344` (disable portal) · `CustomersListPage:423` · `ExpensesList:297` · `CreateCaseWizard:718` · `GeneralSettings:595` (unsaved guard) · …

**Prioritized inconsistencies**
1. **Two toast systems.** *Recommendation:* `useToast` only; ban direct `react-hot-toast` imports in feature code (lint rule).
2. **`window.confirm` for ~40 destructive/financial actions.** *Recommendation:* `<ConfirmDialog>` everywhere; lint-ban `window.confirm`.
3. **`alert()` ×32 on lab-critical surfaces.** *Recommendation:* `useToast().error()` (transient) / inline banner (persistent); lint-ban `alert(`.
4. **Silent failures + inconsistent inline-error banner.** *Recommendation:* standard `<FormError>`/banner in `FormModal`; never swallow.

---

## §9. Notes · Attachments · Timeline · Analytics · Mobile

### 9.1 Notes & comments — no shared primitive
5+ bespoke implementations: `CaseNotesTab.tsx:75` (the most complete; uses semantic tokens) · `TenantNotesTab.tsx:64` · supplier comms (`CommunicationFormModal` + `SupplierProfilePage:622`) · customer/company comms (read-only) · portal messages. **`getCommunicationColor()` copy-pasted 4×** (`CustomerProfilePage:393`, `CompanyProfilePage:397`, `PortalCommunications:77`, +1) returning raw `#3b82f6/#10b981/#f59e0b`. Notes surfaces never use `RichTextEditor`. *Recommendation:* extract `<NoteComposer>` + `<NoteItem>` from `CaseNotesTab`.

### 9.2 Attachments — no shared `FileList`
`CaseFilesTab.tsx:43` (drag-drop, 25 MB, multi-file, download+delete) vs `DocumentUploadModal.tsx:17` (modal, 10 MB, single-file, **no download/delete**) vs `ImageUpload.tsx` (polished, images only). Company/employee/expense attachment UIs are missing or service-only. *Recommendation:* `<FileUploader>` + `<FileList>`/`<DocumentCard>`; one size-limit policy with a visible hint.

### 9.3 Timeline / activity — 3 patterns + dead tabs
`ChainOfCustodyTab:574` (vertical timeline + connector, search+chips) vs `TenantActivityTab:76` (different timeline) vs `AuditTrails:165` (flat list, no connector). **`case_job_history` fetched but never rendered** (the "History" tab renders custody, not job history); **supplier `audit` tab renders nothing**. `ChainOfCustodyTab:332/617` uses hardcoded `teal-*`. *Recommendation:* one `<Timeline>` primitive; wire or remove the dead `case_job_history` query; rename the tab to "Custody."

### 9.4 Analytics / dashboards — 3 KPI components
`StatsCard` (shared, routes through `COLOR_ALIAS` to tokens) vs `FinancialStatsCard` (leaks raw `orange/teal/purple`) vs inline `QuickStat` (main Dashboard) vs inline `StatCard` (StockReports). `FinancialModuleHeader` takes **raw hex props** (`iconBgColor="#10b981"`, `RevenueDashboard:152`). `ReportsDashboard:470` and `SupplierProfilePage:695` hand-roll KPI rows. Charts: `PlatformDashboard`/`StockReports` correctly use `chartCategorical`/`chartAxis`. *Recommendation:* consolidate on `StatsCard`; extend its color aliases; deprecate the rest; all charts via `chartTheme`.

### 9.5 Mobile-responsive — no sidebar strategy
`Sidebar.tsx:110` always occupies 72–288 px at every viewport — **no breakpoint hide, no hamburger/drawer**. Tables wrap in `overflow-x-auto` with **no card fallback**. `Dialog.tsx:101` (`mx-4 max-w-lg`) can overflow on 320–360 px phones; no full-screen mobile mode. `Dashboard.tsx:117` jumps `grid-cols-2 → lg:grid-cols-4` with no `sm`/`md` step. *Recommendation:* mobile drawer + hamburger; standard table→card fallback; full-screen modal on mobile; standard breakpoint ladder.

---

## §10. Cross-Cutting: Theme-Token Leakage (RC3)

| Leak | Count / location | Fix |
|---|---|---|
| Hardcoded hex `#10b981/#3b82f6/#ef4444/#64748b` | 40 files (e.g. `RecordPaymentModal:516`, `TransactionFormModal`, `PDFDownloadButton:31`, `FinancialModuleHeader`) | semantic token / `Button variant="success"` |
| Duplicate `getStatusColor()` returning hex | 22 definitions across financial/cases/etc. | one `statusToBadgeVariant()` util |
| `getCommunicationColor()` copied w/ hex | 4× | one util → semantic class |
| Banned `blue/teal/emerald/gray` palette | `AuthBackground`, `InvoiceDocument`/`QuoteDocument` previews, `KBArticleDetailPage:233`, `Templates*`, `StockItemsTable:53`, `CategoryManagerModal:291`, `ChainOfCustodyTab:332` | semantic tokens |
| `border-slate-200` modal footer divider | ~85 files | `border-border` |
| **Dynamic class (JIT-stripped → invisible)** | `AuditTrails.tsx:170` `` `bg-${getActionColor()}-100` `` | static lookup map → semantic-muted classes |
| Inline `style={{backgroundColor:'rgb(var(--color-success))'}}` | 15+ sites (no `Button` success variant) | add `Button variant="success"` |

---

## §11. Verification Log (spot-checks against source)

| Claim | Verified | Evidence |
|---|---|---|
| Record Payment → two table pairs | ✅ | `InvoiceDetailPage.tsx:637`, `InvoicesListPage.tsx:769` (`receipts`) vs `paymentsService.ts:100/263` (`payments`) |
| Dead `/invoices/:id/edit` | ✅ | nav at `InvoiceDetailPage.tsx:521`; `App.tsx:309/317` registers only `invoices`, `invoices/:id` |
| AuditTrails JIT-broken class | ✅ | `AuditTrails.tsx:170` |
| CreditCard-as-Edit | ✅ | 10+ files (`CaseOverviewTab.tsx:3`, `UserManagement.tsx:14`, `RecruitmentPage.tsx:2`, …) |
| Two toast systems | ✅ | 30 files import `react-hot-toast`; 69 use `useToast` |
| `window.confirm`/`alert` sprawl | ✅ | ~40 / ~32 occurrences in `src/` |
| Duplicate hex color helpers | ✅ | 22 `getStatusColor` defs; 40 files with `#10b981/#3b82f6/#ef4444` |

**Methodology caveat:** counts are ripgrep-derived and may include a small margin (e.g., `confirm(` in comments). All headline *claims* were confirmed by direct file reads; counts are accurate to ±10%.

---

*Resolution for every item above is specified in the companion: `docs/superpowers/specs/2026-06-01-platform-design-system-design.md`.*
