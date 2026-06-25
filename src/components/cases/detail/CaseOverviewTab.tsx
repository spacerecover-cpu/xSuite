import React, { useState, useRef, useEffect } from 'react';
import { FileStack, HardDrive, User, FileText, Settings, Activity, AlertCircle, Package, Users, Building2, Mail, Phone, MapPin, Key, Eye, EyeOff, Save, X } from 'lucide-react';
import { CreditCard as Edit } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { MultiSelectDropdown } from '../../ui/MultiSelectDropdown';
import { EngineerSelector } from '../EngineerSelector';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { getAllowedTransitions } from '@/lib/caseStateMachineService';
import { buildCaseStatusOptions, type StatusOptionGroup } from '@/lib/caseStatusOptions';
import type { Database } from '../../../types/database.types';

type CaseRow = Database['public']['Tables']['cases']['Row'];
type CaseDeviceRow = Database['public']['Tables']['case_devices']['Row'];

// Optgroup labels + render order for the status picker. Hoisted (static) so they
// are not rebuilt each render.
const STATUS_GROUP_LABELS: Record<StatusOptionGroup, string> = {
  current: 'Current',
  lateral: 'Within this stage',
  advance: 'Move to',
  cancel: 'Cancel case',
  reopen: 'Reopen case',
};
const STATUS_CHANGE_GROUPS: StatusOptionGroup[] = ['lateral', 'advance', 'cancel', 'reopen'];

type GeoNameEmbed = { name: string | null } | null;
type NamedRefEmbed = { id: string; name: string | null } | null;

interface CustomerEmbed {
  id: string;
  customer_number?: string | null;
  customer_name: string | null;
  email?: string | null;
  mobile_number?: string | null;
  phone?: string | null;
  address?: string | null;
  country_id?: string | null;
  city_id?: string | null;
  geo_countries?: GeoNameEmbed;
  geo_cities?: GeoNameEmbed;
}

interface CompanyEmbed {
  id: string;
  company_number?: string | null;
  name?: string | null;
  company_name: string | null;
  email?: string | null;
  phone?: string | null;
  tax_number?: string | null;
  geo_countries?: GeoNameEmbed;
  geo_cities?: GeoNameEmbed;
}

interface ProfileEmbed {
  id: string;
  full_name: string | null;
}

interface CaseDeviceWithEmbeds {
  id: string;
  case_id?: string;
  model: string | null;
  serial_number: string | null;
  symptoms: string | null;
  notes: string | null;
  password: string | null;
  device_type_id: string | null;
  capacity_id: string | null;
  accessories: string[] | null;
  device_role_id: number | null;
  is_primary: boolean | null;
  role_notes: string | null;
  created_at?: string;
  created_by?: string | null;
  device_type?: NamedRefEmbed;
  brand?: { name: string | null } | null;
  capacity?: NamedRefEmbed;
  condition?: { name: string | null } | null;
  encryption_type?: { name: string | null } | null;
  device_role?: { id: number; name: string | null } | null;
}

interface CaseWithEmbeds {
  id: string;
  case_no: string | null;
  case_number?: string | null;
  title?: string | null;
  subject?: string | null;
  priority: string | null;
  status: string | null;
  client_reference: string | null;
  created_at?: string;
  updated_at?: string;
  customer_id?: string | null;
  contact_id?: string | null;
  service_type_id: string | null;
  created_by?: string | null;
  assigned_engineer_id: string | null;
  assigned_to?: string | null;
  company_id?: string | null;
  customer?: CustomerEmbed | null;
  contact?: { id: string; customer_name: string | null; email?: string | null; mobile_number?: string | null; phone?: string | null } | null;
  service_type?: NamedRefEmbed;
  created_by_profile?: ProfileEmbed | null;
  assigned_engineer?: ProfileEmbed | null;
  company?: CompanyEmbed | null;
  important_data?: string | null;
  accessories?: string[] | null;
}

interface OverviewProfile {
  role?: string | null;
  case_access_level?: string | null;
}

