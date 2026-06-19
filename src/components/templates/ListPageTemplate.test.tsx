// src/components/templates/ListPageTemplate.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';
import { ListPageTemplate } from './ListPageTemplate';

function renderTemplate(ui: React.ReactNode) {
  return render(
    <MemoryRouter><HeaderSlotProvider>{ui}</HeaderSlotProvider></MemoryRouter>,
  );
}

describe('ListPageTemplate', () => {
  it('renders the kpis, toolbar, table, footer and children slots', () => {
    renderTemplate(
      <ListPageTemplate
        title="Invoices"
        kpis={<div>KPIS</div>}
        toolbar={<div>TOOLBAR</div>}
        table={<div>TABLE</div>}
        footer={<div>FOOTER</div>}
      >
        <div>MODAL</div>
      </ListPageTemplate>,
    );
    expect(screen.getByText('KPIS')).toBeInTheDocument();
    expect(screen.getByText('TOOLBAR')).toBeInTheDocument();
    expect(screen.getByText('TABLE')).toBeInTheDocument();
    expect(screen.getByText('FOOTER')).toBeInTheDocument();
    expect(screen.getByText('MODAL')).toBeInTheDocument();
  });

  it('shows the standard skeleton and hides the table while loading', () => {
    renderTemplate(<ListPageTemplate title="X" loading table={<div>TABLE</div>} />);
    expect(screen.queryByText('TABLE')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders the empty slot instead of the table when isEmpty', () => {
    renderTemplate(<ListPageTemplate title="X" isEmpty empty={<div>EMPTY</div>} table={<div>TABLE</div>} />);
    expect(screen.getByText('EMPTY')).toBeInTheDocument();
    expect(screen.queryByText('TABLE')).toBeNull();
  });

  it('renders the Pager only when pager props are supplied', () => {
    const { rerender } = renderTemplate(<ListPageTemplate title="X" table={<div>T</div>} />);
    expect(screen.queryByText('Previous')).toBeNull();
    rerender(
      <MemoryRouter><HeaderSlotProvider>
        <ListPageTemplate title="X" table={<div>T</div>} pager={{ page: 0, pageSize: 50, total: 100, onPageChange: () => {}, itemNoun: 'x' }} />
      </HeaderSlotProvider></MemoryRouter>,
    );
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('honors the loadingFallback escape hatch', () => {
    renderTemplate(<ListPageTemplate title="X" loading loadingFallback={<div>CUSTOM</div>} table={<div>T</div>} />);
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });
});
