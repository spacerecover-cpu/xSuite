/**
 * Document-reference section — the "Case ID: CASE-0042" banner rendered under
 * the document title (premium presentation). Two finishes:
 *
 * - `'banner'`: a full-width rounded hairline box with the centered reference —
 *   the flagship intake/checkout treatment.
 * - `'pill'`: a compact centered rounded chip on a light fill — the report
 *   treatment.
 *
 * Triple-gated so legacy output can never change: the adapter must emit
 * {@link EngineDocData.docRef}, the config must list a visible `docRef`
 * section, and the resolved presentation style must not be `'none'`. The
 * rounded box is a pdfmake canvas rect (`r` radius) with the text pulled up
 * over it via a negative stack margin; the box height is generous enough to
 * absorb the document font scale (the assembler's `scaleFontSizes` pass touches
 * only `fontSize`, never canvas geometry).
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, PDF_TONES } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveColors, resolvePresentation } from '../branding';
import { ar, en } from '../labels';

/** The printable content width for the default A4/40pt-margin geometry. */
const CONTENT_WIDTH = 515;
const BANNER_HEIGHT = 28;
const PILL_HEIGHT = 26;

export const renderDocRef: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const ref = data.docRef;
  if (!ref || !ref.value) return null;

  const presentation = resolvePresentation(engine.config);
  if (presentation.docRef === 'none') return null;

  const { language } = engine.config;
  const colors = resolveColors(engine.config);
  // The banner reads in ONE language (the reference look): the secondary when
  // it leads, else English — a joined bilingual label would crowd the box.
  const labelText = ref.label ?? { en: 'Case ID', ar: 'رقم الحالة' };
  const label =
    language.primary === 'ar'
      ? (ar(labelText, language) ?? en(labelText, 'Case ID'))
      : en(labelText, 'Case ID');

  const refText: Content = {
    text: [
      { text: `${label}: `, color: colors.accent, bold: true },
      { text: ref.value, color: PDF_COLORS.primaryDark, bold: true },
    ],
    fontSize: 11,
    alignment: 'center',
  };

  if (presentation.docRef === 'pill') {
    // Chip width tracks the text length (rough glyph estimate) within bounds.
    const width = Math.min(CONTENT_WIDTH, Math.max(120, (label.length + ref.value.length + 2) * 6.4 + 28));
    const x = (CONTENT_WIDTH - width) / 2;
    return {
      stack: [
        {
          canvas: [
            {
              type: 'rect',
              x,
              y: 0,
              w: width,
              h: PILL_HEIGHT,
              r: 5,
              lineWidth: 0.75,
              lineColor: PDF_TONES.neutral.border,
              color: PDF_COLORS.headerBg,
            },
          ],
        },
        { ...refText, margin: [0, -(PILL_HEIGHT - 8), 0, 0] },
      ],
      margin: [0, 2, 0, 14],
    } as Content;
  }

  return {
    stack: [
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: CONTENT_WIDTH,
            h: BANNER_HEIGHT,
            r: 5,
            lineWidth: 0.75,
            lineColor: PDF_COLORS.border,
            color: PDF_COLORS.white,
          },
        ],
      },
      { ...refText, margin: [0, -(BANNER_HEIGHT - 8), 0, 0] },
    ],
    margin: [0, 0, 0, 10],
  } as Content;
};
