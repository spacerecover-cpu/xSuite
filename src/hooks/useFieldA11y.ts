import { useId } from 'react';

interface UseFieldA11yOptions {
  /** Caller/RHF-supplied id; falls back to a generated useId() base. */
  id?: string;
  hasError?: boolean;
  hasHint?: boolean;
  required?: boolean;
}

interface ControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  'aria-describedby'?: string;
}

interface UseFieldA11yResult {
  fieldId: string;
  errorId: string;
  hintId: string;
  labelProps: { htmlFor: string };
  controlProps: ControlProps;
  errorProps: { id: string; role: 'alert' };
  hintProps: { id: string };
}

/**
 * Derives the ids and ARIA wiring for a single labelable form control plus its
 * optional hint and error messages. `aria-invalid` / `aria-required` are emitted
 * only as `true` (omitted otherwise, never `false`), and `aria-describedby` is
 * omitted entirely when there is no hint or error — so consumers that pass no
 * error/hint get zero extra DOM attributes.
 */
export function useFieldA11y(opts: UseFieldA11yOptions): UseFieldA11yResult {
  const { id, hasError, hasHint, required } = opts;
  const generatedId = useId();
  const base = id ?? generatedId;

  const fieldId = base;
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;

  const describedBy =
    [hasHint && hintId, hasError && errorId].filter(Boolean).join(' ') || undefined;

  const controlProps: ControlProps = {
    id: fieldId,
    ...(hasError ? { 'aria-invalid': true } : {}),
    ...(required ? { 'aria-required': true } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
  };

  return {
    fieldId,
    errorId,
    hintId,
    labelProps: { htmlFor: fieldId },
    controlProps,
    errorProps: { id: errorId, role: 'alert' },
    hintProps: { id: hintId },
  };
}
