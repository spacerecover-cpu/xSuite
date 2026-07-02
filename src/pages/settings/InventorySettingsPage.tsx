import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2, Hash, Pencil, AlertCircle } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { HierarchicalLocationPicker } from '../../components/inventory/HierarchicalLocationPicker';
import { useInventoryDeviceTypes, useInventoryLocations } from '../../lib/inventory/inventoryCatalogQueries';
import type { InventoryDeviceType } from '../../lib/inventory/inventoryCatalogQueries';
import {
  useDeviceTypeSettings,
  setDeviceTypeDefaultLocation,
  deviceTypeSettingsQueryKey,
} from '../../lib/inventory/deviceTypeSettingsService';
import {
  useInventorySequences,
  updateInventorySequence,
  formatNextNumber,
  formatCurrentNumber,
  fetchMaxSuffixForPrefix,
  INVENTORY_SEQUENCES_QUERY_KEY,
} from '../../lib/inventory/inventorySequenceService';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type NumberSequenceRow = Database['public']['Tables']['number_sequences']['Row'];

const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

interface SequenceEditState {
  deviceType: InventoryDeviceType;
  sequence: NumberSequenceRow | null;
  prefix: string;
  padding: number;
  resetAnnually: boolean;
  /** The number the NEXT created item should receive (1-based). */
  nextNumber: number;
}

