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
  /** Terms & conditions / notes block, or `null` to omit. */
  terms?: { title: LabelText; body: string } | null;
  /** Bank details block, or `null` to omit. */
  bank?: BankBlock | null;
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
