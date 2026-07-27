// The single substitution engine for every template surface.
//
// Two placeholder vocabularies coexist in xSuite:
//  * document_templates content uses dotted keys from the
//    master_template_variables catalog ({{case.number}}, {{company.name}});
//  * notification_templates bodies use flat event-payload keys
//    ({{case_number}}) rendered by the notification-dispatch-email edge
//    function with /\{\{(\w+)\}\}/ and missing-key -> ''.
// A flat key is a dotted path of length 1, so this renderer is a strict
// superset of the edge-function renderer: templates valid there render
// identically here. Keep the missing-key -> '' behavior in sync with
// supabase/functions/notification-dispatch-email/index.ts.
//
// ⚠️ TWO DELIBERATE DIVERGENCES from that edge function — see the parity block
// in templateEngine.test.ts, which pins both:
//
//  1. FILTERS (BIND-03) are additive NEW syntax: {{invoice.total | currency}}.
//     The edge regex is /\{\{(\w+)\}\}/ — it cannot match a pipe or a dot, so a
//     filtered placeholder would be left LITERAL in a dispatched email.
//     Filtered placeholders in notification_templates are now BLOCKED, not just
//     discouraged: validateTemplate reports them as `filtered` and the
//     notification editor refuses the save (FUP-03). Relying on a comment was
//     not enough — extractVariables reports the bare key, so a filtered
//     placeholder validated as a perfectly known variable and shipped literally.
//     Document templates (document_templates / invoice_terms), which only ever
//     render through this module, are free to use them.
//     Unfiltered {{key}} is untouched by this feature: same regex capture, same
//     resolution, same output, byte for byte.
//
//  2. BOOLEANS (BIND-02) render as Yes/No here, where the edge function's
//     String(value) would emit `true`/`false`. The notification editor previews
//     with EDGE_FUNCTION_BOOLEANS so its preview shows the dispatcher's output
//     rather than a friendlier string the customer never receives.
//     Justification: `true`/`false` are
//     untranslated developer tokens in a customer-facing document, and coercing
//     them to '' would put a blank where "No" belongs — indistinguishable from a
//     missing field, which is exactly the failure mode BIND-01 was about. On a
//     lab authorization / NDA / destructive-consent form that distinction is
//     legally material, so `false` must stay VISIBLE. The label pair is
//     injectable (opts.booleans) so the caller supplies the tenant's localized
//     strings; this module deliberately imports nothing, which is what keeps it
//     portable to the Deno edge runtime.

export type TemplateContextValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TemplateContext;

export interface TemplateContext {
  [key: string]: TemplateContextValue;
}

/** A resolved primitive, handed to a formatter exactly as it sat in the context. */
export type TemplatePrimitive = string | number | boolean;

/** Formats one resolved value. `key` is the dotted path it came from. */
export type TemplateFormatter = (value: TemplatePrimitive, key: string) => string;

export interface RenderTemplateOptions {
  /** Leave unresolved placeholders as literal {{key}} (editor previews). */
  keepUnknown?: boolean;
  /**
   * Labels for boolean values. Supply the tenant's localized pair; the engine
   * holds no i18n of its own. Defaults to DEFAULT_BOOLEAN_LABELS.
   */
  booleans?: { true: string; false: string };
  /**
   * Filter name -> formatter, for `{{key | filter}}` placeholders. The caller
   * owns locale: pass tenant-config-bound wrappers, e.g.
   *   { currency: (v) => formatCurrencyWithConfig(Number(v), currencyConfig),
   *     date:     (v) => formatDate(String(v)) }
   * so this module never hardcodes a currency symbol or date format
   * (CLAUDE.md → Country-Based Tenant Configuration).
   *
   * An unrecognised filter name, or a formatter that throws, degrades to the
   * UNFILTERED rendering of the same value — never to a blank. A typo'd filter
   * therefore prints an unformatted value, which is visible, rather than
   * silently dropping a financial figure (BIND-01).
   */
  formatters?: Record<string, TemplateFormatter>;
}

export const DEFAULT_BOOLEAN_LABELS: { true: string; false: string } = {
  true: 'Yes',
  false: 'No',
};

