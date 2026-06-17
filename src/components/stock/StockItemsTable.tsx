import { Eye, Pencil, Trash2, PackagePlus, PackageMinus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { StockItemWithCategory } from '../../lib/stockService';
import { useCurrency } from '../../hooks/useCurrency';

interface StockItemsTableProps {
  items: StockItemWithCategory[];
  onEdit: (item: StockItemWithCategory) => void;
  onDelete: (item: StockItemWithCategory) => void;
  onViewDetail: (item: StockItemWithCategory) => void;
  onReceive: (item: StockItemWithCategory) => void;
  onRecordUsage: (item: StockItemWithCategory) => void;
  isLoading: boolean;
}

function computeMargin(
  costPrice: number | null,
  sellingPrice: number | null
): number | null {
  if (costPrice == null || sellingPrice == null || sellingPrice === 0) return null;
  return ((sellingPrice - costPrice) / sellingPrice) * 100;
}

function MarginCell({ margin }: { margin: number | null }) {
  if (margin === null) {
    return <span className="text-slate-400 text-xs">N/A</span>;
  }
  const colorClass =
    margin >= 30
      ? 'text-success'
      : margin >= 15
      ? 'text-warning'
      : 'text-danger';
  return (
    <span className={`text-sm font-medium tabular-nums ${colorClass}`}>
      {margin.toFixed(1)}%
    </span>
  );
}

function ItemTypeBadge({ itemType }: { itemType: string | null }) {
  if (itemType === 'internal') {
    return <Badge variant="default" size="sm">Internal</Badge>;
  }
  if (itemType === 'saleable') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-info-muted text-info ring-1 ring-info/30">
        Saleable
      </span>
    );
  }
  if (itemType === 'both') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-cat-2/10 text-cat-2 ring-1 ring-cat-2/20">
        Both
      </span>
    );
  }
  return <Badge variant="default" size="sm">{itemType}</Badge>;
}

export function StockItemsTable({
  items,
  onEdit,
  onDelete,
  onViewDetail,
  onReceive,
  onRecordUsage,
  isLoading,
}: StockItemsTableProps) {
  const { formatCurrency } = useCurrency();
  const formatPrice = (value: number | null): string =>
    value == null ? '—' : formatCurrency(value);

  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
            <tr>
              {[
                'SKU', 'Item', 'Category', 'Type', 'Qty', 'Reserved',
                'Available', 'Cost', 'Selling', 'Margin', 'Status', 'Actions',
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 12 }).map((__, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-slate-200 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
          <tr>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
              SKU
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Item
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Category
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Qty
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Reserved
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Available
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Cost
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Selling
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Margin
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={12}
                className="px-6 py-12 text-center text-sm text-slate-500"
              >
                No stock items found
              </td>
            </tr>
          ) : (
            items.map((item, idx) => {
              const currentQty = item.current_quantity ?? 0;
              const reservedQty = item.quantity_reserved ?? 0;
              const minQty = item.minimum_quantity ?? 0;
              const available = currentQty - reservedQty;
              const margin = computeMargin(item.cost_price, item.selling_price);

              return (
                <tr
                  key={item.id}
                  className={`transition-all duration-150 hover:bg-slate-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.sku ? (
                      <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {item.sku}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="max-w-[220px]">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.name}
                      </p>
                      {item.brand && (
                        <p className="text-xs text-slate-500 truncate">
                          {item.brand}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-slate-600">
                      {item.stock_categories?.name ?? (
                        <span className="text-slate-400">—</span>
                      )}
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <ItemTypeBadge itemType={item.item_type} />
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="text-sm font-medium tabular-nums text-slate-900">
                      {currentQty}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="text-sm tabular-nums text-slate-600">
                      {reservedQty}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        available <= 0
                          ? 'text-danger'
                          : available <= minQty
                          ? 'text-warning'
                          : 'text-slate-900'
                      }`}
                    >
                      {available}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="text-sm tabular-nums text-slate-700">
                      {formatPrice(item.cost_price)}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="text-sm tabular-nums text-slate-700">
                      {formatPrice(item.selling_price)}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <MarginCell margin={margin} />
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.is_active ? (
                      <Badge variant="success" size="sm">Active</Badge>
                    ) : (
                      <Badge variant="danger" size="sm">Inactive</Badge>
                    )}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onViewDetail(item)}
                        title="View"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onEdit(item)}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onReceive(item)}
                        title="Receive stock"
                        className="p-1.5 rounded hover:bg-success-muted text-slate-500 hover:text-success transition-colors"
                      >
                        <PackagePlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRecordUsage(item)}
                        title="Record usage"
                        className="p-1.5 rounded hover:bg-warning-muted text-slate-500 hover:text-warning transition-colors"
                      >
                        <PackageMinus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(item)}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-danger-muted text-slate-500 hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
