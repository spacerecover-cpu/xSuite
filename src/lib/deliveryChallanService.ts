// Rule 55 delivery challan issuance — no migration, no custody writes.
//
// Statutory serial numbers must be stable per checkout event: issuance is
// idempotent per checkout batch (the uuid log_case_checkout stamps onto
// case_devices.checkout_batch_id). The issuance record is an APPEND-ONLY
// case_job_history row via the existing log_case_history RPC — reprints read
// it back instead of consuming a fresh number.

import { supabase } from './supabaseClient';
import { logger } from './logger';
import {
  DELIVERY_CHALLAN_SCOPE,
  isCustomerOwnedRole,
  ewayBillGuidance,
  CHALLAN_NOTATION,
  CHALLAN_DEFAULT_HSN,
} from './regimes/in_gst/deliveryChallan';
import type { ReceiptData } from './pdf/types';
import type { DeliveryChallanData } from './pdf/types';

export const DELIVERY_CHALLAN_ACTION = 'delivery_challan_issued';

export interface ChallanLineInput {
  deviceId: string;
  declaredValue: number;
}

export interface IssuedDeliveryChallan {
  caseId: string;
  batchId: string;
  challanNo: string;
  issuedAt: string;
  lines: ChallanLineInput[];
  totalDeclaredValue: number;
}

export interface DevicePartition {
  customerOwned: Array<{ id: string; roleName: string | null }>;
  labSupplied: Array<{ id: string; roleName: string | null }>;
}

/** Which of these case devices are customer-owned goods (challan-eligible)
 *  versus lab-supplied media (goods tax invoice territory)? */
export async function fetchDeviceRolePartition(deviceIds: string[]): Promise<DevicePartition> {
  const empty: DevicePartition = { customerOwned: [], labSupplied: [] };
  if (deviceIds.length === 0) return empty;

  const { data: deviceRows, error } = await supabase
    .from('case_devices')
    .select('id, device_role_id')
    .in('id', deviceIds)
    .is('deleted_at', null);
  if (error) throw error;

  const roleIds = [...new Set((deviceRows ?? []).map((d) => d.device_role_id).filter((r): r is number => r != null))];
  const roleNames = new Map<number, string>();
  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabase
      .from('catalog_device_roles')
      .select('id, name')
      .in('id', roleIds);
    if (roleError) throw roleError;
    for (const r of roleRows ?? []) roleNames.set(r.id, r.name);
  }

  const partition: DevicePartition = { customerOwned: [], labSupplied: [] };
  for (const d of deviceRows ?? []) {
    const roleName = d.device_role_id != null ? roleNames.get(d.device_role_id) ?? null : null;
    (isCustomerOwnedRole(roleName) ? partition.customerOwned : partition.labSupplied)
      .push({ id: d.id, roleName });
  }
  return partition;
}

/** The checkout batch log_case_checkout stamped onto this device (null if the
 *  device has not been checked out). */
export async function getCheckoutBatchId(deviceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('case_devices')
    .select('checkout_batch_id')
    .eq('id', deviceId)
    .maybeSingle();
  if (error) throw error;
  return data?.checkout_batch_id ?? null;
}

interface ChallanHistoryDetails {
  kind: 'delivery_challan';
  batch_id: string;
  challan_no: string;
  lines: Array<{ device_id: string; declared_value: number }>;
  total_declared_value: number;
  issued_at: string;
}

function parseChallanDetails(details: string | null): ChallanHistoryDetails | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<ChallanHistoryDetails>;
    if (parsed.kind !== 'delivery_challan' || !parsed.batch_id || !parsed.challan_no) return null;
    return parsed as ChallanHistoryDetails;
  } catch {
    return null;
  }
}

/** The already-issued challan for this checkout batch, or null. */
export async function getIssuedChallan(caseId: string, batchId: string): Promise<IssuedDeliveryChallan | null> {
  const { data, error } = await supabase
    .from('case_job_history')
    .select('details, created_at')
    .eq('case_id', caseId)
    .eq('action', DELIVERY_CHALLAN_ACTION)
    .order('created_at', { ascending: true });
  if (error) throw error;

  for (const row of data ?? []) {
    const parsed = parseChallanDetails(row.details);
    if (parsed && parsed.batch_id === batchId) {
      return {
        caseId,
        batchId,
        challanNo: parsed.challan_no,
        issuedAt: parsed.issued_at,
        lines: parsed.lines.map((l) => ({ deviceId: l.device_id, declaredValue: l.declared_value })),
        totalDeclaredValue: parsed.total_declared_value,
      };
    }
  }
  return null;
}

