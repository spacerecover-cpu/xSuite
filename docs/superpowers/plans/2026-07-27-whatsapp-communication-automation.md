# WhatsApp Customer Communication Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant-configurable, Meta-policy-compliant WhatsApp Cloud API automation: per-tenant encrypted credentials, per-event automation toggles, a durable retrying send queue, delivery/read/inbound webhooks, consent management, template studio, message log, and analytics.

**Architecture:** Extend the existing `notification_events` outbox with a WhatsApp dispatcher trigger that enqueues rows into a new `whatsapp_messages` queue/ledger; a pg_cron scanner + pg_net pokes drive the `whatsapp-send` edge worker (claim-before-send, error-classified backoff); a public `whatsapp-webhook` edge receiver (HMAC-verified, two-phase idempotent ledger) records statuses and inbound replies; a user-JWT `whatsapp-admin` edge function handles credentials (Supabase Vault — first live use), connection tests, and template sync. Frontend: a Communications settings module (Connection / Automations / Templates), consent capture, case-thread integration, message log + analytics.

**Tech Stack:** Postgres 15 (Supabase) + pg_cron + pg_net + Supabase Vault, Deno edge functions (`npm:@supabase/supabase-js@2`, Web Crypto), React 18 + TS + TanStack Query v5 + Tailwind tokens + Recharts, Meta Graph API **v25.0**.

**Companion design spec:** `docs/superpowers/specs/2026-07-27-whatsapp-communication-automation-design.md` — read it first; it holds the research digest, event catalog, and all architecture rationale.

**Ground rules for every task**
- Migrations are applied ONLY via `mcp__supabase__apply_migration` (project_id `ssmbegiyjivrcwgcqutu`), then `database.types.ts` regenerated via `mcp__supabase__generate_typescript_types` and saved to `src/types/database.types.ts`, and a row appended to `supabase/migrations.manifest.md`. Never hand-edit generated types. Additive-only (no DROP/hard delete).
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

-- ---------- 6. whatsapp_messages (queue + ledger) ----------
CREATE TABLE whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','delivered','read','failed','cancelled','skipped')),
  message_kind text NOT NULL DEFAULT 'template' CHECK (message_kind IN ('template','session_text','session_media')),
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
CREATE POLICY whatsapp_messages_staff_write ON whatsapp_messages
  FOR ALL TO authenticated
  USING ((SELECT is_staff_user())) WITH CHECK ((SELECT is_staff_user()));
CREATE POLICY whatsapp_contacts_staff_write ON whatsapp_contacts
  FOR ALL TO authenticated
  USING ((SELECT is_staff_user())) WITH CHECK ((SELECT is_staff_user()));

-- webhook events: platform admin read only (service role bypasses RLS for writes)
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_webhook_events_platform_read ON whatsapp_webhook_events
  FOR SELECT TO authenticated USING ((SELECT is_platform_admin()));

-- Secret-id columns: never readable/writable by app roles
REVOKE ALL (access_token_secret_id, app_secret_secret_id) ON whatsapp_integrations FROM authenticated, anon;

-- ---------- Consent state helper ----------
CREATE OR REPLACE FUNCTION whatsapp_consent_state(p_tenant_id uuid, p_customer_id uuid)
RETURNS TABLE (scope text, opted_in boolean, occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (scope) scope, (action = 'opt_in') AS opted_in, occurred_at
  FROM whatsapp_consents
  WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND deleted_at IS NULL
  ORDER BY scope, occurred_at DESC;
$$;
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

  IF v_row.access_token_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_row.access_token_secret_id, p_access_token);
    v_token_id := v_row.access_token_secret_id;
  ELSE
    v_token_id := vault.create_secret(p_access_token, 'wa_token_' || p_tenant_id::text);
  END IF;
  IF v_row.app_secret_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_row.app_secret_secret_id, p_app_secret);
    v_secret_id := v_row.app_secret_secret_id;
  ELSE
    v_secret_id := vault.create_secret(p_app_secret, 'wa_appsecret_' || p_tenant_id::text);
  END IF;

  UPDATE whatsapp_integrations SET
    app_id = p_app_id, waba_id = p_waba_id, phone_number_id = p_phone_number_id,
    display_phone_number = COALESCE(p_display_phone_number, display_phone_number),
    access_token_secret_id = v_token_id, app_secret_secret_id = v_secret_id,
    connection_status = 'connected', token_valid = true, updated_at = now()
  WHERE id = v_row.id;

  BEGIN
    PERFORM log_audit_trail('whatsapp_integrations', v_row.id, 'credentials_stored',
      NULL, jsonb_build_object('phone_number_id', p_phone_number_id, 'waba_id', p_waba_id)::text);
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
```

Expected: 8 tables, all `t`/`t` for RLS; a RESTRICTIVE `whatsapp_messages_tenant_isolation` policy; the consent call returns 0 rows (not an error).

- [ ] **Step 4: Append to the migration manifest and commit**

Add a row to `supabase/migrations.manifest.md` (follow the file's existing format) describing `whatsapp_core_tables`, then:

```bash
git add supabase/migrations.manifest.md
git commit -m "feat(whatsapp): core tables, RLS kit, Vault credential RPCs (dormant)"
```

### Task 2: Migration `whatsapp_dispatch_and_emitters` — dispatcher, emitters, scanner, cron

**Files:**
- Migration (via MCP): name `whatsapp_dispatch_and_emitters`

- [ ] **Step 1: Apply the migration**

```sql
-- =============================================================
-- WhatsApp dispatch trigger, event emitters, queue scanner, cron
-- =============================================================

-- ---------- quotes.sent_at + DB-side stamp (closes client-side best-effort hole) ----------
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- ---------- case_follow_ups: allow whatsapp channel ----------
ALTER TABLE case_follow_ups DROP CONSTRAINT IF EXISTS case_follow_ups_channel_check;
ALTER TABLE case_follow_ups ADD CONSTRAINT case_follow_ups_channel_check
  CHECK (channel IN ('internal','email','whatsapp'));

