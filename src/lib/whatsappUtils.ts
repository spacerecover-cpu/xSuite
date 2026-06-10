import { logger } from './logger';
/**
 * WhatsApp Integration Utilities
 * Professional WhatsApp messaging functions for customer communication
 */

interface WhatsAppMessageOptions {
  phoneNumber: string;
  /** Required unless customMessage is provided (template-driven handoff). */
  caseNumber?: string;
  customerName?: string;
  status?: string;
  companyName?: string;
  customMessage?: string;
}

/**
 * Formats a phone number for WhatsApp
 * Removes spaces, dashes, and ensures it starts with country code
 */
export const formatPhoneForWhatsApp = (phone: string): string => {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  if (!cleaned.match(/^\d+$/)) {
    throw new Error('Invalid phone number format');
  }

  return cleaned;
};

/**
 * Generates a default case update message
 */
export const generateCaseUpdateMessage = (
  caseNumber: string,
  customerName: string,
  status: string,
  companyName: string = 'Data Recovery'
): string => {
  const statusMessages: Record<string, string> = {
    'received': `We have received your device for recovery service.`,
    'diagnosis': `The initial diagnosis of your device is in progress.`,
    'in-progress': `Data recovery is currently in progress.`,
    'waiting-approval': `Diagnostic report is ready. Awaiting your approval to proceed.`,
    'ready': `Your device/data is ready for collection.`,
    'completed': `Your case has been completed successfully.`,
    'delivered': `Your device has been delivered.`,
  };

  const statusMsg = statusMessages[status.toLowerCase()] || `Your case status has been updated.`;

  return `Hello ${customerName},

${statusMsg}

Case ID: ${caseNumber}

For more details, you can track your case online or contact us directly.

Thank you,
${companyName} Team`;
};

/**
 * Opens WhatsApp with a pre-filled message
 */
export const openWhatsAppChat = (options: WhatsAppMessageOptions): void => {
  try {
    const formattedPhone = formatPhoneForWhatsApp(options.phoneNumber);

    const message = options.customMessage || generateCaseUpdateMessage(
      options.caseNumber ?? '',
      options.customerName ?? 'Customer',
      options.status || 'received',
      options.companyName
    );

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  } catch (error) {
    logger.error('Error opening WhatsApp:', error);
    throw new Error('Failed to open WhatsApp. Please check the phone number format.');
  }
};

/**
 * Checks if a phone number is valid for WhatsApp
 */
export const isValidWhatsAppNumber = (phone: string): boolean => {
  try {
    const formatted = formatPhoneForWhatsApp(phone);
    return formatted.length >= 10 && formatted.length <= 15;
  } catch {
    return false;
  }
};

/**
 * Generates a case ready for collection message
 */
export const generateReadyForCollectionMessage = (
  caseNumber: string,
  customerName: string,
  companyName: string = 'Data Recovery'
): string => {
  return `Hello ${customerName},

Good news! Your case ${caseNumber} is ready for collection.

Please visit us at your convenience during our business hours to collect your device.

If you have any questions, feel free to contact us.

Best regards,
${companyName} Team`;
};

/**
 * Generates a diagnostic approval request message
 */
export const generateDiagnosticApprovalMessage = (
  caseNumber: string,
  customerName: string,
  diagnosticFee?: number,
  companyName: string = 'Data Recovery'
): string => {
  const feeText = diagnosticFee ? `\n\nDiagnostic Fee: ${diagnosticFee}` : '';

  return `Hello ${customerName},

We have completed the initial diagnosis of your device (Case ${caseNumber}).${feeText}

Please contact us to discuss the diagnostic findings and recovery options.

We look forward to hearing from you.

Best regards,
${companyName} Team`;
};

/**
 * Logs WhatsApp communication in the database
 */
export const logWhatsAppCommunication = async (
  supabase: any,
  caseId: string,
  phoneNumber: string,
  message: string
) => {
  try {
    const { error } = await supabase.rpc('log_case_communication', {
      p_case_id: caseId,
      p_type: 'whatsapp',
      p_subject: 'WhatsApp Message',
      p_content: message,
      p_sent_to: phoneNumber,
    });

    if (error) throw error;
  } catch (error) {
    logger.error('Error logging WhatsApp communication:', error);
  }
};
