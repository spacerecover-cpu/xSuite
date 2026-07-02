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
  options?: { id: string; name: string; keywords?: string }[];
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

describe('SearchableSelect keywords', () => {
  const CUSTOMER_OPTIONS = [
    { id: '1', name: 'Kashif Rahat (CUST-0001)', keywords: 'kashif@x.com +96899112233' },
    { id: '2', name: 'Sara Ali (CUST-0002)', keywords: 'sara@y.com +96877445566' },
  ];

  it('matches options by hidden keywords (phone/email), not just the label', async () => {
    const user = userEvent.setup();
    render(<Harness options={CUSTOMER_OPTIONS} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), '99112233');
    expect(screen.getByRole('option', { name: /Kashif Rahat/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Sara Ali/ })).toBeNull();
  });

  it('still matches by the visible label', async () => {
    const user = userEvent.setup();
    render(<Harness options={CUSTOMER_OPTIONS} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'sara');
    expect(screen.getByRole('option', { name: /Sara Ali/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Kashif/ })).toBeNull();
  });
});

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

  it('hides the clear X for a required field even when a value is selected', () => {
    render(
      <SearchableSelect
        label="Fruit"
        value="a"
        onChange={() => {}}
        options={OPTIONS}
        required
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
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

  describe('RTL logical utilities (Phase 4a proof slice)', () => {
    it('required asterisk uses logical ms-1, not physical ml-1', () => {
      render(
        <SearchableSelect label="Fruit" value="" onChange={() => {}} options={OPTIONS} required />,
      );
      const asterisk = screen.getByText('*');
      expect(asterisk.className).toContain('ms-1');
      expect(asterisk.className).not.toContain('ml-1');
    });

    it('search input uses logical ps-8 pe-3 leading padding, not pl-8 pr-3', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('combobox'));
      const search = screen.getByPlaceholderText('Search...');
      expect(search.className).toContain('ps-8');
      expect(search.className).toContain('pe-3');
      expect(search.className).not.toContain('pl-8');
      expect(search.className).not.toContain('pr-3');
    });

    it('search icon anchors to the logical start-2.5, not left-2.5', async () => {
      const user = userEvent.setup();
      const { container } = render(<Harness />);
      await user.click(screen.getByRole('combobox'));
      const icon = container.querySelector('svg.lucide-search') as SVGElement;
      expect(icon.getAttribute('class')).toContain('start-2.5');
      expect(icon.getAttribute('class')).not.toContain('left-2.5');
    });

    it('the add-new button uses logical text-start, not physical text-left', async () => {
      const user = userEvent.setup();
      render(
        <SearchableSelect
          label="Fruit"
          value=""
          onChange={() => {}}
          options={OPTIONS}
          onAddNew={() => {}}
          addNewLabel="Add fruit"
        />,
      );
      await user.click(screen.getByRole('combobox'));
      const addBtn = screen.getByRole('button', { name: /add fruit/i });
      expect(addBtn.className).toContain('text-start');
      expect(addBtn.className).not.toContain('text-left');
    });
  });
});
