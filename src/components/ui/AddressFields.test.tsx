import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/geoSubdivisionService', () => ({
  listSubdivisions: vi.fn(async (countryId: string) =>
    countryId === 'om-uuid'
      ? [{ id: 's1', code: 'MA', name: 'Muscat', subdivision_type: 'governorate' }]
      : []),
}));
vi.mock('../../contexts/TenantConfigContext', () => ({
  useLocaleConfig: () => ({ postalCodeLabel: 'Postal Code' }),
}));

import { AddressFields } from './AddressFields';

const value = { address_line1: '', address_line2: '', subdivision_id: null, postal_code: '' };

describe('AddressFields', () => {
  it('renders line1/line2/postal inputs and the subdivision select when the country has rows', async () => {
    const onChange = vi.fn();
    render(<AddressFields value={value} onChange={onChange} countryId="om-uuid" />);
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
    expect(await screen.findByLabelText('State / Region')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: 'Bldg 12' } });
    expect(onChange).toHaveBeenCalledWith({ ...value, address_line1: 'Bldg 12' });
  });

  it('hides the subdivision select when the country has no subdivisions', async () => {
    render(<AddressFields value={value} onChange={vi.fn()} countryId="ae-uuid" />);
    expect(screen.getByLabelText('Address line 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('State / Region')).not.toBeInTheDocument();
  });

  it('labels the postal field from tenant locale config', () => {
    render(<AddressFields value={value} onChange={vi.fn()} countryId={null} />);
    expect(screen.getByLabelText('Postal Code')).toBeInTheDocument();
  });
});
