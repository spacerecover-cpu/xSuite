# WhatsApp Customer Communication Automation — Design Spec

**Date:** 2026-07-27
**Status:** Approved for implementation planning (companion plan: `docs/superpowers/plans/2026-07-27-whatsapp-communication-automation.md`)
**Owner surface:** Settings → Communications, Case Detail → Communications, Customer Profile, Analytics

---

## 1. Executive summary

xSuite gains a first-class, end-to-end automated customer-communication engine built on the **Meta WhatsApp Business Cloud API**. Each tenant (data-recovery lab) connects its own WhatsApp Business number from Settings, maps the 16-stage case lifecycle to Meta-approved message templates, and toggles per-event automations. Events already flowing through the platform's `notification_events` outbox (plus a handful of new emitters) enqueue WhatsApp messages into a durable, retrying, rate-aware queue processed by Supabase Edge Functions. Delivery/read/failure receipts and inbound customer replies arrive on a signature-verified webhook, land in the existing communication ledgers, and feed a message-analytics dashboard.

**Design center:** this is a *lab operations* channel, not a marketing blaster. The default event catalog is strictly transactional (Meta UTILITY category — uncapped, cheap, US-deliverable); marketing-category events (review requests, feedback) are separated behind explicit marketing consent.

### What already exists (reuse, do not duplicate)

| Piece | Where | Role in this feature |
|---|---|---|
| Event outbox + dedup | `notification_events`, `emit_notification_event()` RPC | Single emission entry point; WhatsApp dispatcher consumes it |
| Per-recipient channel matrix | `notification_subscriptions` (channel `whatsapp` already in vocabulary, `customer_id` column dormant) | Customer/staff channel preferences |
| Template renderer | `src/lib/templateEngine.ts` (dependency-free, Deno-portable) | Variable substitution for preview + worker |
| Template context | `templateContextService.buildTemplateContext()` | `case.* / customer.* / quote.* / invoice.* / company.*` variable values |
| Comms ledgers | `case_communications` (via `log_case_communication` RPC, `type='whatsapp'` already legal), `customer_communications` | Case tab + portal visibility of every send |
| Delayed-work pipeline | pg_cron → SECURITY DEFINER scanner (`FOR UPDATE SKIP LOCKED LIMIT n`) → pg_net → edge fn; claim-before-send; attempt cap | The queue execution pattern (from `case_follow_ups`) |
| Webhook ledger pattern | `billing_events` two-phase idempotency (insert-first, `processed_at` stamp last) | `whatsapp_webhook_events` copies this |
| Feature gating | `FEATURE_REGISTRY` + `tenant_feature_enabled()` | `automation.whatsapp` master switch, server-enforced |
| Settings shell | `SETTINGS_CATEGORIES`/`SettingsDashboard`/`SettingsPageHeader`, admin route block | New "Communications" settings module |
| Manual WhatsApp | `SendMessageModal` + `whatsappUtils.ts` (wa.me handoff) | Kept as fallback; gains an "API send" path when connected |
| DLQ console | `notification_events` DLQ + `notification_log` | Failure observability precedent (WhatsApp gets its own ledger) |

### What is new

Meta Cloud API client (edge functions), per-tenant encrypted credentials (**first live Supabase Vault usage** — the house-approved design from `docs/critical-fixes-scope.md` C2), a WhatsApp message queue with backoff + rate awareness, a Meta template registry synced with approval/quality webhooks, consent capture (opt-in/opt-out with proof), inbound message handling incl. STOP keywords, the Communications settings module, and the analytics dashboard.

---

## 2. Research digest — Meta WhatsApp Cloud API (verified 2026-07-27)

Full sourced briefings live with the research notes; the load-bearing facts the design depends on:

