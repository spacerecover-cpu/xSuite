import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getCasesForAssignment,
  assignInventoryToCase,
  checkItemAvailability,
  type CaseOption,
} from '../../lib/inventoryCaseAssignmentService';
import { logger } from '../../lib/logger';

interface AssignToCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryItemId: string;
  inventoryItemName: string;
  onSuccess: () => void;
  deviceSpecs?: {
    brand?: string;
    model?: string;
    serial_number?: string;
    capacity?: string;
    firmware_version?: string;
    pcb_number?: string;
    dcm?: string;
    head_map?: string;
  };
}

export function AssignToCaseModal({
  isOpen,
  onClose,
  inventoryItemId,
  inventoryItemName,
  onSuccess,
  deviceSpecs,
}: AssignToCaseModalProps) {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCases();
      checkAvailability();
    } else {
      setSelectedCaseId('');
      setNotes('');
      setError(null);
      setShowNotes(false);
    }
  }, [isOpen, inventoryItemId]);

  const loadCases = async () => {
    try {
      setLoadingCases(true);
      const casesData = await getCasesForAssignment();
      setCases(casesData);
    } catch (err) {
      logger.error('Error loading cases:', err);
      setError('Failed to load cases. Please try again.');
    } finally {
      setLoadingCases(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const result = await checkItemAvailability(inventoryItemId);
      setAvailability(result);
    } catch (err) {
      logger.error('Error checking availability:', err);
    }
  };

  const handleAssign = async () => {
    if (!selectedCaseId) {
      setError('Please select a case');
      return;
    }

    if (availability && !availability.available) {
      setError(availability.reason || 'Item is not available for assignment');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await assignInventoryToCase(inventoryItemId, selectedCaseId, notes || undefined);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      logger.error('Error assigning to case:', err);
      setError(err instanceof Error ? err.message : 'Failed to assign item to case. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const caseOptions = cases.map((c) => ({
    id: c.id,
    name: `${c.case_no} - ${c.title}${c.customer_name ? ` (${c.customer_name})` : ''}`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={inventoryItemName}
      maxWidth="3xl"
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - Assignment Interface */}
        <div className="space-y-4">
          {/* Availability Status */}
          <div className="flex items-center space-x-2">
            {availability && !availability.available ? (
              <>
                <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                <span className="text-xs text-danger">Not Available</span>
              </>
            ) : availability && availability.available ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-xs text-success">Available</span>
              </>
            ) : (
              <div className="h-4"></div>
            )}
          </div>

          {availability && !availability.available && (
            <div className="bg-danger-muted border border-danger/30 rounded p-2">
              <p className="text-xs text-danger">{availability.reason}</p>
            </div>
          )}

          {/* Case Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Case <span className="text-danger">*</span>
            </label>
            <SearchableSelect
              label=""
              options={caseOptions}
              value={selectedCaseId}
              onChange={setSelectedCaseId}
              placeholder="Search cases..."
              disabled={loadingCases || (!!availability && !availability.available)}
            />
            {loadingCases && (
              <p className="text-xs text-slate-500 mt-1">Loading...</p>
            )}
          </div>

          {/* Optional Notes Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="flex items-center text-xs text-primary hover:text-primary/90"
            >
              {showNotes ? (
                <ChevronUp className="w-3 h-3 mr-1" />
              ) : (
                <ChevronDown className="w-3 h-3 mr-1" />
              )}
              {showNotes ? 'Hide' : 'Add'} Notes
            </button>

            {showNotes && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full mt-2 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Assignment notes..."
                disabled={loading || (!!availability && !availability.available)}
              />
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-danger-muted border border-danger/30 rounded p-2">
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={onClose}
              variant="secondary"
              size="sm"
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              size="sm"
              disabled={
                loading ||
                !selectedCaseId ||
                loadingCases ||
                (availability !== null && !availability.available)
              }
              className="flex-1"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </Button>
          </div>
        </div>

        {/* Right Column - Device Specifications */}
        <div className="border-l border-slate-200 pl-6">
          <h3 className="text-xs font-semibold text-slate-900 mb-3">Device Specifications</h3>
          <dl className="space-y-2">
            {deviceSpecs?.brand && (
              <div>
                <dt className="text-xs text-slate-500">Brand</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.brand}</dd>
              </div>
            )}
            {deviceSpecs?.model && (
              <div>
                <dt className="text-xs text-slate-500">Model</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.model}</dd>
              </div>
            )}
            {deviceSpecs?.serial_number && (
              <div>
                <dt className="text-xs text-slate-500">Serial Number</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.serial_number}</dd>
              </div>
            )}
            {deviceSpecs?.capacity && (
              <div>
                <dt className="text-xs text-slate-500">Capacity</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.capacity}</dd>
              </div>
            )}
            {deviceSpecs?.firmware_version && (
              <div>
                <dt className="text-xs text-slate-500">Firmware</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.firmware_version}</dd>
              </div>
            )}
            {deviceSpecs?.pcb_number && (
              <div>
                <dt className="text-xs text-slate-500">PCB Number</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.pcb_number}</dd>
              </div>
            )}
            {deviceSpecs?.dcm && (
              <div>
                <dt className="text-xs text-slate-500">DCM/MLC</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.dcm}</dd>
              </div>
            )}
            {deviceSpecs?.head_map && (
              <div>
                <dt className="text-xs text-slate-500">Head Map</dt>
                <dd className="text-xs font-medium text-slate-900 mt-0.5">{deviceSpecs.head_map}</dd>
              </div>
            )}
            {!deviceSpecs?.brand && !deviceSpecs?.model && !deviceSpecs?.serial_number && (
              <p className="text-xs text-slate-400 italic">No specifications available</p>
            )}
          </dl>
        </div>
      </div>
    </Modal>
  );
}
