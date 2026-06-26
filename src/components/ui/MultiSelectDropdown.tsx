import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, X, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFieldA11y } from '../../hooks/useFieldA11y';
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition';
import { useListboxKeyboard } from '../../hooks/useListboxKeyboard';

const multiSelectSizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2' } as const;

interface Option {
  id: string;
  name: string;
}

interface MultiSelectDropdownProps {
  label: string;
  value: string[];
  onChange: (selectedIds: string[]) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  usePortal?: boolean;
  id?: string;
  error?: string;
  hint?: string;
  name?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const MultiSelectDropdown = React.forwardRef<HTMLDivElement, MultiSelectDropdownProps>(
  (
    {
      label,
      value,
      onChange,
      options,
      placeholder,
      required = false,
      usePortal = false,
      id,
      error,
      hint,
      name,
      disabled = false,
      size = 'md',
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

    const resolvedPlaceholder = placeholder ?? t('ui.select.selectItems');

    const filteredOptions = options.filter((option) =>
      option.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOptions = options.filter((opt) => value.includes(opt.id));

    const closeDropdown = useCallback(() => {
      setIsOpen(false);
      setSearchTerm('');
    }, []);

    const toggleOption = useCallback(
      (optionId: string) => {
        if (value.includes(optionId)) {
          onChange(value.filter((vid) => vid !== optionId));
        } else {
          onChange([...value, optionId]);
        }
      },
      [value, onChange]
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
      multiple: true,
      onOpen: () => setIsOpen(true),
      onClose: () => {
        closeDropdown();
        triggerRef.current?.focus();
      },
      onSelect: (index) => {
        const option = filteredOptions[index];
        if (option) toggleOption(option.id);
      },
      getOptionId,
    });

    const { floatingStyle, placement } = useAnchoredPosition({
      open: isOpen,
      anchorRef: triggerRef,
      matchWidth: true,
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

    const removeOption = (optionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(value.filter((vid) => vid !== optionId));
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
              aria-label={t('ui.select.searchPlaceholder')}
              className="w-full ps-8 pe-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder={t('ui.select.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={(e) => {
                // Let a literal space type into the filter; the shared listbox
                // handler preventDefaults Space (toggle), which would otherwise
                // swallow spaces in multi-word option names.
                if (e.key === ' ') return;
                onKeyDown(e);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-multiselectable="true"
          className="max-h-60 overflow-y-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          {filteredOptions.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              className="px-3 py-6 text-center text-slate-500 text-sm"
            >
              {searchTerm ? t('ui.select.noMatches') : t('ui.noOptions')}
            </div>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = value.includes(option.id);
              return (
                <div
                  key={option.id}
                  role="option"
                  id={`${listboxId}-opt-${option.id}`}
                  aria-selected={isSelected}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                    activeIndex === index
                      ? 'bg-primary/5'
                      : isSelected
                      ? 'bg-primary/5'
                      : 'hover:bg-slate-50'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOption(option.id);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span
                    className={`text-sm ${
                      isSelected ? 'text-primary font-medium' : 'text-slate-700'
                    }`}
                  >
                    {option.name}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-primary" />}
                </div>
              );
            })
          )}
        </div>

        {filteredOptions.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center"
          >
            {t('ui.selectedCount', { selected: value.length, total: options.length })}
          </div>
        )}
      </>
    );

    return (
      <div className="relative" ref={containerRef}>
        {label !== '' && (
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
          {...(label !== '' ? {} : { 'aria-label': resolvedPlaceholder })}
          data-name={name}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (disabled) return;
            // When closed, Enter/Space/ArrowDown open the panel from the trigger
            // (the shared hook only opens on ArrowDown). ArrowDown is forwarded so
            // the hook handles the open transition consistently.
            if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setIsOpen(true);
              return;
            }
            onKeyDown(e);
          }}
          className={cn(
            'w-full min-h-[42px] border rounded-lg bg-surface transition-all',
            multiSelectSizeClasses[size],
            disabled
              ? 'bg-slate-100 border-slate-300 cursor-not-allowed'
              : error
              ? 'border-danger cursor-pointer'
              : isOpen
              ? 'border-primary ring-2 ring-primary/20 cursor-pointer'
              : 'border-slate-300 hover:border-slate-400 cursor-pointer'
          )}
        >
          {selectedOptions.length === 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{resolvedPlaceholder}</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {selectedOptions.map((option) => (
                  <span
                    key={option.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-md"
                  >
                    {option.name}
                    <button
                      type="button"
                      aria-label={t('ui.select.removeItem', { name: option.name })}
                      onClick={(e) => removeOption(option.id, e)}
                      className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          )}
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

MultiSelectDropdown.displayName = 'MultiSelectDropdown';
