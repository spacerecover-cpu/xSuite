import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Search, Filter, CheckCircle, XCircle, Trash2, CreditCard as Edit, Send, DollarSign, BarChart2, ChevronDown, ChevronRight, CalendarDays, Users, TrendingUp, FileText } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService, TimesheetWithEmployee, TimesheetFilters } from '../../lib/timesheetService';
import { timesheetKeys } from '../../lib/queryKeys';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { useDateTimeConfig } from '../../contexts/TenantConfigContext';
import { resolveWeekStartsOn } from './workWeek';

type TabId = 'entries' | 'summary';
type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected';

function getStatusBadge(status: string | null) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success">
          <CheckCircle className="w-3 h-3" />
          Approved
        </span>
      );
    case 'submitted':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-muted text-info">
          <Send className="w-3 h-3" />
          Submitted
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger-muted text-danger">
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          <FileText className="w-3 h-3" />
          Draft
        </span>
      );
  }
}

function getBillableBadge(isBillable: boolean | null) {
  if (isBillable) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success">
        <DollarSign className="w-3 h-3" />
        Billable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      Non-billable
    </span>
  );
}

interface TimesheetEntryModalProps {
  entry: TimesheetWithEmployee | null;
  employees: { id: string; first_name: string; last_name: string; employee_number: string | null }[];
  onClose: () => void;
  onSave: () => void;
  currentUserId: string;
  isAdmin: boolean;
}

function TimesheetEntryModal({ entry, employees, onClose, onSave, currentUserId, isAdmin }: TimesheetEntryModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    employee_id: entry?.employee_id ?? (isAdmin ? '' : currentUserId),
    work_date: entry?.work_date ?? format(new Date(), 'yyyy-MM-dd'),
    project_name: entry?.project_name ?? '',
    task_description: entry?.task_description ?? '',
    hours: entry?.hours?.toString() ?? '8',
    is_billable: entry?.is_billable ?? true,
    notes: entry?.notes ?? '',
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const hours = parseFloat(form.hours);
      if (!form.employee_id) throw new Error('Please select an employee');
      if (!form.work_date) throw new Error('Please select a work date');
      if (isNaN(hours) || hours <= 0) throw new Error('Please enter valid hours (greater than 0)');
      if (hours > 24) throw new Error('Hours cannot exceed 24');

      // tenant_id is populated by the timesheets trigger. The table also
      // has a legacy NOT NULL `date` column kept in sync with `work_date`.
      const payload = {
        employee_id: form.employee_id,
        date: form.work_date,
        work_date: form.work_date,
        project_name: form.project_name || null,
        task_description: form.task_description || null,
        hours,
        is_billable: form.is_billable,
        notes: form.notes || null,
      };

      if (entry) {
        return timesheetService.updateTimesheet(entry.id, payload as Parameters<typeof timesheetService.updateTimesheet>[1]);
      }
      return timesheetService.createTimesheet(payload as Parameters<typeof timesheetService.createTimesheet>[0]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
      toast.success(entry ? 'Timesheet entry updated' : 'Timesheet entry created');
      onSave();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save timesheet entry');
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={entry ? 'Edit Timesheet Entry' : 'New Timesheet Entry'}
      size="md"
    >
      <div className="space-y-4">
        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee <span className="text-danger">*</span></label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={form.employee_id}
              onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
            >
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}{emp.employee_number ? ` (${emp.employee_number})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Date <span className="text-danger">*</span></label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={form.work_date}
              onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hours <span className="text-danger">*</span></label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={form.hours}
              onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
          <input
            type="text"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. Client Server Recovery"
            value={form.project_name}
            onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Task Description</label>
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Describe the work performed..."
            value={form.task_description}
            onChange={e => setForm(f => ({ ...f, task_description: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${form.is_billable ? 'bg-primary' : 'bg-slate-300'}`}
              onClick={() => setForm(f => ({ ...f, is_billable: !f.is_billable }))}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_billable ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-sm font-medium text-slate-700">Billable Hours</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Any additional notes..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : entry ? 'Update Entry' : 'Create Entry'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface ApproveRejectModalProps {
  entry: TimesheetWithEmployee;
  action: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
  currentUserId: string;
}

