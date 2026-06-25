/**
 * Checkout adapter — maps the real {@link ReceiptData} (case + devices + company
 * settings) into the document-agnostic {@link EngineDocData} for the device
 * CHECKOUT / RETURN document (`checkout_form`).
 *
 * A checkout document is the intake document's mirror: same case-info header and
 * device table (the devices are now being RETURNED rather than received), plus a
 * "Collection Information" block — WHO physically collected the device(s) and
 * WHEN — and a checkout acknowledgement consent box. The adapter owns all domain
 * knowledge (the collector-same-as-customer fallback, the recovery-outcome
 * label, cell stringification); the renderers stay dumb.
 *
 * The signature LINES are not drawn here: the shared `signature` section
 * (fed by {@link EngineDocData.signatures}) owns those, so the checkout config
 * lists both a `collector` and a `signature` section.
 *
 * Parity reference: `documents/CheckoutFormDocument.ts`.
 */

import type { CaseData, DeviceData, ReceiptData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatDate, formatCapacity, safeString } from '../../utils';
import type {
  CaseInfoBlock,
  CollectorBlock,
  DevicesBlock,
  EngineDocData,
  LabelText,
  LegalTermsBlock,
  PartyBlock,
  ResolvedColumn,
} from '../types';

/**
 * The checkout device-table columns: Type, Brand, Capacity, Serial Number, Role
 * — the same 5-column set the legacy `CheckoutFormDocument.ts` renders for the
 * "Device(s) Returned" table. The `role` key drives the coloured role badge.
 */
function checkoutDeviceColumns(): ResolvedColumn[] {
  return [
    { key: 'type', visible: true, label: { en: 'Device Type', ar: 'النوع' }, width: 100, align: 'left' },
    { key: 'brand', visible: true, label: { en: 'Brand', ar: 'الماركة' }, width: 75, align: 'left' },
    { key: 'capacity', visible: true, label: { en: 'Capacity', ar: 'السعة' }, width: 85, align: 'left' },
    { key: 'serial', visible: true, label: { en: 'Serial Number', ar: 'الرقم التسلسلي' }, width: 125, align: 'left' },
    { key: 'role', visible: true, label: { en: 'Role', ar: 'الدور' }, align: 'left' },
  ];
}

/** Stringify one device into the checkout-table row shape (keys ↔ columns). */
function deviceRow(device: DeviceData): Record<string, string> {
  return {
    type: safeString(device.device_type),
    brand: safeString(device.brand),
    capacity: formatCapacity(device.capacity),
    serial: safeString(device.serial_number),
    role: device.role ?? '',
  };
}

/** Map a recovery-outcome code to its display label (parity with the builder). */
function recoveryOutcomeLabel(outcome: string | undefined | null): string {
  if (!outcome) return '-';
  const outcomes: Record<string, string> = {
    full: 'Full Recovery',
    partial: 'Partial Recovery',
    unrecoverable: 'Unrecoverable',
    declined: 'Declined',
  };
  return outcomes[outcome] || outcome;
}

/** The collector for one checkout batch (read from the batch's devices). */
interface CollectorInfo {
  name?: string;
  mobile?: string;
  id?: string;
  relationship?: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  self: 'Customer (self)',
  authorized_agent: 'Authorized agent',
  company_rep: 'Company representative',
  courier: 'Courier',
};

/**
 * The devices collected in THIS checkout event — the most recent checkout batch.
 * A partial collection prints only the devices actually handed over now; the rest
 * stay in the lab for a later visit. Falls back to ALL devices when none carry a
 * checkout stamp (e.g. the Studio sample/preview, or a legacy case-level checkout).
 */
function devicesInLatestBatch(devices: DeviceData[]): DeviceData[] {
  const checkedOut = devices.filter((d) => d.checked_out_at);
  if (checkedOut.length === 0) return devices;
  let latest = checkedOut[0];
  for (const d of checkedOut) {
    if ((d.checked_out_at ?? '') > (latest.checked_out_at ?? '')) latest = d;
  }
  if (latest.checkout_batch_id) {
    return checkedOut.filter((d) => d.checkout_batch_id === latest.checkout_batch_id);
  }
  return checkedOut.filter((d) => d.checked_out_at === latest.checked_out_at);
}

/**
 * The "Case Details" box — case facts only (Case ID, Service, Recovery Outcome,
 * Checkout Date, and how many devices were collected). The customer's identity
 * lives in the Customer Information box and is deliberately NOT repeated here.
 */
function caseInfoBlock(caseData: CaseData, collectedCount: number, totalCount: number): CaseInfoBlock {
  return {
    title: { en: 'Case Details', ar: 'تفاصيل الحالة' },
    rows: [
      { label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: safeString(caseData.case_no) },
      { label: { en: 'Service:', ar: 'الخدمة:' }, value: safeString(caseData.service_type?.name) },
      { label: { en: 'Recovery Outcome:', ar: 'نتيجة الاستعادة:' }, value: recoveryOutcomeLabel(caseData.recovery_outcome) },
      { label: { en: 'Checkout Date:', ar: 'تاريخ التسليم:' }, value: formatDate(caseData.checkout_date || new Date().toISOString(), 'dd MMM yyyy, HH:mm') },
      { label: { en: 'Devices Collected:', ar: 'الأجهزة المستلمة:' }, value: `${collectedCount} of ${totalCount}` },
    ],
  };
}

/**
 * The "Collection Information" block — WHO physically collected the device(s).
 * When the collector is the customer (relationship 'self', or no distinct
 * collector recorded) it reads "Collected by the customer". When someone collects
 * on the customer's behalf, it names the collector, states the relationship and
 * "On Behalf Of" the customer, and shows the National ID captured at handoff.
 */
