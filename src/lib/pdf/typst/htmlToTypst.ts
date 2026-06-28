/**
 * Minimal HTML → Typst markup for the rich-text editor's output (Payment Terms,
 * Notes). The editor emits a shallow subset — `<p>`, `<br>`, `<ul>/<ol>/<li>`,
 * `<strong>/<b>`, `<em>/<i>`, and `<span style="font-weight:600">` — which the
 * pdfmake path renders via htmlToPdfmake. The Typst assembler needs the
 * equivalent, so this converts that subset to Typst content (#list / #strong /
 * #emph), escaping the TEXT segments (never the markup it emits) so arbitrary
 * prose can't break the document. Plain (tagless) input is just escaped.
 */
import { escapeTypst } from './escape';

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Convert one inline fragment (no block tags) to Typst content, escaping text. */
function inlineToTypst(frag: string): string {
  let out = '';
  let last = 0;
  const closers: string[] = []; // what each open tag emits on close ('' = nothing)
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(frag)) !== null) {
    out += escapeTypst(decodeEntities(frag.slice(last, m.index)));
    last = tagRe.lastIndex;
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      out += ' ';
      continue;
    }
    const attrs = m[3] || '';
    if (m[1]) {
      out += closers.pop() ?? '';
    } else {
      const bold = tag === 'strong' || tag === 'b' || (tag === 'span' && /font-weight:\s*(?:bold|[6-9]\d\d)/i.test(attrs));
      const italic = tag === 'em' || tag === 'i';
      if (bold) {
        out += '#strong[';
        closers.push(']');
      } else if (italic) {
        out += '#emph[';
        closers.push(']');
      } else {
        closers.push(''); // span / other inline wrapper — no Typst output
      }
    }
  }
  out += escapeTypst(decodeEntities(frag.slice(last)));
  return out.trim();
}

export function htmlToTypst(html: string | null | undefined): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return escapeTypst(html); // plain text, no markup

  // List → #list of items (covers the common Payment-Terms bullet list).
  const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => inlineToTypst(m[1]));
  if (items.length) {
    return `#list(${items.map((it) => `[${it}]`).join(', ')})`;
  }

  // Otherwise treat as paragraphs split on </p> or <br>.
  const paras = html
    .split(/<\/p>|<br\s*\/?>/i)
    .map((p) => inlineToTypst(p.replace(/<p\b[^>]*>/i, '')))
    .filter((p) => p.length > 0);
  return paras.join(' #parbreak() ');
}