function ApproveRejectModal({ entry, action, onClose, onDone, currentUserId }: ApproveRejectModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      action === 'approve'
        ? timesheetService.approveTimesheet(entry.id, currentUserId, notes || undefined)
        : timesheetService.rejectTimesheet(entry.id, currentUserId, notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
      toast.success(action === 'approve' ? 'Timesheet approved' : 'Timesheet rejected');
      onDone();
    },
    onError: () => {
      toast.error(`Failed to ${action} timesheet`);
    },
  });

  const empName = entry.employee
    ? `${entry.employee.first_name} ${entry.employee.last_name}`
    : 'Unknown';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={action === 'approve' ? 'Approve Timesheet' : 'Reject Timesheet'}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {action === 'approve' ? 'Approve' : 'Reject'} timesheet for{' '}
          <span className="font-semibold text-slate-800">{empName}</span> on{' '}
          <span className="font-semibold text-slate-800">
            {format(parseISO(entry.work_date ?? ''), 'MMM d, yyyy')}
          </span>{' '}
          ({entry.hours}h)?
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Notes {action === 'reject' && <span className="text-danger">*</span>}
          </label>
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder={action === 'reject' ? 'Reason for rejection...' : 'Optional notes...'}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
              action === 'approve'
                ? 'bg-success hover:bg-success/90'
                : 'bg-danger hover:bg-danger/90'
            }`}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (action === 'reject' && !notes.trim())}
          >
            {mutation.isPending
              ? action === 'approve'
                ? 'Approving...'
                : 'Rejecting...'
              : action === 'approve'
              ? 'Approve'
              : 'Reject'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function TimesheetManagement() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { weekStartsOn } = useDateTimeConfig();
  const wso = resolveWeekStartsOn(weekStartsOn);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'hr';

  const [activeTab, setActiveTab] = useState<TabId>('entries');
  const [_filters, _setFilters] = useState<TimesheetFilters>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'non-billable'>('all');

  const now = new Date();
  const [summaryYear, setSummaryYear] = useState(now.getFullYear());
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1);
  const [summaryEmployee, setSummaryEmployee] = useState('');
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const [editingEntry, setEditingEntry] = useState<TimesheetWithEmployee | null | undefined>(undefined);
  const [approvingEntry, setApprovingEntry] = useState<{ entry: TimesheetWithEmployee; action: 'approve' | 'reject' } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitConfirmId, setSubmitConfirmId] = useState<string | null>(null);

  const appliedFilters: TimesheetFilters = useMemo(() => {
    const f: TimesheetFilters = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (employeeFilter) f.employeeId = employeeFilter;
    if (searchText.trim()) f.search = searchText.trim();
    if (billableFilter === 'billable') f.isBillable = true;
    if (billableFilter === 'non-billable') f.isBillable = false;
    return f;
  }, [statusFilter, employeeFilter, searchText, billableFilter]);

  const { data: timesheets = [], isLoading } = useQuery({
    queryKey: timesheetKeys.list(appliedFilters as Record<string, unknown>),
    queryFn: () => timesheetService.getTimesheets(appliedFilters),
  });

  const { data: stats } = useQuery({
    queryKey: [...timesheetKeys.stats(), wso],
    queryFn: () => timesheetService.getTimesheetStats(wso),
  });

  const { data: employees = [] } = useQuery({
    queryKey: timesheetKeys.employees(),
    queryFn: () => timesheetService.getEmployees(),
  });

  const { data: monthlySummary = [], isLoading: summaryLoading } = useQuery({
    queryKey: timesheetKeys.summary({ year: summaryYear, month: summaryMonth, employee: summaryEmployee }),
    queryFn: () => timesheetService.getMonthlySummary(summaryYear, summaryMonth, summaryEmployee || undefined),
    enabled: activeTab === 'summary',
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => timesheetService.submitTimesheet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
      toast.success('Timesheet submitted for approval');
      setSubmitConfirmId(null);
    },
    onError: () => {
      toast.error('Failed to submit timesheet');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timesheetService.deleteTimesheet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
      toast.success('Timesheet entry deleted');
      setDeletingId(null);
    },
    onError: () => {
      toast.error('Failed to delete timesheet entry');
    },
  });

  const weekStart = startOfWeek(now, { weekStartsOn: wso });
  const weekEnd = endOfWeek(now, { weekStartsOn: wso });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekMap = useMemo(() => {
    const m: Record<string, number> = {};
    timesheets.forEach(t => {
      const d = t.work_date;
      if (!d) return;
      m[d] = (m[d] ?? 0) + t.hours;
    });
    return m;
  }, [timesheets]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const toggleEmployeeExpand = (eid: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  };

  return (
    <div className="px-6 py-5 space-y-6">
      <PageHeaderSlot
        title="Timesheets"
        icon={Clock}
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditingEntry(null)}>
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        }
      />

      <KpiRow
        cols="grid-cols-2 md:grid-cols-4"
        stats={[
          { tone: 'primary', label: 'Total Hours This Week', value: stats ? `${stats.totalHoursThisWeek.toFixed(1)}h` : '—', icon: Clock },
          { tone: 'cat-2', label: 'Billable Hours This Month', value: stats ? `${stats.billableHoursThisMonth.toFixed(1)}h` : '—', icon: DollarSign },
          { tone: 'info', label: 'Pending Review', value: stats?.pendingReview ?? '—', icon: Send },
          { tone: 'cat-5', label: 'Total Entries', value: stats?.totalEntries ?? '—', icon: FileText },
        ]}
      />

      <div className="flex border-b border-slate-200 gap-6">
        {([
          { id: 'entries', label: 'Timesheet Entries', icon: Clock },
          { id: 'summary', label: 'Monthly Summary', icon: BarChart2 },
        ] as { id: TabId; label: string; icon: React.ElementType }[]).map(tab => (
          <button
            key={tab.id}
            className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'entries' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search project or task..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none bg-white"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {isAdmin && (
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none bg-white"
                  value={employeeFilter}
                  onChange={e => setEmployeeFilter(e.target.value)}
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none bg-white"
                value={billableFilter}
                onChange={e => setBillableFilter(e.target.value as typeof billableFilter)}
              >
                <option value="all">All Hours</option>
                <option value="billable">Billable Only</option>
                <option value="non-billable">Non-billable Only</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {isAdmin && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Employee</th>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Task</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Hours</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Billable</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-slate-400 text-sm">
                        Loading timesheets...
                      </td>
                    </tr>
                  ) : timesheets.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Clock className="w-8 h-8 text-slate-300" />
                          <p className="text-slate-500 text-sm font-medium">No timesheet entries found</p>
                          <p className="text-slate-400 text-xs">Click "New Entry" to add your first entry</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    timesheets.map(entry => (
                      <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 text-sm">
                              {entry.employee
                                ? `${entry.employee.first_name} ${entry.employee.last_name}`
                                : '—'}
                            </div>
                            {entry.employee?.employee_number && (
                              <div className="text-xs text-slate-400">{entry.employee.employee_number}</div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                          {format(parseISO(entry.work_date ?? ''), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 max-w-[150px] truncate">
                          {entry.project_name ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px]">
                          <span className="block truncate" title={entry.task_description ?? ''}>
                            {entry.task_description ?? <span className="text-slate-400">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-14 py-1 rounded-lg text-sm font-semibold tabular-nums bg-primary/10 text-primary">
                            {entry.hours}h
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getBillableBadge(entry.is_billable)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(entry.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {entry.status === 'draft' && (
                              <>
                                <button
                                  title="Edit"
                                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                  onClick={() => setEditingEntry(entry)}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {submitConfirmId === entry.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="px-2 py-1 text-xs font-medium text-info-foreground bg-info rounded-lg hover:bg-info/90 transition-colors"
                                      onClick={() => submitMutation.mutate(entry.id)}
                                      disabled={submitMutation.isPending}
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                      onClick={() => setSubmitConfirmId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    title="Submit for approval"
                                    className="p-1.5 text-slate-400 hover:text-info hover:bg-info-muted rounded-lg transition-colors"
                                    onClick={() => setSubmitConfirmId(entry.id)}
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                            {entry.status === 'submitted' && isAdmin && (
                              <>
                                <button
                                  title="Approve"
                                  className="p-1.5 text-slate-400 hover:text-success hover:bg-success-muted rounded-lg transition-colors"
                                  onClick={() => setApprovingEntry({ entry, action: 'approve' })}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  title="Reject"
                                  className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                                  onClick={() => setApprovingEntry({ entry, action: 'reject' })}
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {(entry.status === 'rejected') && (
                              <button
                                title="Edit"
                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                onClick={() => setEditingEntry(entry)}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {deletingId === entry.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  className="px-2 py-1 text-xs font-medium text-danger-foreground bg-danger rounded-lg hover:bg-danger/90 transition-colors"
                                  onClick={() => deleteMutation.mutate(entry.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  Delete
                                </button>
                                <button
                                  className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                  onClick={() => setDeletingId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                title="Delete"
                                className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                                onClick={() => setDeletingId(entry.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-slate-800">
                Current Week Overview — {format(weekStart, 'MMM d')} to {format(weekEnd, 'MMM d, yyyy')}
              </h3>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const hours = weekMap[key] ?? 0;
                const isToday = format(day, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
                return (
                  <div
                    key={key}
                    className={`rounded-xl p-3 text-center border transition-colors ${
                      isToday
                        ? 'border-primary/40 bg-primary/10'
                        : hours > 0
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-dashed border-slate-200 bg-white'
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-slate-500'}`}>
                      {format(day, 'EEE')}
                    </div>
                    <div className={`text-xs text-slate-400 mb-2`}>{format(day, 'd')}</div>
                    <div
                      className={`text-sm font-bold ${
                        hours >= 8
                          ? 'text-success'
                          : hours > 0
                          ? 'text-primary'
                          : 'text-slate-300'
                      }`}
                    >
                      {hours > 0 ? `${hours}h` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                value={summaryMonth}
                onChange={e => setSummaryMonth(Number(e.target.value))}
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                value={summaryYear}
                onChange={e => setSummaryYear(Number(e.target.value))}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none bg-white"
                  value={summaryEmployee}
                  onChange={e => setSummaryEmployee(e.target.value)}
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <TrendingUp className="w-4 h-4" />
              {months[summaryMonth - 1]} {summaryYear}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Employee</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Working Days</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Hours</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Billable</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Non-Billable</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Avg / Day</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                        Loading summary...
                      </td>
                    </tr>
                  ) : monthlySummary.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <BarChart2 className="w-8 h-8 text-slate-300" />
                          <p className="text-slate-500 text-sm font-medium">No data for this period</p>
                          <p className="text-slate-400 text-xs">No timesheet entries found for {months[summaryMonth - 1]} {summaryYear}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    monthlySummary.map(row => (
                      <>
                        <tr
                          key={row.employeeId}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => toggleEmployeeExpand(row.employeeId)}
                        >
                          <td className="px-4 py-3 text-slate-400">
                            {expandedEmployees.has(row.employeeId) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 text-sm">{row.employeeName}</div>
                            {row.employeeNumber && (
                              <div className="text-xs text-slate-400">{row.employeeNumber}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-700">{row.totalDays}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-semibold ${
                              row.totalHours >= 160 ? 'text-success' : row.totalHours >= 80 ? 'text-warning' : 'text-danger'
                            }`}>
                              {row.totalHours.toFixed(1)}h
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium text-success">
                            {row.billableHours.toFixed(1)}h
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-500">
                            {row.nonBillableHours.toFixed(1)}h
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">
                            {row.avgHoursPerDay.toFixed(1)}h
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {row.projects.slice(0, 3).map(p => (
                                <span key={p} className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
                                  {p}
                                </span>
                              ))}
                              {row.projects.length > 3 && (
                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                                  +{row.projects.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedEmployees.has(row.employeeId) && (
                          <tr key={`${row.employeeId}-detail`}>
                            <td colSpan={8} className="px-4 pb-3 bg-slate-50">
                              <div className="border border-slate-200 rounded-xl overflow-hidden mt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-white border-b border-slate-100">
                                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Date</th>
                                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Project</th>
                                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Task</th>
                                      <th className="text-center px-3 py-2 font-semibold text-slate-500">Hours</th>
                                      <th className="text-center px-3 py-2 font-semibold text-slate-500">Billable</th>
                                      <th className="text-center px-3 py-2 font-semibold text-slate-500">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.entries.map(e => (
                                      <tr key={e.id} className="border-b border-slate-50 last:border-0">
                                        <td className="px-3 py-2 text-slate-600">{format(parseISO(e.work_date ?? ''), 'MMM d')}</td>
                                        <td className="px-3 py-2 text-slate-600">{e.project_name ?? '—'}</td>
                                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{e.task_description ?? '—'}</td>
                                        <td className="px-3 py-2 text-center font-medium text-primary">{e.hours}h</td>
                                        <td className="px-3 py-2 text-center">{getBillableBadge(e.is_billable)}</td>
                                        <td className="px-3 py-2 text-center">{getStatusBadge(e.status)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {editingEntry !== undefined && (
        <TimesheetEntryModal
          entry={editingEntry}
          employees={employees}
          onClose={() => setEditingEntry(undefined)}
          onSave={() => setEditingEntry(undefined)}
          currentUserId={user?.id ?? ''}
          isAdmin={isAdmin}
        />
      )}

      {approvingEntry && (
        <ApproveRejectModal
          entry={approvingEntry.entry}
          action={approvingEntry.action}
          onClose={() => setApprovingEntry(null)}
          onDone={() => setApprovingEntry(null)}
          currentUserId={user?.id ?? ''}
        />
      )}
    </div>
  );
}
