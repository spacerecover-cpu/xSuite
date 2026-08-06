import { describe, it, expect } from 'vitest';
import { depositorBlock, devicesForReceipt, toEngineData } from './receiptAdapter';
import type { CaseData, DeviceData, ReceiptData } from '../../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../../templateConfig';
import type { DocumentTemplateConfig } from '../../templateConfig';
import { renderSignature } from '../sections/signature';
import { resolveLabel } from '../labels';
import type { EngineContext, SignatureBlockData } from '../types';

const dev = (id: string, batch?: string, receivedAt?: string): DeviceData => ({
  id,
  intake_batch_id: batch,
  received_at: receivedAt,
});

describe('devicesForReceipt', () => {
  it('returns only the latest intake batch', () => {
    const devices = [
      dev('a', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('b', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('c', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['c']);
  });

  it('falls back to every device when no batch has been recorded', () => {
    const devices = [dev('a'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ignores unbatched devices when a batch exists', () => {
    const devices = [dev('a', 'batch-1', '2026-08-01T10:00:00Z'), dev('b')];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a']);
  });

  it('returns EVERY device of the latest batch (a multi-drive RAID intake never collapses)', () => {
    const devices = [
      dev('c', 'batch-1', '2026-08-01T10:00:00Z'),
      dev('a', 'batch-2', '2026-08-04T09:00:00Z'),
      dev('b', 'batch-2', '2026-08-04T09:00:00Z'),
    ];
    expect(devicesForReceipt(devices).map((d) => d.id)).toEqual(['a', 'b']);
  });
});

const CONFIG = {} as DocumentTemplateConfig;

const baseCase: CaseData = {
  id: 'c1',
  case_no: 'C-0044',
  created_at: '2026-08-01T00:00:00Z',
  status: 'intake',
  priority: 'normal',
  problem_description: 'Case-level fallback problem',
  customer: { id: 'cust1', customer_name: 'Satya Pratap A' },
};

const companySettings = { legal_compliance: {}, branding: {} } as ReceiptData['companySettings'];

const intakeDevice = (
  id: string,
  serial: string,
  batch: string,
  receivedAt: string,
  problem: string,
): DeviceData => ({
  id,
  serial_number: serial,
  intake_batch_id: batch,
  received_at: receivedAt,
  device_problem: problem,
});

describe('receiptAdapter.toEngineData — intake batch scoping', () => {
  const earlier = intakeDevice('d0', 'WS10SSNM25', 'B0', '2026-08-01T10:00:00Z', 'Clicking noise');
  const latestA = intakeDevice('d1', 'CND9242CRV', 'B1', '2026-08-04T09:00:00Z', 'Not detected');
  const latestB = intakeDevice('d2', 'ZA1B2C3D4E', 'B1', '2026-08-04T09:00:00Z', 'Not detected');

  const make = (devices: DeviceData[]): ReceiptData => ({
    caseData: baseCase,
    devices,
    companySettings,
  });

  it('prints only the devices received in the latest intake batch', () => {
    const out = toEngineData(make([earlier, latestA, latestB]), CONFIG, 'office');
    const serials = (out.devices?.rows ?? []).map((r) => r.serial);
    expect(serials).toEqual(['CND9242CRV', 'ZA1B2C3D4E']);
    expect(serials).not.toContain('WS10SSNM25');
  });

  it('reads the Case Details problem from the latest batch, not an earlier intake', () => {
    const out = toEngineData(make([earlier, latestA]), CONFIG, 'customer');
    const caseVals = (out.caseInfo?.rows ?? []).map((r) => r.value);
    expect(caseVals).toContain('Not detected');
    expect(caseVals).not.toContain('Clicking noise');
  });

  it('emits the depositor handover block as the collector section', () => {
    const deposited: DeviceData = {
      ...latestA,
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'courier',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const out = toEngineData(make([earlier, deposited]), CONFIG, 'office');
    expect((out.collector?.rows ?? []).map((r) => `${r.label.en}=${r.value}`)).toEqual([
      'Delivered by=Sam Okafor — on behalf of Satya Pratap A',
      'Relationship=Courier',
      'National ID=P1234567',
      'Mobile=+441234567890',
      'Received on=04/08/2026',
    ]);
  });
});

describe('depositorBlock', () => {
  it('returns null when no depositor was recorded', () => {
    expect(depositorBlock([dev('a')], 'Acme Ltd')).toBeNull();
  });

  it('reads "Delivered by customer" when the depositor is the customer', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Dana Reed',
      depositor_relationship: 'self',
    };
    const block = depositorBlock([d], 'Dana Reed');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value).toBe(
      'Delivered by customer',
    );
  });

  it('names the agent and the customer when the depositor is not the customer', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'courier',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Delivered by')?.value).toBe(
      'Sam Okafor — on behalf of Acme Ltd',
    );
    expect(block?.rows.find((r) => r.label.en === 'Relationship')?.value).toBe('Courier');
    expect(block?.rows.find((r) => r.label.en === 'National ID')?.value).toBe('P1234567');
    expect(block?.rows.find((r) => r.label.en === 'Mobile')?.value).toBe('+441234567890');
    expect(block?.rows.find((r) => r.label.en === 'Received on')?.value).toBe('04/08/2026');
  });

  it('still names a depositor recorded WITHOUT a relationship', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_id: 'P1234567',
      depositor_mobile: '+441234567890',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect((block?.rows ?? []).map((r) => `${r.label.en}=${r.value}`)).toEqual([
      'Delivered by=Sam Okafor — on behalf of Acme Ltd',
      'National ID=P1234567',
      'Mobile=+441234567890',
      'Received on=04/08/2026',
    ]);
  });

  it('treats a blank or customer-named depositor with no relationship as the customer', () => {
    const blank: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'), depositor_name: '  ' };
    expect(depositorBlock([blank], 'Acme Ltd')?.rows[0].value).toBe('Delivered by customer');

    const named: DeviceData = { ...dev('a', 'b1', '2026-08-04T09:00:00Z'), depositor_name: 'Acme Ltd' };
    expect(depositorBlock([named], 'Acme Ltd')?.rows[0].value).toBe('Delivered by customer');
  });

  it('falls back to the raw relationship when it is not in the label map', () => {
    const d: DeviceData = {
      ...dev('a', 'b1', '2026-08-04T09:00:00Z'),
      depositor_name: 'Sam Okafor',
      depositor_relationship: 'neighbour',
    };
    const block = depositorBlock([d], 'Acme Ltd');
    expect(block?.rows.find((r) => r.label.en === 'Relationship')?.value).toBe('neighbour');
  });
});

