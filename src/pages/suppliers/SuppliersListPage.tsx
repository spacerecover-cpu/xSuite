import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search, Filter, Truck, Mail, Phone, MapPin } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { KpiRow } from '../../components/templates/KpiRow';
import SupplierFormModal from '../../components/suppliers/SupplierFormModal';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { useCurrency } from '../../hooks/useCurrency';
import { useListPageSize } from '../../hooks/useListPageSize';
import { formatDate } from '../../lib/format';
import { baseAmount } from '../../lib/financialMath';

interface Supplier {
  id: string;
  supplier_number: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  is_active: boolean | null;
  created_at: string;
  category_id: string | null;
  category: { name: string } | null;
  payment_terms: { name: string; days: number | null } | null;
}

interface Category {
  id: string;
  name: string;
}

export default function SuppliersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = useListPageSize();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, categoryFilter, pageSize]);

  // Command-palette deep-link: /suppliers?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: suppliersPage, isLoading: loading } = useQuery({
    queryKey: ['suppliers', debouncedSearch, statusFilter, categoryFilter, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select(`
          *,
          category:master_supplier_categories(name),
          payment_terms:master_supplier_payment_terms(name, days)
        `, { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const s = sanitizeFilterValue(debouncedSearch);
        query = query.or(`name.ilike.%${s}%,supplier_number.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      if (statusFilter === 'active') query = query.eq('is_active', true);
      else if (statusFilter === 'inactive') query = query.eq('is_active', false);
      if (categoryFilter !== 'all') query = query.eq('category_id', categoryFilter);

      const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;

      const rows: Supplier[] = (data ?? []).map((row) => ({
        id: row.id,
        supplier_number: row.supplier_number,
        name: row.name,
        email: row.email,
        phone: row.phone,
        country: null,
        city: null,
        is_active: row.is_active,
        created_at: row.created_at,
        category_id: row.category_id,
        category: row.category,
        payment_terms: row.payment_terms,
      }));
      return { rows, total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  const suppliers = suppliersPage?.rows ?? [];
  const totalSuppliers = suppliersPage?.total ?? 0;

  const { data: categories = [] } = useQuery({
    queryKey: ['supplier_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_supplier_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['supplier_stats'],
    queryFn: async () => {
      const base = () =>
        supabase.from('suppliers').select('*', { count: 'exact', head: true }).is('deleted_at', null);
      const [totalRes, activeRes, poRes] = await Promise.all([
        base(),
        base().eq('is_active', true),
        supabase.from('purchase_orders').select('total_amount, total_amount_base'),
      ]);
      const totalSpend = (poRes.data ?? []).reduce((sum, po) => sum + baseAmount(po, 'total_amount'), 0);
      return { total: totalRes.count ?? 0, active: activeRes.count ?? 0, totalSpend };
    },
  });

  const handleModalClose = () => {
    setShowAddModal(false);
  };

  const handleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_stats'] });
  };

  const handleOpenModal = () => {
    setShowAddModal(true);
  };

  const toolbar = (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'active'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Inactive
              </button>
              {(statusFilter !== 'all' || categoryFilter !== 'all') && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  Clear All
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Filter className="w-4 h-4" />
              More Filters
              {categoryFilter !== 'all' && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

            <ExportButton
              filename="suppliers"
              columns={[
                { key: 'supplier_number', label: 'Supplier #' },
                { key: 'name', label: 'Name' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'tax_number', label: 'Tax #' },
                {
                  key: 'is_active',
                  label: 'Active',
                  format: (v) => (v ? 'yes' : 'no'),
                },
                {
                  key: (r) => (r.master_supplier_categories as { name?: string } | null)?.name,
                  label: 'Category',
                },
              ]}
              getRows={async () => {
                // Filters map to real columns: search → name/email/supplier_number ilike;
                // statusFilter (active/inactive) → is_active; categoryFilter → category_id.
                let q = supabase
                  .from('suppliers')
                  .select('supplier_number, name, contact_person, email, phone, tax_number, is_active, master_supplier_categories:category_id(name)')
                  .is('deleted_at', null);
                if (searchTerm) {
                  const s = sanitizeFilterValue(searchTerm);
                  q = q.or(`name.ilike.%${s}%,supplier_number.ilike.%${s}%,email.ilike.%${s}%`);
                }
                if (statusFilter === 'active') q = q.eq('is_active', true);
                if (statusFilter === 'inactive') q = q.eq('is_active', false);
                if (categoryFilter !== 'all') q = q.eq('category_id', categoryFilter);
                const { data, error } = await q.order('name', { ascending: true });
                if (error) throw error;
                return data ?? [];
              }}
            />
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
  );

  const emptyState = (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <EmptyState
        icon={Truck}
        title="No suppliers found"
        description={
          searchTerm || statusFilter !== 'all' || categoryFilter !== 'all'
            ? 'No suppliers found matching your criteria.'
            : 'No suppliers yet. Add your first supplier to get started.'
        }
        action={{ label: 'Add Supplier', onClick: handleOpenModal }}
      />
    </div>
  );

  const table = (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Supplier Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Payment Terms
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {suppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      onClick={() => navigate(`/suppliers/${supplier.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-primary">
                          {supplier.supplier_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cat-5 to-cat-5/80 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                            {supplier.name?.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="font-medium text-slate-900">
                            {supplier.name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {supplier.email ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[200px]">{supplier.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {supplier.phone ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {supplier.phone}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(supplier.city || supplier.country) ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{[supplier.city, supplier.country].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {supplier.category ? (
                          <Badge variant="accent" size="sm">
                            {supplier.category.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {supplier.payment_terms ? (
                          <div className="text-sm text-slate-700">
                            {supplier.payment_terms.name}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {supplier.is_active ? (
                            <Badge variant="success" size="sm">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="default" size="sm">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {formatDate(supplier.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
  );

  return (
    <ListPageTemplate
      title="Suppliers"
      headerActions={
        <Button onClick={handleOpenModal} variant="primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      }
      kpis={
        <KpiRow
          cols="grid-cols-1 md:grid-cols-3"
          stats={[
            { label: 'Total Suppliers', value: stats?.total ?? 0, tone: 'info' },
            { label: 'Active', value: stats?.active ?? 0, tone: 'success' },
            { label: 'Total Spend (YTD)', value: formatCurrency(stats?.totalSpend ?? 0), tone: 'warning' },
          ]}
        />
      }
      toolbar={toolbar}
      table={table}
      pager={{ page, pageSize, total: totalSuppliers, onPageChange: setPage, itemNoun: 'suppliers' }}
      loading={loading}
      isEmpty={suppliers.length === 0}
      empty={emptyState}
    >
      {showAddModal && (
        <SupplierFormModal
          isOpen={showAddModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          supplier={null}
        />
      )}
    </ListPageTemplate>
  );
}
