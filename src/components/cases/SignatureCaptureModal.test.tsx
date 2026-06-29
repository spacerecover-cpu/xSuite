import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignatureCaptureModal } from './SignatureCaptureModal';

describe('SignatureCaptureModal', () => {
  it('captures a typed signature', () => {
    const onCapture = vi.fn();
    render(<SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={onCapture} />);
    // default method = typed: type a name, confirm
    fireEvent.change(screen.getByLabelText(/type your name/i), { target: { value: 'Tech A' } });
    fireEvent.click(screen.getByRole('button', { name: /apply signature/i }));
    expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ method: 'typed', typedValue: 'Tech A' }));
  });

  it('captures a click-to-accept signature', () => {
    const onCapture = vi.fn();
    render(<SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={onCapture} />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i })); // switch to Accept method
    fireEvent.click(screen.getByLabelText(/i confirm/i));
    fireEvent.click(screen.getByRole('button', { name: /apply signature/i }));
    expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ method: 'click_to_accept' }));
  });

  it('renders only the allowed methods when allowedMethods is set', () => {
    render(<SignatureCaptureModal open onClose={vi.fn()} title="Sign" onCapture={vi.fn()} allowedMethods={['typed', 'click_to_accept']} />);
    expect(screen.getByRole('button', { name: /type/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /draw/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
  });

  it('resets to Typed method and empty inputs after close and re-open', () => {
    const { rerender } = render(
      <SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={vi.fn()} />,
    );

    // Switch to Accept and fill some state
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(screen.queryByLabelText(/type your name/i)).toBeNull(); // Accept panel is showing

    // Close the modal
    rerender(
      <SignatureCaptureModal open={false} onClose={vi.fn()} title="Approver signature" onCapture={vi.fn()} />,
    );

    // Re-open — method should be reset to Typed, typed input should be present and empty
    rerender(
      <SignatureCaptureModal open onClose={vi.fn()} title="Approver signature" onCapture={vi.fn()} />,
    );
    const input = screen.getByLabelText(/type your name/i);
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe('');
  });
});
