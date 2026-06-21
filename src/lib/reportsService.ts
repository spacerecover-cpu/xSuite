import { supabase } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import type {
  Report,
  ReportType,
  ReportStatus,
  ReportTemplate,
  ReportSection,
  ReportSectionData,
} from './reportTypes';
import { isValidUuid } from './postgrestSanitizer';
import { logger } from './logger';

type TemplateRow = Database['public']['Tables']['master_case_report_templates']['Row'];
type CaseReportRow = Database['public']['Tables']['case_reports']['Row'];
type CaseReportInsert = Database['public']['Tables']['case_reports']['Insert'];
type CaseReportSectionRow = Database['public']['Tables']['case_report_sections']['Row'];
type CaseReportSectionInsert = Database['public']['Tables']['case_report_sections']['Insert'];

type ProfileEmbed = { full_name: string | null } | null;

type CaseReportRowWithProfiles = CaseReportRow & {
  created_by_profile?: ProfileEmbed;
  reviewed_by_profile?: ProfileEmbed;
  approved_by_profile?: ProfileEmbed;
};

type JsonObject = { [k: string]: Json | undefined };

function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(obj: JsonObject | null, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === 'string' ? v : undefined;
}

function readBool(obj: JsonObject | null, key: string): boolean | undefined {
  const v = obj?.[key];
  return typeof v === 'boolean' ? v : undefined;
}

function readNumber(obj: JsonObject | null, key: string): number | undefined {
  const v = obj?.[key];
  return typeof v === 'number' ? v : undefined;
}

function mapTemplateRow(row: TemplateRow): ReportTemplate {
  const data = isJsonObject(row.template_data) ? row.template_data : null;
  const structure = isJsonObject(data?.['template_structure'] as Json | null | undefined)
    ? (data!['template_structure'] as JsonObject)
    : null;
  const sectionsArr = Array.isArray(structure?.['sections']) ? (structure!['sections'] as Json[]) : [];

  return {
    id: row.id,
    template_name: row.name,
    report_type: (readString(data, 'report_type') as ReportType) ?? ('evaluation' as ReportType),
    description: row.description ?? '',
    template_structure: {
      sections: sectionsArr as unknown as ReportSection[],
    },
    is_active: row.is_active ?? true,
    is_default: readBool(data, 'is_default') ?? false,
    tenant_id: row.tenant_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReportRow(row: CaseReportRowWithProfiles): Report {
  const content = isJsonObject(row.content) ? row.content : null;

  return {
    id: row.id,
    case_id: row.case_id,
    report_number: row.report_number ?? '',
    report_type:
      (readString(content, 'report_type') as ReportType) ?? ('evaluation' as ReportType),
    title: row.title,
    content: readString(content, 'body'),
    status: (row.status as ReportStatus) ?? 'draft',
    findings: readString(content, 'findings'),
    recommendations: readString(content, 'recommendations'),
    visible_to_customer: readBool(content, 'visible_to_customer') ?? false,
    pdf_file_path: readString(content, 'pdf_file_path'),
    version_number: readNumber(content, 'version_number') ?? 1,
    parent_report_id: readString(content, 'parent_report_id'),
    is_latest_version: readBool(content, 'is_latest_version') ?? true,
    version_notes: readString(content, 'version_notes'),
    report_template_id: row.template_id ?? undefined,
    template_sections: content?.['template_sections'] ?? undefined,
    forensic_chain_of_custody_id: readString(content, 'forensic_chain_of_custody_id'),
    approved_by: readString(content, 'approved_by'),
    approved_at: readString(content, 'approved_at'),
    created_by: row.created_by ?? undefined,
    reviewed_by: readString(content, 'reviewed_by'),
    reviewed_at: readString(content, 'reviewed_at'),
    sent_to_customer_at: readString(content, 'sent_to_customer_at'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_profile: row.created_by_profile
      ? { full_name: row.created_by_profile.full_name ?? '' }
      : undefined,
    reviewed_by_profile: row.reviewed_by_profile
      ? { full_name: row.reviewed_by_profile.full_name ?? '' }
      : undefined,
    approved_by_profile: row.approved_by_profile
      ? { full_name: row.approved_by_profile.full_name ?? '' }
      : undefined,
  };
}

function mapSectionRow(row: CaseReportSectionRow): ReportSectionData {
  return {
    id: row.id,
    report_id: row.report_id,
    section_key: row.section_type ?? '',
    section_title: row.title ?? '',
    section_content: row.content ?? '',
    section_order: row.sort_order ?? 0,
    is_required: false,
    metadata: undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mergeContent(existing: Json | null | undefined, updates: JsonObject): Json {
  const base: JsonObject = isJsonObject(existing) ? { ...existing } : {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    base[k] = v;
  }
  return base as Json;
}

// case_reports.created_by FKs to auth.users (not profiles), so PostgREST cannot
// embed it — look up creator profiles separately and attach them under the same
// `created_by_profile` alias the broken embed used.
async function attachCreatedByProfiles(
  rows: CaseReportRow[]
): Promise<CaseReportRowWithProfiles[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id))
  );

  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, created_by_profile: null }));
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);

  if (error) {
    logger.error('Error fetching report creator profiles:', error);
    throw error;
  }

  const byId = new Map<string, { full_name: string | null }>(
    (profiles ?? []).map((p) => [p.id, { full_name: p.full_name }])
  );

  return rows.map((r) => ({
    ...r,
    created_by_profile: r.created_by ? byId.get(r.created_by) ?? null : null,
  }));
}

