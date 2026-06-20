/**
 * Bank section — a COMPACT bank-account box.
 *
 * Field labels (Account Name, Account No., Bank, IBAN, SWIFT …) render
 * English-only: these are functional identifiers and a translated label only
 * adds clutter. The box HEADER stays bilingual on bilingual documents (English
 * left / Arabic right), matching the other info-boxes.
 *
 * `buildBankBox` is the shared builder, used both as the standalone, movable
 * `bank` section (this renderer) and inline within the terms section.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import { isBilingualMode, en, ar } from '../labels';
import type { BankBlock, EngineContext, EngineDocData, SectionRenderer } from '../types';

/** A compact bank-account box: bilingual header, English-only field labels. */
export function buildBankBox(bank: BankBlock, engine: EngineContext): Content {
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);

  const headerColumns: object[] = [
    { text: en(bank.title, 'Bank Account'), fontSize: 8, bold: true, color: PDF_COLORS.text, width: 'auto' },
    { text: '', width: '*' },
  ];
  if (bilingual) {
    headerColumns.push({
      text: ar(bank.title) ?? 'تفاصيل البنك',
      fontSize: 8, bold: true, color: PDF_COLORS.text, alignment: 'right', width: 'auto',
    });
  }

  return {
    table: {
      widths: ['*'],
      body: [
        [{ columns: headerColumns, columnGap: 6, fillColor: PDF_COLORS.background, margin: [6, 3, 6, 3] }],
        [{
          stack: bank.rows.map((r) => ({
            text: `${en(r.label)} ${safeString(r.value)}`,
            fontSize: 7,
            color: PDF_COLORS.text,
            margin: [0, 0.5, 0, 0.5],
          })),
          margin: [6, 3, 6, 4],
        }],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
  } as Content;
}

export const renderBank: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const bank = data.bank;
  if (!bank || bank.rows.length === 0) return null;
  return { stack: [buildBankBox(bank, engine)], margin: [0, 8, 0, 0] as [number, number, number, number] };
};
