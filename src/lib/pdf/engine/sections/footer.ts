/**
 * Footer section — brand tagline + website, optionally alongside a QR code.
 * Generalized from the `footer` closure shared by the financial builders
 * (see `documents/InvoiceDocument.ts` lines ~504-623), reusing `createSocialFooter`
 * for the tagline/website/social treatment.
 *
 * Two consumers:
 * - {@link renderFooter}: the in-content section renderer (used when a tenant
 *   reorders the footer into the body stream, or for non-paged previews).
 * - {@link buildPageFooter}: a pdfmake page-`footer` callback factory so the
 *   footer/QR repeat on EVERY page, matching the hand-written builders. The
 *   assembler (`renderTemplate`) prefers this when the config has visible
 *   `footer`/`qr` sections, and drops those sections from the content stream so
 *   the footer is not also rendered inline.
 */

import type { Content, DynamicContent } from 'pdfmake/interfaces';
import { PDF_COLORS, createSocialFooter } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveFooter } from '../branding';
import { qrContentNode } from './qr';

export const renderFooter: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const settings = data.identity;
  const tagline = settings.branding?.brand_tagline || undefined;
  const online = settings.online_presence;
  const qr = engine.qrCodeBase64;
  const zatca = data.zatcaPayload;
  const qrNode = qrContentNode(zatca, qr, 60, [0, 0, 0, 2]);

  // Nothing to show: no tagline, no website, no socials, no QR.
  const hasSocial =
    !!online &&
    (!!online.website || !!online.facebook || !!online.twitter || !!online.linkedin || !!online.instagram);
  if (!tagline && !hasSocial && !qrNode) return null;

  const divider: Content = {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.primary },
    ],
    margin: [0, 12, 0, 10],
  };

  const social = createSocialFooter(online, tagline) as Content;

  if (qrNode) {
    const caption = data.qrCaption ?? null;
    return {
      stack: [
        divider,
        {
          columns: [
            {
              width: 'auto',
              stack: [
                qrNode,
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

/**
 * Build a pdfmake page-`footer` callback that repeats the footer (divider +
 * tagline + website, optionally with a left-aligned QR) on every page —
 * mirroring `documents/InvoiceDocument.ts`'s `footer: (currentPage, pageCount)`
 * closure (lines ~504-623).
 *
 * Returns `null` when there is nothing to show (no tagline, no website/socials,
 * no QR) so generic documents without those sections get no page footer.
 *
 * Layout parity with the legacy builder:
 * - With a QR: a divider rule, then a row of [QR + caption | spacer | tagline +
 *   website right-aligned], with page-edge margins `[35, 0, 35, 25]`.
 * - Without a QR: a divider rule, then a centered tagline + website stack,
 *   margins `[35, 10, 35, 25]`.
 */
export function buildPageFooter(
  engine: EngineContext,
  data: EngineDocData,
): DynamicContent | null {
  const settings = data.identity;
  const tagline = settings.branding?.brand_tagline || null;
  const online = settings.online_presence;
  const qr = engine.qrCodeBase64;
  const zatca = data.zatcaPayload;
  const caption = data.qrCaption ?? null;

  // Footer config (opt-in): a custom text + styling override. Absent → today's
  // identity-driven footer (parity).
  const fcfg = engine.config.footer ? resolveFooter(engine.config) : null;

  const hasSocial =
    !!online &&
    (!!online.website || !!online.facebook || !!online.twitter || !!online.linkedin || !!online.instagram);
  const hasQr = !!qr || !!zatca;
  if (!tagline && !hasSocial && !hasQr && !fcfg?.customText) return null;

  const dividerLine: Content = {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.primary },
    ],
    margin: [0, 0, 0, 10],
  };

  return (): Content => {
    // Opt-in custom footer: styled text (+ website), optionally beside the QR.
    if (fcfg) {
      const text = fcfg.customText ?? tagline ?? '';
      const lines: Content[] = [];
      if (text) lines.push({ text, fontSize: fcfg.fontSize, bold: true, color: fcfg.fontColor, alignment: fcfg.alignment });
      if (online?.website) {
        lines.push({ text: online.website, fontSize: Math.max(7, fcfg.fontSize - 1), color: fcfg.fontColor, alignment: fcfg.alignment, margin: [0, 2, 0, 0] });
      }
      const fcfgQrNode = qrContentNode(zatca, qr, 60, [0, 0, 0, 0]);
      if (fcfgQrNode) {
        return {
          stack: [
            dividerLine,
            {
              columns: [
                { width: 'auto', stack: [fcfgQrNode] },
                { text: '', width: '*' },
                { width: 'auto', stack: lines },
              ],
            },
          ],
          margin: [35, 0, 35, 25],
        };
      }
      return { stack: [dividerLine, { stack: lines }], margin: [35, 10, 35, 25] };
    }

    const qrNode = qrContentNode(zatca, qr, 60, [0, 0, 0, 2]);
    if (qrNode) {
      const footerStack: Content[] = [];
      if (tagline) {
        footerStack.push({
          text: tagline,
          fontSize: 10,
          bold: true,
          color: PDF_COLORS.primary,
          alignment: 'right',
          margin: [0, 5, 0, 1],
        });
      }
      if (online?.website) {
        footerStack.push({
          text: online.website,
          fontSize: 8,
          color: PDF_COLORS.textLight,
          alignment: 'right',
          margin: [0, 0, 0, 0],
        });
      }

      return {
        stack: [
          dividerLine,
          {
            columns: [
              {
                width: 'auto',
                stack: [
                  qrNode,
                  ...(caption
                    ? [{ text: caption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' as const, margin: [0, 0, 0, 0] as [number, number, number, number] }]
                    : []),
                ],
              },
              { text: '', width: '*' },
              { width: 'auto', stack: footerStack },
            ],
          },
        ],
        margin: [35, 0, 35, 25],
      };
    }

    const footerLines: Content[] = [];
    if (tagline) {
      footerLines.push({ text: tagline, fontSize: 10, bold: true, color: PDF_COLORS.primary, alignment: 'center' });
    }
    if (online?.website) {
      footerLines.push({ text: online.website, fontSize: 8, color: PDF_COLORS.textLight, alignment: 'center', margin: [0, 2, 0, 0] });
    }

    return {
      stack: [dividerLine, { stack: footerLines }],
      margin: [35, 10, 35, 25],
    };
  };
}
