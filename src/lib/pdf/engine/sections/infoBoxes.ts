/**
 * Info-box sections — the "parties" block (issuer / recipient) and the "meta"
 * block (document number, dates, job id, …).
 *
 * Generalized from the `infoBoxesSection` in `documents/InvoiceDocument.ts`
 * (lines ~124-167). Renders through `createBilingualInfoBox`, and — this is the
 * known null-Arabic-title fix — passes the REAL Arabic title from the config
 * label (`LabelText.ar`) when the language mode is bilingual, instead of the
 * `null` the hand-written builders hardcoded.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualInfoBox } from '../../styles';
import { safeString } from '../../utils';
import { getGeneralIconSvg } from '../../../deviceIconMapper';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  PartyBlock,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel, fieldLabelLanguage } from '../labels';
import { engineLayoutDirection } from '../rtl';

function infoRow(
  label: LabelText,
  value: string,
  language: EngineContext['config']['language'],
  labelWidth: number,
): object {
  return {
    columns: [
      { text: resolveLabel(label, language), fontSize: 8, color: PDF_COLORS.textLight, width: labelWidth },
      { text: safeString(value), fontSize: 9, color: PDF_COLORS.text, width: '*' },
    ],
    margin: [0, 0, 0, 2],
  };
}

/** The bilingual-aware label column width for the current language mode. */
function labelWidthFor(language: EngineContext['config']['language']): number {
  return isBilingualMode(language) ? 150 : 90;
}

/**
 * The label/value rows for a party block (name first, then its detail rows).
 * `labelLang` is the (policy-resolved) language used for the FIELD-ROW labels and
 * the label-column width — it is the full bilingual config when the `parties`
 * group is translated, else primary-only when suppressed.
 */
function partyRows(party: PartyBlock, labelLang: EngineContext['config']['language']): object[] {
  const labelWidth = labelWidthFor(labelLang);
  const rows: object[] = [];
  if (party.name) {
    rows.push(infoRow({ en: 'Name:', ar: 'الاسم:' }, party.name, labelLang, labelWidth));
  }
  for (const r of party.rows) {
    rows.push(infoRow(r.label, r.value, labelLang, labelWidth));
  }
  return rows;
}

function partyBox(
  party: PartyBlock,
  engine: EngineContext,
  iconSvg: string,
): Content {
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'parties');

  // Pass the real Arabic title when bilingual; null collapses the AR column.
  // The TITLE stays on `language` (always bilingual); the field rows use
  // `labelLang` so the policy can suppress the per-row Arabic labels.
  return createBilingualInfoBox(
    en(party.title),
    bilingual ? ar(party.title, language) : null,
    partyRows(party, labelLang),
    iconSvg,
  ) as Content;
}

/** Build the party info boxes (recipient first, then issuer). May be empty. */
function buildPartyBoxes(engine: EngineContext, data: EngineDocData): Content[] {
  const userIcon = getGeneralIconSvg('user');
  const fileIcon = getGeneralIconSvg('fileText');
  const boxes: Content[] = [];
  if (data.parties.to) boxes.push(partyBox(data.parties.to, engine, userIcon));
  if (data.parties.from) boxes.push(partyBox(data.parties.from, engine, fileIcon));
  return boxes;
}

/** The meta (document-details) box title — a tenant label, or a sensible default. */
function metaTitleLabel(engine: EngineContext): LabelText {
  return engine.config.labels.meta ?? engine.config.labels.details ?? { en: 'Details', ar: 'التفاصيل' };
}

/** The label/value rows for the meta (document-details) block. */
function metaRows(engine: EngineContext, data: EngineDocData): object[] {
  const { language } = engine.config;
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'meta');
  const labelWidth = labelWidthFor(labelLang);
  return (data.meta ?? []).map((m) => infoRow(m.label, m.value, labelLang, labelWidth));
}

/** Build the meta (document-details) info box, or null when there is nothing to show. */
function buildMetaBox(engine: EngineContext, data: EngineDocData): Content | null {
  if (!data.meta || data.meta.length === 0) return null;
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const metaTitle = metaTitleLabel(engine);
  return createBilingualInfoBox(
    en(metaTitle),
    bilingual ? ar(metaTitle, language) : null,
    metaRows(engine, data),
    getGeneralIconSvg('fileText'),
  ) as Content;
}

/**
 * The header-band content (icon + English title left, Arabic title right) — the
 * same arrangement `createBilingualInfoBox` uses, reused by the equal-height
 * split panel so both layouts look identical.
 */
function bandHeaderColumns(iconSvg: string, titleEn: string, titleAr: string | null): object {
  return {
    columns: [
      iconSvg ? { svg: iconSvg, width: 13, height: 13, margin: [0, 0, 0, 0] } : { text: '', width: 0 },
      { text: titleEn, style: 'bilingualHeader', width: 'auto' },
      { text: '', width: '*' },
      titleAr ? { text: titleAr, style: 'bilingualHeader', alignment: 'right', width: 'auto' } : { text: '', width: 0 },
    ],
    columnGap: 6,
  };
}

/**
 * The "document details" half that sits beside the customer block: the financial
 * meta box (invoice/quote/receipt) or — for intake / checkout docs — the
 * case-info box. Returns its title + rendered rows, or null when neither exists.
 */
