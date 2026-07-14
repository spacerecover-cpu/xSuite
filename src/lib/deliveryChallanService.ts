// Rule 55 delivery challan issuance — no migration, no custody writes.
//
// Statutory serial numbers must be stable per checkout event: issuance is
// idempotent per checkout batch (the uuid log_case_checkout stamps onto
// case_devices.checkout_batch_id). The issuance record is an APPEND-ONLY
// case_job_history row via the existing log_case_history RPC — reprints read
// it back instead of consuming a fresh number.

import { supabase } from './supabaseClient';
import {
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
  if (params.lines.length === 0) {
    throw new Error('A delivery challan needs at least one customer-owned device line');
  }

  // Atomic, idempotent server-side issuance (bug #87): the RPC takes an advisory
  // lock on (case, batch), returns any already-issued challan idempotently, and
  // otherwise mints the number + appends the case_job_history row in ONE
  // transaction — a failed append rolls back the sequence advance, so no gap and
  // no two-challans-for-one-handover race for the client to reconcile.
  const { data, error } = await supabase.rpc('issue_delivery_challan', {
    p_case_id: params.caseId,
    p_batch_id: params.batchId,
    p_lines: params.lines.map((l) => ({ device_id: l.deviceId, declared_value: l.declaredValue })),
  });
  if (error || !data) throw error ?? new Error('Failed to issue delivery challan');

  const issued = data as {
    kind: string;
    batch_id: string;
    challan_no: string;
    lines: Array<{ device_id: string; declared_value: number }>;
    total_declared_value: number;
    issued_at: string;
    already_issued: boolean;
  };

  return {
    caseId: params.caseId,
    batchId: params.batchId,
    challanNo: issued.challan_no,
    issuedAt: issued.issued_at,
    lines: issued.lines.map((l) => ({ deviceId: l.device_id, declaredValue: l.declared_value })),
    totalDeclaredValue: Number(issued.total_declared_value),
  };
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

/** Pure assembly: a challan reprint reproduces the IMMUTABLE issued record. A
 *  challan number is a statutory serial, so the set of lines, the per-line
 *  declared VALUES, and the total are all read back from the append-only
 *  issuance record (`issued.lines` / `issued.totalDeclaredValue`); the live
 *  `receipt.devices` set is consulted ONLY to look up descriptive fields
 *  (type/brand/model/serial). A post-issuance edit of a device's role or its
 *  soft-deletion must never change what a previously-issued challan reprints —
 *  so issued lines are NOT re-filtered against current role or existence state. */
export function assembleDeliveryChallanData(
  receipt: ReceiptData,
  issued: IssuedDeliveryChallan,
  consignee: { name: string; address: string | null; gstin: string | null; phone: string | null },
): DeliveryChallanData {
  const deviceById = new Map(receipt.devices.map((d) => [d.id, d]));

  const lines = issued.lines.map((l) => {
    const d = deviceById.get(l.deviceId);
    return {
      description: [d?.device_type, d?.brand, d?.model].filter(Boolean).join(' ') || 'Storage device',
      hsnCode: CHALLAN_DEFAULT_HSN,
      quantity: 1,
      unitCode: 'NOS',
      serialNumber: d?.serial_number ?? null,
      declaredValue: l.declaredValue,
    };
  });
  const totalDeclaredValue = issued.totalDeclaredValue;

  const first = issued.lines.length > 0 ? deviceById.get(issued.lines[0].deviceId) : undefined;
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
