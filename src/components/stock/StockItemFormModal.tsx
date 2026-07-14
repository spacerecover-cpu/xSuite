import React, { useId, useState, useEffect } from 'react';
import { Package, Plus, Trash2, Save } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { StockCategorySelect } from './StockCategorySelect';
import {
  createStockItem,
  updateStockItem,
  getStockItem,
  StockItemWithCategory,
} from '../../lib/stockService';
import { useToast } from '../../hooks/useToast';
import { shouldAutoPrintLabel } from '../../lib/labelPrefsService';
import type { Database } from '../../types/database.types';

type StockItemInsert = Database['public']['Tables']['stock_items']['Insert'];

interface StockItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItemWithCategory | null;
  onSuccess: () => void;
}

type TabId = 'basic' | 'pricing' | 'inventory' | 'specifications';

interface SpecRow {
  key: string;
  value: string;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory Settings' },
  { id: 'specifications', label: 'Specifications' },
];

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';

const labelClass = 'block text-sm font-medium text-slate-700 mb-1';

export const StockItemFormModal: React.FC<StockItemFormModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const toast = useToast();
  const fieldIdPrefix = useId();
  const fid = (key: string) => `${fieldIdPrefix}-${key}`;
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [itemType, setItemType] = useState<'internal' | 'saleable' | 'both'>('internal');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [capacity, setCapacity] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  const [costPrice, setCostPrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState<string>('');

  const [minimumQuantity, setMinimumQuantity] = useState<string>('0');
  const [reorderQuantity, setReorderQuantity] = useState<string>('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const [specRows, setSpecRows] = useState<SpecRow[]>([{ key: '', value: '' }]);

  const isSaleable = itemType === 'saleable' || itemType === 'both';

  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setName(item.name);
      setDescription(item.description ?? '');
      setCategoryId(item.category_id ?? null);
      setItemType((item.item_type as 'internal' | 'saleable' | 'both') ?? 'internal');
      setBrand(item.brand ?? '');
      setModel(item.model ?? '');
      setCapacity(item.capacity ?? '');
      setUnitOfMeasure(item.unit ?? 'pcs');
      setBarcode(item.barcode ?? '');
      setImageUrl(item.photos?.[0] ?? '');
      setIsActive(item.is_active ?? true);
      setIsFeatured(false);
      setCostPrice(item.cost_price != null ? String(item.cost_price) : '');
      setSellingPrice(item.selling_price != null ? String(item.selling_price) : '');
      setTaxInclusive(false);
      setWarrantyMonths('');
      setMinimumQuantity(String(item.minimum_quantity ?? 0));
      setReorderQuantity(item.reorder_quantity != null ? String(item.reorder_quantity) : '');
      setLocation('');
      setNotes(item.notes ?? '');
      setSpecRows([{ key: '', value: '' }]);
    } else {
      setName('');
      setDescription('');
      setCategoryId(null);
      setItemType('internal');
      setBrand('');
      setModel('');
      setCapacity('');
      setUnitOfMeasure('pcs');
      setBarcode('');
      setImageUrl('');
      setIsActive(true);
      setIsFeatured(false);
      setCostPrice('');
      setSellingPrice('');
      setTaxInclusive(false);
      setWarrantyMonths('');
      setMinimumQuantity('0');
      setReorderQuantity('');
      setLocation('');
      setNotes('');
      setSpecRows([{ key: '', value: '' }]);
    }
    setActiveTab('basic');
  }, [isOpen, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setActiveTab('basic');
      return;
    }
    setIsSubmitting(true);
    try {
      const trimmedImage = imageUrl.trim();
      // tenant_id is populated by the set_stock_items_tenant_and_audit trigger.
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        item_type: itemType,
        brand: brand.trim() || null,
        model: model.trim() || null,
        capacity: capacity.trim() || null,
        unit: unitOfMeasure.trim() || 'pcs',
        barcode: barcode.trim() || null,
        photos: trimmedImage ? [trimmedImage] : null,
        is_active: isActive,
        cost_price: costPrice !== '' ? parseFloat(costPrice) : null,
        selling_price: isSaleable && sellingPrice !== '' ? parseFloat(sellingPrice) : null,
        minimum_quantity: parseInt(minimumQuantity, 10) || 0,
        reorder_quantity: reorderQuantity !== '' ? parseInt(reorderQuantity, 10) : null,
        notes: notes.trim() || null,
      } as StockItemInsert;

      if (item) {
        await updateStockItem(item.id, payload);
        toast.success('Stock item updated successfully');
      } else {
        const created = await createStockItem(payload);
        toast.success('Stock item created successfully');
        // Direct Print Label: fire-and-forget so a printer problem never blocks intake.
        void shouldAutoPrintLabel('stock').then(async (enabled) => {
          if (!enabled) return;
          const { printStockLabelBatch } = await import('../../lib/pdf/labels/labelPrintService');
          // createStockItem returns the bare insert row without the category
          // join, so re-fetch it — otherwise the auto-printed label drops the
          // category line a list-printed label shows. Fall back to the bare row.
          const enriched = await getStockItem(created.id).catch(() => null);
          await printStockLabelBatch([{ item: enriched ?? created }], { output: 'print' });
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save stock item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSpecRow = () => {
    setSpecRows((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeSpecRow = (index: number) => {
    setSpecRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSpecRow = (index: number, field: 'key' | 'value', val: string) => {
    setSpecRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? 'Edit Stock Item' : 'New Stock Item'}
      size="xl"
      icon={Package}
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-0">
        <div className="flex border-b border-slate-200 mb-5 -mx-4 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label htmlFor={fid('name')} className={labelClass}>
                Name <span className="text-danger">*</span>
              </label>
              <Input
                id={fid('name')}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
                required
              />
            </div>

            <div>
              <label htmlFor={fid('description')} className={labelClass}>Description</label>
              <textarea
                id={fid('description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional description"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category</label>
                <StockCategorySelect
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Select category"
                />
              </div>
              <div>
                <label htmlFor={fid('itemType')} className={labelClass}>Item Type</label>
                <select
                  id={fid('itemType')}
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as 'internal' | 'saleable' | 'both')}
                  className={inputClass}
                >
                  <option value="internal">Internal Use</option>
                  <option value="saleable">Saleable</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor={fid('brand')} className={labelClass}>Brand</label>
                <Input
                  id={fid('brand')}
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Seagate"
                />
              </div>
              <div>
                <label htmlFor={fid('model')} className={labelClass}>Model</label>
                <Input
                  id={fid('model')}
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Barracuda"
                />
              </div>
              <div>
                <label htmlFor={fid('capacity')} className={labelClass}>Capacity</label>
                <Input
                  id={fid('capacity')}
                  type="text"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 2TB"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={fid('unit')} className={labelClass}>Unit of Measure</label>
                <Input
                  id={fid('unit')}
                  type="text"
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                  placeholder="pcs"
                />
              </div>
              <div>
                <label htmlFor={fid('barcode')} className={labelClass}>Barcode</label>
                <Input
                  id={fid('barcode')}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Barcode or SKU"
                />
              </div>
            </div>

            <div>
              <label htmlFor={fid('imageUrl')} className={labelClass}>Image URL</label>
              <Input
                id={fid('imageUrl')}
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-700">Active</span>
              </label>
              {isSaleable && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-700">Featured</span>
                </label>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={fid('costPrice')} className={labelClass}>Cost Price</label>
                <Input
                  id={fid('costPrice')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {isSaleable && (
                <div>
                  <label htmlFor={fid('sellingPrice')} className={labelClass}>Selling Price</label>
                  <Input
                    id={fid('sellingPrice')}
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={taxInclusive}
                onChange={(e) => setTaxInclusive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-slate-700">Price is tax inclusive</span>
            </label>

            <div>
              <label htmlFor={fid('warranty')} className={labelClass}>Warranty (months)</label>
              <Input
                id={fid('warranty')}
                type="number"
                min="0"
                step="1"
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={fid('minQty')} className={labelClass}>Reorder Point (min qty)</label>
                <Input
                  id={fid('minQty')}
                  type="number"
                  min="0"
                  step="1"
                  value={minimumQuantity}
                  onChange={(e) => setMinimumQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label htmlFor={fid('reorderQty')} className={labelClass}>Suggested Order Qty</label>
                <Input
                  id={fid('reorderQty')}
                  type="number"
                  min="0"
                  step="1"
                  value={reorderQuantity}
                  onChange={(e) => setReorderQuantity(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
            </div>

            <div>
              <label htmlFor={fid('location')} className={labelClass}>Storage Location</label>
              <Input
                id={fid('location')}
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Shelf A3, Room 2"
              />
            </div>

            <div>
              <label htmlFor={fid('notes')} className={labelClass}>Notes</label>
              <textarea
                id={fid('notes')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Additional notes..."
                className={inputClass}
              />
            </div>
          </div>
        )}

        {activeTab === 'specifications' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {specRows.map((row, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateSpecRow(index, 'key', e.target.value)}
                    placeholder="Key"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateSpecRow(index, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpecRow(index)}
                    disabled={specRows.length === 1}
                    className="p-2 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSpecRow}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !name.trim()}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : item ? 'Save Changes' : 'Create Item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
