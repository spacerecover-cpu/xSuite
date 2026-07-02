import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvoicesPage, getInvoiceStats, createInvoice, updateInvoice, toInvoiceEditInitialData } from '../../lib/invoiceService';
import type { Invoice, InvoiceItem, InvoiceWithDetails } from '../../lib/invoiceService';
import { getInvoiceEditability, canRecordPayment as invoiceCanRecordPayment } from '../../lib/invoicePermissions';
import type { PaymentReceipt } from '../../lib/bankingService';
import { receiptsService } from '../../lib/receiptsService';
import { Button } from '../../components/ui/Button';
import { InvoiceFormModal } from '../../components/cases/InvoiceFormModal';
import { RecordReceiptModal } from '../../components/banking/RecordReceiptModal';
import { useCurrency } from '../../hooks/useCurrency';
import { useConfirm } from '../../hooks/useConfirm';
import { supabase } from '../../lib/supabaseClient';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useListPage } from '../../hooks/useListPage';
import { useListPageSize } from '../../hooks/useListPageSize';
import { useListSelectionEnabled } from '../../hooks/useListSelectionEnabled';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { KpiRow } from '../../components/templates/KpiRow';
import { InvoicesFilterBar } from '../../components/financial/InvoicesFilterBar';
import { InvoicesTable } from '../../components/financial/InvoicesTable';
import {
  FileText,
  Plus,
  Download,
  Send,
  Archive,
} from 'lucide-react';

