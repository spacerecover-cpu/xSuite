# Audit C2 — Table Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable row-virtualization primitive (`VirtualizedTableBody`) and apply it to the BankingPage bank-transactions ledger so a multi-thousand-row account no longer mounts every row.

**Architecture:** A headless `<tbody>`-children renderer using `@tanstack/react-virtual`'s spacer-row technique — the host keeps its own `<table>/<thead>`, sticky header and cell markup. Below a row-count threshold it renders all rows plainly (no virtualization), so small data and existing tests are unchanged.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-virtual` (new), Vitest + Testing Library (jsdom).

Spec: `docs/superpowers/specs/2026-06-18-audit-c2-table-virtualization-design.md`. Branch: `claude/charming-feynman-yw97th` (stacked on the C1 finish; no DB migration).

---

## File Structure

- **Create** `src/components/ui/VirtualizedTableBody.tsx` — the primitive. One responsibility: window a host table's body rows.
- **Create** `src/components/ui/VirtualizedTableBody.test.tsx` — passthrough + windowing tests (virtualizer mocked).
- **Modify** `package.json` / `package-lock.json` — add `@tanstack/react-virtual`.
- **Modify** `src/pages/financial/BankingPage.tsx` — attach a scroll ref and render the accounts-tab rows through `VirtualizedTableBody`.

---

## Task 1: Add the `@tanstack/react-virtual` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run (retry up to 4× with 2s/4s/8s/16s backoff on network error):
```bash
npm install @tanstack/react-virtual@^3
```
Expected: `package.json` gains `"@tanstack/react-virtual": "^3.x.x"` under `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Verify it resolves**

Run:
```bash
node -e "require.resolve('@tanstack/react-virtual'); console.log('ok')"
```
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @tanstack/react-virtual for table virtualization (Audit C2)"
```

---

## Task 2: `VirtualizedTableBody` primitive (TDD)

**Files:**
- Create: `src/components/ui/VirtualizedTableBody.tsx`
- Test: `src/components/ui/VirtualizedTableBody.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/VirtualizedTableBody.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedTableBody } from './VirtualizedTableBody';

// jsdom has no layout, so the real useVirtualizer can't measure. Mock it to
// return a deterministic window (indices 10–12 of a large list) so we can assert
// our spacer math + row slicing without depending on layout.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [
      { index: 10, start: 440, end: 484, size: 44, key: 10 },
      { index: 11, start: 484, end: 528, size: 44, key: 11 },
      { index: 12, start: 528, end: 572, size: 44, key: 12 },
    ],
    getTotalSize: () => 44000,
  }),
}));

function renderBody(ui: React.ReactNode) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>,
  );
}

const scrollRef = { current: null } as React.RefObject<HTMLElement | null>;

describe('VirtualizedTableBody', () => {
  it('passthrough: renders every row and no spacer when count <= threshold', () => {
    const items = ['A', 'B', 'C'];
    const { container } = renderBody(
      <VirtualizedTableBody
        items={items}
        scrollRef={scrollRef}
        colSpan={1}
        threshold={100}
        renderRow={(item) => (
          <tr key={item}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(container.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
  });

  it('virtualized: renders only the windowed rows plus top/bottom spacer rows', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const { container } = renderBody(
      <VirtualizedTableBody
        items={items}
        scrollRef={scrollRef}
        colSpan={1}
        threshold={100}
        renderRow={(item) => (
          <tr key={item}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );

    // only the windowed rows are mounted
    expect(screen.getByText('Item 10')).toBeInTheDocument();
    expect(screen.getByText('Item 11')).toBeInTheDocument();
    expect(screen.getByText('Item 12')).toBeInTheDocument();
    expect(screen.queryByText('Item 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 500')).not.toBeInTheDocument();

    // two aria-hidden spacer rows with the computed heights
    const spacers = container.querySelectorAll('tr[aria-hidden="true"] > td');
    expect(spacers).toHaveLength(2);
    expect((spacers[0] as HTMLElement).style.height).toBe('440px'); // firstItem.start
    expect((spacers[1] as HTMLElement).style.height).toBe('43428px'); // totalSize - lastItem.end (44000 - 572)
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run src/components/ui/VirtualizedTableBody.test.tsx
```
Expected: FAIL — module `./VirtualizedTableBody` not found (component not yet created).

