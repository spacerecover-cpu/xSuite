import { useEffect, useState, useCallback } from 'react';
import { Plus, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  listTenantCurrencies,
  listAddableCurrencies,
  addTenantCurrency,
  setCurrencyActive,
  type TenantCurrencyRow,
} from '../../lib/tenantCurrencyService';

export function CurrencySettings() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const toast = useToast();
  const [rows, setRows] = useState<TenantCurrencyRow[]>([]);
  const [addable, setAddable] = useState<{ code: string; name: string | null }[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([listTenantCurrencies(), listAddableCurrencies()]);
      setRows(r);
      setAddable(a);
      setSelected(a[0]?.code ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load currencies');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onAdd = async () => {
    if (!selected) return;
    try {
      await addTenantCurrency(selected);
      toast.success(`${selected} added`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add currency');
    }
  };

  const onToggle = async (row: TenantCurrencyRow) => {
    try {
      await setCurrencyActive(row.id, !row.is_active);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update currency');
    }
  };

  if (loading) return <div className="p-6 text-surface-muted">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">Currencies</h1>
        <p className="text-sm text-surface-muted">
          Your base (reporting) currency is locked once you have financial documents. Add the
          transaction currencies you invoice in.
        </p>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.currency_code}</span>
              {row.is_base && (
                <span className="inline-flex items-center gap-1 text-xs text-accent-foreground">
                  <Star className="h-3 w-3" /> Base
                </span>
              )}
              {!row.is_active && (
                <span className="text-xs text-surface-muted">inactive</span>
              )}
            </div>
            {isAdmin && !row.is_base && (
              <button
                onClick={() => onToggle(row)}
                className="text-sm text-primary hover:underline"
              >
                {row.is_active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && addable.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-2 text-sm"
          >
            {addable.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}{c.name ? ` — ${c.name}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add currency
          </button>
        </div>
      )}
    </div>
  );
}
