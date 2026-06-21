import { describe, it, expect } from 'vitest';
import { cn, isValidEmail, safeInternalRedirect } from './utils';

describe('cn', () => {
  it('resolves conflicting spacing utilities to the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('resolves conflicting semantic surface tokens to the last one', () => {
    expect(cn('bg-surface', 'bg-surface-muted')).toBe('bg-surface-muted');
  });

  it('keeps independent edge utilities the old prefix-dedup dropped', () => {
    const result = cn('border-t', 'border-b');
    expect(result).toContain('border-t');
    expect(result).toContain('border-b');
  });

  it('preserves a variant-prefixed class alongside its base class', () => {
    expect(cn('bg-primary', 'hover:bg-primary')).toBe('bg-primary hover:bg-primary');
  });

  it('flattens conditional and array inputs', () => {
    expect(cn('text-sm', false, ['font-medium', null], undefined)).toBe('text-sm font-medium');
  });
});

describe('isValidEmail', () => {
  it('accepts a standard email address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts emails with subdomains and plus tags', () => {
    expect(isValidEmail('first.last+tag@mail.example.co.uk')).toBe(true);
  });

  it('rejects a string without an @ sign', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects a string without a domain dot', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects a string with whitespace', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects a string missing the local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });
});

describe('safeInternalRedirect', () => {
  it('allows a root-relative app path', () => {
    expect(safeInternalRedirect('/cases')).toBe('/cases');
    expect(safeInternalRedirect('/')).toBe('/');
  });

  it('returns null for empty / missing input', () => {
    expect(safeInternalRedirect(null)).toBeNull();
    expect(safeInternalRedirect(undefined)).toBeNull();
    expect(safeInternalRedirect('')).toBeNull();
  });

  it('rejects protocol-relative and backslash paths that browsers treat as external', () => {
    expect(safeInternalRedirect('//evil.com')).toBeNull();
    expect(safeInternalRedirect('/\\evil.com')).toBeNull();
  });

  it('rejects absolute and scheme URLs', () => {
    expect(safeInternalRedirect('https://evil.com')).toBeNull();
    expect(safeInternalRedirect('javascript:alert(1)')).toBeNull();
  });
});
