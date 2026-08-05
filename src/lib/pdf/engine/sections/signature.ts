/**
 * Signature section — signature lines, plus an optional company stamp and
 * signature image (Phase 3). Reuses `createSignatureBlock` and `buildLogoNode`.
 * Default (no signatureImages config / no images) returns the original single
 * columns block unchanged for parity.
 *
 * Phase 6: when `data.signatureBlocks` is populated, each captured signature
 * is embedded (drawn/uploaded image, typed text, or click_to_accept line) with
 * signer name/role/date beneath; unsigned slots fall back to wet-ink lines.
 * With NO `signatureBlocks`, output is byte-identical to before.
 */

import type { Content } from 'pdfmake/interfaces';
import { createSignatureBlock, PDF_COLORS } from '../../styles';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { resolvePresentation } from '../branding';
import type { ResolvedPresentation } from '../branding';
import { buildLogoNode, classifyLogo } from '../../brandingImage';
import type { EngineContext, EngineDocData, LabelText, SectionRenderer, SignatureBlockData } from '../types';

const DEFAULT_SIGNATURES: LabelText[] = [{ en: 'Authorized Signature', ar: 'التوقيع المعتمد' }];

/**
 * A premium signature block: dotted (or solid) rule with the English label
 * bold beneath and the secondary language under it in a muted tone —
 * center-aligned when the presentation asks for it (the reference finish).
 */
function premiumSignatureBlock(
  label: LabelText,
  engine: EngineContext,
  presentation: ResolvedPresentation,
): object {
  const { language } = engine.config;
  const bilingual = isBilingualMode(language);
  const secondary = bilingual ? ar(label, language) : null;
  const alignment = presentation.signatureAlign === 'center' ? ('center' as const) : ('left' as const);
  const dotted = presentation.signatureStyle === 'dotted';
  const lineWidth = 200;

  const labelLines: Content[] = [
    { text: en(label), bold: true, fontSize: 10, color: PDF_COLORS.text, alignment, margin: [0, 5, 0, 0] },
  ];
  if (secondary) {
    labelLines.push({ text: secondary, fontSize: 8.5, color: PDF_COLORS.textLight, alignment, margin: [0, 1, 0, 0] });
  }

  return {
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 26,
            x2: lineWidth,
            y2: 26,
            lineWidth: 0.9,
            lineColor: PDF_COLORS.textMuted,
            ...(dotted ? { dash: { length: 1.5, space: 2.2 } } : {}),
          },
        ],
      },
      ...labelLines,
    ],
    width: 220,
  };
}

/**
 * Vertical room above the rule of a slot with nothing captured, matching
 * `createSignatureBlock`'s wet-ink geometry so the two are interchangeable.
 */
const WET_INK_RULE_Y = 28;

/**
 * Builds a pdfmake stack for one captured (signed) SignatureBlockData entry:
 * - drawn/uploaded_image → embedded image via buildLogoNode
 * - typed → italicised typed-name text
 * - click_to_accept → "Accepted by <name>" line
 * All variants end with a thin rule, the signer label, and (if present) the
 * signedAt timestamp.
 *
 * An entry with NO captured content is the unsigned half of a partly-signed
 * handover — it is signed by hand on the printed page, so its rule keeps the
 * wet-ink block's writing room instead of sitting flush against the content
 * above it (pdfmake top-aligns columns, so a 2pt rule beside a signed block
 * would also float far above its counterpart).
 */
