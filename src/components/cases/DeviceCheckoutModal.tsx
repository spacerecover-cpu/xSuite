import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Package, User, Printer, FileText, PackageCheck, Loader2 } from 'lucide-react';
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

const RECOVERY_OUTCOMES = ['full', 'partial', 'unrecoverable', 'declined'] as const;

/** Seed the Recovery Outcome dropdown from the case's recorded recovery_outcome.
 *  log_case_checkout writes cases.recovery_outcome UNCONDITIONALLY from
 *  p_recovery_outcome on every checkout batch, so a hardcoded 'full' silently
 *  clobbers a recovery/QA-recorded 'partial'/'unrecoverable'/'declined'. Seeding
 *  from the recorded value means a passive checkout writes the same value back.
 *  Falls back to 'full' when the case has no recorded outcome yet (or an
 *  unrecognized value). */
function seedRecoveryOutcome(current?: string | null): string {
  return current && (RECOVERY_OUTCOMES as readonly string[]).includes(current) ? current : 'full';
}

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
  /** The case's currently recorded recovery_outcome (from recovery/QA). Seeds
   *  the Recovery Outcome dropdown so a passive checkout does not overwrite a
   *  recorded 'partial'/'unrecoverable'/'declined' with the default 'full'. */
  currentRecoveryOutcome?: string | null;
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
  currentRecoveryOutcome,
}) => {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [collectorName, setCollectorName] = useState(customerName);
  const [collectorMobile, setCollectorMobile] = useState(customerMobileNumber || '');
  const [collectorId, setCollectorId] = useState('');
  const [recoveryOutcome, setRecoveryOutcome] = useState<string>(() =>
    seedRecoveryOutcome(currentRecoveryOutcome),
  );
  const [relationship, setRelationship] = useState<CollectorRelationship>('self');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [declaredValues, setDeclaredValues] = useState<Record<string, string>>({});
  const [labSuppliedIds, setLabSuppliedIds] = useState<string[]>([]);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

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

  // Re-seed the Recovery Outcome dropdown from the case's recorded value each
  // time the modal opens, so a passive checkout preserves the recovery/QA
  // outcome instead of silently overwriting it with the default 'full'.
  useEffect(() => {
    if (isOpen) setRecoveryOutcome(seedRecoveryOutcome(currentRecoveryOutcome));
  }, [isOpen, currentRecoveryOutcome]);

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
      setRecoveryOutcome(seedRecoveryOutcome(currentRecoveryOutcome));
      setRelationship('self');
      setError('');
      setDeclaredValues({});
      setLabSuppliedIds([]);
      setCheckoutDone(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Device Checkout" subtitle="Check this device out and record its return." icon={PackageCheck} titleSize="sm" showClose closeOnBackdrop={false} initialFocusRef={firstFieldRef}>
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
          <div className="space-y-5">
            <SearchableSelect
              label="Who is collecting?"
              floatingLabel
              shrinkDefaultValue
              usePortal
              value={relationship}
              onChange={(v) => handleRelationshipChange(v as CollectorRelationship)}
              options={[
                { id: 'self', name: 'The customer (in person)' },
                { id: 'authorized_agent', name: 'Authorized agent (on behalf of the customer)' },
                { id: 'company_rep', name: 'Company representative' },
                { id: 'courier', name: 'Courier' },
              ]}
            />
            <Input
              ref={firstFieldRef}
              label="Collector Name *"
              floatingLabel
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              placeholder="Enter collector name"
            />
            <Input
              label="Mobile Number *"
              floatingLabel
              value={collectorMobile}
              onChange={(e) => setCollectorMobile(e.target.value)}
              placeholder="Enter mobile number"
            />
            <Input
              label={`National ID / Passport ${relationship === 'self' ? '(Optional)' : '*'}`}
              floatingLabel
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              placeholder={relationship === 'self' ? 'Enter ID number (optional)' : 'Required when collecting on behalf of the customer'}
            />
          </div>
        </div>

        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
          <SearchableSelect
            label="Recovery Outcome"
            floatingLabel
            shrinkDefaultValue
            usePortal
            value={recoveryOutcome}
            onChange={(v) => setRecoveryOutcome(v)}
            options={[
              { id: 'full', name: 'Full Recovery - All data recovered successfully' },
              { id: 'partial', name: 'Partial Recovery - Some data recovered' },
              { id: 'unrecoverable', name: 'Unrecoverable - Data could not be recovered' },
              { id: 'declined', name: 'Declined - Customer declined service' },
            ]}
          />
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

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            className="text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                {checkoutDone ? 'Retry Delivery Challan' : 'Print Checkout Form'}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
