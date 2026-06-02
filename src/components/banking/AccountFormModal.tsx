import React, { useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase } from '../../lib/supabaseClient';
import { BankAccount } from '../../lib/bankingService';
import { Building, Wallet, Smartphone, AlertCircle } from 'lucide-react';
import { logger } from '../../lib/logger';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (accountData: Partial<BankAccount>) => Promise<void>;
  initialData?: BankAccount | null;
}

export const AccountFormModal: React.FC<AccountFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const employeeSelectId = useId();
  const currencySelectId = useId();

  const [formData, setFormData] = useState({
    account_name: '',
    account_number: '',
    account_type: 'bank' as 'bank' | 'cash' | 'mobile',
    bank_name: '',
    branch_code: '',
    swift_code: '',
    iban: '',
    currency_id: '',
    opening_balance: 0,
    is_active: true,
    is_default: false,
    employee_id: '',
    mobile_number: '',
    mobile_provider: '',
    location: '',
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['currency_codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_currency_codes')
        .select('id, code, name, symbol')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: defaultLocale } = useQuery({
    queryKey: ['default_accounting_locale'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_locales')
        .select('currency_code')
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const defaultCurrency = currencies.find(c => c.code === defaultLocale?.currency_code);

  useEffect(() => {
    if (initialData) {
      setFormData({
        account_name: initialData.account_name || '',
        account_number: initialData.account_number || '',
        account_type: initialData.account_type || 'bank',
        bank_name: initialData.bank_name || '',
        branch_code: initialData.branch_code || '',
        swift_code: initialData.swift_code || '',
        iban: initialData.iban || '',
        currency_id: initialData.currency_id || '',
        opening_balance: initialData.opening_balance || 0,
        is_active: initialData.is_active ?? true,
        is_default: initialData.is_default ?? false,
        employee_id: initialData.employee_id || '',
        mobile_number: initialData.mobile_number || '',
        mobile_provider: initialData.mobile_provider || '',
        location: initialData.location || '',
      });
    } else {
      setFormData({
        account_name: '',
        account_number: '',
        account_type: 'bank',
        bank_name: '',
        branch_code: '',
        swift_code: '',
        iban: '',
        currency_id: defaultCurrency?.id || '',
        opening_balance: 0,
        is_active: true,
        is_default: false,
        employee_id: '',
        mobile_number: '',
        mobile_provider: '',
        location: '',
      });
    }
    setError('');
  }, [initialData, isOpen, defaultCurrency]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees_for_mobile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: formData.account_type === 'mobile',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!formData.account_name?.trim()) {
        throw new Error('Account name is required');
      }

      if (formData.account_type === 'bank' && !formData.bank_name?.trim()) {
        throw new Error('Bank name is required for bank accounts');
      }

      if (formData.account_type === 'mobile') {
        if (!formData.employee_id) {
          throw new Error('Employee assignment is required for mobile accounts');
        }
        if (!formData.mobile_number?.trim()) {
          throw new Error('Mobile number is required for mobile accounts');
        }
      }

      if (formData.account_type === 'cash' && !formData.location?.trim()) {
        throw new Error('Location is required for cash accounts');
      }

      const accountData: Partial<BankAccount> = {
        account_name: formData.account_name.trim(),
        account_type: formData.account_type,
        bank_name: formData.account_type === 'bank' ? formData.bank_name.trim() : formData.account_type,
        branch_code: formData.branch_code?.trim() || undefined,
        swift_code: formData.swift_code?.trim() || undefined,
        iban: formData.iban?.trim() || undefined,
        currency_id: formData.currency_id || undefined,
        is_active: formData.is_active,
        is_default: formData.is_default,
        employee_id: formData.employee_id || undefined,
        mobile_number: formData.mobile_number?.trim() || undefined,
        mobile_provider: formData.mobile_provider?.trim() || undefined,
        location: formData.location?.trim() || undefined,
      };

      if (formData.account_type === 'bank') {
        accountData.account_number = formData.account_number?.trim() || undefined;
      } else if (formData.account_type === 'mobile') {
        if (!formData.mobile_number?.trim()) {
          throw new Error('Mobile number is required for mobile money accounts');
        }
        accountData.account_number = null as unknown as string | undefined;
      } else if (formData.account_type === 'cash') {
        accountData.account_number = null as unknown as string | undefined;
      }

      if (!initialData) {
        accountData.opening_balance = formData.opening_balance;
        accountData.current_balance = formData.opening_balance;
      }

      await onSave(accountData);
      onClose();
    } catch (err: unknown) {
      logger.error('Account save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Edit Account' : 'Add New Account'} size="large" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Account Type</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'bank', label: 'Bank Account', icon: <Building className="w-5 h-5" /> },
              { value: 'cash', label: 'Cash Account', icon: <Wallet className="w-5 h-5" /> },
              { value: 'mobile', label: 'Mobile Money', icon: <Smartphone className="w-5 h-5" /> },
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({
                  ...formData,
                  account_type: type.value as 'bank' | 'cash' | 'mobile',
                  account_number: type.value === 'cash' ? '' : formData.account_number
                })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.account_type === type.value
                    ? 'border-primary bg-info-muted'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {type.icon}
                <span className="text-sm font-medium">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Input
            label="Account Name"
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            required
            placeholder="e.g., Main Business Account"
          />

          {formData.account_type === 'bank' && (
            <Input
              label="Account Number"
              value={formData.account_number}
              onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          )}
        </div>

        {formData.account_type === 'cash' && (
          <div className="bg-success-muted border border-success/30 rounded-lg p-3">
            <p className="text-sm text-success">
              Cash accounts do not require an account number. The location will serve as the primary identifier.
            </p>
          </div>
        )}

        {formData.account_type === 'mobile' && (
          <div className="bg-info-muted border border-info/30 rounded-lg p-3">
            <p className="text-sm text-info">
              Mobile money accounts use the mobile number as the primary identifier instead of an account number.
            </p>
          </div>
        )}

        {formData.account_type === 'bank' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Bank Name"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                required
                placeholder="e.g., Standard Bank"
              />

              <Input
                label="Branch Code"
                value={formData.branch_code}
                onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="SWIFT/BIC Code"
                value={formData.swift_code}
                onChange={(e) => setFormData({ ...formData, swift_code: e.target.value })}
                placeholder="Optional"
              />

              <Input
                label="IBAN"
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </>
        )}

        {formData.account_type === 'mobile' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={employeeSelectId} className="block text-sm font-medium text-slate-700 mb-1.5">Assigned Employee</label>
                <select
                  id={employeeSelectId}
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name ?? '(Unnamed)'}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Mobile Number"
                value={formData.mobile_number}
                onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                placeholder="e.g., +1234567890"
                required
              />
            </div>

            <Input
              label="Mobile Provider"
              value={formData.mobile_provider}
              onChange={(e) => setFormData({ ...formData, mobile_provider: e.target.value })}
              placeholder="e.g., M-Pesa, MTN Mobile Money"
            />
          </>
        )}

        {formData.account_type === 'cash' && (
          <Input
            label="Location"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g., Main Office, Branch 1"
            required
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={currencySelectId} className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
            <select
              id={currencySelectId}
              value={formData.currency_id}
              onChange={(e) => setFormData({ ...formData, currency_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">{defaultCurrency ? `${defaultCurrency.code} (Default)` : 'Select Currency'}</option>
              {currencies.map((curr) => (
                <option key={curr.id} value={curr.id}>
                  {curr.code} - {curr.name} ({curr.symbol})
                </option>
              ))}
            </select>
            {formData.currency_id && (
              <p className="mt-1 text-xs text-slate-600">
                {(() => {
                  const selected = currencies.find(c => c.id === formData.currency_id);
                  if (!selected) return null;
                  return `Selected: ${selected.code} (${selected.symbol})`;
                })()}
              </p>
            )}
          </div>

          {!initialData && (
            <Input
              label="Opening Balance"
              type="number"
              step="0.01"
              value={formData.opening_balance}
              onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
            />
          )}
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <span className="text-sm font-medium text-slate-700">Active Account</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <span className="text-sm font-medium text-slate-700">Set as Default</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialData ? 'Update Account' : 'Create Account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
