import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../ui/Button';
import { PackRowsTable, type PackColumn } from './PackRowsTable';
import {
  runPackFixtures, upsertPackTest,
  type PackDetail, type PackTestRow, type FixtureRunSummary,
} from '../../../lib/countryPackService';
import { logger } from '../../../lib/logger';

interface Props { detail: PackDetail; disabled: boolean; onChanged: () => void }

export const PackFixturesTab: React.FC<Props> = ({ detail, disabled, onChanged }) => {
  const [summary, setSummary] = useState<FixtureRunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns: PackColumn<PackTestRow>[] = [
    { key: 'name', label: 'Fixture', render: (r) => r.name, input: { type: 'text', required: true } },
    { key: 'input_document', label: 'Input document', render: (r) => <code className="text-xs">{JSON.stringify(r.input_document).slice(0, 60)}…</code>, input: { type: 'json', required: true } },
    { key: 'expected', label: 'Expected', render: (r) => <code className="text-xs">{JSON.stringify(r.expected).slice(0, 60)}…</code>, input: { type: 'json', required: true } },
    { key: 'last_result', label: 'Last result',
      render: (r) => {
        const pass = (r.last_result as { pass?: boolean } | null)?.pass;
        if (pass === undefined || pass === null) return <span className="text-slate-500">not run</span>;
        return pass
          ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> pass</span>
          : <span className="inline-flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" /> fail</span>;
      } },
  ];

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setSummary(await runPackFixtures(detail.country.id, detail.country.code));
      onChanged();
    } catch (e) {
      logger.error('Fixture run failed:', e);
      setError(e instanceof Error ? e.message : 'Fixture run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Golden fixtures are the pack's audit evidence. Every content edit stales the results;
          the publish gate refuses stale or failing fixtures.
        </p>
        <Button onClick={() => void run()} disabled={running || detail.tests.length === 0}>
          <Play className="mr-2 h-4 w-4" /> {running ? 'Running…' : 'Run fixtures'}
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {summary && (
        <div role="status" aria-live="polite" className={`rounded-lg border px-4 py-3 text-sm ${summary.passed === summary.total ? 'border-success bg-success-muted text-success' : 'border-danger bg-danger-muted text-danger'}`}>
          {summary.passed} / {summary.total} passed
          {summary.results.filter((r) => !r.pass).map((r) => (
            <div key={r.name} className="mt-2">
              <div className="font-medium">{r.name}</div>
              <table className="mt-1 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th scope="col" className="pr-3 font-normal">Path</th>
                    <th scope="col" className="pr-3 font-normal">Expected</th>
                    <th scope="col" className="font-normal">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {r.diffs.map((d, i) => (
                    <tr key={i}>
                      <td className="pr-3 font-mono">{d.path}</td>
                      <td className="pr-3">expected {JSON.stringify(d.expected)}</td>
                      <td>got {JSON.stringify(d.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <PackRowsTable title="Fixtures (master_country_pack_tests)" rows={detail.tests}
        columns={columns} disabled={disabled}
        onSave={async (d, e) => {
          await upsertPackTest({ ...d, country_id: detail.country.id, ...(e ? { id: e.id } : {}) });
          onChanged();
        }} />
    </div>
  );
};
