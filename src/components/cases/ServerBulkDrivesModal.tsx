import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import {
  Plus,
  Trash2,
  Copy,
  CopyPlus,
  Zap,
  CheckCircle2,
  AlertCircle,
  Info,
  Keyboard,
  X
} from 'lucide-react';

interface BulkDriveRow {
  id: string;
  brand_id: string;
  serial_no: string;
  model: string;
  capacity_id: string;
  isValid: boolean;
}

interface ServerBulkDrivesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDrives: (drives: BulkDriveRow[]) => void;
  existingDrives?: BulkDriveRow[];
  defaultDeviceTypeId: string;
}

export const ServerBulkDrivesModal: React.FC<ServerBulkDrivesModalProps> = ({
  isOpen,
  onClose,
  onSaveDrives,
  existingDrives = [],
  defaultDeviceTypeId: _defaultDeviceTypeId,
}) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [drives, setDrives] = useState<BulkDriveRow[]>([]);
  const [smartFillEnabled, setSmartFillEnabled] = useState(true);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const serialInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_brands')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  const { data: capacities = [] } = useQuery({
    queryKey: ['capacities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_device_capacities')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      if (existingDrives.length > 0) {
        setDrives(existingDrives);
        setHasUnsavedChanges(false);
      } else {
        initializeDrives();
      }
    }
  }, [isOpen, existingDrives]);

  const initializeDrives = () => {
    const initialDrives: BulkDriveRow[] = Array.from({ length: 5 }, (_, index) => ({
      id: `drive-${Date.now()}-${index}`,
      brand_id: '',
      serial_no: '',
      model: '',
      capacity_id: '',
      isValid: false,
    }));
    setDrives(initialDrives);
    setHasUnsavedChanges(false);
  };

  const validateDrive = useCallback((drive: BulkDriveRow): boolean => {
    return !!(drive.brand_id && drive.serial_no && drive.capacity_id);
  }, []);

  const updateDrive = useCallback((id: string, field: keyof BulkDriveRow, value: string | boolean) => {
    setDrives((prevDrives) => {
      const updated = prevDrives.map((drive) => {
        if (drive.id === id) {
          const updatedDrive = { ...drive, [field]: value };
          updatedDrive.isValid = validateDrive(updatedDrive);
          return updatedDrive;
        }
        return drive;
      });
      return updated;
    });
    setHasUnsavedChanges(true);
  }, [validateDrive]);

  const addRows = useCallback((count: number) => {
    setDrives((prevDrives) => {
      const lastDrive = prevDrives[prevDrives.length - 1];
      const newDrives = Array.from({ length: count }, (_, index) => {
        const newDrive: BulkDriveRow = {
          id: `drive-${Date.now()}-${prevDrives.length + index}`,
          serial_no: '',
          model: '',
          brand_id: smartFillEnabled && lastDrive ? lastDrive.brand_id : '',
          capacity_id: smartFillEnabled && lastDrive ? lastDrive.capacity_id : '',
          isValid: false,
        };
        return newDrive;
      });
      return [...prevDrives, ...newDrives];
    });
    setHasUnsavedChanges(true);
  }, [smartFillEnabled]);

  const removeDrive = useCallback((id: string) => {
    setDrives((prevDrives) => prevDrives.filter((d) => d.id !== id));
    setHasUnsavedChanges(true);
  }, []);

  const copyRowDown = useCallback((fromIndex: number) => {
    setDrives((prevDrives) => {
      const sourceDrive = prevDrives[fromIndex];
      return prevDrives.map((drive, index) => {
        if (index > fromIndex) {
          return {
            ...drive,
            brand_id: sourceDrive.brand_id,
            model: sourceDrive.model,
            capacity_id: sourceDrive.capacity_id,
            isValid: validateDrive({
              ...drive,
              brand_id: sourceDrive.brand_id,
              model: sourceDrive.model,
              capacity_id: sourceDrive.capacity_id,
            }),
          };
        }
        return drive;
      });
    });
    setHasUnsavedChanges(true);
  }, [validateDrive]);

  const copyPreviousRow = useCallback((toIndex: number) => {
    if (toIndex === 0) return;
    setDrives((prevDrives) => {
      const previousDrive = prevDrives[toIndex - 1];
      const targetDrive = prevDrives[toIndex];
      const updated = [...prevDrives];
      updated[toIndex] = {
        ...targetDrive,
        brand_id: previousDrive.brand_id,
        model: previousDrive.model,
        capacity_id: previousDrive.capacity_id,
        isValid: validateDrive({
          ...targetDrive,
          brand_id: previousDrive.brand_id,
          model: previousDrive.model,
          capacity_id: previousDrive.capacity_id,
        }),
      };
      return updated;
    });
    setHasUnsavedChanges(true);
  }, [validateDrive]);

  const applyToAllEmpty = useCallback((sourceIndex: number) => {
    setDrives((prevDrives) => {
      const sourceDrive = prevDrives[sourceIndex];
      return prevDrives.map((drive, index) => {
        if (index !== sourceIndex && !drive.brand_id && !drive.capacity_id) {
          return {
            ...drive,
            brand_id: sourceDrive.brand_id,
            model: sourceDrive.model,
            capacity_id: sourceDrive.capacity_id,
            isValid: validateDrive({
              ...drive,
              brand_id: sourceDrive.brand_id,
              model: sourceDrive.model,
              capacity_id: sourceDrive.capacity_id,
            }),
          };
        }
        return drive;
      });
    });
    setHasUnsavedChanges(true);
  }, [validateDrive]);

  const duplicateDrive = useCallback((index: number) => {
    setDrives((prevDrives) => {
      const sourceDrive = prevDrives[index];
      const newDrive: BulkDriveRow = {
        id: `drive-${Date.now()}-duplicate`,
        brand_id: sourceDrive.brand_id,
        serial_no: '',
        model: sourceDrive.model,
        capacity_id: sourceDrive.capacity_id,
        isValid: false,
      };
      const updated = [...prevDrives];
      updated.splice(index + 1, 0, newDrive);
      return updated;
    });
    setHasUnsavedChanges(true);
  }, []);

  const validDrives = useMemo(() => drives.filter((d) => d.isValid), [drives]);
  const incompleteDrives = useMemo(() => drives.filter((d) => !d.isValid && (d.brand_id || d.serial_no || d.model || d.capacity_id)), [drives]);
  const emptyDrives = useMemo(() => drives.filter((d) => !d.brand_id && !d.serial_no && !d.model && !d.capacity_id), [drives]);

  const checkForDuplicateSerials = useMemo(() => {
    const serialNumbers = drives
      .map((d) => d.serial_no.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const duplicates = serialNumbers.filter((serial, index) => serialNumbers.indexOf(serial) !== index);
    return new Set(duplicates);
  }, [drives]);

  const handleSave = async () => {
    if (validDrives.length === 0) {
      toast.warning('Please add at least one complete drive before saving.');
      return;
    }

    if (incompleteDrives.length > 0) {
      const confirmed = await confirm({
        title: 'Incomplete Drives',
        message: `You have ${incompleteDrives.length} incomplete drive(s). Only ${validDrives.length} complete drive(s) will be saved. Continue?`,
        confirmLabel: 'Continue',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    if (checkForDuplicateSerials.size > 0) {
      const confirmed = await confirm({
        title: 'Duplicate Serial Numbers',
        message: `Warning: Duplicate serial numbers detected! This may indicate data entry errors. Continue anyway?`,
        confirmLabel: 'Continue Anyway',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    onSaveDrives(validDrives);
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to close?',
        confirmLabel: 'Close',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent, _driveId: string, field: string, index: number) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      if (field === 'capacity') {
        e.preventDefault();
        const nextIndex = index + 1;
        if (nextIndex < drives.length) {
          const nextBrandInput = document.getElementById(`brand-${drives[nextIndex].id}`)?.querySelector('input');
          if (nextBrandInput) {
            setTimeout(() => nextBrandInput.focus(), 0);
          }
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (index === drives.length - 1) {
        addRows(1);
        setTimeout(() => {
          const newDriveId = `drive-${Date.now()}-${drives.length}`;
          serialInputRefs.current[newDriveId]?.focus();
        }, 50);
      } else {
        serialInputRefs.current[drives[index + 1].id]?.focus();
      }
    } else if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      duplicateDrive(index);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Server Bulk Drive Entry" maxWidth="7xl">
        <div className="flex flex-col h-[80vh]">
          {showKeyboardShortcuts && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-slate-900">Keyboard Shortcuts</h4>
                <button onClick={() => setShowKeyboardShortcuts(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div><kbd className="px-2 py-1 bg-white border border-slate-300 rounded text-xs">Tab</kbd> - Next field</div>
                <div><kbd className="px-2 py-1 bg-white border border-slate-300 rounded text-xs">Enter</kbd> - Next row / Add row</div>
                <div><kbd className="px-2 py-1 bg-white border border-slate-300 rounded text-xs">Ctrl+D</kbd> - Duplicate row</div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="font-medium text-slate-700">
                    {validDrives.length} Complete
                  </span>
                </div>
                {incompleteDrives.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-warning" />
                    <span className="font-medium text-slate-700">
                      {incompleteDrives.length} Incomplete
                    </span>
                  </div>
                )}
                {emptyDrives.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      {emptyDrives.length} Empty
                    </span>
                  </div>
                )}
                <div className="border-l border-slate-300 pl-4 ml-4 flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smartFillEnabled}
                      onChange={(e) => setSmartFillEnabled(e.target.checked)}
                      className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                    />
                    <span className="text-slate-700 font-medium">
                      <Zap className="w-3.5 h-3.5 inline mr-1 text-primary" />
                      Smart Fill
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    Shortcuts
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => addRows(5)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add 5 Rows
                </Button>
                <Button variant="secondary" size="sm" onClick={() => addRows(10)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add 10 Rows
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 w-16">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Brand <span className="text-danger">*</span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Serial Number <span className="text-danger">*</span>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Model</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Capacity <span className="text-danger">*</span>
                  </th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drives.map((drive, index) => {
                  const hasDuplicateSerial = checkForDuplicateSerials.has(drive.serial_no.trim().toLowerCase());
                  const rowBgColor = drive.isValid
                    ? 'bg-success-muted'
                    : incompleteDrives.includes(drive)
                    ? 'bg-warning-muted'
                    : index % 2 === 0
                    ? 'bg-white'
                    : 'bg-slate-50';

                  return (
                    <tr
                      key={drive.id}
                      className={`border-b border-slate-200 hover:bg-primary/10 transition-colors ${rowBgColor}`}
                    >
                      <td className="px-3 py-2 text-slate-600 font-medium">{index + 1}</td>
                      <td className="px-3 py-2">
                        <div id={`brand-${drive.id}`}>
                          <SearchableSelect
                            label=""
                            value={drive.brand_id}
                            onChange={(value) => updateDrive(drive.id, 'brand_id', value)}
                            options={brands.map((b) => ({ id: b.id, name: b.name }))}
                            placeholder="Select brand..."
                            clearable={false}
                            usePortal={true}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          ref={(el) => {
                            serialInputRefs.current[drive.id] = el;
                          }}
                          type="text"
                          value={drive.serial_no}
                          onChange={(e) => updateDrive(drive.id, 'serial_no', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, drive.id, 'serial', index)}
                          placeholder="Enter S/N..."
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                            hasDuplicateSerial
                              ? 'border-danger bg-danger-muted'
                              : 'border-slate-300'
                          }`}
                        />
                        {hasDuplicateSerial && (
                          <p className="text-xs text-danger mt-1">Duplicate serial!</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={drive.model}
                          onChange={(e) => updateDrive(drive.id, 'model', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, drive.id, 'model', index)}
                          placeholder="Model..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div id={`capacity-${drive.id}`}>
                          <SearchableSelect
                            label=""
                            value={drive.capacity_id}
                            onChange={(value) => updateDrive(drive.id, 'capacity_id', value)}
                            options={capacities.map((c) => ({ id: c.id, name: c.name }))}
                            placeholder="Select capacity..."
                            clearable={false}
                            usePortal={true}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => copyPreviousRow(index)}
                              className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                              title="Copy from previous row"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyRowDown(index)}
                            className="p-1.5 text-info hover:bg-info-muted rounded transition-colors"
                            title="Copy to all rows below"
                          >
                            <CopyPlus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => applyToAllEmpty(index)}
                            className="p-1.5 text-success hover:bg-success-muted rounded transition-colors"
                            title="Apply to all empty rows"
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                          {drives.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDrive(drive.id)}
                              className="p-1.5 text-danger hover:bg-danger-muted rounded transition-colors"
                              title="Remove row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 mt-4">
            <div className="text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{drives.length}</span> rows |
              Valid: <span className="font-semibold text-success">{validDrives.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={handleClose}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={validDrives.length === 0}
                style={{ backgroundColor: 'rgb(var(--color-success))' }}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Add {validDrives.length} Drive{validDrives.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
