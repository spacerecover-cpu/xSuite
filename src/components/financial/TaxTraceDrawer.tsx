import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface TaxTraceDrawerProps {
  trace: unknown;
  backfilled: boolean;
  open: boolean;
  onClose: () => void;
}

type TraceStep = Record<string, unknown> & { op?: unknown };

/** `rate_match` gets a friendly sentence; every other op renders its
 *  remaining fields as `key: value` mono lines (value JSON-stringified so
 *  nested objects/arrays stay readable). */
function formatStepDetails(step: TraceStep): string[] {
  const { op, ...rest } = step;
  if (op === 'rate_match') {
    const { rateRowId, componentCode, rate, validFrom } = rest as {
      rateRowId?: unknown; componentCode?: unknown; rate?: unknown; validFrom?: unknown;
    };
    return [`Matched rate row ${String(rateRowId)} — ${String(componentCode)} ${String(rate)}% (valid from ${String(validFrom)})`];
  }
  return Object.entries(rest).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}

/** "How was this computed?" explain drawer over a `RuleTrace`. Docked to the
 *  right of the viewport (composes `Dialog` directly, per DESIGN.md → Overlays
 *  — no standalone `Drawer` primitive exists yet). Follows the platform's
 *  three-region contract: pinned header, scrolling body, pinned footer with a
 *  single `secondary` Close action (no top-right X). */
export function TaxTraceDrawer({ trace, backfilled, open, onClose }: TaxTraceDrawerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const steps = ((trace as { steps?: TraceStep[] } | null)?.steps) ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="justify-end"
      className="ms-auto flex h-full max-h-full w-full max-w-md flex-col overflow-hidden rounded-none"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {t('financial.taxTrace.title')}
        </h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {backfilled && (
          <div
            data-testid="tax-trace-backfilled-badge"
            className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning"
          >
            {t('financial.taxTrace.backfilledBadge')}
          </div>
        )}
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">{t('financial.taxTrace.noTrace')}</p>
        ) : (
          <ul className="space-y-2">
            {steps.map((step, index) => (
              <li key={index} className="rounded-md border border-border p-2">
                <div className="text-sm font-bold text-slate-900">{String(step.op ?? '')}</div>
                {formatStepDetails(step).map((line, lineIndex) => (
                  <div key={lineIndex} className="mt-1 font-mono text-xs text-slate-600">{line}</div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>{t('ui.close')}</Button>
        </div>
      </div>
    </Dialog>
  );
}
