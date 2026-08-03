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
    // The contact-level flag is honoured on ANY STOP/START, matched customer or not —
    // an opt-out from an unrecognised number is still an opt-out, and this flag is what
    // the send worker gates on. The consent ledger needs a customer (customer_id NOT NULL),
    // so those rows stay conditional.
    if (kw && contactId) {
      await db.from("whatsapp_contacts").update({ opt_out_all: kw === "stop" }).eq("id", contactId);
    }
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
