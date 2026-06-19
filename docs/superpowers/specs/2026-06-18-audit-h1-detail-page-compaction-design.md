# Audit 3 · H1 — Detail-Page Compaction (Design)

> _2026-06-18._ Audit-3 track **H1 (High)**. Introduces a shared, breadcrumb-led
> `DetailPageHeader` and a denser detail-page layout, then migrates the three
> detail pages (Invoice, Case, Customer) onto it in one PR, sequenced page-by-page.
> Builds on C1 (pagination) and C2 (virtualization), both shipped.

## 1. Motivation & corrected premise

A read-only survey of the three target detail pages corrected several claims in the
original audit:

- **No duplicate title** and **no "preview vs side-card" duplication** exist today
  (there are no breadcrumbs yet; the invoice document renders in the main column
  while side cards are metadata/actions only).
- The **"5-card right rail" is Invoice-only.** `CaseDetail` has **0** side cards
  (quick-info sits inside its header); `CustomerProfilePage` has **1** (Portal).
- All three **hand-roll a "← Back" button** and place the title inconsistently:
  `InvoiceDetailPage` via the shared `PageHeader`; `CaseDetail` as an inline `<h1>`
  with a status badge inside a unified white header card; `CustomerProfilePage`
  buries the `<h1>` inside the first content `Card`. **No `DetailPageHeader` exists.**

The verified wins, therefore, are: **(a)** one shared compact header replacing three
inconsistent hand-rolled headers, **(b)** denser containers/cards, **(c)** on Invoice,
collapsing the rail by moving its **Status** + **Actions** cards into the header.

**Decisions (confirmed with the product owner):** migrate **all three pages this PR**;
use a **breadcrumb trail** (the final crumb is the title); on Invoice **move Status +
Actions into the header** (rail 5 → 3).

## 2. Goals / non-goals

**Goals**
- A reusable `DetailPageHeader` (breadcrumb + title + badges + actions + meta), compact
  and tokenized, replacing the three hand-rolled headers.
- Denser detail layout: container `px-6 py-5`, content/side cards `p-4` + `space-y-4`.
- Invoice rail compaction: 5 → 3 cards (Status + Actions move into the header).
- Consistent breadcrumb navigation on all three detail pages.

**Non-goals (YAGNI)**
- No global top-bar/header-slot work — that is **H2**; this PR keeps each page's header
  inline (the breadcrumb trail prepares for H2 but does not implement it).
- No change to CaseDetail's 14-tab system or CustomerProfile's 5-tab system, the
  invoice document renderer, the right-rail *content* (beyond moving Status/Actions),
  data fetching, or any service/DB. No migration.
- No new dependency.

## 3. `DetailPageHeader` component

New file: `src/components/shared/DetailPageHeader.tsx`.

```tsx
export interface Crumb {
  label: string;
  to?: string; // present → React-Router <Link>; absent → current page (the title)
}

export interface DetailPageHeaderProps {
  /** Breadcrumb trail. The LAST crumb is the current page and renders as the
   *  prominent title (no link); earlier crumbs render as <Link to={to}>. */
  breadcrumbs: Crumb[];
  /** Status + secondary badges, shown beside the title. */
  badges?: React.ReactNode;
  /** Right-aligned action buttons (wraps on small screens). */
  actions?: React.ReactNode;
  /** Compact line beneath the title — e.g. <AuditInfo …/>. */
  meta?: React.ReactNode;
}
```

**Layout & behavior**
- A `px-6 py-5` block (not a heavy card). Row 1: the breadcrumb trail on the left
  (muted parent links separated by a `ChevronRight`/`/`, the final crumb bold and
  larger as the title) with `badges` beside it, and `actions` right-aligned (the row
  is `flex flex-wrap items-start justify-between gap-3`). Row 2 (if `meta`): a compact
  muted line.
- Title comes from the last crumb — it is **not** repeated elsewhere on the page.
- Parent crumbs use `react-router-dom` `<Link>`. The current crumb is a `<span aria-current="page">`.
- Tokenized: `text-slate-*` neutrals, `text-primary` for links, no raw hex, no banned colors.
- Accessibility: wrap the trail in `<nav aria-label="Breadcrumb">` with an ordered list;
  `aria-current="page"` on the final crumb.

**Unit tests** (`DetailPageHeader.test.tsx`):
1. Renders parent crumbs as links (with correct `href`) and the final crumb as the
   current page (not a link), as the title text.
2. Renders `badges`, `actions`, and `meta` when provided; omits the `meta` row when absent.

## 4. Per-page application

### 4.1 InvoiceDetailPage (`src/pages/financial/InvoiceDetailPage.tsx`)
- Replace the back button + `PageHeader` (≈ lines 507–515) with:
  - `breadcrumbs = [{ label: 'Invoices', to: '/invoices' }, { label: 'Invoice ' + invoice.invoice_number }]`
  - `badges` = the status + type badges (from the old **Status** card, ≈ 532–568)
  - `actions` = the buttons from the old **Actions** card (≈ 571–672): Download PDF,
    Edit, Issue, Record Payment, Credit Note, Convert to Tax, View Conversion History
  - `meta` = the existing `<AuditInfo>` (≈ 690)
