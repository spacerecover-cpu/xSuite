import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { cn } from '../../lib/utils';

interface FieldControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  'aria-describedby'?: string;
  /** Label element id — for group children that associate via aria-labelledby. */
  'aria-labelledby': string;
}

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  id?: string;
  className?: string;
  children: (control: FieldControlProps) => React.ReactNode;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, error, required, hint, id, className, children }, ref) => {
    const { fieldId, labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id,
      hasError: !!error,
      hasHint: !!hint,
      required,
    });

    const labelId = `${fieldId}-label`;

    const control: FieldControlProps = {
      ...controlProps,
      'aria-labelledby': labelId,
    };

    return (
      <div ref={ref} className={cn('space-y-1.5', className)}>
        <label {...labelProps} id={labelId} className="block text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span aria-hidden="true" className="text-danger ml-0.5">
              *
            </span>
          )}
        </label>
        {children(control)}
        {hint && !error && (
          <p {...hintProps} className="text-xs text-slate-500">
            {hint}
          </p>
        )}
        {error && (
          <p {...errorProps} className="text-xs text-danger flex items-center gap-1">
            <AlertCircle aria-hidden="true" className="w-3 h-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
