import React from 'react';
import { Copy, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface DuplicateCaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  originalCaseNumber: string;
  customerName: string;
  serviceName: string;
  /** The job number reserved for the new case, shown before confirming. */
  newCaseNumber?: string | null;
  /** True while the new job number is still being reserved. */
  isGeneratingNumber?: boolean;
  isLoading?: boolean;
}

export const DuplicateCaseConfirmationModal: React.FC<DuplicateCaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  originalCaseNumber,
  customerName,
  serviceName,
  newCaseNumber,
  isGeneratingNumber = false,
  isLoading = false,
}) => {
  const canConfirm = !isLoading && !isGeneratingNumber && !!newCaseNumber;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Case Duplication"
      icon={Copy}
      size="sm"
    >
      <div className="mb-4 p-3 bg-info-muted border-l-4 border-info rounded">
        <div className="flex gap-2">
          <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
          <p className="text-sm text-info">
            This will create an exact copy of the case. The original case will not be changed.
          </p>
        </div>
      </div>

      {/* Prominent preview of the job number the new case will be assigned. */}
      <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Job Number</p>
        {isGeneratingNumber ? (
          <span className="mt-1.5 inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </span>
        ) : newCaseNumber ? (
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary">#{newCaseNumber}</p>
        ) : (
          <p className="mt-1.5 text-sm text-danger">
            Couldn't generate a job number. Please close and try again.
          </p>
        )}
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center py-2">
          <span className="text-sm font-medium text-slate-600">Original Job:</span>
          <span className="text-sm font-semibold text-slate-900">#{originalCaseNumber}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm font-medium text-slate-600">Customer:</span>
          <span className="text-sm font-semibold text-slate-900">{customerName}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm font-medium text-slate-600">Service:</span>
          <span className="text-sm font-semibold text-slate-900">{serviceName}</span>
        </div>
      </div>

      <div className="mb-5 p-3 bg-warning-muted border border-warning/30 rounded-lg">
        <div className="flex gap-2">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning">
            The new job will be set to 'Received' status and all devices will be marked as 'In Lab'.
          </p>
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
          disabled={!canConfirm}
          style={{ backgroundColor: 'rgb(var(--color-primary))' }}
          className="flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          {isLoading ? 'Duplicating...' : 'Confirm Duplicate'}
        </Button>
      </div>
    </Modal>
  );
};
