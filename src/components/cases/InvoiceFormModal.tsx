import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Search, FileText, Download, DollarSign, FileBarChart, Briefcase, Calculator, Package, Info, X, Percent } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { getSupportedCurrencies, getBaseCurrency, getConversionRate, type SupportedCurrency } from '../../lib/currencyService';
import { formatCurrency, formatBaseEquivalent } from '../../lib/format';

interface LineItemTemplate {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
  item_category: string | null;
}

interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
}

interface InvoiceInitialData {
  invoice_type?: string;
  title?: string;
  invoice_date?: string;
  due_date?: string;
  status?: string;
  terms_and_conditions?: string;
  notes?: string;
  discount_amount?: number;
  discount_type?: string;
  tax_rate?: number;
  client_reference?: string;
  bank_account_id?: string | null;
  invoice_number?: string;
  invoice_line_items?: InvoiceLineItem[];
  currency?: string;
}

interface QuoteOption {
  id: string;
  quote_number: string | null;
  title?: string | null;
  total_amount: number | null;
}

interface InvoiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: Record<string, unknown>, items: InvoiceLineItem[]) => Promise<void>;
  caseId?: string;
  customerId?: string | null;
  companyId?: string | null;
  initialData?: InvoiceInitialData;
  quotes?: QuoteOption[];
  clientReference?: string;
}

interface InvoiceTermsTemplate {
  id: string;
  name: string;
  content: string | null;
  is_default: boolean | null;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  is_active: boolean;
}

