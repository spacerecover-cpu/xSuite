import React, { useState, useRef } from 'react';
import { Search, Scan, X } from 'lucide-react';
import { getStockItemByBarcode, getSerialNumberByBarcode, type StockItemWithCategory, type StockSerialNumber } from '../../lib/stockService';
import { useToast } from '../../hooks/useToast';

interface LookupResult {
  item: StockItemWithCategory | null;
  serial: StockSerialNumber | null;
}

interface Props {
  onItemFound?: (item: StockItemWithCategory) => void;
  onSerialFound?: (serial: StockSerialNumber, item?: StockItemWithCategory | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export const BarcodeLookupInput: React.FC<Props> = ({
  onItemFound,
  onSerialFound,
  placeholder = 'Scan or type barcode / serial number...',
  label,
  className = '',
}) => {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [lastResult, setLastResult] = useState<LookupResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const performLookup = async (barcode: string) => {
    if (!barcode.trim()) return;
    setIsLooking(true);
    try {
      const [item, serial] = await Promise.all([
        getStockItemByBarcode(barcode),
        getSerialNumberByBarcode(barcode),
      ]);

      setLastResult({ item, serial });

      if (item && onItemFound) {
        onItemFound(item);
        setValue('');
        return;
      }

      if (serial && onSerialFound) {
        if (!item && serial.item_id) {
          const itemForSerial = await getStockItemByBarcode(barcode).catch(() => null);
          onSerialFound(serial, itemForSerial);
        } else {
          onSerialFound(serial, item);
        }
        setValue('');
        return;
      }

      if (!item && !serial) {
        toast.error(`No item found for barcode: ${barcode}`);
      }
    } catch (err) {
      toast.error('Lookup failed');
    } finally {
      setIsLooking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performLookup(value);
    }
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {isLooking ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Scan className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setLastResult(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-16 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={() => { setValue(''); setLastResult(null); inputRef.current?.focus(); }}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => performLookup(value)}
            disabled={!value.trim() || isLooking}
            className="p-1 rounded hover:bg-primary/10 text-primary transition-colors disabled:opacity-40"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {lastResult && (
        <div className="text-xs mt-1">
          {lastResult.item && (
            <span className="inline-flex items-center gap-1 text-success bg-success-muted px-2 py-0.5 rounded">
              Found: {lastResult.item.name}
            </span>
          )}
          {lastResult.serial && (
            <span className="inline-flex items-center gap-1 text-info bg-info-muted px-2 py-0.5 rounded">
              Serial: {lastResult.serial.serial_number}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
