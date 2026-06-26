import React, { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { Dialog } from '../ui/Dialog';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Tabs, type TabDef } from '../ui/Tabs';
import { HardDrive, Stethoscope, Cpu, History, Eye, EyeOff, Trash2 } from 'lucide-react';
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
  const passwordId = useId();
  const roleNotesId = useId();

  // Structural fields owned by this modal: the role gate, custody secret
  // (password) and role-specific notes. Device identity, technical and
  // diagnostic config fields are owned by the dynamic forms and live in
  // `detailState` (Device Problem / Recovery Requirement now ride there too).
  const [formData, setFormData] = useState({
    device_role_id: '',
    password: '',
    is_primary: false,
    role_notes: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const isPatientRole = roleName === 'patient';
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

  const handleDelete = async () => {
    if (!deviceData?.id) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('case_devices')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deviceData.id);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Error deleting device:', error);
      toast.error(`Failed to delete device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
    }
  };

  const availableDeviceRoles = deviceRoles.filter(r => r.name.toLowerCase() !== 'clone');

  const isFormValid = !!formData.device_role_id && (
    isDonorRole
      ? !!selectedDonorInventoryId
      : !!detailState.device_type_id
  );

  const tabDefs: TabDef[] = [
    { id: 'details', label: t('devices.tab.details', { defaultValue: 'Device Details' }), icon: HardDrive, colorToken: 'cat-1', hasError: detailErrors.device_type_id != null },
    { id: 'diagnostic', label: t('devices.tab.diagnostic', { defaultValue: 'Diagnostic' }), icon: Stethoscope, colorToken: 'cat-2', disabled: isDonorRole },
    { id: 'components', label: t('devices.tab.components', { defaultValue: 'Components' }), icon: Cpu, colorToken: 'cat-3', disabled: isDonorRole },
    { id: 'history', label: t('devices.tab.history', { defaultValue: 'History / Activity' }), icon: History, colorToken: 'cat-4', disabled: true },
  ];

  // Custody secret + role notes — relocated from "Advanced Options" into the
  // Details tab footer. Shown for every role (donor included).
  const passwordAndRoleNotes = (
    <div className="space-y-3 pt-3 border-t border-border">
      <div>
        <label htmlFor={passwordId} className="block text-sm font-medium text-slate-700 mb-1">
          {t('devices.field.password', { defaultValue: 'Device Password' })}
        </label>
        <div className="flex items-start gap-2">
          <Input
            id={passwordId}
            type={showPassword ? 'text' : 'password'}
            size="sm"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder={t('devices.field.passwordPlaceholder', { defaultValue: 'Enter device password if applicable...' })}
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword
              ? t('devices.field.hidePassword', { defaultValue: 'Hide password' })
              : t('devices.field.showPassword', { defaultValue: 'Show password' })}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Textarea
        id={roleNotesId}
        label={t('devices.field.role_notes', { defaultValue: 'Role-Specific Notes' })}
        size="sm"
        rows={2}
        value={formData.role_notes}
        onChange={(e) => setFormData({ ...formData, role_notes: e.target.value })}
        placeholder={t('devices.field.roleNotesPlaceholder', { defaultValue: 'Additional notes specific to this device role...' })}
      />
    </div>
  );

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        labelledBy={titleId}
        closeOnBackdrop={false}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl bg-surface shadow-xl"
      >
        {/* Fixed header: title + role/primary context row + tabs */}
        <div className="shrink-0 border-b border-border px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {isEditMode
                ? t('devices.action.editTitle', { defaultValue: 'Edit Device' })
                : t('devices.action.addTitle', { defaultValue: 'Add Device' })}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <SearchableSelect
              label={t('devices.field.device_role', { defaultValue: 'Device Role' })}
              size="sm"
              value={formData.device_role_id}
              onChange={(value) => {
                const role = deviceRoles.find(r => r.id != null && r.id.toString() === value);
                const newRoleName = role?.name.toLowerCase() || '';

                setFormData(prev => ({
                  ...prev,
                  device_role_id: value,
                  is_primary: newRoleName === 'patient' ? prev.is_primary : false,
                }));

                if (newRoleName === 'donor') {
                  setSelectedDonorInventoryId('');
                }
              }}
              options={availableDeviceRoles.map(r => ({ id: r.id.toString(), name: r.name }))}
              placeholder={t('devices.field.deviceRolePlaceholder', { defaultValue: 'Select device role...' })}
              required
              clearable={false}
            />

            {isPatientRole && (
              <label className="flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-slate-700">
                  {t('devices.field.markPrimary', { defaultValue: 'Mark as Primary Device' })}
                </span>
              </label>
            )}
          </div>

          <Tabs tabs={tabDefs} activeId={activeTab} onChange={(id) => setActiveTab(id as DeviceTabId)} />
        </div>

        {/* Scrolling body */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3"
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
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
                {passwordAndRoleNotes}
              </div>
            ) : (
              <DeviceDetailsForm
                state={detailState}
                onChange={onDetailChange}
                options={deviceCatalogs}
                errors={detailErrors}
                extraFooter={passwordAndRoleNotes}
              />
            )
          )}

          {activeTab === 'diagnostic' && (
            <DeviceDiagnosticForm
              state={detailState}
              onChange={onDetailChange}
              options={deviceCatalogs}
              errors={detailErrors}
            />
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

        {/* Sticky footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-surface-muted">
          <div>
            {isEditMode && (
              <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={isSubmitting}>
                <Trash2 className="w-4 h-4 me-1.5" />
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
              {isSubmitting
                ? t('common.saving', { defaultValue: 'Saving...' })
                : isEditMode
                  ? t('devices.action.save', { defaultValue: 'Save Changes' })
                  : t('devices.action.add', { defaultValue: 'Add Device' })}
            </Button>
          </div>
        </div>
      </Dialog>

      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('devices.action.deleteTitle', { defaultValue: 'Delete Device' })}
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            {t('devices.action.deleteConfirm', { defaultValue: 'Are you sure you want to delete this device? This action cannot be undone.' })}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isSubmitting}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('common.deleting', { defaultValue: 'Deleting...' })
                : t('devices.action.deleteTitle', { defaultValue: 'Delete Device' })}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
