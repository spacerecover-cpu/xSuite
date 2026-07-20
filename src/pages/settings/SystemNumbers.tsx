import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ChevronLeft, Search, Edit2, Check, X } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface NumberSequence {
  id: string;
  scope: string;
  prefix: string;
  padding: number;
  current_value: number;
  reset_annually: boolean;
  created_at: string;
  format_template: string | null;
  reset_basis: string | null;
  fiscal_year_anchor: string | null;
  max_length: number | null;
}

interface ScopeCard {
  key: string;
  label: string;
  description: string;
  category: string;
}

// The REAL numbering vocabulary: every live `number_sequences` scope ∪ every
// `get_next_number(...)` caller in `src/lib` (verified 2026-07-02). The old
// SEQUENCE_CONFIG advertised phantom singular scopes (`customer`, `invoice`,
// `supplier`, `user`, `document`, …) that no code path ever mints. The settings
// surface now renders this registry unioned with live rows, so unknown live
// scopes still surface and the phantom cards die.
export const SCOPE_REGISTRY = [
  { key: 'case', label: 'Case Number', description: 'Recovery case identifiers', category: 'Operations' },
  { key: 'invoices', label: 'Tax Invoice Number', description: 'Sequential tax invoices (legal series)', category: 'Financial' },
  { key: 'proforma_invoices', label: 'Proforma Number', description: 'Proforma series (non-tax)', category: 'Financial' },
  { key: 'quote', label: 'Quote Number', description: 'Customer quotations', category: 'Financial' },
  { key: 'payment', label: 'Payment Number', description: 'Payment records', category: 'Financial' },
  { key: 'expense', label: 'Expense Number', description: 'Expense records', category: 'Financial' },
  { key: 'customers', label: 'Customer Number', description: 'Individual client IDs', category: 'Business Partners' },
  { key: 'companies', label: 'Company Number', description: 'Corporate client IDs', category: 'Business Partners' },
  { key: 'suppliers', label: 'Supplier Number', description: 'Vendor/supplier IDs', category: 'Business Partners' },
  { key: 'stock', label: 'Stock Number', description: 'Stock item management', category: 'Inventory' },
  { key: 'stock_adjustment', label: 'Stock Adjustment Number', description: 'Stock adjustment sessions', category: 'Inventory' },
  { key: 'purchase_orders', label: 'Purchase Order Number', description: 'Supplier purchase orders', category: 'Operations' },
  { key: 'report_evaluation', label: 'Evaluation Report Number', description: 'Assessment and recovery feasibility reports', category: 'Reports' },
  { key: 'report_service', label: 'Service Report Number', description: 'Service work documentation reports', category: 'Reports' },
  { key: 'payroll_bank_file', label: 'Payroll Bank File Number', description: 'Payroll bank-file batches', category: 'HR' },
] as const;

// Section order for the grouped tables; any live category not listed (defensive)
// is appended after these.
const CATEGORY_ORDER = ['Operations', 'Financial', 'Business Partners', 'Inventory', 'Reports', 'HR', 'Other'];

