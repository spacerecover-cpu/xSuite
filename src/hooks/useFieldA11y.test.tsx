import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFieldA11y } from './useFieldA11y';

describe('useFieldA11y', () => {
  it('associates the label with the control (htmlFor === controlProps.id)', () => {
    const { result } = renderHook(() => useFieldA11y({}));
    expect(result.current.labelProps.htmlFor).toBe(result.current.controlProps.id);
    expect(result.current.controlProps.id).toBe(result.current.fieldId);
  });

  it('respects a passed id and derives error/hint ids from it', () => {
    const { result } = renderHook(() =>
      useFieldA11y({ id: 'email', hasError: true, hasHint: true })
    );
    expect(result.current.fieldId).toBe('email');
    expect(result.current.controlProps.id).toBe('email');
    expect(result.current.labelProps.htmlFor).toBe('email');
    expect(result.current.errorId).toBe('email-error');
    expect(result.current.hintId).toBe('email-hint');
    expect(result.current.errorProps.id).toBe('email-error');
    expect(result.current.hintProps.id).toBe('email-hint');
  });

  it('falls back to a generated useId base when no id is passed', () => {
    const { result } = renderHook(() => useFieldA11y({}));
    const base = result.current.fieldId;
    expect(typeof base).toBe('string');
    expect(base.length).toBeGreaterThan(0);
    expect(result.current.errorId).toBe(`${base}-error`);
    expect(result.current.hintId).toBe(`${base}-hint`);
  });

  it('errorProps always carries role="alert"', () => {
    const { result } = renderHook(() => useFieldA11y({ hasError: true }));
    expect(result.current.errorProps.role).toBe('alert');
  });

  describe('aria-describedby', () => {
    it('joins hint then error when both present', () => {
      const { result } = renderHook(() =>
        useFieldA11y({ id: 'f', hasError: true, hasHint: true })
      );
      expect(result.current.controlProps['aria-describedby']).toBe('f-hint f-error');
    });

    it('is the hint id only when hint-only', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f', hasHint: true }));
      expect(result.current.controlProps['aria-describedby']).toBe('f-hint');
    });

    it('is the error id only when error-only', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f', hasError: true }));
      expect(result.current.controlProps['aria-describedby']).toBe('f-error');
    });

    it('is omitted (undefined) when neither hint nor error', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f' }));
      expect(result.current.controlProps['aria-describedby']).toBeUndefined();
      expect('aria-describedby' in result.current.controlProps).toBe(false);
    });
  });

  describe('aria-invalid', () => {
    it('is true only when hasError', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f', hasError: true }));
      expect(result.current.controlProps['aria-invalid']).toBe(true);
    });

    it('is omitted (undefined, never false) when no error', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f' }));
      expect(result.current.controlProps['aria-invalid']).toBeUndefined();
      expect('aria-invalid' in result.current.controlProps).toBe(false);
    });
  });

  describe('aria-required', () => {
    it('is true only when required', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f', required: true }));
      expect(result.current.controlProps['aria-required']).toBe(true);
    });

    it('is omitted (undefined, never false) when not required', () => {
      const { result } = renderHook(() => useFieldA11y({ id: 'f' }));
      expect(result.current.controlProps['aria-required']).toBeUndefined();
      expect('aria-required' in result.current.controlProps).toBe(false);
    });
  });
});
