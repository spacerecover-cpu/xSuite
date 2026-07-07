import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tenantService } from '../../../../lib/tenantService';
import { supabase } from '../../../../lib/supabaseClient';
import { geoCountryService } from '../../../../lib/geoCountryService';
import type { OnboardableCountry } from '../../../../lib/geoCountryService';
import { resolveUiLanguagePayload } from '../onboardingValidation';
import { useToast } from '../../../../hooks/useToast';
import { logger } from '../../../../lib/logger';
import { STEP_SCHEMAS, DEFAULT_FORM_DATA } from '../constants';
import type { OnboardingFormData } from '../constants';
import type { Database } from '../../../../types/database.types';

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];

type GeoCountry = OnboardableCountry;

const STORAGE_KEY = 'xsuite_onboarding';

function loadPersistedData(): { step: number; formData: OnboardingFormData } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistData(step: number, formData: OnboardingFormData) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, formData }));
  } catch {
    // sessionStorage may be unavailable
  }
}

export function useOnboardingFlow() {
  const navigate = useNavigate();
  const toast = useToast();

  const persisted = useRef(loadPersistedData());
  const [step, setStep] = useState(persisted.current?.step ?? 0);
  const [formData, setFormData] = useState<OnboardingFormData>(
    persisted.current?.formData ?? DEFAULT_FORM_DATA
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [countries, setCountries] = useState<GeoCountry[]>([]);

  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    persistData(step, formData);
  }, [step, formData]);

  useEffect(() => {
    tenantService.listPlans()
      .then(data => {
        setPlans(data);
        if (data.length > 0 && !formData.planId) {
          updateField('planId', data[1]?.id || data[0].id);
        }
      })
      .catch(err => {
        toast.error('Failed to load plans');
        logger.error(err);
      })
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    // Single source of truth: currency-bearing, onboardable countries only
    // (fail-loud — a stub country with no real ISO currency is never offered).
    geoCountryService
      .listOnboardableCountries()
      .then((data) => setCountries(data))
      .catch((err: unknown) => {
        toast.error('Failed to load countries');
        logger.error(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const updateField = useCallback(<K extends keyof OnboardingFormData>(
    key: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const checkSlugAvailability = useCallback((slug: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);

    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }

    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('tenants')
          .select('id')
          .eq('slug', slug)
          .is('deleted_at', null) // parity with server authority (provision-tenant), §9.7
          .maybeSingle();
        setSlugAvailable(!data);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 500);
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    const schema = STEP_SCHEMAS[step];
    if (!schema) return true;

    const stepFields = getStepFields(step);
    const stepData: Record<string, unknown> = {};
    for (const key of stepFields) {
      stepData[key] = formData[key as keyof OnboardingFormData];
    }

    const result = schema.safeParse(stepData);
    if (result.success) {
      setErrors({});
      return true;
    }

    const newErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0]?.toString();
      if (field && !newErrors[field]) {
        newErrors[field] = issue.message;
      }
    }
    setErrors(newErrors);
    return false;
  }, [step, formData]);

  const nextStep = useCallback(() => {
    if (!validateCurrentStep()) return;

    if (step === 0 && slugAvailable === false) {
      setErrors({ slug: 'This slug is already taken' });
      return;
    }

    if (step < 3) {
      setStep(step + 1);
      setErrors({});
    }
  }, [step, validateCurrentStep, slugAvailable]);

  const prevStep = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
      setErrors({});
    }
  }, [step]);

  const submit = useCallback(async () => {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    try {
      const selectedCountry = countries.find((c) => c.id === formData.countryId);
      // ui_language: send only when the user overrode the country default, so the
      // DB sync trigger owns the default when untouched (§9.2).
      const uiLanguageOverride = resolveUiLanguagePayload(
        selectedCountry?.language_code,
        formData.uiLanguage,
      );

      await tenantService.createTenant({
        name: formData.companyName,
        slug: formData.slug,
        adminEmail: formData.email,
        adminPassword: formData.password,
        adminFullName: formData.fullName,
        planId: formData.planId,
        countryId: formData.countryId,
        baseCurrencyCode: formData.baseCurrencyCode,
        uiLanguage: uiLanguageOverride,
        // Jurisdiction payload (consumed by provision-tenant → primary legal_entity).
        // Only present when the country actually has a tax system.
        legalEntityType: formData.legalEntityType || undefined,
        taxNumber: formData.taxNumber || undefined,
        subdivisionId: formData.subdivisionId || undefined,
        fiscalYearStart: formData.fiscalYearStart || undefined,
        timezone: formData.timezone || undefined,
      });

      sessionStorage.removeItem(STORAGE_KEY);
      toast.success('Account created successfully! Please log in.');
      navigate('/login');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }, [formData, countries, validateCurrentStep, navigate, toast]);

  return {
    step,
    formData,
    errors,
    submitting,
    plans,
    plansLoading,
    countries,
    slugAvailable,
    slugChecking,
    updateField,
    checkSlugAvailability,
    nextStep,
    prevStep,
    submit,
  };
}

function getStepFields(step: number): string[] {
  switch (step) {
    case 0: return ['companyName', 'slug'];
    case 1: return ['countryId', 'baseCurrencyCode'];
    case 2: return ['fullName', 'email', 'password', 'confirmPassword'];
    case 3: return ['services', 'estimatedCases', 'planId'];
    default: return [];
  }
}
