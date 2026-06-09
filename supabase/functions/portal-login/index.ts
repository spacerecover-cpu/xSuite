// portal-login — mints a short-lived `role='portal'` JWT for an authenticated
// portal customer so the database (not browser JS) enforces per-customer access.
//
// Flow: verify credentials via the existing SECURITY DEFINER RPC
// authenticate_portal_customer (bcrypt + lockout), then sign a JWT with the
// project's JWT secret carrying { role: 'portal', customer_id, tenant_id }.
// The dedicated `portal` Postgres role + TO portal RLS policies (migrations
// portal_identity_helpers_* / portal_role_*) scope every read to that customer.
//
// Token lifecycle (pinned): HS256, 8h TTL (PORTAL_JWT_TTL_SECONDS), NO refresh
// token — the portal re-logs in on expiry (matches the existing inactivity
// timeout UX). Deployed with verify_jwt=false because this IS the login
// endpoint (the caller has no JWT yet); it does its own authentication.
//
// Abuse controls (audit SEC-8): CORS is restricted to the origin allowlist
// (same pattern as send-otp-email — defaults + ALLOWED_ORIGINS env), and login
// attempts are rate-limited DB-side via check_rate_limit per email (5/15min)
// and per source IP (20/15min). The limiter fails OPEN so a rate-limit outage
// can never lock customers out of the portal.
//
// REQUIRES the project JWT secret to be available as SUPABASE_JWT_SECRET (or
// PORTAL_JWT_SECRET). Supabase does NOT provide the JWT secret to edge functions
// by default — set it once:  supabase secrets set PORTAL_JWT_SECRET=<jwt secret>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const ALLOWED_ORIGINS = [
  "https://xsuite.space",
  "https://space-recovery.pages.dev",
  ...(Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function makeCorsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function clientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    (req.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ??
    "unknown"
  );
}

Deno.serve(async (req: Request) => {
  const cors = makeCorsHeaders(req);
  const json = (status: number, payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? Deno.env.get("PORTAL_JWT_SECRET");
  if (!jwtSecret) return json(500, { error: "jwt_secret_not_configured" });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) return json(400, { error: "missing_credentials" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "server_misconfigured" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // DB-side rate limit before touching credentials: per-email and per-IP
  // windows. RPC errors fail OPEN (availability over throttling).
  try {
    const ip = clientIp(req);
    const [emailLimit, ipLimit] = await Promise.all([
      admin.rpc("check_rate_limit", {
        p_key: `portal-login:email:${email.toLowerCase()}`,
        p_max_requests: 5,
        p_window_seconds: 900,
      }),
      admin.rpc("check_rate_limit", {
        p_key: `portal-login:ip:${ip}`,
        p_max_requests: 20,
        p_window_seconds: 900,
      }),
    ]);
    if (emailLimit.data === false || ipLimit.data === false) {
      return json(429, { error: "too_many_attempts", retry_after_seconds: 900 });
    }
  } catch (_e) {
    // fail open
  }

  const { data, error } = await admin.rpc("authenticate_portal_customer", {
    p_email: email,
    p_password: password,
  });
  if (error) return json(500, { error: "auth_error" });
  // NULL = wrong password, locked, or unknown account. Do not distinguish (no enumeration).
  if (!data) return json(401, { error: "invalid_credentials" });

  const customer = data as {
    id: string;
    tenant_id: string;
    email: string | null;
    customer_name: string;
    customer_number: string;
    mobile_number: string | null;
    profile_photo_url: string | null;
  };

  const ttl = Number(Deno.env.get("PORTAL_JWT_TTL_SECONDS") ?? "28800"); // 8h
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    role: "portal",
    portal_token: crypto.randomUUID(),
    customer_id: customer.id,
    tenant_id: customer.tenant_id,
    email: customer.email ?? undefined,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(customer.id)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(new TextEncoder().encode(jwtSecret));

  return json(200, {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttl,
    customer,
  });
});
