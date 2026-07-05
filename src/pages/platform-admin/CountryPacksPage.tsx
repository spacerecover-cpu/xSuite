import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Globe2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { listPackCountries } from '../../lib/countryPackService';
import { syncEngineCapabilities } from '../../lib/tax/capabilityManifest';
import { countryPackKeys } from '../../lib/queryKeys';

const statusTone: Record<string, string> = {
  statutory_ready: 'bg-success-muted text-success',
  formatting_ready: 'bg-warning-muted text-warning',
  stub: 'bg-surface-muted text-slate-500',
};

export const CountryPacksPage: React.FC = () => {
  const { data: countries = [], isLoading } = useQuery({
    queryKey: countryPackKeys.list(),
    queryFn: listPackCountries,
  });
  const syncMutation = useMutation({ mutationFn: syncEngineCapabilities });
  const overdue = countries.filter((c) => (c.stalenessDays ?? 0) > 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Globe2 className="h-5 w-5 text-primary" /> Country Packs
        </h1>
        <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {syncMutation.isPending ? 'Syncing…' : 'Sync capabilities'}
          {syncMutation.isSuccess ? ` (${syncMutation.data})` : ''}
        </Button>
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning bg-warning-muted px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" />
          {overdue.length} pack{overdue.length > 1 ? 's' : ''} overdue for review:{' '}
          {overdue.map((c) => `${c.code} (${c.stalenessDays}d)`).join(', ')}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-4 py-2">Country</th>
              <th className="px-4 py-2">Tax system</th>
              <th className="px-4 py-2">Config status</th>
              <th className="px-4 py-2">Published</th>
              <th className="px-4 py-2">Open version</th>
              <th className="px-4 py-2">Next review</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {countries.map((c) => (
              <tr key={c.countryId} className="border-t border-border hover:bg-surface-muted">
                <td className="px-4 py-2">
                  <Link to={`/platform-admin/countries/${c.countryId}`} className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{c.code}</span>
                </td>
                <td className="px-4 py-2">{c.taxSystem ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusTone[c.configStatus] ?? statusTone.stub}`}>
                    {c.configStatus}
                  </span>
                </td>
                <td className="px-4 py-2">{c.publishedVersion ? `v${c.publishedVersion}` : '—'}</td>
                <td className="px-4 py-2">
                  {c.openVersion ? `v${c.openVersion.version} · ${c.openVersion.status}` : '—'}
                </td>
                <td className="px-4 py-2">
                  {c.nextReviewDate ?? '—'}
                  {(c.stalenessDays ?? 0) > 0 && (
                    <span className="ml-2 rounded bg-danger-muted px-1.5 py-0.5 text-xs text-danger">
                      {c.stalenessDays}d overdue
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
