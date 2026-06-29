import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ChevronLeft, Hash, Search, ArrowRight } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

type SequenceScope =
  | 'case'
  | 'invoice'
  | 'quote'
  | 'customer'
  | 'expense'
  | 'asset'
  | 'proforma_invoice'
  | 'transfer'
  | 'deposit'
  | 'company'
  | 'supplier'
  | 'stock'
  | 'purchase_order'
  | 'employee'
  | 'user'
  | 'document'
  | 'clone_drive'
  | 'report'
  | 'report_evaluation'
  | 'report_service'
  | 'report_server'
  | 'report_malware'
  | 'report_forensic'
  | 'report_data_destruction'
  | 'report_prevention';

interface NumberSequence {
  id: string;
  scope: SequenceScope;
  prefix: string;
  padding: number;
  current_value: number;
  reset_annually: boolean;
  created_at: string;
}

const SEQUENCE_CONFIG = [
  { key: 'case', label: 'Case ID', description: 'Data recovery case tracking', category: 'Operations', color: '#10b981' },
  { key: 'invoice', label: 'Invoice Number', description: 'Customer invoicing', category: 'Financial', color: 'rgb(var(--color-accent))' },
  { key: 'quote', label: 'Quote Number', description: 'Price quotations', category: 'Financial', color: '#3b82f6' },
  { key: 'proforma_invoice', label: 'Proforma Invoice Number', description: 'Advance payment invoices', category: 'Financial', color: '#ec4899' },
  { key: 'expense', label: 'Expense Number', description: 'Business expense tracking', category: 'Financial', color: '#ef4444' },
  { key: 'deposit', label: 'Deposit Number', description: 'Bank deposit receipts', category: 'Financial', color: '#f97316' },
  { key: 'transfer', label: 'Transfer Number', description: 'Bank transfer transactions', category: 'Financial', color: '#f59e0b' },
  { key: 'customer', label: 'Customer Number', description: 'Individual client IDs', category: 'Business Partners', color: '#06b6d4' },
  { key: 'company', label: 'Company Number', description: 'Corporate client IDs', category: 'Business Partners', color: '#0ea5e9' },
  { key: 'supplier', label: 'Supplier Number', description: 'Vendor/supplier IDs', category: 'Business Partners', color: '#14b8a6' },
  { key: 'asset', label: 'Asset Number', description: 'Company asset tracking', category: 'Inventory', color: 'rgb(var(--color-accent))' },
  { key: 'clone_drive', label: 'Clone ID', description: 'Physical clone drive resources', category: 'Inventory', color: '#3b82f6' },
  { key: 'stock', label: 'Stock Number', description: 'Stock item management', category: 'Inventory', color: 'rgb(var(--color-accent))' },
  { key: 'purchase_order', label: 'Purchase Order Number', description: 'Supplier purchase orders', category: 'Operations', color: '#d946ef' },
  { key: 'document', label: 'Document Number', description: 'General document tracking', category: 'Operations', color: '#64748b' },
  { key: 'employee', label: 'Employee Number', description: 'Employee ID numbers', category: 'HR', color: '#22c55e' },
  { key: 'user', label: 'User Number', description: 'System user IDs', category: 'HR', color: '#84cc16' },
  { key: 'report_evaluation', label: 'Evaluation Report Number', description: 'Assessment and recovery feasibility reports', category: 'Reports', color: '#3b82f6' },
  { key: 'report_service', label: 'Service Report Number', description: 'Service work documentation reports', category: 'Reports', color: '#10b981' },
  { key: 'report_server', label: 'Server Report Number', description: 'Server recovery and RAID reports', category: 'Reports', color: 'rgb(var(--color-accent))' },
  { key: 'report_malware', label: 'Malware Report Number', description: 'Malware analysis and remediation reports', category: 'Reports', color: '#ef4444' },
  { key: 'report_forensic', label: 'Forensic Report Number', description: 'Legal forensic investigation reports', category: 'Reports', color: 'rgb(var(--color-accent))' },
  { key: 'report_data_destruction', label: 'Data Destruction Report Number', description: 'Certified data destruction reports', category: 'Reports', color: '#dc2626' },
  { key: 'report_prevention', label: 'Prevention Report Number', description: 'Preventative recommendations reports', category: 'Reports', color: '#f59e0b' },
];

