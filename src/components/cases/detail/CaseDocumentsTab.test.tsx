import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseDocumentsTab } from './CaseDocumentsTab';

const docs = [
  { id: 'd1', title: 'Evaluation Report', document_number: 'REP-EVAL-0007', report_subtype: 'evaluation', status: 'draft' as const, version_number: 1, visible_to_customer: false, created_at: '2026-06-02T00:00:00Z' },
  { id: 'd2', title: 'Service Report', document_number: 'REP-SVC-0003', report_subtype: 'service', status: 'delivered' as const, version_number: 2, visible_to_customer: true, created_at: '2026-06-03T00:00:00Z' },
];

it('lists documents with number, title and a status badge', () => {
  render(<CaseDocumentsTab documents={docs} onNewDocument={vi.fn()} onView={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText('Evaluation Report')).toBeInTheDocument();
  expect(screen.getByText('REP-EVAL-0007')).toBeInTheDocument();
  expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  expect(screen.getByText(/Delivered/i)).toBeInTheDocument();
});

it('fires onNewDocument when the New button is clicked', () => {
  const onNew = vi.fn();
  render(<CaseDocumentsTab documents={[]} onNewDocument={onNew} onView={vi.fn()} onEdit={vi.fn()} />);
  screen.getByRole('button', { name: /new document/i }).click();
  expect(onNew).toHaveBeenCalledOnce();
});

it('shows an empty state when there are no documents', () => {
  render(<CaseDocumentsTab documents={[]} onNewDocument={vi.fn()} onView={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText(/no documents/i)).toBeInTheDocument();
});
