# Platform Review — 2026-06-10

> **Implementation status (same day):** all four items implemented on this branch per the
> recommendations below — see `docs/superpowers/plans/2026-06-10-platform-review-implementation.md`
> for the executed plan. Explicitly deferred to their own specs: custody P2 hardening
> (hash chaining, persisted entry numbers, `verify_custody_chain`) and item 2 phase 3
> (named saved views).

Detailed analysis, recommendations, and implementation approach for four requested items:

1. [Customer company change option](#1--customer-company-change-option)
2. [Tenant-configurable case table columns](#2--tenant-configurable-case-table-columns)
3. [Timestamps in "Created By" / audit info display](#3--timestamps-in-created-by--audit-info-display)
4. [Chain of Custody not displaying data — root cause analysis](#4--chain-of-custody-not-displaying-data--root-cause-analysis)

**Verification basis.** Every claim below was verified on 2026-06-10 against the live Supabase
project (`ssmbegiyjivrcwgcqutu`) and the current source tree. Key live-DB evidence used throughout:

| Fact | Value (live, 2026-06-10) |
|---|---|
| `chain_of_custody` rows (all tenants) | **0** |
| `chain_of_custody_transfers` / `_integrity_checks` / `_access_log` rows | **0 / 0 / 0** |
| `case_job_history` rows | 43 |
| Active cases / active devices | 21 / 29 |
| Invoices / quotes | 18 / 9 |
| `customer_company_relationships` rows | 8 |
| Cases with `created_by` set / with `updated_by` set | 28 / **3** |
| `respond_to_custody_transfer` function in live DB | exists (1) — absent from `supabase/migrations/`, which lags the live DB |

This document is a review/spec, not an implementation. Each item that proceeds should get its own
implementation plan per the repo's Superpowers flow (items 2 and 4 are large enough to warrant
dedicated specs under `docs/superpowers/specs/`).

---

## 1 — Customer Company Change Option

### 1.1 How it works today (verified)

- Customers and companies are linked **many-to-many** through `customer_company_relationships`
  (`customer_id`, `company_id`, `is_primary`, `role`, `tenant_id`, soft-delete `deleted_at`;
  `UNIQUE (tenant_id, customer_id, company_id)`). `customers_enhanced` has **no** `company_id`
  FK — only a denormalized, display-only `company_name` text column.
- The link is created **only at customer creation**: `customerService.createCustomer`
  (`src/lib/customerService.ts:43-48`) inserts one relationship row — with `is_primary: false`,
  even when it is the customer's only company (existing inconsistency).
- After creation there is **no UI anywhere** to add, remove, re-point, or re-prioritize the link:
  - Customer profile "ASSOCIATED COMPANIES" card is read-only
    (`src/pages/customers/CustomerProfilePage.tsx:528-572`).
  - The Edit Profile modal updates only person fields (`CustomerProfilePage.tsx:219-269`) — no
    company field.
  - Company profile "Contacts" tab is read-only (`src/pages/companies/CompanyProfilePage.tsx:112-139`).
- Transactional records **snapshot** the company at creation time: `cases.company_id`,
  `quotes.company_id`, `invoices.company_id` (all nullable; `payments` has no company column).
  `CreateCaseWizard` auto-fills `cases.company_id` from the customer's primary relationship.
- A **case-level** company change already exists with proper audit:
  `ChangeCompanyModal` → `changeCompanyMutation` updates `cases.company_id` and logs a
  `COMPANY_CHANGED` entry via `rpc('log_case_history')` with old/new IDs
  (`src/components/cases/ClientTab.tsx:225-249`).
- **Display-drift hazard (important):** `ClientTab` resolves the company in two tiers
  (`ClientTab.tsx:73-108`): use `case.company_id` if set, otherwise **fall back to the customer's
  current primary relationship at render time**. For any case whose `company_id` is null, changing
  the customer's primary company silently rewrites what that historical case *displays*.

### 1.2 Business implications in a data-recovery lab

A customer↔company link is not cosmetic here — it feeds:

- **Billing identity** — who quotes/invoices are issued to (snapshot on `quotes`/`invoices`).
- **Case ownership context** — the wizard stamps `cases.company_id`; the portal and company
  profile aggregate cases per company.
- **Legal artifacts** — NDAs (`ndas` table) and data-release authorization are company-level
  concerns; a wrong association is a confidentiality risk, not a typo.
- **Reporting** — company revenue/case statistics.

Two distinct real-world scenarios must both be supported, and they have different semantics:

| Scenario | Correct treatment |
|---|---|
| **Correction** — customer was linked to the wrong company at intake | Fix the link; optionally repair open cases that inherited the wrong snapshot |
| **Real change** — the person moved to another employer / acts for several companies | **Add** a relationship and change which one is primary; never rewrite history — an invoice issued to ACME was genuinely issued to ACME |

The schema (M:N + `is_primary` + soft delete) already models this correctly. The product gap is
purely UI/process. A single "swap the company" mutation would be the wrong abstraction.

### 1.3 Impact analysis — what a relationship change touches

| Record | Impact of changing relationships | Required behavior |
|---|---|---|
| `cases` (terminal: delivered/completed/cancelled) | None — `company_id` snapshot | **Never touched** |
| `cases` (open) with `company_id` set | None automatically | Offer explicit per-case reassignment via the existing `ChangeCompanyModal` path (which already audit-logs) |
| `cases` with `company_id` **null** | **Display silently drifts** via the `ClientTab` fallback | Fix the drift (see 1.5) |
| `quotes` / `invoices` | None — snapshots | Never retro-update issued documents |
| `payments` | No company column | None |
| Portal | Customer-scoped, unaffected | None |
| `customers_enhanced.company_name` | Stale denormalized text | Sync to primary company name on change (or deprecate the column) |

### 1.4 Approaches considered

- **A. Direct swap on Edit Profile** (replace the company field in the edit modal).
  Rejected: collapses an M:N model to 1:1, destroys relationship history, silently triggers the
  display-drift hazard, no impact awareness.
- **B. Relationship management with guarded effects** — a "Manage Companies" surface on the
  customer profile: add link, end link (soft delete + reason), set primary; every action audited;
  when a change affects open cases, show the impact and let the user explicitly choose per-case
  reassignment. **Recommended.**
- **C. Formal transfer workflow** (request → admin approval → execute). The audit benefit can be
  had cheaper via role-gating B to `manager`+ and writing `audit_trails`. Defer C unless a tenant
  has a compliance requirement for two-person control on CRM data (custody/QA are where
  two-person control matters first — see item 4).

### 1.5 Recommended design (Option B)

**UX** — on `CustomerProfilePage`, the ASSOCIATED COMPANIES card gains a "Manage" action
(role-gated to `manager`+ via `PermissionsContext`) opening a modal that lists current
relationships and supports:

1. **Add company** — reuse the company selector + inline-create from `CustomerFormModal`.
2. **Set primary** — radio per row; exactly one primary enforced.
3. **End relationship** — soft delete (`deleted_at = now()`) with a required reason; blocked with
   an explanatory dialog if it is the only relationship and open cases reference it.
4. **Impact panel** — before commit, show: "N open cases / M draft quotes are linked to
   <Company>." Offer checkbox "also re-point these open cases", which runs the existing
   case-level `changeCompanyMutation` per selected case (keeping its `COMPANY_CHANGED` history
   entries). Terminal cases and issued quotes/invoices are listed as explicitly untouched.

**Data & integrity**

- Partial unique index to enforce single primary:
  `CREATE UNIQUE INDEX ... ON customer_company_relationships(tenant_id, customer_id) WHERE is_primary AND deleted_at IS NULL`.
- Fix `createCustomer` to insert the first relationship with `is_primary: true`.
- **Kill the silent drift:** stop `ClientTab`'s tier-2 fallback from being the permanent source of
  truth — one-time backfill of `cases.company_id` for open cases from the current primary
  relationship, then restrict the fallback to a labeled "(from customer's current primary company)"
  hint instead of presenting it as the case's company.
- Sync `customers_enhanced.company_name` to the primary company on every relationship change.

**Audit trail** — every add/end/set-primary writes `audit_trails` via the existing
`logAuditTrail()` (`src/lib/auditTrailService.ts`) with old/new values
(`company_linked`, `company_unlinked`, `primary_company_changed` on record type
`customer_company_relationships`); per-case reassignments keep their `case_job_history` entries.
This lands in the append-only audit surface (REVOKE + `prevent_audit_mutation`), which is the
right place for it.

### 1.6 Implementation approach

1. Migration: partial unique index (above). No table changes needed.
2. `customerService.ts`: `addCompanyRelationship`, `endCompanyRelationship`,
   `setPrimaryCompany` (each calls `logAuditTrail`, syncs `company_name`); fix
   `createCustomer` `is_primary`.
3. `ManageCompaniesModal` component + wiring into `CustomerProfilePage`; impact query
   (open cases / draft quotes by `company_id` + `customer_id`).
4. One-time backfill script/migration for open cases with null `company_id`; soften the
   `ClientTab` fallback display.
5. Role gate `manager`+ via `PermissionsContext`.

Effort: ~2–3 days. No schema risk; all changes additive.

---

## 2 — Tenant-Configurable Case Table Columns

### 2.1 Current state (verified)

- `src/pages/cases/CasesList.tsx` renders a **hardcoded** `<table>` (headers at `:700-746`,
  cells at `:772-848`); no column config array, no table library (`package.json` has no
  `@tanstack/react-table`, dnd, or resize libs). Responsiveness = `overflow-x-auto` (`:698`) —
  i.e., horizontal scrolling, the thing tenants want to avoid.
- The list query already embeds devices:
  `devices:case_devices (id, serial_number, device_type_id, catalog_device_types (id, name))`
  (`CasesList.tsx:134-150`), then takes **`devices[0]`** (ordered by `created_at`) for Device
  Type and **concatenates all serial numbers** (`:826`, `:835-839`). It ignores
  `case_devices.is_primary`, which the create wizard *does* set via `setPrimaryDevice`.
- All three requested columns are already in the schema — this is purely a frontend/selection
  concern: `case_devices.model` (text), `case_devices.serial_number` + `is_primary`,
  `case_devices.capacity_id → catalog_device_capacities.name` (plus `gb_value` for sorting).
- Reusable precedents already in the codebase:
  - `src/components/ui/DataTable.tsx` — generic table with per-column `hideBelow`
    (`hidden md:table-cell`) and a `mobileCard` stacked layout; not used by CasesList.
  - `user_preferences` (`UNIQUE(tenant_id, user_id)`, `preferences jsonb`) — exists, barely used.
  - `SidebarPreferencesContext` — the proven per-user preference pattern (context + upsert +
    `localStorage` hint for flash-free hydration).
  - `inventory_search_templates` — the existing "saved view" precedent (named jsonb criteria).
  - `company_settings` (one row per tenant, jsonb buckets) + admin-gated settings pages
    (`AppearanceSettings.tsx`) — the tenant-default pattern.

### 2.2 Architecture

Four layers, resolved top-down into one "effective view" per user/table:

```
Column Registry (code)  →  Tenant defaults (DB)  →  User preferences (DB)  →  Active saved view (DB)
   what CAN exist            what the tenant          personal visibility/        named, recallable
   key, label, render,       shows by default +       order/width overrides       configurations
   minWidth, priority,       which columns are
   sortable, accessor        available at all
```

1. **Column registry** — a typed array, the single source of truth for the cases table
   (`src/lib/tables/casesColumns.tsx`):
   `{ key, label, render(caseRow), minWidth, priority (1 = never hidden), sortable, defaultVisible }`.
   Registry entries for: `case_no`, `priority`, `customer`, `contact_number`, `client_ref`,
   `status`, `device_type`, **`device_model`**, **`serial_primary`**, **`capacity`**, `brand`,
   `created_at`, `created_by`. New tenant requests become registry entries, not table rewrites.
2. **Tenant defaults** (admin-gated, Settings → "Table Columns", mirroring AppearanceSettings):
   stored in `company_settings` jsonb —
   `{ "table_columns": { "cases": { "visible": [...], "order": [...], "locked": [...] } } }`.
   `locked` lets a tenant pin columns users may not hide (e.g., `case_no`, `status`).
3. **User preferences**: `user_preferences.preferences.tables.cases =
   { visible, order, widths }`, upserted with the sidebar-preferences pattern + `localStorage`
   hint so the table doesn't reflow after load. Per-user prefs are explicitly optional in the
   requirements — shipping tenant-level alone is a valid first cut, but the storage shape above
   costs the same either way.
4. **Saved views** (phase 3): generalize the `inventory_search_templates` idea into a proper
   tenant table `table_saved_views`
   (`id, tenant_id, table_key, name, config jsonb, is_shared, is_default, created_by, timestamps`,
   full schema-discipline boilerplate: RLS + RESTRICTIVE isolation + audit trigger + tenant
   index). A view stores columns *and* filters/sort, e.g. "Intake desk", "RAID jobs".

**Resolution:** registry defaults ← tenant `visible/order/locked` ← user prefs ← selected saved
view; `locked` columns always win. Resolution lives in one hook
(`useTableView('cases')`) so other lists (customers, invoices, inventory) adopt it later
unchanged.

### 2.3 Rendering and responsive behavior (no horizontal scrolling)

Evolve `DataTable.tsx` into a config-driven `ConfigurableDataTable` (keep the existing one as a
thin wrapper so current consumers don't churn):

- **Fit algorithm** instead of breakpoint guesses: a `ResizeObserver` on the table container
  measures available width; columns are admitted **in priority order** while
  `Σ max(minWidth, userWidth) ≤ container width`. Columns that don't fit are not scrolled to —
  they collapse into (a) a per-row expander chevron revealing the hidden fields as a
  label/value grid (reusing the `mobileCard` pattern), and (b) a subtle "+N" pill in the header
  that opens the column picker. This directly satisfies "maximize visible information without
  horizontal scrolling" across resolution, window width, selected columns, and device type —
  it reacts to actual pixels, not device categories.
- **Mobile (< `md`)**: skip the table entirely; render the existing card layout with the user's
  top-priority columns.
- **Column resizing**: pointer-drag handles on header dividers (`table-layout: fixed`), clamped
  to `minWidth`; persisted into user prefs `widths`; double-click resets. No new package needed.
- **Column picker**: header button (lucide `Settings2`) → popover with checkbox list +
  up/down reorder buttons (v1 deliberately avoids a dnd dependency — "Do not install new npm
  packages" — and button-reorder is keyboard-accessible for free), "Reset to tenant default",
  and (phase 3) "Save as view…".
- **Data changes**: extend the list `.select()` embed with `model, is_primary,
  catalog_device_brands(name), catalog_device_capacities(name, gb_value)`; choose the
  **primary** device (`is_primary === true`, falling back to first patient-role, then `[0]`).
  This also fixes today's behavior where Serial Number concatenates every device's serial and
  "first device" is arbitrary creation order.
- **Design-system compliance** (`DESIGN.md`): semantic tokens only, `text-xxs` for dense
  metadata, tabular numerals for serials/capacities, 44px touch targets on picker/resize
  affordances, `duration-150/200 ease-out` motion, truncate-with-tooltip for long models.

### 2.4 Why this storage split (and not alternatives)

- A dedicated `tenant_table_settings` table for defaults is cleaner relationally but costs full
  tenant-table boilerplate for what is one jsonb object per tenant; `company_settings` is the
  established home for exactly this kind of tenant UI config. Revisit only if per-column
  metadata grows relational needs.
- Putting user prefs in `localStorage` only (no DB) would be simplest but breaks the
  "same view on any machine" expectation and can't support saved views; the `user_preferences`
  table already exists with the right unique key, so the DB cost is one upsert.

### 2.5 Implementation approach (phased)

1. **Phase 1 — registry + new columns (highest value, lowest risk):** extract the column
   registry, render CasesList from it, extend the select embed, fix primary-device selection,
   add Device Model / Primary Serial / Capacity as `defaultVisible: false` registry entries.
   No persistence yet — tenant defaults from registry. (~2 days)
2. **Phase 2 — preferences:** tenant defaults in `company_settings` + admin settings section;
   user show/hide + order + widths in `user_preferences` with context/localStorage-hint pattern;
   column picker UI; fit algorithm + row expander + mobile cards. (~3–4 days)
3. **Phase 3 — saved views + rollout:** `table_saved_views` migration (schema-discipline
   checklist + regenerated types), view CRUD in the picker, then adopt
   `ConfigurableDataTable` on customers/invoices/inventory lists. (~3 days)

---

## 3 — Timestamps in "Created By" / Audit Info Display

### 3.1 Current state (verified)

- The case header renders date-only, no time, no timezone, no modified info:
  `Created {formatDate(created_at)} … by {created_by_profile?.full_name || 'System'}`
  (`src/pages/cases/CaseDetail.tsx:330-346`).
- Display is inconsistent across modules (each one hand-rolls it; **no shared component
  exists**):

| Surface | Today |
|---|---|
| Case header (`CaseDetail.tsx:330-346`) | date only + creator name |
| Internal notes (`CaseNotesTab.tsx:149-215`) | author + date only; "Edited <date>" if changed; no editor name (no column) |
| Quote detail (`QuoteDetailPage.tsx:659-670`) | native `toLocaleDateString()`, no creator |
| Invoice detail (`InvoiceDetailPage.tsx`) | no created/updated metadata at all |
| Customer profile (`CustomerProfilePage.tsx:511`) | "Joined <date>" only |
| Case communications (`CaseCommunicationsTab.tsx:149`) | `formatDateTime` — the only surface with time of day |

- Formatting: `formatDate` defaults to `'MMM dd, yyyy'`; `formatDateTime` (`'MMM dd, yyyy HH:mm'`)
  exists but is barely used (`src/lib/format.ts:138-157`). **Timezone is never applied
  anywhere** — `date-fns` v4 formats in browser-local time; `date-fns-tz` is not installed;
  `tenants.timezone` and `DateTimeConfig` (`dateFormat`, `timeFormat`, `timezone`) exist but are
  dormant. All timestamps are stored `timestamptz` (UTC) — the storage base is correct.
- Actor columns (live DB): `cases`, `invoices`, `quotes`, `customers_enhanced`, `companies` have
  all four of `created_by/created_at/updated_by/updated_at`; `case_internal_notes`,
  `case_devices`, `payments` lack `updated_by`. **But `updated_by` is nearly dead data — only
  3 of 28 cases have it** — because the shared trigger `set_tenant_and_audit_fields()` sets
  tenant + timestamps only, never actor columns, and almost no update path sets it in app code.
- `created_by` references `auth.users` (not `profiles`), so PostgREST cannot embed the name;
  the codebase resolves names via a manual `profiles.full_name` lookup per surface.

### 3.2 Recommended design

**(a) Tenant-aware date/time formatting — no new dependency.**
Add to `src/lib/format.ts`:
`formatDateTimeWithConfig(date, dt: DateTimeConfig, opts?: { withSeconds?; withTz? })` built on
`Intl.DateTimeFormat` with `timeZone: dt.timezone`, `hour12: dt.timeFormat === '12h'`, and
`timeZoneName: 'short'` (→ "10 Jun 2026, 12:33 GST"). `Intl` handles IANA timezones natively, so
`date-fns-tz` is unnecessary — consistent with the no-new-packages rule and it finally activates
the dormant `TenantConfigContext.dateTime` config (CLAUDE.md already mandates config-driven date
formats). Keep `formatDate` for date-only contexts (lists, "Joined").

**(b) Shared `<AuditInfo>` component** (`src/components/ui/AuditInfo.tsx`):

- Props: `createdAt`, `createdBy?: { name } | null`, `updatedAt?`, `updatedBy?`,
  `variant: 'inline' | 'stacked'`.
- Inline (detail headers): `Created 10 Jun 2026, 12:33 GST by Nitin Ziva · Updated 10 Jun 2026,
  14:02 GST by Sara H.` — the Updated segment renders only when `updated_at − created_at` is
  meaningful (> 1 min) and shows the editor only when `updated_by` resolves.
- Hover tooltip: full-precision UTC ISO + tenant timezone — useful when a lab needs to quote an
  exact instant in a dispute.
- Name resolution: one shared `useProfileNames(ids: uuid[])` hook (single batched `profiles`
  query via TanStack Query) replacing today's per-surface ad-hoc lookups; fallback `'System'`.

**(c) Make `updated_by` real — DB-level guarantee.**
A new trigger function `set_audit_actor_fields()`:
`BEFORE INSERT`: `NEW.created_by := COALESCE(NEW.created_by, auth.uid())`;
`BEFORE UPDATE`: `NEW.updated_by := auth.uid()` — attached explicitly to the tables that have the
columns (cases, invoices, quotes, customers_enhanced, companies, …). A separate trigger (rather
than extending `set_tenant_and_audit_fields` with `to_jsonb(NEW)` column probing) keeps the hot
shared trigger simple and the migration reviewable. App code stops being responsible for
remembering actor stamping.

**(d) Additive columns where the lab needs editor identity:** add `updated_by uuid` to
`case_internal_notes` (notes are edited and show "Edited" today with no editor — an audit gap),
and `case_devices` (device records get corrected post-intake). Additive migration + regenerated
types per the migration discipline.

### 3.3 Rollout (consistency pass)

Replace ad-hoc metadata rendering with `<AuditInfo>` in: case detail header, internal notes
(adds time-of-day + "edited by"), quote detail, invoice detail (currently shows nothing),
customer profile, device modal/tab, company profile. Sweep remaining raw
`toLocaleDateString()` calls onto the config-aware helpers. List-table `created_at` cells keep
date-only with the full timestamp as `title` tooltip. (Custody entries already persist
`actor_name`/`actor_role` snapshots — correct for a forensic ledger; don't change.)

Effort: trigger + format util + component ≈ 1–2 days; module sweep ≈ 2–3 days incremental.

---

## 4 — Chain of Custody Not Displaying Data — Root Cause Analysis

### 4.1 Answers to the investigation questions

| Question | Finding |
|---|---|
| Are records being created correctly? | **No — records are never created at all.** `chain_of_custody` has **0 rows in the entire database** (all tenants, all 21 active cases, all 29 devices). So do all three sibling tables (transfers, integrity checks, access log). |
| Is data being retrieved correctly? | Yes. `getChainOfCustody` (`src/lib/chainOfCustodyService.ts:326-374`) queries `chain_of_custody` `.eq('case_id', caseId)` ordered by `created_at` — correct table, correct key (`case_id uuid NOT NULL` exists), correct ordering. |
| Permission issues? | No. RLS verified live: permissive `SELECT USING (true)`, `INSERT WITH CHECK (is_staff_user())`, RESTRICTIVE tenant isolation — a same-tenant staff user can read and insert. |
| UI rendering issues? | No. `ChainOfCustodyTab` renders the empty state correctly because the query legitimately returns zero rows. |
| Data relationship problems? | No. Keying by `case_id` is sound. (The rich UI fields — witness, signature, entry number, hashes — are *synthesized* from `metadata`/row order rather than persisted, per `TODO(B8)` in the service; that's a hardening gap, §4.5, not the cause of emptiness.) |
| Tenant isolation issues? | No. C-0027's `tenant_id` is set correctly; isolation policies are standard. |
| Missing workflow triggers? | **Yes — this is the root cause.** No lifecycle event writes the custody ledger. |

### 4.2 Root cause

**The custody subsystem is fully built on the read side and almost completely unwired on the
write side.** Verified write-path inventory:

1. **Intake never opens custody.** `CreateCaseWizard` inserts `cases` + `case_devices` and stops
   — zero custody references in the file (grep: 0 matches). No `DEVICE_RECEIVED` /
   `creation` event exists anywhere. (Documented as a verified gap in
   `docs/data-recovery-workflow.md`, Stage 3.)
2. **The only two UI write paths are manual and have never been used:** "Transfer Custody"
   (`initiateCustodyTransfer`) and "Integrity Check" (`performIntegrityCheck`) — both 0 rows live.
3. **Ten logging helpers are dead code.** `logQuoteCreated`, `logInvoiceCreated`,
   `logInvoicePayment`, `logReportGenerated`, `logPortalLogin`, `logFileDownloaded`,
   `logDeviceCheckout`, `logDeviceReturn`, etc. (`chainOfCustodyService.ts:853-1210`) have **zero
   call sites** in `src/`. The live DB corroborates: 18 invoices and 9 quotes exist, 0 custody
   rows. (This corrects the workflow doc's "wired to financial/report events" — even those are
   not wired.)
4. **Checkout bypasses the ledger.** `log_case_checkout` (live definition verified) writes
   `case_job_history` + `chain_of_custody_transfers` rows — but never `chain_of_custody`, and
   never sets device `custody_status`.
5. **Latent bug that breaks case-level events when the paths *are* exercised:**
   `logChainOfCustody` sends `p_device_id: params.deviceId ?? ''`
   (`chainOfCustodyService.ts:404`). The RPC parameter is `uuid`; an empty string fails the cast
   (`22P02`), so every custody event without a device — including the transfer-initiated event and
   all financial/portal events — would throw. The transfer flow would insert the
   `chain_of_custody_transfers` row and then error on the ledger event, leaving an
   inconsistent record.

Meanwhile the **activity log that does work** — `case_job_history`, 43 rows, written by
`transition_case_status` / `log_case_history` / checkout — is **not what the "History" tab
shows**: `CaseDetail.tsx:255` maps the `history` tab to `ChainOfCustodyTab` only. So the one
populated history stream is invisible on the tab named "History", and the visible stream is the
never-written custody ledger. (One correction to a sub-finding: `respond_to_custody_transfer`
**does** exist in the live DB — the repo `supabase/migrations/` dir merely lags the live schema.)

### 4.3 Current vs expected workflow mapping

| Lifecycle event | Writes today | Expected (forensic lab model) |
|---|---|---|
| Device intake (Stage 3) | `case_devices` row only | `chain_of_custody`: `creation` / `DEVICE_RECEIVED`, `custody_status='in_custody'`, per device |
| Labeling / storage assignment (4) | nothing (`storage_location` never written) | `evidence_handling` event with location |
| Inspection / diagnosis (5–6) | `case_devices` fields (and a silently-failing `device_diagnostics` insert — known critical gap #1 in the workflow doc) | optional `access`/`modification` events |
| Status transitions (8, 15) | `case_job_history` ✓ | stays in job history (case workflow ≠ device custody — don't spam the ledger) |
| Internal custodian handoff | `chain_of_custody_transfers` + ledger event (manual modal; ledger write currently breaks on the `''` bug) | same, working, plus `custody_status='in_transit'`→`in_custody'` on accept |
| Integrity check (11) | `chain_of_custody_integrity_checks` + `verification` event (manual modal) | same, plus device `custody_status` unchanged-but-verified |
| Quote/invoice/payment (7, 14) | `quotes`/`invoices`/`payments` only | `financial` ledger events (helpers exist — wire them) |
| Checkout / return (13) | `case_job_history` + `transfers` | + `chain_of_custody`: `transfer` / `DEVICE_CHECKED_OUT`, `custody_status='checked_out'` per device |
| Case closure (15) | status flip | custody release/`archived`/`disposed` event per remaining device |

### 4.4 Required fixes (prioritized)

**P0 — make the ledger exist (small, high-leverage):**

- **F1. Fix the uuid bug:** `p_device_id: params.deviceId ?? null` (and tolerate null in the
  RPC, which the column already allows). Regression-test a case-level event.
- **F2. Initialize custody at intake — server-side.** `AFTER INSERT ON case_devices` trigger
  inserting the `DEVICE_RECEIVED` `creation` event (`custody_status='in_custody'`, actor from
  `auth.uid()` with `'System'` fallback, tenant from `NEW.tenant_id`, description from
  type/brand/serial). A DB trigger — not a wizard call — so it cannot be skipped by any client
  path (wizard, `ServerBulkDrivesModal` bulk adds, future API), which is the property a custody
  ledger needs. This single fix makes the History tab live for every new case.

**P1 — close the lifecycle loop:**

- **F3.** Extend `log_case_checkout` to also write per-device `chain_of_custody`
  `DEVICE_CHECKED_OUT` events (`custody_status='checked_out'`) alongside its existing
  transfers/job-history writes.
- **F4.** Verify `respond_to_custody_transfer` (live) writes accept/reject ledger events and
  updates `custody_status`; wire the dead financial helpers into `quotesService` /
  `invoiceService` / `paymentsService` at create/status-change/payment points, or delete them —
  dead "audit" code is worse than none because it implies coverage that doesn't exist.
- **F5.** Split the tab: rename current tab content to **Chain of Custody** and add a **Case
  Activity** timeline fed by `case_job_history` (43 rows already waiting) — staff currently have
  no view of the history that *is* recorded.

**P2 — audit-ready hardening** (pre-conditions for presenting the ledger as forensic evidence;
today's UI/PDF claim of "immutable and cryptographically secured" overstates reality):

- Persisted, monotonic per-case `entry_number` (today it's derived from query row order —
  renumbers under filters and can't prove gaps).
- Write `evidence_hash` with chaining (`sha256(prev_hash ‖ canonical(row))`) at insert (DB-side),
  plus a `verify_custody_chain(case_id)` RPC; surface "chain verified ✓" in the tab and PDF.
- Promote the JSON-stuffed fields the UI already collects (witness, seal, signature,
  before/after) to real columns per `TODO(B8)`.
- The append-only backstop is already solid (verified live: `UPDATE/DELETE` revoked +
  `prevent_audit_mutation` trigger) — keep it.

**Backfill policy for existing cases:** do **not** fabricate historical custody events. Insert a
single clearly-labeled `critical_event` "Custody baseline established (retroactive)" per existing
in-lab device at deployment, so old cases aren't permanently empty while the record honestly
states when tracking began.

**Reliability monitoring:** an advisory query/report — active devices with zero `creation`
custody events — should be zero after F2; alert if not (cheap canary that the trigger stays
wired).

### 4.5 Effort

F1+F2 ≈ 1 day (migration + one-line client fix + tests). F3–F5 ≈ 2–3 days. P2 hardening ≈ 3–5
days and deserves its own spec (it changes what the lab can legally claim about the ledger).

---

## Suggested delivery order

1. **Item 4 P0 (F1+F2)** — forensic core of the product, smallest change, unblocks everything else custody-related.
2. **Item 3 (a)–(c)** — trigger + format util + `AuditInfo` component; cheap, immediately visible everywhere, and item 4's ledger display benefits from the same timestamp treatment.
3. **Item 2 phase 1–2** — column registry + the three requested device columns, then preferences.
4. **Item 1** — relationship management UI (independent; medium effort).
5. **Item 4 P1–P2 and Item 2 phase 3** as follow-ups with their own specs.
