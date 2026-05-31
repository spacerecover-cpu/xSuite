import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Dialog open={false} onClose={() => {}} label="Test"><p>body</p></Dialog>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('portals a labelled modal dialog to the body when open', () => {
    render(<Dialog open onClose={() => {}} label="Settings"><p>body</p></Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Settings');
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('moves focus into the dialog on open', () => {
    render(<Dialog open onClose={() => {}} label="Test"><button>confirm</button></Dialog>);
    expect(screen.getByText('confirm')).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Dialog open onClose={onClose} label="Test"><button>ok</button></Dialog>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on backdrop click when closeOnBackdrop is true', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Dialog open onClose={onClose} label="Test"><button>ok</button></Dialog>);
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = render(<Dialog open onClose={() => {}} label="Test"><p>b</p></Dialog>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Dialog open={false} onClose={() => {}} label="Test"><p>b</p></Dialog>);
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape closes only the topmost of stacked dialogs', async () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <Dialog open onClose={onCloseA} label="A"><button>a-btn</button></Dialog>
        <Dialog open onClose={onCloseB} label="B"><button>b-btn</button></Dialog>
      </>,
    );
    await user.keyboard('{Escape}');
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();
    rerender(<></>); // unmount both so module state stays balanced
  });

  it('keeps body scroll locked until the last stacked dialog closes', () => {
    const { rerender } = render(
      <>
        <Dialog open onClose={() => {}} label="A"><p>a</p></Dialog>
        <Dialog open onClose={() => {}} label="B"><p>b</p></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <>
        <Dialog open onClose={() => {}} label="A"><p>a</p></Dialog>
        <Dialog open={false} onClose={() => {}} label="B"><p>b</p></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <>
        <Dialog open={false} onClose={() => {}} label="A"><p>a</p></Dialog>
        <Dialog open={false} onClose={() => {}} label="B"><p>b</p></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('applies overlayClassName to the outer wrapper (z-index override wins)', () => {
    render(<Dialog open onClose={() => {}} label="T" overlayClassName="z-[60]"><button>x</button></Dialog>);
    const wrapper = screen.getByTestId('dialog-overlay');
    expect(wrapper).toHaveClass('z-[60]');
    expect(wrapper).not.toHaveClass('z-50');
  });

  it('applies backdropClassName, overriding the default scrim', () => {
    render(<Dialog open onClose={() => {}} label="T" backdropClassName="bg-black/90 backdrop-blur-sm"><button>x</button></Dialog>);
    const backdrop = screen.getByTestId('dialog-backdrop');
    expect(backdrop).toHaveClass('bg-black/90', 'backdrop-blur-sm');
    expect(backdrop).not.toHaveClass('bg-black/50');
  });
});
