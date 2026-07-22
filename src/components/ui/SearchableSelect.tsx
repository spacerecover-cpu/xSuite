import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FLOATING_LABEL_CLS } from './Input';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition';
import { useListboxKeyboard } from '../../hooks/useListboxKeyboard';

// md matches the 36px standard field height set in ui/Input.tsx.
const triggerSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'h-9 px-3 text-sm' } as const;

interface Option {
  id: string;
  name: string;
  disabled?: boolean;
  /** Hidden search haystack (e.g. a customer's email/phone/number) — matched
   *  by the filter but never rendered, so "find by anything" pickers work. */
  keywords?: string;
}

interface SearchableSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  usePortal?: boolean;
  id?: string;
  error?: string;
  hint?: string;
  name?: string;
  className?: string;
  size?: 'sm' | 'md';
  /** Opt-in: render the label as a notch on the trigger's top border. */
  floatingLabel?: boolean;
  /** Opt-in: render the trigger text at the smallest size while the default
   *  (empty) value is selected — i.e. placeholder/"No X" options read quietly. */
  shrinkDefaultValue?: boolean;
  /** Reports the live filter term (and '' on close) so consumers can fetch
   *  options server-side — required beyond PostgREST's 1000-row cap. */
  onSearchTermChange?: (term: string) => void;
}

