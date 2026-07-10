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
import { formatDateTimeWithConfig } from '../../../format';
import type {
  CaseInfoBlock,
  CustodyLogBlock,
  CustodySummaryBlock,
  DigitalSignaturesBlock,
  EngineDocData,
  HashVerificationBlock,
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
};

/**
 * The base custody-log columns the legacy entries table renders, in order:
 * Entry # / Action Type / Description / Actor / Date/Time / Category. The
 * `actionCategory` key is the coloured-badge column (`renderCustodyLog` maps the
 * RAW category to its fill).
 *
 * Hashes and signatures are NOT inline columns here — matching the legacy builder,
 * they live in their own dedicated sections (`hashVerification` /
 * `digitalSignatures`), emitted by this adapter only when the report options ask
 * for them. The custody-log entries table is the same six columns whether or not
 * those options are on.
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
 * Resolve the custody columns to render. The adapter's base set defines the DATA
 * keys + default labels; a tenant config may override visibility / label / width
 * / order per column. We merge by key: config columns win for visibility / label
 * / width, but keys the adapter does not produce data for are dropped so we never
 * render an empty column the renderer can't fill.
 *
 * Hashes / signatures are NOT columns here — they are dedicated sections (see
 * `hashVerificationBlock` / `digitalSignaturesBlock`), matching the legacy
 * builder's separate Hash Verification + Digital Signatures tables.
 */
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
      align: COLUMN_ALIGN[c.key] ?? c.align,
    };
  });
}

