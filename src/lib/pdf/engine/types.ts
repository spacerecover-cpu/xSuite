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
 * The document-agnostic shape every section renderer consumes. Adapters
 * (one per source `*DocumentData`) map their domain data into this shape; the
 * engine never sees invoice/quote/etc. specifics. Optional members let one
 * shape serve financial docs (lineItems/totals/bank), intake docs (parties +
 * meta), and labels (title + qr) alike — a section renderer simply returns
 * `null` when its slice of data is absent.
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
  /** Caption shown under the QR code, or `null` when no QR is rendered. */
  qrCaption?: string | null;
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
  logoBase64?: string | null;
  qrCodeBase64?: string | null;
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
