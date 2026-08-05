import { supabase } from './supabaseClient';
import { logger } from './logger';
import { getIntakeStatusForCreation } from './caseService';
import { setPrimaryDevice } from './deviceService';
import type { Database } from '../types/database.types';

type CasesInsert = Database['public']['Tables']['cases']['Insert'];
type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];

export interface CreateCaseWithDevicesInput {
  tenantId: string;
  profileId: string | null;
  profileRole: string | null;
  customerId: string;
  customerName: string;
  priority: CasesInsert['priority'];
  contactId?: string | null;
  clientReference?: string | null;
  serviceTypeId?: string | null;
  serviceLocationId?: string | null;
  companyId?: string | null;
  /** Devices to insert. `isPrimary` marks the patient device. */
  devices: Array<Omit<CaseDeviceInsert, 'tenant_id' | 'case_id'> & { isPrimary?: boolean }>;
}

export interface CreateCaseWithDevicesResult {
  caseId: string;
  caseNumber: string;
  deviceIds: string[];
}

/**
 * The single case-creation path, extracted verbatim from CreateCaseWizard so the
 * wizard and the front-desk check-in surface cannot drift. Order matters: the
 * guard trigger on `cases` requires a matched active intake status_id + name
 * pair on INSERT.
 */
export async function createCaseWithDevices(
  input: CreateCaseWithDevicesInput,
): Promise<CreateCaseWithDevicesResult> {
  const { data: caseNumber, error: numberError } = await supabase
    .rpc('get_next_number', { p_scope: 'case' });

  if (numberError) {
    logger.error('Error generating case number:', numberError);
    if (numberError.message?.includes('not found')) {
      throw new Error('Case numbering system is not configured. Please contact your system administrator to configure it in Settings > System & Numbers.');
    }
    throw new Error(`Failed to generate case number: ${numberError.message}`);
  }
  if (!caseNumber) {
    throw new Error('Failed to generate case number. Please try again or contact support.');
  }

  const intakeStatus = await getIntakeStatusForCreation();

  const caseData: CasesInsert = {
    tenant_id: input.tenantId,
    case_number: caseNumber,
    customer_id: input.customerId,
    subject: `Case for ${input.customerName}`,
    priority: input.priority,
    status: intakeStatus.name,
    status_id: intakeStatus.id,
    phase_entered_at: new Date().toISOString(),
  };
  if (input.contactId) caseData.contact_id = input.contactId;
  if (input.clientReference) caseData.client_reference = input.clientReference;
  if (input.serviceTypeId) caseData.service_type_id = input.serviceTypeId;
  if (input.serviceLocationId) caseData.service_location_id = input.serviceLocationId;
  if (input.companyId) caseData.company_id = input.companyId;
  if (input.profileId) {
    caseData.created_by = input.profileId;
    if (input.profileRole === 'technician') caseData.assigned_to = input.profileId;
  }

  const { data: newCase, error: caseError } = await supabase
    .from('cases').insert(caseData).select().maybeSingle();

  if (caseError) {
    logger.error('Error creating case:', caseError);
    throw new Error(`Failed to create case: ${caseError.message}`);
  }
  if (!newCase) throw new Error('Case was created but no row was returned.');

  const deviceIds: string[] = [];
  if (input.devices.length > 0) {
    const rows: CaseDeviceInsert[] = input.devices.map(({ isPrimary: _p, ...rest }) => ({
      ...rest,
      tenant_id: input.tenantId,
      case_id: newCase.id,
    }));
    const { data: inserted, error: devicesError } = await supabase
      .from('case_devices').insert(rows).select('id');

    if (devicesError) {
      logger.error('Error inserting devices:', devicesError);
      throw new Error(`Failed to insert devices: ${devicesError.message}`);
    }

    (inserted ?? []).forEach((d) => deviceIds.push(d.id));

    const primaryIndex = input.devices.findIndex((d) => d.isPrimary);
    const primaryId = deviceIds[primaryIndex >= 0 ? primaryIndex : 0];
    if (primaryId) await setPrimaryDevice(primaryId, newCase.id);
  }

  return { caseId: newCase.id, caseNumber, deviceIds };
}