export const SystemNumbers: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<NumberSequence | null>(null);
  const [formData, setFormData] = useState({ prefix: '', padding: 4, reset_annually: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

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

  const updateMutation = useMutation({
    mutationFn: async ({ scope, prefix, padding, reset_annually }: { scope: string; prefix: string; padding: number; reset_annually: boolean }) => {
      const { error } = await supabase
        .rpc('update_number_sequence', {
          p_scope: scope,
          p_prefix: prefix,
          p_padding: padding,
          p_reset: reset_annually,
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
      setFormData({ prefix: '', padding: 4, reset_annually: false });

      toast.success('Number sequence updated successfully');
    },
    onError: (error: Error) => {
      logger.error('Failed to update number sequence:', error);
      toast.error(`Failed to update: ${error.message || 'Unknown error occurred'}`);
    },
  });

  const handleEdit = (sequence: NumberSequence) => {
    setEditingSequence(sequence);
    setFormData({ prefix: sequence.prefix, padding: sequence.padding, reset_annually: sequence.reset_annually });
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
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSequence(null);
    setFormData({ prefix: '', padding: 4, reset_annually: false });
  };

  const formatNumber = (seq: NumberSequence) => {
    const nextNum = seq.current_value + 1;
    return seq.prefix + '-' + nextNum.toString().padStart(seq.padding, '0');
  };

  const formatCurrentNumber = (seq: NumberSequence) => {
    if (seq.current_value === 0) return 'Not assigned';
    return seq.prefix + '-' + seq.current_value.toString().padStart(seq.padding, '0');
  };

  const categories = ['All', ...Array.from(new Set(SEQUENCE_CONFIG.map(s => s.category)))];

  const filteredSequenceTypes = SEQUENCE_CONFIG.filter(type => {
    const matchesSearch = type.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          type.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || type.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-all hover:gap-3 font-medium"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg bg-accent"
            style={{
              boxShadow: '0 10px 40px -10px rgb(var(--color-accent) / 0.5)'
            }}
          >
            <Hash className="w-8 h-8 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">System & Numbers</h1>
            <p className="text-slate-600 text-base">Configure automatic numbering sequences for all entities</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search sequences..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2.5 rounded-xl font-medium transition-all ${
                    selectedCategory === category
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-white text-slate-700 border border-slate-300 hover:border-primary/60 hover:bg-info-muted'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Number Sequences ({filteredSequenceTypes.length})
              </h2>
              <p className="text-slate-500">Configure prefixes and current numbers for automatic numbering</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500 bg-info-muted border border-info/20 rounded-lg px-4 py-2.5">
                <Hash className="w-4 h-4 text-info shrink-0" />
                <span>
                  <strong className="font-medium text-slate-700">Inventory item numbers</strong> are now configured
                  per device type.{' '}
                  <Link
                    to="/settings/inventory"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    Manage Inventory Number Sequences
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSequenceTypes.map((type) => {
                  const sequence = sequences.find(s => s.scope === type.key);
                  const displaySeq: NumberSequence = sequence || {
                    id: '',
                    scope: type.key as SequenceScope,
                    prefix: type.key.replace(/_/g, '').toUpperCase().slice(0, 4),
                    padding: 4,
                    current_value: 0,
                    reset_annually: false,
                    created_at: '',
                  };

                  return (
                    <div
                      key={type.key}
                      className="group border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all hover:border-slate-300 bg-gradient-to-r from-white to-slate-50/20"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-base font-bold text-slate-900">{type.label}</h3>
                            <Badge
                              variant="custom"
                              color={type.color}
                              size="sm"
                              className="text-xs"
                            >
                              {type.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">{type.description}</p>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Current Number
                          </div>
                          <Badge
                            variant="custom"
                            color={type.color}
                            size="md"
                            className="font-mono"
                          >
                            {formatCurrentNumber(displaySeq)}
                          </Badge>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Next Number
                          </div>
                          <Badge
                            variant="success"
                            size="md"
                            className="font-mono"
                          >
                            {formatNumber(displaySeq)}
                          </Badge>
                        </div>

                        <button
                          onClick={() => handleEdit(displaySeq)}
                          className="p-2.5 hover:bg-info-muted rounded-lg transition-all hover:scale-110"
                          style={{ color: type.color }}
                          title="Edit Sequence"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`Edit ${editingSequence ? SEQUENCE_CONFIG.find(t => t.key === editingSequence.scope)?.label : ''}`}
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
