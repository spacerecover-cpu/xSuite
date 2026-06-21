import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/stockLabelAdapter';
import { renderTemplate } from './renderTemplate';
import { buildStockLabelDocument, type StockLabelData } from '../documents/StockLabelDocument';
import type { TranslationContext } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';
import type { StockItemWithCategory } from '../../stockService';

// ---------------------------------------------------------------------------
// Stock-label ENGINE ↔ LEGACY parity.
//
// Renders a representative STOCK LABEL BOTH ways — the legacy hand-written
// `buildStockLabelDocument(...)` and the config-driven engine (toEngineData →
// renderTemplate) — and asserts CONTENT equivalence (not byte-identical
// layout): the item name, the SKU, the category, the brand, the barcode and the
// formatted price. Both use the same small custom label sheet (283×170 pt).
//
// CAVEAT — copies: the LEGACY builder repeats the single-label body `copies`
// times on ONE sheet (with a dashed divider between copies). The engine renders
// ONE label body per document — copies are a print-loop concern, owned by the
// call site (PrintLabelsModal loops). So this parity test renders a SINGLE copy
// on both sides; the multi-copy sheet is not a document-body equivalence.
//
// The legacy builder is the reference and MUST stay untouched. All inputs are
// synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/**
 * A representative stock item: a Samsung 870 EVO SSD, SKU STK-0042, barcode
 * 8801643000000, selling price 1234.5 (→ "1,234.50"), category "Internal SSD".
 * Only the fields the label reads are meaningful; the rest satisfy the row type.
 */
function makeStockItem(): StockItemWithCategory {
  return {
    barcode: '8801643000000',
    brand: 'Samsung',
    capacity: '500',
    category_id: 'cat-ssd',
    cost_price: 800,
    created_at: '2026-06-01T00:00:00Z',
    created_by: null,
    current_quantity: 5,
    deleted_at: null,
    description: null,
    dimensions: null,
    id: 'stock-parity-1',
    image_url: null,
    is_active: true,
    is_featured: false,
    is_saleable: true,
    item_type: 'part',
    location: null,
    location_id: null,
    minimum_quantity: 1,
    model: '870 EVO',
    name: 'Samsung 870 EVO 500GB',
    notes: null,
    photos: null,
    quantity_available: 5,
    quantity_on_hand: 5,
    quantity_reserved: 0,
    reorder_level: 2,
    reorder_quantity: 5,
    selling_price: 1234.5,
    sku: 'STK-0042',
    specifications: null,
    supplier_id: null,
    tax_inclusive: false,
    tax_rate: 5,
    tenant_id: 'tenant-1',
    unit: 'pc',
    unit_of_measure: 'pc',
    updated_at: '2026-06-01T00:00:00Z',
    updated_by: null,
    warranty_months: 12,
    weight: null,
    stock_categories: {
      id: 'cat-ssd',
      name: 'Internal SSD',
      created_at: '2026-06-01T00:00:00Z',
      deleted_at: null,
      description: null,
      tenant_id: 'tenant-1',
      updated_at: '2026-06-01T00:00:00Z',
    } as StockItemWithCategory['stock_categories'],
  };
}

function makeLabelData(overrides?: Partial<StockLabelData>): StockLabelData {
  return {
    item: makeStockItem(),
    locationName: 'Shelf A-3',
    companyName: 'Acme Data Recovery',
    showPrice: true,
    showBarcode: true,
    copies: 1,
    ...overrides,
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1, undefined), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

function renderEngine(data: StockLabelData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.stock_label;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, null, null);
}

describe('stock label parity — engine output matches the legacy builder', () => {
  it('renders the item name in both', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('Samsung 870 EVO 500GB');
    expect(engine).toContain('Samsung 870 EVO 500GB');
  });

  it('renders the SKU in both', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('STK-0042');
    expect(engine).toContain('STK-0042');
  });

  it('renders the category in both', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('Internal SSD');
    expect(engine).toContain('Internal SSD');
  });

  it('renders the brand in both', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('Samsung');
    expect(engine).toContain('Samsung');
  });

  it('renders the barcode in both when showBarcode is on', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('8801643000000');
    expect(engine).toContain('8801643000000');
  });

  it('renders the formatted price in both when showPrice is on', () => {
    const data = makeLabelData();
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    // 1234.5 → "1,234.50" via toLocaleString (matches the legacy builder).
    expect(legacy).toContain('1,234.50');
    expect(engine).toContain('1,234.50');
  });

  it('still renders the SKU + barcode when showBarcode is off (engine matches the legacy quirk)', () => {
    // The legacy buildSingleLabel never reads `showBarcode` — SKU + barcode always
    // render when present. The engine adapter mirrors this exactly, so BOTH paths
    // keep the SKU/barcode rows regardless of the flag.
    const data = makeLabelData({ showBarcode: false });
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('STK-0042');
    expect(legacy).toContain('8801643000000');
    expect(engine).toContain('STK-0042');
    expect(engine).toContain('8801643000000');
  });

  it('omits the price when showPrice is off (engine matches legacy)', () => {
    const data = makeLabelData({ showPrice: false });
    const legacy = allTexts(buildStockLabelDocument(data)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).not.toContain('1,234.50');
    expect(engine).not.toContain('1,234.50');
  });

  it('uses the custom 283×170 label sheet in the engine', () => {
    const def = renderEngine(makeLabelData());
    expect(def.pageSize).toEqual({ width: 283, height: 170 });
  });
});
