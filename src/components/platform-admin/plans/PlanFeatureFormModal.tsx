import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { ListPlus, Loader2 } from 'lucide-react';
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
      subtitle={isEditing ? "Update this feature's details." : 'Enter the feature details to add it.'}
      icon={ListPlus}
      size="md"
      titleSize="sm"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-5"
      >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Feature Key *</label>
            {customKey ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.feature_key}
                  onChange={(e) => setFormData((p) => ({ ...p, feature_key: e.target.value }))}
                  className="flex-1 border border-slate-300 rounded-lg h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="flex-1 border border-slate-300 rounded-lg h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              label="Display Name"
              floatingLabel
              value={formData.feature_name}
              onChange={(e) => setFormData((p) => ({ ...p, feature_name: e.target.value }))}
              required
              placeholder="e.g. Advanced Reports"
            />
            <Input
              label="Arabic Name"
              floatingLabel
              dir="rtl"
              value={formData.feature_name_ar}
              onChange={(e) => setFormData((p) => ({ ...p, feature_name_ar: e.target.value }))}
              placeholder="الاسم بالعربية"
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              label="Limit Type"
              floatingLabel
              value={formData.limit_type}
              onChange={(e) => setFormData((p) => ({ ...p, limit_type: e.target.value }))}
              placeholder="e.g. users, cases, storage"
            />
            <Input
              label="Limit Value"
              floatingLabel
              type="number"
              value={formData.limit_value ?? ''}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  limit_value: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              placeholder="Unlimited"
            />
          </div>

          <Input
            label="Display Order"
            floatingLabel
            type="number"
            value={formData.display_order ?? 0}
            onChange={(e) =>
              setFormData((p) => ({ ...p, display_order: parseInt(e.target.value) || 0 }))
            }
          />

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

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Feature'
              ) : (
                'Add Feature'
              )}
            </Button>
          </div>
        </form>
    </Modal>
  );
};
