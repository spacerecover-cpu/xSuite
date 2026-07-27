import { describe, expect, it } from 'vitest';
import { verifyMetaSignature, matchOptKeyword, extractChanges } from './webhookCore';

describe('verifyMetaSignature', () => {
  it('accepts a valid signature and rejects tampering', async () => {
    const secret = 'test_app_secret';
    const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, body);
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyMetaSignature(body, `sha256=${hex}`, secret)).toBe(true);
    expect(await verifyMetaSignature(body, `sha256=${'0'.repeat(64)}`, secret)).toBe(false);
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
    expect(await verifyMetaSignature(body, 'bogus', secret)).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares without early exit', async () => {
    const { timingSafeEqual } = await import('./webhookCore');
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});

describe('matchOptKeyword', () => {
  it.each([
    ['STOP', 'stop'], ['stop', 'stop'], ['  Unsubscribe ', 'stop'], ['إيقاف', 'stop'],
    ['START', 'start'], ['resume', 'start'],
    ['hello there', null], ['stop by tomorrow to collect', null],
  ])('%s → %s', (input, expected) => {
    expect(matchOptKeyword(input)).toBe(expected);
  });
});

describe('extractChanges', () => {
  it('flattens entry[].changes[] with waba id and phone_number_id', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA1', changes: [{ field: 'messages',
        value: { metadata: { phone_number_id: 'PN1' }, statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }],
    };
    const out = extractChanges(payload);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ wabaId: 'WABA1', field: 'messages', phoneNumberId: 'PN1' });
  });
});
