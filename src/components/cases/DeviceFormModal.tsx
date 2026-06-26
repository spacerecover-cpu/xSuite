import React, { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Tabs, type TabDef } from '../ui/Tabs';
import { HardDrive, Stethoscope, Cpu, History, X, Save } from 'lucide-react';
import { diagnosticsService } from '../../lib/diagnosticsService';
import { setPrimaryDevice } from '../../lib/deviceService';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';
import { DeviceDetailsForm } from './device-form/DeviceDetailsForm';
import { DeviceDiagnosticForm } from './device-form/DeviceDiagnosticForm';
import { DeviceComponentsForm } from './device-form/DeviceComponentsForm';
import { useDeviceFormCatalogs } from '../../lib/devices/deviceCatalogQueries';
import {
  hydrateDeviceForm,
  serializeDeviceForm,
  validateDeviceForm,
  type LoadedDevice,
} from '../../lib/devices/deviceFormSerialization';
import { BASIC_FIELDS, getDeviceFamilyConfig } from '../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../lib/devices/deviceFamily';

type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];
type CaseDeviceUpdate = Database['public']['Tables']['case_devices']['Update'];

// Shape of `deviceData` accepted by this modal. Editing flow passes a row from
// `case_devices` (uuid id, bigint device_role_id, uuid FK columns, etc.). The
// optional shape keeps the prop tolerant of partial rows from callers; the modal
// re-fetches the full row on edit so dynamic technical fields hydrate correctly.
export interface DeviceFormDeviceData {
  id?: string;
  device_role_id?: number | string | null;
  device_type_id?: string | null;
  brand_id?: string | null;
  model?: string | null;
  serial_number?: string | null;
  capacity_id?: string | null;
  condition_id?: string | null;
  accessories?: string[] | null;
  symptoms?: string | null;
  notes?: string | null;
  password?: string | null;
  encryption_id?: string | null;
  is_primary?: boolean | null;
  role_notes?: string | null;
}

interface DeviceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  deviceData?: DeviceFormDeviceData | null;
  onSuccess: () => void;
}

type DeviceTabId = 'details' | 'diagnostic' | 'components' | 'history';

