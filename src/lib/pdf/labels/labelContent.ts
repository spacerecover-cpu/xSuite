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
 * One label per tracked device (a 12-drive RAID gets 12 individually
 * identifiable labels), or a single case label when no devices are captured.
 */
export function caseLabelContents(data: ReceiptData, size: LabelSizePreset): MappedLabel[] {
  const { caseData, devices, companySettings } = data;
  const id = caseData.case_number ?? caseData.case_no;
  const customer = caseData.customer?.customer_name ?? caseData.contact_name ?? null;
  const footer = companySettings.basic_info?.company_name ?? null;
  const received = formatDate(caseData.created_at, 'dd/MM/yyyy');
  const strip = sizeClass(size) === 'strip';

  const buildOne = (device: (typeof devices)[number] | null, index: string | null): MappedLabel => {
    const serial = present(device?.serial_number) ? `SN ${device!.serial_number}` : null;
    const deviceSummary = device
      ? [
          [device.brand, device.model].filter(present).join(' '),
          device.capacity,
        ]
          .filter(present)
          .join(' · ')
      : '';
    // A strip only fits two meta lines, so lead with the strongest DEVICE
    // descriptor available (serial → brand/model/capacity → device type), then
    // the customer. Keying only off the serial meant a device with no serial
    // captured printed zero device-identifying data and wasted the second line.
    const deviceLine = serial ?? (present(deviceSummary) ? deviceSummary : device?.device_type ?? null);
    const lines = strip
      ? [deviceLine, customer].filter(present)
      : [serial, present(deviceSummary) ? deviceSummary : null, device?.device_type ?? null, received].filter(present);

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

export function stockLabelContent(item: StockLabelItem, opts: StockLabelOptions): MappedLabel {
  const id = item.sku ?? item.name;
  const lines = [
    item.stock_categories?.name ?? null,
    item.brand ?? null,
    opts.priceText ?? null,
    opts.locationName ?? null,
  ].filter(present);

  return {
    content: { id, title: item.name, lines, footer: opts.companyName ?? null, index: null },
    qrPayload: item.sku ?? item.barcode ?? item.name,
    barcodeValue: item.barcode ?? item.sku ?? null,
  };
}

export function inventoryLabelContent(item: InventoryItemWithDetails): MappedLabel {
  const id = item.item_number ?? item.name ?? 'ITEM';
  const spec = [item.brand?.name, item.device_type?.name, item.capacity?.name].filter(present).join(' · ');
  const lines = [present(spec) ? spec : null, item.storage_location?.name ?? null].filter(present);

  return {
    content: { id, title: item.name ?? item.model ?? null, lines, footer: null, index: null },
    qrPayload: item.qr_value ?? item.item_number ?? item.barcode ?? id,
    barcodeValue: item.barcode ?? item.item_number ?? null,
  };
}
