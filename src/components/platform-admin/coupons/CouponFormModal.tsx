import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
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
  const codeInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Coupon' : 'Create Coupon'}
      size="md"
      closeOnBackdrop={false}
      initialFocusRef={codeInputRef}
    >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="coupon-code" className="block text-sm font-medium text-slate-700 mb-1">Coupon Code *</label>
              <input
                id="coupon-code"
                ref={codeInputRef}
                type="text"
                value={formData.code}
                onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="SAVE20"
                required
              />
            </div>
            <div>
              <label htmlFor="coupon-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                id="coupon-name"
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
              <label htmlFor="coupon-discount-type" className="block text-sm font-medium text-slate-700 mb-1">Discount Type *</label>
              <select
                id="coupon-discount-type"
                value={formData.discount_type}
                onChange={(e) => setFormData((p) => ({ ...p, discount_type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label htmlFor="coupon-discount-value" className="block text-sm font-medium text-slate-700 mb-1">Discount Value *</label>
              <input
                id="coupon-discount-value"
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
              <label htmlFor="coupon-valid-from" className="block text-sm font-medium text-slate-700 mb-1">Valid From</label>
              <input
                id="coupon-valid-from"
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData((p) => ({ ...p, valid_from: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="coupon-valid-until" className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
              <input
                id="coupon-valid-until"
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData((p) => ({ ...p, valid_until: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="coupon-max-redemptions" className="block text-sm font-medium text-slate-700 mb-1">Max Redemptions</label>
            <input
              id="coupon-max-redemptions"
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
            <label htmlFor="coupon-paypal-id" className="block text-sm font-medium text-slate-700 mb-1">PayPal Coupon ID</label>
            <input
              id="coupon-paypal-id"
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
    </Modal>
  );
};
