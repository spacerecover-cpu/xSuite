/**
 * Terms section — terms & conditions / notes block. Reuses `createTermsBox`
 * from `styles.ts` so the EN/AR two-column treatment matches the hand-written
 * builders exactly.
 *
 * The Arabic title/body are passed through only in bilingual modes; in single
 * language modes the helper renders the single (EN or AR-as-EN) column.
 */

import type { Content } from 'pdfmake/interfaces';
import { createTermsBox } from '../../styles';
import { isBilingualMode, en, ar } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderTerms: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const terms = data.terms;
  if (!terms || !terms.body) return null;

  const bilingual = isBilingualMode(engine.config.language);

  // The engine carries a single (already-resolved) body string. When bilingual,
  // the title's Arabic form is shown; a translated body is the adapter's job to
  // supply later — for now we render the EN body in both modes and let the AR
  // *title* surface, which is the part config controls.
  return createTermsBox(
    en(terms.title, 'Terms & Conditions'),
    bilingual ? ar(terms.title) : null,
    terms.body,
    null,
  ) as Content;
};