| Fact | Value (as of 2026-07-27) | Design consequence |
|---|---|---|
| Graph API version | **v25.0** (Feb 2026); ≥2-year support per version | Version constant `WHATSAPP_GRAPH_VERSION = 'v25.0'`, single place |
| Send endpoint | `POST /{PHONE_NUMBER_ID}/messages` | Worker calls per message; 200 = *accepted*, not delivered |
| Business-initiated messages | **Approved templates only** outside the 24h customer-service window | Automation always sends templates; free-form only for manual replies in an open window |
| 24h service window | Opens/resets on every inbound customer message | `whatsapp_contacts.service_window_expires_at` maintained by webhook |
| Pricing | **Per-message** since 2025-07-01. Utility free inside open window; marketing always billed; service free (⚠ vendor-reported change: charged from 2026-10-01) | Store per-message `pricing {billable, category, type}` from status webhooks; cost analytics from our own ledger |
| US marketing pause | Marketing templates to +1 numbers paused since 2025-04-01, still in effect | Marketing-category sends to +1 recipients are blocked client-side with a clear reason |
| Per-user marketing cap | Dynamic cap across all businesses; error **131049**; do not retry <24h | On 131049: mark `marketing_suppressed_until = now()+24h` on the contact; no auto-retry |
| Messaging limits | Portfolio-level since 2025-10-07: 250 (unverified) → 2K → 10K → 100K → unlimited | Surface tier + quality in Settings; tenant-side concern (their WABA) |
| Throughput | 80 mps default per number (auto-upgradable); pair limit ≈1 msg/6s per recipient, burst 45 | Queue paces per tenant AND per recipient |
| Template categories | MARKETING / UTILITY / AUTHENTICATION; Meta auto-recategorizes; `template_category_update` webhook | Category stored + synced; utility wording guidance in template editor |
| Template approval | `PENDING/APPROVED/REJECTED/PAUSED/DISABLED`; ~24h review; quality auto-pause 3h→6h→disabled; APPROVED edit limit 10/30d, 1/24h | `whatsapp_templates.status/quality_score` synced via webhook + manual sync |
| No language fallback | Missing translation ⇒ error **132001** | Our sender resolves language: customer pref → tenant default → `en`, checking *approved* translations |
| Named params | `parameter_format: named` supported | Templates authored with named params (`{{customer_name}}`), mapped to context keys |
| Webhooks | App-level URL; per-WABA `override_callback_uri` exists; GET `hub.challenge` handshake; `X-Hub-Signature-256` = HMAC-SHA256(app secret, raw body); at-least-once, unordered, ~7-day retry then dropped; no replay API | Fast-ACK design: verify → ledger insert → 200; process async. Dedup mandatory. Our ledger is the durable record |
| Status payloads | `sent/delivered/read/failed` + `pricing` + `conversation`; failures carry `errors[{code, error_data.details}]` (title/subcode deprecated) | Key handling on numeric `code` |
| Error families | Retryable w/ backoff: 4, 80007, 130429, 131000, 131016, 131056, 131057. Not retryable: 100, 131008/9, 131026, 131047, 131051-53, 132xxx (template), 368, 131031, 131042, 190 (token dead), 131048 (quality pause), 131049 (24h suppress), 130472 (experiment) | Error classifier drives retry/suppress/disable logic (§10) |
| Token model (tenant-pasted) | Business Settings → System User → token w/ `whatsapp_business_messaging` + `whatsapp_business_management`, expiration **Never** (dies only on revocation) | Settings capture + `debug_token` validation on save + weekly health check; any 190 ⇒ integration `disconnected` + admin alert |
| Test Connection probe | `GET /{PHONE_NUMBER_ID}?fields=...` + **`GET /{WABA_ID}?fields=health_status`** (`can_send_message: AVAILABLE/LIMITED/BLOCKED` + per-node errors) + `GET /{WABA_ID}/subscribed_apps` | The Test Connection button's three calls |
| Media | Upload `POST /{PHONE_NUMBER_ID}/media` (30-day retention); download URLs valid ~5 min | Tenant logo header: prefer `link` param (branding URL); media-id cache with 25-day refresh if used |
| Embedded Signup | v4 shipped 2025-12; **v2/v3 hard-deprecated 2026-10-15**; Tech Provider = app review + business verification; tenants pay Meta directly | Phase-2 roadmap; abstract `integration_mode: 'byo' | 'tech_provider'` now |
| Opt-in policy | Mandatory affirmative opt-in naming the business; channel-agnostic collection OK (local law permitting); keep proof; honor opt-outs in-channel | Consent ledger + intake-form capture + STOP automation (§11) |
| GDPR | Meta = processor/sub-processor; Cloud API retains ≤30 days; EU Local Storage exists; erasure must cascade to our logs (custody carve-out documented) | `anonymize_customer_data` extended to WhatsApp tables |

**UNVERIFIED items to re-confirm during implementation** (research environment could not reach `developers.facebook.com` directly): exact v4 Embedded Signup `extras` schema; phone-number-level webhook override body; Oct-2026 service-message pricing change; exact per-market rates (pull Meta rate card); mTLS CN string. None of these block Phase 1.

---

## 3. Lifecycle fit — the automation event catalog

Every automation maps to the 16-stage lifecycle (CLAUDE.md). Events marked ● already exist in the outbox; ○ need new emitters (designed in §7).

| # | Automation event (Settings label) | Lifecycle stage | Event key (rules table) | Source | Meta category |
|---|---|---|---|---|---|
| 1 | Device Check-in Receipt | 3 Device Intake | `case.device_received` | ○ trigger AFTER INSERT `case_devices` | UTILITY |
| 2 | Case Registered | 2 Case Creation | `case.created` | ○ trigger AFTER INSERT `cases` | UTILITY |
| 3 | Device Accepted for Evaluation | 5/6 Diagnosis | `case.phase_changed:diagnosis` | ● `case.phase_changed` (match `to_phase`) | UTILITY |
| 4 | Quote Generated | 7 Quotation | `quote.created` | ○ trigger AFTER INSERT `quotes` | UTILITY |
| 5 | Quote Sent | 7 Quotation | `quote.sent` | ○ trigger on `quotes.sent_at` (new column) | UTILITY |
| 6 | Quote Reminder | 7 Quotation | `quote.reminder` | ○ scheduled scanner (sent + N days, no decision) | UTILITY |
| 7 | Quote Approved (confirmation) | 7 Approval | `quote.approved` | ○ trigger on `quotes.status → accepted` | UTILITY |
| 8 | Quote Rejected (acknowledgement) | 7 Approval | `quote.rejected` | ○ trigger on `quotes.status → rejected` | UTILITY |
| 9 | Recovery Started | 8 Recovery | `case.phase_changed:recovery` | ● | UTILITY |
| 10 | Recovery In Progress (milestone update) | 8 Recovery | `case.milestone` | ○ manual/milestone emit (Phase 3) | UTILITY |
| 11 | Recovery Completed | 8/11 | `case.recovery_outcome` | ○ trigger on `cases.recovery_outcome` change | UTILITY |
| 12 | QA Passed / Ready for Collection | 11–13 Ready | `case.phase_changed:ready` | ● (status `Ready for Delivery` is customer-visible) | UTILITY |
| 13 | Invoice Issued | 14 Billing | `invoice.issued` | ○ trigger on `invoices` insert/issue | UTILITY |
| 14 | Payment Received (receipt) | 14 Billing | `payment.received.customer` | ● trigger on `payments` | UTILITY |
| 15 | Device Collected (checkout confirmation) | 13 Checkout | `case.checked_out` | ○ trigger on `case_job_history` action `checkout` | UTILITY |
| 16 | Case Closed | 15 Closure | `case.phase_changed:closed` | ● | UTILITY |
| 17 | Follow-up Reminder | 16 | `case.follow_up_due` | ● (extend `case_follow_ups.channel` with `whatsapp`) | UTILITY |
| 18 | Pickup / Appointment Reminder | 13 | `case.follow_up_due` (`follow_up_type='pickup_reminder'`) | ● | UTILITY |
| 19 | Feedback Request | post-15 | `case.feedback_request` | ○ scheduled (delivered + N days) | **MARKETING** |
| 20 | Google Review Request | post-15 | `case.review_request` | ○ scheduled (feedback positive / delivered + N days) | **MARKETING** |
| 21 | No-Solution Follow-up | no_solution | `case.follow_up_due` (no-solution review) | ● | UTILITY |
| 22 | Custom / Manual | any | staff-initiated template send from Case/Customer | UI action | per template |

