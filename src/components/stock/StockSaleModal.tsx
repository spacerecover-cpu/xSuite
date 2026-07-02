import React, { useId, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Skeleton } from '../ui/Skeleton';
import { SaleableItemsGrid } from './SaleableItemsGrid';
import { BarcodeLookupInput } from './BarcodeLookupInput';
import { SerialNumberSelect } from './SerialNumberSelect';
import {
  getSaleableItems,
  getAvailableSerialNumbers,
  createStockSale,
  type StockItemWithCategory,
  type StockSaleCreateData,
  type StockSerialNumber,
} from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';

interface SerialLinePickerProps {
  itemId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

const SerialLinePicker: React.FC<SerialLinePickerProps> = ({ itemId, value, onChange }) => {
  const { data: serials = [] } = useQuery({
    queryKey: stockKeys.serialNumbers(itemId),
    queryFn: () => getAvailableSerialNumbers(itemId),
    enabled: !!itemId,
  });

  if (serials.length === 0) return null;

  return (
    <div className="pt-1">
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        Serial Number
      </label>
      <SerialNumberSelect
        itemId={itemId}
        value={value}
        onChange={onChange}
        disabled={false}
      />
    </div>
  );
};

interface CartLine {
  item: StockItemWithCategory;
  quantity: number;
  unit_price: number;
  serial_number: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface StockSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId?: string;
  caseId?: string;
  onSuccess: (saleId: string) => void;
}

export const StockSaleModal: React.FC<StockSaleModalProps> = ({
  isOpen,
  onClose,
  customerId,
  caseId,
  onSuccess,
}) => {
  const toast = useToast();
  const { formatCurrency } = useCurrency();
  const paymentMethodFieldId = useId();
  const notesFieldId = useId();

  const [allItems, setAllItems] = useState<StockItemWithCategory[]>([]);
  const [filteredItems, setFilteredItems] = useState<StockItemWithCategory[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? '');
  const [linkedCaseId, setLinkedCaseId] = useState(caseId ?? '');

  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const items = await getSaleableItems();
      setAllItems(items);
      setFilteredItems(items);
    } catch {
      toast.error('Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadItems();
      setCart([]);
      setSearch('');
      setSelectedCustomerId(customerId ?? '');
      setLinkedCaseId(caseId ?? '');
      setDiscountType('none');
      setDiscountValue('');
      setPaymentMethod('cash');
      setNotes('');
    }
  }, [isOpen, customerId, caseId, loadItems]);

  useEffect(() => {
    const lower = search.toLowerCase();
    if (!lower) {
      setFilteredItems(allItems);
    } else {
      setFilteredItems(
        allItems.filter(
          (i) =>
            i.name.toLowerCase().includes(lower) ||
            (i.brand ?? '').toLowerCase().includes(lower) ||
            (i.sku ?? '').toLowerCase().includes(lower)
        )
      );
    }
  }, [search, allItems]);

  const searchCustomers = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setCustomers([]);
      return;
    }
    const s = sanitizeFilterValue(term);
    const { data } = await supabase
      .from('customers_enhanced')
      .select('id, customer_name, email, mobile_number, customer_number')
      .is('deleted_at', null)
      .or(`customer_name.ilike.%${s}%,email.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`)
      .limit(20);
    setCustomers(
      (data ?? []).map((c) => ({
        id: c.id,
        name: c.customer_name ?? c.email ?? c.id,
      }))
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, searchCustomers]);

  const handleSelectItem = (item: StockItemWithCategory) => {
    const maxQty = item.current_quantity ?? 0;
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id
            ? { ...l, quantity: Math.min(l.quantity + 1, maxQty) }
            : l
        );
      }
      return [
        ...prev,
        { item, quantity: 1, unit_price: item.selling_price ?? 0, serial_number: null },
      ];
    });
  };

  const handleBarcodeItem = (item: StockItemWithCategory) => {
    handleSelectItem(item);
    toast.success(`Added: ${item.name}`);
  };

  const handleBarcodeSerial = (
    serial: StockSerialNumber,
    item: StockItemWithCategory | null | undefined
  ) => {
    if (!item) {
      toast.error('Serial found but no parent item is linked');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id
            ? { ...l, serial_number: serial.serial_number }
            : l
        );
      }
      return [
        ...prev,
        {
          item,
          quantity: 1,
          unit_price: item.selling_price ?? 0,
          serial_number: serial.serial_number,
        },
      ];
    });
    toast.success(`Added serial ${serial.serial_number}`);
  };

  const handleSerialChange = (itemId: string, serial: string | null) => {
    setCart((prev) =>
      prev.map((l) => (l.item.id === itemId ? { ...l, serial_number: serial } : l))
    );
  };

  const handleRemoveLine = (itemId: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId));
  };

  const handleQtyChange = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.item.id !== itemId) return l;
          const newQty = l.quantity + delta;
          if (newQty < 1) return null;
          if (newQty > (l.item.current_quantity ?? 0)) return l;
          return { ...l, quantity: newQty };
        })
        .filter((l): l is CartLine => l !== null)
    );
  };

  const handleUnitPriceChange = (itemId: string, value: string) => {
    const parsed = parseFloat(value);
    setCart((prev) =>
      prev.map((l) =>
        l.item.id === itemId ? { ...l, unit_price: isNaN(parsed) ? 0 : parsed } : l
      )
    );
  };

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const discountAmount = (() => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') return (subtotal * val) / 100;
    if (discountType === 'fixed') return Math.min(val, subtotal);
    return 0;
  })();

  const total = subtotal - discountAmount;

  const selectedIds = cart.map((l) => l.item.id);

  const handleSubmit = async () => {
    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Creating sale...');
    try {
      const payload: StockSaleCreateData = {
        customer_id: selectedCustomerId,
        case_id: linkedCaseId || null,
        payment_method: paymentMethod,
        notes: notes || null,
        discount_type: discountType === 'none' ? null : discountType,
        discount_value: discountType !== 'none' ? parseFloat(discountValue) || null : null,
        items: cart.map((l) => ({
          stock_item_id: l.item.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          cost_price: l.item.cost_price ?? null,
          serial_number: l.serial_number ?? null,
        })),
      };
      const sale = await createStockSale(payload);
      toast.dismiss(toastId);
      toast.success('Sale created successfully');
      onSuccess(sale.id);
      onClose();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : 'Failed to create sale');
    } finally {
      setSubmitting(false);
    }
  };

  const formatAmount = (n: number) => formatCurrency(n);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Stock Sale"
      icon={ShoppingCart}
      maxWidth="7xl"
      closeOnBackdrop={false}
    >
      <div className="flex flex-col lg:flex-row gap-4 min-h-0" style={{ height: 'calc(80vh - 80px)' }}>
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <BarcodeLookupInput
            onItemFound={handleBarcodeItem}
            onSerialFound={handleBarcodeSerial}
            placeholder="Scan barcode or serial to add to cart..."
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Or search by name, brand, SKU..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {loadingItems ? (
              <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <SaleableItemsGrid
                items={filteredItems}
                onSelect={handleSelectItem}
                selectedIds={selectedIds}
              />
            )}
          </div>
        </div>

        <div className="lg:w-96 flex flex-col gap-3 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                <span className="font-semibold text-slate-700 text-sm">
                  Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})
                </span>
              </div>

              {cart.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">
                  Select items from the left panel
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((line) => (
                    <div key={line.item.id} className="px-3 py-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 leading-tight flex-1 min-w-0 truncate">
                          {line.item.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.item.id)}
                          className="text-slate-400 hover:text-danger transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-slate-300 rounded-md overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(line.item.id, -1)}
                            className="px-2 py-1 hover:bg-slate-100 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 py-1 text-sm font-semibold min-w-[2rem] text-center border-x border-slate-300">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(line.item.id, 1)}
                            className="px-2 py-1 hover:bg-slate-100 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="text-slate-400 text-xs">×</span>

                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) =>
                              handleUnitPriceChange(line.item.id, e.target.value)
                            }
                            className="w-full px-2 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary text-right"
                          />
                        </div>

                        <span className="text-sm font-semibold text-slate-800 whitespace-nowrap min-w-[60px] text-right">
                          {formatAmount(line.quantity * line.unit_price)}
                        </span>
                      </div>

                      <SerialLinePicker
                        itemId={line.item.id}
                        value={line.serial_number}
                        onChange={(serial) => handleSerialChange(line.item.id, serial)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{formatAmount(subtotal)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <select
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(e.target.value as 'none' | 'percentage' | 'fixed')
                    }
                    className="flex-1 text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="none">No Discount</option>
                    <option value="percentage">Percentage %</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>

                  {discountType !== 'none' && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percentage' ? '%' : 'Amount'}
                      className="w-24 text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-success">
                    <span>Discount</span>
                    <span>-{formatAmount(discountAmount)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total</span>
                <span>{formatAmount(total)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <SearchableSelect
                  label="Customer"
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  options={customers}
                  placeholder="Search customer..."
                  required
                  usePortal
                  emptyMessage={
                    customerSearch.length < 2
                      ? 'Type at least 2 characters to search'
                      : 'No customers found'
                  }
                  onAddNew={undefined}
                />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Type to search customers..."
                  className="mt-1 w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary text-slate-600"
                />
              </div>

              <Input
                label="Case ID (optional)"
                value={linkedCaseId}
                onChange={(e) => setLinkedCaseId(e.target.value)}
                placeholder="Link to a case..."
              />

              <div>
                <label htmlFor={paymentMethodFieldId} className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  id={paymentMethodFieldId}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="added_to_invoice">Add to Invoice</option>
                </select>
              </div>

              <div>
                <label htmlFor={notesFieldId} className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id={notesFieldId}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <Button
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0 || !selectedCustomerId}
              className="w-full gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              {submitting ? 'Creating...' : `Create Sale · ${formatAmount(total)}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
