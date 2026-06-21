import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ChangeClientModal } from './ChangeClientModal';
import { ChangeCompanyModal } from './ChangeCompanyModal';
import { formatDate } from '../../lib/format';
import { updateCompany } from '../../lib/companyService';
import { User, Mail, Phone, MapPin, Hash, CreditCard as Edit, Save, X, ArrowLeftRight, Building2, FileText, Clock, Briefcase, Search, ChevronLeft, ChevronRight } from 'lucide-react';

type CustomerUpdate = Database['public']['Tables']['customers_enhanced']['Update'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

type CaseCustomer = {
  id: string;
  customer_number: string | null;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  phone: string | null;
  address: string | null;
  country_id: string | null;
  city_id: string | null;
  geo_countries: { name: string } | null;
  geo_cities: { name: string } | null;
};

type CaseCompany = {
  id: string;
  company_number: string | null;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  geo_countries: { name: string } | null;
  geo_cities: { name: string } | null;
};

interface CaseDataShape {
  customer_id?: string | null;
  company_id?: string | null;
  customer?: CaseCustomer | null;
  [key: string]: unknown;
}

interface ClientTabProps {
  caseId: string;
  caseData: CaseDataShape;
}

export const ClientTab: React.FC<ClientTabProps> = ({ caseId, caseData }) => {
  const queryClient = useQueryClient();
  const [editingClient, setEditingClient] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [showChangeClientModal, setShowChangeClientModal] = useState(false);
  const [showChangeCompanyModal, setShowChangeCompanyModal] = useState(false);

  const [editedClientData, setEditedClientData] = useState<CustomerUpdate>({});
  const [editedCompanyData, setEditedCompanyData] = useState<CompanyUpdate & { name?: string | null }>({});
  const [caseHistoryPage, setCaseHistoryPage] = useState(1);
  const [caseHistorySearch, setCaseHistorySearch] = useState('');
  const CASES_PER_PAGE = 5;

  // Fetch company details with two-tier fallback
  // Tier 1: Use case-level company_id if set
  // Tier 2: Fallback to customer's company from customer_company_relationships
  const { data: companyData } = useQuery<CaseCompany | null>({
    queryKey: ['case_company', caseData?.company_id, caseData?.customer_id],
    queryFn: async (): Promise<CaseCompany | null> => {
      // Tier 1: Check if case has direct company association
      if (caseData?.company_id) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, company_number, name, company_name, email, phone, tax_number, geo_countries(name), geo_cities(name)')
          .eq('id', caseData.company_id)
          .maybeSingle();

        if (error) throw error;
        return (data as CaseCompany | null) ?? null;
      }

      // Tier 2: Fallback to customer's company relationship
      if (caseData?.customer_id) {
        const { data: relationship, error: relError } = await supabase
          .from('customer_company_relationships')
          .select(`
            company_id,
            companies (id, company_number, name, company_name, email, phone, tax_number, geo_countries(name), geo_cities(name))
          `)
          .eq('customer_id', caseData.customer_id)
          .is('deleted_at', null)
          .order('is_primary', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (relError) throw relError;
        const embedded = relationship?.companies as unknown;
        if (!embedded) return null;
        return (Array.isArray(embedded) ? (embedded[0] as CaseCompany | undefined) ?? null : (embedded as CaseCompany));
      }

      return null;
    },
    enabled: !!(caseData?.company_id || caseData?.customer_id),
  });

  // Fetch customer case history
  const { data: customerCases = [] } = useQuery({
    queryKey: ['customer_cases', caseData?.customer_id],
    queryFn: async () => {
      if (!caseData?.customer_id) return [];

      const { data, error } = await supabase
        .from('cases')
        .select(`
          id,
          case_no,
          title,
          status,
          priority,
          created_at,
          service_type:catalog_service_types(name)
        `)
        .eq('customer_id', caseData.customer_id)
        .neq('id', caseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!caseData?.customer_id,
  });

  // Fetch statuses for badge colors
  const { data: caseStatuses = [] } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name, type, color')
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: casePriorities = [] } = useQuery({
    queryKey: ['case_priorities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_priorities')
        .select('id, name, color')
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    },
  });

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async (updates: CustomerUpdate) => {
      if (!caseData?.customer_id) return;
      const { error } = await supabase
        .from('customers_enhanced')
        .update(updates)
        .eq('id', caseData.customer_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      setEditingClient(false);
      setEditedClientData({});
    },
  });

  // Update company mutation
  const updateCompanyMutation = useMutation({
    mutationFn: async (updates: CompanyUpdate) => {
      if (!caseData?.company_id) return;
      await updateCompany(caseData.company_id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_company', caseData?.company_id] });
      setEditingCompany(false);
      setEditedCompanyData({});
    },
  });

  // Change client mutation
  const changeClientMutation = useMutation({
    mutationFn: async (newCustomerId: string) => {
      const { error } = await supabase
        .from('cases')
        .update({ customer_id: newCustomerId })
        .eq('id', caseId);

      if (error) throw error;

      // Log the change in history
      await supabase.rpc('log_case_history', {
        p_case_id: caseId,
        p_action: 'CLIENT_CHANGED',
        p_details_json: {
          old_customer_id: caseData?.customer_id,
          new_customer_id: newCustomerId,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['customer_cases', caseData?.customer_id] });
      setShowChangeClientModal(false);
    },
  });

  // Change company mutation
  const changeCompanyMutation = useMutation({
    mutationFn: async (newCompanyId: string | null) => {
      const { error } = await supabase
        .from('cases')
        .update({ company_id: newCompanyId })
        .eq('id', caseId);

      if (error) throw error;

      // Log the change in history. (The RPC takes p_details text — the previous
      // p_details_json arg didn't exist, so this call failed silently.)
      await supabase.rpc('log_case_history', {
        p_case_id: caseId,
        p_action: 'COMPANY_CHANGED',
        p_details: JSON.stringify({
          old_company_id: caseData?.company_id,
          new_company_id: newCompanyId,
        }),
        p_old_value: caseData?.company_id ?? undefined,
        p_new_value: newCompanyId ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case_company'] });
      setShowChangeCompanyModal(false);
    },
  });

  const handleSaveClient = () => {
    if (Object.keys(editedClientData).length > 0) {
      updateCustomerMutation.mutate(editedClientData);
    } else {
      setEditingClient(false);
    }
  };

  const handleSaveCompany = () => {
    if (Object.keys(editedCompanyData).length > 0) {
      const { name, ...rest } = editedCompanyData;
      const updates: CompanyUpdate = { ...rest };
      if (name) {
        updates.name = name;
      }
      updateCompanyMutation.mutate(updates);
    } else {
      setEditingCompany(false);
    }
  };

  const handleCancelClientEdit = () => {
    setEditingClient(false);
    setEditedClientData({});
  };

  const handleCancelCompanyEdit = () => {
    setEditingCompany(false);
    setEditedCompanyData({});
  };

  const getStatusColor = (statusType: string) => {
    const status = caseStatuses.find(s => s.type === statusType);
    return status?.color || '#6b7280';
  };

  const getPriorityColor = (priorityName: string) => {
    const priority = casePriorities.find(p => p.name.toLowerCase() === priorityName?.toLowerCase());
    return priority?.color || '#6b7280';
  };

  const customer: CaseCustomer | null = caseData?.customer ?? null;

  // Filter and paginate case history
  const filteredCases = customerCases.filter(c =>
    c.id !== caseId && (
      caseHistorySearch === '' ||
      c.case_no?.toLowerCase().includes(caseHistorySearch.toLowerCase()) ||
      c.status?.toLowerCase().includes(caseHistorySearch.toLowerCase()) ||
      c.priority?.toLowerCase().includes(caseHistorySearch.toLowerCase())
    )
  );

  const totalPages = Math.ceil(filteredCases.length / CASES_PER_PAGE);
  const paginatedCases = filteredCases.slice(
    (caseHistoryPage - 1) * CASES_PER_PAGE,
    caseHistoryPage * CASES_PER_PAGE
  );

  return (
    <>
      {/* Single Row - 3 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Client Details Card */}
      <Card variant="bordered" className="overflow-hidden">
        <div className="bg-info-muted border-b border-info/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-info flex items-center gap-2">
              <User className="w-4 h-4 text-info" />
              Client Details
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowChangeClientModal(true)}
                title="Change Client"
              >
                <ArrowLeftRight className="w-3 h-3 text-danger" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingClient(!editingClient)}
              >
                <Edit className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="space-y-0">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Customer Number
              </label>
              <p className="text-sm font-mono text-primary font-semibold">
                {customer?.customer_number || '-'}
              </p>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Customer Name
              </label>
              <p className="text-sm font-semibold text-slate-900 text-right">
                {customer?.customer_name || '-'}
              </p>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email
              </label>
              {editingClient ? (
                <input
                  type="email"
                  value={editedClientData.email ?? customer?.email ?? ''}
                  onChange={(e) => setEditedClientData({ ...editedClientData, email: e.target.value })}
                  className="text-sm px-2 py-1 border border-primary/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary max-w-[200px]"
                  placeholder="email@example.com"
                />
              ) : customer?.email ? (
                <a
                  href={`mailto:${customer.email}`}
                  className="text-sm text-primary hover:text-primary/80 break-all text-right"
                >
                  {customer.email}
                </a>
              ) : (
                <p className="text-sm text-slate-400 text-right">-</p>
              )}
            </div>

            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Mobile Number
              </label>
              {editingClient ? (
                <input
                  type="tel"
                  value={editedClientData.mobile_number ?? customer?.mobile_number ?? ''}
                  onChange={(e) => setEditedClientData({ ...editedClientData, mobile_number: e.target.value })}
                  className="text-sm px-2 py-1 border border-primary/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary max-w-[200px]"
                  placeholder="+123456789"
                />
              ) : (customer?.mobile_number || customer?.phone) ? (
                <a
                  href={`tel:${customer.mobile_number || customer.phone}`}
                  className="text-sm text-primary hover:text-primary/80 text-right"
                >
                  {customer.mobile_number || customer.phone}
                </a>
              ) : (
                <p className="text-sm text-slate-400 text-right">-</p>
              )}
            </div>

            <div className="flex items-center justify-between py-3">
              <label className="text-sm text-slate-600 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location
              </label>
              <p className="text-sm text-slate-900 font-medium text-right">
                {customer?.geo_cities?.name && customer?.geo_countries?.name
                  ? `${customer.geo_cities.name}, ${customer.geo_countries.name}`
                  : customer?.geo_cities?.name || customer?.geo_countries?.name || '-'}
              </p>
            </div>
          </div>
        </div>
        {editingClient && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-white">
            <div className="flex gap-2 pt-3">
              <Button
                size="sm"
                onClick={handleSaveClient}
                style={{ backgroundColor: 'rgb(var(--color-success))' }}
                disabled={updateCustomerMutation.isPending}
              >
                <Save className="w-3 h-3 mr-1" />
                {updateCustomerMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancelClientEdit}
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Company Details Card */}
      <Card variant="bordered" className="overflow-hidden">
        <div className="bg-success-muted border-b border-success/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-success flex items-center gap-2">
              <Building2 className="w-4 h-4 text-success" />
              Company Details
              {!caseData?.company_id && companyData && (
                <span
                  className="text-xs font-normal text-slate-500"
                  title="No company is pinned to this case; showing the customer's current primary company. Changing the customer's companies will change what appears here."
                >
                  (customer's current primary company)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowChangeCompanyModal(true)}
                title="Change Company"
              >
                <ArrowLeftRight className="w-3 h-3 text-danger" />
              </Button>
              {companyData && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingCompany(!editingCompany)}
                >
                  <Edit className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white p-4">
          {companyData ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  Company Number
                </label>
                <p className="text-sm font-mono text-success font-semibold">
                  {companyData.company_number}
                </p>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Company Name
                </label>
                <p className="text-sm font-semibold text-slate-900 text-right">
                  {companyData.name || companyData.company_name}
                </p>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email
                </label>
                {editingCompany ? (
                  <input
                    type="email"
                    value={editedCompanyData.email ?? companyData.email ?? ''}
                    onChange={(e) => setEditedCompanyData({ ...editedCompanyData, email: e.target.value })}
                    className="text-sm px-2 py-1 border border-success/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                  />
                ) : companyData.email ? (
                  <a
                    href={`mailto:${companyData.email}`}
                    className="text-sm text-success hover:text-success/80 break-all text-right"
                  >
                    {companyData.email}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400 text-right">-</p>
                )}
              </div>

              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  Phone
                </label>
                {editingCompany ? (
                  <input
                    type="tel"
                    value={editedCompanyData.phone ?? companyData.phone ?? ''}
                    onChange={(e) => setEditedCompanyData({ ...editedCompanyData, phone: e.target.value })}
                    className="text-sm px-2 py-1 border border-success/40 rounded bg-white focus:outline-none focus:ring-2 focus:ring-success max-w-[200px]"
                  />
                ) : companyData.phone ? (
                  <a
                    href={`tel:${companyData.phone}`}
                    className="text-sm text-success hover:text-success/80 text-right"
                  >
                    {companyData.phone}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400 text-right">-</p>
                )}
              </div>

              <div className="flex items-center justify-between py-3">
                <label className="text-sm text-slate-600 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Location
                </label>
                <p className="text-sm text-slate-900 font-medium text-right">
                  {companyData.geo_cities?.name && companyData.geo_countries?.name
                    ? `${companyData.geo_cities.name}, ${companyData.geo_countries.name}`
                    : companyData.geo_cities?.name || companyData.geo_countries?.name || '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Building2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No company associated</p>
              <p className="text-xs text-slate-400 mt-1">Individual customer (B2C)</p>
            </div>
          )}
        </div>
        {editingCompany && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 bg-white">
            <div className="flex gap-2 pt-3">
              <Button
                size="sm"
                onClick={handleSaveCompany}
                style={{ backgroundColor: 'rgb(var(--color-success))' }}
                disabled={updateCompanyMutation.isPending}
              >
                <Save className="w-3 h-3 mr-1" />
                {updateCompanyMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancelCompanyEdit}
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Client Case History Card - Third Column */}
      <Card variant="bordered" className="overflow-hidden">
        <div className="bg-warning-muted border-b border-warning/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-warning flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" />
              Client Case History
            </h2>
            <Badge variant="custom" color="rgb(var(--color-warning))" size="sm">
              {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
            </Badge>
          </div>
        </div>
        <div className="bg-white p-4">
          {customerCases.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No previous cases</p>
              <p className="text-xs text-slate-400 mt-1">This is the first case for this customer</p>
            </div>
          ) : (
            <>
              {/* Search Box */}
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search cases..."
                    value={caseHistorySearch}
                    onChange={(e) => {
                      setCaseHistorySearch(e.target.value);
                      setCaseHistoryPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-warning focus:border-transparent"
                  />
                </div>
              </div>

              {/* Case List */}
              <div className="space-y-2 mb-3" style={{ minHeight: '300px', maxHeight: '400px', overflowY: 'auto' }}>
                {paginatedCases.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No cases found</p>
                  </div>
                ) : (
                  paginatedCases.map((historyCase) => (
                <div
                  key={historyCase.id}
                  className="border border-slate-200 rounded-lg p-3 hover:border-warning/40 hover:bg-warning-muted transition-all cursor-pointer"
                  onClick={() => window.open(`/cases/${historyCase.id}`, '_blank')}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        #{historyCase.case_no}
                        <Badge
                          variant="custom"
                          color={getStatusColor(historyCase.status ?? '')}
                          size="sm"
                        >
                          {historyCase.status}
                        </Badge>
                      </p>
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {historyCase.service_type?.name || 'Service'}
                      </p>
                    </div>
                    <Badge
                      variant="custom"
                      color={getPriorityColor(historyCase.priority ?? '')}
                      size="sm"
                    >
                      {historyCase.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    {formatDate(historyCase.created_at)}
                  </div>
                </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-warning/20">
                  <p className="text-xs text-slate-600">
                    Page {caseHistoryPage} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCaseHistoryPage(prev => Math.max(1, prev - 1))}
                      disabled={caseHistoryPage === 1}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCaseHistoryPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={caseHistoryPage === totalPages}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
      </div>

      {/* Change Client Modal */}
      <ChangeClientModal
        isOpen={showChangeClientModal}
        onClose={() => setShowChangeClientModal(false)}
        currentCustomer={customer ? {
          id: customer.id,
          customer_name: customer.customer_name,
          email: customer.email ?? undefined,
          mobile_number: customer.mobile_number ?? undefined,
          customer_number: customer.customer_number ?? '',
        } : null}
        onConfirm={(newCustomerId) => changeClientMutation.mutate(newCustomerId)}
        isLoading={changeClientMutation.isPending}
      />

      {/* Change Company Modal */}
      <ChangeCompanyModal
        isOpen={showChangeCompanyModal}
        onClose={() => setShowChangeCompanyModal(false)}
        currentCompany={companyData ? {
          id: companyData.id,
          name: companyData.name,
          company_name: companyData.company_name ?? undefined,
          company_number: companyData.company_number ?? '',
          email: companyData.email ?? undefined,
          phone: companyData.phone ?? undefined,
          tax_number: companyData.tax_number ?? undefined,
          geo_cities: companyData.geo_cities,
          geo_countries: companyData.geo_countries,
        } : null}
        onConfirm={(newCompanyId) => changeCompanyMutation.mutate(newCompanyId)}
        isLoading={changeCompanyMutation.isPending}
      />
    </>
  );
};
