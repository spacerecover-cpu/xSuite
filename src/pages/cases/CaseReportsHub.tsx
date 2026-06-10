import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Search,
  User,
  Calendar,
  Eye,
  Edit,
  FolderOpen,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { reportsService } from '../../lib/reportsService';
import { reportKeys } from '../../lib/queryKeys';
import {
  REPORT_TYPES,
  getReportTypeConfig,
  getReportStatusConfig,
  type ReportType,
  type ReportStatus,
  type Report,
} from '../../lib/reportTypes';
import { formatDate } from '../../lib/format';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import ReportViewModal from '../../components/cases/ReportViewModal';
import { ReportTypeSelectionModal } from '../../components/cases/ReportTypeSelectionModal';
import { StreamlinedReportEditor } from '../../components/cases/StreamlinedReportEditor';

type HubReport = Report & { case_number: string; case_title: string | null };

interface PickerCase {
  id: string;
  case_number: string;
  title: string | null;
  customer_name: string | null;
}

interface EditorContext {
  caseData: React.ComponentProps<typeof StreamlinedReportEditor>['caseData'];
  deviceData: React.ComponentProps<typeof StreamlinedReportEditor>['deviceData'];
}

async function fetchEditorContext(caseId: string): Promise<EditorContext> {
  const { data: caseRow, error } = await supabase
    .from('cases')
    .select(
      'id, case_no, case_number, title, created_at, customers_enhanced(customer_name), catalog_service_types(id, name)'
    )
    .eq('id', caseId)
    .maybeSingle();
  if (error) throw error;
  if (!caseRow) throw new Error('Case not found');

  const { data: device } = await supabase
    .from('case_devices')
    .select(
      'model, serial_number, symptoms, catalog_device_types(name), catalog_device_brands(name), catalog_device_capacities(name)'
    )
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    caseData: {
      case_no: caseRow.case_number ?? caseRow.case_no ?? '',
      title: caseRow.title ?? '',
      service_type: caseRow.catalog_service_types ?? undefined,
      customer: caseRow.customers_enhanced
        ? { first_name: caseRow.customers_enhanced.customer_name ?? '' }
        : undefined,
      created_at: caseRow.created_at,
    },
    deviceData: device
      ? {
          device_type: device.catalog_device_types?.name || '',
          brand: device.catalog_device_brands?.name || '',
          model: device.model || '',
          capacity: device.catalog_device_capacities?.name || '',
          serial_number: device.serial_number || '',
          symptoms: device.symptoms || '',
        }
      : undefined,
  };
}

