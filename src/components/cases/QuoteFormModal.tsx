import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Search, DollarSign, FileText, FileBarChart, Briefcase, Calculator, Package, Info, Percent } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { supabase } from '../../lib/supabaseClient';
import { useCurrency } from '../../hooks/useCurrency';
import { useTaxConfig, useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { tenantToday, addDaysIso } from '../../lib/tenantToday';
import { resolveDefaultRate, resolveTaxLabel } from './taxFieldConfig';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { getSupportedCurrencies, getBaseCurrency, getConversionRate, type SupportedCurrency } from '../../lib/currencyService';
import { formatCurrency, formatBaseEquivalent } from '../../lib/format';
import { listTemplates, recordTemplateUsage } from '../../lib/documentTemplatesService';
import { htmlToPlainText } from '../../lib/sanitizeHtml';
import { templateKeys } from '../../lib/queryKeys';
import { listUnitCodes, type UnitCode } from '../../lib/unitCodesService';

interface LineItemTemplate {
  id: string;
  name: string;
  description: string;
  unit_of_measure: string;
  default_price: number;
  item_category: string;
}

interface QuoteLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit_code?: string | null;
  unit_label?: string | null;
  item_code?: string | null;
}

interface QuoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (quoteData: Record<string, unknown>, items: QuoteLineItem[]) => Promise<void>;
  caseId?: string;
  customerId?: string | null;
  companyId?: string | null;
  initialData?: Record<string, unknown>;
  clientReference?: string;
}

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : undefined;
const asLineItems = (v: unknown): QuoteLineItem[] | undefined =>
  Array.isArray(v) ? (v as QuoteLineItem[]) : undefined;

interface QuoteTermsTemplate {
  id: string;
  name: string;
  content: string;
  is_default: boolean;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  is_active: boolean;
}

