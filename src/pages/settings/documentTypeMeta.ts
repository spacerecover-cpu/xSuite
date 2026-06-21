/**
 * Presentation metadata for the Settings → Documents surface.
 *
 * Maps each {@link TemplateDocumentType} to a human label, a short description,
 * and a `lucide-react` icon. `DOCUMENT_TYPES` is the FULL set of types the
 * config-driven engine renders (see `src/lib/pdf/engine/registry.ts`) — every
 * one appears in the landing grid, each with a live preview rendered from its
 * own representative sample data (`src/lib/pdf/engine/sampleData.ts`).
 *
 * Pure data — no React, no DB. Kept separate so both the landing page and the
 * editor share the same labels.
 */

import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Receipt,
  FileSignature,
  ClipboardCheck,
  PackageOpen,
  Copy,
  Tag,
  Barcode,
  Wallet,
  ShieldCheck,
  ClipboardList,
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
  office_receipt: 'Office check-in receipt',
  customer_copy: 'Customer check-in copy',
  checkout_form: 'Device checkout receipt',
  case_label: 'Case label',
  stock_label: 'Stock label',
  payslip: 'Payslip',
  chain_of_custody: 'Chain of custody',
  report: 'Case report',
};

/**
 * Every engine-rendered document type, surfaced in the landing grid. Each opens
 * the template Studio + gallery and previews from its own sample data.
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
    description: "Office's intake receipt printed when a device arrives at the lab.",
    icon: PackageOpen,
  },
  {
    type: 'customer_copy',
    label: DOC_TYPE_LABELS.customer_copy,
    description: "Customer's copy of the device check-in receipt.",
    icon: Copy,
  },
  {
    type: 'checkout_form',
    label: DOC_TYPE_LABELS.checkout_form,
    description: 'Receipt signed when a device is returned or collected.',
    icon: ClipboardCheck,
  },
  {
    type: 'case_label',
    label: DOC_TYPE_LABELS.case_label,
    description: 'Physical label affixed to an intake case for tracking.',
    icon: Tag,
  },
  {
    type: 'stock_label',
    label: DOC_TYPE_LABELS.stock_label,
    description: 'Barcode label for an inventory / stock item.',
    icon: Barcode,
  },
  {
    type: 'chain_of_custody',
    label: DOC_TYPE_LABELS.chain_of_custody,
    description: 'Forensic chain-of-custody log for a case.',
    icon: ShieldCheck,
  },
  {
    type: 'report',
    label: DOC_TYPE_LABELS.report,
    description: 'Diagnostic / forensic case report delivered to the customer.',
    icon: ClipboardList,
  },
  {
    type: 'payslip',
    label: DOC_TYPE_LABELS.payslip,
    description: 'Employee payslip for a payroll period.',
    icon: Wallet,
  },
];
