import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { Package, Loader2 } from 'lucide-react';
import { createSubscriptionPlan } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../hooks/useToast';
import type { Database } from '../../../types/database.types';

type PlanInsert = Database['public']['Tables']['subscription_plans']['Insert'];

interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const generateSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const PlanFormModal: React.FC<PlanFormModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<PlanInsert>>({
    name: '',
    code: '',
    slug: '',
    description: '',
    price_monthly: 0,
    price_yearly: 0,
    currency: 'USD',
    trial_days: null,
    is_active: true,
    is_public: true,
    sort_order: 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSubscriptionPlan({
        ...formData,
        name: formData.name || 'New Plan',
        slug: formData.slug || generateSlug(formData.name || 'new-plan'),
        price_monthly: formData.price_monthly || 0,
        price_yearly: formData.price_yearly || 0,
        currency: formData.currency || 'USD',
        sort_order: formData.sort_order || 0,
      } as PlanInsert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.plans() });
      toast.success('Plan created successfully');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create plan'),
  });

  const updateField = (field: keyof PlanInsert, value: unknown) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'name' && typeof value === 'string') {
        updated.slug = generateSlug(value);
        updated.code = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      }
      return updated;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Subscription Plan"
      subtitle="Enter the plan details to create it."
      icon={Package}
      titleSize="sm"
      size="lg"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={nameInputRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-5"
      >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              ref={nameInputRef}
              label="Plan Name"
              floatingLabel
              type="text"
              value={formData.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              required
            />
            <Input
              label="Code"
              floatingLabel
              type="text"
              value={formData.code || ''}
              onChange={(e) => updateField('code', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              label="Slug"
              floatingLabel
              type="text"
              value={formData.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
            />
            <Input
              label="Sort Order"
              floatingLabel
              type="number"
              value={formData.sort_order ?? 0}
              onChange={(e) => updateField('sort_order', parseInt(e.target.value) || 0)}
            />
          </div>

          <Textarea
            label="Description"
            floatingLabel
            value={formData.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
            className="resize-none"
          />

          <div className="grid grid-cols-3 gap-x-4 gap-y-5">
            <Input
              label="Monthly Price"
              floatingLabel
              type="number"
              step="0.01"
              value={formData.price_monthly ?? 0}
              onChange={(e) => updateField('price_monthly', parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Yearly Price"
              floatingLabel
              type="number"
              step="0.01"
              value={formData.price_yearly ?? 0}
              onChange={(e) => updateField('price_yearly', parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Currency"
              floatingLabel
              type="text"
              value={formData.currency || 'USD'}
              onChange={(e) => updateField('currency', e.target.value)}
            />
          </div>

          <Input
            label="Trial Days"
            floatingLabel
            type="number"
            value={formData.trial_days ?? ''}
            onChange={(e) => updateField('trial_days', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="No trial"
          />

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => updateField('is_active', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              <span className="text-sm text-slate-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_public ?? true}
                onChange={(e) => updateField('is_public', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary"
              />
              <span className="text-sm text-slate-700">Public</span>
            </label>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Plan'
              )}
            </Button>
          </div>
      </form>
    </Modal>
  );
};
