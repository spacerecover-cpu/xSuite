/**
 * Header section — logo + legal name + address + contact, plus the centered
 * document title and the brand divider rule.
 *
 * Two paths:
 * - LEGACY (default): when neither a `header` nor an `organization` group is
 *   set, this renders exactly the original letterhead (logo left + identity
 *   right, or a centered name block; a thin rule; the centered title). Every
 *   built-in template takes this path, so the golden/parity wall is unaffected.
 * - BUILDER (opt-in): when a tenant sets `config.header` and/or
 *   `config.organization`, the 6-layout header builder runs — logo placement /
 *   size, divider style + nudge, address zone, and per-line organization
 *   toggles (with a manual identity source). Generalized from the header block
 *   duplicated across ~10 hand-written builders.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { buildCompanyAddress } from '../../utils';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { resolveLabel } from '../labels';
import { resolveColors, resolveHeader, resolveOrganization } from '../branding';
import type { ResolvedHeader } from '../branding';
import { buildLogoNode, classifyLogo } from '../../brandingImage';

type Align = 'left' | 'center' | 'right';

export const renderHeader: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content[] => {
  const { config, logo } = engine;
  const settings = data.identity;
  const colors = resolveColors(config);

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

  // The centered document title is shared by both paths. Precedence: the
  // ADAPTER-computed title wins (e.g. PROFORMA vs TAX INVOICE), then the
  // tenant-configurable `config.labels.documentTitle`, then a sane default. The
  // title adopts the accent only when the premium `colors` group is set.
  const titleLabel =
    data.documentTitle && data.documentTitle.en
      ? data.documentTitle
      : config.labels.documentTitle ?? { en: 'DOCUMENT' };
  const titleBlock: Content = {
    text: resolveLabel(titleLabel, config.language),
    fontSize: 16,
    bold: true,
    color: config.colors ? colors.accent : PDF_COLORS.primaryDark,
    alignment: 'center',
    margin: [0, 0, 0, 6],
  };

  const showLogo = config.branding.logo && classifyLogo(logo).kind !== 'none';

  // ── LEGACY path — byte-identical to the original letterhead (parity) ───────
  if (!config.header && !config.organization) {
    const out: Content[] = [];
    if (showLogo) {
      out.push({
        columns: [
          buildLogoNode(logo, { width: 130, margin: [0, 0, 0, 5] })!,
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

    // Brand divider rule — neutral by default, accent when opted in (resolveColors
    // applies the colors.accent → branding.accent → neutral precedence).
    out.push({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 0.5, lineColor: colors.accent }],
      margin: [0, 0, 0, 12],
    });
    out.push(titleBlock);
    return out;
  }

  // ── BUILDER path (opt-in) — 6 layouts + organization toggles ──────────────
  const header = resolveHeader(config);
  const org = config.organization ? resolveOrganization(config) : null;
  const wantLogo = showLogo && (org ? org.show.logo : true);
  const brandLogo = wantLogo ? classifyLogo(logo) : null;

  const nameColor = config.colors ? colors.text : PDF_COLORS.text;
  const mutedColor = config.colors ? colors.label : PDF_COLORS.textLight;
  const addrSize = org?.addressFontSize ?? 8;

  /** Build the identity text lines for a given alignment, honoring org toggles. */
  const identityLines = (align: Align): Content[] => {
    const lines: Content[] = [];
    const pick = (manual: string | undefined, fallback: string) =>
      org?.source === 'manual' ? manual ?? fallback : fallback;

    if (!org || org.show.legalName) {
      lines.push({ text: pick(org?.manual.legalName, legalName), fontSize: 14, bold: true, color: nameColor, alignment: align });
    }
    if (org?.show.legalNameAr && org.manual.legalNameAr) {
      lines.push({ text: org.manual.legalNameAr, fontSize: 12, bold: true, color: nameColor, alignment: align });
    }
    if (org?.show.name) {
      const n = pick(org.manual.name, companyName);
      if (n && n !== pick(org?.manual.legalName, legalName)) {
        lines.push({ text: n, fontSize: 9, color: mutedColor, alignment: align });
      }
    }
    if (org?.show.nameAr && org.manual.nameAr) {
      lines.push({ text: org.manual.nameAr, fontSize: 9, color: mutedColor, alignment: align });
    }
    if (!org || org.show.address) {
      lines.push({ text: pick(org?.manual.address, companyAddress), fontSize: addrSize, color: mutedColor, alignment: align, margin: [0, 2, 0, 0], lineHeight: 1.1 });
    }
    for (const line of contactLines) {
      lines.push({ text: line, fontSize: 8, color: mutedColor, alignment: align, lineHeight: 1.1 });
    }
    if (org?.show.taxId) {
      const tax = org.source === 'manual' ? org.manual.taxId : settings.basic_info?.vat_number;
      if (tax) lines.push({ text: `VAT: ${tax}`, fontSize: 8, color: mutedColor, alignment: align, margin: [0, 1, 0, 0] });
    }
    return lines;
  };

  const primaryName = org?.source === 'manual' ? org.manual.legalName ?? legalName : legalName;
  const out: Content[] = [buildLetterhead(header, brandLogo, identityLines, primaryName, nameColor)];
  if (header.divider !== 'none') out.push(buildDivider(header, header.dividerColor ?? colors.accent));
  out.push(titleBlock);
  return out;
};