// Group 1 (the key) is unchanged from the pre-filter regex, so extractVariables
// and every keepUnknown/missing-key path behave identically. Group 2 is the
// optional filter. Degenerate (`{{a | }}`) and chained (`{{a | b | c}}`) forms
// intentionally match NOTHING and stay literal, so unsupported syntax is
// visible to the template author instead of silently half-working.
// NOT SAFE ON THE NOTIFICATION PATH: the edge function substitutes with
// /\{\{(\w+)\}\}/g, which cannot match a pipe, so a filtered placeholder is
// mailed to the customer VERBATIM. That is enforced, not merely documented —
// `validateTemplate` reports `filtered`, and NotificationTemplatesTab blocks
// the save on it (FUP-03). Teach the edge function the same regex, boolean
// labels and formatter contract before relaxing that.
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g;

function resolvePath(ctx: TemplateContext, path: string): TemplateContextValue {
  let current: TemplateContextValue = ctx;
  for (const segment of path.split('.')) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as TemplateContext)[segment];
  }
  return current;
}

export function renderTemplate(
  template: string,
  ctx: TemplateContext,
  opts: RenderTemplateOptions = {}
): string {
  if (!template) return '';
  return template.replace(
    PLACEHOLDER_RE,
    (match, key: string, filter: string | undefined) => {
      const value = resolvePath(ctx, key);
      if (value === null || value === undefined || typeof value === 'object') {
        // Missing-key -> '' (or the literal, under keepUnknown). A filter is
        // never invoked here, so this contract is identical with and without
        // filters, and stays in sync with the edge function.
        return opts.keepUnknown ? match : '';
      }

      if (filter !== undefined) {
        const formatter = opts.formatters?.[filter];
        if (formatter) {
          try {
            const formatted = formatter(value, key);
            if (typeof formatted === 'string') return formatted;
          } catch {
            // Fall through to the unfiltered rendering below: a bad formatter
            // must not blank out a value or break document generation.
          }
        }
      }

      if (typeof value === 'boolean') {
        const labels = opts.booleans ?? DEFAULT_BOOLEAN_LABELS;
        return value ? labels.true : labels.false;
      }

      return String(value);
    }
  );
}

