# xSuite — Architecture Reference for Claude

> **Supabase project (canonical): `https://ssmbegiyjivrcwgcqutu.supabase.co` · `project_id = ssmbegiyjivrcwgcqutu`.**
> The organization has **7 projects** — every Supabase MCP call (migrations, type generation, SQL) **MUST** pass this `project_id`. (Documentation only: the MCP is bound by the `project_id` argument on each call, not by this file.)

## ⚠️ THIS IS A DATA RECOVERY LAB PLATFORM — NOT A GENERIC CRM

> **xSuite is built EXCLUSIVELY for data recovery companies and forensic data-recovery labs.**
> It is **not** a generic CRM, helpdesk, or service-ticketing tool, and it must never be designed as one.
> Every workflow, permission, automation, form, status, dashboard, report, and business rule **MUST** map to how a real data recovery lab actually operates: physical devices arriving for recovery, chain of custody, cleanroom/imaging work, recoverability assessment, verified data delivery, and forensic auditability.

**Generic-CRM assumptions are bugs, not features.** A "case" is not a support ticket — it is a custody-tracked physical job that may hold many individually-tracked devices (e.g. a 12-drive RAID). "Delivery" is not a status flip — it is the release of recovered data that the customer reviews and the lab must be able to prove. Treating cases like one-thing tickets, collapsing N devices into one record, or wiring approval to the money (quotes) but not the product (recovered data) are all known anti-patterns this codebase has leaked before. **Do not reintroduce them.** See `docs/data-recovery-workflow.md` for the verified leak catalog.

### The 16-Stage Data Recovery Lifecycle (index → primary tables/modules)

| # | Stage | Primary table(s) / module — _today_ |
|---|-------|-------------------------------------|
| 1 | Lead / Customer Enquiry | _no lead entity_ → starts at `customers_enhanced` (+ `customer_communications`) |
| 2 | Case Creation | `cases` (+ `number_sequences`); created in `CreateCaseWizard`, not `caseService` |
| 3 | Device Intake | `case_devices` (multi-device array; primary = `patient` role) |
| 4 | Device Labeling & Tracking | case-level `CaseLabelDocument`; `chain_of_custody` (init'd at intake via `trg_log_device_received_custody` since v1.2.0) |
| 5 | Initial Inspection / Condition | `case_devices.condition_id`; `device_diagnostics` (insert fails — see workflow doc) |
| 6 | Diagnosis / Fault / Recoverability | `case_devices.symptoms` + `catalog_service_problems` (flat label, no severity) |
| 7 | Quotation & Approval | `quotes` (internal) vs `case_quotes` (portal read — 0 rows; loop broken) |
| 8 | Recovery Process | `transition_case_status` + `resource_clone_drives`; `case_recovery_attempts` unwired |
| 9 | Engineer Assignment | `case_engineers` (hardcoded `profiles.role='technician'`; hard-delete on remove) |
| 10 | Internal Notes & Findings | `case_internal_notes`; `device_diagnostics` (no visibility/private column) |
| 11 | Recovery Verification / QA | `chain_of_custody_integrity_checks` (hash/seal); `case_qa_checklists` orphan |
| 12 | File Listing & Delivery Approval | _no recovered-file manifest, no customer accept gate_; `case_reports` (read-only portal) |
| 13 | Device Checkout / Return | `log_case_checkout` (raw `status='Delivered'`); `chain_of_custody_transfers` |
| 14 | Billing & Payment | `invoices`, `payments`, `payment_allocations` (no payment-before-release gate) |
| 15 | Case Closure | `transition_case_status` (`requires[]` advisory-only) vs `log_case_checkout` bypass |
| 16 | Audit Trail & Reporting | `case_job_history`, `audit_trails`, `case_reports`, `chain_of_custody` |

### Before you change anything

- **Evaluate workflow impact first.** Locate the change within the 16-stage lifecycle above and confirm it matches real lab process before writing code.
- **Preserve case history & auditability.** Never break `case_job_history`, `audit_trails`, or `chain_of_custody`. Audit/custody tables are append-only by design (REVOKE + `prevent_audit_mutation` trigger) — do not weaken that.
- **Maintain device-level tracking & chain of custody.** Devices are tracked individually; a multi-device job must never collapse to a single outcome. Custody events belong at physical device receipt, not only on financial events.
- **Respect multi-tenant isolation & role-based permissions.** Keep RESTRICTIVE tenant isolation intact and gate lab control points (recovery authorization, QA sign-off, data release, custody transfer) — do not treat the tenant as a shared CRM workspace.
- **Hold to production-grade lab standards.** Forensic, legal, and customer-trust stakes are real (NDAs, destructive-attempt consent, certificates of destruction). Do not ship CRM-grade shortcuts on these surfaces.
- **Do not implement until you understand the change in the context of the data recovery business process.** When in doubt, read `docs/data-recovery-workflow.md` (the canonical end-to-end reference) first.

---

## 🧠 Mandatory Skill Loading — Startup Gate (READ FIRST)

> **Skills are mandatory prerequisites, not optional aids.** Before ANY task — analysis, planning, design, code, debugging, optimization, or even a "quick" answer — classify the task and load the required skill(s) below. This gate runs **first** and **automatically** at the start of every task. Work produced without the required skill loaded is non-conforming and must be redone.

### Startup Checklist (complete BEFORE task execution begins)

Run this at the start of every task, before writing any plan, design, or code:

1. [ ] **Classify the task** — UI/UX-facing, backend/logic, or **mixed**? (use the routing table)
2. [ ] **Load the required skill(s)** for that class via the `Skill` tool, and announce: `Loading <skill> per CLAUDE.md skill gate.`
3. [ ] **Verify each skill is active** (its guidance is in context) before producing anything.
4. [ ] **Apply the skill's standards** to every design, solution, and line of code.
5. [ ] **Verify before completion** — confirm output conforms to the loaded skill(s) (`verification-before-completion`).
6. [ ] If a required skill is missing or fails to load, **STOP and report** — do not proceed without it.

### Skill Routing — which skill(s) for which task

| Task involves… | Load BEFORE starting (mandatory) |
|---|---|
| UI/UX, front-end, design system, dashboard, form, **workflow & user-experience screens**, components, styling, theming, layout, charts, portal/print surfaces | **`ui-ux-pro-max`** **and** **`frontend-design`** (Anthropic Front-End Design Skill) — load and apply **both** |
| Everything else — architecture, analysis, debugging, implementation, optimization, refactoring, planning, schema/migrations, services, data, tests, tooling | **Superpowers** ("the Superpower Skill") — load **`using-superpowers`**, which routes to the right process skill: `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, etc. |
| **Both** UI/UX **and** backend/business logic in the same task | Load **both tracks** — `ui-ux-pro-max` + `frontend-design` **and** Superpowers — and use them together |

### Rules

1. **Mandatory & automatic.** Loading the skill is step 0 of every relevant task; it happens without being asked.
2. **No bypass.** No task is too small to skip the gate — a one-line fix or a "simple question" is still a task. Classify, load, then act.
3. **Standards compliance.** All generated solutions, designs, and code MUST follow the standards, patterns, and best practices defined by the loaded skill(s).
4. **Both when mixed.** Mixed tasks require both tracks — never either/or.
5. **Order of operations.** Process skills first (Superpowers: `brainstorming` / `systematic-debugging` decide *how* to approach), then design/implementation skills (`frontend-design`, `ui-ux-pro-max`) guide execution.
6. **This gate does NOT override the data-recovery domain rules below.** Domain correctness (the 16-stage lifecycle, custody, tenancy) **and** skill standards both apply — satisfy both.

### Installed skills (present & version-controlled in this repo)

| Skill | Role | Location |
|---|---|---|
| `ui-ux-pro-max` | UI/UX design intelligence — styles, palettes, typography, UX guidelines, charts, 16 stacks | `.claude/skills/ui-ux-pro-max/` |
| `frontend-design` | **Anthropic Front-End Design Skill** — distinctive, production-grade front-end | `.agents/skills/frontend-design/` → `.claude/skills/frontend-design` |
| `using-superpowers` (+ `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `executing-plans`, …) | **The Superpowers system** ("the Superpower Skill") | `.agents/skills/superpowers/` → `.claude/skills/*` |

