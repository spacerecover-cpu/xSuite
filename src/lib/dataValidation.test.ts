import { describe, it, expect } from 'vitest';
import { sanitizeUuidFields, dropEmptyKeys } from './dataValidation';

const VALID = '11111111-1111-1111-1111-111111111111';

describe('sanitizeUuidFields', () => {
  it('coerces an empty-string uuid field to null (cleared select)', () => {
    const out = sanitizeUuidFields({ case_id: '' }, ['case_id']);
    expect(out.case_id).toBeNull();
  });

  it('coerces a non-uuid string to null', () => {
    const out = sanitizeUuidFields({ case_id: 'not-a-uuid' }, ['case_id']);
    expect(out.case_id).toBeNull();
  });

  it('passes a valid uuid through unchanged', () => {
    const out = sanitizeUuidFields({ case_id: VALID }, ['case_id']);
    expect(out.case_id).toBe(VALID);
  });

  // REGRESSION (Issue 2 — invoice/quote edit wiped customer/case): a field that is
  // ABSENT from the payload means "leave unchanged" on an UPDATE. The helper must NOT
  // inject it as null, or the UPDATE overwrites the stored relation with null.
  it('does NOT inject null for fields absent from the payload (UPDATE safety)', () => {
    const out = sanitizeUuidFields({ title: 'x' }, ['case_id', 'customer_id', 'company_id']);
    expect('case_id' in out).toBe(false);
    expect('customer_id' in out).toBe(false);
    expect('company_id' in out).toBe(false);
  });

  it('does not turn an explicitly-undefined field into null', () => {
    const out = sanitizeUuidFields({ case_id: undefined }, ['case_id']);
    expect(out.case_id).toBeUndefined();
  });
});

describe('dropEmptyKeys', () => {
  it('drops keys that are null / undefined / empty string', () => {
    const out = dropEmptyKeys(
      { case_id: null, customer_id: undefined, company_id: '', title: 'keep' },
      ['case_id', 'customer_id', 'company_id'],
    );
    expect('case_id' in out).toBe(false);
    expect('customer_id' in out).toBe(false);
    expect('company_id' in out).toBe(false);
    expect(out.title).toBe('keep');
  });

  it('keeps a valid value so a deliberate re-assignment still works', () => {
    const out = dropEmptyKeys({ case_id: VALID }, ['case_id']);
    expect(out.case_id).toBe(VALID);
  });

  it('only touches the listed keys', () => {
    const out = dropEmptyKeys({ case_id: null }, ['customer_id']);
    expect('case_id' in out).toBe(true);
  });
});
