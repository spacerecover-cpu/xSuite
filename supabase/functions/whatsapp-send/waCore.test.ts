import { describe, expect, it } from 'vitest';
import {
  classifySendError, computeBackoff, normalizeToE164, resolveTemplateLanguage,
  buildTemplateParams, renderBodyPreview,
} from './waCore';

describe('classifySendError', () => {
  it.each([
    [130429, 'retry'], [131056, 'retry'], [80007, 'retry'], [4, 'retry'],
    [131000, 'retry'], [131016, 'retry'], [131057, 'retry'],
    [131049, 'suppress_marketing'], [131026, 'mark_unreachable'],
    [132001, 'template_broken'], [132000, 'template_broken'], [132015, 'template_broken'],
    [131048, 'integration_quality_pause'], [190, 'integration_token_dead'], [0, 'integration_token_dead'],
    [131031, 'integration_locked'], [131042, 'integration_locked'], [368, 'integration_locked'],
    [100, 'hard_fail'], [131047, 'hard_fail'], [131008, 'hard_fail'],
  ])('code %i → %s', (code, expected) => {
    expect(classifySendError(code).kind).toBe(expected);
  });
  it('unknown codes default to hard_fail with the code preserved', () => {
    const r = classifySendError(999999);
    expect(r.kind).toBe('hard_fail');
  });
});

describe('computeBackoff', () => {
  it('doubles per attempt (1m, 2m, 4m, …), capped at 12h', () => {
    expect(computeBackoff(1)).toBe(60);
    expect(computeBackoff(2)).toBe(120);
    expect(computeBackoff(3)).toBe(240);
    expect(computeBackoff(10)).toBe(30720);      // 60 * 2^9, still under the cap
    expect(computeBackoff(11)).toBe(12 * 3600);  // cap engages
    expect(computeBackoff(20)).toBe(12 * 3600);
  });
});

describe('normalizeToE164', () => {
  it.each([
    ['+971 501234567', '+971501234567'],
    ['00971-50-123-4567', '+971501234567'],
    ['971501234567', null],   // bare digits, no dial code → ambiguous, never guess
    ['(501) 234-567', null],  // 9 digits, no country prefix → ambiguous → null
    ['0501234567', null],     // leading 0 = local format, country unknown → null
  ])('%s → %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });

  it('qualifies bare local numbers with the tenant dial code', () => {
    expect(normalizeToE164('0501234567', '+971')).toBe('+971501234567');
    expect(normalizeToE164('50 123 4567', '971')).toBe('+971501234567');
    expect(normalizeToE164('971501234567', '+971')).toBe('+971501234567'); // already qualified
  });

  it('does not invent a country code for a complete national number', () => {
    // The bug this guards: '+' + '2125551234' parses as +212 (Morocco) 5551234,
    // a real number belonging to someone else entirely.
    expect(normalizeToE164('212-555-1234')).toBeNull();
    expect(normalizeToE164('212-555-1234', '+1')).toBe('+12125551234');
  });

  it('keeps an explicit + prefix authoritative over the dial code', () => {
    expect(normalizeToE164('+12125551234', '+971')).toBe('+12125551234');
    expect(normalizeToE164('0044 20 7946 0000', '+971')).toBe('+442079460000');
  });

  it('rejects garbage', () => {
    expect(normalizeToE164('abc')).toBeNull();
    expect(normalizeToE164('abc', '+971')).toBeNull();
    expect(normalizeToE164('+12')).toBeNull();     // too short
    expect(normalizeToE164('+0501234567')).toBeNull(); // E.164 never starts with 0
  });
});

describe('resolveTemplateLanguage', () => {
  const rows = [
    { language: 'en', status: 'APPROVED' },
    { language: 'ar', status: 'APPROVED' },
    { language: 'de', status: 'PENDING' },
  ];
  it('prefers customer language when approved', () => {
    expect(resolveTemplateLanguage(rows, 'ar', 'en')).toBe('ar');
  });
  it('skips non-approved translations', () => {
    expect(resolveTemplateLanguage(rows, 'de', 'en')).toBe('en');
  });
  it('falls back tenant default → en → any approved', () => {
    expect(resolveTemplateLanguage(rows, 'fr', 'de')).toBe('en');
    expect(resolveTemplateLanguage([{ language: 'ar', status: 'APPROVED' }], 'fr', 'de')).toBe('ar');
  });
  it('returns null when nothing is approved', () => {
    expect(resolveTemplateLanguage([{ language: 'en', status: 'PENDING' }], 'en', 'en')).toBeNull();
  });
});

describe('buildTemplateParams', () => {
  const components = [
    { type: 'BODY', text: 'Hi {{customer_name}}, case {{case_number}} is {{status}}.' },
  ];
  const variableMap = { customer_name: 'customer.name', case_number: 'case.number', status: 'case.status' };
  const context = { 'customer.name': 'Ali', 'case.number': 'CASE-0042', 'case.status': 'Ready for Delivery' };
  it('builds named body parameters in template order', () => {
    const p = buildTemplateParams(components, variableMap, context, 'named');
    expect(p).toEqual([{
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: 'Ali' },
        { type: 'text', parameter_name: 'case_number', text: 'CASE-0042' },
        { type: 'text', parameter_name: 'status', text: 'Ready for Delivery' },
      ],
    }]);
  });
  it('missing context values become em-dash (never leak template syntax)', () => {
    const p = buildTemplateParams(components, variableMap, {}, 'named');
    expect(p[0].parameters.every((x) => (x as { text?: string }).text === '—')).toBe(true);
  });

  it('emits an image header parameter from the media link', () => {
    const withHeader = [
      { type: 'HEADER', format: 'IMAGE' },
      ...components,
    ];
    const p = buildTemplateParams(withHeader, variableMap, context, 'named',
      { headerImageLink: 'https://cdn.example/logo.png' });
    expect(p[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.example/logo.png' } }],
    });
  });

  it('throws for an image header with no media link (worker converts to a loud skip)', () => {
    expect(() => buildTemplateParams(
      [{ type: 'HEADER', format: 'IMAGE' }, ...components], variableMap, context, 'named',
    )).toThrow(/header media/i);
  });

  it('emits button parameters: dynamic URL suffix from the variable map, quick-reply payloads', () => {
    const withButtons = [
      ...components,
      { type: 'BUTTONS', buttons: [
        { type: 'URL', text: 'Track case', url: 'https://portal.example/t/{{1}}' },
        { type: 'QUICK_REPLY', text: 'Unsubscribe' },
      ] },
    ];
    const p = buildTemplateParams(withButtons, { ...variableMap, 'button_url_0': 'case.tracking_ref' },
      { ...context, 'case.tracking_ref': 'CASE-0042' }, 'named');
    expect(p).toContainEqual({
      type: 'button', sub_type: 'url', index: 0,
      parameters: [{ type: 'text', text: 'CASE-0042' }],
    });
    expect(p).toContainEqual({
      type: 'button', sub_type: 'quick_reply', index: 1,
      parameters: [{ type: 'payload', payload: 'UNSUBSCRIBE' }],
    });
  });
});

describe('renderBodyPreview', () => {
  it('substitutes params into the body text', () => {
    expect(renderBodyPreview(
      'Hi {{customer_name}}, case {{case_number}}.',
      { customer_name: 'Ali', case_number: 'CASE-0042' },
    )).toBe('Hi Ali, case CASE-0042.');
  });
});
