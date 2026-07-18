import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, RotateCcw, Loader2, QrCode, Barcode as BarcodeIcon, Printer, Copy, AlignLeft, AlignCenter, AlignRight, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../../hooks/useToast';
import { logger } from '../../../lib/logger';
import { settingsKeys } from '../../../lib/queryKeys';
import {
  getLabelPrintingPrefs,
  setLabelPrintingPrefs,
  labelEntityConfig,
  defaultLabelFields,
  DEFAULT_LABEL_PRINTING_PREFS,
  LABEL_FIELDS,
  type LabelEntity,
  type LabelEntityConfig,
  type LabelPrintingPrefs,
} from '../../../lib/labelPrefsService';
import { LABEL_SIZE_GROUPS, LABEL_SIZE_PRESETS, getLabelSize, sizeClass, supportsBarcode } from '../../../lib/pdf/labels/labelSizes';
import type { IdAlign, IconPosition } from '../../../lib/pdf/labels/labelSizes';
import { fileToLabelIconDataUrl } from '../../../lib/pdf/labels/labelIcon';

interface LabelStudioProps {
  entity: LabelEntity;
  /** Card label for the heading (e.g. "Case label"). */
  label: string;
  onBack: () => void;
}

/** Merge one entity's edited design back into the full parallel-map prefs. */
function mergeEntityConfig(prefs: LabelPrintingPrefs, entity: LabelEntity, cfg: LabelEntityConfig): LabelPrintingPrefs {
  return {
    sizes: { ...prefs.sizes, [entity]: cfg.sizeId },
    autoPrint: { ...prefs.autoPrint, [entity]: cfg.autoPrint },
    copies: { ...prefs.copies, [entity]: cfg.copies },
    showQr: { ...prefs.showQr, [entity]: cfg.showQr },
    showBarcode: { ...prefs.showBarcode, [entity]: cfg.showBarcode },
    fields: { ...prefs.fields, [entity]: cfg.fields },
    idAlign: { ...prefs.idAlign, [entity]: cfg.idAlign },
    showIcon: { ...prefs.showIcon, [entity]: cfg.showIcon },
    iconPosition: { ...prefs.iconPosition, [entity]: cfg.iconPosition },
    icon: cfg.icon,
  };
}

/**
 * Dedicated thermal-label editor. Unlike the 6-tab document TemplateStudio, a
 * label is a tiny sticker: this exposes the stock size, QR / barcode, copies,
 * auto-print and the entity's content-field toggles, with a live preview that
 * IS the compact print engine (so preview == print). Persists to
 * `company_settings.metadata.label_printing` (shared with Preferences).
 */
