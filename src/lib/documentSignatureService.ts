import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { logger } from './logger';
import { sha256Hex } from './pdf/contentHash';
import { uploadSignature } from './fileStorageService';
import { loadImageAsBase64 } from './pdf/utils';
import type { SignatureBlockData } from './pdf/engine/types';

export type DocumentSignatureRow = Database['public']['Tables']['document_signatures']['Row'];

type SignatureSlot = Database['public']['Enums']['signature_slot'];
type SignatureMethod = Database['public']['Enums']['signature_method'];

async function resolveTenantId(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
  if (!data?.tenant_id) throw new Error('No active tenant');
  return data.tenant_id;
}

export interface CaptureStaffSignatureParams {
  instanceId: string;
  slot: SignatureSlot;
  method: SignatureMethod;
  signerName: string;
  signerRole?: string;
  typedValue?: string;
  imageBlob?: Blob;
}

export async function captureStaffSignature(p: CaptureStaffSignatureParams): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  const tenantId = await resolveTenantId(user.id);

  let imagePath: string | null = null;
  let sha: string | null = null;
  // company-assets bucket — uploadSignature writes to 'company-assets'/signatures/
  const SIGNATURE_BUCKET = 'company-assets';
  if (p.imageBlob && (p.method === 'drawn' || p.method === 'uploaded_image')) {
    const file = new File([p.imageBlob], `sig-${p.instanceId}-${p.slot}.png`, { type: 'image/png' });
    const res = await uploadSignature(file);
    if (!res.success || !res.filePath) throw new Error(res.error ?? 'Signature upload failed');
    imagePath = res.filePath;
    sha = await sha256Hex(p.imageBlob);
  }

  const { data, error } = await supabase
    .from('document_signatures')
    .insert({
      tenant_id: tenantId,
      document_instance_id: p.instanceId,
      slot: p.slot,
      method: p.method,
      signer_user_id: user.id,
      signer_name: p.signerName,
      signer_role: p.signerRole ?? null,
      typed_value: p.method === 'typed' ? (p.typedValue ?? null) : null,
      signature_image_path: imagePath,
      signature_image_bucket: imagePath ? SIGNATURE_BUCKET : null,
      signature_sha256: sha,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    logger.error('[documentSignatureService] insert failed:', error);
    throw error ?? new Error('Failed to record signature');
  }
  return data.id;
}

export async function listInstanceSignatures(instanceId: string): Promise<DocumentSignatureRow[]> {
  const { data, error } = await supabase
    .from('document_signatures')
    .select('*')
    .eq('document_instance_id', instanceId)
    .is('deleted_at', null)
    .order('signed_at', { ascending: true });
  if (error) {
    logger.error('[documentSignatureService] list failed:', error);
    throw error;
  }
  return data ?? [];
}

export async function resolveSignatureBlocks(instanceId: string): Promise<SignatureBlockData[]> {
  const rows = await listInstanceSignatures(instanceId);
  const blocks: SignatureBlockData[] = [];
  for (const r of rows) {
    let imageDataUrl: string | undefined;
    if (r.signature_image_path) {
      // Resolve the stored image path to a base64 data URL for pdfmake embedding.
      const { data: signed } = await supabase.storage
        .from(r.signature_image_bucket ?? 'company-assets')
        .createSignedUrl(r.signature_image_path, 300);
      if (signed?.signedUrl) {
        imageDataUrl = (await loadImageAsBase64(signed.signedUrl)) ?? undefined;
      }
    }
    blocks.push({
      slot: r.slot,
      name: r.signer_name,
      role: r.signer_role ?? undefined,
      method: r.method,
      imageDataUrl,
      typedValue: r.typed_value ?? undefined,
      signedAt: r.signed_at,
    });
  }
  return blocks;
}
