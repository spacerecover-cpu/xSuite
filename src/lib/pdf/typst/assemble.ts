/**
 * Assemble a Typst markup document from the engine's normalized
 * {@link EngineDocData}. Typst (rustybuzz shaping + Unicode bidi) does ALL
 * RTL/shaping work, so — unlike the pdfmake renderer — this assembler carries no
 * `reverseArabicText`, no column mirroring, and no per-run font pinning.
 *
 * Parity with the pdfmake layout: section/box headers render as a two-column
 * BAND (English on the start edge, the secondary on the end edge — not an inline
 * "en | ar"); field-row labels honour the template's translation policy via
 * {@link fieldLabelLanguage} (so "System labels only" keeps them single-language);
 * totals/column labels use the inline bilingual `resolveLabel`. `start`/`end`
 * alignments make everything direction-aware from the document `dir`.
 *
 * Phase 1 scope: the financial (invoice/quote/receipt) sections. Logo image
 * embedding + other doc types are added in later phases.
 */
import { en, resolveLabel, fieldLabelLanguage, type TranslationGroup } from '../engine/labels';
import { buildCompanyAddressLines, buildCompanyContactLine } from '../utils';
import { resolveSecondary, secondaryText, type DocumentTemplateConfig, type LabelText } from '../templateConfig';
import type { EngineDocData } from '../engine/types';
import type { TranslationContext } from '../types';
import { escapeTypst } from './escape';
import { htmlToTypst } from './htmlToTypst';

const FONTS = '("Tajawal", "Noto Sans Arabic", "Noto Sans Thai", "Noto Sans KR", "Roboto")';
const NAVY = '#162660';
const MUTED = '#64748b';
const BORDER = '#d0d5dd';
const SHADE = '#f8fafc';

function toAlign(a: 'left' | 'center' | 'right' | undefined): string {
  return a === 'right' ? 'end' : a === 'center' ? 'center' : 'start';
}

function preamble(dir: string): string {
  return [
    '#set page(paper: "a4", margin: (x: 15mm, y: 16mm))',
    `#set text(font: ${FONTS}, size: 10pt, dir: ${dir})`,
    `#set table(stroke: 0.5pt + rgb("${BORDER}"), inset: 5pt)`,
    `#let muted(b) = text(fill: rgb("${MUTED}"), b)`,
    `#let kv(k, v) = grid(columns: (auto, 1fr), gutter: 6pt, muted(k), v)`,
    // Two-column shaded header band: primary (English) on the start edge, the
    // secondary on the end edge — mirrors pdfmake's createBilingualInfoBox.
    `#let band(a, b) = block(width: 100%, fill: rgb("${SHADE}"), inset: 6pt, grid(columns: (1fr, 1fr), text(weight: "bold", fill: rgb("${NAVY}"), a), align(end, text(weight: "bold", fill: rgb("${NAVY}"), b))))`,
    `#let infobox(a, b, body) = block(width: 100%, stroke: 0.5pt + rgb("${BORDER}"), band(a, b) + block(inset: 6pt, body))`,
  ].join('\n');
}

