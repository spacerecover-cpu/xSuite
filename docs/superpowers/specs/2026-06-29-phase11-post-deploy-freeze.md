# Phase 11 — Post-Deploy Freeze of the Retired Legacy Report Tables

> **🛑 SUPERSEDED (2026-06-30) — DO NOT APPLY.** The owner chose to **DROP** the 6 legacy report
> tables outright rather than freeze them. That was done in migration
> `20260629202115_drop_legacy_report_tables` (applied post-merge of PR #340, after confirming the
> new code was live). Once dropped, there is nothing left to `REVOKE`, so the freeze below is moot.
> The eslint banned-tables entries for the 6 names are kept (they still block any `.from()`
> re-introduction). This file is retained only as a record of the original (rejected) freeze plan.

> **⚠️ APPLY AFTER DEPLOY ONLY.** This is the single Phase-11 step that must run **after** the
> new frontend (which no longer writes any of these tables) is live in production. Applying it
> **before** the new code ships will break the still-running production app, whose old code still
> issues `INSERT/UPDATE/DELETE` against `case_reports` et al. It is therefore intentionally **NOT**
> in `supabase/migrations/` and **NOT** applied. Do not run it as part of the Phase 11 merge.

## Why this is separate from the rest of Phase 11

Phase 11 (commits on `feat/doc-studio-phase11`) removed all *code* that writes these tables and
lint-banned them, and migrated historical rows into `document_instances` (still readable in the new
viewer). The tables themselves are kept as a **frozen, read-only archive** — never dropped
(forensic/audit retention, per CLAUDE.md). The only remaining step is to *enforce* the freeze at the
database level by revoking write privileges, which can only happen once no live code writes them.

## When to apply

1. The Phase 11 branch is merged and the new frontend is **deployed and verified** in production.
2. Confirm no production client path still writes these tables (the code is gone; this is the belt).
3. Then apply the SQL below via `mcp__supabase__apply_migration` (project `ssmbegiyjivrcwgcqutu`),
   name `freeze_legacy_report_tables`.
4. **At apply-time**, copy this SQL into `supabase/migrations/<assigned_version>_freeze_legacy_report_tables.sql`
   and add the matching row to `supabase/migrations.manifest.md` (the manifest CI gate requires a row
   for every *applied* migration). Regenerating `database.types.ts` is **not** needed — grants don't
   change the type surface.

## The migration SQL (apply post-deploy)

```sql
-- Phase 11 post-deploy: freeze the retired legacy report tables as a read-only archive.
-- Writes are revoked from the client role; RLS tenant-isolation and SELECT remain intact, and the
-- tables are NEVER dropped (forensic/audit retention). SECURITY DEFINER paths / service_role are
-- unaffected (none of the retired code writes these any more; this is enforcement-in-depth).
REVOKE INSERT, UPDATE, DELETE ON
  case_reports,
  case_report_sections,
  master_case_report_templates,
  report_section_library,
  report_section_presets,
  report_template_section_mappings
FROM authenticated, anon;

-- Optional, closes the legacy portal read leak the Document Studio design flagged:
-- the customer portal no longer reads case_reports (PortalReports was deleted; the portal now
-- reads delivered document_instances via the fail-closed Phase-9 policy). If a permissive portal
-- SELECT policy still exists on case_reports, drop it so drafts can never be exposed:
--   DROP POLICY IF EXISTS "case_reports_portal_read" ON case_reports;
```

## Verify after applying

```sql
-- writes denied for authenticated, SELECT still granted:
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'case_reports' AND grantee IN ('authenticated','anon')
ORDER BY grantee, privilege_type;     -- expect SELECT only (no INSERT/UPDATE/DELETE)

-- archive intact (rows preserved, never dropped):
SELECT count(*) FROM case_reports;    -- unchanged from pre-freeze
```

## Rollback (if ever needed)

```sql
GRANT INSERT, UPDATE, DELETE ON
  case_reports, case_report_sections, master_case_report_templates,
  report_section_library, report_section_presets, report_template_section_mappings
TO authenticated;
```
