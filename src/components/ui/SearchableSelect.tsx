import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  id: string;
  name: string;
  disabled?: boolean;
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
  clearable?: boolean;
  usePortal?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  required = false,
  disabled = false,
  emptyMessage = 'No options available',
  onAddNew,
  addNewLabel = 'Add New',
  clearable = true,
  usePortal = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalDropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  const filteredOptions = options.filter((option) =>
    option.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current && containerRef.current.contains(target);
      const isInsidePortalDropdown = portalDropdownRef.current && portalDropdownRef.current.contains(target);

      if (!isInsideContainer && !isInsidePortalDropdown) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const calculateDropdownPosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dropdownHeight = 300;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
          setDropdownPosition('top');
        } else {
          setDropdownPosition('bottom');
        }

        if (usePortal) {
          const styles: React.CSSProperties = {
            position: 'fixed',
            width: `${rect.width}px`,
            left: `${rect.left}px`,
            zIndex: 9999,
          };

          if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            styles.bottom = `${window.innerHeight - rect.top}px`;
          } else {
            styles.top = `${rect.bottom}px`;
          }

          setDropdownStyles(styles);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      searchInputRef.current?.focus();
      calculateDropdownPosition();
      window.addEventListener('scroll', calculateDropdownPosition, true);
      window.addEventListener('resize', calculateDropdownPosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', calculateDropdownPosition, true);
      window.removeEventListener('resize', calculateDropdownPosition);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        break;
    }
  };

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  const handleAddNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddNew) {
      onAddNew();
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>

      <div
        className={`relative w-full px-3 py-2 border rounded-lg cursor-pointer transition-all ${
          disabled
            ? 'bg-slate-100 border-slate-300 cursor-not-allowed'
            : isOpen
            ? 'border-primary ring-2 ring-primary ring-opacity-20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
      >
        <div className="flex items-center justify-between">
          <span className={selectedOption ? 'text-slate-900' : 'text-slate-400'}>
            {selectedOption ? selectedOption.name : placeholder}
          </span>
          <div className="flex items-center gap-1">
            {value && !disabled && clearable && (
              <button
                onClick={handleClear}
                className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                type="button"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
      </div>

      {isOpen && !usePortal && (
        <div
          className={`absolute z-50 w-full bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden ${
            dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                ref={searchInputRef}
                type="text"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          <div
            ref={dropdownRef}
            className="max-h-60 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-slate-500 text-sm">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.id}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    option.disabled
                      ? 'text-slate-400 cursor-not-allowed'
                      : highlightedIndex === index
                      ? 'bg-primary/5 text-primary'
                      : option.id === value
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-900 hover:bg-slate-50'
                  }`}
                  onClick={() => !option.disabled && handleSelect(option.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
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
                className="w-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-md transition-colors text-left"
              >
                + {addNewLabel}
              </button>
            </div>
          )}

          {filteredOptions.length > 0 && !onAddNew && (
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
              {filteredOptions.length} {filteredOptions.length === 1 ? 'option' : 'options'}
            </div>
          )}
        </div>
      )}

      {isOpen && usePortal && createPortal(
        <div
          ref={portalDropdownRef}
          className="bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden"
          style={dropdownStyles}
        >
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                ref={searchInputRef}
                type="text"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          <div
            ref={dropdownRef}
            className="max-h-60 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-slate-500 text-sm">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.id}
                  className={`px-3 py-2 cursor-pointer transition-colors ${
                    option.disabled
                      ? 'text-slate-400 cursor-not-allowed'
                      : highlightedIndex === index
                      ? 'bg-primary/5 text-primary'
                      : option.id === value
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-900 hover:bg-slate-50'
                  }`}
                  onClick={() => !option.disabled && handleSelect(option.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
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
                className="w-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-md transition-colors text-left"
              >
                + {addNewLabel}
              </button>
            </div>
          )}

          {filteredOptions.length > 0 && !onAddNew && (
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
              {filteredOptions.length} {filteredOptions.length === 1 ? 'option' : 'options'}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
