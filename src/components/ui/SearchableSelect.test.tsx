import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SearchableSelect } from './SearchableSelect';

const OPTIONS = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Cherry' },
];

const MULTIWORD_OPTIONS = [
  { id: 'hd', name: 'Hard Drive' },
  { id: 'ssd', name: 'Solid State Drive' },
  { id: 'usb', name: 'USB Stick' },
];

function Harness({
  initial = '',
  onChangeSpy,
  usePortal = false,
  placeholder,
  options = OPTIONS,
}: {
  initial?: string;
  onChangeSpy?: (v: string) => void;
  usePortal?: boolean;
  placeholder?: string;
  options?: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchableSelect
      label="Fruit"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
      options={options}
      usePortal={usePortal}
      placeholder={placeholder}
    />
  );
}

describe('SearchableSelect', () => {
  it('renders a combobox trigger and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders option rows with aria-selected on the selected option', async () => {
    const user = userEvent.setup();
    render(<Harness initial="b" />);
    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(OPTIONS.length);
    const selected = screen.getByRole('option', { name: 'Banana' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    const unselected = screen.getByRole('option', { name: 'Apple' });
    expect(unselected).toHaveAttribute('aria-selected', 'false');
  });

  it('keyboard select commits via onChange, closes, and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{ArrowDown}'); // open
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}'); // highlight first option
    await user.keyboard('{Enter}'); // select first option
    expect(onChangeSpy).toHaveBeenCalledWith('a');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('renders exactly one search input in the inline (non-portal) branch', async () => {
    const user = userEvent.setup();
    render(<Harness usePortal={false} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByPlaceholderText('Search...').length).toBe(1);
  });

  it('renders exactly one search input in the portal branch (de-dup)', async () => {
    const user = userEvent.setup();
    render(<Harness usePortal />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByPlaceholderText('Search...').length).toBe(1);
  });

  it('gives the clear X an accessible name', async () => {
    const user = userEvent.setup();
    render(<Harness initial="a" />);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    // sanity: clearing fires onChange('') — not asserted here, just presence of the labeled control
    await user.click(screen.getByRole('combobox'));
  });

  it('uses the t() default placeholder but lets a placeholder prop override it', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
    rerender(<Harness placeholder="Pick a fruit" />);
    expect(screen.getByText('Pick a fruit')).toBeInTheDocument();
  });

  it('lets a literal Space be typed into the search filter (no preventDefault swallow)', async () => {
    const user = userEvent.setup();
    render(<Harness options={MULTIWORD_OPTIONS} />);
    await user.click(screen.getByRole('combobox'));
    const search = screen.getByPlaceholderText('Search...');
    await user.type(search, 'hard d');
    expect(search).toHaveValue('hard d');
    // the multi-word filter actually narrows to the intended option
    expect(screen.getByRole('option', { name: 'Hard Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'USB Stick' })).not.toBeInTheDocument();
  });

  it('restores focus to the trigger when closed by an outside click', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <div data-testid="outside">outside</div>
      </>
    );
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByTestId('outside'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
