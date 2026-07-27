import { describe, expect, it, vi } from 'vitest';

// supabaseClient throws on import without env vars; the pure functions under test never touch it.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import {
  diffRulesToSeed, parseHealthErrors, summarizeConsent, whatsappGoLiveGates,
} from './whatsappService';
import { WHATSAPP_EVENT_CATALOG } from './whatsapp/events';

describe('parseHealthErrors', () => {
  // The DB column stores the flattened `errors`; the edge test_connection
  // response returns the raw `entities`, each wrapping its own errors. Both
  // reach the UI, so both must parse.
  it('reads the flattened shape persisted on the integration row', () => {
    expect(parseHealthErrors([{
      error_code: 141006,
      error_description: 'There is an error with the payment method. This will block business initiated conversations.',
      possible_solution: 'Please add a new payment method to the account.',
    }])).toEqual([{
      code: 141006,
      description: 'There is an error with the payment method. This will block business initiated conversations.',
      solution: 'Please add a new payment method to the account.',
    }]);
  });

  it('flattens the entity-wrapped shape returned by test_connection', () => {
    expect(parseHealthErrors([
      { entity_type: 'PHONE_NUMBER', can_send_message: 'BLOCKED',
        errors: [{ error_code: 141006, error_description: 'payment method' }] },
      { entity_type: 'WABA', can_send_message: 'AVAILABLE' },
    ])).toEqual([{ code: 141006, description: 'payment method', solution: undefined }]);
  });

  it('returns [] for anything unparseable rather than throwing', () => {
    expect(parseHealthErrors(null)).toEqual([]);
    expect(parseHealthErrors([])).toEqual([]);
    expect(parseHealthErrors('nonsense')).toEqual([]);
    expect(parseHealthErrors([{ nothing: 'useful' }])).toEqual([]);
  });
});

describe('whatsappGoLiveGates', () => {
  const live = {
    connectionStatus: 'connected', tokenValid: true, isEnabled: true,
    webhookStatus: 'receiving', featureEnabled: true,
  };
  const okOf = (input: Parameters<typeof whatsappGoLiveGates>[0]) =>
    Object.fromEntries(whatsappGoLiveGates(input).map((g) => [g.key, g.ok]));

  // Regression: test_connection sets connection_status='error' when Meta reports
  // can_send_message=BLOCKED, even though the token and phone are perfectly
  // valid. Keying the credentials gate on connection_status therefore told an
  // admin with a lapsed payment method to "enter the five values and press
  // Connect" — advice that cannot possibly fix it.
  it('keeps the credentials gate green when the token is valid but Meta blocks sending', () => {
    const gates = okOf({ ...live, connectionStatus: 'error' });
    expect(gates.credentials).toBe(true);
    expect(gates.account).toBe(false);
  });

  it('fails the credentials gate only when the token itself is bad', () => {
    expect(okOf({ ...live, connectionStatus: 'token_invalid', tokenValid: false }).credentials).toBe(false);
    expect(okOf({ ...live, tokenValid: null }).credentials).toBe(false);
  });

  it('reports every gate green only when all of them are satisfied', () => {
    expect(whatsappGoLiveGates(live).every((g) => g.ok)).toBe(true);
  });

  it('treats a brand-new integration as fully blocked', () => {
    const gates = whatsappGoLiveGates({
      connectionStatus: 'disconnected', tokenValid: false, isEnabled: false,
      webhookStatus: 'unverified', featureEnabled: false,
    });
    expect(gates).toHaveLength(5);
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
