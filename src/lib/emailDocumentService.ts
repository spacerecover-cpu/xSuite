import { supabase } from './supabaseClient';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logger } from './logger';

export interface SendDocumentEmailParams {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Omit both blob and filename to send a plain (attachment-less) email. */
  blob?: Blob;
  filename?: string;
  caseId?: string;
  documentType?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function validatePDFBlob(blob: Blob): boolean {
  if (!blob || blob.size === 0) {
    logger.error('[Email Service] Invalid blob: empty or null');
    return false;
  }

  if (blob.type !== 'application/pdf' && blob.type !== '') {
    logger.error('[Email Service] Invalid blob type:', blob.type);
    return false;
  }

  if (blob.size < 100) {
    logger.error('[Email Service] Blob too small, likely corrupted:', blob.size, 'bytes');
    return false;
  }

  return true;
}

export async function sendDocumentEmail(params: SendDocumentEmailParams): Promise<SendEmailResult> {
  const rl = checkRateLimit(RATE_LIMITS.EMAIL_SEND);
  if (!rl.allowed) {
    return { success: false, error: rl.message };
  }

  try {
    if (params.blob && !validatePDFBlob(params.blob)) {
      return {
        success: false,
        error: 'Invalid PDF document. The file may be corrupted or empty. Please regenerate the document and try again.'
      };
    }

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session?.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    const attachmentBase64 = params.blob ? await blobToBase64(params.blob) : undefined;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-document-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          body: params.body,
          attachmentBase64,
          attachmentFilename: params.filename,
          caseId: params.caseId,
          documentType: params.documentType,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to send email' };
    }

    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error('Error sending document email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}