export function extractVariables(template: string): string[] {
  if (!template) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Boolean labels matching what the notification edge function actually emits.
 *
 * `supabase/functions/notification-dispatch-email/index.ts` substitutes with a
 * plain `String(value)`, so a boolean arrives in the customer's inbox as
 * `true`/`false` — not the friendly {@link DEFAULT_BOOLEAN_LABELS} the document
 * surfaces use. Pass this when PREVIEWING a notification template so the preview
 * shows what will be sent rather than a nicer string the dispatcher never
 * produces.
 */
export const EDGE_FUNCTION_BOOLEANS = { true: 'true', false: 'false' } as const;

/**
 * The keys of any placeholders that carry a FILTER, e.g. `{{total | currency}}`
 * → `['total']`. Deduped, in first-appearance order.
 *
 * Needed because {@link extractVariables} deliberately reports group 1 (the
 * key) only, so a filtered placeholder is indistinguishable from a plain one to
 * every existing caller. That is correct for document surfaces — which DO
 * understand filters — but dangerous for the notification path, whose dispatcher
 * cannot (see {@link EDGE_FUNCTION_BOOLEANS} and the note on `PLACEHOLDER_RE`):
 * a filtered placeholder there is mailed to the customer verbatim.
 */
export function extractFilteredPlaceholders(template: string): string[] {
  if (!template) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    if (match[2] === undefined) continue; // no filter on this placeholder
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Validate a template against the variables its surface publishes.
 *
 * `unknown` — keys that will render EMPTY (the missing-key contract).
 * `filtered` — keys using filter syntax. Harmless on document surfaces; on the
 * notification path it means the placeholder ships LITERALLY, so that surface
 * must treat a non-empty `filtered` as an error rather than a warning.
 * The field is additive — existing callers reading only `unknown` are unaffected.
 */
export function validateTemplate(
  template: string,
  knownKeys: string[]
): { unknown: string[]; filtered: string[] } {
  const known = new Set(knownKeys);
  return {
    unknown: extractVariables(template).filter((key) => !known.has(key)),
    filtered: extractFilteredPlaceholders(template),
  };
}

// Sample values mirroring the master_template_variables catalog descriptions —
// used for editor previews before a real case/quote context exists.
export const SAMPLE_CONTEXT: TemplateContext = {
  company: {
    name: 'Future Space LLC',
    email: 'info@futurespace.om',
    phone: '+968 1234 5678',
    address: 'Muscat, Oman',
    website: 'www.futurespace.om',
    currency: 'USD',
  },
  customer: {
    name: 'Ahmed Al-Balushi',
    email: 'ahmed@example.com',
    phone: '+968 9876 5432',
    company: 'ABC Trading LLC',
  },
  case: {
    number: 'C-2025-000001',
    status: 'In Progress',
    priority: 'High',
    problem: 'Hard drive not detected',
    received_date: '15/11/2025',
  },
  device: {
    type: '2.5" HDD',
    brand: 'Seagate',
    model: 'ST1000LM035',
    serial: 'ABC123456',
    capacity: '1TB',
    condition: 'Good - No Visible Damage',
  },
  quote: {
    number: 'QT-2025-00001',
    total: '250.000',
    validity_days: '30',
    expiry_date: '15/12/2025',
  },
  invoice: {
    number: 'INV-2025-00001',
    total: '250.000',
    due_date: '30/11/2025',
    due_days: '15',
  },
  service: {
    type: 'Data Recovery',
    estimated_days: '5',
    location: 'In-Lab - Clean Room',
  },
  technician: {
    name: 'Mohammed Al-Hinai',
    email: 'tech@futurespace.om',
  },
};

// A deliberately hostile second fixture with the SAME key shape as
// SAMPLE_CONTEXT, so it drops straight into any preview surface without a
// template going blank. SAMPLE_CONTEXT stays the short-Latin "happy path";
// this one exists to let an editor SEE the failure modes that actually break
// layouts before a customer does (BIND-04):
//   * long text            — wraps headers, overflows narrow columns
//   * Arabic / RTL         — bidi ordering, font fallback, mirrored blocks
//   * empty optionals      — collapsed rows, dangling labels/separators
//   * special characters   — &, <, >, quotes through the sanitize-after-
//                            substitute path (invoiceTermsService)
//   * long unbroken tokens — pdfmake wraps on whitespace only, so a 60-char
//                            serial overruns its column (audit TBL-09)
// Every value is a string, matching SAMPLE_CONTEXT's primitive shape.
export const STRESS_CONTEXT: TemplateContext = {
  company: {
    name: 'Future Space Advanced Data Recovery & Digital Forensics Laboratory LLC (Muscat Head Office, Sultanate of Oman)',
    email: 'operations.department.data-recovery@future-space-laboratories.example.om',
    phone: '+968 1234 5678 / +968 2345 6789 (24h)',
    address:
      'مبنى ٤٢، الطابق الثالث، شارع السلطان قابوس، الخوير ٣٣، ص.ب ١٢٣٤، الرمز البريدي ١١٢، مسقط، سلطنة عُمان',
    website: '',
    currency: 'OMR',
  },
  customer: {
    name: 'عبد الرحمن بن سعيد بن محمد الحارثي',
    email: 'a.alharthi+data-recovery-case-escalation@example-corporate-domain.com',
    phone: '',
    company: 'Al-Rashid & Sons <Holdings> "Group" — Trading L.L.C.',
  },
  case: {
    number: 'C-2025-000001-RE-RECOVERY-002',
    status: 'No Solution — Future Follow-up',
    priority: 'Critical',
    problem:
      'RAID-5 array (12 × 4TB SAS) from a virtualised host: two members dropped out ~40 hours apart, the controller rebuilt onto a stale member and the guest volumes will not mount. Member 7 has seized spindle bearings and audible head contact; member 3 reports SMART reallocated-sector saturation. Customer reports a failed third-party rebuild attempt before intake — parity may be inconsistent across stripes.',
    received_date: '',
  },
  device: {
    type: '3.5" Enterprise SAS HDD (helium-filled, SED/TCG-Opal)',
    brand: 'Western Digital / HGST Ultrastar',
    model: 'WUH721414AL5204-0F31052-VeryLongPartNumberWithNoSpacesAtAll',
    serial: 'WD-WMC4N0D9KMTZ0000000000000000000000000QGHX1234567890ABCDEF',
    capacity: '14TB (14,000,519,643,136 bytes)',
    condition: 'Severe — Physical Damage; Cleanroom Required; Prior Attempt Evident',
  },
  quote: {
    number: 'QT-2025-00001-REV-C',
    total: '12,345,678.900',
    validity_days: '0',
    expiry_date: '',
  },
  invoice: {
    number: 'INV-2025-00001/CN-2025-00007',
    total: '0.000',
    due_date: '٣٠/١١/٢٠٢٥',
    due_days: '-45',
  },
  service: {
    type: 'Cleanroom Recovery & Forensic Imaging <ISO 14644-1 Class 5>',
    estimated_days: '',
    location: 'In-Lab — Clean Room 2 / Donor Harvesting Bench',
  },
  technician: {
    name: 'م. محمد بن خميس الهنائي',
    email: '',
  },
};