export const DeviceFormModal: React.FC<DeviceFormModalProps> = ({
  isOpen,
  onClose,
  caseId,
  deviceData,
  onSuccess,
}) => {
  const isEditMode = !!deviceData;
  const { t } = useTranslation();
  const { profile } = useAuth();
  const toast = useToast();
  const titleId = useId();

  // Structural fields owned by this modal: the role gate, custody secret
  // (password), primary flag and role-specific notes. These have no dedicated
  // input in this modal — they are hydrated from the loaded device and written
  // back UNCHANGED so editing a device never wipes an existing role, password,
  // primary flag or note. New devices default the role to Patient (effect below).
  // Device identity, technical and diagnostic config fields are owned by the
  // dynamic forms and live in `detailState`.
  const [formData, setFormData] = useState({
    device_role_id: '',
    password: '',
    is_primary: false,
    role_notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDonorInventoryId, setSelectedDonorInventoryId] = useState('');
  const [activeTab, setActiveTab] = useState<DeviceTabId>('details');

  // Dynamic per-family device form state. `detailState` is ALWAYS derived via
  // hydrateDeviceForm (loads every ALL_FIELD_DEFS key) so serialize never NULLs a
  // hidden-family column. `loadedRef` is the same {device, diagnostics} we
  // hydrated from and is passed back to serializeDeviceForm to preserve hidden
  // technical_details/result keys.
  const { options: deviceCatalogs } = useDeviceFormCatalogs();
  const [detailState, setDetailState] = useState<Record<string, unknown>>(
    () => hydrateDeviceForm({ device: {}, diagnostics: null }),
  );
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [loadedRef, setLoadedRef] = useState<LoadedDevice>({ device: {}, diagnostics: null });
  const onDetailChange = (key: string, value: unknown) =>
    setDetailState(prev => ({ ...prev, [key]: value }));

  const { data: deviceRoles = [] } = useQuery({
    queryKey: ['device_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_roles')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Engineers available for diagnostic assignment (active technicians) — shaped
  // as CatalogOption[] for the Diagnostic tab's Engineer select.
  const { data: engineerOptions = [] } = useQuery({
    queryKey: ['device_form_engineers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'technician')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? 'Unknown' }));
    },
    enabled: isOpen,
  });

  const { data: donorInventory = [] } = useQuery({
    queryKey: ['donor_inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          id,
          name,
          serial_number,
          model,
          quantity,
          purchase_price,
          brand_id,
          capacity_id,
          brand:catalog_device_brands(name),
          capacity:catalog_device_capacities(name)
        `)
        .eq('is_donor', true)
        .gt('quantity', 0)
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  // Load device + diagnostics and hydrate the dynamic form. On edit we fetch the
  // FULL case_devices row (deviceData may be partial) so technical_details/dom/
  // part_number/dcm hydrate; on add we start from an empty hydrated state.
  useEffect(() => {
    let cancelled = false;
    setActiveTab('details');

    async function load() {
      if (deviceData?.id) {
        const [{ data: fullRow }, diagnosticsRow] = await Promise.all([
          supabase
            .from('case_devices')
            .select('*')
            .eq('id', deviceData.id)
            .is('deleted_at', null)
            .maybeSingle(),
          diagnosticsService
            .getDiagnosticsWithDevice(deviceData.id)
            .catch((error) => {
              logger.error('Error loading diagnostics:', error);
              return null;
            }),
        ]);

        if (cancelled) return;

        const device = (fullRow ?? {}) as Record<string, unknown>;
        const diagnostics =
          (diagnosticsRow?.result as Record<string, unknown> | undefined) ?? null;
        const loaded: LoadedDevice = { device, diagnostics };
        setLoadedRef(loaded);
        setDetailState(hydrateDeviceForm(loaded));
        setDetailErrors({});

        const src = (fullRow ?? deviceData) as DeviceFormDeviceData;
        setFormData({
          device_role_id: src.device_role_id != null ? src.device_role_id.toString() : '',
          password: src.password ?? '',
          is_primary: src.is_primary ?? false,
          role_notes: src.role_notes ?? '',
        });
        setSelectedDonorInventoryId('');
      } else {
        const loaded: LoadedDevice = { device: {}, diagnostics: null };
        setLoadedRef(loaded);
        setDetailState(hydrateDeviceForm(loaded));
        setDetailErrors({});
        setFormData({
          device_role_id: '',
          password: '',
          is_primary: false,
          role_notes: '',
        });
        setSelectedDonorInventoryId('');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [deviceData]);

  // Default new devices to the Patient role once the role catalog has loaded,
  // without clobbering a role the user already picked.
  useEffect(() => {
    if (deviceData) return;
    const patientRole = deviceRoles.find(r => r.name.toLowerCase() === 'patient');
    if (patientRole?.id != null) {
      setFormData(prev =>
        prev.device_role_id ? prev : { ...prev, device_role_id: patientRole.id.toString() },
      );
    }
  }, [deviceData, deviceRoles]);

  const selectedRole = deviceRoles.find(r => r.id != null && r.id.toString() === formData.device_role_id);
  const roleName = selectedRole?.name.toLowerCase() || '';
  const isDonorRole = roleName === 'donor';

  // Donor devices source identity from inventory and have no diagnostic/component
  // workups, so those tabs are disabled — bounce the user back to Details if they
  // were viewing one when the role flipped to donor.
  useEffect(() => {
    if (isDonorRole && (activeTab === 'diagnostic' || activeTab === 'components')) {
      setActiveTab('details');
    }
  }, [isDonorRole, activeTab]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const submitIsDonorRole = isDonorRole;

      const typeName =
        deviceCatalogs.device_types?.find(o => o.id === detailState.device_type_id)?.name ?? '';
      const family = resolveDeviceFamily(typeName);

      // Validate the visible dynamic fields (Basic + current family Technical).
      // Donor identity is sourced from inventory, so the dynamic-form requireds
      // (e.g. Device Type) do not apply to donor devices.
      if (!submitIsDonorRole) {
        const visible = [...BASIC_FIELDS, ...getDeviceFamilyConfig(family).technical];
        const { ok, errors } = validateDeviceForm(detailState, visible);
        setDetailErrors(errors);
        if (!ok) {
          // Surface the missing Device Type by switching to the Details tab, where
          // the field (and the error dot on the tab) is visible.
          if (errors.device_type_id) setActiveTab('details');
          setIsSubmitting(false);
          return;
        }
      } else {
        setDetailErrors({});
      }

      // Serialize from the hydrated state + the row we hydrated from (loadedRef) so
      // hidden-family technical_details/result keys are preserved, never NULLed.
      // Device Problem (→symptoms) and Recovery Requirement (→notes) are written
      // here by devicePatch — the modal no longer writes them structurally.
      const { devicePatch, diagnosticsPatch, hasDiagnostics } = serializeDeviceForm(
        detailState,
        loadedRef,
      );

      // Structural fields owned by the modal (unchanged behavior across roles).
      const structural: Record<string, unknown> = {
        case_id: caseId,
        tenant_id: profile?.tenant_id ?? '',
        device_role_id: formData.device_role_id ? Number(formData.device_role_id) : null,
        password: formData.password || null,
        role_notes: formData.role_notes || null,
      };

      // Donor role: write ONLY structural + identity from the selected inventory
      // item — never spread devicePatch (technical columns, technical_details jsonb,
      // symptoms/notes/diagnosis/recovery_result must NOT be written for donors).
      // Non-donor: full devicePatch as before.
      let devicePayload: Record<string, unknown>;
      if (submitIsDonorRole) {
        devicePayload = { ...structural };
        if (selectedDonorInventoryId) {
          const donor = donorInventory.find(d => d.id === selectedDonorInventoryId);
          if (donor) {
            devicePayload = {
              ...devicePayload,
              brand_id: donor.brand_id ?? null,
              model: donor.model ?? null,
              serial_number: donor.serial_number ?? null,
              capacity_id: donor.capacity_id ?? null,
            };
          }
        }
      } else {
        devicePayload = { ...structural, ...devicePatch };
      }

      let deviceId: string | undefined = deviceData?.id;

      if (isEditMode && deviceData?.id) {
        const { error } = await supabase
          .from('case_devices')
          .update(devicePayload as CaseDeviceUpdate)
          .eq('id', deviceData.id);

        if (error) throw error;
      } else {
        const insertPayload = {
          ...devicePayload,
          created_by: profile?.id ?? null,
        } as CaseDeviceInsert;
        const { data: insertedDevice, error } = await supabase
          .from('case_devices')
          .insert([insertPayload])
          .select('id')
          .maybeSingle();

        if (error) throw error;
        deviceId = insertedDevice?.id;
      }

      if (formData.is_primary && deviceId) {
        await setPrimaryDevice(deviceId, caseId);
      }

      if (submitIsDonorRole && selectedDonorInventoryId && deviceId) {
        const donor = donorInventory.find(d => d.id === selectedDonorInventoryId);
        if (donor) {
          const { error: assignmentError } = await supabase
            .from('inventory_case_assignments')
            .insert([{
              tenant_id: profile?.tenant_id ?? '',
              item_id: selectedDonorInventoryId,
              case_id: caseId,
              assigned_by: profile?.id ?? null,
              purpose: 'donor_part',
              notes: `Donor for case device ${deviceId}`,
            }]);

          if (assignmentError) {
            logger.error('Error creating inventory case assignment:', assignmentError);
          }
        }
      }

      // Persist component diagnostics for non-donor roles only. Donors have no
      // diagnostic workup — skip the upsert entirely to prevent a phantom
      // device_diagnostics row from being minted for a donor device.
      if (deviceId && hasDiagnostics && !submitIsDonorRole) {
        try {
          const category = diagnosticsService.determineDeviceCategory(typeName);
          await diagnosticsService.upsertDeviceDiagnostics({
            case_device_id: deviceId,
            ...diagnosticsPatch,
            device_type_category: category,
          } as Parameters<typeof diagnosticsService.upsertDeviceDiagnostics>[0]);
        } catch (error) {
          logger.error('Error saving diagnostics:', error);
          // The device record itself saved; surface the inspection-save failure
          // loudly rather than swallowing it (a silent drop reads as success
          // while the technician's findings are lost).
          toast.error(
            `Device saved, but the inspection/diagnostics did NOT save: ${
              error instanceof Error ? error.message : 'unknown error'
            }. Re-open the device and retry.`
          );
        }
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving device:', error);
      toast.error(`Failed to save device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = !!formData.device_role_id && (
    isDonorRole
      ? !!selectedDonorInventoryId
      : !!detailState.device_type_id
  );

  const tabDefs: TabDef[] = [
    { id: 'details', label: t('devices.tab.details', { defaultValue: 'Device Details' }), icon: HardDrive, colorToken: 'primary', hasError: detailErrors.device_type_id != null },
    { id: 'diagnostic', label: t('devices.tab.diagnostic', { defaultValue: 'Diagnostic' }), icon: Stethoscope, colorToken: 'cat-5', disabled: isDonorRole },
    { id: 'components', label: t('devices.tab.components', { defaultValue: 'Components' }), icon: Cpu, colorToken: 'cat-2', disabled: isDonorRole },
    { id: 'history', label: t('devices.tab.history', { defaultValue: 'History / Activity' }), icon: History, colorToken: 'cat-6', disabled: true },
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop={false}
      className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-surface border border-border shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
    >
      {/* Fixed header: title + close, thin divider underneath */}
      <div className="shrink-0 flex items-center justify-between px-6 h-12 border-b border-border">
        <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900">
          {isEditMode
            ? t('devices.action.editTitle', { defaultValue: 'Edit Device' })
            : t('devices.action.addTitle', { defaultValue: 'Add Device' })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: 'Close' })}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Fixed tab navigation (colored pills) */}
      <div className="shrink-0 px-6 pt-3 pb-2">
        <Tabs tabs={tabDefs} activeId={activeTab} variant="pills" onChange={(id) => setActiveTab(id as DeviceTabId)} />
      </div>

      {/* Scrolling body — light backdrop with a white form card */}
      <div
        className="flex-1 overflow-y-auto bg-surface-muted px-4 pb-4 pt-1"
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'diagnostic' ? (
          // The Diagnostic tab is a two-column layout that brings its own cards
          // (form + context sidebar), so it renders full-width — not inside the
          // single centered card used by the other tabs.
          <DeviceDiagnosticForm
            state={detailState}
            onChange={onDetailChange}
            options={deviceCatalogs}
            errors={detailErrors}
            caseId={caseId}
            engineerOptions={engineerOptions}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            {activeTab === 'details' && (
              isDonorRole ? (
                <div className="space-y-3">
                  <SearchableSelect
                    label={t('devices.field.donorFromInventory', { defaultValue: 'Select Donor from Inventory' })}
                    size="sm"
                    value={selectedDonorInventoryId}
                    onChange={setSelectedDonorInventoryId}
                    options={donorInventory.map(d => ({
                      id: d.id,
                      name: `${d.name}${d.model ? ` - ${d.model}` : ''}${d.serial_number ? ` (S/N: ${d.serial_number})` : ''} - Available: ${d.quantity}`,
                    }))}
                    placeholder={t('devices.field.donorPlaceholder', { defaultValue: 'Select donor device from inventory...' })}
                    required
                    clearable={false}
                  />
                </div>
              ) : (
                <DeviceDetailsForm
                  state={detailState}
                  onChange={onDetailChange}
                  options={deviceCatalogs}
                  errors={detailErrors}
                />
              )
            )}

            {activeTab === 'components' && (
              <DeviceComponentsForm
                state={detailState}
                onChange={onDetailChange}
                options={deviceCatalogs}
                errors={detailErrors}
              />
            )}

            {activeTab === 'history' && (
              <div className="text-sm text-slate-500 py-8 text-center">
                {t('devices.tab.historySoon', { defaultValue: 'Device history & activity — coming soon.' })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 flex items-center justify-end gap-3 px-6 h-14 border-t border-border bg-surface">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isSubmitting} className="h-10 rounded-[10px] px-5">
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button size="md" onClick={handleSubmit} disabled={!isFormValid || isSubmitting} className="h-10 rounded-[10px] px-5 shadow-sm">
          <Save className="w-[18px] h-[18px] me-2" />
          {isSubmitting
            ? t('common.saving', { defaultValue: 'Saving...' })
            : isEditMode
              ? t('devices.action.save', { defaultValue: 'Save Changes' })
              : t('devices.action.add', { defaultValue: 'Add Device' })}
        </Button>
      </div>
    </Dialog>
  );
};
