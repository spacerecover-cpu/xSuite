import { describe, it, expect } from 'vitest';
import { legalEntityKeys } from '../../queryKeys';

describe('legalEntityKeys', () => {
  it('namespaces all keys under "legal_entities"', () => {
    expect(legalEntityKeys.all[0]).toBe('legal_entities');
    expect(legalEntityKeys.list('t-1')).toEqual(['legal_entities', 'list', 't-1']);
    expect(legalEntityKeys.primary('t-1')).toEqual(['legal_entities', 'primary', 't-1']);
    expect(legalEntityKeys.detail('e-1')).toEqual(['legal_entities', 'detail', 'e-1']);
  });
});
