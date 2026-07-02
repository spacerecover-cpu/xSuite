import React, { useState } from 'react';
import { Archive, Info, HardDrive, FolderOpen, Shield, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatDate } from '../../lib/format';
import { useToast } from '../../hooks/useToast';

interface CloneDrive {
  id: string;
  case_id: string;
  patient_device_id: string;
  resource_clone_drive_id?: string;
  physical_drive_serial?: string;
  physical_drive_brand?: string;
  physical_drive_model?: string;
  physical_drive_capacity?: string;
  storage_path: string;
  storage_server?: string;
  image_format?: string;
  image_size_gb?: number;
  clone_date: string;
  status: string;
  resource_clone_drive?: {
    clone_id: string;
    brand: string;
    model: string;
    capacity: string;
    serial_number: string;
  };
}

interface PreserveLongTermModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (preserveReason: string) => void;
  clone: CloneDrive | null;
  caseNo?: string;
  patientDeviceName?: string;
  isLoading?: boolean;
}

const COMMON_REASONS = [
  'Legal hold',
  'Warranty case',
  'Customer request',
  'Complex recovery reference',
  'Ongoing investigation',
  'Insurance claim',
  'Other',
];

export const PreserveLongTermModal: React.FC<PreserveLongTermModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clone,
  caseNo,
  patientDeviceName,
  isLoading = false,
}) => {
  const toast = useToast();
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  if (!isOpen || !clone) return null;

  const displayBrand = clone.resource_clone_drive?.brand || clone.physical_drive_brand || 'Unknown';
  const displayModel = clone.resource_clone_drive?.model || clone.physical_drive_model || '';
  const displayCapacity = clone.resource_clone_drive?.capacity || clone.physical_drive_capacity || '';
  const displaySerial = clone.resource_clone_drive?.serial_number || clone.physical_drive_serial || '';

  const handleConfirm = () => {
    const reason = selectedReason === 'Other' ? customReason : selectedReason;
    if (!reason.trim()) {
      toast.error('Please provide a reason for long-term preservation');
      return;
    }
    onConfirm(reason);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preserve Clone Long-term"
      icon={Archive}
      maxWidth="3xl"
      closeOnBackdrop={false}
    >
      <div>
          <div className="mb-3 p-2.5 bg-info-muted border-l-4 border-info rounded">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
              <p className="text-xs text-info">
                Preserving this clone will move it to long-term storage. It will not be subject to
                retention deadlines and will remain available until manually deleted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-0.5">Clone Drive</div>
                <div className="text-sm font-semibold text-slate-900">
                  Clone #{caseNo || clone.id.slice(0, 8)}
                </div>
              </div>

              {patientDeviceName && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-0.5">Patient Device</div>
                  <div className="text-xs text-slate-900">{patientDeviceName}</div>
                </div>
              )}

              {(displaySerial || displayBrand !== 'Unknown') && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    Physical Drive
                  </div>
                  <div className="text-xs text-slate-900 font-medium">
                    {displayBrand} {displayModel}
                    {displayCapacity && ` (${displayCapacity})`}
                  </div>
                  {displaySerial && (
                    <div className="text-xs text-slate-500">SN: {displaySerial}</div>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  Storage Location
                </div>
                <div className="text-xs text-slate-900 font-mono bg-white p-1.5 rounded border border-slate-200 break-all">
                  {clone.storage_server && (
                    <span className="text-primary font-semibold">{clone.storage_server}:</span>
                  )}
                  {clone.storage_path}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1.5 border-t border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">Format</div>
                  <div className="text-xs font-medium text-slate-900 uppercase">
                    {clone.image_format || 'DD'}
                  </div>
                </div>
                {clone.image_size_gb && clone.image_size_gb > 0 && (
                  <div>
                    <div className="text-xs text-slate-500">Size</div>
                    <div className="text-xs font-medium text-slate-900">
                      {clone.image_size_gb} GB
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-slate-500">Clone Date</div>
                  <div className="text-xs text-slate-900">
                    {formatDate(clone.clone_date)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="bg-warning-muted border border-warning/30 rounded-lg p-2.5">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-warning mb-0.5">
                      Physical Drive Availability
                    </div>
                    <p className="text-xs text-warning">
                      If this clone is stored on a physical drive, that drive will remain in use and unavailable for new cases.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-success-muted border border-success/30 rounded-lg p-2.5">
                <div className="flex gap-2">
                  <Shield className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-success mb-0.5">
                      Long-term Preservation
                    </div>
                    <p className="text-xs text-success">
                      This clone will be excluded from retention deadlines and cleanup queues.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Reason for Long-term Preservation *
              </label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {COMMON_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    disabled={isLoading}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-colors text-left ${
                      selectedReason === reason
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-primary/40 hover:bg-primary/10'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              {selectedReason === 'Other' && (
                <Input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Please specify the reason..."
                  disabled={isLoading}
                />
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isLoading || !selectedReason || (selectedReason === 'Other' && !customReason.trim())}
              style={{ backgroundColor: 'rgb(var(--color-primary))' }}
              className="flex items-center gap-2"
            >
              <Archive className="w-4 h-4" />
              {isLoading ? 'Preserving...' : 'Confirm Preservation'}
            </Button>
          </div>
      </div>
    </Modal>
  );
};
