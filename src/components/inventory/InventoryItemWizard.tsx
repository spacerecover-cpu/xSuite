// src/components/inventory/InventoryItemWizard.tsx
//
// Device-type-driven Inventory Item Wizard — Inventory V2 P3.
// Uses the shared device-field engine (DeviceFieldRenderer + getDeviceFamilyConfig)
// so technical fields appear dynamically per device type, identical to Case Intake.
// Numbering via get_next_inventory_number(device_type_id) RPC.

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Package, Loader2, ChevronRight, Hash, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Skeleton } from '../ui/Skeleton';
import { DeviceFieldRenderer } from '../cases/device-form/DeviceFieldRenderer';
import { BASIC_FIELDS, getDeviceFamilyConfig } from '../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../lib/devices/deviceFamily';
import { useDeviceFormCatalogs } from '../../lib/devices/deviceCatalogQueries';
import { serializeInventorySpecs, hydrateInventorySpecs } from '../../lib/inventory/inventorySpecs';
import {
  useInventoryDeviceTypes,
  useInventoryLocations,
  useInventorySuppliers,
} from '../../lib/inventory/inventoryCatalogQueries';
import {
  createInventoryItem,
  updateInventoryItem,
  getInventoryItemById,
  getNextInventoryNumber,
} from '../../lib/inventoryService';
import { useQuery } from '@tanstack/react-query';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import type { Json } from '../../types/database.types';
import { toDateInputValue } from '../../lib/format';
import { inventoryKeys } from '../../lib/queryKeys';
import { logger } from '../../lib/logger';
import type { DeviceFamily } from '../../lib/devices/deviceFamily';
import type { CatalogOption } from '../../lib/devices/deviceCatalogQueries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  itemId?: string | null;
}

interface InventoryForm {
  // Identity
  device_type_id: string;
  category_id: string;
  brand_id: string;
  model: string;
  serial_number: string;
  capacity_id: string;
  interface_id: string;
  condition_id: string;
  // Technical fields (dynamic per family) — stored into technical_details
  [key: string]: unknown;
  // Inventory details
  status_id: string;
  quantity: number;
  min_quantity: number;
  purchase_price: string;
  purchase_date: string;
  supplier_id: string;
  is_donor: boolean;
  notes: string;
  // Location
  location_id: string;
}

const EMPTY_FORM: InventoryForm = {
  device_type_id: '',
  category_id: '',
  brand_id: '',
  model: '',
  serial_number: '',
  capacity_id: '',
  interface_id: '',
  condition_id: '',
  status_id: '',
  quantity: 1,
  min_quantity: 0,
  purchase_price: '',
  purchase_date: '',
  supplier_id: '',
  is_donor: false,
  notes: '',
  location_id: '',
};

const SECTION_HEAD = 'text-xs font-bold uppercase tracking-[0.04em] text-primary mb-3';
const FIELD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCatalogOptions(
  catalogs: ReturnType<typeof useDeviceFormCatalogs>['options'],
): Record<string, CatalogOption[]> {
  const out: Record<string, CatalogOption[]> = {};
  for (const key of Object.keys(catalogs) as Array<keyof typeof catalogs>) {
    out[key] = catalogs[key];
  }
  return out;
}

