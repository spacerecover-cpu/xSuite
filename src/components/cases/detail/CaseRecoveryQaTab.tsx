import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, ShieldCheck, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/format';
import { caseQualityService } from '@/lib/caseQualityService';
import {
  RECOVERY_RESULTS,
  QA_RESULTS,
  evaluateReleaseReadiness,
  type RecoveryResult,
  type QaResult,
} from '@/lib/caseReleaseGate';

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white text-sm';

const RESULT_LABEL: Record<string, string> = {
  success: 'Full recovery',
  partial: 'Partial recovery',
  failed: 'Failed',
  no_data: 'No data recoverable',
  passed: 'Passed',
};

function ReadinessPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
        ok ? 'bg-success-muted text-success' : 'bg-warning-muted text-warning'
      }`}
    >
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {label}
    </span>
  );
}

export const CaseRecoveryQaTab: React.FC<{ caseId: string }> = ({ caseId }) => {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: attempts = [] } = useQuery({
    queryKey: ['case_recovery_attempts', caseId],
    queryFn: () => caseQualityService.listRecoveryAttempts(caseId),
    enabled: !!caseId,
  });

  const { data: qaChecklists = [] } = useQuery({
    queryKey: ['case_qa_checklists', caseId],
    queryFn: () => caseQualityService.listQaChecklists(caseId),
    enabled: !!caseId,
  });

  const readiness = evaluateReleaseReadiness({ recoveryAttempts: attempts, qaChecklists });

  const [method, setMethod] = useState('');
  const [toolUsed, setToolUsed] = useState('');
  const [result, setResult] = useState<RecoveryResult>('success');
  const [dataRecovered, setDataRecovered] = useState('');
  const [notes, setNotes] = useState('');

  const recordRecovery = useMutation({
    mutationFn: () => {
      if (!profile?.tenant_id) throw new Error('No active session');
      return caseQualityService.recordRecoveryAttempt(caseId, profile.tenant_id, profile.id ?? null, {
        method: method.trim() || null,
        toolUsed: toolUsed.trim() || null,
        result,
        dataRecovered: dataRecovered.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_recovery_attempts', caseId] });
      setMethod('');
      setToolUsed('');
      setResult('success');
      setDataRecovered('');
      setNotes('');
      toast.success('Recovery attempt recorded');
    },
    onError: (e: Error) => toast.error(`Failed to record attempt: ${e.message}`),
  });

  const [qaName, setQaName] = useState('Final QA Review');
  const [qaResult, setQaResult] = useState<QaResult>('passed');

  const recordQa = useMutation({
    mutationFn: () => {
      if (!profile?.tenant_id) throw new Error('No active session');
      return caseQualityService.recordQaResult(caseId, profile.tenant_id, profile.id ?? null, {
        checklistName: qaName.trim() || 'QA Review',
        result: qaResult,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_qa_checklists', caseId] });
      toast.success('QA result recorded');
    },
    onError: (e: Error) => toast.error(`Failed to record QA: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Recovery &amp; QA</h2>
          <p className="text-sm text-slate-500 mb-4">
            A case can only advance to Completed / Delivered once a recovery attempt has an outcome
            and QA has passed. These are enforced server-side.
          </p>
          <div className="flex flex-wrap gap-3">
            <ReadinessPill ok={readiness.hasRecordedRecovery} label="Recovery outcome recorded" />
            <ReadinessPill ok={readiness.hasPassedQa} label="QA passed" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            Recovery Attempts
          </h3>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
                <input className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. Head swap, imaging" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tool used</label>
                <input className={inputClass} value={toolUsed} onChange={(e) => setToolUsed(e.target.value)} placeholder="e.g. PC-3000, ddrescue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
                <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value as RecoveryResult)}>
                  {RECOVERY_RESULTS.map((r) => (
                    <option key={r} value={r}>{RESULT_LABEL[r] ?? r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Data recovered</label>
                <input className={inputClass} value={dataRecovered} onChange={(e) => setDataRecovered(e.target.value)} placeholder="e.g. 1.8 TB / 98%" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Technical findings for this attempt..." />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button onClick={() => recordRecovery.mutate()} disabled={recordRecovery.isPending}>
                <Plus className="w-4 h-4 mr-1" />
                {recordRecovery.isPending ? 'Recording...' : 'Record attempt'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {attempts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No recovery attempts recorded yet.</p>
            ) : (
              attempts.map((a) => (
                <div key={a.id} className="flex items-start justify-between bg-white rounded-lg p-3 border border-slate-200">
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={a.result === 'success' ? 'success' : a.result === 'failed' || a.result === 'no_data' ? 'danger' : 'warning'} size="sm">
                        {RESULT_LABEL[a.result ?? ''] ?? a.result ?? '—'}
                      </Badge>
                      {a.method && <span className="text-slate-700 font-medium">{a.method}</span>}
                      {a.tool_used && <span className="text-slate-500">· {a.tool_used}</span>}
                    </div>
                    {a.data_recovered && <p className="text-slate-600 mt-1">Recovered: {a.data_recovered}</p>}
                    {a.notes && <p className="text-slate-600 mt-1 whitespace-pre-wrap">{a.notes}</p>}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{formatDate(a.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            QA Sign-off
          </h3>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Checklist</label>
                <input className={inputClass} value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="e.g. Final QA Review" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Result</label>
                <select className={inputClass} value={qaResult} onChange={(e) => setQaResult(e.target.value as QaResult)}>
                  {QA_RESULTS.map((r) => (
                    <option key={r} value={r}>{RESULT_LABEL[r] ?? r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button onClick={() => recordQa.mutate()} disabled={recordQa.isPending}>
                <Plus className="w-4 h-4 mr-1" />
                {recordQa.isPending ? 'Recording...' : 'Record QA result'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {qaChecklists.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No QA results recorded yet.</p>
            ) : (
              qaChecklists.map((q) => (
                <div key={q.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={q.status === 'passed' ? 'success' : q.status === 'failed' ? 'danger' : 'secondary'} size="sm">
                      {RESULT_LABEL[q.status ?? ''] ?? q.status ?? '—'}
                    </Badge>
                    <span className="text-slate-700 font-medium">{q.checklist_name}</span>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{formatDate(q.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