A `SessionStart` hook (`.claude/hooks/superpowers-session-start.sh`) auto-loads the Superpowers entry point at session start; this gate extends that to per-task UI/UX and design skills. **No workflow may begin task work without completing the Startup Checklist above.**

---

## Project Overview

xSuite is an AI-powered, multi-tenant SaaS platform for the **data recovery industry**. It is a purpose-built ERP/CRM-grade platform for data recovery labs — managing cases, devices, chain of custody, clients, finances, inventory, HR, and supplier relationships. It applies ERP/CRM-grade rigor to lab operations; it is **not** a generic CRM (see the banner above and `docs/data-recovery-workflow.md`).

**Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- State: TanStack Query v5 (server state), React context (auth/permissions)
- Backend: Supabase (Postgres 15, Auth, Edge Functions, Storage, Realtime)
- PDF: `pdfmake` (sole PDF library; programmatic only)
- Icons: `lucide-react` only — no other icon libraries

---

## Supabase Project

- **Project URL**: see `VITE_SUPABASE_URL` in `.env`
- **Anon Key**: see `VITE_SUPABASE_ANON_KEY` in `.env`
- **Project ID**: `ssmbegiyjivrcwgcqutu`
- **MCP Transport**: HTTP (configured in project settings)

---

## Source of Truth Rules

1. **The live Supabase database is the single source of truth** for schema, types, and migrations.
2. Never edit the database schema via the Supabase dashboard directly. All schema changes go through `mcp__supabase__apply_migration`.
3. After every migration, regenerate `src/types/database.types.ts` using `mcp__supabase__generate_typescript_types`.
4. Never hand-edit `src/types/database.types.ts`. It is a generated file.

---

## TypeScript Types

- **Canonical types file**: `src/types/database.types.ts`
- Import the `Database` type from this file. Never import from `src/types/database.ts` (legacy).
- Usage pattern:
  ```typescript
  import type { Database } from '../types/database.types';
  type Case = Database['public']['Tables']['cases']['Row'];
  type CaseInsert = Database['public']['Tables']['cases']['Insert'];
  ```
