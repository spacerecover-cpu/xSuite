/**
 * Bank section — pre-labelled bank-detail rows in a bordered box. Generalized
 * from the bank-account block embedded in the financial builders' terms area
 * (see `documents/InvoiceDocument.ts` lines ~407-441), rendered through the
 * shared `createBilingualInfoBox` helper.
 *
 * Modeling note: this section key is not in the built-in financial defaults
 * (the hand-written builders fold bank details into the terms row). It is
 * registered for forward-compatibility so a tenant override that adds a `bank`
 * section renders correctly; absent a `bank` section in config it is simply
 * never dispatched.
 */

import type { Content } from 'pdfmake/interfaces';
import { createBilingualInfoBox } from '../../styles';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderBank: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const bank = data.bank;
  if (!bank || bank.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);

  const rows: object[] = bank.rows.map((r) => ({
    text: `${resolveLabel(r.label, language)} ${safeString(r.value)}`,
    fontSize: 7,
    color: PDF_COLORS.text,
    margin: [0, 1, 0, 1],
  }));

  const box = createBilingualInfoBox(
    en(bank.title, 'Bank Account'),
    bilingual ? ar(bank.title) : null,
    rows,
  ) as Content;

  return { stack: [box], margin: [0, 8, 0, 0] };
};
