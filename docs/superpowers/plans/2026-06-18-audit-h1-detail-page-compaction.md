# Audit H1 — Detail-Page Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a shared breadcrumb-led `DetailPageHeader` and migrate the Invoice, Case, and Customer detail pages onto it, with denser layout and (on Invoice) the right rail collapsed 5 → 3.

**Architecture:** A small presentational `DetailPageHeader` (breadcrumb trail whose final crumb is the page title, plus `badges`/`actions`/`meta` slots) rendered above each detail page. Each page moves its title, status badge, action buttons, and `AuditInfo` into the header; Invoice additionally deletes its Status and Actions side cards and relocates their error/alert messaging to an inline strip.

**Tech Stack:** React 18 + TypeScript, react-router-dom, Tailwind (semantic tokens), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-06-18-audit-h1-detail-page-compaction-design.md`. Branch: `claude/audit-h1-detail-compaction` (cut from `main` d2c7ac3). No DB migration. Commit each task with `git commit -S` (signing is required; plain commits have silently skipped signatures this session). Commit-message trailer on every commit:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TZgCDzRcXDfuJNgHJHbbeU
```

---

## File Structure

- **Create** `src/components/shared/DetailPageHeader.tsx` — the shared header (one responsibility: render breadcrumb + title + badge/action/meta slots).
- **Create** `src/components/shared/DetailPageHeader.test.tsx` — unit tests.
- **Modify** `src/pages/financial/InvoiceDetailPage.tsx` — header + rail 5→3 + density.
- **Modify** `src/pages/cases/CaseDetail.tsx` — header + density.
- **Modify** `src/pages/customers/CustomerProfilePage.tsx` — header + density.

---

## Task 1: `DetailPageHeader` component (TDD)

**Files:**
- Create: `src/components/shared/DetailPageHeader.tsx`
- Test: `src/components/shared/DetailPageHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/shared/DetailPageHeader.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailPageHeader } from './DetailPageHeader';

function renderHeader(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('DetailPageHeader', () => {
  it('renders ancestor crumbs as links and the final crumb as the title (not a link)', () => {
    renderHeader(
      <DetailPageHeader
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: 'Invoice INV-0042' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
    expect(screen.getByRole('heading', { name: 'Invoice INV-0042' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invoice INV-0042' })).not.toBeInTheDocument();
  });

  it('renders badges, actions, and meta when provided', () => {
    renderHeader(
      <DetailPageHeader
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: 'Acme Corp' }]}
        badges={<span>Active</span>}
        actions={<button>Edit</button>}
        meta={<span>created today</span>}
      />,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('created today')).toBeInTheDocument();
  });

  it('omits the breadcrumb nav when only the current crumb is given', () => {
    const { container } = renderHeader(<DetailPageHeader breadcrumbs={[{ label: 'Solo' }]} />);
    expect(screen.getByRole('heading', { name: 'Solo' })).toBeInTheDocument();
    expect(container.querySelector('nav')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/shared/DetailPageHeader.test.tsx`
Expected: FAIL — `./DetailPageHeader` does not exist.

- [ ] **Step 3: Write the component**

Create `src/components/shared/DetailPageHeader.tsx`:
```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Present → an ancestor <Link>. Absent on the final crumb (the current page). */
  to?: string;
}

export interface DetailPageHeaderProps {
  /** Breadcrumb trail. The LAST crumb is the current page and renders as the
   *  <h1> title; earlier crumbs render as ancestor links above it. */
  breadcrumbs: Crumb[];
  /** Status + secondary badges, shown beside the title. */
  badges?: React.ReactNode;
  /** Right-aligned action buttons (wraps on small screens). */
  actions?: React.ReactNode;
  /** Compact muted line beneath the title — e.g. <AuditInfo …/>. */
  meta?: React.ReactNode;
}

/**
 * Shared, compact detail-page header. The breadcrumb's final crumb IS the page
 * title (rendered once as an <h1>), so the title is never duplicated. Ancestor
 * crumbs are router links. `badges`, `actions`, and `meta` are caller-composed
 * slots. Container is px-6 py-5 (the detail-page density standard).
 */
export const DetailPageHeader: React.FC<DetailPageHeaderProps> = ({
  breadcrumbs,
  badges,
  actions,
  meta,
}) => {
  const ancestors = breadcrumbs.slice(0, -1);
  const current = breadcrumbs[breadcrumbs.length - 1];
  return (
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {ancestors.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-1">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                {ancestors.map((crumb, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden="true" />}
                    {crumb.to ? (
                      <Link to={crumb.to} className="hover:text-primary transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{current?.label}</h1>
            {badges}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-2 text-sm text-slate-500">{meta}</div>}
    </div>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/shared/DetailPageHeader.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/components/shared/DetailPageHeader.tsx src/components/shared/DetailPageHeader.test.tsx`
