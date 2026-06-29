import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getDocumentInstance: vi.fn(),
  getDocumentInstanceSections: vi.fn(),
  createReportInstance: vi.fn(),
  archiveDocumentInstance: vi.fn(),
  transitionDocument: vi.fn(),
}));
vi.mock('../../lib/documentInstanceService', () => svc);
vi.mock('../../lib/reportPDFService', () => ({
  reportPDFService: { generateDocumentInstanceAsBlob: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })) },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reviewer' }, profile: { id: 'reviewer' } }) }));
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
