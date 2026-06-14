import { describe, it, expect } from 'vitest';
import { DOCUMENT_TYPES, DOC_TYPE_LABELS } from './documentTypeMeta';
import { BUILT_IN_TEMPLATE_CONFIGS, type TemplateDocumentType } from '../../lib/pdf/templateConfig';

// Guards the "Office check-in receipt is missing" bug: the landing grid must
// surface EVERY engine document type, so none can silently drop off again.

const allTypes = Object.keys(BUILT_IN_TEMPLATE_CONFIGS) as TemplateDocumentType[];

describe('documentTypeMeta', () => {
  it('DOCUMENT_TYPES lists every engine document type', () => {
    const listed = new Set(DOCUMENT_TYPES.map((d) => d.type));
    for (const t of allTypes) {
      expect(listed.has(t), `${t} is missing from the documents grid`).toBe(true);
    }
    expect(DOCUMENT_TYPES.length).toBe(allTypes.length);
  });

  it('has no duplicate types in the grid', () => {
    const types = DOCUMENT_TYPES.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every type a non-empty label and description', () => {
    for (const t of allTypes) {
      expect(DOC_TYPE_LABELS[t]?.length ?? 0, `label for ${t}`).toBeGreaterThan(0);
    }
    for (const d of DOCUMENT_TYPES) {
      expect(d.description.length, `description for ${d.type}`).toBeGreaterThan(0);
    }
  });
});
