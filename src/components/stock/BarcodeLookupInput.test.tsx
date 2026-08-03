import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Regression: scanning a unit serial number resolved the parent item by
// re-querying stock_items with barcode = <the serial string>, which never
// matches — the scan reported "not found" and the item stayed unresolved.
// ---------------------------------------------------------------------------

const toastError = vi.fn();
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn() }),
}));

const getStockItem = vi.fn();
const getStockItemByBarcode = vi.fn();
const getSerialNumberByBarcode = vi.fn();
vi.mock('../../lib/stockService', () => ({
  getStockItem: (...a: unknown[]) => getStockItem(...a),
  getStockItemByBarcode: (...a: unknown[]) => getStockItemByBarcode(...a),
  getSerialNumberByBarcode: (...a: unknown[]) => getSerialNumberByBarcode(...a),
}));

import { BarcodeLookupInput } from './BarcodeLookupInput';

const parentItem = { id: 'item-99', name: 'Seagate 4TB Donor' };
const serialRow = { id: 'sn-1', item_id: 'item-99', serial_number: 'SN-ABC-123' };

beforeEach(() => {
  toastError.mockReset();
  getStockItem.mockReset().mockResolvedValue(parentItem);
  // The scanned string is a serial, so no stock item carries it as a barcode.
  getStockItemByBarcode.mockReset().mockResolvedValue(null);
  getSerialNumberByBarcode.mockReset().mockResolvedValue(serialRow);
});

const scan = (text: string) => {
  const input = screen.getByPlaceholderText('Scan or type barcode / serial number...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('BarcodeLookupInput serial scans', () => {
  it('resolves the parent item via the serial row item_id, not the scanned barcode', async () => {
    const onSerialFound = vi.fn();
    render(<BarcodeLookupInput onSerialFound={onSerialFound} />);

    scan('SN-ABC-123');

    await waitFor(() => expect(onSerialFound).toHaveBeenCalledTimes(1));
    expect(getStockItem).toHaveBeenCalledWith('item-99');
    expect(onSerialFound).toHaveBeenCalledWith(serialRow, parentItem);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still hands back the serial when the parent item lookup fails', async () => {
    getStockItem.mockRejectedValue(new Error('network'));
    const onSerialFound = vi.fn();
    render(<BarcodeLookupInput onSerialFound={onSerialFound} />);

    scan('SN-ABC-123');

    await waitFor(() => expect(onSerialFound).toHaveBeenCalledTimes(1));
    expect(onSerialFound).toHaveBeenCalledWith(serialRow, null);
  });
});

// ---------------------------------------------------------------------------
// Regression: a barcode gun can fire the next scan before the previous lookup
// resolves. The slow response used to clear the input, wiping a barcode the
// operator had already started typing.
// ---------------------------------------------------------------------------
describe('BarcodeLookupInput overlapping scans', () => {
  const itemA = { id: 'item-a', name: 'Item A' };
  const itemB = { id: 'item-b', name: 'Item B' };

  it('does not let a superseded lookup clear the input a newer scan owns', async () => {
    let resolveA: (v: unknown) => void = () => {};
    getStockItemByBarcode.mockReset().mockImplementation((code: string) =>
      code === 'AAA' ? new Promise((r) => { resolveA = r; }) : Promise.resolve(itemB),
    );
    getSerialNumberByBarcode.mockReset().mockResolvedValue(null);

    const onItemFound = vi.fn();
    render(<BarcodeLookupInput onItemFound={onItemFound} />);
    const input = screen.getByPlaceholderText('Scan or type barcode / serial number...');

    scan('AAA'); // slow
    scan('BBB'); // resolves first and supersedes AAA

    await waitFor(() => expect(onItemFound).toHaveBeenCalledWith(itemB));

    // Operator starts typing the next barcode while AAA is still in flight.
    fireEvent.change(input, { target: { value: 'CCC' } });
    resolveA(itemA);

    // The superseded scan is still delivered (no scan is lost) but must leave
    // the half-typed barcode alone.
    await waitFor(() => expect(onItemFound).toHaveBeenCalledWith(itemA));
    expect((input as HTMLInputElement).value).toBe('CCC');
  });
});
