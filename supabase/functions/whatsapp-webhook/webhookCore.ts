// Pure logic for the whatsapp-webhook receiver. No Deno globals — vitest-testable.

/** Timing-safe X-Hub-Signature-256 check over the RAW body bytes (never re-serialized JSON). */
export async function verifyMetaSignature(
  rawBody: Uint8Array, header: string | null, appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false;
  const expectedHex = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
  const actualHex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

/** Constant-time string equality (verify-token comparison on the GET handshake). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STOP_WORDS = ['stop', 'unsubscribe', 'cancel', 'stopall', 'إيقاف', 'الغاء', 'إلغاء'];
const START_WORDS = ['start', 'resume', 'unstop', 'subscribe', 'اشتراك'];

/** Exact-message keyword match (whole trimmed message, case-insensitive) → 'stop' | 'start' | null. */
export function matchOptKeyword(body: string): 'stop' | 'start' | null {
  const t = (body ?? '').trim().toLowerCase();
  if (STOP_WORDS.includes(t)) return 'stop';
  if (START_WORDS.includes(t)) return 'start';
  return null;
}

export interface WebhookChange {
  wabaId: string;
  field: string;
  phoneNumberId: string | null;
  value: Record<string, unknown>;
}

export function extractChanges(payload: unknown): WebhookChange[] {
  const out: WebhookChange[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const e of entries as Array<{ id?: string; changes?: unknown[] }>) {
    for (const c of (e.changes ?? []) as Array<{ field?: string; value?: Record<string, unknown> }>) {
      const value = c.value ?? {};
      const metadata = value.metadata as { phone_number_id?: string } | undefined;
      out.push({
        wabaId: e.id ?? '', field: c.field ?? '',
        phoneNumberId: metadata?.phone_number_id ?? null, value,
      });
    }
  }
  return out;
}
