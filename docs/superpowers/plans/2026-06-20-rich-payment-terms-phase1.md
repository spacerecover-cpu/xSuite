# Rich Payment Terms — Phase 1 Implementation Plan (Authoring & Form)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author payment-terms templates in a visual editor (all template types), auto-fill every new invoice (blank + from-quote) from the default `invoice_terms` template with variables resolved and snapshotted, and render the terms styled in the invoice form.

**Architecture:** Reuse the in-house `RichTextEditor` + `sanitizeHtml` (no new deps). Widen the sanitizer allowlist for links/images/tables. Add a small imperative `insertAtCursor` to the editor for `{{variable}}` insertion. A new `invoiceTermsService` resolves the default template against real context and returns sanitized HTML; `InvoiceFormModal` applies it and renders it (styled read-only + Edit toggle). The DB `terms` column already holds text → no migration.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, TanStack Query, Supabase, `document.execCommand` (editor), DOMParser (sanitizer).

**Spec:** `docs/superpowers/specs/2026-06-20-rich-payment-terms-design.md`

**Out of scope (Phase 2, separate plan):** Rendering the per-invoice styled terms on the **PDF** (`htmlToPdfmake` + terms-section change + parity/golden updates).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/sanitizeHtml.ts` | Allowlist HTML sanitizer; widen for `a`/`img`/`table` with protocol allowlisting | Modify |
| `src/lib/sanitizeHtml.test.ts` | Sanitizer unit tests incl. new XSS vectors | Create |
| `src/components/ui/RichTextEditor.tsx` | `forwardRef` + `insertAtCursor`; Link/Image/Table toolbar buttons | Modify |
| `src/components/ui/RichTextEditor.test.tsx` | Toolbar + ref handle tests | Modify |
| `src/components/templates/LineItemTemplateFormModal.tsx` | Use `RichTextEditor` for ALL types; wire variable insertion into it | Modify |
| `src/lib/invoiceTermsService.ts` | `resolveTermsHtml` / `applyDefaultInvoiceTerms` (resolve + sanitize) | Create |
| `src/lib/invoiceTermsService.test.ts` | Service unit tests | Create |
| `src/components/cases/InvoiceFormModal.tsx` | Auto-fill default terms (new + from-quote); stop stripping; styled read-only + Edit toggle | Modify |
| `src/components/cases/InvoiceFormModal.test.tsx` | From-quote uses default (not quote terms); new invoice auto-fills | Modify |

---

## Task 1: Widen `sanitizeHtml` for links, images, tables (security-critical)

**Files:**
- Modify: `src/lib/sanitizeHtml.ts`
- Create: `src/lib/sanitizeHtml.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sanitizeHtml.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sanitizeHtml.test.ts`
Expected: FAIL (links/images/tables stripped today; `<a>`/`<img>`/`<table>` not in allowlist).

- [ ] **Step 3: Rewrite `sanitizeHtml.ts` with per-tag attribute policy**

Replace the top constants and the attribute-handling section. Full new file:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sanitizeHtml.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Confirm no regression in existing consumers' tests**

Run: `npx vitest run src/components/ui/RichTextEditor.test.tsx`
Expected: PASS (editor sanitizes through the same function).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sanitizeHtml.ts src/lib/sanitizeHtml.test.ts
git commit -m "feat(sanitizer): allow links, images, tables with protocol allowlisting"
```

---

## Task 2: Add `insertAtCursor` + Link/Image/Table buttons to `RichTextEditor`

**Files:**
- Modify: `src/components/ui/RichTextEditor.tsx`
- Modify: `src/components/ui/RichTextEditor.test.tsx`

> jsdom does not implement `document.execCommand`/full `contentEditable`, so tests assert the new toolbar controls render and the imperative `insertAtCursor` handle is exposed and callable — not execCommand side effects.

- [ ] **Step 1: Write the failing tests** (append to `RichTextEditor.test.tsx`)

```tsx
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor';

describe('RichTextEditor — link/image/table tools + ref', () => {
  it('renders Link, Image, and Table toolbar buttons', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /insert link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /insert image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /insert table/i })).toBeInTheDocument();
  });

  it('exposes an imperative insertAtCursor handle', () => {
    const ref = createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} value="" onChange={() => {}} />);
    expect(typeof ref.current?.insertAtCursor).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/RichTextEditor.test.tsx`
