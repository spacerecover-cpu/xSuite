import { format } from 'date-fns';
import { logger } from '../logger';
import type { CurrencyConfig } from '../../types/tenantConfig';
import type { CompanySettingsData, TranslationContext } from './types';

export function formatDate(date: string | Date | null | undefined, formatStr: string = 'dd/MM/yyyy'): string {
  if (!date) return '-';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, formatStr);
  } catch {
    return '-';
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'dd/MM/yyyy HH:mm');
}

export function formatCurrency(
  amount: number | null | undefined,
  // Pass the tenant's resolved CurrencyConfig: it carries symbol/code/position,
  // separators, decimalPlaces, displayMode and negativeFormat. Honors
  // config.decimalPlaces (OMR 3 / JPY 0), the tenant separators and currency
  // position — NOT a hardcoded 2dp / en-US. The logic mirrors
  // formatCurrencyWithConfig (lib/format) but is inlined so this PDF leaf stays
  // free of the supabaseClient import chain that lib/format pulls in.
  config: CurrencyConfig
): string {
  if (amount === null || amount === undefined) return '-';

  const code = typeof config.code === 'string' ? config.code : '';
  const symbol = config.symbol || code;
  const token =
    config.displayMode === 'iso_code'
      ? code || symbol
      : config.displayMode === 'symbol_code'
        ? code && config.symbol && config.symbol !== code
          ? `${config.symbol} ${code}`
          : code || symbol
        : symbol;

  const useParens = config.negativeFormat === 'parentheses' && amount < 0;
  const magnitude = useParens ? Math.abs(amount) : amount;

  const parts = magnitude.toFixed(config.decimalPlaces).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const decimalPart = parts[1];
  const formattedNumber =
    config.decimalPlaces > 0
      ? `${integerPart}${config.decimalSeparator}${decimalPart}`
      : integerPart;

  const body =
    config.position === 'before'
      ? `${token}${formattedNumber}`
      : `${formattedNumber} ${token}`;
  return useParens ? `(${body})` : body;
}

/**
 * Format a money amount for the engine adapters with a thousands separator.
 * The adapters read raw `accounting_locales` (symbol / decimal_places /
 * position) and previously used a bare `amount.toFixed()` — which dropped the
 * grouping separator (e.g. `2000.000 OMR`). This applies comma grouping (and a
 * dot decimal) uniformly so every document reads one format (e.g.
 * `2,000.000 OMR`). Mirrors the grouping in {@link formatCurrency}.
 */
export function formatEngineMoney(
  amount: number,
  opts: {
    symbol: string;
    decimalPlaces: number;
    position: 'before' | 'after';
    decimalSeparator?: string;
    thousandsSeparator?: string;
  },
): string {
  const dec = opts.decimalSeparator ?? '.';
  const thou = opts.thousandsSeparator ?? ',';
  const [intPart, decPart] = amount.toFixed(opts.decimalPlaces).split('.');
  const grouped = thou === '' ? intPart : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
  const formatted = decPart ? `${grouped}${dec}${decPart}` : grouped;
  return opts.position === 'before' ? `${opts.symbol} ${formatted}` : `${formatted} ${opts.symbol}`;
}

