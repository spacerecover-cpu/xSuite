import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

type ReportSectionLibraryRow = Database['public']['Tables']['report_section_library']['Row'];
type ReportSectionLibraryInsert = Database['public']['Tables']['report_section_library']['Insert'];
type ReportSectionLibraryUpdate = Database['public']['Tables']['report_section_library']['Update'];

type ReportSectionPresetRow = Database['public']['Tables']['report_section_presets']['Row'];
type ReportSectionPresetInsert = Database['public']['Tables']['report_section_presets']['Insert'];
type ReportSectionPresetUpdate = Database['public']['Tables']['report_section_presets']['Update'];

type ReportTemplateSectionMappingRow =
  Database['public']['Tables']['report_template_section_mappings']['Row'];
type ReportTemplateSectionMappingInsert =
  Database['public']['Tables']['report_template_section_mappings']['Insert'];

export type ReportSectionCategory =
  | 'general'
  | 'diagnostic'
  | 'solution'
  | 'timeline'
  | 'technical'
  | 'financial'
  | 'compliance'
  | 'risk';

const VALID_CATEGORIES: readonly ReportSectionCategory[] = [
  'general',
  'diagnostic',
  'solution',
  'timeline',
  'technical',
  'financial',
  'compliance',
  'risk',
];

function toCategory(value: string | null | undefined): ReportSectionCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as ReportSectionCategory)
    : 'general';
}

