import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { LocaleFormModal } from './LocaleFormModal';
import type { AccountingLocale, AccountingLocaleFormData } from '../../types/accountingLocale';
import { Trash2, Star, ArrowLeft, Plus, Pencil } from 'lucide-react';

export const AccountingLocales: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { config, refreshConfig } = useTenantConfig();
  const { profile } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocale, setEditingLocale] = useState<AccountingLocale | null>(null);

  const { data: locales = [], isLoading } = useQuery({
    queryKey: ['accounting_locales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_locales')
        .select('*')
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as AccountingLocale[];
    },
  });

  const defaultLocale = locales.find(locale => locale.is_default);

  const createMutation = useMutation({
    mutationFn: async (formData: AccountingLocaleFormData) => {
      if (formData.is_default) {
        await supabase
          .from('accounting_locales')
          .update({ is_default: false })
          .eq('tenant_id', profile!.tenant_id!)
          .is('deleted_at', null);
      }
      const { error } = await supabase
        .from('accounting_locales')
        .insert({
          tenant_id: profile!.tenant_id!,
          ...formData,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting_locales'] });
      refreshConfig();
      setIsModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: AccountingLocaleFormData }) => {
      if (formData.is_default) {
        await supabase
          .from('accounting_locales')
          .update({ is_default: false })
          .eq('tenant_id', profile!.tenant_id!)
          .neq('id', id)
          .is('deleted_at', null);
      }
      const { error } = await supabase
        .from('accounting_locales')
        .update(formData)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting_locales'] });
      refreshConfig();
      setEditingLocale(null);
      setIsModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accounting_locales')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting_locales'] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('accounting_locales')
        .update({ is_default: false })
        .eq('tenant_id', profile!.tenant_id!)
        .is('deleted_at', null);
      const { error } = await supabase
        .from('accounting_locales')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting_locales'] });
      refreshConfig();
    },
  });

  const handleSubmit = (formData: AccountingLocaleFormData) => {
    if (editingLocale) {
      updateMutation.mutate({ id: editingLocale.id, formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openCreate = () => {
    setEditingLocale(null);
    setIsModalOpen(true);
  };

  const openEdit = (locale: AccountingLocale) => {
    setEditingLocale(locale);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Accounting Locales</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tenant country: {config.countryName} ({config.currency.code}, {config.tax.label})
          </p>
          {defaultLocale && (
            <div className="mt-2">
              <Badge variant="success" className="text-sm">
                Default: {defaultLocale.name} ({defaultLocale.currency_symbol || defaultLocale.currency_code})
              </Badge>
            </div>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Locale
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <Skeleton className="h-11 w-full" />
          <div className="divide-y divide-slate-200">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Locale Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Currency</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Decimals</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date Format</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {locales.map((locale) => (
                  <tr key={locale.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{locale.name}</span>
                        {locale.is_default && <Star className="w-3 h-3 text-cat-4 fill-cat-4" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{locale.locale_code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{locale.currency_code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{locale.currency_symbol || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{locale.decimal_places ?? '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 capitalize">{locale.currency_position || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{locale.date_format || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={locale.is_default ? 'success' : 'secondary'}>
                        {locale.is_default ? 'Default' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(locale)}
                          className="p-2 text-slate-400 hover:text-primary hover:bg-info-muted rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => !locale.is_default && setDefaultMutation.mutate(locale.id)}
                          className={`p-2 rounded-lg transition-colors ${locale.is_default ? 'text-cat-4 bg-cat-4/10 cursor-default' : 'text-slate-400 hover:text-cat-4 hover:bg-cat-4/10'}`}
                          disabled={locale.is_default ?? false}
                          title={locale.is_default ? 'Default locale' : 'Set as default'}
                        >
                          <Star className={`w-4 h-4 ${locale.is_default ? 'fill-cat-4' : ''}`} />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(locale.id)}
                          className="p-2 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                          disabled={locale.is_default ?? false}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {locales.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500">No accounting locales configured. Currency and tax settings come from your tenant country.</p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Default Locale
              </Button>
            </div>
          )}
        </div>
      )}

      <LocaleFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLocale(null); }}
        onSubmit={handleSubmit}
        editingLocale={editingLocale}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
};
