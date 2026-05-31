import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

describe('stacked overlays', () => {
  it('Escape closes the topmost (ConfirmDialog) not the underlying Modal, and keeps body scroll locked', async () => {
    const onCloseModal = vi.fn();
    const onCloseConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Modal isOpen onClose={onCloseModal} title="Parent"><p>parent body</p></Modal>
        <ConfirmDialog isOpen onClose={onCloseConfirm} onConfirm={() => {}} title="Sure?" message="Confirm." />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(onCloseConfirm).toHaveBeenCalledTimes(1);
    expect(onCloseModal).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden'); // parent Modal still open
  });
});
