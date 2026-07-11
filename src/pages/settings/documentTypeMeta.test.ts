import { describe, it, expect } from 'vitest';
import { DOCUMENT_TYPES, DOC_TYPE_LABELS, LEGACY_REPORT_CARD } from './documentTypeMeta';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  parseTemplateStorageKey,
  reportTemplateKey,
  type TemplateDocumentType,
} from '../../lib/pdf/templateConfig';
import { REPORT_TYPES } from '../../lib/reportTypes';

// Guards the "Office check-in receipt is missing" bug: the landing grid must
// surface EVERY engine document type, so none can silently drop off again.
// Since 2026-07, `report` is surfaced as 8 subtype-scoped cards (one per
// REPORT_TYPES entry) plus a conditional legacy shared-base card, and the label
// types (case_label / stock_label) are thermal LABEL_CARDS in the dedicated
// Settings → Label Studio page (labelStudioMeta.ts) — not the config engine.

const allTypes = Object.keys(BUILT_IN_TEMPLATE_CONFIGS) as TemplateDocumentType[];
const LABEL_DOC_TYPES: TemplateDocumentType[] = ['case_label', 'stock_label'];

describe('documentTypeMeta', () => {
  it('DOCUMENT_TYPES lists every engine document type except the thermal labels', () => {
    const listed = new Set(DOCUMENT_TYPES.map((d) => d.type));
    for (const t of allTypes) {
      if (LABEL_DOC_TYPES.includes(t)) continue; // now LabelStudio cards
      expect(listed.has(t), `${t} is missing from the documents grid`).toBe(true);
    }
    // The old config-engine label documents are no longer edited in the grid.
    expect(listed.has('case_label')).toBe(false);
    expect(listed.has('stock_label')).toBe(false);
  });

  it('has no duplicate storage keys, and never the legacy key', () => {
    const keys = DOCUMENT_TYPES.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The legacy shared base is a separate, conditionally-rendered card.
    expect(keys).not.toContain(LEGACY_REPORT_CARD.key);
  });

  it('surfaces every report type as its own subtype-scoped card', () => {
    const reportCards = DOCUMENT_TYPES.filter((d) => d.type === 'report');
    expect(reportCards.map((d) => d.reportSubtype)).toEqual(Object.keys(REPORT_TYPES));
    for (const card of reportCards) {
      expect(card.key).toBe(reportTemplateKey(card.reportSubtype!));
      expect(card.category).toBe('reports');
    }
  });

  it('storage keys round-trip through parseTemplateStorageKey', () => {
    expect(parseTemplateStorageKey(reportTemplateKey('malware'))).toEqual({
      docType: 'report',
      reportSubtype: 'malware',
    });
    expect(parseTemplateStorageKey('invoice')).toEqual({ docType: 'invoice' });
    for (const d of [...DOCUMENT_TYPES, LEGACY_REPORT_CARD]) {
      const parsed = parseTemplateStorageKey(d.key);
      expect(parsed.docType, `docType for ${d.key}`).toBe(d.type);
      expect(parsed.reportSubtype, `subtype for ${d.key}`).toBe(d.reportSubtype);
    }
  });

  it('gives every card a non-empty label and description', () => {
    for (const t of allTypes) {
      expect(DOC_TYPE_LABELS[t]?.length ?? 0, `label for ${t}`).toBeGreaterThan(0);
    }
    for (const d of [...DOCUMENT_TYPES, LEGACY_REPORT_CARD]) {
      expect(d.label.length, `label for ${d.key}`).toBeGreaterThan(0);
      expect(d.description.length, `description for ${d.key}`).toBeGreaterThan(0);
    }
  });
});
