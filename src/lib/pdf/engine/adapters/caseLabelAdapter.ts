/**
 * Case-label adapter — maps the real {@link ReceiptData} (case + devices +
 * company settings) into the document-agnostic {@link EngineDocData} for the
 * physical `case_label` document: the small print-friendly sticker attached to a
 * received device/case.
 *
 * A case label is a self-contained body (no party blocks, no money, no device
 * table): a large centered case number, an optional colour-coded priority badge,
 * the received date, and a short device-summary list. The adapter owns ALL
 * domain knowledge: the `case_number ?? case_no` fallback, the RAW priority
 * pass-through (so `renderCaseLabel` colours the badge via `getPriorityColor`),
 * the received-date formatting, and the device-summary composition (first device
 * "Brand Model — Type" plus a "+N more device(s)" line). The section renderer
 * stays dumb.
 *
 * Mirrors `receiptAdapter.ts` in shape, but a label carries a single
 * {@link CaseLabelBlock} instead of `caseInfo` + `devices` + `legalTerms`.
 *
 * Parity reference: `documents/CaseLabelDocument.ts` (case-number block lines
 * ~53-71, priority badge ~34-48, received date ~73-89, device summary ~139-198).
 */

import type { CaseData, DeviceData, ReceiptData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { formatDate, safeString } from '../../utils';
import type { CaseLabelBlock, EngineDocData, LabelText } from '../types';

/**
 * The short device-summary lines shown under the divider:
 * - line 0: the primary device, "Brand Model — Type" (focal device line).
 * - line 1 (optional): "+ N more device(s)" when the case holds more than one.
 *
 * Empty array when the case has no devices (the renderer then omits the summary
 * block entirely), matching the legacy builder's `deviceSummary ? … : ''`.
 */
function deviceSummaryLines(devices: DeviceData[]): string[] {
  if (devices.length === 0) return [];

  const primary = devices[0];
  const brandModel = `${safeString(primary.brand)} ${safeString(primary.model)}`.trim();
  const type = safeString(primary.device_type);
  // "Brand Model — Type", degrading gracefully if either side is missing.
  const head = brandModel && type !== '-' && type !== '' ? `${brandModel} — ${type}` : brandModel || type;

  const lines: string[] = [head || '-'];
  if (devices.length > 1) {
    lines.push(`+ ${devices.length - 1} more device(s)`);
  }
  return lines;
}

/** Build the case-label body block from the case + its devices. */
function caseLabelBlock(caseData: CaseData, devices: DeviceData[]): CaseLabelBlock {
  // Prefer the formatted `case_number`, fall back to the raw `case_no` (parity
  // with the legacy builder's `caseData.case_number ?? caseData.case_no`).
  const caseNumber = caseData.case_number ?? caseData.case_no;

  return {
    caseNumber: safeString(caseNumber),
    // RAW priority string drives the badge colour in renderCaseLabel; omit when
    // absent so no badge is drawn.
    ...(caseData.priority ? { priority: caseData.priority } : {}),
    receivedAt: `${formatDate(caseData.created_at, 'dd/MM/yyyy')} ${formatDate(caseData.created_at, 'HH:mm')}`.trim(),
    deviceSummary: deviceSummaryLines(devices),
    subtitle: { en: 'CASE NUMBER', ar: 'رقم الحالة' },
  };
}

export function toEngineData(
  data: ReceiptData,
  _config: DocumentTemplateConfig,
): EngineDocData {
  const { caseData, devices, companySettings } = data;

  // ---- Title ---------------------------------------------------------------
  const documentTitle: LabelText = {
    en: 'CASE LABEL',
    ar: 'ملصق الحالة',
  };

  // ---- Case-label body -----------------------------------------------------
  const caseLabel: CaseLabelBlock = caseLabelBlock(caseData, devices);

  return {
    documentTitle,
    identity: companySettings,
    parties: {},
    meta: [],
    caseLabel,
    // A label carries no money, no party blocks, no device table.
    paymentHistory: null,
    terms: null,
    bank: null,
    qrCaption: companySettings.branding?.qr_code_label_caption || 'Scan to track',
  };
}
