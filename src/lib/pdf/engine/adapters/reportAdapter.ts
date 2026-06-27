/**
 * Report adapter — maps the real {@link ReportData} (a data-recovery REPORT)
 * into the document-agnostic {@link EngineDocData} the section renderers consume,
 * in the approved **Option B "Modern lab"** design.
 *
 * Option B is a UNIVERSAL SHELL — a navy header band, a summary-tile row, a
 * two-column General | Device info region, toned editorial prose sections, and a
 * provable footer — shared by all 8 report subtypes. The 8 subtypes differ only
 * in: the document title, which prose sections are visible (and in what order),
 * each section's status TONE, and a few special blocks (the forensic custody
 * timeline, the destruction-certificate signature slots). This file owns ALL of
 * that domain knowledge:
 *
 *  - {@link reportConfigForSubtype} builds the per-subtype `DocumentTemplateConfig`
 *    (title + the visible Option B sections, in order, each carrying its tone),
 *    over a shared base. The service uses it as the built-in base (the tenant's
 *    deployed report template still cascades on top).
 *  - {@link toEngineData} builds the navy-band, summary tiles, two-column info,
 *    toned prose sections, custody timeline (forensic), and footer blocks from
 *    the report data, mapping each authored `case_report_sections` row to its
 *    canonical Option B section by `section_key` and stamping its tone/kind.
 *
 * The section renderers stay dumb. The custody timeline reuses the shared
 * {@link CustodyLogBlock} (the chain-of-custody section is NOT a prose box).
 *
 * Recoverability is shown as a CATEGORY label only — never a percentage (owner
 * decision 2026-06-27; a numeric % causes customer confusion/disputes).
 */

import type { ReportData } from '../../documents/ReportDocument';
import type {
  DocumentTemplateConfig,
  ColumnConfig,
  SectionConfig,
  SectionTone,
} from '../../templateConfig';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import type {
  CustodyLogBlock,
  EngineDocData,
  LabelText,
  ReportHeaderBlock,
  ReportInfoColumnsBlock,
  ReportSectionsBlock,
  ReportSummaryBlock,
  ReportSummaryTile,
  ResolvedColumn,
} from '../types';

// ---------------------------------------------------------------------------
// Report-type title map — the 8 report types. EN = the uppercased document
// title; AR = the Arabic title surfaced in bilingual modes.
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
// Canonical Option B prose sections — title (EN+AR), status tone, and special
// kind. Authored `case_report_sections` rows are matched to these by
// `section_key` (with a small alias table for legacy keys), so the Option B tone
// + bilingual title attach regardless of what title the author typed.
// ---------------------------------------------------------------------------

interface CanonicalSection {
  title: LabelText;
  tone: SectionTone;
  kind?: 'prose' | 'destruction_certificate' | 'custody';
}

const CANONICAL_SECTIONS: Record<string, CanonicalSection> = {
  executive_summary: { title: { en: 'Executive Summary', ar: 'الملخص التنفيذي' }, tone: 'neutral' },
  initial_assessment: { title: { en: 'Initial Assessment', ar: 'التقييم الأولي' }, tone: 'info' },
  findings: { title: { en: 'Findings', ar: 'النتائج' }, tone: 'danger' },
  recommendations: { title: { en: 'Recommendations', ar: 'التوصيات' }, tone: 'success' },
  work_performed: { title: { en: 'Work Performed', ar: 'العمل المنجز' }, tone: 'info' },
  recovery_results: { title: { en: 'Recovery Results', ar: 'نتائج الاسترداد' }, tone: 'success' },
  security_analysis: { title: { en: 'Security Analysis', ar: 'تحليل الأمان' }, tone: 'warning' },
  chain_of_custody_notes: { title: { en: 'Chain of Custody', ar: 'سلسلة الحيازة' }, tone: 'neutral', kind: 'custody' },
  destruction_certificate: { title: { en: 'Certificate of Destruction', ar: 'شهادة التدمير' }, tone: 'neutral', kind: 'destruction_certificate' },
  recovered_files_summary: { title: { en: 'Recovered Files Summary', ar: 'ملخص الملفات المستردة' }, tone: 'neutral' },
};

