import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HardDrive, ChevronDown, ChevronUp, CheckSquare, Square, Package } from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { getRecommendedDevices } from '../../lib/stockService';
import { useCurrency } from '../../hooks/useCurrency';

interface BackupDeviceRecommendationProps {
  estimatedDataSizeGB: number;
  onAddToQuote: (items: Array<{ name: string; description: string; unit_price: number; quantity: number }>) => void;
}

export const BackupDeviceRecommendation: React.FC<BackupDeviceRecommendationProps> = ({
  estimatedDataSizeGB,
  onAddToQuote,
}) => {
  const { formatCurrency } = useCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['stock-recommended', estimatedDataSizeGB],
    queryFn: () => getRecommendedDevices(estimatedDataSizeGB),
    enabled: isExpanded,
  });

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToQuote = () => {
    const selectedItems = items.filter((i) => selected.has(i.id));
    const lineItems = selectedItems.map((item) => ({
      name: `${item.brand ? `${item.brand} ` : ''}${item.name}`,
      description: item.description ?? '',
      unit_price: item.selling_price ?? item.cost_price ?? 0,
      quantity: 1,
    }));
    onAddToQuote(lineItems);
    setSelected(new Set());
    setIsExpanded(false);
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-slate-800">Recommended Backup Devices</span>
          {estimatedDataSizeGB > 0 && (
            <span className="text-xs text-slate-500">
              (for {estimatedDataSizeGB >= 1024
                ? `${(estimatedDataSizeGB / 1024).toFixed(1)} TB`
                : `${estimatedDataSizeGB} GB`})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <Package className="w-8 h-8 mb-2" />
              <p className="text-sm">No saleable devices in stock</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Select devices to add as optional line items to the quote.
              </p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {items.map((item) => {
                  const isSelected = selected.has(item.id);
                  const available = (item.current_quantity ?? 0) - (item.quantity_reserved ?? 0);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-info-muted' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-shrink-0 text-primary">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4" />
                          : <Square className="w-4 h-4 text-slate-300" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {item.brand && <span className="text-slate-500 mr-1">{item.brand}</span>}
                          {item.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.description && (
                            <span className="text-xs text-slate-500">{item.description}</span>
                          )}
                          <span className="text-xs text-slate-400">
                            {available > 0 ? `${available} in stock` : 'Out of stock'}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrency(item.selling_price ?? item.cost_price ?? 0)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selected.size > 0 && (
                <Button size="sm" onClick={handleAddToQuote} className="w-full">
                  Add {selected.size} Device{selected.size !== 1 ? 's' : ''} to Quote
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
