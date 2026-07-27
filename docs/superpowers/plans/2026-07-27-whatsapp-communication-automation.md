# WhatsApp Customer Communication Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant-configurable, Meta-policy-compliant WhatsApp Cloud API automation: per-tenant encrypted credentials, per-event automation toggles, a durable retrying send queue, delivery/read/inbound webhooks, consent management, template studio, message log, and analytics.

**Architecture:** Extend the existing `notification_events` outbox with a WhatsApp dispatcher trigger that enqueues rows into a new `whatsapp_messages` queue/ledger; a pg_cron scanner + pg_net pokes drive the `whatsapp-send` edge worker (claim-before-send, error-classified backoff); a public `whatsapp-webhook` edge receiver (HMAC-verified, two-phase idempotent ledger) records statuses and inbound replies; a user-JWT `whatsapp-admin` edge function handles credentials (Supabase Vault — first live use), connection tests, and template sync. Frontend: a Communications settings module (Connection / Automations / Templates), consent capture, case-thread integration, message log + analytics.

**Tech Stack:** Postgres 15 (Supabase) + pg_cron + pg_net + Supabase Vault, Deno edge functions (`npm:@supabase/supabase-js@2`, Web Crypto), React 18 + TS + TanStack Query v5 + Tailwind tokens + Recharts, Meta Graph API **v25.0**.

**Companion design spec:** `docs/superpowers/specs/2026-07-27-whatsapp-communication-automation-design.md` — read it first; it holds the research digest, event catalog, and all architecture rationale.

**Ground rules for every task**
- Migrations are applied ONLY via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), then `database.types.ts` regenerated via `mcp__supabase__generate_typescript_types` and saved to `src/types/database.types.ts`, and a row appended to `supabase/migrations.manifest.md`. Never hand-edit generated types. Additive-only (no DROP/hard delete). Schema-change PRs use `.github/PULL_REQUEST_TEMPLATE/migration.md`.
- Every new tenant-scoped table gets the full kit: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, `ENABLE`+`FORCE ROW LEVEL SECURITY`, RESTRICTIVE isolation policy with `(SELECT ...)`-wrapped helpers (InitPlan rule), `set_tenant_and_audit_fields` trigger, `idx_<table>_tenant_id ... WHERE deleted_at IS NULL`, `deleted_at` soft delete.
- Edge functions: no `_shared/` (duplicate helpers per function — house style), `Deno.serve`, `jsr:@supabase/functions-js/edge-runtime.d.ts` shim, `npm:@supabase/supabase-js@2`, CORS allowlist (never `*`) + `Vary: Origin`, error envelope `{error}`, secrets via `Deno.env.get`.
- UI: semantic tokens only (no purple/indigo/violet, no raw hexes), lucide-react icons, `maybeSingle()`, query keys in `src/lib/queryKeys.ts`, permission gating per house patterns.
- Run `npx tsc --noEmit` (must stay at 0 errors) and the relevant vitest suites before every commit.

---

## Phase 0 — Schema, Vault, dispatcher (ships dormant)

### Task 1: Migration `whatsapp_core_tables` — tables, RLS, Vault RPCs

**Files:**
- Migration (via MCP): name `whatsapp_core_tables`
- No repo files in this task (types regen happens in Task 3)

- [ ] **Step 1: Introspect prerequisites**

Run via `mcp__supabase__execute_sql` (project_id `ssmbegiyjivrcwgcqutu`):

```sql
select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');
select proname from pg_proc where proname in ('set_tenant_and_audit_fields','emit_notification_event','tenant_feature_enabled','log_case_communication','get_system_setting','check_rate_limit');
```

Expected: `pg_cron`, `pg_net` present (live since 20260526051941 / 20260525082709); all five functions present. If `supabase_vault` is absent, it is enabled on Supabase hosted projects by default under schema `vault` — verify with `select * from pg_available_extensions where name='supabase_vault';` and `create extension if not exists supabase_vault;` inside the migration if needed.

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` with name `whatsapp_core_tables` and this SQL:

```sql
-- =============================================================
-- WhatsApp Communication Automation — core tables (v1, dormant)
-- Spec: docs/superpowers/specs/2026-07-27-whatsapp-communication-automation-design.md
-- =============================================================

-- ---------- 1. whatsapp_integrations ----------
CREATE TABLE whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'), -- webhook URL routing key
  integration_mode text NOT NULL DEFAULT 'byo' CHECK (integration_mode IN ('byo','tech_provider')),
  app_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  graph_api_version text NOT NULL DEFAULT 'v25.0',
  webhook_verify_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  access_token_secret_id uuid,   -- vault.secrets id; column grants revoked below
  app_secret_secret_id uuid,     -- vault.secrets id; column grants revoked below
  is_enabled boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'disconnected'
    CHECK (connection_status IN ('disconnected','connected','error','token_invalid','quality_paused')),
  webhook_status text NOT NULL DEFAULT 'unverified'
    CHECK (webhook_status IN ('unverified','verified','receiving')),
  quality_rating text,           -- GREEN | YELLOW | RED | UNKNOWN
  messaging_limit_tier text,
  name_status text,
  token_valid boolean,
  token_expires_at timestamptz,  -- NULL = never
  send_paused_until timestamptz, -- 131048 quality pause
  last_health_check_at timestamptz,
  last_webhook_at timestamptz,
  health_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_integrations_tenant ON whatsapp_integrations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_integrations_tenant_id ON whatsapp_integrations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_integrations_phone_number_id ON whatsapp_integrations(phone_number_id) WHERE deleted_at IS NULL;

-- ---------- 2. whatsapp_templates ----------
CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,             -- meta name: lowercase snake, unique per (name, language) at Meta
  language text NOT NULL,         -- e.g. en, en_US, ar
  category text NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  parameter_format text NOT NULL DEFAULT 'named' CHECK (parameter_format IN ('named','positional')),
  components jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Meta component array (HEADER/BODY/FOOTER/BUTTONS)
  variable_map jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"customer_name":"customer.name", ...}
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  quality_score text,             -- GREEN | YELLOW | RED | UNKNOWN
  rejection_reason text,
  event_key text,                 -- automation event this template serves (nullable = ad-hoc)
  is_fallback boolean NOT NULL DEFAULT false, -- language fallback for its event_key
  version int NOT NULL DEFAULT 1,
  superseded_by uuid REFERENCES whatsapp_templates(id),
  last_synced_at timestamptz,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_templates_identity
  ON whatsapp_templates(tenant_id, name, language, version) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_templates_tenant_id ON whatsapp_templates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_templates_event ON whatsapp_templates(tenant_id, event_key)
  WHERE deleted_at IS NULL AND event_key IS NOT NULL;

-- ---------- 3. whatsapp_automation_rules ----------
CREATE TABLE whatsapp_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_key text NOT NULL,        -- catalog: spec §3 (e.g. 'case.phase_changed:ready', 'quote.sent')
  enabled boolean NOT NULL DEFAULT false,
  template_id uuid REFERENCES whatsapp_templates(id),
  required_consent text NOT NULL DEFAULT 'utility' CHECK (required_consent IN ('utility','marketing')),
  delay_minutes int NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0 AND delay_minutes <= 20160),
  send_window text NOT NULL DEFAULT 'any' CHECK (send_window IN ('any','business_hours')),
  business_hours jsonb NOT NULL DEFAULT '{"start":"08:00","end":"20:00","days":[1,2,3,4,5,6]}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"exclude_manual_override": true}
  reminder_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"after_days":3,"repeat_max":2,"repeat_every_days":4}
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_rules_event ON whatsapp_automation_rules(tenant_id, event_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_automation_rules_tenant_id ON whatsapp_automation_rules(tenant_id) WHERE deleted_at IS NULL;

-- ---------- 4. whatsapp_contacts ----------
CREATE TABLE whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers_enhanced(id),
  wa_id text,                      -- Meta's normalized id (digits)
  phone_e164 text NOT NULL,
  profile_name text,
  service_window_expires_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  marketing_suppressed_until timestamptz,  -- error 131049
  opt_out_all boolean NOT NULL DEFAULT false,
  unreachable boolean NOT NULL DEFAULT false, -- error 131026
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_contacts_phone ON whatsapp_contacts(tenant_id, phone_e164) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_contacts_tenant_id ON whatsapp_contacts(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_contacts_customer ON whatsapp_contacts(tenant_id, customer_id) WHERE deleted_at IS NULL;

-- ---------- 5. whatsapp_consents (append-only) ----------
CREATE TABLE whatsapp_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers_enhanced(id),
  scope text NOT NULL CHECK (scope IN ('utility','marketing')),
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  source text NOT NULL CHECK (source IN ('intake_form','staff','portal','inbound_message','import')),
  consent_text text,
  phone_e164 text,
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_whatsapp_consents_tenant_id ON whatsapp_consents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_consents_customer ON whatsapp_consents(tenant_id, customer_id, scope, occurred_at DESC)
  WHERE deleted_at IS NULL;
REVOKE UPDATE, DELETE ON whatsapp_consents FROM authenticated, anon;

-- Append-only guard (house prevent_audit_mutation pattern), with a sanctioned
-- transaction-local carve-out used ONLY by the GDPR anonymize cascade (Task 17),
-- which nulls phone/consent_text but keeps the event skeleton (Art. 17(3)(e)).
CREATE OR REPLACE FUNCTION guard_whatsapp_consents_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.allow_consent_anonymize', true) = 'true' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'whatsapp_consents is append-only';
END $$;
CREATE TRIGGER trg_guard_whatsapp_consents_mutation BEFORE UPDATE OR DELETE ON whatsapp_consents
  FOR EACH ROW EXECUTE FUNCTION guard_whatsapp_consents_mutation();

-- ---------- 6. whatsapp_messages (queue + ledger) ----------
CREATE TABLE whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','delivered','read','failed','cancelled','skipped')),
  message_kind text NOT NULL DEFAULT 'template' CHECK (message_kind IN ('template','session_text','session_media')),
  priority smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),  -- 1 = staff manual sends, 5 = automation
  event_key text,
  notification_event_id uuid,
  dedup_key text,
  template_id uuid REFERENCES whatsapp_templates(id),
  template_name text,
  template_language text,
  rendered_params jsonb,          -- frozen at send
  body_preview text,              -- human-readable rendered body (log / case tab)
  session_body text,              -- for manual session_text sends
  customer_id uuid REFERENCES customers_enhanced(id),
  contact_id uuid REFERENCES whatsapp_contacts(id),
  to_phone_e164 text,
  wa_id text,
  case_id uuid REFERENCES cases(id),
  quote_id uuid REFERENCES quotes(id),
  invoice_id uuid REFERENCES invoices(id),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  last_error_code int,
  last_error text,
  skip_reason text,               -- consent_missing | opted_out | unreachable | us_marketing_paused | no_phone | no_template
  wamid text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  pricing_billable boolean,
  pricing_category text,
  pricing_type text,
  conversation_id text,
  initiated_by uuid,              -- staff user for manual sends; NULL = automation
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_messages_dedup ON whatsapp_messages(tenant_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_whatsapp_messages_wamid ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX idx_whatsapp_messages_due ON whatsapp_messages(scheduled_for)
  WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_retry ON whatsapp_messages(next_attempt_at)
  WHERE status = 'pending' AND next_attempt_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_case ON whatsapp_messages(tenant_id, case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_customer ON whatsapp_messages(tenant_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_messages_created ON whatsapp_messages(tenant_id, created_at) WHERE deleted_at IS NULL;

-- ---------- 7. whatsapp_inbound_messages ----------
CREATE TABLE whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wamid text NOT NULL,
  contact_id uuid REFERENCES whatsapp_contacts(id),
  customer_id uuid REFERENCES customers_enhanced(id),
  case_id uuid REFERENCES cases(id),
  in_reply_to_message_id uuid REFERENCES whatsapp_messages(id),
  message_type text NOT NULL,
  body text,
  media_id text,
  media_mime text,
  button_payload text,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  handled text NOT NULL DEFAULT 'none'
    CHECK (handled IN ('none','stop','start','button','staff_notified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_whatsapp_inbound_wamid ON whatsapp_inbound_messages(wamid);
CREATE INDEX idx_whatsapp_inbound_messages_tenant_id ON whatsapp_inbound_messages(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_inbound_case ON whatsapp_inbound_messages(tenant_id, case_id) WHERE deleted_at IS NULL;

-- ---------- 8. whatsapp_webhook_events (idempotency ledger; service-role writes) ----------
CREATE TABLE whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,   -- sha256 hex of raw body
  tenant_id uuid REFERENCES tenants(id),    -- nullable until resolved
  field text,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_whatsapp_webhook_events_tenant ON whatsapp_webhook_events(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whatsapp_webhook_events_unprocessed ON whatsapp_webhook_events(created_at)
  WHERE processed_at IS NULL AND deleted_at IS NULL;

-- ---------- RLS: full tenant kit ----------
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'whatsapp_integrations','whatsapp_templates','whatsapp_automation_rules',
    'whatsapp_contacts','whatsapp_consents','whatsapp_messages','whatsapp_inbound_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO authenticated
         USING (tenant_id = (SELECT get_current_tenant_id()) OR (SELECT is_platform_admin()))',
      t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (deleted_at IS NULL)',
      t || '_select', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_tenant_and_audit_fields()',
      'set_' || t || '_tenant_and_audit', t);
  END LOOP;
END $rls$;

-- Staff write policies (admin-managed config; staff-visible operational rows)
CREATE POLICY whatsapp_integrations_admin_write ON whatsapp_integrations
  FOR ALL TO authenticated
  USING ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()));
CREATE POLICY whatsapp_templates_admin_write ON whatsapp_templates
  FOR ALL TO authenticated
  USING ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()));
CREATE POLICY whatsapp_automation_rules_admin_write ON whatsapp_automation_rules
  FOR ALL TO authenticated
  USING ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_tenant_admin()) OR (SELECT is_platform_admin()));
CREATE POLICY whatsapp_consents_staff_insert ON whatsapp_consents
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_staff_user()));
-- whatsapp_messages is the permanent delivery ledger (provable-delivery evidence).
-- Per-operation policies, house pattern: staff insert (manual sends) + limited update;
-- DELETE is admin-only (and soft-delete-only per the Do-Not list).
CREATE POLICY whatsapp_messages_staff_insert ON whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_staff_user()));
CREATE POLICY whatsapp_messages_staff_update ON whatsapp_messages
  FOR UPDATE TO authenticated
  USING ((SELECT is_staff_user())) WITH CHECK ((SELECT is_staff_user()));
CREATE POLICY whatsapp_messages_admin_delete ON whatsapp_messages
  FOR DELETE TO authenticated USING ((SELECT has_role('admin')));
CREATE POLICY whatsapp_contacts_staff_insert ON whatsapp_contacts
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_staff_user()));
CREATE POLICY whatsapp_contacts_staff_update ON whatsapp_contacts
  FOR UPDATE TO authenticated
  USING ((SELECT is_staff_user())) WITH CHECK ((SELECT is_staff_user()));

-- Delivery evidence is immutable from end-user sessions: staff may only retry a
-- failed row, cancel a pending row, or soft-delete. Service-role/cron paths
-- (auth.uid() IS NULL) bypass — they maintain the delivery fields.
CREATE OR REPLACE FUNCTION guard_whatsapp_message_staff_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'failed'  AND NEW.status = 'pending')
    OR (OLD.status = 'pending' AND NEW.status = 'cancelled')
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'whatsapp_messages: staff sessions may only retry, cancel, or archive';
  END IF;
  IF NEW.wamid IS DISTINCT FROM OLD.wamid
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
     OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
     OR NEW.read_at IS DISTINCT FROM OLD.read_at
     OR NEW.pricing_category IS DISTINCT FROM OLD.pricing_category
     OR NEW.pricing_billable IS DISTINCT FROM OLD.pricing_billable THEN
    RAISE EXCEPTION 'whatsapp_messages: delivery evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_whatsapp_message_staff_update BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION guard_whatsapp_message_staff_update();

-- webhook events: platform admin read only (service role bypasses RLS for writes)
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_webhook_events_platform_read ON whatsapp_webhook_events
  FOR SELECT TO authenticated USING ((SELECT is_platform_admin()));

-- Secret-id columns: a column-level REVOKE is a NO-OP while a table-level grant
-- exists (Postgres semantics), so revoke the table grant and re-grant explicit
-- column lists that exclude the two vault ids. authenticated gets no INSERT/DELETE
-- at all — integration rows are created/rotated only via the credential RPC.
REVOKE ALL ON whatsapp_integrations FROM authenticated, anon;
GRANT SELECT (id, tenant_id, public_id, integration_mode, app_id, waba_id, phone_number_id,
  display_phone_number, verified_name, graph_api_version, webhook_verify_token, is_enabled,
  connection_status, webhook_status, quality_rating, messaging_limit_tier, name_status,
  token_valid, token_expires_at, send_paused_until, last_health_check_at, last_webhook_at,
  health_errors, created_by, updated_by, created_at, updated_at, deleted_at)
  ON whatsapp_integrations TO authenticated;
GRANT UPDATE (is_enabled, updated_at, updated_by) ON whatsapp_integrations TO authenticated;

