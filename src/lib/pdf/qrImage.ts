/**
 * QR image generation. pdfmake's native `qr` content type does not paint in the
 * browser build this app ships (it renders in node but produces nothing in the
 * browser), so a scannable QR must be a raster IMAGE. This module turns a
 * verification payload into a PNG data URL that pdfmake renders reliably via the
 * `{ image }` node (the same path tenant-uploaded QR images already use).
 *
 * Generation is async (and DOM-free), so callers resolve the image BEFORE the
 * synchronous engine renders, passing it in as the engine's `qrCodeBase64`.
 */

import QRCode from 'qrcode';

/** A PNG data URL for the payload, or null when the payload is empty or encoding
 *  fails. Sized generously (crisp when scaled down to ~60–70pt in the document). */
export async function generateQrPngDataUrl(payload: string | null | undefined): Promise<string | null> {
  if (!payload) return null;
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
    });
  } catch {
    return null;
  }
}

/**
 * The QR image to render for a document: the tenant's uploaded QR image takes
 * precedence; otherwise a QR is auto-generated from the verification payload.
 * Returns null when there is neither — so the QR surfaces render nothing.
 */
export async function resolveQrImage(
  tenantImage: string | null | undefined,
  payload: string | null | undefined,
): Promise<string | null> {
  if (tenantImage) return tenantImage;
  return generateQrPngDataUrl(payload);
}
