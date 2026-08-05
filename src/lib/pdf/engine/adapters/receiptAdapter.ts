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
import { missingValue } from './missingValue';
import type {
  CaseInfoBlock,
  CollectorBlock,
  DevicesBlock,
  DocRefBlock,
  EngineDocData,
  LabelText,
  LegalTermsBlock,
  PartyBlock,
  ResolvedColumn,
} from '../types';

/**
 * Whether the config renders the premium document-reference banner — a visible
 * `docRef` section with a non-`'none'` presentation style. When it does, the
 * case number moves from the Case Details rows into the banner (the reference
 * layout), so the adapter drops the duplicate row.
 */
export function docRefBannerActive(config: DocumentTemplateConfig): boolean {
  const style = config.presentation?.docRef;
  if (!style || style === 'none') return false;
  return config.sections.some((s) => s.key === 'docRef' && s.visible);
}

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

/**
 * The devices a receipt covers: the LATEST intake batch only. Devices added to
 * the case after that handover must never appear on a re-render of the earlier
 * receipt. Mirrors the checkout adapter's latest-batch rule. Falls back to all
 * devices when no batch has been recorded (legacy cases, template preview).
 */
export function devicesForReceipt(devices: DeviceData[]): DeviceData[] {
  const batched = devices.filter((d) => d.intake_batch_id);
  if (batched.length === 0) return devices;
  const latest = batched.reduce((a, b) =>
    (a.received_at ?? '') >= (b.received_at ?? '') ? a : b,
  );
  return devices.filter((d) => d.intake_batch_id === latest.intake_batch_id);
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
 * Depositor relationship → display string. Values (unlike labels) bypass the
 * bilingual join in every info-box renderer, so these stay English — the same
 * rule `checkoutAdapter`'s collector block follows.
 */
const RELATIONSHIP_LABELS: Record<string, string> = {
  self: 'Customer',
  authorized_agent: 'Authorized agent',
  company_rep: 'Company representative',
  courier: 'Courier',
};

/**
 * Who physically handed the devices over, expressed as the generic
 * {@link CollectorBlock} the shared `collector` section already renders — no new
 * renderer. Mirrors the checkout collector block: `self` reads "Delivered by
 * customer"; anyone else is NAMED alongside the customer they acted for, with
 * the National ID the intake RPC gates on. All devices in an intake batch share
 * one depositor, so the first device carrying depositor state is the source.
 *
 * A depositor recorded WITHOUT a relationship (the column is nullable, and the
 * intake RPC only gates the National ID when a non-self relationship is given)
 * counts as the customer only when no distinct name was captured — otherwise the
 * receipt would print "Delivered by customer" and silently drop the name, ID and
 * mobile of the person actually standing at the counter. Same rule as
 * `checkoutAdapter`'s collector block.
 *
 * Returns null when no depositor was recorded (legacy cases, template preview)
 * so the section renders nothing rather than an empty box.
 */
export function depositorBlock(
  devices: DeviceData[],
  customerName: string,
): CollectorBlock | null {
  const source = devices.find((d) => d.depositor_name || d.depositor_relationship);
  if (!source) return null;

  const relationship = source.depositor_relationship ?? '';
  const name = source.depositor_name?.trim() ?? '';
  const isSelf = relationship === 'self' || (!relationship && (!name || name === customerName));

  const rows: CollectorBlock['rows'] = [
    {
      label: { en: 'Delivered by', ar: 'سُلّم بواسطة' },
      value: isSelf
        ? 'Delivered by customer'
        : `${safeString(source.depositor_name)} — on behalf of ${customerName}`,
    },
  ];

  if (!isSelf) {
    if (relationship) {
      rows.push({
        label: { en: 'Relationship', ar: 'الصلة' },
        value: RELATIONSHIP_LABELS[relationship] ?? safeString(relationship),
      });
    }
    if (source.depositor_id) {
      rows.push({ label: { en: 'National ID', ar: 'رقم الهوية' }, value: source.depositor_id });
    }
    if (source.depositor_mobile) {
      rows.push({ label: { en: 'Mobile', ar: 'الجوال' }, value: source.depositor_mobile });
    }
  }

  if (source.received_at) {
    rows.push({
      label: { en: 'Received on', ar: 'تاريخ الاستلام' },
      value: formatDate(source.received_at),
    });
  }

  return { title: { en: 'Handover Information', ar: 'معلومات التسليم' }, rows };
}

/**
 * The customer-information party block for an intake document. Mirrors the
 * "Customer Information" box in the legacy builders (name / company / phone /
 * email / reference) with the same customer→contact fallbacks.
 */
function customerParty(caseData: CaseData, config: DocumentTemplateConfig): PartyBlock {
  // TBL-10: party VALUES bypass the bilingual label join, so the fallback has to
  // be script-neutral on a non-English document. English-only keeps 'N/A'.
  const na = missingValue(config.language);
  const customerName = caseData.customer?.customer_name || caseData.contact_name || na;
  const phone =
    caseData.customer?.mobile_number ||
    caseData.customer?.phone_number ||
    caseData.contact_phone ||
    na;
  const email = caseData.customer?.email || caseData.contact_email || na;

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
function caseInfoBlock(
  caseData: CaseData,
  devices: DeviceData[],
  omitCaseId = false,
): CaseInfoBlock {
  const firstDeviceProblem = devices.length > 0 ? devices[0].device_problem : null;
  return {
    title: { en: 'Case Details', ar: 'تفاصيل الحالة' },
    rows: [
      // When the premium docRef banner shows the case number, the row here
      // would duplicate it — the banner takes over (reference layout).
      ...(omitCaseId
        ? []
        : [{ label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: safeString(caseData.case_no) }]),
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
  config: DocumentTemplateConfig,
  variant: ReceiptVariant,
): EngineDocData {
  const { caseData, companySettings } = data;
  const devices = devicesForReceipt(data.devices);

  // ---- Title ---------------------------------------------------------------
  // Both intake variants share the DEVICE CHECK-IN RECEIPT title (matching the
  // legacy builders, which both render that title and differ only in the
  // sub-title / acknowledgement body).
  const documentTitle: LabelText = {
    en: 'DEVICE CHECK-IN RECEIPT',
    ar: 'إيصال استلام جهاز',
  };

  // ---- Premium document-reference banner ------------------------------------
  const bannerActive = docRefBannerActive(config);
  const docRef: DocRefBlock | null = caseData.case_no
    ? { label: { en: 'Case ID', ar: 'رقم الحالة' }, value: safeString(caseData.case_no) }
    : null;

  // ---- Case-info header ----------------------------------------------------
  const caseInfo: CaseInfoBlock = caseInfoBlock(caseData, devices, bannerActive);

  // ---- Customer party ------------------------------------------------------
  const to: PartyBlock = customerParty(caseData, config);

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

  // ---- Registered-by line (rendered only under the premium presentation) ----
  const creatorName =
    caseData.created_by_profile?.full_name || caseData.created_by_profile?.email || 'System';

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta: [],
    docRef,
    caseInfo,
    devices: devicesBlock,
    collector: depositorBlock(devices, to.name ?? ''),
    legalTerms,
    signatures,
    preparedBy: `Registered by: ${creatorName}`,
    // Intake docs carry no money: no line items, totals, bank, or payment history.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
