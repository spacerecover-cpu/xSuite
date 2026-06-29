import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logger } from './logger';
import { fetchPortalVisibility, getCaseIdsWithFlag } from './portalVisibility';
import { getDocumentPdfSignedUrl } from './documentInstanceService';
import type { CapturedSignature } from '../components/cases/SignatureCaptureModal';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];

export async function fetchPortalDocuments(customerId: string): Promise<DocumentInstanceRow[]> {
  if (!customerId) return [];
  const visibility = await fetchPortalVisibility(customerId);
  const caseIds = getCaseIdsWithFlag(visibility, 'show_documents');
  if (caseIds.length === 0) return [];
  const { data, error } = await supabase
    .from('document_instances')
    .select('*')
    .in('case_id', caseIds)
    .in('status', ['delivered', 'signed_off'])
    .eq('visible_to_customer', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) { logger.error('[portalDocumentService] list failed:', error); throw error; }
  return data ?? [];
}

export async function getPortalDocumentPdfUrl(
  instance: Pick<DocumentInstanceRow, 'pdf_storage_bucket' | 'pdf_storage_path'>,
): Promise<string | null> {
  return getDocumentPdfSignedUrl(instance);
}

export async function portalSignOffDocument(instanceId: string, sig: CapturedSignature): Promise<string> {
  const { data, error } = await supabase.rpc('portal_sign_off_document', {
    p_instance_id: instanceId,
    p_method: sig.method,
    p_typed_value: sig.typedValue ?? undefined,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
  if (error) { logger.error('[portalDocumentService] sign-off failed:', error); throw error; }
  const result = data as { ok?: boolean; signature_id?: string } | null;
  if (!result?.signature_id) throw new Error('Sign-off did not return a signature id');
  return result.signature_id;
}
