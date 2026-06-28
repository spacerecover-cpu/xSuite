/**
 * Assemble a Typst markup document from the engine's normalized
 * {@link EngineDocData}. Typst (rustybuzz shaping + Unicode bidi) does ALL
 * RTL/shaping work, so — unlike the pdfmake renderer — this assembler carries no
 * `reverseArabicText`, no column mirroring, and no per-run font pinning.
 *
 * The layout mirrors the pdfmake renderer 1:1 (resolved from styles.ts +
 * engine/sections/* — see docs spec): the same letterhead, the centred title
 * UNDER a navy divider, info-box bands (icon + English start / secondary end,
 * light #f8fafc fill, navy heading), a light #F1F5F9 line-item header, a boxed
 * grand-total row, and the same fonts/colours/spacing. Field-row labels honour
 * the template's translation policy via {@link fieldLabelLanguage}; titles and
 * column/total labels use the inline bilingual `resolveLabel`.
 *
 * Phase 1 scope: the financial (invoice/quote/receipt) sections.
 */
import { en, resolveLabel, fieldLabelLanguage, type TranslationGroup } from '../engine/labels';
import { buildCompanyAddress } from '../utils';
import { resolveSecondary, secondaryText, type DocumentTemplateConfig, type LabelText } from '../templateConfig';
import type { EngineDocData } from '../engine/types';
import type { TranslationContext } from '../types';
import { escapeTypst } from './escape';
import { htmlToTypst } from './htmlToTypst';
import { ICON_USER_SVG, ICON_DOC_SVG } from './icons';

const FONTS = '("Tajawal", "Noto Sans Arabic", "Noto Sans Thai", "Noto Sans KR", "Roboto")';
// PDF_COLORS (styles.ts) — kept literal; PDFs stay neutral across themes.
const NAVY = '#162660'; // primary — band/heading accent, total value, divider
const PRIMARYDARK = '#1E3A5F'; // document title
const TEXT = '#1e293b'; // body text
const MUTED = '#64748b'; // labels / textLight
const BORDER = '#e2e8f0'; // borders
const SHADE = '#f8fafc'; // info-box band fill / grand-total fill
const HEADERBG = '#F1F5F9'; // table header fill

function toAlign(a: 'left' | 'center' | 'right' | undefined): string {
  return a === 'right' ? 'end' : a === 'center' ? 'center' : 'start';
}

function preamble(dir: string): string {
  return [
    '#set page(paper: "a4", margin: 40pt)',
    `#set text(font: ${FONTS}, size: 9pt, fill: rgb("${TEXT}"), dir: ${dir})`,
    `#set table(stroke: 0.5pt + rgb("${BORDER}"), inset: (x: 5pt, y: 3.5pt))`,
    `#let iconUser = box(image(bytes("${ICON_USER_SVG}"), format: "svg", width: 13pt))`,
    `#let iconDoc = box(image(bytes("${ICON_DOC_SVG}"), format: "svg", width: 13pt))`,
    `#let iconNone = box(width: 0pt)`,
    `#let muted(b) = text(size: 8pt, fill: rgb("${MUTED}"), b)`,
    // Info-box header band: [icon · English (start) · spacer · secondary (end)],
    // light fill, navy heading, 0.5pt bottom rule — mirrors createBilingualInfoBox.
    `#let band(icon, a, b) = block(width: 100%, fill: rgb("${SHADE}"), stroke: (bottom: 0.5pt + rgb("${BORDER}")), inset: (x: 6pt, y: 4pt), grid(columns: (auto, auto, 1fr, auto), column-gutter: 6pt, align: horizon, icon, text(weight: "bold", size: 9pt, fill: rgb("${NAVY}"), a), [], align(end, text(weight: "bold", size: 9pt, fill: rgb("${NAVY}"), b))))`,
    `#let infobox(icon, a, b, body) = block(width: 100%, stroke: 0.5pt + rgb("${BORDER}"), band(icon, a, b) + block(width: 100%, inset: (x: 8pt, y: 6pt), body))`,
    // Unboxed bilingual section heading (e.g. "Line Items") — no fill.
    `#let heading(a, b) = block(width: 100%, inset: (top: 4pt, bottom: 5pt), grid(columns: (auto, 1fr, auto), column-gutter: 6pt, text(weight: "bold", size: 9pt, fill: rgb("${NAVY}"), a), [], align(end, text(weight: "bold", size: 9pt, fill: rgb("${NAVY}"), b))))`,
  ].join('\n');
}

