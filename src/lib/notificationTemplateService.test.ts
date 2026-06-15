import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const builder = {
  select: () => builder,
  eq: () => builder,
  is: () => builder,
  maybeSingle,
};
vi.mock('./supabaseClient', () => ({ supabase: { from: () => builder } }));

import { resolveNotificationTemplate } from './notificationTemplateService';

const tpl = (subject: string, body: string) => ({
  data: { subject_template: subject, body_template: body, link_template: null },
});
const miss = { data: null };

describe('resolveNotificationTemplate (R10 — tenant → country → global → coded cascade)', () => {
  beforeEach(() => maybeSingle.mockReset());

  it('prefers the tenant override (first lookup hit)', async () => {
    maybeSingle.mockResolvedValueOnce(tpl('T subj', 'T body'));
    const r = await resolveNotificationTemplate({ eventType: 'quote_ready', channel: 'email', locale: 'ar', tenantId: 't1', countryId: 'c1' });
    expect(r.body_template).toBe('T body');
  });

  it('falls through to the country default when no tenant override', async () => {
    maybeSingle.mockResolvedValueOnce(miss).mockResolvedValueOnce(tpl('C subj', 'C body'));
    const r = await resolveNotificationTemplate({ eventType: 'quote_ready', channel: 'email', locale: 'ar', tenantId: 't1', countryId: 'c1' });
    expect(r.body_template).toBe('C body');
  });

  it('falls through to the global default (country_id IS NULL)', async () => {
    maybeSingle.mockResolvedValueOnce(miss).mockResolvedValueOnce(miss).mockResolvedValueOnce(tpl('G subj', 'G body'));
    const r = await resolveNotificationTemplate({ eventType: 'quote_ready', channel: 'email', locale: 'ar', tenantId: 't1', countryId: 'c1' });
    expect(r.body_template).toBe('G body');
  });

  it('retries the cascade in English when the requested locale misses everywhere', async () => {
    // ar: tenant miss, country miss, global miss → en: tenant miss, country miss, global hit
    maybeSingle
      .mockResolvedValueOnce(miss).mockResolvedValueOnce(miss).mockResolvedValueOnce(miss)
      .mockResolvedValueOnce(miss).mockResolvedValueOnce(miss).mockResolvedValueOnce(tpl('EN subj', 'EN body'));
    const r = await resolveNotificationTemplate({ eventType: 'quote_ready', channel: 'email', locale: 'ar', tenantId: 't1', countryId: 'c1' });
    expect(r.body_template).toBe('EN body');
  });

  it('returns the coded English fallback when everything misses', async () => {
    maybeSingle.mockResolvedValue(miss);
    const r = await resolveNotificationTemplate({ eventType: 'quote_ready', channel: 'email', locale: 'ar', tenantId: 't1', countryId: 'c1' });
    expect(typeof r.body_template).toBe('string');
    expect(r.body_template.length).toBeGreaterThan(0);
  });

  it('statutory events resolve to the English baseline (verified), ignoring the requested locale', async () => {
    // isStatutory → forces locale 'en'; first lookup (tenant, en) hits.
    maybeSingle.mockResolvedValueOnce(tpl('EN statutory subj', 'EN statutory body'));
    const r = await resolveNotificationTemplate({
      eventType: 'data_destruction_certificate', channel: 'email', locale: 'ar',
      tenantId: 't1', countryId: 'c1', isStatutory: true,
    });
    expect(r.body_template).toBe('EN statutory body');
  });
});