-- ---------- Business-hours window helper ----------
-- Returns p_ts if inside the rule window (tenant timezone), else the next window start.
CREATE OR REPLACE FUNCTION whatsapp_apply_send_window(
  p_tenant_id uuid, p_send_window text, p_business_hours jsonb, p_ts timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text; v_local timestamptz; v_start time; v_end time; v_days int[]; v_probe timestamptz; i int;
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
    -- jump to the next window start (today if before start, else tomorrow)
    IF (v_probe AT TIME ZONE v_tz)::time < v_start
       AND EXTRACT(isodow FROM v_probe AT TIME ZONE v_tz)::int = ANY (v_days) THEN
      v_probe := ((v_probe AT TIME ZONE v_tz)::date::timestamp + v_start) AT TIME ZONE v_tz;
    ELSE
      v_probe := (((v_probe AT TIME ZONE v_tz)::date + 1)::timestamp + v_start) AT TIME ZONE v_tz;
    END IF;
  END LOOP;
  RETURN p_ts; -- defensive: never loop forever; send anyway
END $$;

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
  v_consent record;
  v_scheduled timestamptz;
  v_msg_id uuid;
  v_url text; v_key text;
BEGIN
  -- 0. cheap short-circuits, cheapest first
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;

  SELECT * INTO v_integration FROM whatsapp_integrations
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL
     AND is_enabled AND connection_status = 'connected';
  IF v_integration.id IS NULL THEN RETURN NEW; END IF;

  IF NOT tenant_feature_enabled(NEW.tenant_id, 'automation.whatsapp') THEN RETURN NEW; END IF;

  -- 1. effective event key (phase-changes expand on to_phase)
  v_event_key := NEW.event_type;
  IF NEW.event_type IN ('case.phase_changed', 'case.phase_changed.customer') THEN
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

  -- 3. consent (required scope from the rule)
  SELECT * INTO v_consent FROM whatsapp_consent_state(NEW.tenant_id, v_customer_id) s
   WHERE s.scope = v_rule.required_consent AND s.opted_in;
  IF v_consent IS NULL THEN RETURN NEW; END IF;

  -- 4. schedule (delay + business window)
  v_scheduled := whatsapp_apply_send_window(
    NEW.tenant_id, v_rule.send_window, v_rule.business_hours,
    now() + make_interval(mins => v_rule.delay_minutes));

  -- 5. enqueue (dedup on event dedup_key + event_key)
  INSERT INTO whatsapp_messages (
    tenant_id, event_key, notification_event_id, dedup_key, template_id,
    customer_id, to_phone_e164,
    case_id, quote_id, invoice_id, scheduled_for
  ) VALUES (
    NEW.tenant_id, v_event_key, NEW.id,
    COALESCE(NEW.dedup_key, NEW.id::text) || ':wa:' || v_event_key,
    v_rule.template_id, v_customer_id, v_phone,
    CASE WHEN NEW.entity_type = 'case'    THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'case_id','')::uuid END,
    CASE WHEN NEW.entity_type = 'quote'   THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'quote_id','')::uuid END,
    CASE WHEN NEW.entity_type = 'invoice' THEN NEW.entity_id
         ELSE NULLIF(NEW.payload->>'invoice_id','')::uuid END,
    v_scheduled
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING id INTO v_msg_id;

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
  RAISE WARNING 'dispatch_notification_event_whatsapp failed for event %: %', NEW.id, SQLERRM;
  RETURN NEW;  -- NEVER block the business transaction
END $$;

CREATE TRIGGER trg_dispatch_notification_event_whatsapp
  AFTER INSERT ON notification_events
  FOR EACH ROW EXECUTE FUNCTION dispatch_notification_event_whatsapp();

-- ---------- New event emitters ----------
-- Guard shared by all emitters: skip imports and tenants without a connected integration.
CREATE OR REPLACE FUNCTION whatsapp_tenant_active(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_integrations
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND is_enabled AND connection_status = 'connected');
$$;

