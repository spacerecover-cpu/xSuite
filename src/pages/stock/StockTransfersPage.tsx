import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, Search, Eye } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StockTransferModal } from '../../components/stock/StockTransferModal';
import { getStockTransfers } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'info' | 'secondary' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending: { label: 'Pending', variant: 'warning' },
  in_transit: { label: 'In Transit', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

function formatDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const StockTransfersPage: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: stockKeys.transfers(),
    queryFn: () => getStockTransfers(),
  });

  const filtered = transfers.filter((t) => {
    const matchSearch =
      !search ||
      t.transfer_number?.toLowerCase().includes(search.toLowerCase()) ||
      t.from_location?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.to_location?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.notes?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Stock Transfers"
        description="Move stock between locations"
        icon={ArrowRightLeft}
        actions={
          <Button variant="primary" size="sm" className="gap-2" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" />
            New Transfer
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transfers..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="">All Statuses</option>
          {Object.entries(statusConfig).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <ArrowRightLeft className="w-10 h-10 opacity-30" />
            <p className="text-sm">{search || statusFilter ? 'No transfers match your filters' : 'No transfers yet'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Transfer #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">From</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">To</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Items</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => {
                const cfg = statusConfig[t.status] ?? { label: t.status, variant: 'secondary' as const };
                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-slate-800">{t.transfer_number ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.from_location?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{t.to_location?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600">
                      {t.stock_transfer_items?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/stock/transfers/${t.id}`}>
                        <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <StockTransferModal onClose={() => setShowModal(false)} />
      )}
    </div>
  );
};

export default StockTransfersPage;
