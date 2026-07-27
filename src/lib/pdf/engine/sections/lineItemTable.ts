/**
 * Line-item table section — columns are driven entirely by config
 * (`visible` / `label` / `width` / `order`) resolved into
 * {@link EngineDocData.lineItems.columns}.
 *
 * Generalized from the `lineItemsSection` in `documents/InvoiceDocument.ts`
 * (lines ~169-220). The assembler/adapter is responsible for resolving the
 * config columns into {@link ResolvedColumn}s and stringifying each cell; this
 * renderer only lays out the header + body and applies per-column alignment.
 *
 * This module is also the HOME of the shared data-table primitives (preview row
 * cap, width normalization, long-token soft wrapping) that `devices.ts` and
 * `custodyLog.ts` import — the line-item table is the reference data table, and
 * keeping one implementation here means the three tables cannot drift apart.
 * One deliberate exception: `custodyLog.ts` takes the wrapping + width helpers
 * but NOT {@link capRows}, because a forensic ledger must render every row.
 */

import type { Content, TableCell } from 'pdfmake/interfaces';
import { PDF_COLORS, createBilingualSectionHeader } from '../../styles';
import type {
  EngineContext,
  EngineDocData,
  LabelText,
  ResolvedColumn,
  SectionRenderer,
} from '../types';
import { isBilingualMode, en, ar, resolveLabel } from '../labels';
import { engineDefaultFont, engineLayoutDirection, mirrorColumns } from '../rtl';
import { resolveTable, resolveSectionFill, resolvePresentation } from '../branding';
import { readableTextOn } from '../palette';
import { contentWidth } from '../pageGeometry';

// ---------------------------------------------------------------------------
// Shared data-table primitives (imported by devices.ts / custodyLog.ts)
// ---------------------------------------------------------------------------

/**
 * Soft cap on the number of DATA rows a PREVIEW renders (QA TBL-08).
 *
 * TBL-08 is a *preview* problem: `previewTemplate` / `previewDocumentForRecord`
 * enforce a 15s `PREVIEW_TIMEOUT_MS`, so a pathological collection blows the
 * timeout and surfaces only the generic "Could not render the preview" —
 * indistinguishable from a config error (STU-05).
 *
 * It is therefore a PREVIEW-ONLY cap, and it is opt-in: the value reaches the
 * renderers through {@link EngineContext.maxTableRows}, which ONLY the two
 * preview entry points set. `pdfService`, `reportPDFService` and
 * `send-document-email` share these renderers and pass nothing, so a GENERATED
 * or EMAILED document always renders every row. That distinction is not
 * cosmetic: a capped invoice would print fewer lines than its totals block sums
 * (the adapter derives totals from the full row set), and a capped
 * chain-of-custody report would be an incomplete forensic record while its legal
 * notice still asserts the ledger is whole (CLAUDE.md: never break
 * `chain_of_custody`). `renderCustodyLog` additionally ignores the cap outright
 * — completeness IS that document.
 *
 * 500 is far above anything an ordinary document carries (invoices and device
 * tables are 1–50 rows) and is already ~10 pages of unbroken table.
 */
export const PREVIEW_MAX_TABLE_ROWS = 500;

/**
 * Take at most `engine.maxTableRows` rows, reporting what was left behind.
 *
 * No cap on the context (the generation path) — or a non-positive/non-finite one
 * — means UNCAPPED: every row renders.
 */
export function capRows<T>(
  rows: T[],
  engine: EngineContext,
): { visible: T[]; total: number; truncated: boolean } {
  const max = engine.maxTableRows;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0 || rows.length <= max) {
    return { visible: rows, total: rows.length, truncated: false };
  }
  return { visible: rows.slice(0, max), total: rows.length, truncated: true };
}

