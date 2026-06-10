import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

export type ActionCategory =
  | 'creation'
  | 'modification'
  | 'access'
  | 'transfer'
  | 'verification'
  | 'communication'
  | 'evidence_handling'
  | 'financial'
  | 'critical_event';

export type TransferStatus = 'initiated' | 'pending_acceptance' | 'accepted' | 'rejected' | 'cancelled';

export type IntegrityCheckResult = 'passed' | 'failed' | 'warning' | 'not_applicable';

// TODO(B8): the rich Chain-of-Custody UX (witnesses, signatures, before/after
// values, hash algorithm, digital signatures, separate evidence references,
// entry numbering, physical inspection fields, supervisor approvals) is
// not yet persisted by the live `chain_of_custody*` tables. The DB tracks a
// leaner shape: `action`, `description`, `actor_name`, `actor_role`,
// `actor_id`, `device_id`, `location`, `custody_status`, `evidence_hash`,
// `metadata`, `created_at`. Fields below that are not backed by columns are
// derived from `metadata` or synthesized (e.g. `entry_number` from row index).
// Restore real columns + RPC params via migration before treating these as
// authoritative for legal/forensic export.

type ChainOfCustodyRow = Database['public']['Tables']['chain_of_custody']['Row'];
type CustodyTransferRow = Database['public']['Tables']['chain_of_custody_transfers']['Row'];
type AccessLogRow = Database['public']['Tables']['chain_of_custody_access_log']['Row'];
type IntegrityCheckRow = Database['public']['Tables']['chain_of_custody_integrity_checks']['Row'];

export interface ChainOfCustodyEntry {
  id: string;
  case_id: string;
  entry_number: number;
  action_category: ActionCategory;
  action_type: string;
  action_description: string;
  actor_id?: string;
  actor_name: string;
  actor_role?: string;
  actor_ip_address?: string;
  actor_user_agent?: string;
  device_id?: string;
  evidence_reference?: string;
  evidence_description?: string;
  location_facility?: string;
  location_details?: string;
  hash_algorithm?: string;
  hash_value?: string;
  previous_hash?: string;
  digital_signature?: string;
  before_values?: Record<string, any>;
  after_values?: Record<string, any>;
  metadata?: Record<string, any>;
  witness_id?: string;
  witness_name?: string;
  supervisor_id?: string;
  supervisor_approved_at?: string;
  occurred_at: string;
  created_at: string;
}

