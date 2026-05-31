import { useState, forwardRef, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { isValidEmail } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';

interface ChipInputProps {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  name?: string;
  error?: string;
}

export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(
  (
    { value, onChange, placeholder, label, disabled = false, id, required, name, error },
    ref
  ) => {
    const { t } = useTranslation();
    const [inputValue, setInputValue] = useState('');
    const [internalError, setInternalError] = useState<string | null>(null);

    // Controlled (external) error wins over internal validation.
    const activeError = error ?? internalError ?? undefined;

    const { labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id,
      hasError: !!activeError,
      hasHint: !activeError,
      required,
    });

    const resolvedPlaceholder = placeholder ?? t('ui.chipInput.placeholder');

    const addEmail = (email: string) => {
      const trimmedEmail = email.trim();

      if (!trimmedEmail) {
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        setInternalError(t('ui.chipInput.invalidEmail'));
        return;
      }

      if (value.includes(trimmedEmail)) {
        setInternalError(t('ui.chipInput.duplicateEmail'));
        return;
      }

      onChange([...value, trimmedEmail]);
      setInputValue('');
      setInternalError(null);
    };

    const removeEmail = (emailToRemove: string) => {
      onChange(value.filter((email) => email !== emailToRemove));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addEmail(inputValue);
      } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeEmail(value[value.length - 1]);
      } else if (e.key === ',' || e.key === ';') {
        e.preventDefault();
        addEmail(inputValue);
      }
    };

    const handleBlur = () => {
      if (inputValue.trim()) {
        addEmail(inputValue);
      }
    };

    return (
      <div>
        {label && (
          <label {...labelProps} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
            {required && (
              <span aria-hidden="true" className="text-danger ml-1">
                *
              </span>
            )}
          </label>
        )}
        <div
          className={`min-h-[42px] px-3 py-2 border rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-primary ${
            activeError ? 'border-danger/60 bg-danger-muted' : 'border-slate-300 bg-white'
          } ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-wrap gap-2 items-center">
            {value.map((email, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 bg-info-muted text-info rounded-md text-sm"
              >
                <span>{email}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="hover:bg-info/20 rounded-full p-0.5 transition-colors"
                    aria-label={t('ui.chipInput.removeEmail', { email })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <input
              ref={ref}
              type="text"
              {...controlProps}
              {...(label ? {} : { 'aria-label': resolvedPlaceholder })}
              name={name}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setInternalError(null);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={value.length === 0 ? resolvedPlaceholder : ''}
              disabled={disabled}
              className="flex-1 min-w-[150px] outline-none bg-transparent text-sm"
            />
          </div>
        </div>
        {activeError ? (
          <p {...errorProps} className="mt-1 text-xs text-danger">
            {activeError}
          </p>
        ) : (
          <p {...hintProps} className="mt-1 text-xs text-slate-500">
            {t('ui.chipInput.hint')}
          </p>
        )}
      </div>
    );
  }
);

ChipInput.displayName = 'ChipInput';
