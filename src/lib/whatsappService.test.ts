import { describe, expect, it, vi } from 'vitest';

// supabaseClient throws on import without env vars; the pure functions under test never touch it.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { diffRulesToSeed, summarizeConsent, whatsappGoLiveGates } from './whatsappService';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

describe('whatsappGoLiveGates', () => {
  const live = {
    connectionStatus: 'connected', isEnabled: true,
    webhookStatus: 'receiving', featureEnabled: true,
  };
  const okOf = (input: Parameters<typeof whatsappGoLiveGates>[0]) =>
    Object.fromEntries(whatsappGoLiveGates(input).map((g) => [g.key, g.ok]));

  it('reports every gate green only when all four are satisfied', () => {
    expect(whatsappGoLiveGates(live).every((g) => g.ok)).toBe(true);
  });

  it('treats a brand-new integration as fully blocked', () => {
    const gates = whatsappGoLiveGates({
      connectionStatus: 'disconnected', isEnabled: false,
      webhookStatus: 'unverified', featureEnabled: false,
    });
    expect(gates).toHaveLength(4);
    expect(gates.some((g) => g.ok)).toBe(false);
    gates.forEach((g) => expect(g.fix).not.toHaveLength(0));
  });

  // The regression this encodes: storing credentials sets connection_status
  // 'connected' but leaves is_enabled false, and whatsapp_tenant_active() needs
  // BOTH. Dropping this gate makes a dead integration look ready.
  it('keeps the sending gate red while is_enabled is false', () => {
    expect(okOf({ ...live, isEnabled: false }))
      .toMatchObject({ credentials: true, sending: false });
  });

  it('accepts either verified or receiving as a live webhook, never unverified', () => {
    expect(okOf({ ...live, webhookStatus: 'verified' }).webhook).toBe(true);
    expect(okOf({ ...live, webhookStatus: 'unverified' }).webhook).toBe(false);
    expect(okOf({ ...live, webhookStatus: null }).webhook).toBe(false);
  });

  it('stays red when the tenant feature flag is off', () => {
    expect(okOf({ ...live, featureEnabled: false }).feature).toBe(false);
  });
});

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
