/**
 * Terms section — per-document-type Terms & Conditions + Notes, plus optional
 * bank box.
 *
 * T&C content is OWNED BY THE TEMPLATE (`config.termsContent`), edited in the
 * Studio per document type — a Quotation's terms differ from an Invoice's. Each
 * block (Terms, then Notes) renders a bold heading (from `labels.terms` /
 * `labels.notes`) + the English body, and on bilingual documents the Arabic body
 * alongside (right-aligned). The tenant-wide `legal_compliance.standard_terms_*`
 * and per-record document terms are NOT read — the template is the single source.
 *
 * The bank box is folded into the terms row (left 50% terms / right 50% bank)
 * when the standalone, movable `bank` section is hidden; when that section is
 * enabled it renders there instead and this section omits it (no double-render).
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { safeString } from '../../utils';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import type {
  BankBlock,
  EngineContext,
  EngineDocData,
  LabelText,
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
  const language = engine.config.language;
  const bilingual = isBilingualMode(language);

  // When the tenant enables the standalone, movable "Bank details" section, the
  // bank box renders THERE (positionable) — so the terms section must not also
  // render it (avoid double-rendering). Default templates keep the inline box.
  const bankSectionVisible = engine.config.sections.some((s) => s.key === 'bank' && s.visible);
  const bank = !bankSectionVisible && data.bank && data.bank.rows.length > 0 ? data.bank : null;

  // T&C content is per-document-type, owned by the template
  // (Studio → Other Details → Terms & Conditions). Each block renders its
  // heading + English body, with the Arabic body alongside on bilingual docs.
  const tc = engine.config.termsContent;
  const termsStack: Content[] = [];

  const pushBlock = (heading: LabelText, body: { en?: string; ar?: string } | undefined): void => {
    const enBody = body?.en?.trim();
    if (!enBody) return; // both Terms and Notes are optional — skip empty blocks
    if (termsStack.length > 0) {
      termsStack.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
    }
    termsStack.push(
      {
        text: bilingual ? resolveLabel(heading, language) : en(heading),
        fontSize: 9, bold: true, color: PDF_COLORS.text, margin: [0, 0, 0, 3] as [number, number, number, number],
      },
      { text: enBody, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3 },
    );
    const arBody = body?.ar?.trim();
    if (bilingual && arBody) {
      termsStack.push({
        text: arBody, fontSize: 7, color: PDF_COLORS.textLight, lineHeight: 1.3,
        alignment: 'right', margin: [0, 2, 0, 0] as [number, number, number, number],
      });
    }
  };

  pushBlock(engine.config.labels.terms ?? { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, tc?.terms);
  pushBlock(engine.config.labels.notes ?? { en: 'Notes', ar: 'ملاحظات' }, tc?.notes);

  // ---- Structured layout: terms stack + optional bank box -----------------
  if (termsStack.length > 0 || bank) {
    if (!bank) {
      // Terms only — full width.
      if (termsStack.length === 0) return null;
      return { stack: termsStack, margin: [0, 8, 0, 0] };
    }
    // Terms + bank, two columns (50/50). With no terms the left column is an
    // empty spacer so the bank box still sits on the right.
    return {
      columns: [
        { width: '50%', stack: termsStack.length > 0 ? termsStack : [{ text: '' }] },
        { width: 8, text: '' },
        { width: '50%', stack: [bankBox(bank, engine)] },
      ],
      margin: [0, 8, 0, 0],
    };
  }

  return null;
};
