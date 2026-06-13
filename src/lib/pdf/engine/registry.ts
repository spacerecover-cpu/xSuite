/**
 * Section registry — maps a config section `key` to its {@link SectionRenderer}.
 *
 * `renderTemplate` looks each visible, ordered section up here and dispatches.
 * Keys with no entry are skipped safely (a tenant override may reference a
 * section the engine doesn't render yet; that must not crash document
 * generation). The keys covered mirror the financial + intake defaults in
 * `templateConfig.ts`; document-specific keys (`caseInfo`, `devices`,
 * `custodyLog`, `employee`, `period`, `earnings`, `deductions`, `summary`,
 * `findings`, `sections`, `stockInfo`, `collector`) are intentionally NOT
 * registered yet — they belong to later milestones and are skipped until then.
 */

import type { SectionRenderer } from './types';
import { renderHeader } from './sections/header';
import { renderParties, renderMeta } from './sections/infoBoxes';
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
  lineItems: renderLineItems,
  totals: renderTotals,
  paymentHistory: renderPaymentHistory,
  terms: renderTerms,
  bank: renderBank,
  signature: renderSignature,
  qr: renderQr,
  footer: renderFooter,
};
