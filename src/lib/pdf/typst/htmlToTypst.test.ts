import { describe, it, expect } from 'vitest';
import { htmlToTypst } from './htmlToTypst';

describe('htmlToTypst', () => {
  it('returns escaped plain text unchanged when there is no markup', () => {
    expect(htmlToTypst('Net 14 days.')).toBe('Net 14 days.');
    expect(htmlToTypst('')).toBe('');
    expect(htmlToTypst(null)).toBe('');
  });

  it('converts a bullet list with bold spans (the Payment Terms shape)', () => {
    const html =
      '<ul><li style="color: rgb(102, 102, 102)"><span style="font-weight: 600">Payment Method:</span> We accept Cash &amp; Card</li>' +
      '<li>Please make payable to: Future Space LLC</li></ul>';
    const out = htmlToTypst(html);
    expect(out).toContain('#list(');
    expect(out).toContain('#strong[Payment Method:]');
    expect(out).toContain('We accept Cash & Card'); // entity decoded, no raw <li>/<span>
    expect(out).toContain('Please make payable to: Future Space LLC');
    expect(out).not.toContain('<li>');
    expect(out).not.toContain('font-weight');
  });

  it('converts paragraphs + <br> and emphasis', () => {
    const out = htmlToTypst('<p>First line</p><p>Second <em>emph</em> line</p>');
    expect(out).toContain('First line');
    expect(out).toContain('#emph[emph]');
    expect(out).toContain('#parbreak()');
  });

  it('escapes Typst metacharacters inside the prose', () => {
    expect(htmlToTypst('<p>Ref #5 [x]</p>')).toContain('Ref \\#5 \\[x\\]');
  });
});
