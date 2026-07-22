import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AlertCircle, Trash2 } from 'lucide-react';

interface DeleteCaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  caseNumber: string;
  caseTitle: string;
  isDeleting?: boolean;
}

export const DeleteCaseConfirmationModal: React.FC<DeleteCaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  caseNumber,
  caseTitle,
  isDeleting = false,
}) => {
  const [confirmText, setConfirmText] = useState('');

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  const handleConfirm = () => {
    onConfirm();
    setConfirmText('');
  };

  const isConfirmEnabled = confirmText === caseNumber && !isDeleting;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Case Permanently"
      icon={Trash2}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-danger-muted border border-danger/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-danger mb-1">Warning: This action cannot be undone</p>
            <p className="text-danger">This will permanently delete all associated data.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="mb-2">
            <span className="text-sm font-medium text-slate-700">Case:</span>
            <span className="ml-2 text-sm font-semibold text-slate-900">{caseNumber}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-slate-700">Title:</span>
            <span className="ml-2 text-sm text-slate-900">{caseTitle}</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-medium text-slate-700 mb-2">The following will be permanently deleted:</p>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• All devices and device information</li>
            <li>• All attachments and documents</li>
            <li>• All communications and notes</li>
            <li>• All quotes, invoices, and reports</li>
            <li>• Clone drives and inventory assignments</li>
            <li>• Complete case history</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Type <span className="font-semibold text-slate-900">{caseNumber}</span> to confirm
          </label>
          <Input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`Enter ${caseNumber}`}
            disabled={isDeleting}
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className="bg-danger hover:bg-danger/90 focus:ring-danger disabled:bg-danger/40"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Permanently
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
