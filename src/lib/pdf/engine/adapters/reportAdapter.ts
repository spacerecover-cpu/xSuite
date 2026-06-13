/**
 * Report adapter — maps the real {@link ReportData} (case REPORT: a report-type
 * title, the case + customer + report meta, the ordered DB-driven prose
 * sections, the device diagnostics, and — for forensic reports — the
 * chain-of-custody timeline) into the document-agnostic {@link EngineDocData}
 * the section renderers consume.
 *
 * A case report is a NON-financial document: there is no money, no line items,
 * no party `from`/`to` blocks. It carries a `caseInfo` header (case + customer +
 * report meta in one info box, generalized from the legacy two info boxes), a
 * `diagnostics` info box (HDD- vs SSD-aware Media Details / Component
 * Diagnostics), the ordered `reportSections` prose blocks, and — when the report
 * is forensic and has custody events — a `custodyLog` timeline reusing the
 * shared {@link CustodyLogBlock} (exactly as the legacy builder special-cases the
 * `chain_of_custody` section into a timeline rather than a prose box).
 *
 * The adapter owns ALL domain knowledge: the report-type → bilingual title map
 * (the 8 report types), the customer/company display fallbacks, the HDD-vs-SSD
 * diagnostics field-set selection, the HTML→plain-text cleaning of section
 * content (mirroring the legacy `stripHtmlTags`), and the per-entry custody
 * stringification. The section renderers stay dumb.
 *
 * Parity reference: `documents/ReportDocument.ts` (title map ~643-662, info
 * boxes ~248-296, Media Details + Component Diagnostics ~300-400, report
 * sections loop ~402-495, chain-of-custody special case ~414-456).
 */

import type { ReportData } from '../../documents/ReportDocument';
import type { DocumentTemplateConfig, ColumnConfig } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import type {
  CaseInfoBlock,
  CustodyLogBlock,
  DiagnosticsBlock,
  EngineDocData,
  LabelText,
  ReportSectionsBlock,
  ResolvedColumn,
} from '../types';

// ---------------------------------------------------------------------------
// Report-type title map — the 8 report types (parity with the legacy
// `getReportTypeTitle`, extended with `recovered_files` so the engine covers
// every type the report module ships). EN = the uppercased document title; AR =
// the Arabic title surfaced in bilingual modes.
// ---------------------------------------------------------------------------

const REPORT_TYPE_TITLES: Record<string, LabelText> = {
  evaluation: { en: 'EVALUATION REPORT', ar: 'تقرير التقييم' },
  service: { en: 'SERVICE REPORT', ar: 'تقرير الخدمة' },
  server: { en: 'SERVER RECOVERY REPORT', ar: 'تقرير استعادة الخادم' },
  malware: { en: 'MALWARE ANALYSIS REPORT', ar: 'تقرير تحليل البرامج الضارة' },
  forensic: { en: 'FORENSIC ANALYSIS REPORT', ar: 'تقرير التحليل الجنائي' },
  data_destruction: { en: 'DATA DESTRUCTION CERTIFICATE', ar: 'شهادة تدمير البيانات' },
  prevention: { en: 'PREVENTION & STRATEGY REPORT', ar: 'تقرير الوقاية والاستراتيجية' },
  recovered_files: { en: 'RECOVERED FILES REPORT', ar: 'تقرير الملفات المستردة' },
};

/** Resolve the report-type title; unknown types degrade to the uppercased type. */
function reportTypeTitle(reportType: string): LabelText {
  return REPORT_TYPE_TITLES[reportType] ?? { en: (reportType || 'REPORT').toUpperCase() };
}

// ---------------------------------------------------------------------------
// Section-title Arabic map — mirrors the legacy `getSectionTitle` translation
// map so bilingual section headers surface the REAL Arabic title (the engine's
// reportSections renderer already keeps the supplied EN title). Keyed by the
// section_key; the EN side is the section's own `section_title`.
// ---------------------------------------------------------------------------

const SECTION_TITLE_AR: Record<string, string> = {
  diagnostic_findings: 'نتائج التشخيص',
  proposed_solutions: 'الحلول المقترحة',
  proposed_solution: 'الحلول المقترحة',
  recovery_time: 'وقت الاسترداد المقدر',
  estimated_recovery_time: 'وقت الاسترداد المقدر',
  failure_cause_analysis: 'تحليل سبب الفشل',
  non_recovery_reasons: 'أسباب عدم الاسترداد',
  actions_taken: 'الإجراءات المتخذة',
  service_important_notes: 'ملاحظات مهمة',
  service_recommendations: 'التوصيات',
  important_notes: 'ملاحظات مهمة',
  recommendations: 'التوصيات',
  chain_of_custody: 'سلسلة الحراسة',
};

