import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmployeesList } from './EmployeesList';

// The list is server-paginated. The KPIs and the pager total must come from
// global count queries, never from the length of the rendered page. The mock
// returns a SINGLE employee row but a global count of 120 — so any code that
// derives totals from the page array (the pre-pagination bug) shows 1, while
// the correct count-based code shows 120.
vi.mock('../../lib/supabaseClient', () => {
  // A universal thenable chain answers every builder method so the paged list
  // query (select/is/or/eq/order/range) and the head:count stats queries all
  // resolve from one shape.
  const thenableChain = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'or', 'eq', 'order', 'range', 'gte', 'lte', 'ilike', 'in']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() =>
        thenableChain({
          data: [
            {
              id: 'e1',
              employee_number: 'EMP-001',
              employment_status: 'active',
              employment_type: 'full_time',
              profiles: { full_name: 'Ada Lovelace' },
              departments: { name: 'Engineering' },
              positions: { title: 'Lead Engineer' },
            },
          ],
          count: 120,
          error: null,
        }),
      ),
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmployeesList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployeesList — server-side pagination', () => {
  it('drives the pager total from the server count, not the rendered page length', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/of 120/)).toBeInTheDocument());
  });

  it('renders the current page of employees', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
  });

  it('derives the Total Employees KPI from the global count, not the page array', async () => {
    renderPage();
    // exactly one row is rendered, but the KPI must read the count (120)
    await waitFor(() => expect(screen.getByText(/120 Total Employees/)).toBeInTheDocument());
  });
});