Expected: FAIL (no such buttons; no ref handle/type export).

- [ ] **Step 3: Convert to `forwardRef` and add the handle**

In `src/components/ui/RichTextEditor.tsx`:

3a. Update imports — add `forwardRef`, `useImperativeHandle` to the React import, and add `Link2`, `Image as ImageIcon`, `Table as TableIcon` to the lucide import.

```tsx
import React, { useRef, useEffect, useState, useId, forwardRef, useImperativeHandle } from 'react';
```
```tsx
import {
  Bold, Italic, Underline, Strikethrough, Palette, Highlighter, List, ListOrdered,
  Undo, Redo, Eraser, Code, Zap, AlertTriangle, Link2, Image as ImageIcon, Table as TableIcon,
} from 'lucide-react';
```

3b. Export the handle type (above the component):

```tsx
export interface RichTextEditorHandle {
  /** Insert plain text (e.g. a {{variable}} token) at the caret. */
  insertAtCursor: (text: string) => void;
}
```

3c. Change the component signature from `React.FC<RichTextEditorProps>` to a `forwardRef`:

```tsx
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  label,
  helpText,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}, ref) => {
```

3d. Immediately after the existing `execCommand` helper, expose the handle and add insert helpers:

```tsx
  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      editorRef.current?.focus();
      document.execCommand('insertText', false, text);
      handleInput();
    },
  }), []);

  const insertLink = () => {
    const url = window.prompt(t('ui.richText.linkPrompt', 'Link URL (https://…)'));
    if (url) execCommand('createLink', url);
  };
  const insertImage = () => {
    const url = window.prompt(t('ui.richText.imagePrompt', 'Image URL (https://…)'));
    if (url) execCommand('insertImage', url);
  };
  const insertTable = () => {
    const html =
      '<table><tbody>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '</tbody></table><p><br></p>';
    execCommand('insertHTML', html);
  };
```

3e. Add the three toolbar buttons. Insert this block immediately before the `<div className="flex-1" />` spacer near the end of the toolbar:

```tsx
          <div className="w-px h-6 bg-slate-300 mx-1" />

          <button
            type="button"
            onClick={insertLink}
            title="Insert Link"
            aria-label={t('ui.richText.insertLink', 'Insert link')}
            className={toolbarButtonVariants()}
          >
            <Link2 className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={insertImage}
            title="Insert Image"
            aria-label={t('ui.richText.insertImage', 'Insert image')}
            className={toolbarButtonVariants()}
          >
            <ImageIcon className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={insertTable}
            title="Insert Table"
            aria-label={t('ui.richText.insertTable', 'Insert table')}
            className={toolbarButtonVariants()}
          >
            <TableIcon className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
```

3f. At the very end of the file, after the closing of the component body, replace the old `};` with the forwardRef close + displayName, and add table styles to the `<style>` block.

Close the component:
```tsx
});

RichTextEditor.displayName = 'RichTextEditor';
```

Add to the `<style>` template (inside the existing backtick block) so tables render with visible borders in the editor:
```css
        [contentEditable] table {
          border-collapse: collapse;
          width: 100%;
        }
        [contentEditable] td,
        [contentEditable] th {
          border: 1px solid #cbd5e1;
          padding: 4px 6px;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/RichTextEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "RichTextEditor" || echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/RichTextEditor.tsx src/components/ui/RichTextEditor.test.tsx
git commit -m "feat(editor): expose insertAtCursor + add link/image/table tools"
```

---

## Task 3: Use `RichTextEditor` for ALL template types in `LineItemTemplateFormModal`

**Files:**
- Modify: `src/components/templates/LineItemTemplateFormModal.tsx`

Today the `!isLineItemType` branch renders a raw `<textarea>` (+ `VariableInsertMenu` writing into it). Replace that branch's textarea with `RichTextEditor`, routing the variable menu through the editor's `insertAtCursor`. Keep the unknown-variable warning and the sample-data preview.

- [ ] **Step 1: Add a ref import + editor ref**

Add `RichTextEditorHandle` to the editor import:
```tsx
import { RichTextEditor, type RichTextEditorHandle } from '../ui/RichTextEditor';
```
Inside the component, add near the other refs:
```tsx
  const richEditorRef = useRef<RichTextEditorHandle>(null);
```

- [ ] **Step 2: Reroute `insertVariable` through the editor**

