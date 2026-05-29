import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  XCircle,
  Receipt,
  User,
  FileText,
  ExternalLink,
  ShoppingBag,
} from 'lucide-react';
import { stockKeys } from '../../lib/queryKeys';
import { getStockSale, cancelStockSale } from '../../lib/stockService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../hooks/useToast';

type SaleStatusVariant = 'warning' | 'success' | 'info' | 'secondary' | 'danger';

const saleStatusConfig: Record<string, { label: string; variant: SaleStatusVariant }> = {
  pending: { label: 'Pending', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partially Paid', variant: 'info' },
  refunded: { label: 'Refunded', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

export const StockSaleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: sale, isLoading, error } = useQuery({
    queryKey: stockKeys.sale(id!),
    queryFn: () => getStockSale(id!),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelStockSale(id!),
    onSuccess: () => {
      toast.success('Sale cancelled and stock restored');
      queryClient.invalidateQueries({ queryKey: stockKeys.sale(id!) });
      queryClient.invalidateQueries({ queryKey: stockKeys.sales() });
      queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
      setConfirmCancel(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to cancel sale');
      setConfirmCancel(false);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-10 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Sale not found</p>
          <p className="text-slate-400 text-sm mt-1">
            This sale may have been deleted or does not exist.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-6 gap-2"
            onClick={() => navigate('/resources/stock/sales')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sales
          </Button>
        </div>
      </div>
    );
  }

  const statusCfg =
    saleStatusConfig[sale.status ?? 'pending'] ?? saleStatusConfig['pending'];

  const items = sale.stock_sale_items ?? [];
  const canCancel = sale.status !== 'refunded' && sale.status !== 'cancelled';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 print:p-0 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate('/resources/stock/sales')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sales
        </button>

        <div className="flex items-center gap-2">
          {canCancel && (
            <>
              {confirmCancel ? (
                <div className="flex items-center gap-2 bg-danger-muted border border-danger/30 rounded-lg px-3 py-1.5">
                  <span className="text-sm text-danger font-medium">Confirm cancellation?</span>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="px-3 py-1 text-xs font-semibold text-danger-foreground bg-danger hover:bg-danger/90 rounded-md transition-colors disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="px-3 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 text-danger hover:bg-danger-muted border-danger/30"
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle className="w-4 h-4" />
                  Cancel / Refund
                </Button>
              )}
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-info-muted rounded-lg">
              <Receipt className="w-5 h-5 text-info" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Sale{' '}
                <span className="font-mono text-slate-700">
                  {sale.sale_number ?? sale.id.slice(0, 8).toUpperCase()}
                </span>
              </h2>
              <p className="text-sm text-slate-500">{formatDate(sale.sale_date)}</p>
            </div>
          </div>
          <Badge variant={statusCfg.variant} size="md">
            {statusCfg.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="px-6 py-4 flex items-start gap-3">
            <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Customer
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate">
                {sale.customers_enhanced?.customer_name ?? '—'}
              </p>
              {sale.customers_enhanced?.email && (
                <p className="text-xs text-slate-500 truncate">
                  {sale.customers_enhanced.email}
                </p>
              )}
            </div>
          </div>

          <div className="px-6 py-4 flex items-start gap-3">
            <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Linked Case
              </p>
              {sale.cases ? (
                <Link
                  to={`/cases/${sale.cases.id}`}
                  className="text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <span className="font-mono">{sale.cases.case_no}</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              ) : (
                <p className="text-sm text-slate-400">No case linked</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Line Items
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Item
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  SKU
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Qty
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Unit Price
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Discount
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Tax
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  Line Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    No line items
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                  >
                    <td className="px-4 py-3">
                      <div className="max-w-[200px]">
                        <p className="font-medium text-slate-900 truncate">
                          {item.stock_items?.name ?? '—'}
                        </p>
                        {item.stock_items?.brand && (
                          <p className="text-xs text-slate-500 truncate">
                            {item.stock_items.brand}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.stock_items?.sku ? (
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {item.stock_items.sku}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium text-slate-900">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-slate-700">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-slate-500">
                      {(item.discount ?? 0) > 0
                        ? formatCurrency(item.discount)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-slate-500">
                      {(item.tax_amount ?? 0) > 0
                        ? formatCurrency(item.tax_amount)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-semibold text-slate-900">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/60">
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(sale.subtotal)}</span>
            </div>

            {(sale.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Discount</span>
                <span className="tabular-nums">
                  -{formatCurrency(sale.discount_amount)}
                </span>
              </div>
            )}

            {(sale.tax_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax</span>
                <span className="tabular-nums">{formatCurrency(sale.tax_amount)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(sale.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {sale.notes && (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Notes
          </h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{sale.notes}</p>
        </div>
      )}

    </div>
  );
};

export default StockSaleDetailPage;
