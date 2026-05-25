import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useDocumentTranslations } from './useDocumentTranslations';
import { logger } from '../lib/logger';

interface CompanySettings {
  basic_info?: {
    company_name?: string;
    legal_name?: string;
    registration_number?: string;
    vat_number?: string;
  };
  location?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    building_name?: string;
    unit_number?: string;
  };
  contact_info?: {
    phone_primary?: string;
    email_general?: string;
  };
  branding?: {
    logo_url?: string;
    brand_tagline?: string;
    qr_code_quote_url?: string;
    qr_code_quote_caption?: string;
    qr_code_invoice_url?: string;
    qr_code_invoice_caption?: string;
  };
  online_presence?: {
    website?: string;
  };
  banking_info?: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    iban?: string;
  };
}

const SETTINGS_TIMEOUT = 5000;

export function usePDFDownload() {
  const { t, isLoading: isLoadingTranslations, isReady: translationsReady, hasError: translationsError, errorMessage: translationsErrorMessage } = useDocumentTranslations();

  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const fetchCompanySettings = async () => {
      try {
        setIsLoadingSettings(true);
        setSettingsReady(false);
        setSettingsError(false);
        setResourceError(null);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Company settings loading timeout'));
          }, SETTINGS_TIMEOUT);
        });

        const fetchPromise = supabase
          .from('company_settings')
          .select('basic_info, location, contact_info, branding, online_presence, banking_info')
          .single();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
          logger.error('Error fetching company settings:', error);
          setSettingsError(true);
          setResourceError('Failed to load company settings');
          setSettingsReady(false);
        } else {
          setCompanySettings((data as unknown as CompanySettings) || null);
          setSettingsReady(true);
          setSettingsError(false);
        }
      } catch (error) {
        logger.error('Error in fetchCompanySettings:', error);
        setSettingsError(true);
        setResourceError(error instanceof Error ? error.message : 'Unknown error loading settings');
        setSettingsReady(false);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchCompanySettings();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return {
    companySettings,
    isLoadingSettings,
    settingsReady,
    settingsError,
    resourceError,
    translationsReady,
    translationsError,
    translationsErrorMessage,
    isLoadingTranslations,
    t,
  };
}
