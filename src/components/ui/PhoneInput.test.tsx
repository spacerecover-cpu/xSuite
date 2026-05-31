import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { PhoneInput, type PhoneCountry } from './PhoneInput';

const COUNTRIES: PhoneCountry[] = [
  { id: 'us', name: 'United States', code: 'US', phone_code: '+1' },
  { id: 'gb', name: 'United Kingdom', code: 'GB', phone_code: '+44' },
  { id: 'ae', name: 'United Arab Emirates', code: 'AE', phone_code: '+971' },
];

function Harness({
  label = 'Phone',
  initial = '',
  onChangeSpy,
}: {
  label?: string;
  initial?: string;
  onChangeSpy?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput
      label={label}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
      countries={COUNTRIES}
    />
  );
}

describe('PhoneInput', () => {
  it('renders a combobox trigger with the WAI-ARIA combobox attributes', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening the picker exposes a listbox with option rows', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBe(COUNTRIES.length);
  });

  it('associates the label with the tel input via htmlFor/id', () => {
    render(<Harness label="Mobile" />);
    const telInput = screen.getByLabelText('Mobile');
    expect(telInput).toHaveAttribute('type', 'tel');
    const label = screen.getByText('Mobile');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', telInput.id);
    expect(telInput.id).toBeTruthy();
  });

  it('forwards the ref to the tel input', () => {
    function RefHarness() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <>
          <PhoneInput
            ref={ref}
            label="Phone"
            value=""
            onChange={() => {}}
            countries={COUNTRIES}
          />
          <button type="button" onClick={() => ref.current?.setAttribute('data-touched', 'yes')}>
            touch
          </button>
        </>
      );
    }
    render(<RefHarness />);
    const telInput = screen.getByLabelText('Phone');
    expect(telInput).toHaveAttribute('type', 'tel');
    // Prove the same node is the forwarded ref by mutating it via the ref.
    screen.getByText('touch').click();
    expect(telInput).toHaveAttribute('data-touched', 'yes');
  });

  it('preserves the dial-code round-trip: selecting a country builds +<code> via onChange', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('combobox'));
    const ukOption = screen.getByRole('option', { name: /United Kingdom/ });
    await user.click(ukOption);
    expect(onChangeSpy).toHaveBeenCalledWith('+44');
  });

  it('round-trips an existing dial code: typing a local number appends to the parsed dial code', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness initial="+44" onChangeSpy={onChangeSpy} />);
    const telInput = screen.getByLabelText('Phone');
    await user.type(telInput, '7');
    expect(onChangeSpy).toHaveBeenLastCalledWith('+44 7');
  });

  describe('RTL logical utilities (Phase 4a proof slice)', () => {
    it('required asterisk uses logical ms-1, not physical ml-1', () => {
      render(
        <PhoneInput label="Phone" value="" onChange={() => {}} countries={COUNTRIES} required />,
      );
      const asterisk = screen.getByText('*');
      expect(asterisk.className).toContain('ms-1');
      expect(asterisk.className).not.toContain('ml-1');
    });

    it('country-code button uses the logical inline-end divider border-e, not physical border-r', () => {
      render(<Harness />);
      const trigger = screen.getByRole('combobox');
      expect(trigger.className).toContain('border-e');
      expect(trigger.className).not.toMatch(/(^|\s)border-r(\s|$)/);
    });

    it('search input in the picker uses logical ps-8 pe-3, not pl-8 pr-3', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('combobox'));
      const search = screen.getByPlaceholderText('Search country or code...');
      expect(search.className).toContain('ps-8');
      expect(search.className).toContain('pe-3');
      expect(search.className).not.toContain('pl-8');
      expect(search.className).not.toContain('pr-3');
    });

    it('search icon in the picker anchors to logical start-2.5, not left-2.5', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('combobox'));
      const icon = document.querySelector('svg.lucide-search') as SVGElement;
      expect(icon.getAttribute('class')).toContain('start-2.5');
      expect(icon.getAttribute('class')).not.toContain('left-2.5');
    });
  });
});
