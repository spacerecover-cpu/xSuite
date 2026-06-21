import { describe, it, expect } from 'vitest';
import {
  resolvePrimaryEntity,
  resolveCaseEntityDefault,
  isEntityLocked,
  type EntityRef,
} from './resolvePrimaryEntity';

const ksa: EntityRef = { id: 'e-ksa', is_primary: false, currency_code: 'SAR', tax_system: 'VAT' };
const omn: EntityRef = { id: 'e-omn', is_primary: true,  currency_code: 'OMR', tax_system: 'VAT' };

describe('resolvePrimaryEntity — the is_primary winner', () => {
  it('returns the single entity when a tenant has exactly one (auto-collapse case)', () => {
    expect(resolvePrimaryEntity([omn])?.id).toBe('e-omn');
  });
  it('returns the is_primary entity when several exist', () => {
    expect(resolvePrimaryEntity([ksa, omn])?.id).toBe('e-omn');
  });
  it('returns null when the list is empty (fail-loud signal, never a fabricated default)', () => {
    expect(resolvePrimaryEntity([])).toBeNull();
  });
  it('throws when more than one entity claims is_primary (uq_legal_entity_primary breach)', () => {
    expect(() => resolvePrimaryEntity([{ ...ksa, is_primary: true }, omn]))
      .toThrow(/more than one primary/i);
  });
});

describe('resolveCaseEntityDefault — Q4 silent-vs-forced-choice', () => {
  it('1 entity → silent auto-assign, requiresConfirmation=false', () => {
    const r = resolveCaseEntityDefault([omn], { homeEntityId: null });
    expect(r.entityId).toBe('e-omn');
    expect(r.requiresConfirmation).toBe(false);
  });
  it('>1 entities → pre-selects home entity but requiresConfirmation=true (no silent commit)', () => {
    const r = resolveCaseEntityDefault([ksa, omn], { homeEntityId: 'e-ksa' });
    expect(r.entityId).toBe('e-ksa');         // pre-selected, NOT committed
    expect(r.requiresConfirmation).toBe(true);
  });
  it('>1 entities and no home → falls back to primary pre-select, still requiresConfirmation=true', () => {
    const r = resolveCaseEntityDefault([ksa, omn], { homeEntityId: null });
    expect(r.entityId).toBe('e-omn');
    expect(r.requiresConfirmation).toBe(true);
  });
  it('0 entities → null entity, requiresConfirmation=false, blocked=true (cannot create a case)', () => {
    const r = resolveCaseEntityDefault([], { homeEntityId: null });
    expect(r.entityId).toBeNull();
    expect(r.blocked).toBe(true);
  });
});

describe('isEntityLocked — lock on first financial document (Q4 residual: numbered quote OR invoice)', () => {
  it('unlocked before any financial document', () => {
    expect(isEntityLocked({ hasNumberedQuote: false, hasInvoice: false })).toBe(false);
  });
  it('locked once a numbered quote exists', () => {
    expect(isEntityLocked({ hasNumberedQuote: true, hasInvoice: false })).toBe(true);
  });
  it('locked once an invoice exists', () => {
    expect(isEntityLocked({ hasNumberedQuote: false, hasInvoice: true })).toBe(true);
  });
});
