import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigurableDataTable } from './ConfigurableDataTable';
import type { ResolvedTableView, TableColumnDef } from '../../lib/tables/types';

interface Row {
  id: string;
  name: string;
  flagged: boolean;
}

const rows: Row[] = [
  { id: '1', name: 'Alpha', flagged: false },
  { id: '2', name: 'Beta', flagged: true },
];

const columns: TableColumnDef<Row>[] = [
  {
    key: 'name',
    label: 'Name',
    minWidth: 100,
    priority: 1,
    defaultVisible: true,
    render: (r) => <span>{r.name}</span>,
  },
];

const view: ResolvedTableView = { orderedVisible: ['name'], locked: [], widths: {} };

describe('ConfigurableDataTable rowClassName', () => {
  it('applies rowClassName only to the rows whose predicate matches', () => {
    render(
      <ConfigurableDataTable
        rows={rows}
        columns={columns}
        view={view}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.flagged ? 'bg-danger-muted' : undefined)}
      />,
    );

    // [0] is the desktop <tr>; [1] is the mobile stacked card.
    const flaggedRow = screen.getAllByText('Beta')[0].closest('tr');
    const normalRow = screen.getAllByText('Alpha')[0].closest('tr');

    expect(flaggedRow?.className).toContain('bg-danger-muted');
    expect(normalRow?.className).not.toContain('bg-danger-muted');
  });
});
