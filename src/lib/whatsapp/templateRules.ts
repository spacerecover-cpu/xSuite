/**
 * Meta's per-component parameter limits for message templates.
 *
 * A FOOTER may contain NO parameters at all — Graph rejects a submission with
 * "The Footer field can only have up to 0 variable(s)." A TEXT HEADER may
 * contain exactly one. BODY is effectively unbounded (the 1,024-character cap
 * binds first), so it is deliberately absent here.
 *
 * These are fixed Meta platform rules, not xSuite policy: validate against them
 * before submitting, or the admin only discovers the problem as a 422 from the
 * submit_template round-trip — after naming, drafting and previewing the whole
 * template.
 */
export const TEMPLATE_VAR_LIMITS = { header: 1, footer: 0 } as const;

export type LimitedField = keyof typeof TEMPLATE_VAR_LIMITS;

const FIELD_LABEL: Record<LimitedField, string> = { header: 'Header', footer: 'Footer' };

/** Matches the same named-placeholder syntax the Studio inserts and the send
 *  worker resolves: {{name}}, tolerating inner whitespace. */
const VAR_RE = /\{\{\s*\w+\s*\}\}/g;

export function countTemplateVars(text: string): number {
  return text ? [...text.matchAll(VAR_RE)].length : 0;
}

export function templateVarLimitError(field: LimitedField, text: string): string | null {
  const limit = TEMPLATE_VAR_LIMITS[field];
  const found = countTemplateVars(text);
  if (found <= limit) return null;
  const label = FIELD_LABEL[field];
  return limit === 0
    ? `Meta does not allow variables in the ${label.toLowerCase()} — it cannot contain variables, so write it as fixed text (found ${found}).`
    : `The ${label.toLowerCase()} may contain at most ${limit} variable, but has ${found}.`;
}
