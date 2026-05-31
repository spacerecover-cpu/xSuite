import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search } from 'lucide-react';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition';
import { useListboxKeyboard } from '../../hooks/useListboxKeyboard';

export interface PhoneCountry {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
}

interface PhoneInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  countries: PhoneCountry[];
  selectedCountryId?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  id?: string;
  hint?: string;
  name?: string;
}

function findPhoneCodeForCountry(countries: PhoneCountry[], countryId: string): string {
  const country = countries.find((c) => c.id === countryId);
  return country?.phone_code || '';
}

function parsePhoneValue(
  value: string,
  countries: PhoneCountry[]
): { dialCode: string; localNumber: string } {
  if (!value || !value.startsWith('+')) {
    return { dialCode: '', localNumber: value || '' };
  }

  const sortedCodes = countries
    .filter((c) => c.phone_code)
    .map((c) => c.phone_code!)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (value.startsWith(code)) {
      const rest = value.slice(code.length).replace(/^\s+/, '');
      return { dialCode: code, localNumber: rest };
    }
  }

  return { dialCode: '', localNumber: value };
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      label,
      value,
      onChange,
      countries,
      selectedCountryId,
      placeholder = '',
      disabled = false,
      error,
      required = false,
      id,
      hint,
      name,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [manualDialCode, setManualDialCode] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const portalDropdownRef = useRef<HTMLDivElement>(null);

    const listboxId = useId();

    const { labelProps, controlProps, errorProps, hintProps } = useFieldA11y({
      id,
      hasError: !!error,
      hasHint: !error && !!hint,
      required,
    });

    const parsed = parsePhoneValue(value, countries);

    const activeDialCode = (() => {
      if (manualDialCode !== null) return manualDialCode;
      if (parsed.dialCode) return parsed.dialCode;
      if (selectedCountryId) return findPhoneCodeForCountry(countries, selectedCountryId);
      return '';
    })();

    const localNumber = parsed.dialCode
      ? parsed.localNumber
      : value?.startsWith('+')
      ? ''
      : value || '';

    const prevCountryIdRef = useRef(selectedCountryId);
    useEffect(() => {
      if (selectedCountryId && selectedCountryId !== prevCountryIdRef.current) {
        setManualDialCode(null);
      }
      prevCountryIdRef.current = selectedCountryId;
    }, [selectedCountryId]);

    const buildFullValue = useCallback((dialCode: string, local: string) => {
      if (!dialCode && !local) return '';
      if (!dialCode) return local;
      if (!local) return dialCode;
      return `${dialCode} ${local}`;
    }, []);

    const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newLocal = e.target.value;
      onChange(buildFullValue(activeDialCode, newLocal));
    };

    const closeDropdown = useCallback(() => {
      setIsDropdownOpen(false);
      setSearchTerm('');
    }, []);

    const handleDialCodeSelect = (phoneCode: string) => {
      setManualDialCode(phoneCode);
      onChange(buildFullValue(phoneCode, localNumber));
      closeDropdown();
    };

    const uniqueCountries = countries.filter((c) => c.phone_code);

    const filteredCountries = uniqueCountries.filter((c) => {
      const term = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term) ||
        (c.phone_code && c.phone_code.includes(term))
      );
    });

    const getOptionId = useCallback(
      (index: number) => {
        const country = filteredCountries[index];
        return country ? `${listboxId}-opt-${country.id}` : '';
      },
      [filteredCountries, listboxId]
    );

    const { activeIndex, setActiveIndex, activeOptionId, onKeyDown } = useListboxKeyboard({
      open: isDropdownOpen,
      itemCount: filteredCountries.length,
      onOpen: () => setIsDropdownOpen(true),
      onClose: () => {
        closeDropdown();
        triggerRef.current?.focus();
      },
      onSelect: (index) => {
        const country = filteredCountries[index];
        if (country?.phone_code) handleDialCodeSelect(country.phone_code);
      },
      getOptionId,
    });

    const { floatingStyle } = useAnchoredPosition({
      open: isDropdownOpen,
      anchorRef: triggerRef,
      matchWidth: false,
      width: 260,
      gap: 4,
    });

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isInsideContainer = containerRef.current?.contains(target);
        const isInsidePortal = portalDropdownRef.current?.contains(target);
        if (!isInsideContainer && !isInsidePortal) {
          closeDropdown();
        }
      };

      if (isDropdownOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isDropdownOpen, closeDropdown]);

    useEffect(() => {
      if (isDropdownOpen && activeIndex >= 0 && listRef.current) {
        const el = listRef.current.children[activeIndex] as HTMLElement;
        el?.scrollIntoView?.({ block: 'nearest' });
      }
    }, [activeIndex, isDropdownOpen]);

    const selectedCountryForDisplay = activeDialCode
      ? uniqueCountries.find((c) => c.phone_code === activeDialCode)
      : null;

    return (
      <div className="w-full" ref={containerRef}>
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
          className={`flex border rounded-md overflow-hidden transition-all ${
            error
              ? 'border-danger'
              : isDropdownOpen
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-slate-300 hover:border-slate-400'
          } ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
        >
          <button
            type="button"
            ref={triggerRef}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-controls={listboxId}
            disabled={disabled}
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-2 bg-slate-50 border-r border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors shrink-0 ${
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
          >
            {selectedCountryForDisplay && (
              <span className="text-xs text-slate-500 font-normal">
                {selectedCountryForDisplay.code}
              </span>
            )}
            <span>{activeDialCode || t('ui.phoneInput.dialCodePlaceholder')}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <input
            type="tel"
            ref={ref}
            {...controlProps}
            {...(label ? {} : placeholder ? { 'aria-label': placeholder } : {})}
            name={name}
            value={localNumber}
            onChange={handleLocalNumberChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`flex-1 px-3 py-2 text-sm focus:outline-none bg-white min-w-0 ${
              disabled ? 'bg-slate-100 cursor-not-allowed' : ''
            }`}
          />
        </div>

        {error ? (
          <p {...errorProps} className="mt-1 text-sm text-danger">
            {error}
          </p>
        ) : hint ? (
          <p {...hintProps} className="mt-1 text-sm text-slate-500">
            {hint}
          </p>
        ) : null}

        {isDropdownOpen &&
          createPortal(
            <div
              ref={portalDropdownRef}
              className="bg-surface border border-slate-300 rounded-lg shadow-lg overflow-hidden"
              style={floatingStyle}
            >
              <div className="p-2 border-b border-slate-200">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded
                    aria-controls={listboxId}
                    aria-activedescendant={activeOptionId}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder={t('ui.phoneInput.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setActiveIndex(-1);
                    }}
                    onKeyDown={onKeyDown}
                  />
                </div>
              </div>

              <div
                ref={listRef}
                role="listbox"
                id={listboxId}
                className="max-h-60 overflow-y-auto"
                style={{ scrollbarWidth: 'thin' }}
              >
                {filteredCountries.length === 0 ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="px-3 py-6 text-center text-slate-500 text-sm"
                  >
                    {t('ui.phoneInput.noResults')}
                  </div>
                ) : (
                  filteredCountries.map((country, index) => {
                    const isSelected = country.phone_code === activeDialCode;
                    return (
                      <div
                        key={`${country.id}-${country.phone_code}`}
                        role="option"
                        id={`${listboxId}-opt-${country.id}`}
                        aria-selected={isSelected}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-sm ${
                          activeIndex === index
                            ? 'bg-primary/5 text-primary'
                            : isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-900 hover:bg-slate-50'
                        }`}
                        onClick={() => handleDialCodeSelect(country.phone_code!)}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-6">{country.code}</span>
                          <span>{country.name}</span>
                        </span>
                        <span className="text-slate-500 font-medium">{country.phone_code}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {filteredCountries.length > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center"
                >
                  {t('ui.phoneInput.countryCount', { count: filteredCountries.length })}
                </div>
              )}
            </div>,
            document.body
          )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