function numberPreview(deviceTypes: ReturnType<typeof useInventoryDeviceTypes>['data'], typeId: string): string {
  if (!typeId || !deviceTypes) return '';
  const dt = deviceTypes.find(d => d.id === typeId);
  if (!dt?.inventory_prefix) return '';
  return `${dt.inventory_prefix}-…`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InventoryItemWizard({ isOpen, onClose, onSuccess, itemId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { currencyFormat } = useCurrency();
  const isEdit = !!itemId;

  const [form, setForm] = useState<InventoryForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [itemNumber, setItemNumber] = useState<string>('');
  const [loadingNumber, setLoadingNumber] = useState(false);

  // Catalogs
  const { options: deviceCatalogs, isLoading: catalogsLoading } = useDeviceFormCatalogs();
  const { data: deviceTypes, isLoading: dtLoading } = useInventoryDeviceTypes();
  const { data: locations = [] } = useInventoryLocations();
  const { data: suppliers = [] } = useInventorySuppliers();

  // Status / condition types
  const { data: statusTypes = [] } = useQuery({
    queryKey: ['master_inventory_status_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_inventory_status_types')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as CatalogOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: inventoryCategories = [] } = useQuery({
    queryKey: ['master_inventory_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_inventory_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as CatalogOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = catalogsLoading || dtLoading;

  // Resolve family from selected device type
  const resolveFamily = useCallback((typeId: string): DeviceFamily => {
    if (!typeId || !deviceTypes) return 'other';
    const dt = deviceTypes.find(d => d.id === typeId);
    if (dt?.family) return resolveDeviceFamily(dt.family);
    return resolveDeviceFamily(dt?.name ?? '');
  }, [deviceTypes]);

  const family = resolveFamily(form.device_type_id as string);
  const familyConfig = getDeviceFamilyConfig(family);

  // Load next number when device type changes
  useEffect(() => {
    const typeId = form.device_type_id as string;
    if (!typeId || isEdit) return;
    let cancelled = false;
    setLoadingNumber(true);
    setItemNumber(numberPreview(deviceTypes, typeId));
    getNextInventoryNumber(typeId)
      .then(n => { if (!cancelled) setItemNumber(n); })
      .catch(() => { if (!cancelled) setItemNumber(numberPreview(deviceTypes, typeId)); })
      .finally(() => { if (!cancelled) setLoadingNumber(false); });
    return () => { cancelled = true; };
  }, [form.device_type_id, deviceTypes, isEdit]);

  // When device type is selected, auto-populate category_id from default_category_id
  const handleDeviceTypeChange = useCallback((typeId: string) => {
    const dt = deviceTypes?.find(d => d.id === typeId);
    const defaultCat = dt?.default_category_id ?? '';
    // Clear all previous technical fields when type changes
    setForm(prev => ({
      ...EMPTY_FORM,
      // Preserve identity/inventory fields
      category_id: defaultCat || prev.category_id,
      brand_id: prev.brand_id as string,
      model: prev.model as string,
      status_id: prev.status_id as string,
      quantity: prev.quantity as number,
      min_quantity: prev.min_quantity as number,
      purchase_price: prev.purchase_price as string,
      purchase_date: prev.purchase_date as string,
      supplier_id: prev.supplier_id as string,
      is_donor: prev.is_donor as boolean,
      notes: prev.notes as string,
      location_id: prev.location_id as string,
      device_type_id: typeId,
    }));
    setErrors({});
  }, [deviceTypes]);

  const setField = useCallback((key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  }, [errors]);

  // Load existing item in edit mode
  useEffect(() => {
    if (!isOpen || !itemId) return;
    (async () => {
      try {
        const item = await getInventoryItemById(itemId);
        if (!item) return;
        setItemNumber(item.item_number ?? '');

        const itemFamily = resolveDeviceFamily(
          deviceTypes?.find(d => d.id === item.device_type_id)?.family ?? ''
        );
        const techForm = hydrateInventorySpecs(
          itemFamily,
          (item.technical_details as Record<string, unknown> | null) ?? {},
        );

        setForm({
          device_type_id: item.device_type_id ?? '',
          category_id: item.category_id ?? '',
          brand_id: item.brand_id ?? '',
          model: item.model ?? '',
          serial_number: item.serial_number ?? '',
          capacity_id: item.capacity_id ?? '',
          interface_id: item.interface_id ?? '',
          condition_id: item.condition_id ?? '',
          status_id: item.status_id ?? '',
          quantity: item.quantity ?? 1,
          min_quantity: item.min_quantity ?? 0,
          purchase_price: item.purchase_price != null ? String(item.purchase_price) : '',
          purchase_date: toDateInputValue(item.purchase_date),
          supplier_id: item.supplier_id ?? '',
          is_donor: item.is_donor ?? false,
          notes: item.notes ?? '',
          location_id: item.location_id ?? '',
          ...techForm,
        });
      } catch (err) {
        logger.error('InventoryItemWizard: error loading item', err);
      }
    })();
  }, [isOpen, itemId, deviceTypes]);

  // Reset on open (create mode)
  useEffect(() => {
    if (isOpen && !itemId) {
      setForm(EMPTY_FORM);
      setErrors({});
      setItemNumber('');
    }
  }, [isOpen, itemId]);

  // Validate
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.device_type_id) errs.device_type_id = 'Device Type is required';
    if (!form.category_id) errs.category_id = 'Inventory Category is required';
    if (!form.model?.toString().trim()) errs.model = 'Model is required';
    if ((form.quantity as number) < 0) errs.quantity = 'Quantity must be 0 or greater';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const typeId = form.device_type_id as string;
      const technicalDetails = serializeInventorySpecs(family, form as Record<string, unknown>) as Json;

      const basePayload = {
        device_type_id: typeId || null,
        category_id: (form.category_id as string) || null,
        brand_id: (form.brand_id as string) || null,
        model: (form.model as string).trim(),
        name: (form.model as string).trim(),
        serial_number: (form.serial_number as string).trim() || null,
        capacity_id: (form.capacity_id as string) || null,
        interface_id: (form.interface_id as string) || null,
        condition_id: (form.condition_id as string) || null,
        status_id: (form.status_id as string) || null,
        quantity: form.quantity as number,
        min_quantity: form.min_quantity as number,
        purchase_price: (form.purchase_price as string) ? parseFloat(form.purchase_price as string) : null,
        purchase_date: (form.purchase_date as string) || null,
        supplier_id: (form.supplier_id as string) || null,
        is_donor: form.is_donor as boolean,
        notes: (form.notes as string).trim() || null,
        location_id: (form.location_id as string) || null,
        technical_details: technicalDetails,
      };

      if (isEdit && itemId) {
        await updateInventoryItem(itemId, basePayload);
      } else {
        const tenantId = getTenantId();
        if (!tenantId) throw new Error('No tenant context. Please log in again.');
        // Fetch the real next number at submit time (the preview may be stale)
        const nextNumber = await getNextInventoryNumber(typeId);
        await createInventoryItem({
          ...basePayload,
          tenant_id: tenantId,
          item_number: nextNumber,
          qr_value: nextNumber,
        });
      }

      await queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      onSuccess();
      onClose();
    } catch (err) {
      logger.error('InventoryItemWizard: save error', err);
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to save inventory item' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  // Build options map that DeviceFieldRenderer expects
  const catalogOptions = buildCatalogOptions(deviceCatalogs);

  // BASIC_FIELDS: only those relevant to identity in inventory (skip device_type_id — we render it specially)
  const identityBasicFields = BASIC_FIELDS.filter(
    d => !['device_type_id'].includes(d.key)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Inventory Item' : 'Add Inventory Item'}
      icon={Package}
      maxWidth="7xl"
      closeOnBackdrop={false}
      headerAction={
        (itemNumber || loadingNumber) ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-info-muted border border-info/30 rounded-lg">
            <Hash className="w-3.5 h-3.5 text-info" />
            <span className="text-xs font-medium text-slate-600">
              {isEdit ? 'Item Number:' : 'Next Number:'}
            </span>
            {loadingNumber ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-info" />
            ) : (
              <span className="text-sm font-bold text-info font-mono">{itemNumber}</span>
            )}
          </div>
        ) : undefined
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {isLoading ? (
          <div className="space-y-4 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg p-4 border border-border bg-surface-muted space-y-3">
                <Skeleton className="h-4 w-40" />
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(6)].map((_, j) => (
                    <div key={j}><Skeleton className="h-3 w-24 mb-1.5" /><Skeleton className="h-9 w-full" /></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh] space-y-4 pr-1">

            {/* ── Section 1: Identity ───────────────────────────── */}
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
                <h3 className={SECTION_HEAD}>Identity</h3>
              </div>

              {/* Device Type — top of identity, drives technical fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <SearchableSelect
                    label={t('devices.field.device_type_id', { defaultValue: 'Device Type' })}
                    value={form.device_type_id as string}
                    onChange={handleDeviceTypeChange}
                    options={deviceTypes ?? []}
                    required
                    clearable={false}
                    error={errors.device_type_id}
                    placeholder="Select device type"
                    size="sm"
                    usePortal
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Inventory Category"
                    value={form.category_id as string}
                    onChange={v => setField('category_id', v)}
                    options={inventoryCategories}
                    required
                    clearable={false}
                    error={errors.category_id}
                    placeholder="Select category"
                    size="sm"
                    usePortal
                  />
                </div>

                {/* Remaining basic identity fields via DeviceFieldRenderer */}
                {identityBasicFields.map(def => (
                  <div key={def.key} className={def.colSpan === 2 ? 'sm:col-span-2' : undefined}>
                    <DeviceFieldRenderer
                      def={def}
                      value={form[def.key]}
                      onChange={setField}
                      options={def.optionsSource ? (catalogOptions[def.optionsSource] ?? []) : []}
                      error={errors[def.key]}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 2: Technical Information (dynamic) ────── */}
            {familyConfig.technical.length > 0 && (
              <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-primary" />
                  <h3 className={SECTION_HEAD}>Technical Information</h3>
                  <span className="text-xs text-slate-500 font-normal normal-case tracking-normal">
                    — {family.toUpperCase()} fields
                  </span>
                </div>
                <div className={FIELD_GRID}>
                  {familyConfig.technical.map(def => (
                    <div key={def.key} className={def.colSpan === 2 ? 'sm:col-span-2' : undefined}>
                      <DeviceFieldRenderer
                        def={def}
                        value={form[def.key]}
                        onChange={setField}
                        options={def.optionsSource ? (catalogOptions[def.optionsSource] ?? []) : []}
                        error={errors[def.key]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 3: Inventory Details ─────────────────── */}
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
                <h3 className={SECTION_HEAD}>Inventory Details</h3>
              </div>
              <div className={FIELD_GRID}>
                <div>
                  <SearchableSelect
                    label="Status"
                    value={form.status_id as string}
                    onChange={v => setField('status_id', v)}
                    options={statusTypes}
                    clearable={false}
                    placeholder="Select status"
                    size="sm"
                    usePortal
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    label="Quantity"
                    value={String(form.quantity)}
                    min="0"
                    onChange={e => setField('quantity', parseInt(e.target.value) || 0)}
                    required
                    error={errors.quantity}
                    size="sm"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    label="Min Quantity"
                    value={String(form.min_quantity)}
                    min="0"
                    onChange={e => setField('min_quantity', parseInt(e.target.value) || 0)}
                    size="sm"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    label={`Purchase Cost (${currencyFormat.currencyCode})`}
                    value={form.purchase_price as string}
                    step="0.01"
                    min="0"
                    onChange={e => setField('purchase_price', e.target.value)}
                    size="sm"
                  />
                </div>

                <div>
                  <Input
                    type="date"
                    label="Purchase Date"
                    value={form.purchase_date as string}
                    onChange={e => setField('purchase_date', e.target.value)}
                    size="sm"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Supplier"
                    value={form.supplier_id as string}
                    onChange={v => setField('supplier_id', v)}
                    options={suppliers}
                    clearable={false}
                    placeholder="Select supplier"
                    size="sm"
                    usePortal
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="inv-is-donor"
                    type="checkbox"
                    checked={form.is_donor as boolean}
                    onChange={e => setField('is_donor', e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary focus:ring-offset-0"
                  />
                  <label htmlFor="inv-is-donor" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                    Donor Drive
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes as string}
                    onChange={e => setField('notes', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                    placeholder="Optional notes…"
                  />
                </div>
              </div>
            </div>

            {/* ── Section 4: Location ───────────────────────────── */}
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
                <h3 className={SECTION_HEAD}>Location</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <SearchableSelect
                    label="Storage Location"
                    value={form.location_id as string}
                    onChange={v => setField('location_id', v)}
                    options={locations}
                    clearable={false}
                    placeholder="Select location"
                    size="sm"
                    usePortal
                  />
                </div>
              </div>
            </div>

            {/* ── Submit error ──────────────────────────────────── */}
            {errors.submit && (
              <div className="flex items-start gap-2 p-3 bg-danger-muted border border-danger/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <p className="text-sm text-danger">{errors.submit}</p>
              </div>
            )}

            {/* ── Actions ───────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEdit ? 'Updating…' : 'Creating…'}
                  </>
                ) : (
                  isEdit ? 'Update Item' : 'Add Item'
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default InventoryItemWizard;
