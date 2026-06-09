import React from 'react';
import { useFieldA11y } from '../../hooks/useFieldA11y';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    const { labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id: props.id,
      hasError: !!error,
      hasHint: !!hint,
      required: props.required,
    });

    return (
      <div className="w-full">
        <div className="flex items-start gap-2">
          <input
            ref={ref}
            type="checkbox"
            {...controlProps}
            {...props}
            className={`mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              error ? 'border-danger' : ''
            } ${className}`}
          />
          {label && (
            <label {...labelProps} className="text-sm font-medium text-slate-700 select-none">
              {label}
              {props.required && (
                <span aria-hidden="true" className="text-danger ms-1">
                  *
                </span>
              )}
            </label>
          )}
        </div>
        {error && (
          <p {...errorProps} className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
        {hint && (
          <p {...hintProps} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
