/**
 * Quote adapter — maps the real {@link QuoteDocumentData} into the
 * document-agnostic {@link EngineDocData} the section renderers consume. This
 * mirrors `invoiceAdapter.ts`: the adapter owns ALL domain knowledge (currency
 * formatting, the subtotal/discount/VAT/total math from
 * `documents/QuoteDocument.ts` lines ~219-226, the customer-vs-company display
 * fallbacks, and which totals lines to emit based on the config `totals` `lines`
 * toggles). The renderers stay dumb.
 *
 * Differences from the invoice adapter:
 *   - Title is QUOTATION / عرض أسعار.
 *   - Discount honors `discount_type` ('amount' | 'percentage') the way the
 *     legacy builder does (percentage = subtotal × pct / 100).
 *   - Meta carries the quote number, created date, validity (`valid_until`) and
 *     job id. There is no payment concept, so Amount Paid / Balance Due lines
 *     are never emitted and `paymentHistory` is always null.
 */

import type { QuoteDocumentData } from '../../types';
import type { DocumentTemplateConfig, ColumnConfig } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import { amountInWordsAr, amountInWordsEn } from '../amountInWords';
import type {
  BankBlock,
  EngineDocData,
  LabelText,
  PartyBlock,
  ResolvedColumn,
} from '../types';

/** Default column alignments by column key (parity with the hand-written builder). */
const COLUMN_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  description: 'left',
  quantity: 'center',
  unitPrice: 'right',
  lineTotal: 'right',
};

function resolveColumns(config: DocumentTemplateConfig): ColumnConfig[] {
  const lineItems = config.sections.find((s) => s.key === 'lineItems');
  return lineItems?.columns ?? [];
}

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

