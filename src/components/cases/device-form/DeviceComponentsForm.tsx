// src/components/cases/device-form/DeviceComponentsForm.tsx
import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, CheckCircle2, X, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Badge } from '../../ui/Badge';
import { Input } from '../../ui/Input';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { StatCard } from '../../shared/StatCard';
import { DeviceFieldRenderer } from './DeviceFieldRenderer';
import { cn } from '../../../lib/utils';
import { formatDateTimeWithConfig } from '../../../lib/format';
import { useDateTimeConfig } from '../../../contexts/TenantConfigContext';
import { getDeviceFamilyConfig, type DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import { resolveDeviceFamily } from '../../../lib/devices/deviceFamily';
import {
  componentEntry, statusBucket, BUCKET_LABEL, BUCKET_BADGE, BUCKET_TONE, BUCKET_ICON,
  STATUS_BUCKETS, COMPONENT_RESULT_OPTIONS, type StatusBucket,
} from '../../../lib/devices/componentCatalog';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';
import type { ComponentMeta } from '../../../lib/diagnosticsTransform';

interface Props {
  state: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: Record<string, CatalogOption[]>;
  errors?: Record<string, string>;
  lastUpdatedAt?: string | null;
  lastUpdatedById?: string | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full bg-cat-2" aria-hidden="true" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{children}</h3>
    </div>
  );
}

