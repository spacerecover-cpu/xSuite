import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { Button } from '../../components/ui/Button';
import { Plus, Search, Filter, Briefcase, AlertCircle, CheckCircle, RefreshCw, ChevronLeft, ChevronRight, Archive, Download } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { ExportButton } from '../../components/shared/ExportButton';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { ConfigurableDataTable } from '../../components/ui/ConfigurableDataTable';
import { ColumnPickerPopover } from '../../components/ui/ColumnPickerPopover';
import { casesColumns, casesRegistryMeta, pickPrimaryDevice, CASES_TABLE_KEY } from '../../lib/tables/casesColumns';
import type { CaseListRow } from '../../lib/tables/casesColumns';
import { useTableViewPrefs } from '../../hooks/useTableViewPrefs';
import { CreateCaseWizard } from '../../components/cases/CreateCaseWizard';
import { useCasesRealtime } from '../../hooks/useCasesRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { useUsageLimit } from '../../hooks/useFeatureGate';
import { canPerformAction } from '../../lib/featureGateService';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';

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
    is_primary: boolean | null;
    model: string | null;
    brand: { name: string } | null;
    capacity: { name: string; gb_value: number | null } | null;
    device_type: {
      id: string;
      name: string;
    } | null;
  }[];
}

/** Shape of the devices embed on the CSV-export queries. */
type ExportDevice = {
  serial_number: string | null;
  model: string | null;
  is_primary: boolean | null;
  catalog_device_types: { name: string } | null;
  catalog_device_capacities: { name: string } | null;
};
const exportPrimaryDevice = (r: Record<string, unknown>) =>
  pickPrimaryDevice((r.case_devices as ExportDevice[] | null) ?? undefined);