export const CaseReportsHub: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
  const [latestOnly, setLatestOnly] = useState(true);
  const [search, setSearch] = useState('');

  const [viewReportId, setViewReportId] = useState<string | null>(null);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [pickedCase, setPickedCase] = useState<PickerCase | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [editorState, setEditorState] = useState<{
    caseId: string;
    reportType: ReportType;
    reportId?: string;
    existingReport?: { id: string; report_type?: string; [key: string]: unknown };
    context: EditorContext;
  } | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: reportKeys.hub({ typeFilter, statusFilter, latestOnly }),
    queryFn: () =>
      reportsService.listReports({
        reportType: typeFilter,
        status: statusFilter,
        latestOnly,
      }),
  });

  const filteredReports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter(
      (report) =>
        report.title.toLowerCase().includes(needle) ||
        report.report_number.toLowerCase().includes(needle) ||
        report.case_number.toLowerCase().includes(needle)
    );
  }, [reports, search]);

  const { data: pickerCases = [], isLoading: pickerLoading } = useQuery({
    queryKey: ['case-reports-hub', 'case-picker', caseSearch],
    queryFn: async (): Promise<PickerCase[]> => {
      let query = supabase
        .from('cases')
        .select('id, case_number, case_no, title, customers_enhanced(customer_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      const needle = caseSearch.trim().replace(/[,%()]/g, '');
      if (needle) {
        query = query.or(`case_number.ilike.%${needle}%,title.ilike.%${needle}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        case_number: row.case_number ?? row.case_no ?? '',
        title: row.title,
        customer_name: row.customers_enhanced?.customer_name ?? null,
      }));
    },
    enabled: showCasePicker,
  });

  const invalidateHub = () =>
    queryClient.invalidateQueries({ queryKey: reportKeys.all });

  const handlePickCase = (picked: PickerCase) => {
    setPickedCase(picked);
    setShowCasePicker(false);
    setShowTypeSelector(true);
  };

  const startEditor = async (
    caseId: string,
    reportType: ReportType,
    report?: HubReport
  ) => {
    try {
      const context = await fetchEditorContext(caseId);
      setEditorState({
        caseId,
        reportType,
        reportId: report?.id,
        existingReport: report ? { ...report } : undefined,
        context,
      });
    } catch (error) {
      logger.error('Error preparing report editor:', error);
      toast.error('Failed to load case data for the editor');
    }
  };

  const handleApprove = async (reportId: string) => {
    if (!user) return;
    await reportsService.approveReport(reportId, user.id);
    invalidateHub();
  };

  const handleSend = async (reportId: string) => {
    await reportsService.sendReportToCustomer(reportId);
    invalidateHub();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Case Reports</h1>
          <p className="mt-1 text-slate-600">
            Every report across your cases — create, review, approve, and deliver.
          </p>
        </div>
        <Button onClick={() => setShowCasePicker(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Report
        </Button>
      </div>

      <Card>
        <div className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, report number, or case number…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Report Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ReportType | 'all')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Types</option>
              {Object.values(REPORT_TYPES).map((type) => (
                <option key={type.key} value={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReportStatus | 'all')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <span className="text-sm text-slate-700">Latest versions only</span>
          </label>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium text-slate-900 mb-1">No reports found</p>
          <p className="text-sm text-slate-500 mb-4">
            Adjust the filters, or create a report for one of your cases.
          </p>
          <Button onClick={() => setShowCasePicker(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Report
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const typeConfig = getReportTypeConfig(report.report_type);
            const statusConfig = getReportStatusConfig(report.status);
            const TypeIcon = typeConfig.icon;
            return (
              <Card
                key={report.id}
                className="p-4 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4">
                  <TypeIcon
                    className="w-8 h-8 flex-shrink-0 mt-1"
                    style={{ color: typeConfig.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{report.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mt-0.5 flex-wrap">
                          <span>{report.report_number}</span>
                          {report.version_number > 1 && (
                            <Badge variant="secondary" size="sm">
                              v{report.version_number}
                            </Badge>
                          )}
                          <span className="text-slate-300">•</span>
                          <Link
                            to={`/cases/${report.case_id}`}
                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            {report.case_number}
                          </Link>
                          {report.case_title && (
                            <span className="text-slate-400 truncate">{report.case_title}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge style={{ backgroundColor: statusConfig.color, color: 'white' }}>
                          {statusConfig.label}
                        </Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewReportId(report.id)}
                          title="View report"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {report.status === 'draft' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startEditor(report.case_id, report.report_type, report)}
                            title="Edit report"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {report.created_by_profile?.full_name || 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(report.created_at)}
                      </span>
                      {report.approved_at && (
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      )}
                      {report.sent_to_customer_at && (
                        <span className="flex items-center gap-1 text-primary">
                          <Send className="w-3.5 h-3.5" />
                          Sent to customer
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewReportId && (
        <ReportViewModal
          isOpen={!!viewReportId}
          onClose={() => {
            setViewReportId(null);
            invalidateHub();
          }}
          reportId={viewReportId}
          onApprove={handleApprove}
          onSend={handleSend}
        />
      )}

      {showCasePicker && (
        <Modal
          isOpen={showCasePicker}
          onClose={() => setShowCasePicker(false)}
          title="Select a Case"
          icon={FolderOpen}
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder="Search by case number or title…"
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {pickerLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : pickerCases.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No matching cases</p>
              ) : (
                pickerCases.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handlePickCase(row)}
                    className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <span className="block text-sm font-medium text-slate-900">
                      {row.case_number}
                      {row.title ? ` — ${row.title}` : ''}
                    </span>
                    {row.customer_name && (
                      <span className="block text-xs text-slate-500">{row.customer_name}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}

      {showTypeSelector && pickedCase && (
        <ReportTypeSelectionModal
          isOpen={showTypeSelector}
          onClose={() => {
            setShowTypeSelector(false);
            setPickedCase(null);
          }}
          caseNumber={pickedCase.case_number}
          onSelectType={(type) => {
            setShowTypeSelector(false);
            void startEditor(pickedCase.id, type);
          }}
        />
      )}

      {editorState && (
        <StreamlinedReportEditor
          isOpen={!!editorState}
          onClose={() => setEditorState(null)}
          reportType={editorState.reportType}
          caseId={editorState.caseId}
          caseData={editorState.context.caseData}
          deviceData={editorState.context.deviceData}
          reportId={editorState.reportId}
          existingReport={editorState.existingReport}
          onSuccess={() => {
            setEditorState(null);
            setPickedCase(null);
            invalidateHub();
            toast.success('Report saved');
          }}
        />
      )}
    </div>
  );
};