- The Supabase client in `src/lib/supabaseClient.ts` is typed with `createClient<Database>(...)`.

---

## Multi-Tenant Architecture

### Tenant Isolation Model
- **Every tenant-scoped table** has a `tenant_id uuid NOT NULL` column with FK to `tenants(id)`
- **RESTRICTIVE RLS policies** enforce tenant isolation on ALL tenant-scoped tables:
  ```sql
  CREATE POLICY "{table}_tenant_isolation" ON {table}
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
  ```
- The `RESTRICTIVE` keyword ensures this policy is always ANDed with any permissive policies
- Platform admins (tenant_id IS NULL in profiles) can access all tenants

### Role Hierarchy
```
owner > admin > manager > technician = sales = accounts = hr > viewer
```

| Role | Scope | Description |
|------|-------|-------------|
| `owner` | Tenant | Tenant creator, full control |
| `admin` | Tenant | Tenant administrator |
| `manager` | Tenant | Team manager |
| `technician` | Tenant | Technical staff |
| `sales` | Tenant | Sales staff |
| `accounts` | Tenant | Accounting staff |
| `hr` | Tenant | HR staff |
| `viewer` | Tenant | Read-only access |

**Platform admins** are identified by `role IN ('owner', 'admin') AND tenant_id IS NULL` in `profiles`.

### Security Functions

| Function | Purpose |
|---|---|
| `get_current_tenant_id()` | Returns current user's tenant_id from profiles |
| `is_platform_admin()` | True if user has admin role with NULL tenant_id |
| `is_tenant_owner()` | True if user is tenant owner |
| `is_tenant_admin()` | True if user is owner or admin |
| `is_admin()` | True if user is owner or admin (any scope) |
| `is_staff_user()` | True for any non-viewer role |
| `has_role(required_role)` | Hierarchical role check |
| `belongs_to_tenant(uuid)` | Check tenant membership |
| `is_portal_user()` | True for portal customers (JWT claim) |
| `get_my_role()` | Returns current role string |

---

## Database Architecture

### Table Naming Conventions
- All tables: **snake_case, plural**
- All columns: **snake_case**
- Enum types: **snake_case with descriptive suffix**
- Functions: **verb-prefix** (e.g., `get_next_number`, `is_admin`)

### Table Prefixes (Mandatory)

| Prefix | Scope | Description |
|--------|-------|-------------|
| `geo_*` | Global | Geography (countries, cities) |
| `catalog_*` | Global | Product/service catalogs (devices, services) |
| `master_*` | Global | Lookup/reference data (statuses, types, categories) |
| `system_*` | Global | System configuration |
| `platform_*` | Platform | Platform admin tables |
| `tenant_*` | Platform | Tenant management |
| `subscription_*` | Platform | Subscription plans |
| `billing_*` | Platform | Platform billing |
| `case_*` | Tenant | Case management |
| `customer_*` | Tenant | Customer management |
| `invoice_*` | Tenant | Invoices |
| `quote_*` | Tenant | Quotes |
| `purchase_*` | Tenant | Purchase orders |
| `expense_*` | Tenant | Expenses |
| `payment_*` | Tenant | Payments |
| `inventory_*` | Tenant | Inventory |
| `stock_*` | Tenant | Stock management |
| `asset_*` | Tenant | Asset management |
| `supplier_*` | Tenant | Suppliers |
| `employee_*` | Tenant | HR/employees |
| `payroll_*` | Tenant | Payroll |
| `leave_*` | Tenant | Leave management |
| `kb_*` | Tenant | Knowledge base |

### Soft Deletes
All tables use `deleted_at timestamptz DEFAULT NULL`. **Never use hard deletes (`DELETE FROM`)**. Always set `deleted_at = now()`.

### RLS Policy Patterns

**Tenant-scoped tables** (3 patterns applied to every table with `tenant_id`):
1. RESTRICTIVE tenant isolation: `tenant_id = get_current_tenant_id() OR is_platform_admin()`
2. PERMISSIVE operation policies for SELECT/INSERT/UPDATE/DELETE
3. DELETE restricted to admin role via `has_role('admin')`

**Global master data** (`geo_*`, `catalog_*`, `master_*`, `system_*`):
- SELECT: `USING (true)` for all authenticated users
- INSERT/UPDATE/DELETE: `is_platform_admin()` only

**Platform tables** (`platform_*`):
- All operations: `is_platform_admin()` only

---

## Schema Discipline (enforced by CI)

Six required-status checks block PRs that re-introduce schema drift. Full design: `docs/superpowers/specs/2026-05-14-schema-discipline-cleanup-design.md`.

### Current cleanup state

- **tsc baseline: 0 errors.** CI fails any PR that introduces a tsc error.
- Schema discipline cleanup completed in `v1.1.0-schema-discipline` (762 → 0 errors swept across ~190 files).
- Baseline file `docs/superpowers/specs/tsc-baseline.count` removed; `scripts/check-tsc.sh` enforces zero.

### Naming standards

