import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';

type DataSubjectRequest = Database['public']['Tables']['data_subject_requests']['Row'];
type DataSubjectRequestInsert = Database['public']['Tables']['data_subject_requests']['Insert'];
type DataRetentionPolicy = Database['public']['Tables']['data_retention_policies']['Row'];

export const gdprService = {
  async getDataSubjectRequests(): Promise<DataSubjectRequest[]> {
    const { data, error } = await supabase
      .from('data_subject_requests')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createDataSubjectRequest(request: Omit<DataSubjectRequestInsert, 'id' | 'created_at' | 'updated_at'>): Promise<DataSubjectRequest> {
    const { data, error } = await supabase
      .from('data_subject_requests')
      .insert(request)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Failed to create request');
    return data;
  },

  async updateRequestStatus(id: string, status: string, processedBy?: string): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (processedBy) update.processed_by = processedBy;
    if (status === 'completed') update.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from('data_subject_requests')
      .update(update as never)
      .eq('id', id);
    if (error) throw error;
  },

  async exportCustomerData(customerId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('export_customer_data', {
      p_customer_id: customerId,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async anonymizeCustomerData(customerId: string): Promise<void> {
    const { error } = await supabase.rpc('anonymize_customer_data', {
      p_customer_id: customerId,
    });
    if (error) throw error;
  },

  async getRetentionPolicies(): Promise<DataRetentionPolicy[]> {
    const { data, error } = await supabase
      .from('data_retention_policies')
      .select('*')
      .is('deleted_at', null)
      .order('table_name');
    if (error) throw error;
    return data ?? [];
  },

  async upsertRetentionPolicy(
    tenantId: string,
    tableName: string,
    retentionDays: number,
    autoPurge: boolean
  ): Promise<void> {
    const { error } = await supabase
      .from('data_retention_policies')
      .upsert(
        {
          tenant_id: tenantId,
          table_name: tableName,
          retention_days: retentionDays,
          auto_purge: autoPurge,
          is_active: true,
        },
        { onConflict: 'tenant_id,table_name' }
      );
    if (error) throw error;
  },

  downloadAsJson(data: Record<string, unknown>, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
