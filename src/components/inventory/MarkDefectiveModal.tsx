import { useId, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AlertTriangle, XCircle } from 'lucide-react';
import {
  markAssignmentAsDefective,
  type AssignmentWithDetails,
} from '../../lib/inventoryCaseAssignmentService';
import { logger } from '../../lib/logger';

interface MarkDefectiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentWithDetails;
  onSuccess: () => void;
}

export function MarkDefectiveModal({
  isOpen,
  onClose,
  assignment,
  onSuccess,
}: MarkDefectiveModalProps) {
  const [defectReason, setDefectReason] = useState('');
  const [usageNotes, setUsageNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defectReasonRef = useRef<HTMLInputElement>(null);
  const defectReasonId = useId();
  const usageNotesId = useId();

  const handleReset = () => {
    setDefectReason('');
    setUsageNotes('');
    setError(null);
  };

  const handleMarkDefective = async () => {
    if (!defectReason.trim()) {
      setError('Please provide a reason for the defect');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await markAssignmentAsDefective(assignment.id, defectReason, usageNotes || undefined);
      handleReset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      logger.error('Error marking as defective:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark item as defective. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      handleReset();
      onClose();
    }
  };

  const commonDefectReasons = [
    'Heads failed during recovery',
    'PCB not compatible',
    'Motor seized/failed',
    'Firmware incompatible',
    'Physical damage discovered',
    'Read/write errors',
    'Clicking/grinding sounds',
    'Not detected by PC-3000',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Mark as Defective"
      size="md"
      initialFocusRef={defectReasonRef}
    >
      <div className="space-y-2">
        <div className="bg-danger-muted border border-danger/30 rounded-lg p-2">
          <div className="flex items-start">
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-danger mb-0.5">
                Mark Donor as Defective
              </h4>
              <p className="text-xs text-danger">
                This will mark the donor part as defective and remove it from available inventory.
                Both the status and condition will be automatically updated to reflect the failure.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
          <h4 className="text-xs font-semibold text-slate-900">Assignment Details</h4>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div>
              <span className="text-slate-600">Case:</span>
              <span className="ml-2 font-medium text-slate-900">
                {assignment.case?.case_no}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Inventory Item:</span>
              <span className="ml-2 font-medium text-slate-900">
                {assignment.inventory_item?.inventory_code || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Model:</span>
              <span className="ml-2 font-medium text-slate-900">
                {assignment.inventory_item?.brand?.name} {assignment.inventory_item?.model}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Serial:</span>
              <span className="ml-2 font-medium text-slate-900">
                {assignment.inventory_item?.serial_number || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor={defectReasonId} className="block text-xs font-medium text-slate-700 mb-1">
            Defect Reason <span className="text-danger">*</span>
          </label>
          <Input
            id={defectReasonId}
            ref={defectReasonRef}
            type="text"
            value={defectReason}
            onChange={(e) => setDefectReason(e.target.value)}
            placeholder="E.g., Heads failed during recovery"
            disabled={loading}
            className="text-xs"
          />
          <p className="text-xs text-slate-500 mt-0.5">
            Describe what went wrong with this donor part.
          </p>

          {commonDefectReasons.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs font-medium text-slate-700 mb-1">Quick select:</p>
              <div className="flex flex-wrap gap-1">
                {commonDefectReasons.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setDefectReason(reason)}
                    className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                    disabled={loading}
                    type="button"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor={usageNotesId} className="block text-xs font-medium text-slate-700 mb-1">
            Additional Notes (Optional)
          </label>
          <textarea
            id={usageNotesId}
            value={usageNotes}
            onChange={(e) => setUsageNotes(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-xs"
            placeholder="Provide additional details about the failure, diagnostic results, or any other relevant information..."
            disabled={loading}
          />
          <p className="text-xs text-slate-500 mt-0.5">
            Include any diagnostic results, symptoms observed, or troubleshooting steps taken.
          </p>
        </div>

        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-2">
            <div className="flex items-center">
              <XCircle className="w-4 h-4 text-danger mr-2" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-warning-muted border border-warning/30 rounded-lg p-2">
          <p className="text-xs text-warning">
            <strong>Automatic Updates:</strong> This action will:
          </p>
          <ul className="text-xs text-warning mt-1 ml-4 space-y-0.5 list-disc">
            <li>Update the inventory status to <strong>"Defective"</strong></li>
            <li>Update the condition to <strong>"Damaged"</strong></li>
            <li>Remove the item from available inventory</li>
            <li>Log both changes in the item history</li>
          </ul>
          <p className="text-xs text-warning mt-1.5">
            The item will no longer be available for assignment until its status is manually changed.
          </p>
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMarkDefective}
            disabled={loading || !defectReason.trim()}
            className="bg-danger hover:bg-danger/90 text-danger-foreground"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Marking as Defective...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Mark as Defective
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
