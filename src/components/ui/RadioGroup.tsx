import React from 'react';
import { useFieldA11y } from '../../hooks/useFieldA11y';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface RadioGroupProps {
  /** Shared name binding all radios in the group. */
  name: string;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Base id for the group; per-option ids derive from it. */
  id?: string;
  className?: string;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    { name, label, error, hint, required, options, value, defaultValue, onChange, id, className = '' },
    ref
  ) => {
    const { fieldId, labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id,
      hasError: !!error,
      hasHint: !!hint,
      required,
    });

    const labelId = `${fieldId}-label`;
    const { id: _omitId, ...groupAria } = controlProps;

    return (
      <div ref={ref} className={`w-full ${className}`}>
        {label && (
          <span {...labelProps} id={labelId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
            {required && (
              <span aria-hidden="true" className="text-danger ms-1">
                *
              </span>
            )}
          </span>
        )}
        <div role="radiogroup" aria-labelledby={label ? labelId : undefined} {...groupAria} className="space-y-1.5">
          {options.map((opt) => {
            const optionId = `${fieldId}-${opt.value}`;
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={optionId}
                  name={name}
                  value={opt.value}
                  disabled={opt.disabled}
                  required={required}
                  {...(value !== undefined
                    ? { checked: value === opt.value, onChange: () => onChange?.(opt.value) }
                    : {
                        defaultChecked: defaultValue === opt.value,
                        onChange: () => onChange?.(opt.value),
                      })}
                  className={`h-4 w-4 border-slate-300 text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    error ? 'border-danger' : ''
                  }`}
                />
                <label htmlFor={optionId} className="text-sm text-slate-700 select-none">
                  {opt.label}
                </label>
              </div>
            );
          })}
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

RadioGroup.displayName = 'RadioGroup';
