import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    const label = screen.getByText('Email');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
    expect(input.id).toBeTruthy();
  });

  it('wires aria-invalid and aria-describedby to the error message when error is present', () => {
    render(<Input label="Email" error="Required field" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText('Required field');
    expect(error).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(error).toHaveClass('text-danger');
  });

  it('wires aria-describedby to the hint when hint is present', () => {
    render(<Input label="Email" hint="We will never share it" />);
    const input = screen.getByLabelText('Email');
    const hint = screen.getByText('We will never share it');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
    expect(hint).toHaveClass('text-slate-500');
  });

  it('joins hint and error ids in aria-describedby when both are present', () => {
    render(<Input label="Email" hint="Hint text" error="Error text" />);
    const input = screen.getByLabelText('Email');
    const hint = screen.getByText('Hint text');
    const error = screen.getByText('Error text');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(hint.id);
    expect(describedBy.split(' ')).toContain(error.id);
  });

  it('renders no internal label/error and emits no aria-* for the RHF shape (no label/error)', () => {
    const { container } = render(<Input placeholder="rhf" />);
    expect(container.querySelector('label')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
    const input = screen.getByPlaceholderText('rhf');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-required');
  });

  it('lets a caller-supplied id win over the generated field id', () => {
    render(<Input label="Email" id="custom-id" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'custom-id');
    expect(screen.getByText('Email')).toHaveAttribute('for', 'custom-id');
  });

  it('forwards the ref to the underlying input element', () => {
    let captured: HTMLInputElement | null = null;
    render(<Input label="Email" ref={(el) => { captured = el; }} />);
    expect(captured).toBeInstanceOf(HTMLInputElement);
  });

  it('lands className on the input element', () => {
    render(<Input label="Email" className="custom-class" />);
    expect(screen.getByLabelText('Email')).toHaveClass('custom-class');
  });

  it('marks the required asterisk aria-hidden and sets aria-required', () => {
    const { container } = render(<Input label="Email" required />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-required', 'true');
    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveAttribute('aria-hidden', 'true');
  });
});
