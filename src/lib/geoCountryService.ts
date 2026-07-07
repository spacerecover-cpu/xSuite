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

export interface CountrySubdivision {
  id: string;
  code: string;
  name: string;
  subdivision_type: string | null;
  tax_authority_code: string | null;
}

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

  /**
   * Tax subdivisions for a country (India states/UTs with GST codes; US states
   * in Phase 5). Empty array = no subdivision dimension; callers hide the picker.
   */
  async listCountrySubdivisions(countryId: string): Promise<CountrySubdivision[]> {
    const { data, error } = await supabase
      .from('geo_subdivisions')
      .select('id, code, name, subdivision_type, tax_authority_code')
      .eq('country_id', countryId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []) as CountrySubdivision[];
  },
};
