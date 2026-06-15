import { supabase } from './supabaseClient';

export interface VATRecord {
  id?: string;
  record_type: string;
  record_id: string;
  vat_amount: number;
  vat_rate: number;
  tax_period?: string | null;
  created_at?: string;
  deleted_at?: string | null;
}

export interface VATReturn {
  id?: string;
  period_start: string;
  period_end: string;
  output_vat: number;
  input_vat: number;
  net_vat: number;
  status: 'draft' | 'review' | 'submitted' | 'paid';
  submitted_at?: string | null;
  submitted_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface VATSummary {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVAT: number;
  recordCount: number;
}

export const fetchVATRecords = async (filters?: {
  recordType?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  let query = supabase
    .from('vat_records')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters?.recordType && filters.recordType !== 'all') {
    query = query.eq('record_type', filters.recordType);
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const fetchVATReturns = async (filters?: {
  status?: string;
  year?: number;
}) => {
  let query = supabase
    .from('vat_returns')
    .select('*')
    .is('deleted_at', null)
    .order('period_end', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.year) {
    const startDate = `${filters.year}-01-01`;
    const endDate = `${filters.year}-12-31`;
    query = query.gte('period_start', startDate).lte('period_end', endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const fetchVATReturnById = async (id: string) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const calculateVATForPeriod = async (
  periodStart: string,
  periodEnd: string
): Promise<VATSummary> => {
  const { data: records, error } = await supabase
    .from('vat_records')
    .select('record_type, vat_amount')
    .is('deleted_at', null)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  if (error) throw error;

  const sales = records?.filter(r => r.record_type === 'sale') || [];
  const purchases = records?.filter(r => r.record_type === 'purchase') || [];

  const totalOutputVAT = sales.reduce((sum, r) => sum + (r.vat_amount || 0), 0);
  const totalInputVAT = purchases.reduce((sum, r) => sum + (r.vat_amount || 0), 0);
  const netVAT = totalOutputVAT - totalInputVAT;

  return {
    totalOutputVAT,
    totalInputVAT,
    netVAT,
    recordCount: records?.length || 0,
  };
};

export const createVATReturn = async (
  vatReturn: Omit<VATReturn, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .insert([vatReturn as never])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createVATReturnFromPeriod = async (
  periodStart: string,
  periodEnd: string
) => {
  const summary = await calculateVATForPeriod(periodStart, periodEnd);

  return createVATReturn({
    period_start: periodStart,
    period_end: periodEnd,
    output_vat: summary.totalOutputVAT,
    input_vat: summary.totalInputVAT,
    net_vat: summary.netVAT,
    status: 'draft',
  });
};

export const updateVATReturn = async (
  id: string,
  vatReturn: Partial<VATReturn>
) => {
  const { data, error } = await supabase
    .from('vat_returns')
    .update(vatReturn)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const updateVATReturnStatus = async (
  id: string,
  status: VATReturn['status'],
  submittedBy?: string
) => {
  const updateData: Partial<VATReturn> = { status };

  if (status === 'submitted' && submittedBy) {
    updateData.submitted_at = new Date().toISOString();
    updateData.submitted_by = submittedBy;
  }

  return updateVATReturn(id, updateData);
};

export const deleteVATReturn = async (id: string) => {
  const { error } = await supabase
    .from('vat_returns')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const createVATRecord = async (
  record: Omit<VATRecord, 'id' | 'created_at' | 'deleted_at'>
) => {
  const { data, error } = await supabase
    .from('vat_records')
    .insert([record as never])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const createVATRecordFromInvoice = async (
  invoiceId: string,
  invoiceData: {
    tax_amount: number;
    tax_rate: number;
  }
) => {
  return createVATRecord({
    record_type: 'sale',
    record_id: invoiceId,
    vat_amount: invoiceData.tax_amount,
    vat_rate: invoiceData.tax_rate,
  });
};

/** D1 — record INPUT (purchase) VAT so vat_returns.input_vat is non-zero and the
 *  net VAT filed with the authority is correct. Source: expenses / purchase orders
 *  carrying a tax_amount. Mirrors createVATRecordFromInvoice but record_type='purchase'. */
export const createVATRecordFromPurchase = async (
  purchaseId: string,
  purchaseData: { tax_amount: number; tax_rate: number },
) => {
  return createVATRecord({
    record_type: 'purchase',
    record_id: purchaseId,
    vat_amount: purchaseData.tax_amount,
    vat_rate: purchaseData.tax_rate,
  });
};

export const getVATStats = async (filters?: {
  dateFrom?: string;
  dateTo?: string;
}) => {
  const dateFrom = filters?.dateFrom || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const dateTo = filters?.dateTo || new Date().toISOString().split('T')[0];

  const summary = await calculateVATForPeriod(dateFrom, dateTo);

  const { data: returns } = await supabase
    .from('vat_returns')
    .select('status')
    .is('deleted_at', null)
    .gte('period_start', dateFrom)
    .lte('period_end', dateTo);

  return {
    ...summary,
    draftReturns: returns?.filter(r => r.status === 'draft').length || 0,
    submittedReturns: returns?.filter(r => r.status === 'submitted').length || 0,
    paidReturns: returns?.filter(r => r.status === 'paid').length || 0,
  };
};

export const getVATRecordsByReturn = async (
  periodStart: string,
  periodEnd: string
) => {
  const { data, error } = await supabase
    .from('vat_records')
    .select('*')
    .is('deleted_at', null)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getQuarterlyVATSummary = async (year: number) => {
  const quarters = [
    { q: 1, start: `${year}-01-01`, end: `${year}-03-31` },
    { q: 2, start: `${year}-04-01`, end: `${year}-06-30` },
    { q: 3, start: `${year}-07-01`, end: `${year}-09-30` },
    { q: 4, start: `${year}-10-01`, end: `${year}-12-31` },
  ];

  const summaries = await Promise.all(
    quarters.map(async ({ q, start, end }) => {
      const summary = await calculateVATForPeriod(start, end);
      return { quarter: q, ...summary };
    })
  );

  return summaries;
};

export const vatService = {
  fetchVATRecords,
  fetchVATReturns,
  fetchVATReturnById,
  calculateVATForPeriod,
  createVATReturn,
  createVATReturnFromPeriod,
  updateVATReturn,
  updateVATReturnStatus,
  deleteVATReturn,
  createVATRecord,
  createVATRecordFromInvoice,
  createVATRecordFromPurchase,
  getVATStats,
  getVATRecordsByReturn,
  getQuarterlyVATSummary,
};
