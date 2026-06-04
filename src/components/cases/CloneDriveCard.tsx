import React from 'react';
import { formatDate } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Copy,
  HardDrive,
  MapPin,
  Calendar,
  User,
  FolderOpen,
  CheckCircle2,
  Archive,
  Trash2,
  Eye,
  Clock,
  PackageOpen,
} from 'lucide-react';

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
  storage_type?: string;
  physical_location_id?: string;
  physical_location_name?: string;
  image_format?: string;
  image_size_gb?: number;
  expected_size_gb?: number;
  clone_date: string;
  cloned_by_name?: string;
  status: string;
  delivered_date?: string;
  delivered_by_name?: string;
  delivery_notes?: string;
  retention_deadline?: string;
  retention_days?: number;
  extracted_date?: string;
  archived_date?: string;
  preserve_reason?: string;
  notes?: string;
  resource_clone_drive?: {
    clone_id: string;
    brand: string;
    model: string;
    capacity: string;
    serial_number: string;
    drive_type: string;
    interface_type: string;
  };
}

interface CloneDriveCardProps {
  clone: CloneDrive;
  caseNo?: string;
  patientDeviceName?: string;
  onView?: (clone: CloneDrive) => void;
  onMarkAsDelivered?: (clone: CloneDrive) => void;
  onPreserve?: (clone: CloneDrive) => void;
  onExtract?: (clone: CloneDrive) => void;
  onArchive?: (clone: CloneDrive) => void;
  onDelete?: (clone: CloneDrive) => void;
}

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'custom';

const statusConfig: Record<string, { label: string; color: BadgeVariant }> = {
  active: { label: 'Active', color: 'info' },
  delivered: { label: 'Delivered', color: 'success' },
  extractable: { label: 'Extractable', color: 'warning' },
  extracted: { label: 'Extracted', color: 'info' },
  preserved: { label: 'Preserved', color: 'info' },
  archived: { label: 'Archived', color: 'secondary' },
  overwritten: { label: 'Overwritten', color: 'warning' },
  failed: { label: 'Failed', color: 'danger' },
  deleted: { label: 'Deleted', color: 'danger' },
};