Expected: typecheck 0 errors; eslint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/DetailPageHeader.tsx src/components/shared/DetailPageHeader.test.tsx
git commit -S -m "$(printf 'feat(ui): shared DetailPageHeader (breadcrumb-led detail header) (Audit H1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01TZgCDzRcXDfuJNgHJHbbeU')"
```

---

## Task 2: Migrate InvoiceDetailPage (header + rail 5→3 + density)

**Files:**
- Modify: `src/pages/financial/InvoiceDetailPage.tsx`

This page renders the back button + `PageHeader` (≈ 507–515), then a 3-col grid (517): invoice document (`xl:col-span-2`) + right rail (`xl:col-span-1 space-y-6`) with 5 cards — **Status** (≈ 532–568), **Actions** (≈ 571–672), **Invoice Details** (≈ 675–723), **Payment History** (≈ 725–738), **Credit Notes** (≈ 740–784). Read the file first to get exact current JSX before transforming.

- [ ] **Step 1: Add the import**

Add near the other `../../components/shared/*` imports:
```tsx
import { DetailPageHeader } from '../../components/shared/DetailPageHeader';
```

- [ ] **Step 2: Replace the back button + PageHeader with DetailPageHeader**

Replace the header block (≈ 507–515, the back `<button>` and the `<PageHeader …/>`) with a `DetailPageHeader`. Move the existing elements into its slots **verbatim** (copy the JSX out of the current Status and Actions cards):
- `breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: \`Invoice \${invoice.invoice_number || 'Draft'}\` }]}`
- `badges={…}` — the status + type badge JSX from the **Status** card (≈ 532–568), excluding the conversion-state alert block.
- `actions={…}` — the action buttons from the **Actions** card (≈ 571–672): PDF download, Edit, Issue, Record Payment, Credit Note, Convert to Tax, View Conversion History. Copy the `<Button>`/`<button>` elements only, not the error/loading/alert markup.
- `meta={<AuditInfo …/>}` — reuse the existing `AuditInfo` currently at ≈ 690 (same props).

Remove the now-unused `PageHeader` import if no longer referenced in the file.

- [ ] **Step 3: Relocate the Actions card's error/loading/conversion messaging**

The Actions card (≈ 571–672) also contains error messages, a loading/disabled state, and conversion alerts (and the Status card's conversion-state alert ≈ 532–568). Render these **directly beneath `<DetailPageHeader>`** as a compact strip:
```tsx
<div className="px-6 space-y-2">
  {/* paste the error / loading / conversion-alert JSX moved out of the Status & Actions cards */}
</div>
```
Keep the exact conditional logic and message JSX — only their location changes.

- [ ] **Step 4: Delete the Status and Actions cards from the rail**

Remove the two rail cards (Status ≈ 532–568 and Actions ≈ 571–672) entirely — their badges/buttons/messaging now live in the header and the strip. The right rail now contains 3 cards: Invoice Details, Payment History, Credit Notes.

- [ ] **Step 5: Apply density**

- Outer container (line 506): `p-4 md:p-8 max-w-[1800px] mx-auto` → `px-6 py-5 max-w-[1800px] mx-auto`.
- Right-rail container (line 530): `space-y-6` → `space-y-4`.
- Each remaining rail card (`Invoice Details` 675, `Payment History` 725, `Credit Notes` 741): `p-6` → `p-4`.

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/pages/financial/InvoiceDetailPage.tsx`
Expected: typecheck 0 errors; eslint 0 errors (pre-existing `no-untranslated-jsx-text` warnings acceptable).

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: green (no regressions; any existing invoice tests still pass).

- [ ] **Step 8: Commit**

```bash
git add src/pages/financial/InvoiceDetailPage.tsx
git commit -S -m "$(printf 'refactor(invoices): DetailPageHeader + rail 5->3 + denser layout (Audit H1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01TZgCDzRcXDfuJNgHJHbbeU')"
```

---

## Task 3: Migrate CaseDetail (header + density)

**Files:**
- Modify: `src/pages/cases/CaseDetail.tsx`

This page wraps its header in a white card (≈ 328: `bg-white rounded-lg p-6 mb-6 shadow-sm border border-slate-200`) containing: an inline `<h1>Case #{case_no}</h1>` + status badge (≈ 338–351), `AuditInfo` (≈ 345), an action-button row (≈ 355–421), then a stage banner (≈ 425–438) and quick-info cards (≈ 441–489). Tabs (493–835) follow. Read the file first.

- [ ] **Step 1: Add the import**

```tsx
import { DetailPageHeader } from '../../components/shared/DetailPageHeader';
```

- [ ] **Step 2: Replace the title/badge/buttons block with DetailPageHeader**

Replace the header card's title row (≈ 338–421) with a `DetailPageHeader`, keeping the white-card wrapper OR replacing it (prefer replacing the wrapper's `p-6` with the header's own `px-6 py-5`; keep `mb-6` spacing before the stage banner):
- `breadcrumbs={[{ label: 'Cases', to: '/cases' }, { label: \`Case #\${caseData.case_no}\` }]}`
- `badges={…}` — the status badge JSX (≈ 341–343).
- `actions={…}` — the existing button row JSX (≈ 355–421): WhatsApp, Office Receipt, Customer Copy, Print Label, Device Checkout, Duplicate Case, Delete (keep the admin-only guard on Delete). Copy verbatim.
- `meta={<AuditInfo …/>}` — reuse the existing `AuditInfo` (≈ 345).

