import { describe, it, expect } from 'vitest';
import { cn } from './utils';

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