/** A full-width table row carrying one centred message (used for empty + capped states). */
function spanningRow(text: string, columnCount: number): TableCell[] {
  const first: TableCell = {
    text,
    style: 'tableCell',
    alignment: 'center',
    italics: true,
    color: PDF_COLORS.textLight,
    colSpan: columnCount,
  };
  // pdfmake requires the spanned slots to exist as empty cells.
  return [first, ...Array.from({ length: Math.max(0, columnCount - 1) }, () => ({}) as TableCell)];
}

/**
 * "Preview only — showing first N of M rows…" continuation row for a capped
 * table (TBL-08).
 *
 * The copy names the PREVIEW explicitly (the cap is unreachable on the
 * generation path) and states that the totals still cover every row, so a reader
 * of a downloaded preview can never mistake the shortened table for the billed
 * set.
 */
export function continuationRow(
  shown: number,
  total: number,
  columnCount: number,
  language: EngineContext['config']['language'],
): TableCell[] {
  const label: LabelText = {
    en: `Preview only — showing the first ${shown} of ${total} rows; the remaining ${total - shown} are omitted from this preview. Totals reflect all ${total} rows. The generated document renders every row.`,
    ar: `معاينة فقط — عرض أول ${shown} من ${total} صف؛ تم حذف ${total - shown} من هذه المعاينة. تشمل الإجماليات جميع الصفوف البالغ عددها ${total}. يعرض المستند النهائي جميع الصفوف.`,
  };
  return spanningRow(resolveLabel(label, language), columnCount);
}

/** Explicit "nothing here" row so an empty table never reads as a render failure. */
function emptyStateRow(
  label: LabelText,
  columnCount: number,
  language: EngineContext['config']['language'],
): TableCell[] {
  return spanningRow(resolveLabel(label, language), columnCount);
}

/** Floor reserved for each star ('*') column so it can still absorb content. */
const STAR_MIN_WIDTH = 40;
/** Floor a normalized fixed column is never scaled below. */
const FIXED_MIN_WIDTH = 12;
/** Content width assumed when a config carries no usable paper block (A4 @ 40pt). */
const FALLBACK_CONTENT_WIDTH = 515;

/**
 * The printable width available to a top-level table in this template, derived
 * from the real page box + margins rather than the old hardcoded A4 assumption.
 */
export function tableContentWidth(engine: EngineContext): number {
  const paper = engine.config?.paper;
  if (!paper || !Array.isArray(paper.margins) || paper.margins.length !== 4) {
    return FALLBACK_CONTENT_WIDTH;
  }
  return contentWidth(paper);
}

/**
 * Normalize tenant-configured column widths against the printable width (QA
 * TBL-07).
 *
 * Widths are tenant-configurable and nothing used to check that the FIXED ones
 * sum to less than the content width — so a wide column set (easier to hit at
 * narrow margins, on a custom/label sheet, or with the extra 24pt S/N column)
 * overflowed the right margin and clipped. When the fixed widths already fit,
 * this is the IDENTITY — an unconfigured template is byte-identical.
 *
 * The budget subtracts pdfmake's per-column cell padding + vertical borders and
 * reserves {@link STAR_MIN_WIDTH} for each star column, so a normalized table
 * still leaves the star columns something to absorb.
 */
export function normalizeColumnWidths(
  widths: (number | string)[],
  available: number,
  paddingPerColumn: number,
): (number | string)[] {
  const count = widths.length;
  if (count === 0) return widths;
  const fixedTotal = widths.reduce<number>((sum, w) => sum + (typeof w === 'number' ? w : 0), 0);
  if (fixedTotal <= 0) return widths;
  const stars = widths.filter((w) => typeof w !== 'number').length;
  const overhead = count * paddingPerColumn + (count + 1) * 0.5;
  const budget = available - overhead - stars * STAR_MIN_WIDTH;
  if (fixedTotal <= budget) return widths;
  const target = Math.max(budget, FIXED_MIN_WIDTH * (count - stars));
  const scale = target / fixedTotal;
  return widths.map((w) =>
    typeof w === 'number' ? Math.max(FIXED_MIN_WIDTH, Math.floor(w * scale)) : w,
  );
}