export const LabelStudio: React.FC<LabelStudioProps> = ({ entity, label, onBack }) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: settingsKeys.labelPrinting(),
    queryFn: getLabelPrintingPrefs,
  });
  const effectivePrefs = prefs ?? DEFAULT_LABEL_PRINTING_PREFS;

  const [config, setConfig] = useState<LabelEntityConfig | null>(null);
  // Seed local edit state once the prefs load, and re-seed only when the entity
  // changes — NOT on every prefs refetch (a window-focus refetch that returns a
  // concurrently-saved change must not clobber the admin's unsaved edits).
  const seededEntityRef = useRef<LabelEntity | null>(null);
  useEffect(() => {
    if (prefs && seededEntityRef.current !== entity) {
      setConfig(labelEntityConfig(prefs, entity));
      seededEntityRef.current = entity;
    }
  }, [prefs, entity]);

  const cfg = config ?? labelEntityConfig(effectivePrefs, entity);
  const size = getLabelSize(cfg.sizeId);
  const barcodeCapable = supportsBarcode(size);

  const patch = (p: Partial<LabelEntityConfig>) => {
    // A local edit makes this entity user-owned: stamp it seeded so the initial
    // prefs-load seed can't clobber an edit made before the query settled.
    seededEntityRef.current = entity;
    setConfig((c) => ({ ...(c ?? cfg), ...p }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Merge into the tenant's ACTUAL saved prefs, never the fallback default —
      // saving against DEFAULT_LABEL_PRINTING_PREFS would reset the other two
      // entities' designs to factory defaults.
      if (!prefs) throw new Error('Label settings are still loading.');
      const next = mergeEntityConfig(prefs, entity, cfg);
      queryClient.setQueryData(settingsKeys.labelPrinting(), next);
      await setLabelPrintingPrefs(next);
    },
    onSuccess: () => {
      toast.success(`${label} saved.`);
      queryClient.invalidateQueries({ queryKey: settingsKeys.labelPrinting() });
    },
    onError: (err) => {
      logger.error('[LabelStudio] save failed:', err);
      queryClient.invalidateQueries({ queryKey: settingsKeys.labelPrinting() });
      toast.error('Could not save the label. Please try again.');
    },
  });

  const handleReset = () => {
    patch({
      sizeId: DEFAULT_LABEL_PRINTING_PREFS.sizes[entity],
      copies: 1,
      showQr: true,
      showBarcode: true,
      fields: defaultLabelFields(entity),
    });
    toast.info('Reverted to the default label design. Save to apply.');
  };

  // ---- Live preview (debounced, real compact-engine artifact) --------------
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = setTimeout(async () => {
      try {
        const [{ preloadAllFonts }, { previewLabelBlob }] = await Promise.all([
          import('../../../lib/pdf/fonts'),
          import('../../../lib/pdf/labels/labelPreview'),
        ]);
        await preloadAllFonts();
        const url = await previewLabelBlob(entity, cfg);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (cancelled) return;
        logger.error('[LabelStudio] preview failed:', err);
        setPreviewError('Could not render the label preview.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, cfg.sizeId, cfg.showQr, cfg.showBarcode, cfg.idAlign, cfg.showIcon, cfg.iconPosition, cfg.icon, JSON.stringify(cfg.fields)]);

  useEffect(
    () => () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    },
    [],
  );

  const fieldDefs = LABEL_FIELDS[entity];

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 transition-colors hover:bg-slate-100" aria-label="Back to Label Studio">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{label} template</h1>
            <p className="text-sm text-slate-600">Design the thermal label. The preview updates live.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={saveMutation.isPending}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!prefs} isLoading={saveMutation.isPending} loadingLabel="Saving">
            <Save className="mr-2 h-4 w-4" />
            Save &amp; deploy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,48%)]">
        {/* Controls */}
        <Card variant="bordered" className="space-y-6 p-5">
          {/* Label stock */}
          <div>
            <label htmlFor="label-size" className="mb-1 block text-sm font-semibold text-slate-800">
              Label stock
            </label>
            <p className="mb-2 text-xs text-slate-500">
              The PDF page is sized exactly to the label — load this stock and print at 100% scale.
            </p>
            <select
              id="label-size"
              value={cfg.sizeId}
              onChange={(e) => patch({ sizeId: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LABEL_SIZE_GROUPS.map((g) => (
                <optgroup key={g.cls} label={g.label}>
                  {LABEL_SIZE_PRESETS.filter((p) => sizeClass(p) === g.cls).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.printers}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Scannable codes */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Scannable codes</p>
            <ToggleRow
              icon={QrCode}
              label="QR code"
              hint="Scan to open the record. Recommended — it is the label's anchor."
              checked={cfg.showQr}
              onChange={(v) => patch({ showQr: v })}
            />
            <ToggleRow
              icon={BarcodeIcon}
              label="Barcode (Code128)"
              hint={barcodeCapable ? 'Printed across the bottom on wide stock.' : 'Needs wider stock (≥ 50 × 25 mm).'}
              checked={barcodeCapable && cfg.showBarcode}
              disabled={!barcodeCapable}
              onChange={(v) => patch({ showBarcode: v })}
            />
          </div>

          {/* Content fields */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Fields</p>
            <p className="-mt-2 text-xs text-slate-500">
              The identifier{entity === 'case' ? ' and device number' : ''} always print. Toggle the rest to fit your stock.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {fieldDefs.map((f) => (
                <CheckRow
                  key={f.key}
                  label={f.label}
                  checked={cfg.fields[f.key] !== false}
                  onChange={(v) => patch({ fields: { ...cfg.fields, [f.key]: v } })}
                />
              ))}
            </div>
          </div>

          {/* Printing */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Printing</p>
            <div className="flex items-center gap-3">
              <Copy className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <label htmlFor="label-copies" className="flex-1 text-sm text-slate-700">
                Copies per print
              </label>
              <input
                id="label-copies"
                type="number"
                min={1}
                max={20}
                value={cfg.copies}
                onChange={(e) => patch({ copies: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <ToggleRow
              icon={Printer}
              label="Auto-print on create"
              hint="Send the label straight to the print dialog when this entity is created."
              checked={cfg.autoPrint}
              onChange={(v) => patch({ autoPrint: v })}
            />
          </div>

          {/* Identifier alignment */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Identifier alignment</p>
            <p className="-mt-1 text-xs text-slate-500">Where the code prints (strip &amp; card stock; square is always centered).</p>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {([
                { v: 'left', Icon: AlignLeft },
                { v: 'center', Icon: AlignCenter },
                { v: 'right', Icon: AlignRight },
              ] as const).map(({ v, Icon }) => (
                <button
                  key={v}
                  type="button"
                  aria-label={`Align ${v}`}
                  aria-pressed={cfg.idAlign === v}
                  onClick={() => patch({ idAlign: v as IdAlign })}
                  className={[
                    'flex h-9 w-11 items-center justify-center transition-colors',
                    cfg.idAlign === v ? 'bg-primary text-primary-foreground' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Brand icon */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Brand icon</p>
            <p className="-mt-2 text-xs text-slate-500">
              A small favicon-style mark, converted to crisp 1-bit for thermal printing. Shared across all label types.
            </p>
            <div className="flex items-center gap-3">
              {cfg.icon ? (
                <img src={cfg.icon} alt="Label icon" className="h-10 w-10 rounded border border-slate-200 bg-white object-contain p-0.5" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
                  <ImagePlus className="h-4 w-4" />
                </div>
              )}
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {cfg.icon ? 'Replace' : 'Upload icon'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const icon = await fileToLabelIconDataUrl(file);
                      patch({ icon });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not process that image.');
                    }
                  }}
                />
              </label>
              {cfg.icon && (
                <button
                  type="button"
                  onClick={() => patch({ icon: undefined })}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-danger hover:bg-danger-muted"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
            </div>
            <ToggleRow
              icon={ImagePlus}
              label="Show icon on this label"
              hint={cfg.icon ? 'Stamped in the chosen corner.' : 'Upload an icon first.'}
              checked={!!cfg.icon && cfg.showIcon}
              disabled={!cfg.icon}
              onChange={(v) => patch({ showIcon: v })}
            />
            {cfg.icon && cfg.showIcon && (
              <div>
                <label htmlFor="icon-pos" className="mb-1 block text-xs font-medium text-slate-600">Corner</label>
                <select
                  id="icon-pos"
                  value={cfg.iconPosition}
                  onChange={(e) => patch({ iconPosition: e.target.value as IconPosition })}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </div>
            )}
          </div>
        </Card>

        {/* Live preview */}
        <div className="lg:sticky lg:top-5 lg:self-start">
          <Card variant="bordered" className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-medium text-slate-700">Live preview</span>
              <span className="text-xs font-medium tabular-nums text-slate-400">{size.name}</span>
            </div>
            <div className="flex min-h-[420px] items-center justify-center bg-slate-100 p-6">
              {previewError ? (
                <p className="text-sm text-danger">{previewError}</p>
              ) : (
                <div className="relative w-full max-w-md">
                  {previewLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Updating…
                      </span>
                    </div>
                  )}
                  {previewUrl && (
                    <iframe
                      title={`${label} preview`}
                      src={previewUrl}
                      className="h-[380px] w-full rounded-lg border border-slate-300 bg-white shadow-sm"
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
          <p className="mt-3 px-1 text-xs text-slate-500">
            Print at 100% scale. For silent, exact-size printing straight to a thermal printer, enable{' '}
            <span className="font-medium text-slate-600">Direct label printing</span> in Settings →
            Preferences (installs the free QZ Tray helper). Otherwise labels open in the browser print
            dialog.
          </p>
        </div>
      </div>
    </div>
  );
};

interface ToggleRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ icon: Icon, label, hint, checked, disabled, onChange }) => (
  <div className={['flex items-start gap-3', disabled ? 'opacity-60' : ''].join(' ')}>
    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
    <div className="min-w-0 flex-1">
      <p className="text-sm text-slate-800">{label}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-slate-300',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  </div>
);

const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
    />
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </label>
);
