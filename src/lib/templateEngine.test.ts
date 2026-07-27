import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  extractVariables,
  validateTemplate,
  SAMPLE_CONTEXT,
  STRESS_CONTEXT,
  type TemplateContext,
  extractFilteredPlaceholders,
  EDGE_FUNCTION_BOOLEANS,
} from './templateEngine';

// The one substitution engine for every template surface:
//  * document_templates use dotted keys ({{case.number}}, {{company.name}})
//    from the master_template_variables catalog;
//  * notification_templates payloads use flat keys ({{case_number}}) — the
//    notification-dispatch-email edge function renders those with
//    /\{\{(\w+)\}\}/ and missing keys -> '' . A flat key is just a dotted
//    path of length 1, so this engine must be a strict superset of that
//    behavior (same templates render identically in both runtimes).

const ctx: TemplateContext = {
  company: { name: 'Future Space LLC', email: 'info@futurespace.om' },
  customer: { name: 'Ahmed Al-Balushi' },
  case: { number: 'C-2025-000001', priority: 'High' },
  quote: { total: '250.000', validity_days: 30 },
  case_number: 'C-2025-000001',
  new_status: 'In Progress',
  empty: null,
};

describe('renderTemplate', () => {
  it('substitutes dotted-path keys from a nested context', () => {
    expect(
      renderTemplate('Dear {{customer.name}}, case {{case.number}} update.', ctx)
    ).toBe('Dear Ahmed Al-Balushi, case C-2025-000001 update.');
  });

  it('substitutes flat keys (notification payload vocabulary)', () => {
    expect(renderTemplate('Case {{case_number}} is now {{new_status}}', ctx)).toBe(
      'Case C-2025-000001 is now In Progress'
    );
  });

  it('renders numbers via String()', () => {
    expect(renderTemplate('Valid for {{quote.validity_days}} days', ctx)).toBe(
      'Valid for 30 days'
    );
  });

  it('renders missing keys as empty string (matches the edge-function renderer)', () => {
    expect(renderTemplate('Hello {{nope}} and {{also.missing}}!', ctx)).toBe(
      'Hello  and !'
    );
  });

  it('renders null/undefined values as empty string', () => {
    expect(renderTemplate('[{{empty}}]', ctx)).toBe('[]');
  });

  it('keeps unknown placeholders literal when keepUnknown is set (editor preview)', () => {
    expect(renderTemplate('Hi {{nope}}', ctx, { keepUnknown: true })).toBe('Hi {{nope}}');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('{{ case.number }}', ctx)).toBe('C-2025-000001');
  });

  it('replaces every occurrence of a repeated key', () => {
    expect(renderTemplate('{{case.number}}/{{case.number}}', ctx)).toBe(
      'C-2025-000001/C-2025-000001'
    );
  });

  it('returns strings without placeholders untouched', () => {
    expect(renderTemplate('No placeholders here.', ctx)).toBe('No placeholders here.');
  });

  it('returns empty string for empty/null template input', () => {
    expect(renderTemplate('', ctx)).toBe('');
    expect(renderTemplate(null as unknown as string, ctx)).toBe('');
  });

  it('does not crash when a dotted path traverses a non-object', () => {
    // ctx.customer.name.first — 'name' is a string, so the walk dead-ends.
    expect(renderTemplate('{{customer.name.first}}', ctx)).toBe('');
  });

  it('only resolves own properties (no prototype escape)', () => {
    expect(renderTemplate('{{constructor}}{{__proto__}}{{toString}}', ctx)).toBe('');
    expect(renderTemplate('{{company.constructor}}', ctx)).toBe('');
  });

  it('never renders objects — unresolved interior nodes become empty', () => {
    expect(renderTemplate('{{company}}', ctx)).toBe('');
  });
});

describe('extractVariables', () => {
  it('returns unique keys in first-appearance order', () => {
    expect(
      extractVariables('{{customer.name}} {{case.number}} {{customer.name}}')
    ).toEqual(['customer.name', 'case.number']);
  });

  it('returns an empty array when there are no placeholders', () => {
    expect(extractVariables('plain text')).toEqual([]);
  });
});

