import React from 'react';
import { HardDrive, Check } from 'lucide-react';
import type { StockItemWithCategory } from '../../lib/stockService';
import { useCurrency } from '../../hooks/useCurrency';

interface SaleableItemsGridProps {
  items: StockItemWithCategory[];
  onSelect: (item: StockItemWithCategory) => void;
  selectedIds: string[];
}

export const SaleableItemsGrid: React.FC<SaleableItemsGridProps> = ({
  items,
  onSelect,
  selectedIds,
}) => {
  const { formatCurrency } = useCurrency();
  const formatPrice = (price: number | null): string =>
    price === null || price === undefined ? '—' : formatCurrency(price);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <HardDrive className="w-10 h-10 mb-3" />
        <p className="text-sm">No items found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => {
        const isSelected = selectedIds.includes(item.id);
        const currentQty = item.current_quantity ?? 0;
        const inStock = currentQty > 0;
        const primaryPhoto = item.photos?.[0] ?? null;

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className={`relative bg-white rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
              isSelected
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 z-10 bg-primary rounded-full p-0.5">
                <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
              </div>
            )}

            <div className="aspect-video bg-slate-100 rounded-t-md overflow-hidden flex items-center justify-center">
              {primaryPhoto ? (
                <img
                  src={primaryPhoto}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                  <HardDrive className="w-10 h-10" />
                </div>
              )}
            </div>

            <div className="p-3 space-y-2">
              <p className="font-semibold text-slate-900 text-sm leading-tight line-clamp-2">
                {item.name}
              </p>

              <p className="text-xs text-slate-500 truncate">
                {[item.brand, item.sku].filter(Boolean).join(' · ')}
              </p>

              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-slate-900">
                  {formatPrice(item.selling_price)}
                </span>

                {inStock ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-muted text-success ring-1 ring-success/30 whitespace-nowrap">
                    In Stock {currentQty}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-muted text-danger ring-1 ring-danger/30 whitespace-nowrap">
                    Out of Stock
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item);
                }}
                className={`w-full py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isSelected ? 'Selected' : 'Select'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
