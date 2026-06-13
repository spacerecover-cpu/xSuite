/**
 * Chain-of-custody adapter — maps the real {@link ChainOfCustodyDocumentData}
 * (case number + forensic ledger entries + company settings) into the
 * document-agnostic {@link EngineDocData} the section renderers consume, for the
 * `chain_of_custody` forensic report.
 *
 * A chain-of-custody report is a custody-ledger document: a case-info header
 * (the case number this ledger belongs to + the report-generated timestamp),
 * the {@link CustodyLogBlock} entries table (one row per immutable ledger
 * entry), and a forensic legal-notice line (immutability / tamper warning)
 * rendered above the table. The adapter owns ALL domain knowledge: the per-entry
 * cell stringification (entry number padding, action-type humanization, the
 * actor + role composition, date/time formatting), the RAW `action_category`
 * pass-through so `renderCustodyLog` can colour the badge, and the OPTIONAL
 * hash / signature columns gated on `data.options`. The section renderers stay
 * dumb.
 *
 * Mirrors `receiptAdapter.ts` / `checkoutAdapter.ts` in shape, but a custody
 * report has no money, no devices, and no party blocks — it carries `caseInfo`
 * and a single `custodyLog` block.
 *
 * Parity reference: `documents/ChainOfCustodyDocument.ts` (header lines ~26-79,
 * legal notice ~81-121, entries table ~196-288).
 */

import type { ChainOfCustodyDocumentData, ChainOfCustodyEntryData } from '../../types';
import type { DocumentTemplateConfig, ColumnConfig } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import type {
  CaseInfoBlock,
  CustodyLogBlock,
  EngineDocData,
  LabelText,
  ResolvedColumn,
} from '../types';

/** Humanize a raw snake_case action/category into "Title Case With Spaces". */
function humanize(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Zero-pad an entry number to 4 digits, parity with the legacy builder. */
function padEntryNumber(num: number): string {
  return String(num).padStart(4, '0');
}

/** Default per-column alignment for the custody table (parity with the builder). */
const COLUMN_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  entry: 'center',
  action: 'left',
  description: 'left',
  actor: 'left',
  occurredAt: 'center',
  actionCategory: 'center',
  hash: 'left',
  signature: 'left',
};

/**
 * The base custody-log columns the legacy entries table renders, in order:
 * Entry # / Action Type / Description / Actor / Date/Time / Category. The
 * `actionCategory` key is the coloured-badge column (`renderCustodyLog` maps the
 * RAW category to its fill). The optional `hash` / `signature` columns are
 * appended only when the report options ask for them.
 *
 * The built-in `chain_of_custody` config carries a partial `custodyLog.columns`
 * set; we honour any tenant-configured columns (visibility / labels / widths /
 * order) by reading them from the config, but the adapter is the source of truth
 * for the cell DATA + the default column set when the config omits one.
 */
function baseCustodyColumns(): ResolvedColumn[] {
  return [
    { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 38, align: 'center' },
    { key: 'action', visible: true, label: { en: 'Action Type', ar: 'نوع الإجراء' }, width: 65, align: 'left' },
    { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, align: 'left' },
    { key: 'actor', visible: true, label: { en: 'Actor', ar: 'المنفّذ' }, width: 80, align: 'left' },
    { key: 'occurredAt', visible: true, label: { en: 'Date/Time', ar: 'التاريخ/الوقت' }, width: 70, align: 'center' },
    { key: 'actionCategory', visible: true, label: { en: 'Category', ar: 'الفئة' }, width: 65, align: 'center' },
  ];
}

/** Read any tenant-configured custodyLog columns from the resolved config. */
function configColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const custody = config.sections.find((s) => s.key === 'custodyLog');
  return custody?.columns ?? [];
}

/**
 * Resolve the custody columns to render. The adapter's base set (with the
 * optional hash/signature columns) defines the DATA keys + default labels; a
 * tenant config may override visibility / label / width / order per column. We
 * merge by key: config columns win for visibility/label/width, but keys the
 * adapter does not produce data for are dropped so we never render an empty
 * column the renderer can't fill.
 */
