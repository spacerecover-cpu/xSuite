# Platform Review Implementation Plan (items 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This run executes inline (autonomous session).

**Goal:** Implement the four approved items from `docs/platform-review-2026-06-10.md`: chain-of-custody fixes (P0+P1), consistent audit-info display, tenant-configurable case table columns (phases 1–2), and customer↔company relationship management.

**Architecture:** DB-first — all schema/function changes are applied to the live Supabase project via MCP `apply_migration`, mirrored into `supabase/migrations/` + `supabase/migrations.manifest.md`, then `database.types.ts` is regenerated once. Frontend work follows in dependency order (custody → audit info → columns → company mgmt). Custody intake events are written by a DB trigger (cannot be skipped by any client path); audit actor stamping likewise moves into a trigger.

**Tech stack:** Postgres 15 (Supabase), React 18/19 + TS + Tailwind tokens per `DESIGN.md`, TanStack Query v5, vitest for pure-logic tests. No new npm packages.

**Explicitly deferred (per approved review):** custody P2 hardening (hash chaining, persisted entry numbers, `verify_custody_chain`) and saved-views table (item 2 phase 3) — each needs its own spec.

---

## Task 1: Database migrations + regenerated types

**Files:** new `supabase/migrations/<version>_<name>.sql` (mirrors), `supabase/migrations.manifest.md`, `src/types/database.types.ts` (regenerated).

- [ ] **1.0 Pre-checks (read-only SQL):** inspect `respond_to_custody_transfer` body (must not break when `log_chain_of_custody` gains defaults); count `customer_company_relationships` primaries per customer (index feasibility); read manifest format.
- [ ] **1.1 Migration `custody_device_received_trigger`:** `log_device_received_custody()` AFTER INSERT ON `case_devices` → inserts `chain_of_custody` row: `action_category='creation'`, `action='DEVICE_RECEIVED'`, `custody_status='in_custody'`, actor from `profiles(auth.uid())` fallback `'System'`, metadata `{serial_number, model, device_type_id, brand_id, source:'intake_trigger'}`. SECURITY DEFINER.
- [ ] **1.2 Migration `log_chain_of_custody_optional_device`:** CREATE OR REPLACE same signature/order but `p_device_id uuid DEFAULT NULL, p_action_category text DEFAULT NULL, p_action text DEFAULT NULL` (+ runtime `RAISE` if category/action IS NULL) so PostgREST named calls may omit `p_device_id`. Body unchanged otherwise.
- [ ] **1.3 Migration `checkout_writes_custody_ledger`:** CREATE OR REPLACE `log_case_checkout` — in the device loop additionally INSERT INTO `chain_of_custody` (`transfer` / `DEVICE_CHECKED_OUT` / `checked_out`, actor = current profile, metadata collector fields); when `p_device_ids` IS NULL, insert one case-level `transfer`/`CASE_CHECKED_OUT` event.
- [ ] **1.4 Migration `audit_actor_fields`:** add `updated_by uuid` to `case_internal_notes`, `case_devices`; create `set_audit_actor_fields()` (`INSERT: NEW.created_by := COALESCE(NEW.created_by, auth.uid())`; `UPDATE: NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by)`); attach `BEFORE INSERT OR UPDATE` trigger to `cases, invoices, quotes, customers_enhanced, companies, case_internal_notes, case_devices`.
- [ ] **1.5 Migration `single_primary_company_per_customer`:** data fix (customers with ≥1 active relationship and 0 primary → mark earliest `is_primary=true`), then partial unique index `uq_customer_primary_company ON customer_company_relationships(tenant_id, customer_id) WHERE is_primary AND deleted_at IS NULL`.
- [ ] **1.6 Data backfill `custody_baseline_for_existing_devices`:** with `app.bypass_tenant_guard='true'`, for every active `case_devices` row with no custody `creation` event insert `action_category='critical_event'`, `action='CUSTODY_BASELINE_ESTABLISHED'`, `custody_status='in_custody'`, actor `'System'`, description noting tracking start is retroactive. Verify count == active device count.
- [ ] **1.7** Regenerate types → `src/types/database.types.ts`; mirror SQL files + manifest rows; `git commit`.

