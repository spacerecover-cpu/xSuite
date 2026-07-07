import { describe, it, expect } from 'vitest';
import { toEngineData } from './chainOfCustodyAdapter';
import type { ChainOfCustodyDocumentData } from '../../types';
import type { DocumentTemplateConfig } from '../../templateConfig';

// Custody columns fall back to the built-in set when no custodyLog section is
// configured; the test only cares about the rendered occurred-at value.
const CONFIG = { sections: [] } as unknown as DocumentTemplateConfig;

const makeData = (
  dateTimeConfig?: ChainOfCustodyDocumentData['dateTimeConfig'],
): ChainOfCustodyDocumentData => ({
  caseNumber: 'CASE-0042',
  entries: [
    {
      entry_number: 1,
      action_category: 'creation',
      action_type: 'device_received',
      action_description: 'Patient device received at intake.',
      actor_name: 'Lab Reception',
      actor_role: 'technician',
      occurred_at: '2026-06-01T09:00:00.000Z',
      digital_signature: 'sig-0001',
    },
  ],
  options: { includeSignatures: true },
  companySettings: {} as ChainOfCustodyDocumentData['companySettings'],
  dateTimeConfig,
});

describe('chainOfCustodyAdapter — forensic event timestamps', () => {
  it('renders occurred_at in the tenant timezone with an explicit zone label', () => {
    // 09:00Z in Asia/Muscat (UTC+4) = 13:00, zone-labelled — never the printer tz.
    const out = toEngineData(makeData({ timezone: 'Asia/Muscat', timeFormat: '24h' }), CONFIG);
    const occurredAt = out.custodyLog!.rows[0].occurredAt;
    expect(occurredAt).toContain('13:00');
    expect(occurredAt).toContain('GMT+4');
    expect(occurredAt).not.toMatch(/^\d{2}\/\d{2}\/\d{4}/); // not the old dd/MM/yyyy
  });

  it('renders the forensic summary date range zone-labelled', () => {
    const out = toEngineData(makeData({ timezone: 'Asia/Muscat', timeFormat: '24h' }), CONFIG);
    const dateRangeRow = out.custodySummary!.rows.find((r) => r.value.includes(' - ') || r.value.includes('GMT'));
    expect(dateRangeRow?.value).toContain('GMT+4');
  });

  it('renders the digital-signature Date column zone-labelled (who signed WHEN)', () => {
    const out = toEngineData(makeData({ timezone: 'Asia/Muscat', timeFormat: '24h' }), CONFIG);
    const sigDate = out.digitalSignatures!.rows[0].date;
    expect(sigDate).toContain('13:00');
    expect(sigDate).toContain('GMT+4');
    expect(sigDate).not.toMatch(/^\d{2}\/\d{2}\/\d{4}/); // not the old browser-tz dd/MM
  });
});
