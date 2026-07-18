import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';
import { logger } from '../../../lib/logger';
import { getLabelSize } from '../../../lib/pdf/labels/labelSizes';
import {
  probeQz,
  getQzPrefs,
  setQzPrefs,
  qzPrintPdfBase64,
  type QzMode,
} from '../../../lib/pdf/labels/qzPrintService';
import { previewLabelBase64 } from '../../../lib/pdf/labels/labelPreview';
import { getLabelPrintingPrefs, labelEntityConfig } from '../../../lib/labelPrefsService';

/**
 * Settings → Preferences: per-WORKSTATION direct label printing via QZ Tray.
 * Shows agent status, the Auto/Off switch, an optional printer override, and a
 * Test print. All state is localStorage (the printer is physical to this PC).
 */
export const DirectPrintCard: React.FC = () => {
  const toast = useToast();
  const [mode, setMode] = useState<QzMode>(() => getQzPrefs().mode);
  const [printer, setPrinter] = useState<string>(() => getQzPrefs().printer ?? '');
  const [testing, setTesting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['qz', 'status'],
    queryFn: probeQz,
    staleTime: 15_000,
    retry: false,
  });

  // Default the printer override selection to the detected default (display only
  // until the user changes it — an empty override means "use system default").
  useEffect(() => {
    if (!printer && status?.defaultPrinter) setPrinter(status.defaultPrinter);
  }, [status?.defaultPrinter, printer]);

  const persist = (next: { mode?: QzMode; printer?: string }) => {
    const merged = { mode: next.mode ?? mode, printer: next.printer ?? printer };
    setQzPrefs({ mode: merged.mode, printer: merged.printer || undefined });
  };

  const handleToggle = () => {
    const next: QzMode = mode === 'auto' ? 'off' : 'auto';
    setMode(next);
    persist({ mode: next });
  };

  const handlePrinter = (value: string) => {
    setPrinter(value);
    persist({ printer: value });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const prefs = await getLabelPrintingPrefs();
      const cfg = labelEntityConfig(prefs, 'inventory');
      const size = getLabelSize(cfg.sizeId);
      const base64 = await previewLabelBase64('inventory', cfg);
      await qzPrintPdfBase64(base64, size, { printer: printer || undefined });
      toast.success('Test label sent to the printer.');
    } catch (err) {
      logger.error('[DirectPrintCard] test print failed', err);
      toast.error('Test print failed. Is QZ Tray running and a printer selected?');
    } finally {
      setTesting(false);
    }
  };

  const connected = status?.connected === true;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-900">Direct label printing (this workstation)</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Print labels silently at the exact label size straight to your thermal printer — no browser
        dialog, no A4 fallback. Requires the free QZ Tray helper installed on this PC. When it isn't
        running, labels open in the normal print dialog as before.
      </p>

      {/* Status row */}
      <div className="mt-4 flex items-center gap-2 text-sm">
        {isLoading ? (
          <span className="inline-flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking for QZ Tray…
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Connected
            {status?.defaultPrinter && (
              <span className="font-normal text-slate-500">· default: {status.defaultPrinter}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 text-slate-600">
            <AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" /> Not detected
            <a
              href="https://qz.io/download"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Install QZ Tray →
            </a>
          </span>
        )}
      </div>

      {/* Auto / Off */}
      <div className="mt-4 flex items-center justify-between gap-6 border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Use direct printing when available</p>
          <p className="text-xs text-slate-500">Off = always use the browser print dialog on this PC.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mode === 'auto'}
          aria-label="Direct printing"
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            mode === 'auto' ? 'bg-primary' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              mode === 'auto' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Printer override + test */}
      {connected && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="qz-printer" className="mb-1 block text-sm font-medium text-slate-800">
              Printer
            </label>
            <select
              id="qz-printer"
              value={printer}
              onChange={(e) => handlePrinter(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {(status?.printers ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
            Test print
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        First print on a new PC shows a one-time QZ Tray “Allow” prompt — tick “Remember” and it stays
        silent after that.
      </p>
    </div>
  );
};
