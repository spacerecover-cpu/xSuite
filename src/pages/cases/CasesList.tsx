import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Plus, Search, Filter, Briefcase, AlertCircle, CheckCircle, RefreshCw, ChevronLeft, ChevronRight, Archive, Download } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { formatDate } from '../../lib/format';
import { CreateCaseWizard } from '../../components/cases/CreateCaseWizard';
import { useCasesRealtime } from '../../hooks/useCasesRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { useUsageLimit } from '../../hooks/useFeatureGate';
import { canPerformAction } from '../../lib/featureGateService';
import toast from 'react-hot-toast';

interface Case {
  id: string;
  case_no: string;
  title: string;
  priority: string;
  status: string;
  client_reference: string | null;
  created_at: string;
  created_by: string;
  assigned_engineer_id: string | null;
  customer: {
    id: string;
    customer_number: string;
    customer_name: string;
    mobile_number: string | null;
  } | null;
  created_by_profile: {
    id: string;
    full_name: string;
  } | null;
  devices: {
    id: string;
    serial_no: string | null;
    device_type: {
      id: string;
      name: string;
    } | null;
  }[];
}

export const CasesList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const { usage: caseUsage } = useUsageLimit('max_cases_per_month');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const selection = useBulkSelection();
  const canBulkArchive = profile?.role === 'owner' || profile?.role === 'admin';
  const [isArchiving, setIsArchiving] = useState(false);

  // Command-palette deep-link: /cases?new=1 opens the create wizard.
  // Strip the param after we honor it so the wizard doesn't re-open on
  // refresh and back-navigation reads the same URL.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsWizardOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const CASES_PER_PAGE = 7;

  const queryClient = useQueryClient();
  useCasesRealtime();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterPriority]);

  const buildFiltersQuery = () => {
    let query = supabase
      .from('cases')
      .select('id, case_no, priority, status, customer_id', { count: 'exact', head: false });

    if (searchTerm) {
      query = query.or(
        `case_no.ilike.%${searchTerm}%,client_reference.ilike.%${searchTerm}%`
      );
    }

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    if (filterPriority !== 'all') {
      query = query.eq('priority', filterPriority);
    }

    return query;
  };

  const { data: totalCountData } = useQuery({
    queryKey: ['cases_count', searchTerm, filterStatus, filterPriority],
    queryFn: async () => {
      const query = buildFiltersQuery();
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: cases = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cases', currentPage, searchTerm, filterStatus, filterPriority],
    queryFn: async () => {
      const from = (currentPage - 1) * CASES_PER_PAGE;
      const to = from + CASES_PER_PAGE - 1;

      // customer and devices are embedded via real FKs (cases.customer_id ->
      // customers_enhanced, case_devices.case_id -> cases) in one query. cases.created_by
      // has NO FK to profiles, so it cannot be a PostgREST embed; it is batched below.
      let query = supabase
        .from('cases')
        .select(`
          id,
          case_no,
          title,
          priority,
          status,
          client_reference,
          created_at,
          customer_id,
          contact_id,
          created_by,
          assigned_engineer_id,
          customer:customers_enhanced!customer_id (id, customer_number, customer_name, mobile_number),
          devices:case_devices (id, serial_number, device_type_id, catalog_device_types (id, name))
        `);

      if (searchTerm) {
        query = query.or(
          `case_no.ilike.%${searchTerm}%,client_reference.ilike.%${searchTerm}%`
        );
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'case_devices', ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];

      // Batch the creator-profile lookup into a single query (no FK to embed; many
      // rows share a creator, so dedupe the ids first).
      const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
      const profilesById = new Map<string, { id: string; full_name: string | null }>();
      if (creatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        for (const p of profilesData || []) profilesById.set(p.id, p);
      }

      const casesWithRelations = rows.map((caseItem) => ({
        ...caseItem,
        customer: caseItem.customer ?? null,
        created_by_profile: caseItem.created_by ? profilesById.get(caseItem.created_by) ?? null : null,
        devices: (caseItem.devices || []).map((device) => ({
          id: device.id,
          serial_no: device.serial_number,
          device_type: device.catalog_device_types,
        })),
      }));

      return casesWithRelations as Case[];
    },
  });

  const { data: allCasesForStats = [] } = useQuery({
    queryKey: ['cases_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, status, priority')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: caseStatuses = [] } = useQuery({
    queryKey: ['case_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_statuses')
        .select('id, name, type, color')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: casePriorities = [] } = useQuery({
    queryKey: ['case_priorities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_case_priorities')
        .select('id, name, color')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const handleWizardSuccess = () => {
    setIsWizardOpen(false);
    refetch();
  };

  const totalPages = Math.ceil((totalCountData || 0) / CASES_PER_PAGE);
  const startIndex = (currentPage - 1) * CASES_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * CASES_PER_PAGE, totalCountData || 0);

  const getPriorityColor = (priority: string) => {
    const priorityItem = casePriorities.find(
      p => p.name.toLowerCase() === priority.toLowerCase()
    );
    return priorityItem?.color || '#6b7280';
  };

  const getStatusColor = (status: string) => {
    const statusItem = caseStatuses.find(
      s => s.name === status
    );
    return statusItem?.color || '#6b7280';
  };

  const getStatusName = (status: string) => {
    const statusItem = caseStatuses.find(
      s => s.name === status
    );
    return statusItem?.name || status;
  };

  const getStatusesByType = (type: string) => {
    return caseStatuses.filter(s => s.type === type).map(s => s.name);
  };

  const handleCreateCase = async () => {
    const check = await canPerformAction('max_cases_per_month');
    if (!check.allowed) {
      toast.error(check.message || 'Case limit reached');
      return;
    }
    if (check.message) {
      toast(check.message, { icon: '⚠️' });
    }
    setIsWizardOpen(true);
  };

  // IDs visible on the current page — drives the header "select all"
  // checkbox state. Selection state itself spans all pages.
  const visibleIds = cases.map((c) => c.id);

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('cases')
      .select('case_no, title, priority, status, client_reference, created_at, customers_enhanced:customer_id(customer_name)')
      .in('id', ids);
    if (error) {
      toast.error('Failed to export selected cases');
      return;
    }
    downloadCSV(
      data ?? [],
      [
        { key: 'case_no', label: 'Case #' },
        { key: 'title', label: 'Title' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        {
          key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
          label: 'Customer',
        },
        { key: 'client_reference', label: 'Client Ref' },
        {
          key: 'created_at',
          label: 'Created',
          format: (v) => (v ? new Date(v as string).toISOString().slice(0, 10) : ''),
        },
      ],
      'cases-selected',
    );
    toast.success(`Exported ${data?.length ?? 0} case${data?.length === 1 ? '' : 's'}`);
  };

  const handleBulkArchive = async () => {
    if (selection.selectedCount === 0) return;
    if (!canBulkArchive) {
      toast.error('Only admins can bulk archive cases');
      return;
    }
    const n = selection.selectedCount;
    // Native confirm — destructive enough to warrant a hard stop. Don't
    // build a custom modal until users actually request progress bars or
    // bulk-archive undo; YAGNI.
    if (!window.confirm(`Archive ${n} case${n === 1 ? '' : 's'}? They'll be hidden from lists but recoverable.`)) {
      return;
    }
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('cases')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`Archived ${n} case${n === 1 ? '' : 's'}`);
      selection.clear();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['cases_count'] });
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive cases');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-primary">
            <Briefcase className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Cases</h1>
            <p className="text-slate-600 text-base">
              Data recovery case management
              {caseUsage && caseUsage.limit && (
                <span className="ml-2 text-slate-500">
                  ({caseUsage.current}/{caseUsage.limit} this month)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            variant="secondary"
            disabled={isFetching}
            title="Refresh cases list"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={handleCreateCase}>
            <Plus className="w-4 h-4 mr-2" />
            Create Case
          </Button>
        </div>
      </div>

      {caseUsage && caseUsage.percentage >= 80 && caseUsage.percentage < 100 && (
        <div className="mb-4 bg-warning-muted border border-warning/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          <span className="text-warning">
            You've used {caseUsage.current} of {caseUsage.limit} cases this month ({caseUsage.percentage}%).
            Consider upgrading your plan for more capacity.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-info-muted rounded-xl p-4 border border-info/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-info uppercase tracking-wide">Active Cases</p>
              <p className="text-2xl font-bold text-info mt-1">{allCasesForStats.filter(c => c.status !== null && !getStatusesByType('completed').includes(c.status) && !getStatusesByType('delivered').includes(c.status) && !getStatusesByType('cancelled').includes(c.status)).length}</p>
            </div>
            <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-info-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-danger-muted rounded-xl p-4 border border-danger/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-danger uppercase tracking-wide">Urgent</p>
              <p className="text-2xl font-bold text-danger mt-1">{allCasesForStats.filter(c => c.priority === 'urgent').length}</p>
            </div>
            <div className="w-10 h-10 bg-danger rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-danger-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-warning-muted rounded-xl p-4 border border-warning/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-warning uppercase tracking-wide">In Diagnosis</p>
              <p className="text-2xl font-bold text-warning mt-1">{allCasesForStats.filter(c => c.status !== null && getStatusesByType('diagnosis').includes(c.status)).length}</p>
            </div>
            <div className="w-10 h-10 bg-warning rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-warning-foreground" />
            </div>
          </div>
        </div>

        <div className="bg-success-muted rounded-xl p-4 border border-success/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-success uppercase tracking-wide">Ready</p>
              <p className="text-2xl font-bold text-success mt-1">{allCasesForStats.filter(c => c.status !== null && getStatusesByType('ready').includes(c.status)).length}</p>
            </div>
            <div className="w-10 h-10 bg-success rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success-foreground" />
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
                placeholder="Search cases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterStatus(filterStatus === 'Received' ? 'all' : 'Received')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'Received'
                    ? 'bg-info text-info-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Received
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'Approved - In Queue' ? 'all' : 'Approved - In Queue')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'Approved - In Queue'
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Approved - In Queue
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'Recovery in Progress' ? 'all' : 'Recovery in Progress')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'Recovery in Progress'
                    ? 'bg-warning text-warning-foreground shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Recovery in Progress
              </button>
              <button
                onClick={() => setFilterStatus(filterStatus === 'Cancelled-Currently No Solution' ? 'all' : 'Cancelled-Currently No Solution')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === 'Cancelled-Currently No Solution'
                    ? 'bg-slate-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Cancelled - No Solution
              </button>
              {(filterStatus !== 'all' || filterPriority !== 'all') && (
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterPriority('all');
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
              {(filterStatus !== 'all' || filterPriority !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

            {/* Fetches everything matching the active filter — not just
                the current page — so accountant handoff CSVs aren't
                truncated to one paginated screen. */}
            <ExportButton
              filename="cases"
              columns={[
                { key: 'case_no', label: 'Case #' },
                { key: 'title', label: 'Title' },
                { key: 'priority', label: 'Priority' },
                { key: 'status', label: 'Status' },
                {
                  key: (r) => (r.customers_enhanced as { customer_name?: string } | null)?.customer_name,
                  label: 'Customer',
                },
                { key: 'client_reference', label: 'Client Ref' },
                {
                  key: 'created_at',
                  label: 'Created',
                  format: (v) => (v ? new Date(v as string).toISOString().slice(0, 10) : ''),
                },
              ]}
              getRows={async () => {
                let q = supabase
                  .from('cases')
                  .select('case_no, title, priority, status, client_reference, created_at, customers_enhanced:customer_id(customer_name)')
                  .is('deleted_at', null);
                if (searchTerm) {
                  q = q.or(`case_no.ilike.%${searchTerm}%,client_reference.ilike.%${searchTerm}%`);
                }
                if (filterStatus !== 'all') q = q.eq('status', filterStatus);
                if (filterPriority !== 'all') q = q.eq('priority', filterPriority);
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
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Statuses</option>
                  {caseStatuses.map((status) => (
                    <option key={status.id} value={status.name.toLowerCase()}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Priority
                </label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Priorities</option>
                  {casePriorities.map((priority) => (
                    <option key={priority.id} value={priority.name.toLowerCase()}>
                      {priority.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading cases...</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <EmptyState
            icon={Briefcase}
            title="No cases found"
            description={
              searchTerm || filterStatus !== 'all' || filterPriority !== 'all'
                ? 'No cases found matching your criteria.'
                : 'No cases yet. Create your first case to get started.'
            }
            action={{ label: 'Create Case', onClick: handleCreateCase }}
          />
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
                        // indeterminate state — set imperatively because React
                        // doesn't support it via prop; ref callback fires on
                        // every render so the state stays accurate.
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
                      Case ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Contact Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Client Ref
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Device Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Serial Number
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cases.map((caseItem) => (
                  <tr
                    key={caseItem.id}
                    onClick={() => navigate(`/cases/${caseItem.id}`)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                      selection.isSelected(caseItem.id) ? 'bg-info-muted/30' : ''
                    }`}
                  >
                    <td
                      className="px-4 py-4 w-10"
                      // Stop event propagation so clicking the checkbox
                      // doesn't also navigate to the case detail page.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selection.isSelected(caseItem.id)}
                        onChange={() => selection.toggle(caseItem.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        aria-label={`Select case ${caseItem.case_no}`}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-primary">
                        {caseItem.case_no}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant="custom"
                        color={getPriorityColor(caseItem.priority)}
                        size="sm"
                      >
                        {caseItem.priority}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {caseItem.customer ? (
                        <div className="font-medium text-slate-900">
                          {caseItem.customer.customer_name}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {caseItem.customer?.mobile_number ? (
                        <div className="text-sm text-slate-700 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {caseItem.customer.mobile_number}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {caseItem.client_reference ? (
                        <span className="text-sm text-slate-700">
                          {caseItem.client_reference}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge
                        variant="custom"
                        color={getStatusColor(caseItem.status)}
                        size="sm"
                      >
                        {getStatusName(caseItem.status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {caseItem.devices && caseItem.devices.length > 0 && caseItem.devices[0].device_type ? (
                        <span className="text-sm text-slate-700">
                          {caseItem.devices[0].device_type.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {caseItem.devices && caseItem.devices.length > 0 ? (
                        <div className="text-sm text-slate-700">
                          {caseItem.devices
                            .filter(d => d.serial_no)
                            .map(d => d.serial_no)
                            .join(', ') || <span className="text-slate-400">-</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {formatDate(caseItem.created_at)}
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
                  Showing <span className="font-medium text-slate-900">{startIndex}</span> to{' '}
                  <span className="font-medium text-slate-900">{endIndex}</span> of{' '}
                  <span className="font-medium text-slate-900">{totalCountData}</span> cases
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
                      disabled={currentPage === 1 || isFetching}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || isFetching}
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

      {isWizardOpen && (
        <CreateCaseWizard
          onClose={() => setIsWizardOpen(false)}
          onSuccess={handleWizardSuccess}
        />
      )}

      <BulkActionsBar
        count={selection.selectedCount}
        onClear={selection.clear}
        itemNoun="case"
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
