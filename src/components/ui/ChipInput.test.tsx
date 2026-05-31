import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ChipInput } from './ChipInput';

function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return <ChipInput label="CC" value={value} onChange={setValue} />;
}

describe('ChipInput', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<Harness />);
    const input = screen.getByLabelText('CC');
    const label = screen.getByText('CC');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
    expect(input.id).toBeTruthy();
  });

  it('adds an email via Enter and renders a chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('CC');
    await user.type(input, 'user@example.com{Enter}');
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('removes a chip when its remove button is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['user@example.com']} />);
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: 'Remove user@example.com' });
    await user.click(removeBtn);
    expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
  });

  it('sets aria-invalid when an invalid email is entered (internal validation)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('CC');
    await user.type(input, 'not-an-email{Enter}');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Please enter a valid email address')).toHaveAttribute('role', 'alert');
  });

  it('gives the chip remove button an accessible name', () => {
    render(<Harness initial={['a@b.com']} />);
    const removeBtn = screen.getByRole('button', { name: 'Remove a@b.com' });
    expect(removeBtn).toBeInTheDocument();
  });

  it('RTL: required asterisk uses logical ms-1, not physical ml-1', () => {
    render(<ChipInput label="CC" value={[]} onChange={() => {}} required />);
    const asterisk = screen.getByText('*');
    expect(asterisk.className).toContain('ms-1');
    expect(asterisk.className).not.toContain('ml-1');
  });
});