export const SearchableSelect = React.forwardRef<HTMLDivElement, SearchableSelectProps>(
  (
    {
      label,
      value,
      onChange,
      options,
      placeholder,
      required = false,
      disabled = false,
      emptyMessage,
      onAddNew,
      addNewLabel,
      usePortal = false,
      id,
      error,
      hint,
      name,
      className,
      size = 'md',
      floatingLabel = false,
      shrinkDefaultValue = false,
      onSearchTermChange,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
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

    const resolvedPlaceholder = placeholder ?? t('ui.select.placeholder');
    const resolvedEmptyMessage = emptyMessage ?? t('ui.noOptions');
    const resolvedAddNewLabel = addNewLabel ?? t('ui.select.addNew');

    const selectedOption = options.find((opt) => opt.id === value);

    const filteredOptions = options.filter((option) =>
      `${option.name ?? ''} ${option.keywords ?? ''}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const closeDropdown = useCallback(() => {
      setIsOpen(false);
      setSearchTerm('');
      onSearchTermChange?.('');
    }, [onSearchTermChange]);

    const handleSelect = useCallback(
      (optionId: string) => {
        onChange(optionId);
        closeDropdown();
        triggerRef.current?.focus();
      },
      [onChange, closeDropdown]
    );

    const getOptionId = useCallback(
      (index: number) => {
        const option = filteredOptions[index];
        return option ? `${listboxId}-opt-${option.id}` : '';
      },
      [filteredOptions, listboxId]
    );

    const { activeIndex, setActiveIndex, activeOptionId, onKeyDown } = useListboxKeyboard({
      open: isOpen,
      itemCount: filteredOptions.length,
      onOpen: () => setIsOpen(true),
      onClose: () => {
        closeDropdown();
        triggerRef.current?.focus();
      },
      onSelect: (index) => {
        const option = filteredOptions[index];
        if (option && !option.disabled) handleSelect(option.id);
      },
      getOptionId,
    });

    const { floatingStyle, placement } = useAnchoredPosition({
      open: isOpen,
      anchorRef: triggerRef,
      matchWidth: true,
      gap: 0,
    });

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isInsideContainer = containerRef.current?.contains(target);
        const isInsidePortal = portalDropdownRef.current?.contains(target);
        if (!isInsideContainer && !isInsidePortal) {
          closeDropdown();
          // Defer past the click's default focus handling (which would
          // otherwise blur the active element back to <body>).
          setTimeout(() => triggerRef.current?.focus(), 0);
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen, closeDropdown]);

    useEffect(() => {
      if (isOpen && activeIndex >= 0 && listRef.current) {
        const el = listRef.current.children[activeIndex] as HTMLElement;
        el?.scrollIntoView?.({ block: 'nearest' });
      }
    }, [activeIndex, isOpen]);

    const handleAddNew = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onAddNew) {
        onAddNew();
        closeDropdown();
      }
    };

    const renderListbox = () => (
      <>
        <div className="p-2 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              className={`w-full ps-8 pe-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${floatingLabel ? 'text-xs placeholder:text-xs' : 'text-sm'}`}
              placeholder={t('ui.select.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                onSearchTermChange?.(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={(e) => {
                // Let a literal space type into the filter; the shared
                // listbox handler preventDefaults Space (select), which would
                // otherwise swallow spaces in multi-word option names.
                if (e.key === ' ') return;
                onKeyDown(e);
              }}
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
          {filteredOptions.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              className={`px-3 py-6 text-center text-slate-500 ${floatingLabel ? 'text-xs' : 'text-sm'}`}
            >
              {resolvedEmptyMessage}
            </div>
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.id}
                role="option"
                id={`${listboxId}-opt-${option.id}`}
                aria-selected={option.id === value}
                aria-disabled={option.disabled || undefined}
                className={`px-3 py-2 cursor-pointer transition-colors ${floatingLabel ? 'text-xs' : ''} ${
                  option.disabled
                    ? 'text-slate-400 cursor-not-allowed'
                    : activeIndex === index
                    ? 'bg-primary/5 text-primary'
                    : option.id === value
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-900 hover:bg-slate-50'
                }`}
                onClick={() => !option.disabled && handleSelect(option.id)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.name}
              </div>
            ))
          )}
        </div>

        {onAddNew && (
          <div className="p-2 border-t border-slate-200">
            <button
              type="button"
              onClick={handleAddNew}
              className={`w-full px-3 py-2 font-medium text-primary hover:bg-primary/5 rounded-md transition-colors text-start ${floatingLabel ? 'text-xs' : 'text-sm'}`}
            >
              + {resolvedAddNewLabel}
            </button>
          </div>
        )}

        {filteredOptions.length > 0 && !onAddNew && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center"
          >
            {t('ui.select.optionCount', { count: filteredOptions.length })}
          </div>
        )}
      </>
    );

    return (
      <div className={`relative ${className ?? ''}`} ref={containerRef}>
        {label && !floatingLabel && (
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
          ref={(node) => {
            triggerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          {...controlProps}
          {...(label ? {} : { 'aria-label': resolvedPlaceholder })}
          data-name={name}
          className={cn(
            'relative w-full border rounded-lg cursor-pointer transition-all',
            triggerSizeClasses[size],
            disabled
              ? 'bg-slate-100 border-slate-300 cursor-not-allowed'
              : error
              ? 'border-danger'
              : isOpen
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-slate-300 hover:border-slate-400'
          )}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={onKeyDown}
          tabIndex={disabled ? -1 : 0}
        >
          <div className="flex h-full items-center justify-between gap-2">
            <span className={cn(
              'truncate',
              selectedOption ? 'text-slate-900' : 'text-slate-400',
              shrinkDefaultValue && !value && 'text-xxs',
            )}>
              {selectedOption ? selectedOption.name : resolvedPlaceholder}
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {label && floatingLabel && (
          <label {...labelProps} className={FLOATING_LABEL_CLS}>
            {label}
            {required && <span aria-hidden="true" className="text-danger ms-0.5">*</span>}
          </label>
        )}

        {error ? (
          <p {...errorProps} className="mt-1 text-xs text-danger flex items-center gap-1"><AlertCircle aria-hidden="true" className="w-3 h-3 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p {...hintProps} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        ) : null}

        {isOpen && !usePortal && (
          <div
            className={`absolute z-popover w-full bg-surface border border-slate-300 rounded-lg shadow-lg overflow-hidden ${
              placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            {renderListbox()}
          </div>
        )}

        {isOpen &&
          usePortal &&
          createPortal(
            <div
              ref={portalDropdownRef}
              className="bg-surface border border-slate-300 rounded-lg shadow-lg overflow-hidden"
              style={floatingStyle}
            >
              {renderListbox()}
            </div>,
            document.body
          )}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';
