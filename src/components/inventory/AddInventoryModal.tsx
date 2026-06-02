import React, { useState, useEffect } from 'react';
import { Package, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert'];

interface AddInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  itemId?: string | null;
}

interface DonorParts {
  heads: boolean;
  pcb: boolean;
  drive_enclosure: boolean;
}

interface FormData {
  category_id: string;
  status_id: string;
  brand_id: string;
  model: string;
  serial_number: string;
  capacity_id: string;
  donor_parts_available: DonorParts;
  interface_id: string;
  pcb_number: string;
  head_map: string;
  firmware_version: string;
  purchase_price: string;
  purchase_date: string;
  condition_id: string;
  quantity: number;
  location_id: string;
}

const AddInventoryModal: React.FC<AddInventoryModalProps> = ({ isOpen, onClose, onSuccess, itemId }) => {
  const { currencyFormat, loading: currencyLoading } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [nextInventoryNumber, setNextInventoryNumber] = useState<string>('');
  const [inventoryCategories, setInventoryCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [statusTypes, setStatusTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [capacities, setCapacities] = useState<Array<{ id: string; name: string }>>([]);
  const [interfaces, setInterfaces] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [conditionTypes, setConditionTypes] = useState<Array<{ id: string; name: string; rating: number }>>([]);

  const [formData, setFormData] = useState<FormData>({
    category_id: '',
    status_id: '',
    brand_id: '',
    model: '',
    serial_number: '',
    capacity_id: '',
    donor_parts_available: {
      heads: false,
      pcb: false,
      drive_enclosure: false,
    },
    interface_id: '',
    pcb_number: '',
    head_map: '',
    firmware_version: '',
    purchase_price: '',
    purchase_date: '',
    condition_id: '',
    quantity: 1,
    location_id: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchDropdownData();
      if (itemId) {
        loadExistingItem();
      } else {
        fetchNextInventoryNumber();
        resetForm();
      }
    }
  }, [isOpen, itemId]);


  const loadExistingItem = async () => {
    if (!itemId) return;

    setLoading(true);
    try {
      const { data: item, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

      if (error) throw error;

      if (item) {
        const donorParts = (item.donor_parts_available ?? {}) as Partial<DonorParts>;
        setFormData({
          category_id: item.category_id || '',
          status_id: item.status_id || '',
          brand_id: item.brand_id || '',
          model: item.model || '',
          serial_number: item.serial_number || '',
          capacity_id: item.capacity_id || '',
          donor_parts_available: {
            heads: donorParts.heads ?? false,
            pcb: donorParts.pcb ?? false,
            drive_enclosure: donorParts.drive_enclosure ?? false,
          },
          interface_id: item.interface_id || '',
          pcb_number: item.pcb_number || '',
          head_map: item.head_map || '',
          firmware_version: item.firmware_version || '',
          purchase_price: item.purchase_price != null ? item.purchase_price.toString() : '',
          purchase_date: item.purchase_date || '',
          condition_id: item.condition_id || '',
          quantity: item.quantity ?? 1,
          location_id: item.location_id || '',
        });
        setNextInventoryNumber(item.item_number || '');
      }
    } catch (error) {
      logger.error('Error loading item:', error);
      setErrors({ submit: 'Failed to load item data' });
    } finally {
      setLoading(false);
    }
  };

  const fetchNextInventoryNumber = async () => {
    try {
      const { data: sequence } = await supabase
        .from('number_sequences')
        .select('prefix, current_value, padding')
        .eq('scope', 'inventory')
        .maybeSingle();

      if (sequence) {
        const nextNumber = (sequence.current_value ?? 0) + 1;
        const paddedNumber = nextNumber.toString().padStart(sequence.padding ?? 0, '0');
        setNextInventoryNumber(`${sequence.prefix ?? ''}${paddedNumber}`);
      }
    } catch (error) {
      logger.error('Error fetching next inventory number:', error);
    }
  };

  const fetchDropdownData = async () => {
    setLoading(true);
    try {
      const [
        inventoryCategoriesRes,
        statusTypesRes,
        brandsRes,
        capacitiesRes,
        interfacesRes,
        locationsRes,
        conditionsRes,
      ] = await Promise.all([
        supabase.from('master_inventory_categories').select('id, name').eq('is_active', true).order('sort_order'),
        supabase.from('master_inventory_status_types').select('id, name').eq('is_active', true).order('sort_order'),
        supabase.from('catalog_device_brands').select('id, name').eq('is_active', true).order('name'),
        supabase.from('catalog_device_capacities').select('id, name, gb_value').eq('is_active', true).order('gb_value'),
        supabase.from('catalog_interfaces').select('id, name').eq('is_active', true).order('sort_order'),
        supabase.from('inventory_locations').select('id, name').eq('is_active', true).order('name'),
        supabase
          .from('master_inventory_condition_types')
          .select('id, name, rating')
          .eq('is_active', true)
          .order('rating', { ascending: false }),
      ]);

      if (inventoryCategoriesRes.data) {
        setInventoryCategories(inventoryCategoriesRes.data);
      }
      if (statusTypesRes.data) {
        setStatusTypes(statusTypesRes.data);
      }
      if (brandsRes.data) setBrands(brandsRes.data);
      if (capacitiesRes.data) {
        setCapacities(capacitiesRes.data.map(c => ({ id: c.id, name: c.name })));
      }
      if (interfacesRes.data) setInterfaces(interfacesRes.data);
      if (locationsRes.data) setLocations(locationsRes.data);
      if (conditionsRes.data) {
        setConditionTypes(
          conditionsRes.data.map((c) => ({ id: c.id, name: c.name, rating: c.rating ?? 0 }))
        );
      }
    } catch (error) {
      logger.error('Error fetching dropdown data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateInventoryCode = async (): Promise<string> => {
    const { data: sequence } = await supabase
      .from('number_sequences')
      .select('*')
      .eq('scope', 'inventory')
      .maybeSingle();

    if (!sequence) {
      throw new Error('Inventory number sequence not found');
    }

    const nextNumber = (sequence.current_value ?? 0) + 1;
    const paddedNumber = nextNumber.toString().padStart(sequence.padding ?? 0, '0');
    const code = `${sequence.prefix ?? ''}${paddedNumber}`;

    await supabase
      .from('number_sequences')
      .update({ current_value: nextNumber })
      .eq('scope', 'inventory');

    return code;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.category_id) newErrors.category_id = 'Inventory Category is required';
    if (!formData.model.trim()) newErrors.model = 'Model Number is required';
    if (formData.quantity < 0) newErrors.quantity = 'Quantity must be 0 or greater';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        setErrors({ submit: 'No tenant context. Please log in again.' });
        setSubmitting(false);
        return;
      }

      const itemData: InventoryItemInsert = {
        tenant_id: tenantId,
        category_id: formData.category_id || null,
        status_id: formData.status_id || null,
        brand_id: formData.brand_id || null,
        model: formData.model.trim(),
        serial_number: formData.serial_number.trim() || null,
        capacity_id: formData.capacity_id || null,
        name: formData.model.trim(),
        donor_parts_available: { ...formData.donor_parts_available },
        interface_id: formData.interface_id || null,
        pcb_number: formData.pcb_number.trim() || null,
        head_map: formData.head_map.trim() || null,
        firmware_version: formData.firmware_version.trim() || null,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : 0,
        purchase_date: formData.purchase_date || null,
        condition_id: formData.condition_id || null,
        quantity: formData.quantity,
        location_id: formData.location_id || null,
      };

      if (itemId) {
        const { error } = await supabase
          .from('inventory_items')
          .update(itemData)
          .eq('id', itemId);

        if (error) throw error;
      } else {
        const inventoryCode = await generateInventoryCode();
        const insertPayload: InventoryItemInsert = { ...itemData, item_number: inventoryCode };

        const { error } = await supabase.from('inventory_items').insert([insertPayload]);

        if (error) throw error;
      }

      resetForm();
      onSuccess();
      if (!itemId) {
        await fetchNextInventoryNumber();
      }
      onClose();
    } catch (error: unknown) {
      logger.error(`Error ${itemId ? 'updating' : 'creating'} inventory item:`, error);
      setErrors({ submit: error instanceof Error ? error.message : `Failed to ${itemId ? 'update' : 'create'} inventory item` });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category_id: '',
      status_id: '',
      brand_id: '',
      model: '',
      serial_number: '',
      capacity_id: '',
      donor_parts_available: {
        heads: false,
        pcb: false,
        drive_enclosure: false,
      },
      interface_id: '',
      pcb_number: '',
      head_map: '',
      firmware_version: '',
      purchase_price: '',
      purchase_date: '',
      condition_id: '',
      quantity: 1,
      location_id: '',
    });
    setErrors({});
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const formatConditionType = (condition: { name: string; rating: number }) => {
    return condition.name;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={itemId ? "Edit Inventory Item" : "Add Inventory Item"}
      icon={Package}
      maxWidth="7xl"
      closeOnBackdrop={false}
      headerAction={
        nextInventoryNumber && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-info-muted border border-info/30 rounded-lg">
            <span className="text-xs font-medium text-gray-600">{itemId ? 'Code:' : 'Next Number:'}</span>
            <span className="text-sm font-bold text-info font-mono">{nextInventoryNumber}</span>
          </div>
        )
      }
    >
      <form onSubmit={handleSubmit}>

        {(loading || currencyLoading) ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto pr-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-info-muted rounded-lg p-4 border border-info/20">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <SearchableSelect
                      label="Inventory Category"
                      options={inventoryCategories}
                      value={formData.category_id}
                      onChange={(value) => setFormData((prev) => ({ ...prev, category_id: value }))}
                      placeholder="Select inventory category"
                      disabled={submitting}
                      required
                      clearable={false}
                    />
                    {errors.category_id && (
                      <p className="mt-1 text-sm text-danger">{errors.category_id}</p>
                    )}
                  </div>

                  <div>
                    <SearchableSelect
                      label="Brand"
                      options={brands.map((b) => ({ id: b.id, name: b.name }))}
                      value={formData.brand_id}
                      onChange={(value) => setFormData((prev) => ({ ...prev, brand_id: value }))}
                      placeholder="Select brand"
                      disabled={submitting}
                      clearable={false}
                    />
                  </div>

                  <div>
                    <label htmlFor="inventory-model" className="block text-sm font-medium text-gray-700 mb-1">
                      Model Number <span className="text-danger">*</span>
                    </label>
                    <Input
                      id="inventory-model"
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
                      placeholder="Enter model number"
                      disabled={submitting}
                    />
                    {errors.model && <p className="mt-1 text-sm text-danger">{errors.model}</p>}
                  </div>

                  <div>
                    <label htmlFor="inventory-serial" className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                    <Input
                      id="inventory-serial"
                      type="text"
                      value={formData.serial_number}
                      onChange={(e) => setFormData((prev) => ({ ...prev, serial_number: e.target.value }))}
                      placeholder="Enter serial number"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <SearchableSelect
                      label="Capacity"
                      options={capacities}
                      value={formData.capacity_id}
                      onChange={(value) => setFormData((prev) => ({ ...prev, capacity_id: value }))}
                      placeholder="Select capacity"
                      disabled={submitting}
                      clearable={false}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Usable Donor Parts</label>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.donor_parts_available.heads}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              donor_parts_available: { ...prev.donor_parts_available, heads: e.target.checked },
                            }))
                          }
                          disabled={submitting}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">Heads</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.donor_parts_available.pcb}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              donor_parts_available: { ...prev.donor_parts_available, pcb: e.target.checked },
                            }))
                          }
                          disabled={submitting}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">PCB</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.donor_parts_available.drive_enclosure}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              donor_parts_available: {
                                ...prev.donor_parts_available,
                                drive_enclosure: e.target.checked,
                              },
                            }))
                          }
                          disabled={submitting}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">Drive Enclosure</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-success-muted rounded-lg p-4 border border-success/20">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Technical Specifications</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <SearchableSelect
                      label="Interface"
                      options={interfaces.map((i) => ({ id: i.id, name: i.name }))}
                      value={formData.interface_id}
                      onChange={(value) => setFormData((prev) => ({ ...prev, interface_id: value }))}
                      placeholder="Select interface"
                      disabled={submitting}
                      clearable={false}
                    />
                  </div>

                  <div>
                    <label htmlFor="inventory-pcb" className="block text-sm font-medium text-gray-700 mb-1">PCB Number</label>
                    <Input
                      id="inventory-pcb"
                      type="text"
                      value={formData.pcb_number}
                      onChange={(e) => setFormData((prev) => ({ ...prev, pcb_number: e.target.value }))}
                      placeholder="Enter PCB number"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="inventory-head-map" className="block text-sm font-medium text-gray-700 mb-1">Head Map</label>
                    <Input
                      id="inventory-head-map"
                      type="text"
                      value={formData.head_map}
                      onChange={(e) => setFormData((prev) => ({ ...prev, head_map: e.target.value }))}
                      placeholder="Enter head map"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="inventory-firmware" className="block text-sm font-medium text-gray-700 mb-1">Firmware</label>
                    <Input
                      id="inventory-firmware"
                      type="text"
                      value={formData.firmware_version}
                      onChange={(e) => setFormData((prev) => ({ ...prev, firmware_version: e.target.value }))}
                      placeholder="Enter firmware version"
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-warning-muted rounded-lg p-4 border border-warning/20">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Inventory Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="inventory-purchase-price" className="block text-sm font-medium text-gray-700 mb-1">
                    Purchase Cost ({currencyFormat.currencyCode})
                  </label>
                  <div className="relative">
                    {currencyFormat.currencyPosition === 'before' && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        {currencyFormat.currencySymbol}
                      </span>
                    )}
                    <Input
                      id="inventory-purchase-price"
                      type="number"
                      step={`0.${'0'.repeat(Math.max(0, currencyFormat.decimalPlaces - 1))}1`}
                      min="0"
                      value={formData.purchase_price}
                      onChange={(e) => setFormData((prev) => ({ ...prev, purchase_price: e.target.value }))}
                      placeholder={`0.${'0'.repeat(currencyFormat.decimalPlaces)}`}
                      disabled={submitting}
                      className={currencyFormat.currencyPosition === 'before' ? 'pl-8' : 'pr-8'}
                    />
                    {currencyFormat.currencyPosition === 'after' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        {currencyFormat.currencySymbol}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="inventory-purchase-date" className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                  <Input
                    id="inventory-purchase-date"
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, purchase_date: e.target.value }))}
                    disabled={submitting}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Status"
                    options={statusTypes}
                    value={formData.status_id}
                    onChange={(value) => setFormData((prev) => ({ ...prev, status_id: value }))}
                    placeholder="Select status"
                    disabled={submitting}
                    clearable={false}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Condition"
                    options={conditionTypes.map((ct) => ({
                      id: ct.id,
                      name: formatConditionType(ct),
                    }))}
                    value={formData.condition_id}
                    onChange={(value) => setFormData((prev) => ({ ...prev, condition_id: value }))}
                    placeholder="Select condition"
                    disabled={submitting}
                    clearable={false}
                  />
                </div>

                <div>
                  <label htmlFor="inventory-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="inventory-quantity"
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))
                    }
                    disabled={submitting}
                  />
                  {errors.quantity && (
                    <p className="mt-1 text-sm text-danger">{errors.quantity}</p>
                  )}
                </div>

                <div>
                  <SearchableSelect
                    label="Location"
                    options={locations.map((l) => ({ id: l.id, name: l.name }))}
                    value={formData.location_id}
                    onChange={(value) => setFormData((prev) => ({ ...prev, location_id: value }))}
                    placeholder="Select location"
                    disabled={submitting}
                    clearable={false}
                  />
                </div>
              </div>
            </div>

            {errors.submit && (
              <div className="mt-4 p-4 bg-danger-muted border border-danger/30 rounded-lg">
                <p className="text-sm text-danger">{errors.submit}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 mt-4 pt-3 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {itemId ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  itemId ? 'Update Item' : 'Create Item'
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default AddInventoryModal;