- [ ] **Step 3: Keep the stage banner, quick-info cards, and tabs unchanged**

Leave the stage banner (≈ 425–438), quick-info cards (≈ 441–489), and the entire tab system (493–835) exactly as they are, rendered below the header.

- [ ] **Step 4: Apply density**

- Outer container (≈ 326): keep `max-w-[1800px] mx-auto`; set padding to `px-6 py-5` (from `p-4 md:p-8`).
- The header is now `DetailPageHeader` (its own `px-6 py-5`); ensure a `mb-6` gap remains before the stage banner/quick-info.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/pages/cases/CaseDetail.tsx`
Expected: typecheck 0 errors; eslint 0 errors (pre-existing i18n warnings acceptable).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/pages/cases/CaseDetail.tsx
git commit -S -m "$(printf 'refactor(cases): DetailPageHeader on the case detail header (Audit H1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01TZgCDzRcXDfuJNgHJHbbeU')"
```

---

## Task 4: Migrate CustomerProfilePage (header + density)

**Files:**
- Modify: `src/pages/customers/CustomerProfilePage.tsx`

This page has a standalone back button (≈ 458–464), then a 3-col grid (466). The first content `Card` (≈ 468–543) holds the `<h1>` customer name (≈ 480), active/portal badges, `AuditInfo` (≈ 523), and an **Edit Profile** button (≈ 539). The right rail has 1 card (Portal ≈ 611–732). Tabs (738–761) follow. Read the file first.

- [ ] **Step 1: Add the import**

```tsx
import { DetailPageHeader } from '../../components/shared/DetailPageHeader';
```

- [ ] **Step 2: Add DetailPageHeader above the grid; remove the standalone back button**

Replace the standalone back button (≈ 458–464) with a `DetailPageHeader` rendered above the grid (466):
- `breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: customer.customer_name }]}`
- `badges={…}` — the active/portal badge JSX currently inline with the title.
- `actions={…}` — the **Edit Profile** button JSX (≈ 539).
- `meta={<AuditInfo …/>}` — reuse the existing `AuditInfo` (≈ 523).

- [ ] **Step 3: Strip the title/badges/Edit out of the first Card**

In the first content `Card` (≈ 468–543) remove the `<h1>` name, the active/portal badges, and the Edit Profile button (now in the header). That card becomes the customer-details card (avatar + contact info). Keep the avatar/contact JSX.

- [ ] **Step 4: Apply density**

- Outer container (≈ 457): `p-8 max-w-[1600px] mx-auto` → `px-6 py-5 max-w-[1600px] mx-auto`.
- Main cards (≈ 468, 546) and the Portal side card (≈ 611): `p-6` → `p-4`.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npx eslint src/pages/customers/CustomerProfilePage.tsx`
Expected: typecheck 0 errors; eslint 0 errors (pre-existing i18n warnings acceptable).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/pages/customers/CustomerProfilePage.tsx
git commit -S -m "$(printf 'refactor(customers): DetailPageHeader on the customer profile (Audit H1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01TZgCDzRcXDfuJNgHJHbbeU')"
```

---

## Task 5: Final gate + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: green — **156 files / 1292 passed / 2 skipped** (baseline 155/1289/2 + the new `DetailPageHeader.test.tsx` with 3 tests).

- [ ] **Step 2: Final typecheck + lint sweep**

Run:
```bash
npm run typecheck && npx eslint src/components/shared/DetailPageHeader.tsx src/components/shared/DetailPageHeader.test.tsx src/pages/financial/InvoiceDetailPage.tsx src/pages/cases/CaseDetail.tsx src/pages/customers/CustomerProfilePage.tsx
```
Expected: typecheck 0 errors; eslint 0 errors.

- [ ] **Step 3: Push**

```bash
git push -u origin claude/audit-h1-detail-compaction
```
(Retry up to 4× with 2s/4s/8s/16s backoff on network error.)

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 component → Task 1; §4.1 Invoice (header + rail 5→3 + alert relocation + density) → Task 2; §4.2 Case → Task 3; §4.3 Customer → Task 4; §5 density standard → applied in Tasks 2–4; §6 testing → Task 1 tests + per-task full-suite runs; §7 sequencing → Task order; §8 gates → every task.
- **Placeholder scan:** the component and tests are complete code. The page tasks are verbatim-move migrations of existing JSX (badges/buttons/AuditInfo) — the implementer copies the exact elements from the cited line ranges; no new logic is hand-waved.
- **Type consistency:** `DetailPageHeaderProps` (`breadcrumbs: Crumb[]`, `badges`, `actions`, `meta`) is used identically across Tasks 1–4; `Crumb = { label; to? }` with the final crumb as the title is consistent everywhere.
