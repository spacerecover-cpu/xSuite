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
  FileMinus,
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

/** The bands the document types are grouped into in the Studio landing rail. */
export type DocCategory = 'financial' | 'intake' | 'reports' | 'internal';

export interface DocumentTypeMeta {
  type: TemplateDocumentType;
  label: string;
  description: string;
  icon: LucideIcon;
  category: DocCategory;
}

/** Category rail metadata (order = display order). */
export const DOC_CATEGORIES: { id: DocCategory; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'financial', label: 'Financial', description: 'Customer-facing money documents', icon: Receipt },
  { id: 'intake', label: 'Intake & Custody', description: 'Device receipts, labels & custody', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', description: 'Diagnostic & forensic reports', icon: ClipboardList },
  { id: 'internal', label: 'Internal', description: 'Inventory & HR documents', icon: Barcode },
];

/** Display label for every supported template document type. */
export const DOC_TYPE_LABELS: Record<TemplateDocumentType, string> = {
  invoice: 'Invoice',
  quote: 'Quotation',
  credit_note: 'Credit note',
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
    category: 'financial',
  },
  {
    type: 'quote',
    label: DOC_TYPE_LABELS.quote,
    description: 'Quotation sent for customer approval before work starts.',
    icon: FileSignature,
    category: 'financial',
  },
  {
    type: 'payment_receipt',
    label: DOC_TYPE_LABELS.payment_receipt,
    description: 'Receipt confirming a payment received against an invoice.',
    icon: Receipt,
    category: 'financial',
  },
  {
    type: 'credit_note',
    label: DOC_TYPE_LABELS.credit_note,
    description: 'Credit note issued to reduce or refund a prior invoice.',
    icon: FileMinus,
    category: 'financial',
  },
  {
    type: 'office_receipt',
    label: DOC_TYPE_LABELS.office_receipt,
    description: "Office's intake receipt printed when a device arrives at the lab.",
    icon: PackageOpen,
    category: 'intake',
  },
  {
    type: 'customer_copy',
    label: DOC_TYPE_LABELS.customer_copy,
    description: "Customer's copy of the device check-in receipt.",
    icon: Copy,
    category: 'intake',
  },
  {
    type: 'checkout_form',
    label: DOC_TYPE_LABELS.checkout_form,
    description: 'Receipt signed when a device is returned or collected.',
    icon: ClipboardCheck,
    category: 'intake',
  },
  {
    type: 'case_label',
    label: DOC_TYPE_LABELS.case_label,
    description: 'Physical label affixed to an intake case for tracking.',
    icon: Tag,
    category: 'intake',
  },
  {
    type: 'chain_of_custody',
    label: DOC_TYPE_LABELS.chain_of_custody,
    description: 'Forensic chain-of-custody log for a case.',
    icon: ShieldCheck,
    category: 'intake',
  },
  {
    type: 'report',
    label: DOC_TYPE_LABELS.report,
    description: 'Diagnostic / forensic case report delivered to the customer.',
    icon: ClipboardList,
    category: 'reports',
  },
  {
    type: 'stock_label',
    label: DOC_TYPE_LABELS.stock_label,
    description: 'Barcode label for an inventory / stock item.',
    icon: Barcode,
    category: 'internal',
  },
  {
    type: 'payslip',
    label: DOC_TYPE_LABELS.payslip,
    description: 'Employee payslip for a payroll period.',
    icon: Wallet,
    category: 'internal',
  },
];
