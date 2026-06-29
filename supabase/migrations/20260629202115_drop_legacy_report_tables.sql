-- Phase 11 follow-up (owner decision 2026-06-30): DROP the retired legacy report stack.
-- The run-time + admin code was deleted in Phase 11 (PR #340) and historical reports were
-- migrated into document_instances; these 6 tables are no longer referenced by any code path.
-- Owner chose a hard DROP (over the freeze runbook) to remove them from the schema entirely so
-- the developer team isn't confused by dead tables. document_instances.legacy_case_report_id is
-- retained as harmless origin metadata (plain marker, not a FK).
--
-- This SUPERSEDES the post-deploy freeze runbook (docs/superpowers/specs/2026-06-29-phase11-post-deploy-freeze.md):
-- once the tables are dropped, there is nothing left to REVOKE. The eslint banned-tables entries
-- for these 6 names are KEPT (a banned, non-existent table name still blocks any .from() re-introduction).

-- dead function: only consumer (the Report Studio admin) was deleted in Phase 11.
DROP FUNCTION IF EXISTS public.increment_preset_usage(uuid);

-- children first; CASCADE handles the self-contained FK web + table-bound policies/indexes/triggers.
DROP TABLE IF EXISTS
  public.case_report_sections,
  public.report_template_section_mappings,
  public.report_section_presets,
  public.case_reports,
  public.master_case_report_templates,
  public.report_section_library
CASCADE;
