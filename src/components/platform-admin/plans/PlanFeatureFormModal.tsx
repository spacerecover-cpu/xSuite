import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { createPlanFeature, updatePlanFeature } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../hooks/useToast';
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
  const toast = useToast();
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
  const firstFieldRef = useRef<HTMLSelectElement>(null);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Feature' : 'Add Feature'}
      size="md"
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
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
                  ref={firstFieldRef}
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
              <label htmlFor="feature-display-name" className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
              <input
                id="feature-display-name"
                type="text"
                value={formData.feature_name}
                onChange={(e) => setFormData((p) => ({ ...p, feature_name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="feature-arabic-name" className="block text-sm font-medium text-slate-700 mb-1">Arabic Name</label>
              <input
                id="feature-arabic-name"
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
              <label htmlFor="feature-limit-type" className="block text-sm font-medium text-slate-700 mb-1">Limit Type</label>
              <input
                id="feature-limit-type"
                type="text"
                value={formData.limit_type}
                onChange={(e) => setFormData((p) => ({ ...p, limit_type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. users, cases, storage"
              />
            </div>
            <div>
              <label htmlFor="feature-limit-value" className="block text-sm font-medium text-slate-700 mb-1">Limit Value</label>
              <input
                id="feature-limit-value"
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
            <label htmlFor="feature-display-order" className="block text-sm font-medium text-slate-700 mb-1">Display Order</label>
            <input
              id="feature-display-order"
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
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEditing ? 'Update Feature' : 'Add Feature'}
            </Button>
          </div>
        </form>
    </Modal>
  );
};
