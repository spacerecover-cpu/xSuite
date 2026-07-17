import { supabase } from './supabaseClient';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logger } from './logger';
import type { Database } from '../types/database.types';

type CaseRow = Database['public']['Tables']['cases']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];
type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];

interface DeleteCaseResult {
  success: boolean;
  case_number: string;
  case_title: string;
  log_id: string;
  deleted_counts: {
    devices: number;
    attachments: number;
    communications: number;
    quotes: number;
    reports: number;
    notes: number;
    clones: number;
    inventory_assignments: number;
    portal_visibility: number;
  };
  total_records_deleted: number;
}

export async function deleteCaseService(caseId: string): Promise<DeleteCaseResult> {
  const rl = checkRateLimit(RATE_LIMITS.CASE_DELETION);
  if (!rl.allowed) {
    throw new Error(rl.message);
  }

  try {
    // Capture identifying fields before the row is soft-deleted so success
    // feedback can name the case. delete_case_permanently RETURNS void, so the
    // RPC yields no payload to source these from.
    const { data: caseRow } = await supabase
      .from('cases')
      .select('case_number, subject')
      .eq('id', caseId)
      .maybeSingle();

    const { data, error } = await supabase.rpc('delete_case_permanently', {
      p_case_id: caseId,
    });

    if (error) {
      throw error;
    }

    // The RPC RETURNS void (types: Returns undefined), so `data` is null on
    // success — absence of a payload is NOT a failure signal. If a future
    // revision returns a result object, pass it through; otherwise synthesize.
    if (data && typeof data === 'object') {
      return data as DeleteCaseResult;
    }

    return {
      success: true,
      case_number: caseRow?.case_number ?? '',
      case_title: caseRow?.subject ?? '',
      log_id: '',
      deleted_counts: {
        devices: 0,
        attachments: 0,
        communications: 0,
        quotes: 0,
        reports: 0,
        notes: 0,
        clones: 0,
        inventory_assignments: 0,
        portal_visibility: 0,
      },
      total_records_deleted: 0,
    };
  } catch (error: any) {
    logger.error('Error deleting case:', error);
    throw new Error(error.message || 'Failed to delete case');
  }
}

/** Source device shape read when duplicating a case (subset of case_devices columns). */
export type DuplicateDeviceSource = Partial<{
  id: string;
  device_type_id: string | null;
  brand_id: string | null;
  model: string | null;
  serial_number: string | null;
  capacity_id: string | null;
  condition_id: string | null;
  accessories: string[] | null;
  symptoms: string | null;
  notes: string | null;
  password: string | null;
  encryption_id: string | null;
  device_role_id: number | null;
  is_primary: boolean | null;
  role_notes: string | null;
}>;

/** Source case fields read when duplicating (subset of cases columns + FE aliases). */
export interface DuplicateCaseSource {
  customer_id?: string | null;
  service_type_id?: string | null;
  priority?: string | null;
  case_no?: string | null;
  title?: string | null;
  contact_id?: string | null;
  assigned_engineer_id?: string | null;
  company_id?: string | null;
}

/**
 * Reserve the next case/job number from the canonical `case` sequence — the
 * SAME scope `CreateCaseWizard` uses (`get_next_number({ p_scope: 'case' })`).
 *
 * The legacy `get_next_case_number()` RPC resolves `get_next_number('cases')`
 * (plural), a separate counter row. Duplication used to call it, so duplicated
 * cases were numbered from an orphaned sequence — the live `case` sequence never
 * advanced and the prefix/value diverged (e.g. `CASE-0005` instead of `C-0020`).
 * Calling this keeps duplicates in the one true case-number sequence.
 */
export async function getNextCaseNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_number', { p_scope: 'case' });
  if (error) {
    logger.error('Error getting next case number:', error);
    throw new Error('Failed to get next case number');
  }
  if (!data) {
    throw new Error('Failed to get next case number');
  }
  return data;
}

export interface IntakeStatusRef {
  id: string;
  name: string;
}

/**
 * The intake status new cases start at. The guard trigger on `cases` rejects
 * any INSERT whose status is not an active intake row with a matching
 * status_id, so every creation path must resolve this pair first.
 *
 * Both creation flows register a case as its devices are physically received,
 * so prefer the last intake sub-status ("Device Received") over the bare
 * default ("Registered", reserved for cases logged before media arrives).
 */
export async function getIntakeStatusForCreation(): Promise<IntakeStatusRef> {
  const { data, error } = await supabase
    .from('master_case_statuses')
    .select('id, name')
    .eq('type', 'intake')
    .eq('is_active', true)
    .order('sort_order');
  if (error) {
    logger.error('Error resolving intake status:', error);
    throw new Error('Failed to resolve the intake case status');
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    throw new Error('No active intake case status is configured');
  }
  return rows[rows.length - 1];
}

/**
 * Duplicate a case: assign a new case number, insert a fresh case copied from
 * the source, and copy its devices. Returns the new case row. tenant_id is
 * resolved by the caller from the active session.
 *
 * `caseNumber` lets the caller pass a number already reserved via
 * `getNextCaseNumber()` (e.g. shown in the confirmation modal) so the displayed
 * number is exactly the one assigned; when omitted, one is reserved here.
 */
