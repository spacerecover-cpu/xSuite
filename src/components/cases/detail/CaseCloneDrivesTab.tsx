import React from 'react';
import { Copy } from 'lucide-react';
import { Card } from '../../ui/Card';
import { CloneDriveCard } from '../CloneDriveCard';

interface CloneDriveData {
  id: string;
  case_id?: string | null;
  patient_device_id?: string | null;
  storage_path?: string | null;
  clone_date?: string | null;
  status?: string | null;
  image_size_gb?: number | null;
  physical_location?: { name?: string | null } | null;
  cloned_by_user?: { full_name?: string | null } | null;
  [key: string]: unknown;
}

interface DeviceData {
  id: string;
  device_type?: { name?: string | null } | null;
  serial_number?: string | null;
  [key: string]: unknown;
}

interface CaseCloneDrivesTabProps {
  caseData: { case_no?: string | null; [key: string]: unknown };
  devices: DeviceData[];
  cloneDrives: CloneDriveData[];
  onSetViewCloneModal: (clone: Record<string, unknown>) => void;
  onSetSelectedClone: (clone: Record<string, unknown>) => void;
  onSetShowMarkAsDeliveredModal: (v: boolean) => void;
  onSetShowPreserveLongTermModal: (v: boolean) => void;
}

export const CaseCloneDrivesTab: React.FC<CaseCloneDrivesTabProps> = ({
  caseData,
  devices,
  cloneDrives,
  onSetViewCloneModal,
  onSetSelectedClone,
  onSetShowMarkAsDeliveredModal,
  onSetShowPreserveLongTermModal,
}) => {
  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Copy className="w-6 h-6 text-primary" />
                Clone Drives & Disk Images
              </h2>
              <p className="text-sm text-slate-600 mt-1">Track disk images and clone storage locations for data recovery</p>
            </div>
          </div>

          {cloneDrives.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Copy className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium mb-2">No clone drives recorded</p>
              <p className="text-sm">Create a record when you create a disk image or clone</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {cloneDrives.map((clone) => {
                const patientDevice = devices.find(d => d.id === clone.patient_device_id);
                const patientDeviceName = patientDevice
                  ? `${patientDevice.device_type?.name || 'Device'} ${patientDevice.serial_number ? `(${patientDevice.serial_number})` : ''}`
                  : 'Unknown Device';

                const cloneForCard = {
                  ...(clone as unknown as Record<string, unknown>),
                  physical_location_name: clone.physical_location?.name ?? undefined,
                  cloned_by_name: clone.cloned_by_user?.full_name ?? undefined,
                } as unknown as React.ComponentProps<typeof CloneDriveCard>['clone'];
                return (
                  <CloneDriveCard
                    key={clone.id}
                    clone={cloneForCard}
                    caseNo={caseData.case_no ?? undefined}
                    patientDeviceName={patientDeviceName}
                    onView={(c) => onSetViewCloneModal(c as unknown as Record<string, unknown>)}
                    onMarkAsDelivered={(c) => {
                      onSetSelectedClone(c as unknown as Record<string, unknown>);
                      onSetShowMarkAsDeliveredModal(true);
                    }}
                    onPreserve={(c) => {
                      onSetSelectedClone(c as unknown as Record<string, unknown>);
                      onSetShowPreserveLongTermModal(true);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {cloneDrives.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <div className="p-4">
              <div className="text-sm text-slate-600">Total Clones</div>
              <div className="text-2xl font-bold text-slate-900">{cloneDrives.length}</div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-slate-600">Active</div>
              <div className="text-2xl font-bold text-success">
                {cloneDrives.filter(c => c.status === 'active').length}
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-slate-600">Extracted</div>
              <div className="text-2xl font-bold text-info">
                {cloneDrives.filter(c => c.status === 'extracted').length}
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-slate-600">Total Size</div>
              <div className="text-2xl font-bold text-slate-900">
                {cloneDrives.reduce((sum, c) => sum + (c.image_size_gb || 0), 0).toFixed(0)} GB
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
