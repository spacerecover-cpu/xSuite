const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

// Per-tag non-style attributes; `style` is allowed on every tag (sanitized).
const TAG_ATTRS: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
};

const ALLOWED_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration'];

// href: http(s) + mailto only. src: http(s) + RASTER data images only (no SVG — it can carry script).
const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_IMG_SRC = /^(https?:\/\/|data:image\/(png|jpeg|jpg|gif|webp);base64,)/i;
const NUMERIC = /^\d+$/;
const BLOCKED_VALUE_PATTERNS = /url\s*\(|expression\s*\(|javascript:|@import|import\s*\(/i;

function sanitizeStyles(styleString: string): string {
  const out: string[] = [];
  for (const style of styleString.split(';')) {
    if (!style.trim()) continue;
    const [property, value] = style.split(':').map((s) => s.trim());
    if (property && value && ALLOWED_STYLES.includes(property.toLowerCase()) && !BLOCKED_VALUE_PATTERNS.test(value)) {
      out.push(`${property}: ${value}`);
    }
  }
  return out.join('; ');
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function sanitizeNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // Unknown tag: unwrap — keep sanitized children, drop the tag itself.
    if (!ALLOWED_TAGS.includes(tagName)) {
      const fragment = document.createDocumentFragment();
      element.childNodes.forEach((child) => {
        const c = sanitizeNode(child);
        if (c) fragment.appendChild(c);
      });
      return fragment;
    }

    // Images with an unsafe src are dropped entirely (no children to keep).
    if (tagName === 'img') {
      const src = element.getAttribute('src') ?? '';
      if (!SAFE_IMG_SRC.test(src)) return null;
    }

    const newElement = document.createElement(tagName);
    const allowed = TAG_ATTRS[tagName] ?? [];

    // style (any tag)
    if (element.hasAttribute('style')) {
      const safe = sanitizeStyles(element.getAttribute('style') ?? '');
      if (safe) newElement.setAttribute('style', safe);
    }

    for (const attr of allowed) {
      if (!element.hasAttribute(attr)) continue;
      const value = element.getAttribute(attr) ?? '';
      if (attr === 'href') {
        if (SAFE_HREF.test(value)) newElement.setAttribute('href', value);
      } else if (attr === 'src') {
        if (SAFE_IMG_SRC.test(value)) newElement.setAttribute('src', value);
      } else if (attr === 'target') {
        if (value === '_blank') newElement.setAttribute('target', '_blank');
      } else if (attr === 'rel') {
        // forced below; ignore author value
      } else if (attr === 'width' || attr === 'height' || attr === 'colspan' || attr === 'rowspan') {
        if (NUMERIC.test(value)) newElement.setAttribute(attr, value);
      } else if (value) {
        newElement.setAttribute(attr, value);
      }
    }

    // Force safe rel on any anchor that kept an href.
    if (tagName === 'a' && newElement.hasAttribute('href')) {
      newElement.setAttribute('rel', 'noopener noreferrer');
    }

    element.childNodes.forEach((child) => {
      const c = sanitizeNode(child);
      if (c) newElement.appendChild(c);
    });

    return newElement;
  }

  const sanitizedBody = document.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const c = sanitizeNode(child);
    if (c) sanitizedBody.appendChild(c);
  });
  return sanitizedBody.innerHTML;
}

export function stripHtmlTags(html: string): string {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}
