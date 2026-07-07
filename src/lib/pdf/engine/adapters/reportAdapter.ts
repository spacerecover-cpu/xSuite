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
import type { TranslationContext } from '../../types';
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
// Multilingual labels — EVERY human-readable title/label the report renders is
// resolved here through the shared document-translation system (`ctx.t`), so it
// works in english_only AND in bilingual mode for ALL 13 languages, instead of
// the previous English+Arabic-only hardcoded maps. `ctx.t(translationKey, en)`
// returns the English canonical in english_only mode, or the combined bilingual
// string (`EN | translated`) in bilingual mode — see `pdf/translationContext.ts`
// + `documentTranslations.ts`. The adapter emits FINAL strings (wrapped as a
// single-`en` {@link LabelText} via {@link lt}); the section renderers stay dumb
// and just render the supplied string, so RTL/bilingual is owned entirely by
// `ctx.t`/`formatBilingualText` — never re-implemented here.
// ---------------------------------------------------------------------------

/** Wrap an already-resolved (possibly bilingual) string as a single-`en` LabelText. */
function lt(text: string): LabelText {
  return { en: text };
}

// ---------------------------------------------------------------------------
// Report-type title map — the 8 report types. Each maps to a document-translation
// key + the uppercased English canonical; resolved via `ctx.t` so the title
// renders in any of the 13 languages.
// ---------------------------------------------------------------------------

const REPORT_TYPE_TITLES: Record<string, { tkey: string; en: string }> = {
  evaluation: { tkey: 'evaluationReport', en: 'EVALUATION REPORT' },
  service: { tkey: 'serviceReport', en: 'SERVICE REPORT' },
  server: { tkey: 'serverReport', en: 'SERVER RECOVERY REPORT' },
  malware: { tkey: 'malwareReport', en: 'MALWARE ANALYSIS REPORT' },
  forensic: { tkey: 'forensicReport', en: 'FORENSIC ANALYSIS REPORT' },
  data_destruction: { tkey: 'dataDestructionReport', en: 'DATA DESTRUCTION CERTIFICATE' },
  prevention: { tkey: 'preventionReport', en: 'PREVENTION & STRATEGY REPORT' },
  recovered_files: { tkey: 'recoveredFilesReport', en: 'RECOVERED FILES REPORT' },
};

/** Resolve the report-type document title via `ctx.t`; unknown types degrade to the uppercased type. */
function reportTypeTitle(reportType: string, ctx: TranslationContext): LabelText {
  const entry = REPORT_TYPE_TITLES[reportType];
  if (!entry) return lt((reportType || 'REPORT').toUpperCase());
  return lt(ctx.t(entry.tkey, entry.en));
}

// ---------------------------------------------------------------------------
// Canonical Option B prose sections — document-translation key + English
// canonical title, status tone, and special kind. Authored
// `case_report_sections` rows are matched to these by `section_key` (with a
// small alias table for legacy keys), so the Option B tone + multilingual title
// attach regardless of what title the author typed.
// ---------------------------------------------------------------------------

interface CanonicalSection {
  /** Document-translation key resolved via `ctx.t` (all 13 languages). */
  tkey: string;
  /** English canonical title (the `englishText` passed to `ctx.t`). */
  en: string;
  tone: SectionTone;
  kind?: 'prose' | 'destruction_certificate' | 'custody';
}

