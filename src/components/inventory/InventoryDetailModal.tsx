import { useState, useEffect } from 'react';
import { Edit, Package, MapPin, History, TrendingUp, Info, Briefcase, CheckCircle2, XCircle, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Skeleton } from '../ui/Skeleton';
import {
  getInventoryItemById,
  getInventoryStatusHistory,
  getInventoryTransactions,
} from '../../lib/inventoryService';
import {
  getInventoryItemAssignments,
  getActiveAssignment,
  getCasesForAssignment,
  assignInventoryToCase,
  checkItemAvailability,
  type AssignmentWithDetails,
  type CaseOption,
} from '../../lib/inventoryCaseAssignmentService';
import { MarkDefectiveModal } from './MarkDefectiveModal';
import { CompleteAssignmentModal } from './CompleteAssignmentModal';
import { AssignToCaseModal } from './AssignToCaseModal';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];

interface InventoryItemWithRelations extends InventoryItemRow {
  category?: { id: string; name: string; color_code: string } | null;
  status_type?: { id: string; name: string; color_code: string } | null;
  condition_type?: { id: string; rating: number; name: string; color_code: string } | null;
  brand?: { id: string; name: string } | null;
  capacity?: { id: string; name: string; gb_value: number | null } | null;
  storage_location?: { id: string; name: string } | null;
  interface?: { id: string; name: string } | null;
}

interface InventoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  onUpdate?: () => void;
  onEdit?: (itemId: string) => void;
}

