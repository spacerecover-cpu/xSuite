import React from 'react';
import { Archive, AlertTriangle, Info, HardDrive, FolderOpen, Calendar } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
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

interface ArchiveCloneConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clone: CloneDrive | null;
  caseNo?: string;
  patientDeviceName?: string;
  isLoading?: boolean;
}

export const ArchiveCloneConfirmationModal: React.FC<ArchiveCloneConfirmationModalProps> = ({
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
      title="Archive Clone Drive"
      size="md"
      icon={Archive}
    >
      <div>
        <div className="mb-4 p-3 bg-slate-50 border-l-4 border-slate-500 rounded">
            <div className="flex gap-2">
              <Info className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-900">
                Archiving will mark this clone drive as no longer active. The data will be preserved, but the clone will be moved to archived status.
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Clone Drive</div>
                <div className="text-sm font-semibold text-slate-900">
                  Clone #{caseNo || clone.id.slice(0, 8)}
                </div>
              </div>

              {patientDeviceName && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">Patient Device</div>
                  <div className="text-sm text-slate-900">{patientDeviceName}</div>
                </div>
              )}

              {(displaySerial || displayBrand !== 'Unknown') && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1 flex items-center gap-1">
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
                <div className="text-xs font-medium text-slate-500 uppercase mb-1 flex items-center gap-1">
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
                <div className="text-xs font-medium text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Clone Date
                </div>
                <div className="text-sm text-slate-900">
                  {formatDate(clone.clone_date)}
                </div>
              </div>
            </div>

            <div className="bg-warning-muted border border-warning/30 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-warning mb-1">
                    Physical Drive Availability
                  </div>
                  <p className="text-sm text-warning">
                    If this clone is stored on a physical drive, that drive will be marked as available for reuse once archived.
                  </p>
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
              style={{ backgroundColor: '#64748b' }}
              className="flex items-center gap-2"
            >
              <Archive className="w-4 h-4" />
              {isLoading ? 'Archiving...' : 'Confirm Archive'}
            </Button>
          </div>
        </div>
    </Modal>
  );
};
