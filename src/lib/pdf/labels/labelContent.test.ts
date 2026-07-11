import { describe, it, expect } from 'vitest';
import type { ReceiptData } from '../types';
import { caseLabelContents, inventoryLabelContent, stockLabelContent } from './labelContent';
import { getLabelSize } from './labelSizes';

const STRIP = getLabelSize('nb_15x26');
const CARD = getLabelSize('nb_50x30');

function receiptData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    caseData: {
      id: 'c-1',
      case_no: 'C-LEGACY-7',
      case_number: 'CASE-0042',
      created_at: '2026-07-07T10:00:00Z',
      status: 'intake',
      priority: 'normal',
      contact_name: 'Walk-in Contact',
      customer: { id: 'cu-1', customer_name: 'Ahmed Al Mansoori' },
    },
    devices: [
      { id: 'd-1', brand: 'WD', model: 'Blue', serial_number: 'WX91A123', device_type: 'HDD', capacity: '2 TB' },
      { id: 'd-2', brand: 'Samsung', model: '870 EVO', device_type: 'SSD' },
      { id: 'd-3', brand: 'SanDisk', model: 'Ultra', serial_number: 'SD-777', device_type: 'USB Flash' },
    ],
    companySettings: { basic_info: { company_name: 'Space Data Recovery' } },
    ...overrides,
  } as ReceiptData;
}

describe('caseLabelContents', () => {
  it('emits one label per device with position index', () => {
    const labels = caseLabelContents(receiptData(), CARD);
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => l.content.index)).toEqual(['1/3', '2/3', '3/3']);
  });

  it('uses case_number (falling back to case_no) as id and QR payload', () => {
    const labels = caseLabelContents(receiptData(), CARD);
    expect(labels[0].content.id).toBe('CASE-0042');
    expect(labels[0].qrPayload).toBe('CASE-0042');

    const legacy = receiptData();
    legacy.caseData.case_number = undefined;
    expect(caseLabelContents(legacy, CARD)[0].content.id).toBe('C-LEGACY-7');
  });

  it('emits a single unindexed case label when there are no devices', () => {
    const labels = caseLabelContents(receiptData({ devices: [] }), CARD);
    expect(labels).toHaveLength(1);
    expect(labels[0].content.index).toBeNull();
  });

  it('on strip stock prioritizes serial then customer', () => {
    const labels = caseLabelContents(receiptData(), STRIP);
    expect(labels[0].content.lines?.[0]).toBe('SN WX91A123');
    expect(labels[0].content.lines?.[1]).toBe('Ahmed Al Mansoori');
  });

  it('on strip stock a serial-less device leads with its brand/model, then the customer', () => {
    // d-2 has no serial: the device descriptor (brand/model) must take the first
    // meta line so the label still identifies the hardware — the customer follows.
    const labels = caseLabelContents(receiptData(), STRIP);
    expect(labels[1].content.lines?.[0]).toBe('Samsung 870 EVO');
    expect(labels[1].content.lines?.[1]).toBe('Ahmed Al Mansoori');
  });

  it('on strip stock a serial-less device with only a type falls back to the device type', () => {
    const data = receiptData({
      devices: [{ id: 'd-x', device_type: 'HDD' }],
    } as Partial<ReceiptData>);
    const labels = caseLabelContents(data, STRIP);
    expect(labels[0].content.lines?.[0]).toBe('HDD');
  });

  it('on card stock carries serial, device summary and received date with customer as title', () => {
    const labels = caseLabelContents(receiptData(), CARD);
    expect(labels[0].content.title).toBe('Ahmed Al Mansoori');
    expect(labels[0].content.lines).toContain('SN WX91A123');
    expect(labels[0].content.lines?.some((l) => l.includes('WD Blue'))).toBe(true);
    expect(labels[0].content.lines?.some((l) => l.includes('07/07/2026'))).toBe(true);
    expect(labels[0].content.footer).toBe('Space Data Recovery');
  });

  it('falls back to contact name when there is no linked customer', () => {
    const data = receiptData();
    data.caseData.customer = undefined;
    expect(caseLabelContents(data, CARD)[0].content.title).toBe('Walk-in Contact');
  });
});

