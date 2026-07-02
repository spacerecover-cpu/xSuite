import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FileText, Package, Clock, CheckCircle, XCircle, Info } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { fetchPortalVisibility, getVisibleCaseIds } from '../../lib/portalVisibility';

interface Case {
  id: string;
  case_no: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  estimated_completion: string | null;
  created_at: string;
  updated_at: string;
}

interface CaseDevice {
  id: string;
  model: string | null;
  serial_number: string | null;
  symptoms: string | null;
  diagnosis: string | null;
}

interface CaseHistory {
  id: string;
  action: string;
  details: string | null;
  created_at: string;
}

export const PortalCases: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    document.title = t('portal.cases.tabTitle');
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

  const { data: cases = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portal_cases', customer?.id, visibleCaseIds.join(',')],
    queryFn: async () => {
      if (visibleCaseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, title, description, status, priority, estimated_completion, created_at, updated_at')
        .in('id', visibleCaseIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Case[];
    },
    enabled: !!customer?.id,
  });

  const { data: caseVisibility = null } = useQuery({
    queryKey: ['portal_case_visibility', selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase?.id) return null;
      const { data, error } = await supabase
        .from('case_portal_visibility')
        .select('custom_message')
        .eq('case_id', selectedCase.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCase?.id,
  });

  const { data: caseDevices = [] } = useQuery<CaseDevice[]>({
    queryKey: ['portal_case_devices', selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase?.id) return [];

      const { data, error } = await supabase
        .from('case_devices')
        .select('id, model, serial_number, symptoms, diagnosis')
        .eq('case_id', selectedCase.id);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCase?.id,
  });

  const { data: caseHistory = [] } = useQuery<CaseHistory[]>({
    queryKey: ['portal_case_history', selectedCase?.id],
    queryFn: async () => {
      if (!selectedCase?.id) return [];

      const { data, error } = await supabase
        .from('case_job_history')
        .select('id, action, details, created_at')
        .eq('case_id', selectedCase.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedCase?.id,
  });

  const getPriorityColor = (priority: string | null | undefined) => {
    if (!priority) return '#64748b';
    const priorityItem = casePriorities.find(
      p => p.name.toLowerCase() === priority.toLowerCase()
    );
    return priorityItem?.color || '#64748b';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return <CheckCircle className="w-5 h-5" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const handleViewDetails = (caseItem: Case) => {
    setSelectedCase(caseItem);
    setIsDetailModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.cases.heading')}</h1>
          <p className="text-slate-600">{t('portal.cases.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3 w-1/5 bg-slate-200 rounded" />
                  <div className="h-3 w-3/4 bg-slate-200 rounded" />
                </div>
                <div className="h-6 w-20 bg-slate-200 rounded" />
              </div>
              <div className="h-3 w-1/2 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('portal.cases.heading')}</h1>
        <p className="text-slate-600">
          {t('portal.cases.subtitle')}
        </p>
      </div>

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm"
        >
          <p className="text-danger">{t('portal.cases.loadError')}</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">{t('portal.cases.retry')}</button>
        </div>
      )}

      {cases.length === 0 && !isError ? (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" aria-hidden="true" />
          <p className="text-lg text-slate-600 mb-2">{t('portal.cases.noCasesFound')}</p>
          <p className="text-sm text-slate-500">
            {t('portal.cases.noCasesSubtitle')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {cases.map((caseItem) => (
            <Card
              key={caseItem.id}
              className="p-6 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
              onClick={() => handleViewDetails(caseItem)}
              role="button"
              tabIndex={0}
              aria-label={t('portal.cases.openCase', { caseNo: caseItem.case_no })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleViewDetails(caseItem);
                }
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{caseItem.title}</h3>
                    <Badge variant="custom" color={getPriorityColor(caseItem.priority)} size="sm">
                      {caseItem.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{caseItem.case_no}</p>
                  {caseItem.description && (
                    <p className="text-sm text-slate-700 mb-3">{caseItem.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(caseItem.status)}
                  <Badge variant={statusToBadgeVariant(caseItem.status)}>
                    {caseItem.status}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-4">
                  <span>{t('portal.cases.createdDate', { date: formatDate(caseItem.created_at) })}</span>
                  {caseItem.estimated_completion && (
                    <span>{t('portal.cases.dueDate', { date: formatDate(caseItem.estimated_completion) })}</span>
                  )}
                </div>
                <span className="text-primary font-medium">{t('portal.cases.viewDetails')}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={t('portal.cases.caseDetails')}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailModalOpen(false)}>{t('ui.close')}</Button>
          </div>
        }
      >
        {selectedCase && (
          <div className="space-y-6">
            {caseVisibility?.custom_message && (
              <div className="flex items-start gap-3 p-4 bg-info-muted border border-info/30 rounded-lg">
                <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-sm text-slate-800 whitespace-pre-wrap">
                  {caseVisibility.custom_message}
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-slate-900">{selectedCase.title}</h2>
                <Badge variant={statusToBadgeVariant(selectedCase.status)}>
                  {selectedCase.status}
                </Badge>
                <Badge variant="custom" color={getPriorityColor(selectedCase.priority)} size="sm">
                  {selectedCase.priority}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 mb-2">{selectedCase.case_no}</p>
              {selectedCase.description && (
                <p className="text-slate-700">{selectedCase.description}</p>
              )}
            </div>

            {caseDevices.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {t('portal.cases.devices')}
                </h3>
                <div className="space-y-3">
                  {caseDevices.map((device) => (
                    <div key={device.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {device.model && (
                          <div>
                            <span className="text-slate-500">{t('portal.cases.deviceModel')}</span>
                            <span className="ml-2 font-medium text-slate-900">{device.model}</span>
                          </div>
                        )}
                        {device.serial_number && (
                          <div>
                            <span className="text-slate-500">{t('portal.cases.deviceSerial')}</span>
                            <span className="ml-2 font-medium text-slate-900">{device.serial_number}</span>
                          </div>
                        )}
                      </div>
                      {device.symptoms && (
                        <p className="text-sm text-slate-600 mt-2">{device.symptoms}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {caseHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  {t('portal.cases.statusHistory')}
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {caseHistory.map((history) => (
                    <div key={history.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{history.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">{formatDate(history.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-200">
              <div>
                <p className="text-slate-500 mb-1">{t('portal.cases.createdLabel')}</p>
                <p className="font-medium text-slate-900">{formatDate(selectedCase.created_at)}</p>
              </div>
              {selectedCase.estimated_completion && (
                <div>
                  <p className="text-slate-500 mb-1">{t('portal.cases.dueDateLabel')}</p>
                  <p className="font-medium text-slate-900">{formatDate(selectedCase.estimated_completion)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
