import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Package, Calendar, DollarSign, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase, resolveTenantId } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface PurchaseOrderData {
  id?: string;
  po_number?: string;
  supplier_id?: string;
  status_id?: string;
  order_date?: string;
  expected_delivery?: string;
  shipping_address?: string;
  shipping_method?: string;
  notes?: string;
  internal_notes?: string;
  line_items?: LineItem[];
}

interface PurchaseOrderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  purchaseOrder?: PurchaseOrderData | null;
  supplierId?: string;
}

export default function PurchaseOrderFormModal({ isOpen, onClose, onSuccess, purchaseOrder, supplierId }: PurchaseOrderFormModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; supplier_number: string | null }>>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string; sort_order?: number | null; is_active?: boolean }>>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, total: 0 }
  ]);

  const [formData, setFormData] = useState({
    po_number: '',
    supplier_id: supplierId || '',
    status_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: '',
    shipping_address: '',
    shipping_method: '',
    notes: '',
    internal_notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadMasterData();
      if (purchaseOrder) {
        setFormData({
          po_number: purchaseOrder.po_number || '',
          supplier_id: purchaseOrder.supplier_id || '',
          status_id: purchaseOrder.status_id || '',
          order_date: purchaseOrder.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
          expected_delivery: purchaseOrder.expected_delivery?.split('T')[0] || '',
          shipping_address: purchaseOrder.shipping_address || '',
          shipping_method: purchaseOrder.shipping_method || '',
          notes: purchaseOrder.notes || '',
          internal_notes: purchaseOrder.internal_notes || '',
        });
        if (purchaseOrder.line_items) {
          setLineItems(purchaseOrder.line_items);
        }
      } else if (!purchaseOrder) {
        loadNextPONumber();
      }
    }
  }, [isOpen, purchaseOrder, supplierId]);

  const loadMasterData = async () => {
    try {
      const [suppliersRes, statusesRes] = await Promise.all([
        supabase.from('suppliers').select('id, name, supplier_number').eq('is_active', true).order('name'),
        supabase.from('master_purchase_order_statuses').select('*').eq('is_active', true).order('sort_order'),
      ]);

      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (statusesRes.data) {
        setStatuses(statusesRes.data);
        if (!purchaseOrder && statusesRes.data.length > 0) {
          setFormData(prev => ({ ...prev, status_id: statusesRes.data[0].id }));
        }
      }
    } catch (error) {
      logger.error('Error loading master data:', error);
    }
  };

  const loadNextPONumber = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_po_number');
      if (error) throw error;
      if (data) {
        setFormData(prev => ({ ...prev, po_number: data }));
      }
    } catch (error) {
      logger.error('Error loading next PO number:', error);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total = updated[index].quantity * updated[index].unit_price;
    }

    setLineItems(updated);
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lineItems.length === 0 || lineItems.every(item => !item.description)) {
      toast.error('Please add at least one line item');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const totals = calculateTotals();

      // Only persist columns that exist on purchase_orders. UI-only fields
      // (shipping_method, internal_notes) and child rows (line_items)
      // are intentionally not part of the parent row update.
      const poUpdate = {
        po_number: formData.po_number,
        supplier_id: formData.supplier_id,
        status_id: formData.status_id,
        order_date: formData.order_date,
        expected_delivery_date: formData.expected_delivery || null,
        shipping_address: formData.shipping_address || null,
        notes: formData.notes || null,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total_amount: totals.total,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (purchaseOrder && purchaseOrder.id) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(poUpdate)
          .eq('id', purchaseOrder.id);

        if (error) throw error;
        toast.success('Purchase order updated successfully');
      } else {
        const tenantId = await resolveTenantId();

        const { error } = await supabase
          .from('purchase_orders')
          .insert({
            ...poUpdate,
            tenant_id: tenantId,
            created_by: user.id,
          });

        if (error) throw error;
        toast.success('Purchase order created successfully');
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving purchase order:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save purchase order');
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={purchaseOrder ? 'Edit Purchase Order' : 'Create Purchase Order'} size="xl" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PO Number *
            </label>
            <Input
              value={formData.po_number}
              onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
              required
              placeholder="PO000001"
              disabled={!!purchaseOrder}
            />
          </div>

          <div>
            <label htmlFor="po-supplier" className="block text-sm font-medium text-gray-700 mb-1">
              <Package className="inline w-4 h-4 mr-1" />
              Supplier *
            </label>
            <select
              id="po-supplier"
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              disabled={!!supplierId}
            >
              <option value="">Select Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.supplier_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="inline w-4 h-4 mr-1" />
              Order Date *
            </label>
            <Input
              type="date"
              value={formData.order_date}
              onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected Delivery
            </label>
            <Input
              type="date"
              value={formData.expected_delivery}
              onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
              min={formData.order_date}
            />
          </div>

          <div>
            <label htmlFor="po-status" className="block text-sm font-medium text-gray-700 mb-1">
              Status *
            </label>
            <select
              id="po-status"
              value={formData.status_id}
              onChange={(e) => setFormData({ ...formData, status_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            >
              <option value="">Select Status</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shipping Method
            </label>
            <Input
              value={formData.shipping_method}
              onChange={(e) => setFormData({ ...formData, shipping_method: e.target.value })}
              placeholder="FedEx, UPS, etc."
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="po-shipping-address" className="block text-sm font-medium text-gray-700 mb-1">
              Shipping Address
            </label>
            <textarea
              id="po-shipping-address"
              value={formData.shipping_address}
              onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={2}
              placeholder="Complete shipping address..."
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              <DollarSign className="inline w-5 h-5 mr-1" />
              Line Items
            </h3>
            <Button type="button" size="sm" onClick={addLineItem}>
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    placeholder="Item description"
                    required
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    min="0"
                    step="1"
                    required
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    placeholder="Unit Price"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="w-32">
                  <Input
                    value={item.total.toFixed(2)}
                    disabled
                    placeholder="Total"
                  />
                </div>
                {lineItems.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLineItem(index)}
                    className="text-danger hover:text-danger/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-col items-end space-y-2">
              <div className="flex justify-between w-64">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between w-64">
                <span className="text-gray-600">Tax (15%):</span>
                <span className="font-semibold">${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between w-64 text-lg border-t pt-2">
                <span className="font-bold">Total:</span>
                <span className="font-bold text-primary">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="po-notes" className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline w-4 h-4 mr-1" />
              Notes (Visible to Supplier)
            </label>
            <textarea
              id="po-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={3}
              placeholder="Notes for the supplier..."
            />
          </div>

          <div>
            <label htmlFor="po-internal-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Internal Notes (Private)
            </label>
            <textarea
              id="po-internal-notes"
              value={formData.internal_notes}
              onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={3}
              placeholder="Internal notes (not visible to supplier)..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : purchaseOrder ? 'Update Purchase Order' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
