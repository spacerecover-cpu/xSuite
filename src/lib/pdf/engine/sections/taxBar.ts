/**
 * Tax-bar section — a full-width VAT/GST identification band (supplier tax
 * registration number), rendered above the line items on a financial document.
 * Common on GCC tax invoices (UAE FTA / KSA ZATCA), where the supplier TRN/VATIN
 * must appear prominently.
 *
 * Opt-in: renders only when `config.taxBar.enabled` and a number is available
 * (the identity `vat_number`, or a manual value). Otherwise returns null.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveLabel } from '../labels';
import { resolveColors } from '../branding';

export const renderTaxBar: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const taxBar = engine.config.taxBar;
  if (!taxBar?.enabled) return null;

  const number =
    taxBar.source === 'manual' ? taxBar.value?.trim() : data.identity.basic_info?.vat_number;
  if (!number) return null;

  const label = resolveLabel(
    taxBar.label ?? { en: 'VAT Reg. No.', ar: 'الرقم الضريبي' },
    engine.config.language,
  );
  const colors = resolveColors(engine.config);
  const fill = engine.config.colors?.headerBackground ?? PDF_COLORS.headerBg;

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: `${label}: ${number}`,
            fontSize: 9,
            bold: true,
            color: colors.accent,
            fillColor: fill,
            alignment: 'center',
            margin: [6, 4, 6, 4],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 8],
  };
};