- **Catalog tables**: `catalog_*` prefix. Banned legacy names: `device_types`, `brands`, `capacities`, `service_types`, etc. — full list in `eslint-rules/banned-tables.js`.
- **Master tables** (lookups, statuses, categories): `master_*` prefix.
- **Geo tables**: `geo_*` prefix.
- **Tenant-scoped tables** must have: `tenant_id NOT NULL`, RLS enabled+forced, RESTRICTIVE isolation policy, `set_<table>_tenant_and_audit` trigger, `idx_<table>_tenant_id` partial index. Asserted by `scripts/check-tenant-table-requirements.sql`.

### Type-import rules

- Import `Database` from `src/types/database.types.ts` only.
- Never hand-edit `database.types.ts`. Regenerate via `npm run db:types`.

### Migration discipline

Every migration PR must contain:
1. Migration SQL (applied via `mcp__supabase__apply_migration`).
2. Regenerated `database.types.ts`.
3. Every caller updated.
4. Use `.github/PULL_REQUEST_TEMPLATE/migration.md`.

The schema-drift detector (`scripts/check-schema-drift.sh`) regenerates types and diffs them — any mismatch fails the PR.

### CI gates

| Job | Catches |
|---|---|
| `typecheck` | TS errors including stale column reads (TS2339, TS2551) — must equal 0 |
| `schema-drift` | Live DB diverging from `database.types.ts` |
| `lint` | `.from('<legacy_name>')` and embed names in `.select()` |
| `tenant-table-requirements` | New tenant-scoped table missing RLS, trigger, or index |
| `migration-manifest` | Applied migration missing from manifest |
| `from-table-names` | `.from('<X>')` where X is not a real table |

---

## Domain Model (222 Tables)

### Geography (Global)
`geo_countries`, `geo_cities`

### Master Data (Global)
`master_industries`, `master_currency_codes`, `master_case_priorities`, `master_case_statuses`, `master_case_report_templates`, `master_invoice_statuses`, `master_quote_statuses`, `master_purchase_order_statuses`, `master_leave_types`, `master_payment_methods`, `master_expense_categories`, `master_transaction_categories`, `master_template_categories`, `master_template_types`, `master_template_variables`, `master_modules`, `master_inventory_categories`, `master_inventory_condition_types`, `master_inventory_item_categories`, `master_inventory_status_types`, `master_supplier_categories`, `master_supplier_payment_terms`, `master_payroll_components`

### Device & Service Catalogs (Global)
`catalog_device_brands`, `catalog_device_types`, `catalog_device_capacities`, `catalog_device_encryption`, `catalog_device_form_factors`, `catalog_device_interfaces`, `catalog_device_made_in`, `catalog_device_head_counts`, `catalog_device_platter_counts`, `catalog_device_roles`, `catalog_device_conditions`, `catalog_device_component_statuses`, `catalog_interfaces`, `catalog_accessories`, `catalog_donor_compatibility_matrix`, `catalog_service_types`, `catalog_service_locations`, `catalog_service_problems`, `catalog_service_categories`, `catalog_service_line_items`

### System (Global)
`system_settings`, `system_seed_status`, `report_section_library`, `report_section_presets`, `report_template_section_mappings`

### Platform & Subscription
`tenants`, `profiles`, `platform_admins`, `platform_audit_logs`, `platform_announcements`, `platform_metrics`, `tenant_impersonation_sessions`, `subscription_plans`, `plan_features`, `tenant_subscriptions`, `tenant_payment_methods`, `tenant_activity_log`, `tenant_health_metrics`, `billing_invoices`, `billing_invoice_items`, `billing_events`, `billing_coupons`, `coupon_redemptions`, `usage_records`, `usage_snapshots`, `support_tickets`, `support_ticket_messages`, `announcement_dismissals`, `onboarding_progress`, `signup_otps`

### Cases (Tenant-scoped)
`cases`, `case_devices`, `case_attachments`, `case_communications`, `case_diagnostics`, `case_engineers`, `case_follow_ups`, `case_internal_notes`, `case_job_history`, `case_milestones`, `case_portal_visibility`, `case_qa_checklists`, `case_recovery_attempts`, `case_quotes`, `case_quote_items`, `case_reports`, `case_report_sections`

### Chain of Custody (Tenant-scoped)
`chain_of_custody`, `chain_of_custody_access_log`, `chain_of_custody_integrity_checks`, `chain_of_custody_transfers`
- Uses enums: `custody_action_category`, `custody_status`, `custody_transfer_status`, `integrity_check_result`

### Customers & Companies (Tenant-scoped)
`customers_enhanced` (canonical; `customers` is a compatibility view), `customer_groups`, `customer_communications`, `customer_company_relationships`, `companies`, `company_documents`, `company_settings`, `ndas`, `portal_link_history`

### Financial (Tenant-scoped)
`invoices`, `invoice_line_items`, `quotes`, `quote_items`, `quote_history`, `payments`, `payment_allocations`, `payment_receipts`, `payment_disbursements`, `receipts`, `receipt_allocations`, `expenses`, `expense_attachments`, `financial_transactions`, `financial_audit_logs`, `bank_accounts`, `bank_transactions`, `bank_reconciliation_sessions`, `account_balance_snapshots`, `account_transfers`, `reconciliation_matches`, `accounting_locales`, `tax_rates`, `vat_records`, `vat_returns`, `vat_transactions`

