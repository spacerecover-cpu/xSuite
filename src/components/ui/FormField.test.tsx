import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './FormField';

describe('FormField (render-prop)', () => {
  it('passes controlProps to the render-prop and associates the label via htmlFor/id', () => {
    render(
      <FormField label="Email">
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    const input = screen.getByPlaceholderText('email-input');
    const label = screen.getByText('Email');
    expect(label.tagName).toBe('LABEL');
    expect(input.id).toBeTruthy();
    expect(label).toHaveAttribute('for', input.id);
  });

  it('lets a caller-supplied id win as the control id', () => {
    render(
      <FormField label="Email" id="custom-field">
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    const input = screen.getByPlaceholderText('email-input');
    expect(input).toHaveAttribute('id', 'custom-field');
    expect(screen.getByText('Email')).toHaveAttribute('for', 'custom-field');
  });

  it('renders the error with role="alert" and wires aria-invalid + aria-describedby', () => {
    render(
      <FormField label="Email" error="Required field">
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    const input = screen.getByPlaceholderText('email-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText('Required field');
    expect(error).toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('renders the hint and wires aria-describedby when there is no error', () => {
    render(
      <FormField label="Email" hint="We never share it">
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    const input = screen.getByPlaceholderText('email-input');
    const hint = screen.getByText('We never share it');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
  });

  it('hides the hint when an error is present', () => {
    render(
      <FormField label="Email" hint="Hint text" error="Error text">
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    expect(screen.queryByText('Hint text')).toBeNull();
    expect(screen.getByText('Error text')).toBeInTheDocument();
  });

  it('sets aria-required and marks the asterisk aria-hidden when required', () => {
    render(
      <FormField label="Email" required>
        {(c) => <input {...c} placeholder="email-input" />}
      </FormField>
    );
    const input = screen.getByPlaceholderText('email-input');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes a label id so a group child can associate via aria-labelledby', () => {
    render(
      <FormField label="Color">
        {(c) => (
          <div
            role="group"
            aria-labelledby={c['aria-labelledby']}
            aria-describedby={c['aria-describedby']}
          >
            <button>swatch</button>
          </div>
        )}
      </FormField>
    );
    const label = screen.getByText('Color');
    expect(label.id).toBeTruthy();
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-labelledby', label.id);
  });

  it('forwards the ref to the root div', () => {
    let captured: HTMLDivElement | null = null;
    render(
      <FormField label="Email" ref={(el) => { captured = el; }}>
        {(c) => <input {...c} />}
      </FormField>
    );
    expect(captured).toBeInstanceOf(HTMLDivElement);
  });

  it('RTL: required asterisk uses logical ms-0.5, not physical ml-0.5', () => {
    render(
      <FormField label="Email" required>
        {(c) => <input {...c} />}
      </FormField>
    );
    const asterisk = screen.getByText('*');
    expect(asterisk.className).toContain('ms-0.5');
    expect(asterisk.className).not.toContain('ml-0.5');
  });
});
