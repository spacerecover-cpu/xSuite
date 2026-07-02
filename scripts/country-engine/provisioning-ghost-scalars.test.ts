// Provisioning correctness gate (localization Phase 0): a tenants INSERT that
// provides ONLY country_id must come out with the country's scalars — never the
// historical USD/'$'/NONE/en-US/UTC/MM-DD ghosts. Runs a rolled-back transaction
// against the live DB; self-skips without SUPABASE_DB_URL.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL;
const live = dbUrl ? describe : describe.skip;

function psqlRows(sql: string): string[] {
  return execFileSync('psql', [dbUrl as string, '-tA', '-F', '|', '-c', sql], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

live('tenant provisioning carries country facts (UK fixture)', () => {
  it('a GB tenant INSERT has zero USD/NONE ghosts', () => {
    const rows = psqlRows(`
      BEGIN;
      INSERT INTO public.tenants (name, slug, country_id)
      SELECT 'P0 UK Fixture', 'p0-uk-fixture', id FROM public.geo_countries WHERE code = 'GB';
      SELECT currency_code || '|' || currency_symbol || '|' || tax_system || '|' || tax_label || '|' ||
             locale_code || '|' || timezone || '|' || date_format || '|' || fiscal_year_start || '|' ||
             base_currency_code
      FROM public.tenants WHERE slug = 'p0-uk-fixture';
      ROLLBACK;
    `);
    const fixture = rows.find((r) => r.includes('GBP')) ?? rows[rows.length - 1] ?? '';
    const [currency, symbol, taxSystem, taxLabel, locale, tz, dateFormat, fy, base] = fixture.split('|');
    expect(currency).toBe('GBP');
    expect(symbol).toBe('£');
    expect(taxSystem).toBe('VAT');
    expect(taxLabel).toBe('VAT');
    expect(locale).not.toBe('en-US');
    expect(tz).toBe('Europe/London');
    expect(dateFormat).toBe('DD/MM/YYYY');
    expect(fy).toBe('04-06');
    expect(base).toBe('GBP');
  });
});