export async function duplicateCase(
  source: DuplicateCaseSource,
  devices: DuplicateDeviceSource[],
  actor: { id?: string | null; tenantId: string },
  caseNumber?: string,
  options?: { parentCaseId?: string | null; caseOrigin?: 'new' | 're_recovery' },
): Promise<CaseRow> {
  const nextCaseNumber = caseNumber ?? (await getNextCaseNumber());
  const intakeStatus = await getIntakeStatusForCreation();

  const newCaseData: CaseInsert = {
    tenant_id: actor.tenantId,
    case_number: nextCaseNumber,
    customer_id: source.customer_id ?? null,
    service_type_id: source.service_type_id ?? null,
    priority: source.priority ?? null,
    status: intakeStatus.name,
    status_id: intakeStatus.id,
    phase_entered_at: new Date().toISOString(),
    client_reference: source.case_no ?? null,
    subject: source.title ?? null,
    created_by: actor.id ?? null,
    parent_case_id: options?.parentCaseId ?? null,
    case_origin: options?.caseOrigin ?? 'new',
  };
  if (source.contact_id) newCaseData.contact_id = source.contact_id;
  if (source.assigned_engineer_id) newCaseData.assigned_to = source.assigned_engineer_id;
  if (source.company_id) newCaseData.company_id = source.company_id;

  const { data: newCase, error: caseError } = await supabase
    .from('cases')
    .insert(newCaseData)
    .select()
    .maybeSingle();
  if (caseError) {
    logger.error('Error creating duplicate case:', caseError);
    throw new Error(`Failed to duplicate case: ${caseError.message}`);
  }
  if (!newCase) {
    throw new Error('Failed to duplicate case: insert returned no row');
  }

  if (devices.length > 0) {
    const devicesToInsert: CaseDeviceInsert[] = devices.map((device) => ({
      tenant_id: actor.tenantId,
      case_id: newCase.id,
      device_type_id: device.device_type_id ?? null,
      brand_id: device.brand_id ?? null,
      model: device.model ?? null,
      serial_number: device.serial_number ?? null,
      capacity_id: device.capacity_id ?? null,
      condition_id: device.condition_id ?? null,
      accessories: device.accessories ?? null,
      symptoms: device.symptoms ?? null,
      notes: device.notes ?? null,
      password: device.password ?? null,
      encryption_id: device.encryption_id ?? null,
      device_role_id: device.device_role_id ?? null,
      is_primary: device.is_primary ?? null,
      role_notes: device.role_notes ?? null,
      created_by: actor.id ?? null,
    }));

    const { error: devicesError } = await supabase
      .from('case_devices')
      .insert(devicesToInsert);
    if (devicesError) {
      logger.error('Error duplicating devices:', devicesError);
      // Non-atomic two-step write: the case row already committed. Roll it back
      // (soft delete) so a device-less intake case — which never fired the
      // custody-baseline trigger — is not stranded in the active pipeline.
      const { error: rollbackError } = await supabase
        .from('cases')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', newCase.id);
      if (rollbackError) {
        logger.error('Failed to roll back orphaned case after device duplication error:', rollbackError);
      }
      throw new Error(`Failed to duplicate devices: ${devicesError.message}`);
    }
  }

  return newCase;
}

/**
 * Start a Re-Recovery: create a NEW case linked to `sourceCaseId` (device came
 * back for another attempt). Copies the device(s) + customer/company, starts at
 * intake with fresh custody, marks `case_origin='re_recovery'` + `parent_case_id`,
 * and cross-links both cases in `case_job_history` so the original's full history
 * is preserved and discoverable. Reuses `duplicateCase`'s copy path.
 */
export async function createReRecoveryCase(
  source: DuplicateCaseSource,
  devices: DuplicateDeviceSource[],
  actor: { id?: string | null; tenantId: string },
  sourceCaseId: string,
  caseNumber?: string,
): Promise<CaseRow> {
  const newCase = await duplicateCase(source, devices, actor, caseNumber, {
    parentCaseId: sourceCaseId,
    caseOrigin: 're_recovery',
  });

  // Cross-link both cases in the append-only audit trail (tenant_id + actor are
  // filled by the case_job_history audit trigger under the authed session).
  const { error: linkError } = await supabase.from('case_job_history').insert([
    {
      tenant_id: actor.tenantId,
      case_id: sourceCaseId,
      action: 'rerecovery_created',
      old_value: null,
      new_value: newCase.case_number,
      details: JSON.stringify({
        rerecovery_case_id: newCase.id,
        rerecovery_case_number: newCase.case_number,
      }),
    },
    {
      tenant_id: actor.tenantId,
      case_id: newCase.id,
      action: 'rerecovery_of',
      old_value: source.case_no ?? null,
      new_value: null,
      details: JSON.stringify({ parent_case_id: sourceCaseId, parent_case_no: source.case_no ?? null }),
    },
  ]);
  if (linkError) {
    // The case is already created + linked via parent_case_id; a history-log
    // failure shouldn't lose the case. Log and continue.
    logger.error('Re-recovery created but linkage history failed:', linkError);
  }

  return newCase;
}
