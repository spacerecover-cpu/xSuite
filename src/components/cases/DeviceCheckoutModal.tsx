import React, { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Package, User, Phone, CreditCard, Printer, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';
import {
  fetchDeviceRolePartition,
  getCheckoutBatchId,
  issueDeliveryChallan,
} from '../../lib/deliveryChallanService';
import {
  ewayBillGuidance,
  LAB_SUPPLIED_GOODS_GUIDANCE,
} from '../../lib/regimes/in_gst/deliveryChallan';

interface Device {
  id: string;
  device_type: { name: string } | null;
  brand: { name: string } | null;
  model: string | null;
  // case_devices column is `serial_number`; previously named `serial_no` here
  // which silently rendered blank S/N text because CaseDetail.tsx casts via
  // `as unknown` before passing devices into this modal.
  serial_number: string | null;
  /** Per-device checkout state — non-null when this device was already collected. */
  checked_out_at?: string | null;
}

type CollectorRelationship = 'self' | 'authorized_agent' | 'company_rep' | 'courier';

/** Compact "Returned · 20 Jun 2026" badge date for an already-collected device. */
function formatReturned(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

interface DeviceCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  devices: Device[];
  customerName: string;
  customerMobileNumber?: string;
  onCheckoutComplete: () => void;
  onShowCheckoutPreview?: () => void;
  /** True when the tenant's documents regime requires a Rule 55 delivery
   *  challan at device checkout (deliveryChallanEnabled(regime.documents)). */
  challanEnabled?: boolean;
}

export const DeviceCheckoutModal: React.FC<DeviceCheckoutModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNumber: _caseNumber,
  devices,
  customerName,
  customerMobileNumber,
  onCheckoutComplete,
  onShowCheckoutPreview,
  challanEnabled = false,
}) => {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [collectorName, setCollectorName] = useState(customerName);
  const [collectorMobile, setCollectorMobile] = useState(customerMobileNumber || '');
  const [collectorId, setCollectorId] = useState('');
  const [recoveryOutcome, setRecoveryOutcome] = useState<string>('full');
  const [relationship, setRelationship] = useState<CollectorRelationship>('self');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [declaredValues, setDeclaredValues] = useState<Record<string, string>>({});
  const [labSuppliedIds, setLabSuppliedIds] = useState<string[]>([]);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const collectorNameId = useId();
  const collectorMobileId = useId();
  const collectorIdId = useId();
  const recoveryOutcomeId = useId();
  const relationshipId = useId();

  useEffect(() => {
    if (!challanEnabled || !isOpen || selectedDevices.length === 0) {
      setLabSuppliedIds([]);
      return;
    }
    let cancelled = false;
    fetchDeviceRolePartition(selectedDevices)
      .then((p) => {
        if (!cancelled) setLabSuppliedIds(p.labSupplied.map((d) => d.id));
      })
      .catch((e) => {
        // Fail open to customer-owned: over-listing on a non-supply challan is
        // harmless; silently dropping a customer device is not.
        if (!cancelled) {
          setLabSuppliedIds([]);
          logger.error('Device role partition failed:', e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [challanEnabled, isOpen, selectedDevices]);

  const challanEligibleSelected = selectedDevices.filter((id) => !labSuppliedIds.includes(id));
  const declaredTotal = challanEligibleSelected.reduce(
    (sum, id) => sum + (parseFloat(declaredValues[id] ?? '') || 0),
    0,
  );
  const ewayNote = challanEnabled ? ewayBillGuidance(declaredTotal) : null;

  const handleDeviceToggle = (deviceId: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleRelationshipChange = (rel: CollectorRelationship) => {
    setRelationship(rel);
    if (rel === 'self') {
      setCollectorName(customerName);
      setCollectorMobile(customerMobileNumber || '');
    } else {
      // Collecting on behalf of the customer — clear the customer prefill so the
      // collector's OWN details are entered (a National ID becomes required below).
      setCollectorName((prev) => (prev === customerName ? '' : prev));
      setCollectorMobile((prev) => (prev === (customerMobileNumber || '') ? '' : prev));
    }
  };

  const runChallanIssuance = async (): Promise<string> => {
    const challanLines = challanEligibleSelected.map((id) => ({
      deviceId: id,
      declaredValue: parseFloat(declaredValues[id]),
    }));
    const batchId = await getCheckoutBatchId(selectedDevices[0]);
    if (!batchId) throw new Error('Checkout batch not found for the delivery challan');
    await issueDeliveryChallan({ caseId, batchId, lines: challanLines });
    return batchId;
  };

  const handleSubmit = async () => {
    if (!checkoutDone) {
      if (selectedDevices.length === 0) {
        setError('Please select at least one device');
        return;
      }
      if (!collectorName.trim() || !collectorMobile.trim()) {
        setError('Collector name and mobile number are required');
        return;
      }
      if (relationship !== 'self' && !collectorId.trim()) {
        setError('A National ID / passport is required when someone collects on behalf of the customer.');
        return;
      }
    }

    if (
      challanEnabled &&
      challanEligibleSelected.some((id) => !(parseFloat(declaredValues[id] ?? '') > 0))
    ) {
      setError('Enter a declared value (INR) for every customer-owned device — the Rule 55 delivery challan requires it.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (!checkoutDone) {
        const { error: dbError } = await supabase.rpc('log_case_checkout', {
          p_case_id: caseId,
          p_collector_name: collectorName.trim(),
          p_collector_mobile: collectorMobile.trim(),
          p_collector_id: collectorId.trim() || undefined,
          p_recovery_outcome: recoveryOutcome,
          p_device_ids: selectedDevices,
          p_collector_relationship: relationship,
        });
        if (dbError) throw dbError;
        setCheckoutDone(true);
        onCheckoutComplete();
      }

      if (challanEnabled && challanEligibleSelected.length > 0) {
        try {
          const batchId = await runChallanIssuance();
          window.open(`/print/delivery-challan/${caseId}/${batchId}`, '_blank');
        } catch (challanErr) {
          logger.error('Delivery challan issuance failed after checkout:', challanErr);
          const msg =
            challanErr instanceof Error ? challanErr.message : 'unknown error';
          setError(
            `Devices are checked out and custody is recorded, but the delivery challan could not be issued: ${msg}. ` +
              'Retry below — closing this dialog will skip automatic challan issuance.',
          );
          return;
        }
      }

      onClose();
      setTimeout(() => {
        if (onShowCheckoutPreview) {
          onShowCheckoutPreview();
        } else {
          window.open(`/print/checkout/${caseId}`, '_blank');
        }
      }, 500);
    } catch (err) {
      logger.error('Error during checkout:', err);
      const dbMessage =
        err && typeof err === 'object' && 'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : null;
      setError(dbMessage ? `Checkout failed: ${dbMessage}` : 'Failed to complete checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedDevices([]);
      setCollectorName(customerName);
      setCollectorMobile(customerMobileNumber || '');
      setCollectorId('');
      setRecoveryOutcome('full');
      setRelationship('self');
      setError('');
      setDeclaredValues({});
      setLabSuppliedIds([]);
      setCheckoutDone(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Device Checkout" closeOnBackdrop={false} initialFocusRef={firstFieldRef}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="bg-info-muted border border-info/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-info font-semibold mb-2">
            <Package className="w-5 h-5" />
            <span>Select Devices to Checkout</span>
          </div>
          <div className="space-y-2">
            {devices.map((device, index) => {
              const returned = !!device.checked_out_at;
              return (
                <label
                  key={device.id}
                  className={[
                    'flex items-start gap-3 p-3 bg-white border rounded-lg transition-colors',
                    returned
                      ? 'border-slate-200 opacity-60 cursor-not-allowed'
                      : 'border-slate-200 cursor-pointer hover:border-primary/60',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(device.id)}
                    onChange={() => handleDeviceToggle(device.id)}
                    disabled={returned}
                    className="mt-1 w-4 h-4 text-primary disabled:cursor-not-allowed"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">
                      {device.device_type?.name || 'Unknown Device'}{' '}
                      {device.brand?.name && `- ${device.brand.name}`}
                      {index === 0 && (
                        <span className="ml-2 text-xs bg-danger-muted text-danger px-2 py-0.5 rounded">
                          Patient
                        </span>
                      )}
                      {returned && (
                        <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                          Returned · {formatReturned(device.checked_out_at)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600">
                      {device.serial_number && (
                        <span className="font-mono">S/N: {device.serial_number}</span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="bg-success-muted border border-success/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-success font-semibold mb-4">
            <User className="w-5 h-5" />
            <span>Collector Information</span>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor={relationshipId} className="block text-sm font-medium text-slate-700 mb-1">
                Who is collecting?
              </label>
              <select
                id={relationshipId}
                value={relationship}
                onChange={(e) => handleRelationshipChange(e.target.value as CollectorRelationship)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
              >
                <option value="self">The customer (in person)</option>
                <option value="authorized_agent">Authorized agent (on behalf of the customer)</option>
                <option value="company_rep">Company representative</option>
                <option value="courier">Courier</option>
              </select>
            </div>
            <div>
              <label htmlFor={collectorNameId} className="block text-sm font-medium text-slate-700 mb-1">
                <User className="w-4 h-4 inline mr-1" />
                Collector Name *
              </label>
              <Input
                id={collectorNameId}
                ref={firstFieldRef}
                value={collectorName}
                onChange={(e) => setCollectorName(e.target.value)}
                placeholder="Enter collector name"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={collectorMobileId} className="block text-sm font-medium text-slate-700 mb-1">
                <Phone className="w-4 h-4 inline mr-1" />
                Mobile Number *
              </label>
              <Input
                id={collectorMobileId}
                value={collectorMobile}
                onChange={(e) => setCollectorMobile(e.target.value)}
                placeholder="Enter mobile number"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={collectorIdId} className="block text-sm font-medium text-slate-700 mb-1">
                <CreditCard className="w-4 h-4 inline mr-1" />
                National ID / Passport {relationship === 'self' ? '(Optional)' : '*'}
              </label>
              <Input
                id={collectorIdId}
                value={collectorId}
                onChange={(e) => setCollectorId(e.target.value)}
                placeholder={relationship === 'self' ? 'Enter ID number (optional)' : 'Required when collecting on behalf of the customer'}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
          <label htmlFor={recoveryOutcomeId} className="block text-sm font-medium text-accent-foreground mb-2">
            Recovery Outcome
          </label>
          <select
            id={recoveryOutcomeId}
            value={recoveryOutcome}
            onChange={(e) => setRecoveryOutcome(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
          >
            <option value="full">Full Recovery - All data recovered successfully</option>
            <option value="partial">Partial Recovery - Some data recovered</option>
            <option value="unrecoverable">Unrecoverable - Data could not be recovered</option>
            <option value="declined">Declined - Customer declined service</option>
          </select>
        </div>

        {challanEnabled && selectedDevices.length > 0 && (
          <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-warning-foreground font-semibold">
              <FileText className="w-5 h-5" />
              <span>Delivery Challan (Rule 55)</span>
            </div>
            <p className="text-xs text-slate-600">
              Customer-owned devices leaving the lab move under a Rule 55 delivery challan
              (printed in triplicate). Enter each device's declared goods value — this is a
              transit value declaration, not a charge.
            </p>
            {devices
              .filter((d) => selectedDevices.includes(d.id) && !labSuppliedIds.includes(d.id))
              .map((device) => (
                <div key={device.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-700">
                    {device.device_type?.name || 'Device'}
                    {device.serial_number ? ` · S/N ${device.serial_number}` : ''}
                  </span>
                  <label className="sr-only" htmlFor={`challan-value-${device.id}`}>
                    Declared goods value for {device.serial_number || device.id}
                  </label>
                  <Input
                    id={`challan-value-${device.id}`}
                    type="number"
                    min="1"
                    step="0.01"
                    value={declaredValues[device.id] ?? ''}
                    onChange={(e) =>
                      setDeclaredValues((prev) => ({ ...prev, [device.id]: e.target.value }))
                    }
                    placeholder="Declared value (INR)"
                    className="w-44"
                  />
                </div>
              ))}
            {labSuppliedIds.some((id) => selectedDevices.includes(id)) && (
              <p className="text-xs text-warning-foreground font-medium">
                {LAB_SUPPLIED_GOODS_GUIDANCE}
              </p>
            )}
            {ewayNote && <p className="text-xs text-slate-600">{ewayNote}</p>}
          </div>
        )}

        <p className="text-xs text-slate-500">
          When the last device is checked out, the case automatically moves to
          Closed — Device Returned (after Data Delivered where applicable).
        </p>

        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                {checkoutDone ? 'Retry Delivery Challan' : 'Print Checkout Form'}
              </span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
