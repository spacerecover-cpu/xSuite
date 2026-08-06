import { supabase } from './supabaseClient';
import { logger } from './logger';
import { getIntakeStatusForCreation } from './caseService';
import { setPrimaryDevice } from './deviceService';
import { uploadDocumentSignature } from './fileStorageService';
import { sha256Hex } from './pdf/contentHash';
import type { Database } from '../types/database.types';
import type { CapturedSignature } from '../components/cases/SignatureCaptureModal';

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
  /**
   * One physical check-in attempt. Survives a browser reload, so a resubmit
   * returns the case the first submit created instead of taking a second
   * hand-over of the same devices into an append-only custody ledger.
   */
  idempotencyKey?: string;
}

export interface CreateCaseWithDevicesResult {
  caseId: string;
  caseNumber: string;
  deviceIds: string[];
  /** Set when this attempt matched an earlier one and no new case was created. */
  reused?: true;
}

/**
 * The case a previous submit of this same attempt already created, or null.
 * Tenant-scoped by the caller's RLS as well as the explicit filter.
 */
async function findCaseByIntakeKey(
  tenantId: string,
  key: string,
): Promise<CreateCaseWithDevicesResult | null> {
  const { data, error } = await supabase
    .from('cases')
    .select('id, case_number')
    .eq('tenant_id', tenantId)
    .eq('intake_idempotency_key', key)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('Error resolving intake idempotency key:', error);
    return null;
  }
  if (!data) return null;

  const { data: devices } = await supabase
    .from('case_devices')
    .select('id')
    .eq('case_id', data.id)
    .is('deleted_at', null);

  return {
    caseId: data.id,
    caseNumber: data.case_number ?? '',
    deviceIds: (devices ?? []).map((d) => d.id),
    reused: true,
  };
}

/**
 * Thrown once the `case_devices` INSERT has been sent. That statement fires
 * `trg_log_device_received_custody`, and `chain_of_custody` is append-only — so a
 * retry past this point can only ever append a SECOND set of DEVICE_RECEIVED
 * events for ONE physical hand-over, which nothing can correct afterwards.
 *
 * A rejected insert and an insert whose response was lost are indistinguishable
 * to the client, so this is thrown for the insert error too: callers must treat
 * it as "the devices may already be in custody", surface `created.caseNumber`,
 * and refuse the retry. Failures BEFORE the insert stay plain Errors, because
 * nothing was written that a retry could duplicate.
 */
export class DevicesInCustodyError extends Error {
  readonly created: CreateCaseWithDevicesResult;

  constructor(message: string, created: CreateCaseWithDevicesResult) {
    super(message);
    this.name = 'DevicesInCustodyError';
    this.created = created;
  }
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
  // Before anything is reserved or written: this attempt may already have landed.
  // Checking first also means a resubmit does not burn a case number.
  if (input.idempotencyKey) {
    const already = await findCaseByIntakeKey(input.tenantId, input.idempotencyKey);
    if (already) return already;
  }

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
  if (input.idempotencyKey) caseData.intake_idempotency_key = input.idempotencyKey;

  const { data: newCase, error: caseError } = await supabase
    .from('cases').insert(caseData).select().maybeSingle();

  if (caseError) {
    // 23505 on uq_cases_intake_idempotency_key means a concurrent submit of this
    // same attempt won the race. That is the guard working, not a failure.
    if (caseError.code === '23505' && input.idempotencyKey) {
      const raced = await findCaseByIntakeKey(input.tenantId, input.idempotencyKey);
      if (raced) return raced;
    }
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
      throw new DevicesInCustodyError(
        `Failed to insert devices: ${devicesError.message}`,
        { caseId: newCase.id, caseNumber, deviceIds },
      );
    }

    (inserted ?? []).forEach((d) => deviceIds.push(d.id));

    const primaryIndex = input.devices.findIndex((d) => d.isPrimary);
    const primaryId = deviceIds[primaryIndex >= 0 ? primaryIndex : 0];
    if (primaryId) {
      try {
        await setPrimaryDevice(primaryId, newCase.id);
      } catch (error) {
        throw new DevicesInCustodyError(
          (error as Error).message,
          { caseId: newCase.id, caseNumber, deviceIds },
        );
      }
    }
  }

  return { caseId: newCase.id, caseNumber, deviceIds };
}

export type DepositorRelationship = 'self' | 'authorized_agent' | 'company_rep' | 'courier';

/** Client-side mirror of the log_case_intake ID gate. */
export function requireDepositorId(relationship: DepositorRelationship): boolean {
  return relationship !== 'self';
}

export interface LogCaseIntakeInput {
  caseId: string;
  deviceIds: string[];
  depositorName?: string | null;
  depositorMobile?: string | null;
  depositorId?: string | null;
  depositorRelationship?: DepositorRelationship | null;
  receiptInstanceId?: string | null;
}

/** Stamps per-device intake state and appends the INTAKE_RECEIPT_SIGNED custody event. */
export async function logCaseIntake(input: LogCaseIntakeInput): Promise<string> {
  if (
    input.depositorRelationship &&
    requireDepositorId(input.depositorRelationship) &&
    (input.depositorId ?? '').trim() === ''
  ) {
    throw new Error('National ID is required when the depositor is not the customer');
  }

  const { data, error } = await supabase.rpc('log_case_intake', {
    p_case_id: input.caseId,
    p_device_ids: input.deviceIds,
    p_depositor_name: input.depositorName ?? undefined,
    p_depositor_mobile: input.depositorMobile ?? undefined,
    p_depositor_id: input.depositorId ?? undefined,
    p_depositor_relationship: input.depositorRelationship ?? undefined,
    p_receipt_instance_id: input.receiptInstanceId ?? undefined,
  });

  if (error) {
    logger.error('Error logging case intake:', error);
    throw error;
  }
  return (data ?? '') as string;
}

