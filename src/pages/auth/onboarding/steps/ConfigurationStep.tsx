import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { ServiceSelector } from '../components/ServiceSelector';
import { CASE_VOLUME_OPTIONS } from '../constants';
import type { OnboardingFormData } from '../constants';
import type { Database } from '../../../../types/database.types';

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];

interface ConfigurationStepProps {
  formData: OnboardingFormData;
  errors: Record<string, string>;
  plans: SubscriptionPlan[];
  plansLoading: boolean;
  submitting: boolean;
  updateField: <K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) => void;
  onBack: () => void;
  onSubmit: () => void;
}

function getRecommendedPlanSlug(estimatedCases: string): string {
  switch (estimatedCases) {
    case '1-10': return 'starter';
    case '11-50': return 'professional';
    case '51-100':
    case '100+': return 'enterprise';
    default: return 'professional';
  }
}

export const ConfigurationStep = ({
  formData,
  errors,
  plans,
  plansLoading,
  submitting,
  updateField,
  onBack,
  onSubmit,
}: ConfigurationStepProps) => {
  const recommendedSlug = getRecommendedPlanSlug(formData.estimatedCases);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Primary Services <span className="text-primary">*</span>
        </label>
        <ServiceSelector
          selected={formData.services}
          onChange={val => updateField('services', val)}
        />
        {errors.services && <p className="text-danger text-xs mt-2">{errors.services}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Estimated Monthly Cases <span className="text-primary">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CASE_VOLUME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateField('estimatedCases', opt.value)}
              className={`py-2.5 px-3 rounded-xl border text-sm transition-all ${
                formData.estimatedCases === opt.value
                  ? 'border-primary/60 bg-primary/10 text-white'
                  : 'border-slate-700/60 bg-slate-800/30 text-slate-400 hover:border-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {errors.estimatedCases && <p className="text-danger text-xs mt-2">{errors.estimatedCases}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Choose Your Plan <span className="text-primary">*</span>
        </label>

        {plansLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-3" />
                <div className="h-6 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-700 rounded w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plans.map(plan => {
              const isSelected = formData.planId === plan.id;
              const isRecommended = plan.slug === recommendedSlug;
              const limits = plan.limits as Record<string, number> || {};

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => updateField('planId', plan.id)}
                  className={`relative text-left p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-slate-700/60 bg-slate-800/30 hover:border-slate-600'
                  }`}
                >
                  {isRecommended && formData.estimatedCases && (
                    <div className="absolute -top-2.5 left-3">
                      <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                        <Sparkles className="w-2.5 h-2.5" /> Recommended
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{plan.name}</p>
                      <p className="text-lg font-bold text-white mt-1">
                        ${plan.price_monthly}
                        <span className="text-xs font-normal text-slate-500">/mo</span>
                      </p>
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate-500">
                      {limits.max_users === -1 ? 'Unlimited' : limits.max_users} users
                    </p>
                    <p className="text-xs text-slate-500">
                      {limits.max_cases === -1 ? 'Unlimited' : limits.max_cases} cases/mo
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {errors.planId && <p className="text-danger text-xs mt-2">{errors.planId}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex gap-3 pt-2"
      >
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm hover:border-slate-600 hover:text-slate-300 transition-all disabled:opacity-40"
        >
          Back
        </button>
        <Button
          onClick={onSubmit}
          disabled={submitting || plansLoading}
          className="flex-1 !bg-primary hover:!bg-primary/90 !text-primary-foreground !rounded-xl !py-3 ! disabled:!opacity-40"
        >
          {submitting ? 'Creating Account...' : 'Create Account'}
        </Button>
      </motion.div>
    </div>
  );
};