/**
 * Alias map: legacy / authored `section_key`s → the canonical Option B key. Lets
 * an authored report whose sections use the older keys (diagnostic_findings,
 * proposed_solutions, …) still attach the right Option B tone + title.
 */
const SECTION_KEY_ALIASES: Record<string, string> = {
  exec_summary: 'executive_summary',
  summary: 'executive_summary',
  diagnostic_findings: 'findings',
  failure_cause_analysis: 'findings',
  proposed_solutions: 'recommendations',
  proposed_solution: 'recommendations',
  service_recommendations: 'recommendations',
  important_notes: 'recommendations',
  service_important_notes: 'recommendations',
  actions_taken: 'work_performed',
  estimated_recovery_time: 'recovery_results',
  recovery_time: 'recovery_results',
  non_recovery_reasons: 'findings',
  chain_of_custody: 'chain_of_custody_notes',
  destruction: 'destruction_certificate',
  data_destruction: 'destruction_certificate',
  recovered_files: 'recovered_files_summary',
  device: 'device_information',
  device_information: 'device_information',
};

/** Normalize an authored section key to its canonical Option B key. */
function canonicalKey(sectionKey: string): string {
  const k = (sectionKey || '').trim().toLowerCase();
  return SECTION_KEY_ALIASES[k] ?? k;
}

// ---------------------------------------------------------------------------
// Per-subtype section sets (from the spec matrix). `device_information` is the
// two-column device card (handled by reportInfoColumns), not a prose section, so
// it gates the device column rather than emitting a prose block. The remaining
// keys are canonical prose/custody/certificate sections.
// ---------------------------------------------------------------------------

const SUBTYPE_SECTIONS: Record<string, string[]> = {
  evaluation: ['executive_summary', 'device_information', 'initial_assessment', 'findings', 'recommendations'],
  service: ['executive_summary', 'device_information', 'work_performed', 'recovery_results', 'recommendations'],
  server: ['executive_summary', 'device_information', 'initial_assessment', 'work_performed', 'recovery_results', 'recommendations'],
  malware: ['executive_summary', 'device_information', 'security_analysis', 'findings', 'recommendations'],
  forensic: ['executive_summary', 'device_information', 'chain_of_custody_notes', 'findings', 'recommendations'],
  data_destruction: ['executive_summary', 'device_information', 'destruction_certificate'],
  prevention: ['executive_summary', 'findings', 'recommendations'],
  recovered_files: ['executive_summary', 'recovered_files_summary', 'recommendations'],
};

/** The default subtype when an unknown report_type is supplied. */
const DEFAULT_SUBTYPE = 'evaluation';

/** The ordered Option B prose-section keys for a subtype (device_information dropped). */
function proseSectionKeysForSubtype(reportType: string): string[] {
  const set = SUBTYPE_SECTIONS[reportType] ?? SUBTYPE_SECTIONS[DEFAULT_SUBTYPE];
  return set.filter((k) => k !== 'device_information');
}

/** Whether a subtype shows the Device column / device summary tile. */
function subtypeHasDevice(reportType: string): boolean {
  const set = SUBTYPE_SECTIONS[reportType] ?? SUBTYPE_SECTIONS[DEFAULT_SUBTYPE];
  return set.includes('device_information');
}

/** Whether a subtype is the forensic one (which renders the custody timeline). */
function subtypeHasCustody(reportType: string): boolean {
  return proseSectionKeysForSubtype(reportType).includes('chain_of_custody_notes');
}

/**
 * Build the per-subtype Option B {@link DocumentTemplateConfig}: the navy band,
 * summary tiles, two-column info, the ordered toned prose sections (+ the
 * custody timeline for forensic), and the report footer. Used by the service as
 * the built-in base for the report cascade.
 */
