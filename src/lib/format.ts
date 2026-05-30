import { format as dateFnsFormat, parseISO } from 'date-fns';
import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { CurrencyConfig } from '../types/tenantConfig';
import { DEFAULT_TENANT_CONFIG } from '../types/tenantConfig';

export interface CurrencyFormat {
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  decimalPlaces: number;
  currencyCode: string;
}

let cachedCurrencyFormat: CurrencyFormat | null = null;

export const fetchCurrencyFormat = async (): Promise<CurrencyFormat> => {
  if (cachedCurrencyFormat) {
    return cachedCurrencyFormat;
  }

  try {
    const { data, error } = await supabase
      .from('accounting_locales')
      .select('currency_code, date_format, number_format, is_default, decimal_places')
      .eq('is_default', true)
      .maybeSingle();

    if (error || !data) {
      const def = DEFAULT_TENANT_CONFIG.currency;
      return {
        currencySymbol: def.symbol,
        currencyPosition: def.position,
        decimalPlaces: def.decimalPlaces,
        currencyCode: def.code,
      };
    }

    cachedCurrencyFormat = {
      currencySymbol: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
      currencyPosition: 'before',
      decimalPlaces: (data as { decimal_places?: number }).decimal_places
        ?? DEFAULT_TENANT_CONFIG.currency.decimalPlaces,
      currencyCode: data.currency_code || DEFAULT_TENANT_CONFIG.currency.code,
    };
    return cachedCurrencyFormat;
  } catch (error) {
    logger.error('Error fetching currency format:', error);
    const def = DEFAULT_TENANT_CONFIG.currency;
    return {
      currencySymbol: def.symbol,
      currencyPosition: def.position,
      decimalPlaces: def.decimalPlaces,
      currencyCode: def.code,
    };
  }
};

export const clearCurrencyFormatCache = () => {
  cachedCurrencyFormat = null;
};

export const formatCurrencyWithSettings = (
  amount: number,
  format: CurrencyFormat
): string => {
  const formattedNumber = amount.toFixed(format.decimalPlaces);
  const [integerPart, decimalPart] = formattedNumber.split('.');
  const formattedInteger = parseInt(integerPart).toLocaleString('en-US');
  const fullNumber = decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;

  if (format.currencyPosition === 'before') {
    return `${format.currencySymbol} ${fullNumber}`;
  } else {
    return `${fullNumber} ${format.currencySymbol}`;
  }
};

export const formatCurrencyWithConfig = (
  amount: number,
  config: CurrencyConfig
): string => {
  const parts = amount.toFixed(config.decimalPlaces).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const decimalPart = parts[1];
  const formattedNumber = config.decimalPlaces > 0
    ? `${integerPart}${config.decimalSeparator}${decimalPart}`
    : integerPart;

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber} ${config.symbol}`;
};

export const formatCurrency = (amount: number, currency = 'USD'): string => {
  try {
    // No fraction-digit overrides: Intl applies the currency's ISO-4217 decimals
    // (USD 2, OMR 3, JPY 0).
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

/**
 * "≈ <base>" preview for a document total. Returns null when doc currency == base
 * (caller hides the line). Rounds via Intl to the base currency's ISO-4217 decimals.
 */
export const formatBaseEquivalent = (
  docTotal: number,
  rate: number,
  baseCurrency: string,
  documentCurrency?: string,
): string | null => {
  if (documentCurrency && documentCurrency === baseCurrency) return null;
  return `≈ ${formatCurrency(docTotal * rate, baseCurrency)}`;
};

export const formatDate = (date: string | Date, formatStr = 'MMM dd, yyyy'): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return dateFnsFormat(dateObj, formatStr);
  } catch (error) {
    return '';
  }
};

export const formatDateTime = (date: string | Date): string => {
  return formatDate(date, 'MMM dd, yyyy HH:mm');
};

export const formatNumber = (num: number, decimals = 2): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export const formatPercent = (value: number): string => {
  return `${formatNumber(value * 100, 2)}%`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const cleanBankFieldValue = (value: string | null | undefined): string => {
  if (!value) return '';

  const trimmedValue = value.trim();

  const prefixes = [
    'IBAN:',
    'SWIFT:',
    'SWIFT Code:',
    'Account No:',
    'Account Number:',
    'Bank:',
    'Branch:',
    'Routing:',
  ];

  for (const prefix of prefixes) {
    if (trimmedValue.startsWith(prefix)) {
      return trimmedValue.substring(prefix.length).trim();
    }
  }

  return trimmedValue;
};
