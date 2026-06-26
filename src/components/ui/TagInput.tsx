import { useState, forwardRef, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useFieldA11y } from '../../hooks/useFieldA11y';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  name?: string;
  error?: string;
}

/**
 * Free-typed chip input — type a value and press Enter / comma to add it as a
 * removable chip. Unlike ChipInput it imposes no format (e.g. email) validation;
 * it is the generic tag entry used for symptom chips on the Diagnostic tab.
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(
  ({ value, onChange, placeholder, label, disabled = false, id, required, name, error }, ref) => {
    const { t } = useTranslation();
    const [inputValue, setInputValue] = useState('');

    const { labelProps, controlProps, errorProps } = useFieldA11y({
      id,
      hasError: !!error,
      hasHint: false,
      required,
    });

    const resolvedPlaceholder =
      placeholder ?? t('ui.tagInput.placeholder', { defaultValue: 'Type and press Enter…' });

    const addTag = (raw: string) => {
      const tag = raw.trim();
      if (!tag || value.includes(tag)) {
        setInputValue('');
        return;
      }
      onChange([...value, tag]);
      setInputValue('');
    };

    const removeTag = (tag: string) => onChange(value.filter((v) => v !== tag));

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    };

    const handleBlur = () => {
      if (inputValue.trim()) addTag(inputValue);
    };

    return (
      <div>
        {label && (
          <label {...labelProps} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
            {required && (
              <span aria-hidden="true" className="text-danger ms-1">
                *
              </span>
            )}
          </label>
        )}
        <div
          className={`min-h-[38px] px-2.5 py-1.5 border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-primary ${
            error ? 'border-danger bg-danger-muted/40' : 'border-slate-300 bg-white'
          } ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-wrap gap-1.5 items-center">
            {value.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 ps-2 pe-1 py-0.5 bg-surface-muted text-slate-700 rounded-md text-sm"
              >
                <span>{tag}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                    aria-label={t('ui.tagInput.remove', { defaultValue: 'Remove {{tag}}', tag })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            <input
              ref={ref}
              type="text"
              {...controlProps}
              {...(label ? {} : { 'aria-label': resolvedPlaceholder })}
              name={name}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={value.length === 0 ? resolvedPlaceholder : ''}
              disabled={disabled}
              className="flex-1 min-w-[120px] outline-none bg-transparent text-sm py-0.5"
            />
          </div>
        </div>
        {error && (
          <p {...errorProps} className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

TagInput.displayName = 'TagInput';
