import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Languages } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { supabase } from '../../../../lib/supabaseClient';
import type { OnboardableCountry } from '../../../../lib/geoCountryService';
import { resolveUiLanguageDefault, shouldShowJurisdictionStep, validateTaxNumber } from '../onboardingValidation';
import { JurisdictionStep } from './JurisdictionStep';
import type { OnboardingFormData } from '../constants';

type GeoCountry = OnboardableCountry;

const LANGUAGE_OPTIONS: { value: 'en' | 'ar'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

interface LocationStepProps {
  formData: OnboardingFormData;
  errors: Record<string, string>;
  countries: GeoCountry[];
  updateField: <K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const LocationStep = ({
  formData,
  errors,
  countries,
  updateField,
  onNext,
  onBack,
}: LocationStepProps) => {
  const selectedCountry = countries.find(c => c.id === formData.countryId);

  const [currencyCodes, setCurrencyCodes] = useState<{ code: string; name: string | null }[]>([]);

  useEffect(() => {
    supabase
      .from('master_currency_codes')
      .select('code, name')
      .eq('is_active', true)
      .order('code')
      .then(
        ({ data }) => setCurrencyCodes(data ?? []),
        () => setCurrencyCodes([]),
      );
  }, []);

  const handleCountryChange = (id: string) => {
    const c = countries.find((x) => x.id === id);
    updateField('countryId', id);
    // No 'USD' fabrication (fail-loud, D2): the country list is currency-filtered,
    // so a selected country always carries a real currency.
    updateField('baseCurrencyCode', c?.currency_code ?? '');
    // Country-driven defaults for the language + jurisdiction fields.
    updateField('uiLanguage', resolveUiLanguageDefault(c?.language_code));
    updateField('fiscalYearStart', c?.fiscal_year_start ?? '');
    updateField('timezone', c?.timezone ?? '');
  };

  const activeLanguage = formData.uiLanguage || resolveUiLanguageDefault(selectedCountry?.language_code);

  // When the jurisdiction block is shown, require entity type + a tax number that
  // passes the country's format (soft if no reference format). Otherwise always complete.
  const showJurisdiction = !!selectedCountry && shouldShowJurisdictionStep(selectedCountry.tax_system);
  const jurisdictionComplete =
    !showJurisdiction ||
    (formData.legalEntityType.trim().length > 0 &&
      validateTaxNumber(selectedCountry?.tax_number_format ?? null, formData.taxNumber).ok);

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Country <span className="text-primary">*</span>
        </label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select
            value={formData.countryId}
            onChange={e => handleCountryChange(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white font-body text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
          >
            <option value="" className="bg-slate-900">Select your country...</option>
            {countries.map(c => (
              <option key={c.id} value={c.id} className="bg-slate-900">
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        {errors.countryId && (
          <p className="text-danger text-xs mt-1 font-body">{errors.countryId}</p>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedCountry && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 space-y-3">
              <p className="text-xs text-slate-500 font-body uppercase tracking-wider font-medium">
                Auto-configured for your region
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 font-body">Currency</p>
                  <p className="text-sm text-white font-body font-medium">
                    {selectedCountry.currency_symbol || '—'} {selectedCountry.currency_code || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-body">Tax System</p>
                  <p className="text-sm text-white font-body font-medium">
                    {selectedCountry.tax_label || 'None'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 font-body">
                Currency, tax labels, and date formats will be automatically configured. You can change these later in Settings.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCountry && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <label className="block text-sm font-medium text-slate-300 font-body mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Languages className="w-4 h-4 text-slate-500" /> Interface language
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Interface language">
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = activeLanguage === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateField('uiLanguage', opt.value)}
                    className={`py-3 rounded-xl border font-body text-sm transition-all ${
                      active
                        ? 'border-primary bg-primary/15 text-white'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 font-body mt-1">
              Defaulted from {selectedCountry.name}. You can change this anytime.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCountry && showJurisdiction && (
          <JurisdictionStep
            formData={formData}
            country={selectedCountry}
            updateField={updateField}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Base (reporting) currency <span className="text-primary">*</span>
        </label>
        <select
          value={formData.baseCurrencyCode}
          onChange={(e) => updateField('baseCurrencyCode', e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white font-body text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none"
        >
          {formData.baseCurrencyCode === '' && (
            <option value="" className="bg-slate-900">Select a country first...</option>
          )}
          {currencyCodes.map((cc) => (
            <option key={cc.code} value={cc.code} className="bg-slate-900">
              {cc.code}{cc.name ? ` — ${cc.name}` : ''}
            </option>
          ))}
        </select>
        {errors.baseCurrencyCode && (
          <p className="text-danger text-xs mt-1 font-body">{errors.baseCurrencyCode}</p>
        )}
        <p className="text-xs text-slate-500 font-body mt-1">
          Locked once you have financial documents.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex gap-3 pt-2"
      >
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 font-body text-sm hover:border-slate-600 hover:text-slate-300 transition-all"
        >
          Back
        </button>
        <Button
          onClick={onNext}
          disabled={!formData.countryId || !jurisdictionComplete}
          className="flex-1 !bg-primary hover:!bg-primary/90 !text-primary-foreground !rounded-xl !py-3 !font-body disabled:!opacity-40"
        >
          Continue
        </Button>
      </motion.div>
    </div>
  );
};