export interface CustodyTransfer {
  id: string;
  case_id: string;
  custody_entry_id?: string;
  transfer_reason: string;
  transfer_method?: string;
  transfer_location?: string;
  from_custodian_id?: string;
  from_custodian_name: string;
  to_custodian_id?: string;
  to_custodian_name: string;
  condition_before?: string;
  condition_after?: string;
  condition_verified: boolean;
  seal_number?: string;
  new_seal_number?: string;
  seal_intact?: boolean;
  transfer_status: TransferStatus;
  initiated_at: string;
  accepted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  from_signature?: string;
  to_signature?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AccessLogEntry {
  id: string;
  case_id: string;
  custody_entry_id?: string;
  device_id?: string;
  access_type: string;
  access_purpose: string;
  access_method?: string;
  tools_used?: string[];
  accessor_id?: string;
  accessor_name: string;
  supervisor_id?: string;
  supervisor_approved: boolean;
  access_started_at: string;
  access_ended_at?: string;
  duration_minutes?: number;
  access_location?: string;
  notes?: string;
  findings?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface IntegrityCheck {
  id: string;
  case_id: string;
  device_id?: string;
  custody_entry_id?: string;
  check_type: string;
  check_reason?: string;
  scheduled_check: boolean;
  expected_hash?: string;
  actual_hash?: string;
  hash_algorithm?: string;
  hash_match?: boolean;
  physical_inspection_performed: boolean;
  physical_condition?: string;
  seal_number?: string;
  seal_intact?: boolean;
  overall_result: IntegrityCheckResult;
  findings?: string;
  anomalies?: string[];
  photo_urls?: string[];
  document_urls?: string[];
  inspector_id?: string;
  inspector_name: string;
  witness_id?: string;
  checked_at: string;
  next_check_due?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

function asJsonRecord(value: unknown): Record<string, any> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return undefined;
}

function mapChainOfCustodyRow(row: ChainOfCustodyRow, indexFromEnd: number): ChainOfCustodyEntry {
  const meta = asJsonRecord(row.metadata) ?? {};
  return {
    id: row.id,
    case_id: row.case_id,
    // TODO(B8): no entry_number column; derive sequential number from query order
    entry_number: indexFromEnd,
    action_category: row.action_category as ActionCategory,
    // DB column is `action`; legacy interface used both action_type + action_description
    action_type: row.action,
    action_description: row.description ?? row.action,
    actor_id: row.actor_id ?? undefined,
    actor_name: row.actor_name,
    actor_role: row.actor_role ?? undefined,
    // TODO(B8): no actor_ip_address / actor_user_agent columns — surface via metadata
    actor_ip_address: typeof meta.actor_ip_address === 'string' ? meta.actor_ip_address : undefined,
    actor_user_agent: typeof meta.actor_user_agent === 'string' ? meta.actor_user_agent : undefined,
    device_id: row.device_id ?? undefined,
    // TODO(B8): no evidence_reference / hash_algorithm / digital_signature columns
    evidence_reference: typeof meta.evidence_reference === 'string' ? meta.evidence_reference : undefined,
    evidence_description: typeof meta.evidence_description === 'string' ? meta.evidence_description : undefined,
    location_facility: row.location ?? undefined,
    location_details: typeof meta.location_details === 'string' ? meta.location_details : undefined,
    hash_algorithm: typeof meta.hash_algorithm === 'string' ? meta.hash_algorithm : undefined,
    hash_value: row.evidence_hash ?? undefined,
    previous_hash: typeof meta.previous_hash === 'string' ? meta.previous_hash : undefined,
    digital_signature: typeof meta.digital_signature === 'string' ? meta.digital_signature : undefined,
    before_values: asJsonRecord(meta.before_values),
    after_values: asJsonRecord(meta.after_values),
    metadata: meta,
    witness_id: typeof meta.witness_id === 'string' ? meta.witness_id : undefined,
    witness_name: typeof meta.witness_name === 'string' ? meta.witness_name : undefined,
    supervisor_id: typeof meta.supervisor_id === 'string' ? meta.supervisor_id : undefined,
    supervisor_approved_at:
      typeof meta.supervisor_approved_at === 'string' ? meta.supervisor_approved_at : undefined,
    // DB has no occurred_at; fall back to created_at
    occurred_at: row.created_at,
    created_at: row.created_at,
  };
}

function mapCustodyTransferRow(row: CustodyTransferRow): CustodyTransfer {
  // Extra UI-only fields (method/location/conditions/seal/signatures) are
  // packed into `notes` as JSON when they exist — see initiateCustodyTransfer.
  let parsedNotes: Record<string, any> = {};
  if (row.notes) {
    try {
      const candidate = JSON.parse(row.notes);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedNotes = candidate as Record<string, any>;
      }
    } catch {
      parsedNotes = { _raw: row.notes };
    }
  }
  const transferStatus = (row.transfer_status ?? 'initiated') as TransferStatus;
  return {
    id: row.id,
    case_id: row.case_id,
    custody_entry_id: typeof parsedNotes.custody_entry_id === 'string' ? parsedNotes.custody_entry_id : undefined,
    transfer_reason: row.transfer_reason,
    transfer_method: typeof parsedNotes.transfer_method === 'string' ? parsedNotes.transfer_method : undefined,
    transfer_location:
      typeof parsedNotes.transfer_location === 'string'
        ? parsedNotes.transfer_location
        : row.from_location ?? row.to_location ?? undefined,
    from_custodian_id: row.from_person_id ?? undefined,
    from_custodian_name: row.from_person_name,
    to_custodian_id: row.to_person_id ?? undefined,
    to_custodian_name: row.to_person_name,
    condition_before: typeof parsedNotes.condition_before === 'string' ? parsedNotes.condition_before : undefined,
    condition_after: typeof parsedNotes.condition_after === 'string' ? parsedNotes.condition_after : undefined,
    condition_verified: parsedNotes.condition_verified === true,
    seal_number: typeof parsedNotes.seal_number === 'string' ? parsedNotes.seal_number : undefined,
    new_seal_number: typeof parsedNotes.new_seal_number === 'string' ? parsedNotes.new_seal_number : undefined,
    seal_intact: typeof parsedNotes.seal_intact === 'boolean' ? parsedNotes.seal_intact : undefined,
    transfer_status: transferStatus,
    // DB has no initiated_at column; created_at is the closest equivalent
    initiated_at: row.created_at,
    accepted_at: row.accepted_at ?? undefined,
    rejected_at: row.rejected_at ?? undefined,
    rejection_reason: row.rejection_reason ?? undefined,
    from_signature: typeof parsedNotes.from_signature === 'string' ? parsedNotes.from_signature : undefined,
    to_signature: typeof parsedNotes.to_signature === 'string' ? parsedNotes.to_signature : undefined,
    metadata: asJsonRecord(parsedNotes.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAccessLogRow(row: AccessLogRow): AccessLogEntry {
  return {
    id: row.id,
    case_id: row.case_id,
    custody_entry_id: row.custody_entry_id ?? undefined,
    device_id: row.device_id ?? undefined,
    access_type: row.access_type,
    access_purpose: row.access_purpose,
    access_method: row.access_method ?? undefined,
    tools_used: row.tools_used ?? undefined,
    accessor_id: row.accessor_id ?? undefined,
    accessor_name: row.accessor_name,
    supervisor_id: row.supervisor_id ?? undefined,
    supervisor_approved: row.supervisor_approved ?? false,
    // DB allows null but the interface expects string; default to created_at
    access_started_at: row.access_started_at ?? row.created_at ?? new Date().toISOString(),
    access_ended_at: row.access_ended_at ?? undefined,
    access_location: row.access_location ?? undefined,
    notes: row.notes ?? undefined,
    findings: row.findings ?? undefined,
    metadata: asJsonRecord(row.metadata),
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

function mapIntegrityCheckRow(row: IntegrityCheckRow): IntegrityCheck {
  // Extra UI-only fields (hash_algorithm, hash_match, physical_*, seal_*,
  // inspector_name, anomalies, findings, metadata) are packed into `details`
  // as JSON when they exist — see performIntegrityCheck.
  let parsedDetails: Record<string, any> = {};
  if (row.details) {
    try {
      const candidate = JSON.parse(row.details);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedDetails = candidate as Record<string, any>;
      }
    } catch {
      parsedDetails = { _raw: row.details };
    }
  }
  return {
    id: row.id,
    case_id: row.case_id,
    device_id: row.device_id ?? undefined,
    custody_entry_id: typeof parsedDetails.custody_entry_id === 'string' ? parsedDetails.custody_entry_id : undefined,
    check_type: row.check_type,
    check_reason: typeof parsedDetails.check_reason === 'string' ? parsedDetails.check_reason : undefined,
    scheduled_check: parsedDetails.scheduled_check === true,
    expected_hash: row.expected_hash ?? undefined,
    actual_hash: row.actual_hash ?? undefined,
    hash_algorithm: typeof parsedDetails.hash_algorithm === 'string' ? parsedDetails.hash_algorithm : undefined,
    hash_match: typeof parsedDetails.hash_match === 'boolean' ? parsedDetails.hash_match : undefined,
    physical_inspection_performed: parsedDetails.physical_inspection_performed === true,
    physical_condition:
      typeof parsedDetails.physical_condition === 'string' ? parsedDetails.physical_condition : undefined,
    seal_number: typeof parsedDetails.seal_number === 'string' ? parsedDetails.seal_number : undefined,
    seal_intact: typeof parsedDetails.seal_intact === 'boolean' ? parsedDetails.seal_intact : undefined,
    overall_result: row.result as IntegrityCheckResult,
    findings: typeof parsedDetails.findings === 'string' ? parsedDetails.findings : undefined,
    anomalies: Array.isArray(parsedDetails.anomalies)
      ? (parsedDetails.anomalies as unknown[]).filter((a): a is string => typeof a === 'string')
      : undefined,
    photo_urls: Array.isArray(parsedDetails.photo_urls)
      ? (parsedDetails.photo_urls as unknown[]).filter((a): a is string => typeof a === 'string')
      : undefined,
    document_urls: Array.isArray(parsedDetails.document_urls)
      ? (parsedDetails.document_urls as unknown[]).filter((a): a is string => typeof a === 'string')
      : undefined,
    inspector_id: row.checked_by ?? undefined,
    inspector_name:
      typeof parsedDetails.inspector_name === 'string' ? parsedDetails.inspector_name : 'Unknown',
    witness_id: typeof parsedDetails.witness_id === 'string' ? parsedDetails.witness_id : undefined,
    checked_at: row.checked_at ?? row.created_at,
    next_check_due: typeof parsedDetails.next_check_due === 'string' ? parsedDetails.next_check_due : undefined,
    metadata: asJsonRecord(parsedDetails.metadata),
    created_at: row.created_at,
  };
}

export async function getChainOfCustody(
  caseId: string,
  options?: {
    category?: ActionCategory;
    startDate?: Date;
    endDate?: Date;
    actorId?: string;
    limit?: number;
  }
): Promise<ChainOfCustodyEntry[]> {
  // chain_of_custody schema has no entry_number or occurred_at column.
  // Order by created_at instead; filter date ranges via created_at.
  let query = supabase
    .from('chain_of_custody')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (options?.category) {
    query = query.eq('action_category', options.category);
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }

  if (options?.actorId) {
    query = query.eq('actor_id', options.actorId);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Error fetching Chain of Custody:', error);
    throw error;
  }

  const rows = data ?? [];
  // Newest first; assign descending entry_number so older entries have lower numbers.
  return rows.map((row, idx) => mapChainOfCustodyRow(row, rows.length - idx));
}

export async function logChainOfCustody(params: {
  caseId: string;
  actionCategory: ActionCategory;
  actionType: string;
  actionDescription: string;
  deviceId?: string;
  evidenceReference?: string;
  beforeValues?: Record<string, any>;
  afterValues?: Record<string, any>;
  metadata?: Record<string, any>;
}): Promise<string> {
  // TODO(B8): the RPC signature only supports p_action, p_action_category,
  // p_case_id, p_custody_status, p_description, p_device_id, p_location,
  // p_metadata. We fold the rest of the requested fields into p_metadata so
  // they round-trip through mapChainOfCustodyRow.
  const mergedMetadata: Record<string, any> = {
    ...(params.metadata ?? {}),
    ...(params.evidenceReference ? { evidence_reference: params.evidenceReference } : {}),
    ...(params.beforeValues ? { before_values: params.beforeValues } : {}),
    ...(params.afterValues ? { after_values: params.afterValues } : {}),
    action_type: params.actionType,
  };

  const { data, error } = await supabase.rpc('log_chain_of_custody', {
    p_case_id: params.caseId,
    p_action_category: params.actionCategory,
    p_action: params.actionType,
    p_description: params.actionDescription,
    p_device_id: params.deviceId ?? '',
    p_metadata: mergedMetadata,
  });

  if (error) {
    logger.error('Error logging Chain of Custody:', error);
    throw error;
  }

  return (data ?? '') as string;
}

export async function initiateCustodyTransfer(params: {
  caseId: string;
  transferReason: string;
  fromCustodianName: string;
  toCustodianId: string;
  toCustodianName: string;
  transferMethod?: string;
  transferLocation?: string;
  conditionBefore?: string;
  sealNumber?: string;
  metadata?: Record<string, any>;
}): Promise<CustodyTransfer> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  // TODO(B8): chain_of_custody_transfers lacks columns for
  // transfer_method/transfer_location/condition_*/seal_*/signatures.
  // Persist them through `notes` as JSON for now so the UI can round-trip.
  const notesPayload = JSON.stringify({
    transfer_method: params.transferMethod,
    transfer_location: params.transferLocation,
    condition_before: params.conditionBefore,
    seal_number: params.sealNumber,
    metadata: params.metadata,
  });

  const insertPayload: Database['public']['Tables']['chain_of_custody_transfers']['Insert'] = {
    case_id: params.caseId,
    transfer_reason: params.transferReason,
    from_person_id: userId ?? null,
    from_person_name: params.fromCustodianName,
    to_person_id: params.toCustodianId,
    to_person_name: params.toCustodianName,
    from_location: params.transferLocation ?? null,
    notes: notesPayload,
    transfer_status: 'pending_acceptance',
    // tenant_id is required by the table type but is auto-filled by the
    // set_tenant_and_audit_fields trigger. supabase-js types still demand the
    // field on Insert, so we use a non-null assertion via the typed payload.
    tenant_id: undefined as unknown as string,
  };

  const { data, error } = await supabase
    .from('chain_of_custody_transfers')
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error initiating custody transfer:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Custody transfer insert returned no row');
  }

  await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'transfer',
    actionType: 'CUSTODY_TRANSFER_INITIATED',
    actionDescription: `Custody transfer initiated to ${params.toCustodianName}`,
    metadata: {
      transfer_id: data.id,
      reason: params.transferReason,
    },
  });

  return mapCustodyTransferRow(data);
}

export async function acceptCustodyTransfer(params: {
  transferId: string;
  conditionAfter?: string;
  sealIntact?: boolean;
  newSealNumber?: string;
  signature?: string;
}): Promise<CustodyTransfer> {
  // The transfers table is append-only for clients (guard trigger + revoked
  // grants), so the pending -> accepted transition only exists through the
  // SECURITY DEFINER RPC. It merges the response fields into the packed-notes
  // JSON and writes the chain_of_custody event server-side.
  const { data, error } = await supabase.rpc('respond_to_custody_transfer', {
    p_transfer_id: params.transferId,
    p_action: 'accept',
    p_payload: {
      condition_after: params.conditionAfter ?? null,
      seal_intact: params.sealIntact ?? null,
      new_seal_number: params.newSealNumber ?? null,
      signature: params.signature ?? null,
    },
  });

  if (error) {
    logger.error('Error accepting custody transfer:', error);
    throw error;
  }

  if (!data) {
    throw new Error(`Custody transfer ${params.transferId} not found`);
  }

  return mapCustodyTransferRow(data);
}

export async function rejectCustodyTransfer(params: {
  transferId: string;
  rejectionReason: string;
}): Promise<CustodyTransfer> {
  const { data, error } = await supabase.rpc('respond_to_custody_transfer', {
    p_transfer_id: params.transferId,
    p_action: 'reject',
    p_payload: { rejection_reason: params.rejectionReason },
  });

  if (error) {
    logger.error('Error rejecting custody transfer:', error);
    throw error;
  }

  if (!data) {
    throw new Error(`Custody transfer ${params.transferId} not found`);
  }

  return mapCustodyTransferRow(data);
}

export async function getCustodyTransfers(caseId: string): Promise<CustodyTransfer[]> {
  // DB has no `initiated_at` column; order by created_at instead.
  const { data, error } = await supabase
    .from('chain_of_custody_transfers')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching custody transfers:', error);
    throw error;
  }

