import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { HardDrive, Eye, EyeOff, Trash2, ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { diagnosticsService } from '../../lib/diagnosticsService';
import { setPrimaryDevice } from '../../lib/deviceService';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];
type CaseDeviceUpdate = Database['public']['Tables']['case_devices']['Update'];

// Shape of `deviceData` accepted by this modal. Editing flow passes a row from
// `case_devices` (uuid id, bigint device_role_id, uuid FK columns, etc.). The
// optional shape keeps the prop tolerant of partial rows from callers.
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

export const DeviceFormModal: React.FC<DeviceFormModalProps> = ({
  isOpen,
  onClose,
  caseId,
  deviceData,
  onSuccess,
}) => {
  const isEditMode = !!deviceData;
  const { profile } = useAuth();
  const toast = useToast();

  const [formData, setFormData] = useState({
    device_role_id: '',
    device_type_id: '',
    brand_id: '',
    model: '',
    serial_number: '',
    capacity_id: '',
    condition_id: '',
    accessories: [] as string[],
    symptoms: '',
    recovery_notes: '',
    password: '',
    encryption_id: '',
    is_primary: false,
    role_notes: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [selectedDonorInventoryId, setSelectedDonorInventoryId] = useState('');
  const [showDiagnosticsSection, setShowDiagnosticsSection] = useState(false);
  const [diagnosticsFormData, setDiagnosticsFormData] = useState({
    device_type_category: '' as 'hdd' | 'ssd' | 'hybrid' | 'other' | '',
    heads_status: '',
    pcb_status: '',
    pcb_notes: '',
    motor_status: '',
    surface_status: '',
    sa_access: false,
    platter_condition: '',
    controller_status: '',
    controller_model: '',
    memory_chips_status: '',
    nand_type: '',
    firmware_corruption: false,
    trim_support: false,
    wear_leveling_count: '',
    firmware_version: '',
    rom_version: '',
    physical_damage_notes: '',
    technical_notes: '',
  });

  const { data: deviceTypes = [] } = useQuery({
    queryKey: ['device_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_types')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_brands')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: capacities = [] } = useQuery({
    queryKey: ['capacities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_capacities')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: deviceConditions = [] } = useQuery({
    queryKey: ['device_conditions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_conditions')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

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

  const { data: encryptionTypes = [] } = useQuery({
    queryKey: ['device_encryption'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_encryption')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: accessories = [] } = useQuery({
    queryKey: ['accessories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_accessories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: componentStatuses = [] } = useQuery({
    queryKey: ['component_statuses'],
    queryFn: async () => {
      return await diagnosticsService.getComponentStatuses();
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

  useEffect(() => {
    if (deviceData) {
      setFormData({
        device_role_id: deviceData.device_role_id != null ? deviceData.device_role_id.toString() : '',
        device_type_id: deviceData.device_type_id ?? '',
        brand_id: deviceData.brand_id ?? '',
        model: deviceData.model ?? '',
        serial_number: deviceData.serial_number ?? '',
        capacity_id: deviceData.capacity_id ?? '',
        condition_id: deviceData.condition_id ?? '',
        accessories: deviceData.accessories ?? [],
        symptoms: deviceData.symptoms ?? '',
        recovery_notes: deviceData.notes ?? '',
        password: deviceData.password ?? '',
        encryption_id: deviceData.encryption_id ?? '',
        is_primary: deviceData.is_primary ?? false,
        role_notes: deviceData.role_notes ?? '',
      });
      setSelectedDonorInventoryId('');

      // Load existing diagnostics if in edit mode
      if (deviceData.id) {
        void loadDiagnostics(deviceData.id);
      }
    } else {
      const patientRole = deviceRoles.find(r => r.name.toLowerCase() === 'patient');
      setFormData({
        device_role_id: patientRole?.id != null ? patientRole.id.toString() : '',
        device_type_id: '',
        brand_id: '',
        model: '',
        serial_number: '',
        capacity_id: '',
        condition_id: '',
        accessories: [],
        symptoms: '',
        recovery_notes: '',
        password: '',
        encryption_id: '',
        is_primary: false,
        role_notes: '',
      });
      setSelectedDonorInventoryId('');
      // Reset diagnostics for new device
      setShowDiagnosticsSection(false);
      setDiagnosticsFormData({
        device_type_category: '',
        heads_status: '',
        pcb_status: '',
        pcb_notes: '',
        motor_status: '',
        surface_status: '',
        sa_access: false,
        platter_condition: '',
        controller_status: '',
        controller_model: '',
        memory_chips_status: '',
        nand_type: '',
        firmware_corruption: false,
        trim_support: false,
        wear_leveling_count: '',
        firmware_version: '',
        rom_version: '',
        physical_damage_notes: '',
        technical_notes: '',
      });
    }
  }, [deviceData, deviceRoles]);

  // Load diagnostics data for editing
  const loadDiagnostics = async (deviceId: string) => {
    try {
      const diagnostics = await diagnosticsService.getDeviceDiagnostics(deviceId);
      if (diagnostics) {
        setDiagnosticsFormData({
          device_type_category: diagnostics.device_type_category || '',
          heads_status: diagnostics.heads_status || '',
          pcb_status: diagnostics.pcb_status || '',
          pcb_notes: diagnostics.pcb_notes || '',
          motor_status: diagnostics.motor_status || '',
          surface_status: diagnostics.surface_status || '',
          sa_access: diagnostics.sa_access || false,
          platter_condition: diagnostics.platter_condition || '',
          controller_status: diagnostics.controller_status || '',
          controller_model: diagnostics.controller_model || '',
          memory_chips_status: diagnostics.memory_chips_status || '',
          nand_type: diagnostics.nand_type || '',
          firmware_corruption: diagnostics.firmware_corruption || false,
          trim_support: diagnostics.trim_support || false,
          wear_leveling_count: diagnostics.wear_leveling_count?.toString() || '',
          firmware_version: diagnostics.firmware_version || '',
          rom_version: diagnostics.rom_version || '',
          physical_damage_notes: diagnostics.physical_damage_notes || '',
          technical_notes: diagnostics.technical_notes || '',
        });
        setShowDiagnosticsSection(true);
      }
    } catch (error) {
      logger.error('Error loading diagnostics:', error);
    }
  };

  // Update device type category when device type changes
  useEffect(() => {
    if (formData.device_type_id && deviceTypes.length > 0) {
      const deviceType = deviceTypes.find(dt => dt.id === formData.device_type_id);
      if (deviceType) {
        const category = diagnosticsService.determineDeviceCategory(deviceType.name);
        setDiagnosticsFormData(prev => ({
          ...prev,
          device_type_category: category,
        }));
      }
    }
  }, [formData.device_type_id, deviceTypes]);

  // Check if any diagnostics data has been entered
  const hasDiagnosticsData = () => {
    return !!(
      diagnosticsFormData.heads_status ||
      diagnosticsFormData.pcb_status ||
      diagnosticsFormData.motor_status ||
      diagnosticsFormData.surface_status ||
      diagnosticsFormData.controller_status ||
      diagnosticsFormData.memory_chips_status ||
      diagnosticsFormData.physical_damage_notes ||
      diagnosticsFormData.technical_notes
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const selectedRole = deviceRoles.find(r => r.id != null && r.id.toString() === formData.device_role_id);
      const isDonorRole = selectedRole?.name.toLowerCase() === 'donor';

      // Build a strongly-typed payload matching the live case_devices schema.
      const basePayload: CaseDeviceInsert = {
        case_id: caseId,
        tenant_id: profile?.tenant_id ?? '',
        device_role_id: formData.device_role_id ? Number(formData.device_role_id) : null,
        password: formData.password || null,
        role_notes: formData.role_notes || null,
      };

      let devicePayload: CaseDeviceInsert;

      if (isDonorRole && selectedDonorInventoryId) {
        const donor = donorInventory.find(d => d.id === selectedDonorInventoryId);
        if (donor) {
          devicePayload = {
            ...basePayload,
            brand_id: donor.brand_id ?? null,
            model: donor.model ?? null,
            serial_number: donor.serial_number ?? null,
            capacity_id: donor.capacity_id ?? null,
          };
        } else {
          devicePayload = basePayload;
        }
      } else {
        devicePayload = {
          ...basePayload,
          device_type_id: formData.device_type_id || null,
          brand_id: formData.brand_id || null,
          model: formData.model || null,
          serial_number: formData.serial_number || null,
          capacity_id: formData.capacity_id || null,
          condition_id: formData.condition_id || null,
          accessories: formData.accessories.length > 0 ? formData.accessories : null,
          symptoms: formData.symptoms || null,
          notes: formData.recovery_notes || null,
          encryption_id: formData.encryption_id || null,
        };
      }

      let deviceId: string | undefined = deviceData?.id;

      if (isEditMode && deviceData?.id) {
        const updatePayload: CaseDeviceUpdate = { ...devicePayload };
        const { error } = await supabase
          .from('case_devices')
          .update(updatePayload)
          .eq('id', deviceData.id);

        if (error) throw error;
      } else {
        const insertPayload: CaseDeviceInsert = {
          ...devicePayload,
          created_by: profile?.id ?? null,
        };
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

      if (isDonorRole && selectedDonorInventoryId && deviceId) {
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

      // Save diagnostics data if patient role and diagnostics section has data
      if (isPatientRole && deviceId && hasDiagnosticsData()) {
        try {
          const category = diagnosticsFormData.device_type_category || 'other';
          await diagnosticsService.upsertDeviceDiagnostics({
            case_device_id: deviceId,
            device_type_category: category as 'hdd' | 'ssd' | 'hybrid' | 'other',
            heads_status: diagnosticsFormData.heads_status || undefined,
            pcb_status: diagnosticsFormData.pcb_status || undefined,
            pcb_notes: diagnosticsFormData.pcb_notes || undefined,
            motor_status: diagnosticsFormData.motor_status || undefined,
            surface_status: diagnosticsFormData.surface_status || undefined,
            sa_access: diagnosticsFormData.sa_access,
            platter_condition: diagnosticsFormData.platter_condition || undefined,
            controller_status: diagnosticsFormData.controller_status || undefined,
            controller_model: diagnosticsFormData.controller_model || undefined,
            memory_chips_status: diagnosticsFormData.memory_chips_status || undefined,
            nand_type: diagnosticsFormData.nand_type || undefined,
            firmware_corruption: diagnosticsFormData.firmware_corruption,
            trim_support: diagnosticsFormData.trim_support,
            wear_leveling_count: diagnosticsFormData.wear_leveling_count ? parseInt(diagnosticsFormData.wear_leveling_count) : undefined,
            firmware_version: diagnosticsFormData.firmware_version || undefined,
            rom_version: diagnosticsFormData.rom_version || undefined,
            physical_damage_notes: diagnosticsFormData.physical_damage_notes || undefined,
            technical_notes: diagnosticsFormData.technical_notes || undefined,
          });
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

  const selectedRole = deviceRoles.find(r => r.id != null && r.id.toString() === formData.device_role_id);
  const roleName = selectedRole?.name.toLowerCase() || '';
  const isPatientRole = roleName === 'patient';
  const isDonorRole = roleName === 'donor';

  const availableDeviceRoles = deviceRoles.filter(r => r.name.toLowerCase() !== 'clone');

  const isFormValid = formData.device_role_id && (
    isDonorRole ? !!selectedDonorInventoryId : (formData.device_type_id || formData.serial_number)
  );

  const handleDonorSelect = (donorId: string) => {
    setSelectedDonorInventoryId(donorId);
    const donor = donorInventory.find(d => d.id === donorId);
    if (donor) {
      setFormData({
        ...formData,
        // inventory_items no longer carries device_type_id; leave caller value.
        brand_id: donor.brand_id ?? '',
        model: donor.model ?? '',
        serial_number: donor.serial_number ?? '',
        capacity_id: donor.capacity_id ?? '',
      });
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Device' : 'Add Device'} maxWidth="4xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4 p-4 bg-slate-50 rounded-lg">
            <HardDrive className="w-5 h-5 text-warning" />
            <div>
              <h3 className="font-semibold text-slate-900">
                {isEditMode ? 'Update Device Information' : 'Add New Device to Case'}
              </h3>
              <p className="text-sm text-slate-600">
                {isEditMode ? 'Modify the device details below' : 'Fill in the device details to add it to this case'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3">
              <SearchableSelect
                label="Device Role"
                value={formData.device_role_id}
                onChange={(value) => {
                  const role = deviceRoles.find(r => r.id != null && r.id.toString() === value);
                  const newRoleName = role?.name.toLowerCase() || '';

                  setFormData({
                    ...formData,
                    device_role_id: value,
                    is_primary: newRoleName === 'patient' ? formData.is_primary : false,
                    symptoms: newRoleName === 'backup' ? '' : formData.symptoms,
                    recovery_notes: newRoleName === 'backup' ? '' : formData.recovery_notes,
                  });

                  if (newRoleName === 'donor') {
                    setSelectedDonorInventoryId('');
                  }
                }}
                options={availableDeviceRoles.map(r => ({ id: r.id.toString(), name: r.name }))}
                placeholder="Select device role..."
                required
                clearable={false}
              />
            </div>

            {isDonorRole && (
              <div className="col-span-3">
                <SearchableSelect
                  label="Select Donor from Inventory"
                  value={selectedDonorInventoryId}
                  onChange={handleDonorSelect}
                  options={donorInventory.map(d => ({
                    id: d.id,
                    name: `${d.name}${d.model ? ` - ${d.model}` : ''}${d.serial_number ? ` (S/N: ${d.serial_number})` : ''} - Available: ${d.quantity}`,
                  }))}
                  placeholder="Select donor device from inventory..."
                  required
                  clearable={false}
                />
              </div>
            )}

            {!isDonorRole && (
              <>
                <SearchableSelect
                  label="Media Type"
                  value={formData.device_type_id}
                  onChange={(value) => setFormData({ ...formData, device_type_id: value })}
                  options={deviceTypes.map(dt => ({ id: dt.id, name: dt.name }))}
                  placeholder="Select device type..."
                  clearable={false}
                />

                <SearchableSelect
                  label="Brand"
                  value={formData.brand_id}
                  onChange={(value) => setFormData({ ...formData, brand_id: value })}
                  options={brands.map(b => ({ id: b.id, name: b.name }))}
                  placeholder="Select brand..."
                  clearable={false}
                />

                <Input
                  label="Model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="Device model..."
                />

                <Input
                  label="Serial Number"
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  placeholder="Serial number..."
                />

                <SearchableSelect
                  label="Capacity"
                  value={formData.capacity_id}
                  onChange={(value) => setFormData({ ...formData, capacity_id: value })}
                  options={capacities.map(c => ({ id: c.id, name: c.name }))}
                  placeholder="Select capacity..."
                  clearable={false}
                />

                <SearchableSelect
                  label="Condition"
                  value={formData.condition_id}
                  onChange={(value) => setFormData({ ...formData, condition_id: value })}
                  options={deviceConditions.map(dc => ({ id: dc.id, name: dc.name }))}
                  placeholder="Select condition..."
                  clearable={false}
                />
              </>
            )}

            {!isDonorRole && (
              <div className="col-span-3">
                <MultiSelectDropdown
                  label="Accessories"
                  value={formData.accessories}
                  onChange={(value) => setFormData({ ...formData, accessories: value })}
                  options={accessories.map(a => ({ id: a.id, name: a.name }))}
                  placeholder="Select accessories (optional)..."
                />
              </div>
            )}

            {isPatientRole && (
              <div className="col-span-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_primary}
                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Mark as Primary Device
                  </span>
                </label>
              </div>
            )}

            <div className="col-span-3">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
              >
                {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced Options
              </button>
            </div>

            {showAdvancedOptions && (
              <>
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Device Password
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Enter device password if applicable..."
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {!isDonorRole && (
                  <div className="col-span-3">
                    <SearchableSelect
                      label="Encryption Type"
                      value={formData.encryption_id}
                      onChange={(value) => setFormData({ ...formData, encryption_id: value })}
                      options={encryptionTypes.map(et => ({ id: et.id, name: et.name }))}
                      placeholder="Select encryption type (if applicable)..."
                      clearable={true}
                    />
                  </div>
                )}

                {isPatientRole && (
                  <>
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Problem Description
                      </label>
                      <textarea
                        value={formData.symptoms}
                        onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                        placeholder="Describe the device problem or symptoms..."
                        rows={2}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Recovery Requirements
                      </label>
                      <textarea
                        value={formData.recovery_notes}
                        onChange={(e) => setFormData({ ...formData, recovery_notes: e.target.value })}
                        placeholder="Specify what data needs to be recovered..."
                        rows={2}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </>
                )}

                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Role-Specific Notes
                  </label>
                  <textarea
                    value={formData.role_notes}
                    onChange={(e) => setFormData({ ...formData, role_notes: e.target.value })}
                    placeholder="Additional notes specific to this device role..."
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            )}

            {/* Component Diagnostics Section - Only for Patient Role */}
            {isPatientRole && diagnosticsFormData.device_type_category && (
              <>
                <div className="col-span-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowDiagnosticsSection(!showDiagnosticsSection)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    {showDiagnosticsSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <Cpu className="w-4 h-4" />
                    Component Diagnostics (Evaluation)
                    <span className="ml-2 px-2 py-0.5 text-xs bg-info-muted text-info rounded">
                      {diagnosticsFormData.device_type_category.toUpperCase()}
                    </span>
                  </button>
                  <p className="text-xs text-slate-500 mt-1 ml-6">
                    Optional: Record component-level diagnostics for evaluation reports
                  </p>
                </div>

                {showDiagnosticsSection && (
                  <div className="col-span-3 border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4">
                    {/* HDD-Specific Fields */}
                    {(diagnosticsFormData.device_type_category === 'hdd' || diagnosticsFormData.device_type_category === 'hybrid') && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                          <HardDrive className="w-4 h-4" />
                          HDD Component Status
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <SearchableSelect
                            label="Heads Status"
                            value={diagnosticsFormData.heads_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, heads_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <SearchableSelect
                            label="PCB Status"
                            value={diagnosticsFormData.pcb_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, pcb_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <SearchableSelect
                            label="Motor Status"
                            value={diagnosticsFormData.motor_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, motor_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <SearchableSelect
                            label="Surface/Platter Status"
                            value={diagnosticsFormData.surface_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, surface_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <div className="col-span-2">
                            <Input
                              label="PCB Notes"
                              value={diagnosticsFormData.pcb_notes}
                              onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, pcb_notes: e.target.value })}
                              placeholder="PCB model, revision, swap notes..."
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={diagnosticsFormData.sa_access}
                                onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, sa_access: e.target.checked })}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="font-medium text-slate-700">Service Area (SA) Access Available</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SSD-Specific Fields */}
                    {(diagnosticsFormData.device_type_category === 'ssd' || diagnosticsFormData.device_type_category === 'hybrid') && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                          <Cpu className="w-4 h-4" />
                          SSD Component Status
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <SearchableSelect
                            label="Controller Status"
                            value={diagnosticsFormData.controller_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, controller_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <Input
                            label="Controller Model"
                            value={diagnosticsFormData.controller_model}
                            onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, controller_model: e.target.value })}
                            placeholder="Controller chip model..."
                          />
                          <SearchableSelect
                            label="Memory Chips Status"
                            value={diagnosticsFormData.memory_chips_status}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, memory_chips_status: value })}
                            options={componentStatuses.map(s => ({ id: s.status_code, name: s.status_name }))}
                            placeholder="Select status..."
                            clearable={true}
                          />
                          <SearchableSelect
                            label="NAND Type"
                            value={diagnosticsFormData.nand_type}
                            onChange={(value) => setDiagnosticsFormData({ ...diagnosticsFormData, nand_type: value })}
                            options={[
                              { id: 'SLC', name: 'SLC (Single-Level Cell)' },
                              { id: 'MLC', name: 'MLC (Multi-Level Cell)' },
                              { id: 'TLC', name: 'TLC (Triple-Level Cell)' },
                              { id: 'QLC', name: 'QLC (Quad-Level Cell)' },
                              { id: 'Other', name: 'Other' },
                            ]}
                            placeholder="Select NAND type..."
                            clearable={true}
                          />
                          <div className="col-span-2 space-y-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={diagnosticsFormData.firmware_corruption}
                                onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, firmware_corruption: e.target.checked })}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="font-medium text-slate-700">Firmware Corruption Detected</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={diagnosticsFormData.trim_support}
                                onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, trim_support: e.target.checked })}
                                className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="font-medium text-slate-700">TRIM Support Enabled</span>
                            </label>
                          </div>
                          <Input
                            label="Wear Leveling Count"
                            type="number"
                            value={diagnosticsFormData.wear_leveling_count}
                            onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, wear_leveling_count: e.target.value })}
                            placeholder="Wear leveling count..."
                          />
                        </div>
                      </div>
                    )}

                    {/* Common Diagnostic Fields */}
                    <div className="space-y-3 border-t border-slate-200 pt-3">
                      <h4 className="font-semibold text-sm text-slate-800">Common Diagnostics</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Firmware Version"
                          value={diagnosticsFormData.firmware_version}
                          onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, firmware_version: e.target.value })}
                          placeholder="Firmware version..."
                        />
                        <Input
                          label="ROM Version"
                          value={diagnosticsFormData.rom_version}
                          onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, rom_version: e.target.value })}
                          placeholder="ROM version..."
                        />
                      </div>
                    </div>

                    {/* Physical Damage & Technical Notes */}
                    <div className="space-y-3 border-t border-slate-200 pt-3">
                      <h4 className="font-semibold text-sm text-slate-800">Additional Notes</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Physical Damage Notes
                          </label>
                          <textarea
                            value={diagnosticsFormData.physical_damage_notes}
                            onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, physical_damage_notes: e.target.value })}
                            placeholder="Describe any physical damage observed..."
                            rows={2}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Technical Notes
                          </label>
                          <textarea
                            value={diagnosticsFormData.technical_notes}
                            onChange={(e) => setDiagnosticsFormData({ ...diagnosticsFormData, technical_notes: e.target.value })}
                            placeholder="Additional technical observations..."
                            rows={2}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div>
              {isEditMode && (
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-danger-muted text-danger hover:bg-danger/15"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Device
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                style={{ backgroundColor: 'rgb(var(--color-success))' }}
              >
                {isSubmitting ? 'Saving...' : isEditMode ? 'Update Device' : 'Add Device'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Device"
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            Are you sure you want to delete this device? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-danger hover:bg-danger/90 text-danger-foreground"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Device'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