describe('stockLabelContent', () => {
  const item = {
    id: 's-1',
    name: 'SATA Power Cable',
    sku: 'STK-0005',
    barcode: '6291041500213',
    brand: 'Generic',
    selling_price: 15,
    stock_categories: { name: 'Cables' },
  };

  it('maps sku as id, barcode as Code128 value, sku as QR payload', () => {
    const mapped = stockLabelContent(item as never, {});
    expect(mapped.content.id).toBe('STK-0005');
    expect(mapped.qrPayload).toBe('STK-0005');
    expect(mapped.barcodeValue).toBe('6291041500213');
  });

  it('falls back to the name when there is no sku', () => {
    const mapped = stockLabelContent({ ...item, sku: null, barcode: null } as never, {});
    expect(mapped.content.id).toBe('SATA Power Cable');
    expect(mapped.barcodeValue).toBeNull();
  });

  it('includes the pre-formatted price line only when provided', () => {
    const withPrice = stockLabelContent(item as never, { priceText: 'AED 15.00' });
    expect(withPrice.content.lines).toContain('AED 15.00');
    const without = stockLabelContent(item as never, {});
    expect(without.content.lines?.some((l) => l.includes('15'))).toBe(false);
  });

  it('carries location and company name when provided', () => {
    const mapped = stockLabelContent(item as never, { locationName: 'Shelf A-3', companyName: 'Space DR' });
    expect(mapped.content.lines).toContain('Shelf A-3');
    expect(mapped.content.footer).toBe('Space DR');
  });
});

describe('inventoryLabelContent', () => {
  const item = {
    id: 'i-1',
    item_number: 'INV-00013',
    name: 'Donor PCB 2060-771945',
    model: '2060-771945',
    barcode: 'INVBAR-13',
    qr_value: 'QRV-13',
    brand: { name: 'WD' },
    device_type: { name: 'HDD' },
    capacity: { name: '1 TB' },
    storage_location: { name: 'Bin D-12' },
  };

  it('prefers qr_value for the QR payload and item_number as id', () => {
    const mapped = inventoryLabelContent(item);
    expect(mapped.content.id).toBe('INV-00013');
    expect(mapped.qrPayload).toBe('QRV-13');
    expect(mapped.barcodeValue).toBe('INVBAR-13');
  });

  it('maps name as title and brand/type/capacity/location into lines', () => {
    const mapped = inventoryLabelContent(item);
    expect(mapped.content.title).toBe('Donor PCB 2060-771945');
    expect(mapped.content.lines).toContain('WD · HDD · 1 TB');
    expect(mapped.content.lines).toContain('Bin D-12');
  });

  it('survives a bare row straight from insert (no joined relations)', () => {
    const mapped = inventoryLabelContent({ id: 'i-2', item_number: 'INV-00014', name: 'Head comb' });
    expect(mapped.content.id).toBe('INV-00014');
    expect(mapped.qrPayload).toBe('INV-00014');
    expect(mapped.content.lines).toEqual([]);
  });

  it('honors field toggles: hides spec, keeps location', () => {
    const mapped = inventoryLabelContent(item, { spec: false, location: true });
    expect(mapped.content.lines).not.toContain('WD · HDD · 1 TB');
    expect(mapped.content.lines).toContain('Bin D-12');
  });
});

describe('label field toggles', () => {
  const STRIP = getLabelSize('nb_15x26');
  const CARD = getLabelSize('nb_50x30');

  it('case: disabling customer + date drops those lines on the card', () => {
    const data = receiptData();
    const withAll = caseLabelContents(data, CARD)[0].content.lines ?? [];
    const trimmed = caseLabelContents(data, CARD, { customer: false, date: false })[0].content;
    expect(withAll.some((l) => l.includes('07/07/2026'))).toBe(true);
    expect(trimmed.title).toBeNull();
    expect((trimmed.lines ?? []).some((l) => l.includes('07/07/2026'))).toBe(false);
    // the serial + device summary still print
    expect(trimmed.lines).toContain('SN WX91A123');
  });

  it('case: disabling the serial falls back to the device summary on a strip', () => {
    const labels = caseLabelContents(receiptData(), STRIP, { serial: false });
    expect(labels[0].content.lines?.[0]).toBe('WD Blue · 2 TB');
  });

  it('stock: disabling price and category removes them', () => {
    const item = { name: 'SATA Cable', sku: 'STK-1', brand: 'Generic', stock_categories: { name: 'Cables' } };
    const full = stockLabelContent(item as never, { priceText: 'AED 15.00' });
    expect(full.content.lines).toContain('Cables');
    expect(full.content.lines).toContain('AED 15.00');
    const trimmed = stockLabelContent(item as never, { priceText: 'AED 15.00' }, { category: false, price: false });
    expect(trimmed.content.lines).not.toContain('Cables');
    expect(trimmed.content.lines).not.toContain('AED 15.00');
    expect(trimmed.content.lines).toContain('Generic');
  });
});
