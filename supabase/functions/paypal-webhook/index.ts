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
    const paypalSubscriptionId = event.resource?.id || event.resource?.billing_agreement_id;

    if (!tenantId) {
      console.warn("No tenant ID in webhook event");
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the event in the ledger. payload and tenant_id are NOT NULL, so
    // this must run after tenantId is derived. The unique paypal_event_id acts
    // as the idempotency guard: a duplicate delivery means we already recorded
    // (and processed) this event, so short-circuit before re-applying state.
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
        console.log(`Duplicate webhook event ${event.id} — already recorded, skipping`);
        return new Response(
          JSON.stringify({ received: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Failed to insert billing event:", insertError);
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
        await supabase
          .from("tenant_subscriptions")
          .update({ status: 'paused' })
          .eq("tenant_id", tenantId);

        await supabase
          .from("tenants")
          .update({ subscription_status: 'paused' })
          .eq("id", tenantId);

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
          .select("plan_id")
          .eq("paypal_subscription_id", paypalSubscriptionId)
          .single();

        if (subscription) {
          const { data: nextNumber } = await supabase
            .rpc("get_next_number", { sequence_name: "invoices" });

          const nowIso = new Date().toISOString();
          const { error: invoiceError } = await supabase
            .from("billing_invoices")
            .insert({
              tenant_id: tenantId,
              subscription_id: subscription.plan_id,
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
