/**
 * Receipt adapter — maps the real {@link ReceiptData} (case + devices + company
 * settings) into the document-agnostic {@link EngineDocData} the section
 * renderers consume, for the two INTAKE document variants:
 *
 *   - `'office'`   → office_receipt  (the lab's retained "Office Copy")
 *   - `'customer'` → customer_copy   (the customer-facing acknowledgement copy)
 *
 * Both variants share the same case-info header, device-intake table, company
 * identity, and footer; they differ only in the legal-terms (consent) body and
 * the sub-title intent. The adapter owns ALL domain knowledge (the customer-vs-
 * company display fallbacks, the device-table column set + cell stringification,
 * the role pass-through, and the per-variant acknowledgement text). The section
 * renderers stay dumb.
 *
 * Mirrors `invoiceAdapter.ts` / `quoteAdapter.ts` in shape, but an intake
 * document has no money: there is no line-item table, no totals, no bank box,
 * and `paymentHistory` is always absent. Instead it carries `caseInfo`,
 * `devices`, and a single `legalTerms` consent box.
 *
 * Parity references:
 *   - office_receipt: `documents/OfficeReceiptDocument.ts`
 *   - customer_copy:  `documents/CustomerCopyDocument.ts`
 */

import type { CaseData, DeviceData, ReceiptData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatDate, formatCapacity, safeString } from '../../utils';
import type {
  CaseInfoBlock,
  DevicesBlock,
  EngineDocData,
  LabelText,
  LegalTermsBlock,
  PartyBlock,
  ResolvedColumn,
} from '../types';

/** Which intake variant we are producing. */
export type ReceiptVariant = 'office' | 'customer';

/**
 * The intake device-table columns, matching the legacy office_receipt /
 * customer_copy 5-column set: Type, Brand, Capacity, Serial Number, Role.
 * (The legacy builders render exactly these five — not model/condition/notes.)
 * The `role` column key drives the coloured role badge in `renderDevices`.
 *
 * The intake built-in configs carry no `columns` on the `devices` section, so
 * the adapter is the source of truth for the column set (the same pattern the
 * financial adapters use for line items, but supplied here directly).
 */
function intakeDeviceColumns(): ResolvedColumn[] {
  return [
    { key: 'type', visible: true, label: { en: 'Device Type', ar: 'النوع' }, width: 100, align: 'left' },
    { key: 'brand', visible: true, label: { en: 'Brand', ar: 'الماركة' }, width: 75, align: 'left' },
    { key: 'capacity', visible: true, label: { en: 'Capacity', ar: 'السعة' }, width: 85, align: 'left' },
    { key: 'serial', visible: true, label: { en: 'Serial Number', ar: 'الرقم التسلسلي' }, width: 125, align: 'left' },
    { key: 'role', visible: true, label: { en: 'Role', ar: 'الدور' }, align: 'left' },
  ];
}

/** Stringify one device into the intake-table row shape (keys ↔ columns). */
function deviceRow(device: DeviceData): Record<string, string> {
  return {
    type: safeString(device.device_type),
    brand: safeString(device.brand),
    capacity: formatCapacity(device.capacity),
    serial: safeString(device.serial_number),
    // Raw role string passes straight through; renderDevices maps it to the
    // simple label + badge colours (or a '-' dash cell when empty).
    role: device.role ?? '',
  };
}

/**
 * The customer-information party block for an intake document. Mirrors the
 * "Customer Information" box in the legacy builders (name / company / phone /
 * email / reference) with the same customer→contact fallbacks.
 */
function customerParty(caseData: CaseData): PartyBlock {
  const customerName = caseData.customer?.customer_name || caseData.contact_name || 'N/A';
  const phone =
    caseData.customer?.mobile_number ||
    caseData.customer?.phone_number ||
    caseData.contact_phone ||
    'N/A';
  const email = caseData.customer?.email || caseData.contact_email || 'N/A';

  return {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: [
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(caseData.company?.company_name) },
      { label: { en: 'Phone:', ar: 'الهاتف:' }, value: phone },
      { label: { en: 'Email:', ar: 'البريد:' }, value: email },
      { label: { en: 'Reference:', ar: 'المرجع:' }, value: safeString(caseData.client_reference) },
    ],
  };
}

/**
 * The "Case Details" info box. Mirrors the legacy builders' case box (Case ID,
 * Service, Priority, Problem, Date). The problem prefers the first device's
 * device_problem, falling back to the case-level problem_description — matching
 * the hand-written `firstDeviceProblem || caseData.problem_description`.
 */