CREATE OR REPLACE FUNCTION emit_case_created_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  PERFORM emit_notification_event('case.created', 'case', NEW.id,
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
DECLARE v_case cases%ROWTYPE;
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM cases WHERE id = NEW.case_id;
  IF v_case.id IS NULL OR v_case.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM emit_notification_event('case.device_received', 'case', NEW.case_id,
    jsonb_build_object('case_id', NEW.case_id, 'case_number', v_case.case_number,
                       'customer_id', v_case.customer_id, 'device_id', NEW.id,
                       'serial_number', NEW.serial_number, 'model', NEW.model),
    'case.device_received:' || NEW.case_id::text || ':' ||
      to_char(now(), 'YYYY-MM-DD'));  -- one receipt per case per day (multi-device intake = 1 message)
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_device_received_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_device_received AFTER INSERT ON case_devices
  FOR EACH ROW EXECUTE FUNCTION emit_device_received_event();

CREATE OR REPLACE FUNCTION emit_quote_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'quote.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status
      WHEN 'sent' THEN 'quote.sent'
      WHEN 'accepted' THEN 'quote.approved'
      WHEN 'rejected' THEN 'quote.rejected'
      ELSE NULL END;
    IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();  -- BEFORE trigger required for this write; see trigger def
    END IF;
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;

  PERFORM emit_notification_event(v_event, 'quote', NEW.id,
    jsonb_build_object('quote_id', NEW.id, 'quote_number', NEW.quote_number,
                       'case_id', NEW.case_id, 'customer_id', NEW.customer_id,
                       'total', NEW.total, 'currency', NEW.currency,
                       'valid_until', NEW.valid_until),
    v_event || ':' || NEW.id::text || ':' || COALESCE(NEW.status, 'new'));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_quote_events: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_quote_events BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION emit_quote_events();

CREATE OR REPLACE FUNCTION emit_invoice_issued_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.status = 'sent')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM emit_notification_event('invoice.issued', 'invoice', NEW.id,
      jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number,
                         'case_id', NEW.case_id, 'customer_id', NEW.customer_id,
                         'total', NEW.total, 'balance_due', NEW.balance_due,
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
  IF NEW.recovery_outcome IS NULL
     OR NEW.recovery_outcome IS NOT DISTINCT FROM OLD.recovery_outcome THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  PERFORM emit_notification_event('case.recovery_outcome', 'case', NEW.id,
    jsonb_build_object('case_id', NEW.id, 'case_number', NEW.case_number,
                       'customer_id', NEW.customer_id, 'recovery_outcome', NEW.recovery_outcome),
    -- dedup by value: the three competing writers of recovery_outcome collapse to one event per value
    'case.recovery_outcome:' || NEW.id::text || ':' || NEW.recovery_outcome);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_recovery_outcome_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_recovery_outcome AFTER UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION emit_recovery_outcome_event();

CREATE OR REPLACE FUNCTION emit_case_checkout_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case cases%ROWTYPE;
BEGIN
  IF NEW.action IS DISTINCT FROM 'checkout' THEN RETURN NEW; END IF;
  IF current_setting('app.importing', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT whatsapp_tenant_active(NEW.tenant_id) THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM cases WHERE id = NEW.case_id;
  PERFORM emit_notification_event('case.checked_out', 'case', NEW.case_id,
    jsonb_build_object('case_id', NEW.case_id, 'case_number', v_case.case_number,
                       'customer_id', v_case.customer_id, 'details', NEW.details),
    'case.checked_out:' || NEW.id::text);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_case_checkout_event: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER trg_emit_case_checkout AFTER INSERT ON case_job_history
  FOR EACH ROW EXECUTE FUNCTION emit_case_checkout_event();

-- ---------- Queue scanner (pg_cron every minute) ----------
CREATE OR REPLACE FUNCTION process_due_whatsapp_messages()
RETURNS TABLE (dispatched int, reset_stuck int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text; v_key text; v_row record;
  v_dispatched int := 0; v_reset int := 0;
BEGIN
  v_url := get_system_setting('edge_function_base_url');
  v_key := get_system_setting('edge_function_service_key');
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;  -- dormant until configured
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

  FOR v_row IN
    SELECT id FROM (
      SELECT m.id, m.tenant_id,
             row_number() OVER (PARTITION BY m.tenant_id ORDER BY m.scheduled_for) AS rn
        FROM whatsapp_messages m
       WHERE m.status = 'pending' AND m.deleted_at IS NULL
         AND m.scheduled_for <= now()
         AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= now())
         AND m.attempt_count < 5
       ORDER BY m.scheduled_for
       FOR UPDATE OF m SKIP LOCKED
       LIMIT 200
    ) c
    WHERE c.rn <= 10   -- per-tenant fairness cap per tick
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := v_url || '/whatsapp-send',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
      body := jsonb_build_object('message_id', v_row.id));
    v_dispatched := v_dispatched + 1;
  END LOOP;

  RETURN QUERY SELECT v_dispatched, v_reset;
END $$;
REVOKE EXECUTE ON FUNCTION process_due_whatsapp_messages() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_due_whatsapp_messages() TO service_role;

-- ---------- Scheduled reminders scanner (pg_cron every 15 min) ----------
CREATE OR REPLACE FUNCTION process_whatsapp_scheduled_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_rule record; v_target record;
BEGIN
  -- quote.reminder: sent N days ago, still awaiting decision
  FOR v_rule IN
    SELECT r.* FROM whatsapp_automation_rules r
     JOIN whatsapp_integrations i ON i.tenant_id = r.tenant_id
       AND i.deleted_at IS NULL AND i.is_enabled AND i.connection_status = 'connected'
     WHERE r.event_key = 'quote.reminder' AND r.enabled AND r.deleted_at IS NULL
  LOOP
    FOR v_target IN
      SELECT q.* FROM quotes q
       WHERE q.tenant_id = v_rule.tenant_id AND q.deleted_at IS NULL
         AND q.status = 'sent' AND q.sent_at IS NOT NULL
         AND q.sent_at < now() - make_interval(days => COALESCE((v_rule.reminder_config->>'after_days')::int, 3))
    LOOP
      PERFORM emit_notification_event('quote.reminder', 'quote', v_target.id,
        jsonb_build_object('quote_id', v_target.id, 'quote_number', v_target.quote_number,
                           'case_id', v_target.case_id, 'customer_id', v_target.customer_id,
                           'total', v_target.total, 'currency', v_target.currency),
        'quote.reminder:' || v_target.id::text || ':' || to_char(now(), 'YYYY-MM-DD'));
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- case.feedback_request / case.review_request: delivered N days ago
  FOR v_rule IN
    SELECT r.* FROM whatsapp_automation_rules r
     JOIN whatsapp_integrations i ON i.tenant_id = r.tenant_id
       AND i.deleted_at IS NULL AND i.is_enabled AND i.connection_status = 'connected'
     WHERE r.event_key IN ('case.feedback_request','case.review_request')
       AND r.enabled AND r.deleted_at IS NULL
  LOOP
    FOR v_target IN
      SELECT c.* FROM cases c
       JOIN master_case_statuses s ON s.id = c.status_id
       WHERE c.tenant_id = v_rule.tenant_id AND c.deleted_at IS NULL
         AND s.type IN ('delivered','closed')
         AND c.actual_completion IS NOT NULL
         AND c.actual_completion::date =
             (now() - make_interval(days => COALESCE((v_rule.reminder_config->>'after_days')::int, 2)))::date
    LOOP
      PERFORM emit_notification_event(v_rule.event_key, 'case', v_target.id,
        jsonb_build_object('case_id', v_target.id, 'case_number', v_target.case_number,
                           'customer_id', v_target.customer_id),
        v_rule.event_key || ':' || v_target.id::text);  -- once per case, ever
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION process_whatsapp_scheduled_reminders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_whatsapp_scheduled_reminders() TO service_role;

-- ---------- pg_cron schedules (idempotent: unschedule-then-schedule) ----------
DO $cron$
BEGIN
  PERFORM cron.unschedule('process-whatsapp-messages')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-whatsapp-messages');
  PERFORM cron.schedule('process-whatsapp-messages', '* * * * *',
    $$SELECT process_due_whatsapp_messages();$$);

  PERFORM cron.unschedule('process-whatsapp-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-whatsapp-reminders');
  PERFORM cron.schedule('process-whatsapp-reminders', '*/15 * * * *',
    $$SELECT process_whatsapp_scheduled_reminders();$$);
END $cron$;

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
DO $cron2$
BEGIN
  PERFORM cron.unschedule('purge-whatsapp-webhook-payloads')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-whatsapp-webhook-payloads');
  PERFORM cron.schedule('purge-whatsapp-webhook-payloads', '45 3 * * *',
    $$SELECT purge_whatsapp_webhook_payloads();$$);
END $cron2$;
```

**Emitter design notes (why it is safe):** every trigger body is wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING → RETURN NEW`, so a WhatsApp defect can never fail a case/quote/invoice/payment write. Every emitter first checks `whatsapp_tenant_active()` — tenants without a connected, enabled integration pay a single indexed EXISTS per write and emit nothing (the outbox does not bloat; the subscription-blind email-trigger defect is not copied). `trg_emit_quote_events` is BEFORE so it can stamp `quotes.sent_at` in the same write.

- [ ] **Step 2: Verify**

```sql
select tgname from pg_trigger where tgname like 'trg_emit%' or tgname like 'trg_dispatch%' order by 1;
select jobname, schedule from cron.job where jobname like '%whatsapp%';
select whatsapp_apply_send_window(
  (select id from tenants limit 1), 'business_hours',
  '{"start":"08:00","end":"20:00","days":[1,2,3,4,5]}'::jsonb, now());
```

Expected: 7 triggers (`trg_dispatch_notification_event_whatsapp`, `trg_emit_case_created`, `trg_emit_device_received`, `trg_emit_quote_events`, `trg_emit_invoice_issued`, `trg_emit_recovery_outcome`, `trg_emit_case_checkout`); 3 cron jobs; the window function returns a timestamptz.

- [ ] **Step 3: Behavioral smoke test (branch DB or staging tenant)**

With no integration row: insert a test `notification_events` row via `emit_notification_event('case.created', 'case', <case-uuid>, '{}'::jsonb, 'smoke-1')` and confirm `whatsapp_messages` stays empty (dormancy). Then insert a `whatsapp_integrations` row (`is_enabled=true, connection_status='connected'`), an enabled rule for `case.created` pointing at a placeholder template row, an opt-in consent row, and re-emit with a new dedup key — confirm exactly one `whatsapp_messages` row appears with `status='pending'`. Clean up test rows via `deleted_at = now()`.

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
      'case.phase_changed:recovery', 'case.recovery_outcome', 'case.phase_changed:ready',
      'invoice.issued', 'payment.received.customer', 'case.checked_out',
      'case.phase_changed:closed', 'case.follow_up_due',
      'case.feedback_request', 'case.review_request',
    ]) expect(keys).toContain(required);
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
    description: 'Receipt when devices are checked in (one message per intake day)', requiredConsent: 'utility', defaultDelayMinutes: 0 },
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
  { key: 'case.recovery_outcome', label: 'Recovery Completed', stage: 'Recovery',
    description: 'Recovery outcome recorded (full / partial / unrecoverable / declined)',
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
  it('doubles per attempt, capped at 12h', () => {
    expect(computeBackoff(1)).toBe(60);          // 1 min
    expect(computeBackoff(2)).toBe(120);
    expect(computeBackoff(3)).toBe(240);
    expect(computeBackoff(10)).toBe(12 * 3600);  // cap
  });
});

