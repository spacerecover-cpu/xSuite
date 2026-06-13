/**
 * Footer section — brand tagline + website, optionally alongside a QR code.
 * Generalized from the `footer` closure shared by the financial builders
 * (see `documents/InvoiceDocument.ts` lines ~504-623), reusing `createSocialFooter`
 * for the tagline/website/social treatment.
 *
 * Modeling note: the hand-written builders attach this as a pdfmake page
 * `footer` callback so it repeats on every page. The engine renders it as the
 * last block in the content stream (a single, document-end footer). Promoting
 * it to a repeating page footer is a `renderTemplate` concern for a later
 * milestone; see the M2 design doc.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS, createSocialFooter } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderFooter: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const settings = data.identity;
  const tagline = settings.branding?.brand_tagline || undefined;
  const online = settings.online_presence;
  const qr = engine.qrCodeBase64;

  // Nothing to show: no tagline, no website, no socials, no QR.
  const hasSocial =
    !!online &&
    (!!online.website || !!online.facebook || !!online.twitter || !!online.linkedin || !!online.instagram);
  if (!tagline && !hasSocial && !qr) return null;

  const divider: Content = {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.primary },
    ],
    margin: [0, 12, 0, 10],
  };

  const social = createSocialFooter(online, tagline) as Content;

  if (qr) {
    const caption = data.qrCaption ?? null;
    return {
      stack: [
        divider,
        {
          columns: [
            {
              width: 'auto',
              stack: [
                { image: qr, width: 60, height: 60, alignment: 'left', margin: [0, 0, 0, 2] },
                ...(caption
                  ? [{ text: caption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' as const }]
                  : []),
              ],
            },
            { text: '', width: '*' },
            { width: 'auto', stack: [social] },
          ],
        },
      ],
      margin: [0, 0, 0, 0],
    };
  }

  return { stack: [divider, social] };
};
