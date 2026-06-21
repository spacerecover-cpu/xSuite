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

/** ~half of the 525pt content width — the fixed column for the `'half'` width. */
const HALF_WIDTH = 250;

interface BankDisplay {
  style: 'boxed' | 'inline';
  width: 'auto' | 'half' | 'full';
  align: 'left' | 'center' | 'right';
}

/** The configured bank display (style + boxed width + alignment), read from the
 *  movable `bank` section so the inline and standalone renders stay in sync. */
function bankDisplay(engine: EngineContext): BankDisplay {
  const s = engine.config.sections.find((x) => x.key === 'bank');
  return {
    style: s?.bankStyle === 'inline' ? 'inline' : 'boxed',
    width: s?.bankWidth ?? 'auto',
    align: s?.bankAlign ?? 'left',
  };
}

/**
 * A single compact line: `Bank Account: <name> | Account No: <n> | Bank: <b> …`.
 * The box title leads (so the account name needs no redundant "Account Name:"
 * label); every other present field keeps its label. Absent fields are omitted.
 */
function buildBankInline(bank: BankBlock): Content {
  const title = en(bank.title, 'Bank Account');
  const segments = bank.rows.map((r) => {
    const label = en(r.label);
    const value = safeString(r.value);
    return /account\s*name/i.test(label) ? value : `${label} ${value}`;
  });
  return {
    text: `${title}: ${segments.join('  |  ')}`,
    fontSize: 9,
    color: PDF_COLORS.text,
    margin: [0, 0, 0, 0],
  } as Content;
}

/** A compact bank-account box. Width: `'full'` spans the row (bilingual EN/AR
 *  header); `'auto'` hugs its content; `'half'` a fixed ~half-page column. Non-full
 *  boxes are placed left/centre/right via an alignment wrapper. */
export function buildBankBox(bank: BankBlock, engine: EngineContext): Content {
  const disp = bankDisplay(engine);
  if (disp.style === 'inline') return buildBankInline(bank);

  const bilingual = isBilingualMode(engine.config.language);
  const fullWidth = disp.width === 'full';

  // Full width keeps the bilingual EN-left / AR-right header; narrow boxes show
  // the English title only (an AR title on a narrow box just crowds it).
  let headerCell: Content;
  if (fullWidth) {
    const headerColumns: object[] = [
      { text: en(bank.title, 'Bank Account'), fontSize: 9, bold: true, color: PDF_COLORS.text, width: 'auto' },
      { text: '', width: '*' },
    ];
    if (bilingual) {
      headerColumns.push({
        text: ar(bank.title) ?? 'تفاصيل البنك',
        fontSize: 9, bold: true, color: PDF_COLORS.text, alignment: 'right', width: 'auto',
      });
    }
    headerCell = { columns: headerColumns, columnGap: 6, fillColor: PDF_COLORS.background, margin: [6, 3, 6, 3] } as Content;
  } else {
    headerCell = {
      text: en(bank.title, 'Bank Account'),
      fontSize: 9, bold: true, color: PDF_COLORS.text, fillColor: PDF_COLORS.background, margin: [6, 3, 6, 3],
    } as Content;
  }

  const bodyCell: Content = {
    stack: bank.rows.map((r) => ({
      text: `${en(r.label)} ${safeString(r.value)}`,
      fontSize: 9,
      color: PDF_COLORS.text,
      margin: [0, 0.5, 0, 0.5] as [number, number, number, number],
    })),
    margin: [6, 3, 6, 4] as [number, number, number, number],
  };

  const innerTable: Content = {
    table: {
      // Full / half fill their container; auto hugs the widest line.
      widths: fullWidth || disp.width === 'half' ? ['*'] : ['auto'],
      body: [[headerCell], [bodyCell]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
  } as Content;

  if (fullWidth) return innerTable;

  // Narrow box: wrap in columns to size (half = fixed, auto = hug) and align.
  const boxCol =
    disp.width === 'half'
      ? { width: HALF_WIDTH, stack: [innerTable] }
      : { width: 'auto', stack: [innerTable] };
  const spacer = { text: '', width: '*' };
  const columns =
    disp.align === 'right' ? [spacer, boxCol]
    : disp.align === 'center' ? [spacer, boxCol, spacer]
    : [boxCol, spacer];
  return { columns } as Content;
}

export const renderBank: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const bank = data.bank;
  if (!bank || bank.rows.length === 0) return null;
  return { stack: [buildBankBox(bank, engine)], margin: [0, 8, 0, 0] as [number, number, number, number] };
};