  return (data ?? []).map(mapCustodyTransferRow);
}

export async function logAccess(params: {
  caseId: string;
  deviceId?: string;
  accessType: string;
  accessPurpose: string;
  accessMethod?: string;
  toolsUsed?: string[];
  accessorName: string;
  accessLocation?: string;
  notes?: string;
  metadata?: Record<string, any>;
}): Promise<AccessLogEntry> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const insertPayload: Database['public']['Tables']['chain_of_custody_access_log']['Insert'] = {
    case_id: params.caseId,
    device_id: params.deviceId ?? null,
    access_type: params.accessType,
    access_purpose: params.accessPurpose,
    access_method: params.accessMethod ?? null,
    tools_used: params.toolsUsed ?? null,
    accessor_id: userId ?? null,
    accessor_name: params.accessorName,
    access_location: params.accessLocation ?? null,
    notes: params.notes ?? null,
    metadata: params.metadata ?? null,
    access_started_at: new Date().toISOString(),
    // tenant_id auto-filled by trigger; see initiateCustodyTransfer for context.
    tenant_id: undefined as unknown as string,
  };

  const { data, error } = await supabase
    .from('chain_of_custody_access_log')
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error logging access:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Access log insert returned no row');
  }

  await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'access',
    actionType: 'EVIDENCE_ACCESS',
    actionDescription: `Evidence accessed: ${params.accessPurpose}`,
    deviceId: params.deviceId,
    metadata: {
      access_log_id: data.id,
      access_type: params.accessType,
    },
  });

  return mapAccessLogRow(data);
}