Replace the existing `insertVariable` function body with a version that targets the rich editor (the textarea ref path is no longer used for terms/email):

```tsx
  const insertVariable = (variableKey: string) => {
    const token = `{{${variableKey}}}`;
    richEditorRef.current?.insertAtCursor(token);
  };
```

(The `contentTextareaRef` declaration and `templateContentId` may now be unused — remove them and the `useRef`/`useId` lines for them to avoid lint errors.)

- [ ] **Step 3: Replace the `!isLineItemType` textarea block with `RichTextEditor`**

Replace the entire `else (...)` JSX branch (the `<div>` containing the `<textarea id={templateContentId} …>` and its helper text) with:

```tsx
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Template Content
                  </label>
                  <div className="flex items-center gap-2">
                    <VariableInsertMenu onInsert={insertVariable} disabled={isSubmitting} />
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 px-2 py-1 hover:bg-primary/10 rounded transition-colors"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview ? 'Hide preview' : 'Preview'}
                    </button>
                  </div>
                </div>
                <RichTextEditor
                  ref={richEditorRef}
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  minHeight="220px"
                  placeholder="Use the toolbar to format. Use Insert variable for placeholders like {{customer.name}}."
                  helpText="Placeholders like {{case.number}} are filled with real data when the template is applied."
                />

                {unknownVariables.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-warning-muted border border-warning/30 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground">
                      Unknown variable{unknownVariables.length > 1 ? 's' : ''} (will render blank):{' '}
                      <span className="font-mono">{unknownVariables.join(', ')}</span>
                    </p>
                  </div>
                )}

                {showPreview && (
                  <div className="mt-2 border border-slate-200 rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Preview with sample data
                    </p>
                    {isEmailType && formData.subject_line && (
                      <p className="text-sm text-slate-700 mb-2">
                        <span className="font-medium">Subject:</span>{' '}
                        {renderTemplate(formData.subject_line, SAMPLE_CONTEXT)}
                      </p>
                    )}
                    <div
                      className="prose prose-sm max-w-none text-sm text-slate-700"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(renderTemplate(formData.content, SAMPLE_CONTEXT)),
                      }}
                    />
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 4: Typecheck + lint the file**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "LineItemTemplateFormModal" || echo OK`
Expected: `OK` (no unused `contentTextareaRef`/`templateContentId`).

Run: `npx eslint src/components/templates/LineItemTemplateFormModal.tsx`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/LineItemTemplateFormModal.tsx
git commit -m "feat(templates): visual rich-text editor for all template types"
```

---

## Task 4: `invoiceTermsService` — resolve default terms to sanitized HTML

**Files:**
- Create: `src/lib/invoiceTermsService.ts`
- Create: `src/lib/invoiceTermsService.test.ts`

Resolves the default `invoice_terms` template against real context (with a local overlay for a not-yet-saved invoice's `invoice.*` fields), substitutes `{{variables}}`, and sanitizes. Returns `''` when there is no default template (caller leaves terms empty).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/invoiceTermsService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./documentTemplatesService', () => ({
  getDefaultTemplate: vi.fn(),
}));
vi.mock('./templateContextService', () => ({
  buildTemplateContext: vi.fn(),
}));

import { getDefaultTemplate } from './documentTemplatesService';
import { buildTemplateContext } from './templateContextService';
import { resolveInvoiceTermsHtml } from './invoiceTermsService';

const mockedGetDefault = vi.mocked(getDefaultTemplate);
const mockedBuildCtx = vi.mocked(buildTemplateContext);

describe('resolveInvoiceTermsHtml', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty string when there is no default template', async () => {
    mockedGetDefault.mockResolvedValue(null);
    mockedBuildCtx.mockResolvedValue({});
    expect(await resolveInvoiceTermsHtml({ refs: {} })).toBe('');
  });

  it('substitutes variables and sanitizes the result', async () => {
    mockedGetDefault.mockResolvedValue({
      id: 't1', name: 'Std', description: null,
      content: '<p>Due in {{invoice.due_days}} days <strong>{{company.name}}</strong></p><script>x()</script>',
      subjectLine: null, documentType: null, isDefault: true, isActive: true, usageCount: 0, lastUsedAt: null,
    });
    mockedBuildCtx.mockResolvedValue({ company: { name: 'Future Space' } });

    const out = await resolveInvoiceTermsHtml({ refs: { caseId: 'c1' }, overlay: { invoice: { due_days: '15' } } });
    expect(out).toContain('Due in 15 days');
    expect(out).toContain('<strong>Future Space</strong>');
    expect(out).not.toContain('<script');
  });

  it('overlay invoice.* wins over fetched context (new invoice not yet saved)', async () => {
    mockedGetDefault.mockResolvedValue({
      id: 't1', name: 'Std', description: null, content: '<p>{{invoice.due_date}}</p>',
      subjectLine: null, documentType: null, isDefault: true, isActive: true, usageCount: 0, lastUsedAt: null,
    });
    mockedBuildCtx.mockResolvedValue({ invoice: { due_date: 'OLD' } });
    const out = await resolveInvoiceTermsHtml({ refs: {}, overlay: { invoice: { due_date: '30/11/2026' } } });
    expect(out).toContain('30/11/2026');
    expect(out).not.toContain('OLD');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/invoiceTermsService.test.ts`