function capturedBlock(b: SignatureBlockData): object {
  const parts: object[] = [];
  if ((b.method === 'drawn' || b.method === 'uploaded_image') && b.imageDataUrl) {
    const node = buildLogoNode(b.imageDataUrl, { width: 120, alignment: 'left', margin: [0, 0, 0, 2] });
    if (node) parts.push(node as object);
  } else if (b.method === 'typed' && b.typedValue) {
    parts.push({ text: b.typedValue, italics: true, fontSize: 13, margin: [0, 6, 0, 2] });
  } else if (b.method === 'click_to_accept') {
    parts.push({ text: `Accepted${b.name ? ` by ${b.name}` : ''}`, fontSize: 9, margin: [0, 10, 0, 2] });
  }
  const ruleY = parts.length === 0 ? WET_INK_RULE_Y : 2;
  parts.push({ canvas: [{ type: 'line', x1: 0, y1: ruleY, x2: 160, y2: ruleY, lineWidth: 0.5, lineColor: PDF_COLORS.textLight }] });
  const roleLabel = b.role || b.slot;
  if (roleLabel) parts.push({ text: roleLabel, style: 'signatureLabel', margin: [0, 3, 0, 0] });
  if (b.name) parts.push({ text: b.name, fontSize: 8, color: PDF_COLORS.textLight, margin: [0, 1, 0, 0] });
  if (b.signedAt) parts.push({ text: b.signedAt, fontSize: 7, color: PDF_COLORS.textLight });
  return { stack: parts, width: 180 };
}

export const renderSignature: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const { language, signatureImages } = engine.config;

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

  // Phase 6: when captured signatureBlocks are present, embed them instead of
  // the default wet-ink lines. Company stamp/sig-image rendering is preserved.
  if (data.signatureBlocks && data.signatureBlocks.length > 0) {
    const capturedColumns: object[] = [];
    data.signatureBlocks.forEach((b, i) => {
      capturedColumns.push(capturedBlock(b));
      if (i < data.signatureBlocks!.length - 1) capturedColumns.push({ text: '', width: '*' });
    });
    if (!stampNode && !sigNode) {
      return { columns: capturedColumns, margin: [0, 24, 0, 8] } as Content;
    }
    const stack: Content[] = [];
    if (stampNode) stack.push(stampNode as Content);
    if (sigNode) stack.push(sigNode as Content);
    stack.push({ columns: capturedColumns, margin: [0, 4, 0, 8] } as Content);
    return { stack } as Content;
  }

  // Default: wet-ink signature lines (byte-identical to the pre-Phase-6 path).
  // With a configured `presentation` group the premium finish applies: dotted/
  // solid rules with centered bilingual labels, and the adapter's
  // "Registered by" line above — gated on the group so legacy output never
  // changes (unconfigured templates take the parity path below).
  const presentation = resolvePresentation(engine.config);
  const premium = engine.config.presentation !== undefined;
  const sigs = data.signatures && data.signatures.length > 0 ? data.signatures : DEFAULT_SIGNATURES;
  const blocks: object[] = premium
    ? sigs.map((label) => premiumSignatureBlock(label, engine, presentation))
    : sigs.map((label) => createSignatureBlock(resolveLabel(label, language)) as object);
  const columns: object[] = [];
  blocks.forEach((b, i) => {
    columns.push(b);
    if (i < blocks.length - 1) columns.push({ text: '', width: '*' });
  });

  const preparedByLine: Content | null =
    premium && data.preparedBy
      ? { text: data.preparedBy, fontSize: 8.5, color: PDF_COLORS.textMuted, alignment: 'right', margin: [0, 10, 0, 2] }
      : null;

  // Parity: with no images, return the original single block unchanged. The
  // premium block is unbreakable so a page break never strands the labels from
  // their rules.
  if (!stampNode && !sigNode) {
    const sigRow = {
      columns,
      margin: [0, preparedByLine ? 4 : premium ? 16 : 24, 0, 8],
      ...(premium ? { unbreakable: true } : {}),
    } as Content;
    return preparedByLine
      ? ({ stack: [preparedByLine, sigRow], unbreakable: true } as Content)
      : sigRow;
  }

  const stack: Content[] = [];
  if (preparedByLine) stack.push(preparedByLine);
  if (stampNode) stack.push(stampNode as Content);
  if (sigNode) stack.push(sigNode as Content);
  stack.push({ columns, margin: [0, 4, 0, 8] } as Content);
  return { stack } as Content;
};
