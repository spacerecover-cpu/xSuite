import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
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

  it('with empty title renders no header and no floating control (X pattern removed)', () => {
    render(<Modal isOpen onClose={() => {}} title=""><p>body</p></Modal>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('never renders a top-right X close control (removed platform-wide)', () => {
    render(<Modal isOpen onClose={() => {}} title="Forced"><p>body</p></Modal>);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('renders a pinned footer region (border-t) when footer is provided', () => {
    render(
      <Modal isOpen onClose={() => {}} title="X" footer={<button>Done</button>}>
        <p>body</p>
      </Modal>,
    );
    const done = screen.getByRole('button', { name: 'Done' });
    expect((done.parentElement as HTMLElement).className).toContain('border-t');
    expect((done.parentElement as HTMLElement).className).toContain('shrink-0');
  });

  it('omits the footer region when footer is absent', () => {
    render(<Modal isOpen onClose={() => {}} title="X"><p>body</p></Modal>);
    expect(screen.getByRole('dialog').querySelector('.border-t.shrink-0')).toBeNull();
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

  it('calls onClose from a consumer footer button (the standard dismissal path)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="X" footer={<button onClick={onClose}>Close</button>}>
        <p>body</p>
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops headerAction when title is empty (preserves the no-header contract)', () => {
    render(<Modal isOpen onClose={() => {}} title="" headerAction={<button>Download</button>}><p>body</p></Modal>);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('closes on backdrop click by default (behavior preserved)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal isOpen onClose={onClose} title="X"><p>body</p></Modal>);
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on backdrop click when closeOnBackdrop is false', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal isOpen onClose={onClose} title="X" closeOnBackdrop={false}><p>body</p></Modal>);
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('redirects initial focus to initialFocusRef', () => {
    const inputRef = createRef<HTMLInputElement>();
    render(
      <Modal isOpen onClose={() => {}} title="X" initialFocusRef={inputRef}>
        <input ref={inputRef} aria-label="first field" />
      </Modal>,
    );
    expect(inputRef.current).toHaveFocus();
  });

  describe('RTL logical utilities (Phase 4a proof slice)', () => {
    it('headerBadges wrapper uses logical ms-2 gap, not physical ml-2', () => {
      render(
        <Modal isOpen onClose={() => {}} title="X" headerBadges={<span data-testid="badge">B</span>}>
          <p>body</p>
        </Modal>,
      );
      const wrapper = screen.getByTestId('badge').parentElement as HTMLElement;
      expect(wrapper.className).toContain('ms-2');
      expect(wrapper.className).not.toContain('ml-2');
    });

  });
});