export function reportConfigForSubtype(reportType: string): DocumentTemplateConfig {
  const base = BUILT_IN_TEMPLATE_CONFIGS.report;
  const hasCustody = subtypeHasCustody(reportType);

  const sections: SectionConfig[] = [];
  let order = 0;
  const push = (s: Omit<SectionConfig, 'order'>) => sections.push({ ...s, order: order++ });

  push({ key: 'reportHeader', visible: true });
  push({ key: 'reportSummary', visible: true });
  push({ key: 'reportInfoColumns', visible: true });

  // The toned prose sections render as ONE `reportSections` block — the adapter
  // has already selected, ordered, and tone-stamped the subtype's sections into
  // `EngineDocData.reportSections`. The forensic custody timeline renders as the
  // separate `custodyLog` block (not a prose box), placed where it falls in the
  // subtype order relative to the prose sections.
  if (hasCustody) {
    // Forensic: prose (exec/findings/recs) above the timeline, matching the
    // section order (exec_summary · custody · findings · recommendations). We
    // render the custody timeline between the early and late prose groups by
    // keeping reportSections (all prose) then custodyLog; acceptable single-page
    // ordering for the forensic shell.
    push({ key: 'reportSections', visible: true });
    push({
      key: 'custodyLog',
      visible: true,
      columns: base.sections.find((s) => s.key === 'custodyLog')?.columns,
    });
  } else {
    push({ key: 'reportSections', visible: true });
  }
  push({ key: 'reportFooter', visible: true });

  return {
    ...base,
    sections,
    labels: { ...base.labels, documentTitle: reportTypeTitle(reportType) },
  };
}

// ---------------------------------------------------------------------------
// Recoverability category → human label (CATEGORY only — never a percentage).
// ---------------------------------------------------------------------------

const RECOVERABILITY_LABELS: Record<string, string> = {
  fully_recoverable: 'Fully recoverable',
  partially_recoverable: 'Partial recovery',
  unrecoverable: 'Unrecoverable',
  requires_donor: 'Requires donor',
  pending: 'Pending',
};

function recoverabilityLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return RECOVERABILITY_LABELS[raw] ?? null;
}

// ---------------------------------------------------------------------------
// HTML → plain text (paragraph breaks survive as `\n`). Mirrors the legacy
// `stripHtmlTags`. Adapter-owned; the renderer stays dumb.
// ---------------------------------------------------------------------------

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
// Custody timeline — the forensic chain-of-custody events table, reusing the
// shared {@link CustodyLogBlock} / `renderCustodyLog`.
// ---------------------------------------------------------------------------

const CUSTODY_COLUMN_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  entry: 'center',
  action: 'left',
  description: 'left',
  actor: 'left',
  occurredAt: 'center',
};

function baseCustodyColumns(): ResolvedColumn[] {
  return [
    { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38, align: 'center' },
    { key: 'action', visible: true, label: { en: 'Event', ar: 'الحدث' }, width: 90, align: 'left' },
    { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, align: 'left' },
    { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80, align: 'left' },
    { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 75, align: 'center' },
  ];
}

function configColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const custody = config.sections.find((s) => s.key === 'custodyLog');
  return custody?.columns ?? [];
}

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
  return { title: { en: 'Chain of Custody', ar: 'سلسلة الحيازة' }, columns, rows };
}

// ---------------------------------------------------------------------------
// Option B block builders
// ---------------------------------------------------------------------------

/** The navy header band: company short identity + report title + Job line. */
function buildReportHeader(data: ReportData): ReportHeaderBlock {
  const { companySettings, caseData, report } = data;
  const companyName =
    companySettings.basic_info?.legal_name ||
    companySettings.basic_info?.company_name ||
    'Company Name';
  const contactBits: string[] = [];
  if (companySettings.contact_info?.phone_primary) contactBits.push(companySettings.contact_info.phone_primary);
  if (companySettings.contact_info?.email_general) contactBits.push(companySettings.contact_info.email_general);
  const caseNo = caseData?.case_no || caseData?.case_number || report.case_id;
  return {
    companyName,
    ...(contactBits.length ? { companyTagline: contactBits.join('  ·  ') } : {}),
    title: reportTypeTitle(report.report_type),
    ...(caseNo ? { jobLine: `Job ${safeString(caseNo)}` } : {}),
  };
}