const CANONICAL_SECTIONS: Record<string, CanonicalSection> = {
  executive_summary: { tkey: 'executiveSummary', en: 'Executive Summary', tone: 'neutral' },
  initial_assessment: { tkey: 'initialAssessment', en: 'Initial Assessment', tone: 'info' },
  findings: { tkey: 'diagnosticFindings', en: 'Diagnostic Findings', tone: 'danger' },
  recommendations: { tkey: 'proposedSolutions', en: 'Proposed Solution', tone: 'success' },
  work_performed: { tkey: 'workPerformed', en: 'Work Performed', tone: 'info' },
  recovery_results: { tkey: 'recoveryResults', en: 'Recovery Results', tone: 'success' },
  security_analysis: { tkey: 'securityAnalysis', en: 'Security Analysis', tone: 'warning' },
  chain_of_custody_notes: { tkey: 'chainOfCustody', en: 'Chain of Custody', tone: 'neutral', kind: 'custody' },
  destruction_certificate: { tkey: 'certificateOfDestruction', en: 'Certificate of Destruction', tone: 'neutral', kind: 'destruction_certificate' },
  recovered_files_summary: { tkey: 'recoveredFilesSummary', en: 'Recovered Files Summary', tone: 'neutral' },
  // ── Industry-taxonomy sections (2026-07 research: NIST 800-88/800-61,
  // SWGDE/ISO 27037, CISA #StopRansomware, 3-2-1/ISO 31000, lab conventions) ──
  // Evaluation
  estimated_timeline: { tkey: 'estimatedTimeline', en: 'Estimated Recovery Time', tone: 'warning' },
  risks_disclaimers: { tkey: 'risksDisclaimers', en: 'Risks & Required Consents', tone: 'danger' },
  // Service
  parts_used: { tkey: 'partsUsed', en: 'Parts & Materials Used', tone: 'neutral' },
  verification_qa: { tkey: 'verificationQa', en: 'Verification & Quality Assurance', tone: 'success' },
  delivery_details: { tkey: 'deliveryDetails', en: 'Delivery & Data Retention', tone: 'info' },
  // Server / RAID
  array_configuration: { tkey: 'arrayConfiguration', en: 'Array Configuration', tone: 'info' },
  member_drives: { tkey: 'memberDrives', en: 'Member Drive Assessment', tone: 'warning' },
  // Malware / ransomware
  infection_vector: { tkey: 'infectionVector', en: 'Infection Vector & Root Cause', tone: 'warning' },
  affected_systems: { tkey: 'affectedSystems', en: 'Affected Systems & Data Scope', tone: 'warning' },
  // Forensic
  examiner_qualifications: { tkey: 'examinerQualifications', en: 'Examiner Qualifications', tone: 'neutral' },
  acquisition_details: { tkey: 'acquisitionDetails', en: 'Acquisition Methodology', tone: 'info' },
  conclusions: { tkey: 'conclusionsOpinion', en: 'Conclusions & Expert Opinion', tone: 'info' },
  limitations: { tkey: 'limitationsDisclaimers', en: 'Limitations & Disclaimers', tone: 'warning' },
  // Data destruction (NIST SP 800-88 certificate structure)
  sanitization_details: { tkey: 'sanitizationDetails', en: 'Sanitization Details', tone: 'info' },
  verification_details: { tkey: 'verificationValidation', en: 'Verification & Validation', tone: 'success' },
  media_disposition: { tkey: 'mediaDisposition', en: 'Media Destination & Disposition', tone: 'neutral' },
  // Prevention / strategy
  root_cause: { tkey: 'rootCause', en: 'Root Cause of Data Loss', tone: 'warning' },
  risk_assessment: { tkey: 'riskAssessment', en: 'Risk Assessment', tone: 'danger' },
  backup_strategy: { tkey: 'backupStrategy', en: 'Backup Strategy Recommendation', tone: 'info' },
  monitoring_plan: { tkey: 'monitoringPlan', en: 'Monitoring & Early-Warning Plan', tone: 'info' },
  action_plan: { tkey: 'actionPlan', en: 'Prioritized Action Plan', tone: 'success' },
  emergency_response: { tkey: 'emergencyResponse', en: 'Warning Signs & Emergency Response', tone: 'danger' },
  // Recovered files / delivery acceptance
  recovery_statistics: { tkey: 'recoveryStatistics', en: 'Recovery Statistics', tone: 'info' },
  file_categories: { tkey: 'fileCategories', en: 'File Category Breakdown', tone: 'neutral' },
  critical_files: { tkey: 'criticalFiles', en: 'Critical Files Verification', tone: 'success' },
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
  // Authored recovery-time content now renders under the warning-toned
  // Estimated Recovery Time section (the reference evaluation layout).
  estimated_recovery_time: 'estimated_timeline',
  recovery_time: 'estimated_timeline',
  non_recovery_reasons: 'findings',
  chain_of_custody: 'chain_of_custody_notes',
  destruction: 'destruction_certificate',
  data_destruction: 'destruction_certificate',
  recovered_files: 'recovered_files_summary',
  device: 'device_information',
  device_information: 'device_information',
  raid_configuration: 'array_configuration',
  iocs: 'security_analysis',
  malware_identification: 'security_analysis',
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

// Ordered per the 2026-07 industry research (see CANONICAL_SECTIONS notes):
// each subtype mirrors the professional report structure for that engagement —
// evaluation = pre-approval diagnostic assessment (reference layout), service =
// work-completion report, server = multi-drive RAID engagement report, malware =
// customer-facing IR report (NIST 800-61 / CISA shape), forensic = SWGDE/ISO
// 27037 examination report, data_destruction = NIST SP 800-88 certificate,
// prevention = post-recovery advisory (root cause → risk → plan), and
// recovered_files = stage-12 file listing & delivery acceptance report.
const SUBTYPE_SECTIONS: Record<string, string[]> = {
  evaluation: [
    'executive_summary', 'device_information', 'initial_assessment', 'findings',
    'recommendations', 'estimated_timeline', 'risks_disclaimers',
  ],
  service: [
    'executive_summary', 'device_information', 'findings', 'work_performed',
    'parts_used', 'recovery_results', 'verification_qa', 'recommendations',
  ],
  server: [
    'executive_summary', 'device_information', 'array_configuration', 'member_drives',
    'work_performed', 'recovery_results', 'verification_qa', 'recommendations',
  ],
  malware: [
    'executive_summary', 'device_information', 'infection_vector', 'security_analysis',
    'affected_systems', 'work_performed', 'recovery_results', 'recommendations',
  ],
  forensic: [
    'executive_summary', 'examiner_qualifications', 'device_information', 'acquisition_details',
    'chain_of_custody_notes', 'findings', 'conclusions', 'limitations',
  ],
  data_destruction: [
    'executive_summary', 'device_information', 'sanitization_details',
    'verification_details', 'media_disposition', 'destruction_certificate',
  ],
  prevention: [
    'executive_summary', 'root_cause', 'risk_assessment', 'backup_strategy',
    'monitoring_plan', 'action_plan', 'emergency_response',
  ],
  recovered_files: [
    'executive_summary', 'device_information', 'recovery_statistics', 'file_categories',
    'critical_files', 'recovered_files_summary', 'limitations', 'delivery_details',
  ],
};

/** The default subtype when an unknown report_type is supplied. */
const DEFAULT_SUBTYPE = 'evaluation';

/**
 * Authoring guidance per canonical section — what industry practice expects the
 * engineer to write. Shown as editor placeholder text (never printed); the PDF
 * simply skips sections the engineer leaves empty.
 */
const SECTION_GUIDANCE: Record<string, string> = {
  executive_summary: 'Plain-language outcome in 3–5 sentences: what was received, what failed, what was (or can be) recovered, and the overall verdict. Written for a non-technical reader.',
  initial_assessment: 'Condition on receipt: physical inspection findings, prior-opening evidence, reported symptoms and events leading to the loss, customer-identified critical files.',
  findings: 'The exact cause of failure with evidence: fault class (logical / electronic / firmware / mechanical / media), SMART indicators, inspection results, severity.',
  recommendations: 'The recommended recovery strategy mapped to the fault, the escalation path (non-invasive first, destructive last), donor parts needed, and expected challenges.',
  estimated_timeline: 'Turnaround per service tier (Standard / Priority / Emergency) in business days; note donor-part lead time. The clock starts at approval.',
  risks_disclaimers: 'Consent items: further-damage risk on already-damaged media, warranty-void on opening, DESTRUCTIVE-ATTEMPT consent (irreversible, last resort), encryption limits.',
  work_performed: 'Chronological, specific actions — never "repaired drive": cleanroom work, head-stack swap, PCB/ROM transfer, firmware repair, imaging passes and tools (with versions), logical reconstruction.',
  parts_used: 'Every donor / replacement part consumed: part type, donor model + serial, compatibility basis, quantity, billed or not. The patient drive is not returned in working order.',
  recovery_results: 'Outcome per device and overall: sectors imaged (binary read %), files recovered vs requested (count and %), volume recovered, corrupted-file handling, unrecoverable items with reasons.',
  verification_qa: 'How results were validated: file-list generation, sample-open checks of priority files, image hashes (SHA-256), QA checklist sign-off by a second engineer.',
  delivery_details: 'Target media (make/model/serial), encryption applied, original-device disposition, retention window for the lab working copy and the exact secure-deletion date.',
  array_configuration: 'RAID level, member count, hot spares, stripe/chunk size, parity rotation, disk order, controller make/model/firmware, volumes and file systems — as reported vs as determined.',
  member_drives: 'One entry per member drive: slot, model, serial, SMART/physical findings, array state (active / spare / failed / stale), % imaged, bad sectors, image hash.',
  infection_vector: 'How the malware entered (phishing, exposed RDP, vulnerability, credentials) with the evidence basis and confidence level; state what was ruled out if undetermined.',
  security_analysis: 'Malware family/variant and identification basis (ransom note, extension scheme, hash lookup); key indicators of compromise (hashes, IPs, domains — defanged).',
  affected_systems: 'Per-device scope: host, role, OS, encryption status, backup status; data types and volume affected vs intact.',
  examiner_qualifications: 'Examiner name, title, years of experience, certifications and relevant training; assisting staff and roles; lab accreditations.',
  acquisition_details: 'Write blocker (make/model/firmware), imaging tool + version, image format, source parameters, read-error log, acquisition + verification hashes per image.',
  conclusions: 'Every opinion with its basis, tied back to the findings; calibrated language ("consistent with", "in my professional opinion") — never advocacy.',
  limitations: 'What could not be examined or recovered and why; assumptions relied on; tool limits; qualifications to the conclusions.',
  sanitization_details: 'NIST SP 800-88 category (Clear / Purge / Destroy), method used (overwrite, crypto-erase, degauss, shred…), method details (passes / particle size), tool or equipment + version, date and location.',
  verification_details: 'Verification method (full read-back / sampling), per-device result (passed / failed), post-sanitization classification, QA sampling notes.',
  media_disposition: 'Final destination per NIST Appendix G: internal/external reuse, recycling facility, returned to customer; downstream vendor if media leaves the lab.',
  root_cause: 'The diagnostic finding restated for the customer: failure class, evidence observed, contributing factors (age, heat, single-copy), and a one-line preventability statement.',
  risk_assessment: 'One entry per remaining risk: description, likelihood 1–5, impact 1–5, score and band (Low/Moderate/High/Critical), and the action that mitigates it.',
  backup_strategy: 'The 3-2-1 prescription sized to the customer (3 copies, 2 media, 1 offsite; add immutable copy + restore tests for ransomware exposure); current posture vs target.',
  monitoring_plan: 'Metric | tool | frequency | alert threshold | action. Include the SMART watchlist (attributes 5, 187, 188, 197, 198): any raw value > 0 = watch; rising = replace now.',
  action_plan: 'Numbered actions with priority (Critical/High/Medium/Low), timeframe (0–7d / 0–30d / 30–90d), owner, and the risk each one mitigates. Every action specific and actionable.',
  emergency_response: 'Failure symptoms to watch for (clicking, disconnects, SMART alerts) and what to do: power down immediately, never run recovery software on a failing drive, contact the lab.',
  recovery_statistics: 'Total files identified; recovered good / suspect / not recovered; recovery rate BY COUNT and BY VOLUME (they diverge on partial recoveries); GB recovered vs source used capacity.',
  file_categories: 'Per category (Photos, Documents, Video, Email, Databases…): recovered / suspect / not-recovered counts and volume — how the customer sanity-checks "are my photos there".',
  critical_files: 'One line per customer-declared must-have file/folder: path, status (recovered-verified / partial / not recovered), verification method (opened / functional test).',
  recovered_files_summary: 'Where the full manifest lives (portal link / attached listing), how it is organized (original folder structure), and the per-file status vocabulary (Good / Suspect / Partial).',
  chain_of_custody_notes: 'Context for the custody timeline below: seals, storage, transfers. The event table itself is rendered automatically from the custody ledger.',
  destruction_certificate: 'The attestation paragraph: media itemized above were sanitized/destroyed on [date] at [location] per NIST SP 800-88, rendering the data unrecoverable. Operator + witness sign below.',
};

/** Editor guidance for a (possibly aliased) section key; undefined when none. */
export function reportSectionGuidance(sectionKey: string): string | undefined {
  return SECTION_GUIDANCE[canonicalKey(sectionKey)];
}

/**
 * The ordered canonical prose-section descriptors for a report subtype — the seed
 * list the Documents tab uses to create document_instance_sections. Mirrors the
 * sections the adapter renders, so a freshly-seeded draft matches the PDF layout.
 * `device_information` is excluded because it is the auto-rendered two-column device
 * card (handled by reportInfoColumns), not an editable prose section. `guidance`
 * is editor placeholder copy (industry practice per section) — never printed.
 */
export function reportSubtypeSections(
  subtype: string,
): Array<{ key: string; title: string; guidance?: string }> {
  const keys = proseSectionKeysForSubtype(subtype);
  return keys.map((key) => ({
    key,
    title: CANONICAL_SECTIONS[key]?.en ?? key,
    ...(SECTION_GUIDANCE[key] ? { guidance: SECTION_GUIDANCE[key] } : {}),
  }));
}

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
  push({ key: 'reportApproval', visible: true });
  push({ key: 'reportFooter', visible: true });

  // `config.labels.documentTitle` is metadata only — the RENDERED title flows
  // through `toEngineData` (which has `ctx`) into `reportHeader.title` /
  // `documentTitle`. Here we have no `ctx`, so we stamp the English canonical;
  // the adapter overrides it with the `ctx.t`-resolved (multilingual) string.
  const titleEntry = REPORT_TYPE_TITLES[reportType];
  const documentTitle: LabelText = lt(
    titleEntry ? titleEntry.en : (reportType || 'REPORT').toUpperCase(),
  );

  return {
    ...base,
    sections,
    labels: { ...base.labels, documentTitle },
  };
}

