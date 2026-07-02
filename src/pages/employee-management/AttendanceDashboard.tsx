import React, { useEffect, useState } from 'react';
import { Calendar, Users, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

export const AttendanceDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('attendance_date', today);

      if (error) throw error;

      const present = data?.filter(a => a.status === 'present').length || 0;
      const absent = data?.filter(a => a.status === 'absent').length || 0;
      const late = data?.filter(a => a.status === 'late').length || 0;
      const onLeave = data?.filter(a => a.status === 'on_leave').length || 0;

      setStats({ present, absent, late, onLeave });
    } catch (error) {
      logger.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Attendance Management"
        icon={Calendar}
        actions={
          <Button
            onClick={loadStats}
            variant="secondary"
            size="sm"
            disabled={loading}
            title="Refresh attendance"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      <KpiRow
        cols="grid-cols-1 md:grid-cols-4"
        stats={[
          { label: 'Present', value: stats.present, tone: 'success', icon: Users, loading },
          { label: 'Absent', value: stats.absent, tone: 'danger', icon: AlertCircle, loading },
          { label: 'Late', value: stats.late, tone: 'warning', icon: Clock, loading },
          { label: 'On Leave', value: stats.onLeave, tone: 'info', icon: Calendar, loading },
        ]}
      />


      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Today's Attendance</h2>
              <Badge color="blue">{format(new Date(), 'EEEE')}</Badge>
            </div>
            <div className="text-center py-12 text-slate-500">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p>No attendance records for today</p>
              <p className="text-sm mt-2">Mark attendance to see employee check-in/check-out times</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
