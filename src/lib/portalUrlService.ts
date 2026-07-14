import { supabase } from './supabaseClient';
import { logger } from './logger';

interface PortalSettings {
  portal_enabled: boolean;
  portal_base_url: string;
  portal_link_format: string;
  portal_session_timeout: number;
  portal_require_email_verification: boolean;
  portal_allow_self_registration: boolean;
  portal_maintenance_mode: boolean;
  portal_support_email?: string;
  portal_support_phone?: string;
  portal_terms_url?: string;
  portal_privacy_url?: string;
  portal_custom_logo_url?: string;
  portal_maintenance_message?: string;
}

let cachedPortalSettings: PortalSettings | null = null;
let cachedTenantId: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000;

function getActiveTenantId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('tenant_id');
}

export async function getPortalSettings(): Promise<PortalSettings | null> {
  const now = Date.now();
  const tenantId = getActiveTenantId();

  if (
    cachedPortalSettings &&
    cachedTenantId === tenantId &&
    (now - cacheTimestamp) < CACHE_DURATION
  ) {
    return cachedPortalSettings;
  }

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('portal_settings')
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching portal settings:', error);
      return null;
    }

    if (data?.portal_settings && Object.keys(data.portal_settings as object).length > 0) {
      cachedPortalSettings = data.portal_settings as unknown as PortalSettings;
      cachedTenantId = tenantId;
      cacheTimestamp = now;
      return cachedPortalSettings;
    }

    return null;
  } catch (error) {
    logger.error('Error in getPortalSettings:', error);
    return null;
  }
}

export function clearPortalSettingsCache(): void {
  cachedPortalSettings = null;
  cachedTenantId = null;
  cacheTimestamp = 0;
}

export async function getPortalBaseUrl(): Promise<string> {
  const settings = await getPortalSettings();

  if (settings?.portal_base_url && settings.portal_base_url.trim() !== '') {
    return settings.portal_base_url.trim();
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export async function generatePortalLoginUrl(): Promise<string> {
  const baseUrl = await getPortalBaseUrl();
  const settings = await getPortalSettings();
  const linkFormat = settings?.portal_link_format || '/portal/login';

  const url = `${baseUrl}${linkFormat}`;
  return url;
}

export async function generateCustomerPortalCredentialsText(
  email: string,
  password: string
): Promise<string> {
  const portalUrl = await generatePortalLoginUrl();

  return `Email: ${email}\nPassword: ${password}\nPortal Link: ${portalUrl}`;
}

export function getPortalUrl(caseNumber: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/portal/cases?case=${encodeURIComponent(caseNumber)}`;
  }
  return `/portal/cases?case=${encodeURIComponent(caseNumber)}`;
}

export async function isPortalEnabled(): Promise<boolean> {
  const settings = await getPortalSettings();
  return settings?.portal_enabled ?? true;
}

export async function isPortalInMaintenanceMode(): Promise<boolean> {
  const settings = await getPortalSettings();
  return settings?.portal_maintenance_mode ?? false;
}

export function validatePortalUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: true };
  }

  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }

    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      return { valid: false, error: 'Localhost URLs are not recommended for production' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function updatePortalSettings(
  settings: Partial<PortalSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: currentData, error: fetchError } = await supabase
      .from('company_settings')
      .select('portal_settings')
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const updatedSettings = {
      ...((currentData?.portal_settings as object | null) || {}),
      ...settings,
    };

    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ portal_settings: updatedSettings })
      .not('id', 'is', null);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    clearPortalSettingsCache();

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}
