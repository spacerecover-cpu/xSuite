import React, { useState, useEffect, useRef, useId } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type { AccountingLocale, AccountingLocaleFormData } from '../../types/accountingLocale';

interface LocaleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AccountingLocaleFormData) => void;
  editingLocale: AccountingLocale | null;
  isSubmitting: boolean;
}

const DEFAULT_FORM: AccountingLocaleFormData = {
  name: '',
  locale_code: '',
  currency_code: '',
  currency_symbol: '',
  decimal_places: 2,
  currency_position: 'before',
  decimal_separator: '.',
  thousands_separator: ',',
  date_format: 'DD/MM/YYYY',
  number_format: '',
  is_default: false,
};

export const LocaleFormModal: React.FC<LocaleFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingLocale,
  isSubmitting,
}) => {
  const [formData, setFormData] = useState<AccountingLocaleFormData>(DEFAULT_FORM);
  const nameRef = useRef<HTMLInputElement>(null);
  const decimalPlacesId = useId();
  const currencyPositionId = useId();
  const decimalSeparatorId = useId();
  const thousandsSeparatorId = useId();
  const dateFormatId = useId();

  useEffect(() => {
    if (editingLocale) {
      setFormData({
        name: editingLocale.name,
        locale_code: editingLocale.locale_code,
        currency_code: editingLocale.currency_code || '',
        currency_symbol: editingLocale.currency_symbol || '',
        decimal_places: editingLocale.decimal_places ?? 2,
        currency_position: (editingLocale.currency_position as 'before' | 'after') || 'before',
        decimal_separator: editingLocale.decimal_separator || '.',
        thousands_separator: editingLocale.thousands_separator || ',',
        date_format: editingLocale.date_format || 'DD/MM/YYYY',
        number_format: editingLocale.number_format || '',
        is_default: editingLocale.is_default ?? false,
      });
    } else {
      setFormData(DEFAULT_FORM);
    }
  }, [editingLocale, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field: keyof AccountingLocaleFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatExample = () => {
    const wholePart = `1${formData.thousands_separator}234`;
    const decimals = '0'.repeat(formData.decimal_places);
    const amount = formData.decimal_places > 0
      ? `${wholePart}${formData.decimal_separator}${decimals}`
      : wholePart;
    const symbol = formData.currency_symbol || formData.currency_code || '?';
    return formData.currency_position === 'before'
      ? `${symbol} ${amount}`
      : `${amount} ${symbol}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingLocale ? 'Edit Accounting Locale' : 'Add Accounting Locale'}
      size="lg"
      closeOnBackdrop={false}
      initialFocusRef={nameRef}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Input
            ref={nameRef}
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Oman - Default"
            required
          />
          <Input
            label="Locale Code"
            value={formData.locale_code}
            onChange={(e) => handleChange('locale_code', e.target.value)}
            placeholder="ar-OM"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Currency Code"
            value={formData.currency_code}
            onChange={(e) => handleChange('currency_code', e.target.value.toUpperCase())}
            placeholder="OMR"
            maxLength={3}
            required
          />
          <Input
            label="Currency Symbol"
            value={formData.currency_symbol}
            onChange={(e) => handleChange('currency_symbol', e.target.value)}
            placeholder="OMR or ر.ع."
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor={decimalPlacesId} className="block text-sm font-medium text-slate-700 mb-1">Decimal Places</label>
            <select
              id={decimalPlacesId}
              value={formData.decimal_places}
              onChange={(e) => handleChange('decimal_places', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[0, 1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={currencyPositionId} className="block text-sm font-medium text-slate-700 mb-1">Currency Position</label>
            <select
              id={currencyPositionId}
              value={formData.currency_position}
              onChange={(e) => handleChange('currency_position', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="before">Before ($ 100)</option>
              <option value="after">After (100 OMR)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preview</label>
            <div className="w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-slate-700 font-mono text-sm">
              {formatExample()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={decimalSeparatorId} className="block text-sm font-medium text-slate-700 mb-1">Decimal Separator</label>
            <select
              id={decimalSeparatorId}
              value={formData.decimal_separator}
              onChange={(e) => handleChange('decimal_separator', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value=".">Period (.)</option>
              <option value=",">Comma (,)</option>
            </select>
          </div>

          <div>
            <label htmlFor={thousandsSeparatorId} className="block text-sm font-medium text-slate-700 mb-1">Thousands Separator</label>
            <select
              id={thousandsSeparatorId}
              value={formData.thousands_separator}
              onChange={(e) => handleChange('thousands_separator', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value=",">Comma (,)</option>
              <option value=".">Period (.)</option>
              <option value=" ">Space ( )</option>
              <option value="">None</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={dateFormatId} className="block text-sm font-medium text-slate-700 mb-1">Date Format</label>
          <select
            id={dateFormatId}
            value={formData.date_format}
            onChange={(e) => handleChange('date_format', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY (31-12-2026)</option>
            <option value="DD.MM.YYYY">DD.MM.YYYY (31.12.2026)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Set as Default</label>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => handleChange('is_default', e.target.checked)}
                className="sr-only"
              />
              <div className={`w-12 h-6 rounded-full shadow-inner transition-colors ${
                formData.is_default ? 'bg-primary' : 'bg-slate-300'
              }`}></div>
              <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                formData.is_default ? 'transform translate-x-6' : ''
              }`}></div>
            </div>
            <span className="ml-3 text-sm text-slate-700">
              {formData.is_default ? 'Default locale — used across the application' : 'Not default'}
            </span>
          </label>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editingLocale ? 'Update Locale' : 'Create Locale'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