export const QuoteFormModal: React.FC<QuoteFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  caseId,
  customerId,
  companyId,
  initialData,
  clientReference,
}) => {
  const { currencyFormat } = useCurrency();
  const taxConfig = useTaxConfig();
  const { timezone } = useDateTimeConfig();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTermsTemplates, setShowTermsTemplates] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState<string>('');
  const [caseNumber, setCaseNumber] = useState<string>('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseId || '');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Calculate default valid_until date (30 days from now)
  const getDefaultValidUntil = () => {
    return addDaysIso(tenantToday(timezone), 30);
  };

  interface QuoteFormState {
    title: string;
    status: string;
    valid_until: string;
    client_reference: string;
    tax_rate: number;
    discount_amount: number;
    discount_type: string;
    terms_and_conditions: string;
    bank_account_id: string | null;
    currency: string;
  }

  const [quoteData, setQuoteData] = useState<QuoteFormState>({
    title: asString(initialData?.title) ?? '',
    status: asString(initialData?.status) ?? 'draft',
    valid_until: asString(initialData?.valid_until) ?? getDefaultValidUntil(),
    client_reference: asString(initialData?.client_reference) ?? clientReference ?? '',
    tax_rate: resolveDefaultRate(asNumber(initialData?.tax_rate), taxConfig.defaultRate),
    discount_amount: asNumber(initialData?.discount_amount) ?? 0,
    discount_type: asString(initialData?.discount_type) ?? 'fixed',
    terms_and_conditions: asString(initialData?.terms_and_conditions) ?? '',
    bank_account_id: asString(initialData?.bank_account_id) ?? null,
    currency: asString(initialData?.currency) ?? '',
  });

  useEffect(() => {
    if (initialData) {
      setQuoteData({
        title: asString(initialData.title) ?? '',
        status: asString(initialData.status) ?? 'draft',
        valid_until: asString(initialData.valid_until) ?? getDefaultValidUntil(),
        client_reference: asString(initialData.client_reference) ?? clientReference ?? '',
        tax_rate: resolveDefaultRate(asNumber(initialData.tax_rate), taxConfig.defaultRate),
        discount_amount: asNumber(initialData.discount_amount) ?? 0,
        discount_type: asString(initialData.discount_type) ?? 'fixed',
        terms_and_conditions: asString(initialData.terms_and_conditions) ?? '',
        bank_account_id: asString(initialData.bank_account_id) ?? null,
        currency: asString(initialData.currency) ?? '',
      });
    } else if (clientReference) {
      setQuoteData(prev => ({ ...prev, client_reference: clientReference }));
    }
  }, [clientReference, initialData]);

  const [currencies, setCurrencies] = useState<SupportedCurrency[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<string>('');
  const [baseRate, setBaseRate] = useState<number>(1);

  useEffect(() => {
    getSupportedCurrencies().then(setCurrencies).catch(() => setCurrencies([]));
    getBaseCurrency().then(setBaseCurrency).catch(() => {});
  }, []);

  useEffect(() => {
    if (baseCurrency && !quoteData.currency) {
      setQuoteData((d) => ({ ...d, currency: baseCurrency }));
    }
  }, [baseCurrency]);

  useEffect(() => {
    const doc = quoteData.currency || baseCurrency;
    if (!doc || !baseCurrency || doc === baseCurrency) { setBaseRate(1); return; }
    getConversionRate(doc, baseCurrency).then(setBaseRate).catch(() => setBaseRate(NaN));
  }, [quoteData.currency, baseCurrency]);

  useEffect(() => {
    const fetchMetadata = async () => {
      if (isOpen) {
        const existingQuoteNumber = asString(initialData?.quote_number);
        if (existingQuoteNumber) {
          setQuoteNumber(existingQuoteNumber);
        } else {
          // Fetch the next quote number from the system
          try {
            const { data: nextNumber, error } = await supabase
              .rpc('get_next_number', { p_scope: 'quote' });

            if (!error && typeof nextNumber === 'string' && nextNumber) {
              setQuoteNumber(nextNumber);
            } else {
              setQuoteNumber('QT-000001');
            }
          } catch (error) {
            logger.error('Error fetching next quote number:', error);
            setQuoteNumber('QT-000001');
          }
        }

        const activeCaseId = caseId || selectedCaseId;
        if (activeCaseId) {
          const { data } = await supabase
            .from('cases')
            .select('case_no, service_type_id, customer_id, company_id')
            .eq('id', activeCaseId)
            .maybeSingle();
          if (data) {
            setCaseNumber(data.case_no ?? '');

            // Auto-populate quote title from service type for new quotes
            if (!initialData && data.service_type_id) {
              const { data: serviceType } = await supabase
                .from('catalog_service_types')
                .select('name')
                .eq('id', data.service_type_id)
                .maybeSingle();

              if (serviceType && !quoteData.title) {
                setQuoteData(prev => ({ ...prev, title: serviceType.name }));
              }
            }
          }
        }
      }
    };
    fetchMetadata();
  }, [isOpen, caseId, selectedCaseId, initialData]);

  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(
    asLineItems(initialData?.quote_items) ?? [
      { description: '', quantity: 1, unit_price: 0, unit_code: null, unit_label: null, item_code: null },
    ]
  );

  useEffect(() => {
    const items = asLineItems(initialData?.quote_items);
    if (items) {
      setLineItems(items);
    } else {
      setLineItems([{ description: '', quantity: 1, unit_price: 0, unit_code: null, unit_label: null, item_code: null }]);
    }
    // Re-seed only when the edited document changes — keying on object identity
    // re-fired on every parent re-render and clobbered edits / quote-import items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id]);

  const [unitCodes, setUnitCodes] = useState<UnitCode[]>([]);

  useEffect(() => {
    listUnitCodes().then(setUnitCodes).catch(() => setUnitCodes([]));
  }, []);

  const { data: lineItemTemplates = [], isLoading: catalogLoading } = useQuery<LineItemTemplate[]>({
    queryKey: ['quote_line_item_templates'],
    queryFn: async () => {
      // Schema drift: document_templates no longer carries unit_of_measure /
      // default_price / item_category. Quick Add catalog is disabled until a
      // replacement source (e.g. catalog_service_line_items) is wired in.
      return [];
    },
    enabled: isOpen,
  });

  const { data: termsTemplates = [], isLoading: termsLoading } = useQuery({
    queryKey: templateKeys.list('quote_terms'),
    queryFn: async (): Promise<QuoteTermsTemplate[]> => {
      const templates = await listTemplates('quote_terms');
      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        content: t.content,
        is_default: t.isDefault,
      }));
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
    queryKey: ['cases_for_quote'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_no, title, customer_id, company_id, service_type_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: isOpen && !caseId,
  });

  useEffect(() => {
    if (bankAccounts.length > 0 && !quoteData.bank_account_id && !initialData) {
      setQuoteData(prev => ({ ...prev, bank_account_id: bankAccounts[0].id }));
    }
  }, [bankAccounts, initialData]);

  const filteredCatalog = lineItemTemplates.filter((item) => {
    if (!searchQuery.trim()) return true;
    const search = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.item_category?.toLowerCase().includes(search)
    );
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0, unit_code: null, unit_label: null, item_code: null }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof QuoteLineItem, value: string | number | null) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addFromCatalog = (template: LineItemTemplate) => {
    const newItem: QuoteLineItem = {
      description: `${template.name}${template.description ? ' - ' + template.description : ''}`,
      quantity: 1,
      unit_price: template.default_price,
      unit_code: null,
      unit_label: template.unit_of_measure ?? null,
    };
    setLineItems([...lineItems, newItem]);
    setShowCatalog(false);
    setSearchQuery('');
  };

  const applyTermsTemplate = (template: QuoteTermsTemplate) => {
    const plainText = htmlToPlainText(template.content);
    setQuoteData(prev => ({ ...prev, terms_and_conditions: plainText }));
    setShowTermsTemplates(false);
    void recordTemplateUsage(template.id);
  };

  const docCurrency = quoteData.currency || baseCurrency || currencyFormat.currencyCode;
  const fmtDoc = (v: number) => formatCurrency(v, docCurrency);

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price;
  }, 0);

  // Calculate discount based on type
  const discountValue = quoteData.discount_type === 'percentage'
    ? (subtotal * quoteData.discount_amount) / 100
    : quoteData.discount_amount;

  // Apply discount to subtotal first, then calculate VAT on discounted amount
  const discountedSubtotal = subtotal - discountValue;
  const taxAmount = (discountedSubtotal * quoteData.tax_rate) / 100;

  const total = discountedSubtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const activeCaseId = caseId || selectedCaseId;
    if (!activeCaseId) {
      toast.error('Select which case this quote is for');
      return;
    }

    if (!quoteData.title || quoteData.title.trim() === '') {
      toast.error('Give this quote a title (e.g., Data Recovery Service)');
      return;
    }

    if (lineItems.length === 0 || lineItems.every((item) => !item.description.trim())) {
      toast.error('Add at least one item or service to continue');
      return;
    }

    const invalidItems = lineItems.filter(
      (item) => item.quantity <= 0 || item.unit_price < 0
    );
    if (invalidItems.length > 0) {
      toast.error('Check that all items have quantities greater than 0 and valid prices');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCase = cases.find(c => c.id === activeCaseId);
      const editingId = asString(initialData?.id);
      await onSave(
        {
          ...quoteData,
          id: editingId,
          case_id: activeCaseId,
          customer_id: customerId || selectedCase?.customer_id || null,
          company_id: companyId || selectedCase?.company_id || null,
          bank_account_id: quoteData.bank_account_id || null,
        },
        lineItems
      );
      onClose();
    } catch (error: unknown) {
      logger.error('Error saving quote:', error);
      const errorMessage = error instanceof Error ? error.message : 'Quote couldn\'t be saved. Check your connection and try again.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerBadges = (
    <>
      <div className="flex items-center gap-1.5 bg-success-muted border border-success/30 px-2.5 py-1 rounded-lg">
        <FileBarChart className="w-3.5 h-3.5 text-success" />
        <span className="text-xs font-semibold text-success">{quoteNumber}</span>
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
      title={initialData ? 'Edit Quote' : 'Create New Quote'}
      size="xl"
      initialFocusRef={titleInputRef}
      headerBadges={headerBadges}
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="quoteForm"
            variant="success"
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
                <DollarSign className="w-5 h-5 mr-2" />
                {initialData ? 'Update Quote' : 'Create Quote'}
              </>
            )}
          </Button>
        </div>
      }
    >
      <form id="quoteForm" onSubmit={handleSubmit} className="space-y-3">

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
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-success focus:border-success"
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
            <h3 className="text-sm font-semibold text-slate-900">Quote Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <div className="md:col-span-1">
              <Input
                ref={titleInputRef}
                label="Quote Title"
                value={quoteData.title}
                onChange={(e) => setQuoteData({ ...quoteData, title: e.target.value })}
                required
                placeholder="e.g., Data Recovery Service"
              />
            </div>

            <div className="md:col-span-1">
              <Input
                label="Client Reference"
                value={quoteData.client_reference}
                onChange={(e) => setQuoteData({ ...quoteData, client_reference: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={quoteData.status}
                onChange={(e) => setQuoteData({ ...quoteData, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-success focus:border-success"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <Input
                label="Valid Until"
                type="date"
                value={quoteData.valid_until}
                onChange={(e) => setQuoteData({ ...quoteData, valid_until: e.target.value })}
              />
            </div>

            {currencies.length > 1 && (
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select
                  value={quoteData.currency || baseCurrency}
                  onChange={(e) => setQuoteData((d) => ({ ...d, currency: e.target.value }))}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}{c.isBase ? ' (base)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

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
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Describe the service or item"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      aria-label="Unit"
                      value={item.unit_code ?? ''}
                      onChange={(e) => {
                        const code = e.target.value || null;
                        const unit = unitCodes.find((u) => u.code === code);
                        const updated = [...lineItems];
                        updated[index] = { ...updated[index], unit_code: code, unit_label: unit?.label ?? null };
                        setLineItems(updated);
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
                    >
                      <option value="">—</option>
                      {unitCodes.map((u) => (
                        <option key={u.code} value={u.code}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="HSN/SAC"
                      aria-label="Item code"
                      value={item.item_code ?? ''}
                      onChange={(e) => updateLineItem(index, 'item_code', e.target.value || null)}
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
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
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) =>
                        updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
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
                    value={quoteData.tax_rate}
                    onChange={(e) =>
                      setQuoteData({ ...quoteData, tax_rate: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discount ({quoteData.discount_type === 'percentage' ? '%' : docCurrency})
                  </label>
                  <input
                    type="number"
                    value={quoteData.discount_amount}
                    onChange={(e) =>
                      setQuoteData({ ...quoteData, discount_amount: parseFloat(e.target.value) || 0 })
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
                      onClick={() => setQuoteData({ ...quoteData, discount_type: 'fixed' })}
                      className={`flex-1 px-2 py-1 transition-all flex items-center justify-center ${
                        quoteData.discount_type === 'fixed'
                          ? 'bg-success text-success-foreground shadow-sm'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Fixed Amount"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuoteData({ ...quoteData, discount_type: 'percentage' })}
                      className={`flex-1 px-2 py-1 border-l border-slate-300 transition-all flex items-center justify-center ${
                        quoteData.discount_type === 'percentage'
                          ? 'bg-success text-success-foreground shadow-sm'
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
                {quoteData.discount_amount > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">
                        Discount {quoteData.discount_type === 'percentage' ? `(${quoteData.discount_amount}%)` : ''}
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
                  <span className="text-slate-700">{resolveTaxLabel(taxConfig.label, quoteData.tax_rate)}</span>
                  <span className="font-medium text-slate-900">
                    {fmtDoc(taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-info/30 pt-2 mt-2">
                  <span className="text-info">Total Amount</span>
                  <span className="text-success">
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
                  value={quoteData.bank_account_id || ''}
                  onChange={(e) => setQuoteData({ ...quoteData, bank_account_id: e.target.value || null })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
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
                  <p className="text-xs text-warning mt-1">No bank accounts set up. Add one in Banking &gt; Accounts to display payment details on quotes.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Quote Terms
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTermsTemplates(!showTermsTemplates)}
                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Terms & Templates
                  </button>
                </div>
                {showTermsTemplates && (
                  <div className="mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-32 overflow-y-auto">
                    <div className="space-y-1">
                      {termsLoading ? (
                        <div className="text-center py-2 text-xs text-slate-500">Loading...</div>
                      ) : termsTemplates.length === 0 ? (
                        <div className="text-center py-2 text-xs text-slate-500">No saved terms yet</div>
                      ) : (
                        termsTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyTermsTemplate(template)}
                            className="w-full text-left p-2 bg-white rounded border border-slate-200 hover:border-success/60 hover:bg-success-muted transition-colors"
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
                  value={quoteData.terms_and_conditions}
                  onChange={(e) =>
                    setQuoteData({ ...quoteData, terms_and_conditions: e.target.value })
                  }
                  rows={4}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-success focus:border-success"
                  placeholder="Quote validity and payment terms (e.g., Quote valid for 30 days, 50% deposit required)"
                />
              </div>
            </div>
          </div>
        </div>

      </form>

      <Dialog
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        label="Catalog"
        className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
      >
            <div className="flex items-center gap-2 p-4 border-b border-slate-200">
              <Search className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-slate-900">Quick Add from Catalog</h3>
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
                      className="w-full text-left p-3 bg-white rounded-lg border border-slate-200 hover:border-success/60 hover:bg-success-muted transition-all hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900 mb-1">{item.name}</div>
                          {item.description && (
                            <div className="text-sm text-slate-600 mb-2">{item.description}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                              {item.item_category}
                            </span>
                            <span className="text-xs text-slate-500">
                              {item.unit_of_measure}
                            </span>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-bold text-lg text-success">
                            {fmtDoc(item.default_price)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3">
              <Button type="button" variant="secondary" onClick={() => setShowCatalog(false)}>
                Done
              </Button>
            </div>
      </Dialog>
    </Modal>
  );
};
