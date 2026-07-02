import { describe, it, expect } from 'vitest';
import { buildCaseSearchOrParts } from './caseSearch';

describe('buildCaseSearchOrParts', () => {
  it('always searches case_no, client_reference and subject', () => {
    const f = buildCaseSearchOrParts('kashi', [], []);
    expect(f).toBe('case_no.ilike.%kashi%,client_reference.ilike.%kashi%,subject.ilike.%kashi%');
  });

  it('folds matched customer ids into a customer_id in.() clause', () => {
    const f = buildCaseSearchOrParts('kashi', ['aaa-1', 'bbb-2'], []);
    expect(f).toContain('customer_id.in.(aaa-1,bbb-2)');
  });

  it('folds device-serial case ids into an id in.() clause', () => {
    const f = buildCaseSearchOrParts('SN123', [], ['case-uuid-1']);
    expect(f).toContain('id.in.(case-uuid-1)');
  });

  it('omits in.() clauses when there are no matches (no empty in.() syntax errors)', () => {
    const f = buildCaseSearchOrParts('zzz', [], []);
    expect(f).not.toContain('in.(');
  });

  it('combines all clause types', () => {
    const f = buildCaseSearchOrParts('x', ['c1'], ['k1', 'k2']);
    expect(f).toBe('case_no.ilike.%x%,client_reference.ilike.%x%,subject.ilike.%x%,customer_id.in.(c1),id.in.(k1,k2)');
  });
});
