//
// Client-side mirror of the DB get_next_number v2 template rendering
// ({FY} + {SEQ:n}). {FY} renders the SHORT fiscal-year form ('26-27') per the
// India Pack spec §3 — matching the S1b DB renderer. SEQ grows beyond its pad
// width (same rule as format_sequence_number); enforcement of the 16-char cap
// is DB-side (get_next_number RAISEs) — validateNumberingTemplate is the
// design-time guard. Rule 46(b) charset [A-Za-z0-9/-] is enforced here as
// TEMPLATE validation: master_numbering_policies has no charset column by design.

export const TEMPLATE_LITERAL_CHARSET = /^[A-Za-z0-9/-]*$/;
const SEQ_TOKEN = /\{SEQ:(\d+)\}/;
const FY_SHORT_LENGTH = 5; // 'YY-YY'

export function fiscalYearLabel(anchor: string, today: Date): string {
  const mmdd =
    `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startYear = mmdd >= anchor ? today.getFullYear() : today.getFullYear() - 1;
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

export function renderNumberTemplate(
  template: string,
  value: number,
  fiscalYearAnchor: string | null,
  today: Date = new Date(),
): string {
  const m = template.match(SEQ_TOKEN);
  if (!m) throw new Error(`format_template must contain {SEQ:n}: "${template}"`);
  const pad = parseInt(m[1], 10);
  const digits = value.toString();
  const seq = digits.length < pad ? digits.padStart(pad, '0') : digits;
  return template
    .replace('{FY}', fiscalYearLabel(fiscalYearAnchor ?? '01-01', today))
    .replace(m[0], seq);
}

export function validateNumberingTemplate(template: string, maxLength: number | null): string[] {
  const errors: string[] = [];
  const seqMatches = template.match(/\{SEQ:\d+\}/g) ?? [];
  if (seqMatches.length !== 1) errors.push('template must contain exactly one {SEQ:n} token');
  const fyMatches = template.match(/\{FY\}/g) ?? [];
  if (fyMatches.length > 1) errors.push('template may contain at most one {FY} token');
  const literals = template.replace(/\{SEQ:\d+\}/g, '').replace(/\{FY\}/g, '');
  if (!TEMPLATE_LITERAL_CHARSET.test(literals)) {
    errors.push('literal characters must be within [A-Za-z0-9/-] (rule 46(b) charset)');
  }
  if (maxLength !== null && seqMatches.length === 1) {
    const pad = parseInt(seqMatches[0].slice(5, -1), 10);
    const minRendered = literals.length + fyMatches.length * FY_SHORT_LENGTH + pad;
    if (minRendered > maxLength) {
      errors.push(`minimum rendered length ${minRendered} exceeds max_length ${maxLength}`);
    }
  }
  return errors;
}