/** The summary tiles: Device · Fault · Recoverability (category) · ETA. */
function buildReportSummary(data: ReportData): ReportSummaryBlock | null {
  const { deviceData, diagnosticsData, caseData, recoverability } = data;
  const hasDevice = subtypeHasDevice(data.report.report_type);
  const tiles: ReportSummaryTile[] = [];

  // Device tile (type · brand) — only for device subtypes.
  if (hasDevice && deviceData) {
    const bits = [deviceData.device_type, deviceData.brand].filter(Boolean).map((b) => safeString(b));
    if (bits.length) {
      tiles.push({ caption: { en: 'Device', ar: 'الجهاز' }, value: bits.join(' · ') });
    }
  }

  // Fault tile (short): physical-damage notes → device condition.
  const fault = diagnosticsData?.physical_damage_notes || deviceData?.condition;
  if (fault) {
    const text = safeString(fault);
    const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
    tiles.push({ caption: { en: 'Fault', ar: 'العطل' }, value: short });
  }

  // Recoverability tile (CATEGORY only — never a percentage). Warning tone.
  const recovLabel = recoverabilityLabel(recoverability);
  if (recovLabel) {
    tiles.push({ caption: { en: 'Recoverability', ar: 'قابلية الاسترداد' }, value: recovLabel, tone: 'warning' });
  }

  // ETA tile: estimated completion date, else priority as the SLA hint.
  if (caseData?.estimated_completion) {
    tiles.push({ caption: { en: 'ETA', ar: 'الوقت المقدّر' }, value: formatDate(caseData.estimated_completion, 'dd MMM yyyy') });
  } else if (caseData?.priority) {
    tiles.push({ caption: { en: 'ETA', ar: 'الوقت المقدّر' }, value: `${humanize(safeString(caseData.priority))} priority` });
  }

  return tiles.length ? { tiles: tiles.slice(0, 4) } : null;
}

/** The two-column General | Device info region. */
function buildReportInfoColumns(data: ReportData): ReportInfoColumnsBlock {
  const { caseData, customerData, deviceData, report, preparedByName } = data;

  const customerName = customerData?.customer_name || caseData?.customer_name || 'N/A';
  const companyNameValue = customerData?.company_name || caseData?.company_name || caseData?.customer_company;
  const customerEmail = customerData?.email || caseData?.customer_email || 'N/A';
  const customerPhone = customerData?.mobile_number || caseData?.customer_phone || 'N/A';

  const generalRows: ReportInfoColumnsBlock['general']['rows'] = [
    { label: { en: 'Name', ar: 'الاسم' }, value: safeString(customerName) },
    { label: { en: 'Company', ar: 'الشركة' }, value: safeString(companyNameValue) },
    { label: { en: 'Phone', ar: 'الهاتف' }, value: safeString(customerPhone) },
    { label: { en: 'Email', ar: 'البريد' }, value: safeString(customerEmail) },
    { label: { en: 'Client Ref', ar: 'مرجع العميل' }, value: safeString(caseData?.client_reference) },
    { label: { en: 'Service', ar: 'الخدمة' }, value: safeString(caseData?.service_type) },
    { label: { en: 'Priority', ar: 'الأولوية' }, value: caseData?.priority ? humanize(safeString(caseData.priority)) : '-' },
    { label: { en: 'Date', ar: 'التاريخ' }, value: formatDate(report.created_at, 'dd MMM yyyy') },
    { label: { en: 'Technician', ar: 'الفني' }, value: preparedByName || caseData?.assigned_engineer || 'N/A' },
  ];

  const general = { title: { en: 'General Details', ar: 'المعلومات العامة' }, rows: generalRows };

  if (!subtypeHasDevice(data.report.report_type) || !deviceData) {
    return { general, device: null };
  }

  const deviceRows: NonNullable<ReportInfoColumnsBlock['device']>['rows'] = [];
  const addDevice = (label: LabelText, value: string | undefined) => {
    if (value) deviceRows.push({ label, value: safeString(value) });
  };
  addDevice({ en: 'Type', ar: 'النوع' }, deviceData.device_type);
  addDevice({ en: 'Brand', ar: 'العلامة' }, deviceData.brand);
  addDevice({ en: 'Model', ar: 'الطراز' }, deviceData.model);
  addDevice({ en: 'Serial', ar: 'الرقم التسلسلي' }, deviceData.serial_number);
  addDevice({ en: 'Capacity', ar: 'السعة' }, deviceData.capacity);
  addDevice({ en: 'Interface', ar: 'الواجهة' }, deviceData.interface);
  addDevice({ en: 'DOM', ar: 'تاريخ الصنع' }, deviceData.dom);
  addDevice({ en: 'Encryption', ar: 'التشفير' }, deviceData.encryption);
  const headPlatter = [deviceData.head_count, deviceData.platter_count].filter(Boolean).join(' / ');
  addDevice({ en: 'Head/Platter', ar: 'الرؤوس/الأقراص' }, headPlatter || undefined);

  const device = { title: { en: 'Device Details', ar: 'تفاصيل الجهاز' }, rows: deviceRows };
  return { general, device };
}