### Inventory & Stock (Tenant-scoped)
`inventory_items`, `inventory_locations`, `inventory_assignments`, `inventory_case_assignments`, `inventory_photos`, `inventory_reservations`, `inventory_search_templates`, `inventory_status_history`, `inventory_transactions`, `inventory_parts_usage`, `stock_items`, `stock_categories`, `stock_locations`, `stock_movements`, `stock_adjustments`, `stock_adjustment_sessions`, `stock_adjustment_session_items`, `stock_alerts`, `stock_price_history`, `stock_sales`, `stock_sale_items`, `stock_serial_numbers`, `stock_transactions`, `clone_drives`, `resource_clone_drives`, `device_diagnostics`

### Suppliers (Tenant-scoped)
`suppliers`, `supplier_contacts`, `supplier_communications`, `supplier_documents`, `supplier_audit_trail`, `supplier_performance_metrics`, `supplier_products`, `purchase_orders`, `purchase_order_items`

### HR & Payroll (Tenant-scoped)
`departments`, `positions`, `employees`, `employee_documents`, `employee_salary_config`, `employee_salary_components`, `employee_salary_structures`, `employee_loans`, `loan_repayments`, `attendance_records`, `timesheets`, `leave_balances`, `leave_requests`, `salary_components`, `payroll_settings`, `payroll_periods`, `payroll_records`, `payroll_record_items`, `payroll_adjustments`, `payroll_bank_files`, `performance_reviews`, `onboarding_checklists`, `onboarding_checklist_items`, `onboarding_tasks`, `recruitment_jobs`, `recruitment_candidates`

### Assets (Tenant-scoped)
`asset_categories`, `assets`, `asset_assignments`, `asset_depreciation`, `asset_maintenance`

### Documents & Templates (Tenant-scoped)
`document_templates`, `templates`, `template_versions`, `number_sequences`, `number_sequences_audit`, `role_module_permissions`

### System & Logs (Tenant-scoped)
`system_logs`, `audit_trails`, `database_backups`, `pdf_generation_logs`, `user_preferences`, `user_sidebar_preferences`, `user_activity_sessions`, `user_activity_logs`, `user_sessions`, `branches`

### Knowledge Base (Tenant-scoped)
`kb_categories`, `kb_articles`, `kb_tags`, `kb_article_tags`, `kb_article_versions`

### Import/Export (Tenant-scoped)
`import_export_templates`, `import_export_jobs`, `import_export_logs`, `import_field_mappings`

---

## Key Database Functions

| Function | Purpose |
|---|---|
| `get_next_number(scope)` | Returns next formatted number (e.g., `CASE-0042`) |
| `get_next_case_number()` | Case-specific number generator |
| `handle_new_user()` | Auth trigger: creates `profiles` row on signup |
| `is_admin()` | RLS helper: true if user is owner or admin |
| `is_staff_user()` | RLS helper: true for any staff role |
| `is_platform_admin()` | RLS helper: true for platform-level admin |
| `has_role(role)` | Hierarchical role check |
| `get_my_role()` | Returns current user's role string |
| `authenticate_portal_customer(email, password)` | Portal customer auth |
| `convert_proforma_invoice_to_tax_invoice(invoice_id, due_date, notes)` | Converts a proforma invoice to a tax invoice (canonical path) |
| `search_donor_drives(criteria)` | Inventory donor drive search |
| `log_audit_trail(...)` | Creates audit trail entry |
| `log_chain_of_custody(...)` | Creates chain of custody entry |
| `log_case_history(...)` | Creates case history entry |

---

## Edge Functions

Located in `supabase/functions/`:

| Function | Purpose |
|---|---|
| `send-document-email` | Sends PDFs/documents via email (SMTP) |
| `user-management` | Admin user creation/management |
| `provision-tenant` | Creates new SaaS tenants |
| `paypal-create-subscription` | PayPal subscription creation |
| `paypal-cancel-subscription` | PayPal subscription cancellation |
| `paypal-webhook` | PayPal webhook handler |

- All edge functions use Deno runtime
- All must handle CORS with headers: `Content-Type, Authorization, X-Client-Info, Apikey`
- Import external packages with `npm:` prefix
- Never share code between edge functions

---

## Migration Workflow

When making schema changes:

