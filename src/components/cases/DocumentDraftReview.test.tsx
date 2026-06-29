import { it, expect, vi, beforeEach, describe } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getDocumentInstance: vi.fn(),
  getDocumentInstanceSections: vi.fn(),
  createReportInstance: vi.fn(),
  archiveDocumentInstance: vi.fn(),
  transitionDocument: vi.fn(),
}));
vi.mock('../../lib/documentInstanceService', () => svc);
const sigSvc = vi.hoisted(() => ({
  captureStaffSignature: vi.fn(async () => 'sig-1'),
  listInstanceSignatures: vi.fn(async () => [] as { slot: string; id: string; document_instance_id: string; signed_at: string }[]),
}));
vi.mock('../../lib/documentSignatureService', () => sigSvc);
vi.mock('./SignatureCaptureModal', () => ({
  SignatureCaptureModal: ({ open, onCapture }: { open: boolean; onCapture: (s: unknown) => void }) =>
    open ? <button onClick={() => onCapture({ method: 'typed', typedValue: 'Tech A' })}>mock-capture</button> : null,
}));
vi.mock('../../lib/reportPDFService', () => ({
  reportPDFService: { generateDocumentInstanceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })) },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reviewer' }, profile: { id: 'reviewer', full_name: 'Reviewer' } }) }));
// Real hook returns { success, error, ... } — not showToast
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
// supabase is used for section saves; mock it out so tests don't hit the network
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })),
    })),
  },
}));

import { DocumentDraftReview } from './DocumentDraftReview';

beforeEach(() => {
  vi.clearAllMocks();
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  svc.getDocumentInstanceSections.mockResolvedValue([{ section_key: 'findings', title: 'Findings', content: '', sort_order: 0, is_visible: true }]);
});

it('archives then delivers when Send is clicked', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'approved', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  svc.archiveDocumentInstance.mockResolvedValue({ path: 'p', sha256: 'h' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  const sendBtn = await screen.findByRole('button', { name: /send to customer/i });
  fireEvent.click(sendBtn);
  await waitFor(() => expect(svc.archiveDocumentInstance).toHaveBeenCalledWith('di-1'));
  expect(svc.transitionDocument).toHaveBeenCalledWith('di-1', 'delivered');
});

it('disables Approve for the author (second-person gate)', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'reviewer', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  const approve = await screen.findByRole('button', { name: /approve/i });
  expect(approve).toBeDisabled();
});

it('creates a new instance once when opened with a subtype', async () => {
  svc.createReportInstance.mockResolvedValue({ id: 'new-1' });
  svc.getDocumentInstance.mockResolvedValue({ id: 'new-1', title: 'Evaluation Report', status: 'draft', created_by: 'reviewer', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" newSubtype="evaluation" newTitle="Evaluation Report" onSaved={vi.fn()} />);
  await waitFor(() => expect(svc.createReportInstance).toHaveBeenCalledWith({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Evaluation Report' }));
  expect(svc.createReportInstance).toHaveBeenCalledOnce();
});

it('creates a fresh instance when re-opened with a different subtype after close', async () => {
  svc.createReportInstance.mockResolvedValueOnce({ id: 'eval-1' }).mockResolvedValueOnce({ id: 'svc-1' });
  svc.getDocumentInstance
    .mockResolvedValueOnce({ id: 'eval-1', title: 'Evaluation', status: 'draft', created_by: 'reviewer', report_subtype: 'evaluation', case_id: 'c1' })
    .mockResolvedValueOnce({ id: 'svc-1', title: 'Service', status: 'draft', created_by: 'reviewer', report_subtype: 'service', case_id: 'c1' });

  const { rerender } = render(
    <DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" newSubtype="evaluation" onSaved={vi.fn()} />,
  );
  await waitFor(() => expect(svc.createReportInstance).toHaveBeenCalledWith({ caseId: 'c1', reportSubtype: 'evaluation', title: 'Report' }));

  // Close the modal (simulate parent toggling isOpen off)
  rerender(
    <DocumentDraftReview isOpen={false} onClose={vi.fn()} caseId="c1" newSubtype="evaluation" onSaved={vi.fn()} />,
  );

  // Re-open with a different subtype
  rerender(
    <DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" newSubtype="service" onSaved={vi.fn()} />,
  );
  await waitFor(() => expect(svc.createReportInstance).toHaveBeenCalledWith({ caseId: 'c1', reportSubtype: 'service', title: 'Report' }));
  expect(svc.createReportInstance).toHaveBeenCalledTimes(2);
});

it('captures an approver signature, then approves with the signatureId', async () => {
  svc.getDocumentInstance.mockResolvedValue({ id: 'di-1', title: 'Eval', status: 'in_review', created_by: 'author', report_subtype: 'evaluation', case_id: 'c1' });
  render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /approve/i }));   // opens capture modal
  fireEvent.click(await screen.findByText('mock-capture'));                    // fire onCapture
  await waitFor(() => expect(sigSvc.captureStaffSignature).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'di-1', slot: 'approver', method: 'typed' })));
  await waitFor(() => expect(svc.transitionDocument).toHaveBeenCalledWith('di-1', 'approved', expect.objectContaining({ signatureId: 'sig-1' })));
});

