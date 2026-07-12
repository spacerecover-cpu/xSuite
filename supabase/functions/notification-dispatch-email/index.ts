// notification-dispatch-email: edge function that delivers email notifications.
//
// Invoked asynchronously via pg_net.http_post from the
// dispatch_notification_event_email trigger on notification_events.
// Body: { event_id: string }
//
// For each matching email subscription it:
//   1. Resolves the recipient email (staff profile or portal customer).
//   2. Renders the per-tenant or system-default email template.
//   3. Sends via Gmail SMTP (reuses the send-document-email pattern).
//   4. Writes a notification_log row with status sent/failed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";

// CORS is restricted to the origin allowlist (same pattern as send-document-email
// / process-scheduled-followups siblings). This is a service-to-service function
// invoked by pg_net with the service-role bearer, so it must never reflect '*'.
const ALLOWED_ORIGINS = [
  "https://xsuite.space",
  "https://space-recovery.pages.dev",
  ...(Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

// Minimal {{variable}} substitution. Matches the SQL render helper used by
// the in-app dispatch trigger so behavior is consistent across channels.
// {{#if}} / {{#each}} blocks left for a future Handlebars upgrade.
function renderTemplate(template: string | null, payload: Record<string, unknown>): string {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = payload[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

interface NotificationEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  actor_user_id: string | null;
}

interface EmailSubscription {
  id: string;
  user_id: string | null;
  customer_id: string | null;
  recipient_type: "staff" | "portal_customer";
  enabled: boolean;
  frequency: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface EmailTemplate {
  subject_template: string | null;
  body_template: string;
  link_template: string | null;
}

interface UnknownErrorMessage {
  message?: string;
}

async function resolveRecipientEmail(
  supabase: ReturnType<typeof createClient>,
  sub: EmailSubscription,
): Promise<string | null> {
  if (sub.recipient_type === "staff" && sub.user_id) {
    // Staff email lives on auth.users; the service role can call auth.admin.
    const { data, error } = await supabase.auth.admin.getUserById(sub.user_id);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  }
  if (sub.recipient_type === "portal_customer" && sub.customer_id) {
    const { data, error } = await supabase
      .from("customers_enhanced")
      .select("email")
      .eq("id", sub.customer_id)
      .maybeSingle();
    if (error) return null;
    const email = (data as { email?: string } | null)?.email;
    return email ?? null;
  }
  return null;
}

async function findTemplate(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  eventType: string,
  locale: string,
): Promise<EmailTemplate | null> {
  // Tenant override wins over system default (NULL tenant_id).
  const { data, error } = await supabase
    .from("notification_templates")
    .select("subject_template,body_template,link_template,tenant_id")
    .eq("event_type", eventType)
    .eq("channel", "email")
    .eq("locale", locale)
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("tenant_id", { ascending: false, nullsFirst: false });
  if (error || !data || data.length === 0) return null;
  const row = data[0] as unknown as EmailTemplate;
  return row;
}

async function logNotification(
  supabase: ReturnType<typeof createClient>,
  args: {
    tenantId: string;
    eventId: string;
    subscriptionId: string;
    recipientUserId: string | null;
    recipientCustomerId: string | null;
    recipientAddress: string;
    eventType: string;
    title: string;
    body: string;
    link: string;
    payload: Record<string, unknown>;
    status: "sent" | "failed";
    error?: string;
    providerMessageId?: string;
  },
): Promise<void> {
  await supabase.from("notification_log").insert({
    tenant_id: args.tenantId,
    event_id: args.eventId,
    subscription_id: args.subscriptionId,
    recipient_user_id: args.recipientUserId,
    recipient_customer_id: args.recipientCustomerId,
    recipient_address: args.recipientAddress,
    channel: "email",
    event_type: args.eventType,
    title: args.title,
    body: args.body,
    link_url: args.link,
    payload: args.payload,
    status: args.status,
    provider: "gmail_smtp",
    provider_message_id: args.providerMessageId ?? null,
    error: args.error ?? null,
    sent_at: args.status === "sent" ? new Date().toISOString() : null,
  });
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Caller authorization: only the DB dispatch trigger (via pg_net) may invoke
  // this, carrying the service-role bearer. This is the sole tenant-authz gate —
  // it prevents any authenticated cross-tenant user from forcing another
  // tenant's notification emails to be dispatched. Matches the
  // process-scheduled-followups sibling.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!SERVICE_ROLE_KEY || authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return new Response(
      JSON.stringify({ error: "Email service not configured (GMAIL_USER/GMAIL_APP_PASSWORD)" }),
      { status: 503, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  let body: { event_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const eventId = body.event_id;
  if (!eventId) {
    return new Response(JSON.stringify({ error: "event_id required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Load the event.
  const { data: eventRow, error: eventErr } = await supabase
    .from("notification_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (eventErr || !eventRow) {
    return new Response(
      JSON.stringify({ error: "Event not found", event_id: eventId }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
  const event = eventRow as unknown as NotificationEvent;

  // 1b. Idempotency guard: atomically claim the event by stamping processed_at
  // only if it is still NULL. A retry/replay of the same event_id finds
  // processed_at already set, matches zero rows here, and no-ops — so an event
  // dispatches AT MOST ONCE (no duplicate emails, no duplicate notification_log
  // rows) even under pg_net retries or a double invocation.
  const { data: claimed, error: claimErr } = await supabase
    .from("notification_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("processed_at", null)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) {
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!claimed) {
    return new Response(
      JSON.stringify({ ok: true, deliveries: 0, reason: "already_processed", event_id: eventId }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // 2. Find every active email subscription for this event_type in the tenant.
  const { data: subs, error: subsErr } = await supabase
    .from("notification_subscriptions")
    .select("*")
    .eq("tenant_id", event.tenant_id)
    .eq("event_type", event.event_type)
    .eq("channel", "email")
    .eq("enabled", true)
    .eq("frequency", "immediate")
    .is("deleted_at", null);
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const subscriptions = (subs ?? []) as unknown as EmailSubscription[];

  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ ok: true, deliveries: 0 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // 3. Load template once (locale fixed to 'en' for v1; future: pick by recipient locale).
  const template = await findTemplate(supabase, event.tenant_id, event.event_type, "en");
  if (!template) {
    return new Response(JSON.stringify({ ok: true, deliveries: 0, reason: "no_template" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // 4. SMTP client (one connection reused across recipients).
  const smtp = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });

  let sent = 0;
  let failed = 0;

  try {
    for (const sub of subscriptions) {
      const recipientAddress = await resolveRecipientEmail(supabase, sub);
      if (!recipientAddress) {
        failed += 1;
        await logNotification(supabase, {
          tenantId: event.tenant_id,
          eventId: event.id,
          subscriptionId: sub.id,
          recipientUserId: sub.user_id,
          recipientCustomerId: sub.customer_id,
          recipientAddress: "",
          eventType: event.event_type,
          title: "",
          body: "",
          link: "",
          payload: event.payload,
          status: "failed",
          error: "recipient_email_not_found",
        });
        continue;
      }

      const subject = renderTemplate(template.subject_template, event.payload);
      const renderedBody = renderTemplate(template.body_template, event.payload);
      const link = renderTemplate(template.link_template, event.payload);

      try {
        await smtp.send({
          from: GMAIL_USER,
          to: recipientAddress,
          subject,
          content: renderedBody,
        });
        sent += 1;
        await logNotification(supabase, {
          tenantId: event.tenant_id,
          eventId: event.id,
          subscriptionId: sub.id,
          recipientUserId: sub.user_id,
          recipientCustomerId: sub.customer_id,
          recipientAddress,
          eventType: event.event_type,
          title: subject,
          body: renderedBody,
          link,
          payload: event.payload,
          status: "sent",
        });
      } catch (sendErr) {
        failed += 1;
        const message = (sendErr as UnknownErrorMessage)?.message ?? String(sendErr);
        await logNotification(supabase, {
          tenantId: event.tenant_id,
          eventId: event.id,
          subscriptionId: sub.id,
          recipientUserId: sub.user_id,
          recipientCustomerId: sub.customer_id,
          recipientAddress,
          eventType: event.event_type,
          title: subject,
          body: renderedBody,
          link,
          payload: event.payload,
          status: "failed",
          error: message,
        });
      }
    }
  } finally {
    try {
      await smtp.close();
    } catch {
      // closing errors are non-fatal
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      event_id: event.id,
      total: subscriptions.length,
      sent,
      failed,
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