## Task 2: Custody frontend (F1 client fix, F4 wiring, F5 activity view)

**Files:** Modify `src/lib/chainOfCustodyService.ts` (`:399-414` rpc call; remove dead `logDeviceCheckout`/`logDeviceReturn` `:1160-1210`), `src/lib/quotesService.ts`, `src/lib/invoiceService.ts`, `src/lib/paymentsService.ts`; Create `src/components/cases/detail/CaseActivityTab.tsx`; Modify `src/pages/cases/CaseDetail.tsx` (history tab section).

- [ ] **2.1** `logChainOfCustody`: omit `p_device_id` when `params.deviceId` is undefined (now optional in regenerated types). Commit.
- [ ] **2.2** Wire ledger events (each wrapped so a logging failure never aborts the primary op): quote created (when `case_id`), invoice created (when `case_id`), payment recorded against a case-linked invoice. Delete dead `logDeviceCheckout`/`logDeviceReturn` (server-side now). Commit.
- [ ] **2.3** `CaseActivityTab`: fetch `case_job_history` by `case_id` (order `created_at` desc) + batched profile names; timeline list (action, details, old→new, actor, `AuditInfo`-style timestamp). In `CaseDetail` history tab render a segmented control `Chain of Custody | Case Activity` (custody remains default). Commit.

## Task 3: Audit info (item 3)

**Files:** Modify `src/lib/format.ts`; Create `src/lib/format.auditTime.test.ts` (or extend existing test file), `src/hooks/useProfileNames.ts`, `src/components/ui/AuditInfo.tsx`; Modify `src/pages/cases/CaseDetail.tsx:330-346` + `src/components/cases/detail/useCaseQueries.ts` (fetch `updated_by` profile), `src/components/cases/detail/CaseNotesTab.tsx`, `src/pages/quotes/QuoteDetailPage.tsx:659-670`, `src/pages/financial/InvoiceDetailPage.tsx`, `src/pages/customers/CustomerProfilePage.tsx`.

- [ ] **3.1** `formatDateTimeWithConfig(date, { timezone, timeFormat }, { withTz = true })` via `Intl.DateTimeFormat('en-US', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12, timeZone, timeZoneName:'short' })` → "Jun 10, 2026, 12:33 GST". Month-name format keeps audit strings unambiguous regardless of tenant numeric date format. Vitest: UTC instant renders correctly in `Asia/Muscat` (+04) in 12h and 24h; invalid date → ''. Run `npm test`. Commit.
- [ ] **3.2** `useProfileNames(ids)`: single `.in('id', ids)` profiles query, returns `Map<string, string>`. `AuditInfo` component (`variant: 'inline' | 'stacked'`): "Created <datetime+tz> by <name>" + "· Updated <datetime+tz> by <name>" when `updated_at − created_at > 60s`; tooltip with UTC ISO. Tokens/lucide only. Commit.
- [ ] **3.3** Rollout to the five surfaces above (notes also gain time-of-day and "edited by" once `updated_by` flows). Run typecheck. Commit.

## Task 4: Tenant-configurable case table columns (item 2, phases 1–2)

**Files:** Create `src/lib/tables/types.ts`, `src/lib/tables/fitColumns.ts`, `src/lib/tables/fitColumns.test.ts`, `src/lib/tables/casesColumns.tsx`, `src/lib/tablePrefsService.ts`, `src/hooks/useTableViewPrefs.ts`, `src/components/ui/ConfigurableDataTable.tsx`, `src/components/ui/ColumnPickerPopover.tsx`, `src/pages/settings/TableColumnsSettings.tsx`; Modify `src/pages/cases/CasesList.tsx` (query embed + table block), settings route/nav, `src/lib/queryKeys.ts`.