export function assembleTypst(
  data: EngineDocData,
  config: DocumentTemplateConfig,
  _ctx: TranslationContext,
  opts: { logoPath?: string } = {},
): string {
  const language = config.language;
  // Always LTR — the document uses the SAME left-to-right layout as the other
  // languages (logo placement, columns, alignment all unflipped). Typst still
  // applies the Unicode bidi algorithm + shaping WITHIN each run, so the Arabic
  // text renders correctly (right-to-left letters) inside an LTR page.
  const dir = 'ltr';
  const E = (l: LabelText) => escapeTypst(en(l));
  // LOGICAL secondary (no reverseArabicText) — Typst does its own bidi.
  const A = (l: LabelText) => escapeTypst(secondaryText(l, resolveSecondary(language)) ?? '');
  const L = (l: LabelText) => escapeTypst(resolveLabel(l, language) ?? '');
  const V = (s: string | number | null | undefined) => escapeTypst(s == null ? '' : String(s));
  // Field-row labels follow the translation policy (e.g. "System labels only").
  const fll = (group: TranslationGroup) => fieldLabelLanguage(language, config.translationPolicy, group);
  const fieldLbl = (l: LabelText, group: TranslationGroup) => escapeTypst(resolveLabel(l, fll(group)) ?? '');

  const parts: string[] = [preamble(dir), ''];
  // An info-box: icon + bilingual band title + field-row grid (label/value).
  const infobox = (
    icon: 'iconUser' | 'iconDoc' | 'iconNone',
    title: LabelText,
    rows: Array<{ label: LabelText; value: string }>,
    group: TranslationGroup,
  ) => {
    const cells = rows
      .map(
        (r) =>
          `text(size: 8pt, fill: rgb("${MUTED}"), [${fieldLbl(r.label, group)}]), text(size: 9pt, fill: rgb("${TEXT}"), [${V(r.value)}])`,
      )
      .join(', ');
    const grid = `grid(columns: (auto, 1fr), column-gutter: 10pt, row-gutter: 3pt, ${cells})`;
    return `infobox(${icon}, [${E(title)}], [${A(title)}], ${grid})`;
  };

  // ── Company letterhead — pdfmake "Classic": logo on the configured side,
  // identity block (legal name + trading name + address + Tel/Email + VAT) toward
  // the opposite edge. ───────────────────────────────────────────────────────
  const header = config.header ?? {};
  const placement = header.logoPlacement ?? 'left';
  const logoLeft = placement !== 'right';
  const logoMaxH = header.logoMaxHeight && header.logoMaxHeight > 0 ? header.logoMaxHeight : 0;
  const logoSizeArg = logoMaxH ? `height: ${logoMaxH}pt` : `width: ${header.logoWidth ?? 130}pt`;
  const logoImg = opts.logoPath ? `image("${opts.logoPath}", ${logoSizeArg})` : '[]';

  const info = data.identity?.basic_info;
  const contactInfo = data.identity?.contact_info;
  const legalName = info?.legal_name || info?.company_name;
  const idLines: string[] = [];
  if (legalName) idLines.push(`text(size: 14pt, weight: "bold", fill: rgb("${TEXT}"), [${V(legalName)}])`);
  if (info?.company_name && info.company_name !== legalName) idLines.push(`text(size: 9pt, fill: rgb("${MUTED}"), [${V(info.company_name)}])`);
  const addr = buildCompanyAddress(data.identity?.location);
  if (addr) idLines.push(`text(size: 8pt, fill: rgb("${MUTED}"), [${V(addr)}])`);
  if (contactInfo?.phone_primary) idLines.push(`text(size: 8pt, fill: rgb("${MUTED}"), [Tel: ${V(contactInfo.phone_primary)}])`);
  if (contactInfo?.email_general) idLines.push(`text(size: 8pt, fill: rgb("${MUTED}"), [Email: ${V(contactInfo.email_general)}])`);
  if (info?.vat_number) idLines.push(`text(size: 8pt, fill: rgb("${MUTED}"), [VAT: ${V(info.vat_number)}])`);

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

  // Divider rule UNDER the letterhead, then the centred title (pdfmake order).
  parts.push('#v(10pt)', `#line(length: 100%, stroke: 0.5pt + rgb("${NAVY}"))`, '#v(8pt)');
  parts.push(`#align(center, text(size: 16pt, weight: "bold", fill: rgb("${PRIMARYDARK}"), [${L(data.documentTitle)}]))`, '#v(8pt)');

  // ── Customer (parties) + Details (meta) side by side ─────────────────────
  const boxes: string[] = [];
  if (data.parties?.to) {
    const p = data.parties.to;
    const rows = [...(p.name ? [{ label: { en: 'Name:', ar: 'الاسم:' }, value: p.name }] : []), ...p.rows];
    boxes.push(infobox('iconUser', p.title, rows, 'parties'));
  }
  if (data.meta?.length) boxes.push(infobox('iconDoc', { en: 'Details', ar: 'التفاصيل' }, data.meta, 'meta'));
  if (boxes.length) {
    parts.push(`#grid(columns: (${boxes.map(() => '1fr').join(', ')}), gutter: 10pt, ${boxes.join(', ')})`, '#v(8pt)');
  }

  // ── Line items — bilingual "Line Items" heading + light-header table ──────
  if (data.lineItems?.columns?.some((c) => c.visible)) {
    const cols = data.lineItems.columns.filter((c) => c.visible);
    const colSpec = cols.map((c) => (c.width ? `${c.width}pt` : '1fr')).join(', ');
    const aligns = cols.map((c) => toAlign(c.align)).join(', ');
    const headerCells = cols
      .map((c) => `table.cell(fill: rgb("${HEADERBG}"), text(weight: "bold", size: 8pt, fill: rgb("${TEXT}"), [${L(c.label)}]))`)
      .join(', ');
    const body = data.lineItems.rows
      .map((row) => cols.map((c) => `text(size: 8pt, fill: rgb("${TEXT}"), [${V(row[c.key])}])`).join(', '))
      .join(',\n');
    parts.push(`#heading([Line Items], [البنود])`);
    parts.push(`#table(columns: (${colSpec}), align: (${aligns}), table.header(${headerCells}),\n${body})`, '#v(6pt)');
  }

  // ── Totals — normal rows (muted label / bold value) + boxed grand total ───
  if (data.totals?.length) {
    const lines = data.totals
      .map((t) => {
        if (t.emphasis) {
          return `block(width: 100%, fill: rgb("${SHADE}"), stroke: 0.5pt + rgb("${BORDER}"), inset: (x: 6pt, y: 3pt), grid(columns: (1fr, auto), column-gutter: 10pt, align(end + horizon, text(size: 10pt, weight: "bold", fill: rgb("${TEXT}"), [${L(t.label)}])), align(end + horizon, text(size: 11pt, weight: "bold", fill: rgb("${NAVY}"), [${V(t.value)}]))))`;
        }
        return `grid(columns: (1fr, auto), column-gutter: 10pt, align(end, text(size: 9pt, fill: rgb("${MUTED}"), [${L(t.label)}])), align(end, text(size: 9pt, weight: "bold", fill: rgb("${TEXT}"), [${V(t.value)}])))`;
      })
      .join(', ');
    parts.push(`#align(end, block(width: 47%, stack(spacing: 4pt, ${lines})))`, '#v(8pt)');
  }

  // ── Terms / Notes (no icon) ──────────────────────────────────────────────
  if (data.terms?.blocks?.length) {
    for (const b of data.terms.blocks) {
      parts.push(`#infobox(iconNone, [${E(b.title)}], [${A(b.title)}], text(size: 9pt, fill: rgb("${MUTED}"), [${htmlToTypst(b.body)}]))`, '#v(6pt)');
    }
  } else if (data.terms?.body) {
    parts.push(`#infobox(iconNone, [${E(data.terms.title)}], [${A(data.terms.title)}], text(size: 9pt, fill: rgb("${MUTED}"), [${htmlToTypst(data.terms.body)}]))`, '#v(6pt)');
  }

  // ── Bank account (document icon) ─────────────────────────────────────────
  if (data.bank) parts.push(`#${infobox('iconDoc', data.bank.title, data.bank.rows, 'parties')}`, '#v(8pt)');

  // ── Payment history — heading + light-header table ───────────────────────
  if (data.paymentHistory?.rows?.length) {
    const ph = data.paymentHistory;
    const heads = [ph.columns.date, ph.columns.document, ph.columns.method, ph.columns.reference, ph.columns.recordedBy, ph.columns.amount, ph.columns.balance];
    const headerCells = heads
      .map((c) => `table.cell(fill: rgb("${HEADERBG}"), text(weight: "bold", size: 8pt, fill: rgb("${TEXT}"), [${L(c)}]))`)
      .join(', ');
    const body = ph.rows
      .map((r) => [r.date, r.document, r.method, r.reference, r.recordedBy, r.amount, r.runningBalance].map((v) => `text(size: 8pt, fill: rgb("${TEXT}"), [${V(v)}])`).join(', '))
      .join(',\n');
    parts.push(`#heading([${E(ph.title)}], [${A(ph.title)}])`, `#table(columns: 7, table.header(${headerCells}),\n${body})`, '#v(8pt)');
  }

  // ── Signatures ───────────────────────────────────────────────────────────
  if (data.signatures?.length) {
    const cells = data.signatures.map((s) => `[#v(24pt) #line(length: 80%, stroke: 0.5pt + rgb("${MUTED}")) #muted([${L(s)}])]`).join(', ');
    parts.push('#v(12pt)', `#grid(columns: (${data.signatures.map(() => '1fr').join(', ')}), gutter: 16pt, ${cells})`);
  }

  return parts.join('\n');
}