export async function endAccess(params: {
  accessLogId: string;
  findings?: string;
}): Promise<AccessLogEntry> {
  const updatePayload: Database['public']['Tables']['chain_of_custody_access_log']['Update'] = {
    access_ended_at: new Date().toISOString(),
    findings: params.findings ?? null,
  };

  const { data, error } = await supabase
    .from('chain_of_custody_access_log')
    .update(updatePayload)
    .eq('id', params.accessLogId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error ending access:', error);
    throw error;
  }

  if (!data) {
    throw new Error(`Access log ${params.accessLogId} not found`);
  }

  return mapAccessLogRow(data);
}

export async function performIntegrityCheck(params: {
  caseId: string;
  deviceId?: string;
  checkType: string;
  checkReason?: string;
  expectedHash?: string;
  actualHash?: string;
  hashAlgorithm?: string;
  physicalCondition?: string;
  sealNumber?: string;
  sealIntact?: boolean;
  overallResult: IntegrityCheckResult;
  findings?: string;
  anomalies?: string[];
  inspectorName: string;
  metadata?: Record<string, any>;
}): Promise<IntegrityCheck> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const hashMatch = params.expectedHash && params.actualHash
    ? params.expectedHash === params.actualHash
    : undefined;

  // TODO(B8): chain_of_custody_integrity_checks lacks columns for
  // check_reason/hash_algorithm/hash_match/physical_*/seal_*/findings/
  // anomalies/inspector_name/metadata — pack into `details` as JSON.
  const detailsPayload = JSON.stringify({
    check_reason: params.checkReason,
    hash_algorithm: params.hashAlgorithm,
    hash_match: hashMatch,
    physical_inspection_performed: !!params.physicalCondition,
    physical_condition: params.physicalCondition,
    seal_number: params.sealNumber,
    seal_intact: params.sealIntact,
    findings: params.findings,
    anomalies: params.anomalies,
    inspector_name: params.inspectorName,
    metadata: params.metadata,
  });

  const insertPayload: Database['public']['Tables']['chain_of_custody_integrity_checks']['Insert'] = {
    case_id: params.caseId,
    device_id: params.deviceId ?? null,
    check_type: params.checkType,
    expected_hash: params.expectedHash ?? null,
    actual_hash: params.actualHash ?? null,
    result: params.overallResult,
    details: detailsPayload,
    checked_by: userId ?? null,
    checked_at: new Date().toISOString(),
    // tenant_id auto-filled by trigger; see initiateCustodyTransfer for context.
    tenant_id: undefined as unknown as string,
  };

  const { data, error } = await supabase
    .from('chain_of_custody_integrity_checks')
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error performing integrity check:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Integrity check insert returned no row');
  }

  await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'verification',
    actionType: 'INTEGRITY_CHECK',
    actionDescription: `Integrity check performed: ${params.overallResult}`,
    deviceId: params.deviceId,
    metadata: {
      integrity_check_id: data.id,
      result: params.overallResult,
      hash_match: hashMatch,
    },
  });

  return mapIntegrityCheckRow(data);
}

