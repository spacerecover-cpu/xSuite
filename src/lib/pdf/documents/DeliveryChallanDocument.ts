import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { DeliveryChallanDocumentData, DeliveryChallanData, TranslationContext } from '../types';
import { PDF_COLORS, getStylesWithFont } from '../styles';
import { formatDate, buildCompanyAddress, safeString } from '../utils';
import { buildLogoNode } from '../brandingImage';
import { CHALLAN_COPY_LABELS } from '../../regimes/in_gst/deliveryChallan';

// Self-contained Indian grouping (3;2) — the challan is an India-only document,
// so en-IN is always correct here and this builder does not wait on WP-L1's
// general formatting work.
const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatInr(amount: number): string {
  return `₹${INR.format(amount)}`;
}

/**
 * Rule 55 (CGST Rules, 2017) Delivery Challan, prepared in triplicate:
 * ORIGINAL FOR CONSIGNEE / DUPLICATE FOR TRANSPORTER / TRIPLICATE FOR CONSIGNER.
 * Documents a non-supply movement (customer-owned devices returned after data
 * recovery). Never shows tax columns — no GST is charged on this movement.
 */
export function buildDeliveryChallanDocument(
  data: DeliveryChallanDocumentData,
  ctx: TranslationContext,
  logoBase64?: string | null,
): TDocumentDefinitions {
  const { challanData, companySettings } = data;
  const { fontFamily } = ctx;

  const legalName =
    companySettings.basic_info?.legal_name || companySettings.basic_info?.company_name || 'Company Name';
  const companyAddress = buildCompanyAddress(companySettings.location);
  const consignerGstin =
    companySettings.basic_info?.vat_number || companySettings.basic_info?.tax_id || null;

  const copies: Content[] = CHALLAN_COPY_LABELS.map((copyLabel, index) => {
    const copy = buildChallanCopy(challanData, copyLabel, legalName, companyAddress, consignerGstin, logoBase64);
    if (index < CHALLAN_COPY_LABELS.length - 1) {
      (copy as { pageBreak?: string }).pageBreak = 'after';
    }
    return copy;
  });

  return {
    pageSize: 'A4',
    pageMargins: [35, 30, 35, 40],
    defaultStyle: { font: fontFamily },
    styles: getStylesWithFont(fontFamily),
    content: copies,
  };
}

