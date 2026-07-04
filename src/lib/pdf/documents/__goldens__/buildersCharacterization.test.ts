import { describe, it, expect } from 'vitest';
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type {
  ReceiptData,
  ChainOfCustodyDocumentData,
  TranslationContext,
} from '../../types';
import { createTranslationContext } from '../../translationContext';
import { buildOfficeReceiptDocument } from '../OfficeReceiptDocument';
import { buildChainOfCustodyDocument } from '../ChainOfCustodyDocument';

// ---------------------------------------------------------------------------
// Characterization (golden) tests for the remaining pdfmake builders.
//
// Purpose: PIN the *current* structural output of the representative document
// builders that STILL have a legacy path (office receipt + chain of custody).
// The invoice and quote builders that this file also characterized were DELETED
// in Task 10 — they now render exclusively through the config-driven engine, so
// their goldens live in the engine parity/golden suites, not here.
// When a remaining imperative builder is later replaced by the config-driven
// `renderTemplate()` assembler, its snapshot must either stay byte-identical
// (pure refactor — the goal) or change in a reviewed, intentional way.
//
// We deliberately do NOT JSON.stringify the raw TDocumentDefinitions: it carries
// a `footer` FUNCTION (and the builders close over icon SVG / logo strings).
// Instead we:
//   1. snapshot the *static* parts: pageSize, pageMargins, defaultStyle,
//      sorted `styles` keys, and a structural skeleton of `content`;
//   2. invoke the `footer(1, 1)` function and snapshot its skeleton too.
// The skeleton keeps leaf `text` strings (labels are load-bearing and the whole
// point of catching a regression) but collapses functions, embedded SVG/base64
// images, and pdfmake layout callbacks to stable placeholders so the snapshot is
// deterministic and reviewable.
// ---------------------------------------------------------------------------

const ctx: TranslationContext = createTranslationContext('english_only', null);

/**
 * Produce a deterministic, reviewable skeleton of an arbitrary pdfmake node.
 * - functions            -> '[Function]'
 * - long base64 / SVG    -> '[binary:<len>]' (so a logo/icon swap is visible as
 *                           a length change without dumping kilobytes of data)
 * - everything else      -> structurally preserved, object keys sorted
 */
function skeleton(node: unknown): unknown {
  if (node == null) return node;

  if (typeof node === 'function') return '[Function]';

  if (typeof node === 'string') {
    // Collapse embedded SVG markup and base64 data-URIs to a length marker so
    // the snapshot does not depend on multi-kilobyte binary blobs, while still
    // flagging if an icon/logo is added, removed, or resized.
    if (node.startsWith('<svg') || node.startsWith('data:')) {
      return `[binary:${node.length}]`;
    }
    // Some builders (e.g. ChainOfCustodyDocument) stamp a wall-clock
    // "Generated: dd/MM/yyyy HH:mm" line into the footer. Normalize the volatile
    // date/time to a stable placeholder so the golden snapshot stays
    // deterministic while still pinning the surrounding label text. The label
    // prefix is preserved, so a wording change is still caught.
    return node.replace(
      /^(Generated:\s*)\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/,
      '$1[timestamp]',
    );
  }

  if (typeof node === 'number' || typeof node === 'boolean') return node;

  if (Array.isArray(node)) {
    return node.map(skeleton);
  }

  if (typeof node === 'object') {
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = skeleton(src[key]);
    }
    return out;
  }

  return node;
}

/**
 * Snapshot payload for a builder result: the static document shape plus the
 * skeleton of the invoked footer. `content` is structurally serialized; the
 * `footer` function is called with sample page args `(1, 1)` and its returned
 * content is serialized too.
 */