1. **Introspect first**: Use `mcp__supabase__list_tables` or `mcp__supabase__execute_sql` to understand the current live schema.
2. **Write migration**: Use `mcp__supabase__apply_migration` with a timestamped filename.
3. **Include in every migration**:
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
   - RESTRICTIVE tenant isolation policy for tenant-scoped tables
   - Appropriate RLS policies
   - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` for tenant-scoped tables
   - `CREATE INDEX idx_{table}_tenant_id ON {table}(tenant_id) WHERE deleted_at IS NULL`
4. **Regen types**: Use `mcp__supabase__generate_typescript_types` and save to `src/types/database.types.ts`.
5. **Never** use `DROP TABLE`, `DROP COLUMN`, or `DELETE FROM` on production data. Use soft deletes and additive migrations only.

---

## Frontend Architecture

```
src/
  App.tsx                    # Router + QueryClient + AuthContext
  contexts/
    AuthContext.tsx           # Supabase auth state
    PermissionsContext.tsx    # Role-based permission checks
    PortalAuthContext.tsx     # Customer portal auth
    PlatformAdminContext.tsx  # Platform admin state
  lib/
    supabaseClient.ts         # Singleton Supabase client (typed with Database)
    *Service.ts               # Domain service files (one per domain)
    pdf/                      # PDF generation utilities
  components/
    ui/                       # Base UI components
    layout/                   # AppLayout, Sidebar, PortalLayout
    ...                       # One subdirectory per domain
  pages/
    auth/                     # Login, TenantSignup
    cases/                    # Case management
    financial/                # Invoices, Quotes, Banking
    portal/                   # Customer portal
    platform-admin/           # Platform administration
    settings/                 # Settings
    ...                       # One subdirectory per domain
  types/
    database.types.ts         # GENERATED — do not hand-edit
    roles.ts                  # Role type definitions
