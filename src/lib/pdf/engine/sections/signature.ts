/**
 * Signature section — one or more signature lines laid out in a row. Reuses
 * `createSignatureBlock` from `styles.ts`. Labels come from
 * {@link EngineDocData.signatures}, resolved through the language mode.
 */

import type { Content } from 'pdfmake/interfaces';
import { createSignatureBlock } from '../../styles';
import { resolveLabel } from '../labels';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';

export const renderSignature: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const sigs = data.signatures;
  if (!sigs || sigs.length === 0) return null;

  const { language } = engine.config;
  const blocks: object[] = sigs.map(
    (label) => createSignatureBlock(resolveLabel(label, language)) as object,
  );

  // Spread the blocks across the row with star spacers between them.
  const columns: object[] = [];
  blocks.forEach((b, i) => {
    columns.push(b);
    if (i < blocks.length - 1) columns.push({ text: '', width: '*' });
  });

  return { columns, margin: [0, 24, 0, 8] } as Content;
};
