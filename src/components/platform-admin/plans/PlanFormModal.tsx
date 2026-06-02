import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { createSubscriptionPlan } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import toast from 'react-hot-toast';
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
      size="lg"
      closeOnBackdrop={false}
      initialFocusRef={nameInputRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-4"
      >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-name" className="block text-sm font-medium text-slate-700 mb-1">Plan Name *</label>
              <input
                id="plan-name"
                ref={nameInputRef}
                type="text"
                value={formData.name || ''}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label htmlFor="plan-code" className="block text-sm font-medium text-slate-700 mb-1">Code</label>
              <input
                id="plan-code"
                type="text"
                value={formData.code || ''}
                onChange={(e) => updateField('code', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-slug" className="block text-sm font-medium text-slate-700 mb-1">Slug</label>
              <input
                id="plan-slug"
                type="text"
                value={formData.slug || ''}
                onChange={(e) => updateField('slug', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="plan-sort-order" className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
              <input
                id="plan-sort-order"
                type="number"
                value={formData.sort_order ?? 0}
                onChange={(e) => updateField('sort_order', parseInt(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="plan-description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              id="plan-description"
              value={formData.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="plan-monthly-price" className="block text-sm font-medium text-slate-700 mb-1">Monthly Price</label>
              <input
                id="plan-monthly-price"
                type="number"
                step="0.01"
                value={formData.price_monthly ?? 0}
                onChange={(e) => updateField('price_monthly', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="plan-yearly-price" className="block text-sm font-medium text-slate-700 mb-1">Yearly Price</label>
              <input
                id="plan-yearly-price"
                type="number"
                step="0.01"
                value={formData.price_yearly ?? 0}
                onChange={(e) => updateField('price_yearly', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="plan-currency" className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <input
                id="plan-currency"
                type="text"
                value={formData.currency || 'USD'}
                onChange={(e) => updateField('currency', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="plan-trial-days" className="block text-sm font-medium text-slate-700 mb-1">Trial Days</label>
            <input
              id="plan-trial-days"
              type="number"
              value={formData.trial_days ?? ''}
              onChange={(e) => updateField('trial_days', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="No trial"
            />
          </div>

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

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Plan'}
            </Button>
          </div>
      </form>
    </Modal>
  );
};