Notes:
- Phase-change automations key on `case.phase_changed:<to_phase>` — the dispatcher expands the base event using `payload->>'to_phase'`. Manual overrides (`set_case_status`) also emit `case.phase_changed`, so overridden statuses still notify (correct for a lab: the customer cares about the state, not how it was set). Rules can optionally exclude `manual_override` events.
- "Warranty Reminder" has no warranty entity in the platform; it ships as a documented **custom scheduled follow-up** preset (roadmap: warranty entity).
- Multi-device jobs: messages are **case-scoped**; device-level detail is rendered in variables (e.g. `{{device_summary}}` = "3 of 12 drives recovered"). A 12-drive RAID never fans out to 12 customer messages.

---

## 4. End-to-end architecture

```
                                     ┌─────────────────────────────────────────────┐
                                     │                Meta Cloud API                │
                                     │  graph.facebook.com/v25.0                    │
                                     └───────▲──────────────────────────┬──────────┘
                                             │ HTTPS (Bearer token +    │ Webhooks (POST, X-Hub-Signature-256)
                                             │ appsecret_proof)         │ GET verify handshake
┌───────────────────────┐            ┌───────┴──────────┐      ┌────────▼─────────┐
│  Business events      │            │  whatsapp-send   │      │ whatsapp-webhook │
│  (DB triggers + cron) │            │  (edge worker)   │      │  (edge receiver) │
│                       │            │  claim→render→   │      │  verify→ledger→  │
│ cases / case_devices  │  emit      │  send→record     │      │  200; async      │
│ quotes / invoices     ├──────────┐ └───────▲──────────┘      │  process         │
│ payments / follow_ups │          │         │ pg_net poke +   └────────┬─────────┘
└───────────────────────┘          ▼         │ 1-min pg_cron sweep      │
                          ┌──────────────────┴───┐                      │ statuses → message rows
                          │  notification_events │                      │ inbound → comms ledger,
                          │  (existing outbox)   │                      │ window state, STOP, replies
                          └──────────┬───────────┘                      ▼
                                     │ AFTER INSERT dispatcher   ┌──────────────────────┐
                                     │ (rule match + consent +   │ whatsapp_webhook_    │
                                     │  feature gate + window)   │ events (idempotency  │
                                     ▼                           │ ledger)              │
                          ┌──────────────────────┐               └──────────────────────┘
                          │ whatsapp_messages    │
                          │ (queue + permanent   │──── analytics, message log UI,
                          │  delivery ledger)    │     case_communications mirror
                          └──────────────────────┘
```

Components:

1. **Emission** — existing + new DB triggers call `emit_notification_event()`. Nothing client-side is trusted for automation (client paths are unreliable per the event-hook audit).
2. **Dispatch (SQL, in-transaction)** — `dispatch_notification_event_whatsapp()` AFTER INSERT ON `notification_events`: cheap short-circuits first (tenant has connected+enabled integration → feature flag → matching enabled rule → recipient resolvable + consented + not opted out). Inserts a `whatsapp_messages` row (`status='pending'`, `scheduled_for = now() + rule.delay` respecting business-hours windows), then best-effort `pg_net` poke of the worker for instant sends. Dormant-until-configured: no integration ⇒ zero overhead beyond one indexed lookup.
3. **Queue execution** — pg_cron every minute runs `process_due_whatsapp_messages()` (`FOR UPDATE SKIP LOCKED LIMIT 50`, per-tenant fair batch): stamps `attempt_count`, poke worker per message. The poke-plus-sweep pair gives sub-second sends when healthy and guaranteed progress when pokes are lost.
4. **Worker (`whatsapp-send`)** — service-role-only edge function: atomic claim (`pending→processing`), re-checks consent/window/suppression, resolves language + approved template, builds context via the ported template context, renders + freezes params onto the row, reveals credentials (Vault RPC), calls Graph API, records `wamid` (`status='sent'`) or classifies the error (retry w/ backoff, suppress, fail, or disable integration), mirrors to `log_case_communication`.
5. **Receiver (`whatsapp-webhook`)** — public endpoint (`verify_jwt=false`): GET handshake with per-tenant verify token; POST: raw-body HMAC check against the tenant's app secret, two-phase ledger insert, immediate 200. Processing: statuses → update message rows (+pricing, +read receipts); template status/quality/category webhooks → update `whatsapp_templates`; phone quality → integration health; inbound messages → comms ledgers, contact window state, STOP/START, button replies, staff notification via existing `notification_events`.
6. **Admin (`whatsapp-admin`)** — user-JWT edge function (owner/admin, rate-limited): `save-credentials` (validate via `debug_token` + store in Vault), `test-connection`, `sync-templates`, `submit-template`, `delete-template`, `send-test-message`.
7. **Frontend** — Communications settings module (connection, automations, templates, consent defaults), case-thread integration, customer consent surfaces, message log + analytics pages.

