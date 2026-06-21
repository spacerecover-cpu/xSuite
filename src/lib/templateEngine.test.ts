import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  extractVariables,
  validateTemplate,
  SAMPLE_CONTEXT,
  type TemplateContext,
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
    });
  });

  it('passes a fully-known template', () => {
    expect(validateTemplate('{{customer.name}}', ['customer.name'])).toEqual({
      unknown: [],
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
