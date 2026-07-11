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
  Barcode,
  Wallet,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import type { TemplateDocumentType, TemplateStorageKey } from '../../lib/pdf/templateConfig';
import { reportTemplateKey } from '../../lib/pdf/templateConfig';
import { REPORT_TYPES } from '../../lib/reportTypes';

/** The bands the document types are grouped into in the Studio landing rail. */
export type DocCategory = 'financial' | 'intake' | 'reports' | 'internal';

export interface DocumentTypeMeta {
  /** Storage key of the tenant template row this card edits (`document_type`). */
  key: TemplateStorageKey;
  type: TemplateDocumentType;
  /** Set on the 8 report cards: the report type the template is scoped to. */
  reportSubtype?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: DocCategory;
}

/** Category rail metadata (order = display order). */
export const DOC_CATEGORIES: { id: DocCategory; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'financial', label: 'Financial', description: 'Customer-facing money documents', icon: Receipt },
  { id: 'intake', label: 'Intake & Custody', description: 'Device receipts & custody', icon: ShieldCheck },
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
 * The 8 report types, each surfaced as its own template card in the Reports
 * category (subtype-scoped storage key). Names/descriptions/icons come from the
 * canonical {@link REPORT_TYPES} catalog.
 */
const REPORT_TEMPLATE_CARDS: DocumentTypeMeta[] = Object.values(REPORT_TYPES).map((rt) => ({
  key: reportTemplateKey(rt.key),
  type: 'report' as const,
  reportSubtype: rt.key,
  label: rt.name,
  description: rt.description,
  icon: rt.icon,
  category: 'reports' as const,
}));

/**
 * The legacy shared report template (bare `report` storage key). Generation
 * falls back to it for any report type without its own template, so while a
 * tenant still has this row the Reports category shows this extra card to keep
 * it editable / resettable. New tenants never create it.
 */
export const LEGACY_REPORT_CARD: DocumentTypeMeta = {
  key: 'report',
  type: 'report',
  label: 'All reports — shared base',
  description: 'Legacy shared template that styles any report type without its own customization.',
  icon: ClipboardList,
  category: 'reports',
};

/**
 * Every engine-rendered document type, surfaced in the landing grid. Each opens
 * the template Studio + gallery and previews from its own sample data.
 */
export const DOCUMENT_TYPES: DocumentTypeMeta[] = [
  {
    key: 'invoice',
    type: 'invoice',
    label: DOC_TYPE_LABELS.invoice,
    description: 'Tax invoice issued to customers for recovery work.',
    icon: FileText,
    category: 'financial',
  },
  {
    key: 'quote',
    type: 'quote',
    label: DOC_TYPE_LABELS.quote,
    description: 'Quotation sent for customer approval before work starts.',
    icon: FileSignature,
    category: 'financial',
  },
  {
    key: 'payment_receipt',
    type: 'payment_receipt',
    label: DOC_TYPE_LABELS.payment_receipt,
    description: 'Receipt confirming a payment received against an invoice.',
    icon: Receipt,
    category: 'financial',
  },
  {
    key: 'credit_note',
    type: 'credit_note',
    label: DOC_TYPE_LABELS.credit_note,
    description: 'Credit note issued to reduce or refund a prior invoice.',
    icon: FileMinus,
    category: 'financial',
  },
  {
    key: 'office_receipt',
    type: 'office_receipt',
    label: DOC_TYPE_LABELS.office_receipt,
    description: "Office's intake receipt printed when a device arrives at the lab.",
    icon: PackageOpen,
    category: 'intake',
  },
  {
    key: 'customer_copy',
    type: 'customer_copy',
    label: DOC_TYPE_LABELS.customer_copy,
    description: "Customer's copy of the device check-in receipt.",
    icon: Copy,
    category: 'intake',
  },
  {
    key: 'checkout_form',
    type: 'checkout_form',
    label: DOC_TYPE_LABELS.checkout_form,
    description: 'Receipt signed when a device is returned or collected.',
    icon: ClipboardCheck,
    category: 'intake',
  },
  {
    key: 'chain_of_custody',
    type: 'chain_of_custody',
    label: DOC_TYPE_LABELS.chain_of_custody,
    description: 'Forensic chain-of-custody log for a case.',
    icon: ShieldCheck,
    category: 'intake',
  },
  ...REPORT_TEMPLATE_CARDS,
  {
    key: 'payslip',
    type: 'payslip',
    label: DOC_TYPE_LABELS.payslip,
    description: 'Employee payslip for a payroll period.',
    icon: Wallet,
    category: 'internal',
  },
];
