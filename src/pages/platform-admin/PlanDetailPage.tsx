import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  getPlanFeatures,
  softDeletePlanFeature,
} from '../../lib/billingService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { PlanFeatureFormModal } from '../../components/platform-admin/plans/PlanFeatureFormModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { Database } from '../../types/database.types';

type PlanUpdate = Database['public']['Tables']['subscription_plans']['Update'];
type PlanFeature = Database['public']['Tables']['plan_features']['Row'];

type TabType = 'details' | 'features';

export const PlanDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const [editingFeature, setEditingFeature] = useState<PlanFeature | undefined>();

  const { data: plan, isLoading } = useQuery({
    queryKey: platformAdminKeys.planDetail(id!),
    queryFn: () => getSubscriptionPlanById(id!),
    enabled: !!id,
  });

  const { data: features = [] } = useQuery({
    queryKey: platformAdminKeys.planFeatures(id!),
    queryFn: () => getPlanFeatures(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-center py-12 text-slate-500">Loading plan...</div>;
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 mb-4">Plan not found</p>
        <Button variant="ghost" onClick={() => navigate('/platform-admin/plans')}>
          Back to Plans
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/platform-admin/plans')}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{plan.name}</h1>
          <p className="text-slate-500 text-sm">
            Code: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{plan.code}</code>
            {' · '}Slug: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{plan.slug}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan.is_active ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success-muted px-2.5 py-1 rounded-full">
              <Check className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              <X className="w-3 h-3" /> Inactive
            </span>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {(['details', 'features'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'features' ? `Features (${features.length})` : 'Plan Details'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'details' ? (
        <PlanDetailsForm plan={plan} />
      ) : (
        <PlanFeaturesTab
          planId={id!}
          features={features}
          onAddFeature={() => {
            setEditingFeature(undefined);
            setShowFeatureModal(true);
          }}
          onEditFeature={(feature) => {
            setEditingFeature(feature);
            setShowFeatureModal(true);
          }}
        />
      )}

      {showFeatureModal && (
        <PlanFeatureFormModal
          isOpen={showFeatureModal}
          onClose={() => {
            setShowFeatureModal(false);
            setEditingFeature(undefined);
          }}
          planId={id!}
          feature={editingFeature}
        />
      )}
    </div>
  );
};

const PlanDetailsForm: React.FC<{ plan: Database['public']['Tables']['subscription_plans']['Row'] }> = ({ plan }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formData, setFormData] = useState<PlanUpdate>({
    name: plan.name,
    code: plan.code,
    slug: plan.slug,
    description: plan.description,
    price_monthly: plan.price_monthly,
    price_yearly: plan.price_yearly,
    currency: plan.currency,
    trial_days: plan.trial_days,
    is_active: plan.is_active,
    is_public: plan.is_public,
    sort_order: plan.sort_order,
    api_calls_per_hour: plan.api_calls_per_hour,
    email_sends_per_day: plan.email_sends_per_day,
    pdf_generations_per_hour: plan.pdf_generations_per_hour,
    storage_limit_mb: plan.storage_limit_mb,
    paypal_product_id: plan.paypal_product_id,
    paypal_plan_monthly_id: plan.paypal_plan_monthly_id,
    paypal_plan_yearly_id: plan.paypal_plan_yearly_id,
    features: plan.features,
    limits: plan.limits,
  });

  const [featuresJson, setFeaturesJson] = useState(
    plan.features ? JSON.stringify(plan.features, null, 2) : '{}'
  );
  const [limitsJson, setLimitsJson] = useState(
    plan.limits ? JSON.stringify(plan.limits, null, 2) : '{}'
  );

  const updateMutation = useMutation({
    mutationFn: () => {
      let parsedFeatures = formData.features;
      let parsedLimits = formData.limits;
      try {
        parsedFeatures = JSON.parse(featuresJson);
      } catch { /* keep existing */ }
      try {
        parsedLimits = JSON.parse(limitsJson);
      } catch { /* keep existing */ }

      return updateSubscriptionPlan(plan.id, {
        ...formData,
        features: parsedFeatures,
        limits: parsedLimits,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.plans() });
      toast.success('Plan updated successfully');
    },
    onError: () => toast.error('Failed to update plan'),
  });

  const updateField = (field: keyof PlanUpdate, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate();
      }}
      className="space-y-8"
    >
      <Section title="Basic Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Plan Name" required>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Code" required>
            <input
              type="text"
              value={formData.code || ''}
              onChange={(e) => updateField('code', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Slug" required>
            <input
              type="text"
              value={formData.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Sort Order">
            <input
              type="number"
              value={formData.sort_order ?? 0}
              onChange={(e) => updateField('sort_order', parseInt(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              value={formData.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
        </div>
      </Section>

      <Section title="Pricing">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Monthly Price">
            <input
              type="number"
              step="0.01"
              value={formData.price_monthly ?? 0}
              onChange={(e) => updateField('price_monthly', parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Yearly Price">
            <input
              type="number"
              step="0.01"
              value={formData.price_yearly ?? 0}
              onChange={(e) => updateField('price_yearly', parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={formData.currency || 'USD'}
              onChange={(e) => updateField('currency', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </Field>
          <Field label="Trial Days">
            <input
              type="number"
              value={formData.trial_days ?? ''}
              onChange={(e) => updateField('trial_days', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="No trial"
            />
          </Field>
        </div>
      </Section>

      <Section title="Visibility">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active ?? false}
              onChange={(e) => updateField('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_public ?? false}
              onChange={(e) => updateField('is_public', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">Public (visible on signup page)</span>
          </label>
        </div>
      </Section>

      <Section title="Rate Limits">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="API Calls / Hour">
            <input
              type="number"
              value={formData.api_calls_per_hour ?? ''}
              onChange={(e) => updateField('api_calls_per_hour', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Emails / Day">
            <input
              type="number"
              value={formData.email_sends_per_day ?? ''}
              onChange={(e) => updateField('email_sends_per_day', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Unlimited"
            />
          </Field>
          <Field label="PDFs / Hour">
            <input
              type="number"
              value={formData.pdf_generations_per_hour ?? ''}
              onChange={(e) => updateField('pdf_generations_per_hour', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Storage (MB)">
            <input
              type="number"
              value={formData.storage_limit_mb ?? ''}
              onChange={(e) => updateField('storage_limit_mb', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Unlimited"
            />
          </Field>
        </div>
      </Section>

      <Section title="PayPal Integration">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="PayPal Product ID">
            <input
              type="text"
              value={formData.paypal_product_id || ''}
              onChange={(e) => updateField('paypal_product_id', e.target.value || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="PROD-XXXXX"
            />
          </Field>
          <Field label="Monthly Plan ID">
            <input
              type="text"
              value={formData.paypal_plan_monthly_id || ''}
              onChange={(e) => updateField('paypal_plan_monthly_id', e.target.value || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="P-XXXXX"
            />
          </Field>
          <Field label="Yearly Plan ID">
            <input
              type="text"
              value={formData.paypal_plan_yearly_id || ''}
              onChange={(e) => updateField('paypal_plan_yearly_id', e.target.value || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="P-XXXXX"
            />
          </Field>
        </div>
      </Section>

      <Section title="Advanced (JSON)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Features JSON">
            <textarea
              value={featuresJson}
              onChange={(e) => setFeaturesJson(e.target.value)}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="{}"
            />
          </Field>
          <Field label="Limits JSON">
            <textarea
              value={limitsJson}
              onChange={(e) => setLimitsJson(e.target.value)}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="{}"
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end pt-4 border-t border-slate-200">
        <Button type="submit" disabled={updateMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
};

const PlanFeaturesTab: React.FC<{
  planId: string;
  features: PlanFeature[];
  onAddFeature: () => void;
  onEditFeature: (feature: PlanFeature) => void;
}> = ({ planId, features, onAddFeature, onEditFeature }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const deleteMutation = useMutation({
    mutationFn: softDeletePlanFeature,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.planFeatures(planId) });
      toast.success('Feature removed');
    },
    onError: () => toast.error('Failed to remove feature'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">{features.length} features configured</p>
        <Button variant="ghost" size="sm" onClick={onAddFeature}>
          <Plus className="w-4 h-4 mr-1" />
          Add Feature
        </Button>
      </div>

      {features.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500 mb-4">No features configured for this plan</p>
          <Button variant="ghost" onClick={onAddFeature}>
            <Plus className="w-4 h-4 mr-2" />
            Add first feature
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Feature</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Key</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Enabled</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Highlighted</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Limit</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Order</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {features.map((feature) => (
                <tr key={feature.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-slate-900">{feature.feature_name}</p>
                    {feature.feature_name_ar && (
                      <p className="text-xs text-slate-400 mt-0.5" dir="rtl">{feature.feature_name_ar}</p>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{feature.feature_key}</code>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {feature.is_enabled ? (
                      <Check className="w-4 h-4 text-success mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {feature.is_highlighted ? (
                      <Check className="w-4 h-4 text-primary mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-slate-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600">
                    {feature.limit_value !== null ? (
                      <span>{feature.limit_value} {feature.limit_type && `(${feature.limit_type})`}</span>
                    ) : (
                      <span className="text-slate-400">Unlimited</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-center text-sm text-slate-600">
                    {feature.display_order ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditFeature(feature)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-info-muted rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Remove feature',
                            message: 'Remove this feature?',
                            confirmLabel: 'Remove',
                            tone: 'danger',
                          });
                          if (!ok) return;
                          deleteMutation.mutate(feature.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-6">
    <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; className?: string; children: React.ReactNode }> = ({
  label,
  required,
  className,
  children,
}) => (
  <div className={className}>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {label}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
    {children}
  </div>
);
