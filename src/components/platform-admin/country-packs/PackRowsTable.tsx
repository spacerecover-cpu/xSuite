import React, { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '../../ui/Button';
import { logger } from '../../../lib/logger';

export interface PackColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => React.ReactNode;
  input?: { type: 'text' | 'number' | 'date' | 'select' | 'json'; options?: string[]; required?: boolean };
}

export interface PackRowsTableProps<Row extends { id: string }> {
  title: string;
  rows: Row[];
  columns: PackColumn<Row>[];
  disabled: boolean;
  onSave: (draft: Record<string, unknown>, existing: Row | null) => Promise<void>;
}

export function PackRowsTable<Row extends { id: string }>({
  title, rows, columns, disabled, onSave,
}: PackRowsTableProps<Row>) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = columns.filter((c) => c.input);

  const open = (row: Row | null) => {
    setEditing(row);
    setAdding(row === null);
    setError(null);
    setDraft(row ? Object.fromEntries(editable.map((c) => [c.key, (row as Record<string, unknown>)[c.key]])) : {});
  };
  const close = () => { setEditing(null); setAdding(false); setDraft({}); };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, editing);
      close();
    } catch (e) {
      logger.error(`PackRowsTable(${title}) save failed:`, e);
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, type: string, raw: string) =>
    setDraft((d) => ({
      ...d,
      // Empty numeric input clears to undefined (dropped from the JSON payload → the RPC
      // sees an absent key → NULL), NOT Number('')===0 which would persist a spurious 0
      // (and, for max_length, then false-block publish on the numbering coverage gate).
      [key]: type === 'number' ? (raw === '' ? undefined : Number(raw)) : type === 'json' ? safeJson(raw) : raw,
    }));
  const safeJson = (raw: string): unknown => {
    try { return JSON.parse(raw); } catch { return raw; }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => open(null)}>
          <Plus className="mr-1 h-4 w-4" /> Add row
        </Button>
      </div>
      {disabled && <p className="text-xs text-slate-500">Create a draft to edit this dimension.</p>}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              {columns.map((c) => <th key={c.key} className="px-3 py-2">{c.label}</th>)}
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-slate-500">No rows</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {columns.map((c) => <td key={c.key} className="px-3 py-1.5">{c.render(row)}</td>)}
                <td className="px-3 py-1.5">
                  <button aria-label={`Edit ${row.id}`} disabled={disabled}
                          className="text-slate-500 hover:text-primary disabled:opacity-40"
                          onClick={() => open(row)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
          {editable.map((c) => (
            <div key={c.key}>
              <label htmlFor={`prt-${c.key}`} className="mb-1 block text-sm font-medium">{c.label}</label>
              {c.input!.type === 'select' ? (
                <select id={`prt-${c.key}`} aria-label={c.label}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        value={String(draft[c.key] ?? '')}
                        onChange={(e) => setField(c.key, 'text', e.target.value)}>
                  <option value="">—</option>
                  {c.input!.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.input!.type === 'json' ? (
                <textarea id={`prt-${c.key}`} aria-label={c.label} rows={4}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
                          value={typeof draft[c.key] === 'string' ? String(draft[c.key]) : JSON.stringify(draft[c.key] ?? null, null, 2)}
                          onChange={(e) => setField(c.key, 'json', e.target.value)} />
              ) : (
                <input id={`prt-${c.key}`} aria-label={c.label}
                       type={c.input!.type} required={c.input!.required}
                       className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                       value={String(draft[c.key] ?? '')}
                       onChange={(e) => setField(c.key, c.input!.type, e.target.value)} />
              )}
            </div>
          ))}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
