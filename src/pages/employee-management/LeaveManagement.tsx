import React, { useState, useMemo } from 'react';
import { CalendarDays, Plus, RefreshCw, Search, Check, X, Trash2, Users, Clock, CalendarCheck, CalendarX, CreditCard as Edit2, Calendar, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addDays } from 'date-fns';
import { leaveService } from '../../lib/leaveService';
import type { LeaveRequestWithDetails } from '../../lib/leaveService';
import { leaveKeys } from '../../lib/queryKeys';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import type { Database } from '../../types/database.types';

type LeaveType = Database['public']['Tables']['master_leave_types']['Row'];
type Employee = Database['public']['Tables']['employees']['Row'];

const CURRENT_YEAR = new Date().getFullYear();

function getStatusBadge(status: string | null) {
  switch (status) {
    case 'approved':
      return <Badge variant="success" size="sm">Approved</Badge>;
    case 'rejected':
      return <Badge variant="danger" size="sm">Rejected</Badge>;
    case 'cancelled':
      return <Badge variant="secondary" size="sm">Cancelled</Badge>;
    default:
      return <Badge variant="warning" size="sm">Pending</Badge>;
  }
}

function calcBusinessDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = parseISO(start);
  const e = parseISO(end);
  if (e < s) return 0;
  let count = 0;
  let cur = s;
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur = addDays(cur, 1);
  }
  return count;
}

interface RequestLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  leaveTypes: LeaveType[];
  tenantId: string;
  isAdmin: boolean;
  onSuccess: () => void;
}

