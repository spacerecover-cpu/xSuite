import React, { useState } from 'react';
import { UserCheck, ClipboardList, AlertTriangle, CheckCircle2, Plus, ChevronDown, ChevronRight, Clock, User, CreditCard as Edit2, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { KpiRow } from '../../components/templates/KpiRow';
import { employeeOnboardingKeys } from '../../lib/queryKeys';
import {
  getChecklists,
  getEmployeesWithTasks,
  getOnboardingStats,
  completeTask,
  updateTask,
  deleteChecklist,
  type ChecklistWithItems,
  type EmployeeWithTasks,
  type TaskWithDetails,
} from '../../lib/employeeOnboardingService';
import { ChecklistFormModal } from '../../components/onboarding/ChecklistFormModal';
import { AssignChecklistModal } from '../../components/onboarding/AssignChecklistModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';

const taskStatusColor: Record<string, string> = {
  pending: 'text-slate-500',
  in_progress: 'text-primary',
  completed: 'text-success',
  skipped: 'text-slate-400',
};

const taskStatusBg: Record<string, string> = {
  pending: 'bg-slate-100 border-slate-200',
  in_progress: 'bg-primary/10 border-primary/30',
  completed: 'bg-success-muted border-success/30',
  skipped: 'bg-slate-50 border-slate-200',
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-slate-200 rounded-full h-2">
      <div
        className="bg-primary h-2 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: TaskWithDetails;
  onToggle: (id: string, status: string) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue =
    task.status !== 'completed' &&
    task.due_date &&
    task.due_date < today;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${taskStatusBg[task.status || 'pending']}`}
    >
      <button
        onClick={() =>
          onToggle(task.id, task.status === 'completed' ? 'pending' : 'completed')
        }
        className="mt-0.5 flex-shrink-0"
      >
        {task.status === 'completed' ? (
          <CheckCircle2 className="w-5 h-5 text-success" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-primary transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'
          }`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          {task.due_date && (
            <span
              className={`flex items-center gap-1 text-xs ${
                isOverdue ? 'text-danger font-medium' : 'text-slate-500'
              }`}
            >
              {isOverdue && <AlertTriangle className="w-3 h-3" />}
              <Clock className="w-3 h-3" />
              Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {task.onboarding_checklist_items?.assigned_to_role && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <User className="w-3 h-3" />
              {task.onboarding_checklist_items.assigned_to_role}
            </span>
          )}
        </div>
      </div>
      <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${taskStatusColor[task.status || 'pending']}`}>
        {(task.status || 'pending').replace('_', ' ')}
      </div>
    </div>
  );
}

function EmployeeOnboardingCard({
  employee,
  onAssign,
  onToggleTask,
}: {
  employee: EmployeeWithTasks;
  onAssign: (id: string) => void;
  onToggleTask: (taskId: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const completionPct =
    employee.task_count > 0
      ? Math.round((employee.completed_count / employee.task_count) * 100)
      : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cat-7 to-cat-7/80 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {(employee.first_name?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                {employee.first_name} {employee.last_name}
              </h3>
              {employee.employee_number && (
                <p className="text-xs text-slate-500">{employee.employee_number}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {employee.overdue_count > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-danger bg-danger-muted px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {employee.overdue_count} overdue
              </span>
            )}
            <button
              onClick={() => onAssign(employee.id)}
              className="text-xs font-medium text-primary hover:text-primary/90 px-2.5 py-1 hover:bg-primary/10 rounded-lg transition-colors"
            >
              + Assign
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>
              {employee.completed_count} of {employee.task_count} tasks
            </span>
            <span className="font-medium text-slate-700">{completionPct}%</span>
          </div>
          <ProgressBar value={completionPct} />
        </div>
      </div>

      {expanded && employee.tasks.length > 0 && (
        <div className="border-t border-slate-100 p-4 space-y-2 bg-slate-50">
          {employee.tasks.map(task => (
            <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
          ))}
        </div>
      )}

      {expanded && employee.tasks.length === 0 && (
        <div className="border-t border-slate-100 p-4 text-center text-sm text-slate-400 bg-slate-50">
          No tasks assigned yet.
        </div>
      )}
    </div>
  );
}

function ChecklistCard({
  checklist,
  onEdit,
  onDelete,
}: {
  checklist: ChecklistWithItems;
  onEdit: (c: ChecklistWithItems) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm truncate">{checklist.name}</h3>
          {checklist.positions && (
            <p className="text-xs text-slate-500 mt-0.5">For: {checklist.positions.title}</p>
          )}
          {checklist.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{checklist.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3">
          {checklist.is_default && (
            <span className="text-xs font-medium text-info bg-info-muted px-2 py-0.5 rounded-full">
              Default
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <ClipboardList className="w-4 h-4" />
          <span>{checklist.item_count || 0} tasks</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(checklist)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(checklist.id)}
            className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const EmployeeOnboardingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'active' | 'templates'>('active');
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState<ChecklistWithItems | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState<string | undefined>();

  const { data: stats } = useQuery({
    queryKey: employeeOnboardingKeys.stats(),
    queryFn: getOnboardingStats,
  });

  const { data: employeesWithTasks = [], isLoading: loadingEmployees } = useQuery({
    queryKey: employeeOnboardingKeys.tasks(),
    queryFn: getEmployeesWithTasks,
    enabled: activeTab === 'active',
  });

  const { data: checklists = [], isLoading: loadingChecklists } = useQuery({
    queryKey: employeeOnboardingKeys.checklists(),
    queryFn: getChecklists,
    enabled: activeTab === 'templates',
  });

  const toggleTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      if (status === 'completed') {
        return completeTask(id);
      }
      return updateTask(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeOnboardingKeys.all });
    },
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: deleteChecklist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeOnboardingKeys.all });
      toast.success('Checklist deleted');
    },
  });

  const handleAssign = (employeeId?: string) => {
    setAssignEmployeeId(employeeId);
    setShowAssignModal(true);
  };

  return (
    <div className="px-6 py-5 max-w-[1800px] mx-auto">
      <PageHeaderSlot
        title="Employee Onboarding"
        icon={UserCheck}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => handleAssign(undefined)}>
              <Plus className="w-4 h-4 mr-2" />
              Assign Checklist
            </Button>
            {activeTab === 'templates' && (
              <Button size="sm" onClick={() => { setEditingChecklist(null); setShowChecklistModal(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                New Checklist
              </Button>
            )}
          </>
        }
      />

      <KpiRow
        stats={[
          { tone: 'info', label: 'Active Onboardees', value: stats?.activeOnboardees ?? '–', icon: UserCheck },
          { tone: 'danger', label: 'Overdue Tasks', value: stats?.overdueTasksCount ?? '–', icon: AlertTriangle },
          { tone: 'success', label: 'Completion Rate', value: stats?.completionRate != null ? `${stats.completionRate}%` : '–', icon: CheckCircle2 },
          { tone: 'primary', label: 'Templates', value: checklists.length || '–', icon: ClipboardList },
        ]}
      />

      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {(['active', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'active' ? 'Active Onboarding' : 'Checklist Templates'}
          </button>
        ))}
      </div>

      {activeTab === 'active' && (
        <>
          {loadingEmployees ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : employeesWithTasks.length === 0 ? (
            <div className="text-center py-16">
              <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-3">No active onboarding in progress.</p>
              <Button onClick={() => handleAssign(undefined)}>
                <Plus className="w-4 h-4 mr-2" />
                Assign First Checklist
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {employeesWithTasks.map(employee => (
                <EmployeeOnboardingCard
                  key={employee.id}
                  employee={employee}
                  onAssign={id => handleAssign(id)}
                  onToggleTask={(id, status) => toggleTaskMutation.mutate({ id, status })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'templates' && (
        <>
          {loadingChecklists ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : checklists.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-3">No checklists yet. Create your first onboarding template.</p>
              <Button onClick={() => { setEditingChecklist(null); setShowChecklistModal(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Checklist
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {checklists.map(checklist => (
                <ChecklistCard
                  key={checklist.id}
                  checklist={checklist}
                  onEdit={c => { setEditingChecklist(c); setShowChecklistModal(true); }}
                  onDelete={async id => {
                    const ok = await confirm({
                      title: 'Delete Checklist',
                      message: 'Delete this checklist?',
                      confirmLabel: 'Delete',
                      tone: 'danger',
                    });
                    if (ok) {
                      deleteChecklistMutation.mutate(id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ChecklistFormModal
        isOpen={showChecklistModal}
        onClose={() => { setShowChecklistModal(false); setEditingChecklist(null); }}
        checklist={editingChecklist}
      />

      <AssignChecklistModal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setAssignEmployeeId(undefined); }}
        preselectedEmployeeId={assignEmployeeId}
      />
    </div>
  );
};
