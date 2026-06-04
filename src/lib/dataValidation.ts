const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sanitizeUuidFields = (data: Record<string, unknown>, uuidFields: string[]): Record<string, unknown> => {
  const sanitized = { ...data };

  uuidFields.forEach(field => {
    // Only act on fields actually PRESENT in the payload. A field that is absent
    // (or `undefined`) means "leave unchanged" — injecting it as null here is what
    // wiped case_id/customer_id/company_id on every invoice/quote UPDATE, because
    // pick*PersistFields omits unchanged fields. Empty string (a cleared select) and
    // malformed non-uuid strings are still normalized to null so an INSERT/UPDATE
    // doesn't fail the uuid cast (22P02).
    if (!(field in sanitized)) return;
    const value = sanitized[field];
    if (value === undefined) return;
    if (value === '') {
      sanitized[field] = null;
    } else if (typeof value === 'string' && value !== null && !UUID_REGEX.test(value)) {
      sanitized[field] = null;
    }
  });

  return sanitized;
};

/**
 * Remove keys whose value is null / undefined / '' from a payload, so an UPDATE
 * never overwrites those columns. Defense-in-depth for ownership/relational keys
 * that an edit must never clear (e.g. case_id, customer_id, company_id).
 */
export const dropEmptyKeys = (
  data: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> => {
  const out = { ...data };
  for (const key of keys) {
    const v = out[key];
    if (v === null || v === undefined || v === '') {
      delete out[key];
    }
  }
  return out;
};
