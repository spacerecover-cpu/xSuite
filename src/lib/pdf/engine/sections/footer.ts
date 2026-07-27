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
import { getGeneralIconSvg } from '../../../deviceIconMapper';
import type { CompanySettingsData } from '../../types';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveColors, resolveFooter, resolvePresentation } from '../branding';
import { contentWidth, footerBlockMargin, footerContentWidth } from '../pageGeometry';
import { qrContentNode } from './qr';

/**
 * Premium footer stack (presentation.footerSocialIcons): accent-colored bold
 * tagline, muted website line, then a centered row of social glyphs + names —
 * the reference finish. Returns null when the identity has nothing to show.
 */
function premiumSocialFooter(engine: EngineContext, identity: CompanySettingsData): Content | null {
  const tagline = identity.branding?.brand_tagline || null;
  const online = identity.online_presence;
  const accent = resolveColors(engine.config).accent;

  const lines: Content[] = [];
  if (tagline) {
    lines.push({ text: tagline, fontSize: 11, bold: true, color: accent, alignment: 'center', margin: [0, 0, 0, 2] });
  }
  if (online?.website) {
    lines.push({
      text: online.website.replace(/^https?:\/\//, ''),
      fontSize: 9,
      color: PDF_COLORS.textLight,
      alignment: 'center',
      margin: [0, 0, 0, 6],
    });
  }

  const networks: Array<{ key: 'facebook' | 'x' | 'linkedin' | 'instagram'; name: string; url?: string }> = [
    { key: 'facebook', name: 'Facebook', url: online?.facebook },
    { key: 'x', name: 'X', url: online?.twitter },
    { key: 'linkedin', name: 'LinkedIn', url: online?.linkedin },
    { key: 'instagram', name: 'Instagram', url: online?.instagram },
  ];
  const active = networks.filter((n) => !!n.url);
  if (active.length > 0) {
    const items: object[] = [];
    active.forEach((n, i) => {
      items.push({ svg: getGeneralIconSvg(n.key), width: 9, height: 9, margin: [0, 0.5, 0, 0] });
      items.push({
        text: n.name,
        fontSize: 8,
        color: PDF_COLORS.textLight,
        width: 'auto',
        margin: [3, 0, i < active.length - 1 ? 14 : 0, 0],
      });
    });
    lines.push({ columns: [{ text: '', width: '*' }, ...items, { text: '', width: '*' }] } as Content);
  }

  return lines.length > 0 ? ({ stack: lines } as Content) : null;
}

export const renderFooter: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const settings = data.identity;
  const tagline = settings.branding?.brand_tagline || undefined;
  const online = settings.online_presence;
  const qr = engine.qrCodeBase64;
  const zatca = data.zatcaPayload;
  const qrNode = qrContentNode(zatca, qr, data.qrPayload, 60, [0, 0, 0, 2]);

  // Nothing to show: no tagline, no website, no socials, no QR.
  const hasSocial =
    !!online &&
    (!!online.website || !!online.facebook || !!online.twitter || !!online.linkedin || !!online.instagram);
  if (!tagline && !hasSocial && !qrNode) return null;

  const premium = resolvePresentation(engine.config).footerSocialIcons;
  const divider: Content = {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: contentWidth(engine.config.paper),
        y2: 0,
        lineWidth: 0.5,
        lineColor: premium ? PDF_COLORS.border : PDF_COLORS.primary,
      },
    ],
    margin: [0, 12, 0, 10],
  };

  const social = premium
    ? (premiumSocialFooter(engine, settings) ?? (createSocialFooter(online, tagline) as Content))
    : (createSocialFooter(online, tagline) as Content);

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
 * Layout:
 * - With a QR: a divider rule, then a row of [QR + caption | spacer | tagline +
 *   website right-aligned], with page-edge margins `[inset, 0, inset, 25]`.
 * - Without a QR: a divider rule, then a centered tagline + website stack,
 *   margins `[inset, 10, inset, 25]`.
 *
 * The side inset comes from {@link footerBlockMargin}, which derives it from the
 * configured paper margins (RND-03) — it used to be a flat 35pt that ignored
 * `config.paper.margins` entirely, so a 20pt or 60pt template got a footer
 * detached from its text column. The default margins still resolve to 35.
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
  const hasQr = !!qr || !!zatca || !!data.qrPayload;
  if (!tagline && !hasSocial && !hasQr && !fcfg?.customText) return null;

  // Side inset + rule width both come from the page geometry, so the divider can
  // never be wider or narrower than the block it is drawn in.
  const qrBlockMargin = footerBlockMargin(engine.config.paper, 0, 25);
  const textBlockMargin = footerBlockMargin(engine.config.paper, 10, 25);

  const premium = resolvePresentation(engine.config).footerSocialIcons;
  const dividerLine: Content = {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: footerContentWidth(engine.config.paper),
        y2: 0,
        lineWidth: 0.5,
        lineColor: premium ? PDF_COLORS.border : PDF_COLORS.primary,
      },
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
      const fcfgQrNode = qrContentNode(zatca, qr, data.qrPayload, 60, [0, 0, 0, 0]);
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
          margin: qrBlockMargin,
        };
      }
      return { stack: [dividerLine, { stack: lines }], margin: textBlockMargin };
    }

    // Premium finish: accent tagline + website + social glyph row, centered
    // (QR, when present, keeps its left slot with the premium stack right).
    if (premium) {
      const premiumStack = premiumSocialFooter(engine, settings);
      const premiumQrNode = qrContentNode(zatca, qr, data.qrPayload, 60, [0, 0, 0, 2]);
      if (premiumStack && premiumQrNode) {
        return {
          stack: [
            dividerLine,
            {
              columns: [
                {
                  width: 'auto',
                  stack: [
                    premiumQrNode,
                    ...(caption
                      ? [{ text: caption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' as const }]
                      : []),
                  ],
                },
                { text: '', width: '*' },
                { width: 'auto', stack: [premiumStack] },
              ],
            },
          ],
          margin: qrBlockMargin,
        };
      }
      if (premiumStack) {
        return { stack: [dividerLine, premiumStack], margin: textBlockMargin };
      }
    }

    const qrNode = qrContentNode(zatca, qr, data.qrPayload, 60, [0, 0, 0, 2]);
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
        margin: qrBlockMargin,
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
      margin: textBlockMargin,
    };
  };
}