/** U+200B, built from its code point so the source never carries an invisible character. */
export const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/**
 * Minimum token length considered for soft wrapping. The ATA/SATA IDENTIFY
 * DEVICE serial field is 20 ASCII characters, so 28 leaves headroom for
 * prefixed/composite serials while still catching hashes and long URLs.
 */
const SOFT_WRAP_MIN_TOKEN = 28;
/** Break opportunity inserted at most every N characters inside a long token. */
const SOFT_WRAP_CHUNK = 20;
/** Printable-ASCII only — see {@link softWrapLongTokens} for why. */
const ASCII_ONLY_RE = /^[\x20-\x7E]+$/;
/** Characters that ALREADY offer a UAX #14 break opportunity after them. */
const EXISTING_BREAK_RE = /[-/]/;

/**
 * Font families VERIFIED (via fontkit against the bundled .ttf files) to carry a
 * real, zero-advance U+200B glyph.
 *
 * `Tajawal` — the Arabic family every non-English document resolves to — does
 * NOT: U+200B falls through to `.notdef`, a 0.24em VISIBLE box outline. Soft
 * wrapping is therefore disabled on those documents rather than printing boxes
 * through every long serial. (`Courier` is mapped to the Roboto faces in
 * `fonts.ts`, so it inherits Roboto's glyph.)
 */
const ZWSP_SAFE_FONTS = new Set(['Roboto', 'Courier', 'NotoSansArabic', 'NotoSansThai']);

/** The document's default font, resolved exactly as `renderTemplate` does. */
function documentBaseFont(engine: EngineContext): string {
  const language = engine.config.language;
  const rtlFont = engineDefaultFont(language, engine.ctx?.fontFamily || 'Roboto');
  return language.mode !== 'en' ? rtlFont : (engine.config.typography?.fontFamily ?? rtlFont);
}

/** Whether this document's font can carry an invisible U+200B break opportunity. */
export function softWrapEnabled(engine: EngineContext): boolean {
  return ZWSP_SAFE_FONTS.has(documentBaseFont(engine));
}

function wrapToken(token: string): string {
  if (token.length <= SOFT_WRAP_MIN_TOKEN) return token;
  // Non-ASCII is left strictly alone: a U+200B inside Arabic breaks the cursive
  // join, and CJK/Thai already break per UAX #14.
  if (!ASCII_ONLY_RE.test(token)) return token;
  let out = '';
  let sinceBreak = 0;
  for (const ch of token) {
    if (sinceBreak >= SOFT_WRAP_CHUNK) {
      out += ZERO_WIDTH_SPACE;
      sinceBreak = 0;
    }
    out += ch;
    sinceBreak = EXISTING_BREAK_RE.test(ch) ? 0 : sinceBreak + 1;
  }
  return out;
}

/**
 * Insert soft break opportunities into long unbroken ASCII tokens (QA TBL-09).
 *
 * pdfmake runs the UAX #14 line breaker, so whitespace, hyphens and slashes
 * already break — but a long alphanumeric run (a hash, a serial with no
 * separators, a query-string URL) has NO break opportunity and overflows its
 * column, overlapping the neighbouring cell. A U+200B gives the breaker
 * somewhere to go.
 *
 * ── COPY/PASTE CAVEAT (unavoidable with this approach) ──────────────────────
 * A PDF has no notion of a "soft" break: the U+200B is a real character in the
 * content stream, so text extracted or copied out of a wrapped token contains
 * it. Two things keep the blast radius small: tokens up to
 * {@link SOFT_WRAP_MIN_TOKEN} characters are never touched, and
 * {@link COPY_EXACT_COLUMN_KEYS} excludes the columns whose exactness is
 * load-bearing. Any token longer than the threshold in any OTHER column will
 * paste with invisible U+200Bs.
 */
export function softWrapLongTokens(text: string): string {
  if (!text || text.length <= SOFT_WRAP_MIN_TOKEN) return text;
  return text
    .split(/(\s+)/)
    .map((segment) => (/^\s*$/.test(segment) ? segment : wrapToken(segment)))
    .join('');
}