export const InvoicesListPage: React.FC<unknown> = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const confirm = useConfirm();
  const { profile } = useAuth();
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithDetails | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithDetails | null>(null);

  const pageSize = useListPageSize();
  const selectionEnabled = useListSelectionEnabled();
  const list = useListPage<InvoiceWithDetails, { status?: string; invoiceType?: string }>({
    queryKey: ['invoices'],
    filters: {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      invoiceType: typeFilter !== 'all' ? typeFilter : undefined,
    },
    fetchPage: ({ status, invoiceType, search, page, pageSize: size }) =>
      fetchInvoicesPage({ status, invoiceType, search: search || undefined, page, pageSize: size }),
    pageSize,
  });
  const invoices = list.rows;
  const debouncedSearch = list.debouncedSearch;

  // Command-palette deep-link: /invoices?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowInvoiceModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Hiding checkboxes (tenant preference) drops any in-flight selection so
  // bulk actions can't act on rows the user can no longer see or unselect.
  useEffect(() => {
    if (!selectionEnabled) selection.clear();
  }, [selectionEnabled, selection.clear]);

  const { data: stats } = useQuery({
    queryKey: ['invoice_stats'],
    queryFn: () => getInvoiceStats(),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const getClientName = (invoice: {
    customers_enhanced?: { customer_name: string } | null;
    companies?: { company_name: string | null } | null;
  }) => {
    if (invoice.customers_enhanced) {
      return invoice.customers_enhanced.customer_name;
    }
    if (invoice.companies) {
      return invoice.companies.company_name ?? 'N/A';
    }
    return 'N/A';
  };

  // Edit opens the form modal after re-fetching the row + its live line items,
  // exactly as the inline row handler did before the table was extracted.
  const handleEditInvoice = async (invoice: InvoiceWithDetails) => {
    if (!invoice.id) return;
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice.id)
      .maybeSingle();

    if (!error && data) {
      const { data: items } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoice.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      setEditingInvoice({ ...data, invoice_line_items: items ?? [] } as unknown as InvoiceWithDetails);
      setShowInvoiceModal(true);
    }
  };

  const handleRecordPayment = (invoice: InvoiceWithDetails) => {
    setPaymentInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number, invoice_date, due_date, invoice_type, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, customers_enhanced:customer_id(customer_name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected invoices');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'invoice_date', label: 'Date' },
        { key: 'due_date', label: 'Due' },
        { key: 'invoice_type', label: 'Type' },
        {
          key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
          label: 'Customer',
        },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'tax_amount', label: 'Tax' },
        { key: 'total_amount', label: 'Total' },
        { key: 'amount_paid', label: 'Paid' },
        { key: 'balance_due', label: 'Balance' },
        { key: 'status', label: 'Status' },
      ],
      'invoices-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} invoice${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive invoices');
      return;
    }
    const n = selection.selectedCount;
    if (!(await confirm({
      title: `Archive ${n} invoice${n === 1 ? '' : 's'}?`,
      message: `Archive ${n} invoice${n === 1 ? '' : 's'}? They'll be hidden from lists but recoverable.`,
      tone: 'danger',
    }))) {
      return;
    }
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`Archived ${n} invoice${n === 1 ? '' : 's'}`);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive invoices');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleBulkSend = async () => {
    if (selection.selectedCount === 0) return;
    const n = selection.selectedCount;
    // Up-front warning surfaces the rate-limit reality (5 emails/min)
    // before the user kicks off a 30-invoice batch.
    const msg =
      n > 5
        ? `Email ${n} invoices to their customers? Sending is rate-limited to 5/minute — this will take roughly ${Math.ceil(n / 5)} minute(s).`
        : `Email ${n} invoice${n === 1 ? '' : 's'} to their customers?`;
    if (!(await confirm({
      title: n === 1 ? 'Email invoice?' : `Email ${n} invoices?`,
      message: msg,
      tone: 'default',
    }))) return;
    setSendProgress({ done: 0, total: n });
    try {
      // Lazy-import: bulk-send drags pdfmake; only fetch on actual click.
      const { bulkSendInvoiceEmails } = await import('../../lib/invoiceService');
      const results = await bulkSendInvoiceEmails(
        Array.from(selection.selectedIds),
        (done, total) => setSendProgress({ done, total }),
      );
      const sent = results.filter((r) => r.status === 'sent').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      if (failed === 0 && skipped === 0) {
        toast.success(`Sent ${sent} invoice${sent === 1 ? '' : 's'}`);
      } else if (failed > 0) {
        toast.warning(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      } else {
        toast.info(`Bulk send: ${sent} sent, ${skipped} skipped, ${failed} failed`);
      }
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Bulk send failed');
    } finally {
      setSendProgress(null);
    }
  };

  return (
    <ListPageTemplate
      title="Invoices"
      headerActions={
        <>
          <ExportButton
            filename="invoices"
            columns={[
              { key: 'invoice_number', label: 'Invoice #' },
              { key: 'invoice_date', label: 'Date' },
              { key: 'due_date', label: 'Due' },
              { key: 'invoice_type', label: 'Type' },
              {
                key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
                label: 'Customer',
              },
              { key: 'subtotal', label: 'Subtotal' },
              { key: 'tax_amount', label: 'Tax' },
              { key: 'total_amount', label: 'Total' },
              { key: 'amount_paid', label: 'Paid' },
              { key: 'balance_due', label: 'Balance' },
              { key: 'status', label: 'Status' },
            ]}
            getRows={async () => {
              let q = supabase
                .from('invoices')
                .select('invoice_number, invoice_date, due_date, invoice_type, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, customers_enhanced:customer_id(customer_name)')
                .is('deleted_at', null);
              if (debouncedSearch) {
                q = q.ilike('invoice_number', `%${debouncedSearch}%`);
              }
              if (statusFilter !== 'all') q = q.eq('status', statusFilter);
              if (typeFilter !== 'all') q = q.eq('invoice_type', typeFilter);
              const { data, error } = await q.order('invoice_date', { ascending: false, nullsFirst: false });
              if (error) throw error;
              return data ?? [];
            }}
          />
          <Button size="sm" onClick={() => setShowInvoiceModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Invoice
          </Button>
        </>
      }
      kpis={
        <KpiRow
          stats={[
            {
              tone: 'info',
              label: 'Total Invoiced',
              value: formatCurrency(stats?.totalValue || 0),
              sub: `${stats?.total ?? 0} invoices`,
            },
            {
              tone: 'success',
              label: 'Paid',
              value: formatCurrency(stats?.totalPaid || 0),
              sub: `${stats?.paid ?? 0} paid`,
            },
            {
              tone: 'warning',
              label: 'Outstanding',
              value: formatCurrency(stats?.totalOutstanding || 0),
              sub: `${Math.max((stats?.total ?? 0) - (stats?.paid ?? 0), 0)} unpaid`,
            },
            {
              tone: 'danger',
              label: 'Overdue',
              value: stats?.overdue ?? 0,
              sub: 'overdue invoices',
            },
          ]}
        />
      }
      toolbar={
        <InvoicesFilterBar
          search={list.search}
          onSearch={list.setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
        />
      }
      loading={list.isLoading}
      isEmpty={list.isEmpty}
      empty={
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description={
              list.search || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No invoices found matching your criteria.'
                : 'No invoices yet. Create your first invoice to get started.'
            }
            action={{ label: 'Create Invoice', onClick: () => setShowInvoiceModal(true) }}
          />
        </div>
      }
      table={
        <InvoicesTable
          rows={invoices}
          selection={selectionEnabled ? selection : undefined}
          navigate={navigate}
          formatCurrency={formatCurrency}
          getClientName={getClientName}
          canEdit={(invoice) => getInvoiceEditability(invoice).mode !== 'none'}
          canRecordPayment={invoiceCanRecordPayment}
          onEdit={handleEditInvoice}
          onRecordPayment={handleRecordPayment}
        />
      }
      pager={{ ...list.pagerProps, itemNoun: 'invoices' }}
      footer={
        <BulkActionsBar
          count={selection.selectedCount}
          onClear={selection.clear}
          itemNoun="invoice"
        >
          <BulkActionButton
            variant="ghost"
            icon={<Download className="w-4 h-4" />}
            label="Export"
            onClick={handleBulkExport}
            disabled={sendProgress !== null}
          />
          <BulkActionButton
            variant="primary"
            icon={<Send className="w-4 h-4" />}
            label={
              sendProgress
                ? `Sending ${sendProgress.done}/${sendProgress.total}…`
                : 'Send'
            }
            onClick={handleBulkSend}
            disabled={sendProgress !== null || isArchiving}
          />
          {canBulkArchive && (
            <BulkActionButton
              variant="danger"
              icon={<Archive className="w-4 h-4" />}
              label={isArchiving ? 'Archiving…' : 'Archive'}
              onClick={handleBulkArchive}
              disabled={isArchiving || sendProgress !== null}
            />
          )}
        </BulkActionsBar>
      }
    >
      {showPaymentModal && paymentInvoice && (
        <RecordReceiptModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentInvoice(null);
          }}
          onSave={async (receiptData: Record<string, unknown>, allocations?: Array<{ invoice_id: string; allocated_amount: number }>) => {
            const r = receiptData as Partial<PaymentReceipt>;
            if (typeof r.amount !== 'number') {
              throw new Error('Receipt amount is required');
            }
            // Atomic, money-conserving, append-only-ledger-posting receipt recording.
            // The RPC owns invoice balance recompute and bank-balance maintenance.
            await receiptsService.createReceiptWithAllocations(
              {
                amount: r.amount,
                receipt_date: r.receipt_date ?? null,
                customer_id: r.customer_id ?? null,
                payment_method: r.payment_method_id ?? null,
                reference: r.reference_number ?? null,
                notes: r.notes ?? null,
                status: r.status ?? 'completed',
                bank_account_id: r.account_id ?? null,
              },
              (allocations ?? []).map((a) => ({ invoice_id: a.invoice_id, amount: a.allocated_amount })),
            );

            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice'] });
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          prefilledData={{
            customer_id: paymentInvoice.customer_id ?? undefined,
            company_id: paymentInvoice.company_id ?? undefined,
            case_id: paymentInvoice.case_id,
            amount: paymentInvoice.balance_due ?? paymentInvoice.total_amount ?? 0,
          }}
        />
      )}

      {showInvoiceModal && (
        <InvoiceFormModal
          isOpen={showInvoiceModal}
          onClose={() => {
            setShowInvoiceModal(false);
            setEditingInvoice(null);
          }}
          onSave={async (invoiceData: Record<string, unknown>, items: InvoiceItem[]) => {
            const invoicePayload = invoiceData as Partial<Invoice>;
            if (editingInvoice && editingInvoice.id) {
              await updateInvoice(editingInvoice.id, {
                case_id: invoicePayload.case_id,
                customer_id: invoicePayload.customer_id,
                company_id: invoicePayload.company_id,
                title: invoicePayload.title,
                invoice_type: invoicePayload.invoice_type,
                invoice_date: invoicePayload.invoice_date,
                due_date: invoicePayload.due_date,
                status: invoicePayload.status,
                payment_terms: invoicePayload.payment_terms,
                notes: invoicePayload.notes,
                internal_notes: invoicePayload.internal_notes,
                discount_amount: invoicePayload.discount_amount,
                discount_type: invoicePayload.discount_type,
                tax_rate: invoicePayload.tax_rate,
                client_reference: invoicePayload.client_reference,
                bank_account_id: invoicePayload.bank_account_id,
                terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              }, items);
            } else {
              await createInvoice({
                title: invoicePayload.title,
                case_id: invoicePayload.case_id,
                customer_id: invoicePayload.customer_id,
                company_id: invoicePayload.company_id,
                invoice_type: invoicePayload.invoice_type,
                invoice_date: invoicePayload.invoice_date,
                due_date: invoicePayload.due_date,
                status: invoicePayload.status,
                notes: invoicePayload.notes,
                internal_notes: invoicePayload.internal_notes,
                discount_amount: invoicePayload.discount_amount,
                discount_type: invoicePayload.discount_type,
                tax_rate: invoicePayload.tax_rate,
                client_reference: invoicePayload.client_reference,
                bank_account_id: invoicePayload.bank_account_id,
                terms_and_conditions: invoicePayload.terms_and_conditions,
                quote_id: invoicePayload.quote_id,
              }, items);
            }

            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice'] });
            queryClient.invalidateQueries({ queryKey: ['invoice_stats'] });
          }}
          caseId={editingInvoice?.case_id || ''}
          customerId={editingInvoice?.customer_id}
          companyId={editingInvoice?.company_id}
          initialData={editingInvoice ? toInvoiceEditInitialData(editingInvoice as unknown as Record<string, unknown>) : undefined}
          clientReference={editingInvoice?.client_reference}
        />
      )}
    </ListPageTemplate>
  );
};

export default InvoicesListPage;