// Turn a raw live scope with no registry entry into a readable label:
// `inventory:6b24638d-…` -> "Inventory · 6b24638d"; `credit_note` -> "Credit Note".
function prettifyScope(scope: string): string {
  if (scope.includes(':')) {
    const [base, rest] = scope.split(':');
    const head = base.charAt(0).toUpperCase() + base.slice(1);
    return rest ? `${head} · ${rest.slice(0, 8)}` : head;
  }
  return scope
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Allowed `reset_basis` values are enforced by the DB CHECK in
// `update_number_sequence` — keep this list in lockstep with it.
const RESET_BASIS_OPTIONS: { value: string; label: string }[] = [
  { value: 'never', label: 'No automatic reset' },
  { value: 'calendar_year', label: 'Reset each calendar year' },
  { value: 'fiscal_year', label: 'Reset each fiscal year' },
];

const emptyForm = () => ({
  prefix: '',
  padding: 4,
  reset_annually: false,
  format_template: '',
  reset_basis: 'never',
  fiscal_year_anchor: '',
  max_length: '',
});

export const SystemNumbers: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<NumberSequence | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [debouncedTemplate, setDebouncedTemplate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  // Per-scope inline edit drafts for the table's Prefix/Padding cells. A scope is
  // "dirty" while a draft differs from its stored row; Save persists just those two
  // fields (advanced format/reset stay untouched via COALESCE in the RPC).
  const [drafts, setDrafts] = useState<Record<string, { prefix: string; padding: number }>>({});

  const setDraft = (key: string, seq: NumberSequence, patch: Partial<{ prefix: string; padding: number }>) => {
    setDrafts((prev) => {
      const base = prev[key] ?? { prefix: seq.prefix, padding: seq.padding };
      return { ...prev, [key]: { ...base, ...patch } };
    });
  };
  const cancelDraft = (key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['number_sequences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('number_sequences')
        .select('*')
        .order('scope', { ascending: true });

      if (error) throw error;
      return data as NumberSequence[];
    },
  });

  // Debounce the template so the preview RPC fires when the admin pauses typing,
  // not on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTemplate(formData.format_template), 350);
    return () => clearTimeout(handle);
  }, [formData.format_template]);

  const previewScope = editingSequence?.scope ?? '';
  const previewTemplate = debouncedTemplate.trim();
  const {
    data: previewValue,
    isFetching: isPreviewFetching,
    isError: isPreviewError,
  } = useQuery({
    queryKey: ['preview_number_format', previewScope, previewTemplate],
    enabled: isModalOpen && previewScope.length > 0 && previewTemplate.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('preview_number_format', {
        p_scope: previewScope,
        p_format_template: previewTemplate,
      });
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      scope,
      prefix,
      padding,
      reset_annually,
      format_template,
      reset_basis,
      fiscal_year_anchor,
      max_length,
    }: {
      scope: string;
      prefix: string;
      padding: number;
      reset_annually: boolean;
      format_template: string;
      reset_basis: string;
      fiscal_year_anchor: string;
      max_length: string;
    }) => {
      // Optional args use COALESCE(p_arg, stored) in the RPC, so `undefined`
      // (=> SQL NULL) means "keep the stored value". `reset_basis` is sent
      // literally: 'never' is a real persistable state (not a clear), so
      // COALESCE keeps it — mapping 'never' to `undefined` silently dropped the
      // "turn the reset off" change. `format_template` / `fiscal_year_anchor`
      // blank still maps to `undefined` ("keep") because COALESCE-to-stored
      // cannot null a field back out; reverting a set template to the classic
      // PREFIX-#### form needs a DB clear-sentinel (tracked cross-file).
      const { error } = await supabase
        .rpc('update_number_sequence', {
          p_scope: scope,
          p_prefix: prefix,
          p_padding: padding,
          p_reset: reset_annually,
          p_format_template: format_template || undefined,
          p_reset_basis: reset_basis,
          p_fiscal_year_anchor: fiscal_year_anchor || undefined,
          p_max_length: max_length === '' ? undefined : Number(max_length),
        });

      if (error) {
        logger.error('Error updating number sequence:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['number_sequences'] });
      setIsModalOpen(false);
      setEditingSequence(null);
      setFormData(emptyForm());
      setDebouncedTemplate('');

      toast.success('Number sequence updated successfully');
    },
    onError: (error: Error) => {
      logger.error('Failed to update number sequence:', error);
      toast.error(`Failed to update: ${error.message || 'Unknown error occurred'}`);
    },
  });

  // Inline table save: persists ONLY prefix + padding (leaving advanced format /
  // reset fields as stored via COALESCE-to-stored in the RPC). Separate from the
  // modal mutation so it never touches modal state.
  const inlineSaveMutation = useMutation({
    mutationFn: async (vars: { scope: string; prefix: string; padding: number; reset_annually: boolean; reset_basis: string }) => {
      const { error } = await supabase.rpc('update_number_sequence', {
        p_scope: vars.scope,
        p_prefix: vars.prefix,
        p_padding: vars.padding,
        p_reset: vars.reset_annually,
        p_reset_basis: vars.reset_basis,
        p_format_template: undefined,
        p_fiscal_year_anchor: undefined,
        p_max_length: undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['number_sequences'] });
      cancelDraft(vars.scope);
      toast.success('Number sequence updated successfully');
    },
    onError: (error: Error) => {
      logger.error('Failed inline number-sequence save:', error);
      toast.error(`Failed to update: ${error.message || 'Unknown error occurred'}`);
    },
  });

  const handleInlineSave = (key: string, seq: NumberSequence) => {
    const draft = drafts[key];
    if (!draft) return;
    inlineSaveMutation.mutate({
      scope: key,
      prefix: draft.prefix,
      padding: draft.padding,
      reset_annually: seq.reset_annually,
      reset_basis: seq.reset_basis ?? 'never',
    });
  };

  const handleEdit = (sequence: NumberSequence) => {
    setEditingSequence(sequence);
    setFormData({
      prefix: sequence.prefix,
      padding: sequence.padding,
      reset_annually: sequence.reset_annually,
      format_template: sequence.format_template ?? '',
      reset_basis: sequence.reset_basis ?? 'never',
      fiscal_year_anchor: sequence.fiscal_year_anchor ?? '',
      max_length: sequence.max_length == null ? '' : String(sequence.max_length),
    });
    setDebouncedTemplate(sequence.format_template ?? '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSequence) return;

    updateMutation.mutate({
      scope: editingSequence.scope,
      prefix: formData.prefix,
      padding: formData.padding,
      reset_annually: formData.reset_annually,
      format_template: formData.format_template,
      reset_basis: formData.reset_basis,
      fiscal_year_anchor: formData.fiscal_year_anchor,
      max_length: formData.max_length,
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSequence(null);
    setFormData(emptyForm());
    setDebouncedTemplate('');
  };

  const formatNumber = (seq: NumberSequence) => {
    // Template rows are rendered server-side (see the edit-modal live preview);
    // reusing the legacy prefix+padding form here would advertise a next number
    // the DB will never mint, so surface a neutral marker instead of a lie.
    if (seq.format_template) return 'Templated';
    const nextNum = seq.current_value + 1;
    return seq.prefix + '-' + nextNum.toString().padStart(seq.padding, '0');
  };

  const formatCurrentNumber = (seq: NumberSequence) => {
    if (seq.current_value === 0) return 'Not assigned';
    return seq.prefix + '-' + seq.current_value.toString().padStart(seq.padding, '0');
  };

  // Registry ∪ live rows: a live scope absent from the registry (e.g. a dynamic
  // `inventory:<uuid>` sequence) still surfaces as an "Other" card; a registry
  // entry with no live row renders as "not yet used".
  const registryKeys = new Set<string>(SCOPE_REGISTRY.map(s => s.key));
  const scopeCards: ScopeCard[] = [
    ...SCOPE_REGISTRY.map(s => ({ key: s.key, label: s.label, description: s.description, category: s.category })),
    ...sequences
      // `inventory:<uuid>` sequences are managed per device type on the Inventory
      // Defaults page, not here — keep them out of this generic list.
      .filter(seq => !registryKeys.has(seq.scope) && !seq.scope.startsWith('inventory:'))
      .map(seq => ({ key: seq.scope, label: prettifyScope(seq.scope), description: '', category: 'Other' })),
  ];

  const categories = ['All', ...Array.from(new Set(scopeCards.map(c => c.category)))];

  const filteredSequenceTypes = scopeCards.filter(type => {
    const matchesSearch = type.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          type.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || type.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group the (filtered) sequences into ordered category sections for the tables.
  const orderedCategories = [
    ...CATEGORY_ORDER,
    ...Array.from(new Set(filteredSequenceTypes.map(t => t.category))).filter(c => !CATEGORY_ORDER.includes(c)),
  ];
  const groupedSections = orderedCategories
    .map(category => ({ category, rows: filteredSequenceTypes.filter(t => t.category === category) }))
    .filter(section => section.rows.length > 0);

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <SettingsPageHeader categoryId="system-numbers" />
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-4 transition-all hover:gap-2.5 font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Settings</span>
      </button>

      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search sequences..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedCategory === category
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-primary/50 hover:bg-info-muted'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Number Sequences ({filteredSequenceTypes.length})
              </h2>
              <p className="text-slate-500 text-sm">Configure prefixes and current numbers for automatic numbering</p>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : groupedSections.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">No sequences match your search.</p>
              </div>
            ) : (
              <div className="space-y-7">
                {groupedSections.map((section) => (
                  <section key={section.category}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {section.category}
                      </span>
                      <span className="text-xs font-medium text-slate-400 tabular-nums">{section.rows.length}</span>
                      <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] table-fixed text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                            <th scope="col" className="px-4 py-2 font-semibold">Sequence</th>
                            <th scope="col" className="w-36 px-3 py-2 font-semibold">Prefix</th>
                            <th scope="col" className="w-24 px-3 py-2 font-semibold">Padding</th>
                            <th scope="col" className="w-40 px-3 py-2 font-semibold">Next number</th>
                            <th scope="col" className="w-36 px-3 py-2 font-semibold">Current</th>
                            <th scope="col" className="w-28 px-3 py-2 font-semibold">Status</th>
                            <th scope="col" className="w-16 px-3 py-2"><span className="sr-only">Edit</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {section.rows.map((type) => {
                            const sequence = sequences.find((s) => s.scope === type.key);
                            const hasRow = !!sequence;
                            const hasStarted = !!sequence && sequence.current_value > 0;
                            const displaySeq: NumberSequence = sequence || {
                              id: '',
                              scope: type.key,
                              prefix: type.key.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4),
                              padding: 4,
                              current_value: 0,
                              reset_annually: false,
                              created_at: '',
                              format_template: null,
                              reset_basis: null,
                              fiscal_year_anchor: null,
                              max_length: null,
                            };
                            const draft = drafts[type.key];
                            const effPrefix = draft ? draft.prefix : displaySeq.prefix;
                            const effPadding = draft ? draft.padding : displaySeq.padding;
                            const isDirty = !!draft && (draft.prefix !== displaySeq.prefix || draft.padding !== displaySeq.padding);
                            const rowSaving = inlineSaveMutation.isPending && inlineSaveMutation.variables?.scope === type.key;

                            return (
                              <tr key={type.key} className="group align-middle transition-colors hover:bg-slate-50">
                                <td className="px-4 py-2 align-middle">
                                  <h3 className="truncate text-sm font-semibold text-slate-900" title={type.label}>
                                    {type.label}
                                  </h3>
                                  {type.description && (
                                    <p className="mt-0.5 truncate text-xs text-slate-500">{type.description}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    aria-label={`${type.label} prefix`}
                                    value={effPrefix}
                                    onChange={(e) => setDraft(type.key, displaySeq, { prefix: e.target.value.toUpperCase() })}
                                    className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    aria-label={`${type.label} padding`}
                                    value={effPadding}
                                    onChange={(e) => setDraft(type.key, displaySeq, { padding: Math.max(1, Math.min(10, parseInt(e.target.value) || displaySeq.padding)) })}
                                    className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-sm tabular-nums text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <Badge variant="success" size="sm" className="font-mono">
                                    {formatNumber({ ...displaySeq, prefix: effPrefix, padding: effPadding })}
                                  </Badge>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 align-middle font-mono text-slate-500">
                                  {hasStarted ? formatCurrentNumber(displaySeq) : '—'}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  {hasStarted ? (
                                    <Badge variant="info" size="sm">Active</Badge>
                                  ) : hasRow ? (
                                    <Badge variant="secondary" size="sm">Configured</Badge>
                                  ) : (
                                    <span className="text-xs font-medium text-slate-400">Not yet used</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  {isDirty ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => handleInlineSave(type.key, displaySeq)}
                                        disabled={rowSaving}
                                        title="Save prefix & padding"
                                        className="rounded-md p-1.5 text-success transition-colors hover:bg-success-muted disabled:opacity-50"
                                      >
                                        <Check className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => cancelDraft(type.key)}
                                        disabled={rowSaving}
                                        title="Discard changes"
                                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex justify-end">
                                      <button
                                        onClick={() => handleEdit(displaySeq)}
                                        title="Edit sequence"
                                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`Edit ${editingSequence ? (SCOPE_REGISTRY.find(t => t.key === editingSequence.scope)?.label ?? editingSequence.scope) : ''}`}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Prefix
            </label>
            <Input
              value={formData.prefix}
              onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toUpperCase() })}
              placeholder="INV-"
              className="font-mono"
            />
            <p className="text-xs text-slate-500 mt-2">
              The prefix that appears before the number (e.g., INV-0001)
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Number Padding
            </label>
            <Input
              type="number"
              value={formData.padding}
              onChange={(e) => setFormData({ ...formData, padding: Math.max(1, Math.min(10, parseInt(e.target.value) || 4)) })}
              min="1"
              max="10"
              className="font-mono"
            />
            <p className="text-xs text-slate-500 mt-2">
              Preview: <span className="font-semibold">{formData.prefix}-{(( editingSequence?.current_value ?? 0) + 1).toString().padStart(formData.padding, '0')}</span>
            </p>
          </div>

          <div className="border-t border-slate-200 pt-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Advanced format</h3>
              <p className="text-xs text-slate-500 mt-1">
                Optional. Leave the template blank to keep the classic prefix and number format above.
              </p>
            </div>

            <div>
              <label htmlFor="format_template" className="block text-sm font-semibold text-slate-700 mb-2">
                Format Template
              </label>
              <Input
                id="format_template"
                value={formData.format_template}
                onChange={(e) => setFormData({ ...formData, format_template: e.target.value })}
                placeholder="INV/{FY}/{SEQ:4}"
                className="font-mono"
              />
              <p className="text-xs text-slate-500 mt-2">
                Use <span className="font-mono">{'{SEQ:n}'}</span> for the zero-padded counter and{' '}
                <span className="font-mono">{'{FY}'}</span> for the fiscal-year label.
              </p>
              {formData.format_template.trim().length > 0 && (
                <p className="text-xs mt-2" aria-live="polite">
                  {isPreviewError ? (
                    <span className="text-danger">Template must contain a {'{SEQ:n}'} token.</span>
                  ) : (
                    <span className="text-slate-500">
                      Next number:{' '}
                      <span className="font-mono font-semibold text-slate-700">
                        {isPreviewFetching ? '…' : (previewValue ?? '…')}
                      </span>
                    </span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reset_basis" className="block text-sm font-semibold text-slate-700 mb-2">
                Reset Basis
              </label>
              <select
                id="reset_basis"
                value={formData.reset_basis}
                onChange={(e) => setFormData({ ...formData, reset_basis: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {RESET_BASIS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {formData.reset_basis === 'fiscal_year' && (
              <div>
                <label htmlFor="fiscal_year_anchor" className="block text-sm font-semibold text-slate-700 mb-2">
                  Fiscal Year Start
                </label>
                <Input
                  id="fiscal_year_anchor"
                  value={formData.fiscal_year_anchor}
                  onChange={(e) => setFormData({ ...formData, fiscal_year_anchor: e.target.value })}
                  placeholder="01-01"
                  className="font-mono"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Month and day the fiscal year begins, as MM-DD (e.g. 04-01 for April 1).
                </p>
              </div>
            )}

            <div>
              <label htmlFor="max_length" className="block text-sm font-semibold text-slate-700 mb-2">
                Maximum Length
              </label>
              <Input
                id="max_length"
                type="number"
                value={formData.max_length}
                onChange={(e) => setFormData({ ...formData, max_length: e.target.value })}
                min="1"
                placeholder="Optional"
                className="font-mono"
              />
              <p className="text-xs text-slate-500 mt-2">
                Optional cap on the total generated length; leave blank for no limit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="reset_annually"
              checked={formData.reset_annually}
              onChange={(e) => setFormData({ ...formData, reset_annually: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <label htmlFor="reset_annually" className="text-sm font-semibold text-slate-700">
              Reset numbering annually
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="secondary" onClick={handleCloseModal} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Sequence'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
