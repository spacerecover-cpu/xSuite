import React, { useState } from 'react';
import { ShieldCheck, Play, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface TestResult {
  test_name: string;
  passed: boolean;
  details: string;
}

export const TenantIsolationTestPage: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const runTests = async () => {
    setRunning(true);
    setError('');
    setResults([]);

    try {
      const { data, error: rpcError } = await supabase.rpc('test_tenant_isolation');
      if (rpcError) throw rpcError;
      setResults((data ?? []) as TestResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run isolation tests');
    } finally {
      setRunning(false);
    }
  };

  const summaryResults = results.filter(r => r.test_name.startsWith('SUMMARY'));
  const detailResults = results.filter(r => !r.test_name.startsWith('SUMMARY'));
  const passCount = detailResults.filter(r => r.passed).length;
  const failCount = detailResults.filter(r => !r.passed).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Tenant Isolation Tests
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Verify RLS policies, security functions, and soft-delete patterns across all tenant-scoped tables
          </p>
        </div>
        <button
          onClick={runTests}
          disabled={running}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'Running...' : 'Run Tests'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-danger-muted border border-danger/30 rounded-lg flex items-center gap-2 text-danger">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {summaryResults.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{detailResults.length}</p>
            <p className="text-sm text-slate-500">Total Tests</p>
          </div>
          <div className="bg-white rounded-lg border border-success/30 p-4 text-center">
            <p className="text-2xl font-bold text-success tabular-nums">{passCount}</p>
            <p className="text-sm text-success">Passed</p>
          </div>
          <div className={`bg-white rounded-lg border p-4 text-center ${failCount > 0 ? 'border-danger/30' : 'border-slate-200'}`}>
            <p className={`text-2xl font-bold tabular-nums ${failCount > 0 ? 'text-danger' : 'text-slate-400'}`}>{failCount}</p>
            <p className={`text-sm ${failCount > 0 ? 'text-danger' : 'text-slate-500'}`}>Failed</p>
          </div>
        </div>
      )}

      {summaryResults.map((s, i) => (
        <div key={i} className={`p-4 rounded-lg border flex items-center gap-3 ${s.passed ? 'bg-success-muted border-success/30' : 'bg-danger-muted border-danger/30'}`}>
          {s.passed ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}
          <div>
            <p className={`text-sm font-medium ${s.passed ? 'text-success' : 'text-danger'}`}>{s.test_name}</p>
            <p className={`text-xs ${s.passed ? 'text-success' : 'text-danger'}`}>{s.details}</p>
          </div>
        </div>
      ))}

      {detailResults.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Detailed Results</h3>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {detailResults.map((r, i) => (
              <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                {r.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-danger flex-shrink-0" />
                )}
                <span className="flex-1 font-mono text-xs text-slate-700">{r.test_name}</span>
                <span className="text-xs text-slate-400">{r.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
