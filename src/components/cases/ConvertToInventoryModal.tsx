import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Info, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabaseClient';
import { getInventoryConditionTypes } from '../../lib/inventoryService';
import {
  convertCaseDeviceToInventory,
  getInventoryConvertedFromCase,
} from '../../lib/caseInventoryConversionService';
import { inventoryKeys } from '../../lib/queryKeys';
import { useToast } from '../../hooks/useToast';

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary bg-white';

/** The subset of a case device the convert flow reads for display + selection.
 *  The RPC re-reads the authoritative case_devices row server-side, so only the
 *  device id and human-readable labels are needed here. */
export interface ConvertDevice {
  id: string;
  model?: string | null;
  serial_number?: string | null;
  device_type_id?: string | null;
  is_primary?: boolean | null;
  checked_out_at?: string | null;
  device_type?: { id?: string | null; name?: string | null } | null;
  brand?: { name?: string | null } | null;
  capacity?: { id?: string | null; name?: string | null } | null;
  device_role?: { id?: number | null; name?: string | null } | null;
}

interface ConvertToInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  customerName: string;
  devices: ConvertDevice[];
  onConverted: (inventoryItemId: string) => void;
}

function deviceLabel(d: ConvertDevice): string {
  const parts = [d.device_type?.name, d.brand?.name, d.model].filter(Boolean);
  return parts.join(' · ') || 'Unspecified device';
}

/**
 * Convert an abandoned case device into a donor/inventory item. Runs one device
 * at a time (each physical drive is its own inventory record — a multi-device
 * job is never collapsed into one). Pre-fills from the case device server-side;
 * the user sets the inventory-side condition/location and confirms. On success
 * the parent navigates to the new inventory record.
 */
