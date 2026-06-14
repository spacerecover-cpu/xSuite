/**
 * Custody-summary section — the forensic SUMMARY box for a Chain-of-Custody
 * report, rendered as a single bilingual info box of pre-computed label/value
 * rows (total entries, action categories, unique actors, date range).
 *
 * Restored from the legacy `buildSummarySection` in
 * `documents/ChainOfCustodyDocument.ts` (lines ~123-194), which the M2 engine
 * folded away when it collapsed everything into the inline custody-log columns.
 * This brings the box back so the engine custody report is forensically complete
 * before the chain_of_custody flag flips.
 *
 * Like `renderCaseInfo`, it lays each row through `createBilingualInfoBox` and
 * surfaces the REAL Arabic label (`LabelText.ar`) in bilingual modes. The adapter
 * derives every value from the ledger (counts, distinct sets, date span); this
 * renderer stays dumb and returns null when there are no rows.
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
 * Custody-summary section: the report's aggregate counts (total entries, action
 * categories, unique actors) and the date range, in one bilingual info box.
 * Returns null when the adapter supplied no summary rows.
 */
export const renderCustodySummary: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const summary = data.custodySummary;
  if (!summary || summary.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelWidth = bilingual ? 150 : 110;
  const summaryIcon = getGeneralIconSvg('fileText');

  const rows: object[] = summary.rows.map((r) => infoRow(r.label, r.value, language, labelWidth));

  const box = createBilingualInfoBox(
    en(summary.title, 'Summary'),
    bilingual ? ar(summary.title) : null,
    rows,
    summaryIcon,
  ) as Content;

  return { stack: [box], margin: [0, 0, 0, 10] };
};