describe('normalizeToE164', () => {
  it.each([
    ['+971 501234567', '+971501234567'],
    ['00971-50-123-4567', '+971501234567'],
    ['971501234567', '+971501234567'],
    ['(501) 234-567', null],           // no country prefix, ambiguous → null
  ])('%s → %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });
  it('rejects garbage', () => {
    expect(normalizeToE164('abc')).toBeNull();
    expect(normalizeToE164('+12')).toBeNull();   // too short
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
    expect(p[0].parameters.every((x) => x.text === '—')).toBe(true);
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

/** Best-effort E.164: strips separators, converts leading 00, requires + and 8-15 digits. */
export function normalizeToE164(raw: string): string | null {
  let v = (raw ?? '').replace(/[\s\-().]/g, '');
  if (v.startsWith('00')) v = '+' + v.slice(2);
  if (/^\d{8,15}$/.test(v)) v = '+' + v;            // bare international digits
  if (!/^\+\d{8,15}$/.test(v)) return null;
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

interface TemplateComponent { type: string; text?: string; format?: string; }

/** Build Meta send-time components from the stored template components + variable map + context. */
export function buildTemplateParams(
  components: TemplateComponent[],
  variableMap: Record<string, string>,
  context: Record<string, string>,
  parameterFormat: 'named' | 'positional',
): Array<{ type: string; parameters: Array<Record<string, string>> }> {
  const out: Array<{ type: string; parameters: Array<Record<string, string>> }> = [];
  for (const c of components) {
    const type = c.type?.toUpperCase();
    if ((type !== 'BODY' && type !== 'HEADER') || !c.text) continue;
    if (type === 'HEADER' && c.format && c.format.toUpperCase() !== 'TEXT') continue;
    const names = [...c.text.matchAll(VAR_RE)].map((m) => m[1]);
    if (names.length === 0) continue;
    const parameters = names.map((name) => {
      const contextKey = variableMap[name] ?? name;
      const text = context[contextKey] ?? '—';
      return parameterFormat === 'named'
        ? { type: 'text', parameter_name: name, text }
        : { type: 'text', text };
    });
    out.push({ type: type.toLowerCase(), parameters });
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
// GET  = Meta verification handshake (hub.challenge echo, per-tenant verify token)
// POST = signed event delivery (X-Hub-Signature-256 over raw body, tenant app secret)
// Auth model: verify_jwt=false in config.toml — the handler authenticates Meta itself.
// Idempotency: two-phase whatsapp_webhook_events ledger (insert-first, processed_at last),
// mirroring the billing_events protocol in paypal-webhook.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyMetaSignature, matchOptKeyword, extractChanges } from "./webhookCore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
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

/** statuses[] → whatsapp_messages updates (monotonic; idempotent set-to-value). */
async function handleStatuses(tenantId: string, statuses: Array<Record<string, unknown>>) {
  for (const s of statuses) {
    const wamid = s.id as string;
    const status = s.status as string;
    const ts = new Date(Number(s.timestamp) * 1000).toISOString();
    const pricing = (s.pricing ?? {}) as Record<string, unknown>;
    const conversation = (s.conversation ?? {}) as Record<string, unknown>;
    if (!wamid || !status) continue;

    if (status === "sent" || status === "delivered" || status === "read") {
      const patch: Record<string, unknown> = {
        pricing_billable: pricing.billable ?? null,
        pricing_category: pricing.category ?? null,
        pricing_type: pricing.type ?? null,
        conversation_id: conversation.id ?? null,
      };
      if (status === "sent") patch.sent_at = ts;
      if (status === "delivered") { patch.delivered_at = ts; }
      if (status === "read") { patch.read_at = ts; }
      // status column: only move forward (read implies delivered implies sent)
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
      const { data: row } = await db.from("whatsapp_messages")
        .select("id,status").eq("wamid", wamid).maybeSingle();
      if (!row) continue;
      if ((rank[status] ?? 0) > (rank[row.status] ?? 0)) patch.status = status;
      await db.from("whatsapp_messages").update(patch).eq("id", row.id);
    } else if (status === "failed") {
      const errors = (s.errors ?? []) as Array<Record<string, unknown>>;
      const first = errors[0] ?? {};
      await db.from("whatsapp_messages").update({
        status: "failed", failed_at: ts,
        last_error_code: Number(first.code) || null,
        last_error: String(
          (first.error_data as Record<string, unknown> | undefined)?.details ?? first.message ?? "delivery failed",
        ),
      }).eq("wamid", wamid);
      // surface terminal delivery failures to staff via the existing notification stack
      const { data: msg } = await db.from("whatsapp_messages")
        .select("id, tenant_id, case_id, event_key").eq("wamid", wamid).maybeSingle();
      if (msg) {
        await db.rpc("emit_notification_event", {
          p_event_type: "whatsapp.message_failed",
          p_entity_type: "whatsapp_message", p_entity_id: msg.id,
          p_payload: { case_id: msg.case_id, event_key: msg.event_key, error_code: first.code ?? null },
          p_dedup_key: `whatsapp.message_failed:${msg.id}`,
        });
      }
    }
  }
}

/** inbound messages[] → contacts window, STOP/START, ledger rows, staff notification. */
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
    const ts = new Date(Number(m.timestamp) * 1000).toISOString();
    if (!wamid || !from) continue;

    const phoneE164 = `+${from}`;
    // 1. upsert contact + open the 24h service window
    const windowExpires = new Date(Number(m.timestamp) * 1000 + 24 * 3600 * 1000).toISOString();
    const { data: existing } = await db.from("whatsapp_contacts")
      .select("id, customer_id").eq("tenant_id", integ.tenant_id)
      .eq("phone_e164", phoneE164).is("deleted_at", null).maybeSingle();
    let contactId = existing?.id as string | undefined;
    let customerId = existing?.customer_id as string | undefined;
    if (contactId) {
      await db.from("whatsapp_contacts").update({
        wa_id: from, last_inbound_at: ts, service_window_expires_at: windowExpires,
        profile_name: profileByWaId.get(from) ?? null, unreachable: false,
      }).eq("id", contactId);
    } else {
      // correlate to a customer by any stored phone variant (digits-suffix match)
      const { data: cust } = await db.from("customers_enhanced")
        .select("id").eq("tenant_id", integ.tenant_id).is("deleted_at", null)
        .or(`whatsapp_number.ilike.%${from.slice(-9)},mobile_number.ilike.%${from.slice(-9)},phone.ilike.%${from.slice(-9)}`)
        .limit(1).maybeSingle();
      customerId = cust?.id;
      const { data: created } = await db.from("whatsapp_contacts").insert({
        tenant_id: integ.tenant_id, customer_id: customerId ?? null, wa_id: from,
        phone_e164: phoneE164, profile_name: profileByWaId.get(from) ?? null,
        last_inbound_at: ts, service_window_expires_at: windowExpires,
      }).select("id").single();
      contactId = created?.id;
    }

    // 2. body / reply-context extraction
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
    if (context?.id) {
      const { data: orig } = await db.from("whatsapp_messages")
        .select("id, case_id, customer_id").eq("wamid", String(context.id)).maybeSingle();
      if (orig) { inReplyTo = orig.id; caseId = orig.case_id; customerId = customerId ?? orig.customer_id; }
    }

    // 3. opt keyword handling
    let handled = "none";
    const kw = body ? matchOptKeyword(body) : null;
    if (kw && customerId) {
      handled = kw;
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
      await db.from("whatsapp_contacts").update({ opt_out_all: kw === "stop" }).eq("id", contactId!);
    }

    // 4. inbound ledger (idempotent on wamid) + comms mirror + staff notification
    const { error: insErr } = await db.from("whatsapp_inbound_messages").insert({
      tenant_id: integ.tenant_id, wamid, contact_id: contactId ?? null,
      customer_id: customerId ?? null, case_id: caseId,
      in_reply_to_message_id: inReplyTo, message_type: type, body,
      media_id: mediaId, media_mime: mediaMime, button_payload: buttonPayload,
      raw: m, received_at: ts, handled,
    });
    if (insErr && insErr.code === "23505") continue; // duplicate delivery — already handled

    if (caseId) {
      await db.rpc("log_case_communication", {
        p_case_id: caseId, p_type: "whatsapp", p_direction: "inbound",
        p_content: body ?? `[${type}]`, p_sent_to: phoneE164,
      });
    } else if (customerId) {
      await db.from("customer_communications").insert({
        tenant_id: integ.tenant_id, customer_id: customerId, type: "whatsapp",
        direction: "inbound", content: body ?? `[${type}]`, status: "received",
        sent_at: ts,
      });
    }
    if (handled === "none") {
      await db.rpc("emit_notification_event", {
        p_event_type: "whatsapp.reply_received",
        p_entity_type: caseId ? "case" : "customer",
        p_entity_id: caseId ?? customerId ?? integ.id,
        p_payload: { customer_id: customerId ?? null, case_id: caseId, preview: (body ?? "").slice(0, 140) },
        p_dedup_key: `whatsapp.reply_received:${wamid}`,
      });
    }
  }
}

/** template + phone/account health webhooks → registry + integration updates. */
async function handleAdminFields(integ: IntegrationRow, field: string, value: Record<string, unknown>) {
  if (field === "message_template_status_update") {
    const event = String(value.event ?? "");
    const name = String(value.message_template_name ?? "");
    const language = String(value.message_template_language ?? "");
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
    }).eq("tenant_id", integ.tenant_id)
      .eq("name", String(value.message_template_name ?? ""))
      .eq("language", String(value.message_template_language ?? ""))
      .is("deleted_at", null);
  } else if (field === "template_category_update") {
    await db.from("whatsapp_templates").update({
      category: String(value.new_category ?? value.correct_category ?? "") || undefined,
    }).eq("tenant_id", integ.tenant_id)
      .eq("name", String(value.message_template_name ?? "")).is("deleted_at", null);
  } else if (field === "phone_number_quality_update") {
    // value.event ∈ FLAGGED | UNFLAGGED | (limit upgrades); value.current_limit = tier string
    const patch: Record<string, unknown> = {
      messaging_limit_tier: String(value.current_limit ?? "") || null,
    };
    if (value.event === "FLAGGED") patch.quality_rating = "RED";
    if (value.event === "UNFLAGGED") patch.quality_rating = "GREEN";
    await db.from("whatsapp_integrations").update(patch).eq("id", integ.id);
  } else if (field === "account_update") {
    await db.from("whatsapp_integrations").update({
      health_errors: [{ at: new Date().toISOString(), field, event: value.event ?? null }],
    }).eq("id", integ.id);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const publicId = url.searchParams.get("t") ?? "";

  // ---- GET: Meta verification handshake ----
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const integ = await loadIntegrationByPublicId(publicId);
    if (mode === "subscribe" && integ && token === integ.webhook_verify_token) {
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
      // fall through: prior attempt died mid-flight → reprocess (all updates are idempotent)
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
      // cross-check routing: the event's phone_number_id must match this tenant's number
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
// Guarantees: atomic claim pending→processing BEFORE the Graph call; error-classified
// backoff/suppression on failure; every outcome lands on the whatsapp_messages row and
// mirrors into log_case_communication / customer_communications.
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

/** Build the template context (Deno port of the buildTemplateContext essentials). */
async function buildContext(msg: Record<string, unknown>, tenantId: string): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};
  const { data: settings } = await db.from("company_settings")
    .select("basic_info, contact_info").eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  const basic = (settings?.basic_info ?? {}) as Record<string, unknown>;
  const contact = (settings?.contact_info ?? {}) as Record<string, unknown>;
  ctx["company.name"] = String(basic.company_name ?? "");
  ctx["company.phone"] = String(contact.phone_general ?? "");

  if (msg.customer_id) {
    const { data: cust } = await db.from("customers_enhanced")
      .select("customer_name, email, preferred_language").eq("id", msg.customer_id).maybeSingle();
    ctx["customer.name"] = String(cust?.customer_name ?? "");
  }
  if (msg.case_id) {
    const { data: c } = await db.from("cases")
      .select("case_number, status, recovery_outcome, assigned_to").eq("id", msg.case_id).maybeSingle();
    ctx["case.number"] = String(c?.case_number ?? "");
    ctx["case.status"] = String(c?.status ?? "");
    ctx["case.recovery_outcome"] = String(c?.recovery_outcome ?? "");
    if (c?.assigned_to) {
      const { data: eng } = await db.from("profiles").select("full_name").eq("id", c.assigned_to).maybeSingle();
      ctx["case.engineer"] = String(eng?.full_name ?? "");
    }
    const { data: devices } = await db.from("case_devices")
      .select("model").eq("case_id", msg.case_id).is("deleted_at", null);
    ctx["device.summary"] = (devices ?? []).map((d) => d.model).filter(Boolean).slice(0, 3).join(", ")
      + ((devices?.length ?? 0) > 3 ? ` +${devices!.length - 3} more` : "");
    ctx["device.count"] = String(devices?.length ?? 0);
  }
  if (msg.quote_id) {
    const { data: q } = await db.from("quotes")
      .select("quote_number, total, currency, valid_until").eq("id", msg.quote_id).maybeSingle();
    ctx["quote.number"] = String(q?.quote_number ?? "");
    ctx["quote.total"] = q ? `${q.currency ?? ""} ${Number(q.total ?? 0).toFixed(2)}`.trim() : "";
    ctx["quote.valid_until"] = String(q?.valid_until ?? "");
  }
  if (msg.invoice_id) {
    const { data: inv } = await db.from("invoices")
      .select("invoice_number, total, balance_due, currency, due_date").eq("id", msg.invoice_id).maybeSingle();
    ctx["invoice.number"] = String(inv?.invoice_number ?? "");
    ctx["invoice.total"] = inv ? `${inv.currency ?? ""} ${Number(inv.total ?? 0).toFixed(2)}`.trim() : "";
    ctx["invoice.balance_due"] = inv ? `${inv.currency ?? ""} ${Number(inv.balance_due ?? 0).toFixed(2)}`.trim() : "";
    ctx["invoice.due_date"] = String(inv?.due_date ?? "");
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

async function releaseForRetry(id: string, attempt: number, code: number, error: string) {
  await db.from("whatsapp_messages").update({
    status: "pending", claimed_at: null,
    next_attempt_at: new Date(Date.now() + computeBackoff(attempt) * 1000).toISOString(),
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

  // ---- atomic claim (pending → processing); loser of the race no-ops ----
  const { data: claimed } = await db.from("whatsapp_messages")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", message_id).eq("status", "pending")
    .select("*").maybeSingle();
  if (!claimed) return new Response(JSON.stringify({ ok: true, skipped: "not claimable" }), { status: 200 });

  const attempt = (claimed.attempt_count ?? 0) + 1;
  await db.from("whatsapp_messages").update({ attempt_count: attempt }).eq("id", message_id);

  try {
    // ---- integration + credentials ----
    const { data: integ } = await db.from("whatsapp_integrations")
      .select("*").eq("tenant_id", claimed.tenant_id).is("deleted_at", null).maybeSingle();
    if (!integ || !integ.is_enabled || integ.connection_status !== "connected") {
      await releaseForRetry(message_id, attempt, 0, "integration unavailable");
      return new Response(JSON.stringify({ ok: false, error: "integration unavailable" }), { status: 200 });
    }
    if (integ.send_paused_until && new Date(integ.send_paused_until) > new Date()) {
      await releaseForRetry(message_id, attempt - 1, 131048, "quality pause active");
      return new Response(JSON.stringify({ ok: false, error: "quality paused" }), { status: 200 });
    }
    const { data: credRows } = await db.rpc("whatsapp_reveal_credentials", { p_tenant_id: claimed.tenant_id });
    const creds = credRows?.[0];
    if (!creds?.access_token) {
      await failMessage(message_id, null, "credentials missing");
      return new Response(JSON.stringify({ ok: false, error: "credentials missing" }), { status: 200 });
    }

    // ---- re-check consent + contact state at send time ----
    const phone = normalizeToE164(String(claimed.to_phone_e164 ?? ""));
    if (!phone) {
      await failMessage(message_id, null, "no valid phone", "no_phone");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    const { data: rule } = await db.from("whatsapp_automation_rules")
      .select("required_consent").eq("tenant_id", claimed.tenant_id)
      .eq("event_key", claimed.event_key ?? "").is("deleted_at", null).maybeSingle();
    const requiredConsent = rule?.required_consent ?? "utility";
    if (claimed.customer_id) {
      const { data: consent } = await db.rpc("whatsapp_consent_state", {
        p_tenant_id: claimed.tenant_id, p_customer_id: claimed.customer_id,
      });
      const scopeState = (consent ?? []).find((r: { scope: string }) => r.scope === requiredConsent);
      if (!scopeState?.opted_in) {
        await failMessage(message_id, null, `no ${requiredConsent} consent`, "consent_missing");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
    }
    const { data: contact } = await db.from("whatsapp_contacts")
      .select("*").eq("tenant_id", claimed.tenant_id).eq("phone_e164", phone)
      .is("deleted_at", null).maybeSingle();
    if (contact?.opt_out_all) {
      await failMessage(message_id, null, "customer opted out", "opted_out");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    if (contact?.unreachable) {
      await failMessage(message_id, null, "number not on WhatsApp", "unreachable");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    if (requiredConsent === "marketing") {
      if (phone.startsWith("+1")) {
        await failMessage(message_id, null, "US marketing paused by Meta", "us_marketing_paused");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
      if (contact?.marketing_suppressed_until && new Date(contact.marketing_suppressed_until) > new Date()) {
        await releaseForRetry(message_id, attempt, 131049, "marketing frequency suppression");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
    }
    // pair pacing: ≥6s between messages to the same recipient
    if (contact?.last_outbound_at && Date.now() - new Date(contact.last_outbound_at).getTime() < 6000) {
      await db.from("whatsapp_messages").update({
        status: "pending", claimed_at: null,
        next_attempt_at: new Date(Date.now() + 10_000).toISOString(),
      }).eq("id", message_id);
      return new Response(JSON.stringify({ ok: true, deferred: "pair pacing" }), { status: 200 });
    }

    // ---- resolve template + language, render params ----
    let requestBody: Record<string, unknown>;
    let bodyPreview = claimed.body_preview as string | null;
    if (claimed.message_kind === "template") {
      const { data: bound } = await db.from("whatsapp_templates")
        .select("name").eq("id", claimed.template_id).maybeSingle();
      const { data: family } = await db.from("whatsapp_templates")
        .select("*").eq("tenant_id", claimed.tenant_id).eq("name", bound?.name ?? "")
        .is("deleted_at", null).is("superseded_by", null);
      const rows = family ?? [];
      let custLang: string | null = null; let tenantLang: string | null = null;
      if (claimed.customer_id) {
        const { data: cust } = await db.from("customers_enhanced")
          .select("preferred_language").eq("id", claimed.customer_id).maybeSingle();
        custLang = cust?.preferred_language ?? null;
      }
      const { data: tenant } = await db.from("tenants").select("ui_language").eq("id", claimed.tenant_id).maybeSingle();
      tenantLang = tenant?.ui_language ?? null;
      const language = resolveTemplateLanguage(rows, custLang, tenantLang);
      const tpl = rows.find((r) => r.language === language)
        ?? rows.find((r) => r.is_fallback && r.status === "APPROVED");
      if (!tpl) {
        await failMessage(message_id, 132001, "no approved template translation", "no_template");
        return new Response(JSON.stringify({ ok: false }), { status: 200 });
      }
      const context = await buildContext(claimed, claimed.tenant_id);
      const components = buildTemplateParams(
        tpl.components as Array<{ type: string; text?: string; format?: string }>,
        (tpl.variable_map ?? {}) as Record<string, string>,
        context, tpl.parameter_format as "named" | "positional",
      );
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
      // manual session message (window-open free-form)
      requestBody = {
        messaging_product: "whatsapp", recipient_type: "individual", to: phone,
        type: "text", text: { preview_url: false, body: String(claimed.session_body ?? "") },
      };
      bodyPreview = String(claimed.session_body ?? "");
    }

    // ---- Graph API call ----
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
      // contact bookkeeping + comms mirror
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
    switch (cls.kind) {
      case "retry":
        if (attempt >= 5) await failMessage(message_id, code, `retries exhausted: ${detail}`);
        else await releaseForRetry(message_id, attempt, code, detail);
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
        await releaseForRetry(message_id, attempt - 1, code, detail);
        break;
      case "integration_token_dead":
        await db.from("whatsapp_integrations").update({
          connection_status: "token_invalid", token_valid: false,
        }).eq("id", integ.id);
        await releaseForRetry(message_id, attempt - 1, code, detail); // queue holds until reconnect
        break;
      case "integration_locked":
        await db.from("whatsapp_integrations").update({ connection_status: "error" }).eq("id", integ.id);
        await failMessage(message_id, code, detail);
        break;
      default:
        await failMessage(message_id, code, detail);
    }
    // notify staff on terminal outcomes
    if (["hard_fail", "template_broken", "integration_locked"].includes(cls.kind)
        || (cls.kind === "retry" && attempt >= 5)) {
      await db.rpc("emit_notification_event", {
        p_event_type: "whatsapp.message_failed", p_entity_type: "whatsapp_message",
        p_entity_id: message_id,
        p_payload: { case_id: claimed.case_id, event_key: claimed.event_key, error_code: code, detail },
        p_dedup_key: `whatsapp.message_failed:${message_id}`,
      });
    }
    return new Response(JSON.stringify({ ok: false, code, detail }), { status: 200 });
  } catch (e) {
    console.error("whatsapp-send unexpected error:", e);
    await releaseForRetry(message_id, attempt, 131000, String(e));
    return new Response(JSON.stringify({ ok: false, error: "internal" }), { status: 200 });
  }
});
```

Worker notes: HTTP responses are **200 even for handled failures** — DB-side retry state, not HTTP retries, governs redelivery (house convention). The claim happens before the Graph call; an unexpected crash leaves `processing`, which the scanner resets after 5 minutes.

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
//          delete_template | send_test
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
  const { data: profile } = await db.from("profiles")
    .select("role, tenant_id").eq("id", userData.user.id).maybeSingle();
  const isPlatformAdmin = profile && ["owner", "admin"].includes(profile.role) && profile.tenant_id === null;
  if (!profile || (!["owner", "admin"].includes(profile.role))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }
  const body = await req.json().catch(() => ({}));
  const tenantId: string = body.tenantId;
  if (!tenantId || (!isPlatformAdmin && profile.tenant_id !== tenantId)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }
  const { data: rl } = await db.rpc("check_rate_limit", {
    p_key: `whatsapp-admin:${userData.user.id}`, p_max_requests: 10, p_window_seconds: 60,
  });
  if (rl === false) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429, headers: { ...cors, "Retry-After": "60" } });
  }

  const action: string = body.action;
  try {
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
      await db.from("whatsapp_templates").update({ deleted_at: new Date().toISOString() }).eq("id", tpl.id);
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
        dedup_key: `manual.test:${crypto.randomUUID()}`,
      }).select("id").single();
      if (error) throw error;
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

- [ ] **Step 2: Confirm cron plumbing** — `system_settings_internal` rows `edge_function_base_url` + `edge_function_service_key` already exist for the follow-ups pipeline (verify: `select key from system_settings_internal;` returns both). If absent in an environment, the WhatsApp jobs stay dormant by design.

- [ ] **Step 3: End-to-end smoke (Meta test number)** — using a staging tenant: `save_credentials` with the app's test number credentials → `test_connection` returns token+phone+health green → configure the webhook URL `https://<project>.supabase.co/functions/v1/whatsapp-webhook?t=<public_id>` + the row's `webhook_verify_token` in the Meta app dashboard → dashboard shows Verified and `whatsapp_integrations.webhook_status='verified'` → `sync_templates` pulls `hello_world` → `send_test` to a verified test recipient → row reaches `status='delivered'` via webhook. Record evidence in the PR.

- [ ] **Step 4: Commit** any config notes:

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
    .insert(row).select('*').single();
  if (error) throw error;
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

/** All whatsapp-admin edge actions go through here. */
export async function whatsappAdmin<T = Record<string, unknown>>(
  action: string, payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
    body: { action, ...payload },
  });
  if (error) throw error;
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
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><dt className="text-xs text-slate-400">Quality</dt><dd className="text-slate-700">{integration.quality_rating ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Messaging tier</dt><dd className="text-slate-700">{integration.messaging_limit_tier ?? '—'}</dd></div>
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
  ensureRules, getIntegration, listRules, listTemplates, updateRule, type WhatsAppRule,
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
    if (tenantId && rules && rules.length < WHATSAPP_EVENT_CATALOG.length) {
      ensureRules(tenantId).then(() => qc.invalidateQueries({ queryKey: whatsappKeys.rules() }));
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
              if (!rule) return null;
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
  - Fields: display name → auto-slugged Meta `name` (lowercase, underscores), language select (from `geo_languages` actives), category select (UTILITY default, with the warning copy: *"Promotional wording in a UTILITY template will be recategorized by Meta as MARKETING and billed accordingly"*), body textarea with insert-variable chips sourced from `master_template_variables` (each insert also records `variable_map[varName] = contextKey`), optional footer, optional header text.
  - Right side: `WhatsAppBubblePreview` bound to the live body + sample values.
  - Save = `saveDraftTemplate` (status DRAFT); Submit = save + `whatsappAdmin('submit_template', { tenantId, templateId })`.
  - Validation before submit: name matches `/^[a-z0-9_]{1,512}$/`, body ≤ 1024 chars, no adjacent variables (`}}{{` forbidden), every variable present in `variable_map`.

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

- [ ] **Step 2: CustomerFormModal** — under the existing `mobile_number`/`phone` `PhoneInput` grid row, add a `whatsapp_number` `PhoneInput` (floatingLabel, `selectedCountryId={formData.country_id}`) into the progressive-disclosure section, and render `<WhatsAppConsentBlock>` beneath it holding local `consentDraft` state (`{utility:false, marketing:false}`). In the save handler, after a successful create/update, call `recordConsent` once per newly-checked scope:

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
  - template mode: enqueue a `whatsapp_messages` row (`message_kind: 'template'`, chosen approved template, `initiated_by` = current user, `case_id`/`customer_id` from context) and poke via `whatsappAdmin('send_test', …)`-style direct insert; keep the wa.me handoff as the fallback button.
  - free-form mode: only enabled while `whatsapp_contacts.service_window_expires_at > now()` for the recipient (show a countdown chip, e.g. "Window open · 6h 12m left"); enqueue with `message_kind: 'session_text'`, `session_body` = typed text.

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

- [ ] **Step 2: Analytics** — KPI row via `KpiRow` (`Sent`, `Delivery rate`, `Read rate`, `Reply rate`, `Failed`, `Billable messages`), computed from a single aggregate query:

```ts
const { data } = await supabase.from('whatsapp_messages')
  .select('status, pricing_billable, pricing_category, event_key, created_at, read_at, delivered_at')
  .gte('created_at', from).lte('created_at', to).is('deleted_at', null);
```

plus `whatsapp_inbound_messages` count for reply rate. Charts (Recharts + `chartTheme` hues): stacked area of daily volume by terminal status; horizontal bar of failures by `last_error_code`; table of per-event totals (sent/delivered/read/failed, success %). Date presets computed with `tenantToday(timezone)` (RevenueDashboard pattern). CSV export via `csvExport.ts`.

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
--   UPDATE whatsapp_consents SET phone_e164 = NULL, consent_text = '[anonymized]'
--     WHERE customer_id = p_customer_id;  -- ledger skeleton retained (Art. 17(3)(e) carve-out)
-- Extend export_customer_data analogously (add whatsapp_messages/inbound/consents arrays).

-- Starter template seed function for connected tenants (called from the Templates tab "Add starter pack"):
CREATE OR REPLACE FUNCTION seed_whatsapp_starter_templates(p_tenant_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  INSERT INTO whatsapp_templates (tenant_id, name, language, category, parameter_format, components, variable_map, event_key, status)
  SELECT p_tenant_id, t.name, 'en', 'UTILITY', 'named', t.components, t.variable_map, t.event_key, 'DRAFT'
  FROM (VALUES
    ('case_device_received', 'case.device_received',
     '[{"type":"BODY","text":"Hello {{customer_name}} 👋\n\nWe''ve received your device(s) for case *{{case_number}}*:\n📦 {{device_summary}}\n\nOur engineers will begin the evaluation shortly. We''ll keep you updated at every step."},{"type":"FOOTER","text":"{{company_name}} — Data Recovery"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","device_summary":"device.summary","company_name":"company.name"}'::jsonb),
    ('quote_ready', 'quote.sent',
     '[{"type":"BODY","text":"Good news {{customer_name}} ✅\n\nYour recovery quote *{{quote_number}}* for case *{{case_number}}* is ready:\n💰 {{quote_total}}\n⏳ Valid until {{quote_valid_until}}\n\nReply here or contact us with any questions."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","quote_number":"quote.number","case_number":"case.number","quote_total":"quote.total","quote_valid_until":"quote.valid_until","company_name":"company.name"}'::jsonb),
    ('recovery_started', 'case.phase_changed:recovery',
     '[{"type":"BODY","text":"Hi {{customer_name}} 🔧\n\nRecovery work has started on case *{{case_number}}*. Our cleanroom engineers are on it — we''ll notify you the moment there''s an outcome."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","company_name":"company.name"}'::jsonb),
    ('ready_for_collection', 'case.phase_changed:ready',
     '[{"type":"BODY","text":"Great news {{customer_name}} 🎉\n\nCase *{{case_number}}* is complete and your data is ready for collection.\n\n📍 Please visit us or reply to arrange delivery."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","case_number":"case.number","company_name":"company.name"}'::jsonb),
    ('payment_received', 'payment.received.customer',
     '[{"type":"BODY","text":"Thank you {{customer_name}} 🙏\n\nWe''ve received your payment for invoice *{{invoice_number}}*. A receipt has been issued on your account."},{"type":"FOOTER","text":"{{company_name}}"}]'::jsonb,
     '{"customer_name":"customer.name","invoice_number":"invoice.number","company_name":"company.name"}'::jsonb)
  ) AS t(name, event_key, components, variable_map)
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

Plus the SQL gates: `scripts/check-rls-initplan.sql` (new policies must pass), `scripts/check-tenant-table-requirements.sql` (all 7 tenant tables), schema-drift check (types regenerated in Tasks 3/17).

- [ ] **Step 2: E2E pilot script (staging tenant + Meta test number)** — execute and record evidence:
  1. Connect credentials → Test Connection all green.
  2. Enable `automation.whatsapp` feature + `case.device_received`, `quote.sent`, `case.phase_changed:ready` rules bound to approved starter templates.
  3. Create a customer with utility consent + a case with a device → receipt message arrives; `whatsapp_messages` row reaches `delivered`; case Communications tab shows the outbound bubble with ticks.
  4. Send a quote → status flips to `sent` with `sent_at` stamped DB-side → quote message arrives.
  5. Reply "thanks" from the test handset → inbound bubble appears; staff in-app notification fires; contact window shows open.
  6. Reply STOP → consent ledger gains opt-outs; subsequent transitions produce `skipped` rows with `skip_reason='opted_out'`; reply START → sends resume.
  7. Revoke the token in Meta → Test Connection fails; integration flips `token_invalid`; queue holds; re-paste token → held messages drain.
  8. Feature toggle off mid-queue → dispatcher stops enqueueing (existing pending rows still honor their state).

- [ ] **Step 3: Docs** — update `docs/data-recovery-workflow.md` (stage 1/7/12-14 communication touchpoints now automated), add `docs/whatsapp-tenant-onboarding.md` (lab-facing Meta setup guide: Business verification, System User + token steps, webhook paste, display-name tips, template category guidance), and append the two migration rows to `supabase/migrations.manifest.md` if not already done.

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
| Tenant Meta config + encrypted storage + Test Connection + status surface | Tasks 1, 7, 11 (Vault RPCs, 3-probe test, status card) |
| Per-event automation toggles (20+ events) | Tasks 2, 3, 12 (rules table, catalog, matrix UI) |
| One-click/zero-touch sending, branding, emoji, placeholders, languages | Tasks 2, 6, 17 (dispatcher→queue→worker; starter pack; language resolver) |
| Template engine (Meta templates, variables, preview, multi-language, versioning, fallback) | Tasks 1, 7, 13 (registry, sync/submit, studio + preview, `is_fallback`, `superseded_by`) |
| Automation rules (instant/scheduled/delayed/reminders/conditions/retries/failure notices/business hours/timezone) | Tasks 2, 6 (delay+window+reminder_config+conditions; classifier+backoff; `whatsapp.message_failed`) |
| Message history (sent/delivered/read/failed/retried/replies/webhooks/errors/cost) | Tasks 1, 5, 16 (ledger columns incl. pricing; webhook updates; log UI) |
| Analytics dashboard | Task 16 |
| Scalable architecture (multi-tenant, queues, workers, rate limiting, retries, HA) | Tasks 1, 2, 6 + spec §8 (RLS kit, SKIP LOCKED queue, fairness, pacing, backoff; stateless workers) |
| Compliance (opt-in/out, GDPR, anti-spam, consent) | Tasks 1, 5, 14, 17 + spec §11 |
| Research deliverable | spec §2 (verified digest + UNVERIFIED list) |
| Rollout, testing, DR, roadmap | Task 18 + spec §14–17 |
