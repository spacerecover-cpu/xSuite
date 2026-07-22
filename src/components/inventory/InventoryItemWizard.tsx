// src/components/inventory/InventoryItemWizard.tsx
//
// Device-type-driven Inventory Item Wizard — Inventory V2 P3.
// Uses the shared device-field engine (DeviceFieldRenderer + getDeviceFamilyConfig)
// so technical fields appear dynamically per device type, identical to Case Intake.
// Numbering via get_next_inventory_number(device_type_id) RPC.

import { useState, useEffect, useCallback, useRef } from 'react';
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
} from '../../lib/inventoryService';
import { useQuery } from '@tanstack/react-query';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import type { Json } from '../../types/database.types';
import { toDateInputValue } from '../../lib/format';
import { inventoryKeys } from '../../lib/queryKeys';
import { shouldAutoPrintLabel } from '../../lib/labelPrefsService';
import type { InventoryItemWithDetails } from '../../lib/inventory/inventoryLabelTypes';
import { logger } from '../../lib/logger';
import type { DeviceFamily } from '../../lib/devices/deviceFamily';
import type { CatalogOption } from '../../lib/devices/deviceCatalogQueries';
import { getDonorParts } from '../../lib/inventory/donorParts';
import { getItemDonorParts, setItemDonorParts } from '../../lib/inventory/donorPartsService';
import type { DonorPartInput } from '../../lib/inventory/donorPartsService';
import { Wrench, Check } from 'lucide-react';
import { HierarchicalLocationPicker } from './HierarchicalLocationPicker';
import { useDeviceTypeSettings } from '../../lib/inventory/deviceTypeSettingsService';

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
  // Optional free-text reference to the device's original case in a legacy/old ERP
  // system (for devices migrated into inventory with no matching xSuite cases row).
  legacy_case_ref: string;
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
  legacy_case_ref: '',
  status_id: '',
  quantity: 1,
  min_quantity: 0,
  purchase_price: '',
  purchase_date: '',
  supplier_id: '',
  is_donor: true,
  notes: '',
  location_id: '',
};

// No bottom margin — the heading sits inside a flex row with its icon, and
// the section wrapper's space-y-3 provides the gap below.
const SECTION_HEAD = 'text-sm font-semibold text-slate-900';

// Identity fields shown in inventory (device_type_id is rendered specially above).
// Module-level: BASIC_FIELDS is a static constant, so this never needs recomputing per render.
const IDENTITY_BASIC_FIELDS = BASIC_FIELDS.filter(d => d.key !== 'device_type_id');
// Wide responsive grid: the modal is maxWidth 7xl, so step up to 4–5 columns on
// large screens to keep the whole form visible without scrolling, collapsing to
// 3/2/1 on smaller widths so inputs stay usable (no cramped selects).
const FIELD_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-3';

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

// catalog_device_types.family stores a canonical DeviceFamily KEY (underscore
// form, e.g. 'head_stack', 'memory_card') — backfilled by migration
// 20260629215312. Those keys must be used DIRECTLY: routing them through the
// name-based resolveDeviceFamily() collapses 'memory_card' and 'head_stack' to
// 'other' (its heuristics expect display names with spaces), which selects the
// wrong technical field set AND an empty donor-part vocabulary — silently
// dropping stored specs and soft-deleting recorded donor parts on edit/save.
// Record<DeviceFamily, true> keeps this exhaustive: a new family in the union
// won't compile until it is listed here.
const DEVICE_FAMILY_KEYS: Record<DeviceFamily, true> = {
  hdd: true, ssd: true, nvme: true, usb_flash: true, memory_card: true,
  mobile: true, raid: true, nas: true, pcb: true, head_stack: true, other: true,
};

/**
 * Resolve the DeviceFamily for a device-type row. Prefers the row's canonical
 * `family` KEY; falls back to name-based resolution only when `family` is absent
 * or (defensively) holds a legacy display name rather than a canonical key.
 */
