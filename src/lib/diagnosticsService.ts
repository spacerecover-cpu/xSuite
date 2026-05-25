import { supabase } from './supabaseClient';
import { logger } from './logger';

export interface DeviceDiagnostics {
  id?: string;
  case_device_id: string;
  device_type_category: 'hdd' | 'ssd' | 'hybrid' | 'other';
  diagnostic_date?: string;
  diagnosed_by?: string;

  heads_status?: string;
  head_map?: any;
  pcb_status?: string;
  pcb_notes?: string;
  motor_status?: string;
  surface_status?: string;
  sa_access?: boolean;
  platter_condition?: string;

  controller_status?: string;
  controller_model?: string;
  memory_chips_status?: string;
  nand_type?: string;
  firmware_corruption?: boolean;
  trim_support?: boolean;
  wear_leveling_count?: number;

  firmware_version?: string;
  rom_version?: string;
  smart_data?: any;
  imaging_stats?: any;

  physical_damage_notes?: string;

  technical_notes?: string;

  created_at?: string;
  updated_at?: string;
}

export interface ComponentStatus {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
  status_name: string;
  status_code: string;
  color_indicator: string;
  icon_type: string;
  description?: string;
}

export const diagnosticsService = {
  async getComponentStatuses(): Promise<ComponentStatus[]> {
    const { data, error } = await supabase
      .from('catalog_device_component_statuses')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      logger.error('Error fetching component statuses:', error);
      throw error;
    }

    return (data || []).map((row) => ({
      ...row,
      status_name: row.name,
      status_code: row.name.toLowerCase().replace(/\s+/g, '_'),
      color_indicator: row.color ?? 'gray',
      icon_type: 'circle',
    }));
  },

  async getDeviceDiagnostics(caseDeviceId: string): Promise<DeviceDiagnostics | null> {
    const { data, error } = await supabase
      .from('device_diagnostics')
      .select('*')
      .eq('device_id', caseDeviceId)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching device diagnostics:', error);
      throw error;
    }

    if (!data) return null;
    return { ...data, case_device_id: data.device_id } as unknown as DeviceDiagnostics;
  },

  async createDeviceDiagnostics(diagnostics: DeviceDiagnostics): Promise<DeviceDiagnostics> {
    const { data: currentUser } = await supabase.auth.getUser();

    const { case_device_id, ...rest } = diagnostics;
    const diagnosticsData = {
      ...rest,
      device_id: case_device_id,
      diagnosed_by: diagnostics.diagnosed_by || currentUser.user?.id,
      diagnostic_date: diagnostics.diagnostic_date || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('device_diagnostics')
      .insert([diagnosticsData as never])
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error creating device diagnostics:', error);
      throw error;
    }

    if (!data) throw new Error('Failed to create device diagnostics');
    return { ...data, case_device_id: data.device_id } as unknown as DeviceDiagnostics;
  },

  async updateDeviceDiagnostics(id: string, diagnostics: Partial<DeviceDiagnostics>): Promise<DeviceDiagnostics> {
    const { case_device_id, ...rest } = diagnostics;
    const updatePayload = case_device_id !== undefined
      ? { ...rest, device_id: case_device_id }
      : rest;

    const { data, error } = await supabase
      .from('device_diagnostics')
      .update(updatePayload as never)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating device diagnostics:', error);
      throw error;
    }

    if (!data) throw new Error('Failed to update device diagnostics');
    return { ...data, case_device_id: data.device_id } as unknown as DeviceDiagnostics;
  },

  async upsertDeviceDiagnostics(diagnostics: DeviceDiagnostics): Promise<DeviceDiagnostics> {
    const existing = await this.getDeviceDiagnostics(diagnostics.case_device_id);

    if (existing) {
      return this.updateDeviceDiagnostics(existing.id!, diagnostics);
    } else {
      return this.createDeviceDiagnostics(diagnostics);
    }
  },

  async deleteDeviceDiagnostics(id: string): Promise<void> {
    const { error } = await supabase
      .from('device_diagnostics')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Error deleting device diagnostics:', error);
      throw error;
    }
  },

  async getDiagnosticsWithDevice(caseDeviceId: string) {
    const { data, error } = await supabase
      .from('device_diagnostics')
      .select(`
        *,
        diagnosed_by_user:profiles(full_name)
      `)
      .eq('device_id', caseDeviceId)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching diagnostics with device:', error);
      throw error;
    }

    return data;
  },

  getStatusColor(statusCode: string | undefined): string {
    if (!statusCode) return 'gray';

    const colorMap: Record<string, string> = {
      good: 'green',
      partial: 'yellow',
      replacement: 'orange',
      bad: 'red',
      not_tested: 'gray',
    };

    return colorMap[statusCode] || 'gray';
  },

  getStatusLabel(statusCode: string | undefined, statuses: ComponentStatus[]): string {
    if (!statusCode) return 'Not Tested';

    const status = statuses.find(s => s.status_code === statusCode);
    return status?.status_name || statusCode;
  },

  determineDeviceCategory(deviceTypeName: string): 'hdd' | 'ssd' | 'hybrid' | 'other' {
    const lowerName = deviceTypeName.toLowerCase();

    if (lowerName.includes('hdd') ||
        lowerName.includes('hard drive') ||
        lowerName.includes('hard disk') ||
        lowerName.includes('mechanical')) {
      return 'hdd';
    }

    if (lowerName.includes('ssd') ||
        lowerName.includes('solid state') ||
        lowerName.includes('nvme') ||
        lowerName.includes('m.2')) {
      return 'ssd';
    }

    if (lowerName.includes('hybrid') || lowerName.includes('sshd')) {
      return 'hybrid';
    }

    return 'other';
  },
};
