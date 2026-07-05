import React, { useState } from 'react';
import { GitBranch, Send, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useAuth } from '../../../contexts/AuthContext';
import {
  createPackDraft, submitPackForReview, publishPack,
  type PackDetail, type PublishGateResult,
} from '../../../lib/countryPackService';
import { logger } from '../../../lib/logger';

interface Props { detail: PackDetail; onChanged: () => void }

export const PackPublishPanel: React.FC<Props> = ({ detail, onChanged }) => {
  const { user } = useAuth();
  const [changelog, setChangelog] = useState('');
  const [gate, setGate] = useState<PublishGateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = detail.versions.find((v) => v.status === 'draft' || v.status === 'in_review') ?? null;
  const isAuthor = !!open && open.authored_by === user?.id;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); }
    catch (e) { logger.error('Pack lifecycle action failed:', e); setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold">Version history</h3>
        <ul className="space-y-1 text-sm">
          {detail.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <span className="font-mono">v{v.version}</span>
              <span className="rounded bg-surface-muted px-2 py-0.5 text-xs">{v.status}</span>
              <span className="text-slate-500">{v.changelog}</span>
            </li>
          ))}
        </ul>
      </div>

      {!open && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="pack-changelog" className="mb-1 block text-sm font-medium">Changelog</label>
            <input id="pack-changelog" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                   value={changelog} onChange={(e) => setChangelog(e.target.value)} />
          </div>
          <Button disabled={busy || !changelog}
                  onClick={() => void act(async () => { await createPackDraft(detail.country.id, changelog); })}>
            <GitBranch className="mr-2 h-4 w-4" /> New draft
          </Button>
        </div>
      )}

      {open?.status === 'draft' && (
        <Button disabled={busy}
                onClick={() => void act(async () => { await submitPackForReview(open.id); })}>
          <Send className="mr-2 h-4 w-4" /> Submit v{open.version} for review
        </Button>
      )}

      {open?.status === 'in_review' && (
        <div className="space-y-2">
          <Button disabled={busy || isAuthor}
                  onClick={() => void act(async () => { setGate(await publishPack(detail.country.id, open.version)); })}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Publish v{open.version}
          </Button>
          {isAuthor && (
            <p className="text-sm text-warning">
              Dual control: you authored this pack — a different platform admin must publish it
              (enforced again by the DB CHECK approved_by ≠ authored_by).
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {gate && (
        <div role="status" aria-live="polite" className={`rounded-lg border p-4 text-sm ${gate.published ? 'border-success bg-success-muted' : 'border-danger bg-danger-muted'}`}>
          <p className="font-medium">
            {gate.published ? `Published — config_status: ${gate.config_status}` : 'Publish blocked by the gate'}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Fixtures: {gate.gate.fixtures.passed}/{gate.gate.fixtures.total} passed, {gate.gate.fixtures.stale} stale</li>
            <li>Capabilities missing: {gate.gate.capabilities.missing.length === 0 ? 'none' : gate.gate.capabilities.missing.join(', ')}</li>
            <li>Standard rate coverage: {String(gate.gate.coverage.standard_rate)}</li>
            {gate.gate.blockers.map((b) => <li key={b} className="text-danger">✗ {b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
