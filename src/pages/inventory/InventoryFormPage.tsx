import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  createInventoryItem,
  getInventoryCategories,
  getInventoryStatusTypes,
  getInventoryConditionTypes,
  type InventoryItem,
  type InventoryItemInsert,
  type InventoryItemCategory,
  type InventoryStatusType,
  type InventoryConditionType,
} from '../../lib/inventoryService';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type BrandRow = Pick<Database['public']['Tables']['catalog_device_brands']['Row'], 'id' | 'name'>;
type CapacityRow = Pick<
  Database['public']['Tables']['catalog_device_capacities']['Row'],
  'id' | 'name' | 'gb_value'
>;
type LocationRow = Pick<Database['public']['Tables']['inventory_locations']['Row'], 'id' | 'name'>;

export default function InventoryFormPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<InventoryItemCategory[]>([]);
  const [statusTypes, setStatusTypes] = useState<InventoryStatusType[]>([]);
  const [conditionTypes, setConditionTypes] = useState<InventoryConditionType[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [capacities, setCapacities] = useState<CapacityRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);

  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    name: '',
    category_id: null,
    status_id: null,
    condition_id: null,
    quantity: 0,
    purchase_price: 0,
  });

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      const [
        categoriesData,
        statusTypesData,
        conditionTypesData,
        brandsData,
        capacitiesData,
        locationsData,
      ] = await Promise.all([
        getInventoryCategories(),
        getInventoryStatusTypes(),
        getInventoryConditionTypes(),
        supabase
          .from('catalog_device_brands')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('catalog_device_capacities')
          .select('id, name, gb_value')
          .eq('is_active', true)
          .order('gb_value'),
        supabase
          .from('inventory_locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ]);

      setCategories(categoriesData);
      setStatusTypes(statusTypesData);
      setConditionTypes(conditionTypesData);
      setBrands(brandsData.data ?? []);
      setCapacities(capacitiesData.data ?? []);
      setLocations(locationsData.data ?? []);
    } catch (error) {
      logger.error('Error loading master data:', error);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: user } = await supabase.auth.getUser();

      const payload = {
        ...formData,
        name: formData.name ?? '',
        created_by: user?.user?.id ?? null,
      } as InventoryItemInsert;

      await createInventoryItem(payload);

      toast.success('Item saved successfully');
      navigate('/inventory');
    } catch (error) {
      logger.error('Error saving item:', error);
      toast.error('Failed to save item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = <K extends keyof InventoryItem>(
    field: K,
    value: InventoryItem[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Add Inventory Item
          </h1>
          <p className="text-slate-600 mt-1">
            Add a new item to your inventory
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Item Name *
              </label>
              <Input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                placeholder="Enter item name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category_id || ''}
                onChange={(e) =>
                  handleChange('category_id', e.target.value || null)
                }
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Status
              </label>
              <select
                value={formData.status_id || ''}
                onChange={(e) =>
                  handleChange('status_id', e.target.value || null)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Status</option>
                {statusTypes.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Condition
              </label>
              <select
                value={formData.condition_id || ''}
                onChange={(e) =>
                  handleChange('condition_id', e.target.value || null)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Condition</option>
                {conditionTypes.map((condition) => (
                  <option key={condition.id} value={condition.id}>
                    {condition.rating}/5 - {condition.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter item description"
              />
            </div>
          </div>
        </div>

        {/* Device Specifications */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Device Specifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Brand
              </label>
              <select
                value={formData.brand_id || ''}
                onChange={(e) => handleChange('brand_id', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Model
              </label>
              <Input
                type="text"
                value={formData.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                placeholder="Enter model"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Serial Number
              </label>
              <Input
                type="text"
                value={formData.serial_number || ''}
                onChange={(e) => handleChange('serial_number', e.target.value)}
                placeholder="Enter serial number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Capacity
              </label>
              <select
                value={formData.capacity_id || ''}
                onChange={(e) => handleChange('capacity_id', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Capacity</option>
                {capacities.map((capacity) => (
                  <option key={capacity.id} value={capacity.id}>
                    {capacity.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Item Number
              </label>
              <Input
                type="text"
                value={formData.item_number || ''}
                onChange={(e) => handleChange('item_number', e.target.value)}
                placeholder="Enter item number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Firmware Version
              </label>
              <Input
                type="text"
                value={formData.firmware_version || ''}
                onChange={(e) => handleChange('firmware_version', e.target.value)}
                placeholder="Enter firmware version"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                PCB Number
              </label>
              <Input
                type="text"
                value={formData.pcb_number || ''}
                onChange={(e) => handleChange('pcb_number', e.target.value)}
                placeholder="Enter PCB number"
              />
            </div>
          </div>
        </div>

        {/* Inventory & Stock */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Inventory & Stock
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Quantity
              </label>
              <Input
                type="number"
                value={formData.quantity ?? 0}
                onChange={(e) => handleChange('quantity', Number(e.target.value))}
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Minimum Quantity
              </label>
              <Input
                type="number"
                value={formData.min_quantity ?? 0}
                onChange={(e) => handleChange('min_quantity', Number(e.target.value))}
                min="0"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Storage Location
              </label>
              <select
                value={formData.location_id || ''}
                onChange={(e) => handleChange('location_id', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sourcing & Financial */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Sourcing & Financial
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Purchase Price
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.purchase_price ?? 0}
                onChange={(e) => handleChange('purchase_price', Number(e.target.value))}
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Purchase Date
              </label>
              <Input
                type="date"
                value={formData.purchase_date || ''}
                onChange={(e) => handleChange('purchase_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Additional Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter any additional notes or information"
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/inventory')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Item
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
