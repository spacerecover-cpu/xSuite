import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { createPlanFeature, updatePlanFeature } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import toast from 'react-hot-toast';
import type { Database } from '../../../types/database.types';

type PlanFeature = Database['public']['Tables']['plan_features']['Row'];

const FEATURE_KEY_OPTIONS = [
  'case_management',
  'basic_invoicing',
  'customer_portal',
  'advanced_reports',
  'api_access',
  'white_labeling',
  'sso',
  'custom_workflows',
  'multi_branch',
  'bulk_import',
  'dedicated_support',
  'inventory_management',
  'priority_support',
  'max_users',
  'max_cases_per_month',
  'storage_gb',
];

interface PlanFeatureFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  feature?: PlanFeature;
}

export const PlanFeatureFormModal: React.FC<PlanFeatureFormModalProps> = ({
  isOpen,
  onClose,
  planId,
  feature,
}) => {
  const queryClient = useQueryClient();
  const isEditing = !!feature;

  const [formData, setFormData] = useState({
    feature_key: feature?.feature_key || '',
    feature_name: feature?.feature_name || '',
    feature_name_ar: feature?.feature_name_ar || '',
    is_enabled: feature?.is_enabled ?? true,
    is_highlighted: feature?.is_highlighted ?? false,
    limit_type: feature?.limit_type || '',
    limit_value: feature?.limit_value ?? null as number | null,
    display_order: feature?.display_order ?? 0,
  });

  const [customKey, setCustomKey] = useState(!FEATURE_KEY_OPTIONS.includes(formData.feature_key));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        plan_id: planId,
        feature_key: formData.feature_key,
        feature_name: formData.feature_name,
        feature_name_ar: formData.feature_name_ar || null,
        is_enabled: formData.is_enabled,
        is_highlighted: formData.is_highlighted,
        limit_type: formData.limit_type || null,
        limit_value: formData.limit_value,
        display_order: formData.display_order,
      };

      if (isEditing) {
        return updatePlanFeature(feature.id, payload);
      }
      return createPlanFeature(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.planFeatures(planId) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.planDetail(planId) });
      toast.success(isEditing ? 'Feature updated' : 'Feature added');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save feature'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Edit Feature' : 'Add Feature'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Feature Key *</label>
            {customKey ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.feature_key}
                  onChange={(e) => setFormData((p) => ({ ...p, feature_key: e.target.value }))}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="custom_feature_key"
                  required
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomKey(false)}>
                  List
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={formData.feature_key}
                  onChange={(e) => setFormData((p) => ({ ...p, feature_key: e.target.value }))}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">Select a feature key...</option>
                  {FEATURE_KEY_OPTIONS.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomKey(true)}>
                  Custom
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
              <input
                type="text"
                value={formData.feature_name}
                onChange={(e) => setFormData((p) => ({ ...p, feature_name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Arabic Name</label>
              <input
                type="text"
                dir="rtl"
                value={formData.feature_name_ar}
                onChange={(e) => setFormData((p) => ({ ...p, feature_name_ar: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Limit Type</label>
              <input
                type="text"
                value={formData.limit_type}
                onChange={(e) => setFormData((p) => ({ ...p, limit_type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. users, cases, storage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Limit Value</label>
              <input
                type="number"
                value={formData.limit_value ?? ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    limit_value: e.target.value ? parseInt(e.target.value) : null,
                  }))
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Display Order</label>
            <input
              type="number"
              value={formData.display_order ?? 0}
              onChange={(e) =>
                setFormData((p) => ({ ...p, display_order: parseInt(e.target.value) || 0 }))
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_enabled}
                onChange={(e) => setFormData((p) => ({ ...p, is_enabled: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              <span className="text-sm text-slate-700">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_highlighted}
                onChange={(e) => setFormData((p) => ({ ...p, is_highlighted: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              <span className="text-sm text-slate-700">Highlighted</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEditing ? 'Update Feature' : 'Add Feature'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