function detailsHalf(
  engine: EngineContext,
  data: EngineDocData,
): { title: LabelText; rows: object[] } | null {
  const { language } = engine.config;
  if (data.meta && data.meta.length > 0) {
    const metaLabelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'meta');
    const metaLabelWidth = labelWidthFor(metaLabelLang);
    return { title: metaTitleLabel(engine), rows: data.meta.map((m) => infoRow(m.label, m.value, metaLabelLang, metaLabelWidth)) };
  }
  if (data.caseInfo && data.caseInfo.rows.length > 0) {
    const caseLabelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'caseInfo');
    const caseLabelWidth = labelWidthFor(caseLabelLang);
    return {
      title: data.caseInfo.title,
      rows: data.caseInfo.rows.map((r) => infoRow(r.label, r.value, caseLabelLang, caseLabelWidth)),
    };
  }
  return null;
}

/**
 * Which section key supplies the "document details" half paired beside the
 * customer block — `meta` (financial) or `caseInfo` (intake/checkout) — so
 * `renderTemplate` knows which standalone section to drop when combining. Null
 * when neither is present.
 */
export function partiesDetailsKey(data: EngineDocData): 'meta' | 'caseInfo' | null {
  if (data.meta && data.meta.length > 0) return 'meta';
  if (data.caseInfo && data.caseInfo.rows.length > 0) return 'caseInfo';
  return null;
}

/**
 * Parties section: issuer (`from`) and/or recipient (`to`) side by side. When
 * only one is present it spans full width; when both, they split 50/50.
 */
export const renderParties: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const boxes = buildPartyBoxes(engine, data);

  if (boxes.length === 0) return null;
  if (boxes.length === 1) {
    return { stack: [boxes[0]], margin: [0, 0, 0, 8] };
  }

  return {
    columns: [
      { width: '50%', stack: [boxes[0]] },
      { width: 8, text: '' },
      { width: '50%', stack: [boxes[1]] },
    ],
    margin: [0, 0, 0, 8],
  };
};

/**
 * Meta section: document-level key/value rows (doc number, dates, job id, …)
 * rendered as a single bilingual info box. Returns null when there is nothing
 * to show.
 */
export const renderMeta: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const box = buildMetaBox(engine, data);
  return box ? { stack: [box], margin: [0, 0, 0, 8] } : null;
};

/**
 * Combined parties + details layout: the (single) customer/party box and the
 * document-details box side by side — the standard letterhead that fills the
 * empty space beside a lone customer block. The "details" half is the financial
 * meta box, or the case-info box for intake/checkout docs. Used by
 * `renderTemplate` when `config.layout.partiesMetaSideBySide` is on.
 *
 * The two halves are rendered as a single 2-column / 2-row table (header bands on
 * top, content below) so they are GUARANTEED the same height — a table row sizes
 * every cell to the tallest, so the shorter side's box stretches to match. Under
 * RTL the customer column moves to the right. When only one of the two is present
 * it degrades to a single full-width box.
 */
export function renderPartiesMeta(
  engine: EngineContext,
  data: EngineDocData,
): Content | null {
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const partyLabelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'parties');

  // The single party present (recipient preferred, else issuer). `renderTemplate`
  // only routes here when there is at most one party box.
  const party = data.parties.to ?? data.parties.from ?? null;
  const partyIcon = getGeneralIconSvg(data.parties.to ? 'user' : 'fileText');
  const details = detailsHalf(engine, data);

  // One side missing → fall back to a single full-width box.
  if (!party && !details) return null;
  if (!party) {
    return {
      stack: [
        createBilingualInfoBox(
          en(details!.title),
          bilingual ? ar(details!.title, language) : null,
          details!.rows,
          getGeneralIconSvg('fileText'),
        ) as Content,
      ],
      margin: [0, 0, 0, 8],
    };
  }
  if (!details) return renderParties(engine, data);

  const band = PDF_COLORS.background;

  const partyHeaderCell = {
    ...bandHeaderColumns(partyIcon, en(party.title), bilingual ? ar(party.title, language) : null),
    fillColor: band,
    margin: [6, 4, 6, 4],
  };
  const detailsHeaderCell = {
    ...bandHeaderColumns(getGeneralIconSvg('fileText'), en(details.title), bilingual ? ar(details.title, language) : null),
    fillColor: band,
    margin: [6, 4, 6, 4],
  };
  const partyContentCell = { stack: partyRows(party, partyLabelLang), margin: [8, 5, 8, 6] };
  const detailsContentCell = { stack: details.rows, margin: [8, 5, 8, 6] };

  const rtl = engineLayoutDirection(language) === 'rtl';
  const headerRow = rtl ? [detailsHeaderCell, partyHeaderCell] : [partyHeaderCell, detailsHeaderCell];
  const contentRow = rtl ? [detailsContentCell, partyContentCell] : [partyContentCell, detailsContentCell];
  // pdfmake content shapes are composed loosely here (as elsewhere in the engine);
  // cast the assembled body to the table-cell matrix type.
  const body = [headerRow, contentRow] as unknown as TableCell[][];

  return {
    table: {
      widths: ['*', '*'],
      body,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
    },
    margin: [0, 0, 0, 8],
  };
}
