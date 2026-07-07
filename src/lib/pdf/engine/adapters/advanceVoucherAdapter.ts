import type { DocumentTemplateConfig } from '../../templateConfig';
import type { CompanySettingsData } from '../../types';
import { formatEngineMoney, safeString } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';
import type { EngineDocData, LabelText, PartyBlock } from '../types';

export interface AdvanceVoucherDocumentData {
  voucher_type: 'receipt' | 'refund';
  voucher_number: string | null;
  voucher_date: string;
  currency_symbol: string;
  currency_position: 'before' | 'after' | string;
  decimal_places: number;
  customer_name: string | null;
  company_name?: string | null;
  case_no?: string | null;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  original_voucher_number: string | null;
  /** Company identity for the letterhead. Optional so the pure adapter can be
   *  unit-tested without it; the live caller threads the resolved settings. */
  company_settings?: CompanySettingsData | null;
}

export function toAdvanceVoucherEngineData(
  v: AdvanceVoucherDocumentData, config: DocumentTemplateConfig,
): EngineDocData {
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: v.currency_symbol || '',
      decimalPlaces: config.locale?.decimalPlaces ?? v.decimal_places ?? 2,
      position: v.currency_position === 'before' ? 'before' : 'after',
      decimalSeparator: config.locale?.decimalSeparator,
      thousandsSeparator: config.locale?.thousandsSeparator,
    });

  const isRefund = v.voucher_type === 'refund';
  // PLAN DRIFT: the spec cast `{ en, ar: null } as LabelText`; `LabelText.ar` is
  // `string | undefined`, so `ar: null` is not a safe assertion. `ar` is optional
  // — omit it (voucher is English-only per the in_gst bilingual:false profile).
  const documentTitle: LabelText = { en: isRefund ? 'REFUND VOUCHER' : 'RECEIPT VOUCHER' };

  const to: PartyBlock = {
    title: { en: 'Customer Information', ar: 'معلومات العميل' },
    name: v.customer_name ?? v.company_name ?? 'N/A',
    rows: [],
  };

  const meta: EngineDocData['meta'] = [
    { label: { en: 'Voucher No:', ar: 'رقم القسيمة:' }, value: v.voucher_number || 'Draft' },
    { label: { en: 'Date:', ar: 'التاريخ:' }, value: fmtDateWithConfig(v.voucher_date, config.locale) },
  ];
  if (v.case_no) meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: v.case_no });
  if (isRefund && v.original_voucher_number) {
    meta.push({ label: { en: 'Against Receipt Voucher:', ar: 'مقابل قسيمة الاستلام:' }, value: v.original_voucher_number });
  }

  const rows = [{ description: safeString(`Advance ${isRefund ? 'refund' : 'received'} against data-recovery services`) }];

  const totals: NonNullable<EngineDocData['totals']> = [
    { label: { en: 'Taxable Value:', ar: 'القيمة الخاضعة:' }, value: money(v.taxable_amount) },
    { label: { en: 'GST:', ar: 'ضريبة:' }, value: money(v.tax_amount) },
    { key: 'total', label: { en: isRefund ? 'Total Refunded:' : 'Total Received:', ar: 'الإجمالي:' }, value: money(v.total_amount), emphasis: true },
  ];

  return {
    documentTitle,
    // PLAN DRIFT: the spec set `identity: null`, but EngineDocData.identity is a
    // non-nullable CompanySettingsData. Thread the optional input (null when the
    // caller has not resolved settings — the header renderer tolerates it).
    identity: (v.company_settings ?? null) as CompanySettingsData,
    parties: { to },
    meta,
    // PLAN DRIFT: ResolvedColumn.label is LabelText, not a bare string.
    lineItems: { columns: [{ key: 'description', visible: true, label: { en: 'Description' }, align: 'left' }], rows },
    totals,
    paymentHistory: null,
    terms: null,
    bank: null,
  } satisfies EngineDocData;
}
