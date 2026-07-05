import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusPillSelect } from './StatusPillSelect';

const OPTIONS = [
  { id: 's1', name: 'Registered', color: '#2563EB' },
  { id: 's2', name: 'Recovery in Progress', color: '#0F766E' },
  { id: 's3', name: 'Closed — Device Returned', color: '#334155' },
  { id: 's4', name: 'Cancelled — Customer Declined', color: '#BE185D' },
];

describe('StatusPillSelect', () => {
  const onSelect = vi.fn();
  beforeEach(() => onSelect.mockClear());

  const renderSelect = (value: string | null = 'Recovery in Progress') =>
    render(<StatusPillSelect value={value} options={OPTIONS} onSelect={onSelect} />);

  it('renders the current status as a colored pill on the trigger', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox', { name: /change case status/i });
    const pill = screen.getByText('Recovery in Progress');
    expect(trigger).toContainElement(pill);
    expect(pill).toHaveStyle({ color: '#0F766E' });
  });

  it('opens on click and lists every status as a colored pill option', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');
    expect(listbox).toBeInTheDocument();
    expect(options).toHaveLength(OPTIONS.length);
    // Each option carries its own status color, not plain text.
    const declined = screen.getByText('Cancelled — Customer Declined');
    expect(declined).toHaveStyle({ color: '#BE185D' });
  });

  it('marks the current status option as selected', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('combobox'));
    const selected = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toBeDefined();
    expect(selected!.textContent).toContain('Recovery in Progress');
  });

  it('selects a status on click and closes', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Closed — Device Returned'));

    expect(onSelect).toHaveBeenCalledWith('Closed — Device Returned');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports full keyboard operation (open, navigate, select)', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox');
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // opens
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // moves to first option
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('Registered');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape without selecting', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps a legacy/inactive current status selectable so the field never renders blank', () => {
    renderSelect('Returned (legacy)');
    expect(screen.getByText('Returned (legacy)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(OPTIONS.length + 1);
    expect(options[0].textContent).toContain('Returned (legacy)');
  });

  it('falls back to the neutral grey pill when the status has no color', () => {
    render(
      <StatusPillSelect
        value="Mystery"
        options={[{ id: 'x', name: 'Mystery', color: null }]}
        onSelect={onSelect}
      />
    );
    expect(screen.getByText('Mystery')).toHaveStyle({ color: '#6b7280' });
  });
});
