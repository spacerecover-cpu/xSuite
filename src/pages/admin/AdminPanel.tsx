import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/shared/StatCard';
import {
  Users,
  Activity,
  Database,
  FileText,
  Shield,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalLogs: number;
  recentErrors: number;
}

export const AdminPanel: React.FC = () => {
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalLogs: 0,
    recentErrors: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
  }, []);

  const fetchStats = async () => {
    try {
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: totalLogs } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { count: recentErrors } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', yesterday.toISOString());

      setStats({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalLogs: totalLogs || 0,
        recentErrors: recentErrors || 0,
      });
    } catch (error) {
      logger.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data: auditData, error: auditError } = await supabase
        .from('audit_trails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (auditError) throw auditError;

      if (auditData && auditData.length > 0) {
        const userIds = [...new Set(auditData.map(a => a.performed_by).filter((id): id is string => !!id))];

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);

        const profilesMap = new Map(
          (profilesData || []).map(p => [p.id, p])
        );

        const enrichedData = auditData.map(audit => ({
          ...audit,
          profiles: (audit.performed_by ? profilesMap.get(audit.performed_by) : null) || { full_name: 'Unknown' }
        }));

        setRecentActivity(enrichedData);
      } else {
        setRecentActivity([]);
      }
    } catch (error) {
      logger.error('Error fetching recent activity:', error);
    }
  };

  const quickActions = [
    {
      title: 'User Management',
      description: 'Manage user accounts and permissions',
      icon: Users,
      link: '/users',
      iconBg: 'bg-primary/10',
      iconText: 'text-primary',
    },
    {
      title: 'Role Permissions',
      description: 'Configure module access for roles',
      icon: Shield,
      link: '/admin/role-permissions',
      iconBg: 'bg-primary/10',
      iconText: 'text-primary',
    },
    {
      title: 'System Logs',
      description: 'View application logs and errors',
      icon: FileText,
      link: '/admin/logs',
      iconBg: 'bg-success-muted',
      iconText: 'text-success',
    },
    {
      title: 'Audit Trails',
      description: 'Track user actions and changes',
      icon: Shield,
      link: '/admin/audit',
      iconBg: 'bg-warning-muted',
      iconText: 'text-warning',
    },
    {
      title: 'Database Management',
      description: 'Backup and restore database',
      icon: Database,
      link: '/admin/database',
      iconBg: 'bg-accent',
      iconText: 'text-accent-foreground',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Admin Panel</h1>
        <p className="text-slate-600 mt-1">System administration and monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Users"
          value={String(stats.totalUsers)}
          icon={Users}
        />
        <StatCard
          label="Active Sessions"
          value={String(stats.activeUsers)}
          icon={Activity}
        />
        <StatCard
          label="System Logs"
          value={String(stats.totalLogs)}
          icon={FileText}
        />
        <StatCard
          label="Recent Errors"
          value={String(stats.recentErrors)}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.link}
                    to={action.link}
                    className="p-4 border border-slate-200 rounded-lg hover:border-primary/40 hover:shadow-md transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-lg ${action.iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <Icon className={`w-5 h-5 ${action.iconText}`} />
                    </div>
                    <h3 className="font-medium text-slate-900 mb-1">{action.title}</h3>
                    <p className="text-xs text-slate-500">{action.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
              <Link
                to="/admin/audit"
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                View All
              </Link>
            </div>
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{activity.profiles?.full_name || 'Unknown'}</span>
                      {' '}
                      {activity.action}d {activity.record_type}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <p className="text-xs text-slate-500">
                        {format(new Date(activity.created_at), 'MMM dd, HH:mm')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