describe('data_destruction approval queue', () => {
  it('drives engineer → witness → approver slots and transitions with approver signatureId', async () => {
    svc.getDocumentInstance.mockResolvedValue({
      id: 'di-dd',
      title: 'Data Destruction Certificate',
      status: 'in_review',
      created_by: 'author',
      report_subtype: 'data_destruction',
      case_id: 'c1',
    });
    // No slots already signed
    sigSvc.listInstanceSignatures.mockResolvedValue([]);
    // Return distinct sig IDs per call: engineer='sig-eng', witness='sig-wit', approver='sig-app'
    sigSvc.captureStaffSignature
      .mockResolvedValueOnce('sig-eng')
      .mockResolvedValueOnce('sig-wit')
      .mockResolvedValueOnce('sig-app');

    render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-dd" onSaved={vi.fn()} />);

    // Click Approve to start the queue
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }));

    // Slot 1: engineer
    fireEvent.click(await screen.findByText('mock-capture'));
    await waitFor(() =>
      expect(sigSvc.captureStaffSignature).toHaveBeenCalledWith(
        expect.objectContaining({ slot: 'engineer' }),
      ),
    );

    // Slot 2: witness
    fireEvent.click(await screen.findByText('mock-capture'));
    await waitFor(() =>
      expect(sigSvc.captureStaffSignature).toHaveBeenCalledWith(
        expect.objectContaining({ slot: 'witness' }),
      ),
    );

    // Slot 3: approver
    fireEvent.click(await screen.findByText('mock-capture'));
    await waitFor(() =>
      expect(sigSvc.captureStaffSignature).toHaveBeenCalledWith(
        expect.objectContaining({ slot: 'approver' }),
      ),
    );

    // All three slots were captured
    expect(sigSvc.captureStaffSignature).toHaveBeenCalledTimes(3);
    const slots = sigSvc.captureStaffSignature.mock.calls.map(
      (c: unknown[]) => (c[0] as { slot: string }).slot,
    );
    expect(slots).toEqual(['engineer', 'witness', 'approver']);

    // transitionDocument called exactly once with 'approved' and the approver's signatureId
    await waitFor(() =>
      expect(svc.transitionDocument).toHaveBeenCalledTimes(1),
    );
    expect(svc.transitionDocument).toHaveBeenCalledWith(
      'di-dd',
      'approved',
      expect.objectContaining({ signatureId: 'sig-app' }),
    );
  });
});

describe('idempotent approve — retry after transition failure', () => {
  it('skips approver capture on retry and calls transitionDocument again when the slot is already persisted', async () => {
    svc.getDocumentInstance.mockResolvedValue({
      id: 'di-1',
      title: 'Eval',
      status: 'in_review',
      created_by: 'author',
      report_subtype: 'evaluation',
      case_id: 'c1',
    });

    // First Approve attempt: no signatures exist yet, capture succeeds, but transition fails.
    // Second Approve attempt: approver row now persisted in DB, transition succeeds.
    sigSvc.listInstanceSignatures
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slot: 'approver', id: 'sig-1', document_instance_id: 'di-1', signed_at: new Date().toISOString() }]);
    sigSvc.captureStaffSignature.mockResolvedValue('sig-1');

    svc.transitionDocument
      .mockRejectedValueOnce(new Error('RPC rejected'))
      .mockResolvedValueOnce(undefined);

    render(<DocumentDraftReview isOpen onClose={vi.fn()} caseId="c1" instanceId="di-1" onSaved={vi.fn()} />);

    // --- First attempt ---
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }));
    fireEvent.click(await screen.findByText('mock-capture'));
    // Transition fails → toast.error + state reset → Approve button re-enabled
    await waitFor(() => expect(svc.transitionDocument).toHaveBeenCalledTimes(1));

    // --- Second attempt — approver slot already persisted ---
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }));
    // captureStaffSignature must NOT be called again for approver
    await waitFor(() => expect(svc.transitionDocument).toHaveBeenCalledTimes(2));
    // Only one capture call total (from the first attempt)
    expect(sigSvc.captureStaffSignature).toHaveBeenCalledTimes(1);
    expect(svc.transitionDocument).toHaveBeenLastCalledWith(
      'di-1',
      'approved',
      expect.objectContaining({ signatureId: 'sig-1' }),
    );
  });
});
