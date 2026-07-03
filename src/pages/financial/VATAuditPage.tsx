import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate, formatTaxRatePercent } from '../../lib/format';
import { useCurrency } from '../../hooks/useCurrency';
import { useConfirm } from '../../hooks/useConfirm';
import { useTaxConfig, useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { tenantToday, addMonthsIso } from '../../lib/tenantToday';
import { Input } from '../../components/ui/Input';
import { VATReturnModal } from '../../components/financial/VATReturnModal';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import {
  createVATReturn,
  updateVATReturnStatus,
  fetchVATRecords,
  fetchVATReturns,
  getVATStats,
} from '../../lib/vatService';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import {
  FileCheck,
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Calculator,
  Calendar,
  Download,
  Eye,
  AlertCircle,
  Send,
  CheckCircle,
} from 'lucide-react';

interface VATRecord {
  id: string;
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
  tax_period?: string | null;
  created_at: string;
}

interface VATReturn {
  id: string;
  period_start: string;
  period_end: string;
  output_vat: number;
  input_vat: number;
  net_vat: number;
  status: string;
  submitted_at?: string;
}

interface AuditLog {
  id: string;
  record_type: string;
  record_id: string;
  action: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  performed_by?: string;
  performed_at: string;
}

export const VATAuditPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const confirm = useConfirm();
  const taxConfig = useTaxConfig();
  const { timezone } = useDateTimeConfig();
  const [activeTab, setActiveTab] = useState<'vat' | 'audit'>('vat');
  const [searchTerm, setSearchTerm] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('month');
  const [showVATReturnModal, setShowVATReturnModal] = useState(false);

  const getDateFromFilter = () => {
    if (dateRange === 'all') return undefined;
    const today = tenantToday(timezone);
    switch (dateRange) {
      case 'month':   return addMonthsIso(today, -1);
      case 'quarter': return addMonthsIso(today, -3);
      case 'year':    return addMonthsIso(today, -12);
      default:        return undefined;
    }
  };

  const { data: vatRecords = [], isLoading: vatLoading } = useQuery({
    queryKey: ['vat_records', recordTypeFilter, dateRange],
    queryFn: async () => {
      const data = await fetchVATRecords({
        recordType: recordTypeFilter !== 'all' ? recordTypeFilter : undefined,
        dateFrom: getDateFromFilter(),
      });
      return (data || []) as VATRecord[];
    },
  });

  const { data: vatReturns = [] } = useQuery({
    queryKey: ['vat_returns'],
    queryFn: async () => {
      const data = await fetchVATReturns();
      return (data || []) as VATReturn[];
    },
  });

  const { data: _vatStats } = useQuery({
    queryKey: ['vat_stats'],
    queryFn: () => getVATStats(),
  });

  const createVATReturnMutation = useMutation({
    mutationFn: (data: {
      period_start: string;
      period_end: string;
      output_vat: number;
      input_vat: number;
      net_vat: number;
      status: 'draft' | 'review';
    }) => createVATReturn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat_returns'] });
      queryClient.invalidateQueries({ queryKey: ['vat_stats'] });
      setShowVATReturnModal(false);
    },
  });

  const submitVATReturnMutation = useMutation({
    mutationFn: (id: string) => updateVATReturnStatus(id, 'submitted'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat_returns'] });
    },
  });

  const markVATPaidMutation = useMutation({
    mutationFn: (id: string) => updateVATReturnStatus(id, 'paid'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat_returns'] });
    },
  });

  const handleSubmitReturn = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({
      title: 'Submit VAT return?',
      message: 'Submit this VAT return? This action cannot be undone.',
      tone: 'default',
    })) {
      await submitVATReturnMutation.mutateAsync(id);
    }
  };

  const handleMarkPaid = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({
      title: 'Mark VAT return as paid?',
      message: 'Mark this VAT return as paid?',
      tone: 'default',
    })) {
      await markVATPaidMutation.mutateAsync(id);
    }
  };

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['financial_audit_logs', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('financial_audit_logs')
        .select(`
          id,
          record_type,
          record_id,
          action,
          old_values,
          new_values,
          performed_by,
          performed_at
        `)
        .order('performed_at', { ascending: false })
        .limit(100);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AuditLog[];
    },
  });

  const salesRecords = vatRecords.filter(r => r.record_type === 'sale');
  const purchaseRecords = vatRecords.filter(r => r.record_type === 'purchase');
  const totalVATCollected = salesRecords.reduce((sum, r) => sum + (r.vat_amount || 0), 0);
  const totalVATPaid = purchaseRecords.reduce((sum, r) => sum + (r.vat_amount || 0), 0);
  const netVATPosition = totalVATCollected - totalVATPaid;

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: '#10b981',
      update: '#3b82f6',
      delete: '#ef4444',
    };
    return colors[action] || '#64748b';
  };

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="VAT & Audit"
        icon={FileCheck}
        actions={
          <>
            <Button variant="secondary" size="sm" className="flex items-center gap-2">
              <Download className="w-4 h-4 mr-2" />
              Export VAT Report
            </Button>
            <Button
              size="sm"
              className="flex items-center gap-2"
              onClick={() => setShowVATReturnModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New VAT Return
            </Button>
          </>
        }
      />

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6 p-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('vat')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'vat'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            VAT Management
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Audit Trails
          </button>
        </div>
      </div>

      {activeTab === 'vat' && (
            <>
              <KpiRow
                cols="grid-cols-1 md:grid-cols-4"
                stats={[
                  {
                    tone: 'success',
                    label: 'VAT Collected',
                    value: formatCurrency(totalVATCollected),
                    icon: TrendingUp,
                  },
                  {
                    tone: 'danger',
                    label: 'VAT Paid',
                    value: formatCurrency(totalVATPaid),
                    icon: TrendingDown,
                  },
                  {
                    tone: 'info',
                    label: 'Net VAT Position',
                    value: formatCurrency(Math.abs(netVATPosition)),
                    sub: netVATPosition >= 0 ? 'Payable' : 'Reclaimable',
                    icon: Calculator,
                  },
                  {
                    tone: 'neutral',
                    label: 'Tax Rate',
                    value: formatTaxRatePercent(taxConfig.defaultRate),
                    sub: taxConfig.label || 'VAT',
                    icon: FileCheck,
                  },
                ]}
              />

              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden mb-6">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">Recent VAT Returns</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Period</th>
                        <th className="text-right py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Output VAT</th>
                        <th className="text-right py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Input VAT</th>
                        <th className="text-right py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Net VAT</th>
                        <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="text-right py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {vatReturns.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center">
                            <FileCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 text-lg">No VAT returns filed</p>
                            <p className="text-slate-400 text-sm mt-1">Create your first VAT return to get started</p>
                          </td>
                        </tr>
                      ) : (
                        vatReturns.map((vatReturn) => (
                          <tr key={vatReturn.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2 text-sm text-slate-900">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                {formatDate(vatReturn.period_start)} - {formatDate(vatReturn.period_end)}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right text-sm font-semibold text-success tabular-nums">
                              {formatCurrency(vatReturn.output_vat)}
                            </td>
                            <td className="py-4 px-6 text-right text-sm font-semibold text-danger tabular-nums">
                              {formatCurrency(vatReturn.input_vat)}
                            </td>
                            <td className="py-4 px-6 text-right text-sm font-bold text-primary tabular-nums">
                              {formatCurrency(vatReturn.net_vat)}
                            </td>
                            <td className="py-4 px-6">
                              <Badge
                                variant={statusToBadgeVariant(vatReturn.status)}
                                className="capitalize"
                              >
                                {vatReturn.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                {(vatReturn.status === 'draft' || vatReturn.status === 'review') && (
                                  <button
                                    onClick={(e) => handleSubmitReturn(vatReturn.id, e)}
                                    className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                                    title="Submit Return"
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                )}
                                {vatReturn.status === 'submitted' && (
                                  <button
                                    onClick={(e) => handleMarkPaid(vatReturn.id, e)}
                                    className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                                    title="Mark as Paid"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">VAT Records</h2>
                    <div className="flex gap-2">
                      <select
                        value={recordTypeFilter}
                        onChange={(e) => setRecordTypeFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="all">All Types</option>
                        <option value="sale">Sales</option>
                        <option value="purchase">Purchases</option>
                      </select>
                      <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                        <option value="all">All Time</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Record ID</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">VAT Amount</th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">VAT Rate</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tax Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {vatLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={6} className="py-3 px-4">
                              <Skeleton className="h-6 w-full rounded" />
                            </td>
                          </tr>
                        ))
                      ) : vatRecords.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center">
                            <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 text-lg">No VAT records found</p>
                          </td>
                        </tr>
                      ) : (
                        vatRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {formatDate(record.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={record.record_type === 'sale' ? 'success' : 'secondary'}
                                size="sm"
                                className="capitalize"
                              >
                                {record.record_type}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm font-mono text-slate-600">{record.record_id?.substring(0, 8)}...</p>
                            </td>
                            <td className="py-3 px-4 text-right text-sm font-semibold text-primary">
                              {formatCurrency(record.vat_amount)}
                            </td>
                            <td className="py-3 px-4 text-center text-sm text-slate-600">
                              {formatTaxRatePercent(record.vat_rate)}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {record.tax_period || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

      {activeTab === 'audit' && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Financial Audit Logs</h2>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      type="text"
                      placeholder="Search audit logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 text-sm w-64"
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Timestamp</th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Action</th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Table</th>
                      <th className="text-left py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Record ID</th>
                      <th className="text-right py-4 px-6 text-xs font-semibold text-slate-600 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={6} className="py-4 px-6">
                            <Skeleton className="h-6 w-full rounded" />
                          </td>
                        </tr>
                      ))
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500 text-lg">No audit logs found</p>
                        </td>
                      </tr>
                    ) : (
                      auditLogs
                        .filter(log =>
                          log.record_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.action.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6 text-sm text-slate-600">
                              {formatDate(log.performed_at, 'MMM dd, yyyy HH:mm')}
                            </td>
                            <td className="py-4 px-6 text-sm text-slate-900 font-mono">
                              {log.performed_by?.substring(0, 8) || 'System'}...
                            </td>
                            <td className="py-4 px-6">
                              <Badge
                                variant="custom"
                                color={getActionColor(log.action)}
                                size="sm"
                                className="capitalize"
                              >
                                {log.action}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-sm text-slate-900 font-mono">
                              {log.record_type}
                            </td>
                            <td className="py-4 px-6 text-sm text-slate-600 font-mono">
                              {log.record_id.substring(0, 8)}...
                            </td>
                            <td className="py-4 px-6 text-right">
                              <button
                                className="p-1.5 text-primary hover:bg-info-muted rounded transition-colors"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      <VATReturnModal
        isOpen={showVATReturnModal}
        onClose={() => setShowVATReturnModal(false)}
        onSave={async (data) => {
          await createVATReturnMutation.mutateAsync(data);
        }}
      />
    </div>
  );
};
