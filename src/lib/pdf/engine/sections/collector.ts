/**
 * Collector section — the CHECKOUT collector block for a device return/checkout
 * document: who physically collected the device(s) and when (collector name /
 * mobile / national ID / checkout date / notes), rendered as a single bilingual
 * info box of label/value rows.
 *
 * Generalized from the "Collection Information" box hand-written in
 * `documents/CheckoutFormDocument.ts` (lines ~146-167). The actual signature
 * LINES are NOT drawn here — the shared `signature` section
 * (`engine/sections/signature.ts`, fed by {@link EngineDocData.signatures})
 * owns those, so a checkout config lists both a `collector` and a `signature`
 * section. This renderer only lays out the collector identity/date/notes box and
 * surfaces the real Arabic title in bilingual modes (never a hardcoded null).
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualInfoBox } from '../../styles';
import { safeString } from '../../utils';
import { getGeneralIconSvg } from '../../../deviceIconMapper';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';

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

/**
 * Collector section: checkout collector identity + date/notes rows in one
 * bilingual info box. Returns null when there is no collection context.
 */
export const renderCollector: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const collector = data.collector;
  if (!collector || collector.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelWidth = bilingual ? 150 : 90;
  const userIcon = getGeneralIconSvg('user');

  const rows: object[] = collector.rows.map((r) => infoRow(r.label, r.value, language, labelWidth));

  const box = createBilingualInfoBox(
    en(collector.title, 'Collection Information'),
    bilingual ? ar(collector.title) : null,
    rows,
    userIcon,
  ) as Content;

  return { stack: [box], margin: [0, 0, 0, 8] };
};
