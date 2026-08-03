// Pure logic for the whatsapp-send worker. No Deno globals, no Supabase client —
// unit-testable under vitest (house pattern: provisionGuards.ts).

export type SendErrorKind =
  | 'retry' | 'suppress_marketing' | 'mark_unreachable' | 'template_broken'
  | 'integration_quality_pause' | 'integration_token_dead' | 'integration_locked'
  | 'hard_fail';

export interface SendErrorClass { kind: SendErrorKind; code: number; }

const RETRYABLE = new Set([4, 80007, 130429, 131000, 131016, 131056, 131057]);
const TOKEN_DEAD = new Set([0, 190]);
const LOCKED = new Set([368, 131031, 131042]);

export function classifySendError(code: number): SendErrorClass {
  if (RETRYABLE.has(code)) return { kind: 'retry', code };
  if (code === 131049) return { kind: 'suppress_marketing', code };
  if (code === 131026) return { kind: 'mark_unreachable', code };
  if (code >= 132000 && code <= 132999) return { kind: 'template_broken', code };
  if (code === 131048) return { kind: 'integration_quality_pause', code };
  if (TOKEN_DEAD.has(code)) return { kind: 'integration_token_dead', code };
  if (LOCKED.has(code)) return { kind: 'integration_locked', code };
  return { kind: 'hard_fail', code };
}

/** Exponential backoff in seconds: 1m, 2m, 4m, ... capped at 12h. */
export function computeBackoff(attempt: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 12 * 3600);
}

/**
 * Best-effort E.164. Strips separators and converts a leading 00 to +.
 *
 * A BARE digit string is ambiguous, and length does not disambiguate it: ten
 * digits is a COMPLETE national number in the NANP, India and many other plans,
 * so unconditionally prefixing '+' does not normalize the number — it invents a
 * country code (2125551234 → +212…, Morocco) and sends the customer's case
 * details to a stranger abroad. Bare numbers are therefore qualified with the
 * tenant's own dial code (national trunk 0 dropped), and refused outright when
 * no dial code is known. A refusal surfaces as a visible `no_phone` failure on
 * the message row; a wrong-country send is silent.
 *
 * E.164 country codes never start with 0.
 */
export function normalizeToE164(raw: string, defaultDialCode?: string | null): string | null {
  let v = (raw ?? '').replace(/[\s\-().]/g, '');
  if (v.startsWith('00')) v = '+' + v.slice(2);

  if (!v.startsWith('+')) {
    const dial = (defaultDialCode ?? '').replace(/\D/g, '');
    if (!dial) return null;
    const local = v.replace(/^0+/, '');
    if (!/^\d+$/.test(local)) return null;
    // Already carries the country code (and enough digits after it to be a real
    // subscriber number) → take it as-is rather than doubling the prefix.
    v = local.startsWith(dial) && local.length > dial.length + 4
      ? '+' + local
      : '+' + dial + local;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(v)) return null;
  return v;
}

/** Meta has NO language fallback (error 132001) — resolve against APPROVED translations only. */
export function resolveTemplateLanguage(
  rows: Array<{ language: string; status: string }>,
  customerLang: string | null | undefined,
  tenantDefault: string | null | undefined,
): string | null {
  const approved = rows.filter((r) => r.status === 'APPROVED').map((r) => r.language);
  const pick = (lang?: string | null) => {
    if (!lang) return null;
    if (approved.includes(lang)) return lang;
    const base = lang.split(/[-_]/)[0];
    return approved.find((a) => a === base || a.split(/[-_]/)[0] === base) ?? null;
  };
  return pick(customerLang) ?? pick(tenantDefault) ?? pick('en') ?? approved[0] ?? null;
}

const VAR_RE = /\{\{\s*([\w]+)\s*\}\}/g;

interface TemplateButton { type: string; text?: string; url?: string; }
interface TemplateComponent { type: string; text?: string; format?: string; buttons?: TemplateButton[]; }
type SendComponent = {
  type: string; sub_type?: string; index?: number;
  parameters: Array<Record<string, unknown>>;
};

/**
 * Build Meta send-time components from the stored template components + variable
 * map + context. Covers: TEXT/IMAGE headers (image = tenant-logo branding via
 * media.headerImageLink), BODY variables, dynamic-URL-suffix buttons (suffix value
 * from variableMap['button_url_<index>']), and quick-reply payloads (uppercased
 * button text — which is how STOP/UNSUBSCRIBE taps arrive recognizably inbound).
 * Throws on an IMAGE header with no media link — the worker converts that to a
 * loud skip instead of sending a payload Meta would reject.
 */
export function buildTemplateParams(
  components: TemplateComponent[],
  variableMap: Record<string, string>,
  context: Record<string, string>,
  parameterFormat: 'named' | 'positional',
  media?: { headerImageLink?: string },
): SendComponent[] {
  const out: SendComponent[] = [];
  const valueOf = (name: string) => context[variableMap[name] ?? name] ?? '—';
  for (const c of components) {
    const type = c.type?.toUpperCase();
    if (type === 'HEADER') {
      const format = (c.format ?? 'TEXT').toUpperCase();
      if (format === 'IMAGE') {
        if (!media?.headerImageLink) throw new Error('template requires header media but none provided');
        out.push({ type: 'header', parameters: [{ type: 'image', image: { link: media.headerImageLink } }] });
        continue;
      }
      if (format !== 'TEXT' || !c.text) continue;
    }
    if (type === 'BODY' || type === 'HEADER') {
      if (!c.text) continue;
      const names = [...c.text.matchAll(VAR_RE)].map((m) => m[1]);
      if (names.length === 0) continue;
      const parameters = names.map((name) =>
        parameterFormat === 'named'
          ? { type: 'text', parameter_name: name, text: valueOf(name) }
          : { type: 'text', text: valueOf(name) });
      out.push({ type: type.toLowerCase(), parameters });
      continue;
    }
    if (type === 'BUTTONS') {
      (c.buttons ?? []).forEach((btn, index) => {
        const btnType = btn.type?.toUpperCase();
        if (btnType === 'URL' && btn.url && VAR_RE.test(btn.url)) {
          VAR_RE.lastIndex = 0;
          out.push({
            type: 'button', sub_type: 'url', index,
            parameters: [{ type: 'text', text: valueOf(`button_url_${index}`) }],
          });
        } else if (btnType === 'QUICK_REPLY') {
          out.push({
            type: 'button', sub_type: 'quick_reply', index,
            parameters: [{ type: 'payload', payload: (btn.text ?? '').toUpperCase() }],
          });
        }
        // PHONE_NUMBER / static-URL buttons need no send-time parameters
      });
    }
  }
  return out;
}

/** Render the human-readable body copy stored on the message row for logs / the case tab. */
export function renderBodyPreview(bodyText: string, values: Record<string, string>): string {
  return bodyText.replace(VAR_RE, (_, name: string) => values[name] ?? '—');
}
