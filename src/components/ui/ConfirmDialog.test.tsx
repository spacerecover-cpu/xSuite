import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

const base = { isOpen: true, onClose: vi.fn(), onConfirm: vi.fn(), title: 'Delete item?', message: 'This cannot be undone.' };

describe('ConfirmDialog', () => {
  it('labels the dialog by its title', () => {
    render(<ConfirmDialog {...base} />);
    const heading = screen.getByRole('heading', { name: 'Delete item?' });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('fires onConfirm and onClose from the right buttons', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onClose={onClose} confirmText="Delete" />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the processing label and blocks Escape while loading', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...base} onClose={onClose} isLoading confirmText="Delete" />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tints the confirm button with the danger tone tokens (via Button variant)', () => {
    render(<ConfirmDialog {...base} confirmText="Delete" variant="danger" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-danger', 'text-danger-foreground');
  });

  it('renders confirm and cancel at the same control size (Button md)', () => {
    render(<ConfirmDialog {...base} confirmText="Delete" />);
    const confirm = screen.getByRole('button', { name: 'Delete' });
    const cancel = screen.getByRole('button', { name: /cancel/i });
    for (const btn of [confirm, cancel]) {
      expect(btn).toHaveClass('text-sm', 'py-2.5', 'rounded-md');
    }
  });

  it('renders no top-right X close control (pattern removed platform-wide)', () => {
    render(<ConfirmDialog {...base} />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });
});
