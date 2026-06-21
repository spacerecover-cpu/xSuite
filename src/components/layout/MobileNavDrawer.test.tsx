import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNavDrawer } from './MobileNavDrawer';

// Stub the heavy Sidebar so the test focuses on the drawer mechanics; assert the
// drawer mounts it in `drawer` mode (no nav duplication).
vi.mock('./Sidebar', () => ({
  Sidebar: ({ mode }: { mode?: string }) => (
    <nav aria-label="Primary">
      <a href="/cases">Cases</a>
      <span data-testid="sidebar-mode">{mode}</span>
    </nav>
  ),
}));

describe('MobileNavDrawer', () => {
  it('renders the Sidebar in drawer mode when open', () => {
    render(<MobileNavDrawer isOpen onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-mode')).toHaveTextContent('drawer');
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MobileNavDrawer isOpen onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn();
    render(<MobileNavDrawer isOpen onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    const scrim = dialog.parentElement!.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the panel inert and out of the a11y tree when closed', () => {
    render(<MobileNavDrawer isOpen={false} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu', hidden: true });
    expect(dialog).toHaveAttribute('inert');
  });
});