export const CloneDriveCard: React.FC<CloneDriveCardProps> = ({
  clone,
  caseNo,
  patientDeviceName,
  onView,
  onMarkAsDelivered,
  onPreserve,
  onExtract,
  onArchive,
  onDelete,
}) => {
  const statusInfo = statusConfig[clone.status] || statusConfig.active;

  const calculateAge = () => {
    const now = new Date();
    const cloneDate = new Date(clone.clone_date);
    const diffTime = Math.abs(now.getTime() - cloneDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const calculateRetentionStatus = () => {
    if (!clone.retention_deadline || clone.status !== 'delivered') return null;

    const now = new Date();
    const deadline = new Date(clone.retention_deadline);
    const diffTime = deadline.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      daysRemaining,
      isOverdue: daysRemaining < 0,
      isWarning: daysRemaining >= 0 && daysRemaining <= 3,
      isSafe: daysRemaining > 3
    };
  };

  const ageDays = calculateAge();
  const retentionStatus = calculateRetentionStatus();
  const isOld = ageDays > 180;
  const isExtractable =
    clone.status === 'delivered' && retentionStatus !== null && retentionStatus.daysRemaining <= 0;
  const canArchive =
    clone.status === 'extracted' || clone.status === 'preserved' || clone.status === 'failed';

  const displayBrand = clone.resource_clone_drive?.brand || clone.physical_drive_brand || 'Unknown';
  const displayModel = clone.resource_clone_drive?.model || clone.physical_drive_model || '';
  const displayCapacity = clone.resource_clone_drive?.capacity || clone.physical_drive_capacity || '';
  const displaySerial = clone.resource_clone_drive?.serial_number || clone.physical_drive_serial || '';
  const cloneId = clone.resource_clone_drive?.clone_id;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
            <Copy className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Clone #{caseNo || clone.id.slice(0, 8)}
            </h3>
            {patientDeviceName && (
              <p className="text-sm text-slate-600">{patientDeviceName}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
          {isOld && clone.status === 'active' && (
            <span className="text-xs text-warning font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Old Clone
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {/* Clone Disk ID - Prominently displayed */}
        {cloneId && (
          <div className="flex items-start gap-2 text-sm bg-info-muted border border-info/30 rounded-lg p-3">
            <HardDrive className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-info font-medium">Clone Disk ID:</span>
              <div className="text-info font-bold font-mono text-base mt-0.5">
                {cloneId}
              </div>
            </div>
          </div>
        )}

        {/* Physical Drive Info */}
        {(displaySerial || displayBrand !== 'Unknown') && (
          <div className="flex items-start gap-2 text-sm">
            <HardDrive className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-slate-600">Physical Drive:</span>
              <div className="text-slate-900 font-medium">
                {displayBrand} {displayModel}
                {displayCapacity && ` (${displayCapacity})`}
              </div>
              {displaySerial && (
                <div className="text-slate-500 text-xs">SN: {displaySerial}</div>
              )}
            </div>
          </div>
        )}

        {/* Storage Path */}
        <div className="flex items-start gap-2 text-sm">
          <FolderOpen className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-slate-600">Storage Path:</span>
            <div className="text-slate-900 font-mono text-xs break-all bg-slate-50 p-1.5 rounded mt-1">
              {clone.storage_server && (
                <span className="text-primary font-semibold">{clone.storage_server}:</span>
              )}
              {clone.storage_path}
            </div>
          </div>
        </div>

        {/* Physical Location */}
        {clone.physical_location_name && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <span className="text-slate-600">Physical Location:</span>
              <span className="text-slate-900 ml-1">{clone.physical_location_name}</span>
            </div>
          </div>
        )}

        {/* Image Info */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-slate-600">Format:</span>
            <span className="text-slate-900 font-medium uppercase">
              {clone.image_format || 'dd'}
            </span>
          </div>
          {clone.image_size_gb && clone.image_size_gb > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-600">Size:</span>
              <span className="text-slate-900 font-medium">
                {clone.image_size_gb} GB
              </span>
            </div>
          )}
        </div>

        {/* Clone Date and Technician */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">{formatDate(clone.clone_date)}</span>
            <span className="text-slate-400">({ageDays}d ago)</span>
          </div>
          {clone.cloned_by_name && (
            <div className="flex items-center gap-1">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{clone.cloned_by_name}</span>
            </div>
          )}
        </div>

        {/* Delivered Date */}
        {clone.delivered_date && (
          <div className="flex items-center gap-2 text-sm text-success bg-success-muted p-2 rounded">
            <CheckCircle2 className="w-4 h-4" />
            <div className="flex-1">
              <div>Delivered on {formatDate(clone.delivered_date)}</div>
              {clone.delivered_by_name && (
                <div className="text-xs text-success">by {clone.delivered_by_name}</div>
              )}
              {clone.delivery_notes && (
                <div className="text-xs text-success mt-0.5 italic">{clone.delivery_notes}</div>
              )}
            </div>
          </div>
        )}

        {/* Extracted Date */}
        {clone.extracted_date && (
          <div className="flex items-center gap-2 text-sm text-info bg-info-muted p-2 rounded">
            <PackageOpen className="w-4 h-4" />
            <span>Extracted on {formatDate(clone.extracted_date)}</span>
          </div>
        )}

        {/* Archived Date */}
        {clone.archived_date && (
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 p-2 rounded">
            <Archive className="w-4 h-4" />
            <span>Archived on {formatDate(clone.archived_date)}</span>
          </div>
        )}

        {/* Retention Status */}
        {retentionStatus && clone.status === 'delivered' && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded ${
            retentionStatus.isOverdue
              ? 'bg-warning-muted text-warning'
              : retentionStatus.isWarning
              ? 'bg-warning-muted text-warning'
              : 'bg-info-muted text-info'
          }`}>
            <Clock className="w-4 h-4" />
            <span>
              {retentionStatus.isOverdue
                ? `Retention expired ${Math.abs(retentionStatus.daysRemaining)} day${Math.abs(retentionStatus.daysRemaining) !== 1 ? 's' : ''} ago — ready to extract`
                : retentionStatus.daysRemaining === 0
                ? 'Retention ends today'
                : `Retention ends in ${retentionStatus.daysRemaining} day${retentionStatus.daysRemaining !== 1 ? 's' : ''}`
              }
            </span>
          </div>
        )}

        {/* Preservation Reason */}
        {clone.preserve_reason && clone.status === 'preserved' && (
          <div className="text-sm text-primary bg-primary/10 p-2 rounded border border-primary/20">
            <span className="font-medium">Preserved:</span> {clone.preserve_reason}
          </div>
        )}

        {/* Notes */}
        {clone.notes && (
          <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
            <span className="font-medium">Notes:</span> {clone.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-slate-100 flex-wrap">
        {onView && (
          <Button size="sm" variant="secondary" onClick={() => onView(clone)}>
            <Eye className="w-4 h-4" />
            View
          </Button>
        )}
        {onMarkAsDelivered && clone.status === 'active' && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onMarkAsDelivered(clone)}
            style={{ backgroundColor: 'rgb(var(--color-success))' }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark as Delivered
          </Button>
        )}
        {onExtract && isExtractable && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onExtract(clone)}
            style={{ backgroundColor: 'rgb(var(--color-info))' }}
          >
            <PackageOpen className="w-4 h-4" />
            Extract
          </Button>
        )}
        {onPreserve && (clone.status === 'active' || clone.status === 'delivered') && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPreserve(clone)}
            style={{ color: 'rgb(var(--color-primary))', borderColor: 'rgb(var(--color-primary))' }}
          >
            <Archive className="w-4 h-4" />
            Preserve
          </Button>
        )}
        {onArchive && canArchive && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onArchive(clone)}
          >
            <Archive className="w-4 h-4" />
            Archive
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="danger" onClick={() => onDelete(clone)}>
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};
