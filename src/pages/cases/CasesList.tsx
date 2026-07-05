import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { cn } from '../../lib/utils';
import { sanitizeFilterValue } from '../../lib/postgrestSanitizer';
import { buildCaseSearchOr } from '../../lib/caseSearch';
import { Button } from '../../components/ui/Button';
import { Plus, Search, Filter, Briefcase, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Archive, Download } from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { BulkActionsBar, BulkActionButton } from '../../components/shared/BulkActionsBar';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { downloadCSV } from '../../lib/csvExport';
import { ConfigurableDataTable } from '../../components/ui/ConfigurableDataTable';
import { ColumnPickerPopover } from '../../components/ui/ColumnPickerPopover';
import { casesColumns, casesRegistryMeta, pickPrimaryDevice, CASES_TABLE_KEY } from '../../lib/tables/casesColumns';
import type { CaseListRow } from '../../lib/tables/casesColumns';
import { useTableViewPrefs } from '../../hooks/useTableViewPrefs';
import { useListPageSize } from '../../hooks/useListPageSize';
import { useListSelectionEnabled } from '../../hooks/useListSelectionEnabled';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { statusNamesForBucket, type CaseBucket, type CaseStatusType } from '../../lib/caseLifecycle';
import { pageWindow } from '../../lib/pagination';
import { useStatCardStyle } from '../../hooks/useStatCardStyle';
import { CaseViewsMenu } from '../../components/cases/CaseViewsMenu';
import { CasePeekPanel } from '../../components/cases/CasePeekPanel';
import { CreateCaseWizard } from '../../components/cases/CreateCaseWizard';
import { useCasesRealtime } from '../../hooks/useCasesRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { useUsageLimit } from '../../hooks/useFeatureGate';
import { canPerformAction } from '../../lib/featureGateService';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';
import { CasesCommandCenter } from '../../components/cases/CasesCommandCenter';
import { useCaseCommandStats, CASE_COMMAND_STATS_KEY } from '../../hooks/useCaseCommandStats';
import type { CasePeriod } from '../../lib/casePeriods';

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
  engineer_profile: {
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

// Quick-chip colour language: a small status dot carries the lifecycle hue
// (the same palette as the bucket cards above), so a row of chips reads as
// quiet accents on neutral pills instead of saturated fills competing with the
// cards. Only the active (filtering) chip tints its whole pill in its own hue.
// Resolved through the tenant's status mapping so imported vocabulary tints
// correctly. Literal classes for JIT safety.
const CHIP_STYLE: Partial<Record<CaseStatusType, { dot: string; active: string }>> = {
  intake: { dot: 'bg-primary', active: 'border-primary bg-primary/10 text-primary' },
  diagnosis: { dot: 'bg-warning', active: 'border-warning bg-warning-muted text-warning' },
  quoting: { dot: 'bg-cat-6', active: 'border-cat-6 bg-cat-6/10 text-cat-6' },
  awaiting_approval: { dot: 'bg-cat-6', active: 'border-cat-6 bg-cat-6/10 text-cat-6' },
  approved: { dot: 'bg-cat-2', active: 'border-cat-2 bg-cat-2/10 text-cat-2' },
  recovery: { dot: 'bg-cat-2', active: 'border-cat-2 bg-cat-2/10 text-cat-2' },
  qa: { dot: 'bg-cat-2', active: 'border-cat-2 bg-cat-2/10 text-cat-2' },
  ready: { dot: 'bg-success', active: 'border-success bg-success-muted text-success' },
  delivered: { dot: 'bg-info', active: 'border-info bg-info-muted text-info' },
  closed: { dot: 'bg-slate-400', active: 'border-slate-400 bg-slate-100 text-slate-700' },
  cancelled: { dot: 'bg-danger', active: 'border-danger bg-danger-muted text-danger' },
};
const DEFAULT_CHIP_STYLE = { dot: 'bg-slate-400', active: 'border-primary bg-primary/10 text-primary' };

// Neutral resting pill — the hue lives only in the dot until the chip is active.
const IDLE_CHIP_CLASS =
  'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50';

function chipStyleFor(type: CaseStatusType | undefined) {
  return (type && CHIP_STYLE[type]) || DEFAULT_CHIP_STYLE;
}

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
  const [period, setPeriod] = useState<CasePeriod>('month');
  const [currentPage, setCurrentPage] = useState(1);
  const casesPerPage = useListPageSize();
  const selectionEnabled = useListSelectionEnabled();
  const statCardStyle = useStatCardStyle();
  const [bucketFilter, setBucketFilter] = useState<CaseBucket | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  });

  const queryClient = useQueryClient();

  // Live changes accumulate into a refresh pill instead of reordering the
  // table under a reading operator.
  const [pendingChanges, setPendingChanges] = useState(0);
  useCasesRealtime({ onListChange: () => setPendingChanges((n) => n + 1) });

  const applyPendingChanges = () => {
    setPendingChanges(0);
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['cases_count'] });
    queryClient.invalidateQueries({ queryKey: [CASE_COMMAND_STATS_KEY] });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterPriority, casesPerPage, bucketFilter, sort]);

  // Hiding checkboxes (tenant preference) drops any in-flight selection so
  // bulk actions can't act on rows the user can no longer see or unselect.
  useEffect(() => {
    if (!selectionEnabled) selection.clear();
  }, [selectionEnabled, selection.clear]);

  // Status chip/select and bucket cards are mutually exclusive filters.
  useEffect(() => {
    if (filterStatus !== 'all') setBucketFilter(null);
  }, [filterStatus]);

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

  // Command-center data: one status-counts RPC classified via master types +
  // tenant overrides (truthful buckets) plus period flow metrics — see
  // useCaseCommandStats.
  const { data: commandStats, isLoading: statsLoading } = useCaseCommandStats(period, caseStatuses);

  // Status names behind the active bucket card — drives the .in() filter.
  const bucketStatusNames = useMemo(
    () =>
      bucketFilter && commandStats
        ? statusNamesForBucket(bucketFilter, commandStats.statusCounts, commandStats.statusTypeMap)
        : null,
    [bucketFilter, commandStats],
  );

  // Data-driven quick chips: the tenant's real vocabulary, busiest first.
  const statusesByCount = useMemo(
    () =>
      [...(commandStats?.statusCounts ?? [])]
        .filter((s): s is { status: string; total: number } => s.status !== null)
        .sort((a, b) => b.total - a.total),
    [commandStats],
  );
  const topStatusChips = statusesByCount.slice(0, 4);

  // Search spans case_no / client_reference / subject plus customer (name, email, mobile,
  // number) and device serials — the latter two pre-resolved to ids (see caseSearch.ts).
  const resolveSearchOr = async (): Promise<string | null> =>
    searchTerm ? buildCaseSearchOr(sanitizeFilterValue(searchTerm)) : null;

  const buildFiltersQuery = (searchOr: string | null) => {
    let query = supabase
      .from('cases')
      .select('id, case_no, priority, status, customer_id', { count: 'exact', head: false })
      .is('deleted_at', null);

    if (searchOr) {
      query = query.or(searchOr);
    }

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    if (filterPriority !== 'all') {
      query = query.eq('priority', filterPriority);
    }

    if (bucketStatusNames) {
      // Empty bucket → match nothing rather than everything.
      query = query.in('status', bucketStatusNames.length > 0 ? bucketStatusNames : ['__none__']);
    }

    return query;
  };

  const { data: totalCountData } = useQuery({
    queryKey: ['cases_count', searchTerm, filterStatus, filterPriority, bucketFilter, bucketStatusNames?.join('|') ?? ''],
    queryFn: async () => {
      const query = buildFiltersQuery(await resolveSearchOr());
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: cases = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['cases', currentPage, casesPerPage, searchTerm, filterStatus, filterPriority, bucketFilter, bucketStatusNames?.join('|') ?? '', sort],
    queryFn: async () => {
      const from = (currentPage - 1) * casesPerPage;
      const to = from + casesPerPage - 1;

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

      const searchOr = await resolveSearchOr();
      if (searchOr) {
        query = query.or(searchOr);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }

      const { data, error } = await query
        .order(sort.key, { ascending: sort.dir === 'asc' })
        .order('is_primary', { referencedTable: 'case_devices', ascending: false })
        .order('created_at', { referencedTable: 'case_devices', ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];

      // Batch the creator + assigned-engineer profile lookups into a single
      // query (no FK to embed; many rows share people, so dedupe the ids first).
      const profileIds = [
        ...new Set(
          rows.flatMap((r) => [r.created_by, r.assigned_engineer_id]).filter(Boolean),
        ),
      ] as string[];
      const profilesById = new Map<string, { id: string; full_name: string | null }>();
      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', profileIds);
        for (const p of profilesData || []) profilesById.set(p.id, p);
      }

      const casesWithRelations = rows.map((caseItem) => ({
        ...caseItem,
        customer: caseItem.customer ?? null,
        created_by_profile: caseItem.created_by ? profilesById.get(caseItem.created_by) ?? null : null,
        engineer_profile: caseItem.assigned_engineer_id
          ? profilesById.get(caseItem.assigned_engineer_id) ?? null
          : null,
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

  const totalPages = Math.ceil((totalCountData || 0) / casesPerPage);
  const startIndex = (currentPage - 1) * casesPerPage + 1;
  const endIndex = Math.min(currentPage * casesPerPage, totalCountData || 0);

  const getPriorityColor = (priority: string | null | undefined) => {
    if (!priority) return '#6b7280';
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
          engineer_name: c.engineer_profile?.full_name ?? null,
          lifecycle_type: commandStats?.statusTypeMap.get(c.status) ?? null,
        };
      }),
    [cases, caseStatuses, casePriorities, commandStats],
  );

  // Header-click sort: same key flips direction; a new key starts at its
  // natural direction (dates newest-first, everything else A→Z).
  const handleSortChange = (key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'created_at' ? 'desc' : 'asc' },
    );
  };

  // Operator keyboard layer: j/k rows, Enter open, x select, / search, [ ] pages.
  // Inert while typing in any input/select/textarea (Escape blurs the field).
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [peekCaseId, setPeekCaseId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const isTypingContext = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingContext(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case '[':
          setCurrentPage((p) => Math.max(1, p - 1));
          break;
        case ']':
          setCurrentPage((p) => Math.min(Math.max(1, totalPages), p + 1));
          break;
        case 'j':
        case 'k': {
          if (tableRows.length === 0) break;
          e.preventDefault();
          setFocusedRowId((prev) => {
            const idx = prev ? tableRows.findIndex((r) => r.id === prev) : -1;
            const next =
              e.key === 'j'
                ? Math.min(tableRows.length - 1, idx + 1)
                : Math.max(0, idx <= 0 ? 0 : idx - 1);
            return tableRows[next]?.id ?? null;
          });
          break;
        }
        case 'Enter':
          if (focusedRowId) navigate(`/cases/${focusedRowId}`);
          break;
        case 'x':
        case 'X':
          if (focusedRowId && selectionEnabled) selection.toggle(focusedRowId);
          break;
        case 'p':
        case 'P':
          if (focusedRowId) setPeekCaseId(focusedRowId);
          break;
        case 'Escape':
          if (peekCaseId) setPeekCaseId(null);
          else setFocusedRowId(null);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tableRows, focusedRowId, peekCaseId, totalPages, selectionEnabled, selection, navigate]);

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
      queryClient.invalidateQueries({ queryKey: [CASE_COMMAND_STATS_KEY] });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to archive cases');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="px-6 py-5 max-w-[1800px] 2xl:max-w-[2400px] mx-auto">
      <PageHeaderSlot title="Cases" icon={Briefcase} iconColor="rgb(var(--color-primary))" />
      <CasesCommandCenter
        period={period}
        onPeriodChange={setPeriod}
        stats={commandStats}
        loading={statsLoading || caseStatuses.length === 0}
        activeBucket={bucketFilter}
        onBucketChange={(bucket) => {
          setBucketFilter(bucket);
          if (bucket) setFilterStatus('all');
        }}
        cardStyle={statCardStyle}
        onUrgentFilter={() => {
          setBucketFilter(null);
          setFilterStatus('all');
          setFilterPriority(filterPriority === 'urgent' ? 'all' : 'urgent');
        }}
        note={
          caseUsage && caseUsage.limit
            ? `${caseUsage.current}/${caseUsage.limit} this month`
            : undefined
        }
        actions={
          <>
            <Button onClick={handleCreateCase}>
              <Plus className="w-4 h-4 mr-2" />
              Create Case
            </Button>
          </>
        }
      />

      {caseUsage && caseUsage.percentage >= 80 && caseUsage.percentage < 100 && (
        <div className="mb-4 bg-warning-muted border border-warning/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          <span className="text-warning">
            You've used {caseUsage.current} of {caseUsage.limit} cases this month ({caseUsage.percentage}%).
            Consider upgrading your plan for more capacity.
          </span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4">
        <div className="p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search cases...  ( / )"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {topStatusChips.map(({ status, total }) => {
                const active = filterStatus === status;
                const type = commandStats?.statusTypeMap.get(status);
                const style = chipStyleFor(type);
                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(active ? 'all' : status)}
                    aria-pressed={active}
                    title={active ? `Clear ${status} filter` : `Filter by ${status}`}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? style.active : IDLE_CHIP_CLASS,
                    )}
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
                    <span>{status}</span>
                    <span className={cn('tabular-nums', active ? 'opacity-70' : 'text-slate-400')}>
                      {total.toLocaleString()}
                    </span>
                  </button>
                );
              })}
              {(filterStatus !== 'all' || filterPriority !== 'all' || bucketFilter !== null) && (
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterPriority('all');
                    setBucketFilter(null);
                  }}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Clear all
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Filter className="w-4 h-4" />
              More Filters
              {(filterStatus !== 'all' || filterPriority !== 'all') && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>

            <CaseViewsMenu
              current={{ filterStatus, filterPriority, bucket: bucketFilter, sort }}
              onApply={(v) => {
                setFilterStatus(v.filterStatus);
                setFilterPriority(v.filterPriority);
                setBucketFilter(v.bucket);
                setSort(v.sort);
              }}
            />

            <ColumnPickerPopover
              columns={casesColumns.map((c) => ({ key: c.key, label: c.label }))}
              view={view}
              onApply={setVisibleAndOrder}
              onReset={resetPrefs}
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
                  {statusesByCount.map(({ status, total }) => (
                    <option key={status} value={status}>
                      {status} ({total})
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

      {pendingChanges > 0 && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={applyPendingChanges}
            className="inline-flex items-center gap-2 rounded-full border border-info/30 bg-info-muted px-4 py-1.5 text-sm font-medium text-info shadow-sm transition-colors hover:bg-info/15"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingChanges === 1 ? '1 case updated' : `${pendingChanges} case updates`} — refresh list
          </button>
        </div>
      )}

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
              onRowClick={(r, e) => {
                if (e && 'shiftKey' in e && (e.shiftKey || e.altKey)) setPeekCaseId(r.id);
                else navigate(`/cases/${r.id}`);
              }}
              selection={selectionEnabled ? selection : undefined}
              onWidthsChange={setWidths}
              sort={sort}
              onSortChange={handleSortChange}
              activeRowKey={focusedRowId}
              rowAriaLabel={(r) => `case ${r.case_no}`}
            />
          </div>

          {totalPages > 1 && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mt-4 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>
                    Showing <span className="font-medium text-slate-900">{startIndex}</span> to{' '}
                    <span className="font-medium text-slate-900">{endIndex}</span> of{' '}
                    <span className="font-medium text-slate-900">{totalCountData}</span> cases
                  </span>
                  <span className="hidden text-xs text-slate-400 xl:inline">
                    j/k rows · Enter open · p peek · x select · / search · [ ] pages
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <nav className="hidden items-center gap-1 md:flex" aria-label="Pages">
                    {pageWindow(currentPage, totalPages).map((p, i) =>
                      p === 'gap' ? (
                        <span key={`gap-${i}`} className="px-1 text-sm text-slate-400" aria-hidden="true">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          disabled={isFetching}
                          aria-current={p === currentPage ? 'page' : undefined}
                          className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium tabular-nums transition-colors ${
                            p === currentPage
                              ? 'bg-primary text-primary-foreground'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  </nav>
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

      <CasePeekPanel caseId={peekCaseId} onClose={() => setPeekCaseId(null)} />

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
