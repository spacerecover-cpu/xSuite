import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { getReportStatusConfig, type ReportStatus } from '../../lib/reportTypes';
import { reportPDFService } from '../../lib/reportPDFService';
import { format } from 'date-fns';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { logger } from '../../lib/logger';
import { fetchPortalVisibility, getCaseIdsWithFlag } from '../../lib/portalVisibility';

interface PortalReport {
  id: string;
  report_number: string;
  title: string;
  status: string;
  generated_at: string | null;
  generated_by: string | null;
  created_at: string;
  created_by: string | null;
  case_id: string;
  cases: {
    case_number: string;
  } | { case_number: string }[];
}

function getCaseNumber(report: PortalReport): string {
  const c = report.cases;
  if (Array.isArray(c)) return c[0]?.case_number ?? '';
  return c?.case_number ?? '';
}

export default function PortalReports() {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('portal.reports.tabTitle');
  }, [t]);

  const { data: visibility = [] } = useQuery({
    queryKey: ['portal_visibility', customer?.id],
    queryFn: () => fetchPortalVisibility(customer!.id),
    enabled: !!customer?.id,
  });

  const reportVisibleCaseIds = React.useMemo(
    () => getCaseIdsWithFlag(visibility, 'show_reports'),
    [visibility]
  );

  const { data: reports = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portal_reports', customer?.id, reportVisibleCaseIds.join(',')],
    queryFn: async () => {
      if (reportVisibleCaseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('case_reports')
        .select(`
          id,
          report_number,
          title,
          status,
          generated_at,
          generated_by,
          created_at,
          created_by,
          case_id,
          cases!inner(case_number)
        `)
        .in('case_id', reportVisibleCaseIds)
        // Customers only ever see released reports: the send action sets
        // status='sent' + content.visible_to_customer=true (reportsService).
        .in('status', ['approved', 'sent'])
        .eq('content->>visible_to_customer', 'true')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []) as unknown as PortalReport[];
    },
    enabled: !!customer,
  });

  const handleView = (reportId: string) => {
    setViewingReportId(reportId);
  };

  const handleDownload = async (report: PortalReport) => {
    try {
      setDownloadingReportId(report.id);
      await reportPDFService.downloadReportPDF(report.id);
      await refetch();
    } catch (error) {
      logger.error('Error downloading report:', error);
      alert(t('portal.reports.failedToDownload'));
    } finally {
      setDownloadingReportId(null);
    }
  };

  const groupedReports = reports.reduce((acc, report) => {
    const caseNumber = getCaseNumber(report) || 'Unknown';
    if (!acc[caseNumber]) acc[caseNumber] = [];
    acc[caseNumber].push(report);
    return acc;
  }, {} as Record<string, PortalReport[]>);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('portal.reports.heading')}</h1>
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3 w-1/4 bg-slate-200 rounded" />
                  <div className="h-3 w-1/2 bg-slate-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('portal.reports.heading')}</h1>
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger">{t('portal.reports.loadError')}</p>
          <button onClick={() => refetch()} className="mt-2 text-primary underline">{t('portal.reports.retry')}</button>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('portal.reports.heading')}</h1>
        </div>
        <Card>
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" aria-hidden="true" />
            <p className="text-gray-500 mb-2">{t('portal.reports.noReportsAvailable')}</p>
            <p className="text-sm text-gray-400">{t('portal.reports.noReportsSubtitle')}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('portal.reports.heading')}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t('portal.reports.subtitle')}
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {t(reports.length === 1 ? 'portal.reports.count_one' : 'portal.reports.count_other', { count: reports.length })}
        </div>
      </div>

      {Object.entries(groupedReports).map(([caseNumber, caseReports]) => (
        <Card key={caseNumber}>
          <div className="mb-4 pb-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t('portal.reports.caseLabel', { caseNumber })}</h2>
          </div>

          <div className="space-y-3">
            {caseReports.map((report) => {
              const status = (['draft', 'review', 'approved', 'sent'] as const).includes(
                report.status as ReportStatus
              )
                ? (report.status as ReportStatus)
                : 'draft';
              const statusConfig = getReportStatusConfig(status);

              return (
                <div
                  key={report.id}
                  className="p-4 border border-gray-200 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">{report.title}</h3>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                          <span className="font-mono">{report.report_number}</span>
                          <Badge style={{ backgroundColor: statusConfig.color, color: 'white' }}>
                            {statusConfig.label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {report.generated_at && (
                            <span>
                              {t('portal.reports.generated', { date: format(new Date(report.generated_at), 'MMM dd, yyyy') })}
                            </span>
                          )}
                          {!report.generated_at && (
                            <span>
                              {t('portal.reports.created', { date: format(new Date(report.created_at), 'MMM dd, yyyy') })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleView(report.id)}
                      >
                        <Eye className="w-4 h-4 mr-1" aria-hidden="true" />
                        {t('portal.reports.view')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(report)}
                        disabled={downloadingReportId === report.id}
                      >
                        <Download className="w-4 h-4 mr-1" aria-hidden="true" />
                        {downloadingReportId === report.id ? t('portal.reports.downloading') : t('portal.reports.pdf')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {viewingReportId && (
        <PortalReportViewModal
          reportId={viewingReportId}
          onClose={() => setViewingReportId(null)}
        />
      )}
    </div>
  );
}

interface PortalReportViewModalProps {
  reportId: string;
  onClose: () => void;
}

interface ReportData {
  id: string;
  title: string;
  report_number: string;
}

interface ReportSection {
  id: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
}

function PortalReportViewModal({ reportId, onClose }: PortalReportViewModalProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<ReportData | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const loadReport = async () => {
    try {
      setLoading(true);

      const [reportRes, sectionsRes] = await Promise.all([
        supabase
          .from('case_reports')
          .select('id, title, report_number')
          .eq('id', reportId)
          .maybeSingle(),
        supabase
          .from('case_report_sections')
          .select('id, title, content, sort_order')
          .eq('report_id', reportId)
          .order('sort_order'),
      ]);

      if (reportRes.data) setReport(reportRes.data as ReportData);
      if (sectionsRes.data) setSections(sectionsRes.data ?? []);
    } catch (error) {
      logger.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !report) {
    return (
      <Modal isOpen={true} onClose={onClose} title={t('portal.reports.loadingReport')} maxWidth="4xl">
        <div className="text-center py-8 text-slate-500">{t('portal.reports.loadingReport')}</div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={report.title}
      maxWidth="4xl"
      icon={FileText}
      headerBadges={<span className="text-sm text-slate-500">{report.report_number}</span>}
    >
      <div className="space-y-6">
        {sections.map((section) => {
          const safeHtml = sanitizeHtml(section.content || t('portal.reports.noContent'));
          return (
            <div key={section.id} className="border-l-4 border-primary pl-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">{section.title ?? t('portal.reports.section')}</h3>
              <div
                className="prose max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t flex justify-end">
        <Button onClick={onClose}>{t('portal.reports.close')}</Button>
      </div>
    </Modal>
  );
}
