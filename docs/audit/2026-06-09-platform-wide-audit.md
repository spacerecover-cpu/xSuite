# xSuite — Application-Wide Platform Audit

**Date:** 2026-06-09 · **Method:** 67-agent multi-lens audit (14 discovery + 9 discipline lenses + 44 adversarial verifications) cross-checked against first-hand code reads · **Scope:** entire platform — 127 pages / 25 modules / 205 components / 59 services.

> **Reading note on severity.** The raw fan-out produced **311 findings (17 critical / 107 high / 142 medium / 45 low)**. An adversarial verification pass re-checked 44 of the critical/high findings against the live code and DB: **0 were refuted** (29 confirmed, 15 partially-confirmed), but corrected severities came back **1 critical / 16 high / 20 medium / 7 low**. Conclusion: the issues are **real**, but the raw critical/high counts are inflated ~2×. This report leads with the **verified, evidence-rich** items and treats raw counts as an upper bound.

---

## 1. Executive Summary

**Here's what I'd actually do.** This is **not a rewrite candidate** — it's a *finish-the-job* candidate. xSuite already has the hard parts that most teams never build: an append-only forensic spine (`chain_of_custody`, `audit_trails`, `case_job_history` are REVOKE-protected with a `prevent_audit_mutation` trigger), atomic money RPCs (`record_payment`/`void_payment` with `FOR UPDATE` locking and money-conservation), a governed case state-machine (`transition_case_status`), a real 14-token theme system with a maintained `DESIGN.md` drift register, an accessible command palette, lazy-routed code-splitting, and `maybeSingle()` hygiene (**0** `.single()` calls in the codebase). The foundation is genuinely strong.

The disease is **standardization debt at the component layer plus a handful of domain-correctness leaks**. Best-in-class primitives exist and were never adopted across the app, so the product fragments screen-by-screen:

| Canonical primitive exists | Actual adoption | Bypassed by |
|---|---|---|
| `ui/Table.tsx` (a11y, skeletons) | **7 files** | **63 hand-rolled `<table>`** |
| `ui/Spinner` + `ui/Skeleton` | **~0 files** | **128 ad-hoc `animate-spin`** |
| `useConfirm()` (themed, focus-return) | **8 files** | **13 native `window.confirm`** |
| themed `useToast` (aria-live) | 69 files | **31 files / 392 raw `toast.*`** (render invisibly) |
| `FormField` (label↔control a11y) | **2 files** | **~345 hand-rolled `<label>`** (236 raw `<label>`, only 9 `htmlFor`) |
| `PageHeader` | 20 files | the **7 busiest** lists hand-roll headers |
| `queryKeys.ts` factory | newer modules | **core modules (cases/customers/invoices) = 0 importers** |
| semantic surface tokens | — | `bg-white` **270×** vs `bg-surface` **2×**; **309 inline `style={{}}`** |

The inconsistency is the disease; the 127 screens are symptoms. **The single highest-ROI program is a "primitive-adoption" track** — ship one enterprise `DataTable`, mandate `Skeleton`/`useConfirm`/`useToast`/`FormField`, and codemod the bypassers — which collapses most of the UI, UX, a11y, and responsive findings at once.

Running alongside it, **5–7 domain-correctness defects must be fixed regardless of the standardization work** because they touch money, custody, and trust (see §2).

**Top cross-cutting themes (from the lenses):**
- **Built-but-not-wired:** job history, communications logging, recovered-file manifest, PO line items, and a *complete SLA/automation backend* all have backing data but **no working user path** — the app looks broken to the operator even when the data layer is fine.
- **Stage 12 is missing end-to-end:** there is no recovered-file manifest and no customer delivery-acceptance step on staff *or* portal. The customer approves the **money** (quote) but can never accept the **product** (recovered data) — the exact anti-pattern `CLAUDE.md` forbids.
- **Silent failures masquerade as empty states:** the CasesList status filter matches zero rows (casing), archived cases stay visible (missing `deleted_at` filter — **27% phantom rows live**), and tenant "Manage Categories" writes fail silently against global RLS.
- **The staff app shell is 100% non-responsive** (fixed sidebar, no drawer) — unusable below ~900px, while the *customer portal* has proper mobile nav. The team can clearly do responsive (CaseDetail/InvoiceDetailPage are exemplary); it just wasn't applied to the shell.

**Enterprise readiness today: ~5.5/10.** Strong data integrity and theming; weak on responsive, standardization, configurability, and discoverability. With the roadmap in §20, a credible path to 8.5/10 in ~2 quarters without a rewrite.

