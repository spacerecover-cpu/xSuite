import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { HeaderSlotProvider, useHeaderSlot, usePageHeaderSlot } from './HeaderSlotContext';

function TitleProbe() { const { header } = useHeaderSlot(); return <div data-testid="probe">{header.title ?? 'FALLBACK'}</div>; }
function IconProbe() { const { header } = useHeaderSlot(); return <div data-testid="icon-probe">{header.icon ? 'HAS_ICON' : 'NO_ICON'}:{header.iconColor ?? 'NO_COLOR'}</div>; }
function HostSetter() {
  const { setActionsHost } = useHeaderSlot();
  return <div data-testid="host" ref={setActionsHost} />;
}
function Register({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return usePageHeaderSlot({ title, actions });
}
// Module-scope stub so the icon reference is stable across renders (real consumers
// pass stable module-level lucide icons; an inline component would loop the effect).
const StubIcon: React.FC = () => <svg />;
function RegisterIcon() {
  return usePageHeaderSlot({ title: 'Devices', icon: StubIcon as never, iconColor: '#3b82f6' });
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

  it('registers an optional icon + colour and clears them on unmount', () => {
    const { rerender } = render(
      <HeaderSlotProvider><IconProbe /><RegisterIcon /></HeaderSlotProvider>,
    );
    expect(screen.getByTestId('icon-probe')).toHaveTextContent('HAS_ICON:#3b82f6');
    rerender(<HeaderSlotProvider><IconProbe /></HeaderSlotProvider>);
    expect(screen.getByTestId('icon-probe')).toHaveTextContent('NO_ICON:NO_COLOR');
  });
});
