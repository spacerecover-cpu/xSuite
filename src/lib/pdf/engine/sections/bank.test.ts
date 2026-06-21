// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderBank } from './bank';
import type { EngineContext, EngineDocData } from '../types';

function collectText(node: unknown, out: string[]): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((c) => collectText(c, out));
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string') out.push(o.text);
  Object.values(o).forEach((v) => collectText(v, out));
}

/** Find the fontSize of the first text node whose text contains `needle`. */
function fontSizeOf(node: unknown, needle: string): number | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const c of node) {
      const r = fontSizeOf(c, needle);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.includes(needle) && typeof o.fontSize === 'number') {
    return o.fontSize;
  }
  for (const v of Object.values(o)) {
    const r = fontSizeOf(v, needle);
    if (r !== undefined) return r;
  }
  return undefined;
}

const BANK_DATA = {
  bank: {
    title: { en: 'Bank Account', ar: 'تفاصيل البنك' },
    rows: [
      { label: { en: 'Account Name:', ar: 'اسم الحساب:' }, value: 'Future Space LLC' },
      { label: { en: 'Account No:', ar: 'رقم الحساب:' }, value: '123456789' },
      { label: { en: 'Bank:', ar: 'البنك:' }, value: 'Sohar International' },
      { label: { en: 'IBAN:', ar: 'الآيبان:' }, value: 'OM12 0000 1234' },
    ],
  },
} as unknown as EngineDocData;

function engine(
  bankStyle?: 'boxed' | 'inline',
  bankWidth?: 'auto' | 'half' | 'full',
  bankAlign?: 'left' | 'center' | 'right',
): EngineContext {
  return {
    config: {
      language: { mode: 'en', primary: 'en' },
      sections: [{
        key: 'bank', visible: true, order: 8,
        ...(bankStyle ? { bankStyle } : {}),
        ...(bankWidth ? { bankWidth } : {}),
        ...(bankAlign ? { bankAlign } : {}),
      }],
    },
  } as unknown as EngineContext;
}

describe('renderBank — display style', () => {
  it('renders a boxed bank block by default (each field labelled on its own line)', () => {
    const out = renderBank(engine(), BANK_DATA);
    const texts: string[] = [];
    collectText(out, texts);
    // Boxed shows the "Account Name:" field label.
    expect(texts.some((t) => t.includes('Account Name:'))).toBe(true);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(true);
  });

  it('renders a single-line bank block when bankStyle is "inline"', () => {
    const out = renderBank(engine('inline'), BANK_DATA);
    const texts: string[] = [];
    collectText(out, texts);
    const joined = texts.join(' ');
    // One pipe-separated line; the account name leads (no "Account Name:" label).
    expect(joined).toContain('Bank Account: Future Space LLC');
    expect(joined).toContain('Account No: 123456789');
    expect(joined).toContain('Bank: Sohar International');
    expect(joined).toContain('IBAN: OM12 0000 1234');
    expect(joined).toContain('|');
    expect(texts.some((t) => t.includes('Account Name:'))).toBe(false);
  });

  it('omits absent fields from the inline line', () => {
    const sparse = {
      bank: {
        title: { en: 'Bank Account' },
        rows: [
          { label: { en: 'Account Name:' }, value: 'Future Space LLC' },
          { label: { en: 'IBAN:' }, value: 'OM99' },
        ],
      },
    } as unknown as EngineDocData;
    const out = renderBank(engine('inline'), sparse);
    const texts: string[] = [];
    collectText(out, texts);
    const joined = texts.join(' ');
    expect(joined).toContain('Bank Account: Future Space LLC');
    expect(joined).toContain('IBAN: OM99');
    expect(joined).not.toContain('Account No:');
    expect(joined).not.toContain('Bank:');
  });
});

describe('renderBank — readability', () => {
  // Account details are customer-facing info, not fine print: they render at the
  // document body size (9pt), not the old 7pt tier that read as the smallest text
  // on the page even after the document font scale was applied.
  it('renders the account rows at the 9pt body size (boxed)', () => {
    expect(fontSizeOf(renderBank(engine(), BANK_DATA), 'Account No:')).toBe(9);
  });

  it('renders the account line at the 9pt body size (inline)', () => {
    expect(fontSizeOf(renderBank(engine('inline'), BANK_DATA), 'Account No:')).toBe(9);
  });

  it('renders the bank title at 9pt (>= body, bold)', () => {
    expect(fontSizeOf(renderBank(engine(), BANK_DATA), 'Bank Account')).toBe(9);
  });
});

describe('renderBank — boxed width & alignment', () => {
  type Node = {
    table?: { widths?: unknown[] };
    columns?: Array<{ width?: unknown; text?: string; stack?: Array<{ table?: { widths?: unknown[] } }> }>;
  };
  const box = (out: unknown): Node => (out as { stack: Node[] }).stack[0];
  const tableColumn = (n: Node) => (n.columns ?? []).find((c) => c.stack?.[0]?.table);

  it('defaults to an auto-width box (hugs content), not the full row', () => {
    const out = renderBank(engine(), BANK_DATA); // no bankWidth → default 'auto'
    const n = box(out);
    expect(n.table).toBeUndefined(); // wrapped in alignment columns, not a bare full-width table
    const col = tableColumn(n);
    expect(col?.stack?.[0]?.table?.widths).toEqual(['auto']);
    const texts: string[] = [];
    collectText(out, texts);
    expect(texts.some((t) => t.includes('Future Space LLC'))).toBe(true);
  });

  it('spans the full row when bankWidth is "full"', () => {
    const out = renderBank(engine('boxed', 'full'), BANK_DATA);
    expect(box(out).table?.widths).toEqual(['*']);
  });

  it('uses a fixed half-width column when bankWidth is "half"', () => {
    const out = renderBank(engine('boxed', 'half'), BANK_DATA);
    const col = tableColumn(box(out));
    expect(typeof col?.width).toBe('number');
  });

  it('left-aligns by default — the spacer trails the box', () => {
    const n = box(renderBank(engine('boxed', 'auto', 'left'), BANK_DATA));
    const c = n.columns ?? [];
    expect(c[0]?.stack?.[0]?.table).toBeDefined(); // box first
    expect(c[c.length - 1]?.text).toBe(''); // spacer last
  });

  it('right-aligns — the spacer leads the box', () => {
    const n = box(renderBank(engine('boxed', 'auto', 'right'), BANK_DATA));
    const c = n.columns ?? [];
    expect(c[0]?.text).toBe(''); // spacer first
    expect(c[c.length - 1]?.stack?.[0]?.table).toBeDefined(); // box last
  });

  it('centre-aligns — spacers on both sides', () => {
    const n = box(renderBank(engine('boxed', 'auto', 'center'), BANK_DATA));
    const c = n.columns ?? [];
    expect(c[0]?.text).toBe('');
    expect(c[c.length - 1]?.text).toBe('');
    expect(tableColumn(n)).toBeDefined();
  });
});