- [ ] **Step 3: Write the minimal implementation**

Create `src/components/ui/VirtualizedTableBody.tsx`:
```tsx
import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualizedTableBodyProps<T> {
  /** Full row dataset (already filtered/sorted by the host). */
  items: T[];
  /** Renders one row; must return a `<tr>`. */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Ref to the host's overflow-auto scroll viewport. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Host column count, for the spacer rows' colSpan. */
  colSpan: number;
  /** Fixed estimated row height in px (rows are uniform). */
  estimateRowHeight?: number;
  overscan?: number;
  /** At/below this row count, render every row plainly (no virtualization). */
  threshold?: number;
}

/**
 * Virtualizes `<tr>` rows inside a host `<table>`'s `<tbody>` using the
 * spacer-row technique, so a multi-thousand-row ledger only mounts the visible
 * window. The host keeps its own `<table>/<thead>`, sticky header and cell
 * markup; this component renders ONLY `<tbody>` children (the windowed rows plus
 * two spacer `<tr>`s).
 *
 * Below `threshold` rows it renders every row plainly, so small datasets — and
 * their tests — behave exactly as before.
 *
 * A11y note: while virtualized, off-screen rows are intentionally absent from the
 * DOM (and the accessibility tree); the spacer `<tr>`s are `aria-hidden`. This is
 * the point of virtualization — do not "fix" it. The threshold keeps small sets
 * fully present.
 */
export function VirtualizedTableBody<T>({
  items,
  renderRow,
  scrollRef,
  colSpan,
  estimateRowHeight = 44,
  overscan = 8,
  threshold = 100,
}: VirtualizedTableBodyProps<T>) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  });

  if (items.length <= threshold) {
    return <>{items.map((item, index) => renderRow(item, index))}</>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <>
      {paddingTop > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: paddingTop, padding: 0 }} />
        </tr>
      )}
      {virtualItems.map((vi) => renderRow(items[vi.index], vi.index))}
      {paddingBottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx vitest run src/components/ui/VirtualizedTableBody.test.tsx
```
Expected: PASS (2 passed).

- [ ] **Step 5: Typecheck + lint the new files**

