import React from 'react';
import {
  LABEL_SIZE_GROUPS,
  LABEL_SIZE_PRESETS,
  getLabelSize,
  sizeClass,
  supportsBarcode,
} from '../../lib/pdf/labels/labelSizes';

/** The design knobs a user may override for ONE print (never persisted). */
export interface LabelPrintOverrides {
  sizeId: string;
  copies: number;
  showQr: boolean;
  showBarcode: boolean;
}

interface LabelPrintOptionsFieldsProps {
  value: LabelPrintOverrides;
  onChange: (patch: Partial<LabelPrintOverrides>) => void;
  /** Unique prefix when two instances could share a page. */
  idPrefix?: string;
}

const clampCopies = (n: number): number => Math.max(1, Math.min(20, Math.floor(n) || 1));

/**
 * The one-off print controls shared by the LabelPrintDialog and the stock
 * PrintLabelsModal: label stock, copies, and the QR / barcode switches.
 * Pure controlled component — the caller owns the state and decides what the
 * edited design is applied to.
 */
export const LabelPrintOptionsFields: React.FC<LabelPrintOptionsFieldsProps> = ({
  value,
  onChange,
  idPrefix = 'label-print',
}) => {
  const size = getLabelSize(value.sizeId);
  const barcodeCapable = supportsBarcode(size);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-size`} className="mb-1 block text-sm font-medium text-slate-700">
          Label stock
        </label>
        <select
          id={`${idPrefix}-size`}
          value={value.sizeId}
          onChange={(e) => onChange({ sizeId: e.target.value })}
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

      <div className="flex items-center gap-3">
        <label htmlFor={`${idPrefix}-copies`} className="flex-1 text-sm font-medium text-slate-700">
          Copies
        </label>
        <input
          id={`${idPrefix}-copies`}
          type="number"
          min={1}
          max={20}
          value={value.copies}
          onChange={(e) => onChange({ copies: clampCopies(Number(e.target.value)) })}
          className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50">
          <input
            type="checkbox"
            checked={value.showQr}
            onChange={(e) => onChange({ showQr: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="min-w-0 flex-1 truncate">QR code</span>
        </label>
        <label
          className={[
            'flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors',
            barcodeCapable ? 'cursor-pointer hover:bg-slate-50' : 'opacity-60',
          ].join(' ')}
          title={barcodeCapable ? undefined : 'Needs wider stock (≥ 50 × 25 mm)'}
        >
          <input
            type="checkbox"
            checked={barcodeCapable && value.showBarcode}
            disabled={!barcodeCapable}
            onChange={(e) => onChange({ showBarcode: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
          />
          <span className="min-w-0 flex-1 truncate">Barcode (Code128)</span>
        </label>
      </div>
    </div>
  );
};
