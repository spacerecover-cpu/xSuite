/**
 * Engine core types for the tenant-configurable PDF template engine (M2).
 *
 * This module defines the NORMALIZED, document-agnostic shape that section
 * renderers consume ({@link EngineDocData}), the render context they run in
 * ({@link EngineContext}), and the renderer contract ({@link SectionRenderer}).
 *
 * The engine is ADDITIVE: it sits alongside the existing hand-written builders
 * in `src/lib/pdf/documents/*` and `pdfService.ts` and does not touch them. The
 * goal is a single config-driven assembler (`renderTemplate`) that composes the
 * existing `styles.ts` helpers, so we never re-implement styling here.
 *
 * Design source: `docs/superpowers/specs/2026-06-13-pdf-template-engine-design.md`.
 */

import type { Content } from 'pdfmake/interfaces';
import type {
  DocumentTemplateConfig,
  LabelText,
} from '../templateConfig';
import type { CompanySettingsData, TranslationContext } from '../types';

// Re-export the config-level label/column primitives so renderers can import
// everything engine-shaped from one module.
export type { LabelText };

/**
 * A fully-resolved table column ready for rendering. This is the engine's view
 * of a {@link import('../templateConfig').ColumnConfig} after the cascade has
 * run — `visible`/`label`/`width` are concrete, and `key` ties a column to the
 * matching field in each {@link EngineDocData.lineItems} row.
 */
export interface ResolvedColumn {
  /** Row-field key this column reads (e.g. `'description'`, `'lineTotal'`). */
  key: string;
  /** Whether the column is rendered. Hidden columns are dropped by the section. */
  visible: boolean;
  /** Bilingual header label. `en` is mandatory; `ar` shown in bilingual modes. */
  label: LabelText;
  /** pdfmake column width in points; omit for auto/star sizing. */
  width?: number;
  /** Cell horizontal alignment. Defaults to `'left'` when omitted. */
  align?: 'left' | 'center' | 'right';
}

/**
 * A normalized party (from / to) block — the company issuing the document and
 * the customer/recipient. Already-formatted strings: the adapter is responsible
 * for any fallbacks (`'N/A'`, `'-'`) so renderers stay dumb.
 */
