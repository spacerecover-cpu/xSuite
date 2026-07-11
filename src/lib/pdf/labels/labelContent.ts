/**
 * Pure domain → label-content mappers for the compact label engine.
 *
 * Each mapper returns the text content plus the RAW QR payload / Code128 value;
 * image resolution (async, DOM-bound) happens later in labelPrintService so the
 * mappers stay synchronous and unit-testable.
 *
 * QR/barcode payloads are the plain entity identifier (case number, item
 * number, SKU) — scanning with any keyboard-wedge or camera scanner yields the
 * exact string to paste into lab search.
 */

import type { ReceiptData } from '../types';
import { formatDate } from '../utils';
import type { CompactLabelContent } from './compactLabelDocument';
import type { LabelSizePreset } from './labelSizes';
import { sizeClass } from './labelSizes';
import type { InventoryItemWithDetails } from '../../inventory/inventoryLabelTypes';

export interface MappedLabel {
  content: Omit<CompactLabelContent, 'qrDataUrl' | 'barcodeDataUrl'>;
  qrPayload: string;
  barcodeValue: string | null;
}

const present = (value: string | null | undefined): value is string => !!value && value.trim().length > 0;

/**
 * Per-entity content-field visibility (keys from LABEL_FIELDS in
 * labelPrefsService). A field shows unless it is explicitly `false`; an absent
 * map (or absent key) means "show" — so callers that pass no config, and the
 * existing tests, keep the full-content behavior. The identifier and device
 * index are always rendered and are not gated here.
 */
export type LabelFields = Record<string, boolean> | undefined;
const on = (fields: LabelFields, key: string): boolean => (fields ? fields[key] !== false : true);

/**
 * One label per tracked device (a 12-drive RAID gets 12 individually
 * identifiable labels), or a single case label when no devices are captured.
 */
export function caseLabelContents(data: ReceiptData, size: LabelSizePreset, fields?: LabelFields): MappedLabel[] {
  const { caseData, devices, companySettings } = data;
  const id = caseData.case_number ?? caseData.case_no;
  const customerRaw = caseData.customer?.customer_name ?? caseData.contact_name ?? null;
  const customer = on(fields, 'customer') && present(customerRaw) ? customerRaw : null;
  const footer = on(fields, 'footer') ? companySettings.basic_info?.company_name ?? null : null;
  const received = on(fields, 'date') ? formatDate(caseData.created_at, 'dd/MM/yyyy') : null;
  const strip = sizeClass(size) === 'strip';

  const buildOne = (device: (typeof devices)[number] | null, index: string | null): MappedLabel => {
    const serial = on(fields, 'serial') && present(device?.serial_number) ? `SN ${device!.serial_number}` : null;
    const deviceSummaryRaw = device
      ? [[device.brand, device.model].filter(present).join(' '), device.capacity].filter(present).join(' · ')
      : '';
    const deviceSummary = on(fields, 'device') && present(deviceSummaryRaw) ? deviceSummaryRaw : null;
    const deviceType = on(fields, 'device') ? device?.device_type ?? null : null;
    // A strip only fits two meta lines, so lead with the strongest DEVICE
    // descriptor available (serial → brand/model/capacity → device type), then
    // the customer. Keying only off the serial meant a device with no serial
    // captured printed zero device-identifying data and wasted the second line.
    const deviceLine = serial ?? deviceSummary ?? deviceType;
    const lines = strip
      ? [deviceLine, customer].filter(present)
      : [serial, deviceSummary, deviceType, received].filter(present);

    return {
      content: { id, title: customer, lines, footer, index },
      qrPayload: id,
      barcodeValue: id,
    };
  };

  if (!devices || devices.length === 0) return [buildOne(null, null)];
  return devices.map((device, i) => buildOne(device, `${i + 1}/${devices.length}`));
}

/** Minimal structural shape — both bare stock rows and list rows qualify. */
export interface StockLabelItem {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  stock_categories?: { name: string } | null;
}

export interface StockLabelOptions {
  /** Pre-formatted price line (tenant currency formatting happens in the caller). */
  priceText?: string | null;
  locationName?: string | null;
  companyName?: string | null;
}

export function stockLabelContent(item: StockLabelItem, opts: StockLabelOptions, fields?: LabelFields): MappedLabel {
  const id = item.sku ?? item.name;
  const lines = [
    on(fields, 'category') ? item.stock_categories?.name ?? null : null,
    on(fields, 'brand') ? item.brand ?? null : null,
    on(fields, 'price') ? opts.priceText ?? null : null,
    on(fields, 'location') ? opts.locationName ?? null : null,
  ].filter(present);

  return {
    content: {
      id,
      title: item.name,
      lines,
      footer: on(fields, 'footer') ? opts.companyName ?? null : null,
      index: null,
    },
    qrPayload: item.sku ?? item.barcode ?? item.name,
    barcodeValue: item.barcode ?? item.sku ?? null,
  };
}

export function inventoryLabelContent(item: InventoryItemWithDetails, fields?: LabelFields): MappedLabel {
  const id = item.item_number ?? item.name ?? 'ITEM';
  const specRaw = [item.brand?.name, item.device_type?.name, item.capacity?.name].filter(present).join(' · ');
  const lines = [
    on(fields, 'spec') && present(specRaw) ? specRaw : null,
    on(fields, 'location') ? item.storage_location?.name ?? null : null,
  ].filter(present);

  return {
    content: { id, title: item.name ?? item.model ?? null, lines, footer: null, index: null },
    qrPayload: item.qr_value ?? item.item_number ?? item.barcode ?? id,
    barcodeValue: item.barcode ?? item.item_number ?? null,
  };
}
