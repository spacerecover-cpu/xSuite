import { describe, it, expect } from 'vitest';
import { isDonorSearchTemplate } from './InventoryAdvancedSearch';

// `inventory_search_templates` is shared by the Inventory Advanced Search and the
// Donor Search page with no discriminator column, so this surface must recognise
// and skip foreign donor templates (loading one blanks every advanced criterion).
describe('isDonorSearchTemplate', () => {
  it('flags a donor template, which always serializes the donor-only keys', () => {
    // Shape written by DonorSearchPage.handleSaveTemplate (EMPTY_CRITERIA spread).
    const donorCriteria = {
      device_type_id: '',
      brand_id: '',
      model: '',
      capacity_id: '',
      serial_number: '',
      pcb_number: '2060-800001',
      firmware: '',
      dcm: '',
      head_map: '',
      controller: '',
      chipset: '',
      description: 'WD donor shelf',
    };
    expect(isDonorSearchTemplate(donorCriteria)).toBe(true);
  });

  it('does not flag an inventory template, whose unset keys are dropped on serialize', () => {
    expect(isDonorSearchTemplate({ barcode: 'BIN-A4', location_id: 'loc-uuid' })).toBe(false);
    expect(isDonorSearchTemplate({ pcb_number: '2060-800001', firmware: 'CC49' })).toBe(false);
  });

  it('treats a null / non-object / array criteria blob as not-donor', () => {
    expect(isDonorSearchTemplate(null)).toBe(false);
    expect(isDonorSearchTemplate('brand_id')).toBe(false);
    expect(isDonorSearchTemplate(['brand_id'])).toBe(false);
  });
});
