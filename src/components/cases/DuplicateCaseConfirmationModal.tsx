import React from 'react';
import { Copy, AlertTriangle, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface DuplicateCaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  originalCaseNumber: string;
  customerName: string;
  serviceName: string;
  isLoading?: boolean;
}

export const DuplicateCaseConfirmationModal: React.FC<DuplicateCaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  originalCaseNumber,
  customerName,
  serviceName,
  isLoading = false,
}) => {
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
            This will create an exact copy of the case with a new job number. The original case will not be changed.
          </p>
        </div>
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
          disabled={isLoading}
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