const receipt = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  caseData: { case_no: 'CASE-0042' } as ReceiptData['caseData'],
  devices: [dev('a')],
  companySettings: {} as ReceiptData['companySettings'],
  ...over,
});

const customerSig: SignatureBlockData = {
  slot: 'customer',
  name: 'Dana Reed',
  method: 'drawn',
  imageDataUrl: 'data:image/png;base64,AAA',
};
const repSig: SignatureBlockData = {
  slot: 'lab_manager',
  name: 'Sam Okafor',
  method: 'typed',
  typedValue: 'Sam Okafor',
};

const BILINGUAL: DocumentTemplateConfig = {
  ...BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
  language: { mode: 'bilingual_sidebyside', primary: 'en' },
};

const blocksFor = (captured: SignatureBlockData[]) =>
  toEngineData(
    receipt({ capturedSignatures: captured }),
    BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
    'customer',
  ).signatureBlocks;

describe('toEngineData signature blocks', () => {
  it('leaves wet-ink caption lines when nothing was captured', () => {
    const out = toEngineData(receipt(), BUILT_IN_TEMPLATE_CONFIGS.customer_copy, 'customer');
    expect(out.signatureBlocks).toBeUndefined();
    expect(out.signatures?.[0].en).toBe('Customer Signature');
  });

  it('passes captured signatures through to signatureBlocks', () => {
    const blocks = blocksFor([customerSig]);
    expect(blocks?.[0].name).toBe('Dana Reed');
    expect(blocks?.[0].imageDataUrl).toBe('data:image/png;base64,AAA');
  });

  it('keeps the representative wet-ink slot when only the customer signed', () => {
    const blocks = blocksFor([customerSig]);
    expect(blocks).toHaveLength(2);
    expect(blocks?.[1].role).toBe('Company Representative');
    expect(blocks?.[1].method).toBeUndefined();
    expect(blocks?.[1].imageDataUrl).toBeUndefined();
  });

  it('keeps the customer wet-ink slot when only the representative signed', () => {
    const blocks = blocksFor([repSig]);
    expect(blocks).toHaveLength(2);
    expect(blocks?.[0].role).toBe('Customer Signature');
    expect(blocks?.[0].name).toBeUndefined();
    expect(blocks?.[1].name).toBe('Sam Okafor');
  });

  it('emits both captured blocks when both parties signed', () => {
    const blocks = blocksFor([customerSig, repSig]);
    expect(blocks).toHaveLength(2);
    expect(blocks?.map((b) => b.name)).toEqual(['Dana Reed', 'Sam Okafor']);
  });

  it('labels a captured block that carries no role of its own', () => {
    expect(blocksFor([customerSig])?.[0].role).toBe('Customer Signature');
    expect(blocksFor([{ ...customerSig, role: 'Depositor' }])?.[0].role).toBe('Depositor');
  });

  it('never drops a captured signature outside the two canonical slots', () => {
    const witness: SignatureBlockData = { slot: 'witness', name: 'Ali Haddad', method: 'click_to_accept' };
    const blocks = blocksFor([customerSig, repSig, witness]);
    expect(blocks).toHaveLength(3);
    expect(blocks?.[2].name).toBe('Ali Haddad');
  });

  it('never lets a witness claim (and be relabelled as) the representative slot', () => {
    const witness: SignatureBlockData = { slot: 'witness', name: 'Ali Haddad', method: 'typed', typedValue: 'Ali Haddad' };
    const blocks = blocksFor([customerSig, witness]);
    expect(blocks).toHaveLength(3);
    // the lab's own acknowledgement line survives, unsigned
    expect(blocks?.[1].role).toBe('Company Representative');
    expect(blocks?.[1].name).toBeUndefined();
    // the witness keeps its own slot and identity
    expect(blocks?.[2].slot).toBe('witness');
    expect(blocks?.[2].name).toBe('Ali Haddad');
    expect(blocks?.[2].role).toBe('Witness');
  });

  it('captions an unlabelled extra rather than printing its raw slot token', () => {
    const witness: SignatureBlockData = { slot: 'witness', name: 'Ali Haddad', method: 'click_to_accept' };
    const engine = {
      config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
      stampImage: null,
      signatureImage: null,
    } as unknown as EngineContext;
    const texts: string[] = [];
    const walk = (node: unknown): void => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const o = node as Record<string, unknown>;
      if (typeof o.text === 'string') texts.push(o.text);
      Object.values(o).forEach(walk);
    };
    walk(
      renderSignature(
        engine,
        toEngineData(
          receipt({ capturedSignatures: [customerSig, witness] }),
          BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
          'customer',
        ),
      ),
    );
    expect(texts).toContain('Witness');
    expect(texts).not.toContain('witness');
  });

  it('keeps an extra signature\'s own role label when it carries one', () => {
    const witness: SignatureBlockData = { slot: 'witness', name: 'Ali Haddad', role: 'Neighbour', method: 'click_to_accept' };
    expect(blocksFor([customerSig, witness])?.[2].role).toBe('Neighbour');
  });

  it('captions captured slots in the document language, exactly as the wet-ink lines do', () => {
    const wetInk = toEngineData(receipt(), BILINGUAL, 'customer');
    const captured = toEngineData(receipt({ capturedSignatures: [customerSig] }), BILINGUAL, 'customer');
    const lines = (wetInk.signatures ?? []).map((l) => resolveLabel(l, BILINGUAL.language));
    expect(lines).toEqual(['Customer Signature | توقيع العميل', 'Company Representative | ممثل الشركة']);
    expect(captured.signatureBlocks?.map((b) => b.role)).toEqual(lines);
  });

  it('captions an unlabelled extra in the document language too', () => {
    const witness: SignatureBlockData = { slot: 'witness', name: 'Ali Haddad', method: 'click_to_accept' };
    const out = toEngineData(
      receipt({ capturedSignatures: [customerSig, witness] }),
      BILINGUAL,
      'customer',
    );
    expect(out.signatureBlocks?.[2].role).toBe('Witness | الشاهد');
  });

  it('renders both parties on the page when only the customer signed', () => {
    const engine = {
      config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
      stampImage: null,
      signatureImage: null,
    } as unknown as EngineContext;
    const data = toEngineData(
      receipt({ capturedSignatures: [customerSig] }),
      BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
      'customer',
    );
    const texts: string[] = [];
    const walk = (node: unknown): void => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const o = node as Record<string, unknown>;
      if (typeof o.text === 'string') texts.push(o.text);
      Object.values(o).forEach(walk);
    };
    walk(renderSignature(engine, data));
    expect(texts).toContain('Dana Reed');
    expect(texts).toContain('Company Representative');
  });

  it('leaves the unsigned party room to sign by hand', () => {
    const engine = {
      config: { language: { mode: 'en', primary: 'en' }, signatureImages: undefined },
      stampImage: null,
      signatureImage: null,
    } as unknown as EngineContext;
    const data = toEngineData(
      receipt({ capturedSignatures: [customerSig] }),
      BUILT_IN_TEMPLATE_CONFIGS.customer_copy,
      'customer',
    );
    const ys: number[] = [];
    const walk = (node: unknown): void => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const o = node as Record<string, unknown>;
      if (o.type === 'line' && typeof o.y1 === 'number') ys.push(o.y1);
      Object.values(o).forEach(walk);
    };
    walk(renderSignature(engine, data));
    // customer rule sits under the captured image; the representative's rule
    // keeps the wet-ink block's 28pt of writing room above it.
    expect(ys).toEqual([2, 28]);
  });
});
