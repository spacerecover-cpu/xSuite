import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailPageHeader } from './DetailPageHeader';

function renderHeader(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('DetailPageHeader', () => {
  it('renders ancestor crumbs as links and the final crumb as the title (not a link)', () => {
    renderHeader(
      <DetailPageHeader
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: 'Invoice INV-0042' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
    const title = screen.getByRole('heading', { name: 'Invoice INV-0042' });
    expect(title).toBeInTheDocument();
    expect(title).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Invoice INV-0042' })).not.toBeInTheDocument();
  });

  it('renders badges, actions, and meta when provided', () => {
    renderHeader(
      <DetailPageHeader
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: 'Acme Corp' }]}
        badges={<span>Active</span>}
        actions={<button>Edit</button>}
        meta={<span>created today</span>}
      />,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('created today')).toBeInTheDocument();
  });

  it('omits the breadcrumb nav when only the current crumb is given', () => {
    const { container } = renderHeader(<DetailPageHeader breadcrumbs={[{ label: 'Solo' }]} />);
    expect(screen.getByRole('heading', { name: 'Solo' })).toBeInTheDocument();
    expect(container.querySelector('nav')).toBeNull();
  });
});
