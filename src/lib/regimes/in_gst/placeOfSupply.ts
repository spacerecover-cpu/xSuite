// Place of supply — Section 12(2), IGST Act 2017 (services, default rule):
// supply to a REGISTERED person → the location of that person (their GSTIN
// state); supply to an UNREGISTERED person → the recipient's address on record
// (billing subdivision). Pure and data-driven: for non-IN tenants the authority
// map is empty and tax numbers are not GSTINs, so this degrades to the billing
// subdivision without any country branching.
import { gstStateCodeOf, validateGSTIN } from './gstin';

export interface PlaceOfSupplyInput {
  buyerTaxNumber: string | null;
  buyerSubdivisionId: string | null;
  /** geo_subdivisions.tax_authority_code → geo_subdivisions.id for the seller country. */
  subdivisionIdByAuthorityCode: ReadonlyMap<string, string>;
}

export type PlaceOfSupplyBasis = 'gstin_prefix' | 'billing_subdivision' | 'none';

export interface PlaceOfSupplyResult {
  subdivisionId: string | null;
  basis: PlaceOfSupplyBasis;
}

export function derivePlaceOfSupply(input: PlaceOfSupplyInput): PlaceOfSupplyResult {
  const gstin = input.buyerTaxNumber?.trim() ?? '';
  if (gstin && validateGSTIN(gstin).ok) {
    const code = gstStateCodeOf(gstin);
    const subdivisionId = code ? input.subdivisionIdByAuthorityCode.get(code) ?? null : null;
    if (subdivisionId) return { subdivisionId, basis: 'gstin_prefix' };
  }
  if (input.buyerSubdivisionId) {
    return { subdivisionId: input.buyerSubdivisionId, basis: 'billing_subdivision' };
  }
  return { subdivisionId: null, basis: 'none' };
}
