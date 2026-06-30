import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Download, Database, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabaseClient';
import { dataMigrationKeys } from '../../lib/queryKeys';
import { ImportWizard } from '../../components/dataMigration/ImportWizard';
import { ExportWizard } from '../../components/dataMigration/ExportWizard';

type RunStatus = 'pending' | 'validating' | 'running' | 'paused' | 'completed' | 'failed';

interface MigrationRun {
  id: string;
  kind: 'import' | 'export';
  status: RunStatus;
  source_filename: string | null;
  counts: Record<string, { inserted: number; skipped: number; error: number }>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

const STATUS_ICON: Record<RunStatus, React.ReactNode> = {
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-danger" />,
  running: <Clock className="w-4 h-4 text-info animate-pulse" />,
  validating: <Clock className="w-4 h-4 text-warning animate-pulse" />,
  paused: <AlertCircle className="w-4 h-4 text-warning" />,
  pending: <AlertCircle className="w-4 h-4 text-slate-400" />,
};

const STATUS_BADGE: Record<RunStatus, 'success' | 'danger' | 'info' | 'warning' | 'secondary'> = {
  completed: 'success',
  failed: 'danger',
  running: 'info',
  validating: 'warning',
  paused: 'warning',
  pending: 'secondary',
};

export const ImportExportCenter: React.FC = () => {
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const { data: recentRuns, isLoading } = useQuery({
    queryKey: dataMigrationKeys.runs(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_migration_runs')
        .select('id,kind,status,source_filename,counts,started_at,finished_at,created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as MigrationRun[];
    },
  });

  const importRuns = recentRuns?.filter((r) => r.kind === 'import') ?? [];
  const exportRuns = recentRuns?.filter((r) => r.kind === 'export') ?? [];

  const totalCounts = (run: MigrationRun) =>
    Object.values(run.counts ?? {}).reduce(
      (acc, c) => ({ inserted: acc.inserted + c.inserted, skipped: acc.skipped + c.skipped, error: acc.error + c.error }),
      { inserted: 0, skipped: 0, error: 0 },
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <SettingsPageHeader categoryId="import-export" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info-muted flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Import Data</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Load a full-lab workbook (.xlsx) — customers, cases, devices, quotes, invoices, and history.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{importRuns.length}</span> import run{importRuns.length !== 1 ? 's' : ''}
          </div>
          <Button
            variant="primary"
            size="sm"
            className="self-start"
            aria-label="Start import"
            onClick={() => setShowImport(true)}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Start Import
          </Button>
        </Card>

        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success-muted flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Export Data</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Download the full relational graph as a re-importable .xlsx workbook for backup or migration.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{exportRuns.length}</span> export run{exportRuns.length !== 1 ? 's' : ''}
          </div>
          <Button
            variant="success"
            size="sm"
            className="self-start"
            aria-label="Start export"
            onClick={() => setShowExport(true)}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Start Export
          </Button>
        </Card>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-4">Recent Activity</h2>
        <Card>
          {isLoading ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-4">
                  <Skeleton className="w-5 h-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentRuns && recentRuns.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentRuns.map((run) => {
                const counts = totalCounts(run);
                return (
                  <div key={run.id} className="p-4 flex items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      {run.kind === 'import' ? (
                        <Upload className="w-4 h-4 text-info" />
                      ) : (
                        <Download className="w-4 h-4 text-success" />
                      )}
                      {STATUS_ICON[run.status]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm capitalize">{run.kind}</span>
                        {run.source_filename && (
                          <span className="text-xs text-slate-500 truncate max-w-[200px]">{run.source_filename}</span>
                        )}
                        <Badge variant={STATUS_BADGE[run.status]} size="sm">{run.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {counts.inserted} inserted · {counts.skipped} skipped · {counts.error} error
                        {run.created_at && ` · ${new Date(run.created_at).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Database className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No import or export runs yet</p>
              <p className="text-xs text-slate-400 mt-1">Use Import or Export above to get started</p>
            </div>
          )}
        </Card>
      </div>

      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}
      {showExport && <ExportWizard onClose={() => setShowExport(false)} />}
    </div>
  );
};
