import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Download, Trash2, Clock, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Plus, FileText, Search,
} from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { gdprService } from '../../lib/gdprService';
import { gdprKeys } from '../../lib/queryKeys';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  pending: { bg: 'bg-warning-muted border-warning/30', text: 'text-warning', icon: <Clock className="w-4 h-4" /> },
  processing: { bg: 'bg-info-muted border-info/30', text: 'text-info', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed: { bg: 'bg-success-muted border-success/30', text: 'text-success', icon: <CheckCircle2 className="w-4 h-4" /> },
  rejected: { bg: 'bg-danger-muted border-danger/30', text: 'text-danger', icon: <XCircle className="w-4 h-4" /> },
};

export const GDPRCompliancePage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [formData, setFormData] = useState({ type: 'export', email: '', name: '', notes: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: gdprKeys.requests(),
    queryFn: () => gdprService.getDataSubjectRequests(),
  });

  const { data: retentionPolicies = [] } = useQuery({
    queryKey: gdprKeys.retentionPolicies(),
    queryFn: () => gdprService.getRetentionPolicies(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      gdprService.createDataSubjectRequest({
        tenant_id: profile!.tenant_id!,
        request_type: formData.type,
        subject_email: formData.email,
        subject_name: formData.name || null,
        requested_by: user!.id,
        notes: formData.notes || null,
        status: 'pending',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gdprKeys.all });
      toast.success('Data subject request created');
      setShowNewRequest(false);
      setFormData({ type: 'export', email: '', name: '', notes: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const processExport = async (requestId: string) => {
    if (!selectedCustomerId) {
      toast.error('Please search and select a customer first');
      return;
    }
    try {
      await gdprService.updateRequestStatus(requestId, 'processing', user!.id);
      const data = await gdprService.exportCustomerData(selectedCustomerId);
      gdprService.downloadAsJson(data, `gdpr-export-${new Date().toISOString().slice(0, 10)}.json`);
      await gdprService.updateRequestStatus(requestId, 'completed', user!.id);
      queryClient.invalidateQueries({ queryKey: gdprKeys.all });
      toast.success('Data exported successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const processDeletion = async (requestId: string) => {
    if (!selectedCustomerId) {
      toast.error('Please search and select a customer first');
      return;
    }
    const ok = await confirm({
      title: 'Anonymize Customer Data',
      message: 'This will permanently anonymize all personal data for this customer. This cannot be undone. Continue?',
      confirmLabel: 'Anonymize',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await gdprService.updateRequestStatus(requestId, 'processing', user!.id);
      await gdprService.anonymizeCustomerData(selectedCustomerId);
      await gdprService.updateRequestStatus(requestId, 'completed', user!.id);
      queryClient.invalidateQueries({ queryKey: gdprKeys.all });
      toast.success('Customer data anonymized successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anonymization failed');
    }
  };

  const searchCustomer = async () => {
    if (!customerSearch.trim()) return;
    const s = sanitizeFilterValue(customerSearch);
    const { data } = await supabase
      .from('customers_enhanced')
      .select('id, customer_name, email')
      .or(`email.ilike.%${s}%,customer_name.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (data) {
      setSelectedCustomerId(data.id);
      toast.success(`Found: ${data.customer_name} (${data.email ?? 'no email'})`);
    } else {
      toast.error('No customer found');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <SettingsPageHeader categoryId="gdpr" />
      <div className="flex justify-end">
        <button
          onClick={() => setShowNewRequest(true)}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>

      {showNewRequest && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Data Subject Request</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
              <select
                value={formData.type}
                onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="export">Data Export (Right of Access)</option>
                <option value="deletion">Data Deletion (Right to Erasure)</option>
                <option value="rectification">Data Rectification</option>
                <option value="access">Access Request</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowNewRequest(false)}
              className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!formData.email || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Request
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Customer Lookup</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchCustomer()}
            placeholder="Search by email or name..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
          <button
            onClick={searchCustomer}
            className="px-4 py-2 text-sm bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 flex items-center gap-1"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
        {selectedCustomerId && (
          <p className="text-xs text-success mt-1">Customer selected: {selectedCustomerId}</p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            Data Subject Requests
          </h3>
        </div>
        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No data subject requests yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map(req => {
              const style = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
              return (
                <div key={req.id} className="p-4 flex items-center gap-4">
                  <div className={`px-2.5 py-1 rounded-full border text-xs font-medium flex items-center gap-1 ${style.bg} ${style.text}`}>
                    {style.icon}
                    {req.status}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 capitalize">{req.request_type} Request</p>
                    <p className="text-xs text-slate-500">{req.subject_email} {req.subject_name ? `(${req.subject_name})` : ''}</p>
                  </div>
                  <p className="text-xs text-slate-400">{new Date(req.created_at!).toLocaleDateString()}</p>
                  {req.status === 'pending' && (
                    <div className="flex gap-1">
                      {req.request_type === 'export' && (
                        <button
                          onClick={() => processExport(req.id)}
                          className="p-1.5 text-primary hover:bg-info-muted rounded"
                          title="Process export"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {req.request_type === 'deletion' && (
                        <button
                          onClick={() => processDeletion(req.id)}
                          className="p-1.5 text-danger hover:bg-danger-muted rounded"
                          title="Process deletion"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {retentionPolicies.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-slate-500" />
              Data Retention Policies
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Table</th>
                <th className="px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Retention (days)</th>
                <th className="px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Auto Purge</th>
                <th className="px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {retentionPolicies.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs">{p.table_name}</td>
                  <td className="px-4 py-2">{p.retention_days}</td>
                  <td className="px-4 py-2">{p.auto_purge ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
