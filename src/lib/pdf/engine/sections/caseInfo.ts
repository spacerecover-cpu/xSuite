/**
 * Case-info section — the case identification / job header for intake
 * (office_receipt / customer_copy) and checkout (checkout_form) documents,
 * rendered as a single bilingual info box of label/value rows.
 *
 * Generalized from the "Case Details" box hand-written in
 * `documents/OfficeReceiptDocument.ts` (lines ~143-156) and
 * `documents/CheckoutFormDocument.ts` (lines ~138-144). Like `renderMeta`, it
 * lays each row through `createBilingualInfoBox` and surfaces the REAL Arabic
 * label (`LabelText.ar`) in bilingual modes instead of the hardcoded `null` the
 * legacy builders passed. The adapter supplies pre-formatted values (case no,
 * status, priority, received date/time, assigned technician, service type,
 * problem description); this renderer stays dumb.
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
 * Case-info section: case-level key/value rows (case no, status, priority,
 * received date/time, technician, service, problem) in one bilingual info box.
 * Returns null when there is no case context to show.
 */
export const renderCaseInfo: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const caseInfo = data.caseInfo;
  if (!caseInfo || caseInfo.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelWidth = bilingual ? 150 : 90;
  const fileIcon = getGeneralIconSvg('fileText');

  const rows: object[] = caseInfo.rows.map((r) => infoRow(r.label, r.value, language, labelWidth));

  const box = createBilingualInfoBox(
    en(caseInfo.title, 'Case Details'),
    bilingual ? ar(caseInfo.title) : null,
    rows,
    fileIcon,
  ) as Content;

  return { stack: [box], margin: [0, 0, 0, 8] };
};
