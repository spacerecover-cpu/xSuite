import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Clock, CheckCircle2,
  TrendingUp, Users, HardDrive, BarChart2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LowStockWidget } from '../../components/dashboard/LowStockWidget';
import { DueFollowUpsWidget } from '../../components/dashboard/DueFollowUpsWidget';
import { StockSalesWidget } from '../../components/dashboard/StockSalesWidget';
import { StockValueWidget } from '../../components/dashboard/StockValueWidget';
import { supabase } from '../../lib/supabaseClient';
import { UpgradeBanner } from '../../components/shared/UpgradeBanner';
import { useFeature } from '../../hooks/useFeatureGate';
import { getCurrentPlanCode } from '../../lib/featureGateService';
import { useTenantFeatures } from '../../contexts/TenantConfigContext';
import { StatCard } from '../../components/shared/StatCard';
import { TERMINAL_TYPES } from '../../lib/caseLifecycle';

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { isEnabled } = useTenantFeatures();
  const { hasAccess: _hasAdvancedReports } = useFeature('advanced_reports');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [planCode, setPlanCode] = useState<string>('');

  React.useEffect(() => {
    getCurrentPlanCode().then(setPlanCode);
  }, []);

  // Status lists come from the lifecycle taxonomy (master_case_statuses.type),
  // never from hardcoded names. Shares the ['case_statuses'] cache entry with
  // CasesList / useSidebarBadges.
  const { data: caseStatuses = [] } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name, type, color')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const activeStatusNames = caseStatuses
    .filter((s) => !(TERMINAL_TYPES as readonly string[]).includes(s.type ?? ''))
    .map((s) => s.name);
  const pendingStatusNames = caseStatuses
    .filter((s) => s.type === 'intake' || s.type === 'diagnosis')
    .map((s) => s.name);

  const { data: caseStats } = useQuery({
    queryKey: ['dashboard-case-stats', activeStatusNames, pendingStatusNames],
    enabled: activeStatusNames.length > 0,
    queryFn: async () => {
      // Start of today in the browser's timezone, as a full timestamptz instant
      // (parity with useSidebarBadges) — a bare UTC date string mis-buckets
      // early-local-day cases across the UTC boundary.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const [activeRes, todayRes, pendingRes] = await Promise.all([
        supabase.from('cases').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('status', activeStatusNames),
        supabase.from('cases').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', startOfToday.toISOString()),
        supabase.from('cases').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('status', pendingStatusNames),
      ]);
      return {
        active: activeRes.count ?? 0,
        today: todayRes.count ?? 0,
        pending: pendingRes.count ?? 0,
      };
    },
    staleTime: 60000,
  });

  const { data: customerCount } = useQuery({
    queryKey: ['dashboard-customer-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('customers_enhanced')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('deleted_at', null);
      return count ?? 0;
    },
    staleTime: 300000,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-primary-foreground/80 text-sm font-medium mb-1">{greeting()},</p>
            <h1 className="text-2xl font-bold">{profile?.full_name || 'Welcome back'}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1 capitalize">{profile?.role?.replace('_', ' ') || 'Staff'}</p>
          </div>
          <div className="text-right text-primary-foreground/80 text-sm">
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
            <p className="font-semibold text-primary-foreground">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {planCode === 'starter' && showUpgradeBanner && (
        <UpgradeBanner
          title="Unlock Advanced Features"
          description="Upgrade to Professional or Enterprise to access advanced reports, API access, priority support, and more."
          targetPlan="Professional"
          onDismiss={() => setShowUpgradeBanner(false)}
        />
      )}

      {isEnabled('dashboard.cases_overview') && (
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Cases Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Cases"
            value={caseStats?.active ?? '—'}
            tone="info"
            icon={Briefcase}
            onClick={() => navigate('/cases')}
          />
          <StatCard
            label="New Today"
            value={caseStats?.today ?? '—'}
            tone="success"
            icon={TrendingUp}
            onClick={() => navigate('/cases')}
          />
          <StatCard
            label="Pending"
            value={caseStats?.pending ?? '—'}
            tone="warning"
            icon={Clock}
            onClick={() => navigate('/cases')}
          />
          <StatCard
            label="Customers"
            value={customerCount ?? '—'}
            tone="neutral"
            icon={Users}
            onClick={() => navigate('/customers')}
          />
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DueFollowUpsWidget />
      </div>

      {isEnabled('dashboard.stock_widgets') && (
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Stock & Inventory</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LowStockWidget />
          <StockSalesWidget />
          <StockValueWidget />
        </div>
      </div>
      )}

      {isEnabled('dashboard.quick_nav') && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/cases')}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-slate-800 group-hover:text-primary transition-colors">Cases</span>
          </div>
          <p className="text-xs text-slate-500">Manage data recovery cases, devices, and reports</p>
        </button>

        <button
          onClick={() => navigate('/invoices')}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success-muted flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>
            <span className="font-semibold text-slate-800 group-hover:text-success transition-colors">Invoices</span>
          </div>
          <p className="text-xs text-slate-500">Track and manage invoices and payments</p>
        </button>

        <button
          onClick={() => navigate('/stock/reports')}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-slate-600" />
            </div>
            <span className="font-semibold text-slate-800 group-hover:text-slate-900 transition-colors">Stock Reports</span>
          </div>
          <p className="text-xs text-slate-500">View stock valuation, sales history and movements</p>
        </button>
      </div>
      )}
    </div>
  );
};
