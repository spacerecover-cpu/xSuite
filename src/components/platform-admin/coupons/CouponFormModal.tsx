import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { createCoupon, updateCoupon } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import toast from 'react-hot-toast';
import type { Database } from '../../../types/database.types';

type BillingCoupon = Database['public']['Tables']['billing_coupons']['Row'];

interface CouponFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  coupon?: BillingCoupon;
}

export const CouponFormModal: React.FC<CouponFormModalProps> = ({ isOpen, onClose, coupon }) => {
  const queryClient = useQueryClient();
  const isEditing = !!coupon;

  const [formData, setFormData] = useState({
    code: coupon?.code || '',
    name: coupon?.name || '',
    discount_type: coupon?.discount_type || 'percentage',
    discount_value: coupon?.discount_value ?? 0,
    is_active: coupon?.is_active ?? true,
    valid_from: coupon?.valid_from ? coupon.valid_from.split('T')[0] : '',
    valid_until: coupon?.valid_until ? coupon.valid_until.split('T')[0] : '',
    max_redemptions: coupon?.max_redemptions ?? null as number | null,
    paypal_coupon_id: coupon?.paypal_coupon_id || '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      const basePayload = {
        code: formData.code.toUpperCase(),
        name: formData.name || formData.code.toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        is_active: formData.is_active,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        max_redemptions: formData.max_redemptions,
        paypal_coupon_id: formData.paypal_coupon_id || null,
      };

      if (isEditing) {
        return updateCoupon(coupon.id, basePayload);
      }
      return createCoupon(basePayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.coupons() });
      toast.success(isEditing ? 'Coupon updated' : 'Coupon created');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save coupon'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Edit Coupon' : 'Create Coupon'}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="SAVE20"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="20% off first year"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Discount Type *</label>
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData((p) => ({ ...p, discount_type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Discount Value *</label>
              <input
                type="number"
                step="0.01"
                value={formData.discount_value}
                onChange={(e) => setFormData((p) => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valid From</label>
              <input
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData((p) => ({ ...p, valid_from: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData((p) => ({ ...p, valid_until: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Redemptions</label>
            <input
              type="number"
              value={formData.max_redemptions ?? ''}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  max_redemptions: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Unlimited"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PayPal Coupon ID</label>
            <input
              type="text"
              value={formData.paypal_coupon_id}
              onChange={(e) => setFormData((p) => ({ ...p, paypal_coupon_id: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Optional"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-primary"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEditing ? 'Update Coupon' : 'Create Coupon'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
