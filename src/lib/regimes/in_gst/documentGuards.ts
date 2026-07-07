// India issue-time guards that are NOT tax math:
//  - Rule 49: a WHOLLY exempt supply legally requires a Bill of Supply, not a tax
//    invoice. xSuite does not ship Bill of Supply this phase (spec §3, §7 ⊕) — so a
//    100%-exempt tax-invoice issue is BLOCKED with a consult-CA message.
//  - Two-document goods flow (spec §4-S4): mixed goods+services jobs are directed to
//    a SEPARATE goods tax invoice via an in-product guidance banner. The automated
//    linked two-document flow is DEFERRED — this is guidance copy only, never a block.
import type { RequirementFailure } from '../../taxDocumentService';
import type { DocumentTaxLine } from '../../pdf/types';

export function whollyExemptGuard(rollups: DocumentTaxLine[]): RequirementFailure | null {
  if (rollups.length === 0) return null;
  // ONLY a wholly-EXEMPT supply needs a Bill of Supply (Rule 49). zero_rated
  // (export/SEZ under LUT) is a TAXABLE-at-0% supply that MUST be issued on a tax
  // invoice (Rule 46, with ITC) — never conflate it with exempt.
  const allExempt = rollups.every((l) => l.tax_treatment === 'exempt');
  if (!allExempt) return null;
  return {
    field_key: 'wholly_exempt_bill_of_supply',
    level: 'block',
    message: 'A wholly exempt/nil-rated supply requires a Bill of Supply (Rule 49), which is not supported in this release. Consult your CA before issuing.',
  };
}

export function goodsInHandoverGuidance(
  lineKinds: Array<'service' | 'goods'>,
): { show: boolean; message: string } | null {
  if (!lineKinds.includes('goods')) return null;
  return {
    show: true,
    message: 'This job includes lab-supplied goods (e.g. replacement media). Goods and services must be billed on a separate goods tax invoice — this tax invoice should carry the recovery service (SAC) only.',
  };
}