describe('validateTemplate', () => {
  it('reports keys not present in the known-variable registry', () => {
    const known = ['customer.name', 'case.number'];
    expect(validateTemplate('{{customer.name}} {{case.numbr}}', known)).toEqual({
      unknown: ['case.numbr'],
      filtered: [],
    });
  });

  it('passes a fully-known template', () => {
    expect(validateTemplate('{{customer.name}}', ['customer.name'])).toEqual({
      unknown: [],
      filtered: [],
    });
  });
});

describe('SAMPLE_CONTEXT', () => {
  it('provides sample values for the catalog keys used in editor previews', () => {
    expect(renderTemplate('{{company.name}}', SAMPLE_CONTEXT)).not.toBe('');
    expect(renderTemplate('{{case.number}}', SAMPLE_CONTEXT)).not.toBe('');
    expect(renderTemplate('{{quote.total}}', SAMPLE_CONTEXT)).not.toBe('');
    expect(renderTemplate('{{technician.email}}', SAMPLE_CONTEXT)).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// BIND-02 — booleans must not print the developer tokens `true` / `false`.
// ---------------------------------------------------------------------------

describe('renderTemplate — boolean values (BIND-02)', () => {
  const boolCtx: TemplateContext = {
    nda: { signed: true, waived: false },
    destructive_authorized: false,
    literal: 'true',
  };

  it('renders booleans as Yes/No, not as the literal true/false', () => {
    expect(renderTemplate('NDA signed: {{nda.signed}}', boolCtx)).toBe('NDA signed: Yes');
    expect(renderTemplate('Waived: {{nda.waived}}', boolCtx)).toBe('Waived: No');
  });

  it('never leaks the strings "true"/"false" into a rendered document', () => {
    const out = renderTemplate(
      '{{nda.signed}}|{{nda.waived}}|{{destructive_authorized}}',
      boolCtx
    );
    expect(out).toBe('Yes|No|No');
    expect(out).not.toMatch(/\b(true|false)\b/);
  });

  it('renders false as a visible "No" — a blank is indistinguishable from a missing field', () => {
    // The whole point of BIND-01 was silent blanks in customer-facing documents;
    // coercing `false` to '' would re-introduce that class of defect by design.
    expect(renderTemplate('[{{nda.waived}}]', boolCtx)).toBe('[No]');
    expect(renderTemplate('[{{nda.not_a_key}}]', boolCtx)).toBe('[]');
  });

  it('accepts caller-supplied localized labels', () => {
    expect(
      renderTemplate('{{nda.signed}} / {{nda.waived}}', boolCtx, {
        booleans: { true: 'نعم', false: 'لا' },
      })
    ).toBe('نعم / لا');
  });

  it('only maps real booleans — a string that reads "true" is untouched', () => {
    expect(renderTemplate('{{literal}}', boolCtx)).toBe('true');
  });

  it('still honours keepUnknown for a missing key alongside booleans', () => {
    expect(renderTemplate('{{nda.signed}}{{gone}}', boolCtx, { keepUnknown: true })).toBe(
      'Yes{{gone}}'
    );
  });
});

// ---------------------------------------------------------------------------
// BIND-03 — opt-in filtered placeholders, resolved through a caller-supplied map.
// ---------------------------------------------------------------------------

describe('renderTemplate — filtered placeholders (BIND-03)', () => {
  const calls: Array<[unknown, string]> = [];
  const formatters = {
    currency: (value: string | number | boolean, key: string) => {
      calls.push([value, key]);
      return `OMR ${Number(value).toFixed(3)}`;
    },
    date: (value: string | number | boolean) =>
      String(value).split('-').reverse().join('/'),
    boom: () => {
      throw new Error('formatter exploded');
    },
  };

  const fctx: TemplateContext = {
    invoice: { total: 250.5, due_date: '2025-11-30', paid: true },
    plain: 'untouched',
  };

  it('applies a supplied formatter to a filtered placeholder', () => {
    expect(renderTemplate('Total: {{invoice.total | currency}}', fctx, { formatters })).toBe(
      'Total: OMR 250.500'
    );
  });

  it('supports the tolerant whitespace forms around the pipe', () => {
    for (const t of ['{{invoice.total|currency}}', '{{ invoice.total | currency }}']) {
      expect(renderTemplate(t, fctx, { formatters })).toBe('OMR 250.500');
    }
  });

  it('passes the raw value and the resolved key to the formatter', () => {
    calls.length = 0;
    renderTemplate('{{invoice.total | currency}}', fctx, { formatters });
    expect(calls).toEqual([[250.5, 'invoice.total']]);
  });

  it('formats dates through the caller map instead of leaking the raw ISO string', () => {
    expect(renderTemplate('{{invoice.due_date | date}}', fctx, { formatters })).toBe(
      '30/11/2025'
    );
    expect(renderTemplate('{{invoice.due_date}}', fctx)).toBe('2025-11-30');
  });

  it('lets a formatter win over the default boolean mapping', () => {
    expect(
      renderTemplate('{{invoice.paid | yesno}}', fctx, {
        formatters: { yesno: (v) => (v ? 'PAID' : 'DUE') },
      })
    ).toBe('PAID');
  });

  it('degrades an unknown filter to the unfiltered value — never to a blank', () => {
    expect(renderTemplate('{{invoice.total | nosuch}}', fctx, { formatters })).toBe('250.5');
    expect(renderTemplate('{{invoice.total | currency}}', fctx)).toBe('250.5');
  });

  it('degrades to the unfiltered value when a formatter throws', () => {
    expect(renderTemplate('{{invoice.total | boom}}', fctx, { formatters })).toBe('250.5');
  });

  it('does not invoke a filter for a missing key — missing-key => "" is preserved', () => {
    let invoked = false;
    expect(
      renderTemplate('[{{invoice.absent | currency}}]', fctx, {
        formatters: {
          currency: () => {
            invoked = true;
            return 'SHOULD NOT APPEAR';
          },
        },
      })
    ).toBe('[]');
    expect(invoked).toBe(false);
  });

  it('keeps the whole filtered placeholder literal under keepUnknown', () => {
    expect(
      renderTemplate('{{invoice.absent | currency}}', fctx, { formatters, keepUnknown: true })
    ).toBe('{{invoice.absent | currency}}');
  });

  it('leaves malformed / unsupported filter syntax literal', () => {
    // Degenerate and chained forms are deliberately NOT placeholders, so a
    // template author sees the raw text rather than a silent surprise.
    expect(renderTemplate('{{invoice.total | }}', fctx, { formatters })).toBe(
      '{{invoice.total | }}'
    );
    expect(renderTemplate('{{invoice.total | currency | date}}', fctx, { formatters })).toBe(
      '{{invoice.total | currency | date}}'
    );
    expect(renderTemplate('a | b', fctx, { formatters })).toBe('a | b');
  });

  it('extractVariables reports the bare key, and validateTemplate ALSO flags the filter', () => {
    expect(extractVariables('{{invoice.total | currency}} {{invoice.total}}')).toEqual([
      'invoice.total',
    ]);
    // The key resolves fine — which is precisely why `unknown` alone was not a
    // sufficient signal (FUP-03): the notification dispatcher cannot render the
    // filter, so `filtered` has to carry that separately.
    expect(validateTemplate('{{invoice.total | currency}}', ['invoice.total'])).toEqual({
      unknown: [],
      filtered: ['invoice.total'],
    });
    expect(validateTemplate('{{invoice.totl | currency}}', ['invoice.total'])).toEqual({
      unknown: ['invoice.totl'],
      filtered: ['invoice.totl'],
    });
  });
});

// ---------------------------------------------------------------------------
// PARITY — the default (unfiltered) path must be byte-identical after BIND-03.
// ---------------------------------------------------------------------------

describe('parity — unfiltered rendering is unchanged (BIND-03)', () => {
  // Every string here was rendered by the pre-change engine; the expected values
  // are pinned literals, not recomputed, so a regression in the default path fails.
  const GOLDEN: Array<[string, string]> = [
    ['Dear {{customer.name}}, case {{case.number}} update.', 'Dear Ahmed Al-Balushi, case C-2025-000001 update.'],
    ['Case {{case_number}} is now {{new_status}}', 'Case C-2025-000001 is now In Progress'],
    ['Valid for {{quote.validity_days}} days', 'Valid for 30 days'],
    ['Hello {{nope}} and {{also.missing}}!', 'Hello  and !'],
    ['[{{empty}}]', '[]'],
    ['{{ case.number }}', 'C-2025-000001'],
    ['{{case.number}}/{{case.number}}', 'C-2025-000001/C-2025-000001'],
    ['No placeholders here.', 'No placeholders here.'],
    ['{{customer.name.first}}', ''],
    ['{{constructor}}{{__proto__}}{{toString}}', ''],
    ['{{company}}', ''],
    ['Total {{quote.total}} for {{company.name}} <{{company.email}}>', 'Total 250.000 for Future Space LLC <info@futurespace.om>'],
    ['{{case.priority}} | {{case.number}}', 'High | C-2025-000001'],
  ];

  it('renders the pinned corpus exactly as before', () => {
    for (const [template, expected] of GOLDEN) {
      expect(renderTemplate(template, ctx)).toBe(expected);
    }
  });

  it('is unaffected by supplying a formatters map to a filter-free template', () => {
    const formatters = {
      currency: () => 'SHOULD NOT APPEAR',
      date: () => 'SHOULD NOT APPEAR',
    };
    for (const [template, expected] of GOLDEN) {
      expect(renderTemplate(template, ctx, { formatters })).toBe(expected);
    }
  });

  it('is unaffected by supplying boolean labels to a boolean-free template', () => {
    for (const [template, expected] of GOLDEN) {
      expect(renderTemplate(template, ctx, { booleans: { true: 'X', false: 'Y' } })).toBe(
        expected
      );
    }
  });

  it('stays a strict superset of the notification-dispatch-email renderer', () => {
    // Verbatim copy of the edge function's renderer
    // (supabase/functions/notification-dispatch-email/index.ts).
    const edgeRender = (template: string, payload: Record<string, unknown>): string =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = payload[key];
        if (value === null || value === undefined) return '';
        return String(value);
      });

    const payload: Record<string, unknown> = {
      case_no: 'C-2025-000001',
      to_status_name: 'In Progress',
      hours_in_phase: 42,
      reason: null,
      notes: 'a | b',
    };
    const corpus = [
      'Case {{case_no}} moved to {{to_status_name}}.',
      'In phase {{hours_in_phase}}h. Reason: {{reason}}',
      'Unknown {{not_in_payload}} renders blank.',
      'Notes: {{notes}}',
      'No placeholders.',
    ];
    for (const t of corpus) {
      expect(renderTemplate(t, payload as TemplateContext)).toBe(edgeRender(t, payload));
    }
  });

  it('documents the one deliberate divergence from the edge renderer: booleans', () => {
    // Pinned so the divergence is visible rather than discovered in production.
    // Filters diverge too, by design — the edge regex /\{\{(\w+)\}\}/ cannot
    // match a filtered placeholder, so it would leave it literal in an email.
    expect(renderTemplate('{{flag}}', { flag: false })).toBe('No');
    expect(String(false)).toBe('false');
    expect(renderTemplate('{{a | currency}}', { a: 1 })).not.toBe('{{a | currency}}');
  });
});

// ---------------------------------------------------------------------------
// BIND-04 — a stress fixture beside (never replacing) SAMPLE_CONTEXT.
// ---------------------------------------------------------------------------

const shapeOf = (c: TemplateContext): string[] =>
  Object.entries(c)
    .flatMap(([key, value]) =>
      value && typeof value === 'object'
        ? Object.keys(value).map((sub) => `${key}.${sub}`)
        : [key]
    )
    .sort();

describe('STRESS_CONTEXT (BIND-04)', () => {
  it('leaves SAMPLE_CONTEXT byte-identical — other surfaces depend on its exact values', () => {
    expect(SAMPLE_CONTEXT).toEqual({
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
    });
  });

  it('is a drop-in for SAMPLE_CONTEXT — identical key shape, so no template goes blank', () => {
    expect(shapeOf(STRESS_CONTEXT)).toEqual(shapeOf(SAMPLE_CONTEXT));
  });

  it('every value is a string (same primitive shape as SAMPLE_CONTEXT)', () => {
    for (const group of Object.values(STRESS_CONTEXT)) {
      expect(typeof group).toBe('object');
      for (const value of Object.values(group as TemplateContext)) {
        expect(typeof value).toBe('string');
      }
    }
  });

  const flatValues = (c: TemplateContext): string[] =>
    Object.values(c).flatMap((group) =>
      Object.values(group as TemplateContext).map((v) => String(v))
    );

  it('carries a long-text case that can overflow a column or wrap a header', () => {
    expect(flatValues(STRESS_CONTEXT).some((v) => v.length > 120)).toBe(true);
  });

  it('carries Arabic/RTL text', () => {
    expect(flatValues(STRESS_CONTEXT).some((v) => /[؀-ۿ]/.test(v))).toBe(true);
  });

  it('carries empty optionals', () => {
    expect(flatValues(STRESS_CONTEXT).some((v) => v === '')).toBe(true);
  });

  it('carries HTML/quote special characters (the sanitize-after-substitute path)', () => {
    expect(flatValues(STRESS_CONTEXT).some((v) => /[<>&"']/.test(v))).toBe(true);
  });

  it('carries a long unbroken token (the TBL-09 column-overflow case)', () => {
    expect(
      flatValues(STRESS_CONTEXT).some((v) => /\S{40,}/.test(v))
    ).toBe(true);
  });

  it('renders through the engine without throwing, and empties stay empty', () => {
    expect(renderTemplate('{{company.name}}', STRESS_CONTEXT)).not.toBe('');
    expect(renderTemplate('[{{customer.phone}}]', STRESS_CONTEXT)).toBe('[]');
    expect(renderTemplate('{{case.problem}}', STRESS_CONTEXT).length).toBeGreaterThan(120);
  });
});

// ---------------------------------------------------------------------------
// FUP-03 — filter syntax must not reach the notification delivery path.
//
// The filter regex keeps the KEY as group 1, so `{{total | currency}}` used to
// report as the perfectly-known variable `total`: validateTemplate returned no
// unknowns, the BIND-01 confirm gate stayed silent, and the template saved
// clean. But supabase/functions/notification-dispatch-email/index.ts substitutes
// with /\{\{(\w+)\}\}/g, which cannot match a pipe — so the customer's email
// contained the literal text "{{total | currency}}" where an amount belonged,
// and the in-app preview (which DOES understand filters) showed the value, so
// the author had no way to notice.
// ---------------------------------------------------------------------------

describe('extractFilteredPlaceholders (FUP-03)', () => {
  it('reports placeholders that carry a filter', () => {
    expect(extractFilteredPlaceholders('Total: {{total | currency}}')).toEqual(['total']);
  });

  it('is empty for plain placeholders — the edge-function-safe subset', () => {
    expect(extractFilteredPlaceholders('Hi {{customer_name}}, case {{case_number}}')).toEqual([]);
    expect(extractFilteredPlaceholders('')).toEqual([]);
  });

  it('dedupes and preserves order', () => {
    expect(
      extractFilteredPlaceholders('{{a | currency}} {{b | date}} {{a | currency}}'),
    ).toEqual(['a', 'b']);
  });

  it('ignores degenerate/chained forms, which stay literal anyway', () => {
    // These do not match PLACEHOLDER_RE at all, so they are neither rendered
    // nor reportable as filtered — they are visible literals by design.
    expect(extractFilteredPlaceholders('{{a | }}')).toEqual([]);
    expect(extractFilteredPlaceholders('{{a | b | c}}')).toEqual([]);
  });
});

describe('validateTemplate reports filters alongside unknowns (FUP-03)', () => {
  const known = ['total', 'case_number'];

  it('flags a filtered placeholder even though its key is known', () => {
    const result = validateTemplate('{{total | currency}}', known);
    // The key IS known — this is exactly why the old signature said "all clear".
    expect(result.unknown).toEqual([]);
    expect(result.filtered).toEqual(['total']);
  });

  it('still reports unknown keys, and the two lists are independent', () => {
    const result = validateTemplate('{{nope}} {{total | currency}}', known);
    expect(result.unknown).toEqual(['nope']);
    expect(result.filtered).toEqual(['total']);
  });

  it('is empty on both counts for a clean edge-function-safe template', () => {
    const result = validateTemplate('Case {{case_number}} total {{total}}', known);
    expect(result.unknown).toEqual([]);
    expect(result.filtered).toEqual([]);
  });
});

describe('EDGE_FUNCTION_BOOLEANS keeps the notification preview honest (FUP-03)', () => {
  it('renders booleans the way the edge function will, not the way documents do', () => {
    const ctx = { is_paid: true, is_overdue: false };
    // Document surfaces get the friendly labels…
    expect(renderTemplate('{{is_paid}}', ctx)).toBe('Yes');
    // …but the dispatcher does String(value), so the notification PREVIEW must
    // show what will actually be sent.
    expect(renderTemplate('{{is_paid}}', ctx, { booleans: EDGE_FUNCTION_BOOLEANS })).toBe('true');
    expect(renderTemplate('{{is_overdue}}', ctx, { booleans: EDGE_FUNCTION_BOOLEANS })).toBe('false');
  });
});
