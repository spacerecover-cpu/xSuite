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

interface QuickStatProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  onClick?: () => void;
}

const QuickStat: React.FC<QuickStatProps> = ({ label, value, icon: Icon, color, bgColor, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
  >
    <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
    </div>
  </div>
);

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

  const { data: caseStats } = useQuery({
    queryKey: ['dashboard-case-stats'],
    queryFn: async () => {
      const [activeRes, todayRes, pendingRes] = await Promise.all([
        supabase.from('cases').select('id', { count: 'exact', head: true }).not('status', 'in', '("Delivered","Archived","Cancelled")'),
        supabase.from('cases').select('id', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('cases').select('id', { count: 'exact', head: true }).eq('status', 'Pending Assessment'),
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
        .eq('is_active', true);
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
    <div className="space-y-6">
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
          <QuickStat
            label="Active Cases"
            value={caseStats?.active ?? '—'}
            icon={Briefcase}
            color="text-primary"
            bgColor="bg-primary/10"
            onClick={() => navigate('/cases')}
          />
          <QuickStat
            label="New Today"
            value={caseStats?.today ?? '—'}
            icon={TrendingUp}
            color="text-success"
            bgColor="bg-success-muted"
            onClick={() => navigate('/cases')}
          />
          <QuickStat
            label="Pending"
            value={caseStats?.pending ?? '—'}
            icon={Clock}
            color="text-warning"
            bgColor="bg-warning-muted"
            onClick={() => navigate('/cases')}
          />
          <QuickStat
            label="Customers"
            value={customerCount ?? '—'}
            icon={Users}
            color="text-slate-600"
            bgColor="bg-slate-50"
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
          onClick={() => navigate('/resources/stock/reports')}
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
