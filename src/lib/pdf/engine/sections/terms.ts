/**
 * Terms section — terms & conditions / notes block + optional bank box.
 *
 * Two layouts, matching the legacy `documents/InvoiceDocument.ts`:
 *
 * 1. Legacy-flat (`data.terms.body`): a single EN/AR terms box via the shared
 *    `createTermsBox` helper. The Arabic title surfaces in bilingual modes.
 *
 * 2. Structured (`data.terms.blocks`): separate Payment Terms / Notes stacks
 *    (each a bold heading + prose body) laid out alongside the bank-account box
 *    in a two-column row — mirroring `InvoiceDocument`'s `termsAndBankSection`
 *    (lines ~370-485). When a `bank` block is present the stacks take the left
 *    50% and the bank box the right 50%; otherwise the stacks span full width.
 *
 * The bank box is rendered HERE when `blocks` is used (the legacy builder folds
 * bank into the terms row). The standalone `bank` section renderer still exists
 * for configs that place a `bank` section on its own; this section consumes
 * `data.bank` only in the structured-blocks layout to avoid double-rendering.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createTermsBox } from '../../styles';
import { safeString } from '../../utils';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import type {
  BankBlock,
  EngineContext,
  EngineDocData,
  SectionRenderer,
} from '../types';

/** Build the bilingual bank-account box used in the structured terms+bank row. */
function bankBox(bank: BankBlock, engine: EngineContext): Content {
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const bankTitle = bilingual
    ? `${en(bank.title, 'Bank Account')} | ${ar(bank.title) ?? 'تفاصيل البنك'}`
    : en(bank.title, 'Bank Account');

  return {
    stack: [
      { text: bankTitle, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] },
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: bank.rows.map((r) => ({
                  text: `${resolveLabel(r.label, language)} ${safeString(r.value)}`,
                  fontSize: 7,
                  color: PDF_COLORS.text,
                  margin: [0, 1, 0, 1] as [number, number, number, number],
                })),
                fillColor: PDF_COLORS.background,
                margin: [6, 4, 6, 4],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
      },
    ],
  };
}

export const renderTerms: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const terms = data.terms;
  const bilingual = isBilingualMode(engine.config.language);

  // ---- Structured layout: Payment Terms / Notes stacks + optional bank box --
  const blocks = terms?.blocks?.filter((b) => b.body);
  const bank = data.bank && data.bank.rows.length > 0 ? data.bank : null;

  if ((blocks && blocks.length > 0) || (terms && terms.blocks && bank)) {
    // Build the terms-stack column (Payment Terms, then Notes, …).
    const termsStack: Content[] = [];
    (blocks ?? []).forEach((b, idx) => {
      if (idx > 0) termsStack.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
      const heading = bilingual
        ? resolveLabel(b.title, engine.config.language)
        : en(b.title);
      termsStack.push(
        { text: heading, fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] as [number, number, number, number] },
        { text: b.body, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 },
      );
    });

    if (!bank) {
      // Terms only — full width.
      if (termsStack.length === 0) return null;
      return { stack: termsStack, margin: [0, 8, 0, 0] };
    }

    // Terms + bank, two columns (50/50). When there are no terms blocks the
    // left column is an empty spacer so the bank box still sits on the right.
    return {
      columns: [
        { width: '50%', stack: termsStack.length > 0 ? termsStack : [{ text: '' }] },
        { width: 8, text: '' },
        { width: '50%', stack: [bankBox(bank, engine)] },
      ],
      margin: [0, 8, 0, 0],
    };
  }

  // ---- Legacy-flat layout: single EN/AR terms box -------------------------
  if (!terms || !terms.body) return null;

  return createTermsBox(
    en(terms.title, 'Terms & Conditions'),
    bilingual ? ar(terms.title) : null,
    terms.body,
    null,
  ) as Content;
};