---

## 2. Critical Issues (verified, evidence-backed)

These are the items I would not ship another feature past. All carry file:line / live-DB proof.

### Money / custody / data-integrity
1. **No payment-before-release gate.** `caseReleaseGate.ts:59-70` computes only `{hasRecordedRecovery, hasPassedQa}` — no balance check anywhere; a case can be Completed/Delivered with an unpaid balance. For a lab, releasing data before payment is the most expensive operational mistake. *(L, tenant-configurable advisory gate.)*
2. **CasesList shows soft-deleted cases — 27% phantom rows verified live.** `CasesList.tsx` list/count/stats queries omit `.is('deleted_at', null)` while the CSV export includes it. Archive "does nothing," stat cards over-count by ~27% (`7 of 26` rows soft-deleted in prod). Same bug on **CustomersListPage** and **ClientsList**. *(S — add the filter; better: centralize reads in `caseService`.)*
3. **392 raw `react-hot-toast` calls render INVISIBLE.** `App.tsx:168-182` sets the global Toaster to `{background:transparent,padding:0,boxShadow:none}` (correct only for `toast.custom`). 31 files call `toast.success/error` directly → bare/illegible text. The **four busiest lists** (Cases, Quotes, Invoices, Customers) give *zero visible feedback* on create/archive/error. *(M — codemod to `useToast` + ESLint ban; stopgap: give default Toaster a card.)*
4. **Hardcoded 7% payroll deduction.** `payrollService.ts:364` `basicSalary * 0.07` for every employee in every tenant; overtime already fetched is discarded (`void dailyRate`). Legally wrong net pay for any non-7% country. *(L.)*
5. **Non-atomic payroll & stock writes.** `payrollService.ts:343-417` writes loan repayments *before* the payroll-records insert with no transaction (partial failure corrupts loan ledgers + double-deduct on retry). `stockService.ts` (`createStockSale`/`recordStockReceipt`/`approveStockAdjustment`) do browser-side insert→update→insert loops — partial failure diverges on-hand from the ledger and allows oversell. *(L each — wrap in SECURITY DEFINER RPCs like `record_payment`.)*
6. **Assigning a physical device to a case logs NO custody event.** `inventoryCaseAssignmentService.ts:312` / `stockService.ts:404` — zero `log_chain_of_custody` calls in any supply service; quantity isn't decremented either, so one physical item can be "assigned" to multiple cases. Breaks the forensic auditability the platform exists for. *(L.)*

### Domain model (generic-CRM leaks `CLAUDE.md` forbids)
7. **Stage 12 absent end-to-end.** No `file_manifest`/`recovered_files`/`delivery_approval`/`customer_accept` anywhere. Customer can approve a quote but never review/accept recovered data; lab can't itemize or prove what was delivered. *(XL — new manifest entity + portal accept gate.)*
8. **Split-brain quote approval.** Portal approves `case_quotes` via `approve_quote` RPC; staff convert the disconnected `quotes` table (`QuoteDetailPage.tsx:163` gates on `quotes.status==='accepted'`). The customer's approval never flips the staff quote → the Stage-7 loop is broken. *(L — unify on one quote entity.)*

### Multi-tenant configurability
9. **Every "Manage Categories" tab fails silently.** `CategoryDetail.tsx:185-253` writes directly to global `master_*`/`catalog_*` tables whose INSERT/UPDATE/DELETE RLS is `is_platform_admin()` only; a tenant admin is never a platform admin → all writes rejected, and there's **zero `onError`** handler. 28 of 30 taxonomy tables advertise editing that cannot work for any tenant. *(XL — tenant-overridable master-data layer.)*
10. **No per-tenant workflow/status/QA tables exist.** `master_case_statuses` (18 rows), `catalog_device_conditions` (20 rows), fault catalog — all global, shared by all tenants, no `tenant_id`. A RAID lab and a mobile-forensics lab are forced onto one identical lifecycle, condition grading, and fault taxonomy. *(XL — the core of the tenant-customization framework.)*

---

## 3. UI Audit Report

**Strengths:** real token system; `Card` themes its surface; `Badge`/`StatsCard`/`EmptyState` are a11y-aware; `Dialog` base is exemplary (focus trap, scroll-lock ref-count, stacked-dialog Esc, restore-focus, dev warning on missing name); RTL via logical properties throughout.

