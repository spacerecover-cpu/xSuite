import React, { useMemo, useState } from 'react';
import { Users, Trash2, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { Modal } from '../../ui/Modal';
import { EngineerSelector } from '../EngineerSelector';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { formatDate } from '@/lib/format';

interface CaseEngineerAssignment {
  id: string;
  user_id?: string | null;
  role_text?: string | null;
  created_at: string;
  engineer?: {
    full_name: string;
    role: string;
  };
}

interface CaseEngineersTabProps {
  caseId: string;
  caseEngineers: CaseEngineerAssignment[];
}

export const CaseEngineersTab: React.FC<CaseEngineersTabProps> = ({ caseId, caseEngineers }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [roleText, setRoleText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Resolve engineer names from profiles (FK join was removed, so we look up here).
  const engineerUserIds = useMemo(
    () => Array.from(new Set(caseEngineers.map((e) => e.user_id).filter((v): v is string => !!v))),
    [caseEngineers],
  );

  const { data: engineerProfiles = [] } = useQuery({
    queryKey: ['profiles_by_ids', 'case_engineers', engineerUserIds.slice().sort().join(',')],
    queryFn: async () => {
      if (engineerUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', engineerUserIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: engineerUserIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, { full_name: string; role: string }>();
    for (const p of engineerProfiles) {
      map.set(p.id, { full_name: p.full_name ?? 'Unknown', role: p.role ?? '' });
    }
    return map;
  }, [engineerProfiles]);

  const addEngineerMutation = useMutation({
    mutationFn: async ({ engineerId, role }: { engineerId: string; role: string }) => {
      const { error } = await supabase.from('case_engineers').insert({
        case_id: caseId,
        user_id: engineerId,
        role_text: role || null,
        // tenant_id is populated by the set_tenant_and_audit_fields trigger.
        tenant_id: undefined as unknown as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Engineer assigned to case');
      queryClient.invalidateQueries({ queryKey: ['case_engineers', caseId] });
      setShowAddModal(false);
      setSelectedEngineerId(null);
      setRoleText('');
    },
    onError: (err: unknown) => {
      toast.error(`Failed to assign engineer: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const removeEngineerMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('case_engineers').delete().eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Engineer removed from case');
      queryClient.invalidateQueries({ queryKey: ['case_engineers', caseId] });
    },
    onError: (err: unknown) => {
      toast.error(`Failed to remove engineer: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const handleAdd = () => {
    if (!selectedEngineerId) {
      toast.error('Please select an engineer');
      return;
    }
    addEngineerMutation.mutate({ engineerId: selectedEngineerId, role: roleText });
  };

  const handleRemove = async (assignmentId: string, name: string) => {
    if (!(await confirm({ title: 'Remove Engineer', message: `Remove ${name} from this case?`, tone: 'danger' }))) return;
    setRemovingId(assignmentId);
    try {
      await removeEngineerMutation.mutateAsync(assignmentId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <>
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">Assigned Engineers</h2>
            <Button
              style={{ backgroundColor: 'rgb(var(--color-primary))' }}
              size="sm"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Engineer
            </Button>
          </div>

          {caseEngineers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium mb-1">No engineers assigned yet</p>
              <p className="text-sm text-slate-400 mb-4">Assign engineers to track who is working on this case</p>
              <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Assign First Engineer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {caseEngineers.map((assignment) => {
                const resolved =
                  (assignment.user_id ? profileMap.get(assignment.user_id) : undefined) ??
                  assignment.engineer ??
                  { full_name: 'Unknown', role: '' };
                const fullName = resolved.full_name || 'Unknown';
                return (
                  <div key={assignment.id} className="border border-slate-200 rounded-lg p-4 flex items-center gap-4 bg-white hover:border-primary/40 transition-colors">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{fullName}</p>
                      {assignment.role_text && (
                        <p className="text-sm text-slate-500">{assignment.role_text}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        Assigned {formatDate(assignment.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {resolved.role && (
                        <Badge variant="custom" color="rgb(var(--color-primary))" size="sm">
                          {resolved.role}
                        </Badge>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRemove(assignment.id, fullName)}
                        disabled={removingId === assignment.id}
                        title="Remove engineer"
                      >
                        {removingId === assignment.id ? (
                          <div className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-danger" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedEngineerId(null);
          setRoleText('');
        }}
        title="Assign Engineer"
        icon={Users}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Engineer</label>
            <EngineerSelector
              value={selectedEngineerId}
              onChange={(id) => setSelectedEngineerId(id)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role on Case <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="e.g. Lead Technician, QA Reviewer..."
              className="h-9 w-full px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddModal(false);
                setSelectedEngineerId(null);
                setRoleText('');
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              style={{ backgroundColor: 'rgb(var(--color-primary))' }}
              disabled={!selectedEngineerId || addEngineerMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-2" />
              {addEngineerMutation.isPending ? 'Assigning...' : 'Assign Engineer'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
