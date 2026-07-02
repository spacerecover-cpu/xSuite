import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useToast } from '../../hooks/useToast';
import { settingsKeys } from '../../lib/queryKeys';
import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZE_OPTIONS,
  getTenantListPageSize,
  getTenantListSelectionEnabled,
  setTenantListPageSize,
  setTenantListSelectionEnabled,
} from '../../lib/tablePrefsService';

/**
 * Workspace display preferences, applied to every user in the tenant:
 * rows per page on all list tables + bulk-selection checkbox visibility.
 */
export const PreferencesSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: tenantPageSize, isLoading: isPageSizeLoading } = useQuery({
    queryKey: settingsKeys.listPageSize(),
    queryFn: async () => (await getTenantListPageSize()) ?? null,
  });
  const [savingPageSize, setSavingPageSize] = useState<number | null>(null);
  const effectivePageSize = tenantPageSize ?? DEFAULT_LIST_PAGE_SIZE;

  const handleSelectPageSize = async (size: number) => {
    if (size === effectivePageSize || savingPageSize !== null) return;
    const previous = tenantPageSize ?? null;
    setSavingPageSize(size);
    // Optimistic: every open list refetches at the new size immediately.
    queryClient.setQueryData(settingsKeys.listPageSize(), size);
    try {
      await setTenantListPageSize(size);
      toast.success(`Lists now show ${size} rows per page for all users`);
    } catch (error) {
      queryClient.setQueryData(settingsKeys.listPageSize(), previous);
      toast.error((error as Error).message || 'Failed to save rows per page');
    } finally {
      setSavingPageSize(null);
      queryClient.invalidateQueries({ queryKey: settingsKeys.listPageSize() });
    }
  };

  const { data: selectionEnabled, isLoading: isSelectionLoading } = useQuery({
    queryKey: settingsKeys.listSelection(),
    queryFn: async () => (await getTenantListSelectionEnabled()) ?? null,
  });
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const effectiveSelection = selectionEnabled ?? true;

  const handleToggleSelection = async () => {
    if (isSavingSelection) return;
    const next = !effectiveSelection;
    const previous = selectionEnabled ?? null;
    setIsSavingSelection(true);
    queryClient.setQueryData(settingsKeys.listSelection(), next);
    try {
      await setTenantListSelectionEnabled(next);
      toast.success(
        next
          ? 'Selection checkboxes are now visible on list tables'
          : 'Selection checkboxes are now hidden on list tables',
      );
    } catch (error) {
      queryClient.setQueryData(settingsKeys.listSelection(), previous);
      toast.error((error as Error).message || 'Failed to save checkbox preference');
    } finally {
      setIsSavingSelection(false);
      queryClient.invalidateQueries({ queryKey: settingsKeys.listSelection() });
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <SettingsPageHeader categoryId="preferences" />
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to Settings</span>
      </button>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-900">Rows per page</h2>
        <p className="mt-1 text-sm text-slate-500">
          How many rows every list shows per page — cases, invoices, quotes, payments, customers,
          stock and more. Applies to all users in your workspace.
        </p>
        {isPageSizeLoading ? (
          <div className="flex items-center gap-2 py-4 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading current setting…
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Rows per page">
            {LIST_PAGE_SIZE_OPTIONS.map((size) => {
              const active = effectivePageSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleSelectPageSize(size)}
                  disabled={savingPageSize !== null}
                  aria-pressed={active}
                  className={`h-11 min-w-[4.5rem] rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {savingPageSize === size ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <>{size} rows</>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Selection checkboxes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Show a checkbox on each row for bulk actions (archive, export) on cases, invoices,
              quotes, customers and expenses. Hide them for a cleaner, read-focused layout.
            </p>
          </div>
          {isSelectionLoading ? (
            <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-slate-400" aria-hidden="true" />
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={effectiveSelection}
              aria-label="Show selection checkboxes on list tables"
              onClick={handleToggleSelection}
              disabled={isSavingSelection}
              className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                effectiveSelection ? 'bg-primary' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  effectiveSelection ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {effectiveSelection
            ? 'Checkboxes are visible — users can select rows for bulk actions.'
            : 'Checkboxes are hidden — bulk actions are unavailable until re-enabled.'}
        </p>
      </div>
    </div>
  );
};