- [ ] **4.1** Types + pure fit algorithm: `fitColumns(containerWidth, orderedVisible: {key,minWidth,width?,priority}[]) → {fit: string[], overflow: string[]}` — admit `priority===1` always, then remaining in priority order (ties: user order) while cumulative width ≤ container; render in user order. Vitest covering: all fit, partial overflow, priority-1 always kept, user width respected. Commit.
- [ ] **4.2** Cases column registry (13 columns incl. new `device_model`, `serial_primary`, `capacity`; primary device = `is_primary` → first patient-role → `[0]`); extend CasesList select embed with `model, is_primary, catalog_device_brands(name), catalog_device_capacities(name, gb_value)`. Commit.
- [ ] **4.3** `tablePrefsService`: tenant defaults in `company_settings.metadata.table_columns[tableKey]` (`{visible, order, locked}`), user prefs in `user_preferences.preferences.tables[tableKey]` (`{visible, order, widths}`) with merge-upsert; `useTableViewPrefs(tableKey)` resolves registry ← tenant ← user, exposes setters + localStorage hint. Commit.
- [ ] **4.4** `ConfigurableDataTable` (new component; existing `DataTable` untouched): ResizeObserver-driven fit, overflow row-expander (chevron column + label/value grid), pointer drag resize persisted via `onWidthsChange`, selection + pagination props compatible with CasesList, `<sm` card layout. `ColumnPickerPopover`: checkboxes (locked columns disabled), up/down reorder, reset-to-default. Commit.
- [ ] **4.5** Refactor CasesList to render through the registry + ConfigurableDataTable (stats cards, filters, CSV export, bulk bar unchanged; CSV gains the three new columns). Commit.
- [ ] **4.6** `TableColumnsSettings` page (admin-gated like AppearanceSettings): per-column Show/Hide/Lock + order for the cases table; route + settings nav entry. Commit.

## Task 5: Customer↔company relationship management (item 1)

**Files:** Modify `src/lib/customerService.ts`, `src/pages/customers/CustomerProfilePage.tsx`, `src/components/cases/ClientTab.tsx`; Create `src/components/customers/ManageCompaniesModal.tsx`.

- [ ] **5.1** Service: fix `createCustomer` first link `is_primary: true`; add `getCompanyRelationships(customerId)`, `addCompanyRelationship({customerId, companyId, role?, makePrimary?})`, `setPrimaryCompany(customerId, relationshipId)`, `endCompanyRelationship(relationshipId, reason)` — soft delete; every mutation calls `logAuditTrail` with old/new values and syncs `customers_enhanced.company_name` to the primary company. Commit.
- [ ] **5.2** `ManageCompaniesModal`: relationship list (primary radio, role, end button w/ required reason), add-company select; **impact panel** — open cases (status not in terminal `master_case_statuses` types completed/delivered/cancelled) referencing the affected company, with "also re-point these open cases" checkbox → per-case `cases.company_id` update + `rpc('log_case_history', COMPANY_CHANGED)` (same shape as ClientTab's existing mutation). Guard: cannot end the last relationship while open cases reference it. Commit.
- [ ] **5.3** Profile wiring: "Manage" button on ASSOCIATED COMPANIES card, gated to owner/admin/manager; query invalidations. `ClientTab`: label tier-2 fallback company "(customer's current primary company)". Commit.

## Task 6: Verification + docs + ship

- [ ] **6.1** Run: `npm run typecheck` (expect 0 errors), `npm run lint`, `npm test`, `npm run build`, `bash scripts/check-tokens.sh`. Fix anything raised; only claim green with fresh output.
- [ ] **6.2** Verify custody end-to-end against live DB: every active device has ≥1 custody row after backfill; trigger fires for a new `case_devices` insert (insert+rollback test in SQL or verified via trigger presence + backfill counts).
- [ ] **6.3** Docs: CLAUDE.md "Database Migration History" v1.2.0 entry; surgical updates to `docs/data-recovery-workflow.md` (Stage 3/4 custody-at-intake now implemented, checkout custody events, actor stamping); note deferred P2 scope.
- [ ] **6.4** Push branch, update PR #190 body with migration checklist (per migration PR template requirements: migration SQL, regenerated types, callers updated).
