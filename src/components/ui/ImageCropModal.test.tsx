import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-easy-crop', () => ({ default: () => null }));

import { ImageCropModal } from './ImageCropModal';

describe('ImageCropModal', () => {
  it('renders the crop dialog with labelled zoom controls and range input', () => {
    render(<ImageCropModal isOpen onClose={() => {}} imageUrl="blob:x" onCropComplete={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Crop Image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
  });
});
