import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import { Plus, Edit2, Trash2, ChevronLeft, Sparkles, Search, X, Star, ToggleLeft, ToggleRight } from 'lucide-react';
import { SETTINGS_CATEGORIES, MasterDataTable, TABLE_LABELS, isTenantScopedTable, hasDeletedAt } from '../../config/settingsCategories';
import { settingsKeys } from '../../lib/queryKeys';
import {
  checkIfSeeded,
  seedDeviceMediaData,
  seedClientFinancialData,
  seedCaseServiceData,
} from '../../lib/seedService';
import { SeedingResultsDisplay } from '../../components/settings/SeedingResultsDisplay';
import { logger } from '../../lib/logger';

interface MasterDataItem {
  id: number;
  name?: string;
  value?: string;
  color?: string;
  is_active?: boolean;
  created_at: string;
}

interface TableSeedResult {
  tableName: string;
  tableLabel: string;
  status: 'seeded' | 'skipped' | 'error';
  beforeCount: number;
  afterCount: number;
  itemsInserted: number;
}

export const CategoryDetail: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const category = SETTINGS_CATEGORIES.find((c) => c.id === categoryId);
  const [activeTable, setActiveTable] = useState<MasterDataTable>(
    category?.tables[0] || 'catalog_device_types'
  );

  const handleTableChange = (table: MasterDataTable) => {
    setActiveTable(table);
    setSearchQuery('');
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [formValue, setFormValue] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedDetails, setSeedDetails] = useState<TableSeedResult[] | null>(null);
  const [seedMessage, setSeedMessage] = useState('');
  const [showSeedSuccess, setShowSeedSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!category) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Category not found</p>
        <Button onClick={() => navigate('/settings')} className="mt-4">
          Back to Settings
        </Button>
      </div>
    );
  }

  if (category.tables.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-all hover:gap-3 font-medium"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="mb-8 flex items-start gap-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: category.backgroundColor,
              boxShadow: `0 10px 40px -10px ${category.backgroundColor}80`
            }}
          >
            <category.icon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{category.title}</h1>
            <p className="text-slate-600 text-lg">{category.description}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div
            className="w-24 h-24 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              backgroundColor: category.backgroundColor + '20',
              border: `2px solid ${category.backgroundColor}40`
            }}
          >
            <category.icon className="w-12 h-12" style={{ color: category.backgroundColor }} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-3">Coming Soon</h3>
          <p className="text-slate-600 text-lg max-w-md mx-auto">
            {category.title} configuration will be available in a future update.
          </p>
        </div>
      </div>
    );
  }

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: settingsKeys.masterData(activeTable),
    queryFn: async () => {
      let query = supabase.from(activeTable).select('*');
      if (hasDeletedAt(activeTable)) {
        query = query.is('deleted_at', null);
      }

      if (isTenantScopedTable(activeTable)) {
        query = query.order('name', { ascending: true });
      } else {
        query = query.order('sort_order', { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MasterDataItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: companySettings } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('location')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: activeTable === 'geo_countries',
  });

  const defaultCountryId: string | null = (() => {
    const loc = companySettings?.location;
    if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
      const dc = (loc as Record<string, unknown>).default_country_id;
      if (typeof dc === 'string') return dc;
    }
    return null;
  })();

  const items = allItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const searchLower = searchQuery.toLowerCase();
    const itemName = (item.name || '').toLowerCase();
    return itemName.includes(searchLower);
  });

  const { data: isSeeded = false } = useQuery({
    queryKey: settingsKeys.seedStatus(category?.id || ''),
    queryFn: async () => {
      if (!category?.id) return true;
      const categoriesWithSeeding = ['device-media', 'client-financial', 'case-service'];
      if (!categoriesWithSeeding.includes(category.id)) return true;
      return await checkIfSeeded(category.id);
    },
    enabled: !!category,
    staleTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (value: string) => {
      if (isTenantScopedTable(activeTable)) {
        const { error } = await supabase
          .from(activeTable)
          .insert({ name: value, tenant_id: profile?.tenant_id } as any);
        if (error) throw error;
      } else {
        const { data: maxOrderData } = await supabase
          .from(activeTable)
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle();

        const maxOrderRow = maxOrderData as { sort_order: number | null } | null;
        const nextSortOrder = (maxOrderRow?.sort_order ?? 0) + 1;

        const { error } = await supabase
          .from(activeTable)
          .insert({ name: value, sort_order: nextSortOrder } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.masterData(activeTable) });
      queryClient.invalidateQueries({ queryKey: ['settings', 'category-count'] });
      setIsModalOpen(false);
      setFormValue('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: string }) => {
      const { error } = await supabase
        .from(activeTable)
        .update({ name: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.masterData(activeTable) });
      setIsModalOpen(false);
      setEditingItem(null);
      setFormValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      let error;
      if (hasDeletedAt(activeTable)) {
        ({ error } = await supabase
          .from(activeTable)
          .update({ deleted_at: new Date().toISOString() } as any)
          .eq('id', id));
      } else {
        ({ error } = await supabase
          .from(activeTable)
          .delete()
          .eq('id', id));
      }
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.masterData(activeTable) });
      queryClient.invalidateQueries({ queryKey: ['settings', 'category-count'] });
    },
  });

  const setDefaultCountryMutation = useMutation({
    mutationFn: async (countryId: string) => {
      const currentLocation = (companySettings?.location && typeof companySettings.location === 'object' && !Array.isArray(companySettings.location))
        ? (companySettings.location as Record<string, unknown>)
        : {};
      const { error } = await supabase
        .from('company_settings')
        .update({
          location: {
            ...currentLocation,
            default_country_id: countryId,
          },
        })
        .not('id', 'is', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { error } = await supabase
        .from(activeTable)
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.masterData(activeTable) });
      queryClient.invalidateQueries({ queryKey: ['payment_methods_active'] });
    },
  });

  const handleToggleActive = (item: MasterDataItem) => {
    toggleActiveMutation.mutate({ id: item.id, isActive: !item.is_active });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValue.trim()) return;

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, value: formValue });
    } else {
      createMutation.mutate(formValue);
    }
  };

  const handleEdit = (item: MasterDataItem) => {
    setEditingItem(item);
    setFormValue(item.name || '');
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSetDefaultCountry = (countryId: string) => {
    const country = allItems.find((item) => item.id.toString() === countryId);
    if (confirm(`Set "${country?.name}" as the default country?`)) {
      setDefaultCountryMutation.mutate(countryId);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormValue('');
  };

  const handleSeedData = async () => {
    if (!category) return;

    const confirmMessages: Record<string, string> = {
      'device-media': 'This will populate all Device & Media tables with default data. This action cannot be undone. Continue?',
      'client-financial': 'This will populate all Client & Financial tables with default data. This action cannot be undone. Continue?',
      'case-service': 'This will populate all Case & Service tables with default data. This action cannot be undone. Continue?',
    };

    const confirmMessage = confirmMessages[category.id] || 'This will populate tables with default data. This action cannot be undone. Continue?';

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsSeeding(true);
    setSeedMessage('');
    setSeedDetails(null);

    try {
      let result;

      switch (category.id) {
        case 'device-media':
          result = await seedDeviceMediaData();
          break;
        case 'client-financial':
          result = await seedClientFinancialData();
          break;
        case 'case-service':
          result = await seedCaseServiceData();
          break;
        default:
          result = { success: false, message: 'Unknown category' };
      }

      if (result.success) {
        setSeedMessage(result.message);
        setSeedDetails(result.details || null);
        setShowSeedSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['settings', 'master-data'] });
        queryClient.invalidateQueries({ queryKey: ['settings', 'seed-status'] });
        queryClient.invalidateQueries({ queryKey: ['settings', 'category-count'] });
      } else {
        alert(result.error || result.message);
      }
    } catch (error) {
      logger.error('Seeding error:', error);
      alert('An unexpected error occurred during seeding');
    } finally {
      setIsSeeding(false);
    }
  };

  const hasEnabledToggle = activeTable === 'master_payment_methods';

  const columns = [
    {
      key: 'order',
      header: 'Order',
      width: '100px',
      render: (row: MasterDataItem) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-md font-semibold">
            {items.indexOf(row) + 1}
          </span>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row: MasterDataItem) => (
        <div className="flex items-center gap-3">
          {row.color && (
            <div
              className="w-5 h-5 rounded-md shadow-sm border border-slate-200"
              style={{ backgroundColor: row.color }}
            />
          )}
          <span className="font-medium text-slate-900">{row.name}</span>
        </div>
      ),
    },
    ...(hasEnabledToggle
      ? [
          {
            key: 'enabled',
            header: 'Enabled',
            width: '120px',
            render: (row: MasterDataItem) => (
              <button
                onClick={() => handleToggleActive(row)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                  row.is_active !== false
                    ? 'bg-success-muted text-success hover:bg-success-muted/80'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={row.is_active !== false ? 'Click to disable' : 'Click to enable'}
              >
                {row.is_active !== false ? (
                  <ToggleRight className="w-5 h-5" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
                <span className="text-xs font-medium">
                  {row.is_active !== false ? 'On' : 'Off'}
                </span>
              </button>
            ),
          },
        ]
      : []),
    {
      key: 'actions',
      header: 'Actions',
      width: activeTable === 'geo_countries' ? '160px' : '120px',
      render: (row: MasterDataItem) => {
        const isDefaultCountry = activeTable === 'geo_countries' && defaultCountryId === row.id.toString();
        return (
          <div className="flex gap-1.5">
            {activeTable === 'geo_countries' && (
              <button
                onClick={() => handleSetDefaultCountry(row.id.toString())}
                className={`p-2 rounded-lg transition-all hover:scale-110 ${
                  isDefaultCountry
                    ? 'text-cat-4 bg-cat-4/10'
                    : 'text-slate-400 hover:text-cat-4 hover:bg-cat-4/10'
                }`}
                title={isDefaultCountry ? 'Default country' : 'Set as default country'}
              >
                <Star className={`w-4 h-4 ${isDefaultCountry ? 'fill-cat-4' : ''}`} />
              </button>
            )}
            <button
              onClick={() => handleEdit(row)}
              className="p-2 hover:bg-info-muted rounded-lg text-primary transition-all hover:scale-110"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(row.id)}
              className="p-2 hover:bg-danger-muted rounded-lg text-danger transition-all hover:scale-110"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-all hover:gap-3 font-medium"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
              style={{
                backgroundColor: category.backgroundColor,
                boxShadow: `0 8px 24px -8px ${category.backgroundColor}80`
              }}
            >
              <category.icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">{category.title}</h1>
              <p className="text-slate-600 text-sm md:text-base">{category.description}</p>
            </div>
          </div>

          {['device-media', 'client-financial', 'case-service'].includes(category.id) && !isSeeded && (
            <div className="relative group">
              <Button
                onClick={handleSeedData}
                disabled={isSeeding}
                variant="primary"
                className="shadow-md self-start md:self-auto"
              >
                {isSeeding ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Seeding...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    One-Time Seed
                  </>
                )}
              </Button>
              {!isSeeding && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 shadow-lg z-10">
                  <p className="font-semibold mb-1">Smart Seeding</p>
                  <p>Only empty tables will be seeded. Tables with existing data will be skipped automatically.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {showSeedSuccess && seedMessage && seedDetails && (
          <div className="mb-6">
            <SeedingResultsDisplay details={seedDetails} message={seedMessage} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {category.tables.length > 1 && (
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-2 md:p-3 overflow-x-auto">
            <div className="flex gap-2 min-w-max md:min-w-0 md:flex-wrap">
              {category.tables.map((table) => (
                <button
                  key={table}
                  onClick={() => handleTableChange(table)}
                  className={`px-3 md:px-4 py-2 md:py-2.5 font-semibold text-xs md:text-sm rounded-lg transition-all whitespace-nowrap ${
                    activeTable === table
                      ? 'text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  style={{
                    backgroundColor: activeTable === table ? category.backgroundColor : 'transparent',
                  }}
                >
                  {TABLE_LABELS[table]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 md:p-6 overflow-x-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-bold text-slate-900">
                {TABLE_LABELS[activeTable]} ({searchQuery ? `${items.length} of ${allItems.length}` : items.length})
              </h2>
              <p className="text-slate-500 text-xs md:text-sm mt-1">Manage your {TABLE_LABELS[activeTable].toLowerCase()}</p>
              {activeTable === 'geo_countries' && defaultCountryId && (
                <div className="flex items-center gap-2 mt-2">
                  <Star className="w-4 h-4 text-cat-4 fill-cat-4" />
                  <span className="text-sm text-slate-600">
                    Default: <span className="font-semibold text-slate-900">
                      {allItems.find((item) => item.id.toString() === defaultCountryId)?.name || 'None'}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 text-sm"
                  onFocus={(e) => e.target.style.borderColor = category.backgroundColor}
                  onBlur={(e) => e.target.style.borderColor = ''}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button
                onClick={() => setIsModalOpen(true)}
                className="text-xs md:text-sm whitespace-nowrap"
                style={{ backgroundColor: category.backgroundColor }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
              <p className="text-slate-500 mt-4">Loading...</p>
            </div>
          ) : items.length === 0 && searchQuery ? (
            <div className="text-center py-16 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No results found for "{searchQuery}"</p>
              <p className="text-slate-500 text-sm mt-1">Try adjusting your search terms</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle px-4 md:px-0">
                <Table data={items} columns={columns} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? `Edit ${TABLE_LABELS[activeTable]}` : `Add New ${TABLE_LABELS[activeTable]}`}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Name"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            required
            autoFocus
            placeholder="Enter name..."
          />

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              style={{ backgroundColor: category.backgroundColor }}
              disabled={!formValue.trim()}
            >
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
