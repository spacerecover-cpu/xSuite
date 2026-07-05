import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../tax/hash';
import { buildZatcaTlvBase64 } from '../../pdf/engine/zatcaQr';
import { zatcaPh1Transport } from './index';
import type { IssuedDocumentSnapshot } from '../types';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 known answer for "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('zatcaPh1Transport', () => {
  const doc: IssuedDocumentSnapshot = {
    documentType: 'invoice', documentId: 'inv-1', documentNumber: 'INVO-0042',
    sellerName: 'SPACE DATA RECOVERY', sellerTaxNumber: '310123456700003',
    issuedAt: '2026-07-02T09:00:00.000Z', currency: 'SAR',
    totalAmount: 1150, taxAmount: 150, meta: {},
  };
  it('is a render_artifact regime producing the exact Phase-1 TLV payload + sha256', () => {
    const artifact = zatcaPh1Transport.buildArtifact(doc);
    const expectedPayload = buildZatcaTlvBase64({
      sellerName: 'SPACE DATA RECOVERY', vatNumber: '310123456700003',
      timestamp: '2026-07-02T09:00:00.000Z', total: '1150.00', vatAmount: '150.00',
    });
    expect(zatcaPh1Transport.regimeClass).toBe('render_artifact');
    expect(artifact.artifactType).toBe('zatca_phase1_tlv_qr');
    expect(artifact.payload).toBe(expectedPayload);
    expect(artifact.payloadHash).toBe(sha256Hex(expectedPayload));
  });
  it('refuses to build without a seller VAT number (a non-registered seller cannot emit a "compliant" KSA QR)', () => {
    expect(() => zatcaPh1Transport.buildArtifact({ ...doc, sellerTaxNumber: null })).toThrow(/seller tax number/i);
  });
});
