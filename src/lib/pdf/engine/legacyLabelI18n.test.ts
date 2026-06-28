import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATE_CONFIGS,
  resolveTemplateConfig,
  secondaryText,
  type TemplateDocumentType,
} from '../templateConfig';
import { buildPreviewEngineData } from './sampleData';

// The financial adapters emit labels as legacy `{ en, ar }` LabelText (no i18n
// map). After the secondaryText Arabic→key fallback, every such label must
// resolve into ANY of the 13 secondary languages — otherwise that label renders
// English-only in a bilingual document (the exact "only Arabic worked" bug).
const FINANCIAL: TemplateDocumentType[] = ['invoice', 'quote', 'payment_receipt'];
const SECONDARIES = ['fr', 'it', 'de'] as const;

interface LegacyLabel {
  en: string;
  ar: string;
}

function collect(node: unknown, out: LegacyLabel[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.en === 'string' && typeof obj.ar === 'string') {
    out.push({ en: obj.en, ar: obj.ar });
  }
  for (const v of Object.values(obj)) collect(v, out);
}

describe('legacy {en,ar} financial labels resolve to all secondary languages', () => {
  for (const docType of FINANCIAL) {
    it(`${docType}: every legacy label translates for fr/it/de`, () => {
      const builtIn = BUILT_IN_TEMPLATE_CONFIGS[docType];
      const config = resolveTemplateConfig(builtIn, undefined, {
        language: { mode: 'bilingual_stacked', secondary: 'fr', primary: 'en' },
      });
      const engineData = buildPreviewEngineData(docType, config);

      const labels: LegacyLabel[] = [];
      collect(engineData, labels);
      expect(labels.length).toBeGreaterThan(8); // sanity: labels were actually found

      const failures: string[] = [];
      for (const lang of SECONDARIES) {
        for (const { en, ar } of labels) {
          if (!secondaryText({ en, ar }, lang)) failures.push(`[${lang}] "${en}" (ar="${ar}")`);
        }
      }
      // Dedupe for a readable assertion message.
      expect([...new Set(failures)]).toEqual([]);
    });
  }
});