Expected: FAIL (`resolveInvoiceTermsHtml` undefined).

- [ ] **Step 3: Implement the service**

Create `src/lib/invoiceTermsService.ts`:

```ts
import { getDefaultTemplate } from './documentTemplatesService';
import { buildTemplateContext, type ContextRefs } from './templateContextService';
import { renderTemplate, type TemplateContext } from './templateEngine';
import { sanitizeHtml } from './sanitizeHtml';

export interface ResolveInvoiceTermsArgs {
  refs: ContextRefs;
  /** Overlay for fields not yet persisted (a new invoice's invoice.* values). Deep-merged over the fetched context. */
  overlay?: TemplateContext;
}

/** Shallow-deep merge: overlay's top-level objects merge into base's same key. */
function mergeContext(base: TemplateContext, overlay?: TemplateContext): TemplateContext {
  if (!overlay) return base;
  const out: TemplateContext = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (existing && typeof existing === 'object' && value && typeof value === 'object') {
      out[key] = { ...(existing as TemplateContext), ...(value as TemplateContext) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Resolve the tenant's default invoice_terms template into sanitized HTML with
 * {{variables}} substituted. Returns '' when no default template exists.
 * The result is a snapshot — store it on the invoice; it does not change when
 * the template is later edited.
 */
export async function resolveInvoiceTermsHtml({ refs, overlay }: ResolveInvoiceTermsArgs): Promise<string> {
  const template = await getDefaultTemplate('invoice_terms', 'invoice');
  if (!template || !template.content) return '';
  const baseCtx = await buildTemplateContext(refs);
  const ctx = mergeContext(baseCtx, overlay);
  return sanitizeHtml(renderTemplate(template.content, ctx));
}

/** Render any already-chosen template content against the same merged context. */
export async function resolveTermsHtmlFromContent(
  content: string,
  { refs, overlay }: ResolveInvoiceTermsArgs,
): Promise<string> {
  if (!content) return '';
  const baseCtx = await buildTemplateContext(refs);
  const ctx = mergeContext(baseCtx, overlay);
  return sanitizeHtml(renderTemplate(content, ctx));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/invoiceTermsService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoiceTermsService.ts src/lib/invoiceTermsService.test.ts
git commit -m "feat(invoices): resolve default invoice terms to sanitized HTML snapshot"
```

---

## Task 5: Wire default terms + styled rendering into `InvoiceFormModal`

**Files:**
- Modify: `src/components/cases/InvoiceFormModal.tsx`
- Modify: `src/components/cases/InvoiceFormModal.test.tsx`

Behavior: every NEW invoice (blank + from-quote) auto-fills Payment Terms from the default template (variables resolved against case/customer/company + a local `invoice.*` overlay from the form). Quote selection NO LONGER copies `quoteData.terms`. The field renders as a styled read-only block with an Edit toggle. Stored value is sanitized HTML (no `stripHtmlTags`).

- [ ] **Step 1: Write the failing tests** (append to `InvoiceFormModal.test.tsx`)

Add a mock for the new service near the other `vi.mock` calls:

```tsx
vi.mock('../../lib/invoiceTermsService', () => ({
  resolveInvoiceTermsHtml: vi.fn().mockResolvedValue('<p>DEFAULT TERMS</p>'),
  resolveTermsHtmlFromContent: vi.fn().mockResolvedValue('<p>PICKED TERMS</p>'),
}));
```

