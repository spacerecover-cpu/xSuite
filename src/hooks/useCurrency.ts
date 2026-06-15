import { useCurrencyConfig } from '../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../lib/format';
import type { CurrencyFormat } from '../lib/format';

export const useCurrency = () => {
  const currencyConfig = useCurrencyConfig();

  const currencyFormat: CurrencyFormat = {
    currencySymbol: currencyConfig.symbol,
    currencyPosition: currencyConfig.position,
    decimalPlaces: currencyConfig.decimalPlaces,
    // D2: code may be the unresolved REQUIRED_SENTINEL symbol; coerce to '' for
    // display so we never fabricate a US literal here (fail-loud, not fail-US).
    currencyCode: typeof currencyConfig.code === 'string' ? currencyConfig.code : '',
  };

  const formatCurrency = (amount: number): string => {
    return formatCurrencyWithConfig(amount, currencyConfig);
  };

  return {
    currencyFormat,
    formatCurrency,
    loading: false,
  };
};
