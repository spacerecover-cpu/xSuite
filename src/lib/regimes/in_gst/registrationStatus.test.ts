// src/lib/regimes/in_gst/registrationStatus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { logger } from '../../logger';
import {
  regimeRequiresExplicitRegistrationStatus,
  filterActiveRegistrations,
  resolveGstRegistrationStatus,
  assertNoSilentUnregisteredFallback,
  gstinMatchesSubdivision,
} from './registrationStatus';
import type { LegalEntityTaxRegistrationRow } from '../types';

const reg = (over: Partial<LegalEntityTaxRegistrationRow>): LegalEntityTaxRegistrationRow => ({
  id: 'r1', legal_entity_id: 'le1', country_id: 'c-in', subdivision_id: 's-ka',
  tax_number: '29ABCDE1234F1Z5', scheme: 'standard',
  registered_from: '2026-04-01', registered_to: null, is_primary: true,
  ...over,
});

describe('regimeRequiresExplicitRegistrationStatus', () => {
  it('is true only for in_gst', () => {
    expect(regimeRequiresExplicitRegistrationStatus('in_gst')).toBe(true);
    expect(regimeRequiresExplicitRegistrationStatus('simple_vat')).toBe(false);
    expect(regimeRequiresExplicitRegistrationStatus('gcc_return')).toBe(false);
  });
});

describe('filterActiveRegistrations', () => {
  it('keeps only registrations effective on the date', () => {
    const rows = [
      reg({ id: 'live' }),
      reg({ id: 'future', registered_from: '2027-01-01' }),
      reg({ id: 'lapsed', registered_to: '2026-06-30' }),
    ];
    expect(filterActiveRegistrations(rows, '2026-07-05').map((r) => r.id)).toEqual(['live']);
  });
});

describe('resolveGstRegistrationStatus (D6)', () => {
  it('an active registration row = registered, no assertion', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [reg({})], declaredStatus: undefined,
    });
    expect(r).toEqual({ status: 'registered', source: 'registration_row', assertionMessage: null });
  });

  it('declared unregistered = unregistered, no assertion (loud mode, not silent)', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: 'unregistered',
    });
    expect(r.status).toBe('unregistered');
    expect(r.source).toBe('declared_unregistered');
    expect(r.assertionMessage).toBe(null);
  });

  it('in_gst with NEITHER a row NOR a declaration = silent fallback with assertion message', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: undefined,
    });
    expect(r.source).toBe('silent_fallback');
    expect(r.assertionMessage).toMatch(/Tax Registration/);
  });

  it('declared "registered" but no active row is ALSO a silent fallback (inconsistent state)', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'in_gst', activeRegistrations: [], declaredStatus: 'registered',
    });
    expect(r.source).toBe('silent_fallback');
  });

  it('non-GST regimes never assert on absence', () => {
    const r = resolveGstRegistrationStatus({
      regimeTaxKey: 'simple_vat', activeRegistrations: [], declaredStatus: undefined,
    });
    expect(r.status).toBe('unregistered');
    expect(r.assertionMessage).toBe(null);
  });
});

describe('assertNoSilentUnregisteredFallback', () => {
  it('is a no-op for explicit resolutions', () => {
    expect(() => assertNoSilentUnregisteredFallback({
      status: 'registered', source: 'registration_row', assertionMessage: null,
    })).not.toThrow();
  });

  it('logs AND throws under DEV (vitest runs with import.meta.env.DEV=true) on silent fallback', () => {
    expect(() => assertNoSilentUnregisteredFallback({
      status: 'unregistered', source: 'silent_fallback', assertionMessage: 'boom',
    })).toThrow(/\[dev-assert\] boom/);
    expect(logger.error).toHaveBeenCalledWith('[dev-assert] boom');
  });
});

describe('gstinMatchesSubdivision', () => {
  it('compares the 2-digit GSTIN state prefix to the subdivision tax_authority_code', () => {
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', '29')).toBe(true);
    expect(gstinMatchesSubdivision('27ABCDE1234F1Z5', '29')).toBe(false);
    expect(gstinMatchesSubdivision(' 29ABCDE1234F1Z5 ', '29')).toBe(true);
  });
  it('passes when the subdivision carries no GST code (nothing to compare)', () => {
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', null)).toBe(true);
    expect(gstinMatchesSubdivision('29ABCDE1234F1Z5', undefined)).toBe(true);
  });
});

describe('D6 wire (structural)', () => {
  it('computeDocumentTotals calls assertGstRegistrationExplicit', () => {
    const src = readFileSync(new URL('../../taxDocumentService.ts', import.meta.url), 'utf8');
    expect(src).toContain('assertGstRegistrationExplicit(');
  });
});