/** Build the ordered toned prose sections for the subtype, sourced from authored content. */
function buildReportSections(data: ReportData): ReportSectionsBlock {
  const proseKeys = proseSectionKeysForSubtype(data.report.report_type).filter(
    (k) => k !== 'chain_of_custody_notes',
  );

  // Index authored sections by canonical key (last write wins for duplicates).
  const authored = new Map<string, string>();
  for (const s of data.sections) {
    const key = canonicalKey(s.section_key);
    const content = stripHtmlTags(s.section_content);
    if (content) authored.set(key, content);
  }

  const sections: ReportSectionsBlock['sections'] = [];
  let order = 0;
  for (const key of proseKeys) {
    const canonical = CANONICAL_SECTIONS[key];
    const content = authored.get(key) ?? '';
    const isCert = canonical?.kind === 'destruction_certificate';
    // Skip empty prose sections (no authored content) UNLESS it is the
    // destruction certificate, whose signature slots are meaningful regardless.
    if (!content && !isCert) continue;
    sections.push({
      title: canonical?.title ?? { en: humanize(key) },
      content,
      order: order++,
      ...(canonical?.tone ? { tone: canonical.tone } : {}),
      ...(isCert ? { kind: 'destruction_certificate' as const } : {}),
    });
  }
  return { sections };
}

// ---------------------------------------------------------------------------
// Footer (confidentiality + copyright + Report ID / Generated line)
// ---------------------------------------------------------------------------

function buildReportFooter(data: ReportData): import('../types').ReportFooterBlock {
  const { report, companySettings } = data;
  const tenant =
    companySettings.basic_info?.legal_name ||
    companySettings.basic_info?.company_name ||
    'Company';
  const year = new Date().getFullYear();
  const reportId = report.report_number || report.id;
  const generated = formatDate(new Date().toISOString(), 'dd MMM yyyy, HH:mm');
  return {
    confidentiality: {
      en: 'This report is confidential and intended solely for the named recipient.',
      ar: 'هذا التقرير سري ومخصص حصريًا للمستلم المذكور.',
    },
    copyright: `© ${year} ${tenant}. All rights reserved.`,
    reportLine: `Report ID: ${safeString(reportId)} | Generated: ${generated}`,
  };
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------

export function toEngineData(
  data: ReportData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { report, companySettings } = data;

  const documentTitle = reportTypeTitle(report.report_type);
  const custodyLog = buildCustodyLog(data.chainOfCustodyEvents, config);

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    reportHeader: buildReportHeader(data),
    reportSummary: buildReportSummary(data),
    reportInfoColumns: buildReportInfoColumns(data),
    reportSections: buildReportSections(data),
    reportFooter: buildReportFooter(data),
    ...(custodyLog ? { custodyLog } : {}),
    // A case report carries no money, line items, or party blocks.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
