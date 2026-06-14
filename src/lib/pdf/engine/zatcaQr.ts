/**
 * zatcaQr — build the ZATCA (KSA) / GCC e-invoice QR payload.
 *
 * ZATCA Phase 1 encodes five fields as a TLV (Tag-Length-Value) byte sequence,
 * base64-encoded, then rendered as a QR code:
 *   1. Seller name              4. Invoice total (incl. VAT)
 *   2. VAT registration number  5. VAT total
 *   3. Timestamp (ISO 8601)
 *
 * This module produces only the base64 STRING — pdfmake renders it natively via
 * its `{ qr }` content type, so no QR/encoding dependency is needed. Pure, no I/O.
 */

export interface ZatcaInvoiceFields {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 timestamp, e.g. "2026-06-14T13:45:00Z". */
  timestamp: string;
  /** Invoice total INCLUDING VAT, as a plain decimal string (e.g. "105.00"). */
  total: string;
  /** VAT total, as a plain decimal string (e.g. "5.00"). */
  vatAmount: string;
}

/** One TLV field: [tag, length, ...utf8 value bytes]. Phase-1 values are short (<256B). */
function tlvField(tag: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  // Phase-1 fields are short; clamp defensively so a length byte never overflows.
  const safe = bytes.slice(0, 255);
  return [tag, safe.length, ...safe];
}

/** Build the base64-encoded ZATCA Phase-1 TLV payload for an invoice QR. */
export function buildZatcaTlvBase64(fields: ZatcaInvoiceFields): string {
  const bytes = [
    ...tlvField(1, fields.sellerName),
    ...tlvField(2, fields.vatNumber),
    ...tlvField(3, fields.timestamp),
    ...tlvField(4, fields.total),
    ...tlvField(5, fields.vatAmount),
  ];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
