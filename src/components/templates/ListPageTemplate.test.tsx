// src/components/templates/ListPageTemplate.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext';

// CollapsibleKpis (rendered around the kpis slot) reads/persists a user pref;
// stub it so the KPI row renders deterministically without a live supabase call.
vi.mock('../../lib/uiPrefsService', () => ({
  UI_FLAG_KPIS_COLLAPSED: 'kpisCollapsed',
  readUiFlagHint: () => false,
  loadUiFlag: async () => false,
  setUiFlag: async () => {},
}));

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

// ---------------------------------------------------------------------------
// Focus retention.
//
// The toolbar used to live INSIDE the loading swap, so every refetch unmounted
// it. A search box lives in that toolbar: typing a character triggered a fetch,
// React tore the input out of the DOM, and the remount lost focus and cursor
// position — the user had to click back in before each keystroke.
// ---------------------------------------------------------------------------

describe('ListPageTemplate — the toolbar survives loading', () => {
  const withToolbar = (loading: boolean) => (
    <ListPageTemplate
      title="X"
      loading={loading}
      kpis={<div>KPIS</div>}
      toolbar={<input aria-label="Search" defaultValue="" />}
      table={<div>TABLE</div>}
    />
  );

  it('keeps the toolbar and kpis mounted while loading', () => {
    renderTemplate(withToolbar(true));
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByText('KPIS')).toBeInTheDocument();
    // results still swap out — that part of the old behaviour is intended
    expect(screen.queryByText('TABLE')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('does not remount the input across a loading cycle, so focus survives', () => {
    const { rerender } = renderTemplate(withToolbar(false));
    const input = screen.getByLabelText('Search') as HTMLInputElement;
    input.focus();
    input.value = '77';
    input.setSelectionRange(2, 2);
    expect(document.activeElement).toBe(input);

    // a keystroke kicks off a fetch
    rerender(
      <MemoryRouter><HeaderSlotProvider>{withToolbar(true)}</HeaderSlotProvider></MemoryRouter>,
    );

    // same DOM node, still focused, cursor intact
    expect(screen.getByLabelText('Search')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('77');
    expect(input.selectionStart).toBe(2);

    // and after the fetch resolves
    rerender(
      <MemoryRouter><HeaderSlotProvider>{withToolbar(false)}</HeaderSlotProvider></MemoryRouter>,
    );
    expect(screen.getByLabelText('Search')).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it('body skeleton does not repeat the kpi/toolbar chrome', () => {
    renderTemplate(withToolbar(true));
    // one search box, not two (the old full-page skeleton drew its own strip)
    expect(screen.getAllByLabelText('Search')).toHaveLength(1);
  });
});
