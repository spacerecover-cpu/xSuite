import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, StickyNote, FlaskConical, MessageSquare, PackageCheck, Activity,
  ChevronRight, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { Badge } from '../../ui/Badge';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { cn } from '../../../lib/utils';
import { formatDateTimeWithConfig } from '../../../lib/format';
import { useDateTimeConfig } from '../../../contexts/TenantConfigContext';
import { statusToBadgeVariant } from '../../../lib/ui/variants';
import { componentEntry } from '../../../lib/devices/componentCatalog';
import { fetchDeviceActivity, type DeviceActivityRow } from '../../../lib/devices/deviceActivityService';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  caseId: string;
  deviceId: string;
}

const PAGE = 8;

const ACTIVITY_META: Record<string, { icon: LucideIcon; tone: string }> = {
  component_status_updated: { icon: AlertCircle, tone: 'bg-danger-muted text-danger' },
  diagnostic_note_added: { icon: StickyNote, tone: 'bg-info-muted text-info' },
  diagnostic_test_performed: { icon: FlaskConical, tone: 'bg-cat-6/10 text-cat-6' },
  component_note_added: { icon: MessageSquare, tone: 'bg-warning-muted text-warning' },
  device_received: { icon: PackageCheck, tone: 'bg-success-muted text-success' },
};
const FALLBACK_META = { icon: Activity, tone: 'bg-surface-muted text-slate-500' };
const activityMeta = (type: string) => ACTIVITY_META[type] ?? FALLBACK_META;

const TYPE_LABELS: Record<string, string> = {
  component_status_updated: 'Component Status Updated',
  diagnostic_note_added: 'Diagnostic Note Added',
  diagnostic_test_performed: 'Diagnostic Test Performed',
  component_note_added: 'Component Note Added',
  device_received: 'Device Received',
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full bg-cat-6" aria-hidden="true" />
      <h3 className="text-sm font-bold uppercase tracking-[0.04em] text-slate-800">{children}</h3>
    </div>
  );
}

function MetaLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400 mb-1">{children}</span>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <MetaLabel>{label}</MetaLabel>
      <p className="text-sm text-slate-700 break-words">{value || <span className="text-slate-300">—</span>}</p>
    </div>
  );
}

const initials = (name: string) =>
  name.trim().split(/\s+/).map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase() || '–';

