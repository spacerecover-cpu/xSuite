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
