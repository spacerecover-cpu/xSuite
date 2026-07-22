import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { CompanyFormModal } from '../../components/companies/CompanyFormModal';
import { Plus, Search, Filter, Mail, Phone, Building2, MapPin, Users, UserCheck, Clock, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
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

export const CompaniesListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const COMPANIES_PER_PAGE = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterIndustry, filterStatus]);

  const { data: companies = [], isLoading, error: companiesError } = useQuery({
    // Scoped away from the bare ['companies'] key used by the customer-picker
    // projection (CustomersListPage / CustomerFormModal cache a truncated
    // id/company_number/company_name select there); sharing the key made this
    // page render that projection within its staleTime. Bare-['companies']
    // invalidations still prefix-match this key.
    queryKey: ['companies', 'full'],
    queryFn: async () => {
      // PostgREST caps an unranged select at db-max-rows (~1000), silently
      // hiding companies past that count from the list, search, and KPIs.
      // Page through explicit ranges until a short batch marks the end.
      const BATCH = 1000;
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += BATCH) {
        const { data, error } = await supabase
          .from('companies')
          .select(`
            *,
            master_industries (id, name),
            geo_countries (name),
            geo_cities (name)
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + BATCH - 1);

        if (error) {
          logger.error('Error fetching companies:', error);
          throw error;
        }

        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < BATCH) break;
      }

      const companiesWithContacts = await Promise.all(
        rows.map(async (company) => {
          // NOTE: customer_company_relationships.is_primary is customer-scoped
          // ("this company is that CUSTOMER's primary company"), not a company-scoped
          // primary-contact flag, so a single company can have many is_primary=true rows.
          // Filtering by it + maybeSingle() errored (PGRST116) on any company with 2+
          // such contacts. There is no company-primary-contact concept, so pick a single
          // representative contact: prefer a primary-flagged relationship, else the oldest.
          const { data: relationship } = await supabase
            .from('customer_company_relationships')
            .select('customers_enhanced (id, customer_name)')
            .eq('company_id', company.id as string)
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
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
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

      {/* Shared, standardized create modal — the same floating-label
          CompanyFormModal drives Add on the list and Edit on the profile,
          so both surfaces stay a 1:1 match. */}
      <CompanyFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['companies'] })}
      />
    </div>
  );
};