export const ConvertToInventoryModal: React.FC<ConvertToInventoryModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  customerName,
  devices,
  onConverted,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [conditionId, setConditionId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [isDonor, setIsDonor] = useState(true);
  const [notes, setNotes] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const { data: conditions = [] } = useQuery({
    queryKey: ['inventory', 'condition-types'],
    queryFn: getInventoryConditionTypes,
    enabled: isOpen,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['inventory', 'locations', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_locations')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen,
  });

  const { data: converted = [] } = useQuery({
    queryKey: ['case', caseId, 'converted-inventory'],
    queryFn: () => getInventoryConvertedFromCase(caseId),
    enabled: isOpen && !!caseId,
  });

  const convertedByDevice = useMemo(() => {
    const map = new Map<string, { id: string; item_number: string | null }>();
    converted.forEach((c) => {
      if (c.source_case_device_id) {
        map.set(c.source_case_device_id, { id: c.id, item_number: c.item_number });
      }
    });
    return map;
  }, [converted]);

  // Default the picker to the first not-yet-converted device (prefer the primary
  // one), falling back to the first device. Re-runs when the modal opens or once
  // the already-converted set loads.
  useEffect(() => {
    if (!isOpen || devices.length === 0) return;
    const notConverted = devices.filter((d) => !convertedByDevice.has(d.id));
    const preferred =
      notConverted.find((d) => d.is_primary) ?? notConverted[0] ?? devices[0];
    setSelectedDeviceId((prev) => (prev && devices.some((d) => d.id === prev) ? prev : preferred.id));
  }, [isOpen, devices, convertedByDevice]);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;
  const alreadyConverted = selectedDevice ? convertedByDevice.get(selectedDevice.id) : undefined;
  const missingDeviceType = !!selectedDevice && !selectedDevice.device_type_id;
  const checkedOut = !!selectedDevice?.checked_out_at;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedDevice) throw new Error('Select a device to convert.');
      return convertCaseDeviceToInventory({
        caseId,
        caseDeviceId: selectedDevice.id,
        conditionId: conditionId || null,
        locationId: locationId || null,
        isDonor,
        notes: notes.trim() || null,
        legalBasis: legalBasis.trim() || null,
        allowDuplicate: !!alreadyConverted && allowDuplicate,
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Device converted to inventory${result.item_number ? ` — ${result.item_number}` : ''}`,
      );
      queryClient.invalidateQueries({ queryKey: ['case', caseId, 'converted-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['case_history', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      onConverted(result.inventory_item_id);
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(`Could not convert device: ${(err as Error).message}`);
    },
  });

  const convertDisabled =
    mutation.isPending ||
    !selectedDevice ||
    missingDeviceType ||
    (!!alreadyConverted && !allowDuplicate);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Convert Device to Inventory" icon={Package} size="md">
      <div className="mb-4 flex gap-2 rounded border-l-4 border-info bg-info-muted p-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-info" />
        <p className="text-sm text-info">
          Keep an <strong>uncollected device</strong> from case #{caseNumber} as lab inventory
          (typically a donor drive). Its hardware details are copied automatically and it gets the
          next inventory number for its device type. The device is logged as retained in the
          chain of custody. Convert one device at a time.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="cti-device" className="mb-1 block text-sm font-medium text-slate-700">
            Device <span className="text-danger">*</span>
          </label>
          <select
            id="cti-device"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className={inputClass}
          >
            {devices.map((d) => {
              const conv = convertedByDevice.get(d.id);
              return (
                <option key={d.id} value={d.id}>
                  {d.is_primary ? '★ ' : ''}
                  {deviceLabel(d)}
                  {d.serial_number ? ` (S/N ${d.serial_number})` : ''}
                  {conv ? ` — already ${conv.item_number ?? 'converted'}` : ''}
                </option>
              );
            })}
          </select>
          {selectedDevice && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
              {selectedDevice.device_role?.name && <span>Role: {selectedDevice.device_role.name}</span>}
              {selectedDevice.capacity?.name && <span>Capacity: {selectedDevice.capacity.name}</span>}
              {selectedDevice.serial_number && <span>S/N: {selectedDevice.serial_number}</span>}
            </div>
          )}
        </div>

        {missingDeviceType && (
          <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-muted p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
            <p className="text-sm text-danger">
              This device has no device type set, so an inventory number can't be assigned. Set a
              device type on the device first.
            </p>
          </div>
        )}

        {alreadyConverted && (
          <div className="rounded-lg border border-warning/30 bg-warning-muted p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <p className="text-sm text-warning">
                This device was already converted to inventory
                {alreadyConverted.item_number ? ` (${alreadyConverted.item_number})` : ''}.
              </p>
            </div>
            <label className="mt-2 flex items-center gap-2 pl-6 text-sm text-warning cursor-pointer">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Create another inventory item anyway
            </label>
          </div>
        )}

        {checkedOut && !alreadyConverted && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning-muted p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <p className="text-sm text-warning">
              This device is recorded as checked out (returned to the customer). Only convert it if
              it was actually left with the lab.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cti-condition" className="mb-1 block text-sm font-medium text-slate-700">
              Physical condition
            </label>
            <select
              id="cti-condition"
              value={conditionId}
              onChange={(e) => setConditionId(e.target.value)}
              className={inputClass}
            >
              <option value="">Set later…</option>
              {conditions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cti-location" className="mb-1 block text-sm font-medium text-slate-700">
              Storage location
            </label>
            <select
              id="cti-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">Set later…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isDonor}
              onChange={(e) => setIsDonor(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">Mark as donor drive</div>
              <div className="mt-0.5 text-xs text-slate-600">
                Makes it available as a donor for future recoveries.
              </div>
            </div>
          </label>
        </div>

        <div>
          <label htmlFor="cti-legal" className="mb-1 block text-sm font-medium text-slate-700">
            Abandonment basis
          </label>
          <input
            id="cti-legal"
            type="text"
            value={legalBasis}
            onChange={(e) => setLegalBasis(e.target.value)}
            placeholder="e.g. Unclaimed after 90 days; signed abandonment consent on file"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Recorded in the chain-of-custody entry.</p>
        </div>

        <div>
          <label htmlFor="cti-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Notes
          </label>
          <textarea
            id="cti-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth recording on the inventory item."
            className={inputClass}
          />
        </div>

        <p className="text-xs text-slate-500">
          Original customer: <span className="font-medium text-slate-700">{customerName}</span>{' '}
          — kept as an internal reference only.
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={convertDisabled}
          className="flex items-center gap-2"
          style={{ backgroundColor: 'rgb(var(--color-primary))' }}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {mutation.isPending ? 'Converting…' : 'Convert to Inventory'}
        </Button>
      </div>
    </Modal>
  );
};
