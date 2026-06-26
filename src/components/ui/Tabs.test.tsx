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
  });
});