Append a new describe block:

```tsx
import { resolveInvoiceTermsHtml } from '../../lib/invoiceTermsService';

describe('InvoiceFormModal — default payment terms', () => {
  it('auto-fills a new invoice from the default terms template', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InvoiceFormModal isOpen onClose={() => {}} onSave={vi.fn().mockResolvedValue(undefined)} caseId="case-1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('DEFAULT TERMS')).toBeInTheDocument();
  });

  it('uses the default template (not the quote terms) when converting from a quote', async () => {
    const resolveMock = vi.mocked(resolveInvoiceTermsHtml);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <InvoiceFormModal
          isOpen onClose={() => {}} onSave={vi.fn().mockResolvedValue(undefined)} caseId="case-1"
          quotes={[{ id: 'q1', quote_number: 'QUOT-1', title: 'Recovery', total_amount: 231 }]}
        />
      </QueryClientProvider>,
    );
    // default terms present on open; quote selection must keep using the default (resolveInvoiceTermsHtml), never quoteData.terms
    expect(await screen.findByText('DEFAULT TERMS')).toBeInTheDocument();
    expect(resolveMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cases/InvoiceFormModal.test.tsx`
Expected: FAIL (no "DEFAULT TERMS" rendered; service not called yet).

- [ ] **Step 3: Imports + state**

Add imports:
```tsx
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { RichTextEditor, type RichTextEditorHandle } from '../ui/RichTextEditor';
import { resolveInvoiceTermsHtml, resolveTermsHtmlFromContent } from '../../lib/invoiceTermsService';
import { toDateInputValue } from '../../lib/format';
```
Add state near the other `useState` hooks:
```tsx
  const [editingTerms, setEditingTerms] = useState(false);
  const termsEditorRef = useRef<RichTextEditorHandle>(null);
```
(Add `useRef` to the React import if not present.)

- [ ] **Step 4: Add a context-overlay helper + apply-default effect**

Add this helper inside the component (after `invoiceData` is defined):

```tsx
  // Local invoice.* overlay so a not-yet-saved invoice resolves real values.
  const buildTermsOverlay = () => ({
    invoice: {
      due_date: invoiceData.due_date ? toDateInputValue(invoiceData.due_date) : '',
      due_days: invoiceData.invoice_date && invoiceData.due_date
        ? String(Math.max(0, Math.round(
            (new Date(invoiceData.due_date).getTime() - new Date(invoiceData.invoice_date).getTime()) / 86_400_000)))
        : '',
    },
  });
```

