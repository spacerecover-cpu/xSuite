import { describe, expect, it } from 'vitest';
import { WHATSAPP_EVENT_CATALOG, effectiveEventKey } from './events';

describe('WHATSAPP_EVENT_CATALOG', () => {
  it('contains the full lifecycle catalog with unique keys', () => {
    const keys = WHATSAPP_EVENT_CATALOG.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const required of [
      'case.created', 'case.device_received', 'case.phase_changed:diagnosis',
      'quote.created', 'quote.sent', 'quote.reminder', 'quote.approved', 'quote.rejected',
      'case.phase_changed:recovery', 'case.parts_ordered', 'case.milestone',
      'case.recovery_outcome', 'case.phase_changed:ready',
      'invoice.issued', 'payment.received.customer', 'case.checked_out',
      'case.phase_changed:closed', 'case.phase_changed:no_solution',
      'case.phase_changed:cancelled', 'case.follow_up_due',
      'case.feedback_request', 'case.review_request',
    ]) expect(keys).toContain(required);
  });

  it('debounces multi-device intake with a non-zero default delay', () => {
    const deviceReceived = WHATSAPP_EVENT_CATALOG.find((e) => e.key === 'case.device_received');
    expect(deviceReceived?.defaultDelayMinutes).toBeGreaterThanOrEqual(15);
  });

  it('marks feedback/review as marketing, everything else utility', () => {
    for (const e of WHATSAPP_EVENT_CATALOG) {
      const expected = ['case.feedback_request', 'case.review_request'].includes(e.key)
        ? 'marketing' : 'utility';
      expect(e.requiredConsent, e.key).toBe(expected);
    }
  });
});

describe('effectiveEventKey', () => {
  it('expands phase-change events on to_phase', () => {
    expect(effectiveEventKey('case.phase_changed', { to_phase: 'ready' }))
      .toBe('case.phase_changed:ready');
    expect(effectiveEventKey('case.phase_changed.customer', { to_phase: 'closed' }))
      .toBe('case.phase_changed:closed');
  });
  it('passes other events through', () => {
    expect(effectiveEventKey('quote.sent', {})).toBe('quote.sent');
  });
});
