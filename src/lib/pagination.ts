/**
 * Numeric-pager window: first, last, current ±1, with 'gap' markers where
 * pages are elided. A gap of exactly one page renders the page itself
 * (1 [2] 3 beats 1 … 3). Pure — unit-tested in pagination.test.ts.
 */
export function pageWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const wanted = new Set<number>([1, total]);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= total) wanted.add(p);
  }

  const pages = [...wanted].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  let prev = 0;
  for (const p of pages) {
    if (prev !== 0) {
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push('gap');
    }
    out.push(p);
    prev = p;
  }
  return out;
}
