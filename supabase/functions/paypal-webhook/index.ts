import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://xsuite.space',
  'https://space-recovery.pages.dev',
  ...(Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') || '').split(',').map(o => o.trim()).filter(Boolean),
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function makeCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource: any;
  create_time: string;
}

async function verifyWebhookSignature(
  webhookId: string,
  headers: Headers,
  body: string,
  apiUrl: string,
  accessToken: string
): Promise<boolean> {
  const verificationPayload = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  };

  const response = await fetch(`${apiUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verificationPayload),
  });

  if (!response.ok) {
    console.error("Webhook verification failed:", await response.text());
    return false;
  }

  const result = await response.json();
  return result.verification_status === "SUCCESS";
}

async function getPayPalAccessToken(
  clientId: string,
  clientSecret: string,
  apiUrl: string
): Promise<string> {
  const auth = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(`${apiUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = makeCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const paypalWebhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    const paypalMode = Deno.env.get("PAYPAL_MODE") || "sandbox";

    const paypalApiUrl = paypalMode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const bodyText = await req.text();
    const event: PayPalWebhookEvent = JSON.parse(bodyText);

    // Verify the webhook signature in ALL modes. PayPal exposes
    // verify-webhook-signature on both the sandbox and live API hosts, so there
    // is no mode in which unsigned events may be trusted — an unverified event
    // can drive tenant subscription state off an attacker-supplied custom_id.
    if (!paypalWebhookId || !paypalClientId || !paypalClientSecret) {
      console.error("PayPal webhook verification not configured — rejecting webhook");
      return new Response(
        JSON.stringify({ error: "Webhook verification not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const accessToken = await getPayPalAccessToken(
      paypalClientId,
      paypalClientSecret,
      paypalApiUrl
    );

    const isValid = await verifyWebhookSignature(
      paypalWebhookId,
      req.headers,
      bodyText,
      paypalApiUrl,
      accessToken
    );

    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const tenantId = event.resource?.custom_id;
    // For subscription lifecycle events (BILLING.SUBSCRIPTION.*) the resource IS
    // the subscription, so resource.id is the I-XXXX subscription id. For
    // PAYMENT.SALE.* the resource is a sale/transaction object whose id is the
    // transaction id — the owning subscription id lives in billing_agreement_id.
    // Prefer billing_agreement_id (present only on sale events) so the
    // tenant_subscriptions lookup by paypal_subscription_id (the sole consumer,
    // in PAYMENT.SALE.COMPLETED) resolves; fall back to resource.id otherwise.
    const paypalSubscriptionId = event.resource?.billing_agreement_id || event.resource?.id;

    if (!tenantId) {
      console.warn("No tenant ID in webhook event");
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the event in the ledger. payload and tenant_id are NOT NULL, so
    // this must run after tenantId is derived. The unique paypal_event_id gates
    // re-delivery, but row EXISTENCE alone does not prove the prior delivery
    // finished: processed_at is stamped only at the very end (below), so a
    // duplicate whose processed_at is still NULL means an earlier attempt died
    // mid-flight before applying its state transitions. Only skip when the
    // earlier delivery actually completed; otherwise fall through and re-apply.
    const { error: insertError } = await supabase
      .from("billing_events")
      .insert({
        event_type: event.event_type,
        payload: event,
        paypal_event_id: event.id,
        tenant_id: tenantId,
      });

    if (insertError) {
      const isDuplicate =
        insertError.code === '23505' || insertError.message.includes('duplicate');
      if (isDuplicate) {
        const { data: existing } = await supabase
          .from("billing_events")
          .select("processed_at")
          .eq("paypal_event_id", event.id)
          .maybeSingle();

        if (existing?.processed_at) {
          console.log(`Duplicate webhook event ${event.id} — already processed, skipping`);
          return new Response(
            JSON.stringify({ received: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Recorded but not completed on a prior attempt — reprocess so the
        // state transitions below (which are idempotent set-to-value updates)
        // actually get applied, then re-stamp processed_at at the end.
        console.log(`Webhook event ${event.id} was recorded but not completed — reprocessing`);
      } else {
        console.error("Failed to insert billing event:", insertError);
      }
    }

    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const currentPeriodEnd = event.resource?.billing_info?.next_billing_time;

        await supabase
          .from("tenant_subscriptions")
          .update({
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: currentPeriodEnd || null,
            paypal_payer_id: event.resource?.subscriber?.payer_id,
          })
          .eq("tenant_id", tenantId);

        await supabase
          .from("tenants")
          .update({ subscription_status: 'active' })
          .eq("id", tenantId);

        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED": {
        await supabase
          .from("tenant_subscriptions")
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId);

        await supabase
          .from("tenants")
          .update({ subscription_status: 'cancelled' })
          .eq("id", tenantId);

        break;
      }

      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        // Map SUSPENDED to 'past_due'. 'paused' is NOT permitted by
        // tenant_subscriptions_status_check / tenants_subscription_status_check
        // (both allow only trialing/active/past_due/cancelled/unpaid), so writing
        // 'paused' was silently rejected by Postgres and the row kept its prior
        // 'active' status — leaving a suspended, non-paying tenant fully entitled.
        // 'past_due' is constraint-valid and, like the PAYMENT.FAILED handler,
        // falls outside ACTIVE_SUBSCRIPTION_STATUSES so entitlement is revoked.
        const { error: subError } = await supabase
          .from("tenant_subscriptions")
          .update({ status: 'past_due' })
          .eq("tenant_id", tenantId);

        if (subError) {
          console.error("Failed to suspend tenant_subscriptions status:", subError);
        }

        const { error: tenantError } = await supabase
          .from("tenants")
          .update({ subscription_status: 'past_due' })
          .eq("id", tenantId);

        if (tenantError) {
          console.error("Failed to suspend tenants subscription_status:", tenantError);
        }

        break;
      }

      case "BILLING.SUBSCRIPTION.UPDATED": {
        const newPlanId = event.resource?.plan_id;
        const currentPeriodEnd = event.resource?.billing_info?.next_billing_time;

        if (newPlanId) {
          const { data: plan } = await supabase
            .from("subscription_plans")
            .select("id")
            .or(`paypal_plan_monthly_id.eq.${newPlanId},paypal_plan_yearly_id.eq.${newPlanId}`)
            .single();

          if (plan) {
            await supabase
              .from("tenant_subscriptions")
              .update({
                plan_id: plan.id,
                current_period_end: currentPeriodEnd || null,
              })
              .eq("tenant_id", tenantId);

            await supabase
              .from("tenants")
              .update({ subscription_plan_id: plan.id })
              .eq("id", tenantId);
          }
        }

        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        const amount = parseFloat(event.resource?.amount?.total || "0");
        const currency = event.resource?.amount?.currency || "USD";

        const { data: subscription } = await supabase
          .from("tenant_subscriptions")
          .select("id, plan_id")
          .eq("paypal_subscription_id", paypalSubscriptionId)
          .maybeSingle();

        if (subscription) {
          // Bug #75: this runs under the service-role client, so auth.uid() is
          // null and the plain get_next_number (which derives the tenant from
          // auth.uid()) cannot resolve a sequence. Use the tenant-explicit RPC
          // instead. NOTE: this edge function still requires a separate deploy
          // for this change to take effect.
          // Bug #86: platform SaaS billing (the platform charging the tenant)
          // is a distinct document family from the tenant's customer-facing
          // tax invoices. It MUST use its own 'billing_invoices' scope — never
          // the 'invoices' scope, which is the tenant's legal gapless tax series
          // (EU VAT Art.226 / GCC). Drawing from 'invoices' would burn a number
          // out of that series into a platform table the tenant never sees.
          const { data: nextNumber, error: numberError } = await supabase
            .rpc("get_next_number_for_tenant", { p_tenant: tenantId, p_scope: "billing_invoices" });

          if (numberError) {
            console.error("Failed to mint billing invoice number:", numberError);
          }

          const nowIso = new Date().toISOString();
          const { error: invoiceError } = await supabase
            .from("billing_invoices")
            .insert({
              tenant_id: tenantId,
              subscription_id: subscription.id,
              invoice_number: nextNumber || `INV-${Date.now()}`,
              invoice_date: nowIso,
              subtotal: amount,
              total: amount,
              amount_paid: amount,
              amount_due: 0,
              paid_at: nowIso,
              currency,
              status: 'paid',
              paypal_transaction_id: event.resource?.id,
            });

          if (invoiceError) {
            console.error("Failed to insert billing invoice:", invoiceError);
          }

          await supabase
            .from("tenant_subscriptions")
            .update({ status: 'active' })
            .eq("tenant_id", tenantId);

          await supabase
            .from("tenants")
            .update({ subscription_status: 'active' })
            .eq("id", tenantId);
        }

        break;
      }

      case "PAYMENT.SALE.DENIED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        await supabase
          .from("tenant_subscriptions")
          .update({ status: 'past_due' })
          .eq("tenant_id", tenantId);

        await supabase
          .from("tenants")
          .update({ subscription_status: 'past_due' })
          .eq("id", tenantId);

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.event_type}`);
    }

    await supabase
      .from("billing_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("paypal_event_id", event.id);

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({
        error: "An internal error occurred.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
