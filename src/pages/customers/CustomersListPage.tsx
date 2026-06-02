import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { createCustomer } from '../../lib/customerService';
import { createCompany } from '../../lib/companyService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { CustomerAvatar } from '../../components/ui/CustomerAvatar';
import { Plus, Search, Filter, Mail, Phone, Building2, MapPin, Users, UserCheck, Clock, ChevronLeft, ChevronRight, Archive, Download } from 'lucide-react';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Customer {
  id: string;
  customer_number: string | null;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  phone: string | null;
  customer_group_id: string | null;
  country_id: string | null;
  city_id: string | null;
  address: string | null;
  portal_enabled: boolean | null;
  profile_photo_url: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  customer_groups: { id: string; name: string } | null;
  geo_countries: { id: string; name: string } | null;
  geo_cities: { id: string; name: string } | null;
  customer_company_relationships?: Array<{
    companies: {
      id: string;
      company_name: string | null;
      company_number: string | null;
    } | null;
  }>;
}

interface CustomerGroup {
  id: string;
  name: string;
}

interface Company {
  id: string;
  company_number: string;
  company_name: string;
}

interface Country {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
  is_active: boolean;
}

interface City {
  id: string;
  name: string;
  country_id: string;
  is_active: boolean;
}

export const CustomersListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterPortal, setFilterPortal] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const CUSTOMERS_PER_PAGE = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterGroup, filterPortal]);

  // Command-palette deep-link: /customers?new=1 opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile_number: '',
    phone_number: '',
    customer_group_id: '',
    country_id: '',
    city_id: '',
    address: '',
    portal_enabled: true,
    notes: '',
    company_id: '',
  });

  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    customer_name: '',
    email: '',
    mobile_number: '',
    phone_number: '',
    customer_group_id: '',
    country_id: '',
    city_id: '',
    address_line1: '',
    portal_enabled: false,
    notes: '',
  });
  const [newCompanyData, setNewCompanyData] = useState({
    company_name: '',
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers_enhanced'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers_enhanced')
        .select(`
          *,
          customer_groups (id, name),
          geo_countries (id, name),
          geo_cities (id, name),
          customer_company_relationships (
            companies (id, company_name, company_number)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const { data: customerGroups = [] } = useQuery({
    queryKey: ['customer_groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_groups')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as CustomerGroup[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_number, company_name')
        .order('company_name');

      if (error) throw error;
      return data as Company[];
    },
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_countries')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Country[];
    },
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['cities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_cities')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as City[];
    },
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
      return data as { location: { default_country_id?: string } | null } | null;
    },
  });

  const filteredCities = cities.filter(
    (city) => !formData.country_id || city.country_id === formData.country_id
  );

  const createMutation = useMutation({
    mutationFn: async (customer: typeof formData) =>
      createCustomer({
        customer_name: customer.name,
        email: customer.email || null,
        mobile_number: customer.mobile_number || null,
        phone: customer.phone_number || null,
        customer_group_id: customer.customer_group_id || null,
        country_id: customer.country_id || null,
        city_id: customer.city_id || null,
        address: customer.address || null,
        portal_enabled: customer.portal_enabled,
        notes: customer.notes || null,
        created_by: profile?.id,
        company_id: customer.company_id || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (data: typeof editFormData) => {
      if (!editingCustomer) throw new Error('No customer selected');

      const updatePayload = {
        customer_name: data.customer_name,
        email: data.email || null,
        mobile_number: data.mobile_number || null,
        phone: data.phone_number || null,
        customer_group_id: data.customer_group_id || null,
        country_id: data.country_id || null,
        city_id: data.city_id || null,
        address: data.address_line1 || null,
        portal_enabled: data.portal_enabled,
        notes: data.notes || null,
      } as Database['public']['Tables']['customers_enhanced']['Update'];

      const { data: updatedCustomer, error } = await supabase
        .from('customers_enhanced')
        .update(updatePayload)
        .eq('id', editingCustomer.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return updatedCustomer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      setIsEditModalOpen(false);
      setEditingCustomer(null);
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (companyData: typeof newCompanyData) =>
      createCompany({
        name: companyData.company_name,
        company_name: companyData.company_name,
        created_by: profile?.id,
      }),
    onSuccess: async (newCompany) => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.refetchQueries({ queryKey: ['companies'] });
      setFormData({ ...formData, company_id: newCompany.id });
      setIsAddCompanyModalOpen(false);
      setNewCompanyData({ company_name: '' });
    },
  });

  const resetForm = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData({
      name: '',
      email: '',
      mobile_number: '',
      phone_number: '',
      customer_group_id: '',
      country_id: defaultCountryId,
      city_id: '',
      address: '',
      portal_enabled: true,
      notes: '',
      company_id: '',
    });
  };

  const handleOpenModal = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData((prev) => ({ ...prev, country_id: defaultCountryId }));
    setIsModalOpen(true);
  };

  const handleAddNewCompany = () => {
    setIsAddCompanyModalOpen(true);
  };

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    createCompanyMutation.mutate(newCompanyData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCustomerMutation.mutate(editFormData);
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.mobile_number?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGroup =
      filterGroup === 'all' || customer.customer_group_id === filterGroup;

    const matchesPortal =
      filterPortal === 'all' ||
      (filterPortal === 'enabled' && customer.portal_enabled) ||
      (filterPortal === 'disabled' && !customer.portal_enabled);

    return matchesSearch && matchesGroup && matchesPortal;
  });

  const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);
  const startIndex = (currentPage - 1) * CUSTOMERS_PER_PAGE;
  const endIndex = Math.min(startIndex + CUSTOMERS_PER_PAGE, filteredCustomers.length);
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);
  const visibleIds = paginatedCustomers.map((c) => c.id);

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('customers_enhanced')
      .select('customer_number, customer_name, email, mobile_number, phone, address, portal_enabled, created_at, customer_groups:customer_group_id(name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected customers');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'customer_number', label: 'Customer #' },
        { key: 'customer_name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'mobile_number', label: 'Mobile' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        {
          key: (r) => (r.customer_groups as { name?: string } | null)?.name,
          label: 'Group',
        },
        {
          key: 'portal_enabled',
          label: 'Portal Enabled',
          format: (v) => (v ? 'yes' : 'no'),
        },
        {
          key: 'created_at',
          label: 'Created',
          format: (v) => (v ? new Date(v as string).toISOString().slice(0, 10) : ''),
        },
      ],
      'customers-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} customer${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive customers');
      return;
    }
    const n = selection.selectedCount;
    // Be explicit about the cascade reality — archiving a customer
    // doesn't archive their cases, but those cases will render with
    // a missing-customer placeholder until restored.
    if (!window.confirm(
      `Archive ${n} customer${n === 1 ? '' : 's'}?\n\n` +
      `Their cases and invoices will remain but will show "Unknown customer" until the customer is restored.`
    )) {
      return;
    }
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('customers_enhanced')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`Archived ${n} customer${n === 1 ? '' : 's'}`);
      selection.clear();
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive customers');
    } finally {
      setIsArchiving(false);
    }
  };

  const recentCustomers = customers.filter((c) => {
    const createdDate = new Date(c.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return createdDate >= thirtyDaysAgo;
  });

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-primary"
            style={{
              boxShadow: '0 10px 40px -10px rgb(var(--color-primary) / 0.5)',
            }}
          >
            <Users className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Customers</h1>
            <p className="text-slate-600 text-base">
              Manage individual customer records and relationships
            </p>
          </div>
        </div>
        <Button onClick={handleOpenModal}>
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-info-muted rounded-xl p-4 border border-info/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-info uppercase tracking-wide">Total Customers</p>
              <p className="text-2xl font-bold text-info mt-1">{customers.length}</p>
            </div>
            <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-info-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-success-muted rounded-xl p-4 border border-success/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-success uppercase tracking-wide">Portal Enabled</p>
              <p className="text-2xl font-bold text-success mt-1">{customers.filter((c) => c.portal_enabled).length}</p>
            </div>
            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-success-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-accent/10 rounded-xl p-4 border border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-accent-foreground uppercase tracking-wide">Recent (30d)</p>
              <p className="text-2xl font-bold text-accent-foreground mt-1">{recentCustomers.length}</p>
            </div>
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-success-muted rounded-xl p-4 border border-success/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-success uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-success mt-1">{customers.filter((c) => c.is_active).length}</p>
            </div>
            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-success-foreground" />
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
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterPortal(filterPortal === 'enabled' ? 'all' : 'enabled')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterPortal === 'enabled'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Portal Enabled
              </button>
              <button
                onClick={() => setFilterPortal(filterPortal === 'disabled' ? 'all' : 'disabled')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterPortal === 'disabled'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Portal Disabled
              </button>
              {(filterGroup !== 'all' || filterPortal !== 'all') && (
                <button
                  onClick={() => {
                    setFilterGroup('all');
                    setFilterPortal('all');
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
              {(filterGroup !== 'all' || filterPortal !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

            <ExportButton
              filename="customers"
              columns={[
                { key: 'customer_number', label: 'Customer #' },
                { key: 'customer_name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'mobile_number', label: 'Mobile' },
                { key: 'phone', label: 'Phone' },
                { key: 'address', label: 'Address' },
                {
                  key: (r) => (r.customer_groups as { name?: string } | null)?.name,
                  label: 'Group',
                },
                {
                  key: 'portal_enabled',
                  label: 'Portal Enabled',
                  format: (v) => (v ? 'yes' : 'no'),
                },
                {
                  key: 'created_at',
                  label: 'Created',
                  format: (v) => (v ? new Date(v as string).toISOString().slice(0, 10) : ''),
                },
              ]}
              getRows={async () => {
                let q = supabase
                  .from('customers_enhanced')
                  .select('customer_number, customer_name, email, mobile_number, phone, address, portal_enabled, created_at, customer_groups:customer_group_id(name)')
                  .is('deleted_at', null);
                if (searchTerm) {
                  q = q.or(`customer_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,customer_number.ilike.%${searchTerm}%`);
                }
                if (filterGroup !== 'all') q = q.eq('customer_group_id', filterGroup);
                if (filterPortal === 'enabled') q = q.eq('portal_enabled', true);
                if (filterPortal === 'disabled') q = q.eq('portal_enabled', false);
                const { data, error } = await q.order('created_at', { ascending: false });
                if (error) throw error;
                return data ?? [];
              }}
            />
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Customer Group
                </label>
                <select
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Groups</option>
                  {customerGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Portal Status
                </label>
                <select
                  value={filterPortal}
                  onChange={(e) => setFilterPortal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Statuses</option>
                  <option value="enabled">Portal Enabled</option>
                  <option value="disabled">Portal Disabled</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading customers...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">
            {searchTerm || filterGroup !== 'all' || filterPortal !== 'all'
              ? 'No customers found matching your criteria.'
              : 'No customers yet. Add your first customer to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selection.allSelected(visibleIds)}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              !selection.allSelected(visibleIds) && selection.someSelected(visibleIds);
                          }
                        }}
                        onChange={(e) => selection.setMany(visibleIds, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Customer Number
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
                      Group
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Portal Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                        selection.isSelected(customer.id) ? 'bg-info-muted/30' : ''
                      }`}
                    >
                      <td
                        className="px-4 py-4 w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selection.isSelected(customer.id)}
                          onChange={() => selection.toggle(customer.id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          aria-label={`Select customer ${customer.customer_name}`}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-primary">
                          {customer.customer_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <CustomerAvatar
                            firstName={customer.customer_name}
                            lastName=""
                            photoUrl={customer.profile_photo_url}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {customer.customer_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.email ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[200px]">{customer.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.mobile_number ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {customer.mobile_number}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(customer.geo_cities?.name || customer.geo_countries?.name) ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{[customer.geo_cities?.name, customer.geo_countries?.name].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.customer_groups ? (
                          <Badge variant="custom" color="rgb(var(--color-accent))" size="sm">
                            {customer.customer_groups.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.customer_company_relationships && customer.customer_company_relationships.length > 0 && customer.customer_company_relationships[0].companies ? (
                          <div className="flex items-center gap-1 text-sm text-slate-700">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[150px]">
                              {customer.customer_company_relationships[0].companies.company_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {customer.portal_enabled ? (
                          <Badge variant="success" size="sm">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            Disabled
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {formatDate(customer.created_at)}
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
                  <span className="font-medium text-slate-900">{filteredCustomers.length}</span> customers
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title="Add New Customer"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <PhoneInput
              label="Mobile Number"
              value={formData.mobile_number}
              onChange={(val) => setFormData({ ...formData, mobile_number: val })}
              countries={countries}
              selectedCountryId={formData.country_id}
            />
          </div>

          <PhoneInput
            label="Phone Number (Alternative)"
            value={formData.phone_number}
            onChange={(val) => setFormData({ ...formData, phone_number: val })}
            countries={countries}
            selectedCountryId={formData.country_id}
          />

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Customer Group"
              value={formData.customer_group_id}
              onChange={(value) => setFormData({ ...formData, customer_group_id: value })}
              options={customerGroups.map((g) => ({ id: g.id, name: g.name }))}
              placeholder="Select Group"
            />

            <SearchableSelect
              label="Company (Optional)"
              value={formData.company_id}
              onChange={(value) => setFormData({ ...formData, company_id: value })}
              options={companies.map((c) => ({ id: c.id, name: `${c.company_name} (${c.company_number})` }))}
              placeholder="No Company"
              onAddNew={handleAddNewCompany}
              addNewLabel="Add New Company"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Country"
              value={formData.country_id}
              onChange={(value) => {
                setFormData({ ...formData, country_id: value, city_id: '' });
              }}
              options={countries.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Select Country"
            />
            <SearchableSelect
              label="City"
              value={formData.city_id}
              onChange={(value) => setFormData({ ...formData, city_id: value })}
              options={filteredCities.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Select City"
              disabled={!formData.country_id}
            />
          </div>

          <Input
            label="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.portal_enabled}
                onChange={(e) =>
                  setFormData({ ...formData, portal_enabled: e.target.checked })
                }
                className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
              />
              <span className="text-sm font-medium text-slate-700">
                Enable Client Portal Access
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Internal Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              placeholder="Add any internal notes..."
            />
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              Create Customer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAddCompanyModalOpen}
        onClose={() => {
          setIsAddCompanyModalOpen(false);
          setNewCompanyData({ company_name: '' });
        }}
        title="Add New Company"
      >
        <form onSubmit={handleCreateCompany} className="space-y-4">
          <Input
            label="Company Name"
            value={newCompanyData.company_name}
            onChange={(e) => setNewCompanyData({ ...newCompanyData, company_name: e.target.value })}
            required
          />

          {createCompanyMutation.isError && (
            <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 text-sm text-danger">
              {createCompanyMutation.error instanceof Error
                ? createCompanyMutation.error.message
                : 'Failed to create company. Please try again.'}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsAddCompanyModalOpen(false);
                setNewCompanyData({ company_name: '' });
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createCompanyMutation.isPending}>
              {createCompanyMutation.isPending ? 'Creating...' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCustomer(null);
        }}
        title="Edit Customer"
      >
        <form onSubmit={handleSubmitEdit} className="space-y-4">
          <Input
            label="Customer Name"
            value={editFormData.customer_name}
            onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
            />
            <PhoneInput
              label="Mobile Number"
              value={editFormData.mobile_number}
              onChange={(val) => setEditFormData({ ...editFormData, mobile_number: val })}
              countries={countries}
              selectedCountryId={editFormData.country_id}
            />
          </div>

          <PhoneInput
            label="Phone Number (Alternative)"
            value={editFormData.phone_number}
            onChange={(val) => setEditFormData({ ...editFormData, phone_number: val })}
            countries={countries}
            selectedCountryId={editFormData.country_id}
          />

          <SearchableSelect
            label="Customer Group"
            value={editFormData.customer_group_id}
            onChange={(value) => setEditFormData({ ...editFormData, customer_group_id: value })}
            options={customerGroups.map((g) => ({ id: g.id, name: g.name }))}
            placeholder="Select Group"
          />

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Country"
              value={editFormData.country_id}
              onChange={(value) => {
                setEditFormData({ ...editFormData, country_id: value, city_id: '' });
              }}
              options={countries.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Select Country"
            />
            <SearchableSelect
              label="City"
              value={editFormData.city_id}
              onChange={(value) => setEditFormData({ ...editFormData, city_id: value })}
              options={filteredCities.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Select City"
              disabled={!editFormData.country_id}
            />
          </div>

          <Input
            label="Address"
            value={editFormData.address_line1}
            onChange={(e) => setEditFormData({ ...editFormData, address_line1: e.target.value })}
          />

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editFormData.portal_enabled}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, portal_enabled: e.target.checked })
                }
                className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
              />
              <span className="text-sm font-medium text-slate-700">
                Enable Client Portal Access
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Internal Notes
            </label>
            <textarea
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              placeholder="Add any internal notes..."
            />
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingCustomer(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateCustomerMutation.isPending}>
              {updateCustomerMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <BulkActionsBar
        count={selection.selectedCount}
        onClear={selection.clear}
        itemNoun="customer"
      >
        <BulkActionButton
          variant="ghost"
          icon={<Download className="w-4 h-4" />}
          label="Export"
          onClick={handleBulkExport}
        />
        {canBulkArchive && (
          <BulkActionButton
            variant="danger"
            icon={<Archive className="w-4 h-4" />}
            label={isArchiving ? 'Archiving…' : 'Archive'}
            onClick={handleBulkArchive}
            disabled={isArchiving}
          />
        )}
      </BulkActionsBar>
    </div>
  );
};
