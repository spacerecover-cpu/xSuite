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

export interface RenderTemplateOptions {
  /** Leave unresolved placeholders as literal {{key}} (editor previews). */
  keepUnknown?: boolean;
}

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

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
  return template.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = resolvePath(ctx, key);
    if (value === null || value === undefined || typeof value === 'object') {
      return opts.keepUnknown ? match : '';
    }
    return String(value);
  });
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

export function validateTemplate(
  template: string,
  knownKeys: string[]
): { unknown: string[] } {
  const known = new Set(knownKeys);
  return { unknown: extractVariables(template).filter((key) => !known.has(key)) };
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
