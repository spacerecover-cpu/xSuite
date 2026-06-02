import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, Truck, UserCheck, Users, Mail, Phone, MapPin, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import SupplierFormModal from '../../components/suppliers/SupplierFormModal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { formatDate } from '../../lib/format';
import { logger } from '../../lib/logger';

interface Supplier {
  id: string;
  supplier_number: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  is_active: boolean | null;
  is_approved: boolean;
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
  const toast = useToast();
  const { formatCurrency } = useCurrency();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const SUPPLIERS_PER_PAGE = 10;

  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    approved: 0,
    totalSpend: 0,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, approvalFilter, categoryFilter]);

  useEffect(() => {
    loadSuppliers();
    loadCategories();
  }, []);

  // Command-palette deep-link: /suppliers?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('suppliers')
        .select(`
          *,
          category:master_supplier_categories(name),
          payment_terms:master_supplier_payment_terms(name, days)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // DB rows don't have UI-only `is_approved`, `country`, `city` strings.
      // Default them so the local Supplier shape is satisfied.
      const rows: Supplier[] = (data ?? []).map((row) => ({
        id: row.id,
        supplier_number: row.supplier_number,
        name: row.name,
        email: row.email,
        phone: row.phone,
        country: null,
        city: null,
        is_active: row.is_active,
        is_approved: false,
        created_at: row.created_at,
        category_id: row.category_id,
        category: row.category,
        payment_terms: row.payment_terms,
      }));

      setSuppliers(rows);
      calculateStats(rows);
    } catch (error: unknown) {
      logger.error('Error loading suppliers:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('master_supplier_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCategories(data ?? []);
    } catch (error) {
      logger.error('Error loading categories:', error);
    }
  };

  const calculateStats = async (supplierData: Supplier[]) => {
    const activeSuppliers = supplierData.filter(s => s.is_active);
    const approvedSuppliers = supplierData.filter(s => s.is_approved);

    try {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('total_amount');

      const totalSpend = poData?.reduce((sum, po) => sum + (po.total_amount || 0), 0) || 0;

      setStats({
        total: supplierData.length,
        active: activeSuppliers.length,
        approved: approvedSuppliers.length,
        totalSpend,
      });
    } catch (error) {
      logger.error('Error calculating stats:', error);
      setStats({
        total: supplierData.length,
        active: activeSuppliers.length,
        approved: approvedSuppliers.length,
        totalSpend: 0,
      });
    }
  };

  const handleModalClose = () => {
    setShowAddModal(false);
  };

  const handleModalSuccess = () => {
    loadSuppliers();
  };

  const handleOpenModal = () => {
    setShowAddModal(true);
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesSearch =
      supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplier_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && supplier.is_active) ||
      (statusFilter === 'inactive' && !supplier.is_active);

    const matchesApproval =
      approvalFilter === 'all' ||
      (approvalFilter === 'approved' && supplier.is_approved) ||
      (approvalFilter === 'pending' && !supplier.is_approved);

    const matchesCategory =
      categoryFilter === 'all' || supplier.category_id?.toString() === categoryFilter;

    return matchesSearch && matchesStatus && matchesApproval && matchesCategory;
  });

  const totalPages = Math.ceil(filteredSuppliers.length / SUPPLIERS_PER_PAGE);
  const startIndex = (currentPage - 1) * SUPPLIERS_PER_PAGE;
  const endIndex = Math.min(startIndex + SUPPLIERS_PER_PAGE, filteredSuppliers.length);
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, endIndex);

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: '#0ea5e9',
              boxShadow: '0 10px 40px -10px #0ea5e980',
            }}
          >
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Suppliers</h1>
            <p className="text-slate-600 text-base">
              Manage your supplier relationships and purchase orders
            </p>
          </div>
        </div>
        <Button onClick={handleOpenModal} style={{ backgroundColor: '#0ea5e9' }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-info-muted to-info-muted rounded-xl p-4 border border-info/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-info uppercase tracking-wide">Total Suppliers</p>
              <p className="text-2xl font-bold text-info mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-success-muted to-success-muted rounded-xl p-4 border border-success/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-success uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-success mt-1">{stats.active}</p>
            </div>
            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-accent/10 to-accent/20 rounded-xl p-4 border border-accent/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-accent-foreground uppercase tracking-wide">Approved</p>
              <p className="text-2xl font-bold text-accent-foreground mt-1">{stats.approved}</p>
            </div>
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-warning-muted to-warning-muted rounded-xl p-4 border border-warning/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-warning uppercase tracking-wide">Total Spend (YTD)</p>
              <p className="text-2xl font-bold text-warning mt-1">{formatCurrency(stats.totalSpend)}</p>
            </div>
            <div className="w-10 h-10 bg-warning rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

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
              {(statusFilter !== 'all' || approvalFilter !== 'all' || categoryFilter !== 'all') && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setApprovalFilter('all');
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
              {(approvalFilter !== 'all' || categoryFilter !== 'all') && (
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
                // Only filters that map to actual columns:
                //   search → name/email/supplier_number ilike
                //   statusFilter (active/inactive) → is_active
                //   categoryFilter → category_id
                // The approvalFilter is UI-only (no DB column yet); ignore.
                let q = supabase
                  .from('suppliers')
                  .select('supplier_number, name, contact_person, email, phone, tax_number, is_active, master_supplier_categories:category_id(name)')
                  .is('deleted_at', null);
                if (searchTerm) {
                  q = q.or(`name.ilike.%${searchTerm}%,supplier_number.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
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
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Approval Status
                </label>
                <select
                  value={approvalFilter}
                  onChange={(e) => setApprovalFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Approval Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading suppliers...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={Truck}
            title="No suppliers found"
            description={
              searchTerm || statusFilter !== 'all' || approvalFilter !== 'all' || categoryFilter !== 'all'
                ? 'No suppliers found matching your criteria.'
                : 'No suppliers yet. Add your first supplier to get started.'
            }
            action={{ label: 'Add Supplier', onClick: handleOpenModal }}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
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
                  {paginatedSuppliers.map((supplier) => (
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
                          <Badge variant="custom" color="rgb(var(--color-accent))" size="sm">
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
                          {supplier.is_approved && (
                            <Badge variant="success" size="sm">
                              Approved
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
          </div>

          {totalPages > 1 && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mt-4 p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Showing <span className="font-medium text-slate-900">{startIndex + 1}</span> to{' '}
                  <span className="font-medium text-slate-900">{endIndex}</span> of{' '}
                  <span className="font-medium text-slate-900">{filteredSuppliers.length}</span> suppliers
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm text-slate-600">
                    Page <span className="font-medium text-slate-900">{currentPage}</span> of{' '}
                    <span className="font-medium text-slate-900">{totalPages}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <SupplierFormModal
          isOpen={showAddModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          supplier={null}
        />
      )}
    </div>
  );
}