// ---------------------------------------------------------------------------
// Recoverability category → human label (CATEGORY only — never a percentage).
// ---------------------------------------------------------------------------

// Recoverability for the summary tile comes from the device Evaluation Result
// (case_devices.recovery_result) set on the universal Edit Device -> Diagnostic
// tab. That vocabulary is already display-ready; the map only normalizes legacy
// values, and unknown values pass through as-is.
const RECOVERABILITY_LABELS: Record<string, string> = {
  Pending: 'Pending',
  Recoverable: 'Recoverable',
  'Partially Recoverable': 'Partially Recoverable',
  Unrecoverable: 'Unrecoverable',
  fully_recoverable: 'Fully recoverable',
  partially_recoverable: 'Partial recovery',
  unrecoverable: 'Unrecoverable',
  requires_donor: 'Requires donor',
  pending: 'Pending',
};

function recoverabilityLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return RECOVERABILITY_LABELS[raw] ?? raw;
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

function baseCustodyColumns(ctx: TranslationContext): ResolvedColumn[] {
  return [
    { key: 'entry', visible: true, label: lt(ctx.t('entryNum', 'Entry #')), width: 38, align: 'center' },
    { key: 'action', visible: true, label: lt(ctx.t('actionType', 'Event')), width: 90, align: 'left' },
    { key: 'description', visible: true, label: lt(ctx.t('description', 'Description')), align: 'left' },
    { key: 'actor', visible: true, label: lt(ctx.t('actor', 'Actor')), width: 80, align: 'left' },
    { key: 'occurredAt', visible: true, label: lt(ctx.t('dateTime', 'Date/Time')), width: 75, align: 'center' },
  ];
}

function configColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const custody = config.sections.find((s) => s.key === 'custodyLog');
  return custody?.columns ?? [];
}

function resolveCustodyColumns(config: DocumentTemplateConfig, ctx: TranslationContext): ResolvedColumn[] {
  const cols = baseCustodyColumns(ctx);
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
  ctx: TranslationContext,
): CustodyLogBlock | null {
  if (!events || events.length === 0) return null;
  const columns = resolveCustodyColumns(config, ctx);
  const rows = events.map((event, index) => ({
    entry: `#${String(index + 1).padStart(4, '0')}`,
    action: humanize(safeString(event.event_type)),
    description: safeString(event.event_description) || '-',
    actor: event.actor?.full_name ? safeString(event.actor.full_name) : 'Unknown',
    occurredAt: formatDate(event.event_timestamp || event.event_date, 'dd MMM yyyy, HH:mm'),
  }));
  return { title: lt(ctx.t('chainOfCustody', 'Chain of Custody')), columns, rows };
}

// ---------------------------------------------------------------------------
// Option B block builders
// ---------------------------------------------------------------------------

/** The navy header band: company short identity + report title + Job line. */
function buildReportHeader(data: ReportData, ctx: TranslationContext): ReportHeaderBlock {
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
    title: reportTypeTitle(report.report_type, ctx),
    ...(caseNo ? { jobLine: `${ctx.t('caseId', 'Case ID')}: ${safeString(caseNo)}` } : {}),
  };
}

