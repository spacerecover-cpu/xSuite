# Platform Design System & UX Standardization Plan — Phase 5 (Composition & Workflow Layer)

- **Date:** 2026-06-01
- **Status:** Draft for review
- **Program:** Phase **5** of the UI program. Phases 0–4 (merged, PRs #123–127) hardened the **primitive** layer (`<Dialog>`, `cn`, `cva` `variants.ts`, field/listbox a11y hooks, `useToast`, i18n/RTL plumbing). Phase 5 builds the **composition & workflow** layer *on top* of those primitives. Each sub-phase (P5.1–P5.8) gets its own spec→plan→implementation cycle.
- **Evidence:** `docs/audits/2026-06-01-platform-ux-consistency-audit.md` (7-agent sweep, source-verified). Every standard below resolves a numbered finding there.
- **Non-negotiable constraints:** the **locked 14-token theme vocabulary** (no new tokens without sign-off — see `CLAUDE.md` › Theming); `lucide-react` only; `pdfmake` only; Tailwind **v3.4**; no `purple/indigo/violet`; soft-deletes only; RESTRICTIVE tenant isolation preserved; this is a **data-recovery lab platform, not a generic CRM** (`docs/data-recovery-workflow.md`).

---

## §0. The core insight

xSuite has a **mature primitive layer and no composition layer.** The 21 `src/components/ui/` primitives are production-grade, but there is no sanctioned *composed* vocabulary above them — so all 28 feature modules independently re-assemble modals, forms, tables, menus, detail pages, and workflows. The result is ~200 divergences tracing to **8 root causes** (audit §1).

**Phase 5 closes the gap by shipping a small set of composed components + a token-discipline pass + a feedback-unification pass, then migrating modules onto them behind CI guardrails that prevent regression.** The guiding principle is the one the user articulated: *similar actions must always behave the same way.*

### Benchmark posture
World-class platforms enforce consistency through a **composition layer**, not just primitives:
- **Salesforce (Lightning Design System):** one modal blueprint, one record-page template (highlights panel + tabs), one list-view (sort/filter/paginate) — every object reuses them.
- **Stripe Dashboard:** a *single* payment-recording flow and one toast/confirm vocabulary across the product.
- **HubSpot:** one record layout (left sidebar / center timeline / right rail) reused for every CRM object.
- **Monday.com / Notion:** one database/table view engine; all "boards" are configurations of it.
- **Linear:** one command/confirm/toast system; zero `window.confirm`.

Phase 5 brings that discipline to xSuite **without** copying CRM semantics — our "records" are custody-tracked cases and devices.

---

## §0.5 Foundation pass — Token discipline & guardrails (resolves RC3, parts of RC4/RC5)

Ship **before** the composition work so new components inherit a clean base.

1. **`statusToBadgeVariant(status, domain?)`** in `src/lib/ui/variants.ts` → returns one of the locked status tones (`'success'|'warning'|'danger'|'info'|'secondary'`). Replaces the **22 duplicate `getStatusColor()`** hex functions and the 4× `getCommunicationColor()`.
2. **Add `Button variant="success"`** to `buttonVariants` (`Button.tsx`) using existing tokens: `bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success`. Removes 15+ inline `style={{backgroundColor:'rgb(var(--color-success))'}}` and the `#10b981` hardcodes.
3. **Fix the production bug:** replace `AuditTrails.tsx:170` dynamic `` `bg-${getActionColor()}-100` `` with a static `ACTION_TONE` lookup (`create→success-muted`, `update→info-muted`, `delete→danger-muted`).
4. **Eradicate leaks:** migrate the 40 hardcoded-hex files, banned `blue/teal/emerald` palette, `text-gray-*`→`text-slate-*`/tokens, and `border-slate-200`→`border-border` in modal footers.
5. **CI guardrails** (extend `eslint-rules/` + `scripts/check-*.sh`): see §10 table. These make every standard self-enforcing.

---

## §1. Standard Modal Architecture (resolves §3, RC1)

**Standard:** every overlay is `<Modal>` (forms/content) or `<ConfirmDialog>` (destructive/confirm). No hand-rolled `fixed inset-0` overlays. Form modals use a new **`<FormModal>`** composition so header/body/footer/buttons are identical everywhere.

```tsx
// src/components/ui/FormModal.tsx
<FormModal
  isOpen onClose
  title="Record Payment"            // required (a11y name); never ""
  size="md|lg|xl|2xl"               // kill the "large" alias
  isSubmitting={mutation.isPending}  // drives footer button + disables
  submitLabel="Record Payment"       // idle/busy handled internally ("Recording…")
  onSubmit={handleSubmit}            // RHF handleSubmit
  error={rootError}                  // standard <FormError> banner slot
>
  {/* FormField children only */}
</FormModal>
```
- Footer is always `Cancel (variant="secondary")` left · primary submit right, divider `border-border`.
- `<ConfirmDialog variant="danger|warning">` for all destructive confirms (migrate the 6 case/inventory holdouts incl. the 3-button `DeleteInventoryConfirmationModal`).
- **Benchmark:** LDS modal + Stripe's single dialog chrome.
- **Migration:** 15 hand-rolled overlays → `Modal`/`FormModal`/`ConfirmDialog`; full-screen editors (`CreateCaseWizard`, `StreamlinedReportEditor`) may use `<Dialog>` directly with custom `className`.

---

## §2. Standard Form Layouts (resolves §4, RC6)

**Standard:** React Hook Form + Zod schema + `<FormField>` for **every** labeled field, rendered inside `<FormModal>` (or `<FormPage>` for full-page forms).
- Required indicator: `FormField required` prop **only** (kills the 5 asterisk styles).
- Validation: inline `FormField.error` (from RHF) + `useToast().error()` on submit failure. **No silent guards, no `alert()`.**
- Label: owned by `FormField` (`text-slate-700`, `space-y-1.5`).
- Buttons: provided by `FormModal` (Cancel `secondary`).
- **Benchmark:** Salesforce record-edit + Stripe forms (inline errors, never blocking dialogs).
- **Migration:** codemod the 29 `useState` forms to RHF+`FormField`; delete `GeneralSettings`'s local `FormField`.

---

## §3. Standard Table / Data Grid (resolves §5, RC2)

**Standard:** one generic **`<DataTable<T>>`** merging today's two partial components.

```tsx
<DataTable
  data rows columns={[{ key, header, sortable?, align?, render? }]}
  loading                      // → Skeleton rows
  emptyState={<EmptyState … />}// shared, never blank
  pagination={{ mode: 'server', pageSize: 20, page, onPageChange, total }}
  sort={{ key, dir, onSortChange }}
  bulkSelection?={{ selectedIds, onChange, actions }}  // → <BulkActionsBar>
  rowActions?={(row) => <DropdownMenu … />}
  onRowClick?
/>
```
- Search = `<Input leftIcon={<Search/>} />` + **300 ms debounce** + placeholder "Search …".
- Filters = standard **quick-toggle chips + collapsible "More Filters"** panel (the Cases pattern); `Apply` button only for expensive server queries.
- Page-size constant `DEFAULT_PAGE_SIZE = 20`; **server-side pagination** for unbounded lists (fixes Payments/Invoices/Transactions fetching all rows).
- Card-grid (Employees/Recruitment/KB) stays a sanctioned alternative via a `layout="cards"` prop with the same data/sort/empty contract.
- **Benchmark:** Salesforce list views / Monday / Notion DB views (one engine, many configs).

---

## §4. Standard Action Menus, Buttons, Icons & Terminology (resolves §3.3/§7.3, RC5)

- **`<DropdownMenu trigger items />`** primitive (roving-focus, Escape, outside-click, `MoreVertical`) replaces the 3 ad-hoc kebabs. Inline action rows use `<Button variant="ghost" size="sm">` + standard icon.
- **Canonical icon map** (lucide): edit→`Pencil` (kill `CreditCard as Edit`), delete→`Trash2`, add→`Plus`, view→`Eye`, download→`Download`, overflow→`MoreVertical`, close→`X`, search→`Search`, filter→`Filter`.
- **Canonical verbs:** **Create** (new top-level entity: case/invoice/quote/supplier) vs **Add** (item to a collection: engineer/line-item/device); **Save** (persist edits) vs submit-as-`Save`; **Delete** (hard, admin) vs **Archive** (soft); **View** (open record). Fix "Approve"-labeled-"OK" (`ExpensesList:690`).
- **Status badges:** `<Badge variant={statusToBadgeVariant(status)}>` everywhere; retire the 20+ hand-rolled spans and `getStatusColor()` hex.
- **Benchmark:** Linear/GitHub action menus; Salesforce row actions.

---

## §5. Standard Page Layouts & Navigation (resolves §6, RC7)

- **`<PageHeader title actions breadcrumbs?>`** mandatory on every list & detail page (retire the ~80% hand-rolled headers).
- **`<Tabs>`/`<TabPanel>`** primitive — underline active style (`border-b-2 border-primary`), **URL-synced** via `useSearchParams` (`?tab=engineers`) so refresh/deep-link works.
- Two **`<DetailPage>`** layout variants: `DetailPageTabbed` (Case/Tenant/StockItem) and `DetailPageSidebarMain` (Invoice/Quote/PO/Ticket — doc/main + action rail). HubSpot-style.
- One back-nav: `<Button variant="ghost" size="sm"><ArrowLeft/> Back to {section}</Button>` (labeled — fixes the 2 unlabeled icon-only buttons).
- One container max-width enforced in `AppLayout` `<main>` (`max-w-[1600px]`); pages stop setting their own.
- One detail-page loading skeleton.
- **Fix dead route:** add `invoices/:id/edit` **or** switch `InvoiceDetailPage` to modal edit (match Quote). Recommend modal edit.
- **Benchmark:** Salesforce record page (highlights + tabs) / HubSpot record layout.

---

## §6. Standard Workflow Patterns (resolves §7, RC8 — highest priority)

1. **Unify Record Payment (P5.6):** one `<RecordPaymentDialog>` opened from every entry point (case detail, invoice list, invoice detail, payments, command palette), writing to **one** path — `payments` + `payment_allocations` via `paymentsService`. Consolidate the `receipts`/`receipt_allocations` divergence as a **data-integrity workstream** coordinated with `docs/financial-integrity-audit-2026-06-01.md` (additive migration only — **never hard-delete financial rows**; preserve audit/custody append-only guarantees). One currency hook (`useCurrency`), one case selector (`SearchableSelect`), one error banner, `Button variant="success"`.
2. **Status-transition pattern:** the `CaseStageBanner` modal+reason model becomes the sanctioned pattern for *guarded* transitions; apply to **quote accept/reject** (currently unguarded for both staff and portal) so forensic intent + reason are captured.
3. **Approval gates** (quote, delivery/QA release, custody transfer) all use `<ConfirmDialog>` + reason capture; respect the existing lab control points (recovery authorization, QA sign-off, data release) — do not weaken them.
4. **Benchmark:** Stripe / QuickBooks "Receive Payment" = one canonical flow.

> This section carries the most business risk and is sequenced last among the composition work (P5.6) so the `FormModal`/feedback standards are already in place.

---

## §7. Standard Notification System (resolves §8, RC4)

- **Toasts:** `useToast` only. Lint-ban `import … from 'react-hot-toast'` outside `useToast.tsx`/`App.tsx` (30 files migrate).
- **Confirmations:** `<ConfirmDialog>` (or a `useConfirm()` promise helper) for all destructive/irreversible actions. Lint-ban `window.confirm` (~40 sites) and `window.alert`/`alert(` (~32 sites).
- **Inline errors:** standard `<FormError>` banner (`bg-danger-muted border-danger/30`) provided by `FormModal`; **never swallow** (fixes `RecordPaymentModal:219`).
- **Tone guide:** success = past-tense confirmation ("Payment recorded"); error = problem + next step; warning = pre-confirm for irreversible/rate-limited actions.
- **Benchmark:** Linear/Stripe toast + confirm vocabulary.

---

## §8. Standard Analytics & Reporting (resolves §9.4)

- Consolidate KPI cards on **`<StatsCard>`** (extend its `COLOR_ALIAS` to cover financial/stock colors via tokens); deprecate `FinancialStatsCard`, inline `QuickStat`, inline `StatCard`. Retire raw-hex props on `FinancialModuleHeader`.
- One KPI-row layout (`grid-cols-2 sm:grid-cols-2 md:grid-cols-4`).
- All charts via `src/lib/chartTheme.ts` (`chartCategorical`/`chartAxis`/`chartGrid`).
- Report surfaces (`case_reports`, financial reports) share one report-shell layout.
- **Benchmark:** Stripe Dashboard cards / Salesforce dashboards.

---

## §9. Standard Mobile-Responsive Behavior (resolves §9.5)

- **`AppShell` responsive sidebar:** `fixed inset-y-0 z-40 -translate-x-full md:translate-x-0 md:relative` + hamburger toggle in a mobile top bar; close on route change.
- **Tables → card fallback** below `md` (the `<DataTable layout="cards">` contract), not raw horizontal scroll.
- **Modals full-screen** below `sm` (`<Dialog>` gains a `mobileFullScreen` default).
- **Breakpoint ladder:** standard `sm:`/`md:`/`lg:` steps for KPI grids and detail layouts (fix Dashboard's missing `sm` step).
- **Benchmark:** Salesforce mobile / Material responsive nav.

---

## §10. Phased Rollout & CI Guardrails

Each sub-phase = its own spec→plan→implementation PR (per the program), TDD per task, additive/back-compat, ending with a CI rule that **locks the standard**.

| Phase | Scope | New/changed | CI guardrail added |
|---|---|---|---|
| **P5.1** | Token discipline (§0.5) | `statusToBadgeVariant`, `Button variant="success"`, AuditTrails fix, hex/palette sweep | ban hardcoded hex in `tsx`; ban dynamic `bg-${}`; ban `text-gray-*`; ban `CreditCard as Edit` |
| **P5.2** | Forms (§2) | `FormModal`, `FormError`, RHF+Zod adoption | require `FormField` for labeled inputs; ban `alert(`/`confirm(` in forms |
| **P5.3** | Tables (§3) | unified `<DataTable>`, debounced search, filter pattern, page-size | ban raw `<table>` in `src/pages` (warn→error); ban inline spinner divs |
| **P5.4** | Layout/nav (§4–§5) | `DropdownMenu`, `Tabs` (URL-synced), `PageHeader`, `DetailPage` variants; fix dead route | ban `size="large"`; require `PageHeader` on pages; ban ad-hoc kebab markup |
| **P5.5** | Feedback (§7) | `useToast`-only, `useConfirm`, ban native dialogs | ban `react-hot-toast` import outside wrapper; ban `window.confirm`/`alert` |
| **P5.6** | **Record Payment + workflows (§6)** | `RecordPaymentDialog`, single data path, quote-approval guard | one-payment-path test; entry-point smoke tests |
| **P5.7** | Notes/files/timeline (§9.1–9.3) | `NoteComposer`/`NoteItem`, `FileUploader`/`FileList`, `Timeline`; wire/remove dead `case_job_history` | ban `getCommunicationColor` hex; ban bespoke note markup |
| **P5.8** | Analytics + mobile (§8–§9) | `StatsCard` consolidation, `AppShell` drawer, table→card | deprecate `FinancialStatsCard`; ban raw-hex KPI props |

**Sequencing rationale:** tokens first (clean base) → forms + tables (highest divergence count) → layout/nav → feedback → **Record Payment last among composition work** (so `FormModal` + feedback standards exist) → satellites → analytics/mobile.

---

## §11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Big-bang migration breaks `tsc=0` / CI gates | Additive, back-compat: new comps land first; modules migrate per-cluster PRs; each holds `tsc=0` |
| `FormModal`/`DataTable` can't express every edge case | Escape hatches (`footer` slot, `render` cells, `<Dialog>` direct for full-screen) — same approach Phase 1 used for the lightbox |
| **Record Payment unification touches financial integrity** | Coordinate with `financial-integrity-audit-2026-06-01.md`; additive migration; preserve append-only audit/custody; data backfill reviewed separately; **no hard-deletes** |
| New tokens requested | Honor locked 14-token vocabulary; `success` Button variant reuses existing tokens; anything new needs explicit sign-off |
| Guardrails too aggressive (dev friction) | Phase guardrails in as `warn` first, flip to `error` once the cluster is migrated |
| RTL/i18n regressions | Route all new copy through `t()` / `ui.*` keys (Phase 4 plumbing); test both `en`/`ar` |

---

## §12. Acceptance Criteria (program-level Definition of Done)

- [ ] Zero hand-rolled modal overlays; all destructive actions use `<ConfirmDialog>`.
- [ ] `FormField` used for 100% of labeled inputs; one required-indicator; no silent validation.
- [ ] One `<DataTable>` powers all list pages (or sanctioned `layout="cards"`); server pagination on unbounded lists.
- [ ] One `<DropdownMenu>`, one `<Tabs>` (URL-synced), `PageHeader` on every page; canonical icon/verb map enforced.
- [ ] **One Record-Payment component + one data path**; quote approval guarded.
- [ ] `useToast`-only; zero `window.confirm`/`alert`; zero `react-hot-toast` feature imports.
- [ ] One KPI card; all charts via `chartTheme`; mobile sidebar drawer + table→card fallback.
- [ ] Zero hardcoded hex / banned palette in `src/` (CI-enforced); `tsc=0` maintained; AuditTrails chips render in prod.
- [ ] Every standard backed by a CI guardrail (§10) so it cannot regress.

---

## §13. References

- `docs/audits/2026-06-01-platform-ux-consistency-audit.md` — the evidence (this plan's source of truth).
- `docs/superpowers/specs/2026-05-30-ui-library-hardening-phase0-design.md` … `phase4` — the primitive layer this builds on.
- `docs/financial-integrity-audit-2026-06-01.md` — coordinate the Record-Payment data consolidation (§6/P5.6).
- `docs/data-recovery-workflow.md` — the 16-stage lifecycle; ensures workflow standards map to real lab process.
- `CLAUDE.md` › Theming — the locked 14-token vocabulary and theming rules.
