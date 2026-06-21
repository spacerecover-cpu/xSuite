import { motion } from 'framer-motion';
import { Building2, Receipt } from 'lucide-react';
import type { OnboardingFormData } from '../constants';
import type { OnboardableCountry } from '../../../../lib/geoCountryService';
import { validateTaxNumber } from '../onboardingValidation';

interface JurisdictionStepProps {
  formData: OnboardingFormData;
  country: OnboardableCountry;
  updateField: <K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) => void;
}

const LEGAL_ENTITY_TYPES = [
  { value: 'sole_proprietor', label: 'Sole Proprietorship' },
  { value: 'llc', label: 'Limited Liability Company (LLC)' },
  { value: 'company', label: 'Company / Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'branch', label: 'Branch of a Foreign Company' },
];

const inputClasses = (hasError: boolean) =>
  `w-full bg-slate-800/50 border ${hasError ? 'border-danger/60' : 'border-slate-700'} rounded-xl px-4 py-3 text-white placeholder-slate-600 font-body text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all appearance-none`;

/**
 * Jurisdiction capture, rendered only when the selected country has a real tax
 * system. Captures legal-entity type, tax/VAT registration (soft-validated
 * against the country's tax_number_format), and confirms the fiscal-year start.
 * Persists into formData → provision-tenant → primary legal_entity.
 */
export const JurisdictionStep = ({ formData, country, updateField }: JurisdictionStepProps) => {
  const taxLabel = country.tax_number_label || `${country.tax_label || 'Tax'} Registration Number`;
  const taxCheck =
    formData.taxNumber.trim().length > 0
      ? validateTaxNumber(country.tax_number_format, formData.taxNumber)
      : { ok: true };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <p className="text-xs text-slate-400 font-body uppercase tracking-wider font-medium">
            Tax & legal identity ({country.tax_label || country.tax_system})
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 font-body mb-2">
            Legal entity type <span className="text-primary">*</span>
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <select
              value={formData.legalEntityType}
              onChange={(e) => updateField('legalEntityType', e.target.value)}
              className={`${inputClasses(false)} pl-10`}
            >
              <option value="" className="bg-slate-900">Select entity type…</option>
              {LEGAL_ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 font-body mb-2">
            {taxLabel} <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={formData.taxNumber}
            onChange={(e) => updateField('taxNumber', e.target.value)}
            placeholder={country.tax_number_label || 'e.g. 300000000000003'}
            className={inputClasses(!taxCheck.ok)}
          />
          {!taxCheck.ok && (
            <p className="text-danger text-xs mt-1 font-body">{taxCheck.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 font-body mb-2">
            Fiscal year starts in
          </label>
          <select
            value={formData.fiscalYearStart}
            onChange={(e) => updateField('fiscalYearStart', e.target.value)}
            className={inputClasses(false)}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)} className="bg-slate-900">
                {new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 font-body mt-1">
            Defaulted from {country.name}. You can change this later in Settings.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