export function familyFromDeviceType(
  dt: { family?: string | null; name?: string | null } | undefined,
): DeviceFamily {
  const key = dt?.family?.trim().toLowerCase();
  if (key && Object.prototype.hasOwnProperty.call(DEVICE_FAMILY_KEYS, key)) {
    return key as DeviceFamily;
  }
  return resolveDeviceFamily(key || (dt?.name ?? ''));
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
  const [autoLocationHint, setAutoLocationHint] = useState<string>('');
  const locationUserChanged = useRef(false);

  // Donor parts state: maps part_type → { checked, quantity, condition_id }
  const [donorPartChecked, setDonorPartChecked] = useState<Record<string, boolean>>({});
  const [donorPartQty, setDonorPartQty] = useState<Record<string, number>>({});
  const [donorPartCondition, setDonorPartCondition] = useState<Record<string, string>>({});

  // Catalogs
  const { options: deviceCatalogs, isLoading: catalogsLoading } = useDeviceFormCatalogs();
  const { data: deviceTypes, isLoading: dtLoading } = useInventoryDeviceTypes();
  const { data: locations = [] } = useInventoryLocations();
  const { data: suppliers = [] } = useInventorySuppliers();

  // Device type default location settings (for auto-populate in create mode)
  const { data: deviceTypeSettingsMap } = useDeviceTypeSettings();

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

  // Inventory condition types (master_inventory_condition_types). NOTE: distinct from the
  // case-device 'conditions' catalog — inventory_items.condition_id FKs THIS table, so the
  // Condition field must be sourced here (not from BASIC_FIELDS' catalog_device_conditions).
  const { data: conditionTypes = [] } = useQuery({
    queryKey: ['master_inventory_condition_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_inventory_condition_types')
        .select('id, name')
        .eq('is_active', true)
        .order('rating', { ascending: false });
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
    return familyFromDeviceType(deviceTypes.find(d => d.id === typeId));
  }, [deviceTypes]);

  const family = resolveFamily(form.device_type_id as string);
  const familyConfig = getDeviceFamilyConfig(family);

  // Show a non-consuming pattern hint when device type changes (create mode only).
  // The real number is allocated exactly once at submit via getNextInventoryNumber.
  useEffect(() => {
    const typeId = form.device_type_id as string;
    if (!typeId || isEdit) return;
    setItemNumber(numberPreview(deviceTypes, typeId));
  }, [form.device_type_id, deviceTypes, isEdit]);

  // When device type is selected, auto-populate category_id from default_category_id
  const handleDeviceTypeChange = useCallback((typeId: string) => {
    const dt = deviceTypes?.find(d => d.id === typeId);
    const defaultCat = dt?.default_category_id ?? '';
    locationUserChanged.current = false;
    setAutoLocationHint('');
    setForm(prev => ({
      ...EMPTY_FORM,
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
      location_id: '',
      device_type_id: typeId,
    }));
    setErrors({});
    setDonorPartChecked({});
    setDonorPartQty({});
    setDonorPartCondition({});
  }, [deviceTypes]);

  // Auto-populate location from device type settings (create mode only)
  useEffect(() => {
    if (isEdit || locationUserChanged.current) return;
    const typeId = form.device_type_id as string;
    if (!typeId || !deviceTypeSettingsMap) return;
    const defaultLocId = deviceTypeSettingsMap.get(typeId);
    if (!defaultLocId) return;
    const dt = deviceTypes?.find(d => d.id === typeId);
    setForm(prev => ({ ...prev, location_id: defaultLocId }));
    setAutoLocationHint(dt?.name ? `Default location for ${dt.name}` : 'Default location');
  }, [form.device_type_id, deviceTypeSettingsMap, deviceTypes, isEdit]);

  const setField = useCallback((key: string, value: unknown) => {
    if (key === 'location_id') {
      locationUserChanged.current = true;
      setAutoLocationHint('');
    }
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

        const itemFamily = familyFromDeviceType(
          deviceTypes?.find(d => d.id === item.device_type_id),
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
          legacy_case_ref: item.legacy_case_ref ?? '',
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

        // Hydrate donor parts for edit mode
        if (item.is_donor) {
          try {
            const existingParts = await getItemDonorParts(itemId);
            const checkedMap: Record<string, boolean> = {};
            const qtyMap: Record<string, number> = {};
            const condMap: Record<string, string> = {};
            for (const part of existingParts) {
              checkedMap[part.part_type] = true;
              qtyMap[part.part_type] = part.quantity;
              condMap[part.part_type] = part.condition_id ?? '';
            }
            setDonorPartChecked(checkedMap);
            setDonorPartQty(qtyMap);
            setDonorPartCondition(condMap);
          } catch (err) {
            logger.error('InventoryItemWizard: error loading donor parts', err);
          }
        }
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
      setAutoLocationHint('');
      locationUserChanged.current = false;
      setDonorPartChecked({});
      setDonorPartQty({});
      setDonorPartCondition({});
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
        legacy_case_ref: (form.legacy_case_ref as string).trim() || null,
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

      let savedItemId: string;
      let createdItem: Awaited<ReturnType<typeof createInventoryItem>> = null;
      if (isEdit && itemId) {
        await updateInventoryItem(itemId, basePayload);
        savedItemId = itemId;
      } else {
        const tenantId = getTenantId();
        if (!tenantId) throw new Error('No tenant context. Please log in again.');
        // item_number/barcode/qr_value are assigned atomically by the DB trigger
        // (trg_assign_inventory_item_number) inside the insert transaction, so a failed
        // insert never burns a sequence number (no phantom counter advances).
        const created = await createInventoryItem({
          ...basePayload,
          tenant_id: tenantId,
        });
        if (!created) throw new Error('Failed to create inventory item');
        savedItemId = created.id;
        createdItem = created;
      }

      // Persist donor parts when is_donor is checked
      if (form.is_donor as boolean) {
        const partsToSave: DonorPartInput[] = getDonorParts(family)
          .filter(def => donorPartChecked[def.key])
          .map(def => ({
            part_type: def.key,
            quantity: donorPartQty[def.key] ?? 1,
            condition_id: donorPartCondition[def.key] || null,
            notes: null,
          }));
        await setItemDonorParts(savedItemId, partsToSave);
      } else if (isEdit && itemId) {
        // If is_donor was unchecked on edit, clear all donor parts
        await setItemDonorParts(savedItemId, []);
      }

      await queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });

      // Direct Print Label: fire-and-forget so a printer problem never blocks intake.
      if (createdItem) {
        const newItemId = createdItem.id;
        const bareItem = createdItem;
        void shouldAutoPrintLabel('inventory').then(async (enabled) => {
          if (!enabled) return;
          const { printInventoryLabels } = await import('../../lib/pdf/labels/labelPrintService');
          // createInventoryItem returns the bare insert row (no joined brand /
          // device type / capacity / location), so re-fetch the enriched item
          // — otherwise the auto-printed label silently drops the spec + location
          // lines that a list-printed label shows. Fall back to the bare row.
          const enriched = await getInventoryItemById(newItemId).catch(() => null);
          const item = (enriched ?? bareItem) as unknown as InventoryItemWithDetails;
          await printInventoryLabels([item], { output: 'print' });
        });
      }

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Inventory Item' : 'Add Inventory Item'}
      subtitle={isEdit ? "Update this inventory item's details." : 'Enter the device details to add it to inventory.'}
      icon={Package}
      maxWidth="7xl"
      showClose
      closeOnBackdrop={false}
      headerAction={
        itemNumber ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-info-muted border border-info/30 rounded-lg">
            <Hash className="w-3.5 h-3.5 text-info" />
            <span className="text-xs font-medium text-slate-600">
              {isEdit ? 'Item Number:' : 'Number Pattern:'}
            </span>
            <span className="text-sm font-bold text-info font-mono">{itemNumber}</span>
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
              <div className={FIELD_GRID}>
                <div>
                  <SearchableSelect
                    label={t('devices.field.device_type_id', { defaultValue: 'Device Type' })}
                    value={form.device_type_id as string}
                    onChange={handleDeviceTypeChange}
                    options={deviceTypes ?? []}
                    required
                    error={errors.device_type_id}
                    placeholder="Select device type"
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
                    error={errors.category_id}
                    placeholder="Select category"
                    usePortal
                  />
                </div>

                {/* Remaining basic identity fields via DeviceFieldRenderer */}
                {IDENTITY_BASIC_FIELDS.map(def => (
                  <div key={def.key} className={def.colSpan === 2 ? 'sm:col-span-2' : undefined}>
                    <DeviceFieldRenderer
                      def={def}
                      value={form[def.key]}
                      onChange={setField}
                      // condition_id FKs master_inventory_condition_types for inventory items,
                      // NOT the shared catalog_device_conditions that BASIC_FIELDS points at.
                      options={def.key === 'condition_id'
                        ? conditionTypes
                        : (def.optionsSource ? (catalogOptions[def.optionsSource] ?? []) : [])}
                      error={errors[def.key]}
                    />
                  </div>
                ))}

                {/* Legacy Case ID — optional free-text reference to the device's
                    original case in an old ERP (no matching xSuite cases row). */}
                <div>
                  <Input
                    label="Legacy Case ID"
                    value={form.legacy_case_ref as string}
                    onChange={e => setField('legacy_case_ref', e.target.value)}
                    placeholder="e.g. old ERP case ref"
                    maxLength={100}
                  />
                </div>
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

            {/* Donor Parts + Location — side by side on one row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* ── Donor Parts ──────────────────────── */}
            {(form.is_donor as boolean) && getDonorParts(family).length > 0 && (
              <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5 text-primary" />
                  <h3 className={SECTION_HEAD}>Donor Parts Available</h3>
                  <span className="text-xs text-slate-500 font-normal normal-case tracking-normal">
                    — {family.toUpperCase()} parts
                  </span>
                </div>
                {/* Compact coloured tick-cards on one wrapping row (tick = part available; qty defaults to 1). */}
                <div className="flex flex-wrap gap-2.5">
                  {getDonorParts(family).map(def => {
                    const checked = donorPartChecked[def.key] ?? false;
                    return (
                      <label
                        key={def.key}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 min-h-[44px] cursor-pointer select-none transition-colors focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-1 ${
                          checked
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-surface text-slate-700 hover:border-primary/40 hover:bg-primary/5'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={e => setDonorPartChecked(prev => ({ ...prev, [def.key]: e.target.checked }))}
                        />
                        <span
                          aria-hidden="true"
                          className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-surface'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-medium whitespace-nowrap">{def.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Location (spans full width when donor parts hidden) ─ */}
            <div className={`rounded-lg border border-border bg-surface-muted p-4 space-y-3 ${
              !((form.is_donor as boolean) && getDonorParts(family).length > 0) ? 'lg:col-span-2' : ''
            }`}>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
                <h3 className={SECTION_HEAD}>Location</h3>
              </div>
              <div>
                <HierarchicalLocationPicker
                  value={(form.location_id as string) || null}
                  onChange={id => setField('location_id', id ?? '')}
                  locations={locations}
                  placeholder="Select location"
                />
                {autoLocationHint && (
                  <p className="mt-1 text-xs text-primary/70">{autoLocationHint}</p>
                )}
              </div>
            </div>
            </div>

            {/* ── Inventory Details ─────────────────── */}
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
                    placeholder="Select status"
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
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    label="Min Quantity"
                    value={String(form.min_quantity)}
                    min="0"
                    onChange={e => setField('min_quantity', parseInt(e.target.value) || 0)}
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
                  />
                </div>

                <div>
                  <Input
                    type="date"
                    label="Purchase Date"
                    value={form.purchase_date as string}
                    onChange={e => setField('purchase_date', e.target.value)}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Supplier"
                    value={form.supplier_id as string}
                    onChange={v => setField('supplier_id', v)}
                    options={[{ id: '', name: 'Not specified' }, ...suppliers]}
                    placeholder="Select supplier"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes as string}
                    onChange={e => setField('notes', e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                    placeholder="Optional notes…"
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
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
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
