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
import { en, resolveLabel, fieldLabelLanguage, fieldLabelsBilingual, type TranslationGroup } from '../engine/labels';
import {
  resolveOrganization,
  resolveTypography,
  resolveColors,
  resolveHeader,
  resolvePageFitting,
  resolveTable,
  resolveFooter,
  resolvePageNumbers,
  resolveWatermarkSettings,
} from '../engine/branding';
import { buildCompanyAddress } from '../utils';
import { resolveSecondary, secondaryText, type DocumentTemplateConfig, type LabelText, type TypographyStyleKey } from '../templateConfig';
import type { EngineDocData } from '../engine/types';
import type { TranslationContext } from '../types';
import { escapeTypst } from './escape';
import { htmlToTypst } from './htmlToTypst';
import { ICON_USER_SVG, ICON_DOC_SVG } from './icons';

const FONTS = '("Tajawal", "Noto Sans Arabic", "Noto Sans Thai", "Noto Sans KR", "Roboto")';
/** Map a Studio font-family choice to the Typst font name (else null → default set). */
const FONT_TYPST: Record<string, string> = {
  Roboto: 'Roboto',
  Tajawal: 'Tajawal',
  NotoSansArabic: 'Noto Sans Arabic',
};
/** Density → scale, mirroring renderTemplate.ts DENSITY_SCALE (the pdfmake path). */
const DENSITY_SCALE: Record<'comfortable' | 'compact' | 'dense', number> = {
  comfortable: 1,
  compact: 0.88,
  dense: 0.78,
};
// Fixed neutral surfaces (no config field). Themable colours come from
// resolveColors()/resolveTable() at render time — see assembleTypst.
const PRIMARYDARK = '#1E3A5F'; // document title
const BORDER = '#e2e8f0'; // borders
const SHADE = '#f8fafc'; // info-box band fill / grand-total fill / zebra