/** Render extra metadata as a compact key/value list (skips nested objects + known keys). */
function AdditionalDetails({ metadata }: { metadata: unknown }) {
  const { t } = useTranslation();
  const obj = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
  const attachments = Array.isArray(obj.attachments) ? (obj.attachments as unknown[]).filter((a): a is string => typeof a === 'string') : [];
  const entries = Object.entries(obj).filter(
    ([k, v]) => k !== 'attachments' && v != null && v !== '' && typeof v !== 'object',
  );
  if (entries.length === 0 && attachments.length === 0) return null;
  return (
    <div className="pt-4 border-t border-border">
      <MetaLabel>{t('devices.history.additional', { defaultValue: 'Additional Details' })}</MetaLabel>
      {entries.length > 0 && (
        <dl className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k.replace(/_/g, ' ')}</dt>
              <dd className="text-sm text-slate-700 break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {attachments.length > 0 && (
        <div className="mt-3">
          <dt className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
            {t('devices.history.attachments', { defaultValue: 'Attachments' })}
          </dt>
          <div className="flex flex-wrap gap-2">
            {attachments.map((url) => (
              <img key={url} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DeviceHistoryForm({ caseId, deviceId }: Props) {
  const { t } = useTranslation();
  const dt = useDateTimeConfig();
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['device_activity', caseId, deviceId, limit],
    queryFn: () => fetchDeviceActivity(deviceId, { limit }),
    enabled: !!deviceId,
  });

  const authorIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))),
    [rows],
  );
  const { data: authors = [] } = useQuery({
    queryKey: ['profiles_by_ids', 'device_activity', authorIds.slice().sort().join(',')],
    queryFn: async () => {
      if (authorIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: authorIds.length > 0,
  });
  const nameFor = (id: string | null) =>
    (id && authors.find((a) => a.id === id)?.full_name) || t('common.system', { defaultValue: 'System' });

  const visibleRows = filter ? rows.filter((r) => r.activity_type === filter) : rows;

  // Keep a valid selection as data/filter changes.
  useEffect(() => {
    if (visibleRows.length && !visibleRows.some((r) => r.id === selectedId)) {
      setSelectedId(visibleRows[0].id);
    }
  }, [visibleRows, selectedId]);

  const filterOptions: CatalogOption[] = [
    { id: '', name: t('devices.history.allActivities', { defaultValue: 'All Activities' }) },
    ...Object.entries(TYPE_LABELS).map(([id, name]) => ({ id, name })),
  ];

  const selected = visibleRows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      {/* Left — timeline */}
      <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <SectionHeader>{t('devices.history.timeline', { defaultValue: 'Activity Timeline' })}</SectionHeader>
          <div className="sm:w-52">
            <SearchableSelect
              value={filter}
              onChange={setFilter}
              options={filterOptions}
              clearable={false}
              size="sm"
              usePortal
              aria-label={t('devices.history.filter', { defaultValue: 'Filter activities' })}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            {t('devices.history.empty', { defaultValue: 'No activity recorded for this device yet.' })}
          </p>
        ) : (
          <ol className="relative space-y-2 border-s border-slate-200 ps-4">
            {visibleRows.map((r) => {
              const meta = activityMeta(r.activity_type);
              const Icon = meta.icon;
              const selectedRow = r.id === selectedId;
              return (
                <li key={r.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-pressed={selectedRow}
                    className={cn(
                      'w-full text-left rounded-xl border p-3 transition-colors',
                      selectedRow ? 'border-cat-6 ring-1 ring-inset ring-cat-6 bg-cat-6/5' : 'border-border hover:bg-surface-muted',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg shrink-0', meta.tone)}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{r.title}</span>
                          {r.status && <Badge variant={statusToBadgeVariant(r.status)} size="sm">{r.status}</Badge>}
                        </div>
                        {r.description && <p className="mt-0.5 text-sm text-slate-500 break-words line-clamp-2">{r.description}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formatDateTimeWithConfig(r.created_at, dt)} · {nameFor(r.created_by)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {!isLoading && rows.length >= limit && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md border border-border text-sm font-medium text-slate-700 hover:bg-surface-muted"
            >
              {t('devices.history.loadMore', { defaultValue: 'Load more' })}
            </button>
          </div>
        )}
      </div>

      {/* Right — activity details */}
      <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <SectionHeader>{t('devices.history.details', { defaultValue: 'Activity Details' })}</SectionHeader>
        {!selected ? (
          <p className="text-sm text-slate-400">
            {t('devices.history.selectPrompt', { defaultValue: 'Select an activity to view its details.' })}
          </p>
        ) : (
          <ActivityDetail row={selected} actorName={nameFor(selected.created_by)} dt={dt} />
        )}
      </div>
    </div>
  );
}

function ActivityDetail({
  row, actorName, dt,
}: { row: DeviceActivityRow; actorName: string; dt: ReturnType<typeof useDateTimeConfig> }) {
  const { t } = useTranslation();
  const componentName = row.component_key ? componentEntry(row.component_key).subtitle : '';
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-bold text-slate-900">{row.title}</h4>
        {row.status && <Badge variant={statusToBadgeVariant(row.status)} size="sm">{row.status}</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {row.component_key && (
          <DetailRow label={t('devices.history.component', { defaultValue: 'Component' })} value={componentName || row.component_key} />
        )}
        {row.status && <DetailRow label={t('devices.history.status', { defaultValue: 'Status' })} value={row.status} />}
        <DetailRow label={t('devices.history.detailsField', { defaultValue: 'Details' })} value={row.description} />
        <DetailRow label={t('devices.history.updatedBy', { defaultValue: 'Updated by' })} value={
          <span className="inline-flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cat-6 text-white text-[10px] font-semibold">{initials(actorName)}</span>
            {actorName}
          </span>
        } />
        <DetailRow label={t('devices.history.updatedOn', { defaultValue: 'Updated on' })} value={formatDateTimeWithConfig(row.created_at, dt)} />
        {row.old_value && (
          <DetailRow label={t('devices.history.changedFrom', { defaultValue: 'Changed from' })} value={`${row.old_value} → ${row.new_value ?? ''}`} />
        )}
      </div>

      <AdditionalDetails metadata={row.metadata} />
    </div>
  );
}