/**
 * Column keys whose cell value must stay COPY-EXACT, and therefore never
 * receives soft break opportunities (TBL-09). The carve-out is keyed on the
 * COLUMN, not the section, so every data table honours it — the identifier is
 * what matters, not which table it happens to sit in.
 *
 * Reachable today:
 * - `serial` — the device serial on the intake receipt, customer copy and
 *   checkout form (`receiptAdapter` / `checkoutAdapter`). This is the string
 *   that ties a physical drive to its custody chain; a customer, insurer or
 *   court copies it out of the PDF, and a U+200B makes the extracted text differ
 *   from `case_devices.serial_number` — a mismatch nothing surfaces.
 * - `itemCode` — the statutory HSN/SAC code on a tax invoice (opt-in column in
 *   `templateConfig`).
 *
 * Defensive, not currently reachable: `hash` / `signature`. Those values live in
 * the dedicated `hashVerification` / `digitalSignatures` sections, which do not
 * soft-wrap at all, and the custody-log adapter drops any configured column it
 * has no data for — so no hash/signature cell reaches a wrapper today. They stay
 * listed so the rule survives a future column being added.
 *
 * For these columns an overflowing column is the lesser defect: the value stays
 * verifiable.
 */
export const COPY_EXACT_COLUMN_KEYS = new Set(['serial', 'itemCode', 'hash', 'signature']);

/**
 * The per-cell soft-wrap function for this document: identity when the font
 * cannot carry a U+200B ({@link softWrapEnabled}) or when the column is
 * copy-exact ({@link COPY_EXACT_COLUMN_KEYS}).
 */
export function cellSoftWrapper(engine: EngineContext): (columnKey: string, value: string) => string {
  const enabled = softWrapEnabled(engine);
  return (columnKey, value) =>
    enabled && !COPY_EXACT_COLUMN_KEYS.has(columnKey) ? softWrapLongTokens(value) : value;
}

/** Column alignment — one rule, used for BOTH the header and the body cells. */
function columnAlignment(col: ResolvedColumn): 'left' | 'center' | 'right' {
  return col.align ?? 'left';
}

/** The pdfmake cell style matching a column alignment. */
function alignedCellStyle(align: 'left' | 'center' | 'right'): string {
  return align === 'right' ? 'tableCellRight' : align === 'center' ? 'tableCellCenter' : 'tableCell';
}

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

/** Empty-state copy for a document whose line-item collection is empty. */
const NO_LINE_ITEMS: LabelText = { en: 'No items', ar: 'لا توجد بنود' };