export function assembleTypst(
  data: EngineDocData,
  config: DocumentTemplateConfig,
  _ctx: TranslationContext,
  opts: { logoPath?: string } = {},
): string {
  const language = config.language;
  // Always LTR — the document must use the SAME left-to-right layout as the other
  // languages (logo placement, columns, alignment all unflipped). Typst still
  // applies the Unicode bidi algorithm + shaping WITHIN each run, so the Arabic
  // text itself renders correctly (right-to-left letters) inside an LTR page.
  const dir = 'ltr';
  const E = (l: LabelText) => escapeTypst(en(l));
  // LOGICAL secondary (no reverseArabicText) — Typst does its own bidi, so feeding
  // it the pdfmake-reversed form via ar() would double-reverse and mangle it.
  const A = (l: LabelText) => escapeTypst(secondaryText(l, resolveSecondary(language)) ?? '');
  const L = (l: LabelText) => escapeTypst(resolveLabel(l, language) ?? '');
  const V = (s: string | number | null | undefined) => escapeTypst(s == null ? '' : String(s));
  // Field-row labels follow the translation policy (e.g. "System labels only").
  const fll = (group: TranslationGroup) => fieldLabelLanguage(language, config.translationPolicy, group);
  const fieldLbl = (l: LabelText, group: TranslationGroup) => escapeTypst(resolveLabel(l, fll(group)) ?? '');

  const parts: string[] = [preamble(dir), ''];
  const band = (title: LabelText) => `[${E(title)}], [${A(title)}]`;
  const kvBody = (rows: Array<{ label: LabelText; value: string }>, group: TranslationGroup) =>
    rows.map((r) => `#kv([${fieldLbl(r.label, group)}], [${V(r.value)}])`).join(' ');

  // Company identity letterhead — replicate the pdfmake "Classic" header: logo on
  // the configured side, identity block (legal name bold + trading name + address
  // + Tel/Email + VAT) on the other side, aligned toward the logo's opposite edge.
  const header = config.header ?? {};
  const placement = header.logoPlacement ?? 'left';
  const logoLeft = placement !== 'right';
  const logoMaxH = header.logoMaxHeight && header.logoMaxHeight > 0 ? header.logoMaxHeight : 0;
  const logoSizeArg = logoMaxH ? `height: ${logoMaxH}pt` : `width: ${header.logoWidth ?? 130}pt`;
  const logoImg = opts.logoPath ? `image("${opts.logoPath}", ${logoSizeArg})` : '[]';

  const info = data.identity?.basic_info;
  const legalName = info?.legal_name || info?.company_name;
  const idLines: string[] = [];
  if (legalName) idLines.push(`text(size: 14pt, weight: "bold", fill: rgb("#1e293b"), [${V(legalName)}])`);
  if (info?.company_name && info.company_name !== legalName) idLines.push(`muted([${V(info.company_name)}])`);
  for (const line of buildCompanyAddressLines(data.identity?.location)) idLines.push(`muted([${V(line)}])`);
  const contact = buildCompanyContactLine(data.identity?.contact_info);
  if (contact) idLines.push(`muted([${V(contact)}])`);
  if (info?.vat_number) idLines.push(`muted([VAT: ${V(info.vat_number)}])`);

  const idAlign = placement === 'center' ? 'center' : logoLeft ? 'right' : 'left';
  const idBlock = `align(${idAlign}, stack(spacing: 2pt, ${idLines.length ? idLines.join(', ') : '[]'}))`;

  if (placement === 'center' || !opts.logoPath) {
    if (opts.logoPath) parts.push(`#align(center, ${logoImg})`, '#v(4pt)');
    parts.push(`#${idBlock}`);
  } else if (logoLeft) {
    parts.push(`#grid(columns: (auto, 1fr), column-gutter: 12pt, align: horizon, align(horizon, ${logoImg}), ${idBlock})`);
  } else {
    parts.push(`#grid(columns: (1fr, auto), column-gutter: 12pt, align: horizon, ${idBlock}, align(horizon, ${logoImg}))`);
  }
  parts.push('#v(8pt)');

  // Title
  parts.push(`#align(center, text(size: 18pt, weight: "bold", fill: rgb("${NAVY}"), [${L(data.documentTitle)}]))`);
  parts.push(`#line(length: 100%, stroke: 0.5pt + rgb("${NAVY}"))`, '#v(8pt)');

  // Parties (to) + meta side by side — Customer first (left), Details second
  // (right), matching the pdfmake layout.
  const boxes: string[] = [];
  if (data.parties?.to) {
    const p = data.parties.to;
    const rows = [
      ...(p.name ? [{ label: { en: 'Name:', ar: 'الاسم:' }, value: p.name }] : []),
      ...p.rows,
    ];
    boxes.push(`infobox(${band(p.title)}, [${kvBody(rows, 'parties')}])`);
  }
  if (data.meta?.length) boxes.push(`infobox(${band({ en: 'Details', ar: 'التفاصيل' })}, [${kvBody(data.meta, 'meta')}])`);
  if (boxes.length) {
    parts.push(`#grid(columns: (${boxes.map(() => '1fr').join(', ')}), gutter: 10pt, ${boxes.join(', ')})`, '#v(8pt)');
  }

  // Line items
  if (data.lineItems?.columns?.some((c) => c.visible)) {
    const cols = data.lineItems.columns.filter((c) => c.visible);
    const colSpec = cols.map((c) => (c.width ? `${c.width}pt` : '1fr')).join(', ');
    const aligns = cols.map((c) => toAlign(c.align)).join(', ');
    const header = cols
      .map((c) => `table.cell(fill: rgb("${NAVY}"), text(fill: white, weight: "bold", [${L(c.label)}]))`)
      .join(', ');
    const body = data.lineItems.rows.map((row) => cols.map((c) => `[${V(row[c.key])}]`).join(', ')).join(',\n');
    parts.push(`#table(columns: (${colSpec}), align: (${aligns}), ${header},\n${body})`, '#v(6pt)');
  }

  // Totals (trailing edge) — inline bilingual labels
  if (data.totals?.length) {
    const lines = data.totals
      .map((t) => {
        const style = t.emphasis ? `weight: "bold", size: 12pt, fill: rgb("${NAVY}"), ` : '';
        return `#grid(columns: (1fr, auto), gutter: 10pt, muted([${L(t.label)}]), text(${style}[${V(t.value)}]))`;
      })
      .join('\n');
    parts.push(`#align(end, block(width: 55%, [${lines}]))`, '#v(8pt)');
  }

  // Terms
  if (data.terms?.blocks?.length) {
    for (const b of data.terms.blocks) {
      parts.push(`#infobox(${band(b.title)}, [${htmlToTypst(b.body)}])`, '#v(4pt)');
    }
  } else if (data.terms?.body) {
    parts.push(`#infobox(${band(data.terms.title)}, [${htmlToTypst(data.terms.body)}])`, '#v(4pt)');
  }

  // Bank
  if (data.bank) parts.push(`#infobox(${band(data.bank.title)}, [${kvBody(data.bank.rows, 'parties')}])`, '#v(8pt)');

  // Payment history
  if (data.paymentHistory?.rows?.length) {
    const ph = data.paymentHistory;
    const heads = [ph.columns.date, ph.columns.document, ph.columns.method, ph.columns.reference, ph.columns.recordedBy, ph.columns.amount, ph.columns.balance];
    const header = heads.map((c) => `table.cell(fill: rgb("${NAVY}"), text(fill: white, weight: "bold", size: 8pt, [${L(c)}]))`).join(', ');
    const body = ph.rows
      .map((r) => [r.date, r.document, r.method, r.reference, r.recordedBy, r.amount, r.runningBalance].map((v) => `text(size: 8pt, [${V(v)}])`).join(', '))
      .join(',\n');
    parts.push(`#text(weight: "bold", fill: rgb("${NAVY}"), [${L(ph.title)}])`, '#v(3pt)', `#table(columns: 7, ${header},\n${body})`, '#v(8pt)');
  }

  // Signatures
  if (data.signatures?.length) {
    const cells = data.signatures.map((s) => `[#v(24pt) #line(length: 80%) #muted([${L(s)}])]`).join(', ');
    parts.push('#v(12pt)', `#grid(columns: (${data.signatures.map(() => '1fr').join(', ')}), gutter: 16pt, ${cells})`);
  }

  return parts.join('\n');
}
