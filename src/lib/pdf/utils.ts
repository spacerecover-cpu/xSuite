import { format } from 'date-fns';
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
  currencyCode: string = 'USD',
  locale: string = 'en-US'
): string {
  if (amount === null || amount === undefined) return '-';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
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
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
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
