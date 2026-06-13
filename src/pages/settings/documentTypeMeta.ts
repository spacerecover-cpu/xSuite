/**
 * Presentation metadata for the M4 "Settings → Documents" surface.
 *
 * Maps each {@link TemplateDocumentType} the UI exposes to a human label, a
 * short description, and a `lucide-react` icon. The DOCUMENT_TYPES array is the
 * curated financial + case set (the document types with engine renderers wired
 * in `src/lib/pdf/engine/registry.ts`), which is what the landing grid shows.
 *
 * Pure data — no React, no DB. Kept separate so both the landing page and the
 * editor can share the same labels.
 */

import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Receipt,
  FileSignature,
  ClipboardCheck,
  PackageOpen,
} from 'lucide-react';
import type { TemplateDocumentType } from '../../lib/pdf/templateConfig';

export interface DocumentTypeMeta {
  type: TemplateDocumentType;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Display label for every supported template document type. */
export const DOC_TYPE_LABELS: Record<TemplateDocumentType, string> = {
  invoice: 'Invoice',
  quote: 'Quotation',
  payment_receipt: 'Payment receipt',
  office_receipt: 'Device check-in receipt',
  customer_copy: 'Customer copy',
  checkout_form: 'Device checkout form',
  case_label: 'Case label',
  stock_label: 'Stock label',
  payslip: 'Payslip',
  chain_of_custody: 'Chain of custody',
  report: 'Case report',
};

/**
 * The curated financial + case document set surfaced in the landing grid. These
 * are the types whose sections the config-driven engine renders today; the live
 * preview renders each from the shared sample-invoice fixture.
 */
export const DOCUMENT_TYPES: DocumentTypeMeta[] = [
  {
    type: 'invoice',
    label: DOC_TYPE_LABELS.invoice,
    description: 'Tax invoice issued to customers for recovery work.',
    icon: FileText,
  },
  {
    type: 'quote',
    label: DOC_TYPE_LABELS.quote,
    description: 'Quotation sent for customer approval before work starts.',
    icon: FileSignature,
  },
  {
    type: 'payment_receipt',
    label: DOC_TYPE_LABELS.payment_receipt,
    description: 'Receipt confirming a payment received against an invoice.',
    icon: Receipt,
  },
  {
    type: 'office_receipt',
    label: DOC_TYPE_LABELS.office_receipt,
    description: 'Intake receipt printed when a device arrives at the lab.',
    icon: PackageOpen,
  },
  {
    type: 'checkout_form',
    label: DOC_TYPE_LABELS.checkout_form,
    description: 'Form signed when a device is returned or collected.',
    icon: ClipboardCheck,
  },
];
