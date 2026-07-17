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

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const { data } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  return data === true;
}

function rateLimitResponse(headers: Record<string, string>, retryAfter: number) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    }
  );
}

function makeCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalSubscriptionRequest {
  tenantId: string;
  planId: string;
  billingInterval: 'month' | 'year';
  returnUrl?: string;
  cancelUrl?: string;
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

  const data: PayPalAccessTokenResponse = await response.json();
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
    const paypalMode = Deno.env.get("PAYPAL_MODE") || "sandbox";

    if (!paypalClientId || !paypalClientSecret) {
      throw new Error("PayPal credentials not configured");
    }

    const paypalApiUrl = paypalMode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is an admin
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile || !["owner", "admin"].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: 3 requests per 60 seconds per user
    const rateLimitKey = `paypal-create:${user.id}`;
    const rlAllowed = await checkRateLimit(supabase, rateLimitKey, 3, 60);
    if (!rlAllowed) {
      return rateLimitResponse(corsHeaders, 60);
    }

    const requestBody: PayPalSubscriptionRequest = await req.json();
    const { tenantId, planId, billingInterval, returnUrl, cancelUrl } = requestBody;

    // Verify the caller owns the tenant they're creating a subscription for
    if (callerProfile.tenant_id && callerProfile.tenant_id !== tenantId) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Cannot create subscription for another tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenantId || !planId || !billingInterval) {
      throw new Error("Missing required fields: tenantId, planId, billingInterval");
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("name, contact_email")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new Error("Tenant not found");
    }

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      throw new Error("Plan not found");
    }

    // A tenant has a single tenant_subscriptions row (onConflict: tenant_id). If
    // it already carries an entitling PayPal subscription, creating a new one and
    // overwriting paypal_subscription_id would strand the old subscription: PayPal
    // keeps billing it and its webhooks would match no row. Capture it here so we
    // can cancel it at PayPal before the upsert replaces the id.
    const { data: existingSubscription } = await supabase
      .from("tenant_subscriptions")
      .select("paypal_subscription_id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const paypalPlanId = billingInterval === 'month'
      ? plan.paypal_plan_monthly_id
      : plan.paypal_plan_yearly_id;

    if (!paypalPlanId) {
      throw new Error(`PayPal plan ID not configured for ${plan.code} (${billingInterval})`);
    }

    const accessToken = await getPayPalAccessToken(
      paypalClientId,
      paypalClientSecret,
      paypalApiUrl
    );

    // Plan change: cancel any pre-existing entitling PayPal subscription BEFORE
    // creating/upserting the new one, so PayPal doesn't double-bill and the old
    // subscription id isn't lost when the row's paypal_subscription_id is
    // overwritten. Entitling statuses mirror billingService ACTIVE_SUBSCRIPTION_STATUSES.
    const ENTITLING_STATUSES = ['active', 'trialing'];
    if (
      existingSubscription?.paypal_subscription_id &&
      ENTITLING_STATUSES.includes(existingSubscription.status as string)
    ) {
      const cancelResponse = await fetch(
        `${paypalApiUrl}/v1/billing/subscriptions/${existingSubscription.paypal_subscription_id}/cancel`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "Superseded by plan change" }),
        }
      );

      // PayPal returns 204 on success. Treat 404/422 (already gone / not
      // cancellable) as acceptable — the goal is that the old subscription is no
      // longer billing. Any other failure means it may still bill, so abort
      // rather than create a second concurrently-billing subscription.
      if (
        !cancelResponse.ok &&
        cancelResponse.status !== 204 &&
        cancelResponse.status !== 404 &&
        cancelResponse.status !== 422
      ) {
        const errorText = await cancelResponse.text();
        throw new Error(
          `Failed to cancel existing PayPal subscription before plan change: ${errorText}`
        );
      }
    }

    const defaultReturnUrl = `${req.headers.get("origin") || "http://localhost:5173"}/settings/billing?success=true`;
    const defaultCancelUrl = `${req.headers.get("origin") || "http://localhost:5173"}/settings/billing?cancelled=true`;

    const subscriptionPayload = {
      plan_id: paypalPlanId,
      subscriber: {
        name: {
          given_name: tenant.name.split(' ')[0] || tenant.name,
          surname: tenant.name.split(' ').slice(1).join(' ') || tenant.name,
        },
        email_address: tenant.contact_email || "noreply@xsuite.space",
      },
      custom_id: tenantId,
      application_context: {
        brand_name: "xSuite",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
        },
        return_url: returnUrl || defaultReturnUrl,
        cancel_url: cancelUrl || defaultCancelUrl,
      },
    };

    const idempotencyKey = `${tenantId}-${Date.now()}`;

    const createResponse = await fetch(`${paypalApiUrl}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idempotencyKey,
      },
      body: JSON.stringify(subscriptionPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`PayPal subscription creation failed: ${errorText}`);
    }

    const subscriptionData = await createResponse.json();

    const { error: upsertError } = await supabase
      .from("tenant_subscriptions")
      .upsert({
        tenant_id: tenantId,
        plan_id: planId,
        // Must be one of tenant_subscriptions_status_check
        // ('trialing','active','past_due','cancelled','unpaid'). The subscription
        // is created but not yet approved/billed; the ACTIVATED webhook promotes
        // it to 'active'. Use 'unpaid' — a constraint-valid status that is NOT in
        // billingService ACTIVE_SUBSCRIPTION_STATUSES, so an abandoned approval
        // does not grant free plan entitlement. 'trialing' WOULD entitle;
        // 'pending' is NOT a valid status and fails the CHECK.
        status: 'unpaid',
        billing_interval: billingInterval,
        paypal_subscription_id: subscriptionData.id,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id',
      });

    if (upsertError) {
      // The local row is the system of record the ACTIVATED /
      // PAYMENT.SALE.COMPLETED webhooks and paypal-cancel-subscription rely on
      // (keyed by tenant_id / paypal_subscription_id). If we can't persist it,
      // handing back an approvalUrl would let the subscriber approve and get
      // billed for a subscription we can't track. Best-effort cancel the
      // just-created PayPal subscription, then fail the request instead of
      // returning 200 with an approval URL.
      console.error("Failed to save subscription:", upsertError);

      try {
        await fetch(
          `${paypalApiUrl}/v1/billing/subscriptions/${subscriptionData.id}/cancel`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reason: "Local subscription record could not be created",
            }),
          }
        );
      } catch (cancelError) {
        console.error("Failed to cancel orphaned PayPal subscription:", cancelError);
      }

      throw new Error("Failed to persist subscription record");
    }

    const approvalUrl = subscriptionData.links?.find(
      (link: any) => link.rel === 'approve'
    )?.href;

    return new Response(
      JSON.stringify({
        subscriptionId: subscriptionData.id,
        approvalUrl,
        status: subscriptionData.status,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error creating PayPal subscription:", error);
    return new Response(
      JSON.stringify({
        error: "An internal error occurred. Please try again later.",
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
