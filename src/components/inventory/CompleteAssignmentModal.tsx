import { useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import {
  markAssignmentAsWorking,
  type AssignmentWithDetails,
} from '../../lib/inventoryCaseAssignmentService';
import { logger } from '../../lib/logger';

interface CompleteAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentWithDetails;
  onSuccess: () => void;
}

export function CompleteAssignmentModal({
  isOpen,
  onClose,
  assignment,
  onSuccess,
}: CompleteAssignmentModalProps) {
  const [usageNotes, setUsageNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usageNotesRef = useRef<HTMLTextAreaElement>(null);

  const handleReset = () => {
    setUsageNotes('');
    setError(null);
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      setError(null);
      await markAssignmentAsWorking(assignment.id, usageNotes || undefined);
      handleReset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      logger.error('Error completing assignment:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete assignment. Please try again.');
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Mark as Working & Free for Reuse"
      subtitle="Mark this donor as working and free it for reuse."
      icon={CheckCircle2}
      titleSize="sm"
      size="md"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={usageNotesRef}
    >
      <div className="space-y-5">
        <div className="bg-success-muted border border-success/30 rounded-lg p-2">
          <div className="flex items-start">
            <CheckCircle2 className="w-4 h-4 text-success mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-success mb-0.5">
                Mark Donor as Successfully Used
              </h4>
              <p className="text-xs text-success">
                This will mark the donor part as working and make it available for reuse on future cases.
                The item will be returned to available inventory with a "Previously Used" status.
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

        <Textarea
          ref={usageNotesRef}
          label="Performance Notes (Optional)"
          floatingLabel
          value={usageNotes}
          onChange={(e) => setUsageNotes(e.target.value)}
          rows={2}
          className="resize-none"
          placeholder="How did this donor perform? Any observations or recommendations for future use..."
          disabled={loading}
          hint="Document the donor's performance, compatibility notes, or any observations that may be useful for future assignments."
        />

        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-2">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="bg-info-muted border border-info/30 rounded-lg p-2">
          <div className="flex items-start">
            <RefreshCw className="w-4 h-4 text-info mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-info">
                <strong>Reuse Ready:</strong> This donor part performed successfully and will be marked as
                available for future data recovery cases. It will appear in the donor search with a
                "Previously Used" badge.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
          <Button
            onClick={handleClose}
            variant="secondary"
            size="sm"
            className="text-xs"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleComplete}
            size="sm"
            disabled={loading}
            className="bg-success hover:bg-success/90 text-success-foreground text-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark as Working & Free for Reuse
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
