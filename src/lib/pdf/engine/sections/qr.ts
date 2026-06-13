/**
 * QR section — the QR code image plus its caption. Rendered inline in the body
 * (the footer-anchored QR used by some financial builders is handled in
 * `footer.ts`). Returns null when no QR image was pre-loaded.
 */

import type { Content } from 'pdfmake/interfaces';
import { PDF_COLORS } from '../../styles';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderQr: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const qr = engine.qrCodeBase64;
  if (!qr) return null;

  const caption = data.qrCaption ?? null;
  const stack: Content[] = [
    { image: qr, width: 70, height: 70, alignment: 'left', margin: [0, 0, 0, 2] },
  ];
  if (caption) {
    stack.push({ text: caption, fontSize: 8, color: PDF_COLORS.text, alignment: 'left' });
  }

  return { stack, margin: [0, 8, 0, 8] };
};