export const renderLineItems: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => {
  const li = data.lineItems;
  if (!li) return null;

  const { language } = engine.config;
  const direction = engineLayoutDirection(language);
  // Under RTL, mirror the column order (reverse) and swap each column's
  // left/right alignment so the table reads right-to-left. `mirrorColumns`
  // returns the input unchanged for LTR, so English-only output is untouched.
  const columns = mirrorColumns(li.columns.filter((c) => c.visible), direction);
  if (columns.length === 0) return null;

  const bilingual = isBilingualMode(language);

  // Section heading ("Line Items"), bilingual when the mode asks for it.
  const headingLabel = engine.config.labels.lineItems ?? { en: 'Line Items', ar: 'البنود' };
  const heading = createBilingualSectionHeader(
    en(headingLabel, 'Line Items'),
    bilingual ? ar(headingLabel, language) : null,
  ) as Content;

  // Table styling. `headerBackground` defaults to the legacy `PDF_COLORS.headerBg`,
  // so an unconfigured table is unchanged; S/N + zebra are opt-in.
  const tableStyle = resolveTable(engine.config);
  // Premium light finish: white header with dark bold labels + hairline grid.
  const light = resolvePresentation(engine.config).tableHeaderStyle === 'light';
  // Per-section header fill (sections-list override → global → the table default),
  // with auto-contrast text so any custom/dark fill keeps the labels readable.
  const headerFill = light
    ? PDF_COLORS.white
    : resolveSectionFill(engine.config, 'lineItems', tableStyle.headerBackground);
  const headerText = light ? PDF_COLORS.text : readableTextOn(headerFill);

  // Header row: one cell per visible column, label resolved by language mode.
  const headerRow: TableCell[] = columns.map((col) => ({
    text: resolveLabel(col.label, language),
    style: 'tableHeader',
    fillColor: headerFill,
    color: headerText,
    alignment: columnAlignment(col),
    ...(light ? { fontSize: 8.5 } : {}),
  }));

  const body: TableCell[][] = [headerRow];

  // Long unbroken tokens get soft break opportunities so they wrap inside their
  // column instead of overlapping the neighbouring cell (TBL-09) — except the
  // copy-exact identifier columns (see COPY_EXACT_COLUMN_KEYS).
  const wrap = cellSoftWrapper(engine);
  // PREVIEW-ONLY row cap so a pathological collection cannot trip the 15s
  // preview timeout. Generation passes no cap, so a delivered invoice always
  // renders every line it is billed for.
  const { visible: dataRows, total, truncated } = capRows(li.rows, engine);

  for (const row of dataRows) {
    body.push(
      columns.map((col): TableCell => {
        const raw = row[col.key];
        const text = raw === undefined || raw === null ? '' : wrap(col.key, String(raw));
        const align = columnAlignment(col);
        return { text, style: alignedCellStyle(align) };
      }),
    );
  }

  // Column widths: explicit point widths where given, else star-sized so the
  // table fits the printable width regardless of how many columns are visible.
  const widths: (number | string)[] = columns.map((col) => (col.width !== undefined ? col.width : '*'));

  // Opt-in S/N row-number column: a narrow serial column added to the header and
  // each body row. It must land FIRST IN READING ORDER — the array head under
  // LTR, but the array TAIL under RTL, because the columns were already mirrored
  // above. Prepending unconditionally (the old behaviour) pushed the serial to
  // the far left of an Arabic table, i.e. last in reading order (TBL-05).
  if (tableStyle.rowNumbering) {
    const serialHeader: TableCell = {
      text: '#',
      style: 'tableHeader',
      fillColor: headerFill,
      color: headerText,
      alignment: 'center',
    };
    if (direction === 'rtl') {
      headerRow.push(serialHeader);
      for (let r = 1; r < body.length; r++) body[r].push({ text: String(r), style: 'tableCellCenter' });
      widths.push(24);
    } else {
      headerRow.unshift(serialHeader);
      for (let r = 1; r < body.length; r++) body[r].unshift({ text: String(r), style: 'tableCellCenter' });
      widths.unshift(24);
    }
  }

  // An empty collection used to render the heading plus a header-only table,
  // which reads as a rendering failure. An explicit row is preferred over
  // dropping the section: on a financial document the totals still print, so a
  // MISSING line-item block leaves the reader unable to tell "nothing was
  // billed" from "the table failed to render" (TBL-06).
  if (dataRows.length === 0) {
    body.push(emptyStateRow(NO_LINE_ITEMS, widths.length, language));
  } else if (truncated) {
    body.push(continuationRow(dataRows.length, total, widths.length, language));
  }

  // Opt-in zebra striping: body rows alternate a light fill. Header cells set
  // their own fill, so the layout fill only paints body rows. The light finish
  // separates the header with a slightly stronger rule + roomier padding.
  const layout = {
    hLineWidth: light
      ? (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 0.75 : 0.5
      : () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => PDF_COLORS.border,
    vLineColor: () => PDF_COLORS.border,
    ...(light
      ? { paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 }
      : {}),
    ...(tableStyle.zebra
      ? { fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? PDF_COLORS.background : null) }
      : {}),
  };

  return {
    stack: [
      heading,
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: normalizeColumnWidths(widths, tableContentWidth(engine), light ? 12 : 8),
          body,
        },
        layout,
        margin: [0, 0, 0, 8],
      },
    ],
  };
};
