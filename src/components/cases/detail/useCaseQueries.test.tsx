import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

type Call = { table: string; method: string; args: unknown[] };

const { from, calls } = vi.hoisted(() => ({ from: vi.fn(), calls: [] as Call[] }));

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from } }));
vi.mock('../../../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/quotesService', () => ({ quotesService: { getQuotesByCaseId: vi.fn(async () => []) } }));
vi.mock('@/lib/invoiceService', () => ({ invoiceService: { getInvoicesByCaseId: vi.fn(async () => []) } }));
vi.mock('@/lib/caseFinanceService', () => ({ getCaseFinancialSummary: vi.fn(async () => null) }));
vi.mock('../../../lib/documentInstanceService', () => ({ listDocumentInstances: vi.fn(async () => []) }));

import { useCaseQueries } from './useCaseQueries';

/** All FK columns null so the hook's per-relation follow-up queries short-circuit. */
const CASE_ROW = { id: 'case-1', customer_id: null, contact_id: null, service_type_id: null, created_by: null, assigned_engineer_id: null, company_id: null, updated_by: null };

/** Chainable stand-in for the PostgREST builder that records every filter call. */
function builder(table: string, result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'in', 'not']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onOk, onErr);
  return chain;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useCaseQueries soft-delete filtering', () => {
  beforeEach(() => {
    calls.length = 0;
    from.mockReset();
    from.mockImplementation((table: string) =>
      builder(table, table === 'cases' ? { data: CASE_ROW, error: null } : { data: [], error: null }),
    );
  });

  it('excludes soft-deleted cases from the case detail query', async () => {
    const { result } = renderHook(() => useCaseQueries('case-1'), { wrapper });

    await waitFor(() => expect(result.current.caseData).toBeTruthy());

    const caseFilters = calls.filter((c) => c.table === 'cases' && c.method === 'is');
    expect(caseFilters).toContainEqual(expect.objectContaining({ args: ['deleted_at', null] }));
  });

  it('excludes soft-deleted devices from the devices query', async () => {
    renderHook(() => useCaseQueries('case-1'), { wrapper });

    await waitFor(() => expect(calls.some((c) => c.table === 'case_devices')).toBe(true));

    const deviceFilters = calls.filter((c) => c.table === 'case_devices' && c.method === 'is');
    expect(deviceFilters).toContainEqual(expect.objectContaining({ args: ['deleted_at', null] }));
  });
});