export const CasesList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
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
      .select('id, case_no, priority, status, customer_id', { count: 'exact', head: false })
      .is('deleted_at', null);

    if (searchTerm) {
      const s = sanitizeFilterValue(searchTerm);
      query = query.or(
        `case_no.ilike.%${s}%,client_reference.ilike.%${s}%`
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

  const { data: cases = [], isLoading, isError, error, refetch, isFetching } = useQuery({
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
          devices:case_devices (id, serial_number, model, is_primary, device_type_id, catalog_device_types (id, name), catalog_device_brands (name), catalog_device_capacities (name, gb_value))
        `)
        .is('deleted_at', null);

      if (searchTerm) {
        const s = sanitizeFilterValue(searchTerm);
        query = query.or(
          `case_no.ilike.%${s}%,client_reference.ilike.%${s}%`
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
        .order('is_primary', { referencedTable: 'case_devices', ascending: false })
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
          is_primary: device.is_primary,
          model: device.model,
          brand: device.catalog_device_brands,
          capacity: device.catalog_device_capacities,
          device_type: device.catalog_device_types,
        })),
      }));

      return casesWithRelations as Case[];
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

  // Dashboard counters as head-only COUNT queries instead of pulling every
  // case row to the client (the previous select grew linearly with tenant
  // case volume). Status-name lists come from master_case_statuses, so this
  // waits for them and re-keys when they change. "Active" is derived as
  // (cases with a status) - (cases in a terminal status) because terminal
  // names can contain PostgREST control characters that .in() quotes safely
  // but a NOT-IN DSL string would not.
  const { data: caseStats } = useQuery({
    queryKey: ['cases_stats', caseStatuses.map((s) => s.id).join(',')],
    enabled: caseStatuses.length > 0,
    queryFn: async () => {
      const namesOfTypes = (types: string[]) =>
        caseStatuses
          .filter((s) => s.type !== null && types.includes(s.type))
          .map((s) => s.name);
      const terminal = namesOfTypes(['completed', 'delivered', 'cancelled']);
      const diagnosis = namesOfTypes(['diagnosis']);
      const ready = namesOfTypes(['ready']);

      const base = () =>
        supabase.from('cases').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      const none = { count: 0 as number | null, error: null };

      const [withStatus, inTerminal, urgent, inDiagnosis, inReady] = await Promise.all([
        base().not('status', 'is', null),
        terminal.length ? base().in('status', terminal) : Promise.resolve(none),
        base().eq('priority', 'urgent'),
        diagnosis.length ? base().in('status', diagnosis) : Promise.resolve(none),
        ready.length ? base().in('status', ready) : Promise.resolve(none),
      ]);
      for (const r of [withStatus, inTerminal, urgent, inDiagnosis, inReady]) {
        if (r.error) throw r.error;
      }
      return {
        active: Math.max(0, (withStatus.count ?? 0) - (inTerminal.count ?? 0)),
        urgent: urgent.count ?? 0,
        diagnosis: inDiagnosis.count ?? 0,
        ready: inReady.count ?? 0,
      };
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

  // Tenant-configurable columns: registry defaults ← tenant config ← user prefs.
  const { view, setVisibleAndOrder, setWidths, resetPrefs } = useTableViewPrefs(
    CASES_TABLE_KEY,
    casesRegistryMeta,
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- color/name lookups derive from caseStatuses/casePriorities
  const tableRows = useMemo<CaseListRow[]>(
    () =>
      cases.map((c) => {
        const primary = pickPrimaryDevice(c.devices);
        return {
          id: c.id,
          case_no: c.case_no,
          priority: c.priority,
          priority_color: getPriorityColor(c.priority),
          status: c.status,
          status_name: getStatusName(c.status),
          status_color: getStatusColor(c.status),
          customer_name: c.customer?.customer_name ?? null,
          customer_mobile: c.customer?.mobile_number ?? null,
          client_reference: c.client_reference,
          created_at: c.created_at,
          created_by_name: c.created_by_profile?.full_name ?? null,
          device_type: primary?.device_type?.name ?? null,
          device_model: primary?.model ?? null,
          device_brand: primary?.brand?.name ?? null,
          device_capacity: primary?.capacity?.name ?? null,
          serial_primary: primary?.serial_no ?? null,
          device_count: c.devices?.length ?? 0,
        };
      }),
    [cases, caseStatuses, casePriorities],
  );

  const handleCreateCase = async () => {
    const check = await canPerformAction('max_cases_per_month');
    if (!check.allowed) {
      toast.error(check.message || 'Case limit reached');
      return;
    }
    if (check.message) {
      toast.warning(check.message);
    }
    setIsWizardOpen(true);
  };

  const handleBulkExport = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    const { data, error } = await supabase
      .from('cases')
      .select('case_no, title, priority, status, client_reference, created_at, customers_enhanced:customer_id(customer_name), case_devices(serial_number, model, is_primary, catalog_device_types(name), catalog_device_capacities(name))')
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
        { key: (r) => exportPrimaryDevice(r)?.catalog_device_types?.name, label: 'Device Type' },
        { key: (r) => exportPrimaryDevice(r)?.model, label: 'Device Model' },
        { key: (r) => exportPrimaryDevice(r)?.serial_number, label: 'Serial Number' },
        { key: (r) => exportPrimaryDevice(r)?.catalog_device_capacities?.name, label: 'Capacity' },
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
    const ok = await confirm({
      title: 'Archive Cases',
      message: `Archive ${n} case${n === 1 ? '' : 's'}? They'll be hidden from lists but recoverable.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) {
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
    <div className="p-6 max-w-[1800px] 2xl:max-w-[2400px] mx-auto">
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
              <p className="text-2xl font-bold text-info mt-1">{caseStats?.active ?? 0}</p>
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
              <p className="text-2xl font-bold text-danger mt-1">{caseStats?.urgent ?? 0}</p>
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
              <p className="text-2xl font-bold text-warning mt-1">{caseStats?.diagnosis ?? 0}</p>
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
              <p className="text-2xl font-bold text-success mt-1">{caseStats?.ready ?? 0}</p>
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

            <ColumnPickerPopover
              columns={casesColumns.map((c) => ({ key: c.key, label: c.label }))}
              view={view}
              onApply={setVisibleAndOrder}
              onReset={resetPrefs}
            />

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
                { key: (r) => exportPrimaryDevice(r)?.catalog_device_types?.name, label: 'Device Type' },
                { key: (r) => exportPrimaryDevice(r)?.model, label: 'Device Model' },
                { key: (r) => exportPrimaryDevice(r)?.serial_number, label: 'Serial Number' },
                { key: (r) => exportPrimaryDevice(r)?.catalog_device_capacities?.name, label: 'Capacity' },
                {
                  key: 'created_at',
                  label: 'Created',
                  format: (v) => (v ? new Date(v as string).toISOString().slice(0, 10) : ''),
                },
              ]}
              getRows={async () => {
                let q = supabase
                  .from('cases')
                  .select('case_no, title, priority, status, client_reference, created_at, customers_enhanced:customer_id(customer_name), case_devices(serial_number, model, is_primary, catalog_device_types(name), catalog_device_capacities(name))')
                  .is('deleted_at', null);
                if (searchTerm) {
                  const s = sanitizeFilterValue(searchTerm);
                  q = q.or(`case_no.ilike.%${s}%,client_reference.ilike.%${s}%`);
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
                    <option key={status.id} value={status.name}>
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
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="divide-y divide-slate-200">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-32 flex-1" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <div
            className="flex flex-col items-center text-center px-6 py-16"
            role="alert"
            aria-live="assertive"
          >
            <div className="w-14 h-14 rounded-full bg-danger-muted flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-danger" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Couldn't load cases</h3>
            <p className="text-sm text-slate-500 max-w-md mb-6">
              {(error as Error)?.message ||
                'Something went wrong while fetching cases. Please try again.'}
            </p>
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
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
            <ConfigurableDataTable
              rows={tableRows}
              columns={casesColumns}
              view={view}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/cases/${r.id}`)}
              selection={selection}
              onWidthsChange={setWidths}
              rowAriaLabel={(r) => `case ${r.case_no}`}
            />
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
