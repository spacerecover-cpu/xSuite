import { describe, it, expect, vi } from 'vitest';

// The pure helpers under test do not touch Supabase; stub the client so importing
// the module doesn't require live env/config.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { buildEmailRoutes, emailRouteKey, deriveDlqFlags } from './notificationDLQService';

describe('DLQ email-route flag derivation (in-app-only events must not be flagged stuck)', () => {
  const T = 'tenant-1';
  const IN_APP_TYPE = 'case.phase_changed'; // seeded default: in_app channel only, no email sub
  const EMAIL_TYPE = 'quote.ready'; // has an enabled email subscription
  const oldOccurred = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
  const longRunningCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago

  const routes = buildEmailRoutes([{ tenant_id: T, event_type: EMAIL_TYPE }]);

  it('does NOT flag a delivered in-app-only event (processed_at NULL, no email route)', () => {
    const flags = deriveDlqFlags(
      { tenant_id: T, event_type: IN_APP_TYPE, processed_at: null, occurred_at: oldOccurred },
      routes.keys,
      longRunningCutoff,
    );
    expect(flags.is_unprocessed).toBe(false);
    expect(flags.is_stuck).toBe(false);
  });

  it('flags an email-routed event that was never dispatched (processed_at NULL) as unprocessed and stuck', () => {
    const flags = deriveDlqFlags(
      { tenant_id: T, event_type: EMAIL_TYPE, processed_at: null, occurred_at: oldOccurred },
      routes.keys,
      longRunningCutoff,
    );
    expect(flags.is_unprocessed).toBe(true);
    expect(flags.is_stuck).toBe(true);
  });

  it('does not flag a dispatched email event (processed_at set)', () => {
    const flags = deriveDlqFlags(
      {
        tenant_id: T,
        event_type: EMAIL_TYPE,
        processed_at: new Date().toISOString(),
        occurred_at: oldOccurred,
      },
      routes.keys,
      longRunningCutoff,
    );
    expect(flags.is_unprocessed).toBe(false);
    expect(flags.is_stuck).toBe(false);
  });

  it('is_unprocessed but not yet stuck when the email-routed event is recent', () => {
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
    const flags = deriveDlqFlags(
      { tenant_id: T, event_type: EMAIL_TYPE, processed_at: null, occurred_at: recent },
      routes.keys,
      longRunningCutoff,
    );
    expect(flags.is_unprocessed).toBe(true);
    expect(flags.is_stuck).toBe(false);
  });

  it('scopes the email route per tenant (same event_type in another tenant is not a route)', () => {
    const flags = deriveDlqFlags(
      { tenant_id: 'tenant-2', event_type: EMAIL_TYPE, processed_at: null, occurred_at: oldOccurred },
      routes.keys,
      longRunningCutoff,
    );
    expect(flags.is_unprocessed).toBe(false);
    expect(flags.is_stuck).toBe(false);
  });

  it('buildEmailRoutes collects distinct event types and per-tenant keys, skipping null rows', () => {
    const r = buildEmailRoutes([
      { tenant_id: T, event_type: EMAIL_TYPE },
      { tenant_id: T, event_type: EMAIL_TYPE },
      { tenant_id: 'tenant-2', event_type: 'invoice.created' },
      { tenant_id: null, event_type: null },
      { tenant_id: 'tenant-3', event_type: null },
    ]);
    expect([...r.eventTypes].sort()).toEqual(['invoice.created', 'quote.ready']);
    expect(r.keys.has(emailRouteKey(T, EMAIL_TYPE))).toBe(true);
    expect(r.keys.has(emailRouteKey('tenant-2', 'invoice.created'))).toBe(true);
    expect(r.keys.size).toBe(2);
  });
});
