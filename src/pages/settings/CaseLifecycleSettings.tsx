import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import {
  CASE_STATUS_TYPES,
  STATUS_TYPE_LABELS,
  type CaseStatusType,
} from '../../lib/caseLifecycle';
import {
  getTenantCaseStatusTypes,
  setTenantCaseStatusTypes,
} from '../../lib/caseLifecycleService';
import { CASE_COMMAND_STATS_KEY } from '../../hooks/useCaseCommandStats';

/**
 * Map the tenant's case statuses (including imported legacy names) onto the
 * platform lifecycle types so command-center buckets, dashboards and reports
 * count them correctly. Platform-vocabulary statuses come pre-classified;
 * overrides are stored per tenant in company_settings.metadata.
 */
export const CaseLifecycleSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: statusCounts = [], isLoading: countsLoading } = useQuery({
    queryKey: ['case_status_counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_case_status_counts');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: masterRows = [], isLoading: masterLoading } = useQuery({
    queryKey: ['case_statuses_master'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('name, type')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ['case_status_type_overrides'],
    queryFn: async () => (await getTenantCaseStatusTypes()) ?? {},
  });

  const masterTypeByName = useMemo(
    () => new Map(masterRows.map((r) => [r.name, r.type])),
    [masterRows],
  );

  const rows = useMemo(
    () =>
      [...statusCounts]
        .filter((s): s is { status: string; total: number } => s.status !== null)
        .sort((a, b) => Number(b.total) - Number(a.total)),
    [statusCounts],
  );

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (overrides) {
      setDraft(overrides);
      setDirty(false);
    }
  }, [overrides]);

  const effectiveType = (status: string): string =>
    draft[status] ?? masterTypeByName.get(status) ?? '';

  const handleChange = (status: string, type: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      const masterType = masterTypeByName.get(status) ?? null;
      // Store only real overrides: values that differ from the platform default.
      if (!type || type === masterType) delete next[status];
      else next[status] = type;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setTenantCaseStatusTypes(draft);
      queryClient.invalidateQueries({ queryKey: ['case_status_type_overrides'] });
      queryClient.invalidateQueries({ queryKey: [CASE_COMMAND_STATS_KEY] });
      toast.success('Lifecycle mapping saved — dashboards now count these statuses correctly');
      setDirty(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save lifecycle mapping');
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = countsLoading || masterLoading || overridesLoading;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <SettingsPageHeader categoryId="case-lifecycle" />
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to Settings</span>
      </button>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900">Status → lifecycle stage</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every status your cases use, mapped to a lifecycle stage. The Cases command center,
          filters and reports count by these stages — unclassified statuses count as active.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading statuses…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-sm text-slate-500">No cases yet — statuses appear here once cases exist.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map(({ status, total }) => {
              const masterType = masterTypeByName.get(status);
              const value = effectiveType(status);
              return (
                <li key={status} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{status}</p>
                    <p className="text-xs text-slate-500">
                      {Number(total).toLocaleString()} case{Number(total) === 1 ? '' : 's'}
                      {masterType && (
                        <span className="ml-2 text-slate-400">
                          platform default: {STATUS_TYPE_LABELS[masterType as CaseStatusType] ?? masterType}
                        </span>
                      )}
                    </p>
                  </div>
                  <select
                    value={value}
                    onChange={(e) => handleChange(status, e.target.value)}
                    aria-label={`Lifecycle stage for ${status}`}
                    className="w-52 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Unclassified (active)</option>
                    {CASE_STATUS_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {STATUS_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
          <Button onClick={handleSave} disabled={isSaving || isLoading || !dirty}>
            {isSaving ? 'Saving…' : 'Save mapping'}
          </Button>
        </div>
      </div>
    </div>
  );
};
