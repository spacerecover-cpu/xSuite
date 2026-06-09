import { useId, useState, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { getInventoryStatusTypes, type InventoryStatusType } from '../../lib/inventoryService';
import { logger } from '../../lib/logger';

interface DeleteInventoryConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  onChangeStatus: (statusId: string) => void;
  itemName: string;
}

export default function DeleteInventoryConfirmationModal({
  isOpen,
  onClose,
  onDelete,
  onChangeStatus,
  itemName,
}: DeleteInventoryConfirmationModalProps) {
  const [statusTypes, setStatusTypes] = useState<InventoryStatusType[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingStatusTypes, setLoadingStatusTypes] = useState(false);
  const statusSelectId = useId();

  useEffect(() => {
    if (isOpen) {
      loadStatusTypes();
    }
  }, [isOpen]);

  const loadStatusTypes = async () => {
    setLoadingStatusTypes(true);
    try {
      const types = await getInventoryStatusTypes();
      setStatusTypes(types || []);
      if (types && types.length > 0) {
        setSelectedStatusId(types[0].id);
      }
    } catch (error) {
      logger.error('Error loading status types:', error);
    } finally {
      setLoadingStatusTypes(false);
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedStatusId) return;

    setLoading(true);
    try {
      await onChangeStatus(selectedStatusId);
      onClose();
    } catch (error) {
      logger.error('Error changing status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      logger.error('Error deleting item:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="lg"
    >
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-danger-muted mb-4">
          <AlertTriangle className="h-8 w-8 text-danger" />
        </div>

        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Delete Inventory Item?
        </h3>

        <p className="text-gray-600 mb-6">
          Are you sure you want to delete <span className="font-semibold text-gray-900">"{itemName}"</span>?
        </p>

        <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-warning">
            <span className="font-semibold">Consider changing the status instead!</span>
            <br />
            Deleting this item will permanently remove it from the system. If you just want to mark it as unavailable, consider changing its status.
          </p>
        </div>

        {loadingStatusTypes ? (
          <div className="mb-6">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="mb-6">
            <label htmlFor={statusSelectId} className="block text-left text-sm font-medium text-gray-700 mb-2">
              Change Status To:
            </label>
            <select
              id={statusSelectId}
              value={selectedStatusId}
              onChange={(e) => setSelectedStatusId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-base"
              disabled={loading}
            >
              {statusTypes.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleChangeStatus}
            disabled={loading || !selectedStatusId || loadingStatusTypes}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 text-base font-medium"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Changing Status...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Change Status
              </>
            )}
          </Button>

          <Button
            onClick={handleDelete}
            disabled={loading || loadingStatusTypes}
            variant="danger"
            className="w-full bg-danger hover:bg-danger/90 text-danger-foreground py-3 text-base font-medium"
          >
            {loading ? (
              <>
                <Trash2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Permanently
              </>
            )}
          </Button>

          <Button
            onClick={onClose}
            disabled={loading}
            variant="secondary"
            className="w-full py-3 text-base font-medium"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