/** The summary tiles: Device · Fault · Recoverability (category) · ETA. */
function buildReportSummary(data: ReportData, ctx: TranslationContext): ReportSummaryBlock | null {
  const { deviceData, diagnosticsData, caseData, recoverability } = data;
  const hasDevice = subtypeHasDevice(data.report.report_type);
  const tiles: ReportSummaryTile[] = [];

  // Device tile (type · brand) — only for device subtypes.
  if (hasDevice && deviceData) {
    const bits = [deviceData.device_type, deviceData.brand].filter(Boolean).map((b) => safeString(b));
    if (bits.length) {
      tiles.push({ caption: lt(ctx.t('device', 'Device')), value: bits.join(' · ') });
    }
  }

  // Fault tile (short): physical-damage notes → device condition.
  const fault = diagnosticsData?.physical_damage_notes || deviceData?.condition;
  if (fault) {
    const text = safeString(fault);
    const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
    tiles.push({ caption: lt(ctx.t('fault', 'Fault')), value: short });
  }

  // Recoverability tile (CATEGORY only — never a percentage). Warning tone.
  const recovLabel = recoverabilityLabel(recoverability);
  if (recovLabel) {
    tiles.push({ caption: lt(ctx.t('recoverability', 'Recoverability')), value: recovLabel, tone: 'warning' });
  }

  // ETA tile: estimated completion date, else priority as the SLA hint.
  if (caseData?.estimated_completion) {
    tiles.push({ caption: lt(ctx.t('estimatedTime', 'ETA')), value: formatDate(caseData.estimated_completion, 'dd MMM yyyy') });
  } else if (caseData?.priority) {
    tiles.push({ caption: lt(ctx.t('estimatedTime', 'ETA')), value: `${humanize(safeString(caseData.priority))} ${ctx.t('priority', 'priority')}` });
  }

  return tiles.length ? { tiles: tiles.slice(0, 4) } : null;
}

