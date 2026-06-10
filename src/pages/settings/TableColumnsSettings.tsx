import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, Columns3, Loader2, Lock, LockOpen } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { casesColumns, CASES_TABLE_KEY } from '../../lib/tables/casesColumns';
import { getTenantTableColumns, setTenantTableColumns } from '../../lib/tablePrefsService';

/**
 * Tenant defaults for configurable tables (cases list today). Controls which
 * columns are visible by default, their order, and which are locked so users
 * cannot hide them. Users refine within these defaults from the table's
 * "Columns" button.
 */
export const TableColumnsSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const registryKeys = useMemo(() => casesColumns.map((c) => c.key), []);
  const labelByKey = useMemo(() => new Map(casesColumns.map((c) => [c.key, c.label])), []);
  const defaultVisible = useMemo(
    () => casesColumns.filter((c) => c.defaultVisible).map((c) => c.key),
    [],
  );

  const { data: tenantConfig, isLoading } = useQuery({
    queryKey: ['table_columns', 'tenant', CASES_TABLE_KEY],
    queryFn: () => getTenantTableColumns(CASES_TABLE_KEY),
  });

  const [order, setOrder] = useState<string[]>(registryKeys);
  const [visible, setVisible] = useState<Set<string>>(new Set(defaultVisible));
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const known = new Set(registryKeys);
    const savedOrder = (tenantConfig?.order ?? []).filter((k) => known.has(k));
    setOrder([...savedOrder, ...registryKeys.filter((k) => !savedOrder.includes(k))]);
    const savedVisible = (tenantConfig?.visible ?? []).filter((k) => known.has(k));
    setVisible(new Set(savedVisible.length > 0 ? savedVisible : defaultVisible));
    setLocked(new Set((tenantConfig?.locked ?? []).filter((k) => known.has(k))));
    setDirty(false);
  }, [tenantConfig, isLoading, registryKeys, defaultVisible]);

  const toggleVisible = (key: string) => {
    if (locked.has(key)) return;
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const toggleLocked = (key: string) => {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // A locked column is always visible.
        setVisible((v) => new Set(v).add(key));
      }
      return next;
    });
    setDirty(true);
  };

  const move = (key: string, delta: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setTenantTableColumns(CASES_TABLE_KEY, {
        visible: order.filter((k) => visible.has(k)),
        order,
        locked: order.filter((k) => locked.has(k)),
      });
      await queryClient.invalidateQueries({ queryKey: ['table_columns', 'tenant', CASES_TABLE_KEY] });
      toast.success('Default columns saved for all users');
      setDirty(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save column defaults');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to Settings</span>
      </button>

      <div className="mb-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-primary">
          <Columns3 className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Table Columns</h1>
          <p className="text-slate-600 text-sm">
            Default columns for the Cases table, for everyone in this workspace. Users can still
            show, hide and reorder columns for themselves — except locked ones. Columns that don't
            fit a window collapse into the row expander instead of horizontal scrolling.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Cases table</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading current defaults…
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {order.map((key, idx) => (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <input
                  id={`tenant-col-${key}`}
                  type="checkbox"
                  checked={visible.has(key)}
                  disabled={locked.has(key)}
                  onChange={() => toggleVisible(key)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                />
                <label htmlFor={`tenant-col-${key}`} className="flex-1 text-sm text-slate-900">
                  {labelByKey.get(key) ?? key}
                </label>
                <button
                  type="button"
                  onClick={() => toggleLocked(key)}
                  aria-pressed={locked.has(key)}
                  aria-label={locked.has(key) ? `Unlock ${labelByKey.get(key)}` : `Lock ${labelByKey.get(key)} (users cannot hide it)`}
                  title={locked.has(key) ? 'Locked — users cannot hide this column' : 'Lock so users cannot hide this column'}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    locked.has(key)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  {locked.has(key) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => move(key, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${labelByKey.get(key)} up`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(key, 1)}
                  disabled={idx === order.length - 1}
                  aria-label={`Move ${labelByKey.get(key)} down`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
          <Button onClick={handleSave} disabled={isSaving || isLoading || !dirty}>
            {isSaving ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </div>
    </div>
  );
};
