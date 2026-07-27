import { describe, expect, it, vi } from 'vitest';

// supabaseClient throws on import without env vars; the pure functions under test never touch it.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { diffRulesToSeed, summarizeConsent } from './whatsappService';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

describe('diffRulesToSeed', () => {
  it('returns one insert per catalog event missing from existing rules', () => {
    const existing = [{ event_key: 'case.created' }, { event_key: 'quote.sent' }];
    const inserts = diffRulesToSeed(existing, 'tenant-1');
    expect(inserts).toHaveLength(WHATSAPP_EVENT_CATALOG.length - 2);
    const row = inserts.find((r) => r.event_key === 'case.feedback_request');
    expect(row).toMatchObject({
      tenant_id: 'tenant-1', enabled: false, required_consent: 'marketing',
      reminder_config: { after_days: 2 },
    });
  });
  it('returns [] when everything exists', () => {
    const existing = WHATSAPP_EVENT_CATALOG.map((e) => ({ event_key: e.key }));
    expect(diffRulesToSeed(existing, 't')).toHaveLength(0);
  });
});

describe('summarizeConsent', () => {
  it('reduces the consent-state rows to a per-scope boolean map', () => {
    expect(summarizeConsent([
      { scope: 'utility', opted_in: true, occurred_at: '2026-01-01' },
      { scope: 'marketing', opted_in: false, occurred_at: '2026-01-02' },
    ])).toEqual({ utility: true, marketing: false });
    expect(summarizeConsent([])).toEqual({ utility: false, marketing: false });
  });
});
