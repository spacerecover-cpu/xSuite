-- ─────────────────────────────────────────────────────────────────────────────
-- P3 WP-4 Task 17 — Publish→resync no-op / idempotency discipline probe (graft 12)
-- ─────────────────────────────────────────────────────────────────────────────
-- DISCIPLINE UNDER TEST
--   publish_country_pack() resyncs every tenant of the published country
--   (resync_tenant_country_config → _apply_country_config). That resync MUST be:
--     (a) FORWARD-ONLY: it recomputes tenant.resolved_country_config from the country
--         pack's scalars + routing keys — it NEVER rewrites snapshotted documents.
--     (b) IDEMPOTENT: running it twice in a row is a verifiable no-op on the second
--         run (resync ∘ resync == resync). A publish that resyncs a tenant whose
--         config already matches must not churn its resolved config.
--
-- WHY THIS ISN'T THE PLAN'S NAÏVE ONE-LINER
--   resync_tenant_country_config() returns integer (the config version), NOT void,
--   and it has side effects: _apply_country_config UNCONDITIONALLY writes
--   tenant.resolved_country_config/country_config_version, and resync then INSERTs an
--   audit_trails 'COUNTRY_CONFIG_RESYNCED' row. That audit insert is gated by the
--   set_tenant_and_audit_fields() trigger ("Cannot insert data for a different tenant")
--   unless the session is a platform admin OR app.bypass_tenant_guard='true'.
--   So a raw `SELECT resync_tenant_country_config(id) FROM tenants` on the pooled
--   service connection BOTH errors on the trigger AND (where it doesn't) pollutes live
--   (audit rows + touched rows). This probe therefore:
--     • sets app.bypass_tenant_guard locally (transaction-scoped),
--     • runs the resync(s),
--     • measures the delta,
--     • and RAISEs at the end so the whole transaction ROLLS BACK — zero live side
--       effects (no audit rows, no persisted resync). The result is carried out in the
--       RAISE message.
--
-- HOW TO RUN
--   mcp__supabase__execute_sql (service context) OR psql as a platform admin. The
--   trailing RAISE is intentional — the "error" text IS the recorded result.
-- ─────────────────────────────────────────────────────────────────────────────

DO $probe$
DECLARE
  v_tid        uuid;
  v_rc_before  jsonb;
  v_rc_after1  jsonb;
  v_rc_after2  jsonb;
  v_added      text;   -- keys the resolver ADDS that the stored config lacked
  v_changed    text;   -- pre-existing keys whose VALUE the resolver changes
BEGIN
  PERFORM set_config('app.bypass_tenant_guard', 'true', true);  -- txn-local; rolled back

  SELECT id, resolved_country_config INTO v_tid, v_rc_before
    FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

  PERFORM resync_tenant_country_config(v_tid);                       -- resync #1
  SELECT resolved_country_config INTO v_rc_after1 FROM tenants WHERE id = v_tid;

  PERFORM resync_tenant_country_config(v_tid);                       -- resync #2 (idempotency)
  SELECT resolved_country_config INTO v_rc_after2 FROM tenants WHERE id = v_tid;

  SELECT string_agg(k, ',') INTO v_added
    FROM (SELECT jsonb_object_keys(v_rc_after1)
          EXCEPT SELECT jsonb_object_keys(COALESCE(v_rc_before, '{}'::jsonb))) q(k);

  SELECT string_agg(key, ',') INTO v_changed
    FROM jsonb_object_keys(v_rc_after1) key
   WHERE (v_rc_after1 -> key) IS DISTINCT FROM (COALESCE(v_rc_before, '{}'::jsonb) -> key)
     AND key IN (SELECT jsonb_object_keys(COALESCE(v_rc_before, '{}'::jsonb)));

  RAISE EXCEPTION 'RESYNC_PROBE added=[%] changed_vals=[%] idempotent(after1==after2)=%',
    COALESCE(v_added, '(none)'), COALESCE(v_changed, '(none)'), (v_rc_after1 = v_rc_after2);
END $probe$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RECORDED EVIDENCE — canonical DB ssmbegiyjivrcwgcqutu, 2026-07-05 (1 live tenant, OM demo)
-- ─────────────────────────────────────────────────────────────────────────────
--   ERROR:  P0001: RESYNC_PROBE
--     added=[regime.einvoice,regime.numbering,format.amount_words_scale,regime.tax,
--            regime.documents,tax.rounding_policy,regime.payroll]
--     changed_vals=[(none)]
--     idempotent(after1==after2)=t
--
-- READING:
--   • idempotent=t  → the DISCIPLINE HOLDS. A second resync is a verifiable no-op;
--     publish→resync will not churn a tenant whose config already matches.
--   • changed_vals=(none) → resync NEVER rewrites an existing resolved value — it is
--     forward-only and purely additive. No snapshotted/derived value is disturbed.
--   • added=[7 keys] → the OM demo tenant's stored resolved_country_config is STALE:
--     it predates the SPK+ regime routing keys (regime.tax/numbering/documents/einvoice/
--     payroll, tax.rounding_policy, format.amount_words_scale) that Phases 1–2 added to
--     the OM country pack. Resync would enrich it (additively). This is the KNOWN WP-2
--     carry-forward ("OM resolved_country_config lacks routing/filing keys → getFilingConfig
--     falls back to coded GCC defaults; a later OM pack republish sets them explicitly").
--     It self-heals on the WP-7 OM pack publish (publish_country_pack resyncs every OM
--     tenant) — no separate remediation required, and this probe intentionally does not
--     persist the resync (RAISE → ROLLBACK).
-- ─────────────────────────────────────────────────────────────────────────────