- **Remove** the right-rail **Status** card and **Actions** card → rail 5 → 3 (Invoice
  Details, Payment History, Credit Notes).
- The Actions card's **error / loading / conversion-alert messaging** (not buttons) moves
  to a thin inline alert strip rendered directly beneath `DetailPageHeader` (a small
  `space-y-2` region), so no user feedback is lost.
- Density: outer container `p-4 md:p-8 max-w-[1800px]` → `px-6 py-5 max-w-[1800px]`;
  remaining rail cards `p-6` → `p-4`, rail container `space-y-6` → `space-y-4`.

### 4.2 CaseDetail (`src/pages/cases/CaseDetail.tsx`)
- Replace the hand-rolled title/badge/buttons block (≈ 329–422, inside the white header
  card at 328) with `DetailPageHeader`:
  - `breadcrumbs = [{ label: 'Cases', to: '/cases' }, { label: 'Case #' + caseData.case_no }]`
  - `badges` = the case status badge (≈ 341–343)
  - `actions` = the existing header buttons (WhatsApp, Office Receipt, Customer Copy,
    Print Label, Device Checkout, Duplicate Case, Delete[admin]) (≈ 355–421)
  - `meta` = the existing `<AuditInfo>` (≈ 345)
- Keep the **stage banner** (≈ 425–438) and **quick-info cards** (≈ 441–489) rendered
  directly below the header, and the **14-tab system** (493–835) unchanged.
- Density: drop the now-redundant white header-card wrapper padding into the header's
  own `px-6 py-5`; leave tab content untouched.

### 4.3 CustomerProfilePage (`src/pages/customers/CustomerProfilePage.tsx`)
- Add `DetailPageHeader` above the grid (replacing the standalone back button ≈ 458–464):
  - `breadcrumbs = [{ label: 'Customers', to: '/customers' }, { label: customer.customer_name }]`
  - `badges` = the active/portal badges currently inline with the title
  - `actions` = the **Edit Profile** button (≈ 539)
  - `meta` = the existing `<AuditInfo>` (≈ 523)
- Strip the `<h1>` title, Edit button, and badges out of the first content `Card`
  (≈ 468–543) — that card becomes pure customer details (avatar + contact info).
- Density: outer container `p-8 max-w-[1600px]` → `px-6 py-5 max-w-[1600px]`; main/side
  cards `p-6` → `p-4`. Keep the 5-tab system.

## 5. Density standard (folds in L3)

Detail-page outer container standardizes to `px-6 py-5` (with each page's existing
`max-w-*`). Content and side cards move to `p-4` with `space-y-4` vertical rhythm. This
is applied only to the three migrated pages in this PR; a broader sweep is out of scope.

## 6. Testing

- `DetailPageHeader.test.tsx` — the two unit tests in §3 (render under `MemoryRouter`).
- The three pages are large and effectively untested at the render level (jsdom); they are
  verified via `npm run typecheck`, `eslint`, and the full `vitest` suite staying green,
  plus any existing page tests kept passing. No heavy new per-page render tests — consistent
  with the BankingPage / StockReports precedents.

## 7. Sequencing (within the single PR)

1. `DetailPageHeader` + its tests (TDD) — commit.
2. Migrate **InvoiceDetailPage** (the cleanest reference; includes the rail 5 → 3 work) —
   commit. Review.
3. Migrate **CaseDetail** — commit. Review.
4. Migrate **CustomerProfilePage** — commit. Review.
5. Full gate + push.

Page-by-page commits keep each step reviewable and bisectable even though they ship in one PR.

## 8. Verification gates (every commit)

- `npm run typecheck` → 0 errors.
- `npx eslint <touched files>` → 0 errors (pre-existing `no-untranslated-jsx-text` warnings accepted).
- `npx vitest run` → green (baseline at branch cut: 155 files / 1289 passed / 2 skipped, +1 file for the new component tests).
- Semantic tokens only; no banned colors; no DB migration.

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Large diff across three big files (CaseDetail 1400+ LOC) | Page-by-page commits + gates between each; the shared component is isolated and tested first. |
| Invoice Actions-card relocation drops error/alert messaging | Explicitly relocate the error/loading/conversion-alert UI to an inline strip under the header — buttons to `actions`, messaging to the strip. |
| Breadcrumb labels need live data (invoice number, case no, customer name) | Render the header only after the entity has loaded (all three already guard on a loaded entity before the header region). |
| Moving status/actions changes muscle memory | Status badge stays visually prominent (beside the title); actions stay top-right — a more conventional detail-page position than a mid-rail card. |
| Sticky/scroll interactions | The header is static (not sticky) in this PR; H2 handles top-bar/sticky behavior. |
