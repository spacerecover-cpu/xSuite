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
    // portal tracking link: portal_base_url + the portalUrlService case-link
    // convention (/portal/cases?case=<caseNumber>)
    const portalBase = String(portal.portal_base_url ?? "").trim();
    ctx["case.tracking_link"] = portalBase && ctx["case.number"]
      ? `${portalBase.replace(/\/$/, "")}/portal/cases?case=${encodeURIComponent(ctx["case.number"])}` : "";
    const { data: devices } = await db.from("case_devices")
      .select("model").eq("case_id", msg.case_id).is("deleted_at", null);
    ctx["device.summary"] = (devices ?? []).map((d) => d.model).filter(Boolean).slice(0, 3).join(", ")
      + ((devices?.length ?? 0) > 3 ? ` +${devices!.length - 3} more` : "");
    ctx["device.count"] = String(devices?.length ?? 0);
    // collection date: the earliest scheduled pickup follow-up, if any
    const { data: pickup } = await db.from("case_follow_ups")
      .select("follow_up_date").eq("case_id", msg.case_id)
      .eq("type", "pickup_reminder").eq("status", "pending")
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
      // tenant-logo branding for image-header templates (companySettingsService: branding.logo_url)
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
