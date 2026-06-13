/**
 * Section registry — maps a config section `key` to its {@link SectionRenderer}.
 *
 * `renderTemplate` looks each visible, ordered section up here and dispatches.
 * Keys with no entry are skipped safely (a tenant override may reference a
 * section the engine doesn't render yet; that must not crash document
 * generation). The keys covered mirror the financial + intake defaults in
 * `templateConfig.ts`. Case-intake/checkout keys (`caseInfo`, `devices`,
 * `collector`, `legalTerms`) and the forensic/label keys (`custodyLog`,
 * `caseLabel`) ARE registered, as are the payslip keys (`payslipInfo`,
 * `earnings`, `deductions`, `netPay`), the stock-label key (`stockLabel`), and
 * the case-report keys (`diagnostics` for the device diagnostics info box and
 * `reportSections` for the ordered DB-driven prose sections — the custody
 * timeline reuses `custodyLog`). Remaining document-specific keys (`summary`,
 * `findings`) are intentionally NOT registered yet — they belong to later
 * milestones and are skipped until then.
 */

import type { SectionRenderer } from './types';
import { renderHeader } from './sections/header';
import { renderParties, renderMeta } from './sections/infoBoxes';
import { renderCaseInfo } from './sections/caseInfo';
import { renderDevices } from './sections/devices';
import { renderCollector } from './sections/collector';
import { renderLegalTerms } from './sections/legalTerms';
import { renderCustodyLog } from './sections/custodyLog';
import { renderDiagnostics } from './sections/reportDiagnostics';
import { renderReportSections } from './sections/reportSections';
import { renderCaseLabel } from './sections/caseLabel';
import { renderPayslipInfo } from './sections/payslipInfo';
import { renderEarnings } from './sections/earnings';
import { renderDeductions } from './sections/deductions';
import { renderNetPay } from './sections/netPay';
import { renderStockLabel } from './sections/stockLabel';
import { renderLineItems } from './sections/lineItemTable';
import { renderTotals } from './sections/totals';
import { renderPaymentHistory } from './sections/paymentHistory';
import { renderTerms } from './sections/terms';
import { renderBank } from './sections/bank';
import { renderSignature } from './sections/signature';
import { renderQr } from './sections/qr';
import { renderFooter } from './sections/footer';

export const SECTION_REGISTRY: Record<string, SectionRenderer> = {
  header: renderHeader,
  parties: renderParties,
  meta: renderMeta,
  caseInfo: renderCaseInfo,
  devices: renderDevices,
  collector: renderCollector,
  legalTerms: renderLegalTerms,
  custodyLog: renderCustodyLog,
  diagnostics: renderDiagnostics,
  reportSections: renderReportSections,
  caseLabel: renderCaseLabel,
  payslipInfo: renderPayslipInfo,
  earnings: renderEarnings,
  deductions: renderDeductions,
  netPay: renderNetPay,
  stockLabel: renderStockLabel,
  lineItems: renderLineItems,
  totals: renderTotals,
  paymentHistory: renderPaymentHistory,
  terms: renderTerms,
  bank: renderBank,
  signature: renderSignature,
  qr: renderQr,
  footer: renderFooter,
};