export interface ReportSection {
  id: string;
  section_key: string;
  section_name: string;
  section_name_ar?: string;
  section_description?: string;
  section_description_ar?: string;
  category: ReportSectionCategory;
  icon: string;
  color: string;
  default_content_template?: string;
  is_system: boolean;
  is_active: boolean;
  is_hidden_in_editor: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SectionPreset {
  id: string;
  section_id: string;
  preset_name: string;
  preset_content: string;
  device_type_filter?: string[];
  service_type_filter?: string[];
  usage_count: number;
  is_active: boolean;
  display_order: number;
  created_by?: string;
  /** NULL = shared system preset (read-only for tenants); non-NULL = tenant preset. */
  tenant_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateSectionMapping {
  id: string;
  template_id: string;
  section_id: string;
  section_order: number;
  is_required: boolean;
  is_collapsible: boolean;
  page_break_before: boolean;
  custom_label?: string;
  custom_label_ar?: string;
  section_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function mapSectionRow(row: ReportSectionLibraryRow): ReportSection {
  return {
    id: row.id,
    section_key: row.section_key ?? '',
    section_name: row.section_name ?? row.name,
    section_name_ar: row.section_name_ar ?? undefined,
    section_description: row.section_description ?? undefined,
    section_description_ar: row.section_description_ar ?? undefined,
    category: toCategory(row.category),
    icon: row.icon ?? 'FileText',
    color: row.color ?? '#6B7280',
    default_content_template: row.default_content_template ?? undefined,
    is_system: row.is_system ?? false,
    is_active: row.is_active ?? true,
    is_hidden_in_editor: row.is_hidden_in_editor ?? false,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPresetRow(row: ReportSectionPresetRow): SectionPreset {
  return {
    id: row.id,
    section_id: row.section_library_id ?? '',
    preset_name: row.name,
    preset_content: row.content ?? '',
    device_type_filter: undefined,
    service_type_filter: undefined,
    usage_count: row.usage_count ?? 0,
    is_active: true,
    display_order: 0,
    created_by: row.created_by ?? undefined,
    tenant_id: row.tenant_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMappingRow(row: ReportTemplateSectionMappingRow): TemplateSectionMapping {
  return {
    id: row.id,
    template_id: row.template_id ?? '',
    section_id: row.section_id ?? '',
    section_order: row.sort_order ?? 0,
    is_required: row.is_required ?? false,
    is_collapsible: false,
    page_break_before: false,
    custom_label: undefined,
    custom_label_ar: undefined,
    section_config: undefined,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function sectionToInsert(section: Omit<ReportSection, 'id' | 'created_at' | 'updated_at'>): ReportSectionLibraryInsert {
  return {
    name: section.section_name,
    section_key: section.section_key,
    section_name: section.section_name,
    section_name_ar: section.section_name_ar ?? null,
    section_description: section.section_description ?? null,
    section_description_ar: section.section_description_ar ?? null,
    category: section.category,
    icon: section.icon,
    color: section.color,
    default_content_template: section.default_content_template ?? null,
    is_system: section.is_system,
    is_active: section.is_active,
    is_hidden_in_editor: section.is_hidden_in_editor,
    display_order: section.display_order,
  };
}

function sectionToUpdate(updates: Partial<ReportSection>): ReportSectionLibraryUpdate {
  const out: ReportSectionLibraryUpdate = {};
  if (updates.section_name !== undefined) {
    out.section_name = updates.section_name;
    out.name = updates.section_name;
  }
  if (updates.section_key !== undefined) out.section_key = updates.section_key;
  if (updates.section_name_ar !== undefined) out.section_name_ar = updates.section_name_ar ?? null;
  if (updates.section_description !== undefined) out.section_description = updates.section_description ?? null;
  if (updates.section_description_ar !== undefined) out.section_description_ar = updates.section_description_ar ?? null;
  if (updates.category !== undefined) out.category = updates.category;
  if (updates.icon !== undefined) out.icon = updates.icon;
  if (updates.color !== undefined) out.color = updates.color;
  if (updates.default_content_template !== undefined) out.default_content_template = updates.default_content_template ?? null;
  if (updates.is_system !== undefined) out.is_system = updates.is_system;
  if (updates.is_active !== undefined) out.is_active = updates.is_active;
  if (updates.is_hidden_in_editor !== undefined) out.is_hidden_in_editor = updates.is_hidden_in_editor;
  if (updates.display_order !== undefined) out.display_order = updates.display_order;
  return out;
}

function presetToInsert(preset: Omit<SectionPreset, 'id' | 'usage_count' | 'created_at' | 'updated_at'>): ReportSectionPresetInsert {
  return {
    name: preset.preset_name,
    section_library_id: preset.section_id || null,
    content: preset.preset_content,
    created_by: preset.created_by ?? null,
  };
}

function presetToUpdate(updates: Partial<SectionPreset>): ReportSectionPresetUpdate {
  const out: ReportSectionPresetUpdate = {};
  if (updates.preset_name !== undefined) out.name = updates.preset_name;
  if (updates.preset_content !== undefined) out.content = updates.preset_content;
  if (updates.section_id !== undefined) out.section_library_id = updates.section_id || null;
  if (updates.usage_count !== undefined) out.usage_count = updates.usage_count;
  if (updates.created_by !== undefined) out.created_by = updates.created_by ?? null;
  return out;
}

export const reportSectionService = {
  /**
   * Get all report sections
   */
  async getSections(): Promise<ReportSection[]> {
    const { data, error } = await supabase
      .from('report_section_library')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (error) {
      logger.error('Error fetching sections:', error);
      throw error;
    }

    return (data ?? []).map(mapSectionRow);
  },

  /**
   * Get sections by category
   */
  async getSectionsByCategory(category: string): Promise<ReportSection[]> {
    const { data, error } = await supabase
      .from('report_section_library')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('display_order');

    if (error) {
      logger.error('Error fetching sections by category:', error);
      throw error;
    }

    return (data ?? []).map(mapSectionRow);
  },

  /**
   * Get section by key
   */
  async getSectionByKey(sectionKey: string): Promise<ReportSection | null> {
    const { data, error } = await supabase
      .from('report_section_library')
      .select('*')
      .eq('section_key', sectionKey)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching section:', error);
      throw error;
    }

    return data ? mapSectionRow(data) : null;
  },

  /**
   * Create a new section
   */
  async createSection(section: Omit<ReportSection, 'id' | 'created_at' | 'updated_at'>): Promise<ReportSection> {
    const { data, error } = await supabase
      .from('report_section_library')
      .insert(sectionToInsert(section))
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error creating section:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to create section: no data returned');
    }

    return mapSectionRow(data);
  },

  /**
   * Update a section
   */
  async updateSection(id: string, updates: Partial<ReportSection>): Promise<ReportSection> {
    const { data, error } = await supabase
      .from('report_section_library')
      .update(sectionToUpdate(updates))
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating section:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to update section: no data returned');
    }

    return mapSectionRow(data);
  },

  /**
   * Soft-deactivate a section (only non-system sections).
   * report_section_library has no deleted_at column; flip is_active instead.
   */
  async deleteSection(id: string): Promise<void> {
    const { error } = await supabase
      .from('report_section_library')
      .update({ is_active: false })
      .eq('id', id)
      .eq('is_system', false);

    if (error) {
      logger.error('Error deleting section:', error);
      throw error;
    }
  },

  /**
   * Get presets for a section
   */
  async getPresetsBySection(sectionId: string): Promise<SectionPreset[]> {
    const { data, error } = await supabase
      .from('report_section_presets')
      .select('*')
      .eq('section_library_id', sectionId)
      .order('created_at');

    if (error) {
      logger.error('Error fetching presets:', error);
      throw error;
    }

    return (data ?? []).map(mapPresetRow);
  },

  /**
   * Create a preset
   */
  async createPreset(preset: Omit<SectionPreset, 'id' | 'usage_count' | 'created_at' | 'updated_at'>): Promise<SectionPreset> {
    const { data, error } = await supabase
      .from('report_section_presets')
      .insert(presetToInsert(preset))
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error creating preset:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to create preset: no data returned');
    }

    return mapPresetRow(data);
  },

  /**
   * Update a preset
   */
  async updatePreset(id: string, updates: Partial<SectionPreset>): Promise<SectionPreset> {
    const { data, error } = await supabase
      .from('report_section_presets')
      .update(presetToUpdate(updates))
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating preset:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to update preset: no data returned');
    }

    return mapPresetRow(data);
  },

  /**
   * Delete a preset.
   * report_section_presets has no deleted_at/is_active columns — hard delete.
   */
  async deletePreset(id: string): Promise<void> {
    const { error } = await supabase
      .from('report_section_presets')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting preset:', error);
      throw error;
    }
  },

  /**
   * Increment preset usage count.
   * Best-effort only — usage stats must never break the caller. RLS blocks
   * tenant staff from bumping counters on shared system presets (tenant
   * presets work), so every failure here is logged and swallowed.
   */
  async incrementPresetUsage(id: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_preset_usage', {
        p_table_name: 'report_section_presets',
        p_preset_id: id,
      });

      if (!error) return;

      // Fallback if the function doesn't exist or rejected the call.
      const { data: preset, error: readError } = await supabase
        .from('report_section_presets')
        .select('usage_count')
        .eq('id', id)
        .maybeSingle();

      if (readError || !preset) {
        if (readError) logger.warn('Skipped preset usage increment:', readError);
        return;
      }

      const { error: updateError } = await supabase
        .from('report_section_presets')
        .update({ usage_count: (preset.usage_count ?? 0) + 1 })
        .eq('id', id);

      if (updateError) {
        logger.warn('Skipped preset usage increment:', updateError);
      }
    } catch (err) {
      logger.warn('Skipped preset usage increment:', err);
    }
  },

