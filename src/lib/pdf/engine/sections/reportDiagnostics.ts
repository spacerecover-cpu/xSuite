/**
 * Report-diagnostics section — the device DIAGNOSTICS info box for a case REPORT
 * (the "Device Details" / "Component Diagnostics" block), rendered as a single
 * bilingual info box of label/value rows. The device-level counterpart to
 * {@link renderCaseInfo}, reusing the same `createBilingualInfoBox` + label/value
 * row pattern.
 *
 * Generalized from the Device-Details + Component-Diagnostics block hand-written
 * in `documents/ReportDocument.ts` (lines ~300-400). There the HDD branch reads
 * `heads_status` / `pcb_status` / `motor_status` / `surface_status` and the SSD
 * branch reads `controller_status` / `memory_chips_status` / `controller_model`
 * / `nand_type`, keyed off `diagnosticsData.device_type_category`. The HDD-vs-SSD
 * field-set selection lives ENTIRELY in the adapter: it pre-formats every value
 * and emits the right rows for the device kind. This renderer stays dumb — like
 * `renderCaseInfo`, it only lays each supplied `{ label, value }` row through
 * `createBilingualInfoBox`, surfacing the REAL Arabic label (`LabelText.ar`) in
 * bilingual modes. Returns null when there are no rows to show.
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
import { isBilingualMode, en, ar, resolveLabel, fieldLabelLanguage } from '../labels';

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
 * Report-diagnostics renderer: the device diagnostics (Device Details / Component
 * Diagnostics) as label/value rows in one bilingual info box. The adapter has
 * already chosen the HDD- or SSD-specific rows; this renderer only lays them out.
 * Returns null when there is nothing to show.
 */
export const renderDiagnostics: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const diagnostics = data.diagnostics;
  if (!diagnostics || diagnostics.rows.length === 0) return null;

  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const labelLang = fieldLabelLanguage(language, engine.config.translationPolicy, 'diagnostics');
  const labelWidth = isBilingualMode(labelLang) ? 150 : 90;
  const mediaIcon = getGeneralIconSvg('fileText');

  const rows: object[] = diagnostics.rows.map((r) => infoRow(r.label, r.value, labelLang, labelWidth));

  const box = createBilingualInfoBox(
    en(diagnostics.title, 'Device Details'),
    bilingual ? ar(diagnostics.title, language) : null,
    rows,
    mediaIcon,
  ) as Content;

  return { stack: [box], margin: [0, 0, 0, 8] };
};
