/**
 * Credit Note adapter — maps the real {@link CreditNoteDocumentData} into the
 * document-agnostic {@link EngineDocData} the section renderers consume. Mirrors
 * `invoiceAdapter.ts` / `quoteAdapter.ts` for the shared party/meta/lineItems/
 * totals/terms shape, but `CreditNoteData` (types.ts:470) is FLAT: flat
 * `currency_symbol` / `currency_position` / `decimal_places` (no
 * `accounting_locales`), flat `customer_name` / `company_name`,
 * `credit_note_date`, and `CreditNoteLineItem = { description, quantity,
 * unit_price, line_total }`.
 *
 * Totals are the STORED amounts (subtotal / tax_amount / total_amount) — never
 * recomputed, mirroring `documents/CreditNoteDocument.ts`'s financial summary.
 * Component tax lines (`document_tax_lines`) land in a later phase; until then
 * the single stored header `tax_amount` is the only tax row (M-I fallback).
 *
 * There is no `bank_accounts` / payment-history data on a credit note today, so
 * `bank` and `paymentHistory` are always null. No QR payload is emitted either:
 * `generateCreditNote` has never resolved a QR image for this document type, so
 * omitting it here keeps the engine path byte-parity with the current (no-QR)
 * legacy behavior rather than silently introducing a broken native QR node.
 */

import type { DocumentTemplateConfig, ColumnConfig, TotalsLineKey } from '../../templateConfig';
import type { CreditNoteDocumentData } from '../../types';
import { formatEngineMoney, safeString } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';
import type { EngineDocData, LabelText, PartyBlock, ResolvedColumn } from '../types';

/** Default column alignments by column key (parity with invoice/quote).
 *  `itemCode` / `unit` are the optional statutory columns (hidden until a
 *  profile's forcedColumns flips them on) — centered like the quantity column. */
const COLUMN_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  description: 'left',
  quantity: 'center',
  itemCode: 'center',
  unit: 'center',
  unitPrice: 'right',
  lineTotal: 'right',
};

function resolveColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const lineItems = config.sections.find((s) => s.key === 'lineItems');
  return lineItems?.columns ?? [];
}

// The shared `forcedColumnOverrides()` helper (countryConfig.ts, landed in
// Task 12) is doc-type-agnostic: `resolveCountryLayer('credit_note')` →
// `countryTemplateOverride()` already flips the `itemCode`/`unit` columns
// visible on `config.sections.lineItems` for a profile that forces them,
// exactly like invoice/quote — reused, not duplicated, at the config-resolution
// layer, so there is no adapter-local forcedColumns handling to write here. This
// function only needs the matching alignment entries (above) so a forced column
// renders centered like every other financial doc type.
function toResolvedColumns(cols: ColumnConfig[]): ResolvedColumn[] {
  return cols.map((c) => ({
    key: c.key,
    visible: c.visible,
    label: c.label,
    ...(c.width !== undefined ? { width: c.width } : {}),
    align: COLUMN_ALIGN[c.key] ?? 'left',
  }));
}

/** Which totals lines the config asks for. Falls back to all-on when absent. */
function totalsLines(config: DocumentTemplateConfig): Record<string, boolean> {
  const totals = config.sections.find((s) => s.key === 'totals');
  return totals?.lines ?? {};
}

/** `credit_type` / `status` are snake_case codes — Title Case for display,
 *  mirroring the legacy builder's `humanize`. Returns null for empty input so
 *  callers can omit the row entirely rather than print a placeholder. */