type BrandLogo = import('../../brandingImage').BrandingImage | null;

/** A vertically-stacked logo (top) + identity block, used by the centered layouts. */
function stackedLetterhead(logoNode: Content | null, lines: Content[]): Content[] {
  const items: Content[] = [];
  if (logoNode) items.push(logoNode);
  items.push(...lines);
  return items;
}

/** Arrange the letterhead (logo + identity) for the chosen header layout. */
function buildLetterhead(
  header: ResolvedHeader,
  logo: BrandLogo,
  identityLines: (align: Align) => Content[],
  primaryName: string,
  nameColor: string,
): Content {
  const margin: [number, number, number, number] = [0, 0, 0, 12];
  const h = header.logoHeight ?? undefined;

  switch (header.layout) {
    case 'modern':
      return {
        stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, alignment: 'center', margin: [0, 0, 0, header.logoMarginBottom] }), identityLines('center')),
        alignment: 'center',
        margin,
      };

    case 'minimal':
      return {
        columns: [
          buildLogoNode(logo, { width: Math.min(header.logoWidth, 90), height: h, maxHeight: header.logoMaxHeight, margin: [0, 0, 10, 0] }) ?? { text: '', width: 'auto' },
          { text: primaryName, fontSize: 13, bold: true, color: nameColor, alignment: 'left', margin: [0, 6, 0, 0], width: '*' },
        ],
        columnGap: 8,
        margin,
      };

    case 'boxed':
      return {
        table: {
          widths: ['*'],
          body: [[{ stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, alignment: 'center', margin: [0, 0, 0, header.logoMarginBottom] }), identityLines('center')), alignment: 'center', margin: [8, 8, 8, 8] }]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => PDF_COLORS.border,
          vLineColor: () => PDF_COLORS.border,
        },
        margin,
      };

    case 'split': {
      const logoLeft = header.logoPlacement !== 'right';
      const logoCol = buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, alignment: (logoLeft ? 'left' : 'right') }) ?? { text: '', width: 'auto' as const };
      const idCol = { stack: identityLines(logoLeft ? 'right' : 'left'), width: '*' as const };
      return { columns: logoLeft ? [logoCol, idCol] : [idCol, logoCol], columnGap: 12, margin };
    }

    case 'spreadsheet':
      return {
        columns: [
          buildLogoNode(logo, { width: Math.min(header.logoWidth, 80), height: h, maxHeight: header.logoMaxHeight }) ?? { text: '', width: 'auto' },
          { stack: identityLines('right'), width: '*' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6],
      };

    case 'classic':
    default: {
      if (!logo || logo.kind === 'none') {
        return { stack: identityLines('center'), margin };
      }
      if (header.logoPlacement === 'center') {
        return { stack: stackedLetterhead(buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, alignment: 'center', margin: [0, 0, 0, 4] }), identityLines('center')), alignment: 'center', margin };
      }
      const logoLeft = header.logoPlacement !== 'right';
      const logoCol = buildLogoNode(logo, { width: header.logoWidth, height: h, maxHeight: header.logoMaxHeight, margin: [0, 0, 0, header.logoMarginBottom], alignment: (logoLeft ? 'left' : 'right') })!;
      const idCol = { stack: identityLines(logoLeft ? 'right' : 'left'), width: '*' as const };
      return { columns: logoLeft ? [logoCol, idCol] : [idCol, logoCol], margin };
    }
  }
}

/** Build the divider rule honoring style (thin/thick) + endpoint/baseline nudge. */
function buildDivider(header: ResolvedHeader, color: string): Content {
  const lineWidth = header.divider === 'thick' ? 2 : 0.5;
  const x1 = header.dividerNudge.start;
  // Guard against an inverted rule if insets ever exceed the content width.
  const x2 = Math.max(x1 + 1, 525 - header.dividerNudge.end);
  const y = header.dividerNudge.vertical;
  // Draw the rule at the baseline and compensate the bottom margin so the TOTAL
  // gap stays constant as the nudge shifts the rule down (+) / up (−) — the same
  // constant-gap model the Typst renderer uses. At y=0 this is the prior [0,0,0,12].
  return {
    canvas: [{ type: 'line', x1, y1: y, x2, y2: y, lineWidth, lineColor: color }],
    margin: [0, 0, 0, 12 - y],
  };
}
