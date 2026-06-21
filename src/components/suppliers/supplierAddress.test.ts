import { describe, it, expect } from 'vitest';
import { composeSupplierAddress } from './supplierAddress';

describe('composeSupplierAddress', () => {
  it('folds street, state, zip and country into one address string (no drop)', () => {
    expect(composeSupplierAddress({
      address: '12 Main St', state: 'Muscat', zip_code: '113', country: 'Oman',
    })).toBe('12 Main St, Muscat, 113, Oman');
  });
  it('skips blank parts and trims', () => {
    expect(composeSupplierAddress({ address: '12 Main St', state: '', zip_code: '113', country: '' }))
      .toBe('12 Main St, 113');
  });
  it('returns null when every part is empty (so null reaches the DB, not "")', () => {
    expect(composeSupplierAddress({ address: '', state: '', zip_code: '', country: '' })).toBeNull();
  });
});