export async function getIntegrityChecks(caseId: string): Promise<IntegrityCheck[]> {
  const { data, error } = await supabase
    .from('chain_of_custody_integrity_checks')
    .select('*')
    .eq('case_id', caseId)
    .order('checked_at', { ascending: false });

  if (error) {
    logger.error('Error fetching integrity checks:', error);
    throw error;
  }

  return (data ?? []).map(mapIntegrityCheckRow);
}

export async function searchChainOfCustody(params: {
  caseId: string;
  searchTerm?: string;
  categories?: ActionCategory[];
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
}): Promise<ChainOfCustodyEntry[]> {
  let query = supabase
    .from('chain_of_custody')
    .select('*')
    .eq('case_id', params.caseId);

  if (params.categories && params.categories.length > 0) {
    query = query.in('action_category', params.categories);
  }

  if (params.startDate) {
    query = query.gte('created_at', params.startDate.toISOString());
  }

  if (params.endDate) {
    query = query.lte('created_at', params.endDate.toISOString());
  }

  if (params.actorId) {
    query = query.eq('actor_id', params.actorId);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    logger.error('Error searching Chain of Custody:', error);
    throw error;
  }

  const rows = data ?? [];
  let results = rows.map((row, idx) => mapChainOfCustodyRow(row, rows.length - idx));

  if (params.searchTerm) {
    const term = params.searchTerm.toLowerCase();
    results = results.filter(entry =>
      entry.action_description.toLowerCase().includes(term) ||
      entry.action_type.toLowerCase().includes(term) ||
      entry.actor_name.toLowerCase().includes(term) ||
      (entry.evidence_reference !== undefined && entry.evidence_reference.toLowerCase().includes(term))
    );
  }

  return results;
}

