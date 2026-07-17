import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, rpcMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(async () => ({ data: null as unknown, error: null as { message: string } | null })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'actor-1' } } })),
}));
vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: rpcMock, auth: { getUser: getUserMock } },
}));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { userManagementService } from './userManagementService';

const profileChain = () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({
    data: { id: 'u-1', full_name: 'Old', role: 'technician', phone: null, is_active: true },
    error: null,
  }));
  return chain;
};

beforeEach(() => {
  fromMock.mockReset();
  fromMock.mockImplementation(() => profileChain());
  rpcMock.mockReset();
});

describe('userManagementService.updateUser audit integrity', () => {
  const patch = {
    full_name: 'New',
    role: 'admin' as const,
    phone: '123',
    is_active: true,
  };

  it('surfaces a DB-level audit RPC failure instead of returning success', async () => {
    // supabase-js resolves (never throws) with { error } on a Postgres-level failure.
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'audit denied' } });
    const result = await userManagementService.updateUser('u-1', patch);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/audit denied/);
  });

  it('returns success when the audit write succeeds', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await userManagementService.updateUser('u-1', patch);
    expect(result.success).toBe(true);
  });
});
