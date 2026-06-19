import React, { useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollService } from '../../lib/payrollService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { supabase } from '../../lib/supabaseClient';
import { buildCurrencyOptions } from './currencyOptions';

export const PayrollSettingsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: () => payrollService.getPayrollSettings(),
  });

  // D17 — source the currency dropdown from master_currency_codes, not a hardcoded
  // USD/EUR/... map that drifts from the data.
  const { data: currencyRows } = useQuery({
    queryKey: ['master-currency-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_currency_codes')
        .select('code, symbol, decimal_places')
        .eq('is_active', true)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('code', { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => ({
        code: r.code,
        symbol: r.symbol ?? r.code,
        decimal_places: r.decimal_places,
      }));
    },
  });
  const currencyOptions = buildCurrencyOptions(currencyRows || []);

  const [formData, setFormData] = useState({
    working_days_per_month: settings?.working_days_per_month || 22,
    working_hours_per_day: settings?.working_hours_per_day || 8,
    overtime_regular: settings?.overtime_rate_multiplier?.regular || 1.25,
    overtime_weekend: settings?.overtime_rate_multiplier?.weekend || 1.5,
    overtime_holiday: settings?.overtime_rate_multiplier?.holiday || 2.0,
    currency_code: settings?.currency?.code || 'USD',
    currency_symbol: settings?.currency?.symbol || '$',
    currency_decimals: settings?.currency?.decimals || 2,
    payment_day: settings?.payment_day || 28,
  });

  React.useEffect(() => {
    if (settings) {
      setFormData({
        working_days_per_month: settings.working_days_per_month,
        working_hours_per_day: settings.working_hours_per_day,
        overtime_regular: settings.overtime_rate_multiplier.regular,
        overtime_weekend: settings.overtime_rate_multiplier.weekend,
        overtime_holiday: settings.overtime_rate_multiplier.holiday,
        currency_code: settings.currency.code,
        currency_symbol: settings.currency.symbol,
        currency_decimals: settings.currency.decimals,
        payment_day: settings.payment_day,
      });
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await payrollService.updatePayrollSettings({
        working_days_per_month: data.working_days_per_month,
        working_hours_per_day: data.working_hours_per_day,
        overtime_rate_multiplier: {
          regular: data.overtime_regular,
          weekend: data.overtime_weekend,
          holiday: data.overtime_holiday,
        },
        currency: {
          code: data.currency_code,
          symbol: data.currency_symbol,
          decimals: data.currency_decimals,
        },
        payment_day: data.payment_day,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-settings'] });
      toast.success('Payroll settings updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => payrollService.resetPayrollSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-settings'] });
      toast.success('Settings reset to defaults');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate(formData);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to default values?',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (ok) {
      resetSettingsMutation.mutate();
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading payroll settings...</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeaderSlot
        title="Payroll Settings"
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={handleReset}
              disabled={resetSettingsMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              type="button"
              onClick={() => updateSettingsMutation.mutate(formData)}
              disabled={updateSettingsMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Working Hours Configuration</h3>
            <p className="text-sm text-gray-600 mt-1">
              Set default working hours used for salary calculations
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Working Days per Month
                </label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.working_days_per_month}
                  onChange={(e) =>
                    handleChange('working_days_per_month', parseInt(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Typically 22 days for 5-day workweek
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Working Hours per Day
                </label>
                <Input
                  type="number"
                  min="1"
                  max="24"
                  value={formData.working_hours_per_day}
                  onChange={(e) =>
                    handleChange('working_hours_per_day', parseInt(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Standard daily working hours</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Overtime Rate Multipliers</h3>
            <p className="text-sm text-gray-600 mt-1">
              Set multipliers for different types of overtime pay
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Regular Overtime
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max="5"
                  value={formData.overtime_regular}
                  onChange={(e) =>
                    handleChange('overtime_regular', parseFloat(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Weekday overtime multiplier (e.g., 1.25 = 125%)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weekend Overtime
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max="5"
                  value={formData.overtime_weekend}
                  onChange={(e) =>
                    handleChange('overtime_weekend', parseFloat(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Weekend overtime multiplier</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Holiday Overtime
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max="5"
                  value={formData.overtime_holiday}
                  onChange={(e) =>
                    handleChange('overtime_holiday', parseFloat(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Holiday overtime multiplier</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Currency & Payment Settings</h3>
            <p className="text-sm text-gray-600 mt-1">
              Configure currency display and payment defaults
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency Code
                </label>
                <select
                  value={formData.currency_code}
                  onChange={(e) => {
                    const code = e.target.value;
                    const selected = currencyOptions.find((o) => o.value === code);
                    handleChange('currency_code', code);
                    handleChange('currency_symbol', selected?.symbol ?? code);
                    handleChange('currency_decimals', selected?.decimals ?? 2);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                >
                  {currencyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency Symbol
                </label>
                <Input
                  type="text"
                  value={formData.currency_symbol}
                  onChange={(e) => handleChange('currency_symbol', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Decimal Places
                </label>
                <Input
                  type="number"
                  min="0"
                  max="4"
                  value={formData.currency_decimals}
                  onChange={(e) =>
                    handleChange('currency_decimals', parseInt(e.target.value))
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Number of decimal places to display</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Payment Day
                </label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.payment_day}
                  onChange={(e) => handleChange('payment_day', parseInt(e.target.value))}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Day of month for salary payments</p>
              </div>
            </div>
          </div>
        </Card>

      </form>
    </div>
  );
};
