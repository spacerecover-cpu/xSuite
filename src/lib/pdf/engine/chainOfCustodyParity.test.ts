import { describe, it, expect } from 'vitest';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { toEngineData } from './adapters/chainOfCustodyAdapter';
import { renderTemplate } from './renderTemplate';
import { buildChainOfCustodyDocument } from '../documents/ChainOfCustodyDocument';
import type { TranslationContext, ChainOfCustodyDocumentData } from '../types';
import { BUILT_IN_TEMPLATE_CONFIGS } from '../templateConfig';

// ---------------------------------------------------------------------------
// Chain-of-custody ENGINE ↔ LEGACY parity.
//
// Renders a representative FORENSIC CHAIN OF CUSTODY report BOTH ways — the
// legacy hand-written `buildChainOfCustodyDocument(...)` and the config-driven
// engine (toEngineData → renderTemplate) — and asserts CONTENT equivalence (not
// byte-identical layout): the case number, every custody entry row (padded
// entry number, humanized action type, description, actor + role, formatted
// date/time, humanized category), the forensic legal notice, and a footer.
//
// The legacy builder is the reference and MUST stay untouched. All inputs are
// synthetic — no DB, no font loading.
// ---------------------------------------------------------------------------

const englishCtx: TranslationContext = {
  t: (_key: string, englishText: string) => englishText,
  isRTL: false,
  isBilingual: false,
  languageCode: null,
  fontFamily: 'Roboto',
};

/** A 1×1 transparent PNG so the QR/footer image branches execute. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Representative custody report: CASE-0042 with three ledger entries spanning
 * device-received (creation), evidence-handling, and a critical-event category,
 * with hashes + signatures enabled so those optional columns render.
 */
function makeData(options?: ChainOfCustodyDocumentData['options']): ChainOfCustodyDocumentData {
  return {
    caseNumber: 'CASE-0042',
    entries: [
      {
        entry_number: 1,
        action_category: 'creation',
        action_type: 'device_received',
        action_description: 'Drive received at intake counter.',
        actor_name: 'Sam Reception',
        actor_role: 'receptionist',
        occurred_at: '2026-06-13T09:30:00Z',
        hash_algorithm: 'SHA-256',
        hash_value: 'a1b2c3d4e5f6',
        digital_signature: 'sig-0001',
      },
      {
        entry_number: 2,
        action_category: 'evidence_handling',
        action_type: 'imaging_started',
        action_description: 'Forensic image acquisition started.',
        actor_name: 'Lina Engineer',
        actor_role: 'technician',
        occurred_at: '2026-06-13T11:00:00Z',
        hash_algorithm: 'SHA-256',
        hash_value: 'f6e5d4c3b2a1',
        digital_signature: 'sig-0002',
      },
      {
        entry_number: 3,
        action_category: 'critical_event',
        action_type: 'destructive_attempt_authorized',
        action_description: 'Customer authorized destructive recovery attempt.',
        actor_name: 'Omar Manager',
        actor_role: 'manager',
        occurred_at: '2026-06-13T15:45:00Z',
      },
    ],
    options,
    companySettings: {
      basic_info: { company_name: 'Acme Data Recovery', legal_name: 'Acme Data Recovery LLC' },
      location: { address_line1: '12 Lab Street', city: 'Dubai', country: 'United Arab Emirates' },
      contact_info: { phone_primary: '+971 4 123 4567', email_general: 'lab@acme.test' },
      branding: { brand_tagline: 'Recovered. Verified. Delivered.', qr_code_general_caption: 'Scan to verify' },
      online_presence: { website: 'https://acme.test' },
    },
  };
}

/** Collect every leaf `text` string in a pdfmake content tree (recursively). */
function collectTexts(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('text' in obj) collectTexts(obj.text, out);
    for (const key of Object.keys(obj)) {
      if (key === 'text') continue;
      collectTexts(obj[key], out);
    }
  }
}

/** All text leaves across the content AND the (possibly-callback) footer. */
function allTexts(def: TDocumentDefinitions): string[] {
  const out: string[] = [];
  collectTexts(def.content, out);
  const footer = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | Content
    | undefined;
  if (typeof footer === 'function') {
    collectTexts(footer(1, 1, undefined), out);
  } else if (footer != null) {
    collectTexts(footer, out);
  }
  return out;
}

function renderEngine(data: ChainOfCustodyDocumentData): TDocumentDefinitions {
  const config = BUILT_IN_TEMPLATE_CONFIGS.chain_of_custody;
  const engineData = toEngineData(data, config);
  return renderTemplate(config, engineData, englishCtx, TINY_PNG, TINY_PNG);
}