**Issues:**
- **4–5 divergent KPI/stat-card languages** — `ui/StatsCard`, `financial/FinancialStatsCard`, `Dashboard` `QuickStat`, `StockReportsPage` `StatCard`, `CasesList` inline cards. Every dashboard's headline metrics look like a different product. *(high, `design-consistency`)*
- **Radius & elevation unsystematized** — `rounded-lg/xl/2xl/md` coexist (often in one component); `shadow-lg` is the most common elevation despite a "calm, dense, utilitarian" brand. Visual weight is louder than the contract. *(medium)*
- **Two real visual BUGS ship:** `PageHeader`'s `text-${color}-600` and `SystemLogs`' `bg-${color}-100` are JIT-stripped by Tailwind → colored stats/chips render default/transparent. *(high — Tailwind can't see interpolated class names; use a static map.)*
- **No page-shell discipline** — container max-width (`7xl`/`5xl`/`4xl`/`3xl`/`none`) and vertical rhythm (`space-y-6` vs `space-y-4`) are a coin-flip per page; content width and section spacing visibly jump as you navigate. Operational pages cap at `max-w-[1800px]`, admin/settings at `max-w-7xl` (1280px). *(high)*
- **Surface tokens barely used** — `bg-white` 270× vs `bg-surface` 2×; raw `slate` everywhere; `Card`'s `bordered` variant hardcodes `border-slate-200`. The theme reaches brand accents but not the chrome. *(high, `standardization`)*
- **The Sidebar — the most-trafficked surface — is 23 raw hex literals with JS color swaps and is ESLint-exempt** (`eslint.config.js` baselines it OFF). The app frame does not theme and opts out of the DM Sans brand font (`system-ui`). *(high)*

---

## 4. UX Audit Report

**Strengths:** `CaseSuccessModal` (Print Receipt / Label / Go to Case / Create Another); genuine multi-device + RAID bulk-drive intake; `CaseDetail` handles loading/error/not-found as three distinct states with escape hatches; portal cards are keyboard-operable with `role="button"`/Enter/Space.

**Highest-friction journeys & gaps:**
- **No lifecycle wayfinding.** `CaseDetail.tsx:258-272` renders **13 always-visible tabs**, no guided next step after creation, and the **History tab shows custody, not job history** (`useCaseQueries.ts:413` fetches `case_job_history` but it's never rendered). The user self-orchestrates a 16-stage process. *(high, `ux-workflow`)*
- **Two contradictory status controls** on the same case: the governed `CaseStageBanner` (→ `transition_case_status` RPC) vs a raw `<select>`/Overview Save in `CaseOverviewTab.tsx:365` that does a raw `.from('cases').update()` bypassing transition guidance, release gates, and history. *(high, `domain-correctness`)*
- **CreateCaseWizard collapses per-device recoverability to `devices[0]`** (`:921-985` — Problem/Requirements/Password/Encryption all bound to `updateDevice('1', …)`), and QA/recovery sign-off is **case-level only** (`CaseRecoveryQaTab.tsx:68-107`) — collapsing N device outcomes into one on RAID jobs. *(high, generic-CRM leak)*
- **No unsaved-changes guard on ~80 create/edit modals** (guards exist in only 6 files). Closing discards all work silently. *(high)*
- **`useConfirm` can't show async loading** — `ConfirmDialog` supports `isLoading` but the hook doesn't expose it, so money/custody confirms ("Void payment?", "Submit VAT return?") close instantly with no spinner or error rollback. *(high)*
- **Single home dashboard identical for every role** — a technician and an accountant land on the same finance-tilted view. *(high)*
- **Read-only dead-ends:** "Log Communication" button has no `onClick` and there is **zero INSERT into `customer_communications`** anywhere; `AttendanceDashboard` can't record attendance; PO detail renders an empty Line Items table. *(high, `missing-feature`)*

---

## 5. Design Consistency Report

Anchored to `DESIGN.md` (a genuinely exemplary contract). Drift today:

| Dimension | Standard | Reality |
|---|---|---|
| Loading | `Skeleton`/`Spinner` | **128 ad-hoc `animate-spin`**, ~0 primitive adoption |
| Tables | `ui/Table` (a11y) | **63 hand-rolled**, 7 adopt; plus a 2nd `shared/DataTable` (3 importers) |
| Headers | `PageHeader` | 7 busiest lists hand-roll |
| Stat cards | one language | 4–5 variants |
| Surface color | `bg-surface`/`border-border` | `bg-white` 270×, `border-slate-*` dominant |
| Inline style | tokens/classes | **309 `style={{}}` across 93 files** |
| Confirm | `useConfirm` | 13 `window.confirm` (+6 `alert()`, +22 `window.confirm()` per a11y lens) |
| Toast | themed `useToast` | 31 files raw (invisible) |

**The pattern:** the canonical thing almost always exists — adoption is 20–80% partial, and *identical actions diverge by sibling page, not by module* (bulk-archive uses `window.confirm` in `CasesList`/`Quotes`/`Expenses`/`Customers` but `useConfirm` in `InvoicesListPage`; convert-to-tax-invoice toasts differ in wording *and* toast system between `QuotesListPage` and `InvoiceDetailPage`).

---

## 6. Navigation Audit

**Strengths:** layered route guarding (`ProtectedRoute` ∘ `FeatureRoute` ∘ sidebar gate, RLS backstop); command palette is a model APG combobox surfaced as a clickable button too.

**Issues:**
- **Dead links:** Sidebar links `/integrations` (route removed, `App.tsx:393` → 404); **Help & Support button has no `onClick`**; a `/admin/audit-trails` palette link 404s.
- **4 sidebar nav links never render for any role** (missing `ROUTE_TO_MODULE_KEY` in `moduleMapping.ts`: `/payroll/adjustments`, `/payroll/loans`, `/payroll/settings`, `/purchase-orders`).
- **Breadcrumbs lose all record context and aren't clickable** — `AppLayout.tsx:75-87` uses only `pathname.split('/')[0]` against a hardcoded map (with stale `search`/`integrations` entries); a case-detail page shows "Core Operations › Cases", never the case number.
- **Hidden modules:** Templates, Notifications history, all Settings sub-pages, Quotes recycle-bin, and the stock sub-pages (categories/sales/adjustments/reports/locations) are reachable **only by deep link or palette** — never the sidebar.
- **Three overlapping concepts — Customers / Clients / Companies** — and `/clients` is a stale, schema-broken duplicate still registered.
- **Settings IA fragmented across three disconnected hubs** (`settingsCategories.ts`, `AdminPanel` grid, Sidebar System section) with overlaps.
- **Single-open accordion sidebar** — only one section stays expanded at a time (friction for cross-module work).
- **Active state conveyed by color/weight only** — no `aria-current` anywhere; parent+child items highlight together.

---

## 7. Responsive Design Audit

**This is the weakest dimension.** The team *can* do responsive — `CaseDetail` (`p-4 md:p-8 max-w-[1800px]`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`), `InvoiceDetailPage` (`flex flex-col xl:grid xl:grid-cols-3` master-detail + print media queries), `Dialog` (`mx-4 max-h-[90vh]`), and the **customer `PortalLayout`** (real `md:hidden` mobile nav) are all proofs — but it wasn't applied systemically.

| Breakpoint | Verdict |
|---|---|
| **Mobile (375px)** | **Staff shell unusable** — fixed `w-72`/`w-[72px]` sidebar, no hamburger/drawer/overlay (`AppLayout`/`Sidebar`). `PlatformAdminLayout` repeats the `fixed w-64` mistake. **142 non-responsive `grid-cols-2`** form grids (incl. CreateCaseWizard RAID intake) stay cramped two-up. **47 `overflow-x-auto` table wrappers, zero `md:hidden` card fallbacks, zero responsive column hiding** — 8–9-column lab tables only horizontal-scroll. |
| **Tablet (768px)** | Stat grids jump `grid-cols-1 → md:grid-cols-4` with no 2-col intermediate (4 cards crammed at 768px). |
| **Laptop (1440–1680px)** | Mostly fine; `max-w-[1800px]` caps prevent line-length blowout. |
| **Ultrawide (1920–3440px)** | **Wasted** — only **8 grid instances repo-wide** use `xl:`/`2xl:` column expansion, so a 3440px monitor renders the same 4-col-max layout as a 1280px laptop. **41% of page files have zero breakpoints.** |

---

## 8. Accessibility Audit (WCAG 2.2)

**Strengths:** a11y is baked into primitives (`FormField`/`Input` via `useFieldA11y`; `Table` caption/aria-label/keyboard rows; `Toast` role+aria-live; `Dialog` focus trap/restore); skip-link + `main` focus target; portal is exemplary (`role=button`, Enter/Space, `role=alert` retry, skeletons); global `prefers-reduced-motion`; focus-ring token themes. **The a11y lives in ~8 components, not the product.**

**Failures (by volume):**
- **Form labels not associated at scale** — `src/pages`: **236 raw `<label>` vs 9 `htmlFor`**, and **0 `aria-label` on 82 `<select>`**. The dominant 1.3.1 / 3.3.2 / 4.1.2 failure, hitting every operational/intake/custody form. *(critical-class for a legally-load-bearing lab.)*
- **Table semantics absent** — ~456 hand-rolled `<th>` with no `scope`, no `aria-sort` (vs `Table.tsx:65` which does it right but is used ~4×).
- **Charts are an a11y dead zone** — zero `role=img`/`aria-label`/`<title>`, color-only encoding, no SR alternative (recharts in PlatformDashboard, StockReportsPage).
- **App-shell chrome a11y-thin** — no `aria-current` on nav, no `aria-expanded` on accordions, icon-only collapse toggle without `aria-label`/`aria-pressed`.
- **Status feedback bypasses AT** — 31 raw toasts skip the themed aria-live; 6 `alert()` + 22 `window.confirm()` are unannounced native blocking dialogs.
- **Contrast edge gaps** — `text-slate-400` ×258, `slate-300` ×98 risk AA failure; framer-motion JS animations in non-auth files don't honor `useReducedMotion`.

---

## 9. Performance Perception Audit

**Strengths:** code-splitting + heavy-dep isolation done right (framer-motion/recharts/pdfmake all contained — **the bundle is NOT the problem**); anti-flash theme/locale pre-seed in `main.tsx`; exactly **1 `<img>` in all of src** (no image-decode concern); `lazyWithRetry` resilience; CommandPalette/NotificationBell queries are bounded + on-demand.

**Issues (mostly data-layer, not render):**
- **Three incompatible pagination strategies** — server-range (CasesList), client-slice (Customers/Suppliers/Inventory/Companies), and **none** (Invoices, Stock). Several pages fetch entire tables and paginate/filter in the browser; inventory double-fetches. *(high)*
- **Unbounded full-table `SELECT`s** with no `range`/`limit` on operational lists (`stockService.getStockItems` `.select('*, stock_categories(*)')`). *(high)*
- **No list virtualization anywhere** — no `react-window`/`@tanstack/react-virtual`; every fetched row is a live DOM node. *(high)*
- **Realtime marks data stale but never refetches** — `useCasesRealtime.ts:23-29` uses `refetchType:'none'` and `main.tsx` sets global `refetchOnMount:false`, so live case updates don't actually appear until a hard navigation. *(medium-high)*
- **Perceived:** 128 ad-hoc spinners where the `Skeleton` primitive (with CLS-reserving layout) exists; failed fetches silently render the empty state (only 9/127 pages reference `isError`).

---

## 10. Power-User Productivity Audit

**Strengths:** the **command palette is the single best power surface** (Cmd/Ctrl+K, fuzzy/initials scoring, create-intent actions, recents); `BulkActionsBar` is a clean reusable floating pill; bulk-send has rate-limit warnings + progress; 95 files guard submit while pending (double-submit largely prevented).

**Speed leaks:**
- **No saved/shared views, column config, or persisted filters** — `grep savedView/columnConfig/visibleColumns = 0` repo-wide. Refresh/back/URL-share loses the entire working view (`useSearchParams` is used only to read `?new=1`). *(high)*
- **List rows are `onClick={navigate}` divs, not `<Link>`** — cmd-click / middle-click to open in a new tab silently fails (17 list pages). *(high)*
- **No inline / quick-edit anywhere** — every field change opens a full modal or detail page. *(high)*
- **Bulk actions limited to Export + Archive** — no bulk status-change, assign-engineer, reassign, or send-document for high-volume batch work. *(high)*
- **No global entity search** — the unifying `/search` route was removed; the palette only searches a static nav registry + 15 hardcoded recents. *(high)*

---

## 11. Enterprise Readiness Assessment

Benchmarked vs Salesforce / HubSpot / ServiceNow / Monday / Jira / Zendesk / Zoho / Odoo / Dynamics — **patterns only** (the domain model is correctly *not* a generic CRM).

| Capability | xSuite today | Gap |
|---|---|---|
| Saved/shared views & filters | none | **high** |
| Global full-text search | removed | **high** |
| Bulk operations | Export + Archive only | high |
| Inline/quick edit | none | high |
| In-app automation / SLA timers | **backend fully built, ZERO UI** (`tenant_sla_policies`, `process_time_based_events()`, pg_cron) | **high — fastest enterprise win in the repo** |
| Audit/activity timelines | exist but shallow (100-row cap, no date filter, no diff) | medium |
| Custom fields | none | high |
| Configurable statuses/pipelines per tenant | global only | **critical (see §2)** |
| @mentions / collaboration | none | medium |
| Scheduled reports / BI export | CSV per-page (3 escaping idioms, 1 corrupts data) | medium |
| SSO / SCIM / API / webhooks | **decorative entitlements** (`featureGateService` enumerates `sso`/`api_access`/`white_labeling` but enforces nothing) | high |
| Employee self-service | none — all HR/payroll routes hard-gated to owner/admin/hr | high |
| Supplier approval / performance | **faked UI** — non-existent data rendered as read-only theatre | high |

**Verdict:** enterprise *data integrity* is ahead of peers; enterprise *configurability, productivity surfaces, and self-service* are behind. The SLA engine being built-but-headless is the standout: weeks of backend value with no front door.

---

## 12. Missing Features Report

1. **Recovered-file manifest + customer delivery-accept gate (Stage 12)** — absent on staff *and* portal. *(XL, critical)*
2. **SLA / time-based automation UI** — engine exists (quote-expiry, invoice-overdue tiers, SLA breach), no policy config, no countdown, no breach indicator. *(L, high)*
3. **Multi-currency UI** — services support it; *no currency/rate field in any payment/invoice/receipt modal*. *(high)*
4. **Attendance entry** — dashboard is read-only. *(high)*
5. **Communication logging** — read-only; no INSERT path. *(high)*
6. **NDA / legal-document handling** — `ndas` table unused; no surface on customer/company records. *(high — domain-critical for a forensic lab)*
7. **Operational/lab analytics dashboard** — reporting is finance-only, blind to the 16-stage lifecycle. *(high)*
8. **PO receiving lifecycle** — receiving stock never advances PO status/`received_at`/`received_by`; no partial-receipt model. *(high)*
9. **Employee self-service portal** (own leave/payslip/timesheet). *(high)*
10. **Template builder** — editing is a raw HTML/plaintext `<textarea>` with no variable picker or preview. *(medium-high)*

---

## 13. Workflow Optimization Recommendations

- **Make the case the spine.** Add a stage-aware "next action" CTA after creation, collapse the 13 tabs into a progressive disclosure keyed to the current lifecycle stage, and render `case_job_history` in the History tab (it's already fetched).
- **One status authority.** Remove the raw Overview status `<select>`; route 100% of status changes through `transition_case_status` so release gates, role allowlists, and history always apply.
- **Per-device everything.** Bind CreateCaseWizard fault/requirement/encryption fields per device; make QA/recovery sign-off per device with a case-level roll-up — never collapse N→1.
- **Close the approval loop.** Unify quotes so the portal approval flips the canonical quote to `accepted` and unlocks conversion; show approval provenance (who/when/IP).
- **Gate release on QA + (optional) payment + delivery-acceptance**, all advisory-overridable with audited reasons.
- **Wire custody at intake and at every physical move** (device receipt, donor/part assignment, checkout) — not only at financial events.
- **Surface the SLA engine** — policy config in Settings, a per-case countdown chip, and a breach indicator in lists.

---

## 14. Design System Recommendations

1. **Promote one `DataTable`** (sort, server-pagination, column config, bulk, saved views, `aria-sort`, mobile card fallback) and deprecate `ui/Table` + `shared/DataTable` into it.
2. **Ship the missing form primitives** — `Select`, `Textarea`, `Checkbox`, `Radio` that consume `useFieldA11y` (like `FormField`/`Input`), then codemod the ~345 hand-rolled labels. This fixes the #1 WCAG failure mechanically.
3. **One stat-card** — kill the 4–5 variants; `StatsCard` is the survivor.
4. **Mandate `Skeleton`/`Spinner`, `useToast`, `useConfirm`, `PageHeader`, `EmptyState`** via ESLint (ban raw `react-hot-toast`, `window.confirm`, `animate-spin` outside the primitive, interpolated color classes).
5. **Extend tokens to chrome** — codemod `bg-white→bg-surface`, `border-slate-200→border-border`; de-exempt the Sidebar onto tokens; restore the DM Sans brand font in the shell.
6. **Systematize radius/elevation** — one radius per surface tier, cap at `shadow-md` for the "calm/dense" brand; add to `DESIGN.md`.
7. **Add `aria-sort` to all tables and chart `role=img`/SR summaries** as primitive defaults.

---

## 15. Standardization Framework

The canonical pattern each action must converge to (all primitives already exist):

| Action | Canonical | Replace |
|---|---|---|
| **Create / Edit** | `Modal` (shared `Dialog`) form via `react-hook-form`+`zod`, `FormField` controls, unsaved-changes guard, "Create another" | navigate-to-wizard / navigate-to-form-page / hand-rolled validation |
| **Delete / Archive** | `useConfirm` (async, with cascade copy) → soft-delete → `useToast` success | `window.confirm`, `alert()`, raw toasts |
| **Record Payment** | one `RecordPaymentModal` → atomic `record_payment`/`create_receipt_with_allocations` RPC, with currency/rate | 3 surfaces (`RecordReceiptModal`/`RecordPaymentModal`/legacy `invoiceService.recordPayment`) + divergent gating |
| **Status change** | `transition_case_status` RPC only | raw `.update({status})` |
| **Upload / Attach** | `ImageUpload` / shared upload | per-feature inputs |
| **Notes / Comms** | one create+list component with INSERT | read-only dead-ends |
| **Search** | one debounced search input (debounce on all, not ⅓) + one global entity search | 3 idioms, partial debounce |
| **Filters** | persisted to URL (`useSearchParams`) + saved views | `useState` only (lost on refresh) |
| **Export** | `ExportButton` + `csvExport.ts` (RFC-4180) | 3 escaping idioms (PaymentsList corrupts on embedded quotes) |
| **Tables** | one `DataTable` | 63 hand-rolled |
| **Loading / Empty / Error** | `Skeleton` + `EmptyState` + explicit `isError` | 128 spinners, silent empty-on-error |
| **Toast** | `useToast` | 392 raw calls |
| **Feedback for destructive/money** | `useConfirm` with `isLoading` | instant-close confirms |

Enforce each with an ESLint rule so the convergence can't regress.

---

## 16. Quick Wins (Immediate — days, mostly S)

- Add `.is('deleted_at', null)` to Cases/Customers/Clients list+count+stats queries (fixes 27% phantom rows + "Archive does nothing"). **S**
- Give the global Toaster a real card style (stopgap making 392 invisible toasts visible *today*), then start the codemod. **S→M**
- Fix the CasesList status-filter casing mismatch (`'Received'` vs dropdown value). **S**
- Remove the dead `/integrations` sidebar link; wire or remove the Help & Support button; drop the dead `/admin/audit-trails` palette entry. **S**
- Fix the JIT-stripped `text-${color}-600` / `bg-${color}-100` in `PageHeader`/`SystemLogs` with static maps. **S**
- Add the 4 missing `moduleMapping` entries so payroll/PO nav links render. **S**
- Add `aria-current="page"` to `SidebarNavItem`; `aria-label` to the collapse toggle. **S**
- Add `onError` toasts to `CategoryDetail` mutations (surface the silent global-RLS failures) and hide Add/Edit/Delete on global tables until the override layer ships. **S**
- Expose `isLoading` from `useConfirm` (the dialog already supports it). **S**
- Convert list-row `onClick={navigate}` to `<Link>` on the top 5 lists (restores new-tab + keyboard). **S→M**

---

## 17. High-Impact Improvements (weeks)

- **Primitive-adoption sprint** (the keystone): ship `DataTable` + form primitives; codemod tables (63), spinners (128), toasts (31), confirms (13), labels (~345). Collapses most UI/UX/a11y/responsive findings at once.
- **Responsive shell**: off-canvas drawer sidebar below `lg` (reuse `Dialog`/`useFocusTrap` + PortalLayout precedent); fix `PlatformAdminLayout`; make form grids and tables responsive (card fallback on mobile, `xl:`/`2xl:` expansion on ultrawide).
- **Server-side pagination + virtualization** on operational lists; turn realtime into actual refetch.
- **Surface the SLA/automation engine** (policy config + countdown + breach chip).
- **Unify the three Record-Payment surfaces** and add multi-currency fields.
- **Saved views + persisted URL filters + global entity search.**

---

## 18. Long-Term Strategic Enhancements (quarters)

- **Tenant-customization framework** — tenant-overridable master/catalog layer (rename/recolor/reorder/deactivate/ADD statuses, conditions, faults, QA criteria, report sections, email templates), resolving as `tenant rows ∪ defaults`. This is the single biggest enterprise-SaaS unlock.
- **Stage-12 delivery system** — recovered-file manifest per device + portal Review & Accept gate (append-only acceptance event) preceding checkout/closure.
- **Operational analytics** — a lifecycle-aware dashboard (throughput per stage, recoverability rates, SLA breaches, engineer load) distinct from finance.
- **Employee self-service portal** and **real supplier management** (replace faked data/metrics).
- **Enforce subscription entitlements** (SSO/API/white-label) instead of decorative flags.
- **Role-relevant landing dashboards.**

---

## 19. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data released before payment / before customer accepts recovered data | Medium | **Severe** (revenue + legal) | §2.1, §2.7 release gates |
| Stat/list numbers wrong (soft-delete leak) | **Happening now** (27% live) | High (decisions on phantom data) | §16 quick win |
| Custody chain has gaps (device assignment unlogged) | Medium | **Severe** (forensic/legal defensibility) | §2.6 |
| Wrong paychecks (hardcoded 7%, non-atomic payroll) | High for non-OM tenants | High | §2.4/2.5 |
| Stock/ledger divergence + oversell (non-atomic) | Medium | High (money) | §2.5 RPCs |
| Users miss success/error (invisible toasts) → double-submit money ops | **Happening now** | High | §16 stopgap + codemod |
| Tenants believe they configured the lab but didn't (silent RLS) | **Happening now** | High (trust/churn) | §2.9 |
| App unusable on phones/tablets on the shop floor | High | Medium-High | §17 responsive shell |
| **Mitigation risk:** large codemods regress behavior | Medium | Medium | Land behind the existing CI gates (tsc/lint/schema-drift); codemod per-module with the 55 existing tests + new regression tests |

---

## 20. Priority-Based Roadmap

### 🔴 Critical (Sprint 0–1 — protect money, custody, trust)
1. Soft-delete filter fix (Cases/Customers/Clients) — **S**
2. Toaster stopgap + begin raw-toast codemod — **M**
3. Payment-before-release gate (advisory, tenant-flag) — **L**
4. Payroll: configurable deductions + atomic RPC — **L**
5. Stock mutations → atomic RPCs — **L**
6. Custody event at device assignment + intake — **L**
7. `CategoryDetail` `onError` + hide non-writable global-table editing — **S**
8. Status-filter casing fix; dead-link cleanup; JIT color-class bugs — **S**

### 🟠 High (Q1 — finish the platform)
9. **Primitive-adoption sprint** (DataTable + form primitives + codemods) — **XL program, high ROI**
10. Responsive shell (drawer) + responsive tables/forms + ultrawide — **L**
11. Unify quote-approval loop + Record-Payment surfaces + multi-currency UI — **L**
12. Server pagination + virtualization + realtime refetch — **L**
13. Surface SLA/automation engine — **L**
14. Saved views + URL-persisted filters + global search — **L**
15. One status authority (remove raw status select) + per-device QA — **M**

### 🟡 Medium (Q2 — enterprise polish)
16. Tenant-customization framework (overridable taxonomy) — **XL**
17. Stage-12 manifest + portal delivery-accept — **XL**
18. Operational analytics dashboard; role-relevant landings — **L**
19. Settings IA consolidation; resolve Customers/Clients/Companies overlap — **M**
20. Communication/attendance/NDA write paths; PO receiving lifecycle; template builder — **M each**

### 🟢 Low (backlog)
21. Audit-log viewer depth (date filter, diff, pagination); supplier real data; employee self-service; entitlement enforcement; @mentions; scheduled reports.

---

### Appendix — Method & Confidence
- 14 discovery agents (foundational systems + 6 module deep-dives) → 9 discipline lenses (UX/UI/standardization/responsive/a11y/perf/enterprise/power-user/tenant-config) → 44 adversarial verifications. 6.27M tokens, 1,021 tool calls.
- Verification: **0/44 refuted**; severities corrected down on ~61% of checked items → raw 17-critical/107-high counts are an **upper bound**; this report's critical tier (§2) is the verified spine.
- Orchestrator cross-checked the backbone first-hand (Sidebar, AppLayout, Table, App.tsx router, DESIGN.md) and quantified standardization metrics directly via `grep` (7/63 tables, 0/128 spinners, 8/13 confirms, 309 inline styles, 54 `allowedRoles`, 105 Modal adoption, 0 `.single()`).
