import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type TenantInsert = Database['public']['Tables']['tenants']['Insert'];
type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];

interface CreateTenantParams {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  planId: string;
  countryId: string;
  baseCurrencyCode: string;
  /** ui_language override — omit to let the DB country-sync trigger default it (§9.2). */
  uiLanguage?: string;
  /** Jurisdiction payload → primary legal_entity (only when the country has a tax system). */
  legalEntityType?: string;
  taxNumber?: string;
  fiscalYearStart?: string;
  timezone?: string;
}

interface TenantWithPlan extends Tenant {
  plan?: SubscriptionPlan;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const tenantService = {
  async sendOtp(email: string, companyName?: string): Promise<void> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'send', email, company_name: companyName }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send verification code');
    }
  },

  async verifyOtp(email: string, otpCode: string): Promise<boolean> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'verify', email, otp_code: otpCode }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }
    return data.verified === true;
  },

  async listPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order');

    if (error) throw error;
    return data || [];
  },

  async createTenant(params: CreateTenantParams): Promise<{ tenant_id: string; user_id: string }> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/provision-tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        name: params.name,
        slug: params.slug,
        adminEmail: params.adminEmail,
        adminPassword: params.adminPassword,
        adminFullName: params.adminFullName,
        planId: params.planId,
        countryId: params.countryId,
        base_currency_code: params.baseCurrencyCode,
        ...(params.uiLanguage ? { ui_language: params.uiLanguage } : {}),
        ...(params.legalEntityType ? { legal_entity_type: params.legalEntityType } : {}),
        ...(params.taxNumber ? { tax_number: params.taxNumber } : {}),
        ...(params.fiscalYearStart ? { fiscal_year_start: params.fiscalYearStart } : {}),
        ...(params.timezone ? { timezone: params.timezone } : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create account');
    }
    return { tenant_id: data.tenant_id, user_id: data.user_id };
  },

  async getTenant(tenantId: string): Promise<TenantWithPlan | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data as TenantWithPlan | null;
  },

  async getCurrentTenant(): Promise<TenantWithPlan | null> {
    const { data: tenantId } = await supabase.rpc('get_current_tenant_id');
    if (!tenantId) return null;
    return this.getTenant(tenantId);
  },

  async updateTenant(tenantId: string, updates: Partial<TenantInsert>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to update tenant');
    return data;
  },

  async suspendTenant(tenantId: string): Promise<void> {
    await this.updateTenant(tenantId, { status: 'suspended' });
  },

  async reactivateTenant(tenantId: string): Promise<void> {
    await this.updateTenant(tenantId, { status: 'active' });
  },

  async cancelTenant(tenantId: string): Promise<void> {
    await this.updateTenant(tenantId, { status: 'cancelled' });
  },

  async listAllTenants(): Promise<TenantWithPlan[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as TenantWithPlan[];
  },

  async getTenantStats(tenantId: string) {
    const [casesCount, customersCount, usersCount] = await Promise.all([
      supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      supabase
        .from('customers_enhanced')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ]);

    return {
      cases: casesCount.count || 0,
      customers: customersCount.count || 0,
      users: usersCount.count || 0,
    };
  },
};