export function formatCapacity(capacity: string | null | undefined): string {
  if (!capacity) return '-';
  const trimmed = capacity.trim();
  if (!trimmed) return '-';
  // Capacity comes from catalog_device_capacities.name — a label that already
  // carries a unit (e.g. "2TB", "500 GB"). Return it as-is. parseFloat would
  // strip the unit ("2TB" -> 2) and the value would be wrongly re-labelled
  // "2 GB" on the receipt/checkout PDFs.
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;

  // Legacy fallback: a bare number is interpreted as a GB count.
  const num = parseFloat(trimmed);
  if (isNaN(num)) return trimmed;
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)} TB`;
  }
  return `${num} GB`;
}

export function buildCompanyAddress(location: CompanySettingsData['location']): string {
  if (!location) return '';

  const parts: string[] = [];

  if (location.building_name) parts.push(location.building_name);
  if (location.unit_number) parts.push(location.unit_number);
  if (location.address_line1) parts.push(location.address_line1);
  if (location.address_line2) parts.push(location.address_line2);

  const cityStateParts: string[] = [];
  if (location.city) cityStateParts.push(location.city);
  if (location.state) cityStateParts.push(location.state);
  if (location.postal_code) cityStateParts.push(location.postal_code);
  if (cityStateParts.length > 0) parts.push(cityStateParts.join(', '));

  if (location.country) parts.push(location.country);

  return parts.join(', ');
}

export function buildCompanyAddressLines(location: CompanySettingsData['location']): string[] {
  if (!location) return [];

  const lines: string[] = [];

  // Line 1: Building Name, Unit/Floor, and Address Line combined
  const addressLine1Parts: string[] = [];
  if (location.building_name) addressLine1Parts.push(location.building_name);
  if (location.unit_number) addressLine1Parts.push(location.unit_number);
  if (location.address_line1) addressLine1Parts.push(location.address_line1);
  if (addressLine1Parts.length > 0) {
    lines.push(addressLine1Parts.join(', '));
  }

  // Line 2: City, State, and Country together
  const addressLine2Parts: string[] = [];
  if (location.city) addressLine2Parts.push(location.city);
  if (location.state) addressLine2Parts.push(location.state);
  if (location.country) addressLine2Parts.push(location.country);
  if (addressLine2Parts.length > 0) {
    lines.push(addressLine2Parts.join(', '));
  }

  return lines;
}

export function buildCompanyContactLine(contactInfo: CompanySettingsData['contact_info']): string {
  if (!contactInfo) return '';

  const parts: string[] = [];

  if (contactInfo.phone_primary) parts.push(`Tel: ${contactInfo.phone_primary}`);
  if (contactInfo.email_general) parts.push(`Email: ${contactInfo.email_general}`);

  return parts.join(' | ');
}

export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value || '-';
  if (typeof value === 'number') return String(value);
  return '-';
}

export function createTranslatedLabel(
  key: string,
  englishText: string,
  ctx: TranslationContext
): string {
  if (!ctx.isBilingual) return englishText;
  return ctx.t(key, englishText);
}

export async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(`[pdf] image fetch failed (${response.status}) for ${url}`);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => {
        logger.warn(`[pdf] image decode failed for ${url}`);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    logger.warn(`[pdf] image load error for ${url}:`, err);
    return null;
  }
}

export function getDeviceRoleLabel(role: string | null | undefined): string {
  if (!role) return '-';
  const roles: Record<string, string> = {
    source: 'Source (Patient)',
    donor: 'Donor',
    clone: 'Clone Target',
    spare: 'Spare Part',
  };
  return roles[role] || role;
}

export function getConditionLabel(condition: string | null | undefined): string {
  if (!condition) return '-';
  const conditions: Record<string, string> = {
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    defective: 'Defective',
    unknown: 'Unknown',
  };
  return conditions[condition] || condition;
}

export interface PartyAddressInput {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  subdivision?: string | null;
  postal_code?: string | null;
  country?: string | null;
  free_text?: string | null;
}

/** Country-ordered buyer/party address lines. `postalFirst` = the country's
 *  address_format puts the postal code before the city (EU/JP convention).
 *  Falls back to the legacy free-text blob when no structured field is set
 *  (M-I: pre-migration rows keep rendering exactly what they stored). */
export function formatPartyAddressLines(addr: PartyAddressInput, postalFirst: boolean): string[] {
  const lines: string[] = [];
  if (addr.line1?.trim()) lines.push(addr.line1.trim());
  if (addr.line2?.trim()) lines.push(addr.line2.trim());
  const cityBits = [addr.city?.trim(), addr.subdivision?.trim()].filter(Boolean).join(', ');
  const postal = addr.postal_code?.trim() ?? '';
  const cityLine = postalFirst
    ? [postal, cityBits].filter(Boolean).join(' ')
    : [cityBits, postal].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (lines.length === 0 && addr.free_text?.trim()) lines.push(addr.free_text.trim());
  return lines;
}
