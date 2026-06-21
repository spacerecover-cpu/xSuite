import type { DocumentType } from './pdf/types';

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface EmailTemplateData {
  customerName: string;
  caseNumber: string;
  companyName: string;
  documentType: DocumentType;
}

const templates: Record<DocumentType, { subject: string; body: string }> = {
  office_receipt: {
    subject: 'Office Receipt - Case #{{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached the Office Receipt for your case.

Case Reference: #{{caseNumber}}

This document confirms the receipt of your device(s) at our facility. Please keep this for your records.

If you have any questions, please don't hesitate to contact us.

Best regards,
{{companyName}} Team`,
  },

  customer_copy: {
    subject: 'Device Receipt - Case #{{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached the Customer Copy receipt for your case.

Case Reference: #{{caseNumber}}

This document provides a summary of your device(s) and case details. Please review and keep this for your records.

If you have any questions or concerns, please don't hesitate to reach out.

Best regards,
{{companyName}} Team`,
  },

  checkout_form: {
    subject: 'Device Checkout Confirmation - Case #{{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached the Checkout Confirmation for your case.

Case Reference: #{{caseNumber}}

This document confirms the collection of your device(s) from our facility. Please keep this for your records.

Thank you for choosing our services.

Best regards,
{{companyName}} Team`,
  },

  case_label: {
    subject: 'Case Label - #{{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached the Case Label for your reference.

Case Reference: #{{caseNumber}}

Best regards,
{{companyName}} Team`,
  },

  chain_of_custody: {
    subject: 'Chain of Custody - Case #{{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached the Chain of Custody document for your case.

Case Reference: #{{caseNumber}}

Best regards,
{{companyName}} Team`,
  },

  quote: {
    subject: 'Quote - {{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached your quote.

Best regards,
{{companyName}} Team`,
  },

  invoice: {
    subject: 'Invoice - {{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached your invoice.

Best regards,
{{companyName}} Team`,
  },

  credit_note: {
    subject: 'Credit Note - {{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached your credit note.

Best regards,
{{companyName}} Team`,
  },

  payment_receipt: {
    subject: 'Payment Receipt - {{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached your payment receipt.

Best regards,
{{companyName}} Team`,
  },

  payslip: {
    subject: 'Payslip - {{caseNumber}}',
    body: `Dear {{customerName}},

Please find attached your payslip.

Best regards,
{{companyName}} Team`,
  },
};

export function getEmailTemplate(
  documentType: DocumentType,
  data: EmailTemplateData
): EmailTemplate {
  const template = templates[documentType];

  const replacePlaceholders = (text: string): string => {
    return text
      .replace(/\{\{customerName\}\}/g, data.customerName)
      .replace(/\{\{caseNumber\}\}/g, data.caseNumber)
      .replace(/\{\{companyName\}\}/g, data.companyName);
  };

  return {
    subject: replacePlaceholders(template.subject),
    body: replacePlaceholders(template.body),
  };
}

export function getDocumentTypeLabel(documentType: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    office_receipt: 'Office Receipt',
    customer_copy: 'Customer Copy',
    checkout_form: 'Checkout Form',
    case_label: 'Case Label',
    chain_of_custody: 'Chain of Custody',
    quote: 'Quote',
    invoice: 'Invoice',
    credit_note: 'Credit Note',
    payment_receipt: 'Payment Receipt',
    payslip: 'Payslip',
  };
  return labels[documentType];
}
