import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Regression: marking a contact primary left the previous primary contact
// flagged too, so a supplier could show two "Primary" badges at once.
// ---------------------------------------------------------------------------

interface UpdateCall { table: string; payload: Record<string, unknown>; filters: [string, unknown][] }

const updateCalls: UpdateCall[] = [];
const insertPayloads: Record<string, unknown>[] = [];

vi.mock('../../lib/supabaseClient', () => {
  const makeChain = (table: string) => {
    const call: UpdateCall = { table, payload: {}, filters: [] };
    const chain: Record<string, unknown> = {};
    const track = (name: string) => vi.fn((col: string, val: unknown) => {
      call.filters.push([`${name}:${col}`, val]);
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      call.payload = payload;
      updateCalls.push(call);
      return chain;
    });
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayloads.push(payload);
      return chain;
    });
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'contact-new' }, error: null }));
    chain.eq = track('eq');
    chain.neq = track('neq');
    chain.is = track('is');
    // The update chain is awaited directly (no .maybeSingle()).
    chain.then = (onFulfilled: (r: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })) },
    },
    resolveTenantId: vi.fn(async () => 'tenant-1'),
  };
});

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import ContactFormModal from './ContactFormModal';

beforeEach(() => {
  updateCalls.length = 0;
  insertPayloads.length = 0;
});

const renderModal = (contact?: { id: string; name: string; email: string }) =>
  render(
    <ContactFormModal
      isOpen
      onClose={() => {}}
      onSuccess={() => {}}
      supplierId="sup-1"
      contact={contact ?? null}
    />,
  );

const submit = () => fireEvent.submit(screen.getByRole('button', { name: /contact/i }).closest('form')!);

// The sibling demotion is the only write scoped by supplier_id rather than by
// the edited contact's own id.
const demotion = () =>
  updateCalls.find(
    (c) =>
      c.table === 'supplier_contacts' &&
      c.payload.is_primary === false &&
      c.filters.some(([f]) => f === 'neq:id'),
  );

describe('ContactFormModal primary contact', () => {
  it('demotes the supplier\'s other primary contacts when editing one to primary', async () => {
    renderModal({ id: 'contact-1', name: 'Jane', email: 'jane@example.com' });

    fireEvent.click(screen.getByRole('checkbox'));
    submit();

    await waitFor(() => expect(demotion()).toBeDefined());
    expect(demotion()!.filters).toEqual(
      expect.arrayContaining([
        ['eq:supplier_id', 'sup-1'],
        ['eq:is_primary', true],
        ['neq:id', 'contact-1'],
        ['is:deleted_at', null],
      ]),
    );
  });

  it('demotes the previous primary when adding a new primary contact', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'bob@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    submit();

    await waitFor(() => expect(insertPayloads).toHaveLength(1));
    await waitFor(() => expect(demotion()).toBeDefined());
    // The freshly inserted row must be excluded from the demotion.
    expect(demotion()!.filters).toContainEqual(['neq:id', 'contact-new']);
  });

  it('leaves other contacts untouched when the primary box is not checked', async () => {
    renderModal({ id: 'contact-1', name: 'Jane', email: 'jane@example.com' });

    submit();

    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(demotion()).toBeUndefined();
  });
});