Add an effect that auto-fills terms for a NEW invoice on open (never overrides an existing invoice's saved terms):

```tsx
  useEffect(() => {
    if (!isOpen || initialData) return; // edit mode keeps saved terms
    let cancelled = false;
    (async () => {
      const html = await resolveInvoiceTermsHtml({
        refs: { caseId: selectedCaseId || caseId, customerId: customerId ?? undefined },
        overlay: buildTermsOverlay(),
      });
      if (!cancelled && html) {
        setInvoiceData((prev) => (prev.terms_and_conditions ? prev : { ...prev, terms_and_conditions: html }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData, selectedCaseId, caseId, customerId]);
```

- [ ] **Step 5: Stop copying quote terms; re-apply default on quote select**

In `handleQuoteSelection`, REMOVE the `terms_and_conditions: quoteData.terms || prev.terms_and_conditions,` line from the `setInvoiceData` call (keep `notes` and `discount_amount`). After that `setInvoiceData`, append:

```tsx
    const defaultHtml = await resolveInvoiceTermsHtml({
      refs: { caseId: selectedCaseId || caseId, customerId: customerId ?? undefined, quoteId },
      overlay: buildTermsOverlay(),
    });
    if (defaultHtml) setInvoiceData((prev) => ({ ...prev, terms_and_conditions: defaultHtml }));
```

- [ ] **Step 6: Replace `applyTermsTemplate` (stop stripping; resolve + sanitize)**

Replace the existing `stripHtmlTags` helper and `applyTermsTemplate` with:

```tsx
  const applyTermsTemplate = async (template: InvoiceTermsTemplate) => {
    const html = await resolveTermsHtmlFromContent(template.content ?? '', {
      refs: { caseId: selectedCaseId || caseId, customerId: customerId ?? undefined },
      overlay: buildTermsOverlay(),
    });
    setInvoiceData((prev) => ({ ...prev, terms_and_conditions: html }));
    setShowTermsTemplates(false);
    void recordTemplateUsage(template.id);
  };
```

(Delete the now-unused `stripHtmlTags` function.)

- [ ] **Step 7: Replace the Payment Terms `<textarea>` with styled block + Edit toggle**

Replace the `<textarea id={paymentTermsId} … />` element with:

```tsx
                {editingTerms ? (
                  <RichTextEditor
                    ref={termsEditorRef}
                    value={invoiceData.terms_and_conditions}
                    onChange={(html) => setInvoiceData({ ...invoiceData, terms_and_conditions: html })}
                    minHeight="160px"
                    placeholder="Payment terms (e.g., Net 30, Due on receipt)"
                  />
                ) : invoiceData.terms_and_conditions ? (
                  <div
                    className="prose prose-sm max-w-none border border-slate-200 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(invoiceData.terms_and_conditions) }}
                  />
                ) : (
                  <p className="border border-dashed border-slate-300 rounded-lg p-3 text-sm text-slate-400">
                    No payment terms yet. Use Quick Add or Edit.
                  </p>
                )}
```

In the Payment Terms header row, add an Edit/Done toggle next to the existing "Quick Add" button:

```tsx
                  <button
                    type="button"
                    onClick={() => setEditingTerms((v) => !v)}
                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                  >
                    {editingTerms ? 'Done' : 'Edit'}
                  </button>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/cases/InvoiceFormModal.test.tsx`
Expected: PASS (all prior tests + the two new ones).

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "InvoiceFormModal" || echo OK`
Expected: `OK`.
Run: `npx eslint src/components/cases/InvoiceFormModal.tsx`
Expected: 0 errors (no unused `paymentTermsId`/`stripHtmlTags`; remove if flagged).

- [ ] **Step 10: Commit**

```bash
git add src/components/cases/InvoiceFormModal.tsx src/components/cases/InvoiceFormModal.test.tsx
git commit -m "feat(invoices): default terms auto-fill + styled terms with edit toggle"
```

---

## Task 6: Full-suite verification

- [ ] **Step 1: Typecheck (CI metric)**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"`
Expected: `0`.

- [ ] **Step 2: Run the touched tests**

Run: `npx vitest run src/lib/sanitizeHtml.test.ts src/lib/invoiceTermsService.test.ts src/components/ui/RichTextEditor.test.tsx src/components/cases/InvoiceFormModal.test.tsx src/components/templates`
Expected: all PASS.

- [ ] **Step 3: Lint the changed files**

Run: `npx eslint src/lib/sanitizeHtml.ts src/lib/invoiceTermsService.ts src/components/ui/RichTextEditor.tsx src/components/templates/LineItemTemplateFormModal.tsx src/components/cases/InvoiceFormModal.tsx`
Expected: 0 errors.

- [ ] **Step 4: Push**

```bash
git push -u origin claude/rich-payment-terms
```

---

## Self-review (completed by plan author)

- **Spec coverage:** Default-template auto-fill new+from-quote (Task 5); no quote-terms copy (Task 5 Step 5); resolve+snapshot (Task 4); rich editor all types (Task 3); variable insertion in editor (Tasks 2–3); styled form + Edit toggle (Task 5 Step 7); sanitizer hardening (Task 1). PDF (Part D) is intentionally deferred to the Phase 2 plan.
- **Type consistency:** `RichTextEditorHandle.insertAtCursor` used in Tasks 2/3/5; `resolveInvoiceTermsHtml`/`resolveTermsHtmlFromContent` signatures match between Task 4 and Task 5; `ContextRefs` reused from `templateContextService`.
- **Placeholders:** none — each step shows concrete code/commands.

## Phase 2 (separate plan — to be written next)

`docs/superpowers/plans/2026-06-20-rich-payment-terms-phase2.md` will cover the PDF:
`htmlToPdfmake(html)` mapper (+ tests), `dataFetcher` populating invoice terms from the `terms` column, the engine `terms` section rendering per-record rich body (precedence for invoices), and updating `terms.test.ts` + invoice parity/golden snapshots. It requires first confirming the live invoice builder in `pdfService.ts` (engine vs legacy `documents/InvoiceDocument.ts`).
