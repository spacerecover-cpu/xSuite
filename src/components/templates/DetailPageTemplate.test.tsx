// src/components/templates/DetailPageTemplate.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailPageTemplate } from './DetailPageTemplate';

const header = { breadcrumbs: [{ label: 'Invoices', to: '/invoices' }, { label: 'Invoice INV-1' }] };
const renderDt = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DetailPageTemplate', () => {
  it('renders the header title and the children body', () => {
    renderDt(<DetailPageTemplate header={header}><div>BODY</div></DetailPageTemplate>);
    expect(screen.getByRole('heading', { name: 'Invoice INV-1' })).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders the alerts zone before the body', () => {
    renderDt(<DetailPageTemplate header={header} alerts={<div>ALERT</div>}><div>BODY</div></DetailPageTemplate>);
    expect(screen.getByText('ALERT')).toBeInTheDocument();
  });

  it('renders the skeleton (not the body) while loading', () => {
    renderDt(<DetailPageTemplate header={header} loading><div>BODY</div></DetailPageTemplate>);
    expect(screen.queryByText('BODY')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders not-found with the backTo label when notFound', () => {
    renderDt(
      <DetailPageTemplate header={header} notFound backTo={{ to: '/invoices', label: 'Back to Invoices' }}>
        <div>BODY</div>
      </DetailPageTemplate>,
    );
    expect(screen.queryByText('BODY')).toBeNull();
    expect(screen.getByText('Back to Invoices')).toBeInTheDocument();
  });

  it('renders the outside slot even during loading', () => {
    renderDt(
      <DetailPageTemplate header={header} loading outside={<div>PRINT</div>}><div>BODY</div></DetailPageTemplate>,
    );
    expect(screen.getByText('PRINT')).toBeInTheDocument();
    expect(screen.queryByText('BODY')).toBeNull();
  });

  it('honors loadingFallback / notFoundFallback overrides', () => {
    const { rerender } = renderDt(
      <DetailPageTemplate header={header} loading loadingFallback={<div>LOAD</div>}><div>B</div></DetailPageTemplate>,
    );
    expect(screen.getByText('LOAD')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <DetailPageTemplate header={header} notFound notFoundFallback={<div>NF</div>}><div>B</div></DetailPageTemplate>
      </MemoryRouter>,
    );
    expect(screen.getByText('NF')).toBeInTheDocument();
  });
});
