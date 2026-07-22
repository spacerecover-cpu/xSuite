import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { Ticket, Loader2 } from 'lucide-react';
import { createCoupon, updateCoupon } from '../../../lib/billingService';
import { platformAdminKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../hooks/useToast';
import type { Database } from '../../../types/database.types';

type BillingCoupon = Database['public']['Tables']['billing_coupons']['Row'];

interface CouponFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  coupon?: BillingCoupon;
}

export const CouponFormModal: React.FC<CouponFormModalProps> = ({ isOpen, onClose, coupon }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
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
      subtitle={isEditing ? "Update this coupon's details." : 'Enter the coupon details to create it.'}
      icon={Ticket}
      titleSize="sm"
      size="md"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={codeInputRef}
    >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              ref={codeInputRef}
              label="Coupon Code"
              floatingLabel
              type="text"
              value={formData.code}
              onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              className="font-mono"
              placeholder="SAVE20"
              required
            />
            <Input
              label="Name"
              floatingLabel
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="20% off first year"
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <SearchableSelect
              label="Discount Type"
              floatingLabel
              usePortal
              value={formData.discount_type}
              onChange={(value) => setFormData((p) => ({ ...p, discount_type: value }))}
              options={[
                { id: 'percentage', name: 'Percentage (%)' },
                { id: 'fixed', name: 'Fixed Amount ($)' },
              ]}
            />
            <Input
              label="Discount Value"
              floatingLabel
              type="number"
              step="0.01"
              value={formData.discount_value}
              onChange={(e) => setFormData((p) => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Input
              label="Valid From"
              floatingLabel
              type="date"
              value={formData.valid_from}
              onChange={(e) => setFormData((p) => ({ ...p, valid_from: e.target.value }))}
            />
            <Input
              label="Valid Until"
              floatingLabel
              type="date"
              value={formData.valid_until}
              onChange={(e) => setFormData((p) => ({ ...p, valid_until: e.target.value }))}
            />
          </div>

          <Input
            label="Max Redemptions"
            floatingLabel
            type="number"
            value={formData.max_redemptions ?? ''}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                max_redemptions: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
            placeholder="Unlimited"
          />

          <Input
            label="PayPal Coupon ID"
            floatingLabel
            type="text"
            value={formData.paypal_coupon_id}
            onChange={(e) => setFormData((p) => ({ ...p, paypal_coupon_id: e.target.value }))}
            placeholder="Optional"
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-primary"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

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
                'Update Coupon'
              ) : (
                'Create Coupon'
              )}
            </Button>
          </div>
        </form>
    </Modal>
  );
};
