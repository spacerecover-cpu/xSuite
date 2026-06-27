/**
 * Report-info-columns section — the Option B TWO-COLUMN info region for a
 * data-recovery report: a *General Details* column (customer + report meta)
 * beside a *Device Details* column (device specs), each a titled bilingual info
 * box of `Label : value` rows.
 *
 * This restructures the content the legacy `caseInfo` + `reportDiagnostics`
 * renderers produced (one stacked box each) into a side-by-side layout — the
 * Option B General | Device cards. The Device column is OMITTED for subtypes
 * without device data (prevention, recovered_files): the adapter sets
 * `device = null`, and the General column then spans the full printable width.
 *
 * RTL-aware: under Arabic-lead layout the two columns swap sides so General reads
 * first on the right. Reuses `createBilingualInfoBox` (the same card chrome as
 * the existing info boxes) so the visual language is consistent. The adapter
 * pre-formats every value; this renderer only lays the columns out. Returns null
 * when there is no General column to show.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualInfoBox } from '../../styles';
import { safeString } from '../../utils';
import { getGeneralIconSvg } from '../../../deviceIconMapper';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  ReportInfoColumnsBlock,
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

function columnBox(
  col: ReportInfoColumnsBlock['general'],
  language: EngineContext['config']['language'],
  iconSvg: string,
  fallbackTitle: string,
): Content {
  const bilingual = isBilingualMode(language);
  // Two-column cards sit narrower than full width — use a tighter label column
  // so the value half stays legible (bilingual labels still get more room).
  const labelWidth = bilingual ? 95 : 70;
  const rows = col.rows.map((r) => infoRow(r.label, r.value, language, labelWidth));
  return createBilingualInfoBox(
    en(col.title, fallbackTitle),
    bilingual ? ar(col.title, language) : null,
    rows,
    iconSvg,
  ) as Content;
}

export const renderReportInfoColumns: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const block = data.reportInfoColumns;
  if (!block || block.general.rows.length === 0) return null;

  const { language } = engine.config;
  const rtl = isBilingualMode(language) && language.primary === 'ar';
  const generalIcon = getGeneralIconSvg('fileText');
  const deviceIcon = generalIcon;

  const generalBox = columnBox(block.general, language, generalIcon, 'General Details');

  // No device data (prevention / recovered_files): General spans full width.
  if (!block.device || block.device.rows.length === 0) {
    return { stack: [generalBox], margin: [0, 0, 0, 12] };
  }

  const deviceBox = columnBox(block.device, language, deviceIcon, 'Device Details');
  const generalCol = { width: '*', stack: [generalBox] };
  const deviceCol = { width: '*', stack: [deviceBox] };

  return {
    columns: rtl ? [deviceCol, generalCol] : [generalCol, deviceCol],
    columnGap: 10,
    margin: [0, 0, 0, 12],
  };
};
