import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { getAllSubscriptionPlans, updateSubscriptionPlan, softDeleteSubscriptionPlan, formatPlanPrice } from '../../lib/billingService';
import { platformAdminKeys } from '../../lib/queryKeys';
import { PlanFormModal } from '../../components/platform-admin/plans/PlanFormModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { PlanWithFeatures } from '../../lib/billingService';

type TabType = 'all' | 'active' | 'inactive';

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

export const PlansManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.plansList(),
    queryFn: getAllSubscriptionPlans,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateSubscriptionPlan(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.plans() });
      toast.success('Plan updated');
    },
    onError: () => toast.error('Failed to update plan'),
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteSubscriptionPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.plans() });
      toast.success('Plan deleted');
    },
    onError: () => toast.error('Failed to delete plan'),
  });

  const filteredPlans = plans.filter((plan) => {
    if (activeTab === 'active') return plan.is_active;
    if (activeTab === 'inactive') return !plan.is_active;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
          <p className="text-slate-600 mt-1">Manage pricing plans and features for tenants</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Plan
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
              <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {plans.filter((p) => {
                  if (tab.id === 'active') return p.is_active;
                  if (tab.id === 'inactive') return !p.is_active;
                  return true;
                }).length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading plans...</div>
      ) : filteredPlans.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 mb-4">No plans found</p>
          <Button variant="ghost" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create your first plan
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Plan</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Monthly</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Yearly</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Trial</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Features</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPlans.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  onNavigate={() => navigate(`/platform-admin/plans/${plan.id}`)}
                  onToggleActive={() =>
                    toggleActiveMutation.mutate({ id: plan.id, is_active: !plan.is_active })
                  }
                  onDelete={async () => {
                    const ok = await confirm({
                      title: 'Delete plan',
                      message: `Delete "${plan.name}"? This action cannot be undone.`,
                      confirmLabel: 'Delete',
                      tone: 'danger',
                    });
                    if (!ok) return;
                    deleteMutation.mutate(plan.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <PlanFormModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

const PlanRow: React.FC<{
  plan: PlanWithFeatures;
  onNavigate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}> = ({ plan, onNavigate, onToggleActive, onDelete }) => {
  const featureCount = plan.plan_features?.length || 0;

  return (
    <tr className="hover:bg-slate-50 cursor-pointer" onClick={onNavigate}>
      <td className="px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
          {plan.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{plan.description}</p>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">{plan.code}</code>
      </td>
      <td className="px-6 py-4 text-sm text-slate-700">
        {formatPlanPrice(plan, 'month')}
      </td>
      <td className="px-6 py-4 text-sm text-slate-700">
        {formatPlanPrice(plan, 'year')}
      </td>
      <td className="px-6 py-4 text-sm text-slate-700">
        {plan.trial_days ? `${plan.trial_days} days` : '—'}
      </td>
      <td className="px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          {plan.is_active ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success-muted px-2 py-1 rounded-full">
              <Check className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              <X className="w-3 h-3" /> Inactive
            </span>
          )}
          {plan.is_public && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-info bg-info-muted px-2 py-1 rounded-full">
              Public
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center text-sm text-slate-600">
        {featureCount}
      </td>
      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onNavigate}
            className="p-1.5 text-slate-400 hover:text-primary hover:bg-info-muted rounded-lg transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleActive}
            className="p-1.5 text-slate-400 hover:text-warning hover:bg-warning-muted rounded-lg transition-colors"
            title={plan.is_active ? 'Deactivate' : 'Activate'}
          >
            {plan.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};