export const InvoiceFormModal: React.FC<InvoiceFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  caseId,
  customerId,
  companyId,
  initialData,
  quotes = [],
  clientReference,
}) => {
  const { currencyFormat } = useCurrency();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [showTermsTemplates, setShowTermsTemplates] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [caseNumber, setCaseNumber] = useState<string>('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseId || '');

  const [invoiceData, setInvoiceData] = useState({
    invoice_type: initialData?.invoice_type || 'tax_invoice',
    title: initialData?.title || '',
    invoice_date: initialData?.invoice_date || new Date().toISOString().split('T')[0],
    due_date: initialData?.due_date || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'draft',
    terms_and_conditions: initialData?.terms_and_conditions || '',
    notes: initialData?.notes || '',
    discount_amount: initialData?.discount_amount || 0,
    discount_type: initialData?.discount_type || 'fixed',
    tax_rate: initialData?.tax_rate || 5,
    client_reference: initialData?.client_reference || clientReference || '',
    bank_account_id: initialData?.bank_account_id || null,
    currency: initialData?.currency || '',
  });

  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);

  const [currencies, setCurrencies] = useState<SupportedCurrency[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<string>('');
  const [baseRate, setBaseRate] = useState<number>(1);

  useEffect(() => {
    getSupportedCurrencies().then(setCurrencies).catch(() => setCurrencies([]));
    getBaseCurrency().then(setBaseCurrency).catch(() => {});
  }, []);

  useEffect(() => {
    if (baseCurrency && !invoiceData.currency) {
      setInvoiceData((d) => ({ ...d, currency: baseCurrency }));
    }
  }, [baseCurrency]);

  useEffect(() => {
    const doc = invoiceData.currency || baseCurrency;
    if (!doc || !baseCurrency || doc === baseCurrency) { setBaseRate(1); return; }
    getConversionRate(doc, baseCurrency).then(setBaseRate).catch(() => setBaseRate(NaN));
  }, [invoiceData.currency, baseCurrency]);

  useEffect(() => {
    if (initialData) {
      setInvoiceData({
        invoice_type: initialData.invoice_type || 'tax_invoice',
        title: initialData.title || '',
        invoice_date: initialData.invoice_date || new Date().toISOString().split('T')[0],
        due_date: initialData.due_date || new Date().toISOString().split('T')[0],
        status: initialData.status || 'draft',
        terms_and_conditions: initialData.terms_and_conditions || '',
        notes: initialData.notes || '',
        discount_amount: initialData.discount_amount || 0,
        discount_type: initialData.discount_type || 'fixed',
        tax_rate: initialData.tax_rate || 5,
        client_reference: initialData.client_reference || clientReference || '',
        bank_account_id: initialData.bank_account_id || null,
        currency: initialData.currency || '',
      });
      setDueDateManuallySet(true);
    } else if (clientReference) {
      setInvoiceData(prev => ({ ...prev, client_reference: clientReference }));
    }
  }, [clientReference, initialData]);

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    initialData?.invoice_line_items || [
      { description: '', quantity: 1, unit_price: 0, unit: 'Service' },
    ]
  );

  useEffect(() => {
    if (initialData?.invoice_line_items) {
      setLineItems(initialData.invoice_line_items);
    } else {
      setLineItems([{ description: '', quantity: 1, unit_price: 0, unit: 'Service' }]);
    }
  }, [initialData]);

  const { data: lineItemTemplates = [], isLoading: catalogLoading } = useQuery<LineItemTemplate[]>({
    queryKey: ['invoice_line_item_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_service_line_items')
        .select('id, name, description, default_price, catalog_service_categories(name)')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');

      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        default_price: row.default_price,
        item_category: row.catalog_service_categories?.name ?? null,
      }));
    },
    enabled: isOpen,
  });

  const { data: termsTemplates = [], isLoading: termsLoading } = useQuery({
    queryKey: ['invoice_terms_templates'],
    queryFn: async () => {
      const { data: typeData, error: typeError } = await supabase
        .from('master_template_types')
        .select('id')
        .eq('code', 'invoice_terms')
        .maybeSingle();

      if (typeError || !typeData) return [];

      const { data, error } = await supabase
        .from('document_templates')
        .select('id, name, content, is_default')
        .eq('template_type_id', typeData.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as InvoiceTermsTemplate[];
    },
    enabled: isOpen,
  });

  const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useQuery({
    queryKey: ['active_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name:name, bank_name, account_number, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: isOpen,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases_for_invoice'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, title, customer_id, company_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: isOpen && !caseId,
  });

  useEffect(() => {
    if (bankAccounts.length > 0 && !invoiceData.bank_account_id && !initialData) {
      setInvoiceData(prev => ({ ...prev, bank_account_id: bankAccounts[0].id }));
    }
  }, [bankAccounts, initialData]);

  useEffect(() => {
    const fetchMetadata = async () => {
      if (isOpen) {
        if (initialData?.invoice_number) {
          setInvoiceNumber(initialData.invoice_number);
        } else {
          try {
            const { data: nextNumber, error } = await supabase
              .rpc('get_next_number', { p_scope: 'invoice' });

            if (!error && nextNumber) {
              setInvoiceNumber(nextNumber);
            } else {
              setInvoiceNumber('INV-000001');
            }
          } catch (error) {
            logger.error('Error fetching next invoice number:', error);
            setInvoiceNumber('INV-000001');
          }
        }

        const activeCaseId = caseId || selectedCaseId;
        if (activeCaseId) {
          const { data } = await supabase
            .from('cases')
            .select('case_no, customer_id, company_id, client_reference, title, catalog_service_types(name)')
            .eq('id', activeCaseId)
            .maybeSingle();
          if (data) {
            setCaseNumber(data.case_no ?? '');
            if (data.client_reference && !initialData?.client_reference) {
              setInvoiceData(prev => ({ ...prev, client_reference: data.client_reference ?? '' }));
            }
            if (!initialData && !invoiceData.title) {
              const serviceTypeName = data.catalog_service_types?.name;
              const autoTitle = serviceTypeName || data.title || 'Invoice';
              setInvoiceData(prev => ({ ...prev, title: autoTitle }));
            }
          }
        }
      }
    };
    fetchMetadata();
  }, [isOpen, caseId, selectedCaseId, initialData]);

  const filteredCatalog = lineItemTemplates.filter((item) => {
    if (!searchQuery.trim()) return true;
    const search = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.item_category?.toLowerCase().includes(search)
    );
  });

  const handleQuoteSelection = async (quoteId: string) => {
    if (!quoteId) {
      setSelectedQuoteId('');
      return;
    }

    setSelectedQuoteId(quoteId);

    const { data: quoteData, error } = await supabase
      .from('quotes')
      .select(`
        *,
        quote_items (*)
      `)
      .eq('id', quoteId)
      .maybeSingle();

    if (error || !quoteData) {
      if (error) logger.error('Error fetching quote:', error);
      return;
    }

    if (quoteData.quote_items && quoteData.quote_items.length > 0) {
      const items = quoteData.quote_items.map((item) => ({
        description: item.description,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price,
        unit: 'Service',
      }));
      setLineItems(items);
    }

    setInvoiceData((prev) => ({
      ...prev,
      notes: quoteData.notes || prev.notes,
      terms_and_conditions: quoteData.terms || prev.terms_and_conditions,
      discount_amount: quoteData.discount_amount ?? 0,
    }));
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0, unit: 'Service' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addFromCatalog = (template: LineItemTemplate) => {
    const newItem: InvoiceLineItem = {
      description: `${template.name}${template.description ? ' - ' + template.description : ''}`,
      quantity: 1,
      unit_price: template.default_price ?? 0,
      unit: 'Service',
    };
    setLineItems([...lineItems, newItem]);
    setShowCatalog(false);
    setSearchQuery('');
  };

  const handleCaseSelection = async (newCaseId: string) => {
    setSelectedCaseId(newCaseId);

    if (newCaseId) {
      const { data } = await supabase
        .from('cases')
        .select('case_no, customer_id, company_id, client_reference')
        .eq('id', newCaseId)
        .maybeSingle();

      if (data) {
        setCaseNumber(data.case_no ?? '');
        if (data.client_reference) {
          setInvoiceData(prev => ({ ...prev, client_reference: data.client_reference ?? '' }));
        }
      }
    }
  };

  const stripHtmlTags = (html: string): string => {
    const div = document.createElement('div');
    div.textContent = html.replace(/<[^>]*>/g, ' ');
    return (div.textContent || '').trim();
  };

  const applyTermsTemplate = (template: InvoiceTermsTemplate) => {
    const plainText = stripHtmlTags(template.content ?? '');
    setInvoiceData(prev => ({ ...prev, terms_and_conditions: plainText }));
    setShowTermsTemplates(false);
  };

  const docCurrency = invoiceData.currency || baseCurrency || 'USD';
  const fmtDoc = (v: number) => formatCurrency(v, docCurrency);

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price;
  }, 0);

  const discountValue = invoiceData.discount_type === 'percentage'
    ? (subtotal * invoiceData.discount_amount) / 100
    : invoiceData.discount_amount;

  // Apply discount to subtotal first, then calculate VAT on discounted amount
  const discountedSubtotal = subtotal - discountValue;
  const taxAmount = (discountedSubtotal * invoiceData.tax_rate) / 100;

  const total = discountedSubtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const activeCaseId = caseId || selectedCaseId;
    if (!activeCaseId) {
      toast.error('Select which case this invoice is for');
      return;
    }

    if (!invoiceData.title || !invoiceData.title.trim()) {
      toast.error('Give this invoice a title (e.g., Data Recovery Service)');
      return;
    }

    if (lineItems.length === 0 || lineItems.every((item) => !item.description.trim())) {
      toast.error('Add at least one item or service to continue');
      return;
    }

    if (!invoiceData.client_reference || !invoiceData.client_reference.trim()) {
      toast.error('Client reference is required for invoices');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCase = cases.find(c => c.id === activeCaseId);

      const invoicePayload = {
        ...invoiceData,
        case_id: activeCaseId,
        customer_id: customerId || selectedCase?.customer_id || null,
        company_id: companyId || selectedCase?.company_id || null,
        quote_id: selectedQuoteId || null,
      };

      await onSave(invoicePayload, lineItems);
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving invoice:', error);
      toast.error('Invoice couldn\'t be saved. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerBadges = (
    <>
      <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg">
        <FileBarChart className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">{invoiceNumber}</span>
      </div>
      <div className="flex items-center gap-1.5 bg-info-muted border border-info/30 px-2.5 py-1 rounded-lg">
        <Briefcase className="w-3.5 h-3.5 text-info" />
        <span className="text-xs font-semibold text-info">#{caseNumber}</span>
      </div>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Invoice' : 'Create New Invoice'}
      size="xl"
      headerBadges={headerBadges}
    >
      <form onSubmit={handleSubmit} className="space-y-3">

        {!caseId && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-slate-100 p-1.5 rounded-lg">
                <Briefcase className="w-4 h-4 text-slate-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Select Case</h3>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Case *</label>
              <select
                value={selectedCaseId}
                onChange={(e) => handleCaseSelection(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
                required
              >
                <option value="">Select a case...</option>
                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>
                    {caseItem.case_no} - {caseItem.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-slate-100 p-1.5 rounded-lg">
              <FileText className="w-4 h-4 text-slate-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Invoice Details</h3>
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Type</label>
                <div className="flex border border-slate-300 rounded-md overflow-hidden h-[34px]">
                  <button
                    type="button"
                    onClick={() => setInvoiceData({ ...invoiceData, invoice_type: 'tax_invoice' })}
                    className={`flex-1 px-2 py-1 text-xs transition-all ${
                      invoiceData.invoice_type === 'tax_invoice'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Regular
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceData({ ...invoiceData, invoice_type: 'proforma' })}
                    className={`flex-1 px-2 py-1 text-xs border-l border-slate-300 transition-all ${
                      invoiceData.invoice_type === 'proforma'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Proforma
                  </button>
                </div>
              </div>

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={invoiceData.status}
                  onChange={(e) => setInvoiceData({ ...invoiceData, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partially Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="md:col-span-1">
                <Input
                  label="Client Reference"
                  value={invoiceData.client_reference}
                  onChange={(e) => setInvoiceData({ ...invoiceData, client_reference: e.target.value })}
                  placeholder="Client's PO or reference number"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-1">
              <Input
                label="Invoice Title"
                value={invoiceData.title}
                onChange={(e) => setInvoiceData({ ...invoiceData, title: e.target.value })}
                placeholder="e.g., Data Recovery Services Invoice"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="md:col-span-1">
                <Input
                  label="Invoice Date"
                  type="date"
                  value={invoiceData.invoice_date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setInvoiceData(prev => ({
                      ...prev,
                      invoice_date: newDate,
                      due_date: dueDateManuallySet ? prev.due_date : newDate
                    }));
                  }}
                  required
                />
              </div>

              <div className="md:col-span-1">
                <Input
                  label="Due Date"
                  type="date"
                  value={invoiceData.due_date}
                  onChange={(e) => {
                    setInvoiceData({ ...invoiceData, due_date: e.target.value });
                    setDueDateManuallySet(true);
                  }}
                  required
                />
              </div>
            </div>

            {currencies.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select
                  value={invoiceData.currency || baseCurrency}
                  onChange={(e) => setInvoiceData((d) => ({ ...d, currency: e.target.value }))}
                  className="rounded border border-border bg-surface px-3 py-2 text-sm"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}{c.isBase ? ' (base)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {quotes && quotes.length > 0 && !initialData && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-slate-100 p-1.5 rounded-lg">
                <Download className="w-4 h-4 text-slate-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Convert from Existing Quote</h3>
            </div>
            <select
              value={selectedQuoteId}
              onChange={(e) => handleQuoteSelection(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Select a quote to import...</option>
              {quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.quote_number} - {quote.title} ({currencyFormat.currencySymbol}
                  {quote.total_amount?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-slate-100 p-1.5 rounded-lg">
                <Package className="w-4 h-4 text-slate-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Items & Services</h3>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowCatalog(!showCatalog)}
              >
                <Search className="w-4 h-4 mr-1" />
                Quick Add
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {lineItems.map((item, index) => (
              <div key={index} className="flex gap-2 items-start p-2 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex-1 grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Describe the service or item"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Unit"
                      value={item.unit || ''}
                      onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) =>
                        updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeLineItem(index)}
                  className="p-2 text-danger hover:bg-danger-muted rounded-lg transition-colors"
                  title="Remove line item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-slate-100 p-1.5 rounded-lg">
                <Calculator className="w-4 h-4 text-slate-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Financial Calculation</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Input
                    label="Tax Rate (%)"
                    type="number"
                    value={invoiceData.tax_rate}
                    onChange={(e) =>
                      setInvoiceData({ ...invoiceData, tax_rate: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discount ({invoiceData.discount_type === 'percentage' ? '%' : docCurrency})
                  </label>
                  <input
                    type="number"
                    value={invoiceData.discount_amount}
                    onChange={(e) =>
                      setInvoiceData({ ...invoiceData, discount_amount: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discount Type
                  </label>
                  <div className="flex border border-slate-300 rounded-md overflow-hidden h-[34px]">
                    <button
                      type="button"
                      onClick={() => setInvoiceData({ ...invoiceData, discount_type: 'fixed' })}
                      className={`flex-1 px-2 py-1 transition-all flex items-center justify-center ${
                        invoiceData.discount_type === 'fixed'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Fixed Amount"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceData({ ...invoiceData, discount_type: 'percentage' })}
                      className={`flex-1 px-2 py-1 border-l border-slate-300 transition-all flex items-center justify-center ${
                        invoiceData.discount_type === 'percentage'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Percentage"
                    >
                      <Percent className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-info-muted border border-info/20 p-3 rounded-lg space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-info" />
                  <h4 className="text-sm font-semibold text-info">Summary</h4>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">Base Amount</span>
                  <span className="font-medium text-slate-900">
                    {fmtDoc(subtotal)}
                  </span>
                </div>
                {invoiceData.discount_amount > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">
                        Discount {invoiceData.discount_type === 'percentage' ? `(${invoiceData.discount_amount}%)` : ''}
                      </span>
                      <span className="font-medium text-danger">
                        -{fmtDoc(discountValue)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">Net Amount</span>
                      <span className="font-medium text-slate-900">
                        {fmtDoc(discountedSubtotal)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">VAT ({invoiceData.tax_rate}%)</span>
                  <span className="font-medium text-slate-900">
                    {fmtDoc(taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-info/30 pt-2 mt-2">
                  <span className="text-info">Total Amount</span>
                  <span className="text-primary">
                    {fmtDoc(total)}
                  </span>
                </div>
                {(() => {
                  const preview = Number.isNaN(baseRate)
                    ? 'rate unavailable'
                    : formatBaseEquivalent(total, baseRate, baseCurrency, docCurrency);
                  return preview ? <div className="text-xs text-surface-muted">{preview}</div> : null;
                })()}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-slate-100 p-1.5 rounded-lg">
                <Info className="w-4 h-4 text-slate-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Additional Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Bank Account
                </label>
                <select
                  value={invoiceData.bank_account_id || ''}
                  onChange={(e) => setInvoiceData({ ...invoiceData, bank_account_id: e.target.value || null })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  disabled={bankAccountsLoading}
                >
                  <option value="">None selected</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                    </option>
                  ))}
                </select>
                {bankAccounts.length === 0 && !bankAccountsLoading && (
                  <p className="text-xs text-warning mt-1">No bank accounts set up. Add one in Banking &gt; Accounts to display payment details on invoices.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Payment Terms
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTermsTemplates(!showTermsTemplates)}
                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Quick Add
                  </button>
                </div>
                {showTermsTemplates && (
                  <div className="mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-32 overflow-y-auto">
                    <div className="space-y-1">
                      {termsLoading ? (
                        <div className="text-center py-2 text-xs text-slate-500">Loading...</div>
                      ) : termsTemplates.length === 0 ? (
                        <div className="text-center py-2 text-xs text-slate-500">No templates found</div>
                      ) : (
                        termsTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyTermsTemplate(template)}
                            className="w-full text-left p-2 bg-white rounded border border-slate-200 hover:border-primary/40 hover:bg-primary/10 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-900">{template.name}</span>
                              {template.is_default && (
                                <span className="text-xs bg-warning-muted text-warning px-1.5 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <textarea
                  value={invoiceData.terms_and_conditions}
                  onChange={(e) =>
                    setInvoiceData({ ...invoiceData, terms_and_conditions: e.target.value })
                  }
                  rows={4}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="When payment is due (e.g., Net 30, Due on receipt)"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-3 border-t border-slate-200 mt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="shadow-md hover:shadow-lg transition-shadow"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
                {initialData ? 'Update Invoice' : 'Create Invoice'}
              </>
            )}
          </Button>
        </div>
      </form>

      <Dialog
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        label="Catalog"
        className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
      >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-slate-900">Quick Add from Catalog</h3>
              </div>
              <button
                onClick={() => setShowCatalog(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <Input
                placeholder="Search services, descriptions, or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="space-y-2">
                {catalogLoading ? (
                  <div className="text-center py-8 text-sm text-slate-500">Loading templates...</div>
                ) : filteredCatalog.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    {searchQuery ? 'No templates match your search' : 'No templates found'}
                  </div>
                ) : (
                  filteredCatalog.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addFromCatalog(item)}
                      className="w-full text-left p-3 bg-white rounded-lg border border-slate-200 hover:border-primary/40 hover:bg-primary/10 transition-all hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900 mb-1">{item.name}</div>
                          {item.description && (
                            <div className="text-sm text-slate-600 mb-2">{item.description}</div>
                          )}
                          <div className="flex items-center gap-2">
                            {item.item_category && (
                              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                                {item.item_category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-bold text-lg text-primary">
                            {currencyFormat.currencySymbol}
                            {(item.default_price ?? 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
      </Dialog>
    </Modal>
  );
};