describe('chain of custody parity — engine output matches the legacy builder', () => {
  it('renders the case number in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    expect(legacy).toContain('CASE-0042');
    expect(engine).toContain('CASE-0042');
  });

  it('renders every custody entry row (padded #, action type, actor, date/time) in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));

    // Padded entry numbers (#0001 … #0003) appear in both.
    for (const probe of ['#0001', '#0002', '#0003']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Humanized action types.
    for (const probe of ['Device Received', 'Imaging Started']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Actor names + roles.
    for (const probe of ['Sam Reception', 'receptionist', 'Lina Engineer', 'Omar Manager']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Formatted date/time (dd/MM/yyyy HH:mm).
    expect(legacy.some((t) => t.includes('13/06/2026'))).toBe(true);
    expect(engine.some((t) => t.includes('13/06/2026'))).toBe(true);
  });

  it('renders the humanized action-category badge text in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));
    for (const probe of ['Creation', 'Evidence Handling', 'Critical Event']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the entry descriptions in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));
    for (const probe of [
      'Drive received at intake counter.',
      'Forensic image acquisition started.',
      'Customer authorized destructive recovery attempt.',
    ]) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('renders the forensic legal notice (immutability / tamper warning) in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx)).join('|');
    const engine = allTexts(renderEngine(data)).join('|');
    const probe = 'maintained for forensic and legal purposes';
    expect(legacy).toContain(probe);
    expect(engine).toContain(probe);
  });

  it('reproduces the legacy Summary box rows (total / categories / actors / date range) in both', () => {
    const data = makeData();
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));

    // Summary labels (legacy `buildSummarySection`) appear in both outputs.
    for (const probe of [
      'Total Entries:',
      'Action Categories:',
      'Unique Actors:',
      'Date Range:',
    ]) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // The derived counts match the synthetic data: 3 entries, 3 distinct
    // categories (creation / evidence_handling / critical_event), 3 distinct
    // actors. The legacy box splits label + value into separate runs, so the
    // value is its own text leaf ("3").
    const legacyJoined = legacy.join('|');
    const engineJoined = engine.join('|');
    // Date range first→last (both ends are the 13/06/2026 day in the fixture).
    expect(legacyJoined).toContain('13/06/2026');
    expect(engineJoined).toContain('13/06/2026');
    // Total entries value (3) present in both summary boxes.
    expect(legacy.some((t) => t.includes('Total Entries:') || t.trim() === '3')).toBe(true);
    expect(engine.some((t) => t.includes('Total Entries:') || t.trim() === '3')).toBe(true);
  });

  it('includes hash values when the includeHashes option is set', () => {
    const data = makeData({ includeHashes: true });
    const engine = allTexts(renderEngine(data)).join('|');
    expect(engine).toContain('a1b2c3d4e5f6');
    expect(engine).toContain('f6e5d4c3b2a1');
  });

  it('reproduces the legacy Hash Verification table (entry / algorithm / hash) when includeHashes is on', () => {
    const data = makeData({ includeHashes: true });
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));

    // Section heading + algorithm + the per-entry hash values are present in both.
    for (const probe of ['Hash Verification', 'SHA-256', 'a1b2c3d4e5f6', 'f6e5d4c3b2a1']) {
      expect(legacy.some((t) => t.includes(probe))).toBe(true);
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // The hashed entries carry their padded entry numbers in the hash table.
    for (const probe of ['#0001', '#0002']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
  });

  it('omits the hash column when includeHashes is not set', () => {
    const data = makeData();
    const engine = allTexts(renderEngine(data)).join('|');
    expect(engine).not.toContain('a1b2c3d4e5f6');
    // The Hash Verification section heading is omitted entirely when the option is off.
    expect(engine).not.toContain('Hash Verification');
  });

  it('reproduces the legacy Digital Signatures table (signer / role / signature / date) when includeSignatures is on', () => {
    const data = makeData({ includeSignatures: true });
    const legacy = allTexts(buildChainOfCustodyDocument(data, englishCtx));
    const engine = allTexts(renderEngine(data));

    // Section heading present in both; the engine table carries signer + role +
    // signature reference + date for each signed entry.
    expect(legacy.some((t) => t.includes('Digital Signatures'))).toBe(true);
    expect(engine.some((t) => t.includes('Digital Signatures'))).toBe(true);
    for (const probe of ['Sam Reception', 'Lina Engineer', 'sig-0001', 'sig-0002', 'receptionist', 'technician']) {
      expect(engine.some((t) => t.includes(probe))).toBe(true);
    }
    // Only the two signed entries (#0001, #0002) appear; the unsigned #0003 does not
    // contribute a signature row.
    const engineJoined = engine.join('|');
    expect(engineJoined).not.toContain('sig-0003');
  });

  it('omits the Digital Signatures section when includeSignatures is not set', () => {
    const data = makeData();
    const engine = allTexts(renderEngine(data)).join('|');
    expect(engine).not.toContain('Digital Signatures');
    expect(engine).not.toContain('sig-0001');
  });

  it('emits a footer on the engine custody report (tagline + website)', () => {
    const def = renderEngine(makeData());
    expect(typeof def.footer).toBe('function');
    const footerFn = def.footer as (cp: number, pc: number) => Content;
    const footerTexts: string[] = [];
    collectTexts(footerFn(1, 1), footerTexts);
    expect(footerTexts.some((t) => t.includes('Recovered. Verified. Delivered.'))).toBe(true);
    expect(footerTexts.some((t) => t.includes('https://acme.test'))).toBe(true);
  });
});
