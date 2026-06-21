/**
 * Case-label section — the compact, print-friendly LABEL body for a physical
 * case/device label: a large centered case number, an optional colour-coded
 * priority badge, the received date, and a short device-summary list.
 *
 * Generalized from `documents/CaseLabelDocument.ts` (large case-number block
 * lines ~53-71, priority badge ~34-48, received date ~73-89, device summary
 * ~139-198). Unlike the table sections this one is a self-contained document
 * body laid out for a small label-sized page. Every value is pre-formatted by
 * the adapter; the renderer only positions them. The RAW priority string is
 * passed through so the badge colour comes from `getPriorityColor` (the same
 * palette the legacy builder used). Returns null when there is no case number.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, getPriorityColor } from '../../styles';
import { safeString } from '../../utils';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveLabel } from '../labels';

export const renderCaseLabel: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const label = data.caseLabel;
  if (!label || !safeString(label.caseNumber) || label.caseNumber === '-') return null;

  const { language } = engine.config;
  const stack: Content[] = [];

  // Priority badge (centered pill), coloured by the raw priority string.
  if (label.priority) {
    const priorityColor = getPriorityColor(label.priority);
    stack.push({
      table: {
        widths: ['auto'],
        body: [
          [
            {
              text: label.priority.toUpperCase(),
              fontSize: 10,
              bold: true,
              color: PDF_COLORS.white,
              fillColor: priorityColor,
              alignment: 'center',
              margin: [10, 3, 10, 3],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      alignment: 'center',
      margin: [0, 0, 0, 8],
    });
  }

  // Optional bilingual caption (e.g. "CASE NUMBER" / "رقم الحالة") above the no.
  if (label.subtitle) {
    stack.push({
      text: resolveLabel(label.subtitle, language),
      fontSize: 8,
      color: PDF_COLORS.textLight,
      alignment: 'center',
      margin: [0, 0, 0, 3],
    });
  }

  // Large centered case number — the label's focal point (legacy fontSize 28).
  stack.push({
    text: safeString(label.caseNumber),
    fontSize: 28,
    bold: true,
    color: PDF_COLORS.primary,
    alignment: 'center',
    margin: [0, 0, 0, 6],
  });

  // Received date/time line.
  if (label.receivedAt) {
    stack.push({
      text: safeString(label.receivedAt),
      fontSize: 9,
      color: PDF_COLORS.textLight,
      alignment: 'center',
      margin: [0, 0, 0, 8],
    });
  }

  // Dashed divider before the device summary, matching the legacy label.
  const summary = label.deviceSummary ?? [];
  if (summary.length > 0) {
    stack.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 200,
          y2: 0,
          lineWidth: 1,
          lineColor: PDF_COLORS.border,
          dash: { length: 3, space: 2 },
        },
      ],
      margin: [0, 0, 0, 8],
    });
    summary.forEach((line, i) => {
      stack.push({
        text: safeString(line),
        fontSize: i === 0 ? 10 : 8,
        bold: i === 0,
        color: i === 0 ? PDF_COLORS.text : PDF_COLORS.textLight,
        alignment: 'center',
        margin: [0, 0, 0, 2],
      });
    });
  }

  return { stack, margin: [0, 0, 0, 8] };
};
