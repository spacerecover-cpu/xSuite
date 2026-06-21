import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('associates the label with the textarea via htmlFor/id (getByLabelText works)', () => {
    render(<Textarea label="Notes" />);
    const textarea = screen.getByLabelText('Notes');
    const label = screen.getByText('Notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', textarea.id);
    expect(textarea.id).toBeTruthy();
  });

  it('wires aria-invalid and aria-describedby to the error message when error is present', () => {
    render(<Textarea label="Notes" error="Required field" />);
    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText('Required field');
    expect(error).toHaveAttribute('role', 'alert');
    expect(textarea).toHaveAttribute('aria-describedby', error.id);
    expect(error).toHaveClass('text-danger');
    expect(textarea.className).toContain('border-danger');
  });

  it('wires aria-describedby to the hint when hint is present', () => {
    render(<Textarea label="Notes" hint="Keep it brief" />);
    const textarea = screen.getByLabelText('Notes');
    const hint = screen.getByText('Keep it brief');
    expect(textarea).toHaveAttribute('aria-describedby', hint.id);
    expect(hint).toHaveClass('text-slate-500');
  });

  it('joins hint and error ids in aria-describedby when both are present', () => {
    render(<Textarea label="Notes" hint="Hint text" error="Error text" />);
    const textarea = screen.getByLabelText('Notes');
    const hint = screen.getByText('Hint text');
    const error = screen.getByText('Error text');
    const describedBy = textarea.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(hint.id);
    expect(describedBy.split(' ')).toContain(error.id);
  });

  it('emits no aria-* for the bare RHF shape (no label/error/hint)', () => {
    const { container } = render(<Textarea placeholder="rhf" />);
    expect(container.querySelector('label')).toBeNull();
    const textarea = screen.getByPlaceholderText('rhf');
    expect(textarea).not.toHaveAttribute('aria-invalid');
    expect(textarea).not.toHaveAttribute('aria-describedby');
    expect(textarea).not.toHaveAttribute('aria-required');
  });

  it('lets a caller-supplied id win over the generated field id', () => {
    render(<Textarea label="Notes" id="custom-id" />);
    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveAttribute('id', 'custom-id');
    expect(screen.getByText('Notes')).toHaveAttribute('for', 'custom-id');
  });

  it('sets aria-required and marks the asterisk aria-hidden when required', () => {
    const { container } = render(<Textarea label="Notes" required />);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies the default rows and lets callers override', () => {
    const { rerender } = render(<Textarea label="Notes" />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '4');
    rerender(<Textarea label="Notes" rows={8} />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '8');
  });

  it('forwards the ref to the underlying textarea element', () => {
    let captured: HTMLTextAreaElement | null = null;
    render(
      <Textarea
        label="Notes"
        ref={(el) => {
          captured = el;
        }}
      />
    );
    expect(captured).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('lands className on the textarea element', () => {
    render(<Textarea label="Notes" className="custom-class" />);
    expect(screen.getByLabelText('Notes')).toHaveClass('custom-class');
  });
});
