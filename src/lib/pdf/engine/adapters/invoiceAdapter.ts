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
import type { DocumentTemplateConfig, ColumnConfig, TotalsLineKey } from '../../templateConfig';
import { formatDate, safeString, formatEngineMoney, formatPartyAddressLines } from '../../utils';
import { fmtDateWithConfig } from '../../configDate';
import { amountInWordsAr, amountInWordsEn } from '../amountInWords';
import { resolveEInvoicingTransport } from '../../../regimes/registry';
import { resolveStatutoryDocumentMeta } from '../../../regimes/in_gst/statutoryMeta';
import type { ResolvedCountryFacts } from '../countryConfig';
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
  invoice: InvoiceDocumentData,
  config: DocumentTemplateConfig,
  facts?: ResolvedCountryFacts | null,
): EngineDocData {
  const { invoiceData, companySettings } = invoice;

  // ---- Currency formatter (config.locale-driven; never fabricate a currency) -
  // Country-Engine sourced symbol (via currencyToBlock); an empty symbol prints
  // the bare grouped number rather than a wrong 'USD'. decimalPlaces / separators
  // prefer the resolved country locale, then the document's accounting_locales.
  const currencySymbol = invoiceData.accounting_locales?.currency_symbol || '';
  const decimalPlaces = config.locale?.decimalPlaces ?? invoiceData.accounting_locales?.decimal_places ?? 2;
  const currencyPosition = invoiceData.accounting_locales?.currency_position || 'after';
  const money = (amount: number): string =>
    formatEngineMoney(amount, {
      symbol: currencySymbol,
      decimalPlaces,
      position: currencyPosition,
      decimalSeparator: config.locale?.decimalSeparator ?? invoiceData.accounting_locales?.decimal_separator,
      thousandsSeparator: config.locale?.thousandsSeparator ?? invoiceData.accounting_locales?.thousands_separator,
      digitGrouping: config.locale?.groupingStyle === 'indian' ? '3;2' : '3',
    });
  // Country/tenant date format (falls back to the neutral 'dd MMM yyyy' default
  // when no locale is threaded, so un-wired call sites are byte-identical).
  const docDate = (d: string | null | undefined): string => fmtDateWithConfig(d, config.locale);

  // ---- Title ---------------------------------------------------------------
  const isProforma = invoiceData.invoice_type === 'proforma';
  // Proforma stays data-driven; the standard title honours the Studio rename
  // (config.labels.documentTitle defaults to the built-in "TAX INVOICE").
  const documentTitle: LabelText = isProforma
    ? { en: 'PROFORMA INVOICE', ar: 'فاتورة مبدئية' }
    : config.labels?.documentTitle ?? { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' };

  // ---- Recipient (customer / company) party --------------------------------
  const customerName =
    invoiceData.customer?.customer_name || invoiceData.cases?.contact_name || 'N/A';
  const companyNameDisplay =
    invoiceData.customer_associated_company?.company_name || invoiceData.company?.company_name;
  const customerEmail =
    invoiceData.customer?.email ||
    invoiceData.cases?.contact_email ||
    invoiceData.company?.email;
  const customerPhone =
    invoiceData.customer?.mobile_number ||
    invoiceData.customer?.phone_number ||
    invoiceData.cases?.contact_phone ||
    invoiceData.company?.phone_number;

  // Only include a detail row when the value is actually present — a missing
  // detail is omitted entirely rather than printed as a "-" placeholder.
  const toRows: PartyBlock['rows'] = [];
  if (companyNameDisplay) toRows.push({ label: { en: 'Company:', ar: 'الشركة:' }, value: companyNameDisplay });
  if (customerPhone) toRows.push({ label: { en: 'Phone:', ar: 'الهاتف:' }, value: customerPhone });
  if (customerEmail) toRows.push({ label: { en: 'Email:', ar: 'البريد:' }, value: customerEmail });
  if (invoiceData.client_reference) toRows.push({ label: { en: 'Reference:', ar: 'المرجع:' }, value: invoiceData.client_reference });

  // Buyer VATIN/TRN — prefer the issuance snapshot (frozen at issue time), then
  // the live customer/company registration. The label is the snapshot label, then
  // the country tax-bar label, then a neutral default.
  const buyerTaxNumber =
    invoiceData.buyer_tax_number ??
    invoiceData.customer?.tax_number ??
    invoiceData.company?.tax_number ??
    null;
  if (buyerTaxNumber) {
    const taxLabel = invoiceData.buyer_tax_number_label ?? config.taxBar?.label?.en ?? 'Tax No';
    toRows.push({ label: { en: `${taxLabel}:`, ar: `${taxLabel}:` }, value: buyerTaxNumber });
  }

  // Buyer address — the frozen snapshot (subdivision already resolved to a NAME
  // by issue_tax_document) wins; otherwise the live customer fields. GCC prints
  // street-first (postal-first countries ride the Task 22 address_format wiring).
  const snapshotAddr = invoiceData.buyer_address as Record<string, string | null> | null;
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
          line1: invoiceData.customer?.address_line1,
          line2: invoiceData.customer?.address_line2,
          city: invoiceData.customer?.city,
          subdivision: invoiceData.customer?.subdivision_name,
          postal_code: invoiceData.customer?.postal_code,
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

  // ---- Meta (invoice details) ----------------------------------------------
  const meta: EngineDocData['meta'] = [
    { label: { en: 'Invoice No:', ar: 'رقم الفاتورة:' }, value: invoiceData.invoice_number || 'Draft' },
    { label: { en: 'Invoice Date:', ar: 'تاريخ الفاتورة:' }, value: docDate(invoiceData.invoice_date) },
  ];
  if (invoiceData.due_date) {
    meta.push({ label: { en: 'Due Date:', ar: 'تاريخ الاستحقاق:' }, value: docDate(invoiceData.due_date) });
  }
  // Supply (tax-point) date — a statutory field distinct from the invoice date.
  // Shown only when it differs, matching the paper document.
  if (invoiceData.supply_date && invoiceData.supply_date !== invoiceData.invoice_date) {
    meta.push({ label: { en: 'Supply Date:', ar: 'تاريخ التوريد:' }, value: docDate(invoiceData.supply_date) });
  }
  if (invoiceData.cases?.case_no) {
    meta.push({ label: { en: 'Job ID:', ar: 'رقم المهمة:' }, value: invoiceData.cases.case_no });
  }
  // India Rule-46 statutory meta — appended only for the in_gst_invoice profile,
  // from fields already on the doc (place-of-supply state code = GSTIN prefix).
  {
    const addr = invoiceData.buyer_address as Record<string, string | null | undefined> | null | undefined;
    const gstin = invoiceData.buyer_tax_number ?? '';
    const reverseCharge = (invoiceData as { reverse_charge?: boolean | null }).reverse_charge ?? false;
    for (const row of resolveStatutoryDocumentMeta(config.statutoryProfileKey ?? '', {
      placeOfSupplyStateName: addr?.state ?? null,
      placeOfSupplyStateCode: /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null,
      reverseCharge,
      billingAddress: addr?.address ?? null,
      deliveryAddress: addr?.delivery_address ?? null,
    })) {
      meta.push({ label: { en: row.label.en, ar: '' }, value: row.value });
    }
  }

  // ---- Line items ----------------------------------------------------------
  const columns = toResolvedColumns(resolveColumns(config));
  const rows: Array<Record<string, string | number>> = (invoiceData.invoice_line_items || []).map(
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
  // (e.g. a fully-credited invoice) is honored instead of triggering a fallback.
  const subtotal = invoiceData.subtotal ?? 0;
  const discountAmount = invoiceData.discount_amount ?? 0;
  const discountedSubtotal = subtotal - discountAmount;
  const storedTax = invoiceData.tax_amount ?? 0;
  const totalAmount = invoiceData.total_amount ?? (discountedSubtotal + storedTax);
  const amountPaid = invoiceData.amount_paid ?? 0;
  const balanceDue = invoiceData.balance_due ?? (totalAmount - amountPaid);
  // Document-level rollup rows (one per tax component). Defensively re-sorted
  // by `sequence` — fetchDocumentTaxLines already DB-orders, but AD-3 says
  // "ordered by sequence" literally, so the adapter does not trust caller order.
  const rollups = (invoiceData.tax_lines ?? [])
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
  if (on('discount') && discountAmount > 0) {
    totals.push({ ...tl('discount', 'Discount:', 'الخصم:'), value: `- ${money(discountAmount)}` });
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
    } else if (storedTax !== 0 || (invoiceData.tax_rate ?? 0) > 0) {
      // 0/0 suppression: a document with no rollups AND zero stored tax AND zero
      // rate (untaxed / out-of-scope) emits NO tax row — showing "VAT 0" on an
      // untaxed document is noise, and there is no component to name.
      // Legacy / backfilled document with no tax_lines: ONE row from the STORED
      // header tax_amount (NEVER a recompute). The English label honours the
      // country tax label; the Arabic secondary keeps the standard VAT term so it
      // still resolves into every bilingual language via the translation table.
      const label = config.labels?.taxLabel?.en ?? 'VAT';
      const rate = invoiceData.tax_rate != null ? ` ${invoiceData.tax_rate}%` : '';
      totals.push({ ...tl('tax', `${label}${rate}:`, `ضريبة القيمة المضافة${rate}:`), value: money(storedTax) });
    }
  }
  if (on('total')) {
    totals.push({ ...tl('total', 'Total:', 'الإجمالي:'), value: money(totalAmount), emphasis: true });
  }
  // Amount Paid / Balance Due — only on non-proforma invoices with a recorded
  // payment, matching InvoiceDocument.ts (lines ~296-314).
  if (!isProforma && amountPaid > 0) {
    if (on('amountPaid')) {
      totals.push({ ...tl('amountPaid', 'Amount Paid:', 'المبلغ المدفوع:'), value: money(amountPaid) });
    }
    if (on('balanceDue')) {
      totals.push({ ...tl('balanceDue', 'Balance Due:', 'الرصيد المستحق:'), value: money(balanceDue) });
    }
  }
  // Amount in words (opt-in; off by default). Language-aware: Arabic-lead modes
  // spell in Arabic, bilingual shows both.
  if (lines.amountInWords === true) {
    const mode = config.language.mode;
    const enWords = amountInWordsEn(totalAmount, currencySymbol, decimalPlaces, config.locale?.amountWordsScale ?? 'western');
    const arWords = amountInWordsAr(totalAmount, currencySymbol, decimalPlaces);
    const value = mode === 'ar' ? arWords : mode.startsWith('bilingual') ? `${enWords}  ·  ${arWords}` : enWords;
    totals.push({ ...tl('amountInWords', 'Amount in Words:', 'المبلغ بالحروف:'), value });
  }

  // ---- Tax Summary (opt-in VAT/GST breakdown) ------------------------------
  // One row per FROZEN component rollup (STORED base + tax); falls back to a
  // single row from the header tax_rate + stored tax when the document carries no
  // tax_lines. Emitted only when the tenant turns it on — a no-op otherwise.
  const tsCfg = config.taxSummary;
  const taxRateDisplay = invoiceData.tax_rate ?? 0;
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
                      ? `${amountInWordsEn(storedTax, currencySymbol, decimalPlaces, config.locale?.amountWordsScale ?? 'western')}  ·  ${amountInWordsAr(storedTax, currencySymbol, decimalPlaces)}`
                      : amountInWordsEn(storedTax, currencySymbol, decimalPlaces, config.locale?.amountWordsScale ?? 'western'),
              }
            : {}),
        }
      : undefined;

  // ---- Terms / notes (structured: Payment Terms + Notes stacks) ------------
  // Mirrors InvoiceDocument.ts's separate Payment Terms / Notes headings rather
  // than collapsing them into one flat string. The bank box (below) renders in
  // the right column of the same row via the terms section.
  const termsBlocks: NonNullable<NonNullable<EngineDocData['terms']>['blocks']> = [];
  if (invoiceData.payment_terms) {
    // Invoice Payment Terms come from the rich-text editor, so the body is HTML —
    // flag it so the renderer runs it through htmlToPdfmake instead of printing tags.
    termsBlocks.push({ title: { en: 'Invoice Terms', ar: 'شروط الفاتورة' }, body: invoiceData.payment_terms, format: 'html' });
  }
  if (invoiceData.notes) {
    termsBlocks.push({ title: { en: 'Notes', ar: 'ملاحظات' }, body: invoiceData.notes });
  }
  // Statutory notations (zero-rating / reverse-charge notices) — frozen at
  // issuance and rendered VERBATIM as their own notice stack. Bilingual modes
  // print the frozen translation beneath the English text.
  const notations = invoiceData.notations ?? [];
  if (notations.length > 0) {
    const isBilingual = config.language.mode !== 'en';
    const body = notations
      .map((n) => (isBilingual && n.textTranslated ? `${n.text}\n${n.textTranslated}` : n.text))
      .join('\n');
    termsBlocks.push({ title: { en: 'Notices', ar: 'إشعارات' }, body });
  }
  const terms: EngineDocData['terms'] =
    termsBlocks.length > 0
      ? { title: { en: 'Invoice Terms', ar: 'شروط الفاتورة' }, blocks: termsBlocks }
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

  // ---- E-invoice artifact (regime-routed, P3) ------------------------------
  // Routed by the country pack's master_einvoice_regimes row resolved into
  // facts.einvoiceRegimeKey — never by country-string matching (D11 → data). A
  // non-zatca_ph1 country (incl. an unresolved/no-country render) emits nothing.
  // The tax bar still gates whether seller VAT identification is present at all.
  // Rendered natively by the QR surfaces (pdfmake `qr`), so no QR dependency.
  // Seller registration number for the printed band + QR: the STAMPED
  // `seller_tax_number` (legal_entities-sourced snapshot) wins over the live
  // `company_settings` value, so the printed band matches the Task 14 preview.
  const sellerVatNumber = invoiceData.seller_tax_number ?? companySettings.basic_info?.vat_number ?? null;
  const identity = sellerVatNumber
    ? { ...companySettings, basic_info: { ...companySettings.basic_info, vat_number: sellerVatNumber } }
    : companySettings;
  let zatcaPayload: string | null = null;
  if (config.taxBar?.enabled && facts?.einvoiceRegimeKey === 'zatca_ph1') {
    const sellerName =
      companySettings.basic_info?.legal_name || companySettings.basic_info?.company_name || '';
    // Feed the SAME stamped number to the QR so the QR and the band agree; a
    // manual tax-bar override still wins for the band's displayed value.
    const vatNumber =
      (config.taxBar.source === 'manual' ? config.taxBar.value : sellerVatNumber) || '';
    if (sellerName && vatNumber) {
      const transport = resolveEInvoicingTransport('zatca_ph1');
      const artifact = transport.buildArtifact({
        documentType: 'invoice',
        documentId: invoiceData.id ?? '',
        documentNumber: invoiceData.invoice_number ?? null,
        sellerName,
        sellerTaxNumber: vatNumber,
        issuedAt: invoiceData.invoice_date
          ? new Date(invoiceData.invoice_date).toISOString()
          : new Date().toISOString(),
        currency: '',            // TLV Phase-1 carries no currency field; totals are document-currency strings
        totalAmount,
        taxAmount: storedTax,
        meta: {},
      });
      zatcaPayload = typeof artifact.payload === 'string' ? artifact.payload : null;
    }
  }

  // ---- Generic verification QR (fallback when no ZATCA payload) ------------
  // So the QR section/footer always renders a real, scannable code — not an
  // empty box — even for non-GCC invoices. The ZATCA TLV takes precedence when
  // the tax bar is enabled (handled by the QR surfaces' precedence).
  const qrPayload = zatcaPayload
    ? null
    : `INVOICE:${invoiceData.invoice_number || 'Draft'} TOTAL:${money(totalAmount)} DATE:${docDate(invoiceData.invoice_date)}`;

  return {
    documentTitle,
    identity,
    parties: { to },
    meta,
    lineItems: { columns, rows },
    totals,
    taxSummary,
    paymentHistory,
    terms,
    bank,
    // Default signature lines so the (opt-in) Signature block renders real
    // lines when a tenant switches it on for an invoice.
    signatures: [
      { en: 'Authorized Signature', ar: 'التوقيع المعتمد' },
      { en: 'Customer Signature', ar: 'توقيع العميل' },
    ],
    qrCaption: zatcaPayload ? 'ZATCA e-invoice QR' : 'Scan to verify this invoice',
    zatcaPayload,
    qrPayload,
  };
}
