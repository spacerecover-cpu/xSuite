import React, { useId, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Package, User, Phone, CreditCard, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../lib/logger';

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
}) => {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [collectorName, setCollectorName] = useState(customerName);
  const [collectorMobile, setCollectorMobile] = useState(customerMobileNumber || '');
  const [collectorId, setCollectorId] = useState('');
  const [recoveryOutcome, setRecoveryOutcome] = useState<string>('full');
  const [relationship, setRelationship] = useState<CollectorRelationship>('self');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const collectorNameId = useId();
  const collectorMobileId = useId();
  const collectorIdId = useId();
  const recoveryOutcomeId = useId();
  const relationshipId = useId();

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

  const handleSubmit = async () => {
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

    setIsSubmitting(true);
    setError('');

    try {
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

      onCheckoutComplete();
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
                Print Checkout Form
              </span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
