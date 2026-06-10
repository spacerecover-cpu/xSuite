import { describe, expect, it, vi } from 'vitest';

// format.ts transitively imports the supabase client (currency formatting);
// these tests exercise pure date logic only.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { formatDateTimeWithConfig } from './format';

// 08:33:42 UTC == 12:33 in Asia/Muscat (UTC+4, no DST).
const UTC_INSTANT = '2026-06-10T08:33:42+00:00';

describe('formatDateTimeWithConfig', () => {
  it('renders in the tenant timezone with a zone label (24h)', () => {
    const out = formatDateTimeWithConfig(UTC_INSTANT, {
      timezone: 'Asia/Muscat',
      timeFormat: '24h',
    });
    expect(out).toContain('Jun 10, 2026');
    expect(out).toContain('12:33');
    expect(out).toMatch(/GMT\+4|GST/);
  });

  it('honours 12h tenant time format', () => {
    const out = formatDateTimeWithConfig(UTC_INSTANT, {
      timezone: 'Asia/Muscat',
      timeFormat: '12h',
    });
    expect(out).toContain('12:33');
    expect(out).toMatch(/PM/i);
  });

  it('renders UTC when the tenant timezone is UTC', () => {
    const out = formatDateTimeWithConfig(UTC_INSTANT, { timezone: 'UTC', timeFormat: '24h' });
    expect(out).toContain('08:33');
    expect(out).toContain('UTC');
  });

  it('can suppress the zone label', () => {
    const out = formatDateTimeWithConfig(
      UTC_INSTANT,
      { timezone: 'Asia/Muscat', timeFormat: '24h' },
      { withTz: false },
    );
    expect(out).toContain('12:33');
    expect(out).not.toMatch(/GMT|GST|UTC/);
  });

  it('degrades gracefully on an invalid IANA zone instead of throwing', () => {
    const out = formatDateTimeWithConfig(UTC_INSTANT, {
      timezone: 'Not/AZone',
      timeFormat: '24h',
    });
    expect(out).toContain('2026');
  });

  it('returns empty string for empty or invalid dates', () => {
    expect(formatDateTimeWithConfig(null, { timezone: 'UTC' })).toBe('');
    expect(formatDateTimeWithConfig('not-a-date', { timezone: 'UTC' })).toBe('');
  });
});
