import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { createPayment } from '@/lib/paymentsService';
import { deleteCaseService, duplicateCase, type DuplicateDeviceSource } from '@/lib/caseService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { describeGateError } from '@/lib/caseReleaseGate';
import { logger } from '../../../lib/logger';
import { onCaseTransitioned } from '../../../lib/automation/documentAutomation';
import type { Database } from '@/types/database.types';
import type { CreateCloneDriveFormValues } from '../CreateCloneDriveModal';

type CaseRow = Database['public']['Tables']['cases']['Row'];
type CaseUpdate = Database['public']['Tables']['cases']['Update'];
type CaseDeviceUpdate = Database['public']['Tables']['case_devices']['Update'];
type CustomerUpdate = Database['public']['Tables']['customers_enhanced']['Update'];
type CloneDriveInsert = Database['public']['Tables']['clone_drives']['Insert'];
type CloneDriveUpdate = Database['public']['Tables']['clone_drives']['Update'];

export interface CreateCloneDriveInput {
  deviceId: string;
  driveLabel: string;
  capacity: string;
  storageServer: string;
  storagePath: string;
  storageType: string;
  imageFormat: string;
  expectedSizeGb: number | null;
  resourceCloneDriveId: string | null;
}

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
    setShowCreateCloneModal?: (v: boolean) => void;
    setShowExtractCloneModal?: (v: boolean) => void;
    setShowArchiveCloneModal?: (v: boolean) => void;
    setShowSpaceWarningModal?: (v: boolean) => void;
    setPendingCloneCreate?: (v: CreateCloneDriveFormValues | null) => void;
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