Run:
```bash
npm run typecheck && npx eslint src/components/ui/VirtualizedTableBody.tsx src/components/ui/VirtualizedTableBody.test.tsx
```
Expected: typecheck 0 errors; eslint 0 errors (i18n `no-untranslated-jsx-text` warnings, if any, are acceptable).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/VirtualizedTableBody.tsx src/components/ui/VirtualizedTableBody.test.tsx
git commit -m "feat(ui): VirtualizedTableBody — row virtualization primitive (Audit C2)"
```

---

## Task 3: Apply virtualization to the BankingPage ledger

**Files:**
- Modify: `src/pages/financial/BankingPage.tsx` (import + `useRef`; accounts-tab `<table>` ~lines 592–665)

- [ ] **Step 1: Add `useRef` to the React import**

Change line 1 of `src/pages/financial/BankingPage.tsx`:
```tsx
import React, { useState, useRef } from 'react';
```

- [ ] **Step 2: Import the primitive**

Add with the other `../../components/ui/*` imports (near line 6):
```tsx
import { VirtualizedTableBody } from '../../components/ui/VirtualizedTableBody';
```

- [ ] **Step 3: Create the scroll ref**

Alongside the component's other hooks (near the `bankTransactions` state, ~line 91), add:
```tsx
const transactionsScrollRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 4: Attach the ref to the existing scroll viewport**

The accounts ledger already sits in a `maxHeight: 500px` scroll `<div>` (~line 592). Add the ref to it:
```tsx
<div ref={transactionsScrollRef} className="overflow-x-auto" style={{ maxHeight: '500px' }}>
```

- [ ] **Step 5: Render the rows through `VirtualizedTableBody`**

In the accounts-tab `<tbody>`, replace the non-empty branch — the `bankTransactions.map((transaction) => { ... })` block — so the empty branch is untouched and the rows render through the primitive. The `<tbody>` becomes:
```tsx
<tbody className="divide-y divide-slate-200">
  {bankTransactions.length === 0 ? (
    <tr>
      <td colSpan={6} className="py-8 text-center">
        <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-slate-500 text-sm">No transactions found</p>
      </td>
    </tr>
  ) : (
    <VirtualizedTableBody
      items={bankTransactions}
      scrollRef={transactionsScrollRef}
      colSpan={6}
      estimateRowHeight={44}
      renderRow={(transaction) => {
        // bank_transactions has amount+type, not separate debit/credit columns.
        const isDebit = transaction.type === 'debit' || transaction.type === 'expense' || transaction.type === 'withdrawal';
        const isCredit = transaction.type === 'credit' || transaction.type === 'income' || transaction.type === 'deposit';
        return (
          <tr key={transaction.id} className="hover:bg-slate-50 transition-colors">
            <td className="py-2 px-4 text-xs text-slate-600">
              {new Date(transaction.transaction_date).toLocaleDateString()}
            </td>
            <td className="py-2 px-4">
              <p className="text-xs font-medium text-slate-900">{transaction.description ?? ''}</p>
              {transaction.reference && (
                <p className="text-xs text-slate-500">{transaction.reference}</p>
              )}
            </td>
            <td className="py-2 px-4 text-right">
              {isDebit && transaction.amount > 0 ? (
                <span className="text-xs font-semibold text-danger flex items-center justify-end gap-1">
                  <TrendingDown className="w-3 h-3" />
                  {formatCurrencyValue(transaction.amount)}
                </span>
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </td>
            <td className="py-2 px-4 text-right">
              {isCredit && transaction.amount > 0 ? (
                <span className="text-xs font-semibold text-success flex items-center justify-end gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {formatCurrencyValue(transaction.amount)}
                </span>
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </td>
            <td className="py-2 px-4 text-right text-xs font-semibold text-slate-900">
              -
            </td>
            <td className="py-2 px-4 text-center">
              {transaction.is_reconciled ? (
                <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
              ) : (
                <Clock className="w-4 h-4 text-warning mx-auto" />
              )}
            </td>
          </tr>
        );
      }}
    />
  )}
</tbody>
```

- [ ] **Step 6: Typecheck + lint**

Run:
```bash
npm run typecheck && npx eslint src/pages/financial/BankingPage.tsx
```
Expected: typecheck 0 errors; eslint 0 errors (pre-existing `no-untranslated-jsx-text` warnings acceptable).

> If typecheck flags the `scrollRef` prop (RefObject variance), confirm the prop type is `React.RefObject<HTMLElement | null>` and the host uses `useRef<HTMLDivElement>(null)` — `HTMLDivElement` is assignable to `HTMLElement`. No cast should be needed.

- [ ] **Step 7: Commit**

```bash
git add src/pages/financial/BankingPage.tsx
git commit -m "perf(banking): virtualize the bank-transactions ledger (Audit C2)"
```

---

## Task 4: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npx vitest run
```
Expected: green — **156 files / 1288 passed / 2 skipped** (baseline 154/1286/2 + the 1 new test file with 2 tests).

- [ ] **Step 2: Final typecheck + lint sweep of all touched files**

Run:
```bash
npm run typecheck && npx eslint src/components/ui/VirtualizedTableBody.tsx src/components/ui/VirtualizedTableBody.test.tsx src/pages/financial/BankingPage.tsx
```
Expected: typecheck 0 errors; eslint 0 errors.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin claude/charming-feynman-yw97th
```
(Retry up to 4× with 2s/4s/8s/16s backoff on network error.)

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 primitive → Task 2; dependency → Task 1; §5 BankingPage application → Task 3; §6 testing (passthrough + mocked-virtualizer windowing) → Task 2 Step 1; §8 gates → Tasks 2/3/4. StockReports/CloneDrives (§7) are intentionally out of this plan.
- **Placeholders:** none — all code is complete, including the verbatim BankingPage row JSX.
- **Type consistency:** `VirtualizedTableBodyProps<T>` (`items`/`renderRow`/`scrollRef`/`colSpan`/`estimateRowHeight`/`overscan`/`threshold`) is used identically in the tests and the BankingPage call site; `scrollRef: React.RefObject<HTMLElement | null>` paired with `useRef<HTMLDivElement>(null)`.
