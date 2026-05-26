import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { createPayment } from '@/lib/paymentsService';
import { deleteCaseService } from '@/lib/caseService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { logger } from '../../../lib/logger';
import type { Database } from '@/types/database.types';

type CaseRow = Database['public']['Tables']['cases']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];
type CaseUpdate = Database['public']['Tables']['cases']['Update'];
type CaseDeviceInsert = Database['public']['Tables']['case_devices']['Insert'];
type CaseDeviceUpdate = Database['public']['Tables']['case_devices']['Update'];
type CustomerUpdate = Database['public']['Tables']['customers_enhanced']['Update'];
type CloneDriveUpdate = Database['public']['Tables']['clone_drives']['Update'];

// Shape duplicateCaseMutation reads from each source device row. Keys mirror
// the case_devices.Row columns the query in useCaseQueries currently selects;
// anything missing from the query is simply absent on the source object.
type DuplicateDeviceSource = Partial<{
  id: string;
  device_type_id: string | null;
  brand_id: string | null;
  model: string | null;
  serial_number: string | null;
  capacity_id: string | null;
  condition_id: string | null;
  accessories: string[] | null;
  symptoms: string | null;
  notes: string | null;
  password: string | null;
  encryption_id: string | null;
  device_role_id: number | null;
  is_primary: boolean | null;
  role_notes: string | null;
}>;

interface UseCaseMutationsParams {
  id: string | undefined;
  caseData: (Partial<CaseRow> & { customer_id?: string | null }) | null | undefined;
  devices: DuplicateDeviceSource[];
  modals: {
    setNewNote: (v: string) => void;
    setShowRecordPaymentModal: (v: boolean) => void;
    setSelectedInvoiceForPayment: (v: unknown) => void;
    setShowMarkAsDeliveredModal: (v: boolean) => void;
    setSelectedClone: (v: unknown) => void;
    setShowPreserveLongTermModal: (v: boolean) => void;
    setShowDuplicateModal: (v: boolean) => void;
    setShowDeleteModal: (v: boolean) => void;
  };
}

const requireCaseId = (id: string | undefined): string => {
  if (!id) throw new Error('Case ID is required');
  return id;
};

const requireTenantId = (tenantId: string | null | undefined): string => {
  if (!tenantId) throw new Error('Tenant ID is required (no active session)');
  return tenantId;
};

// clone_drives has no dedicated delivery/retention/preserve columns. To avoid
// losing user-entered metadata we fold it into the existing notes column as a
// human-readable structured block.
const buildDeliveryNotes = (params: {
  retentionDays: number;
  deliveryDate: Date;
  retentionDeadline: Date;
  deliveredByProfileId: string | null | undefined;
  freeformNotes: string;
}): string => {
  const lines = [
    `Delivered: ${params.deliveryDate.toISOString()}`,
    `Retention days: ${params.retentionDays}`,
    `Retention deadline: ${params.retentionDeadline.toISOString()}`,
  ];
  if (params.deliveredByProfileId) {
    lines.push(`Delivered by: ${params.deliveredByProfileId}`);
  }
  if (params.freeformNotes) {
    lines.push(`Notes: ${params.freeformNotes}`);
  }
  return lines.join('\n');
};

const buildPreserveNotes = (preserveReason: string): string => {
  return `Preserved long-term. Reason: ${preserveReason}`;
};

