import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Search, Eye, Edit, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

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
  const [trails, setTrails] = useState<AuditTrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    fetchTrails();
  }, [actionFilter]);

  const fetchTrails = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_trails')
        .select(`
          *,
          profiles:performed_by (full_name)
        `)
        .order('performed_at', { ascending: false })
        .limit(100);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedData = (data || []).map((trail) => {
        const t = trail as unknown as AuditTrail & { profiles?: { full_name?: string } | null; ip_address: unknown };
        return {
          ...t,
          ip_address: typeof t.ip_address === 'string' ? t.ip_address : t.ip_address ? String(t.ip_address) : null,
          user_name: t.profiles?.full_name || 'Unknown User',
        };
      });

      setTrails(formattedData);
    } catch (error) {
      logger.error('Error fetching audit trails:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrails = trails.filter((trail) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      trail.user_name?.toLowerCase().includes(searchLower) ||
      trail.record_type.toLowerCase().includes(searchLower) ||
      trail.action.toLowerCase().includes(searchLower)
    );
  });

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Audit Trails</h1>
            <p className="text-slate-600 mt-1">User activity and data changes</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
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
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="divide-y divide-slate-200">
          {filteredTrails.map((trail) => {
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

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        )}

        {!loading && filteredTrails.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">No audit trails found</p>
          </div>
        )}
      </div>
    </div>
  );
};