/** Private bucket — a customer's handwritten mark is not public branding art. */
const SIGNATURE_BUCKET = 'document-signatures';

/** Persists a counter-captured customer signature against the receipt instance. */
export async function signIntakeReceipt(
  instanceId: string,
  sig: CapturedSignature,
  customerId: string,
): Promise<string> {
  const signerName = sig.method === 'typed' ? (sig.typedValue ?? '') : (sig.signerName ?? '');

  // The drawn mark IS the proof of receipt: upload it and hash it, or the
  // receipt prints a signer name with no signature.
  let imagePath: string | undefined;
  let sha: string | undefined;
  if (sig.imageBlob && (sig.method === 'drawn' || sig.method === 'uploaded_image')) {
    const file = new File([sig.imageBlob], `sig-${instanceId}-customer.png`, { type: 'image/png' });
    const res = await uploadDocumentSignature(file, instanceId);
    if (!res.success || !res.filePath) throw new Error(res.error ?? 'Signature upload failed');
    imagePath = res.filePath;
    sha = await sha256Hex(sig.imageBlob);
  }

  const { data, error } = await supabase.rpc('staff_sign_off_document', {
    p_instance_id: instanceId,
    p_slot: 'customer',
    p_method: sig.method,
    p_signer_name: signerName,
    p_typed_value: sig.typedValue ?? undefined,
    p_signer_customer_id: customerId,
    p_image_path: imagePath,
    p_image_bucket: imagePath ? SIGNATURE_BUCKET : undefined,
    p_signature_sha256: sha,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
  if (error) {
    logger.error('Error signing intake receipt:', error);
    throw error;
  }
  const result = data as { signature_id?: string } | null;
  if (!result?.signature_id) throw new Error('Sign-off did not return a signature id');
  return result.signature_id;
}

export interface IntakeConsents {
  tenantId: string;
  customerId: string;
  caseId: string;
  phoneE164?: string | null;
  /** WhatsApp utility notifications. Declining is valid and must not block intake. */
  whatsappUtility: boolean;
  /** Authorization for recovery attempts that may permanently alter the media. */
  destructiveAuthorized: boolean;
  consentText: string;
}

/**
 * Records consent as separable facts, each independently provable. Marketing
 * scope is deliberately never written at intake — bundling it into a service
 * signature is the dark pattern GDPR Art. 7(2) prohibits.
 * whatsapp_consents is append-only: insert, never update.
 */
/** What a consent capture actually managed to write. */
export interface RecordedIntakeConsents {
  whatsapp: boolean;
  /** The DESTRUCTIVE_ATTEMPT_AUTHORIZED custody event — no other in-app writer. */
  destructiveCustody: boolean;
  destructiveNote: boolean;
}

/**
 * Thrown when a requested consent did not fully land. Carries what DID land, so
 * the surface can name the actual gap instead of inferring one from what the
 * operator ticked — the two diverge exactly when it matters most.
 */
export class IntakeConsentError extends Error {
  readonly recorded: RecordedIntakeConsents;

  constructor(message: string, recorded: RecordedIntakeConsents) {
    super(message);
    this.name = 'IntakeConsentError';
    this.recorded = recorded;
  }
}

/**
 * Records consent as separable facts, each independently provable. Marketing
 * scope is deliberately never written at intake — bundling it into a service
 * signature is the dark pattern GDPR Art. 7(2) prohibits.
 *
 * The two consents are attempted independently: a messaging opt-in failing must
 * not cost the lab the destructive-attempt authorization, which is the legally
 * significant one. Within the destructive consent the CUSTODY EVENT is appended
 * first and the note only follows it, because the note can be re-created from any
 * case screen while the custody event has no other in-app writer — so if only one
 * of the pair can land, it must be the custody event.
 */
export async function captureIntakeConsents(input: IntakeConsents): Promise<void> {
  const recorded: RecordedIntakeConsents = {
    whatsapp: false,
    destructiveCustody: false,
    destructiveNote: false,
  };
  const failures: string[] = [];

  if (input.whatsappUtility) {
    const { error } = await supabase.from('whatsapp_consents').insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      scope: 'utility',
      action: 'opt_in',
      source: 'intake_form',
      phone_e164: input.phoneE164 ?? null,
      consent_text: input.consentText,
    });
    if (error) {
      logger.error('Error recording intake consent:', error);
      failures.push('WhatsApp updates consent');
    } else {
      recorded.whatsapp = true;
    }
  }

  if (input.destructiveAuthorized) {
    const { error: custodyError } = await supabase.rpc('log_chain_of_custody', {
      p_case_id: input.caseId,
      p_action_category: 'evidence_handling',
      p_action: 'DESTRUCTIVE_ATTEMPT_AUTHORIZED',
      p_description: 'Customer authorized potentially destructive recovery attempts at check-in',
      p_metadata: { source: 'intake_checkin' },
    });

    if (custodyError) {
      logger.error('Error logging destructive-attempt custody event:', custodyError);
      failures.push('destructive-attempt authorization');
    } else {
      recorded.destructiveCustody = true;

      const { error: noteError } = await supabase.from('case_internal_notes').insert({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        content: 'Customer authorized recovery attempts that may permanently alter the media (captured at check-in).',
      });
      if (noteError) {
        logger.error('Error recording destructive-attempt authorization note:', noteError);
        failures.push('destructive-attempt note');
      } else {
        recorded.destructiveNote = true;
      }
    }
  }

  if (failures.length > 0) {
    throw new IntakeConsentError(`Could not record: ${failures.join(', ')}`, recorded);
  }
}
