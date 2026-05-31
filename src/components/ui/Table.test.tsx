import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Table } from './Table';

interface Row {
  id: number;
  name: string;
  city: string;
}

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'city', header: 'City' },
];

const data: Row[] = [
  { id: 1, name: 'Alice', city: 'Cairo' },
  { id: 2, name: 'Bob', city: 'Dubai' },
];

describe('Table (cn + tokens + a11y + loading)', () => {
  it('renders a <th scope="col"> for every column', () => {
    render(<Table data={data} columns={columns} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(columns.length);
    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
  });

  it('empty data renders a single cell spanning all columns with t("ui.noData")', () => {
    render(<Table data={[]} columns={columns} />);
    const cell = screen.getByText('No data available');
    expect(cell.tagName).toBe('TD');
    expect(cell).toHaveAttribute('colspan', String(columns.length));
  });

  it('emptyMessage overrides the default empty copy', () => {
    render(<Table data={[]} columns={columns} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('renders N body rows and resolves render() / row[key]', () => {
    render(
      <Table
        data={data}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'city', header: 'City', render: (row: Row) => `City: ${row.city}` },
        ]}
      />,
    );
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 body rows
    expect(rows).toHaveLength(3);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('City: Cairo')).toBeInTheDocument();
    expect(screen.getByText('City: Dubai')).toBeInTheDocument();
  });

  it('zebra striping: even rows use bg-surface, odd rows use bg-slate-50/30', () => {
    render(<Table data={data} columns={columns} />);
    const bodyRows = screen
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('columnheader').length === 0);
    expect(bodyRows[0].className).toContain('bg-surface');
    expect(bodyRows[0].className).not.toContain('bg-white');
    expect(bodyRows[1].className).toContain('bg-slate-50/30');
  });

  it('onRowClick fires once with the row when a row is clicked', () => {
    const clicked: Row[] = [];
    render(<Table data={data} columns={columns} onRowClick={(row) => clicked.push(row)} />);
    const row = screen.getByText('Alice').closest('tr') as HTMLElement;
    row.click();
    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toEqual(data[0]);
  });

  it('does not throw when no onRowClick is provided and a row is clicked', () => {
    render(<Table data={data} columns={columns} />);
    const row = screen.getByText('Alice').closest('tr') as HTMLElement;
    expect(() => row.click()).not.toThrow();
  });

  it('keyboard rows: onRowClick makes rows role="button" + tabIndex=0 and Enter/Space activate', () => {
    const clicked: Row[] = [];
    render(<Table data={data} columns={columns} onRowClick={(row) => clicked.push(row)} />);
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(data.length);
    expect(rows[0]).toHaveAttribute('tabindex', '0');

    const KeyboardEventCtor = window.KeyboardEvent;
    rows[0].dispatchEvent(new KeyboardEventCtor('keydown', { key: 'Enter', bubbles: true }));
    expect(clicked).toHaveLength(1);
    rows[1].dispatchEvent(new KeyboardEventCtor('keydown', { key: ' ', bubbles: true }));
    expect(clicked).toHaveLength(2);
    expect(clicked[1]).toEqual(data[1]);
  });

  it('non-interactive rows have no role="button" / tabIndex', () => {
    render(<Table data={data} columns={columns} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const row = screen.getByText('Alice').closest('tr') as HTMLElement;
    expect(row).not.toHaveAttribute('tabindex');
  });

  it('caption renders an sr-only <caption> when provided', () => {
    const { container } = render(
      <Table data={data} columns={columns} caption="Customers table" />,
    );
    const caption = container.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toBe('Customers table');
    expect(caption?.className).toContain('sr-only');
  });

  it('no caption element by default', () => {
    const { container } = render(<Table data={data} columns={columns} />);
    expect(container.querySelector('caption')).toBeNull();
  });

  it('passes aria-label through to the <table>', () => {
    const { container } = render(
      <Table data={data} columns={columns} aria-label="Customers" />,
    );
    const table = container.querySelector('table') as HTMLElement;
    expect(table).toHaveAttribute('aria-label', 'Customers');
  });

  it('PRECEDENCE: consumer className rounded-none beats base rounded-lg on the container', () => {
    const { container } = render(
      <Table data={data} columns={columns} className="rounded-none" />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('rounded-none');
    expect(outer.className).not.toContain('rounded-lg');
  });

  it('loading=true renders skeletonRows rows, each with one Skeleton per column, no data or empty cell', () => {
    const { container } = render(
      <Table data={data} columns={columns} loading skeletonRows={3} />,
    );
    const skeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(skeletons).toHaveLength(3 * columns.length);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('loading defaults to 5 skeleton rows', () => {
    const { container } = render(<Table data={[]} columns={columns} loading />);
    const skeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(skeletons).toHaveLength(5 * columns.length);
  });

  it('rowKey customizes the React key without changing rendered output', () => {
    const rendered = render(
      <Table data={data} columns={columns} rowKey={(row) => `row-${row.id}`} />,
    );
    expect(rendered.getByText('Alice')).toBeInTheDocument();
    expect(rendered.getByText('Bob')).toBeInTheDocument();
  });
});
