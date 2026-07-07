import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { assertOnboardableCountry, assertResidencySupported, buildPrimaryRegistrationRow, ProvisionGuardError, ResidencyNotAvailableError } from './provisionGuards.ts';

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
  ui_language?: string;
  legal_entity_type?: string;
  tax_number?: string;
  subdivision_id?: string;
  fiscal_year_start?: string;
  timezone?: string;
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

    const {
      name, slug, adminEmail, adminPassword, adminFullName, planId, countryId, base_currency_code,
      ui_language, tax_number, subdivision_id, fiscal_year_start, timezone: requestTimezone, legal_entity_type,
    } = requestData;

    // Self-service signups (no Authorization header) must have an OTP-verified
    // email before we create anything. Admin-provisioned (authed) flows bypass,
    // as before. We re-verify against signup_otps so a client that skipped the
    // wizard OTP gate can't provision, then atomically consume the row so a
    // verified code is SINGLE-USE (consumed_at, migration 20260615200307).
    if (!authHeader) {
      const { data: otpRow } = await supabase
        .from('signup_otps')
        .select('id, verified, expires_at')
        .eq('email', adminEmail.toLowerCase())
        .eq('verified', true)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otpRow) {
        return new Response(
          JSON.stringify({ error: 'Email not verified. Please verify your email with the code we sent before continuing.' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Single-use: claim the row atomically — the `consumed_at IS NULL` guard on
      // the UPDATE means two concurrent provisions can't both pass this gate.
      const { data: claimed } = await supabase
        .from('signup_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', otpRow.id)
        .is('consumed_at', null)
        .select('id')
        .maybeSingle();

      if (!claimed) {
        return new Response(
          JSON.stringify({ error: 'This verification code has already been used. Please request a new code.' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!name || !slug || !adminEmail || !adminPassword || !adminFullName || !planId || !countryId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fail-loud country gate (§9.4): fetch the country and assert it is
    // formatting-ready BEFORE creating any tenant/user. A stub country is
    // rejected with 422 — never silently provisioned with US defaults.
    const { data: countryData } = await supabase
      .from('geo_countries')
      .select('name, currency_code, currency_symbol, decimal_places, currency_position, decimal_separator, thousands_separator, timezone, date_format, fiscal_year_start, locale_code, config_status, language_code, tax_system, tax_number_format, requires_local_residency')
      .eq('id', countryId)
      .maybeSingle();

    try {
      assertOnboardableCountry(countryData);
      assertResidencySupported(countryData);
    } catch (guardErr) {
      if (guardErr instanceof ProvisionGuardError || guardErr instanceof ResidencyNotAvailableError) {
        return new Response(
          JSON.stringify({ error: guardErr.message }),
          { status: guardErr.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw guardErr;
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
        // ui_language only when the wizard overrode the country default; else the
        // sync_tenant_config_from_country trigger sets it (§9.2).
        ...(ui_language ? { ui_language } : {}),
      })
      .select()
      .single();

    if (tenantError) throw tenantError;

    // Assign the immutable, geo-derived, platform-unique tenant code (e.g. OMA0001).
    // Fail-loud with soft-delete rollback (matching legal_entities/onboarding below):
    // a tenant provisioned without its support identifier must not survive.
    const { data: assignedTenantCode, error: tenantCodeError } = await supabase
      .rpc('assign_tenant_code', { p_tenant_id: tenant.id });
    if (tenantCodeError) {
      await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
      throw new Error(`Provisioning failed: assign_tenant_code: ${tenantCodeError.message}`);
    }

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
        // Soft-delete rollback (never hard delete — CLAUDE.md additive/soft rule).
        await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
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
        // Soft-delete rollback (never hard delete — CLAUDE.md additive/soft rule).
        await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
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

    // countryData was fetched + guarded above (fail-loud). It is non-stub here,
    // so all formatting fields resolve — no US fallback is needed or used.

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

    // Create default accounting locale from the (guaranteed non-stub) country
    // config. NO US fallbacks: the required fields resolve because the country
    // passed assertOnboardableCountry; cosmetic fields pass through as-is (null
    // rather than a fabricated '$'/'before'/'.'/',').
    const { error: localeError } = await supabase
      .from('accounting_locales')
      .insert({
        tenant_id: tenant.id,
        name: `${countryData?.name || name} - Default`,
        locale_code: countryData!.locale_code,
        currency_code: countryData!.currency_code,
        currency_symbol: countryData?.currency_symbol ?? null,
        decimal_places: countryData?.decimal_places ?? null,
        currency_position: countryData?.currency_position ?? null,
        decimal_separator: countryData?.decimal_separator ?? null,
        thousands_separator: countryData?.thousands_separator ?? null,
        date_format: countryData!.date_format,
        is_default: true,
      });

    if (localeError) {
      console.error('Default accounting locale creation failed:', localeError);
    }

    // Create the tenant's PRIMARY legal entity from the jurisdiction payload
    // (tax identity decoupled from tenant, §3e/§2A.2). This is what
    // seed_new_tenant() will own once that program-track RPC lands — until then
    // we create it inline so the wizard's jurisdiction capture is honored.
    // currency_code is required + has NO 'USD' default (fail-loud, D2) — it
    // resolves from the guaranteed non-stub country.
    const { data: legalEntity, error: legalEntityError } = await supabase
      .from('legal_entities')
      .insert({
        tenant_id: tenant.id,
        country_id: countryId,
        name,
        currency_code: base_currency_code || countryData!.currency_code,
        tax_system: countryData?.tax_system || 'NONE',
        tax_identifier: (tax_number || '').trim().toUpperCase() || null,
        is_primary: true,
        ...(fiscal_year_start || requestTimezone || legal_entity_type
          ? {
              config: {
                fiscal_year_start: fiscal_year_start ?? null,
                timezone: requestTimezone ?? null,
                entity_type: legal_entity_type ?? null,
              },
            }
          : {}),
      })
      .select('id')
      .single();

    if (legalEntityError) {
      console.error('Primary legal entity creation failed:', legalEntityError);
      // Fail-loud: a tenant without its tax-identity entity must not survive.
      await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
      throw new Error(`Provisioning failed: legal_entities insert: ${legalEntityError.message}`);
    }

    // Primary tax registration (GSTIN / any registered seller). Same fail-loud
    // soft-delete rollback discipline as the legal entity itself.
    //
    // This is the UNAUTHENTICATED self-service path (service-role, RLS bypassed),
    // so the server validates the registration itself rather than trusting the
    // client: a regime-agnostic subdivision→country integrity check plus, for GST
    // regimes, a full GSTIN checksum/state validation (buildPrimaryRegistrationRow
    // throws ProvisionGuardError on any of these).
    let subdivisionBelongsToCountry = true;
    let subdivisionTaxAuthorityCode: string | null = null;
    if (subdivision_id) {
      const { data: subRow } = await supabase
        .from('geo_subdivisions')
        .select('id, tax_authority_code')
        .eq('id', subdivision_id)
        .eq('country_id', countryId)
        .maybeSingle();
      subdivisionBelongsToCountry = !!subRow;
      subdivisionTaxAuthorityCode = (subRow?.tax_authority_code as string | null) ?? null;
    }
    // DATA key, not a country literal: India (and any GST country) reports
    // tax_system === 'GST' on its geo_countries row.
    const isGstRegime = (countryData?.tax_system ?? '').toUpperCase() === 'GST';

    let registrationRow: ReturnType<typeof buildPrimaryRegistrationRow>;
    try {
      registrationRow = buildPrimaryRegistrationRow({
        tenantId: tenant.id,
        legalEntityId: legalEntity!.id,
        countryId,
        taxNumber: tax_number,
        subdivisionId: subdivision_id ?? null,
        isGstRegime,
        subdivisionTaxAuthorityCode,
        subdivisionBelongsToCountry,
        today: new Date().toISOString().slice(0, 10),
      });
    } catch (regErr) {
      // Fail-loud + rollback: never persist a tenant carrying an invalid/garbage
      // statutory registration. Surface the validation message as its 422.
      await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
      if (regErr instanceof ProvisionGuardError) {
        return new Response(
          JSON.stringify({ error: regErr.message }),
          { status: regErr.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw regErr;
    }
    if (registrationRow) {
      const { error: registrationError } = await supabase
        .from('legal_entity_tax_registrations')
        .insert(registrationRow);
      if (registrationError) {
        console.error('Primary tax registration creation failed:', registrationError);
        await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
        throw new Error(`Provisioning failed: legal_entity_tax_registrations insert: ${registrationError.message}`);
      }
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
      // FAIL-LOUD: a half-provisioned tenant must not silently lose its wizard.
      await supabase.from('tenants').update({ deleted_at: new Date().toISOString() }).eq('id', tenant.id);
      throw new Error(`Provisioning failed: onboarding_progress insert: ${onboardingError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        tenant_code: assignedTenantCode,
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
