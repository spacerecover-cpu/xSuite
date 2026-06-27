/**
 * Legal-terms section — a consent / Terms-&-Conditions acknowledgement box for
 * intake (office_receipt / customer_copy) and checkout (checkout_form)
 * documents. The customer authorizes the lab to proceed, or acknowledges
 * checkout/T&C.
 *
 * Generalized from the acknowledgement boxes hand-written in
 * `documents/OfficeReceiptDocument.ts` (terms section, lines ~267-277),
 * `documents/CustomerCopyDocument.ts` (lines ~265-326), and
 * `documents/CheckoutFormDocument.ts` (lines ~278-334). It reuses the shared
 * `createTermsBox` helper, which already renders a bilingual EN/AR two-column
 * box (and an optional policy link) and right-aligns the Arabic column. Both the
 * title and the body are {@link LabelText}, so the Arabic strings come straight
 * from the adapter — never the hardcoded `null` the legacy single-language path
 * passed.
 *
 * Distinct from the financial `terms` section: that one drives the Payment-Terms
 * / Notes + bank two-column layout; this one is a single consent box keyed off
 * {@link EngineDocData.legalTerms}.
 */

import type { Content } from 'pdfmake/interfaces';
import { createTermsBox } from '../../styles';
import { isBilingualMode, en, ar } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderLegalTerms: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const legal = data.legalTerms;
  if (!legal || !en(legal.body)) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);

  return createTermsBox(
    en(legal.title, 'Terms & Conditions'),
    bilingual ? ar(legal.title, language) : null,
    en(legal.body),
    bilingual ? ar(legal.body, language) : null,
    legal.policyUrl ?? null,
  ) as Content;
};
