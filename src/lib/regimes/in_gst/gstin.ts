// GSTIN validation (Phase 4 India Pack). WP-S2 is the SOLE author of this module;
// WP-S3 and WP-L2 CONSUME its exports. Pure — no I/O. Format per CGST Rule 10:
// 2-digit state code + 10-char PAN + entity code [1-9A-Z] + 'Z' + mod-36 check
// character (GSTN/CBIC Luhn-mod-36 over the first 14 characters). The GSTIN-issuing
// state-code set is baked in here (the S1b-seeded set MINUS the non-GSTIN
// place-of-supply codes 96/97) — never passed as a param.

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface GstinCheck {
  ok: boolean;
  error: string | null;
  stateCode: string | null;
}

// 36 GSTIN-capable state codes: 01–24 contiguous, 26 (merged DNH+DD; 25 defunct),
// 27, then 29–38 (29 KA … 37 AP with 28 defunct, 38 Ladakh). 96/97 are
// place-of-supply-only (foreign / other territory) and are NOT GSTIN-issuing.
export const GSTIN_STATE_CODES: ReadonlySet<string> = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
  '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
  '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38',
]);

export function gstStateCodeOf(gstin: string): string | null {
  const value = gstin.trim().toUpperCase();
  return /^[0-9]{2}/.test(value) ? value.slice(0, 2) : null;
}

/** GSTN/CBIC check character: factor 2 at the RIGHTMOST char of the 14-char body,
 *  alternating 2/1 leftwards; each product folded as floor(p/36) + p%36. */
export function gstinCheckDigit(base14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = base14.length - 1; i >= 0; i--) {
    const cp = GSTIN_CHARSET.indexOf(base14[i]);
    if (cp < 0) throw new Error(`gstinCheckDigit: invalid character '${base14[i]}'`);
    const product = factor * cp;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

export function validateGSTIN(
  gstin: string,
  subdivision?: { tax_authority_code: string | null } | null,
): GstinCheck {
  const value = gstin.trim().toUpperCase();
  const stateCode = gstStateCodeOf(value);
  if (!GSTIN_PATTERN.test(value)) {
    return {
      ok: false, stateCode,
      error: 'GSTIN must be 15 characters: 2-digit state code, 10-character PAN, entity code, "Z", check character.',
    };
  }
  if (!stateCode || !GSTIN_STATE_CODES.has(stateCode)) {
    return { ok: false, stateCode, error: `GSTIN state code ${stateCode} is not a GSTIN-issuing state code.` };
  }
  if (gstinCheckDigit(value.slice(0, 14)) !== value[14]) {
    return { ok: false, stateCode, error: 'GSTIN check character is invalid — please re-check the number.' };
  }
  if (subdivision?.tax_authority_code && stateCode !== subdivision.tax_authority_code) {
    return {
      ok: false, stateCode,
      error: `GSTIN state code ${stateCode} does not match the selected state (${subdivision.tax_authority_code}).`,
    };
  }
  return { ok: true, error: null, stateCode };
}