function buildChallanCopy(
  challan: DeliveryChallanData,
  copyLabel: string,
  legalName: string,
  companyAddress: string,
  consignerGstin: string | null,
  logoBase64?: string | null,
): Content {
  const logoNode = buildLogoNode(logoBase64, { width: 110, margin: [0, 0, 0, 4] });

  const header: Content = {
    columns: [
      {
        stack: [
          ...(logoNode ? [logoNode as Content] : []),
          { text: legalName, fontSize: 13, bold: true, color: PDF_COLORS.text },
          { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, lineHeight: 1.1 },
          ...(consignerGstin
            ? [{ text: `GSTIN: ${consignerGstin}`, fontSize: 8, bold: true, color: PDF_COLORS.text, margin: [0, 2, 0, 0] as [number, number, number, number] }]
            : []),
        ],
        width: '*',
      },
      {
        stack: [
          {
            table: { widths: ['auto'], body: [[{ text: copyLabel, fontSize: 8, bold: true, color: PDF_COLORS.text, margin: [8, 3, 8, 3] }]] },
            layout: {
              hLineWidth: () => 0.75,
              vLineWidth: () => 0.75,
              hLineColor: () => PDF_COLORS.border,
              vLineColor: () => PDF_COLORS.border,
            },
            alignment: 'right',
          },
          { text: 'DELIVERY CHALLAN', fontSize: 15, bold: true, color: PDF_COLORS.primaryDark, alignment: 'right', margin: [0, 6, 0, 0] },
          { text: 'Rule 55 — CGST Rules, 2017', fontSize: 8, color: PDF_COLORS.textLight, alignment: 'right' },
        ],
        width: 'auto',
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const metaRow = (label: string, value: string | null | undefined): Content => ({
    columns: [
      { text: label, fontSize: 8, color: PDF_COLORS.textLight, width: 80 },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  });

  const partiesSection: Content = {
    columns: [
      {
        width: '50%',
        stack: [
          { text: 'Consignee (Customer)', fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
          metaRow('Name:', challan.consignee.name),
          metaRow('Address:', challan.consignee.address),
          metaRow('GSTIN:', challan.consignee.gstin ?? 'Unregistered'),
          metaRow('Phone:', challan.consignee.phone),
        ],
      },
      { width: 10, text: '' },
      {
        width: '50%',
        stack: [
          { text: 'Challan Details', fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
          metaRow('Challan No:', challan.challanNo),
          metaRow('Date:', formatDate(challan.challanDate, 'dd MMM yyyy, HH:mm')),
          metaRow('Case No:', challan.caseNo),
          metaRow('Collected By:', challan.transport.collectorName),
          metaRow('Mobile:', challan.transport.collectorMobile),
          ...(challan.transport.relationship && challan.transport.relationship !== 'self'
            ? [metaRow('Relationship:', challan.transport.relationship.replace(/_/g, ' '))]
            : []),
        ],
      },
    ],
    margin: [0, 0, 0, 10],
  };

  const th = (text: string, alignment: 'left' | 'right' = 'left'): TableCell => ({
    text, fontSize: 8, bold: true, fillColor: PDF_COLORS.headerBg, color: PDF_COLORS.text, alignment, margin: [2, 3, 2, 3],
  });
  const td = (text: string, alignment: 'left' | 'right' = 'left'): TableCell => ({
    text, fontSize: 8, color: PDF_COLORS.text, alignment, margin: [2, 3, 2, 3],
  });

  const tableBody: TableCell[][] = [
    [th('#'), th('Description of Goods'), th('HSN'), th('Qty (UQC)'), th('Serial No.'), th('Declared Value', 'right')],
    ...challan.lines.map((line, i) => [
      td(String(i + 1)),
      td(line.description),
      td(line.hsnCode),
      td(`${line.quantity} ${line.unitCode}`),
      td(safeString(line.serialNumber)),
      td(formatInr(line.declaredValue), 'right'),
    ]),
    [
      { text: 'Total Declared Value', colSpan: 5, fontSize: 8, bold: true, color: PDF_COLORS.text, alignment: 'right', margin: [2, 3, 2, 3] },
      {}, {}, {}, {},
      { text: formatInr(challan.totalDeclaredValue), fontSize: 8, bold: true, color: PDF_COLORS.text, alignment: 'right', margin: [2, 3, 2, 3] },
    ],
  ];

  const goodsTable: Content = {
    table: { headerRows: 1, widths: [14, '*', 42, 48, 95, 75], body: tableBody },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 8],
  };

  const notationSection: Content = {
    stack: [
      { text: challan.notation, fontSize: 7.5, color: PDF_COLORS.textLight, lineHeight: 1.2 },
      ...(challan.ewayNote
        ? [{ text: challan.ewayNote, fontSize: 7.5, bold: true, color: PDF_COLORS.text, lineHeight: 1.2, margin: [0, 4, 0, 0] as [number, number, number, number] }]
        : []),
    ],
    margin: [0, 0, 0, 14],
  };

  // A column child: `width` is valid inside `columns` at runtime; the ContentStack
  // type doesn't model it, so assert to Content.
  const signatureBox = (title: string): Content => ({
    width: '50%',
    stack: [
      { text: title, fontSize: 9, bold: true, color: PDF_COLORS.text, alignment: 'center', margin: [0, 0, 0, 4] },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 230, h: 42, lineWidth: 0.5, lineColor: PDF_COLORS.border }], margin: [0, 0, 0, 2] },
      { text: 'Signature & Date', fontSize: 7.5, color: PDF_COLORS.textLight, alignment: 'center' },
    ],
  } as Content);

  const signatures: Content = {
    columns: [signatureBox('Received by (Consignee/Collector)'), { width: 20, text: '' }, signatureBox(`For ${legalName} — Authorised Signatory`)],
    margin: [0, 4, 0, 0],
  };

  return { stack: [header, partiesSection, goodsTable, notationSection, signatures] };
}
