import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, type TabDef } from './Tabs';

const tabs: TabDef[] = [
  { id: 'a', label: 'Alpha', colorToken: 'cat-1' },
  { id: 'b', label: 'Beta', colorToken: 'cat-2', hasError: true },
  { id: 'c', label: 'Gamma', disabled: true },
];

describe('Tabs', () => {
  it('renders a tablist with aria-selected on the active tab', () => {
    render(<Tabs tabs={tabs} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Alpha/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveAttribute('aria-selected', 'false');
  });
  it('calls onChange when a tab is clicked', async () => {
    const onChange = vi.fn(); const user = userEvent.setup();
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: /Beta/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
  it('does not fire onChange for a disabled tab', async () => {
    const onChange = vi.fn(); const user = userEvent.setup();
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: /Gamma/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('moves selection with ArrowRight (roving tabindex)', async () => {
    const onChange = vi.fn(); const user = userEvent.setup();
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    screen.getByRole('tab', { name: /Alpha/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveFocus();
  });

  it('defaults to the underline variant (border-b-2, no pill fill)', () => {
    render(<Tabs tabs={tabs} activeId="a" onChange={() => {}} />);
    const active = screen.getByRole('tab', { name: /Alpha/ });
    expect(active).toHaveClass('border-b-2');
    expect(active.className).toContain('border-cat-1');
    expect(active.className).not.toContain('bg-cat-1 ');
    expect(screen.getByRole('tablist')).toHaveClass('border-b');
  });

  it('pills variant renders an active solid fill with foreground ink and no underline', () => {
    const pillTabs: TabDef[] = [
      { id: 'a', label: 'Alpha', colorToken: 'primary' },
      { id: 'b', label: 'Beta', colorToken: 'cat-5' },
    ];
    render(<Tabs tabs={pillTabs} activeId="a" variant="pills" onChange={() => {}} />);
    const active = screen.getByRole('tab', { name: /Alpha/ });
    const inactive = screen.getByRole('tab', { name: /Beta/ });
    expect(active.className).toContain('bg-primary');
    expect(active.className).toContain('text-primary-foreground');
    expect(active.className).not.toContain('border-b-2');
    expect(inactive.className).toContain('bg-cat-5/10');
    expect(inactive.className).toContain('text-cat-5');
    expect(inactive.className).toContain('hover:bg-cat-5/15');
  });

  it('pills variant uses slate-900 ink on light/mid cat tones for AA on small labels', () => {
    // cat-5 (orange-600) active: white ink is ~3.56:1 (sub-AA), so it must use slate-900.
    const tones: TabDef[] = [
      { id: 'a', label: 'Orange', colorToken: 'cat-5' },
      { id: 'b', label: 'Lime', colorToken: 'cat-3' },
    ];
    render(<Tabs tabs={tones} activeId="a" variant="pills" onChange={() => {}} />);
    const active = screen.getByRole('tab', { name: /Orange/ });
    expect(active.className).toContain('text-slate-900');
    expect(active.className).not.toContain('text-white');
  });
});
