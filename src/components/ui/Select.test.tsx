import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './Select';

describe('Select', () => {
  it('associates the label with the select via htmlFor/id (getByLabelText works)', () => {
    render(<Select label="Priority" options={[{ value: 'high', label: 'High' }]} />);
    const select = screen.getByLabelText('Priority');
    const label = screen.getByText('Priority');
    expect(select.tagName).toBe('SELECT');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', select.id);
    expect(select.id).toBeTruthy();
  });

  it('renders declarative options', () => {
    render(
      <Select
        label="Priority"
        options={[
          { value: 'high', label: 'High' },
          { value: 'low', label: 'Low' },
        ]}
      />
    );
    expect(screen.getByRole('option', { name: 'High' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Low' })).toBeInTheDocument();
  });

  it('renders children when provided (taking precedence over options)', () => {
    render(
      <Select label="Priority">
        <option value="urgent">Urgent</option>
      </Select>
    );
    expect(screen.getByRole('option', { name: 'Urgent' })).toBeInTheDocument();
  });

  it('renders a disabled placeholder option', () => {
    render(<Select label="Priority" placeholder="Choose one" options={[{ value: 'a', label: 'A' }]} />);
    const placeholder = screen.getByRole('option', { name: 'Choose one' }) as HTMLOptionElement;
    expect(placeholder.disabled).toBe(true);
    expect(placeholder.value).toBe('');
  });

  it('wires aria-invalid and aria-describedby to the error message when error is present', () => {
    render(<Select label="Priority" error="Required field" options={[{ value: 'a', label: 'A' }]} />);
    const select = screen.getByLabelText('Priority');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText('Required field');
    expect(error).toHaveAttribute('role', 'alert');
    expect(select).toHaveAttribute('aria-describedby', error.id);
    expect(error).toHaveClass('text-danger');
    expect(select.className).toContain('border-danger');
  });

  it('wires aria-describedby to the hint when hint is present', () => {
    render(<Select label="Priority" hint="Pick the urgency" options={[{ value: 'a', label: 'A' }]} />);
    const select = screen.getByLabelText('Priority');
    const hint = screen.getByText('Pick the urgency');
    expect(select).toHaveAttribute('aria-describedby', hint.id);
    expect(hint).toHaveClass('text-slate-500');
  });

  it('emits no aria-* for the bare RHF shape (no label/error/hint)', () => {
    const { container } = render(
      <Select aria-label="bare" options={[{ value: 'a', label: 'A' }]} />
    );
    expect(container.querySelector('label')).toBeNull();
    const select = screen.getByLabelText('bare');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
    expect(select).not.toHaveAttribute('aria-required');
  });

  it('lets a caller-supplied id win over the generated field id', () => {
    render(<Select label="Priority" id="custom-id" options={[{ value: 'a', label: 'A' }]} />);
    const select = screen.getByLabelText('Priority');
    expect(select).toHaveAttribute('id', 'custom-id');
    expect(screen.getByText('Priority')).toHaveAttribute('for', 'custom-id');
  });

  it('sets aria-required and marks the asterisk aria-hidden when required', () => {
    const { container } = render(
      <Select label="Priority" required options={[{ value: 'a', label: 'A' }]} />
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards the ref to the underlying select element', () => {
    let captured: HTMLSelectElement | null = null;
    render(
      <Select
        label="Priority"
        options={[{ value: 'a', label: 'A' }]}
        ref={(el) => {
          captured = el;
        }}
      />
    );
    expect(captured).toBeInstanceOf(HTMLSelectElement);
  });
});