export default function InventorySettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const canEdit = MANAGER_ROLES.includes(profile?.role as typeof MANAGER_ROLES[number]);

  const { data: deviceTypes = [], isLoading: dtLoading } = useInventoryDeviceTypes();
  const { data: locations = [], isLoading: locLoading } = useInventoryLocations();
  const { data: settingsMap, isLoading: settingsLoading } = useDeviceTypeSettings();
  const { data: sequences = [], isLoading: seqLoading } = useInventorySequences();

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [editModal, setEditModal] = useState<SequenceEditState | null>(null);
  const [seqSaving, setSeqSaving] = useState(false);

  const isLoading = dtLoading || locLoading || settingsLoading;

  const handleLocationChange = async (deviceTypeId: string, locationId: string | null) => {
    setSaving(prev => ({ ...prev, [deviceTypeId]: true }));
    setSaved(prev => { const n = { ...prev }; delete n[deviceTypeId]; return n; });
    try {
      await setDeviceTypeDefaultLocation(deviceTypeId, locationId);
      await queryClient.invalidateQueries({ queryKey: deviceTypeSettingsQueryKey });
      setSaved(prev => ({ ...prev, [deviceTypeId]: true }));
      setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[deviceTypeId]; return n; }), 2000);
    } catch {
      toast.error('Failed to save default location.');
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[deviceTypeId]; return n; });
    }
  };

  const openSequenceEdit = (dt: InventoryDeviceType) => {
    const existing = sequences.find(s => s.scope === `inventory:${dt.id}`) ?? null;
    const defaultPrefix = dt.inventory_prefix ?? dt.name.replace(/\s+/g, '').toUpperCase().slice(0, 4);
    const defaultPadding = dt.inventory_padding ?? 4;
    setEditModal({
      deviceType: dt,
      sequence: existing,
      prefix: existing?.prefix ?? defaultPrefix,
      padding: existing?.padding ?? defaultPadding,
      resetAnnually: existing?.reset_annually ?? false,
      nextNumber: (existing?.current_value ?? 0) + 1,
    });
  };

  const handleSequenceSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setSeqSaving(true);
    try {
      await updateInventorySequence(
        editModal.deviceType.id,
        editModal.prefix,
        editModal.padding,
        editModal.resetAnnually,
        editModal.nextNumber,
      );
      await queryClient.invalidateQueries({ queryKey: INVENTORY_SEQUENCES_QUERY_KEY });
      toast.success('Inventory sequence updated.');
      setEditModal(null);
    } catch (err) {
      logger.error('Failed to update inventory sequence:', err);
      toast.error('Failed to update sequence.');
    } finally {
      setSeqSaving(false);
    }
  };

  const previewNext = editModal
    ? formatNextNumber(editModal.prefix || 'PREFIX', editModal.nextNumber - 1, editModal.padding)
    : '';

  // Highest suffix already used with this prefix — warns before re-issuing numbers.
  const { data: maxUsedSuffix = 0 } = useQuery({
    queryKey: ['inventory_prefix_max_suffix', editModal?.prefix ?? ''],
    queryFn: () => fetchMaxSuffixForPrefix(editModal?.prefix ?? ''),
    enabled: !!editModal && editModal.prefix.trim().length > 0,
    staleTime: 30_000,
  });
  const duplicateRisk = !!editModal && maxUsedSuffix > 0 && editModal.nextNumber <= maxUsedSuffix;

  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="inventory-settings" />
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Back to settings"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Default Locations Section */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">Device Type Default Locations</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Set the default storage location pre-filled when creating inventory items of each device type.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start gap-4 py-3 border-b border-border last:border-0">
                <Skeleton className="h-5 w-32" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-8 w-full max-w-xs" />
                  <Skeleton className="h-8 w-full max-w-xs" />
                </div>
              </div>
            ))}
          </div>
        ) : deviceTypes.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No device types configured.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {deviceTypes.map(dt => {
              const currentLocationId = settingsMap?.get(dt.id) ?? null;
              const isSaving = saving[dt.id] ?? false;
              const isSaved = saved[dt.id] ?? false;

              return (
                <div key={dt.id} className="rounded-lg border border-border bg-surface-muted p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{dt.name}</p>
                    {dt.family && (
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{dt.family}</span>
                    )}
                  </div>

                  <div>
                    {canEdit ? (
                      <>
                        <HierarchicalLocationPicker
                          value={currentLocationId}
                          onChange={id => handleLocationChange(dt.id, id)}
                          locations={locations}
                          placeholder="No default location"
                          disabled={isSaving}
                        />
                        <div className="mt-1 h-4 flex items-center gap-1.5">
                          {isSaving && (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-primary" />
                              <span className="text-xs text-slate-500">Saving…</span>
                            </>
                          )}
                          {isSaved && !isSaving && (
                            <>
                              <Check className="w-3 h-3 text-success" />
                              <span className="text-xs text-success">Saved</span>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">
                        {currentLocationId
                          ? locations.find(l => l.id === currentLocationId)?.name ?? '—'
                          : '—'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inventory Number Sequences Section */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
            <Hash className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Inventory Number Sequences</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Configure the prefix and padding for inventory item numbers per device type.
              Numbers are allocated atomically when items are created.
            </p>
          </div>
        </div>

        {seqLoading || dtLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : deviceTypes.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No device types configured.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {deviceTypes.map(dt => {
              const seq = sequences.find(s => s.scope === `inventory:${dt.id}`) ?? null;
              const effectivePrefix = seq?.prefix ?? dt.inventory_prefix ?? dt.name.replace(/\s+/g, '').toUpperCase().slice(0, 4);
              const effectivePadding = seq?.padding ?? dt.inventory_padding ?? 4;
              const currentValue = seq?.current_value ?? 0;
              const hasStarted = currentValue > 0;
              const isSeeded = seq !== null;

              return (
                <div key={dt.id} className="rounded-lg border border-border bg-surface-muted p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{dt.name}</p>
                      {dt.family && (
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">{dt.family}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSeeded ? (
                        hasStarted ? (
                          <Badge variant="info" size="sm">Active</Badge>
                        ) : (
                          <Badge variant="secondary" size="sm">Configured</Badge>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <AlertCircle className="w-3 h-3" />
                          Not started
                        </span>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => openSequenceEdit(dt)}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          aria-label={`Edit sequence for ${dt.name}`}
                          title={`Edit sequence for ${dt.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Next number</span>
                    <Badge variant="success" size="sm" className="font-mono">
                      {formatNextNumber(effectivePrefix, currentValue, effectivePadding)}
                    </Badge>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500 border-t border-border pt-2">
                    <span>Prefix <span className="block font-mono text-slate-700">{effectivePrefix}</span></span>
                    <span>Padding <span className="block font-mono text-slate-700">{effectivePadding}</span></span>
                    <span>Current <span className="block font-mono text-slate-700">
                      {hasStarted ? formatCurrentNumber(effectivePrefix, currentValue, effectivePadding) : '—'}
                    </span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Sequence Modal */}
      <Modal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        title={editModal ? `Edit Sequence — ${editModal.deviceType.name}` : ''}
      >
        {editModal && (
          <form onSubmit={handleSequenceSave} className="space-y-6">
            <div>
              <label htmlFor="seq-prefix" className="block text-sm font-semibold text-slate-700 mb-2">
                Prefix
              </label>
              <Input
                id="seq-prefix"
                value={editModal.prefix}
                onChange={e => setEditModal(prev => prev ? { ...prev, prefix: e.target.value.toUpperCase() } : prev)}
                placeholder="e.g. HDD"
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Appears before the number — e.g. <span className="font-semibold">HDD</span>-0001
              </p>
            </div>

            <div>
              <label htmlFor="seq-padding" className="block text-sm font-semibold text-slate-700 mb-2">
                Number Padding
              </label>
              <Input
                id="seq-padding"
                type="number"
                value={editModal.padding}
                onChange={e =>
                  setEditModal(prev =>
                    prev
                      ? { ...prev, padding: Math.max(1, Math.min(10, parseInt(e.target.value) || 4)) }
                      : prev,
                  )
                }
                min={1}
                max={10}
                className="font-mono"
              />
            </div>

            <div>
              <label htmlFor="seq-next" className="block text-sm font-semibold text-slate-700 mb-2">
                Next Number
              </label>
              <Input
                id="seq-next"
                type="number"
                value={editModal.nextNumber}
                onChange={e =>
                  setEditModal(prev =>
                    prev
                      ? { ...prev, nextNumber: Math.max(1, parseInt(e.target.value) || 1) }
                      : prev,
                  )
                }
                min={1}
                className="font-mono"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                The next item created will receive{' '}
                <span className="font-semibold font-mono">{previewNext}</span>. Use this to continue
                a legacy numbering scheme or re-anchor after an import.
              </p>
              {duplicateRisk && (
                <p className="mt-1.5 rounded-md bg-warning-muted px-2 py-1.5 text-xs text-warning">
                  Numbers up to{' '}
                  <span className="font-mono font-semibold">
                    {formatCurrentNumber(editModal.prefix, maxUsedSuffix, editModal.padding)}
                  </span>{' '}
                  already exist for this prefix — starting at {editModal.nextNumber} may create
                  duplicates. Suggested next: {maxUsedSuffix + 1}.
                </p>
              )}
            </div>

            {editModal.sequence && (
              <div className="rounded-lg bg-slate-50 border border-border p-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Last allocated:</span>{' '}
                {(editModal.sequence.current_value ?? 0) === 0
                  ? 'none yet'
                  : formatCurrentNumber(editModal.sequence.prefix ?? editModal.prefix, editModal.sequence.current_value ?? 0, editModal.sequence.padding ?? editModal.padding)}
                {' '}— counters advance atomically as items are created; adjust Next Number above to re-anchor.
              </div>
            )}

            {!editModal.sequence && (
              <div className="rounded-lg bg-info-muted border border-info/20 p-3 text-xs text-slate-600">
                No sequence row exists yet for this device type. Saving will create it. The first inventory item
                created for <span className="font-semibold">{editModal.deviceType.name}</span> will receive
                number <span className="font-mono font-semibold">{previewNext}</span>.
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="seq-reset"
                checked={editModal.resetAnnually}
                onChange={e => setEditModal(prev => prev ? { ...prev, resetAnnually: e.target.checked } : prev)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <label htmlFor="seq-reset" className="text-sm font-medium text-slate-700">
                Reset numbering annually
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditModal(null)}
                disabled={seqSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={seqSaving || !editModal.prefix.trim()}
              >
                {seqSaving ? 'Saving…' : 'Save Sequence'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
