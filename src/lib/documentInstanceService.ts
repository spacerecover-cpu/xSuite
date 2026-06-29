/**
 * documentInstanceService — the run-time API over the typed document_instances
 * record and its SECURITY DEFINER lifecycle RPCs (Document Studio).
 *
 * The lifecycle/approval/artifact columns are guarded at the DB layer, so all
 * privileged transitions go through the RPCs here — a direct table UPDATE cannot
 * forge an approval, deliver a draft, or attach an artifact. See
 * docs/superpowers/specs/2026-06-27-document-studio-design.md.
 *
 * NOTE: this is additive infrastructure. The legacy report send flow
 * (reportPDFService.persistReportPDF on case_reports) is rerouted onto this
 * service in the Phase 8 cutover, not here.
 */

import { supabase } from './supabaseClient';
import type { Database, Json } from '../types/database.types';
import { logger } from './logger';
import {
  sha256Hex,
  buildDocumentPdfPath,
  type DocumentInstanceType,
} from './pdf/contentHash';
import { reportSubtypeSections } from './pdf/engine/adapters/reportAdapter';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];
type DocumentInstanceInsert = Database['public']['Tables']['document_instances']['Insert'];
type DocumentInstanceSectionRow = Database['public']['Tables']['document_instance_sections']['Row'];
export type DocumentInstanceStatus = Database['public']['Enums']['document_instance_status'];
export type { DocumentInstanceType };

/** Private storage bucket for generated document PDFs (reuses the report bucket). */
export const DOCUMENT_PDF_BUCKET = 'case-report-pdfs';

async function resolveTenantId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error('No active tenant');
  return profile.tenant_id;
}

export interface CreateDocumentInstanceParams {
  docType: DocumentInstanceType;
  title: string;
  reportSubtype?: string | null;
  caseId?: string | null;
  deviceId?: string | null;
  invoiceId?: string | null;
  quoteId?: string | null;
  customerId?: string | null;
  documentNumber?: string | null;
  templateVersionId?: string | null;
}

/** Create a draft document instance. tenant_id + created_by are stamped by triggers. */
export async function createDocumentInstance(
  params: CreateDocumentInstanceParams,
): Promise<DocumentInstanceRow> {
  // tenant_id is also enforced by the set_tenant_and_audit_fields trigger, but the
  // typed Insert requires it; resolve it so the RESTRICTIVE isolation check passes.
  const tenantId = await resolveTenantId();
  const insert: DocumentInstanceInsert = {
    tenant_id: tenantId,
    doc_type: params.docType,
    title: params.title,
    report_subtype: params.reportSubtype ?? null,
    case_id: params.caseId ?? null,
    device_id: params.deviceId ?? null,
    invoice_id: params.invoiceId ?? null,
    quote_id: params.quoteId ?? null,
    customer_id: params.customerId ?? null,
    document_number: params.documentNumber ?? null,
    template_version_id: params.templateVersionId ?? null,
  };

  const { data, error } = await supabase
    .from('document_instances')
    .insert(insert)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('[documentInstanceService] create failed:', error);
    throw error ?? new Error('Failed to create document instance');
  }
  return data;
}

export async function getDocumentInstance(id: string): Promise<DocumentInstanceRow | null> {
  const { data, error } = await supabase
    .from('document_instances')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[documentInstanceService] get failed:', error);
    throw error;
  }
  return data ?? null;
}

export async function listDocumentInstances(caseId: string): Promise<DocumentInstanceRow[]> {
  const { data, error } = await supabase
    .from('document_instances')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[documentInstanceService] list failed:', error);
    throw error;
  }
  return data ?? [];
}

export async function getDocumentInstanceSections(
  instanceId: string,
): Promise<DocumentInstanceSectionRow[]> {
  const { data, error } = await supabase
    .from('document_instance_sections')
    .select('*')
    .eq('document_instance_id', instanceId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) {
    logger.error('[documentInstanceService] sections failed:', error);
    throw error;
  }
  return data ?? [];
}

export interface AttachArtifactParams {
  resolvedData?: Json;
  templateVersionId?: string | null;
  documentNumber?: string | null;
}

/**
 * Archive-then-mark provability write: hash the exact rendered bytes, upload to a
 * content-addressed path, and snapshot (path + sha256 + resolved_data + template
 * version) onto the instance via the guarded RPC. Idempotent: identical bytes →
 * same hash path → upsert is a no-op. Must succeed BEFORE a deliver transition;
 * the send gate refuses to deliver without pdf_storage_path + pdf_sha256.
 */
