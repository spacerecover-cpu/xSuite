import React from 'react';
import { CheckCircle2, Info, HardDrive, FolderOpen, Calendar } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
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
  resource_clone_drive?: {
    clone_id: string;
    brand: string;
    model: string;
    capacity: string;
    serial_number: string;
  };
}

interface ExtractCloneConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clone: CloneDrive | null;
  caseNo?: string;
  patientDeviceName?: string;
  isLoading?: boolean;
}

export const ExtractCloneConfirmationModal: React.FC<ExtractCloneConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clone,
  caseNo,
  patientDeviceName,
  isLoading = false,
}) => {
  if (!isOpen || !clone) return null;

  const displayBrand = clone.resource_clone_drive?.brand || clone.physical_drive_brand || 'Unknown';
  const displayModel = clone.resource_clone_drive?.model || clone.physical_drive_model || '';
  const displayCapacity = clone.resource_clone_drive?.capacity || clone.physical_drive_capacity || '';
  const displaySerial = clone.resource_clone_drive?.serial_number || clone.physical_drive_serial || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Extract Clone Drive"
      size="md"
      icon={CheckCircle2}
    >
      <div>
        <div>
          <div className="mb-4 p-3 bg-success-muted border-l-4 border-success rounded">
            <div className="flex gap-2">
              <Info className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <p className="text-sm text-success">
                This will mark the clone as extracted and record the extraction date and time. The data has been successfully extracted from this clone drive.
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Clone Drive</div>
                <div className="text-sm font-semibold text-slate-900">
                  Clone #{caseNo || clone.id.slice(0, 8)}
                </div>
              </div>

              {patientDeviceName && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Patient Device</div>
                  <div className="text-sm text-slate-900">{patientDeviceName}</div>
                </div>
              )}

              {(displaySerial || displayBrand !== 'Unknown') && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    Physical Drive
                  </div>
                  <div className="text-sm text-slate-900 font-medium">
                    {displayBrand} {displayModel}
                    {displayCapacity && ` (${displayCapacity})`}
                  </div>
                  {displaySerial && (
                    <div className="text-xs text-slate-500">SN: {displaySerial}</div>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  Storage Location
                </div>
                <div className="text-xs text-slate-900 font-mono bg-white p-2 rounded border border-slate-200 break-all">
                  {clone.storage_server && (
                    <span className="text-primary font-semibold">{clone.storage_server}:</span>
                  )}
                  {clone.storage_path}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Format</div>
                    <div className="text-sm font-medium text-slate-900 uppercase">
                      {clone.image_format || 'DD'}
                    </div>
                  </div>
                  {clone.image_size_gb && clone.image_size_gb > 0 && (
                    <div>
                      <div className="text-xs text-slate-500">Size</div>
                      <div className="text-sm font-medium text-slate-900">
                        {clone.image_size_gb} GB
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Clone Date
                </div>
                <div className="text-sm text-slate-900">
                  {formatDate(clone.clone_date)}
                </div>
              </div>
            </div>

            <div className="bg-info-muted border border-info/30 rounded-lg p-3">
              <div className="flex gap-2">
                <CheckCircle2 className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-info mb-1">
                    Extraction will be recorded as:
                  </div>
                  <div className="text-sm text-info">
                    {formatDate(new Date().toISOString())}
                  </div>
                </div>
              </div>
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
              onClick={onConfirm}
              disabled={isLoading}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isLoading ? 'Extracting...' : 'Confirm Extract'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
