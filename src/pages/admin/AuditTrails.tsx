import React, { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { AuditCustodyFeed } from '../../components/cases/AuditCustodyFeed';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { Search, Eye, Edit, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useListPageSize } from '../../hooks/useListPageSize';

type BadgeTone = 'success' | 'info' | 'danger' | 'secondary';

// Static tone map so Tailwind JIT can see every chip class literally. Dynamic
// `bg-${color}-100` strings were stripped at build time, leaving invisible chips.
const ACTION_TONE: Record<string, { chip: string; badge: BadgeTone }> = {
  create: { chip: 'bg-success-muted', badge: 'success' },
  update: { chip: 'bg-info-muted', badge: 'info' },
  delete: { chip: 'bg-danger-muted', badge: 'danger' },
  view: { chip: 'bg-surface-muted', badge: 'secondary' },
};

interface AuditTrail {
  id: string;
  performed_by: string | null;
  action: string;
  record_type: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  performed_at: string;
  created_at: string;
  user_name?: string;
}

export const AuditTrails: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = useListPageSize();
  const [scope, setScope] = useState<'system' | 'custody'>('system');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [actionFilter, debouncedSearch, pageSize]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['audit_trails', actionFilter, debouncedSearch, page, pageSize],
    enabled: scope === 'system',
    queryFn: async () => {
      let query = supabase
        .from('audit_trails')
        .select(`
          *,
          profiles:performed_by (full_name)
        `, { count: 'exact' })
        .order('performed_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      if (debouncedSearch) {
        const s = sanitizeFilterValue(debouncedSearch);
        const orParts = [`record_type.ilike.%${s}%`, `action.ilike.%${s}%`];
        // user_name is the joined profiles.full_name; resolve matching actor ids
        // so "search by who" still works server-side across the full dataset.
        const { data: matchedProfiles } = await supabase
          .from('profiles')
          .select('id')
          .ilike('full_name', `%${s}%`);
        const ids = (matchedProfiles ?? []).map((p) => p.id);
        if (ids.length > 0) {
          orParts.push(`performed_by.in.(${ids.join(',')})`);
        }
        query = query.or(orParts.join(','));
      }

      const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;

      const formattedData: AuditTrail[] = (data || []).map((trail) => {
        const t = trail as unknown as AuditTrail & { profiles?: { full_name?: string } | null; ip_address: unknown };
        return {
          ...t,
          ip_address: typeof t.ip_address === 'string' ? t.ip_address : t.ip_address ? String(t.ip_address) : null,
          user_name: t.profiles?.full_name || 'Unknown User',
        };
      });
      return { rows: formattedData, total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const trails = data?.rows ?? [];
  const total = data?.total ?? 0;

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create':
        return <Plus className="w-4 h-4" />;
      case 'update':
        return <Edit className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      case 'view':
        return <Eye className="w-4 h-4" />;
      default:
        return <Eye className="w-4 h-4" />;
    }
  };

  const toolbar = (
    <div className="flex gap-4 items-center mb-6">
      <div className="flex gap-2">
        <Button variant={scope === 'system' ? 'primary' : 'secondary'} onClick={() => setScope('system')} className="text-sm">System</Button>
        <Button variant={scope === 'custody' ? 'primary' : 'secondary'} onClick={() => setScope('custody')} className="text-sm">Case Custody</Button>
      </div>
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          type="text"
          placeholder="Search audit trails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={actionFilter === 'all' ? 'primary' : 'secondary'}
          onClick={() => setActionFilter('all')}
          className="text-sm"
        >
          All
        </Button>
        <Button
          variant={actionFilter === 'create' ? 'primary' : 'secondary'}
          onClick={() => setActionFilter('create')}
          className="text-sm"
        >
          Create
        </Button>
        <Button
          variant={actionFilter === 'update' ? 'primary' : 'secondary'}
          onClick={() => setActionFilter('update')}
          className="text-sm"
        >
          Update
        </Button>
        <Button
          variant={actionFilter === 'delete' ? 'primary' : 'secondary'}
          onClick={() => setActionFilter('delete')}
          className="text-sm"
        >
          Delete
        </Button>
      </div>
    </div>
  );

  const table = (
    <div className="divide-y divide-slate-200">
      {trails.map((trail) => {
        const tone = ACTION_TONE[trail.action] ?? ACTION_TONE.view;
        return (
        <div key={trail.id} className="p-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-start gap-3">
            <div className={`mt-1 p-2 rounded-lg ${tone.chip}`}>
              {getActionIcon(trail.action)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-slate-900">{trail.user_name}</span>
                <Badge variant={tone.badge}>{trail.action}</Badge>
                <span className="text-sm text-slate-600">{trail.record_type}</span>
                <span className="text-xs text-slate-400 ml-auto">
                  {format(new Date(trail.performed_at), 'MMM dd, yyyy HH:mm:ss')}
                </span>
              </div>
              {trail.record_id && (
                <p className="text-xs text-slate-500">Record ID: {trail.record_id}</p>
              )}
              {trail.ip_address && (
                <p className="text-xs text-slate-500">IP: {trail.ip_address}</p>
              )}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );

  return (
    <ListPageTemplate
      title="Audit Trails"
      toolbar={toolbar}
      table={scope === 'custody' ? <AuditCustodyFeed page={page} onPageChange={setPage} search={debouncedSearch} /> : table}
      pager={{ page, pageSize, total, onPageChange: setPage, itemNoun: 'entries' }}
      loading={loading}
      isEmpty={!loading && trails.length === 0}
      empty={
        <div className="text-center py-12">
          <p className="text-slate-500">No audit trails found</p>
        </div>
      }
    />
  );
};
