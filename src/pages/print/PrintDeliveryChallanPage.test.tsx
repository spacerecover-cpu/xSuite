import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PrintDeliveryChallanPage from './PrintDeliveryChallanPage';
import { generateDeliveryChallan } from '../../lib/pdf/pdfService';

vi.mock('../../lib/pdf/pdfService', () => ({
  generateDeliveryChallan: vi.fn(() => Promise.resolve({ success: true })),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/print/delivery-challan/:caseId/:batchId" element={<PrintDeliveryChallanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrintDeliveryChallanPage', () => {
  beforeEach(() => vi.mocked(generateDeliveryChallan).mockClear());

  it('generates the challan for the route case + checkout batch', async () => {
    renderAt('/print/delivery-challan/case-1/batch-1');
    await waitFor(() =>
      expect(generateDeliveryChallan).toHaveBeenCalledWith('case-1', 'batch-1', false),
    );
    expect(await screen.findByText(/PDF Ready/i)).toBeTruthy();
  });

  it('surfaces a generation failure', async () => {
    vi.mocked(generateDeliveryChallan).mockResolvedValueOnce({
      success: false,
      error: 'No delivery challan has been issued for this checkout',
    });
    renderAt('/print/delivery-challan/case-1/batch-x');
    expect(await screen.findByText(/No delivery challan has been issued/i)).toBeTruthy();
  });
});
