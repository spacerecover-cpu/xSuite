// ZATCA Phase-1 (simplified tax invoice TLV QR) — regime row #1. render_artifact
// class: the artifact is produced at render/issuance from frozen document fields;
// no authority round-trip. Replaces the legacy country-string QR hardcode.
import { buildZatcaTlvBase64 } from '../../pdf/engine/zatcaQr';
import { sha256Hex } from '../../tax/hash';
import type { EInvoicingTransport, IssuedDocumentSnapshot } from '../types';

export const zatcaPh1Transport: EInvoicingTransport = {
  key: 'zatca_ph1',
  version: '1.0.0',
  regimeClass: 'render_artifact',
  buildArtifact(doc: IssuedDocumentSnapshot) {
    if (!doc.sellerTaxNumber) {
      throw new Error('zatca_ph1: seller tax number is required to emit a ZATCA Phase-1 QR');
    }
    const payload = buildZatcaTlvBase64({
      sellerName: doc.sellerName,
      vatNumber: doc.sellerTaxNumber,
      timestamp: doc.issuedAt,
      total: doc.totalAmount.toFixed(2),
      vatAmount: doc.taxAmount.toFixed(2),
    });
    return { artifactType: 'zatca_phase1_tlv_qr', payload, payloadHash: sha256Hex(payload) };
  },
};
