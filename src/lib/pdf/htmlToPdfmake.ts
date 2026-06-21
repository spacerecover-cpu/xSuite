import type { Content } from 'pdfmake/interfaces';

const HEADING_SIZE: Record<string, number> = { h1: 15, h2: 13, h3: 12, h4: 11, h5: 10, h6: 9 };
const LINK_COLOR = '#2563eb';
const BLOCK_MARGIN: [number, number, number, number] = [0, 0, 0, 4];

interface Mark {
  bold?: boolean;
  italics?: boolean;
  decoration?: ('underline' | 'lineThrough')[];
  color?: string;
  background?: string;
  link?: string;
}
interface Run extends Mark { text: string; }

function styleFrom(el: Element): { color?: string; background?: string } {
  const style = el.getAttribute('style') ?? '';
  const out: { color?: string; background?: string } = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (prop === 'color') out.color = val;
    else if (prop === 'background-color') out.background = val;
  }
  return out;
}
type Decoration = 'underline' | 'lineThrough';
function addDecoration(existing: Decoration[] | undefined, value: Decoration): Decoration[] {
  return existing?.includes(value) ? existing : [...(existing ?? []), value];
}
function mergeMark(base: Mark, el: Element): Mark {
  const tag = el.tagName.toLowerCase();
  const next: Mark = { ...base };
  if (tag === 'strong' || tag === 'b') next.bold = true;
  else if (tag === 'em' || tag === 'i') next.italics = true;
  else if (tag === 'u') next.decoration = addDecoration(next.decoration, 'underline');
  else if (tag === 's' || tag === 'strike') next.decoration = addDecoration(next.decoration, 'lineThrough');
  else if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href) { next.link = href; next.color = LINK_COLOR; next.decoration = addDecoration(next.decoration, 'underline'); }
  } else if (tag === 'span') {
    const s = styleFrom(el);
    if (s.color) next.color = s.color;
    if (s.background) next.background = s.background;
  }
  return next;
}
function runOf(text: string, mark: Mark): Run {
  const r: Run = { text };
  if (mark.bold) r.bold = true;
  if (mark.italics) r.italics = true;
  if (mark.decoration && mark.decoration.length) r.decoration = mark.decoration;
  if (mark.color) r.color = mark.color;
  if (mark.background) r.background = mark.background;
  if (mark.link) r.link = mark.link;
  return r;
}
function inlineRuns(node: Node, mark: Mark): Run[] {
  const runs: Run[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? '';
      if (t) runs.push(runOf(t, mark));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') { runs.push({ text: '\n' }); return; }
    if (tag === 'img') { const alt = el.getAttribute('alt'); if (alt) runs.push(runOf(alt, mark)); return; }
    runs.push(...inlineRuns(el, mergeMark(mark, el)));
  });
  return runs;
}
function blockOf(el: Element): Content | null {
  const tag = el.tagName.toLowerCase();
  if (tag in HEADING_SIZE) {
    return { text: inlineRuns(el, {}), bold: true, fontSize: HEADING_SIZE[tag], margin: BLOCK_MARGIN } as Content;
  }
  if (tag === 'ul') {
    return { ul: Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li').map((li) => ({ text: inlineRuns(li, {}) } as Content)), margin: BLOCK_MARGIN } as Content;
  }
  if (tag === 'ol') {
    return { ol: Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li').map((li) => ({ text: inlineRuns(li, {}) } as Content)), margin: BLOCK_MARGIN } as Content;
  }
  if (tag === 'table') {
    const rows: Content[][] = [];
    el.querySelectorAll('tr').forEach((tr) => {
      const cells: Content[] = [];
      tr.querySelectorAll('th,td').forEach((cell) => { cells.push({ text: inlineRuns(cell, {}) } as Content); });
      if (cells.length) rows.push(cells);
    });
    if (!rows.length) return null;
    return { table: { body: rows }, layout: 'lightHorizontalLines', margin: BLOCK_MARGIN } as Content;
  }
  // A block container (div/section/blockquote/…) that holds further block-level
  // children (h*/p/ul/…): recurse so each child renders as its own block, rather
  // than collapsing the whole subtree into one inline paragraph. This is what the
  // rich-text editor emits for terms (a wrapping <div> around headings/paragraphs).
  const hasBlockChildren = Array.from(el.children).some((c) => {
    const t = c.tagName.toLowerCase();
    return t in HEADING_SIZE || t === 'p' || t === 'ul' || t === 'ol' || t === 'table' || t === 'div';
  });
  if (hasBlockChildren) {
    const stack = blocksFrom(el);
    return stack.length ? ({ stack } as Content) : null;
  }
  const runs = inlineRuns(el, {});
  return runs.length ? ({ text: runs, margin: BLOCK_MARGIN } as Content) : null;
}
/** Walk an element's child nodes, emitting one block per block-level child and
 *  coalescing runs of inline/text content into paragraph blocks. */
function blocksFrom(parent: Node): Content[] {
  const out: Content[] = [];
  let looseRuns: Run[] = [];
  const flush = () => { if (looseRuns.length) { out.push({ text: looseRuns, margin: BLOCK_MARGIN } as Content); looseRuns = []; } };
  const inlineTags = ['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'a', 'br', 'img'];
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? '';
      if (t.trim()) looseRuns.push({ text: t });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (inlineTags.includes(tag)) {
      if (tag === 'br') looseRuns.push({ text: '\n' });
      else if (tag === 'img') { const alt = el.getAttribute('alt'); if (alt) looseRuns.push({ text: alt }); }
      else looseRuns.push(...inlineRuns(el, mergeMark({}, el)));
      return;
    }
    flush();
    const block = blockOf(el);
    if (block) out.push(block);
  });
  flush();
  return out;
}
export function htmlToPdfmake(html: string): Content[] {
  if (!html) return [];
  // Rich parsing needs a DOM. In the browser (the only place PDFs are generated)
  // DOMParser is always present; in a non-DOM environment (node-side unit tests
  // that render a document as collateral) fall back to tag-stripped plain text so
  // the content still appears rather than throwing.
  if (typeof DOMParser === 'undefined') {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? [{ text } as Content] : [];
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return blocksFrom(doc.body);
}
