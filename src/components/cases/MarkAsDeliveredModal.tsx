import React, { useState, useRef } from 'react';
import { Truck, Info, HardDrive, FolderOpen, CheckCircle2, Clock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatDate } from '../../lib/format';

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
  retention_days?: number;
  resource_clone_drive?: {
    clone_id: string;
    brand: string;
    model: string;
    capacity: string;
    serial_number: string;
  };
}

interface MarkAsDeliveredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updateCaseStatus: boolean, deliveryNotes: string, retentionDays: number) => void;
  clone: CloneDrive | null;
  caseNo?: string;
  caseStatus?: string;
  patientDeviceName?: string;
  isLoading?: boolean;
}

export const MarkAsDeliveredModal: React.FC<MarkAsDeliveredModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clone,
  caseNo,
  caseStatus,
  patientDeviceName,
  isLoading = false,
}) => {
  const [updateCaseStatus, setUpdateCaseStatus] = useState(caseStatus !== 'Delivered');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [retentionDays, setRetentionDays] = useState(clone?.retention_days || 180);
  const retentionInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (clone) {
      setRetentionDays(clone.retention_days || 180);
    }
  }, [clone]);

  if (!isOpen || !clone) return null;

  const displayBrand = clone.resource_clone_drive?.brand || clone.physical_drive_brand || 'Unknown';
  const displayModel = clone.resource_clone_drive?.model || clone.physical_drive_model || '';
  const displayCapacity = clone.resource_clone_drive?.capacity || clone.physical_drive_capacity || '';
  const displaySerial = clone.resource_clone_drive?.serial_number || clone.physical_drive_serial || '';

  const deliveryDate = new Date();
  const retentionDeadline = new Date(deliveryDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);

  const handleConfirm = () => {
    onConfirm(updateCaseStatus, deliveryNotes, retentionDays);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark Clone as Delivered"
      icon={Truck}
      maxWidth="3xl"
      initialFocusRef={retentionInputRef}
      closeOnBackdrop={false}
    >
      <div>
        <div>
          <div className="mb-3 p-2.5 bg-success-muted border-l-4 border-success rounded">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <p className="text-xs text-success">
                This will mark the clone as delivered to the customer. The retention countdown will begin,
                and the clone will be eligible for deletion after the retention period expires.
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
              <div className="bg-info-muted border border-info/30 rounded-lg p-2.5">
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-info mb-0.5">
                      Delivery will be recorded as:
                    </div>
                    <div className="text-xs text-info">
                      {formatDate(deliveryDate.toISOString())}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-warning-muted border border-warning/30 rounded-lg p-2.5">
                <div className="flex gap-2">
                  <Clock className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-warning mb-1">
                      Retention Period (days)
                    </div>
                    <Input
                      ref={retentionInputRef}
                      type="number"
                      min="1"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(parseInt(e.target.value) || 180)}
                      disabled={isLoading}
                      className="w-full"
                    />
                    <div className="text-xs text-warning mt-1">
                      Eligible for deletion after: {formatDate(retentionDeadline.toISOString())}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-2.5 mb-4">
            <div>
              <label htmlFor="mark-delivered-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                Delivery Notes (Optional)
              </label>
              <Input
                id="mark-delivered-notes"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="e.g., USB drive, Cloud link, Physical pickup..."
                disabled={isLoading}
              />
            </div>

            {caseStatus !== 'Delivered' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateCaseStatus}
                    onChange={(e) => setUpdateCaseStatus(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-slate-900">
                      Also update case status to "Delivered"
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Current case status: <span className="font-medium">{caseStatus}</span>
                    </div>
                  </div>
                </label>
              </div>
            )}
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
              disabled={isLoading}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
              className="flex items-center gap-2"
            >
              <Truck className="w-4 h-4" />
              {isLoading ? 'Marking as Delivered...' : 'Confirm Delivery'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
