import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../contexts/PortalAuthContext', () => ({ usePortalAuth: () => ({ customer: { id: 'cust1', customer_name: 'Jane' } }) }));
const svc = vi.hoisted(() => ({ fetchPortalDocuments: vi.fn(), getPortalDocumentPdfUrl: vi.fn(), portalSignOffDocument: vi.fn() }));
vi.mock('../../lib/portalDocumentService', () => svc);
vi.mock('../../components/cases/SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture, errorMessage }: { open: boolean; onCapture: (s: unknown) => void; errorMessage?: string | null }) =>
    open ? (
      <>
        <button onClick={() => onCapture({ method: 'click_to_accept' })}>mock-sign</button>
        {errorMessage && <div role="alert">{errorMessage}</div>}
      </>
    ) : null,
}));

import { PortalDocuments } from './PortalDocuments';
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  svc.fetchPortalDocuments.mockResolvedValue([
    { id: 'd1', title: 'Evaluation Report', document_number: 'REP-EVAL-0007', report_subtype: 'evaluation', status: 'delivered', pdf_storage_bucket: 'case-report-pdfs', pdf_storage_path: 't/r/d1/a.pdf', created_at: '2026-06-02T00:00:00Z' },
  ]);
  svc.getPortalDocumentPdfUrl.mockResolvedValue('https://signed/a.pdf');
  svc.portalSignOffDocument.mockResolvedValue('sig-1');
});

it('lists delivered documents and signs one off', async () => {
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText('Evaluation Report')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /sign off/i }));
  fireEvent.click(await screen.findByText('mock-sign'));
  await waitFor(() => expect(svc.portalSignOffDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ method: 'click_to_accept' })));
});

it('shows an empty state when there are no documents', async () => {
  svc.fetchPortalDocuments.mockResolvedValue([]);
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText(/no documents/i)).toBeInTheDocument());
});

it('shows the PDF iframe when a document card is clicked', async () => {
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText('Evaluation Report')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Evaluation Report'));
  await waitFor(() => expect(svc.getPortalDocumentPdfUrl).toHaveBeenCalled());
  expect(await screen.findByTitle('Document')).toBeInTheDocument();
});

it('shows an error alert when sign-off RPC rejects and does not invalidate queries', async () => {
  svc.portalSignOffDocument.mockRejectedValue(new Error('Document no longer deliverable'));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

  render(<QueryClientProvider client={qc}><PortalDocuments /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Evaluation Report')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /sign off/i }));
  fireEvent.click(await screen.findByText('mock-sign'));

  await waitFor(() =>
    expect(screen.getByRole('alert')).toBeInTheDocument()
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Document no longer deliverable');
  expect(invalidateSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: expect.arrayContaining(['portal_documents']) })
  );
});

it('shows an error/retry block when the document list fetch fails', async () => {
  svc.fetchPortalDocuments.mockRejectedValue(new Error('network error'));
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.queryByText(/no documents/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

it('shows "no PDF available" message and no sign-off CTA when selected doc has no pdf_storage_path', async () => {
  svc.fetchPortalDocuments.mockResolvedValue([
    { id: 'd2', title: 'Approved Report', document_number: 'REP-APPR-0001', report_subtype: 'evaluation', status: 'delivered', pdf_storage_bucket: null, pdf_storage_path: null, created_at: '2026-06-02T00:00:00Z' },
  ]);
  svc.getPortalDocumentPdfUrl.mockResolvedValue(null);
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText('Approved Report')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Approved Report'));
  await waitFor(() => expect(screen.getByText(/no pdf is available/i)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /sign off/i })).not.toBeInTheDocument();
  expect(svc.getPortalDocumentPdfUrl).not.toHaveBeenCalled();
});

it('does not show "no PDF available" and still shows sign-off CTA when pdf_storage_path is set', async () => {
  render(wrap(<PortalDocuments />));
  await waitFor(() => expect(screen.getByText('Evaluation Report')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Evaluation Report'));
  await waitFor(() => expect(svc.getPortalDocumentPdfUrl).toHaveBeenCalled());
  expect(screen.queryByText(/no pdf is available/i)).not.toBeInTheDocument();
});
