import { useEffect, useId, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Cpu, Database, Eye, EyeOff, Info, KeyRound, Package, Shield, Star, Stethoscope, X } from 'lucide-react';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { DeviceRoleBadge } from '../../ui/DeviceRoleBadge';
import { AuditInfo } from '../../ui/AuditInfo';
import { supabase } from '../../../lib/supabaseClient';
import { cn } from '../../../lib/utils';
import { logger } from '../../../lib/logger';
import { setPrimaryDevice } from '../../../lib/deviceService';
import { useToast } from '../../../hooks/useToast';
import { getDeviceIconComponent } from '@/lib/deviceIconMapper';
import { resolveDeviceFamily } from '../../../lib/devices/deviceFamily';
import { getDeviceFamilyConfig, type DeviceFieldDef } from '../../../lib/devices/deviceFieldConfig';
import { useDeviceFormCatalogs } from '../../../lib/devices/deviceCatalogQueries';
import type { CaseDeviceWithEmbeds } from './CaseDevicesTab';

interface DeviceDetailsModalProps {
  device: CaseDeviceWithEmbeds | null;
  /** Zero-based index within the device's group — rendered as "Device N". */
  deviceIndex: number;
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Per-role header tint — mirrors DeviceRoleBadge's tone mapping so the modal's
// hero band reads as the same role the card badge shows.
const ROLE_TINT: Record<string, string> = {
  patient: 'bg-info-muted',
  backup: 'bg-success-muted',
  donor: 'bg-warning-muted',
};

const EMPTY = '—';

function Field({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cn('break-words text-sm text-slate-900', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  tone: string;
  children: ReactNode;
}) {
  // break-inside-avoid keeps each card whole inside the CSS-columns masonry so the
  // body lays out as balanced columns that fit one window without scrolling.
  return (
    <section className="mb-4 break-inside-avoid rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', tone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const STACK = 'space-y-3';

export function DeviceDetailsModal({ device, deviceIndex, caseId, isOpen, onClose }: DeviceDetailsModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<'primary' | 'backup' | null>(null);
  const { options: catalogs } = useDeviceFormCatalogs();

  // Reset the password reveal whenever the modal is dismissed so a re-open never
  // leaks the previously-revealed secret.
  useEffect(() => {
    if (!isOpen) setShowPassword(false);
  }, [isOpen]);

  // The card embed omits technical columns (technical_details, pcb_number, …), so
  // fetch the full row to populate the Technical Details section. Identity fields
  // come from the already-resolved embed and render instantly.
  const { data: fullRow } = useQuery({
    queryKey: ['case_device_full', device?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_devices')
        .select('*')
        .eq('id', device!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
    enabled: isOpen && !!device?.id,
    staleTime: 60_000,
  });

  // Role catalog (Patient/Backup/…) — shared cache key with DeviceFormModal.
  const { data: roles = [] } = useQuery({
    queryKey: ['device_roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_device_roles').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen,
  });

  if (!device) return null;

  const DeviceIcon = getDeviceIconComponent(device.device_type?.name);
  const family = resolveDeviceFamily(device.device_type?.name);
  // Encryption + interface are surfaced in the Identity grid, so drop them from
  // the family technical list to avoid showing either value twice.
  const technicalDefs = getDeviceFamilyConfig(family).technical.filter(
    (d) => d.key !== 'encryption_id' && d.key !== 'interface_id',
  );

  const resolveCatalog = (source: DeviceFieldDef['optionsSource'], raw: unknown): string =>
    (source && (catalogs[source] ?? []).find((o) => o.id === String(raw))?.name) || String(raw);

  const techValue = (def: DeviceFieldDef): string | null => {
    let raw: unknown;
    if (def.storage.kind === 'column') raw = fullRow?.[def.storage.column];
    else if (def.storage.kind === 'json') {
      const td = (fullRow?.technical_details ?? {}) as Record<string, unknown>;
      raw = td[def.storage.jsonKey];
    }
    if (raw == null || raw === '') return null;
    return def.optionsSource ? resolveCatalog(def.optionsSource, raw) : String(raw);
  };

  const technicalRows = technicalDefs
    .map((def) => ({ def, value: techValue(def) }))
    .filter((row): row is { def: DeviceFieldDef; value: string } => row.value !== null);

  const interfaceName =
    fullRow?.interface_id != null ? resolveCatalog('interfaces', fullRow.interface_id) : null;

  const accessoryNames = (device.accessories ?? []).map(
    (a) => (catalogs.accessories ?? []).find((o) => o.id === a)?.name ?? a,
  );

  const roleName = device.device_role?.name?.toLowerCase() ?? '';
  const isPrimary = !!device.is_primary;
  const headerTint = ROLE_TINT[roleName] ?? 'bg-surface-muted';
  const hasDiagnosis = !!(device.symptoms || device.notes || device.role_notes);

  // Role transitions live only on secondary devices. A primary device is, by
  // definition, the patient device under recovery — so it can never become a
  // backup, and it is already primary. Donor parts are inventory-sourced spares,
  // so their role is managed there, not here.
  const canMakePrimary = !isPrimary && roleName !== 'donor';
  const canMakeBackup = !isPrimary && roleName === 'patient';

  const roleIdByName = (name: string): number | undefined => {
    const match = roles.find((r) => (r.name as string | null)?.toLowerCase() === name);
    return match ? (match.id as number) : undefined;
  };

  const refreshAndClose = async () => {
    await queryClient.invalidateQueries({ queryKey: ['case_devices', caseId] });
    onClose();
  };

  const handleMakePrimary = async () => {
    setBusyAction('primary');
    try {
      // A primary device is always a patient device, so promote the role first if
      // this is a backup being elevated — never create a "primary backup".
      if (roleName !== 'patient') {
        const patientId = roleIdByName('patient');
        if (patientId == null) throw new Error('Patient role not found');
        const { error } = await supabase
          .from('case_devices')
          .update({ device_role_id: patientId })
          .eq('id', device.id);
        if (error) throw error;
      }
      await setPrimaryDevice(device.id, caseId);
      toast.success(t('devices.detail.madePrimary', { defaultValue: 'Device set as the primary device.' }));
      await refreshAndClose();
    } catch (error) {
      logger.error('Error setting primary device:', error);
      toast.error(
        t('devices.detail.makePrimaryFailed', {
          defaultValue: 'Could not set as primary: {{msg}}',
          msg: error instanceof Error ? error.message : 'unknown error',
        }),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangeToBackup = async () => {
    setBusyAction('backup');
    try {
      const backupId = roleIdByName('backup');
      if (backupId == null) throw new Error('Backup role not found');
      const { error } = await supabase
        .from('case_devices')
        .update({ device_role_id: backupId, is_primary: false })
        .eq('id', device.id);
      if (error) throw error;
      toast.success(t('devices.detail.madeBackup', { defaultValue: 'Device moved to Backup & Support.' }));
      await refreshAndClose();
    } catch (error) {
      logger.error('Error changing device to backup:', error);
      toast.error(
        t('devices.detail.makeBackupFailed', {
          defaultValue: 'Could not change to backup: {{msg}}',
          msg: error instanceof Error ? error.message : 'unknown error',
        }),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const busy = busyAction !== null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
    >
      {/* Hero header — role-tinted band with the device icon tile + role actions */}
      <div className={cn('shrink-0 border-b border-border px-6 py-4', headerTint)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface shadow-sm">
              <DeviceIcon className="h-7 w-7 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900">
                  {t('devices.detail.deviceN', {
                    defaultValue: 'Device {{n}}: {{type}}',
                    n: deviceIndex + 1,
                    type: device.device_type?.name || t('devices.unknownType', { defaultValue: 'Unknown Device Type' }),
                  })}
                </h2>
                {device.device_role && <DeviceRoleBadge role={device.device_role.name} size="sm" />}
                {device.is_primary && (
                  <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">
                    {t('devices.primary', { defaultValue: 'Primary' })}
                  </Badge>
                )}
              </div>
              {(device.brand?.name || device.model) && (
                <p className="mt-0.5 truncate text-sm text-slate-600">
                  {[device.brand?.name, device.model].filter(Boolean).join(' ')}
                </p>
              )}
              {device.serial_number && (
                <p className="mt-0.5 font-mono text-xs text-slate-500">S/N: {device.serial_number}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canMakePrimary && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleMakePrimary}
                isLoading={busyAction === 'primary'}
                disabled={busy}
                title={t('devices.detail.makePrimary', { defaultValue: 'Set as primary device' })}
              >
                <Star className="me-1.5 h-3.5 w-3.5" />
                {t('devices.detail.setPrimary', { defaultValue: 'Set as Primary' })}
              </Button>
            )}
            {canMakeBackup && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleChangeToBackup}
                isLoading={busyAction === 'backup'}
                disabled={busy}
                title={t('devices.detail.makeBackup', { defaultValue: 'Move to Backup & Support' })}
              >
                <Database className="me-1.5 h-3.5 w-3.5" />
                {t('devices.detail.markBackup', { defaultValue: 'Mark as Backup' })}
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-surface/70 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrolling body — 3-column masonry that fits without scrolling for typical content */}
      <div className="flex-1 overflow-y-auto bg-surface-muted p-4">
        <div className="gap-4 sm:columns-2 lg:columns-3">
          <Section icon={Info} title={t('devices.section.identity', { defaultValue: 'Identity & Specifications' })} tone="bg-info-muted text-info">
            <dl className={STACK}>
              <Field label={t('devices.field.device_type_id', { defaultValue: 'Device Type' })}>
                {device.device_type?.name || EMPTY}
              </Field>
              <Field label={t('devices.field.brand_id', { defaultValue: 'Brand' })}>{device.brand?.name || EMPTY}</Field>
              <Field label={t('devices.field.model', { defaultValue: 'Model' })}>{device.model || EMPTY}</Field>
              <Field label={t('devices.field.serial_number', { defaultValue: 'Serial Number' })} mono>
                {device.serial_number || EMPTY}
              </Field>
              <Field label={t('devices.field.capacity_id', { defaultValue: 'Capacity / Storage' })}>
                {device.capacity?.name || EMPTY}
              </Field>
              <Field label={t('devices.field.condition_id', { defaultValue: 'Condition' })}>
                {device.condition?.name || EMPTY}
              </Field>
              <Field label={t('devices.field.interface_id', { defaultValue: 'Interface' })}>{interfaceName || EMPTY}</Field>
              <Field label={t('devices.field.encryption_id', { defaultValue: 'Encryption' })}>
                {device.encryption_type?.name ? (
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-danger" />
                    {device.encryption_type.name}
                  </span>
                ) : (
                  EMPTY
                )}
              </Field>
            </dl>
          </Section>

          {technicalRows.length > 0 && (
            <Section icon={Cpu} title={t('devices.section.technical', { defaultValue: 'Technical Information' })} tone="bg-warning-muted text-warning">
              <dl className={STACK}>
                {technicalRows.map(({ def, value }) => (
                  <Field key={def.key} label={t(def.labelKey, { defaultValue: def.labelFallback })}>
                    {value}
                  </Field>
                ))}
              </dl>
            </Section>
          )}

          {hasDiagnosis && (
            <Section icon={Stethoscope} title={t('devices.section.diagnosis', { defaultValue: 'Diagnosis & Requirements' })} tone="bg-accent text-accent-foreground">
              <div className={STACK}>
                {device.symptoms && (
                  <Field label={t('devices.field.device_problem', { defaultValue: 'Device Problem' })}>
                    <span className="leading-relaxed">{device.symptoms}</span>
                  </Field>
                )}
                {device.notes && (
                  <Field label={t('devices.field.recovery_requirements', { defaultValue: 'Recovery Requirements' })}>
                    <span className="leading-relaxed">{device.notes}</span>
                  </Field>
                )}
                {device.role_notes && (
                  <Field label={t('devices.field.role_notes', { defaultValue: 'Role Notes' })}>
                    <span className="leading-relaxed">{device.role_notes}</span>
                  </Field>
                )}
              </div>
            </Section>
          )}

          {accessoryNames.length > 0 && (
            <Section icon={Package} title={t('devices.section.accessories', { defaultValue: 'Accessories' })} tone="bg-success-muted text-success">
              <div className="flex flex-wrap gap-2">
                {accessoryNames.map((name, i) => (
                  <span
                    key={`${name}-${i}`}
                    className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {device.password && (
            <Section icon={KeyRound} title={t('devices.section.security', { defaultValue: 'Security' })} tone="bg-danger-muted text-danger">
              <dt className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {t('devices.field.password', { defaultValue: 'Device Password' })}
              </dt>
              <div className="flex items-center gap-2">
                <form className="contents" onSubmit={(e) => e.preventDefault()}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={device.password}
                    readOnly
                    autoComplete="off"
                    aria-label={t('devices.field.password', { defaultValue: 'Device Password' })}
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-slate-900"
                  />
                </form>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPassword((v) => !v)}
                  className="!p-1.5"
                  aria-label={
                    showPassword
                      ? t('common.hide', { defaultValue: 'Hide' })
                      : t('common.show', { defaultValue: 'Show' })
                  }
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Footer — audit metadata + dismiss */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
        <AuditInfo
          createdAt={device.created_at}
          createdByName={device.created_by_profile?.full_name ?? null}
          createdLabel={t('devices.detail.added', { defaultValue: 'Added' })}
        />
        <Button variant="secondary" size="md" onClick={onClose} disabled={busy} className="h-10 rounded-[10px] px-5">
          {t('common.close', { defaultValue: 'Close' })}
        </Button>
      </div>
    </Dialog>
  );
}