const RequestLeaveModal: React.FC<RequestLeaveModalProps> = ({
  isOpen,
  onClose,
  employees,
  leaveTypes,
  tenantId,
  isAdmin,
  onSuccess,
}) => {
  const toast = useToast();
  const [form, setForm] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const daysRequested = useMemo(
    () => calcBusinessDays(form.start_date, form.end_date),
    [form.start_date, form.end_date]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!tenantId) {
      toast.error('Tenant context missing — please reload');
      return;
    }
    setSubmitting(true);
    try {
      await leaveService.createLeaveRequest({
        tenant_id: tenantId,
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days: daysRequested,
        reason: form.reason || null,
        status: 'pending',
      });
      toast.success('Leave request submitted successfully');
      setForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' });
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Leave" icon={CalendarDays} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee <span className="text-danger">*</span></label>
            <select
              value={form.employee_id}
              onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} {emp.employee_number ? `(${emp.employee_number})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type <span className="text-danger">*</span></label>
          <select
            value={form.leave_type_id}
            onChange={e => setForm(p => ({ ...p, leave_type_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select leave type...</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>
                {lt.name} {lt.is_paid ? '(Paid)' : '(Unpaid)'} — {lt.default_days ?? 0} days/year
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date <span className="text-danger">*</span></label>
            <input
              type="date"
              value={form.start_date}
              onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date <span className="text-danger">*</span></label>
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
        </div>

        {form.start_date && form.end_date && (
          <div className="bg-info-muted border border-info/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <CalendarDays className="w-4 h-4 text-info shrink-0" />
            <span className="text-sm text-info font-medium">{daysRequested} working day{daysRequested !== 1 ? 's' : ''} requested</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
          <textarea
            value={form.reason}
            onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
            rows={3}
            placeholder="Optional reason for leave..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

interface ApproveRejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequestWithDetails | null;
  action: 'approve' | 'reject';
  currentUserId: string;
  onSuccess: () => void;
}

const ApproveRejectModal: React.FC<ApproveRejectModalProps> = ({
  isOpen,
  onClose,
  request,
  action,
  currentUserId,
  onSuccess,
}) => {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;
    setSubmitting(true);
    try {
      if (action === 'approve') {
        await leaveService.approveLeaveRequest(request.id, currentUserId, notes || undefined);
        toast.success('Leave request approved');
      } else {
        await leaveService.rejectLeaveRequest(request.id, currentUserId, notes || undefined);
        toast.success('Leave request rejected');
      }
      setNotes('');
      onSuccess();
      onClose();
    } catch {
      toast.error(`Failed to ${action} request`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
      icon={action === 'approve' ? Check : X}
      size="sm"
    >
      {request && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`rounded-lg p-4 border ${action === 'approve' ? 'bg-success-muted border-success/30' : 'bg-danger-muted border-danger/30'}`}>
            <p className="text-sm font-medium text-slate-800">
              {request.employee?.first_name} {request.employee?.last_name}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              {request.leave_type?.name} — {request.days} day{(request.days ?? 0) !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {request.start_date} to {request.end_date}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes {action === 'reject' && <span className="text-danger">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={action === 'approve' ? 'Optional approval notes...' : 'Reason for rejection...'}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              required={action === 'reject'}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={submitting}
              variant={action === 'approve' ? 'primary' : 'danger'}
              className={action === 'approve' ? 'bg-success hover:bg-success/90 focus:ring-success' : ''}
            >
              {submitting ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

interface LeaveTypeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingType: LeaveType | null;
  onSuccess: () => void;
}

const LeaveTypeFormModal: React.FC<LeaveTypeFormModalProps> = ({ isOpen, onClose, editingType, onSuccess }) => {
  const toast = useToast();
  const [form, setForm] = useState({
    name: editingType?.name ?? '',
    description: editingType?.description ?? '',
    default_days: editingType?.default_days ?? 0,
    is_paid: editingType?.is_paid ?? true,
    is_active: editingType?.is_active ?? true,
  });
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setForm({
      name: editingType?.name ?? '',
      description: editingType?.description ?? '',
      default_days: editingType?.default_days ?? 0,
      is_paid: editingType?.is_paid ?? true,
      is_active: editingType?.is_active ?? true,
    });
  }, [editingType, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      if (editingType) {
        await leaveService.updateLeaveType(editingType.id, form);
        toast.success('Leave type updated');
      } else {
        await leaveService.createLeaveType(form);
        toast.success('Leave type created');
      }
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to save leave type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingType ? 'Edit Leave Type' : 'New Leave Type'} icon={FileText} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-danger">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Annual Leave"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2}
            placeholder="Optional description..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Days Per Year</label>
          <input
            type="number"
            value={form.default_days}
            onChange={e => setForm(p => ({ ...p, default_days: Number(e.target.value) }))}
            min={0}
            max={365}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={form.is_paid}
              onChange={e => setForm(p => ({ ...p, is_paid: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <span className="text-sm font-medium text-slate-800">Paid Leave</span>
              <p className="text-xs text-slate-500">Employee receives pay</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <span className="text-sm font-medium text-slate-800">Active</span>
              <p className="text-xs text-slate-500">Available for requests</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary">
            {submitting ? 'Saving...' : editingType ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

interface AllocateBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  leaveTypes: LeaveType[];
  tenantId: string;
  onSuccess: () => void;
}

const AllocateBalanceModal: React.FC<AllocateBalanceModalProps> = ({
  isOpen,
  onClose,
  employees,
  leaveTypes,
  tenantId,
  onSuccess,
}) => {
  const toast = useToast();
  const [form, setForm] = useState({
    employee_id: '',
    leave_type_id: '',
    year: CURRENT_YEAR,
    total_days: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id || !form.leave_type_id) {
      toast.error('Please select employee and leave type');
      return;
    }
    if (!tenantId) {
      toast.error('Tenant context missing — please reload');
      return;
    }
    setSubmitting(true);
    try {
      await leaveService.upsertLeaveBalance({
        tenant_id: tenantId,
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        year: form.year,
        total_days: form.total_days,
        used_days: 0,
        remaining_days: form.total_days,
      });
      toast.success('Leave balance allocated');
      setForm({ employee_id: '', leave_type_id: '', year: CURRENT_YEAR, total_days: 0 });
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to allocate balance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Allocate Leave Balance" icon={CalendarCheck} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Employee <span className="text-danger">*</span></label>
          <select
            value={form.employee_id}
            onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select employee...</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name} {emp.employee_number ? `(${emp.employee_number})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type <span className="text-danger">*</span></label>
          <select
            value={form.leave_type_id}
            onChange={e => setForm(p => ({ ...p, leave_type_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select leave type...</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
            <input
              type="number"
              value={form.year}
              onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))}
              min={2020}
              max={2099}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Days Allocated</label>
            <input
              type="number"
              value={form.total_days}
              onChange={e => setForm(p => ({ ...p, total_days: Number(e.target.value) }))}
              min={0}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary">
            {submitting ? 'Allocating...' : 'Allocate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

type TabId = 'requests' | 'balances' | 'types';

export const LeaveManagement: React.FC = () => {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'hr';

  const [activeTab, setActiveTab] = useState<TabId>('requests');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showApproveRejectModal, setShowApproveRejectModal] = useState(false);
  const [approveRejectAction, setApproveRejectAction] = useState<'approve' | 'reject'>('approve');
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestWithDetails | null>(null);
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: leaveKeys.stats(),
    queryFn: () => leaveService.getLeaveStats(),
  });

  const { data: leaveTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: leaveKeys.types(),
    queryFn: () => leaveService.getLeaveTypes(),
  });

  const { data: employees = [] } = useQuery({
    queryKey: leaveKeys.employees(),
    queryFn: () => leaveService.getEmployees(),
  });

  const requestFilters = {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    leaveTypeId: leaveTypeFilter !== 'all' ? leaveTypeFilter : undefined,
    employeeId: employeeFilter !== 'all' ? employeeFilter : undefined,
    year: yearFilter,
  };

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: leaveKeys.requests(requestFilters),
    queryFn: () => leaveService.getLeaveRequests(requestFilters),
  });

  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: leaveKeys.balances({ year: yearFilter, employeeId: employeeFilter !== 'all' ? employeeFilter : undefined }),
    queryFn: () => leaveService.getLeaveBalances({
      year: yearFilter,
      employeeId: employeeFilter !== 'all' ? employeeFilter : undefined,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leaveService.deleteLeaveRequest(id),
    onSuccess: () => {
      toast.success('Leave request deleted');
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast.error('Failed to delete request');
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: leaveKeys.all });
  };

  const filteredRequests = useMemo(() => {
    if (!search.trim()) return requests;
    const s = search.toLowerCase();
    return requests.filter(r =>
      `${r.employee?.first_name} ${r.employee?.last_name}`.toLowerCase().includes(s) ||
      r.leave_type?.name?.toLowerCase().includes(s) ||
      r.reason?.toLowerCase().includes(s)
    );
  }, [requests, search]);

  const filteredBalances = useMemo(() => {
    if (!search.trim()) return balances;
    const s = search.toLowerCase();
    return balances.filter(b =>
      `${b.employee?.first_name} ${b.employee?.last_name}`.toLowerCase().includes(s) ||
      b.leave_type?.name?.toLowerCase().includes(s)
    );
  }, [balances, search]);

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return leaveTypes;
    const s = search.toLowerCase();
    return leaveTypes.filter(t => t.name.toLowerCase().includes(s));
  }, [leaveTypes, search]);

  const openApprove = (req: LeaveRequestWithDetails) => {
    setSelectedRequest(req);
    setApproveRejectAction('approve');
    setShowApproveRejectModal(true);
  };

  const openReject = (req: LeaveRequestWithDetails) => {
    setSelectedRequest(req);
    setApproveRejectAction('reject');
    setShowApproveRejectModal(true);
  };

  const activeLeaveTypes = leaveTypes.filter(lt => lt.is_active);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'requests', label: 'Leave Requests', icon: CalendarDays },
    { id: 'balances', label: 'Leave Balances', icon: CalendarCheck },
    { id: 'types', label: 'Leave Types', icon: FileText },
  ];

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Leave Management"
        icon={CalendarDays}
        actions={
          <>
            <Button
              onClick={() => { invalidateAll(); }}
              variant="secondary"
              size="sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={() => setShowRequestModal(true)}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Request Leave
            </Button>
          </>
        }
      />

      <KpiRow
        cols="grid-cols-2 md:grid-cols-4"
        stats={[
          { label: 'Pending', value: stats?.pendingApprovals ?? 0, tone: 'warning', icon: Clock, loading: statsLoading },
          { label: 'Approved This Month', value: stats?.approvedThisMonth ?? 0, tone: 'success', icon: CalendarCheck, loading: statsLoading },
          { label: 'Rejected This Month', value: stats?.rejectedThisMonth ?? 0, tone: 'danger', icon: CalendarX, loading: statsLoading },
          { label: 'On Leave Today', value: stats?.employeesOnLeaveToday ?? 0, tone: 'info', icon: Users, loading: statsLoading },
        ]}
      />


      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="flex items-center justify-between px-6 pt-4">
            <div className="flex gap-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setSearch(''); }}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={activeTab === 'requests' ? 'Search by employee, leave type...' : activeTab === 'balances' ? 'Search employee or type...' : 'Search leave types...'}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {(activeTab === 'requests' || activeTab === 'balances') && (
              <>
                <select
                  value={yearFilter}
                  onChange={e => setYearFilter(Number(e.target.value))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                {isAdmin && (
                  <select
                    value={employeeFilter}
                    onChange={e => setEmployeeFilter(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  >
                    <option value="all">All Employees</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            {activeTab === 'requests' && (
              <>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={leaveTypeFilter}
                  onChange={e => setLeaveTypeFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="all">All Types</option>
                  {leaveTypes.map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
                </select>
              </>
            )}

            {activeTab === 'balances' && isAdmin && (
              <Button
                size="sm"
                onClick={() => setShowAllocateModal(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary ml-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                Allocate Balance
              </Button>
            )}

            {activeTab === 'types' && isAdmin && (
              <Button
                size="sm"
                onClick={() => { setEditingLeaveType(null); setShowLeaveTypeModal(true); }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary ml-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Leave Type
              </Button>
            )}
          </div>

          {activeTab === 'requests' && (
            <div>
              {requestsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <CalendarDays className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="font-medium">No leave requests found</p>
                  <p className="text-sm mt-1">Try adjusting your filters or submit a new request</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Employee</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Leave Type</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Duration</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Days</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Reason</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Submitted</th>
                        {isAdmin && <th className="text-right py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map(req => (
                        <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="text-sm font-semibold text-slate-900">
                              {req.employee?.first_name} {req.employee?.last_name}
                            </div>
                            {req.employee?.employee_number && (
                              <div className="text-xs text-slate-500">{req.employee.employee_number}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-800">{req.leave_type?.name ?? '—'}</span>
                            {req.leave_type?.is_paid !== null && (
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${req.leave_type?.is_paid ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-600'}`}>
                                {req.leave_type?.is_paid ? 'Paid' : 'Unpaid'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div>{req.start_date}</div>
                            <div className="text-xs text-slate-400">to {req.end_date}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{req.days ?? 0}</span>
                            <span className="text-slate-500 text-xs ml-1">day{(req.days ?? 0) !== 1 ? 's' : ''}</span>
                          </td>
                          <td className="py-3 px-4 max-w-[180px]">
                            <span className="text-slate-600 truncate block" title={req.reason ?? ''}>
                              {req.reason || <span className="text-slate-400 italic">—</span>}
                            </span>
                          </td>
                          <td className="py-3 px-4">{getStatusBadge(req.status)}</td>
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {req.created_at ? format(parseISO(req.created_at), 'MMM d, yyyy') : '—'}
                          </td>
                          {isAdmin && (
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                {req.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => openApprove(req)}
                                      className="p-1.5 rounded-lg text-success hover:bg-success-muted transition-colors"
                                      title="Approve"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => openReject(req)}
                                      className="p-1.5 rounded-lg text-danger hover:bg-danger-muted transition-colors"
                                      title="Reject"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {deleteConfirmId === req.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => deleteMutation.mutate(req.id)}
                                      className="text-xs px-2 py-1 bg-danger text-danger-foreground rounded hover:bg-danger/90 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(req.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-danger hover:bg-danger-muted transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'balances' && (
            <div>
              {balancesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : filteredBalances.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <CalendarCheck className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="font-medium">No leave balances found</p>
                  <p className="text-sm mt-1">Allocate leave balances to employees to track their entitlements</p>
                  {isAdmin && (
                    <Button
                      size="sm"
                      onClick={() => setShowAllocateModal(true)}
                      className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Allocate Balance
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Employee</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Leave Type</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Year</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Allocated</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Used</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Remaining</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Usage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBalances.map(bal => {
                        const allocated = bal.total_days ?? 0;
                        const used = bal.used_days ?? 0;
                        const remaining = bal.remaining_days ?? (allocated - used);
                        const pct = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
                        const barColor = pct >= 80 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-primary';
                        const remainingColor = remaining <= 0 ? 'text-danger font-bold' : remaining <= (allocated * 0.2) ? 'text-warning font-semibold' : 'text-success font-semibold';

                        return (
                          <tr key={bal.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="text-sm font-semibold text-slate-900">
                                {bal.employee?.first_name} {bal.employee?.last_name}
                              </div>
                              {bal.employee?.employee_number && (
                                <div className="text-xs text-slate-500">{bal.employee.employee_number}</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-medium text-slate-800">{bal.leave_type?.name ?? '—'}</span>
                              {bal.leave_type?.is_paid !== null && (
                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${bal.leave_type?.is_paid ? 'bg-success-muted text-success' : 'bg-slate-100 text-slate-600'}`}>
                                  {bal.leave_type?.is_paid ? 'Paid' : 'Unpaid'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{bal.year}</td>
                            <td className="py-3 px-4 text-slate-700">{allocated} days</td>
                            <td className="py-3 px-4 text-slate-700">{used} days</td>
                            <td className={`py-3 px-4 ${remainingColor}`}>{remaining} days</td>
                            <td className="py-3 px-4 min-w-[120px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-500 shrink-0">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'types' && (
            <div>
              {typesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : filteredTypes.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="font-medium">No leave types defined</p>
                  <p className="text-sm mt-1">Create leave types to enable employees to submit requests</p>
                  {isAdmin && (
                    <Button
                      size="sm"
                      onClick={() => { setEditingLeaveType(null); setShowLeaveTypeModal(true); }}
                      className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Leave Type
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTypes.map(lt => (
                    <div
                      key={lt.id}
                      className={`rounded-xl border p-5 transition-all ${lt.is_active ? 'bg-white border-slate-200 hover:border-primary/40 hover:shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${lt.is_active ? 'bg-primary/10' : 'bg-slate-200'}`}>
                            <Calendar className={`w-4 h-4 ${lt.is_active ? 'text-primary' : 'text-slate-500'}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900 text-sm">{lt.name}</h3>
                            <div className="flex gap-1.5 mt-0.5">
                              {lt.is_paid ? (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-success-muted text-success font-medium">Paid</span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">Unpaid</span>
                              )}
                              {!lt.is_active && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-danger-muted text-danger font-medium">Inactive</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => { setEditingLeaveType(lt); setShowLeaveTypeModal(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {lt.description && (
                        <p className="text-xs text-slate-600 mb-3">{lt.description}</p>
                      )}
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-800">{lt.default_days ?? 0}</span>
                        <span className="text-xs text-slate-500">days per year</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <RequestLeaveModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        employees={employees}
        leaveTypes={activeLeaveTypes}
        tenantId={profile?.tenant_id ?? ''}
        isAdmin={isAdmin}
        onSuccess={invalidateAll}
      />

      <ApproveRejectModal
        isOpen={showApproveRejectModal}
        onClose={() => { setShowApproveRejectModal(false); setSelectedRequest(null); }}
        request={selectedRequest}
        action={approveRejectAction}
        currentUserId={profile?.id ?? ''}
        onSuccess={invalidateAll}
      />

      <LeaveTypeFormModal
        isOpen={showLeaveTypeModal}
        onClose={() => { setShowLeaveTypeModal(false); setEditingLeaveType(null); }}
        editingType={editingLeaveType}
        onSuccess={invalidateAll}
      />

      <AllocateBalanceModal
        isOpen={showAllocateModal}
        onClose={() => setShowAllocateModal(false)}
        employees={employees}
        leaveTypes={leaveTypes}
        tenantId={profile?.tenant_id ?? ''}
        onSuccess={invalidateAll}
      />
    </div>
  );
};
