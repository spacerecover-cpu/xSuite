// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, decodeHtmlEntities, htmlToPlainText } from './sanitizeHtml';

describe('decodeHtmlEntities', () => {
  it('decodes &amp; to &', () => {
    expect(decodeHtmlEntities('Cash, Card, Cheque &amp; Bank Transfer')).toBe('Cash, Card, Cheque & Bank Transfer');
  });
  it('decodes numeric and named entities', () => {
    expect(decodeHtmlEntities('It&#39;s &lt;b&gt; &amp; &nbsp;done')).toBe("It's <b> &  done");
  });
  it('decodes &amp; last so &amp;lt; becomes &lt; (not <)', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });
  it('returns empty input unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('htmlToPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToPlainText('<p>Cheque &amp; Bank Transfer</p>')).toBe('Cheque & Bank Transfer');
  });
  it('turns block boundaries into newlines', () => {
    const out = htmlToPlainText('<h3>Terms &amp; Conditions</h3><p>No data, no fee.</p><p>50% advance.</p>');
    expect(out).toBe('Terms & Conditions\nNo data, no fee.\n50% advance.');
  });
  it('renders list items on separate lines', () => {
    expect(htmlToPlainText('<ul><li>Cash</li><li>Card</li></ul>')).toBe('Cash\nCard');
  });
  it('honours <br> as a line break', () => {
    expect(htmlToPlainText('Line one<br>Line two')).toBe('Line one\nLine two');
  });
  it('returns empty string for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
  });
});

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

describe('sanitizeHtml — mXSS / unwrap vectors', () => {
  it('does not re-materialize script when unwrapping RCDATA/foreign-content tags', () => {
    for (const input of [
      '<style><img src=x onerror=alert(1)></style>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
      '<textarea><img src=x onerror=alert(1)></textarea>',
      '<xmp><img src=x onerror=alert(1)></xmp>',
    ]) {
      const out = sanitizeHtml(input);
      // Re-parse the sanitized output (simulates dangerouslySetInnerHTML) and assert no live nodes.
      const doc = new DOMParser().parseFromString(out, 'text/html');
      expect(doc.querySelector('script')).toBeNull();
      expect(out).not.toContain('onerror');
    }
  });

  it('unwraps an unknown tag but keeps its allowed children', () => {
    const out = sanitizeHtml('<div><script>bad()</script><b>keep</b></div>');
    expect(out).toContain('<b>keep</b>');
    expect(out).not.toContain('<script');
  });
});

describe('sanitizeHtml — URL scheme bypass attempts', () => {
  it('drops protocol-relative href and src', () => {
    expect(sanitizeHtml('<a href="//evil.com">x</a>')).not.toContain('//evil.com');
    expect(sanitizeHtml('<img src="//evil.com/a.png">')).not.toContain('//evil.com');
  });
  it('drops whitespace/control-char prefixed javascript scheme', () => {
    expect(sanitizeHtml('<a href="\tjavascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<a href=" javascript:alert(1)">x</a>')).not.toContain('javascript');
  });
  it('drops HTML-entity-encoded javascript scheme', () => {
    // &#106; decodes to "j" before getAttribute, so the decoded value is javascript:
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).not.toContain('javascript');
  });
});

describe('sanitizeHtml — style value filter', () => {
  it('strips url(), expression(), and @import values', () => {
    expect(sanitizeHtml('<span style="background-color: url(x)">a</span>')).not.toContain('url(');
    expect(sanitizeHtml('<span style="color: expression(alert(1))">a</span>')).not.toContain('expression');
    expect(sanitizeHtml('<span style="color: @import">a</span>')).not.toContain('@import');
  });
  it('strips CSS-escaped values', () => {
    const out = sanitizeHtml('<span style="background-color: \\75 rl(x)">a</span>');
    expect(out).not.toContain('\\75');
  });
  it('keeps a plain color value with parentheses (rgb)', () => {
    expect(sanitizeHtml('<span style="color: rgb(0,0,0)">a</span>')).toContain('color: rgb(0,0,0)');
  });
});

describe('sanitizeHtml — data image params + numeric caps', () => {
  it('keeps a raster data URI that carries a media-type parameter', () => {
    expect(sanitizeHtml('<img src="data:image/png;charset=utf-8;base64,AAAA">')).toContain('data:image/png;charset=utf-8;base64,AAAA');
  });
  it('drops an absurdly large colspan (digit cap)', () => {
    expect(sanitizeHtml('<table><tbody><tr><td colspan="100000">a</td></tr></tbody></table>')).not.toContain('colspan');
  });
});