/**
 * Strip HTML to plain text — paragraph breaks survive as `\n` newlines. Mirrors
 * the legacy `stripHtmlTags` in `documents/ReportDocument.ts` exactly so the
 * engine output matches the hand-written builder. This is adapter-owned domain
 * knowledge (the renderer stays dumb and only lays the cleaned text out).
 */
function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// ---------------------------------------------------------------------------
// Diagnostics — HDD vs SSD field-set selection. The legacy "Media Details" box
// shows shared rows (type / model / capacity / serial), then a Component
// Diagnostics block whose rows depend on `device_type_category` (hdd vs ssd),
// then physical-damage notes. The HDD/SSD branching lives ENTIRELY here.
// ---------------------------------------------------------------------------

function buildDiagnostics(
  device: ReportData['deviceData'],
  diagnostics: ReportData['diagnosticsData'],
): DiagnosticsBlock | null {
  if (!device) return null;

  const rows: DiagnosticsBlock['rows'] = [];
  if (device.device_type) rows.push({ label: { en: 'Type', ar: 'النوع' }, value: safeString(device.device_type) });
  if (device.model) rows.push({ label: { en: 'Model', ar: 'الطراز' }, value: safeString(device.model) });
  if (device.capacity) rows.push({ label: { en: 'Capacity', ar: 'السعة' }, value: safeString(device.capacity) });
  if (device.serial_number) rows.push({ label: { en: 'Serial No', ar: 'الرقم التسلسلي' }, value: safeString(device.serial_number) });

  let deviceKind: string | undefined;
  if (diagnostics) {
    deviceKind = diagnostics.device_type_category;
    if (diagnostics.device_type_category === 'hdd') {
      if (diagnostics.heads_status) rows.push({ label: { en: 'Heads', ar: 'الرؤوس' }, value: safeString(diagnostics.heads_status) });
      if (diagnostics.pcb_status) rows.push({ label: { en: 'PCB', ar: 'اللوحة' }, value: safeString(diagnostics.pcb_status) });
      if (diagnostics.motor_status) rows.push({ label: { en: 'Motor', ar: 'المحرك' }, value: safeString(diagnostics.motor_status) });
      if (diagnostics.surface_status) rows.push({ label: { en: 'Surface', ar: 'السطح' }, value: safeString(diagnostics.surface_status) });
    } else if (diagnostics.device_type_category === 'ssd') {
      if (diagnostics.controller_status) rows.push({ label: { en: 'Controller', ar: 'المتحكم' }, value: safeString(diagnostics.controller_status) });
      if (diagnostics.memory_chips_status) rows.push({ label: { en: 'Memory Chips', ar: 'رقائق الذاكرة' }, value: safeString(diagnostics.memory_chips_status) });
      if (diagnostics.controller_model) rows.push({ label: { en: 'Controller Model', ar: 'طراز المتحكم' }, value: safeString(diagnostics.controller_model) });
      if (diagnostics.nand_type) rows.push({ label: { en: 'NAND Type', ar: 'نوع الذاكرة' }, value: safeString(diagnostics.nand_type) });
    }
    if (diagnostics.physical_damage_notes) {
      rows.push({ label: { en: 'Physical Damage Notes', ar: 'ملاحظات الضرر المادي' }, value: safeString(diagnostics.physical_damage_notes) });
    }
  }

  if (rows.length === 0) return null;

  return {
    title: { en: 'Media Details', ar: 'تفاصيل الوسائط' },
    rows,
    ...(deviceKind ? { deviceKind } : {}),
  };
}

// ---------------------------------------------------------------------------
// Custody timeline — the forensic chain-of-custody events table. Reuses the
// shared {@link CustodyLogBlock} / `renderCustodyLog`, mirroring the legacy
// builder's `chain_of_custody` special case. The custody events on a REPORT come
// from `data.chainOfCustodyEvents` (a flat event shape, distinct from the
// dedicated chain-of-custody DOCUMENT's ledger entries), so the columns here are
// the report timeline's: action / description / actor / date-time, plus a
// colour-coded action-category badge keyed off the raw event type.
// ---------------------------------------------------------------------------

/** Default per-column alignment for the report custody timeline. */
const CUSTODY_COLUMN_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  entry: 'center',
  action: 'left',
  description: 'left',
  actor: 'left',
  occurredAt: 'center',
};

/** The report-timeline base columns (no hashes/signatures — that is the dedicated COC doc). */
function baseCustodyColumns(): ResolvedColumn[] {
  return [
    { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38, align: 'center' },
    { key: 'action', visible: true, label: { en: 'Event', ar: 'الحدث' }, width: 90, align: 'left' },
    { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, align: 'left' },
    { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80, align: 'left' },
    { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 75, align: 'center' },
  ];
}

/** Read any tenant-configured custodyLog columns from the resolved config. */
function configColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const custody = config.sections.find((s) => s.key === 'custodyLog');
  return custody?.columns ?? [];
}

