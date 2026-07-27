import { describe, expect, it } from 'vitest';
import { countTemplateVars, templateVarLimitError, TEMPLATE_VAR_LIMITS } from './templateRules';

describe('countTemplateVars', () => {
  it('counts named placeholders, tolerating inner whitespace', () => {
    expect(countTemplateVars('Hello {{customer_name}}, case {{ case_number }}')).toBe(2);
  });

  it('counts repeats separately — Meta bills per parameter, not per distinct name', () => {
    expect(countTemplateVars('{{a}} and {{a}}')).toBe(2);
  });

  it('is 0 for plain text and for malformed braces', () => {
    expect(countTemplateVars('Space Data Recovery')).toBe(0);
    expect(countTemplateVars('')).toBe(0);
    expect(countTemplateVars('{{ }} {not_a_var} {{1nvalid-name}}')).toBe(0);
  });
});

describe('templateVarLimitError', () => {
  // Meta rejects a FOOTER containing any parameter outright:
  // "The Footer field can only have up to 0 variable(s)." Caught client-side
  // now — it used to reach Graph and come back as a 422 on submit.
  it('rejects any variable in a footer', () => {
    expect(TEMPLATE_VAR_LIMITS.footer).toBe(0);
    const err = templateVarLimitError('footer', '{{company_name}} — Data Recovery');
    expect(err).toMatch(/footer/i);
    expect(err).toMatch(/cannot contain variables|no variables/i);
  });

  it('accepts a static footer', () => {
    expect(templateVarLimitError('footer', 'Space Data Recovery')).toBeNull();
    expect(templateVarLimitError('footer', '')).toBeNull();
  });

  it('allows exactly one variable in a text header, never two', () => {
    expect(TEMPLATE_VAR_LIMITS.header).toBe(1);
    expect(templateVarLimitError('header', 'Case {{case_number}}')).toBeNull();
    expect(templateVarLimitError('header', 'Update')).toBeNull();
    expect(templateVarLimitError('header', '{{a}} {{b}}')).toMatch(/header/i);
  });

  it('names the limit and the count so the fix is obvious', () => {
    expect(templateVarLimitError('header', '{{a}} {{b}} {{c}}')).toMatch(/3/);
  });
});