function resolveCustodyColumns(
  config: DocumentTemplateConfig,
  options: ChainOfCustodyDocumentData['options'],
): ResolvedColumn[] {
  const cols = baseCustodyColumns();
  if (options?.includeHashes) {
    cols.push({ key: 'hash', visible: true, label: { en: 'Hash', ar: 'البصمة' }, align: 'left' });
  }
  if (options?.includeSignatures) {
    cols.push({ key: 'signature', visible: true, label: { en: 'Signature', ar: 'التوقيع' }, align: 'left' });
  }

  const overrides = new Map(configColumns(config).map((c) => [c.key, c]));
  return cols.map((c) => {
    const ov = overrides.get(c.key);
    if (!ov) return c;
    return {
      ...c,
      visible: ov.visible,
      label: ov.label ?? c.label,
      ...(ov.width !== undefined ? { width: ov.width } : {}),
      align: COLUMN_ALIGN[c.key] ?? c.align,
    };
  });
}

/** Stringify one ledger entry into the custody-table row shape (keys ↔ columns). */
function entryRow(entry: ChainOfCustodyEntryData): Record<string, string> {
  // Actor + role on one line (parity: "Name\n(role)"), so the cell carries both.
  const actorText = entry.actor_role
    ? `${safeString(entry.actor_name)}\n(${entry.actor_role})`
    : safeString(entry.actor_name);

  return {
    entry: `#${padEntryNumber(entry.entry_number)}`,
    action: humanize(entry.action_type),
    description: safeString(entry.action_description),
    actor: actorText,
    occurredAt: formatDate(entry.occurred_at, 'dd/MM/yyyy HH:mm'),
    // RAW category passes straight through; renderCustodyLog maps it to the
    // humanized label + badge colour (or a '-' dash cell when empty).
    actionCategory: entry.action_category ?? '',
    hash: safeString(entry.hash_value),
    signature: entry.digital_signature ? `✓ ${safeString(entry.hash_algorithm) || 'Signed'}` : '-',
  };
}

/**
 * The "Case Details" info box for a custody report. Mirrors the legacy header's
 * case-number line + the report-generated timestamp.
 */
function caseInfoBlock(caseNumber: string): CaseInfoBlock {
  return {
    title: { en: 'Case Details', ar: 'تفاصيل الحالة' },
    rows: [
      { label: { en: 'Case Number:', ar: 'رقم الحالة:' }, value: safeString(caseNumber) },
      {
        label: { en: 'Generated:', ar: 'تاريخ الإنشاء:' },
        value: formatDate(new Date().toISOString(), 'dd/MM/yyyy HH:mm'),
      },
    ],
  };
}

/** The forensic immutability / tamper-warning legal notice (parity with builder). */
const LEGAL_NOTICE: LabelText = {
  en:
    'This Chain of Custody record is maintained for forensic and legal purposes. All entries are immutable ' +
    'and cryptographically secured. Unauthorized modification or tampering with evidence may result in legal consequences.',
  ar:
    'يتم الاحتفاظ بسجل سلسلة الحيازة هذا لأغراض جنائية وقانونية. جميع الإدخالات غير قابلة للتغيير ومؤمّنة ' +
    'تشفيريًا. قد يؤدي التعديل أو العبث غير المصرّح به بالأدلة إلى عواقب قانونية.',
};

export function toEngineData(
  data: ChainOfCustodyDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { caseNumber, entries, options, companySettings } = data;

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = {
    en: 'FORENSIC CHAIN OF CUSTODY REPORT',
    ar: 'تقرير سلسلة الحيازة الجنائي',
  };

  // ---- Case-info header (case number + generated timestamp) ----------------
  const caseInfo: CaseInfoBlock = caseInfoBlock(caseNumber);

  // ---- Custody-log entries table -------------------------------------------
  const columns = resolveCustodyColumns(config, options);
  const custodyLog: CustodyLogBlock = {
    title: { en: 'Chain of Custody Entries', ar: 'سجل سلسلة الحيازة' },
    columns,
    rows: entries.map(entryRow),
    legalNotice: LEGAL_NOTICE,
    includeHashes: !!options?.includeHashes,
    includeSignatures: !!options?.includeSignatures,
  };

  // ---- Signature lines -----------------------------------------------------
  const signatures: LabelText[] = [
    { en: 'Custodian Signature', ar: 'توقيع أمين الحيازة' },
    { en: 'Witness Signature', ar: 'توقيع الشاهد' },
  ];

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    caseInfo,
    custodyLog,
    signatures,
    // Custody reports carry no money, devices, or party blocks.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan to verify',
  };
}
