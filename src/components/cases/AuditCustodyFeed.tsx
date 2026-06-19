import React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchCustodyFeed, formatActionType } from '../../lib/chainOfCustodyService';
import { formatDateTimeWithConfig } from '../../lib/format';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { Badge } from '../ui/Badge';

const PAGE_SIZE = 50;

interface Props { page: number; onPageChange: (p: number) => void; search: string; }

export const AuditCustodyFeed: React.FC<Props> = ({ page, onPageChange: _onPageChange, search }) => {
  const dt = useDateTimeConfig();
  const { data } = useQuery({
    queryKey: ['custody_feed', search, page],
    queryFn: () => fetchCustodyFeed({ page, pageSize: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  return (
    <div className="divide-y divide-slate-200">
      {rows.map((r) => (
        <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">{formatActionType(r.action)}</Badge>
            {r.case_no && (
              <Link to={`/cases/${r.case_id}`} className="text-sm font-medium text-primary">{r.case_no}</Link>
            )}
            <span className="text-sm text-slate-600">{r.actor_name ?? 'System'}</span>
            <span className="text-xs text-slate-400 ml-auto">{formatDateTimeWithConfig(r.created_at, dt)}</span>
          </div>
          {r.description && <p className="text-sm text-slate-600 break-words">{r.description}</p>}
        </div>
      ))}
    </div>
  );
};