// Forensic-grade SHA-256 hash for chain-of-custody evidence integrity.
// Aligns with NIST SP 800-86 (Guide to Integrating Forensic Techniques into
// Incident Response) which mandates SHA-256 minimum for digital evidence.
// Returns a 64-character lowercase hex string.
export async function generateHash(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getCategoryColor(category: ActionCategory): string {
  const colors: Record<ActionCategory, string> = {
    creation: 'bg-success-muted text-success border-success/30',
    modification: 'bg-info-muted text-info border-info/30',
    access: 'bg-accent text-accent-foreground border-accent-foreground/20',
    transfer: 'bg-cat-5/10 text-cat-5 border-cat-5/20',
    verification: 'bg-cat-2/10 text-cat-2 border-cat-2/20',
    communication: 'bg-secondary text-secondary-foreground border-secondary/40',
    evidence_handling: 'bg-primary/10 text-primary border-primary/30',
    financial: 'bg-success-muted text-success border-success/30',
    critical_event: 'bg-danger-muted text-danger border-danger/30',
  };
  return colors[category] || 'bg-slate-100 text-slate-800 border-slate-300';
}

export function getCategoryIcon(category: ActionCategory): string {
  const icons: Record<ActionCategory, string> = {
    creation: 'Plus',
    modification: 'Edit',
    access: 'Eye',
    transfer: 'ArrowRightLeft',
    verification: 'CheckCircle2',
    communication: 'MessageCircle',
    evidence_handling: 'Package',
    financial: 'DollarSign',
    critical_event: 'AlertTriangle',
  };
  return icons[category] || 'Activity';
}

export function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export async function logQuoteCreated(params: {
  caseId: string;
  quoteNo: string;
  total: number;
  subtotal: number;
  discount?: number;
  tax?: number;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType: 'QUOTE_CREATED',
    actionDescription: `Quote ${params.quoteNo} created with total amount ${params.total}`,
    metadata: {
      quote_no: params.quoteNo,
      subtotal: params.subtotal,
      discount: params.discount,
      tax: params.tax,
      total: params.total,
    },
  });
}

