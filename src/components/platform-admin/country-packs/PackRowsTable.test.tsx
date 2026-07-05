import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PackRowsTable, type PackColumn } from './PackRowsTable';

type Row = { id: string; component_code: string; rate: number };
const columns: PackColumn<Row>[] = [
  { key: 'component_code', label: 'Component', render: (r) => r.component_code, input: { type: 'text', required: true } },
  { key: 'rate', label: 'Rate', render: (r) => String(r.rate), input: { type: 'number', required: true } },
];

describe('PackRowsTable (P3)', () => {
  it('renders rows, opens the add form, and submits a draft to onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PackRowsTable title="Rates" rows={[{ id: 'r1', component_code: 'VAT', rate: 5 }]}
                          columns={columns} disabled={false} onSave={onSave} />);
    expect(screen.getByText('VAT')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add row/i }));
    await userEvent.type(screen.getByLabelText('Component'), 'CGST');
    await userEvent.type(screen.getByLabelText('Rate'), '9');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ component_code: 'CGST', rate: 9 }, null);
  });

  it('disables mutation when there is no open draft', () => {
    render(<PackRowsTable title="Rates" rows={[]} columns={columns} disabled onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add row/i })).toBeDisabled();
    expect(screen.getByText(/create a draft to edit/i)).toBeInTheDocument();
  });
});