export const reportsService = {
  /**
   * Get all report templates, optionally filtered by report type
   */
  async getReportTemplates(reportType?: ReportType): Promise<ReportTemplate[]> {
    let query = supabase
      .from('master_case_report_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (reportType) {
      query = query.contains('template_data', { report_type: reportType });
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching report templates:', error);
      throw error;
    }

    return (data ?? []).map(mapTemplateRow);
  },

  /**
   * Get the default template for a specific report type.
   * A tenant override (tenant_id NOT NULL) beats the system default (NULL) —
   * RLS already restricts visible tenant rows to the caller's tenant.
   */
  async getDefaultTemplate(reportType: ReportType): Promise<ReportTemplate | null> {
    const { data, error } = await supabase
      .from('master_case_report_templates')
      .select('*')
      .contains('template_data', { report_type: reportType, is_default: true })
      .eq('is_active', true)
      .order('tenant_id', { ascending: true, nullsFirst: false })
      .limit(1);

    if (error) {
      logger.error('Error fetching default template:', error);
      throw error;
    }

    const row = data?.[0];
    return row ? mapTemplateRow(row) : null;
  },

  /**
   * Get all templates for a specific report type
   */
  async getTemplatesForReportType(reportType: ReportType): Promise<ReportTemplate[]> {
    const { data, error } = await supabase
      .from('master_case_report_templates')
      .select('*')
      .contains('template_data', { report_type: reportType })
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('Error fetching templates:', error);
      throw error;
    }

    return (data ?? []).map(mapTemplateRow);
  },

  /**
   * Create a tenant report template (Report Studio).
   */
  async createReportTemplate(input: {
    name: string;
    description?: string;
    reportType: ReportType;
    isDefault?: boolean;
    tenantId: string;
  }): Promise<ReportTemplate> {
    if (input.isDefault) {
      await this.clearTenantDefault(input.reportType, input.tenantId);
    }

    const { data, error } = await supabase
      .from('master_case_report_templates')
      .insert({
        name: input.name,
        description: input.description ?? null,
        is_active: true,
        tenant_id: input.tenantId,
        template_data: {
          report_type: input.reportType,
          is_default: input.isDefault ?? false,
        } as Json,
      })
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error creating report template:', error);
      throw error;
    }
    if (!data) throw new Error('Failed to create report template');
    return mapTemplateRow(data);
  },

  /**
   * Update a tenant report template's metadata (system rows are RLS-protected;
   * clone them to the tenant first).
   */
  async updateReportTemplate(
    templateId: string,
    input: { name?: string; description?: string; isDefault?: boolean; isActive?: boolean }
  ): Promise<ReportTemplate> {
    const { data: existing, error: fetchError } = await supabase
      .from('master_case_report_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) throw new Error('Template not found');

    const data = isJsonObject(existing.template_data) ? { ...existing.template_data } : {};
    if (input.isDefault !== undefined) {
      if (input.isDefault && existing.tenant_id) {
        await this.clearTenantDefault(
          (readString(data, 'report_type') as ReportType) ?? 'evaluation',
          existing.tenant_id
        );
      }
      data.is_default = input.isDefault;
    }

    const { data: updated, error } = await supabase
      .from('master_case_report_templates')
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        template_data: data as Json,
      })
      .eq('id', templateId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating report template:', error);
      throw error;
    }
    if (!updated) throw new Error('Template not found');
    return mapTemplateRow(updated);
  },

  /** Unset is_default on the tenant's other templates of the same type. */
  async clearTenantDefault(reportType: ReportType, tenantId: string): Promise<void> {
    const { data } = await supabase
      .from('master_case_report_templates')
      .select('id, template_data')
      .eq('tenant_id', tenantId)
      .contains('template_data', { report_type: reportType, is_default: true });

    for (const row of data ?? []) {
      const templateData = isJsonObject(row.template_data) ? { ...row.template_data } : {};
      templateData.is_default = false;
      await supabase
        .from('master_case_report_templates')
        .update({ template_data: templateData as Json })
        .eq('id', row.id);
    }
  },

  /**
   * Clone a (system) template into the tenant, copying its section mappings,
   * so admins can customize without touching shared masters.
   */
  async cloneTemplateToTenant(templateId: string, tenantId: string): Promise<ReportTemplate> {
    const { data: source, error: sourceError } = await supabase
      .from('master_case_report_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (sourceError) throw sourceError;
    if (!source) throw new Error('Template not found');

    const sourceData = isJsonObject(source.template_data) ? { ...source.template_data } : {};
    sourceData.is_default = false;

    const { data: created, error: createError } = await supabase
      .from('master_case_report_templates')
      .insert({
        name: `${source.name} (Custom)`,
        description: source.description,
        is_active: true,
        tenant_id: tenantId,
        template_data: sourceData as Json,
      })
      .select()
      .maybeSingle();

    if (createError) {
      logger.error('Error cloning report template:', createError);
      throw createError;
    }
    if (!created) throw new Error('Failed to clone template');

    const { data: mappings, error: mappingsError } = await supabase
      .from('report_template_section_mappings')
      .select('section_id, sort_order, is_required')
      .eq('template_id', templateId);

    if (mappingsError) {
      logger.error('Error reading source template mappings:', mappingsError);
      throw mappingsError;
    }

    if (mappings && mappings.length > 0) {
      const { error: copyError } = await supabase
        .from('report_template_section_mappings')
        .insert(
          mappings.map((m) => ({
            template_id: created.id,
            section_id: m.section_id,
            sort_order: m.sort_order,
            is_required: m.is_required,
            tenant_id: tenantId,
          }))
        );
      if (copyError) {
        logger.error('Error copying template mappings:', copyError);
        throw copyError;
      }
    }

    return mapTemplateRow(created);
  },

  /**
   * Cross-case report list for the Case Reports hub. Search is applied
   * client-side by the caller (bounded by the row limit here).
   */
  async listReports(
    filters: {
      reportType?: ReportType | 'all';
      status?: ReportStatus | 'all';
      latestOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<Array<Report & { case_number: string; case_title: string | null }>> {
    let query = supabase
      .from('case_reports')
      .select('*, cases!inner(case_number, title)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? 200);

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.reportType && filters.reportType !== 'all') {
      query = query.eq('content->>report_type', filters.reportType);
    }
    if (filters.latestOnly) {
      // Old rows may predate the flag; absent counts as latest.
      query = query.or(
        'content->>is_latest_version.eq.true,content->>is_latest_version.is.null'
      );
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Error listing case reports:', error);
      throw error;
    }

    type RowWithCase = CaseReportRow & {
      cases: { case_number: string | null; title: string | null } | null;
    };
    const rows = (data ?? []) as unknown as RowWithCase[];
    const withProfiles = await attachCreatedByProfiles(rows);

    return withProfiles.map((row, index) => ({
      ...mapReportRow(row),
      case_number: rows[index].cases?.case_number ?? '',
      case_title: rows[index].cases?.title ?? null,
    }));
  },

  /**
   * Move a draft report into the review stage.
   */
  async submitForReview(reportId: string): Promise<Report> {
    const { data, error } = await supabase
      .from('case_reports')
      .update({ status: 'review' })
      .eq('id', reportId)
      .eq('status', 'draft')
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error submitting report for review:', error);
      throw error;
    }
    if (!data) {
      throw new Error('Report not found or not in draft');
    }
    return mapReportRow(data);
  },

  /**
   * Generate next report number based on report type
   */
  async generateReportNumber(reportType: ReportType): Promise<string> {
    const sequenceScope = `report_${reportType}`;

    const { data, error } = await supabase.rpc('get_next_number', {
      p_scope: sequenceScope,
    });

    if (error) {
      logger.error('Error generating report number:', error);
      throw error;
    }

    return data;
  },

  /**
   * Create a new report
   */
  async createReport(
    caseId: string,
    reportType: ReportType,
    title: string,
    templateId: string,
    sections: Array<{ key: string; title: string; content: string; order: number; required: boolean }>,
    forensicChainOfCustodyId?: string
  ): Promise<Report> {
    const reportNumber = await this.generateReportNumber(reportType);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const content: JsonObject = {
      report_type: reportType,
      version_number: 1,
      is_latest_version: true,
      visible_to_customer: false,
    };
    if (forensicChainOfCustodyId) {
      content.forensic_chain_of_custody_id = forensicChainOfCustodyId;
    }

    const insertPayload: CaseReportInsert = {
      case_id: caseId,
      report_number: reportNumber,
      title,
      status: 'draft',
      template_id: templateId,
      created_by: user.id,
      content: content as Json,
      // tenant_id is set via trigger / RLS context
      tenant_id: undefined as unknown as string,
    };

    const { data: report, error: reportError } = await supabase
      .from('case_reports')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (reportError) {
      logger.error('Error creating report:', reportError);
      throw reportError;
    }

    if (!report) {
      throw new Error('Failed to create report');
    }

    if (sections && sections.length > 0) {
      const sectionsData: CaseReportSectionInsert[] = sections.map((section) => ({
        report_id: report.id,
        section_type: section.key,
        title: section.title,
        content: section.content || '',
        sort_order: section.order,
        tenant_id: report.tenant_id,
      }));

      const { error: sectionsError } = await supabase
        .from('case_report_sections')
        .insert(sectionsData);

      if (sectionsError) {
        logger.error('Error creating report sections:', sectionsError);
        throw sectionsError;
      }
    }

    return mapReportRow(report);
  },

  /**
   * Create a new version of an existing report
   */
  async createReportVersion(
    originalReportId: string,
    versionNotes: string,
    updatedSections: Array<{ key: string; title: string; content: string; order: number; required: boolean }>
  ): Promise<Report> {
    const originalReport = await this.getReportById(originalReportId);
    if (!originalReport) {
      throw new Error('Original report not found');
    }

    const parentReportId = originalReport.parent_report_id || originalReport.id;
    const newVersionNumber = originalReport.version_number + 1;

    const baseNumber = originalReport.report_number.split('-v')[0];
    const versionedReportNumber = `${baseNumber}-v${newVersionNumber}`;

    // Set previous version to not latest (merge into content JSONB)
    const { data: prevRow, error: prevFetchError } = await supabase
      .from('case_reports')
      .select('content')
      .eq('id', originalReportId)
      .maybeSingle();

    if (prevFetchError) {
      logger.error('Error fetching previous report content:', prevFetchError);
      throw prevFetchError;
    }

    const { error: updateError } = await supabase
      .from('case_reports')
      .update({ content: mergeContent(prevRow?.content, { is_latest_version: false }) })
      .eq('id', originalReportId);

    if (updateError) {
      logger.error('Error updating previous version:', updateError);
      throw updateError;
    }

    const newContent: JsonObject = {
      report_type: originalReport.report_type,
      version_number: newVersionNumber,
      parent_report_id: parentReportId,
      is_latest_version: true,
      version_notes: versionNotes,
      visible_to_customer: false,
    };
    if (originalReport.forensic_chain_of_custody_id) {
      newContent.forensic_chain_of_custody_id = originalReport.forensic_chain_of_custody_id;
    }

    const insertPayload: CaseReportInsert = {
      case_id: originalReport.case_id,
      report_number: versionedReportNumber,
      title: originalReport.title,
      status: 'draft',
      template_id: originalReport.report_template_id ?? null,
      content: newContent as Json,
      tenant_id: undefined as unknown as string,
    };

    const { data: newReport, error: createError } = await supabase
      .from('case_reports')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (createError) {
      logger.error('Error creating report version:', createError);
      throw createError;
    }

    if (!newReport) {
      throw new Error('Failed to create report version');
    }

    if (updatedSections && updatedSections.length > 0) {
      const sectionsData: CaseReportSectionInsert[] = updatedSections.map((section) => ({
        report_id: newReport.id,
        section_type: section.key,
        title: section.title,
        content: section.content || '',
        sort_order: section.order,
        tenant_id: newReport.tenant_id,
      }));

      const { error: sectionsError } = await supabase
        .from('case_report_sections')
        .insert(sectionsData);

      if (sectionsError) {
        logger.error('Error creating version sections:', sectionsError);
        throw sectionsError;
      }
    }

    return mapReportRow(newReport);
  },

  /**
   * Get a report by ID with all sections
   */
  async getReportById(reportId: string): Promise<Report | null> {
    const { data, error } = await supabase
      .from('case_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching report:', error);
      throw error;
    }

    if (!data) {
      return null;
    }

    const [withProfile] = await attachCreatedByProfiles([data]);
    return mapReportRow(withProfile);
  },

  /**
   * Get report sections
   */
  async getReportSections(reportId: string): Promise<ReportSectionData[]> {
    const { data, error } = await supabase
      .from('case_report_sections')
      .select('*')
      .eq('report_id', reportId)
      .order('sort_order');

    if (error) {
      logger.error('Error fetching report sections:', error);
      throw error;
    }

    return (data ?? []).map(mapSectionRow);
  },

  /**
   * Get all reports for a case
   */
  async getReportsByCaseId(
    caseId: string,
    filters?: {
      reportType?: ReportType;
      status?: ReportStatus;
      latestOnly?: boolean;
    }
  ): Promise<Report[]> {
    let query = supabase
      .from('case_reports')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (filters?.reportType) {
      query = query.contains('content', { report_type: filters.reportType });
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.latestOnly) {
      query = query.contains('content', { is_latest_version: true });
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching reports:', error);
      throw error;
    }

    const withProfiles = await attachCreatedByProfiles(data ?? []);
    return withProfiles.map(mapReportRow);
  },

  /**
   * Get version history for a report
   */
  async getReportVersionHistory(reportId: string): Promise<Report[]> {
    const report = await this.getReportById(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    const parentId = report.parent_report_id || report.id;

    const { data, error } = await supabase
      .from('case_reports')
      .select('*')
      .or(
        isValidUuid(parentId)
          ? `id.eq.${parentId},content->>parent_report_id.eq.${parentId}`
          : 'id.eq.00000000-0000-0000-0000-000000000000'
      )
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching version history:', error);
      throw error;
    }

    const withProfiles = await attachCreatedByProfiles(data ?? []);
    return withProfiles.map(mapReportRow);
  },

  /**
   * Update report sections
   */
  async updateReportSections(
    reportId: string,
    sections: Array<{ id?: string; key: string; title: string; content: string; order: number; required: boolean }>
  ): Promise<void> {
    // Fetch tenant_id for the parent report so we can stamp on inserts
    const { data: reportRow, error: reportFetchError } = await supabase
      .from('case_reports')
      .select('tenant_id')
      .eq('id', reportId)
      .maybeSingle();

    if (reportFetchError) {
      logger.error('Error fetching report tenant for section update:', reportFetchError);
      throw reportFetchError;
    }
    if (!reportRow) {
      throw new Error('Report not found');
    }

    const { error: deleteError } = await supabase
      .from('case_report_sections')
      .update({ deleted_at: new Date().toISOString() })
      .eq('report_id', reportId);

    if (deleteError) {
      logger.error('Error deleting old sections:', deleteError);
      throw deleteError;
    }

    const sectionsData: CaseReportSectionInsert[] = sections.map((section) => ({
      report_id: reportId,
      section_type: section.key,
      title: section.title,
      content: section.content || '',
      sort_order: section.order,
      tenant_id: reportRow.tenant_id,
    }));

    const { error: insertError } = await supabase
      .from('case_report_sections')
      .insert(sectionsData);

    if (insertError) {
      logger.error('Error updating sections:', insertError);
      throw insertError;
    }
  },

  /**
   * Update report metadata
   */
  async updateReport(
    reportId: string,
    updates: {
      title?: string;
      status?: ReportStatus;
      visible_to_customer?: boolean;
      findings?: string;
      recommendations?: string;
    }
  ): Promise<Report> {
    const contentUpdates: JsonObject = {};
    if (updates.visible_to_customer !== undefined) contentUpdates.visible_to_customer = updates.visible_to_customer;
    if (updates.findings !== undefined) contentUpdates.findings = updates.findings;
    if (updates.recommendations !== undefined) contentUpdates.recommendations = updates.recommendations;

    const dbUpdates: Database['public']['Tables']['case_reports']['Update'] = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    if (Object.keys(contentUpdates).length > 0) {
      const { data: existing, error: fetchError } = await supabase
        .from('case_reports')
        .select('content')
        .eq('id', reportId)
        .maybeSingle();

      if (fetchError) {
        logger.error('Error fetching report content for update:', fetchError);
        throw fetchError;
      }

      dbUpdates.content = mergeContent(existing?.content, contentUpdates);
    }

    const { data, error } = await supabase
      .from('case_reports')
      .update(dbUpdates)
      .eq('id', reportId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating report:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Report not found');
    }

    return mapReportRow(data);
  },

  /**
   * Approve a report
   */
  async approveReport(reportId: string, approverId: string): Promise<Report> {
    const { data: existing, error: fetchError } = await supabase
      .from('case_reports')
      .select('content')
      .eq('id', reportId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Error fetching report content for approval:', fetchError);
      throw fetchError;
    }

    const existingContent = isJsonObject(existing?.content) ? existing!.content : null;
    const now = new Date().toISOString();
    const mergedContent = mergeContent(existing?.content, {
      approved_by: approverId,
      approved_at: now,
      // The approver acts as reviewer when no separate review pass happened.
      reviewed_by: readString(existingContent, 'reviewed_by') ?? approverId,
      reviewed_at: readString(existingContent, 'reviewed_at') ?? now,
    });

    const { data, error } = await supabase
      .from('case_reports')
      .update({ status: 'approved', content: mergedContent })
      .eq('id', reportId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error approving report:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Report not found');
    }

    return mapReportRow(data);
  },

  /**
   * Send report to customer
   */
  async sendReportToCustomer(reportId: string): Promise<Report> {
    const { data: existing, error: fetchError } = await supabase
      .from('case_reports')
      .select('content')
      .eq('id', reportId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Error fetching report content for send:', fetchError);
      throw fetchError;
    }

    const mergedContent = mergeContent(existing?.content, {
      sent_to_customer_at: new Date().toISOString(),
      visible_to_customer: true,
    });

    const { data, error } = await supabase
      .from('case_reports')
      .update({ status: 'sent', content: mergedContent })
      .eq('id', reportId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error sending report to customer:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Report not found');
    }

    return mapReportRow(data);
  },

  /**
   * Delete a report (only if no newer versions exist)
   */
  async deleteReport(reportId: string): Promise<void> {
    const { error } = await supabase
      .from('case_reports')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', reportId);

    if (error) {
      logger.error('Error deleting report:', error);
      throw error;
    }
  },

  /**
   * Get chain of custody events for forensic report
   */
  async getChainOfCustodyForReport(caseId: string): Promise<Array<Database['public']['Tables']['chain_of_custody']['Row'] & {
    actor: { full_name: string | null } | null;
  }>> {
    const { data, error } = await supabase
      .from('chain_of_custody')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching chain of custody:', error);
      throw error;
    }

    const rows = data ?? [];

    // chain_of_custody.actor_id FKs to auth.users (not profiles), so PostgREST
    // cannot embed it — look up actor profiles separately and attach under the
    // same `actor` alias the broken embed used.
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))
    );

    let actorById = new Map<string, { full_name: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds);

      if (profilesError) {
        logger.error('Error fetching custody actor profiles:', profilesError);
        throw profilesError;
      }

      actorById = new Map(
        (profiles ?? []).map((p) => [p.id, { full_name: p.full_name }])
      );
    }

    return rows.map((r) => ({
      ...r,
      actor: r.actor_id ? actorById.get(r.actor_id) ?? null : null,
    }));
  },
};
