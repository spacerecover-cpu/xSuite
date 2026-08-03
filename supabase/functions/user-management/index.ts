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

// Look up an existing auth user by email across ALL pages. auth.admin.listUsers()
// returns only one page at GoTrue's server-capped perPage, so an orphaned account
// past the first page was invisible — silently breaking orphan-recovery and pushing
// the flow onto createUser where the duplicate email throws a 500. We page until the
// email is found or the list is exhausted, using GoTrue's own nextPage signal so a
// server-capped perPage cannot cause an early exit that misses users.
async function findAuthUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<{ id: string; email?: string } | undefined> {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = (data?.users ?? []) as Array<{ id: string; email?: string }>;
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    const nextPage = (data as { nextPage?: number | null } | null)?.nextPage;
    if (!nextPage && users.length < perPage) return undefined;
  }
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
      .select("role, tenant_id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    // A deactivated admin keeps a valid JWT until it expires — authorize on
    // is_active as well as role so revocation takes effect immediately.
    if (!callerProfile || callerProfile.is_active !== true || !["owner", "admin"].includes(callerProfile.role)) {
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

      // Scope the existing-profile lookup to the caller's own tenant. An unscoped
      // match let a tenant admin recover an email belonging to another tenant and
      // overwrite that foreign profile's role/is_active below.
      const { data: emailProfiles, error: emailLookupError } = await supabaseClient
        .from("profiles")
        .select("id, role, tenant_id")
        .eq("email", body.email);

      if (emailLookupError) {
        throw new Error(`Failed to look up existing profile: ${emailLookupError.message}`);
      }

      type ProfileMatch = { id: string; role: string | null; tenant_id: string | null };
      const profilesForEmail = (emailProfiles ?? []) as ProfileMatch[];
      // A platform admin has tenant_id NULL and legitimately administers every
      // tenant; matching on equality would pair them only with other NULL-tenant
      // profiles and 409 every real-tenant email.
      const isPlatformAdmin = callerProfile.tenant_id === null;
      const existingProfile = isPlatformAdmin
        ? profilesForEmail[0]
        : profilesForEmail.find((p) => p.tenant_id === callerProfile.tenant_id);

      if (existingProfile?.role) {
        throw new Error("A user with this email already exists");
      }

      if (!existingProfile && profilesForEmail.length > 0) {
        return new Response(
          JSON.stringify({ error: "This email is already registered to another tenant" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const existingAuthUser = await findAuthUserByEmail(supabaseClient, body.email);

      if (existingAuthUser) {
        // The auth lookup is global; re-verify by id that the profile we are about
        // to overwrite is inside the caller's tenant (the auth account's email may
        // differ from the profile row's email).
        const { data: authUserProfile, error: authProfileError } = await supabaseClient
          .from("profiles")
          .select("tenant_id")
          .eq("id", existingAuthUser.id)
          .maybeSingle();

        // Fail CLOSED: swallowing this error would leave authUserProfile null,
        // skip the tenant guard below, and let the cross-tenant UPDATE proceed —
        // degrading the security check into a no-op exactly when it matters.
        if (authProfileError) {
          throw new Error(`Failed to verify existing account tenant: ${authProfileError.message}`);
        }

        if (authUserProfile && !isPlatformAdmin && authUserProfile.tenant_id !== callerProfile.tenant_id) {
          return new Response(
            JSON.stringify({ error: "This email is already registered to another tenant" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[CREATE USER] Orphaned auth user found, updating profile for ${body.email}`);
        // Bind the recovered account to the caller's tenant. A true orphan has
        // tenant_id NULL, and an update that left it NULL produced a "created"
        // user that can never log in (get_current_tenant_id() resolves nothing).
        // A platform admin has no tenant of their own, so keep whatever tenant
        // the account is already bound to rather than detaching it.
        const boundTenantId = callerProfile.tenant_id ?? authUserProfile?.tenant_id ?? null;
        // upsert, not update: an auth user with NO profile row at all made
        // .update().eq(id) match zero rows and return no error, so the function
        // reported success while no usable account existed.
        const { error: upsertError } = await supabaseClient
          .from("profiles")
          .upsert(
            {
              id: existingAuthUser.id,
              email: body.email,
              tenant_id: boundTenantId,
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
          throw new Error(`Failed to update profile: ${upsertError.message}`);
        }

        try {
          // log_audit_trail's parameters are p_record_type/p_record_id/p_action —
          // p_action_type/p_table_name never existed, so every call errored out.
          // It also has a 6-arg and an 8-arg overload sharing the same first six
          // params, so anything short of the full 8-arg named form raises 42725
          // "function is not unique". And it stamps tenant_id/performed_by from
          // get_current_tenant_id()/auth.uid(), which resolve to NULL under the
          // service-role client — so the call must go through userClient (the
          // caller's JWT) to land a tenant-scoped, actor-stamped audit row.
          const { error: auditError } = await userClient.rpc("log_audit_trail", {
            p_record_type: "profiles",
            p_record_id: existingAuthUser.id,
            p_action: "create",
            p_old_values: {},
            p_new_values: { full_name: body.full_name, role: body.role, email: body.email },
            p_changed_fields: null,
            p_ip_address: null,
            p_user_agent: null,
          });
          if (auditError) {
            console.error(
              `[CREATE USER] Audit trail write failed for profile ${existingAuthUser.id} (${body.email}):`,
              auditError.message
            );
          }
        } catch (auditException) {
          console.error(
            `[CREATE USER] Audit trail write threw for profile ${existingAuthUser.id} (${body.email}):`,
            auditException
          );
        }

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
            // Mirror the createUser metadata: if the trigger never ran, the insert
            // branch of this fallback would otherwise leave the owner tenant-less.
            tenant_id: callerProfile.tenant_id,
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
        // 8-arg named form via userClient — see the orphan-path call above.
        const { error: auditError } = await userClient.rpc("log_audit_trail", {
          p_record_type: "profiles",
          p_record_id: authData.user.id,
          p_action: "create",
          p_old_values: {},
          p_new_values: { full_name: body.full_name, role: body.role, email: body.email },
          p_changed_fields: null,
          p_ip_address: null,
          p_user_agent: null,
        });
        if (auditError) {
          console.error(
            `[CREATE USER] Audit trail write failed for profile ${authData.user.id} (${body.email}):`,
            auditError.message
          );
        }
      } catch (auditException) {
        console.error(
          `[CREATE USER] Audit trail write threw for profile ${authData.user.id} (${body.email}):`,
          auditException
        );
      }

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
        // 8-arg named form via userClient — see the create-user call above.
        const { error: auditError } = await userClient.rpc("log_audit_trail", {
          p_record_type: "profiles",
          p_record_id: body.userId,
          p_action: "update",
          p_old_values: {},
          p_new_values: { password_reset_initiated: true },
          p_changed_fields: null,
          p_ip_address: null,
          p_user_agent: null,
        });
        if (auditError) {
          console.error(
            `[RESET PASSWORD] Audit trail write failed for profile ${body.userId}:`,
            auditError.message
          );
        }
      } catch (auditException) {
        console.error(
          `[RESET PASSWORD] Audit trail write threw for profile ${body.userId}:`,
          auditException
        );
      }

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
