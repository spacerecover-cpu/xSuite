/**
 * Invoice adapter — maps the real {@link InvoiceDocumentData} into the
 * document-agnostic {@link EngineDocData} the section renderers consume. This is
 * the pilot that proves the engine end-to-end for the invoice doc type.
 *
 * The adapter owns ALL domain knowledge: currency formatting, the
 * subtotal/discount/VAT/total math (mirrored from `documents/InvoiceDocument.ts`
 * lines ~222-229), the customer-vs-company display fallbacks, and which totals
 * lines to emit based on the config `totals` section `lines` toggles. The
 * renderers stay dumb.
 */

import type { InvoiceDocumentData } from '../../types';
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
  invoice: InvoiceDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { invoiceData, companySettings } = invoice;

  // ---- Currency formatter (locale-driven, matches the builder) -------------
  const currencySymbol = invoiceData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = invoiceData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = invoiceData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string => {
    const formatted = amount.toFixed(decimalPlaces);
    return currencyPosition === 'before' ? `${currencySymbol} ${formatted}` : `${formatted} ${currencySymbol}`;
  };

  // ---- Title ---------------------------------------------------------------
  const isProforma = invoiceData.invoice_type === 'proforma';
  const documentTitle: LabelText = isProforma
    ? { en: 'PROFORMA INVOICE', ar: 'فاتورة مبدئية' }
    : { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName =
    invoiceData.customer?.customer_name || invoiceData.cases?.contact_name || 'N/A';
  const companyNameDisplay =
    invoiceData.customer_associated_company?.company_name || invoiceData.company?.company_name;
  const customerEmail =
    invoiceData.customer?.email ||
    invoiceData.cases?.contact_email ||
    invoiceData.company?.email ||
    'N/A';
  const customerPhone =
    invoiceData.customer?.mobile_number ||
    invoiceData.customer?.phone_number ||
    invoiceData.cases?.contact_phone ||
    invoiceData.company?.phone_number ||
    'N/A';

  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: [
      { label: { en: 'Company:', ar: 'الشركة:' }, value: safeString(companyNameDisplay) },
      { label: { en: 'Phone:', ar: 'الهاتف:' }, value: customerPhone },
      { label: { en: 'Email:', ar: 'البريد:' }, value: customerEmail },
      { label: { en: 'Reference:', ar: 'المرجع:' }, value: safeString(invoiceData.client_reference) },
    ],
  };

  // ---- Meta (invoice details) ----------------------------------------------
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: invoiceData.invoice_number || 'Draft' },
    { label: { en: 'Invoice Date:', ar: 'تاريخ الفاتورة:' }, value: formatDate(invoiceData.invoice_date, 'dd MMM yyyy') },
    { label: { en: 'Due Date:', ar: 'تاريخ الاستحقاق:' }, value: formatDate(invoiceData.due_date, 'dd MMM yyyy') },
  ];
  if (invoiceData.cases?.case_no) {
    meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: invoiceData.cases.case_no });
  }

  // ---- Line items ----------------------------------------------------------
  const columns = toResolvedColumns(resolveColumns(config));
  const rows: Array<Record<string, string | number>> = (invoiceData.invoice_line_items || []).map(
    (item) => ({
      description: safeString(item.description),
      quantity: String(item.quantity),
      unitPrice: money(item.unit_price),
      lineTotal: money(item.line_total || item.quantity * item.unit_price),
    }),
  );

  // ---- Totals (math mirrored from the builder) -----------------------------
  const subtotal = invoiceData.subtotal || 0;
  const discountAmount = invoiceData.discount_amount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  const taxRate = invoiceData.tax_rate || 0;
  const taxAmount = (discountedSubtotal * taxRate) / 100;
  const totalAmount = discountedSubtotal + taxAmount;
  const amountPaid = invoiceData.amount_paid || 0;
  const balanceDue = totalAmount - amountPaid;

  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false; // default-on unless explicitly false

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) {
    totals.push({ label: { en: 'Subtotal:', ar: 'المجموع الفرعي:' }, value: money(subtotal) });
  }
  if (on('discount') && discountAmount > 0) {
    totals.push({ label: { en: 'Discount:', ar: 'الخصم:' }, value: `- ${money(discountAmount)}` });
    totals.push({ label: { en: 'Net Amount:', ar: 'صافي المبلغ:' }, value: money(discountedSubtotal) });
  }
  if (on('vat')) {
    totals.push({ label: { en: `VAT ${taxRate}%:`, ar: `ضريبة القيمة المضافة ${taxRate}%:` }, value: money(taxAmount) });
  }
  if (on('total')) {
    totals.push({ label: { en: 'Total:', ar: 'الإجمالي:' }, value: money(totalAmount), emphasis: true });
  }
  // Amount Paid / Balance Due — only on non-proforma invoices with a recorded
  // payment, matching InvoiceDocument.ts (lines ~296-314).
  if (!isProforma && amountPaid > 0) {
    if (on('amountPaid')) {
      totals.push({ label: { en: 'Amount Paid:', ar: 'المبلغ المدفوع:' }, value: money(amountPaid) });
    }
    if (on('balanceDue')) {
      totals.push({ label: { en: 'Balance Due:', ar: 'الرصيد المستحق:' }, value: money(balanceDue) });
    }
  }
  // Amount in words (opt-in; off by default). Language-aware: Arabic-lead modes
  // spell in Arabic, bilingual shows both.
  if (lines.amountInWords === true) {
    const mode = config.language.mode;
    const enWords = amountInWordsEn(totalAmount, currencySymbol);
    const arWords = amountInWordsAr(totalAmount, currencySymbol);
    const value = mode === 'ar' ? arWords : mode.startsWith('bilingual') ? `${enWords}  ·  ${arWords}` : enWords;
    totals.push({ label: { en: 'Amount in Words:', ar: 'المبلغ بالحروف:' }, value });
  }

  // ---- Terms / notes (structured: Payment Terms + Notes stacks) ------------
  // Mirrors InvoiceDocument.ts's separate Payment Terms / Notes headings rather
  // than collapsing them into one flat string. The bank box (below) renders in
  // the right column of the same row via the terms section.
  const termsBlocks: NonNullable<NonNullable<EngineDocData['terms']>['blocks']> = [];
  if (invoiceData.payment_terms) {
    termsBlocks.push({ title: { en: 'Payment Terms', ar: 'شروط الدفع' }, body: invoiceData.payment_terms });
  }
  if (invoiceData.notes) {
    termsBlocks.push({ title: { en: 'Notes', ar: 'ملاحظات' }, body: invoiceData.notes });
  }
  const terms: EngineDocData['terms'] =
    termsBlocks.length > 0
      ? { title: { en: 'Payment Terms', ar: 'شروط الدفع' }, blocks: termsBlocks }
      : null;

  // ---- Bank ----------------------------------------------------------------
  let bank: BankBlock | null = null;
  const ba = invoiceData.bank_accounts;
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

  // ---- Payment history -----------------------------------------------------
  // Mirrors InvoiceDocument.ts's paymentHistorySection: rendered only on
  // non-proforma invoices that actually have recorded payments. Every cell is
  // pre-formatted here (currency / dates / '-' fallbacks) so the renderer is dumb.
  const rawHistory = invoice.paymentHistory ?? [];
  const paymentHistory: EngineDocData['paymentHistory'] =
    !isProforma && rawHistory.length > 0
      ? {
          title: { en: 'Payment History', ar: 'سجل الدفعات' },
          columns: {
            date: { en: 'Date', ar: 'التاريخ' },
            document: { en: 'Document', ar: 'المستند' },
            method: { en: 'Method', ar: 'الطريقة' },
            reference: { en: 'Reference', ar: 'المرجع' },
            recordedBy: { en: 'Recorded By', ar: 'سجلها' },
            amount: { en: 'Amount', ar: 'المبلغ' },
            balance: { en: 'Balance', ar: 'الرصيد' },
          },
          rows: rawHistory.map((p) => ({
            date: p.payment_date ? formatDate(p.payment_date) : '-',
            document: p.doc_number || '-',
            method: p.method || '-',
            reference: p.reference || '-',
            recordedBy: p.recorded_by || '-',
            amount: money(p.amount),
            runningBalance: p.running_balance !== undefined ? money(p.running_balance) : '-',
          })),
        }
      : null;

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta,
    lineItems: { columns, rows },
    totals,
    paymentHistory,
    terms,
    bank,
    qrCaption: 'Scan to pay this invoice',
  };
}
