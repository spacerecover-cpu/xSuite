import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { IntakeDeviceRows, emptyDevice, devicesAreComplete } from './IntakeDeviceRows';

const catalogs = {
  deviceTypes: [{ id: 'dt-1', name: 'HDD' }],
  brands: [{ id: 'b-1', name: 'Seagate' }],
  capacities: [{ id: 'c-1', name: '2 TB' }],
  conditions: [{ id: 'cond-1', name: 'Physically damaged' }],
};

describe('devicesAreComplete', () => {
  it('is false with no devices — a check-in must receive something', () => {
    expect(devicesAreComplete([])).toBe(false);
  });

  it('is false while any device has no recorded condition', () => {
    const devices = [
      { ...emptyDevice('a'), condition_id: 'cond-1' },
      emptyDevice('b'),
    ];
    expect(devicesAreComplete(devices)).toBe(false);
  });

  it('is true once every device has a condition', () => {
    const devices = [
      { ...emptyDevice('a'), condition_id: 'cond-1' },
      { ...emptyDevice('b'), condition_id: 'cond-1' },
    ];
    expect(devicesAreComplete(devices)).toBe(true);
  });
});

describe('IntakeDeviceRows', () => {
  it('renders one labelled row per device — devices are tracked individually', () => {
    render(
      <IntakeDeviceRows
        {...catalogs}
        value={[emptyDevice('a'), emptyDevice('b')]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Device 1')).toBeInTheDocument();
    expect(screen.getByText('Device 2')).toBeInTheDocument();
  });

  it('marks condition as required on every row', () => {
    render(<IntakeDeviceRows {...catalogs} value={[emptyDevice('a')]} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/condition/i)).toBeRequired();
  });

  it('appends a device without disturbing the ones already captured', async () => {
    const onChange = vi.fn();
    const first = { ...emptyDevice('a'), serial_number: 'WD-77' };
    render(<IntakeDeviceRows {...catalogs} value={[first]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /add device/i }));

    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(first);
    expect(next[1].condition_id).toBeNull();
  });

  it('gives every appended device a distinct key so rows cannot collapse', async () => {
    const onChange = vi.fn();
    render(<IntakeDeviceRows {...catalogs} value={[emptyDevice('a')]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add device/i }));
    const next = onChange.mock.calls[0][0];
    expect(new Set(next.map((d: { key: string }) => d.key)).size).toBe(next.length);
  });

  it('removes only the row asked for', async () => {
    const onChange = vi.fn();
    render(
      <IntakeDeviceRows
        {...catalogs}
        value={[emptyDevice('a'), emptyDevice('b')]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove device 1/i }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ key: 'b' })]);
  });

  it('hides removal on the last row — a case cannot check in zero devices', () => {
    render(<IntakeDeviceRows {...catalogs} value={[emptyDevice('a')]} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /remove device/i })).not.toBeInTheDocument();
  });

  it('records the picked condition against the right device', async () => {
    const onChange = vi.fn();
    render(
      <IntakeDeviceRows
        {...catalogs}
        value={[emptyDevice('a'), emptyDevice('b')]}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getAllByLabelText(/condition/i)[1], 'cond-1');
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'a', condition_id: null }),
      expect.objectContaining({ key: 'b', condition_id: 'cond-1' }),
    ]);
  });
});
