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

  it('tints the confirm button with the danger tone tokens', () => {
    render(<ConfirmDialog {...base} confirmText="Delete" variant="danger" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-danger', 'text-danger-foreground');
  });
});