export function toEngineData(
  quote: QuoteDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { quoteData, companySettings } = quote;

  // ---- Currency formatter (locale-driven, matches the builder) -------------
  const currencySymbol = quoteData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = quoteData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = quoteData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = { en: 'QUOTATION', ar: 'عرض أسعار' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName =
    quoteData.customer?.customer_name || quoteData.cases?.contact_name || 'N/A';
  const companyNameDisplay =
    quoteData.customer_associated_company?.company_name || quoteData.company?.company_name;
  const customerEmail =
    quoteData.customer?.email ||
    quoteData.cases?.contact_email ||
    quoteData.company?.email ||
    'N/A';
  const customerPhone =
    quoteData.customer?.mobile_number ||
    quoteData.customer?.phone_number ||
    quoteData.cases?.contact_phone ||
    quoteData.company?.phone_number ||
    'N/A';

  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: [
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(companyNameDisplay) },
      { label: { en: 'Phone:', ar: 'الهاتف:' }, value: customerPhone },
      { label: { en: 'Email:', ar: 'البريد:' }, value: customerEmail },
      { label: { en: 'Reference:', ar: 'المرجع:' }, value: safeString(quoteData.client_reference) },
    ],
  };

  // ---- Meta (quote details) ------------------------------------------------
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Quote No:', ar: 'رقم العرض:' }, value: quoteData.quote_number || 'Draft' },
    { label: { en: 'Created Date:', ar: 'تاريخ الإنشاء:' }, value: formatDate(quoteData.created_at, 'dd MMM yyyy') },
  ];
  if (quoteData.valid_until) {
    meta.push({ label: { en: 'Expiry Date:', ar: 'تاريخ الانتهاء:' }, value: formatDate(quoteData.valid_until, 'dd MMM yyyy') });
  }
  if (quoteData.cases?.case_no) {
    meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: quoteData.cases.case_no });
  }

  // ---- Line items ----------------------------------------------------------
  const columns = toResolvedColumns(resolveColumns(config));
  const rows: Array<Record<string, string | number>> = (quoteData.quote_items || []).map(
    (item) => ({
      description: safeString(item.description),
      quantity: String(item.quantity),
      unitPrice: money(item.unit_price),
      lineTotal: money(item.line_total ?? item.quantity * item.unit_price),
    }),
  );

  // ---- Totals (math mirrored from the builder) -----------------------------
  const subtotal = quoteData.subtotal || 0;
  const discountAmount = quoteData.discount_amount || 0;
  const discountType = quoteData.discount_type || 'amount';
  const discountValue = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount;
  const discountedSubtotal = subtotal - discountValue;
  const taxRate = quoteData.tax_rate || 0;
  const taxAmount = (discountedSubtotal * taxRate) / 100;
  const totalAmount = discountedSubtotal + taxAmount;

  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false; // default-on unless explicitly false

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) {
    totals.push({ label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: money(subtotal) });
  }
  if (on('discount') && discountValue > 0) {
    const discountLabel: LabelText =
      discountType === 'percentage'
        ? { en: `Discount (${discountAmount}%):`, ar: `الخصم (${discountAmount}%):` }
        : { en: 'Discount:', ar: 'الخصم:' };
    totals.push({ label: discountLabel, value: `- ${money(discountValue)}` });
    totals.push({ label: { en: 'Net Amount:', ar: 'صافي المبلغ:' }, value: money(discountedSubtotal) });
  }
  if (on('vat')) {
    totals.push({ label: { en: `VAT ${taxRate}%:`, ar: `ضريبة القيمة المضافة ${taxRate}%:` }, value: money(taxAmount) });
  }
  if (on('total')) {
    totals.push({ label: { en: 'Total:', ar: 'الإجمالي:' }, value: money(totalAmount), emphasis: true });
  }
  // Amount in words (opt-in; off by default). Language-aware.
  if (lines.amountInWords === true) {
    const mode = config.language.mode;
    const enWords = amountInWordsEn(totalAmount, currencySymbol);
    const arWords = amountInWordsAr(totalAmount, currencySymbol);
    totals.push({
      label: { en: 'Amount in Words:', ar: 'المبلغ بالحروف:' },
      value: mode === 'ar' ? arWords : mode.startsWith('bilingual') ? `${enWords}  ·  ${arWords}` : enWords,
    });
  }

  // ---- Terms / notes (structured: Terms & Conditions + Notes stacks) -------
  // Mirrors QuoteDocument.ts's separate Terms & Conditions / Notes headings. The
  // bank box (below) renders in the right column of the same row via the terms
  // section.
  const termsBlocks: NonNullable<NonNullable<EngineDocData['terms']>['blocks']> = [];
  if (quoteData.terms_and_conditions) {
    termsBlocks.push({ title: { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: quoteData.terms_and_conditions });
  }
  if (quoteData.notes) {
    termsBlocks.push({ title: { en: 'Notes', ar: 'ملاحظات' }, body: quoteData.notes });
  }
  const terms: EngineDocData['terms'] =
    termsBlocks.length > 0
      ? { title: { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, blocks: termsBlocks }
      : null;

  // ---- Bank ----------------------------------------------------------------
  let bank: BankBlock | null = null;
  const ba = quoteData.bank_accounts;
  if (ba) {
    const bankRows: BankBlock['rows'] = [];
    if (ba.account_name) bankRows.push({ label: { en: 'Account Name:', ar: 'اسم الحساب:' }, value: ba.account_name });
    if (ba.account_number) bankRows.push({ label: { en: 'Account No:', ar: 'رقم الحساب:' }, value: ba.account_number });
    if (ba.bank_name) bankRows.push({ label: { en: 'Bank:', ar: 'البنك:' }, value: ba.bank_name });
    if (ba.iban) bankRows.push({ label: { en: 'IBAN:', ar: 'الآيبان:' }, value: ba.iban });
    if (ba.swift_code) bankRows.push({ label: { en: 'SWIFT:', ar: 'سويفت:' }, value: ba.swift_code });
    if (bankRows.length > 0) {
      bank = { title: { en: 'Bank Account', ar: 'تفاصيل البنك' }, rows: bankRows };
    }
  }

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta,
    lineItems: { columns, rows },
    totals,
    paymentHistory: null,
    terms,
    bank,
    qrCaption: 'Scan to approve this quote',
  };
}
