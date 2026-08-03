import React, { useEffect, useState } from 'react';
import { Users, Briefcase, UserPlus, UserCheck, ClipboardList, Calendar, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { logger } from '../../lib/logger';

export const HRDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    openPositions: 0,
    pendingReviews: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Every tile is a head-only exact count. Deriving the active count by
      // filtering a returned row set would cap it at the PostgREST page size
      // while Total Employees used the exact count — two tiles, two populations.
      const [employeesResult, activeResult, jobsResult, reviewsResult] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('employment_status', 'active').is('deleted_at', null),
        supabase.from('recruitment_jobs').select('id', { count: 'exact', head: true }).eq('status', 'open').is('deleted_at', null),
        supabase.from('performance_reviews').select('id', { count: 'exact', head: true }).eq('status', 'draft').is('deleted_at', null),
      ]);

      // supabase-js resolves rather than throws, so an unchecked error would
      // render 0 as if it were a real count.
      const failed = [employeesResult, activeResult, jobsResult, reviewsResult].find(r => r.error);
      if (failed?.error) throw failed.error;

      setStats({
        totalEmployees: employeesResult.count ?? 0,
        activeEmployees: activeResult.count ?? 0,
        openPositions: jobsResult.count ?? 0,
        pendingReviews: reviewsResult.count ?? 0,
      });
      setLoadError(null);
    } catch (error) {
      logger.error('Error loading stats:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load HR statistics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Human Resources"
        icon={Users}
        actions={
          <Button
            onClick={loadStats}
            variant="secondary"
            size="sm"
            disabled={loading}
            title="Refresh statistics"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">Statistics unavailable</p>
            <p className="mt-0.5 text-sm text-slate-600">{loadError}</p>
          </div>
        </div>
      )}

      <KpiRow
        cols="grid-cols-1 md:grid-cols-4"
        stats={[
          { label: 'Total Employees', value: loadError ? '—' : stats.totalEmployees, tone: 'info', icon: Users, loading },
          { label: 'Active Employees', value: loadError ? '—' : stats.activeEmployees, tone: 'success', icon: UserCheck, loading },
          { label: 'Open Positions', value: loadError ? '—' : stats.openPositions, tone: 'warning', icon: Briefcase, loading },
          { label: 'Pending Reviews', value: loadError ? '—' : stats.pendingReviews, tone: 'danger', icon: ClipboardList, loading },
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
                href="/hr/employees"
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
