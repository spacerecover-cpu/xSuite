import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Regression: the form must round-trip warranty_months, tax_inclusive,
// location, specifications and is_featured — previously the save payload
// dropped all five and edit hydration hardcoded them, silently losing data.
// ---------------------------------------------------------------------------

vi.mock('../ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? <div>{children}</div> : null),
}));
vi.mock('./StockCategorySelect', () => ({
  StockCategorySelect: () => <div data-testid="category-select" />,
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../../lib/labelPrefsService', () => ({
  shouldAutoPrintLabel: vi.fn().mockResolvedValue(false),
}));

const createStockItem = vi.fn();
const updateStockItem = vi.fn();
const getStockItem = vi.fn();
vi.mock('../../lib/stockService', () => ({
  createStockItem: (...a: unknown[]) => createStockItem(...a),
  updateStockItem: (...a: unknown[]) => updateStockItem(...a),
  getStockItem: (...a: unknown[]) => getStockItem(...a),
}));

import { StockItemFormModal } from './StockItemFormModal';
import type { StockItemWithCategory } from '../../lib/stockService';

beforeEach(() => {
  createStockItem.mockReset().mockResolvedValue({ id: 'new-1' });
  updateStockItem.mockReset().mockResolvedValue({ id: 'e1' });
  getStockItem.mockReset().mockResolvedValue(null);
});

describe('StockItemFormModal round-trip', () => {
  it('persists warranty, tax-inclusive, location, is_featured and specifications on create', async () => {
    render(<StockItemFormModal isOpen item={null} onClose={() => {}} onSuccess={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Item name'), { target: { value: 'Donor drive' } });
    // Saleable unlocks Featured + selling price
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'saleable' } });
    fireEvent.click(screen.getByLabelText('Featured'));

    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }));
    fireEvent.click(screen.getByLabelText('Price is tax inclusive'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '24' } });

    fireEvent.click(screen.getByRole('button', { name: 'Inventory Settings' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Shelf A3, Room 2'), { target: { value: 'Shelf A3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Specifications' }));
    fireEvent.change(screen.getByPlaceholderText('Key'), { target: { value: 'Interface' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'SATA' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Item' }));

    await waitFor(() => expect(createStockItem).toHaveBeenCalledTimes(1));
    const payload = createStockItem.mock.calls[0][0];
    expect(payload).toMatchObject({
      warranty_months: 24,
      tax_inclusive: true,
      location: 'Shelf A3',
      is_featured: true,
      specifications: { Interface: 'SATA' },
    });
  });

  it('hydrates the five fields when editing an existing item', () => {
    const item = {
      id: 'e1',
      name: 'Existing',
      item_type: 'saleable',
      is_featured: true,
      tax_inclusive: true,
      warranty_months: 12,
      location: 'Rack B',
      specifications: { Voltage: '5V' },
    } as unknown as StockItemWithCategory;

    render(<StockItemFormModal isOpen item={item} onClose={() => {}} onSuccess={() => {}} />);

    expect((screen.getByLabelText('Featured') as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }));
    expect((screen.getByLabelText('Price is tax inclusive') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByPlaceholderText('e.g. 12') as HTMLInputElement).value).toBe('12');

    fireEvent.click(screen.getByRole('button', { name: 'Inventory Settings' }));
    expect((screen.getByPlaceholderText('e.g. Shelf A3, Room 2') as HTMLInputElement).value).toBe('Rack B');

    fireEvent.click(screen.getByRole('button', { name: 'Specifications' }));
    expect((screen.getByPlaceholderText('Key') as HTMLInputElement).value).toBe('Voltage');
    expect((screen.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('5V');
  });
});
