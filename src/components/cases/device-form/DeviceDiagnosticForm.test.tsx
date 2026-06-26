// src/components/cases/device-form/DeviceDiagnosticForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Sidebar Recent Notes panel reads case notes directly off the client; stub it
// so the form renders without network. The notes query returns empty, which
// keeps the dependent author query disabled.
vi.mock('../../../lib/supabaseClient', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
    in: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => builder } };
});
vi.mock('../../../contexts/TenantConfigContext', () => ({ useDateTimeConfig: () => ({}) }));

import { DeviceDiagnosticForm } from './DeviceDiagnosticForm';

const opts = { service_problems: [{ id: 'No power', name: 'No power' }] } as Record<string, { id: string; name: string }[]>;

function renderForm(state: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DeviceDiagnosticForm
          state={state}
          onChange={vi.fn()}
          options={opts}
          caseId="case-1"
          engineerOptions={[]}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeviceDiagnosticForm', () => {
  it('renders the three sections, key fields, and the context sidebar', () => {
    renderForm();
    expect(screen.getByText('Diagnostic Information')).toBeInTheDocument();
    expect(screen.getByText('Diagnosis & Next Step')).toBeInTheDocument();
    expect(screen.getByText('Outcome')).toBeInTheDocument();
    expect(screen.getByText('Device Problem')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Current Status')).toBeInTheDocument();
    expect(screen.getByText('Engineer Notes')).toBeInTheDocument();
    // Sidebar panels
    expect(screen.getByText('Device Summary')).toBeInTheDocument();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Recent Notes')).toBeInTheDocument();
  });

  it('does not render a device password field', () => {
    renderForm();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
  });
});
