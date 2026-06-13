/**
 * Header section — logo + legal name + address + contact, plus the centered
 * document title and the brand divider rule.
 *
 * Generalized from the header block duplicated across ~10 hand-written builders
 * (see `documents/InvoiceDocument.ts` lines ~36-119). Honors `branding.logo`
 * (falls back to a centered name block when no logo) and the resolved document
 * title from {@link EngineDocData.documentTitle} via the language mode.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { buildCompanyAddress } from '../../utils';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveLabel } from '../labels';

export const renderHeader: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content[] => {
  const { config, logoBase64 } = engine;
  const settings = data.identity;

  const companyName = settings.basic_info?.company_name || 'Company Name';
  const legalName = settings.basic_info?.legal_name || companyName;
  const companyAddress = buildCompanyAddress(settings.location);

  const contactLines: string[] = [];
  if (settings.contact_info?.phone_primary) {
    contactLines.push(`Tel: ${settings.contact_info.phone_primary}`);
  }
  if (settings.contact_info?.email_general) {
    contactLines.push(`Email: ${settings.contact_info.email_general}`);
  }

  const showLogo = config.branding.logo && !!logoBase64;
  const out: Content[] = [];

  if (showLogo) {
    out.push({
      columns: [
        { image: logoBase64 as string, width: 130, margin: [0, 0, 0, 5] },
        {
          stack: [
            { text: legalName, fontSize: 14, bold: true, color: PDF_COLORS.text, alignment: 'right' },
            { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, alignment: 'right', margin: [0, 2, 0, 0], lineHeight: 1.1 },
            ...contactLines.map((line) => ({
              text: line,
              fontSize: 8,
              color: PDF_COLORS.textLight,
              alignment: 'right' as const,
              margin: [0, 0, 0, 0] as [number, number, number, number],
              lineHeight: 1.1,
            })),
          ],
          width: '*',
        },
      ],
      margin: [0, 0, 0, 12],
    });
  } else {
    out.push({
      stack: [
        { text: legalName, fontSize: 14, bold: true, color: PDF_COLORS.text, alignment: 'center' },
        { text: companyAddress, fontSize: 8, color: PDF_COLORS.textLight, alignment: 'center', margin: [0, 2, 0, 0], lineHeight: 1.1 },
        ...contactLines.map((line) => ({
          text: line,
          fontSize: 8,
          color: PDF_COLORS.textLight,
          alignment: 'center' as const,
          margin: [0, 0, 0, 0] as [number, number, number, number],
          lineHeight: 1.1,
        })),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // Brand divider rule under the company block.
  out.push({
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.primary },
    ],
    margin: [0, 0, 0, 12],
  });

  // Centered document title. Precedence: the ADAPTER-computed title wins when it
  // supplies one (e.g. a PROFORMA invoice renders "PROFORMA INVOICE | فاتورة مبدئية"
  // even though the built-in config carries the static "TAX INVOICE"), then the
  // tenant-configurable `config.labels.documentTitle`, then a sane default. The
  // adapter's title is the source of truth for instance-specific variants the
  // static config can't know (proforma vs tax invoice, draft vs issued, …).
  const titleLabel =
    (data.documentTitle && data.documentTitle.en)
      ? data.documentTitle
      : (config.labels.documentTitle ?? { en: 'DOCUMENT' });
  out.push({
    text: resolveLabel(titleLabel, config.language),
    fontSize: 16,
    bold: true,
    color: PDF_COLORS.primaryDark,
    alignment: 'center',
    margin: [0, 0, 0, 6],
  });

  return out;
};
