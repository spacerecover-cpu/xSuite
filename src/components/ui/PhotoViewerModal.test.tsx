import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoViewerModal } from './PhotoViewerModal';

describe('PhotoViewerModal', () => {
  it('renders a labelled lightbox with a darker scrim and raised z-index', () => {
    render(<PhotoViewerModal isOpen onClose={() => {}} imageUrl="/x.jpg" altText="Jane profile photo" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Jane profile photo');
    expect(screen.getByTestId('dialog-backdrop')).toHaveClass('bg-black/90');
    expect(screen.getByTestId('dialog-overlay')).toHaveClass('z-[60]');
  });

  it('shows the image and does not close when the image is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PhotoViewerModal isOpen onClose={onClose} imageUrl="/x.jpg" altText="Photo" />);
    await user.click(screen.getByRole('img', { name: 'Photo' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<PhotoViewerModal isOpen={false} onClose={() => {}} imageUrl="/x.jpg" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
