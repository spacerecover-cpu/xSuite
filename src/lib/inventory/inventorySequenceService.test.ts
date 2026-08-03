import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { from } }));

import {
  formatNextNumber,
  formatCurrentNumber,
  maxNumericSuffix,
  fetchMaxSuffixForPrefix,
} from './inventorySequenceService';

describe('maxNumericSuffix', () => {
  it('returns the highest numeric suffix among numbers with the prefix', () => {
    expect(maxNumericSuffix(['H25-0001', 'H25-0012', 'H25-0007'], 'H25')).toBe(12);
  });

  it('ignores other prefixes and malformed suffixes; prefix match is case-insensitive', () => {
    expect(maxNumericSuffix(['SSD-0099', 'h25-0003', 'H25-abc', 'H25-'], 'H25')).toBe(3);
  });

  it('returns 0 when nothing matches', () => {
    expect(maxNumericSuffix([], 'H25')).toBe(0);
    expect(maxNumericSuffix(['SSD-0001'], 'H25')).toBe(0);
  });
});

describe('fetchMaxSuffixForPrefix', () => {
  // Whole ordered result set, paged 1000 at a time by the service.
  const allRows = Array.from({ length: 3500 }, (_, i) => ({
    item_number: `INV-${String(i + 1).padStart(4, '0')}`,
  }));

  function mockPagedItems(rows: Array<{ item_number: string | null }>) {
    const ranges: Array<[number, number]> = [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'ilike', 'is', 'order']) {
      builder[method] = () => builder;
    }
    builder.range = (start: number, end: number) => {
      ranges.push([start, end]);
      return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
    };
    from.mockReturnValue(builder);
    return ranges;
  }

  beforeEach(() => from.mockReset());

  it('pages past the first 1000 rows so the true max is found', async () => {
    const ranges = mockPagedItems(allRows);
    // Without pagination only the first page is read (max 1000).
    await expect(fetchMaxSuffixForPrefix('INV')).resolves.toBe(3500);
    expect(ranges.length).toBe(4);
  });

  it('stops after the first short page', async () => {
    const ranges = mockPagedItems(allRows.slice(0, 12));
    await expect(fetchMaxSuffixForPrefix('INV')).resolves.toBe(12);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('short-circuits an empty prefix without querying', async () => {
    await expect(fetchMaxSuffixForPrefix('  ')).resolves.toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates query errors instead of reporting a max of 0', async () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'ilike', 'is', 'order']) builder[method] = () => builder;
    builder.range = () => Promise.resolve({ data: null, error: { message: 'boom' } });
    from.mockReturnValue(builder);
    await expect(fetchMaxSuffixForPrefix('INV')).rejects.toBeTruthy();
  });
});

describe('formatNextNumber', () => {
  it('pads to the specified width', () => {
    expect(formatNextNumber('HDD', 0, 4)).toBe('HDD-0001');
    expect(formatNextNumber('HDD', 99, 4)).toBe('HDD-0100');
    expect(formatNextNumber('SSD', 999, 6)).toBe('SSD-001000');
  });

  it('handles single-digit padding', () => {
    expect(formatNextNumber('X', 8, 1)).toBe('X-9');
    expect(formatNextNumber('X', 9, 1)).toBe('X-10');
  });
});

describe('formatCurrentNumber', () => {
  it('returns em-dash when current_value is 0', () => {
    expect(formatCurrentNumber('HDD', 0, 4)).toBe('—');
  });

  it('formats allocated values correctly', () => {
    expect(formatCurrentNumber('HDD', 5, 4)).toBe('HDD-0005');
    expect(formatCurrentNumber('USB', 123, 6)).toBe('USB-000123');
  });
});

describe('template-aware previews (cosmetic fix — spec §4 WP-S5)', () => {
  it('formatNextNumber renders the v2 template when the row carries one', () => {
    expect(
      formatNextNumber('INV', 41, 4, 'INV/{FY}/{SEQ:4}', '04-01', new Date(2026, 6, 5)),
    ).toBe('INV/26-27/0042');
  });

  it('formatCurrentNumber renders the template and keeps the em-dash for 0', () => {
    expect(
      formatCurrentNumber('INV', 42, 4, 'INV/{FY}/{SEQ:4}', '04-01', new Date(2026, 6, 5)),
    ).toBe('INV/26-27/0042');
    expect(formatCurrentNumber('INV', 0, 4, 'INV/{FY}/{SEQ:4}', '04-01')).toBe('—');
  });

  it('null/omitted template keeps the exact legacy shape (all existing callers unchanged)', () => {
    expect(formatNextNumber('HDD', 0, 4, null, null)).toBe('HDD-0001');
    expect(formatCurrentNumber('HDD', 5, 4)).toBe('HDD-0005');
  });
});