  /**
   * Get sections for a template
   */
  async getTemplateSections(
    templateId: string,
  ): Promise<(TemplateSectionMapping & { section: ReportSection })[]> {
    const { data, error } = await supabase
      .from('report_template_section_mappings')
      .select(
        `
        *,
        section:report_section_library(*)
      `,
      )
      .eq('template_id', templateId)
      .order('sort_order');

    if (error) {
      logger.error('Error fetching template sections:', error);
      throw error;
    }

    type JoinedRow = ReportTemplateSectionMappingRow & {
      section: ReportSectionLibraryRow | null;
    };

    return ((data ?? []) as JoinedRow[])
      .filter((row): row is JoinedRow & { section: ReportSectionLibraryRow } => row.section !== null)
      .map((row) => ({
        ...mapMappingRow(row),
        section: mapSectionRow(row.section),
      }));
  },

  /**
   * Update template section mappings.
   * report_template_section_mappings is a join table with no deleted_at;
   * replacing mappings requires removing existing rows first.
   * Mapping rows must carry the owning template's tenant_id explicitly
   * (NULL = shared system row) — these master tables have no tenant trigger.
   */
  async updateTemplateSections(
    templateId: string,
    sections: Array<{ section_id: string; section_order: number; is_required: boolean }>,
  ): Promise<void> {
    const { data: template, error: templateError } = await supabase
      .from('master_case_report_templates')
      .select('tenant_id')
      .eq('id', templateId)
      .maybeSingle();

    if (templateError) {
      logger.error('Error fetching template for section mapping update:', templateError);
      throw templateError;
    }
    if (!template) {
      throw new Error('Template not found');
    }

    const { error: deleteError } = await supabase
      .from('report_template_section_mappings')
      .delete()
      .eq('template_id', templateId);

    if (deleteError) {
      logger.error('Error removing existing template sections:', deleteError);
      throw deleteError;
    }

    const mappings: ReportTemplateSectionMappingInsert[] = sections.map((s) => ({
      template_id: templateId,
      section_id: s.section_id,
      sort_order: s.section_order,
      is_required: s.is_required,
      tenant_id: template.tenant_id,
    }));

    if (mappings.length === 0) return;

    const { error } = await supabase
      .from('report_template_section_mappings')
      .insert(mappings);

    if (error) {
      logger.error('Error updating template sections:', error);
      throw error;
    }
  },
};
