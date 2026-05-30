import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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

function rateLimitResponse(corsHeaders: Record<string, string>, retryAfter: number) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}

function makeCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };
}

interface ProvisionTenantRequest {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  planId: string;
  countryId: string;
  base_currency_code?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = makeCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ip = getClientIP(req);
    const authHeader = req.headers.get('Authorization');

    if (authHeader) {
      // Admin-provisioned flow: validate platform admin
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rateLimitKey = `provision-tenant:${ip}:${user.id}`;
      const allowed = await checkRateLimit(supabase, rateLimitKey, 1, 60);
      if (!allowed) {
        return rateLimitResponse(corsHeaders, 60);
      }
    } else {
      // Self-service signup flow: stricter rate limiting by IP only
      const rateLimitKey = `provision-tenant-signup:${ip}`;
      const allowed = await checkRateLimit(supabase, rateLimitKey, 3, 3600);
      if (!allowed) {
        return rateLimitResponse(corsHeaders, 3600);
      }
    }

    const requestData: ProvisionTenantRequest = await req.json();

    const { name, slug, adminEmail, adminPassword, adminFullName, planId, countryId, base_currency_code } = requestData;

    if (!name || !slug || !adminEmail || !adminPassword || !adminFullName || !planId || !countryId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check for duplicate slug
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingTenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant slug already exists' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === adminEmail.toLowerCase()
    );

    // If user exists, check they don't already own a tenant
    if (existingUser) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', existingUser.id)
        .maybeSingle();

      if (existingProfile?.tenant_id) {
        return new Response(
          JSON.stringify({ error: 'This email is already associated with an active account. Please sign in instead.' }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        plan_id: planId,
        country_id: countryId,
        status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        ...(base_currency_code ? { base_currency_code } : {}),
      })
      .select()
      .single();

    if (tenantError) throw tenantError;

    let userId: string;

    if (existingUser) {
      // Existing user without a tenant — update their password, metadata, and confirm email
      userId = existingUser.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          tenant_id: tenant.id,
          role: 'owner',
        },
      });

      if (updateError) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        throw updateError;
      }
    } else {
      // New user — create auth account
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          tenant_id: tenant.id,
          role: 'owner',
        },
      });

      if (authError || !authData.user) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        throw authError || new Error('User creation failed');
      }
      userId = authData.user.id;
    }

    // Upsert profile with tenant info (profile may not exist for pre-existing users)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: adminEmail,
        tenant_id: tenant.id,
        role: 'owner',
        full_name: adminFullName,
        is_active: true,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile update failed:', profileError);
    }

    // Fetch country details for pre-populating company settings
    const { data: countryData } = await supabase
      .from('geo_countries')
      .select('name, currency_code, currency_symbol, decimal_places, currency_position, decimal_separator, thousands_separator, timezone, date_format, fiscal_year_start, locale_code')
      .eq('id', countryId)
      .maybeSingle();

    // Create company_settings pre-populated with signup data
    const { error: settingsError } = await supabase
      .from('company_settings')
      .insert({
        tenant_id: tenant.id,
        company_name: name,
        company_email: adminEmail,
        default_currency: countryData?.currency_code || null,
        time_zone: countryData?.timezone || null,
        date_format: countryData?.date_format || null,
        fiscal_year_start: countryData?.fiscal_year_start
          ? parseInt(countryData.fiscal_year_start)
          : null,
        basic_info: {
          company_name: name,
          industry: 'Data Recovery & IT Services',
        },
        contact_info: {
          email_general: adminEmail,
        },
        location: {
          default_country_id: countryId,
          country: countryData?.name || null,
        },
      });

    if (settingsError) {
      console.error('Company settings creation failed:', settingsError);
    }

    // Create default accounting locale pre-populated from country config
    const { error: localeError } = await supabase
      .from('accounting_locales')
      .insert({
        tenant_id: tenant.id,
        name: `${countryData?.name || name} - Default`,
        locale_code: countryData?.locale_code || 'en-US',
        currency_code: countryData?.currency_code || 'USD',
        currency_symbol: countryData?.currency_symbol || '$',
        decimal_places: countryData?.decimal_places ?? 2,
        currency_position: countryData?.currency_position || 'before',
        decimal_separator: countryData?.decimal_separator || '.',
        thousands_separator: countryData?.thousands_separator || ',',
        date_format: countryData?.date_format || 'DD/MM/YYYY',
        is_default: true,
      });

    if (localeError) {
      console.error('Default accounting locale creation failed:', localeError);
    }

    // Create onboarding progress
    const { error: onboardingError } = await supabase
      .from('onboarding_progress')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        steps_completed: [],
        current_step: 'company_info',
      });

    if (onboardingError) {
      console.error('Onboarding progress creation failed:', onboardingError);
      // Non-critical, don't fail the whole flow
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        user_id: userId,
        message: 'Tenant provisioned successfully',
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Tenant provisioning error:', error);
    const message = error instanceof Error ? error.message : 'An internal error occurred';
    return new Response(
      JSON.stringify({
        error: message.includes('already') || message.includes('exists')
          ? message
          : 'An internal error occurred. Please try again later.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
