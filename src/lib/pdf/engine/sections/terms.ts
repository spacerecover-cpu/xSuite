/**
 * Terms section — per-document-type Terms & Conditions + Notes in a SINGLE
 * bordered box, split at the centre on bilingual documents (English | Arabic),
 * plus the optional bank box.
 *
 * Source precedence: the PER-RECORD terms the user entered on the quote/invoice
 * (resolved by the adapter into `data.terms.blocks`) take precedence; when a
 * record has none, the per-document-type template `config.termsContent` (edited
 * in the Studio) is the fallback. Per-record terms are captured in one language,
 * so on a bilingual document they fill the English column while the template
 * terms fill the Arabic column.
 *
 * Layout (mirrors the header info-boxes): on a bilingual document the box puts
 * English content in the left half and Arabic content (right-aligned) in the
 * right half, divided by a centre rule. Single-language documents render one
 * full-width column. The optional bank box (when its standalone, movable section
 * is hidden) stacks beneath the terms box as its own compact box.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { htmlToPdfmake } from '../../htmlToPdfmake';
import { isBilingualMode, en, ar } from '../labels';
import { buildBankBox } from './bank';
import type { EngineContext, EngineDocData, LabelText, SectionRenderer, TermsTextBlock } from '../types';

interface TermsBlock {
  heading: LabelText;
  body: { en?: string; ar?: string };
}

const BORDER = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => PDF_COLORS.border,
  vLineColor: () => PDF_COLORS.border,
};

/** One language column of the terms box: heading + prose for each non-empty block. */
function languageColumn(blocks: TermsBlock[], lang: 'en' | 'ar'): Content[] {
  const right = lang === 'ar';
  const align: 'left' | 'right' = right ? 'right' : 'left';
  const stack: Content[] = [];
  for (const b of blocks) {
    const body = (right ? b.body.ar : b.body.en)?.trim();
    if (!body) continue;
    if (stack.length > 0) stack.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
    const heading = right ? ar(b.heading) ?? en(b.heading) : en(b.heading);
    stack.push(
      { text: heading, fontSize: 9, bold: true, color: PDF_COLORS.text, alignment: align, margin: [0, 0, 0, 3] as [number, number, number, number] },
      { text: body, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3, alignment: align },
    );
  }
  return stack;
}

/**
 * The English column built from the PER-RECORD terms blocks the adapter resolved
 * from the edited quote/invoice (Payment Terms / Terms & Conditions, then Notes).
 * Each block's body renders as rich content when the adapter marks it
 * `format: 'html'` (rich-text editor output) and as plain prose otherwise. Blocks
 * whose body is empty — or whose HTML produces nothing — are skipped, so an empty
 * record falls back to the template terms.
 */
function perRecordColumn(blocks: TermsTextBlock[]): Content[] {
  const stack: Content[] = [];
  for (const b of blocks) {
    const body = (b.body ?? '').trim();
    if (!body) continue;
    let bodyNode: Content;
    if (b.format === 'html') {
      const rich = htmlToPdfmake(body);
      if (rich.length === 0) continue;
      bodyNode = { stack: rich, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 };
    } else {
      bodyNode = { text: body, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 };
    }
    if (stack.length > 0) stack.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
    stack.push(
      { text: en(b.title), fontSize: 9, bold: true, color: PDF_COLORS.text, alignment: 'left', margin: [0, 0, 0, 3] as [number, number, number, number] },
      bodyNode,
    );
  }
  return stack;
}

export const renderTerms: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const language = engine.config.language;
  const bilingual = isBilingualMode(language);

  // When the tenant enables the standalone, movable "Bank details" section, the
  // bank box renders THERE — so the terms section must not also render it.
  const bankSectionVisible = engine.config.sections.some((s) => s.key === 'bank' && s.visible);
  const bank = !bankSectionVisible && data.bank && data.bank.rows.length > 0 ? data.bank : null;

  const tc = engine.config.termsContent;
  const blocks: TermsBlock[] = [
    { heading: engine.config.labels.terms ?? { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: tc?.terms ?? {} },
    { heading: engine.config.labels.notes ?? { en: 'Notes', ar: 'ملاحظات' }, body: tc?.notes ?? {} },
  ];

  // Per-record terms take precedence over the template; fall back to the template
  // terms when the record carries none (or its blocks render to nothing).
  const perRecord = perRecordColumn(data.terms?.blocks ?? []);
  const enCol = perRecord.length > 0 ? perRecord : languageColumn(blocks, 'en');
  const arCol = bilingual ? languageColumn(blocks, 'ar') : [];

  const parts: Content[] = [];

  // The terms box: a single bordered box, split at the centre on bilingual docs.
  if (enCol.length > 0 || arCol.length > 0) {
    const split = arCol.length > 0;
    const cell = (stack: Content[]): Content => ({ stack, margin: [8, 6, 8, 6] as [number, number, number, number] });
    parts.push({
      table: {
        widths: split ? ['50%', '50%'] : ['*'],
        body: [split ? [cell(enCol), cell(arCol)] : [cell(enCol.length > 0 ? enCol : arCol)]],
      },
      layout: BORDER,
    } as Content);
  }

  // The optional inline bank box stacks beneath the terms box.
  if (bank) {
    if (parts.length > 0) parts.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
    parts.push(buildBankBox(bank, engine));
  }

  if (parts.length === 0) return null;
  return { stack: parts, margin: [0, 8, 0, 0] as [number, number, number, number] };
};