Tenant isolation: every new table is tenant-scoped with the full CLAUDE.md kit (tenant_id NOT NULL, RESTRICTIVE isolation with InitPlan-wrapped helpers, audit trigger, partial tenant index, soft deletes). Webhook tenant routing is by `metadata.phone_number_id → whatsapp_integrations`, never trusting payload-supplied tenant ids.

---

## 5. Database schema (summary — full DDL in the plan)

New tables (prefix `whatsapp_*`, all tenant-scoped unless noted):

### `whatsapp_integrations` — one row per tenant
Connection identity + health. `app_id`, `waba_id`, `phone_number_id`, `display_phone_number`, `verified_name`, `integration_mode ('byo'|'tech_provider')`, `webhook_verify_token` (per-tenant, random), `graph_api_version`, `is_enabled`, `connection_status ('disconnected'|'connected'|'error'|'token_invalid')`, `webhook_status ('unverified'|'verified'|'receiving')`, `quality_rating`, `messaging_limit_tier`, `name_status`, `token_valid`, `token_expires_at` (0/never surfaced as NULL), `last_health_check_at`, `last_webhook_at`, `health_errors jsonb`, **`access_token_secret_id uuid` / `app_secret_secret_id uuid`** (Supabase Vault secret ids — the tokens themselves never touch a table). Column grants on the secret-id columns are REVOKEd from `authenticated`; reveal only via SECURITY DEFINER RPC executable by `service_role`.

### `whatsapp_templates` — Meta template registry
`meta_template_id`, `name`, `language`, `category`, `parameter_format`, `components jsonb` (as stored at Meta), `status ('DRAFT'|'PENDING'|'APPROVED'|'REJECTED'|'PAUSED'|'DISABLED')`, `quality_score`, `rejection_reason`, `variable_map jsonb` (named param → context key, e.g. `{"customer_name":"customer.name","case_number":"case.number"}`), `event_key` (nullable — which automation uses it), `is_fallback boolean` (per event: language-fallback template), `version int` + `superseded_by` (versioning: edits create a new row, Meta name+language stays), `last_synced_at`. Unique `(tenant_id, name, language, version)`.

### `whatsapp_automation_rules` — per-event toggle + behavior
`event_key` (catalog §3), `enabled`, `template_id → whatsapp_templates`, `delay_minutes int default 0`, `send_window ('any'|'business_hours')`, `business_hours jsonb` (`{"start":"08:30","end":"18:00"}`, tenant timezone; weekends from tenant config), `conditions jsonb` (payload matchers, e.g. `{"exclude_manual_override": true}`), `reminder_config jsonb` (for scheduled events: `{"after_days":3,"repeat_max":2,"repeat_every_days":4}`). Unique `(tenant_id, event_key)`. Seeded from the code catalog on first Settings visit; **absent row = disabled** (dispatcher only fires on an existing enabled rule).

### `whatsapp_messages` — queue + permanent delivery ledger (one table)
Queue fields: `status ('pending'|'processing'|'sent'|'delivered'|'read'|'failed'|'cancelled'|'skipped')`, `scheduled_for`, `attempt_count`, `next_attempt_at`, `last_error_code int`, `last_error text`, `dedup_key` (unique per tenant, NULLs distinct).
Payload fields: `event_key`, `notification_event_id`, `template_id`, `template_name`, `template_language`, `rendered_params jsonb` (frozen at send), `body_preview text` (rendered human-readable body for the log/case tab), `message_kind ('template'|'session_text'|'session_media')`.
Recipient/context: `customer_id`, `to_phone_e164`, `wa_id`, `case_id`, `quote_id`, `invoice_id`, `contact_id → whatsapp_contacts`.
Delivery: `wamid` (unique, nullable), `sent_at`, `delivered_at`, `read_at`, `failed_at`, `pricing_billable`, `pricing_category`, `pricing_type`, `conversation_id`, `initiated_by uuid` (staff manual sends).
Indexes: partial due-index `(scheduled_for) WHERE status='pending' AND deleted_at IS NULL`, `wamid`, `(tenant_id, case_id)`, `(tenant_id, customer_id)`, `(tenant_id, created_at)` for analytics.

### `whatsapp_contacts` — per-recipient channel state
`customer_id` (unique per tenant), `wa_id`, `phone_e164`, `service_window_expires_at` (24h window; set by inbound webhook), `last_inbound_at`, `last_outbound_at` (pair-rate pacing), `marketing_suppressed_until` (131049), `opt_out_all boolean`, `unreachable boolean` (131026), `profile_name`.

