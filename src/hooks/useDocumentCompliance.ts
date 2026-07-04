// Render-time compliance view for the React preview components (Invoice/Quote
// documents) — Localization Phase 2, WP-4 Task 14.
//
// AD-2 (choke point): the title + registration-band decision is made EXACTLY
// ONCE, inside `countryTemplateOverride` (Task 6). The pdfmake adapters reach it
// via `resolveCountryLayer` (see `pdfService.ts`); this hook reaches the SAME
// function with the SAME inputs and reads its OUTPUT — it does NOT call
// `profile.documentTitle()` or re-derive the registration-band rule itself. That
// is what makes print and preview structurally unable to diverge.
//
// AD-3 (no render-time tax math): component tax rows come from the
// `document_tax_lines` rollups (`fetchDocumentTaxLines`, Task 11), never a
// `(subtotal - discount) * rate / 100` recompute. A document with no tax_lines
// (draft / legacy / backfilled) falls back to ONE row built from the stored
// header scalar the caller passes in.
import { useQuery } from '@tanstack/react-query';
import { resolveComplianceRenderInputs } from '../lib/pdf/engine/profileResolver';
import { fetchDocumentTaxLines } from '../lib/pdf/dataFetcher';
import { countryTemplateOverride, type ComplianceOverrideInputs } from '../lib/pdf/engine/countryConfig';
import { documentComplianceKeys } from '../lib/queryKeys';

export interface DocumentComplianceView {
  title: { en: string; ar?: string };
  /** e.g. 'VATIN' — null hides the registration band entirely. */
  taxBandLabel: string | null;
  sellerTaxNumber: string | null;
  /** One entry per `document_tax_lines` rollup component (or the single stored fallback). */
  taxRows: Array<{ label: string; amount: number }>;
  dateFormat: string | null;
  loading: boolean;
}

const FALLBACK_TITLE: Record<'quote' | 'invoice' | 'credit_note', string> = {
  quote: 'QUOTATION',
  invoice: 'INVOICE',
  credit_note: 'CREDIT NOTE',
};

/**
 * @param documentId null = unsaved draft (no tax lines exist yet); the fallback
 *   scalar is used instead.
 * @param fallback the document's STORED header tax_rate/tax_amount, used only
 *   when the document carries no `document_tax_lines` rows.
 */
export function useDocumentCompliance(
  docType: 'quote' | 'invoice' | 'credit_note',
  documentId: string | null,
  fallback: { taxRate: number | null; taxAmount: number },
): DocumentComplianceView {
  const inputsQuery = useQuery({
    queryKey: documentComplianceKeys.inputs(),
    queryFn: resolveComplianceRenderInputs,
    staleTime: 5 * 60 * 1000,
  });
  const linesQuery = useQuery({
    queryKey: documentComplianceKeys.taxLines(docType, documentId),
    queryFn: () => fetchDocumentTaxLines(docType, documentId as string),
    enabled: documentId != null,
  });

  const inputs = inputsQuery.data;
  const facts = inputs?.facts ?? null;

  // The choke point: same call shape as `resolveCountryLayer` (pdfService.ts) —
  // read its title/band/locale decision, never `profile.documentTitle()` directly.
  const override =
    facts && inputs
      ? countryTemplateOverride(facts, {
          profile: inputs.profile,
          sellerRegistered: inputs.sellerRegistered,
          docType,
        } satisfies ComplianceOverrideInputs)
      : null;

  const titleLabel = override?.labels?.documentTitle;
  const title = titleLabel
    ? { en: titleLabel.en, ...(titleLabel.ar ? { ar: titleLabel.ar } : {}) }
    : { en: FALLBACK_TITLE[docType] };

  const rollups = (linesQuery.data ?? []).filter((l) => l.line_item_id === null);
  const taxRows =
    rollups.length > 0
      ? rollups.map((r) => ({ label: r.component_label, amount: r.tax_amount }))
      : fallback.taxAmount !== 0 || (fallback.taxRate ?? 0) > 0
        ? [{ label: `${facts?.taxLabel ?? 'Tax'}${fallback.taxRate != null ? ` ${fallback.taxRate}%` : ''}`, amount: fallback.taxAmount }]
        : [];

  return {
    title,
    taxBandLabel: override?.taxBar?.enabled ? (override.taxBar.label?.en ?? null) : null,
    sellerTaxNumber: inputs?.sellerTaxNumber ?? null,
    taxRows,
    dateFormat: override?.locale?.dateFormat ?? null,
    loading: inputsQuery.isLoading || (documentId != null && linesQuery.isLoading),
  };
}