/** Stringify one ledger entry into the custody-table row shape (keys ↔ columns). */
function entryRow(
  entry: ChainOfCustodyEntryData,
  dtConfig: ChainOfCustodyDocumentData['dateTimeConfig'],
): Record<string, string> {
  // Actor + role on one line (parity: "Name\n(role)"), so the cell carries both.
  const actorText = entry.actor_role
    ? `${safeString(entry.actor_name)}\n(${entry.actor_role})`
    : safeString(entry.actor_name);

  return {
    entry: `#${padEntryNumber(entry.entry_number)}`,
    action: humanize(entry.action_type),
    description: safeString(entry.action_description),
    actor: actorText,
    // Forensic event time: tenant timezone + explicit zone label, unambiguous
    // month-name — never the printer's browser timezone.
    occurredAt: formatDateTimeWithConfig(entry.occurred_at, dtConfig ?? null, { withTz: true }),
    // RAW category passes straight through; renderCustodyLog maps it to the
    // humanized label + badge colour (or a '-' dash cell when empty).
    actionCategory: entry.action_category ?? '',
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

/**
 * The forensic custody SUMMARY box. Mirrors the legacy `buildSummarySection`
 * (`documents/ChainOfCustodyDocument.ts` lines ~123-194): total entries, the
 * count of DISTINCT action categories, the count of DISTINCT actors, and the
 * first→last occurred-at date range (formatted `dd/MM/yyyy HH:mm`, '-' when no
 * entries). The renderer stays dumb; all the derivation lives here.
 */
function custodySummaryBlock(
  entries: ChainOfCustodyEntryData[],
  dtConfig: ChainOfCustodyDocumentData['dateTimeConfig'],
): CustodySummaryBlock {
  const categories = new Set(entries.map((e) => e.action_category));
  const actors = new Set(entries.map((e) => e.actor_name));

  let dateRange = '-';
  if (entries.length > 0) {
    const sortedByDate = [...entries].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );
    const first = formatDateTimeWithConfig(sortedByDate[0].occurred_at, dtConfig ?? null, { withTz: true });
    const last = formatDateTimeWithConfig(sortedByDate[sortedByDate.length - 1].occurred_at, dtConfig ?? null, { withTz: true });
    dateRange = `${first} - ${last}`;
  }

  return {
    title: { en: 'Summary', ar: 'ملخص' },
    rows: [
      { label: { en: 'Total Entries:', ar: 'إجمالي الإدخالات:' }, value: String(entries.length) },
      { label: { en: 'Action Categories:', ar: 'فئات الإجراءات:' }, value: String(categories.size) },
      { label: { en: 'Unique Actors:', ar: 'المنفّذون الفريدون:' }, value: String(actors.size) },
      { label: { en: 'Date Range:', ar: 'النطاق الزمني:' }, value: dateRange },
    ],
  };
}

/**
 * The forensic HASH-VERIFICATION table — one row per entry that carries a hash,
 * with columns entry # / algorithm / hash value (parity with the legacy
 * `buildHashSection`, lines ~290-340). Returns null when no entry has a hash
 * (the caller already gates on `options.includeHashes`; this guards the data so
 * an empty table is never emitted, matching the legacy early-return).
 */
function hashVerificationBlock(entries: ChainOfCustodyEntryData[]): HashVerificationBlock | null {
  const hashed = entries.filter((e) => e.hash_value);
  if (hashed.length === 0) return null;

  const columns: ResolvedColumn[] = [
    { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 50, align: 'center' },
    { key: 'algorithm', visible: true, label: { en: 'Algorithm', ar: 'الخوارزمية' }, width: 60, align: 'left' },
    { key: 'hash', visible: true, label: { en: 'Hash Value', ar: 'قيمة البصمة' }, align: 'left' },
  ];

  return {
    title: { en: 'Hash Verification', ar: 'التحقق من البصمة' },
    columns,
    rows: hashed.map((entry) => ({
      entry: `#${padEntryNumber(entry.entry_number)}`,
      algorithm: safeString(entry.hash_algorithm),
      hash: safeString(entry.hash_value),
    })),
  };
}

/**
 * The forensic DIGITAL-SIGNATURES table — one row per entry that carries a
 * digital signature, with columns entry # / signer / role / signature / date
 * (parity with the legacy `buildSignatureSection`, lines ~342-395: it drew a
 * per-entry "✓ Digitally Signed" badge with the signer name + date; the engine
 * renders the same evidentiary facts as a structured table). Returns null when
 * no entry is signed (the caller gates on `options.includeSignatures`; this
 * guards the data so an empty table is never emitted).
 */
function digitalSignaturesBlock(
  entries: ChainOfCustodyEntryData[],
  dtConfig: ChainOfCustodyDocumentData['dateTimeConfig'],
): DigitalSignaturesBlock | null {
  const signed = entries.filter((e) => e.digital_signature);
  if (signed.length === 0) return null;

  const columns: ResolvedColumn[] = [
    { key: 'entry', visible: true, label: { en: 'Entry #', ar: 'رقم' }, width: 50, align: 'center' },
    { key: 'signer', visible: true, label: { en: 'Signer', ar: 'الموقّع' }, width: 90, align: 'left' },
    { key: 'role', visible: true, label: { en: 'Role', ar: 'الدور' }, width: 70, align: 'left' },
    { key: 'signature', visible: true, label: { en: 'Signature', ar: 'التوقيع' }, align: 'left' },
    { key: 'date', visible: true, label: { en: 'Date', ar: 'التاريخ' }, width: 75, align: 'center' },
  ];

  return {
    title: { en: 'Digital Signatures', ar: 'التوقيعات الرقمية' },
    columns,
    rows: signed.map((entry) => ({
      entry: `#${padEntryNumber(entry.entry_number)}`,
      signer: safeString(entry.actor_name),
      role: entry.actor_role ? safeString(entry.actor_role) : '-',
      signature: `✓ ${safeString(entry.digital_signature)}`,
      // Forensic: WHO signed WHEN — tenant timezone + zone label, never browser tz.
      date: formatDateTimeWithConfig(entry.occurred_at, dtConfig ?? null, { withTz: true }),
    })),
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
  const columns = resolveCustodyColumns(config);
  const custodyLog: CustodyLogBlock = {
    title: { en: 'Chain of Custody Entries', ar: 'سجل سلسلة الحيازة' },
    columns,
    rows: entries.map((e) => entryRow(e, data.dateTimeConfig)),
    legalNotice: LEGAL_NOTICE,
    includeHashes: !!options?.includeHashes,
    includeSignatures: !!options?.includeSignatures,
  };

  // ---- Forensic summary box (always emitted) -------------------------------
  // Restores the legacy Summary box: total entries, action categories, unique
  // actors, date range.
  const custodySummary: CustodySummaryBlock = custodySummaryBlock(entries, data.dateTimeConfig);

  // ---- Hash verification + digital signatures (option-gated) ---------------
  // Matching the legacy gating: the Hash Verification table is emitted ONLY when
  // `includeHashes` is on (and some entry actually carries a hash); the Digital
  // Signatures table ONLY when `includeSignatures` is on (and some entry is
  // signed). When the option is off the block is null and its renderer is a no-op.
  const hashVerification: HashVerificationBlock | null = options?.includeHashes
    ? hashVerificationBlock(entries)
    : null;
  const digitalSignatures: DigitalSignaturesBlock | null = options?.includeSignatures
    ? digitalSignaturesBlock(entries, data.dateTimeConfig)
    : null;

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
    custodySummary,
    hashVerification,
    digitalSignatures,
    signatures,
    // Custody reports carry no money, devices, or party blocks.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_general_caption || 'Scan to verify',
  };
}
