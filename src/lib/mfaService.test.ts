import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mfaService } from './mfaService';

// Controllable supabase MFA mock so we can drive AAL / factor-list outcomes.
let aalImpl: () => Promise<{ data: unknown; error: unknown }>;
let listFactorsImpl: () => Promise<{ data: unknown; error: unknown }>;

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () => aalImpl(),
        listFactors: () => listFactorsImpl(),
      },
    },
  },
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  aalImpl = async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
  listFactorsImpl = async () => ({ data: { totp: [] }, error: null });
});

describe('mfaService.needsMFAVerification', () => {
  it('requires a challenge when the session is aal1 but a verified factor exists (nextLevel aal2)', async () => {
    aalImpl = async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    expect(await mfaService.needsMFAVerification()).toBe(true);
  });

  it('does not require a challenge once the session is elevated to aal2', async () => {
    aalImpl = async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect(await mfaService.needsMFAVerification()).toBe(false);
  });

  it('does not require a challenge for a user with no verified factor (nextLevel aal1)', async () => {
    aalImpl = async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    expect(await mfaService.needsMFAVerification()).toBe(false);
  });

  it('fails CLOSED on an AAL error: challenges a user who has a verified factor', async () => {
    aalImpl = async () => ({ data: null, error: new Error('aal blip') });
    listFactorsImpl = async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });
    expect(await mfaService.needsMFAVerification()).toBe(true);
  });

  it('does not strand a non-MFA user when the AAL check errors but factors are readable', async () => {
    aalImpl = async () => ({ data: null, error: new Error('aal blip') });
    listFactorsImpl = async () => ({ data: { totp: [] }, error: null });
    expect(await mfaService.needsMFAVerification()).toBe(false);
  });

  it('fails CLOSED when neither AAL nor the factor list can be determined', async () => {
    aalImpl = async () => { throw new Error('down'); };
    listFactorsImpl = async () => { throw new Error('down'); };
    expect(await mfaService.needsMFAVerification()).toBe(true);
  });
});