function humanize(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toCreditNoteEngineData(
  cn: CreditNoteDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { creditNoteData, companySettings } = cn;

  // ---- Currency formatter (flat fields — no accounting_locales on CreditNoteData) --
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: creditNoteData.currency_symbol || '',
      decimalPlaces: config.locale?.decimalPlaces ?? creditNoteData.decimal_places ?? 2,
      position: creditNoteData.currency_position === 'before' ? 'before' : 'after',
      decimalSeparator: config.locale?.decimalSeparator,
      thousandsSeparator: config.locale?.thousandsSeparator,
    });

  // ---- Title (config-driven; the country layer sets TAX CREDIT NOTE vs CREDIT NOTE) --
  const documentTitle: LabelText = config.labels?.documentTitle ?? { en: 'CREDIT NOTE', ar: 'إشعار دائن' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName = creditNoteData.customer_name ?? creditNoteData.company_name ?? 'N/A';
  const toRows: PartyBlock['rows'] = [];
  if (creditNoteData.customer_name && creditNoteData.company_name) {
    toRows.push({ label: { en: 'Company:', ar: 'الشركة:' }, value: creditNoteData.company_name });
  }

  const to: PartyBlock = {
    title: config.labels?.parties ?? { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: toRows,
  };

  // ---- Meta (credit note details — mirrors the legacy "Credit Note Details" box) --
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Credit Note No:', ar: 'رقم إشعار الدائن:' }, value: creditNoteData.credit_note_number || 'Draft' },
    { label: { en: 'Date:', ar: 'التاريخ:' }, value: fmtDateWithConfig(creditNoteData.credit_note_date, config.locale) },
  ];
  const creditType = humanize(creditNoteData.credit_type);
  if (creditType) meta.push({ label: { en: 'Type:', ar: 'النوع:' }, value: creditType });
  const status = humanize(creditNoteData.status);
  if (status) meta.push({ label: { en: 'Status:', ar: 'الحالة:' }, value: status });
  if (creditNoteData.invoice_number) {
    meta.push({ label: { en: 'Against Invoice:', ar: 'مقابل الفاتورة:' }, value: creditNoteData.invoice_number });
  }
  if (creditNoteData.case_no) {
    meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: creditNoteData.case_no });
  }

  // ---- Line items ----------------------------------------------------------
  const columns = toResolvedColumns(resolveColumns(config));
  const rows: Array<Record<string, string | number>> = (creditNoteData.items ?? []).map((item) => ({
    description: safeString(item.description),
    quantity: String(item.quantity ?? 1),
    unitPrice: money(item.unit_price ?? 0),
    lineTotal: money(item.line_total ?? item.quantity * item.unit_price),
  }));

  // ---- Totals (STORED amounts — never recomputed) --------------------------
  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false; // default-on unless explicitly false

  const tLabels = config.totals?.labels ?? {};
  const tl = (key: TotalsLineKey, en: string, ar: string): { key: TotalsLineKey; label: LabelText } => ({
    key,
    label: { en: tLabels[key] ?? en, ar },
  });

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) {
    totals.push({ ...tl('subtotal', 'Subtotal:', 'المجموع الفرعي:'), value: money(creditNoteData.subtotal ?? 0) });
  }
  // M-I fallback: a single stored header tax_amount. Component tax lines
  // (document_tax_lines) are threaded onto CreditNoteData in a later phase —
  // never recompute from tax_rate × subtotal here.
  if (on('tax') && (creditNoteData.tax_amount ?? 0) !== 0) {
    const rate = creditNoteData.tax_rate != null ? ` ${creditNoteData.tax_rate}%` : '';
    totals.push({
      key: 'tax',
      label: { en: `${tLabels.tax ?? 'Tax'}${rate}:`, ar: `ضريبة${rate}:` },
      value: money(creditNoteData.tax_amount ?? 0),
    });
  }
  if (on('total')) {
    totals.push({
      ...tl('total', 'Total Credited:', 'إجمالي الدائن:'),
      value: money(creditNoteData.total_amount ?? 0),
      emphasis: true,
    });
  }
  // Applied-to-invoices — informational only (mirrors the legacy builder's
  // "Applied to invoices" row); shown only once any amount has been applied.
  if ((creditNoteData.applied_amount ?? 0) > 0) {
    totals.push({
      label: { en: 'Applied to Invoices:', ar: 'مطبق على الفواتير:' },
      value: money(creditNoteData.applied_amount ?? 0),
    });
  }

  // ---- Reason (structured terms block — mirrors the legacy "Reason" box) ---
  const reasonParts = [humanize(creditNoteData.reason_code), creditNoteData.reason_notes].filter(
    (p): p is string => !!p,
  );
  const terms: EngineDocData['terms'] =
    reasonParts.length > 0
      ? {
          title: { en: 'Reason', ar: 'السبب' },
          blocks: [{ title: { en: 'Reason', ar: 'السبب' }, body: reasonParts.join(' — ') }],
        }
      : null;

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta,
    lineItems: { columns, rows },
    totals,
    paymentHistory: null,
    terms,
    bank: null,
  } satisfies EngineDocData;
}
