/**
 * Payment Receipt adapter — maps the real {@link PaymentReceiptDocumentData}
 * into the document-agnostic {@link EngineDocData} the section renderers consume.
 * Mirrors `invoiceAdapter.ts` / `quoteAdapter.ts` for the shared currency and
 * party logic, but a receipt has no line-item table: the single received amount
 * is surfaced as the prominent (emphasized) total line, matching the legacy
 * `documents/PaymentReceiptDocument.ts` "PAID / amount / Amount Paid" box.
 *
 * Mapping:
 *   - Title is PAYMENT RECEIPT / إيصال الدفع.
 *   - Meta carries receipt no, payment date, method, reference, associated
 *     invoice no, and job id (mirrors the legacy `paymentDetailsContent`).
 *   - The amount is a single emphasized total labelled "Amount Paid".
 *   - Customer party, bank box, and notes (as a terms block) round it out.
 *
 * There is no line-item table, discount, or VAT on a receipt, so `lineItems` is
 * omitted and `paymentHistory` is always null.
 */

import type { PaymentReceiptDocumentData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatDate, formatEngineMoney } from '../../utils';
import type {
  BankBlock,
  EngineDocData,
  LabelText,
  PartyBlock,
} from '../types';

/** Which totals lines the config asks for. Falls back to all-on when absent. */
function totalsLines(config: DocumentTemplateConfig): Record<string, boolean> {
  const totals = config.sections.find((s) => s.key === 'totals');
  return totals?.lines ?? {};
}

export function toEngineData(
  receipt: PaymentReceiptDocumentData,
  config: DocumentTemplateConfig,
): EngineDocData {
  const { paymentData, companySettings } = receipt;

  // ---- Currency formatter (locale-driven, matches the builder) -------------
  const currencySymbol = paymentData.accounting_locales?.currency_symbol || 'USD';
  const decimalPlaces = paymentData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = paymentData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string =>
    formatEngineMoney(amount, { symbol: currencySymbol, decimalPlaces, position: currencyPosition });

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = { en: 'PAYMENT RECEIPT', ar: 'إيصال الدفع' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName = paymentData.customer?.customer_name || 'N/A';
  const companyNameDisplay = paymentData.company?.company_name;
  const customerEmail = paymentData.customer?.email;
  const customerPhone = paymentData.customer?.mobile_number || paymentData.customer?.phone_number;

  // Only include a detail row when the value is present — missing details are
  // omitted rather than printed as a "-" placeholder.
  const toRows: PartyBlock['rows'] = [];
  if (companyNameDisplay) toRows.push({ label: { en: 'Company:', ar: 'الشركة:' }, value: companyNameDisplay });
  if (customerPhone) toRows.push({ label: { en: 'Phone:', ar: 'الهاتف:' }, value: customerPhone });
  if (customerEmail) toRows.push({ label: { en: 'Email:', ar: 'البريد:' }, value: customerEmail });

  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: toRows,
  };

  // ---- Meta (payment details) ----------------------------------------------
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Receipt No:', ar: 'رقم الإيصال:' }, value: paymentData.receipt_number || 'Draft' },
    { label: { en: 'Payment Date:', ar: 'تاريخ الدفع:' }, value: formatDate(paymentData.payment_date, 'dd MMM yyyy') },
  ];
  if (paymentData.payment_method) {
    meta.push({ label: { en: 'Method:', ar: 'الطريقة:' }, value: paymentData.payment_method });
  }
  if (paymentData.reference_number) {
    meta.push({ label: { en: 'Reference:', ar: 'المرجع:' }, value: paymentData.reference_number });
  }
  if (paymentData.invoice?.invoice_number) {
    meta.push({ label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: paymentData.invoice.invoice_number });
  }
  if (paymentData.cases?.case_no) {
    meta.push({ label: { en: 'Case ID:', ar: 'رقم الحالة:' }, value: paymentData.cases.case_no });
  }

  // ---- Totals (the single received amount as the prominent grand total) -----
  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false; // default-on unless explicitly false

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('amountReceived')) {
    totals.push({ label: { en: 'Amount Paid:', ar: 'المبلغ المدفوع:' }, value: money(paymentData.amount), emphasis: true });
  }

  // ---- Notes (structured terms block) --------------------------------------
  const termsBlocks: NonNullable<NonNullable<EngineDocData['terms']>['blocks']> = [];
  if (paymentData.notes) {
    termsBlocks.push({ title: { en: 'Notes', ar: 'ملاحظات' }, body: paymentData.notes });
  }
  const terms: EngineDocData['terms'] =
    termsBlocks.length > 0
      ? { title: { en: 'Notes', ar: 'ملاحظات' }, blocks: termsBlocks }
      : null;

  // ---- Bank ----------------------------------------------------------------
  let bank: BankBlock | null = null;
  const ba = paymentData.bank_accounts;
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

  // Generic verification QR so the QR section/footer renders a real, scannable
  // code instead of an empty box.
  const qrPayload = `RECEIPT:${paymentData.receipt_number || 'Draft'} AMOUNT:${money(paymentData.amount)} DATE:${formatDate(paymentData.payment_date, 'dd MMM yyyy')}`;

  return {
    documentTitle,
    identity: companySettings,
    parties: { to },
    meta,
    totals,
    paymentHistory: null,
    terms,
    bank,
    qrCaption: 'Scan to verify this receipt',
    qrPayload,
  };
}
