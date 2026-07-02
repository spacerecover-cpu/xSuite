import { useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  HardDrive, Clock, Check, MessageSquarePlus, Paperclip, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { Textarea } from '../../ui/Textarea';
import { Input } from '../../ui/Input';
import { TagInput } from '../../ui/TagInput';
import { cn } from '../../../lib/utils';
import { formatDateTimeWithConfig } from '../../../lib/format';
import { useDateTimeConfig } from '../../../contexts/TenantConfigContext';
import { useToast } from '../../../hooks/useToast';
import { DIAGNOSTIC_FIELDS, SEVERITY_OPTIONS } from '../../../lib/devices/deviceFieldConfig';
import type { CatalogOption } from '../../../lib/devices/deviceCatalogQueries';

interface Props {
  state: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options: Record<string, CatalogOption[]>;
  errors?: Record<string, string>;
  caseId: string;
  engineerOptions: CatalogOption[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

// Severity → status-colored dot. Color always accompanies its text label, so
// meaning is never conveyed by color alone.
const SEVERITY_DOT: Record<string, string> = {
  Low: 'bg-info',
  Medium: 'bg-warning',
  High: 'bg-danger',
  Critical: 'bg-danger',
};

// The four canonical lifecycle stages shown in the sidebar stepper. Legacy
// free-text statuses map onto the nearest stage so older rows still render.
const STATUS_STEPS = ['Received', 'Under Diagnosis', 'Evaluation', 'Completed'] as const;
const STATUS_INDEX: Record<string, number> = {
  Received: 0, Pending: 0,
  'Under Diagnosis': 1, 'In Progress': 1, Inconclusive: 1,
  Evaluation: 2,
  Completed: 3,
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full bg-cat-5" aria-hidden="true" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{children}</h3>
    </div>
  );
}

function SidebarCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function SeveritySelect({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const dot = SEVERITY_DOT[value] ?? 'bg-slate-300';
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <span
          className={cn('absolute start-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full', dot)}
          aria-hidden="true"
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-slate-300 rounded-md ps-7 pe-8 py-1.5 text-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('ui.select.placeholder', { defaultValue: 'Select…' })}</option>
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function DiagnosticStatusStepper({ status }: { status: string }) {
  const active = STATUS_INDEX[status] ?? 0;
  return (
    <div className="flex items-start">
      {STATUS_STEPS.map((label, i) => {
        const done = i < active;
        const isActive = i === active;
        return (
          <div key={label} className="flex-1 flex flex-col items-center text-center">
            <div className="flex items-center w-full">
              <span className={cn('h-0.5 flex-1', i === 0 ? 'opacity-0' : done || isActive ? 'bg-success' : 'bg-slate-200')} />
              <span
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full shrink-0',
                  done && 'bg-success text-white',
                  isActive && 'border-2 border-cat-5',
                  !done && !isActive && 'border-2 border-slate-300',
                )}
              >
                {done ? (
                  <Check className="w-4 h-4" aria-hidden="true" />
                ) : isActive ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-cat-5" aria-hidden="true" />
                ) : null}
              </span>
              <span className={cn('h-0.5 flex-1', i === STATUS_STEPS.length - 1 ? 'opacity-0' : done ? 'bg-success' : 'bg-slate-200')} />
            </div>
            <span className={cn('mt-1.5 text-xs leading-tight', isActive ? 'font-semibold text-slate-800' : done ? 'text-slate-600' : 'text-slate-400')}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeviceSummaryPanel({
  state, options,
}: { state: Record<string, unknown>; options: Record<string, CatalogOption[]> }) {
  const { t } = useTranslation();
  const nameOf = (src: string, id: unknown) => options[src]?.find((o) => o.id === id)?.name ?? '';
  const deviceType = nameOf('device_types', state.device_type_id);
  const brand = nameOf('brands', state.brand_id);
  const model = str(state.model);
  const serial = str(state.serial_number);
  const capacity = nameOf('capacities', state.capacity_id);
  const iface = nameOf('interfaces', state.interface_id);
  const accessories = asArray(state.accessories)
    .map((id) => options.accessories?.find((o) => o.id === id)?.name)
    .filter((n): n is string => !!n);

  const headline = [deviceType, [brand, model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const meta = [serial ? `S/N: ${serial}` : '', capacity, iface].filter(Boolean);

  return (
    <SidebarCard title={t('devices.summary.title', { defaultValue: 'Device Summary' })}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex items-center justify-center w-9 h-9 rounded-lg bg-surface-muted text-slate-500 shrink-0">
          <HardDrive className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 break-words">
            {headline || t('devices.summary.unknown', { defaultValue: 'Device details pending' })}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-500 break-words">{meta.join('  ·  ')}</p>
          )}
        </div>
      </div>
      {accessories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {accessories.map((a) => (
            <span key={a} className="px-2 py-0.5 rounded-md bg-info-muted text-info text-xs font-medium">
              {a}
            </span>
          ))}
        </div>
      )}
    </SidebarCard>
  );
}

function QuickActionsPanel({ onAddNote }: { onAddNote: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const actionClass =
    'w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-slate-700 hover:bg-surface-muted transition-colors';
  return (
    <SidebarCard title={t('devices.quickActions.title', { defaultValue: 'Quick Actions' })}>
      <div className="space-y-2">
        <button type="button" onClick={onAddNote} className={actionClass}>
          <MessageSquarePlus className="w-4 h-4 text-primary" aria-hidden="true" />
          {t('devices.quickActions.addNote', { defaultValue: 'Add Diagnostic Note' })}
        </button>
        <button
          type="button"
          onClick={() =>
            toast.info(
              t('devices.quickActions.attachHint', {
                defaultValue: 'Attach files from the case Files tab.',
              }),
            )
          }
          className={actionClass}
        >
          <Paperclip className="w-4 h-4 text-primary" aria-hidden="true" />
          {t('devices.quickActions.attach', { defaultValue: 'Attach File / Screenshot' })}
        </button>
      </div>
    </SidebarCard>
  );
}

interface NoteRow { id: string; content: string | null; created_at: string; created_by: string | null }

function RecentNotesPanel({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const dt = useDateTimeConfig();

  const { data: notes = [] } = useQuery({
    queryKey: ['case_notes', 'recent', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_internal_notes')
        .select('id, content, created_at, created_by')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
    enabled: !!caseId,
  });

  const authorIds = useMemo(
    () => Array.from(new Set(notes.map((n) => n.created_by).filter((v): v is string => !!v))),
    [notes],
  );

  const { data: authors = [] } = useQuery({
    queryKey: ['profiles_by_ids', 'device_recent_notes', authorIds.slice().sort().join(',')],
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
  const initialsFor = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '–';
  };

  return (
    <SidebarCard title={t('devices.recentNotes.title', { defaultValue: 'Recent Notes' })}>
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">
          {t('devices.recentNotes.empty', { defaultValue: 'No notes yet.' })}
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const author = nameFor(n.created_by);
            return (
              <li key={n.id} className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cat-2 text-white text-xs font-semibold shrink-0">
                  {initialsFor(author)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400" title={`UTC: ${n.created_at}`}>
                    {formatDateTimeWithConfig(n.created_at, dt)}
                  </p>
                  <p className="text-sm text-slate-700 line-clamp-2 break-words">{n.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to={`/cases/${caseId}`}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {t('devices.recentNotes.viewAll', { defaultValue: 'View all notes' })}
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </SidebarCard>
  );
}

export function DeviceDiagnosticForm({ state, onChange, options, errors = {}, caseId, engineerOptions }: Props) {
  const { t } = useTranslation();
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const defMap = useMemo(() => new Map(DIAGNOSTIC_FIELDS.map((d) => [d.key, d])), []);
  const labelFor = (key: string) => {
    const d = defMap.get(key);
    return d ? t(d.labelKey, { defaultValue: d.labelFallback }) : key;
  };
  const staticOpts = (key: string): CatalogOption[] => defMap.get(key)?.staticOptions ?? [];

  const renderSelect = (
    key: string,
    optionList: CatalogOption[],
    opts: { required?: boolean } = {},
  ) => (
    <SearchableSelect
      label={labelFor(key)}
      value={str(state[key])}
      onChange={(v) => onChange(key, v)}
      options={
        opts.required
          ? optionList
          : [{ id: '', name: t('ui.select.notSpecified', { defaultValue: 'Not specified' }) }, ...optionList]
      }
      required={opts.required}
      error={errors[key]}
      placeholder={t('ui.select.placeholder', { defaultValue: 'Select…' })}
      size="sm"
      usePortal
    />
  );

  const renderTextarea = (key: string, rows: number, ref?: React.Ref<HTMLTextAreaElement>) => (
    <Textarea
      ref={ref}
      label={labelFor(key)}
      value={str(state[key])}
      onChange={(e) => onChange(key, e.target.value)}
      error={errors[key]}
      rows={rows}
      size="sm"
    />
  );

  const focusNotes = () => {
    notesRef.current?.focus();
    notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      {/* Left — structured diagnostic form */}
      <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm space-y-6">
        <section>
          <SectionHeader>{t('devices.section.diagnosticInfo', { defaultValue: 'Diagnostic Information' })}</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
            {renderSelect('device_problem', options.service_problems ?? [], { required: true })}
            {renderSelect('failure_type', staticOpts('failure_type'))}
            <SeveritySelect label={labelFor('severity')} value={str(state.severity)} onChange={(v) => onChange('severity', v)} />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-x-4 gap-y-3">
            <div className="md:col-span-3">
              <TagInput
                label={labelFor('symptoms_list')}
                value={asArray(state.symptoms_list)}
                onChange={(v) => onChange('symptoms_list', v)}
                placeholder={t('devices.field.symptomsListPlaceholder', { defaultValue: 'Add symptom…' })}
              />
            </div>
            <div className="md:col-span-2">{renderTextarea('symptoms_detail', 3)}</div>
          </div>
        </section>

        <section>
          <SectionHeader>{t('devices.section.diagnosisNextStep', { defaultValue: 'Diagnosis & Next Step' })}</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-start">
            {renderTextarea('initial_diagnosis', 3)}
            {renderSelect('diagnostic_status', staticOpts('diagnostic_status'))}
            {renderSelect('next_step', staticOpts('next_step'))}
            {renderSelect('tools_software', staticOpts('tools_software'))}
            {renderSelect('engineer_id', engineerOptions)}
            <Input
              label={labelFor('est_time')}
              value={str(state.est_time)}
              onChange={(e) => onChange('est_time', e.target.value)}
              leftIcon={<Clock className="w-4 h-4" />}
              placeholder={t('devices.field.estTimePlaceholder', { defaultValue: 'e.g. 60 min' })}
              size="sm"
            />
          </div>
        </section>

        <section>
          <SectionHeader>{t('devices.section.outcome', { defaultValue: 'Outcome' })}</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
            {renderSelect('evaluation_result', staticOpts('evaluation_result'))}
            {renderSelect('recovery_chance', staticOpts('recovery_chance'))}
            {renderSelect('recommendation', staticOpts('recommendation'))}
            <div className="sm:col-span-3">{renderTextarea('diagnostic_notes', 3, notesRef)}</div>
          </div>
        </section>
      </div>

      {/* Right — context sidebar */}
      <aside className="w-full xl:w-[320px] shrink-0 space-y-4">
        <DeviceSummaryPanel state={state} options={options} />
        <SidebarCard title={t('devices.diagnosticStatus.title', { defaultValue: 'Diagnostic Status' })}>
          <DiagnosticStatusStepper status={str(state.diagnostic_status)} />
        </SidebarCard>
        <QuickActionsPanel onAddNote={focusNotes} />
        <RecentNotesPanel caseId={caseId} />
      </aside>
    </div>
  );
}
