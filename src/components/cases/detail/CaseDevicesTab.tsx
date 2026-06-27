import React, { useState } from 'react';
import { HardDrive, Grid2x2 as Grid, History, Clock, Eye, Package, SquarePen as Edit } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { DeviceRoleBadge } from '../../ui/DeviceRoleBadge';
import { getDeviceIconComponent } from '@/lib/deviceIconMapper';
import { formatDateTime } from '@/lib/format';
import { DeviceDetailsModal } from './DeviceDetailsModal';

type NamedUuidRef = { id: string; name: string } | null;
type NameOnlyRef = { name: string } | null;
type DeviceRoleRef = { id: number; name: string } | null;

export interface CaseDeviceWithEmbeds {
  id: string;
  model: string | null;
  serial_number: string | null;
  symptoms: string | null;
  notes: string | null;
  password: string | null;
  device_type_id: string | null;
  capacity_id: string | null;
  accessories: string[] | null;
  device_role_id: number | null;
  is_primary: boolean | null;
  role_notes: string | null;
  created_at: string;
  created_by: string | null;
  device_type: NamedUuidRef;
  brand: NameOnlyRef;
  capacity: NamedUuidRef;
  condition: NameOnlyRef;
  encryption_type: NameOnlyRef;
  device_role: DeviceRoleRef;
  created_by_profile?: { full_name: string | null } | null;
}

interface CaseDevicesTabProps {
  caseData: Record<string, unknown>;
  caseId: string;
  devices: CaseDeviceWithEmbeds[];
  onSetShowDeviceModal: (v: boolean) => void;
  onSetEditingDevice: (device: CaseDeviceWithEmbeds | null) => void;
}

export const CaseDevicesTab: React.FC<CaseDevicesTabProps> = ({
  caseId,
  devices,
  onSetShowDeviceModal,
  onSetEditingDevice,
}) => {
  const [details, setDetails] = useState<{ device: CaseDeviceWithEmbeds; index: number } | null>(null);
  const patientDevices = devices.filter(d => d.device_role?.name?.toLowerCase() === 'patient');
  const backupAndSupportDevices = devices.filter(d => {
    const roleName = d.device_role?.name?.toLowerCase();
    return roleName === 'backup' || roleName === 'donor';
  });

  const renderDeviceCard = (device: CaseDeviceWithEmbeds, idx: number) => {
    const DeviceIcon = getDeviceIconComponent(device.device_type?.name);
    return (
      <Card key={device.id}>
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
                <DeviceIcon className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <span className="truncate">Device {idx + 1}: {device.device_type?.name || 'Unknown Device Type'}</span>
              </h4>
              <p className="text-xs text-slate-600 truncate mb-0.5">{device.brand?.name} {device.model}</p>
              {device.serial_number && (
                <p className="text-xs text-slate-500 font-mono">S/N: {device.serial_number}</p>
              )}
            </div>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {device.is_primary && (
                <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">Primary</Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDetails({ device, index: idx })}
                className="!p-1.5"
                title="View details"
                aria-label="View device details"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onSetEditingDevice(device);
                  onSetShowDeviceModal(true);
                }}
                className="!p-1.5"
                title="Edit device"
                aria-label="Edit device"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <HardDrive className="w-6 h-6 text-warning" />
                Devices ({devices.length})
              </h2>
              <p className="text-sm text-slate-600 mt-1">Manage patient devices, backup devices, and donor parts</p>
            </div>
            <Button
              onClick={() => {
                onSetEditingDevice(null);
                onSetShowDeviceModal(true);
              }}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
              size="sm"
            >
              <HardDrive className="w-4 h-4 mr-2" />
              Add Device
            </Button>
          </div>
        </div>
      </Card>

      {devices.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p className="mb-4">No devices registered for this case</p>
            <Button
              onClick={() => {
                onSetEditingDevice(null);
                onSetShowDeviceModal(true);
              }}
              variant="secondary"
              size="sm"
            >
              <HardDrive className="w-4 h-4 mr-2" />
              Add Your First Device
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {/* Patient Devices */}
          <div className="flex flex-col space-y-4 flex-1 min-w-0">
            <Card className="bg-info-muted border-info/30 flex-shrink-0">
              <div className="p-3">
                <h3 className="text-base font-bold text-info flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-info" />
                  Patient Devices ({patientDevices.length})
                </h3>
                <p className="text-xs text-info mt-1">Primary devices requiring data recovery</p>
              </div>
            </Card>
            <div className="overflow-y-auto max-h-[calc(100vh-450px)] space-y-3 pr-1">
              {patientDevices.length === 0 ? (
                <Card>
                  <div className="p-4 text-center text-slate-500">
                    <HardDrive className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">No patient devices registered</p>
                  </div>
                </Card>
              ) : (
                patientDevices.map((device, idx) => renderDeviceCard(device, idx))
              )}
            </div>
          </div>

          {/* Backup & Support */}
          <div className="flex flex-col space-y-4 flex-1 min-w-0">
            <Card className="bg-success-muted border-success/30 flex-shrink-0">
              <div className="p-3">
                <h3 className="text-base font-bold text-success flex items-center gap-2">
                  <Grid className="w-4 h-4 text-success" />
                  Backup & Support ({backupAndSupportDevices.length})
                </h3>
                <p className="text-xs text-success mt-1">Backup devices and donor parts for recovery operations</p>
              </div>
            </Card>
            <div className="overflow-y-auto max-h-[calc(100vh-450px)] space-y-3 pr-1">
              {backupAndSupportDevices.length === 0 ? (
                <Card>
                  <div className="p-4 text-center text-slate-500">
                    <Grid className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">No backup or donor devices registered</p>
                  </div>
                </Card>
              ) : (
                backupAndSupportDevices.map((device, idx) => renderDeviceCard(device, idx))
              )}
            </div>
          </div>

          {/* Device History */}
          <div className="flex flex-col space-y-4 flex-1 min-w-0">
            <Card className="bg-slate-50 border-slate-200 flex-shrink-0">
              <div className="p-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-700" />
                  Device History ({devices.length})
                </h3>
                <p className="text-xs text-slate-600 mt-1">Chronological record of all device additions</p>
              </div>
            </Card>
            <Card className="overflow-y-auto max-h-[calc(100vh-450px)]">
              <div className="p-4">
                <div className="space-y-3">
                  {devices
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((device) => {
                      const DeviceIcon = getDeviceIconComponent(device.device_type?.name);
                      return (
                        <div key={device.id} className="flex items-start gap-3 pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                              <DeviceIcon className="w-4 h-4 text-slate-600" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <h4 className="font-semibold text-slate-900 text-sm truncate">
                                    {device.device_type?.name || 'Unknown Device Type'}
                                  </h4>
                                  {device.device_role && (
                                    <DeviceRoleBadge role={device.device_role.name} size="sm" />
                                  )}
                                  {device.is_primary && (
                                    <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">Primary</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 truncate">
                                  {device.brand?.name} {device.model}
                                  {device.serial_number && (
                                    <span className="ml-1.5 font-mono text-xs">S/N: {device.serial_number}</span>
                                  )}
                                </p>
                                <div className="mt-1 space-y-0.5">
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDateTime(device.created_at)}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Added by {device.created_by_profile?.full_name || 'System'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      <DeviceDetailsModal
        key={details?.device.id ?? 'none'}
        device={details?.device ?? null}
        deviceIndex={details?.index ?? 0}
        caseId={caseId}
        isOpen={!!details}
        onClose={() => setDetails(null)}
      />
    </div>
  );
};
