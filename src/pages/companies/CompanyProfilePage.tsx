import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import {
  ChevronLeft, Building2, Mail, Phone, MapPin, Globe, Users,
  Calendar, FileText, DollarSign, MessageSquare, Eye, Briefcase
} from 'lucide-react';
import { formatDate } from '../../lib/format';
import { logger } from '../../lib/logger';
import { updateCompany } from '../../lib/companyService';
import { CustomerCasesTab } from '../../components/customers/CustomerCasesTab';
import { CustomerFinancialTab } from '../../components/customers/CustomerFinancialTab';
import { Skeleton } from '../../components/ui/Skeleton';
import { KpiRow } from '../../components/templates/KpiRow';

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
}

interface Contact {
  id: string;
  is_primary: boolean;
  job_title: string | null;
  department: string | null;
  customers_enhanced: {
    id: string;
    customer_number: string;
    customer_name: string;
    email: string | null;
    mobile_number: string | null;
    portal_enabled: boolean;
  };
}

interface Communication {
  id: string;
  type: string;
  subject: string | null;
  content: string | null;
  direction: string | null;
  status: string | null;
  created_at: string;
  sent_by: string | null;
  profiles?: {
    full_name: string;
  } | null;
}

export const CompanyProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'cases' | 'financial' | 'communications'>('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    company_name: '',
    tax_number: '',
    industry_id: '',
    email: '',
    phone: '',
    website: '',
    country_id: '',
    city_id: '',
    address: '',
    notes: '',
  });

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          master_industries (id, name),
          geo_countries (name),
          geo_cities (name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as Company | null;
    },
    enabled: !!id,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['company_contacts', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('customer_company_relationships')
        .select(`
          *,
          customers_enhanced (
            id,
            customer_number,
            customer_name,
            email,
            mobile_number,
            portal_enabled
          )
        `)
        .eq('company_id', id)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false });

      if (error) {
        logger.error('Error fetching contacts:', error);
        return [];
      }
      return ((data as unknown) as Contact[]) || [];
    },
    enabled: !!id,
  });

  const { data: communications = [] } = useQuery({
    queryKey: ['company_communications', id],
    queryFn: async () => {
      if (!id) return [];
      // Fetch communications for all customers linked to this company
      const customerIds = contacts.map(c => c.customers_enhanced?.id).filter((v): v is string => Boolean(v));
      if (customerIds.length === 0) return [];

      const { data, error } = await supabase
        .from('customer_communications')
        .select('*')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching communications:', error);
        return [];
      }

      const rows = ((data as unknown) as Communication[]) || [];

      // customer_communications.sent_by FKs to auth.users (not profiles), so
      // PostgREST cannot embed the profile — look up the loggers separately.
      const senderIds = Array.from(
        new Set(rows.map(r => r.sent_by).filter((v): v is string => Boolean(v)))
      );

      if (senderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', senderIds);

        const profileMap = new Map(
          (profilesData || []).map(p => [p.id, { full_name: p.full_name }])
        );

        for (const row of rows) {
          row.profiles = row.sent_by ? profileMap.get(row.sent_by) ?? null : null;
        }
      }

      return rows;
    },
    enabled: !!id && contacts.length > 0,
  });

  const { data: companyInsights = {
    totalCases: 0,
    completedCases: 0,
    pendingCases: 0,
    totalRevenue: 0,
    totalQuotes: 0,
    approvedQuotes: 0,
    lastInteraction: null,
  } } = useQuery({
    queryKey: ['company_insights', id, contacts],
    queryFn: async () => {
      const customerIds = contacts.map(c => c.customers_enhanced?.id).filter(Boolean);

      if (customerIds.length === 0) {
        return {
          totalCases: 0,
          completedCases: 0,
          pendingCases: 0,
          totalRevenue: 0,
          totalQuotes: 0,
          approvedQuotes: 0,
          lastInteraction: null,
        };
      }

      try {
        const { data: cases, error: casesError } = await supabase
          .from('cases')
          .select('id, status, created_at')
          .in('customer_id', customerIds);

        if (casesError) {
          logger.error('Error fetching cases:', casesError);
          return {
            totalCases: 0,
            completedCases: 0,
            pendingCases: 0,
            totalRevenue: 0,
            totalQuotes: 0,
            approvedQuotes: 0,
            lastInteraction: null,
          };
        }

        const caseIds = cases?.map(c => c.id) || [];

        let totalRevenue = 0;
        let totalQuotes = 0;
        let approvedQuotes = 0;

        if (caseIds.length > 0) {
          const { data: quotes, error: quotesError } = await supabase
            .from('case_quotes')
            .select('total_amount, status')
            .in('case_id', caseIds);

          if (!quotesError && quotes) {
            totalQuotes = quotes.length;
            approvedQuotes = quotes.filter(q => q.status === 'approved' || q.status === 'accepted').length;
            // TODO(country-engine): case_quotes has no total_amount_base shadow column,
            // so this approved/accepted-quote revenue rollup is multi-currency-incorrect
            // for a future non-base tenant. Blocked on a case_quotes base-shadow migration.
            // eslint-disable-next-line xsuite/no-raw-currency-aggregation -- BLOCKED: no total_amount_base on case_quotes (deferred migration); a no-op baseAmount would falsely silence a real gap
            totalRevenue = quotes
              .filter(q => q.status === 'approved' || q.status === 'accepted')
              .reduce((sum, q) => sum + (parseFloat(q.total_amount?.toString() || '0')), 0);
          }
        }

        const completedStatuses = ['completed', 'closed', 'delivered'];
        const pendingStatuses = ['open', 'in_progress', 'pending', 'awaiting_approval'];

        return {
          totalCases: cases?.length || 0,
          completedCases: cases?.filter(c => c.status && completedStatuses.includes(c.status.toLowerCase())).length || 0,
          pendingCases: cases?.filter(c => c.status && pendingStatuses.includes(c.status.toLowerCase())).length || 0,
          totalRevenue,
          totalQuotes,
          approvedQuotes,
          lastInteraction: cases && cases.length > 0 ? cases[0].created_at : null,
        };
      } catch (error) {
        logger.error('Exception fetching cases:', error);
        return {
          totalCases: 0,
          completedCases: 0,
          pendingCases: 0,
          totalRevenue: 0,
          totalQuotes: 0,
          approvedQuotes: 0,
          lastInteraction: null,
        };
      }
    },
    enabled: !!id,
    retry: false,
  });

  const { data: industries = [] } = useQuery({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_industries')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
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
      return data;
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
      return data;
    },
  });

  const filteredCities = cities.filter(
    (city: { id: string; country_id: string; name: string }) => !editFormData.country_id || city.country_id === editFormData.country_id
  );

  const updateMutation = useMutation({
    mutationFn: async (updatedData: typeof editFormData) => {
      if (!id) throw new Error('Company id is required');
      return updateCompany(id, {
        name: updatedData.company_name,
        tax_number: updatedData.tax_number || null,
        industry_id: updatedData.industry_id || null,
        email: updatedData.email || null,
        phone: updatedData.phone || null,
        website: updatedData.website || null,
        country_id: updatedData.country_id || null,
        city_id: updatedData.city_id || null,
        address: updatedData.address || null,
        notes: updatedData.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsEditModalOpen(false);
    },
  });

  const handleOpenEditModal = () => {
    if (!company) return;

    setEditFormData({
      company_name: company.name || company.company_name || '',
      tax_number: company.tax_number || '',
      industry_id: company.industry_id || '',
      email: company.email || '',
      phone: company.phone || '',
      website: company.website || '',
      country_id: company.country_id || '',
      city_id: company.city_id || '',
      address: company.address || '',
      notes: company.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(editFormData);
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <Skeleton className="h-5 w-40 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 p-6">
              <div className="flex items-start gap-6">
                <Skeleton className="w-16 h-16 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-7 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-6 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Company not found</p>
          <Button onClick={() => navigate('/companies')} variant="secondary" className="mt-4">
            Back to Companies
          </Button>
        </div>
      </div>
    );
  }

  const getCommunicationIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'phone':
        return <Phone className="w-4 h-4" />;
      case 'meeting':
        return <Calendar className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getCommunicationColor = (type: string) => {
    switch (type) {
      case 'email':
        return '#3b82f6';
      case 'phone':
        return '#10b981';
      case 'meeting':
        return 'rgb(var(--color-accent))';
      case 'sms':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const primaryContact = contacts.find(c => c.is_primary);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <button
        onClick={() => navigate('/companies')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-all hover:gap-3 font-medium"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Companies</span>
      </button>

      <Card className="p-6 mb-4">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-lg">
            {(company.name || company.company_name || '??').substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{company.name || company.company_name}</h1>
              <Badge variant="custom" color="rgb(var(--color-primary))">
                {company.company_number}
              </Badge>
              {!company.is_active && <Badge variant="default">Inactive</Badge>}
            </div>

            <div className="flex items-center gap-3 mb-4">
              {company.master_industries && (
                <Badge variant="accent">
                  {company.master_industries.name}
                </Badge>
              )}
              {company.tax_number && (
                <span className="text-sm text-slate-600">
                  <span className="font-medium">Tax:</span> {company.tax_number}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {company.email && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <a href={`mailto:${company.email}`} className="hover:text-primary">
                    {company.email}
                  </a>
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <a href={`tel:${company.phone}`} className="hover:text-primary">
                    {company.phone}
                  </a>
                </div>
              )}
              {company.website && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">
                    {company.website}
                  </a>
                </div>
              )}
              {(company.geo_cities?.name || company.geo_countries?.name) && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{[company.geo_cities?.name, company.geo_countries?.name].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {primaryContact && primaryContact.customers_enhanced && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>
                    {primaryContact.customers_enhanced.customer_name}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Joined {formatDate(company.created_at)}</span>
              </div>
            </div>

            {company.address && (
              <div className="mt-3 text-sm text-slate-600">
                <p>{company.address}</p>
              </div>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={handleOpenEditModal}>
            Edit Profile
          </Button>
        </div>
      </Card>

      <KpiRow
        cols="grid-cols-2 lg:grid-cols-4"
        stats={[
          {
            label: 'Total Revenue',
            value: `$${companyInsights?.totalRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            tone: 'success',
            icon: DollarSign,
            sub: 'From approved quotes',
          },
          {
            label: 'Total Cases',
            value: companyInsights?.totalCases || 0,
            tone: 'info',
            icon: Briefcase,
            sub: `${companyInsights?.completedCases || 0} done · ${companyInsights?.pendingCases || 0} pending`,
          },
          {
            label: 'Quotes',
            value: companyInsights?.totalQuotes || 0,
            tone: 'cat-2',
            icon: FileText,
            sub: `${companyInsights?.approvedQuotes || 0} approved`,
          },
          {
            label: 'Contacts',
            value: contacts.length,
            tone: 'primary',
            icon: Users,
            sub: `${contacts.filter(c => c.customers_enhanced?.portal_enabled).length} with portal access`,
          },
        ]}
      />

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex gap-1 p-1.5 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Building2 },
              { id: 'contacts', label: 'Contacts', icon: Users },
              { id: 'cases', label: 'Cases', icon: FileText },
              { id: 'financial', label: 'Financial', icon: DollarSign },
              { id: 'communications', label: 'Communications', icon: MessageSquare },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {company.notes && (
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-3">Internal Notes</h3>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{company.notes}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Recent Activity</h3>
                  <div className="space-y-3">
                    {communications.length > 0 ? (
                      communications.slice(0, 3).map((comm) => (
                        <div key={comm.id} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: getCommunicationColor(comm.type) + '20' }}
                          >
                            <div style={{ color: getCommunicationColor(comm.type) }}>
                              {getCommunicationIcon(comm.type)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {comm.subject || comm.type}
                            </p>
                            <p className="text-xs text-slate-500">{formatDate(comm.created_at)}</p>
                          </div>
                        </div>
                      ))
                    ) : companyInsights?.totalCases && companyInsights.totalCases > 0 ? (
                      <div className="text-center py-4">
                        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No recent communications</p>
                        <p className="text-xs text-slate-400 mt-1">{companyInsights.totalCases} cases in progress</p>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No activity yet</p>
                      </div>
                    )}
                  </div>
                  {communications.length > 3 && (
                    <button
                      onClick={() => setActiveTab('communications')}
                      className="w-full mt-3 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      View all activity →
                    </button>
                  )}
                </div>

                <div className="bg-info-muted rounded-xl border border-info/20 p-4">
                  <h3 className="text-sm font-bold text-info uppercase tracking-wider mb-3">Contact Summary</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-info">Total Contacts</span>
                      <span className="text-lg font-bold text-info">{contacts.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-info">Portal Enabled</span>
                      <span className="text-lg font-bold text-info">
                        {contacts.filter(c => c.customers_enhanced?.portal_enabled).length}
                      </span>
                    </div>
                    {primaryContact && primaryContact.customers_enhanced && (
                      <div className="mt-3 pt-3 border-t border-info/20">
                        <p className="text-xs text-info mb-1">Primary Contact</p>
                        <p className="text-sm font-semibold text-info">
                          {primaryContact.customers_enhanced.customer_name}
                        </p>
                        {primaryContact.job_title && (
                          <p className="text-xs text-info mt-1">{primaryContact.job_title}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab('contacts')}
                    className="w-full mt-3 px-3 py-2 bg-white rounded-lg text-xs font-medium text-info hover:bg-info-muted transition-colors"
                  >
                    View all contacts
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div>
              {contacts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg">No contacts linked yet</p>
                  <Button variant="secondary" className="mt-4">
                    Add Contact
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contacts.map((contact) => {
                    const customer = contact.customers_enhanced;
                    if (!customer) return null;

                    return (
                      <div
                        key={contact.id}
                        className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-primary/40 cursor-pointer transition-all"
                        onClick={() => navigate(`/customers/${customer.id}`)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                            {customer.customer_name?.[0] || 'C'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-slate-900">
                                {customer.customer_name}
                              </p>
                              {contact.is_primary && (
                                <Badge variant="success" size="sm">
                                  Primary
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mb-2">
                              {customer.customer_number}
                            </p>
                            {contact.job_title && (
                              <p className="text-sm text-slate-600 mb-1">{contact.job_title}</p>
                            )}
                            {contact.department && (
                              <p className="text-xs text-slate-500">
                                Department: {contact.department}
                              </p>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span className="truncate">{customer.email}</span>
                              </div>
                            )}
                            {customer.mobile_number && (
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{customer.mobile_number}</span>
                              </div>
                            )}
                            {customer.portal_enabled && (
                              <Badge variant="success" size="sm" className="mt-2">
                                Portal Access
                              </Badge>
                            )}
                          </div>
                          <Eye className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cases' && id && <CustomerCasesTab companyId={id} />}

          {activeTab === 'financial' && id && <CustomerFinancialTab companyId={id} />}

          {activeTab === 'communications' && (
            <div>
              {communications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg">No communications logged yet</p>
                  <Button variant="secondary" className="mt-4">
                    Log Communication
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {communications.map((comm) => (
                    <div
                      key={comm.id}
                      className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: getCommunicationColor(comm.type) }}
                        >
                          {getCommunicationIcon(comm.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="custom"
                              color={getCommunicationColor(comm.type)}
                              size="sm"
                            >
                              {comm.type}
                            </Badge>
                            {comm.direction && (
                              <Badge variant="default" size="sm">
                                {comm.direction}
                              </Badge>
                            )}
                            <span className="text-xs text-slate-500">
                              {formatDate(comm.created_at)}
                            </span>
                          </div>
                          {comm.subject && (
                            <p className="font-medium text-slate-900 mb-1">{comm.subject}</p>
                          )}
                          {comm.content && (
                            <p className="text-sm text-slate-600">{comm.content}</p>
                          )}
                          {comm.profiles && (
                            <p className="text-xs text-slate-500 mt-2">
                              Logged by {comm.profiles.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Company"
      >
        <form onSubmit={handleSubmitEdit} className="space-y-4">
          <Input
            label="Company Name"
            value={editFormData.company_name}
            onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="VAT/Tax Number"
              value={editFormData.tax_number}
              onChange={(e) => setEditFormData({ ...editFormData, tax_number: e.target.value })}
            />
            <SearchableSelect
              label="Industry"
              value={editFormData.industry_id}
              onChange={(value) => setEditFormData({ ...editFormData, industry_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...industries.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name }))]}
              placeholder="Select Industry"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
            />
            <Input
              label="Phone Number"
              value={editFormData.phone}
              onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
            />
          </div>

          <Input
            label="Website"
            value={editFormData.website}
            onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
            placeholder="https://example.com"
          />

          <div className="grid grid-cols-2 gap-3">
            <SearchableSelect
              label="Country"
              value={editFormData.country_id}
              onChange={(value) => {
                setEditFormData({ ...editFormData, country_id: value, city_id: '' });
              }}
              options={[{ id: '', name: 'Not specified' }, ...countries.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))]}
              placeholder="Select Country"
            />
            <SearchableSelect
              label="City"
              value={editFormData.city_id}
              onChange={(value) => setEditFormData({ ...editFormData, city_id: value })}
              options={[{ id: '', name: 'Not specified' }, ...filteredCities.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))]}
              placeholder="Select City"
              disabled={!editFormData.country_id}
            />
          </div>

          <Input
            label="Address"
            value={editFormData.address}
            onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
          />

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
              onClick={() => setIsEditModalOpen(false)}
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
