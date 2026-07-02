import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Settings,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/shared/EmptyState';
import { useListPageSize } from '../../hooks/useListPageSize';
import type { Database } from '../../types/database.types';

type NotificationRow = Database['public']['Tables']['notification_log']['Row'];

// Short relative-time formatter, shared shape with the bell dropdown so
// users see consistent time strings between the two surfaces.
function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

type ReadFilter = 'all' | 'unread' | 'read';
type ChannelFilter = 'all' | 'in_app' | 'email';

export function NotificationsHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const pageSize = useListPageSize();
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');

  const userId = user?.id;

  // Reset to page 1 whenever filters change — otherwise pagination
  // overshoots the new (smaller) result set and shows an empty page.
  const queryKey = useMemo(
    () => ['notifications-history', userId, page, pageSize, readFilter, channelFilter, search],
    [userId, page, pageSize, readFilter, channelFilter, search],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!userId) return { rows: [], total: 0 };
      let q = supabase
        .from('notification_log')
        .select('*', { count: 'exact' })
        .eq('recipient_user_id', userId)
        .is('dismissed_at', null);

      if (readFilter === 'unread') q = q.eq('is_read', false);
      if (readFilter === 'read') q = q.eq('is_read', true);
      if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
      if (search.trim()) {
        // ilike across title + body — server-side so pagination stays
        // honest. Empty search short-circuits this branch.
        const term = `%${sanitizeFilterValue(search.trim())}%`;
        q = q.or(`title.ilike.${term},body.ilike.${term}`);
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: rows, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { rows: (rows ?? []) as NotificationRow[], total: count ?? 0 };
    },
    enabled: Boolean(userId),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-history'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'in_app'] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_log')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_log')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('notification_log')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const handleRowClick = (n: NotificationRow) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.link_url) navigate(n.link_url);
  };

  const activeFilterCount =
    (readFilter !== 'all' ? 1 : 0) +
    (channelFilter !== 'all' ? 1 : 0) +
    (search.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
          {total > 0 && (
            <span className="text-sm text-slate-500">({total.toLocaleString()})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/settings/notifications')}
            className="flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            Preferences
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search title or body…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={readFilter}
                onChange={(e) => {
                  setReadFilter(e.target.value as ReadFilter);
                  setPage(0);
                }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>

              <select
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value as ChannelFilter);
                  setPage(0);
                }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary"
              >
                <option value="all">All channels</option>
                <option value="in_app">In-app</option>
                <option value="email">Email</option>
              </select>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReadFilter('all');
                    setChannelFilter('all');
                    setSearch('');
                    setPage(0);
                  }}
                  className="flex items-center gap-1"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Clear ({activeFilterCount})
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description={
              activeFilterCount > 0
                ? 'No notifications match your filters.'
                : "You're all caught up."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li
                key={n.id}
                className={`group px-4 py-3 hover:bg-slate-50 transition-colors ${
                  n.is_read ? '' : 'bg-info-muted/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleRowClick(n)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                      {n.title && (
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {n.title}
                        </span>
                      )}
                      <Badge variant="secondary" size="sm">
                        {n.channel}
                      </Badge>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {n.event_type}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{n.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{formatRelative(n.created_at)}</span>
                      {n.link_url && (
                        <span className="inline-flex items-center gap-0.5">
                          <ExternalLink className="w-2.5 h-2.5" />
                          opens linked item
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate(n.id)}
                        title="Mark as read"
                        className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => dismiss.mutate(n.id)}
                      title="Dismiss"
                      className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page + 1} of {totalPages} · {total.toLocaleString()} total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
