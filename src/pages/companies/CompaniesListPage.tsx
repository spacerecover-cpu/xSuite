import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { createCompany, updateCompany } from '../../lib/companyService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { AddressFields, type AddressValue } from '../../components/ui/AddressFields';
import { Plus, Search, Filter, Mail, Phone, Building2, MapPin, Users, UserCheck, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import { Skeleton } from '../../components/ui/Skeleton';

interface Company {
  id: string;
  company_number: string | null;
  name: string;
  company_name: string | null;
  tax_number: string | null;
  industry_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_id: string | null;
  city_id: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  master_industries: { id: string; name: string } | null;
  geo_countries: { name: string } | null;
  geo_cities: { name: string } | null;
  primary_contact: { id: string; customer_name: string } | null;
}

interface Industry {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
}

interface Country {
  id: string;
  name: string;
  is_active: boolean;
}

interface City {
  id: string;
  name: string;
  country_id: string;
  is_active: boolean;
}

export const CompaniesListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [addressNotesCollapsed, setAddressNotesCollapsed] = useState(true);
  const COMPANIES_PER_PAGE = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterIndustry, filterStatus]);

  const [formData, setFormData] = useState({
    company_name: '',
    tax_number: '',
    industry_id: '',
    email: '',
    phone: '',
    website: '',
    country_id: '',
    city_id: '',
    address: '',
    address_line1: '',
    address_line2: '',
    subdivision_id: null as string | null,
    postal_code: '',
    notes: '',
    primary_contact_id: '',
  });

  const { data: companies = [], isLoading, error: companiesError } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          master_industries (id, name),
          geo_countries (name),
          geo_cities (name)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching companies:', error);
        throw error;
      }

      const companiesWithContacts = await Promise.all(
        (data || []).map(async (company) => {
          // NOTE: customer_company_relationships.is_primary is customer-scoped
          // ("this company is that CUSTOMER's primary company"), not a company-scoped
          // primary-contact flag, so a single company can have many is_primary=true rows.
          // Filtering by it + maybeSingle() errored (PGRST116) on any company with 2+
          // such contacts. There is no company-primary-contact concept, so pick a single
          // representative contact: prefer a primary-flagged relationship, else the oldest.
          const { data: relationship } = await supabase
            .from('customer_company_relationships')
            .select('customers_enhanced (id, customer_name)')
            .eq('company_id', company.id)
            .is('deleted_at', null)
            .order('is_primary', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          return { ...company, primary_contact: relationship?.customers_enhanced || null };
        })
      );

      return companiesWithContacts as unknown as Company[];
    },
    staleTime: 30000,
    retry: 2,
  });

  const { data: industries = [] } = useQuery({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_industries')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Industry[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers_for_company'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers_enhanced')
        .select('id, customer_name, email, mobile_number')
        .eq('is_active', true)
        .order('customer_name');

      if (error) throw error;
      return data as Customer[];
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
    queryKey: ['company_settings', 'location'],
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

  const addressValue: AddressValue = {
    address_line1: formData.address_line1,
    address_line2: formData.address_line2,
    subdivision_id: formData.subdivision_id,
    postal_code: formData.postal_code,
  };

  const createMutation = useMutation({
    mutationFn: async (company: typeof formData) => {
      // The structured address fields (WP-1 Task 3) are declared on
      // `CreateCompanyInput`; createCompany spreads them into the insert.
      const payload = {
        name: company.company_name,
        company_name: company.company_name,
        tax_number: company.tax_number || null,
        industry_id: company.industry_id || null,
        email: company.email || null,
        phone: company.phone || null,
        website: company.website || null,
        country_id: company.country_id || null,
        city_id: company.city_id || null,
        address: company.address || null,
        address_line1: company.address_line1 || null,
        address_line2: company.address_line2 || null,
        subdivision_id: company.subdivision_id,
        postal_code: company.postal_code || null,
        notes: company.notes || null,
        created_by: profile?.id,
      };
      return createCompany(payload, company.primary_contact_id || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) =>
      updateCompany(id, {
        name: data.company_name,
        tax_number: data.tax_number || null,
        industry_id: data.industry_id || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        country_id: data.country_id || null,
        city_id: data.city_id || null,
        address: data.address || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        subdivision_id: data.subdivision_id,
        postal_code: data.postal_code || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsEditModalOpen(false);
      setEditingCompanyId(null);
      resetForm();
    },
  });

  const resetForm = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData({
      company_name: '',
      tax_number: '',
      industry_id: '',
      email: '',
      phone: '',
      website: '',
      country_id: defaultCountryId,
      city_id: '',
      address: '',
      address_line1: '',
      address_line2: '',
      subdivision_id: null,
      postal_code: '',
      notes: '',
      primary_contact_id: '',
    });
    setAddressNotesCollapsed(true);
  };

  const handleOpenModal = () => {
    const defaultCountryId = companySettings?.location?.default_country_id || '';
    setFormData((prev) => ({ ...prev, country_id: defaultCountryId }));
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCompanyId) {
      updateMutation.mutate({ id: editingCompanyId, data: formData });
    }
  };

  const filteredCompanies = companies.filter((company) => {
    const displayName = company.name || company.company_name || '';
    const matchesSearch =
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.company_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.tax_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesIndustry =
      filterIndustry === 'all' || company.industry_id === filterIndustry;

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && company.is_active) ||
      (filterStatus === 'inactive' && !company.is_active);

    return matchesSearch && matchesIndustry && matchesStatus;
  });

  const totalPages = Math.ceil(filteredCompanies.length / COMPANIES_PER_PAGE);
  const startIndex = (currentPage - 1) * COMPANIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COMPANIES_PER_PAGE, filteredCompanies.length);
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

  const recentCompanies = companies.filter((c) => {
    const createdDate = new Date(c.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return createdDate >= thirtyDaysAgo;
  });

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Companies"
        icon={Building2}
        actions={
          <Button size="sm" onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Company
          </Button>
        }
      />

      <KpiRow
        cols="grid-cols-2 lg:grid-cols-4"
        stats={[
          { label: 'Total Companies', value: companies.length, tone: 'info', icon: Building2 },
          { label: 'Active', value: companies.filter((c) => c.is_active).length, tone: 'success', icon: UserCheck },
          { label: 'Recent (30d)', value: recentCompanies.length, tone: 'cat-5', icon: Clock },
          { label: 'Industries', value: industries.length, tone: 'cat-2', icon: Layers },
        ]}
      />


      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'active'
                    ? 'bg-success text-success-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'inactive'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Inactive
              </button>
              {(filterIndustry !== 'all' || filterStatus !== 'all') && (
                <button
                  onClick={() => {
                    setFilterIndustry('all');
                    setFilterStatus('all');
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
              {(filterIndustry !== 'all' || filterStatus !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Industry
                </label>
                <select
                  value={filterIndustry}
                  onChange={(e) => setFilterIndustry(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Industries</option>
                  {industries.map((industry) => (
                    <option key={industry.id} value={industry.id}>
                      {industry.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {companiesError ? (
        <div className="bg-white rounded-2xl shadow-lg border border-danger/20 p-12 text-center">
          <Building2 className="w-16 h-16 text-danger/40 mx-auto mb-4" />
          <p className="text-danger text-lg font-semibold mb-2">Error loading companies</p>
          <p className="text-slate-500 text-sm mb-4">{companiesError.message}</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['companies'] })}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">
            {searchTerm || filterIndustry !== 'all' || filterStatus !== 'all'
              ? 'No companies found matching your criteria.'
              : 'No companies yet. Add your first company to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Company Number
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
                      Industry
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Primary Contact
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
                  {paginatedCompanies.map((company) => (
                    <tr
                      key={company.id}
                      onClick={() => navigate(`/companies/${company.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-primary">
                          {company.company_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shadow-md">
                            {(company.name || company.company_name || '??').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {company.name || company.company_name}
                            </div>
                            {company.tax_number && (
                              <div className="text-xs text-slate-500">
                                Tax: {company.tax_number}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {company.email ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[200px]">{company.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {company.phone ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {company.phone}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(company.geo_cities?.name || company.geo_countries?.name) ? (
                          <div className="text-sm text-slate-700 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{[company.geo_cities?.name, company.geo_countries?.name].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {company.master_industries ? (
                          <Badge variant="accent" size="sm">
                            {company.master_industries.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {company.primary_contact ? (
                          <div className="flex items-center gap-1 text-sm text-slate-700">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[150px]">
                              {company.primary_contact.customer_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {company.is_active ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {formatDate(company.created_at)}
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
                  <span className="font-medium text-slate-900">{filteredCompanies.length}</span> companies
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
        title="Add New Company"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Company Name"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="VAT/Tax Number"
              value={formData.tax_number}
              onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
            />
            <SearchableSelect
              label="Industry"
              value={formData.industry_id}
              onChange={(value) => setFormData({ ...formData, industry_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...industries.map((i) => ({ id: i.id, name: i.name }))]}
              placeholder="Select Industry"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Phone Number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <Input
            label="Website"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            placeholder="https://example.com"
          />

          <SearchableSelect
            label="Primary Contact"
            value={formData.primary_contact_id}
            onChange={(value) => setFormData({ ...formData, primary_contact_id: value })}
            options={[
              { id: '', name: 'No contact' },
              ...customers.map((c) => ({
                id: c.id,
                name: `${c.customer_name}${c.email ? ` (${c.email})` : ''}`,
              })),
            ]}
            placeholder="Select Primary Contact"
          />

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Country"
              value={formData.country_id}
              onChange={(value) => {
                setFormData({ ...formData, country_id: value, city_id: '' });
              }}
              options={[{ id: '', name: 'Not specified' }, ...countries.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Select Country"
            />
            <SearchableSelect
              label="City"
              value={formData.city_id}
              onChange={(value) => setFormData({ ...formData, city_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...filteredCities.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Select City"
              disabled={!formData.country_id}
            />
          </div>

          <AddressFields
            value={addressValue}
            onChange={(next) => setFormData((f) => ({ ...f, ...next }))}
            countryId={formData.country_id || null}
          />

          <div>
            <button
              type="button"
              onClick={() => setAddressNotesCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors py-0.5"
            >
              {addressNotesCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              Additional address notes
            </button>
            {!addressNotesCollapsed && (
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="mt-1.5 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                placeholder="Legacy free-text address notes"
              />
            )}
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

          {createMutation.isError && (
            <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 text-sm text-danger">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create company. Please try again.'}
            </div>
          )}

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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCompanyId(null);
          resetForm();
        }}
        title="Edit Company"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <Input
            label="Company Name"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="VAT/Tax Number"
              value={formData.tax_number}
              onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
            />
            <SearchableSelect
              label="Industry"
              value={formData.industry_id}
              onChange={(value) => setFormData({ ...formData, industry_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...industries.map((i) => ({ id: i.id, name: i.name }))]}
              placeholder="Select Industry"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Phone Number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <Input
            label="Website"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            placeholder="https://example.com"
          />

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Country"
              value={formData.country_id}
              onChange={(value) => {
                setFormData({ ...formData, country_id: value, city_id: '' });
              }}
              options={[{ id: '', name: 'Not specified' }, ...countries.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Select Country"
            />
            <SearchableSelect
              label="City"
              value={formData.city_id}
              onChange={(value) => setFormData({ ...formData, city_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...filteredCities.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Select City"
              disabled={!formData.country_id}
            />
          </div>

          <AddressFields
            value={addressValue}
            onChange={(next) => setFormData((f) => ({ ...f, ...next }))}
            countryId={formData.country_id || null}
          />

          <div>
            <button
              type="button"
              onClick={() => setAddressNotesCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors py-0.5"
            >
              {addressNotesCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              Additional address notes
            </button>
            {!addressNotesCollapsed && (
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="mt-1.5 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                placeholder="Legacy free-text address notes"
              />
            )}
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
                setIsEditModalOpen(false);
                setEditingCompanyId(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
