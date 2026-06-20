// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml — existing formatting preserved', () => {
  it('keeps bold, lists, and inline color', () => {
    const out = sanitizeHtml('<p><strong>Hi</strong></p><ul><li>a</li></ul><span style="color: #ef4444">x</span>');
    expect(out).toContain('<strong>Hi</strong>');
    expect(out).toContain('<ul><li>a</li></ul>');
    expect(out).toContain('color: #ef4444');
  });
});

describe('sanitizeHtml — links', () => {
  it('keeps https links and forces safe rel', () => {
    const out = sanitizeHtml('<a href="https://x.com">go</a>');
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
  it('keeps mailto links', () => {
    expect(sanitizeHtml('<a href="mailto:a@b.com">m</a>')).toContain('href="mailto:a@b.com"');
  });
  it('drops javascript: href but keeps the text', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });
  it('only allows target=_blank', () => {
    const out = sanitizeHtml('<a href="https://x.com" target="_self">g</a>');
    expect(out).not.toContain('_self');
  });
});

describe('sanitizeHtml — images', () => {
  it('keeps https images with alt', () => {
    const out = sanitizeHtml('<img src="https://x.com/a.png" alt="pic" width="40">');
    expect(out).toContain('src="https://x.com/a.png"');
    expect(out).toContain('alt="pic"');
    expect(out).toContain('width="40"');
  });
  it('keeps raster data images', () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png;base64,AAAA');
  });
  it('drops svg data images (SVG can carry script)', () => {
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,AAAA">')).not.toContain('data:image/svg');
  });
  it('drops javascript: image src entirely', () => {
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).not.toContain('javascript:');
  });
  it('drops non-numeric width', () => {
    expect(sanitizeHtml('<img src="https://x/a.png" width="40px">')).not.toContain('width=');
  });
});

describe('sanitizeHtml — tables', () => {
  it('keeps table structure and numeric colspan', () => {
    const out = sanitizeHtml('<table><thead><tr><th colspan="2">H</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    expect(out).toContain('<table>');
    expect(out).toContain('<th colspan="2">');
    expect(out).toContain('<td>a</td>');
  });
});

describe('sanitizeHtml — hostile input', () => {
  it('strips script tags and event handlers', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">hi</p><script>alert(2)</script>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<script');
    expect(out).toContain('hi');
  });
});
