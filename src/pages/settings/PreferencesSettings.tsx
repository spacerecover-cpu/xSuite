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
import {
  DEFAULT_LABEL_PRINTING_PREFS,
  getLabelPrintingPrefs,
  setLabelPrintingPrefs,
  type LabelEntity,
  type LabelPrintingPrefs,
} from '../../lib/labelPrefsService';
import { LABEL_SIZE_PRESETS } from '../../lib/pdf/labels/labelSizes';

const LABEL_ENTITIES: Array<{ key: LabelEntity; label: string; hint: string }> = [
  { key: 'case', label: 'Case labels', hint: 'One label per device at intake' },
  { key: 'inventory', label: 'Inventory labels', hint: 'Donor drives, parts and assets' },
  { key: 'stock', label: 'Stock labels', hint: 'Consumables and sale items' },
];

/**
 * Tenant-wide device-label printing: default label stock per entity and the
 * Direct Print toggle (label goes straight to the print dialog on creation).
 */
const LabelPrintingCard: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: prefs, isLoading } = useQuery({
    queryKey: settingsKeys.labelPrinting(),
    queryFn: getLabelPrintingPrefs,
  });
  const [isSaving, setIsSaving] = useState(false);
  const effective = prefs ?? DEFAULT_LABEL_PRINTING_PREFS;

  const save = async (next: LabelPrintingPrefs, successMessage: string) => {
    if (isSaving) return;
    const previous = prefs ?? null;
    setIsSaving(true);
    queryClient.setQueryData(settingsKeys.labelPrinting(), next);
    try {
      await setLabelPrintingPrefs(next);
      toast.success(successMessage);
    } catch (error) {
      queryClient.setQueryData(settingsKeys.labelPrinting(), previous);
      toast.error((error as Error).message || 'Failed to save label printing settings');
    } finally {
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: settingsKeys.labelPrinting() });
    }
  };

  const handleSizeChange = (entity: LabelEntity, sizeId: string) => {
    const preset = LABEL_SIZE_PRESETS.find((p) => p.id === sizeId);
    void save(
      { ...effective, sizes: { ...effective.sizes, [entity]: sizeId } },
      `${LABEL_ENTITIES.find((e) => e.key === entity)?.label} now print at ${preset?.name ?? sizeId}`,
    );
  };

  const handleAutoPrintToggle = (entity: LabelEntity) => {
    const next = !effective.autoPrint[entity];
    void save(
      { ...effective, autoPrint: { ...effective.autoPrint, [entity]: next } },
      next
        ? `${LABEL_ENTITIES.find((e) => e.key === entity)?.label} will print automatically on creation`
        : 'Automatic label printing disabled',
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
      <h2 className="text-base font-semibold text-slate-900">Device label printing</h2>
      <p className="mt-1 text-sm text-slate-500">
        Adhesive labels for drives, devices and parts. Pick the label stock loaded in your thermal
        printer — the PDF page is sized exactly to the label, so print at 100% scale. Auto-print
        sends the label straight to the print dialog the moment a case, inventory item or stock
        item is created.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading current setting…
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {LABEL_ENTITIES.map(({ key, label, hint }) => (
            <div key={key} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
              <div className="w-44 min-w-0">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{hint}</p>
              </div>
              <select
                value={effective.sizes[key]}
                onChange={(e) => handleSizeChange(key, e.target.value)}
                disabled={isSaving}
                aria-label={`Label size for ${label.toLowerCase()}`}
                className="h-11 flex-1 min-w-[14rem] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              >
                {LABEL_SIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} — {preset.printers}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <button
                  type="button"
                  role="switch"
                  aria-checked={effective.autoPrint[key]}
                  aria-label={`Print ${label.toLowerCase()} automatically on creation`}
                  onClick={() => handleAutoPrintToggle(key)}
                  disabled={isSaving}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                    effective.autoPrint[key] ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      effective.autoPrint[key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                Auto-print
              </label>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        The browser print dialog opens with the label ready — set your label printer as the default
        for one-touch printing (or run Chrome in kiosk-printing mode to skip the dialog entirely).
      </p>
    </div>
  );
};

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

      <LabelPrintingCard />

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
