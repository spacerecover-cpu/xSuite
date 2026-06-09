import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: number;
  name: string;
  city: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'city', header: 'City' },
];

const data: Row[] = [
  { id: 1, name: 'Alice', city: 'Cairo' },
  { id: 2, name: 'Bob', city: 'Dubai' },
];

const rowKey = (row: Row) => row.id;

describe('DataTable', () => {
  it('renders a row per data item and resolves render() / row[key]', () => {
    render(
      <DataTable
        data={data}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'city', header: 'City', render: (row) => `City: ${row.city}` },
        ]}
        rowKey={rowKey}
      />,
    );
    // The component renders both a desktop table and a mobile card layout
    // (CSS controls which is visible), so values appear in both subtrees.
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('City: Cairo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('City: Dubai').length).toBeGreaterThanOrEqual(1);

    // Desktop table body has exactly one row per data item.
    const bodyRows = screen
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('columnheader').length === 0);
    expect(bodyRows).toHaveLength(data.length);
  });

  it('renders a <th scope="col"> for every column', () => {
    render(<DataTable data={data} columns={columns} rowKey={rowKey} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(columns.length);
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('loading shows skeleton rows instead of data or empty copy', () => {
    const { container } = render(
      <DataTable data={data} columns={columns} loading skeletonRows={3} rowKey={rowKey} />,
    );
    // 3 desktop skeleton rows × 2 columns = 6, plus 3 mobile cards × 3 bars = 9.
    const skeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(skeletons.length).toBe(3 * columns.length + 3 * 3);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('empty shows the default translated message', () => {
    render(<DataTable data={[]} columns={columns} rowKey={rowKey} />);
    // Rendered in both the desktop <td> and the mobile card container.
    const matches = screen.getAllByText('No data available');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const cell = matches.find((el) => el.tagName === 'TD');
    expect(cell).toBeDefined();
    expect(cell).toHaveAttribute('colspan', String(columns.length));
  });

  it('empty prop overrides the default empty copy', () => {
    render(<DataTable data={[]} columns={columns} empty="Nothing here" rowKey={rowKey} />);
    expect(screen.getAllByText('Nothing here').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('sortable header sets aria-sort and calls onSort (controlled)', () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <DataTable
        data={data}
        columns={columns}
        rowKey={rowKey}
        sortKey={null}
        sortDir="asc"
        onSort={onSort}
      />,
    );

    const nameHeader = screen.getByRole('columnheader', { name: /name/i });
    // Not sorted yet → aria-sort="none".
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    // Non-sortable column carries no aria-sort.
    expect(screen.getByRole('columnheader', { name: 'City' })).not.toHaveAttribute('aria-sort');

    fireEvent.click(within(nameHeader).getByRole('button'));
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('name', 'asc');

    // Reflect a controlled ascending sort and verify aria-sort follows.
    rerender(
      <DataTable
        data={data}
        columns={columns}
        rowKey={rowKey}
        sortKey="name"
        sortDir="asc"
        onSort={onSort}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('uncontrolled sort toggles aria-sort asc→desc on repeated clicks', () => {
    render(<DataTable data={data} columns={columns} rowKey={rowKey} />);
    const header = screen.getByRole('columnheader', { name: /name/i });
    const button = within(header).getByRole('button');

    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('row checkbox toggles selection via onToggle', () => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        rowKey={rowKey}
        selection={{ selectedIds: new Set(), onToggle, onToggleAll }}
      />,
    );

    // One desktop + one mobile checkbox per row; assert the labelled per-row control fires.
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /select row 1/i });
    expect(rowCheckboxes.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(rowCheckboxes[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(1, data[0]);
  });

  it('header select-all checkbox calls onToggleAll', () => {
    const onToggleAll = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        rowKey={rowKey}
        selection={{ selectedIds: new Set(), onToggle: vi.fn(), onToggleAll }}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: /select all rows/i });
    fireEvent.click(selectAll);
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('onRowClick makes desktop rows keyboard-activatable (role=button, tabIndex, Enter/Space)', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable data={data} columns={columns} rowKey={rowKey} onRowClick={onRowClick} />,
    );
    // Desktop <tr role="button"> + mobile <div role="button"> = 2 per row.
    const interactive = screen.getAllByRole('button');
    const trButtons = interactive.filter((el) => el.tagName === 'TR');
    expect(trButtons).toHaveLength(data.length);
    expect(trButtons[0]).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(trButtons[0], { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
    fireEvent.keyDown(trButtons[1], { key: ' ' });
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });

  it('renders a pagination footer and fires onPageChange', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        rowKey={rowKey}
        pagination={{ page: 1, pageSize: 10, total: 25, onPageChange }}
      />,
    );
    const next = screen.getByRole('button', { name: /next page/i });
    const prev = screen.getByRole('button', { name: /previous page/i });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