/** The two-column General | Device info region. */
function buildReportInfoColumns(data: ReportData, ctx: TranslationContext): ReportInfoColumnsBlock {
  const { caseData, customerData, deviceData, report, preparedByName } = data;

  const customerName = customerData?.customer_name || caseData?.customer_name || 'N/A';
  const companyNameValue = customerData?.company_name || caseData?.company_name || caseData?.customer_company;
  const customerEmail = customerData?.email || caseData?.customer_email || 'N/A';
  const customerPhone = customerData?.mobile_number || caseData?.customer_phone || 'N/A';

  const generalRows: ReportInfoColumnsBlock['general']['rows'] = [
    { label: lt(ctx.t('name', 'Name')), value: safeString(customerName) },
    { label: lt(ctx.t('company', 'Company')), value: safeString(companyNameValue) },
    { label: lt(ctx.t('phone', 'Phone')), value: safeString(customerPhone) },
    { label: lt(ctx.t('email', 'Email')), value: safeString(customerEmail) },
    { label: lt(ctx.t('clientReference', 'Client Ref')), value: safeString(caseData?.client_reference) },
    { label: lt(ctx.t('service', 'Service')), value: safeString(caseData?.service_type) },
    { label: lt(ctx.t('priority', 'Priority')), value: caseData?.priority ? humanize(safeString(caseData.priority)) : '-' },
    { label: lt(ctx.t('date', 'Date')), value: formatDate(report.created_at, 'dd MMM yyyy') },
    { label: lt(ctx.t('technician', 'Technician')), value: preparedByName || caseData?.assigned_engineer || 'N/A' },
  ];

  const general = { title: lt(ctx.t('generalDetails', 'General Details')), rows: generalRows };

  if (!subtypeHasDevice(data.report.report_type) || !deviceData) {
    return { general, device: null };
  }

  const deviceRows: NonNullable<ReportInfoColumnsBlock['device']>['rows'] = [];
  const addDevice = (label: LabelText, value: string | undefined) => {
    if (value) deviceRows.push({ label, value: safeString(value) });
  };
  addDevice(lt(ctx.t('type', 'Type')), deviceData.device_type);
  addDevice(lt(ctx.t('brand', 'Brand')), deviceData.brand);
  addDevice(lt(ctx.t('model', 'Model')), deviceData.model);
  addDevice(lt(ctx.t('serialNumber', 'Serial')), deviceData.serial_number);
  addDevice(lt(ctx.t('capacity', 'Capacity')), deviceData.capacity);
  addDevice(lt(ctx.t('interface', 'Interface')), deviceData.interface);
  addDevice(lt(ctx.t('dom', 'DOM')), deviceData.dom);
  addDevice(lt(ctx.t('encryption', 'Encryption')), deviceData.encryption);
  const headPlatter = [deviceData.head_count, deviceData.platter_count].filter(Boolean).join(' / ');
  addDevice(lt(ctx.t('headPlatter', 'Head/Platter')), headPlatter || undefined);

  const device = { title: lt(ctx.t('deviceInformation', 'Device Information')), rows: deviceRows };
  return { general, device };
}

