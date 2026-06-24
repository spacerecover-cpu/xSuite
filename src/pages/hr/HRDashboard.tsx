import React, { useEffect, useState } from 'react';
import { Users, Briefcase, UserPlus, UserCheck, ClipboardList, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/templates/KpiRow';
import { logger } from '../../lib/logger';

export const HRDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    openPositions: 0,
    pendingReviews: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [employeesResult, jobsResult, reviewsResult] = await Promise.all([
        supabase.from('employees').select('employment_status', { count: 'exact' }),
        supabase.from('recruitment_jobs').select('status', { count: 'exact' }).eq('status', 'open'),
        supabase.from('performance_reviews').select('status', { count: 'exact' }).eq('status', 'draft'),
      ]);

      const activeCount = employeesResult.data?.filter(e => e.employment_status === 'active').length || 0;

      setStats({
        totalEmployees: employeesResult.count || 0,
        activeEmployees: activeCount,
        openPositions: jobsResult.count || 0,
        pendingReviews: reviewsResult.count || 0,
      });
    } catch (error) {
      logger.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-primary shadow-primary/40">
            <Users className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Human Resources</h1>
            <p className="text-slate-600 text-base">
              Manage your organization's workforce and talent
            </p>
            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-info"></div>
                <span className="text-slate-600">{stats.totalEmployees} Total Employees</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-success"></div>
                <span className="text-slate-600">{stats.activeEmployees} Active</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-warning"></div>
                <span className="text-slate-600">{stats.openPositions} Open Positions</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadStats}
            variant="secondary"
            disabled={loading}
            title="Refresh statistics"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <KpiRow
        cols="grid-cols-1 md:grid-cols-4"
        stats={[
          { label: 'Total Employees', value: stats.totalEmployees, tone: 'info', icon: Users, loading },
          { label: 'Active Employees', value: stats.activeEmployees, tone: 'success', icon: UserCheck, loading },
          { label: 'Open Positions', value: stats.openPositions, tone: 'warning', icon: Briefcase, loading },
          { label: 'Pending Reviews', value: stats.pendingReviews, tone: 'danger', icon: ClipboardList, loading },
        ]}
      />


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <UserPlus className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>
            </div>
            <div className="space-y-3">
              <a
                href="/hr/employees/new"
                className="block p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <h3 className="font-medium text-slate-900">Add New Employee</h3>
                <p className="text-sm text-slate-600 mt-1">Onboard a new team member</p>
              </a>
              <a
                href="/hr/recruitment"
                className="block p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <h3 className="font-medium text-slate-900">Post Job Opening</h3>
                <p className="text-sm text-slate-600 mt-1">Create a new recruitment listing</p>
              </a>
              <a
                href="/hr/performance"
                className="block p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <h3 className="font-medium text-slate-900">Schedule Review</h3>
                <p className="text-sm text-slate-600 mt-1">Set up performance evaluation</p>
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-6 h-6 text-success" />
              <h2 className="text-xl font-semibold text-slate-900">Recent Activity</h2>
            </div>
            <div className="text-center py-8 text-slate-500">
              <p>No recent activity</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
