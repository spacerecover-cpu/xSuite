// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { htmlToPdfmake } from './htmlToPdfmake';

describe('htmlToPdfmake', () => {
  it('returns empty array for empty input', () => {
    expect(htmlToPdfmake('')).toEqual([]);
  });
  it('maps a paragraph to a text block', () => {
    expect(htmlToPdfmake('<p>Hello</p>')).toEqual([{ text: [{ text: 'Hello' }], margin: [0, 0, 0, 4] }]);
  });
  it('maps bold / italic / underline / strike runs', () => {
    const out = htmlToPdfmake('<p><strong>b</strong><em>i</em><u>u</u><s>s</s></p>') as any[];
    expect(out[0].text).toEqual([
      { text: 'b', bold: true },
      { text: 'i', italics: true },
      { text: 'u', decoration: ['underline'] },
      { text: 's', decoration: ['lineThrough'] },
    ]);
  });
  it('maps span color and background', () => {
    const out = htmlToPdfmake('<p><span style="color: #ef4444; background-color: #fef08a">x</span></p>') as any[];
    expect(out[0].text[0]).toEqual({ text: 'x', color: '#ef4444', background: '#fef08a' });
  });
  it('maps links with underline+color and a link prop', () => {
    const out = htmlToPdfmake('<p><a href="https://x.com">go</a></p>') as any[];
    expect(out[0].text[0]).toEqual({ text: 'go', link: 'https://x.com', color: '#2563eb', decoration: ['underline'] });
  });
  it('maps <br> to a newline within the paragraph', () => {
    const out = htmlToPdfmake('<p>a<br>b</p>') as any[];
    expect(out[0].text).toEqual([{ text: 'a' }, { text: '\n' }, { text: 'b' }]);
  });
  it('maps headings to sized bold blocks', () => {
    const out = htmlToPdfmake('<h2>Title</h2>') as any[];
    expect(out[0]).toMatchObject({ text: [{ text: 'Title' }], bold: true, fontSize: 13 });
  });
  it('maps unordered and ordered lists', () => {
    expect(htmlToPdfmake('<ul><li>a</li><li>b</li></ul>')).toEqual([
      { ul: [{ text: [{ text: 'a' }] }, { text: [{ text: 'b' }] }], margin: [0, 0, 0, 4] },
    ]);
    expect(htmlToPdfmake('<ol><li>a</li></ol>')).toEqual([
      { ol: [{ text: [{ text: 'a' }] }], margin: [0, 0, 0, 4] },
    ]);
  });
  it('keeps multi-run list items inline (not stacked)', () => {
    const out = htmlToPdfmake('<ul><li>Pay <strong>50%</strong></li></ul>') as any[];
    expect(out[0].ul[0]).toEqual({ text: [{ text: 'Pay ' }, { text: '50%', bold: true }] });
  });
  it('maps a table to a pdfmake table', () => {
    const out = htmlToPdfmake('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>') as any[];
    expect(out[0]).toMatchObject({ table: { body: [[{ text: [{ text: 'a' }] }, { text: [{ text: 'b' }] }]] } });
  });
  it('omits images (keeps alt as text)', () => {
    expect(htmlToPdfmake('<p><img src="https://x/a.png" alt="pic"></p>') as any[]).toEqual([
      { text: [{ text: 'pic' }], margin: [0, 0, 0, 4] },
    ]);
  });
  it('treats loose top-level text as a paragraph', () => {
    expect(htmlToPdfmake('plain')).toEqual([{ text: [{ text: 'plain' }], margin: [0, 0, 0, 4] }]);
  });
  it('dedupes underline when a link wraps an underline (no double decoration)', () => {
    const out = htmlToPdfmake('<p><a href="https://x.com"><u>go</u></a></p>') as any[];
    expect(out[0].text[0]).toEqual({ text: 'go', link: 'https://x.com', color: '#2563eb', decoration: ['underline'] });
  });
  it('dedupes nested identical decorations', () => {
    const out = htmlToPdfmake('<p><u><u>x</u></u></p>') as any[];
    expect(out[0].text[0]).toEqual({ text: 'x', decoration: ['underline'] });
  });
  it('keeps inter-element whitespace inside inline content', () => {
    const out = htmlToPdfmake('<p><strong>a</strong> <strong>b</strong></p>') as any[];
    expect(out[0].text).toEqual([{ text: 'a', bold: true }, { text: ' ' }, { text: 'b', bold: true }]);
  });
  it('handles a table with a header row (thead/th)', () => {
    const out = htmlToPdfmake('<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>') as any[];
    expect(out[0].table.body).toEqual([[{ text: [{ text: 'H' }] }], [{ text: [{ text: 'D' }] }]]);
  });
  it('flattens a wrapping <div> and renders its block children (real invoice terms shape)', () => {
    const html =
      '<div><h3>Payment Terms</h3><p><strong>Due:</strong> 30 days</p><ul><li>Bank transfer</li></ul></div>';
    const texts: string[] = [];
    const collect = (n: unknown): void => {
      if (n == null || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(collect);
      const o = n as Record<string, unknown>;
      if (typeof o.text === 'string') texts.push(o.text);
      Object.values(o).forEach(collect);
    };
    collect(htmlToPdfmake(html));
    for (const probe of ['Payment Terms', 'Due:', '30 days', 'Bank transfer']) {
      expect(texts.some((t) => t.includes(probe))).toBe(true);
    }
  });
});
