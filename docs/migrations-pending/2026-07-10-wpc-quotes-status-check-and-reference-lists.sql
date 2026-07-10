-- WP-C (status-vocabulary hardening, FU-1 follow-up).
-- Applied live as version 20260710180135.
--
-- (1) quotes.status becomes a hard CHECK on the 6 canonical service-layer
-- codes. The 2026-07-10 FU-1 migration normalized all live rows (draft 77 /
-- sent 1053 / accepted 8) so this validates immediately; the import path now
-- coerces legacy display names (normalizeQuoteStatus) and the import validator
-- ERROR-guards the field client-side, so a bad workbook fails loudly in the
-- dry-run rather than as an opaque per-row RPC failure. NULL stays allowed
-- (CHECK is NULL-tolerant), matching the column definition.
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'converted'::text]));

-- (2) data_migration_reference_lists: the import template's Reference sheet now
-- advertises the canonical Quote Statuses, and stops advertising 'overdue' for
-- invoices (owner decision: overdue is a due-date fact derived at read time —
-- coerceWorkbook maps an imported 'overdue' to 'sent'; invoices_status_check
-- keeps tolerating legacy stored values). Only the ELSE (financial/default)
-- branch changed; other domains byte-identical. Full definition in the live DB
-- (pg_get_functiondef) — changed lines:
--   'Invoice Statuses', to_jsonb(ARRAY['draft','sent','paid','partial','cancelled','void','converted']),
--   'Quote Statuses',   to_jsonb(ARRAY['draft','sent','accepted','rejected','expired','converted']),
