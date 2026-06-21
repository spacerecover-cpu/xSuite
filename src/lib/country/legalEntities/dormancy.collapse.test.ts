import { describe, it, expect } from 'vitest';
import { resolveCaseEntityDefault } from './resolvePrimaryEntity';

// The collapse guarantees exactly one primary entity per tenant (Task 5 SQL
// enforces it in the DB). This test locks the CONSUMER contract: with that single
// entity, case creation is silent (no confirmation, not blocked) — the dormant
// happy path every existing tenant hits today.
describe('post-collapse consumer contract (dormant single-entity world)', () => {
  it('a collapsed tenant (1 primary entity) creates cases silently — no entity picker', () => {
    const collapsed = [{ id: 'e-primary', is_primary: true, currency_code: 'OMR', tax_system: 'VAT' }];
    const r = resolveCaseEntityDefault(collapsed, { homeEntityId: null });
    expect(r.entityId).toBe('e-primary');
    expect(r.requiresConfirmation).toBe(false); // Q4: silent for exactly 1 entity
    expect(r.blocked).toBe(false);
  });

  it('the multi-entity confirmation path stays DORMANT until a 2nd entity is added (Phase 4 WS-B)', () => {
    const single = [{ id: 'e-primary', is_primary: true, currency_code: 'OMR', tax_system: 'VAT' }];
    const dual = [...single, { id: 'e-2', is_primary: false, currency_code: 'SAR', tax_system: 'VAT' }];
    expect(resolveCaseEntityDefault(single, { homeEntityId: null }).requiresConfirmation).toBe(false);
    expect(resolveCaseEntityDefault(dual, { homeEntityId: null }).requiresConfirmation).toBe(true);
  });
});
