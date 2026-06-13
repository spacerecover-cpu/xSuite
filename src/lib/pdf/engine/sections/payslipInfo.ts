/**
 * Payslip-info section — the employee/period header for a payslip: employee name
 * + number, the pay period, payment date, and the working-days/hours rows,
 * rendered as a single bilingual info box of label/value rows.
 *
 * Generalized from the hand-written "Employee Information" + "Attendance Summary"
 * boxes in `documents/PayslipDocument.ts` (lines ~83-149). Like `renderCaseInfo`,
 * it lays each row through `createBilingualInfoBox` and surfaces the REAL Arabic
 * label (`LabelText.ar`) in bilingual modes instead of the hardcoded `null` the
 * legacy builder passed. The adapter supplies pre-formatted values (name,
 * employee number, period, payment date, working/worked/absent days, regular/
 * overtime hours); this renderer stays dumb.
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
 * Payslip-info section: employee/period key/value rows in one bilingual info
 * box. Returns null when there is no payslip header to show.
 */
export const renderPayslipInfo: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const info = data.payslipInfo;
  if (!info || info.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelWidth = bilingual ? 150 : 110;
  const userIcon = getGeneralIconSvg('user');

  const rows: object[] = info.rows.map((r) => infoRow(r.label, r.value, language, labelWidth));

  const box = createBilingualInfoBox(
    en(info.title, 'Employee Information'),
    bilingual ? ar(info.title) : null,
    rows,
    userIcon,
  ) as Content;

  return { stack: [box], margin: [0, 0, 0, 10] };
};
