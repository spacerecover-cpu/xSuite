import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Package, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { Skeleton } from '../../components/ui/Skeleton';
import { HierarchicalLocationPicker } from '../../components/inventory/HierarchicalLocationPicker';
import { useInventoryDeviceTypes, useInventoryLocations } from '../../lib/inventory/inventoryCatalogQueries';
import {
  useDeviceTypeSettings,
  setDeviceTypeDefaultLocation,
  deviceTypeSettingsQueryKey,
} from '../../lib/inventory/deviceTypeSettingsService';

const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

export default function InventorySettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const canEdit = MANAGER_ROLES.includes(profile?.role as typeof MANAGER_ROLES[number]);

  const { data: deviceTypes = [], isLoading: dtLoading } = useInventoryDeviceTypes();
  const { data: locations = [], isLoading: locLoading } = useInventoryLocations();
  const { data: settingsMap, isLoading: settingsLoading } = useDeviceTypeSettings();

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

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

  return (
    <div className="min-h-screen">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Back to settings"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary shadow-md">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-0.5">Inventory Settings</h1>
            <p className="text-slate-600 text-sm">
              Configure default storage locations per device type.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
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
          <div className="divide-y divide-border">
            {deviceTypes.map(dt => {
              const currentLocationId = settingsMap?.get(dt.id) ?? null;
              const isSaving = saving[dt.id] ?? false;
              const isSaved = saved[dt.id] ?? false;

              return (
                <div key={dt.id} className="py-4 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="sm:w-48 shrink-0 pt-1">
                    <p className="text-sm font-medium text-slate-800">{dt.name}</p>
                    {dt.family && (
                      <p className="text-xs text-slate-400 capitalize">{dt.family}</p>
                    )}
                  </div>

                  <div className="flex-1 max-w-sm">
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
    </div>
  );
}
