import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getDocumentInstance: vi.fn(),
  getDocumentPdfSignedUrl: vi.fn(),
  getDocumentInstanceSections: vi.fn(),
}));
vi.mock('../../lib/documentInstanceService', () => svc);
vi.mock('../ui/AuditInfo', () => ({ AuditInfo: () => <div data-testid="audit" /> }));

import { DocumentViewerModal } from './DocumentViewerModal';

beforeEach(() => {
  vi.clearAllMocks();
  svc.getDocumentInstance.mockResolvedValue({
    id: 'di-1',
    title: 'Eval',
    status: 'delivered',
    document_number: 'REP-EVAL-0007',
    pdf_storage_bucket: 'case-report-pdfs',
    pdf_storage_path: 't/report/di-1/abc.pdf',
    created_at: '2026-06-01T10:00:00Z',
    created_by: 'user-1',
    updated_at: '2026-06-02T10:00:00Z',
    updated_by: null,
  });
  svc.getDocumentPdfSignedUrl.mockResolvedValue('https://signed/url.pdf');
  svc.getDocumentInstanceSections.mockResolvedValue([]);
});

describe('DocumentViewerModal', () => {
  it('shows the title, number and the archived PDF iframe', async () => {
    render(<DocumentViewerModal isOpen onClose={vi.fn()} instanceId="di-1" />);
    await waitFor(() => expect(screen.getByText('REP-EVAL-0007')).toBeInTheDocument());
    expect(svc.getDocumentPdfSignedUrl).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTitle(/document pdf/i)).toHaveAttribute('src', 'https://signed/url.pdf'),
    );
  });

  it('shows a "no PDF archived yet" notice when there is no path and no sections', async () => {
    svc.getDocumentInstance.mockResolvedValue({
      id: 'di-2',
      title: 'Draft',
      status: 'draft',
      document_number: 'REP-EVAL-0008',
      pdf_storage_bucket: null,
      pdf_storage_path: null,
      created_at: '2026-06-01T10:00:00Z',
      created_by: 'user-1',
      updated_at: null,
      updated_by: null,
    });
    svc.getDocumentPdfSignedUrl.mockResolvedValue(null);
    svc.getDocumentInstanceSections.mockResolvedValue([]);
    render(<DocumentViewerModal isOpen onClose={vi.fn()} instanceId="di-2" />);
    await waitFor(() => expect(screen.getByText(/no pdf archived/i)).toBeInTheDocument());
  });

  it('renders section content as fallback when instance has no PDF but has sections', async () => {
    svc.getDocumentInstance.mockResolvedValue({
      id: 'di-3',
      title: 'Approved Report',
      status: 'approved',
      document_number: 'REP-EVAL-0009',
      pdf_storage_bucket: null,
      pdf_storage_path: null,
      created_at: '2026-06-01T10:00:00Z',
      created_by: 'user-1',
      updated_at: null,
      updated_by: null,
    });
    svc.getDocumentPdfSignedUrl.mockResolvedValue(null);
    svc.getDocumentInstanceSections.mockResolvedValue([
      { id: 's-1', document_instance_id: 'di-3', section_key: 'summary', title: 'Executive Summary', content: 'Data was recovered successfully.', sort_order: 0, is_visible: true, deleted_at: null },
      { id: 's-2', document_instance_id: 'di-3', section_key: 'findings', title: 'Findings', content: 'All 4 drives readable.', sort_order: 1, is_visible: true, deleted_at: null },
      { id: 's-3', document_instance_id: 'di-3', section_key: 'hidden', title: 'Hidden', content: 'Should not appear.', sort_order: 2, is_visible: false, deleted_at: null },
    ]);
    render(<DocumentViewerModal isOpen onClose={vi.fn()} instanceId="di-3" />);
    await waitFor(() => expect(screen.getByTestId('sections-fallback')).toBeInTheDocument());
    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('Data was recovered successfully.')).toBeInTheDocument();
    expect(screen.getByText('Findings')).toBeInTheDocument();
    expect(screen.getByText('All 4 drives readable.')).toBeInTheDocument();
    expect(screen.queryByText('Should not appear.')).not.toBeInTheDocument();
    expect(svc.getDocumentInstanceSections).toHaveBeenCalledWith('di-3');
    expect(screen.queryByTitle(/document pdf/i)).not.toBeInTheDocument();
  });
});
