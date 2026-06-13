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
    { key: 'type', visible: true, label: { en: 'Type', ar: 'النوع' }, width: 100, align: 'left' },
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

/**
 * The "Case Details" info box for a checkout. Mirrors the legacy builder's case
 * box (Case ID, Customer Name, Company, Service, Customer Phone).
 */
function caseInfoBlock(caseData: CaseData): CaseInfoBlock {
  const customerName = caseData.customer?.customer_name || caseData.contact_name;
  const customerPhone =
    caseData.customer?.mobile_number ||
    caseData.customer?.phone_number ||
    caseData.contact_phone;
  return {
    title: { en: 'Case Details', ar: 'تفاصيل الحالة' },
    rows: [
      { label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: safeString(caseData.case_no) },
      { label: { en: 'Customer Name:', ar: 'اسم العميل:' }, value: safeString(customerName) },
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(caseData.company?.company_name) },
      { label: { en: 'Service:', ar: 'الخدمة:' }, value: safeString(caseData.service_type?.name) },
      { label: { en: 'Customer Phone:', ar: 'هاتف العميل:' }, value: safeString(customerPhone) },
    ],
  };
}

/**
 * The "Collection Information" block. Mirrors the legacy builder's two branches:
 * when the collector IS the customer (or no distinct collector was recorded) the
 * box shows the customer's name/mobile; otherwise it shows the recorded
 * collector's name / mobile / national ID. Checkout date and recovery outcome
 * are always present.
 */
function collectorBlock(caseData: CaseData): CollectorBlock {
  const checkoutDate = formatDate(
    caseData.checkout_date || new Date().toISOString(),
    'dd MMM yyyy, HH:mm',
  );
  const outcome = recoveryOutcomeLabel(caseData.recovery_outcome);

  const collectorIsCustomer =
    caseData.checkout_collector_name === caseData.customer?.customer_name ||
    !caseData.checkout_collector_name ||
    caseData.checkout_collector_name.trim() === '';

  const rows: CollectorBlock['rows'] = [
    { label: { en: 'Checkout Date:', ar: 'تاريخ التسليم:' }, value: checkoutDate },
    { label: { en: 'Recovery Outcome:', ar: 'نتيجة الاستعادة:' }, value: outcome },
  ];

  if (collectorIsCustomer) {
    const name = caseData.customer?.customer_name || caseData.contact_name;
    const mobile =
      caseData.customer?.mobile_number ||
      caseData.customer?.phone_number ||
      caseData.contact_phone;
    rows.push(
      { label: { en: 'Collected By:', ar: 'استلمها:' }, value: safeString(name) },
      { label: { en: 'Mobile Number:', ar: 'رقم الجوال:' }, value: safeString(mobile) },
    );
  } else {
    rows.push(
      { label: { en: 'Collected By:', ar: 'استلمها:' }, value: safeString(caseData.checkout_collector_name) },
      { label: { en: 'Mobile Number:', ar: 'رقم الجوال:' }, value: safeString(caseData.checkout_collector_mobile) },
      { label: { en: 'National ID:', ar: 'رقم الهوية:' }, value: safeString(caseData.checkout_collector_id) },
    );
  }

  if (caseData.checkout_notes) {
    rows.push({ label: { en: 'Notes:', ar: 'ملاحظات:' }, value: safeString(caseData.checkout_notes) });
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

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = {
    en: 'DEVICE CHECKOUT / RETURN FORM',
    ar: 'نموذج تسليم الجهاز',
  };

  // ---- Case-info header ----------------------------------------------------
  const caseInfo: CaseInfoBlock = caseInfoBlock(caseData);

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
    rows: devices.map(deviceRow),
  };

  // ---- Collector block -----------------------------------------------------
  const collector: CollectorBlock = collectorBlock(caseData);

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