### `whatsapp_consents` — append-only consent ledger
`customer_id`, `scope ('utility'|'marketing')`, `action ('opt_in'|'opt_out')`, `source ('intake_form'|'staff'|'portal'|'inbound_message'|'import')`, `consent_text` (exact wording shown), `phone_e164`, `actor_user_id`, `occurred_at`. Append-only (REVOKE UPDATE/DELETE + `prevent_audit_mutation`-style trigger). Current state = latest row per (customer, scope); helper `whatsapp_consent_state(customer_id)` returns effective state. GDPR: `export_customer_data`/`anonymize_customer_data` extended to cover it (anonymize nulls phone/text, keeps the event skeleton for audit).

### `whatsapp_webhook_events` — idempotency ledger (mirror of `billing_events`)
`provider_event_id text UNIQUE NOT NULL` (deterministic: `sha256(raw_body)` per delivery — Meta has no event id; dedup by content hash + logical keys inside processing), `tenant_id` (nullable until resolved; unresolvable events are acked and parked), `field`, `payload jsonb`, `signature_valid boolean`, `processed_at`, `processing_error`. Not tenant-RLS-scoped for INSERT (service role writes); SELECT restricted to platform admin + owning tenant.

### `whatsapp_inbound_messages` — customer replies
`wamid UNIQUE`, `contact_id`, `customer_id`, `case_id` (best-effort correlation: replied-to context wamid → our message → case), `message_type`, `body`, `media_id`, `media_mime`, `button_payload`, `raw jsonb`, `received_at`, `handled ('none'|'stop'|'start'|'button'|'staff_notified')`. Mirrored into `case_communications`/`customer_communications` (`direction='inbound'`).

Schema changes to existing tables:
- `quotes.sent_at timestamptz` + DB-side stamp when status flips to `sent` (fixes the "quote pending N days" blind spot found in the event audit).
- `case_follow_ups.channel` CHECK widened with `'whatsapp'`.
- `master_template_types`: none needed (`whatsapp` type already seeded).
- `customers_enhanced`: no new columns (uses existing `whatsapp_number`, `preferred_language` — both finally get capture UI).

RPCs (SECURITY DEFINER, locked EXECUTE): `whatsapp_store_credentials`, `whatsapp_reveal_credentials` (service_role only), `process_due_whatsapp_messages`, `process_whatsapp_scheduled_reminders`, `whatsapp_consent_state`, `dispatch_notification_event_whatsapp` (trigger fn), plus emitter trigger functions.

---

## 6. Security & encryption architecture

**Threat model:** per-tenant permanent Meta tokens are bearer credentials for the tenant's WhatsApp identity; leakage = attacker can impersonate the lab to its customers. Staff (including tenant admins) must never see stored secrets after entry; the browser must never receive them back.

1. **Storage — Supabase Vault (first live use; house-approved design).** `vault.create_secret()` inside `whatsapp_store_credentials(p_tenant_id, p_access_token, p_app_secret, ...)`; the integration row keeps only `*_secret_id`. Reveal path `whatsapp_reveal_credentials(p_tenant_id)` reads `vault.decrypted_secrets`, is EXECUTE-restricted to `service_role`, and writes an `audit_trails` access entry. Rotation = re-store (new Vault secret, old deleted). Vault keys live outside the DB (libsodium AEAD) — a DB dump does not leak tokens.
2. **Entry path.** Credentials POST from the admin's browser directly to `whatsapp-admin` (user-JWT, owner/admin-gated, `check_rate_limit`), which validates via `GET /debug_token` (scopes must include `whatsapp_business_messaging` + `whatsapp_business_management`; `granular_scopes.target_ids` must contain the claimed WABA) **before** storing. Invalid credentials are never persisted. The UI shows write-only fields (`••••` after save, "Replace" action).
3. **Outbound Graph calls** attach `appsecret_proof = HMAC_SHA256(app_secret, access_token)` — blocks token replay from other IPs if the tenant enables "Require app secret".
4. **Webhook authentication.** GET handshake: per-tenant verify token (random 32 bytes, generated by us, shown once to paste into Meta). POST: `X-Hub-Signature-256` HMAC-SHA256 over the **raw body bytes** with the tenant's app secret, timing-safe compare, before any parsing; tenant resolved by URL param `?t=<integration public id>` cross-checked against `metadata.phone_number_id`. Signature mismatch ⇒ 401 (logged); unresolvable-but-valid ⇒ 200 + parked (Meta must not retry forever).
5. **RLS.** Full tenant kit on every table; secret-id columns additionally REVOKEd; `whatsapp_webhook_events` writable only by service role. All policy helper calls `(SELECT ...)`-wrapped per the InitPlan rule.
6. **Feature + entitlement gates, server-side.** Dispatcher checks `tenant_feature_enabled(tenant_id, 'automation.whatsapp')` (client flags fail open by design); module entitlements can layer on top later.
7. **Edge-function tiers** follow house conventions exactly: `whatsapp-webhook` public + self-verifying (`verify_jwt=false` in config.toml); `whatsapp-send` service-role-bearer-only; `whatsapp-admin` user-JWT dual-client with role + tenant gates.
8. **PII discipline.** Message bodies contain case/customer data → same protection class as `case_communications`. `body_preview` is the only rendered copy kept; webhook raw payloads age out (90-day scheduled purge of `whatsapp_webhook_events.payload`, keeping the skeleton row). GDPR erasure cascades (§11).

---

## 7. Event emission — new DB-side emitters

