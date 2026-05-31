import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Settings"><p>body</p></Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a labelled dialog with the title wired to aria-labelledby', () => {
    render(<Modal isOpen onClose={() => {}} title="Settings"><p>body</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('with empty title renders no header but keeps a labelled floating close button', () => {
    render(<Modal isOpen onClose={() => {}} title=""><p>body</p></Modal>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('hides every close button when showCloseButton is false', () => {
    render(<Modal isOpen onClose={() => {}} title="Forced" showCloseButton={false}><p>body</p></Modal>);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('applies the wide maxWidth class to the panel (overrides Dialog default)', () => {
    render(<Modal isOpen onClose={() => {}} title="Wide" maxWidth="7xl"><p>body</p></Modal>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-7xl');
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-lg');
  });

  it('maps the non-standard size="large" to max-w-4xl', () => {
    render(<Modal isOpen onClose={() => {}} title="Lg" size="large"><p>body</p></Modal>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-4xl');
  });

  it('calls onClose from the header close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal isOpen onClose={onClose} title="X"><p>body</p></Modal>);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops headerAction when title is empty (preserves the no-header contract)', () => {
    render(<Modal isOpen onClose={() => {}} title="" headerAction={<button>Download</button>}><p>body</p></Modal>);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('calls onClose from the floating close button when there is no title', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal isOpen onClose={onClose} title=""><p>body</p></Modal>);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
