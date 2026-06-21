import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { FileText, DollarSign, MessageSquare, Clock } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { fetchPortalVisibility, getVisibleCaseIds, getCaseIdsWithFlag } from '../../lib/portalVisibility';

export const PortalDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t('portal.dashboard.tabTitle');
  }, [t]);

  const { data: casePriorities = [] } = useQuery({
    queryKey: ['case_priorities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_priorities')
        .select('name, color')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: visibility = [] } = useQuery({
    queryKey: ['portal_visibility', customer?.id],
    queryFn: () => fetchPortalVisibility(customer!.id),
    enabled: !!customer?.id,
  });

  const visibleCaseIds = React.useMemo(() => getVisibleCaseIds(visibility), [visibility]);
  const quoteVisibleCaseIds = React.useMemo(
    () => getCaseIdsWithFlag(visibility, 'show_quotes'),
    [visibility]
  );

  const {
    data: casesStats,
    isError: casesStatsError,
    refetch: refetchCasesStats,
  } = useQuery({
    queryKey: ['portal_cases_stats', customer?.id, visibleCaseIds.join(',')],
    queryFn: async () => {
      if (visibleCaseIds.length === 0) return { total: 0, active: 0, completed: 0 };

      const { data, error } = await supabase
        .from('cases')
        .select('id, status')
        .in('id', visibleCaseIds);

      if (error) throw error;

      const rows = data ?? [];
      const total = rows.length;
      const active = rows.filter((c) =>
        ['received', 'diagnosis', 'in-progress', 'in_progress', 'waiting-approval'].includes(c.status || '')
      ).length;
      const completed = rows.filter((c) => ['completed', 'delivered'].includes(c.status || '')).length;

      return { total, active, completed };
    },
    enabled: !!customer?.id,
  });

  const {
    data: recentCases = [],
    isError: recentCasesError,
    refetch: refetchRecentCases,
  } = useQuery({
    queryKey: ['portal_recent_cases', customer?.id, visibleCaseIds.join(',')],
    queryFn: async () => {
      if (visibleCaseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, title, status, priority, created_at')
        .in('id', visibleCaseIds)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customer?.id,
  });

  const {
    data: pendingQuotes = [],
    isError: pendingQuotesError,
    refetch: refetchPendingQuotes,
  } = useQuery({
    queryKey: ['portal_pending_quotes', customer?.id, quoteVisibleCaseIds.join(',')],
    queryFn: async () => {
      if (quoteVisibleCaseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('case_quotes')
        .select(`
          id,
          quote_number,
          total_amount,
          status,
          valid_until,
          case_id,
          cases!inner(case_no, title)
        `)
        .in('case_id', quoteVisibleCaseIds)
        .eq('status', 'pending_approval')
        .is('deleted_at', null);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customer?.id,
  });

  const getPriorityColor = (priority: string | null) => {
    if (!priority) return '#64748b';
    const priorityItem = casePriorities.find(
      p => p.name.toLowerCase() === priority.toLowerCase()
    );
    return priorityItem?.color || '#64748b';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {t('portal.dashboard.welcomeBack', { name: customer?.customer_name })}
        </h1>
        <p className="text-slate-600">
          {t('portal.dashboard.subtitle')}
        </p>
      </div>

      {(casesStatsError || recentCasesError || pendingQuotesError) && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm"
        >
          <p className="text-danger">{t('portal.dashboard.loadError')}</p>
          <button
            onClick={() => {
              if (casesStatsError) refetchCasesStats();
              if (recentCasesError) refetchRecentCases();
              if (pendingQuotesError) refetchPendingQuotes();
            }}
            className="mt-2 text-primary underline"
          >
            {t('portal.dashboard.retry')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('portal.dashboard.totalCases')}</p>
              <p className="text-3xl font-bold text-slate-900">{casesStats?.total || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cat-4 to-cat-4/80 flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('portal.dashboard.activeCases')}</p>
              <p className="text-3xl font-bold text-slate-900">{casesStats?.active || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cat-3 to-cat-3/80 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">{t('portal.dashboard.pendingQuotes')}</p>
              <p className="text-3xl font-bold text-slate-900">{pendingQuotes.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {pendingQuotes.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">{t('portal.dashboard.quotesAwaitingResponse')}</h2>
            <Badge variant="warning">
              {pendingQuotes.length} {t('portal.dashboard.pending')}
            </Badge>
          </div>
          <div className="space-y-3">
            {pendingQuotes.map((quote) => {
              const casesField = (quote as { cases?: unknown }).cases;
              const caseRel = Array.isArray(casesField)
                ? (casesField[0] as { case_no: string | null; title: string | null } | undefined)
                : (casesField as { case_no: string | null; title: string | null } | null | undefined);
              return (
                <div
                  key={quote.id}
                  onClick={() => navigate('/portal/quotes')}
                  className="p-4 bg-warning-muted border-2 border-warning/30 rounded-lg cursor-pointer hover:border-warning/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-900">{caseRel?.title ?? quote.quote_number}</p>
                      <p className="text-sm text-slate-600">{quote.quote_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(Number(quote.total_amount) || 0)}
                      </p>
                      {quote.valid_until && (
                        <p className="text-xs text-slate-500">
                          {t('portal.dashboard.validUntil', { date: formatDate(quote.valid_until) })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-warning" aria-hidden="true" />
                    <span className="text-sm text-warning">{t('portal.dashboard.responseRequired')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('portal.dashboard.recentCases')}</h2>
          {recentCases.length > 0 && (
            <button
              onClick={() => navigate('/portal/cases')}
              className="text-sm font-medium text-primary hover:text-primary/80"
            >
              {t('portal.dashboard.viewAll')}
            </button>
          )}
        </div>

        {recentCases.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" aria-hidden="true" />
            <p className="text-slate-600">{t('portal.dashboard.noCasesFound')}</p>
            <p className="text-sm text-slate-500 mt-2">
              {t('portal.dashboard.noCasesSubtitle')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentCases.map((caseItem) => (
              <div
                key={caseItem.id}
                onClick={() => navigate('/portal/cases')}
                className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-primary/50 cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900">{caseItem.title}</p>
                      <Badge variant="custom" color={getPriorityColor(caseItem.priority)} size="sm">
                        {caseItem.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{caseItem.case_no}</p>
                  </div>
                  <Badge variant={statusToBadgeVariant(caseItem.status ?? '')}>
                    {caseItem.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">{t('portal.dashboard.createdDate', { date: formatDate(caseItem.created_at) })}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
