import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { composeReturnForDate, fileReturn, type ComposedReturnPreview } from '../../lib/tax/taxReturnService';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../hooks/useCurrency';
import { Calendar, ChevronLeft, ChevronRight, Save, Send } from 'lucide-react';
import { logger } from '../../lib/logger';

interface VATReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFiled: () => void;
}

/** Steps a tenant-local YYYY-MM-DD back one calendar day with pure string/int
 *  math — no Date -> toISOString UTC round-trip (the double-declared-month bug). */
function previousDay(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (d > 1) return `${isoDate.slice(0, 8)}${String(d - 1).padStart(2, '0')}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Steps forward past the current period end to land in the next period. */
function nextDay(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < lastDay) return `${isoDate.slice(0, 8)}${String(d + 1).padStart(2, '0')}`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export const VATReturnModal: React.FC<VATReturnModalProps> = ({ isOpen, onClose, onFiled }) => {
  const { profile } = useAuth();
  const { formatCurrency } = useCurrency();
  const [preview, setPreview] = useState<ComposedReturnPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compose = useCallback(async (forDate?: string) => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await composeReturnForDate(profile.tenant_id, forDate));
    } catch (e) {
      logger.error('Error composing return:', e);
      setError(e instanceof Error ? e.message : 'Failed to compose the return');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (isOpen) void compose(undefined);
    else setPreview(null);
  }, [isOpen, compose]);

  const handleFile = async (status: 'draft' | 'review') => {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      await fileReturn(preview, status);
      onFiled();
      onClose();
    } catch (e) {
      logger.error('Error filing VAT return:', e);
      setError(e instanceof Error ? e.message : 'Failed to file the return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="File Tax Return" size="lg">
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous period"
            disabled={loading || !preview}
            onClick={() => preview && void compose(previousDay(preview.periodStart))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" />
            {preview ? (
              <span>
                <span>{preview.periodStart}</span>
                <span className="mx-1 text-slate-500">→</span>
                <span>{preview.periodEnd}</span>
                <span className="ml-2 text-xs uppercase text-slate-500">{preview.filingFrequency}</span>
              </span>
            ) : (
              <span className="text-slate-500">{loading ? 'Composing…' : 'No period'}</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next period"
            disabled={loading || !preview}
            onClick={() => preview && void compose(nextDay(preview.periodEnd))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-danger bg-danger-muted px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {preview && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {preview.composed.boxes.map((box) => (
              <div key={box.boxCode} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{box.boxLabel}</div>
                  <div className="text-xs text-slate-500">{box.boxCode}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{formatCurrency(box.amountBase)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="secondary" onClick={() => void handleFile('draft')} disabled={!preview || submitting}>
            <Save className="mr-2 h-4 w-4" /> Save as Draft
          </Button>
          <Button onClick={() => void handleFile('review')} disabled={!preview || submitting}>
            <Send className="mr-2 h-4 w-4" /> Submit for Review
          </Button>
        </div>
      </div>
    </Modal>
  );
};
