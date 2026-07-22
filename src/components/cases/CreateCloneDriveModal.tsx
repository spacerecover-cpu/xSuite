import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HardDriveDownload, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';

interface DeviceOption {
  id: string;
  device_type?: { name?: string | null } | null;
  serial_number?: string | null;
}

interface ResourceCloneDriveOption {
  id: string;
  label: string;
  serial_number: string | null;
  location: string | null;
  capacity_gb: number;
  used_gb: number;
  available_gb: number;
}

export interface CreateCloneDriveFormValues {
  deviceId: string;
  driveLabel: string;
  capacity: string;
  storageServer: string;
  storagePath: string;
  storageType: 'nas' | 'local' | 'external' | 'tape' | 'cloud';
  imageFormat: 'dd' | 'ewf' | 'aff' | 'raw' | 'ddrescue';
  expectedSizeGb: number | null;
  resourceCloneDriveId: string | null;
}

interface CreateCloneDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNo?: string;
  devices: DeviceOption[];
  onSubmit: (values: CreateCloneDriveFormValues) => void;
  isLoading?: boolean;
  /**
   * Called when the user picks a resource drive that would overflow its
   * available space. Return true to allow the parent to display the space
   * warning instead of forwarding the submission.
   */
  onSpaceShort?: (info: {
    values: CreateCloneDriveFormValues;
    resource: ResourceCloneDriveOption;
  }) => boolean;
}

const STORAGE_TYPES: Array<{ value: CreateCloneDriveFormValues['storageType']; label: string }> = [
  { value: 'nas', label: 'NAS (Network Attached Storage)' },
  { value: 'local', label: 'Local Disk' },
  { value: 'external', label: 'External Drive' },
  { value: 'tape', label: 'Tape' },
  { value: 'cloud', label: 'Cloud' },
];

const IMAGE_FORMATS: Array<{ value: CreateCloneDriveFormValues['imageFormat']; label: string }> = [
  { value: 'dd', label: 'dd (raw)' },
  { value: 'ewf', label: 'EWF (E01)' },
  { value: 'aff', label: 'AFF' },
  { value: 'raw', label: 'Raw' },
  { value: 'ddrescue', label: 'ddrescue' },
];

const DEFAULT_VALUES: CreateCloneDriveFormValues = {
  deviceId: '',
  driveLabel: '',
  capacity: '',
  storageServer: '',
  storagePath: '',
  storageType: 'nas',
  imageFormat: 'dd',
  expectedSizeGb: null,
  resourceCloneDriveId: null,
};

