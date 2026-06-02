import React, { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { HardDrive, AlertCircle } from 'lucide-react';
import type { Database } from '../../types/database.types';

type ResourceCloneDriveRow = Database['public']['Tables']['resource_clone_drives']['Row'];
type ResourceCloneDriveInsert = Database['public']['Tables']['resource_clone_drives']['Insert'];

type EditingDrive = Partial<ResourceCloneDriveRow> & {
  id?: string;
  clone_id?: string | null;
  label?: string | null;
};

interface ResourceCloneDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDrive?: EditingDrive | null;
  onSuccess?: () => void;
}

interface FormState {
  label: string;
  serial_number: string;
  brand_id: string;
  capacity_id: string;
  interface_id: string;
  status: string;
  condition: string;
  location: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  serial_number: '',
  brand_id: '',
  capacity_id: '',
  interface_id: '',
  status: 'available',
  condition: '',
  location: '',
  notes: '',
};

const toFormString = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

export const ResourceCloneDriveModal: React.FC<ResourceCloneDriveModalProps> = ({
  isOpen,
  onClose,
  editingDrive,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const labelFieldRef = useRef<HTMLInputElement>(null);
  const statusFieldId = useId();
  const notesFieldId = useId();

  const editingId: string | null = typeof editingDrive?.id === 'string' ? editingDrive.id : null;
  const cloneIdLabel: string = toFormString(editingDrive?.clone_id ?? editingDrive?.label);

  const [formData, setFormData] = useState<FormState>(() => ({
    label: toFormString(editingDrive?.label ?? editingDrive?.clone_id),
    serial_number: toFormString(editingDrive?.serial_number),
    brand_id: toFormString(editingDrive?.brand_id),
    capacity_id: toFormString(editingDrive?.capacity_id),
    interface_id: toFormString(editingDrive?.interface_id),
    status: toFormString(editingDrive?.status) || 'available',
    condition: toFormString(editingDrive?.condition),
    location: toFormString(editingDrive?.location),
    notes: toFormString(editingDrive?.notes),
  }));

  const { data: brands = [] } = useQuery({
    queryKey: ['catalog_device_brands'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('catalog_device_brands')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const { data: capacities = [] } = useQuery({
    queryKey: ['catalog_device_capacities'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('catalog_device_capacities')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const { data: interfaces = [] } = useQuery({
    queryKey: ['catalog_interfaces'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('catalog_interfaces')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const { data: conditions = [] } = useQuery({
    queryKey: ['catalog_device_conditions'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('catalog_device_conditions')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['inventory_locations_for_clone_drives'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('inventory_locations')
        .select('id, name')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const payload: Omit<ResourceCloneDriveInsert, 'tenant_id'> = {
        label: data.label.trim(),
        serial_number: data.serial_number.trim() || null,
        brand_id: data.brand_id || null,
        capacity_id: data.capacity_id || null,
        interface_id: data.interface_id || null,
        status: data.status || null,
        condition: data.condition.trim() || null,
        location: data.location.trim() || null,
        notes: data.notes.trim() || null,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('resource_clone_drives')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const {
          data: profileData,
          error: profileError,
        } = await supabase.auth.getUser();
        if (profileError) throw profileError;
        const userId = profileData.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const { data: profileRow, error: profileLookupError } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', userId)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;
        const tenantId = profileRow?.tenant_id;
        if (!tenantId) throw new Error('No tenant associated with this user');

        const insertPayload: ResourceCloneDriveInsert = {
          ...payload,
          tenant_id: tenantId,
        };

        const { error: insertError } = await supabase
          .from('resource_clone_drives')
          .insert(insertPayload);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      onSuccess?.();
      handleClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.label.trim()) {
      setError('Please provide a Clone ID / Label');
      return;
    }

    saveMutation.mutate(formData);
  };

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingId ? `Edit Clone Drive ${cloneIdLabel}` : 'Add Clone Drive to Resources'}
      icon={HardDrive}
      maxWidth="4xl"
      closeOnBackdrop={false}
      initialFocusRef={labelFieldRef}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-danger mb-1">Error</h4>
              <p className="text-sm text-danger">{error}</p>
            </div>
          </div>
        )}

        {editingId && cloneIdLabel && (
          <div className="bg-info-muted border border-info/30 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-info">
                Clone ID: {cloneIdLabel}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">
              Drive Specifications
            </h3>

            <Input
              ref={labelFieldRef}
              label="Clone ID / Label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g., CLONE-001"
              required
            />

            <Input
              label="Serial Number"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              placeholder="e.g., WD-WCAV12345678"
            />

            <SearchableSelect
              label="Brand"
              options={brands.map((brand) => ({
                id: brand.id,
                name: brand.name,
              }))}
              value={formData.brand_id}
              onChange={(value) => setFormData({ ...formData, brand_id: value })}
              placeholder="Select brand"
            />

            <SearchableSelect
              label="Capacity"
              options={capacities.map((cap) => ({
                id: cap.id,
                name: cap.name,
              }))}
              value={formData.capacity_id}
              onChange={(value) => setFormData({ ...formData, capacity_id: value })}
              placeholder="Select capacity"
            />

            <SearchableSelect
              label="Interface"
              options={interfaces.map((iface) => ({
                id: iface.id,
                name: iface.name,
              }))}
              value={formData.interface_id}
              onChange={(value) => setFormData({ ...formData, interface_id: value })}
              placeholder="Select interface"
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">
              Status & Location
            </h3>

            <div>
              <label htmlFor={statusFieldId} className="block text-sm font-medium text-slate-700 mb-2">
                Status
              </label>
              <select
                id={statusFieldId}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
                <option value="lost">Lost</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>

            <SearchableSelect
              label="Condition"
              options={conditions.map((condition) => ({
                id: condition.name,
                name: condition.name,
              }))}
              value={formData.condition}
              onChange={(value) => setFormData({ ...formData, condition: value })}
              placeholder="Select condition"
            />

            <SearchableSelect
              label="Storage Location"
              options={locations.map((loc) => ({
                id: loc.name,
                name: loc.name,
              }))}
              value={formData.location}
              onChange={(value) => setFormData({ ...formData, location: value })}
              placeholder="Select physical location"
            />
          </div>
        </div>

        <div>
          <label htmlFor={notesFieldId} className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
          <textarea
            id={notesFieldId}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Additional information about this drive..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending
              ? editingId ? 'Updating...' : 'Adding...'
              : editingId ? 'Update Drive' : 'Add Drive'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
