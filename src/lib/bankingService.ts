import { supabase, resolveTenantId } from './supabaseClient';
import { deriveInvoiceStatus } from './invoiceStatus';
import { sanitizeFilterValue, isValidUuid } from './postgrestSanitizer';
import { sumBankBalanceBase } from './financialReportsService';
import type { Database } from '../types/database.types';

type BankAccountRow = Database['public']['Tables']['bank_accounts']['Row'];
type BankAccountInsert = Database['public']['Tables']['bank_accounts']['Insert'];
type BankAccountUpdate = Database['public']['Tables']['bank_accounts']['Update'];
type PaymentReceiptInsert = Database['public']['Tables']['payment_receipts']['Insert'];
type PaymentDisbursementInsert = Database['public']['Tables']['payment_disbursements']['Insert'];
type PaymentDisbursementUpdate = Database['public']['Tables']['payment_disbursements']['Update'];
type AccountTransferInsert = Database['public']['Tables']['account_transfers']['Insert'];
type AccountTransferUpdate = Database['public']['Tables']['account_transfers']['Update'];
type ReceiptAllocationInsert = Database['public']['Tables']['receipt_allocations']['Insert'];

export interface BankAccount {
  id: string;
  account_name: string;
  account_number: string | null;
  bank_name: string | null;
  account_type: 'bank' | 'cash' | 'mobile';
  branch_code?: string | null;
  swift_code?: string | null;
  iban?: string | null;
  currency?: string | null;
  currency_id?: string | null;
  current_balance: number;
  opening_balance: number;
  is_active: boolean;
  is_default: boolean;
  employee_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  currency_ref?: {
    code: string;
    symbol: string;
    name: string;
  } | null;
  employee?: {
    id: string;
    full_name: string | null;
  } | null;
  // UI-only fields not persisted (TODO(B8): add columns or rework UI)
  mobile_number?: string | null;
  mobile_provider?: string | null;
  location?: string | null;
}

export interface PaymentReceipt {
  id: string;
  receipt_number: string | null;
  receipt_date: string | null;
  amount: number;
  customer_id: string | null;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
  // UI-only fields not persisted in v1.0.0 schema (TODO(B8))
  account_id?: string | null;
  payment_method_id?: string | null;
  source_type?: string | null;
  company_id?: string | null;
  case_id?: string | null;
  reference_number?: string | null;
  description?: string | null;
  status?: string | null;
  allocated_amount?: number | null;
  unallocated_amount?: number | null;
  is_reconciled?: boolean | null;
}

export interface PaymentDisbursement {
  id: string;
  disbursement_number: string | null;
  disbursement_date: string | null;
  bank_account_id: string | null;
  amount: number;
  payee_name: string | null;
  payee_type: string | null;
  reference: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  // UI-only fields not persisted in v1.0.0 schema (TODO(B8))
  account_id?: string | null;
  payment_method_id?: string | null;
  expense_category_id?: string | null;
  reference_number?: string | null;
  description?: string | null;
  approval_required?: boolean | null;
}

export interface AccountTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transfer_date: string;
  reference: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  // UI-only fields not persisted in v1.0.0 schema (TODO(B8))
  transfer_number?: string | null;
  description?: string | null;
  approval_required?: boolean | null;
}

export interface ReconciliationSession {
  id: string;
  bank_account_id: string;
  start_date: string;
  end_date: string;
  opening_balance: number | null;
  closing_balance: number | null;
  status: string | null;
  created_at: string;
}

function toBankAccount(row: BankAccountRow & {
  currency_ref?: { code: string; symbol: string; name: string } | null;
  employee?: { id: string; full_name: string | null } | null;
}): BankAccount {
  return {
    id: row.id,
    account_name: row.name,
    account_number: row.account_number,
    bank_name: row.bank_name,
    account_type: (row.account_type === 'cash' || row.account_type === 'mobile') ? row.account_type : 'bank',
    branch_code: row.branch_code,
    swift_code: row.swift_code,
    iban: row.iban,
    currency: row.currency,
    currency_id: row.currency_id,
    current_balance: row.current_balance ?? 0,
    opening_balance: row.opening_balance ?? 0,
    is_active: row.is_active ?? true,
    is_default: row.is_default ?? false,
    employee_id: row.employee_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    currency_ref: row.currency_ref ?? null,
    employee: row.employee ?? null,
  };
}