export async function logQuoteModified(params: {
  caseId: string;
  quoteNo: string;
  beforeValues: Record<string, any>;
  afterValues: Record<string, any>;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType: 'QUOTE_MODIFIED',
    actionDescription: `Quote ${params.quoteNo} modified`,
    beforeValues: params.beforeValues,
    afterValues: params.afterValues,
    metadata: { quote_no: params.quoteNo },
  });
}

export async function logQuoteStatusChanged(params: {
  caseId: string;
  quoteNo: string;
  oldStatus: string;
  newStatus: string;
}): Promise<string> {
  const actionType =
    params.newStatus === 'approved' ? 'QUOTE_APPROVED' :
    params.newStatus === 'rejected' ? 'QUOTE_REJECTED' :
    params.newStatus === 'converted' ? 'QUOTE_CONVERTED' :
    'QUOTE_STATUS_CHANGED';

  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType,
    actionDescription: `Quote ${params.quoteNo} status changed from ${params.oldStatus} to ${params.newStatus}`,
    beforeValues: { status: params.oldStatus },
    afterValues: { status: params.newStatus },
    metadata: { quote_no: params.quoteNo },
  });
}

export async function logInvoiceCreated(params: {
  caseId: string;
  invoiceNo: string;
  total: number;
  subtotal: number;
  discount?: number;
  tax?: number;
  dueDate?: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType: 'INVOICE_CREATED',
    actionDescription: `Invoice ${params.invoiceNo} created with total amount ${params.total}`,
    metadata: {
      invoice_no: params.invoiceNo,
      subtotal: params.subtotal,
      discount: params.discount,
      tax: params.tax,
      total: params.total,
      due_date: params.dueDate,
    },
  });
}

export async function logInvoiceModified(params: {
  caseId: string;
  invoiceNo: string;
  beforeValues: Record<string, any>;
  afterValues: Record<string, any>;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType: 'INVOICE_MODIFIED',
    actionDescription: `Invoice ${params.invoiceNo} modified`,
    beforeValues: params.beforeValues,
    afterValues: params.afterValues,
    metadata: { invoice_no: params.invoiceNo },
  });
}

export async function logInvoiceStatusChanged(params: {
  caseId: string;
  invoiceNo: string;
  oldStatus: string;
  newStatus: string;
}): Promise<string> {
  const actionType =
    params.newStatus === 'sent' ? 'INVOICE_SENT' :
    params.newStatus === 'paid' ? 'INVOICE_PAID' :
    params.newStatus === 'partially_paid' ? 'INVOICE_PARTIAL_PAYMENT' :
    params.newStatus === 'voided' ? 'INVOICE_VOIDED' :
    params.newStatus === 'overdue' ? 'INVOICE_OVERDUE' :
    'INVOICE_STATUS_CHANGED';

  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType,
    actionDescription: `Invoice ${params.invoiceNo} status changed from ${params.oldStatus} to ${params.newStatus}`,
    beforeValues: { status: params.oldStatus },
    afterValues: { status: params.newStatus },
    metadata: { invoice_no: params.invoiceNo },
  });
}

export async function logInvoicePayment(params: {
  caseId: string;
  invoiceNo: string;
  paymentAmount: number;
  totalPaid: number;
  totalAmount: number;
  paymentMethod?: string;
}): Promise<string> {
  const isFull = params.totalPaid >= params.totalAmount;

  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'financial',
    actionType: isFull ? 'INVOICE_PAYMENT_RECEIVED' : 'INVOICE_PARTIAL_PAYMENT_RECEIVED',
    actionDescription: `Payment of ${params.paymentAmount} received for invoice ${params.invoiceNo}`,
    afterValues: {
      payment_amount: params.paymentAmount,
      total_paid: params.totalPaid,
      remaining_balance: params.totalAmount - params.totalPaid,
    },
    metadata: {
      invoice_no: params.invoiceNo,
      payment_method: params.paymentMethod,
      is_full_payment: isFull,
    },
  });
}