/** Build the ordered toned prose sections for the subtype, sourced from authored content. */
function buildReportSections(data: ReportData, ctx: TranslationContext): ReportSectionsBlock {
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
    // Resolve the section title via `ctx.t` (multilingual); unknown keys degrade
    // to the humanized section key.
    const title = canonical ? lt(ctx.t(canonical.tkey, canonical.en)) : lt(humanize(key));
    sections.push({
      title,
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

function buildReportFooter(data: ReportData, ctx: TranslationContext): import('../types').ReportFooterBlock {
  const { report, companySettings } = data;
  const tenant =
    companySettings.basic_info?.legal_name ||
    companySettings.basic_info?.company_name ||
    'Company';
  const year = new Date().getFullYear();
  const reportId = report.report_number || report.id;
  const generated = formatDate(new Date().toISOString(), 'dd MMM yyyy, HH:mm');
  return {
    confidentiality: lt(
      ctx.t(
        'reportConfidentiality',
        'This report is confidential and intended solely for the named recipient.',
      ),
    ),
    // `copyright`/`reportLine` are plain strings (not LabelText); the embedded
    // labels (Report ID / Generated) route through `ctx.t` so they localize.
    copyright: `© ${year} ${tenant}. All rights reserved.`,
    reportLine: `${ctx.t('reportId', 'Report ID')}: ${safeString(reportId)} | ${ctx.t('generated', 'Generated')}: ${generated}`,
  };
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------

export function toEngineData(
  data: ReportData,
  config: DocumentTemplateConfig,
  ctx: TranslationContext,
): EngineDocData {
  const { report, companySettings, caseData } = data;

  const documentTitle = reportTypeTitle(report.report_type, ctx);
  const custodyLog = buildCustodyLog(data.chainOfCustodyEvents, config, ctx);

  // Premium document-reference pill (rendered only by an opt-in `docRef`
  // section — the premium classic-letterhead report presets add one).
  const refNo = caseData?.case_no || caseData?.case_number || report.case_id;
  const docRef = refNo
    ? { label: { en: 'Case ID', ar: 'رقم الحالة' }, value: safeString(refNo) }
    : null;

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    docRef,
    reportHeader: buildReportHeader(data, ctx),
    reportSummary: buildReportSummary(data, ctx),
    reportInfoColumns: buildReportInfoColumns(data, ctx),
    reportSections: buildReportSections(data, ctx),
    reportFooter: buildReportFooter(data, ctx),
    ...(custodyLog ? { custodyLog } : {}),
    signatureBlocks: data.signatureBlocks,
    // A case report carries no money, line items, or party blocks.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan for more information',
  };
}