export default function InventoryDetailModal({
  isOpen,
  onClose,
  itemId,
  onUpdate,
  onEdit,
}: InventoryDetailModalProps) {
  const [item, setItem] = useState<InventoryItemWithRelations | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<AssignmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDefectiveModal, setShowDefectiveModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showAssignToCaseModal, setShowAssignToCaseModal] = useState(false);

  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string } | null>(null);
  const [showAssignmentNotes, setShowAssignmentNotes] = useState(false);


  useEffect(() => {
    if (isOpen && itemId) {
      loadData();
    }
  }, [isOpen, itemId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedCaseId('');
      setAssignmentNotes('');
      setAssignmentError(null);
      setShowAssignmentNotes(false);
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemData, , , assignmentsData, activeAssignmentData, casesData, availabilityData] = await Promise.all([
        getInventoryItemById(itemId),
        getInventoryStatusHistory(itemId).catch(() => []),
        getInventoryTransactions(itemId).catch(() => []),
        getInventoryItemAssignments(itemId).catch(() => []),
        getActiveAssignment(itemId).catch(() => null),
        getCasesForAssignment().catch(() => []),
        checkItemAvailability(itemId).catch(() => ({ available: true })),
      ]);

      if (!itemData) {
        logger.error('Item not found');
        setLoading(false);
        return;
      }

      setItem(itemData as InventoryItemWithRelations);
      setAssignments(assignmentsData || []);
      setActiveAssignment(activeAssignmentData);
      setCases(casesData || []);
      setAvailability(availabilityData);
    } catch (error) {
      logger.error('Error loading inventory data:', error);
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading..." size="xl">
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Modal>
    );
  }

  if (!item) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Item Not Found" size="md">
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">Item not found</h3>
          <p className="mt-1 text-sm text-slate-500">
            The inventory item you're looking for doesn't exist.
          </p>
        </div>
      </Modal>
    );
  }

  const getItemDisplayName = (): string => {
    const parts: string[] = [];
    if (item.brand?.name) parts.push(item.brand.name);
    if (item.model) parts.push(item.model);
    return parts.join(' ') || item.name || 'Inventory Item';
  };

  const handleAssignToCase = async () => {
    if (!selectedCaseId) {
      setAssignmentError('Please select a case');
      return;
    }

    try {
      setAssignmentLoading(true);
      setAssignmentError(null);
      await assignInventoryToCase(itemId, selectedCaseId, assignmentNotes || undefined);
      await loadData();
      setSelectedCaseId('');
      setAssignmentNotes('');
      setShowAssignmentNotes(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: unknown) {
      logger.error('Error assigning to case:', err);
      setAssignmentError(err instanceof Error ? err.message : 'Failed to assign item to case');
    } finally {
      setAssignmentLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={getItemDisplayName()}
        maxWidth="4xl"
        headerAction={
          onEdit && (
            <Button onClick={() => onEdit(itemId)} variant="ghost" size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Assignment & Actions */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <Briefcase className="w-5 h-5 text-primary mr-2" />
                  <h3 className="text-sm font-semibold text-slate-900">Case Assignment</h3>
                </div>
                {activeAssignment && (
                  <Badge variant="info">
                    Assigned
                  </Badge>
                )}
              </div>

              {activeAssignment ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Case:</span>
                      <span className="ml-2 text-slate-900 font-semibold">
                        {activeAssignment.case?.case_no}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Title:</span>
                      <span className="ml-2 text-slate-900">
                        {activeAssignment.case?.title}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Assigned By:</span>
                      <span className="ml-2 text-slate-900">
                        {activeAssignment.assigned_by_profile?.full_name || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Date:</span>
                      <span className="ml-2 text-slate-900">
                        {format(new Date(activeAssignment.assigned_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>

                  {activeAssignment.notes && (
                    <div className="bg-slate-50 border border-slate-200 rounded p-2">
                      <p className="text-xs text-slate-600">{activeAssignment.notes}</p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      onClick={() => setShowDefectiveModal(true)}
                      variant="ghost"
                      size="sm"
                      className="flex-1 border-danger/30 text-danger hover:bg-danger-muted text-xs"
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Defective
                    </Button>
                    <Button
                      onClick={() => setShowCompleteModal(true)}
                      size="sm"
                      className="flex-1 bg-success hover:bg-success/90 text-success-foreground text-xs"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Working & Reuse
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {availability && !availability.available && (
                    <div className="bg-danger-muted border border-danger/30 rounded p-2">
                      <p className="text-xs text-danger">{availability.reason}</p>
                    </div>
                  )}

                  {item.is_donor && (!availability || availability.available) && (
                    <Button
                      onClick={() => setShowAssignToCaseModal(true)}
                      size="sm"
                      variant="accent"
                      className="w-full text-xs"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Assign Donor to Case
                    </Button>
                  )}

                  <div>
                    <SearchableSelect
                      label="Select Case"
                      required={true}
                      options={cases.map(c => ({
                        id: c.id,
                        name: `${c.case_no} - ${c.title}${c.customer_name ? ` (${c.customer_name})` : ''}`,
                      }))}
                      value={selectedCaseId}
                      onChange={setSelectedCaseId}
                      placeholder="Search cases..."
                      disabled={assignmentLoading}
                      emptyMessage="No active cases available"
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAssignmentNotes(!showAssignmentNotes)}
                      className="flex items-center text-xs text-primary hover:text-primary/90"
                    >
                      {showAssignmentNotes ? (
                        <ChevronUp className="w-3 h-3 mr-1" />
                      ) : (
                        <ChevronDown className="w-3 h-3 mr-1" />
                      )}
                      {showAssignmentNotes ? 'Hide' : 'Add'} Notes
                    </button>

                    {showAssignmentNotes && (
                      <textarea
                        value={assignmentNotes}
                        onChange={(e) => setAssignmentNotes(e.target.value)}
                        rows={2}
                        className="w-full mt-2 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Assignment notes..."
                        disabled={assignmentLoading}
                      />
                    )}
                  </div>

                  {assignmentError && (
                    <div className="bg-danger-muted border border-danger/30 rounded p-2">
                      <p className="text-xs text-danger">{assignmentError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleAssignToCase}
                    size="sm"
                    disabled={assignmentLoading || !selectedCaseId}
                    className="w-full text-xs"
                  >
                    {assignmentLoading ? 'Assigning...' : 'Assign to Case'}
                  </Button>
                </div>
              )}
            </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3">
              <div className="flex items-center space-x-2">
                <Package className="w-6 h-6 text-primary" />
                <div>
                  <p className="text-xs text-slate-500">Quantity</p>
                  <p className="text-lg font-bold text-slate-900">{item.quantity ?? 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-6 h-6 text-success" />
                <div>
                  <p className="text-xs text-slate-500">Min Quantity</p>
                  <p className="text-lg font-bold text-slate-900">{item.min_quantity ?? 0}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Location */}
          <Card className="p-3">
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-accent" />
              <div>
                <p className="text-xs text-slate-500">Storage Location</p>
                <p className="text-sm font-semibold text-slate-900">
                  {item.storage_location?.name || 'Not specified'}
                </p>
              </div>
            </div>
          </Card>

          {/* Assignment History */}
          {assignments.length > 0 && (
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <History className="w-4 h-4 text-slate-500 mr-1" />
                  <h3 className="text-xs font-semibold text-slate-900">History</h3>
                </div>
                <Badge variant="secondary" className="text-xs">{assignments.length}</Badge>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {assignments.slice(0, 3).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="p-2 bg-slate-50 rounded border border-slate-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-900">
                        {assignment.case?.case_no}
                      </span>
                      {assignment.usage_result && (
                        <Badge
                          variant={
                            assignment.usage_result === 'working'
                              ? 'success'
                              : assignment.usage_result === 'defective'
                              ? 'danger'
                              : 'default'
                          }
                          size="sm"
                          className="text-xxs px-1.5 py-0.5"
                        >
                          {assignment.usage_result}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {format(new Date(assignment.assigned_at), 'MMM d, yyyy')}
                    </p>
                    {assignment.usage_notes && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200">
                        <p className="text-xs text-slate-600 italic">
                          {assignment.usage_notes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
            </div>

          {/* Right Column - Device Specifications */}
          <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center mb-3">
                  <Info className="w-5 h-5 text-slate-500 mr-2" />
                  <h3 className="text-sm font-semibold text-slate-900">Device Specifications</h3>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {item.brand && (
                    <div>
                      <dt className="text-xs text-slate-500">Brand</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.brand.name}</dd>
                    </div>
                  )}
                  {item.model && (
                    <div>
                      <dt className="text-xs text-slate-500">Model</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.model}</dd>
                    </div>
                  )}
                  {item.serial_number && (
                    <div>
                      <dt className="text-xs text-slate-500">Serial Number</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.serial_number}</dd>
                    </div>
                  )}
                  {item.capacity && (
                    <div>
                      <dt className="text-xs text-slate-500">Capacity</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.capacity.name}</dd>
                    </div>
                  )}
                  {item.firmware_version && (
                    <div>
                      <dt className="text-xs text-slate-500">Firmware</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.firmware_version}</dd>
                    </div>
                  )}
                  {item.pcb_number && (
                    <div>
                      <dt className="text-xs text-slate-500">PCB Number</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.pcb_number}</dd>
                    </div>
                  )}
                  {item.head_map && (
                    <div>
                      <dt className="text-xs text-slate-500">Head Map</dt>
                      <dd className="text-xs font-medium text-slate-900 mt-0.5">{item.head_map}</dd>
                    </div>
                  )}
                </dl>
              </Card>

              {/* Additional Info */}
              <Card className="p-4">
                <div className="flex items-center mb-3">
                  <Package className="w-5 h-5 text-slate-500 mr-2" />
                  <h3 className="text-sm font-semibold text-slate-900">Item Details</h3>
                </div>

                <dl className="space-y-3">
                  {item.item_number && (
                    <div className="col-span-2 bg-info-muted border-2 border-info/30 rounded-lg p-3">
                      <dt className="text-xs font-semibold text-info uppercase tracking-wider mb-1.5">Inventory ID</dt>
                      <dd className="text-lg font-bold text-info font-mono tracking-wide">{item.item_number}</dd>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <dt className="text-xs text-slate-500">Status</dt>
                      <dd className="mt-0.5">
                        {item.status_type && (
                          <Badge
                            variant="default"
                            style={{ backgroundColor: item.status_type.color_code, color: '#fff', fontSize: '10px' }}
                          >
                            {item.status_type.name}
                          </Badge>
                        )}
                      </dd>
                    </div>
                    {item.condition_type && (
                      <div>
                        <dt className="text-xs text-slate-500">Condition</dt>
                        <dd className="mt-0.5">
                          <Badge
                            variant="default"
                            style={{ backgroundColor: item.condition_type.color_code, color: '#fff', fontSize: '10px' }}
                          >
                            {item.condition_type.name}
                          </Badge>
                        </dd>
                      </div>
                    )}
                    {item.purchase_date && (
                      <div>
                        <dt className="text-xs text-slate-500">Acquired On</dt>
                        <dd className="text-xs font-medium text-slate-900 mt-0.5">
                          {format(new Date(item.purchase_date), 'MMM d, yyyy')}
                        </dd>
                      </div>
                    )}
                  </div>
                </dl>
              </Card>
          </div>
        </div>
      </Modal>

      {showDefectiveModal && activeAssignment && (
        <MarkDefectiveModal
          isOpen={showDefectiveModal}
          onClose={() => setShowDefectiveModal(false)}
          assignment={activeAssignment}
          onSuccess={loadData}
        />
      )}

      {showCompleteModal && activeAssignment && (
        <CompleteAssignmentModal
          isOpen={showCompleteModal}
          onClose={() => setShowCompleteModal(false)}
          assignment={activeAssignment}
          onSuccess={loadData}
        />
      )}

      {showAssignToCaseModal && (
        <AssignToCaseModal
          isOpen={showAssignToCaseModal}
          onClose={() => setShowAssignToCaseModal(false)}
          inventoryItemId={itemId}
          inventoryItemName={getItemDisplayName()}
          onSuccess={() => {
            loadData();
            if (onUpdate) onUpdate();
          }}
          deviceSpecs={{
            brand: item.brand?.name,
            model: item.model ?? undefined,
            serial_number: item.serial_number ?? undefined,
            capacity: item.capacity?.name,
            firmware_version: item.firmware_version ?? undefined,
            pcb_number: item.pcb_number ?? undefined,
            head_map: item.head_map ?? undefined,
          }}
        />
      )}
    </>
  );
}
