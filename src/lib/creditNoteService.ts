import { supabase } from './supabaseClient';
import type { Database, Json } from '../types/database.types';

type CreditNote = Database['public']['Tables']['credit_notes']['Row'];

export interface CreditNoteInput {
  invoice_id?: string | null;
  case_id?: string | null;
  customer_id?: string | null;
  company_id?: string | null;
  credit_type: 'adjustment' | 'refund' | 'advance_adjustment' | 'writeoff';
  currency: string;
  exchange_rate?: number;
  subtotal?: number;
  tax_rate?: number;
  tax_amount: number;
  total_amount: number;
  reason_code?: string;
  reason_notes?: string;
}

export interface CreditNoteItemInput {
  description?: string;
  quantity?: number;
  unit_price?: number;
  unit_code?: string | null;
  unit_label?: string | null;
  item_code?: string | null;
  tax_treatment?: string;
  treatment_reason_code?: string | null;
  discount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  sort_order?: number;
}

export interface CreditNoteAllocationInput {
  invoice_id: string;
  amount: number;
}

export async function issueCreditNote(
  input: CreditNoteInput,
  items: CreditNoteItemInput[],
): Promise<CreditNote> {
  const { data, error } = await supabase.rpc('issue_credit_note', {
    p_cn: input as unknown as Json,
    p_items: items as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CreditNote;
}

export async function applyCreditNote(
  creditNoteId: string,
  allocations: CreditNoteAllocationInput[],
): Promise<CreditNote> {
  const { data, error } = await supabase.rpc('apply_credit_note', {
    p_credit_note_id: creditNoteId,
    p_allocations: allocations as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CreditNote;
}

export async function voidCreditNote(creditNoteId: string, reason: string): Promise<CreditNote> {
  if (!reason.trim()) throw new Error('A reason is required to void a credit note');
  const { data, error } = await supabase.rpc('void_credit_note', {
    p_credit_note_id: creditNoteId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CreditNote;
}

export async function getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CreditNote[];
}

export async function getCreditNotesByCase(caseId: string): Promise<CreditNote[]> {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CreditNote[];
}

// Lazy-import pdfService so pdfmake stays out of any bundle that only reads credit notes.
export async function generateCreditNotePDF(creditNoteId: string, download = true) {
  const { generateCreditNote } = await import('./pdf/pdfService');
  return generateCreditNote(creditNoteId, download);
}