-- ---------- Consent state helper ----------
-- SECURITY DEFINER bypasses RLS, so end-user callers MUST be pinned to their own
-- tenant; service-role callers (no auth.uid()) are unrestricted.
CREATE OR REPLACE FUNCTION whatsapp_consent_state(p_tenant_id uuid, p_customer_id uuid)
RETURNS TABLE (scope text, opted_in boolean, occurred_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_tenant_id IS DISTINCT FROM (SELECT get_current_tenant_id())
     AND NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'whatsapp_consent_state: tenant mismatch';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (c.scope) c.scope, (c.action = 'opt_in') AS opted_in, c.occurred_at
  FROM whatsapp_consents c
  WHERE c.tenant_id = p_tenant_id AND c.customer_id = p_customer_id AND c.deleted_at IS NULL
  ORDER BY c.scope, c.occurred_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION whatsapp_consent_state(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION whatsapp_consent_state(uuid, uuid) TO authenticated, service_role;

-- ---------- Vault credential RPCs (service_role only; edge fns gate callers) ----------
CREATE OR REPLACE FUNCTION whatsapp_store_credentials(
  p_tenant_id uuid, p_app_id text, p_waba_id text, p_phone_number_id text,
  p_display_phone_number text, p_access_token text, p_app_secret text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row whatsapp_integrations%ROWTYPE;
  v_token_id uuid; v_secret_id uuid;
BEGIN
  SELECT * INTO v_row FROM whatsapp_integrations
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF v_row.id IS NULL THEN
    INSERT INTO whatsapp_integrations (tenant_id) VALUES (p_tenant_id) RETURNING * INTO v_row;
  END IF;

  -- Secret NAMES key on the integration row id, not the tenant id: vault names are
  -- unique, and a disconnect/reconnect cycle (soft-deleted row → new row) must not
  -- collide with an orphaned secret from the old row.
  IF v_row.access_token_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_row.access_token_secret_id, p_access_token);
    v_token_id := v_row.access_token_secret_id;
  ELSE
    v_token_id := vault.create_secret(p_access_token, 'wa_token_' || v_row.id::text);
  END IF;
  IF v_row.app_secret_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_row.app_secret_secret_id, p_app_secret);
    v_secret_id := v_row.app_secret_secret_id;
  ELSE
    v_secret_id := vault.create_secret(p_app_secret, 'wa_appsecret_' || v_row.id::text);
  END IF;

  UPDATE whatsapp_integrations SET
    app_id = p_app_id, waba_id = p_waba_id, phone_number_id = p_phone_number_id,
    display_phone_number = COALESCE(p_display_phone_number, display_phone_number),
    access_token_secret_id = v_token_id, app_secret_secret_id = v_secret_id,
    connection_status = 'connected', token_valid = true, updated_at = now()
  WHERE id = v_row.id;

  BEGIN
    -- p_new_values is jsonb — pass the object directly (a ::text cast matches no overload)
    PERFORM log_audit_trail('whatsapp_integrations', v_row.id, 'credentials_stored',
      NULL, jsonb_build_object('phone_number_id', p_phone_number_id, 'waba_id', p_waba_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_row.id;
END $$;
REVOKE EXECUTE ON FUNCTION whatsapp_store_credentials(uuid,text,text,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION whatsapp_store_credentials(uuid,text,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION whatsapp_reveal_credentials(p_tenant_id uuid)
RETURNS TABLE (access_token text, app_secret text, app_id text, waba_id text,
               phone_number_id text, graph_api_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row whatsapp_integrations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM whatsapp_integrations
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF v_row.id IS NULL OR v_row.access_token_secret_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT t.decrypted_secret, s.decrypted_secret,
         v_row.app_id, v_row.waba_id, v_row.phone_number_id, v_row.graph_api_version
  FROM vault.decrypted_secrets t, vault.decrypted_secrets s
  WHERE t.id = v_row.access_token_secret_id AND s.id = v_row.app_secret_secret_id;
END $$;
REVOKE EXECUTE ON FUNCTION whatsapp_reveal_credentials(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION whatsapp_reveal_credentials(uuid) TO service_role;
```

- [ ] **Step 3: Verify**

Via `mcp__supabase__execute_sql`:

```sql
select relname, relrowsecurity, relforcerowsecurity from pg_class
 where relname like 'whatsapp\_%' escape '\' order by 1;
select polname, polpermissive from pg_policy p join pg_class c on c.oid=p.polrelid
 where c.relname='whatsapp_messages';
select whatsapp_consent_state('00000000-0000-0000-0000-000000000000'::uuid,
                              '00000000-0000-0000-0000-000000000000'::uuid);
-- Vault smoke: SECURITY DEFINER reveal must actually decrypt (owner-grant check)
select whatsapp_store_credentials('00000000-0000-0000-0000-000000000000'::uuid,
  'app','waba','pn','+10000000000','tok-smoke','sec-smoke');
select access_token is not null as ok from whatsapp_reveal_credentials(
  '00000000-0000-0000-0000-000000000000'::uuid);
```

Expected: 8 tables, all `t`/`t` for RLS; a RESTRICTIVE `whatsapp_messages_tenant_isolation` policy; the consent call returns 0 rows (not an error); the reveal smoke returns `ok = true` (this proves the function owner keeps its `vault.decrypted_secrets` grant on this project — if it fails, stop and fix grants before proceeding). Delete the smoke rows afterwards (`update whatsapp_integrations set deleted_at = now() where tenant_id = '00000000-0000-0000-0000-000000000000';` — note the zero-uuid tenant must exist on a branch DB or use a real staging tenant id).

- [ ] **Step 4: Append to the migration manifest and commit**

Add a row to `supabase/migrations.manifest.md` (follow the file's existing format) describing `whatsapp_core_tables`, then:

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(whatsapp): core tables, RLS kit, Vault credential RPCs (dormant)"
```

### Task 2: Migration `whatsapp_dispatch_and_emitters` — dispatcher, emitters, scanner, cron

**Files:**
- Migration (via MCP): name `whatsapp_dispatch_and_emitters`

**Pre-flight introspection (do not skip):** the live DB is the source of truth and two behaviors this migration depends on are not in the repo:

```sql
select pg_get_functiondef('emit_notification_event(text,text,uuid,jsonb,text)'::regprocedure);
-- (a) confirm how it handles a duplicate (tenant_id, dedup_key) — the emitters below
--     defensively catch unique_violation in case it raises instead of swallowing;
-- (b) confirm how it resolves tenant_id (payload/entity vs auth context) — the cron
--     scanners below run with NO auth context and rely on entity-derived tenant.
select pg_get_functiondef('set_tenant_and_audit_fields()'::regprocedure);
-- confirm the cross-tenant guard exemptions: is_platform_admin() OR jwt role
-- 'service_role' OR the transaction-local GUC app.bypass_tenant_guard (house
-- precedent: manifest rows 20260530051557, 20260610043346). The dispatcher below
-- sets that GUC because pg_cron-driven emissions have no JWT at all.
select column_name from information_schema.columns
 where table_name in ('quotes','invoices','inventory_parts_usage')
 order by table_name, column_name;
-- quotes/invoices use total_amount (NOT total); verify inventory_parts_usage has
-- (tenant_id, case_id) before wiring the parts emitter — adjust if the linkage differs.
```

- [ ] **Step 1: Apply the migration**

```sql
-- =============================================================
-- WhatsApp dispatch trigger, event emitters, queue scanner, cron
-- =============================================================

-- ---------- quotes.sent_at (closes the client-side best-effort hole FOR ALL TENANTS) ----------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Unconditional stamp: independent of WhatsApp so every tenant gets DB-side sent_at.
CREATE OR REPLACE FUNCTION stamp_quote_sent_at() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_stamp_quote_sent_at BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION stamp_quote_sent_at();

-- NOTE: case_follow_ups.channel is NOT widened. WhatsApp follow-ups ride the existing
-- channel='internal' rows: process_due_case_follow_ups already emits case.follow_up_due
-- for them, and the dispatcher below consumes that event. (Widening the CHECK would
-- leave 'whatsapp' rows matching neither branch of the untouched follow-up scanner.)

-- ---------- Phone-match helper (webhook inbound correlation; stored numbers are unnormalized) ----------
CREATE OR REPLACE FUNCTION whatsapp_match_customer_by_phone(p_tenant_id uuid, p_last9 text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM customers_enhanced
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    AND (regexp_replace(COALESCE(whatsapp_number, ''), '\D', '', 'g') LIKE '%' || p_last9
      OR regexp_replace(COALESCE(mobile_number, ''), '\D', '', 'g') LIKE '%' || p_last9
      OR regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE '%' || p_last9)
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION whatsapp_match_customer_by_phone(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION whatsapp_match_customer_by_phone(uuid, text) TO service_role;

-- ---------- Business-hours window helper ----------
CREATE OR REPLACE FUNCTION whatsapp_apply_send_window(
  p_tenant_id uuid, p_send_window text, p_business_hours jsonb, p_ts timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text; v_start time; v_end time; v_days int[]; v_probe timestamptz; i int;
BEGIN
  IF p_send_window IS DISTINCT FROM 'business_hours' THEN RETURN p_ts; END IF;
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM tenants WHERE id = p_tenant_id;
  v_start := COALESCE((p_business_hours->>'start')::time, time '08:00');
  v_end   := COALESCE((p_business_hours->>'end')::time,  time '20:00');
  v_days  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_business_hours->'days')::int),
                      ARRAY[1,2,3,4,5,6]);   -- ISO dow, 1=Mon..7=Sun
  v_probe := p_ts;
  FOR i IN 0..8 LOOP  -- at most 8 day-steps to find a working day
    IF EXTRACT(isodow FROM v_probe AT TIME ZONE v_tz)::int = ANY (v_days)
       AND (v_probe AT TIME ZONE v_tz)::time >= v_start
       AND (v_probe AT TIME ZONE v_tz)::time <  v_end THEN
      RETURN v_probe;
    END IF;
    IF (v_probe AT TIME ZONE v_tz)::time < v_start
       AND EXTRACT(isodow FROM v_probe AT TIME ZONE v_tz)::int = ANY (v_days) THEN
      v_probe := ((v_probe AT TIME ZONE v_tz)::date::timestamp + v_start) AT TIME ZONE v_tz;
    ELSE
      v_probe := (((v_probe AT TIME ZONE v_tz)::date + 1)::timestamp + v_start) AT TIME ZONE v_tz;
    END IF;
  END LOOP;
  RETURN p_ts; -- defensive: never loop forever; send anyway
END $$;
GRANT EXECUTE ON FUNCTION whatsapp_apply_send_window(uuid, text, jsonb, timestamptz) TO service_role;

-- ---------- The dispatcher: notification_events → whatsapp_messages ----------
CREATE OR REPLACE FUNCTION dispatch_notification_event_whatsapp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_integration whatsapp_integrations%ROWTYPE;
  v_rule whatsapp_automation_rules%ROWTYPE;
  v_event_key text;
  v_customer_id uuid;
  v_phone text;
  v_consent_ok boolean;
  v_scheduled timestamptz;
  v_dedup text;
  v_msg_id uuid;
  v_url text; v_key text;
BEGIN
  -- 0. cheap short-circuits, cheapest first
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  -- Customer-visible transitions emit BOTH case.phase_changed AND
  -- case.phase_changed.customer for the SAME transition (v1.3.0 RPCs). Handle only
  -- the base event so one transition can never enqueue two customer messages.
  IF NEW.event_type = 'case.phase_changed.customer' THEN RETURN NEW; END IF;

  SELECT * INTO v_integration FROM whatsapp_integrations
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL
     AND is_enabled AND connection_status = 'connected';
  IF v_integration.id IS NULL THEN RETURN NEW; END IF;

  -- Master switch is default-OFF. tenant_feature_enabled() fails OPEN on a missing
  -- key, so read the flag with default-false semantics instead of using it.
  IF COALESCE((SELECT (feature_flags->>'automation.whatsapp')::boolean
                 FROM tenants WHERE id = NEW.tenant_id), false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- 1. effective event key (phase-changes expand on to_phase)
  v_event_key := NEW.event_type;
  IF NEW.event_type = 'case.phase_changed' THEN
    v_event_key := 'case.phase_changed:' || COALESCE(NEW.payload->>'to_phase', '');
  END IF;

  SELECT * INTO v_rule FROM whatsapp_automation_rules
   WHERE tenant_id = NEW.tenant_id AND event_key = v_event_key
     AND enabled AND deleted_at IS NULL;
  IF v_rule.id IS NULL OR v_rule.template_id IS NULL THEN RETURN NEW; END IF;

  IF (v_rule.conditions->>'exclude_manual_override')::boolean IS TRUE
     AND (NEW.payload->>'manual_override')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  -- 2. recipient
  v_customer_id := NULLIF(NEW.payload->>'customer_id', '')::uuid;
  IF v_customer_id IS NULL AND NEW.entity_type = 'case' THEN
    SELECT customer_id INTO v_customer_id FROM cases WHERE id = NEW.entity_id;
  END IF;
  IF v_customer_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(whatsapp_number,''), NULLIF(mobile_number,''), NULLIF(phone,''))
    INTO v_phone FROM customers_enhanced WHERE id = v_customer_id AND deleted_at IS NULL;
  IF v_phone IS NULL THEN RETURN NEW; END IF;

  -- 3. consent (required scope from the rule). Inlined rather than calling
  -- whatsapp_consent_state(): that helper enforces a caller-tenant check that can
  -- misfire under portal-JWT session contexts (e.g. approve_quote fired from the
  -- customer portal) — the dispatcher must behave identically in every context.
  SELECT (c.action = 'opt_in') INTO v_consent_ok
    FROM whatsapp_consents c
   WHERE c.tenant_id = NEW.tenant_id AND c.customer_id = v_customer_id
     AND c.scope = v_rule.required_consent AND c.deleted_at IS NULL
   ORDER BY c.occurred_at DESC LIMIT 1;
  IF v_consent_ok IS NOT TRUE THEN RETURN NEW; END IF;

  -- 4. schedule (delay + business window)
  v_scheduled := whatsapp_apply_send_window(
    NEW.tenant_id, v_rule.send_window, v_rule.business_hours,
    now() + make_interval(mins => v_rule.delay_minutes));

  -- 5. enqueue. Dedup key is STABLE BUSINESS IDENTITY (never the source event's
  -- dedup_key, which differs between sibling emissions of one transition).
  -- ON CONFLICT bumps the schedule of a still-pending row — this is the debounce
  -- that collapses a multi-device intake into ONE receipt listing all devices.
  v_dedup := 'wa:' || v_event_key || ':' || COALESCE(NEW.entity_id::text, NEW.id::text)
             || ':' || to_char(now(), 'YYYY-MM-DD');

  -- pg_cron-driven emissions carry no JWT: sanction this insert for the event's
  -- tenant via the house GUC (precedent: 20260530051557, 20260610043346).
  PERFORM set_config('app.bypass_tenant_guard', 'true', true);
  INSERT INTO whatsapp_messages (
    tenant_id, event_key, notification_event_id, dedup_key, template_id,
    customer_id, to_phone_e164, priority,
    case_id, quote_id, invoice_id, scheduled_for
  ) VALUES (
    NEW.tenant_id, v_event_key, NEW.id, v_dedup,
    v_rule.template_id, v_customer_id, v_phone, 5,
    CASE WHEN NEW.entity_type = 'case'    THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'case_id','')::uuid END,
    CASE WHEN NEW.entity_type = 'quote'   THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'quote_id','')::uuid END,
    CASE WHEN NEW.entity_type = 'invoice' THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'invoice_id','')::uuid END,
    v_scheduled
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, updated_at = now()
  WHERE whatsapp_messages.status = 'pending'
  RETURNING id INTO v_msg_id;
  PERFORM set_config('app.bypass_tenant_guard', '', true);

  -- 6. instant poke (best effort; the cron sweep is the guarantee)
  IF v_msg_id IS NOT NULL AND v_scheduled <= now() THEN
    v_url := get_system_setting('edge_function_base_url');
    v_key := get_system_setting('edge_function_service_key');
    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url || '/whatsapp-send',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
        body := jsonb_build_object('message_id', v_msg_id));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_tenant_guard', '', true);
  RAISE WARNING 'dispatch_notification_event_whatsapp failed for event %: %', NEW.id, SQLERRM;
  RETURN NEW;  -- NEVER block the business transaction
END $$;

CREATE TRIGGER trg_dispatch_notification_event_whatsapp
  AFTER INSERT ON notification_events
  FOR EACH ROW EXECUTE FUNCTION dispatch_notification_event_whatsapp();

-- ---------- New event emitters ----------
-- Every emitter: (a) EXCEPTION-wrapped so a WhatsApp defect can never fail a business
-- write; (b) each PERFORM emit_notification_event additionally catches unique_violation
-- in case the live emit fn raises on duplicate dedup keys (see pre-flight); (c) gated
-- on whatsapp_tenant_active() so tenants without a connected integration pay one
-- indexed EXISTS and emit nothing (the subscription-blind email-trigger defect is not
-- copied); (d) app.importing-guarded.
CREATE OR REPLACE FUNCTION whatsapp_tenant_active(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_integrations
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND is_enabled AND connection_status = 'connected');
$$;

CREATE OR REPLACE FUNCTION whatsapp_safe_emit(
  p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb, p_dedup_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM emit_notification_event(p_event_type, p_entity_type, p_entity_id, p_payload, p_dedup_key);
EXCEPTION WHEN unique_violation THEN
  NULL;  -- duplicate dedup key = already emitted; fine
END $$;

CREATE OR REPLACE FUNCTION emit_case_created_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  PERFORM whatsapp_safe_emit('case.created', 'case', NEW.id,
    jsonb_build_object('case_id', NEW.id, 'case_number', NEW.case_number,
                       'customer_id', NEW.customer_id, 'priority', NEW.priority),
    'case.created:' || NEW.id::text);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_case_created_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_case_created AFTER INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION emit_case_created_event();

CREATE OR REPLACE FUNCTION emit_device_received_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case cases%ROWTYPE; v_tz text;
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM cases WHERE id = NEW.case_id;
  IF v_case.id IS NULL OR v_case.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM tenants WHERE id = NEW.tenant_id;
  -- One event per DEVICE (so each arrival re-triggers the dispatcher), but the
  -- dispatcher's stable per-case-per-day dedup + pending-row schedule bump collapse
  -- them into ONE receipt whose device.summary is rendered AT SEND TIME with every
  -- device present. Day bucket is tenant-local, not UTC. Pair this with the
  -- catalog's 15-minute default delay on case.device_received (the debounce window).
  PERFORM whatsapp_safe_emit('case.device_received', 'case', NEW.case_id,
    jsonb_build_object('case_id', NEW.case_id, 'case_number', v_case.case_number,
                       'customer_id', v_case.customer_id, 'device_id', NEW.id,
                       'serial_number', NEW.serial_number, 'model', NEW.model),
    'case.device_received:' || NEW.case_id::text || ':' || NEW.id::text || ':' ||
      to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD'));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_device_received_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_device_received AFTER INSERT ON case_devices
  FOR EACH ROW EXECUTE FUNCTION emit_device_received_event();

-- AFTER trigger (the design's shape): quote rows exist when the dispatcher enqueues,
-- so the whatsapp_messages.quote_id FK is satisfiable. sent_at stamping lives in the
-- separate unconditional BEFORE trigger above.
CREATE OR REPLACE FUNCTION emit_quote_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := CASE WHEN NEW.status = 'sent' THEN 'quote.sent' ELSE 'quote.created' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status
      WHEN 'sent' THEN 'quote.sent'
      WHEN 'accepted' THEN 'quote.approved'   -- canonical v1.3.0 vocabulary
      WHEN 'rejected' THEN 'quote.rejected'
      ELSE NULL END;
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;

  PERFORM whatsapp_safe_emit(v_event, 'quote', NEW.id,
    jsonb_build_object('quote_id', NEW.id, 'quote_number', NEW.quote_number,
                       'case_id', NEW.case_id, 'customer_id', NEW.customer_id,
                       'total', NEW.total_amount, 'currency', NEW.currency,
                       'valid_until', NEW.valid_until),
    v_event || ':' || NEW.id::text);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_quote_events: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_quote_events AFTER INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION emit_quote_events();

CREATE OR REPLACE FUNCTION emit_invoice_issued_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.status = 'sent')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM whatsapp_safe_emit('invoice.issued', 'invoice', NEW.id,
      jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number,
                         'case_id', NEW.case_id, 'customer_id', NEW.customer_id,
                         'total', NEW.total_amount, 'balance_due', NEW.balance_due,
                         'currency', NEW.currency, 'due_date', NEW.due_date),
      'invoice.issued:' || NEW.id::text);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_invoice_issued_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_invoice_issued AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION emit_invoice_issued_event();

CREATE OR REPLACE FUNCTION emit_recovery_outcome_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.recovery_outcome IS NULL THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  PERFORM whatsapp_safe_emit('case.recovery_outcome', 'case', NEW.id,
    jsonb_build_object('case_id', NEW.id, 'case_number', NEW.case_number,
                       'customer_id', NEW.customer_id, 'recovery_outcome', NEW.recovery_outcome),
    -- dedup by value: the three competing writers of recovery_outcome collapse to one event per value
    'case.recovery_outcome:' || NEW.id::text || ':' || NEW.recovery_outcome);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_recovery_outcome_event: %', SQLERRM; RETURN NEW;
END $$;
-- WHEN clause: cases is the hottest table; only outcome changes invoke the function
CREATE TRIGGER trg_emit_recovery_outcome AFTER UPDATE ON cases
  FOR EACH ROW
  WHEN (OLD.recovery_outcome IS DISTINCT FROM NEW.recovery_outcome)
  EXECUTE FUNCTION emit_recovery_outcome_event();

CREATE OR REPLACE FUNCTION emit_case_checkout_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case cases%ROWTYPE;
BEGIN
  IF NEW.action IS DISTINCT FROM 'checkout' THEN RETURN NEW; END IF;
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM cases WHERE id = NEW.case_id;
  PERFORM whatsapp_safe_emit('case.checked_out', 'case', NEW.case_id,
    jsonb_build_object('case_id', NEW.case_id, 'case_number', v_case.case_number,
                       'customer_id', v_case.customer_id, 'details', NEW.details),
    'case.checked_out:' || NEW.id::text);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_case_checkout_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_case_checkout AFTER INSERT ON case_job_history
  FOR EACH ROW EXECUTE FUNCTION emit_case_checkout_event();

-- Parts Ordered: donor/part allocation recorded against a case. Column linkage
-- verified in pre-flight (inventory_parts_usage.tenant_id/case_id) — adjust if the
-- live shape differs.
CREATE OR REPLACE FUNCTION emit_parts_ordered_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case cases%ROWTYPE; v_tz text;
BEGIN
  IF NEW.case_id IS NULL THEN RETURN NEW; END IF;
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM cases WHERE id = NEW.case_id;
  IF v_case.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM tenants WHERE id = NEW.tenant_id;
  PERFORM whatsapp_safe_emit('case.parts_ordered', 'case', NEW.case_id,
    jsonb_build_object('case_id', NEW.case_id, 'case_number', v_case.case_number,
                       'customer_id', v_case.customer_id),
    'case.parts_ordered:' || NEW.case_id::text || ':' ||
      to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD'));  -- one per case per tenant-local day
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_parts_ordered_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_parts_ordered AFTER INSERT ON inventory_parts_usage
  FOR EACH ROW EXECUTE FUNCTION emit_parts_ordered_event();

-- ---------- Queue scanner (pg_cron every minute) ----------
CREATE OR REPLACE FUNCTION process_due_whatsapp_messages()
RETURNS TABLE (dispatched int, reset_stuck int, capped int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text; v_key text; v_row record;
  v_dispatched int := 0; v_reset int := 0; v_capped int := 0;
BEGIN
  v_url := get_system_setting('edge_function_base_url');
  v_key := get_system_setting('edge_function_service_key');
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0; RETURN;  -- dormant until configured
  END IF;

  -- recover rows stuck in 'processing' (worker crash) after 5 minutes
  WITH stuck AS (
    UPDATE whatsapp_messages
       SET status = 'pending', claimed_at = NULL,
           last_error = COALESCE(last_error, 'worker timeout — reset by scanner')
     WHERE status = 'processing' AND claimed_at < now() - interval '5 minutes'
       AND deleted_at IS NULL
     RETURNING 1)
  SELECT count(*) INTO v_reset FROM stuck;

  -- retry-exhausted rows: fail them VISIBLY (never leave pending zombies) + notify staff
  FOR v_row IN
    SELECT id, tenant_id FROM whatsapp_messages
     WHERE status = 'pending' AND attempt_count >= 5 AND deleted_at IS NULL
     LIMIT 100
  LOOP
    UPDATE whatsapp_messages
       SET status = 'failed', failed_at = now(),
           last_error = COALESCE(last_error, '') || ' [retries exhausted]'
     WHERE id = v_row.id AND status = 'pending';
    PERFORM whatsapp_safe_emit('whatsapp.message_failed', 'whatsapp_message', v_row.id,
      jsonb_build_object('reason', 'retries_exhausted'),
      'whatsapp.message_failed:' || v_row.id::text);
    v_capped := v_capped + 1;
  END LOOP;

  -- claim due work. Locking clause lives in the INNERMOST subquery (FOR UPDATE is
  -- illegal in the same SELECT level as a window function); fairness ranking wraps it.
  FOR v_row IN
    SELECT id FROM (
      SELECT c.id, row_number() OVER (PARTITION BY c.tenant_id
                                      ORDER BY c.priority, c.scheduled_for) AS rn
      FROM (
        SELECT m.id, m.tenant_id, m.priority, m.scheduled_for
          FROM whatsapp_messages m
         WHERE m.status = 'pending' AND m.deleted_at IS NULL
           AND m.scheduled_for <= now()
           AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= now())
           AND m.attempt_count < 5
         ORDER BY m.priority, m.scheduled_for
         LIMIT 200
         FOR UPDATE SKIP LOCKED
      ) c
    ) ranked
    WHERE ranked.rn <= 10   -- per-tenant fairness cap per tick
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := v_url || '/whatsapp-send',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
      body := jsonb_build_object('message_id', v_row.id));
    v_dispatched := v_dispatched + 1;
  END LOOP;

  RETURN QUERY SELECT v_dispatched, v_reset, v_capped;
END $$;
REVOKE EXECUTE ON FUNCTION process_due_whatsapp_messages() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_due_whatsapp_messages() TO service_role;

-- ---------- Scheduled reminders scanner (pg_cron every 15 min) ----------
CREATE OR REPLACE FUNCTION process_whatsapp_scheduled_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0; v_rule record; v_target record;
  v_after int; v_repeat_max int; v_every int;
  v_prior int; v_last timestamptz;
BEGIN
  -- quote.reminder: sent N days ago, still awaiting decision, capped + spaced by rule
  FOR v_rule IN
    SELECT r.* FROM whatsapp_automation_rules r
     JOIN whatsapp_integrations i ON i.tenant_id = r.tenant_id
       AND i.deleted_at IS NULL AND i.is_enabled AND i.connection_status = 'connected'
     WHERE r.event_key = 'quote.reminder' AND r.enabled AND r.deleted_at IS NULL
  LOOP
    v_after      := COALESCE((v_rule.reminder_config->>'after_days')::int, 3);
    v_repeat_max := COALESCE((v_rule.reminder_config->>'repeat_max')::int, 2);
    v_every      := COALESCE((v_rule.reminder_config->>'repeat_every_days')::int, 4);
    FOR v_target IN
      SELECT q.id, q.quote_number, q.case_id, q.customer_id, q.total_amount, q.currency
        FROM quotes q
       WHERE q.tenant_id = v_rule.tenant_id AND q.deleted_at IS NULL
         AND q.status = 'sent' AND q.sent_at IS NOT NULL
         AND q.sent_at < now() - make_interval(days => v_after)
    LOOP
      SELECT count(*), max(created_at) INTO v_prior, v_last
        FROM whatsapp_messages
       WHERE tenant_id = v_rule.tenant_id AND event_key = 'quote.reminder'
         AND quote_id = v_target.id AND status <> 'cancelled' AND deleted_at IS NULL;
      CONTINUE WHEN v_prior >= v_repeat_max;                                   -- cap reached
      CONTINUE WHEN v_last IS NOT NULL
              AND v_last > now() - make_interval(days => v_every);             -- spacing
      PERFORM whatsapp_safe_emit('quote.reminder', 'quote', v_target.id,
        jsonb_build_object('quote_id', v_target.id, 'quote_number', v_target.quote_number,
                           'case_id', v_target.case_id, 'customer_id', v_target.customer_id,
                           'total', v_target.total_amount, 'currency', v_target.currency),
        'quote.reminder:' || v_target.id::text || ':' || to_char(now(), 'YYYY-MM-DD'));
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- case.feedback_request / case.review_request: delivered N days ago, once per case ever
  FOR v_rule IN
    SELECT r.* FROM whatsapp_automation_rules r
     JOIN whatsapp_integrations i ON i.tenant_id = r.tenant_id
       AND i.deleted_at IS NULL AND i.is_enabled AND i.connection_status = 'connected'
     WHERE r.event_key IN ('case.feedback_request','case.review_request')
       AND r.enabled AND r.deleted_at IS NULL
  LOOP
    v_after := COALESCE((v_rule.reminder_config->>'after_days')::int, 2);
    FOR v_target IN
      SELECT c.id, c.case_number, c.customer_id FROM cases c
       JOIN master_case_statuses s ON s.id = c.status_id
       WHERE c.tenant_id = v_rule.tenant_id AND c.deleted_at IS NULL
         AND s.type IN ('delivered','closed')
         AND c.actual_completion IS NOT NULL
         AND c.actual_completion::date =
             (now() - make_interval(days => v_after))::date
    LOOP
      PERFORM whatsapp_safe_emit(v_rule.event_key, 'case', v_target.id,
        jsonb_build_object('case_id', v_target.id, 'case_number', v_target.case_number,
                           'customer_id', v_target.customer_id),
        v_rule.event_key || ':' || v_target.id::text);  -- once per case, ever
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'process_whatsapp_scheduled_reminders: %', SQLERRM;
  RETURN v_count;  -- a bad tenant/rule must not kill the whole 15-min scan
END $$;
REVOKE EXECUTE ON FUNCTION process_whatsapp_scheduled_reminders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_whatsapp_scheduled_reminders() TO service_role;

-- ---------- pg_cron schedules (idempotent: unschedule-then-schedule) ----------
DO $cronblock$
BEGIN
  PERFORM cron.unschedule('process-whatsapp-messages')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-whatsapp-messages');
  PERFORM cron.schedule('process-whatsapp-messages', '* * * * *',
    'SELECT process_due_whatsapp_messages();');

  PERFORM cron.unschedule('process-whatsapp-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-whatsapp-reminders');
  PERFORM cron.schedule('process-whatsapp-reminders', '*/15 * * * *',
    'SELECT process_whatsapp_scheduled_reminders();');
END $cronblock$;

-- ---------- Raw-webhook-payload retention (90 days) ----------
CREATE OR REPLACE FUNCTION purge_whatsapp_webhook_payloads()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH purged AS (
    UPDATE whatsapp_webhook_events
       SET payload = '{"purged": true}'::jsonb
     WHERE created_at < now() - interval '90 days'
       AND payload IS DISTINCT FROM '{"purged": true}'::jsonb
     RETURNING 1)
  SELECT count(*)::int FROM purged;
$$;
REVOKE EXECUTE ON FUNCTION purge_whatsapp_webhook_payloads() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_whatsapp_webhook_payloads() TO service_role;
DO $cronblock2$
BEGIN
  PERFORM cron.unschedule('purge-whatsapp-webhook-payloads')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-whatsapp-webhook-payloads');
  PERFORM cron.schedule('purge-whatsapp-webhook-payloads', '45 3 * * *',
    'SELECT purge_whatsapp_webhook_payloads();');
END $cronblock2$;
```

- [ ] **Step 2: Verify**

```sql
select tgname from pg_trigger where tgname like 'trg_emit%' or tgname like 'trg_dispatch%'
   or tgname = 'trg_stamp_quote_sent_at' order by 1;
select jobname, schedule from cron.job where jobname like '%whatsapp%';
select whatsapp_apply_send_window(
  (select id from tenants limit 1), 'business_hours',
  '{"start":"08:00","end":"20:00","days":[1,2,3,4,5]}'::jsonb, now());
```

Expected: 9 triggers (`trg_dispatch_notification_event_whatsapp`, `trg_stamp_quote_sent_at`, `trg_emit_case_created`, `trg_emit_device_received`, `trg_emit_quote_events`, `trg_emit_invoice_issued`, `trg_emit_recovery_outcome`, `trg_emit_case_checkout`, `trg_emit_parts_ordered`); 3 cron jobs; the window function returns a timestamptz.

- [ ] **Step 3: Behavioral smoke tests (branch DB or staging tenant)**

1. **Dormancy**: with no integration row, `emit_notification_event('case.created', 'case', <case-uuid>, '{}'::jsonb, 'smoke-1')` → `whatsapp_messages` stays empty.
2. **Happy path**: insert a `whatsapp_integrations` row (`is_enabled=true, connection_status='connected'`), set `tenants.feature_flags = feature_flags || '{"automation.whatsapp": true}'` (the dispatcher reads this key with default-FALSE semantics — enabling the toggle in Settings is a real precondition), an enabled `case.created` rule with a template, and an opt-in consent row; re-emit with a new dedup key → exactly one `pending` message row.
3. **Cron-context enqueue (the guard trap)**: from a plain SQL session with NO JWT (`select set_config('request.jwt.claims','',false);` in a fresh connection, or via the pg_cron runner), call `process_whatsapp_scheduled_reminders()` against a tenant with an eligible sent quote → the dispatcher's `whatsapp_messages` insert must succeed (the `app.bypass_tenant_guard` GUC covers the `set_tenant_and_audit_fields` cross-tenant check). If this fails, stop and re-read the guard's live definition.
4. **Emitter reality check**: flip a test quote to `status='sent'` and confirm BOTH `quotes.sent_at` is stamped AND a `quote.sent` notification event exists — the emitters' WHEN-OTHERS swallow makes column-name bugs invisible without this assertion.
5. **Double-send guard**: transition a case to a customer-visible status (both `case.phase_changed` + `.customer` events fire) → exactly ONE `whatsapp_messages` row.
Clean up test rows via `deleted_at = now()`.

- [ ] **Step 4: Manifest + commit**

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(whatsapp): event emitters, dispatcher trigger, queue scanner + cron"
```

### Task 3: Regenerate types; feature registry, event catalog, query keys

**Files:**
- Regenerate: `src/types/database.types.ts` (via `mcp__supabase__generate_typescript_types`)
- Create: `src/lib/whatsapp/events.ts`
- Modify: `src/lib/features/registry.ts` (append to the `automation` category)
- Modify: `src/lib/queryKeys.ts` (append `whatsappKeys`)
- Test: `src/lib/whatsapp/events.test.ts`

- [ ] **Step 1: Regenerate `database.types.ts`**

Run `mcp__supabase__generate_typescript_types` (project_id `ssmbegiyjivrcwgcqutu`), save output over `src/types/database.types.ts`. Run `npx tsc --noEmit` — expected 0 errors (new tables are additive).

- [ ] **Step 2: Write the failing test**

`src/lib/whatsapp/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WHATSAPP_EVENT_CATALOG, effectiveEventKey } from './events';

describe('WHATSAPP_EVENT_CATALOG', () => {
  it('contains the full lifecycle catalog with unique keys', () => {
    const keys = WHATSAPP_EVENT_CATALOG.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const required of [
      'case.created', 'case.device_received', 'case.phase_changed:diagnosis',
      'quote.created', 'quote.sent', 'quote.reminder', 'quote.approved', 'quote.rejected',
      'case.phase_changed:recovery', 'case.parts_ordered', 'case.milestone',
      'case.recovery_outcome', 'case.phase_changed:ready',
      'invoice.issued', 'payment.received.customer', 'case.checked_out',
      'case.phase_changed:closed', 'case.phase_changed:no_solution',
      'case.phase_changed:cancelled', 'case.follow_up_due',
      'case.feedback_request', 'case.review_request',
    ]) expect(keys).toContain(required);
  });

  it('debounces multi-device intake with a non-zero default delay', () => {
    const deviceReceived = WHATSAPP_EVENT_CATALOG.find((e) => e.key === 'case.device_received');
    expect(deviceReceived?.defaultDelayMinutes).toBeGreaterThanOrEqual(15);
  });

  it('marks feedback/review as marketing, everything else utility', () => {
    for (const e of WHATSAPP_EVENT_CATALOG) {
      const expected = ['case.feedback_request', 'case.review_request'].includes(e.key)
        ? 'marketing' : 'utility';
      expect(e.requiredConsent, e.key).toBe(expected);
    }
  });
});

describe('effectiveEventKey', () => {
  it('expands phase-change events on to_phase', () => {
    expect(effectiveEventKey('case.phase_changed', { to_phase: 'ready' }))
      .toBe('case.phase_changed:ready');
    expect(effectiveEventKey('case.phase_changed.customer', { to_phase: 'closed' }))
      .toBe('case.phase_changed:closed');
  });
  it('passes other events through', () => {
    expect(effectiveEventKey('quote.sent', {})).toBe('quote.sent');
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`npx vitest run src/lib/whatsapp/events.test.ts` → module not found)

- [ ] **Step 4: Implement `src/lib/whatsapp/events.ts`**

```ts
// WhatsApp automation event catalog. Single source of truth for:
// - Settings → Automations rows (label, stage, defaults)
// - rule seeding (whatsappSettingsService.ensureRules)
// - the dispatcher's event_key vocabulary (mirrored in SQL: dispatch_notification_event_whatsapp)
// Spec: docs/superpowers/specs/2026-07-27-whatsapp-communication-automation-design.md §3

export type WhatsAppConsentScope = 'utility' | 'marketing';

export interface WhatsAppEventDef {
  key: string;                    // rules table event_key
  label: string;                  // Settings label
  stage: string;                  // lifecycle grouping header
  description: string;
  requiredConsent: WhatsAppConsentScope;
  defaultDelayMinutes: number;
  scheduled?: boolean;            // driven by process_whatsapp_scheduled_reminders
  defaultReminderConfig?: { after_days: number };
}

export const WHATSAPP_EVENT_CATALOG: WhatsAppEventDef[] = [
  { key: 'case.created', label: 'Case Registered', stage: 'Intake',
    description: 'Confirmation that the case was created', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.device_received', label: 'Device Check-in Receipt', stage: 'Intake',
    description: 'Receipt when devices are checked in (one message per intake day; the delay debounces multi-device jobs so a 12-drive RAID sends ONE receipt listing all drives)',
    requiredConsent: 'utility', defaultDelayMinutes: 15 },
  { key: 'case.phase_changed:diagnosis', label: 'Accepted for Evaluation', stage: 'Diagnosis',
    description: 'Case moved into diagnosis', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.created', label: 'Quote Generated', stage: 'Quotation',
    description: 'A quote was generated for the case', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.sent', label: 'Quote Sent', stage: 'Quotation',
    description: 'The quote was sent to the customer', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.reminder', label: 'Quote Reminder', stage: 'Quotation',
    description: 'Reminder while a sent quote awaits a decision', requiredConsent: 'utility',
    defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 3 } },
  { key: 'quote.approved', label: 'Quote Approved', stage: 'Quotation',
    description: 'Confirmation after the customer approves', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'quote.rejected', label: 'Quote Declined', stage: 'Quotation',
    description: 'Acknowledgement after the customer declines', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:recovery', label: 'Recovery Started', stage: 'Recovery',
    description: 'Recovery work has begun', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.parts_ordered', label: 'Parts Ordered', stage: 'Recovery',
    description: 'Donor parts allocated to the case (one message per day at most)',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.milestone', label: 'Recovery Progress Update', stage: 'Recovery',
    description: 'Staff-triggered progress update from the case detail (Send progress update action)',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.recovery_outcome', label: 'Recovery Outcome Recorded', stage: 'Recovery',
    description: 'Recovery outcome recorded — starter copy is outcome-neutral and renders {{recovery_outcome}}; per-outcome template overrides are on the roadmap',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:ready', label: 'Ready for Collection', stage: 'Delivery',
    description: 'Recovered data / device ready for collection', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'invoice.issued', label: 'Invoice Issued', stage: 'Billing',
    description: 'A tax invoice was issued', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'payment.received.customer', label: 'Payment Received', stage: 'Billing',
    description: 'Payment receipt confirmation', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.checked_out', label: 'Device Collected', stage: 'Delivery',
    description: 'Checkout confirmation with collector details', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:closed', label: 'Case Closed', stage: 'Closure',
    description: 'The case is closed', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:no_solution', label: 'No Solution — Follow-up Plan', stage: 'Closure',
    description: 'Recovery not currently possible; explains the outcome and the scheduled future review',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.phase_changed:cancelled', label: 'Case Cancelled', stage: 'Closure',
    description: 'Cancellation acknowledged; device-return arrangements',
    requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.follow_up_due', label: 'Follow-up Reminder', stage: 'Follow-up',
    description: 'Scheduled follow-ups incl. pickup and no-solution reviews', requiredConsent: 'utility', defaultDelayMinutes: 0 },
  { key: 'case.feedback_request', label: 'Feedback Request', stage: 'Follow-up',
    description: 'Ask for service feedback after delivery (marketing consent required)',
    requiredConsent: 'marketing', defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 2 } },
  { key: 'case.review_request', label: 'Google Review Request', stage: 'Follow-up',
    description: 'Ask for a public review after delivery (marketing consent required)',
    requiredConsent: 'marketing', defaultDelayMinutes: 0, scheduled: true, defaultReminderConfig: { after_days: 4 } },
];

export function effectiveEventKey(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === 'case.phase_changed' || eventType === 'case.phase_changed.customer') {
    return `case.phase_changed:${String(payload.to_phase ?? '')}`;
  }
  return eventType;
}
```

- [ ] **Step 5: Run tests — expect PASS** (`npx vitest run src/lib/whatsapp/events.test.ts`)

- [ ] **Step 6: Registry + query keys**

In `src/lib/features/registry.ts`, append to the `automation` category (after `automation.case_follow_ups`):

```ts
  {
    key: 'automation.whatsapp',
    label: 'WhatsApp Automation',
    description: 'Automated WhatsApp customer notifications via the Meta Cloud API connection',
    category: 'automation',
    defaultEnabled: false,
  },
```

In `src/lib/queryKeys.ts`, append (house factory style):

```ts
export const whatsappKeys = {
  all: ['whatsapp'] as const,
  integration: () => [...whatsappKeys.all, 'integration'] as const,
  rules: () => [...whatsappKeys.all, 'rules'] as const,
  templates: (filters?: Record<string, unknown>) => [...whatsappKeys.all, 'templates', filters] as const,
  messages: (filters?: Record<string, unknown>) => [...whatsappKeys.all, 'messages', filters] as const,
  byCase: (caseId: string) => [...whatsappKeys.all, 'case', caseId] as const,
  byCustomer: (customerId: string) => [...whatsappKeys.all, 'customer', customerId] as const,
  consents: (customerId: string) => [...whatsappKeys.all, 'consents', customerId] as const,
  analytics: (filters: Record<string, unknown>) => [...whatsappKeys.all, 'analytics', filters] as const,
  stats: () => [...whatsappKeys.all, 'stats'] as const,
};
```

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/types/database.types.ts src/lib/whatsapp/ src/lib/features/registry.ts src/lib/queryKeys.ts
git commit -m "feat(whatsapp): generated types, event catalog, feature flag, query keys"
```

---

## Phase 1 — Edge functions

House rules recap: no `_shared/` — each function keeps a **pure local module** (unit-testable, no Deno globals) plus an `index.ts`; the test files run under `npm run geo:test` (`vitest.config.scripts.ts` picks up `supabase/functions/**/*.test.ts`).

### Task 4: Pure core modules + unit tests

**Files:**
- Create: `supabase/functions/whatsapp-send/waCore.ts`
- Create: `supabase/functions/whatsapp-send/waCore.test.ts`
- Create: `supabase/functions/whatsapp-webhook/webhookCore.ts`
- Create: `supabase/functions/whatsapp-webhook/webhookCore.test.ts`

- [ ] **Step 1: Write the failing tests**

`supabase/functions/whatsapp-send/waCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  classifySendError, computeBackoff, normalizeToE164, resolveTemplateLanguage,
  buildTemplateParams, renderBodyPreview,
} from './waCore';

describe('classifySendError', () => {
  it.each([
    [130429, 'retry'], [131056, 'retry'], [80007, 'retry'], [4, 'retry'],
    [131000, 'retry'], [131016, 'retry'], [131057, 'retry'],
    [131049, 'suppress_marketing'], [131026, 'mark_unreachable'],
    [132001, 'template_broken'], [132000, 'template_broken'], [132015, 'template_broken'],
    [131048, 'integration_quality_pause'], [190, 'integration_token_dead'], [0, 'integration_token_dead'],
    [131031, 'integration_locked'], [131042, 'integration_locked'], [368, 'integration_locked'],
    [100, 'hard_fail'], [131047, 'hard_fail'], [131008, 'hard_fail'],
  ])('code %i → %s', (code, expected) => {
    expect(classifySendError(code).kind).toBe(expected);
  });
  it('unknown codes default to hard_fail with the code preserved', () => {
    const r = classifySendError(999999);
    expect(r.kind).toBe('hard_fail');
  });
});

describe('computeBackoff', () => {
  it('doubles per attempt (1m, 2m, 4m, …), capped at 12h', () => {
    expect(computeBackoff(1)).toBe(60);
    expect(computeBackoff(2)).toBe(120);
    expect(computeBackoff(3)).toBe(240);
    expect(computeBackoff(10)).toBe(30720);      // 60 * 2^9, still under the cap
    expect(computeBackoff(11)).toBe(12 * 3600);  // cap engages
    expect(computeBackoff(20)).toBe(12 * 3600);
  });
});

describe('normalizeToE164', () => {
  it.each([
    ['+971 501234567', '+971501234567'],
    ['00971-50-123-4567', '+971501234567'],
    ['971501234567', '+971501234567'],   // bare international digits, no leading 0
    ['(501) 234-567', null],             // 9 digits, no country prefix → ambiguous → null
    ['0501234567', null],                // leading 0 = local format, country unknown → null
  ])('%s → %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });
  it('rejects garbage', () => {
    expect(normalizeToE164('abc')).toBeNull();
    expect(normalizeToE164('+12')).toBeNull();     // too short
    expect(normalizeToE164('+0501234567')).toBeNull(); // E.164 never starts with 0
  });
});

describe('resolveTemplateLanguage', () => {
  const rows = [
    { language: 'en', status: 'APPROVED' },
    { language: 'ar', status: 'APPROVED' },
    { language: 'de', status: 'PENDING' },
  ];
  it('prefers customer language when approved', () => {
    expect(resolveTemplateLanguage(rows, 'ar', 'en')).toBe('ar');
  });
  it('skips non-approved translations', () => {
    expect(resolveTemplateLanguage(rows, 'de', 'en')).toBe('en');
  });
  it('falls back tenant default → en → any approved', () => {
    expect(resolveTemplateLanguage(rows, 'fr', 'de')).toBe('en');
    expect(resolveTemplateLanguage([{ language: 'ar', status: 'APPROVED' }], 'fr', 'de')).toBe('ar');
  });
  it('returns null when nothing is approved', () => {
    expect(resolveTemplateLanguage([{ language: 'en', status: 'PENDING' }], 'en', 'en')).toBeNull();
  });
});

describe('buildTemplateParams', () => {
  const components = [
    { type: 'BODY', text: 'Hi {{customer_name}}, case {{case_number}} is {{status}}.' },
  ];
  const variableMap = { customer_name: 'customer.name', case_number: 'case.number', status: 'case.status' };
  const context = { 'customer.name': 'Ali', 'case.number': 'CASE-0042', 'case.status': 'Ready for Delivery' };
  it('builds named body parameters in template order', () => {
    const p = buildTemplateParams(components, variableMap, context, 'named');
    expect(p).toEqual([{
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: 'Ali' },
        { type: 'text', parameter_name: 'case_number', text: 'CASE-0042' },
        { type: 'text', parameter_name: 'status', text: 'Ready for Delivery' },
      ],
    }]);
  });
  it('missing context values become em-dash (never leak template syntax)', () => {
    const p = buildTemplateParams(components, variableMap, {}, 'named');
    expect(p[0].parameters.every((x) => (x as { text?: string }).text === '—')).toBe(true);
  });

  it('emits an image header parameter from the media link', () => {
    const withHeader = [
      { type: 'HEADER', format: 'IMAGE' },
      ...components,
    ];
    const p = buildTemplateParams(withHeader, variableMap, context, 'named',
      { headerImageLink: 'https://cdn.example/logo.png' });
    expect(p[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.example/logo.png' } }],
    });
  });

  it('throws for an image header with no media link (worker converts to a loud skip)', () => {
    expect(() => buildTemplateParams(
      [{ type: 'HEADER', format: 'IMAGE' }, ...components], variableMap, context, 'named',
    )).toThrow(/header media/i);
  });

  it('emits button parameters: dynamic URL suffix from the variable map, quick-reply payloads', () => {
    const withButtons = [
      ...components,
      { type: 'BUTTONS', buttons: [
        { type: 'URL', text: 'Track case', url: 'https://portal.example/t/{{1}}' },
        { type: 'QUICK_REPLY', text: 'Unsubscribe' },
      ] },
    ];
    const p = buildTemplateParams(withButtons, { ...variableMap, 'button_url_0': 'case.tracking_ref' },
      { ...context, 'case.tracking_ref': 'CASE-0042' }, 'named');
    expect(p).toContainEqual({
      type: 'button', sub_type: 'url', index: 0,
      parameters: [{ type: 'text', text: 'CASE-0042' }],
    });
    expect(p).toContainEqual({
      type: 'button', sub_type: 'quick_reply', index: 1,
      parameters: [{ type: 'payload', payload: 'UNSUBSCRIBE' }],
    });
  });
});

describe('renderBodyPreview', () => {
  it('substitutes params into the body text', () => {
    expect(renderBodyPreview(
      'Hi {{customer_name}}, case {{case_number}}.',
      { customer_name: 'Ali', case_number: 'CASE-0042' },
    )).toBe('Hi Ali, case CASE-0042.');
  });
});
```

`supabase/functions/whatsapp-webhook/webhookCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature, matchOptKeyword, extractChanges } from './webhookCore';

describe('verifyMetaSignature', () => {
  it('accepts a valid signature and rejects tampering', async () => {
    const secret = 'test_app_secret';
    const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, body);
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyMetaSignature(body, `sha256=${hex}`, secret)).toBe(true);
    expect(await verifyMetaSignature(body, `sha256=${'0'.repeat(64)}`, secret)).toBe(false);
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
    expect(await verifyMetaSignature(body, 'bogus', secret)).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares without early exit', async () => {
    const { timingSafeEqual } = await import('./webhookCore');
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});

describe('matchOptKeyword', () => {
  it.each([
    ['STOP', 'stop'], ['stop', 'stop'], ['  Unsubscribe ', 'stop'], ['إيقاف', 'stop'],
    ['START', 'start'], ['resume', 'start'],
    ['hello there', null], ['stop by tomorrow to collect', null],
  ])('%s → %s', (input, expected) => {
    expect(matchOptKeyword(input)).toBe(expected);
  });
});

describe('extractChanges', () => {
  it('flattens entry[].changes[] with waba id and phone_number_id', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA1', changes: [{ field: 'messages',
        value: { metadata: { phone_number_id: 'PN1' }, statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }],
    };
    const out = extractChanges(payload);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ wabaId: 'WABA1', field: 'messages', phoneNumberId: 'PN1' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm run geo:test -- waCore webhookCore` → modules not found)

- [ ] **Step 3: Implement `supabase/functions/whatsapp-send/waCore.ts`**

```ts
// Pure logic for the whatsapp-send worker. No Deno globals, no Supabase client —
// unit-testable under vitest (house pattern: provisionGuards.ts).

export type SendErrorKind =
  | 'retry' | 'suppress_marketing' | 'mark_unreachable' | 'template_broken'
  | 'integration_quality_pause' | 'integration_token_dead' | 'integration_locked'
  | 'hard_fail';

export interface SendErrorClass { kind: SendErrorKind; code: number; }

const RETRYABLE = new Set([4, 80007, 130429, 131000, 131016, 131056, 131057]);
const TOKEN_DEAD = new Set([0, 190]);
const LOCKED = new Set([368, 131031, 131042]);

export function classifySendError(code: number): SendErrorClass {
  if (RETRYABLE.has(code)) return { kind: 'retry', code };
  if (code === 131049) return { kind: 'suppress_marketing', code };
  if (code === 131026) return { kind: 'mark_unreachable', code };
  if (code >= 132000 && code <= 132999) return { kind: 'template_broken', code };
  if (code === 131048) return { kind: 'integration_quality_pause', code };
  if (TOKEN_DEAD.has(code)) return { kind: 'integration_token_dead', code };
  if (LOCKED.has(code)) return { kind: 'integration_locked', code };
  return { kind: 'hard_fail', code };
}

/** Exponential backoff in seconds: 1m, 2m, 4m, ... capped at 12h. */
export function computeBackoff(attempt: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 12 * 3600);
}

/**
 * Best-effort E.164. Strips separators; converts leading 00 to +; promotes BARE
 * digit strings only when they cannot be a local number (10-15 digits, no leading
 * 0 — a leading 0 means local format with unknown country → null, never guess).
 * E.164 country codes never start with 0.
 */
export function normalizeToE164(raw: string): string | null {
  let v = (raw ?? '').replace(/[\s\-().]/g, '');
  if (v.startsWith('00')) v = '+' + v.slice(2);
  if (/^[1-9]\d{9,14}$/.test(v)) v = '+' + v;
  if (!/^\+[1-9]\d{7,14}$/.test(v)) return null;
  return v;
}

/** Meta has NO language fallback (error 132001) — resolve against APPROVED translations only. */
export function resolveTemplateLanguage(
  rows: Array<{ language: string; status: string }>,
  customerLang: string | null | undefined,
  tenantDefault: string | null | undefined,
): string | null {
  const approved = rows.filter((r) => r.status === 'APPROVED').map((r) => r.language);
  const pick = (lang?: string | null) => {
    if (!lang) return null;
    if (approved.includes(lang)) return lang;
    const base = lang.split(/[-_]/)[0];
    return approved.find((a) => a === base || a.split(/[-_]/)[0] === base) ?? null;
  };
  return pick(customerLang) ?? pick(tenantDefault) ?? pick('en') ?? approved[0] ?? null;
}

const VAR_RE = /\{\{\s*([\w]+)\s*\}\}/g;

interface TemplateButton { type: string; text?: string; url?: string; }
interface TemplateComponent { type: string; text?: string; format?: string; buttons?: TemplateButton[]; }
type SendComponent = {
  type: string; sub_type?: string; index?: number;
  parameters: Array<Record<string, unknown>>;
};

/**
 * Build Meta send-time components from the stored template components + variable
 * map + context. Covers: TEXT/IMAGE headers (image = tenant-logo branding via
 * media.headerImageLink), BODY variables, dynamic-URL-suffix buttons (suffix value
 * from variableMap['button_url_<index>']), and quick-reply payloads (uppercased
 * button text — which is how STOP/UNSUBSCRIBE taps arrive recognizably inbound).
 * Throws on an IMAGE header with no media link — the worker converts that to a
 * loud skip instead of sending a payload Meta would reject.
 */
export function buildTemplateParams(
  components: TemplateComponent[],
  variableMap: Record<string, string>,
  context: Record<string, string>,
  parameterFormat: 'named' | 'positional',
  media?: { headerImageLink?: string },
): SendComponent[] {
  const out: SendComponent[] = [];
  const valueOf = (name: string) => context[variableMap[name] ?? name] ?? '—';
  for (const c of components) {
    const type = c.type?.toUpperCase();
    if (type === 'HEADER') {
      const format = (c.format ?? 'TEXT').toUpperCase();
      if (format === 'IMAGE') {
        if (!media?.headerImageLink) throw new Error('template requires header media but none provided');
        out.push({ type: 'header', parameters: [{ type: 'image', image: { link: media.headerImageLink } }] });
        continue;
      }
      if (format !== 'TEXT' || !c.text) continue;
    }
    if (type === 'BODY' || type === 'HEADER') {
      if (!c.text) continue;
      const names = [...c.text.matchAll(VAR_RE)].map((m) => m[1]);
      if (names.length === 0) continue;
      const parameters = names.map((name) =>
        parameterFormat === 'named'
          ? { type: 'text', parameter_name: name, text: valueOf(name) }
          : { type: 'text', text: valueOf(name) });
      out.push({ type: type.toLowerCase(), parameters });
      continue;
    }
    if (type === 'BUTTONS') {
      (c.buttons ?? []).forEach((btn, index) => {
        const btnType = btn.type?.toUpperCase();
        if (btnType === 'URL' && btn.url && VAR_RE.test(btn.url)) {
          VAR_RE.lastIndex = 0;
          out.push({
            type: 'button', sub_type: 'url', index,
            parameters: [{ type: 'text', text: valueOf(`button_url_${index}`) }],
          });
        } else if (btnType === 'QUICK_REPLY') {
          out.push({
            type: 'button', sub_type: 'quick_reply', index,
            parameters: [{ type: 'payload', payload: (btn.text ?? '').toUpperCase() }],
          });
        }
        // PHONE_NUMBER / static-URL buttons need no send-time parameters
      });
    }
  }
  return out;
}

/** Render the human-readable body copy stored on the message row for logs / the case tab. */
export function renderBodyPreview(bodyText: string, values: Record<string, string>): string {
  return bodyText.replace(VAR_RE, (_, name: string) => values[name] ?? '—');
}
```

- [ ] **Step 4: Implement `supabase/functions/whatsapp-webhook/webhookCore.ts`**

```ts
// Pure logic for the whatsapp-webhook receiver. No Deno globals — vitest-testable.

/** Timing-safe X-Hub-Signature-256 check over the RAW body bytes (never re-serialized JSON). */
export async function verifyMetaSignature(
  rawBody: Uint8Array, header: string | null, appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false;
  const expectedHex = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
  const actualHex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

/** Constant-time string equality (verify-token comparison on the GET handshake). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STOP_WORDS = ['stop', 'unsubscribe', 'cancel', 'stopall', 'إيقاف', 'الغاء', 'إلغاء'];
const START_WORDS = ['start', 'resume', 'unstop', 'subscribe', 'اشتراك'];

/** Exact-message keyword match (whole trimmed message, case-insensitive) → 'stop' | 'start' | null. */
export function matchOptKeyword(body: string): 'stop' | 'start' | null {
  const t = (body ?? '').trim().toLowerCase();
  if (STOP_WORDS.includes(t)) return 'stop';
  if (START_WORDS.includes(t)) return 'start';
  return null;
}

export interface WebhookChange {
  wabaId: string;
  field: string;
  phoneNumberId: string | null;
  value: Record<string, unknown>;
}

export function extractChanges(payload: unknown): WebhookChange[] {
  const out: WebhookChange[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const e of entries as Array<{ id?: string; changes?: unknown[] }>) {
    for (const c of (e.changes ?? []) as Array<{ field?: string; value?: Record<string, unknown> }>) {
      const value = c.value ?? {};
      const metadata = value.metadata as { phone_number_id?: string } | undefined;
      out.push({
        wabaId: e.id ?? '', field: c.field ?? '',
        phoneNumberId: metadata?.phone_number_id ?? null, value,
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run — expect PASS** (`npm run geo:test -- waCore webhookCore`)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/whatsapp-send/ supabase/functions/whatsapp-webhook/
git commit -m "feat(whatsapp): pure core modules (error classes, backoff, E.164, signature, keywords) + tests"
```

### Task 5: `whatsapp-webhook` edge function

**Files:**
- Create: `supabase/functions/whatsapp-webhook/index.ts`
- Modify: `supabase/config.toml` (add `verify_jwt = false` block)

- [ ] **Step 1: Implement `index.ts`**

```ts
// WhatsApp Cloud API webhook receiver.
// GET  = Meta verification handshake (hub.challenge echo, per-tenant verify token,
//        rate-limited, constant-time compare)
// POST = signed event delivery (X-Hub-Signature-256 over raw body, tenant app secret)
// Auth model: verify_jwt=false in config.toml — the handler authenticates Meta itself.
// Idempotency: two-phase whatsapp_webhook_events ledger (insert-first, processed_at
// last), mirroring the billing_events protocol; the inbound-message ledger insert
// happens BEFORE any non-idempotent side effect (consents, comms, notifications).
// Tenant scoping: EVERY read/update keyed by wamid or template name also filters
// tenant_id — a validly-signed payload must never become a cross-tenant write channel.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyMetaSignature, matchOptKeyword, extractChanges, timingSafeEqual } from "./webhookCore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeTs(unixSeconds: unknown): string {
  const t = Number(unixSeconds);
  return Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : new Date().toISOString();
}

/**
 * notification_events insert with explicit tenant + dedup-ignore. The emit RPC's
 * tenant resolution under a service-role JWT is unproven (see Task 2 pre-flight),
 * so edge code writes the outbox row directly — service role bypasses RLS and the
 * jwt role 'service_role' passes the tenant-guard trigger.
 */
async function emitEvent(
  tenantId: string, eventType: string, entityType: string, entityId: string,
  payload: Record<string, unknown>, dedupKey: string,
) {
  const { error } = await db.from("notification_events").upsert({
    tenant_id: tenantId, event_type: eventType, entity_type: entityType,
    entity_id: entityId, payload, dedup_key: dedupKey,
    occurred_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,dedup_key", ignoreDuplicates: true });
  if (error) console.error(`emitEvent(${eventType}):`, error);
}

interface IntegrationRow {
  id: string; tenant_id: string; public_id: string; phone_number_id: string | null;
  webhook_verify_token: string; webhook_status: string;
}

async function loadIntegrationByPublicId(publicId: string): Promise<IntegrationRow | null> {
  const { data } = await db.from("whatsapp_integrations")
    .select("id, tenant_id, public_id, phone_number_id, webhook_verify_token, webhook_status")
    .eq("public_id", publicId).is("deleted_at", null).maybeSingle();
  return (data as IntegrationRow | null) ?? null;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/** statuses[] → whatsapp_messages updates (tenant-scoped; monotonic via conditional UPDATE). */
async function handleStatuses(tenantId: string, statuses: Array<Record<string, unknown>>) {
  for (const s of statuses) {
    const wamid = s.id as string;
    const status = s.status as string;
    if (!wamid || !status) continue;
    const ts = safeTs(s.timestamp);
    const pricing = (s.pricing ?? {}) as Record<string, unknown>;
    const conversation = (s.conversation ?? {}) as Record<string, unknown>;

    if (status === "sent" || status === "delivered" || status === "read") {
      const patch: Record<string, unknown> = {
        pricing_billable: pricing.billable ?? null,
        pricing_category: pricing.category ?? null,
        pricing_type: pricing.type ?? null,
        conversation_id: conversation.id ?? null,
      };
      if (status === "sent") patch.sent_at = ts;
      if (status === "delivered") patch.delivered_at = ts;
      if (status === "read") patch.read_at = ts;
      const { data: row } = await db.from("whatsapp_messages")
        .select("id,status").eq("tenant_id", tenantId).eq("wamid", wamid).maybeSingle();
      if (!row) continue;
      // Meta deliveries are unordered + at-least-once: guard the status column
      // atomically by conditioning on the value we read (a lost race just means the
      // other writer already advanced it further — timestamps still land).
      if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[row.status] ?? 0)) {
        const { data: moved } = await db.from("whatsapp_messages")
          .update({ ...patch, status })
          .eq("id", row.id).eq("status", row.status).select("id").maybeSingle();
        if (moved) continue;
      }
      await db.from("whatsapp_messages").update(patch).eq("id", row.id);
    } else if (status === "failed") {
      const errors = (s.errors ?? []) as Array<Record<string, unknown>>;
      const first = errors[0] ?? {};
      const { data: msg } = await db.from("whatsapp_messages")
        .select("id, case_id, event_key").eq("tenant_id", tenantId).eq("wamid", wamid).maybeSingle();
      if (!msg) continue;
      await db.from("whatsapp_messages").update({
        status: "failed", failed_at: ts,
        last_error_code: Number(first.code) || null,
        last_error: String(
          (first.error_data as Record<string, unknown> | undefined)?.details ?? first.message ?? "delivery failed",
        ),
      }).eq("id", msg.id);
      await emitEvent(tenantId, "whatsapp.message_failed", "whatsapp_message", msg.id,
        { case_id: msg.case_id, event_key: msg.event_key, error_code: first.code ?? null },
        `whatsapp.message_failed:${msg.id}`);
    }
  }
}

/** inbound messages[]: ledger-first (wamid dedup gates ALL side effects), then
 *  contact window, STOP/START consents, comms mirror, staff notification. */
async function handleInbound(
  integ: IntegrationRow, contacts: Array<Record<string, unknown>>, messages: Array<Record<string, unknown>>,
) {
  const profileByWaId = new Map<string, string>();
  for (const c of contacts) {
    profileByWaId.set(String(c.wa_id), String((c.profile as Record<string, unknown>)?.name ?? ""));
  }
  for (const m of messages) {
    const wamid = String(m.id ?? "");
    const from = String(m.from ?? "");
    const type = String(m.type ?? "unknown");
    if (!wamid || !from) continue;
    const ts = safeTs(m.timestamp);
    const phoneE164 = `+${from}`;

    // ---- extract body / media / reply context ----
    let body: string | null = null; let buttonPayload: string | null = null;
    let mediaId: string | null = null; let mediaMime: string | null = null;
    if (type === "text") body = String((m.text as Record<string, unknown>)?.body ?? "");
    if (type === "button") {
      const b = m.button as Record<string, unknown>;
      body = String(b?.text ?? ""); buttonPayload = String(b?.payload ?? "");
    }
    if (type === "interactive") {
      const i = m.interactive as Record<string, unknown>;
      const reply = (i?.button_reply ?? i?.list_reply) as Record<string, unknown> | undefined;
      body = String(reply?.title ?? ""); buttonPayload = String(reply?.id ?? "");
    }
    if (["image", "audio", "video", "document", "sticker"].includes(type)) {
      const media = m[type] as Record<string, unknown>;
      mediaId = String(media?.id ?? ""); mediaMime = String(media?.mime_type ?? "");
      body = String(media?.caption ?? "");
    }
    const context = m.context as Record<string, unknown> | undefined;
    let inReplyTo: string | null = null; let caseId: string | null = null;
    let customerId: string | null = null;
    if (context?.id) {
      const { data: orig } = await db.from("whatsapp_messages")
        .select("id, case_id, customer_id")
        .eq("tenant_id", integ.tenant_id).eq("wamid", String(context.id)).maybeSingle();
      if (orig) { inReplyTo = orig.id; caseId = orig.case_id; customerId = orig.customer_id; }
    }

    // ---- resolve/refresh the contact (idempotent: safe before the dedup gate) ----
    const windowExpires = new Date(new Date(ts).getTime() + 24 * 3600 * 1000).toISOString();
    const { data: existing } = await db.from("whatsapp_contacts")
      .select("id, customer_id").eq("tenant_id", integ.tenant_id)
      .eq("phone_e164", phoneE164).is("deleted_at", null).maybeSingle();
    let contactId = existing?.id as string | undefined;
    customerId = customerId ?? (existing?.customer_id as string | undefined) ?? null;
    if (contactId) {
      await db.from("whatsapp_contacts").update({
        wa_id: from, last_inbound_at: ts, service_window_expires_at: windowExpires,
        profile_name: profileByWaId.get(from) ?? null, unreachable: false,
      }).eq("id", contactId);
    } else {
      if (!customerId) {
        // stored numbers are unformatted — digits-normalized match runs DB-side
        const { data: matched } = await db.rpc("whatsapp_match_customer_by_phone", {
          p_tenant_id: integ.tenant_id, p_last9: from.slice(-9),
        });
        customerId = (matched as string | null) ?? null;
      }
      const { data: created } = await db.from("whatsapp_contacts").insert({
        tenant_id: integ.tenant_id, customer_id: customerId, wa_id: from,
        phone_e164: phoneE164, profile_name: profileByWaId.get(from) ?? null,
        last_inbound_at: ts, service_window_expires_at: windowExpires,
      }).select("id").maybeSingle();
      contactId = created?.id;
    }

    // ---- DEDUP GATE: the inbound ledger insert. 23505 = redelivery → nothing below runs twice ----
    const kw = body ? matchOptKeyword(body) : null;
    const handled = kw ?? "none";
    const { error: insErr } = await db.from("whatsapp_inbound_messages").insert({
      tenant_id: integ.tenant_id, wamid, contact_id: contactId ?? null,
      customer_id: customerId, case_id: caseId,
      in_reply_to_message_id: inReplyTo, message_type: type, body,
      media_id: mediaId, media_mime: mediaMime, button_payload: buttonPayload,
      raw: m, received_at: ts, handled,
    });
    if (insErr) {
      if (insErr.code !== "23505") console.error("inbound ledger insert:", insErr);
      continue;
    }

    // ---- non-idempotent side effects (run exactly once per wamid) ----
    if (kw && customerId) {
      await db.from("whatsapp_consents").insert({
        tenant_id: integ.tenant_id, customer_id: customerId,
        scope: "utility", action: kw === "stop" ? "opt_out" : "opt_in",
        source: "inbound_message", phone_e164: phoneE164, consent_text: body,
      });
      if (kw === "stop") {
        await db.from("whatsapp_consents").insert({
          tenant_id: integ.tenant_id, customer_id: customerId,
          scope: "marketing", action: "opt_out",
          source: "inbound_message", phone_e164: phoneE164, consent_text: body,
        });
      }
      if (contactId) {
        await db.from("whatsapp_contacts").update({ opt_out_all: kw === "stop" }).eq("id", contactId);
      }
    }
    if (caseId) {
      await db.rpc("log_case_communication", {
        p_case_id: caseId, p_type: "whatsapp", p_direction: "inbound",
        p_content: body ?? `[${type}]`, p_sent_to: phoneE164,
      }).then(() => {}, (e: unknown) => console.error("log_case_communication:", e));
    } else if (customerId) {
      await db.from("customer_communications").insert({
        tenant_id: integ.tenant_id, customer_id: customerId, type: "whatsapp",
        direction: "inbound", content: body ?? `[${type}]`, status: "received",
        sent_at: ts,
      });
    }
    if (handled === "none") {
      await emitEvent(integ.tenant_id, "whatsapp.reply_received",
        caseId ? "case" : "customer", caseId ?? customerId ?? integ.id,
        { customer_id: customerId, case_id: caseId, preview: (body ?? "").slice(0, 140) },
        `whatsapp.reply_received:${wamid}`);
    }
  }
}

/** template + phone/account health webhooks → registry + integration updates
 *  (tenant-scoped; family-head rows only via superseded_by IS NULL). */
async function handleAdminFields(integ: IntegrationRow, field: string, value: Record<string, unknown>) {
  const name = String(value.message_template_name ?? "");
  const language = String(value.message_template_language ?? "");
  if (field === "message_template_status_update") {
    const event = String(value.event ?? "");
    const map: Record<string, string> = {
      APPROVED: "APPROVED", REJECTED: "REJECTED", PAUSED: "PAUSED", DISABLED: "DISABLED", PENDING: "PENDING",
    };
    if (map[event]) {
      await db.from("whatsapp_templates").update({
        status: map[event],
        rejection_reason: String(value.reason ?? "") || null,
        last_synced_at: new Date().toISOString(),
      }).eq("tenant_id", integ.tenant_id).eq("name", name).eq("language", language)
        .is("deleted_at", null).is("superseded_by", null);
    }
  } else if (field === "message_template_quality_update") {
    await db.from("whatsapp_templates").update({
      quality_score: String(value.new_quality_score ?? "") || null,
    }).eq("tenant_id", integ.tenant_id).eq("name", name).eq("language", language)
      .is("deleted_at", null).is("superseded_by", null);
  } else if (field === "template_category_update") {
    const next = String(value.new_category ?? value.correct_category ?? "");
    if (next) {
      await db.from("whatsapp_templates").update({ category: next })
        .eq("tenant_id", integ.tenant_id).eq("name", name)
        .is("deleted_at", null).is("superseded_by", null);
    }
  } else if (field === "phone_number_quality_update") {
    // value.event ∈ FLAGGED | UNFLAGGED | limit changes; current_limit = tier string
    const patch: Record<string, unknown> = {
      messaging_limit_tier: String(value.current_limit ?? "") || null,
    };
    if (value.event === "FLAGGED") patch.quality_rating = "RED";
    if (value.event === "UNFLAGGED") patch.quality_rating = "GREEN";
    await db.from("whatsapp_integrations").update(patch).eq("id", integ.id);
  } else if (field === "account_update") {
    // append, never overwrite, the health history (bounded to the last 20 entries)
    const { data: row } = await db.from("whatsapp_integrations")
      .select("health_errors").eq("id", integ.id).maybeSingle();
    const prior = Array.isArray(row?.health_errors) ? row!.health_errors : [];
    await db.from("whatsapp_integrations").update({
      health_errors: [...prior, { at: new Date().toISOString(), field, event: value.event ?? null }].slice(-20),
    }).eq("id", integ.id);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const publicId = url.searchParams.get("t") ?? "";

  // ---- GET: Meta verification handshake ----
  if (req.method === "GET") {
    const { data: rl } = await db.rpc("check_rate_limit", {
      p_key: `wa-verify:${publicId || "none"}`, p_max_requests: 5, p_window_seconds: 60,
    });
    if (rl !== true) return new Response("Rate limited", { status: 429 });
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const integ = await loadIntegrationByPublicId(publicId);
    if (mode === "subscribe" && integ && timingSafeEqual(token, integ.webhook_verify_token)) {
      await db.from("whatsapp_integrations")
        .update({ webhook_status: "verified" }).eq("id", integ.id);
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ---- POST: signed delivery ----
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const integ = await loadIntegrationByPublicId(publicId);
  if (!integ) return new Response(JSON.stringify({ received: true }), { status: 200 }); // never make Meta retry forever

  const { data: creds } = await db.rpc("whatsapp_reveal_credentials", { p_tenant_id: integ.tenant_id });
  const appSecret = creds?.[0]?.app_secret as string | undefined;
  if (!appSecret) {
    console.error(`whatsapp-webhook: no app secret for tenant ${integ.tenant_id}`);
    return new Response(JSON.stringify({ error: "Webhook verification not configured" }), { status: 500 });
  }
  const valid = await verifyMetaSignature(rawBody, req.headers.get("X-Hub-Signature-256"), appSecret);
  if (!valid) return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });

  // two-phase idempotency ledger (insert first; skip only if a prior delivery COMPLETED)
  const eventId = await sha256Hex(rawBody);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const changes = extractChanges(payload);
  const { error: ledgerErr } = await db.from("whatsapp_webhook_events").insert({
    provider_event_id: eventId, tenant_id: integ.tenant_id,
    field: changes[0]?.field ?? null, payload, signature_valid: true,
  });
  if (ledgerErr) {
    if (ledgerErr.code === "23505") {
      const { data: prior } = await db.from("whatsapp_webhook_events")
        .select("processed_at").eq("provider_event_id", eventId).maybeSingle();
      if (prior?.processed_at) return new Response(JSON.stringify({ received: true }), { status: 200 });
      // fall through: prior attempt died mid-flight → reprocess (handlers are dedup-gated)
    } else {
      console.error("whatsapp-webhook ledger insert failed:", ledgerErr);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
    }
  }

  try {
    await db.from("whatsapp_integrations")
      .update({ last_webhook_at: new Date().toISOString(), webhook_status: "receiving" })
      .eq("id", integ.id);
    for (const c of changes) {
      // routing cross-check: the event's phone_number_id must match this tenant's number
      if (c.phoneNumberId && integ.phone_number_id && c.phoneNumberId !== integ.phone_number_id) {
        console.error(`whatsapp-webhook: phone_number_id mismatch for tenant ${integ.tenant_id}`);
        continue;
      }
      if (c.field === "messages") {
        const statuses = (c.value.statuses ?? []) as Array<Record<string, unknown>>;
        const messages = (c.value.messages ?? []) as Array<Record<string, unknown>>;
        const contacts = (c.value.contacts ?? []) as Array<Record<string, unknown>>;
        if (statuses.length) await handleStatuses(integ.tenant_id, statuses);
        if (messages.length) await handleInbound(integ, contacts, messages);
      } else {
        await handleAdminFields(integ, c.field, c.value);
      }
    }
    await db.from("whatsapp_webhook_events")
      .update({ processed_at: new Date().toISOString() }).eq("provider_event_id", eventId);
  } catch (e) {
    console.error("whatsapp-webhook processing error:", e);
    await db.from("whatsapp_webhook_events")
      .update({ processing_error: String(e) }).eq("provider_event_id", eventId);
    // still 200: the ledger row holds the payload; reprocessing is our job, not Meta's
  }
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

- [ ] **Step 2: `supabase/config.toml`** — append:

```toml
[functions.whatsapp-webhook]
# Called by Meta's servers; the handler verifies X-Hub-Signature-256 + hub.verify_token itself.
verify_jwt = false
```

- [ ] **Step 3: Typecheck the pure module boundary + run its tests again** (`npm run geo:test -- webhookCore`) — PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-webhook/ supabase/config.toml
git commit -m "feat(whatsapp): webhook receiver (handshake, HMAC, two-phase ledger, statuses, inbound, STOP)"
```

### Task 6: `whatsapp-send` edge worker

**Files:**
- Create: `supabase/functions/whatsapp-send/index.ts` (uses `waCore.ts` from Task 4)

- [ ] **Step 1: Implement `index.ts`**

```ts
// WhatsApp send worker. Invoked by pg_net (dispatcher poke + 1-min scanner) with { message_id }.
// Auth: exact service-role bearer only (house pattern: notification-dispatch-email).
// Guarantees: atomic claim pending→processing BEFORE the Graph call; attempts are
// counted ONLY when a Graph call is actually made (infra holds — integration down,
// quality pause, token dead, pair pacing — never consume the retry budget);
// error-classified backoff/suppression on failure; business-hours rules re-apply
// to retry scheduling; every outcome lands on the whatsapp_messages row and mirrors
// into log_case_communication / customer_communications.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifySendError, computeBackoff, normalizeToE164,
  resolveTemplateLanguage, buildTemplateParams, renderBodyPreview,
} from "./waCore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function appSecretProof(appSecret: string, accessToken: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken)));
  return Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Direct outbox insert with explicit tenant (see whatsapp-webhook emitEvent rationale). */
async function emitEvent(
  tenantId: string, eventType: string, entityType: string, entityId: string,
  payload: Record<string, unknown>, dedupKey: string,
) {
  const { error } = await db.from("notification_events").upsert({
    tenant_id: tenantId, event_type: eventType, entity_type: entityType,
    entity_id: entityId, payload, dedup_key: dedupKey,
    occurred_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,dedup_key", ignoreDuplicates: true });
  if (error) console.error(`emitEvent(${eventType}):`, error);
}

interface TenantFormatConfig {
  currencySymbol: string; currencyCode: string; decimalPlaces: number;
  localeCode: string; timezone: string; uiLanguage: string | null;
}

/** Tenant-config-aware formatters (CLAUDE.md: never hardcode symbols/decimals/date formats).
 *  Reads the denormalized config columns on tenants (synced from geo_countries). */
async function loadTenantFormat(tenantId: string): Promise<TenantFormatConfig> {
  const { data: t } = await db.from("tenants")
    .select("currency_symbol, currency_code, decimal_places, locale_code, timezone, ui_language")
    .eq("id", tenantId).maybeSingle();
  return {
    currencySymbol: t?.currency_symbol ?? t?.currency_code ?? "",
    currencyCode: t?.currency_code ?? "",
    decimalPlaces: Number.isFinite(Number(t?.decimal_places)) ? Number(t?.decimal_places) : 2,
    localeCode: t?.locale_code ?? "en-US",
    timezone: t?.timezone ?? "UTC",
    uiLanguage: t?.ui_language ?? null,
  };
}
function fmtMoney(v: unknown, cfg: TenantFormatConfig): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const num = new Intl.NumberFormat(cfg.localeCode, {
    minimumFractionDigits: cfg.decimalPlaces, maximumFractionDigits: cfg.decimalPlaces,
  }).format(n);
  return `${cfg.currencySymbol} ${num}`.trim();
}
function fmtDate(v: unknown, cfg: TenantFormatConfig): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(cfg.localeCode, {
    dateStyle: "medium", timeZone: cfg.timezone,
  }).format(d);
}

/**
 * Template context. Key vocabulary = the house catalog (templateContextService /
 * master_template_variables) plus the WhatsApp additions registered in Task 17:
 * device.summary, device.count, quote.valid_until→quote.expiry_date, invoice.balance_due,
 * case.recovery_outcome, case.engineer, case.tracking_link, case.collection_date,
 * branch.name, customer.custom.* (from customers_enhanced.metadata).
 */
async function buildContext(
  msg: Record<string, unknown>, tenantId: string, cfg: TenantFormatConfig,
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};
  const { data: settings } = await db.from("company_settings")
    .select("basic_info, contact_info, branding, portal_settings")
    .eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  const basic = (settings?.basic_info ?? {}) as Record<string, unknown>;
  const contact = (settings?.contact_info ?? {}) as Record<string, unknown>;
  const portal = (settings?.portal_settings ?? {}) as Record<string, unknown>;
  ctx["company.name"] = String(basic.company_name ?? "");
  ctx["company.phone"] = String(contact.phone_primary ?? "");
  ctx["company.email"] = String(contact.email_general ?? "");

  if (msg.customer_id) {
    const { data: cust } = await db.from("customers_enhanced")
      .select("customer_name, email, preferred_language, metadata").eq("id", msg.customer_id).maybeSingle();
    ctx["customer.name"] = String(cust?.customer_name ?? "");
    const meta = (cust?.metadata ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === "string" || typeof v === "number") ctx[`customer.custom.${k}`] = String(v);
    }
  }
  if (msg.case_id) {
    const { data: c } = await db.from("cases")
      .select("case_number, status, recovery_outcome, assigned_to, branch_id").eq("id", msg.case_id).maybeSingle();
    ctx["case.number"] = String(c?.case_number ?? "");
    ctx["case.status"] = String(c?.status ?? "");
    ctx["case.recovery_outcome"] = String(c?.recovery_outcome ?? "");
    if (c?.assigned_to) {
      const { data: eng } = await db.from("profiles").select("full_name").eq("id", c.assigned_to).maybeSingle();
      ctx["case.engineer"] = String(eng?.full_name ?? "");
      ctx["technician.name"] = ctx["case.engineer"];
    }
    if (c?.branch_id) {
      const { data: br } = await db.from("branches").select("name").eq("id", c.branch_id).maybeSingle();
      ctx["branch.name"] = String(br?.name ?? "");
    }
    // portal tracking link: tenant portal base + case number (portalUrlService convention;
    // verify the portal_settings key against src/lib/portalUrlService.ts at execution)
    const portalBase = String(portal.portal_url ?? portal.base_url ?? "");
    ctx["case.tracking_link"] = portalBase && ctx["case.number"]
      ? `${portalBase.replace(/\/$/, "")}/track/${ctx["case.number"]}` : "";
    const { data: devices } = await db.from("case_devices")
      .select("model").eq("case_id", msg.case_id).is("deleted_at", null);
    ctx["device.summary"] = (devices ?? []).map((d) => d.model).filter(Boolean).slice(0, 3).join(", ")
      + ((devices?.length ?? 0) > 3 ? ` +${devices!.length - 3} more` : "");
    ctx["device.count"] = String(devices?.length ?? 0);
    // collection date: the earliest scheduled pickup follow-up, if any
    const { data: pickup } = await db.from("case_follow_ups")
      .select("follow_up_date").eq("case_id", msg.case_id)
      .eq("follow_up_type", "pickup_reminder").eq("status", "pending")
      .is("deleted_at", null).order("follow_up_date").limit(1).maybeSingle();
    ctx["case.collection_date"] = pickup ? fmtDate(pickup.follow_up_date, cfg) : "";
  }
  if (msg.quote_id) {
    const { data: q } = await db.from("quotes")
      .select("quote_number, total_amount, currency, valid_until").eq("id", msg.quote_id).maybeSingle();
    ctx["quote.number"] = String(q?.quote_number ?? "");
    ctx["quote.total"] = fmtMoney(q?.total_amount, cfg);
    ctx["quote.expiry_date"] = fmtDate(q?.valid_until, cfg);
  }
  if (msg.invoice_id) {
    const { data: inv } = await db.from("invoices")
      .select("invoice_number, total_amount, balance_due, currency, due_date").eq("id", msg.invoice_id).maybeSingle();
    ctx["invoice.number"] = String(inv?.invoice_number ?? "");
    ctx["invoice.total"] = fmtMoney(inv?.total_amount, cfg);
    ctx["invoice.balance_due"] = fmtMoney(inv?.balance_due, cfg);
    ctx["invoice.due_date"] = fmtDate(inv?.due_date, cfg);
  }
  return ctx;
}

async function failMessage(id: string, code: number | null, error: string, skipReason?: string) {
  await db.from("whatsapp_messages").update({
    status: skipReason ? "skipped" : "failed",
    failed_at: new Date().toISOString(),
    last_error_code: code, last_error: error, skip_reason: skipReason ?? null,
  }).eq("id", id);
}

/** Retry with backoff — counts against the attempt budget (Graph call was made). */
async function releaseForRetry(
  id: string, attempt: number, code: number, error: string, windowedAt?: string | null,
) {
  await db.from("whatsapp_messages").update({
    status: "pending", claimed_at: null,
    next_attempt_at: windowedAt ?? new Date(Date.now() + computeBackoff(attempt) * 1000).toISOString(),
    last_error_code: code, last_error: error,
  }).eq("id", id);
}

/** Infra hold — releases WITHOUT consuming the attempt budget (decrements the claim's increment). */
async function releaseForHold(id: string, currentAttempt: number, code: number, error: string, holdSeconds: number) {
  await db.from("whatsapp_messages").update({
    status: "pending", claimed_at: null,
    attempt_count: Math.max(0, currentAttempt - 1),
    next_attempt_at: new Date(Date.now() + holdSeconds * 1000).toISOString(),
    last_error_code: code, last_error: error,
  }).eq("id", id);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { message_id } = await req.json().catch(() => ({}));
  if (!message_id) return new Response(JSON.stringify({ error: "message_id required" }), { status: 400 });

  // ---- atomic claim (pending → processing); loser of the race no-ops.
  // attempt_count++ rides the claim but is REFUNDED by every infra-hold path —
  // net effect: only real Graph attempts consume the budget of 5.
  const { data: claimed } = await db.from("whatsapp_messages")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", message_id).eq("status", "pending")
    .select("*").maybeSingle();
  if (!claimed) return new Response(JSON.stringify({ ok: true, skipped: "not claimable" }), { status: 200 });

  const attempt = (claimed.attempt_count ?? 0) + 1;
  await db.from("whatsapp_messages").update({ attempt_count: attempt }).eq("id", message_id);

  try {
    // ---- integration + credentials (failures here are HOLDS, not attempts) ----
    const { data: integ } = await db.from("whatsapp_integrations")
      .select("*").eq("tenant_id", claimed.tenant_id).is("deleted_at", null).maybeSingle();
    if (!integ || !integ.is_enabled || integ.connection_status !== "connected") {
      await releaseForHold(message_id, attempt, 0, "integration unavailable", 15 * 60);
      return new Response(JSON.stringify({ ok: false, error: "integration unavailable" }), { status: 200 });
    }
    if (integ.send_paused_until && new Date(integ.send_paused_until) > new Date()) {
      await releaseForHold(message_id, attempt, 131048, "quality pause active",
        Math.ceil((new Date(integ.send_paused_until).getTime() - Date.now()) / 1000));
      return new Response(JSON.stringify({ ok: false, error: "quality paused" }), { status: 200 });
    }
    const { data: credRows } = await db.rpc("whatsapp_reveal_credentials", { p_tenant_id: claimed.tenant_id });
    const creds = credRows?.[0];
    if (!creds?.access_token) {
      await failMessage(message_id, null, "credentials missing");
      return new Response(JSON.stringify({ ok: false, error: "credentials missing" }), { status: 200 });
    }

    // ---- recipient + policy gates ----
    const phone = normalizeToE164(String(claimed.to_phone_e164 ?? ""));
    if (!phone) {
      await failMessage(message_id, null, "no valid phone", "no_phone");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    const { data: rule } = await db.from("whatsapp_automation_rules")
      .select("required_consent, send_window, business_hours").eq("tenant_id", claimed.tenant_id)
      .eq("event_key", claimed.event_key ?? "").is("deleted_at", null).maybeSingle();
    const requiredConsent = rule?.required_consent ?? "utility";
    const isSessionMessage = String(claimed.message_kind ?? "template").startsWith("session");

    const { data: contact } = await db.from("whatsapp_contacts")
      .select("*").eq("tenant_id", claimed.tenant_id).eq("phone_e164", phone)
      .is("deleted_at", null).maybeSingle();
    // opt-out blocks EVERYTHING, session replies included
    if (contact?.opt_out_all) {
      await failMessage(message_id, null, "customer opted out", "opted_out");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    if (contact?.unreachable) {
      await failMessage(message_id, null, "number not on WhatsApp", "unreachable");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    // Recorded consent gates AUTOMATED template sends. Staff session replies inside
    // an open 24h window are permitted Meta service traffic (the inbound message
    // itself opened the conversation) — the window check replaces the consent check.
    if (!isSessionMessage && claimed.customer_id) {
      const { data: consent } = await db.rpc("whatsapp_consent_state", {
        p_tenant_id: claimed.tenant_id, p_customer_id: claimed.customer_id,
      });
      const scopeState = (consent ?? []).find((r: { scope: string }) => r.scope === requiredConsent);
      if (!scopeState?.opted_in) {
        await failMessage(message_id, null, `no ${requiredConsent} consent`, "consent_missing");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
    }
    if (isSessionMessage) {
      const windowOpen = contact?.service_window_expires_at
        && new Date(contact.service_window_expires_at) > new Date();
      if (!windowOpen) {
        await failMessage(message_id, 131047, "24h service window closed", "no_template");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
    }
    if (requiredConsent === "marketing" && !isSessionMessage) {
      if (phone.startsWith("+1")) {
        await failMessage(message_id, null, "US marketing paused by Meta", "us_marketing_paused");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
      if (contact?.marketing_suppressed_until && new Date(contact.marketing_suppressed_until) > new Date()) {
        await releaseForHold(message_id, attempt, 131049, "marketing frequency suppression", 4 * 3600);
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
    }
    // pair pacing: ≥6s between messages to the same recipient (hold, not an attempt)
    if (contact?.last_outbound_at && Date.now() - new Date(contact.last_outbound_at).getTime() < 6000) {
      await releaseForHold(message_id, attempt, 131056, "pair pacing", 10);
      return new Response(JSON.stringify({ ok: true, deferred: "pair pacing" }), { status: 200 });
    }

    // ---- resolve template + language, render params ----
    const cfg = await loadTenantFormat(claimed.tenant_id);
    let requestBody: Record<string, unknown>;
    let bodyPreview = claimed.body_preview as string | null;
    if (!isSessionMessage) {
      const { data: bound } = await db.from("whatsapp_templates")
        .select("name").eq("id", claimed.template_id).eq("tenant_id", claimed.tenant_id).maybeSingle();
      const { data: family } = await db.from("whatsapp_templates")
        .select("*").eq("tenant_id", claimed.tenant_id).eq("name", bound?.name ?? "")
        .is("deleted_at", null).is("superseded_by", null);
      const rows = family ?? [];
      let custLang: string | null = null;
      if (claimed.customer_id) {
        const { data: cust } = await db.from("customers_enhanced")
          .select("preferred_language").eq("id", claimed.customer_id).maybeSingle();
        custLang = cust?.preferred_language ?? null;
      }
      const language = resolveTemplateLanguage(rows, custLang, cfg.uiLanguage);
      const tpl = rows.find((r) => r.language === language)
        ?? rows.find((r) => r.is_fallback && r.status === "APPROVED");
      if (!tpl) {
        await failMessage(message_id, 132001, "no approved template translation", "no_template");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
      const context = await buildContext(claimed, claimed.tenant_id, cfg);
      // tenant-logo branding for image-header templates (Task 17 registers branding.logo_url;
      // verify the branding key against companySettingsService at execution)
      const { data: brandRow } = await db.from("company_settings")
        .select("branding").eq("tenant_id", claimed.tenant_id).is("deleted_at", null).maybeSingle();
      const logoUrl = String((brandRow?.branding as Record<string, unknown> | null)?.logo_url ?? "") || undefined;
      let components: ReturnType<typeof buildTemplateParams>;
      try {
        components = buildTemplateParams(
          tpl.components as Parameters<typeof buildTemplateParams>[0],
          (tpl.variable_map ?? {}) as Record<string, string>,
          context, tpl.parameter_format as "named" | "positional",
          { headerImageLink: logoUrl },
        );
      } catch (e) {
        // loud skip instead of a payload Meta would reject (e.g. image header, no logo)
        await failMessage(message_id, null, String(e), "unsupported_header");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
      const bodyComponent = (tpl.components as Array<{ type: string; text?: string }>)
        .find((c) => c.type?.toUpperCase() === "BODY");
      const values: Record<string, string> = {};
      for (const [varName, ctxKey] of Object.entries((tpl.variable_map ?? {}) as Record<string, string>)) {
        values[varName] = context[ctxKey] ?? "—";
      }
      bodyPreview = bodyComponent?.text ? renderBodyPreview(bodyComponent.text, values) : null;
      requestBody = {
        messaging_product: "whatsapp", recipient_type: "individual", to: phone,
        type: "template",
        template: { name: tpl.name, language: { code: tpl.language }, components },
      };
      await db.from("whatsapp_messages").update({
        template_id: tpl.id, template_name: tpl.name, template_language: tpl.language,
        rendered_params: components, body_preview: bodyPreview, to_phone_e164: phone,
      }).eq("id", message_id);
    } else {
      requestBody = {
        messaging_product: "whatsapp", recipient_type: "individual", to: phone,
        type: "text", text: { preview_url: false, body: String(claimed.session_body ?? "") },
      };
      bodyPreview = String(claimed.session_body ?? "");
    }

    // ---- Graph API call (this is the attempt that counts) ----
    const proof = await appSecretProof(creds.app_secret, creds.access_token);
    const version = creds.graph_api_version || "v25.0";
    const resp = await fetch(
      `https://graph.facebook.com/${version}/${creds.phone_number_id}/messages?appsecret_proof=${proof}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.access_token}` },
        body: JSON.stringify(requestBody),
      });
    const result = await resp.json().catch(() => ({}));

    if (resp.ok && result.messages?.[0]?.id) {
      const wamid = result.messages[0].id as string;
      await db.from("whatsapp_messages").update({
        status: "sent", wamid, sent_at: new Date().toISOString(), last_error: null, last_error_code: null,
      }).eq("id", message_id);
      if (contact?.id) {
        await db.from("whatsapp_contacts").update({
          last_outbound_at: new Date().toISOString(), wa_id: result.contacts?.[0]?.wa_id ?? contact.wa_id,
        }).eq("id", contact.id);
      } else {
        await db.from("whatsapp_contacts").insert({
          tenant_id: claimed.tenant_id, customer_id: claimed.customer_id, phone_e164: phone,
          wa_id: result.contacts?.[0]?.wa_id ?? null, last_outbound_at: new Date().toISOString(),
        });
      }
      if (claimed.case_id) {
        await db.rpc("log_case_communication", {
          p_case_id: claimed.case_id, p_type: "whatsapp", p_direction: "outbound",
          p_content: bodyPreview ?? "[template message]", p_sent_to: phone,
          p_sent_by: claimed.initiated_by ?? null,
        }).then(() => {}, (e: unknown) => console.error("log_case_communication:", e));
      } else if (claimed.customer_id) {
        await db.from("customer_communications").insert({
          tenant_id: claimed.tenant_id, customer_id: claimed.customer_id, type: "whatsapp",
          direction: "outbound", content: bodyPreview ?? "[template message]",
          status: "sent", sent_at: new Date().toISOString(), sent_by: claimed.initiated_by ?? null,
        });
      }
      return new Response(JSON.stringify({ ok: true, wamid }), { status: 200 });
    }

    // ---- error path: classify and act ----
    const code = Number(result.error?.code ?? resp.status);
    const detail = String(result.error?.error_data?.details ?? result.error?.message ?? `HTTP ${resp.status}`);
    const cls = classifySendError(code);
    // business-hours rules re-apply to retries: backoff, then shift into the window
    const windowedRetryAt = async (): Promise<string | null> => {
      if (rule?.send_window !== "business_hours") return null;
      const { data: at } = await db.rpc("whatsapp_apply_send_window", {
        p_tenant_id: claimed.tenant_id, p_send_window: "business_hours",
        p_business_hours: rule.business_hours,
        p_ts: new Date(Date.now() + computeBackoff(attempt) * 1000).toISOString(),
      });
      return (at as string | null) ?? null;
    };
    switch (cls.kind) {
      case "retry":
        if (attempt >= 5) await failMessage(message_id, code, `retries exhausted: ${detail}`);
        else await releaseForRetry(message_id, attempt, code, detail, await windowedRetryAt());
        break;
      case "suppress_marketing":
        if (contact?.id) {
          await db.from("whatsapp_contacts").update({
            marketing_suppressed_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          }).eq("id", contact.id);
        }
        await failMessage(message_id, code, detail);
        break;
      case "mark_unreachable":
        if (contact?.id) await db.from("whatsapp_contacts").update({ unreachable: true }).eq("id", contact.id);
        await failMessage(message_id, code, detail, "unreachable");
        break;
      case "template_broken":
        await failMessage(message_id, code, detail);
        if (claimed.template_id) {
          await db.from("whatsapp_templates").update({ quality_score: "RED" }).eq("id", claimed.template_id);
        }
        break;
      case "integration_quality_pause":
        await db.from("whatsapp_integrations").update({
          send_paused_until: new Date(Date.now() + 3600 * 1000).toISOString(),
          connection_status: "quality_paused",
        }).eq("id", integ.id);
        await releaseForHold(message_id, attempt, code, detail, 3600);
        break;
      case "integration_token_dead":
        await db.from("whatsapp_integrations").update({
          connection_status: "token_invalid", token_valid: false,
        }).eq("id", integ.id);
        await releaseForHold(message_id, attempt, code, detail, 3600); // queue holds until reconnect
        break;
      case "integration_locked":
        await db.from("whatsapp_integrations").update({ connection_status: "error" }).eq("id", integ.id);
        await failMessage(message_id, code, detail);
        break;
      default:
        await failMessage(message_id, code, detail);
    }
    if (["hard_fail", "template_broken", "integration_locked"].includes(cls.kind)
        || (cls.kind === "retry" && attempt >= 5)) {
      await emitEvent(claimed.tenant_id, "whatsapp.message_failed", "whatsapp_message", message_id,
        { case_id: claimed.case_id, event_key: claimed.event_key, error_code: code, detail },
        `whatsapp.message_failed:${message_id}`);
    }
    return new Response(JSON.stringify({ ok: false, code, detail }), { status: 200 });
  } catch (e) {
    console.error("whatsapp-send unexpected error:", e);
    // unexpected exceptions respect the attempt cap too — never loop forever
    const { data: row } = await db.from("whatsapp_messages")
      .select("attempt_count").eq("id", message_id).maybeSingle();
    if ((row?.attempt_count ?? 0) >= 5) await failMessage(message_id, 131000, String(e));
    else await releaseForRetry(message_id, row?.attempt_count ?? 1, 131000, String(e));
    return new Response(JSON.stringify({ ok: false, error: "internal" }), { status: 200 });
  }
});
```

Worker notes: HTTP responses are **200 even for handled failures** — DB-side retry state, not HTTP retries, governs redelivery (house convention). The claim happens before the Graph call; an unexpected crash leaves `processing`, which the scanner resets after 5 minutes. Attempts are consumed only by real Graph calls (holds refund the claim's increment), so a token outage can never burn the retry budget — pilot step 7 ("re-paste token → held messages drain") depends on this.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-send/
git commit -m "feat(whatsapp): send worker (claim, consent/window/pacing gates, Graph call, error-classified retry)"
```

### Task 7: `whatsapp-admin` edge function

**Files:**
- Create: `supabase/functions/whatsapp-admin/index.ts`

- [ ] **Step 1: Implement `index.ts`**

```ts
// Admin actions for the WhatsApp integration. User-JWT function (verify_jwt default true).
// Dual-client auth (house pattern: paypal-create-subscription): service client for privileged
// work + anon client with the caller's Authorization to resolve the user; owner/admin role gate;
// tenant scope gate; check_rate_limit per action.
// Actions: save_credentials | test_connection | sync_templates | submit_template |
//          delete_template | send_test | send_now
// Role gates: owner/admin for everything EXCEPT send_now, which any non-viewer staff
// role may call (it powers the SendMessageModal poke for manual sends).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = [
  "https://xsuite.space",
  "https://space-recovery.pages.dev",
  ...(Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",").map((o) => o.trim()).filter(Boolean),
];
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GRAPH = "https://graph.facebook.com";

async function proofOf(appSecret: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  return Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  // ---- auth: resolve caller, gate owner/admin + tenant ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }
  const body = await req.json().catch(() => ({}));
  const action: string = body.action;
  const STAFF_ROLES = ["owner", "admin", "manager", "technician", "sales", "accounts", "hr"];
  const { data: profile } = await db.from("profiles")
    .select("role, tenant_id").eq("id", userData.user.id).maybeSingle();
  const isPlatformAdmin = profile && ["owner", "admin"].includes(profile.role) && profile.tenant_id === null;
  const allowedRoles = action === "send_now" ? STAFF_ROLES : ["owner", "admin"];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }
  const tenantId: string = body.tenantId;
  if (!tenantId || (!isPlatformAdmin && profile.tenant_id !== tenantId)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }
  // fail CLOSED (house shape: only an explicit true passes)
  const { data: rl } = await db.rpc("check_rate_limit", {
    p_key: `whatsapp-admin:${userData.user.id}`, p_max_requests: 10, p_window_seconds: 60,
  });
  if (rl !== true) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429, headers: { ...cors, "Retry-After": "60" } });
  }
  try {
    // ---------- send_now: staff poke for a message row they just enqueued ----------
    // (SendMessageModal inserts the whatsapp_messages row under RLS, then calls this;
    // the worker requires the service-role bearer, which browsers must never hold.)
    if (action === "send_now") {
      const { messageId } = body;
      const { data: msg } = await db.from("whatsapp_messages")
        .select("id").eq("id", messageId).eq("tenant_id", tenantId)
        .eq("status", "pending").is("deleted_at", null).maybeSingle();
      if (!msg) return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers: cors });
      await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ message_id: msg.id }),
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    // ---------- save_credentials ----------
    if (action === "save_credentials") {
      const { appId, wabaId, phoneNumberId, accessToken, appSecret } = body;
      if (![appId, wabaId, phoneNumberId, accessToken, appSecret].every((v) => typeof v === "string" && v.length > 3)) {
        return new Response(JSON.stringify({ error: "All credential fields are required" }), { status: 422, headers: cors });
      }
      // validate BEFORE storing: token introspection + scope + WABA ownership
      const dbg = await fetch(
        `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      ).then((r) => r.json()).catch(() => null);
      const d = dbg?.data;
      if (!d?.is_valid) {
        return new Response(JSON.stringify({ error: "Meta rejected the access token (invalid or revoked)" }),
          { status: 422, headers: cors });
      }
      const scopes: string[] = d.scopes ?? [];
      for (const s of ["whatsapp_business_messaging", "whatsapp_business_management"]) {
        if (!scopes.includes(s)) {
          return new Response(JSON.stringify({ error: `Token is missing the ${s} permission` }),
            { status: 422, headers: cors });
        }
      }
      const granted = (d.granular_scopes ?? []).flatMap((g: { target_ids?: string[] }) => g.target_ids ?? []);
      if (granted.length > 0 && !granted.includes(wabaId)) {
        return new Response(JSON.stringify({ error: "Token is not authorized for the given WhatsApp Business Account ID" }),
          { status: 422, headers: cors });
      }
      // phone belongs to WABA + capture display metadata
      const phone = await fetch(
        `${GRAPH}/v25.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ).then((r) => r.json()).catch(() => null);
      if (!phone?.id && !phone?.display_phone_number) {
        return new Response(JSON.stringify({ error: "Phone Number ID not reachable with this token" }),
          { status: 422, headers: cors });
      }
      const { data: integId, error: storeErr } = await db.rpc("whatsapp_store_credentials", {
        p_tenant_id: tenantId, p_app_id: appId, p_waba_id: wabaId,
        p_phone_number_id: phoneNumberId,
        p_display_phone_number: phone.display_phone_number ?? null,
        p_access_token: accessToken, p_app_secret: appSecret,
      });
      if (storeErr) throw storeErr;
      await db.from("whatsapp_integrations").update({
        verified_name: phone.verified_name ?? null,
        quality_rating: phone.quality_rating ?? null,
        name_status: phone.name_status ?? null,
        token_expires_at: d.expires_at ? (d.expires_at === 0 ? null : new Date(d.expires_at * 1000).toISOString()) : null,
        last_health_check_at: new Date().toISOString(),
      }).eq("id", integId);
      return new Response(JSON.stringify({ success: true, integrationId: integId }), { status: 200, headers: cors });
    }

    // all remaining actions need stored credentials
    const { data: credRows } = await db.rpc("whatsapp_reveal_credentials", { p_tenant_id: tenantId });
    const creds = credRows?.[0];
    if (!creds?.access_token) {
      return new Response(JSON.stringify({ error: "WhatsApp is not connected yet" }), { status: 409, headers: cors });
    }
    const proof = await proofOf(creds.app_secret, creds.access_token);
    const authQ = `appsecret_proof=${proof}`;
    const headers = { Authorization: `Bearer ${creds.access_token}` };
    const V = creds.graph_api_version || "v25.0";

    // ---------- test_connection ----------
    if (action === "test_connection") {
      const [dbg, phone, health, subs] = await Promise.all([
        fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(creds.access_token)}&access_token=${encodeURIComponent(`${creds.app_id}|${creds.app_secret}`)}`).then((r) => r.json()).catch(() => null),
        fetch(`${GRAPH}/${V}/${creds.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,name_status,throughput&${authQ}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${GRAPH}/${V}/${creds.waba_id}?fields=health_status&${authQ}`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${GRAPH}/${V}/${creds.waba_id}/subscribed_apps?${authQ}`, { headers }).then((r) => r.json()).catch(() => null),
      ]);
      const tokenValid = dbg?.data?.is_valid === true;
      const canSend = health?.health_status?.can_send_message ?? "UNKNOWN";
      const webhookSubscribed = Array.isArray(subs?.data) && subs.data.length > 0;
      const { data: integ } = await db.from("whatsapp_integrations")
        .select("id, webhook_status, last_webhook_at").eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
      await db.from("whatsapp_integrations").update({
        token_valid: tokenValid,
        connection_status: tokenValid ? (canSend === "BLOCKED" ? "error" : "connected") : "token_invalid",
        quality_rating: phone?.quality_rating ?? null,
        name_status: phone?.name_status ?? null,
        verified_name: phone?.verified_name ?? null,
        health_errors: health?.health_status?.entities?.flatMap((e: { errors?: unknown[] }) => e.errors ?? []) ?? [],
        last_health_check_at: new Date().toISOString(),
      }).eq("id", integ!.id);
      return new Response(JSON.stringify({
        success: true,
        checks: {
          token: tokenValid,
          tokenExpiresAt: dbg?.data?.expires_at === 0 ? null : dbg?.data?.expires_at ?? null,
          phone: Boolean(phone?.display_phone_number),
          displayPhoneNumber: phone?.display_phone_number ?? null,
          verifiedName: phone?.verified_name ?? null,
          qualityRating: phone?.quality_rating ?? null,
          nameStatus: phone?.name_status ?? null,
          throughputLevel: phone?.throughput?.level ?? null,
          canSendMessage: canSend,
          healthErrors: health?.health_status?.entities ?? [],
          webhookSubscribed,
          webhookVerified: integ?.webhook_status !== "unverified",
          lastWebhookAt: integ?.last_webhook_at ?? null,
        },
      }), { status: 200, headers: cors });
    }

    // ---------- sync_templates ----------
    if (action === "sync_templates") {
      let url = `${GRAPH}/${V}/${creds.waba_id}/message_templates?fields=id,name,language,category,status,quality_score,components,parameter_format&limit=100&${authQ}`;
      let synced = 0;
      while (url) {
        const page = await fetch(url, { headers }).then((r) => r.json());
        if (page.error) throw new Error(page.error.message);
        for (const t of page.data ?? []) {
          const { data: existing } = await db.from("whatsapp_templates")
            .select("id").eq("tenant_id", tenantId).eq("name", t.name).eq("language", t.language)
            .is("deleted_at", null).is("superseded_by", null).maybeSingle();
          const patch = {
            meta_template_id: String(t.id), category: t.category, status: t.status,
            quality_score: t.quality_score?.score ?? null,
            components: t.components ?? [],
            parameter_format: (t.parameter_format ?? "NAMED").toLowerCase(),
            last_synced_at: new Date().toISOString(),
          };
          if (existing) await db.from("whatsapp_templates").update(patch).eq("id", existing.id);
          else await db.from("whatsapp_templates").insert({ tenant_id: tenantId, name: t.name, language: t.language, ...patch });
          synced++;
        }
        url = page.paging?.next ?? null;
      }
      return new Response(JSON.stringify({ success: true, synced }), { status: 200, headers: cors });
    }

    // ---------- submit_template ----------
    if (action === "submit_template") {
      const { templateId } = body;
      const { data: tpl } = await db.from("whatsapp_templates")
        .select("*").eq("id", templateId).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
      if (!tpl) return new Response(JSON.stringify({ error: "Template not found" }), { status: 404, headers: cors });
      const resp = await fetch(`${GRAPH}/${V}/${creds.waba_id}/message_templates?${authQ}`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tpl.name, language: tpl.language, category: tpl.category,
          parameter_format: tpl.parameter_format, components: tpl.components,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: result.error?.error_user_msg ?? result.error?.message ?? "Meta rejected the template" }),
          { status: 422, headers: cors });
      }
      await db.from("whatsapp_templates").update({
        meta_template_id: String(result.id), status: result.status ?? "PENDING",
        category: result.category ?? tpl.category, last_synced_at: new Date().toISOString(),
      }).eq("id", templateId);
      return new Response(JSON.stringify({ success: true, status: result.status ?? "PENDING" }), { status: 200, headers: cors });
    }

    // ---------- delete_template ----------
    if (action === "delete_template") {
      const { templateId } = body;
      const { data: tpl } = await db.from("whatsapp_templates")
        .select("id, name").eq("id", templateId).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
      if (!tpl) return new Response(JSON.stringify({ error: "Template not found" }), { status: 404, headers: cors });
      await fetch(`${GRAPH}/${V}/${creds.waba_id}/message_templates?name=${encodeURIComponent(tpl.name)}&${authQ}`,
        { method: "DELETE", headers });
      // Meta's DELETE-by-name removes ALL language variants — soft-delete the whole
      // family locally so send-time resolution can never pick a dead translation (132001)
      await db.from("whatsapp_templates").update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("name", tpl.name).is("deleted_at", null);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    // ---------- send_test ----------
    if (action === "send_test") {
      const { to, templateId } = body;
      const { data: tpl } = await db.from("whatsapp_templates")
        .select("*").eq("id", templateId).eq("tenant_id", tenantId)
        .eq("status", "APPROVED").is("deleted_at", null).maybeSingle();
      if (!tpl) return new Response(JSON.stringify({ error: "Approved template required" }), { status: 422, headers: cors });
      // enqueue through the normal pipeline so the test exercises the real path
      const { data: msg, error } = await db.from("whatsapp_messages").insert({
        tenant_id: tenantId, message_kind: "template", template_id: tpl.id,
        to_phone_e164: to, event_key: "manual.test", initiated_by: userData.user.id,
        priority: 1, dedup_key: `manual.test:${crypto.randomUUID()}`,
      }).select("id").maybeSingle();
      if (error || !msg) throw error ?? new Error("insert returned no row");
      await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ message_id: msg.id }),
      });
      return new Response(JSON.stringify({ success: true, messageId: msg.id }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
  } catch (e) {
    console.error("whatsapp-admin error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again later." }),
      { status: 500, headers: cors });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-admin/
git commit -m "feat(whatsapp): admin edge function (validated credential save, 3-probe test, template sync/submit, test send)"
```

### Task 8: Deploy edge functions + wire settings

- [ ] **Step 1: Deploy all three** via `mcp__supabase__deploy_edge_function` (project `ssmbegiyjivrcwgcqutu`): `whatsapp-webhook` (files: index.ts, webhookCore.ts), `whatsapp-send` (index.ts, waCore.ts), `whatsapp-admin` (index.ts). No new platform env secrets are needed (per-tenant credentials live in Vault; `SUPABASE_URL`/`SERVICE_ROLE_KEY`/`ANON_KEY` are injected by the platform).

- [ ] **Step 2: Prove `verify_jwt=false` took effect for the webhook** — `config.toml` only governs CLI deploys, so after an MCP deploy this MUST be verified: `curl -s -o /dev/null -w '%{http_code}' 'https://<project>.supabase.co/functions/v1/whatsapp-webhook?t=x'` with NO Authorization header must return **403** (the handler's own Forbidden), NOT a gateway **401**. If it returns 401, redeploy `whatsapp-webhook` via `supabase functions deploy whatsapp-webhook` (honors config.toml) or flip the function's "Verify JWT" toggle in the dashboard, then re-test. The other two functions keep JWT verification ON.

- [ ] **Step 3: Confirm cron plumbing** — `system_settings_internal` rows `edge_function_base_url` + `edge_function_service_key` already exist for the follow-ups pipeline (verify: `select key from system_settings_internal;` returns both). If absent in an environment, the WhatsApp jobs stay dormant by design.

- [ ] **Step 4: End-to-end smoke (Meta test number)** — using a staging tenant: `save_credentials` with the app's test number credentials → `test_connection` returns token+phone+health green → configure the webhook URL `https://<project>.supabase.co/functions/v1/whatsapp-webhook?t=<public_id>` + the row's `webhook_verify_token` in the Meta app dashboard → dashboard shows Verified and `whatsapp_integrations.webhook_status='verified'` → `sync_templates` pulls `hello_world` → `send_test` to a verified test recipient → row reaches `status='delivered'` via webhook. Record evidence in the PR.

- [ ] **Step 5: Commit** any config notes:

```bash
git add -A && git commit -m "chore(whatsapp): deploy notes + smoke evidence for edge functions"
```

---

## Phase 2 — Services & Settings UI

> UI/UX gate: building these surfaces requires loading `ui-ux-pro-max` + `frontend-design` (CLAUDE.md mixed-task rule). All styling uses semantic tokens; icons are lucide-react; modals follow the `CustomerFormModal` contract; settings pages follow the `SettingsPageHeader` anatomy.

### Task 9: Client service `whatsappService.ts`

**Files:**
- Create: `src/lib/whatsappService.ts`
- Test: `src/lib/whatsappService.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/whatsappService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diffRulesToSeed, summarizeConsent } from './whatsappService';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

describe('diffRulesToSeed', () => {
  it('returns one insert per catalog event missing from existing rules', () => {
    const existing = [{ event_key: 'case.created' }, { event_key: 'quote.sent' }];
    const inserts = diffRulesToSeed(existing, 'tenant-1');
    expect(inserts).toHaveLength(WHATSAPP_EVENT_CATALOG.length - 2);
    const row = inserts.find((r) => r.event_key === 'case.feedback_request');
    expect(row).toMatchObject({
      tenant_id: 'tenant-1', enabled: false, required_consent: 'marketing',
      reminder_config: { after_days: 2 },
    });
  });
  it('returns [] when everything exists', () => {
    const existing = WHATSAPP_EVENT_CATALOG.map((e) => ({ event_key: e.key }));
    expect(diffRulesToSeed(existing, 't')).toHaveLength(0);
  });
});

describe('summarizeConsent', () => {
  it('reduces the consent-state rows to a per-scope boolean map', () => {
    expect(summarizeConsent([
      { scope: 'utility', opted_in: true, occurred_at: '2026-01-01' },
      { scope: 'marketing', opted_in: false, occurred_at: '2026-01-02' },
    ])).toEqual({ utility: true, marketing: false });
    expect(summarizeConsent([])).toEqual({ utility: false, marketing: false });
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run src/lib/whatsappService.test.ts`)

- [ ] **Step 3: Implement `src/lib/whatsappService.ts`**

```ts
import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

export type WhatsAppIntegration = Database['public']['Tables']['whatsapp_integrations']['Row'];
export type WhatsAppRule = Database['public']['Tables']['whatsapp_automation_rules']['Row'];
export type WhatsAppRuleInsert = Database['public']['Tables']['whatsapp_automation_rules']['Insert'];
export type WhatsAppTemplate = Database['public']['Tables']['whatsapp_templates']['Row'];
export type WhatsAppMessage = Database['public']['Tables']['whatsapp_messages']['Row'];
export type WhatsAppConsent = Database['public']['Tables']['whatsapp_consents']['Row'];

export interface ConsentStateRow { scope: string; opted_in: boolean; occurred_at: string; }

/** Pure: which catalog events have no rule row yet (used to seed defaults on first visit). */
export function diffRulesToSeed(
  existing: Array<Pick<WhatsAppRule, 'event_key'>>, tenantId: string,
): WhatsAppRuleInsert[] {
  const have = new Set(existing.map((r) => r.event_key));
  return WHATSAPP_EVENT_CATALOG.filter((e) => !have.has(e.key)).map((e) => ({
    tenant_id: tenantId,
    event_key: e.key,
    enabled: false,
    required_consent: e.requiredConsent,
    delay_minutes: e.defaultDelayMinutes,
    reminder_config: e.defaultReminderConfig ?? {},
  }));
}

/** Pure: consent-state rows → { utility, marketing } booleans. */
export function summarizeConsent(rows: ConsentStateRow[]): { utility: boolean; marketing: boolean } {
  const get = (scope: string) => rows.find((r) => r.scope === scope)?.opted_in ?? false;
  return { utility: get('utility'), marketing: get('marketing') };
}

export async function getIntegration(): Promise<WhatsAppIntegration | null> {
  const { data, error } = await supabase.from('whatsapp_integrations')
    .select('*').is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRules(): Promise<WhatsAppRule[]> {
  const { data, error } = await supabase.from('whatsapp_automation_rules')
    .select('*').is('deleted_at', null).order('event_key');
  if (error) throw error;
  return data ?? [];
}

export async function ensureRules(tenantId: string): Promise<void> {
  const rules = await listRules();
  const inserts = diffRulesToSeed(rules, tenantId);
  if (inserts.length === 0) return;
  const { error } = await supabase.from('whatsapp_automation_rules').insert(inserts);
  if (error && error.code !== '23505') throw error; // concurrent seeding is fine
}

export async function updateRule(id: string, patch: Partial<WhatsAppRule>): Promise<void> {
  const { error } = await supabase.from('whatsapp_automation_rules').update(patch).eq('id', id);
  if (error) throw error;
}

export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabase.from('whatsapp_templates')
    .select('*').is('deleted_at', null).is('superseded_by', null)
    .order('name').order('language');
  if (error) throw error;
  return data ?? [];
}

export async function saveDraftTemplate(
  row: Database['public']['Tables']['whatsapp_templates']['Insert'],
): Promise<WhatsAppTemplate> {
  const { data, error } = await supabase.from('whatsapp_templates')
    .insert(row).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Template insert returned no row');
  return data;
}

export async function listMessages(filters: {
  caseId?: string; customerId?: string; status?: string; limit?: number;
}): Promise<WhatsAppMessage[]> {
  let q = supabase.from('whatsapp_messages').select('*')
    .is('deleted_at', null).order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.caseId) q = q.eq('case_id', filters.caseId);
  if (filters.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function retryMessage(id: string): Promise<void> {
  const { error } = await supabase.from('whatsapp_messages')
    .update({ status: 'pending', next_attempt_at: null, attempt_count: 0, last_error: null })
    .eq('id', id).eq('status', 'failed');
  if (error) throw error;
}

export async function getConsentState(tenantId: string, customerId: string): Promise<ConsentStateRow[]> {
  const { data, error } = await supabase.rpc('whatsapp_consent_state', {
    p_tenant_id: tenantId, p_customer_id: customerId,
  });
  if (error) throw error;
  return (data ?? []) as ConsentStateRow[];
}

export async function recordConsent(row: Database['public']['Tables']['whatsapp_consents']['Insert']): Promise<void> {
  const { error } = await supabase.from('whatsapp_consents').insert(row);
  if (error) throw error;
}

/**
 * All whatsapp-admin edge actions go through here. On a non-2xx response
 * supabase-js raises a generic FunctionsHttpError WITHOUT the body — the real
 * validation message ("Meta rejected the access token…", scope errors, template
 * rejections) lives in error.context; surface it or the Connection tab shows
 * "Edge Function returned a non-2xx status code" for every failure.
 */
export async function whatsappAdmin<T = Record<string, unknown>>(
  action: string, payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
    body: { action, ...payload },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
```

- [ ] **Step 4: Run — PASS**, then `npx tsc --noEmit`, then commit:

```bash
git add src/lib/whatsappService.ts src/lib/whatsappService.test.ts
git commit -m "feat(whatsapp): client service (rules seeding, templates, messages, consents, admin bridge)"
```

### Task 10: Settings module shell

**Files:**
- Create: `src/pages/settings/CommunicationSettings.tsx`
- Modify: `src/config/settingsCategories.ts` (new category)
- Modify: `src/pages/settings/SettingsDashboard.tsx` (explicit click branch)
- Modify: `src/App.tsx` (route inside the ADMIN_ROLES block, above the `:categoryId` catch-all)

- [ ] **Step 1: Category** — in `src/config/settingsCategories.ts` append to `SETTINGS_CATEGORIES`:

```ts
  {
    id: 'communications',
    title: 'Communications',
    icon: MessageCircle,          // add to the lucide-react import list at the top
    backgroundColor: '#0E7490',   // cyan-700-family accent, matches the workspace group palette
    borderColor: '#155E75',
    tables: [],
    actionLabel: 'Configure',
    description: 'WhatsApp connection, automated customer notifications, and message templates',
  },
```

and add `'communications'` to the `workspace` group's `categoryIds` in `SETTINGS_GROUPS`.

- [ ] **Step 2: Dashboard branch** — in `SettingsDashboard.tsx` `handleCategoryClick`, add:

```ts
    } else if (categoryId === 'communications') {
      navigate('/settings/communications');
```

- [ ] **Step 3: Route** — in `src/App.tsx`, inside the settings ADMIN_ROLES block (above the `:categoryId` catch-all):

```tsx
<Route path="communications" lazy={page(() => import('./pages/settings/CommunicationSettings'), 'CommunicationSettings')} />
```

- [ ] **Step 4: Page shell** — `src/pages/settings/CommunicationSettings.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plug, Zap, LayoutTemplate } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { WhatsAppConnectionTab } from '../../components/settings/whatsapp/WhatsAppConnectionTab';
import { WhatsAppAutomationsTab } from '../../components/settings/whatsapp/WhatsAppAutomationsTab';
import { WhatsAppTemplatesTab } from '../../components/settings/whatsapp/WhatsAppTemplatesTab';

const TABS = [
  { id: 'connection', label: 'Connection', icon: Plug },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
] as const;

export function CommunicationSettings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('connection');
  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="communications" />
      <button
        onClick={() => navigate('/settings')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ChevronLeft className="h-4 w-4" /> Settings
      </button>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'connection' && <WhatsAppConnectionTab />}
      {tab === 'automations' && <WhatsAppAutomationsTab />}
      {tab === 'templates' && <WhatsAppTemplatesTab />}
    </div>
  );
}
export default CommunicationSettings;
```

- [ ] **Step 5:** `npx tsc --noEmit` will fail until Task 11–13 components exist — create the three component files as minimal placeholders exporting an empty section IN THE SAME COMMIT AS TASK 11–13, or implement Tasks 10–13 as one PR-sized unit. Recommended: complete Tasks 10–13 before the commit at the end of Task 13.

### Task 11: Connection tab

**Files:**
- Create: `src/components/settings/whatsapp/WhatsAppConnectionTab.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, ShieldCheck, Phone, Webhook,
} from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import { getIntegration, whatsappAdmin } from '../../../lib/whatsappService';
import { useTenantConfig } from '../../../contexts/TenantConfigContext';
import { Input } from '../../ui/Input';
import { supabase } from '../../../lib/supabaseClient';

interface TestChecks {
  token: boolean; tokenExpiresAt: number | null; phone: boolean;
  displayPhoneNumber: string | null; verifiedName: string | null;
  qualityRating: string | null; nameStatus: string | null; throughputLevel: string | null;
  canSendMessage: string; webhookSubscribed: boolean; webhookVerified: boolean;
  lastWebhookAt: string | null;
}

const STATUS_TONE: Record<string, string> = {
  connected: 'bg-success-muted text-success',
  disconnected: 'bg-slate-100 text-slate-500',
  error: 'bg-danger-muted text-danger',
  token_invalid: 'bg-danger-muted text-danger',
  quality_paused: 'bg-warning-muted text-warning',
};

export function WhatsAppConnectionTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const tenantId = config?.tenantId ?? '';
  const { data: integration, isLoading } = useQuery({
    queryKey: whatsappKeys.integration(), queryFn: getIntegration,
  });
  const [form, setForm] = useState({ appId: '', wabaId: '', phoneNumberId: '', accessToken: '', appSecret: '' });
  const [checks, setChecks] = useState<TestChecks | null>(null);

  const webhookUrl = useMemo(() => {
    const base = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl
      ?? import.meta.env.VITE_SUPABASE_URL;
    return integration ? `${base}/functions/v1/whatsapp-webhook?t=${integration.public_id}` : '';
  }, [integration]);

  const save = useMutation({
    mutationFn: () => whatsappAdmin('save_credentials', { tenantId, ...form }),
    onSuccess: () => {
      setForm({ appId: '', wabaId: '', phoneNumberId: '', accessToken: '', appSecret: '' });
      qc.invalidateQueries({ queryKey: whatsappKeys.all });
    },
  });
  const test = useMutation({
    mutationFn: () => whatsappAdmin<{ checks: TestChecks }>('test_connection', { tenantId }),
    onSuccess: (r) => { setChecks(r.checks); qc.invalidateQueries({ queryKey: whatsappKeys.integration() }); },
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;

  const connected = integration?.connection_status === 'connected';
  const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) => (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
      <span className="text-slate-700">{label}</span>
      {detail && <span className="text-xs text-slate-400">{detail}</span>}
    </li>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* status card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2"><Phone className="h-5 w-5 text-primary" /></div>
            <div>
              <div className="font-semibold text-slate-900">
                {integration?.verified_name ?? 'WhatsApp Business'}
                {integration?.display_phone_number && (
                  <span className="ml-2 text-sm font-normal text-slate-500">{integration.display_phone_number}</span>
                )}
              </div>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[integration?.connection_status ?? 'disconnected']}`}>
                {integration?.connection_status ?? 'disconnected'}
              </span>
            </div>
          </div>
          <button
            onClick={() => test.mutate()}
            disabled={!integration || test.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? 'animate-spin' : ''}`} /> Test Connection
          </button>
        </div>
        {integration && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div><dt className="text-xs text-slate-400">Quality</dt><dd className="text-slate-700">{integration.quality_rating ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Messaging tier</dt><dd className="text-slate-700">{integration.messaging_limit_tier ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Display name</dt><dd className="text-slate-700">{integration.name_status ?? 'Not reviewed'}</dd></div>
            <div><dt className="text-xs text-slate-400">API version</dt><dd className="text-slate-700">{integration.graph_api_version}</dd></div>
            <div><dt className="text-xs text-slate-400">Token expiry</dt><dd className="text-slate-700">{integration.token_expires_at ? new Date(integration.token_expires_at).toLocaleDateString() : 'Never'}</dd></div>
          </dl>
        )}
        {checks && (
          <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4">
            <Check ok={checks.token} label="Access token valid" />
            <Check ok={checks.phone} label="Phone number reachable" detail={checks.displayPhoneNumber} />
            <Check ok={checks.canSendMessage === 'AVAILABLE'} label="Account can send messages" detail={checks.canSendMessage} />
            <Check ok={checks.webhookSubscribed} label="App subscribed to WABA webhooks" />
            <Check ok={checks.webhookVerified} label="Webhook endpoint verified" detail={checks.lastWebhookAt ? `last event ${new Date(checks.lastWebhookAt).toLocaleString()}` : null} />
          </ul>
        )}
      </div>

      {/* credentials card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-primary" /> Meta Cloud API credentials
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Stored encrypted (Supabase Vault). Secrets are never shown again after saving —
          use Replace to rotate. Create these in Meta Business Settings → System Users
          (token needs <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code>).
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input floatingLabel label="App ID" value={form.appId}
            onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value }))} />
          <Input floatingLabel label="Business Account ID (WABA)" value={form.wabaId}
            onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))} />
          <Input floatingLabel label="Phone Number ID" value={form.phoneNumberId}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))} />
          <Input floatingLabel label="App Secret" type="password" value={form.appSecret}
            placeholder={connected ? '••••••••  (saved)' : ''}
            onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))} />
          <div className="md:col-span-2">
            <Input floatingLabel label="Permanent Access Token" type="password" value={form.accessToken}
              placeholder={connected ? '••••••••  (saved)' : ''}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} />
          </div>
        </div>
        {save.isError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" /> {(save.error as Error).message}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.values(form).some((v) => !v)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? 'Validating with Meta…' : connected ? 'Replace credentials' : 'Connect'}
          </button>
        </div>
      </div>

      {/* webhook card */}
      {integration && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <Webhook className="h-4 w-4 text-primary" /> Webhook configuration
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            In your Meta app → WhatsApp → Configuration, set this Callback URL and Verify Token,
            then subscribe to <code>messages</code>, <code>message_template_status_update</code>,
            <code>message_template_quality_update</code>, <code>template_category_update</code>,
            <code>phone_number_quality_update</code> and <code>account_update</code>.
          </p>
          {[['Callback URL', webhookUrl], ['Verify Token', integration.webhook_verify_token]].map(([label, value]) => (
            <div key={label} className="mb-2 flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-slate-400">{label}</span>
              <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">{value}</code>
              <button onClick={() => navigator.clipboard.writeText(String(value))}
                className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label={`Copy ${label}`}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Task 12: Automations tab

**Files:**
- Create: `src/components/settings/whatsapp/WhatsAppAutomationsTab.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MessageSquareText } from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import {
  diffRulesToSeed, ensureRules, getIntegration, listRules, listTemplates, updateRule,
  type WhatsAppRule,
} from '../../../lib/whatsappService';
import { WHATSAPP_EVENT_CATALOG } from '../../../lib/whatsapp/events';
import { useTenantConfig, useTenantFeature } from '../../../contexts/TenantConfigContext';

export function WhatsAppAutomationsTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const whatsappEnabled = useTenantFeature('automation.whatsapp');
  const tenantId = config?.tenantId ?? '';

  const { data: integration } = useQuery({ queryKey: whatsappKeys.integration(), queryFn: getIntegration });
  const { data: rules } = useQuery({ queryKey: whatsappKeys.rules(), queryFn: listRules });
  const { data: templates } = useQuery({ queryKey: whatsappKeys.templates(), queryFn: listTemplates });

  useEffect(() => {
    // seed by SET DIFFERENCE, not row count (non-catalog rows must not mask missing
    // catalog rows), and never let a failed seed become an unhandled rejection
    if (tenantId && rules && diffRulesToSeed(rules, tenantId).length > 0) {
      ensureRules(tenantId)
        .then(() => qc.invalidateQueries({ queryKey: whatsappKeys.rules() }))
        .catch((e) => console.error('WhatsApp rule seeding failed:', e));
    }
  }, [tenantId, rules, qc]);

  const [draft, setDraft] = useState<Record<string, Partial<WhatsAppRule>>>({});
  const byKey = useMemo(() => new Map((rules ?? []).map((r) => [r.event_key, r])), [rules]);
  const stages = useMemo(
    () => [...new Set(WHATSAPP_EVENT_CATALOG.map((e) => e.stage))], []);
  const approvedTemplates = (templates ?? []).filter((t) => t.status === 'APPROVED');
  const templateFamilies = [...new Map(approvedTemplates.map((t) => [t.name, t])).values()];

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const [id, patch] of Object.entries(draft)) await updateRule(id, patch);
    },
    onSuccess: () => { setDraft({}); qc.invalidateQueries({ queryKey: whatsappKeys.rules() }); },
  });

  const patchOf = (rule: WhatsAppRule) => ({ ...rule, ...(draft[rule.id] ?? {}) });
  const setPatch = (rule: WhatsAppRule, patch: Partial<WhatsAppRule>) =>
    setDraft((d) => ({ ...d, [rule.id]: { ...(d[rule.id] ?? {}), ...patch } }));
  const dirty = Object.keys(draft).length > 0;
  const blocked = !integration || integration.connection_status !== 'connected' || !whatsappEnabled;

  return (
    <div className="max-w-4xl space-y-6 pb-24">
      {blocked && (
        <div className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm text-warning">
          {!integration || integration.connection_status !== 'connected'
            ? 'Connect WhatsApp first (Connection tab). Automations stay off until the connection is healthy.'
            : 'The "WhatsApp Automation" feature toggle is off (Settings → Features & Modules).'}
        </div>
      )}
      {stages.map((stage) => (
        <section key={stage} className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {stage}
          </h3>
          <ul className="divide-y divide-slate-100">
            {WHATSAPP_EVENT_CATALOG.filter((e) => e.stage === stage).map((event) => {
              const rule = byKey.get(event.key);
              if (!rule) {
                // not yet seeded (first visit, insert in flight) — visible but inert
                return (
                  <li key={event.key} className="flex items-center gap-3 px-5 py-3 opacity-50">
                    <div className="h-5 w-9 rounded-full bg-slate-200" />
                    <div className="text-sm text-slate-500">{event.label} — preparing…</div>
                  </li>
                );
              }
              const value = patchOf(rule);
              return (
                <li key={event.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" checked={value.enabled}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { enabled: e.target.checked })} />
                    <div className="h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-primary
                                    after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full
                                    after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {event.label}
                      {event.requiredConsent === 'marketing' && (
                        <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          marketing consent
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">{event.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-slate-400" />
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                      value={value.template_id ?? ''}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { template_id: e.target.value || null })}
                    >
                      <option value="">No template — off</option>
                      {templateFamilies.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <Clock className="h-4 w-4 text-slate-400" />
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                      value={value.delay_minutes}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { delay_minutes: Number(e.target.value) })}
                    >
                      <option value={0}>Instant</option>
                      <option value={15}>15 min</option>
                      <option value={60}>1 hour</option>
                      <option value={240}>4 hours</option>
                      <option value={1440}>1 day</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={value.send_window === 'business_hours'}
                        disabled={blocked}
                        onChange={(e) => setPatch(rule, { send_window: e.target.checked ? 'business_hours' : 'any' })} />
                      Business hours
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="text-sm text-slate-600">{Object.keys(draft).length} automation(s) changed</span>
            <div className="flex gap-2">
              <button onClick={() => setDraft({})}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Discard</button>
              <button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Task 13: Templates tab + Template Studio

**Files:**
- Create: `src/components/settings/whatsapp/WhatsAppTemplatesTab.tsx`
- Create: `src/components/settings/whatsapp/WhatsAppTemplateStudio.tsx`
- Create: `src/components/settings/whatsapp/WhatsAppBubblePreview.tsx`

- [ ] **Step 1: Preview component** — `WhatsAppBubblePreview.tsx` (chat-bubble live preview; sample values from the variable map):

```tsx
interface Props { bodyText: string; footerText?: string; sampleValues: Record<string, string>; headerText?: string; }

export function WhatsAppBubblePreview({ bodyText, footerText, headerText, sampleValues }: Props) {
  const render = (t: string) => t.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k: string) => sampleValues[k] ?? `{{${k}}}`);
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <div className="max-w-xs rounded-lg rounded-tl-none bg-white p-3 shadow-sm">
        {headerText && <div className="mb-1 text-sm font-semibold text-slate-900">{render(headerText)}</div>}
        <div className="whitespace-pre-wrap text-sm text-slate-800">{render(bodyText)}</div>
        {footerText && <div className="mt-2 text-[11px] text-slate-400">{footerText}</div>}
        <div className="mt-1 text-right text-[10px] text-slate-400">12:30 ✓✓</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Templates tab** — `WhatsAppTemplatesTab.tsx`: table of template families (name, languages as chips, category, status chip, quality dot, linked event) with actions **New template** (opens the studio), **Sync from Meta** (`whatsappAdmin('sync_templates', { tenantId })`), row action **Submit to Meta** for DRAFT rows. Status chip tones: APPROVED `bg-success-muted text-success`, PENDING `bg-warning-muted text-warning`, REJECTED/DISABLED `bg-danger-muted text-danger`, PAUSED `bg-warning-muted text-warning`, DRAFT `bg-slate-100 text-slate-500`. Uses `whatsappKeys.templates()` + `listTemplates`. Implementation is a straightforward table composition of the primitives used in Task 12 (same list/card classes); the one non-obvious rule: group rows by `name` and render one row per family with language chips.

- [ ] **Step 3: Template Studio** — `WhatsAppTemplateStudio.tsx`, a right-side panel/modal (follow the `CustomerFormModal` chrome contract: `titleSize="sm"`, icon badge, `closeOnBackdrop={false}`):
  - Fields: display name → auto-slugged Meta `name` (lowercase, underscores), language select (from `geo_languages` actives), category select (UTILITY default, with the warning copy: *"Promotional wording in a UTILITY template will be recategorized by Meta as MARKETING and billed accordingly"*), body textarea with insert-variable chips sourced from `master_template_variables` **restricted to the worker-supported key list** (the Task 17 catalog — chips outside it would render as "—" in real messages), optional footer, header: none / text / **tenant logo image** (writes an `IMAGE`-format HEADER component; send-time media comes from `company_settings.branding.logo_url`).
  - **Buttons editor** (spec §12): up to 3 rows of quick-reply (text; the send-time payload is the uppercased text — STOP words become recognizable inbound opt-outs), dynamic-URL (base URL + `{{1}}` suffix bound to a context key stored as `variable_map['button_url_<index>']`), or phone buttons. MARKETING-category templates get an **Unsubscribe** quick-reply pre-added (removable with a policy warning).
  - Right side: `WhatsAppBubblePreview` bound to the live body + sample values (+ button pills under the bubble).
  - Save = `saveDraftTemplate` (status DRAFT); Submit = save + `whatsappAdmin('submit_template', { tenantId, templateId })`.
  - **Edit an APPROVED template** = version n+1: clone the row (`version: n+1`), set the old row's `superseded_by` to the clone, submit the clone via Meta's template-edit endpoint (`POST /{meta_template_id}`); surface Meta's edit limits in the UI (max 10 edits/30 days, 1/24h) and block the action when `last_synced_at` shows an edit in the past 24h.
  - Validation before submit: name matches `/^[a-z0-9_]{1,512}$/`, body ≤ 1024 chars, no adjacent variables (`}}{{` forbidden), every variable present in `variable_map`, image-header templates require a tenant logo URL to be configured.

- [ ] **Step 4: Verify + commit (Tasks 10–13 together)**

```bash
npx tsc --noEmit && npx vitest run src/lib/whatsappService.test.ts src/lib/whatsapp/events.test.ts
git add src/pages/settings/CommunicationSettings.tsx src/components/settings/whatsapp/ \
        src/config/settingsCategories.ts src/pages/settings/SettingsDashboard.tsx src/App.tsx
git commit -m "feat(whatsapp): Communications settings module (connection, automations matrix, template studio)"
```

---

## Phase 3 — Consent, case surfaces, analytics

### Task 14: Consent capture (customer modal, intake wizard, profile panel)

**Files:**
- Create: `src/components/customers/WhatsAppConsentBlock.tsx`
- Modify: `src/components/customers/CustomerFormModal.tsx` (render the block under the phone fields)
- Modify: `src/components/cases/CreateCaseWizard.tsx` (render the block in the customer step)
- Modify: `src/pages/customers/CustomerProfilePage.tsx` (consent panel with history)

- [ ] **Step 1: Shared block** — `WhatsAppConsentBlock.tsx` is the single consent-capture UI used by both the customer modal and the intake wizard:

```tsx
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { whatsappKeys } from '../../lib/queryKeys';
import { getConsentState, summarizeConsent } from '../../lib/whatsappService';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useCompanyName } from '../../lib/companySettingsService';

export interface ConsentDraft { utility: boolean; marketing: boolean; }

interface Props {
  customerId?: string;              // absent during create — state is draft-only, written after save
  value: ConsentDraft;
  onChange: (v: ConsentDraft) => void;
}

export function WhatsAppConsentBlock({ customerId, value, onChange }: Props) {
  const { config } = useTenantConfig();
  const companyName = useCompanyName();
  const { data: existing } = useQuery({
    queryKey: whatsappKeys.consents(customerId ?? 'new'),
    queryFn: () => getConsentState(config!.tenantId, customerId!),
    enabled: Boolean(customerId && config?.tenantId),
  });
  const current = existing ? summarizeConsent(existing) : null;

  const Row = ({ scope, label, hint }: { scope: keyof ConsentDraft; label: string; hint: string }) => (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={value[scope]}
        onChange={(e) => onChange({ ...value, [scope]: e.target.checked })}
      />
      <span>
        <span className="text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
        {current && current[scope] && (
          <span className="text-[11px] text-success">Already opted in</span>
        )}
      </span>
    </label>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp updates
      </div>
      <div className="space-y-2">
        <Row scope="utility" label={`Receive case & service updates from ${companyName} on WhatsApp`}
          hint="Status changes, quotes, invoices, collection reminders" />
        <Row scope="marketing" label={`Receive feedback & review requests from ${companyName}`}
          hint="Occasional post-service messages; opt out any time by replying STOP" />
      </div>
    </div>
  );
}
```

(`useCompanyName` — if no such helper exists yet, read `basic_info.company_name` via the existing `companySettingsService` cached getter and export a tiny hook there.)

**Consent-text capture rule:** on save, the caller writes one `whatsapp_consents` row per checked scope with `consent_text` set to the exact label string rendered above (build the string from the same template literal — never re-type it) and `source: 'staff'` (modal) or `'intake_form'` (wizard).

- [ ] **Step 2: CustomerFormModal** — under the existing `mobile_number`/`phone_number` `PhoneInput` grid row, add a `whatsapp_number` `PhoneInput` (floatingLabel, `countries={countries}`, `selectedCountryId={formData.country_id}` — the `countries` prop is REQUIRED on PhoneInput; copy the existing mobile_number field's usage) into the progressive-disclosure section, and render `<WhatsAppConsentBlock>` beneath it holding local `consentDraft` state (`{utility:false, marketing:false}`). In the save handler, after a successful create/update, call `recordConsent` once per newly-checked scope:

```tsx
if (consentDraft.utility && !alreadyUtility) {
  await recordConsent({
    tenant_id: tenantId, customer_id: savedCustomer.id, scope: 'utility', action: 'opt_in',
    source: 'staff', consent_text: utilityLabelText, phone_e164: savedCustomer.whatsapp_number ?? savedCustomer.mobile_number,
  });
}
// same for marketing
```

- [ ] **Step 3: CreateCaseWizard** — same block in the customer step (new-customer path passes the draft through case creation, writing consent rows right after the customer insert with `source: 'intake_form'`).

- [ ] **Step 4: CustomerProfilePage** — add a "WhatsApp" card: current consent state chips (utility / marketing, `bg-success-muted`/`bg-slate-100`), consent history list (action, scope, source, date from `whatsapp_consents` query), an explicit **Record opt-out** button (writes an `opt_out` row per scope, `source: 'staff'`).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/customers/ src/components/cases/CreateCaseWizard.tsx src/pages/customers/CustomerProfilePage.tsx
git commit -m "feat(whatsapp): consent capture (customer modal, intake wizard, profile history)"
```

### Task 15: Case thread + manual sends + notification preferences

**Files:**
- Create: `src/components/cases/detail/WhatsAppThread.tsx`
- Modify: `src/components/cases/detail/CaseCommunicationsTab.tsx` (render the thread above the flat log)
- Modify: `src/components/communications/SendMessageModal.tsx` (add "Send via API" when connected)
- Modify: `src/pages/settings/NotificationPreferences.tsx` (WhatsApp channel: remove `comingSoon`)
- Modify: `src/lib/notificationTemplateService.ts` + `src/pages/settings/NotificationPreferences.tsx` `EVENT_GROUPS` (add `whatsapp.reply_received`, `whatsapp.message_failed` staff events)

- [ ] **Step 1: `WhatsAppThread.tsx`** — merged timeline for a case: `listMessages({ caseId })` + inbound rows (`whatsapp_inbound_messages` by case) sorted by time; outbound bubbles right-aligned (`bg-primary/10`), inbound left (`bg-white border`), tick marks from status (`sent` ✓ `text-slate-400`, `delivered` ✓✓ `text-slate-400`, `read` ✓✓ `text-info`), failed rows with `last_error` + a Retry button (`retryMessage`). Poll with `refetchInterval: 15_000` while the tab is visible.

- [ ] **Step 2: SendMessageModal** — when `getIntegration()` reports `connection_status === 'connected'`:
  - template mode: insert a `whatsapp_messages` row under RLS (`message_kind: 'template'`, chosen approved template, `initiated_by` = current user, `priority: 1`, `case_id`/`customer_id` from context, `dedup_key: 'manual:' + crypto.randomUUID()`), then poke it with `whatsappAdmin('send_now', { tenantId, messageId })` (the staff-gated bridge to the service-role worker — the browser never holds the service key, and without the poke a manual send would wait up to a full 60s scanner tick); keep the wa.me handoff as the fallback button.
  - free-form mode: only enabled while `whatsapp_contacts.service_window_expires_at > now()` for the recipient (show a countdown chip, e.g. "Window open · 6h 12m left"); insert with `message_kind: 'session_text'`, `session_body` = typed text, then the same `send_now` poke.
  - **Send progress update** (catalog event `case.milestone`): a Case Detail action that opens this modal preloaded with the `case.milestone` rule's template and `event_key: 'case.milestone'` on the inserted row — the staff-triggered "Recovery in Progress" update.

- [ ] **Step 3: Notification preferences** — in `NotificationPreferences.tsx` remove `comingSoon: true` from the WhatsApp channel column; add the two new staff events to `EVENT_GROUPS` ("WhatsApp replies", "WhatsApp delivery failures") and to `NOTIFICATION_EVENT_VARIABLES` in `notificationTemplateService.ts`:

```ts
  'whatsapp.reply_received': ['customer_id', 'case_id', 'preview'],
  'whatsapp.message_failed': ['case_id', 'event_key', 'error_code', 'detail'],
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/cases/ src/components/communications/ src/pages/settings/NotificationPreferences.tsx src/lib/notificationTemplateService.ts
git commit -m "feat(whatsapp): case thread with delivery ticks, window-aware manual sends, staff notification events"
```

### Task 16: Message log + analytics dashboard

**Files:**
- Create: `src/pages/communications/WhatsAppMessageLog.tsx`
- Create: `src/pages/communications/WhatsAppAnalytics.tsx`
- Modify: `src/App.tsx` (routes under the staff area), `src/components/layout/navConfig.ts` (nav entries under the Communications/Cases group, gated `isEnabled('automation.whatsapp')`)

- [ ] **Step 1: Message log** — filterable virtualized table (status, event, date range, search by case/customer), columns: created, event label (from `WHATSAPP_EVENT_CATALOG`), recipient, template, status chip, error, cost chip (`pricing_category` + `pricing_billable === false ? 'free' : ''`); row click opens a detail drawer (body preview, timeline sent→delivered→read, attempts, `last_error`, raw params); bulk Retry for failed. Data: `listMessages` with server-side filters; reuse `VirtualizedTableBody`.

- [ ] **Step 2: Analytics** — KPI row via `KpiRow` (`Sent`, `Delivery rate`, `Read rate`, `Reply rate`, `Avg response time`, `Failed`, `Billable messages`). **Aggregation is server-side** — a raw row select would be silently truncated at PostgREST's 1,000-row cap and misreport every KPI. Task 17's migration ships `whatsapp_analytics_summary(p_from, p_to)` (SECURITY INVOKER — RLS scopes it to the caller's tenant) returning per-day rows: `day, queued, sent, delivered, read, failed, skipped, billable, replies, avg_response_seconds` (avg response = mean of `whatsapp_inbound_messages.received_at - <nearest prior outbound sent_at>` per conversation-day). The page calls:

```ts
const { data, error } = await supabase.rpc('whatsapp_analytics_summary', { p_from: from, p_to: to });
```

Charts (Recharts + `chartTheme` hues): stacked area of daily volume by terminal status; horizontal bar of failures by `last_error_code` (a second small RPC `whatsapp_failure_breakdown(p_from, p_to)`, same migration); table of per-event totals (sent/delivered/read/failed, success %). Date presets computed with `tenantToday(timezone)` (RevenueDashboard pattern). CSV export via `csvExport.ts`.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/pages/communications/ src/App.tsx src/components/layout/navConfig.ts
git commit -m "feat(whatsapp): message log + analytics dashboard (KPIs, volume/status charts, failure breakdown)"
```

### Task 17: Migration `whatsapp_gdpr_and_seeds` — GDPR cascade + starter templates

**Files:**
- Migration (via MCP): name `whatsapp_gdpr_and_seeds`
- Modify: `src/config/seedData.ts` (starter WhatsApp template drafts for new tenants)

- [ ] **Step 1: Migration** — extend the GDPR RPCs and seed helper:

```sql
-- Extend anonymize_customer_data to cover WhatsApp surfaces (append to existing function body
-- via CREATE OR REPLACE using its current definition + the block below; introspect first with
-- select pg_get_functiondef('anonymize_customer_data(uuid)'::regprocedure);)
--   UPDATE whatsapp_messages SET to_phone_e164 = NULL, wa_id = NULL, body_preview = '[anonymized]',
--     rendered_params = NULL WHERE customer_id = p_customer_id;
--   UPDATE whatsapp_inbound_messages SET body = '[anonymized]', raw = '{}'::jsonb
--     WHERE customer_id = p_customer_id;
--   UPDATE whatsapp_contacts SET wa_id = NULL, phone_e164 = 'anonymized-' || id::text,
--     profile_name = NULL, deleted_at = now() WHERE customer_id = p_customer_id;
--   -- consents are append-only (Task 1 guard trigger); the anonymize cascade is the ONE
--   -- sanctioned mutation, unlocked transaction-locally:
--   PERFORM set_config('app.allow_consent_anonymize', 'true', true);
--   UPDATE whatsapp_consents SET phone_e164 = NULL, consent_text = '[anonymized]'
--     WHERE customer_id = p_customer_id;  -- ledger skeleton retained (Art. 17(3)(e) carve-out)
--   PERFORM set_config('app.allow_consent_anonymize', '', true);
-- Extend export_customer_data analogously (add whatsapp_messages/inbound/consents arrays).

-- ---------- Analytics aggregation (server-side: PostgREST row selects cap at 1,000) ----------
-- SECURITY INVOKER: RLS scopes every aggregate to the caller's tenant automatically.
CREATE OR REPLACE FUNCTION whatsapp_analytics_summary(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  day date, queued bigint, sent bigint, delivered bigint, read bigint,
  failed bigint, skipped bigint, billable bigint, replies bigint,
  avg_response_seconds numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH msgs AS (
    SELECT created_at::date AS day,
           count(*) AS queued,
           count(*) FILTER (WHERE status IN ('sent','delivered','read')) AS sent,
           count(*) FILTER (WHERE status IN ('delivered','read')) AS delivered,
           count(*) FILTER (WHERE status = 'read') AS read,
           count(*) FILTER (WHERE status = 'failed') AS failed,
           count(*) FILTER (WHERE status = 'skipped') AS skipped,
           count(*) FILTER (WHERE pricing_billable IS TRUE) AS billable
      FROM whatsapp_messages
     WHERE created_at >= p_from AND created_at < p_to AND deleted_at IS NULL
     GROUP BY 1),
  inbound AS (
    SELECT i.received_at::date AS day, count(*) AS replies,
           avg(EXTRACT(epoch FROM (i.received_at - m.sent_at))) AS avg_response_seconds
      FROM whatsapp_inbound_messages i
      LEFT JOIN whatsapp_messages m ON m.id = i.in_reply_to_message_id
     WHERE i.received_at >= p_from AND i.received_at < p_to AND i.deleted_at IS NULL
     GROUP BY 1)
  SELECT COALESCE(m.day, i.day) AS day,
         COALESCE(m.queued, 0), COALESCE(m.sent, 0), COALESCE(m.delivered, 0),
         COALESCE(m.read, 0), COALESCE(m.failed, 0), COALESCE(m.skipped, 0),
         COALESCE(m.billable, 0), COALESCE(i.replies, 0),
         round(i.avg_response_seconds)
    FROM msgs m FULL OUTER JOIN inbound i USING (day)
   ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION whatsapp_analytics_summary(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION whatsapp_failure_breakdown(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (error_code int, occurrences bigint, sample_error text)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT last_error_code, count(*), max(last_error)
    FROM whatsapp_messages
   WHERE status = 'failed' AND created_at >= p_from AND created_at < p_to
     AND deleted_at IS NULL AND last_error_code IS NOT NULL
   GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION whatsapp_failure_breakdown(timestamptz, timestamptz) TO authenticated;

-- ---------- Register the WhatsApp context keys in the variable catalog ----------
-- The Template Studio's chips come from master_template_variables; the worker's
-- buildContext supports the house keys PLUS these additions — chips and context
-- must agree or inserted variables render as "—" in real messages.
INSERT INTO master_template_variables (key, label, category, sample_value)
SELECT v.key, v.label, v.category, v.sample
FROM (VALUES
  ('device.summary', 'Device summary (first models + count)', 'device', 'WD My Passport 2TB, Samsung 970 EVO +1 more'),
  ('device.count', 'Device count', 'device', '3'),
  ('case.recovery_outcome', 'Recovery outcome', 'case', 'full'),
  ('case.engineer', 'Assigned engineer', 'case', 'Sara K.'),
  ('case.tracking_link', 'Portal tracking link', 'case', 'https://portal.example/track/CASE-0042'),
  ('case.collection_date', 'Scheduled collection date', 'case', '30 Jul 2026'),
  ('branch.name', 'Branch name', 'company', 'Downtown Lab'),
  ('invoice.balance_due', 'Invoice balance due', 'invoice', 'AED 1,250.00')
) AS v(key, label, category, sample)
WHERE NOT EXISTS (SELECT 1 FROM master_template_variables m WHERE m.key = v.key);
-- NOTE (execution): introspect master_template_variables' real column names first
-- (select * from master_template_variables limit 3) and adapt the insert — the shape
-- above follows the seedData.ts templateVariables convention.

-- Starter template seed function for connected tenants (called from the Templates tab "Add starter pack"):
CREATE OR REPLACE FUNCTION seed_whatsapp_starter_templates(p_tenant_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  -- Caller check: SECURITY DEFINER bypasses RLS, so pin end-user callers to their own tenant
  IF auth.uid() IS NOT NULL
     AND (p_tenant_id IS DISTINCT FROM (SELECT get_current_tenant_id()) OR NOT (SELECT is_tenant_admin()))
     AND NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'seed_whatsapp_starter_templates: tenant admin required';
  END IF;

  INSERT INTO whatsapp_templates (tenant_id, name, language, category, parameter_format, components, variable_map, event_key, status)
  SELECT p_tenant_id, t.name, 'en', t.category, 'named', t.components, t.variable_map, t.event_key, 'DRAFT'
  FROM (VALUES
    ('case_device_received', 'UTILITY', 'case.device_received',
     '[{"type":"BODY","text":"Hello {{customer_name}} 👋\n\nWe''ve received your device(s) for case *{{case_number}}*:\n📦 {{device_summary}}\n\nOur engineers will begin the evaluation shortly. We''ll keep you updated at every step."},{"type":"FOOTER","text":"{{company_name}} — Data Recovery"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","device_summary":"device.summary","company_name":"company.name"}'::jsonb),
    ('quote_ready', 'UTILITY', 'quote.sent',
     '[{"type":"BODY","text":"Good news {{customer_name}} ✅\n\nYour recovery quote *{{quote_number}}* for case *{{case_number}}* is ready:\n💰 {{quote_total}}\n⏳ Valid until {{quote_valid_until}}\n\nReply here or contact us with any questions."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","quote_number":"quote.number","case_number":"case.number","quote_total":"quote.total","quote_valid_until":"quote.expiry_date","company_name":"company.name"}'::jsonb),
    ('recovery_started', 'UTILITY', 'case.phase_changed:recovery',
     '[{"type":"BODY","text":"Hi {{customer_name}} 🔧\n\nRecovery work has started on case *{{case_number}}*. Our cleanroom engineers are on it — we''ll notify you the moment there''s an outcome."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","company_name":"company.name"}'::jsonb),
    ('ready_for_collection', 'UTILITY', 'case.phase_changed:ready',
     '[{"type":"BODY","text":"Great news {{customer_name}} 🎉\n\nCase *{{case_number}}* is complete and your data is ready for collection.\n\n📍 Please visit us or reply to arrange delivery."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","company_name":"company.name"}'::jsonb),
    ('payment_received', 'UTILITY', 'payment.received.customer',
     '[{"type":"BODY","text":"Thank you {{customer_name}} 🙏\n\nWe''ve received your payment for invoice *{{invoice_number}}*. A receipt has been issued on your account."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","invoice_number":"invoice.number","company_name":"company.name"}'::jsonb),
    ('review_request', 'MARKETING', 'case.review_request',
     '[{"type":"BODY","text":"Hi {{customer_name}} 🌟\n\nWe hope you''re happy with the recovery on case *{{case_number}}*. A short review helps other people find trustworthy data recovery:\n\n⭐ {{review_link}}\n\nThank you!"},{"type":"FOOTER","text":"{{company_name}}"},{"type":"BUTTONS","buttons":[{"type":"QUICK_REPLY","text":"Unsubscribe"}]}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","review_link":"case.tracking_link","company_name":"company.name"}'::jsonb)
  ) AS t(name, category, event_key, components, variable_map)
  WHERE NOT EXISTS (
    SELECT 1 FROM whatsapp_templates w
    WHERE w.tenant_id = p_tenant_id AND w.name = t.name AND w.language = 'en' AND w.deleted_at IS NULL)
  ;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION seed_whatsapp_starter_templates(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION seed_whatsapp_starter_templates(uuid) TO authenticated, service_role;
```

**Note:** the anonymize/export extension must start from the LIVE function bodies (`pg_get_functiondef`) — do not paste stale definitions. The commented block shows exactly what to append.

- [ ] **Step 2: Regen types** (`seed_whatsapp_starter_templates` appears in Functions), manifest row, "Add starter pack" button on the Templates tab calling the RPC, commit:

```bash
git add src/types/database.types.ts supabase/migrations.manifest.md src/components/settings/whatsapp/WhatsAppTemplatesTab.tsx src/config/seedData.ts
git commit -m "feat(whatsapp): GDPR anonymize/export cascade + starter template pack"
```

### Task 18: Verification, pilot rollout, docs

- [ ] **Step 1: Full verification pass** (superpowers:verification-before-completion)

```bash
npx tsc --noEmit                     # must be 0
npx vitest run                       # app suites green
npm run geo:test                     # edge-function pure-module suites green
bash scripts/check-tsc.sh            # CI parity
```

Plus the SQL gates: `scripts/check-rls-initplan.sql` (new policies must pass), `scripts/check-tenant-table-requirements.sql` (the 7 fully-kitted tenant tables), schema-drift check (types regenerated in Tasks 3/17).

**CI exclusion (required or the gate fails):** `whatsapp_webhook_events` deliberately has a nullable `tenant_id`, no RESTRICTIVE policy, and no audit trigger (it is a platform-scoped provider ledger whose tenant is resolved post-hoc; service role is the only writer). The tenant-table check auto-detects ANY table with a `tenant_id` column, so append `whatsapp_webhook_events` to the exclusion list in `scripts/check-tenant-table-requirements.sql` with a comment explaining exactly this, mirroring the existing platform-table exclusions.

- [ ] **Step 2: E2E pilot script (staging tenant + Meta test number)** — execute and record evidence:
  1. Connect credentials → Test Connection all green.
  2. Enable `automation.whatsapp` feature + `case.device_received`, `quote.sent`, `case.phase_changed:ready` rules bound to approved starter templates.
  3. Create a customer with utility consent + a case with a device → receipt message arrives; `whatsapp_messages` row reaches `delivered`; case Communications tab shows the outbound bubble with ticks.
  4. Send a quote → status flips to `sent` with `sent_at` stamped DB-side → quote message arrives.
  5. Reply "thanks" from the test handset → inbound bubble appears; staff in-app notification fires; contact window shows open.
  6. Reply STOP → consent ledger gains opt-outs; subsequent transitions produce `skipped` rows with `skip_reason='opted_out'`; reply START → sends resume.
  7. Revoke the token in Meta → Test Connection fails; integration flips `token_invalid`; queue holds; re-paste token → held messages drain.
  8. Feature toggle off mid-queue → dispatcher stops enqueueing (existing pending rows still honor their state).

- [ ] **Step 3: Docs** — update `docs/data-recovery-workflow.md` (stage 1/7/12-14 communication touchpoints now automated), add `docs/whatsapp-tenant-onboarding.md` (lab-facing Meta setup guide: Business verification, System User + token steps, webhook paste, display-name tips, template category guidance), and append the three migration rows to `supabase/migrations.manifest.md` if not already done.

- [ ] **Step 3b: CLAUDE.md** — the conventions file is canonical and MUST absorb this feature: add a `whatsapp_*` row to the Table Prefixes table (Tenant | WhatsApp communication automation), list the 8 new tables in the Domain Model section (new "WhatsApp Communications (Tenant-scoped)" subsection), add the 3 edge functions to the Edge Functions table, and record the release as the next entry in Database Migration History (migrations: `whatsapp_core_tables`, `whatsapp_dispatch_and_emitters`, `whatsapp_gdpr_and_seeds`).

- [ ] **Step 3c: Migration PRs** — schema changes must use the migration PR template: open the PR with `.github/PULL_REQUEST_TEMPLATE/migration.md`, enumerating the three migrations, the regenerated `database.types.ts`, and every updated caller (CLAUDE.md Migration discipline item 4).

- [ ] **Step 4: Final commit + push**

```bash
git add -A
git commit -m "docs(whatsapp): onboarding guide, workflow doc updates, pilot evidence"
git push -u origin claude/customer-communication-automation-ik7j0p
```

---

## Execution order & dependencies

```
Task 1 ──► Task 2 ──► Task 3 ──► Task 4 ──► Task 5 ──► Task 6 ──► Task 7 ──► Task 8
   (schema)   (dispatch)  (types)   (pure)    (webhook)   (send)    (admin)   (deploy)
                                        │
Task 9 ◄────────────────────────────────┘        Tasks 10–13 (settings UI, one commit)
   │                                                    │
   └──► Task 14 (consent) ──► Task 15 (case surfaces) ──► Task 16 (analytics)
                                                        │
                                  Task 17 (GDPR+seeds) ──► Task 18 (verify + pilot + docs)
```

Phases 0–1 are fully dormant in production until a tenant connects; Phase 2+ can ship behind the default-off `automation.whatsapp` flag at any point after Task 8.

## Spec-coverage self-review (writing-plans checklist)

| Requirement (task brief) | Where |
|---|---|
| Tenant Meta config + encrypted storage + Test Connection + status surface | Tasks 1, 7, 11 (Vault RPCs, 3-probe test, status card incl. name_status) |
| Per-event automation toggles (22-event catalog incl. parts ordered, progress updates, no-solution, cancellation; warranty reminder deferred — no warranty entity, documented custom-follow-up preset instead) | Tasks 2, 3, 12 (rules table, catalog, matrix UI) |
| One-click/zero-touch sending, branding, emoji, placeholders, languages | Tasks 2, 6, 17 (dispatcher→queue→worker; starter pack; language resolver) |
| Template engine (Meta templates, variables, preview, multi-language, versioning, fallback) | Tasks 1, 7, 13 (registry, sync/submit, studio + preview, `is_fallback`, `superseded_by`) |
| Automation rules (instant/scheduled/delayed/reminders/conditions/retries/failure notices/business hours/timezone) | Tasks 2, 6 (delay+window+reminder_config+conditions; classifier+backoff; `whatsapp.message_failed`) |
| Message history (sent/delivered/read/failed/retried/replies/webhooks/errors/cost) | Tasks 1, 5, 16 (ledger columns incl. pricing; webhook updates; log UI) |
| Analytics dashboard | Task 16 |
| Scalable architecture (multi-tenant, queues, workers, rate limiting, retries, HA) | Tasks 1, 2, 6 + spec §8 (RLS kit, SKIP LOCKED queue, fairness, pacing, backoff; stateless workers) |
| Compliance (opt-in/out, GDPR, anti-spam, consent) | Tasks 1, 5, 14, 17 + spec §11 |
| Research deliverable | spec §2 (verified digest + UNVERIFIED list) |
| Rollout, testing, DR, roadmap | Task 18 + spec §14–17 |
