/**
 * Signature section — signature lines, plus an optional company stamp and
 * signature image (Phase 3). Reuses `createSignatureBlock` and `buildLogoNode`.
 * Default (no signatureImages config / no images) returns the original single
 * columns block unchanged for parity.
 */

import type { Content } from 'pdfmake/interfaces';
import { createSignatureBlock } from '../../styles';
import { resolveLabel } from '../labels';
import { buildLogoNode, classifyLogo } from '../../brandingImage';
import type { EngineContext, EngineDocData, LabelText, SectionRenderer } from '../types';

const DEFAULT_SIGNATURES: LabelText[] = [{ en: 'Authorized Signature', ar: 'التوقيع المعتمد' }];

export const renderSignature: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const sigs = data.signatures && data.signatures.length > 0 ? data.signatures : DEFAULT_SIGNATURES;
  const { language, signatureImages } = engine.config;

  const blocks: object[] = sigs.map(
    (label) => createSignatureBlock(resolveLabel(label, language)) as object,
  );
  const columns: object[] = [];
  blocks.forEach((b, i) => {
    columns.push(b);
    if (i < blocks.length - 1) columns.push({ text: '', width: '*' });
  });

  const stamp = signatureImages?.stamp;
  const sig = signatureImages?.signature;
  const stampNode =
    stamp?.show && classifyLogo(engine.stampImage).kind !== 'none'
      ? buildLogoNode(engine.stampImage, {
          width: stamp.width ?? 110,
          alignment: stamp.placement ?? 'right',
          opacity: stamp.opacity,
          margin: [0, 0, 0, 4],
        })
      : null;
  const sigNode =
    sig?.show && classifyLogo(engine.signatureImage).kind !== 'none'
      ? buildLogoNode(engine.signatureImage, { width: sig.width ?? 140, alignment: sig.placement ?? 'left', margin: [0, 0, 0, 2] })
      : null;

  // Parity: with no images, return the original single block unchanged.
  if (!stampNode && !sigNode) {
    return { columns, margin: [0, 24, 0, 8] } as Content;
  }

  const stack: Content[] = [];
  if (stampNode) stack.push(stampNode as Content);
  if (sigNode) stack.push(sigNode as Content);
  stack.push({ columns, margin: [0, 4, 0, 8] } as Content);
  return { stack } as Content;
};
