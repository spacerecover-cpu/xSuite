import { supabase } from './supabaseClient';
import { logger } from './logger';
import type { Database } from '../types/database.types';

// Single typed gateway to document_templates / master_template_types — replaces
// the raw per-component queries (QuoteFormModal, InvoiceFormModal,
// TemplateTypeDetail) so every consumer shares the same lookup, default
// resolution, and usage tracking.

type DocumentTemplateRow = Database['public']['Tables']['document_templates']['Row'];
type TemplateTypeRow = Database['public']['Tables']['master_template_types']['Row'];

export type TemplateTypeCode =
  | 'quote_terms'
  | 'invoice_terms'
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'service_report'
  | 'diagnostic_findings';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  subjectLine: string | null;
  documentType: string | null;
  isDefault: boolean;
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface TemplateTypeInfo {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  supportsLineItems: boolean;
}

function mapTemplateRow(row: DocumentTemplateRow): DocumentTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content ?? '',
    subjectLine: row.subject_line,
    documentType: row.document_type,
    isDefault: row.is_default ?? false,
    isActive: row.is_active ?? true,
    usageCount: row.usage_count ?? 0,
    lastUsedAt: row.last_used_at,
  };
}

const typeIdByCode = new Map<string, string>();

export async function getTemplateTypeByCode(
  code: TemplateTypeCode
): Promise<TemplateTypeInfo | null> {
  const { data, error } = await supabase
    .from('master_template_types')
    .select('id, code, name, description, supports_line_items')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching template type by code:', error);
    throw error;
  }
  if (!data) return null;

  typeIdByCode.set(code, data.id);
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    description: data.description,
    supportsLineItems: (data as TemplateTypeRow).supports_line_items ?? false,
  };
}

async function getTypeId(code: TemplateTypeCode): Promise<string | null> {
  const cached = typeIdByCode.get(code);
  if (cached) return cached;
  const type = await getTemplateTypeByCode(code);
  return type?.id ?? null;
}

/**
 * Active templates for a type, default-first. When documentType is given,
 * templates pinned to that document type sort ahead of generic (NULL) ones;
 * templates pinned to a DIFFERENT document type are excluded.
 */
export async function listTemplates(
  typeCode: TemplateTypeCode,
  opts: { documentType?: string } = {}
): Promise<DocumentTemplate[]> {
  const typeId = await getTypeId(typeCode);
  if (!typeId) return [];

  let query = supabase
    .from('document_templates')
    .select('*')
    .eq('template_type_id', typeId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');

  if (opts.documentType) {
    query = query.or(`document_type.eq.${opts.documentType},document_type.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Error listing document templates:', error);
    throw error;
  }

  const templates = (data ?? []).map(mapTemplateRow);
  if (!opts.documentType) return templates;

  const pinned = templates.filter((t) => t.documentType === opts.documentType);
  const generic = templates.filter((t) => t.documentType === null);
  return [...pinned, ...generic];
}

/**
 * Default-resolution chain: default pinned to the document type → default
 * generic → first pinned → first generic → null. Callers fall back to their
 * own hardcoded system default (emailTemplates.ts) on null.
 */
export async function getDefaultTemplate(
  typeCode: TemplateTypeCode,
  documentType?: string
): Promise<DocumentTemplate | null> {
  const templates = await listTemplates(typeCode, { documentType });
  if (templates.length === 0) return null;

  if (documentType) {
    const pinnedDefault = templates.find(
      (t) => t.isDefault && t.documentType === documentType
    );
    if (pinnedDefault) return pinnedDefault;
  }
  return templates.find((t) => t.isDefault) ?? templates[0];
}

/** Fire-and-forget usage tracking; a lost increment is acceptable. */
export async function recordTemplateUsage(templateId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('document_templates')
      .select('usage_count')
      .eq('id', templateId)
      .maybeSingle();

    await supabase
      .from('document_templates')
      .update({
        usage_count: (data?.usage_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', templateId);
  } catch (error) {
    logger.warn('Failed to record template usage:', error);
  }
}
