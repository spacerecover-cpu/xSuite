import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatDate } from '../../lib/format';

interface CustomerCasesTabProps {
  // Either a customer or company id. The page sets exactly one.
  customerId?: string;
  companyId?: string;
}

interface CaseRow {
  id: string;
  case_no: string | null;
  case_number: string | null;
  title: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, 'danger' | 'warning' | 'info' | 'secondary'> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

function statusVariant(status: string | null): 'success' | 'warning' | 'info' | 'secondary' | 'danger' {
  if (!status) return 'secondary';
  const s = status.toLowerCase();
  if (s.includes('deliver') || s.includes('complete')) return 'success';
  if (s.includes('cancel')) return 'danger';
  if (s.includes('quot') || s.includes('approv') || s.includes('await')) return 'warning';
  if (s.includes('progress') || s.includes('recover') || s.includes('diagnos')) return 'info';
  return 'secondary';
}

export function CustomerCasesTab({ customerId, companyId }: CustomerCasesTabProps) {
  const navigate = useNavigate();
  const filterCol = customerId ? 'customer_id' : 'company_id';
  const filterVal = customerId ?? companyId ?? '';

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['profile-cases', filterCol, filterVal],
    queryFn: async (): Promise<CaseRow[]> => {
      if (!filterVal) return [];
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, case_number, title, subject, status, priority, created_at')
        .eq(filterCol, filterVal)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
    enabled: Boolean(filterVal),
  });

  // Status buckets for the summary strip. The "open" bucket is anything not
  // delivered/completed/cancelled — covers the long tail of in-flight states.
  const summary = (() => {
    let open = 0;
    let delivered = 0;
    let cancelled = 0;
    for (const c of cases) {
      const s = (c.status ?? '').toLowerCase();
      if (s.includes('cancel')) cancelled++;
      else if (s.includes('deliver') || s.includes('complete')) delivered++;
      else open++;
    }
    return { open, delivered, cancelled };
  })();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <div className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-lg">No cases yet</p>
        <p className="text-sm mt-2">
          Cases created for this {customerId ? 'customer' : 'company'} will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Total Cases</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{cases.length}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Open</p>
            <p className="text-2xl font-bold text-info mt-1">{summary.open}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Delivered</p>
            <p className="text-2xl font-bold text-success mt-1">{summary.delivered}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Cancelled</p>
            <p className="text-2xl font-bold text-slate-500 mt-1">{summary.cancelled}</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-slate-900">Case History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Case #</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Title</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Priority</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
                  <th className="text-right pb-3 text-xs font-semibold text-slate-600 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <td className="py-3 font-mono text-primary">
                      {c.case_number || c.case_no || '—'}
                    </td>
                    <td className="py-3 text-slate-900 max-w-md truncate">
                      {c.title || c.subject || 'Untitled'}
                    </td>
                    <td className="py-3">
                      {c.priority ? (
                        <Badge
                          variant={PRIORITY_COLORS[c.priority.toLowerCase()] ?? 'secondary'}
                          size="sm"
                        >
                          {c.priority}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3">
                      <Badge variant={statusVariant(c.status)} size="sm">
                        {c.status ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(c.created_at)}</td>
                    <td className="py-3 text-right">
                      <ExternalLink className="w-4 h-4 text-slate-400 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