export async function logReportGenerated(params: {
  caseId: string;
  reportNumber: string;
  reportType: string;
  title: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'evidence_handling',
    actionType: 'REPORT_GENERATED',
    actionDescription: `Report ${params.reportNumber} generated: ${params.title}`,
    metadata: {
      report_number: params.reportNumber,
      report_type: params.reportType,
      title: params.title,
    },
  });
}

export async function logReportModified(params: {
  caseId: string;
  reportNumber: string;
  changes: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'modification',
    actionType: 'REPORT_MODIFIED',
    actionDescription: `Report ${params.reportNumber} content updated: ${params.changes}`,
    metadata: { report_number: params.reportNumber },
  });
}

export async function logReportStatusChanged(params: {
  caseId: string;
  reportNumber: string;
  oldStatus: string;
  newStatus: string;
}): Promise<string> {
  const actionType =
    params.newStatus === 'finalized' ? 'REPORT_FINALIZED' :
    params.newStatus === 'delivered' ? 'REPORT_DELIVERED' :
    'REPORT_STATUS_CHANGED';

  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'evidence_handling',
    actionType,
    actionDescription: `Report ${params.reportNumber} status changed from ${params.oldStatus} to ${params.newStatus}`,
    beforeValues: { status: params.oldStatus },
    afterValues: { status: params.newStatus },
    metadata: { report_number: params.reportNumber },
  });
}

export async function logFileDownloaded(params: {
  caseId: string;
  fileName: string;
  fileCategory: string;
  fileSize?: number;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'access',
    actionType: 'FILE_DOWNLOADED',
    actionDescription: `File downloaded: ${params.fileName}`,
    metadata: {
      file_name: params.fileName,
      category: params.fileCategory,
      file_size: params.fileSize,
    },
  });
}

export async function logFileViewed(params: {
  caseId: string;
  fileName: string;
  fileCategory: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'access',
    actionType: 'FILE_VIEWED',
    actionDescription: `File viewed: ${params.fileName}`,
    metadata: {
      file_name: params.fileName,
      category: params.fileCategory,
    },
  });
}

export async function logPortalLogin(params: {
  caseId: string;
  customerName: string;
  ipAddress?: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'access',
    actionType: 'PORTAL_LOGIN',
    actionDescription: `Customer ${params.customerName} accessed case portal`,
    metadata: {
      customer_name: params.customerName,
      ip_address: params.ipAddress,
      access_type: 'portal',
    },
  });
}

export async function logPortalFileAccess(params: {
  caseId: string;
  customerName: string;
  fileName: string;
  action: 'viewed' | 'downloaded';
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'access',
    actionType: 'PORTAL_FILE_ACCESS',
    actionDescription: `Customer ${params.customerName} ${params.action} file: ${params.fileName} via portal`,
    metadata: {
      customer_name: params.customerName,
      file_name: params.fileName,
      action: params.action,
      access_type: 'portal',
    },
  });
}

export async function logPortalApproval(params: {
  caseId: string;
  customerName: string;
  documentType: 'quote' | 'report' | 'invoice';
  documentNumber: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'critical_event',
    actionType: 'PORTAL_APPROVAL',
    actionDescription: `Customer ${params.customerName} approved ${params.documentType} ${params.documentNumber} via portal`,
    metadata: {
      customer_name: params.customerName,
      document_type: params.documentType,
      document_number: params.documentNumber,
      access_type: 'portal',
    },
  });
}

export async function logDeviceCheckout(params: {
  caseId: string;
  deviceId?: string;
  collectorName: string;
  collectorMobile?: string;
  collectorId?: string;
  checkoutDate: string;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'transfer',
    actionType: 'DEVICE_CHECKED_OUT',
    actionDescription: `Device checked out to ${params.collectorName}`,
    deviceId: params.deviceId,
    afterValues: {
      checkout_date: params.checkoutDate,
      collector_name: params.collectorName,
      collector_mobile: params.collectorMobile,
      collector_id: params.collectorId,
    },
    metadata: {
      checkout_date: params.checkoutDate,
    },
  });
}

export async function logDeviceReturn(params: {
  caseId: string;
  deviceId?: string;
  returnedBy: string;
  returnDate: string;
  condition?: string;
  integrityVerified?: boolean;
}): Promise<string> {
  return await logChainOfCustody({
    caseId: params.caseId,
    actionCategory: 'transfer',
    actionType: 'DEVICE_RETURNED',
    actionDescription: `Device returned by ${params.returnedBy}`,
    deviceId: params.deviceId,
    afterValues: {
      return_date: params.returnDate,
      returned_by: params.returnedBy,
      condition: params.condition,
      integrity_verified: params.integrityVerified,
    },
    metadata: {
      return_date: params.returnDate,
    },
  });
}