All emitters are AFTER-triggers calling `emit_notification_event()` with day/hour-bucketed dedup keys, guarded by `current_setting('app.importing', true)` (import-path precedent) and firing only when the tenant has any enabled whatsapp/notification use for the event (cheap EXISTS — keeps the outbox from bloating for tenants that never enabled anything; the email dispatcher's subscription-blind behavior is a known defect we do not copy).

| Emitter | Event | Notes |
|---|---|---|
| `trg_emit_case_created` AFTER INSERT ON `cases` | `case.created` | Skips imports; payload: case_number, customer_id, priority, service_type |
| `trg_emit_device_received` AFTER INSERT ON `case_devices` | `case.device_received` | Same hook point as the custody trigger (proven); payload: device model/serial, case totals |
| `trg_emit_quote_events` AFTER INSERT OR UPDATE ON `quotes` | `quote.created` / `quote.sent` / `quote.approved` / `quote.rejected` | Status-watch (`IS DISTINCT FROM`); INSERT ⇒ created; `sent_at` stamped DB-side when status→sent (closes the client-side best-effort hole) |
| `trg_emit_invoice_issued` AFTER INSERT OR UPDATE ON `invoices` | `invoice.issued` | Fires on insert with status `sent` or on draft→sent flip (`issue_tax_document` path) |
| `trg_emit_recovery_outcome` AFTER UPDATE ON `cases` | `case.recovery_outcome` | `recovery_outcome IS DISTINCT FROM` + value non-null; dedup by (case, outcome) — absorbs the triple-writer problem |
| `trg_emit_case_checkout` AFTER INSERT ON `case_job_history` | `case.checked_out` | `action='checkout'` rows (fires even when the best-effort phase transitions are blocked) |
| `process_whatsapp_scheduled_reminders()` (pg_cron 15-min) | `quote.reminder`, `case.feedback_request`, `case.review_request` | Scans `quotes.sent_at + rule.after_days` (status still sent/pending decision), `cases.actual_completion + after_days`; day-bucket dedup; respects per-rule `repeat_max` |

`payment.received.customer`, `case.phase_changed(.customer)`, `case.follow_up_due`, `quote.expiring_soon`, `invoice.overdue.*` already exist — the WhatsApp dispatcher consumes them as-is.

---

## 8. Queue design — pacing, ordering, scale

- **Fairness:** the scanner claims `LIMIT 50` per tick ordered by `(scheduled_for, priority)` but never more than 10 per tenant per tick (window function) — one noisy tenant cannot starve others.
- **Pair pacing:** worker refuses to send if `whatsapp_contacts.last_outbound_at > now() - interval '6 seconds'`; reschedules +10s. Prevents 131056 and preserves per-recipient ordering (a case's messages to one customer serialize naturally).
- **Ordering:** Meta does not guarantee order; for multi-message moments we send one message. Where sequence matters (rare), the rule engine chains on the `delivered` status of the predecessor (roadmap; Phase 1 has no multi-message sequences).
- **Throughput math:** 1-min tick × 50 batch = 3,000 msg/hour baseline per project — three orders of magnitude above a large lab's real volume (a 500-case/month lab sends ~2–3k messages/month). Instant path (pg_net poke on enqueue) keeps p50 latency < 2s. Scale levers, in order: batch size ↑, tick to 30s (second cron entry offset), worker accepts message-id arrays, then (only if the platform outgrows Postgres-as-queue) swap the scanner for pgmq/SQS behind the same worker contract — the `whatsapp_messages` row remains the source of truth in every variant.
- **Backoff:** `next_attempt_at = now() + LEAST(2^attempt * 1 min, 12h)` for retryable codes; attempt cap 5 → `failed` + failure notification. Non-retryable codes fail immediately with a human-readable reason. 131048 (quality pause) additionally pauses the *integration* sends for 1h; 190 marks the integration `token_invalid` and cancels nothing (messages wait as `pending` until reconnection).
- **At-most-once send:** claim-before-send conditional UPDATE (house pattern); a crashed worker leaves `processing` rows that the sweeper returns to `pending` after 5 min (send may have succeeded → the wamid-less retry is accepted; template duplicates are tolerable and rare — documented trade-off, same as SMTP path).

## 9. Webhook flow

```
GET  /whatsapp-webhook?t=<pub_id>   → verify hub.mode + per-tenant token → 200 raw hub.challenge
POST /whatsapp-webhook?t=<pub_id>
  1. read raw body bytes; resolve integration by pub_id
  2. HMAC-SHA256(app_secret, raw) vs X-Hub-Signature-256   → mismatch: 401
  3. INSERT whatsapp_webhook_events (provider_event_id = sha256(raw)) — 23505 + processed_at set ⇒ 200 (dup)
  4. return 200 immediately after enqueue-style insert; process inline but fast (statuses/inbound are single-row updates)
  5. per entry.changes[]:
     field=messages / statuses[]  → UPDATE whatsapp_messages by wamid (sent→delivered→read monotonic;
                                    failed + errors[]; pricing fields); mirror read/delivered to notification-style ledger
     field=messages / messages[]  → dedup by wamid; upsert whatsapp_contacts (window := now()+24h);
                                    STOP/UNSUBSCRIBE keywords → consent opt_out + confirmation template;
                                    START → opt_in; button_reply payloads (e.g. CONFIRM_COLLECTED) recorded;
                                    insert whatsapp_inbound_messages + case/customer comms rows;
                                    emit notification_event whatsapp.reply_received (staff in-app/email)
     field=message_template_status_update / _quality_update / template_category_update
                                  → update whatsapp_templates (status/quality/category; PAUSED/DISABLED alerts staff)
     field=phone_number_quality_update / account_update → update integration health + alert
  6. stamp processed_at (two-phase; reprocess-safe updates are all idempotent set-to-value)
```

Meta retries failed deliveries with backoff for ~7 days, then the event is gone — our ledger insert happens before any processing so a processing bug never loses an event (reprocessed after fix by clearing `processed_at`).

## 10. Failure handling & monitoring

- **Error taxonomy** (worker classifier): `retry` (backoff), `reschedule_window` (131047 — should not occur for templates; if seen, re-check template status), `suppress_marketing_24h` (131049), `mark_unreachable` (131026 → contact flagged, future sends skipped with reason), `template_broken` (132xxx → fail + alert + template flagged), `integration_quality_pause` (131048), `integration_token_dead` (190/0 → integration `token_invalid`, admin alert, queue holds), `integration_locked` (131031/368/131042 → admin alert with Meta remediation link), `hard_fail` (100 etc.).
- **Failure notifications:** terminal failures emit `whatsapp.message_failed` into `notification_events` → staff in-app/email via the existing stack; integration-level states surface as a persistent Settings banner + dashboard chip.
- **Health:** weekly + on-demand health check (`debug_token`, `health_status`, `subscribed_apps`) persisted on the integration row; `last_webhook_at` staleness (>48h with sends outstanding) raises a "webhook silent" warning — the known silent-death mode (e.g. tenant edited their app, mTLS CA change).
- **Ops surfaces:** Message Log page (filter by status/error), integration health card, DLQ semantics: `whatsapp_messages` IS the DLQ (`failed` rows retryable by staff, mirroring `notificationDLQService.retryEvent`); platform-admin cross-tenant view rides the existing NotificationDLQ console pattern.
- **Metrics to watch (rollout):** send success rate, delivery rate, p50 enqueue→sent, failure code distribution, webhook lag (`last_webhook_at`), per-tenant volume vs messaging tier.

## 11. Consent, compliance, GDPR

- **Opt-in capture points:** CreateCaseWizard intake step + CustomerFormModal get an unchecked "WhatsApp updates" consent block naming the tenant's business name, split into *service updates* (utility) and *offers & review requests* (marketing); each writes a `whatsapp_consents` row with the exact wording. Staff can record phone/in-person opt-ins (source `staff`). Portal self-service opt-in/out is Phase 3.
- **Enforcement:** the dispatcher requires effective `utility` opt-in for utility events and `marketing` for marketing events — no consent, no enqueue (`skipped` rows are not created; the rule editor shows consent coverage instead). Opt-out (any source) suppresses immediately (`whatsapp_contacts.opt_out_all` fast path).
- **STOP automation:** inbound STOP/UNSUBSCRIBE (+ localized keywords per template language) → opt-out row + single confirmation template + contact suppression; START/RESUME reverses. Marketing templates carry an "Unsubscribe" quick-reply button by default.
- **US numbers:** marketing sends to `+1` recipients are skipped with reason `us_marketing_paused` while the Meta pause stands.
- **GDPR:** DPA chain tenant (controller) → xSuite (processor) → Meta (sub-processor); tenant privacy-notice guidance shipped in docs. `export_customer_data` + `anonymize_customer_data` extended to `whatsapp_messages`, `whatsapp_inbound_messages`, `whatsapp_contacts`, `whatsapp_consents` (anonymize keeps row skeletons; custody/audit carve-out documented — consent ledger anonymized but not deleted, legal basis: Art. 17(3)(e)). Raw webhook payload purge at 90 days.

## 12. Template engine & UX

- **Authoring:** Template Studio tab — name (auto-slugged), language(s), category with plain-language guidance ("promotional wording in a UTILITY template gets recategorized by Meta"), body editor with variable chips (named params bound to `master_template_variables` context keys), optional header (text or tenant-logo image), footer, buttons (quick reply / URL with dynamic suffix / phone). Live WhatsApp-style preview (chat bubble, sample context) — reusing `templateEngine` + sample payloads. Submit → `whatsapp-admin` → Meta; status chip tracks PENDING→APPROVED via webhook.
- **Versioning:** editing an APPROVED template creates version n+1 (Meta edit limits: 10/30d, 1/24h — surfaced in UI); prior row `superseded_by`-linked; automation rules always point at the template family head.
- **Languages:** one template row per language; the send-time resolver walks customer `preferred_language` → tenant default → `en`, using only APPROVED rows; per-event fallback template (`is_fallback`) guarantees delivery when a language is missing (no Meta-side fallback exists).
- **Starter pack:** seeded DRAFT templates for all §3 utility events (EN + tenant secondary language), professionally written with emoji + placeholders, one click to submit — the "beautiful by default" requirement.

## 13. UI/UX design (house design system)

All surfaces follow DESIGN.md tokens (no new tokens), lucide icons, `StatCard`/`KpiRow`, `CustomerFormModal` modal contract, `FeaturesSettings` preview-before-save bar, and the settings-page anatomy (SettingsPageHeader + back). Charts: Recharts + `chartTheme` hues.

1. **Settings → Communications → WhatsApp** (route `/settings/communications`, admin-gated, categoryId `communications`, group `workspace`):
   - **Connection tab:** hero connection card (status ring: connected/error/disconnected), credentials form (App ID, WABA ID, Phone Number ID, App Secret*, Access Token* — write-only), per-tenant webhook URL + verify token with copy buttons and a step-by-step Meta setup checklist, **Test Connection** button (three-probe result list: token, number, webhook), health badges (quality GREEN/YELLOW/RED, messaging tier, display-name status, API version, token validity), danger zone (disconnect).
   - **Automations tab:** grouped per lifecycle stage; each event row = Switch + template picker + delay + business-hours toggle + consent-coverage hint; preview-before-save action bar; master switch mirrors `automation.whatsapp`.
   - **Templates tab:** table (name, languages, category, status chips, quality dots, linked event) + Template Studio editor with live preview; Sync-from-Meta action.
2. **Case Detail → Communications tab:** WhatsApp thread (outbound bubbles with ✓/✓✓/✓✓-blue ticks from statuses, inbound bubbles, failures with reason + retry), Send-template action (window-aware: free-form reply enabled only while the 24h window is open, with countdown).
3. **Customer Profile:** WhatsApp panel — `whatsapp_number` capture (E.164-normalized `PhoneInput`), consent state + history, opt-out button.
4. **CreateCaseWizard:** consent checkbox block at intake (§11).
5. **Analytics → Message Analytics** (route `/analytics/messages` or dashboard tab): KpiRow (sent, delivered %, read %, replied %, failed, est. cost), Recharts time-series (volume by status), failure-code bar, per-event success table, date-range preset filter (tenant-timezone `tenantToday` pattern), CSV export.
6. **Message Log** (within settings module or analytics page): virtualized table, filters, per-row detail drawer (params, timeline, error, raw status trail), retry action.

## 14. Testing strategy

- **Pure modules** (Deno-portable, vitest via `geo:test` config): signature verify, param builder, error classifier, backoff calculator, phone E.164 normalizer, language resolver, STOP-keyword matcher, business-hours scheduler. Complete unit suites in the plan.
- **SQL:** dispatcher + scanner behavior via migration-applied test harness against a branch DB (enqueue on rule match, consent gating, dedup, fairness cap).
- **Integration:** Meta **test number** (5 verified recipients, free) exercised from a staging tenant: template submit → approval webhook, send → status webhooks, inbound → STOP flow. Webhook handshake + signed sample payloads via the dashboard Test button.
- **E2E checklist (pilot):** full lifecycle on a real case with a consenting recipient; kill-switch drill (feature flag off mid-queue); token-revocation drill (expect `token_invalid` + banner + queue hold).

## 15. Deployment & rollout

1. **Phase 0** (schema + vault + emitters) ships dormant — no behavior change until an integration row exists.
2. **Phase 1** (edge functions + queue) deploys with `automation.whatsapp` default-off; internal tenant connects a Meta test number.
3. **Phase 2** (settings UI) → pilot: 1–2 real tenants, utility events only, daily metric review for 2 weeks (delivery ≥95%, failures explained, zero cross-tenant leaks in log sampling).
4. **Phase 3** (case thread, consent surfaces, analytics) → GA: feature announced, docs + Meta-onboarding guide for labs (Business verification, display name, number tips).
5. **Kill switches:** per-tenant `is_enabled`, platform `automation.whatsapp` registry default, pg_cron unschedule as last resort. All independent of deploys.

Rollback: edge functions are independently re-deployable; migrations are additive-only (house rule) — disabling triggers is the schema-level rollback.

## 16. Disaster recovery

- **Queue/ledger data** lives in Postgres — covered by existing PITR/backup posture; messages are re-derivable from `notification_events` where lost.
- **Webhook outage:** Meta retries ~7 days; ledger-insert-before-processing means a receiver bug loses nothing already ACKed; recovery = fix, clear `processed_at`, reprocess. For gaps beyond 7 days, a reconciliation job re-pulls message statuses (`GET` per wamid is not available — statuses are webhook-only; document that delivery data older than the gap is best-effort; sends themselves are never lost, only receipt granularity).
- **Vault:** secret loss = tenants re-paste credentials (recoverable by design); Vault key management is Supabase-side; the offline-escrow note from the C2 design applies if self-hosting ever happens.
- **Meta-side outage (131016/131057):** queue backs off and drains on recovery — no action needed; status page link surfaced in Settings banner.
- **Token mass-invalidation** (tenant security event at Meta): integration flips `token_invalid`, queue holds `pending` (no data loss), admin walked through re-connect.

## 17. Future roadmap

1. **Tech Provider + Embedded Signup v4** — one-click onboarding, our app owns webhooks (per-WABA overrides), tenants still pay Meta directly. Prereq: Meta business verification + App Review (start immediately; weeks of lead time). `integration_mode` column and service abstraction already accommodate it.
2. **Portal opt-in center** — customers manage channels/scopes in the client portal.
3. **Interactive workflows** — quote approve/decline via template buttons wired to `approve_quote`/`reject_quote` (needs signed short-lived action tokens + custody logging), collection-slot booking via list messages.
4. **Two-way inbox** — staff reply console with window countdown, canned responses; per-user assignment.
5. **Marketing campaigns** — segment sends with 131049-aware pacing, template pacing awareness, per-market rate cards for precise cost forecasting.
6. **SMS fallback** — same queue, second provider adapter, per-event channel cascade (WhatsApp → SMS when unreachable/undelivered 24h).
7. **WhatsApp Flows** for structured intake (address capture for device return shipping).
8. **Warranty entity** + warranty-reminder automation; appointment entity + reminders.
9. **EU Local Storage** request path for EU tenants (via Meta setting) + regional analytics.
