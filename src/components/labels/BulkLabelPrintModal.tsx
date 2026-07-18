import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Download, X, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { settingsKeys } from '../../lib/queryKeys';
import {
  DEFAULT_LABEL_PRINTING_PREFS,
  getLabelPrintingPrefs,
  labelEntityConfig,
  type LabelEntity,
} from '../../lib/labelPrefsService';
import { LabelPrintOptionsFields, type LabelPrintOverrides } from './LabelPrintOptionsFields';
import {
  LABELS_PER_CHUNK,
  printInventoryLabelsBulk,
  type BulkPrintProgress,
} from '../../lib/pdf/labels/bulkLabelPrint';
import { probeQz } from '../../lib/pdf/labels/qzPrintService';

/** Minimal identity a bulk target needs; entity mappers handle the rest. */
export interface BulkTarget {
  id: string;
}

/** The chunked run one entity performs — the orchestrator's option shape. */
export interface BulkRun {
  output: 'print' | 'download';
  config: ReturnType<typeof labelEntityConfig>;
  onProgress?: (p: BulkPrintProgress) => void;
  signal?: AbortSignal;
}

export interface BulkLabelPrintModalProps<T extends BulkTarget = BulkTarget> {
  entity: LabelEntity;
  selected: T[];
  fetchAllFiltered: () => Promise<{ items: T[]; truncated: boolean }>;
  /** Entity-specific print call for one chunked run (wires the orchestrator). */
  onRun?: (items: T[], run: BulkRun) => Promise<{ success: boolean; error?: string }>;
  extraFields?: React.ReactNode;
  onClose: () => void;
}

const SINGLE_JOB_CAP = LABELS_PER_CHUNK; // 250

export function BulkLabelPrintModal<T extends BulkTarget>({
  entity,
  selected,
  fetchAllFiltered,
  onRun,
  extraFields,
  onClose,
}: BulkLabelPrintModalProps<T>) {
  const toast = useToast();
  const { data: prefs } = useQuery({ queryKey: settingsKeys.labelPrinting(), queryFn: getLabelPrintingPrefs });
  const tenant = labelEntityConfig(prefs ?? DEFAULT_LABEL_PRINTING_PREFS, entity);
  const { data: qz } = useQuery({ queryKey: ['qz', 'status'], queryFn: probeQz, staleTime: 15_000, retry: false });

  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [allItems, setAllItems] = useState<{ items: T[]; truncated: boolean } | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [edits, setEdits] = useState<Partial<LabelPrintOverrides>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkPrintProgress | null>(null);
  const [nudge, setNudge] = useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const design: LabelPrintOverrides = {
    sizeId: tenant.sizeId,
    copies: tenant.copies,
    showQr: tenant.showQr,
    showBarcode: tenant.showBarcode,
    ...edits,
  };
  const targets = scope === 'all' ? allItems?.items ?? [] : selected;
  const total = targets.length * design.copies;

  const pickAll = async () => {
    setScope('all');
    if (allItems) return;
    setLoadingAll(true);
    try {
      setAllItems(await fetchAllFiltered());
    } catch {
      toast.error('Could not load the full list');
      setScope('selected');
    } finally {
      setLoadingAll(false);
    }
  };

  const run = async (output: 'print' | 'download') => {
    if (targets.length === 0) {
      toast.error('Nothing to print');
      return;
    }
    if (output === 'print' && total > SINGLE_JOB_CAP && !qz?.connected) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setRunning(true);
    setProgress(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const config = {
        ...tenant,
        sizeId: design.sizeId,
        copies: design.copies,
        showQr: design.showQr,
        showBarcode: design.showBarcode,
      };
      const runner = onRun ?? defaultRunner(entity);
      const res = await runner(targets, { output, config, onProgress: setProgress, signal: ac.signal });
      if (res.success) {
        toast.success(`Printed ${targets.length} label set${targets.length !== 1 ? 's' : ''}.`);
        onClose();
      } else {
        toast.error(res.error ?? 'Bulk print failed');
      }
    } catch {
      toast.error('Bulk print failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <Modal isOpen onClose={running ? () => {} : onClose} title={`Print ${entity} labels`} size="md">
      <div className="space-y-5">
        {/* Scope */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
              className="text-primary"
            />
            <span className="font-semibold text-primary">{selected.length} selected</span>
            <span className="text-slate-500">on this page</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" checked={scope === 'all'} onChange={pickAll} className="text-primary" />
            All matching current filters
            {scope === 'all' &&
              (loadingAll ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                allItems && <span className="font-semibold text-primary">{allItems.items.length}</span>
              ))}
          </label>
          {allItems?.truncated && scope === 'all' && (
            <p className="text-xs text-warning">
              Showing the first {allItems.items.length} — narrow the filter to relabel the rest.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">This print</h4>
          <LabelPrintOptionsFields
            value={design}
            onChange={(p) => setEdits((e) => ({ ...e, ...p }))}
            idPrefix="bulk-print"
          />
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{targets.length}</span> items × {design.copies} ={' '}
            <span className="font-semibold">{total}</span> labels
          </p>
          {extraFields}
        </div>

        {nudge && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-muted p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              That's {total} labels. Install{' '}
              <a
                href="https://qz.io/download"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                QZ Tray
              </a>{' '}
              for silent bulk printing, narrow the filter, or lower copies — or use{' '}
              <span className="font-medium">Download</span>.
            </span>
          </div>
        )}

        {running && progress && (
          <div className="space-y-1">
            <div
              className="h-2 w-full rounded-full bg-slate-200"
              role="progressbar"
              aria-label={`Printing ${entity} labels`}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500" aria-live="polite">
              Printing {progress.done}/{progress.total} (batch {progress.chunk}/{progress.chunks})…
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
          {running ? (
            <Button variant="secondary" size="sm" className="gap-1" onClick={() => abortRef.current?.abort()}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" className="gap-1" onClick={onClose}>
                <X className="h-4 w-4" /> Close
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => run('download')}
                disabled={targets.length === 0}
              >
                <Download className="h-4 w-4" /> Download PDF
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="gap-1"
                onClick={() => run('print')}
                disabled={targets.length === 0}
              >
                <Printer className="h-4 w-4" /> Print
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function defaultRunner(entity: LabelEntity) {
  // bulkLabelPrint is already statically imported (for LABELS_PER_CHUNK); it keeps
  // pdfmake lazy via its own deeper dynamic import of labelPrintService, so pulling
  // printInventoryLabelsBulk in statically here changes no chunk boundary.
  return async (items: BulkTarget[], run: BulkRun) => {
    if (entity === 'inventory') return printInventoryLabelsBulk(items as never, run);
    throw new Error('stock/case must pass onRun'); // stock supplies its own runner (price/location mapping)
  };
}