// clone_drives now has dedicated delivery/retention/extract/archive columns
// (delivered_date, delivered_by, retention_days, retention_deadline,
// extracted_date/extracted_by, archived_date/archived_by, preserve_reason,
// preserved_by, preserved_date). Notes is now free-text only.

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

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const { data, error } = await supabase.rpc('update_case_note', {
        p_note_id: noteId,
        p_content: content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_notes', id] });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
      queryClient.invalidateQueries({ queryKey: ['case_history', id] });
      const t = data as { from_phase?: string; to_phase?: string; no_op?: boolean } | null;
      if (id && t?.from_phase && t?.to_phase) {
        void onCaseTransitioned(id, t.from_phase, t.to_phase, t)
          .catch((err) => logger.error('[documentAutomation] onCaseTransitioned failed (non-blocking):', err));
      }
    },
    onError: (error) => {
      logger.error('Status update failed:', error);
      toast.error(describeGateError(error) ?? 'Failed to update status. Please try again.');
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
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
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
      // Case Payment History reads from this key — without it the list stays
      // frozen on the prior payment while the summary/invoice already updated.
      queryClient.invalidateQueries({ queryKey: ['case_payments', id] });
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
        delivered_date: deliveryDate.toISOString(),
        delivered_by: profile?.id ?? null,
        retention_days: retentionDays,
        retention_deadline: retentionDeadline.toISOString(),
        delivery_notes: deliveryNotes || null,
        updated_at: deliveryDate.toISOString(),
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
    onError: (error) => {
      logger.error('Mark as delivered failed:', error);
      toast.error(describeGateError(error) ?? `Failed to mark as delivered: ${(error as Error).message}`);
    },
  });

  const preserveLongTermMutation = useMutation({
    mutationFn: async ({ cloneId, preserveReason }: { cloneId: string; preserveReason: string }) => {
      const now = new Date().toISOString();
      const cloneUpdate: CloneDriveUpdate = {
        status: 'preserved',
        preserve_reason: preserveReason,
        preserved_by: profile?.id ?? null,
        preserved_date: now,
        updated_at: now,
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

  const createCloneDriveMutation = useMutation({
    mutationFn: async (input: CreateCloneDriveInput) => {
      const caseId = requireCaseId(id);
      const tenantId = requireTenantId(profile?.tenant_id);
      const now = new Date().toISOString();

      const insertPayload: CloneDriveInsert = {
        tenant_id: tenantId,
        case_id: caseId,
        device_id: input.deviceId || null,
        drive_label: input.driveLabel || null,
        capacity: input.capacity || null,
        storage_server: input.storageServer || null,
        storage_path: input.storagePath || null,
        storage_type: input.storageType || null,
        image_format: input.imageFormat || null,
        expected_size_gb: input.expectedSizeGb ?? null,
        resource_clone_drive_id: input.resourceCloneDriveId || null,
        status: 'active',
        clone_date: now,
        cloned_by: profile?.id ?? null,
      };

      const { data, error } = await supabase
        .from('clone_drives')
        .insert(insertPayload)
        .select()
        .maybeSingle();

      if (error) {
        logger.error('Failed to create clone drive', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clone_drives', id] });
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      modals.setShowCreateCloneModal?.(false);
      modals.setPendingCloneCreate?.(null);
      toast.success('Clone drive created');
    },
    onError: (error: Error) => {
      logger.error('Create clone drive failed:', error);
      toast.error(`Failed to create clone drive: ${error.message}`);
    },
  });

  const extractCloneMutation = useMutation({
    mutationFn: async ({ cloneId }: { cloneId: string }) => {
      const now = new Date().toISOString();
      const update: CloneDriveUpdate = {
        status: 'extracted',
        extracted_date: now,
        extracted_by: profile?.id ?? null,
        updated_at: now,
      };

      const { error } = await supabase
        .from('clone_drives')
        .update(update)
        .eq('id', cloneId);

      if (error) {
        logger.error('Failed to mark clone as extracted', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clone_drives', id] });
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      modals.setShowExtractCloneModal?.(false);
      modals.setSelectedClone(null);
      toast.success('Clone marked as extracted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to extract clone: ${error.message}`);
    },
  });

  const archiveCloneMutation = useMutation({
    mutationFn: async ({ cloneId }: { cloneId: string }) => {
      const now = new Date().toISOString();
      const update: CloneDriveUpdate = {
        status: 'archived',
        archived_date: now,
        archived_by: profile?.id ?? null,
        updated_at: now,
      };

      const { error } = await supabase
        .from('clone_drives')
        .update(update)
        .eq('id', cloneId);

      if (error) {
        logger.error('Failed to archive clone drive', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clone_drives', id] });
      queryClient.invalidateQueries({ queryKey: ['resource_clone_drives'] });
      modals.setShowArchiveCloneModal?.(false);
      modals.setSelectedClone(null);
      toast.success('Clone archived');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive clone: ${error.message}`);
    },
  });

  const duplicateCaseMutation = useMutation({
    // `caseNumber` is the number already reserved + shown in the confirmation
    // modal, so the assigned number matches what the user saw.
    mutationFn: async (caseNumber?: string) => {
      if (!caseData) throw new Error('Case data is required to duplicate');
      const tenantId = requireTenantId(profile?.tenant_id);

      return duplicateCase(
        {
          customer_id: caseData.customer_id ?? null,
          service_type_id: caseData.service_type_id ?? null,
          priority: caseData.priority ?? null,
          case_no: caseData.case_no ?? null,
          title: caseData.title ?? null,
          contact_id: caseData.contact_id ?? null,
          assigned_engineer_id: caseData.assigned_engineer_id ?? null,
          company_id: caseData.company_id ?? null,
        },
        devices,
        { id: profile?.id ?? null, tenantId },
        caseNumber,
      );
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_count'] });
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['cases_count'] });
      queryClient.invalidateQueries({ queryKey: ['cases_stats'] });
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
    updateNoteMutation,
    updateCaseStatusMutation,
    updateCasePriorityMutation,
    updateAssignedEngineerMutation,
    createPaymentMutation,
    updateCaseInfoMutation,
    updateDeviceInfoMutation,
    updateCustomerInfoMutation,
    markAsDeliveredMutation,
    preserveLongTermMutation,
    createCloneDriveMutation,
    extractCloneMutation,
    archiveCloneMutation,
    duplicateCaseMutation,
    deleteCaseMutation,
    queryClient,
    navigate,
    profile,
    toast,
  };
}