function collectorBlock(caseData: CaseData, collector: CollectorInfo): CollectorBlock {
  const customerName = caseData.customer?.customer_name || caseData.contact_name;
  const customerMobile =
    caseData.customer?.mobile_number ||
    caseData.customer?.phone_number ||
    caseData.contact_phone;

  const isSelf =
    collector.relationship === 'self' ||
    (!collector.relationship &&
      (!collector.name || collector.name.trim() === '' || collector.name === customerName));

  const rows: CollectorBlock['rows'] = [];
  if (isSelf) {
    rows.push(
      { label: { en: 'Collected By:', ar: 'استلمها:' }, value: safeString(collector.name || customerName) },
      { label: { en: 'Relationship:', ar: 'صفة المستلم:' }, value: RELATIONSHIP_LABELS.self },
      { label: { en: 'Mobile Number:', ar: 'رقم الجوال:' }, value: safeString(collector.mobile || customerMobile) },
    );
  } else {
    rows.push(
      { label: { en: 'Collected By:', ar: 'استلمها:' }, value: safeString(collector.name) },
      { label: { en: 'On Behalf Of:', ar: 'نيابة عن:' }, value: safeString(customerName) },
      { label: { en: 'Relationship:', ar: 'صفة المستلم:' }, value: RELATIONSHIP_LABELS[collector.relationship ?? ''] ?? safeString(collector.relationship) },
      { label: { en: 'Mobile Number:', ar: 'رقم الجوال:' }, value: safeString(collector.mobile) },
      { label: { en: 'National ID:', ar: 'رقم الهوية:' }, value: safeString(collector.id) },
    );
  }

  return { title: { en: 'Collection Information', ar: 'معلومات الاستلام' }, rows };
}

/**
 * The checkout acknowledgement / Terms-&-Conditions consent box. Parity with
 * `CheckoutFormDocument.ts`'s "Customer Checkout Acknowledgement".
 */
function legalTermsBlock(companySettings: ReceiptData['companySettings']): LegalTermsBlock {
  const policyUrl = companySettings.legal_compliance?.terms_conditions_url || null;
  return {
    title: { en: 'Customer Checkout Acknowledgement', ar: 'إقرار استلام العميل' },
    body: {
      en: 'I confirm receipt of my device/data and acknowledge that my case has been concluded (completed, cancelled, or non-recoverable). I accept that data recovery is best-effort and subject to the Terms & Conditions available online or at reception.',
      ar: 'أؤكد استلام جهازي/بياناتي وأقر بأن حالتي قد انتهت (مكتملة، ملغاة، أو غير قابلة للاستعادة). أقبل أن استعادة البيانات تتم على أساس بذل أقصى جهد ممكن وتخضع للشروط والأحكام المتاحة عبر الإنترنت أو في الاستقبال.',
    },
    policyUrl,
  };
}

export function toEngineData(
  data: ReceiptData,
  _config: DocumentTemplateConfig,
): EngineDocData {
  const { caseData, devices, companySettings } = data;

  // Only the devices collected in THIS checkout event (the latest batch); the
  // collector is read from that batch (all its devices share one collector).
  const collectedDevices = devicesInLatestBatch(devices);
  const batchDevice = collectedDevices.find((d) => d.checked_out_at) ?? null;
  const collectorInfo: CollectorInfo = {
    name: batchDevice?.checkout_collector_name ?? caseData.checkout_collector_name,
    mobile: batchDevice?.checkout_collector_mobile ?? caseData.checkout_collector_mobile,
    id: batchDevice?.checkout_collector_id ?? caseData.checkout_collector_id,
    relationship: batchDevice?.checkout_collector_relationship,
  };

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = {
    en: 'DEVICE CHECKOUT / RETURN FORM',
    ar: 'نموذج تسليم الجهاز',
  };

  // ---- Case-info header ----------------------------------------------------
  const caseInfo: CaseInfoBlock = caseInfoBlock(caseData, collectedDevices.length, devices.length);

  // ---- Customer party ------------------------------------------------------
  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: caseData.customer?.customer_name || caseData.contact_name || 'N/A',
    rows: [
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(caseData.company?.company_name) },
      {
        label: { en: 'Phone:', ar: 'الهاتف:' },
        value:
          caseData.customer?.mobile_number ||
          caseData.customer?.phone_number ||
          caseData.contact_phone ||
          'N/A',
      },
      { label: { en: 'Email:', ar: 'البريد:' }, value: caseData.customer?.email || caseData.contact_email || 'N/A' },
    ],
  };

  // ---- Device return table -------------------------------------------------
  const devicesBlock: DevicesBlock = {
    title: { en: 'Device(s) Returned', ar: 'الأجهزة المرتجعة' },
    columns: checkoutDeviceColumns(),
    rows: collectedDevices.map(deviceRow),
  };

  // ---- Collector block -----------------------------------------------------
  const collector: CollectorBlock = collectorBlock(caseData, collectorInfo);

  // ---- Legal terms / consent ----------------------------------------------
  const legalTerms: LegalTermsBlock = legalTermsBlock(companySettings);

  // ---- Signature lines -----------------------------------------------------
  const signatures: LabelText[] = [
    { en: 'Customer/Collector Signature', ar: 'توقيع العميل/المستلم' },
    { en: 'Company Representative', ar: 'ممثل الشركة' },
  ];

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta: [],
    caseInfo,
    devices: devicesBlock,
    collector,
    legalTerms,
    signatures,
    // Checkout docs carry no money.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