export function useCaseMutations({ id, caseData, devices, modals }: UseCaseMutationsParams) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();

  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const caseId = requireCaseId(id);
      const tenantId = requireTenantId(profile?.tenant_id);
      const { error } = await supabase
        .from('case_internal_notes')
        .insert({
          case_id: caseId,
          tenant_id: tenantId,
          created_by: profile?.id ?? null,
          content: noteText,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_notes', id] });
      modals.setNewNote('');
    },
  });

  const updateCaseStatusMutation = useMutation({
    // The state-machine guard trigger blocks direct UPDATE cases.status,
    // so this mutation now routes through transition_case_status RPC which
    // validates the phase edge + role allowlist, writes case_job_history,
    // and emits notification_events. Caller still passes the status NAME
    // (legacy API surface) — we resolve to status_id internally.
    mutationFn: async (newStatus: string) => {
      const caseId = requireCaseId(id);

      const { data: target, error: lookupError } = await supabase
        .from('master_case_statuses')
        .select('id')
        .eq('name', newStatus)
        .maybeSingle();
      if (lookupError) {
        logger.error('Failed to resolve status name', lookupError, newStatus);
        throw lookupError;
      }
      if (!target?.id) {
        throw new Error(`Unknown case status: ${newStatus}`);
      }

      const { data, error } = await supabase.rpc('transition_case_status', {
        p_case_id: caseId,
        p_to_status_id: target.id,
      });
      if (error) {
        logger.error('transition_case_status failed', error, { caseId, newStatus });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['case_history', id] });
    },
    onError: (error) => {
      logger.error('Status update failed:', error);
      toast.error('Failed to update status. Please try again.');
    },
  });

  const updateCasePriorityMutation = useMutation({
    mutationFn: async (newPriority: string) => {
      const caseId = requireCaseId(id);
      const { data, error } = await supabase
        .from('cases')
        .update({ priority: newPriority, updated_at: new Date().toISOString() })
        .eq('id', caseId)
        .select();

      if (error) {
        logger.error('Error updating priority:', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['case_history', id] });
    },
    onError: (error) => {
      logger.error('Priority update failed:', error);
      toast.error('Failed to update priority. Please try again.');
    },
  });

  const updateAssignedEngineerMutation = useMutation({
    mutationFn: async (newEngineerId: string | null) => {
      const caseId = requireCaseId(id);
      // Schema retains both `assigned_engineer_id` and `assigned_to`. The detail
      // page reads `assigned_engineer_id` (see useCaseQueries.ts) so we MUST
      // write it; mirroring to `assigned_to` keeps legacy callers in sync.
      const { data, error } = await supabase
        .from('cases')
        .update({
          assigned_engineer_id: newEngineerId,
          assigned_to: newEngineerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId)
        .select();

      if (error) {
        logger.error('Error updating assigned engineer:', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['case_history', id] });
    },
    onError: (error) => {
      logger.error('Assigned engineer update failed:', error);
      toast.error('Failed to update assigned engineer. Please try again.');
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async ({
      paymentData,
      allocations,
    }: {
      paymentData: Omit<import('@/lib/paymentsService').Payment, 'id' | 'payment_number' | 'created_at' | 'updated_at'>;
      allocations: Array<{ invoice_id: string; amount: number }>;
    }) => {
      return createPayment(paymentData, allocations);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', 'case', id] });
      queryClient.invalidateQueries({ queryKey: ['case_financial_summary', id] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      modals.setShowRecordPaymentModal(false);
      modals.setSelectedInvoiceForPayment(null);
    },
  });

  const updateCaseInfoMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const caseId = requireCaseId(id);
      const { error } = await supabase
        .from('cases')
        .update(updates as CaseUpdate)
        .eq('id', caseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const updateDeviceInfoMutation = useMutation({
    mutationFn: async ({ deviceId, updates }: { deviceId: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('case_devices')
        .update(updates as CaseDeviceUpdate)
        .eq('id', deviceId);

      if (error) {
        logger.error('Error updating device:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_devices', id] });
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const updateCustomerInfoMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const customerId = caseData?.customer_id;
      if (!customerId) throw new Error('Customer ID is required');
      const { error } = await supabase
        .from('customers_enhanced')
        .update(updates as CustomerUpdate)
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
    },
  });

  const markAsDeliveredMutation = useMutation({
    mutationFn: async ({ cloneId, updateCaseStatus, deliveryNotes, retentionDays }: { cloneId: string; updateCaseStatus: boolean; deliveryNotes: string; retentionDays: number }) => {
      const deliveryDate = new Date();
      const retentionDeadline = new Date(deliveryDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);

      const cloneUpdate: CloneDriveUpdate = {
        status: 'delivered',
        notes: buildDeliveryNotes({
          retentionDays,
          deliveryDate,
          retentionDeadline,
          deliveredByProfileId: profile?.id,
          freeformNotes: deliveryNotes,
        }),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('clone_drives')
        .update(cloneUpdate)
        .eq('id', cloneId);

      if (error) throw error;

      if (updateCaseStatus && id) {
        // Direct cases.status UPDATE is blocked by the state-machine guard
        // trigger. Route through transition_case_status RPC instead.
        const { data: deliveredStatus, error: lookupError } = await supabase
          .from('master_case_statuses')
          .select('id')
          .eq('name', 'Delivered')
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (!deliveredStatus?.id) throw new Error('Delivered status missing');

        const { error: rpcError } = await supabase.rpc('transition_case_status', {
          p_case_id: id,
          p_to_status_id: deliveredStatus.id,
          p_notes: 'Auto-set when clone marked as delivered',
        });
        if (rpcError) throw rpcError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['clone_drives', id] });
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      modals.setShowMarkAsDeliveredModal(false);
      modals.setSelectedClone(null);
    },
  });

  const preserveLongTermMutation = useMutation({
    mutationFn: async ({ cloneId, preserveReason }: { cloneId: string; preserveReason: string }) => {
      const cloneUpdate: CloneDriveUpdate = {
        status: 'preserved',
        notes: buildPreserveNotes(preserveReason),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('clone_drives')
        .update(cloneUpdate)
        .eq('id', cloneId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clone_drives', id] });
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      modals.setShowPreserveLongTermModal(false);
      modals.setSelectedClone(null);
    },
  });

  const duplicateCaseMutation = useMutation({
    mutationFn: async () => {
      if (!caseData) throw new Error('Case data is required to duplicate');
      const tenantId = requireTenantId(profile?.tenant_id);

      const { data: nextCaseNumber, error: numberError } = await supabase
        .rpc('get_next_case_number');

      if (numberError) {
        logger.error('Error getting next case number:', numberError);
        throw new Error('Failed to get next case number');
      }

      const newCaseData: CaseInsert = {
        tenant_id: tenantId,
        case_number: nextCaseNumber,
        customer_id: caseData.customer_id ?? null,
        service_type_id: caseData.service_type_id ?? null,
        priority: caseData.priority ?? null,
        status: 'Received',
        client_reference: caseData.case_no ?? null,
        subject: caseData.title ?? null,
        created_by: profile?.id ?? null,
      };

      if (caseData.contact_id) {
        newCaseData.contact_id = caseData.contact_id;
      }
      if (caseData.assigned_engineer_id) {
        newCaseData.assigned_to = caseData.assigned_engineer_id;
      }
      if (caseData.company_id) {
        newCaseData.company_id = caseData.company_id;
      }

      const { data: newCase, error: caseError } = await supabase
        .from('cases')
        .insert(newCaseData)
        .select()
        .maybeSingle();

      if (caseError) {
        logger.error('Error creating duplicate case:', caseError);
        throw new Error(`Failed to duplicate case: ${caseError.message}`);
      }
      if (!newCase) {
        throw new Error('Failed to duplicate case: insert returned no row');
      }

      if (devices && devices.length > 0) {
        // Map each source device row to the current case_devices Insert shape.
        // Columns renamed/removed by past migrations are excluded; parent_device_id
        // and inventory_item_id no longer exist on the table.
        const devicesToInsert: CaseDeviceInsert[] = devices.map((device) => ({
          tenant_id: tenantId,
          case_id: newCase.id,
          device_type_id: device.device_type_id ?? null,
          brand_id: device.brand_id ?? null,
          model: device.model ?? null,
          serial_number: device.serial_number ?? null,
          capacity_id: device.capacity_id ?? null,
          condition_id: device.condition_id ?? null,
          accessories: device.accessories ?? null,
          symptoms: device.symptoms ?? null,
          notes: device.notes ?? null,
          password: device.password ?? null,
          encryption_id: device.encryption_id ?? null,
          device_role_id: device.device_role_id ?? null,
          is_primary: device.is_primary ?? null,
          role_notes: device.role_notes ?? null,
          created_by: profile?.id ?? null,
        }));

        const { data: newDevices, error: devicesError } = await supabase
          .from('case_devices')
          .insert(devicesToInsert)
          .select('id');

        if (devicesError) {
          logger.error('Error duplicating devices:', devicesError);
          throw new Error(`Failed to duplicate devices: ${devicesError.message}`);
        }

        const deviceIdMapping: Record<string, string> = {};
        devices.forEach((oldDevice, index) => {
          if (oldDevice.id && newDevices && newDevices[index]) {
            deviceIdMapping[oldDevice.id] = newDevices[index].id;
          }
        });

        // parent_device_id column does not exist on the current case_devices
        // schema; the old device-parent linkage was dropped. Block removed --
        // duplicates no longer carry over parent relationships.
        void deviceIdMapping;
      }

      return newCase;
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      modals.setShowDuplicateModal(false);
      navigate(`/cases/${newCase.id}`);
    },
    onError: (error) => {
      logger.error('Case duplication error:', error);
      toast.error(`Failed to duplicate case: ${(error as Error).message}`);
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No case ID');
      return await deleteCaseService(id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success(`Case ${result.case_number} deleted successfully. ${result.total_records_deleted} total records removed.`);
      navigate('/cases');
    },
    onError: (error: Error) => {
      logger.error('Failed to delete case:', error);
      toast.error(`Failed to delete case: ${error.message}`);
    },
  });

  return {
    addNoteMutation,
    updateCaseStatusMutation,
    updateCasePriorityMutation,
    updateAssignedEngineerMutation,
    createPaymentMutation,
    updateCaseInfoMutation,
    updateDeviceInfoMutation,
    updateCustomerInfoMutation,
    markAsDeliveredMutation,
    preserveLongTermMutation,
    duplicateCaseMutation,
    deleteCaseMutation,
    queryClient,
    navigate,
    profile,
    toast,
  };
}
