import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { getAllCoupons, softDeleteCoupon } from '../../lib/billingService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { CouponFormModal } from '../../components/platform-admin/coupons/CouponFormModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { Database } from '../../types/database.types';

type BillingCoupon = Database['public']['Tables']['billing_coupons']['Row'];
type TabType = 'active' | 'expired' | 'all';

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'all', label: 'All' },
];

export const CouponsManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<BillingCoupon | undefined>();

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.couponsList(),
    queryFn: getAllCoupons,
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteCoupon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.coupons() });
      toast.success('Coupon deleted');
    },
    onError: () => toast.error('Failed to delete coupon'),
  });

  const now = new Date();
  const filteredCoupons = coupons.filter((coupon) => {
    const isExpired = coupon.valid_until && new Date(coupon.valid_until) < now;
    if (activeTab === 'active') return coupon.is_active && !isExpired;
    if (activeTab === 'expired') return isExpired || !coupon.is_active;
    return true;
  });

  const formatDiscount = (coupon: BillingCoupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`;
    }
    return `$${coupon.discount_value}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coupon Management</h1>
          <p className="text-slate-600 mt-1">Create and manage discount codes</p>
        </div>
        <Button onClick={() => { setEditingCoupon(undefined); setShowFormModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Create Coupon
        </Button>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading coupons...</div>
      ) : filteredCoupons.length === 0 ? (
        <div className="text-center py-12">
          <Tag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No coupons found</p>
          <Button variant="ghost" onClick={() => { setEditingCoupon(undefined); setShowFormModal(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Create your first coupon
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Code</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Name</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Discount</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Valid Period</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Redemptions</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Status</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCoupons.map((coupon) => {
                const isExpired = coupon.valid_until && new Date(coupon.valid_until) < now;
                return (
                  <tr key={coupon.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <code className="text-sm font-medium bg-slate-100 px-2 py-1 rounded">{coupon.code}</code>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{coupon.name || '—'}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-success bg-success-muted px-2 py-1 rounded">
                        {formatDiscount(coupon)} off
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {coupon.valid_from && new Date(coupon.valid_from).toLocaleDateString()}
                      {coupon.valid_until && ` — ${new Date(coupon.valid_until).toLocaleDateString()}`}
                      {!coupon.valid_from && !coupon.valid_until && 'No expiry'}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      {coupon.redemptions_count || 0}
                      {coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ''}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isExpired ? (
                        <span className="text-xs font-medium text-danger bg-danger-muted px-2 py-1 rounded-full">Expired</span>
                      ) : coupon.is_active ? (
                        <span className="text-xs font-medium text-success bg-success-muted px-2 py-1 rounded-full">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditingCoupon(coupon); setShowFormModal(true); }}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-info-muted rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Delete coupon',
                              message: `Delete coupon "${coupon.code}"?`,
                              confirmLabel: 'Delete',
                              tone: 'danger',
                            });
                            if (!ok) return;
                            deleteMutation.mutate(coupon.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showFormModal && (
        <CouponFormModal
          isOpen={showFormModal}
          onClose={() => { setShowFormModal(false); setEditingCoupon(undefined); }}
          coupon={editingCoupon}
        />
      )}
    </div>
  );
};