function MetaLabel({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{children}</span>;
}

export function DeviceComponentsForm({
  state, onChange, options, errors, lastUpdatedAt, lastUpdatedById,
}: Props) {
  const { t } = useTranslation();
  const dt = useDateTimeConfig();

  const typeName = options.device_types?.find(o => o.id === state.device_type_id)?.name ?? '';
  const family = resolveDeviceFamily(typeName);
  const cfg = getDeviceFamilyConfig(family);

  const componentDefs = cfg.components.filter(d => d.control === 'component-status');
  const extraDefs = cfg.components.filter(d => d.control !== 'component-status');

  const meta = (state.component_meta && typeof state.component_meta === 'object' && !Array.isArray(state.component_meta)
    ? state.component_meta
    : {}) as Record<string, ComponentMeta>;

  const statusOptions = options.component_statuses ?? [];

  // Selected component (by componentKey). Keep it valid as the family changes.
  const [selectedKey, setSelectedKey] = useState<string>(componentDefs[0]?.componentKey ?? '');
  useEffect(() => {
    const keys = componentDefs.map(d => d.componentKey!);
    if (keys.length && !keys.includes(selectedKey)) setSelectedKey(keys[0]);
  }, [componentDefs, selectedKey]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [newFinding, setNewFinding] = useState('');

  const updateMeta = (componentKey: string, patch: Partial<ComponentMeta>) => {
    const next = { ...meta, [componentKey]: { ...(meta[componentKey] ?? {}), ...patch } };
    onChange('component_meta', next);
  };

  const setStatus = (def: DeviceFieldDef, value: string) => {
    onChange(def.key, value);
    const ck = def.componentKey!;
    if (value && !meta[ck]?.tested_at) updateMeta(ck, { tested_at: new Date().toISOString() });
  };

  // Author of the last diagnostics write (for the panel footer).
  const { data: updatedByName } = useQuery({
    queryKey: ['profiles_by_ids', 'component_last_updated', lastUpdatedById ?? ''],
    queryFn: async () => {
      if (!lastUpdatedById) return '';
      const { data } = await supabase.from('profiles').select('full_name').eq('id', lastUpdatedById).maybeSingle();
      return data?.full_name ?? '';
    },
    enabled: !!lastUpdatedById,
  });

  if (componentDefs.length === 0 && extraDefs.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          {t('devices.section.noComponents', { defaultValue: 'No component checks for this device type.' })}
        </p>
      </div>
    );
  }

  const counts = STATUS_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {} as Record<StatusBucket, number>);
  for (const def of componentDefs) counts[statusBucket(str(state[def.key]))] += 1;

  const visibleDefs = componentDefs.filter(def => {
    const label = t(def.labelKey, { defaultValue: def.labelFallback });
    if (search && !label.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter && statusBucket(str(state[def.key])) !== filter) return false;
    return true;
  });

  const selectedDef = componentDefs.find(d => d.componentKey === selectedKey) ?? null;

  const filterOptions: CatalogOption[] = [
    { id: '', name: t('devices.components.allStatus', { defaultValue: 'All Status' }) },
    ...STATUS_BUCKETS.map(b => ({ id: b, name: BUCKET_LABEL[b] })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row gap-4">
        {/* LEFT — overview + list */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <SectionHeader>{t('devices.components.overview', { defaultValue: 'Component Overview' })}</SectionHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUS_BUCKETS.map(b => (
              <StatCard
                key={b}
                label={BUCKET_LABEL[b]}
                value={counts[b]}
                tone={BUCKET_TONE[b]}
                icon={BUCKET_ICON[b]}
                onClick={() => setFilter(prev => (prev === b ? '' : b))}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                placeholder={t('devices.components.searchPlaceholder', { defaultValue: 'Search components…' })}
                size="sm"
                aria-label={t('devices.components.searchPlaceholder', { defaultValue: 'Search components…' })}
              />
            </div>
            <div className="sm:w-44">
              <SearchableSelect
                value={filter}
                onChange={setFilter}
                options={filterOptions}
                size="sm"
                usePortal
                aria-label={t('devices.components.filterByStatus', { defaultValue: 'Filter by status' })}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-[1fr_auto_1.4fr_auto] items-center gap-3 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>{t('devices.components.colComponent', { defaultValue: 'Component' })}</span>
              <span>{t('devices.components.colStatus', { defaultValue: 'Status' })}</span>
              <span>{t('devices.components.colDetails', { defaultValue: 'Details' })}</span>
              <span className="sr-only">{t('common.select', { defaultValue: 'Select' })}</span>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {visibleDefs.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-slate-400">
                  {t('devices.components.noMatches', { defaultValue: 'No components match your filters.' })}
                </li>
              ) : visibleDefs.map(def => {
                const ck = def.componentKey!;
                const bucket = statusBucket(str(state[def.key]));
                const label = t(def.labelKey, { defaultValue: def.labelFallback });
                const Icon = componentEntry(ck).icon;
                const details = meta[ck]?.notes ?? '';
                const selected = ck === selectedKey;
                return (
                  <li key={def.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(ck)}
                      aria-pressed={selected}
                      className={cn(
                        'w-full grid grid-cols-[1fr_auto_1.4fr_auto] items-center gap-3 px-3 py-3 text-left transition-colors',
                        selected ? 'bg-cat-2/5 ring-1 ring-inset ring-cat-2' : 'hover:bg-surface-muted',
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                        <span className="text-sm font-medium text-slate-900 truncate">{label}</span>
                      </span>
                      <Badge variant={BUCKET_BADGE[bucket]} size="sm">{BUCKET_LABEL[bucket]}</Badge>
                      <span className="text-sm text-slate-500 truncate">
                        {details || <span className="text-slate-300">—</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-xs text-slate-500">
            <span aria-hidden="true">💡</span>
            <span>{t('devices.components.tip', { defaultValue: 'Select a component to view detailed information and test history.' })}</span>
          </div>
        </div>

        {/* RIGHT — component details */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <SectionHeader>{t('devices.components.details', { defaultValue: 'Component Details' })}</SectionHeader>
          {!selectedDef ? (
            <p className="text-sm text-slate-400">
              {t('devices.components.selectPrompt', { defaultValue: 'Select a component to view its details.' })}
            </p>
          ) : (() => {
            const ck = selectedDef.componentKey!;
            const entry = componentEntry(ck);
            const Icon = entry.icon;
            const label = t(selectedDef.labelKey, { defaultValue: selectedDef.labelFallback });
            const cm = meta[ck] ?? {};
            const bucket = statusBucket(str(state[selectedDef.key]));
            const findings = Array.isArray(cm.findings) ? cm.findings : [];

            const addFinding = () => {
              const v = newFinding.trim();
              if (!v) return;
              updateMeta(ck, { findings: [...findings, v] });
              setNewFinding('');
            };

            return (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-cat-2/10 text-cat-2 shrink-0">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-bold text-slate-900">{label}</h4>
                      <Badge variant={BUCKET_BADGE[bucket]} size="sm">{BUCKET_LABEL[bucket]}</Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-600">{entry.subtitle}</p>
                    <p className="text-xs text-slate-500">{entry.description}</p>
                  </div>
                </div>

                <div>
                  <Input
                    label={t('devices.components.detailsField', { defaultValue: 'Details' })}
                    value={str(cm.notes)}
                    onChange={(e) => updateMeta(ck, { notes: e.target.value })}
                    placeholder={t('devices.components.detailsPlaceholder', { defaultValue: 'Short summary shown in the list…' })}
                    size="sm"
                  />
                </div>

                {/* Diagnostic summary */}
                <div>
                  <MetaLabel>{t('devices.components.diagnosticSummary', { defaultValue: 'Diagnostic Summary' })}</MetaLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SearchableSelect
                      label={t('devices.components.status', { defaultValue: 'Status' })}
                      value={str(state[selectedDef.key])}
                      onChange={(v) => setStatus(selectedDef, v)}
                      options={statusOptions}
                      placeholder={t('ui.select.placeholder', { defaultValue: 'Select…' })}
                      size="sm"
                      usePortal
                      error={errors?.[selectedDef.key]}
                    />
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {t('devices.components.testedOn', { defaultValue: 'Tested On' })}
                      </label>
                      <div className="h-[34px] flex items-center px-3 rounded-md border border-slate-200 bg-surface-muted text-sm text-slate-600">
                        {cm.tested_at ? formatDateTimeWithConfig(cm.tested_at, dt) : '—'}
                      </div>
                    </div>
                    <Input
                      label={t('devices.components.testMethod', { defaultValue: 'Test Method' })}
                      value={str(cm.test_method)}
                      onChange={(e) => updateMeta(ck, { test_method: e.target.value })}
                      placeholder={t('devices.components.testMethodPlaceholder', { defaultValue: 'e.g. Head Map Test' })}
                      size="sm"
                    />
                    <SearchableSelect
                      label={t('devices.components.result', { defaultValue: 'Result' })}
                      value={str(cm.result)}
                      onChange={(v) => updateMeta(ck, { result: v })}
                      options={COMPONENT_RESULT_OPTIONS}
                      placeholder={t('ui.select.placeholder', { defaultValue: 'Select…' })}
                      size="sm"
                      usePortal
                    />
                  </div>
                </div>

                {/* Findings */}
                <div>
                  <MetaLabel>{t('devices.components.findings', { defaultValue: 'Findings' })}</MetaLabel>
                  {findings.length > 0 && (
                    <ul className="space-y-1.5 mb-2">
                      {findings.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
                          <span className="flex-1 break-words">{f}</span>
                          <button
                            type="button"
                            onClick={() => updateMeta(ck, { findings: findings.filter((_, j) => j !== i) })}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label={t('devices.components.removeFinding', { defaultValue: 'Remove finding' })}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newFinding}
                      onChange={(e) => setNewFinding(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFinding(); } }}
                      placeholder={t('devices.components.addFinding', { defaultValue: 'Add a finding…' })}
                      size="sm"
                      aria-label={t('devices.components.addFinding', { defaultValue: 'Add a finding…' })}
                    />
                    <button
                      type="button"
                      onClick={addFinding}
                      className="shrink-0 inline-flex items-center gap-1 px-3 rounded-md border border-border text-sm font-medium text-slate-700 hover:bg-surface-muted"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      {t('common.add', { defaultValue: 'Add' })}
                    </button>
                  </div>
                </div>

                {/* Last updated */}
                {(lastUpdatedAt || updatedByName) && (
                  <div className="pt-3 border-t border-border">
                    <MetaLabel>{t('devices.components.lastUpdated', { defaultValue: 'Last Updated' })}</MetaLabel>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cat-2 text-white text-xs font-semibold">
                        {(updatedByName || '—').trim().split(/\s+/).map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase() || '—'}
                      </span>
                      <div className="text-sm">
                        <span className="font-medium text-slate-800">{updatedByName || t('common.system', { defaultValue: 'System' })}</span>
                        {lastUpdatedAt && <span className="text-slate-400"> · {formatDateTimeWithConfig(lastUpdatedAt, dt)}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Family-specific non-component fields (e.g. RAID/NAS member-drive notes). */}
      {extraDefs.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <SectionHeader>{t('devices.components.additional', { defaultValue: 'Additional Notes' })}</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {extraDefs.map(def => (
              <div key={def.key} className={def.colSpan === 2 ? 'sm:col-span-2' : undefined}>
                <DeviceFieldRenderer
                  def={def}
                  value={state[def.key]}
                  onChange={onChange}
                  options={def.optionsSource ? (options[def.optionsSource] ?? []) : []}
                  error={errors?.[def.key]}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
