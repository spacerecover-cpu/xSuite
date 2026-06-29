import { describe, it, expect } from 'vitest';
import {
  PORTAL_VISIBILITY_FLAGS,
  isFieldVisible,
} from './portalVisibility';

describe('PORTAL_VISIBILITY_FLAGS', () => {
  it('includes show_documents', () => {
    expect(PORTAL_VISIBILITY_FLAGS).toContain('show_documents');
  });

  it('includes the three pre-existing flags', () => {
    expect(PORTAL_VISIBILITY_FLAGS).toContain('show_quotes');
    expect(PORTAL_VISIBILITY_FLAGS).toContain('show_reports');
    expect(PORTAL_VISIBILITY_FLAGS).toContain('show_invoices');
  });
});

describe('isFieldVisible', () => {
  it('returns false when visible_fields is empty', () => {
    expect(
      isFieldVisible({ case_id: 'c', visible_fields: [], custom_message: null }, 'show_documents')
    ).toBe(false);
  });

  it('returns true when visible_fields contains the flag', () => {
    expect(
      isFieldVisible(
        { case_id: 'c', visible_fields: ['show_documents'], custom_message: null },
        'show_documents'
      )
    ).toBe(true);
  });

  it('returns false when visible_fields is null', () => {
    expect(
      isFieldVisible({ case_id: 'c', visible_fields: null, custom_message: null }, 'show_documents')
    ).toBe(false);
  });
});
