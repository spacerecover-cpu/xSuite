/**
 * Terms sections — TWO independent, separately-positionable blocks:
 *
 * - `renderTerms` → the STANDARD "Terms & Conditions" (+ Notes) set per document
 *   type in the Studio (`config.termsContent`). Studio-only: it never reads the
 *   per-record terms and never falls back — it is simply omitted when the Studio
 *   content is blank. Bilingual documents split it at the centre (English | Arabic).
 *
 * - `renderRecordTerms` → the PER-RECORD "Quote Terms" / "Invoice Terms" the user
 *   entered on the quote/invoice (from Terms & Templates), resolved by the adapter
 *   into `data.terms.blocks`. Single-language, full-width; omitted when the record
 *   carries none. The section heading is renamable via the Studio section label.
 *
 * The bank box is no longer rendered here — it is its own movable section
 * (`renderBank`). Notes follow their source: Studio Notes render in the standard
 * section, per-record Notes in the per-record section.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualInfoBox } from '../../styles';
import { htmlToPdfmake } from '../../htmlToPdfmake';
import { decodeHtmlEntities } from '../../../sanitizeHtml';
import { isBilingualMode, en, ar } from '../labels';
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

/** A bordered terms box: centre-split when an Arabic column is present, else
 *  full-width. Returns null when both columns are empty (section omitted). */
function termsBox(enCol: Content[], arCol: Content[]): Content | null {
  if (enCol.length === 0 && arCol.length === 0) return null;
  const split = arCol.length > 0;
  const cell = (stack: Content[]): Content => ({ stack, margin: [8, 6, 8, 6] as [number, number, number, number] });
  const box: Content = {
    table: {
      widths: split ? ['50%', '50%'] : ['*'],
      body: [split ? [cell(enCol), cell(arCol)] : [cell(enCol.length > 0 ? enCol : arCol)]],
    },
    layout: BORDER,
  } as Content;
  return { stack: [box], margin: [0, 8, 0, 0] as [number, number, number, number] };
}

/** One language column of the standard terms box: heading + prose per non-empty block. */
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
      { text: body, fontSize: 9, color: PDF_COLORS.textLight, lineHeight: 1.3, alignment: align },
    );
  }
  return stack;
}

/** Normalize a heading for duplicate comparison: collapse whitespace, drop a
 *  trailing colon, lowercase. */
function normalizeHeading(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/[:：]\s*$/, '').toLowerCase();
}

// Standard terms headings a snippet may embed. The per-record section prints its
// own heading, so a leading heading inside the content that repeats the section
// heading OR any of these is dropped (it would otherwise render twice).
const KNOWN_TERMS_HEADINGS = new Set([
  'terms & conditions', 'terms and conditions',
  'payment terms', 'quote terms', 'invoice terms',
]);

function isTermsHeading(candidate: string, sectionTitle: string): boolean {
  const n = normalizeHeading(candidate);
  if (!n) return false;
  return n === normalizeHeading(sectionTitle) || KNOWN_TERMS_HEADINGS.has(n);
}

/**
 * Strip a leading heading LINE from plain-text terms when it duplicates the
 * section heading (or a standard terms heading). Matched only when the heading is
 * the whole first line, never a run-on prefix, so prose that merely begins with
 * the same words is left untouched.
 */
function stripLeadingTitleLine(text: string, title: string): string {
  const nlIdx = text.search(/\r?\n/);
  const firstLine = nlIdx === -1 ? text : text.slice(0, nlIdx);
  if (!isTermsHeading(firstLine, title)) return text;
  return nlIdx === -1 ? '' : text.slice(nlIdx).replace(/^[\s]+/, '');
}

/**
 * Strip a leading heading ELEMENT (`h1`–`h6`) from rich HTML terms when its text
 * duplicates the section heading (or a standard terms heading), descending through
 * wrapper containers (the rich-text editor wraps terms in a `<div>`). Returns the
 * original HTML when there is no DOM (node fallback) or no matching leading heading.
 */
