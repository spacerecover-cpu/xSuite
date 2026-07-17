// Version: 2.1.0 - Clean architecture: profile data via raw_user_meta_data, trigger handles creation
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://xsuite.space',
  'https://space-recovery.pages.dev',
  ...(Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') || '').split(',').map(o => o.trim()).filter(Boolean),
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
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

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: "owner" | "admin" | "technician" | "sales" | "accounts" | "hr";
  phone: string;
  is_active: boolean;
  case_access_level?: "restricted" | "full";
}

interface ResetPasswordRequest {
  userId: string;
  email: string;
  newPassword: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = makeCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
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

    const { data: callerProfile } = await supabaseClient
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

    // Rate limit: 3 requests per 60 seconds per IP
    const ip = getClientIP(req);
    const rateLimitKey = `user-mgmt:${ip}`;
    const allowed = await checkRateLimit(supabaseClient, rateLimitKey, 3, 60);
    if (!allowed) {
      return rateLimitResponse(corsHeaders, 60);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── CREATE USER ───────────────────────────────────────────────────────────
    if (action === "create-user" && req.method === "POST") {
      const body: CreateUserRequest = await req.json();
      console.log(`[CREATE USER] ${body.email}`);

      const { data: existingProfile } = await supabaseClient
        .from("profiles")
        .select("id, email, role")
        .eq("email", body.email)
        .maybeSingle();

      if (existingProfile?.role) {
        throw new Error("A user with this email already exists");
      }

      const { data: existingAuthUsers } = await supabaseClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      const allUsers = existingAuthUsers?.users || [];
      const existingAuthUser = allUsers.find(
        (u) => u.email?.toLowerCase() === body.email.toLowerCase()
      );

      if (existingAuthUser) {
        console.log(`[CREATE USER] Orphaned auth user found, updating profile for ${body.email}`);
        const { error: updateError } = await supabaseClient
          .from("profiles")
          .update({
            full_name: body.full_name,
            role: body.role,
            phone: body.phone || null,
            is_active: body.is_active,
            case_access_level: body.case_access_level || "restricted",
            password_reset_required: false,
          })
          .eq("id", existingAuthUser.id);

        if (updateError) {
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }

        try {
          await supabaseClient.rpc("log_audit_trail", {
            p_action_type: "create",
            p_table_name: "profiles",
            p_record_id: existingAuthUser.id,
            p_old_values: {},
            p_new_values: { full_name: body.full_name, role: body.role, email: body.email },
          });
        } catch (_) {}

        return new Response(
          JSON.stringify({ success: true, user: existingAuthUser }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create new auth user — pass all profile fields via user_metadata so the
      // handle_new_user trigger creates the profile correctly in one atomic step.
      const { data: authData, error: createError } = await supabaseClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: body.full_name,
          role: body.role,
          phone: body.phone || null,
          is_active: body.is_active,
          case_access_level: body.case_access_level || "restricted",
          tenant_id: callerProfile.tenant_id,
          _admin_created: true,
        },
      });

      if (createError) {
        throw new Error(`Failed to create auth user: ${createError.message}`);
      }
      if (!authData.user) {
        throw new Error("Failed to create auth user: no user returned");
      }

      console.log(`[CREATE USER] Auth user created: ${authData.user.id}`);

      // Verify the profile has the role set (trigger may run async in some envs).
      // If the profile is missing or has no role, run a safe upsert as fallback.
      const { data: createdProfile } = await supabaseClient
        .from("profiles")
        .select("id, role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!createdProfile?.role) {
        console.log(`[CREATE USER] Trigger did not set role, running upsert fallback`);
        const { error: upsertError } = await supabaseClient.from("profiles").upsert(
          {
            id: authData.user.id,
            email: body.email,
            full_name: body.full_name,
            role: body.role,
            phone: body.phone || null,
            is_active: body.is_active,
            case_access_level: body.case_access_level || "restricted",
            password_reset_required: false,
          },
          { onConflict: "id" }
        );

        if (upsertError) {
          await supabaseClient.auth.admin.deleteUser(authData.user.id);
          throw new Error(`Failed to create profile: ${upsertError.message}`);
        }
      }

      try {
        await supabaseClient.rpc("log_audit_trail", {
          p_action_type: "create",
          p_table_name: "profiles",
          p_record_id: authData.user.id,
          p_old_values: {},
          p_new_values: { full_name: body.full_name, role: body.role, email: body.email },
        });
      } catch (_) {}

      return new Response(
        JSON.stringify({ success: true, user: authData.user }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── RESET PASSWORD ────────────────────────────────────────────────────────
    if (action === "reset-password" && req.method === "POST") {
      const body: ResetPasswordRequest = await req.json();

      // Tenant-scope the target: look up the target user's profile and require it
      // to belong to the caller's tenant. Platform admins (tenant_id IS NULL with
      // owner/admin role) may reset across tenants; tenant admins may not.
      const { data: targetProfile } = await supabaseClient
        .from("profiles")
        .select("tenant_id")
        .eq("id", body.userId)
        .maybeSingle();

      if (!targetProfile) {
        return new Response(
          JSON.stringify({ error: "Target user not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const callerIsPlatformAdmin = callerProfile.tenant_id === null;
      if (!callerIsPlatformAdmin && targetProfile.tenant_id !== callerProfile.tenant_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: target user is outside your tenant" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: pwError } = await supabaseClient.auth.admin.updateUserById(
        body.userId,
        { password: body.newPassword }
      );
      if (pwError) throw new Error(`Failed to update password: ${pwError.message}`);

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({ password_reset_required: true })
        .eq("id", body.userId);
      if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`);

      try {
        await supabaseClient.rpc("log_audit_trail", {
          p_action_type: "update",
          p_table_name: "profiles",
          p_record_id: body.userId,
          p_old_values: {},
          p_new_values: { password_reset_initiated: true },
        });
      } catch (_) {}

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action or method" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in user-management:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
