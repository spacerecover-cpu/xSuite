import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../../ui/Input';
import { ColorField, FieldGroup, ToggleRow } from '../controls';
import { PDF_COLORS } from '../../../../lib/pdf/styles';
import type { StudioApi } from '../TemplateStudio';

export const TableTab: React.FC<{ api: StudioApi }> = ({ api }) => {
  const li = api.resolved.sections.find((s) => s.key === 'lineItems');
  const columns = li?.columns ?? [];
  const table = api.resolved.table;

  return (
    <div className="space-y-7">
      <FieldGroup title="Columns" description="Show, hide, or rename the item-table columns.">
        {columns.length === 0 ? (
          <p className="text-sm text-slate-500">This document has no item table.</p>
        ) : (
          <ul className="space-y-3">
            {columns.map((col) => (
              <li key={col.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800">{col.label.en}</span>
                  <button
                    onClick={() => api.patchColumn(col.key, { visible: !col.visible })}
                    aria-pressed={col.visible}
                    aria-label={`${col.visible ? 'Hide' : 'Show'} ${col.label.en}`}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      col.visible ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-500',
                    ].join(' ')}
                  >
                    {col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {col.visible ? 'Shown' : 'Hidden'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label={`${col.label.en} label (English)`} placeholder="Label (EN)" value={col.label.en} onChange={(e) => api.patchColumn(col.key, { labelEn: e.target.value })} />
                  <Input aria-label={`${col.label.en} label (Arabic)`} placeholder="التسمية (AR)" dir="rtl" value={col.label.ar ?? ''} onChange={(e) => api.patchColumn(col.key, { labelAr: e.target.value })} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </FieldGroup>

      <FieldGroup title="Table style" description="Header fill and row treatments.">
        <ColorField
          label="Header background"
          value={table?.headerBackground}
          neutral={PDF_COLORS.headerBg}
          onChange={(hex) => api.setTable({ headerBackground: hex })}
          againstLabel="vs text"
          against={api.resolved.colors?.text ?? PDF_COLORS.text}
        />
        <ToggleRow label="Row numbers (S/N)" description="Prepend a serial-number column." checked={table?.rowNumbering ?? false} onChange={(v) => api.setTable({ rowNumbering: v })} />
        <ToggleRow label="Zebra striping" description="Alternate row background fill." checked={table?.zebra ?? false} onChange={(v) => api.setTable({ zebra: v })} />
      </FieldGroup>
    </div>
  );
};
