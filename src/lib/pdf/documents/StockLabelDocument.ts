import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { PDF_COLORS, getStylesWithFont } from '../styles';
import type { StockItemWithCategory } from '../../stockService';

export interface StockLabelData {
  item: StockItemWithCategory;
  quantity?: number;
  locationName?: string;
  companyName?: string;
  showPrice?: boolean;
  showBarcode?: boolean;
  copies?: number;
}

function buildSingleLabel(data: StockLabelData, _fontFamily: string): Content[] {
  const { item, locationName, companyName, showPrice } = data;

  const labelContent: Content[] = [
    {
      columns: [
        {
          text: companyName ?? 'Stock Label',
          fontSize: 7,
          color: PDF_COLORS.textMuted,
          width: '*',
        },
        item.stock_categories?.name
          ? {
              text: item.stock_categories.name,
              fontSize: 7,
              color: PDF_COLORS.primary,
              alignment: 'right',
              width: 'auto',
            }
          : { text: '' },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      text: item.name,
      fontSize: 11,
      bold: true,
      color: PDF_COLORS.text,
      margin: [0, 0, 0, 2],
    },
  ];

  if (item.brand) {
    labelContent.push({
      text: item.brand,
      fontSize: 9,
      color: PDF_COLORS.textLight,
      margin: [0, 0, 0, 4],
    });
  }

  labelContent.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 0,
        lineWidth: 0.5,
        lineColor: PDF_COLORS.border,
      },
    ],
    margin: [0, 2, 0, 4],
  });

  const details: Content[] = [];

  if (item.sku) {
    details.push({
      columns: [
        { text: 'SKU', fontSize: 7, color: PDF_COLORS.textMuted, width: 40 },
        { text: item.sku, fontSize: 8, bold: true, color: PDF_COLORS.text, font: 'Roboto', width: '*' },
      ],
      margin: [0, 0, 0, 2],
    });
  }

  if (item.barcode) {
    details.push({
      columns: [
        { text: 'Barcode', fontSize: 7, color: PDF_COLORS.textMuted, width: 40 },
        { text: item.barcode, fontSize: 8, bold: true, color: PDF_COLORS.text, font: 'Roboto', width: '*' },
      ],
      margin: [0, 0, 0, 2],
    });
  }

  if (showPrice && item.selling_price != null) {
    details.push({
      columns: [
        { text: 'Price', fontSize: 7, color: PDF_COLORS.textMuted, width: 40 },
        {
          text: item.selling_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          fontSize: 10,
          bold: true,
          color: PDF_COLORS.primary,
          width: '*',
        },
      ],
      margin: [0, 0, 0, 2],
    });
  }

  if (locationName) {
    details.push({
      columns: [
        { text: 'Location', fontSize: 7, color: PDF_COLORS.textMuted, width: 40 },
        { text: locationName, fontSize: 8, color: PDF_COLORS.text, width: '*' },
      ],
      margin: [0, 0, 0, 2],
    });
  }

  if (details.length > 0) {
    labelContent.push(...details);
  }

  return labelContent;
}

export function buildStockLabelDocument(
  data: StockLabelData,
  fontFamily = 'Roboto'
): TDocumentDefinitions {
  const copies = Math.max(1, data.copies ?? 1);
  const allContent: Content[] = [];

  for (let i = 0; i < copies; i++) {
    if (i > 0) {
      allContent.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 230,
            y2: 0,
            lineWidth: 1,
            lineColor: PDF_COLORS.border,
            dash: { length: 4, space: 3 },
          },
        ],
        margin: [0, 6, 0, 6],
      });
    }
    const singleLabel = buildSingleLabel(data, fontFamily);
    allContent.push(...singleLabel);
  }

  return {
    pageSize: { width: 283, height: 170 },
    pageMargins: [12, 12, 12, 12],
    defaultStyle: {
      font: fontFamily,
      fontSize: 9,
    },
    styles: getStylesWithFont(fontFamily),
    content: allContent,
  };
}
