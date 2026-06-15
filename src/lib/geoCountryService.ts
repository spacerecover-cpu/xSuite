import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { filterOnboardableCountries } from '../pages/auth/onboarding/onboardingValidation';

type GeoCountryRow = Database['public']['Tables']['geo_countries']['Row'];

/** The projection the onboarding wizard (Location + Jurisdiction steps) reads. */
export type OnboardableCountry = Pick<
  GeoCountryRow,
  | 'id'
  | 'code'
  | 'name'
  | 'currency_code'
  | 'currency_symbol'
  | 'is_active'
  | 'language_code'
  | 'tax_system'
  | 'tax_label'
  | 'tax_number_label'
  | 'tax_number_format'
  | 'fiscal_year_start'
  | 'timezone'
>;

const ONBOARDABLE_COLUMNS =
  'id, code, name, currency_code, currency_symbol, is_active, language_code, tax_system, tax_label, tax_number_label, tax_number_format, fiscal_year_start, timezone';

export const geoCountryService = {
  /**
   * The single source of truth for the onboarding country dropdown. Returns
   * only active, non-deleted, currency-bearing countries (fail-loud: a stub
   * country with no real ISO currency is excluded, never shown with a '$'
   * fallback). Throws on query error rather than silently returning [].
   */
  async listOnboardableCountries(): Promise<OnboardableCountry[]> {
    const { data, error } = await supabase
      .from('geo_countries')
      .select(ONBOARDABLE_COLUMNS)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');

    if (error) throw new Error(error.message);
    return filterOnboardableCountries((data ?? []) as OnboardableCountry[]);
  },
};
