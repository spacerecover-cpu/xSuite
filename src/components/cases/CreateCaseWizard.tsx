import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import { CaseSuccessModal } from './CaseSuccessModal';
import { ServerBulkDrivesModal } from './ServerBulkDrivesModal';
import { UsageLimitGuard } from '../shared/UsageLimitGuard';
import { printReceipt, printLabel } from '../../lib/printUtils';
import {
  Users,
  HardDrive,
  AlertCircle,
  CheckCircle,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Layers
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { setPrimaryDevice } from '../../lib/deviceService';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import type { Database } from '../../types/database.types';

type CasesInsert = Database['public']['Tables']['cases']['Insert'];

interface Device {
  id: string;
  device_type_id: string;
  brand_id: string;
  model: string;
  serial_no: string;
  capacity_id: string;
  condition_id: string;
  accessories: string[];
  device_problem_id: string;
  recovery_requirements: string;
  device_password: string;
  encryption_type_id: string;
  device_role_id: number | null;
  is_primary: boolean;
}

interface CreateCaseWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateCaseWizard: React.FC<CreateCaseWizardProps> = ({ onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [showPassword, setShowPassword] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdCase, setCreatedCase] = useState<{ id: string; case_no: string } | null>(null);
  const [isBulkDrivesModalOpen, setIsBulkDrivesModalOpen] = useState(false);
  const [bulkServerDrives, setBulkServerDrives] = useState<Device[]>([]);

  const [formData, setFormData] = useState({
    customer_id: '',
    contact_id: '',
    client_reference: '',
    service_type_id: '',
    priority: '',
    service_location_id: '',
    welcome_email: true,
    welcome_sms: false,
  });

  const [devices, setDevices] = useState<Device[]>([
    {
      id: '1',
      device_type_id: '',
      brand_id: '',
      model: '',
      serial_no: '',
      capacity_id: '',
      condition_id: '',
      accessories: [],
      device_problem_id: '',
      recovery_requirements: '',
      device_password: '',
      encryption_type_id: '',
      device_role_id: null,
      is_primary: true,
    },
  ]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers_for_cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers_enhanced')
        .select('id, customer_number, customer_name, email')
        .eq('is_active', true)
        .order('customer_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ['service_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_service_types')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: casePriorities = [] } = useQuery({
    queryKey: ['case_priorities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_priorities')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceLocations = [] } = useQuery({
    queryKey: ['service_locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_service_locations')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: deviceTypes = [] } = useQuery({
    queryKey: ['device_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_types')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_brands')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: capacities = [] } = useQuery({
    queryKey: ['capacities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_capacities')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: deviceConditions = [] } = useQuery({
    queryKey: ['device_conditions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_conditions')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: accessories = [] } = useQuery({
    queryKey: ['accessories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_accessories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: deviceEncryption = [] } = useQuery({
    queryKey: ['device_encryption'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_encryption')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceProblems = [] } = useQuery({
    queryKey: ['service_problems'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_service_problems')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: deviceRoles = [] } = useQuery({
    queryKey: ['device_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_roles')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (serviceTypes.length > 0 && !formData.service_type_id) {
      const dataRecovery = serviceTypes.find(st => st.name.toLowerCase() === 'data recovery');
      if (dataRecovery) {
        setFormData(prev => ({ ...prev, service_type_id: dataRecovery.id }));
      }
    }
  }, [serviceTypes]);

  useEffect(() => {
    if (casePriorities.length > 0 && !formData.priority) {
      const normalPriority = casePriorities.find(p => p.name.toLowerCase() === 'normal');
      if (normalPriority) {
        setFormData(prev => ({ ...prev, priority: normalPriority.name.toLowerCase() }));
      } else if (casePriorities.length > 0) {
        setFormData(prev => ({ ...prev, priority: casePriorities[0].name.toLowerCase() }));
      }
    }
  }, [casePriorities]);

  useEffect(() => {
    if (serviceLocations.length > 0 && !formData.service_location_id) {
      setFormData(prev => ({ ...prev, service_location_id: serviceLocations[0].id }));
    }
  }, [serviceLocations]);

  useEffect(() => {
    if (deviceConditions.length > 0 && !devices[0].condition_id) {
      setDevices(prev => [
        { ...prev[0], condition_id: deviceConditions[0].id.toString() },
        ...prev.slice(1)
      ]);
    }
  }, [deviceConditions]);

  useEffect(() => {
    if (deviceEncryption.length > 0 && !devices[0].encryption_type_id) {
      setDevices(prev => [
        { ...prev[0], encryption_type_id: deviceEncryption[0].id },
        ...prev.slice(1)
      ]);
    }
  }, [deviceEncryption]);

  useEffect(() => {
    if (deviceRoles.length > 0 && devices[0].device_role_id === null) {
      const patientRole = deviceRoles.find(r => r.name.toLowerCase() === 'patient');
      if (patientRole) {
        setDevices(prev => [
          { ...prev[0], device_role_id: patientRole.id, is_primary: true },
          ...prev.slice(1)
        ]);
      } else if (deviceRoles.length > 0) {
        setDevices(prev => [
          { ...prev[0], device_role_id: deviceRoles[0].id, is_primary: true },
          ...prev.slice(1)
        ]);
      }
    }
  }, [deviceRoles]);

  const handleCustomerCreated = (newCustomer: Record<string, unknown>) => {
    queryClient.invalidateQueries({ queryKey: ['customers_for_cases'] });
    const newId = typeof newCustomer.id === 'string' ? newCustomer.id : '';
    if (newId) {
      setFormData({ ...formData, customer_id: newId });
    }
  };

  const handleBulkDrivesSave = (bulkDrives: { id: string; brand_id: string; serial_no: string; model: string; capacity_id: string; isValid: boolean }[]) => {
    const primaryDevice = devices[0];
    const patientRole = deviceRoles.find(r => r.name.toLowerCase() === 'patient');
    const defaultCondition = deviceConditions.length > 0 ? deviceConditions[0].id.toString() : '';
    const defaultEncryption = deviceEncryption.length > 0 ? deviceEncryption[0].id : '';

    const mappedBulkDrives: Device[] = bulkDrives.map((drive, index) => ({
      id: `bulk-${Date.now()}-${index}`,
      device_type_id: primaryDevice.device_type_id,
      brand_id: drive.brand_id,
      model: drive.model,
      serial_no: drive.serial_no,
      capacity_id: drive.capacity_id,
      condition_id: defaultCondition,
      accessories: [],
      device_problem_id: '',
      recovery_requirements: '',
      device_password: '',
      encryption_type_id: defaultEncryption,
      device_role_id: patientRole?.id || null,
      is_primary: primaryDevice.serial_no ? (index === 0 && devices.length === 1) : false,
    }));

    setBulkServerDrives(mappedBulkDrives);
  };

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      const { data: caseNumber, error: numberError } = await supabase
        .rpc('get_next_number', { p_scope: 'case' });

      if (numberError) {
        logger.error('Error generating case number:', numberError);
        if (numberError.message?.includes('not found')) {
          throw new Error('Case numbering system is not configured. Please contact your system administrator to configure it in Settings > System & Numbers.');
        }
        throw new Error(`Failed to generate case number: ${numberError.message}`);
      }

      if (!caseNumber) {
        throw new Error('Failed to generate case number. Please try again or contact support.');
      }

      const customerName = customers.find(c => c.id === formData.customer_id)?.customer_name || 'Customer';

      if (!profile?.tenant_id) {
        throw new Error('No active tenant — please sign in again.');
      }
      const tenantId = profile.tenant_id;

      const caseData: CasesInsert = {
        tenant_id: tenantId,
        case_number: caseNumber,
        customer_id: formData.customer_id,
        subject: `Case for ${customerName}`,
        priority: formData.priority,
        status: 'Received',
      };

      if (formData.contact_id) {
        caseData.contact_id = formData.contact_id;
      }
      if (formData.client_reference) {
        caseData.client_reference = formData.client_reference;
      }
      if (formData.service_type_id) {
        caseData.service_type_id = formData.service_type_id;
      }
      if (profile?.id) {
        caseData.created_by = profile.id;

        // Auto-assign technicians to cases they create
        if (profile.role === 'technician') {
          caseData.assigned_to = profile.id;
        }
      }

      // Auto-populate company_id from customer's company relationship
      if (formData.customer_id) {
        const { data: customerCompany } = await supabase
          .from('customer_company_relationships')
          .select('company_id')
          .eq('customer_id', formData.customer_id)
          .order('is_primary', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (customerCompany?.company_id) {
          caseData.company_id = customerCompany.company_id;
        }
      }

      const { data: newCase, error: caseError } = await supabase
        .from('cases')
        .insert(caseData)
        .select()
        .maybeSingle();

      if (caseError) {
        logger.error('Error creating case:', caseError);
        throw new Error(`Failed to create case: ${caseError.message}`);
      }
      if (!newCase) {
        throw new Error('Case was created but no row was returned.');
      }

      const allDevices = [...devices, ...bulkServerDrives];

      const primaryWizardDevice = allDevices.find(d => d.is_primary);

      const devicesToInsert = allDevices
        .filter(d => d.device_type_id || d.serial_no)
        .map(device => {
          const problemName = device.device_problem_id
            ? serviceProblems.find(sp => sp.id === device.device_problem_id)?.name || null
            : null;

          return {
            tenant_id: tenantId,
            case_id: newCase.id,
            device_type_id: device.device_type_id || null,
            brand_id: device.brand_id || null,
            model: device.model || null,
            serial_number: device.serial_no || null,
            capacity_id: device.capacity_id || null,
            condition_id: device.condition_id || null,
            accessories: device.accessories.length > 0 ? device.accessories : null,
            symptoms: problemName,
            notes: device.recovery_requirements || null,
            password: device.device_password || null,
            encryption_id: device.encryption_type_id || null,
            device_role_id: device.device_role_id || null,
            created_by: profile?.id || null,
            _wizard_id: device.id,
          };
        });

      let primaryDeviceDbId: string | null = null;

      if (devicesToInsert.length > 0) {
        const { data: insertedDevices, error: devicesError } = await supabase
          .from('case_devices')
          .insert(devicesToInsert.map(({ _wizard_id: _w, ...rest }) => rest))
          .select('id');

        if (devicesError) {
          logger.error('Error inserting devices:', devicesError);
          throw new Error(`Failed to insert devices: ${devicesError.message}`);
        }

        if (primaryWizardDevice && insertedDevices && insertedDevices.length > 0) {
          const primaryIndex = devicesToInsert.findIndex(d => d._wizard_id === primaryWizardDevice.id);
          const matched = primaryIndex >= 0 ? insertedDevices[primaryIndex] : insertedDevices[0];
          if (matched) primaryDeviceDbId = matched.id;
        } else if (insertedDevices && insertedDevices.length > 0) {
          primaryDeviceDbId = insertedDevices[0].id;
        }
      }

      if (primaryDeviceDbId) {
        await setPrimaryDevice(primaryDeviceDbId, newCase.id);
      }

      return newCase;
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_count'] });
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
      setCreatedCase({ id: newCase.id, case_no: newCase.case_no ?? newCase.case_number ?? '' });
      setShowSuccessModal(true);
    },
    onError: (error) => {
      logger.error('Case creation error:', error);
      toast.error(`Failed to create case: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (!isFormValid) return;
    createCaseMutation.mutate();
  };


  const addDevice = () => {
    setDevices([
      ...devices,
      {
        id: Date.now().toString(),
        device_type_id: '',
        brand_id: '',
        model: '',
        serial_no: '',
        capacity_id: '',
        condition_id: '',
        accessories: [],
        device_problem_id: '',
        recovery_requirements: '',
        device_password: '',
        encryption_type_id: '',
        device_role_id: deviceRoles.find(r => r.name.toLowerCase() === 'patient')?.id || (deviceRoles.length > 0 ? deviceRoles[0].id : null),
        is_primary: false,
      },
    ]);
  };

  const removeDevice = (id: string) => {
    if (devices.length > 1) {
      setDevices(devices.filter(d => d.id !== id));
    }
  };

  const updateDevice = (id: string, field: keyof Device, value: string | number | boolean | string[] | null) => {
    setDevices(devices.map(d => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const primaryDevice = devices[0];
  const primaryDeviceType = deviceTypes.find(dt => dt.id === primaryDevice.device_type_id);
  const isServerDevice = primaryDeviceType?.name.toLowerCase().includes('server') || false;

  const isStep1Valid = formData.customer_id && formData.service_type_id;
  const isStep2Valid = devices.some(d => d.device_type_id || d.serial_no) || bulkServerDrives.length > 0;

  const isPrimaryDeviceValid = isServerDevice
    ? (primaryDevice.serial_no
        ? (primaryDevice.serial_no && primaryDevice.device_problem_id)
        : (primaryDevice.device_problem_id && bulkServerDrives.length > 0))
    : (primaryDevice.serial_no && primaryDevice.device_problem_id);

  const isFormValid = isStep1Valid && isStep2Valid && isPrimaryDeviceValid;

  return (
    <Dialog
      open={true}
      onClose={onClose}
      label="Create case"
      closeOnBackdrop={false}
      closeOnEscape={false}
      className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-[1600px] max-h-[90vh] overflow-hidden flex flex-col"
    >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Create New Case</h2>
            <p className="text-sm text-slate-600 mt-1">Complete all sections to create a case</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <div
                className="rounded-xl p-5 mb-4 bg-info-muted"
                style={{
                  borderLeft: '4px solid rgb(var(--color-info))',
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-info" />
                  <h3 className="text-base font-bold text-slate-900">Client & Service</h3>
                </div>

                <div className="space-y-3">
                    <div>
                      <SearchableSelect
                        label="Client"
                        value={formData.customer_id}
                        onChange={(value) =>
                          setFormData({ ...formData, customer_id: value, contact_id: '' })
                        }
                        options={customers.map(c => ({
                          id: c.id,
                          name: `${c.customer_name} (${c.customer_number})`,
                        }))}
                        placeholder="Search by name or customer number"
                        required
                        clearable={false}
                      />
                      <button
                        type="button"
                        onClick={() => setIsCustomerModalOpen(true)}
                        className="mt-2 text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create New Customer
                      </button>
                    </div>

                    <Input
                      label="Client Reference"
                      placeholder="Client's PO or reference number (optional)"
                      value={formData.client_reference}
                      onChange={(e) =>
                        setFormData({ ...formData, client_reference: e.target.value })
                      }
                    />
                    <SearchableSelect
                      label="Service Type"
                      value={formData.service_type_id}
                      onChange={(value) =>
                        setFormData({ ...formData, service_type_id: value })
                      }
                      options={serviceTypes.map(st => ({ id: st.id, name: st.name }))}
                      placeholder="Select service type..."
                      required
                      clearable={false}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <SearchableSelect
                        label="Priority"
                        value={formData.priority}
                        onChange={(value) => setFormData({ ...formData, priority: value })}
                        options={casePriorities.map(p => ({ id: p.name.toLowerCase(), name: p.name }))}
                        placeholder="Priority..."
                        clearable={false}
                      />

                      <SearchableSelect
                        label="Location"
                        value={formData.service_location_id}
                        onChange={(value) =>
                          setFormData({ ...formData, service_location_id: value })
                        }
                        options={serviceLocations.map(sl => ({ id: sl.id, name: sl.name }))}
                        placeholder="Location..."
                        clearable={false}
                      />
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.welcome_email}
                          onChange={(e) =>
                            setFormData({ ...formData, welcome_email: e.target.checked })
                          }
                          className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-slate-700">
                          Welcome Email
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.welcome_sms}
                          onChange={(e) =>
                            setFormData({ ...formData, welcome_sms: e.target.checked })
                          }
                          className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-slate-700">
                          Welcome SMS
                        </span>
                      </label>
                    </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div
                className="rounded-xl p-5 mb-4 bg-success-muted"
                style={{
                  borderLeft: '4px solid rgb(var(--color-success))',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-5 h-5 text-success" />
                    <h3 className="text-base font-bold text-slate-900">
                      Device Information ({devices.length}{bulkServerDrives.length > 0 ? ` + ${bulkServerDrives.length} bulk` : ''})
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isServerDevice && (
                      <Button
                        onClick={() => setIsBulkDrivesModalOpen(true)}
                        variant="secondary"
                        size="sm"
                        className="bg-info-muted text-info hover:bg-info/15 border-info/30"
                      >
                        <Layers className="w-4 h-4 mr-1" />
                        {bulkServerDrives.length > 0 ? `Edit ${bulkServerDrives.length} Drives` : 'Add Multiple Drives'}
                      </Button>
                    )}
                    <Button
                      onClick={addDevice}
                      variant="secondary"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Device
                    </Button>
                  </div>
                </div>

                {bulkServerDrives.length > 0 && (
                  <div className="bg-info-muted border border-info/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-info" />
                        <span className="text-sm font-semibold text-info">
                          {bulkServerDrives.length} Server Drive{bulkServerDrives.length !== 1 ? 's' : ''} (Bulk Entry)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsBulkDrivesModalOpen(true)}
                          className="text-xs text-primary hover:text-primary/80 font-medium"
                        >
                          View/Edit
                        </button>
                        <button
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'Remove All Bulk Drives',
                              message: `Remove all ${bulkServerDrives.length} bulk drives?`,
                              confirmLabel: 'Remove All',
                              tone: 'danger',
                            });
                            if (confirmed) setBulkServerDrives([]);
                          }}
                          className="text-xs text-danger hover:text-danger/80 font-medium"
                        >
                          Remove All
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-info mt-1">
                      {primaryDevice.serial_no
                        ? 'These drives will be automatically added as components of the server with Patient role and default settings'
                        : 'These drives will be added as a RAID array with equal status (no primary drive designation)'}
                    </p>
                  </div>
                )}

                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {devices.map((device, index) => (
                    <div
                      key={device.id}
                      className="bg-white rounded-lg p-3 border border-slate-200"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            Device {index + 1}
                          </h4>
                          {device.is_primary && (
                            <span className="text-xs bg-info-muted text-info px-2 py-0.5 rounded font-medium">
                              Primary
                            </span>
                          )}
                        </div>
                        {devices.length > 1 && (
                          <button
                            onClick={() => removeDevice(device.id)}
                            className="text-danger hover:text-danger/80 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <SearchableSelect
                            label="Device Role"
                            value={device.device_role_id?.toString() || ''}
                            onChange={(value) => {
                              const numericValue = value ? parseInt(value) : null;
                              updateDevice(device.id, 'device_role_id', numericValue);
                              if (index === 0 && numericValue) {
                                const patientRole = deviceRoles.find(r => r.name.toLowerCase() === 'patient');
                                if (patientRole && numericValue === patientRole.id) {
                                  updateDevice(device.id, 'is_primary', true);
                                }
                              }
                            }}
                            options={deviceRoles.map(dr => ({ id: dr.id.toString(), name: dr.name }))}
                            placeholder="Select role..."
                            required
                            clearable={false}
                          />

                          <SearchableSelect
                            label="Media Type"
                            value={device.device_type_id}
                            onChange={(value) =>
                              updateDevice(device.id, 'device_type_id', value)
                            }
                            options={deviceTypes.map(dt => ({ id: dt.id, name: dt.name }))}
                            placeholder="Device type..."
                            required={index === 0}
                            clearable={false}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <SearchableSelect
                            label="Brand"
                            value={device.brand_id}
                            onChange={(value) => updateDevice(device.id, 'brand_id', value)}
                            options={brands.map(b => ({ id: b.id, name: b.name }))}
                            placeholder="Brand..."
                            clearable={false}
                          />

                          <div>
                            <Input
                              label="Serial Number"
                              value={device.serial_no}
                              onChange={(e) =>
                                updateDevice(device.id, 'serial_no', e.target.value)
                              }
                              placeholder={isServerDevice && index === 0 ? "Server S/N (optional if only loose drives)" : "Serial number (e.g., WXY123456789)"}
                              required={index === 0 && !isServerDevice}
                            />
                            {index === 0 && isServerDevice && (
                              <p className="text-xs text-slate-500 mt-1">
                                Enter server chassis serial number if submitting full server, or leave blank for loose drives only
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            label="Model"
                            value={device.model}
                            onChange={(e) =>
                              updateDevice(device.id, 'model', e.target.value)
                            }
                            placeholder="Model..."
                          />

                          <SearchableSelect
                            label="Capacity"
                            value={device.capacity_id}
                            onChange={(value) =>
                              updateDevice(device.id, 'capacity_id', value)
                            }
                            options={capacities.map(c => ({ id: c.id, name: c.name }))}
                            placeholder="Capacity..."
                            clearable={false}
                            usePortal={true}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <SearchableSelect
                            label="Condition"
                            value={device.condition_id}
                            onChange={(value) =>
                              updateDevice(device.id, 'condition_id', value)
                            }
                            options={deviceConditions.map(dc => ({
                              id: dc.id.toString(),
                              name: dc.name,
                            }))}
                            placeholder="Condition..."
                            clearable={false}
                            usePortal={true}
                          />

                          <MultiSelectDropdown
                            label="Accessories"
                            value={device.accessories}
                            onChange={(value) =>
                              updateDevice(device.id, 'accessories', value)
                            }
                            options={accessories.map(a => ({ id: a.id, name: a.name }))}
                            placeholder="Select accessories (optional)..."
                            usePortal={true}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div
                className="rounded-xl p-5 mb-4 bg-warning-muted"
                style={{
                  borderLeft: '4px solid rgb(var(--color-warning))',
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-warning" />
                  <h3 className="text-base font-bold text-slate-900">
                    Problem & Requirements
                  </h3>
                </div>

                <div className="space-y-3">
                  <SearchableSelect
                    label={isServerDevice ? "Server/Array Problem" : "Device Problem"}
                    value={devices[0].device_problem_id}
                    onChange={(value) =>
                      updateDevice('1', 'device_problem_id', value)
                    }
                    options={serviceProblems.map(sp => ({ id: sp.id, name: sp.name }))}
                    placeholder={isServerDevice ? "e.g., RAID array failure, cannot boot..." : "Select device problem..."}
                    required
                    clearable={false}
                  />

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Recovery Requirements
                    </label>
                    <textarea
                      value={devices[0].recovery_requirements}
                      onChange={(e) =>
                        updateDevice('1', 'recovery_requirements', e.target.value)
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-warning focus:border-warning text-sm"
                      placeholder="Describe what files or data the customer needs recovered (e.g., Family photos, Financial reports, Database files)"
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Device Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={devices[0].device_password}
                        onChange={(e) =>
                          updateDevice('1', 'device_password', e.target.value)
                        }
                        className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-warning focus:border-warning text-sm"
                        placeholder="Password needed to access encrypted data (if applicable)"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <SearchableSelect
                    label="Encryption Type"
                    value={devices[0].encryption_type_id}
                    onChange={(value) =>
                      updateDevice('1', 'encryption_type_id', value)
                    }
                    options={deviceEncryption.map(de => ({ id: de.id, name: de.name }))}
                    placeholder="Select encryption type..."
                    clearable={false}
                  />

                  {isFormValid ? (
                    <div className="mt-4 p-3 bg-success-muted rounded-lg border border-success/30">
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-semibold">Ready to Create Case</span>
                      </div>
                      <p className="text-xs text-success mt-1">
                        All required information has been provided. Click "Create Case" to proceed.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 bg-warning-muted rounded-lg border border-warning/30">
                      <div className="flex items-center gap-2 text-warning">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-semibold">Required Information Missing</span>
                      </div>
                      <p className="text-xs text-warning mt-1">
                        {isServerDevice && !primaryDevice.serial_no
                          ? 'Complete these required fields: Client, Service Type, Device Problem. Then add server drives using "Add Multiple Drives".'
                          : 'Complete these required fields: Client, Service Type, Serial Number, and Device Problem.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <Button variant="secondary" onClick={onClose}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>

          <UsageLimitGuard limitKey="max_cases_per_month" showToast={true}>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || createCaseMutation.isPending}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
            >
              {createCaseMutation.isPending ? 'Creating Case...' : 'Create Case'}
            </Button>
          </UsageLimitGuard>
        </div>

      <CustomerFormModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={handleCustomerCreated}
      />

      <ServerBulkDrivesModal
        isOpen={isBulkDrivesModalOpen}
        onClose={() => setIsBulkDrivesModalOpen(false)}
        onSaveDrives={handleBulkDrivesSave}
        existingDrives={bulkServerDrives.map(d => ({
          id: d.id,
          brand_id: d.brand_id,
          serial_no: d.serial_no,
          model: d.model,
          capacity_id: d.capacity_id,
          isValid: !!(d.brand_id && d.serial_no && d.capacity_id),
        }))}
        defaultDeviceTypeId={primaryDevice.device_type_id}
      />

      {showSuccessModal && createdCase && (
        <CaseSuccessModal
          caseNumber={createdCase.case_no}
          caseId={createdCase.id}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
            onSuccess();
          }}
          onPrintReceipt={() => {
            printReceipt(createdCase.id, createdCase.case_no);
          }}
          onPrintLabel={() => {
            printLabel(createdCase.id, createdCase.case_no);
          }}
        />
      )}
    </Dialog>
  );
};
