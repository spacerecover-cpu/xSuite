/**
 * Report approval-signature section (Phase 6). Embeds the captured approver
 * signature in a rendered report PDF when one is present in `data.signatureBlocks`.
 *
 * Parity rule: when no approver block is found, returns `null` — unsigned
 * reports are byte-identical to before this section was added.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import { buildLogoNode } from '../../brandingImage';
import { isBilingualMode } from '../labels';
import type { EngineContext, EngineDocData, SignatureBlockData, SectionRenderer } from '../types';

/**
 * Renders one captured approver signature as a pdfmake stack:
 * - drawn/uploaded_image → embedded image via buildLogoNode
 * - typed → italicised typed-name text
 * - click_to_accept → "Accepted" line
 * All variants end with a short rule and the "Approved by <name>" label.
 */
function renderApproverBlock(b: SignatureBlockData, bilingual: boolean): object {
  const parts: object[] = [];

  if ((b.method === 'drawn' || b.method === 'uploaded_image') && b.imageDataUrl) {
    const node = buildLogoNode(b.imageDataUrl, { width: 130, alignment: 'left', margin: [0, 0, 0, 2] });
    if (node) parts.push(node as object);
  } else if (b.method === 'typed' && b.typedValue) {
    parts.push({ text: b.typedValue, italics: true, fontSize: 13, margin: [0, 6, 0, 2] });
  } else if (b.method === 'click_to_accept') {
    parts.push({ text: 'Accepted', fontSize: 9, margin: [0, 10, 0, 2] });
  }

  parts.push({ canvas: [{ type: 'line', x1: 0, y1: 2, x2: 160, y2: 2, lineWidth: 0.5, lineColor: PDF_COLORS.textLight }] });

  const approvedLabel = bilingual ? 'Approved by | اعتمده' : 'Approved by';
  const nameText = b.name ? `${approvedLabel} ${b.name}` : approvedLabel;
  parts.push({ text: nameText, fontSize: 9, color: PDF_COLORS.text, margin: [0, 3, 0, 0] });

  if (b.role) parts.push({ text: b.role, fontSize: 8, color: PDF_COLORS.textLight, margin: [0, 1, 0, 0] });
  if (b.signedAt) parts.push({ text: b.signedAt, fontSize: 7, color: PDF_COLORS.textLight });

  return { stack: parts };
}

export const renderReportApproval: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  if (!data.signatureBlocks || data.signatureBlocks.length === 0) return null;

  const approver = data.signatureBlocks.find((b) => b.slot === 'approver');
  if (!approver) return null;

  const bilingual = isBilingualMode(engine.config.language);
  const block = renderApproverBlock(approver, bilingual);

  return { stack: [block], margin: [0, 16, 0, 8] } as Content;
};
