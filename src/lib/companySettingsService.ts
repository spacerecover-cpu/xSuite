import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Json } from '../types/database.types';

export interface CompanySettings {
  id: string;
  /** Generic tenant-scoped UI/config bucket (e.g. table_columns — see tablePrefsService). */
  metadata?: Json | null;
  basic_info: {
    company_name?: string;
    legal_name?: string;
    registration_number?: string;
    tax_id?: string;
    vat_number?: string;
    license_number?: string;
    business_type?: string;
    industry?: string;
  };
  location: {
    building_name?: string;
    unit_number?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    default_country_id?: string;
    google_maps_url?: string;
  };
  contact_info: {
    phone_primary?: string;
    phone_secondary?: string;
    phone_support?: string;
    phone_sales?: string;
    fax?: string;
    whatsapp_business?: string;
    email_general?: string;
    email_support?: string;
    email_sales?: string;
    email_technical?: string;
  };
  branding: {
    logo_url?: string;
    logo_light_url?: string;
    favicon_url?: string;
    logo_file_path?: string;
    logo_light_file_path?: string;
    favicon_file_path?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    brand_tagline?: string;
    qr_code_invoice_url?: string;
    qr_code_invoice_caption?: string;
    qr_code_quote_url?: string;
    qr_code_quote_caption?: string;
    qr_code_label_url?: string;
    qr_code_label_caption?: string;
    qr_code_general_url?: string;
    qr_code_general_caption?: string;
  };
  online_presence: {
    website?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
  };
  legal_compliance: {
    privacy_policy_url?: string;
    terms_conditions_url?: string;
    data_protection_policy_url?: string;
    refund_policy_url?: string;
    sla_document_url?: string;
  };
  banking_info: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    iban?: string;
    swift_code?: string;
  };
  localization?: {
    document_language_settings?: {
      mode: 'english_only' | 'bilingual';
      secondary_language: string | null;
      language_name: string | null;
    };
  };
  clone_defaults?: {
    default_retention_days?: number;
    min_retention_days?: number;
    max_retention_days?: number;
  };
}

const DEFAULT_COMPANY_SETTINGS: Omit<CompanySettings, 'id'> = {
  basic_info: {
    company_name: 'Your Company Name',
    legal_name: '',
    registration_number: '',
    tax_id: '',
    vat_number: '',
    license_number: '',
    business_type: '',
    industry: 'Technology Services',
  },
  location: {
    building_name: '',
    unit_number: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    default_country_id: '',
    google_maps_url: '',
  },
  contact_info: {
    phone_primary: '',
    phone_secondary: '',
    phone_support: '',
    phone_sales: '',
    fax: '',
    whatsapp_business: '',
    email_general: '',
    email_support: '',
    email_sales: '',
    email_technical: '',
  },
  branding: {
    logo_url: '',
    logo_light_url: '',
    favicon_url: '',
    primary_color: '#0ea5e9',
    secondary_color: '#10b981',
    accent_color: '#f59e0b',
    brand_tagline: '',
    qr_code_invoice_url: '',
    qr_code_invoice_caption: '',
    qr_code_quote_url: '',
    qr_code_quote_caption: '',
    qr_code_label_url: '',
    qr_code_label_caption: '',
    qr_code_general_url: '',
    qr_code_general_caption: '',
  },
  online_presence: {
    website: '',
    facebook: '',
    twitter: '',
    linkedin: '',
    instagram: '',
    youtube: '',
  },
  legal_compliance: {
    privacy_policy_url: '',
    terms_conditions_url: '',
    data_protection_policy_url: '',
    refund_policy_url: '',
    sla_document_url: '',
  },
  banking_info: {
    bank_name: '',
    account_name: '',
    account_number: '',
    iban: '',
    swift_code: '',
  },
  localization: {
    document_language_settings: {
      mode: 'english_only',
      secondary_language: null,
      language_name: null,
    },
  },
  clone_defaults: {
    default_retention_days: 180,
    min_retention_days: 1,
    max_retention_days: 3650,
  },
};

let cachedSettings: CompanySettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000;

export async function getOrCreateCompanySettings(): Promise<CompanySettings> {
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching company settings:', error);
      return { id: '', ...DEFAULT_COMPANY_SETTINGS };
    }

    if (data) {
      cachedSettings = data as CompanySettings;
      cacheTimestamp = now;
      return cachedSettings;
    }

    const { data: newData, error: insertError } = await supabase
      .from('company_settings')
      .insert(DEFAULT_COMPANY_SETTINGS as any)
      .select()
      .maybeSingle();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existingData } = await supabase
          .from('company_settings')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (existingData) {
          cachedSettings = existingData as CompanySettings;
          cacheTimestamp = now;
          return cachedSettings;
        }
      }
      logger.error('Error creating company settings:', insertError);
      return { id: '', ...DEFAULT_COMPANY_SETTINGS };
    }

    cachedSettings = newData as CompanySettings;
    cacheTimestamp = now;
    return cachedSettings;
  } catch (err) {
    logger.error('Unexpected error in getOrCreateCompanySettings:', err);
    return { id: '', ...DEFAULT_COMPANY_SETTINGS };
  }
}

export function invalidateCompanySettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}

export async function updateCompanySettings(updates: Partial<CompanySettings>): Promise<CompanySettings> {
  try {
    // Ensure we have a valid session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      logger.error('Session error:', sessionError);
      throw new Error('Authentication session error. Please log in again.');
    }

    if (!session) {
      throw new Error('You are not authenticated. Please log in again.');
    }

    // Verify user has admin role
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active, full_name')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('Profile fetch error:', profileError);
      throw new Error('Failed to verify user permissions');
    }

    if (!userProfile) {
      throw new Error('User profile not found. Please contact your administrator.');
    }

    if (!['owner', 'admin'].includes(userProfile.role)) {
      throw new Error(`You do not have permission to update settings. Owner or admin role required. Current role: ${userProfile.role || 'none'}`);
    }

    if (!userProfile.is_active) {
      throw new Error('Your account is inactive. Please contact your administrator.');
    }

    // Perform the update
    const { data, error } = await supabase
      .from('company_settings')
      .update(updates)
      .not('id', 'is', null)
      .select();

    if (error) {
      logger.error('Update error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Check if update actually affected any rows
    if (!data || data.length === 0) {
      logger.error('Update returned empty array - RLS policy blocked the update');
      throw new Error('Failed to save: Permission denied or record not found. Please refresh the page and try again.');
    }

    // Invalidate cache so next fetch gets fresh data
    invalidateCompanySettingsCache();

    return data[0] as CompanySettings;
  } catch (error) {
    logger.error('Error in updateCompanySettings:', error);
    throw error;
  }
}

export function getDefaultCompanySettings(): CompanySettings {
  return { id: '', ...DEFAULT_COMPANY_SETTINGS };
}
