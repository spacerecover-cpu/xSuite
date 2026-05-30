import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { tenantService } from '../../lib/tenantService';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { logger } from '../../lib/logger';

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];

interface GeoCountry {
  id: string;
  code: string;
  name: string;
  currency_code: string | null;
  currency_symbol: string | null;
  tax_system: string | null;
  tax_label: string | null;
}

export const TenantSignup = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [step, setStep] = useState<'plan' | 'details'>('plan');

  const [formData, setFormData] = useState({
    companyName: '',
    slug: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const loadPlans = async () => {
      try {
        setPlansLoading(true);
        const data = await tenantService.listPlans();
        setPlans(data);
        if (data.length > 0) {
          setSelectedPlanId(data[1]?.id || data[0].id);
        }
      } catch (error) {
        toast.error('Failed to load subscription plans');
        logger.error(error instanceof Error ? error.message : String(error));
      } finally {
        setPlansLoading(false);
      }
    };
    loadPlans();
  }, []);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const { data, error } = await supabase
          .from('geo_countries')
          .select('id, code, name, currency_code, currency_symbol, tax_system, tax_label')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setCountries(data || []);
      } catch (error) {
        toast.error('Failed to load countries');
        logger.error(error instanceof Error ? error.message : String(error));
      }
    };
    loadCountries();
  }, []);

  const handleCompanyNameChange = (value: string) => {
    setFormData({
      ...formData,
      companyName: value,
      slug: value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.adminPassword !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.adminPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const selectedCountry = countries.find((c) => c.id === selectedCountryId);
      await tenantService.createTenant({
        name: formData.companyName,
        slug: formData.slug,
        adminEmail: formData.adminEmail,
        adminPassword: formData.adminPassword,
        adminFullName: formData.adminFullName,
        planId: selectedPlanId,
        countryId: selectedCountryId,
        baseCurrencyCode: selectedCountry?.currency_code ?? 'USD',
      });

      toast.success('Account created successfully! Please log in.');
      navigate('/login');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'plan') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-6xl w-full">
          <div className="text-center mb-8">
            <Building2 className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose Your Plan</h1>
            <p className="text-gray-600">Select the plan that best fits your lab's needs</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {plansLoading && [1, 2, 3].map((i) => (
              <Card key={i} className="p-6 border border-gray-200 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-10 bg-gray-200 rounded w-2/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                <div className="border-t pt-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              </Card>
            ))}
            {!plansLoading && plans.map((plan) => {
              const limits = plan.limits as Record<string, any> || {};
              const isSelected = selectedPlanId === plan.id;

              return (
                <Card
                  key={plan.id}
                  className={`p-6 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-2 border-primary shadow-lg'
                      : 'border border-gray-200 hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    {isSelected && <Check className="w-6 h-6 text-primary" />}
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-900">
                      ${plan.price_monthly}
                    </span>
                    <span className="text-gray-500">/month</span>
                    <p className="text-sm text-gray-500 mt-1">
                      ${plan.price_yearly}/year (save 2 months)
                    </p>
                  </div>

                  <p className="text-gray-600 text-sm mb-4">{plan.description}</p>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Limits:</p>
                    <ul className="space-y-1 text-sm text-gray-600">
                      {limits.max_users !== -1 && (
                        <li>• {limits.max_users} team members</li>
                      )}
                      {limits.max_users === -1 && (
                        <li>• Unlimited team members</li>
                      )}
                      {limits.max_cases !== -1 && (
                        <li>• {limits.max_cases} cases/month</li>
                      )}
                      {limits.max_cases === -1 && (
                        <li>• Unlimited cases</li>
                      )}
                      {limits.max_storage_gb !== -1 && (
                        <li>• {limits.max_storage_gb}GB storage</li>
                      )}
                      {limits.max_storage_gb === -1 && (
                        <li>• Unlimited storage</li>
                      )}
                    </ul>
                  </div>

                  {plan.slug === 'professional' && (
                    <div className="mt-4">
                      <span className="inline-block bg-info-muted text-info text-xs font-semibold px-2 py-1 rounded">
                        Most Popular
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="text-center">
            <Button
              onClick={() => setStep('details')}
              disabled={!selectedPlanId}
              size="lg"
            >
              {plans.length === 0 ? 'Loading plans...' : `Continue with ${plans.find(p => p.id === selectedPlanId)?.name || 'Selected Plan'}`}
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <Building2 className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Your Account</h1>
          <p className="text-gray-600">Start your 14-day free trial</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Company Name" required>
            <Input
              value={formData.companyName}
              onChange={(e) => handleCompanyNameChange(e.target.value)}
              placeholder="ACME Data Recovery"
              required
            />
          </FormField>

          <FormField
            label="Company Slug"
            required
            hint="Used for your unique URL: acme.xsuite.space"
          >
            <Input
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="acme-data-recovery"
              required
              pattern="[a-z0-9\-]+"
            />
          </FormField>

          <FormField label="Country" required>
            <select
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Select a country...</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name} ({country.code})
                </option>
              ))}
            </select>
          </FormField>

          {selectedCountryId && (() => {
            const country = countries.find(c => c.id === selectedCountryId);
            if (!country) return null;
            return (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-medium text-gray-900">
                    {country.currency_symbol || ''} ({country.currency_code || 'N/A'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax System</span>
                  <span className="font-medium text-gray-900">
                    {country.tax_label || 'None'}
                  </span>
                </div>
              </div>
            );
          })()}

          <FormField label="Your Full Name" required>
            <Input
              value={formData.adminFullName}
              onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
              placeholder="John Doe"
              required
            />
          </FormField>

          <FormField label="Email Address" required>
            <Input
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              placeholder="john@acme.com"
              required
            />
          </FormField>

          <FormField label="Password" required>
            <Input
              type="password"
              value={formData.adminPassword}
              onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </FormField>

          <FormField label="Confirm Password" required>
            <Input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </FormField>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep('plan')}
              className="flex-1"
            >
              Back
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </div>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
};
