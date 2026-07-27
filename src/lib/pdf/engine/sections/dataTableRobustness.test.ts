import { describe, it, expect } from 'vitest';
import type { Content, TableCell } from 'pdfmake/interfaces';
import {
  renderLineItems,
  PREVIEW_MAX_TABLE_ROWS,
  normalizeColumnWidths,
  softWrapLongTokens,
  ZERO_WIDTH_SPACE,
} from './lineItemTable';
import { renderDevices } from './devices';
import { renderCustodyLog } from './custodyLog';
import { renderTemplate } from '../renderTemplate';
import { buildPreviewEngineData } from '../sampleData';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { EngineContext, EngineDocData, ResolvedColumn } from '../types';
import type { TranslationContext } from '../../types';

// Regression locks for QA pass-2 findings TBL-05 … TBL-09 and TBL-11 on the
// three highest-volume data tables (line items, devices, custody log).
//
// The FIRST describe block in each area is a PARITY lock: an unconfigured,
// English, A4-portrait table must come out of the renderer exactly as it did
// before these fixes. Everything else is opt-in or direction-conditional.

const CTX: TranslationContext = {
  t: (_k: string, en: string) => en,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

type Mode = 'en' | 'ar';

/**
 * `engineExtras` carries ENGINE-level (not config-level) fields — today only
 * `maxTableRows`, which ONLY the preview paths set. Omitting it is exactly how
 * `pdfService` / `reportPDFService` / `send-document-email` call the engine.
 */
const engineFor = (
  mode: Mode = 'en',
  overrides: Record<string, unknown> = {},
  engineExtras: Partial<EngineContext> = {},
): EngineContext =>
  ({
    config: {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      language: mode === 'ar' ? { mode: 'ar', secondary: 'ar' } : { mode: 'en' },
      ...overrides,
    },
    ctx: CTX,
    ...engineExtras,
  }) as unknown as EngineContext;

const custodyEngine = (mode: Mode = 'en', engineExtras: Partial<EngineContext> = {}): EngineContext =>
  ({
    config: {
      ...BUILT_IN_TEMPLATE_CONFIGS.chain_of_custody,
      language: mode === 'ar' ? { mode: 'ar', secondary: 'ar' } : { mode: 'en' },
    },
    ctx: CTX,
    ...engineExtras,
  }) as unknown as EngineContext;

/** What the two preview entry points put on the context; generation sets nothing. */
const PREVIEW_CAP: Partial<EngineContext> = { maxTableRows: PREVIEW_MAX_TABLE_ROWS };

const LI_COLUMNS: ResolvedColumn[] = [
  { key: 'description', visible: true, label: { en: 'Description', ar: 'الوصف' }, width: 220 },
  { key: 'quantity', visible: true, label: { en: 'Qty', ar: 'الكمية' }, width: 40, align: 'center' },
  { key: 'unitPrice', visible: true, label: { en: 'Unit Price', ar: 'سعر الوحدة' }, align: 'right' },
  { key: 'lineTotal', visible: true, label: { en: 'Total', ar: 'المجموع' }, align: 'right' },
];

const liData = (rows: Array<Record<string, string | number>>): EngineDocData =>
  ({ lineItems: { columns: LI_COLUMNS, rows } }) as unknown as EngineDocData;

const DEVICE_COLUMNS: ResolvedColumn[] = [
  { key: 'type', visible: true, label: { en: 'Device Type' }, width: 100, align: 'left' },
  { key: 'serial', visible: true, label: { en: 'Serial Number' }, width: 125, align: 'left' },
];

const deviceData = (rows: Array<Record<string, string>>): EngineDocData =>
  ({ devices: { title: { en: 'Devices' }, columns: DEVICE_COLUMNS, rows } }) as unknown as EngineDocData;

const CUSTODY_COLUMNS: ResolvedColumn[] = [
  { key: 'entry', visible: true, label: { en: 'Entry #' }, width: 38 },
  { key: 'description', visible: true, label: { en: 'Description' } },
  { key: 'hash', visible: true, label: { en: 'Hash' }, width: 90 },
];

const custodyData = (rows: Array<Record<string, string>>): EngineDocData =>
  ({
    custodyLog: { title: { en: 'Chain of Custody Entries' }, columns: CUSTODY_COLUMNS, rows },
  }) as unknown as EngineDocData;

/** The pdfmake table node inside a section result, whatever wrapper it uses. */
const tableOf = (node: Content | null): { widths: unknown[]; body: TableCell[][] } => {
  const n = node as unknown as Record<string, unknown>;
  if (n.table) return n.table as { widths: unknown[]; body: TableCell[][] };
  const stack = n.stack as Record<string, unknown>[];
  const withTable = stack.find((s) => s.table) as { table: { widths: unknown[]; body: TableCell[][] } };
  return withTable.table;
};

const texts = (row: TableCell[]): unknown[] => row.map((c) => (c as { text?: unknown }).text);

const rowsOf = (n: number, fill: (i: number) => Record<string, string>) =>
  Array.from({ length: n }, (_, i) => fill(i));

// ---------------------------------------------------------------------------
// PARITY — the default path must be untouched by every fix in this batch.
// ---------------------------------------------------------------------------

describe('default-path parity (English, A4 portrait, unconfigured)', () => {
  it('renders the line-item table exactly as before', () => {
    const node = renderLineItems(
      engineFor(),
      liData([
        { description: 'Data recovery service', quantity: 1, unitPrice: '250.000', lineTotal: '250.000' },
        { description: 'Donor drive', quantity: 2, unitPrice: '30.000', lineTotal: '60.000' },
      ]),
    );
    const table = tableOf(node);
    // Widths are passed through untouched: no normalization on a config that fits.
    expect(table.widths).toEqual([220, 40, '*', '*']);
    // Header + exactly one row per line item — no continuation row, no empty state.
    expect(table.body).toHaveLength(3);
    // Cells are stringified by the renderer, exactly as before.
    expect(texts(table.body[1])).toEqual(['Data recovery service', '1', '250.000', '250.000']);
    expect(texts(table.body[2])).toEqual(['Donor drive', '2', '30.000', '60.000']);
    // No soft-wrap characters anywhere in the emitted definition.
    expect(JSON.stringify(node)).not.toContain(ZERO_WIDTH_SPACE);
    // Header alignment still comes from the column (TBL-11 helper reuse).
    expect((table.body[0][1] as { alignment?: string }).alignment).toBe('center');
    expect((table.body[1][1] as { style?: string }).style).toBe('tableCellCenter');
  });

  it('renders the devices table exactly as before', () => {
    const node = renderDevices(
      engineFor(),
      deviceData([{ type: 'HDD', serial: 'WD-WMC4N0D8XXXX' }]),
    );
    const table = tableOf(node);
    expect(table.widths).toEqual([100, 125]);
    expect(table.body).toHaveLength(2);
    expect(texts(table.body[1])).toEqual(['HDD', 'WD-WMC4N0D8XXXX']);
    expect(JSON.stringify(node)).not.toContain(ZERO_WIDTH_SPACE);
  });

  it('renders the custody log exactly as before', () => {
    const node = renderCustodyLog(
      custodyEngine(),
      custodyData([{ entry: '1', description: 'Device received at front desk', hash: 'abc123' }]),
    );
    const table = tableOf(node);
    expect(table.widths).toEqual([38, '*', 90]);
    expect(table.body).toHaveLength(2);
    expect(texts(table.body[1])).toEqual(['1', 'Device received at front desk', 'abc123']);
    expect(JSON.stringify(node)).not.toContain(ZERO_WIDTH_SPACE);
  });
});

// ---------------------------------------------------------------------------
// TBL-05 — S/N column side under RTL
// ---------------------------------------------------------------------------

describe('TBL-05 — row-number column side follows reading direction', () => {
  const withNumbering = (mode: Mode) =>
    engineFor(mode, {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      language: mode === 'ar' ? { mode: 'ar', secondary: 'ar' } : { mode: 'en' },
      table: { ...(BUILT_IN_TEMPLATE_CONFIGS.invoice.table ?? {}), rowNumbering: true },
    });

  it('keeps the S/N column FIRST (visual left) for LTR — parity with today', () => {
    const table = tableOf(
      renderLineItems(withNumbering('en'), liData([{ description: 'A', quantity: 1 }])),
    );
    expect(table.widths[0]).toBe(24);
    expect((table.body[0][0] as { text?: string }).text).toBe('#');
    expect((table.body[1][0] as { text?: string }).text).toBe('1');
  });

  it('puts the S/N column LAST in the array (visual right) under RTL', () => {
    const table = tableOf(
      renderLineItems(withNumbering('ar'), liData([{ description: 'A', quantity: 1 }])),
    );
    const last = table.widths.length - 1;
    expect(table.widths[last]).toBe(24);
    expect((table.body[0][last] as { text?: string }).text).toBe('#');
    expect((table.body[1][last] as { text?: string }).text).toBe('1');
    // …and the widths array is still cell-aligned: one width per header cell.
    expect(table.widths).toHaveLength(table.body[0].length);
    expect(table.body.every((r) => r.length === table.widths.length)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TBL-06 — empty line-item collection
// ---------------------------------------------------------------------------

describe('TBL-06 — empty line-item collection renders an explicit empty state', () => {
  it('renders one full-width "No items" row instead of a header-only table', () => {
    const node = renderLineItems(engineFor(), liData([]));
    const table = tableOf(node);
    expect(table.body).toHaveLength(2);
    const cell = table.body[1][0] as { text?: string; colSpan?: number };
    expect(cell.text).toBe('No items');
    expect(cell.colSpan).toBe(4);
    // pdfmake needs the spanned slots present as empty cells.
    expect(table.body[1]).toHaveLength(4);
  });

  it('spans the S/N column too when row numbering is on', () => {
    const engine = engineFor('en', {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      language: { mode: 'en' },
      table: { ...(BUILT_IN_TEMPLATE_CONFIGS.invoice.table ?? {}), rowNumbering: true },
    });
    const table = tableOf(renderLineItems(engine, liData([])));
    expect((table.body[1][0] as { colSpan?: number }).colSpan).toBe(5);
    expect(table.body[1]).toHaveLength(5);
  });

  it('still returns null when there are no visible columns', () => {
    const data = { lineItems: { columns: [], rows: [] } } as unknown as EngineDocData;
    expect(renderLineItems(engineFor(), data)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TBL-07 — column-width normalization
// ---------------------------------------------------------------------------

describe('TBL-07 — fixed column widths are normalized to the printable width', () => {
  it('is the identity when the fixed widths fit (parity)', () => {
    const widths = [220, 40, '*', '*'];
    expect(normalizeColumnWidths(widths, 515, 8)).toEqual(widths);
  });

  it('is the identity when no column has an explicit width', () => {
    const widths = ['*', '*', '*'];
    expect(normalizeColumnWidths(widths, 515, 8)).toEqual(widths);
  });

  it('scales oversized fixed widths down proportionally', () => {
    const out = normalizeColumnWidths([400, 200, 200], 515, 8) as number[];
    const sum = out.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(515);
    // Proportions are preserved (400 : 200 : 200 → 2 : 1 : 1).
    expect(out[0]).toBeGreaterThan(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(Math.abs(out[0] / out[1] - 2)).toBeLessThan(0.05);
  });

  it('leaves room for the star columns to absorb the remainder', () => {
    const out = normalizeColumnWidths([300, 300, '*'], 515, 8) as (number | string)[];
    const fixed = out.reduce<number>((a, w) => a + (typeof w === 'number' ? w : 0), 0);
    // 515 minus per-column padding/borders minus a floor for the star column.
    expect(fixed).toBeLessThan(515 - 40);
    expect(out[2]).toBe('*');
  });

  it('normalizes through the renderer on a narrow page', () => {
    const wide: ResolvedColumn[] = [
      { key: 'description', visible: true, label: { en: 'Description' }, width: 400 },
      { key: 'lineTotal', visible: true, label: { en: 'Total' }, width: 200 },
    ];
    const narrow = engineFor('en', {
      ...BUILT_IN_TEMPLATE_CONFIGS.invoice,
      language: { mode: 'en' },
      paper: { size: 'custom', orientation: 'portrait', dimensions: [283, 170], margins: [12, 12, 12, 12] },
    });
    const table = tableOf(
      renderLineItems(narrow, {
        lineItems: { columns: wide, rows: [{ description: 'x', lineTotal: '1' }] },
      } as unknown as EngineDocData),
    );
    const sum = (table.widths as number[]).reduce((a, b) => a + b, 0);
    // 283 − 24 = 259pt of content; the raw 600pt of columns must be scaled in.
    expect(sum).toBeLessThanOrEqual(259);
  });
});

// ---------------------------------------------------------------------------
// TBL-08 — row cap + continuation row
// ---------------------------------------------------------------------------

describe('TBL-08 — the row cap is PREVIEW-ONLY: generation is never truncated', () => {
  const OVER = PREVIEW_MAX_TABLE_ROWS + 12;

  // ── The generation path: pdfService / reportPDFService / send-document-email
  // all call renderTemplate WITHOUT a cap, so no delivered document may lose a
  // row. This is the domain contract, not a preference: a truncated invoice
  // prints fewer lines than its totals sum, and a truncated custody ledger is an
  // incomplete forensic record (CLAUDE.md — chain_of_custody is evidence).

  it('renders EVERY line-item row when no cap is set', () => {
    const table = tableOf(
      renderLineItems(engineFor(), liData(rowsOf(OVER, (i) => ({ description: `row ${i}` })))),
    );
    expect(table.body).toHaveLength(OVER + 1); // header + every row
    // The last body row is a real line item, not a continuation notice.
    expect(texts(table.body[OVER])).toEqual([`row ${OVER - 1}`, '', '', '']);
    expect((table.body[OVER][0] as { colSpan?: number }).colSpan).toBeUndefined();
  });

  it('renders EVERY device row when no cap is set', () => {
    const table = tableOf(
      renderDevices(engineFor(), deviceData(rowsOf(OVER, () => ({ type: 'HDD', serial: 'S' })))),
    );
    expect(table.body).toHaveLength(OVER + 1);
  });

  it('renders EVERY custody ledger entry when no cap is set', () => {
    const table = tableOf(
      renderCustodyLog(
        custodyEngine(),
        custodyData(rowsOf(OVER, (i) => ({ entry: String(i), description: 'e' }))),
      ),
    );
    expect(table.body).toHaveLength(OVER + 1);
  });

  // ── The custody ledger is exempt even under the preview cap. Completeness IS
  // the document: the legal-notice box asserts every entry is present, and a
  // custody report is downloadable straight out of the Studio preview.

  it('renders EVERY custody ledger entry even under a preview cap', () => {
    const table = tableOf(
      renderCustodyLog(
        custodyEngine('en', PREVIEW_CAP),
        custodyData(rowsOf(OVER, (i) => ({ entry: String(i), description: 'e' }))),
      ),
    );
    expect(table.body).toHaveLength(OVER + 1);
    expect(JSON.stringify(table.body)).not.toContain('omitted');
  });

  // ── The preview cap itself: opt-in, visible, and self-describing.

  it('caps line items when the preview supplies a cap, and states what was omitted', () => {
    const table = tableOf(
      renderLineItems(
        engineFor('en', {}, PREVIEW_CAP),
        liData(rowsOf(OVER, (i) => ({ description: `row ${i}` }))),
      ),
    );
    expect(table.body).toHaveLength(PREVIEW_MAX_TABLE_ROWS + 2); // header + cap + continuation
    const cell = table.body[PREVIEW_MAX_TABLE_ROWS + 1][0] as { text?: string; colSpan?: number };
    expect(cell.text).toContain(String(PREVIEW_MAX_TABLE_ROWS));
    expect(cell.text).toContain(String(OVER));
    expect(cell.colSpan).toBe(4);
    // The notice must name itself as preview-only and account for the totals,
    // which the adapter derives from the FULL row set (issue: an invoice whose
    // printed lines do not sum to its printed total).
    expect(cell.text).toContain('Preview only');
    expect(cell.text?.toLowerCase()).toContain('totals');
  });

  it('caps the devices table under a preview cap', () => {
    const table = tableOf(
      renderDevices(
        engineFor('en', {}, PREVIEW_CAP),
        deviceData(rowsOf(OVER, () => ({ type: 'HDD', serial: 'S' }))),
      ),
    );
    expect(table.body).toHaveLength(PREVIEW_MAX_TABLE_ROWS + 2);
  });

  it('adds no continuation row exactly at the cap', () => {
    const table = tableOf(
      renderLineItems(
        engineFor('en', {}, PREVIEW_CAP),
        liData(rowsOf(PREVIEW_MAX_TABLE_ROWS, (i) => ({ description: `row ${i}` }))),
      ),
    );
    expect(table.body).toHaveLength(PREVIEW_MAX_TABLE_ROWS + 1);
  });
});

describe('TBL-08 — renderTemplate caps only when the caller opts in', () => {
  const config = BUILT_IN_TEMPLATE_CONFIGS.invoice;
  const OVER = PREVIEW_MAX_TABLE_ROWS + 6;

  const invoiceWithRows = (): EngineDocData => {
    const data = buildPreviewEngineData('invoice', config);
    data.lineItems = {
      columns: data.lineItems!.columns,
      rows: rowsOf(OVER, (i) => ({ description: `marker-row-${i}` })),
    };
    return data;
  };

  it('renders every row for a generation-shaped call (7 args, no options)', () => {
    const json = JSON.stringify(renderTemplate(config, invoiceWithRows(), CTX));
    expect(json).toContain(`marker-row-${OVER - 1}`);
    expect(json).not.toContain('Preview only');
  });

  it('caps for a preview-shaped call that passes maxTableRows', () => {
    const json = JSON.stringify(
      renderTemplate(config, invoiceWithRows(), CTX, null, null, null, null, {
        maxTableRows: PREVIEW_MAX_TABLE_ROWS,
      }),
    );
    expect(json).not.toContain(`marker-row-${OVER - 1}`);
    expect(json).toContain(`marker-row-${PREVIEW_MAX_TABLE_ROWS - 1}`);
    expect(json).toContain('Preview only');
  });
});

// ---------------------------------------------------------------------------
// TBL-09 — long unbroken tokens
// ---------------------------------------------------------------------------

describe('TBL-09 — soft break opportunities for long unbroken tokens', () => {
  it('leaves a device serial-number-length token untouched', () => {
    // ATA/SATA IDENTIFY caps the serial field at 20 ASCII characters, so no
    // real drive serial may be modified.
    const serial = 'WD1234567890ABCDEFGH'; // 20 chars
    expect(softWrapLongTokens(serial)).toBe(serial);
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'Data recovery from a failed 4TB drive with head damage';
    expect(softWrapLongTokens(prose)).toBe(prose);
  });

  it('inserts zero-width spaces inside a long unbroken token', () => {
    const hash = 'a'.repeat(64);
    const out = softWrapLongTokens(hash);
    expect(out).not.toBe(hash);
    expect(out).toContain(ZERO_WIDTH_SPACE);
    // Nothing but ZWSP is added — the original characters survive in order.
    expect(out.split(ZERO_WIDTH_SPACE).join('')).toBe(hash);
  });

  it('never touches non-ASCII text (Arabic cursive joins must not break)', () => {
    const arabic = 'استرجاع البيانات من قرص صلب متضرر جدا جدا جدا جدا جدا';
    expect(softWrapLongTokens(arabic)).toBe(arabic);
    const longArabicWord = 'ا'.repeat(40);
    expect(softWrapLongTokens(longArabicWord)).toBe(longArabicWord);
  });

  it('uses existing break opportunities before inserting any', () => {
    // Slash/hyphen separated tokens already break under pdfmake's UAX #14 pass.
    const url = 'https://lab.example.com/cases/2026/0042/report';
    expect(softWrapLongTokens(url)).toBe(url);
  });

  it('applies the wrap to line-item cells on an English (Roboto) document', () => {
    const table = tableOf(
      renderLineItems(engineFor(), liData([{ description: 'Z'.repeat(80) }])),
    );
    expect((table.body[1][0] as { text?: string }).text).toContain(ZERO_WIDTH_SPACE);
  });

  it('does NOT apply the wrap on an Arabic document (Tajawal has no U+200B glyph)', () => {
    const node = renderLineItems(engineFor('ar'), liData([{ description: 'Z'.repeat(80) }]));
    expect(JSON.stringify(node)).not.toContain(ZERO_WIDTH_SPACE);
  });

  it('never wraps a custody hash or signature cell (copy-exactness beats fit)', () => {
    const node = renderCustodyLog(
      custodyEngine(),
      custodyData([{ entry: '1', description: 'X'.repeat(80), hash: 'f'.repeat(64) }]),
    );
    const table = tableOf(node);
    expect((table.body[1][2] as { text?: string }).text).toBe('f'.repeat(64));
    // …while the ordinary description cell still gets its break opportunities.
    expect((table.body[1][1] as { text?: string }).text).toContain(ZERO_WIDTH_SPACE);
  });
});

// ---------------------------------------------------------------------------
// TBL-09 — the copy-exact carve-out must cover the IDENTIFIER columns that
// actually exist. A device serial is the string that ties a physical drive to
// its custody chain: a customer, an insurer or a court copies it out of the
// intake receipt / checkout form, and an invisible U+200B makes the extracted
// text differ from `case_devices.serial_number` — a silent mismatch. Same for
// the statutory `itemCode` (HSN/SAC) on a tax invoice.
// ---------------------------------------------------------------------------

describe('TBL-09 — identifier columns are never soft-wrapped', () => {
  const LONG_SERIAL = 'S'.repeat(48);

  it('leaves a long device serial byte-identical to the source value', () => {
    const table = tableOf(
      renderDevices(engineFor(), deviceData([{ type: 'HDD', serial: LONG_SERIAL }])),
    );
    expect((table.body[1][1] as { text?: string }).text).toBe(LONG_SERIAL);
  });

  it('still wraps a long non-identifier device cell (the fix is scoped, not blanket)', () => {
    const columns: ResolvedColumn[] = [
      { key: 'serial', visible: true, label: { en: 'Serial Number' }, width: 125, align: 'left' },
      { key: 'notes', visible: true, label: { en: 'Notes' }, align: 'left' },
    ];
    const table = tableOf(
      renderDevices(engineFor(), {
        devices: {
          title: { en: 'Devices' },
          columns,
          rows: [{ serial: LONG_SERIAL, notes: 'N'.repeat(80) }],
        },
      } as unknown as EngineDocData),
    );
    expect((table.body[1][0] as { text?: string }).text).toBe(LONG_SERIAL);
    expect((table.body[1][1] as { text?: string }).text).toContain(ZERO_WIDTH_SPACE);
  });

  it('leaves a long line-item itemCode (HSN/SAC) byte-identical', () => {
    const columns: ResolvedColumn[] = [
      { key: 'itemCode', visible: true, label: { en: 'Code' }, width: 50 },
      { key: 'description', visible: true, label: { en: 'Description' } },
    ];
    const code = '9'.repeat(40);
    const table = tableOf(
      renderLineItems(engineFor(), {
        lineItems: { columns, rows: [{ itemCode: code, description: 'D'.repeat(80) }] },
      } as unknown as EngineDocData),
    );
    expect((table.body[1][0] as { text?: string }).text).toBe(code);
    // The description beside it still wraps.
    expect((table.body[1][1] as { text?: string }).text).toContain(ZERO_WIDTH_SPACE);
  });
});
