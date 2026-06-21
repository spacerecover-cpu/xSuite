# Audit 3 · C2 — Table Virtualization (Design)

> _2026-06-18._ First increment of Audit-3 track **C2 (virtualization)**. Builds a small,
> reusable row-virtualization primitive and applies it to the one surface where it is the
> right tool today: the BankingPage bank-transactions ledger. Follows C1 (server-side
> pagination), which already bounded every major **list** page to 50 rows/page.

## 1. Motivation & corrected premise

The original audit framed C2 as "add `@tanstack/react-virtual` inside the shared `DataTable`
and migrate hand-rolled tables onto it (~12 `DataTable` usages vs ~253 hand-rolled tables)."
Grounding that against the source corrected three facts:

- **No virtualization library is installed** (only `@tanstack/react-query`). C2 adds a dependency.
- The shared `DataTable` has **3 consumers** (`PurchaseOrdersListPage`, `SupplierProfilePage`,
  `TenantManagement`), not ~12. There are **64** files containing a hand-rolled `<table>`, not ~253.
- **C1 already bounds every major list page to 50 rows/page.** The acute "DOM cliff" on list
  pages is therefore largely gone, and virtualizing the shared `DataTable` (whose 3 consumers now
  render ≤50 rows) has **low immediate payoff**.

Where large DOM still occurs post-C1 is **unbounded, continuous-scroll surfaces** — not list pages.
A read-only survey of the 55 unpaginated-table files ranked the candidates:

| Rank | Surface | Dataset | Bounded? | Why (not) a virtualization target |
|------|---------|---------|----------|-----------------------------------|
| **1** | **BankingPage** accounts ledger | `bank_transactions` per account | **Unbounded** (no limit) | Statement-style ledger you scroll continuously; 500–2000+ rows for an active account. **Pagination would be awkward; virtualization fits.** |
| 2 | StockReportsPage valuation | all `stock_items` | Unbounded | Read-only report, scannable; good follow-up. |
| 3 | CloneDrivesList | `resource_clone_drives` | Unbounded | ~100–500 rows; lower urgency. |
| — | StockItemsTable / TimesheetManagement / CompaniesListPage | — | — | **Top-level list pages → belong in the C1 pagination pattern, not C2.** |

**BankingPage is the chosen application for this increment.**

## 2. Goals / non-goals

**Goals**
- A reusable, low-risk primitive that virtualizes rows **inside an existing `<table>`**, keeping the
  host's `<thead>`, sticky header, cell markup and styling untouched.
- Apply it to the BankingPage bank-transactions ledger so a multi-thousand-row account no longer
  mounts every row.
- Below a row-count **threshold**, behave exactly as today (render every row, no virtualization) —
  so small data and all existing tests are unaffected.

**Non-goals (YAGNI)**
- No generic columns-API table component. No migration of the 3 `DataTable` consumers.
- No mass migration of the other 50+ hand-rolled tables (StockReports / CloneDrives are explicitly
  deferred to follow-up increments named in §7).
- No server/query or schema change; `getBankTransactions` stays as is (virtualization, not paging,
  is the fix for this surface). No DB migration.

## 3. The primitive — `VirtualizedTableBody`

New file: `src/components/ui/VirtualizedTableBody.tsx`. A headless `<tbody>` content renderer using
`@tanstack/react-virtual`'s **spacer-row** technique. The host keeps full control of the table.

```tsx
interface VirtualizedTableBodyProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => React.ReactNode; // returns a <tr>
  scrollRef: React.RefObject<HTMLElement | null>;         // the overflow-auto scroll viewport
  estimateRowHeight?: number; // px, default 44 (uniform rows)
  overscan?: number;          // default 8
  threshold?: number;         // default 100; at/below this count, render all rows plainly
  colSpan: number;            // spacer-row colSpan = host column count
}
```

**Behaviour**
- `useVirtualizer` is always called (Rules of Hooks): `{ count: items.length, getScrollElement: () =>
  scrollRef.current, estimateSize: () => estimateRowHeight, overscan }`.
- **Passthrough:** when `items.length <= threshold`, render `items.map(renderRow)` directly — no
  spacers, virtualizer output ignored. This is the existing behaviour for small data.
- **Virtualized:** otherwise render
  1. a top spacer `<tr aria-hidden><td colSpan style={{ height: paddingTop }} /></tr>` where
     `paddingTop = firstVirtualItem.start`,
  2. `virtualItems.map(vi => renderRow(items[vi.index], vi.index))`,
  3. a bottom spacer `<tr aria-hidden>` of height `getTotalSize() − lastVirtualItem.end`.
