import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Plus,
  CheckCircle,
  XCircle,
  Search,
  X,
  Package,
  Filter,
} from 'lucide-react';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  getStockAdjustments,
  createStockAdjustment,
  approveStockAdjustment,
  getStockItems,
  type StockItemWithCategory,
} from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const REASONS = [
  'Physical Count',
  'Damage',
  'Expiry',
  'Correction',
  'Write Off',
] as const;

interface AdjustmentItem {
  stock_item_id: string;
  name: string;
  sku: string | null;
  system_quantity: number;
  counted_quantity: number;
  notes: string;
}

interface NewAdjustmentForm {
  adjustment_date: string;
  reason: string;
  notes: string;
}

function getStatusVariant(status: string): 'warning' | 'success' | 'default' {
  if (status === 'draft') return 'warning';
  if (status === 'approved') return 'success';
  return 'default';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const StockAdjustmentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [form, setForm] = useState<NewAdjustmentForm>({
    adjustment_date: new Date().toISOString().split('T')[0],
    reason: 'Physical Count',
    notes: '',
  });

  const [itemSearch, setItemSearch] = useState('');
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentItem[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: stockKeys.adjustments(),
    queryFn: getStockAdjustments,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: stockKeys.items(),
    queryFn: () => getStockItems(),
    enabled: isModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createStockAdjustment>[0]) =>
      createStockAdjustment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.adjustments() });
      toast.success('Adjustment created successfully');
      closeModal();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create adjustment');
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      approveStockAdjustment(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.adjustments() });
      queryClient.invalidateQueries({ queryKey: stockKeys.items() });
      toast.success('Adjustment approved and stock updated');
      setApprovingId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to approve adjustment');
      setApprovingId(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stock_adjustment_sessions')
        .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.adjustments() });
      toast.success('Adjustment cancelled');
      setCancellingId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel adjustment');
      setCancellingId(null);
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setForm({
      adjustment_date: new Date().toISOString().split('T')[0],
      reason: 'Physical Count',
      notes: '',
    });
    setAdjustmentItems([]);
    setItemSearch('');
  };

  const filteredStockItems = stockItems.filter(
    (item) =>
      !adjustmentItems.some((ai) => ai.stock_item_id === item.id) &&
      (item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (item.sku ?? '').toLowerCase().includes(itemSearch.toLowerCase()) ||
        (item.brand ?? '').toLowerCase().includes(itemSearch.toLowerCase()))
  );

  const addItem = (item: StockItemWithCategory) => {
    const qty = item.current_quantity ?? 0;
    setAdjustmentItems((prev) => [
      ...prev,
      {
        stock_item_id: item.id,
        name: item.name,
        sku: item.sku,
        system_quantity: qty,
        counted_quantity: qty,
        notes: '',
      },
    ]);
    setItemSearch('');
  };

  const removeItem = (itemId: string) => {
    setAdjustmentItems((prev) => prev.filter((i) => i.stock_item_id !== itemId));
  };

  const updateItem = (itemId: string, field: 'counted_quantity' | 'notes', value: string | number) => {
    setAdjustmentItems((prev) =>
      prev.map((i) =>
        i.stock_item_id === itemId ? { ...i, [field]: value } : i
      )
    );
  };

  const handleSave = async () => {
    if (!form.adjustment_date) {
      toast.error('Please select an adjustment date');
      return;
    }
    if (adjustmentItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    setSaving(true);
    try {
      // tenant_id is supplied by createStockAdjustment via requireTenantId().
      await createMutation.mutateAsync({
        reason: form.reason,
        notes: form.notes || null,
        started_by: user?.id ?? null,
        items: adjustmentItems.map((i) => ({
          stock_item_id: i.stock_item_id,
          system_quantity: i.system_quantity,
          counted_quantity: i.counted_quantity,
          notes: i.notes || undefined,
        })),
      } as Parameters<typeof createMutation.mutateAsync>[0]);
    } finally {
      setSaving(false);
    }
  };

  const filtered = adjustments.filter(
    (a) => !statusFilter || a.status === statusFilter
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeaderSlot
        title="Stock Adjustments"
        actions={
          <Button onClick={() => setIsModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Adjustment
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filter by status:</span>
          <div className="flex items-center gap-2">
            {['', 'draft', 'approved', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No adjustments found</p>
            <p className="text-slate-400 text-sm mt-1">Create a new stock adjustment to get started</p>
            <Button onClick={() => setIsModalOpen(true)} size="sm" className="mt-4">
              <Plus className="w-4 h-4 mr-1.5" />
              New Adjustment
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Adj #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((adj) => (
                  <tr
                    key={adj.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-primary">
                      {adj.session_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(adj.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{adj.reason ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusVariant(adj.status ?? 'draft')} size="sm">
                        {(adj.status ?? 'draft').charAt(0).toUpperCase() + (adj.status ?? 'draft').slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                      {adj.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(adj.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {adj.status === 'draft' && (
                        <div className="flex items-center gap-1.5">
                          {approvingId === adj.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-success font-medium">Approve?</span>
                              <button
                                onClick={() =>
                                  approveMutation.mutate({
                                    id: adj.id,
                                    userId: user?.id ?? '',
                                  })
                                }
                                className="px-2 py-1 text-xs bg-success text-success-foreground rounded hover:bg-success/90 font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setApprovingId(null)}
                                className="px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-medium"
                              >
                                No
                              </button>
                            </div>
                          ) : cancellingId === adj.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-danger font-medium">Cancel?</span>
                              <button
                                onClick={() => cancelMutation.mutate(adj.id)}
                                className="px-2 py-1 text-xs bg-danger text-danger-foreground rounded hover:bg-danger/90 font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setCancellingId(null)}
                                className="px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-medium"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setApprovingId(adj.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-success-muted text-success rounded-md hover:bg-success-muted/80 font-medium transition-colors border border-success/30"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => setCancellingId(adj.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-danger-muted text-danger rounded-md hover:bg-danger-muted/80 font-medium transition-colors border border-danger/30"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="New Stock Adjustment"
        icon={ClipboardList}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Adjustment Date"
              type="date"
              required
              value={form.adjustment_date}
              onChange={(e) => setForm((f) => ({ ...f, adjustment_date: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason <span className="text-danger">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes about this adjustment..."
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Items ({adjustmentItems.length})
              </h3>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="Search stock items by name, SKU or brand..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </div>

            {itemSearch.trim() && filteredStockItems.length > 0 && (
              <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto mb-3 shadow-sm">
                {filteredStockItems.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/10 text-left transition-colors border-b border-slate-100 last:border-0"
                  >
                    <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.sku && <span className="font-mono mr-2">{item.sku}</span>}
                        Qty: {item.current_quantity}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {itemSearch.trim() && filteredStockItems.length === 0 && (
              <div className="text-center py-4 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg mb-3">
                No matching items found
              </div>
            )}

            {adjustmentItems.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Item</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">
                        System Qty
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">
                        Counted Qty
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-20">
                        Variance
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Notes</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {adjustmentItems.map((item) => {
                      const variance = item.counted_quantity - item.system_quantity;
                      return (
                        <tr key={item.stock_item_id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-900">{item.name}</p>
                            {item.sku && (
                              <p className="text-xs font-mono text-slate-500">{item.sku}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-600 font-mono">
                            {item.system_quantity}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                              value={item.counted_quantity}
                              onChange={(e) =>
                                updateItem(
                                  item.stock_item_id,
                                  'counted_quantity',
                                  parseInt(e.target.value, 10) || 0
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-semibold">
                            <span
                              className={
                                variance > 0
                                  ? 'text-success'
                                  : variance < 0
                                  ? 'text-danger'
                                  : 'text-slate-400'
                              }
                            >
                              {variance > 0 ? '+' : ''}
                              {variance}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="Optional notes"
                              value={item.notes}
                              onChange={(e) =>
                                updateItem(item.stock_item_id, 'notes', e.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeItem(item.stock_item_id)}
                              className="p-1 hover:bg-danger-muted rounded text-slate-400 hover:text-danger transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {adjustmentItems.length === 0 && !itemSearch && (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Search for items above to add them</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || adjustmentItems.length === 0}>
              {saving ? 'Creating...' : 'Create Adjustment'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StockAdjustmentsPage;
