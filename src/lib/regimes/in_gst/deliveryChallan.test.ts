import { describe, it, expect } from 'vitest';
import {
  deliveryChallanEnabled,
  isCustomerOwnedRole,
  ewayBillGuidance,
  DELIVERY_CHALLAN_SCOPE,
  EWAY_BILL_THRESHOLD_INR,
  CHALLAN_NOTATION,
  LAB_SUPPLIED_GOODS_GUIDANCE,
  CHALLAN_COPY_LABELS,
  CHALLAN_DEFAULT_HSN,
} from './deliveryChallan';

describe('deliveryChallanEnabled', () => {
  it('is data-selected by the documents regime key, never a country literal', () => {
    expect(deliveryChallanEnabled('in_gst_invoice')).toBe(true);
    expect(deliveryChallanEnabled('generic_invoice')).toBe(false);
    expect(deliveryChallanEnabled('gcc_tax_invoice')).toBe(false);
    expect(deliveryChallanEnabled(null)).toBe(false);
    expect(deliveryChallanEnabled(undefined)).toBe(false);
  });
});

describe('isCustomerOwnedRole — customer-owned devices only (verify-labfit finding 6)', () => {
  it('patient/source/donor and the NULL default intake role are customer-owned', () => {
    expect(isCustomerOwnedRole('Patient')).toBe(true);
    expect(isCustomerOwnedRole('source')).toBe(true);
    expect(isCustomerOwnedRole('Donor Drive')).toBe(true);
    expect(isCustomerOwnedRole(null)).toBe(true);
    expect(isCustomerOwnedRole(undefined)).toBe(true);
  });
  it('lab-supplied media roles are excluded: backup/clone/spare/target', () => {
    expect(isCustomerOwnedRole('Backup')).toBe(false);
    expect(isCustomerOwnedRole('clone')).toBe(false);
    expect(isCustomerOwnedRole('Spare Drive')).toBe(false);
    expect(isCustomerOwnedRole('Target')).toBe(false);
  });
});

describe('ewayBillGuidance — manual e-way with ₹50k threshold', () => {
  it('is silent under the threshold and speaks at/above it', () => {
    expect(ewayBillGuidance(49_999.99)).toBeNull();
    expect(ewayBillGuidance(EWAY_BILL_THRESHOLD_INR)).toMatch(/e-way bill/i);
    expect(ewayBillGuidance(120_000)).toMatch(/manually/i);
  });
});

describe('statutory constants', () => {
  it('numbering scope matches the S1b-seeded series', () => {
    expect(DELIVERY_CHALLAN_SCOPE).toBe('delivery_challan');
  });
  it('triplicate copy markings per Rule 55(2) (verify-statutory finding 8)', () => {
    expect(CHALLAN_COPY_LABELS).toEqual([
      'ORIGINAL FOR CONSIGNEE',
      'DUPLICATE FOR TRANSPORTER',
      'TRIPLICATE FOR CONSIGNER',
    ]);
  });
  it('notation declares a non-supply movement, never a tax invoice', () => {
    expect(CHALLAN_NOTATION).toMatch(/other than supply/i);
    expect(CHALLAN_NOTATION).toMatch(/Rule 55/);
    expect(CHALLAN_NOTATION).toMatch(/not a tax invoice/i);
  });
  it('lab-supplied guidance points at a goods tax invoice (verify-labfit finding 6)', () => {
    expect(LAB_SUPPLIED_GOODS_GUIDANCE).toMatch(/goods tax invoice/i);
  });
  it('default HSN for storage devices is pinned for the CA memo', () => {
    expect(CHALLAN_DEFAULT_HSN).toBe('847170');
  });
});