/** Idempotent issuance: one challan number per checkout batch, recorded as an
 *  append-only case_job_history row. Never touches chain_of_custody*. */
export async function issueDeliveryChallan(params: {
  caseId: string;
  batchId: string;
  lines: ChallanLineInput[];
}): Promise<IssuedDeliveryChallan> {
  const existing = await getIssuedChallan(params.caseId, params.batchId);
  if (existing) return existing;

  if (params.lines.length === 0) {
    throw new Error('A delivery challan needs at least one customer-owned device line');
  }

  const { data: challanNo, error: numberError } = await supabase.rpc('get_next_number', {
    p_scope: DELIVERY_CHALLAN_SCOPE,
  });
  if (numberError || !challanNo) {
    throw numberError ?? new Error('Failed to allocate a delivery challan number');
  }

  const totalDeclaredValue = params.lines.reduce((sum, l) => sum + l.declaredValue, 0);
  const issuedAt = new Date().toISOString();
  const details: ChallanHistoryDetails = {
    kind: 'delivery_challan',
    batch_id: params.batchId,
    challan_no: challanNo,
    lines: params.lines.map((l) => ({ device_id: l.deviceId, declared_value: l.declaredValue })),
    total_declared_value: totalDeclaredValue,
    issued_at: issuedAt,
  };

  const { error: historyError } = await supabase.rpc('log_case_history', {
    p_case_id: params.caseId,
    p_action: DELIVERY_CHALLAN_ACTION,
    p_details: JSON.stringify(details),
  });
  if (historyError) {
    logger.error('Delivery challan number allocated but issuance record failed:', historyError);
    throw historyError;
  }

  return { caseId: params.caseId, batchId: params.batchId, challanNo, issuedAt, lines: params.lines, totalDeclaredValue };
}

/** Consignee block for the challan header, from the canonical customer table. */
export async function fetchChallanConsignee(
  customerId: string,
): Promise<{ name: string; address: string | null; gstin: string | null; phone: string | null }> {
  const { data, error } = await supabase
    .from('customers_enhanced')
    .select('customer_name, address, address_line1, address_line2, postal_code, tax_number, mobile_number, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { name: 'Customer', address: null, gstin: null, phone: null };

  const address = [data.address_line1 ?? data.address, data.address_line2, data.postal_code]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(', ');
  return {
    name: data.customer_name,
    address: address || null,
    gstin: data.tax_number ?? null,
    phone: data.mobile_number ?? data.phone ?? null,
  };
}

/** Pure assembly: challan lines are the issued batch's device set intersected
 *  with the case devices actually stamped with that checkout_batch_id, minus
 *  any lab-supplied roles (defense in depth — the UI already filters). */
export function assembleDeliveryChallanData(
  receipt: ReceiptData,
  issued: IssuedDeliveryChallan,
  consignee: { name: string; address: string | null; gstin: string | null; phone: string | null },
): DeliveryChallanData {
  const declaredByDevice = new Map(issued.lines.map((l) => [l.deviceId, l.declaredValue]));
  const batchDevices = receipt.devices.filter(
    (d) => d.checkout_batch_id === issued.batchId && declaredByDevice.has(d.id) && isCustomerOwnedRole(d.role),
  );

  const lines = batchDevices.map((d) => ({
    description: [d.device_type, d.brand, d.model].filter(Boolean).join(' ') || 'Storage device',
    hsnCode: CHALLAN_DEFAULT_HSN,
    quantity: 1,
    unitCode: 'NOS',
    serialNumber: d.serial_number ?? null,
    declaredValue: declaredByDevice.get(d.id)!,
  }));
  const totalDeclaredValue = lines.reduce((sum, l) => sum + l.declaredValue, 0);

  const first = batchDevices[0];
  return {
    challanNo: issued.challanNo,
    challanDate: issued.issuedAt,
    caseNo: receipt.caseData.case_no,
    consignee,
    transport: {
      collectorName: first?.checkout_collector_name ?? receipt.caseData.checkout_collector_name ?? null,
      collectorMobile: first?.checkout_collector_mobile ?? receipt.caseData.checkout_collector_mobile ?? null,
      relationship: first?.checkout_collector_relationship ?? null,
    },
    lines,
    totalDeclaredValue,
    ewayNote: ewayBillGuidance(totalDeclaredValue),
    notation: CHALLAN_NOTATION,
  };
}