```

### Service Layer Pattern
Each domain has a `*Service.ts` file in `src/lib/`. Services:
- Import `supabase` from `./supabaseClient`
- Use `Database` types from `../types/database.types`
- Return typed data, never raw Supabase responses
- Use `maybeSingle()` (not `single()`) when fetching zero-or-one row

### Query Keys
All TanStack Query keys are centralized in `src/lib/queryKeys.ts`.

### Permissions
Use `PermissionsContext` for all feature-gating. Never hardcode role strings in components — use the permission system.

---

## Customers vs customers_enhanced

`customers` is a **compatibility view** over `customers_enhanced`. The canonical table is `customers_enhanced`. Always insert/update `customers_enhanced` directly.

---

## Number Sequences

Case numbers, invoice numbers, etc. are generated via:
```typescript
const { data } = await supabase.rpc('get_next_number', { sequence_name: 'cases' });
```
Sequences are tracked in `number_sequences` and audited in `number_sequences_audit`.

---

## PDF Generation

- All PDFs use `pdfmake` exclusively. `@react-pdf/renderer` is NOT installed despite older docs/Copy files; do not import it.
- Programmatic document builders: `src/lib/pdf/documents/*.ts` (one per document type).
- React preview wrappers that build pdfmake doc-definitions: `src/components/documents/*.tsx`.
- Shared style constants: `src/lib/pdf/styles.ts` (`PDF_COLORS`, `PDF_STYLES`, `getStylesWithFont(fontFamily)`).
- Arabic/RTL support: Noto Sans Arabic + Tajawal fonts in `public/fonts/`.
- Font loading: `src/lib/pdf/fontLoader.ts`.
- **PDFs stay neutral across themes.** The fixed device-icon SVG hexes in `src/lib/deviceIconMapper.ts` are intentional — see the Theming section.

---

## Theming

> **Read `DESIGN.md` (repo root) before any visual or UI change.** It is the single
> source of truth for fonts, the 14 semantic tokens, the three themes, spacing,
> motion, non-themed surfaces (charts/PDFs), and the live drift register. This
> Theming section is the architecture; `DESIGN.md` is the enforceable contract.
> In QA/design review, flag any code that deviates from `DESIGN.md`. Do not extend
> the token vocabulary without updating `DESIGN.md` first.

xSuite supports three tenant-selectable themes — Royal (default), Burgundy, Scarlet — selected per-tenant from Settings → Appearance (admin-gated). Active theme propagates through CSS variables; nothing rebuilds.

### Architecture
- **Storage**: `tenants.theme text NOT NULL DEFAULT 'royal' CHECK (theme IN ('royal','burgundy','scarlet'))`.
- **CSS vars**: defined in `src/index.css` under `:root[data-theme="royal|burgundy|scarlet"]` blocks plus a constant `:root` block for status/surface tokens. Each var stores an RGB triplet (e.g. `--color-primary: 22 38 96`) so Tailwind's `<alpha-value>` opacity syntax keeps working.
- **Tailwind palette**: `tailwind.config.js` `theme.extend.colors` exposes the 14 semantic tokens via `rgb(var(--color-x) / <alpha-value>)`. Tailwind's built-in `gray/slate/zinc/white/black` palette stays available for utility neutrals.
- **DOM application**: `ThemeContext` (`src/contexts/ThemeContext.tsx`) reads the active theme from `TenantConfigContext` and writes `document.documentElement.dataset.theme`. Also persists a `xsuite_theme_hint` to `localStorage`.
- **Anti-flash**: `src/main.tsx` synchronously reads the localStorage hint and sets `data-theme` before `createRoot()` so returning visitors don't see a Royal-default paint. CSP forbids inline scripts in `index.html`, so the module-script approach is the only option.
- **Mutation**: `src/lib/tenantThemeService.ts` `updateTenantTheme(tenantId, theme)`. `ThemeContext` optimistically applies the theme to the DOM, then calls the service, then refreshes the tenant config.
- **Picker UI**: `src/pages/settings/AppearanceSettings.tsx` — three mini-preview cards (swatches + sample button + accent strip). Active card uses `border-primary` so the picker re-themes reactively.

### Token vocabulary (locked)
14 role-based tokens, each with foreground and (for status) muted variants:
- Brand: `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `accent`, `accent-foreground`
- Surface: `surface`, `surface-muted`, `border`, `ring`
- Status (constant across themes): `success`, `success-foreground`, `success-muted`, `warning`, `warning-foreground`, `warning-muted`, `danger`, `danger-foreground`, `danger-muted`, `info`, `info-foreground`, `info-muted`

Do NOT invent new tokens. If a color need doesn't fit, ask before extending the vocabulary.

### Rules
- Never write `bg-blue-600`, `text-purple-*`, or any brand hex like `#1E5BB8` / `#8b5cf6` / `#6366f1` / `#a855f7` / `#4A5568` / `#6A7A8A` in new code. Use semantic tokens.
- `bg-purple-*`, `bg-indigo-*`, `bg-violet-*` (any shade) are BANNED. Use `bg-accent` or `bg-secondary`.
- PDFs do NOT theme. `src/lib/deviceIconMapper.ts` SVG strings and `src/lib/pdf/styles.ts` `PDF_COLORS` are intentionally fixed.
- Charts use `src/lib/chartTheme.ts` (`chartCategorical`, `chartAxis`, `chartGrid`, `chartTooltipBorder`) — also intentionally not themed.
- The `*Copy.tsx` shadow tree under `src/` was removed in the theme-migration Phase 0 and must not be re-introduced. Do not commit `* - Copy.{ts,tsx}` files.
- Tailwind v3.4 only — do NOT upgrade to v4 without a separate plan.

### Adding a fourth theme
1. Add a new value to the `tenants.theme` CHECK constraint and to the `Theme` union in `src/types/tenantConfig.ts` / `THEMES` array.
2. Append a `:root[data-theme="new"]` block to `src/index.css` with the same six `--color-primary` / `-secondary` / `-accent` (+ foreground) triplets.
3. Add an option to `THEME_OPTIONS` in `src/pages/settings/AppearanceSettings.tsx` (name, description, primary/secondary/accent swatches).
4. No component changes required — the token system propagates automatically.

---

## Key Enums

```typescript
type CustodyActionCategory = 'creation' | 'modification' | 'access' | 'transfer' | 'verification' | 'communication' | 'evidence_handling' | 'financial' | 'critical_event';
type CustodyStatus = 'in_custody' | 'in_transit' | 'checked_out' | 'archived' | 'disposed';
type CustodyTransferStatus = 'initiated' | 'pending_acceptance' | 'accepted' | 'rejected' | 'cancelled';
type IntegrityCheckResult = 'passed' | 'failed' | 'warning' | 'not_applicable';
```

---

## Do Not

- Do not use `DROP TABLE` or hard deletes
- Do not bypass RLS with `service_role` key in frontend code
- Do not use `single()` — use `maybeSingle()` instead
- Do not import from `src/types/database.ts` (legacy) — use `src/types/database.types.ts`
- Do not write to `supabase/migrations/` directly — use `mcp__supabase__apply_migration`
- Do not install new npm packages without checking existing packages first
- Do not use purple/indigo/violet color schemes in UI
- Do not add comments to code unless the logic is non-obvious
- Do not create new files unless necessary; prefer editing existing files
- Do not create `USING(true)` policies on tenant-scoped tables — use RESTRICTIVE tenant isolation
- Do not use `is_admin()` for platform-level operations — use `is_platform_admin()`
- Do not hardcode currency symbols, tax labels, or date formats — use `TenantConfigContext`
- Do not write to a banned legacy table name (see Schema Discipline section)
- Do not import from `src/types/database.ts` (legacy file; replaced by `database.types.ts`)
- Do not bypass the migration PR template for schema changes
- Do not reuse a work branch after its PR is merged — PRs here are squash-merged and the branch deleted, so pushing to the old name recreates it carrying already-merged commits (conflicting diffs). Start each new piece of work on a fresh branch cut from `main`

---

## Country-Based Tenant Configuration

### Architecture
- **`geo_countries`** table stores regional config: currency, tax system, date format, timezone, locale, compliance
- **`tenants`** table has denormalized config columns auto-synced from `geo_countries` via `sync_tenant_config_from_country()` trigger
- **`TenantConfigContext`** (`src/contexts/TenantConfigContext.tsx`) provides config to all components
- Config loaded once per session, cached 5 minutes in service layer

### Usage Pattern
```typescript
import { useTenantConfig, useCurrencyConfig, useTaxConfig } from '../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../lib/format';

// In components:
const { config } = useTenantConfig();
const currency = useCurrencyConfig();
const tax = useTaxConfig();
const formatted = formatCurrencyWithConfig(amount, currency);
```

### Key Types
- `TenantConfig` — full tenant configuration (currency, tax, dateTime, locale)
- `CurrencyConfig` — code, symbol, decimalPlaces, separators, position
- `TaxConfig` — system (VAT/GST/SALES_TAX/NONE), label, rate, numberFormat
- `DateTimeConfig` — dateFormat, timeFormat, timezone, fiscalYearStart

### Rules
- Never hardcode currency symbols, tax labels, or date formats
- Use `useCurrency()` hook or `useCurrencyConfig()` for formatting
- Use `useTaxConfig()` for tax labels and rates
- Country selection during signup determines all config automatically
- `accounting_locales` type matches DB schema (7 columns, not 20+)

---

## Database Migration History

### Version 1.0.0 — Complete SaaS Architecture Rebuild
**Date**: 2026-03-19
**Migrations**: 001–014

- Dropped all 200 legacy tables, rebuilt 222 tables with proper naming conventions (`geo_*`, `catalog_*`, `master_*`, `system_*` prefixes)
- 1,019 RLS policies: 861 permissive + 158 RESTRICTIVE tenant isolation
- 92 database functions including 7 security helpers (all SECURITY DEFINER)
- 59 frontend files updated with new table references
- Regenerated `database.types.ts` (13,692 lines)
- All tenant-scoped tables enforce RESTRICTIVE isolation via `get_current_tenant_id()` / `is_platform_admin()`
- Role hierarchy: `owner > admin > manager > technician = sales = accounts = hr > viewer`
- See `docs/TABLE_MAPPING.md` for complete old → new table name mapping

### Version 1.1.0 — Tenant-Selectable Theme System
**Date**: 2026-05-14
**Migration**: `add_tenants_theme_column`

- Added `tenants.theme text NOT NULL DEFAULT 'royal' CHECK (theme IN ('royal','burgundy','scarlet'))` with partial index on non-deleted rows.
- Frontend rewired to CSS-variable + Tailwind token system. 14 semantic tokens (primary/secondary/accent + foreground/-muted variants, plus surface/border/ring and status: success/warning/danger/info). All `*Copy.tsx` shadow tree (~371 stale duplicate files) removed in the same release.
- ~370 source files retokenized across UI, layout, financial, banking, cases, portal, auth, settings, platform-admin, HR, payroll, inventory, stock, suppliers, templates, companies, customers, quotes, kb, dashboard, users, admin, resources, print, onboarding, plus shared components. Zero banned `purple-*`/`indigo-*`/`violet-*` classes or banned hex codes (`#1E5BB8`, `#4A5568`, `#6A7A8A`, `#8b5cf6`, `#6366f1`, `#a855f7`) remain in `src/` except the intentionally-fixed `src/lib/deviceIconMapper.ts` SVG strings.
- New files: `src/contexts/ThemeContext.tsx`, `src/lib/tenantThemeService.ts`, `src/lib/chartTheme.ts`, `src/pages/settings/AppearanceSettings.tsx`.
- See the **Theming** section above for the full token vocabulary and rules.

### Version 1.2.0 — Custody Write Paths, Audit Actor Stamping & Relationship Integrity
**Date**: 2026-06-10
**Migrations**: `custody_ledger_write_paths`, `audit_actor_fields`, `single_primary_company_per_customer`, `custody_baseline_for_existing_devices` (spec: `docs/platform-review-2026-06-10.md`)

- **Chain of custody now has lifecycle write paths** (the ledger previously had 0 rows DB-wide): `trg_log_device_received_custody` AFTER INSERT ON `case_devices` logs `DEVICE_RECEIVED`/`in_custody` at intake (DB-side — no client path can skip it); `log_case_checkout` additionally writes `DEVICE_CHECKED_OUT`/`CASE_CHECKED_OUT` (`checked_out`) ledger events; `log_chain_of_custody` gained `DEFAULT NULL` on `p_device_id` (clients previously sent `''`, failing the uuid cast on every case-level event); pre-rollout devices received one labelled retroactive `CUSTODY_BASELINE_ESTABLISHED` event. Frontend: financial custody events (quote/invoice/payment) wired into the services; History tab split into Chain of Custody + Case Activity (`case_job_history`) views.
- **Audit actor stamping moved into the DB**: `set_audit_actor_fields()` BEFORE INSERT/UPDATE trigger on `cases`, `invoices`, `quotes`, `customers_enhanced`, `companies`, `case_internal_notes`, `case_devices`; `updated_by uuid` added to `case_internal_notes` + `case_devices`. Frontend: shared `AuditInfo` component + `formatDateTimeWithConfig` (tenant-timezone via `Intl`) rolled out to case/quote/invoice/customer/notes surfaces.
- **Customer↔company integrity**: single-primary partial unique index `uq_customer_primary_company` + data fix (9 linked customers had no primary); relationship management UI (`ManageCompaniesModal`, manager+) with audited add/set-primary/end and explicit open-case re-pointing; all relationship readers now filter `deleted_at`.
- Tenant-configurable case table columns: registry + `company_settings.metadata.table_columns` (tenant defaults/locked) + `user_preferences.preferences.tables` (user overrides); fit-to-width rendering (no horizontal scroll). No schema change.
- `database.types.ts` regenerated.

### Future Migration Guidelines

1. **New tenant-scoped table**: Add `tenant_id uuid NOT NULL REFERENCES tenants(id)`, apply RESTRICTIVE tenant isolation policy, apply `set_tenant_and_audit_fields` trigger
2. **New global/master table**: No `tenant_id`. Read-only for authenticated, write for `is_platform_admin()`
3. **New platform table**: No `tenant_id`. Platform admin only access
4. **Naming**: Follow domain prefix conventions in Table Prefixes section. Audit tables: `{domain}_audit_logs`. Use plural table names