- **Fixed row height** (no per-row `measureElement`): the ledger rows are uniform, so a fixed
  `estimateRowHeight` keeps `renderRow`'s signature trivial and avoids attaching refs to host rows.
  Dynamic measurement is a deliberate future option, not in v1.

**Dependency:** add `@tanstack/react-virtual` (`^3`) — same family as the in-use `@tanstack/react-query`,
headless, no styling, ~kb-scale.

## 4. Accessibility

- Semantic `<table>/<thead>/<tbody>` preserved; spacer rows are `aria-hidden` presentational `<tr>`s.
- Sticky `<thead>` keeps working (it is outside the virtualized body).
- The scroll viewport is a native scrollable element → keyboard scroll and focus work unchanged.
- **Known tradeoff (documented):** virtualization removes off-screen rows from the accessibility
  tree, so a screen reader sees only the windowed rows, not the full count. Acceptable for a
  scrollable ledger; the threshold means small datasets are fully present. Noted in the component
  doc-comment so future maintainers don't "fix" the spacers.

## 5. Application — BankingPage accounts ledger

`src/pages/financial/BankingPage.tsx` (accounts-tab `<table>`, ~lines 592–664):
- Attach a `useRef` (`transactionsScrollRef`) to the existing scroll viewport
  (`<div className="overflow-x-auto" style={{ maxHeight: '500px' }}>`) — already the scroll element;
  no second scroll container is introduced.
- Keep the existing empty-state branch (`bankTransactions.length === 0` → single `colSpan={6}` row).
- When non-empty, replace the inline `bankTransactions.map(...)` in `<tbody>` with
  `<VirtualizedTableBody items={bankTransactions} scrollRef={transactionsScrollRef}
  estimateRowHeight={44} colSpan={6} renderRow={(t) => (/* the existing <tr> verbatim */)} />`.
- The per-row JSX (debit/credit/status cells, formatting) moves into `renderRow` **unchanged**.

No visual change for typical accounts; large accounts stop mounting every row.

## 6. Testing strategy

jsdom has **no layout**, so the real `useVirtualizer` measures `0` height and is non-deterministic.
TDD targets the primitive's own logic, with the virtualizer mocked:

- `src/components/ui/VirtualizedTableBody.test.tsx`:
  1. **Passthrough** — `items.length <= threshold` renders every row and **no** `aria-hidden` spacer
     (no mock needed; layout-independent).
  2. **Windowing** — mock `@tanstack/react-virtual`'s `useVirtualizer` to return a fixed window
     (e.g. indices 10–19 of 1000, known `start`/`end`/`getTotalSize`); assert exactly those rows
     render, plus top/bottom spacer `<tr>`s with the computed `height`s. This verifies our spacer
     math and slicing without depending on jsdom layout.
- BankingPage: no new render test (jsdom layout). Its behaviour is preserved via the passthrough
  path; there is no existing BankingPage test to keep green.

TDD order: write the two primitive tests first → watch RED → implement `VirtualizedTableBody` → GREEN
→ wire BankingPage.

## 7. Rollout & follow-ups (separate increments)

1. **This increment:** `VirtualizedTableBody` + BankingPage ledger.
2. StockReportsPage valuation table onto `VirtualizedTableBody`.
3. CloneDrivesList table onto `VirtualizedTableBody`.
4. (Optional, later) add opt-in dynamic row measurement to the primitive if a target has variable
   row heights.

Top-level list pages (StockItemsTable, TimesheetManagement, CompaniesListPage, …) are **out of C2** —
they belong to the C1 pagination pattern and are tracked there.

## 8. Verification gates (every PR in this track)

- `npm run typecheck` → 0 errors.
- `npx eslint <touched files>` → 0 errors (pre-existing `no-untranslated-jsx-text` warnings accepted).
- `npx vitest run` → green (baseline before this increment: 154 files / 1286 passed / 2 skipped).
- Semantic tokens only; no new banned colors; DM Sans; no DB migration.

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Virtualizing a `<table>` breaks layout/sticky header | Spacer-row technique keeps one `<table>`; `<thead>` stays outside the body; verified visually. |
| jsdom can't exercise the real virtualizer | Test the primitive with a mocked `useVirtualizer`; passthrough path covers small data. |
| Variable row height (wrapped long descriptions) drifts the estimate | Uniform `text-xs py-2` rows + `overscan`; fixed estimate is adequate; dynamic measure deferred. |
| New dependency | `@tanstack/react-virtual` is the same family as `react-query`, headless and tiny; single, justified addition. |
| Screen-reader sees only windowed rows | Documented tradeoff; threshold keeps small sets whole. |