export const CreateCloneDriveModal: React.FC<CreateCloneDriveModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNo,
  devices,
  onSubmit,
  isLoading = false,
  onSpaceShort,
}) => {
  const [values, setValues] = useState<CreateCloneDriveFormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateCloneDriveFormValues, string>>>({});

  useEffect(() => {
    if (isOpen) {
      setValues((prev) => ({
        ...DEFAULT_VALUES,
        deviceId: prev.deviceId || (devices[0]?.id ?? ''),
      }));
      setErrors({});
    }
  }, [isOpen, devices]);

  const { data: resourceDrives = [] } = useQuery<ResourceCloneDriveOption[]>({
    queryKey: ['resource_clone_drives', 'create_modal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource_clone_drives')
        .select(`
          id,
          label,
          serial_number,
          location,
          capacity_ref:catalog_device_capacities(gb_value)
        `)
        .is('deleted_at', null)
        .order('label', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        label: string;
        serial_number: string | null;
        location: string | null;
        capacity_ref: { gb_value: number | string | null } | null;
      }>;

      // Sum currently active/delivered clones consuming each resource drive
      // so the picker can reflect free space realistically.
      const { data: usage, error: usageError } = await supabase
        .from('clone_drives')
        .select('resource_clone_drive_id, image_size_gb, expected_size_gb, status')
        .is('deleted_at', null)
        .in('status', ['active', 'delivered', 'preserved']);
      if (usageError) throw usageError;

      const usedById = new Map<string, number>();
      for (const u of (usage ?? []) as Array<{
        resource_clone_drive_id: string | null;
        image_size_gb: number | null;
        expected_size_gb: number | null;
      }>) {
        if (!u.resource_clone_drive_id) continue;
        const size = u.image_size_gb ?? u.expected_size_gb ?? 0;
        usedById.set(
          u.resource_clone_drive_id,
          (usedById.get(u.resource_clone_drive_id) ?? 0) + size,
        );
      }

      return rows.map((row) => {
        const capacityGb = (() => {
          const raw = row.capacity_ref?.gb_value;
          if (raw == null) return 0;
          const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
          return Number.isFinite(parsed) ? parsed : 0;
        })();
        const usedGb = usedById.get(row.id) ?? 0;
        const availableGb = Math.max(0, capacityGb - usedGb);
        return {
          id: row.id,
          label: row.label,
          serial_number: row.serial_number,
          location: row.location,
          capacity_gb: capacityGb,
          used_gb: usedGb,
          available_gb: availableGb,
        };
      });
    },
    enabled: isOpen,
  });

  const selectedResource = useMemo<ResourceCloneDriveOption | null>(() => {
    if (!values.resourceCloneDriveId) return null;
    return resourceDrives.find((d) => d.id === values.resourceCloneDriveId) ?? null;
  }, [values.resourceCloneDriveId, resourceDrives]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof CreateCloneDriveFormValues, string>> = {};
    if (!values.deviceId) next.deviceId = 'Source device is required';
    if (!values.driveLabel.trim()) next.driveLabel = 'Drive label is required';
    if (!values.capacity.trim()) next.capacity = 'Capacity is required';
    if (values.expectedSizeGb != null && values.expectedSizeGb < 0) {
      next.expectedSizeGb = 'Expected size must be positive';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (
      selectedResource &&
      values.expectedSizeGb != null &&
      values.expectedSizeGb > selectedResource.available_gb &&
      onSpaceShort
    ) {
      const handled = onSpaceShort({ values, resource: selectedResource });
      if (handled) return;
    }
    onSubmit(values);
  };

  const update = <K extends keyof CreateCloneDriveFormValues>(
    key: K,
    val: CreateCloneDriveFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const deviceLabel = (d: DeviceOption): string => {
    const type = d.device_type?.name ?? 'Device';
    const serial = d.serial_number ? ` (${d.serial_number})` : '';
    return `${type}${serial}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseNo ? `Create Clone Drive — Case #${caseNo}` : 'Create Clone Drive'}
      icon={HardDriveDownload}
      titleSize="sm"
      maxWidth="3xl"
      showClose
      closeOnBackdrop={false}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-5"
      >
        <div className="bg-info-muted border border-info/30 rounded-lg p-3">
          <p className="text-xs text-info">
            Record a new disk image / clone for this case. Source device, drive label, and
            capacity are required. All other fields are optional and can be edited later.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
          <div>
            <SearchableSelect
              label="Source Device"
              floatingLabel
              shrinkDefaultValue
              usePortal
              required
              value={values.deviceId}
              onChange={(v) => update('deviceId', v)}
              options={[
                { id: '', name: 'No Device' },
                ...devices.map((d) => ({ id: d.id, name: deviceLabel(d) })),
              ]}
              placeholder="No Device"
              disabled={isLoading || devices.length === 0}
              error={errors.deviceId}
            />
            {devices.length === 0 && (
              <p className="mt-1 text-xs text-warning">
                No devices on this case yet. Add a device first.
              </p>
            )}
          </div>

          <div>
            <Input
              label="Drive Label"
              floatingLabel
              value={values.driveLabel}
              onChange={(e) => update('driveLabel', e.target.value)}
              placeholder="e.g. Clone_001"
              disabled={isLoading}
              required
              error={errors.driveLabel}
            />
          </div>

          <div>
            <Input
              label="Capacity"
              floatingLabel
              value={values.capacity}
              onChange={(e) => update('capacity', e.target.value)}
              placeholder="e.g. 2TB"
              disabled={isLoading}
              required
              error={errors.capacity}
            />
          </div>

          <div>
            <Input
              label="Expected Size (GB)"
              floatingLabel
              type="number"
              min="0"
              step="0.1"
              value={values.expectedSizeGb ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                update('expectedSizeGb', raw === '' ? null : parseFloat(raw));
              }}
              placeholder="Optional"
              disabled={isLoading}
              error={errors.expectedSizeGb}
            />
          </div>

          <div>
            <Input
              label="Storage Server"
              floatingLabel
              value={values.storageServer}
              onChange={(e) => update('storageServer', e.target.value)}
              placeholder="e.g. nas01"
              disabled={isLoading}
            />
          </div>

          <div>
            <Input
              label="Storage Path"
              floatingLabel
              value={values.storagePath}
              onChange={(e) => update('storagePath', e.target.value)}
              placeholder="/clones/case-xyz/image.dd"
              disabled={isLoading}
            />
          </div>

          <div>
            <SearchableSelect
              label="Storage Type"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={values.storageType}
              onChange={(v) => update('storageType', v as CreateCloneDriveFormValues['storageType'])}
              options={STORAGE_TYPES.map((t) => ({ id: t.value, name: t.label }))}
              placeholder="Not specified"
              disabled={isLoading}
            />
          </div>

          <div>
            <SearchableSelect
              label="Image Format"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={values.imageFormat}
              onChange={(v) => update('imageFormat', v as CreateCloneDriveFormValues['imageFormat'])}
              options={IMAGE_FORMATS.map((f) => ({ id: f.value, name: f.label }))}
              placeholder="Not specified"
              disabled={isLoading}
            />
          </div>

          <div className="md:col-span-2">
            <SearchableSelect
              label="Resource Clone Drive (optional)"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={values.resourceCloneDriveId ?? ''}
              onChange={(v) => update('resourceCloneDriveId', v === '' ? null : v)}
              options={[
                { id: '', name: 'No Resource Drive' },
                ...resourceDrives.map((d) => ({
                  id: d.id,
                  name: `${d.label}${d.serial_number ? ` · SN ${d.serial_number}` : ''}${
                    d.capacity_gb > 0
                      ? ` · ${d.available_gb.toFixed(0)}/${d.capacity_gb.toFixed(0)} GB free`
                      : ''
                  }`,
                })),
              ]}
              placeholder="No Resource Drive"
              disabled={isLoading}
            />
            {selectedResource && (
              <p className="mt-1 text-xs text-slate-500">
                {selectedResource.capacity_gb > 0
                  ? `${selectedResource.available_gb.toFixed(0)} GB available of ${selectedResource.capacity_gb.toFixed(0)} GB`
                  : 'Capacity unknown for this resource drive'}
                {selectedResource.location ? ` · ${selectedResource.location}` : ''}
              </p>
            )}
            {selectedResource &&
              values.expectedSizeGb != null &&
              values.expectedSizeGb > selectedResource.available_gb && (
                <p className="mt-1 text-xs text-warning">
                  Expected size ({values.expectedSizeGb} GB) exceeds the available space on the
                  selected resource drive.
                </p>
              )}
          </div>
        </div>

        <input type="hidden" value={caseId} readOnly />

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="text-xs"
            disabled={isLoading || devices.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Clone Drive'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
