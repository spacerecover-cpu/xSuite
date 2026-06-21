import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { HeaderSlotProvider, useHeaderSlot, usePageHeaderSlot } from './HeaderSlotContext';

function TitleProbe() { const { title } = useHeaderSlot(); return <div data-testid="probe">{title ?? 'FALLBACK'}</div>; }
function HostSetter() {
  const { setActionsHost } = useHeaderSlot();
  return <div data-testid="host" ref={setActionsHost} />;
}
function Register({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return usePageHeaderSlot({ title, actions });
}

describe('HeaderSlot', () => {
  it('registers title and clears on unmount', () => {
    const { rerender } = render(
      <HeaderSlotProvider><TitleProbe /><Register title="Stock Categories" /></HeaderSlotProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Stock Categories');
    rerender(<HeaderSlotProvider><TitleProbe /></HeaderSlotProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('FALLBACK');
  });

  it('portals actions into the host', () => {
    render(
      <HeaderSlotProvider>
        <HostSetter />
        <Register title="Invoices" actions={<button>Create Invoice</button>} />
      </HeaderSlotProvider>,
    );
    const host = screen.getByTestId('host');
    expect(host).toContainElement(screen.getByRole('button', { name: 'Create Invoice' }));
  });

  it('leaves title undefined when no page registers (backward compatible)', () => {
    render(<HeaderSlotProvider><TitleProbe /></HeaderSlotProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('FALLBACK');
  });
});