function toAlign(a: 'left' | 'center' | 'right' | undefined): string {
  return a === 'right' ? 'end' : a === 'center' ? 'center' : 'start';
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Validate a hex colour (opt-in totals colours); null → fall back to neutral. */
function hexColor(v: string | undefined): string | null {
  return typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : null;
}

/** Turn a page-number format ("Page {page} of {pages}") into Typst content:
 *  literal text is escaped; {page}/{pages} become live page counters. Caller
 *  wraps the result in `context [...]` so the counters resolve. */
function typstPageNumber(format: string): string {
  return format
    .split(/(\{page\}|\{pages\})/g)
    .map((p) =>
      p === '{page}'
        ? '#counter(page).display()'
        : p === '{pages}'
          ? '#counter(page).final().first()'
          : escapeTypst(p),
    )
    .join('');
}

interface PreambleOpts {
  dir: string;
  /** Full resolved `#set page(...)` line (paper size / orientation / margins). */
  pageLine: string;
  /** Resolved font tuple (the chosen family leads, with Arabic-capable fallbacks). */
  fonts: string;
  baseSize: number;
  smallSize: number;
  headingSize: number;
  /** Resolved themable colours (accent surfaces, body text, muted labels). */
  accent: string;
  body: string;
  label: string;
}

/** Preamble — page/text setup + the shared layout helpers, all parameterised by
 *  the resolved page geometry, font, typography sizes and colours so the Studio
 *  controls reach the Typst (Arabic) render exactly as they reach pdfmake. */
function preamble(o: PreambleOpts): string {
  return [
    o.pageLine,
    `#set text(font: ${o.fonts}, size: ${o.baseSize}pt, fill: rgb("${o.body}"), dir: ${o.dir})`,
    `#set table(stroke: 0.5pt + rgb("${BORDER}"), inset: (x: 5pt, y: 3.5pt))`,
    `#let iconUser = box(image(bytes("${ICON_USER_SVG}"), format: "svg", width: 13pt))`,
    `#let iconDoc = box(image(bytes("${ICON_DOC_SVG}"), format: "svg", width: 13pt))`,
    `#let iconNone = box(width: 0pt)`,
    `#let muted(b) = text(size: ${o.smallSize}pt, fill: rgb("${o.label}"), b)`,
    // Info-box header band: [icon · English (start) · spacer · secondary (end)],
    // light fill, accent heading, 0.5pt bottom rule — mirrors createBilingualInfoBox.
    `#let band(icon, a, b) = block(width: 100%, fill: rgb("${SHADE}"), stroke: (bottom: 0.5pt + rgb("${BORDER}")), inset: (x: 6pt, y: 4pt), grid(columns: (auto, auto, 1fr, auto), column-gutter: 6pt, align: horizon, icon, text(weight: "bold", size: ${o.headingSize}pt, fill: rgb("${o.accent}"), a), [], align(end, text(weight: "bold", size: ${o.headingSize}pt, fill: rgb("${o.accent}"), b))))`,
    `#let infobox(icon, a, b, body) = block(width: 100%, stroke: 0.5pt + rgb("${BORDER}"), band(icon, a, b) + block(width: 100%, inset: (x: 8pt, y: 6pt), body))`,
    // Unboxed bilingual section heading (e.g. "Line Items") — no fill.
    `#let heading(a, b) = block(width: 100%, inset: (top: 4pt, bottom: 5pt), grid(columns: (auto, 1fr, auto), column-gutter: 6pt, text(weight: "bold", size: ${o.headingSize}pt, fill: rgb("${o.accent}"), a), [], align(end, text(weight: "bold", size: ${o.headingSize}pt, fill: rgb("${o.accent}"), b))))`,
  ].join('\n');
}

export function assembleTypst(
  data: EngineDocData,
  config: DocumentTemplateConfig,
  _ctx: TranslationContext,
  opts: { logoPath?: string; qrPath?: string } = {},
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
  // Inline bilingual label (title, column headers, totals): English first, each
  // language ISOLATED in its own #box so Typst's bidi lays them in document order
  // (English left, secondary right) — never letting a trailing RTL run jump to the
  // visual left. When a `group` is given, honour the translation policy: a block
  // toggled off (or "System labels only") drops the secondary → single-language,
  // so a tenant can keep e.g. the totals box / payment history uncluttered.
  const biLine = (l: LabelText, group?: TranslationGroup) => {
    const e = E(l);
    const s = group && !fieldLabelsBilingual(config.translationPolicy, group) ? '' : A(l);
    if (e && s) return `#box[${e}] | #box[${s}]`;
    if (s) return `#box[${s}]`;
    return e;
  };
  // Field-row labels follow the translation policy (e.g. "System labels only").
  const fll = (group: TranslationGroup) => fieldLabelLanguage(language, config.translationPolicy, group);
  const fieldLbl = (l: LabelText, group: TranslationGroup) => escapeTypst(resolveLabel(l, fll(group)) ?? '');

  // Typography — honour config.typography so the Studio's font-size scale AND the
  // per-section size overrides apply to the Typst (Arabic) render too, exactly
  // like the pdfmake path (otherwise the controls would no-op on Arabic docs).
  // `sz(base, key)` = the per-section override (absolute pt) when set, else the
  // assembler's own base size multiplied by the clamped global scale (≤ 2×), so
  // the scale-1 look is byte-for-byte preserved.
  const typo = resolveTypography(config, 'Roboto');
  const tSizes = config.typography?.sizes;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  // Density / auto-fit — mirror renderTemplate: density tightens font sizes AND
  // margins; auto-fit applies a further reduction down to the legibility floor.
  const fit = resolvePageFitting(config);
  const densityScale = DENSITY_SCALE[fit.density];
  const fitScale = fit.autoFitOnePage ? Math.max(fit.minScale, densityScale * 0.9) : densityScale;
  const sz = (base: number, key?: TypographyStyleKey): number => {
    const o = key ? tSizes?.[key] : undefined;
    const v = typeof o === 'number' && o > 0 ? o : base * typo.scale;
    return round1(v * fitScale);
  };
  // Themable colours (accent surfaces / body text / muted labels / table header)
  // resolved exactly like pdfmake so the Studio colour controls reach Arabic docs.
  const C = resolveColors(config);
  const ACCENT = C.accent;
  const BODY = C.text;
  const LABELC = C.label;
  const RT = resolveTable(config);
  const TABLEHEAD = RT.headerBackground;
  const S = {
    legal: sz(14),
    legalAr: sz(12),
    tagline: sz(9),
    small: sz(8),
    title: sz(16, 'documentTitle'),
    heading: sz(9, 'sectionTitle'),
    label: sz(8, 'label'),
    value: sz(9, 'value'),
    thead: sz(8, 'tableHeader'),
    tcell: sz(8, 'tableCell'),
    totLabel: sz(9),
    totLabelBold: sz(10.5),
    totValNormal: sz(9.5),
    totValBold: sz(12, 'totalValue'),
    terms: sz(9, 'termsText'),
    taxWords: sz(7),
  };

  // Section visibility + order come from config.sections (the Studio controls) —
  // the SAME source the pdfmake renderer honours. A key absent from config
  // defaults to visible (back-compat for minimal configs/tests).
  const sections = config.sections ?? [];
  const sectionCfg = (key: string) => sections.find((s) => s.key === key);
  const isVisible = (key: string) => {
    const s = sectionCfg(key);
    return s ? s.visible : true;
  };

  // Page geometry — honour config.paper (size / orientation / margins) and the
  // density scale, mirroring renderTemplate. Custom dimensions (labels) use an
  // explicit width/height; otherwise a named paper with `flipped` for landscape.
  const paper = config.paper;
  const m = paper?.margins ?? [40, 40, 40, 40];
  const pm = m.map((x) => Math.round(x * fitScale));
  const customDims = paper?.size === 'custom' ? paper?.dimensions : null;
  const pageGeom = customDims
    ? `width: ${customDims[0]}pt, height: ${customDims[1]}pt`
    : `paper: "${paper?.size === 'Letter' ? 'us-letter' : 'a4'}"${paper?.orientation === 'landscape' ? ', flipped: true' : ''}`;
  // Repeating page footer — custom footer text and/or page numbers, mirroring
  // renderTemplate. Absent both → no footer arg (parity: Typst had none).
  const ftr = resolveFooter(config);
  const pn = resolvePageNumbers(config);
  const footerLines: string[] = [];
  if (ftr.customText) {
    footerLines.push(
      `align(${toAlign(ftr.alignment)}, text(size: ${round1(ftr.fontSize * fitScale)}pt, fill: rgb("${ftr.fontColor}"), [${escapeTypst(ftr.customText)}]))`,
    );
  }
  if (pn.enabled) {
    footerLines.push(
      `align(${toAlign(pn.position)}, text(size: ${round1(8 * fitScale)}pt, fill: rgb("${LABELC}"), [${typstPageNumber(pn.format)}]))`,
    );
  }
  const footerArg = footerLines.length
    ? `, footer: context block(width: 100%, stack(spacing: 2pt, ${footerLines.join(', ')}))`
    : '';
  // Watermark — a centred, rotated, faded text behind the page, honouring
  // watermark.text/angle/opacity/fontSize (mirrors resolveWatermarkSettings).
  const wm = resolveWatermarkSettings(config);
  const bgArg =
    wm?.text != null
      ? `, background: align(center + horizon, rotate(${wm.angle}deg, text(size: ${wm.fontSize}pt, weight: "bold", fill: luma(150).transparentize(${Math.round((1 - wm.opacity) * 100)}%), [${escapeTypst(wm.text)}])))`
      : '';
  const pageLine = `#set page(${pageGeom}, margin: (top: ${pm[0]}pt, right: ${pm[1]}pt, bottom: ${pm[2]}pt, left: ${pm[3]}pt)${footerArg}${bgArg})`;
  // Font — the chosen family leads, with the Arabic-capable fallbacks behind it.
  const leadFont = FONT_TYPST[typo.fontFamily];
  const fonts = leadFont
    ? `("${leadFont}", "Tajawal", "Noto Sans Arabic", "Noto Sans Thai", "Noto Sans KR", "Roboto")`
    : FONTS;

  const parts: string[] = [
    preamble({
      dir,
      pageLine,
      fonts,
      baseSize: S.value,
      smallSize: S.small,
      headingSize: S.heading,
      accent: ACCENT,
      body: BODY,
      label: LABELC,
    }),
    '',
  ];
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
          `text(size: ${S.label}pt, fill: rgb("${LABELC}"), [${fieldLbl(r.label, group)}]), text(size: ${S.value}pt, fill: rgb("${BODY}"), [${V(r.value)}])`,
      )
      .join(', ');
    const grid = `grid(columns: (auto, 1fr), column-gutter: 10pt, row-gutter: 3pt, ${cells})`;
    return `infobox(${icon}, [${E(title)}], [${A(title)}], ${grid})`;
  };

  // ── Company letterhead — mirrors pdfmake's header.ts identityLines EXACTLY:
  // honours the "Organization details" config (manual-vs-company_info source +
  // per-line show toggles + manual overrides), not the raw company settings, so
  // the Typst letterhead matches what the tenant configured in the Studio. Logo
  // on the configured side; identity block toward the opposite edge. ──────────
  const header = config.header ?? {};
  const placement = header.logoPlacement ?? 'left';
  const logoLeft = placement !== 'right';
  const logoMaxH = header.logoMaxHeight && header.logoMaxHeight > 0 ? header.logoMaxHeight : 0;
  const logoSizeArg = logoMaxH ? `height: ${logoMaxH}pt` : `width: ${header.logoWidth ?? 130}pt`;

  const info = data.identity?.basic_info;
  const contactInfo = data.identity?.contact_info;
  const companyName = info?.company_name || 'Company Name';
  const legalNameFallback = info?.legal_name || companyName;
  const companyAddress = buildCompanyAddress(data.identity?.location);
  const org = config.organization ? resolveOrganization(config) : null;
  const pick = (manual: string | undefined, fallback: string) => (org?.source === 'manual' ? manual ?? fallback : fallback);
  const addrSize = org?.addressFontSize ?? 8;

  const useLogo = !!opts.logoPath && (!org || org.show.logo);
  const logoImg = useLogo ? `image("${opts.logoPath}", ${logoSizeArg})` : '[]';

  const idLines: string[] = [];
  if (!org || org.show.legalName) {
    const v = pick(org?.manual.legalName, legalNameFallback);
    if (v) idLines.push(`text(size: ${S.legal}pt, weight: "bold", fill: rgb("${BODY}"), [${V(v)}])`);
  }
  if (org?.show.legalNameAr && org.manual.legalNameAr) {
    idLines.push(`text(size: ${S.legalAr}pt, weight: "bold", fill: rgb("${BODY}"), [${V(org.manual.legalNameAr)}])`);
  }
  if (org?.show.name) {
    const n = pick(org.manual.name, companyName);
    if (n && n !== pick(org?.manual.legalName, legalNameFallback)) idLines.push(`text(size: ${S.tagline}pt, fill: rgb("${LABELC}"), [${V(n)}])`);
  }
  if (org?.show.nameAr && org.manual.nameAr) {
    idLines.push(`text(size: ${S.tagline}pt, fill: rgb("${LABELC}"), [${V(org.manual.nameAr)}])`);
  }
  if (!org || org.show.address) {
    const a = pick(org?.manual.address, companyAddress);
    if (a) idLines.push(`text(size: ${sz(addrSize)}pt, fill: rgb("${LABELC}"), [${V(a)}])`);
  }
  if (contactInfo?.phone_primary) idLines.push(`text(size: ${S.small}pt, fill: rgb("${LABELC}"), [Tel: ${V(contactInfo.phone_primary)}])`);
  if (contactInfo?.email_general) idLines.push(`text(size: ${S.small}pt, fill: rgb("${LABELC}"), [Email: ${V(contactInfo.email_general)}])`);
  if (!org || org.show.taxId) {
    const tax = org?.source === 'manual' ? org.manual.taxId : info?.vat_number;
    if (tax) idLines.push(`text(size: ${S.small}pt, fill: rgb("${LABELC}"), [VAT: ${V(tax)}])`);
  }

  const idAlign = placement === 'center' ? 'center' : logoLeft ? 'right' : 'left';
  const idBlock = `align(${idAlign}, stack(spacing: 2pt, ${idLines.length ? idLines.join(', ') : '[]'}))`;

  // Assemble the letterhead (logo + identity) into the header fragment.
  const headerParts: string[] = [];
  if (placement === 'center' || !useLogo) {
    if (useLogo) headerParts.push(`#align(center, ${logoImg})`, '#v(4pt)');
    headerParts.push(`#${idBlock}`);
  } else if (logoLeft) {
    headerParts.push(`#grid(columns: (auto, 1fr), column-gutter: 12pt, align: horizon, align(horizon, ${logoImg}), ${idBlock})`);
  } else {
    headerParts.push(`#grid(columns: (1fr, auto), column-gutter: 12pt, align: horizon, ${idBlock}, align(horizon, ${logoImg}))`);
  }
  // Divider rule UNDER the letterhead, then the centred title (pdfmake order).
  // Honours config.header: style (thin/thick/none), opt-in colour (else the
  // resolved accent — neutral navy by default), endpoint insets and the vertical
  // nudge (positive = down). Mirrors pdfmake's buildDivider so both renderers
  // stay 1:1 — before this the Typst rule was hardcoded 0.5pt navy, always drawn.
  // Resolve the divider through the SHARED resolver so the colour (validated +
  // lowercased), style and the clamped nudge are byte-for-byte what pdfmake uses.
  const rh = resolveHeader(config);
  if (rh.divider === 'none') {
    headerParts.push('#v(10pt)');
  } else {
    const dColor = rh.dividerColor ?? resolveColors(config).accent;
    const dWidth = rh.divider === 'thick' ? 2 : 0.5;
    const { start: dStart, end: dEnd, vertical: dv } = rh.dividerNudge; // clamped
    // Keep the total gap constant while the nudge shifts the rule up/down
    // (+ = down). dv is clamped to ±8 so the after-gap never goes negative.
    headerParts.push(
      `#v(${round1(10 + dv)}pt)`,
      `#pad(left: ${dStart}pt, right: ${dEnd}pt, line(length: 100%, stroke: ${dWidth}pt + rgb("${dColor}")))`,
      `#v(${round1(8 - dv)}pt)`,
    );
  }
  headerParts.push(`#align(center, text(size: ${S.title}pt, weight: "bold", fill: rgb("${PRIMARYDARK}"), [${biLine(data.documentTitle)}]))`, '#v(8pt)');
  const headerMarkup = headerParts.join('\n');

  // ── Build each body section as a fragment keyed by its section key, then emit
  // them in the order + visibility the Studio configured (config.sections). ───
  const partyBox = data.parties?.to
    ? infobox('iconUser', data.parties.to.title, [...(data.parties.to.name ? [{ label: { en: 'Name:', ar: 'الاسم:' }, value: data.parties.to.name }] : []), ...data.parties.to.rows], 'parties')
    : '';
  const metaTitle = config.labels?.meta ?? config.labels?.details ?? { en: 'Details', ar: 'التفاصيل' };
  const metaBox = data.meta?.length ? infobox('iconDoc', metaTitle, data.meta, 'meta') : '';

  const frag: Record<string, string> = {};

  // Line items — bilingual heading + light-header table. Honours table.rowNumbering
  // (S/N column), table.zebra (alternating body-row fill) and the labels.lineItems
  // heading override, mirroring lineItemTable.ts.
  if (data.lineItems?.columns?.some((c) => c.visible)) {
    const cols = data.lineItems.columns.filter((c) => c.visible);
    const widthSpecs = cols.map((c) => (c.width ? `${c.width}pt` : '1fr'));
    const alignSpecs = cols.map((c) => toAlign(c.align));
    const headerCellArr = cols.map(
      (c) => `table.cell(fill: rgb("${TABLEHEAD}"), text(weight: "bold", size: ${S.thead}pt, fill: rgb("${BODY}"), [${biLine(c.label)}]))`,
    );
    const bodyRowArr = data.lineItems.rows.map((row, i) => {
      const cells = cols.map((c) => `text(size: ${S.tcell}pt, fill: rgb("${BODY}"), [${V(row[c.key])}])`);
      if (RT.rowNumbering) cells.unshift(`text(size: ${S.tcell}pt, fill: rgb("${BODY}"), [${i + 1}])`);
      return cells.join(', ');
    });
    if (RT.rowNumbering) {
      widthSpecs.unshift('24pt');
      alignSpecs.unshift('center');
      headerCellArr.unshift(`table.cell(fill: rgb("${TABLEHEAD}"), text(weight: "bold", size: ${S.thead}pt, fill: rgb("${BODY}"), [\\#]))`);
    }
    // Zebra: paint every other BODY row (header is y==0; header cells set own fill).
    const zebraArg = RT.zebra ? `fill: (_, y) => { if y > 0 and calc.even(y) { rgb("${SHADE}") } else { none } }, ` : '';
    const liLabel = config.labels?.lineItems ?? { en: 'Line Items', ar: 'البنود' };
    frag.lineItems = `#heading([${E(liLabel)}], [${A(liLabel)}])\n#table(columns: (${widthSpecs.join(', ')}), align: (${alignSpecs.join(', ')}), ${zebraArg}table.header(${headerCellArr.join(', ')}),\n${bodyRowArr.join(',\n')})\n#v(6pt)`;
  }

  // Totals — muted label/value rows, a hairline rule before the grand total, and
  // the grand total in a tinted band. Honours config.totals (per-row colours +
  // table style); the value column auto-sizes so the amount never wraps yet still
  // right-aligns to the same edge. Defaults reproduce the neutral clean look.
  if (data.totals?.length) {
    const tcfg = config.totals ?? {};
    const trc = tcfg.rowColors ?? {};
    const tstyle = tcfg.style ?? 'plain';
    const thighlight = tcfg.highlightTotal !== false;
    const rows: string[] = [];
    let ruled = false;
    data.totals.forEach((t, i) => {
      const isTotal = !!t.emphasis;
      const key = isTotal ? 'total' : t.key === 'balanceDue' ? 'balanceDue' : t.key === 'tax' ? 'tax' : null;
      const colors = key ? trc[key] : undefined;
      const striped = tstyle === 'striped' && i % 2 === 0;
      const bg = hexColor(colors?.background) ?? (isTotal ? (thighlight ? SHADE : null) : striped ? SHADE : null);
      const lblColor = hexColor(colors?.text) ?? (isTotal ? BODY : LABELC);
      const valColor = hexColor(colors?.text) ?? (isTotal ? ACCENT : BODY);
      const lbl = biLine(t.label, 'totals');
      if (isTotal && !ruled && tstyle !== 'bordered') {
        rows.push(`block(width: 100%, inset: (x: 8pt, y: 0pt), line(length: 100%, stroke: 0.5pt + rgb("${BORDER}")))`);
        ruled = true;
      }
      const fillArg = bg ? `fill: rgb("${bg}"), ` : '';
      const strokeArg = tstyle === 'bordered' ? `stroke: (bottom: 0.5pt + rgb("${BORDER}")), ` : '';
      const inset = isTotal ? '(x: 8pt, y: 6pt)' : '(x: 8pt, y: 2.5pt)';
      const lblText = `text(size: ${isTotal ? S.totLabelBold : S.totLabel}pt, ${isTotal ? 'weight: "bold", ' : ''}fill: rgb("${lblColor}"), [${lbl}])`;
      const valText = `text(size: ${isTotal ? S.totValBold : S.totValNormal}pt, ${isTotal ? 'weight: "bold", ' : ''}fill: rgb("${valColor}"), [${V(t.value)}])`;
      rows.push(
        `block(width: 100%, ${fillArg}${strokeArg}inset: ${inset}, grid(columns: (1fr, auto), column-gutter: 12pt, align(end + horizon, ${lblText}), align(end + horizon, ${valText})))`,
      );
    });
    const outerStroke = tstyle === 'bordered' ? `stroke: 0.5pt + rgb("${BORDER}"), ` : '';
    frag.totals = `#align(end, block(width: 260pt, ${outerStroke}stack(spacing: 0pt, ${rows.join(', ')})))\n#v(8pt)`;
  }

  // Tax Summary — standalone VAT/GST breakdown table (rate → taxable → tax) with
  // an emphasised totals row. Opt-in (data present only when config.taxSummary.show).
  if (data.taxSummary?.rows?.length) {
    const ts = data.taxSummary;
    const sc = config.taxSummary ?? {};
    const sStyle = sc.style ?? 'bordered';
    const hBg = hexColor(sc.headerBackground) ?? ACCENT;
    const hText = hexColor(sc.headerText) ?? '#ffffff';
    const bText = hexColor(sc.bodyText) ?? BODY;
    const tHi = sc.highlightTotalRow !== false;
    const tBg = hexColor(sc.totalRowBackground) ?? SHADE;
    const totalRowIdx = ts.rows.length + 1; // 0 = header, then rows, then total
    const stroke =
      sStyle === 'bordered' ? `0.5pt + rgb("${BORDER}")` : sStyle === 'borderless' ? 'none' : `(y: 0.5pt + rgb("${BORDER}"))`;
    const fillBranches = [
      `if y == 0 { rgb("${hBg}") }`,
      `else if y == ${totalRowIdx} { ${tHi ? `rgb("${tBg}")` : 'none'} }`,
      ...(sStyle === 'striped' ? [`else if calc.even(y) { rgb("${SHADE}") }`] : []),
      `else { none }`,
    ].join(' ');
    const hdr = [ts.columns.rate, ts.columns.taxable, ts.columns.tax]
      .map((c, i) => `table.cell(text(weight: "bold", size: ${S.thead}pt, fill: rgb("${hText}"), [${L(c)}]))${i === 0 ? '' : ''}`)
      .join(', ');
    const aligns = '(start, end, end)';
    const bodyRows = ts.rows
      .map((r) => `text(size: ${S.tcell}pt, fill: rgb("${bText}"), [${V(r.rate)}]), text(size: ${S.tcell}pt, fill: rgb("${bText}"), [${V(r.taxable)}]), text(size: ${S.tcell}pt, fill: rgb("${bText}"), [${V(r.tax)}])`)
      .join(',\n');
    const totalRow = `text(weight: "bold", size: ${S.tcell}pt, fill: rgb("${bText}"), [${L(ts.total.label)}]), text(weight: "bold", size: ${S.tcell}pt, fill: rgb("${bText}"), [${V(ts.total.taxable)}]), text(weight: "bold", size: ${S.tcell}pt, fill: rgb("${bText}"), [${V(ts.total.tax)}])`;
    let block = `#heading([${E(ts.title)}], [${A(ts.title)}])\n#table(columns: (1fr, 1fr, 1fr), align: ${aligns}, stroke: ${stroke}, fill: (_, y) => { ${fillBranches} }, table.header(${hdr}),\n${bodyRows},\n${totalRow})`;
    if (ts.amountInWords) block += `\n#text(size: ${S.taxWords}pt, style: "italic", fill: rgb("${LABELC}"), [${V(ts.amountInWords)}])`;
    frag.taxSummary = `${block}\n#v(8pt)`;
  }

  // Tax bar — full-width VAT/GST registration band, opt-in via config.taxBar,
  // number from a manual value or the identity vat_number (mirrors taxBar.ts).
  const tb = config.taxBar;
  if (tb?.enabled) {
    const taxNo = tb.source === 'manual' ? tb.value?.trim() : data.identity?.basic_info?.vat_number;
    if (taxNo) {
      const tbLabel = L(tb.label ?? { en: 'VAT Reg. No.', ar: 'الرقم الضريبي' });
      frag.taxBar = `#block(width: 100%, fill: rgb("${TABLEHEAD}"), inset: (x: 6pt, y: 4pt), align(center, text(size: ${S.value}pt, weight: "bold", fill: rgb("${ACCENT}"), [${tbLabel}: ${V(taxNo)}])))\n#v(8pt)`;
    }
  }

  // Standard Terms & Conditions (+ Notes) — the per-doc-type Studio content
  // (config.termsContent), bilingual centre-split. Mirrors renderTerms; never
  // reads the per-record terms (those are the separate recordTerms section below).
  {
    const tc = config.termsContent;
    const secLang = resolveSecondary(language);
    const plain = (s: string) => s.split(/\r?\n/).map((ln) => escapeTypst(ln)).join(' \\\n');
    const termBlocks: { heading: LabelText; body: LabelText }[] = [
      { heading: config.labels?.terms ?? { en: 'Terms & Conditions', ar: 'الشروط والأحكام' }, body: (tc?.terms ?? {}) as LabelText },
      { heading: config.labels?.notes ?? { en: 'Notes', ar: 'ملاحظات' }, body: (tc?.notes ?? {}) as LabelText },
    ];
    const column = (which: 'en' | 'sec'): string[] =>
      termBlocks
        .map((b) => {
          const raw = which === 'en' ? b.body.en : secondaryText(b.body, secLang);
          const body = (raw ?? '').trim();
          if (!body) return null;
          const heading = which === 'en' ? E(b.heading) : A(b.heading);
          return `[#text(weight: "bold", size: ${S.terms}pt, fill: rgb("${BODY}"), [${heading}]) #linebreak() #text(size: ${S.terms}pt, fill: rgb("${LABELC}"), [${plain(body)}])]`;
        })
        .filter((x): x is string => x !== null);
    const enCol = column('en');
    const secCol = secLang ? column('sec') : [];
    if (enCol.length || secCol.length) {
      const cell = (arr: string[]) => `block(inset: (x: 8pt, y: 6pt), stack(spacing: 4pt, ${(arr.length ? arr : ['[]']).join(', ')}))`;
      frag.terms = secCol.length
        ? `#block(width: 100%, stroke: 0.5pt + rgb("${BORDER}"), grid(columns: (1fr, 1fr), ${cell(enCol)}, ${cell(secCol)}))\n#v(6pt)`
        : `#block(width: 100%, stroke: 0.5pt + rgb("${BORDER}"), ${cell(enCol)})\n#v(6pt)`;
    }
  }

  // Per-record Quote/Invoice Terms (data.terms) — each a bilingual infobox; the
  // heading is renamable via labels.recordTerms (mirrors renderRecordTerms).
  {
    const recordLabel = config.labels?.recordTerms;
    const notesLabel = config.labels?.notes ?? { en: 'Notes', ar: 'ملاحظات' };
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[:：]\s*$/, '').toLowerCase();
    const blocks = data.terms?.blocks?.length
      ? data.terms.blocks
      : data.terms?.body
        ? [{ title: data.terms.title, body: data.terms.body }]
        : [];
    const out = blocks
      .map((b) => {
        const title = recordLabel && norm(en(b.title)) !== norm(en(notesLabel)) ? recordLabel : b.title;
        return `#infobox(iconNone, [${E(title)}], [${A(title)}], text(size: ${S.terms}pt, fill: rgb("${LABELC}"), [${htmlToTypst(b.body)}]))\n#v(6pt)`;
      })
      .join('\n');
    if (out) frag.recordTerms = out;
  }

  // Bank account — honours the Studio display style (boxed vs single line), box
  // width (auto/half/full) and alignment.
  if (data.bank) {
    const bankCfg = sectionCfg('bank');
    if (bankCfg?.bankStyle === 'inline') {
      const inline = data.bank.rows.map((r) => `${E(r.label)} ${V(r.value)}`).join('  •  ');
      frag.bank = `#block(width: 100%, inset: (y: 4pt), text(size: ${S.value}pt, [#text(weight: "bold", fill: rgb("${ACCENT}"), [${E(data.bank.title)}]) #h(6pt) #text(fill: rgb("${LABELC}"), [${inline}])]))\n#v(8pt)`;
    } else {
      const box = infobox('iconDoc', data.bank.title, data.bank.rows, 'parties');
      const width = bankCfg?.bankWidth ?? 'auto';
      const align = bankCfg?.bankAlign ?? 'left';
      frag.bank =
        width === 'full'
          ? `#${box}\n#v(8pt)`
          : `#align(${align}, block(width: 250pt, ${box}))\n#v(8pt)`;
    }
  }

  // Payment history — bilingual heading; columns follow the 'paymentHistory'
  // policy. Reference column is the flexible filler so the table never shrinks.
  if (data.paymentHistory?.rows?.length) {
    const ph = data.paymentHistory;
    const heads = [ph.columns.date, ph.columns.document, ph.columns.method, ph.columns.reference, ph.columns.recordedBy, ph.columns.amount, ph.columns.balance];
    const headerCells = heads
      .map((c) => `table.cell(fill: rgb("${TABLEHEAD}"), text(weight: "bold", size: ${S.thead}pt, fill: rgb("${BODY}"), [${biLine(c, 'paymentHistory')}]))`)
      .join(', ');
    const body = ph.rows
      .map((r) => [r.date, r.document, r.method, r.reference, r.recordedBy, r.amount, r.runningBalance].map((v) => `text(size: ${S.tcell}pt, fill: rgb("${BODY}"), [${V(v)}])`).join(', '))
      .join(',\n');
    frag.paymentHistory = `#heading([${E(ph.title)}], [${A(ph.title)}])\n#table(columns: (auto, auto, auto, 1fr, auto, auto, auto), table.header(${headerCells}),\n${body})\n#v(8pt)`;
  }

  // Signatures.
  if (data.signatures?.length) {
    const cells = data.signatures.map((s) => `[#v(24pt) #line(length: 80%, stroke: 0.5pt + rgb("${LABELC}")) #muted([${L(s)}])]`).join(', ');
    frag.signature = `#v(12pt)\n#grid(columns: (${data.signatures.map(() => '1fr').join(', ')}), gutter: 16pt, ${cells})`;
  }

  // QR code (verification) — rendered only when a QR asset was supplied.
  if (opts.qrPath) {
    frag.qr = `#v(8pt)\n#align(center, image("${opts.qrPath}", width: 72pt))`;
  }

  // ── Emit: header first, then the visible sections in config order ─────────
  if (isVisible('header')) parts.push(headerMarkup);

  const sideBySide =
    !!config.layout?.partiesMetaSideBySide && !!partyBox && !!metaBox && isVisible('parties') && isVisible('meta');
  const orderedKeys = [...sections].filter((s) => s.visible).sort((a, b) => a.order - b.order).map((s) => s.key);
  const keys = orderedKeys.length
    ? orderedKeys
    : ['parties', 'meta', 'taxBar', 'lineItems', 'totals', 'taxSummary', 'paymentHistory', 'terms', 'recordTerms', 'bank', 'signature', 'qr'];

  for (const key of keys) {
    if (key === 'header') continue;
    if (key === 'meta' && sideBySide) continue; // emitted alongside parties
    if (key === 'parties') {
      if (sideBySide) parts.push(`#grid(columns: (1fr, 1fr), gutter: 10pt, ${partyBox}, ${metaBox})`, '#v(8pt)');
      else if (partyBox) parts.push(`#${partyBox}`, '#v(8pt)');
      continue;
    }
    if (key === 'meta') {
      if (metaBox) parts.push(`#${metaBox}`, '#v(8pt)');
      continue;
    }
    if (frag[key]) parts.push(frag[key]);
  }

  return parts.join('\n');
}