function caseInfoBlock(caseData: CaseData, devices: DeviceData[]): CaseInfoBlock {
  const firstDeviceProblem = devices.length > 0 ? devices[0].device_problem : null;
  return {
    title: { en: 'Case Details', ar: 'تفاصيل الحالة' },
    rows: [
      { label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: safeString(caseData.case_no) },
      { label: { en: 'Service:', ar: 'الخدمة:' }, value: safeString(caseData.service_type?.name) },
      { label: { en: 'Priority:', ar: 'الأولوية:' }, value: safeString(caseData.priority) },
      { label: { en: 'Problem:', ar: 'العطل:' }, value: safeString(firstDeviceProblem || caseData.problem_description) },
      { label: { en: 'Date:', ar: 'التاريخ:' }, value: formatDate(caseData.created_at, 'dd MMM yyyy, HH:mm') },
    ],
  };
}

/**
 * The intake consent / Terms-&-Conditions acknowledgement box.
 *
 * - office variant: the lab-retained authorization (fixed legal text), parity
 *   with `OfficeReceiptDocument.ts`'s terms section.
 * - customer variant: the customer-facing acknowledgement that interpolates the
 *   legal/company name, parity with `CustomerCopyDocument.ts`.
 */
function legalTermsBlock(
  companySettings: ReceiptData['companySettings'],
  variant: ReceiptVariant,
): LegalTermsBlock {
  const companyName = companySettings.basic_info?.company_name || 'Company Name';
  const legalName = companySettings.basic_info?.legal_name || companyName;
  const policyUrl = companySettings.legal_compliance?.terms_conditions_url || null;

  if (variant === 'customer') {
    const title: LabelText = { en: 'Customer Acknowledgement', ar: 'إقرار العميل' };
    const body: LabelText = {
      en: `By signing, I confirm that I am the owner or authorized representative of the device and authorize ${legalName} (${companyName}) to proceed with the service. I acknowledge that the Terms & Conditions apply to this engagement. A printed copy of the Terms & Conditions is available at reception upon request.`,
      ar: `بتوقيعي، أؤكد أنني المالك أو الممثل المفوض للجهاز وأفوض ${legalName} (${companyName}) بالمتابعة في الخدمة. أقر بأن الشروط والأحكام تنطبق على هذا التعامل. نسخة مطبوعة من الشروط والأحكام متاحة في الاستقبال عند الطلب.`,
    };
    return { title, body, policyUrl };
  }

  // office variant — the lab's retained authorization box.
  const title: LabelText = { en: 'Terms & Conditions', ar: 'الشروط والأحكام' };
  const body: LabelText = {
    en: 'By signing as an authorized signatory, I authorize the company to proceed and acknowledge that the T&C apply to this engagement. A hard copy of the T&C is available at reception on request.',
    ar: 'بصفتي مفوضًا بالتوقيع، أفوض الشركة بالمتابعة وأقر بأن الشروط والأحكام تنطبق على هذا التعامل. تتوفر نسخة ورقية من الشروط والأحكام في الاستقبال عند الطلب.',
  };
  return { title, body, policyUrl };
}

export function toEngineData(
  data: ReceiptData,
  _config: DocumentTemplateConfig,
  variant: ReceiptVariant,
): EngineDocData {
  const { caseData, devices, companySettings } = data;

  // ---- Title ---------------------------------------------------------------
  // Both intake variants share the DEVICE CHECK-IN RECEIPT title (matching the
  // legacy builders, which both render that title and differ only in the
  // sub-title / acknowledgement body).
  const documentTitle: LabelText = {
    en: 'DEVICE CHECK-IN RECEIPT',
    ar: 'إيصال استلام جهاز',
  };

  // ---- Case-info header ----------------------------------------------------
  const caseInfo: CaseInfoBlock = caseInfoBlock(caseData, devices);

  // ---- Customer party ------------------------------------------------------
  const to: PartyBlock = customerParty(caseData);

  // ---- Device intake table -------------------------------------------------
  const devicesBlock: DevicesBlock = {
    title: { en: 'Device(s) Received', ar: 'الأجهزة المستلمة' },
    columns: intakeDeviceColumns(),
    rows: devices.map(deviceRow),
  };

  // ---- Legal terms / consent ----------------------------------------------
  const legalTerms: LegalTermsBlock = legalTermsBlock(companySettings, variant);

  // ---- Signature lines -----------------------------------------------------
  const signatures: LabelText[] = [
    { en: 'Customer Signature', ar: 'توقيع العميل' },
    { en: 'Company Representative', ar: 'ممثل الشركة' },
  ];

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta: [],
    caseInfo,
    devices: devicesBlock,
    legalTerms,
    signatures,
    // Intake docs carry no money: no line items, totals, bank, or payment history.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
