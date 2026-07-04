/**
 * Quote adapter — maps the real {@link QuoteDocumentData} into the
 * document-agnostic {@link EngineDocData} the section renderers consume. This
 * mirrors `invoiceAdapter.ts`: the adapter owns ALL domain knowledge (currency
 * formatting, the subtotal/discount/VAT/total math, the customer-vs-company
 * display fallbacks, and which totals lines to emit based on the config
 * `totals` `lines` toggles). The renderers stay dumb.
 *
 * Differences from the invoice adapter:
 *   - Title is QUOTATION / عرض أسعار (country-routed via `config.labels`).
 *   - Discount honors `discount_type` ('amount' | 'percentage') the way the
 *     legacy builder did (percentage = subtotal × pct / 100).
 *   - Meta carries the quote number, quote date (`quote_date`, falling back to
 *     `created_at` for pre-migration rows), validity (`valid_until`) and job id.
 *     There is no payment concept, so Amount Paid / Balance Due lines are never
 *     emitted and `paymentHistory` is always null.
 *
 * Totals/taxSummary: STORED header figures (`tax_amount` / `total_amount`) and
 * the FROZEN `document_tax_lines` rollup rows (`line_item_id IS NULL`) drive
 * every VAT/GST row — never a render-time (subtotal − discount) × rate
 * recompute. `??` (never `||`) on stored money fields so a legitimate stored
 * ZERO is honored instead of falling through to a recompute.
 */

import type { QuoteDocumentData } from '../../types';
import type { DocumentTemplateConfig, ColumnConfig, TotalsLineKey } from '../../templateConfig';
import { safeString, formatEngineMoney, formatPartyAddressLines } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';
import { amountInWordsAr, amountInWordsEn } from '../amountInWords';
import type {
  BankBlock,
  EngineDocData,
  LabelText,
  PartyBlock,
  ResolvedColumn,
} from '../types';

