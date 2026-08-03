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
    // Skip empty overlay values so a partial overlay never clobbers a populated
    // base sub-object (e.g. { invoice: undefined } must not wipe ctx.invoice).
    if (value === null || value === undefined) continue;
    const existing = out[key];
    if (existing && typeof existing === 'object' && typeof value === 'object') {
      out[key] = { ...(existing as TemplateContext), ...(value as TemplateContext) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * HTML-escape every string in the context BEFORE substitution.
 *
 * Context values are customer DATA (names, company names, case problem text),
 * never authored markup — buildTemplateContext hands over plain DB strings. Left
 * raw, a value like `Al-Rashid & Sons <Holdings> Trading L.L.C.` is substituted
 * into the template and then parsed as markup by sanitizeHtml, whose unknown-tag
 * unwrap deletes the `<Holdings>` fragment from what is a legally binding
 * snapshot. Escaping first means sanitizeHtml only ever sees template-authored
 * markup, and the value round-trips through the sanitizer as text.
 */
function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeContext(ctx: TemplateContext): TemplateContext {
  const out: TemplateContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string') {
      out[key] = escapeHtmlValue(value);
    } else if (value !== null && typeof value === 'object') {
      out[key] = escapeContext(value as TemplateContext);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Resolve the tenant's default invoice_terms template into sanitized HTML with
 * {{variables}} substituted. Returns '' when no default template exists.
 * The result is a SNAPSHOT — store it on the invoice; it does not change when
 * the template is later edited.
 */
export async function resolveInvoiceTermsHtml({ refs, overlay }: ResolveInvoiceTermsArgs): Promise<string> {
  const template = await getDefaultTemplate('invoice_terms', 'invoice');
  if (!template || !template.content) return '';
  const baseCtx = await buildTemplateContext(refs);
  const ctx = mergeContext(baseCtx, overlay);
  return sanitizeHtml(renderTemplate(template.content, escapeContext(ctx)));
}

/** Render any already-chosen template content against the same merged context. */
export async function resolveTermsHtmlFromContent(
  content: string,
  { refs, overlay }: ResolveInvoiceTermsArgs,
): Promise<string> {
  if (!content) return '';
  const baseCtx = await buildTemplateContext(refs);
  const ctx = mergeContext(baseCtx, overlay);
  return sanitizeHtml(renderTemplate(content, escapeContext(ctx)));
}
