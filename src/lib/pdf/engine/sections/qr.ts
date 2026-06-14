/**
 * QR section — the QR code plus its caption. Rendered inline in the body (the
 * footer-anchored QR used by some financial builders is handled in `footer.ts`,
 * which reuses {@link qrContentNode}). Returns null when there is no QR to show.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

/**
 * The QR content node: a native ZATCA e-invoice QR (rendered from the payload
 * string via pdfmake's `qr` content type — no encoding dependency) when a
 * `zatcaPayload` is present, otherwise the pre-loaded image QR, otherwise null.
 * Centralized so the inline section and the page footer render QR identically.
 */
export function qrContentNode(
  zatcaPayload: string | null | undefined,
  image: string | null | undefined,
  size: number,
  margin: [number, number, number, number] = [0, 0, 0, 0],
): Content | null {
  if (zatcaPayload) {
    return { qr: zatcaPayload, fit: size, foreground: PDF_COLORS.text, alignment: 'left', margin };
  }
  if (image) {
    return { image, width: size, height: size, alignment: 'left', margin };
  }
  return null;
}

export const renderQr: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const node = qrContentNode(data.zatcaPayload, engine.qrCodeBase64, 70, [0, 0, 0, 2]);
  if (!node) return null;

  const caption = data.qrCaption ?? null;
  const stack: Content[] = [node];
  if (caption) {
    stack.push({ text: caption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' });
  }

  return { stack, margin: [0, 8, 0, 8] };
};