/** Default column alignments by column key (parity with the hand-written builder).
 *  `itemCode` / `unit` are the optional statutory columns (hidden until a profile's
 *  forcedColumns flips them on) — centered like the quantity column. */
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

  // ---- Currency formatter (config.locale-driven; never fabricate a currency) -
  const currencySymbol = quoteData.accounting_locales?.currency_symbol || '';
  const decimalPlaces = config.locale?.decimalPlaces ?? quoteData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = quoteData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: currencySymbol,
      decimalPlaces,
      position: currencyPosition,
      decimalSeparator: config.locale?.decimalSeparator ?? quoteData.accounting_locales?.decimal_separator,
      thousandsSeparator: config.locale?.thousandsSeparator ?? quoteData.accounting_locales?.thousands_separator,
    });
  // Country/tenant date format (falls back to the neutral 'dd MMM yyyy' default
  // when no locale is threaded, so un-wired call sites are byte-identical).
  const docDate = (d: string | null | undefined): string => fmtDateWithConfig(d, config.locale);

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = config.labels?.documentTitle ?? { en: 'QUOTATION', ar: 'عرض أسعار' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName =
    quoteData.customer?.customer_name || quoteData.cases?.contact_name || 'N/A';
  const companyNameDisplay =
    quoteData.customer_associated_company?.company_name || quoteData.company?.company_name;
  const customerEmail =
    quoteData.customer?.email ||
    quoteData.cases?.contact_email ||
    quoteData.company?.email;
  const customerPhone =
    quoteData.customer?.mobile_number ||
    quoteData.customer?.phone_number ||
    quoteData.cases?.contact_phone ||
    quoteData.company?.phone_number;

  // Only include a detail row when the value is present — missing details are
  // omitted rather than printed as a "-" placeholder.
  const toRows: PartyBlock['rows'] = [];
  if (companyNameDisplay) toRows.push({ label: { en: 'Company:', ar: 'الشركة:' }, value: companyNameDisplay });
  if (customerPhone) toRows.push({ label: { en: 'Phone:', ar: 'الهاتف:' }, value: customerPhone });
  if (customerEmail) toRows.push({ label: { en: 'Email:', ar: 'البريد:' }, value: customerEmail });
  if (quoteData.client_reference) toRows.push({ label: { en: 'Reference:', ar: 'المرجع:' }, value: quoteData.client_reference });

  // Buyer VATIN/TRN — prefer the issuance snapshot (frozen at issue time), then
  // the live customer/company registration. The label is the snapshot label, then
  // the country tax-bar label, then a neutral default.
  const buyerTaxNumber =
    quoteData.buyer_tax_number ?? quoteData.customer?.tax_number ?? quoteData.company?.tax_number ?? null;
  if (buyerTaxNumber) {
    const taxLabel = quoteData.buyer_tax_number_label ?? config.taxBar?.label?.en ?? 'Tax No';
    toRows.push({ label: { en: `${taxLabel}:`, ar: `${taxLabel}:` }, value: buyerTaxNumber });
  }

  // Buyer address — the frozen snapshot (subdivision already resolved to a NAME
  // by issue_tax_document) wins; otherwise the live customer fields. GCC prints
  // street-first (postal-first countries ride the Task 22 address_format wiring).
  const snapshotAddr = quoteData.buyer_address as Record<string, string | null> | null;
  const addressLines = formatPartyAddressLines(
    snapshotAddr
      ? {
          line1: snapshotAddr.line1,
          line2: snapshotAddr.line2,
          city: snapshotAddr.city,
          subdivision: snapshotAddr.subdivision,
          postal_code: snapshotAddr.postal_code,
          free_text: snapshotAddr.free_text,
        }
      : {
          line1: quoteData.customer?.address_line1,
          line2: quoteData.customer?.address_line2,
          city: quoteData.customer?.city,
          subdivision: quoteData.customer?.subdivision_name,
          postal_code: quoteData.customer?.postal_code,
          free_text: undefined,
        },
    config.locale?.postalFirst ?? false,
  );
  addressLines.forEach((line, i) => {
    // The 'Address:' label leads only the first line; continuation rows are blank.
    toRows.push({ label: i === 0 ? { en: 'Address:', ar: 'العنوان:' } : { en: '', ar: '' }, value: line });
  });

  const to: PartyBlock = {
    title: config.labels?.parties ?? { en: 'Customer Information', ar: 'معلومات العميل' },
    name: customerName,
    rows: toRows,
  };

  // ---- Meta (quote details) ------------------------------------------------
  // Quote date: the statutory issuance date, distinct from `created_at`. Falls
  // back to `created_at` for pre-migration rows that never got the column
  // backfilled (M-I), so un-migrated quotes keep rendering a real date. Label
  // wording stays "Created Date:" (its existing translation-table entry) — only
  // the underlying date VALUE moves onto the statutory `quote_date` field.
  const quoteDateValue = quoteData.quote_date ?? quoteData.created_at;
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Quote No:', ar: 'رقم العرض:' }, value: quoteData.quote_number || 'Draft' },
    { label: { en: 'Created Date:', ar: 'تاريخ الإنشاء:' }, value: docDate(quoteDateValue) },
  ];
  if (quoteData.valid_until) {
    meta.push({ label: { en: 'Expiry Date:', ar: 'تاريخ الانتهاء:' }, value: docDate(quoteData.valid_until) });
  }
  // Supply (tax-point) date — a statutory field distinct from the quote date.
  // Shown only when it differs, matching the invoice adapter.
  if (quoteData.supply_date && quoteData.supply_date !== quoteDateValue) {
    meta.push({ label: { en: 'Supply Date:', ar: 'تاريخ التوريد:' }, value: docDate(quoteData.supply_date) });
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
      unit: safeString(item.unit_label ?? ''),
      itemCode: safeString(item.item_code ?? ''),
      unitPrice: money(item.unit_price),
      lineTotal: money(item.line_total ?? item.quantity * item.unit_price),
    }),
  );

  // ---- Totals: STORED header figures; tax rows from document_tax_lines rollups
  // The printed figure MUST equal the ledger figure — NO render-time recompute.
  // `??` (never `||`) on every stored money field so a legitimate stored ZERO
  // is honored instead of triggering a fallback. Discount still honors
  // `discount_type` (a business rule unrelated to AD-3): a percentage discount
  // is resolved to its absolute value for the printed Discount/Net Amount rows.
  const subtotal = quoteData.subtotal ?? 0;
  const discountAmount = quoteData.discount_amount ?? 0;
  const discountType = quoteData.discount_type || 'amount';
  const discountValue = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount;
  const discountedSubtotal = subtotal - discountValue;
  const storedTax = quoteData.tax_amount ?? 0;
  const totalAmount = quoteData.total_amount ?? (discountedSubtotal + storedTax);
  // Document-level rollup rows (one per tax component). Defensively re-sorted by
  // `sequence` — fetchDocumentTaxLines already DB-orders, but AD-3 says "ordered
  // by sequence" literally, so the adapter does not trust caller ordering.
  const rollups = (quoteData.tax_lines ?? [])
    .filter((l) => l.line_item_id === null)
    .sort((a, b) => a.sequence - b.sequence);

  const lines = totalsLines(config);
  const on = (key: string): boolean => lines[key] !== false; // default-on unless explicitly false

  // Each line carries a stable `key`; the tenant's per-line label override (Studio
  // → Total) replaces the default English wording, the secondary keeps its default.
  const tLabels = config.totals?.labels ?? {};
  const tl = (key: TotalsLineKey, en: string, ar: string): { key: TotalsLineKey; label: LabelText } => ({
    key,
    label: { en: tLabels[key] ?? en, ar },
  });

  const totals: NonNullable<EngineDocData['totals']> = [];
  if (on('subtotal')) {
    totals.push({ ...tl('subtotal', 'Subtotal:', 'المجموع الفرعي:'), value: money(subtotal) });
  }
  if (on('discount') && discountValue > 0) {
    const dline = tl('discount', 'Discount:', 'الخصم:');
    const discountLabel: LabelText =
      tLabels.discount
        ? dline.label // explicit override wins, even for a percentage discount
        : discountType === 'percentage'
          ? { en: `Discount (${discountAmount}%):`, ar: `الخصم (${discountAmount}%):` }
          : dline.label;
    totals.push({ key: 'discount', label: discountLabel, value: `- ${money(discountValue)}` });
    totals.push({ ...tl('netAmount', 'Net Amount:', 'صافي المبلغ:'), value: money(discountedSubtotal) });
  }
  if (on('vat')) {
    if (rollups.length > 0) {
      // One row per FROZEN component: its stored label + its STORED tax_amount.
      for (const r of rollups) {
        totals.push({
          key: 'tax',
          label: { en: `${r.component_label}:`, ar: `${r.component_label}:` },
          value: money(r.tax_amount),
        });
      }
    } else if (storedTax !== 0 || (quoteData.tax_rate ?? 0) > 0) {
      // Legacy / backfilled document with no tax_lines: ONE row from the STORED
      // header tax_amount (NEVER a recompute).
      const label = config.labels?.taxLabel?.en ?? 'VAT';
      const rate = quoteData.tax_rate != null ? ` ${quoteData.tax_rate}%` : '';
      totals.push({ ...tl('tax', `${label}${rate}:`, `ضريبة القيمة المضافة${rate}:`), value: money(storedTax) });
    }
  }
  if (on('total')) {
    totals.push({ ...tl('total', 'Total:', 'الإجمالي:'), value: money(totalAmount), emphasis: true });
  }
  // Amount in words (opt-in; off by default). Language-aware.
  if (lines.amountInWords === true) {
    const mode = config.language.mode;
    const enWords = amountInWordsEn(totalAmount, currencySymbol, decimalPlaces);
    const arWords = amountInWordsAr(totalAmount, currencySymbol, decimalPlaces);
    totals.push({
      ...tl('amountInWords', 'Amount in Words:', 'المبلغ بالحروف:'),
      value: mode === 'ar' ? arWords : mode.startsWith('bilingual') ? `${enWords}  ·  ${arWords}` : enWords,
    });
  }

  // ---- Tax Summary (opt-in VAT/GST breakdown) ------------------------------
  // One row per FROZEN component rollup (STORED base + tax); falls back to a
  // single row from the header tax_rate + stored tax when the document carries no
  // tax_lines. Emitted only when the tenant turns it on.
  const tsCfg = config.taxSummary;
  const taxRateDisplay = quoteData.tax_rate ?? 0;
  const taxSummary =
    tsCfg?.show && (rollups.length > 0 || taxRateDisplay > 0)
      ? {
          title: { en: tsCfg.title?.trim() || 'Tax Summary', ar: 'ملخص الضريبة' },
          columns: {
            rate: { en: 'Tax Rate', ar: 'نسبة الضريبة' },
            taxable: { en: 'Taxable Amount', ar: 'المبلغ الخاضع للضريبة' },
            tax: { en: 'Tax Amount', ar: 'مبلغ الضريبة' },
          },
          rows:
            rollups.length > 0
              ? rollups.map((r) => ({ rate: `${r.rate}%`, taxable: money(r.taxable_base), tax: money(r.tax_amount) }))
              : [{ rate: `${taxRateDisplay}%`, taxable: money(discountedSubtotal), tax: money(storedTax) }],
          // Total row uses the STORED header figures (net taxable + stored tax) —
          // never a re-sum of the component bases, which would double-count a
          // shared base (e.g. CGST + SGST both levied on the same amount).
          total: { label: { en: 'Total', ar: 'الإجمالي' }, taxable: money(discountedSubtotal), tax: money(storedTax) },
          ...(tsCfg.showAmountInWords
            ? {
                amountInWords:
                  config.language.mode === 'ar'
                    ? amountInWordsAr(storedTax, currencySymbol, decimalPlaces)
                    : config.language.mode.startsWith('bilingual')
                      ? `${amountInWordsEn(storedTax, currencySymbol, decimalPlaces)}  ·  ${amountInWordsAr(storedTax, currencySymbol, decimalPlaces)}`
                      : amountInWordsEn(storedTax, currencySymbol, decimalPlaces),
              }
            : {}),
        }
      : undefined;

  // ---- Terms / notes (structured: Terms & Conditions + Notes stacks) -------
  // Mirrors QuoteDocument.ts's separate Terms & Conditions / Notes headings. The
  // bank box (below) renders in the right column of the same row via the terms
  // section.
  const termsBlocks: NonNullable<NonNullable<EngineDocData['terms']>['blocks']> = [];
  if (quoteData.terms_and_conditions) {
    termsBlocks.push({ title: { en: 'Quote Terms', ar: 'شروط العرض' }, body: quoteData.terms_and_conditions });
  }
  if (quoteData.notes) {
    termsBlocks.push({ title: { en: 'Notes', ar: 'ملاحظات' }, body: quoteData.notes });
  }
  // Statutory notations (zero-rating / reverse-charge notices) — frozen at
  // issuance and rendered VERBATIM as their own notice stack. Bilingual modes
  // print the frozen translation beneath the English text.
  const notations = quoteData.notations ?? [];
  if (notations.length > 0) {
    const isBilingual = config.language.mode !== 'en';
    const body = notations
      .map((n) => (isBilingual && n.textTranslated ? `${n.text}\n${n.textTranslated}` : n.text))
      .join('\n');
    termsBlocks.push({ title: { en: 'Notices', ar: 'إشعارات' }, body });
  }
  const terms: EngineDocData['terms'] =
    termsBlocks.length > 0
      ? { title: { en: 'Quote Terms', ar: 'شروط العرض' }, blocks: termsBlocks }
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

  // ---- Seller registration number (band value) -----------------------------
  // Override the emitted identity so the band prints the stamped
  // `seller_tax_number` (legal_entities-sourced snapshot), matching the preview
  // and the Task 12 invoice treatment.
  const sellerVatNumber = quoteData.seller_tax_number ?? companySettings.basic_info?.vat_number ?? null;
  const identity = sellerVatNumber
    ? { ...companySettings, basic_info: { ...companySettings.basic_info, vat_number: sellerVatNumber } }
    : companySettings;

  // Generic verification QR so the QR section/footer renders a real, scannable
  // code instead of an empty box.
  const qrPayload = `QUOTE:${quoteData.quote_number || 'Draft'} TOTAL:${money(totalAmount)}${
    quoteData.valid_until ? ` VALID:${docDate(quoteData.valid_until)}` : ''
  }`;

  return {
    documentTitle,
    identity,
    parties: { to },
    meta,
    lineItems: { columns, rows },
    totals,
    taxSummary,
    paymentHistory: null,
    terms,
    bank,
    // Default signature lines so the (opt-in) Signature block renders real lines
    // when a tenant switches it on for a quote.
    signatures: [
      { en: 'Authorized Signature', ar: 'التوقيع المعتمد' },
      { en: 'Customer Acceptance', ar: 'موافقة العميل' },
    ],
    qrCaption: 'Scan to verify this quote',
    qrPayload,
  };
}