export const bankingService = {
  async getAccounts(filters?: {
    account_type?: string;
    is_active?: boolean;
  }): Promise<BankAccount[]> {
    let query = supabase
      .from('bank_accounts')
      .select(`
        *,
        currency_ref:master_currency_codes!bank_accounts_currency_id_fkey(code, symbol, name),
        employee:profiles!bank_accounts_employee_id_fkey(id, full_name)
      `)
      .is('deleted_at', null)
      .order('name');

    if (filters?.account_type) {
      query = query.eq('account_type', filters.account_type);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => toBankAccount(row as BankAccountRow & {
      currency_ref?: { code: string; symbol: string; name: string } | null;
      employee?: { id: string; full_name: string | null } | null;
    }));
  },

  async getAccountById(id: string): Promise<BankAccount | null> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select(`
        *,
        currency_ref:master_currency_codes!bank_accounts_currency_id_fkey(code, symbol, name),
        employee:profiles!bank_accounts_employee_id_fkey(id, full_name)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return toBankAccount(data as BankAccountRow & {
      currency_ref?: { code: string; symbol: string; name: string } | null;
      employee?: { id: string; full_name: string | null } | null;
    });
  },

  async createAccount(accountData: Partial<BankAccount>): Promise<BankAccount> {
    const { data: { user } } = await supabase.auth.getUser();

    const accountName = accountData.account_name?.trim();
    if (!accountName) {
      throw new Error('Account name is required');
    }

    let accountNumber: string | null | undefined = accountData.account_number ?? null;
    if (accountData.account_type === 'cash' || accountData.account_type === 'mobile') {
      accountNumber = null;
    }

    const tenantId = await resolveTenantId();
    const dataToInsert: BankAccountInsert = {
      name: accountName,
      account_number: accountNumber,
      bank_name: accountData.bank_name ?? null,
      account_type: accountData.account_type ?? 'checking',
      branch_code: accountData.branch_code ?? null,
      swift_code: accountData.swift_code ?? null,
      iban: accountData.iban ?? null,
      currency: accountData.currency ?? null,
      currency_id: accountData.currency_id ?? null,
      opening_balance: accountData.opening_balance ?? 0,
      current_balance: accountData.current_balance ?? accountData.opening_balance ?? 0,
      is_active: accountData.is_active ?? true,
      is_default: accountData.is_default ?? false,
      employee_id: accountData.employee_id ?? null,
      notes: accountData.notes ?? null,
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { data, error } = await supabase
      .from('bank_accounts')
      .insert(dataToInsert)
      .select(`
        *,
        currency_ref:master_currency_codes!bank_accounts_currency_id_fkey(code, symbol, name),
        employee:profiles!bank_accounts_employee_id_fkey(id, full_name)
      `)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to create bank account');
    return toBankAccount(data as BankAccountRow & {
      currency_ref?: { code: string; symbol: string; name: string } | null;
      employee?: { id: string; full_name: string | null } | null;
    });
  },

  async updateAccount(id: string, updates: Partial<BankAccount>): Promise<BankAccount> {
    const dataToUpdate: BankAccountUpdate = {};

    if (updates.account_name !== undefined) {
      const trimmed = updates.account_name.trim();
      if (!trimmed) throw new Error('Account name cannot be empty');
      dataToUpdate.name = trimmed;
    }
    if (updates.account_number !== undefined) dataToUpdate.account_number = updates.account_number;
    if (updates.bank_name !== undefined) dataToUpdate.bank_name = updates.bank_name;
    if (updates.account_type !== undefined) dataToUpdate.account_type = updates.account_type;
    if (updates.branch_code !== undefined) dataToUpdate.branch_code = updates.branch_code;
    if (updates.swift_code !== undefined) dataToUpdate.swift_code = updates.swift_code;
    if (updates.iban !== undefined) dataToUpdate.iban = updates.iban;
    if (updates.currency !== undefined) dataToUpdate.currency = updates.currency;
    if (updates.currency_id !== undefined) dataToUpdate.currency_id = updates.currency_id;
    if (updates.opening_balance !== undefined) dataToUpdate.opening_balance = updates.opening_balance;
    if (updates.current_balance !== undefined) dataToUpdate.current_balance = updates.current_balance;
    if (updates.is_active !== undefined) dataToUpdate.is_active = updates.is_active;
    if (updates.is_default !== undefined) dataToUpdate.is_default = updates.is_default;
    if (updates.employee_id !== undefined) dataToUpdate.employee_id = updates.employee_id;
    if (updates.notes !== undefined) dataToUpdate.notes = updates.notes;

    if (updates.account_type === 'cash' || updates.account_type === 'mobile') {
      dataToUpdate.account_number = null;
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update(dataToUpdate)
      .eq('id', id)
      .select(`
        *,
        currency_ref:master_currency_codes!bank_accounts_currency_id_fkey(code, symbol, name),
        employee:profiles!bank_accounts_employee_id_fkey(id, full_name)
      `)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to update bank account');
    return toBankAccount(data as BankAccountRow & {
      currency_ref?: { code: string; symbol: string; name: string } | null;
      employee?: { id: string; full_name: string | null } | null;
    });
  },

  async deleteAccount(id: string): Promise<void> {
    const { error } = await supabase
      .from('bank_accounts')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', id);

    if (error) throw error;
  },

  async setDefaultAccount(id: string): Promise<void> {
    await supabase.from('bank_accounts').update({ is_default: false }).neq('id', id);

    const { error } = await supabase
      .from('bank_accounts')
      .update({ is_default: true })
      .eq('id', id);

    if (error) throw error;
  },

  async getReceipts(filters?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    is_reconciled?: boolean;
  }): Promise<PaymentReceipt[]> {
    // NOTE: payment_receipts has no account_id, status, or is_reconciled columns
    // in the v1.0.0 schema. Those filters are silently ignored. TODO(B8): when
    // payment_receipts is extended with bank_account_id / status fields, restore.
    void filters?.account_id;
    void filters?.status;
    void filters?.is_reconciled;

    let query = supabase
      .from('payment_receipts')
      .select(`
        *,
        customer:customers_enhanced!payment_receipts_customer_id_fkey(id, customer_name, email),
        payment:payments!payment_receipts_payment_id_fkey(id, payment_number, amount)
      `)
      .is('deleted_at', null)
      .order('receipt_date', { ascending: false });

    if (filters?.start_date) {
      query = query.gte('receipt_date', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('receipt_date', filters.end_date);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PaymentReceipt[];
  },

  async createReceipt(receiptData: Partial<PaymentReceipt>): Promise<PaymentReceipt> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: receiptNumber } = await supabase.rpc('get_next_receipt_number');

    if (typeof receiptData.amount !== 'number') {
      throw new Error('Receipt amount is required');
    }

    const tenantId = await resolveTenantId();
    const insertRow: PaymentReceiptInsert = {
      amount: receiptData.amount,
      receipt_number: (typeof receiptNumber === 'string' ? receiptNumber : null),
      receipt_date: receiptData.receipt_date ?? new Date().toISOString(),
      customer_id: receiptData.customer_id ?? null,
      payment_id: receiptData.payment_id ?? null,
      notes: receiptData.notes ?? null,
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { data, error } = await supabase
      .from('payment_receipts')
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to create payment receipt');

    return data as PaymentReceipt;
  },

  async getDisbursements(filters?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
  }): Promise<PaymentDisbursement[]> {
    let query = supabase
      .from('payment_disbursements')
      .select(`
        *,
        bank_account:bank_accounts!payment_disbursements_bank_account_id_fkey(id, name, account_type)
      `)
      .is('deleted_at', null)
      .order('disbursement_date', { ascending: false });

    if (filters?.account_id) {
      query = query.eq('bank_account_id', filters.account_id);
    }

    if (filters?.start_date) {
      query = query.gte('disbursement_date', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('disbursement_date', filters.end_date);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PaymentDisbursement[];
  },

  async createDisbursement(disbursementData: Partial<PaymentDisbursement>): Promise<PaymentDisbursement> {
    const { data: { user } } = await supabase.auth.getUser();

    if (typeof disbursementData.amount !== 'number') {
      throw new Error('Disbursement amount is required');
    }

    // validate_account_balance RPC does not exist in v1.0.0 schema; do balance
    // check in TS. TODO(B8): replace with server-side RPC when added.
    if (disbursementData.bank_account_id) {
      const { data: account } = await supabase
        .from('bank_accounts')
        .select('current_balance')
        .eq('id', disbursementData.bank_account_id)
        .maybeSingle();

      if (account && (account.current_balance ?? 0) < disbursementData.amount) {
        throw new Error('Insufficient balance in the selected account');
      }
    }

    const { data: disbursementNumber } = await supabase.rpc('get_next_disbursement_number');

    const tenantId = await resolveTenantId();
    const insertRow: PaymentDisbursementInsert = {
      amount: disbursementData.amount,
      bank_account_id: disbursementData.bank_account_id ?? null,
      disbursement_number: typeof disbursementNumber === 'string' ? disbursementNumber : null,
      disbursement_date: disbursementData.disbursement_date ?? new Date().toISOString(),
      payee_name: disbursementData.payee_name ?? null,
      payee_type: disbursementData.payee_type ?? null,
      reference: disbursementData.reference ?? null,
      notes: disbursementData.notes ?? null,
      status: disbursementData.status ?? 'pending',
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { data, error } = await supabase
      .from('payment_disbursements')
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to create payment disbursement');

    if (data.status === 'paid' && disbursementData.bank_account_id) {
      await this.updateAccountBalance(disbursementData.bank_account_id, disbursementData.amount, 'debit');
    }

    return data as PaymentDisbursement;
  },

  async approveDisbursement(id: string, notes?: string): Promise<PaymentDisbursement> {
    const updateRow: PaymentDisbursementUpdate = {
      status: 'approved',
    };
    if (notes !== undefined) {
      updateRow.notes = notes;
    }

    const { data, error } = await supabase
      .from('payment_disbursements')
      .update(updateRow)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Disbursement not found');
    return data as PaymentDisbursement;
  },

  async getTransfers(filters?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
  }): Promise<AccountTransfer[]> {
    let query = supabase
      .from('account_transfers')
      .select(`
        *,
        from_account:bank_accounts!account_transfers_from_account_id_fkey(id, name, account_type),
        to_account:bank_accounts!account_transfers_to_account_id_fkey(id, name, account_type)
      `)
      .is('deleted_at', null)
      .order('transfer_date', { ascending: false });

    if (filters?.account_id && isValidUuid(filters.account_id)) {
      query = query.or(`from_account_id.eq.${filters.account_id},to_account_id.eq.${filters.account_id}`);
    }

    if (filters?.start_date) {
      query = query.gte('transfer_date', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('transfer_date', filters.end_date);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as AccountTransfer[];
  },

  async createTransfer(transferData: Partial<AccountTransfer>): Promise<AccountTransfer> {
    const { data: { user } } = await supabase.auth.getUser();

    if (typeof transferData.amount !== 'number') {
      throw new Error('Transfer amount is required');
    }
    if (!transferData.from_account_id || !transferData.to_account_id) {
      throw new Error('Both source and destination accounts are required');
    }

    // validate_account_balance RPC does not exist in v1.0.0 schema; do balance
    // check in TS. TODO(B8): replace with server-side RPC when added.
    const { data: sourceAccount } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', transferData.from_account_id)
      .maybeSingle();

    if (sourceAccount && (sourceAccount.current_balance ?? 0) < transferData.amount) {
      throw new Error('Insufficient balance in the source account');
    }

    const tenantId = await resolveTenantId();
    const insertRow: AccountTransferInsert = {
      amount: transferData.amount,
      from_account_id: transferData.from_account_id,
      to_account_id: transferData.to_account_id,
      transfer_date: transferData.transfer_date ?? new Date().toISOString(),
      reference: transferData.reference ?? null,
      notes: transferData.notes ?? null,
      status: transferData.status ?? 'completed',
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { data, error } = await supabase
      .from('account_transfers')
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to create account transfer');

    if (data.status === 'completed') {
      await this.updateAccountBalance(transferData.from_account_id, transferData.amount, 'debit');
      await this.updateAccountBalance(transferData.to_account_id, transferData.amount, 'credit');
    }

    return data as AccountTransfer;
  },

  async approveTransfer(id: string, notes?: string): Promise<AccountTransfer> {
    const updateRow: AccountTransferUpdate = {
      status: 'approved',
    };
    if (notes !== undefined) {
      updateRow.notes = notes;
    }

    const { data, error } = await supabase
      .from('account_transfers')
      .update(updateRow)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Transfer not found');
    return data as AccountTransfer;
  },

  async completeTransfer(id: string): Promise<AccountTransfer> {
    const { data: transfer } = await supabase
      .from('account_transfers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!transfer) throw new Error('Transfer not found');

    const { data, error } = await supabase
      .from('account_transfers')
      .update({ status: 'completed' })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Failed to complete transfer');

    await this.updateAccountBalance(transfer.from_account_id, transfer.amount, 'debit');
    await this.updateAccountBalance(transfer.to_account_id, transfer.amount, 'credit');

    return data as AccountTransfer;
  },

  async allocateReceiptToInvoice(
    receiptId: string,
    invoiceId: string,
    amount: number
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    const tenantId = await resolveTenantId();
    const allocationRow: ReceiptAllocationInsert = {
      receipt_id: receiptId,
      invoice_id: invoiceId,
      amount,
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { error } = await supabase
      .from('receipt_allocations')
      .insert(allocationRow);

    if (error) throw error;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('amount_paid, balance_due, status')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoice) {
      const newAmountPaid = (invoice.amount_paid ?? 0) + amount;
      const newAmountDue = (invoice.balance_due ?? 0) - amount;

      await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          balance_due: newAmountDue,
          status: deriveInvoiceStatus(newAmountPaid, newAmountDue, {
            partialLabel: 'partially-paid',
            unpaidLabel: 'partially-paid',
          }),
        })
        .eq('id', invoiceId);
    }
  },

  async updateAccountBalance(
    accountId: string,
    amount: number,
    type: 'credit' | 'debit'
  ): Promise<void> {
    const { data: account } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', accountId)
      .maybeSingle();

    if (!account) throw new Error('Account not found');

    const currentBalance = account.current_balance ?? 0;
    const newBalance = type === 'credit'
      ? currentBalance + amount
      : currentBalance - amount;

    const { error } = await supabase
      .from('bank_accounts')
      .update({ current_balance: newBalance })
      .eq('id', accountId);

    if (error) throw error;
  },

  async getAccountBalanceSummary(): Promise<{
    totalBankBalance: number;
    totalCashBalance: number;
    totalMobileBalance: number;
    pendingReconciliations: number;
  }> {
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('account_type, current_balance, current_balance_base, currency')
      .eq('is_active', true)
      .is('deleted_at', null);

    const { count: unreconciledCount } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('is_reconciled', false);

    const bankBalance = sumBankBalanceBase(
      (accounts ?? []).filter((a) => a.account_type === 'bank' || a.account_type === 'checking' || a.account_type === 'savings'),
      'current_balance',
    );

    const cashBalance = sumBankBalanceBase(
      (accounts ?? []).filter((a) => a.account_type === 'cash'),
      'current_balance',
    );

    const mobileBalance = sumBankBalanceBase(
      (accounts ?? []).filter((a) => a.account_type === 'mobile'),
      'current_balance',
    );

    return {
      totalBankBalance: bankBalance,
      totalCashBalance: cashBalance,
      totalMobileBalance: mobileBalance,
      pendingReconciliations: unreconciledCount ?? 0,
    };
  },

  async getBankTransactions(filters?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    is_reconciled?: boolean;
  }) {
    let query = supabase
      .from('bank_transactions')
      .select('*')
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false });

    if (filters?.account_id) {
      query = query.eq('bank_account_id', filters.account_id);
    }

    if (filters?.start_date) {
      query = query.gte('transaction_date', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('transaction_date', filters.end_date);
    }

    if (filters?.is_reconciled !== undefined) {
      query = query.eq('is_reconciled', filters.is_reconciled);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async getCasesWithInvoices(filters?: {
    search?: string;
    hasOutstandingInvoices?: boolean;
  }) {
    let query = supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        total_amount,
        amount_paid,
        balance_due,
        status,
        case_id,
        cases!invoices_case_id_fkey (
          id,
          case_number,
          title,
          customer_id,
          company_id,
          customers_enhanced!cases_customer_id_fkey (
            id,
            customer_name,
            email
          ),
          companies!cases_company_id_fkey (
            id,
            company_name,
            email
          )
        )
      `)
      .not('case_id', 'is', null)
      .is('deleted_at', null);

    if (filters?.hasOutstandingInvoices) {
      query = query.gt('balance_due', 0);
    }

    if (filters?.search) {
      const s = sanitizeFilterValue(filters.search);
      query = query.or(`cases.case_number.ilike.%${s}%,cases.title.ilike.%${s}%`);
    }

    const { data: invoices, error } = await query;
    if (error) throw error;

    interface CaseRel {
      id: string;
      case_number: string | null;
      title: string | null;
      customer_id: string | null;
      company_id: string | null;
      customers_enhanced?: { id: string; customer_name: string | null; email: string | null } | null;
      companies?: { id: string; company_name: string | null; email: string | null } | null;
    }
    interface InvoiceWithCase {
      id: string;
      invoice_number: string | null;
      total_amount: number | null;
      amount_paid: number | null;
      balance_due: number | null;
      status: string | null;
      case_id: string | null;
      cases: CaseRel | CaseRel[] | null;
    }

    const casesMap = new Map<string, {
      id: string;
      case_number: string | null;
      title: string | null;
      customer_id: string | null;
      company_id: string | null;
      customers_enhanced: CaseRel['customers_enhanced'];
      companies: CaseRel['companies'];
      invoices: Array<{
        id: string;
        invoice_number: string | null;
        total_amount: number | null;
        amount_paid: number | null;
        balance_due: number | null;
        status: string | null;
      }>;
    }>();

    (invoices ?? []).forEach((row) => {
      const invoice = row as unknown as InvoiceWithCase;
      const caseRel = Array.isArray(invoice.cases) ? invoice.cases[0] : invoice.cases;
      if (!caseRel) return;

      const caseId = caseRel.id;
      if (!casesMap.has(caseId)) {
        const ce = Array.isArray(caseRel.customers_enhanced) ? caseRel.customers_enhanced[0] : caseRel.customers_enhanced;
        const co = Array.isArray(caseRel.companies) ? caseRel.companies[0] : caseRel.companies;
        casesMap.set(caseId, {
          id: caseRel.id,
          case_number: caseRel.case_number,
          title: caseRel.title,
          customer_id: caseRel.customer_id,
          company_id: caseRel.company_id,
          customers_enhanced: ce ?? null,
          companies: co ?? null,
          invoices: [],
        });
      }
      casesMap.get(caseId)!.invoices.push({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total_amount: invoice.total_amount,
        amount_paid: invoice.amount_paid,
        balance_due: invoice.balance_due,
        status: invoice.status,
      });
    });

    const cases = Array.from(casesMap.values());

    cases.sort((a, b) => {
      const numA = parseInt(a.case_number ?? '') || 0;
      const numB = parseInt(b.case_number ?? '') || 0;
      return numB - numA;
    });

    return cases.slice(0, 50).map((c) => ({
      ...c,
      client_name: c.customers_enhanced?.customer_name
        ?? c.companies?.company_name
        ?? 'Unknown Client',
    }));
  },

  // Payment-allocation sources. Only OPEN, PAYABLE tax documents may receive
  // allocations: proformas are not payable documents, converted shells point
  // at their tax invoice, drafts haven't been issued, void/cancelled are dead,
  // and balance_due=0 has nothing to allocate. Oldest due first (the
  // Xero/QuickBooks auto-apply order).
  async getOpenInvoicesByCase(caseId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        due_date,
        invoice_type,
        status,
        total_amount,
        amount_paid,
        balance_due,
        balance_due_base,
        currency
      `)
      .eq('case_id', caseId)
      .eq('invoice_type', 'tax_invoice')
      .not('status', 'in', '(converted,void,cancelled,draft)')
      .gt('balance_due', 0)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) throw error;
    return data ?? [];
  },

  // Read-only statement context for the collapsed "settled" disclosure.
  async getSettledInvoicesByCase(caseId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, total_amount, amount_paid, currency')
      .eq('case_id', caseId)
      .eq('invoice_type', 'tax_invoice')
      .eq('payment_status', 'paid')
      .neq('status', 'converted')
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data ?? [];
  },

  // Single-invoice mode fetches its target directly so the flow still works
  // if the invoice slipped out of the open set between page load and click.
  async getInvoiceForPayment(invoiceId: string) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, invoice_type, status, total_amount, amount_paid, balance_due, balance_due_base, currency')
      .eq('id', invoiceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createReceiptWithAllocations(
    receiptData: Partial<PaymentReceipt>,
    allocations: Array<{ invoice_id: string; allocated_amount: number }>
  ): Promise<PaymentReceipt> {
    const { data: { user } } = await supabase.auth.getUser();

    if (typeof receiptData.amount !== 'number') {
      throw new Error('Receipt amount is required');
    }

    const { data: receiptNumber } = await supabase.rpc('get_next_receipt_number');

    const tenantId = await resolveTenantId();
    const receiptInsert: PaymentReceiptInsert = {
      amount: receiptData.amount,
      receipt_number: typeof receiptNumber === 'string' ? receiptNumber : null,
      receipt_date: receiptData.receipt_date ?? new Date().toISOString(),
      customer_id: receiptData.customer_id ?? null,
      payment_id: receiptData.payment_id ?? null,
      notes: receiptData.notes ?? null,
      created_by: user?.id ?? null,
      tenant_id: tenantId,
    };

    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .insert(receiptInsert)
      .select()
      .maybeSingle();

    if (receiptError) throw receiptError;
    if (!receipt) throw new Error('Failed to create payment receipt');

    if (allocations.length > 0) {
      const allocationRecords: ReceiptAllocationInsert[] = allocations.map((a) => ({
        receipt_id: receipt.id,
        invoice_id: a.invoice_id,
        amount: a.allocated_amount,
        created_by: user?.id ?? null,
        tenant_id: tenantId,
      }));

      const { error: allocError } = await supabase
        .from('receipt_allocations')
        .insert(allocationRecords);

      if (allocError) throw allocError;

      for (const allocation of allocations) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('amount_paid, balance_due, total_amount, status')
          .eq('id', allocation.invoice_id)
          .maybeSingle();

        if (invoice) {
          const newAmountPaid = (invoice.amount_paid ?? 0) + allocation.allocated_amount;
          const newAmountDue = (invoice.balance_due ?? 0) - allocation.allocated_amount;

          const newStatus = deriveInvoiceStatus(newAmountPaid, newAmountDue, {
            partialLabel: 'partially-paid',
            unpaidLabel: invoice.status ?? 'sent',
          });

          await supabase
            .from('invoices')
            .update({
              amount_paid: newAmountPaid,
              balance_due: newAmountDue,
              status: newStatus,
            })
            .eq('id', allocation.invoice_id);
        }
      }
    }

    return receipt as PaymentReceipt;
  },
};