/** Merge the adapter's base custody columns with any tenant config overrides (by key). */
function resolveCustodyColumns(config: DocumentTemplateConfig): ResolvedColumn[] {
  const cols = baseCustodyColumns();
  const overrides = new Map(configColumns(config).map((c) => [c.key, c]));
  return cols.map((c) => {
    const ov = overrides.get(c.key);
    if (!ov) return c;
    return {
      ...c,
      visible: ov.visible,
      label: ov.label ?? c.label,
      ...(ov.width !== undefined ? { width: ov.width } : {}),
      align: CUSTODY_COLUMN_ALIGN[c.key] ?? c.align,
    };
  });
}

/** Humanize a raw snake_case event type into "Title Case With Spaces". */
function humanize(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function buildCustodyLog(
  events: ReportData['chainOfCustodyEvents'],
  config: DocumentTemplateConfig,
): CustodyLogBlock | null {
  if (!events || events.length === 0) return null;

  const columns = resolveCustodyColumns(config);
  const rows = events.map((event, index) => ({
    entry: `#${String(index + 1).padStart(4, '0')}`,
    action: humanize(safeString(event.event_type)),
    description: safeString(event.event_description) || '-',
    actor: event.actor?.full_name ? safeString(event.actor.full_name) : 'Unknown',
    occurredAt: formatDate(event.event_timestamp || event.event_date, 'dd MMM yyyy, HH:mm'),
  }));

  return {
    title: { en: 'Chain of Custody', ar: 'سلسلة الحراسة' },
    columns,
    rows,
  };
}

export function toEngineData(
  data: ReportData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { report, sections, caseData, customerData, deviceData, diagnosticsData, chainOfCustodyEvents, companySettings, preparedByName } = data;

  // ---- Title (report-type → bilingual document title) ----------------------
  const documentTitle = reportTypeTitle(report.report_type);

  // ---- Case info (customer + report meta in one bilingual info box) ---------
  // Generalized from the legacy two boxes (Customer Information + Report
  // Details). The adapter applies the customer/company display fallbacks.
  const customerName = customerData?.customer_name || caseData?.customer_name || 'N/A';
  const companyNameValue =
    customerData?.company_name || caseData?.company_name || caseData?.customer_company;
  const customerEmail = customerData?.email || caseData?.customer_email || 'N/A';
  const customerPhone = customerData?.mobile_number || caseData?.customer_phone || 'N/A';

  const caseInfo: CaseInfoBlock = {
    title: { en: 'Report Details', ar: 'تفاصيل التقرير' },
    rows: [
      { label: { en: 'Name:', ar: 'الاسم:' }, value: safeString(customerName) },
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(companyNameValue) },
      { label: { en: 'Phone:', ar: 'الهاتف:' }, value: safeString(customerPhone) },
      { label: { en: 'Email:', ar: 'البريد:' }, value: safeString(customerEmail) },
      { label: { en: 'Reference:', ar: 'المرجع:' }, value: safeString(caseData?.client_reference) },
      { label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: safeString(caseData?.case_no) },
      { label: { en: 'Report No:', ar: 'رقم التقرير:' }, value: report.report_number || 'Draft' },
      { label: { en: 'Service:', ar: 'الخدمة:' }, value: safeString(caseData?.service_type) },
      { label: { en: 'Prepared By:', ar: 'أعدّه:' }, value: preparedByName || 'N/A' },
      { label: { en: 'Created Date:', ar: 'تاريخ الإنشاء:' }, value: formatDate(report.created_at, 'dd MMM yyyy') },
    ],
  };

  // ---- Diagnostics (HDD/SSD-aware Media Details / Component Diagnostics) ----
  const diagnostics = buildDiagnostics(deviceData, diagnosticsData);

  // ---- Custody timeline (forensic reports with custody events) -------------
  const custodyLog = buildCustodyLog(chainOfCustodyEvents, config);

  // ---- Report sections (ordered DB-driven prose) ---------------------------
  // Drop the `chain_of_custody` section (that renders as the custody timeline,
  // not a prose box) and any empty-content section, exactly like the legacy
  // `visibleSections` filter. Title gets its real Arabic from the section map.
  const reportSections: ReportSectionsBlock = {
    sections: sections
      .filter((s) => s.section_key !== 'chain_of_custody')
      .map((s) => {
        const ar = SECTION_TITLE_AR[s.section_key];
        const title: LabelText = ar ? { en: s.section_title, ar } : { en: s.section_title };
        return {
          title,
          content: stripHtmlTags(s.section_content),
          order: s.section_order,
        };
      })
      .filter((s) => s.content.trim().length > 0),
  };

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    caseInfo,
    diagnostics,
    reportSections,
    ...(custodyLog ? { custodyLog } : {}),
    // A case report carries no money, line items, or party blocks.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
