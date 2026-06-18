import React, { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Pager } from '../../components/ui/Pager';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import type { BadgeVariant } from '../../lib/ui/variants';
import { Search, Download, AlertCircle, AlertTriangle, Info, Bug } from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

interface SystemLog {
  id: string;
  level: string;
  category: string | null;
  message: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

export const SystemLogs: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [levelFilter, debouncedSearch]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['system_logs', levelFilter, debouncedSearch, page],
    queryFn: async () => {
      let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (levelFilter !== 'all') {
        query = query.eq('level', levelFilter);
      }
      if (debouncedSearch) {
        const s = sanitizeFilterValue(debouncedSearch);
        query = query.or(`message.ilike.%${s}%,category.ilike.%${s}%`);
      }

      const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const normalized: SystemLog[] = (data || []).map((row) => ({
        id: row.id,
        level: row.level,
        category: row.category,
        message: row.message,
        user_id: row.user_id,
        details: (row.details && typeof row.details === 'object' && !Array.isArray(row.details))
          ? (row.details as Record<string, unknown>)
          : null,
        ip_address: row.ip_address == null
          ? null
          : typeof row.ip_address === 'string'
            ? row.ip_address
            : String(row.ip_address),
        created_at: row.created_at,
      }));
      return { rows: normalized, total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const logs = data?.rows ?? [];
  const total = data?.total ?? 0;

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'info':
        return <Info className="w-4 h-4" />;
      case 'debug':
        return <Bug className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  // Static, JIT-safe class strings keyed by level. Tailwind purges interpolated
  // classes (e.g. `bg-${color}-100`), so literal token classes are required.
  const LEVEL_CHIP_CLASS: Record<string, string> = {
    error: 'bg-danger-muted text-danger',
    warning: 'bg-warning-muted text-warning',
    info: 'bg-info-muted text-info',
    debug: 'bg-slate-100 text-slate-600',
  };

  const LEVEL_BADGE_VARIANT: Record<string, BadgeVariant> = {
    error: 'danger',
    warning: 'warning',
    info: 'info',
    debug: 'secondary',
  };

  const getLevelChipClass = (level: string) =>
    LEVEL_CHIP_CLASS[level] ?? 'bg-slate-100 text-slate-600';

  const getLevelBadgeVariant = (level: string): BadgeVariant =>
    LEVEL_BADGE_VARIANT[level] ?? 'secondary';

  const exportLogs = async () => {
    let query = supabase
      .from('system_logs')
      .select('created_at, level, category, message, ip_address')
      .order('created_at', { ascending: false });
    if (levelFilter !== 'all') {
      query = query.eq('level', levelFilter);
    }
    if (debouncedSearch) {
      const s = sanitizeFilterValue(debouncedSearch);
      query = query.or(`message.ilike.%${s}%,category.ilike.%${s}%`);
    }
    const { data, error } = await query;
    if (error) {
      logger.error('Error exporting logs:', error);
      return;
    }
    const csv = [
      ['Timestamp', 'Level', 'Category', 'Message', 'IP Address'].join(','),
      ...(data || []).map((log) =>
        [
          format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
          log.level,
          log.category ?? '',
          `"${String(log.message ?? '').replace(/"/g, '""')}"`,
          log.ip_address == null ? '' : String(log.ip_address),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">System Logs</h1>
            <p className="text-slate-600 mt-1">Application logs and events</p>
          </div>
          <Button onClick={exportLogs} className="gap-2" variant="secondary">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={levelFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setLevelFilter('all')}
              className="text-sm"
            >
              All
            </Button>
            <Button
              variant={levelFilter === 'error' ? 'primary' : 'secondary'}
              onClick={() => setLevelFilter('error')}
              className="text-sm"
            >
              Errors
            </Button>
            <Button
              variant={levelFilter === 'warning' ? 'primary' : 'secondary'}
              onClick={() => setLevelFilter('warning')}
              className="text-sm"
            >
              Warnings
            </Button>
            <Button
              variant={levelFilter === 'info' ? 'primary' : 'secondary'}
              onClick={() => setLevelFilter('info')}
              className="text-sm"
            >
              Info
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="divide-y divide-slate-200">
          {logs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-2 rounded-lg ${getLevelChipClass(log.level)}`}>
                  {getLevelIcon(log.level)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getLevelBadgeVariant(log.level)}>{log.level}</Badge>
                    {log.category && (
                      <span className="text-sm font-medium text-slate-900">{log.category}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{log.message}</p>
                  {log.ip_address && (
                    <p className="text-xs text-slate-500 mt-1">IP: {log.ip_address}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="divide-y divide-slate-200">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">No logs found</p>
          </div>
        )}

        {total > 0 && (
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemNoun="logs" />
        )}
      </div>
    </div>
  );
};