function stripLeadingHeadingHtml(html: string, title: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const firstElement = (el: Element): Element | null => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && !(child.textContent ?? '').trim()) continue;
      return child.nodeType === Node.ELEMENT_NODE ? (child as Element) : null;
    }
    return null;
  };

  let first = firstElement(doc.body);
  while (first && (first.tagName.toLowerCase() === 'div' || first.tagName.toLowerCase() === 'section')) {
    const inner = firstElement(first);
    if (!inner) break;
    first = inner;
  }
  if (first && /^h[1-6]$/.test(first.tagName.toLowerCase()) && isTermsHeading(first.textContent ?? '', title)) {
    first.remove();
    return doc.body.innerHTML;
  }
  return html;
}

/**
 * The body Content for one PER-RECORD terms block (the terms, or Notes) the
 * adapter resolved from the edited quote/invoice. Renders as rich content when
 * the adapter marks it `format: 'html'`, plain prose otherwise; returns null for
 * an empty block. The block title is the box heading, so a leading heading inside
 * the body that duplicates it (or a standard terms heading) is removed, and HTML
 * entities in plain-text bodies (e.g. a stored `&amp;`) are decoded.
 */
function recordBodyNode(b: TermsTextBlock): object | null {
  const title = en(b.title);
  const raw = (b.body ?? '').trim();
  if (!raw) return null;
  if (b.format === 'html') {
    const rich = htmlToPdfmake(stripLeadingHeadingHtml(raw, title));
    if (rich.length === 0) return null;
    return { stack: rich, fontSize: 9, color: PDF_COLORS.textLight, lineHeight: 1.3 };
  }
  const text = stripLeadingTitleLine(decodeHtmlEntities(raw), title).trim();
  if (!text) return null;
  return { text, fontSize: 9, color: PDF_COLORS.textLight, lineHeight: 1.3 };
}

/**
 * The STANDARD "Terms & Conditions" section — the per-document-type content set in
 * the Studio (`config.termsContent`), bilingual centre-split. Studio-only: never
 * reads per-record terms, never falls back; omitted when the Studio content is blank.
 */
export const renderTerms: SectionRenderer = (engine: EngineContext): Content | null => {
  const bilingual = isBilingualMode(engine.config.language);
  const tc = engine.config.termsContent;
  const blocks: TermsBlock[] = [
    { heading: engine.config.labels.terms ?? { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: tc?.terms ?? {} },
    { heading: engine.config.labels.notes ?? { en: 'Notes', ar: 'ملاحظات' }, body: tc?.notes ?? {} },
  ];
  const enCol = languageColumn(blocks, 'en');
  const arCol = bilingual ? languageColumn(blocks, 'ar') : [];
  return termsBox(enCol, arCol);
};

/**
 * The PER-RECORD "Quote Terms" / "Invoice Terms" section — the terms the user
 * entered on this quote/invoice (from Terms & Templates), resolved by the adapter
 * into `data.terms.blocks`. Single-language, full-width; omitted when absent. The
 * heading is renamable via the Studio section label (`config.labels.recordTerms`).
 */
export const renderRecordTerms: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const recordLabel = engine.config.labels.recordTerms;
  const notesLabel = engine.config.labels.notes ?? { en: 'Notes', ar: 'ملاحظات' };
  const bilingual = isBilingualMode(engine.config.language);
  const rawBlocks = data.terms?.blocks ?? [];
  // A Studio rename overrides the per-record terms heading (but not the Notes block).
  const blocks = recordLabel
    ? rawBlocks.map((b) =>
        normalizeHeading(en(b.title)) === normalizeHeading(en(notesLabel)) ? b : { ...b, title: recordLabel },
      )
    : rawBlocks;
  // Each block renders as a bordered box with a shaded bilingual header band —
  // the same `createBilingualInfoBox` treatment as Customer Information / Details,
  // so the heading carries its Arabic translation and matches the other sections.
  const boxes: Content[] = [];
  for (const b of blocks) {
    const body = recordBodyNode(b);
    if (!body) continue;
    if (boxes.length > 0) boxes.push({ text: '', margin: [0, 4, 0, 0] as [number, number, number, number] });
    boxes.push(createBilingualInfoBox(en(b.title), bilingual ? ar(b.title) ?? null : null, [body]) as Content);
  }
  if (boxes.length === 0) return null;
  return { stack: boxes, margin: [0, 8, 0, 0] as [number, number, number, number] };
};
