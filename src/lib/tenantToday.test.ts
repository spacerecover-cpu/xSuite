import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const maybeSingle = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) })),
    })),
  },
}));

import {
  tenantToday, tenantTodayMonth, addDaysIso, addMonthsIso,
  getTenantTimezone, currentTenantToday, clearTenantTodayCache,
} from './tenantToday';

describe('tenantToday (pure)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the tenant-local calendar date, not the UTC date', () => {
    // 2026-06-30 22:30 UTC = 2026-07-01 02:30 in Muscat (UTC+4), 18:30 in New York (UTC-4)
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(tenantToday('Asia/Muscat')).toBe('2026-07-01');
    expect(tenantToday('America/New_York')).toBe('2026-06-30');
    expect(tenantToday('UTC')).toBe('2026-06-30');
    // the pattern this helper replaces stamps the WRONG day for Muscat:
    expect(new Date().toISOString().split('T')[0]).toBe('2026-06-30');
  });

  it('tenantTodayMonth returns YYYY-MM in tenant time', () => {
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(tenantTodayMonth('Asia/Muscat')).toBe('2026-07');
    expect(tenantTodayMonth('UTC')).toBe('2026-06');
  });

  it('throws on an invalid IANA zone (fail-loud, no silent UTC)', () => {
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(() => tenantToday('Not/AZone')).toThrow();
  });
});

describe('date math (pure, timezone-free)', () => {
  it('addDaysIso handles month/year rollover', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIso('2026-12-02', 30)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('addMonthsIso handles year boundaries and negatives', () => {
    expect(addMonthsIso('2026-01-15', -3)).toBe('2025-10-15');
    expect(addMonthsIso('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('addMonthsIso clamps to end-of-month instead of overflowing', () => {
    // 2026 is not a leap year: Feb has 28 days.
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    // Jan 31 + 3 months lands in April, which has 30 days.
    expect(addMonthsIso('2026-01-31', 3)).toBe('2026-04-30');
    // Dec 31 2026 + 2 months lands in Feb 2027 (not a leap year either).
    expect(addMonthsIso('2026-12-31', 2)).toBe('2027-02-28');
    // 2028 IS a leap year: Feb has 29 days.
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('getTenantTimezone / currentTenantToday', () => {
  beforeEach(() => { clearTenantTodayCache(); maybeSingle.mockReset(); });

  it('reads tenants.timezone once and caches it', async () => {
    maybeSingle.mockResolvedValue({ data: { timezone: 'Asia/Muscat' }, error: null });
    expect(await getTenantTimezone()).toBe('Asia/Muscat');
    expect(await getTenantTimezone()).toBe('Asia/Muscat');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when no timezone is configured', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getTenantTimezone()).rejects.toThrow('no timezone');
  });

  it('currentTenantToday composes both', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    maybeSingle.mockResolvedValue({ data: { timezone: 'Asia/Muscat' }, error: null });
    expect(await currentTenantToday()).toBe('2026-07-01');
    vi.useRealTimers();
  });
});

describe('document-date stamping sweep (Phase 0)', () => {
  const SWEPT_FILES = [
    'src/components/cases/InvoiceFormModal.tsx',
    'src/components/cases/QuoteFormModal.tsx',
    'src/components/cases/ConvertToInvoiceModal.tsx',
    'src/components/financial/ExpenseFormModal.tsx',
    'src/components/financial/ExpensePaymentModal.tsx',
  ];
  it.each(SWEPT_FILES)('%s no longer stamps UTC document dates', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src.includes("new Date().toISOString().split('T')[0]")).toBe(false);
  });
});
