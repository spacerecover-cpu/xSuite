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
    const { data, error } = await supabase.rpc('delete_case_permanently', {
      p_case_id: caseId,
    });

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from deletion');
    }

    return data as DeleteCaseResult;
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
 * Duplicate a case: generate a new case number, insert a fresh case copied from
 * the source, and copy its devices. Returns the new case row. Extracted verbatim
 * from useCaseMutations.duplicateCaseMutation so the case data layer has a real
 * service seam. tenant_id is resolved by the caller from the active session.
 */
export async function duplicateCase(
  source: DuplicateCaseSource,
  devices: DuplicateDeviceSource[],
  actor: { id?: string | null; tenantId: string },
): Promise<CaseRow> {
  const { data: nextCaseNumber, error: numberError } = await supabase.rpc('get_next_case_number');
  if (numberError) {
    logger.error('Error getting next case number:', numberError);
    throw new Error('Failed to get next case number');
  }

  const newCaseData: CaseInsert = {
    tenant_id: actor.tenantId,
    case_number: nextCaseNumber,
    customer_id: source.customer_id ?? null,
    service_type_id: source.service_type_id ?? null,
    priority: source.priority ?? null,
    status: 'Received',
    client_reference: source.case_no ?? null,
    subject: source.title ?? null,
    created_by: actor.id ?? null,
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
      throw new Error(`Failed to duplicate devices: ${devicesError.message}`);
    }
  }

  return newCase;
}