export async function attachArtifact(
  instanceId: string,
  docType: DocumentInstanceType,
  blob: Blob,
  params: AttachArtifactParams = {},
): Promise<{ path: string; sha256: string }> {
  const tenantId = await resolveTenantId();
  const sha256 = await sha256Hex(blob);
  const path = buildDocumentPdfPath(tenantId, docType, instanceId, sha256);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_PDF_BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    logger.error('[documentInstanceService] artifact upload failed:', uploadError);
    throw uploadError;
  }

  const { error: rpcError } = await supabase.rpc('set_document_instance_artifact', {
    p_instance_id: instanceId,
    p_bucket: DOCUMENT_PDF_BUCKET,
    p_path: path,
    p_sha256: sha256,
    p_resolved_data: params.resolvedData ?? null,
    p_template_version_id: params.templateVersionId ?? undefined,
    p_document_number: params.documentNumber ?? undefined,
  });
  if (rpcError) {
    logger.error('[documentInstanceService] set_document_instance_artifact failed:', rpcError);
    throw rpcError;
  }

  return { path, sha256 };
}

/** Drive a lifecycle transition through the server-enforced RPC. */
export async function transitionDocument(
  instanceId: string,
  toStatus: DocumentInstanceStatus,
  opts: { reason?: string; signatureId?: string } = {},
): Promise<void> {
  const { error } = await supabase.rpc('transition_document_instance', {
    p_instance_id: instanceId,
    p_to_status: toStatus,
    p_reason: opts.reason ?? undefined,
    p_signature_id: opts.signatureId ?? undefined,
  });
  if (error) {
    logger.error('[documentInstanceService] transition failed:', error);
    throw error;
  }
}

/** Short-lived signed URL for the archived PDF (private bucket). */
export async function getDocumentPdfSignedUrl(
  instance: Pick<DocumentInstanceRow, 'pdf_storage_bucket' | 'pdf_storage_path'>,
  expiresIn = 300,
): Promise<string | null> {
  if (!instance.pdf_storage_path) return null;
  const { data, error } = await supabase.storage
    .from(instance.pdf_storage_bucket ?? DOCUMENT_PDF_BUCKET)
    .createSignedUrl(instance.pdf_storage_path, expiresIn);
  if (error) {
    logger.error('[documentInstanceService] signed URL failed:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export interface CreateReportInstanceParams {
  caseId: string;
  reportSubtype: string;
  title: string;
}

/**
 * Create a draft report document_instance and seed its sections from the subtype's
 * canonical prose section list (so the engineer opens a structured, near-complete draft).
 * Number scope mirrors the legacy report numbering: `report_<subtype>`.
 */
export async function createReportInstance(params: CreateReportInstanceParams): Promise<DocumentInstanceRow> {
  const tenantId = await resolveTenantId();
  const scope = `report_${params.reportSubtype}`;
  const { data: number, error: numErr } = await supabase.rpc('get_next_number', { p_scope: scope });
  if (numErr) {
    logger.error('[documentInstanceService] number mint failed:', numErr);
    throw numErr;
  }

  const instance = await createDocumentInstance({
    docType: 'report',
    title: params.title,
    reportSubtype: params.reportSubtype,
    caseId: params.caseId,
    documentNumber: (number as string) ?? null,
  });

  const seeds = reportSubtypeSections(params.reportSubtype);
  if (seeds.length > 0) {
    const rows = seeds.map((s, i) => ({
      tenant_id: tenantId,
      document_instance_id: instance.id,
      section_key: s.key,
      title: s.title,
      content: '',
      sort_order: i,
      is_visible: true,
    }));
    const { error: secErr } = await supabase.from('document_instance_sections').insert(rows);
    if (secErr) {
      logger.error('[documentInstanceService] section seed failed:', secErr);
      throw secErr;
    }
  }
  return instance;
}

/** Render + archive (sha256) the instance's PDF; required before a deliver transition. */
export async function archiveDocumentInstance(
  instanceId: string,
  docType: DocumentInstanceType = 'report',
): Promise<{ path: string; sha256: string }> {
  const { reportPDFService } = await import('./reportPDFService');
  const result = await reportPDFService.generateDocumentInstanceAsBlob(instanceId);
  if (!result.success || !result.blob) {
    throw new Error(result.error || 'Failed to render document PDF');
  }
  return attachArtifact(instanceId, docType, result.blob);
}
