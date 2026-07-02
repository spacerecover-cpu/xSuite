// Server-side option loading for entity pickers.
//
// PostgREST caps responses at 1000 rows, so "fetch all then filter in the
// combobox" silently hides most of a large tenant's customers/companies
// (this tenant: 3,367 customers, 1,110 companies). These hooks pair with
// SearchableSelect's onSearchTermChange: the typed term queries the server
// across the entity's contact fields, and the currently-selected row is
// always merged in so the trigger label renders.

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { sanitizeFilterValue } from './postgrestSanitizer';

export const PICKER_PAGE_SIZE = 50;
const DEBOUNCE_MS = 250;

/** Pure: the selected row appears exactly once, first. */
export function mergeSelectedRow<T extends { id: string }>(rows: T[], selected: T | null): T[] {
  if (!selected) return rows;
  return [selected, ...rows.filter((r) => r.id !== selected.id)];
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return debounced;
}

export interface CustomerPickerRow {
  id: string;
  customer_number: string | null;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
}

const CUSTOMER_PICKER_FIELDS = 'id, customer_number, customer_name, email, mobile_number';

/**
 * Customer options for pickers: empty term → first page by name; a term →
 * server search across name/email/mobile/number. Pass the currently-selected
 * id so it stays present regardless of the search results.
 */
export function useCustomerPickerRows(selectedId?: string) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['picker_customers', debounced.trim(), selectedId ?? ''],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<CustomerPickerRow[]> => {
      let q = supabase
        .from('customers_enhanced')
        .select(CUSTOMER_PICKER_FIELDS)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('customer_name')
        .limit(PICKER_PAGE_SIZE);
      const s = sanitizeFilterValue(debounced.trim());
      if (s) {
        q = q.or(
          `customer_name.ilike.%${s}%,email.ilike.%${s}%,mobile_number.ilike.%${s}%,customer_number.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as CustomerPickerRow[];

      if (selectedId && !list.some((r) => r.id === selectedId)) {
        const { data: selected } = await supabase
          .from('customers_enhanced')
          .select(CUSTOMER_PICKER_FIELDS)
          .eq('id', selectedId)
          .maybeSingle();
        list = mergeSelectedRow(list, (selected as CustomerPickerRow | null) ?? null);
      }
      return list;
    },
  });

  return { rows, isLoading, onSearchTermChange: setTerm };
}

export interface CompanyPickerRow {
  id: string;
  company_number: string | null;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

const COMPANY_PICKER_FIELDS = 'id, company_number, name, company_name, email, phone';

/** Company options for pickers — same contract as the customer hook. */
export function useCompanyPickerRows(selectedId?: string, opts?: { activeOnly?: boolean }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const activeOnly = opts?.activeOnly ?? false;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['picker_companies', debounced.trim(), selectedId ?? '', activeOnly],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<CompanyPickerRow[]> => {
      let q = supabase
        .from('companies')
        .select(COMPANY_PICKER_FIELDS)
        .is('deleted_at', null)
        .order('name')
        .limit(PICKER_PAGE_SIZE);
      if (activeOnly) q = q.eq('is_active', true);
      const s = sanitizeFilterValue(debounced.trim());
      if (s) {
        q = q.or(
          `name.ilike.%${s}%,company_name.ilike.%${s}%,company_number.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as CompanyPickerRow[];

      if (selectedId && !list.some((r) => r.id === selectedId)) {
        const { data: selected } = await supabase
          .from('companies')
          .select(COMPANY_PICKER_FIELDS)
          .eq('id', selectedId)
          .maybeSingle();
        list = mergeSelectedRow(list, (selected as CompanyPickerRow | null) ?? null);
      }
      return list;
    },
  });

  return { rows, isLoading, onSearchTermChange: setTerm };
}
