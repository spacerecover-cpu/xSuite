// Rule 55 (CGST Rules, 2017) delivery challan — pure domain helpers.
//
// The challan documents the MOVEMENT of customer-owned goods (patient/donor
// devices returned after data recovery) — transportation for reasons other
// than supply, Rule 55(1)(c). Lab-supplied media carrying recovered data IS a
// supply of goods and must go on a separate goods tax invoice, never on this
// challan (misdeclaration otherwise — verify-labfit finding 6).
//
// Everything here is pure and data-driven; the feature is selected by the
// tenant's `regime.documents` key, never by a country literal
// (eslint no-country-branching-outside-regimes).

/** number_sequences / master_numbering_policies scope of the S1b-seeded FY
 *  series (template DC/{FY}/{SEQ:4}, short-form FY per design §3, ≤16 chars).
 *  L6 adds no numbering rows — it only consumes this scope. */
export const DELIVERY_CHALLAN_SCOPE = 'delivery_challan';

const CHALLAN_DOCUMENT_PROFILES: ReadonlySet<string> = new Set(['in_gst_invoice']);

/** True when the tenant's documents regime requires Rule 55 challans at device
 *  checkout. Selected BY DATA (regime.documents), extendable per regime. */
export function deliveryChallanEnabled(documentsRegimeKey: string | null | undefined): boolean {
  return documentsRegimeKey != null && CHALLAN_DOCUMENT_PROFILES.has(documentsRegimeKey);
}

// catalog_device_roles names normalize into these families (mirrors
// getSimpleRoleLabel in src/lib/pdf/styles.ts). Lab-supplied = media the lab
// provides (backup/clone/spare/target). Everything else — patient/source,
// donor, and a NULL role (the default intake device) — is customer-owned.
// Unknown role names default to customer-owned: over-listing a device on a
// non-supply challan is harmless; silently dropping a customer device is not.
const LAB_SUPPLIED_ROLE_TOKENS = ['backup', 'clone', 'spare', 'target'] as const;

export function isCustomerOwnedRole(roleName: string | null | undefined): boolean {
  if (!roleName) return true;
  const normalized = roleName.toLowerCase();
  return !LAB_SUPPLIED_ROLE_TOKENS.some((token) => normalized.includes(token));
}

/** Rule 138 CGST — e-way bill threshold. Generation stays MANUAL (design §4-L6). */
export const EWAY_BILL_THRESHOLD_INR = 50_000;

export function ewayBillGuidance(totalDeclaredValueInr: number): string | null {
  if (totalDeclaredValueInr < EWAY_BILL_THRESHOLD_INR) return null;
  return (
    'Consignment value is ₹50,000 or more — an e-way bill may be required for this movement. ' +
    'Generate it manually on the e-way bill portal before dispatch; xSuite does not automate e-way bills.'
  );
}

export const CHALLAN_NOTATION =
  'Goods dispatched for reasons other than supply: customer-owned device(s) returned after data ' +
  'recovery service (Rule 55(1), CGST Rules, 2017). This is not a tax invoice — no GST is charged ' +
  'on this movement.';

export const LAB_SUPPLIED_GOODS_GUIDANCE =
  'Lab-supplied delivery media handed over with recovered data is a supply of goods. Issue a ' +
  'separate goods tax invoice for it — it must not be listed on this delivery challan.';

/** Rule 55(2): the challan is prepared in triplicate, copies marked exactly so. */
export const CHALLAN_COPY_LABELS = [
  'ORIGINAL FOR CONSIGNEE',
  'DUPLICATE FOR TRANSPORTER',
  'TRIPLICATE FOR CONSIGNER',
] as const;

/** Default HSN printed for storage devices moved under this challan
 *  (8471 70 — storage units of automatic data-processing machines).
 *  Submitted for ratification in the S7 CA package alongside the challan PDF. */
export const CHALLAN_DEFAULT_HSN = '847170';