export interface PartyBlock {
  /** Block heading (e.g. "Customer Information", "From"). */
  title: LabelText;
  /** Display name (company legal name or customer name). */
  name?: string;
  /** Labelled detail rows, e.g. `{ label: {en:'Phone:'}, value: '+971…' }`. */
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * A normalized bank-details block, rendered when present on financial docs.
 * Rows are pre-labelled and pre-formatted by the adapter.
 */
export interface BankBlock {
  title: LabelText;
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * A single titled prose stack inside the terms/notes area — e.g. "Payment Terms"
 * with its body, then "Notes" with its body. Modeling them as discrete blocks
 * (instead of one flat string) mirrors the legacy `InvoiceDocument.ts` layout,
 * where Payment Terms and Notes are separate stacked headings.
 */
export interface TermsTextBlock {
  /** Bilingual heading (e.g. "Payment Terms", "Notes"). */
  title: LabelText;
  /** Body prose. Already-resolved by the adapter. */
  body: string;
}

/**
 * The terms/notes region. Either a single legacy-flat `{ title, body }` box, or
 * a structured set of `blocks` (Payment Terms / Notes stacks). When `blocks` is
 * present the renderer lays the stacks alongside the {@link BankBlock} box,
 * matching the hand-written builder's terms+bank two-column row.
 */
export interface TermsBlock {
  /** Heading for the legacy single-box form. Ignored when `blocks` is set. */
  title: LabelText;
  /** Legacy single body string. Ignored when `blocks` is set. */
  body?: string;
  /** Structured Payment Terms / Notes stacks (preferred). */
  blocks?: TermsTextBlock[];
}

/**
 * One row of the payment-history statement table, pre-formatted by the adapter.
 * Mirrors `InvoiceDocument.ts`'s `paymentHistorySection` columns: date /
 * document / method / reference / recorded-by / amount / running-balance.
 */
export interface PaymentHistoryRow {
  date: string;
  document: string;
  method: string;
  reference: string;
  recordedBy: string;
  amount: string;
  runningBalance: string;
}

/**
 * The payment-history block: a bilingual title plus the statement rows. Rendered
 * only on non-proforma invoices that have recorded payments.
 */
export interface PaymentHistoryBlock {
  title: LabelText;
  /** Column header labels, keyed to {@link PaymentHistoryRow} fields. */
  columns: {
    date: LabelText;
    document: LabelText;
    method: LabelText;
    reference: LabelText;
    recordedBy: LabelText;
    amount: LabelText;
    balance: LabelText;
  };
  rows: PaymentHistoryRow[];
}

/**
 * Case identification / job header for an INTAKE (office_receipt / customer_copy)
 * or CHECKOUT (checkout_form) document, rendered as a bilingual info box of
 * label/value rows — the case-level counterpart to {@link PartyBlock}. The
 * adapter pre-formats every value (case no, status, priority, received date/time,
 * assigned technician, service type, problem description); renderers stay dumb.
 *
 * Mirrors the "Case Details" box in `documents/OfficeReceiptDocument.ts`
 * (lines ~143-156) and `documents/CheckoutFormDocument.ts` (lines ~138-144).
 */
export interface CaseInfoBlock {
  /** Box heading (e.g. "Case Details" / "تفاصيل الحالة"). */
  title: LabelText;
  /** Labelled detail rows, e.g. `{ label: {en:'Case ID:'}, value: 'CASE-0042' }`. */
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * The device-intake/return TABLE for case documents — a config-driven column
 * list plus pre-stringified rows, the device-level counterpart to
 * {@link EngineDocData.lineItems}. The adapter resolves the columns (which to
 * show, in what order, with which bilingual headers) into {@link ResolvedColumn}s
 * and stringifies each cell, including any role label; the renderer lays out the
 * header + body, applies per-column alignment, RTL-mirrors via `mirrorColumns`,
 * and colours the `role` cell via `getRoleBadgeColors` / `getSimpleRoleLabel`.
 *
 * Generalized from the "Device(s) Received / Returned" table in
 * `documents/OfficeReceiptDocument.ts` (lines ~182-265) and
 * `documents/CheckoutFormDocument.ts` (lines ~193-276). Default columns:
 * type / brand / model / serial / capacity / condition / role / notes.
 */
export interface DevicesBlock {
  /** Section heading (e.g. "Device(s) Received" / "الأجهزة المستلمة"). */
  title: LabelText;
  /** Resolved, ordered columns (key ties to a field in each {@link rows} record). */
  columns: ResolvedColumn[];
  /** One record per device; values already stringified by the adapter. */
  rows: Array<Record<string, string>>;
}

/**
 * The CHECKOUT collector block for a return/checkout document: who physically
 * collected the device(s) and when. The adapter pre-formats every value (name,
 * mobile, ID, checkout date, notes); the renderer lays them out as a bilingual
 * info box and (separately, via the shared signature section) draws the
 * signature lines. Rendered only on checkout documents.
 *
 * Mirrors the "Collection Information" box in
 * `documents/CheckoutFormDocument.ts` (lines ~146-167).
 */
export interface CollectorBlock {
  /** Box heading (e.g. "Collection Information" / "معلومات الاستلام"). */
  title: LabelText;
  /** Labelled rows: collector name / mobile / national ID / checkout date / notes. */
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * A consent / Terms-&-Conditions text block for intake & checkout documents —
 * a bilingual title plus already-resolved body prose, optionally with a policy
 * link. Distinct from the financial {@link TermsBlock}: that one drives the
 * Payment-Terms/Notes + bank two-column layout; this one is a single
 * acknowledgement/consent box (the customer authorizes the lab to proceed, or
 * acknowledges checkout/T&C).
 *
 * Generalized from the acknowledgement boxes in
 * `documents/OfficeReceiptDocument.ts` (terms section, lines ~267-277),
 * `documents/CustomerCopyDocument.ts` (lines ~265-326), and
 * `documents/CheckoutFormDocument.ts` (lines ~278-334).
 */
export interface LegalTermsBlock {
  /** Box heading (e.g. "Terms & Conditions" / "الشروط والأحكام"). */
  title: LabelText;
  /** Consent / T&C body prose. Already language-resolved by the adapter. */
  body: LabelText;
  /** Optional policy URL rendered as a link under the body. */
  policyUrl?: string | null;
}

/**
 * The forensic chain-of-custody ENTRIES table for a Chain-of-Custody report —
 * a config-driven column list plus pre-stringified rows, one per ledger entry
 * (entry no, occurred-at, action category + type, actor + role, evidence ref,
 * and optionally hash / signature). The adapter resolves which columns to show
 * (in what order, with which bilingual headers) into {@link ResolvedColumn}s and
 * stringifies every cell; the renderer lays out the header + body, applies
 * per-column alignment, RTL-mirrors via `mirrorColumns`, and colour-codes the
 * `actionCategory` cell (mirroring the legacy category palette). The legal
 * notice is a single already-resolved line rendered above (or below) the table.
 *
 * Generalized from the entries table + legal notice in
 * `documents/ChainOfCustodyDocument.ts` (lines ~196-288, legal notice ~81-121).
 * The adapter passes the RAW `action_category` (e.g. `'critical_event'`) in the
 * `actionCategory` field so the renderer can map it to the category colour;
 * every other cell is already display-formatted. `hash` / `signature` columns
 * are only included by the adapter when {@link includeHashes} /
 * {@link includeSignatures} is set, keeping this block self-describing.
 */
export interface CustodyLogBlock {
  /** Section heading (e.g. "Chain of Custody Entries" / "سجل سلسلة الحيازة"). */
  title: LabelText;
  /** Resolved, ordered columns (key ties to a field in each {@link rows} record). */
  columns: ResolvedColumn[];
  /** One record per ledger entry; values already stringified by the adapter. */
  rows: Array<Record<string, string>>;
  /**
   * The forensic legal-notice line (immutability / tamper warning), already
   * language-resolved by the adapter, rendered as a highlighted box above the
   * table. Omitted to render no notice.
   */
  legalNotice?: LabelText;
  /** Whether the adapter included a hash column (drives nothing here; documentary). */
  includeHashes?: boolean;
  /** Whether the adapter included a signature column (documentary). */
  includeSignatures?: boolean;
}

/**
 * The forensic custody SUMMARY box for a Chain-of-Custody report — a single
 * bilingual info box of pre-computed label/value rows (total entries, action
 * categories, unique actors, date range). The adapter derives every value from
 * the ledger entries (counts, distinct-category/actor sets, first→last
 * occurred-at span); the renderer stays dumb and only lays the rows out.
 *
 * Restored from the legacy `buildSummarySection` in
 * `documents/ChainOfCustodyDocument.ts` (lines ~123-194), which the M2 engine
 * folded away. Reproduces that box's four rows so the engine custody report is
 * forensically complete (total/categories/actors/date-range) before the
 * chain_of_custody flag flips. Returns nothing when no rows are supplied.
 */
export interface CustodySummaryBlock {
  /** Box heading (e.g. "Summary" / "ملخص"). */
  title: LabelText;
  /** Labelled rows: total entries / action categories / unique actors / date range. */
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * The forensic HASH-VERIFICATION table for a Chain-of-Custody report — one row
 * per ledger entry that carries a cryptographic hash, with three columns:
 * entry # / algorithm / hash value. The adapter resolves the columns into
 * {@link ResolvedColumn}s and stringifies every cell; the renderer lays the
 * header + body out, applies per-column alignment, and RTL-mirrors via
 * `mirrorColumns`, exactly like the custody-log / payment-history tables.
 *
 * Restored from the legacy `buildHashSection` in
 * `documents/ChainOfCustodyDocument.ts` (lines ~290-340). The adapter emits this
 * block ONLY when `options.includeHashes` is set and at least one entry has a
 * `hash_value` (matching the legacy gating); otherwise the block is absent and
 * the renderer returns nothing.
 */
export interface HashVerificationBlock {
  /** Section heading (e.g. "Hash Verification" / "التحقق من البصمة"). */
  title: LabelText;
  /** Resolved, ordered columns (entry / algorithm / hash). */
  columns: ResolvedColumn[];
  /** One record per hashed entry; values already stringified by the adapter. */
  rows: Array<Record<string, string>>;
}

/**
 * The forensic DIGITAL-SIGNATURES table for a Chain-of-Custody report — one row
 * per ledger entry that carries a digital signature, with columns: entry # /
 * signer / role / signature / date. The adapter resolves the columns into
 * {@link ResolvedColumn}s and stringifies every cell; the renderer lays the
 * header + body out, applies per-column alignment, and RTL-mirrors via
 * `mirrorColumns`, exactly like the custody-log / payment-history tables.
 *
 * Restored from the legacy `buildSignatureSection` in
 * `documents/ChainOfCustodyDocument.ts` (lines ~342-395). The legacy builder drew
 * a per-entry "✓ Digitally Signed" badge with the signer name + date; the engine
 * renders the same evidentiary facts (signer, role, signature ref, date) as a
 * structured table for parity + RTL fidelity. The adapter emits this block ONLY
 * when `options.includeSignatures` is set and at least one entry has a
 * `digital_signature` (matching the legacy gating); otherwise the block is absent
 * and the renderer returns nothing.
 */
export interface DigitalSignaturesBlock {
  /** Section heading (e.g. "Digital Signatures" / "التوقيعات الرقمية"). */
  title: LabelText;
  /** Resolved, ordered columns (entry / signer / role / signature / date). */
  columns: ResolvedColumn[];
  /** One record per signed entry; values already stringified by the adapter. */
  rows: Array<Record<string, string>>;
}

/**
 * The compact case-LABEL layout for a physical device/case label: a large
 * centered case number, an optional priority badge, the received date, and a
 * short device-summary list. Every value is pre-formatted by the adapter; the
 * renderer only lays them out print-friendly on the small label page.
 *
 * Generalized from `documents/CaseLabelDocument.ts` (large case-number block
 * lines ~53-71, priority badge ~34-48, received date ~73-89, device summary
 * ~139-198). Unlike the financial/intake blocks this one is its own self-
 * contained document body — the engine renders just these fields on a label-
 * sized page. `priority` is the RAW priority string (e.g. `'critical'`) so the
 * renderer can colour the badge via `getPriorityColor`.
 */
export interface CaseLabelBlock {
  /** Pre-formatted case number shown large + centered (e.g. "CASE-0042"). */
  caseNumber: string;
  /** Raw priority string for the badge (e.g. `'critical'`); omitted to hide it. */
  priority?: string;
  /** Pre-formatted received date/time string; omitted to hide the received line. */
  receivedAt?: string;
  /** Short device-summary lines (e.g. ["Seagate ST2000 — HDD", "+2 more"]). */
  deviceSummary?: string[];
  /** Optional bilingual caption under the case number (e.g. "CASE NUMBER"). */
  subtitle?: LabelText;
}

/**
 * The payslip employee/period header — employee name + number, the pay period,
 * payment date, and the working-days/hours rows — rendered as one bilingual info
 * box of label/value rows (the payslip counterpart to {@link CaseInfoBlock}).
 * The adapter pre-formats every value (name, period name + start/end, payment
 * date, days worked/absent, regular/overtime hours); the renderer stays dumb.
 *
 * Generalized from the "Employee Information" + "Attendance Summary" boxes in
 * `documents/PayslipDocument.ts` (lines ~83-149).
 */
export interface PayslipInfoBlock {
  /** Box heading (e.g. "Employee Information" / "معلومات الموظف"). */
  title: LabelText;
  /** Labelled rows: name / number / pay period / payment date / days / hours. */
  rows: Array<{ label: LabelText; value: string }>;
}

/**
 * A component table for a payslip — earnings OR deductions. Three columns:
 * component / calculation / amount, plus a pre-formatted total row. The adapter
 * pre-stringifies every cell (including the right-aligned, currency-formatted
 * amounts and the total); the renderer lays out the header + body + total and
 * RTL-mirrors the columns. Both {@link EngineDocData.earnings} and
 * {@link EngineDocData.deductions} use this same shape.
 *
 * Generalized from `buildComponentTable` in `documents/PayslipDocument.ts`
 * (lines ~151-207).
 */
export interface PayComponentBlock {
  /** Section heading (e.g. "Earnings" / "الإيرادات", "Deductions" / "الخصومات"). */
  title: LabelText;
  /** Bilingual column headers (component / calculation / amount). */
  columns: { component: LabelText; calculation: LabelText; amount: LabelText };
  /** One row per component; values already stringified by the adapter. */
  rows: Array<{ component: string; calculation: string; amount: string }>;
  /** Pre-formatted total: its label (e.g. "Total Earnings") and amount string. */
  total: { label: LabelText; amount: string };
}

/**
 * The emphasized Net Salary line on a payslip — a single bilingual label plus
 * the pre-formatted net amount, rendered in the boxed, larger treatment (the
 * payslip's grand-total equivalent). Distinct from {@link EngineDocData.totals}:
 * a payslip net is one self-contained highlighted block, not a stack of totals
 * lines.
 *
 * Generalized from the `netSalarySection` in `documents/PayslipDocument.ts`
 * (lines ~209-234).
 */
export interface NetPayBlock {
  /** Net-salary label (e.g. "Net Salary" / "صافي الراتب"). */
  label: LabelText;
  /** Pre-formatted net amount string (currency applied by the adapter). */
  amount: string;
}

/**
 * The compact STOCK-LABEL body for a physical stock label: item name, optional
 * category + brand, and a short detail list (SKU / barcode / price / location).
 * Every value is pre-formatted by the adapter; the renderer only lays them out
 * print-friendly on the small custom label page. Optional fields are omitted to
 * hide their row, exactly like the legacy builder's conditional pushes.
 *
 * Generalized from `buildSingleLabel` in `documents/StockLabelDocument.ts`
 * (lines ~15-125). The label is its own self-contained document body — the
 * engine renders just these fields on the custom label-sized page.
 */
export interface StockLabelBlock {
  /** Item name shown large + bold (the label's focal point). */
  name: string;
  /** Optional category caption (top-right), e.g. "Internal HDD". */
  category?: string;
  /** Optional brand line under the name. */
  brand?: string;
  /** Optional SKU detail row. */
  sku?: string;
  /** Optional barcode detail row (monospace value). */
  barcode?: string;
  /** Optional pre-formatted price detail row (currency applied by the adapter). */
  price?: string;
  /** Optional location detail row. */
  location?: string;
  /** Optional company name caption (top-left). */
  companyName?: string;
  /** Bilingual detail-row labels (SKU / Barcode / Price / Location). */
  labels?: {
    sku?: LabelText;
    barcode?: LabelText;
    price?: LabelText;
    location?: LabelText;
  };
}

/**
 * The ordered, DB-DRIVEN dynamic sections of a case REPORT — each a bilingual
 * section header plus a free-prose content body. This is the engine counterpart
 * to the `case_report_sections` rows the legacy `documents/ReportDocument.ts`
 * iterates (its `visibleSections.forEach`, lines ~411-495): a tenant/template
 * supplies an arbitrary list of titled sections (diagnostic findings, proposed
 * solutions, recovery time, failure-cause analysis, recommendations, …) and the
 * renderer lays each out as a boxed heading + paragraph-preserving content.
 *
 * The adapter pre-resolves each section's title into a {@link LabelText} (real
 * EN/AR strings, never a hardcoded null) and pre-cleans the content to PLAIN
 * TEXT — stripping HTML the same way the legacy `stripHtmlTags` helper does, so
 * paragraph breaks survive as `\n` newlines — and may pass an explicit `order`.
 * The renderer is stable for ANY number of sections (zero → renders nothing).
 *
 * NOTE: the forensic chain-of-custody timeline is NOT modelled here. That reuses
 * the existing {@link CustodyLogBlock} / `custodyLog` block, exactly as the
 * legacy builder special-cases the `chain_of_custody` section into its own
 * timeline rather than a prose box.
 */
export interface ReportSectionsBlock {
  /**
   * The ordered dynamic sections. Each is a bilingual header + plain-text body.
   * `order` is optional; when present the renderer sorts ascending by it (ties
   * keep input order), otherwise input order is preserved.
   */
  sections: Array<{ title: LabelText; content: string; order?: number }>;
}

/**
 * The device DIAGNOSTICS info box for a case REPORT — the "Media Details" /
 * "Component Diagnostics" block rendered as bilingual label/value rows (the
 * report counterpart to {@link CaseInfoBlock}). The adapter pre-formats every
 * value and chooses the field set by device kind: HDD diagnostics (heads / PCB /
 * motor / surface status) vs SSD diagnostics (controller / memory-chips status,
 * controller model, NAND type), plus shared rows (type / model / capacity /
 * serial / physical-damage notes). The renderer stays dumb — it only lays the
 * supplied rows out; the HDD-vs-SSD branching lives entirely in the adapter.
 *
 * Generalized from the Media-Details + Component-Diagnostics block hand-written
 * in `documents/ReportDocument.ts` (lines ~300-400), where the HDD branch reads
 * `heads_status` / `pcb_status` / `motor_status` / `surface_status` and the SSD
 * branch reads `controller_status` / `memory_chips_status` / `controller_model`
 * / `nand_type` off `diagnosticsData.device_type_category`. Returns nothing when
 * no rows are supplied.
 */
export interface DiagnosticsBlock {
  /** Box heading (e.g. "Media Details" / "تفاصيل الوسائط"). */
  title: LabelText;
  /** Labelled rows: type/model/capacity/serial + the kind-specific diagnostics. */
  rows: Array<{ label: LabelText; value: string }>;
  /**
   * The RAW device kind/category the adapter branched on (e.g. `'hdd'` / `'ssd'`),
   * passed through for documentary/diagnostic purposes; the renderer does not
   * branch on it (the adapter already chose the rows). Omitted when unknown.
   */
  deviceKind?: string;
}

/**
 * The document-agnostic shape every section renderer consumes. Adapters
 * (one per source `*DocumentData`) map their domain data into this shape; the
 * engine never sees invoice/quote/etc. specifics. Optional members let one
 * shape serve financial docs (lineItems/totals/bank), intake docs (parties +
 * caseInfo + devices + legalTerms), checkout docs (collector), and labels
 * (title + qr) alike — a section renderer simply returns `null` when its slice
 * of data is absent.
 */
export interface EngineDocData {
  /** Bilingual document title (e.g. EN "TAX INVOICE" / AR "فاتورة ضريبية"). */
  documentTitle: LabelText;
  /** Company identity for the header/footer (logo, legal name, address, contact). */
  identity: CompanySettingsData;
  /** From (issuer) and To (recipient) party blocks. Either may be omitted. */
  parties: { from?: PartyBlock; to?: PartyBlock };
  /** Free-form metadata rows (doc no, dates, job id, …) shown in a meta box. */
  meta: Array<{ label: LabelText; value: string }>;
  /**
   * Case identification / job header for intake & checkout documents (case no,
   * status, priority, received date/time, assigned technician, service type,
   * problem description), or absent on documents with no case context.
   */
  caseInfo?: CaseInfoBlock | null;
  /**
   * Device intake/return table for case documents (type/brand/model/serial/
   * capacity/condition/role/notes), or absent when the document tracks no
   * physical devices.
   */
  devices?: DevicesBlock | null;
  /**
   * Checkout collector block (who collected the device(s) + checkout date/notes),
   * or absent on non-checkout documents.
   */
  collector?: CollectorBlock | null;
  /**
   * Consent / Terms-&-Conditions acknowledgement box for intake & checkout
   * documents, or absent to omit. Distinct from the financial {@link terms}
   * block (Payment-Terms/Notes + bank).
   */
  legalTerms?: LegalTermsBlock | null;
  /** Line-item table: resolved columns + already-stringified/numeric cells. */
  lineItems?: {
    columns: ResolvedColumn[];
    rows: Array<Record<string, string | number>>;
  };
  /** Totals lines (subtotal/vat/total/…). `emphasis` flags the grand total. */
  totals?: Array<{ label: LabelText; value: string; emphasis?: boolean }>;
  /**
   * Terms & conditions / notes block, or `null` to omit.
   *
   * Two shapes are accepted so the renderer can match the legacy builders:
   * - Legacy-flat: a single `{ title, body }` (one EN/AR terms box).
   * - Structured: an ordered list of `blocks`, each a labelled stack (e.g.
   *   "Payment Terms" then "Notes"), rendered alongside the bank box. This
   *   mirrors `InvoiceDocument.ts`'s separate Payment Terms / Notes stacks
   *   rather than collapsing them into one flat string.
   */
  terms?: TermsBlock | null;
  /** Bank details block, or `null` to omit. */
  bank?: BankBlock | null;
  /**
   * Payment-history statement (date/document/method/reference/recorded-by/
   * amount/running-balance), or `null`/absent to omit. Populated by the adapter
   * for non-proforma invoices that have recorded payments.
   */
  paymentHistory?: PaymentHistoryBlock | null;
  /** Signature line labels (e.g. ["Received by", "Authorized by"]). */
  signatures?: LabelText[];
  /**
   * Forensic chain-of-custody entries table (entry no / occurred-at / action
   * category + type / actor + role / evidence ref / optional hash+signature)
   * plus the legal notice, or absent on documents with no custody ledger.
   */
  custodyLog?: CustodyLogBlock | null;
  /**
   * Forensic custody SUMMARY box for a Chain-of-Custody report (total entries /
   * action categories / unique actors / date range), or absent on documents with
   * no custody ledger. Restored from the legacy builder's Summary box.
   */
  custodySummary?: CustodySummaryBlock | null;
  /**
   * Forensic HASH-VERIFICATION table for a Chain-of-Custody report (entry /
   * algorithm / hash), or absent. Emitted by the adapter ONLY when the report's
   * `includeHashes` option is on and at least one entry carries a hash.
   */
  hashVerification?: HashVerificationBlock | null;
  /**
   * Forensic DIGITAL-SIGNATURES table for a Chain-of-Custody report (entry /
   * signer / role / signature / date), or absent. Emitted by the adapter ONLY
   * when the report's `includeSignatures` option is on and at least one entry
   * carries a digital signature.
   */
  digitalSignatures?: DigitalSignaturesBlock | null;
  /**
   * Device diagnostics info box for a case REPORT (Media Details / Component
   * Diagnostics — type/model/capacity/serial plus the HDD- or SSD-specific
   * component-status rows the adapter selected), or absent on non-report docs.
   */
  diagnostics?: DiagnosticsBlock | null;
  /**
   * The ordered, DB-driven dynamic sections of a case REPORT (each a bilingual
   * header + prose body), or absent on non-report documents. The custody
   * timeline is NOT here — it reuses {@link custodyLog}.
   */
  reportSections?: ReportSectionsBlock | null;
  /**
   * Case-label body (large case number, priority badge, received date, device
   * summary), or absent on non-label documents.
   */
  caseLabel?: CaseLabelBlock | null;
  /**
   * Payslip employee/period header (name, number, pay period, payment date,
   * working days/hours), or absent on non-payslip documents.
   */
  payslipInfo?: PayslipInfoBlock | null;
  /**
   * Payslip earnings component table (component / calculation / amount + total),
   * or absent on non-payslip documents.
   */
  earnings?: PayComponentBlock | null;
  /**
   * Payslip deductions component table (component / calculation / amount + total),
   * or absent on non-payslip documents.
   */
  deductions?: PayComponentBlock | null;
  /**
   * Payslip emphasized Net Salary line, or absent on non-payslip documents.
   */
  netPay?: NetPayBlock | null;
  /**
   * Stock-label body (item name, category, brand, SKU/barcode/price/location),
   * or absent on non-stock-label documents.
   */
  stockLabel?: StockLabelBlock | null;
  /** Caption shown under the QR code, or `null` when no QR is rendered. */
  qrCaption?: string | null;
  /**
   * ZATCA / GCC e-invoice QR payload (base64 TLV), or null/absent. When present,
   * the QR surfaces render it natively via pdfmake's `qr` type instead of the
   * pre-loaded image QR. Set by the invoice adapter when the tax bar is enabled.
   */
  zatcaPayload?: string | null;
  /**
   * A generic QR payload (e.g. a document-verification string) the QR surfaces
   * fall back to when there is no {@link zatcaPayload} and no pre-loaded image QR.
   * Lets a document render a real, scannable QR by default instead of nothing.
   * Precedence: `zatcaPayload` → pre-loaded image → `qrPayload`.
   */
  qrPayload?: string | null;
}

/**
 * Everything a section renderer needs at render time: the resolved template
 * config (visibility/order/labels/paper/language), the translation/RTL context,
 * and the pre-loaded logo + QR images (base64 data URLs, or null/undefined).
 *
 * Images are pre-loaded by the caller (async I/O stays outside the pure engine).
 */
export interface EngineContext {
  config: DocumentTemplateConfig;
  ctx: TranslationContext;
  /** The logo: a base64 data-URL string OR a classified BrandingImage, or null. */
  logo?: import('../brandingImage').BrandingImage | string | null;
  qrCodeBase64?: string | null;
  stampImage?: import('../brandingImage').BrandingImage | string | null;
  signatureImage?: import('../brandingImage').BrandingImage | string | null;
}

/**
 * A section renderer: given the engine context and normalized data, produce the
 * pdfmake content for one section, an array of content blocks, or `null` to
 * render nothing (e.g. a financial section on a doc with no money).
 *
 * Renderers are pure and side-effect-free. They honor `config` visibility/order
 * (the assembler filters/sorts before dispatch) and `language.mode` (bilingual
 * vs single), composing the helpers in `styles.ts` rather than styling inline.
 */
export type SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
) => Content | Content[] | null;