function characterize(def: TDocumentDefinitions) {
  const footerFn = def.footer as
    | ((currentPage: number, pageCount: number, pageSize?: unknown) => Content)
    | undefined;

  return {
    pageSize: def.pageSize,
    pageOrientation: def.pageOrientation,
    pageMargins: def.pageMargins,
    defaultStyle: skeleton(def.defaultStyle),
    // Per the task: snapshot the styles *keys*, not the full (stable but verbose)
    // style object. A new/removed named style is what a refactor would change.
    stylesKeys: def.styles ? Object.keys(def.styles).sort() : null,
    watermark: skeleton(def.watermark),
    content: skeleton(def.content),
    // Invoke the footer with sample args and pin its rendered structure.
    footer: typeof footerFn === 'function' ? skeleton(footerFn(1, 1)) : footerFn,
  };
}

// ---------------------------------------------------------------------------
// Synthetic fixtures — minimal data satisfying each *DocumentData type.
// Values are stable & fabricated (no real records, no DB access). Currency is
// pinned via accounting_locales so the snapshot is locale-deterministic, and no
// logo / QR base64 is passed (those args are optional) which keeps the builders
// on their deterministic, non-binary header/footer branch.
// ---------------------------------------------------------------------------

const companySettings = {
  basic_info: {
    company_name: 'Acme Data Recovery',
    legal_name: 'Acme Data Recovery LLC',
    vat_number: 'VAT-000111',
  },
  location: {
    address_line1: '12 Lab Street',
    city: 'Muscat',
    country: 'Oman',
  },
  contact_info: {
    phone_primary: '+968 1234 5678',
    email_general: 'lab@acme.test',
  },
  branding: {
    brand_tagline: 'Recovered. Verified. Delivered.',
  },
  online_presence: {
    website: 'https://acme.test',
  },
} satisfies ReceiptData['companySettings'];

const officeReceiptFixture: ReceiptData = {
  caseData: {
    id: 'case-1',
    case_no: 'CASE-0042',
    created_at: '2026-06-01T09:00:00.000Z',
    status: 'received',
    priority: 'High',
    problem_description: 'Drive not detected by BIOS.',
    client_reference: 'REF-1234',
    customer: {
      id: 'cust-1',
      customer_name: 'Jane Client',
      email: 'jane@client.test',
      mobile_number: '+968 9999 0000',
    },
    company: {
      id: 'co-1',
      company_name: 'Client Holdings',
    },
    service_type: {
      id: 'svc-1',
      name: 'Hard Drive Recovery',
    },
    created_by_profile: {
      id: 'profile-1',
      full_name: 'Lab Reception',
      email: 'reception@acme.test',
    },
  },
  devices: [
    {
      id: 'dev-1',
      device_type: 'HDD',
      brand: 'Seagate',
      model: 'ST1000',
      serial_number: 'SN-ABC-001',
      capacity: '1000',
      role: 'patient',
      device_problem: 'Clicking noise on spin-up.',
    },
  ],
  companySettings,
};

const chainOfCustodyFixture: ChainOfCustodyDocumentData = {
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
      evidence_reference: 'SEAL-0001',
      hash_algorithm: 'SHA-256',
      hash_value: 'a'.repeat(64),
      digital_signature: 'sig-0001',
    },
    {
      entry_number: 2,
      action_category: 'verification',
      action_type: 'integrity_check',
      action_description: 'Hash verification passed.',
      actor_name: 'QA Engineer',
      actor_role: 'technician',
      occurred_at: '2026-06-02T11:30:00.000Z',
    },
  ],
  options: {
    includeMetadata: true,
    includeHashes: true,
    includeSignatures: true,
  },
  companySettings,
};

describe('PDF builder characterization (golden snapshots)', () => {
  it('buildOfficeReceiptDocument — static shape + footer', () => {
    expect(characterize(buildOfficeReceiptDocument(officeReceiptFixture, ctx))).toMatchSnapshot();
  });

  it('buildChainOfCustodyDocument — static shape + footer', () => {
    expect(characterize(buildChainOfCustodyDocument(chainOfCustodyFixture, ctx))).toMatchSnapshot();
  });
});
