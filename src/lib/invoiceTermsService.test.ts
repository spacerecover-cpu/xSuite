// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./documentTemplatesService', () => ({
  getDefaultTemplate: vi.fn(),
}));
vi.mock('./templateContextService', () => ({
  buildTemplateContext: vi.fn(),
}));

import { getDefaultTemplate } from './documentTemplatesService';
import { buildTemplateContext } from './templateContextService';
import { resolveInvoiceTermsHtml, resolveTermsHtmlFromContent } from './invoiceTermsService';

const mockedGetDefault = vi.mocked(getDefaultTemplate);
const mockedBuildCtx = vi.mocked(buildTemplateContext);

const tmpl = (content: string) => ({
  id: 't1', name: 'Std', description: null, content,
  subjectLine: null, documentType: null, isDefault: true, isActive: true, usageCount: 0, lastUsedAt: null,
});

describe('resolveInvoiceTermsHtml', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty string (and skips context build) when there is no default template', async () => {
    mockedGetDefault.mockResolvedValue(null);
    mockedBuildCtx.mockResolvedValue({});
    expect(await resolveInvoiceTermsHtml({ refs: {} })).toBe('');
    expect(mockedBuildCtx).not.toHaveBeenCalled();
  });

  it('substitutes variables and sanitizes the result', async () => {
    mockedGetDefault.mockResolvedValue(tmpl('<p>Due in {{invoice.due_days}} days <strong>{{company.name}}</strong></p><script>x()</script>'));
    mockedBuildCtx.mockResolvedValue({ company: { name: 'Future Space' } });
    const out = await resolveInvoiceTermsHtml({ refs: { caseId: 'c1' }, overlay: { invoice: { due_days: '15' } } });
    expect(out).toContain('Due in 15 days');
    expect(out).toContain('<strong>Future Space</strong>');
    expect(out).not.toContain('<script');
  });

  it('keeps angle brackets coming from context values instead of sanitizing them away', async () => {
    mockedGetDefault.mockResolvedValue(tmpl('<p>This agreement is between {{company.name}} and {{customer.company}}.</p>'));
    mockedBuildCtx.mockResolvedValue({
      company: { name: 'Future Space' },
      customer: { company: 'Al-Rashid & Sons <Holdings> Trading L.L.C.' },
    });
    const out = await resolveInvoiceTermsHtml({ refs: {} });
    // The customer name must survive verbatim as TEXT; template markup still renders.
    expect(out).toContain('Al-Rashid &amp; Sons &lt;Holdings&gt; Trading L.L.C.');
    expect(out).toContain('<p>');
  });

  it('does not let a context value inject markup into the stored terms', async () => {
    mockedGetDefault.mockResolvedValue(tmpl('<p>{{customer.company}}</p>'));
    mockedBuildCtx.mockResolvedValue({ customer: { company: '<strong>Injected</strong>' } });
    const out = await resolveInvoiceTermsHtml({ refs: {} });
    expect(out).toContain('&lt;strong&gt;Injected&lt;/strong&gt;');
  });

  it('overlay invoice.* wins over fetched context', async () => {
    mockedGetDefault.mockResolvedValue(tmpl('<p>{{invoice.due_date}}</p>'));
    mockedBuildCtx.mockResolvedValue({ invoice: { due_date: 'OLD' } });
    const out = await resolveInvoiceTermsHtml({ refs: {}, overlay: { invoice: { due_date: '30/11/2026' } } });
    expect(out).toContain('30/11/2026');
    expect(out).not.toContain('OLD');
  });

  it('nested merge preserves sibling base keys while overlay wins on conflicts', async () => {
    mockedGetDefault.mockResolvedValue(tmpl('<p>{{invoice.number}} due {{invoice.due_date}}</p>'));
    mockedBuildCtx.mockResolvedValue({ invoice: { number: 'INV-1', due_date: 'OLD' } });
    const out = await resolveInvoiceTermsHtml({ refs: {}, overlay: { invoice: { due_date: '30/11/2026' } } });
    expect(out).toContain('INV-1');
    expect(out).toContain('30/11/2026');
    expect(out).not.toContain('OLD');
  });
});

describe('resolveTermsHtmlFromContent', () => {
  beforeEach(() => vi.clearAllMocks());
  it('renders + sanitizes provided content with merged context', async () => {
    mockedBuildCtx.mockResolvedValue({ company: { name: 'ACME' } });
    const out = await resolveTermsHtmlFromContent('<p>{{company.name}}</p><img src="javascript:x">', { refs: {} });
    expect(out).toContain('ACME');
    expect(out).not.toContain('javascript:');
  });
  it('returns empty for empty content without calling context', async () => {
    expect(await resolveTermsHtmlFromContent('', { refs: {} })).toBe('');
  });
});
