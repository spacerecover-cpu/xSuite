// Lightweight CSV export utility. Used by list pages to export filtered
// rows for ad-hoc analysis, accountant handoff, and compliance reports.
//
// Why not papaparse or csv-stringify? We control the input shape and
// the escape rules below cover the CSV spec (RFC 4180). A dependency
// would add ~30 KB for ~25 lines of logic.

export interface ExportColumn<T> {
  /** Property key on the row, or a derive function for computed fields. */
  key: keyof T | ((row: T) => unknown);
  /** Column header label in the output CSV. */
  label: string;
  /** Optional value formatter — runs after the key extractor. */
  format?: (value: unknown, row: T) => string;
}

// Escape a single field. RFC 4180:
// - If the value contains comma, quote, or newline, wrap in quotes.
// - Embedded quotes inside a quoted field become "".
// - Numbers, booleans, null, undefined are coerced to string predictably.
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function extract<T>(row: T, col: ExportColumn<T>): unknown {
  return typeof col.key === 'function'
    ? col.key(row)
    : (row as Record<string, unknown>)[col.key as string];
}

/**
 * Build a CSV string from rows + columns. Returns the raw text — caller
 * decides what to do (download, copy to clipboard, send via API, …).
 */
export function rowsToCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.label)).join(',');
  const dataLines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = extract(row, col);
        const formatted = col.format ? col.format(raw, row) : raw;
        return escapeField(formatted);
      })
      .join(','),
  );
  // CRLF separators match Excel's default — opens cleanly on Windows
  // and macOS Excel without weird single-line behavior.
  return [header, ...dataLines].join('\r\n');
}

/**
 * Build and trigger a browser download of the CSV. Returns nothing —
 * fire and forget. Adds a UTF-8 BOM so Excel respects non-ASCII (Arabic,
 * accented characters, currency symbols) when the file opens.
 */
export function downloadCSV<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
): void {
  const csv = rowsToCSV(rows, columns);
  //  BOM. Without it, Excel mis-detects encoding for Arabic / €.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = filename.endsWith('.csv') ? filename : `${filename}-${stamp}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