interface CaseOverviewTabProps {
  caseData: CaseWithEmbeds;
  devices: CaseDeviceWithEmbeds[];
  isSavingCaseInfo: boolean;
  isSavingDeviceInfo: boolean;
  isSavingClientInfo: boolean;
  onSaveCaseInfo: (updates: Partial<CaseRow>) => void;
  onSaveDeviceInfo: (deviceId: string, updates: Partial<CaseDeviceRow>) => void;
  onSaveClientInfo: (customerUpdates: Record<string, unknown>, deviceUpdates: Partial<CaseDeviceRow>) => void;
  onUpdateStatus: (newStatus: string) => void;
  onUpdatePriority: (newPriority: string) => void;
  onUpdateEngineer: (engineerId: string | null) => void;
  profile: OverviewProfile | null;
}

export const CaseOverviewTab: React.FC<CaseOverviewTabProps> = ({
  caseData,
  devices,
  isSavingCaseInfo,
  isSavingDeviceInfo,
  isSavingClientInfo,
  onSaveCaseInfo,
  onSaveDeviceInfo,
  onSaveClientInfo,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateEngineer,
  profile,
}) => {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editedCaseData, setEditedCaseData] = useState<Partial<CaseRow>>({});
  const [editedDeviceData, setEditedDeviceData] = useState<Partial<CaseDeviceRow>>({});
  const [editedClientData, setEditedClientData] = useState<Record<string, unknown>>({});
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  const { data: caseStatuses = [] } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_case_statuses').select('id, name, color, is_active, type').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: casePriorities = [] } = useQuery({
    queryKey: ['case_priorities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_case_priorities').select('id, name, color, is_active').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  // The status picker must only offer moves the state machine accepts: the
  // current status, its same-phase siblings (intra-phase moves), and the
  // role-filtered cross-phase transitions for the current phase. The old "offer
  // every status" dropdown produced HTTP 400s from transition_case_status on any
  // same-phase or non-adjacent pick.
  const currentStatus = caseStatuses.find((s) => s.name === caseData.status) ?? null;

  const { data: allowedTransitions = [] } = useQuery({
    queryKey: ['case_allowed_transitions', currentStatus?.id ?? null, profile?.role ?? null],
    queryFn: () => getAllowedTransitions(currentStatus?.id ?? null, profile?.role ?? null),
    enabled: !!currentStatus?.id && !!profile?.role,
  });

  const { data: deviceTypes = [] } = useQuery({
    queryKey: ['device_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_device_types').select('id, name').order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: capacities = [] } = useQuery({
    queryKey: ['capacities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_device_capacities').select('id, name').order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: serviceProblems = [] } = useQuery({
    queryKey: ['service_problems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_service_problems').select('id, name').order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: accessories = [] } = useQuery({
    queryKey: ['accessories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_accessories').select('id, name').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ['service_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_service_types').select('id, name').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsEditingStatus(false);
      }
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setIsEditingPriority(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusColor = (statusName: string | null | undefined) => {
    if (!statusName) return '#6b7280';
    const status = caseStatuses.find(s => s.name === statusName);
    return status?.color || '#6b7280';
  };

  const getStatusDisplayName = (statusName: string | null | undefined) => {
    if (!statusName) return '';
    const status = caseStatuses.find(s => s.name === statusName);
    return status?.name || statusName;
  };

  const getPriorityColor = (priorityName: string | null | undefined) => {
    if (!priorityName) return '#6b7280';
    const priority = casePriorities.find(p => p.name.toLowerCase() === priorityName.toLowerCase());
    return priority?.color || '#6b7280';
  };

  const getAccessoryNames = (accessoryIds: string[] | null | undefined): string => {
    if (!accessoryIds || accessoryIds.length === 0) return '-';
    return accessoryIds
      .map(id => accessories.find(acc => acc.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const statusChangeOptions = buildCaseStatusOptions({
    current: currentStatus,
    allActiveStatuses: caseStatuses,
    allowedTransitions,
  });
  const hasStatusChangeTargets = statusChangeOptions.some((o) => o.group !== 'current');
  const priorityOptions = casePriorities.map(priority => ({ value: priority.name.toLowerCase(), label: priority.name }));

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditedCaseData({});
    setEditedDeviceData({});
    setEditedClientData({});
  };

  const handleSaveCaseInfo = () => {
    if (Object.keys(editedCaseData).length > 0) {
      onSaveCaseInfo(editedCaseData);
      setEditedCaseData({});
      setEditingSection(null);
    } else {
      setEditingSection(null);
    }
  };

  const handleSaveDeviceInfo = () => {
    if (devices[0] && Object.keys(editedDeviceData).length > 0) {
      onSaveDeviceInfo(devices[0].id, editedDeviceData);
      setEditedDeviceData({});
      setEditingSection(null);
    } else {
      setEditingSection(null);
      setEditedDeviceData({});
    }
  };

  const handleSaveClientInfo = () => {
    onSaveClientInfo(editedClientData, editedDeviceData);
    setEditedClientData({});
    setEditedDeviceData({});
    setEditingSection(null);
  };

  const handleDeviceFieldChange = <K extends keyof CaseDeviceRow>(field: K, value: CaseDeviceRow[K]) => {
    setEditedDeviceData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Case Info Card */}
      <Card variant="bordered" className="overflow-visible">
        <div className="bg-info-muted border-b border-info/20 px-4 py-3 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-info flex items-center gap-2">
              <FileStack className="w-4 h-4 text-info" />
              Case Info
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setEditingSection(editingSection === 'case' ? null : 'case')}>
              <Edit className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="bg-white p-4 overflow-visible">
          <div className="space-y-0">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <FileStack className="w-3.5 h-3.5 text-slate-400" />
                Job ID
              </label>
              <p className="text-sm font-semibold text-primary">{caseData.case_no}</p>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Client Reference
              </label>
              {editingSection === 'case' ? (
                <input
                  type="text"
                  value={editedCaseData.client_reference ?? caseData.client_reference ?? ''}
                  onChange={(e) => setEditedCaseData((prev) => ({ ...prev, client_reference: e.target.value }))}
                  placeholder="Enter client reference..."
                  className="text-sm px-2 py-1 border border-primary/40 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-primary max-w-[200px]"
                />
              ) : (
                <p className="text-sm font-mono text-slate-900">{caseData.client_reference || '-'}</p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Service
              </label>
              {editingSection === 'case' ? (
                <div className="w-[60%]">
                  <SearchableSelect
                    label=""
                    value={editedCaseData.service_type_id ?? caseData.service_type_id ?? ''}
                    onChange={(value) => setEditedCaseData((prev) => ({ ...prev, service_type_id: value }))}
                    options={serviceTypes.map(st => ({ id: st.id, name: st.name }))}
                    placeholder="Select service..."
                    clearable={false}
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-900 font-medium text-right">{caseData.service_type?.name || '-'}</p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                Status
              </label>
              <div ref={statusRef} className="relative">
                {!isEditingStatus ? (
                  <div onClick={() => setIsEditingStatus(true)} className="cursor-pointer">
                    <Badge variant="custom" color={getStatusColor(caseData.status)} size="sm">
                      {getStatusDisplayName(caseData.status)}
                    </Badge>
                  </div>
                ) : (
                  <select
                    value={caseData.status ?? ''}
                    onChange={(e) => { onUpdateStatus(e.target.value); setIsEditingStatus(false); }}
                    className="text-xs px-2 py-1 border border-primary/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label="Change case status"
                    autoFocus
                  >
                    {/* Keep the current value selectable even if it isn't in the
                        reachable set, so the field never renders blank. */}
                    {caseData.status && !statusChangeOptions.some((o) => o.value === caseData.status) && (
                      <option value={caseData.status}>{caseData.status}</option>
                    )}
                    {statusChangeOptions
                      .filter((o) => o.group === 'current')
                      .map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    {STATUS_CHANGE_GROUPS.map((g) => {
                      const groupOpts = statusChangeOptions.filter((o) => o.group === g);
                      if (groupOpts.length === 0) return null;
                      return (
                        <optgroup key={g} label={STATUS_GROUP_LABELS[g]}>
                          {groupOpts.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {!hasStatusChangeTargets && (
                      <option value="__none__" disabled>No status changes available from here</option>
                    )}
                  </select>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                Priority
              </label>
              <div ref={priorityRef} className="relative">
                {!isEditingPriority ? (
                  <div onClick={() => setIsEditingPriority(true)} className="cursor-pointer">
                    <Badge variant="custom" color={getPriorityColor(caseData.priority)} size="sm">
                      {caseData.priority}
                    </Badge>
                  </div>
                ) : (
                  <select
                    value={caseData.priority ?? ''}
                    onChange={(e) => { onUpdatePriority(e.target.value); setIsEditingPriority(false); }}
                    className="text-xs px-2 py-1 border border-warning/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-warning"
                    autoFocus
                  >
                    {priorityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Assigned Engineer
              </label>
              <div className="w-[60%]">
                <EngineerSelector
                  value={caseData.assigned_engineer_id}
                  onChange={(engineerId) => onUpdateEngineer(engineerId)}
                  disabled={profile?.role === 'technician' && profile?.case_access_level === 'restricted'}
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Created By
              </label>
              <p className="text-sm text-slate-900 font-medium text-right">{caseData.created_by_profile?.full_name || '-'}</p>
            </div>
          </div>
        </div>
        {editingSection === 'case' && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-white">
            <div className="flex gap-2 pt-3">
              <Button size="sm" onClick={handleSaveCaseInfo} style={{ backgroundColor: 'rgb(var(--color-success))' }} disabled={isSavingCaseInfo}>
                <Save className="w-3 h-3 mr-1" />
                {isSavingCaseInfo ? 'Saving...' : 'Save'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Device Info Card */}
      <Card variant="bordered" className="overflow-hidden">
        <div className="bg-success-muted border-b border-success/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-success flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-success" />
              Device Info
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setEditingSection(editingSection === 'device' ? null : 'device')}>
              <Edit className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="space-y-0">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                Device Type
              </label>
              {editingSection === 'device' ? (
                <select
                  value={editedDeviceData.device_type_id ?? devices[0]?.device_type_id ?? ''}
                  onChange={(e) => handleDeviceFieldChange('device_type_id', e.target.value || null)}
                  className="text-sm px-2 py-1 border border-success/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                >
                  <option value="">Select device type...</option>
                  {deviceTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-900 font-medium text-right">{devices[0]?.device_type?.name || '-'}</p>
              )}
            </div>
            {devices[0] && (
              <>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <label className="text-sm text-slate-600 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Device Model
                  </label>
                  {editingSection === 'device' ? (
                    <input
                      type="text"
                      value={editedDeviceData.model ?? devices[0]?.model ?? ''}
                      onChange={(e) => handleDeviceFieldChange('model', e.target.value)}
                      placeholder="Enter model..."
                      className="text-sm px-2 py-1 border border-success/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                    />
                  ) : (
                    <p className="text-sm text-slate-900 font-medium text-right">{devices[0].model || '-'}</p>
                  )}
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <label className="text-sm text-slate-600 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Serial Number
                  </label>
                  {editingSection === 'device' ? (
                    <input
                      type="text"
                      value={editedDeviceData.serial_number ?? devices[0]?.serial_number ?? ''}
                      onChange={(e) => handleDeviceFieldChange('serial_number', e.target.value)}
                      placeholder="Enter serial number..."
                      className="text-sm px-2 py-1 border border-success/40 rounded bg-white font-mono focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                    />
                  ) : (
                    <p className="text-sm font-mono text-slate-900 font-medium text-right">{devices[0].serial_number || '-'}</p>
                  )}
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <label className="text-sm text-slate-600 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    Capacity
                  </label>
                  {editingSection === 'device' ? (
                    <div className="w-full max-w-[220px]">
                      <SearchableSelect
                        value={editedDeviceData.capacity_id ?? devices[0]?.capacity_id ?? ''}
                        onChange={(value) => handleDeviceFieldChange('capacity_id', value || null)}
                        options={capacities.map((cap) => ({ id: cap.id, name: cap.name }))}
                        placeholder="Select capacity..."
                        usePortal
                        clearable={false}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-900 font-medium text-right">{devices[0].capacity?.name || '-'}</p>
                  )}
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <label className="text-sm text-slate-600 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    Accessories
                  </label>
                  {editingSection === 'device' ? (
                    <div className="max-w-[60%] w-full">
                      <MultiSelectDropdown
                        label=""
                        value={editedDeviceData.accessories ?? devices[0]?.accessories ?? []}
                        onChange={(value) => handleDeviceFieldChange('accessories', value)}
                        options={accessories.map(a => ({ id: a.id, name: a.name }))}
                        placeholder="Select accessories..."
                        usePortal
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-900 font-medium text-right max-w-[60%]">
                      {getAccessoryNames(devices[0]?.accessories)}
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                Device Problem
              </label>
              {editingSection === 'device' ? (
                <select
                  value={editedDeviceData.symptoms ?? devices[0]?.symptoms ?? ''}
                  onChange={(e) => handleDeviceFieldChange('symptoms', e.target.value)}
                  className="text-sm px-2 py-1 border border-success/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                >
                  <option value="">Select problem...</option>
                  {serviceProblems.map((problem) => (
                    <option key={problem.id} value={problem.name}>{problem.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-900 font-medium text-right">{devices[0]?.symptoms || '-'}</p>
              )}
            </div>
            {caseData.important_data && (
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <FileStack className="w-3.5 h-3.5 text-slate-400" />
                  Important Data
                </label>
                <p className="text-sm text-slate-900 font-medium text-right">{caseData.important_data}</p>
              </div>
            )}
            {!caseData.accessories && !caseData.important_data && (
              <div className="py-3" />
            )}
          </div>
        </div>
        {editingSection === 'device' && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-white">
            <div className="flex gap-2 pt-3">
              <Button size="sm" onClick={handleSaveDeviceInfo} style={{ backgroundColor: 'rgb(var(--color-success))' }} disabled={isSavingDeviceInfo}>
                <Save className="w-3 h-3 mr-1" />
                {isSavingDeviceInfo ? 'Saving...' : 'Save'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Client Info Card */}
      <Card variant="bordered" className="overflow-hidden">
        <div className="bg-accent/10 border-b border-accent/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-accent-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-accent-foreground" />
              Client Info
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setEditingSection(editingSection === 'client' ? null : 'client')}>
              <Edit className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="space-y-0">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Customer Name
              </label>
              <p className="text-sm font-semibold text-slate-900 text-right">{caseData.customer?.customer_name || '-'}</p>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Company
              </label>
              <p className="text-sm text-slate-900 font-medium text-right">{caseData.company?.company_name || '-'}</p>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email
              </label>
              {caseData.customer?.email ? (
                <a href={`mailto:${caseData.customer.email}`} className="text-sm text-primary hover:text-primary/80 break-all text-right">
                  {caseData.customer.email}
                </a>
              ) : (
                <p className="text-sm text-slate-900 font-medium text-right">-</p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Mobile Number
              </label>
              {(caseData.customer?.mobile_number || caseData.customer?.phone) ? (
                <a href={`tel:${caseData.customer.mobile_number || caseData.customer.phone}`} className="text-sm text-primary hover:text-primary/80 text-right">
                  {caseData.customer.mobile_number || caseData.customer.phone}
                </a>
              ) : (
                <p className="text-sm text-slate-900 font-medium text-right">-</p>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location
              </label>
              <p className="text-sm text-slate-900 font-medium text-right">
                {(() => {
                  const cityName = caseData.customer?.geo_cities?.name ?? null;
                  const countryName = caseData.customer?.geo_countries?.name ?? null;
                  if (cityName && countryName) return `${cityName}, ${countryName}`;
                  return cityName || countryName || '-';
                })()}
              </p>
            </div>
            <div className="flex items-center justify-between py-3">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                Device Password
              </label>
              {editingSection === 'client' ? (
                <div className="flex items-center gap-2">
                  <form className="contents" onSubmit={(e) => e.preventDefault()}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={editedDeviceData.password ?? devices[0]?.password ?? ''}
                      onChange={(e) => setEditedDeviceData((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter password..."
                      autoComplete="off"
                      className="font-mono text-xs bg-white px-2 py-1 rounded border border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent w-24"
                    />
                  </form>
                  <Button variant="secondary" size="sm" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <form className="contents" onSubmit={(e) => e.preventDefault()}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={devices[0]?.password || ''}
                      readOnly
                      autoComplete="off"
                      className="font-mono text-xs bg-white px-2 py-1 rounded border border-slate-300 w-24"
                    />
                  </form>
                  <Button variant="secondary" size="sm" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        {editingSection === 'client' && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-white">
            <div className="flex gap-2 pt-3">
              <Button size="sm" onClick={handleSaveClientInfo} style={{ backgroundColor: 'rgb(var(--color-success))' }} disabled={isSavingClientInfo}>
                <Save className="w-3 h-3 mr-1" />
                {isSavingClientInfo ? 'Saving...' : 'Save'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
