import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const OPTIONS = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Cherry' },
];

function Harness({
  initial = [],
  onChangeSpy,
  label = 'Fruit',
  placeholder,
}: {
  initial?: string[];
  onChangeSpy?: (v: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <MultiSelectDropdown
      label={label}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
      options={OPTIONS}
      placeholder={placeholder}
    />
  );
}

describe('MultiSelectDropdown', () => {
  it('exposes a focusable combobox trigger (the keyboard-unopenable defect is fixed)', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('opens the listbox when Enter is pressed on the focused trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens the listbox when ArrowDown is pressed on the focused trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
  });

  it('ArrowDown moves aria-activedescendant onto an option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // open
    expect(trigger).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}'); // highlight first option
    const active = trigger.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    const firstOption = screen.getByRole('option', { name: 'Apple' });
    expect(firstOption.id).toBe(active);
  });

  it('Enter on an active option toggles aria-selected and KEEPS the panel open', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // open
    await user.keyboard('{ArrowDown}'); // highlight Apple
    await user.keyboard('{Enter}'); // toggle Apple
    expect(onChangeSpy).toHaveBeenLastCalledWith(['a']);
    // panel stays open (multi)
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const apple = screen.getByRole('option', { name: 'Apple' });
    expect(apple).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the panel and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // open
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('with label="" renders no <label> element but names the trigger via aria-label', () => {
    const { container } = render(
      <Harness label="" placeholder="Select accessories..." />
    );
    expect(container.querySelector('label')).toBeNull();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAccessibleName('Select accessories...');
  });

  it('gives the chip remove button an accessible name', () => {
    render(<Harness initial={['a']} />);
    expect(
      screen.getByRole('button', { name: 'Remove Apple' })
    ).toBeInTheDocument();
  });
});
